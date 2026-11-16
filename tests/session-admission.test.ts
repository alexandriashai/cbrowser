/**
 * Session cap, per-account share, tokenless reuse and auth-cache sweep on the
 * hosted server (audit auth-tenancy-billing-3, leaks-live-1, leaks-static-3,
 * leaks-static-8; 2026-11-12).
 *
 * Before: a tool call without _browserToken created a CBrowser and a session
 * with no check at all, the only cap (20) guarded getSessionBrowser alone, and
 * nothing limited one account. One free account opened 46 browsers in two
 * requests on a scratch server, and with more than 20 alive every other
 * account's getSessionBrowser path was refused.
 *
 * No browser is launched here: sessions only construct CBrowser objects, so
 * the counts below are of sessions handed out within the launch grace. The
 * real-browser half (memory limit, force-kill) is session-process-tree.test.ts.
 *
 * The session table is one per process and the gate runs every file in one
 * process, so each test sets its caps relative to what is already open.
 */
import { describe, test, expect, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

const ROOT = mkdtempSync(join(tmpdir(), "cb-session-admission-"));
process.env.CBROWSER_DATA_DIR = join(ROOT, "legacy");
process.env.CBROWSER_MIRROR_ROOT = join(ROOT, "mirror");

const { withPersonaScope } = await import("../src/persona-scope.js");
const { withRequestIdentity } = await import("../src/request-context.js");
const remote = await import("../src/mcp-server-remote.js");
const {
  getBrowserByToken, getSessionBrowser, getTokenlessBrowser, openSessionCount, sessionBucket,
  SessionCapacityError, AccountSessionLimitError, BrowserSessionExpiredError, ANONYMOUS_BUCKET,
  sweepSessions, sweepAuthCaches, _authCachesForTest, MAX_AUTH_CACHE_ENTRIES, resolveRequestAccountId,
} = remote;
const tree = await import("../src/browser-process-tree.js");

const ENV_KEYS = [
  "MAX_CONCURRENT_SESSIONS", "MAX_SESSIONS_PER_ACCOUNT", "MAX_SESSIONS_ANONYMOUS",
  "SESSION_LAUNCH_GRACE_MS", "SESSION_IDLE_TIMEOUT_MS", "CMS_URL",
];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
});

let nextAccount = 9100;
const freshAccount = () => ++nextAccount;
const asAccount = <T>(id: number, fn: () => T) => withPersonaScope(id, fn);
const asKey = <T>(apiKey: string | undefined, fn: () => T) => withRequestIdentity({ keyHash: null, tier: null, apiKey }, fn);

describe("the server cap applies to tokenless calls", () => {
  test("past MAX_CONCURRENT_SESSIONS a tokenless call is refused with the capacity message", async () => {
    process.env.MAX_SESSIONS_PER_ACCOUNT = "1000";
    process.env.MAX_CONCURRENT_SESSIONS = String(openSessionCount() + 2);
    const acct = freshAccount();
    const a = await asAccount(acct, () => getBrowserByToken());
    const b = await asAccount(acct, () => getBrowserByToken());
    expect(a.token).not.toBe(b.token);
    const refused = asAccount(acct, () => getBrowserByToken());
    await expect(refused).rejects.toBeInstanceOf(SessionCapacityError);
    await expect(asAccount(acct, () => getBrowserByToken())).rejects.toThrow(/The server is at capacity, try again shortly/);
  });

  test("the cap counts both paths: tokens and session ids share one pool", async () => {
    process.env.MAX_SESSIONS_PER_ACCOUNT = "1000";
    process.env.MAX_CONCURRENT_SESSIONS = String(openSessionCount() + 2);
    const acct = freshAccount();
    await asAccount(acct, () => getBrowserByToken());
    const s = await asAccount(acct, () => getSessionBrowser(`pool-${acct}`));
    await expect(asAccount(acct, () => getSessionBrowser(`pool-${acct}-2`))).rejects.toBeInstanceOf(SessionCapacityError);
    await expect(asAccount(acct, () => getBrowserByToken())).rejects.toBeInstanceOf(SessionCapacityError);
    // Reusing a session that exists is not a new one.
    expect(await asAccount(acct, () => getSessionBrowser(`pool-${acct}`))).toBe(s);
  });

  test("a batch of calls in one tick cannot all pass the check before any is counted", async () => {
    process.env.MAX_SESSIONS_PER_ACCOUNT = "1000";
    process.env.MAX_CONCURRENT_SESSIONS = String(openSessionCount() + 3);
    const acct = freshAccount();
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => asAccount(acct, () => getBrowserByToken())));
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(3);
    expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason instanceof SessionCapacityError)).toBe(true);
  });
});

