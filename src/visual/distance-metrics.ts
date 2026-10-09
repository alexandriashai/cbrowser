/**
 * Distance metrics for visual comparison
 *
 * Implements Sliced Wasserstein Distance (SWD) for robust image comparison.
 * Based on optimal transport theory — measures minimum cost to transform
 * one image distribution into another.
 *
 * Key advantages over byte-diff / SSIM:
 * - Robust to sub-pixel shifts, anti-aliasing, font rendering differences
 * - Cross-resolution capable (compares distributions, not pixel grids)
 * - Decomposable (can show WHERE visual mass moved)
 * - Supports barycenter computation (consensus baselines from N captures)
 *
 * @version 1.0.0
 * @see https://github.com/alexandriashai/cbrowser/issues/158
 */

import { readFileSync } from 'fs';

// ── Types ──

export interface DistanceMetricResult {
  metric: 'byte-diff' | 'wasserstein' | 'sliced-wasserstein' | 'combined';
  distance: number;
  normalizedScore: number; // 0-1 similarity (1 = identical)
  details: {
    computeTimeMs: number;
    dimensions?: { width: number; height: number };
    numProjections?: number;
    channelDistances?: { r: number; g: number; b: number; spatial: number };
    transportCost?: number;
  };
}

export interface WassersteinConfig {
  /** Number of random 1D projections for sliced approximation (default: 64) */
  numProjections?: number;
  /** Compare mode: 'color' for color histogram, 'spatial' for spatial distribution, 'combined' for both */
  compareMode?: 'color' | 'spatial' | 'combined';
  /** Downscale factor for performance (0.0-1.0, default: 0.5 for 2x downscale) */
  downscale?: number;
  /** Regions to ignore (e.g. dynamic content areas) */
  ignoreRegions?: Array<{ x: number; y: number; width: number; height: number }>;
}

export interface BarycenterConfig {
  /** Number of Sinkhorn iterations (default: 50) */
  iterations?: number;
  /** Entropy regularization parameter (default: 0.01) */
  epsilon?: number;
  /** Downscale for performance */
  downscale?: number;
}

// ── Image loading (raw pixel data) ──

interface RawImage {
  data: Uint8Array; // RGBA pixel data
  width: number;
  height: number;
  channels: 4;
}

async function loadImage(path: string, downscale: number = 1.0): Promise<RawImage> {
  // Dynamic import handles both ESM default and CJS module.exports
  const sharpModule: any = await import('sharp');
  const sharpFn: (input: string) => any = sharpModule.default ?? sharpModule;
  const img = sharpFn(path);
  const metadata = await img.metadata();

  const targetWidth = Math.round((metadata.width || 800) * downscale);
  const targetHeight = Math.round((metadata.height || 600) * downscale);

  const { data, info } = await img
    .resize(targetWidth, targetHeight, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
    channels: 4,
  };
}

// ── Core: 1D Wasserstein Distance ──

/**
 * Compute exact 1D Wasserstein-1 distance between two sorted arrays.
 * This is the foundation — W1 between 1D distributions equals the
 * L1 distance between their quantile functions (sorted values).
 */
function wasserstein1D(a: Float64Array, b: Float64Array): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;

  // Sort both arrays (quantile functions)
  const sortedA = new Float64Array(a).sort();
  const sortedB = new Float64Array(b).sort();

  // W1 = (1/n) * sum |F^{-1}_A(i/n) - F^{-1}_B(i/n)|
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += Math.abs(sortedA[i] - sortedB[i]);
  }
  return sum / n;
}

// ── Core: Sliced Wasserstein Distance ──

/**
 * Compute Sliced Wasserstein Distance between two point clouds.
 *
 * Algorithm:
 * 1. Generate K random unit vectors (projections)
 * 2. Project both point clouds onto each direction
 * 3. Compute 1D Wasserstein for each projection
 * 4. Average across all projections
 *
 * Complexity: O(K * N * log N) where K = projections, N = points
 */
function slicedWassersteinDistance(
  pointsA: Float64Array[], // Array of d-dimensional points
  pointsB: Float64Array[], // Array of d-dimensional points
  numProjections: number = 64,
  dim: number = 3,
): number {
  if (pointsA.length === 0 || pointsB.length === 0) return 1;

  // Subsample to equal size if needed
  const n = Math.min(pointsA.length, pointsB.length, 50000);
  const sampleA = subsample(pointsA, n);
  const sampleB = subsample(pointsB, n);

  let totalDistance = 0;

  for (let p = 0; p < numProjections; p++) {
    // Generate random unit vector
    const direction = randomUnitVector(dim);

    // Project points onto direction
    const projA = new Float64Array(n);
    const projB = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      projA[i] = dot(sampleA[i], direction);
      projB[i] = dot(sampleB[i], direction);
    }

    // 1D Wasserstein on projections
    totalDistance += wasserstein1D(projA, projB);
  }

  return totalDistance / numProjections;
}

// ── Helper: Random projections ──

function randomUnitVector(dim: number): Float64Array {
  const v = new Float64Array(dim);
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    // Box-Muller for normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    v[i] = Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
    norm += v[i] * v[i];
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < dim; i++) v[i] /= norm;
  return v;
}

function dot(a: Float64Array, b: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function subsample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  const result: T[] = [];
  for (let i = 0; i < n; i++) {
    result.push(arr[Math.floor(i * step)]);
  }
  return result;
}

// ── Image → Point Cloud Conversion ──

