/**
 * What the percentile scale changed: totalCTC before (the 21.0 logistic of
 * rawCTC, slope 2.5, centre 1.2) and after (rawCTC's percentile against the
 * reference set), over the golden matrix and over the reference pages
 * themselves.
 *
 * rawCTC is untouched by the change (the golden diff was confined to totalCTC,
 * screenCTC, reachWeightedCTC and capacityConsumed), so "before" is the old
 * logistic evaluated on today's rawCTC, with the same expression the 21.0
 * chain used. Pass the previous pin to check that bit for bit:
 *
 *   git show 0a974f1:tests/fixtures/ctc-golden-21.0.0.json > /tmp/pin-before.json
 *   bun research/ctc-percentile-deltas.ts [--before-pin /tmp/pin-before.json]
 *
 * Reports: distribution of totalCTC before and after (quantiles, share above
 * 0.95 and below 0.05), and Spearman rank correlation between old and new per
 * persona. Within one option set and scope both scales are monotone in rawCTC,
 * so that correlation is 1 except where the percentile ties at its ends; across
 * option sets it can fall, because each option pair has its own reference curve.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { readFileSync } from "node:fs";
import { ROSTER, OPTION_SETS, allDemands, schwartzFor, toolProfile } from "../tests/fixtures/ctc-golden-matrix.js";
import { computeDemandDistribution, computeSequentialCTC } from "../src/visual/cognitive-transport-chain.js";
import { referencePages, referencePopulation } from "../src/visual/ctc-reference.js";

const logistic = (raw: number) => 1 / (1 + Math.exp(-2.5 * (raw - 1.2)));

function quantiles(xs: number[]): string {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  return [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map((p) => q(p).toFixed(3)).join(" / ");
}
const share = (xs: number[], f: (x: number) => boolean) => `${xs.filter(f).length}/${xs.length} (${((100 * xs.filter(f).length) / xs.length).toFixed(1)}%)`;

/** Average ranks (ties share their mean rank). */
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

const args = process.argv.slice(2);
const pinPath = args.includes("--before-pin") ? args[args.indexOf("--before-pin") + 1] : undefined;
const pin = pinPath ? JSON.parse(readFileSync(pinPath, "utf8")) : undefined;

// ── Golden matrix: 25 human personas x 19 demands x 4 option sets ──
const personas = Object.keys(ROSTER);
const demands = allDemands();
type Cell = { persona: string; demand: string; opt: string; raw: number; before: number; after: number };
const cells: Cell[] = [];
let pinChecked = 0, pinMismatch = 0;
for (const name of personas) {
  const prof = toolProfile(name, ROSTER[name]);
  const sv = schwartzFor(name);
  for (const d of demands)
    for (const o of OPTION_SETS) {
      const { withValues, ...rest } = o.options;
      const r = computeSequentialCTC(prof, d.demand, withValues ? { ...rest, schwartzValues: sv.values } : rest);
      const before = logistic(r.rawCTC);
      cells.push({ persona: name, demand: d.id, opt: o.id, raw: r.rawCTC, before, after: r.totalCTC });
      if (pin) {
        pinChecked++;
        const old = pin.runs[name][d.id][o.id];
        if (!Object.is(old.totalCTC, before) || !Object.is(old.rawCTC, r.rawCTC)) pinMismatch++;
      }
    }
}

console.log("## Golden matrix (25 human personas x 19 demands x 4 option sets)\n");
if (pin) console.log(`previous pin: ${pinChecked} cells checked, ${pinMismatch} where its totalCTC is not the logistic of today's rawCTC bit for bit, or its rawCTC differs\n`);
for (const opt of ["all", ...OPTION_SETS.map((o) => o.id)]) {
  const sel = cells.filter((c) => opt === "all" || c.opt === opt);
  console.log(`- ${opt} (${sel.length} cells)`);
  console.log(`  before quantiles min/p10/p25/median/p75/p90/max: ${quantiles(sel.map((c) => c.before))}`);
  console.log(`  after  quantiles min/p10/p25/median/p75/p90/max: ${quantiles(sel.map((c) => c.after))}`);
  console.log(`  above 0.95: before ${share(sel.map((c) => c.before), (x) => x > 0.95)}, after ${share(sel.map((c) => c.after), (x) => x > 0.95)}`);
  console.log(`  below 0.05: before ${share(sel.map((c) => c.before), (x) => x < 0.05)}, after ${share(sel.map((c) => c.after), (x) => x < 0.05)}`);
  console.log(`  exactly 1 after: ${share(sel.map((c) => c.after), (x) => x === 1)}, exactly 0 after: ${share(sel.map((c) => c.after), (x) => x === 0)}`);
}

