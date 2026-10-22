/**
 * An adversary for the Wasserstein-DRO bound (src/visual/dro-bound.ts).
 *
 * A Lipschitz bound is only tested where the function is steep. Random points
 * are not steep: measured on the shipped chain, uniform pairs sit about 10
 * apart in L1 and the largest |dCTC| / (L |dx|_1) they ever produced was 0.048,
 * so a bound at a twentieth of the true constant passed the old random-pair
 * test. Six unsound variants of the derivation passed it.
 *
 * So this searches. For each capacity coordinate it hill-climbs over the whole
 * capacity vector for the steepest finite-difference slope of the product's
 * CTC along that coordinate, from several starts, on pages the product's own
 * demand generator makes (golden pages, each input alone at its maximum, and
 * random pages over the whole input range), under every option set. A secant slope never exceeds the
 * supremum of the derivative along its segment (mean value theorem), so an
 * observed slope above a bound refutes the bound; no tolerance beyond floating
 * point is needed.
 *
 * The search never reads a bound: it maximises the slope alone. That is what
 * lets one search check the shipped bound and every mutant of it.
 *
 * Also here: populations built the same way (atoms at the steep points, moved
 * along their steepest coordinate) and one input per precondition of the
 * derivation that breaks it.
 *
 * Shared by tests/dro-bound.test.ts (the shipped bound) and
 * tests/dro-bound-mutants.test.ts (the kill table). Run directly for the
 * tightness table: bun tests/fixtures/dro-adversary.ts [seed]
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import fc from "fast-check";
import {
  computeDemandFromRawMetrics,
  DEMAND_DIMENSIONS,
  INTERACTION_PAIRS,
  LAYER_DEFINITIONS,
  type DemandDistribution,
} from "../../src/visual/cognitive-transport-chain.js";
import {
  ctcOfCapacity,
  droPreconditionViolations,
  type ChainLayout,
  type DroChainParams,
  type DroOptions,
  type LipschitzBound,
  type PopulationMember,
  type WorstCaseBound,
} from "../../src/visual/dro-bound.js";
import { param } from "../../src/visual/model-provenance.js";
import { RAW_DEMANDS } from "./ctc-golden-matrix.js";

export const DIMS = DEMAND_DIMENSIONS as readonly string[];
export type Vec = Record<string, number>;

/** Finite-difference steps, all within the 1e-4..1e-2 range. The climb uses the middle one. */
export const STEPS = [1e-2, 1e-3, 1e-4] as const;
const CLIMB_STEP = 1e-3;

export const OPTION_SETS: Array<{ id: string; opts: DroOptions }> = [
  { id: "asym+inter", opts: { asymmetric: true, interactions: true } },
  { id: "asym", opts: { asymmetric: true, interactions: false } },
  { id: "sym+inter", opts: { asymmetric: false, interactions: true } },
  { id: "sym", opts: { asymmetric: false, interactions: false } },
];

/**
 * A seeded stream of draws uniform on [0, 1]. Built from the integer sampler the
 * DRO tests use everywhere, never fc.double: fast-check doubles are biased to
 * the ends, and under noBias uniform over representable doubles, which puts
 * nearly every draw near 0. Either makes the capacity vector sit at a corner
 * where CTC saturates and every slope is ~0.
 */
export function uniformStream(seed: number): () => number {
  const unit = fc.noBias(fc.integer({ min: 0, max: 1_000_000 })).map((i) => i / 1_000_000);
  let buf: number[] = [];
  let k = 0;
  let batch = 0;
  return () => {
    if (k >= buf.length) {
      buf = fc.sample(unit, { seed: (seed * 7919 + batch++) | 0, numRuns: 4096 });
      k = 0;
    }
    return buf[k++];
  };
}

const golden = (id: string) => {
  const p = RAW_DEMANDS.find((r) => r.id === id);
  if (!p) throw new Error(`no golden page ${id}`);
  return computeDemandFromRawMetrics(...p.args);
};

