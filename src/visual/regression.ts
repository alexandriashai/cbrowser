/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */


/**
 * AI Visual Regression Testing (v7.0.0)
 *
 * Capture baselines and compare screenshots using AI-powered analysis.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { VERSION } from "../version.js";
import { join } from "path";

import { CBrowser } from "../browser.js";
import { browserLaunchConfig } from "../browser-options.js";
import { resolveDevice } from "../devices.js";
import { VIEWPORT_PRESETS } from "../types.js";
import { effectiveDataDir, getPaths } from "../config.js";
import type {
  BrowserLaunchOptions,
  VisualBaseline,
  VisualChange,
  AIVisualAnalysis,
  VisualRegressionResult,
  VisualRegressionOptions,
  VisualTestSuite,
  VisualTestSuiteResult,
} from "../types.js";
import {
  computeWassersteinDistance,
  computeSmartBaseline,
  compareAgainstSmartBaseline,
  computeTransportMap,
  type WassersteinConfig,
  type SmartBaseline,
  type TransportMapResult,
  type TransportMapConfig,
} from "./distance-metrics.js";
import { uniqueStamp } from "../temp-files.js";

/**
 * Get the path to visual baselines storage
 */
function getVisualBaselinesPath(): string {
  // Per call and per account on a hosted server (v8 O3).
  const baseDir = effectiveDataDir();
  const baselinesDir = join(baseDir, "visual-baselines");
  if (!existsSync(baselinesDir)) {
    mkdirSync(baselinesDir, { recursive: true });
  }
  return baselinesDir;
}

/**
 * Get the path to visual baseline screenshots
 */
function getVisualScreenshotsPath(): string {
  const baselinesDir = getVisualBaselinesPath();
  const screenshotsDir = join(baselinesDir, "screenshots");
  if (!existsSync(screenshotsDir)) {
    mkdirSync(screenshotsDir, { recursive: true });
  }
  return screenshotsDir;
}

/**
 * Where a regression run writes its CURRENT capture. (v8 B36, 2026-10-10)
 *
 * These used to land in visual-baselines/screenshots beside the baselines, and
 * nothing ever deleted them (the v8 report counted 25 orphan current-*.png
 * there on the live server). That directory holds what a user chose to keep,
 * so no retention may sweep it. The per-account session screenshots dir is the
 * one screenshot retention already sweeps (cleanupOldScreenshotSessions, run by
 * ensureDirectories, 1 hour by default).
 */
