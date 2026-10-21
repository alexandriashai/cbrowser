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
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Subprocess } from "bun";
import { serveFixtures } from "./fixtures/serve-fixtures.js";

const CLI = resolve(import.meta.dir, "..", "src", "cli.ts");
const TIMEOUT = 90_000;

let dataDir = "";
let staleIno = 0;
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
  // A leftover state file, world-readable: the daemon must replace it with a new
  // 0600 file, never write the token into this one and chmod afterwards.
  writeFileSync(join(dataDir, "daemon.json"), "{}", { mode: 0o644 });
  staleIno = statSync(join(dataDir, "daemon.json")).ino;
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

  test("the state file holding the token is owner-only (0600), a new file, not the old one chmod'ed", () => {
    expect(statSync(join(dataDir, "daemon.json")).mode & 0o777).toBe(0o600);
    expect(statSync(join(dataDir, "daemon.json")).ino).not.toBe(staleIno);
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

// If the daemon dies and another local user binds its port, a client that trusted
// /ping would hand that process the token and obey its answers.
describe("the client only talks to a daemon that proves it holds the token", () => {
  test("an impostor on the recorded port never receives the token", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cb-impostor-"));
    const seen: string[] = [];
    const impostor = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req) => {
      const tok = req.headers.get("x-cbrowser-daemon-token");
      if (tok) seen.push(tok);
      if (new URL(req.url).pathname === "/ping") return Response.json({ status: "ok", uptime: 1 });
      return Response.json({ success: true, result: { file: "/tmp/x", har: "planted" } });
    } });
    try {
      const token = "a".repeat(64);
      writeFileSync(join(dir, "daemon.json"), JSON.stringify({ pid: process.pid, port: impostor.port, startedAt: "", lastActivity: "", token }), { mode: 0o600 });
      // Run the real client in a child with this data dir. Async: spawnSync would block
      // this process, the impostor could not answer, and the test would pass vacuously.
      const probe = Bun.spawn(["bun", "-e", `
        const d = await import(${JSON.stringify(resolve(import.meta.dir, "..", "src", "daemon.ts"))});
        const running = await d.isDaemonRunning();
        const r = await d.sendToDaemon("harStop", {});
        console.log(JSON.stringify({ running, success: r.success, error: r.error ?? null }));`], { env: { ...process.env, CBROWSER_DATA_DIR: dir }, stdout: "pipe", stderr: "pipe" });
      await probe.exited;
      const text = (await new Response(probe.stdout).text()).trim();
      const out = JSON.parse(text.split("\n").pop() || "null");
      expect(out, "the client probe must report").not.toBeNull();
      expect(out.running).toBe(false);
      expect(out.success).toBe(false);
      expect(seen).toEqual([]);
    } finally {
      impostor.stop(true);
      rmSync(dir, { recursive: true, force: true });
    }
  }, TIMEOUT);
});

// cbrowser console (2026-10-12): the MCP get_console_messages, from the CLI. Served by
// the daemon for the same reason as har and network: a fresh process has no tab.
describe("console through the daemon", () => {
  test("lists what the page logged; --filter error keeps only errors; --clear empties it", async () => {
    const nav = await cli(dataDir, "navigate", `${fixtures.base}console.html`);
    expect(nav.code, nav.stderr).toBe(0);
    const all = await cli(dataDir, "console");
    expect(all.code, all.stderr).toBe(0);
    for (const s of ["hello-log", "careful-warn", "boom-error"]) expect(all.stdout).toContain(s);
    expect(all.stdout).toContain("console.html");
    const errors = await cli(dataDir, "console", "--filter", "error");
    expect(errors.code, errors.stderr).toBe(0);
    expect(errors.stdout).toContain("boom-error");
    expect(errors.stdout).not.toContain("hello-log");
    const json = await cli(dataDir, "console", "--json");
    const parsed = JSON.parse(json.stdout.slice(json.stdout.indexOf("{")));
    expect(parsed.count).toBeGreaterThanOrEqual(3);
    expect(parsed.messages.some((m: { type: string; text: string }) => m.type === "error" && m.text === "boom-error")).toBe(true);
    const cleared = await cli(dataDir, "console", "--clear");
    expect(cleared.code, cleared.stderr).toBe(0);
    const after = await cli(dataDir, "console");
    expect(after.stdout).not.toContain("boom-error");
  }, TIMEOUT);

  test("the daemon serves consoleMessages directly (token required, filter checked)", async () => {
    expect((await post("navigate", { url: `${fixtures.base}console.html` })).success).toBe(true);
    const warn = await post("consoleMessages", { filter: "warning" });
    expect(warn.success).toBe(true);
    const r = warn.result as { messages: Array<{ type: string; text: string }>; count: number };
    expect(r.messages.map((m) => m.text)).toContain("careful-warn");
    expect(r.messages.every((m) => m.type === "warning")).toBe(true);
    const bad = await post("consoleMessages", { filter: "bogus" });
    expect(bad.success).toBe(false);
    const noToken = await fetch(`http://127.0.0.1:${port}/command`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: "consoleMessages", args: {} }) });
    expect(noToken.status).toBe(401);
  }, TIMEOUT);

  test("a page's escape sequences reach the terminal as visible text, never raw", async () => {
    expect((await cli(dataDir, "navigate", `${fixtures.base}console.html`)).code).toBe(0);
    const r = await cli(dataDir, "console");
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain("hostile-");
    expect(r.stdout).not.toMatch(/[\u001b\u0007\u009b]/);
    expect(r.stdout).toContain("\\x1b]52");
  }, TIMEOUT);

  test("an unknown --filter value is refused, not silently ignored", async () => {
    const r = await cli(dataDir, "console", "--filter", "errors");
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/--filter/);
  }, TIMEOUT);
});

