/**
 * Measure what each 21.0 chain fix moved, across the golden matrix inputs.
 *
 * Every tree is a checkout of src/ at one commit (git archive), with the SAME
 * tests/fixtures/ctc-golden-matrix.ts copied in, so the inputs are identical
 * and only the chain code differs. "Alone" trees are the 21.0 base (the rename
 * commit, numerically identical to 20.0.1) with one fix's diff applied.
 *
 *   bun research/ctc-21-deltas.ts label=<fromRoot>,<toRoot> [...] [--familiarity <root>]
 *
 * For each pair it reports, over the 25 human personas (the two synthetic
 * boundary personas are excluded), all reference pages and all four option
 * sets: the change in totalCTC and abandonmentRisk (mean, mean absolute, max
 * absolute, cells changed), bottleneck changes, scroll totalAbandonment, and how
 * many personas changed rank on the twelve raw demands (tool default options,
 * competition ranking, so ties are stable).
 *
 * --familiarity <root> compares, in that tree, the matrix with siteFamiliarity
 * at 0.0 against the same with it unset (read as chain.missingTraitCapacity,
 * 0.5): what cognitive_effort and site_cognitive_assessment did for a crawled
 * site before 21.0 versus what they do now.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { resolve, join } from "node:path";

type Cell = { ctc: number; ab: number; bottleneck: string };
type Matrix = {
  personas: string[];
  rawIds: string[];
  cells: Record<string, Cell>; // key persona|demand|option
  scroll: Record<string, number>; // key persona|input -> totalAbandonment
};

async function build(root: string, transform?: (traits: Record<string, number>) => Record<string, number>): Promise<Matrix> {
  const m = await import(join(root, "tests/fixtures/ctc-golden-matrix.ts"));
  const c = await import(join(root, "src/visual/cognitive-transport-chain.ts"));
  const t = await import(join(root, "src/visual/cognitive-transport.ts"));
  const personas = Object.keys(m.ROSTER);
  const cells: Matrix["cells"] = {};
  const scroll: Matrix["scroll"] = {};
  for (const name of personas) {
    let prof = m.toolProfile(name, m.ROSTER[name]);
    if (transform) prof = t.buildOTCognitiveProfile(name, transform({ ...prof.traits }));
    const sv = m.schwartzFor(name);
    for (const d of m.allDemands()) {
      for (const o of m.OPTION_SETS) {
        const { withValues, ...rest } = o.options;
        const r = c.computeSequentialCTC(prof, d.demand, withValues ? { ...rest, schwartzValues: sv.values } : rest);
        // The rename is a name, not a number: compare 20.0.1 and 21.0 on one vocabulary.
        cells[`${name}|${d.id}|${o.id}`] = { ctc: r.totalCTC, ab: r.abandonmentRisk, bottleneck: r.bottleneckLayer === "saliency" ? "visualComplexity" : r.bottleneckLayer };
      }
    }
    for (const s of m.SCROLL_INPUTS) {
      const r = c.computeSequentialScrollCTC(prof, s.screens.map((a: number[]) => c.computeDemandFromRawMetrics(...a)), { asymmetric: true, interactions: true });
      scroll[`${name}|${s.id}`] = r.totalAbandonment;
    }
  }
  return { personas, rawIds: m.RAW_DEMANDS.map((d: { id: string }) => d.id), cells, scroll };
}

function stats(deltas: Array<{ key: string; d: number }>) {
  let sum = 0, abs = 0, max = 0, at = "", changed = 0;
  for (const { key, d } of deltas) {
    sum += d; abs += Math.abs(d);
    if (d !== 0) changed++;
    if (Math.abs(d) > max) { max = Math.abs(d); at = key; }
  }
  const n = deltas.length || 1;
  return { mean: sum / n, meanAbs: abs / n, maxAbs: max, at, changed, n: deltas.length };
}

/** Personas whose competition rank (1 = highest) moved on at least one raw demand. */
function rankMoves(a: Matrix, b: Matrix, field: "ctc" | "ab") {
  const moved = new Set<string>();
  let moves = 0;
  for (const d of a.rawIds) {
    const rank = (m: Matrix) => {
      const v = Object.fromEntries(m.personas.map((p) => [p, m.cells[`${p}|${d}|asym+inter`][field]]));
      return Object.fromEntries(m.personas.map((p) => [p, 1 + m.personas.filter((q) => v[q] > v[p]).length]));
    };
    const ra = rank(a), rb = rank(b);
    for (const p of a.personas) if (ra[p] !== rb[p]) { moved.add(p); moves++; }
  }
  return { personas: moved.size, moves };
}

