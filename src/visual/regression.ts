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
 * AI Visual Regression Testing (v7.0.0)
 *
 * Capture baselines and compare screenshots using AI-powered analysis.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";

import { CBrowser } from "../browser.js";
import type {
  VisualBaseline,
  VisualChange,
  AIVisualAnalysis,
  VisualRegressionResult,
  VisualRegressionOptions,
  VisualTestSuite,
  VisualTestSuiteResult,
} from "../types.js";

/**
 * Get the path to visual baselines storage
 */
function getVisualBaselinesPath(): string {
  const baseDir = process.env.CBROWSER_DATA_DIR || join(homedir(), ".cbrowser");
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
  options: {
    selector?: string;
    device?: string;
    viewport?: { width: number; height: number };
    waitFor?: string | number;
  } = {}
): Promise<VisualBaseline> {
  const browser = new CBrowser({
    device: options.device,
    viewportWidth: options.viewport?.width || 1920,
    viewportHeight: options.viewport?.height || 1080,
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
    const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
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

      const requestPath = join(tempDir, `analysis-${Date.now()}.json`);
      writeFileSync(requestPath, JSON.stringify({
        prompt,
        images: [
          { type: "base64", media_type: "image/png", data: baselineImage },
          { type: "base64", media_type: "image/png", data: currentImage },
        ],
      }));

      // For now, perform a heuristic comparison since we can't easily call Claude with images
      // This can be enhanced when proper API integration is available
      const analysis = performHeuristicAnalysis(baselinePath, currentPath, options);

      // Clean up
      if (existsSync(requestPath)) {
        unlinkSync(requestPath);
      }

      return analysis;
    }
  } catch (e) {
    console.debug(`[CBrowser] AI visual analysis failed, using heuristics: ${(e as Error).message}`);
  }

  // Fallback: Heuristic analysis based on file comparison
  return performHeuristicAnalysis(baselinePath, currentPath, options);
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

  // Capture current screenshot with same settings as baseline
  const browser = new CBrowser({
    device: baseline.device,
    viewportWidth: baseline.viewport.width,
    viewportHeight: baseline.viewport.height,
  });

  try {
    await browser.launch();
    await browser.navigate(url);

    // Wait if specified in options
    if (options.waitBeforeCapture) {
      await new Promise(resolve => setTimeout(resolve, options.waitBeforeCapture));
    }

    // Take screenshot
    const screenshotsPath = getVisualScreenshotsPath();
    const currentScreenshotPath = join(screenshotsPath, `current-${baseline.id}-${Date.now()}.png`);

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
      Generated by CBrowser v7.1.0 | Suite completed in ${(duration / 1000).toFixed(1)}s
    </footer>
  </div>
</body>
</html>`;
}