// The daemon path wrapped the script in a function body and, if "return" appeared
// anywhere, ran it as statements: an IIFE's value was dropped. (2026-10-13)
describe("evaluate through the daemon keeps function results", () => {
  for (const script of ["(function(){ return document.title })()", "function t(){ return document.title }; t()", "[document.title].map(function(t){ return t })[0]"]) {
    test(script, async () => {
      expect((await cli(dataDir, "navigate", `${fixtures.base}keyboard.html`)).code).toBe(0);
      const r = await cli(dataDir, "evaluate", script, "--force");
      expect(r.code, r.stderr).toBe(0);
      expect(r.stdout).toContain("Keyboard fixture");
    }, TIMEOUT);
  }

  // A daemon result was printed only when truthy, so 0, false and "" vanished.
  // Printed as the local path prints them: "" is an empty line, not '""'.
  for (const [script, printed] of [["1 - 1", "0"], ["false", "false"], ['""', ""]]) {
    test(`a falsy result still prints: ${script}`, async () => {
      expect((await cli(dataDir, "navigate", `${fixtures.base}keyboard.html`)).code).toBe(0);
      const r = await cli(dataDir, "evaluate", script, "--force");
      expect(r.code, r.stderr).toBe(0);
      expect(r.stdout.trim().split("\n").pop()).toBe(printed);
    }, TIMEOUT);
  }

  // Audit 2026-10-21: the daemon route sent only the script, so these flags
  // did nothing while a daemon was running.
  test("--arg reaches the script", async () => {
    const r = await cli(dataDir, "evaluate", "(a, b) => a + b", "--arg", "40", "--arg", "2", "--force");
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe("42");
  }, TIMEOUT);

  test("--url navigates the daemon's page first", async () => {
    const r = await cli(dataDir, "evaluate", "document.title", "--url", `${fixtures.base}static.html`, "--raw", "--force");
    expect(r.code, r.stderr).toBe(0);
    // static.html's own title, read from the fixture rather than compared with
    // another daemon read (that version passed on the old route too).
    const want = readFileSync(join(import.meta.dir, "fixtures", "static.html"), "utf8").match(/<title>([^<]*)<\/title>/)![1];
    expect(r.stdout.trim()).toBe(want);
  }, TIMEOUT);

  test("--expect-truthy fails on a falsy result", async () => {
    const r = await cli(dataDir, "evaluate", "0", "--expect-truthy", "--force");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("Expected a truthy result");
  }, TIMEOUT);

  test("--json keeps a string's quotes, --raw does not", async () => {
    const j = await cli(dataDir, "evaluate", "'hi'", "--json", "--force");
    expect(j.stdout.trim()).toBe('"hi"');
    const raw = await cli(dataDir, "evaluate", "'hi'", "--raw", "--force");
    expect(raw.stdout.trim()).toBe("hi");
  }, TIMEOUT);

  test("--wait-for with --timeout fails on a selector that never appears", async () => {
    const r = await cli(dataDir, "evaluate", "1", "--wait-for", "#never-there", "--timeout", "500", "--force");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("#never-there");
  }, TIMEOUT);
});

