/**
 * ISC-42: one-at-a-time sensitivity of rawCTC (and totalCTC) to every registered
 * constant the golden matrix reads.
 *
 * WHICH CONSTANTS. Not a hand-made list: every id that param() reads while the
 * golden matrix is computed (tests/fixtures/ctc-golden-matrix.ts: the 25 human
 * personas built as cognitive_effort builds them, the three boundary personas,
 * the 19 demand vectors under the four option sets, and the four multi-screen
 * scroll inputs), recorded by the registry's own process-wide session
 * (startProvenanceRecording), which also sees the persona-model reads and the
 * reference curve the percentile is read from. Every status is included.
 *
 * WHAT IS PERTURBED. One constant at a time, x0.9 and x1.1, through
 * withParamOverrides (the registry's hook; src/ is untouched). A constant whose
 * source states a range is also set to each end of it (RANGES below, each with
 * the words of its source that state it, checked against the registry text).
 * Each perturbation recomputes everything inside the override: personas (their
 * capacity bridges read persona rates), demands (the demand curves and law
 * constants), the chain, and the reference curves (the curve cache keys on the
 * override set, so totalCTC is ranked against references built with the same
 * constants).
 *
 * CELLS. 28 personas x 19 demands x 4 option sets = 2,128 chain runs, plus each
 * screen of the four scroll inputs (3 + 5 + 8 + 2 = 18 screens x 28 personas =
 * 504), each screen's rawCTC read unrounded from computeSequentialCTC with the
 * carried capacity exactly as computeSequentialScrollCTC passes it.
 *
 * MEASURES, per constant over both directions: median and max |delta rawCTC|
 * over cells, the share of cells whose |delta rawCTC| > 0.01, and the Spearman
 * correlation (average ranks) of each persona's order of the 19 demands before
 * and after, under the tools' default options (asymmetric + interactions), the
 * minimum across personas. The same three for totalCTC beside them, because the
 * reference curve is rebuilt from normalised metrics and a percentile can hide a
 * raw move (or show one the raw cost does not make).
 *
 * Deterministic and seedless: nothing here draws a random number. The reference
 * curve's bootstrap interval has a registered seed (ctcReference.interval.seed),
 * but the interval is not measured here.
 *
 * REAL PAGES (--real-pages). The golden matrix gives its pages as law times, so
 * the published law constants and the page-metric normalisers cannot move its
 * rawCTC. This mode uses the 514 reference pages' raw measurements as the pages
 * instead, at both scopes, each re-derived by deriveMetrics inside every
 * override, with the same 28 personas and 4 option sets (no scroll inputs). Its
 * baseline check: the 25 human personas' costs under the default options equal
 * the reference curve's own samples, value for value, at each scope. Its table
 * adds the golden-matrix max |delta rawCTC| beside each row.
 *
 * Usage (as the tree's owner, worktree root):
 *   bun research/sensitivity/sensitivity.ts                 golden matrix -> sensitivity.json, table.md
 *   bun research/sensitivity/sensitivity.ts --real-pages    reference pages -> sensitivity-real-pages.json, table-real-pages.md
 *   bun research/sensitivity/sensitivity.ts --probe         read set and the cost of one perturbation (either mode)
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  MODEL_PROVENANCE, withParamOverrides, startProvenanceRecording, stopProvenanceRecording,
} from "../../src/visual/model-provenance.js";
import { computeDemandDistribution, computeSequentialCTC, ctcReferenceCurve } from "../../src/visual/cognitive-transport-chain.js";
import { buildOTCognitiveProfile, deriveMetrics } from "../../src/visual/cognitive-transport.js";
import { CTC_REFERENCE, referenceGraded, referenceRaw } from "../../src/visual/ctc-reference.js";
import {
  ROSTER, BOUNDARY_PERSONAS, OPTION_SETS, SCROLL_INPUTS, allDemands, rawDemand, schwartzFor, toolProfile,
} from "../../tests/fixtures/ctc-golden-matrix.js";

const HERE = import.meta.dir;
const ROOT = join(HERE, "..", "..");
const FACTORS = [0.9, 1.1];
const MOVE = 0.01;
const DEFAULT_OPTIONS = "asym+inter";
const REAL = process.argv.includes("--real-pages");
const SCOPES = ["viewport", "full_page"] as const;

/**
 * Registered ranges, where a source states one. Each entry quotes the words of
 * the source that state the range; the script refuses to run if the registry
 * text no longer contains them. Filled from a read of every read constant's
 * source (see table.md); empty where no source states a range.
 */
