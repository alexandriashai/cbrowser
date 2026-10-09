import { test, expect, describe } from "bun:test";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import { analyzeAttention, compareAttention } from "./attention-transport.js";

const TEST_DIR = join(import.meta.dir, "../../.test-fixtures");
if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });

async function createTestImage(path: string, color: { r: number; g: number; b: number }, width = 200, height = 200) {
  const sharp = (await import("sharp")).default;
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 3] = color.r;
    pixels[i * 3 + 1] = color.g;
    pixels[i * 3 + 2] = color.b;
  }
  await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toFile(path);
}

async function createGradientImage(path: string, width = 200, height = 200) {
  const sharp = (await import("sharp")).default;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      pixels[idx] = Math.floor((x / width) * 255);
      pixels[idx + 1] = Math.floor((y / height) * 255);
      pixels[idx + 2] = 128;
    }
  }
  await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toFile(path);
}

async function createContrastImage(path: string, width = 200, height = 200) {
  const sharp = (await import("sharp")).default;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      // Left half dark, right half bright — creates high center-surround contrast at boundary
      const bright = x > width / 2;
      pixels[idx] = bright ? 255 : 20;
      pixels[idx + 1] = bright ? 255 : 20;
      pixels[idx + 2] = bright ? 200 : 40;
    }
  }
  await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toFile(path);
}

describe("Attention Transport (Phase 4)", () => {
  test("uniform image has low saliency variance", async () => {
    const imgPath = join(TEST_DIR, "attn-uniform.png");
    await createTestImage(imgPath, { r: 128, g: 128, b: 128 });

    const result = await analyzeAttention(imgPath, "first-timer", 16);

    expect(result.persona).toBe("first-timer");
    expect(result.saliencyMap.cells.length).toBeGreaterThan(0);
    expect(result.entropy).toBeGreaterThan(0);
    // Whole milliseconds since B15: a sub-0.5 ms run rounds to 0.
    expect(result.computeTimeMs).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.computeTimeMs)).toBe(true);
    // Uniform image → low concentration (attention spread evenly)
    expect(result.concentration).toBeLessThan(0.8);
  });

  test("high-contrast image has localized saliency", async () => {
    const imgPath = join(TEST_DIR, "attn-contrast.png");
    await createContrastImage(imgPath);

    const result = await analyzeAttention(imgPath, "first-timer", 16);

    // The boundary between dark and light should be salient
    const maxSaliency = Math.max(...Array.from(result.saliencyMap.cells));
    expect(maxSaliency).toBeGreaterThan(0.5);
    expect(result.saliencyMap.hotspots.length).toBeGreaterThan(0);
  });

  test("different personas produce different saliency", async () => {
    const imgPath = join(TEST_DIR, "attn-gradient.png");
    await createGradientImage(imgPath);

    const motorResult = await analyzeAttention(imgPath, "motor-impairment-tremor", 16);
    const adhdResult = await analyzeAttention(imgPath, "cognitive-adhd", 16);

    // Motor (center-heavy) should have higher concentration than ADHD (motion-attracted)
    // Both should have valid entropy
    expect(motorResult.entropy).toBeGreaterThan(0);
    expect(adhdResult.entropy).toBeGreaterThan(0);
    // Attention patterns should differ
    expect(motorResult.transportCost).not.toBe(adhdResult.transportCost);
  });

  test("attention alignment score is between -1 and 1", async () => {
    const imgPath = join(TEST_DIR, "attn-align.png");
    await createGradientImage(imgPath);

    const result = await analyzeAttention(imgPath, "low-vision-magnified", 16);

    expect(result.alignmentScore).toBeGreaterThanOrEqual(-1);
    expect(result.alignmentScore).toBeLessThanOrEqual(1);
  });

  test("hotspots are sorted by saliency", async () => {
    const imgPath = join(TEST_DIR, "attn-hotspot.png");
    await createContrastImage(imgPath);

    const result = await analyzeAttention(imgPath, "first-timer", 16);

    for (let i = 1; i < result.saliencyMap.hotspots.length; i++) {
      expect(result.saliencyMap.hotspots[i].saliency).toBeLessThanOrEqual(result.saliencyMap.hotspots[i - 1].saliency);
    }
  });
});

describe("Attention Comparison", () => {
  test("same persona produces zero divergence", async () => {
    const imgPath = join(TEST_DIR, "attn-cmp-same.png");
    await createGradientImage(imgPath);

    const result = await compareAttention(imgPath, "first-timer", "first-timer", 16);

    expect(result.attentionDivergence).toBeLessThan(0.001);
    expect(result.divergentRegions.length).toBe(0);
  });

  test("different personas produce non-zero divergence", async () => {
    const imgPath = join(TEST_DIR, "attn-cmp-diff.png");
    await createContrastImage(imgPath);

    const result = await compareAttention(imgPath, "motor-impairment-tremor", "cognitive-adhd", 16);

    expect(result.attentionDivergence).toBeGreaterThan(0);
    expect(result.personaA.persona).toBe("motor-impairment-tremor");
    expect(result.personaB.persona).toBe("cognitive-adhd");
  });
});