/**
 * Routed commands report what happened (audit 2026-10-21, daemon lane 1, 2,
 * 5, 11, 25). The daemon answered success: true whenever nothing threw, so a
 * refused or failed click exited 0 with a daemon and 1 without one.
 */
describe("commands routed through the daemon", () => {
  test("a refused click exits 1", async () => {
    const r = await cli(dataDir, "click", "#delete-account", "--url", `${fixtures.base}red-zone.html`);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/red zone|--force/i);
  }, TIMEOUT);

  test("a click on a missing element exits 1", async () => {
    const r = await cli(dataDir, "click", "#no-such-element-anywhere", "--url", `${fixtures.base}static.html`);
    expect(r.code).toBe(1);
  }, TIMEOUT);

  test("--url is honoured, and a relative screenshot path lands where the user is", async () => {
    const name = `daemon-rel-${Date.now()}.png`;
    const r = await cli(dataDir, "screenshot", name, "--url", `${fixtures.base}static.html`);
    expect(r.code, r.stderr).toBe(0);
    const where = join(process.cwd(), name);
    expect(existsSync(where)).toBe(true);
    rmSync(where, { force: true });
    const title = await cli(dataDir, "evaluate", "document.title", "--raw", "--force");
    const want = readFileSync(join(import.meta.dir, "fixtures", "static.html"), "utf8").match(/<title>([^<]*)<\/title>/)![1];
    expect(title.stdout.trim()).toBe(want);
  }, TIMEOUT);

  test("the eval alias works through the daemon", async () => {
    const r = await cli(dataDir, "eval", "20 + 22", "--force");
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe("42");
  }, TIMEOUT);

  test("extract prints the data, as without a daemon", async () => {
    const r = await cli(dataDir, "extract", "links", "--url", `${fixtures.base}static.html`);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).not.toContain('"screenshot"');
  }, TIMEOUT);

  test("capture start through the daemon refuses a size it cannot apply", async () => {
    const r = await cli(dataDir, "capture", "start", `${fixtures.base}static.html`, "--viewport", "390x844");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("cannot change a running daemon");
  }, TIMEOUT);

  test("network list: newest first, --filter, and --json", async () => {
    await cli(dataDir, "network", "clear");
    expect((await cli(dataDir, "navigate", `${fixtures.base}static.html`)).code).toBe(0);
    expect((await cli(dataDir, "navigate", `${fixtures.base}keyboard.html`)).code).toBe(0);
    const r = await cli(dataDir, "network", "list", "--json");
    expect(r.code, r.stderr).toBe(0);
    const list = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))) as { requests: Array<{ url: string }> };
    const urls = list.requests.map((q) => q.url);
    expect(urls.findIndex((u) => u.endsWith("keyboard.html"))).toBeLessThan(urls.findIndex((u) => u.endsWith("static.html")));
    const f = await cli(dataDir, "network", "list", "--json", "--filter", "static.html");
    const only = JSON.parse(f.stdout.slice(f.stdout.indexOf("{"))) as { requests: Array<{ url: string }> };
    expect(only.requests.length).toBeGreaterThan(0);
    expect(only.requests.every((q) => q.url.includes("static.html"))).toBe(true);
  }, TIMEOUT);

  test("a page command the daemon does not run is refused, not run in a second browser", async () => {
    const r = await cli(dataDir, "a11y", "audit", `${fixtures.base}static.html`);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("cannot run while the daemon holds the browser");
  }, TIMEOUT);

  test("keyboard --repeat 0 is refused before it reaches the daemon", async () => {
    const r = await cli(dataDir, "keyboard", "Tab", "--repeat", "0");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("--repeat must be a positive integer");
  }, TIMEOUT);
});

describe("HAR without a daemon", () => {
  test("har start refuses and names the daemon, instead of claiming a recording", async () => {
    const r = await cli(lonelyDir, "har", "start");
    expect(r.code).toBe(1);
    expect(r.stdout).not.toMatch(/HAR recording started/);
    expect(r.stderr).toMatch(/daemon start/);
  }, TIMEOUT);

  test("console refuses too, and names the daemon", async () => {
    const r = await cli(lonelyDir, "console");
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/daemon start/);
  }, TIMEOUT);

  test("network list refuses too, instead of 'navigate to a page first'", async () => {
    const r = await cli(lonelyDir, "network", "list");
    expect(r.code).toBe(1);
    expect(r.stdout).not.toMatch(/Navigate to a page first/);
    expect(r.stderr).toMatch(/daemon start/);
  }, TIMEOUT);
});