/**
 * Convert image to color point cloud (R, G, B).
 * Each pixel becomes a 3D point in color space.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function imageToColorPoints(img: RawImage, ignoreRegions?: Array<{ x: number; y: number; width: number; height: number }>): Float64Array[] {
  const points: Float64Array[] = [];

  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      // Check if in ignore region
      if (ignoreRegions?.some(r => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height)) continue;

      const idx = (y * img.width + x) * 4;
      const a = img.data[idx + 3] / 255; // Alpha
      if (a < 0.1) continue; // Skip transparent pixels

      points.push(new Float64Array([
        img.data[idx] / 255,     // R normalized
        img.data[idx + 1] / 255, // G normalized
        img.data[idx + 2] / 255, // B normalized
      ]));
    }
  }

  return points;
}

/**
 * Convert image to spatial-color point cloud (x, y, R, G, B).
 * Captures both WHERE colors are and WHAT colors they are.
 * This is the key for layout-aware comparison.
 */
function imageToSpatialColorPoints(img: RawImage, ignoreRegions?: Array<{ x: number; y: number; width: number; height: number }>): Float64Array[] {
  const points: Float64Array[] = [];

  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (ignoreRegions?.some(r => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height)) continue;

      const idx = (y * img.width + x) * 4;
      const a = img.data[idx + 3] / 255;
      if (a < 0.1) continue;

      points.push(new Float64Array([
        x / img.width,           // Normalized x position
        y / img.height,          // Normalized y position
        img.data[idx] / 255,     // R
        img.data[idx + 1] / 255, // G
        img.data[idx + 2] / 255, // B
      ]));
    }
  }

  return points;
}

/**
 * Per-channel color histogram distance using 1D Wasserstein.
 * Fast and effective for overall color distribution comparison.
 */
function colorHistogramDistance(imgA: RawImage, imgB: RawImage): { r: number; g: number; b: number; combined: number } {
  const bins = 64;
  const histA = { r: new Float64Array(bins), g: new Float64Array(bins), b: new Float64Array(bins) };
  const histB = { r: new Float64Array(bins), g: new Float64Array(bins), b: new Float64Array(bins) };

  const fillHist = (img: RawImage, hist: typeof histA) => {
    let count = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] < 25) continue; // Skip transparent
      const bin = (val: number) => Math.min(Math.floor(val / 256 * bins), bins - 1);
      hist.r[bin(img.data[i])]++;
      hist.g[bin(img.data[i + 1])]++;
      hist.b[bin(img.data[i + 2])]++;
      count++;
    }
    // Normalize to probability distribution
    if (count > 0) {
      for (let j = 0; j < bins; j++) {
        hist.r[j] /= count;
        hist.g[j] /= count;
        hist.b[j] /= count;
      }
    }
  };

  fillHist(imgA, histA);
  fillHist(imgB, histB);

  const r = wasserstein1D(histA.r, histB.r);
  const g = wasserstein1D(histA.g, histB.g);
  const b = wasserstein1D(histA.b, histB.b);

  return { r, g, b, combined: (r + g + b) / 3 };
}

// ── Public API ──

/**
 * Compute Sliced Wasserstein Distance between two images.
 *
 * @param baselinePath - Path to baseline PNG/JPEG
 * @param currentPath - Path to current PNG/JPEG
 * @param config - Configuration options
 * @returns DistanceMetricResult with similarity score (0-1)
 */
export async function computeWassersteinDistance(
  baselinePath: string,
  currentPath: string,
  config: WassersteinConfig = {},
): Promise<DistanceMetricResult> {
  const startTime = performance.now();
  const {
    numProjections = 64,
    compareMode = 'combined',
    downscale = 0.5,
    ignoreRegions,
  } = config;

  // Load images
  const [imgA, imgB] = await Promise.all([
    loadImage(baselinePath, downscale),
    loadImage(currentPath, downscale),
  ]);

  // Scale ignore regions for downscaled image
  const scaledRegions = ignoreRegions?.map(r => ({
    x: Math.round(r.x * downscale),
    y: Math.round(r.y * downscale),
    width: Math.round(r.width * downscale),
    height: Math.round(r.height * downscale),
  }));

  let distance: number;
  let channelDistances: { r: number; g: number; b: number; spatial: number } | undefined;

  if (compareMode === 'color') {
    // Color histogram comparison (fastest)
    const hist = colorHistogramDistance(imgA, imgB);
    distance = hist.combined;
    channelDistances = { ...hist, spatial: 0 };

  } else if (compareMode === 'spatial') {
    // Spatial-color point cloud (most comprehensive)
    const pointsA = imageToSpatialColorPoints(imgA, scaledRegions);
    const pointsB = imageToSpatialColorPoints(imgB, scaledRegions);
    distance = slicedWassersteinDistance(pointsA, pointsB, numProjections, 5);

  } else {
    // Combined: both color histogram AND spatial
    const hist = colorHistogramDistance(imgA, imgB);

    const pointsA = imageToSpatialColorPoints(imgA, scaledRegions);
    const pointsB = imageToSpatialColorPoints(imgB, scaledRegions);
    const spatialDist = slicedWassersteinDistance(pointsA, pointsB, numProjections, 5);

    // Weighted combination: spatial is more informative but noisier
    distance = hist.combined * 0.3 + spatialDist * 0.7;
    channelDistances = { ...hist, spatial: spatialDist };
  }

  // Normalize to 0-1 similarity score
  // Distance is typically in [0, ~0.5] range for real images
  // Use sigmoid-like mapping for intuitive scoring
  const normalizedScore = Math.max(0, Math.min(1, 1 - distance * 4));

  const computeTimeMs = Math.round(performance.now() - startTime);

  return {
    metric: 'sliced-wasserstein',
    distance,
    normalizedScore,
    details: {
      computeTimeMs,
      dimensions: { width: imgA.width, height: imgA.height },
      numProjections,
      channelDistances,
      transportCost: distance,
    },
  };
}