function getCurrentCaptureDir(): string {
  const dir = getPaths().screenshotsDir;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Verdict lines on the RAW sliced Wasserstein distance (v8 B26, 2026-10-10).
 *
 * The verdict used to come from computeCombinedDistance: 0.2 x byte-diff +
 * 0.8 x Wasserstein similarity. The byte term compared COMPRESSED PNG bytes,
 * and two encodings of the same pixels share almost none of them, so the score
 * floored at ~0.80 whatever the pixels were: identical pixels re-encoded scored
 * 0.80-0.83, and robots.txt across chromium/firefox/webkit scored 0.80-0.82 while
 * its true distance was 0.00003-0.00011. "Wasserstein distance" in the output
 * was really 1 - that score. The old lines (0.7 / 0.85 / 0.98, cross-browser
 * 0.55 / 0.70) were tuned on that floored scale.
 *
 * Measured on a local corpus (Bun.serve fixtures, 1920x1080 viewport, default
 * config: 64 projections, downscale 0.5). Each pair was measured 5 times, since
 * the projections are random; rows with two corpus captures give the min-max
 * over both (10 measurements), the rest over one:
 *
 *   Same engine (chromium vs chromium)
 *     repeat capture (byte-identical) / same pixels re-encoded ... 0
 *     CTA button nudged 40px ................................. 0.000040-0.000049
 *     CTA button moved 600px ................................. 0.00048-0.00060
 *     third card clipped by horizontal overflow .............. 0.00066-0.00074
 *     font family swapped (sans -> serif) .................... 0.00085-0.00115
 *     cards pushed down 200px ................................ 0.00128-0.00207
 *     one card hidden ........................................ 0.00139-0.00170
 *     CTA button hidden ...................................... 0.00244-0.00299
 *     hero section hidden .................................... 0.0144-0.0161
 *     2600px-wide banner inserted (page overflows) ........... 0.037-0.046
 *     stylesheet missing ..................................... 0.042-0.050
 *     blank page ............................................. 0.044-0.050
 *     dark theme applied ..................................... 0.31-0.38
 *
 *   Across engines, same page, no defect (all three pairs)
 *     robots.txt (plain text) ................................ 0.00003-0.00011
 *     styled landing page .................................... 0.00020-0.00053
 *     native form controls ................................... 0.00026-0.00062
 *     13px data table ........................................ 0.00129-0.00263
 *     19px serif article ..................................... 0.00075-0.00353
 *   (the article's worst case is webkit's line-height rounding drifting the
 *   paragraphs ~10px by the bottom of the viewport: real, not a defect)
 *
 * Same engine: identical pixels measure exactly 0, so anything >= 1e-5 changed
 * (4x under the smallest break measured). Sub-element nudges stay a warning;
 * from 2.5e-4 it fails (the smallest structural break, 0.00048, is 1.9x above).
 *
 * Across engines the noise reaches 0.0035, so the pass line is 0.007 (2x the
 * worst noise) and the fail line 0.01 (2.8x; the smallest gross break measured,
 * the hidden hero at 0.0144, is 1.4x above). Named limit: element-level breaks
 * (0.0005-0.003) sit INSIDE the cross-engine noise band, so cross_browser_test
 * cannot see them in pixels; its layout-structure comparison is what can.
 */
export const VISUAL_DISTANCE_THRESHOLDS = {
  sameEngine: { warnAt: 1e-5, failAt: 2.5e-4 },
  crossEngine: { warnAt: 0.007, failAt: 0.01 },
} as const;

/**
 * Load all visual baselines from storage
 */
export function loadVisualBaselines(): VisualBaseline[] {
  const baselinesPath = getVisualBaselinesPath();
  const indexPath = join(baselinesPath, "baselines.json");

  if (!existsSync(indexPath)) {
    return [];
  }

  try {
    const data = JSON.parse(readFileSync(indexPath, "utf-8"));
    return data.baselines || [];
  } catch (e) {
    console.debug(`[CBrowser] Failed to load visual baselines: ${(e as Error).message}`);
    return [];
  }
}

/**
 * Save visual baselines to storage
 */
function saveVisualBaselines(baselines: VisualBaseline[]): void {
  const baselinesPath = getVisualBaselinesPath();
  const indexPath = join(baselinesPath, "baselines.json");

  writeFileSync(indexPath, JSON.stringify({ baselines, updated: new Date().toISOString() }, null, 2));
}

/**
 * Capture a visual baseline screenshot
 */
export async function captureVisualBaseline(
  url: string,
  name: string,
  options: BrowserLaunchOptions & {
    selector?: string;
    waitFor?: string | number;
  } = {}
): Promise<VisualBaseline> {
  // 1920x1080 unless a device or viewport says otherwise. A viewport with a
  // device now sets the size (the device used to win silently), and headless
  // and the engine reach the browser (audit D20).
  const browser = new CBrowser({
    viewportWidth: 1920,
    viewportHeight: 1080,
    ...browserLaunchConfig(options),
  });

  try {
    await browser.launch();
    await browser.navigate(url);

    // Wait if specified
    if (options.waitFor) {
      if (typeof options.waitFor === "number") {
        await new Promise(resolve => setTimeout(resolve, options.waitFor as number));
      } else {
        const page = await browser.getPage();
        await page.waitForSelector(options.waitFor, { timeout: 10000 }).catch(() => {});
      }
    }

    // Take screenshot
    const screenshotsPath = getVisualScreenshotsPath();
    // Time plus random bits (src/temp-files.ts): two captures of one name in
    // the same millisecond shared an id and a file.
    const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${uniqueStamp()}`;
    const screenshotPath = join(screenshotsPath, `${id}.png`);

    const page = await browser.getPage();

    if (options.selector) {
      const element = page.locator(options.selector).first();
      await element.screenshot({ path: screenshotPath });
    } else {
      await page.screenshot({ path: screenshotPath, fullPage: false });
    }

    // Get dimensions
    const viewport = page.viewportSize() || { width: 1920, height: 1080 };

    const baseline: VisualBaseline = {
      id,
      name,
      url,
      screenshotPath,
      dimensions: viewport,
      viewport,
      device: options.device,
      ...(options.browser ? { browser: options.browser } : {}),
      timestamp: new Date().toISOString(),
      selector: options.selector,
    };

    // Save to index
    const baselines = loadVisualBaselines();
    // Remove existing baseline with same name (update)
    const filtered = baselines.filter(b => b.name !== name);
    filtered.push(baseline);
    saveVisualBaselines(filtered);

    return baseline;
  } finally {
    await browser.close();
  }
}

/**
 * List all visual baselines
 */
export function listVisualBaselines(): VisualBaseline[] {
  return loadVisualBaselines();
}

/**
 * Get a visual baseline by name
 */
export function getVisualBaseline(name: string): VisualBaseline | undefined {
  const baselines = loadVisualBaselines();
  return baselines.find(b => b.name === name);
}

/**
 * Delete a visual baseline
 */
export function deleteVisualBaseline(name: string): boolean {
  const baselines = loadVisualBaselines();
  const baseline = baselines.find(b => b.name === name);

  if (!baseline) {
    return false;
  }

  // Delete screenshot file
  if (existsSync(baseline.screenshotPath)) {
    unlinkSync(baseline.screenshotPath);
  }

  // Update index
  const filtered = baselines.filter(b => b.name !== name);
  saveVisualBaselines(filtered);

  return true;
}

// ── Smart Baseline Storage ──

function getSmartBaselinesPath(): string {
  // Per call and per account on a hosted server (v8 O3).
  const baseDir = effectiveDataDir();
  const dir = join(baseDir, "smart-baselines");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function loadSmartBaselines(): SmartBaseline[] {
  const indexPath = join(getSmartBaselinesPath(), "smart-baselines.json");
  if (!existsSync(indexPath)) return [];
  try {
    const data = JSON.parse(readFileSync(indexPath, "utf-8"));
    // Restore Float64Arrays from JSON
    return (data.baselines || []).map((b: any) => ({
      ...b,
      barycenter: {
        r: new Float64Array(b.barycenter.r),
        g: new Float64Array(b.barycenter.g),
        b: new Float64Array(b.barycenter.b),
      },
    }));
  } catch { return []; }
}

function saveSmartBaselines(baselines: SmartBaseline[]): void {
  const indexPath = join(getSmartBaselinesPath(), "smart-baselines.json");
  // Convert Float64Arrays to regular arrays for JSON
  const serializable = baselines.map(b => ({
    ...b,
    barycenter: {
      r: Array.from(b.barycenter.r),
      g: Array.from(b.barycenter.g),
      b: Array.from(b.barycenter.b),
    },
  }));
  writeFileSync(indexPath, JSON.stringify({ baselines: serializable, updated: new Date().toISOString() }, null, 2));
}

/**
 * Resolve the `device` argument of a baseline capture.
 *
 * A device preset (devices.ts, any case or spacing: "mobile", "iPhone 15")
 * gives full emulation. Otherwise a size-only VIEWPORT_PRESETS name
 * ("desktop-sm", "tablet-lg") gives that size. Anything else is an error,
 * never a silent default. No device = {} (the caller's default size).
 */
export function resolveBaselineTarget(device: string | undefined): {
  device?: string;
  viewport?: { width: number; height: number };
} {
  if (!device) return {};
  const resolved = resolveDevice(device);
  if (!("error" in resolved)) return { device: resolved.key };
  const size = VIEWPORT_PRESETS.find((p) => p.name.toLowerCase() === device.trim().toLowerCase());
  if (size) return { viewport: { width: size.width, height: size.height } };
  const closest = resolved.suggestions.length > 0 ? ` Closest presets: ${resolved.suggestions.join(", ")}.` : "";
  throw new Error(`${resolved.error}.${closest} Viewport sizes: ${VIEWPORT_PRESETS.map((p) => p.name).join(", ")}.`);
}

/**
 * A browser for a capture target. A device keeps its emulation (user agent,
 * touch, pixel ratio); a viewport with it sets the size. Neither: 1920x1080,
 * the size baselines have always defaulted to.
 */
function browserForTarget(target: { device?: string; viewport?: { width: number; height: number } }): CBrowser {
  return new CBrowser({
    ...(target.device ? { device: target.device } : {}),
    viewportWidth: target.viewport?.width ?? 1920,
    viewportHeight: target.viewport?.height ?? 1080,
    ...(target.device && target.viewport ? { viewportOverride: target.viewport } : {}),
  });
}

/**
 * Capture a Smart Barycenter Baseline.
 *
 * Takes N screenshots of a URL with delays between captures,
 * computes the Wasserstein barycenter (optimal consensus),
 * rejects outlier captures, and selects the median reference image.
 *
 * The result is a baseline that represents the "typical" rendering —
 * robust to timing variations, dynamic content, animation states,
 * and other sources of non-deterministic rendering.
 *
 * @since v18.0.0
 * @see https://github.com/alexandriashai/cbrowser/issues/158
 */
export async function captureSmartBaseline(
  url: string,
  name: string,
  options: {
    selector?: string;
    device?: string;
    viewport?: { width: number; height: number };
    waitFor?: string | number;
    numCaptures?: number;
    captureDelay?: number;
    outlierThreshold?: number;
  } = {},
): Promise<SmartBaseline> {
  const numCaptures = options.numCaptures || 5;
  const captureDelay = options.captureDelay || 1500;

  // One meaning for a device name (audit M7): a device preset first, then a
  // size-only VIEWPORT_PRESETS name. The table that stood here mapped "mobile"
  // to 375x667 and "desktop-lg" to 2560x1440, unlike either other table.
  const target = { ...resolveBaselineTarget(options.device), ...(options.viewport ? { viewport: options.viewport } : {}) };
  const browser = browserForTarget(target);
  let renderedViewport: { width: number; height: number } | undefined;

  const screenshotsPath = join(getSmartBaselinesPath(), "screenshots");
  if (!existsSync(screenshotsPath)) mkdirSync(screenshotsPath, { recursive: true });

  const capturePaths: string[] = [];

  try {
    await browser.launch();
    await browser.navigate(url);
    renderedViewport = (await browser.getPage()).viewportSize() ?? undefined;

    // Wait if specified
    if (options.waitFor) {
      if (typeof options.waitFor === "number") {
        await new Promise(resolve => setTimeout(resolve, options.waitFor as number));
      } else {
        const page = await browser.getPage();
        await page.waitForSelector(options.waitFor, { timeout: 10000 }).catch(() => {});
      }
    }

    const page = await browser.getPage();

    // Capture N screenshots
    for (let i = 0; i < numCaptures; i++) {
      const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${uniqueStamp()}-${i}`;
      const capturePath = join(screenshotsPath, `${id}.png`);

      if (options.selector) {
        const element = page.locator(options.selector).first();
        await element.screenshot({ path: capturePath });
      } else {
        await page.screenshot({ path: capturePath, fullPage: false });
      }

      capturePaths.push(capturePath);

      // Delay between captures (except last)
      if (i < numCaptures - 1) {
        await new Promise(resolve => setTimeout(resolve, captureDelay));
      }
    }
  } finally {
    await browser.close();
  }

  // Compute smart baseline
  const baseline = await computeSmartBaseline(
    capturePaths,
    name,
    url,
    {
      downscale: 0.5,
      outlierThreshold: options.outlierThreshold || 2.0,
    },
  );

  // What it was rendered at, so the regression renders the same page. The
  // baseline stored neither, and runSmartRegression always captured at
  // 1920x1080: a mobile baseline was compared against a desktop render.
  // (audit M6, 2026-10-21)
  if (target.device) baseline.device = target.device;
  if (renderedViewport) baseline.viewport = renderedViewport;

  // Save to index
  const baselines = loadSmartBaselines();
  const filtered = baselines.filter(b => b.name !== name);
  filtered.push(baseline);
  saveSmartBaselines(filtered);

  return baseline;
}

