/**
 * AI Test Repair (v6.2.0)
 *
 * Analyze test failures and suggest repairs.
 */

import type { Page } from "playwright";

import { CBrowser } from "../browser.js";
import type {
  NLTestStep,
  NLTestCase,
  FailureType,
  RepairSuggestion,
  FailureAnalysis,
  TestRepairResult,
  TestRepairSuiteResult,
} from "../types.js";
import { parseNLInstruction } from "./nl-test-suite.js";

/**
 * Classify the type of failure from an error message.
 */
function classifyFailure(error: string, step: NLTestStep): FailureType {
  const lowerError = error.toLowerCase();

  if (lowerError.includes("not found") || lowerError.includes("no element") || lowerError.includes("failed to click")) {
    return "selector_not_found";
  }
  if (lowerError.includes("assertion") || lowerError.includes("verify") || lowerError.includes("expected")) {
    return "assertion_failed";
  }
  if (lowerError.includes("timeout") || lowerError.includes("timed out")) {
    return "timeout";
  }
  if (lowerError.includes("navigation") || lowerError.includes("navigate") || lowerError.includes("url")) {
    return "navigation_failed";
  }
  if (lowerError.includes("not interactable") || lowerError.includes("disabled") || lowerError.includes("hidden")) {
    return "element_not_interactable";
  }

  return "unknown";
}

/**
 * Find alternative selectors for a target on the current page.
 */
async function findAlternatives(
  browser: CBrowser,
  originalTarget: string
): Promise<string[]> {
  const page = (browser as any).page as Page;
  if (!page) return [];

  try {
    const alternatives = await page.evaluate((target) => {
      const results: string[] = [];
      const lowerTarget = target.toLowerCase();

      // Find buttons with similar text
      document.querySelectorAll("button, [role='button'], input[type='submit'], input[type='button']").forEach((el) => {
        const text = el.textContent?.trim() || (el as HTMLInputElement).value || "";
        if (text && (text.toLowerCase().includes(lowerTarget) || lowerTarget.includes(text.toLowerCase()))) {
          results.push(`button: "${text}"`);
        }
      });

      // Find links with similar text
      document.querySelectorAll("a").forEach((el) => {
        const text = el.textContent?.trim() || "";
        if (text && (text.toLowerCase().includes(lowerTarget) || lowerTarget.includes(text.toLowerCase()))) {
          results.push(`link: "${text}"`);
        }
      });

      // Find inputs with similar labels/placeholders
      document.querySelectorAll("input, textarea, select").forEach((el) => {
        const input = el as HTMLInputElement;
        const placeholder = input.placeholder || "";
        const label = document.querySelector(`label[for="${input.id}"]`)?.textContent?.trim() || "";
        const name = input.name || "";

        if (placeholder.toLowerCase().includes(lowerTarget) || lowerTarget.includes(placeholder.toLowerCase())) {
          results.push(`input with placeholder "${placeholder}"`);
        }
        if (label.toLowerCase().includes(lowerTarget) || lowerTarget.includes(label.toLowerCase())) {
          results.push(`input labeled "${label}"`);
        }
        if (name.toLowerCase().includes(lowerTarget)) {
          results.push(`input named "${name}"`);
        }
      });

      // Find elements by aria-label
      document.querySelectorAll("[aria-label]").forEach((el) => {
        const label = el.getAttribute("aria-label") || "";
        if (label.toLowerCase().includes(lowerTarget) || lowerTarget.includes(label.toLowerCase())) {
          results.push(`aria:${el.tagName.toLowerCase()}/"${label}"`);
        }
      });

      return [...new Set(results)].slice(0, 10);
    }, originalTarget);

    return alternatives;
  } catch {
    return [];
  }
}

/**
 * Get page context for failure analysis.
 */
