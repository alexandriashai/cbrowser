/**
 * Every tool call on the hosted server is charged and gated once, or refused.
 * (billing fixes, 2026-11-12)
 *
 * THE DEFECTS (2026-11-12 audit, reproduced on the 21.4.8 dist)
 *
 * The charge, the CMS gates (free-tier tool list, registered domain) and the
 * package tier check all happen in handleMcpRequest, before the body reaches the
 * MCP transport. Five ways past them:
 *   - a JSON-RPC batch: the block read `method` off the body as one object, so
 *     an array skipped it and the SDK ran every element, unbilled
 *     (auth-tenancy-billing-2, -5)
 *   - a CMS answer outside 2xx/402/403 ran the tool unbilled, and the caller
 *     could cause one: a url over about 16 KB made the deduct request line too
 *     long and the CMS answered 431 (auth-tenancy-billing-4)
 *   - a CMS outage ran every call unbilled, and past 30 s without account
 *     scope (auth-tenancy-billing-6, prior-plan-status-6)
 *   - the domain gate read only `url` and `sites[0]`, so start_url, entry_url,
 *     startUrl, urlA/urlB reached the CMS as no target at all (enterprise-3)
 *   - an Auth0 token authenticated with no account behind it (enterprise-7)
 *
 * Runs tests/fixtures/remote-billing-harness.ts (the real startRemoteMcpServer,
 * probe tools under real tool names, no browser) as two child processes, one
 * registered like the demo/pro server and one like the enterprise server,
 * against a stand-in CMS served here that logs every deduct, refund and
 * validate call. Nothing leaves 127.0.0.x.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, readFileSync, existsSync } from "fs";
import { createServer as createHttpServer, type Server } from "http";
import { createServer as createNetServer, type Server as NetServer } from "net";
import { tmpdir } from "os";
import { join } from "path";

const HOST = "127.0.0.1";

// ---------------------------------------------------------------------------
// Stand-in CMS.
// ---------------------------------------------------------------------------
type CmsCall = { route: string; key?: string; tool?: string; target?: string; charge?: string | null; lineLength?: number };
const calls: CmsCall[] = [];
let deductStatus = 200;
let cms: Server | undefined;
let cmsPort = 0;

const ACCOUNTS: Record<string, { tier: string; accountId?: number }> = {
  cbk_bill_free_0001: { tier: "free", accountId: 9101 },
  cbk_bill_pro_0001: { tier: "pro", accountId: 9102 },
  cbk_bill_ent_0001: { tier: "enterprise", accountId: 9103 },
  cbk_bill_outage_a: { tier: "pro", accountId: 9201 },
  cbk_bill_outage_b: { tier: "pro", accountId: 9202 },
  cbk_bill_fivexx_c: { tier: "pro", accountId: 9203 },
  // The CMS vouches for the key but names no account.
  cbk_bill_noaccount: { tier: "pro" },
};
const sha = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");
const HASH_TO_KEY = new Map(Object.keys(ACCOUNTS).map((k) => [sha(k), k]));
// A deduct whose target is on this host is refused like an unregistered domain.
const UNREGISTERED_HOST = "127.0.0.3";

function makeCms(): Server {
  return createHttpServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://cms");
    const send = (code: number, obj: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (url.pathname === "/api/accounts/validate-key") {
      const key = String(req.headers["x-api-key"] ?? "");
      calls.push({ route: "validate", key });
      const a = ACCOUNTS[key];
      return a ? send(200, { valid: true, ...a }) : send(401, { valid: false });
    }
    if (url.pathname === "/api/credits/deduct") {
      const key = HASH_TO_KEY.get(url.searchParams.get("key_hash") ?? "");
      const target = url.searchParams.get("target_url") ?? "";
      calls.push({ route: "deduct", key, tool: url.searchParams.get("tool") ?? "", target, charge: url.searchParams.get("charge"), lineLength: (req.url ?? "").length });
      if (deductStatus !== 200) return send(deductStatus, { error: "stand-in status" });
      if (target && new URL(target).hostname === UNREGISTERED_HOST) {
        return send(403, { allowed: false, reason: "domain_not_registered", domain: UNREGISTERED_HOST, message: "not registered" });
      }
      const cost = url.searchParams.get("charge") === "none" ? 0 : 5;
      return send(200, { allowed: true, cost, remaining: 100, tool: url.searchParams.get("tool") });
    }
    if (url.pathname === "/api/credits/refund") {
      calls.push({ route: "refund", key: HASH_TO_KEY.get(url.searchParams.get("key_hash") ?? ""), tool: url.searchParams.get("tool") ?? "" });
      return send(200, { refunded: true, cost: 5, remaining: 105 });
    }
    if (url.pathname === "/api/accounts/log-usage") return send(200, { ok: true });
    send(404, { error: "not found" });
  });
}

async function cmsUp(): Promise<void> {
  cms = makeCms();
  await new Promise<void>((resolve, reject) => { cms!.once("error", reject); cms!.listen(cmsPort, HOST, () => resolve()); });
  cmsPort = (cms.address() as { port: number }).port;
}
async function cmsDown(): Promise<void> {
  await new Promise<void>((resolve) => { cms!.close(() => resolve()); cms!.closeAllConnections?.(); });
}

// A listener standing in for the Auth0 tenant: it only records that somebody
// connected. The server must not ask the tenant about a token any more.
let tenant: NetServer | undefined;
let tenantPort = 0;
let tenantContacts = 0;

// ---------------------------------------------------------------------------
// The two harnesses.
// ---------------------------------------------------------------------------
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.once("error", reject);
    s.listen(0, HOST, () => { const { port } = s.address() as { port: number }; s.close(() => resolve(port)); });
  });
}

type Harness = { child: ReturnType<typeof Bun.spawn>; port: number; runsFile: string; log: () => string };

async function startHarness(mode: "demo" | "enterprise"): Promise<Harness> {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), `cb-billing-${mode}-`));
  const runsFile = join(dir, "runs.jsonl");
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  for (const k of ["MCP_API_KEY", "MCP_API_KEYS", "AUTH0_DOMAIN", "AUTH0_AUDIENCE", "RATE_LIMIT_ENABLED", "CBROWSER_TIER", "OAUTH_ALLOWED_REDIRECTS"]) delete env[k];
  Object.assign(env, {
    PORT: String(port), HOST, MCP_SESSION_MODE: "stateless", REQUIRE_AUTH: "true", CBROWSER_TIER: "free",
    CMS_URL: `http://${HOST}:${cmsPort}`, CMS_INTERNAL_SECRET: "test-secret",
    HOME: dir, CBROWSER_DATA_DIR: join(dir, "data"), CBROWSER_MIRROR_ROOT: join(dir, "mirror"),
    CB_BILLING_MODE: mode, CB_BILLING_RUNS: runsFile,
    ...(mode === "enterprise" ? { AUTH0_DOMAIN: `${HOST}:${tenantPort}`, AUTH0_AUDIENCE: "https://enterprise.example/" } : {}),
  });
  const child = Bun.spawn([process.execPath, join(import.meta.dir, "fixtures", "remote-billing-harness.ts")], {
    cwd: join(import.meta.dir, ".."), env, stdout: "pipe", stderr: "pipe",
  });
  let log = "";
  for (const stream of [child.stdout, child.stderr]) {
    void (async () => { for await (const chunk of stream as ReadableStream<Uint8Array>) log += new TextDecoder().decode(chunk); })();
  }
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`harness exited during start:\n${log}`);
    try { if ((await fetch(`http://${HOST}:${port}/health`, { signal: AbortSignal.timeout(2_000) })).ok) break; } catch { /* not yet */ }
    if (Date.now() > deadline) throw new Error(`harness did not start:\n${log}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  return { child, port, runsFile, log: () => log };
}

let demo: Harness;
let ent: Harness;

beforeAll(async () => {
  tenant = createNetServer((sock) => { tenantContacts++; sock.destroy(); });
  await new Promise<void>((resolve) => tenant!.listen(0, HOST, () => resolve()));
  tenantPort = (tenant.address() as { port: number }).port;
  await cmsUp();
  [demo, ent] = await Promise.all([startHarness("demo"), startHarness("enterprise")]);
}, 60_000);

afterAll(async () => {
  for (const h of [demo, ent]) { try { h?.child.kill(); } catch { /* gone */ } }
  try { await cmsDown(); } catch { /* already down */ }
  tenant?.close();
});

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------
function runs(h: Harness): Array<{ tool: string; args: Record<string, unknown> }> {
  if (!existsSync(h.runsFile)) return [];
  return readFileSync(h.runsFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

type Answer = { status: number; text: string; message: Record<string, unknown> | null; headers: Headers };

async function post(h: Harness, key: string | null, body: string, extraHeaders: Record<string, string> = {}): Promise<Answer> {
  const r = await fetch(`http://${HOST}:${h.port}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(key ? { authorization: `Bearer ${key}` } : {}), ...extraHeaders },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await r.text();
  let message: Record<string, unknown> | null = null;
  const line = text.split("\n").filter((l) => l.startsWith("data: ")).pop();
  try { message = JSON.parse(line ? line.slice(6) : text); } catch { message = null; }
  return { status: r.status, text, message, headers: r.headers };
}

