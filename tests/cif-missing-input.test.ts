/**
 * The CIF score's one rule for missing inputs (cif.noData.score).
 *
 * A component scores only from inputs the caller supplied. When none of its
 * inputs was supplied it is not measured: it scores cif.noData.score, carries
 * measured: false, says "Not measured" in its details, is listed in
 * notMeasured and is never a top issue. Before 21.0 eighteen per-input
 * defaults disagreed with each other and several scored full marks; this file
 * pins the rule per component, each with an absence test (the same component
 * IS measured once its input is back), so a vacuous pass is impossible.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { computeCIFScore, type CIFInput, type CIFScore } from "../src/cif-score.js";
import { CIF_PROVENANCE } from "../src/visual/provenance/cif.js";
import { param } from "../src/visual/model-provenance.js";

const NO_DATA = param("cif.noData.score");

/** An input that supplies every field any component reads. */
const FULL: CIFInput = {
  url: "https://example.test/full",
  barriers: [],
  touchTargets: [{ width: 48, height: 48 }, { width: 30, height: 30 }],
  contrastIssues: [{ ratio: 3.2, isLargeText: false }],
  agentReadyScore: 80,
  semanticScore: 82,
  ariaScore: 78,
  landmarkScore: 76,
  headingScore: 84,
  formLabelScore: 88,
  totalCTC: 0.45,
  layers: [{ name: "decision", cost: 0.1 }, { name: "motor", cost: 0.05 }],
  elementCount: 300,
  interactiveCount: 25,
  navItemCount: 9,
  animationCount: 2,
  hasReducedMotionSupport: false,
  ctaCaptureRate: 0.3,
  fleschScore: 60,
  informationDensity: 0.5,
};

/** Per component: the input fields it reads (every alternative, so removing all of them leaves it nothing). */
const READS: Record<string, Array<keyof CIFInput>> = {
  "motor.touchTargetCompliance": ["touchTargets", "barriers"],
  "motor.hitProbability": ["touchTargets"],
  "motor.interactionCount": ["interactiveCount"],
  "motor.spacingAdequacy": ["barriers"],
  "motor.dragFreeAlternatives": ["barriers"],
  "visual.contrastCompliance": ["contrastIssues", "barriers", "agentReadyScore"],
  "visual.textScalability": ["informationDensity"],
  "visual.colorIndependence": ["barriers"],
  "visual.focusVisibility": ["semanticScore", "agentReadyScore"],
  "visual.spacingDensity": ["informationDensity"],
  "cognitive.decisionComplexity": ["layers"],
  "cognitive.readability": ["fleschScore"],
  "cognitive.informationDensity": ["elementCount"],
  "cognitive.attentionClarity": ["ctaCaptureRate"],
  "cognitive.predictability": ["navItemCount"],
  "sensory.animationControl": ["animationCount"],
  "sensory.sensoryIndependence": ["barriers"],
  "sensory.visualCalm": ["informationDensity"],
  "sensory.layoutConsistency": ["agentReadyScore"],
  "sensory.overloadThreshold": ["totalCTC"],
  "navigation.semanticStructure": ["semanticScore", "headingScore", "landmarkScore", "agentReadyScore"],
  "navigation.keyboardOperability": ["barriers"],
  "navigation.skipMechanisms": ["barriers"],
  "navigation.linkButtonClarity": ["ariaScore"],
  "navigation.formAccessibility": ["formLabelScore", "barriers"],
};

function component(result: CIFScore, key: string) {
  const [cat, name] = key.split(".") as [keyof CIFScore, string];
  return (result[cat] as { components: Record<string, { score: number; details: string; measured: boolean }> }).components[name];
}

function without(fields: Array<keyof CIFInput>): CIFInput {
  const input: Record<string, unknown> = { ...FULL };
  for (const f of fields) delete input[f];
  return input as unknown as CIFInput;
}

