/**
 * Persona capacities from rates (Stage B, phase 2b part 1).
 *
 * The capacity bridge (bridgeCapacityTraits) turns a persona into the
 * readingCapacity and motorCapacity the chain reads. These tests pin what the
 * bridge is given: the persona's accessibility traits reach the pointing
 * profile, so a stated tremor is not ignored because the name does not say
 * "tremor". The bridge runs unrecorded: the rates it reads describe the
 * persona and are not counted in any score's block, while an override still
 * reaches them. Capacities are rate ratios, c = r_p / (r_p + r_ref), with one
 * reference per channel: 4.9 bits/s for pointing, Brysbaert's 238 wpm for
 * reading, the fixation model contributing only a slowdown against its own
 * neurotypical profile. Every built-in persona carries a registered rate on
 * both channels (provenance/persona-rates.ts), with the values decided on
 * 2026-10-23, and the bridge and the motor audit read it.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import {
  bridgeCapacityTraits, getPointingProfile, getReadingProfile, motorCapacityOf, readingCapacityOf, readingRateRatioOf,
  registeredPersonaRate, KNOWN_POINTING_PROFILES, KNOWN_READING_PROFILES,
} from "../src/visual/cognitive-models.js";
import { MODEL_PROVENANCE, param } from "../src/visual/model-provenance.js";
import { PERSONA_RATE_PROVENANCE } from "../src/visual/provenance/persona-rates.js";
import { BUILTIN_PERSONAS, ACCESSIBILITY_PERSONAS, EMOTIONAL_PERSONAS } from "../src/personas.js";
import { startProvenanceRecording, stopProvenanceRecording, withParamOverrides } from "../src/visual/model-provenance.js";
import fc from "fast-check";

describe("the bridge passes accessibility traits to the pointing profile", () => {
  // A custom persona: steady by disposition, tremor stated, nothing in the name.
  const DISPOSITIONS = { proceduralFluency: 0.9, patience: 0.9 };

  test("a stated tremor moves a custom persona's motor capacity to the tremor profile's", () => {
    const flagged: Record<string, number> = { ...DISPOSITIONS };
    const plain: Record<string, number> = { ...DISPOSITIONS };
    bridgeCapacityTraits("steady-custom", flagged, { tremor: true } as never);
    bridgeCapacityTraits("steady-custom", plain, {});
    expect(flagged.motorCapacity).toBe(motorCapacityOf({ ...KNOWN_POINTING_PROFILES.tremor }));
    expect(flagged.motorCapacity).toBeLessThan(plain.motorCapacity);
  });

  test("the profile the bridge returns is the one getPointingProfile gives for the same traits", () => {
    const traits: Record<string, number> = { ...DISPOSITIONS };
    const returned = bridgeCapacityTraits("steady-custom", traits, { tremor: true } as never);
    expect(returned).toEqual(getPointingProfile({ name: "steady-custom", traits: DISPOSITIONS, accessibilityTraits: { tremor: true } }));
  });
});

describe("the bridge runs unrecorded", () => {
  test("a recording around it counts nothing, and an override still reaches it", () => {
    const traits: Record<string, number> = { proceduralFluency: 0.5, patience: 0.5 };
    startProvenanceRecording();
    bridgeCapacityTraits("steady-custom", traits, { tremor: true } as never);
    const read = stopProvenanceRecording();
    expect([...read]).toEqual([]);
    const moved: Record<string, number> = { proceduralFluency: 0.5, patience: 0.5 };
    withParamOverrides({ "law.rate.pointing.motionImpaired": 1.5 }, () => bridgeCapacityTraits("steady-custom", moved, { tremor: true } as never));
    expect(moved.motorCapacity).not.toBe(traits.motorCapacity);
  });
});

describe("capacities are rate ratios against one reference per channel", () => {
  const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-12);
  const neuroReading = () => ({ ...KNOWN_READING_PROFILES.neurotypical });

  test("the reference pointer and the reference reader sit at exactly 0.5", () => {
    expect(motorCapacityOf({ ...KNOWN_POINTING_PROFILES.neurotypical })).toBe(0.5);
    expect(readingCapacityOf(neuroReading())).toBe(0.5);
  });

  test("motor capacity is TP / (TP + 4.9); endpoint dispersion no longer enters", () => {
    close(motorCapacityOf({ sigmaX: 4, sigmaY: 4, rho: 0, throughput: 2.45 }), 2.45 / (2.45 + 4.9));
    expect(motorCapacityOf({ sigmaX: 40, sigmaY: 40, rho: 0.5, throughput: 3 })).toBe(motorCapacityOf({ sigmaX: 1, sigmaY: 1, rho: 0, throughput: 3 }));
    close(motorCapacityOf({ ...KNOWN_POINTING_PROFILES.tremor }), (1.77 / 4.88) / (1.77 / 4.88 + 1));
  });

  test("reading capacity is the fixation model's slowdown against its own neurotypical profile, anchored at the reference", () => {
    const dys = { ...KNOWN_READING_PROFILES.dyslexic };
    close(readingRateRatioOf(dys), 270 / 375);
    close(readingCapacityOf(dys), (270 / 375) / (270 / 375 + 1));
  });

  test("one reference: the reference rate cancels, and the model's absolute times never reach the capacity", () => {
    const dys = { ...KNOWN_READING_PROFILES.dyslexic };
    const base = readingCapacityOf(dys);
    // 238 wpm is the reference both sides are measured against, so moving it moves no capacity.
    close(withParamOverrides({ "law.reading.wpm": param("law.reading.wpm") * 1.3 }, () => readingCapacityOf(dys)), base);
    // A different base time changes the model's absolute wpm (222 at 270 ms) but
    // the neurotypical profile stays the reference reader.
    expect(withParamOverrides({ "profile.fixation.baseMs": 400 }, () => readingCapacityOf(neuroReading()))).toBe(0.5);
    expect(withParamOverrides({ "profile.fixation.baseMs": 400 }, () => readingCapacityOf(dys))).not.toBe(base);
  });

  test("a faster pointer and a more fluent decoder never get less capacity", () => {
    fc.assert(fc.property(fc.double({ min: 0.01, max: 20, noNaN: true }), fc.double({ min: 0.01, max: 20, noNaN: true }), (a, b) => {
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      const p = (throughput: number) => ({ sigmaX: 4, sigmaY: 4, rho: 0, throughput });
      return motorCapacityOf(p(lo)) <= motorCapacityOf(p(hi));
    }));
    fc.assert(fc.property(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), fc.integer({ min: 1, max: 12 }), (a, b, span) => {
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      const p = (phonological: number) => ({ orthographic: 0.8, phonological, visualSpan: span, vocabulary: 0.8, crowding: 0.2 });
      return readingCapacityOf(p(lo)) <= readingCapacityOf(p(hi));
    }));
  });
});

type Stored = { cognitiveTraits?: Record<string, number>; accessibilityTraits?: Record<string, number> };
const ROSTER = { ...BUILTIN_PERSONAS, ...ACCESSIBILITY_PERSONAS, ...EMOTIONAL_PERSONAS } as unknown as Record<string, Stored>;
const NAMES = Object.keys(ROSTER);
const share = (persona: string, channel: "pointing" | "reading") => MODEL_PROVENANCE[`personaRate.${persona}.${channel}`]!.value;
const c = (s: number) => s / (s + 1);

describe("every built-in persona carries its rate (provenance/persona-rates.ts)", () => {
  test("one entry per persona per channel, merged into MODEL_PROVENANCE, naming only built-in personas", () => {
    expect(NAMES.length).toBe(25);
    expect(PERSONA_RATE_PROVENANCE.length).toBe(50);
    const ids = new Set(PERSONA_RATE_PROVENANCE.map((e) => e.id));
    expect(ids.size).toBe(50);
    for (const n of NAMES) for (const ch of ["pointing", "reading"]) expect(ids.has(`personaRate.${n}.${ch}`)).toBe(true);
    for (const e of PERSONA_RATE_PROVENANCE) {
      expect(MODEL_PROVENANCE[e.id]).toBe(e);
      expect(Number.isFinite(e.value) && e.value > 0).toBe(true);
    }
  });

  test("published only where population and control were measured in the same study; hypotheses say what would set them", () => {
    expect(PERSONA_RATE_PROVENANCE.filter((e) => e.status !== "hypothesis").map((e) => `${e.id}:${e.status}`).sort())
      .toEqual(["personaRate.dyslexic-user.reading:published", "personaRate.motor-impairment-tremor.pointing:published"]);
    for (const e of PERSONA_RATE_PROVENANCE.filter((x) => x.status === "hypothesis")) expect(e.source).toMatch(/would (fit|set|test|place|replace)/);
  });

  test("the decided values", () => {
    expect(share("motor-impairment-tremor", "pointing")).toBe(1.77 / 4.88);
    expect(share("elderly-user", "pointing")).toBe(3.2 / 4.9);
    expect(share("elderly-low-vision", "pointing")).toBe(3.2 / 4.9);
    expect(share("cognitive-adhd", "pointing")).toBe(1);
    expect(share("dyslexic-user", "reading")).toBe(184.63 / 243.64);
    expect(share("low-vision-magnified", "reading")).toBe(130 / 238);
    expect(share("elderly-low-vision", "reading")).toBe(130 / 238);
  });

  test("mobile-user's pointing rate is what the interpolation gave it before the anchor moved", () => {
    const t = ROSTER["mobile-user"].cognitiveTraits!;
    const precision = t.proceduralFluency * 0.6 + t.patience * 0.4;
    expect(Math.abs(share("mobile-user", "pointing") * 4.9 - (4.9 + (2.1 - 4.9) * (1 - precision)))).toBeLessThan(1e-12);
  });

  test("the four kept reading rates are the fixation model's slowdown for the persona today", () => {
    for (const n of ["elderly-user", "cognitive-adhd", "intellectual-disability", "aphasia-receptive"]) {
      const p = getReadingProfile({ name: n, traits: ROSTER[n].cognitiveTraits, accessibilityTraits: ROSTER[n].accessibilityTraits });
      expect({ n, d: Math.abs(share(n, "reading") - readingRateRatioOf(p)) < 1e-12 }).toEqual({ n, d: true });
    }
  });

  test("everyone else is labelled no measured difference, at the reference", () => {
    const labelled = PERSONA_RATE_PROVENANCE.filter((e) => e.source.startsWith("No measured difference:"));
    expect(labelled.filter((e) => e.id.endsWith(".pointing")).length).toBe(20);
    expect(labelled.filter((e) => e.id.endsWith(".reading")).length).toBe(18);
    for (const e of labelled) expect(e.value).toBe(1);
  });

  test("the bridge gives each persona c = share / (share + 1) on both channels", () => {
    for (const n of NAMES) {
      const t: Record<string, number> = { ...(ROSTER[n].cognitiveTraits ?? {}) };
      bridgeCapacityTraits(n, t, ROSTER[n].accessibilityTraits);
      expect({ n, motor: Math.abs(t.motorCapacity - c(share(n, "pointing"))) < 1e-12, reading: Math.abs(t.readingCapacity - c(share(n, "reading"))) < 1e-12 })
        .toEqual({ n, motor: true, reading: true });
    }
  });

  test("the motor audit reads the same throughput the motor layer does", () => {
    for (const n of NAMES) {
      const tp = getPointingProfile({ name: n, traits: ROSTER[n].cognitiveTraits, accessibilityTraits: ROSTER[n].accessibilityTraits }).throughput;
      expect({ n, d: Math.abs(tp - share(n, "pointing") * param("law.rate.pointing.reference")) < 1e-12 }).toEqual({ n, d: true });
    }
  });

  test("every persona rate moves its persona's capacity when perturbed (no dead entries)", () => {
    const dead: string[] = [];
    for (const e of PERSONA_RATE_PROVENANCE) {
      const [, persona, channel] = e.id.split(".");
      const cap = () => {
        const t: Record<string, number> = { ...(ROSTER[persona].cognitiveTraits ?? {}) };
        bridgeCapacityTraits(persona, t, ROSTER[persona].accessibilityTraits);
        return channel === "pointing" ? t.motorCapacity : t.readingCapacity;
      };
      if (withParamOverrides({ [e.id]: e.value * 1.1 }, cap) === cap()) dead.push(e.id);
    }
    expect(dead).toEqual([]);
  });

  test("a custom persona has no entry and still takes its rates from the profiles, off the measured tremor anchor", () => {
    expect(registeredPersonaRate("custom-anyone", "pointing")).toBeUndefined();
    const traits = { proceduralFluency: 0.5, patience: 0.5 };
    const tp = getPointingProfile({ name: "custom-anyone", traits }).throughput;
    const ref = param("law.rate.pointing.reference");
    expect(Math.abs(tp - (ref + (KNOWN_POINTING_PROFILES.tremor.throughput - ref) * 0.5))).toBeLessThan(1e-12);
  });
});