const callMsg = (name: string, args: Record<string, unknown> = {}, id: number | string | null = 1) =>
  ({ jsonrpc: "2.0", ...(id === null ? {} : { id }), method: "tools/call", params: { name, arguments: args } });

async function toolCall(h: Harness, key: string, name: string, args: Record<string, unknown> = {}): Promise<Answer> {
  return post(h, key, JSON.stringify(callMsg(name, args)));
}

/** What the stand-in CMS saw while `fn` ran. */
async function during<T>(fn: () => Promise<T>): Promise<{ value: T; deducts: CmsCall[]; refunds: CmsCall[] }> {
  const from = calls.length;
  const value = await fn();
  // A refund is awaited before the response returns, so nothing more is coming.
  const seen = calls.slice(from);
  return { value, deducts: seen.filter((c) => c.route === "deduct"), refunds: seen.filter((c) => c.route === "refund") };
}

const resultText = (a: Answer): string => {
  const content = ((a.message?.result as { content?: Array<{ text?: string }> } | undefined)?.content) ?? [];
  return content.map((c) => c.text ?? "").join("\n");
};
const isErrorResult = (a: Answer): boolean => (a.message?.result as { isError?: boolean } | undefined)?.isError === true;

const PRO = "cbk_bill_pro_0001";
const ENT = "cbk_bill_ent_0001";
const FREE = "cbk_bill_free_0001";

