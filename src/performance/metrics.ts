/**
 * CBrowser - Cognitive Browser Automation
 * 
 * Copyright (c) 2026 WF Media (Alexandria Eden)
 * Email: alexandria.shai.eden@gmail.com
 * 
 * This source code is licensed under the Business Source License 1.1
 * found in the LICENSE file in the root directory of this source tree.
 * 
 * Non-production use is permitted. Production use requires a commercial license.
 * See LICENSE for full terms.
 */


/**
 * Performance Regression Detection (v6.4.0)
 *
 * Performance baseline management and regression detection for CBrowser.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { CBrowser } from "../browser.js";
import { getPaths, ensureDirectories } from "../config.js";
import type {
  PerformanceBaseline,
  PerformanceRegressionThresholds,
  MetricRegression,
  PerformanceComparison,
  PerformanceRegressionResult,
  PerformanceMetrics,
  SensitivityProfile,
  DualThreshold,
} from "../types.js";

// ============================================================================
// Constants
// ============================================================================

const _DEFAULT_REGRESSION_THRESHOLDS: PerformanceRegressionThresholds = {
  lcp: 20,      // 20% increase
  fid: 50,      // 50% increase
  cls: 0.1,     // Absolute increase of 0.1
  fcp: 20,      // 20% increase
  ttfb: 30,     // 30% increase
  tti: 25,      // 25% increase
  tbt: 50,      // 50% increase
  transferSize: 25, // 25% increase
};

// ============================================================================
// Sensitivity Profiles (v16.11.0)
// ============================================================================
//
// DUAL THRESHOLD SYSTEM: Both percentage AND absolute change must be exceeded.
// This prevents false positives from:
// - Sub-50ms jitter on fast pages (% threshold met but absolute not)
// - Large % on already-slow pages (absolute threshold met but not significant)
//
// PROFILE SELECTION GUIDE:
// - strict:  Dedicated perf testing environments, pre-release gates
// - normal:  Local development, manual verification
// - ci:      Automated CI/CD pipelines (accounts for VM/container overhead)
// - lenient: Development with known performance issues, debugging
//
export const SENSITIVITY_PROFILES: Record<string, SensitivityProfile> = {
  strict: {
    name: "strict",
    // Use for: Dedicated perf environments, pre-release quality gates
    // Catches: 10% FCP regression over 50ms absolute change
    thresholds: {
      fcp:          { percent: 10,  minAbsolute: 50 },
      lcp:          { percent: 10,  minAbsolute: 100 },
      ttfb:         { percent: 15,  minAbsolute: 30 },
      cls:          { percent: 10,  minAbsolute: 0.02 },
      tti:          { percent: 15,  minAbsolute: 100 },
      tbt:          { percent: 20,  minAbsolute: 50 },
      fid:          { percent: 25,  minAbsolute: 20 },
      transferSize: { percent: 15,  minAbsolute: 10240 },  // 10KB
    },
  },
  normal: {
    name: "normal",
    // Use for: Local development, manual verification
    // Catches: 20% FCP regression over 100ms absolute change
    thresholds: {
      fcp:          { percent: 20,  minAbsolute: 100 },
      lcp:          { percent: 20,  minAbsolute: 200 },
      ttfb:         { percent: 20,  minAbsolute: 50 },
      cls:          { percent: 20,  minAbsolute: 0.05 },
      tti:          { percent: 25,  minAbsolute: 200 },
      tbt:          { percent: 50,  minAbsolute: 100 },
      fid:          { percent: 50,  minAbsolute: 50 },
      transferSize: { percent: 25,  minAbsolute: 51200 },  // 50KB
    },
  },
  // v16.11.0: Added CI-specific profile with higher absolute thresholds
  // CI environments have variable baseline due to shared resources
  ci: {
    name: "ci",
    // Use for: GitHub Actions, GitLab CI, Jenkins, etc.
    // Accounts for: VM cold start, shared resources, network variability
    // Catches: 25% FCP regression over 150ms absolute change
    thresholds: {
      fcp:          { percent: 25,  minAbsolute: 150 },
      lcp:          { percent: 25,  minAbsolute: 300 },
      ttfb:         { percent: 25,  minAbsolute: 75 },
      cls:          { percent: 25,  minAbsolute: 0.08 },
      tti:          { percent: 30,  minAbsolute: 300 },
      tbt:          { percent: 50,  minAbsolute: 150 },
      fid:          { percent: 50,  minAbsolute: 75 },
      transferSize: { percent: 25,  minAbsolute: 76800 },  // 75KB
    },
  },
  lenient: {
    name: "lenient",
    // Use for: Development with known issues, debugging, explorations
    // Catches: 30% FCP regression over 200ms absolute change
    thresholds: {
      fcp:          { percent: 30,  minAbsolute: 200 },
      lcp:          { percent: 30,  minAbsolute: 400 },
      ttfb:         { percent: 30,  minAbsolute: 100 },
      cls:          { percent: 30,  minAbsolute: 0.1 },
      tti:          { percent: 30,  minAbsolute: 400 },
      tbt:          { percent: 50,  minAbsolute: 200 },
      fid:          { percent: 50,  minAbsolute: 100 },
      transferSize: { percent: 30,  minAbsolute: 102400 }, // 100KB
    },
  },
};

// ============================================================================
// Interfaces
// ============================================================================

export interface PerformanceBaselineOptions {
  /** Number of runs to average (default: 3) */
  runs?: number;
  /** Human-readable name for baseline */
  name?: string;
  /** Headless mode */
  headless?: boolean;
  /** Device to emulate */
  device?: string;
  /** Network throttling */
  throttle?: "3g" | "4g" | "wifi";
}

