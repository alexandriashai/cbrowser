/**
 * A/B Visual Comparison (v7.3.0)
 *
 * Compare two URLs side-by-side to detect visual differences.
 */

import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

import { CBrowser } from "../browser.js";
import type {
  ABScreenshot,
  ABComparisonResult,
  ABComparisonOptions,
  ABDifference,
  ABSuite,
  ABSuiteResult,
  AIVisualAnalysis,
} from "../types.js";
import { analyzeVisualDifferences } from "./regression.js";

/**
 * Get the path for A/B comparison screenshots
 */
function getABScreenshotsPath(): string {
  const basePath = process.env.CBROWSER_DATA_DIR || join(homedir(), ".cbrowser");
  const screenshotsPath = join(basePath, "ab-comparison");
  if (!existsSync(screenshotsPath)) {
    mkdirSync(screenshotsPath, { recursive: true });
  }
  return screenshotsPath;
}

/**
 * Capture screenshot for A/B comparison
 */
async function captureForAB(
  url: string,
  label: "A" | "B",
  options: ABComparisonOptions = {}
): Promise<ABScreenshot> {
  const startTime = Date.now();

  const browser = new CBrowser({
    viewportWidth: options.viewport?.width || 1920,
    viewportHeight: options.viewport?.height || 1080,
  });

  try {
    await browser.launch();
    await browser.navigate(url);

    const page = await browser.getPage();

    // Wait if specified
    if (options.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, { timeout: 10000 }).catch(() => {});
    }

    if (options.waitBeforeCapture) {
      await new Promise(resolve => setTimeout(resolve, options.waitBeforeCapture));
    }

    // Get page title
    const title = await page.title();

    // Take screenshot
    const screenshotsPath = getABScreenshotsPath();
    const filename = `${label.toLowerCase()}-${Date.now()}.png`;
    const screenshotPath = join(screenshotsPath, filename);

    const viewport = page.viewportSize() || { width: 1920, height: 1080 };
    await page.screenshot({ path: screenshotPath, fullPage: false });

    return {
      label,
      url,
      screenshotPath,
      title,
      viewport,
      timestamp: new Date().toISOString(),
      captureTime: Date.now() - startTime,
    };
  } finally {
    await browser.close();
  }
}

/**
 * Analyze differences between A and B for detailed reporting
 */
function analyzeABDifferences(analysis: AIVisualAnalysis): ABDifference[] {
  const differences: ABDifference[] = [];

  for (const change of analysis.changes || []) {
    // Map VisualChange to ABDifference
    const severityMap: Record<string, ABDifference["severity"]> = {
      breaking: "critical",
      warning: "major",
      info: "minor",
      acceptable: "info",
    };

    const typeMap: Record<string, ABDifference["type"]> = {
      layout: "layout",
      content: "content",
      style: "style",
      missing: "missing",
      added: "added",
      moved: "structure",
    };

    differences.push({
      type: typeMap[change.type] || "content",
      severity: severityMap[change.severity] || "minor",
      description: change.description,
      affectedSide: "both", // AI analysis doesn't specify which side
      region: change.region,
    });
  }

  return differences;
}

/**
 * Run A/B visual comparison between two URLs
 */
