/**
 * What Stage B part 1 (persona rates, rate-ratio capacities) moved in the CTC
 * golden matrix: per persona, rawCTC, totalCTC and abandonmentRisk over every
 * run (19 demands x 4 option sets), before (the pinned fixture) and after (the
 * matrix the current code builds). Run it BEFORE regenerating the fixture.
 *
 *   bun research/stage-b-capacity-deltas.ts > research/stage-b-capacity-deltas.tables.md
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildGoldenMatrix, ROSTER, toolProfile, type GoldenMatrix } from "../tests/fixtures/ctc-golden-matrix.js";

type Run = { rawCTC: number; totalCTC: number; abandonmentRisk: number };
// BEFORE: another pin to compare against (e.g. git show <commit>:tests/fixtures/ctc-golden-21.0.0.json > before.json).
const before = JSON.parse(readFileSync(process.env.BEFORE ?? join(import.meta.dir, "..", "tests", "fixtures", "ctc-golden-21.0.0.json"), "utf8")) as GoldenMatrix;
const after = buildGoldenMatrix();
const METRICS = ["rawCTC", "totalCTC", "abandonmentRisk"] as const;

function runs(m: GoldenMatrix, persona: string): Run[] {
  const out: Run[] = [];
  const byDemand = m.runs[persona] as unknown as Record<string, Record<string, Run>>;
  for (const d of Object.keys(byDemand)) for (const o of Object.keys(byDemand[d])) out.push(byDemand[d][o]);
  return out;
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const f = (x: number) => x.toFixed(3);
const s = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(3)}`;

let total = 0;
let changed = 0;
(function walk(x: unknown, y: unknown) {
  if (typeof x === "number") { total++; if (!Object.is(x, y)) changed++; return; }
  if (x && typeof x === "object") for (const k of Object.keys(x as object)) walk((x as Record<string, unknown>)[k], (y as Record<string, unknown> | undefined)?.[k]);
})({ runs: before.runs, scroll: before.scroll }, { runs: after.runs, scroll: after.scroll });
console.log(`${changed} of ${total} pinned numbers (runs and scroll) change.\n`);
console.log(`Runs per persona: ${runs(after, after.personas[0]).length}. "max abs change" is the largest absolute change over those runs.\n`);
for (const metric of METRICS) {
  console.log(`### ${metric}\n`);
  console.log("| persona | mean before | mean after | mean change | max abs change |");
  console.log("|---|---|---|---|---|");
  for (const p of after.personas) {
    const b = runs(before, p).map((r) => r[metric]);
    const a = runs(after, p).map((r) => r[metric]);
    const d = a.map((x, i) => x - b[i]);
    console.log(`| ${p} | ${f(mean(b))} | ${f(mean(a))} | ${s(mean(d))} | ${f(Math.max(...d.map(Math.abs)))} |`);
  }
  console.log("");
}

/** Spearman's rho with average ranks for ties. */
function spearman(x: number[], y: number[]): number {
  const rank = (v: number[]) => {
    const idx = v.map((_, i) => i).sort((i, j) => v[i] - v[j]);
    const r = new Array<number>(v.length);
    for (let i = 0; i < idx.length;) {
      let j = i;
      while (j + 1 < idx.length && v[idx[j + 1]] === v[idx[i]]) j++;
      for (let k = i; k <= j; k++) r[idx[k]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(x), ry = rank(y), mx = mean(rx), my = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < rx.length; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return dx === 0 || dy === 0 ? (dx === dy ? 1 : 0) : num / Math.sqrt(dx * dy);
}
{
  const all = after.personas.flatMap((p) => runs(before, p).map((r, i) => [r.totalCTC, runs(after, p)[i].totalCTC]));
  const perPersona = after.personas.map((p) => spearman(runs(before, p).map((r) => r.totalCTC), runs(after, p).map((r) => r.totalCTC)));
  // The personas' order on each page and option set: the comparison a customer reads.
  const cells = runs(after, after.personas[0]).map((_, i) => spearman(after.personas.map((p) => runs(before, p)[i].totalCTC), after.personas.map((p) => runs(after, p)[i].totalCTC)));
  const sorted = (v: number[]) => [...v].sort((p, q) => p - q);
  console.log("### Rank agreement of totalCTC (Spearman, before against after)\n");
  console.log(`- every run, all personas: ${spearman(all.map((r) => r[0]), all.map((r) => r[1])).toFixed(4)}`);
  console.log(`- each persona's runs (the pages' order for that persona): min ${Math.min(...perPersona).toFixed(4)}, median ${sorted(perPersona)[Math.floor(perPersona.length / 2)].toFixed(4)}`);
  console.log(`- each run's personas (the personas' order on that page): min ${Math.min(...cells).toFixed(4)}, median ${sorted(cells)[Math.floor(cells.length / 2)].toFixed(4)}\n`);
}

console.log("### Capacities after (as the golden matrix builds them)\n");
console.log("| persona | motorCapacity | readingCapacity |");
console.log("|---|---|---|");
for (const p of Object.keys(ROSTER)) {
  const t = toolProfile(p, ROSTER[p]).traits as Record<string, number>;
  console.log(`| ${p} | ${f(t.motorCapacity)} | ${f(t.readingCapacity)} |`);
}
