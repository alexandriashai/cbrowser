/**
 * A persona's age comes only from what its author stated (src/persona-age.ts).
 *
 * 21.0.0 read "senior", "older", "retired" and the substring "aging" as old
 * age, ignored a stated age, and then capped 14 traits for anyone it guessed
 * was 65+. Measured on 21.0.0: "A senior software engineer", "a 30-year-old
 * nurse using an older Android phone" and "a 52-year-old who retired early"
 * all came out 65+ with working memory 0.35 and mental-model flexibility 0.2.
 */
import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { readPersonaAge, isOlderAdult } from "../src/persona-age.js";
import { generatePersonaFromDescription, createCognitivePersona } from "../src/personas.js";
import { customPointingRule, customReadingRule } from "../src/visual/provenance/persona-rates.js";
import { MODEL_PROVENANCE } from "../src/visual/model-provenance.js";
import { ageValue } from "../src/visual/provenance/age.js";

const older = (description: string, ageRange?: string) => isOlderAdult({ description, ageRange });
const traits = (description: string) => generatePersonaFromDescription("age-test", description).cognitiveTraits!;

describe("words that state no age", () => {
  test.each([
    "A senior software engineer who ships code daily",
    "A senior shopper looking for deals",
    "A 30-year-old nurse using an older Android phone",
    "A 52-year-old who retired early from the army",
    "A product manager managing a team of five",
    "Writes engaging content for a packaging company",
    "Retired",
  ])("%s is not an older adult", (d) => {
    expect(older(d)).toBe(false);
    expect(customPointingRule({ description: d })).not.toBe("elderly");
    expect(customReadingRule({ description: d })).not.toBe("elderly");
    expect(generatePersonaFromDescription("age-test", d).demographics.age_range).not.toBe("65+");
  });
});

describe("statements of age", () => {
  test.each([
    ["A 70-year-old learning to shop online", undefined],
    ["a 68 year old retiree", undefined],
    ["aged 81, lives alone", undefined],
    ["a grandmother in her 70s", undefined],
    ["An elderly user who reads every word", undefined],
    ["Older adults new to tablets", undefined],
    ["A senior citizen paying bills", undefined],
    ["A pensioner on a fixed income", undefined],
    ["Users 65+ in rural areas", undefined],
    ["anyone", "65-74"],
    ["anyone", "65+"],
  ])("%s / ageRange %s is an older adult", (d, range) => {
    expect(older(d, range)).toBe(true);
    expect(customPointingRule({ description: d, ageRange: range })).toBe("elderly");
  });

  test("a stated age shows in demographics.age_range", () => {
    expect(generatePersonaFromDescription("age-test", "A 30-year-old nurse").demographics.age_range).toBe("30");
    expect(generatePersonaFromDescription("age-test", "A 72-year-old retiree").demographics.age_range).toBe("72");
    expect(generatePersonaFromDescription("age-test", "Someone who shops online").demographics.age_range).toBe("25-45");
  });

  const CUES = ["elderly", "older adult", "senior citizen", "pensioner", "senior", "retired", "older"];

  test("a stated age under 65 is never an older adult, whatever words follow", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 64 }), fc.subarray(CUES), (age, cues) =>
      older(`A ${age}-year-old ${cues.join(" ")} person caring for an elderly parent`) === false), { numRuns: 1000 });
  });

  test("a stated age of 65 to 110 is an older adult, with or without other words", () => {
    fc.assert(fc.property(fc.integer({ min: 65, max: 110 }), fc.subarray(CUES), (age, cues) =>
      older(`A ${age}-year-old ${cues.join(" ")} user`) === true), { numRuns: 1000 });
  });

  test("with two stated ages, the first one is the persona's", () => {
    expect(readPersonaAge({ description: "An 80-year-old with a 2-year-old grandchild" }).low).toBe(80);
    expect(readPersonaAge({ description: "A 70-year-old on a 5-year-old phone" }).low).toBe(70);
    // A known limit: an object's age stated first is read as the persona's.
    expect(readPersonaAge({ description: "Uses a 5-year-old laptop; she is 70 years old" }).low).toBe(5);
  });

  test("an author's ageRange wins over the description", () => {
    expect(older("An elderly user", "30")).toBe(false);
    expect(older("A senior engineer", "70")).toBe(true);
  });
});

describe("what older age changes", () => {
  test("Anti: the 65+ persona differs from the same person at 30 in working memory only", () => {
    const at = (age: number) => traits(`A ${age}-year-old who shops online`);
    const young = at(30), old = at(70);
    const changed = Object.keys(young).filter((k) => (young as Record<string, unknown>)[k] !== (old as Record<string, unknown>)[k]);
    expect(changed).toEqual(["workingMemory"]);
    expect(old.workingMemory).toBe(MODEL_PROVENANCE["age.olderAdult.workingMemory"].value);
  });

  test("the working-memory default and the threshold are registered, and the code reads their registry values", () => {
    expect(MODEL_PROVENANCE["age.olderAdult.workingMemory"].status).toBe("hypothesis");
    expect(MODEL_PROVENANCE["age.olderAdult.workingMemory"].source).toContain("12061414");
    expect(MODEL_PROVENANCE["age.olderAdult.threshold"]).toMatchObject({ value: 65, status: "definition" });
    expect(ageValue("age.olderAdult.workingMemory")).toBe(MODEL_PROVENANCE["age.olderAdult.workingMemory"].value);
    expect(ageValue("age.olderAdult.threshold")).toBe(65);
  });

  test("an author-stated trait overrides the age default", () => {
    const p = createCognitivePersona("age-test", "A 70-year-old who shops online", { workingMemory: 0.8 });
    expect(p.cognitiveTraits!.workingMemory).toBe(0.8);
  });

  test("createCognitivePersona's ageRange option reaches the generated traits", () => {
    const p = createCognitivePersona("age-test", "Someone who shops online", {}, { ageRange: "70-79" });
    expect(p.cognitiveTraits!.workingMemory).toBe(MODEL_PROVENANCE["age.olderAdult.workingMemory"].value);
    expect(p.demographics.age_range).toBe("70-79");
  });

  test("'senior' and 'elderly' no longer make a persona a beginner or slow", () => {
    const eng = generatePersonaFromDescription("age-test", "A senior software engineer");
    expect(eng.demographics.tech_level).toBe("expert");
    const shopper = generatePersonaFromDescription("age-test", "A senior shopper");
    expect(shopper.demographics.tech_level).toBe("intermediate");
    const plain = generatePersonaFromDescription("age-test", "A shopper");
    expect(shopper.humanBehavior.timing).toEqual(plain.humanBehavior.timing);
  });

  test("readPersonaAge reports where the age came from", () => {
    expect(readPersonaAge({ description: "A 30-year-old" }).source).toBe("stated");
    expect(readPersonaAge({ description: "An elderly user" }).source).toBe("phrase");
    expect(readPersonaAge({ description: "x", ageRange: "65+" }).source).toBe("ageRange");
    expect(readPersonaAge({ description: "A shopper" })).toEqual({ low: null, label: "25-45", source: "none" });
  });
});
