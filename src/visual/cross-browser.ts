/**
 * Cross-Browser Visual Testing (v7.1.0)
 *
 * Test how pages render across different browser engines.
 */

import { existsSync, mkdirSync } from "fs";
import { join } from "path";

import { CBrowser } from "../browser.js";
import type {
  SupportedBrowser,
  BrowserScreenshot,
  BrowserComparison,
  CrossBrowserResult,
  CrossBrowserOptions,
  CrossBrowserSuite,
  CrossBrowserSuiteResult,
} from "../types.js";
import { analyzeVisualDifferences } from "./regression.js";

/**
 * Get the path for cross-browser screenshots
 */
function getCrossBrowserScreenshotsPath(): string {
  const baseDir = process.env.CBROWSER_DATA_DIR || join(process.cwd(), ".cbrowser");
  const dir = join(baseDir, "cross-browser");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Capture screenshot with a specific browser
 */
async function captureWithBrowser(
  url: string,
  browserType: SupportedBrowser,
  options: CrossBrowserOptions = {}
): Promise<BrowserScreenshot> {
  const startTime = Date.now();

  const browser = new CBrowser({
    browser: browserType,
    viewportWidth: options.viewport?.width || 1920,
    viewportHeight: options.viewport?.height || 1080,
  });

  try {
    await browser.launch();
    await browser.navigate(url);

    // Wait if specified
    if (options.waitForSelector) {
      const page = await browser.getPage();
      await page.waitForSelector(options.waitForSelector, { timeout: 10000 }).catch(() => {});
    }

    if (options.waitBeforeCapture) {
      await new Promise(resolve => setTimeout(resolve, options.waitBeforeCapture));
    }

    // Take screenshot
    const screenshotsPath = getCrossBrowserScreenshotsPath();
    const filename = `${browserType}-${Date.now()}.png`;
    const screenshotPath = join(screenshotsPath, filename);

    const page = await browser.getPage();
    await page.screenshot({ path: screenshotPath, fullPage: false });

    // Get user agent
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const viewport = page.viewportSize() || { width: 1920, height: 1080 };

    return {
      browser: browserType,
      screenshotPath,
      viewport,
      userAgent,
      timestamp: new Date().toISOString(),
      captureTime: Date.now() - startTime,
    };
  } finally {
    await browser.close();
  }
}

/**
 * Run cross-browser visual test for a single URL
 */
export async function runCrossBrowserTest(
  url: string,
  options: CrossBrowserOptions = {}
): Promise<CrossBrowserResult> {
  const startTime = Date.now();
  const browsers: SupportedBrowser[] = options.browsers || ["chromium", "firefox", "webkit"];

  console.log(`\n🌐 Cross-Browser Visual Test`);
  console.log(`   URL: ${url}`);
  console.log(`   Browsers: ${browsers.join(", ")}\n`);

  // Capture screenshots from each browser
  const screenshots: BrowserScreenshot[] = [];

  for (const browserType of browsers) {
    console.log(`   📸 Capturing ${browserType}...`);
    try {
      const screenshot = await captureWithBrowser(url, browserType, options);
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
      overallStatus: "major_differences",
      summary: "Could not capture enough screenshots for comparison",
      problematicBrowsers: [],
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  // Compare all pairs of browsers
  const comparisons: BrowserComparison[] = [];
  let hasMinorDifferences = false;
  let hasMajorDifferences = false;
  const problematicBrowsers = new Set<SupportedBrowser>();

  console.log(`\n   🔍 Comparing browsers...`);

  for (let i = 0; i < screenshots.length; i++) {
    for (let j = i + 1; j < screenshots.length; j++) {
      const a = screenshots[i];
      const b = screenshots[j];

      console.log(`      ${a.browser} vs ${b.browser}...`);

      // Use the existing AI visual analysis
      const analysis = await analyzeVisualDifferences(
        a.screenshotPath,
        b.screenshotPath,
        { sensitivity: options.sensitivity || "medium" }
      );

      comparisons.push({
        browserA: a.browser,
        browserB: b.browser,
        analysis,
        screenshots: {
          a: a.screenshotPath,
          b: b.screenshotPath,
        },
      });

      if (analysis.overallStatus === "fail") {
        hasMajorDifferences = true;
        problematicBrowsers.add(a.browser);
        problematicBrowsers.add(b.browser);
        console.log(`         ❌ Major differences (${(analysis.similarityScore * 100).toFixed(1)}%)`);
      } else if (analysis.overallStatus === "warning") {
        hasMinorDifferences = true;
        console.log(`         ⚠️  Minor differences (${(analysis.similarityScore * 100).toFixed(1)}%)`);
      } else {
        console.log(`         ✅ Consistent (${(analysis.similarityScore * 100).toFixed(1)}%)`);
      }
    }
  }

  const overallStatus = hasMajorDifferences
    ? "major_differences"
    : hasMinorDifferences
      ? "minor_differences"
      : "consistent";

  const summary = overallStatus === "consistent"
    ? "Page renders consistently across all tested browsers"
    : overallStatus === "minor_differences"
      ? "Minor rendering differences detected between browsers"
      : "Significant rendering differences detected between browsers";

  return {
    url,
    screenshots,
    comparisons,
    overallStatus,
    summary,
    problematicBrowsers: Array.from(problematicBrowsers),
    duration: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Run cross-browser test suite
 */
export async function runCrossBrowserSuite(
  suite: CrossBrowserSuite
): Promise<CrossBrowserSuiteResult> {
  const startTime = Date.now();
  const results: CrossBrowserResult[] = [];
  let consistent = 0;
  let minorDifferences = 0;
  let majorDifferences = 0;

  console.log(`\n🌐 Cross-Browser Visual Test Suite: ${suite.name}`);
  console.log(`   Testing ${suite.urls.length} URL(s)...\n`);

  for (const url of suite.urls) {
    const result = await runCrossBrowserTest(url, suite.options);
    results.push(result);

    switch (result.overallStatus) {
      case "consistent":
        consistent++;
        break;
      case "minor_differences":
        minorDifferences++;
        break;
      case "major_differences":
        majorDifferences++;
        break;
    }
  }

  return {
    suite,
    results,
    summary: {
      total: suite.urls.length,
      consistent,
      minorDifferences,
      majorDifferences,
    },
    duration: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format cross-browser result as text report
 */
export function formatCrossBrowserReport(result: CrossBrowserResult): string {
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════════════════════════════════╗");
  lines.push("║                    CROSS-BROWSER VISUAL TEST REPORT                         ║");
  lines.push("╚══════════════════════════════════════════════════════════════════════════════╝");
  lines.push("");

  const statusIcon = {
    consistent: "✅",
    minor_differences: "⚠️",
    major_differences: "❌",
  }[result.overallStatus];

  const statusText = {
    consistent: "CONSISTENT",
    minor_differences: "MINOR DIFFERENCES",
    major_differences: "MAJOR DIFFERENCES",
  }[result.overallStatus];

  lines.push(`${statusIcon} Status: ${statusText}`);
  lines.push(`🔗 URL: ${result.url}`);
  lines.push(`⏱️  Duration: ${(result.duration / 1000).toFixed(2)}s`);
  lines.push("");

  lines.push("───────────────────────────────────────────────────────────────────────────────");
  lines.push("📸 BROWSER SCREENSHOTS");
  lines.push("───────────────────────────────────────────────────────────────────────────────");

  for (const screenshot of result.screenshots) {
    lines.push(`   ${screenshot.browser.toUpperCase()}`);
    lines.push(`      Viewport: ${screenshot.viewport.width}x${screenshot.viewport.height}`);
    lines.push(`      Capture time: ${screenshot.captureTime}ms`);
    lines.push(`      Path: ${screenshot.screenshotPath}`);
    lines.push("");
  }

  lines.push("───────────────────────────────────────────────────────────────────────────────");
  lines.push("🔍 BROWSER COMPARISONS");
  lines.push("───────────────────────────────────────────────────────────────────────────────");

  for (const comparison of result.comparisons) {
    const compIcon = {
      pass: "✅",
      warning: "⚠️",
      fail: "❌",
    }[comparison.analysis.overallStatus];

    lines.push(`   ${comparison.browserA.toUpperCase()} vs ${comparison.browserB.toUpperCase()}: ${compIcon}`);
    lines.push(`      Similarity: ${(comparison.analysis.similarityScore * 100).toFixed(1)}%`);
    lines.push(`      ${comparison.analysis.summary}`);

    if (comparison.analysis.changes.length > 0) {
      for (const change of comparison.analysis.changes) {
        lines.push(`      - [${change.severity.toUpperCase()}] ${change.description}`);
      }
    }
    lines.push("");
  }

  if (result.problematicBrowsers.length > 0) {
    lines.push("───────────────────────────────────────────────────────────────────────────────");
    lines.push("⚠️  BROWSERS WITH ISSUES");
    lines.push("───────────────────────────────────────────────────────────────────────────────");
    for (const browser of result.problematicBrowsers) {
      lines.push(`   • ${browser}`);
    }
    lines.push("");
  }

  lines.push("───────────────────────────────────────────────────────────────────────────────");
  lines.push(`📝 SUMMARY: ${result.summary}`);
  lines.push("───────────────────────────────────────────────────────────────────────────────");

  return lines.join("\n");
}

/**
 * Generate HTML report for cross-browser test suite
 */
export function generateCrossBrowserHtmlReport(suiteResult: CrossBrowserSuiteResult): string {
  const { suite, results, summary, duration, timestamp } = suiteResult;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cross-Browser Visual Report - ${suite.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #e2e8f0; line-height: 1.6; }
    .container { max-width: 1400px; margin: 0 auto; padding: 2rem; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.25rem; margin-bottom: 1rem; color: #94a3b8; }
    .header { text-align: center; margin-bottom: 2rem; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 2rem; }
    .stat { background: #1e293b; padding: 1.5rem; border-radius: 0.5rem; text-align: center; }
    .stat-value { font-size: 2rem; font-weight: bold; }
    .stat-label { color: #94a3b8; font-size: 0.875rem; }
    .consistent { color: #22c55e; }
    .minor { color: #eab308; }
    .major { color: #ef4444; }
    .results { display: flex; flex-direction: column; gap: 2rem; }
    .result-card { background: #1e293b; border-radius: 0.5rem; overflow: hidden; }
    .result-header { padding: 1rem; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; }
    .result-body { padding: 1rem; }
    .screenshots { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
    .screenshot-card { background: #0f172a; border-radius: 0.25rem; padding: 1rem; text-align: center; }
    .screenshot-card img { max-width: 100%; border-radius: 0.25rem; margin-top: 0.5rem; }
    .browser-name { font-weight: bold; text-transform: capitalize; }
    .comparisons { margin-top: 1rem; }
    .comparison { padding: 0.75rem; background: #0f172a; border-radius: 0.25rem; margin-bottom: 0.5rem; }
    .comparison-header { display: flex; justify-content: space-between; align-items: center; }
    .badge { padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .badge-consistent { background: #166534; color: #22c55e; }
    .badge-minor { background: #713f12; color: #eab308; }
    .badge-major { background: #7f1d1d; color: #ef4444; }
    footer { text-align: center; color: #64748b; margin-top: 2rem; padding-top: 2rem; border-top: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🌐 Cross-Browser Visual Report</h1>
      <h2>${suite.name}</h2>
      <p style="color: #64748b;">Generated: ${new Date(timestamp).toLocaleString()}</p>
    </div>

    <div class="summary">
      <div class="stat">
        <div class="stat-value">${summary.total}</div>
        <div class="stat-label">URLs Tested</div>
      </div>
      <div class="stat">
        <div class="stat-value consistent">${summary.consistent}</div>
        <div class="stat-label">Consistent</div>
      </div>
      <div class="stat">
        <div class="stat-value minor">${summary.minorDifferences}</div>
        <div class="stat-label">Minor Differences</div>
      </div>
      <div class="stat">
        <div class="stat-value major">${summary.majorDifferences}</div>
        <div class="stat-label">Major Differences</div>
      </div>
    </div>

    <div class="results">
      ${results.map(result => {
        const statusClass = result.overallStatus === "consistent" ? "consistent" : result.overallStatus === "minor_differences" ? "minor" : "major";
        const badgeClass = result.overallStatus === "consistent" ? "badge-consistent" : result.overallStatus === "minor_differences" ? "badge-minor" : "badge-major";
        const statusText = result.overallStatus === "consistent" ? "Consistent" : result.overallStatus === "minor_differences" ? "Minor Differences" : "Major Differences";

        return `
          <div class="result-card">
            <div class="result-header">
              <div>
                <strong>${result.url}</strong>
                <div style="color: #64748b; font-size: 0.875rem;">${result.summary}</div>
              </div>
              <span class="badge ${badgeClass}">${statusText}</span>
            </div>
            <div class="result-body">
              <h3 style="margin-bottom: 1rem; color: #94a3b8;">Screenshots</h3>
              <div class="screenshots">
                ${result.screenshots.map(s => `
                  <div class="screenshot-card">
                    <div class="browser-name">${s.browser}</div>
                    <div style="color: #64748b; font-size: 0.75rem;">${s.viewport.width}x${s.viewport.height} • ${s.captureTime}ms</div>
                  </div>
                `).join("")}
              </div>

              <h3 style="margin: 1rem 0; color: #94a3b8;">Comparisons</h3>
              <div class="comparisons">
                ${result.comparisons.map(c => {
                  const cBadgeClass = c.analysis.overallStatus === "pass" ? "badge-consistent" : c.analysis.overallStatus === "warning" ? "badge-minor" : "badge-major";
                  return `
                    <div class="comparison">
                      <div class="comparison-header">
                        <span>${c.browserA} vs ${c.browserB}</span>
                        <span class="badge ${cBadgeClass}">${(c.analysis.similarityScore * 100).toFixed(1)}%</span>
                      </div>
                      <p style="color: #94a3b8; font-size: 0.875rem; margin-top: 0.5rem;">${c.analysis.summary}</p>
                    </div>
                  `;
                }).join("")}
              </div>
            </div>
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

// ============================================================================
// Tier 4: Cross-Browser Diff (v4.0.0)
// ============================================================================

export interface BrowserDiffResult {
  url: string;
  browsers: string[];
  differences: Array<{
    type: "visual" | "timing" | "content" | "error";
    description: string;
    browsers: string[];
  }>;
  screenshots: Record<string, string>;
  metrics: Record<string, { loadTime: number; resourceCount: number }>;
}

/**
 * Compare page behavior across multiple browsers.
 */
export async function crossBrowserDiff(
  url: string,
  browsers: Array<"chromium" | "firefox" | "webkit"> = ["chromium", "firefox", "webkit"]
): Promise<BrowserDiffResult> {
  const { chromium, firefox, webkit } = await import("playwright");
  const screenshots: Record<string, string> = {};
  const metrics: Record<string, { loadTime: number; resourceCount: number }> = {};
  const differences: BrowserDiffResult["differences"] = [];
  const contents: Record<string, string> = {};

  const browserLaunchers = { chromium, firefox, webkit };

  for (const browserName of browsers) {
    const launcher = browserLaunchers[browserName];
    const browser = await launcher.launch({ headless: true });
    const page = await browser.newPage();

    const startTime = Date.now();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const loadTime = Date.now() - startTime;

    // Capture metrics
    const resourceCount = await page.evaluate(() => performance.getEntriesByType("resource").length);
    metrics[browserName] = { loadTime, resourceCount };

    // Capture screenshot
    const screenshotPath = `/tmp/cross-browser-${browserName}-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    screenshots[browserName] = screenshotPath;

    // Capture content hash
    contents[browserName] = await page.evaluate(() => document.body.innerText.slice(0, 1000));

    await browser.close();
  }

  // Compare timing
  const loadTimes = Object.entries(metrics).map(([b, m]) => ({ browser: b, time: m.loadTime }));
  const avgTime = loadTimes.reduce((sum, t) => sum + t.time, 0) / loadTimes.length;
  const slowBrowsers = loadTimes.filter(t => t.time > avgTime * 1.5);
  if (slowBrowsers.length > 0) {
    differences.push({
      type: "timing",
      description: `Significantly slower in: ${slowBrowsers.map(b => `${b.browser} (${b.time}ms)`).join(", ")}`,
      browsers: slowBrowsers.map(b => b.browser),
    });
  }

  // Compare content
  const contentValues = Object.values(contents);
  const contentMismatch = contentValues.some(c => c !== contentValues[0]);
  if (contentMismatch) {
    differences.push({
      type: "content",
      description: "Page content differs between browsers",
      browsers,
    });
  }

  return { url, browsers, differences, screenshots, metrics };
}
