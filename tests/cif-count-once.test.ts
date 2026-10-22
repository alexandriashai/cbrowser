/**
 * Each barrier the audit reports is counted by exactly one CIF component.
 *
 * Until 21.0 spacingAdequacy read touch_target barriers, the same ones the
 * touchTargetCompliance fallback counts, so a page with them and no size data
 * was penalised twice; keyboardOperability counted a motor_precision barrier
 * that mentioned "keyboard" twice; sensoryIndependence counted a barrier that
 * mentioned captions and audio twice. spacingAdequacy now reads the audit's
 * close-spacing barrier (weightKey "target_spacing"), which
 * keyboardOperability skips.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { computeCIFScore, type CIFInput, type CIFScore } from "../src/cif-score.js";
import { param } from "../src/visual/model-provenance.js";

type Barrier = NonNullable<CIFInput["barriers"]>[number];

/** Audited (barriers: []) but with no target sizes and no contrast issues, so every barrier path is live. */
const BASE: CIFInput = {
  url: "https://example.test/audited",
  barriers: [],
  agentReadyScore: 80,
  semanticScore: 80,
  ariaScore: 80,
  formLabelScore: 80,
  interactiveCount: 20,
};

function scores(result: CIFScore): Record<string, number> {
  const out: Record<string, number> = {};
  for (const cat of ["motor", "visual", "cognitive", "sensory", "navigation"] as const) {
    for (const [name, c] of Object.entries(result[cat].components)) out[`${cat}.${name}`] = c.score;
  }
  return out;
}

function moved(extra: Barrier[]): string[] {
  const before = scores(computeCIFScore(BASE));
  const after = scores(computeCIFScore({ ...BASE, barriers: extra }));
  return Object.keys(before).filter((k) => before[k] !== after[k]).sort();
}

const CLOSE_SPACING: Barrier = { type: "motor_precision", severity: "minor", weightKey: "target_spacing" };

describe("CIF counts each barrier once", () => {
  const cases: Array<[string, Barrier, string]> = [
    ["touch_target (no size data)", { type: "touch_target", severity: "major" }, "motor.touchTargetCompliance"],
    ["close-spacing", CLOSE_SPACING, "motor.spacingAdequacy"],
    ["motor_precision", { type: "motor_precision", severity: "major" }, "navigation.keyboardOperability"],
    ["keyboard_trap", { type: "keyboard_trap", severity: "critical" }, "navigation.keyboardOperability"],
    ["drag_required", { type: "drag_required", severity: "major" }, "motor.dragFreeAlternatives"],
    ["color_only_indicator", { type: "color_only_indicator", severity: "major" }, "visual.colorIndependence"],
    ["contrast", { type: "contrast", severity: "major" }, "visual.contrastCompliance"],
    ["missing_caption", { type: "missing_caption", severity: "major" }, "sensory.sensoryIndependence"],
    ["audio_autoplay", { type: "audio_autoplay", severity: "major" }, "sensory.sensoryIndependence"],
    ["missing_skip_link", { type: "missing_skip_link", severity: "major" }, "navigation.skipMechanisms"],
    ["form_unlabeled", { type: "form_unlabeled", severity: "major" }, "navigation.formAccessibility"],
  ];
  for (const [label, barrier, only] of cases) {
    test(`a ${label} barrier moves ${only} and nothing else`, () => {
      expect(moved([barrier])).toEqual([only]);
    });
  }

  test("touch_target barriers no longer lower spacingAdequacy", () => {
    const r = computeCIFScore({ ...BASE, barriers: [{ type: "touch_target", severity: "major" }, { type: "touch_target", severity: "major" }] });
    expect(r.motor.components.spacingAdequacy.score).toBe(param("cif.scale.max"));
    expect(r.motor.components.touchTargetCompliance.score).toBeLessThan(param("cif.scale.max"));
  });

  test("a motor_precision barrier that mentions the keyboard is one keyboard barrier, not two", () => {
    const r = computeCIFScore({ ...BASE, barriers: [{ type: "motor_precision", severity: "major", description: "slider needs fine pointer control and has no keyboard steps" }] });
    expect(r.navigation.components.keyboardOperability.score).toBe(param("cif.scale.max") - param("cif.navigation.keyboard.barrierPenalty"));
  });

  test("a barrier that mentions captions and audio is one sensory barrier, not two", () => {
    const r = computeCIFScore({ ...BASE, barriers: [{ type: "missing_caption", severity: "major", description: "audio track has no captions" }] });
    expect(r.sensory.components.sensoryIndependence.score).toBe(param("cif.scale.max") - param("cif.sensory.audio.barrierPenalty"));
  });

  test("the close-spacing details quote the detector's registered gap", () => {
    const r = computeCIFScore({ ...BASE, barriers: [CLOSE_SPACING] });
    expect(r.motor.components.spacingAdequacy.details).toContain(`under ${param("cif.motor.spacing.minGapPx")}px apart`);
  });
});
