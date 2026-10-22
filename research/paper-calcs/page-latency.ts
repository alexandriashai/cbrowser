/**
 * Calculation 5: how long measuring a real page takes, separately from loading it.
 *
 * 30 pages drawn (mulberry32, seed 0x1a7e) from the graded pages of the shipped
 * CTC reference set (src/data/ctc-reference-2026-10-22.ts), one page per site
 * (the reference holds one page per site). Measured the way cognitive_effort and
 * research/ctc-reference/crawl.ts measure: cbrowser's own CBrowser, headless,
 * 1920x1080, direct route (proxy env cleared), its navigate(), then ONE
 * measurePageGeometry shared by both scopes, extractPageMetrics at `viewport`,
 * then at `full_page` (which walks the page for lazy content). Each step is
 * timed on its own with performance.now().
 *
 * WARM: one browser for the whole run, opened before the clock starts, and one
 * reference page outside the sample loaded first and discarded, so no timed
 * page pays for the browser launch or the first-page cold start.
 *
 * POLITE: sequential, one page per site, 4 s between pages, a 120 s ceiling
 * per page.
 *
 * measurePageRaw does not exist in this tree (grep src/), so the timed
 * functions are the ones the tools call: measurePageGeometry + extractPageMetrics.
 *
 * Usage (as wyld-web, worktree root): bun research/paper-calcs/page-latency.ts [--n 30]
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, loadavg, cpus } from "node:os";
import { CTC_REFERENCE_DATA } from "../../src/data/ctc-reference-2026-10-22.js";

const VIEWPORT = { width: 1920, height: 1080 };
const PAUSE_MS = 4000;
const CEILING_MS = 120_000;
// cognitive_effort's blocked-page signatures, as copied in research/ctc-reference/crawl.ts.
const BLOCK_SIGNATURES = [
  "access denied", "403 forbidden", "just a moment", "press & hold",
  "verify you are human", "captcha", "blocked", "robot check",
  "cloudflare", "please wait", "checking your browser",
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(sorted: number[], q: number): number {
  const h = (sorted.length - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

const withCeiling = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`ceiling ${ms} ms`)), ms))]);

async function main() {
  const args = process.argv.slice(2);
  const n = args.includes("--n") ? Number(args[args.indexOf("--n") + 1]) : 30;
  delete process.env.CBROWSER_PROXY;
  delete process.env.CBROWSER_PROXY_SERVER;
  const dataDir = mkdtempSync(join(tmpdir(), "paper-latency-"));
  process.env.CBROWSER_DATA_DIR = dataDir;
  const { CBrowser } = await import("../../src/browser.js");
  const { extractPageMetrics, measurePageGeometry } = await import("../../src/visual/cognitive-transport.js");

  const graded = CTC_REFERENCE_DATA.pages.filter((p) => p.outcome === "graded");
  const rnd = mulberry32(0x1a7e);
  const order = graded.map((p) => ({ p, k: rnd() })).sort((a, b) => a.k - b.k).map((x) => x.p);
  const sample = order.slice(0, n);
  const warmup = order[n];

  const b = new CBrowser({ headless: true, viewportWidth: VIEWPORT.width, viewportHeight: VIEWPORT.height, dataDir });
  const rows: Array<Record<string, unknown>> = [];
  const t = () => performance.now();
  try {
    const w0 = t();
    await withCeiling(b.navigate(`https://${warmup.url}`), CEILING_MS).catch(() => {});
    console.log(`warm-up ${warmup.url} ${(t() - w0).toFixed(0)} ms (discarded)`);
    for (const [i, ref] of sample.entries()) {
      await new Promise((r) => setTimeout(r, PAUSE_MS));
      const row: Record<string, unknown> = { url: ref.url, industry: ref.industry, load1: loadavg()[0] };
      try {
        const t0 = t();
        await withCeiling(b.navigate(`https://${ref.url}`), CEILING_MS);
        row.navigate_ms = t() - t0;
        const page = await b.getPage();
        const title = await page.title().catch(() => "");
        const body = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || "").catch(() => "");
        const status = await page.evaluate(() => {
          const perf = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
          return perf?.responseStatus || 200;
        }).catch(() => 200);
        const sig = BLOCK_SIGNATURES.find((s) => `${title}\n${body}`.toLowerCase().includes(s));
        row.blocked = status >= 400 || !!sig;
        row.detail = sig ? `signature "${sig}"` : status >= 400 ? `HTTP ${status}` : "";
        const t1 = t();
        const geometry = await withCeiling(measurePageGeometry(page), CEILING_MS);
        row.geometry_ms = t() - t1;
        row.page_screens = geometry.screenCount;
        const t2 = t();
        await withCeiling(extractPageMetrics(page, "viewport", geometry), CEILING_MS);
        row.viewport_extract_ms = t() - t2;
        const t3 = t();
        const fp = await withCeiling(extractPageMetrics(page, "full_page", geometry), CEILING_MS);
        row.full_page_extract_ms = t() - t3;
        row.full_page_interactive = fp.interactiveElementCount;
        row.viewport_total_ms = (row.geometry_ms as number) + (row.viewport_extract_ms as number);
        row.full_page_total_ms = (row.geometry_ms as number) + (row.full_page_extract_ms as number);
        row.outcome = row.blocked ? "blocked" : "measured";
      } catch (e) {
        row.outcome = "error";
        row.detail = String((e as Error).message ?? e).split("\n")[0].slice(0, 160);
      }
      rows.push(row);
      console.log(`  ${String(i + 1).padStart(2)} ${String(ref.url).padEnd(28)} ${String(row.outcome).padEnd(8)} nav ${Math.round(row.navigate_ms as number ?? NaN)} geo ${Math.round(row.geometry_ms as number ?? NaN)} vp ${Math.round(row.viewport_extract_ms as number ?? NaN)} fp ${Math.round(row.full_page_extract_ms as number ?? NaN)} ${row.detail ?? ""}`);
    }
  } finally {
    await b.close().catch(() => {});
    try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ }
  }

  const cols = ["navigate_ms", "geometry_ms", "viewport_extract_ms", "full_page_extract_ms", "viewport_total_ms", "full_page_total_ms"];
  const summarize = (subset: Array<Record<string, unknown>>) => Object.fromEntries(cols.map((c) => {
    const v = subset.map((r) => r[c]).filter((x): x is number => typeof x === "number").sort((a, b) => a - b);
    return [c, v.length ? { n: v.length, median: quantile(v, 0.5), p95: quantile(v, 0.95), min: v[0], max: v[v.length - 1] } : { n: 0 }];
  }));
  const measured = rows.filter((r) => r.outcome === "measured");
  const summary = {
    ran: new Date().toISOString(), pages: rows.length, viewport: VIEWPORT, route: "direct (CBROWSER_PROXY* cleared)",
    sample_seed: "mulberry32(0x1a7e) over the graded pages of ctc-reference-2026-10-22", warmup: warmup.url,
    outcomes: { measured: measured.length, blocked: rows.filter((r) => r.outcome === "blocked").length, error: rows.filter((r) => r.outcome === "error").length },
    cpus: cpus().length, load1_median: quantile(rows.map((r) => r.load1 as number).sort((a, b) => a - b), 0.5),
    quantile_method: "Hyndman-Fan type 7 (linear interpolation)",
    measured_only: summarize(measured),
    all_timed: summarize(rows),
  };
  writeFileSync(join(import.meta.dir, "page-latency.csv"),
    ["url", "industry", "outcome", "detail", ...cols, "page_screens", "full_page_interactive", "load1"].join(",") + "\n" +
    rows.map((r) => [r.url, `"${r.industry}"`, r.outcome, `"${r.detail ?? ""}"`, ...cols.map((c) => (typeof r[c] === "number" ? (r[c] as number).toFixed(1) : "")),
      r.page_screens ?? "", r.full_page_interactive ?? "", (r.load1 as number).toFixed(2)].join(",")).join("\n") + "\n");
  writeFileSync(join(import.meta.dir, "page-latency.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary.measured_only, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