const RANGES: Record<string, { lo: number; hi: number; quote: string; note: string }> = {
  // The only read constant whose source states an uncertainty: Card, Moran & Newell's standard error of
  // estimate. Not a registered range; plus and minus two of it, labelled as this script's construction.
  "law.klm.mentalPreparation": { lo: 1.35 - 2 * 0.11, hi: 1.35 + 2 * 0.11, quote: "standard error of estimate = .11 sec",
                                 note: "+-2 x the quoted standard error of estimate (0.11 s); not a registered range" },
};

/** A zero-valued constant is moved by this much, absolutely, in each direction: a relative change cannot move it. */
const ZERO_STEP = 0.1;

// ── The matrix ──

interface Cell { persona: string; kind: "run" | "scroll"; page: string; variant: string }

function matrix(cells?: Cell[]): { raw: Float64Array; total: Float64Array } {
  const personas = [...Object.keys(ROSTER), ...Object.keys(BOUNDARY_PERSONAS)];
  const demands = allDemands();
  const raw: number[] = [], total: number[] = [];
  for (const name of personas) {
    const profile = name in BOUNDARY_PERSONAS ? buildOTCognitiveProfile(name, { ...BOUNDARY_PERSONAS[name] }) : toolProfile(name, ROSTER[name]);
    const sv = schwartzFor(name);
    for (const d of demands) {
      for (const o of OPTION_SETS) {
        const { withValues, ...rest } = o.options;
        const r = computeSequentialCTC(profile, d.demand, withValues ? { ...rest, schwartzValues: sv.values } : rest);
        raw.push(r.rawCTC); total.push(r.totalCTC);
        cells?.push({ persona: name, kind: "run", page: d.id, variant: o.id });
      }
    }
    for (const s of SCROLL_INPUTS) {
      let carried: Record<string, number> | undefined;
      s.screens.forEach((a, i) => {
        const r = computeSequentialCTC(profile, rawDemand(a, s.seconds), { asymmetric: true, interactions: true, carriedCapacity: carried });
        carried = r.remainingCapacity;
        raw.push(r.rawCTC); total.push(r.totalCTC);
        cells?.push({ persona: name, kind: "scroll", page: s.id, variant: `screen ${i + 1}` });
      });
    }
  }
  return { raw: Float64Array.from(raw), total: Float64Array.from(total) };
}

/** The real-page matrix: 28 personas x the reference pages' raws at both scopes x 4 option sets, all derived inside the override. */
function realMatrix(cells?: Cell[]): { raw: Float64Array; total: Float64Array } {
  const personas = [...Object.keys(ROSTER), ...Object.keys(BOUNDARY_PERSONAS)];
  const urls = referenceGraded().map((r) => r.url);
  const pages = SCOPES.flatMap((scope) => {
    const raws = referenceRaw(scope);
    if (raws.length !== urls.length) throw new Error(`${scope}: ${raws.length} raws for ${urls.length} graded pages`);
    return raws.map((r, i) => ({ id: `${scope}:${urls[i]}`, demand: computeDemandDistribution(deriveMetrics(r)) }));
  });
  const raw: number[] = [], total: number[] = [];
  for (const name of personas) {
    const profile = name in BOUNDARY_PERSONAS ? buildOTCognitiveProfile(name, { ...BOUNDARY_PERSONAS[name] }) : toolProfile(name, ROSTER[name]);
    const sv = schwartzFor(name);
    for (const d of pages) {
      for (const o of OPTION_SETS) {
        const { withValues, ...rest } = o.options;
        const r = computeSequentialCTC(profile, d.demand, withValues ? { ...rest, schwartzValues: sv.values } : rest);
        raw.push(r.rawCTC); total.push(r.totalCTC);
        cells?.push({ persona: name, kind: "run", page: d.id, variant: o.id });
      }
    }
  }
  return { raw: Float64Array.from(raw), total: Float64Array.from(total) };
}

const build = (cells?: Cell[]) => (REAL ? realMatrix(cells) : matrix(cells));

/**
 * The real-page baseline must be the reference's own sample: under the default options, the 25 human
 * personas' rawCTC on the reference pages at a scope are exactly the costs that scope's curve was built from.
 */
function checkAgainstCurve(cells: Cell[], base: { raw: Float64Array }): { scope: string; samples: number; distinct: number }[] {
  return SCOPES.map((scope) => {
    const mine = cells.map((c, i) => (c.persona in ROSTER && c.variant === DEFAULT_OPTIONS && c.page.startsWith(`${scope}:`) ? base.raw[i] : NaN))
      .filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
    const ref = ctcReferenceCurve(scope, { asymmetric: true, interactions: true });
    const distinct = mine.filter((x, i) => i === 0 || x !== mine[i - 1]);
    if (mine.length !== ref.curve.samples || distinct.length !== ref.curve.xs.length || distinct.some((x, i) => !Object.is(x, ref.curve.xs[i])))
      throw new Error(`${scope}: baseline costs are not the reference curve's samples`);
    return { scope, samples: mine.length, distinct: distinct.length };
  });
}

