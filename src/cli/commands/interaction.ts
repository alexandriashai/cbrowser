/**
 * Navigation, interaction, extraction and page scripting: navigate, click,
 * hover, type, press, drag, evaluate, keyboard, upload, fill, extract,
 * screenshot, smart-click, dismiss-overlay, assert, heal, generate, analyze.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */

import { getOutputOptions } from "../../output.js";
import { runEvaluate } from "../evaluate.js";
import { EXTRACT_KINDS } from "../flags.js";
import { printData } from "../format.js";
import { runKeyboard } from "../keyboard.js";
import type { CommandContext } from "../context.js";

/** Runs `command` when it belongs to this group; false when it does not. */
export async function runInteractionCommand(ctx: CommandContext): Promise<boolean> {
  const { command, args, options, browser } = ctx;
  switch (command) {
    case "navigate": {
      const url = args[0] || (typeof options.url === "string" ? options.url : undefined);
      if (!url) {
        console.error("Error: URL required");
        process.exit(1);
      }
      const result = await browser.navigate(url);
      // A navigation that landed somewhere else (an interstitial, a
      // cross-host redirect) reports success: false; it used to print
      // "Navigated to" and exit 0.
      if (result.success === false) {
        console.error(`✗ Navigation to ${url} did not land on that page (now at ${result.url})`);
        process.exitCode = 1;
      }
      console.log(`${result.success === false ? "✗" : "✓"} Navigated to: ${result.url}`);
      console.log(`  Title: ${result.title}`);
      console.log(`  Load time: ${result.loadTime}ms`);
      console.log(`  Screenshot: ${result.screenshot}`);
      if (result.errors.length > 0) {
        console.log(`  Errors: ${result.errors.length}`);
      }
      break;
    }

    case "click": {
      const selector = args[0];
      if (!selector) {
        console.error("Error: Selector required");
        process.exit(1);
      }
      // Navigate first if URL provided
      if (options.url) {
        await browser.navigate(options.url as string);
      }
      const verbose = options.verbose === true;
      const debugDir = options["debug-dir"] as string | undefined;
      const result = await browser.click(selector, { force: options.force === true, verbose, debugDir });
      if (result.success) {
        console.log(`✓ ${result.message}`);
      } else {
        console.error(`✗ ${result.message}`);
        if (verbose && result.aiSuggestion) {
          console.error(`\n💡 ${result.aiSuggestion}`);
        }
        if (verbose && result.availableElements && result.availableElements.length > 0) {
          console.error(`\n📋 Available clickable elements:`);
          for (const el of result.availableElements) {
            console.error(`   ${el.tag}: "${el.text}" → ${el.selector}`);
          }
        }
        if (verbose && result.debugScreenshot) {
          console.error(`\n📸 Debug screenshot: ${result.debugScreenshot}`);
        }
        process.exit(1);
      }
      break;
    }

    case "hover": {
      const selector = args[0];
      if (!selector) {
        console.error("Error: Selector required");
        process.exit(1);
      }
      if (options.url) {
        await browser.navigate(options.url as string);
      }
      const result = await browser.hover(selector);
      if (result.success) {
        console.log(`✓ ${result.message}`);
      } else {
        console.error(`✗ ${result.message}`);
        process.exit(1);
      }
      break;
    }

    case "type": {
      const text = args[0];
      if (!text) {
        console.error("Usage: cbrowser type \"text to type\" [--delay <ms>]");
        process.exit(1);
      }
      if (options.url) await browser.navigate(options.url as string);
      const page = await browser.getPage();
      // parseArgs yields strings, so the old `typeof === "number"` test was
      // never true and --delay was always 50 ms (audit 2026-10-21).
      const delay = typeof options.delay === "string" ? Number(options.delay) : 50;
      if (!Number.isFinite(delay) || delay < 0) {
        console.error(`Error: --delay must be a number of milliseconds, got: ${options.delay}`);
        process.exit(1);
      }
      const refusal = await browser.keystrokeRedZone({ text }, options.force === true);
      if (refusal) {
        console.error(`✗ ${refusal}`);
        process.exit(1);
      }
      await page.keyboard.type(text, { delay });
      console.log(`✓ Typed ${text.length} characters`);
      break;
    }

    case "press": {
      const key = args[0];
      if (!key) {
        console.error("Usage: cbrowser press <key> (e.g., Enter, Tab, Escape, Control+a)");
        process.exit(1);
      }
      if (options.url) await browser.navigate(options.url as string);
      const page = await browser.getPage();
      const refusal = await browser.keystrokeRedZone({ key }, options.force === true);
      if (refusal) {
        console.error(`✗ ${refusal}`);
        process.exit(1);
      }
      await page.keyboard.press(key);
      console.log(`✓ Pressed ${key}`);
      break;
    }

    case "drag": {
      const source = args[0];
      const target = args[1];
      if (!source || !target) {
        console.error("Usage: cbrowser drag <source-selector> <target-selector>");
        process.exit(1);
      }
      if (options.url) await browser.navigate(options.url as string);
      const page = await browser.getPage();
      const refusal = await browser.dragRedZone(source, target, options.force === true);
      if (refusal) {
        console.error(`✗ ${refusal}`);
        process.exit(1);
      }
      await page.dragAndDrop(source, target);
      console.log(`✓ Dragged ${source} → ${target}`);
      break;
    }

    case "eval":
    case "evaluate": {
      await runEvaluate(browser, args, options);
      break;
    }

    case "keyboard": {
      await runKeyboard(browser, args, options);
      break;
    }

    case "upload": {
      const selector = args[0];
      const filePath = args[1];
      if (!selector || !filePath) {
        console.error("Usage: cbrowser upload <selector> <file-path>");
        process.exit(1);
      }
      if (options.url) await browser.navigate(options.url as string);
      const page = await browser.getPage();
      await page.locator(selector).setInputFiles(filePath);
      console.log(`✓ Uploaded ${filePath} to ${selector}`);
      break;
    }

    case "fill": {
      const selector = args[0];
      const value = args[1];
      if (!selector || !value) {
        console.error("Error: Selector and value required");
        process.exit(1);
      }
      if (options.url) {
        await browser.navigate(options.url as string);
      }
      const verbose = options.verbose === true;
      const debugDir = options["debug-dir"] as string | undefined;
      const result = await browser.fill(selector, value, { verbose, debugDir });
      if (result.success) {
        console.log(`✓ ${result.message}`);
      } else {
        console.error(`✗ ${result.message}`);
        if (verbose && result.aiSuggestion) {
          console.error(`\n💡 ${result.aiSuggestion}`);
        }
        if (verbose && result.availableInputs && result.availableInputs.length > 0) {
          console.error(`\n📋 Available input fields:`);
          for (const input of result.availableInputs) {
            const desc = input.label || input.placeholder || input.name || input.type;
            console.error(`   ${desc} (${input.type}) → ${input.selector}`);
          }
        }
        if (verbose && result.debugScreenshot) {
          console.error(`\n📸 Debug screenshot: ${result.debugScreenshot}`);
        }
        process.exit(1);
      }
      break;
    }

    case "extract": {
      let url = typeof options.url === "string" ? options.url : undefined;
      let what = "text";
      if (args[0]) {
        if (args[0].startsWith("http://") || args[0].startsWith("https://") || args[0].startsWith("www.")) {
          url = args[0];
          what = args[1] || "text";
        } else {
          what = args[0];
        }
      }
      if (url) {
        await browser.navigate(url);
      }
      // Five kinds exist. Anything else used to return the whole page text, so
      // a typo ("link") or a description ("all product names") looked like a
      // result (audit 2026-10-21).
      if (!EXTRACT_KINDS.includes(what.toLowerCase())) {
        console.error(`Error: extract takes one of: ${EXTRACT_KINDS.join(", ")} (got "${what}")`);
        process.exit(1);
      }
      const result = await browser.extract(what);
      printData("extract", result.data);
      break;
    }

    // =========================================================================
    // Tier 5: Smart Retry & Assertions (v5.0.0)
    // =========================================================================

    case "smart-click": {
      const selector = args[0];
      if (!selector) {
        console.error("Error: Selector required");
        process.exit(1);
      }

      if (options.url) {
        await browser.navigate(options.url as string);
      }

      const maxRetries = options["max-retries"] ? parseInt(options["max-retries"] as string) : 3;
      const retryDelay = options["retry-delay"] ? parseInt(options["retry-delay"] as string) : 1000;

      console.log(`\n🔄 Smart clicking: "${selector}" (max ${maxRetries} retries)\n`);

      const result = await browser.smartClick(selector, {
        force: options.force === true,
        maxRetries,
        retryDelay,
        dismissOverlays: options["dismiss-overlays"] === true,
      });

      for (const attempt of result.attempts) {
        const status = attempt.success ? "✓" : "✗";
        const altInfo = attempt.alternativeUsed ? ` (${attempt.alternativeUsed})` : "";
        console.log(`  Attempt ${attempt.attempt}: ${status} ${attempt.selector}${altInfo}`);
      }

      if (result.success) {
        console.log(`\n✓ ${result.message}`);
        if (result.finalSelector !== selector) {
          console.log(`  Used alternative selector: ${result.finalSelector}`);
        }
      } else {
        console.error(`\n✗ ${result.message}`);
        if (result.aiSuggestion) {
          console.error(`\n💡 Suggestion:\n${result.aiSuggestion}`);
        }
        process.exit(1);
      }
      break;
    }

    case "dismiss-overlay": {
      if (options.url) {
        await browser.navigate(options.url as string);
      }

      const overlayType = (options.type as string) || "auto";
      const customSelector = options.selector as string | undefined;

      console.log(`\n🔍 Detecting overlays (type: ${overlayType})...\n`);

      const result = await browser.dismissOverlay({
        type: overlayType as any,
        customSelector,
      });

      if (result.overlaysFound === 0) {
        console.log("  No overlays detected on this page.");
      } else {
        console.log(`  Found ${result.overlaysFound} overlay(s):\n`);
        for (const d of result.details) {
          const status = d.dismissed ? "✓ Dismissed" : "✗ Not dismissed";
          console.log(`    ${status} [${d.type}] ${d.selector}`);
          if (d.closeMethod) console.log(`      Method: ${d.closeMethod}`);
          if (d.error) console.log(`      Error: ${d.error}`);
        }
      }

      if (result.dismissed) {
        console.log(`\n✓ Dismissed ${result.overlaysDismissed} overlay(s)`);
      } else if (result.overlaysFound > 0) {
        console.error("\n✗ Could not dismiss detected overlays");
        if (result.suggestion) console.log(`\n💡 ${result.suggestion}`);
        process.exit(1);
      }

      if (result.screenshot) {
        console.log(`\n📸 Screenshot: ${result.screenshot}`);
      }
      break;
    }

    case "assert": {
      const assertion = args[0];
      if (!assertion) {
        console.error("Error: Assertion required");
        console.error('Example: cbrowser assert "page contains \'Welcome\'"');
        process.exit(1);
      }

      if (options.url) {
        await browser.navigate(options.url as string);
      }

      const result = await browser.assert(assertion);

      if (result.passed) {
        console.log(`✓ PASS: ${result.message}`);
        if (result.actual !== undefined) {
          console.log(`  Actual: ${result.actual}`);
        }
      } else {
        console.error(`✗ FAIL: ${result.message}`);
        if (result.actual !== undefined) {
          console.log(`  Actual: ${result.actual}`);
        }
        if (result.expected !== undefined) {
          console.log(`  Expected: ${result.expected}`);
        }
        process.exit(1);
      }
      break;
    }

    // =========================================================================
    // Tier 5: Self-Healing Selectors (v5.0.0)
    // =========================================================================

    case "heal": {
      const subcommand = args[0];

      switch (subcommand) {
        case "stats": {
          const stats = browser.getSelectorCacheStats();
          console.log("\n🔧 Self-Healing Selector Cache Statistics\n");
          console.log(`  Total cached mappings: ${stats.totalEntries}`);
          console.log(`  Total successful heals: ${stats.totalHeals}`);

          if (Object.keys(stats.byDomain).length > 0) {
            console.log("\n  By Domain:");
            for (const [domain, count] of Object.entries(stats.byDomain)) {
              console.log(`    ${domain}: ${count} selectors`);
            }
          }

          if (stats.topHealedSelectors.length > 0) {
            console.log("\n  Top Healed Selectors:");
            for (const entry of stats.topHealedSelectors.slice(0, 5)) {
              console.log(`    "${entry.original}" → "${entry.working}" (${entry.heals} heals)`);
            }
          }
          break;
        }

        case "list": {
          const domain = options.domain as string | undefined;
          const entries = browser.listCachedSelectors(domain);

          if (entries.length === 0) {
            console.log("No cached selectors" + (domain ? ` for ${domain}` : ""));
          } else {
            console.log(`\n🔧 Cached Selectors${domain ? ` for ${domain}` : ""}\n`);
            for (const entry of entries) {
              console.log(`  "${entry.originalSelector}" → "${entry.workingSelector}"`);
              console.log(`    Domain: ${entry.domain} | Heals: ${entry.successCount} | Fails: ${entry.failCount}`);
              console.log(`    Reason: ${entry.reason}`);
              console.log("");
            }
          }
          break;
        }

        case "clear": {
          const domain = options.domain as string | undefined;
          const cleared = browser.clearSelectorCache(domain);
          console.log(`✓ Cleared ${cleared} cached selector${cleared !== 1 ? "s" : ""}${domain ? ` for ${domain}` : ""}`);
          break;
        }

        case "test": {
          const selector = args[1];
          if (!selector) {
            console.error("Error: Selector required");
            console.error("Usage: cbrowser heal test <selector> --url <url>");
            process.exit(1);
          }

          if (options.url) {
            await browser.navigate(options.url as string);
          }

          // Check if there's a cached mapping
          const entries = browser.listCachedSelectors();
          const cached = entries.find(e =>
            e.originalSelector.toLowerCase() === selector.toLowerCase()
          );

          if (cached) {
            console.log(`\n🔧 Selector would be healed:\n`);
            console.log(`  Original: "${cached.originalSelector}"`);
            console.log(`  Healed to: "${cached.workingSelector}"`);
            console.log(`  Success rate: ${cached.successCount}/${cached.successCount + cached.failCount}`);
          } else {
            console.log(`\nNo cached healing for "${selector}"`);
            console.log("Use smart-click to auto-discover alternatives.");
          }
          break;
        }

        default:
          console.error("Usage: cbrowser heal [stats|list|clear|test]");
          process.exit(1);
      }
      break;
    }

    // =========================================================================
    // Tier 5: AI Test Generation (v5.0.0)
    // =========================================================================

    case "generate-tests":
    case "generate": {
      const url = args[0];
      if (!url) {
        console.error("Error: URL required");
        console.error("Usage: cbrowser generate <url> [--format summary|cbrowser|playwright|all]");
        process.exit(1);
      }

      console.log(`\n🧪 Analyzing page and generating tests...\n`);

      const result = await browser.generateTests(url);
      const format = (options.format as string) || "summary";
      // An unknown format printed nothing and exited 0.
      if (!["summary", "cbrowser", "playwright", "all"].includes(format)) {
        console.error(`Error: --format must be summary, cbrowser, playwright or all, got: ${format}`);
        process.exit(1);
      }
      const outputFile = options.output as string | undefined;

      let output = "";

      if (format === "summary" || format === "all") {
        output += `📊 Page Analysis: ${result.url}\n`;
        output += `   Title: ${result.analysis.title}\n`;
        output += `   Forms: ${result.analysis.forms.length}\n`;
        output += `   Buttons: ${result.analysis.buttons.length}\n`;
        output += `   Links: ${result.analysis.links.length}\n`;
        output += `   Has Login: ${result.analysis.hasLogin}\n`;
        output += `   Has Search: ${result.analysis.hasSearch}\n\n`;

        output += `🧪 Generated ${result.tests.length} Test Scenarios:\n\n`;
        for (const test of result.tests) {
          output += `  📝 ${test.name}\n`;
          output += `     ${test.description}\n`;
          output += `     Steps: ${test.steps.length}\n`;
          // Red-zone controls the generator left out (v8 b39, 2026-10-10).
          for (const note of test.notes ?? []) output += `     Note: ${note}\n`;
          output += `     Assertions: ${test.assertions.join(", ")}\n\n`;
        }
      }

      if (format === "cbrowser" || format === "all") {
        output += `\n${"=".repeat(60)}\n`;
        output += `📜 CBrowser Script:\n`;
        output += `${"=".repeat(60)}\n\n`;
        output += result.cbrowserScript;
      }

      if (format === "playwright" || format === "all") {
        output += `\n${"=".repeat(60)}\n`;
        output += `🎭 Playwright Code:\n`;
        output += `${"=".repeat(60)}\n\n`;
        output += result.playwrightCode;
      }

      if (outputFile) {
        const { writeFileSync } = await import("fs");
        writeFileSync(outputFile, output);
        console.log(`✓ Saved to: ${outputFile}`);
      } else {
        console.log(output);
      }
      break;
    }

    case "analyze": {
      const url = args[0];
      if (!url) {
        console.error("Error: URL required");
        process.exit(1);
      }

      await browser.navigate(url);
      const analysis = await browser.analyzePage();

      // --output was accepted and ignored, so the GitHub Action's url mode
      // (`analyze "$URL" --output .../analysis.json`) never wrote its file.
      if (typeof options.output === "string") {
        const { writeFileSync } = await import("node:fs");
        writeFileSync(options.output, JSON.stringify(analysis, null, 2));
        console.error(`📄 Analysis saved: ${options.output}`);
      }
      if (getOutputOptions().json) {
        printData("analyze", analysis);
        break;
      }

      console.log(`\n📊 Page Analysis: ${analysis.url}\n`);
      console.log(`Title: ${analysis.title}`);
      console.log(`\n📝 Forms (${analysis.forms.length}):`);
      for (const form of analysis.forms) {
        console.log(`  - Purpose: ${form.purpose}`);
        console.log(`    Fields: ${form.fields.length}`);
        for (const field of form.fields) {
          console.log(`      • ${field.type}: ${field.name || field.placeholder || field.selector}`);
        }
      }

      console.log(`\n🔘 Buttons (${analysis.buttons.length}):`);
      for (const btn of analysis.buttons.slice(0, 10)) {
        console.log(`  - "${btn.text || btn.ariaLabel || btn.selector}"`);
      }

      console.log(`\n🔗 Links (${analysis.links.length}):`);
      for (const link of analysis.links.slice(0, 10)) {
        console.log(`  - "${link.text}" → ${link.href}`);
      }

      console.log(`\n📋 Features:`);
      console.log(`  Has Login: ${analysis.hasLogin}`);
      console.log(`  Has Search: ${analysis.hasSearch}`);
      console.log(`  Has Navigation: ${analysis.hasNavigation}`);
      break;
    }

    case "screenshot": {
      let screenshotUrl = typeof options.url === "string" ? options.url : undefined;
      let screenshotPath = typeof options.output === "string" ? options.output : undefined;
      if (args[0]) {
        if (args[0].startsWith("http://") || args[0].startsWith("https://") || args[0].startsWith("www.")) {
          screenshotUrl = args[0];
          if (args[1] && !args[1].startsWith("-")) {
            screenshotPath = args[1];
          }
        } else {
          screenshotPath = args[0];
        }
      }
      if (screenshotUrl) {
        await browser.navigate(screenshotUrl);
      }
      const file = await browser.screenshot(screenshotPath);
      console.log(`✓ Screenshot saved: ${file}`);
      break;
    }

    default:
      return false;
  }
  return true;
}
