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
  NLTestStepError,
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
  /** Use fuzzy matching for text assertions */
  fuzzyMatch?: boolean;
}

/**
 * Find partial text matches for a failed content assertion.
 */
function findPartialMatches(pageText: string, expected: string, maxResults: number = 3): string[] {
  if (!pageText || !expected) return [];
  const lowerPage = pageText.toLowerCase();
  const lowerExpected = expected.toLowerCase();
  const matches: string[] = [];

  // Check word-by-word overlap
  const words = lowerExpected.split(/\s+/).filter(w => w.length > 2);
  for (const word of words) {
    const idx = lowerPage.indexOf(word);
    if (idx !== -1) {
      // Extract surrounding context (up to 60 chars)
      const start = Math.max(0, idx - 20);
      const end = Math.min(pageText.length, idx + word.length + 40);
      const context = pageText.substring(start, end).trim();
      if (!matches.some(m => m.includes(context.substring(0, 20)))) {
        matches.push(context);
      }
    }
    if (matches.length >= maxResults) break;
  }

  return matches;
}

/**
 * Generate a suggestion for a failed assertion step.
 */
function generateAssertionSuggestion(step: NLTestStep, actual?: string, partialMatches?: string[]): string {
  if (step.assertionType === "contains" && partialMatches && partialMatches.length > 0) {
    return `Partial matches found on the page. Try: verify page contains "${partialMatches[0].substring(0, 50)}"`;
  }
  if (step.assertionType === "equals" && actual) {
    return `Actual value is "${actual}". Try using 'contains' instead of exact match: verify title contains "${step.target}"`;
  }
  if (step.assertionType === "exists") {
    return `Element "${step.target}" not found. Check if the element has loaded or try a more specific selector.`;
  }
  return `Assertion failed. Try using --fuzzy-match for case-insensitive partial matching.`;
}

/**
 * Generate recommendations from failed test results.
 */
function generateRecommendations(testResults: NLTestCaseResult[]): string[] {
  const recs: string[] = [];
  const failedSteps = testResults.flatMap(t => t.stepResults.filter(s => !s.passed));

  for (const step of failedSteps) {
    if (step.error?.partialMatches && step.error.partialMatches.length > 0) {
      recs.push(`Step "${step.instruction}" failed on exact match but found similar text. Consider using fuzzy matching.`);
    }
    if (step.action === "click" && step.error?.reason?.includes("Failed to click")) {
      recs.push(`Click "${step.parsed?.target}" failed. Try using a more specific selector or check if an overlay is blocking.`);
    }
    if (step.action === "navigate" && step.error) {
      recs.push(`Navigation to "${step.parsed?.target}" failed. Verify the URL is accessible.`);
    }
  }

  // Deduplicate
  return [...new Set(recs)].slice(0, 5);
}

/**
 * Dry-run a test suite: parse all instructions and return without executing.
 */
