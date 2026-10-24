/**
 * What the second reference changed: v1 (2026-10-22, 111 brand landing pages,
 * normalised metrics) against v2 (crawl-v2.ts, raw format 2 measurements from
 * three frames and six page types). Writes the numbers research/ctc-21-deltas.md
 * quotes in "Reference v2".
 *
 *   bun research/ctc-reference/deltas-v2.ts --v1-pin <golden pinned against v1> [--v2-pin <golden pinned against v2>] \
 *     [--format1-rows <a format-1 crawl-v2 jsonl>]
 *
 * Reports:
 *   - the composition of each reference: attempted, graded, blocked, error,
 *     excluded, robots, by frame, page type and industry or sector; proxy
 *     pages and bytes;
 *   - the bootstrap interval of the percentile at the reference's own 25th,
 *     50th, 80th and 95th percentiles, v1 against v2, by the same procedure
 *     (bootstrapPercentileInterval: pages resampled with all their personas,
 *     1,000 replicates, the registered seed), tool-default options, both scopes;
 *   - how totalCTC moves, two ways. On the golden matrix (19 demands x 4
 *     option sets, the same inputs ranked against each reference): per persona
 *     the mean and the largest absolute change and the Spearman rank
 *     correlation. On real pages: the v1 reference's own 111 landing pages,
 *     each persona's cost ranked against the v1 curve and against the v2
 *     curve, per persona mean and largest absolute change;
 *   - what raw format 2's prose fix moved, with a format-1 crawl of the same
 *     frames: on the pages graded in both crawls (same frame, type and URL),
 *     the readability metrics derived from each, the prose words, the script
 *     family, and, for scale, how much fields the fix did not touch (links,
 *     interactive elements, textChars) moved between the two crawls; and on
 *     every v2 page, format 1's per-element count (proseNested) against the
 *     outermost-only count, measured on the same DOM;
 *   - the share of each page's prose words that sit in nav and composite
 *     groups (proseInNav), median and p90, by scope and page type;
 *   - the share of each page's grouped links whose drawn text holds a letter
 *     (groupedLinksWithText), median and p90, and the pages with none;
 *   - what counting each choice in one group did, on every v2 page, same
 *     DOM: format 1's group totals (choiceNested) against the deduplicated
 *     ones, how many pages have more groups than the stored list holds, and
 *     how far the stored nav sizes undercount navLinks there.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CTC_REFERENCE_DATA as V1 } from "./v1/ctc-reference-2026-10-22.js";
import {
  CTC_REFERENCE, bootstrapPercentileInterval, intervalAt, percentileAt, percentileCurve,
  referenceGraded, referenceOutcomes, referencePages, referencePopulation, referenceRaw,
  type PercentileCurve, type PercentileInterval,
} from "../../src/visual/ctc-reference.js";
import { computeDemandDistribution, computeSequentialCTC, ctcReferenceCurve, type PageMetrics } from "../../src/visual/cognitive-transport-chain.js";
import { deriveMetrics, type MetricScope, type RawPageMeasurement, type RawPageMeasurementV1 } from "../../src/visual/cognitive-transport.js";
import { param } from "../../src/visual/model-provenance.js";
import type { PageRow } from "./crawl-v2.js";

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);

const tally = <T>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : "-");
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : Number.NaN);
const median = (xs: number[]) => {
  if (!xs.length) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const maxAbs = (xs: number[]) => xs.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
const f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : "-");
const f4 = (x: number) => (Number.isFinite(x) ? x.toFixed(4) : "-");
const SCOPES: MetricScope[] = ["viewport", "full_page"];
const FRAMES = ["brand", "tranco", "public"];
const TYPES = ["landing", "form", "search", "article", "help", "cart"];

// ── Composition ──
const rows = referenceOutcomes();
const graded = referenceGraded();
console.log(`## composition\n`);
console.log(`v1 ${V1.id}: attempted ${V1.outcomes.attempted}, graded ${V1.outcomes.graded}, blocked ${V1.outcomes.blocked}, error ${V1.outcomes.error}; landing pages only; no proxy`);
const v1Industry = new Map<string, [number, number]>();
for (const p of V1.pages as Array<{ industry: string; outcome: string }>) {
  const e = v1Industry.get(p.industry) ?? [0, 0];
  e[1]++;
  if (p.outcome === "graded") e[0]++;
  v1Industry.set(p.industry, e);
}
const o = CTC_REFERENCE.outcomes;
console.log(`v2 ${CTC_REFERENCE.id}: attempted ${o.attempted}, graded ${o.graded}, blocked ${o.blocked}, error ${o.error}, excluded ${o.excluded}, robots-disallowed ${o.robots}`);
console.log(`v2 bytes ${(CTC_REFERENCE.bytes / 1e9).toFixed(2)} GB; proxy ${CTC_REFERENCE.proxy.pages} pages, ${(CTC_REFERENCE.proxy.bytes / 1e6).toFixed(0)} MB of ${(CTC_REFERENCE.proxy.budgetBytes / 1e9).toFixed(2)} GB budget, exhausted ${CTC_REFERENCE.proxy.budgetExhausted}`);
const loaded = rows.filter((r) => r.outcome !== "robots");
const proxied = rows.filter((r) => r.route === "proxy");
console.log(`v2 pages loaded (not robots): ${loaded.length}; first attempt blocked and retried through the proxy: ${proxied.length} (${pct(proxied.length, loaded.length)}); of those graded: ${proxied.filter((r) => r.outcome === "graded").length}`);
console.log(`v2 blocked rate (blocked of loaded): ${pct(o.blocked, loaded.length)}; v1: ${pct(V1.outcomes.blocked, V1.outcomes.attempted)}`);
console.log(`\nby frame (graded / attempted):`);
for (const f of FRAMES) {
  const a = rows.filter((r) => r.frame === f);
  console.log(`  ${f}: ${a.filter((r) => r.outcome === "graded").length} / ${a.length}  (blocked ${a.filter((r) => r.outcome === "blocked").length}, error ${a.filter((r) => r.outcome === "error").length}, excluded ${a.filter((r) => r.outcome === "excluded").length}, robots ${a.filter((r) => r.outcome === "robots").length}, proxy-graded ${a.filter((r) => r.route === "proxy" && r.outcome === "graded").length})`);
}
console.log(`\nby page type (graded / attempted), graded by frame brand / tranco / public:`);
for (const t of TYPES) {
  const a = rows.filter((r) => r.pageType === t);
  console.log(`  ${t}: ${a.filter((r) => r.outcome === "graded").length} / ${a.length}   by frame ${FRAMES.map((f) => graded.filter((r) => r.frame === f && r.pageType === t).length).join(" / ")}`);
}
const searchHow = (r: { how?: string }) => (r.how ?? "").split(",")[0];
const searches = rows.filter((r) => r.pageType === "search");
console.log(`\nsearch pages by how they were found (graded / attempted): ${tally(searches, searchHow).map(([k, n]) =>
  `${k} ${searches.filter((r) => searchHow(r) === k && r.outcome === "graded").length}/${n}`).join("; ")}`);
console.log(`\nv2 graded by sector: ${tally(graded, (r) => r.sector).map(([k, n]) => `${k} ${n}`).join(", ")}`);
console.log(`v2 brand-frame landing pages graded by industry (v2 of attempted | v1 graded of attempted):`);
const brandLanding = rows.filter((r) => r.frame === "brand" && r.pageType === "landing");
for (const [ind] of tally(brandLanding, (r) => r.sector)) {
  const a = brandLanding.filter((r) => r.sector === ind);
  const v1e = v1Industry.get(ind) ?? [0, 0];
  console.log(`  ${ind}: ${a.filter((r) => r.outcome === "graded").length}/${a.length} | v1 ${v1e[0]}/${v1e[1]}`);
}
console.log(`\nexcluded (tranco filters and duplicates): ${tally(rows.filter((r) => r.outcome === "excluded"), (r) => (r.detail ?? "").split(":")[0].split(" (")[0]).map(([k, n]) => `${k} ${n}`).join(", ")}`);

// ── Intervals ──
const settings = {
  replicates: param("ctcReference.interval.replicates"), seed: param("ctcReference.interval.seed"),
  level: param("ctcReference.interval.level"), grid: param("ctcReference.interval.grid"),
};
const population = referencePopulation();
/** Page-major raw costs of a list of page metrics for every reference persona, tool-default options. */
function costsOf(pages: PageMetrics[]): Float64Array {
  const out = new Float64Array(pages.length * population.length);
  let k = 0;
  for (const m of pages) {
    const demand = computeDemandDistribution(m);
    for (const persona of population) out[k++] = computeSequentialCTC({ name: persona.name, traits: persona.traits } as never, demand).rawCTC;
  }
  return out;
}
const v1Pages = (scope: MetricScope) =>
  (V1.pages as Array<{ outcome: string; metrics?: Record<string, PageMetrics> }>).filter((p) => p.outcome === "graded").map((p) => p.metrics![scope]);