/**
 * A page from the product's generator over the golden matrix's input range.
 * An intensity drawn first scales every input, so light pages, where content
 * gates are unsaturated and depletion is off, come up as often as busy ones.
 * Several derivation terms only matter there.
 */
export function randomPage(u: () => number): DemandDistribution {
  const c = u();
  return computeDemandFromRawMetrics(c * u(), c * u(), Math.round(c * u() * 1000), c * u(), c * u(), Math.round(c * u() * 500), Math.round(c * u() * 30));
}

export interface Page { id: string; demand: DemandDistribution }

/** The generator's seven inputs, in computeDemandFromRawMetrics order, with the golden matrix's maximum for each. */
const INPUTS = ["informationDensity", "visualComplexity", "interactiveElementCount", "textDensity", "animationLevel", "choiceCount", "navigationDepth"] as const;
const INPUT_MAX = [1, 1, 1000, 1, 1, 500, 30];

/**
 * The fixed pages every seed searches, plus `extra` random ones:
 *  - the golden matrix's empty, sparse, light, mid and max pages;
 *  - each generator input alone at its maximum. A page that loads one or two
 *    layers is where a term the derivation adds on top of a single layer's
 *    slope (an interaction product, the readingTendency path) is a large share
 *    of the bound rather than lost under depletion coupling, which the bound
 *    over-counts. Measured over all 254 pages with any subset of inputs at the
 *    max or mid value, a bound without interaction terms is exceeded by up to
 *    12% only on pages like "informationDensity alone".
 */
export function searchPages(u: () => number, extra: number): Page[] {
  const pages: Page[] = ["empty", "sparse", "light", "mid", "max"].map((id) => ({ id, demand: golden(id) }));
  INPUTS.forEach((name, i) => {
    const args = INPUT_MAX.map((v, j) => (j === i ? v : 0)) as Parameters<typeof computeDemandFromRawMetrics>;
    pages.push({ id: `only-${name}`, demand: computeDemandFromRawMetrics(...args) });
  });
  for (let i = 0; i < extra; i++) pages.push({ id: `random-${i}`, demand: randomPage(u) });
  return pages;
}

/** |CTC(x + h e_s) - CTC(x)| / h, with x_s pulled into [0, 1 - h] so the step stays in the cube. */
function slope(f: (x: Vec) => number, x: Vec, s: string, h: number): number {
  const xs = Math.min(x[s], 1 - h);
  const a = xs === x[s] ? x : { ...x, [s]: xs };
  return Math.abs(f({ ...a, [s]: xs + h }) - f(a)) / h;
}

export interface Steepest {
  /** Largest secant slope found along `dim`. */
  slope: number;
  /** Where it was found (x[dim] is the left end of the step). */
  x: Vec;
  h: number;
}

/**
 * The coordinates that move CTC at all on this page: moving one across [0, 1]
 * changes CTC at one of `probes` uniform points. The rest (no demand, surplus
 * free, or in no layer) are left where the start put them: varying them only
 * spends evaluations.
 */
export function activeDims(f: (x: Vec) => number, u: () => number, probes = 6): string[] {
  const active = new Set<string>();
  for (let k = 0; k < probes; k++) {
    const x: Vec = Object.fromEntries(DIMS.map((d) => [d, u()]));
    for (const d of DIMS) if (!active.has(d) && f({ ...x, [d]: 0 }) !== f({ ...x, [d]: 1 })) active.add(d);
  }
  return DIMS.filter((d) => active.has(d));
}

/**
 * Steepest slope of f along coordinate s. Coordinate-wise hill-climbing over
 * the `climb` coordinates (and s), each tried at 0, 1 and +-delta with delta
 * halving per sweep, from `starts` starts (one a uniform corner, the rest
 * uniform); then `kicks` rounds of iterated local search from the best point
 * found (re-draw three coordinates, climb again, keep it if steeper). The
 * kicks are what make the search repeatable: measured on the
 * informationDensity-only page over 20 seeds, the worst seed reached 0.86 of
 * the bound without them and 0.97 with two.
 */
