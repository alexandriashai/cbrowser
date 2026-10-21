/**
 * The global browser flags reach the commands that hand off to a library
 * function (audit D20/F20, 2026-10-21).
 *
 * ab, ai-visual, cross-browser, diff, responsive, coverage, parallel,
 * repair-tests, flaky-check, perf-baseline and compare-personas called the
 * library without --browser, --device or --viewport (some without --headless),
 * and none checks its flags, so each was accepted, ignored, and the command
 * exited 0. These drive the real CLI against a page that reports what it was
 * given (tests/fixtures/device-report.js), so a flag that is dropped fails here.
 * The subprocess harness is the one in cli-device.test.ts.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startReportServer, type ReportServer } from "./fixtures/report-server.js";

const CLI = resolve(import.meta.dir, "..", "src", "cli.ts");
const TIMEOUT = 120_000;

let server: ReportServer;
let workDir = "";
let runSeq = 0;

interface RunResult { code: number; stdout: string; stderr: string }

async function cli(...args: string[]): Promise<RunResult> {
  const n = runSeq++;
  const outPath = join(workDir, `out-${n}.txt`);
  const errPath = join(workDir, `err-${n}.txt`);
  const codePath = join(workDir, `code-${n}.txt`);
  const proc = Bun.spawn(
    ["bash", "-c", 'bun run "$0" "$@" > "$CB_OUT" 2> "$CB_ERR"; c=$?; echo $c > "$CB_CODE"; exit $c', CLI, ...args],
    {
      env: {
        ...process.env,
        CBROWSER_DATA_DIR: join(workDir, "data"),
        CBROWSER_ARTIFACT_DIR: join(workDir, "artifacts"),
        CB_OUT: outPath, CB_ERR: errPath, CB_CODE: codePath,
      },
      stdout: "ignore",
      stderr: "ignore",
    },
  );
  const fromFile = (async () => {
    for (let i = 0; i < 4800; i++) {
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

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path: string): { width: number; height: number } {
  const b = readFileSync(path);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

const page = () => `${server.base}device-report.html`;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "cbrowser-lib-flags-"));
  server = startReportServer();
});

afterAll(() => {
  server.close();
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

describe("--viewport reaches the visual commands", () => {
  test("ab renders both pages at 400 wide", async () => {
    server.reports.length = 0;
    const out = join(workDir, "ab.json");
    const r = await cli("ab", page(), `${page()}?b`, "--viewport", "400x700", "--output", out);
    expect(r.code, r.stderr + r.stdout).toBe(0);
    const result = JSON.parse(readFileSync(out, "utf8"));
    for (const shot of [result.screenshots.a, result.screenshots.b]) {
      expect(shot.viewport).toEqual({ width: 400, height: 700 });
      // The PNG itself, not only what the result says. 1920 wide before.
      expect(pngSize(shot.screenshotPath)).toEqual({ width: 400, height: 700 });
    }
    expect((await server.waitForReports(2)).map((x) => x.values.width)).toEqual(["400", "400"]);
  }, TIMEOUT);

  test("ai-visual capture with --device and --viewport keeps the device and takes the size", async () => {
    server.reports.length = 0;
    const r = await cli("ai-visual", "capture", page(), "--name", "flags", "--device", "iPhone 15", "--viewport", "400x700");
    expect(r.code, r.stderr + r.stdout).toBe(0);
    expect(r.stdout).toContain("Viewport: 400x700");
    const [report] = await server.waitForReports(1);
    expect(report.values.width).toBe("400");
    expect(report.values.pointer).toBe("coarse");
    expect(report.userAgent).toMatch(/iPhone/);
  }, TIMEOUT);

  test("diff renders at --viewport", async () => {
    server.reports.length = 0;
    const r = await cli("diff", page(), "--browsers", "chromium", "--viewport", "500x600");
    expect(r.code, r.stderr + r.stdout).toBe(0);
    const [report] = await server.waitForReports(1);
    // Playwright's 1280x720 default before.
    expect(report.values.width).toBe("500");
  }, TIMEOUT);
});

describe("--device reaches the test commands", () => {
  test("flaky-check runs every run as the device", async () => {
    server.reports.length = 0;
    const suite = join(workDir, "device.txt");
    writeFileSync(suite, `# Test: Device check\ngo to ${page()}\nverify page contains "pointer:coarse"\n`);
    const out = join(workDir, "flaky.json");
    const r = await cli("flaky-check", suite, "--runs", "1", "--device", "iphone-15", "--output", out);
    expect(r.code, r.stderr + r.stdout).toBe(0);
    const [report] = await server.waitForReports(1);
    expect(report.values.pointer).toBe("coarse");
    expect(report.userAgent).toMatch(/iPhone/);
    expect(JSON.parse(readFileSync(out, "utf8")).testAnalyses[0].passCount).toBe(1);
  }, TIMEOUT);
});

describe("a flag a command cannot honour is refused, not dropped", () => {
  test("diff --browser names --browsers and runs nothing", async () => {
    server.reports.length = 0;
    const r = await cli("diff", page(), "--browsers", "chromium", "--browser", "firefox");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("--browsers");
    expect(server.reports.length).toBe(0);
  }, TIMEOUT);

  test("a malformed --width is an error, not the default size", async () => {
    // parseInt("4OO") || 1920 rendered at 1920 and exited 0.
    server.reports.length = 0;
    const r = await cli("ab", page(), `${page()}?b`, "--width", "4OO");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("--width");
    expect(server.reports.length).toBe(0);
  }, TIMEOUT);
});
