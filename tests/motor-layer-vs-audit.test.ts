/**
 * The `motor` layer and `motorAccessibility` answer different questions, and
 * one thing inside the layer was backwards.
 *
 * D-9 asked whether the layer cost is MEANT to track the accessibility score.
 * It is not, and that half is by design:
 *
 *   motor layer cost   aggregate transport between persona capacity (pointing
 *                      AND procedural) and a demand derived from how many
 *                      interactive elements the page has. Never looks at an
 *                      individual control.
 *   motorAccessibility per-element Fitts and hit probability, counting barriers.
 *
 * Two questions, so they move independently and both can be right. Removing one
 * interactive element moves the layer cost from 0.0716 to 0.0696 while the
 * accessibility score moves eleven points, because the layer reads a COUNT and
 * the audit reads ELEMENTS. That is BUG-11's observation, explained.
 *
 * What was NOT by design: `motorCapacity` surplus was billed at 0.3, so being a
 * better pointer than the page required cost more. Measured on a 10-control
 * page, before:
 *
 *   cognitive-adhd           motorCapacity 0.741 (best)    0.0499
 *   motor-impairment-tremor  motorCapacity 0.438 (worst)   0.0262
 *
 * The best pointer paid nearly twice the worst.
 *
 * @since 2026-08-03
 */
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COGNITIVE_TRAITS, buildOTCognitiveProfile, deriveMetrics } from "../src/visual/cognitive-transport.js";
import { RAW_LATIN } from "./fixtures/raw-page-measurements.js";
import { withLawSeconds } from "./fixtures/law-seconds.js";
import { computeDemandDistribution, computeSequentialCTC } from "../src/visual/cognitive-transport-chain.js";

const CHAIN = readFileSync(join(import.meta.dir, "..", "src", "visual", "cognitive-transport-chain.ts"), "utf8");
const page = (interactiveElementCount: number) => computeDemandDistribution(withLawSeconds({
  informationDensity: 0.4, visualComplexity: 0.3, interactiveElementCount,
  textDensity: 0.4, animationLevel: 0, choiceCount: 5, navigationDepth: 1,
} as never));
const base: Record<string, number> = Object.fromEntries(
  (COGNITIVE_TRAITS as readonly string[]).map((t) => [t, 0.5]));
const motorCost = (traits: Record<string, number>, controls = 10) => {
  const r = computeSequentialCTC(buildOTCognitiveProfile("p", traits), page(controls),
    { asymmetric: true, interactions: true });
  return (r.layers as Array<{ name: string; transportCost: number }>).find((l) => l.name === "motor")!.transportCost;
};

describe("a better pointer never costs more", () => {
  test("motor cost is non-increasing in motorCapacity, at every page density", () => {
    for (const controls of [3, 10, 25, 40, 80]) {
      const costs = [0.3, 0.45, 0.6, 0.75, 0.9].map((mc) => motorCost({ ...base, motorCapacity: mc }, controls));
      for (let i = 1; i < costs.length; i++) {
        expect({ controls, step: i, ordered: costs[i] <= costs[i - 1] + 1e-9 })
          .toEqual({ controls, step: i, ordered: true });
      }
    }
  });

  test("surplus pointing capacity is free, not merely cheap", () => {
    // Above the page's demand the cost must stop moving entirely. Billed at
    // 0.3 it kept rising, which is how the best pointer came to pay most.
    const above = [0.75, 0.85, 0.95, 1.0].map((mc) => motorCost({ ...base, motorCapacity: mc }, 3));
    expect(new Set(above.map((c) => c.toFixed(9))).size).toBe(1);
  });

  test("the dimension is declared surplus-free alongside the others", () => {
    expect(CHAIN).toMatch(/SURPLUS_FREE_DIMENSIONS = new Set\(\[[^\]]*'motorCapacity'/);
  });
});

describe("the layer and the audit are different instruments (D-9)", () => {
  test("Stage B: the layer reads the elements, through Fitts' law, not their count", () => {
    // Was "the layer reads a COUNT, not elements" (BUG-11's observation). Since
    // Stage B the motor demand is the time to acquire every target in scope
    // (lawSecondsOf), so the layer sees each element's size and distance. The
    // two instruments still answer different questions: the layer sums one
    // time over the page; motorAccessibility reports hit probability per element.
    const t = { ...base, motorCapacity: 0.4 };
    const withBoxes = (w: number, h: number, far: boolean) => {
      const raw = structuredClone(RAW_LATIN);
      const n = raw.boxes.length / 5;
      raw.boxes = Array.from({ length: n }, (_, i) => [raw.boxes[i * 5], far ? 0 : raw.viewportWidth / 2 - w / 2, far ? raw.scrollY : raw.scrollY + raw.viewportHeight / 2 - h / 2, w, h]).flat();
      return deriveMetrics(raw);
    };
    const near = withBoxes(200, 60, false);
    const far = withBoxes(8, 8, true);
    expect(near.interactiveElementCount).toBe(far.interactiveElementCount);
    expect(far.pointingSeconds).toBeGreaterThan(near.pointingSeconds);
    const cost = (m: ReturnType<typeof deriveMetrics>) => {
      const r = computeSequentialCTC(buildOTCognitiveProfile("p", t), computeDemandDistribution(m), { asymmetric: true, interactions: true });
      return (r.layers as Array<{ name: string; transportCost: number }>).find((l) => l.name === "motor")!.transportCost;
    };
    expect(cost(far)).toBeGreaterThan(cost(near));
  });

  test("the layer is pointing only, and the audit relationship is still stated", () => {
    // CHANGED 2026-08-03 with the motor split, and the change is the point.
    // This test used to assert `motor` carried BOTH pointing and procedural
    // capacity, because it did. The equal-weight question that made that
    // uncomfortable was not answered -- it was dissolved by giving each
    // mechanism its own layer, so their contributions are additive and visible
    // instead of summed inside one scalar.
    const block = CHAIN.slice(CHAIN.indexOf("name: 'motor'"), CHAIN.indexOf("name: 'frustration'"));
    const [motorTraits] = Array.from(block.matchAll(/traits: \[([^\]]*)\]/g), (m) => m[1]);
    expect(motorTraits).toContain("motorCapacity");
    expect(motorTraits).not.toContain("proceduralFluency");
    // The D-9 finding it still has to carry: the layer and the audit are
    // different instruments and can diverge.
    expect(block).toContain("motorAccessibility");
  });

  test("no weighting was invented in place of the split", () => {
    // The calibration question is gone rather than answered. If a weight is
    // ever needed it has a named home that defaults to 1.0 and says it is
    // uncalibrated -- see MOTOR_LAYER_WEIGHTS and tests/motor-split.test.ts.
    expect(CHAIN).toContain("MOTOR_LAYER_WEIGHTS");
    expect(CHAIN).toContain("UNCALIBRATED");
  });
});
