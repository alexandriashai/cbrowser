/**
 * CBrowser - Cognitive Browser Automation
 * 
 * Copyright (c) 2026 WF Media (Alexandria Eden)
 * Email: alexandria.shai.eden@gmail.com
 * Website: https://cbrowser.ai/
 * 
 * This source code is licensed under the Business Source License 1.1
 * found in the LICENSE file in the root directory of this source tree.
 * 
 * Non-production use is permitted. Production use requires a commercial license.
 * See LICENSE for full terms.
 */


/**
 * Flaky Test Detection (v6.3.0)
 *
 * Analyze tests for flakiness by running them multiple times.
 */

import type { Page } from "playwright";

import { CBrowser } from "../browser.js";
import type {
  NLTestCase,
  FlakyTestRun,
  FlakyStepAnalysis,
  FlakyTestAnalysis,
  FlakyTestSuiteResult,
} from "../types.js";

export interface FlakyTestOptions {
  /** Number of times to run each test (default: 5) */
  runs?: number;
  /** Run headless */
  headless?: boolean;
  /** Flakiness threshold to flag a test (default: 20) */
  flakinessThreshold?: number;
  /** Delay between runs in ms (default: 500) */
  delayBetweenRuns?: number;
}

/**
 * Calculate flakiness score.
 * 0 = completely stable (all same result)
 * 100 = maximally flaky (50% pass, 50% fail)
 */
function calculateFlakinessScore(passCount: number, failCount: number): number {
  const total = passCount + failCount;
  if (total === 0) return 0;

  const passRate = passCount / total;
  // Flakiness is maximized at 50% pass rate
  // Score = 1 - |passRate - 0.5| * 2, scaled to 0-100
  const flakiness = (1 - Math.abs(passRate - 0.5) * 2) * 100;
  return Math.round(flakiness);
}

/**
 * Classify a test based on its results.
 */
function classifyTest(
  passCount: number,
  failCount: number
): "stable_pass" | "stable_fail" | "flaky" | "mostly_pass" | "mostly_fail" {
  const total = passCount + failCount;
  if (total === 0) return "stable_pass";

  const passRate = passCount / total;

  if (passRate === 1) return "stable_pass";
  if (passRate === 0) return "stable_fail";
  if (passRate >= 0.8) return "mostly_pass";
  if (passRate <= 0.2) return "mostly_fail";
  return "flaky";
}

/**
 * Run a single test once and return the result.
 */
async function runTestOnce(
  test: NLTestCase,
  runNumber: number,
  headless: boolean
): Promise<FlakyTestRun> {
  const browser = new CBrowser({ headless });
  const stepResults: { instruction: string; passed: boolean; error?: string }[] = [];
  let testPassed = true;
  let testError: string | undefined;
  const startTime = Date.now();

  try {
    await browser.launch();

    for (const step of test.steps) {
      let stepPassed = true;
      let stepError: string | undefined;

      try {
        switch (step.action) {
          case "navigate":
            await browser.navigate(step.target || "");
            break;
          case "click":
            const clickResult = await browser.smartClick(step.target || "");
            if (!clickResult.success) {
              stepPassed = false;
              stepError = `Failed to click: ${step.target}`;
            }
            break;
          case "fill":
            await browser.fill(step.target || "", step.value || "");
            break;
          case "assert":
            const assertResult = await browser.assert(step.instruction);
            stepPassed = assertResult.passed;
            if (!assertResult.passed) {
              stepError = assertResult.message;
            }
            break;
          case "wait":
            if (!step.target) {
              const ms = parseFloat(step.value || "1") * 1000;
              await new Promise((r) => setTimeout(r, ms));
            } else {
              const page = (browser as any).page as Page;
              if (page) {
                await page.waitForSelector(`text=${step.target}`, { timeout: 10000 });
              }
            }
            break;
          case "scroll":
            const direction = step.target?.toLowerCase() === "up" ? -500 : 500;
            const page = (browser as any).page as Page;
            if (page) {
              await page.evaluate((d) => window.scrollBy(0, d), direction);
            }
            break;
          case "screenshot":
            await browser.screenshot();
            break;
          default:
            const unknownResult = await browser.smartClick(step.target || step.instruction);
            if (!unknownResult.success) {
              stepPassed = false;
              stepError = `Could not interpret: ${step.instruction}`;
            }
        }
      } catch (e: any) {
        stepPassed = false;
        stepError = e.message;
      }

      stepResults.push({
        instruction: step.instruction,
        passed: stepPassed,
        error: stepError,
      });

      if (!stepPassed) {
        testPassed = false;
        testError = testError || stepError;
      }
    }
  } catch (e: any) {
    testPassed = false;
    testError = e.message;
  } finally {
    await browser.close();
  }

  return {
    runNumber,
    passed: testPassed,
    duration: Date.now() - startTime,
    error: testError,
    stepResults,
  };
}

/**
 * Analyze a test for flakiness by running it multiple times.
 */