export function dryRunNLTestSuite(
  suite: { name: string; tests: NLTestCase[] }
): { name: string; tests: Array<{ name: string; steps: NLTestStep[] }> } {
  return {
    name: suite.name,
    tests: suite.tests.map(t => ({
      name: t.name,
      steps: t.steps,
    })),
  };
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
    fuzzyMatch = false,
  } = options;

  const startTime = Date.now();
  const testResults: NLTestCaseResult[] = [];

  console.log(`\n🧪 Running Test Suite: ${suite.name}`);
  console.log(`   Tests: ${suite.tests.length}`);
  console.log(`   Continue on failure: ${continueOnFailure}`);
  if (fuzzyMatch) console.log(`   Fuzzy matching: enabled`);
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
        console.log(`     [${step.action}${step.target ? `: ${step.target}` : ""}${step.value ? ` = "${step.value}"` : ""}]`);

        const stepStartTime = Date.now();
        let stepPassed = true;
        let stepErrorObj: NLTestStepError | undefined;
        let screenshot: string | undefined;
        let actualValue: string | undefined;

        try {
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
              const page = (browser as any).page as Page;
              if (page) {
                await page.evaluate((d) => window.scrollBy(0, d), direction);
              }
              break;
            }

            case "wait": {
              if (step.target) {
                const page = (browser as any).page as Page;
                if (page) {
                  await page.waitForSelector(`text=${step.target}`, { timeout: stepTimeout });
                }
              } else {
                const ms = parseFloat(step.value || "1") * 1000;
                await new Promise(r => setTimeout(r, ms));
              }
              break;
            }

            case "assert": {
              if (fuzzyMatch && step.assertionType === "contains") {
                // Fuzzy match: case-insensitive substring with normalized whitespace
                const page = await browser.getPage();
                if (step.target) {
                  const expected = step.target.toLowerCase().replace(/\s+/g, " ").trim();
                  const title = (await page.title()).toLowerCase().replace(/\s+/g, " ").trim();
                  const bodyText = (await page.evaluate(() => document.body?.innerText || "")).toLowerCase().replace(/\s+/g, " ").trim();
                  const url = page.url().toLowerCase();

                  let matched = false;
                  if (step.assertionType === "contains") {
                    matched = bodyText.includes(expected) || title.includes(expected) || url.includes(expected);
                  }
                  stepPassed = matched;
                  actualValue = matched ? `Found (fuzzy)` : `Not found`;
                  if (!matched) {
                    const partialMatches = findPartialMatches(bodyText, expected);
                    stepErrorObj = {
                      reason: "Fuzzy match failed",
                      expected: step.target,
                      actual: `Page text does not contain "${step.target}" (case-insensitive)`,
                      partialMatches,
                      suggestion: generateAssertionSuggestion(step, actualValue, partialMatches),
                    };
                  }
                }
              } else {
                const assertResult = await browser.assert(step.instruction);
                stepPassed = assertResult.passed;
                actualValue = String(assertResult.actual);
                if (!assertResult.passed) {
                  // Enrich the error with partial matches
                  let partialMatches: string[] | undefined;
                  if (step.assertionType === "contains" && step.target) {
                    try {
                      const page = await browser.getPage();
                      const pageText = await page.evaluate(() => document.body?.innerText || "");
                      partialMatches = findPartialMatches(pageText, step.target);
                    } catch {}
                  }
                  stepErrorObj = {
                    reason: assertResult.message,
                    actual: assertResult.actual !== undefined ? String(assertResult.actual) : undefined,
                    expected: assertResult.expected !== undefined ? String(assertResult.expected) : step.target,
                    partialMatches,
                    suggestion: generateAssertionSuggestion(step, actualValue, partialMatches),
                  };
                }
              }
              break;
            }

            case "screenshot": {
              screenshot = await browser.screenshot();
              break;
            }

            case "unknown": {
              console.log(`   ⚠️ Unknown instruction, attempting smart interpretation...`);
              const result = await browser.smartClick(step.target || step.instruction);
              if (!result.success) {
                throw new Error(`Could not interpret: ${step.instruction}`);
              }
              break;
            }
          }

          if (stepPassed) {
            console.log(`     ✓ Passed (${Date.now() - stepStartTime}ms)`);
          } else {
            testPassed = false;
            testError = testError || stepErrorObj?.reason || "Assertion failed";
            console.log(`     ✗ Failed: ${stepErrorObj?.reason || "Assertion failed"}`);
            if (stepErrorObj?.suggestion) {
              console.log(`     💡 ${stepErrorObj.suggestion}`);
            }
            if (screenshotOnFailure) {
              try { screenshot = await browser.screenshot(); } catch {}
            }
          }
        } catch (e: any) {
          stepPassed = false;
          testPassed = false;
          testError = testError || e.message;
          stepErrorObj = {
            reason: e.message,
            suggestion: step.action === "click"
              ? `Try using a more specific selector or check if an overlay is blocking.`
              : step.action === "fill"
                ? `Check if the form field is visible and not disabled.`
                : undefined,
          };

          console.log(`     ✗ Failed: ${e.message}`);

          if (screenshotOnFailure) {
            try { screenshot = await browser.screenshot(); } catch {}
          }
        }

        stepResults.push({
          instruction: step.instruction,
          parsed: step,
          action: step.action,
          passed: stepPassed,
          duration: Date.now() - stepStartTime,
          error: stepErrorObj,
          screenshot,
          actualValue,
        });

        if (!stepPassed && !continueOnFailure) break;
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
  const recommendations = generateRecommendations(testResults);

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
    recommendations: recommendations.length > 0 ? recommendations : undefined,
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

  // Step-level details for all tests
  for (const test of result.testResults) {
    const icon = test.passed ? "✅" : "❌";
    lines.push(`${icon} ${test.name}`);

    for (const step of test.stepResults) {
      const stepIcon = step.passed ? "  ✓" : "  ✗";
      const parsedInfo = step.parsed
        ? `[${step.parsed.action}${step.parsed.target ? `: ${step.parsed.target}` : ""}${step.parsed.value ? ` = "${step.parsed.value}"` : ""}]`
        : "";
      lines.push(`${stepIcon} ${step.instruction}  ${parsedInfo}  (${step.duration}ms)`);

      if (!step.passed && step.error) {
        lines.push(`      Error: ${step.error.reason}`);
        if (step.error.expected) {
          lines.push(`      Expected: ${step.error.expected}`);
        }
        if (step.error.actual) {
          lines.push(`      Actual:   ${step.error.actual}`);
        }
        if (step.error.partialMatches && step.error.partialMatches.length > 0) {
          lines.push(`      Partial matches:`);
          for (const match of step.error.partialMatches) {
            lines.push(`        - "${match}"`);
          }
        }
        if (step.error.suggestion) {
          lines.push(`      💡 ${step.error.suggestion}`);
        }
        if (step.screenshot) {
          lines.push(`      Screenshot: ${step.screenshot}`);
        }
      }
    }

    lines.push("");
  }

  // Recommendations
  if (result.recommendations && result.recommendations.length > 0) {
    lines.push("💡 RECOMMENDATIONS");
    lines.push("─".repeat(60));
    for (const rec of result.recommendations) {
      lines.push(`  • ${rec}`);
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
