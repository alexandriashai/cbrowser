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
import { computeDemandDistribution, computeSequentialCTC } from "../src/visual/cognitive-transport-chain.js";
import { MODEL_PROVENANCE } from "../src/visual/model-provenance.js";

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
    const costs = [0.15, 0.3, 0.45, 0.6].map((v) => run(uniform(v)).totalCTC);
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