/**
 * List all smart baselines
 */
export function listSmartBaselines(): SmartBaseline[] {
  return loadSmartBaselines();
}

/**
 * Smart baselines as `list_baselines` shows them. `visual_baseline` stores this kind,
 * and list_baselines listed only the single-screenshot store, so a baseline the
 * caller had just made never appeared (v10 B36). A summary, because the barycenter
 * histograms and per-capture paths are internal data.
 */
export function listSmartBaselineSummaries(): Array<{
  kind: "smart"; id: string; name: string; url: string; timestamp: string;
  captures: number; outliers: number; meanDistance: number; adaptiveThreshold: number;
}> {
  return loadSmartBaselines().map((b) => ({
    kind: "smart",
    id: b.id,
    name: b.name,
    url: b.url,
    timestamp: b.timestamp,
    captures: b.numCaptures,
    outliers: b.numOutliers,
    meanDistance: b.meanDistance,
    adaptiveThreshold: b.adaptiveThreshold,
  }));
}

/**
 * Get a smart baseline by name
 */
export function getSmartBaseline(name: string): SmartBaseline | undefined {
  return loadSmartBaselines().find(b => b.name === name);
}

/**
 * Delete a smart baseline and its screenshots
 */
export function deleteSmartBaseline(name: string): boolean {
  const baselines = loadSmartBaselines();
  const baseline = baselines.find(b => b.name === name);
  if (!baseline) return false;

  // Delete capture files
  for (const path of baseline.capturePaths) {
    if (existsSync(path)) unlinkSync(path);
  }

  const filtered = baselines.filter(b => b.name !== name);
  saveSmartBaselines(filtered);
  return true;
}

/**
 * Run visual regression against a smart baseline.
 *
 * Compares a new screenshot against the barycenter consensus —
 * uses the adaptive threshold computed from observed render variance,
 * so the comparison automatically adjusts to the page's stability.
 *
 * @since v18.0.0
 */
export interface SmartRegressionResult {
  baselineName: string;
  url: string;
  passed: boolean;
  analysis: AIVisualAnalysis;
  baselineScreenshot: string;
  currentScreenshot: string;
  timestamp: string;
}

