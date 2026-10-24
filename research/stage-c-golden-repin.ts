/**
 * The golden re-pin's delta against another pin (BEFORE, default the fixture
 * on disk), for the commit message: numbers moved, per-persona mean and max
 * abs change of totalCTC over the runs, and the Spearman rank correlation of
 * totalCTC before and after over every run (and per persona). Run BEFORE
 * regenerating the fixture.
 *
 *   BEFORE=pin.json bun research/stage-c-golden-repin.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildGoldenMatrix, type GoldenMatrix } from "../tests/fixtures/ctc-golden-matrix.js";

const before = JSON.parse(readFileSync(process.env.BEFORE ?? join(import.meta.dir, "..", "tests", "fixtures", "ctc-golden-21.0.0.json"), "utf8")) as GoldenMatrix;
const after = buildGoldenMatrix();

let total = 0, changed = 0;
(function walk(x: unknown, y: unknown) {
  if (typeof x === "number") { total++; if (!Object.is(x, y)) changed++; return; }
  if (x && typeof x === "object") for (const k of Object.keys(x as object)) walk((x as Record<string, unknown>)[k], (y as Record<string, unknown> | undefined)?.[k]);
})({ runs: before.runs, scroll: before.scroll }, { runs: after.runs, scroll: after.scroll });

const totals = (m: GoldenMatrix, p: string) => {
  const out: number[] = [];
  const byDemand = m.runs[p] as unknown as Record<string, Record<string, { totalCTC: number }>>;
  for (const d of Object.keys(byDemand)) for (const o of Object.keys(byDemand[d])) out.push(byDemand[d][o].totalCTC);
  return out;
};
const rank = (xs: number[]) => {
  const idx = xs.map((x, i) => [x, i] as [number, number]).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; }
  return r;
};
const pearson = (a: number[], b: number[]) => {
  const n = a.length, ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db);
};
const spearman = (a: number[], b: number[]) => pearson(rank(a), rank(b));

console.log(`${changed} of ${total} pinned numbers (runs and scroll) move.`);
const allB: number[] = [], allA: number[] = [];
const rows: string[] = [];
for (const p of after.personas) {
  if (!before.runs[p]) { rows.push(`${p}: not in the pin`); continue; }
  const b = totals(before, p), a = totals(after, p);
  allB.push(...b); allA.push(...a);
  const d = a.map((x, i) => x - b[i]);
  const mean = d.reduce((s, x) => s + x, 0) / d.length;
  rows.push(`${p}: totalCTC mean change ${mean >= 0 ? "+" : ""}${mean.toFixed(3)}, max abs ${Math.max(...d.map(Math.abs)).toFixed(3)}, Spearman ${spearman(b, a).toFixed(3)}`);
}
console.log(`Spearman of totalCTC over all ${allB.length} runs: ${spearman(allB, allA).toFixed(4)}.`);
for (const r of rows) console.log(r);
