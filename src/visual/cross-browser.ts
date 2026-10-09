/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */


/**
 * Cross-Browser Visual Testing (v7.1.0)
 *
 * Test how pages render across different browser engines.
 */

import { existsSync, mkdirSync } from "fs";
import { VERSION } from "../version.js";
import { join } from "path";
import { homedir } from "os";

import { CBrowser } from "../browser.js";
import { navigationError } from "../navigation-errors.js";
import type {
  SupportedBrowser,
  BrowserScreenshot,
  BrowserComparison,
  CrossBrowserResult,
  CrossBrowserOptions,
  CrossBrowserSuite,
  CrossBrowserSuiteResult,
  LayoutElement,
} from "../types.js";
import { analyzeVisualDifferences } from "./regression.js";

/**
 * Check which browsers are actually available for launching.
 * Returns a map of browser name -> available boolean.
 */
async function checkBrowserAvailability(
  browsers: SupportedBrowser[]
): Promise<{ available: SupportedBrowser[]; missing: SupportedBrowser[] }> {
  const { chromium, firefox, webkit } = await import("playwright");
  const launchers = { chromium, firefox, webkit } as const;
  const available: SupportedBrowser[] = [];
  const missing: SupportedBrowser[] = [];

  for (const name of browsers) {
    try {
      const b = await (launchers[name] as any).launch({ headless: true, timeout: 5000 });
      await b.close();
      available.push(name);
    } catch {
      missing.push(name);
    }
  }

  return { available, missing };
}

/**
 * Get the installation command for missing browsers.
 */
function getInstallCommand(missing: SupportedBrowser[]): string {
  return `npx playwright install ${missing.join(" ")}`;
}

/**
 * Get the path for cross-browser screenshots
 */
function getCrossBrowserScreenshotsPath(): string {
  const baseDir = process.env.CBROWSER_DATA_DIR || join(homedir(), ".cbrowser");
  const dir = join(baseDir, "cross-browser");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Capture screenshot with a specific browser.
 *
 * v16.11.0: Performance Note
 * WebKit captures are typically 2-2.5x slower than Chromium due to:
 * - Playwright uses a custom WebKit build with additional instrumentation
 * - On non-macOS, WebKit runs as an emulation layer (not native Safari)
 * - WebKit's rendering pipeline has different optimization characteristics
 *
 * This is expected behavior and not a bug. For CI/CD speed optimization,
 * consider running WebKit tests in a separate, less frequent pipeline.
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

    // v14.3.0: Capture layout structure for content-aware comparison
    const layoutStructure = await captureLayoutStructure(page);

    return {
      browser: browserType,
      screenshotPath,
      viewport,
      userAgent,
      timestamp: new Date().toISOString(),
      captureTime: Date.now() - startTime,
      layoutStructure, // v14.3.0
    };
  } finally {
    await browser.close();
  }
}

/**
 * v14.3.0: Content-aware layout comparison
 * Compare DOM structure and element positions instead of pixels
 * This avoids false positives from font rendering differences
 */
async function captureLayoutStructure(page: any): Promise<LayoutElement[]> {
  return page.evaluate(() => {
    const elements: Array<{
      tag: string;
      x: number;
      y: number;
      width: number;
      height: number;
      children: number;
    }> = [];

    // Get major layout elements
    const selectors = [
      "header", "nav", "main", "footer", "aside", "section", "article",
      "div[class]", "form", "table", "ul", "ol"
    ];

    for (const selector of selectors) {
      const els = document.querySelectorAll(selector);
      for (const el of Array.from(els).slice(0, 10)) { // Limit per selector
        const rect = el.getBoundingClientRect();
        if (rect.width > 50 && rect.height > 20) { // Skip tiny elements
          elements.push({
            tag: el.tagName.toLowerCase(),
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            children: el.children.length
          });
        }
      }
    }

    return elements.slice(0, 50); // Limit total elements
  });
}