export async function runSmartRegression(
  url: string,
  baselineName: string,
  options: VisualRegressionOptions & { wassersteinConfig?: WassersteinConfig } = {},
): Promise<SmartRegressionResult> {
  const baseline = getSmartBaseline(baselineName);
  if (!baseline) {
    return {
      baselineName,
      url,
      passed: false,
      analysis: {
        overallStatus: "fail",
        summary: `Smart baseline "${baselineName}" not found. Capture one first with captureSmartBaseline().`,
        changes: [],
        similarityScore: 0,
        productionReady: false,
        confidence: 1,
      },
      baselineScreenshot: "",
      currentScreenshot: "",
      timestamp: new Date().toISOString(),
    } satisfies SmartRegressionResult;
  }

  // Capture current screenshot at the baseline's own device and size (M6).
  // Baselines from before 2026-10-21 carry neither and keep 1920x1080.
  const browser = browserForTarget({ device: baseline.device, viewport: baseline.viewport });
  const region = baseline.viewport ?? { width: 1920, height: 1080 };

  // Session screenshots dir, where retention applies (v8 B36). Time plus
  // random bits: two runs in the same millisecond compared each other's capture.
  const currentPath = join(getCurrentCaptureDir(), `current-${uniqueStamp()}.png`);

  try {
    await browser.launch();
    await browser.navigate(url);
    await new Promise(resolve => setTimeout(resolve, 2000));
    const page = await browser.getPage();
    await page.screenshot({ path: currentPath, fullPage: false });
  } finally {
    await browser.close();
  }

  // Compare against smart baseline
  const result = await compareAgainstSmartBaseline(
    currentPath,
    baseline,
    options.wassersteinConfig,
  );

  // Use adaptive threshold from baseline (or override)
  const threshold = options.threshold || baseline.adaptiveThreshold;
  const passed = result.normalizedScore >= threshold;

  const changes: VisualChange[] = [];
  let overallStatus: "pass" | "warning" | "fail" = "pass";

  if (!passed) {
    if (result.normalizedScore < threshold - 0.15) {
      overallStatus = "fail";
      changes.push({
        type: "layout",
        severity: "breaking",
        region: { x: 0, y: 0, width: region.width, height: region.height },
        description: `Visual change exceeds smart baseline variance (score: ${result.normalizedScore.toFixed(3)}, threshold: ${threshold.toFixed(3)}, variance ratio: ${result.varianceRatio.toFixed(1)}σ)`,
        reasoning: result.withinVariance
          ? "Change is within observed render variance but below threshold"
          : "Change exceeds the natural variance observed during baseline creation",
        confidence: 0.92,
        suggestion: "This appears to be a real visual change, not rendering noise",
      });
    } else {
      overallStatus = "warning";
      changes.push({
        type: "content",
        severity: "warning",
        region: { x: 0, y: 0, width: region.width, height: region.height },
        description: `Marginal visual change near smart baseline threshold (score: ${result.normalizedScore.toFixed(3)}, threshold: ${threshold.toFixed(3)})`,
        reasoning: "Change is close to the boundary of expected variance",
        confidence: 0.8,
        suggestion: "May be a real change or an unusually noisy render — consider re-running",
      });
    }
  }

  const channelInfo = result.details.channelDistances
    ? ` | R: ${result.details.channelDistances.r.toFixed(4)}, G: ${result.details.channelDistances.g.toFixed(4)}, B: ${result.details.channelDistances.b.toFixed(4)}`
    : '';

  return {
    baselineName,
    url,
    passed,
    analysis: {
      overallStatus,
      summary: passed
        ? `Visual regression passed (score: ${result.normalizedScore.toFixed(3)} ≥ adaptive threshold: ${threshold.toFixed(3)}, within ${result.varianceRatio.toFixed(1)}σ of baseline variance)`
        : `Visual regression ${overallStatus}: score ${result.normalizedScore.toFixed(3)} < threshold ${threshold.toFixed(3)}`,
      changes,
      similarityScore: result.normalizedScore,
      productionReady: passed,
      confidence: 0.92,
      rawAnalysis: `Smart baseline comparison (${baseline.numCaptures} captures, ${baseline.numOutliers} outliers rejected, adaptive threshold ${threshold.toFixed(3)})${channelInfo} | ${result.details.computeTimeMs?.toFixed(0)}ms`,
    },
    baselineScreenshot: baseline.referencePath,
    currentScreenshot: currentPath,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate a Visual Transport Map between two screenshots.
 *
 * Shows WHERE visual mass moved, not just THAT it changed.
 * Produces:
 * - A heatmap of change magnitude per grid cell
 * - Flow arrows showing how content shifted
 * - Hotspot regions with the most significant changes
 * - An SVG overlay visualization
 *
 * Can be used standalone or after a regression test to visualize what changed.
 *
 * @since v18.0.0 (Phase 3)
 * @see https://github.com/alexandriashai/cbrowser/issues/158
 */
export async function generateTransportMap(
  baselinePath: string,
  currentPath: string,
  config?: TransportMapConfig,
): Promise<TransportMapResult> {
  return computeTransportMap(baselinePath, currentPath, config);
}

/**
 * Run visual regression with transport map visualization.
 *
 * Combines Phase 1 (Wasserstein distance) with Phase 3 (transport map)
 * for a complete "what changed and where" analysis.
 */
export async function runRegressionWithTransportMap(
  url: string,
  baselineName: string,
  options: VisualRegressionOptions & {
    wassersteinConfig?: WassersteinConfig;
    transportMapConfig?: TransportMapConfig;
  } = {},
): Promise<SmartRegressionResult & { transportMap?: TransportMapResult; transportMapSvgPath?: string }> {
  // Check for smart baseline first, fall back to regular
  const smartBaseline = getSmartBaseline(baselineName);
  const regularBaseline = getVisualBaseline(baselineName);

  if (!smartBaseline && !regularBaseline) {
    return {
      baselineName,
      url,
      passed: false,
      analysis: {
        overallStatus: "fail",
        summary: `Baseline "${baselineName}" not found.`,
        changes: [],
        similarityScore: 0,
        productionReady: false,
        confidence: 1,
      },
      baselineScreenshot: "",
      currentScreenshot: "",
      timestamp: new Date().toISOString(),
    };
  }

  const baselineScreenshot = smartBaseline?.referencePath || regularBaseline!.screenshotPath;

  // Capture current screenshot
  // At the baseline's device and size (M6); a regular baseline records both too.
  const captureTarget = smartBaseline
    ? { device: smartBaseline.device, viewport: smartBaseline.viewport }
    : { device: regularBaseline!.device, viewport: regularBaseline!.viewport };
  const browser = browserForTarget(captureTarget);
  // Session screenshots dir, where retention applies (v8 B36).
  const currentPath = join(getCurrentCaptureDir(), `current-${uniqueStamp()}.png`);

  try {
    await browser.launch();
    await browser.navigate(url);
    await new Promise(resolve => setTimeout(resolve, 2000));
    const page = await browser.getPage();
    await page.screenshot({ path: currentPath, fullPage: false });
  } finally {
    await browser.close();
  }

  // The pass line, resolved once and used for both the status bands below and the
  // final verdict, so they cannot disagree.
  const effectiveThreshold = options.threshold || smartBaseline?.adaptiveThreshold || 0.85;

  // `similarity` used to mean two different things depending on transportMap.
  //
  // Without the flag: runSmartRegression -> compareAgainstSmartBaseline, a
  // barycenter-histogram plus spatial-Wasserstein score, no byte term.
  // With the flag: performWassersteinAnalysis -> computeCombinedDistance with
  // weights {byteDiff: 0.2, wasserstein: 0.8}. That byte term compares COMPRESSED
  // PNG bytes, and two independent encodings of the same page share almost none of
  // them, so it measures ~0.007 instead of ~1. The combined score therefore
  // collapses to 0.2*~0 + 0.8*~1 = ~0.801, which rounds to exactly 0.80 — the
  // round number is the wasserstein weight showing through a dead term, not a
  // constant. Measured on one unchanged page: 0.8 with the flag, 0.9994 without.
  //
  // Against a 0.98 adaptive threshold that made an unchanged page fail every time
  // the flag was passed. When a smart baseline exists, score it the same way the
  // no-flag path does. (2026-07-28)
  // That fixed only this branch; the traditional branch below kept the dead byte
  // term until performWassersteinAnalysis moved to the raw distance. (v8 B26,
  // 2026-10-10)
  let analysis: AIVisualAnalysis;
  if (smartBaseline) {
    const smart = await compareAgainstSmartBaseline(currentPath, smartBaseline, options.wassersteinConfig);
    const score = smart.normalizedScore;
    // Mirrors runSmartRegression's bands and diagnostics exactly (see the
    // `if (!passed)` block in that function) so the two paths agree on status and
    // emit the same VisualChange entries, rather than this branch inventing its
    // own thresholds and returning an empty changes array.
    const smartPassed = score >= effectiveThreshold;
    const changes: VisualChange[] = [];
    let status: "pass" | "warning" | "fail" = "pass";
    if (!smartPassed) {
      if (score < effectiveThreshold - 0.15) {
        status = "fail";
        changes.push({
          type: "layout",
          severity: "breaking",
          region: { x: 0, y: 0, width: 1920, height: 1080 },
          description: `Visual change exceeds smart baseline variance (score: ${score.toFixed(3)}, threshold: ${effectiveThreshold.toFixed(3)}, variance ratio: ${smart.varianceRatio.toFixed(1)}σ)`,
          reasoning: smart.withinVariance
            ? "Change is within observed render variance but below threshold"
            : "Change exceeds the natural variance observed during baseline creation",
          confidence: 0.92,
          suggestion: "This appears to be a real visual change, not rendering noise",
        });
      } else {
        status = "warning";
        changes.push({
          type: "content",
          severity: "warning",
          region: { x: 0, y: 0, width: 1920, height: 1080 },
          description: `Marginal visual change near smart baseline threshold (score: ${score.toFixed(3)}, threshold: ${effectiveThreshold.toFixed(3)})`,
          reasoning: "Change is close to the boundary of expected variance",
          confidence: 0.8,
          suggestion: "May be a real change or an unusually noisy render — consider re-running",
        });
      }
    }
    analysis = {
      overallStatus: status,
      summary: smartPassed
        ? `Visual regression passed (score: ${score.toFixed(3)} ≥ adaptive threshold: ${effectiveThreshold.toFixed(3)}, within ${smart.varianceRatio.toFixed(1)}σ of baseline variance)`
        : `Visual regression ${status}: score ${score.toFixed(3)} < threshold ${effectiveThreshold.toFixed(3)}`,
      changes,
      similarityScore: score,
      productionReady: smartPassed,
      confidence: 0.92,
      rawAnalysis: `Smart baseline barycenter comparison (${smartBaseline.numCaptures} captures, adaptive threshold ${smartBaseline.adaptiveThreshold.toFixed(3)})`,
    };
  } else {
    analysis = await performWassersteinAnalysis(baselineScreenshot, currentPath, options);
  }

  // Generate transport map
  const transportMap = await computeTransportMap(baselineScreenshot, currentPath, options.transportMapConfig);

  // Save SVG to disk
  let transportMapSvgPath: string | undefined; // eslint-disable-line prefer-const
  // Per call and per account on a hosted server (v8 O3).
  const baseDir = effectiveDataDir();
  const mapsDir = join(baseDir, "transport-maps");
  if (!existsSync(mapsDir)) mkdirSync(mapsDir, { recursive: true });
  transportMapSvgPath = join(mapsDir, `transport-map-${uniqueStamp()}.svg`);
  writeFileSync(transportMapSvgPath, transportMap.svg);

  // Enhance analysis summary with transport map data
  const hotspotSummary = transportMap.hotspots.length > 0
    ? ` | Hotspots: ${transportMap.hotspots.map(h => h.description).join('; ')}`
    : '';

  // Was `options.threshold || 0.85`, while the MCP payload printed the smart
  // baseline's adaptiveThreshold (0.98) as though that were the pass line, so
  // pass/fail was decided against a number the caller was never shown.
  const threshold = effectiveThreshold;
  // On the real distance a moved button scores ~0.998 similarity, over any
  // similarity line, while the distance verdict fails it; so a "fail" verdict
  // fails here too, as it already does in runVisualRegression. A smart "fail"
  // is always below its threshold, so that branch is unchanged. (v8 B26,
  // 2026-10-10)
  const passed = analysis.similarityScore >= threshold && analysis.overallStatus !== "fail";

  return {
    baselineName,
    url,
    passed,
    analysis: {
      ...analysis,
      summary: analysis.summary + hotspotSummary,
      rawAnalysis: (analysis.rawAnalysis || '') + ` | Transport map: ${transportMap.flows.length} flows, ${transportMap.hotspots.length} hotspots, cost ${transportMap.totalCost.toFixed(4)}, ${transportMap.computeTimeMs.toFixed(0)}ms`,
    },
    baselineScreenshot,
    currentScreenshot: currentPath,
    timestamp: new Date().toISOString(),
    transportMap,
    transportMapSvgPath,
  };
}

/**
 * Analyze visual differences using AI
 */
export async function analyzeVisualDifferences(
  baselinePath: string,
  currentPath: string,
  options: VisualRegressionOptions = {}
): Promise<AIVisualAnalysis> {
  // Read both images as base64
  const baselineImage = readFileSync(baselinePath).toString("base64");
  const currentImage = readFileSync(currentPath).toString("base64");

  // Build the AI prompt for analysis
  const sensitivityDesc = {
    low: "Only flag significant, obvious changes that would clearly impact users",
    medium: "Flag notable changes in layout, content, or style",
    high: "Flag any visible differences, including subtle spacing or color changes",
  };

  const prompt = `You are a visual regression testing AI. Compare these two screenshots and identify any differences.

BASELINE IMAGE: The first/reference screenshot
CURRENT IMAGE: The second/new screenshot

Sensitivity level: ${options.sensitivity || "medium"} - ${sensitivityDesc[options.sensitivity || "medium"]}

${options.ignoreRegions?.length ? `Ignore changes in these regions: ${JSON.stringify(options.ignoreRegions)}` : ""}

Analyze the visual differences and respond in this exact JSON format:
{
  "overallStatus": "pass" | "warning" | "fail",
  "summary": "Brief 1-2 sentence summary of changes found",
  "changes": [
    {
      "type": "layout" | "content" | "style" | "missing" | "added" | "moved",
      "severity": "breaking" | "warning" | "info" | "acceptable",
      "region": { "x": 0, "y": 0, "width": 100, "height": 100 },
      "description": "What changed",
      "reasoning": "Why this matters",
      "confidence": 0.95,
      "suggestion": "Optional suggestion to fix or accept"
    }
  ],
  "similarityScore": 0.85,
  "productionReady": true | false,
  "confidence": 0.9
}

Change severity guidelines:
- "breaking": Layout shifts, missing critical elements, broken functionality indicators
- "warning": Noticeable content changes, significant style differences
- "info": Minor spacing changes, subtle color adjustments
- "acceptable": Expected dynamic content (timestamps, ads), minor rendering differences

For overallStatus:
- "pass": No changes or only acceptable/info-level changes
- "warning": Some warning-level changes that should be reviewed
- "fail": Any breaking changes detected

Respond ONLY with the JSON, no other text.`;

  // Use Claude to analyze the images
  // For now, we'll use a simulated response since we don't have direct API access
  // In production, this would call the Anthropic API with vision

  try {
    // Try to use the inference tool if available
    const { execSync: _execSync } = await import("child_process");
    const inferenceScript = join(process.env.HOME || "", ".claude/skills/Tools/Inference.ts");

    if (existsSync(inferenceScript)) {
      // Create a temporary file with the images and prompt
      const tempDir = join(getVisualBaselinesPath(), "temp");
      if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
      }

      const requestPath = join(tempDir, `analysis-${uniqueStamp()}.json`);
      writeFileSync(requestPath, JSON.stringify({
        prompt,
        images: [
          { type: "base64", media_type: "image/png", data: baselineImage },
          { type: "base64", media_type: "image/png", data: currentImage },
        ],
      }));

      // Use Wasserstein-enhanced analysis (v18.0.0) with byte-diff fallback
      const distanceMetric = (options as any).distanceMetric || 'wasserstein';
      const analysis = distanceMetric === 'wasserstein' || distanceMetric === 'combined'
        ? await performWassersteinAnalysis(baselinePath, currentPath, options).catch(() => performHeuristicAnalysis(baselinePath, currentPath, options))
        : performHeuristicAnalysis(baselinePath, currentPath, options);

      // Clean up
      if (existsSync(requestPath)) {
        unlinkSync(requestPath);
      }

      return analysis;
    }
  } catch (e) {
    console.debug(`[CBrowser] AI visual analysis failed, using heuristics: ${(e as Error).message}`);
  }

  // Fallback: Use Wasserstein if available, byte-diff otherwise
  try {
    return await performWassersteinAnalysis(baselinePath, currentPath, options);
  } catch {
    return performHeuristicAnalysis(baselinePath, currentPath, options);
  }
}

/**
 * Perform heuristic visual analysis when AI is not available.
 * Uses byte-level PNG comparison for more accurate results than file-size-only.
 */
function performHeuristicAnalysis(
  baselinePath: string,
  currentPath: string,
  options: VisualRegressionOptions = {}
): AIVisualAnalysis {
  const baselineBuffer = readFileSync(baselinePath);
  const currentBuffer = readFileSync(currentPath);

  // Byte-level comparison of the full PNG data
  const minLength = Math.min(baselineBuffer.length, currentBuffer.length);
  const maxLength = Math.max(baselineBuffer.length, currentBuffer.length);

  let differentBytes = 0;
  for (let i = 0; i < minLength; i++) {
    if (baselineBuffer[i] !== currentBuffer[i]) {
      differentBytes++;
    }
  }
  // Bytes beyond the shorter file are all different
  differentBytes += maxLength - minLength;

  const diffRatio = differentBytes / maxLength;
  // Similarity is the inverse of the difference ratio
  // Apply a curve: small byte differences should still show high similarity
  const rawSimilarity = 1 - diffRatio;
  // Scale similarity: anything above 0.95 raw is essentially identical
  // Below that, scale proportionally
  let similarityScore: number;
  if (rawSimilarity >= 0.99) {
    similarityScore = 1.0;
  } else if (rawSimilarity >= 0.95) {
    similarityScore = 0.90 + (rawSimilarity - 0.95) * 2.5; // 0.90-1.0
  } else if (rawSimilarity >= 0.80) {
    similarityScore = 0.65 + (rawSimilarity - 0.80) * 1.667; // 0.65-0.90
  } else {
    similarityScore = rawSimilarity * 0.8125; // 0.0-0.65
  }

  // Round to 2 decimals
  similarityScore = Math.round(similarityScore * 100) / 100;

  const changes: VisualChange[] = [];
  let overallStatus: "pass" | "warning" | "fail" = "pass";

  if (similarityScore < 0.7) {
    changes.push({
      type: "layout",
      severity: "breaking",
      region: { x: 0, y: 0, width: 1920, height: 1080 },
      description: `Significant visual differences detected (${(diffRatio * 100).toFixed(1)}% bytes differ)`,
      reasoning: "Byte-level comparison shows substantial differences in rendered content",
      confidence: 0.8,
      suggestion: "Review the visual changes manually",
    });
    overallStatus = "fail";
  } else if (similarityScore < 0.85) {
    changes.push({
      type: "content",
      severity: "warning",
      region: { x: 0, y: 0, width: 1920, height: 1080 },
      description: `Moderate visual differences detected (${(diffRatio * 100).toFixed(1)}% bytes differ)`,
      reasoning: "Byte-level comparison shows moderate differences",
      confidence: 0.7,
      suggestion: "Review to confirm changes are expected",
    });
    overallStatus = "warning";
  } else if (similarityScore < 0.98) {
    changes.push({
      type: "style",
      severity: "info",
      region: { x: 0, y: 0, width: 1920, height: 1080 },
      description: `Minor visual differences detected (${(diffRatio * 100).toFixed(1)}% bytes differ)`,
      reasoning: "Byte-level comparison shows minor rendering differences",
      confidence: 0.6,
    });
  }

  // Apply sensitivity adjustments
  if (options.sensitivity === "low" && overallStatus === "warning") {
    overallStatus = "pass";
  } else if (options.sensitivity === "high" && changes.length === 0 && diffRatio > 0.005) {
    changes.push({
      type: "style",
      severity: "info",
      region: { x: 0, y: 0, width: 1920, height: 1080 },
      description: "Very minor visual change detected",
      reasoning: "Slight byte-level differences at high sensitivity",
      confidence: 0.4,
    });
    similarityScore = Math.min(similarityScore, 0.95);
  }

  // v11.10.0: Cross-browser mode for expected font/rendering differences (issue #93)
  // v14.2.4: Relaxed thresholds - font/anti-aliasing differences are expected between browser engines
  // v14.2.5: Further relaxed for extreme font differences (WebKit vs Chromium can differ 40%+)
  // Cross-browser comparisons naturally have font rendering differences
  if ((options as any).crossBrowser) {
    // Relax thresholds for cross-browser - font differences are expected
    // WebKit and Chromium use different font rendering engines with different anti-aliasing
    if (overallStatus === "fail" && similarityScore >= 0.40) {
      // Bump fail → warning if similarity is reasonable (lowered from 0.55)
      overallStatus = "warning";
      if (changes.length > 0) {
        changes[0].severity = "warning";
        changes[0].description = `Cross-browser rendering differences detected (${(diffRatio * 100).toFixed(1)}% bytes differ)`;
        changes[0].reasoning = "Font rendering and anti-aliasing naturally differ between browser engines";
        changes[0].suggestion = "These differences are typically expected in cross-browser testing";
      }
    }
    if (overallStatus === "warning" && similarityScore >= 0.55) {
      // Bump warning → pass for reasonable similarity cross-browser (lowered from 0.70)
      overallStatus = "pass";
      if (changes.length > 0) {
        changes[0].severity = "acceptable";
        changes[0].description = `Minor cross-browser rendering differences (${(diffRatio * 100).toFixed(1)}% bytes differ)`;
        changes[0].reasoning = "Expected font and anti-aliasing differences between browser engines";
      }
    }
  }

  return {
    overallStatus,
    summary: changes.length === 0
      ? "No significant visual changes detected"
      : `Found ${changes.length} visual change(s) with ${overallStatus} status`,
    changes,
    similarityScore,
    productionReady: overallStatus !== "fail",
    confidence: 0.75, // Higher confidence than old file-size heuristic
    rawAnalysis: "Byte-level PNG comparison (AI analysis not available)",
  };
}

/**
 * Perform Wasserstein-enhanced visual analysis.
 * Uses Sliced Wasserstein Distance for robust comparison that handles
 * sub-pixel shifts, anti-aliasing, and font rendering differences.
 *
 * @since v18.0.0
 * @see https://github.com/alexandriashai/cbrowser/issues/158
 */
async function performWassersteinAnalysis(
  baselinePath: string,
  currentPath: string,
  options: VisualRegressionOptions & { wassersteinConfig?: WassersteinConfig } = {}
): Promise<AIVisualAnalysis> {
  // The raw sliced Wasserstein distance, not computeCombinedDistance: its byte
  // term compared compressed PNG bytes and floored every score near 0.80. See
  // VISUAL_DISTANCE_THRESHOLDS for the measurements. (v8 B26, 2026-10-10)
  const result = await computeWassersteinDistance(
    baselinePath,
    currentPath,
    {
      // numProjections and the projection seed: the registered defaults
      // (provenance/visual-distance.ts).
      compareMode: 'combined',
      downscale: 0.5,
      ignoreRegions: options.ignoreRegions,
      ...options.wassersteinConfig,
    }
  );

  const crossBrowser = Boolean((options as { crossBrowser?: boolean }).crossBrowser);
  const lines = crossBrowser ? VISUAL_DISTANCE_THRESHOLDS.crossEngine : VISUAL_DISTANCE_THRESHOLDS.sameEngine;
  const distance = result.distance;
  // 4 significant figures: the interesting range starts at 1e-5, which a fixed
  // 4-decimal rounding would print as 0.
  const wassersteinDistance = Number(distance.toPrecision(4));
  const shown = distance.toPrecision(3);
  // 4 decimals, not 2: on the real distance a moved button is 0.9978, which 2
  // decimals rounded to a misleading 1.
  const similarityScore = Math.round(result.normalizedScore * 10000) / 10000;
  const scope = crossBrowser ? "beyond cross-engine rendering noise" : "between the two captures";
  const changes: VisualChange[] = [];
  let overallStatus: "pass" | "warning" | "fail" = "pass";

  if (distance >= lines.failAt) {
    changes.push({
      type: "layout",
      severity: "breaking",
      region: { x: 0, y: 0, width: 1920, height: 1080 },
      description: `Visual change ${scope} (sliced Wasserstein distance ${shown}, fail line ${lines.failAt})`,
      reasoning: crossBrowser
        ? "More visual mass moved than engine differences in fonts and anti-aliasing account for"
        : "Optimal transport analysis shows visual content moved, appeared or disappeared",
      confidence: 0.9,
      suggestion: "Review the visual changes manually — layout or content has materially changed",
    });
    overallStatus = "fail";
  } else if (distance >= lines.warnAt) {
    changes.push({
      type: "content",
      severity: "warning",
      region: { x: 0, y: 0, width: 1920, height: 1080 },
      description: `Minor visual change ${scope} (sliced Wasserstein distance ${shown}, warning line ${lines.warnAt})`,
      reasoning: crossBrowser
        ? "Above the cross-engine noise measured on text-heavy pages, below a gross break"
        : "The captures differ, but by less than any structural break measured",
      confidence: 0.85,
      suggestion: "Review to confirm changes are expected",
    });
    overallStatus = "warning";
  }

  // Sensitivity adjustments. High flags any capture that is not pixel-identical;
  // between engines that is every capture, which is what "flag any visible
  // difference" asks for.
  if (options.sensitivity === "low" && overallStatus === "warning") {
    overallStatus = "pass";
  } else if (options.sensitivity === "high" && changes.length === 0 && distance > 0) {
    changes.push({
      type: "style",
      severity: "info",
      region: { x: 0, y: 0, width: 1920, height: 1080 },
      description: `Very minor visual change detected by Wasserstein analysis (sliced Wasserstein distance ${shown})`,
      reasoning: "Slight distribution shift detected at high sensitivity",
      confidence: 0.5,
    });
    overallStatus = "warning";
  }

  const channelInfo = result.details.channelDistances
    ? ` | R: ${result.details.channelDistances.r.toFixed(4)}, G: ${result.details.channelDistances.g.toFixed(4)}, B: ${result.details.channelDistances.b.toFixed(4)}, Spatial: ${result.details.channelDistances.spatial.toFixed(4)}`
    : '';

  return {
    overallStatus,
    summary: changes.length === 0
      ? `No significant visual changes detected (sliced Wasserstein distance ${shown}, similarity ${similarityScore})`
      : `Found ${changes.length} visual change(s) with ${overallStatus} status (sliced Wasserstein distance ${shown})`,
    changes,
    similarityScore,
    wassersteinDistance,
    productionReady: overallStatus !== "fail",
    confidence: 0.9, // Higher than byte-diff (0.75) — Wasserstein is more robust
    rawAnalysis: `Sliced Wasserstein Distance analysis (${result.details.numProjections} projections, ${result.details.computeTimeMs?.toFixed(0)}ms, distance ${shown}, ${crossBrowser ? "cross-engine" : "same-engine"} lines warn ${lines.warnAt} / fail ${lines.failAt})${channelInfo}`,
  };
}

/**
 * Run visual regression test against a baseline
 */
export async function runVisualRegression(
  url: string,
  baselineName: string,
  options: VisualRegressionOptions = {}
): Promise<VisualRegressionResult> {
  const startTime = Date.now();
  const baseline = getVisualBaseline(baselineName);

  if (!baseline) {
    return {
      passed: false,
      baseline: null as unknown as VisualBaseline,
      currentScreenshotPath: "",
      analysis: {
        overallStatus: "fail",
        summary: `Baseline "${baselineName}" not found`,
        changes: [],
        similarityScore: 0,
        productionReady: false,
        confidence: 1.0,
      },
      duration: Date.now() - startTime,
    };
  }

  // Capture current screenshot with same settings as baseline: its device,
  // size and engine. The size is an explicit viewport, so a baseline captured
  // with a device AND a size renders at that size again.
  const browser = new CBrowser(browserLaunchConfig({
    headless: options.headless,
    browser: baseline.browser,
    device: baseline.device,
    viewport: baseline.viewport,
  }));

  try {
    await browser.launch();
    await browser.navigate(url);

    // Wait if specified in options
    if (options.waitBeforeCapture) {
      await new Promise(resolve => setTimeout(resolve, options.waitBeforeCapture));
    }

    // Take screenshot, into the session screenshots dir, where retention
    // applies (v8 B36).
    const screenshotsPath = getCurrentCaptureDir();
    const currentScreenshotPath = join(screenshotsPath, `current-${baseline.id}-${uniqueStamp()}.png`);

    const page = await browser.getPage();

    if (baseline.selector) {
      const element = page.locator(baseline.selector).first();
      await element.screenshot({ path: currentScreenshotPath });
    } else {
      await page.screenshot({ path: currentScreenshotPath, fullPage: false });
    }

    // Analyze differences
    const analysis = await analyzeVisualDifferences(baseline.screenshotPath, currentScreenshotPath, options);

    // Determine pass/fail based on threshold
    const threshold = options.threshold ?? 0.9;
    const passed = analysis.similarityScore >= threshold && analysis.overallStatus !== "fail";

    // Generate diff image path (if we had pixel-diff capability)
    const diffImagePath = options.generateDiff
      ? join(screenshotsPath, `diff-${baseline.id}-${Date.now()}.png`)
      : undefined;

    return {
      passed,
      baseline,
      currentScreenshotPath,
      diffImagePath,
      analysis,
      duration: Date.now() - startTime,
    };
  } finally {
    await browser.close();
  }
}

/**
 * Run visual regression on multiple pages
 */
export async function runVisualRegressionSuite(
  suite: VisualTestSuite,
  options: VisualRegressionOptions = {}
): Promise<VisualTestSuiteResult> {
  const startTime = Date.now();
  const results: VisualRegressionResult[] = [];
  let passed = 0;
  let failed = 0;
  let warnings = 0;

  console.log(`\n🔍 Running visual regression suite: ${suite.name}`);
  console.log(`   Testing ${suite.pages.length} page(s)...\n`);

  for (const page of suite.pages) {
    console.log(`   📸 Testing: ${page.name}...`);

    const result = await runVisualRegression(
      page.url,
      page.baselineName,
      { ...options, ...page.options }
    );

    results.push(result);

    if (result.passed) {
      if (result.analysis.overallStatus === "warning") {
        warnings++;
        console.log(`      ⚠️  Warning (similarity: ${(result.analysis.similarityScore * 100).toFixed(1)}%)`);
      } else {
        passed++;
        console.log(`      ✅ Passed (similarity: ${(result.analysis.similarityScore * 100).toFixed(1)}%)`);
      }
    } else {
      failed++;
      console.log(`      ❌ Failed: ${result.analysis.summary}`);
    }
  }

  const duration = Date.now() - startTime;

  console.log(`\n${"─".repeat(60)}`);
  console.log(`   Results: ${passed} passed, ${failed} failed, ${warnings} warnings`);
  console.log(`   Duration: ${(duration / 1000).toFixed(1)}s`);
  console.log(`${"─".repeat(60)}\n`);

  return {
    suite,
    results,
    summary: {
      total: suite.pages.length,
      passed,
      failed,
      warnings,
    },
    duration,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format visual regression result as text report
 */
export function formatVisualRegressionReport(result: VisualRegressionResult): string {
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════════════════════════════════╗");
  lines.push("║                      AI VISUAL REGRESSION REPORT                             ║");
  lines.push("╚══════════════════════════════════════════════════════════════════════════════╝");
  lines.push("");

  const statusIcon = result.passed ? "✅" : "❌";
  const statusText = result.passed ? "PASSED" : "FAILED";

  lines.push(`${statusIcon} Status: ${statusText}`);
  lines.push(`📊 Similarity: ${(result.analysis.similarityScore * 100).toFixed(1)}%`);
  lines.push(`🎯 Confidence: ${(result.analysis.confidence * 100).toFixed(0)}%`);
  lines.push(`⏱️  Duration: ${(result.duration / 1000).toFixed(2)}s`);
  lines.push("");

  if (result.baseline) {
    lines.push("───────────────────────────────────────────────────────────────────────────────");
    lines.push("📸 BASELINE INFO");
    lines.push("───────────────────────────────────────────────────────────────────────────────");
    lines.push(`   Name: ${result.baseline.name}`);
    lines.push(`   URL: ${result.baseline.url}`);
    lines.push(`   Captured: ${result.baseline.timestamp}`);
    lines.push(`   Viewport: ${result.baseline.viewport.width}x${result.baseline.viewport.height}`);
    if (result.baseline.device) {
      lines.push(`   Device: ${result.baseline.device}`);
    }
    lines.push("");
  }

  lines.push("───────────────────────────────────────────────────────────────────────────────");
  lines.push("📝 ANALYSIS SUMMARY");
  lines.push("───────────────────────────────────────────────────────────────────────────────");
  lines.push(`   ${result.analysis.summary}`);
  lines.push("");

  if (result.analysis.changes.length > 0) {
    lines.push("───────────────────────────────────────────────────────────────────────────────");
    lines.push("🔄 DETECTED CHANGES");
    lines.push("───────────────────────────────────────────────────────────────────────────────");

    for (const change of result.analysis.changes) {
      const severityIcon = {
        breaking: "🚨",
        warning: "⚠️",
        info: "ℹ️",
        acceptable: "✓",
      }[change.severity];

      lines.push("");
      lines.push(`   ${severityIcon} [${change.severity.toUpperCase()}] ${change.type}`);
      lines.push(`      ${change.description}`);
      lines.push(`      Reasoning: ${change.reasoning}`);
      if (change.suggestion) {
        lines.push(`      Suggestion: ${change.suggestion}`);
      }
    }
    lines.push("");
  }

  lines.push("───────────────────────────────────────────────────────────────────────────────");
  lines.push(`🚀 Production Ready: ${result.analysis.productionReady ? "YES" : "NO"}`);
  lines.push("───────────────────────────────────────────────────────────────────────────────");

  return lines.join("\n");
}

/**
 * Generate HTML report for visual regression suite
 */
export function generateVisualRegressionHtmlReport(suiteResult: VisualTestSuiteResult): string {
  const { suite, results, summary, duration, timestamp } = suiteResult;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Visual Regression Report - ${suite.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #e2e8f0; line-height: 1.6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.25rem; margin-bottom: 1rem; color: #94a3b8; }
    .header { text-align: center; margin-bottom: 2rem; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 2rem; }
    .stat { background: #1e293b; padding: 1.5rem; border-radius: 0.5rem; text-align: center; }
    .stat-value { font-size: 2rem; font-weight: bold; }
    .stat-label { color: #94a3b8; font-size: 0.875rem; }
    .passed { color: #22c55e; }
    .failed { color: #ef4444; }
    .warning { color: #eab308; }
    .results { display: flex; flex-direction: column; gap: 1rem; }
    .result-card { background: #1e293b; border-radius: 0.5rem; overflow: hidden; }
    .result-header { padding: 1rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; }
    .result-body { padding: 1rem; }
    .badge { padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .badge-pass { background: #166534; color: #22c55e; }
    .badge-fail { background: #7f1d1d; color: #ef4444; }
    .badge-warning { background: #713f12; color: #eab308; }
    .similarity { font-size: 1.5rem; font-weight: bold; }
    .changes { margin-top: 1rem; }
    .change { padding: 0.75rem; background: #0f172a; border-radius: 0.25rem; margin-bottom: 0.5rem; }
    .change-breaking { border-left: 3px solid #ef4444; }
    .change-warning { border-left: 3px solid #eab308; }
    .change-info { border-left: 3px solid #3b82f6; }
    .change-acceptable { border-left: 3px solid #22c55e; }
    footer { text-align: center; color: #64748b; margin-top: 2rem; padding-top: 2rem; border-top: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔍 Visual Regression Report</h1>
      <h2>${suite.name}</h2>
      <p style="color: #64748b;">Generated: ${new Date(timestamp).toLocaleString()}</p>
    </div>

    <div class="summary">
      <div class="stat">
        <div class="stat-value">${summary.total}</div>
        <div class="stat-label">Total Tests</div>
      </div>
      <div class="stat">
        <div class="stat-value passed">${summary.passed}</div>
        <div class="stat-label">Passed</div>
      </div>
      <div class="stat">
        <div class="stat-value failed">${summary.failed}</div>
        <div class="stat-label">Failed</div>
      </div>
      <div class="stat">
        <div class="stat-value warning">${summary.warnings}</div>
        <div class="stat-label">Warnings</div>
      </div>
    </div>

    <div class="results">
      ${results.map((result, i) => {
        const page = suite.pages[i];
        const statusClass = result.passed ? (result.analysis.overallStatus === "warning" ? "warning" : "passed") : "failed";
        const badgeClass = result.passed ? (result.analysis.overallStatus === "warning" ? "badge-warning" : "badge-pass") : "badge-fail";
        const statusText = result.passed ? (result.analysis.overallStatus === "warning" ? "WARNING" : "PASSED") : "FAILED";

        return `
          <div class="result-card">
            <div class="result-header">
              <div>
                <strong>${page.name}</strong>
                <div style="color: #64748b; font-size: 0.875rem;">${page.url}</div>
              </div>
              <div style="display: flex; align-items: center; gap: 1rem;">
                <div class="similarity ${statusClass}">${(result.analysis.similarityScore * 100).toFixed(1)}%</div>
                <span class="badge ${badgeClass}">${statusText}</span>
              </div>
            </div>
            <div class="result-body">
              <p>${result.analysis.summary}</p>
              ${result.analysis.changes.length > 0 ? `
                <div class="changes">
                  ${result.analysis.changes.map(change => `
                    <div class="change change-${change.severity}">
                      <strong>[${change.severity.toUpperCase()}] ${change.type}</strong>
                      <p>${change.description}</p>
                      ${change.suggestion ? `<p style="color: #94a3b8;"><em>Suggestion: ${change.suggestion}</em></p>` : ""}
                    </div>
                  `).join("")}
                </div>
              ` : ""}
            </div>
          </div>
        `;
      }).join("")}
    </div>

    <footer>
      Generated by CBrowser v${VERSION} | Suite completed in ${(duration / 1000).toFixed(1)}s
    </footer>
  </div>
</body>
</html>`;
}
