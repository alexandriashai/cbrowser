/**
 * CBrowser Basic Usage Examples
 *
 * Run with: npx ts-node examples/basic-usage.ts
 * Or: bun run examples/basic-usage.ts
 */

import { CBrowser } from "cbrowser";
// For local development: import { CBrowser } from "../src/index.js";

async function basicNavigation() {
  console.log("=== Basic Navigation ===\n");

  const browser = new CBrowser({ headless: true });

  try {
    // Navigate to a page
    const result = await browser.navigate("https://example.com");
    console.log(`Navigated to: ${result.url}`);
    console.log(`Page title: ${result.title}`);
    console.log(`Load time: ${result.loadTime}ms`);

    // Extract headings
    const headings = await browser.extract("headings");
    console.log("\nHeadings found:", JSON.stringify(headings.data, null, 2));

    // Take a screenshot
    const screenshot = await browser.screenshot("./example-screenshot.png");
    console.log(`\nScreenshot saved: ${screenshot}`);
  } finally {
    await browser.close();
  }
}

async function sessionPersistence() {
  console.log("\n=== Session Persistence ===\n");

  const browser = new CBrowser({ headless: true });

  try {
    // Navigate and save session
    await browser.navigate("https://example.com");
    await browser.saveSession("example-session");
    console.log("Session saved: example-session");

    // List sessions
    const sessions = browser.listSessions();
    console.log("Available sessions:", sessions);
  } finally {
    await browser.close();
  }

  // New browser instance, load session
  const browser2 = new CBrowser({ headless: true });

  try {
    const loaded = await browser2.loadSession("example-session");
    console.log(`Session loaded: ${loaded}`);
  } finally {
    await browser2.close();
  }
}

async function personaJourney() {
  console.log("\n=== Persona Journey ===\n");

  const browser = new CBrowser({ headless: true });

  try {
    const result = await browser.journey({
      persona: "first-timer",
      startUrl: "https://example.com",
      goal: "Find more information",
      maxSteps: 5,
    });

    console.log(`Journey completed: ${result.success}`);
    console.log(`Steps taken: ${result.steps.length}`);
    console.log(`Total time: ${result.totalTime}ms`);

    if (result.frictionPoints.length > 0) {
      console.log("\nFriction points found:");
      for (const point of result.frictionPoints) {
        console.log(`  - ${point}`);
      }
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  await basicNavigation();
  await sessionPersistence();
  await personaJourney();
}

main().catch(console.error);