describe("one account's share", () => {
  test("the fourth browser of one account is refused, naming how many are open and how to free one", async () => {
    process.env.MAX_CONCURRENT_SESSIONS = "100000";
    process.env.MAX_SESSIONS_PER_ACCOUNT = "3";
    const acct = freshAccount();
    for (let i = 0; i < 3; i++) await asAccount(acct, () => getBrowserByToken());
    let err: unknown;
    try { await asAccount(acct, () => getBrowserByToken()); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(AccountSessionLimitError);
    const msg = (err as Error).message;
    expect(msg).toContain("This account already has 3 browser sessions open");
    expect(msg).toContain("(3)");
    expect(msg).toContain("_browserToken");
    expect(msg).toMatch(/closes after 300 s without use/);
    // Another account is not affected by the first one's share.
    const other = freshAccount();
    expect((await asAccount(other, () => getBrowserByToken())).token).toMatch(/^cb_[0-9a-f]{16}$/);
  });

  test("the account's own tokenless browser counts in its share", async () => {
    process.env.MAX_CONCURRENT_SESSIONS = "100000";
    process.env.MAX_SESSIONS_PER_ACCOUNT = "2";
    const acct = freshAccount();
    const own = await asAccount(acct, () => getTokenlessBrowser());
    await asAccount(acct, () => getBrowserByToken());
    await expect(asAccount(acct, () => getBrowserByToken())).rejects.toBeInstanceOf(AccountSessionLimitError);
    // Reuse is not a new session.
    expect(await asAccount(acct, () => getTokenlessBrowser())).toBe(own);
  });

  test("a session that never launched stops counting after the launch grace", async () => {
    process.env.MAX_CONCURRENT_SESSIONS = "100000";
    process.env.MAX_SESSIONS_PER_ACCOUNT = "2";
    process.env.SESSION_LAUNCH_GRACE_MS = "1";
    const acct = freshAccount();
    await asAccount(acct, () => getBrowserByToken());
    await asAccount(acct, () => getBrowserByToken());
    await new Promise((r) => setTimeout(r, 10));
    // Neither launched a browser (the call that would have failed first), so
    // neither holds anything and the account is not locked out by them.
    expect((await asAccount(acct, () => getBrowserByToken())).token).toMatch(/^cb_/);
  });
});

describe("a lapsed session is admitted again before it is used (challenger review 2026-11-16)", () => {
  test("tokens minted past the grace cannot all be resumed: the share holds", async () => {
    process.env.MAX_CONCURRENT_SESSIONS = "100000";
    process.env.MAX_SESSIONS_PER_ACCOUNT = "3";
    process.env.SESSION_LAUNCH_GRACE_MS = "30";
    const acct = freshAccount();
    const tokens: string[] = [];
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 3; i++) tokens.push((await asAccount(acct, () => getBrowserByToken())).token);
      await new Promise((r) => setTimeout(r, 60)); // past the grace: these stop counting
    }
    expect(tokens.length).toBe(9);
    let resumed = 0;
    let refused = 0;
    for (const t of tokens) {
      try { await asAccount(acct, () => getBrowserByToken(t)); resumed++; }
      catch (e) { if (e instanceof AccountSessionLimitError) refused++; else throw e; }
    }
    expect(resumed).toBe(3);
    expect(refused).toBe(6);
    expect(openSessionCount(Date.now(), `account:${acct}`)).toBe(3);
  });

  test("a session still within the grace resumes without a new check", async () => {
    process.env.MAX_CONCURRENT_SESSIONS = "100000";
    process.env.MAX_SESSIONS_PER_ACCOUNT = "1";
    process.env.SESSION_LAUNCH_GRACE_MS = "60000";
    const acct = freshAccount();
    const { token } = await asAccount(acct, () => getBrowserByToken());
    // At its share (1 of 1): a fresh session is refused, the open one resumes.
    await expect(asAccount(acct, () => getBrowserByToken())).rejects.toBeInstanceOf(AccountSessionLimitError);
    expect((await asAccount(acct, () => getBrowserByToken(token))).token).toBe(token);
  });

  test("the session-id path is checked the same way", async () => {
    process.env.MAX_CONCURRENT_SESSIONS = "100000";
    process.env.MAX_SESSIONS_PER_ACCOUNT = "1";
    process.env.SESSION_LAUNCH_GRACE_MS = "30";
    const acct = freshAccount();
    const a = `sid-a-${acct}`;
    const b = `sid-b-${acct}`;
    await asAccount(acct, () => getSessionBrowser(a));
    await new Promise((r) => setTimeout(r, 60));
    await asAccount(acct, () => getSessionBrowser(b)); // admitted: a no longer counts
    await expect(asAccount(acct, () => getSessionBrowser(a))).rejects.toBeInstanceOf(AccountSessionLimitError);
  });
});