export function steepestAlong(
  f: (x: Vec) => number,
  s: string,
  u: () => number,
  climb: readonly string[] = DIMS,
  { starts = 3, sweeps = 4, kicks = 2 } = {},
): Steepest {
  const vary = climb.includes(s) ? climb : [...climb, s];
  const climbFrom = (x: Vec, delta: number) => {
    let cur = slope(f, x, s, CLIMB_STEP);
    for (let sweep = 0; sweep < sweeps; sweep++) {
      const order = [...vary].sort(() => u() - 0.5);
      let moved = false;
      for (const j of order) {
        const hi = j === s ? 1 - CLIMB_STEP : 1;
        for (const v of [0, hi, x[j] + delta, x[j] - delta]) {
          const c = Math.max(0, Math.min(hi, v));
          if (c === x[j]) continue;
          const y = { ...x, [j]: c };
          const sl = slope(f, y, s, CLIMB_STEP);
          if (sl > cur) { cur = sl; x = y; moved = true; }
        }
      }
      // A coordinate with no effect anywhere the first sweep looked stays flat; climbing a flat zero goes nowhere.
      if (cur === 0 && sweep === 0) break;
      if (!moved && delta < 0.02) break;
      delta /= 2;
    }
    return { x, cur };
  };

  let best: Steepest = { slope: -1, x: {}, h: CLIMB_STEP };
  const record = (x: Vec) => {
    for (const h of STEPS) {
      const sl = slope(f, x, s, h);
      if (sl > best.slope) best = { slope: sl, x: { ...x, [s]: Math.min(x[s], 1 - h) }, h };
    }
  };
  let top = { x: {} as Vec, cur: -1 };
  for (let k = 0; k < starts; k++) {
    const x: Vec = Object.fromEntries(DIMS.map((d) => [d, k === 1 ? (u() < 0.5 ? 0 : 1) : u()]));
    x[s] = Math.min(x[s], 1 - CLIMB_STEP);
    const r = climbFrom(x, 0.25);
    record(r.x);
    if (r.cur > top.cur) top = r;
  }
  for (let k = 0; k < kicks && top.cur > 0; k++) {
    const y = { ...top.x };
    for (let q = 0; q < 3; q++) {
      const j = vary[Math.floor(u() * vary.length)];
      y[j] = j === s ? Math.min(u(), 1 - CLIMB_STEP) : u();
    }
    const r = climbFrom(y, 0.125);
    record(r.x);
    if (r.cur > top.cur) top = r;
  }
  return best;
}

export interface SearchRow {
  page: string;
  demand: DemandDistribution;
  optsId: string;
  opts: DroOptions;
  dim: string;
  steepest: Steepest;
}

export interface SearchResult {
  seed: number;
  pages: Page[];
  rows: SearchRow[];
  evals: number;
  ms: number;
}

const searches = new Map<number, SearchResult>();

/**
 * The adversarial search for one seed: every coordinate, every option set,
 * on the fixed pages plus three random product pages. Cached per seed,
 * because the search does not depend on the bound it is used to check.
 */
export function adversarialSearch(seed: number): SearchResult {
  const hit = searches.get(seed);
  if (hit) return hit;
  const u = uniformStream(seed);
  const pages = searchPages(u, 3);
  const rows: SearchRow[] = [];
  let evals = 0;
  const t0 = performance.now();
  for (const page of pages)
    for (const { id: optsId, opts } of OPTION_SETS) {
      const f = (x: Vec) => { evals++; return ctcOfCapacity(x, page.demand, opts); };
      const climb = activeDims(f, u);
      for (const dim of DIMS) rows.push({ page: page.id, demand: page.demand, optsId, opts, dim, steepest: steepestAlong(f, dim, u, climb) });
    }
  const out = { seed, pages, rows, evals, ms: performance.now() - t0 };
  searches.set(seed, out);
  return out;
}

