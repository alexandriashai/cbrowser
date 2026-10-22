/**
 * Capacity depletes; it does not hit a wall.
 *
 * Depletion used to be a flat subtraction clamped at CAPACITY_FLOOR = 0.05.
 * That is not a floor a persona approaches -- it is one they reach, inside a
 * single eight-layer run. Measured on a dense page before this change:
 *
 *   intellectual-disability  10 of 30 dimensions pinned at exactly 0.05
 *   elderly-user              5 of 30
 *
 * Once pinned, the account stopped responding to cost. Every later layer saw an
 * identical capacity vector, so the chain could not tell those layers apart --
 * and the personas whose vectors collapsed were exactly the ones the
 * accessibility model exists to describe.
 *
 * It also made the sequential model ill-posed: over 112 steps the clamped form
 * produced ONE distinct value across the final four screens.
 *
 * Proportional drawdown spends a fraction of what remains, so the balance
 * asymptotes toward zero without reaching it and every step stays
 * distinguishable. 32 of 32 over the same span.
 *
 * @since 2026-08-03
 */
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COGNITIVE_TRAITS, buildOTCognitiveProfile } from "../src/visual/cognitive-transport.js";
import {
  computeDemandDistribution,
  computeDemandFromRawMetrics,
  computeSequentialCTC,
  capacityVector,
  DEMAND_DIMENSIONS,
  LAYER_DEFINITIONS,
  type DemandDistribution,
  type SequentialTransportResult,
} from "../src/visual/cognitive-transport-chain.js";
import { MODEL_PROVENANCE, param } from "../src/visual/model-provenance.js";
import { ROSTER, toolProfile, allDemands } from "./fixtures/ctc-golden-matrix.js";

const CHAIN = readFileSync(join(import.meta.dir, "..", "src", "visual", "cognitive-transport-chain.ts"), "utf8");
const dense = (d: number) => computeDemandDistribution({
  informationDensity: d, visualComplexity: d, interactiveElementCount: Math.round(d * 100),
  textDensity: d, animationLevel: d * 0.5, choiceCount: Math.round(d * 30), navigationDepth: Math.round(d * 5),
} as never);
const uniform = (v: number): Record<string, number> =>
  Object.fromEntries((COGNITIVE_TRAITS as readonly string[]).map((t) => [t, v]));
const run = (traits: Record<string, number>, d = 0.9) =>
  computeSequentialCTC(buildOTCognitiveProfile("p", traits), dense(d), { asymmetric: true, interactions: true });

describe("the account never saturates", () => {
  test("no dimension reaches the old behavioural floor, at any density", async () => {
    const { getAnyPersona, getCognitiveProfile } = await import("../src/personas.js");
    for (const n of ["intellectual-disability", "elderly-user", "motor-impairment-tremor", "cognitive-adhd"]) {
      const t = getCognitiveProfile(getAnyPersona(n)! as never).traits as Record<string, number>;
      for (const d of [0.3, 0.6, 0.9]) {
        const last = (run(t, d).layers as Array<{ residualCapacity: Record<string, number> }>).slice(-1)[0].residualCapacity;
        const pinned = Object.values(last).filter((v) => v <= 0.0500001).length;
        expect({ persona: n, density: d, pinned }).toEqual({ persona: n, density: d, pinned: 0 });
      }
    }
  });

  test("late steps stay distinguishable over a long chain", () => {
    // The property the sequential model needs. Simulated over the same 112
    // steps the clamped form flattened.
    const FLOOR_EPS = 1e-4, RATE = 0.15, MAX = 0.5;
    let v = 0.40;
    const seq: number[] = [];
    for (let i = 0; i < 112; i++) {
      v = Math.max(FLOOR_EPS, v * (1 - Math.min(MAX, RATE * 0.12)));
      seq.push(v);
    }
    const tail = seq.slice(80);
    expect(new Set(tail.map((x) => x.toFixed(9))).size).toBe(tail.length);
    // Strictly decreasing, never negative, never zero.
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeLessThan(seq[i - 1]);
    expect(seq[seq.length - 1]).toBeGreaterThan(0);
  });

  test("a persona with a bigger account lasts longer", () => {
    const residual = (start: number) => {
      const t = uniform(start);
      const last = (run(t).layers as Array<{ residualCapacity: Record<string, number> }>).slice(-1)[0].residualCapacity;
      return Object.values(last).reduce((a, b) => a + b, 0) / Object.values(last).length;
    };
    const low = residual(0.3), high = residual(0.8);
    expect(high).toBeGreaterThan(low);
  });

  test("no single layer can empty the account", () => {
    expect(CHAIN).toContain("Math.min(MAX_DRAWDOWN_FRACTION, DEPLETION_RATE * layerCost)");
    // The half rate is a registered hypothesis (chain.indirectDepletionShare), not a literal.
    expect(CHAIN).toContain("Math.min(MAX_DRAWDOWN_FRACTION, (DEPLETION_RATE * INDIRECT_DEPLETION_SHARE) * layerCost)");
  });
});

