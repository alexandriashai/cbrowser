/**
 * Which persona a cognitive journey runs as (resolveJourneyPersona), and the
 * journey summary's confusion average and frustration peak
 * (journeyEmotionSummary).
 *
 * 2026-10-23: runCognitiveJourney asked only getPersona, which does not know
 * the 11 accessibility or 4 emotional personas, so a journey for
 * cognitive-adhd (what empathy_audit starts) ran on traits generated from the
 * name. And the summary's "average confusion" and "max frustration" were both
 * the final state. tests/journey-fixes-browser.test.ts runs whole journeys.
 */
import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { journeyEmotionSummary, resolveJourneyPersona } from "../src/cognitive/index.js";
import { ACCESSIBILITY_PERSONAS, AGENT_PERSONAS, BUILTIN_PERSONAS, EMOTIONAL_PERSONAS } from "../src/personas.js";

const AUTHORED = [...Object.values(ACCESSIBILITY_PERSONAS), ...Object.values(EMOTIONAL_PERSONAS)];

describe("resolveJourneyPersona", () => {
  test("every accessibility and emotional persona runs on its own traits", () => {
    expect(AUTHORED.length).toBe(15);
    for (const p of AUTHORED) {
      const resolved = resolveJourneyPersona(p.name);
      expect(resolved.name).toBe(p.name);
      expect(resolved.cognitiveTraits).toEqual(p.cognitiveTraits as never);
    }
  });

  test("a built-in persona is the built-in record, as before", () => {
    expect(resolveJourneyPersona("first-timer")).toBe(BUILTIN_PERSONAS["first-timer"]);
  });

  test("a name in other case and punctuation finds the persona", () => {
    expect(resolveJourneyPersona("Cognitive ADHD").cognitiveTraits).toEqual(ACCESSIBILITY_PERSONAS["cognitive-adhd"].cognitiveTraits as never);
  });

  test("custom traits override an accessibility persona's, and only those", () => {
    const base = ACCESSIBILITY_PERSONAS["dyslexic-user"].cognitiveTraits!;
    const t = resolveJourneyPersona("dyslexic-user", { patience: 0.05 }).cognitiveTraits;
    expect(t.patience).toBe(0.05);
    expect(t.workingMemory).toBe(base.workingMemory as number);
    expect(t.comprehension).toBe(base.comprehension as number);
  });

  test("a name nothing knows is still read as a description of the person", () => {
    const description = "retired teacher who distrusts online forms";
    const p = resolveJourneyPersona(description);
    expect(p.name).toBe(description);
    expect(Object.keys(p.cognitiveTraits).length).toBeGreaterThan(10);
  });

  test("an agent persona is refused", () => {
    const agent = Object.keys(AGENT_PERSONAS)[0];
    expect(() => resolveJourneyPersona(agent)).toThrow("AI agent persona");
  });
});

describe("journeyEmotionSummary", () => {
  test("averages confusion over the steps and takes the frustration peak", () => {
    const steps = [{ confusion: 0.1, frustration: 0.2 }, { confusion: 0.5, frustration: 0.7 }, { confusion: 0.3, frustration: 0.4 }];
    const s = journeyEmotionSummary(steps, { confusionLevel: 0.3, frustrationLevel: 0.4 });
    expect(s.avgConfusionLevel).toBeCloseTo(0.3, 12);
    expect(s.maxFrustrationLevel).toBe(0.7);
  });

  test("the final state counts toward the peak", () => {
    expect(journeyEmotionSummary([{ confusion: 0.2, frustration: 0.3 }], { confusionLevel: 0.2, frustrationLevel: 0.9 }).maxFrustrationLevel).toBe(0.9);
  });

  test("with no step logged, both are the final state's", () => {
    expect(journeyEmotionSummary([], { confusionLevel: 0.25, frustrationLevel: 0.6 })).toEqual({ avgConfusionLevel: 0.25, maxFrustrationLevel: 0.6 });
  });

  test("for any steps, the average lies between the lowest and highest confusion and the peak is at least every frustration", () => {
    const level = fc.double({ min: 0, max: 1, noNaN: true });
    const step = fc.record({ confusion: level, frustration: level });
    fc.assert(fc.property(fc.array(step, { minLength: 1, maxLength: 60 }), level, level, (steps, fc0, ff) => {
      const s = journeyEmotionSummary(steps, { confusionLevel: fc0, frustrationLevel: ff });
      const cs = steps.map((x) => x.confusion);
      expect(s.avgConfusionLevel).toBeGreaterThanOrEqual(Math.min(...cs) - 1e-12);
      expect(s.avgConfusionLevel).toBeLessThanOrEqual(Math.max(...cs) + 1e-12);
      for (const x of steps) expect(s.maxFrustrationLevel).toBeGreaterThanOrEqual(x.frustration);
      expect(s.maxFrustrationLevel).toBeGreaterThanOrEqual(ff);
      expect([ff, ...steps.map((x) => x.frustration)]).toContain(s.maxFrustrationLevel);
    }), { numRuns: 300 });
  });
});
