/**
 * The Wasserstein-DRO bound on CTC (src/visual/dro-bound.ts).
 *
 * The bound is on rawCTC: totalCTC is a percentile of it against real pages,
 * and the percentile bound (claim 6) is the raw constant times the curve's
 * steepest slope.
 *
 * Claims, each tested against the real chain, never a copy of it:
 *   1. rawCTCOfCapacity and ctcOfCapacity reproduce computeSequentialCTC's
 *      rawCTC and totalCTC for every roster persona, so the bounds are about
 *      the functions the product computes.
 *   2. The Lipschitz constant is sound where it is tight. An adversary
 *      (tests/fixtures/dro-adversary.ts) hill-climbs, per coordinate, for the
 *      steepest finite-difference slope on product pages under every option
 *      set; no slope may exceed perDimension, and the L1 constant must be
 *      their maximum. Random points were not enough: uniform pairs reached
 *      0.048 of L, and six unsound variants of the derivation passed.
 *   3. The worst-case bound is sound for populations built to sit near it:
 *      atoms at the adversary's steep points, moved along their locally
 *      steepest coordinate (a coupling, so W1(P, Q) <= epsilon).
 *   4. Neither is vacuous: on the mid page the adversary reaches at least half
 *      of the bound on some coordinate, and on every page it reaches half of
 *      the bound somewhere, so a bound loosened twofold fails too.
 *   5. The derivation's preconditions are checked on every call and each one
 *      fires on an input that breaks it; the live chain satisfies all of them.
 *   6. The percentile bound is raw L times the curve's largest slope over
 *      [0, rawMax], and is sound against the same adversary, a climb on the
 *      percentile itself, and populations moved along the percentile's
 *      steepest coordinate. It is loose by construction; the test prints how
 *      loose.
 * Plus: epsilon has no default. tests/dro-bound-mutants.test.ts shows the
 * checks in 2-5 kill unsound variants of the derivation.
 */
import { describe, test, expect } from "bun:test";
import {
  computeSequentialCTC,
  computeDemandFromRawMetrics,
  capacityVector,
  type DemandDistribution,
} from "../src/visual/cognitive-transport-chain.js";
import * as dro from "../src/visual/dro-bound.js";
import {
  ctcOfCapacity,
  rawCTCOfCapacity,
  droPreconditionViolations,
  percentileLipschitzBound,
  worstCaseCTCBound,
  worstCasePercentileBound,
} from "../src/visual/dro-bound.js";
import { ctcReferenceCurve } from "../src/visual/cognitive-transport-chain.js";
import { curveSlope } from "../src/visual/ctc-reference.js";
import { ROSTER, toolProfile, allDemands } from "./fixtures/ctc-golden-matrix.js";
import {
  DIMS,
  OPTION_SETS,
  adversarialSearch,
  adversarialPopulations,
  checkCoordinates,
  checkPopulations,
  checkPreconditions,
  liveLayout,
  preconditionCases,
  steepestAlong,
  uniformStream,
  type Vec,
} from "./fixtures/dro-adversary.js";
import { demandFromLegacy } from "./fixtures/law-seconds.js";

const SEED = 1;
const MID = demandFromLegacy(0.5, 0.5, 40, 0.5, 0.2, 12, 3);

describe("rawCTCOfCapacity and ctcOfCapacity are the product's CTC", () => {
  test("equal computeSequentialCTC's rawCTC and totalCTC on every roster persona and golden page, bit for bit", () => {
    let n = 0;
    for (const [name, p] of Object.entries(ROSTER)) {
      const prof = toolProfile(name, p);
      for (const { demand } of allDemands()) {
        const want = computeSequentialCTC(prof, demand, { asymmetric: true, interactions: true });
        expect(Object.is(rawCTCOfCapacity(capacityVector(prof.traits), demand), want.rawCTC)).toBe(true);
        expect(Object.is(ctcOfCapacity(capacityVector(prof.traits), demand), want.totalCTC)).toBe(true);
        n++;
      }
    }
    expect(n).toBeGreaterThan(100);
  });
});

