/**
 * CBrowser v7.x Smart Automation Examples
 *
 * Demonstrates:
 * - Smart click with auto-retry
 * - Natural language assertions
 * - Self-healing selector cache
 * - AI test generation
 * - Modular imports
 *
 * Run with: npx ts-node examples/smart-automation.ts
 * Or: bun run examples/smart-automation.ts
 */

import { CBrowser } from "cbrowser";
// For local development: import { CBrowser } from "../src/index.js";

async function smartClickExample() {
  console.log("=== Smart Click with Auto-Retry ===\n");

  const browser = new CBrowser({ headless: true });

  try {
    await browser.navigate("https://example.com");

    // Smart click automatically:
    // 1. Checks self-healing cache for known working selectors
    // 2. Tries the original selector
    // 3. Generates alternatives (text variants, ARIA roles, attributes)
    // 4. Retries with each alternative
    // 5. Caches the working selector for future use
    const result = await browser.smartClick("More information...", {
      maxRetries: 3,
    });

    console.log(`Success: ${result.success}`);
    console.log(`Attempts: ${result.attempts.length}`);
    console.log(`Final selector: ${result.finalSelector}`);

    if (result.aiSuggestion) {
      console.log(`AI suggestion: ${result.aiSuggestion}`);
    }
  } finally {
    await browser.close();
  }
}

async function assertionsExample() {
  console.log("\n=== Natural Language Assertions ===\n");

  const browser = new CBrowser({ headless: true });

  try {
    await browser.navigate("https://example.com");

    // Title assertions
    const titleResult = await browser.assert("title contains 'Example'");
    console.log(`Title assertion: ${titleResult.passed ? "PASS" : "FAIL"}`);
    console.log(`  Message: ${titleResult.message}`);

    // URL assertions
    const urlResult = await browser.assert("url contains 'example.com'");
    console.log(`URL assertion: ${urlResult.passed ? "PASS" : "FAIL"}`);
    console.log(`  Message: ${urlResult.message}`);

    // Content assertions
    const contentResult = await browser.assert(
      "page contains 'illustrative examples'"
    );
    console.log(`Content assertion: ${contentResult.passed ? "PASS" : "FAIL"}`);
    console.log(`  Message: ${contentResult.message}`);

    // Element count assertions
    const linkResult = await browser.assert("1 links");
    console.log(`Link count assertion: ${linkResult.passed ? "PASS" : "FAIL"}`);
    console.log(`  Actual: ${linkResult.actual}, Expected: ${linkResult.expected}`);
  } finally {
    await browser.close();
  }
}

async function selfHealingExample() {
  console.log("\n=== Self-Healing Selector Cache ===\n");

  const browser = new CBrowser({ headless: true });

  try {
    // Get cache statistics
    const stats = browser.getSelectorCacheStats();
    console.log(`Cache entries: ${stats.totalEntries}`);
    console.log(`Total successes: ${stats.totalSuccesses}`);
    console.log(`Total failures: ${stats.totalFailures}`);

    if (stats.topDomains.length > 0) {
      console.log("\nTop domains:");
      for (const { domain, count } of stats.topDomains) {
        console.log(`  ${domain}: ${count} cached selectors`);
      }
    }

    // The cache is stored in ~/.cbrowser/selector-cache.json
    // Each entry maps: domain + originalSelector -> workingSelector
    // When a selector fails, CBrowser checks the cache first
    // If found, it uses the cached working selector
    // If not found, it tries alternatives and caches the one that works
  } finally {
    await browser.close();
  }
}

async function testGenerationExample() {
  console.log("\n=== AI Test Generation ===\n");

  const browser = new CBrowser({ headless: true });

  try {
    // Generate tests for a page
    const result = await browser.generateTests("https://example.com");

    console.log(`Page analyzed: ${result.url}`);
    console.log(`Tests generated: ${result.tests.length}\n`);

    // Show generated test scenarios
    for (const test of result.tests) {
      console.log(`Test: ${test.name}`);
      console.log(`  Description: ${test.description}`);
      console.log(`  Steps: ${test.steps.length}`);
      console.log(`  Assertions: ${test.assertions.join(", ")}`);
      console.log();
    }

    // Generated Playwright code
    console.log("=== Generated Playwright Code ===");
    console.log(result.playwrightCode.slice(0, 500) + "...\n");

    // Generated CBrowser script
    console.log("=== Generated CBrowser Script ===");
    console.log(result.cbrowserScript.slice(0, 500) + "...\n");
  } finally {
    await browser.close();
  }
}

async function pageAnalysisExample() {
  console.log("\n=== Page Analysis ===\n");

  const browser = new CBrowser({ headless: true });

  try {
    await browser.navigate("https://example.com");

    const analysis = await browser.analyzePage();

    console.log(`Title: ${analysis.title}`);
    console.log(`URL: ${analysis.url}`);
    console.log(`Forms: ${analysis.forms.length}`);
    console.log(`Buttons: ${analysis.buttons.length}`);
    console.log(`Links: ${analysis.links.length}`);
    console.log(`Inputs: ${analysis.inputs.length}`);
    console.log(`Has login form: ${analysis.hasLogin}`);
    console.log(`Has search: ${analysis.hasSearch}`);
    console.log(`Has navigation: ${analysis.hasNavigation}`);

    // Detailed form analysis
    if (analysis.forms.length > 0) {
      console.log("\nForm details:");
      for (const form of analysis.forms) {
        console.log(`  Selector: ${form.selector}`);
        console.log(`  Fields: ${form.fields.length}`);
        console.log(`  Is login: ${form.isLoginForm}`);
        console.log(`  Is search: ${form.isSearchForm}`);
      }
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  await smartClickExample();
  await assertionsExample();
  await selfHealingExample();
  await testGenerationExample();
  await pageAnalysisExample();
}

main().catch(console.error);
