/**
 * The CIF score's piecewise components are continuous at their knees, by
 * construction, and predictability has one slope.
 *
 * overloadThreshold's score above its knee used to start from a registered
 * constant (60) while the branch below ended at 61, so it stepped down a point
 * at CTC 0.6; its knee is now the high band's cut point, ctcBands.high.
 * interactionCount and informationDensity met only because their
 * knee scores happened to agree with their slopes. All three knee scores are
 * now derived from the slope below (kneeScore() in cif-score.ts), so changing
 * a slope cannot open a step; the tests perturb the slopes to prove it.
 * predictability's knee at 12 joined two equal slopes and changed no score; it
 * is gone.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { computeCIFScore, type CIFInput } from "../src/cif-score.js";
import { CIF_PROVENANCE } from "../src/visual/provenance/cif.js";
import { param, withParamOverrides } from "../src/visual/model-provenance.js";

const EPS = 1e-9;
const at = (input: Partial<CIFInput>) => computeCIFScore({ url: "https://example.test/", ...input });

/** Score just at the knee and just above it; continuous means equal. */
function sides(knee: number, score: (x: number) => number) {
  return { atKnee: score(knee), justAbove: score(knee + EPS) };
}

const overload = (x: number) => at({ totalCTC: x }).sensory.components.overloadThreshold.score;
const interaction = (x: number) => at({ interactiveCount: x }).motor.components.interactionCount.score;
const density = (x: number) => at({ elementCount: x }).cognitive.components.informationDensity.score;

describe("CIF piecewise scores are continuous at their knees", () => {
  test("overloadThreshold does not step at its knee (the high band's cut point, 0.8)", () => {
    const { atKnee, justAbove } = sides(param("ctcBands.high"), overload);
    expect(atKnee).toBe(61);
    expect(justAbove).toBe(atKnee);
  });

  test("interactionCount and informationDensity meet at their knees", () => {
    for (const [knee, f] of [[param("cif.motor.interactive.kneeCount"), interaction], [param("cif.cognitive.density.kneeCount"), density]] as const) {
      const { atKnee, justAbove } = sides(knee, f);
      expect(justAbove).toBe(atKnee);
    }
  });

  test("continuity survives a change of the slope below the knee (the knee score is derived, not registered)", () => {
    const cases: Array<[string, number, string, (x: number) => number]> = [
      ["cif.sensory.overload.slopeBelowKnee", 70, "ctcBands.high", overload],
      ["cif.motor.interactive.slopeBelowKnee", 1.5, "cif.motor.interactive.kneeCount", interaction],
      ["cif.cognitive.density.divisorBelowKnee", 10, "cif.cognitive.density.kneeCount", density],
    ];
    for (const [slopeId, value, kneeId, f] of cases) {
      withParamOverrides({ [slopeId]: value }, () => {
        const { atKnee, justAbove } = sides(param(kneeId), f);
        expect({ slopeId, justAbove }).toEqual({ slopeId, justAbove: atKnee });
      });
    }
  });

  test("no knee score is registered", () => {
    expect(CIF_PROVENANCE.filter((e) => /kneeScore/.test(e.id)).map((e) => e.id)).toEqual([]);
  });
});

describe("predictability has one slope", () => {
  test("every item above the free count costs the same, and no knee is registered", () => {
    const free = param("cif.cognitive.predictability.freeCount");
    const slope = param("cif.cognitive.predictability.slope");
    const predict = (n: number) => at({ navItemCount: n }).cognitive.components.predictability.score;
    expect(predict(free)).toBe(param("cif.scale.max"));
    for (let n = free + 1; n <= 26; n++) {
      expect({ n, score: predict(n) }).toEqual({ n, score: Math.max(0, param("cif.scale.max") - (n - free) * slope) });
    }
    expect(CIF_PROVENANCE.filter((e) => e.id.startsWith("cif.cognitive.predictability.")).map((e) => e.id).sort()).toEqual([
      "cif.cognitive.predictability.freeCount",
      "cif.cognitive.predictability.slope",
    ]);
  });
});