/**
 * The baseline must BE the golden matrix: every run cell's rawCTC and totalCTC Object.is-equal to the pin
 * tests/ctc-golden.test.ts asserts, and every scroll screen's rounded totalCTC equal to its pinned screenCTC.
 */
function checkAgainstPin(cells: Cell[], base: { raw: Float64Array; total: Float64Array }): { file: string; runCells: number; scrollScreens: number } {
  const file = readdirSync(join(ROOT, "tests", "fixtures")).filter((f) => /^ctc-golden-\d+\.\d+\.\d+\.json$/.test(f)).sort().pop()!;
  const pin = JSON.parse(readFileSync(join(ROOT, "tests", "fixtures", file), "utf8"));
  let runs = 0, screens = 0;
  cells.forEach((c, i) => {
    if (c.kind === "run") {
      const r = pin.runs[c.persona][c.page][c.variant];
      if (!Object.is(r.rawCTC, base.raw[i]) || !Object.is(r.totalCTC, base.total[i])) throw new Error(`baseline differs from ${file} at ${c.persona} ${c.page} ${c.variant}`);
      runs++;
    } else {
      const sc = pin.scroll[c.persona][c.page].screens[Number(c.variant.split(" ")[1]) - 1];
      if (sc.screenCTC !== Math.round(base.total[i] * 1000) / 1000) throw new Error(`baseline differs from ${file} at ${c.persona} ${c.page} ${c.variant}`);
      screens++;
    }
  });
  return { file, runCells: runs, scrollScreens: screens };
}

// ── Statistics ──