const quantile = (sorted: Float64Array, q: number) => {
  const h = q * (sorted.length - 1), f = Math.floor(h), c = Math.min(sorted.length - 1, f + 1);
  return sorted[f] + (h - f) * (sorted[c] - sorted[f]);
};
function widths(curve: PercentileCurve, iv: PercentileInterval, costs: Float64Array): string {
  const sorted = Float64Array.from(costs).sort();
  return [0.25, 0.5, 0.8, 0.95].map((q) => {
    const x = quantile(sorted, q);
    const p = percentileAt(curve, x);
    const [a, b] = intervalAt(iv, x, p);
    return `p${Math.round(q * 100)}: ${(100 * p).toFixed(1)} [${(100 * a).toFixed(1)}, ${(100 * b).toFixed(1)}] width ${(100 * (b - a)).toFixed(1)}`;
  }).join("; ");
}
console.log(`\n## bootstrap interval of the percentile (pages resampled, ${settings.replicates} replicates, seed ${settings.seed}), asymmetric + interactions`);
const v1Curves: Partial<Record<MetricScope, PercentileCurve>> = {};
const v1Costs: Partial<Record<MetricScope, Float64Array>> = {};
// v1 stored normalised metrics, not raw measurements. Since Stage B the
// demand also needs the four law times, which only a raw measurement gives,
// so v1's pages cannot be scored by this chain; their earlier numbers stand
// in research/ctc-reference/deltas-v2-2026-10-23.txt as of 890e93f (git history).
let v1Scorable = true;
try { costsOf(v1Pages("viewport").slice(0, 1)); } catch { v1Scorable = false; }
if (!v1Scorable) console.log("  v1: not scorable by this chain (its stored metrics carry no law times); v2 only");
for (const scope of SCOPES) {
  if (v1Scorable) {
    const c1 = costsOf(v1Pages(scope));
    const curve1 = percentileCurve(c1);
    v1Curves[scope] = curve1;
    v1Costs[scope] = c1;
    const iv1 = bootstrapPercentileInterval(c1, population.length, settings);
    console.log(`  ${scope} v1 (${c1.length / population.length} pages): ${widths(curve1, iv1, c1)}`);
  }
  const ref = ctcReferenceCurve(scope);
  const c2 = costsOf(referencePages(scope));
  if (c2.length !== ref.curve.samples) throw new Error(`rebuilt ${c2.length} v2 costs, the curve holds ${ref.curve.samples}`);
  console.log(`  ${scope} v2 (${ref.pages} pages): ${widths(ref.curve, ref.interval, c2)}`);
}

