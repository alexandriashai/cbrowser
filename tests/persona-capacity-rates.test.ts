/**
 * Persona capacities from rates (Stage B, phase 2b part 1).
 *
 * The capacity bridge (bridgeCapacityTraits) turns a persona into the
 * readingCapacity and motorCapacity the chain reads. These tests pin what the
 * bridge is given: the persona's accessibility traits reach the pointing
 * profile, so a stated tremor is not ignored because the name does not say
 * "tremor".
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { bridgeCapacityTraits, getPointingProfile, motorCapacityOf, KNOWN_POINTING_PROFILES } from "../src/visual/cognitive-models.js";

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