export interface PerformanceRegressionOptions {
  /** Regression thresholds (legacy percentage-only, overridden by sensitivity) */
  thresholds?: PerformanceRegressionThresholds;
  /** Sensitivity profile: strict, normal, ci, lenient (default: normal) */
  sensitivity?: "strict" | "normal" | "ci" | "lenient";
  /** Custom dual thresholds per metric (overrides sensitivity profile) */
  customThresholds?: Partial<Record<string, DualThreshold>>;
  /** Headless mode */
  headless?: boolean;
}

// ============================================================================
// Baseline Management Functions
// ============================================================================

/**
 * Capture a performance baseline for a URL
 */
export async function capturePerformanceBaseline(
  url: string,
  options: PerformanceBaselineOptions = {}
): Promise<PerformanceBaseline> {
  const { runs = 3, name, headless = true, device, throttle } = options;
  const paths = getPaths();
  ensureDirectories();

  const browser = new CBrowser({ headless });
  const allMetrics: PerformanceMetrics[] = [];

  try {
    for (let i = 0; i < runs; i++) {
      await browser.navigate(url);
      // Wait for page to stabilize
      await new Promise((r) => setTimeout(r, 2000));
      const metrics = await browser.getPerformanceMetrics();
      allMetrics.push(metrics);
      // Brief pause between runs
      if (i < runs - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  } finally {
    await browser.close();
  }

  // Average the metrics
  const avgMetrics: PerformanceMetrics = {};
  const numericMetricKeys = [
    "lcp", "fid", "cls", "fcp", "ttfb", "tti", "tbt",
    "domContentLoaded", "load", "resourceCount", "transferSize"
  ] as const;

  for (const key of numericMetricKeys) {
    const values = allMetrics
      .map((m) => m[key])
      .filter((v): v is number => v !== undefined && v !== null);
    if (values.length > 0) {
      (avgMetrics as Record<string, number>)[key] = values.reduce((a, b) => a + b, 0) / values.length;
    }
  }

  // Determine ratings (Web Vitals thresholds)
  if (avgMetrics.lcp !== undefined) {
    avgMetrics.lcpRating = avgMetrics.lcp <= 2500 ? "good" : avgMetrics.lcp <= 4000 ? "needs-improvement" : "poor";
  }
  if (avgMetrics.cls !== undefined) {
    avgMetrics.clsRating = avgMetrics.cls <= 0.1 ? "good" : avgMetrics.cls <= 0.25 ? "needs-improvement" : "poor";
  }
  // v16.7.2: Add FCP and TTFB ratings
  if (avgMetrics.fcp !== undefined) {
    avgMetrics.fcpRating = avgMetrics.fcp <= 1800 ? "good" : avgMetrics.fcp <= 3000 ? "needs-improvement" : "poor";
  }
  if (avgMetrics.ttfb !== undefined) {
    avgMetrics.ttfbRating = avgMetrics.ttfb <= 800 ? "good" : avgMetrics.ttfb <= 1800 ? "needs-improvement" : "poor";
  }

  const baseline: PerformanceBaseline = {
    id: `baseline-${Date.now()}`,
    url,
    name: name || new URL(url).hostname,
    timestamp: new Date().toISOString(),
    metrics: avgMetrics,
    runsAveraged: runs,
    environment: {
      browser: "chromium",
      viewport: { width: 1280, height: 720 },
      device,
      connection: throttle,
    },
  };

  // Save baseline
  const baselinesDir = join(paths.dataDir, "baselines");
  if (!existsSync(baselinesDir)) {
    mkdirSync(baselinesDir, { recursive: true });
  }

  const baselineFile = join(baselinesDir, `${baseline.id}.json`);
  writeFileSync(baselineFile, JSON.stringify(baseline, null, 2));

  return baseline;
}

/**
 * List all saved performance baselines
 */
export function listPerformanceBaselines(): PerformanceBaseline[] {
  const paths = getPaths();
  const baselinesDir = join(paths.dataDir, "baselines");

  if (!existsSync(baselinesDir)) {
    return [];
  }

  const files = readdirSync(baselinesDir).filter((f) => f.endsWith(".json"));
  const baselines: PerformanceBaseline[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(join(baselinesDir, file), "utf-8");
      baselines.push(JSON.parse(content));
    } catch (e) {
      console.debug(`[CBrowser] Skipping invalid performance baseline ${file}: ${(e as Error).message}`);
    }
  }

  return baselines.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/**
 * Load a specific baseline by ID or name
 */
export function loadPerformanceBaseline(idOrName: string): PerformanceBaseline | null {
  const baselines = listPerformanceBaselines();

  // Try exact ID match first
  let baseline = baselines.find((b) => b.id === idOrName);
  if (baseline) return baseline;

  // Try name match
  baseline = baselines.find((b) => b.name === idOrName);
  if (baseline) return baseline;

  // Try URL match
  baseline = baselines.find((b) => b.url.includes(idOrName));
  return baseline || null;
}

/**
 * Delete a performance baseline
 */
export function deletePerformanceBaseline(idOrName: string): boolean {
  const baseline = loadPerformanceBaseline(idOrName);
  if (!baseline) return false;

  const paths = getPaths();
  const baselineFile = join(paths.dataDir, "baselines", `${baseline.id}.json`);

  if (existsSync(baselineFile)) {
    unlinkSync(baselineFile);
    return true;
  }
  return false;
}

// ============================================================================
// Regression Detection Functions
// ============================================================================

/**
 * Resolve the effective dual threshold for a metric.
 * Priority: customThresholds > sensitivity profile > legacy thresholds > normal profile
 */
function resolveThreshold(
  metric: string,
  profile: SensitivityProfile,
  customThresholds?: Partial<Record<string, DualThreshold>>,
  legacyThresholds?: PerformanceRegressionThresholds,
): DualThreshold {
  // Custom threshold takes highest priority
  if (customThresholds?.[metric]) {
    return customThresholds[metric]!;
  }
  // Sensitivity profile threshold
  const profileThreshold = profile.thresholds[metric as keyof SensitivityProfile["thresholds"]];
  if (profileThreshold) {
    // If legacy threshold is set for this metric, use it for the percent part
    const legacyPercent = legacyThresholds?.[metric as keyof PerformanceRegressionThresholds];
    if (legacyPercent !== undefined) {
      return { percent: legacyPercent, minAbsolute: profileThreshold.minAbsolute };
    }
    return profileThreshold;
  }
  return { percent: 20, minAbsolute: 100 };
}

/**
 * Compare current performance against a baseline.
 * Both percentage AND absolute thresholds must be exceeded to flag a regression.
 */
export async function detectPerformanceRegression(
  url: string,
  baselineIdOrName: string,
  options: PerformanceRegressionOptions = {}
): Promise<PerformanceRegressionResult> {
  const {
    thresholds: legacyThresholds,
    sensitivity = "normal",
    customThresholds,
    headless = true,
  } = options;
  const startTime = Date.now();

  // Resolve sensitivity profile
  const profile = SENSITIVITY_PROFILES[sensitivity] || SENSITIVITY_PROFILES.normal;

  // Load baseline
  const baseline = loadPerformanceBaseline(baselineIdOrName);
  if (!baseline) {
    throw new Error(`Baseline not found: ${baselineIdOrName}`);
  }

  // Capture current metrics
  const browser = new CBrowser({ headless });
  let currentMetrics: PerformanceMetrics;

  try {
    await browser.navigate(url);
    await new Promise((r) => setTimeout(r, 2000));
    currentMetrics = await browser.getPerformanceMetrics();
  } finally {
    await browser.close();
  }

  // Compare metrics
  const comparisons: PerformanceComparison[] = [];
  const regressions: MetricRegression[] = [];
  const notes: Array<{ metric: string; message: string }> = [];

  const metricsToCompare: (keyof PerformanceMetrics)[] = [
    "lcp", "fid", "cls", "fcp", "ttfb", "tti", "tbt", "transferSize"
  ];

  for (const metric of metricsToCompare) {
    const baselineValue = baseline.metrics[metric] as number;
    const currentValue = currentMetrics[metric] as number;

    if (baselineValue === undefined || currentValue === undefined) continue;

    const change = currentValue - baselineValue;
    const absoluteChange = Math.abs(change);
    const changePercent = baselineValue > 0 ? (change / baselineValue) * 100 : 0;

    // Resolve dual threshold for this metric
    const dualThreshold = resolveThreshold(metric, profile, customThresholds, legacyThresholds);
    const isClsMetric = metric === "cls";

    // DUAL THRESHOLD: Both percentage AND absolute must be exceeded
    const exceedsPercent = changePercent > dualThreshold.percent;
    const exceedsAbsolute = absoluteChange > dualThreshold.minAbsolute;
    const exceedsThreshold = exceedsPercent && exceedsAbsolute;

    let status: PerformanceComparison["status"] = "stable";
    let severity: MetricRegression["severity"] = "warning";
    let note: string | undefined;

    if (changePercent < -10 || (isClsMetric && change < -0.05)) {
      status = "improved";
    } else if (exceedsPercent && !exceedsAbsolute) {
      // Large percentage but small absolute change — noise
      status = "stable";
      const unit = isClsMetric ? "" : "ms";
      note = `${changePercent.toFixed(1)}% change but only ${absoluteChange.toFixed(isClsMetric ? 3 : 0)}${unit} absolute — within noise threshold (min: ${dualThreshold.minAbsolute}${unit})`;
      notes.push({ metric, message: note });
    } else if (exceedsThreshold) {
      if (changePercent > dualThreshold.percent * 2) {
        status = "critical";
        severity = "critical";
      } else {
        status = "regression";
        severity = "regression";
      }
    } else if (changePercent > 5 || (isClsMetric && change > 0.02)) {
      status = "warning";
    }

    const comparison: PerformanceComparison = {
      metric,
      baseline: baselineValue,
      current: currentValue,
      change,
      changePercent,
      isRegression: status === "regression" || status === "critical",
      isImprovement: status === "improved",
      status,
      note,
    };
    comparisons.push(comparison);

    if (comparison.isRegression) {
      regressions.push({
        metric,
        baselineValue,
        currentValue,
        change,
        changePercent,
        threshold: dualThreshold.percent,
        absoluteThreshold: dualThreshold.minAbsolute,
        severity,
      });
    }
  }

  // Calculate summary
  const improved = comparisons.filter((c) => c.isImprovement).length;
  const regressed = comparisons.filter((c) => c.status === "regression").length;
  const critical = comparisons.filter((c) => c.status === "critical").length;
  const stable = comparisons.filter((c) => c.status === "stable" || c.status === "warning").length;
  const overallChange = comparisons.length > 0
    ? comparisons.reduce((sum, c) => sum + c.changePercent, 0) / comparisons.length
    : 0;

  return {
    url,
    baseline,
    currentMetrics,
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime,
    sensitivity: profile.name,
    comparisons,
    regressions,
    passed: regressions.length === 0,
    notes,
    summary: {
      totalMetrics: comparisons.length,
      improved,
      stable,
      regressed,
      critical,
      overallChange,
    },
  };
}

// ============================================================================
// Reporting Functions
// ============================================================================

/**
 * Format a performance regression report
 */
export function formatPerformanceRegressionReport(result: PerformanceRegressionResult): string {
  const lines: string[] = [];

  lines.push("PERFORMANCE REGRESSION REPORT");
  lines.push("=".repeat(60));
  lines.push("");
  lines.push(`URL: ${result.url}`);
  lines.push(`Baseline: ${result.baseline.name} (${new Date(result.baseline.timestamp).toLocaleDateString()})`);
  lines.push(`Sensitivity: ${result.sensitivity || "normal"}`);
  lines.push(`Duration: ${(result.duration / 1000).toFixed(1)}s`);
  lines.push("");

  // Overall result
  if (result.passed) {
    lines.push("PASSED - No performance regressions detected");
  } else {
    lines.push(`FAILED - ${result.regressions.length} regression(s) detected`);
  }
  lines.push("");

  // Detailed comparisons
  lines.push("-".repeat(60));
  lines.push("METRIC COMPARISON");
  lines.push("-".repeat(60));
  lines.push("");

  const metricNames: Record<string, string> = {
    lcp: "LCP (Largest Contentful Paint)",
    fid: "FID (First Input Delay)",
    cls: "CLS (Cumulative Layout Shift)",
    fcp: "FCP (First Contentful Paint)",
    ttfb: "TTFB (Time to First Byte)",
    tti: "TTI (Time to Interactive)",
    tbt: "TBT (Total Blocking Time)",
    transferSize: "Transfer Size",
  };

  for (const comp of result.comparisons) {
    const name = metricNames[comp.metric] || comp.metric;
    const icon = comp.isImprovement ? "[OK]" :
                 comp.status === "critical" ? "[CRIT]" :
                 comp.status === "regression" ? "[FAIL]" :
                 comp.status === "warning" ? "[WARN]" : "[OK]";

    const unit = comp.metric === "cls" ? "" :
                 comp.metric === "transferSize" ? " KB" : " ms";
    const baseVal = comp.metric === "transferSize"
      ? (comp.baseline / 1024).toFixed(1)
      : comp.baseline.toFixed(1);
    const currVal = comp.metric === "transferSize"
      ? (comp.current / 1024).toFixed(1)
      : comp.current.toFixed(1);

    const changeStr = comp.changePercent >= 0
      ? `+${comp.changePercent.toFixed(1)}%`
      : `${comp.changePercent.toFixed(1)}%`;

    lines.push(`${icon} ${name}`);
    lines.push(`   Baseline: ${baseVal}${unit} -> Current: ${currVal}${unit} (${changeStr})`);
    lines.push("");
  }

  // Notes (noise threshold)
  if (result.notes && result.notes.length > 0) {
    lines.push("-".repeat(60));
    lines.push("NOTES (within noise threshold)");
    lines.push("-".repeat(60));
    lines.push("");
    for (const note of result.notes) {
      const name = metricNames[note.metric] || note.metric;
      lines.push(`[INFO] ${name}: ${note.message}`);
    }
    lines.push("");
  }

  // Summary
  lines.push("-".repeat(60));
  lines.push("SUMMARY");
  lines.push("-".repeat(60));
  lines.push("");
  lines.push(`  Total Metrics: ${result.summary.totalMetrics}`);
  lines.push(`  Improved: ${result.summary.improved}`);
  lines.push(`  Stable: ${result.summary.stable}`);
  lines.push(`  Regressed: ${result.summary.regressed}`);
  lines.push(`  Critical: ${result.summary.critical}`);
  lines.push(`  Overall Change: ${result.summary.overallChange >= 0 ? "+" : ""}${result.summary.overallChange.toFixed(1)}%`);
  lines.push("");

  // Recommendations if regressions found
  if (result.regressions.length > 0) {
    lines.push("-".repeat(60));
    lines.push("RECOMMENDATIONS");
    lines.push("-".repeat(60));
    lines.push("");

    for (const reg of result.regressions) {
      const name = metricNames[reg.metric] || reg.metric;
      lines.push(`[!] ${name}:`);

      switch (reg.metric) {
        case "lcp":
          lines.push("   - Optimize largest content element (images, videos)");
          lines.push("   - Consider lazy loading below-fold content");
          lines.push("   - Improve server response times");
          break;
        case "cls":
          lines.push("   - Set explicit dimensions on images/embeds");
          lines.push("   - Avoid inserting content above existing content");
          lines.push("   - Reserve space for dynamic content");
          break;
        case "fcp":
        case "ttfb":
          lines.push("   - Optimize server response time");
          lines.push("   - Use CDN for static assets");
          lines.push("   - Enable compression (gzip/brotli)");
          break;
        case "tbt":
        case "tti":
          lines.push("   - Split long JavaScript tasks");
          lines.push("   - Defer non-critical JavaScript");
          lines.push("   - Remove unused code");
          break;
        case "transferSize":
          lines.push("   - Compress and optimize assets");
          lines.push("   - Remove unused CSS/JavaScript");
          lines.push("   - Optimize images (WebP, proper sizing)");
          break;
        default:
          lines.push("   - Review recent changes for performance impact");
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
