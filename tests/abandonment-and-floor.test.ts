/**
 * Two numbers a customer reads side by side, and what they were actually saying.
 *
 * BUG-17: `interpretation` said "should handle this page comfortably" next to a
 * 39% abandonment risk. That looked like two independent measures disagreeing.
 * It was not. Abandonment was a logistic centred at 1.5x tolerance, and a
 * logistic evaluated below its centre still returns a substantial value, so
 * every persona carried a floor no page could lower:
 *
 *   persona          risk on a page costing them NOTHING
 *   impatient-user   40%     cognitive-adhd 34%     power-user 25%
 *   elderly-user     11%     perfect patience 8%
 *
 * Across the real deficit range on these pages (0 to 0.28) cognitive-adhd moved
 * 34% -> 45%: an 11-point span sitting on a 34-point floor. The number was ~85%
 * constant. Folding it into the verdict, which is what was recommended, would
 * have imported that constant into the sentence.
 *
 * BUG-18: `readability` reports a bare 0 whenever decoding capacity exceeds
 * demand, so it cannot distinguish 91% legibility from 99%. The floor is right;
 * reporting nothing but the floor is not.
 *
 * @since 2026-08-03
 */
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COGNITIVE_TRAITS, buildOTCognitiveProfile } from "../src/visual/cognitive-transport.js";
import { withLawSeconds } from "./fixtures/law-seconds.js";
import { computeDemandDistribution, computeSequentialCTC } from "../src/visual/cognitive-transport-chain.js";

const EMPTY_PAGE = {
  informationDensity: 0, visualComplexity: 0, interactiveElementCount: 0,
  textDensity: 0, animationLevel: 0, choiceCount: 0, navigationDepth: 0,
} as never;
const REAL_PAGE = {
  informationDensity: 0.65, visualComplexity: 0.55, interactiveElementCount: 60,
  textDensity: 0.7, animationLevel: 0.35, choiceCount: 18, navigationDepth: 2,
} as never;

const traits = (patience: number, resilience: number): Record<string, number> => ({
  ...Object.fromEntries((COGNITIVE_TRAITS as readonly string[]).map((t) => [t, 0.5])),
  patience, resilience,
});
const run = (t: Record<string, number>, page = REAL_PAGE) =>
  computeSequentialCTC(buildOTCognitiveProfile("p", t), computeDemandDistribution(withLawSeconds(page)),
    { asymmetric: true, interactions: true });

describe("abandonment risk has no floor (BUG-17)", () => {
  test("a page that costs nothing produces zero risk, for every temperament", () => {
    // The whole defect in one assertion. Every one of these returned 8-40%
    // before, on a page with nothing on it.
    for (const [patience, resilience] of [[0.1, 0.3], [0.2, 0.4], [0.3, 0.8], [0.9, 0.7], [1, 1]]) {
      expect({ patience, risk: run(traits(patience, resilience), EMPTY_PAGE).abandonmentRisk })
        .toEqual({ patience, risk: 0 });
    }
  });

  test("a persona with no patience at all does not divide by zero", () => {
    const r = run(traits(0, 0), EMPTY_PAGE).abandonmentRisk;
    expect(Number.isFinite(r)).toBe(true);
    expect(r).toBe(0);
    // And on a real page they are at high risk rather than NaN.
    const real = run(traits(0, 0)).abandonmentRisk;
    expect(Number.isFinite(real)).toBe(true);
    expect(real).toBeGreaterThan(0.5);
  });

  test("risk still rises with cost, monotonically", () => {
    const at = (density: number) => computeSequentialCTC(
      buildOTCognitiveProfile("p", traits(0.2, 0.4)),
      computeDemandDistribution(withLawSeconds({ informationDensity: density, visualComplexity: density,
        interactiveElementCount: density * 100, textDensity: density, animationLevel: density * 0.5,
        choiceCount: density * 30, navigationDepth: density * 5 } as never)),
      { asymmetric: true, interactions: true }).abandonmentRisk;
    const curve = [0, 0.2, 0.4, 0.6, 0.8, 1].map(at);
    for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1] - 1e-9);
    expect(curve[curve.length - 1]).toBeGreaterThan(curve[0]);
  });

  test("the impatient still abandon sooner than the patient", () => {
    // Removing the offset must not remove the persona signal with it.
    const impatient = run(traits(0.1, 0.3)).abandonmentRisk;
    const patient = run(traits(0.9, 0.7)).abandonmentRisk;
    expect(impatient).toBeGreaterThan(patient);
  });

  test("it is bounded, and reaches neither end spuriously", () => {
    const r = run(traits(0.2, 0.4)).abandonmentRisk;
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
  });
});

