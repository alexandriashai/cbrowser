/**
 * `scope: "viewport"` must actually scope.
 *
 * `viewportOnly` existed on the barrier context and had exactly ONE consumer,
 * `detectSmallTouchTargets`. The other ten detectors scanned the whole document
 * regardless, so viewport scope filtered touch targets and nothing else.
 *
 * Measured on /docs/home at 1280x800: six `sensory` barriers at y=5638 — seven
 * screens below the fold, x up to 2029, 749px past the right edge. Counted in
 * `affectedElements: 12`, charged `missing_alt: -2.2`, folded into
 * `barrierOnlyScore: 54`. Each one was stamped `outsideScreenshot: true` in the
 * same response: the geometry was computed, published, and not acted on.
 *
 * The filter is central rather than per-detector, because eleven copies of a
 * rule is how it came to be applied in one place.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { filterBarriersToViewport } from "../src/analysis/accessibility-empathy.js";

const VP = { width: 1280, height: 800 };
const b = (rect?: { x: number; y: number; width: number; height: number }) => ({ rect });

describe("off-viewport barriers are dropped", () => {
  test("the real /docs/home case — six covers at y=5638", () => {
    const covers = [349, 685, 1021, 1357, 1693, 2029].map((x) =>
      b({ x, y: 5638, width: 318, height: 128 }));
    const { kept, dropped } = filterBarriersToViewport(covers, VP);
    expect(kept.length).toBe(0);
    expect(dropped).toBe(6);
  });

  test("horizontally off-screen is dropped too, not just vertically", () => {
    // x=2029 is 749px past a 1280 viewport. A y-only filter would keep it.
    const { kept } = filterBarriersToViewport([b({ x: 2029, y: 10, width: 318, height: 128 })], VP);
    expect(kept.length).toBe(0);
  });

  test("just below the fold is dropped", () => {
    const { kept } = filterBarriersToViewport([b({ x: 0, y: 800, width: 100, height: 50 })], VP);
    expect(kept.length).toBe(0);
  });
});

describe("visible barriers are kept", () => {
  test("fully inside", () => {
    const { kept, dropped } = filterBarriersToViewport([b({ x: 48, y: 105, width: 41, height: 30 })], VP);
    expect(kept.length).toBe(1);
    expect(dropped).toBe(0);
  });

  test("the bottom-left control cluster at y=740 stays", () => {
    // The real touch-target barrier from the same audit. It is genuinely in view.
    const { kept } = filterBarriersToViewport([b({ x: 136, y: 740, width: 40, height: 40 })], VP);
    expect(kept.length).toBe(1);
  });

  test("straddling the fold is kept — partly visible is visible", () => {
    const { kept } = filterBarriersToViewport([b({ x: 0, y: 780, width: 100, height: 100 })], VP);
    expect(kept.length).toBe(1);
  });

  test("straddling the top edge is kept", () => {
    const { kept } = filterBarriersToViewport([b({ x: 0, y: -20, width: 100, height: 60 })], VP);
    expect(kept.length).toBe(1);
  });
});

describe("page-level findings survive", () => {
  test("a barrier with NO rect is kept", () => {
    // Navigation item count, animation presence, reading level: properties of
    // the page, not of a location on it. Dropping the unlocatable would trade
    // this bug for its opposite — a viewport audit that reports no cognitive
    // load because cognitive load has no coordinates.
    const { kept, dropped } = filterBarriersToViewport([b(undefined)], VP);
    expect(kept.length).toBe(1);
    expect(dropped).toBe(0);
  });

  test("a mixed set keeps the page-level and the visible, drops the rest", () => {
    const mixed = [
      b(undefined),                                        // page-level
      b({ x: 48, y: 105, width: 41, height: 30 }),          // visible
      b({ x: 349, y: 5638, width: 318, height: 128 }),      // seven screens down
    ];
    const { kept, dropped } = filterBarriersToViewport(mixed, VP);
    expect(kept.length).toBe(2);
    expect(dropped).toBe(1);
  });
});

describe("degenerate geometry", () => {
  test("a zero-size rect at the origin is kept, not silently dropped", () => {
    // Zero-size is not an off-screen element: display:none resolves to
    // {0,0,0,0}, which is nowhere. This test's name always said "kept" while
    // its assertion said 0 ("width 0 cannot intersect"), so a viewport audit
    // dropped the hidden element a full_page audit scored, and counted it as
    // outside the viewport. Kept, like full_page; the rect coverage reports it
    // undrawn as zeroArea. (Round 2, 2026-10-09)
    const { kept, dropped } = filterBarriersToViewport([b({ x: 0, y: 0, width: 0, height: 0 })], VP);
    expect(kept.length).toBe(1);
    expect(dropped).toBe(0);
  });

  test("zero-area anywhere is kept: a collapsed element has no extent to be off-screen", () => {
    const { kept, dropped } = filterBarriersToViewport([
      b({ x: 40, y: 3000, width: 0, height: 0 }),
      b({ x: 40, y: 120, width: 200, height: 0 }),
    ], VP);
    expect(kept.length).toBe(2);
    expect(dropped).toBe(0);
  });

  test("an empty list is not an error", () => {
    const { kept, dropped } = filterBarriersToViewport([], VP);
    expect(kept).toEqual([]);
    expect(dropped).toBe(0);
  });
});