describe("Lipschitz constant, against an adversary", () => {
  test("no steepest slope found on any page, option set or coordinate exceeds perDimension or L", () => {
    const search = adversarialSearch(SEED);
    const { violations, tightest } = checkCoordinates(search, dro);
    expect(violations).toEqual([]);
    expect(search.rows.length).toBe(search.pages.length * OPTION_SETS.length * DIMS.length);
    const table = Object.entries(tightest).map(([page, t]) => `  ${page.padEnd(30)} ${t.ratio.toFixed(5)}  ${t.dim} (${t.optsId})`);
    console.log(`[dro] seed ${SEED}: ${search.rows.length} searches, ${search.evals} CTC evaluations, ${(search.ms / 1000).toFixed(1)} s; tightest observed/bound per page:\n${table.join("\n")}`);
  }, 120_000);

  test("is not vacuous: the adversary reaches at least half the bound on the mid page, and on every page", () => {
    const { tightest } = checkCoordinates(adversarialSearch(SEED), dro);
    expect(tightest.mid.ratio).toBeGreaterThanOrEqual(0.5);
    for (const [page, t] of Object.entries(tightest)) expect({ page, ratio: t.ratio >= 0.5 }).toEqual({ page, ratio: true });
  }, 120_000);
});

describe("worst-case bound, against populations built to reach it", () => {
  test("E_Q <= upper and E_Q >= lower for every constructed population, nominal = E_P", () => {
    const { violations, tightest, upward, uncapped } = checkPopulations(adversarialPopulations(SEED), dro);
    expect(violations).toEqual([]);
    // The cap at rawMax must not be what makes the check pass.
    expect(uncapped).toBe(upward);
    // Non-vacuous: some population moves E_Q by more than half of epsilon * L.
    expect(Math.max(...Object.values(tightest))).toBeGreaterThanOrEqual(0.5);
    console.log(`[dro] populations: ${upward} upward, tightest (E_Q - E_P) / (epsilon L) ${Math.max(...Object.values(tightest)).toFixed(4)}`);
  }, 120_000);

  test("epsilon has no default and must be finite and non-negative", () => {
    const pop = [{ traits: Object.fromEntries(DIMS.map((d) => [d, 0.5])) }];
    for (const bad of [undefined, -0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => worstCaseCTCBound(pop, MID, bad as unknown as number)).toThrow(/epsilon/);
    }
    expect(() => worstCaseCTCBound([], MID, 0.1)).toThrow(/empty/);
  });

  test("epsilon 0 returns the nominal mean exactly", () => {
    const pop = Object.entries(ROSTER).map(([n, p]) => ({ traits: toolProfile(n, p).traits }));
    const b = worstCaseCTCBound(pop, MID, 0);
    expect(b.upper).toBe(b.nominal);
    expect(b.lower).toBe(b.nominal);
    expect(b.quantity).toBe("rawCTC");
    expect(b.ceiling).toBe(dro.ctcLipschitzBound(MID).rawMax);
    expect(b.note).toMatch(/not of people/);
  });
});