/** Each layer's capacity on entry: `start` for the first, the previous layer's residual after. */
function entering(start: Record<string, number>, r: SequentialTransportResult): Array<Record<string, number>> {
  return r.layers.map((_, i) => (i === 0 ? start : r.layers[i - 1].residualCapacity));
}

/** The content gate of one layer on one demand, as the chain computes it. */
function contentScale(layer: { traits: string[] }, demand: DemandDistribution): number {
  const mean = layer.traits.reduce((s, t) => s + (demand.demands[t] ?? 0), 0) / layer.traits.length;
  return Math.min(1, mean * param("chain.contentScaleGain"));
}

describe("capacityConsumed is what the layer actually drew (ISC-43)", () => {
  // Through 21.0 it was depletionRate x layerCost whatever happened: reported
  // when the content gate blocked depletion, above the drawdown cap on a heavy
  // layer, and blind to the capacity floor. It now sums, over every dimension,
  // the capacity the layer removed (LayerResult.capacityConsumed).

  test("a light page whose layers are all gated off reports 0, while its layers still cost something", () => {
    const light = computeDemandFromRawMetrics(0.02, 0.02, 0, 0.02, 0, 0, 0);
    const gate = param("chain.depletionGate");
    for (const name of ["first-timer", "elderly-user", "power-user"]) {
      const prof = toolProfile(name, ROSTER[name]);
      const r = computeSequentialCTC(prof, light, { asymmetric: true, interactions: true });
      for (const [i, l] of r.layers.entries()) expect({ name, layer: l.name, gated: contentScale(LAYER_DEFINITIONS[i], light) <= gate }).toEqual({ name, layer: l.name, gated: true });
      expect({ name, consumed: r.layers.map((l) => l.capacityConsumed) }).toEqual({ name, consumed: r.layers.map(() => 0) });
      // Not vacuous: the old figure, depletionRate x cost, was positive here.
      expect(r.layers.some((l) => l.transportCost > 0)).toBe(true);
      // And nothing was drawn: the capacity leaving the page is the capacity it arrived with.
      expect(r.remainingCapacity).toEqual(capacityVector(prof.traits));
    }
  });

  test("a heavy layer reports the capped draw, not depletionRate x cost", () => {
    // The golden matrix's boundary-floor persona on the second of two maximal
    // screens: there cognitiveLoad costs 3.36, so depletionRate x cost is 0.504
    // and the drawdown cap (0.5) binds. (On the first screen it costs 3.28 and
    // does not.)
    const floor = Object.fromEntries(DEMAND_DIMENSIONS.map((d) => [d, d === "siteFamiliarity" ? 0 : 0.02]));
    const wall = computeDemandFromRawMetrics(1, 1, 1000, 1, 1, 500, 30);
    const prof = buildOTCognitiveProfile("boundary-floor", floor);
    const first = computeSequentialCTC(prof, wall, { asymmetric: true, interactions: true });
    const r = computeSequentialCTC(prof, wall, { asymmetric: true, interactions: true, carriedCapacity: first.remainingCapacity });
    const rate = param("chain.depletionRate");
    const cap = param("chain.maxDrawdownFraction");
    const share = param("chain.indirectDepletionShare");
    const eps = param("chain.capacityEpsilon");
    const before = entering(first.remainingCapacity, r);
    let capped = 0;
    r.layers.forEach((l, i) => {
      const own = LAYER_DEFINITIONS[i].traits;
      const fOwn = Math.min(cap, rate * l.transportCost);
      const fOther = Math.min(cap, rate * share * l.transportCost);
      let expected = 0;
      for (const t of own) expected += Math.max(0, before[i][t] - Math.max(eps, before[i][t] * (1 - fOwn)));
      for (const d of DEMAND_DIMENSIONS) if (!own.includes(d)) expected += Math.max(0, before[i][d] - Math.max(eps, before[i][d] * (1 - fOther)));
      expect({ layer: l.name, consumed: l.capacityConsumed }).toEqual({ layer: l.name, consumed: expected });
      if (rate * l.transportCost > cap) {
        capped++;
        expect(l.capacityConsumed).not.toBe(rate * l.transportCost);
      }
    });
    // The cap binds on at least one layer of this page, so the test reaches it.
    expect(capped).toBeGreaterThan(0);
  });

  test("the capacity floor stops a draw and is never counted as one", () => {
    // Every dimension at 0: the first gated layer lifts them to the floor
    // (chain.capacityEpsilon) and nothing can be drawn below it, so every
    // layer reports 0 while depletionRate x cost, the old figure, was ~0.5.
    const zero = Object.fromEntries(DEMAND_DIMENSIONS.map((d) => [d, 0]));
    const wall = computeDemandFromRawMetrics(1, 1, 1000, 1, 1, 500, 30);
    const r = computeSequentialCTC(buildOTCognitiveProfile("zero", zero), wall, { asymmetric: true, interactions: true });
    expect(r.layers.map((l) => l.capacityConsumed)).toEqual(r.layers.map(() => 0));
    expect(Math.max(...r.layers.map((l) => param("chain.depletionRate") * l.transportCost))).toBeGreaterThan(0.5);
    for (const v of Object.values(r.remainingCapacity)) expect(v).toBe(param("chain.capacityEpsilon"));
  });

  test("on every roster persona and golden page it is the capacity removed, summed over dimensions", () => {
    let layers = 0;
    for (const [name, p] of Object.entries(ROSTER)) {
      const prof = toolProfile(name, p);
      for (const { id, demand } of allDemands()) {
        const r = computeSequentialCTC(prof, demand, { asymmetric: true, interactions: true });
        const before = entering(capacityVector(prof.traits), r);
        r.layers.forEach((l, i) => {
          let removed = 0;
          for (const d of DEMAND_DIMENSIONS) removed += Math.max(0, before[i][d] - l.residualCapacity[d]);
          // Summation order differs from the chain's (own traits first), so equal to rounding.
          expect({ name, id, layer: l.name, off: Math.abs(l.capacityConsumed - removed) <= 1e-12 }).toEqual({ name, id, layer: l.name, off: true });
          layers++;
        });
      }
    }
    expect(layers).toBeGreaterThan(1000);
  });
});

