/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Assertions
 *
 * assert and the natural-language assertion evaluator.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import type { AssertionResult } from "../types.js";
import { extractExpected, extractSubject, UNPARSEABLE_MESSAGE } from "./assertion-value.js";
import type { CBrowser } from "../browser.js";

// =========================================================================
// Tier 5: Assertions (v5.0.0)
// =========================================================================

export async function assert(this: CBrowser, assertion: string, options: { caseSensitive?: boolean } = {}): Promise<AssertionResult> {
  await this.getPage(); // Ensure page exists

  try {
    // Parse the assertion
    const result = await this.evaluateAssertion(assertion, options.caseSensitive === true);

    this.audit("assert", assertion, "green", result.passed ? "success" : "failure");

    return {
      ...result,
      screenshot: await this.screenshot(),
    };
  } catch (error) {
    return {
      passed: false,
      assertion,
      message: `Assertion error: ${error instanceof Error ? error.message : String(error)}`,
      screenshot: await this.screenshot(),
    };
  }
}

export async function evaluateAssertion(this: CBrowser, assertion: string, caseSensitive = false): Promise<Omit<AssertionResult, "screenshot">> {
  const page = await this.getPage();
  const lowerAssertion = assertion.toLowerCase();
  // Lowercase both sides only when the caller did not ask for an exact compare.
  const textContains = (haystack: string, needle: string): boolean =>
    caseSensitive ? haystack.includes(needle) : haystack.toLowerCase().includes(needle.toLowerCase());

  // Page title assertions
  if (lowerAssertion.includes("title") && (lowerAssertion.includes("is") || lowerAssertion.includes("contains"))) {
    const title = await page.title();
    const expected = extractExpected(assertion);
    if (expected === null) return { passed: false, assertion, actual: title, message: UNPARSEABLE_MESSAGE };

    if (lowerAssertion.includes("contains")) {
      const passed = textContains(title, expected);
      return { passed, assertion, actual: title, expected, message: passed ? "Title contains expected text" : `Title "${title}" does not contain "${expected}"` };
    } else {
      const passed = title === expected;
      return { passed, assertion, actual: title, expected, message: passed ? "Title matches" : `Title "${title}" does not match "${expected}"` };
    }
  }

  // URL assertions
  if (lowerAssertion.includes("url") && (lowerAssertion.includes("is") || lowerAssertion.includes("contains"))) {
    const url = page.url();
    const expected = extractExpected(assertion);
    if (expected === null) return { passed: false, assertion, actual: url, message: UNPARSEABLE_MESSAGE };

    if (lowerAssertion.includes("contains")) {
      const passed = url.includes(expected);
      return { passed, assertion, actual: url, expected, message: passed ? "URL contains expected text" : `URL "${url}" does not contain "${expected}"` };
    } else {
      const passed = url === expected;
      return { passed, assertion, actual: url, expected, message: passed ? "URL matches" : `URL "${url}" does not match "${expected}"` };
    }
  }

  // Text presence assertions
  // v14.3.0: Filter script/style content to avoid ad injection false negatives
  if (lowerAssertion.includes("page") && (lowerAssertion.includes("contains") || lowerAssertion.includes("has") || lowerAssertion.includes("shows"))) {
    const expected = extractExpected(assertion);
    if (expected === null) return { passed: false, assertion, message: UNPARSEABLE_MESSAGE };
    // v14.3.0: Use filtered text extraction (excludes script/style content)
    const content = await page.evaluate(() => {
      const clone = document.body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
      return clone.innerText || clone.textContent || "";
    }) || "";
    const passed = textContains(content, expected);
    // v11.7.1: Include actual content snippet for debugging (truncated to 200 chars)
    const actualSnippet = content.length > 200 ? content.substring(0, 200) + "..." : content;

    return { passed, assertion, actual: actualSnippet, expected, message: passed ? `Page contains "${expected}"` : `Page does not contain "${expected}"` };
  }

  // Element existence assertions
  if (lowerAssertion.includes("exists") || lowerAssertion.includes("visible") || lowerAssertion.includes("present")) {
    const selector = extractSubject(assertion);
    if (selector === null) return { passed: false, assertion, message: UNPARSEABLE_MESSAGE };
    const element = await this.findElement(selector);
    const passed = element !== null;

    return { passed, assertion, expected: selector, message: passed ? `Element "${selector}" exists` : `Element "${selector}" not found` };
  }

  // Element count assertions
  const countMatch = lowerAssertion.match(/(\d+)\s+(items?|elements?|buttons?|links?|rows?)/);
  if (countMatch) {
    const expectedCount = parseInt(countMatch[1]);
    const elementType = countMatch[2];

    let selectorForType: string;
    switch (elementType.replace(/s$/, "")) {
      case "button": selectorForType = "button, [role='button']"; break;
      case "link": selectorForType = "a"; break;
      case "row": selectorForType = "tr"; break;
      case "item": selectorForType = "li"; break;
      default: selectorForType = "*"; break;
    }

    const elements = await page.$$(selectorForType);
    const actualCount = elements.length;
    const passed = actualCount === expectedCount;

    return { passed, assertion, actual: String(actualCount), expected: String(expectedCount), message: passed ? `Found ${expectedCount} ${elementType}` : `Expected ${expectedCount} ${elementType} but found ${actualCount}` };
  }

  // Default: treat as text search
  const match = assertion.match(/["']([^"']+)["']/);
  if (match) {
    const expected = match[1];
    // v17.3.2: Use same filtered text extraction as "page contains" assertions
    // This normalizes whitespace and removes script/style content
    const content = await page.evaluate(() => {
      const clone = document.body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
      // Get innerText (normalizes whitespace) and clean it up
      let text = clone.innerText || clone.textContent || "";
      // Normalize whitespace: collapse multiple spaces/newlines to single space
      text = text.replace(/[\n\t\r]+/g, ' ').replace(/\s+/g, ' ').trim();
      return text;
    }) || "";
    const passed = textContains(content, expected);

    return { passed, assertion, expected, message: passed ? `Found "${expected}"` : `Did not find "${expected}"` };
  }

  return { passed: false, assertion, message: "Could not parse assertion. Use quotes around expected values." };
}
