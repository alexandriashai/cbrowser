/**
 * The Wasserstein-DRO bound on CTC (src/visual/dro-bound.ts).
 *
 * Three claims, each tested against the real chain, never a copy of it:
 *   1. ctcOfCapacity reproduces computeSequentialCTC for every roster persona,
 *      so the bound is about the function the product computes.
 *   2. The Lipschitz constant is sound: |CTC(x) - CTC(y)| <= L |x - y|_1 for
 *      random x, y and random pages, and per coordinate for one-axis moves.
 *   3. The worst-case bound is sound: any population Q built by moving P's
 *      atoms with total mean L1 movement <= epsilon (a coupling, so
 *      W1(P, Q) <= epsilon) has E_Q[CTC] <= upper.
 * Plus: the soundness tests have teeth (they fail for a bound half the
 * largest observed ratio), and epsilon has no default.
 */
import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import {
  computeSequentialCTC,
  computeDemandFromRawMetrics,
  capacityVector,
  DEMAND_DIMENSIONS,
  type DemandDistribution,
} from "../src/visual/cognitive-transport-chain.js";
import { ctcLipschitzBound, ctcOfCapacity, worstCaseCTCBound } from "../src/visual/dro-bound.js";
import { ROSTER, toolProfile, allDemands } from "./fixtures/ctc-golden-matrix.js";

const DIMS = DEMAND_DIMENSIONS as readonly string[];
const RUNS = 1000;

// Uniform on [0, 1] by construction. fast-check doubles are neither: biased to the
// ends by default, and uniform over representable doubles under noBias, which puts
// nearly every sample near 0. Capacity vectors
// near the corners saturate CTC at 1, where every slope is ~0. Biased samples
// made the soundness tests pass over a flat function (measured: steepest slope
// 0.0000 on a page whose real steepest slope is 0.97).
const unit = fc.noBias(fc.integer({ min: 0, max: 1_000_000 })).map((i) => i / 1_000_000);
const vecArb = fc.array(unit, { minLength: DIMS.length, maxLength: DIMS.length });
const toRec = (v: number[]) => Object.fromEntries(DIMS.map((d, i) => [d, v[i]])) as Record<string, number>;
const l1 = (a: Record<string, number>, b: Record<string, number>) => DIMS.reduce((s, d) => s + Math.abs(a[d] - b[d]), 0);

// Pages: the raw-metric generator the product uses, over its whole input range.
const demandArb = fc
  .tuple(unit, unit, fc.integer({ min: 0, max: 200 }), unit, unit, fc.integer({ min: 0, max: 60 }), fc.integer({ min: 0, max: 8 }))
  .map(([a, b, c, d, e, f, g]) => computeDemandFromRawMetrics(a, b, c, d, e, f, g));
const optsArb = fc.record({ asymmetric: fc.boolean(), interactions: fc.boolean() });

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