/**
 * Compute the existing byte-diff metric (for comparison / fallback).
 */
export function computeByteDiff(baselinePath: string, currentPath: string): DistanceMetricResult {
  const startTime = performance.now();
  const bufA = readFileSync(baselinePath);
  const bufB = readFileSync(currentPath);

  const minLen = Math.min(bufA.length, bufB.length);
  const maxLen = Math.max(bufA.length, bufB.length);

  let diff = 0;
  for (let i = 0; i < minLen; i++) {
    if (bufA[i] !== bufB[i]) diff++;
  }
  diff += maxLen - minLen; // Size difference = all different

  const diffRatio = diff / maxLen;

  return {
    metric: 'byte-diff',
    distance: diffRatio,
    normalizedScore: 1 - diffRatio,
    details: { computeTimeMs: Math.round(performance.now() - startTime) },
  };
}

/**
 * Compute combined distance using multiple metrics.
 * Runs byte-diff (fast) and Wasserstein (robust), combines scores.
 */
export async function computeCombinedDistance(
  baselinePath: string,
  currentPath: string,
  weights: { byteDiff?: number; wasserstein?: number } = {},
  wassersteinConfig?: WassersteinConfig,
): Promise<DistanceMetricResult> {
  const startTime = performance.now();
  const { byteDiff: bw = 0.2, wasserstein: ww = 0.8 } = weights;

  const [byteResult, wassersteinResult] = await Promise.all([
    Promise.resolve(computeByteDiff(baselinePath, currentPath)),
    computeWassersteinDistance(baselinePath, currentPath, wassersteinConfig),
  ]);

  const combinedScore = byteResult.normalizedScore * bw + wassersteinResult.normalizedScore * ww;

  return {
    metric: 'combined',
    distance: 1 - combinedScore,
    normalizedScore: combinedScore,
    details: {
      computeTimeMs: Math.round(performance.now() - startTime),
      channelDistances: wassersteinResult.details.channelDistances,
      dimensions: wassersteinResult.details.dimensions,
      numProjections: wassersteinResult.details.numProjections,
    },
  };
}

// ── Barycenter (Phase 2 foundation) ──

/**
 * Compute color histogram barycenter of multiple images.
 * Returns the "average" color distribution — useful for creating
 * consensus baselines from multiple captures.
 *
 * For Phase 2: full Wasserstein barycenter via Sinkhorn/IBP.
 * This simpler version averages histograms, which approximates
 * the Wasserstein barycenter for 1D marginals.
 */
export async function computeHistogramBarycenter(
  imagePaths: string[],
  config: BarycenterConfig = {},
): Promise<{ histogram: { r: Float64Array; g: Float64Array; b: Float64Array }; meanDistance: number }> {
  const { downscale = 0.5 } = config;
  const bins = 64;

  // Load all images and compute histograms
  const histograms: Array<{ r: Float64Array; g: Float64Array; b: Float64Array }> = [];

  for (const path of imagePaths) {
    const img = await loadImage(path, downscale);
    const hist = { r: new Float64Array(bins), g: new Float64Array(bins), b: new Float64Array(bins) };
    let count = 0;

    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] < 25) continue;
      const bin = (val: number) => Math.min(Math.floor(val / 256 * bins), bins - 1);
      hist.r[bin(img.data[i])]++;
      hist.g[bin(img.data[i + 1])]++;
      hist.b[bin(img.data[i + 2])]++;
      count++;
    }

    if (count > 0) {
      for (let j = 0; j < bins; j++) {
        hist.r[j] /= count;
        hist.g[j] /= count;
        hist.b[j] /= count;
      }
    }

    histograms.push(hist);
  }

  // Compute barycenter (quantile averaging for 1D Wasserstein barycenter)
  const barycenter = { r: new Float64Array(bins), g: new Float64Array(bins), b: new Float64Array(bins) };
  const n = histograms.length;

  for (const channel of ['r', 'g', 'b'] as const) {
    // Convert histograms to quantile functions, average, convert back
    const cdfs = histograms.map(h => {
      const cdf = new Float64Array(bins);
      cdf[0] = h[channel][0];
      for (let i = 1; i < bins; i++) cdf[i] = cdf[i - 1] + h[channel][i];
      return cdf;
    });

    // Average CDFs (this gives the Wasserstein barycenter in 1D!)
    const avgCdf = new Float64Array(bins);
    for (let i = 0; i < bins; i++) {
      for (const cdf of cdfs) avgCdf[i] += cdf[i] / n;
    }

    // Convert CDF back to PDF
    barycenter[channel][0] = avgCdf[0];
    for (let i = 1; i < bins; i++) {
      barycenter[channel][i] = Math.max(0, avgCdf[i] - avgCdf[i - 1]);
    }
  }

  // Compute mean distance from each image to the barycenter
  let totalDist = 0;
  for (const hist of histograms) {
    const dr = wasserstein1D(hist.r, barycenter.r);
    const dg = wasserstein1D(hist.g, barycenter.g);
    const db = wasserstein1D(hist.b, barycenter.b);
    totalDist += (dr + dg + db) / 3;
  }

  return {
    histogram: barycenter,
    meanDistance: totalDist / n,
  };
}

// ── Phase 2: Smart Barycenter Baselines ──

export interface SmartBaselineConfig {
  /** Number of captures to take (default: 5) */
  numCaptures?: number;
  /** Delay between captures in ms (default: 1000) */
  captureDelay?: number;
  /** Downscale for barycenter computation (default: 0.5) */
  downscale?: number;
  /** Directory to store baseline data */
  outputDir?: string;
  /** Outlier rejection threshold — captures with distance > threshold * stddev are excluded (default: 2.0) */
  outlierThreshold?: number;
}