describe("the percentile bound: raw L times the curve's steepest slope", () => {
  test("is exactly raw.lipschitz x the largest curve slope over [0, rawMax], under every option set", () => {
    for (const { opts } of OPTION_SETS) {
      const b = percentileLipschitzBound(MID, opts);
      const raw = dro.ctcLipschitzBound(MID, opts);
      const slope = curveSlope(ctcReferenceCurve("viewport", opts).curve, 0, raw.rawMax);
      expect(b.raw).toEqual(raw);
      expect(b.curveSlope).toBe(slope);
      expect(b.lipschitz).toBe(raw.lipschitz * slope);
      expect(b.referenceScope).toBe("viewport");
      expect(slope).toBeGreaterThan(0);
    }
    const fp = percentileLipschitzBound({ ...MID, scope: "full_page" });
    expect(fp.referenceScope).toBe("full_page");
    expect(fp.curveSlope).toBe(curveSlope(ctcReferenceCurve("full_page").curve, 0, fp.raw.rawMax));
  });

  test("no slope of totalCTC exceeds it: at the raw adversary's steepest points, and in a climb on the percentile itself", () => {
    const search = adversarialSearch(SEED);
    const bounds = new Map<string, number>();
    const boundOf = (page: string, optsId: string, demand: DemandDistribution, opts: dro.DroOptions) => {
      const key = `${page}/${optsId}`;
      if (!bounds.has(key)) bounds.set(key, percentileLipschitzBound(demand, opts).lipschitz);
      return bounds.get(key)!;
    };
    const violations: string[] = [];
    let steepest = 0, ratio = 0;
    const slopeAt = (f: (x: Vec) => number, x: Vec, d: string, h: number) => {
      const xs = Math.min(x[d], 1 - h);
      return Math.abs(f({ ...x, [d]: xs + h }) - f({ ...x, [d]: xs })) / h;
    };
    for (const r of search.rows) {
      const L = boundOf(r.page, r.optsId, r.demand, r.opts);
      const f = (x: Vec) => ctcOfCapacity(x, r.demand, r.opts);
      for (const h of [1e-2, 1e-3, 1e-4]) {
        const sl = slopeAt(f, r.steepest.x, r.dim, h);
        if (!(sl <= L + 1e-9)) violations.push(`${r.page}/${r.optsId}/${r.dim} h=${h}: ${sl} > ${L}`);
        if (sl > steepest) { steepest = sl; ratio = sl / L; }
      }
    }
    // A climb that maximises the percentile's own slope, on pages whose raw
    // costs land inside the reference range.
    const u = uniformStream(SEED + 7);
    for (const page of search.pages.filter((p) => ["light", "mid", "sparse", "random-0"].includes(p.id)))
      for (const { id: optsId, opts } of OPTION_SETS) {
        const L = boundOf(page.id, optsId, page.demand, opts);
        const f = (x: Vec) => ctcOfCapacity(x, page.demand, opts);
        for (const dim of ["comprehension", "workingMemory", "patience", "readingCapacity", "readingTendency", "satisficing"]) {
          const st = steepestAlong(f, dim, u, DIMS, { starts: 2, sweeps: 3, kicks: 1 });
          if (!(st.slope <= L + 1e-9)) violations.push(`climb ${page.id}/${optsId}/${dim}: ${st.slope} > ${L}`);
          if (st.slope > steepest) { steepest = st.slope; ratio = st.slope / L; }
        }
      }
    expect(violations).toEqual([]);
    expect(steepest).toBeGreaterThan(0);
    console.log(`[dro percentile] steepest totalCTC slope found ${steepest.toFixed(4)}, ${ratio.toExponential(2)} of its bound (loose by construction)`);
  }, 120_000);

  test("worst-case mean percentile holds for populations moved along the percentile's steepest coordinate", () => {
    const search = adversarialSearch(SEED);
    const violations: string[] = [];
    let checked = 0;
    for (const page of search.pages)
      for (const { id: optsId, opts } of OPTION_SETS) {
        const f = (x: Vec) => ctcOfCapacity(x, page.demand, opts);
        const atoms = search.rows.filter((r) => r.page === page.id && r.optsId === optsId)
          .sort((a, b) => b.steepest.slope - a.steepest.slope).slice(0, 3).map((r) => r.steepest.x);
        let eP = 0, eQ = 0, epsilon = 0;
        for (const x of atoms) {
          const fx = f(x);
          let best = { gain: 0, fy: fx, move: 0 };
          for (const d of DIMS)
            for (const step of [1e-3, -1e-3]) {
              if (x[d] + step < 0 || x[d] + step > 1) continue;
              const fy = f({ ...x, [d]: x[d] + step });
              if (fy - fx > best.gain) best = { gain: fy - fx, fy, move: 1e-3 };
            }
          eP += fx / atoms.length; eQ += best.fy / atoms.length; epsilon += best.move / atoms.length;
        }
        const b = worstCasePercentileBound(atoms.map((x) => ({ traits: x })), page.demand, epsilon, opts);
        if (Math.abs(b.nominal - eP) > 1e-12) violations.push(`${page.id}/${optsId}: nominal ${b.nominal} != E_P ${eP}`);
        if (!(eQ <= b.upper + 1e-12)) violations.push(`${page.id}/${optsId}: E_Q ${eQ} > upper ${b.upper}`);
        expect(b.quantity).toBe("totalCTC");
        expect(b.ceiling).toBe(1);
        checked++;
      }
    expect(violations).toEqual([]);
    expect(checked).toBe(search.pages.length * OPTION_SETS.length);
  }, 120_000);

  test("epsilon 0 returns the nominal mean percentile exactly, and epsilon has no default", () => {
    const pop = Object.entries(ROSTER).map(([n, p]) => ({ traits: toolProfile(n, p).traits }));
    const b = worstCasePercentileBound(pop, MID, 0);
    expect(b.upper).toBe(b.nominal);
    expect(b.lower).toBe(b.nominal);
    expect(b.nominal).toBeGreaterThan(0);
    expect(b.nominal).toBeLessThan(1);
    expect(() => worstCasePercentileBound(pop, MID, undefined as unknown as number)).toThrow(/epsilon/);
  });
});