describe("Lipschitz constant", () => {
  test("is sound for random pairs: |CTC(x)-CTC(y)| <= L |x-y|_1", () => {
    fc.assert(
      fc.property(vecArb, vecArb, demandArb, optsArb, (a, b, demand, opts) => {
        const x = toRec(a), y = toRec(b);
        const { lipschitz } = ctcLipschitzBound(demand, opts);
        const diff = Math.abs(ctcOfCapacity(x, demand, opts) - ctcOfCapacity(y, demand, opts));
        return diff <= lipschitz * l1(x, y) + 1e-12;
      }),
      { numRuns: RUNS },
    );
  });

  test("is sound per coordinate for small one-axis moves", () => {
    fc.assert(
      fc.property(vecArb, fc.integer({ min: 0, max: DIMS.length - 1 }), fc.double({ min: -0.05, max: 0.05, noNaN: true }), demandArb, optsArb,
        (a, i, h, demand, opts) => {
          const x = toRec(a);
          const y = { ...x, [DIMS[i]]: Math.max(0, Math.min(1, x[DIMS[i]] + h)) };
          const step = Math.abs(y[DIMS[i]] - x[DIMS[i]]);
          if (step === 0) return true;
          const { perDimension } = ctcLipschitzBound(demand, opts);
          const diff = Math.abs(ctcOfCapacity(x, demand, opts) - ctcOfCapacity(y, demand, opts));
          return diff <= perDimension[DIMS[i]] * step + 1e-12;
        }),
      { numRuns: RUNS },
    );
  });

  test("is not vacuous: the samples exercise a steep part of the function, and a bound below it is refuted", () => {
    const demand = computeDemandFromRawMetrics(0.5, 0.5, 40, 0.5, 0.2, 12, 3);
    const { lipschitz } = ctcLipschitzBound(demand);
    const slopes: number[] = [];
    for (const [a, i] of fc.sample(fc.tuple(vecArb, fc.integer({ min: 0, max: DIMS.length - 1 })), { numRuns: 2000, seed: 7 })) {
      const x = toRec(a);
      const y = { ...x, [DIMS[i]]: Math.min(1, x[DIMS[i]] + 0.01) };
      const step = y[DIMS[i]] - x[DIMS[i]];
      if (step > 0) slopes.push(Math.abs(ctcOfCapacity(x, demand) - ctcOfCapacity(y, demand)) / step);
    }
    const steepest = Math.max(...slopes);
    // A flat function would make every soundness test above pass vacuously.
    expect(steepest).toBeGreaterThan(0.3);
    expect(lipschitz).toBeGreaterThanOrEqual(steepest);
    // The derived constant may not be loose without limit either: within 10x of what is observed here.
    expect(lipschitz / steepest).toBeLessThan(10);
    // The checker refutes a constant below the observed slope.
    expect(slopes.some((s) => s > 0.5 * steepest)).toBe(true);
    console.log(`[dro] mid page: steepest observed slope ${steepest.toFixed(4)}, derived L ${lipschitz.toFixed(4)} (${(lipschitz / steepest).toFixed(2)}x)`);
  });
});

describe("worst-case bound", () => {
  const popArb = fc.array(fc.record({ v: vecArb, w: fc.double({ min: 0.01, max: 1, noNaN: true }) }), { minLength: 1, maxLength: 5 });
  const moveArb = fc.array(fc.double({ min: -0.3, max: 0.3, noNaN: true }), { minLength: DIMS.length, maxLength: DIMS.length });

  test("no population within W1 epsilon has a higher mean CTC than upper (coupling construction)", () => {
    fc.assert(
      fc.property(popArb, fc.array(moveArb, { minLength: 5, maxLength: 5 }), demandArb, optsArb, fc.double({ min: 0, max: 0.5, noNaN: true }),
        (pop, moves, demand, opts, slack) => {
          const total = pop.reduce((s, m) => s + m.w, 0);
          const P = pop.map((m) => ({ traits: toRec(m.v), weight: m.w }));
          let cost = 0, eQ = 0;
          pop.forEach((m, k) => {
            const x = toRec(m.v);
            const y = Object.fromEntries(DIMS.map((d, i) => [d, Math.max(0, Math.min(1, x[d] + moves[k][i]))])) as Record<string, number>;
            cost += (m.w / total) * l1(x, y);
            eQ += (m.w / total) * ctcOfCapacity(y, demand, opts);
          });
          const eps = cost + slack; // W1(P, Q) <= cost <= eps
          const b = worstCaseCTCBound(P, demand, eps, opts);
          return eQ <= b.upper + 1e-12 && eQ >= b.lower - 1e-12 && b.upper <= 1 && b.lower >= 0;
        }),
      { numRuns: RUNS },
    );
  });

  test("epsilon has no default and must be finite and non-negative", () => {
    const demand = computeDemandFromRawMetrics(0.5, 0.5, 40, 0.5, 0.2, 12, 3);
    const pop = [{ traits: toRec(DIMS.map(() => 0.5)) }];
    for (const bad of [undefined, -0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => worstCaseCTCBound(pop, demand, bad as unknown as number)).toThrow(/epsilon/);
    }
    expect(() => worstCaseCTCBound([], demand, 0.1)).toThrow(/empty/);
  });

  test("epsilon 0 returns the nominal mean exactly", () => {
    const demand: DemandDistribution = computeDemandFromRawMetrics(0.5, 0.5, 40, 0.5, 0.2, 12, 3);
    const pop = Object.entries(ROSTER).map(([n, p]) => ({ traits: toolProfile(n, p).traits }));
    const b = worstCaseCTCBound(pop, demand, 0);
    expect(b.upper).toBe(b.nominal);
    expect(b.lower).toBe(b.nominal);
    expect(b.note).toMatch(/not of people/);
  });
});
