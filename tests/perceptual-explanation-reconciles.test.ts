/**
 * The score explanation must account for every point it explains.
 *
 * Measured 2026-10-06 on a live tremor audit of cbrowser.ai:
 *   explanation  "Weighted barrier deductions: hover dependent (-20.7),
 *                 touch target (-20), timing (-5.4)..."
 *   deductionsByType {touch_target:-20, timing:-5.4, color_only:-3.9,
 *                     hover_dependent:-20.7}   (sum -50)
 * `.slice(0, 3)` dropped color_only, so the prose summed to -46.1 while
 * sitting next to a -50 it claimed to explain. A reader who adds up the
 * sentence cannot reach the score.
 *
 * Same sentence, same class: the goal penalty is capped at 25 in the score and
 * in the `goalDeduction` field, but the prose printed the uncapped value -- a
 * tremor persona (3.0x motor cost) read "-45.0" for a 25-point deduction.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { calculatePerceptualScore } from "../src/visual/perceptual-transport.js";

type B = { type: string; severity: string; element?: string; wcagCriteria?: string[] };

/** Five distinct weight buckets for the tremor profile -- more than three. */
const BARRIERS: B[] = [
  { type: "touch_target", severity: "major", wcagCriteria: ["2.5.8"] },
  { type: "motor_precision", severity: "major", wcagCriteria: ["2.1.1", "2.5.1"] },
  { type: "timing", severity: "minor", wcagCriteria: ["2.2.1"] },
  { type: "sensory", severity: "minor", wcagCriteria: ["1.4.1"] },
  { type: "contrast", severity: "minor", wcagCriteria: ["1.4.3"] },
];

/** Pull "(-12.3)" figures out of the barrier-deduction clause only. */
function namedDeductions(explanation: string): number[] {
  const clause = explanation.split(". ").find((s) => s.startsWith("Weighted barrier deductions"));
  if (!clause) return [];
  return [...clause.matchAll(/\((-?\d+(?:\.\d+)?)\)/g)].map((m) => Number(m[1]));
}

describe("barrier deductions in the explanation", () => {
  test("the fixture really produces more than three buckets", () => {
    const r = calculatePerceptualScore(BARRIERS, [], true, "motor-impairment-tremor");
    expect(Object.keys(r.deductions).length).toBeGreaterThan(3);
  });

  test("every bucket in deductionsByType is named in the prose", () => {
    const r = calculatePerceptualScore(BARRIERS, [], true, "motor-impairment-tremor");
    for (const key of Object.keys(r.deductions)) {
      expect(r.explanation, `${key} missing from: ${r.explanation}`).toContain(key.replace(/_/g, " "));
    }
  });

  test("the named deductions sum to the total the payload reports", () => {
    const r = calculatePerceptualScore(BARRIERS, [], true, "motor-impairment-tremor");
    const total = Object.values(r.deductions).reduce((a, b) => a + b, 0);
    const named = namedDeductions(r.explanation).reduce((a, b) => a + b, 0);
    expect(named).toBeCloseTo(total, 1);
  });

  test("a page with no barriers says nothing about barrier deductions", () => {
    const r = calculatePerceptualScore([], [], true, "motor-impairment-tremor");
    expect(r.explanation).not.toContain("Weighted barrier deductions");
  });
});

describe("goal penalty in the explanation", () => {
  test("prose reports the capped figure that was actually deducted", () => {
    // Tremor carries motorCostMultiplier 3.0: 15 x 3 = 45 raw, 25 after the cap.
    const r = calculatePerceptualScore([], [], false, "motor-impairment-tremor");
    expect(r.goalDeduction).toBe(25);
    const m = r.explanation.match(/Goal penalty \([^)]*\): -(\d+(?:\.\d+)?)/);
    expect(m, r.explanation).not.toBeNull();
    expect(Number(m![1])).toBe(r.goalDeduction);
  });
});
