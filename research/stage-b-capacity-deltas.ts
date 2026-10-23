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

console.log("### Capacities after (as the golden matrix builds them)\n");
console.log("| persona | motorCapacity | readingCapacity |");
console.log("|---|---|---|");
for (const p of Object.keys(ROSTER)) {
  const t = toolProfile(p, ROSTER[p]).traits as Record<string, number>;
  console.log(`| ${p} | ${f(t.motorCapacity)} | ${f(t.readingCapacity)} |`);
}