/** What the checks call: the shipped module, or a mutant of it. */
export interface BoundModule {
  ctcLipschitzBound: (demand: DemandDistribution, options?: DroOptions) => LipschitzBound;
  worstCaseCTCBound: (population: PopulationMember[], demand: DemandDistribution, epsilon: number, options?: DroOptions) => WorstCaseBound;
  droPreconditionViolations: typeof droPreconditionViolations;
}

export interface Violation { where: string; observed: number; bound: number }

export interface CoordinateCheck {
  violations: Violation[];
  /** Largest observed/bound ratio per page, over coordinates and option sets (bounds of 0 excluded). */
  tightest: Record<string, { ratio: number; dim: string; optsId: string }>;
}

/**
 * Per coordinate: the steepest observed slope may not exceed
 * perDimension[dim], nor the L1 constant; and the L1 constant must be the
 * largest per-dimension bound (the dual norm of L1), attained at
 * worstDimension. Per-coordinate bounds that hold everywhere give the L1
 * bound by moving one coordinate at a time, so this is the whole L1 claim.
 */
export function checkCoordinates(search: SearchResult, mod: BoundModule): CoordinateCheck {
  const violations: Violation[] = [];
  const tightest: CoordinateCheck["tightest"] = {};
  const bounds = new Map<string, LipschitzBound>();
  for (const r of search.rows) {
    const key = `${r.page}/${r.optsId}`;
    let b = bounds.get(key);
    if (!b) {
      b = mod.ctcLipschitzBound(r.demand, r.opts);
      bounds.set(key, b);
      const maxPer = Math.max(...DIMS.map((d) => b!.perDimension[d]));
      if (b.lipschitz !== maxPer || b.perDimension[b.worstDimension] !== b.lipschitz)
        violations.push({ where: `${key}: lipschitz is not the largest per-dimension bound`, observed: maxPer, bound: b.lipschitz });
    }
    const per = b.perDimension[r.dim];
    const where = `${key}/${r.dim} at h=${r.steepest.h}`;
    if (!(r.steepest.slope <= per + 1e-9)) violations.push({ where, observed: r.steepest.slope, bound: per });
    if (!(r.steepest.slope <= b.lipschitz + 1e-9)) violations.push({ where: `${where} (L1 constant)`, observed: r.steepest.slope, bound: b.lipschitz });
    if (per > 0) {
      const ratio = r.steepest.slope / per;
      if (!tightest[r.page] || ratio > tightest[r.page].ratio) tightest[r.page] = { ratio, dim: r.dim, optsId: r.optsId };
    }
  }
  return { violations, tightest };
}

export interface Population {
  page: Page;
  optsId: string;
  opts: DroOptions;
  /** +1: atoms moved to raise CTC (checks upper); -1: to lower it (checks lower). */
  dir: 1 | -1;
  P: PopulationMember[];
  /** Weighted mean move of the atoms in L1: a coupling cost, so W1(P, Q) <= epsilon. */
  epsilon: number;
  eP: number;
  eQ: number;
}

const populations = new Map<number, Population[]>();

/**
 * Populations built to sit near the bound. The moving atoms are the
 * adversary's three steepest points on the page; each moves along its locally
 * steepest coordinate (finite differences over all 30) by a small step in the
 * direction `dir` asks. Two uniform atoms stay where they are, so weights and
 * the nominal mean are exercised too. Moving each atom is a coupling, so
 * W1(P, Q) <= epsilon. Cached per seed: like the search, it reads no bound.
 */