function compareLayouts(layoutA: LayoutElement[], layoutB: LayoutElement[]): {
  similarity: number;
  differences: string[];
} {
  const differences: string[] = [];

  // Compare element counts by tag
  const tagCountA: Record<string, number> = {};
  const tagCountB: Record<string, number> = {};

  for (const el of layoutA) tagCountA[el.tag] = (tagCountA[el.tag] || 0) + 1;
  for (const el of layoutB) tagCountB[el.tag] = (tagCountB[el.tag] || 0) + 1;

  const allTags = new Set([...Object.keys(tagCountA), ...Object.keys(tagCountB)]);
  let matchingTags = 0;

  for (const tag of allTags) {
    const countA = tagCountA[tag] || 0;
    const countB = tagCountB[tag] || 0;
    if (countA === countB) {
      matchingTags++;
    } else {
      differences.push(`${tag}: ${countA} vs ${countB}`);
    }
  }

  // Compare element positions (with tolerance for font-induced shifts)
  const tolerance = 20; // Allow 20px variance for font differences
  let positionMatches = 0;
  const checkedA = new Set<number>();

  for (let i = 0; i < layoutB.length; i++) {
    const elB = layoutB[i];
    for (let j = 0; j < layoutA.length; j++) {
      if (checkedA.has(j)) continue;
      const elA = layoutA[j];
      if (
        elA.tag === elB.tag &&
        Math.abs(elA.x - elB.x) < tolerance &&
        Math.abs(elA.y - elB.y) < tolerance &&
        Math.abs(elA.width - elB.width) < tolerance
      ) {
        positionMatches++;
        checkedA.add(j);
        break;
      }
    }
  }

  const maxElements = Math.max(layoutA.length, layoutB.length);
  const tagSimilarity = allTags.size > 0 ? matchingTags / allTags.size : 1;
  const positionSimilarity = maxElements > 0 ? positionMatches / maxElements : 1;

  // Weight: 40% tag structure, 60% position matching
  const similarity = tagSimilarity * 0.4 + positionSimilarity * 0.6;

  return { similarity, differences };
}

/**
 * Run cross-browser visual test for a single URL
 */