async function getPageContext(
  browser: CBrowser
): Promise<{ url: string; title: string; visibleText: string[] }> {
  const page = (browser as any).page as Page;
  if (!page) return { url: "", title: "", visibleText: [] };

  try {
    const context = await page.evaluate(() => {
      const visibleText: string[] = [];

      // Get visible button/link text
      document.querySelectorAll("button, a, [role='button']").forEach((el) => {
        const text = el.textContent?.trim();
        if (text && text.length < 50) {
          visibleText.push(text);
        }
      });

      return {
        url: window.location.href,
        title: document.title,
        visibleText: [...new Set(visibleText)].slice(0, 20),
      };
    });

    return context;
  } catch {
    return { url: "", title: "", visibleText: [] };
  }
}

/**
 * Generate repair suggestions for a failed step.
 */
async function generateRepairSuggestions(
  browser: CBrowser,
  step: NLTestStep,
  error: string,
  failureType: FailureType,
  alternatives: string[],
  pageContext: { url: string; title: string; visibleText: string[] }
): Promise<RepairSuggestion[]> {
  const suggestions: RepairSuggestion[] = [];

  switch (failureType) {
    case "selector_not_found": {
      // Suggest alternative selectors
      for (const alt of alternatives.slice(0, 3)) {
        const newInstruction = step.instruction.replace(
          step.target || "",
          alt.replace(/^(button|link|input|aria):\s*/, "").replace(/"/g, "'")
        );

        suggestions.push({
          type: "selector_update",
          confidence: 0.7,
          description: `Update selector to "${alt}"`,
          originalInstruction: step.instruction,
          suggestedInstruction: `click ${alt.replace(/^(button|link|input|aria):\s*/, "")}`,
          reasoning: `Found similar element on page: ${alt}`,
        });
      }

      // Suggest adding a wait
      if (suggestions.length === 0) {
        suggestions.push({
          type: "add_wait",
          confidence: 0.5,
          description: "Add wait before this step",
          originalInstruction: step.instruction,
          suggestedInstruction: `wait 2 seconds\n${step.instruction}`,
          reasoning: "Element might not be loaded yet - adding wait may help",
        });
      }
      break;
    }

    case "assertion_failed": {
      // Suggest updating the assertion based on page content
      if (step.action === "assert" && pageContext.visibleText.length > 0) {
        const possibleText = pageContext.visibleText.find(
          (t) => t.length > 3 && t.length < 30
        );
        if (possibleText) {
          suggestions.push({
            type: "assertion_update",
            confidence: 0.6,
            description: `Update assertion to check for visible text`,
            originalInstruction: step.instruction,
            suggestedInstruction: `verify page contains "${possibleText}"`,
            reasoning: `Page contains "${possibleText}" which might be the intended check`,
          });
        }
      }

      // Suggest checking URL instead
      if (pageContext.url) {
        const urlPath = new URL(pageContext.url).pathname;
        suggestions.push({
          type: "assertion_update",
          confidence: 0.5,
          description: "Assert URL instead of content",
          originalInstruction: step.instruction,
          suggestedInstruction: `verify url contains "${urlPath}"`,
          reasoning: `Current URL is ${pageContext.url}`,
        });
      }
      break;
    }

    case "timeout": {
      suggestions.push({
        type: "add_wait",
        confidence: 0.7,
        description: "Increase wait time",
        originalInstruction: step.instruction,
        suggestedInstruction: `wait 5 seconds\n${step.instruction}`,
        reasoning: "Operation timed out - page may need more time to load",
      });
      break;
    }

    case "element_not_interactable": {
      suggestions.push({
        type: "add_wait",
        confidence: 0.6,
        description: "Wait for element to become interactive",
        originalInstruction: step.instruction,
        suggestedInstruction: `wait 2 seconds\n${step.instruction}`,
        reasoning: "Element exists but is not interactable - may need to wait",
      });

      // Suggest scrolling
      suggestions.push({
        type: "change_action",
        confidence: 0.5,
        description: "Scroll element into view first",
        originalInstruction: step.instruction,
        suggestedInstruction: `scroll down\n${step.instruction}`,
        reasoning: "Element might be outside viewport",
      });
      break;
    }

    default: {
      // Generic suggestion to skip
      suggestions.push({
        type: "skip_step",
        confidence: 0.3,
        description: "Skip this step",
        originalInstruction: step.instruction,
        suggestedInstruction: `// SKIPPED: ${step.instruction}`,
        reasoning: "Unable to determine a fix - consider removing this step",
      });
    }
  }

  // Sort by confidence
  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Analyze a failed test step and suggest repairs.
 */
async function analyzeFailure(
  browser: CBrowser,
  step: NLTestStep,
  error: string
): Promise<FailureAnalysis> {
  const failureType = classifyFailure(error, step);
  const alternatives = step.target ? await findAlternatives(browser, step.target) : [];
  const pageContext = await getPageContext(browser);

  const suggestions = await generateRepairSuggestions(
    browser,
    step,
    error,
    failureType,
    alternatives,
    pageContext
  );

  return {
    step,
    error,
    failureType,
    targetSelector: step.target,
    alternativeSelectors: alternatives,
    pageContext,
    suggestions,
  };
}

export interface RepairTestOptions {
  /** Run headless */
  headless?: boolean;
  /** Automatically apply the best repair */
  autoApply?: boolean;
  /** Verify repairs by re-running the test */
  verifyRepairs?: boolean;
  /** Maximum retries per step */
  maxRetries?: number;
}

/**
 * Run a test, analyze failures, and suggest/apply repairs.
 */
export async function repairTest(
  test: NLTestCase,
  options: RepairTestOptions = {}
): Promise<TestRepairResult> {
  const {
    headless = true,
    autoApply = false,
    verifyRepairs = true,
    maxRetries = 3,
  } = options;

  const browser = new CBrowser({ headless });
  const failureAnalyses: FailureAnalysis[] = [];
  const repairedSteps: NLTestStep[] = [];
  let failedSteps = 0;

  console.log(`\n🔧 Analyzing test: ${test.name}`);
  console.log(`   Steps: ${test.steps.length}`);
  console.log(`   Auto-apply: ${autoApply}`);
  console.log("");

  try {
    await browser.launch();

    for (const step of test.steps) {
      console.log(`   → ${step.instruction}`);

      let stepPassed = false;
      let lastError = "";
      let attempts = 0;

      while (!stepPassed && attempts < maxRetries) {
        attempts++;

        try {
          // Execute the step
          switch (step.action) {
            case "navigate":
              await browser.navigate(step.target || "");
              stepPassed = true;
              break;
            case "click":
              const clickResult = await browser.smartClick(step.target || "");
              stepPassed = clickResult.success;
              if (!stepPassed) lastError = `Failed to click: ${step.target}`;
              break;
            case "fill":
              await browser.fill(step.target || "", step.value || "");
              stepPassed = true;
              break;
            case "assert":
              const assertResult = await browser.assert(step.instruction);
              stepPassed = assertResult.passed;
              if (!stepPassed) lastError = assertResult.message;
              break;
            case "wait":
              if (step.target) {
                const page = (browser as any).page as Page;
                if (page) {
                  await page.waitForSelector(`text=${step.target}`, { timeout: 10000 });
                }
              } else {
                const ms = parseFloat(step.value || "1") * 1000;
                await new Promise((r) => setTimeout(r, ms));
              }
              stepPassed = true;
              break;
            case "scroll":
              const direction = step.target?.toLowerCase() === "up" ? -500 : 500;
              const page = (browser as any).page as Page;
              if (page) {
                await page.evaluate((d) => window.scrollBy(0, d), direction);
              }
              stepPassed = true;
              break;
            case "screenshot":
              await browser.screenshot();
              stepPassed = true;
              break;
            default:
              // Try as click
              const unknownResult = await browser.smartClick(step.target || step.instruction);
              stepPassed = unknownResult.success;
              if (!stepPassed) lastError = `Could not interpret: ${step.instruction}`;
          }
        } catch (e: any) {
          lastError = e.message;
          stepPassed = false;
        }

        if (!stepPassed && attempts < maxRetries) {
          console.log(`     ⚠️ Attempt ${attempts} failed, retrying...`);
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      if (stepPassed) {
        console.log(`     ✓ Passed`);
        repairedSteps.push(step);
      } else {
        console.log(`     ✗ Failed: ${lastError}`);
        failedSteps++;

        // Analyze the failure
        const analysis = await analyzeFailure(browser, step, lastError);
        failureAnalyses.push(analysis);

        if (autoApply && analysis.suggestions.length > 0) {
          const bestSuggestion = analysis.suggestions[0];
          console.log(`     🔧 Auto-applying: ${bestSuggestion.description}`);

          // Parse the suggested instruction into a step
          const repairedStep = parseNLInstruction(bestSuggestion.suggestedInstruction.split("\n").pop() || "");
          repairedSteps.push(repairedStep);
        } else {
          // Keep original step
          repairedSteps.push(step);

          if (analysis.suggestions.length > 0) {
            console.log(`     💡 Suggestions:`);
            for (const suggestion of analysis.suggestions.slice(0, 2)) {
              console.log(`        - ${suggestion.description} (${Math.round(suggestion.confidence * 100)}%)`);
              console.log(`          → ${suggestion.suggestedInstruction}`);
            }
          }
        }
      }
    }

    // Create repaired test
    const repairedTest: NLTestCase = {
      name: test.name,
      description: test.description,
      steps: repairedSteps,
    };

    // Optionally verify the repaired test
    let repairedTestPasses: boolean | undefined;
    if (verifyRepairs && autoApply && failedSteps > 0) {
      console.log(`\n   🔄 Verifying repaired test...`);
      await browser.close();

      const verifyBrowser = new CBrowser({ headless });
      try {
        await verifyBrowser.launch();

        let allPassed = true;
        for (const step of repairedSteps) {
          try {
            switch (step.action) {
              case "navigate":
                await verifyBrowser.navigate(step.target || "");
                break;
              case "click":
                const result = await verifyBrowser.smartClick(step.target || "");
                if (!result.success) allPassed = false;
                break;
              case "fill":
                await verifyBrowser.fill(step.target || "", step.value || "");
                break;
              case "assert":
                const assertResult = await verifyBrowser.assert(step.instruction);
                if (!assertResult.passed) allPassed = false;
                break;
              case "wait":
                if (!step.target) {
                  const ms = parseFloat(step.value || "1") * 1000;
                  await new Promise((r) => setTimeout(r, ms));
                }
                break;
            }
          } catch {
            allPassed = false;
          }
        }
        repairedTestPasses = allPassed;
        console.log(`   ${allPassed ? "✅" : "❌"} Repaired test ${allPassed ? "PASSES" : "still FAILS"}`);
      } finally {
        await verifyBrowser.close();
      }
    }

    return {
      originalTest: test,
      repairedTest: failedSteps > 0 ? repairedTest : undefined,
      failedSteps,
      repairedSteps: autoApply ? failedSteps : 0,
      failureAnalyses,
      repairedTestPasses,
    };
  } finally {
    await browser.close();
  }
}

/**
 * Run test repair on a full suite.
 */
export async function repairTestSuite(
  suite: { name: string; tests: NLTestCase[] },
  options: RepairTestOptions = {}
): Promise<TestRepairSuiteResult> {
  const startTime = Date.now();
  const testResults: TestRepairResult[] = [];

  console.log(`\n🔧 Repairing Test Suite: ${suite.name}`);
  console.log(`   Tests: ${suite.tests.length}`);
  console.log("");

  for (const test of suite.tests) {
    const result = await repairTest(test, options);
    testResults.push(result);
  }

  const testsWithFailures = testResults.filter((r) => r.failedSteps > 0).length;
  const testsRepaired = testResults.filter((r) => r.repairedSteps > 0).length;
  const totalFailedSteps = testResults.reduce((sum, r) => sum + r.failedSteps, 0);
  const totalRepairedSteps = testResults.reduce((sum, r) => sum + r.repairedSteps, 0);

  return {
    suiteName: suite.name,
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime,
    testResults,
    summary: {
      totalTests: suite.tests.length,
      testsWithFailures,
      testsRepaired,
      totalFailedSteps,
      totalRepairedSteps,
      repairSuccessRate: totalFailedSteps > 0 ? (totalRepairedSteps / totalFailedSteps) * 100 : 100,
    },
  };
}

/**
 * Format a repair result as a report.
 */
export function formatRepairReport(result: TestRepairSuiteResult): string {
  const lines: string[] = [];

  lines.push("");
  lines.push("╔══════════════════════════════════════════════════════════════════════════════╗");
  lines.push("║                       AI TEST REPAIR REPORT                                  ║");
  lines.push("╚══════════════════════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`📋 Suite: ${result.suiteName}`);
  lines.push(`⏱️  Duration: ${(result.duration / 1000).toFixed(1)}s`);
  lines.push(`📅 Timestamp: ${result.timestamp}`);
  lines.push("");

  // Summary
  lines.push("📊 SUMMARY");
  lines.push("─".repeat(60));
  lines.push(`  Total Tests: ${result.summary.totalTests}`);
  lines.push(`  Tests with Failures: ${result.summary.testsWithFailures}`);
  lines.push(`  Tests Repaired: ${result.summary.testsRepaired}`);
  lines.push(`  Total Failed Steps: ${result.summary.totalFailedSteps}`);
  lines.push(`  Total Repaired Steps: ${result.summary.totalRepairedSteps}`);
  lines.push(`  Repair Success Rate: ${result.summary.repairSuccessRate.toFixed(0)}%`);
  lines.push("");

  // Per-test details
  for (const testResult of result.testResults) {
    if (testResult.failedSteps === 0) continue;

    lines.push(`\n🔧 ${testResult.originalTest.name}`);
    lines.push(`   Failed Steps: ${testResult.failedSteps}`);
    lines.push(`   Repaired: ${testResult.repairedSteps}`);

    for (const analysis of testResult.failureAnalyses) {
      lines.push(`\n   ❌ ${analysis.step.instruction}`);
      lines.push(`      Error: ${analysis.error}`);
      lines.push(`      Type: ${analysis.failureType}`);

      if (analysis.suggestions.length > 0) {
        lines.push(`      💡 Suggestions:`);
        for (const s of analysis.suggestions.slice(0, 2)) {
          lines.push(`         - ${s.description} (${Math.round(s.confidence * 100)}%)`);
          lines.push(`           → ${s.suggestedInstruction}`);
        }
      }
    }

    if (testResult.repairedTestPasses !== undefined) {
      lines.push(`\n   ${testResult.repairedTestPasses ? "✅" : "❌"} Repaired test ${testResult.repairedTestPasses ? "PASSES" : "still FAILS"}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Export repaired test to file.
 */
export function exportRepairedTest(result: TestRepairResult): string {
  if (!result.repairedTest) {
    return `# Test: ${result.originalTest.name}\n# No repairs needed\n${result.originalTest.steps.map((s) => s.instruction).join("\n")}`;
  }

  const lines: string[] = [];
  lines.push(`# Test: ${result.repairedTest.name} (Repaired)`);
  lines.push(`# Original failures: ${result.failedSteps}`);
  lines.push(`# Repairs applied: ${result.repairedSteps}`);
  lines.push("");

  for (const step of result.repairedTest.steps) {
    lines.push(step.instruction);
  }

  return lines.join("\n");
}
