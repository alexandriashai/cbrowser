/**
 * Persona capacities from rates (Stage B, phase 2b part 1).
 *
 * The capacity bridge (bridgeCapacityTraits) turns a persona into the
 * readingCapacity and motorCapacity the chain reads. These tests pin what the
 * bridge is given: the persona's accessibility traits reach the pointing
 * profile, so a stated tremor is not ignored because the name does not say
 * "tremor". Persona-model reads (the bridge, the motor and readability
 * audits) never land in a score's recording, while an override still reaches
 * them, and collectPersonaReads returns the scored persona's rate ids. Capacities are rate ratios, c = r_p / (r_p + r_ref), with one
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
  registeredPersonaRate, motorAccessibility, readability, personaRateContext, computeReadingDifficulty, KNOWN_POINTING_PROFILES, KNOWN_READING_PROFILES,
} from "../src/visual/cognitive-models.js";
import { MODEL_PROVENANCE, param } from "../src/visual/model-provenance.js";
import { PERSONA_RATE_PROVENANCE, CUSTOM_RATE_PROVENANCE } from "../src/visual/provenance/persona-rates.js";
import { BUILTIN_PERSONAS, ACCESSIBILITY_PERSONAS, EMOTIONAL_PERSONAS, generatePersonaFromDescription } from "../src/personas.js";
import { collectPersonaReads, personaRateProvenance, startProvenanceRecording, stopProvenanceRecording, withParamOverrides, withProvenance } from "../src/visual/model-provenance.js";
import { buildOTCognitiveProfile } from "../src/visual/cognitive-transport.js";
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

describe("persona-model reads never land in a score recording (personaScope)", () => {
  test("the bridge in a scoped recording counts nothing, the process session still sees it, and an override still reaches it", () => {
    const traits: Record<string, number> = { proceduralFluency: 0.5, patience: 0.5 };
    const { provenance } = withProvenance(() => bridgeCapacityTraits("steady-custom", traits, { tremor: true } as never));
    expect(provenance.counts).toEqual({ fitted: 0, published: 0, definition: 0, hypothesis: 0 });
    // Coverage tests count every read the process makes, as with isolatedProvenanceAsync.
    startProvenanceRecording();
    bridgeCapacityTraits("steady-custom", { proceduralFluency: 0.5, patience: 0.5 }, { tremor: true } as never);
    const session = stopProvenanceRecording();
    expect(session.has("customRate.tremor.pointing")).toBe(true);
    const moved: Record<string, number> = { proceduralFluency: 0.5, patience: 0.5 };
    withParamOverrides({ "customRate.tremor.pointing": 0.2 }, () => bridgeCapacityTraits("steady-custom", moved, { tremor: true } as never));
    expect(moved.motorCapacity).not.toBe(traits.motorCapacity);
  });

  test("the motor and readability audits a tool runs beside its score count nothing in the score's recording", () => {
    const profile = buildOTCognitiveProfile("first-timer", { ...(ROSTER["first-timer"].cognitiveTraits ?? {}) });
    const { provenance } = withProvenance(() => {
      motorAccessibility([{ selector: "a", width: 20, height: 20, distance: 300 }], profile);
      readability([{ text: "a cat sat on the mat", fontSize: 14, lineHeight: 1.4, fontFamily: "serif", isSerif: true, contrastRatio: 3 }], { name: "dyslexic-user" });
    });
    expect(provenance.counts).toEqual({ fitted: 0, published: 0, definition: 0, hypothesis: 0 });
  });

  test("collectPersonaReads returns the scored persona's rate ids, the same on every call", () => {
    const ids = (name: string) => {
      const t: Record<string, number> = { ...(ROSTER[name].cognitiveTraits ?? {}) };
      return [...collectPersonaReads(() => bridgeCapacityTraits(name, t, ROSTER[name].accessibilityTraits)).ids].sort();
    };
    const first = ids("dyslexic-user");
    expect(first).toContain("personaRate.dyslexic-user.reading");
    expect(first).toContain("personaRate.dyslexic-user.pointing");
    expect(first.filter((id) => id.startsWith("personaRate.") && !id.startsWith("personaRate.dyslexic-user."))).toEqual([]);
    expect(ids("dyslexic-user")).toEqual(first);
  });

  test("personaRateProvenance counts the persona's rates, names them, and leaves out the reference rates", () => {
    const t: Record<string, number> = { ...(ROSTER["dyslexic-user"].cognitiveTraits ?? {}) };
    const { ids } = collectPersonaReads(() => bridgeCapacityTraits("dyslexic-user", t, ROSTER["dyslexic-user"].accessibilityTraits));
    expect(ids.has("law.reading.wpm")).toBe(true);
    const block = personaRateProvenance(ids);
    expect(block.rates).toEqual(["personaRate.dyslexic-user.pointing", "personaRate.dyslexic-user.reading"]);
    expect(block.counts).toEqual({ fitted: 0, published: 1, definition: 0, hypothesis: 1 });
    expect(block.hypotheses).toEqual(["personaRate.dyslexic-user.pointing"]);
    expect(block.scope).toContain("cancel in the ratio");
    expect(block.scope).toContain("reference population totalCTC is ranked against (a definition)");
    // A custom persona with a stated reading profile: its rule and the fixation-model constants.
    const custom = personaRateProvenance(collectPersonaReads(() => bridgeCapacityTraits("my-reader", { patience: 0.5 }, { phonologicalDecoding: 0.4, tremor: true })).ids);
    expect(custom.rates).toContain("customRate.tremor.pointing");
    expect(custom.rates).toContain("profile.fixation.baseMs");
    expect(custom.counts.published).toBe(1);
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
      // 1e-12: adjacent doubles can invert by an ulp (found: 19.99999999999995 vs ...954).
      return motorCapacityOf(p(lo)) <= motorCapacityOf(p(hi)) + 1e-12;
    }));
    fc.assert(fc.property(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), fc.integer({ min: 1, max: 12 }), (a, b, span) => {
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      const p = (phonological: number) => ({ orthographic: 0.8, phonological, visualSpan: span, vocabulary: 0.8, crowding: 0.2 });
      return readingCapacityOf(p(lo)) <= readingCapacityOf(p(hi)) + 1e-12;
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

  test("a custom persona has no entry and no longer interpolates a throughput from its dispositions", () => {
    expect(registeredPersonaRate("custom-anyone", "pointing")).toBeUndefined();
    for (const d of [0, 0.5, 1]) {
      const tp = getPointingProfile({ name: "custom-anyone", traits: { proceduralFluency: d, patience: d } }).throughput;
      expect(tp).toBe(param("law.rate.pointing.reference"));
    }
  });
});

describe("custom personas take the built-ins' rule (customRate.*)", () => {
  const rate = (id: string) => MODEL_PROVENANCE[id]!.value;
  const bridged = (name: string, a11y: Record<string, number | boolean> = {}, context: { description?: string; ageRange?: string } = {}, traits: Record<string, number> = { proceduralFluency: 0.2, patience: 0.2 }) => {
    const t: Record<string, number> = { ...traits };
    bridgeCapacityTraits(name, t, a11y, context);
    return { motor: t.motorCapacity, reading: t.readingCapacity };
  };
  const cOf = (share: number) => share / (share + 1);

  test("six rule entries; published where the population and control share a study", () => {
    expect(CUSTOM_RATE_PROVENANCE.map((e) => `${e.id}:${e.status}`)).toEqual([
      "customRate.tremor.pointing:published", "customRate.elderly.pointing:hypothesis", "customRate.noMeasuredDifference.pointing:hypothesis",
      "customRate.dyslexia.reading:published", "customRate.lowVision.reading:hypothesis", "customRate.noMeasuredDifference.reading:hypothesis",
    ]);
    for (const e of CUSTOM_RATE_PROVENANCE) expect(MODEL_PROVENANCE[e.id]).toBe(e);
    expect(rate("customRate.tremor.pointing")).toBe(1.77 / 4.88);
    expect(rate("customRate.dyslexia.reading")).toBe(184.63 / 243.64);
    expect(rate("customRate.lowVision.reading")).toBe(130 / 238);
    expect(rate("customRate.elderly.pointing")).toBe(3.2 / 4.9);
  });

  test("pointing: a tremor flag or cue takes the measured ratio, an elderly cue the elderly profile, anything else the reference", () => {
    expect(bridged("my-user", { tremor: true }).motor).toBeCloseTo(cOf(1.77 / 4.88), 12);
    expect(bridged("my-user", {}, { description: "Has essential tremor" }).motor).toBeCloseTo(cOf(1.77 / 4.88), 12);
    expect(bridged("grandad", {}, { ageRange: "65+" }).motor).toBeCloseTo(cOf(3.2 / 4.9), 12);
    expect(bridged("my-user", {}, { description: "A senior shopper" }).motor).toBeCloseTo(cOf(3.2 / 4.9), 12);
    expect(bridged("my-user", {}, { ageRange: "45-75" }).motor).toBe(0.5);
    expect(bridged("my-user", { tremor: false }).motor).toBe(0.5);
    expect(bridged("custom-adhd-person").motor).toBe(0.5);
  });

  test("reading: stated profile values are honoured through the fixation model, then dyslexia and low-vision cues, else the reference", () => {
    const stated = { phonologicalDecoding: 0.35, visualSpan: 4 };
    const viaModel = readingRateRatioOf(getReadingProfile({ name: "my-reader", accessibilityTraits: stated }));
    expect(bridged("my-reader", stated, { description: "dyslexic" }).reading).toBeCloseTo(cOf(viaModel), 12);
    expect(bridged("my-reader", {}, { description: "An adult with dyslexia" }).reading).toBeCloseTo(cOf(184.63 / 243.64), 12);
    expect(bridged("lv-reader", {}, { description: "uses screen magnification" }).reading).toBeCloseTo(cOf(130 / 238), 12);
    // A blind reader does not read print: no low-vision rate.
    expect(bridged("blind-reader", {}, { description: "blind, uses a screen reader" }).reading).toBe(0.5);
    expect(bridged("my-reader").reading).toBe(0.5);
  });

  test("dispositions no longer set a custom persona's rates", () => {
    expect(bridged("my-user", {}, {}, { proceduralFluency: 0, patience: 0, textProcessing: 0, comprehension: 0 })).toEqual({ motor: 0.5, reading: 0.5 });
  });

  test("personaRateContext reads a stored persona's description and age range", () => {
    expect(personaRateContext({ description: "x", demographics: { age_range: "65+" } })).toEqual({ description: "x", ageRange: "65+" });
    expect(personaRateContext({ description: 3 })).toEqual({ description: undefined, ageRange: undefined });
  });
});

describe("every reading rate a customer sees is 238 wpm x the persona's share", () => {
  const wpm = (share: number) => Math.round(param("law.reading.wpm") * share);
  type Timed = { humanBehavior?: { timing?: { readingSpeed?: number } } };

  test("each built-in persona's humanBehavior.timing.readingSpeed is 238 x its registered reading share", () => {
    const shown = Object.fromEntries(NAMES.map((n) => [n, (ROSTER[n] as unknown as Timed).humanBehavior?.timing?.readingSpeed]));
    for (const n of NAMES) expect({ n, wpm: shown[n] }).toEqual({ n, wpm: wpm(share(n, "reading")) });
    // The unsourced 400 (power-user) is now the reference, no measured difference; dyslexic-user is Callens' ratio.
    expect([shown["power-user"], shown["dyslexic-user"], shown["low-vision-magnified"], shown["elderly-user"]]).toEqual([238, 180, 130, 203]);
  });

  test("a persona generated from a description reads at 238 x the custom-persona rule's share", () => {
    const speed = (d: string) => generatePersonaFromDescription("my-persona", d).humanBehavior.timing.readingSpeed;
    expect(speed("an impatient expert in a rush")).toBe(238);
    expect(speed("an elderly retiree")).toBe(238);
    expect(speed("an adult with dyslexia")).toBe(wpm(184.63 / 243.64));
    expect(speed("uses screen magnification")).toBe(130);
  });

  test("the readability audit's words per minute: 238 for a neurotypical reader on neutral text, slower with every penalty", () => {
    const NEUTRAL = { text: "a cat sat on the mat", fontSize: 16, lineHeight: 1.5, fontFamily: "sans-serif", isSerif: false, contrastRatio: 21 };
    expect(computeReadingDifficulty(NEUTRAL.text, { ...KNOWN_READING_PROFILES.neurotypical }, NEUTRAL).wordsPerMinute).toBe(238);
    expect(computeReadingDifficulty(NEUTRAL.text, { ...KNOWN_READING_PROFILES.dyslexic }, NEUTRAL).wordsPerMinute).toBe(Math.round(238 * 270 / 375));
    const small = computeReadingDifficulty(NEUTRAL.text, { ...KNOWN_READING_PROFILES.dyslexic }, { ...NEUTRAL, fontSize: 12, isSerif: true, contrastRatio: 3 });
    expect(small.wordsPerMinute).toBeLessThan(Math.round(238 * 270 / 375));
  });
});
