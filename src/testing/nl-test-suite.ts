/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */


/**
 * Natural Language Test Suites
 *
 * Parse and run tests written in natural language.
 */

import type { Page } from "playwright";
import { existsSync, readFileSync } from "fs";

import { CBrowser } from "../browser.js";
import {
  finishAutoCapture,
  resolveCaptureOptions,
  startAutoCapture,
  type AutoCaptureResult,
  type AutoCaptureSetting,
} from "../recording/auto-capture.js";
import type {
  NLTestStep,
  NLTestCase,
  NLTestStepResult,
  NLTestStepError,
  NLTestCaseResult,
  NLTestSuiteResult,
  SmartRetryResult,
} from "../types.js";

/** Opening quote -> its closing partner. Typographic pairs included: pasted and model-written tests carry them. */
const QUOTE_PAIRS: Record<string, string> = { '"': '"', "'": "'", "\u201C": "\u201D", "\u2018": "\u2019" };

/**
 * Strip ONE pair of enclosing quotes from a step target: `"Pricing"` -> `Pricing`.
 *
 * Only when the string both starts and ends with a matching pair and the inside
 * holds no further quote of that kind, so a selector that merely contains
 * quotes is left alone: `[data-testid="x"]` and `"a" or "b"` come back as given.
 *
 * Without this the quotes stayed in the target: smartClick searched for the
 * literal text `"Pricing"`, and the recommendation wrapped it again as
 * `Click ""Pricing"" failed`.
 */
export function unquote(text: string): string {
  const t = text.trim();
  if (t.length < 2) return t;
  const open = t[0];
  const close = QUOTE_PAIRS[open];
  if (!close || t[t.length - 1] !== close) return t;
  const inner = t.slice(1, -1);
  if (inner.includes(open) || inner.includes(close) || inner.trim() === "") return t;
  return inner;
}

/**
 * Build the error for a click (or uninterpretable step) that smartClick could
 * not complete. It used to be `throw new Error("Failed to click: X")`, which
 * discarded the aiSuggestion and attempts smartClick had already worked out,
 * and the catch below then substituted a generic "try a more specific
 * selector". Now the step carries what was on the page and what was tried.
 */
async function clickFailure(browser: CBrowser, reason: string, result: SmartRetryResult): Promise<NLTestStepError> {
  let availableElements: NLTestStepError["availableElements"];
  try {
    availableElements = (await browser.getAvailableClickables()).slice(0, 20).map((e) => ({
      tag: e.tag,
      text: e.text,
      selector: e.selector,
      ...(e.role ? { role: e.role } : {}),
      ...(e.region ? { region: e.region } : {}),
    }));
  } catch {
    // The failure is still reported, just without the element list.
  }
  return {
    reason: result.message ? `${reason} (${result.message})` : reason,
    suggestion: result.aiSuggestion
      ?? (result.zone === "red"
        ? "Refused as a red-zone action. NL test steps never pass force, so this step cannot run unattended."
        : "Try using a more specific selector or check if an overlay is blocking."),
    availableElements,
    selectorsTried: result.attempts.map((a) => a.selector),
  };
}

/**
 * Parse a single natural language instruction into an NLTestStep.
 *
 * Supported patterns:
 * - "go to https://..." / "navigate to https://..." / "open https://..."
 * - "click [the] <target>" / "press <target>"
 * - "type '<value>' in[to] <target>" / "fill <target> with '<value>'"
 * - "select '<option>' from <dropdown>"
 * - "scroll down/up [N times | N pixels]" / "scroll to [the] top/bottom [of the page]"
 * - "set cookie <name> to <value>" (applies to the current page's origin — navigate first)
 * - "tap at <x>,<y>" / "click at <x>,<y>" (real pointer events at viewport coordinates)
 * - "wait [for] <seconds> seconds"
 * - "wait for content" / "wait for page to load" / "wait for page ready" (v16.7.1)
 * - "wait for '<text>' appears" / "wait for <element> to appear" (v16.7.1)
 * - "verify <assertion>" / "assert <assertion>" / "check <assertion>"
 * - "take screenshot"
 */
