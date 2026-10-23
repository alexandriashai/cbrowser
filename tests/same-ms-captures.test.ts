/**
 * Calls in the same millisecond keep their captures apart.
 *
 * These sites named their files by Date.now() alone, so concurrent calls (the
 * hosted servers run many requests, for many accounts, in one process) wrote
 * one file and each returned or compared it: CBrowser.screenshot's default
 * path, captureVisualBaseline's id, crossBrowserDiff's /tmp capture and
 * writeAuditScreenshot's local copy. Each now carries uniqueStamp()
 * (src/temp-files.ts). The browser calls run in tests/fixtures/same-ms-step.ts
 * with the clock frozen, so a clock-only name collides every time.
 *
 * The temp-dir sites (empathy_audit's two screenshots, attention_analysis,
 * attention_compare, visual_cognitive_story, cognitive_effort, the journey
 * GIF, the perceptual images) run whole tool calls and are covered by the
 * helper's tests (tests/temp-files.test.ts), the scan that they use it
 * (tests/no-clock-named-paths.test.ts) and, for the perceptual images,
 * tests/perceptual-temp-files.test.ts.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STEP = new URL("./fixtures/same-ms-step.ts", import.meta.url).pathname;
const work = mkdtempSync(join(tmpdir(), "cb-same-ms-"));
const COLORS = ["#dc2626", "#16a34a", "#2563eb", "#9333ea"];
let server: ReturnType<typeof Bun.serve>;
let urls: string[] = [];

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const i = Number(new URL(req.url).pathname.slice(2));
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page ${i}</title></head>
<body style="margin:0;background:${COLORS[i] ?? "#000"}"><h1 style="font:64px sans-serif;color:#fff">Page ${i}</h1></body></html>`;
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    },
  });
  urls = COLORS.map((_, i) => `http://127.0.0.1:${server.port}/p${i}`);
});
afterAll(() => {
  server?.stop(true);
  try { rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }
});

type Written = { url: string; path: string; sha256: string | null };

async function step(kind: string, pages: string[]): Promise<{ written: Written[]; dataDir: string; tmp: string }> {
  const dataDir = mkdtempSync(join(work, `${kind}-data-`));
  const tmp = mkdtempSync(join(work, `${kind}-tmp-`));
  const out = join(work, `${kind}.json`);
  const proc = Bun.spawn([process.execPath, "run", STEP, kind, out, ...pages], {
    env: { ...process.env, CBROWSER_DATA_DIR: dataDir, TMPDIR: tmp },
    stdout: "ignore",
    stderr: "pipe",
  });
  const code = await proc.exited;
  const stderr = await new Response(proc.stderr).text();
  const parsed = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : { ok: false, error: stderr.slice(-2000) };
  expect({ kind, code, error: parsed.ok ? undefined : parsed.error }).toEqual({ kind, code: 0, error: undefined });
  return { written: parsed.result, dataDir, tmp };
}

function expectApart(written: Written[], n: number) {
  expect(written).toHaveLength(n);
  // One file per call, each written once and holding its own page.
  expect(new Set(written.map((w) => w.path)).size).toBe(n);
  expect(written.every((w) => w.sha256 !== null)).toBe(true);
  expect(new Set(written.map((w) => w.sha256)).size).toBe(n);
}

describe("browser captures in one frozen millisecond", () => {
  test("CBrowser.screenshot(): 4 browsers, 4 pages, 4 files", async () => {
    const { written, dataDir } = await step("screenshot", urls);
    expectApart(written, 4);
    for (const w of written) expect(w.path.startsWith(dataDir)).toBe(true);
  }, 120_000);

  test("captureVisualBaseline: one name, 4 pages, 4 baselines", async () => {
    const { written } = await step("baseline", urls);
    expectApart(written, 4);
  }, 120_000);

  test("crossBrowserDiff: 2 calls, 2 captures, in the account's data dir and not the shared temp dir", async () => {
    const { written, dataDir, tmp } = await step("crossdiff", urls.slice(0, 2));
    expectApart(written, 2);
    for (const w of written) {
      // The old path was a literal /tmp/ one, outside the data dir.
      expect(w.path.startsWith(dataDir)).toBe(true);
      expect(w.path.startsWith(tmp)).toBe(false);
    }
  }, 120_000);
});

describe("writeAuditScreenshot in one frozen millisecond", () => {
  test("8 audits of one persona write 8 local copies, each with its own bytes", async () => {
    const dataDir = mkdtempSync(join(work, "audit-data-"));
    const artifactDir = mkdtempSync(join(work, "audit-art-"));
    const saved = { data: process.env.CBROWSER_DATA_DIR, art: process.env.CBROWSER_ARTIFACT_DIR };
    process.env.CBROWSER_DATA_DIR = dataDir;
    process.env.CBROWSER_ARTIFACT_DIR = artifactDir;
    const { writeAuditScreenshot } = await import("../src/mcp-tools/base/audit-tools.js");
    const realNow = Date.now;
    Date.now = () => 1_700_000_000_000;
    try {
      const results = Array.from({ length: 8 }, (_, i) =>
        writeAuditScreenshot(Buffer.from(`audit ${i}`).toString("base64"), "first-timer"));
      const paths = results.map((r) => r.path);
      expect(paths.every((p) => typeof p === "string" && p.startsWith(dataDir))).toBe(true);
      expect(new Set(paths).size).toBe(8);
      paths.forEach((p, i) => expect(readFileSync(p!, "utf8")).toBe(`audit ${i}`));
    } finally {
      Date.now = realNow;
      if (saved.data === undefined) delete process.env.CBROWSER_DATA_DIR; else process.env.CBROWSER_DATA_DIR = saved.data;
      if (saved.art === undefined) delete process.env.CBROWSER_ARTIFACT_DIR; else process.env.CBROWSER_ARTIFACT_DIR = saved.art;
    }
  }, 60_000);
});
