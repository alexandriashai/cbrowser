import { test, expect, describe } from "bun:test";
import { join } from "path";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import {
  computeWassersteinDistance,
  computeByteDiff,
  computeCombinedDistance,
  computeHistogramBarycenter,
  computeSmartBaseline,
  compareAgainstSmartBaseline,
  computeTransportMap,
} from "./distance-metrics.js";

const TEST_DIR = join(import.meta.dir, "../../.test-fixtures");

// Create test images using sharp
async function createTestImage(path: string, color: { r: number; g: number; b: number }, width = 100, height = 100) {
  const sharp = (await import("sharp")).default;
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 3] = color.r;
    pixels[i * 3 + 1] = color.g;
    pixels[i * 3 + 2] = color.b;
  }
  await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toFile(path);
}

async function createGradientImage(path: string, direction: "horizontal" | "vertical", width = 100, height = 100) {
  const sharp = (await import("sharp")).default;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const val = direction === "horizontal" ? Math.floor((x / width) * 255) : Math.floor((y / height) * 255);
      const idx = (y * width + x) * 3;
      pixels[idx] = val;
      pixels[idx + 1] = val;
      pixels[idx + 2] = val;
    }
  }
  await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toFile(path);
}

// Setup
if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });

describe("Sliced Wasserstein Distance", () => {
  test("identical images have distance ~0 and similarity ~1", async () => {
    const imgPath = join(TEST_DIR, "identical.png");
    await createTestImage(imgPath, { r: 128, g: 64, b: 200 });

    const result = await computeWassersteinDistance(imgPath, imgPath);

    expect(result.metric).toBe("sliced-wasserstein");
    expect(result.distance).toBeLessThan(0.001);
    expect(result.normalizedScore).toBeGreaterThan(0.99);
    // Whole milliseconds since B15: a sub-0.5 ms run rounds to 0, which is a
    // measurement, not a failure.
    expect(result.details.computeTimeMs).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.details.computeTimeMs)).toBe(true);
  });

  test("completely different colors have high distance", async () => {
    const imgA = join(TEST_DIR, "red.png");
    const imgB = join(TEST_DIR, "blue.png");
    await createTestImage(imgA, { r: 255, g: 0, b: 0 });
    await createTestImage(imgB, { r: 0, g: 0, b: 255 });

    const result = await computeWassersteinDistance(imgA, imgB);

    expect(result.distance).toBeGreaterThan(0.1);
    expect(result.normalizedScore).toBeLessThan(0.8);
  });

  test("similar colors have small distance", async () => {
    const imgA = join(TEST_DIR, "light-red.png");
    const imgB = join(TEST_DIR, "lighter-red.png");
    await createTestImage(imgA, { r: 200, g: 50, b: 50 });
    await createTestImage(imgB, { r: 210, g: 55, b: 55 });

    const result = await computeWassersteinDistance(imgA, imgB);

    expect(result.distance).toBeLessThan(0.05);
    expect(result.normalizedScore).toBeGreaterThan(0.9);
  });

  test("spatial mode detects layout shifts", async () => {
    const imgA = join(TEST_DIR, "grad-h.png");
    const imgB = join(TEST_DIR, "grad-v.png");
    await createGradientImage(imgA, "horizontal");
    await createGradientImage(imgB, "vertical");

    // Color-only should be similar (same overall colors)
    const colorResult = await computeWassersteinDistance(imgA, imgB, { compareMode: "color" });
    // Spatial should detect the difference
    const spatialResult = await computeWassersteinDistance(imgA, imgB, { compareMode: "spatial" });

    expect(spatialResult.distance).toBeGreaterThan(colorResult.distance);
  });

  test("downscale parameter affects performance", async () => {
    const imgPath = join(TEST_DIR, "perf-test.png");
    await createTestImage(imgPath, { r: 100, g: 150, b: 200 }, 400, 400);

    const t1 = performance.now();
    await computeWassersteinDistance(imgPath, imgPath, { downscale: 0.25 });
    const fast = performance.now() - t1;

    const t2 = performance.now();
    await computeWassersteinDistance(imgPath, imgPath, { downscale: 1.0 });
    const slow = performance.now() - t2;

    // Smaller downscale should be faster
    expect(fast).toBeLessThan(slow);
  });
});

describe("Byte Diff", () => {
  test("identical files have 0 distance", async () => {
    const imgPath = join(TEST_DIR, "byte-same.png");
    await createTestImage(imgPath, { r: 128, g: 128, b: 128 });

    const result = computeByteDiff(imgPath, imgPath);

    expect(result.distance).toBe(0);
    expect(result.normalizedScore).toBe(1);
  });
});