// ── totalCTC on real pages: the v1 landing pages ranked against each curve ──
console.log(`\n## the v1 reference's own landing pages ranked against v1 and against v2 (totalCTC v2 minus v1, tool-default options)`);
if (!v1Scorable) console.log("  skipped: v1 is not scorable by this chain");
for (const scope of v1Scorable ? SCOPES : []) {
  const c1 = v1Costs[scope]!, curve1 = v1Curves[scope]!, curve2 = ctcReferenceCurve(scope).curve;
  const n = c1.length / population.length;
  const lines: string[] = [];
  const all: number[] = [];
  population.forEach((persona, j) => {
    const d: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = c1[i * population.length + j];
      d.push(percentileAt(curve2, x) - percentileAt(curve1, x));
    }
    all.push(...d);
    lines.push(`    ${persona.name}: mean ${f3(mean(d))}, max abs ${f3(maxAbs(d))}`);
  });
  console.log(`  ${scope}: all pairs mean ${f3(mean(all))}, mean abs ${f3(mean(all.map(Math.abs)))}, max abs ${f3(maxAbs(all))}`);
  console.log(lines.join("\n"));
}

// ── Golden matrix: same inputs, ranked against each reference ──
function ranks(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}
function spearman(a: number[], b: number[]): number {
  const ra = ranks(a), rb = ranks(b);
  const n = a.length, ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (ra[i] - ma) * (rb[i] - mb); saa += (ra[i] - ma) ** 2; sbb += (rb[i] - mb) ** 2; }
  return saa === 0 || sbb === 0 ? Number.NaN : sab / Math.sqrt(saa * sbb);
}
const v1PinPath = opt("--v1-pin");
const v2PinPath = opt("--v2-pin") ?? join(import.meta.dir, "..", "..", "tests", "fixtures", "ctc-golden-21.0.0.json");
if (v1PinPath) {
  type Pin = { personas: string[]; demands: string[]; optionSets: string[]; runs: Record<string, Record<string, Record<string, { totalCTC: number; rawCTC: number }>>> };
  const p1 = JSON.parse(readFileSync(v1PinPath, "utf8")) as Pin;
  const p2 = JSON.parse(readFileSync(v2PinPath, "utf8")) as Pin;
  console.log(`\n## golden matrix, v1- vs v2-referenced totalCTC per persona (${p2.demands.length} demands x ${p2.optionSets.length} option sets): v2 minus v1`);
  const rhos: Array<[string, number]> = [];
  let rawSame = true;
  const all: number[] = [];
  for (const persona of p2.personas) {
    const a: number[] = [], b: number[] = [];
    for (const d of p2.demands) for (const os of p2.optionSets) {
      a.push(p1.runs[persona][d][os].totalCTC);
      b.push(p2.runs[persona][d][os].totalCTC);
      if (!Object.is(p1.runs[persona][d][os].rawCTC, p2.runs[persona][d][os].rawCTC)) rawSame = false;
    }
    const diff = b.map((x, i) => x - a[i]);
    if (!persona.startsWith("boundary-")) all.push(...diff);
    rhos.push([persona, spearman(a, b)]);
    console.log(`  ${persona}: mean ${f3(mean(diff))}, max abs ${f3(maxAbs(diff))}, Spearman ${f4(spearman(a, b))}`);
  }
  console.log(`  rawCTC identical in both pins: ${rawSame}`);
  const human = rhos.filter(([p]) => !p.startsWith("boundary-")).map(([, r]) => r).sort((x, y) => x - y);
  console.log(`  human personas: change mean ${f3(mean(all))}, mean abs ${f3(mean(all.map(Math.abs)))}, max abs ${f3(maxAbs(all))}; Spearman min ${f4(human[0])}, median ${f4(human[Math.floor(human.length / 2)])}, max ${f4(human[human.length - 1])}`);
}