console.log("\n### Spearman rho, old vs new totalCTC, per persona (golden)\n");
console.log("| persona | tool default (19 pages) | all four option sets (76 cells) |");
console.log("|---|---|---|");
const rhoDefault: number[] = [], rhoAll: number[] = [];
for (const name of personas) {
  const def = cells.filter((c) => c.persona === name && c.opt === "asym+inter");
  const all = cells.filter((c) => c.persona === name);
  const a = spearman(def.map((c) => c.before), def.map((c) => c.after));
  const b = spearman(all.map((c) => c.before), all.map((c) => c.after));
  rhoDefault.push(a); rhoAll.push(b);
  console.log(`| ${name} | ${a.toFixed(4)} | ${b.toFixed(4)} |`);
}
console.log(`| min | ${Math.min(...rhoDefault).toFixed(4)} | ${Math.min(...rhoAll).toFixed(4)} |`);

// ── The reference set: graded pages x 25 personas, tool default options ──
console.log("\n## Reference set (graded pages x 25 personas, tool default options)\n");
const pop = referencePopulation();
for (const scope of ["viewport", "full_page"] as const) {
  const pages = referencePages(scope);
  const before: number[] = [], after: number[] = [];
  const perPersona = new Map<string, { b: number[]; a: number[] }>();
  for (const m of pages) {
    const demand = computeDemandDistribution(m);
    for (const p of pop) {
      const r = computeSequentialCTC({ name: p.name, traits: p.traits } as never, demand);
      before.push(logistic(r.rawCTC)); after.push(r.totalCTC);
      const e = perPersona.get(p.name) ?? { b: [], a: [] };
      e.b.push(logistic(r.rawCTC)); e.a.push(r.totalCTC);
      perPersona.set(p.name, e);
    }
  }
  console.log(`- ${scope}: ${pages.length} pages x ${pop.length} personas = ${before.length}`);
  console.log(`  before quantiles: ${quantiles(before)}`);
  console.log(`  after  quantiles: ${quantiles(after)}`);
  console.log(`  above 0.95: before ${share(before, (x) => x > 0.95)}, after ${share(after, (x) => x > 0.95)}`);
  console.log(`  below 0.05: before ${share(before, (x) => x < 0.05)}, after ${share(after, (x) => x < 0.05)}`);
  const rhos = [...perPersona.entries()].map(([n, e]) => [n, spearman(e.b, e.a)] as const);
  console.log(`  Spearman per persona over its ${pages.length} pages: min ${Math.min(...rhos.map((r) => r[1])).toFixed(4)}, max ${Math.max(...rhos.map((r) => r[1])).toFixed(4)}`);
  // Persona spread on the median page: does the scale still separate people?
  const medians = [...perPersona.entries()].map(([n, e]) => [n, [...e.a].sort((x, y) => x - y)[Math.floor(e.a.length / 2)], [...e.b].sort((x, y) => x - y)[Math.floor(e.b.length / 2)]] as const)
    .sort((x, y) => x[1] - y[1]);
  console.log(`  per-persona median totalCTC, after (before): lowest ${medians[0][0]} ${medians[0][1].toFixed(3)} (${medians[0][2].toFixed(3)}), highest ${medians[medians.length - 1][0]} ${medians[medians.length - 1][1].toFixed(3)} (${medians[medians.length - 1][2].toFixed(3)})`);
}
