/**
 * The daemon's evaluate is red zone, and so is the CLI path routed through it.
 *
 * Anything on this machine can POST to the daemon, so the CLI's own check is
 * not the boundary: the daemon refuses a script without force before touching
 * the page, and the CLI refuses before the request leaves. Runs a real daemon
 * in its own data dir on a free port, and drives it over HTTP exactly as the
 * CLI does.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createServer } from "node:net";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Subprocess } from "bun";
import { serveFixtures } from "./fixtures/serve-fixtures.js";

const CLI = resolve(import.meta.dir, "..", "src", "cli.ts");
const TIMEOUT = 90_000;
const REFUSAL = /^Red zone action requires --force: evaluate_script/;
const CLICK = "document.querySelector('#delete-account').click(); return 'clicked';";

let dataDir = "";
let port = 0;
let daemon: Subprocess | undefined;
let fixtures: Awaited<ReturnType<typeof serveFixtures>>;

type DaemonResponse = { success: boolean; result?: unknown; error?: string; zone?: string };

async function post(command: string, args: Record<string, unknown>): Promise<DaemonResponse> {
  const res = await fetch(`http://127.0.0.1:${port}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
/**
 * Run the CLI against this file's data dir, so it finds the running daemon.
 * Exit status goes through a file for the reason cli-evaluate-keyboard.test.ts
 * documents: under load neither pipes nor proc.exited reliably settle.
 */
async function cli(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const n = runSeq++;
  const out = join(dataDir, `out-${n}.txt`), err = join(dataDir, `err-${n}.txt`), codeFile = join(dataDir, `code-${n}.txt`);
  const proc = Bun.spawn(
    ["bash", "-c", 'bun run "$0" "$@" > "$CB_OUT" 2> "$CB_ERR"; c=$?; echo $c > "$CB_CODE"; exit $c', CLI, ...args],
    { env: { ...process.env, CBROWSER_DATA_DIR: dataDir, CB_OUT: out, CB_ERR: err, CB_CODE: codeFile }, stdout: "ignore", stderr: "ignore" },
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
  dataDir = mkdtempSync(join(tmpdir(), "cb-daemon-eval-"));
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
  const nav = await post("navigate", { url: `${fixtures.base}red-zone.html` });
  if (!nav.success) throw new Error(`daemon navigate failed: ${nav.error}`);
}, TIMEOUT);

afterAll(async () => {
  try { await fetch(`http://127.0.0.1:${port}/shutdown`, { method: "POST", signal: AbortSignal.timeout(5000) }); } catch { /* exiting */ }
  try { daemon?.kill(); } catch { /* already gone */ }
  await fixtures.close();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

const deleted = async () => (await post("evaluate", { body: "return localStorage.getItem('deleted');", args: [], force: true })).result;

describe("daemon evaluate", () => {
  test("without force it is refused before the page is touched, zone red", async () => {
    await post("evaluate", { body: "localStorage.removeItem('deleted'); return 'ok';", args: [], force: true });
    const r = await post("evaluate", { body: CLICK, args: [] });
    expect(r.success).toBe(false);
    expect(r.zone).toBe("red");
    expect(r.error).toMatch(REFUSAL);
    expect(await deleted()).toBeNull();

    // A truthy non-boolean does not open it.
    const s = await post("evaluate", { body: CLICK, args: [], force: "true" });
    expect(s.success).toBe(false);
    expect(await deleted()).toBeNull();
  }, TIMEOUT);

  test("with force it runs and reports zone red", async () => {
    await post("evaluate", { body: "localStorage.removeItem('deleted'); return 'ok';", args: [], force: true });
    const r = await post("evaluate", { body: CLICK, args: [], force: true });
    expect(r.success).toBe(true);
    expect(r.result).toBe("clicked");
    expect(r.zone).toBe("red");
    expect(await deleted()).toBe("DELETE");
  }, TIMEOUT);
});

describe("CLI evaluate routed through the daemon", () => {
  test("without --force the CLI refuses before the request leaves", async () => {
    const r = await cli("evaluate", "1 + 1");
    expect(r.stdout).toContain("Connected to running daemon");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("Red zone action requires --force: evaluate_script");
    // The daemon's own refusal would arrive as "Daemon error: ..."; this one
    // never reached it.
    expect(r.stderr).not.toContain("Daemon error");
  }, TIMEOUT);

  test("with --force it runs through the daemon", async () => {
    const r = await cli("evaluate", "21 * 2", "--force");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Command executed via daemon");
    expect(r.stdout).toContain("42");
  }, TIMEOUT);
});