const fmt = (x: number) => (x === 0 ? "0" : Math.abs(x) < 1e-4 ? x.toExponential(2) : x.toFixed(4));

/** Restrict to one option set (the tools all run asym+inter) or, with null, keep all four. */
let OPTION_FILTER: string | null = null;

function compare(label: string, a: Matrix, b: Matrix) {
  const keys = Object.keys(a.cells).filter((k) => OPTION_FILTER === null || k.endsWith(`|${OPTION_FILTER}`));
  const ctc = stats(keys.map((k) => ({ key: k, d: b.cells[k].ctc - a.cells[k].ctc })));
  const ab = stats(keys.map((k) => ({ key: k, d: b.cells[k].ab - a.cells[k].ab })));
  const sc = stats(Object.keys(a.scroll).map((k) => ({ key: k, d: b.scroll[k] - a.scroll[k] })));
  const bottleneck = keys.filter((k) => a.cells[k].bottleneck !== b.cells[k].bottleneck).length;
  const rc = rankMoves(a, b, "ctc"), ra = rankMoves(a, b, "ab");
  console.log(`| ${label} | ${fmt(ctc.mean)} | ${fmt(ctc.maxAbs)} | ${ctc.changed}/${ctc.n} | ${fmt(ab.mean)} | ${fmt(ab.maxAbs)} | ${ab.changed}/${ab.n} | ${bottleneck} | ${rc.personas} (${rc.moves}) | ${ra.personas} (${ra.moves}) | ${fmt(sc.mean)} | ${fmt(sc.maxAbs)} |`);
  return { label, ctcAt: ctc.at, abAt: ab.at, scAt: sc.at, ctcMeanAbs: ctc.meanAbs, abMeanAbs: ab.meanAbs };
}

const args = process.argv.slice(2);
const pairs: Array<{ label: string; a: Matrix; b: Matrix }> = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--familiarity") {
    const root = resolve(args[++i]);
    const zero = await build(root);
    const unset = await build(root, (t) => { delete t.siteFamiliarity; return t; });
    pairs.push({ label: "fix 7: crawled site, before (unset, read as 0.5) -> after (0.0)", a: unset, b: zero });
    continue;
  }
  const [label, roots] = args[i].split("=");
  const [from, to] = roots.split(",").map((r) => resolve(r));
  pairs.push({ label, a: await build(from), b: await build(to) });
}
for (const filter of ["asym+inter", null]) {
  OPTION_FILTER = filter;
  console.log(filter ? `\n### Tool default (${filter}): 25 personas x 19 pages\n` : "\n### All four option sets: 25 personas x 19 pages x 4\n");
  console.log("| comparison | totalCTC mean Δ | totalCTC max abs Δ | cells changed | abandonment mean Δ | abandonment max abs Δ | cells changed | bottleneck changes | rank moves on 12 raw demands, CTC: personas (moves) | rank moves, abandonment: personas (moves) | scroll totalAbandonment mean Δ | scroll max abs Δ |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
  const notes = pairs.map((p) => compare(p.label, p.a, p.b));
  console.log("");
  for (const n of notes) console.log(`- ${n.label}: mean |Δ| totalCTC ${fmt(n.ctcMeanAbs)}, abandonment ${fmt(n.abMeanAbs)}; largest CTC move at ${n.ctcAt || "-"}, abandonment at ${n.abAt || "-"}, scroll at ${n.scAt || "-"}`);
}
