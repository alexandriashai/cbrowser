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
} from "../types.js";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_REGRESSION_THRESHOLDS: PerformanceRegressionThresholds = {
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
  /** Regression thresholds */
  thresholds?: PerformanceRegressionThresholds;
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

  // Determine ratings
  if (avgMetrics.lcp !== undefined) {
    avgMetrics.lcpRating = avgMetrics.lcp <= 2500 ? "good" : avgMetrics.lcp <= 4000 ? "needs-improvement" : "poor";
  }
  if (avgMetrics.cls !== undefined) {
    avgMetrics.clsRating = avgMetrics.cls <= 0.1 ? "good" : avgMetrics.cls <= 0.25 ? "needs-improvement" : "poor";
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
    } catch {
      // Skip invalid files
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
 * Compare current performance against a baseline
 */
export async function detectPerformanceRegression(
  url: string,
  baselineIdOrName: string,
  options: PerformanceRegressionOptions = {}
): Promise<PerformanceRegressionResult> {
  const { thresholds = DEFAULT_REGRESSION_THRESHOLDS, headless = true } = options;
  const startTime = Date.now();

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

  const metricsToCompare: (keyof PerformanceMetrics)[] = [
    "lcp", "fid", "cls", "fcp", "ttfb", "tti", "tbt", "transferSize"
  ];

  for (const metric of metricsToCompare) {
    const baselineValue = baseline.metrics[metric] as number;
    const currentValue = currentMetrics[metric] as number;

    if (baselineValue === undefined || currentValue === undefined) continue;

    const change = currentValue - baselineValue;
    const changePercent = baselineValue > 0 ? (change / baselineValue) * 100 : 0;

    // Determine threshold and if it's a regression
    const threshold = thresholds[metric as keyof PerformanceRegressionThresholds] || 20;
    const isClsMetric = metric === "cls";

    // For CLS, threshold is absolute; for others, it's percentage
    const exceedsThreshold = isClsMetric
      ? change > threshold
      : changePercent > threshold;

    let status: PerformanceComparison["status"] = "stable";
    let severity: MetricRegression["severity"] = "warning";

    if (changePercent < -10 || (isClsMetric && change < -0.05)) {
      status = "improved";
    } else if (exceedsThreshold) {
      if (isClsMetric ? change > threshold * 2 : changePercent > threshold * 2) {
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
    };
    comparisons.push(comparison);

    if (comparison.isRegression) {
      regressions.push({
        metric,
        baselineValue,
        currentValue,
        change,
        changePercent,
        threshold,
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
    comparisons,
    regressions,
    passed: regressions.length === 0,
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
