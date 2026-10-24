/**
 * What the two norm-anchored values moved in the CTC golden matrix.
 *
 *   bun research/persona-norms/ctc-deltas.ts <before.json> <after.json>
 *
 * Both files are tests/fixtures/ctc-golden-21.0.0.json as written by
 * generate-ctc-golden.ts; the before one from git
 * (`git show <commit>:tests/fixtures/ctc-golden-21.0.0.json`).
 *
 * The reference that totalCTC is a percentile of pools every built-in persona's
 * raw cost on every reference page, so changing one persona moves the curve
 * and every persona's percentile fields can shift. The report therefore keeps
 * two things apart:
 *   - a persona's own raw costs (rawCTC, additiveCTC, the layer and trait
 *     costs, everything the chain computes before the percentile);
 *   - the fields read off the percentile (totalCTC, abandonmentRisk, the
 *     scroll totals).
 * For each persona it prints rawCTC, totalCTC and abandonmentRisk deltas (mean
 * and max absolute, over the 19 demands, under the tool default options and
 * over all four option sets), then, for the whole matrix, which leaf fields
 * changed and for how many personas.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { readFileSync } from "node:fs";

type Run = Record<string, unknown> & { totalCTC: number; rawCTC: number; abandonmentRisk: number };
type Pin = {
  personas: string[];
  demands: string[];
  optionSets: string[];
  runs: Record<string, Record<string, Record<string, Run>>>;
  scroll: Record<string, Record<string, Record<string, unknown>>>;
};

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  console.error("usage: bun research/persona-norms/ctc-deltas.ts <before.json> <after.json>");
  process.exit(2);
}
const a = JSON.parse(readFileSync(beforePath, "utf8")) as Pin;
const b = JSON.parse(readFileSync(afterPath, "utf8")) as Pin;
for (const k of ["personas", "demands", "optionSets"] as const) {
  if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) throw new Error(`the two pins differ in ${k}`);
}

const fmt = (x: number) => (x === 0 ? "0" : Math.abs(x) < 1e-4 ? x.toExponential(2) : x.toFixed(4));

/** Every numeric leaf that differs, as [field path with indices stripped, delta]. */
function leafDiffs(x: unknown, y: unknown, path: string, out: Array<[string, number]>) {
  if (typeof x === "number" && typeof y === "number") {
    if (!Object.is(x, y)) out.push([path.replace(/\[\d+\]/g, "[]"), y - x]);
  } else if (Array.isArray(x) && Array.isArray(y)) {
    x.forEach((v, i) => leafDiffs(v, y[i], `${path}[${i}]`, out));
  } else if (x && y && typeof x === "object" && typeof y === "object") {
    for (const k of Object.keys(x)) leafDiffs((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k], `${path}.${k}`, out);
  } else if (x !== y) {
    out.push([path.replace(/\[\d+\]/g, "[]"), NaN]); // a text field, e.g. bottleneckLayer
  }
}

function stats(ds: number[]) {
  let sum = 0, max = 0;
  for (const d of ds) { sum += d; max = Math.max(max, Math.abs(d)); }
  return { mean: sum / ds.length, max, changed: ds.filter((d) => d !== 0).length, n: ds.length };
}

for (const only of ["asym+inter", null] as const) {
  console.log(only ? `\n### Tool default (${only}): 19 demands\n` : "\n### All four option sets: 19 demands x 4\n");
  console.log("| persona | rawCTC mean d | rawCTC max abs d | totalCTC mean d | totalCTC max abs d | totalCTC cells changed | abandonmentRisk mean d | abandonmentRisk max abs d |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const p of a.personas) {
    const raw: number[] = [], tot: number[] = [], ab: number[] = [];
    for (const d of a.demands) for (const o of a.optionSets.filter((x) => only === null || x === only)) {
      const x = a.runs[p][d][o], y = b.runs[p][d][o];
      raw.push(y.rawCTC - x.rawCTC);
      tot.push(y.totalCTC - x.totalCTC);
      ab.push(y.abandonmentRisk - x.abandonmentRisk);
    }
    const r = stats(raw), t = stats(tot), q = stats(ab);
    console.log(`| ${p} | ${fmt(r.mean)} | ${fmt(r.max)} | ${fmt(t.mean)} | ${fmt(t.max)} | ${t.changed}/${t.n} | ${fmt(q.mean)} | ${fmt(q.max)} |`);
  }
}

// Which fields moved, per persona. A persona whose own values did not change
// should move only in fields read off the percentile.
const byField = new Map<string, { personas: Set<string>; numbers: number; maxAbs: number; text?: boolean }>();
const byPersona = new Map<string, Set<string>>();
/** Per persona and field: values changed, sum of deltas, max abs delta (numbers only). */
const perPersonaField = new Map<string, { n: number; sum: number; maxAbs: number }>();
let total = 0;
for (const p of a.personas) {
  const out: Array<[string, number]> = [];
  leafDiffs(a.runs[p], b.runs[p], "runs", out);
  leafDiffs(a.scroll[p], b.scroll[p], "scroll", out);
  const fields = new Set<string>();
  for (const [path, d] of out) {
    // runs.<demand>.<options>.<field...> -> runs.<field...>; scroll.<input>.<field...> -> scroll.<field...>
    const parts = path.split(".");
    const field = parts[0] === "runs" ? `runs.${parts.slice(3).join(".")}` : `scroll.${parts.slice(2).join(".")}`;
    fields.add(field);
    const f = byField.get(field) ?? { personas: new Set<string>(), numbers: 0, maxAbs: 0 };
    f.personas.add(p); f.numbers++;
    if (!Number.isNaN(d)) f.maxAbs = Math.max(f.maxAbs, Math.abs(d));
    else f.text = true;
    byField.set(field, f);
    if (!Number.isNaN(d)) {
      const k = `${p}\t${field}`, g = perPersonaField.get(k) ?? { n: 0, sum: 0, maxAbs: 0 };
      g.n++; g.sum += d; g.maxAbs = Math.max(g.maxAbs, Math.abs(d));
      perPersonaField.set(k, g);
    }
  }
  total += out.length;
  byPersona.set(p, fields);
}

console.log(`\n### Fields that changed (${total} values in all)\n`);
console.log("| field | personas | values | max abs d |");
console.log("|---|---|---|---|");
for (const [field, f] of [...byField].sort((x, y) => y[1].numbers - x[1].numbers)) {
  console.log(`| ${field} | ${f.personas.size} | ${f.numbers} | ${f.text ? "(text)" : fmt(f.maxAbs)} |`);
}

console.log("\n### Fields changed, by persona\n");
const groups = new Map<string, string[]>();
for (const [p, fields] of byPersona) {
  const key = [...fields].sort().join(", ") || "(nothing)";
  groups.set(key, [...(groups.get(key) ?? []), p]);
}
for (const [fields, personas] of groups) console.log(`- ${personas.length} persona(s) [${personas.join(", ")}]: ${fields}`);

console.log("\n### Per persona and field: the values that moved\n");
console.log("| persona | field | values changed | mean d | max abs d |");
console.log("|---|---|---|---|---|");
for (const [k, g] of [...perPersonaField].sort()) {
  const [p, field] = k.split("\t");
  console.log(`| ${p} | ${field} | ${g.n} | ${fmt(g.sum / g.n)} | ${fmt(g.maxAbs)} |`);
}