describe("a layer at its cost floor still says something (BUG-18)", () => {
  test("headroom is reported where cost has stopped discriminating", () => {
    // Capacity far above demand: cost is 0 and stays 0 however much more
    // capacity is added, so the cost alone cannot rank two comfortable readers.
    const t = { ...traits(0.5, 0.5), readingCapacity: 0.95 };
    const layer = run(t).layers.find((l: { name: string }) => l.name === "readability")!;
    expect(layer.transportCost).toBe(0);
    expect(layer.headroom).toBeGreaterThan(0);
  });

  test("more spare capacity means more headroom, at identical zero cost", () => {
    const headroomAt = (readingCapacity: number) => {
      const l = run({ ...traits(0.5, 0.5), readingCapacity }).layers
        .find((x: { name: string }) => x.name === "readability")!;
      return { cost: l.transportCost, headroom: l.headroom };
    };
    const a = headroomAt(0.8), b = headroomAt(0.99);
    expect(a.cost).toBe(0);
    expect(b.cost).toBe(0);
    // Identical costs, different headroom. That is the discrimination the floor
    // destroyed and this restores.
    expect(b.headroom).toBeGreaterThan(a.headroom);
  });

  test("a layer in deficit reports no headroom", () => {
    const l = run({ ...traits(0.5, 0.5), readingCapacity: 0.05 }).layers
      .find((x: { name: string }) => x.name === "readability")!;
    expect(l.transportCost).toBeGreaterThan(0);
    expect(l.headroom).toBe(0);
  });

  test("the tool emits headroom only at the floor, never as a second cost", () => {
    const src = require("node:fs").readFileSync(
      require("node:path").join(import.meta.dir, "..", "src", "mcp-tools", "base", "persona-comparison-tools.ts"), "utf8");
    // The floor gate itself: headroom is a floor-only field, never a second cost.
    expect(src).toContain("l.transportCost < 0.001");
    expect(src).toContain("costIsAtFloor: true");
  });

  test("a floored layer with NO headroom is reported, not suppressed", () => {
    // The original gate was `transportCost < 0.001 && headroom > 0`, which hid the
    // worse of the two floors. A layer at zero cost with capacity to spare was
    // never challenged; one at zero cost with nothing left is exhausted, and both
    // print `cost: 0`. Suppressing the second left the caller unable to tell them
    // apart -- while the reading-model note in the same payload told them to read a
    // headroom field that was not emitted. (BUG-28)
    const src = require("node:fs").readFileSync(
      require("node:path").join(import.meta.dir, "..", "src", "mcp-tools", "base", "persona-comparison-tools.ts"), "utf8");
    expect(src).not.toContain("l.transportCost < 0.001 && l.headroom > 0");
    expect(src).toContain("floorMeaning");
    expect(src).toContain("exhausted");
    expect(src).toContain("unchallenged");
  });
});

describe("the uncalibrated constants are named and flagged", () => {
  test("the Hill exponent is exported, defaulted, and marked uncalibrated", async () => {
    // It is doing most of the work in the k-split table -- 22% to 2% across 14
    // steps on identical total demand -- and nothing empirical set it. Same
    // status as MOTOR_LAYER_WEIGHTS, same treatment.
    const { ABANDONMENT_HILL_EXPONENT } = await import("../src/visual/cognitive-transport-chain.js");
    expect(ABANDONMENT_HILL_EXPONENT).toBe(2);
    const src = readFileSync(join(import.meta.dir, "..", "src", "visual", "cognitive-transport-chain.ts"), "utf8");
    const block = src.slice(src.indexOf("Hill exponent on the abandonment curve"), src.indexOf("export const ABANDONMENT_HILL_EXPONENT"));
    expect(block).toContain("UNCALIBRATED");
    expect(block).toContain("What would settle it");
  });

  test("the cost function reads the constant rather than a literal", () => {
    const src = readFileSync(join(import.meta.dir, "..", "src", "visual", "cognitive-transport-chain.ts"), "utf8");
    // Read from the registry per run (chain.abandonmentHillExponent), the same
    // value ABANDONMENT_HILL_EXPONENT exports, so the dependency is recorded.
    expect(src).toContain("ABANDONMENT_STEEPNESS = P.abandonmentHillExponent");
  });
});