describe("cost still rises as capacity falls", () => {
  test("monotonic in the deficit regime, which is where the model makes its claim", () => {
    // Bounded to capacities BELOW the page's demand. Above it the model bills
    // surplus at 0.3 on every dimension not in SURPLUS_FREE_DIMENSIONS, so a
    // uniformly over-capable persona pays for the excess and the curve turns
    // back up. That is pre-existing and unchanged by this commit -- measured
    // 0.998 > 0.344 > 0.086 > 0.145 > 0.412 before, 0.981 > 0.290 > 0.086 >
    // 0.146 > 0.412 after -- and resolving it globally is a calibration
    // decision about a research instrument, not a side effect of fixing
    // saturation.
    //
    // rawCTC, not totalCTC: this is a claim about the chain. totalCTC is a
    // percentile of rawCTC against real pages, monotone but flat at 1 beyond
    // the costliest reference page, so two impaired personas on this dense
    // page can both read 1 while their raw costs still differ.
    const costs = [0.15, 0.3, 0.45, 0.6].map((v) => run(uniform(v)).rawCTC);
    for (let i = 1; i < costs.length; i++) expect(costs[i]).toBeLessThan(costs[i - 1]);
  });
});

describe("the replacement constants are named and honest", () => {
  // Both constants moved into the provenance registry (2026-10-21), where the
  // status and the settler live beside the value instead of in a comment.
  test("the epsilon is registered as a definition: numerical, not behavioural", () => {
    const e = MODEL_PROVENANCE["chain.capacityEpsilon"];
    expect(e?.status).toBe("definition");
    expect(e?.value).toBe(1e-4);
    expect(e?.source).toContain("NOT a behavioural limit");
    // Not out of reach either: until 21.0 the source said it sat "three orders
    // of magnitude below anything a persona reaches", while siteFamiliarity is
    // 0 in the tool path and the first gated layer lifts it to the floor.
    expect(e?.source).not.toMatch(/orders of magnitude below/);
    expect(e?.source).toMatch(/does bind/);
    expect(CHAIN).toContain("const CAPACITY_EPSILON = P.capacityEpsilon;");
  });

  test("the drawdown cap is registered as a hypothesis with its settler named", () => {
    const e = MODEL_PROVENANCE["chain.maxDrawdownFraction"];
    expect(e?.status).toBe("hypothesis");
    expect(e?.value).toBe(0.5);
    expect(e?.source).toMatch(/would fit/);
    expect(CHAIN).toContain("const MAX_DRAWDOWN_FRACTION = P.maxDrawdownFraction;");
  });
});