describe("Combined Distance", () => {
  test("combines byte-diff and Wasserstein scores", async () => {
    const imgA = join(TEST_DIR, "comb-a.png");
    const imgB = join(TEST_DIR, "comb-b.png");
    await createTestImage(imgA, { r: 100, g: 100, b: 100 });
    await createTestImage(imgB, { r: 120, g: 120, b: 120 });

    const result = await computeCombinedDistance(imgA, imgB);

    expect(result.metric).toBe("combined");
    expect(result.normalizedScore).toBeGreaterThan(0);
    expect(result.normalizedScore).toBeLessThan(1);
  });
});

describe("Histogram Barycenter", () => {
  test("barycenter of identical images equals the image", async () => {
    const imgPath = join(TEST_DIR, "bary-same.png");
    await createTestImage(imgPath, { r: 100, g: 150, b: 200 });

    const result = await computeHistogramBarycenter([imgPath, imgPath, imgPath]);

    expect(result.meanDistance).toBeLessThan(0.001);
  });

  test("barycenter of similar images has low mean distance", async () => {
    const imgs = [];
    for (let i = 0; i < 5; i++) {
      const p = join(TEST_DIR, `bary-sim-${i}.png`);
      await createTestImage(p, { r: 100 + i * 2, g: 150 + i, b: 200 - i }, 50, 50);
      imgs.push(p);
    }
    const result = await computeHistogramBarycenter(imgs);
    expect(result.meanDistance).toBeLessThan(0.02);
  });

  test("barycenter of different images has non-zero mean distance", async () => {
    const imgA = join(TEST_DIR, "bary-a.png");
    const imgB = join(TEST_DIR, "bary-b.png");
    const imgC = join(TEST_DIR, "bary-c.png");
    await createTestImage(imgA, { r: 255, g: 0, b: 0 });
    await createTestImage(imgB, { r: 0, g: 255, b: 0 });
    await createTestImage(imgC, { r: 0, g: 0, b: 255 });

    const result = await computeHistogramBarycenter([imgA, imgB, imgC]);

    expect(result.meanDistance).toBeGreaterThan(0.01);
    // Barycenter histogram should exist for all channels
    expect(result.histogram.r.length).toBe(64);
    expect(result.histogram.g.length).toBe(64);
    expect(result.histogram.b.length).toBe(64);
  });
});

describe("Smart Barycenter Baseline (Phase 2)", () => {
  test("creates smart baseline from consistent captures", async () => {
    // Simulate 5 consistent captures (same color, slight variation)
    const paths = [];
    for (let i = 0; i < 5; i++) {
      const p = join(TEST_DIR, `smart-${i}.png`);
      await createTestImage(p, { r: 100 + i, g: 150 + i, b: 200 - i }, 80, 80);
      paths.push(p);
    }

    const baseline = await computeSmartBaseline(paths, "test-smart", "https://example.com");

    expect(baseline.name).toBe("test-smart");
    expect(baseline.numCaptures).toBe(5);
    expect(baseline.numOutliers).toBe(0);
    expect(baseline.meanDistance).toBeLessThan(0.02);
    expect(baseline.referencePath).toBeTruthy();
    expect(baseline.adaptiveThreshold).toBeGreaterThan(0.7);
    expect(baseline.adaptiveThreshold).toBeLessThanOrEqual(0.98);
    expect(baseline.computeTimeMs).toBeGreaterThanOrEqual(0); // whole ms: 0 is a fast run
    expect(Number.isInteger(baseline.computeTimeMs)).toBe(true);
  });

  test("detects outlier captures have higher distance", async () => {
    // 4 gradient images (similar) + 1 completely different
    const paths = [];
    for (let i = 0; i < 4; i++) {
      const p = join(TEST_DIR, `outlier-${i}.png`);
      await createGradientImage(p, "horizontal", 100, 100);
      paths.push(p);
    }
    // Outlier: solid red (very different distribution from gradient)
    const outlierPath = join(TEST_DIR, "outlier-4.png");
    await createTestImage(outlierPath, { r: 255, g: 0, b: 0 }, 100, 100);
    paths.push(outlierPath);

    const baseline = await computeSmartBaseline(paths, "outlier-test", "https://example.com");

    // The outlier should have the highest distance from barycenter
    const outlierDist = baseline.captureDistances[4];
    const avgNonOutlier = baseline.captureDistances.slice(0, 4).reduce((a, b) => a + b, 0) / 4;
    expect(outlierDist).toBeGreaterThan(avgNonOutlier);
  });

  test("compare against smart baseline — identical image passes", async () => {
    const paths = [];
    for (let i = 0; i < 3; i++) {
      const p = join(TEST_DIR, `cmp-base-${i}.png`);
      await createTestImage(p, { r: 120, g: 140, b: 180 }, 80, 80);
      paths.push(p);
    }

    const baseline = await computeSmartBaseline(paths, "cmp-test", "https://example.com");

    // Compare identical image
    const result = await compareAgainstSmartBaseline(paths[0], baseline);

    expect(result.normalizedScore).toBeGreaterThan(0.9);
    expect(result.withinVariance).toBe(true);
    expect(result.varianceRatio).toBeLessThan(3);
  });

  test("compare against smart baseline — different image scores lower", async () => {
    // Use gradient images for meaningful distribution differences
    const paths = [];
    for (let i = 0; i < 3; i++) {
      const p = join(TEST_DIR, `cmp2-base-${i}.png`);
      await createGradientImage(p, "horizontal", 100, 100);
      paths.push(p);
    }

    const baseline = await computeSmartBaseline(paths, "cmp2-test", "https://example.com");

    // Compare a solid red image (very different distribution)
    const diffPath = join(TEST_DIR, "cmp2-diff.png");
    await createTestImage(diffPath, { r: 255, g: 0, b: 0 }, 100, 100);
    const diffResult = await compareAgainstSmartBaseline(diffPath, baseline);

    // Compare same gradient (should be close)
    const sameResult = await compareAgainstSmartBaseline(paths[0], baseline);

    expect(diffResult.normalizedScore).toBeLessThan(sameResult.normalizedScore);
  });
});