export function parseNLInstruction(instruction: string): NLTestStep {
  const trimmed = instruction.trim();
  // Use lowercase for pattern detection, but extract from original to preserve case
  const lower = trimmed.toLowerCase();

  // Navigate patterns
  const navigateMatch = lower.match(/^(?:go to|navigate to|open|visit)\s+(.+)$/i);
  if (navigateMatch) {
    // Extract from original instruction to preserve URL case
    const originalMatch = trimmed.match(/^(?:go to|navigate to|open|visit)\s+(.+)$/i);
    return {
      instruction,
      action: "navigate",
      target: unquote(originalMatch ? originalMatch[1] : navigateMatch[1]),
    };
  }

  // Coordinate tap MUST parse before the generic click pattern (which would swallow it)
  const tapAtMatch = lower.match(/^(?:tap|click)\s+at\s+(\d+)\s*[,x]\s*(\d+)$/i);
  if (tapAtMatch) {
    return {
      instruction,
      action: "click",
      target: `at:${tapAtMatch[1]},${tapAtMatch[2]}`,
    };
  }

  // Click patterns - preserve original case for target
  const clickMatch = lower.match(/^(?:click|tap|press)\s+(?:on\s+)?(?:the\s+)?(.+)$/i);
  if (clickMatch) {
    const originalMatch = trimmed.match(/^(?:click|tap|press)\s+(?:on\s+)?(?:the\s+)?(.+)$/i);
    return {
      instruction,
      action: "click",
      target: unquote(originalMatch ? originalMatch[1] : clickMatch[1]),
    };
  }

  // Fill patterns: "type 'value' in target" or "fill target with 'value'"
  // CRITICAL: Preserve case for both value and target
  const typeMatch = lower.match(/^(?:type|enter)\s+['"](.+?)['"]\s+(?:in|into)\s+(?:the\s+)?(.+)$/i);
  if (typeMatch) {
    const originalMatch = trimmed.match(/^(?:type|enter)\s+['"](.+?)['"]\s+(?:in|into)\s+(?:the\s+)?(.+)$/i);
    return {
      instruction,
      action: "fill",
      value: originalMatch ? originalMatch[1] : typeMatch[1],
      target: unquote(originalMatch ? originalMatch[2] : typeMatch[2]),
    };
  }

  const fillMatch = lower.match(/^fill\s+(?:the\s+)?(.+?)\s+with\s+['"](.+?)['"]$/i);
  if (fillMatch) {
    const originalMatch = trimmed.match(/^fill\s+(?:the\s+)?(.+?)\s+with\s+['"](.+?)['"]$/i);
    return {
      instruction,
      action: "fill",
      target: unquote(originalMatch ? originalMatch[1] : fillMatch[1]),
      value: originalMatch ? originalMatch[2] : fillMatch[2],
    };
  }

  // Select patterns - preserve case for option value
  const selectMatch = lower.match(/^select\s+['"](.+?)['"]\s+(?:from|in)\s+(?:the\s+)?(.+)$/i);
  if (selectMatch) {
    const originalMatch = trimmed.match(/^select\s+['"](.+?)['"]\s+(?:from|in)\s+(?:the\s+)?(.+)$/i);
    return {
      instruction,
      action: "select",
      value: originalMatch ? originalMatch[1] : selectMatch[1],
      target: unquote(originalMatch ? originalMatch[2] : selectMatch[2]),
    };
  }

  // Scroll patterns
  const scrollToMatch = lower.match(/^scroll\s+to\s+(?:the\s+)?(top|bottom)(?:\s+of\s+the\s+page)?$/i);
  if (scrollToMatch) {
    return {
      instruction,
      action: "scroll",
      target: scrollToMatch[1],
    };
  }
  const scrollMatch = lower.match(/^scroll\s+(up|down|left|right)(?:\s+(\d+)\s+(times|pixels))?$/i);
  if (scrollMatch) {
    return {
      instruction,
      action: "scroll",
      target: scrollMatch[1],
      value: scrollMatch[2] || "1",
      unit: (scrollMatch[3] as "times" | "pixels" | undefined) || "times",
    };
  }

  // Cookie pattern — "set cookie NAME to VALUE" (value from the ORIGINAL string to preserve case)
  const cookieMatch = trimmed.match(/^set\s+cookie\s+(\S+)\s+to\s+(.+)$/i);
  if (cookieMatch) {
    return {
      instruction,
      action: "cookie",
      target: cookieMatch[1],
      value: cookieMatch[2].trim(),
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

  // Wait for text pattern. Matched on `trimmed`, not `lower`: the pattern is
  // already /i, and the captured text goes to waitForSelector and to an
  // innerText.includes() fallback, both of which are case-sensitive.
  const waitForMatch = trimmed.match(/^wait\s+(?:for|until)\s+['"](.+?)['"]\s+(?:appears?|is visible|shows?)$/i);
  if (waitForMatch) {
    return {
      instruction,
      action: "wait",
      target: waitForMatch[1],
    };
  }

  // v16.7.1: Wait for content/page ready patterns
  const waitForContentMatch = lower.match(/^wait\s+(?:for\s+)?(?:page\s+)?(?:content|to\s+load|ready|stable|idle)$/i);
  if (waitForContentMatch) {
    return {
      instruction,
      action: "wait",
      target: "__networkidle__",
    };
  }

  // v16.7.1: Wait for element pattern (more flexible). `trimmed` for the same
  // reason: a selector like #SubmitBtn must not arrive as #submitbtn.
  const waitForElementMatch = trimmed.match(/^wait\s+(?:for|until)\s+(?:the\s+)?(.+?)\s+(?:to\s+)?(?:appear|load|exist|be\s+visible)$/i);
  if (waitForElementMatch) {
    return {
      instruction,
      action: "wait",
      target: waitForElementMatch[1],
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

  // Matched against `trimmed`, not `lower`: every pattern is /i already, and
  // matching the lowercased copy returned a lowercased target, so an exact
  // assertion could never be exact.
  for (const { pattern, type, assertType } of assertPatterns) {
    const match = trimmed.match(pattern);
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
  /**
   * Record the run to GIF/WebP/video (v18.70.0).
   *
   * `true` uses defaults; pass an options object to set fps, formats or output
   * directory. The capture starts once the browser is up and stops before it
   * closes, so no separate capture_start/capture_stop call is needed. Capture
   * failures never fail the suite — they are reported on `result.capture.error`.
   */
  capture?: AutoCaptureSetting;
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
      // No quotes around the instruction: it usually carries its own ("verify
      // page contains "X"") and wrapping it produced doubled quotes. (B13)
      recs.push(`Step failed on exact match but found similar text: ${step.instruction}. Consider using fuzzy matching.`);
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
    capture,
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

  let captureResult: AutoCaptureResult | undefined;
  let captureSession: Awaited<ReturnType<typeof startAutoCapture>> = null;

  try {
    await browser.launch();

    // Auto-capture (v18.70.0): starts here so the recording covers every test
    // in the suite, and stops in the finally below before the browser closes.
    captureSession = await startAutoCapture(
      await browser.getPage(),
      capture,
      `suite-${suite.name.replace(/[^a-zA-Z0-9-_]+/g, "-").toLowerCase()}-${Date.now()}`,
    );
    if (captureSession) console.log(`   🎥 Capturing to ${captureSession.status().outDir}`);

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
              const coordTarget = (step.target || "").match(/^at:(\d+),(\d+)$/);
              if (coordTarget) {
                const page = (browser as any).page as Page;
                if (page) {
                  const x = parseInt(coordTarget[1], 10);
                  const y = parseInt(coordTarget[2], 10);
                  // A coordinate click activates whatever control is at the point: same red-zone gate as click.
                  const refusal = await browser.pointRedZone(x, y);
                  if (refusal) throw new Error(refusal);
                  await page.mouse.move(x, y);
                  await page.mouse.down();
                  await page.mouse.up();
                }
                break;
              }
              const result = await browser.smartClick(step.target || "");
              if (!result.success) {
                stepPassed = false;
                stepErrorObj = await clickFailure(browser, `Failed to click: ${step.target}`, result);
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
              const page = (browser as any).page as Page;
              if (page) {
                const target = step.target?.toLowerCase();
                if (target === "top" || target === "bottom") {
                  await page.evaluate((t) => {
                    window.scrollTo(0, t === "bottom" ? document.documentElement.scrollHeight : 0);
                  }, target);
                } else {
                  const sign = target === "up" ? -1 : 1;
                  const n = parseInt(step.value || "1", 10) || 1;
                  const delta = sign * (step.unit === "pixels" ? n : n * 500);
                  await page.evaluate((d) => window.scrollBy(0, d), delta);
                }
              }
              break;
            }

            case "cookie": {
              const page = (browser as any).page as Page;
              if (!page || !step.target) {
                throw new Error(
                  `Cookie step could not run (page=${!!page}, name=${step.target ?? "<missing>"}) — navigate before setting cookies`
                );
              }
              // A site-set cookie of the same name (often dot-domain, e.g. an anon PHP
              // session) would otherwise COEXIST with ours (host-only vs dot-domain are
              // distinct identities) and win first-occurrence parsing server-side.
              // Clear same-name cookies first so this is a true replacement.
              const host = new URL(page.url()).hostname;
              try {
                await page.context().clearCookies({ name: step.target });
              } catch {
                /* clearCookies filters unsupported on old Playwright — best effort */
              }
              await page.context().addCookies([
                { name: step.target, value: step.value || "", domain: host, path: "/" },
              ]);
              break;
            }

            case "wait": {
              if (step.target) {
                const page = (browser as any).page as Page;
                if (page) {
                  // v16.7.1: Handle special wait-for-content directive
                  if (step.target === "__networkidle__") {
                    await page.waitForLoadState("networkidle", { timeout: stepTimeout });
                  } else {
                    // Try text selector first, fall back to regular selector
                    try {
                      await page.waitForSelector(`text=${step.target}`, { timeout: stepTimeout });
                    } catch {
                      // Fallback: try as a regular selector or role
                      await page.waitForSelector(step.target, { timeout: stepTimeout }).catch(() => {
                        // Final fallback: wait for any element containing the text
                        const targetText = step.target!;
                        return page.waitForFunction(
                          (text) => document.body?.innerText?.includes(text) ?? false,
                          targetText,
                          { timeout: stepTimeout }
                        );
                      });
                    }
                  }
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
                // Exact unless fuzzy matching was asked for: the fuzzy branch
                // above is the case-insensitive one, so this one must not be.
                const assertResult = await browser.assert(step.instruction, { caseSensitive: !fuzzyMatch });
                stepPassed = assertResult.passed;
                // v11.7.1: Don't stringify undefined to "undefined"
                actualValue = assertResult.actual !== undefined ? String(assertResult.actual) : undefined;
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
                stepPassed = false;
                stepErrorObj = await clickFailure(browser, `Could not interpret: ${step.instruction}`, result);
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
    // Stop before the browser closes — the page has to still exist. Bounded, so
    // a wedged recorder cannot hang the suite (see finishAutoCapture).
    captureResult = await finishAutoCapture(
      captureSession,
      resolveCaptureOptions(capture)?.stopTimeoutMs,
    );
    await browser.close();
  }

  const passed = testResults.filter(t => t.passed).length;
  const failed = testResults.filter(t => !t.passed).length;
  const recommendations = generateRecommendations(testResults);

  // v11.6.0: Calculate step-level statistics for better granularity
  let totalSteps = 0;
  let passedSteps = 0;
  let failedSteps = 0;
  for (const test of testResults) {
    if (test.stepResults) {
      totalSteps += test.stepResults.length;
      passedSteps += test.stepResults.filter(s => s.passed).length;
      failedSteps += test.stepResults.filter(s => !s.passed).length;
    }
  }
  const stepPassRate = totalSteps > 0 ? (passedSteps / totalSteps) * 100 : 0;

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
      totalSteps,
      passedSteps,
      failedSteps,
      stepPassRate,
    },
    recommendations: recommendations.length > 0 ? recommendations : undefined,
    ...(captureResult ? { capture: captureResult } : {}),
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
  lines.push(`${passEmoji} Test Pass Rate: ${result.summary.passed}/${result.summary.total} tests (${result.summary.passRate.toFixed(0)}%)`);
  // v11.6.0: Show step-level pass rate for better granularity
  if (result.summary.totalSteps && result.summary.totalSteps > 0) {
    const stepEmoji = result.summary.stepPassRate === 100 ? "🎉" : (result.summary.stepPassRate ?? 0) >= 80 ? "✅" : "⚠️";
    lines.push(`${stepEmoji} Step Pass Rate: ${result.summary.passedSteps}/${result.summary.totalSteps} steps (${result.summary.stepPassRate?.toFixed(0)}%)`);
  }
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
        if (step.error.selectorsTried && step.error.selectorsTried.length > 0) {
          lines.push(`      Selectors tried: ${step.error.selectorsTried.map((s) => JSON.stringify(s)).join(", ")}`);
        }
        if (step.error.availableElements && step.error.availableElements.length > 0) {
          lines.push(`      Available elements:`);
          for (const el of step.error.availableElements.slice(0, 10)) {
            lines.push(`        - ${el.tag} ${JSON.stringify(el.text)} -> ${el.selector}`);
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
