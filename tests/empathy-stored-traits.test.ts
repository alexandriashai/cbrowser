/**
 * empathy_audit scores a persona with the accessibility traits its record
 * stores, inferring only the fields the record leaves out (ISC-48.1).
 *
 * runEmpathyAudit wraps any persona that is not a built-in accessibility
 * persona, and the wrap REPLACED the record's accessibilityTraits with ones
 * inferred from name keywords and cognitive traits. A custom persona with
 * visionLevel 0.3 on record was audited at 1.0, and stored reading traits
 * (orthographicFluency and the rest) were dropped, while attention_analysis
 * drew the same persona through a filter synthesized from the record.
 *
 * The end-to-end half (a real audit sees the stored low vision) is in
 * tests/attention-traits-callers.test.ts; this file pins the merge rule and
 * shows which built-ins it can move: none, because no built-in persona on the
 * wrap path stores accessibility traits.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { wrappedPersonaAccessibility } from "../src/analysis/accessibility-empathy.js";
import { storedAccessibilityTraits } from "../src/visual/stored-accessibility-traits.js";
import { BUILTIN_PERSONAS, EMOTIONAL_PERSONAS, ACCESSIBILITY_PERSONAS } from "../src/personas.js";

const COGNITIVE = { patience: 0.5, curiosity: 0.5, readingTendency: 0.5, comprehension: 0.6 };
/** What the wrap infers for a name with no keyword and the cognitive traits above. */
const INFERRED_PLAIN = {
  motorControl: 1.0, tremor: false, reachability: 1.0, visionLevel: 1.0, contrastSensitivity: 1.0,
  processingSpeed: 0.6, attentionSpan: 0.5, fatigueSusceptibility: 0.3,
};

describe("stored accessibility traits win over inference", () => {
  test("every stored field is used as stored; the rest are inferred", () => {
    const stored = {
      visionLevel: 0.3, contrastSensitivity: 0.4, processingSpeed: 0.5, attentionSpan: 0.6,
      fatigueSusceptibility: 0.5, orthographicFluency: 0.4,
    };
    const w = wrappedPersonaAccessibility("zz-reader", { cognitiveTraits: COGNITIVE, accessibilityTraits: stored });
    expect(w.accessibilityTraits).toEqual({
      motorControl: 1.0, tremor: false, reachability: 1.0, // not stored: inferred
      ...stored,
    });
    expect(w.storedFields.sort()).toEqual(Object.keys(stored).sort());
  });

  test("a stored value beats a name hint", () => {
    // "low-vision" infers visionLevel 0.4 and fatigue 0.7; the record says 0.2.
    const w = wrappedPersonaAccessibility("zz-low-vision-reader", {
      cognitiveTraits: COGNITIVE, accessibilityTraits: { visionLevel: 0.2 },
    });
    expect(w.accessibilityTraits.visionLevel).toBe(0.2);
    expect(w.accessibilityTraits.contrastSensitivity).toBe(0.5); // hint, not stored
    expect(w.accessibilityTraits.fatigueSusceptibility).toBe(0.7); // hint, not stored
    expect(w.hints.vision).toBe(true);
  });

  test("a stored null is not a value: inference fills it", () => {
    const w = wrappedPersonaAccessibility("zz-reader", {
      cognitiveTraits: COGNITIVE, accessibilityTraits: { visionLevel: null, motorControl: 0.4 },
    });
    expect(w.accessibilityTraits.visionLevel).toBe(1.0);
    expect(w.accessibilityTraits.motorControl).toBe(0.4);
    expect(w.storedFields).toEqual(["motorControl"]);
  });
});

describe("without stored traits the wrap infers exactly as before", () => {
  test("no record traits, or an empty object, gives the inferred set", () => {
    for (const persona of [
      { cognitiveTraits: COGNITIVE },
      { cognitiveTraits: COGNITIVE, accessibilityTraits: {} },
    ]) {
      const w = wrappedPersonaAccessibility("zz-reader", persona);
      expect(w.accessibilityTraits).toEqual(INFERRED_PLAIN);
      expect(w.storedFields).toEqual([]);
    }
  });

  test("no built-in persona on the wrap path stores accessibility traits, so none of them moves", () => {
    // The wrap path is every persona that is not a built-in accessibility
    // persona. Those carry their own record and are not wrapped.
    const wrapPath = { ...BUILTIN_PERSONAS, ...EMOTIONAL_PERSONAS };
    expect(Object.keys(wrapPath).length).toBe(14);
    for (const [name, persona] of Object.entries(wrapPath)) {
      expect(Object.hasOwn(ACCESSIBILITY_PERSONAS, name)).toBe(false);
      expect(storedAccessibilityTraits(persona)).toBeUndefined();
      expect(wrappedPersonaAccessibility(name, persona).storedFields).toEqual([]);
    }
  });
});