export interface SmartBaseline {
  id: string;
  name: string;
  url: string;
  /** Path to the median reference screenshot (closest to barycenter) */
  referencePath: string;
  /** Paths to all individual captures */
  capturePaths: string[];
  /** Barycenter histogram (consensus color distribution) */
  barycenter: { r: Float64Array; g: Float64Array; b: Float64Array };
  /** Distance of each capture from the barycenter */
  captureDistances: number[];
  /** Mean distance — lower = more consistent renders */
  meanDistance: number;
  /** Standard deviation of distances — measures render stability */
  stdDevDistance: number;
  /** Number of captures used (after outlier rejection) */
  numCaptures: number;
  /** Number of captures rejected as outliers */
  numOutliers: number;
  /** Adaptive threshold: suggested comparison threshold based on observed variance */
  adaptiveThreshold: number;
  timestamp: string;
  computeTimeMs: number;
}

/**
 * Compute a Smart Barycenter Baseline from multiple screenshot paths.
 *
 * Algorithm:
 * 1. Compute per-image color histograms
 * 2. Compute Wasserstein barycenter (optimal consensus distribution)
 * 3. Measure each capture's distance to the barycenter
 * 4. Reject outliers (captures too far from consensus)
 * 5. Recompute barycenter without outliers
 * 6. Select the median capture (closest to barycenter) as reference image
 * 7. Compute adaptive threshold based on observed variance
 *
 * The result: a baseline that represents the "typical" rendering,
 * robust to timing variations, dynamic content, and animation states.
 *
 * @param screenshotPaths - Array of PNG paths (pre-captured)
 * @param name - Baseline name
 * @param url - Source URL
 * @param config - Configuration
 */