describe("session browsers are the session's to count (launch-gate.ts)", () => {
  test("a browser from a token or a session id is marked, so the tool-browser gate leaves it alone", async () => {
    process.env.MAX_CONCURRENT_SESSIONS = "100000";
    process.env.MAX_SESSIONS_PER_ACCOUNT = "10";
    const { isSessionBrowser } = await import("../src/launch-gate.js");
    const acct = freshAccount();
    const { browser } = await asAccount(acct, () => getBrowserByToken());
    expect(isSessionBrowser(browser)).toBe(true);
    expect(isSessionBrowser(await asAccount(acct, () => getSessionBrowser(`sid-mark-${acct}`)))).toBe(true);
  });
});

describe("callers without an account", () => {
  test("bucket: account, credential, keyless, or none outside a request", () => {
    expect(sessionBucket()).toBeUndefined();
    expect(asAccount(77, () => sessionBucket())).toBe("account:77");
    expect(asKey(undefined, () => sessionBucket())).toBe(ANONYMOUS_BUCKET);
    const k1 = asKey("operator-key-one", () => sessionBucket());
    const k2 = asKey("operator-key-two", () => sessionBucket());
    expect(k1).toMatch(/^key:[0-9a-f]{16}$/);
    expect(k1).not.toBe(k2);
    expect(k1).not.toContain("operator-key-one");
  });

  test("keyless callers share one small bucket", async () => {
    process.env.MAX_CONCURRENT_SESSIONS = "100000";
    const base = openSessionCount(Date.now(), ANONYMOUS_BUCKET);
    process.env.MAX_SESSIONS_ANONYMOUS = String(base + 2);
    await asKey(undefined, () => getBrowserByToken());
    await asKey(undefined, () => getBrowserByToken());
    await expect(asKey(undefined, () => getBrowserByToken())).rejects.toThrow(
      new RegExp(`Callers without an account already have ${base + 2} browser sessions open`),
    );
    // A credential is its own bucket, not the keyless one.
    expect((await asKey("some-credential", () => getBrowserByToken())).token).toMatch(/^cb_/);
  });

  test("a tokenless caller without an account gets one browser per credential, not the legacy shared one", async () => {
    process.env.MAX_CONCURRENT_SESSIONS = "100000";
    process.env.MAX_SESSIONS_PER_ACCOUNT = "1000";
    const legacy = await getTokenlessBrowser();
    const k1a = await asKey("cred-one", () => getTokenlessBrowser());
    const k1b = await asKey("cred-one", () => getTokenlessBrowser());
    const k2 = await asKey("cred-two", () => getTokenlessBrowser());
    expect(k1a).toBe(k1b);
    expect(k1a).not.toBe(k2);
    expect(k1a).not.toBe(legacy);
    expect(k2).not.toBe(legacy);
  });
});