describe("CIF missing-input rule", () => {
  test("the table covers all 25 components", () => {
    const result = computeCIFScore(FULL);
    const all = (["motor", "visual", "cognitive", "sensory", "navigation"] as const)
      .flatMap((c) => Object.keys(result[c].components).map((n) => `${c}.${n}`));
    expect(Object.keys(READS).sort()).toEqual(all.sort());
  });

  test("with every input supplied, every component is measured (absence test of the table)", () => {
    const result = computeCIFScore(FULL);
    expect(result.notMeasured).toEqual([]);
    for (const key of Object.keys(READS)) expect({ key, measured: component(result, key).measured }).toEqual({ key, measured: true });
  });

  for (const [key, fields] of Object.entries(READS)) {
    test(`${key}: with ${fields.join(", ")} missing it is not measured, scores ${NO_DATA}, and is not a top issue`, () => {
      const result = computeCIFScore(without(fields));
      const c = component(result, key);
      expect(c.measured).toBe(false);
      expect(c.score).toBe(NO_DATA);
      expect(c.score).toBeLessThan(param("cif.scale.max"));
      expect(c.details).toMatch(/^Not measured: no .+ supplied$/);
      expect(result.notMeasured).toContain(key);
      expect(result.topIssues.map((i) => `${i.category}.${i.component}`)).not.toContain(key);
    });
  }

  test("an empty input measures nothing: every component scores the no-data value and nothing is a top issue", () => {
    const result = computeCIFScore({ url: "https://example.test/empty" });
    expect(result.notMeasured.length).toBe(25);
    expect(result.topIssues).toEqual([]);
    for (const cat of ["motor", "visual", "cognitive", "sensory", "navigation"] as const) {
      expect(result[cat].score).toBe(NO_DATA);
    }
    expect(result.composite).toBe(NO_DATA);
  });

  test("hitProbability without target sizes says it was not measured, not that no barriers were found", () => {
    const c = computeCIFScore({ url: "https://example.test/", barriers: [] }).motor.components.hitProbability;
    expect(c.measured).toBe(false);
    expect(c.details).not.toMatch(/No touch target barriers detected/);
    expect(c.details).toMatch(/touch target sizes/);
  });

  test("an empty barrier list is an audit that found nothing; an undefined one is no audit", () => {
    const audited = computeCIFScore({ url: "https://example.test/", barriers: [] });
    const unaudited = computeCIFScore({ url: "https://example.test/" });
    for (const key of ["motor.dragFreeAlternatives", "visual.colorIndependence", "sensory.sensoryIndependence", "navigation.keyboardOperability", "navigation.skipMechanisms"]) {
      expect({ key, ...pick(component(audited, key)) }).toEqual({ key, measured: true, score: param("cif.scale.max") });
      expect({ key, ...pick(component(unaudited, key)) }).toEqual({ key, measured: false, score: NO_DATA });
    }
  });

  test("animations with no reduced-motion flag are not measured; no animations need no flag", () => {
    const unknown = computeCIFScore({ url: "https://example.test/", animationCount: 3 }).sensory.components.animationControl;
    expect(unknown.measured).toBe(false);
    expect(unknown.details).toMatch(/prefers-reduced-motion/);
    const none = computeCIFScore({ url: "https://example.test/", animationCount: 0 }).sensory.components.animationControl;
    expect(pick(none)).toEqual({ measured: true, score: param("cif.scale.max") });
  });

  test("NaN is a missing input, not a number", () => {
    const result = computeCIFScore({ url: "https://example.test/", fleschScore: Number.NaN, totalCTC: Number.NaN });
    expect(result.cognitive.components.readability.measured).toBe(false);
    expect(result.sensory.components.overloadThreshold.measured).toBe(false);
  });

  test("contrast issues without an element count are scored per issue, not against an assumed count", () => {
    const issues = [{ ratio: 2, isLargeText: false }, { ratio: 2.5, isLargeText: false }];
    const c = computeCIFScore({ url: "https://example.test/", contrastIssues: issues }).visual.components.contrastCompliance;
    expect(c.measured).toBe(true);
    expect(c.score).toBe(param("cif.scale.max") - issues.length * param("cif.visual.contrast.barrierPenalty"));
    expect(c.details).toMatch(/no element count, so scored per issue/);
  });

  test("the registry holds exactly one missing-input value", () => {
    const noDataIds = CIF_PROVENANCE.filter((e) => /no ?data/i.test(e.id)).map((e) => e.id);
    expect(noDataIds).toEqual(["cif.noData.score"]);
    expect(param("cif.noData.score")).toBeLessThan(param("cif.scale.max"));
  });
});

function pick(c: { measured: boolean; score: number }) {
  return { measured: c.measured, score: c.score };
}
