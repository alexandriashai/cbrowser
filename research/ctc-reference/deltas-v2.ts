/**
 * What the second reference changed: v1 (2026-10-22, 111 brand landing pages,
 * normalised metrics) against v2 (crawl-v2.ts, raw measurements from three
 * frames and six page types). Writes the numbers research/ctc-21-deltas.md
 * quotes in "Reference v2".
 *
 *   bun research/ctc-reference/deltas-v2.ts --v1-pin <golden pinned against v1> --v2-pin <golden pinned against v2>
 *
 * Reports:
 *   - the composition of each reference: attempted, graded, blocked, error,
 *     excluded, robots, by frame, page type and industry or sector; proxy
 *     pages and bytes;
 *   - the bootstrap interval of the percentile at the reference's own 25th,
 *     50th, 80th and 95th percentiles, v1 against v2, by the same procedure
 *     (bootstrapPercentileInterval: pages resampled with all their personas,
 *     1,000 replicates, the registered seed), tool-default options, both scopes;
 *   - Spearman rank correlation per persona between the v1-referenced and the
 *     v2-referenced totalCTC over the golden matrix (19 demands x 4 option sets).
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CTC_REFERENCE_DATA as V1 } from "./v1/ctc-reference-2026-10-22.js";
import {
  CTC_REFERENCE, bootstrapPercentileInterval, intervalAt, percentileAt, percentileCurve,
  referenceGraded, referenceOutcomes, referencePopulation, type PercentileCurve, type PercentileInterval,
} from "../../src/visual/ctc-reference.js";
import { computeDemandDistribution, computeSequentialCTC, ctcReferenceCurve, type PageMetrics } from "../../src/visual/cognitive-transport-chain.js";
import { param } from "../../src/visual/model-provenance.js";

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);

const tally = <T>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : "-");

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
const direct = rows.filter((r) => r.outcome !== "robots");
const proxied = rows.filter((r) => r.route === "proxy");
console.log(`v2 pages loaded (not robots): ${direct.length}; first attempt blocked and retried through the proxy: ${proxied.length} (${pct(proxied.length, direct.length)}); of those graded: ${proxied.filter((r) => r.outcome === "graded").length}`);
console.log(`v2 blocked rate (blocked of loaded): ${pct(o.blocked, direct.length)}; v1: ${pct(V1.outcomes.blocked, V1.outcomes.attempted)}`);
console.log(`\nby frame (graded / attempted):`);
for (const f of ["brand", "tranco", "public"]) {
  const a = rows.filter((r) => r.frame === f);
  console.log(`  ${f}: ${a.filter((r) => r.outcome === "graded").length} / ${a.length}  (blocked ${a.filter((r) => r.outcome === "blocked").length}, error ${a.filter((r) => r.outcome === "error").length}, excluded ${a.filter((r) => r.outcome === "excluded").length}, robots ${a.filter((r) => r.outcome === "robots").length}, proxy-graded ${a.filter((r) => r.route === "proxy" && r.outcome === "graded").length})`);
}
console.log(`\nby page type (graded / attempted):`);
for (const t of ["landing", "form", "search", "article", "help", "cart"]) {
  const a = rows.filter((r) => r.pageType === t);
  console.log(`  ${t}: ${a.filter((r) => r.outcome === "graded").length} / ${a.length}   by frame ${["brand", "tranco", "public"].map((f) => graded.filter((r) => r.frame === f && r.pageType === t).length).join(" / ")}`);
}
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
function v1Costs(scope: "viewport" | "full_page"): Float64Array {
  const pages = (V1.pages as Array<{ outcome: string; metrics?: Record<string, PageMetrics> }>).filter((p) => p.outcome === "graded");
  const out = new Float64Array(pages.length * population.length);
  let k = 0;
  for (const p of pages) {
    const demand = computeDemandDistribution(p.metrics![scope]);
    for (const persona of population) out[k++] = computeSequentialCTC({ name: persona.name, traits: persona.traits } as never, demand).rawCTC;
  }
  return out;
}
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
for (const scope of ["viewport", "full_page"] as const) {
  const c1 = v1Costs(scope);
  const curve1 = percentileCurve(c1);
  const iv1 = bootstrapPercentileInterval(c1, population.length, settings);
  console.log(`  ${scope} v1 (${c1.length / population.length} pages): ${widths(curve1, iv1, c1)}`);
  const ref = ctcReferenceCurve(scope);
  // The v2 costs, rebuilt the way the chain built them, to read the quantiles.
  const c2 = new Float64Array(ref.curve.samples);
  {
    let k = 0;
    const { referencePages } = await import("../../src/visual/ctc-reference.js");
    for (const m of referencePages(scope)) {
      const demand = computeDemandDistribution(m);
      for (const persona of population) c2[k++] = computeSequentialCTC({ name: persona.name, traits: persona.traits } as never, demand).rawCTC;
    }
  }
  console.log(`  ${scope} v2 (${ref.pages} pages): ${widths(ref.curve, ref.interval, c2)}`);
}

// ── Spearman per persona, golden matrix ──
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
  console.log(`\n## Spearman, v1- vs v2-referenced totalCTC per persona (${p2.demands.length} demands x ${p2.optionSets.length} option sets)`);
  const rhos: Array<[string, number]> = [];
  let rawSame = true;
  for (const persona of p2.personas) {
    const a: number[] = [], b: number[] = [];
    for (const d of p2.demands) for (const os of p2.optionSets) {
      a.push(p1.runs[persona][d][os].totalCTC);
      b.push(p2.runs[persona][d][os].totalCTC);
      if (!Object.is(p1.runs[persona][d][os].rawCTC, p2.runs[persona][d][os].rawCTC)) rawSame = false;
    }
    rhos.push([persona, spearman(a, b)]);
  }
  console.log(`  rawCTC identical in both pins: ${rawSame}`);
  for (const [p, r] of rhos) console.log(`  ${p}: ${r.toFixed(4)}`);
  const human = rhos.filter(([p]) => !p.startsWith("boundary-")).map(([, r]) => r).sort((x, y) => x - y);
  console.log(`  human personas: min ${human[0].toFixed(4)}, median ${human[Math.floor(human.length / 2)].toFixed(4)}, max ${human[human.length - 1].toFixed(4)}`);
}
