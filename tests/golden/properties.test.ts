/**
 * Property-based tests for the CIF scoring engine (fast-check).
 *
 * Asserts invariants the implementation genuinely guarantees, over an
 * arbitrary CIFInput generator that covers absent/present combinations of
 * every optional field:
 *   1. determinism -- same input always produces the same score
 *   2. bounds -- composite, category, and component scores stay in [0, 100]
 *   3. monotonicity -- adding a keyboard barrier never raises navigation,
 *      an additional contrast issue never raises visual, and more
 *      uncontrolled animations never raise sensory
 *   4. the missing-input rule -- every component that is not measured scores
 *      cif.noData.score, says so, is listed in notMeasured and is never a top
 *      issue
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import {
  computeCIFScore,
  type CIFComponentScore,
  type CIFInput,
  type CIFScore,
} from "../../src/cif-score.js";
import { param } from "../../src/visual/model-provenance.js";

const NUM_RUNS = 1000;

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const severityArb = fc.constantFrom("critical", "serious", "moderate", "minor");

const barrierArb = fc.record(
  {
    type: fc.constantFrom(
      "touch_target", "contrast", "keyboard_trap", "keyboard_inaccessible",
      "motor_precision", "missing_alt_text", "missing_caption", "audio_autoplay",
      "color_only_indicator", "drag_required", "missing_skip_link", "form_unlabeled",
    ),
    severity: severityArb,
    element: fc.string(),
    description: fc.string(),
    wcagCriteria: fc.array(
      fc.constantFrom("1.1.1", "1.4.1", "1.4.3", "2.1.1", "2.4.1", "2.5.5", "2.5.7"),
      { maxLength: 3 },
    ),
  },
  { requiredKeys: ["type", "severity"] },
);

const touchTargetArb = fc.record(
  {
    width: fc.integer({ min: 1, max: 400 }),
    height: fc.integer({ min: 1, max: 400 }),
    exempt: fc.boolean(),
  },
  { requiredKeys: ["width", "height"] },
);

const contrastIssueArb = fc.record(
  {
    ratio: fc.double({ min: 1, max: 21, noNaN: true }),
    isLargeText: fc.boolean(),
    element: fc.string(),
  },
  { requiredKeys: ["ratio", "isLargeText"] },
);

const layerArb = fc.record({
  name: fc.constantFrom(
    "perception", "attention", "memory", "decision", "choice architecture",
    "motor", "navigation",
  ),
  cost: fc.double({ min: 0, max: 1, noNaN: true }),
});

const pctArb = fc.double({ min: 0, max: 100, noNaN: true });

// Every field except `url` is optional -- requiredKeys makes fast-check
// generate all absent/present combinations, exercising every fallback path.
const cifInputArb: fc.Arbitrary<CIFInput> = fc.record(
  {
    url: fc.webUrl(),
    barriers: fc.array(barrierArb, { maxLength: 12 }),
    touchTargets: fc.array(touchTargetArb, { maxLength: 20 }),
    contrastIssues: fc.array(contrastIssueArb, { maxLength: 15 }),
    agentReadyScore: pctArb,
    semanticScore: pctArb,
    ariaScore: pctArb,
    landmarkScore: pctArb,
    headingScore: pctArb,
    formLabelScore: pctArb,
    totalCTC: fc.double({ min: 0, max: 3, noNaN: true }),
    layers: fc.array(layerArb, { maxLength: 6 }),
    abandonmentRisk: fc.double({ min: 0, max: 1, noNaN: true }),
    pageType: fc.constantFrom("landing", "form", "article", "dashboard", "checkout", "search"),
    elementCount: fc.integer({ min: 0, max: 5000 }),
    interactiveCount: fc.integer({ min: 0, max: 300 }),
    formFieldCount: fc.integer({ min: 0, max: 100 }),
    navItemCount: fc.integer({ min: 0, max: 40 }),
    linkCount: fc.integer({ min: 0, max: 500 }),
    imageCount: fc.integer({ min: 0, max: 200 }),
    animationCount: fc.integer({ min: 0, max: 30 }),
    hasReducedMotionSupport: fc.boolean(),
    ctaCaptureRate: fc.double({ min: 0, max: 1, noNaN: true }),
    distractorRatio: fc.double({ min: 0, max: 1, noNaN: true }),
    attentionQualityScore: pctArb,
    avgSentenceLength: fc.double({ min: 1, max: 60, noNaN: true }),
    fleschScore: fc.double({ min: -40, max: 120, noNaN: true }),
    technicalDensity: fc.double({ min: 0, max: 1, noNaN: true }),
    informationDensity: fc.double({ min: 0, max: 1.2, noNaN: true }),
  },
  { requiredKeys: ["url"] },
);

function stripTimestamp(score: CIFScore): Omit<CIFScore, "timestamp"> {
  const { timestamp: _timestamp, ...rest } = score;
  return rest;
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("CIF scoring properties", () => {
  test("determinism: the same input scored twice is deep-equal (modulo timestamp)", () => {
    fc.assert(
      fc.property(cifInputArb, (input) => {
        expect(stripTimestamp(computeCIFScore(input))).toEqual(
          stripTimestamp(computeCIFScore(input)),
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test("bounds: composite, category, and component scores stay within [0, 100]", () => {
    fc.assert(
      fc.property(cifInputArb, (input) => {
        const result = computeCIFScore(input);
        expect(result.composite).toBeGreaterThanOrEqual(0);
        expect(result.composite).toBeLessThanOrEqual(100);
        expect(["A+", "A", "B", "C", "D", "F"]).toContain(result.grade);
        expect(["platinum", "gold", "silver", "bronze", "none"]).toContain(result.certification);
        const categories: Array<{ score: number; components: Record<string, CIFComponentScore> }> = [
          result.motor, result.visual, result.cognitive, result.sensory, result.navigation,
        ];
        for (const category of categories) {
          expect(category.score).toBeGreaterThanOrEqual(0);
          expect(category.score).toBeLessThanOrEqual(100);
          for (const component of Object.values(category.components)) {
            expect(component.score).toBeGreaterThanOrEqual(0);
            expect(component.score).toBeLessThanOrEqual(100);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test("monotonicity: adding a keyboard-trap barrier never raises the navigation score", () => {
    // Base is always audited (barriers an array, possibly empty): going from
    // no audit to an audit switches the barrier components from not measured
    // (cif.noData.score) to measured, a different scale by design, like the
    // contrast proxy-to-measured switch below. Monotonicity holds within the
    // measured path, so both sides must be on it.
    fc.assert(
      fc.property(cifInputArb, severityArb, (raw, severity) => {
        const input: CIFInput = { ...raw, barriers: raw.barriers ?? [] };
        const withTrap: CIFInput = {
          ...input,
          barriers: [...(input.barriers ?? []), { type: "keyboard_trap", severity }],
        };
        const before = computeCIFScore(input);
        const after = computeCIFScore(withTrap);
        expect(after.navigation.score).toBeLessThanOrEqual(before.navigation.score);
        // keyboard_trap only feeds navigation, so the composite can't rise either
        expect(after.composite).toBeLessThanOrEqual(before.composite);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test("monotonicity: an additional contrast issue never raises the visual score", () => {
    // Base gets at least one issue: going from zero issues to one switches
    // contrastCompliance from proxy estimation to measured fail-ratio, which
    // is a different scale by design -- monotonicity holds within the
    // measured path, so both sides must be on it.
    fc.assert(
      fc.property(cifInputArb, contrastIssueArb, contrastIssueArb, (input, first, extra) => {
        const base: CIFInput = {
          ...input,
          contrastIssues: [...(input.contrastIssues ?? []), first],
        };
        const worse: CIFInput = {
          ...base,
          contrastIssues: [...(base.contrastIssues ?? []), extra],
        };
        expect(computeCIFScore(worse).visual.score).toBeLessThanOrEqual(
          computeCIFScore(base).visual.score,
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test("monotonicity: more animations without reduced-motion support never raise the sensory score", () => {
    fc.assert(
      fc.property(
        cifInputArb,
        fc.integer({ min: 0, max: 30 }),
        fc.integer({ min: 1, max: 30 }),
        (input, baseCount, extra) => {
          const calm: CIFInput = { ...input, hasReducedMotionSupport: false, animationCount: baseCount };
          const busy: CIFInput = { ...calm, animationCount: baseCount + extra };
          expect(computeCIFScore(busy).sensory.score).toBeLessThanOrEqual(
            computeCIFScore(calm).sensory.score,
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  test("missing inputs: an unmeasured component scores the one no-data value, says so, and is never a top issue", () => {
    const noData = param("cif.noData.score");
    fc.assert(
      fc.property(cifInputArb, (input) => {
        const result = computeCIFScore(input);
        const unmeasured: string[] = [];
        for (const cat of ["motor", "visual", "cognitive", "sensory", "navigation"] as const) {
          for (const [name, c] of Object.entries(result[cat].components)) {
            expect(typeof c.measured).toBe("boolean");
            if (c.measured) {
              expect(c.details.startsWith("Not measured")).toBe(false);
            } else {
              unmeasured.push(`${cat}.${name}`);
              expect(c.score).toBe(noData);
              expect(c.details.startsWith("Not measured: no ")).toBe(true);
            }
          }
        }
        expect(result.notMeasured).toEqual(unmeasured);
        for (const issue of result.topIssues) {
          expect(unmeasured).not.toContain(`${issue.category}.${issue.component}`);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