export async function computeSmartBaseline(
  screenshotPaths: string[],
  name: string,
  url: string,
  config: SmartBaselineConfig = {},
): Promise<SmartBaseline> {
  const startTime = performance.now();
  const {
    downscale = 0.5,
    outlierThreshold = 2.0,
    outputDir: _outputDir,
  } = config;

  if (screenshotPaths.length < 2) {
    throw new Error('Smart baseline requires at least 2 captures');
  }

  const bins = 64;

  // Step 1: Load all images and compute histograms
  const images: RawImage[] = [];
  const histograms: Array<{ r: Float64Array; g: Float64Array; b: Float64Array }> = [];

  for (const path of screenshotPaths) {
    const img = await loadImage(path, downscale);
    images.push(img);

    const hist = { r: new Float64Array(bins), g: new Float64Array(bins), b: new Float64Array(bins) };
    let count = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] < 25) continue;
      const bin = (val: number) => Math.min(Math.floor(val / 256 * bins), bins - 1);
      hist.r[bin(img.data[i])]++;
      hist.g[bin(img.data[i + 1])]++;
      hist.b[bin(img.data[i + 2])]++;
      count++;
    }
    if (count > 0) {
      for (let j = 0; j < bins; j++) {
        hist.r[j] /= count;
        hist.g[j] /= count;
        hist.b[j] /= count;
      }
    }
    histograms.push(hist);
  }

  // Step 2: Compute initial barycenter
  const computeBarycenter = (hists: Array<{ r: Float64Array; g: Float64Array; b: Float64Array }>) => {
    const bary = { r: new Float64Array(bins), g: new Float64Array(bins), b: new Float64Array(bins) };
    const n = hists.length;
    for (const ch of ['r', 'g', 'b'] as const) {
      const cdfs = hists.map(h => {
        const cdf = new Float64Array(bins);
        cdf[0] = h[ch][0];
        for (let i = 1; i < bins; i++) cdf[i] = cdf[i - 1] + h[ch][i];
        return cdf;
      });
      const avgCdf = new Float64Array(bins);
      for (let i = 0; i < bins; i++) {
        for (const cdf of cdfs) avgCdf[i] += cdf[i] / n;
      }
      bary[ch][0] = avgCdf[0];
      for (let i = 1; i < bins; i++) {
        bary[ch][i] = Math.max(0, avgCdf[i] - avgCdf[i - 1]);
      }
    }
    return bary;
  };

  const distToBarycenter = (hist: typeof histograms[0], bary: typeof histograms[0]) => {
    return (wasserstein1D(hist.r, bary.r) + wasserstein1D(hist.g, bary.g) + wasserstein1D(hist.b, bary.b)) / 3;
  };

  let bary = computeBarycenter(histograms);

  // Step 3: Measure distances
  let distances = histograms.map(h => distToBarycenter(h, bary));

  // Step 4: Outlier rejection
  const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
  const variance = distances.reduce((a, d) => a + (d - mean) ** 2, 0) / distances.length;
  const stdDev = Math.sqrt(variance);

  const inlierIndices: number[] = [];
  const outlierIndices: number[] = [];

  for (let i = 0; i < distances.length; i++) {
    if (stdDev < 1e-10 || Math.abs(distances[i] - mean) <= outlierThreshold * stdDev) {
      inlierIndices.push(i);
    } else {
      outlierIndices.push(i);
    }
  }

  // Step 5: Recompute barycenter without outliers (if any were rejected)
  if (outlierIndices.length > 0 && inlierIndices.length >= 2) {
    const inlierHists = inlierIndices.map(i => histograms[i]);
    bary = computeBarycenter(inlierHists);
    distances = histograms.map(h => distToBarycenter(h, bary));
  }

  // Step 6: Select median capture (closest to barycenter among inliers)
  let medianIdx = inlierIndices[0];
  let minDist = distances[medianIdx];
  for (const idx of inlierIndices) {
    if (distances[idx] < minDist) {
      minDist = distances[idx];
      medianIdx = idx;
    }
  }

  // Step 7: Compute adaptive threshold
  // The threshold should be generous enough to accommodate the observed variance
  // but tight enough to catch real changes
  const inlierDistances = inlierIndices.map(i => distances[i]);
  const inlierMean = inlierDistances.reduce((a, b) => a + b, 0) / inlierDistances.length;
  const inlierMax = Math.max(...inlierDistances);
  const inlierStdDev = Math.sqrt(inlierDistances.reduce((a, d) => a + (d - inlierMean) ** 2, 0) / inlierDistances.length);

  // Adaptive threshold = max observed variance + 3 stddev margin
  // Converted to similarity score (1 - distance * 4)
  const adaptiveDistance = inlierMax + 3 * inlierStdDev;
  const adaptiveThreshold = Math.max(0.7, Math.min(0.98, 1 - adaptiveDistance * 4));

  const computeTimeMs = Math.round(performance.now() - startTime);

  return {
    id: `smart-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
    name,
    url,
    referencePath: screenshotPaths[medianIdx],
    capturePaths: screenshotPaths,
    barycenter: bary,
    captureDistances: distances,
    meanDistance: inlierMean,
    stdDevDistance: inlierStdDev,
    numCaptures: inlierIndices.length,
    numOutliers: outlierIndices.length,
    adaptiveThreshold,
    timestamp: new Date().toISOString(),
    computeTimeMs,
  };
}

/**
 * Compare a new screenshot against a Smart Baseline.
 *
 * Uses the barycenter's color distribution as the reference rather than
 * a single screenshot — this makes the comparison robust to the natural
 * variance observed during baseline creation.
 *
 * @param screenshotPath - Path to the new screenshot
 * @param baseline - Smart baseline to compare against
 * @param config - Wasserstein configuration
 */
export async function compareAgainstSmartBaseline(
  screenshotPath: string,
  baseline: SmartBaseline,
  config: WassersteinConfig = {},
): Promise<DistanceMetricResult & { withinVariance: boolean; varianceRatio: number }> {
  const startTime = performance.now();
  const { downscale = 0.5 } = config;
  const bins = 64;

  // Load new image and compute histogram
  const img = await loadImage(screenshotPath, downscale);
  const hist = { r: new Float64Array(bins), g: new Float64Array(bins), b: new Float64Array(bins) };
  let count = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < 25) continue;
    const bin = (val: number) => Math.min(Math.floor(val / 256 * bins), bins - 1);
    hist.r[bin(img.data[i])]++;
    hist.g[bin(img.data[i + 1])]++;
    hist.b[bin(img.data[i + 2])]++;
    count++;
  }
  if (count > 0) {
    for (let j = 0; j < bins; j++) {
      hist.r[j] /= count;
      hist.g[j] /= count;
      hist.b[j] /= count;
    }
  }

  // Compare against barycenter
  const distR = wasserstein1D(hist.r, baseline.barycenter.r);
  const distG = wasserstein1D(hist.g, baseline.barycenter.g);
  const distB = wasserstein1D(hist.b, baseline.barycenter.b);
  const distance = (distR + distG + distB) / 3;

  // Also run full Wasserstein against the reference image for spatial comparison
  const spatialResult = await computeWassersteinDistance(
    baseline.referencePath,
    screenshotPath,
    { ...config, compareMode: 'combined' },
  );

  // Combined score: 40% histogram-vs-barycenter + 60% spatial-vs-reference
  const combinedDistance = distance * 0.4 + spatialResult.distance * 0.6;
  const normalizedScore = Math.max(0, Math.min(1, 1 - combinedDistance * 4));

  // Is this within the observed variance of the baseline captures?
  const varianceRatio = baseline.stdDevDistance > 1e-10
    ? distance / baseline.stdDevDistance
    : distance < 0.001 ? 0 : 100;
  const withinVariance = varianceRatio <= 3; // Within 3 stddev of observed variance

  return {
    metric: 'sliced-wasserstein',
    distance: combinedDistance,
    normalizedScore,
    details: {
      computeTimeMs: Math.round(performance.now() - startTime),
      dimensions: { width: img.width, height: img.height },
      channelDistances: { r: distR, g: distG, b: distB, spatial: spatialResult.distance },
      transportCost: distance,
    },
    withinVariance,
    varianceRatio,
  };
}

// ══════════════════════════════════════════════════════════════
// Phase 3: Visual Transport Map
// Shows WHERE visual mass moved between two page states.
// ══════════════════════════════════════════════════════════════

export interface TransportFlow {
  /** Source grid cell */
  from: { x: number; y: number; row: number; col: number };
  /** Destination grid cell */
  to: { x: number; y: number; row: number; col: number };
  /** Amount of visual mass transported (0-1) */
  mass: number;
  /** Euclidean distance of the flow */
  distance: number;
  /** Dominant color at source (hex) */
  colorFrom: string;
  /** Dominant color at destination (hex) */
  colorTo: string;
}

export interface TransportMapResult {
  /** Grid dimensions used */
  gridSize: { rows: number; cols: number };
  /**
   * Set when the two captures are not the same shape.
   *
   * The analysis grid is derived from the BASELINE alone and then applied to
   * the comparison image unchanged, so a 393x11114 mobile full-page capture
   * measured against a 1920x1080 desktop baseline is sampled on a 1920x1080
   * grid — cell (r,c) in one image covers a completely different part of the
   * page than cell (r,c) in the other. Every number downstream is then a
   * comparison of unrelated regions, computed confidently and reported without
   * qualification. (2026-07-29)
   */
  dimensionMismatch?: {
    baseline: { width: number; height: number };
    comparison: { width: number; height: number };
    aspectRatioDelta: number;
    warning: string;
  };
  /** All transport flows (filtered to significant ones) */
  flows: TransportFlow[];
  /** Per-cell change magnitude (heatmap data) */
  heatmap: Float64Array;
  /** Total transport cost */
  totalCost: number;
  /** Regions with highest change */
  hotspots: Array<{
    region: { x: number; y: number; width: number; height: number };
    magnitude: number;
    description: string;
  }>;
  /** SVG visualization */
  svg: string;
  /** Image dimensions */
  dimensions: { width: number; height: number };
  computeTimeMs: number;
}

export interface TransportMapConfig {
  /** Grid cell size in pixels (default: 32) */
  cellSize?: number;
  /** Minimum flow mass to include (default: 0.01) */
  minFlowMass?: number;
  /** Maximum number of flows to return (default: 100) */
  maxFlows?: number;
  /** Downscale factor (default: 0.5) */
  downscale?: number;
  /** Number of hotspots to identify (default: 5) */
  numHotspots?: number;
}

/**
 * Compute a Visual Transport Map between two images.
 *
 * Divides both images into a grid, computes the color distribution
 * per cell, then solves a transport problem to determine how
 * visual mass flows from the baseline to the current state.
 *
 * The result shows:
 * - WHERE changes happened (heatmap)
 * - HOW visual content moved (flow arrows)
 * - WHAT changed most (hotspots)
 * - A rendered SVG overlay visualization
 *
 * @since v18.0.0 (Phase 3)
 * @see https://github.com/alexandriashai/cbrowser/issues/158
 */
export async function computeTransportMap(
  baselinePath: string,
  currentPath: string,
  config: TransportMapConfig = {},
): Promise<TransportMapResult> {
  const startTime = performance.now();
  const {
    cellSize = 32,
    minFlowMass = 0.01,
    maxFlows = 100,
    downscale = 0.5,
    numHotspots = 5,
  } = config;

  // Load images
  const [imgA, imgB] = await Promise.all([
    loadImage(baselinePath, downscale),
    loadImage(currentPath, downscale),
  ]);

  const scaledCellSize = Math.max(4, Math.round(cellSize * downscale));
  const rows = Math.ceil(imgA.height / scaledCellSize);
  const cols = Math.ceil(imgA.width / scaledCellSize);

  // The grid above comes from imgA only and is applied to imgB unchanged. When
  // the two captures differ in shape that makes every cell comparison a
  // comparison of unrelated regions — silently, because nothing here fails.
  const arA = imgA.width / Math.max(1, imgA.height);
  const arB = imgB.width / Math.max(1, imgB.height);
  const aspectRatioDelta = Math.abs(arA - arB);
  const sameShape = imgA.width === imgB.width && imgA.height === imgB.height;
  const dimensionMismatch = sameShape ? undefined : {
    baseline: { width: imgA.width, height: imgA.height },
    comparison: { width: imgB.width, height: imgB.height },
    aspectRatioDelta: Math.round(aspectRatioDelta * 1000) / 1000,
    warning: aspectRatioDelta > 0.1
      ? `Captures differ in shape (${imgA.width}x${imgA.height} vs ${imgB.width}x${imgB.height}, aspect-ratio delta ${aspectRatioDelta.toFixed(2)}). The analysis grid is derived from the baseline and applied to the comparison unchanged, so cells do not cover the same page regions and these results are NOT meaningful. Re-capture both at the same viewport and scope.`
      : `Captures differ in size (${imgA.width}x${imgA.height} vs ${imgB.width}x${imgB.height}) but have a similar aspect ratio, so the grid still lands on roughly corresponding regions. Treat magnitudes as approximate.`,
  };
  const numCells = rows * cols;

  // Compute per-cell color distributions
  const cellHistA = computeCellHistograms(imgA, rows, cols, scaledCellSize);
  const cellHistB = computeCellHistograms(imgB, rows, cols, scaledCellSize);

  // Compute per-cell Wasserstein distance (change magnitude)
  const heatmap = new Float64Array(numCells);
  for (let i = 0; i < numCells; i++) {
    const dR = wasserstein1D(cellHistA[i].r, cellHistB[i].r);
    const dG = wasserstein1D(cellHistA[i].g, cellHistB[i].g);
    const dB = wasserstein1D(cellHistA[i].b, cellHistB[i].b);
    heatmap[i] = (dR + dG + dB) / 3;
  }

  // Compute transport flows between cells using COLOR DISPLACEMENT
  // For each cell whose color changed significantly, find the nearest cell
  // in image B that has a similar color to what image A had at this position.
  // This shows "where did the visual content move to?"
  const flows: TransportFlow[] = [];
  let totalCost = 0;

  // Identify cells with significant change (heatmap > threshold)
  const changeThreshold = 0.005;
  const changedCells: Array<{ idx: number; row: number; col: number; magnitude: number }> = [];

  for (let i = 0; i < numCells; i++) {
    if (heatmap[i] > changeThreshold) {
      changedCells.push({ idx: i, row: Math.floor(i / cols), col: i % cols, magnitude: heatmap[i] });
    }
  }

  // For each changed cell, find where its original color went in image B
  // by looking for the nearest cell in B whose color matches A's original color
  const colorDistance = (a: string, b: string): number => {
    const parseHex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const [ra, ga, ba] = parseHex(a);
    const [rb, gb, bb] = parseHex(b);
    return Math.sqrt((ra - rb) ** 2 + (ga - gb) ** 2 + (ba - bb) ** 2) / 441.67; // normalized 0-1
  };

  const usedSinks = new Set<number>();

  for (const src of changedCells) {
    const srcColorA = cellHistA[src.idx].dominantColor; // what was here in A
    const srcColorB = cellHistB[src.idx].dominantColor; // what is here now in B

    // Skip if color barely changed
    if (colorDistance(srcColorA, srcColorB) < 0.05) continue;

    // Find the nearest cell in B that has a similar color to what A had here
    // (i.e., where did this content move to?)
    let bestMatch = -1;
    let bestScore = Infinity;
    const searchRadius = Math.max(rows, cols); // search whole image

    for (let j = 0; j < numCells; j++) {
      if (j === src.idx || usedSinks.has(j)) continue;
      const dstRow = Math.floor(j / cols);
      const dstCol = j % cols;
      const spatialDist = Math.sqrt((src.row - dstRow) ** 2 + (src.col - dstCol) ** 2);
      if (spatialDist > searchRadius) continue;
      if (spatialDist < 1) continue; // skip self-neighbors

      // How similar is B[j]'s color to A[src]'s original color?
      const colorMatch = colorDistance(srcColorA, cellHistB[j].dominantColor);
      // Prefer closer matches spatially (penalize long-distance)
      const score = colorMatch + spatialDist * 0.002;

      if (score < bestScore && colorMatch < 0.15) {
        bestScore = score;
        bestMatch = j;
      }
    }

    if (bestMatch < 0) continue;

    const dstRow = Math.floor(bestMatch / cols);
    const dstCol = bestMatch % cols;
    const spatialDist = Math.sqrt((src.row - dstRow) ** 2 + (src.col - dstCol) ** 2);

    // Skip trivially short flows (same neighborhood, probably just noise)
    if (spatialDist < 2) continue;

    const srcX = (src.col + 0.5) * scaledCellSize / downscale;
    const srcY = (src.row + 0.5) * scaledCellSize / downscale;
    const dstX = (dstCol + 0.5) * scaledCellSize / downscale;
    const dstY = (dstRow + 0.5) * scaledCellSize / downscale;
    const pixelDist = spatialDist * scaledCellSize / downscale;

    flows.push({
      from: { x: srcX, y: srcY, row: src.row, col: src.col },
      to: { x: dstX, y: dstY, row: dstRow, col: dstCol },
      mass: src.magnitude, // use heatmap magnitude as flow weight
      distance: pixelDist,
      colorFrom: srcColorA,
      colorTo: cellHistB[bestMatch].dominantColor,
    });

    totalCost += src.magnitude * spatialDist;
    usedSinks.add(bestMatch);
  }

  // Sort flows by mass and limit
  flows.sort((a, b) => b.mass - a.mass);
  const topFlows = flows.slice(0, maxFlows);

  // Identify hotspots (regions with highest change)
  const hotspots = identifyHotspots(heatmap, rows, cols, scaledCellSize, downscale, numHotspots);

  // Generate SVG visualization
  const origWidth = imgA.width / downscale;
  const origHeight = imgA.height / downscale;
  const svg = generateTransportSVG(topFlows, heatmap, rows, cols, scaledCellSize, downscale, origWidth, origHeight, hotspots);

  return {
    gridSize: { rows, cols },
    flows: topFlows,
    heatmap,
    totalCost,
    hotspots,
    svg,
    dimensions: { width: origWidth, height: origHeight },
    ...(dimensionMismatch ? { dimensionMismatch } : {}),
    computeTimeMs: Math.round(performance.now() - startTime),
  };
}

// ── Grid cell histogram computation ──

interface CellHistogram {
  r: Float64Array;
  g: Float64Array;
  b: Float64Array;
  totalMass: number;
  dominantColor: string;
}

function computeCellHistograms(
  img: RawImage,
  rows: number,
  cols: number,
  cellSize: number,
): CellHistogram[] {
  const bins = 16; // Fewer bins for per-cell (speed)
  const cells: CellHistogram[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const hist: CellHistogram = {
        r: new Float64Array(bins),
        g: new Float64Array(bins),
        b: new Float64Array(bins),
        totalMass: 0,
        dominantColor: '#000000',
      };

      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      const yStart = row * cellSize;
      const xStart = col * cellSize;
      const yEnd = Math.min(yStart + cellSize, img.height);
      const xEnd = Math.min(xStart + cellSize, img.width);

      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          const idx = (y * img.width + x) * 4;
          if (img.data[idx + 3] < 25) continue;

          const r = img.data[idx];
          const g = img.data[idx + 1];
          const b = img.data[idx + 2];

          hist.r[Math.min(Math.floor(r / 256 * bins), bins - 1)]++;
          hist.g[Math.min(Math.floor(g / 256 * bins), bins - 1)]++;
          hist.b[Math.min(Math.floor(b / 256 * bins), bins - 1)]++;

          rSum += r; gSum += g; bSum += b;
          count++;
        }
      }

      if (count > 0) {
        // Normalize to probability
        for (let i = 0; i < bins; i++) {
          hist.r[i] /= count;
          hist.g[i] /= count;
          hist.b[i] /= count;
        }
        hist.totalMass = count;
        const avgR = Math.round(rSum / count);
        const avgG = Math.round(gSum / count);
        const avgB = Math.round(bSum / count);
        hist.dominantColor = `#${avgR.toString(16).padStart(2, '0')}${avgG.toString(16).padStart(2, '0')}${avgB.toString(16).padStart(2, '0')}`;
      }

      cells.push(hist);
    }
  }

  return cells;
}