export async function runABComparison(
  urlA: string,
  urlB: string,
  options: ABComparisonOptions = {}
): Promise<ABComparisonResult> {
  const startTime = Date.now();
  const labels = options.labels || { a: "Version A", b: "Version B" };

  console.log(`\n🔀 A/B Visual Comparison`);
  console.log(`   A: ${urlA}`);
  console.log(`   B: ${urlB}\n`);

  // Capture both screenshots
  console.log(`   📸 Capturing ${labels.a}...`);
  const screenshotA = await captureForAB(urlA, "A", options);
  console.log(`      ✅ Captured in ${screenshotA.captureTime}ms`);

  console.log(`   📸 Capturing ${labels.b}...`);
  const screenshotB = await captureForAB(urlB, "B", options);
  console.log(`      ✅ Captured in ${screenshotB.captureTime}ms`);

  // Compare using AI analysis
  console.log(`\n   🔍 Comparing...`);
  const analysis = await analyzeVisualDifferences(
    screenshotA.screenshotPath,
    screenshotB.screenshotPath,
    { sensitivity: options.sensitivity || "medium" }
  );

  // Determine overall status based on similarity
  let overallStatus: ABComparisonResult["overallStatus"];
  if (analysis.similarityScore >= 0.95) {
    overallStatus = "identical";
    console.log(`      ✅ Identical (${(analysis.similarityScore * 100).toFixed(1)}%)`);
  } else if (analysis.similarityScore >= 0.80) {
    overallStatus = "similar";
    console.log(`      ⚠️  Similar (${(analysis.similarityScore * 100).toFixed(1)}%)`);
  } else if (analysis.similarityScore >= 0.50) {
    overallStatus = "different";
    console.log(`      🟠 Different (${(analysis.similarityScore * 100).toFixed(1)}%)`);
  } else {
    overallStatus = "very_different";
    console.log(`      ❌ Very Different (${(analysis.similarityScore * 100).toFixed(1)}%)`);
  }

  // Analyze differences
  const differences = analyzeABDifferences(analysis);

  // Generate summary
  const summaryMap = {
    identical: "Pages are visually identical",
    similar: "Pages are similar with minor differences",
    different: "Pages have significant visual differences",
    very_different: "Pages are very different - likely different designs",
  };

  return {
    urlA,
    urlB,
    labels,
    screenshots: {
      a: screenshotA,
      b: screenshotB,
    },
    analysis,
    differences,
    overallStatus,
    summary: summaryMap[overallStatus],
    duration: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Run A/B comparison suite for multiple page pairs
 */
export async function runABSuite(suite: ABSuite): Promise<ABSuiteResult> {
  const startTime = Date.now();
  const results: ABComparisonResult[] = [];

  console.log(`\n🔀 A/B Comparison Suite: ${suite.name}`);
  console.log(`   Testing ${suite.pairs.length} page pairs\n`);

  for (const pair of suite.pairs) {
    const pairOptions = {
      ...suite.options,
      labels: pair.name ? { a: `${pair.name} (A)`, b: `${pair.name} (B)` } : suite.options?.labels,
    };
    const result = await runABComparison(pair.urlA, pair.urlB, pairOptions);
    results.push(result);
  }

  return {
    suite,
    results,
    summary: {
      total: results.length,
      identical: results.filter(r => r.overallStatus === "identical").length,
      similar: results.filter(r => r.overallStatus === "similar").length,
      different: results.filter(r => r.overallStatus === "different").length,
      veryDifferent: results.filter(r => r.overallStatus === "very_different").length,
    },
    duration: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format A/B comparison result as console report
 */
export function formatABReport(result: ABComparisonResult): string {
  const lines: string[] = [];
  const duration = (result.duration / 1000).toFixed(2);

  lines.push(`╔${"═".repeat(78)}╗`);
  lines.push(`║${" ".repeat(22)}A/B VISUAL COMPARISON REPORT${" ".repeat(28)}║`);
  lines.push(`╚${"═".repeat(78)}╝`);
  lines.push("");

  const statusIcons = {
    identical: "✅",
    similar: "⚠️",
    different: "🟠",
    very_different: "❌",
  };
  const statusIcon = statusIcons[result.overallStatus];
  const statusText = result.overallStatus.toUpperCase().replace("_", " ");

  lines.push(`${statusIcon} Status: ${statusText}`);
  lines.push(`📊 Similarity: ${(result.analysis.similarityScore * 100).toFixed(1)}%`);
  lines.push(`⏱️  Duration: ${duration}s`);
  lines.push("");

  lines.push("─".repeat(79));
  lines.push("📸 SCREENSHOTS");
  lines.push("─".repeat(79));

  lines.push(`   ${result.labels.a.toUpperCase()} (A)`);
  lines.push(`      URL: ${result.screenshots.a.url}`);
  lines.push(`      Title: ${result.screenshots.a.title}`);
  lines.push(`      Capture time: ${result.screenshots.a.captureTime}ms`);
  lines.push(`      Path: ${result.screenshots.a.screenshotPath}`);
  lines.push("");

  lines.push(`   ${result.labels.b.toUpperCase()} (B)`);
  lines.push(`      URL: ${result.screenshots.b.url}`);
  lines.push(`      Title: ${result.screenshots.b.title}`);
  lines.push(`      Capture time: ${result.screenshots.b.captureTime}ms`);
  lines.push(`      Path: ${result.screenshots.b.screenshotPath}`);
  lines.push("");

  if (result.differences.length > 0) {
    lines.push("─".repeat(79));
    lines.push("🔍 DIFFERENCES DETECTED");
    lines.push("─".repeat(79));

    for (const diff of result.differences) {
      const severityIcons = { critical: "🔴", major: "🟠", minor: "🟡", info: "🔵" };
      const icon = severityIcons[diff.severity];
      lines.push(`   ${icon} [${diff.type.toUpperCase()}] ${diff.description}`);
    }
    lines.push("");
  }

  lines.push("─".repeat(79));
  lines.push(`📝 SUMMARY: ${result.summary}`);
  lines.push("─".repeat(79));

  return lines.join("\n");
}

/**
 * Generate HTML report for A/B comparison suite
 */
export function generateABHtmlReport(suiteResult: ABSuiteResult): string {
  const { suite, results, summary, duration } = suiteResult;

  return `<!DOCTYPE html>
<html>
<head>
  <title>A/B Comparison Report - ${suite.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #e2e8f0; line-height: 1.6; }
    .container { max-width: 1400px; margin: 0 auto; padding: 2rem; }
    header { text-align: center; margin-bottom: 2rem; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; background: linear-gradient(135deg, #f59e0b, #ef4444); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .subtitle { color: #94a3b8; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .summary-card { background: #1e293b; border-radius: 0.5rem; padding: 1.5rem; text-align: center; }
    .summary-value { font-size: 2rem; font-weight: bold; }
    .summary-label { color: #94a3b8; font-size: 0.875rem; }
    .identical { color: #22c55e; }
    .similar { color: #f59e0b; }
    .different { color: #f97316; }
    .very-different { color: #ef4444; }
    .result-card { background: #1e293b; border-radius: 0.5rem; padding: 1.5rem; margin-bottom: 1rem; }
    .result-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .badge { padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .badge-identical { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
    .badge-similar { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
    .badge-different { background: rgba(249, 115, 22, 0.2); color: #f97316; }
    .badge-very-different { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
    .comparison-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem; }
    .side { background: #0f172a; padding: 1rem; border-radius: 0.375rem; }
    .side-label { font-weight: 600; color: #f59e0b; margin-bottom: 0.5rem; }
    .url { color: #94a3b8; font-size: 0.875rem; word-break: break-all; }
    .diff-list { margin-top: 1rem; }
    .diff-item { background: #0f172a; padding: 0.5rem 0.75rem; border-radius: 0.375rem; margin-top: 0.5rem; border-left: 3px solid; }
    .diff-critical { border-color: #ef4444; }
    .diff-major { border-color: #f97316; }
    .diff-minor { border-color: #f59e0b; }
    .diff-info { border-color: #3b82f6; }
    footer { text-align: center; color: #64748b; padding: 2rem 0; font-size: 0.875rem; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🔀 A/B Comparison Report</h1>
      <p class="subtitle">${suite.name}</p>
    </header>

    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-value">${summary.total}</div>
        <div class="summary-label">Total Pairs</div>
      </div>
      <div class="summary-card">
        <div class="summary-value identical">${summary.identical}</div>
        <div class="summary-label">Identical</div>
      </div>
      <div class="summary-card">
        <div class="summary-value similar">${summary.similar}</div>
        <div class="summary-label">Similar</div>
      </div>
      <div class="summary-card">
        <div class="summary-value different">${summary.different}</div>
        <div class="summary-label">Different</div>
      </div>
      <div class="summary-card">
        <div class="summary-value very-different">${summary.veryDifferent}</div>
        <div class="summary-label">Very Different</div>
      </div>
    </div>

    <div class="results">
      ${results.map(result => {
        const badgeClass = `badge-${result.overallStatus.replace("_", "-")}`;
        return `
          <div class="result-card">
            <div class="result-header">
              <div>
                <strong>${result.summary}</strong>
                <p style="color: #94a3b8; font-size: 0.875rem;">Similarity: ${(result.analysis.similarityScore * 100).toFixed(1)}%</p>
              </div>
              <span class="badge ${badgeClass}">${result.overallStatus.replace("_", " ").toUpperCase()}</span>
            </div>
            <div class="comparison-grid">
              <div class="side">
                <div class="side-label">${result.labels.a}</div>
                <div class="url">${result.urlA}</div>
                <div style="margin-top: 0.5rem; color: #64748b; font-size: 0.75rem;">Title: ${result.screenshots.a.title}</div>
              </div>
              <div class="side">
                <div class="side-label">${result.labels.b}</div>
                <div class="url">${result.urlB}</div>
                <div style="margin-top: 0.5rem; color: #64748b; font-size: 0.75rem;">Title: ${result.screenshots.b.title}</div>
              </div>
            </div>
            ${result.differences.length > 0 ? `
              <div class="diff-list">
                <strong style="color: #f59e0b;">Differences:</strong>
                ${result.differences.slice(0, 5).map(diff => `
                  <div class="diff-item diff-${diff.severity}">
                    <strong>[${diff.type.toUpperCase()}]</strong> ${diff.description}
                  </div>
                `).join("")}
                ${result.differences.length > 5 ? `<div style="color: #94a3b8; margin-top: 0.5rem;">...and ${result.differences.length - 5} more</div>` : ""}
              </div>
            ` : ""}
          </div>
        `;
      }).join("")}
    </div>

    <footer>
      Generated by CBrowser v7.3.0 | Test completed in ${(duration / 1000).toFixed(1)}s
    </footer>
  </div>
</body>
</html>`;
}