describe("every hosted path that creates a browser", () => {
  test("a stateless request with no session id from its client gets no tool session id", () => {
    const { toolSessionIdFor } = remote;
    expect(toolSessionIdFor("stateless", "generated", "gen-1")).toBeUndefined();
    expect(toolSessionIdFor("stateless", "client-new", "client-1")).toBe("client-1");
    expect(toolSessionIdFor("stateless", "reused", "client-2")).toBe("client-2");
    expect(toolSessionIdFor("stateful", "generated", "gen-2")).toBe("gen-2");
  });

  test("the refusal reaches the caller as a tool error, not a crash", async () => {
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const { registerNavigationTools } = await import("../src/mcp-tools/base/navigation-tools.js");
    const server = new McpServer({ name: "t", version: "1" });
    registerNavigationTools(server, { getBrowser: getTokenlessBrowser, getBrowserByToken });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "t", version: "1" });
    await Promise.all([server.connect(st), client.connect(ct)]);
    // Fill to the cap if nothing is open, so the next tokenless call is refused.
    if (openSessionCount() < 1) await getBrowserByToken();
    process.env.MAX_CONCURRENT_SESSIONS = String(openSessionCount());
    const r = await client.callTool({ name: "navigate", arguments: { url: "https" + "://example.com/" } });
    expect(r.isError).toBe(true);
    const text = (r.content as Array<{ type: string; text: string }>).map((c) => c.text).join(" ");
    expect(text).toContain("The server is at capacity, try again shortly");
    await client.close();
  });
});

describe("a refused call is not billed", () => {
  test("a refusal inside a charged call refunds that charge once; an admitted call refunds nothing", async () => {
    const { withChargeScope, currentCharge } = await import("../src/charge-scope.js");
    const refunds: string[] = [];
    const srv = createServer((req, res) => {
      if ((req.url ?? "").startsWith("/api/credits/refund")) refunds.push(req.url!);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ refunded: true, cost: 5 }));
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
    process.env.CMS_URL = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    try {
      process.env.MAX_CONCURRENT_SESSIONS = "100000";
      process.env.MAX_SESSIONS_PER_ACCOUNT = "1";
      const acct = freshAccount();
      let admittedScope: { refundAttempted: boolean } | undefined;
      await withChargeScope("hash-admitted", "navigate", () => asAccount(acct, async () => {
        await getBrowserByToken();
        admittedScope = currentCharge();
      }));
      expect(refunds).toEqual([]);
      expect(admittedScope?.refundAttempted).toBe(false);

      let refusedScope: { refundAttempted: boolean; idempotencyKey: string } | undefined;
      await withChargeScope("hash-refused", "navigate", () => asAccount(acct, async () => {
        refusedScope = currentCharge();
        await expect(getBrowserByToken()).rejects.toBeInstanceOf(AccountSessionLimitError);
      }));
      expect(refunds.length).toBe(1);
      expect(refunds[0]).toContain("key_hash=hash-refused");
      expect(refunds[0]).toContain("tool=navigate");
      expect(refunds[0]).toContain(`idempotency_key=${refusedScope!.idempotencyKey}`);
      expect(refusedScope!.refundAttempted).toBe(true);
    } finally {
      srv.close();
    }
  });
});

