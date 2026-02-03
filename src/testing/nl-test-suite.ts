/**
 * Natural Language Test Suites
 *
 * Parse and run tests written in natural language.
 */

import type { Page } from "playwright";
import { existsSync, readFileSync } from "fs";

import { CBrowser } from "../browser.js";
import type {
  NLTestStep,
  NLTestCase,
  NLTestStepResult,
  NLTestCaseResult,
  NLTestSuiteResult,
} from "../types.js";

/**
 * Parse a single natural language instruction into an NLTestStep.
 *
 * Supported patterns:
 * - "go to https://..." / "navigate to https://..." / "open https://..."
 * - "click [the] <target>" / "press <target>"
 * - "type '<value>' in[to] <target>" / "fill <target> with '<value>'"
 * - "select '<option>' from <dropdown>"
 * - "scroll down/up"
 * - "wait [for] <seconds> seconds"
 * - "verify <assertion>" / "assert <assertion>" / "check <assertion>"
 * - "take screenshot"
 */
export function parseNLInstruction(instruction: string): NLTestStep {
  const lower = instruction.toLowerCase().trim();

  // Navigate patterns
  const navigateMatch = lower.match(/^(?:go to|navigate to|open|visit)\s+(.+)$/i);
  if (navigateMatch) {
    return {
      instruction,
      action: "navigate",
      target: navigateMatch[1].trim(),
    };
  }

  // Click patterns
  const clickMatch = lower.match(/^(?:click|tap|press)\s+(?:on\s+)?(?:the\s+)?(.+)$/i);
  if (clickMatch) {
    return {
      instruction,
      action: "click",
      target: clickMatch[1].trim(),
    };
  }

  // Fill patterns: "type 'value' in target" or "fill target with 'value'"
  const typeMatch = lower.match(/^(?:type|enter)\s+['"](.+?)['"]\s+(?:in|into)\s+(?:the\s+)?(.+)$/i);
  if (typeMatch) {
    return {
      instruction,
      action: "fill",
      value: typeMatch[1],
      target: typeMatch[2].trim(),
    };
  }

  const fillMatch = lower.match(/^fill\s+(?:the\s+)?(.+?)\s+with\s+['"](.+?)['"]$/i);
  if (fillMatch) {
    return {
      instruction,
      action: "fill",
      target: fillMatch[1].trim(),
      value: fillMatch[2],
    };
  }

  // Select patterns
  const selectMatch = lower.match(/^select\s+['"](.+?)['"]\s+(?:from|in)\s+(?:the\s+)?(.+)$/i);
  if (selectMatch) {
    return {
      instruction,
      action: "select",
      value: selectMatch[1],
      target: selectMatch[2].trim(),
    };
  }

  // Scroll patterns
  const scrollMatch = lower.match(/^scroll\s+(up|down|left|right)(?:\s+(\d+)\s+(?:times|pixels))?$/i);
  if (scrollMatch) {
    return {
      instruction,
      action: "scroll",
      target: scrollMatch[1],
      value: scrollMatch[2] || "3",
    };
  }

  // Wait patterns
  const waitMatch = lower.match(/^wait\s+(?:for\s+)?(\d+(?:\.\d+)?)\s*(?:seconds?|s)$/i);
  if (waitMatch) {
    return {
      instruction,
      action: "wait",
      value: waitMatch[1],
    };
  }

  // Wait for text pattern
  const waitForMatch = lower.match(/^wait\s+(?:for|until)\s+['"](.+?)['"]\s+(?:appears?|is visible|shows?)$/i);
  if (waitForMatch) {
    return {
      instruction,
      action: "wait",
      target: waitForMatch[1],
    };
  }

  // Assert/verify patterns
  // Note: Quotes around values are optional - patterns use ['"]? to match with or without quotes
  const assertPatterns = [
    // Title assertions (quotes optional)
    { pattern: /^(?:verify|assert|check|ensure)\s+(?:that\s+)?(?:the\s+)?(?:page\s+)?title\s+(?:contains?|has|includes?)\s+['"]?(.+?)['"]?$/i, type: "title" as const, assertType: "contains" as const },
    { pattern: /^(?:verify|assert|check|ensure)\s+(?:that\s+)?(?:the\s+)?(?:page\s+)?title\s+(?:is|equals?)\s+['"]?(.+?)['"]?$/i, type: "title" as const, assertType: "equals" as const },

    // URL assertions (quotes optional)
    { pattern: /^(?:verify|assert|check|ensure)\s+(?:that\s+)?(?:the\s+)?url\s+(?:contains?|has|includes?)\s+['"]?(.+?)['"]?$/i, type: "url" as const, assertType: "contains" as const },
    { pattern: /^(?:verify|assert|check|ensure)\s+(?:that\s+)?(?:the\s+)?url\s+(?:is|equals?)\s+['"]?(.+?)['"]?$/i, type: "url" as const, assertType: "equals" as const },

    // Content assertions (quotes optional)
    { pattern: /^(?:verify|assert|check|ensure)\s+(?:that\s+)?(?:the\s+)?(?:page\s+)?(?:contains?|has|shows?|includes?)\s+['"]?(.+?)['"]?$/i, type: "content" as const, assertType: "contains" as const },
    { pattern: /^(?:verify|assert|check|ensure)\s+(?:that\s+)?['"]?(.+?)['"]?\s+(?:is\s+)?(?:visible|displayed|shown|present)$/i, type: "content" as const, assertType: "contains" as const },

    // Element exists (quotes optional)
    { pattern: /^(?:verify|assert|check|ensure)\s+(?:that\s+)?['"]?(.+?)['"]?\s+exists?$/i, type: "element" as const, assertType: "exists" as const },
    { pattern: /^(?:verify|assert|check|ensure)\s+(?:that\s+)?(?:there\s+is\s+)?(?:a|an)\s+['"]?(.+?)['"]?$/i, type: "element" as const, assertType: "exists" as const },

    // Count assertions
    { pattern: /^(?:verify|assert|check|ensure)\s+(?:that\s+)?(?:there\s+are\s+)?(\d+)\s+(.+?)$/i, type: "count" as const, assertType: "count" as const },
  ];

  for (const { pattern, type, assertType } of assertPatterns) {
    const match = lower.match(pattern);
    if (match) {
      return {
        instruction,
        action: "assert",
        target: type === "count" ? match[2] : match[1],
        value: type === "count" ? match[1] : undefined,
        assertionType: assertType,
      };
    }
  }

  // Screenshot pattern
  if (/^(?:take\s+(?:a\s+)?screenshot|screenshot|capture\s+(?:the\s+)?(?:page|screen))$/i.test(lower)) {
    return {
      instruction,
      action: "screenshot",
    };
  }

  // Unknown - return as-is for AI-powered interpretation later
  return {
    instruction,
    action: "unknown",
    target: instruction,
  };
}

/**
 * Parse a natural language test suite from text.
 *
 * Format:
 * ```
 * # Test: Login Flow
 * go to https://example.com
 * click the login button
 * type "user@example.com" in email field
 * type "password123" in password field
 * click submit
 * verify url contains "/dashboard"
 *
 * # Test: Search Functionality
 * go to https://example.com
 * type "test query" in search box
 * click search button
 * verify page contains "results"
 * ```
 */
export function parseNLTestSuite(
  text: string,
  suiteName: string = "Unnamed Suite"
): { name: string; tests: NLTestCase[] } {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("//"));
  const tests: NLTestCase[] = [];

  let currentTest: NLTestCase | null = null;

  for (const line of lines) {
    // Check for test header: "# Test: Name" or "## Name" or "Test: Name"
    const testHeaderMatch = line.match(/^(?:#\s*)?(?:test:\s*)?(.+)$/i);

    if (line.startsWith("#") || line.toLowerCase().startsWith("test:")) {
      // Save previous test if exists
      if (currentTest && currentTest.steps.length > 0) {
        tests.push(currentTest);
      }

      const name = testHeaderMatch?.[1]?.replace(/^#+\s*/, "").replace(/^test:\s*/i, "").trim() || "Unnamed Test";
      currentTest = {
        name,
        steps: [],
      };
    } else if (line.length > 0) {
      // Parse as instruction
      if (!currentTest) {
        // Create default test if no header found
        currentTest = {
          name: "Default Test",
          steps: [],
        };
      }

      const step = parseNLInstruction(line);
      currentTest.steps.push(step);
    }
  }

  // Save final test
  if (currentTest && currentTest.steps.length > 0) {
    tests.push(currentTest);
  }

  return { name: suiteName, tests };
}

export interface NLTestSuiteOptions {
  /** Maximum time per step in ms */
  stepTimeout?: number;
  /** Continue running after a test fails */
  continueOnFailure?: boolean;
  /** Take screenshots on failure */
  screenshotOnFailure?: boolean;
  /** Run headless */
  headless?: boolean;
}

/**
 * Run a natural language test suite.
 */
export async function runNLTestSuite(
  suite: { name: string; tests: NLTestCase[] },
  options: NLTestSuiteOptions = {}
): Promise<NLTestSuiteResult> {
  const {
    stepTimeout = 30000,
    continueOnFailure = true,
    screenshotOnFailure = true,
    headless = true,
  } = options;

  const startTime = Date.now();
  const testResults: NLTestCaseResult[] = [];

  console.log(`\n🧪 Running Test Suite: ${suite.name}`);
  console.log(`   Tests: ${suite.tests.length}`);
  console.log(`   Continue on failure: ${continueOnFailure}`);
  console.log("");

  const browser = new CBrowser({
    headless,
  });

  try {
    await browser.launch();

    for (const test of suite.tests) {
      console.log(`\n📋 Test: ${test.name}`);

      const testStartTime = Date.now();
      const stepResults: NLTestStepResult[] = [];
      let testPassed = true;
      let testError: string | undefined;

      for (const step of test.steps) {
        console.log(`   → ${step.instruction}`);

        const stepStartTime = Date.now();
        let stepPassed = true;
        let stepError: string | undefined;
        let screenshot: string | undefined;
        let actualValue: string | undefined;

        try {
          // Execute the step based on action type
          switch (step.action) {
            case "navigate": {
              await browser.navigate(step.target || "");
              break;
            }

            case "click": {
              const result = await browser.smartClick(step.target || "");
              if (!result.success) {
                throw new Error(`Failed to click: ${step.target}`);
              }
              break;
            }

            case "fill": {
              await browser.fill(step.target || "", step.value || "");
              break;
            }

            case "select": {
              await browser.fill(step.target || "", step.value || "");
              break;
            }

            case "scroll": {
              const direction = step.target?.toLowerCase() === "up" ? -500 : 500;
              // Use private page access through cast
              const page = (browser as any).page as Page;
              if (page) {
                await page.evaluate((d) => window.scrollBy(0, d), direction);
              }
              break;
            }

            case "wait": {
              if (step.target) {
                // Wait for text to appear - use private page access
                const page = (browser as any).page as Page;
                if (page) {
                  await page.waitForSelector(`text=${step.target}`, { timeout: stepTimeout });
                }
              } else {
                // Wait for duration
                const ms = parseFloat(step.value || "1") * 1000;
                await new Promise(r => setTimeout(r, ms));
              }
              break;
            }

            case "assert": {
              const assertResult = await browser.assert(step.instruction);
              stepPassed = assertResult.passed;
              actualValue = String(assertResult.actual);
              if (!assertResult.passed) {
                stepError = assertResult.message;
              }
              break;
            }

            case "screenshot": {
              screenshot = await browser.screenshot();
              break;
            }

            case "unknown": {
              // Try to interpret as a click or fill
              console.log(`   ⚠️ Unknown instruction, attempting smart interpretation...`);
              const result = await browser.smartClick(step.target || step.instruction);
              if (!result.success) {
                throw new Error(`Could not interpret: ${step.instruction}`);
              }
              break;
            }
          }

          console.log(`     ✓ Passed (${Date.now() - stepStartTime}ms)`);
        } catch (e: any) {
          stepPassed = false;
          stepError = e.message;
          testPassed = false;
          testError = testError || e.message;

          console.log(`     ✗ Failed: ${e.message}`);

          if (screenshotOnFailure) {
            try {
              screenshot = await browser.screenshot();
            } catch {}
          }
        }

        stepResults.push({
          instruction: step.instruction,
          action: step.action,
          passed: stepPassed,
          duration: Date.now() - stepStartTime,
          error: stepError,
          screenshot,
          actualValue,
        });

        // Stop test if step failed and not continuing on failure
        if (!stepPassed && !continueOnFailure) {
          break;
        }
      }

      testResults.push({
        name: test.name,
        passed: testPassed,
        duration: Date.now() - testStartTime,
        stepResults,
        error: testError,
      });

      console.log(`   ${testPassed ? "✅" : "❌"} ${test.name}: ${testPassed ? "PASSED" : "FAILED"}`);
    }
  } finally {
    await browser.close();
  }

  const passed = testResults.filter(t => t.passed).length;
  const failed = testResults.filter(t => !t.passed).length;

  const result: NLTestSuiteResult = {
    name: suite.name,
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime,
    testResults,
    summary: {
      total: suite.tests.length,
      passed,
      failed,
      skipped: 0,
      passRate: suite.tests.length > 0 ? (passed / suite.tests.length) * 100 : 0,
    },
  };

  return result;
}

/**
 * Format a test suite result as a report.
 */
export function formatNLTestReport(result: NLTestSuiteResult): string {
  const lines: string[] = [];

  lines.push("");
  lines.push("╔══════════════════════════════════════════════════════════════════════════════╗");
  lines.push("║                    NATURAL LANGUAGE TEST REPORT                              ║");
  lines.push("╚══════════════════════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`📋 Suite: ${result.name}`);
  lines.push(`⏱️  Duration: ${(result.duration / 1000).toFixed(1)}s`);
  lines.push(`📅 Timestamp: ${result.timestamp}`);
  lines.push("");

  // Summary stats
  const passEmoji = result.summary.passRate === 100 ? "🎉" : result.summary.passRate >= 80 ? "✅" : "⚠️";
  lines.push(`${passEmoji} Pass Rate: ${result.summary.passed}/${result.summary.total} (${result.summary.passRate.toFixed(0)}%)`);
  lines.push("");

  // Results table
  lines.push("┌───────────────────────────────────────┬──────────┬──────────┬────────────────────┐");
  lines.push("│ Test                                  │ Status   │ Duration │ Error              │");
  lines.push("├───────────────────────────────────────┼──────────┼──────────┼────────────────────┤");

  for (const test of result.testResults) {
    const name = test.name.padEnd(37).slice(0, 37);
    const status = test.passed ? "✓ PASS".padEnd(8) : "✗ FAIL".padEnd(8);
    const duration = `${(test.duration / 1000).toFixed(1)}s`.padEnd(8);
    const error = (test.error || "-").slice(0, 18).padEnd(18);

    lines.push(`│ ${name} │ ${status} │ ${duration} │ ${error} │`);
  }

  lines.push("└───────────────────────────────────────┴──────────┴──────────┴────────────────────┘");
  lines.push("");

  // Failed test details
  const failedTests = result.testResults.filter(t => !t.passed);
  if (failedTests.length > 0) {
    lines.push("❌ FAILED TESTS");
    lines.push("─".repeat(60));

    for (const test of failedTests) {
      lines.push(`\n  📋 ${test.name}`);

      const failedSteps = test.stepResults.filter(s => !s.passed);
      for (const step of failedSteps) {
        lines.push(`     ✗ ${step.instruction}`);
        if (step.error) {
          lines.push(`       Error: ${step.error}`);
        }
        if (step.screenshot) {
          lines.push(`       Screenshot: ${step.screenshot}`);
        }
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Run a natural language test suite from a file.
 */
export async function runNLTestFile(
  filepath: string,
  options: NLTestSuiteOptions = {}
): Promise<NLTestSuiteResult> {
  if (!existsSync(filepath)) {
    throw new Error(`Test file not found: ${filepath}`);
  }

  const content = readFileSync(filepath, "utf-8");
  const suiteName = filepath.split("/").pop()?.replace(/\.[^.]+$/, "") || "Test Suite";
  const suite = parseNLTestSuite(content, suiteName);

  return runNLTestSuite(suite, options);
}