export function adversarialPopulations(seed: number): Population[] {
  const hit = populations.get(seed);
  if (hit) return hit;
  const search = adversarialSearch(seed);
  const u = uniformStream(seed + 104729);
  const STEP = 1e-3;
  const out: Population[] = [];
  for (const page of search.pages)
    for (const { id: optsId, opts } of OPTION_SETS) {
      const f = (x: Vec) => ctcOfCapacity(x, page.demand, opts);
      const rows = search.rows.filter((r) => r.page === page.id && r.optsId === optsId).sort((a, b) => b.steepest.slope - a.steepest.slope);
      const moving = rows.slice(0, 3).map((r) => r.steepest.x);
      const still = [0, 1].map(() => Object.fromEntries(DIMS.map((d) => [d, u()])) as Vec);
      const atoms = [...moving, ...still];
      const ws = atoms.map(() => 0.05 + u());
      const total = ws.reduce((s, w) => s + w, 0);
      for (const dir of [1, -1] as const) {
        const P: PopulationMember[] = [];
        let eP = 0, eQ = 0, epsilon = 0;
        atoms.forEach((x, i) => {
          const fx = f(x);
          let y = x, move = 0;
          if (i < moving.length) {
            let bestGain = 0;
            for (const d of DIMS)
              for (const step of [STEP, -STEP]) {
                if (x[d] + step < 0 || x[d] + step > 1) continue;
                const z = { ...x, [d]: x[d] + step };
                const gain = (dir * (f(z) - fx)) / STEP;
                if (gain > bestGain) { bestGain = gain; y = z; move = STEP; }
              }
          }
          P.push({ traits: x, weight: ws[i] });
          eP += (ws[i] / total) * fx;
          eQ += (ws[i] / total) * f(y);
          epsilon += (ws[i] / total) * move;
        });
        out.push({ page, optsId, opts, dir, P, epsilon, eP, eQ });
      }
    }
  populations.set(seed, out);
  return out;
}

export interface PopulationCheck {
  violations: Violation[];
  /** Largest (E_Q - E_P) / (epsilon * L) per page over the upward populations. */
  tightest: Record<string, number>;
  /** Upward populations, and how many of them had upper < 1 (so the cap at 1 is not what made the check pass). */
  upward: number;
  uncapped: number;
}

/** E_Q <= upper for every upward population, E_Q >= lower for every downward one, and nominal = E_P. */
export function checkPopulations(pops: Population[], mod: BoundModule): PopulationCheck {
  const violations: Violation[] = [];
  const tightest: Record<string, number> = {};
  let upward = 0, uncapped = 0;
  for (const p of pops) {
    const b = mod.worstCaseCTCBound(p.P, p.page.demand, p.epsilon, p.opts);
    const where = `${p.page.id}/${p.optsId}/${p.dir > 0 ? "up" : "down"}`;
    if (Math.abs(b.nominal - p.eP) > 1e-12) violations.push({ where: `${where}: nominal is not E_P`, observed: b.nominal, bound: p.eP });
    if (p.dir > 0) {
      upward++;
      if (b.upper < 1) uncapped++;
      if (!(p.eQ <= b.upper + 1e-12)) violations.push({ where, observed: p.eQ, bound: b.upper });
      if (p.epsilon * b.lipschitz > 0) tightest[p.page.id] = Math.max(tightest[p.page.id] ?? 0, (p.eQ - p.eP) / (p.epsilon * b.lipschitz));
    } else if (!(p.eQ >= b.lower - 1e-12)) violations.push({ where, observed: p.eQ, bound: b.lower });
  }
  return { violations, tightest, upward, uncapped };
}

const SA = "sustainedAttention";

/** The live chain's layout as the derivation reads it, copied so a case can break it without touching the chain. */
export function liveLayout(): ChainLayout {
  return {
    layers: LAYER_DEFINITIONS.map((l) => ({ name: l.name, traits: [...l.traits] })),
    pairs: INTERACTION_PAIRS.map((p) => ({ a: p.a, b: p.b, weight: param(p.weight) })),
  };
}

export interface PreconditionCase {
  name: string;
  demand: DemandDistribution;
  options?: Record<string, unknown>;
  chain?: { layout?: ChainLayout; params?: Partial<DroChainParams> };
  /** The one violation this input must produce. */
  says: RegExp;
  /** True when the input reaches ctcLipschitzBound itself (demand and options); layout and constants only through the checker. */
  public: boolean;
}

