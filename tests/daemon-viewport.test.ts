/**
 * `daemon start --device --viewport` (2026-10-21). The daemon's browser used to
 * start with defaults whatever `daemon start` was given (it forwarded only
 * --port), and a command run through the daemon ignored its own --device and
 * --viewport without a word.
 *
 * Drives the real path a user takes: a detached daemon from `daemon start`,
 * then separate CLI invocations. The subprocess harness is the one in
 * cli-evaluate-keyboard.test.ts; its comments explain the exit-code file.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer } from "node:net";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { serveFixtures } from "./fixtures/serve-fixtures.js";

const CLI = resolve(import.meta.dir, "..", "src", "cli.ts");
const TIMEOUT = 60_000;
const SIZE = "innerWidth + 'x' + innerHeight + ' dpr' + devicePixelRatio + ' touch' + (navigator.maxTouchPoints > 0)";

let fixtures: Awaited<ReturnType<typeof serveFixtures>>;
let dataDir = "";
let lonelyDir = "";
let port = 0;
let runSeq = 0;

async function freePort(): Promise<number> {
  return await new Promise((r) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => r(p));
    });
  });
}

async function cli(dir: string, ...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const n = runSeq++;
  const outPath = join(dir, `out-${n}.txt`);
  const errPath = join(dir, `err-${n}.txt`);
  const codePath = join(dir, `code-${n}.txt`);
  const proc = Bun.spawn(
    ["bash", "-c", 'bun run "$0" "$@" > "$CB_OUT" 2> "$CB_ERR"; c=$?; echo $c > "$CB_CODE"; exit $c', CLI, ...args],
    {
      env: { ...process.env, CBROWSER_DATA_DIR: dir, CB_OUT: outPath, CB_ERR: errPath, CB_CODE: codePath },
      stdout: "ignore",
      stderr: "ignore",
    },
  );
  const fromFile = (async () => {
    for (let i = 0; i < 1800; i++) {
      if (existsSync(codePath)) {
        const raw = readFileSync(codePath, "utf8").trim();
        if (raw) return Number(raw);
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`cli never reported an exit code: ${args.join(" ")}`);
  })();
  const code = await Promise.race([proc.exited, fromFile]);
  return {
    code,
    stdout: existsSync(outPath) ? readFileSync(outPath, "utf8") : "",
    stderr: existsSync(errPath) ? readFileSync(errPath, "utf8") : "",
  };
}

const lastLine = (s: string): string => s.trim().split("\n").pop() ?? "";

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "cb-daemon-viewport-"));
  lonelyDir = mkdtempSync(join(tmpdir(), "cb-daemon-viewport-bad-"));
  fixtures = await serveFixtures();
  port = await freePort();
}, TIMEOUT);

afterAll(async () => {
  for (const dir of [dataDir, lonelyDir]) {
    await cli(dir, "daemon", "stop").catch(() => {});
    // If stop could not verify it, end the process the state file names.
    try {
      const state = JSON.parse(readFileSync(join(dir, "daemon.json"), "utf8"));
      if (state.pid) process.kill(state.pid);
    } catch { /* stopped, or never started */ }
  }
  await fixtures.close();
  for (const d of [dataDir, lonelyDir]) if (d) rmSync(d, { recursive: true, force: true });
});

describe("daemon start --device --viewport", () => {
  test("the daemon's browser takes the device and size it was started with", async () => {
    const start = await cli(dataDir, "daemon", "start", "--port", String(port), "--device", "iPhone 16", "--viewport", "500x700");
    expect(start.code, start.stdout + start.stderr).toBe(0);
    expect((await cli(dataDir, "navigate", `${fixtures.base}static.html`)).code).toBe(0);
    const r = await cli(dataDir, "evaluate", SIZE, "--force");
    expect(r.code, r.stderr).toBe(0);
    // The daemon prints its result as JSON, so the string keeps its quotes.
    expect(lastLine(r.stdout)).toBe('"500x700 dpr3 touchtrue"');
  }, TIMEOUT * 2);

  test("a command the daemon runs says its own --viewport does not apply", async () => {
    const r = await cli(dataDir, "evaluate", "innerWidth", "--viewport", "800x600", "--force");
    expect(r.code, r.stderr).toBe(0);
    expect(r.stderr).toContain("do not apply to commands the daemon runs");
    expect(lastLine(r.stdout)).toBe("500");
  }, TIMEOUT);

  test("starting again with new flags says they were not applied", async () => {
    const r = await cli(dataDir, "daemon", "start", "--port", String(port), "--viewport", "800x600");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("already running");
    expect(r.stderr).toContain("were not applied");
  }, TIMEOUT);

  test("an unknown device fails before a daemon starts", async () => {
    const r = await cli(lonelyDir, "daemon", "start", "--port", String(await freePort()), "--device", "iphone-99");
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain("iphone-99");
    expect(existsSync(join(lonelyDir, "daemon.json"))).toBe(false);
  }, TIMEOUT);
});
