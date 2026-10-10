/**
 * v8 B26 (2026-10-10): the visual verdict is the real visual distance.
 *
 * performWassersteinAnalysis scored 0.2 x byte-diff + 0.8 x Wasserstein, and
 * the byte term compared COMPRESSED PNG bytes. Two encodings of the same pixels
 * share almost none, so identical pixels scored ~0.80 ("Moderate visual
 * differences", printed "Wasserstein distance" ~0.2). These run without a
 * browser: the pixels are drawn with sharp.
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-b26-enc-"));
const sharp = (await import("sharp")).default;
const { analyzeVisualDifferences, VISUAL_DISTANCE_THRESHOLDS } = await import("../src/visual/regression.js");
const { computeCombinedDistance } = await import("../src/visual/distance-metrics.js");

const page = (buttonX: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450">
<rect width="800" height="450" fill="#f7f7f9"/><rect width="800" height="60" fill="#1e3a8a"/>
<text x="24" y="40" font-family="sans-serif" font-size="24" fill="#ffffff">Acme Widgets</text>
<text x="24" y="140" font-family="sans-serif" font-size="36" fill="#222222">Ship faster with Acme</text>
<rect x="${buttonX}" y="200" width="160" height="48" rx="6" fill="#dc2626"/></svg>`;

const dir = mkdtempSync(join(tmpdir(), "cb-b26-px-"));

async function draw(svg: string, name: string, png: Record<string, unknown>): Promise<string> {
  const p = join(dir, name);
  await sharp(Buffer.from(svg)).png(png).toFile(p);
  return p;
}

describe("same pixels, two encodings (B26)", () => {
  test("distance 0, similarity 1, no change, on both the same-engine and cross-engine lines", async () => {
    const a = await draw(page(24), "level9.png", { compressionLevel: 9 });
    const b = await draw(page(24), "level0.png", { compressionLevel: 0, adaptiveFiltering: false });
    // Precondition: different bytes, identical pixels.
    expect(readFileSync(a).equals(readFileSync(b))).toBe(false);
    const [ra, rb] = await Promise.all([a, b].map((p) => sharp(p).raw().toBuffer()));
    expect(ra.equals(rb)).toBe(true);

    for (const opts of [{}, { crossBrowser: true }]) {
      const analysis = await analyzeVisualDifferences(a, b, opts as never);
      expect(analysis.wassersteinDistance).toBe(0);
      expect(analysis.similarityScore).toBe(1);
      expect(analysis.overallStatus).toBe("pass");
      expect(analysis.changes).toEqual([]);
    }
  }, 60000);

  test("the public combined helper no longer floors at ~0.8 for identical pixels", async () => {
    const a = await draw(page(24), "c9.png", { compressionLevel: 9 });
    const b = await draw(page(24), "c0.png", { compressionLevel: 0, adaptiveFiltering: false });
    const r = await computeCombinedDistance(a, b);
    expect(r.normalizedScore).toBe(1);
    expect(r.distance).toBe(0);
  }, 60000);
});

describe("a moved element (B26)", () => {
  test("fails on the same-engine lines, and the output names the raw distance", async () => {
    const a = await draw(page(24), "btn-left.png", { compressionLevel: 9 });
    const b = await draw(page(424), "btn-right.png", { compressionLevel: 9 });
    const analysis = await analyzeVisualDifferences(a, b);
    expect(analysis.wassersteinDistance!).toBeGreaterThanOrEqual(VISUAL_DISTANCE_THRESHOLDS.sameEngine.failAt);
    expect(analysis.overallStatus).toBe("fail");
    expect(analysis.changes[0]?.severity).toBe("breaking");
    // The printed number is the raw distance, not 1 - a blended score.
    expect(analysis.changes[0].description).toContain(`sliced Wasserstein distance ${analysis.wassersteinDistance!.toPrecision(3)}`);
    expect(analysis.similarityScore).toBeLessThan(1);
  }, 60000);
});
