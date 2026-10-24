/**
 * Scoring a page as a sequence of screens rather than one aggregate.
 *
 * The aggregate asks what the whole document would cost if it were all
 * processed. Almost nobody does that. This asks how far someone gets.
 *
 * THE TRAP THIS AVOIDS. Dividing a fixed total across k screens makes long
 * pages safer than short ones: a deficit of 0.607 split fourteen ways takes
 * cumulative abandonment from 22% to 2%, because the hazard is superlinear.
 * A genuinely sparse long page SHOULD be safer -- that is true, not an artifact
 * -- but a dense one must not become safe by being tall. So each screen is
 * measured on its own content, and the tests below use different content per
 * screen rather than a synthetic split.
 *
 * @since 2026-08-03
 */
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COGNITIVE_TRAITS, buildOTCognitiveProfile } from "../src/visual/cognitive-transport.js";
import { withLawSeconds } from "./fixtures/law-seconds.js";
import { computeDemandDistribution, computeSequentialCTC, computeSequentialScrollCTC } from "../src/visual/cognitive-transport-chain.js";

const traits = (over: Record<string, number> = {}) => ({
  ...Object.fromEntries((COGNITIVE_TRAITS as readonly string[]).map((t) => [t, 0.5])), ...over,
});
const screen = (density: number) => computeDemandDistribution(withLawSeconds({
  informationDensity: density, visualComplexity: density, interactiveElementCount: Math.round(density * 60),
  textDensity: density, animationLevel: density * 0.4, choiceCount: Math.round(density * 20),
  navigationDepth: 2,
} as never));
const run = (densities: number[], over: Record<string, number> = {}) =>
  computeSequentialScrollCTC(buildOTCognitiveProfile("p", traits(over)), densities.map(screen),
    { asymmetric: true, interactions: true });

describe("capacity actually carries forward", () => {
  test("a later screen is scored against what earlier screens left", () => {
    const r = run([0.7, 0.7, 0.7, 0.7]);
    const caps = r.screens.map((s) => {
      const v = Object.values(s.remainingCapacity);
      return v.reduce((a, b) => a + b, 0) / v.length;
    });
    for (let i = 1; i < caps.length; i++) expect(caps[i]).toBeLessThan(caps[i - 1]);
  });

  test("identical screens get progressively more expensive", () => {
    // The whole point of carrying the budget. Same content four times over must
    // not cost the same four times over.
    const r = run([0.7, 0.7, 0.7, 0.7]);
    expect(r.screens[3].screenCTC).toBeGreaterThan(r.screens[0].screenCTC);
  });

  test("the chain is resumable, and resuming differs from restarting", () => {
    const d = screen(0.7);
    const p = buildOTCognitiveProfile("p", traits());
    const first = computeSequentialCTC(p, d, { asymmetric: true, interactions: true });
    const resumed = computeSequentialCTC(p, d, { asymmetric: true, interactions: true, carriedCapacity: first.remainingCapacity });
    const restarted = computeSequentialCTC(p, d, { asymmetric: true, interactions: true });
    expect(resumed.totalCTC).toBeGreaterThan(restarted.totalCTC);
    expect(Object.keys(first.remainingCapacity).length).toBeGreaterThan(10);
  });
});

