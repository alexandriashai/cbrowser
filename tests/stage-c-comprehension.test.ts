/**
 * Stage C, decided 2026-10-23: `comprehension` is grasp of UI conventions, not
 * reading, so nothing reads it as reading ability (research/stage-c-design.md,
 * 10.12).
 *
 * - getReadingProfile no longer interpolates a reading profile on it. Through
 *   21.0 a persona with no name match and no stated reading fields got a
 *   profile interpolated toward the dyslexic one on comprehension, which is
 *   where 20 built-in personas' readability-audit profiles came from.
 * - intellectual-disability's reading share was computed from that profile. No
 *   adult reading rate was found, so the value is frozen as it was, a labelled
 *   hypothesis.
 * - cognitive_load_estimate drops its comprehension x informationDensity term.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { MODEL_PROVENANCE } from "../src/visual/model-provenance.js";
import { getReadingProfile, readingRateRatioOf, readability } from "../src/visual/cognitive-models.js";
import { buildOTCognitiveProfile, estimateCognitiveLoad } from "../src/visual/cognitive-transport.js";
import { ROSTER } from "./fixtures/ctc-golden-matrix.js";

/** The value personaRate.intellectual-disability.reading had before 21.0 froze it (270 / 338 ms per word). */
const ID_SHARE_BEFORE = 0.7988165680473372;

describe("intellectual-disability's reading share", () => {
  test("is numerically unchanged, frozen as a hypothesis that says why", () => {
    const e = MODEL_PROVENANCE["personaRate.intellectual-disability.reading"];
    expect(Object.is(e.value, ID_SHARE_BEFORE)).toBe(true);
    expect(e.status).toBe("hypothesis");
    expect(e.source).toContain("No adult reading rate found; the value is the pre-21.0 one");
  });
});

describe("comprehension no longer moves reading", () => {
  const withComprehension = (name: string, c: number) => {
    const p = ROSTER[name];
    return { name, traits: { ...p.cognitiveTraits, comprehension: c } as Record<string, number>, accessibilityTraits: p.accessibilityTraits as Record<string, number> | undefined };
  };
  const BLOCK = [{ text: "The quick brown fox jumps over the lazy dog. Notwithstanding extraordinarily complicated circumstances, everybody understood.", fontSize: 16, lineHeight: 1.5, fontFamily: "Arial", isSerif: false, contrastRatio: 7 }];

  test("for every built-in persona, varying comprehension leaves its reading profile, its rate share and its readability audit unchanged", () => {
    for (const name of Object.keys(ROSTER)) {
      const base = withComprehension(name, 0.5);
      for (const c of [0, 0.2, 0.9, 1]) {
        const other = withComprehension(name, c);
        expect({ name, c, profile: getReadingProfile(other) }).toEqual({ name, c, profile: getReadingProfile(base) });
        expect(readingRateRatioOf(getReadingProfile(other))).toBe(readingRateRatioOf(getReadingProfile(base)));
        expect(readability(BLOCK, other)).toEqual(readability(BLOCK, base));
      }
    }
  });

  test("property: a persona with no name match and no stated reading fields reads with the same profile at any comprehension", () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (a, b) => {
      const at = (c: number) => getReadingProfile({ name: "zz-custom", traits: { comprehension: c } });
      return JSON.stringify(at(a)) === JSON.stringify(at(b));
    }), { numRuns: 200 });
  });
});

describe("cognitive_load_estimate", () => {
  const page = { informationDensity: 0.8, visualComplexity: 0.5, interactiveElementCount: 30, textDensity: 0.6, animationLevel: 0.2, choiceCount: 12, navigationDepth: 3 };
  test("has no comprehension x informationDensity term: no information dimension, and comprehension moves nothing", () => {
    const traits = { ...ROSTER["first-timer"].cognitiveTraits } as Record<string, number>;
    const lo = estimateCognitiveLoad(buildOTCognitiveProfile("p", { ...traits, comprehension: 0 }), page);
    const hi = estimateCognitiveLoad(buildOTCognitiveProfile("p", { ...traits, comprehension: 1 }), page);
    expect(Object.keys(lo.breakdown)).not.toContain("information");
    expect(hi).toEqual(lo);
    const dense = estimateCognitiveLoad(buildOTCognitiveProfile("p", traits), { ...page, informationDensity: 0 });
    expect(dense).toEqual(estimateCognitiveLoad(buildOTCognitiveProfile("p", traits), page));
  });
});