/**
 * One input per precondition that breaks it and nothing else, each built from
 * the live layout (read, never hard-coded) so the cases stay valid whatever
 * layer membership the chain has.
 */
export function preconditionCases(base: DemandDistribution): PreconditionCase[] {
  const live = liveLayout();
  const L = live.layers;
  const withLayers = (layers: ChainLayout["layers"]): ChainLayout => ({ layers, pairs: live.pairs });
  const plain = L.map((l, i) => i).filter((i) => !L[i].traits.includes(SA) && L[i].traits.length > 0);
  if (plain.length < 2) throw new Error("preconditionCases: the live chain has fewer than two layers without sustainedAttention");
  const [iA, iB] = plain;
  const tA = L[iA].traits[0];
  const withoutSA = L.map((l) => ({ name: l.name, traits: l.traits.filter((t) => t !== SA) })).filter((l) => l.traits.length > 0);
  const inLayers = new Set(L.flatMap((l) => l.traits));
  const spare = DIMS.find((d) => d !== SA && !inLayers.has(d));
  if (!spare) throw new Error("preconditionCases: every dimension is in a layer, so there is no spare trait to share sustainedAttention's layer");
  const pairs = live.pairs.length ? live.pairs : [{ a: L[iA].name, b: L[iB].name, weight: 0.15 }];
  const demandWith = (v: number): DemandDistribution => ({ demands: { ...base.demands, [tA]: v } });
  const cases: PreconditionCase[] = [
    { name: "Schwartz values passed", demand: base, options: { schwartzValues: { universalism: 1 } }, says: /option "schwartzValues" is not modelled/, public: true },
    { name: "carried capacity passed", demand: base, options: { carriedCapacity: { patience: 0.5 } }, says: /option "carriedCapacity" is not modelled/, public: true },
    { name: "negative demand", demand: demandWith(-0.1), says: new RegExp(`demand ${tA} = -0\\.1 is not a finite number >= 0`), public: true },
    { name: "NaN demand", demand: demandWith(Number.NaN), says: new RegExp(`demand ${tA} = NaN is not a finite number >= 0`), public: true },
    { name: "infinite demand", demand: demandWith(Number.POSITIVE_INFINITY), says: new RegExp(`demand ${tA} = Infinity is not a finite number >= 0`), public: true },
    {
      name: "layer name repeats", demand: base, says: /repeats: interaction terms look layers up by name/, public: false,
      chain: { layout: withLayers(L.map((l, i) => (i === iB ? { ...l, name: L[iA].name } : l))) },
    },
    {
      name: "layer with no trait", demand: base, says: /lists no trait/, public: false,
      chain: { layout: withLayers([{ name: "no-traits", traits: [] }, ...L]) },
    },
    {
      name: "trait twice within a layer", demand: base, says: new RegExp(`"${tA}" is listed in layer "${L[iA].name}" twice`), public: false,
      chain: { layout: withLayers(L.map((l, i) => (i === iA ? { ...l, traits: [...l.traits, tA] } : l))) },
    },
    {
      name: "trait in two layers", demand: base, says: new RegExp(`"${tA}" is listed in layers "${L[iA].name}" and "${L[iB].name}": layer trait sets must be disjoint`), public: false,
      chain: { layout: withLayers(L.map((l, i) => (i === iB ? { ...l, traits: [...l.traits, tA] } : l))) },
    },
    {
      name: "sustainedAttention's layer not last", demand: base, says: /is not the last layer/, public: false,
      chain: { layout: withLayers([{ name: "attention-first", traits: [SA] }, ...withoutSA]) },
    },
    {
      name: "sustainedAttention's layer shared", demand: base, says: new RegExp(`lists traits besides ${SA}`), public: false,
      chain: { layout: withLayers([...withoutSA, { name: "attention-shared", traits: [SA, spare] }]) },
    },
    {
      name: "negative interaction weight", demand: base, says: /interaction weight .* = -0\.15 is not finite and >= 0/, public: false,
      chain: { layout: { layers: L, pairs: pairs.map((p, i) => (i === 0 ? { ...p, weight: -0.15 } : p)) } },
    },
    {
      name: "NaN interaction weight", demand: base, says: /interaction weight .* = NaN is not finite and >= 0/, public: false,
      chain: { layout: { layers: L, pairs: pairs.map((p, i) => (i === 0 ? { ...p, weight: Number.NaN } : p)) } },
    },
  ];
  for (const k of ["weightDeficit", "weightSurplus", "contentScaleGain", "depletionRate", "indirectShare", "maxDrawdown", "range", "slope"] as const)
    cases.push({ name: `negative ${k}`, demand: base, chain: { params: { [k]: -0.5 } as Partial<DroChainParams> }, says: new RegExp(`chain constant ${k} = -0\\.5 is not finite and >= 0`), public: false });
  for (const k of ["depletionGate", "atSkim", "centre"] as const)
    cases.push({ name: `NaN ${k}`, demand: base, chain: { params: { [k]: Number.NaN } as Partial<DroChainParams> }, says: new RegExp(`chain constant ${k} = NaN is not finite`), public: false });
  for (const v of [-0.1, 1.5])
    cases.push({ name: `capacityEpsilon ${v}`, demand: base, chain: { params: { capacityEpsilon: v } }, says: new RegExp(`capacityEpsilon = ${String(v).replace(".", "\\.")} is not in \\[0, 1\\]`), public: false });
  return cases;
}

