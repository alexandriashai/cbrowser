/**
 * Crawl the CTC reference set: what extractPageMetrics measures on real pages.
 *
 * ## Why this exists
 *
 * totalCTC was a logistic of the raw transport cost with a hand-set slope (2.5)
 * and centre (1.2). Nothing tied either number to anything, so nothing said
 * where real pages land on it. Measured on the pages this script collects, it
 * used little of its range at the first screen: half of all (page, persona)
 * scores fell between 0.055 and 0.133, and 90% below 0.503
 * (research/ctc-21-deltas.md). 21.x replaces it with a percentile: a page's raw
 * cost for a persona, ranked among the raw costs of real pages for the
 * built-in personas. That needs real pages, and this script measures them.
 *
 * ## What it stores, and what it does not
 *
 * It stores the page METRICS (the output of extractPageMetrics), never a CTC
 * score. The percentile curve is re-derived from these metrics through the live
 * chain, so a change to any chain constant moves the curve with it instead of
 * leaving a table of scores computed by a chain that no longer exists.
 *
 * ## Measured the way the tools measure
 *
 * cbrowser's own browser (CBrowser, headless, 1920x1080: the config default the
 * hosted tools run at), its own navigate(), the same blocked-page check
 * cognitive_effort applies before it scores anything, ONE geometry measurement
 * shared by both scopes, then extractPageMetrics at `viewport` (what
 * cognitive_effort measures by default, before anything scrolls) and at
 * `full_page` (site_cognitive_assessment's default, and the aggregate half of
 * cognitive_effort's `sequential`).
 *
 * ## Outcome taxonomy (from research/benchmark/rerun.ts, and for the same reason)
 *
 *   graded   the page loaded and was measured
 *   blocked  the page did not really load: an HTTP error, a bot challenge (the
 *            tool's own signature list), or 0 interactive elements on the whole
 *            document. NOT an easy page: an absent measurement. Kept out of the
 *            reference, because a challenge page scores as nearly free and
 *            would drag every percentile up.
 *   error    navigation failure, crash or timeout
 *
 * Usage (as the tree's owner, never root):
 *   bun research/ctc-reference/crawl.ts [--concurrency 4] [--limit N]
 *   bun research/ctc-reference/crawl.ts --resume <crawl.jsonl>
 *   bun research/ctc-reference/crawl.ts --one <url>      (one site, JSON on stdout)
 *
 * --resume keeps every graded and blocked row of an earlier raw file and
 * crawls the rest again, once. It exists because the 2026-10-22 run lost 127
 * sites to "no result": the source tree was edited mid-crawl and the worker
 * processes could no longer import it. Those were never measured, so they are
 * re-crawled; nothing that was measured is re-run or overwritten.
 *
 * Writes research/ctc-reference/results/crawl-<date>.jsonl (raw, untracked) and
 * src/data/ctc-reference-<date>.ts (the shipped reference).
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, execFileSync } from "node:child_process";

interface Site { site: string; url: string; industry: string }
type Outcome = "graded" | "blocked" | "error";

const ROOT = join(import.meta.dir, "..", "..");
const OUT = join(import.meta.dir, "results");
const VIEWPORT = { width: 1920, height: 1080 };
/** One page, two extractions and a browser launch; generous, and still a ceiling. */
const SITE_CEILING_MS = 150_000;
const MARK = "@@CTC-REF@@";

/**
 * cognitive_effort's blocked-page signatures, verbatim
 * (src/mcp-tools/base/persona-comparison-tools.ts, BLOCK_SIGNATURES).
 * Duplicated rather than imported because the tool keeps them inside its
 * handler; tests/ctc-reference.test.ts reads both and fails if they drift.
 */
export const BLOCK_SIGNATURES = [
  'access denied', '403 forbidden', 'just a moment', 'press & hold',
  'verify you are human', 'captcha', 'blocked', 'robot check',
  'cloudflare', 'please wait', 'checking your browser',
];

