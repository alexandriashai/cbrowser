/**
 * The Wasserstein-DRO bound on CTC (src/visual/dro-bound.ts).
 *
 * Claims, each tested against the real chain, never a copy of it:
 *   1. ctcOfCapacity reproduces computeSequentialCTC for every roster persona,
 *      so the bound is about the function the product computes.
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
import { ctcOfCapacity, droPreconditionViolations, worstCaseCTCBound } from "../src/visual/dro-bound.js";
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
} from "./fixtures/dro-adversary.js";

const SEED = 1;
const MID = computeDemandFromRawMetrics(0.5, 0.5, 40, 0.5, 0.2, 12, 3);

describe("ctcOfCapacity is the product's CTC", () => {
  test("equals computeSequentialCTC on every roster persona and reference page, bit for bit", () => {
    let n = 0;
    for (const [name, p] of Object.entries(ROSTER)) {
      const prof = toolProfile(name, p);
      for (const { demand } of allDemands()) {
        const want = computeSequentialCTC(prof, demand, { asymmetric: true, interactions: true }).totalCTC;
        const got = ctcOfCapacity(capacityVector(prof.traits), demand);
        expect(Object.is(got, want)).toBe(true);
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
    // The cap at 1 must not be what makes the check pass.
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
    expect(b.note).toMatch(/not of people/);
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