describe("length alone does not make a page safe", () => {
  test("a dense long page abandons more than its own first screen", () => {
    // The acceptance test stated as a comparison against itself, on real
    // per-screen densities rather than a divided total.
    const dense = run(Array(10).fill(0.8));
    const justTheTop = run([0.8]);
    expect(dense.totalAbandonment).toBeGreaterThan(justTheTop.totalAbandonment);
  });

  test("a dense long page abandons more than a sparse one of equal length", () => {
    const dense = run(Array(10).fill(0.8));
    const sparse = run(Array(10).fill(0.15));
    expect(dense.totalAbandonment).toBeGreaterThan(sparse.totalAbandonment);
  });

  test("but a genuinely sparse long page IS safer than a dense short one", () => {
    // Not an artifact. This should be true, and a test that forbade it would be
    // encoding the wrong intuition.
    const sparseLong = run(Array(12).fill(0.15));
    const denseShort = run([0.95, 0.95]);
    expect(sparseLong.totalAbandonment).toBeLessThan(denseShort.totalAbandonment);
  });

  test("adding screens never REDUCES cumulative abandonment", () => {
    // Monotone in extent: the same page plus more of it cannot become safer.
    const base = [0.6, 0.6, 0.6];
    let prev = -1;
    for (let k = 1; k <= base.length; k++) {
      const a = run(base.slice(0, k)).totalAbandonment;
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });
});

describe("the curve says something the scalar cannot", () => {
  test("reach falls monotonically and expected depth is bounded by it", () => {
    const r = run([0.8, 0.8, 0.8, 0.8, 0.8]);
    const reach = r.screens.map((s) => s.reachProbability);
    for (let i = 1; i < reach.length; i++) expect(reach[i]).toBeLessThanOrEqual(reach[i - 1]);
    expect(r.expectedDepthScreens).toBeGreaterThan(0);
    expect(r.expectedDepthScreens).toBeLessThanOrEqual(r.screens.length);
  });

  test("drop-off names a screen people actually reach, not the worst one", () => {
    // The discriminating case: an early screen that is merely bad, then a wall
    // near the bottom that almost nobody survives to. The wall has the higher
    // HAZARD; the early screen loses more SESSIONS. Ranking by hazard alone
    // would name the wall, which is useless advice -- fixing a screen 4% of
    // people reach changes nothing. (Early screens at 0.8 since 21.0 Stage C:
    // text features stopped driving cognitiveLoad, so at 0.75 the early screens
    // were too cheap to lose more sessions than the wall, and the case no longer
    // discriminated.)
    const r = run([0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.99]);
    const wall = r.screens[r.screens.length - 1];
    const named = r.screens.find((x) => x.screen === r.dropOff!.screen)!;
    expect(r.dropOff).not.toBeNull();
    expect(wall.stopHazard).toBeGreaterThan(named.stopHazard);      // the wall is worse
    expect(named.reachProbability).toBeGreaterThan(wall.reachProbability); // but reached far more
    expect(r.dropOff!.screen).toBeLessThan(wall.screen);
  });

  test("a page nobody struggles with has no drop-off at all", () => {
    const r = run([0.05, 0.05, 0.05]);
    expect(r.totalAbandonment).toBe(0);
    expect(r.dropOff).toBeNull();
  });

  test("an impatient persona abandons sooner than a patient one on the same page", () => {
    const page = Array(8).fill(0.7);
    const impatient = run(page, { patience: 0.1, resilience: 0.2 });
    const patient = run(page, { patience: 0.95, resilience: 0.9 });
    expect(impatient.totalAbandonment).toBeGreaterThan(patient.totalAbandonment);
    expect(impatient.expectedDepthScreens).toBeLessThan(patient.expectedDepthScreens);
  });
});

describe("per-screen counting does not re-charge what is already seen", () => {
  test("the extractor dedupes count-based demand and says why", () => {
    const src = readFileSync(join(import.meta.dir, "..", "src", "visual", "cognitive-transport.ts"), "utf8");
    const block = src.slice(src.indexOf("export async function extractPerScreenMetrics") - 1500,
      src.indexOf("export async function extractPerScreenMetrics"));
    expect(block).toContain("NEWLY-ENCOUNTERED COUNTING");
    // A sticky nav is one decision, not one per screen.
    expect(block).toContain("sticky nav");
    // Text is deliberately NOT deduped -- re-encountering text is re-reading it.
    expect(block).toContain("re-encountering text is re-reading it");
    expect(src).toContain("seen.has(id)");
  });

  test("the tool reports which question it answered", () => {
    const tool = readFileSync(join(import.meta.dir, "..", "src", "mcp-tools", "base", "persona-comparison-tools.ts"), "utf8");
    expect(tool).toContain("differsFrom");
    expect(tool).toContain("how far they get");
    // And that the hazard inherits an uncalibrated constant.
    expect(tool).toContain("ABANDONMENT_HILL_EXPONENT");
  });
});

describe("the output says which of its numbers to trust", () => {
  test("it warns that the cumulative total saturates on long pages", () => {
    // Measured on a 7-screen university homepage: elderly-user reached 100%.
    // That is the uncalibrated exponent compounding, not a finding about the
    // page, and shipping it without saying so would repeat the exact defect
    // this campaign spent a day removing.
    const tool = readFileSync(join(import.meta.dir, "..", "src", "mcp-tools", "base", "persona-comparison-tools.ts"), "utf8");
    expect(tool).toContain("TRUST THE SHAPE, NOT THE TOTAL");
    expect(tool).toContain("expectedDepthScreens");
    expect(tool).toContain("dropOff");
  });

  test("drop-off is persona-dependent BY DESIGN, and that is not noise", () => {
    // I first asserted drop-off was invariant across personas and this test
    // failed, correctly. On [0.75, 0.85, ...] a patient reader drops on the
    // hardest screen (2); an impatient one never gets there and drops on screen
    // 1. Both answers are right for their reader, and a model that gave the
    // same answer to both would be describing the page instead of the person --
    // which is the thing this whole tool exists not to do.
    const page = [0.75, 0.85, 0.5, 0.5, 0.5, 0.5];
    const patient = run(page, { patience: 0.9, resilience: 0.85 });
    const impatient = run(page, { patience: 0.15, resilience: 0.2 });
    expect(impatient.totalAbandonment).toBeGreaterThan(patient.totalAbandonment);
    expect(impatient.dropOff!.screen).toBeLessThanOrEqual(patient.dropOff!.screen);
    expect(patient.expectedDepthScreens).toBeGreaterThan(impatient.expectedDepthScreens);
  });

  test("the note does not claim invariance it does not have", () => {
    const tool = readFileSync(join(import.meta.dir, "..", "src", "mcp-tools", "base", "persona-comparison-tools.ts"), "utf8");
    expect(tool).toContain("persona-dependent by design");
    expect(tool).not.toContain("both are robust to the exponent");
  });
});