describe("a session the server closes tells its owner why", () => {
  test("an idle-closed session's token says it was idle, to its owner only", async () => {
    process.env.MAX_CONCURRENT_SESSIONS = "100000";
    process.env.MAX_SESSIONS_PER_ACCOUNT = "1000";
    const acct = freshAccount();
    const { token } = await asAccount(acct, () => getBrowserByToken());
    process.env.SESSION_IDLE_TIMEOUT_MS = "1";
    await new Promise((r) => setTimeout(r, 10));
    await sweepSessions();
    delete process.env.SESSION_IDLE_TIMEOUT_MS;
    let err: unknown;
    try { await asAccount(acct, () => getBrowserByToken(token)); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(BrowserSessionExpiredError);
    expect((err as Error).message).toMatch(new RegExp(`'${token}' was closed: it was not used for \\d+ s`));
    // Another account learns nothing about it.
    let other: unknown;
    try { await asAccount(freshAccount(), () => getBrowserByToken(token)); } catch (e) { other = e; }
    expect((other as Error).message).toContain("has expired or does not exist");
    expect((other as Error).message).not.toContain("was closed");
  });
});

describe("process tree selection (fake /proc)", () => {
  // The selection is what keeps a kill inside this session: by user-data-dir,
  // among this process's own children, and their descendants only.
  function fakeProc(rows: Array<[pid: number, ppid: number, state: string, cmd: string]>): string {
    const dir = mkdtempSync(join(tmpdir(), "cb-fakeproc-"));
    for (const [pid, ppid, state, cmd] of rows) {
      mkdirSync(join(dir, String(pid)));
      writeFileSync(join(dir, String(pid), "stat"), `${pid} (chrome (x) y) ${state} ${ppid} 1 1 0 -1`);
      writeFileSync(join(dir, String(pid), "cmdline"), cmd.split(" ").join("\0") + "\0");
    }
    mkdirSync(join(dir, "self"));
    return dir;
  }
  const OWNER = 500;
  const rows: Array<[number, number, string, string]> = [
    [500, 1, "S", "node server.js"],
    [600, 500, "S", "chrome --user-data-dir=/tmp/pw-A --remote-debugging-pipe"],
    [601, 600, "S", "chrome --type=zygote"],
    [602, 601, "T", "chrome --type=renderer"],
    [603, 600, "Z", ""],
    [700, 500, "S", "chrome --user-data-dir=/tmp/pw-B --remote-debugging-pipe"],
    [701, 700, "S", "chrome --type=zygote"],
    // Same user-data-dir string, not this server's child: another program's,
    // another user's, or a pid reused after the session's browser exited.
    [800, 1, "S", "chrome --user-data-dir=/tmp/pw-A"],
    [801, 800, "S", "chrome --type=renderer"],
    // A prefix of A's dir is a different dir.
    [900, 500, "S", "chrome --user-data-dir=/tmp/pw-A2"],
  ];

  test("reads pid, parent, state and the command line, comm with spaces and parentheses included", () => {
    const t = tree.readProcTable(fakeProc(rows));
    expect(t.get(602)).toEqual({ pid: 602, ppid: 601, state: "T", cmdline: "chrome --type=renderer" });
    expect(tree.userDataDirOf(t.get(600)!.cmdline)).toBe("/tmp/pw-A");
    expect(t.has(Number.NaN)).toBe(false);
  });

  test("a session's tree is its own main and descendants, nothing else", () => {
    const t = tree.readProcTable(fakeProc(rows));
    expect(tree.sessionTreePids(new Set(["/tmp/pw-A"]), t, OWNER).sort()).toEqual([600, 601, 602]);
    expect(tree.sessionTreePids(new Set(["/tmp/pw-B"]), t, OWNER).sort()).toEqual([700, 701]);
    expect(tree.sessionTreePids(new Set(["/tmp/pw-A", "/tmp/pw-B"]), t, OWNER).sort()).toEqual([600, 601, 602, 700, 701]);
    expect(tree.sessionTreePids(new Set(), t, OWNER)).toEqual([]);
    expect(tree.sessionTreePids(new Set(["/tmp/pw-C"]), t, OWNER)).toEqual([]);
  });

  test("a CBrowser's identity is trusted only when its pid is this process's child", () => {
    const t = tree.readProcTable(fakeProc(rows));
    const fakeBrowser = (pid: number) => {
      const b = { _connection: { toImpl: () => ({ options: { browserProcess: { process: { pid } } } }) } };
      return { browser: b, context: null };
    };
    expect(tree.browserIdentity(fakeBrowser(600), t, OWNER)).toBe("/tmp/pw-A");
    expect(tree.browserIdentity(fakeBrowser(800), t, OWNER)).toBeUndefined();
    expect(tree.browserIdentity(fakeBrowser(4242), t, OWNER)).toBeUndefined();
    expect(tree.browserIdentity({ browser: null, context: null }, t, OWNER)).toBeUndefined();
    expect(tree.hasLaunched({ browser: null, context: null })).toBe(false);
  });

  test("memory is the sum of Pss, falling back to VmRSS, null when nothing can be read", () => {
    const dir = mkdtempSync(join(tmpdir(), "cb-fakemem-"));
    mkdirSync(join(dir, "1")); writeFileSync(join(dir, "1", "smaps_rollup"), "Rss: 9000 kB\nPss:   102400 kB\n");
    mkdirSync(join(dir, "2")); writeFileSync(join(dir, "2", "status"), "Name: x\nVmRSS:   51200 kB\n");
    expect(tree.treeMemoryMB([1, 2], dir)).toBe(150);
    expect(tree.treeMemoryMB([3], dir)).toBeNull();
  });
});

describe("auth caches are swept", () => {
  test("expired entries go, live ones stay, tierCache keeps its outage grace", () => {
    const c = _authCachesForTest();
    const now = 10_000_000_000_000;
    c.tokenToKeyHash.set("map-old", { keyHash: "h", expiresAt: now - 1 });
    c.tokenToKeyHash.set("map-new", { keyHash: "h", expiresAt: now + 1000 });
    c.oauthCodes.set("code-old", { apiKey: "cbk_x", redirectUri: "r", codeChallenge: "c", expiresAt: now - 1 });
    c.oauthCodes.set("code-new", { apiKey: "cbk_y", redirectUri: "r", codeChallenge: "c", expiresAt: now + 1000 });
    c.tierCache.set("tier-in-grace", { tier: "free", expiresAt: now - 60_000 });
    c.tierCache.set("tier-past-grace", { tier: "free", expiresAt: now - 6 * 60_000 });
    sweepAuthCaches(now);
    expect([...c.tokenToKeyHash.keys()].filter((k) => k.startsWith("map-"))).toEqual(["map-new"]);
    expect([...c.oauthCodes.keys()].filter((k) => k.startsWith("code-"))).toEqual(["code-new"]);
    expect([...c.tierCache.keys()].filter((k) => k.startsWith("tier-"))).toEqual(["tier-in-grace"]);
    for (const m of Object.values(c)) for (const k of [...m.keys()]) if (/^(map|code|tier)-/.test(k)) m.delete(k);
  });

  test("a burst of live entries is bounded, oldest first", () => {
    // tierCache also holds each key's accountId since the billing change
    // (accountCache was folded into it).
    const { tierCache } = _authCachesForTest();
    const before = [...tierCache.keys()];
    for (const k of before) tierCache.delete(k);
    const far = Date.now() + 3600_000;
    for (let i = 0; i < MAX_AUTH_CACHE_ENTRIES + 5; i++) tierCache.set(`burst-${i}`, { tier: "free", accountId: i, expiresAt: far });
    sweepAuthCaches();
    expect(tierCache.size).toBe(MAX_AUTH_CACHE_ENTRIES);
    expect(tierCache.has("burst-4")).toBe(false);
    expect(tierCache.has("burst-5")).toBe(true);
    tierCache.clear();
  });

  test("the session sweep runs the cache sweep", async () => {
    const { oauthCodes } = _authCachesForTest();
    oauthCodes.set("sweep-me", { apiKey: "cbk_z", redirectUri: "r", codeChallenge: "c", expiresAt: Date.now() - 1 });
    await sweepSessions();
    expect(oauthCodes.has("sweep-me")).toBe(false);
  });
});

describe("tier lookup is bounded", () => {
  test("a CMS that accepts and never answers does not hold the request open", async () => {
    const held: import("node:http").ServerResponse[] = [];
    const srv = createServer((_req, res) => { held.push(res); });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
    process.env.CMS_URL = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    const req = { headers: { "x-api-key": `cbk_hangs_${Date.now()}` } } as unknown as import("node:http").IncomingMessage;
    const started = Date.now();
    try {
      const result = await Promise.race([
        resolveRequestAccountId(req),
        new Promise((r) => setTimeout(() => r("still waiting"), 6000)),
      ]);
      expect(result).toBeNull();
      expect(Date.now() - started).toBeLessThan(5000);
    } finally {
      for (const res of held) res.destroy();
      srv.close();
    }
  }, 10_000);
});
