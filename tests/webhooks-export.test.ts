/**
 * Webhooks fire and `export` finds results (audit O17, 2026-10-21).
 *
 * `webhook add` wrote webhooks.json and no command ever sent an event, and
 * `export junit|tap` read <dataDir>/results/<name>.json, which nothing wrote,
 * so both documented feature groups did nothing. These drive the real CLI: a
 * test-suite run must reach a local receiver, and export must name the test
 * the run actually ran. The subprocess harness is the one in cli-device.test.ts.
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
let dataDir = "";
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
        CBROWSER_DATA_DIR: dataDir,
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

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "cbrowser-webhooks-"));
  dataDir = join(workDir, "data");
  // Set before src is imported below, so nothing touches ~/.cbrowser.
  process.env.CBROWSER_DATA_DIR = dataDir;
  process.env.CBROWSER_ARTIFACT_DIR = join(workDir, "artifacts");
  server = startReportServer();
});

afterAll(() => {
  server.close();
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

describe("test-suite runs reach webhooks and export", () => {
  test("a run POSTs its event to the webhook", async () => {
    expect((await cli("webhook", "add", "ci", `${server.base}hook`, "--events", "test.pass,test.fail")).code).toBe(0);
    // Nothing listening on port 1: the send fails and the run must not.
    expect((await cli("webhook", "add", "down", "http://127.0.0.1:1/hook", "--events", "test.pass")).code).toBe(0);

    const suiteFile = join(workDir, "checkout-flow.txt");
    writeFileSync(suiteFile, [
      "# Test: Report renders & says pointer",
      `go to ${server.base}device-report.html`,
      'verify page contains "pointer:"',
      "",
    ].join("\n"));

    const run = await cli("test-suite", suiteFile);
    expect(run.code, run.stderr + run.stdout).toBe(0);

    // The receiver got one JSON POST naming the suite and its result.
    const posts = server.posts.filter((p) => p.path === "/hook");
    expect(posts.length).toBe(1);
    expect(posts[0].contentType).toContain("application/json");
    expect(posts[0].body).toMatchObject({
      event: "test.pass",
      suite: "checkout-flow",
      summary: { total: 1, passed: 1, failed: 0 },
    });
    // The dead webhook is a warning by name, never its URL, and not a failure.
    expect(run.stderr).toContain('webhook "down"');
    expect(run.stderr).not.toContain("127.0.0.1:1");
  }, TIMEOUT);

  // Reads what the run above saved.
  test("export junit and tap name the test that run ran", async () => {
    const xmlPath = join(workDir, "junit.xml");
    const junit = await cli("export", "junit", "checkout-flow", xmlPath);
    expect(junit.code, junit.stderr + junit.stdout).toBe(0);
    const xml = readFileSync(xmlPath, "utf8");
    expect(xml).toContain('<testsuite name="checkout-flow" tests="1" failures="0">');
    expect(xml).toContain('<testcase name="Report renders &amp; says pointer"');

    const tapPath = join(workDir, "out.tap");
    const tap = await cli("export", "tap", "checkout-flow", tapPath);
    expect(tap.code, tap.stderr).toBe(0);
    expect(readFileSync(tapPath, "utf8")).toContain("ok 1 Report renders & says pointer");
  }, TIMEOUT);
});

describe("webhook add refuses what could never be sent", () => {
  test("a URL that is not http(s)", async () => {
    const r = await cli("webhook", "add", "x", "file:///etc/passwd");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("http or https");
  }, TIMEOUT);

  test("a URL carrying a user name and password", async () => {
    const r = await cli("webhook", "add", "x", "https://user:secret@example.com/hook");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("password");
  }, TIMEOUT);

  test("an event no command sends", async () => {
    // journey.complete was refused here until cognitive-journey sent it (20.0).
    const r = await cli("webhook", "add", "x", "https://example.com/hook", "--events", "test.skip");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("test.skip");
  }, TIMEOUT);
});

describe("the sender never holds or fails the run", () => {
  test("a receiver that never answers times out, and the send returns instead of throwing", async () => {
    const { sendWebhookEvent } = await import("../src/webhooks.js");
    const silent = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Promise<Response>(() => {}) });
    const dir = mkdtempSync(join(workDir, "silent-"));
    writeFileSync(join(dir, "webhooks.json"), JSON.stringify([
      { name: "silent", url: `http://127.0.0.1:${silent.port}/`, events: ["test.fail"], format: "generic" },
      { name: "ftp", url: "ftp://example.com/", events: ["test.fail"], format: "generic" },
    ]));
    const started = Date.now();
    const result = await sendWebhookEvent(dir, "test.fail", {
      suite: "s", summary: { total: 1, passed: 0, failed: 1, skipped: 0 }, failedTests: [{ name: "t" }],
    }, { timeoutMs: 300, quiet: true });
    silent.stop(true);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(result.sent).toEqual([]);
    expect(result.failed.map((f) => f.name)).toEqual(["silent", "ftp"]);
    expect(result.failed[0].reason).toContain("no answer");
    expect(result.failed[1].reason).toContain("http or https");
  }, TIMEOUT);
});
