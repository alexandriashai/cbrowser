/**
 * HAR recording through the daemon (reported 2026-10-12: "The HAR recorder captures
 * nothing through the daemon").
 *
 * Every CLI command is its own process, and the recorder lives in the CBrowser
 * instance: `har start` set a flag in one process, `navigate` ran in the daemon's
 * browser (which was not recording), and `har stop` wrote an empty HAR from a third
 * process. Reproduced on 19.4.2: 0 entries with the daemon, 0 without, and both
 * runs printed "HAR recording started" and "HAR saved".
 *
 * Now `har start/stop` go to the daemon, which records in its own browser, and
 * without a daemon `har start` refuses, because no recording can span commands.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createServer } from "node:net";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Subprocess } from "bun";
import { serveFixtures } from "./fixtures/serve-fixtures.js";

const CLI = resolve(import.meta.dir, "..", "src", "cli.ts");
const TIMEOUT = 90_000;

let dataDir = "";
let lonelyDir = "";
let port = 0;
let daemon: Subprocess | undefined;
let fixtures: Awaited<ReturnType<typeof serveFixtures>>;

type DaemonResponse = { success: boolean; result?: unknown; error?: string };
/** The daemon requires its token (from the 0600 state file) on /command. */
const daemonToken = () => (JSON.parse(readFileSync(join(dataDir, "daemon.json"), "utf8")) as { token?: string }).token ?? "";
async function post(command: string, args: Record<string, unknown>): Promise<DaemonResponse> {
  const res = await fetch(`http://127.0.0.1:${port}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CBrowser-Daemon-Token": daemonToken() },
    body: JSON.stringify({ command, args }),
    signal: AbortSignal.timeout(60_000),
  });
  return await res.json() as DaemonResponse;
}

async function freePort(): Promise<number> {
  return await new Promise((r) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => r(p));
    });
  });
}

let runSeq = 0;
async function cli(dir: string, ...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const n = runSeq++;
  const out = join(dir, `out-${n}.txt`), err = join(dir, `err-${n}.txt`), codeFile = join(dir, `code-${n}.txt`);
  const proc = Bun.spawn(
    ["bash", "-c", 'bun run "$0" "$@" > "$CB_OUT" 2> "$CB_ERR"; c=$?; echo $c > "$CB_CODE"; exit $c', CLI, ...args],
    { env: { ...process.env, CBROWSER_DATA_DIR: dir, CB_OUT: out, CB_ERR: err, CB_CODE: codeFile }, stdout: "ignore", stderr: "ignore" },
  );
  const fromFile = (async () => {
    for (let i = 0; i < 2400; i++) {
      if (existsSync(codeFile)) {
        const raw = readFileSync(codeFile, "utf8").trim();
        if (raw) return Number(raw);
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`cli never reported an exit code: ${args.join(" ")}`);
  })();
  const code = await Promise.race([proc.exited, fromFile]);
  return {
    code,
    stdout: existsSync(out) ? readFileSync(out, "utf8") : "",
    stderr: existsSync(err) ? readFileSync(err, "utf8") : "",
  };
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "cb-daemon-har-"));
  lonelyDir = mkdtempSync(join(tmpdir(), "cb-har-nodaemon-"));
  fixtures = await serveFixtures();
  port = await freePort();
  daemon = Bun.spawn(["bun", "run", CLI, "daemon", "run", "--port", String(port)], {
    env: { ...process.env, CBROWSER_DATA_DIR: dataDir },
    stdout: "ignore",
    stderr: "ignore",
  });
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/ping`, { signal: AbortSignal.timeout(1000) });
      if (r.ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
}, TIMEOUT);

afterAll(async () => {
  try { await fetch(`http://127.0.0.1:${port}/shutdown`, { method: "POST", signal: AbortSignal.timeout(5000) }); } catch { /* exiting */ }
  try { daemon?.kill(); } catch { /* already gone */ }
  await fixtures.close();
  for (const d of [dataDir, lonelyDir]) if (d) rmSync(d, { recursive: true, force: true });
});