// ── The prose fix ──
console.log(`\n## choice groups: each choice in one group, and the uncapped nav totals (same DOM)`);
for (const scope of SCOPES) {
  const raws = referenceRaw(scope);
  const items = (r: RawPageMeasurement) => { let n = 0; for (let i = 1; i < r.choiceGroups.length; i += 2) n += r.choiceGroups[i]; return n; };
  const nested = raws.filter((r) => r.choiceNested.groups > r.choiceGroupCount);
  const itemRatio = raws.filter((r) => r.choiceGroupCount > 0 && r.choiceGroupCount <= param("pageMetrics.raw.maxChoiceGroups") && items(r) > 0)
    .map((r) => r.choiceNested.items / items(r));
  const capped = raws.filter((r) => r.choiceGroupCount > param("pageMetrics.raw.maxChoiceGroups"));
  const storedNav = (r: RawPageMeasurement) => {
    let n = 0;
    for (let i = 0; i < r.choiceGroups.length; i += 2) if (r.kinds[r.choiceGroups[i]] === "nav") n += r.choiceGroups[i + 1];
    return n;
  };
  console.log(`  ${scope}: pages with a group inside another group ${nested.length} of ${raws.length}; choices counted per group / once (pages under the cap) median ${f3(median(itemRatio))}, mean ${f3(mean(itemRatio))}, max ${f3(Math.max(...itemRatio))}; groups per group / once, all pages: ${raws.reduce((n, r) => n + r.choiceNested.groups, 0)} / ${raws.reduce((n, r) => n + r.choiceGroupCount, 0)}`);
  console.log(`    pages over the stored list's ${param("pageMetrics.raw.maxChoiceGroups")} groups: ${capped.length}; there, stored nav sizes / navLinks: ${capped.map((r) => `${storedNav(r)}/${r.navLinks}`).join(", ") || "-"}; ungrouped links (links - groupedLinks) median ${f3(median(raws.map((r) => r.links - r.groupedLinks)))}, share of links median ${f3(median(raws.filter((r) => r.links > 0).map((r) => (r.links - r.groupedLinks) / r.links)))}`);
}