describe("Visual Transport Map (Phase 3)", () => {
  test("identical images produce zero flows and no hotspots", async () => {
    const imgPath = join(TEST_DIR, "transport-same.png");
    await createGradientImage(imgPath, "horizontal", 100, 100);

    const result = await computeTransportMap(imgPath, imgPath);

    expect(result.flows.length).toBe(0);
    expect(result.hotspots.length).toBe(0);
    expect(result.totalCost).toBe(0);
    expect(result.svg).toContain("<svg");
    expect(result.svg).toContain("</svg>");
    expect(result.computeTimeMs).toBeGreaterThanOrEqual(0); // whole ms: 0 is a fast run
    expect(Number.isInteger(result.computeTimeMs)).toBe(true);
  });

  test("different images produce hotspots and heatmap changes", async () => {
    const imgA = join(TEST_DIR, "transport-a.png");
    const imgB = join(TEST_DIR, "transport-b.png");
    await createGradientImage(imgA, "horizontal", 100, 100);
    await createTestImage(imgB, { r: 255, g: 0, b: 0 }, 100, 100);

    const result = await computeTransportMap(imgA, imgB);

    // Heatmap should show changes even when mass distribution is uniform
    const maxHeat = Math.max(...Array.from(result.heatmap));
    expect(maxHeat).toBeGreaterThan(0);
    expect(result.hotspots.length).toBeGreaterThan(0);
    expect(result.svg).toContain("arrowhead");
    expect(result.gridSize.rows).toBeGreaterThan(0);
    expect(result.gridSize.cols).toBeGreaterThan(0);
  });

  test("transport map SVG contains heatmap and flow elements", async () => {
    const imgA = join(TEST_DIR, "svg-a.png");
    const imgB = join(TEST_DIR, "svg-b.png");
    await createGradientImage(imgA, "horizontal", 120, 80);
    await createGradientImage(imgB, "vertical", 120, 80);

    const result = await computeTransportMap(imgA, imgB, { cellSize: 20 });

    // SVG should contain rects (heatmap) and lines (flows)
    expect(result.svg).toContain("<rect");
    expect(result.svg).toContain("viewBox");
    expect(result.dimensions.width).toBeGreaterThan(0);
    expect(result.dimensions.height).toBeGreaterThan(0);
  });

  test("cellSize config affects grid granularity", async () => {
    const imgA = join(TEST_DIR, "cell-a.png");
    const imgB = join(TEST_DIR, "cell-b.png");
    await createGradientImage(imgA, "horizontal", 200, 200);
    await createTestImage(imgB, { r: 128, g: 0, b: 128 }, 200, 200);

    const coarse = await computeTransportMap(imgA, imgB, { cellSize: 64 });
    const fine = await computeTransportMap(imgA, imgB, { cellSize: 16 });

    // Finer grid = more cells
    expect(fine.gridSize.rows).toBeGreaterThan(coarse.gridSize.rows);
    expect(fine.gridSize.cols).toBeGreaterThan(coarse.gridSize.cols);
  });

  test("hotspots describe the type of change", async () => {
    const imgA = join(TEST_DIR, "hotspot-a.png");
    const imgB = join(TEST_DIR, "hotspot-b.png");
    await createGradientImage(imgA, "horizontal", 100, 100);
    await createTestImage(imgB, { r: 255, g: 255, b: 0 }, 100, 100);

    const result = await computeTransportMap(imgA, imgB, { numHotspots: 3 });

    for (const hs of result.hotspots) {
      expect(hs.description).toBeTruthy();
      expect(hs.magnitude).toBeGreaterThan(0);
      expect(hs.region.width).toBeGreaterThan(0);
      expect(hs.region.height).toBeGreaterThan(0);
    }
  });
});