async function crawlOne(url: string): Promise<Record<string, unknown>> {
  const dataDir = mkdtempSync(join(tmpdir(), "ctc-ref-"));
  process.env.CBROWSER_DATA_DIR = dataDir;
  delete process.env.CBROWSER_PROXY;
  delete process.env.CBROWSER_PROXY_SERVER;
  const { CBrowser } = await import("../../src/browser.js");
  const { extractPageMetrics, measurePageGeometry } = await import("../../src/visual/cognitive-transport.js");
  const b = new CBrowser({ headless: true, viewportWidth: VIEWPORT.width, viewportHeight: VIEWPORT.height, dataDir });
  try {
    await b.navigate(`https://${url}`);
    const page = await b.getPage();
    const finalUrl = page.url();
    const pageTitle = await page.title().catch(() => "");
    const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || "").catch(() => "");
    const httpStatus = await page.evaluate(() => {
      const perf = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      return perf?.responseStatus || 200;
    }).catch(() => 200);
    const measured = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    const lower = `${pageTitle}\n${bodyText}`.toLowerCase();
    const signature = BLOCK_SIGNATURES.find((s) => lower.includes(s));
    if (httpStatus >= 400 || signature) {
      return { outcome: "blocked", finalUrl, httpStatus, detail: signature ? `signature "${signature}"` : `HTTP ${httpStatus}`, pageTitle };
    }
    // Viewport first: it is what cognitive_effort measures right after
    // navigation, before anything has scrolled. full_page then walks the page
    // (lazy content), as the tool does at that scope.
    const geometry = await measurePageGeometry(page);
    const viewport = await extractPageMetrics(page, "viewport", geometry);
    const full_page = await extractPageMetrics(page, "full_page", geometry);
    if (full_page.interactiveElementCount === 0) {
      return { outcome: "blocked", finalUrl, httpStatus, detail: "0 interactive elements on the whole document", pageTitle };
    }
    return { outcome: "graded", finalUrl, httpStatus, pageTitle, measuredViewport: measured, geometry, metrics: { viewport, full_page } };
  } catch (e) {
    return { outcome: "error", detail: String((e as Error).message ?? e).split("\n")[0].slice(0, 200) };
  } finally {
    await b.close().catch(() => {});
    try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

function runOne(s: Site): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn("bun", [join(import.meta.dir, "crawl.ts"), "--one", s.url], { cwd: ROOT, env: process.env });
    let out = "";
    p.stdout.on("data", (d) => { out += d.toString(); });
    p.stderr.on("data", () => { /* page console noise; the outcome is on stdout */ });
    const killer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* gone */ } }, SITE_CEILING_MS);
    p.on("close", () => {
      clearTimeout(killer);
      const ms = Date.now() - t0;
      const line = out.split("\n").find((l) => l.startsWith(MARK));
      if (!line) return resolve({ ...s, outcome: "error", detail: ms >= SITE_CEILING_MS ? "timeout" : "no result", ms });
      try { resolve({ ...s, ...JSON.parse(line.slice(MARK.length)), ms }); }
      catch { resolve({ ...s, outcome: "error", detail: "unparseable result", ms }); }
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--one") {
    const r = await crawlOne(args[1]);
    process.stdout.write(`${MARK}${JSON.stringify(r)}\n`);
    process.exit(0);
  }
  const arg = (n: string, d: number) => (args.includes(n) ? Number(args[args.indexOf(n) + 1]) : d);
  const concurrency = arg("--concurrency", 4);
  const limit = arg("--limit", Infinity);
  const sites: Site[] = JSON.parse(readFileSync(join(ROOT, "research", "benchmark", "sites.json"), "utf8"));
  const todo = sites.slice(0, limit === Infinity ? sites.length : limit);
  const resumeFrom = args.includes("--resume") ? args[args.indexOf("--resume") + 1] : undefined;
  const kept = new Map<string, Record<string, unknown>>();
  if (resumeFrom) {
    for (const line of readFileSync(resumeFrom, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const r = JSON.parse(line) as Record<string, unknown>;
      if (r.outcome === "graded" || r.outcome === "blocked") kept.set(String(r.url), r);
    }
  }
  // The dataset is dated by the first crawl when resuming: it is one crawl, completed.
  const date = resumeFrom ? (resumeFrom.match(/crawl-(\d{4}-\d{2}-\d{2})\.jsonl$/)?.[1] ?? new Date().toISOString().slice(0, 10)) : new Date().toISOString().slice(0, 10);
  mkdirSync(OUT, { recursive: true });
  const rawPath = join(OUT, resumeFrom ? `crawl-${date}-resumed.jsonl` : `crawl-${date}.jsonl`);
  writeFileSync(rawPath, "");

  const rows: Array<Record<string, unknown>> = todo.map((s) => kept.get(s.url) as Record<string, unknown>);
  const pending = todo.map((_, i) => i).filter((i) => !rows[i]);
  for (const r of rows) if (r) writeFileSync(rawPath, `${JSON.stringify(r)}\n`, { flag: "a" });
  let next = 0, done = 0;
  async function worker() {
    while (next < pending.length) {
      const i = pending[next++];
      const r = await runOne(todo[i]);
      rows[i] = r;
      writeFileSync(rawPath, `${JSON.stringify(r)}\n`, { flag: "a" });
      done++;
      if (done % 10 === 0) console.log(`  ${done}/${pending.length}`);
    }
  }
  console.log(`crawling ${pending.length} of ${todo.length} sites (${kept.size} kept from ${resumeFrom ?? "nothing"}), concurrency ${concurrency}, ${VIEWPORT.width}x${VIEWPORT.height}`);
  await Promise.all(Array.from({ length: concurrency }, worker));

  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
  let gitHead = "unknown";
  try { gitHead = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT }).toString().trim(); } catch { /* not a repo */ }
  const count = (o: Outcome) => rows.filter((r) => r.outcome === o).length;
  const dataset = {
    id: `ctc-reference-${date}`,
    crawledOn: date,
    viewport: VIEWPORT,
    scopes: ["viewport", "full_page"],
    cbrowserVersion: pkg.version,
    gitHead,
    source: "research/benchmark/sites.json, crawled by research/ctc-reference/crawl.ts",
    outcomes: { attempted: rows.length, graded: count("graded"), blocked: count("blocked"), error: count("error") },
    note: "Page metrics (extractPageMetrics output), not scores. Blocked and error pages carry no metrics and are excluded from the reference: a page that did not load is an absent measurement, not an easy page.",
    pages: rows.map((r) => ({
      site: r.site, url: r.url, industry: r.industry, outcome: r.outcome,
      ...(r.finalUrl ? { finalUrl: r.finalUrl } : {}),
      ...(r.detail ? { detail: r.detail } : {}),
      ...(r.outcome === "graded" ? { measuredViewport: r.measuredViewport, metrics: r.metrics } : {}),
    })),
  };
  // A TypeScript module, not .json: it ships in dist/ with no build step, and
  // importing JSON from ESM needs import attributes, which Node 20.9 lacks.
  // A new crawl writes a new dated file; point src/visual/ctc-reference.ts and
  // provenance/ctc-reference.ts at it deliberately.
  const dataPath = join(ROOT, "src", "data", `ctc-reference-${date}.ts`);
  mkdirSync(join(ROOT, "src", "data"), { recursive: true });
  const header = [
    "/**",
    ` * The CTC reference set, crawled ${date}: extractPageMetrics output for the`,
    " * pages of research/benchmark/sites.json, at viewport and full_page scope.",
    " * Generated by research/ctc-reference/crawl.ts; do not edit by hand. Read",
    " * through src/visual/ctc-reference.ts, which explains what it is for.",
    " */",
    'import type { ReferenceDataset } from "../visual/ctc-reference.js";',
    "",
    "export const CTC_REFERENCE_DATA: ReferenceDataset = ",
  ].join("\n");
  writeFileSync(dataPath, `${header}${JSON.stringify(dataset, null, 1)};\n`);
  console.log(`\nattempted ${dataset.outcomes.attempted}  graded ${dataset.outcomes.graded}  blocked ${dataset.outcomes.blocked}  error ${dataset.outcomes.error}`);
  console.log(`blocked: ${rows.filter((r) => r.outcome === "blocked").map((r) => `${r.url} (${r.detail})`).join(", ")}`);
  console.log(`error: ${rows.filter((r) => r.outcome === "error").map((r) => `${r.url} (${r.detail})`).join(", ")}`);
  console.log(`wrote ${dataPath} (${statSync(dataPath).size} bytes) and ${rawPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