// ── Hotspot identification ──

function identifyHotspots(
  heatmap: Float64Array,
  rows: number,
  cols: number,
  cellSize: number,
  downscale: number,
  count: number,
): TransportMapResult['hotspots'] {
  // Find top-N cells by change magnitude, then merge adjacent ones
  const indexed = Array.from(heatmap).map((mag, i) => ({ mag, i }));
  indexed.sort((a, b) => b.mag - a.mag);

  const used = new Set<number>();
  const hotspots: TransportMapResult['hotspots'] = [];

  for (const { mag, i } of indexed) {
    if (hotspots.length >= count) break;
    if (mag < 0.005) break;
    if (used.has(i)) continue;

    const row = Math.floor(i / cols);
    const col = i % cols;

    // Expand hotspot to include adjacent high-change cells
    let minRow = row, maxRow = row, minCol = col, maxCol = col;
    const threshold = mag * 0.5;

    const expand = (r: number, c: number) => {
      const idx = r * cols + c;
      if (r < 0 || r >= rows || c < 0 || c >= cols || used.has(idx)) return;
      if (heatmap[idx] >= threshold) {
        used.add(idx);
        minRow = Math.min(minRow, r);
        maxRow = Math.max(maxRow, r);
        minCol = Math.min(minCol, c);
        maxCol = Math.max(maxCol, c);
        expand(r - 1, c); expand(r + 1, c);
        expand(r, c - 1); expand(r, c + 1);
      }
    };

    used.add(i);
    expand(row - 1, col); expand(row + 1, col);
    expand(row, col - 1); expand(row, col + 1);

    const x = (minCol * cellSize) / downscale;
    const y = (minRow * cellSize) / downscale;
    const w = ((maxCol - minCol + 1) * cellSize) / downscale;
    const h = ((maxRow - minRow + 1) * cellSize) / downscale;

    // Describe what kind of change
    const area = (maxRow - minRow + 1) * (maxCol - minCol + 1);
    let description: string;
    if (area > rows * cols * 0.3) {
      description = 'Major layout change across large area';
    } else if (area > 5) {
      description = `Significant visual change in ${w.toFixed(0)}×${h.toFixed(0)}px region`;
    } else {
      description = `Localized visual change at (${x.toFixed(0)}, ${y.toFixed(0)})`;
    }

    hotspots.push({
      region: { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) },
      magnitude: mag,
      description,
    });
  }

  return hotspots;
}

