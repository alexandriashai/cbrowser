/**
 * Per persona: how far the CTC golden matrix moved between two pins.
 *
 *   bun research/persona-21-ctc-deltas.ts <before.json> <after.json>
 *
 * Both files are tests/fixtures/ctc-golden-21.0.0.json as written by
 * generate-ctc-golden.ts (the before one from git, e.g.
 * `git show <commit>:tests/fixtures/ctc-golden-21.0.0.json`). Reported twice,
 * under the tool default options (asym+inter) and over all four option sets.
 * For every persona with any change it reports, over all 19 pages: totalCTC and
 * abandonmentRisk change (mean, mean absolute, max absolute and where), cells
 * changed, bottleneck changes, the scroll totalAbandonment change, and rank
 * moves among the 25 human personas on the 12 raw demands under the tool
 * default options (competition ranking, 1 = highest). Personas with no change
 * are counted, not listed.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { readFileSync } from "node:fs";

type Run = { totalCTC: number; abandonmentRisk: number; bottleneckLayer: string };
type Pin = {
  personas: string[];
  demands: string[];
  optionSets: string[];
  runs: Record<string, Record<string, Record<string, Run>>>;
  scroll: Record<string, Record<string, { totalAbandonment: number }>>;
};

const [beforePath, afterPath] = process.argv.slice(2);
const a = JSON.parse(readFileSync(beforePath, "utf8")) as Pin;
const b = JSON.parse(readFileSync(afterPath, "utf8")) as Pin;
const fmt = (x: number) => (x === 0 ? "0" : Math.abs(x) < 1e-4 ? x.toExponential(2) : x.toFixed(4));
const RAW = ["empty", "sparse", "light", "mid", "text-heavy", "visual-heavy", "control-heavy", "choice-heavy", "deep", "animated", "dense", "max"];
const HUMAN = a.personas.filter((p) => !p.startsWith("boundary-"));

function stats(ds: Array<{ at: string; d: number }>) {
  let sum = 0, abs = 0, max = 0, at = "-", changed = 0;
  for (const { at: where, d } of ds) {
    sum += d; abs += Math.abs(d);
    if (d !== 0) changed++;
    if (Math.abs(d) > max) { max = Math.abs(d); at = where; }
  }
  return { mean: sum / ds.length, meanAbs: abs / ds.length, max, at, changed, n: ds.length };
}

function ranks(pin: Pin, demand: string): Record<string, number> {
  const v = Object.fromEntries(HUMAN.map((p) => [p, pin.runs[p][demand]["asym+inter"].totalCTC]));
  return Object.fromEntries(HUMAN.map((p) => [p, 1 + HUMAN.filter((q) => v[q] > v[p]).length]));
}

for (const only of ["asym+inter", null]) {
  console.log(only ? `\n### Tool default (${only}): 19 pages\n` : "\n### All four option sets: 19 pages x 4\n");
  console.log("| persona | totalCTC mean Δ | mean abs Δ | max abs Δ (page, options) | cells changed | abandonment mean Δ | max abs Δ | bottleneck changes | scroll totalAbandonment mean Δ | max abs Δ | rank moves on 12 raw demands |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|");
  let unchanged = 0;
  for (const p of a.personas) {
    const ctc: Array<{ at: string; d: number }> = [], ab: Array<{ at: string; d: number }> = [];
    let bottleneck = 0;
    for (const d of a.demands) for (const o of a.optionSets.filter((x) => only === null || x === only)) {
      const x = a.runs[p][d][o], y = b.runs[p][d][o];
      ctc.push({ at: `${d}, ${o}`, d: y.totalCTC - x.totalCTC });
      ab.push({ at: `${d}, ${o}`, d: y.abandonmentRisk - x.abandonmentRisk });
      if (x.bottleneckLayer !== y.bottleneckLayer) bottleneck++;
    }
    const sc = stats(Object.keys(a.scroll[p]).map((k) => ({ at: k, d: b.scroll[p][k].totalAbandonment - a.scroll[p][k].totalAbandonment })));
    const c = stats(ctc), r = stats(ab);
    const rankMoves = HUMAN.includes(p) ? RAW.filter((d) => ranks(a, d)[p] !== ranks(b, d)[p]).map((d) => `${d} ${ranks(a, d)[p]} -> ${ranks(b, d)[p]}`) : [];
    if (c.changed === 0 && r.changed === 0 && sc.changed === 0 && bottleneck === 0) { unchanged++; continue; }
    console.log(`| ${p} | ${fmt(c.mean)} | ${fmt(c.meanAbs)} | ${fmt(c.max)} (${c.at}) | ${c.changed}/${c.n} | ${fmt(r.mean)} | ${fmt(r.max)} | ${bottleneck} | ${fmt(sc.mean)} | ${fmt(sc.max)} | ${rankMoves.length ? rankMoves.join("; ") : "none"} |`);
  }
  console.log(`\n${unchanged} of ${a.personas.length} personas unchanged (every chain and scroll number).`);
}