async function analyzeTestFlakiness(
  test: NLTestCase,
  options: FlakyTestOptions
): Promise<FlakyTestAnalysis> {
  const {
    runs = 5,
    headless = true,
    flakinessThreshold = 20,
    delayBetweenRuns = 500,
  } = options;

  const testRuns: FlakyTestRun[] = [];

  console.log(`\n   🔄 Running ${runs} times...`);

  for (let i = 1; i <= runs; i++) {
    const result = await runTestOnce(test, i, headless);
    testRuns.push(result);

    const icon = result.passed ? "✓" : "✗";
    console.log(`      Run ${i}: ${icon} (${result.duration}ms)`);

    if (i < runs && delayBetweenRuns > 0) {
      await new Promise((r) => setTimeout(r, delayBetweenRuns));
    }
  }

  // Calculate overall stats
  const passCount = testRuns.filter((r) => r.passed).length;
  const failCount = testRuns.filter((r) => !r.passed).length;
  const flakinessScore = calculateFlakinessScore(passCount, failCount);
  const classification = classifyTest(passCount, failCount);
  const isFlaky = flakinessScore >= flakinessThreshold;

  // Calculate duration stats
  const durations = testRuns.map((r) => r.duration);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const variance = Math.sqrt(
    durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / durations.length
  );

  // Analyze per-step flakiness
  const stepAnalysis: FlakyStepAnalysis[] = [];

  for (let stepIdx = 0; stepIdx < test.steps.length; stepIdx++) {
    const step = test.steps[stepIdx];
    const stepResults = testRuns.map((r) => r.stepResults[stepIdx]).filter(Boolean);

    const stepPassCount = stepResults.filter((s) => s?.passed).length;
    const stepFailCount = stepResults.filter((s) => !s?.passed).length;
    const stepFlakinessScore = calculateFlakinessScore(stepPassCount, stepFailCount);
    const stepErrors = [...new Set(stepResults.filter((s) => s?.error).map((s) => s!.error!))];

    stepAnalysis.push({
      instruction: step.instruction,
      passCount: stepPassCount,
      failCount: stepFailCount,
      flakinessScore: stepFlakinessScore,
      isFlaky: stepFlakinessScore >= flakinessThreshold,
      errors: stepErrors,
    });
  }

  return {
    testName: test.name,
    totalRuns: runs,
    passCount,
    failCount,
    flakinessScore,
    isFlaky,
    classification,
    runs: testRuns,
    stepAnalysis,
    avgDuration: Math.round(avgDuration),
    durationVariance: Math.round(variance),
  };
}

/**
 * Run flaky test detection on a test suite.
 */
export async function detectFlakyTests(
  suite: { name: string; tests: NLTestCase[] },
  options: FlakyTestOptions = {}
): Promise<FlakyTestSuiteResult> {
  const { runs = 5, flakinessThreshold = 20 } = options;
  const startTime = Date.now();
  const testAnalyses: FlakyTestAnalysis[] = [];

  console.log(`\n🔍 Flaky Test Detection: ${suite.name}`);
  console.log(`   Tests: ${suite.tests.length}`);
  console.log(`   Runs per test: ${runs}`);
  console.log(`   Flakiness threshold: ${flakinessThreshold}%`);

  for (const test of suite.tests) {
    console.log(`\n📋 Test: ${test.name}`);
    const analysis = await analyzeTestFlakiness(test, options);
    testAnalyses.push(analysis);

    const statusIcon =
      analysis.classification === "stable_pass" ? "✅" :
      analysis.classification === "stable_fail" ? "❌" :
      analysis.classification === "flaky" ? "⚠️" :
      analysis.classification === "mostly_pass" ? "🟡" : "🟠";

    console.log(`   ${statusIcon} ${analysis.classification.toUpperCase()} (${analysis.passCount}/${analysis.totalRuns} passed, flakiness: ${analysis.flakinessScore}%)`);
  }

  // Calculate summary
  const stablePassTests = testAnalyses.filter((t) => t.classification === "stable_pass").length;
  const stableFailTests = testAnalyses.filter((t) => t.classification === "stable_fail").length;
  const flakyTests = testAnalyses.filter((t) => t.isFlaky).length;

  const mostFlakyTest = testAnalyses.reduce((max, t) =>
    t.flakinessScore > (max?.flakinessScore || 0) ? t : max, testAnalyses[0])?.testName;

  const allSteps = testAnalyses.flatMap((t) => t.stepAnalysis);
  const mostFlakyStep = allSteps.reduce((max, s) =>
    s.flakinessScore > (max?.flakinessScore || 0) ? s : max, allSteps[0])?.instruction;

  const overallFlakinessScore = testAnalyses.length > 0
    ? Math.round(testAnalyses.reduce((sum, t) => sum + t.flakinessScore, 0) / testAnalyses.length)
    : 0;

  return {
    suiteName: suite.name,
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime,
    runsPerTest: runs,
    testAnalyses,
    summary: {
      totalTests: suite.tests.length,
      stablePassTests,
      stableFailTests,
      flakyTests,
      mostFlakyTest: flakyTests > 0 ? mostFlakyTest : undefined,
      mostFlakyStep: allSteps.some((s) => s.isFlaky) ? mostFlakyStep : undefined,
      overallFlakinessScore,
    },
  };
}