describe("HAR through the daemon", () => {
  test("har start, navigate, har stop: the HAR holds the page the daemon loaded", async () => {
    const start = await cli(dataDir, "har", "start");
    expect(start.code, start.stderr).toBe(0);
    const nav = await cli(dataDir, "navigate", `${fixtures.base}keyboard.html`);
    expect(nav.code, nav.stderr).toBe(0);
    const out = join(dataDir, "out.har");
    const stop = await cli(dataDir, "har", "stop", out);
    expect(stop.code, stop.stderr).toBe(0);
    const har = JSON.parse(readFileSync(out, "utf8")) as { log: { entries: Array<{ request: { url: string } }> } };
    expect(har.log.entries.length).toBeGreaterThan(0);
    expect(har.log.entries.some((e) => e.request.url.endsWith("/keyboard.html"))).toBe(true);
  }, TIMEOUT);

  test("stopping when nothing is recording is an error, not an empty HAR", async () => {
    const r = await post("harStop", {});
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/no HAR recording/i);
  }, TIMEOUT);
});

describe("network list through the daemon (same class)", () => {
  test("network list shows what the daemon's browser loaded", async () => {
    const nav = await cli(dataDir, "navigate", `${fixtures.base}animating.html`);
    expect(nav.code, nav.stderr).toBe(0);
    const r = await cli(dataDir, "network", "list");
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain("/animating.html");
  }, TIMEOUT);
});

// The daemon had no authentication and reflected any Origin with credentials: any
// local user, or any web page open on the machine, could drive it (navigate to a
// file:// URL and extract it, write a screenshot or a HAR anywhere the daemon user
// can). Commands now need the token from the 0600 state file. (2026-10-12)
describe("the daemon only obeys a client holding its token", () => {
  const raw = (headers: Record<string, string>, body: unknown, path = "/command") =>
    fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });

  test("the state file holding the token is owner-only (0600)", () => {
    expect(statSync(join(dataDir, "daemon.json")).mode & 0o777).toBe(0o600);
    expect(daemonToken().length).toBeGreaterThanOrEqual(32);
  });

  test("no token or a wrong token: 401, and the command does not run", async () => {
    for (const headers of [{}, { "X-CBrowser-Daemon-Token": "wrong" }, { "X-CBrowser-Daemon-Token": "0".repeat(daemonToken().length) }]) {
      const r = await raw(headers, { command: "networkClear", args: {} });
      expect(r.status).toBe(401);
    }
    // Shutdown is guarded too; the daemon is still up afterwards.
    expect((await raw({}, {}, "/shutdown")).status).toBe(401);
    expect((await fetch(`http://127.0.0.1:${port}/ping`)).ok).toBe(true);
  });

  test("a cross-origin page cannot send the token header (preflight does not allow it)", async () => {
    const r = await fetch(`http://127.0.0.1:${port}/command`, {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,x-cbrowser-daemon-token" },
    });
    expect((r.headers.get("access-control-allow-headers") ?? "").toLowerCase()).not.toContain("x-cbrowser-daemon-token");
  });

  test("harStop never writes a client-chosen path; it returns the HAR to the client", async () => {
    const target = join(lonelyDir, "planted.har");
    await post("harStart", {});
    const r = await post("harStop", { output: target });
    expect(r.success).toBe(true);
    expect(existsSync(target)).toBe(false);
    expect(typeof (r.result as { har?: string }).har).toBe("string");
  });
});

describe("HAR without a daemon", () => {
  test("har start refuses and names the daemon, instead of claiming a recording", async () => {
    const r = await cli(lonelyDir, "har", "start");
    expect(r.code).toBe(1);
    expect(r.stdout).not.toMatch(/HAR recording started/);
    expect(r.stderr).toMatch(/daemon start/);
  }, TIMEOUT);

  test("network list refuses too, instead of 'navigate to a page first'", async () => {
    const r = await cli(lonelyDir, "network", "list");
    expect(r.code).toBe(1);
    expect(r.stdout).not.toMatch(/Navigate to a page first/);
    expect(r.stderr).toMatch(/daemon start/);
  }, TIMEOUT);
});