/**
 * Each case's checker output is exactly its one violation, and every public
 * case makes ctcLipschitzBound and worstCaseCTCBound throw with it. Returns the
 * cases that failed (empty when every precondition fires).
 */
export function checkPreconditions(mod: BoundModule, base: DemandDistribution): string[] {
  const failed: string[] = [];
  for (const c of preconditionCases(base)) {
    const got = mod.droPreconditionViolations(c.demand, c.options as DroOptions, c.chain);
    if (got.length !== 1 || !c.says.test(got[0])) failed.push(`${c.name}: checker returned ${JSON.stringify(got)}`);
    if (!c.public) continue;
    for (const [fn, call] of [
      ["ctcLipschitzBound", () => mod.ctcLipschitzBound(c.demand, c.options as DroOptions)],
      ["worstCaseCTCBound", () => mod.worstCaseCTCBound([{ traits: Object.fromEntries(DIMS.map((d) => [d, 0.5])) }], c.demand, 0.1, c.options as DroOptions)],
    ] as const) {
      let msg = "";
      try { call(); } catch (e) { msg = (e as Error).message; }
      if (!c.says.test(msg)) failed.push(`${c.name}: ${fn} ${msg ? `threw "${msg}"` : "did not throw"}`);
    }
  }
  return failed;
}

if (import.meta.main) {
  const seed = Number(process.argv[2] ?? 1);
  const mod = await import("../../src/visual/dro-bound.js");
  const s = adversarialSearch(seed);
  const c = checkCoordinates(s, mod);
  const p = checkPopulations(adversarialPopulations(seed), mod);
  console.log(`seed ${seed}: ${s.rows.length} searches, ${s.evals} CTC evaluations, ${(s.ms / 1000).toFixed(1)} s`);
  for (const [page, t] of Object.entries(c.tightest))
    console.log(`  ${page.padEnd(30)} tightest observed/bound ${t.ratio.toFixed(5)} (${t.dim}, ${t.optsId})  population ${(p.tightest[page] ?? 0).toFixed(4)}`);
  console.log(`  violations: coordinates ${c.violations.length}, populations ${p.violations.length}; upward populations with upper < 1: ${p.uncapped}/${p.upward}`);
}