console.log(`\n## prose inside nav and composite groups (proseInNav), per page`);
for (const scope of SCOPES) {
  const raws = referenceRaw(scope);
  const graded = referenceGraded();
  const share = (r: RawPageMeasurement) => (r.prose.words > 0 ? r.proseInNav.words / r.prose.words : 0);
  const shares = raws.map(share).sort((a, b) => a - b);
  const q = (p: number) => shares[Math.min(shares.length - 1, Math.floor(p * (shares.length - 1)))];
  const byType = TYPES.map((t) => {
    const s2 = raws.filter((_, i) => graded[i].pageType === t).map(share);
    return s2.length ? `${t} ${f3(median(s2))}` : "";
  }).filter(Boolean).join(", ");
  console.log(`  ${scope}: share of prose words in groups, median ${f3(q(0.5))}, p90 ${f3(q(0.9))}, mean ${f3(mean(shares))}, max ${f3(shares[shares.length - 1])}; pages with none ${shares.filter((x) => x === 0).length} of ${shares.length}; median by type: ${byType}`);
}

console.log(`\n## grouped links a sighted user can read (groupedLinksWithText), per page`);
for (const scope of SCOPES) {
  const raws = referenceRaw(scope);
  const withLinks = raws.filter((r) => r.groupedLinks > 0);
  const shares = withLinks.map((r) => r.groupedLinksWithText / r.groupedLinks).sort((a, b) => a - b);
  const q = (p: number) => shares[Math.min(shares.length - 1, Math.floor(p * (shares.length - 1)))];
  const total = raws.reduce((n, r) => n + r.groupedLinks, 0), withText = raws.reduce((n, r) => n + r.groupedLinksWithText, 0);
  console.log(`  ${scope}: share of a page's grouped links with text, over the ${withLinks.length} pages with any, median ${f3(q(0.5))}, p90 ${f3(q(0.9))}, p10 ${f3(q(0.1))}; pages with grouped links but no label ${withLinks.filter((r) => r.groupedLinksWithText === 0).length}; pages with no grouped link ${raws.length - withLinks.length}; all pages pooled ${withText} of ${total} (${pct(withText, total)})`);
}

