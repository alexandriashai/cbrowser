/**
 * The ideal profiles' totalCTC caps are registered hypotheses on the percentile.
 *
 * IDEAL_PROFILES[].thresholds.maxCTC (0.5 to 0.8) were set when totalCTC was a
 * logistic of rawCTC. They keep their values, and their meaning changed:
 * totalCTC is now a percentile of the reference, so a cap of 0.6 means "no
 * costlier than 60% of the real (page, persona) pairs", where it used to sit
 * at rawCTC 1.36, about the 93rd percentile of real first screens.
 *
 * Read through param() (idealProfiles.maxCTC.<persona>, provenance/
 * ctc-reference.ts), so the profile and the registry cannot disagree, and the
 * gap score's totalCTC check and fix text use the registered cap.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { IDEAL_PROFILES, getIdealProfile } from "../src/ideal-profiles.js";
import { computeFitnessScore } from "../src/ideal-profiles-gap.js";
import { MODEL_PROVENANCE, readsOf, withParamOverrides } from "../src/visual/model-provenance.js";

const VALUES: Record<string, number> = {
  "cognitive-adhd": 0.6,
  "autism-spectrum": 0.7,
  "motor-impairment-tremor": 0.8,
  "first-timer": 0.8,
  "impatient-user": 0.5,
  "elderly-user": 0.7,
  "low-vision-magnified": 0.8,
  "dyslexic-user": 0.7,
};

const STRUCTURE = {
  navItemCount: 3, ctaCount: 1, maxContentBlockWords: 20, hasVisibleLabels: true,
  animationCount: 0, hasColorRedundancy: true, minTouchTargetSize: 48, informationDensity: 0.1,
};

describe("ideal-profile totalCTC caps", () => {
  test("keep their values, one registered hypothesis per profile and no orphan entries", () => {
    expect(Object.fromEntries(IDEAL_PROFILES.map((p) => [p.persona, p.thresholds.maxCTC]))).toEqual(VALUES);
    const registered = Object.keys(MODEL_PROVENANCE).filter((id) => id.startsWith("idealProfiles.maxCTC.")).sort();
    expect(registered).toEqual(IDEAL_PROFILES.map((p) => `idealProfiles.maxCTC.${p.persona}`).sort());
    for (const p of IDEAL_PROFILES) {
      const e = MODEL_PROVENANCE[`idealProfiles.maxCTC.${p.persona}`];
      expect(e.value).toBe(VALUES[p.persona]);
      expect(e.status).toBe("hypothesis");
      // Says what the number now means, that it changed, and what would test it.
      expect(e.source).toMatch(/percentile/);
      expect(e.source).toMatch(/meaning changed/);
      expect(e.source).toMatch(/would test/);
    }
  });

  test("are read through the registry, so an override moves the profile", () => {
    const p = getIdealProfile("cognitive-adhd")!;
    const { result, ids } = readsOf(() => p.thresholds.maxCTC);
    expect(result).toBe(0.6);
    expect([...ids]).toEqual(["idealProfiles.maxCTC.cognitive-adhd"]);
    withParamOverrides({ "idealProfiles.maxCTC.cognitive-adhd": 0.3 }, () => {
      expect(p.thresholds.maxCTC).toBe(0.3);
    });
    expect(p.thresholds.maxCTC).toBe(0.6);
  });

  test("the gap score checks totalCTC against the registered cap, and its fix text speaks of rank", () => {
    const p = getIdealProfile("impatient-user")!;
    const score = (totalCTC: number) =>
      computeFitnessScore(p, null, {}, STRUCTURE, { totalCTC, abandonmentRisk: 0, decisionComplexity: 0, readabilityCost: 0 });
    expect(score(0.5).cognitiveFit.overThreshold.map((o) => o.metric)).not.toContain("totalCTC");
    const over = score(0.62).cognitiveFit.overThreshold.find((o) => o.metric === "totalCTC")!;
    expect(over.max).toBe(0.5);
    expect(over.fix).toMatch(/percentile/);
    expect(over.fix).toContain("62nd");
    expect(over.fix).toContain("50th");
    expect(over.fix).not.toMatch(/transaction/);
    // The registry decides the cap.
    withParamOverrides({ "idealProfiles.maxCTC.impatient-user": 0.7 }, () => {
      expect(score(0.62).cognitiveFit.overThreshold.map((o) => o.metric)).not.toContain("totalCTC");
    });
  });

  test("survive a JSON round trip as plain numbers", () => {
    const p = JSON.parse(JSON.stringify(getIdealProfile("elderly-user")));
    expect(p.thresholds.maxCTC).toBe(0.7);
  });
});
