/**
 * The capture attention overlay draws a persona through the perceptual filter
 * its own accessibility traits give it, as attention_analysis does (ISC-48.1).
 *
 * overlayAttentionOnFrames called analyzeAttention without the persona's
 * accessibility traits, so a custom persona with low vision on record was
 * painted with the generic default filter on every recorded frame, while
 * attention_analysis drew the same persona "synthesized" from those traits.
 * The four built-in accessibility personas with no perceptual profile
 * (autism-spectrum, intellectual-disability, aphasia-receptive, dyscalculia)
 * were painted with the default too.
 *
 * No browser: the frames are PNGs written here and the DOM is synthetic.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-overlay-traits-data-"));
const work = mkdtempSync(join(tmpdir(), "cb-overlay-traits-"));

const sharp = (await import("sharp")).default;
const { overlayAttentionOnFrames } = await import("../src/recording/saliency-overlay.js");
const { createCognitivePersona, saveCustomPersona } = await import("../src/personas.js");

// Named so that no name keyword infers a profile: "synthesized" can only come
// from the traits on record.
const WITH_TRAITS = "zz-overlay-reader-traits";
const WITHOUT_TRAITS = "zz-overlay-reader-plain";

const DOM = [
  { type: "heading", x: 24, y: 16, width: 240, height: 32, text: "Choose a plan", isHeading: true },
  { type: "cta", x: 24, y: 80, width: 160, height: 40, text: "Start free trial", isCTA: true },
  { type: "content", x: 24, y: 140, width: 280, height: 40, text: "Every plan includes support." },
];
let frames: string[];

beforeAll(async () => {
  for (const [name, a11y] of [[WITH_TRAITS, true], [WITHOUT_TRAITS, false]] as const) {
    const p = createCognitivePersona(name, "A careful reader used by the overlay tests.", {
      patience: 0.5, curiosity: 0.5, readingTendency: 0.5, comprehension: 0.6,
    });
    if (a11y) {
      (p as unknown as { accessibilityTraits: Record<string, number> }).accessibilityTraits = {
        visionLevel: 0.3, contrastSensitivity: 0.4, processingSpeed: 0.5, attentionSpan: 0.6, fatigueSusceptibility: 0.5,
      };
    }
    saveCustomPersona(p);
  }
  frames = [];
  for (let i = 0; i < 2; i++) {
    const path = join(work, `frame-${i}.png`);
    await sharp({ create: { width: 320, height: 200, channels: 3, background: { r: 240, g: 240, b: 240 } } })
      .composite([{
        input: { create: { width: 160, height: 40, channels: 3, background: { r: 0, g: 102, b: 204 } } },
        left: 24, top: 80,
      }])
      .png()
      .toFile(path);
    frames.push(path);
  }
});

afterAll(() => {
  for (const dir of [process.env.CBROWSER_DATA_DIR!, work]) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

const overlay = (persona: string, sub: string) =>
  overlayAttentionOnFrames(frames, join(work, sub), { persona, domElements: DOM, cellSize: 16 });

describe("overlayAttentionOnFrames uses the persona's stored accessibility traits", () => {
  test("a custom persona with accessibility traits on record resolves 'synthesized'", async () => {
    const r = await overlay(WITH_TRAITS, "with");
    expect(r.failed).toBe(0);
    expect(r.perceptualProfile).toEqual({ resolution: "synthesized", name: WITH_TRAITS });
  }, 60_000);

  test("one without them falls back as before ('default': nothing in its name matches)", async () => {
    const r = await overlay(WITHOUT_TRAITS, "without");
    expect(r.perceptualProfile).toEqual({ resolution: "default", name: "default" });
  }, 60_000);

  test("a built-in accessibility persona without a perceptual profile is synthesized from its record", async () => {
    for (const persona of ["autism-spectrum", "dyscalculia"]) {
      const r = await overlay(persona, persona);
      expect(r.perceptualProfile).toEqual({ resolution: "synthesized", name: persona });
    }
  }, 60_000);

  test("a built-in with its own perceptual profile is unchanged ('builtin' wins over traits)", async () => {
    const r = await overlay("low-vision-magnified", "lvm");
    expect(r.perceptualProfile).toEqual({ resolution: "builtin", name: "low-vision-magnified" });
  }, 60_000);
});
