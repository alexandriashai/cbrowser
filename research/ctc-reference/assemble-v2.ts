/**
 * Assemble the shipped CTC reference (src/data/ctc-reference-v2-<date>.ts)
 * from a crawl-v2 run.
 *
 *   bun research/ctc-reference/assemble-v2.ts --rows <crawl-v2-*.jsonl> --summary <crawl-v2-*.summary.json> \
 *     --crawl-tree <the frozen tree the crawl ran from> [--out src/data/ctc-reference-v2-<date>.ts]
 *
 * The module carries three exports, read through src/visual/ctc-reference.ts:
 *
 *   CTC_REFERENCE_META   where the data came from: frames and their sources, the
 *                        outcome counts, proxy use and bytes, and the values of
 *                        the measure-stage page-metric constants the pages were
 *                        measured with (read from the crawl's own tree).
 *   CTC_REFERENCE_PAGES  every attempted page with its outcome, reason, route
 *                        and robots.txt decision: the published outcome list,
 *                        in plain JSON so it reads in the repository.
 *   CTC_REFERENCE_RAW    the graded pages' raw measurements (viewport and
 *                        full_page), in outcome-list order, as brotli-compressed
 *                        JSON in base64. A TypeScript module rather than a
 *                        .json or binary file so it ships in dist/ with no build
 *                        step and loads on every Node the package supports
 *                        (importing JSON from ESM needs import attributes, which
 *                        Node 20.9 lacks).
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, constants as zc } from "node:zlib";
import type { PageRow } from "./crawl-v2.js";

const ROOT = join(import.meta.dir, "..", "..");
const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const rowsPath = opt("--rows");
const summaryPath = opt("--summary");
const crawlTree = opt("--crawl-tree");
if (!rowsPath || !summaryPath || !crawlTree) {
  console.error("usage: assemble-v2.ts --rows <jsonl> --summary <summary.json> --crawl-tree <dir> [--out <ts>]");
  process.exit(2);
}

interface Summary {
  date: string; cbrowserVersion: string; gitHead: string; viewport: { width: number; height: number };
  quotas: { frame: number; type: number }; deadlineReached: boolean;
  proxy: { region: string; pages: number; bytes: number; budgetBytes: number; budgetExhausted: boolean };
  bytes: number; sitesTaken: Record<string, number>;
}
const summary = JSON.parse(readFileSync(summaryPath, "utf8")) as Summary;
const rows = readFileSync(rowsPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as PageRow);
const frames = JSON.parse(readFileSync(join(ROOT, "research", "ctc-reference", "frames-v2.json"), "utf8")) as {
  builtOn: string; seed: number; frames: Record<string, { description: string; sites: unknown[]; exclusions?: unknown[]; [k: string]: unknown }>;
};

// The measure-stage constants as the crawl's own tree registered them.
const { PAGE_METRICS_PROVENANCE, PAGE_METRICS_MEASURE_IDS } = await import(join(crawlTree, "src", "visual", "provenance", "page-metrics.ts")) as {
  PAGE_METRICS_PROVENANCE: Array<{ id: string; value: number }>; PAGE_METRICS_MEASURE_IDS: string[];
};
const measureParams = Object.fromEntries(PAGE_METRICS_MEASURE_IDS.map((id) => [id, PAGE_METRICS_PROVENANCE.find((e) => e.id === id)!.value]));

// Crawl order interleaves frames and finishes pages out of order; the shipped
// order is by frame, then site in frame order, then page type, so the file is
// stable for a given set of rows.
const frameOrder = ["brand", "tranco", "public"];
const typeOrder = ["landing", "form", "search", "article", "help", "cart"];
const siteIndex = new Map<string, number>();
for (const f of frameOrder) (frames.frames[f].sites as Array<{ site: string }>).forEach((s, i) => siteIndex.set(`${f}|${s.site}`, i));
rows.sort((a, b) =>
  frameOrder.indexOf(a.frame) - frameOrder.indexOf(b.frame) ||
  (siteIndex.get(`${a.frame}|${a.site}`) ?? 0) - (siteIndex.get(`${b.frame}|${b.site}`) ?? 0) ||
  typeOrder.indexOf(a.pageType) - typeOrder.indexOf(b.pageType));

const pages = rows.map((r) => ({
  frame: r.frame, site: r.site, sector: r.sector, pageType: r.pageType, url: r.url,
  ...(r.how ? { how: r.how } : {}),
  outcome: r.outcome,
  ...(r.detail ? { detail: r.detail } : {}),
  ...(r.route ? { route: r.route } : {}),
  robots: r.robots, bytes: r.bytes, proxyBytes: r.proxyBytes,
  ...(r.finalUrl ? { finalUrl: r.finalUrl } : {}),
  ...(r.rank !== undefined ? { rank: r.rank } : {}), ...(r.band ? { band: r.band } : {}), ...(r.source ? { source: r.source } : {}),
}));
const raw = rows.filter((r) => r.outcome === "graded").map((r) => {
  if (!r.raw) throw new Error(`graded row without a measurement: ${r.url}`);
  return r.raw;
});
const count = (o: string) => rows.filter((r) => r.outcome === o).length;
const graded = count("graded");
const id = `ctc-reference-v2-${summary.date}`;

const frameMeta = frameOrder.map((f) => {
  const fr = frames.frames[f];
  const { sites, exclusions, description, ...rest } = fr;
  return {
    id: f, description, sitesListed: sites.length, sitesTaken: summary.sitesTaken[f] ?? 0,
    ...rest,
    ...(exclusions ? { exclusionsBeforeCrawl: exclusions } : {}),
  };
});

const meta = {
  id,
  crawledOn: summary.date,
  viewport: summary.viewport,
  scopes: ["viewport", "full_page"],
  cbrowserVersion: summary.cbrowserVersion,
  gitHead: summary.gitHead,
  measurementCode: `src/browser.ts, src/config.ts and src/visual/cognitive-transport.ts as of ${summary.gitHead} (the crawl ran from a frozen export of that commit)`,
  source: `research/ctc-reference/frames-v2.json (built ${frames.builtOn}, seed ${frames.seed}), crawled by research/ctc-reference/crawl-v2.ts and assembled by assemble-v2.ts`,
  crawlNote: `Quotas ${summary.quotas.frame} graded pages per frame and ${summary.quotas.type} per (frame, inner type); sites taken in frame order until a frame's quota was met${summary.deadlineReached ? "; the crawl's deadline was reached" : ""}. Direct first; a blocked page retried once through the residential proxy (${summary.proxy.region}), never for .gov or .mil.`,
  note: "Raw page measurements (measurePageRaw), not metrics or scores; metrics are derived from them under the live constants. Pages that were blocked, failed, excluded by a frame filter or disallowed by robots.txt carry no measurement and are not part of the reference: a page that did not load is an absent measurement, not an easy page.",
  weighting: "Every graded page counts once. The crawl's quotas balance frames and page types; the curve does not reweight them.",
  measureParams,
  frames: frameMeta,
  outcomes: { attempted: rows.length, graded, blocked: count("blocked"), error: count("error"), excluded: count("excluded"), robots: count("robots") },
  proxy: summary.proxy,
  bytes: summary.bytes,
};

const rawJson = JSON.stringify(raw);
const packed = brotliCompressSync(Buffer.from(rawJson, "utf8"), {
  params: { [zc.BROTLI_PARAM_QUALITY]: 11, [zc.BROTLI_PARAM_SIZE_HINT]: rawJson.length, [zc.BROTLI_PARAM_LGWIN]: 24 },
}).toString("base64");

const out = opt("--out") ?? join(ROOT, "src", "data", `ctc-reference-v2-${summary.date}.ts`);
const header = [
  "/**",
  ` * The CTC reference set, version 2, crawled ${summary.date}: raw page measurements`,
  " * (measurePageRaw) of the graded pages, at viewport and full_page scope, and the",
  " * outcome of every attempted page. Generated by research/ctc-reference/assemble-v2.ts",
  " * from a research/ctc-reference/crawl-v2.ts run; do not edit by hand. Read through",
  " * src/visual/ctc-reference.ts, which explains what it is for.",
  " *",
  " * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai",
  " * @license MIT",
  " */",
  'import type { ReferenceMeta, ReferencePageRecord } from "../visual/ctc-reference.js";',
  "",
].join("\n");
const body = [
  `export const CTC_REFERENCE_META: ReferenceMeta = ${JSON.stringify(meta, null, 1)};`,
  "",
  `export const CTC_REFERENCE_PAGES: ReferencePageRecord[] = [\n${pages.map((p) => JSON.stringify(p)).join(",\n")}\n];`,
  "",
  "/** The graded pages' raw measurements, in CTC_REFERENCE_PAGES order: brotli-compressed JSON, base64. */",
  `export const CTC_REFERENCE_RAW = "${packed}";`,
  "",
].join("\n");
writeFileSync(out, `${header}\n${body}`);
console.log(`wrote ${out}: ${rows.length} attempted, ${graded} graded; raw JSON ${(rawJson.length / 1e6).toFixed(2)} MB -> brotli+base64 ${(packed.length / 1e6).toFixed(2)} MB; module ${((header.length + body.length) / 1e6).toFixed(2)} MB`);