// ── SVG Visualization ──

function generateTransportSVG(
  flows: TransportFlow[],
  heatmap: Float64Array,
  rows: number,
  cols: number,
  cellSize: number,
  downscale: number,
  width: number,
  height: number,
  hotspots: TransportMapResult['hotspots'],
): string {
  const maxHeat = Math.max(...Array.from(heatmap), 0.001);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n`;
  svg += `  <defs>\n`;
  svg += `    <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">\n`;
  svg += `      <polygon points="0 0, 6 2, 0 4" fill="#ff6b6b" opacity="0.8"/>\n`;
  svg += `    </marker>\n`;
  svg += `  </defs>\n`;

  // Heatmap overlay
  svg += `  <g opacity="0.4">\n`;
  for (let i = 0; i < heatmap.length; i++) {
    if (heatmap[i] < 0.005) continue;
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = (col * cellSize) / downscale;
    const y = (row * cellSize) / downscale;
    const w = cellSize / downscale;
    const h = cellSize / downscale;
    const intensity = Math.min(heatmap[i] / maxHeat, 1);
    // Blue → Yellow → Red color ramp
    const r = Math.round(intensity > 0.5 ? 255 : intensity * 2 * 255);
    const g = Math.round(intensity > 0.5 ? (1 - intensity) * 2 * 255 : intensity * 2 * 200);
    const b = Math.round(intensity > 0.5 ? 0 : (1 - intensity * 2) * 255);
    svg += `    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgb(${r},${g},${b})" rx="1"/>\n`;
  }
  svg += `  </g>\n`;

  // Transport flow arrows
  svg += `  <g>\n`;
  const maxMass = Math.max(...flows.map(f => f.mass), 0.001);
  for (const flow of flows) {
    const opacity = Math.min(0.3 + (flow.mass / maxMass) * 0.6, 0.9);
    const strokeWidth = Math.max(1, (flow.mass / maxMass) * 4);
    svg += `    <line x1="${flow.from.x}" y1="${flow.from.y}" x2="${flow.to.x}" y2="${flow.to.y}" `;
    svg += `stroke="#ff6b6b" stroke-width="${strokeWidth.toFixed(1)}" opacity="${opacity.toFixed(2)}" `;
    svg += `marker-end="url(#arrowhead)"/>\n`;
  }
  svg += `  </g>\n`;

  // Hotspot outlines
  svg += `  <g fill="none" stroke="#ffd43b" stroke-width="2" stroke-dasharray="6,3">\n`;
  for (const hs of hotspots) {
    svg += `    <rect x="${hs.region.x}" y="${hs.region.y}" width="${hs.region.width}" height="${hs.region.height}" rx="4"/>\n`;
  }
  svg += `  </g>\n`;

  // Hotspot labels
  svg += `  <g font-family="system-ui, sans-serif" font-size="11" font-weight="600">\n`;
  for (let i = 0; i < hotspots.length; i++) {
    const hs = hotspots[i];
    const labelX = hs.region.x + hs.region.width + 4;
    const labelY = hs.region.y + 14;
    svg += `    <rect x="${labelX - 2}" y="${labelY - 11}" width="${hs.description.length * 6 + 8}" height="16" fill="rgba(0,0,0,0.7)" rx="3"/>\n`;
    svg += `    <text x="${labelX + 2}" y="${labelY}" fill="#ffd43b">${escapeXml(hs.description)}</text>\n`;
  }
  svg += `  </g>\n`;

  svg += `</svg>`;
  return svg;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