describe("the derivation's preconditions", () => {
  test("the live chain satisfies every one, on every adversary page and option set", () => {
    for (const page of adversarialSearch(SEED).pages)
      for (const { id, opts } of OPTION_SETS)
        expect({ page: page.id, id, broken: droPreconditionViolations(page.demand, opts) }).toEqual({ page: page.id, id, broken: [] });
  }, 120_000);

  for (const c of preconditionCases(MID)) {
    test(`fires on: ${c.name}`, () => {
      const got = droPreconditionViolations(c.demand, c.options, c.chain);
      expect(got.length).toBe(1);
      expect(got[0]).toMatch(c.says);
      if (c.public) {
        expect(() => dro.ctcLipschitzBound(c.demand, c.options)).toThrow(c.says);
        expect(() => worstCaseCTCBound([{ traits: { patience: 0.5 } }], c.demand, 0.1, c.options)).toThrow(c.says);
      }
    });
  }

  test("a negative interaction weight is not a violation when interactions are off", () => {
    const live = liveLayout();
    const layout = { layers: live.layers, pairs: live.pairs.map((p) => ({ ...p, weight: -0.15 })) };
    expect(droPreconditionViolations(MID, { interactions: false }, { layout })).toEqual([]);
    expect(droPreconditionViolations(MID, { interactions: true }, { layout })).toHaveLength(live.pairs.length);
  });

  test("every case is covered by the shared checker the mutant harness uses", () => {
    expect(checkPreconditions(dro, MID)).toEqual([]);
  });

  test("ctcLipschitzBound names every broken assumption at once", () => {
    const demand: DemandDistribution = { demands: { ...MID.demands, patience: -1, comprehension: Number.NaN } };
    let msg = "";
    try { dro.ctcLipschitzBound(demand, { schwartzValues: { universalism: 1 } } as unknown as dro.DroOptions); } catch (e) { msg = (e as Error).message; }
    expect(msg).toMatch(/^ctcLipschitzBound: the derivation does not cover this input: /);
    expect(msg).toMatch(/option "schwartzValues"/);
    expect(msg).toMatch(/demand patience = -1/);
    expect(msg).toMatch(/demand comprehension = NaN/);
  });
});