// ---------------------------------------------------------------------------
// 0. The pure pieces.
// ---------------------------------------------------------------------------
const remote = await import("../src/mcp-server-remote.js");

describe("helpers", () => {
  test("targetUrlsOf collects every URL argument, url first, and skips proxies and patterns", () => {
    expect(remote.targetUrlsOf({ start_url: "https://a.example/s" })).toEqual(["https://a.example/s"]);
    expect(remote.targetUrlsOf({ entry_url: "https://a.example/e", funnel_name: "x" })).toEqual(["https://a.example/e"]);
    expect(remote.targetUrlsOf({ urlB: "https://b.example/", url: "https://a.example/" })).toEqual(["https://a.example/", "https://b.example/"]);
    expect(remote.targetUrlsOf({ sites: ["https://a.example/", "https://b.example/"] })).toEqual(["https://a.example/", "https://b.example/"]);
    expect(remote.targetUrlsOf({ baseUrl: "https://a.example/", maxPages: 5 })).toEqual(["https://a.example/"]);
    // A new argument name cannot hide a target: any absolute http(s) value counts.
    expect(remote.targetUrlsOf({ landing: "https://c.example/" })).toEqual(["https://c.example/"]);
    // Not targets: where traffic is routed and what is blocked.
    expect(remote.targetUrlsOf({ url: "https://a.example/", proxy: "http://user:pw@proxy.example:1", blockUrls: ["https://ads.example/"] })).toEqual(["https://a.example/"]);
    // A named URL argument that is not http(s) still reaches the CMS, which refuses it for a scoped tool.
    expect(remote.targetUrlsOf({ url: "data:text/html,x" })).toEqual(["data:text/html,x"]);
    expect(remote.targetUrlsOf(undefined)).toEqual([]);
  });

  test("deductTarget keeps the origin and a bounded path, nothing else", () => {
    expect(remote.deductTarget("https://a.example/p/q?x=1#frag")).toBe("https://a.example/p/q");
    expect(remote.deductTarget("https://a.example/" + "p".repeat(5000)).length).toBe("https://a.example".length + 512);
    expect(remote.deductTarget("https://registered.example@other.example/")).toBe("https://other.example/");
    expect(remote.deductTarget("data:text/html," + "x".repeat(5000)).length).toBe(512);
  });

  test("classifyDeduct: only allowed:true on a 2xx runs", () => {
    expect(remote.classifyDeduct(200, { allowed: true, cost: 5 })).toEqual({ kind: "ok", charged: true });
    expect(remote.classifyDeduct(200, { allowed: true, cost: 0 })).toEqual({ kind: "ok", charged: false });
    expect(remote.classifyDeduct(402, { allowed: false, reason: "insufficient_credits" }).kind).toBe("denied");
    expect(remote.classifyDeduct(403, { allowed: false, reason: "domain_not_registered" }).kind).toBe("denied");
    for (const s of [431, 404, 400, 413, 302]) expect(remote.classifyDeduct(s, { error: "x" }).kind).toBe("refused");
    // A 403 or 2xx without a verdict is not permission.
    expect(remote.classifyDeduct(403, { error: "Unauthorized internal request" }).kind).toBe("refused");
    expect(remote.classifyDeduct(200, {}).kind).toBe("refused");
    for (const s of [500, 502, 503]) expect(remote.classifyDeduct(s, null).kind).toBe("outage");
  });

  test("takeOutageAllowance: 5 per account per 10 minutes", () => {
    remote._resetOutageAllowance();
    const t0 = 1_000_000;
    for (let i = 1; i <= 5; i++) expect(remote.takeOutageAllowance("account 1", t0 + i)).toEqual({ allowed: true, used: i });
    expect(remote.takeOutageAllowance("account 1", t0 + 6).allowed).toBe(false);
    expect(remote.takeOutageAllowance("account 2", t0 + 7).allowed).toBe(true);
    expect(remote.takeOutageAllowance("account 1", t0 + 10 * 60_000 + 2).allowed).toBe(true);
    remote._resetOutageAllowance();
  });

  test("past the 30 s TTL with the CMS unreachable, the outage grace returns the account with the tier", async () => {
    const key = "cbk_bill_stale_unit_0001";
    const ok = (async () => new Response(JSON.stringify({ valid: true, tier: "pro", accountId: 4242 }), { status: 200 })) as unknown as typeof fetch;
    const down = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    const savedCms = process.env.CMS_URL;
    // Nothing here may reach a real CMS: an expired entry makes resolveRequestAccountId ask one.
    process.env.CMS_URL = "http://127.0.0.1:1";
    try {
      remote._clearTierCache();
      expect(await remote.validateAccountKey(key, { fetch: ok, cmsUrl: "http://cms.invalid" })).toMatchObject({ valid: true, accountId: 4242 });
      remote._ageTierCache(31_000);
      expect(await remote.validateAccountKey(key, { fetch: down, cmsUrl: "http://cms.invalid" })).toEqual({ valid: true, tier: "pro", accountId: 4242 });
      const req = { headers: { authorization: `Bearer ${key}` } } as unknown as import("http").IncomingMessage;
      expect(await remote.resolveRequestAccountId(req)).toBe(4242);
      // Past the grace too: no account, and the key no longer authenticates.
      remote._ageTierCache(5 * 60_000);
      expect(await remote.resolveRequestAccountId(req)).toBeNull();
    } finally {
      if (savedCms === undefined) delete process.env.CMS_URL; else process.env.CMS_URL = savedCms;
      remote._clearTierCache();
    }
  });

  test("unsupportedBodyShape", () => {
    expect(remote.unsupportedBodyShape({ jsonrpc: "2.0", id: 1, method: "tools/call", params: {} })).toBeNull();
    expect(remote.unsupportedBodyShape({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    expect(remote.unsupportedBodyShape([])).toMatch(/batch/i);
    expect(remote.unsupportedBodyShape(undefined)).not.toBeNull();
    expect(remote.unsupportedBodyShape(null)).not.toBeNull();
    expect(remote.unsupportedBodyShape({ jsonrpc: "2.0", id: null, method: "tools/call" })).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 1. A body that is not one JSON-RPC message object never reaches the SDK.
// ---------------------------------------------------------------------------
describe("only one JSON-RPC message object per request", () => {
  for (const which of ["demo", "enterprise"] as const) {
    test(`${which}: a batch of tool calls is refused with 400 -32600, nothing charged, nothing run`, async () => {
      const h = which === "demo" ? demo : ent;
      const key = which === "demo" ? FREE : ENT;
      const before = runs(h).length;
      const { value, deducts } = await during(() => post(h, key, JSON.stringify([callMsg("navigate", { url: "http://127.0.0.1:1/a" }, 1), callMsg("navigate", { url: "http://127.0.0.1:1/b" }, 2)])));
      expect(value.status).toBe(400);
      expect(value.message?.id).toBeNull();
      expect((value.message?.error as { code?: number })?.code).toBe(-32600);
      expect(String((value.message?.error as { message?: string })?.message)).toMatch(/batch/i);
      expect(deducts).toHaveLength(0);
      expect(runs(h).length).toBe(before);
    });

    test(`${which}: a one-element batch is refused too`, async () => {
      const h = which === "demo" ? demo : ent;
      const before = runs(h).length;
      const { value, deducts } = await during(() => post(h, which === "demo" ? FREE : ENT, JSON.stringify([callMsg("navigate", { url: "http://127.0.0.1:1/a" })])));
      expect(value.status).toBe(400);
      expect(deducts).toHaveLength(0);
      expect(runs(h).length).toBe(before);
    });
  }

  for (const [label, body] of [["a string", '"tools/call"'], ["a number", "5"], ["null", "null"], ["true", "true"], ["an empty array", "[]"], ["an empty body", ""]] as const) {
    test(`a body that is ${label} is refused with 400 -32600`, async () => {
      const before = runs(demo).length;
      const { value, deducts } = await during(() => post(demo, PRO, body));
      expect(value.status).toBe(400);
      expect((value.message?.error as { code?: number })?.code).toBe(-32600);
      expect(deducts).toHaveLength(0);
      expect(runs(demo).length).toBe(before);
    });
  }

  test("a tools/call sent as a notification (no id) is refused, not charged for nothing", async () => {
    const { value, deducts } = await during(() => post(demo, PRO, JSON.stringify(callMsg("empathy_audit", { url: "http://127.0.0.1:1/n" }, null))));
    expect(value.status).toBe(400);
    expect((value.message?.error as { code?: number })?.code).toBe(-32600);
    expect(deducts).toHaveLength(0);
  });

  test("a GET stream on /mcp runs nothing and charges nothing", async () => {
    const before = runs(demo).length;
    const { value, deducts } = await during(async () => {
      const r = await fetch(`http://${HOST}:${demo.port}/mcp`, {
        headers: { accept: "text/event-stream", authorization: `Bearer ${PRO}` },
        signal: AbortSignal.timeout(3_000),
      }).catch(() => null);
      try { await r?.body?.cancel(); } catch { /* closed */ }
      return r?.status ?? 0;
    });
    expect(value).not.toBe(500);
    expect(deducts).toHaveLength(0);
    expect(runs(demo).length).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 2. Only a 2xx from the deduct runs the tool, and the deduct cannot be made to fail.
// ---------------------------------------------------------------------------
describe("the deduct decides", () => {
  test("anti-case: one ordinary paid call is deducted exactly once and runs", async () => {
    const before = runs(demo).length;
    const { value, deducts, refunds } = await during(() => toolCall(demo, PRO, "empathy_audit", { url: "http://127.0.0.1:1/page" }));
    expect(value.status).toBe(200);
    expect(resultText(value)).toBe("empathy_audit ran");
    expect(deducts).toHaveLength(1);
    expect(deducts[0]).toMatchObject({ key: PRO, tool: "empathy_audit", target: "http://127.0.0.1:1/page" });
    expect(refunds).toHaveLength(0);
    expect(runs(demo).length).toBe(before + 1);
  });

  test("anti-case: a tool that returns isError is refunded once", async () => {
    const { value, deducts, refunds } = await during(() => toolCall(demo, PRO, "empathy_audit", { url: "http://127.0.0.1:1/page", fail: true }));
    expect(isErrorResult(value)).toBe(true);
    expect(deducts).toHaveLength(1);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ key: PRO, tool: "empathy_audit" });
  });

  test("a charged tool whose handler throws is refunded once", async () => {
    const { value, deducts, refunds } = await during(() => toolCall(demo, PRO, "hunt_bugs", { url: "http://127.0.0.1:1/page" }));
    expect(isErrorResult(value)).toBe(true);
    expect(resultText(value)).toContain("probe handler threw");
    expect(deducts).toHaveLength(1);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ key: PRO, tool: "hunt_bugs" });
  });

  for (const status of [431, 404, 400]) {
    test(`a ${status} from the CMS refuses the call with a clear error and runs nothing`, async () => {
      const before = runs(demo).length;
      deductStatus = status;
      try {
        const { value, deducts } = await during(() => toolCall(demo, PRO, "navigate", { url: "http://127.0.0.1:1/x" }));
        expect(deducts).toHaveLength(1);
        expect(isErrorResult(value)).toBe(true);
        expect(resultText(value)).toMatch(/billing/i);
      } finally {
        deductStatus = 200;
      }
      expect(runs(demo).length).toBe(before);
    });
  }

  test("a url padded past 16 KB still reaches the CMS as a short target and is charged once", async () => {
    const before = runs(demo).length;
    const url = "http://127.0.0.1:1/padded/path?q=1#" + "x".repeat(20_000);
    const { value, deducts } = await during(() => toolCall(demo, PRO, "navigate", { url }));
    expect(resultText(value)).toBe("navigate ran");
    expect(deducts).toHaveLength(1);
    expect(deducts[0].target).toBe("http://127.0.0.1:1/padded/path");
    expect(deducts[0].lineLength!).toBeLessThan(2_048);
    expect(runs(demo).length).toBe(before + 1);
  });

  test("a long path is bounded too", async () => {
    const url = "http://127.0.0.1:1/" + "p".repeat(20_000);
    const { deducts } = await during(() => toolCall(demo, PRO, "navigate", { url }));
    expect(deducts).toHaveLength(1);
    expect(deducts[0].target!.startsWith("http://127.0.0.1:1/ppp")).toBe(true);
    expect(deducts[0].lineLength!).toBeLessThan(2_048);
  });
});

// ---------------------------------------------------------------------------
// 3. Every URL argument reaches the gate.
// ---------------------------------------------------------------------------
describe("the domain gate sees every URL argument", () => {
  test("start_url reaches the deduct target (enterprise)", async () => {
    const { value, deducts } = await during(() => toolCall(ent, ENT, "cognitive_journey_autonomous", { start_url: "http://127.0.0.1:1/journey" }));
    expect(resultText(value)).toBe("cognitive_journey_autonomous ran");
    expect(deducts).toHaveLength(1);
    expect(deducts[0]).toMatchObject({ tool: "cognitive_journey_autonomous", target: "http://127.0.0.1:1/journey", charge: "none" });
  });

  test("entry_url reaches the deduct target (enterprise)", async () => {
    const { deducts } = await during(() => toolCall(ent, ENT, "marketing_funnel_analyze", { entry_url: "http://127.0.0.1:1/funnel" }));
    expect(deducts).toHaveLength(1);
    expect(deducts[0].target).toBe("http://127.0.0.1:1/funnel");
  });

  test("startUrl reaches the deduct target (demo)", async () => {
    const { deducts } = await during(() => toolCall(demo, PRO, "cognitive_journey_init", { startUrl: "http://127.0.0.1:1/start" }));
    expect(deducts).toHaveLength(1);
    expect(deducts[0].target).toBe("http://127.0.0.1:1/start");
  });

  test("an unregistered domain in start_url is refused and nothing runs", async () => {
    const before = runs(ent).length;
    const { value } = await during(() => toolCall(ent, ENT, "cognitive_journey_autonomous", { start_url: `http://${UNREGISTERED_HOST}:1/elsewhere` }));
    expect(isErrorResult(value)).toBe(true);
    expect(resultText(value)).toMatch(/domain_not_registered/);
    expect(runs(ent).length).toBe(before);
  });

  test("two URLs on two hosts: both gated, charged once net, and the call runs", async () => {
    const before = runs(demo).length;
    const { value, deducts, refunds } = await during(() => toolCall(demo, PRO, "ab_comparison", { urlA: "http://127.0.0.1:1/a", urlB: "http://127.0.0.2:1/b" }));
    expect(resultText(value)).toBe("ab_comparison ran");
    expect(deducts.map((d) => d.target).sort()).toEqual(["http://127.0.0.1:1/a", "http://127.0.0.2:1/b"]);
    expect(refunds).toHaveLength(1);
    expect(runs(demo).length).toBe(before + 1);
  });

  test("two URLs on one host: one deduct", async () => {
    const { deducts, refunds } = await during(() => toolCall(demo, PRO, "ab_comparison", { urlA: "http://127.0.0.1:1/a", urlB: "http://127.0.0.1:1/b" }));
    expect(deducts).toHaveLength(1);
    expect(refunds).toHaveLength(0);
  });

  test("the second URL on an unregistered domain refuses the call and gives the charge back", async () => {
    const before = runs(demo).length;
    const { value, deducts, refunds } = await during(() => toolCall(demo, PRO, "ab_comparison", { urlA: "http://127.0.0.1:1/a", urlB: `http://${UNREGISTERED_HOST}:1/b` }));
    expect(isErrorResult(value)).toBe(true);
    expect(resultText(value)).toMatch(/domain_not_registered/);
    expect(deducts).toHaveLength(2);
    expect(refunds).toHaveLength(1);
    expect(runs(demo).length).toBe(before);
  });
});

// The box resolves each URL a call names (a HEAD chain) before it charges. A
// call must not be able to make it send many requests for free. (review of
// 2026-11-14: one call naming 5,000 paths on one host made 5,000 HEADs.)
describe("resolving URLs costs the box at most a few requests, and nothing for a refused call", () => {
  let hits = 0;
  let target: ReturnType<typeof Bun.serve> | undefined;
  beforeAll(() => {
    target = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => { hits++; return new Response("ok"); } });
  });
  afterAll(() => { target?.stop(true); });
  const urls = (n: number) => Array.from({ length: n }, (_, i) => `http://127.0.0.1:${target!.port}/p${i}`);

  test("eleven URLs on one host: refused before any is resolved, nothing charged", async () => {
    const before = runs(demo).length;
    hits = 0;
    const { value, deducts } = await during(() => toolCall(demo, PRO, "navigate", { sites: urls(11) }));
    expect(isErrorResult(value)).toBe(true);
    expect(resultText(value)).toMatch(/too_many_sites/);
    expect(hits).toBe(0);
    expect(deducts).toHaveLength(0);
    expect(runs(demo).length).toBe(before);
  });

  test("ten URLs on one host still run, one deduct", async () => {
    hits = 0;
    const { value, deducts } = await during(() => toolCall(demo, PRO, "navigate", { sites: urls(10) }));
    expect(resultText(value)).toBe("navigate ran");
    expect(deducts).toHaveLength(1);
    expect(hits).toBeLessThanOrEqual(10);
  });

  test("a tool outside the tier is refused before its URL is resolved", async () => {
    hits = 0;
    const { value, deducts } = await during(() => toolCall(demo, FREE, "marketing_funnel_analyze", { entry_url: urls(1)[0] }));
    expect(resultText(value).toLowerCase()).toMatch(/upgrade|pro/);
    expect(hits).toBe(0);
    expect(deducts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Accounts and credentials.
// ---------------------------------------------------------------------------
describe("every call belongs to an account", () => {
  test("a key the CMS vouches for but names no account is answered 503, never run unscoped", async () => {
    const before = runs(demo).length;
    const { value, deducts } = await during(() => toolCall(demo, "cbk_bill_noaccount", "navigate", { url: "http://127.0.0.1:1/x" }));
    expect(value.status).toBe(503);
    expect(deducts).toHaveLength(0);
    expect(runs(demo).length).toBe(before);
  });

  test("an Auth0-shaped token with no account is refused with 401 and pointed at API-key sign-in", async () => {
    const jwtShaped = ["eyJhbGciOiJSUzI1NiIsImtpZCI6ImsxIn0", "eyJzdWIiOiJhdXRoMHxzb21lb25lIiwiYXVkIjoiaHR0cHM6Ly9lbnRlcnByaXNlLmV4YW1wbGUvIn0", "c2lnbmF0dXJl"].join(".");
    const before = runs(ent).length;
    const contactsBefore = tenantContacts;
    const { value, deducts } = await during(() => post(ent, jwtShaped, JSON.stringify(callMsg("navigate", { url: "http://127.0.0.1:1/x" }))));
    expect(value.status).toBe(401);
    expect(value.text).toMatch(/API key/i);
    expect(value.text).toMatch(/Auth0/);
    expect(deducts).toHaveLength(0);
    expect(runs(ent).length).toBe(before);
    // The token is refused on its shape: the tenant is never asked about it.
    await new Promise((r) => setTimeout(r, 200));
    expect(tenantContacts).toBe(contactsBefore);
  });

  test("the OAuth discovery document no longer sends clients to a tenant whose tokens are refused", async () => {
    const r = await fetch(`http://${HOST}:${ent.port}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(5_000) });
    const doc = await r.json() as { token_endpoint?: string; authorization_endpoint?: string };
    expect(doc.token_endpoint).toMatch(/\/token$/);
    expect(doc.authorization_endpoint).toMatch(/\/authorize$/);
    expect(JSON.stringify(doc)).not.toContain(`${HOST}:${tenantPort}`);
  });
});

// ---------------------------------------------------------------------------
// 5. A CMS outage is a small allowance per account, not an open door. Last,
//    because it takes the stand-in CMS down.
// ---------------------------------------------------------------------------
describe("CMS unavailable", () => {
  test("a 5xx runs the call within the allowance and logs it without the key", async () => {
    deductStatus = 503;
    try {
      const { value } = await during(() => toolCall(demo, "cbk_bill_fivexx_c", "navigate", { url: "http://127.0.0.1:1/x" }));
      expect(resultText(value)).toBe("navigate ran");
    } finally {
      deductStatus = 200;
    }
    await new Promise((r) => setTimeout(r, 100));
    const line = demo.log().split("\n").find((l) => l.includes("OUTAGE") && l.includes("9203"));
    expect(line).toBeDefined();
    expect(line).toContain("navigate");
    expect(line).not.toContain("cbk_bill_fivexx_c");
  });

  test("connection refused: 5 calls run for an account, the 6th is refused, another account keeps its own 5", async () => {
    // Validate both keys while the CMS is up, so authentication is served
    // from the cache once it is gone.
    for (const k of ["cbk_bill_outage_a", "cbk_bill_outage_b"]) {
      expect(resultText(await toolCall(demo, k, "navigate", { url: "http://127.0.0.1:1/warm" }))).toBe("navigate ran");
    }
    await cmsDown();
    try {
      const a: string[] = [];
      for (let i = 0; i < 6; i++) {
        const r = await toolCall(demo, "cbk_bill_outage_a", "navigate", { url: "http://127.0.0.1:1/x" });
        a.push(resultText(r));
      }
      expect(a.slice(0, 5)).toEqual(Array(5).fill("navigate ran"));
      expect(a[5]).toMatch(/billing is temporarily unavailable, try again shortly/i);
      const b: string[] = [];
      for (let i = 0; i < 5; i++) {
        b.push(resultText(await toolCall(demo, "cbk_bill_outage_b", "navigate", { url: "http://127.0.0.1:1/x" })));
      }
      expect(b).toEqual(Array(5).fill("navigate ran"));
      const sixthB = await toolCall(demo, "cbk_bill_outage_b", "navigate", { url: "http://127.0.0.1:1/x" });
      expect(resultText(sixthB)).toMatch(/billing is temporarily unavailable/i);
      expect(demo.log()).not.toContain("cbk_bill_outage");
    } finally {
      await cmsUp();
    }
  }, 60_000);
});
