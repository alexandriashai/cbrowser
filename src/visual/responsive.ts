/**
 * Responsive Visual Testing (v7.2.0)
 *
 * Test how pages render across different viewport sizes.
 */

import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

import { CBrowser } from "../browser.js";
import type {
  ViewportPreset,
  ResponsiveScreenshot,
  ResponsiveComparison,
  ResponsiveIssue,
  ResponsiveTestResult,
  ResponsiveTestOptions,
  ResponsiveSuite,
  ResponsiveSuiteResult,
} from "../types.js";
import { VIEWPORT_PRESETS } from "../types.js";
import { analyzeVisualDifferences } from "./regression.js";

/**
 * Get viewport presets by name or return custom preset
 */
function resolveViewports(viewports?: (string | ViewportPreset)[]): ViewportPreset[] {
  if (!viewports || viewports.length === 0) {
    // Default: mobile, tablet, desktop
    return VIEWPORT_PRESETS.filter(v =>
      v.name === "mobile" || v.name === "tablet" || v.name === "desktop"
    );
  }

  return viewports.map(v => {
    if (typeof v === "string") {
      const preset = VIEWPORT_PRESETS.find(p => p.name === v);
      if (!preset) {
        throw new Error(`Unknown viewport preset: ${v}. Available: ${VIEWPORT_PRESETS.map(p => p.name).join(", ")}`);
      }
      return preset;
    }
    return v;
  });
}

/**
 * Get the path for responsive testing screenshots
 */
function getResponsiveScreenshotsPath(): string {
  const basePath = process.env.CBROWSER_DATA_DIR || join(homedir(), ".cbrowser");
  const screenshotsPath = join(basePath, "responsive");
  if (!existsSync(screenshotsPath)) {
    mkdirSync(screenshotsPath, { recursive: true });
  }
  return screenshotsPath;
}

/**
 * Capture screenshot at a specific viewport
 */
async function captureAtViewport(
  url: string,
  viewport: ViewportPreset,
  options: ResponsiveTestOptions = {}
): Promise<ResponsiveScreenshot> {
  const startTime = Date.now();

  const browser = new CBrowser({
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
  });

  try {
    await browser.launch();

    const page = await browser.getPage();

    // Set mobile emulation if needed
    if (viewport.isMobile || viewport.hasTouch) {
      await page.emulateMedia({ reducedMotion: "reduce" });
    }

    await browser.navigate(url);

    // Wait if specified
    if (options.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, { timeout: 10000 }).catch(() => {});
    }

    if (options.waitBeforeCapture) {
      await new Promise(resolve => setTimeout(resolve, options.waitBeforeCapture));
    }

    // Take screenshot
    const screenshotsPath = getResponsiveScreenshotsPath();
    const filename = `${viewport.name}-${Date.now()}.png`;
    const screenshotPath = join(screenshotsPath, filename);

    await page.screenshot({ path: screenshotPath, fullPage: false });

    return {
      viewport,
      screenshotPath,
      timestamp: new Date().toISOString(),
      captureTime: Date.now() - startTime,
    };
  } finally {
    await browser.close();
  }
}

/**
 * Analyze responsive issues from comparisons
 */
function analyzeResponsiveIssues(
  comparisons: ResponsiveComparison[],
  screenshots: ResponsiveScreenshot[]
): ResponsiveIssue[] {
  const issues: ResponsiveIssue[] = [];

  for (const comparison of comparisons) {
    if (comparison.analysis.overallStatus !== "pass") {
      const changes = comparison.analysis.changes || [];

      for (const change of changes) {
        let issueType: ResponsiveIssue["type"] = "other";
        const desc = change.description.toLowerCase();

        if (desc.includes("overflow") || desc.includes("scroll")) {
          issueType = "overflow";
        } else if (desc.includes("truncat") || desc.includes("cut off")) {
          issueType = "truncation";
        } else if (desc.includes("overlap")) {
          issueType = "overlap";
        } else if (desc.includes("hidden") || desc.includes("disappear")) {
          issueType = "hidden_content";
        } else if (desc.includes("text") && (desc.includes("small") || desc.includes("read"))) {
          issueType = "unreadable_text";
        } else if (desc.includes("layout") || desc.includes("break") || desc.includes("shift")) {
          issueType = "layout_break";
        }

        // Map VisualChange severity to ResponsiveIssue severity
        const severityMap: Record<string, "critical" | "major" | "minor"> = {
          breaking: "critical",
          warning: "major",
          info: "minor",
          acceptable: "minor",
        };

        issues.push({
          type: issueType,
          severity: severityMap[change.severity] || "minor",
          description: change.description,
          affectedViewports: [comparison.viewportA.name, comparison.viewportB.name],
          breakpointRange: {
            min: Math.min(comparison.viewportA.width, comparison.viewportB.width),
            max: Math.max(comparison.viewportA.width, comparison.viewportB.width),
          },
        });
      }
    }
  }

  return issues;
}

