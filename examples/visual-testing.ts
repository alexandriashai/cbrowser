/**
 * CBrowser v7.x Visual Testing Examples
 *
 * Demonstrates:
 * - AI Visual Regression (v7.0)
 * - Cross-Browser Testing (v7.1)
 * - Responsive Testing (v7.2)
 * - A/B Comparison (v7.3)
 *
 * Run with: npx ts-node examples/visual-testing.ts
 * Or: bun run examples/visual-testing.ts
 */

import { CBrowser } from "cbrowser";
// Modular imports for tree-shaking:
// import { runVisualRegression, runCrossBrowserTest, runResponsiveTest, runABComparison } from "cbrowser/visual";

async function visualRegressionExample() {
  console.log("=== AI Visual Regression (v7.0) ===\n");

  const browser = new CBrowser({ headless: true });

  try {
    // Capture a baseline
    const baseline = await browser.captureVisualBaseline(
      "https://example.com",
      "homepage"
    );
    console.log(`Baseline captured: ${baseline.name}`);
    console.log(`Screenshot: ${baseline.screenshotPath}`);
    console.log(`Timestamp: ${baseline.timestamp}`);

    // Later, compare against baseline
    const result = await browser.runVisualRegression(
      "https://example.com",
      "homepage"
    );

    console.log(`\nComparison result:`);
    console.log(`  Match: ${result.match}`);
    console.log(`  Similarity: ${(result.similarity * 100).toFixed(1)}%`);
    console.log(`  AI Analysis: ${result.aiAnalysis}`);

    if (result.differences.length > 0) {
      console.log(`\nDifferences found:`);
      for (const diff of result.differences) {
        console.log(`  - ${diff.type}: ${diff.description}`);
        console.log(`    Severity: ${diff.severity}`);
      }
    }
  } finally {
    await browser.close();
  }
}

async function crossBrowserExample() {
  console.log("\n=== Cross-Browser Testing (v7.1) ===\n");

  const browser = new CBrowser({ headless: true });

  try {
    // Compare rendering across browsers
    const result = await browser.runCrossBrowserTest("https://example.com", {
      browsers: ["chromium", "firefox", "webkit"],
    });

    console.log(`URL tested: ${result.url}`);
    console.log(`Browsers: ${result.browsers.join(", ")}`);
    console.log(`Overall match: ${result.overallMatch}`);

    console.log(`\nBrowser comparisons:`);
    for (const comparison of result.comparisons) {
      console.log(`  ${comparison.browserA} vs ${comparison.browserB}:`);
      console.log(`    Similarity: ${(comparison.similarity * 100).toFixed(1)}%`);
      console.log(`    Differences: ${comparison.differences.length}`);
    }

    if (result.criticalDifferences.length > 0) {
      console.log(`\nCritical differences:`);
      for (const diff of result.criticalDifferences) {
        console.log(`  - ${diff.browser}: ${diff.description}`);
      }
    }
  } finally {
    await browser.close();
  }
}

async function responsiveExample() {
  console.log("\n=== Responsive Testing (v7.2) ===\n");

  const browser = new CBrowser({ headless: true });

  try {
    // Test across viewport sizes
    const result = await browser.runResponsiveTest("https://example.com", {
      viewports: ["mobile", "tablet", "desktop"],
    });

    console.log(`URL tested: ${result.url}`);
    console.log(`Viewports tested: ${result.viewports.length}`);

    console.log(`\nViewport results:`);
    for (const viewport of result.viewports) {
      console.log(`  ${viewport.name} (${viewport.width}x${viewport.height}):`);
      console.log(`    Layout: ${viewport.layoutType}`);
      console.log(`    Issues: ${viewport.issues.length}`);

      if (viewport.issues.length > 0) {
        for (const issue of viewport.issues) {
          console.log(`      - ${issue.type}: ${issue.description}`);
        }
      }
    }

    // Breakpoint analysis
    if (result.breakpointIssues.length > 0) {
      console.log(`\nBreakpoint issues:`);
      for (const issue of result.breakpointIssues) {
        console.log(`  At ${issue.breakpoint}px: ${issue.description}`);
      }
    }
  } finally {
    await browser.close();
  }
}

async function abComparisonExample() {
  console.log("\n=== A/B Comparison (v7.3) ===\n");

  const browser = new CBrowser({ headless: true });

  try {
    // Compare two URLs (staging vs production, old vs new design)
    const result = await browser.runABComparison(
      "https://staging.example.com",
      "https://example.com",
      {
        labelA: "Staging",
        labelB: "Production",
      }
    );

    console.log(`Comparison: ${result.labelA} vs ${result.labelB}`);
    console.log(`Overall similarity: ${(result.similarity * 100).toFixed(1)}%`);
    console.log(`Match: ${result.match}`);

    console.log(`\nDifferences:`);
    for (const diff of result.differences) {
      console.log(`  - ${diff.category}: ${diff.description}`);
      console.log(`    Severity: ${diff.severity}`);
      console.log(`    Location: ${diff.location}`);
    }

    // AI summary
    console.log(`\nAI Summary:`);
    console.log(`  ${result.aiSummary}`);

    if (result.recommendations.length > 0) {
      console.log(`\nRecommendations:`);
      for (const rec of result.recommendations) {
        console.log(`  - ${rec}`);
      }
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  await visualRegressionExample();
  await crossBrowserExample();
  await responsiveExample();
  await abComparisonExample();
}

main().catch(console.error);