console.log(`\n## raw format 2's prose fix`);
{
  // Within each v2 page: format 1's per-element count against the outermost-only count, same DOM.
  for (const scope of SCOPES) {
    const raws = referenceRaw(scope);
    const factor = raws.filter((r) => r.prose.words > 0).map((r) => r.proseNested.words / r.prose.words);
    const blocks = raws.filter((r) => r.textBlockCount > 0).map((r) => r.proseNested.elements / r.textBlockCount);
    console.log(`  ${scope}, all ${raws.length} v2 pages, same DOM: prose words counted per element / once: median ${f3(median(factor))}, mean ${f3(mean(factor))}, max ${f3(Math.max(...factor))}; pages double counting at all ${factor.filter((x) => x > 1).length}; blocks per element / outermost median ${f3(median(blocks))}`);
  }
}
const format1Path = opt("--format1-rows");
if (format1Path) {
  const f1 = readFileSync(format1Path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as PageRow)
    .filter((r) => r.outcome === "graded" && r.raw);
  const key = (r: { frame: string; pageType: string; url: string }) => `${r.frame}|${r.pageType}|${r.url}`;
  const byKey = new Map(f1.map((r) => [key(r), r]));
  const v2 = referenceGraded();
  const READING = ["avgWordLength", "avgSentenceLength", "lexicalDiversity", "longWordRatio", "technicalDensity"] as const;
  for (const scope of SCOPES) {
    const raws2 = referenceRaw(scope);
    const pairs: Array<{ a: RawPageMeasurementV1; b: RawPageMeasurement; type: string }> = [];
    v2.forEach((p, i) => {
      const r = byKey.get(key(p));
      if (r) pairs.push({ a: (r.raw as Record<MetricScope, RawPageMeasurementV1>)[scope], b: raws2[i], type: p.pageType });
    });
    console.log(`\n  ${scope}: ${pairs.length} pages graded in both crawls (same frame, type and URL), by type ${TYPES.map((t) => `${t} ${pairs.filter((x) => x.type === t).length}`).join(", ")}`);
    if (!pairs.length) continue;
    const d1 = pairs.map((x) => deriveMetrics(x.a)), d2 = pairs.map((x) => deriveMetrics(x.b));
    for (const field of READING) {
      const diff = d2.map((m, i) => m[field] - d1[i][field]);
      console.log(`    ${field}: format 2 minus format 1 mean ${f4(mean(diff))}, median ${f4(median(diff))}, mean abs ${f4(mean(diff.map(Math.abs)))}, max abs ${f4(maxAbs(diff))}; format 1 mean ${f4(mean(d1.map((m) => m[field])))}`);
    }
    const flips = pairs.filter((x) => x.a.text.script !== x.b.text.script).map((x) => `${x.a.text.script}->${x.b.text.script}`);
    console.log(`    script family changed on ${flips.length} pages: ${tally(flips, (s) => s).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`);
    const words = (r: { text: { wordLengths: Array<[number, number]>; abjadWordLengths: Array<[number, number]> } }) =>
      [...r.text.wordLengths, ...r.text.abjadWordLengths].reduce((n, [, c]) => n + c, 0);
    const wordRatio = pairs.filter((x) => words(x.b) > 0).map((x) => words(x.a) / words(x.b));
    console.log(`    prose words, format 1 / format 2: median ${f3(median(wordRatio))}, mean ${f3(mean(wordRatio))}`);
    // For scale: fields the fix did not touch, between the same two crawls.
    const rel = (f: (r: RawPageMeasurementV1 | RawPageMeasurement) => number) =>
      pairs.filter((x) => f(x.a) > 0).map((x) => Math.abs(f(x.b) - f(x.a)) / f(x.a));
    console.log(`    drift baseline (fields the fix did not touch), median relative change: links ${f3(median(rel((r) => r.links)))}, interactive elements ${f3(median(rel((r) => r.interactiveElements)))}, textChars ${f3(median(rel((r) => r.textChars)))}; identical textChars on ${pairs.filter((x) => x.a.textChars === x.b.textChars).length} pages`);
    // On the pages whose untouched text did not move, the prose change is the fix alone.
    const steady = pairs.map((x, i) => ({ x, i })).filter(({ x }) => x.a.textChars === x.b.textChars && x.a.links === x.b.links);
    if (steady.length) {
      for (const field of READING) {
        const diff = steady.map(({ i }) => d2[i][field] - d1[i][field]);
        console.log(`    ${field} on the ${steady.length} pages with identical textChars and links: mean ${f4(mean(diff))}, mean abs ${f4(mean(diff.map(Math.abs)))}, max abs ${f4(maxAbs(diff))}`);
      }
    }
  }
}