export async function runCrossBrowserTest(
  url: string,
  options: CrossBrowserOptions = {}
): Promise<CrossBrowserResult> {
  const startTime = Date.now();
  const requestedBrowsers: SupportedBrowser[] = options.browsers || ["chromium", "firefox", "webkit"];

  console.log(`\n🌐 Cross-Browser Visual Test`);
  console.log(`   URL: ${url}`);
  console.log(`   Browsers: ${requestedBrowsers.join(", ")}\n`);

  // Check browser availability upfront
  const { available, missing } = await checkBrowserAvailability(requestedBrowsers);

  if (missing.length > 0) {
    console.log(`   ⚠️  Missing browsers: ${missing.join(", ")}`);
    console.log(`   💡 Install with: ${getInstallCommand(missing)}\n`);
  }

  if (available.length === 0) {
    return {
      url,
      screenshots: [],
      comparisons: [],
      overallStatus: "major_differences",
      summary: `None of the requested browsers are installed: ${missing.join(", ")}`,
      problematicBrowsers: [],
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      missingBrowsers: missing,
      availableBrowsers: available,
      suggestion: getInstallCommand(missing),
    };
  }

  const browsers = available;

  // Capture screenshots from each available browser
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
      summary: screenshots.length === 0
        ? "Could not capture any screenshots"
        : `Only captured ${screenshots.length} screenshot — need at least 2 for comparison`,
      problematicBrowsers: [],
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      missingBrowsers: missing,
      availableBrowsers: available,
      suggestion: missing.length > 0 ? getInstallCommand(missing) : undefined,
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
      // v11.10.0: Pass crossBrowser flag for more lenient thresholds (issue #93)
      const analysis = await analyzeVisualDifferences(
        a.screenshotPath,
        b.screenshotPath,
        { sensitivity: options.sensitivity || "medium", crossBrowser: true } as any
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

      // v14.3.0: Content-aware layout comparison
      // If AI pixel analysis says "fail" but layouts match, downgrade to "warning"
      // This handles font rendering differences that don't affect layout
      let effectiveStatus = analysis.overallStatus;

      if (analysis.overallStatus === "fail" && a.layoutStructure && b.layoutStructure) {
        const layoutComparison = compareLayouts(a.layoutStructure, b.layoutStructure);
        if (layoutComparison.similarity >= 0.85) {
          // Layouts are structurally similar - pixel differences are likely font rendering
          effectiveStatus = "warning";
          console.log(`         📐 Layout match (${(layoutComparison.similarity * 100).toFixed(0)}%) - pixel diff likely font rendering`);
        } else if (layoutComparison.differences.length > 0) {
          console.log(`         📐 Layout differences: ${layoutComparison.differences.slice(0, 3).join(", ")}`);
        }
      }

      if (effectiveStatus === "fail") {
        hasMajorDifferences = true;
        problematicBrowsers.add(a.browser);
        problematicBrowsers.add(b.browser);
        console.log(`         ❌ Major differences (${(analysis.similarityScore * 100).toFixed(1)}%)`);
      } else if (effectiveStatus === "warning") {
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

  // v11.10.0: Improved messaging for cross-browser expected differences (issue #93)
  // "all tested browsers" overclaimed twice: the set is the browsers that
  // successfully CAPTURED (a launch-probe pass that then fails mid-capture is
  // dropped silently), and the comparison is above-the-fold pixels at one
  // viewport — page text is never examined here, which is why
  // cross_browser_diff can report a content difference on the same input
  // without either tool being wrong. Name the browsers and the scope so the
  // claim is checkable. (2026-07-29)
  const comparedBrowsers = screenshots.map((s) => s.browser).join(", ");
  const summary = overallStatus === "consistent"
    ? `Above-the-fold pixels match across ${comparedBrowsers}. Page text was not compared — use cross_browser_diff for content differences.`
    : overallStatus === "minor_differences"
      ? "Minor rendering differences detected (font/anti-aliasing variations are expected between browser engines)"
      : "Significant layout or content differences detected between browsers (review recommended)";

  return {
    url,
    screenshots,
    comparisons,
    overallStatus,
    summary: missing.length > 0
      ? `${summary}. Note: ${missing.join(", ")} not installed.`
      : summary,
    problematicBrowsers: Array.from(problematicBrowsers),
    duration: Date.now() - startTime,
    timestamp: new Date().toISOString(),
    missingBrowsers: missing,
    availableBrowsers: available,
    suggestion: missing.length > 0 ? getInstallCommand(missing) : undefined,
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

  if (result.missingBrowsers && result.missingBrowsers.length > 0) {
    lines.push("───────────────────────────────────────────────────────────────────────────────");
    lines.push("⚠️  MISSING BROWSERS");
    lines.push("───────────────────────────────────────────────────────────────────────────────");
    for (const browser of result.missingBrowsers) {
      lines.push(`   ✗ ${browser} — not installed`);
    }
    if (result.suggestion) {
      lines.push(`\n   💡 Install: ${result.suggestion}`);
    }
    lines.push("");
  }

  if (result.problematicBrowsers.length > 0) {
    lines.push("───────────────────────────────────────────────────────────────────────────────");
    lines.push("⚠️  BROWSERS WITH RENDERING ISSUES");
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
        const _statusClass = result.overallStatus === "consistent" ? "consistent" : result.overallStatus === "minor_differences" ? "minor" : "major";
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
      Generated by CBrowser v${VERSION} | Test completed in ${(duration / 1000).toFixed(1)}s
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
    /**
     * Per-browser specifics for a content difference. The report used to say only
     * "Page content differs between browsers", which named no browser, no size
     * and no location — nothing a reader could act on. (2026-07-29)
     */
    detail?: Array<{
      browser: string;
      lengthChars: number;
      vsBaselineChars: number;
      firstDivergenceIndex: number;
      baselineExcerpt: string;
      browserExcerpt: string;
    }>;
  }>;
  screenshots: Record<string, string>;
  metrics: Record<string, { loadTime: number; resourceCount: number }>;
  missingBrowsers?: string[];
  availableBrowsers?: string[];
  suggestion?: string;
}

/**
 * Compare page behavior across multiple browsers.
 */
export async function crossBrowserDiff(
  url: string,
  browsers: Array<"chromium" | "firefox" | "webkit"> = ["chromium", "firefox", "webkit"]
): Promise<BrowserDiffResult> {
  // Check browser availability upfront
  const { available, missing } = await checkBrowserAvailability(browsers);

  if (available.length === 0) {
    return {
      url,
      browsers,
      differences: [{
        type: "error",
        description: `None of the requested browsers are installed: ${missing.join(", ")}`,
        browsers: missing,
      }],
      screenshots: {},
      metrics: {},
      missingBrowsers: missing,
      availableBrowsers: [],
      suggestion: getInstallCommand(missing),
    };
  }

  if (missing.length > 0) {
    console.log(`   ⚠️  Missing browsers: ${missing.join(", ")}`);
    console.log(`   💡 Install with: ${getInstallCommand(missing)}`);
    console.log(`   Proceeding with: ${available.join(", ")}\n`);
  }

  const { chromium, firefox, webkit } = await import("playwright");
  const screenshots: Record<string, string> = {};
  const metrics: Record<string, { loadTime: number; resourceCount: number }> = {};
  const differences: BrowserDiffResult["differences"] = [];
  const contents: Record<string, string> = {};

  const browserLaunchers = { chromium, firefox, webkit };

  for (const browserName of available) {
    const launcher = browserLaunchers[browserName];
    let browser: any = null;
    try {
      browser = await launcher.launch({ headless: true });
      const page = await browser.newPage();

      const startTime = Date.now();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
        .catch((e: unknown) => { throw navigationError(e, url); });
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
    } catch (error) {
      differences.push({
        type: "error",
        description: `${browserName}: ${error instanceof Error ? error.message : "Unknown error"}`,
        browsers: [browserName],
      });
    } finally {
      // v14.2.1: Always close browser even if error occurred (fix Firefox crash)
      if (browser) {
        try {
          await browser.close();
        } catch {
          // Browser already closed or crashed, ignore
        }
      }
    }
  }

  // Compare timing (only if we have multiple results)
  if (Object.keys(metrics).length >= 2) {
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

    // Compare content.
    // This used to report the bare sentence "Page content differs between
    // browsers" with nothing to act on — no indication of which browsers, how
    // much, or where. The comparison already has every string in hand, so say
    // what actually differs. (2026-07-29)
    // Engines disagree about where innerText inserts newlines — chromium gave
    // "Skip to main content\nSkip to navigation" where webkit gave
    // "Skip to main contentSkip to navigation" for identical DOM. That is a
    // property of the two engines' text serialisation, not a difference in what
    // the page says, and reporting it as a content difference sends someone
    // hunting a bug that does not exist. Normalise whitespace before comparing;
    // a real divergence survives it. (2026-07-29)
    const normalizeText = (t: string) => t.replace(/\s+/g, " ").trim();
    const contentEntries = Object.entries(contents).map(
      ([browser, text]) => [browser, normalizeText(String(text))] as [string, string],
    );
    const contentValues = contentEntries.map(([, c]) => c);
    const contentMismatch = contentValues.some(c => c !== contentValues[0]);
    if (contentMismatch) {
      const [baseBrowser, baseContent] = contentEntries[0];
      const differing = contentEntries.filter(([, c]) => c !== baseContent);

      // First index where a browser's text stops matching the baseline, with a
      // short window either side so the divergence is readable.
      const detail = differing.map(([browser, c]) => {
        let i = 0;
        while (i < c.length && i < baseContent.length && c[i] === baseContent[i]) i++;
        const window = 60;
        const from = Math.max(0, i - 20);
        return {
          browser,
          lengthChars: c.length,
          vsBaselineChars: c.length - baseContent.length,
          firstDivergenceIndex: i,
          baselineExcerpt: baseContent.slice(from, from + window),
          browserExcerpt: c.slice(from, from + window),
        };
      });

      differences.push({
        type: "content",
        description:
          `Page text differs from ${baseBrowser} (${baseContent.length} chars) in: ` +
          detail.map(d => `${d.browser} (${d.lengthChars} chars, ${d.vsBaselineChars >= 0 ? "+" : ""}${d.vsBaselineChars}, first differs at char ${d.firstDivergenceIndex})`).join("; "),
        browsers: available,
        detail,
      });
    }
  }

  return {
    url,
    browsers: available,
    differences,
    screenshots,
    metrics,
    missingBrowsers: missing.length > 0 ? missing : undefined,
    availableBrowsers: available,
    suggestion: missing.length > 0 ? getInstallCommand(missing) : undefined,
  };
}
