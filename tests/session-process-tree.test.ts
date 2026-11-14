/**
 * The hosted session sweep's memory limit and force-kill, on real Chromium
 * (audit leaks-live-3, leaks-live-6, prior-plan-status-5, leaks-static-8;
 * 2026-11-12).
 *
 * Before: both read the Chromium pid through browser.process(), which a
 * Playwright Browser does not have, so the 800 MB limit never fired (a session
 * held 1,043 to 1,093 MB for 75 s on a scratch server) and a browser that did
 * not answer close() was dropped from the table and left running for good (6
 * processes, 77 threads, 99 MB still there 140 s later). The process tree now
 * comes from browser-process-tree.ts.
 *
 * Every kill must stay inside the session it is for: each test keeps a second
 * session and an unrelated Chromium (launched straight through Playwright, so
 * it is this process's child too) and checks they are still running.
 */
import { describe, test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { mkdtempSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { chromium, type Browser } from "playwright";

const ROOT = mkdtempSync(join(tmpdir(), "cb-session-tree-"));
process.env.CBROWSER_DATA_DIR = join(ROOT, "legacy");
process.env.CBROWSER_MIRROR_ROOT = join(ROOT, "mirror");

const { withPersonaScope } = await import("../src/persona-scope.js");
const remote = await import("../src/mcp-server-remote.js");
const { getBrowserByToken, sweepSessions, BrowserSessionExpiredError } = remote;
const tree = await import("../src/browser-process-tree.js");

const ENV_KEYS = ["MAX_CONCURRENT_SESSIONS", "MAX_SESSIONS_PER_ACCOUNT", "SESSION_MEMORY_LIMIT_MB", "SESSION_IDLE_TIMEOUT_MS", "SESSION_CLOSE_TIMEOUT_MS"];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
});

let account = 9300;
const ACCT = () => ++account;

/** A process that has exited (gone, or a zombie waiting to be collected). */
function dead(pid: number): boolean {
  if (!existsSync(`/proc/${pid}`)) return true;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2)[0] === "Z";
  } catch {
    return true;
  }
}

/** Kills from the sweep's stale and leftover paths are not waited for; give them a moment. */
const allExitSoon = (pids: number[]) => tree.waitForExit(pids, 3000);

async function openSession(acct: number) {
  const { browser, token } = await withPersonaScope(acct, () => getBrowserByToken());
  const page = await browser.getPage();
  await page.setContent("<!doctype html><title>t</title><p>session page</p>");
  const dir = tree.browserIdentity(browser, tree.readProcTable());
  if (!dir) throw new Error("no identity for a launched session browser");
  return { browser, token, pids: () => tree.sessionTreePids(new Set([dir]), tree.readProcTable()) };
}

let bystander: Browser;
let bystanderPid: number;
beforeAll(async () => {
  process.env.MAX_CONCURRENT_SESSIONS = "100000";
  process.env.MAX_SESSIONS_PER_ACCOUNT = "1000";
  bystander = await chromium.launch({ headless: true });
  bystanderPid = tree.browserMainPid({ browser: bystander })!;
});
afterAll(async () => {
  await bystander?.close().catch(() => {});
  // Safety net for a failed run: a SIGSTOPped tree must not outlive the test.
  // Only this test process's own descendants are touched.
  const table = tree.readProcTable();
  const mine: number[] = [];
  const queue = [process.pid];
  while (queue.length) {
    const p = queue.shift()!;
    for (const e of table.values()) if (e.ppid === p) { mine.push(e.pid); queue.push(e.pid); }
  }
  tree.killPids(mine);
});

describe("a session's process tree", () => {
  test("is found without browser.process(): main pid, user-data-dir, descendants, memory", async () => {
    process.env.MAX_CONCURRENT_SESSIONS = "100000";
    process.env.MAX_SESSIONS_PER_ACCOUNT = "1000";
    const s = await openSession(ACCT());
    expect(typeof (s.browser as unknown as { browser: { process?: unknown } }).browser.process).toBe("undefined");
    const table = tree.readProcTable();
    const main = tree.browserMainPid(s.browser)!;
    expect(table.get(main)?.ppid).toBe(process.pid);
    const pids = s.pids();
    expect(pids[0]).toBe(main);
    expect(pids.length).toBeGreaterThanOrEqual(3);
    expect(pids).not.toContain(bystanderPid);
    const mb = tree.treeMemoryMB(pids)!;
    expect(mb).toBeGreaterThan(10);
    expect(mb).toBeLessThan(800);
    await s.browser.close();
  }, 60_000);
});