/**
 * Run responsive visual test for a single URL
 */
export async function runResponsiveTest(
  url: string,
  options: ResponsiveTestOptions = {}
): Promise<ResponsiveTestResult> {
  const startTime = Date.now();
  const viewports = resolveViewports(options.viewports);

  console.log(`\n📱 Responsive Visual Test`);
  console.log(`   URL: ${url}`);
  console.log(`   Viewports: ${viewports.map(v => v.name).join(", ")}\n`);

  // Capture screenshots at each viewport
  const screenshots: ResponsiveScreenshot[] = [];

  for (const viewport of viewports) {
    console.log(`   📸 Capturing ${viewport.name} (${viewport.width}x${viewport.height})...`);
    try {
      const screenshot = await captureAtViewport(url, viewport, options);
      screenshots.push(screenshot);
      console.log(`      ✅ Captured in ${screenshot.captureTime}ms`);
    } catch (error) {
      console.log(`      ❌ Failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  if (screenshots.length < 2) {
    return {
      url,
      screenshots,
      comparisons: [],
      issues: [],
      overallStatus: "major_issues",
      summary: "Could not capture enough screenshots for comparison",
      problematicViewports: [],
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  // Compare adjacent viewport sizes (small to large)
  const sortedScreenshots = [...screenshots].sort((a, b) => a.viewport.width - b.viewport.width);
  const comparisons: ResponsiveComparison[] = [];
  const hasMinorIssues = false;
  let hasMajorIssues = false;
  const problematicViewports = new Set<string>();

  console.log(`\n   🔍 Comparing viewports...`);

  for (let i = 0; i < sortedScreenshots.length - 1; i++) {
    const a = sortedScreenshots[i];
    const b = sortedScreenshots[i + 1];

    console.log(`      ${a.viewport.name} → ${b.viewport.name}...`);

    const analysis = await analyzeVisualDifferences(
      a.screenshotPath,
      b.screenshotPath,
      { sensitivity: options.sensitivity || "low" }  // Use low sensitivity by default for responsive tests
    );

    // For responsive testing, visual differences between viewport sizes are EXPECTED.
    // Only flag as issues if the similarity is extremely low (suggesting broken rendering,
    // not just responsive adaptation).
    const adjustedAnalysis: { overallStatus: "pass" | "warning" | "fail"; summary: string; changes: typeof analysis.changes; similarityScore: number; productionReady: boolean; confidence: number; rawAnalysis?: string } = { ...analysis };

    // Responsive sites should look different at different viewport sizes.
    // Only flag as "fail" if similarity is below 0.3 (truly broken rendering),
    // and treat moderate differences as expected responsive behavior.
    if (adjustedAnalysis.overallStatus === "fail" && adjustedAnalysis.similarityScore >= 0.3) {
      adjustedAnalysis.overallStatus = "pass";
      adjustedAnalysis.summary = "Expected responsive layout adaptation between viewports";
      adjustedAnalysis.changes = adjustedAnalysis.changes.map(c => ({
        ...c,
        severity: "acceptable" as const,
        reasoning: "Expected difference due to responsive layout adaptation",
      }));
    } else if (adjustedAnalysis.overallStatus === "warning") {
      adjustedAnalysis.overallStatus = "pass";
    }

    comparisons.push({
      viewportA: a.viewport,
      viewportB: b.viewport,
      analysis: adjustedAnalysis,
      screenshots: {
        a: a.screenshotPath,
        b: b.screenshotPath,
      },
    });

    if (adjustedAnalysis.overallStatus === "fail") {
      hasMajorIssues = true;
      problematicViewports.add(a.viewport.name);
      problematicViewports.add(b.viewport.name);
      console.log(`         ❌ Major issues (${(adjustedAnalysis.similarityScore * 100).toFixed(1)}%)`);
    } else {
      console.log(`         ✅ Responsive (${(adjustedAnalysis.similarityScore * 100).toFixed(1)}%)`);
    }
  }

  // Analyze issues
  const issues = analyzeResponsiveIssues(comparisons, screenshots);

  const overallStatus = hasMajorIssues
    ? "major_issues"
    : hasMinorIssues
      ? "minor_issues"
      : "responsive";

  const summary = overallStatus === "responsive"
    ? "Page is fully responsive across all tested viewports"
    : overallStatus === "minor_issues"
      ? "Minor responsive issues detected"
      : "Significant responsive issues detected";

  return {
    url,
    screenshots,
    comparisons,
    issues,
    overallStatus,
    summary,
    problematicViewports: Array.from(problematicViewports),
    duration: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Run responsive test suite for multiple URLs
 */
export async function runResponsiveSuite(suite: ResponsiveSuite): Promise<ResponsiveSuiteResult> {
  const startTime = Date.now();
  const results: ResponsiveTestResult[] = [];

  console.log(`\n📱 Responsive Test Suite: ${suite.name}`);
  console.log(`   Testing ${suite.urls.length} URLs\n`);

  for (const url of suite.urls) {
    const result = await runResponsiveTest(url, suite.options);
    results.push(result);
  }

  // Aggregate common issues
  const issueMap = new Map<string, ResponsiveIssue>();
  for (const result of results) {
    for (const issue of result.issues) {
      const key = `${issue.type}-${issue.description}`;
      if (issueMap.has(key)) {
        const existing = issueMap.get(key)!;
        existing.affectedViewports = [...new Set([...existing.affectedViewports, ...issue.affectedViewports])];
      } else {
        issueMap.set(key, { ...issue });
      }
    }
  }

  return {
    suite,
    results,
    summary: {
      total: results.length,
      responsive: results.filter(r => r.overallStatus === "responsive").length,
      minorIssues: results.filter(r => r.overallStatus === "minor_issues").length,
      majorIssues: results.filter(r => r.overallStatus === "major_issues").length,
      totalIssues: results.reduce((sum, r) => sum + r.issues.length, 0),
    },
    commonIssues: Array.from(issueMap.values()),
    duration: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format responsive test result as console report
 */
export function formatResponsiveReport(result: ResponsiveTestResult): string {
  const lines: string[] = [];
  const duration = (result.duration / 1000).toFixed(2);

  lines.push(`╔${"═".repeat(78)}╗`);
  lines.push(`║${" ".repeat(20)}RESPONSIVE VISUAL TEST REPORT${" ".repeat(29)}║`);
  lines.push(`╚${"═".repeat(78)}╝`);
  lines.push("");

  const statusIcon = result.overallStatus === "responsive" ? "✅" : result.overallStatus === "minor_issues" ? "⚠️" : "❌";
  const statusText = result.overallStatus.toUpperCase().replace("_", " ");
  lines.push(`${statusIcon} Status: ${statusText}`);
  lines.push(`🔗 URL: ${result.url}`);
  lines.push(`⏱️  Duration: ${duration}s`);
  lines.push("");

  lines.push("─".repeat(79));
  lines.push("📸 VIEWPORT SCREENSHOTS");
  lines.push("─".repeat(79));

  for (const screenshot of result.screenshots) {
    const v = screenshot.viewport;
    lines.push(`   ${v.name.toUpperCase()} (${v.deviceType})`);
    lines.push(`      Dimensions: ${v.width}x${v.height}`);
    if (v.deviceName) lines.push(`      Device: ${v.deviceName}`);
    lines.push(`      Capture time: ${screenshot.captureTime}ms`);
    lines.push(`      Path: ${screenshot.screenshotPath}`);
    lines.push("");
  }

  lines.push("─".repeat(79));
  lines.push("🔍 VIEWPORT COMPARISONS");
  lines.push("─".repeat(79));

  for (const comparison of result.comparisons) {
    const icon = comparison.analysis.overallStatus === "pass" ? "✅" : comparison.analysis.overallStatus === "warning" ? "⚠️" : "❌";
    lines.push(`   ${comparison.viewportA.name} → ${comparison.viewportB.name}: ${icon}`);
    lines.push(`      Similarity: ${(comparison.analysis.similarityScore * 100).toFixed(1)}%`);
    lines.push(`      ${comparison.analysis.summary}`);
    lines.push("");
  }

  if (result.issues.length > 0) {
    lines.push("─".repeat(79));
    lines.push("⚠️  RESPONSIVE ISSUES DETECTED");
    lines.push("─".repeat(79));

    for (const issue of result.issues) {
      const severityIcon = issue.severity === "critical" ? "🔴" : issue.severity === "major" ? "🟠" : "🟡";
      lines.push(`   ${severityIcon} [${issue.type.toUpperCase()}] ${issue.description}`);
      lines.push(`      Affected: ${issue.affectedViewports.join(", ")}`);
      if (issue.breakpointRange) {
        lines.push(`      Breakpoint range: ${issue.breakpointRange.min}px - ${issue.breakpointRange.max}px`);
      }
      lines.push("");
    }
  }

  lines.push("─".repeat(79));
  lines.push(`📝 SUMMARY: ${result.summary}`);
  lines.push("─".repeat(79));

  return lines.join("\n");
}

/**
 * Generate HTML report for responsive test suite
 */
export function generateResponsiveHtmlReport(suiteResult: ResponsiveSuiteResult): string {
  const { suite, results, summary, duration } = suiteResult;

  return `<!DOCTYPE html>
<html>
<head>
  <title>Responsive Test Report - ${suite.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #e2e8f0; line-height: 1.6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    header { text-align: center; margin-bottom: 2rem; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; background: linear-gradient(135deg, #8b5cf6, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .subtitle { color: #94a3b8; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .summary-card { background: #1e293b; border-radius: 0.5rem; padding: 1.5rem; text-align: center; }
    .summary-value { font-size: 2rem; font-weight: bold; }
    .summary-label { color: #94a3b8; font-size: 0.875rem; }
    .responsive { color: #22c55e; }
    .minor { color: #f59e0b; }
    .major { color: #ef4444; }
    .result-card { background: #1e293b; border-radius: 0.5rem; padding: 1.5rem; margin-bottom: 1rem; }
    .result-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .badge { padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .badge-responsive { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
    .badge-minor { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
    .badge-major { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
    .viewport-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.5rem; margin-top: 1rem; }
    .viewport-item { background: #0f172a; padding: 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; }
    .viewport-name { font-weight: 600; color: #8b5cf6; }
    .issue { background: #0f172a; padding: 0.75rem; border-radius: 0.375rem; margin-top: 0.5rem; border-left: 3px solid; }
    .issue-critical { border-color: #ef4444; }
    .issue-major { border-color: #f59e0b; }
    .issue-minor { border-color: #22c55e; }
    footer { text-align: center; color: #64748b; padding: 2rem 0; font-size: 0.875rem; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>📱 Responsive Test Report</h1>
      <p class="subtitle">${suite.name}</p>
    </header>

    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-value">${summary.total}</div>
        <div class="summary-label">Total URLs</div>
      </div>
      <div class="summary-card">
        <div class="summary-value responsive">${summary.responsive}</div>
        <div class="summary-label">Fully Responsive</div>
      </div>
      <div class="summary-card">
        <div class="summary-value minor">${summary.minorIssues}</div>
        <div class="summary-label">Minor Issues</div>
      </div>
      <div class="summary-card">
        <div class="summary-value major">${summary.majorIssues}</div>
        <div class="summary-label">Major Issues</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${summary.totalIssues}</div>
        <div class="summary-label">Total Issues</div>
      </div>
    </div>

    <div class="results">
      ${results.map(result => {
        const badgeClass = result.overallStatus === "responsive" ? "badge-responsive" : result.overallStatus === "minor_issues" ? "badge-minor" : "badge-major";
        return `
          <div class="result-card">
            <div class="result-header">
              <div>
                <strong>${result.url}</strong>
                <p style="color: #94a3b8; font-size: 0.875rem;">${result.summary}</p>
              </div>
              <span class="badge ${badgeClass}">${result.overallStatus.replace("_", " ").toUpperCase()}</span>
            </div>
            <div class="viewport-grid">
              ${result.screenshots.map(s => `
                <div class="viewport-item">
                  <span class="viewport-name">${s.viewport.name}</span>
                  <span style="color: #94a3b8;"> ${s.viewport.width}×${s.viewport.height}</span>
                </div>
              `).join("")}
            </div>
            ${result.issues.length > 0 ? `
              <div style="margin-top: 1rem;">
                <strong style="color: #f59e0b;">Issues:</strong>
                ${result.issues.map(issue => `
                  <div class="issue issue-${issue.severity}">
                    <strong>[${issue.type.toUpperCase()}]</strong> ${issue.description}
                    <br><span style="color: #94a3b8; font-size: 0.75rem;">Affected: ${issue.affectedViewports.join(", ")}</span>
                  </div>
                `).join("")}
              </div>
            ` : ""}
          </div>
        `;
      }).join("")}
    </div>

    <footer>
      Generated by CBrowser v7.2.0 | Test completed in ${(duration / 1000).toFixed(1)}s
    </footer>
  </div>
</body>
</html>`;
}

/**
 * List available viewport presets
 */
export function listViewportPresets(): ViewportPreset[] {
  return VIEWPORT_PRESETS;
}
