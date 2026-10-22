/**
 * How a persona name becomes a perceptual profile, and whether the caller can
 * tell.
 *
 * Two defects:
 *
 * 1. The name fallback tested "blind" for low vision before it tested
 *    "color" + "blind", so every colour-blind custom persona got the
 *    elderly-low-vision clone (blur 1.5, contrast threshold 5) and the
 *    deuteranopia branch was unreachable for any name spelled that way. And
 *    "dyslexic" mapped to cognitive-adhd although a dyslexic-user built-in
 *    exists; "dyslexia" matched nothing at all.
 *
 * 2. A persona nobody has heard of got DEFAULT_PROFILE and an ordinary map,
 *    indistinguishable from a real one. It must not throw (custom personas rely
 *    on the inference), so the analysis now says how the profile was found.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { describe, expect, test } from "bun:test";
import * as perceptual from "../src/visual/perceptual-transport.js";
import { analyzeAttentionFromDOM } from "../src/visual/attention-transport.js";

const { getPerceptualProfile } = perceptual;

/** Everything but the `persona` label, which an inferred clone renames. */
function shape(name: string) {
  const { persona: _label, ...rest } = getPerceptualProfile(name);
  return rest;
}

describe("name inference picks the specific built-in before the general one", () => {
  // [custom name, built-in it should borrow, or "default"]
  const CASES: Array<[string, string]> = [
    // Fixed: colour blindness before the generic "blind" vision branch.
    ["my-color-blind-tester", "color-blind-deuteranopia"],
    ["colour-blind-shopper", "color-blind-deuteranopia"],
    ["colorblind-dev", "color-blind-deuteranopia"],
    ["deuteranope-reviewer", "color-blind-deuteranopia"],
    ["protanopia-user", "color-blind-deuteranopia"],
    ["tritanope", "color-blind-deuteranopia"],
    // Fixed: dyslexia has its own built-in.
    ["dyslexic-student", "dyslexic-user"],
    ["dyslexia-reader", "dyslexic-user"],
    // Unchanged mappings.
    ["blind-user", "elderly-low-vision"],
    ["low-vision-grandpa", "elderly-low-vision"],
    ["magnifier-user", "elderly-low-vision"],
    ["elderly-shopper", "elderly-low-vision"],
    ["parkinsons-patient", "motor-impairment-tremor"],
    ["essential-tremor", "motor-impairment-tremor"],
    ["motor-limited", "motor-impairment-tremor"],
    ["adhd-teen", "cognitive-adhd"],
    ["cognitive-load-tester", "cognitive-adhd"],
    ["nvda-user", "screen-reader-user"],
    ["jaws-power", "screen-reader-user"],
    ["voiceover-fan", "screen-reader-user"],
    ["screenreader-person", "screen-reader-user"],
    ["hard-of-hearing", "deaf-user"],
    ["deaf-tester", "deaf-user"],
    ["random-shopper", "default"],
  ];

  for (const [name, expected] of CASES) {
    test(`${name} -> ${expected}`, () => {
      expect(shape(name)).toEqual(shape(expected));
      if (expected !== "default") expect(getPerceptualProfile(name).persona).toBe(name);
    });
  }
});

describe("resolvePerceptualProfile names the route it took", () => {
  const resolve = (perceptual as unknown as {
    resolvePerceptualProfile: (name: string, traits?: Record<string, number>) =>
      { profile: { persona: string }; resolution: string; resolvedProfile: string };
  }).resolvePerceptualProfile;

  test("builtin", () => {
    const r = resolve("dyslexic-user");
    expect(r.resolution).toBe("builtin");
    expect(r.resolvedProfile).toBe("dyslexic-user");
  });

  test("synthesized, from accessibility traits", () => {
    const r = resolve("account-persona-x", { visionLevel: 0.3 });
    expect(r.resolution).toBe("synthesized");
    expect(r.resolvedProfile).toBe("account-persona-x");
    expect(r.profile.persona).toBe("account-persona-x");
  });

  test("inferred, from a keyword in the name", () => {
    const r = resolve("my-colour-blind-tester");
    expect(r.resolution).toBe("inferred");
    expect(r.resolvedProfile).toBe("color-blind-deuteranopia");
  });

  test("default, when nothing matched", () => {
    const r = resolve("xyzzy-not-a-persona");
    expect(r.resolution).toBe("default");
    expect(r.resolvedProfile).toBe("default");
  });

  test("getPerceptualProfile returns exactly the resolved profile", () => {
    for (const name of ["first-timer", "dyslexia-reader", "xyzzy-not-a-persona"]) {
      expect(getPerceptualProfile(name)).toEqual(resolve(name).profile);
    }
  });
});

describe("the attention analysis reports how the profile was resolved", () => {
  const EL = [{ type: "cta", x: 100, y: 100, width: 120, height: 40, text: "Start" }];
  const run = (persona: string, traits?: Record<string, number>) =>
    (analyzeAttentionFromDOM as unknown as (...a: unknown[]) => Promise<{ perceptualProfile?: unknown }>)(
      512, 384, EL, persona, 16, undefined, undefined, undefined, undefined, traits,
    );

  test("builtin", async () => {
    expect((await run("first-timer")).perceptualProfile).toEqual({ resolution: "builtin", name: "first-timer" });
  });

  test("synthesized", async () => {
    expect((await run("account-persona-x", { visionLevel: 0.3 })).perceptualProfile)
      .toEqual({ resolution: "synthesized", name: "account-persona-x" });
  });

  test("inferred", async () => {
    expect((await run("my-dyslexia-persona")).perceptualProfile)
      .toEqual({ resolution: "inferred", name: "dyslexic-user" });
  });

  test("default: an unknown name still returns a map, and says it fell through", async () => {
    const a = await run("xyzzy-not-a-persona") as { perceptualProfile?: unknown; saliencyMap: { cells: Float64Array } };
    expect(a.saliencyMap.cells.length).toBeGreaterThan(0);
    expect(a.perceptualProfile).toEqual({ resolution: "default", name: "default" });
  });
});