describe("the sweep", () => {
  test("closes a session whose browser holds more than the limit, tells its owner, and leaves the others alone", async () => {
    process.env.MAX_CONCURRENT_SESSIONS = "100000";
    process.env.MAX_SESSIONS_PER_ACCOUNT = "1000";
    process.env.SESSION_MEMORY_LIMIT_MB = "400";
    const acct = ACCT();
    const hog = await openSession(acct);
    const calm = await openSession(acct);
    const hogPids = hog.pids();
    const page = await hog.browser.getPage();
    await page.evaluate(() => {
      const keep: Uint8Array[] = [];
      for (let i = 0; i < 9; i++) { const a = new Uint8Array(64 * 1024 * 1024); a.fill(1); keep.push(a); }
      (window as unknown as { __hog: Uint8Array[] }).__hog = keep;
    });
    expect(tree.treeMemoryMB(hogPids)!).toBeGreaterThan(400);

    await sweepSessions();

    expect(hogPids.every(dead)).toBe(true);
    let err: unknown;
    try { await withPersonaScope(acct, () => getBrowserByToken(hog.token)); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(BrowserSessionExpiredError);
    expect((err as Error).message).toMatch(/its browser used \d+ MB, over this server's limit of 400 MB per browser/);

    // The other session of the same account, and a browser that is no session's.
    expect(calm.pids().length).toBeGreaterThanOrEqual(3);
    expect((await withPersonaScope(acct, () => getBrowserByToken(calm.token))).browser).toBe(calm.browser);
    expect(dead(bystanderPid)).toBe(false);
    await calm.browser.close();
  }, 120_000);

  test("SIGKILLs the tree of a browser that does not answer close(), and only that tree", async () => {
    process.env.MAX_CONCURRENT_SESSIONS = "100000";
    process.env.MAX_SESSIONS_PER_ACCOUNT = "1000";
    process.env.SESSION_CLOSE_TIMEOUT_MS = "2000";
    const acct = ACCT();
    const hung = await openSession(acct);
    const live = await openSession(acct);
    const hungPids = hung.pids();
    const livePids = live.pids();
    for (const pid of hungPids) process.kill(pid, "SIGSTOP");

    process.env.SESSION_IDLE_TIMEOUT_MS = "1500";
    await new Promise((r) => setTimeout(r, 1800));
    // Keep the other session in use, so only the hung one is idle.
    await withPersonaScope(acct, () => getBrowserByToken(live.token));
    const bucket = `account:${acct}`;
    expect(remote.openSessionCount(Date.now(), bucket)).toBe(2);
    const started = Date.now();
    const sweep = sweepSessions();
    // While close() hangs the session is out of the table but still holds its
    // memory and tasks, so it still counts against the limits.
    await new Promise((r) => setTimeout(r, 500));
    expect(remote.openSessionCount(Date.now(), bucket)).toBe(2);
    await sweep;
    const took = Date.now() - started;
    expect(remote.openSessionCount(Date.now(), bucket)).toBe(1);

    expect(hungPids.every(dead)).toBe(true);
    expect(took).toBeGreaterThanOrEqual(1900);
    expect(took).toBeLessThan(10_000);
    expect(livePids.some(dead)).toBe(false);
    expect(dead(bystanderPid)).toBe(false);
    await live.browser.close();
  }, 120_000);

  test("kills the tree crash recovery abandoned, keeping the browser that replaced it", async () => {
    process.env.MAX_CONCURRENT_SESSIONS = "100000";
    process.env.MAX_SESSIONS_PER_ACCOUNT = "1000";
    const acct = ACCT();
    const s = await openSession(acct);
    await sweepSessions(); // learns the first browser's user-data-dir
    const firstPids = s.pids();
    for (const pid of firstPids) process.kill(pid, "SIGSTOP");
    // What withCrashRecovery and browser_recover do with an unresponsive
    // browser: forceClose gives up after its 2 s races and drops the handles.
    await (s.browser as unknown as { forceClose: () => Promise<void> }).forceClose();
    const page = await s.browser.getPage();
    await page.setContent("<p>relaunched</p>");
    const secondDir = tree.browserIdentity(s.browser, tree.readProcTable())!;
    const secondPids = tree.sessionTreePids(new Set([secondDir]), tree.readProcTable());
    expect(firstPids.some(dead)).toBe(false);

    await sweepSessions();

    expect(await allExitSoon(firstPids)).toBe(true);
    expect(secondPids.some(dead)).toBe(false);
    expect((await withPersonaScope(acct, () => getBrowserByToken(s.token))).browser).toBe(s.browser);
    await s.browser.close();
  }, 120_000);

  test("closes a browser a call still in flight launched again after its session closed", async () => {
    process.env.MAX_CONCURRENT_SESSIONS = "100000";
    process.env.MAX_SESSIONS_PER_ACCOUNT = "1000";
    const acct = ACCT();
    const s = await openSession(acct);
    process.env.SESSION_IDLE_TIMEOUT_MS = "1";
    await new Promise((r) => setTimeout(r, 10));
    await sweepSessions();
    process.env.SESSION_IDLE_TIMEOUT_MS = "300000";
    // A tool that was mid-call: getPage launches the retired CBrowser again.
    await s.browser.getPage();
    const dir = tree.browserIdentity(s.browser, tree.readProcTable())!;
    const pids = tree.sessionTreePids(new Set([dir]), tree.readProcTable());
    expect(pids.length).toBeGreaterThanOrEqual(3);

    await sweepSessions();

    expect(await allExitSoon(pids)).toBe(true);
    expect(tree.hasLaunched(s.browser)).toBe(false);
    expect(dead(bystanderPid)).toBe(false);
  }, 120_000);
});