/**
 * Format a flaky test report.
 */
export function formatFlakyTestReport(result: FlakyTestSuiteResult): string {
  const lines: string[] = [];

  lines.push("");
  lines.push("╔══════════════════════════════════════════════════════════════════════════════╗");
  lines.push("║                      FLAKY TEST DETECTION REPORT                             ║");
  lines.push("╚══════════════════════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`📋 Suite: ${result.suiteName}`);
  lines.push(`⏱️  Duration: ${(result.duration / 1000).toFixed(1)}s`);
  lines.push(`🔄 Runs per test: ${result.runsPerTest}`);
  lines.push(`📅 Timestamp: ${result.timestamp}`);
  lines.push("");

  // Summary
  const flakyEmoji = result.summary.flakyTests === 0 ? "✅" : "⚠️";
  lines.push(`${flakyEmoji} Overall Flakiness: ${result.summary.overallFlakinessScore}%`);
  lines.push("");

  lines.push("📊 SUMMARY");
  lines.push("─".repeat(60));
  lines.push(`  Total Tests: ${result.summary.totalTests}`);
  lines.push(`  Stable (Pass): ${result.summary.stablePassTests}`);
  lines.push(`  Stable (Fail): ${result.summary.stableFailTests}`);
  lines.push(`  Flaky: ${result.summary.flakyTests}`);
  if (result.summary.mostFlakyTest) {
    lines.push(`  Most Flaky Test: ${result.summary.mostFlakyTest}`);
  }
  if (result.summary.mostFlakyStep) {
    lines.push(`  Most Flaky Step: ${result.summary.mostFlakyStep.slice(0, 50)}...`);
  }
  lines.push("");

  // Results table
  lines.push("┌────────────────────────────────┬────────────┬──────────┬───────────┬────────────┐");
  lines.push("│ Test                           │ Status     │ Pass/Fail│ Flakiness │ Avg Time   │");
  lines.push("├────────────────────────────────┼────────────┼──────────┼───────────┼────────────┤");

  for (const test of result.testAnalyses) {
    const name = test.testName.padEnd(30).slice(0, 30);
    const status = test.classification.replace("_", " ").toUpperCase().padEnd(10).slice(0, 10);
    const passFailStr = `${test.passCount}/${test.totalRuns}`.padEnd(8);
    const flakiness = `${test.flakinessScore}%`.padEnd(9);
    const avgTime = `${(test.avgDuration / 1000).toFixed(1)}s`.padEnd(10);

    lines.push(`│ ${name} │ ${status} │ ${passFailStr} │ ${flakiness} │ ${avgTime} │`);
  }

  lines.push("└────────────────────────────────┴────────────┴──────────┴───────────┴────────────┘");
  lines.push("");

  // Flaky tests details
  const flakyTests = result.testAnalyses.filter((t) => t.isFlaky);
  if (flakyTests.length > 0) {
    lines.push("⚠️  FLAKY TESTS DETAILS");
    lines.push("─".repeat(60));

    for (const test of flakyTests) {
      lines.push(`\n  📋 ${test.testName}`);
      lines.push(`     Flakiness: ${test.flakinessScore}%`);
      lines.push(`     Pass Rate: ${test.passCount}/${test.totalRuns} (${Math.round((test.passCount / test.totalRuns) * 100)}%)`);
      lines.push(`     Duration: ${test.avgDuration}ms ± ${test.durationVariance}ms`);

      const flakySteps = test.stepAnalysis.filter((s) => s.isFlaky);
      if (flakySteps.length > 0) {
        lines.push(`     Flaky Steps:`);
        for (const step of flakySteps) {
          lines.push(`       - "${step.instruction.slice(0, 40)}..." (${step.flakinessScore}% flaky)`);
          if (step.errors.length > 0) {
            lines.push(`         Errors: ${step.errors[0].slice(0, 50)}`);
          }
        }
      }
    }
    lines.push("");
  }

  // Recommendations
  lines.push("💡 RECOMMENDATIONS");
  lines.push("─".repeat(60));

  if (result.summary.flakyTests === 0) {
    lines.push("  ✅ All tests are stable - no action needed");
  } else {
    lines.push(`  ⚠️ ${result.summary.flakyTests} flaky test(s) detected`);
    lines.push("  Consider:");
    lines.push("    - Adding explicit waits for timing-sensitive operations");
    lines.push("    - Using more specific selectors");
    lines.push("    - Checking for race conditions in the application");
    lines.push("    - Isolating tests to avoid shared state issues");
  }

  lines.push("");
  return lines.join("\n");
}