function ranks(v: number[]): number[] {
  const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(v.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}

function pearson(a: number[], b: number[]): number {
  const n = a.length, ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return saa === 0 || sbb === 0 ? NaN : sab / Math.sqrt(saa * sbb);
}

const spearman = (a: number[], b: number[]) => pearson(ranks(a), ranks(b));
const median = (v: number[]) => { const s = [...v].sort((x, y) => x - y); const h = (s.length - 1) / 2; return (s[Math.floor(h)] + s[Math.ceil(h)]) / 2; };

/** Per-persona demand order under the default options: persona -> indices of its run cells, in demand order. */
function orderGroups(cells: Cell[]): Map<string, number[]> {
  const g = new Map<string, number[]>();
  cells.forEach((c, i) => {
    if (c.kind !== "run" || c.variant !== DEFAULT_OPTIONS) return;
    const key = c.page.includes(":") ? `${c.persona}|${c.page.split(":")[0]}` : c.persona;
    if (!g.has(key)) g.set(key, []);
    g.get(key)!.push(i);
  });
  return g;
}

interface Effect {
  medianAbs: number; maxAbs: number; shareMoved: number; minSpearman: number; spearmanUndefined: number;
  /** The same over the 25 human personas' cells only: the boundary personas are synthetic and pin branches no person reaches. */
  maxAbsHuman: number; shareMovedHuman: number;
}

let HUMAN: boolean[] = [];

function effect(base: Float64Array, runs: Float64Array[], groups: Map<string, number[]>): Effect {
  const abs: number[] = [];
  let moved = 0, movedH = 0, nH = 0, maxH = 0;
  for (let i = 0; i < base.length; i++) {
    let m = 0;
    for (const r of runs) m = Math.max(m, Math.abs(r[i] - base[i]));
    abs.push(m);
    if (m > MOVE) moved++;
    if (HUMAN[i]) { nH++; maxH = Math.max(maxH, m); if (m > MOVE) movedH++; }
  }
  let minS = 1, undef = 0;
  for (const idx of groups.values()) {
    const b = idx.map((i) => base[i]);
    for (const r of runs) {
      const s = spearman(b, idx.map((i) => r[i]));
      if (Number.isNaN(s)) { undef++; continue; }
      minS = Math.min(minS, s);
    }
  }
  return { medianAbs: median(abs), maxAbs: Math.max(...abs), shareMoved: moved / base.length, minSpearman: minS, spearmanUndefined: undef,
           maxAbsHuman: maxH, shareMovedHuman: nH ? movedH / nH : 0 };
}

// ── Registry audit ──

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

async function audit(read: Set<string>) {
  const isRegistry = (rel: string) => rel.startsWith("src/visual/provenance/") || rel === "src/visual/model-provenance.ts";
  const files = walk(join(ROOT, "src"));
  const ids = new Set(Object.keys(MODEL_PROVENANCE));
  const referenced = new Map<string, Set<string>>();   // id -> non-registry files that name it in a string
  const templates: Array<{ prefix: string; file: string }> = [];
  const direct: Array<{ file: string; line: number; text: string }> = [];
  const moduleLevel: Array<{ file: string; line: number; text: string }> = [];
  for (const f of files) {
    const rel = relative(ROOT, f);
    if (isRegistry(rel)) continue;
    const lines = readFileSync(f, "utf8").split("\n");
    lines.forEach((ln, i) => {
      for (const m of ln.matchAll(/(['"`])([A-Za-z][\w-]*(?:\.[\w-]+)+)\1/g)) {
        if (!ids.has(m[2])) continue;
        if (!referenced.has(m[2])) referenced.set(m[2], new Set());
        referenced.get(m[2])!.add(rel);
      }
      for (const m of ln.matchAll(/`([A-Za-z][\w-]*\.[^`$]*)\$\{/g)) templates.push({ prefix: m[1], file: rel });
      if (/MODEL_PROVENANCE\s*\[/.test(ln) && !/^\s*(\/\/|\*)/.test(ln)) direct.push({ file: rel, line: i + 1, text: ln.trim() });
      if (/^(export\s+)?const\s+\w+\s*=\s*param\(/.test(ln)) moduleLevel.push({ file: rel, line: i + 1, text: ln.trim() });
    });
  }
  // The matrix's own fixtures read the registry directly too.
  for (const f of walk(join(ROOT, "tests", "fixtures"))) {
    const rel = relative(ROOT, f);
    readFileSync(f, "utf8").split("\n").forEach((ln, i) => {
      if (/MODEL_PROVENANCE\s*\[/.test(ln) && !/^\s*(\/\/|\*)/.test(ln)) direct.push({ file: rel, line: i + 1, text: ln.trim() });
    });
  }
  // Groups whose provenance file says its entries are catalogued from data, not read through param().
  const catalogued = new Map<string, string>();       // id -> provenance file
  for (const f of walk(join(ROOT, "src", "visual", "provenance"))) {
    if (!/CATALOGUED, NOT READ THROUGH param\(\)/.test(readFileSync(f, "utf8"))) continue;
    const mod = await import(f);
    for (const v of Object.values(mod)) {
      if (!Array.isArray(v)) continue;
      for (const e of v) if (e && typeof e === "object" && typeof (e as { id?: unknown }).id === "string" && ids.has((e as { id: string }).id)) catalogued.set((e as { id: string }).id, relative(ROOT, f));
    }
  }
  const all = [...ids].sort();
  const readersOf = (id: string) => {
    const s = new Set(referenced.get(id) ?? []);
    for (const t of templates) if (id.startsWith(t.prefix)) s.add(t.file);
    return [...s].sort();
  };
  const byGroup = (list: string[]) => list.reduce((g: Record<string, number>, id) => ((g[id.split(".")[0]] = (g[id.split(".")[0]] ?? 0) + 1), g), {});
  const notRead = all.filter((id) => !read.has(id));
  const cat = notRead.filter((id) => catalogued.has(id));
  const elsewhere = notRead.filter((id) => !catalogued.has(id) && readersOf(id).length > 0);
  const noReader = notRead.filter((id) => !catalogued.has(id) && readersOf(id).length === 0);
  // Registered values computed at load from other registered values (persona-rates.ts: ratio("law.rate...")):
  // an override of the source constant never reaches the derived entry the chain reads.
  const derived: Array<{ id: string; from: string[] }> = [];
  const rates = readFileSync(join(ROOT, "src", "visual", "provenance", "persona-rates.ts"), "utf8");
  for (const m of rates.matchAll(/(entry|custom)\("([^"]+)",\s*"(\w+)",\s*ratio\("([^"]+)",\s*"([^"]+)"\)/g)) {
    const id = `${m[1] === "entry" ? "personaRate" : "customRate"}.${m[2]}.${m[3]}`;
    if (ids.has(id)) derived.push({ id, from: [m[4], m[5]] });
  }
  return {
    registered: all.length, readByMatrix: read.size,
    catalogued: { count: cat.length, byGroup: byGroup(cat), files: [...new Set(cat.map((id) => catalogued.get(id)!))].sort() },
    elsewhere: { count: elsewhere.length, byGroup: byGroup(elsewhere) },
    chainPathNotInMatrix: elsewhere.filter((id) => /^(chain|law|pageMetrics|ctcReference|personaRate|customRate|profile)\./.test(id))
      .map((id) => ({ id, status: MODEL_PROVENANCE[id].status, readers: readersOf(id) })),
    noReader: noReader.map((id) => ({ id, status: MODEL_PROVENANCE[id].status })), noReaderByGroup: byGroup(noReader),
    directReads: direct, moduleLevelCaptures: moduleLevel, derivedAtLoad: derived,
  };
}

// ── Run ──

function git(args: string[]): string {
  const r = Bun.spawnSync(["git", ...args], { cwd: HERE });
  return r.exitCode === 0 ? r.stdout.toString().trim() : "unknown";
}

async function main() {
  const probe = process.argv.includes("--probe");
  const t0 = performance.now();
  for (const [id, r] of Object.entries(RANGES)) {
    const e = MODEL_PROVENANCE[id];
    if (!e) throw new Error(`range for unregistered ${id}`);
    if (!e.source.includes(r.quote)) throw new Error(`${id}: source no longer says "${r.quote}"`);
  }

  // Baseline, on a cold cache, under the process-wide recording: the read set.
  startProvenanceRecording();
  const cells: Cell[] = [];
  const base = build(cells);
  const read = stopProvenanceRecording();
  const tBase = performance.now() - t0;
  const ids = [...read].sort();
  const groups = orderGroups(cells);
  HUMAN = cells.map((c) => c.persona in ROSTER);
  const pin = REAL ? checkAgainstCurve(cells, base) : checkAgainstPin(cells, base);
  const reg = await audit(read);

  if (probe) {
    const t1 = performance.now();
    const one = withParamOverrides({ "chain.depletionRate": MODEL_PROVENANCE["chain.depletionRate"].value * 1.1 }, () => build());
    const tOne = performance.now() - t1;
    const zero = ids.filter((id) => MODEL_PROVENANCE[id].value === 0);
    console.log(JSON.stringify({ cells: cells.length, read: ids.length, baselineMs: Math.round(tBase), onePerturbationMs: Math.round(tOne),
      depletionRateEffect: effect(base.raw, [one.raw], groups), zeroValued: zero,
      readByGroup: ids.reduce((g: Record<string, number>, id) => ((g[id.split(".")[0]] = (g[id.split(".")[0]] ?? 0) + 1), g), {}),
      audit: reg }, null, 1));
    return;
  }

  const rows = [];
  for (const id of ids) {
    const e = MODEL_PROVENANCE[id];
    const runs: Array<{ label: string; value: number; raw?: Float64Array; total?: Float64Array; refused?: string }> = [];
    const points = e.value === 0
      ? [{ label: "x0.9", value: -ZERO_STEP }, { label: "x1.1", value: ZERO_STEP }]
      : FACTORS.map((f) => ({ label: `x${f}`, value: e.value * f }));
    if (RANGES[id]) points.push({ label: "range lo", value: RANGES[id].lo }, { label: "range hi", value: RANGES[id].hi });
    for (const p of points) {
      try {
        const m = withParamOverrides({ [id]: p.value }, () => build());
        runs.push({ label: p.label, value: p.value, raw: m.raw, total: m.total });
      } catch (err) {
        runs.push({ label: p.label, value: p.value, refused: (err as Error).message.slice(0, 160) });
      }
    }
    const tenPct = runs.filter((r) => r.raw && r.label.startsWith("x"));
    const range = runs.filter((r) => r.raw && r.label.startsWith("range"));
    rows.push({
      id, status: e.status, value: e.value,
      raw: tenPct.length ? effect(base.raw, tenPct.map((r) => r.raw!), groups) : null,
      total: tenPct.length ? effect(base.total, tenPct.map((r) => r.total!), groups) : null,
      rangeRaw: range.length ? effect(base.raw, range.map((r) => r.raw!), groups) : null,
      rangeTotal: range.length ? effect(base.total, range.map((r) => r.total!), groups) : null,
      refused: runs.filter((r) => r.refused).map((r) => ({ label: r.label, value: r.value, error: r.refused })),
      perturbation: e.value === 0 ? `value 0: moved to -${ZERO_STEP} and +${ZERO_STEP} absolutely` : "x0.9 and x1.1",
    });
  }
  rows.sort((a, b) => (b.raw?.maxAbs ?? -1) - (a.raw?.maxAbs ?? -1) || (b.total?.maxAbs ?? -1) - (a.total?.maxAbs ?? -1) || a.id.localeCompare(b.id));
  // Real-page mode: each constant's golden-matrix result beside it (from this script's own golden run).
  let golden: Record<string, { maxAbs: number | null; maxAbsHuman: number | null }> | null = null;
  if (REAL) {
    const g = JSON.parse(readFileSync(join(HERE, "sensitivity.json"), "utf8"));
    golden = Object.fromEntries(g.rows.map((r: { id: string; raw: Effect | null }) => [r.id, { maxAbs: r.raw?.maxAbs ?? null, maxAbsHuman: r.raw?.maxAbsHuman ?? null }]));
    for (const r of rows as Array<Record<string, unknown>>) r.golden = golden[r.id as string] ?? null;
  }
  const seconds = (performance.now() - t0) / 1000;
  const out = {
    provenance: { git_head: git(["rev-parse", "HEAD"]), src_tree: git(["rev-parse", "HEAD:src"]), src_dirty: git(["status", "--porcelain", "--", ":/src"]).length > 0,
                  runtime: `bun ${Bun.version}`, ran: new Date().toISOString() },
    reference: CTC_REFERENCE.id, cells: cells.length, runCells: cells.filter((c) => c.kind === "run").length,
    scrollCells: cells.filter((c) => c.kind === "scroll").length, personas: groups.size,
    factors: FACTORS, moveThreshold: MOVE, spearmanOptions: DEFAULT_OPTIONS, ranges: RANGES,
    constants: ids.length, seconds: Math.round(seconds), mode: REAL ? "real-pages" : "golden",
    ...(REAL ? { baselineEqualsCurve: pin, pages: referenceGraded().length } : { baselineEqualsPin: pin }), registry: reg, rows,
  };
  const [jsonName, mdName] = REAL ? ["sensitivity-real-pages.json", "table-real-pages.md"] : ["sensitivity.json", "table.md"];
  writeFileSync(join(HERE, jsonName), JSON.stringify(out, null, 1) + "\n");
  writeFileSync(join(HERE, mdName), table(out));
  console.log(`${ids.length} constants x ${FACTORS.length} perturbations over ${cells.length} cells in ${Math.round(seconds)} s; wrote ${jsonName} and ${mdName}`);
}

// ── table.md ──

function fmt(x: number | undefined | null, d = 4): string {
  if (x === undefined || x === null || Number.isNaN(x)) return "-";
  if (x === 0) return "0";
  return Math.abs(x) < 10 ** -d ? x.toExponential(1) : x.toFixed(d);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function table(o: any): string {
  const rows = o.rows as Array<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const top10 = rows.slice(0, 10);
  const flagged = top10.filter((r) => r.status === "hypothesis");
  const L: string[] = [];
  const real = o.mode === "real-pages";
  const where = real ? "the real-page matrix" : "the golden matrix";
  L.push(real ? "# ISC-42 on real pages: sensitivity of rawCTC to every chain constant over the reference pages" : "# ISC-42: sensitivity of rawCTC to every chain constant", "");
  const check = real
    ? `Under the default options the 25 human personas' unperturbed costs equal the reference curves' own samples, value for value (${o.baselineEqualsCurve.map((c: any) => `${c.scope}: ${c.samples} samples, ${c.distinct} distinct`).join("; ")}).` // eslint-disable-line @typescript-eslint/no-explicit-any
    : `The unperturbed matrix equals the pin \`tests/fixtures/${o.baselineEqualsPin.file}\` on all ${o.baselineEqualsPin.runCells} run cells (rawCTC and totalCTC, Object.is) and ${o.baselineEqualsPin.scrollScreens} scroll screens (rounded screenCTC).`;
  L.push(`Generated by \`research/sensitivity/sensitivity.ts${real ? " --real-pages" : ""}\` at ${o.provenance.git_head.slice(0, 7)} (src tree ${o.provenance.src_tree.slice(0, 7)}${o.provenance.src_dirty ? ", src DIRTY" : ""}), reference \`${o.reference}\`. Deterministic; no random draws. Run time ${o.seconds} s. ${check}`, "");
  const rangeText = Object.entries(o.ranges as Record<string, { lo: number; hi: number; note: string }>)
    .map(([id, r]) => `\`${id}\` set to ${r.lo.toFixed(2)} and ${r.hi.toFixed(2)} (${r.note})`).join("; ");
  L.push(`**Constants:** the ${o.constants} registered ids that \`param()\` reads while ${where} is computed (the registry's own process-wide recording), every status included. **Perturbation:** one at a time, x0.9 and x1.1 through \`withParamOverrides\` (a constant at 0 is moved to -0.1 and +0.1 instead); personas, demands, chain and reference curves are all rebuilt inside the override. **Ranges:** no read constant's source states a range for its value. The one stated uncertainty is used: ${rangeText || "none"}; its effect is in sensitivity.json (\`rangeRaw\`, \`rangeTotal\`), not in the ranking. **Cells:** ${real ? `${o.runCells} chain runs: 28 personas (25 human, 3 boundary) x ${o.pages} reference pages x 2 scopes (viewport, full_page) x 4 option sets, every page re-derived from its raw measurement by \`deriveMetrics\` inside the override` : `${o.runCells} chain runs (28 personas x 19 demands x 4 option sets) + ${o.scrollCells} scroll screens = ${o.cells}`}.`, "");
  L.push(`**Columns** (over both directions): median and max |delta| over cells, share of cells with |delta| > ${o.moveThreshold}, and the minimum across ${real ? `the ${o.personas} persona-scope pairs` : `the ${o.personas} personas`} of the Spearman correlation between each persona's order of the ${real ? `${o.pages} pages at a scope` : "19 demands"} before and after (default options, asymmetric + interactions). rawCTC first; totalCTC (the percentile, its reference curve rebuilt under the same perturbation) second, because a percentile against a curve built from normalised metrics can hide a raw move or show one the raw cost does not make.`, "");
  if (flagged.length) {
    L.push(`**Note.** ${flagged.length} of the top 10 are \`hypothesis\` constants: ${flagged.map((r) => `\`${r.id}\``).join(", ")}. These carry the most weight in rawCTC and are hand-set; the paper should name them.`, "");
  }
  const boundaryOnly = top10.filter((r) => r.raw && r.raw.maxAbsHuman < 0.5 * r.raw.maxAbs);
  if (boundaryOnly.length) {
    L.push(`**Boundary personas.** For ${boundaryOnly.map((r) => `\`${r.id}\` (max ${fmt(r.raw.maxAbs, 3)} overall, ${fmt(r.raw.maxAbsHuman, 3)} over the 25 humans)`).join(", ")}, the maximum comes from the three synthetic boundary personas, which pin branches no person reaches. By the 25 human personas alone the top 10 is: ${[...rows].filter((r) => r.raw).sort((a, b) => b.raw.maxAbsHuman - a.raw.maxAbsHuman).slice(0, 10).map((r) => `\`${r.id}\` (${r.status}, ${fmt(r.raw.maxAbsHuman, 3)})`).join(", ")}.`, "");
  }
  if (real) {
    L.push("**Reading this table.** Here every page is a real measurement re-derived inside the override, so the published law constants and the page-metric normalisers reach rawCTC directly, which the golden matrix (whose pages are law times) cannot show. The totalCTC Spearman column equals rawCTC's except where a curve saturates. The reference curves are built from the 25 human personas on these same pages, so for them totalCTC is a percentile within a sample that moves with them: a constant that moves every page's raw cost alike moves their percentiles little. The abandonment constants, rounding scales, interval settings and pointing dispersions reach neither column, as in the golden table. Constants applied while a page is measured are refused (the reference was measured with the registered value).", "");
    const laws = rows.filter((r) => r.id.startsWith("law.") && r.raw);
    L.push(`**Law constants, real pages vs the golden matrix** (max |delta rawCTC| over all personas; golden from \`table.md\`): ${laws.map((r) => `\`${r.id}\` ${fmt(r.raw.maxAbs, 4)} vs ${fmt(r.golden?.maxAbs, 4)}`).join("; ")}.`, "");
  } else
  L.push("**Reading the zeros.** The totalCTC Spearman column equals rawCTC's except where the reference curve saturates at 0 or 1: within one curve the percentile is monotone in rawCTC, so a persona's page order is the same on both scales. A constant with 0 on both columns is read by the matrix but does not reach rawCTC or totalCTC there: the abandonment constants move only abandonmentRisk, the rounding scales only rounded outputs, the interval settings only totalCTCInterval, the pointing-profile dispersions only the hit-probability audit. The golden matrix gives its pages as law times, so the published law constants other than law.timeBudget cannot move its rawCTC; they, and the page-metric normalisers, move totalCTC only through the reference curve, which re-derives its 514 pages from raw measurements. Constants applied while a page is measured are refused by the reference (it was measured with the registered value).", "");
  L.push(`| # | constant | status | value | median abs d raw | max abs d raw | share raw > 0.01 | min Spearman raw | max abs d raw, 25 humans | share raw > 0.01, 25 humans | median abs d total | max abs d total | share total > 0.01 | min Spearman total |${real ? " golden-matrix max abs d raw |" : ""}`);
  L.push(`|---|---|---|---|---|---|---|---|---|---|---|---|---|---|${real ? "---|" : ""}`);
  rows.forEach((r, i) => {
    const flag = i < 10 && r.status === "hypothesis" ? " **[H, top 10]**" : "";
    if (!r.raw) {
      L.push(`| ${i + 1} | \`${r.id}\`${flag} | ${r.status} | ${r.value} | refused in both directions (see below) | | | | | | | | | |${real ? ` ${r.golden ? fmt(r.golden.maxAbs) : "not read"} |` : ""}`);
      return;
    }
    L.push(`| ${i + 1} | \`${r.id}\`${flag} | ${r.status} | ${r.value} | ${fmt(r.raw.medianAbs)} | ${fmt(r.raw.maxAbs)} | ${fmt(r.raw.shareMoved, 3)} | ${fmt(r.raw.minSpearman, 3)} | ${fmt(r.raw.maxAbsHuman)} | ${fmt(r.raw.shareMovedHuman, 3)} | ${fmt(r.total.medianAbs)} | ${fmt(r.total.maxAbs)} | ${fmt(r.total.shareMoved, 3)} | ${fmt(r.total.minSpearman, 3)} |${real ? ` ${r.golden ? fmt(r.golden.maxAbs) : "not read"} |` : ""}`);
  });
  const refused = rows.filter((r) => r.refused.length);
  if (refused.length) {
    L.push("", "**Refused perturbations** (the model rejected the perturbed value; the other direction, if it ran, is in the row):", "");
    for (const r of refused) for (const x of r.refused) L.push(`- \`${r.id}\` ${x.label} (${x.value}): ${x.error}`);
  }
  const reg = o.registry;
  L.push("", "## Registry audit", "");
  L.push(`${reg.registered} ids are registered; ${where} reads ${reg.readByMatrix}.`, "");
  const groups = (g: Record<string, number>) => Object.entries(g).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ");
  L.push(`- **No reader at all** (not read by the matrix, not catalogued from data, and named by no string or \`group.\${...}\` template outside the registry files in src/): ${reg.noReader.length}${reg.noReader.length ? ` (${groups(reg.noReaderByGroup)}): ` + reg.noReader.map((x: any) => `\`${x.id}\``).join(", ") : ""}.`); // eslint-disable-line @typescript-eslint/no-explicit-any
  L.push(`- **Catalogued from data, not read through \`param()\`** (by design, said in ${reg.catalogued.files.map((f: string) => `\`${f}\``).join(" and ")}): ${reg.catalogued.count} (${groups(reg.catalogued.byGroup)}). The persona trait values feed rawCTC through the persona objects, so \`withParamOverrides\` cannot perturb them and they are not in the table; they are trait values, not chain constants.`);
  L.push(`- **Read elsewhere in src/, not reached by the golden matrix:** ${reg.elsewhere.count} (${groups(reg.elsewhere.byGroup)}). On the chain path: ${reg.chainPathNotInMatrix.length ? reg.chainPathNotInMatrix.map((x: any) => `\`${x.id}\` (${x.status}; read in ${x.readers.map((f: string) => `\`${f}\``).join(", ")})`).join("; ") : "none"}.`); // eslint-disable-line @typescript-eslint/no-explicit-any
  L.push(`- **Read outside the registry API** (direct \`MODEL_PROVENANCE[...]\` reads, which bypass recording and overrides): ${reg.directReads.length ? reg.directReads.map((d: any) => `\`${d.file}:${d.line}\``).join(", ") : "none"}.`); // eslint-disable-line @typescript-eslint/no-explicit-any
  L.push(`- **Values computed at load from other registered values** (src/visual/provenance/persona-rates.ts): ${reg.derivedAtLoad.map((x: any) => `\`${x.id}\` = ${x.from[0].replace(/^law\./, "")} / ${x.from[1].replace(/^law\./, "")}`).join("; ")}. An override of a \`law.rate.*\` source never reaches the rate the chain reads, so those sources appear above as not reached; the derived \`personaRate.*\` entries are in the table.`); // eslint-disable-line @typescript-eslint/no-explicit-any
  L.push(`- **Captured at module load** (\`const X = param(...)\` at top level: the value is fixed at import, so an override never reaches it): ${reg.moduleLevelCaptures.length ? reg.moduleLevelCaptures.map((d: any) => `\`${d.file}:${d.line}\` (${d.text.replace(/\|/g, "\\|")})`).join(", ") : "none"}.`); // eslint-disable-line @typescript-eslint/no-explicit-any
  L.push("");
  return L.join("\n") + "\n";
}

await main();
