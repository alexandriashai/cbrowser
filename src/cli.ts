#!/usr/bin/env node
/**
 * CBrowser CLI
 *
 * AI-powered browser automation from the command line.
 */

import { CBrowser, executeNaturalLanguage, executeNaturalLanguageScript, findElementByIntent, huntBugs, crossBrowserDiff, runChaosTest } from "./browser.js";
import {
  BUILTIN_PERSONAS,
  loadCustomPersonas,
  saveCustomPersona,
  deleteCustomPersona,
  isBuiltinPersona,
  generatePersonaFromDescription,
  getPersonasDir,
} from "./personas.js";
import { DEVICE_PRESETS, LOCATION_PRESETS } from "./types.js";
import { startMcpServer } from "./mcp-server.js";

function showHelp(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                           CBrowser CLI v5.3.0                                ║
║    AI-powered browser automation with smart retry & assertions               ║
╚══════════════════════════════════════════════════════════════════════════════╝

NAVIGATION
  navigate <url>              Navigate and take screenshot
  screenshot [path]           Take screenshot of current page

INTERACTION
  click <selector>            Click element (tries text, label, role, CSS)
    --url <url>               Navigate to URL first, then click
  fill <selector> <value>     Fill input field
    --url <url>               Navigate to URL first, then fill

EXTRACTION
  extract <what>              Extract data (links, images, headings, forms)

AUTONOMOUS JOURNEYS
  journey <persona>           Run autonomous exploration
    --start <url>             Starting URL (required)
    --goal <goal>             What to accomplish
    --record-video            Record journey as video

PERSONAS
  persona list                List all personas (built-in + custom)
  persona create "<desc>"     Create persona from natural language description
    --name <name>             Persona name (default: generated from description)
    Examples:
      cbrowser persona create "impatient developer who hates slow UIs"
      cbrowser persona create "elderly user new to computers" --name grandma
      cbrowser persona create "distracted teen on mobile phone"
  persona show <name>         Show detailed persona configuration
  persona delete <name>       Delete a custom persona
  persona export <name>       Export persona to JSON file
  persona import <file>       Import persona from JSON file

SESSION MANAGEMENT
  session save <name>         Save browser session (cookies, storage, URL)
    --url <url>               Navigate to URL before saving
  session load <name>         Load a saved session
  session list                List all saved sessions
  session delete <name>       Delete a saved session

COOKIE MANAGEMENT
  cookie list                 List all cookies for current page
    --url <url>               Navigate to URL first
  cookie set <name> <value>   Set a cookie
    --domain <domain>         Cookie domain
    --path <path>             Cookie path (default: /)
  cookie delete <name>        Delete a cookie
    --domain <domain>         Only delete for this domain
  cookie clear                Clear all cookies

DEVICE EMULATION
  device list                 List available device presets
  device set <name>           Set device emulation for session
    Example: cbrowser device set iphone-15

GEOLOCATION
  geo list                    List available location presets
  geo set <location>          Set geolocation (preset name or lat,lon)
    Examples:
      cbrowser geo set new-york
      cbrowser geo set 37.7749,-122.4194

PERFORMANCE
  perf [url]                  Collect performance metrics
  perf audit [url]            Run performance audit against budget
    --budget-lcp <ms>         LCP budget (default: 2500)
    --budget-fcp <ms>         FCP budget (default: 1800)
    --budget-cls <score>      CLS budget (default: 0.1)

NETWORK / HAR
  har start                   Start recording HAR
  har stop [output]           Stop and save HAR file
  network list                List captured network requests

VISUAL REGRESSION (v2.5.0)
  visual save <name>          Save baseline screenshot
    --url <url>               Navigate to URL first
  visual compare <name>       Compare current page against baseline
    --threshold <n>           Diff threshold 0-1 (default: 0.1)
  visual list                 List all saved baselines
  visual delete <name>        Delete a baseline

ACCESSIBILITY (v2.5.0)
  a11y audit                  Run WCAG accessibility audit
    --url <url>               Navigate to URL first
  a11y audit [url]            Audit a specific URL

TEST RECORDING (v2.5.0)
  record start                Start recording interactions
    --url <url>               Navigate to URL to begin recording
  record stop                 Stop recording and show actions
  record save <name>          Save recorded test
  record list                 List saved recordings
  record generate <name>      Generate Playwright test code

TEST EXPORT (v2.5.0)
  export junit <name> [output]   Export test results as JUnit XML
  export tap <name> [output]     Export test results as TAP format

WEBHOOKS (v2.5.0)
  webhook add <name> <url>    Add webhook notification
    --events <events>         Comma-separated: test.pass,test.fail,journey.complete
    --format <format>         slack, discord, or generic
  webhook list                List configured webhooks
  webhook delete <name>       Delete a webhook
  webhook test <name>         Send test notification

PARALLEL EXECUTION (v2.5.0)
  parallel devices <url>      Run same URL across multiple devices
    --devices <list>          Comma-separated device names (default: all)
    --concurrency <n>         Max parallel browsers (default: 3)
  parallel urls <urls>        Run same task across multiple URLs
    --concurrency <n>         Max parallel browsers (default: 3)
  parallel perf <urls>        Performance audit multiple URLs in parallel
    --concurrency <n>         Max parallel browsers (default: 3)

NATURAL LANGUAGE (v3.0.0)
  run "<command>"             Execute natural language command
    Examples:
      cbrowser run "go to https://example.com"
      cbrowser run "click the login button"
      cbrowser run "type 'hello' in the search box"
  script <file>               Execute script file with natural language commands

VISUAL AI (v4.0.0)
  ai find "<intent>"          Find element by semantic intent
    Examples:
      cbrowser ai find "the cheapest product"
      cbrowser ai find "login button"
      cbrowser ai find "search box"
  ai click "<intent>"         Find and click element by intent

BUG HUNTER (v4.0.0)
  hunt <url>                  Automatically find bugs on a page
    --max-pages <n>           Max pages to crawl (default: 10)
    --timeout <ms>            Timeout in ms (default: 60000)

CROSS-BROWSER (v4.0.0)
  diff <url>                  Compare page across browsers
    --browsers <list>         chromium,firefox,webkit (default: all)

CHAOS ENGINEERING (v4.0.0)
  chaos <url>                 Test app resilience
    --latency <ms>            Add network latency
    --offline                 Simulate offline mode
    --block <patterns>        Block URL patterns (comma-separated)
    --fail-api <pattern:status>  Fail specific API calls

SMART RETRY & ASSERTIONS (v5.0.0)
  smart-click <selector>      Click with auto-retry and alternative selectors
    --url <url>               Navigate to URL first
    --max-retries <n>         Maximum retry attempts (default: 3)
    --retry-delay <ms>        Delay between retries (default: 1000)
  assert "<assertion>"        Natural language assertions
    --url <url>               Navigate to URL first
    Examples:
      cbrowser assert "page contains 'Welcome'"
      cbrowser assert "title is 'Home Page'"
      cbrowser assert "url contains '/dashboard'"
      cbrowser assert "'Login' button exists"
      cbrowser assert "page has 3 items"

SELF-HEALING SELECTORS (v5.0.0)
  heal stats                  Show selector cache statistics
  heal list                   List all cached selector mappings
    --domain <domain>         Filter by domain
  heal clear                  Clear the selector cache
    --domain <domain>         Clear only for specific domain
  heal test <selector>        Test if a selector would be healed
    --url <url>               Navigate to URL first

AI TEST GENERATION (v5.0.0)
  generate <url>              Analyze page and generate test scenarios
    --format <format>         Output: summary, cbrowser, playwright, all (default: summary)
    --output <file>           Save to file instead of stdout
  analyze <url>               Show page analysis without generating tests

MCP SERVER (v5.0.0)
  mcp-server                  Start CBrowser as MCP server for Claude integration
                              Use with Claude Desktop or other MCP-compatible clients

STORAGE & CLEANUP
  storage                     Show storage usage statistics
  cleanup                     Clean up old files
    --dry-run                 Preview what would be deleted
    --older-than <days>       Delete files older than N days (default: 7)
    --keep-screenshots <n>    Keep at least N screenshots (default: 10)
    --keep-journeys <n>       Keep at least N journeys (default: 5)
  reset                       Clear persistent browser state (cookies, storage)

OPTIONS
  --browser <type>            Browser: chromium, firefox, webkit (default: chromium)
  --device <name>             Device preset: iphone-15, pixel-8, ipad-pro-12, etc.
  --geo <location>            Location preset or lat,lon coordinates
  --locale <locale>           Browser locale (e.g., en-US, fr-FR)
  --timezone <tz>             Timezone (e.g., America/New_York)
  --record-video              Enable video recording
  --force                     Bypass red zone safety checks
  --headless                  Run browser in headless mode
  --persistent                Enable persistent browser context (cookies survive)

ENVIRONMENT VARIABLES
  CBROWSER_DATA_DIR           Custom data directory (default: ~/.cbrowser)
  CBROWSER_BROWSER            Browser engine (chromium/firefox/webkit)
  CBROWSER_DEVICE             Device preset name
  CBROWSER_LOCALE             Browser locale
  CBROWSER_TIMEZONE           Timezone
  CBROWSER_HEADLESS           Run headless by default (true/false)
  CBROWSER_TIMEOUT            Default timeout in ms (default: 30000)
  CBROWSER_RECORD_VIDEO       Record video by default (true/false)

CONFIG FILE
  CBrowser looks for config in these locations:
    .cbrowserrc.json          Project config
    .cbrowserrc               Project config
    cbrowser.config.json      Project config
    ~/.cbrowser/config.json   User config
    ~/.cbrowserrc.json        User config

  Example .cbrowserrc.json:
    {
      "browser": "chromium",
      "device": "iphone-15",
      "geolocation": "new-york",
      "locale": "en-US",
      "recordVideo": true,
      "performanceBudget": {
        "lcp": 2500,
        "cls": 0.1
      }
    }

EXAMPLES
  npx cbrowser navigate "https://example.com"
  npx cbrowser navigate "https://example.com" --device iphone-15
  npx cbrowser navigate "https://example.com" --geo san-francisco
  npx cbrowser perf audit "https://example.com" --budget-lcp 2000
  npx cbrowser journey first-timer --start "https://example.com" --record-video
  npx cbrowser cookie list --url "https://example.com"
`);
}

function parseArgs(args: string[]): { command: string; args: string[]; options: Record<string, string | boolean> } {
  const command = args[0] || "help";
  const restArgs: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const next = args[i + 1];

      if (next && !next.startsWith("--")) {
        options[key] = next;
        i++;
      } else {
        options[key] = true;
      }
    } else {
      restArgs.push(args[i]);
    }
  }

  return { command, args: restArgs, options };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseGeoLocation(location: string): { latitude: number; longitude: number } | null {
  // Check if it's a preset
  if (LOCATION_PRESETS[location]) {
    return LOCATION_PRESETS[location];
  }
  // Try parsing as lat,lon
  const parts = location.split(",");
  if (parts.length === 2) {
    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);
    if (!isNaN(lat) && !isNaN(lon)) {
      return { latitude: lat, longitude: lon };
    }
  }
  return null;
}

async function main(): Promise<void> {
  const { command, args, options } = parseArgs(process.argv.slice(2));

  if (command === "help" || options.help) {
    showHelp();
    process.exit(0);
  }

  // MCP Server mode - runs before browser instantiation
  if (command === "mcp-server") {
    console.error("🔌 Starting CBrowser MCP Server...");
    await startMcpServer();
    return;
  }

  // Parse browser type
  const browserType = options.browser === "firefox" ? "firefox"
    : options.browser === "webkit" ? "webkit"
    : "chromium";

  // Parse geolocation
  let geolocation = undefined;
  if (options.geo) {
    geolocation = parseGeoLocation(options.geo as string);
    if (!geolocation) {
      console.error(`Invalid geolocation: ${options.geo}`);
      console.error("Use a preset name (new-york, london, etc.) or lat,lon format");
      process.exit(1);
    }
  }

  const persistentMode = options.persistent === true || options.persistent === "true";
  if (persistentMode) {
    console.log("🔄 Persistent mode enabled");
  }

  // Default to headless for CLI usage, unless explicitly set to false
  const headless = options.headless !== false && options.headless !== "false";

  const browser = new CBrowser({
    browser: browserType,
    headless,
    device: options.device as string,
    geolocation,
    locale: options.locale as string,
    timezone: options.timezone as string,
    recordVideo: options["record-video"] === true,
    persistent: persistentMode,
    verbose: true,
  });

  try {
    switch (command) {
      case "navigate": {
        const url = args[0];
        if (!url) {
          console.error("Error: URL required");
          process.exit(1);
        }
        const result = await browser.navigate(url);
        console.log(`✓ Navigated to: ${result.url}`);
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
        const result = await browser.click(selector, { force: options.force === true });
        if (result.success) {
          console.log(`✓ ${result.message}`);
        } else {
          console.error(`✗ ${result.message}`);
          process.exit(1);
        }
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
        const result = await browser.fill(selector, value);
        if (result.success) {
          console.log(`✓ ${result.message}`);
        } else {
          console.error(`✗ ${result.message}`);
          process.exit(1);
        }
        break;
      }

      case "extract": {
        const what = args[0] || "text";
        if (options.url) {
          await browser.navigate(options.url as string);
        }
        const result = await browser.extract(what);
        console.log(JSON.stringify(result.data, null, 2));
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
            console.log(`\n💡 Suggestion:\n${result.aiSuggestion}`);
          }
          process.exit(1);
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
        const path = args[0];
        if (options.url) {
          await browser.navigate(options.url as string);
        }
        const file = await browser.screenshot(path);
        console.log(`✓ Screenshot saved: ${file}`);
        break;
      }

      case "journey": {
        const persona = args[0] || "first-timer";
        const startUrl = options.start as string;
        const goal = (options.goal as string) || "Explore the site";

        if (!startUrl) {
          console.error("Error: --start URL required");
          process.exit(1);
        }

        console.log(`🚀 Starting journey as "${persona}"...`);
        console.log(`   Goal: ${goal}`);
        console.log("");

        const result = await browser.journey({ persona, startUrl, goal });

        console.log("");
        console.log(`📊 Journey Results`);
        console.log(`   Success: ${result.success ? "✓" : "✗"}`);
        console.log(`   Steps: ${result.steps.length}`);
        console.log(`   Time: ${result.totalTime}ms`);
        console.log(`   Friction points: ${result.frictionPoints.length}`);

        if (result.frictionPoints.length > 0) {
          console.log("");
          console.log("⚠️  Friction Points:");
          for (const point of result.frictionPoints) {
            console.log(`   - ${point}`);
          }
        }
        break;
      }

      case "persona": {
        const subcommand = args[0];

        switch (subcommand) {
          case "list": {
            console.log("\n📋 Available Personas:\n");

            // Built-in personas
            console.log("  Built-in:");
            for (const [name, persona] of Object.entries(BUILTIN_PERSONAS)) {
              console.log(`    ${name}`);
              console.log(`      ${persona.description}`);
              console.log(`      Tech: ${persona.demographics.tech_level} | Device: ${persona.demographics.device}`);
              console.log("");
            }

            // Custom personas
            const customPersonas = loadCustomPersonas();
            const customNames = Object.keys(customPersonas);
            if (customNames.length > 0) {
              console.log("  Custom:");
              for (const [name, persona] of Object.entries(customPersonas)) {
                console.log(`    ${name}`);
                console.log(`      ${persona.description}`);
                console.log(`      Tech: ${persona.demographics.tech_level} | Device: ${persona.demographics.device}`);
                console.log("");
              }
            }
            break;
          }

          case "create": {
            const description = args.slice(1).join(" ");
            if (!description) {
              console.error("Usage: cbrowser persona create \"<description>\" [--name <name>]");
              console.error("\nExamples:");
              console.error("  cbrowser persona create \"impatient developer who hates slow UIs\"");
              console.error("  cbrowser persona create \"elderly user new to computers\" --name grandma");
              console.error("  cbrowser persona create \"distracted teen on their phone\"");
              process.exit(1);
            }

            // Generate name from description if not provided
            let personaName = options.name as string;
            if (!personaName) {
              // Create a slug from first few words
              personaName = description
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, "")
                .split(/\s+/)
                .slice(0, 3)
                .join("-");
            }

            // Check if trying to overwrite built-in
            if (isBuiltinPersona(personaName)) {
              console.error(`Error: Cannot overwrite built-in persona "${personaName}"`);
              console.error("Use a different name with --name <name>");
              process.exit(1);
            }

            console.log(`\n🤖 Generating persona from description...\n`);
            console.log(`   "${description}"\n`);

            const persona = generatePersonaFromDescription(personaName, description);

            // Display the generated persona
            console.log(`━━━ Generated Persona: ${persona.name} ━━━\n`);
            console.log(`Description: ${persona.description}`);
            console.log(`\nDemographics:`);
            console.log(`  Age Range: ${persona.demographics.age_range}`);
            console.log(`  Tech Level: ${persona.demographics.tech_level}`);
            console.log(`  Device: ${persona.demographics.device}`);

            console.log(`\nTiming:`);
            console.log(`  Reaction Time: ${persona.humanBehavior?.timing.reactionTime.min}-${persona.humanBehavior?.timing.reactionTime.max}ms`);
            console.log(`  Click Delay: ${persona.humanBehavior?.timing.clickDelay.min}-${persona.humanBehavior?.timing.clickDelay.max}ms`);
            console.log(`  Type Speed: ${persona.humanBehavior?.timing.typeSpeed.min}-${persona.humanBehavior?.timing.typeSpeed.max}ms/char`);
            console.log(`  Reading Speed: ${persona.humanBehavior?.timing.readingSpeed} wpm`);

            console.log(`\nError Rates:`);
            console.log(`  Misclick: ${((persona.humanBehavior?.errors.misClickRate || 0) * 100).toFixed(0)}%`);
            console.log(`  Accidental Double-click: ${((persona.humanBehavior?.errors.doubleClickAccidental || 0) * 100).toFixed(0)}%`);
            console.log(`  Typo: ${((persona.humanBehavior?.errors.typoRate || 0) * 100).toFixed(0)}%`);

            console.log(`\nMouse Behavior:`);
            console.log(`  Speed: ${persona.humanBehavior?.mouse.speed}`);
            console.log(`  Curvature: ${persona.humanBehavior?.mouse.curvature}`);
            console.log(`  Jitter: ${persona.humanBehavior?.mouse.jitter}px`);

            console.log(`\nAttention:`);
            console.log(`  Pattern: ${persona.humanBehavior?.attention.pattern}`);
            console.log(`  Scroll: ${persona.humanBehavior?.attention.scrollBehavior}`);
            console.log(`  Focus: ${persona.humanBehavior?.attention.focusAreas.join(", ")}`);
            console.log(`  Distraction Rate: ${((persona.humanBehavior?.attention.distractionRate || 0) * 100).toFixed(0)}%`);

            console.log(`\nViewport: ${persona.context?.viewport?.[0]}x${persona.context?.viewport?.[1]}`);

            if (Object.keys(persona.behaviors).length > 0) {
              console.log(`\nBehaviors: ${Object.keys(persona.behaviors).join(", ")}`);
            }

            // Save the persona
            const filepath = saveCustomPersona(persona);
            console.log(`\n✓ Persona saved: ${filepath}`);
            console.log(`\nUse with: cbrowser journey ${personaName} --start <url> --goal "<goal>"`);
            break;
          }

          case "show": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser persona show <name>");
              process.exit(1);
            }

            // Check built-in first, then custom
            let persona = BUILTIN_PERSONAS[name];
            let isCustom = false;

            if (!persona) {
              const customPersonas = loadCustomPersonas();
              persona = customPersonas[name];
              isCustom = true;
            }

            if (!persona) {
              console.error(`Persona not found: ${name}`);
              console.error("Run 'cbrowser persona list' to see available personas");
              process.exit(1);
            }

            console.log(`\n━━━ Persona: ${persona.name} ${isCustom ? "(custom)" : "(built-in)"} ━━━\n`);
            console.log(JSON.stringify(persona, null, 2));
            break;
          }

          case "delete": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser persona delete <name>");
              process.exit(1);
            }

            if (isBuiltinPersona(name)) {
              console.error(`Cannot delete built-in persona: ${name}`);
              process.exit(1);
            }

            const deleted = deleteCustomPersona(name);
            if (deleted) {
              console.log(`✓ Persona deleted: ${name}`);
            } else {
              console.error(`Custom persona not found: ${name}`);
              process.exit(1);
            }
            break;
          }

          case "export": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser persona export <name>");
              process.exit(1);
            }

            // Get persona (built-in or custom)
            let persona = BUILTIN_PERSONAS[name];
            if (!persona) {
              const customPersonas = loadCustomPersonas();
              persona = customPersonas[name];
            }

            if (!persona) {
              console.error(`Persona not found: ${name}`);
              process.exit(1);
            }

            const fs = await import("fs");
            const filename = `${name}.persona.json`;
            fs.writeFileSync(filename, JSON.stringify(persona, null, 2));
            console.log(`✓ Exported to: ${filename}`);
            break;
          }

          case "import": {
            const file = args[1];
            if (!file) {
              console.error("Usage: cbrowser persona import <file>");
              process.exit(1);
            }

            const fs = await import("fs");
            if (!fs.existsSync(file)) {
              console.error(`File not found: ${file}`);
              process.exit(1);
            }

            try {
              const content = fs.readFileSync(file, "utf-8");
              const persona = JSON.parse(content);

              if (!persona.name || !persona.description) {
                console.error("Invalid persona file: missing name or description");
                process.exit(1);
              }

              if (isBuiltinPersona(persona.name)) {
                console.error(`Cannot import: "${persona.name}" is a built-in persona name`);
                console.error("Edit the JSON file to change the name");
                process.exit(1);
              }

              const filepath = saveCustomPersona(persona);
              console.log(`✓ Imported persona: ${persona.name}`);
              console.log(`  Saved to: ${filepath}`);
            } catch (e: any) {
              console.error(`Failed to import: ${e.message}`);
              process.exit(1);
            }
            break;
          }

          default:
            console.error("Usage: cbrowser persona [list|create|show|delete|export|import]");
            console.error("\nExamples:");
            console.error("  cbrowser persona list");
            console.error("  cbrowser persona create \"impatient developer\" --name dev-persona");
            console.error("  cbrowser persona show power-user");
            console.error("  cbrowser persona delete my-custom-persona");
        }
        break;
      }

      case "session": {
        const subcommand = args[0];
        const name = args[1];

        switch (subcommand) {
          case "save": {
            if (!name) {
              console.error("Error: Session name required");
              process.exit(1);
            }
            if (options.url) {
              await browser.navigate(options.url as string);
            }
            await browser.saveSession(name);
            console.log(`✓ Session saved: ${name}`);
            break;
          }
          case "load": {
            if (!name) {
              console.error("Error: Session name required");
              process.exit(1);
            }
            const loaded = await browser.loadSession(name);
            if (loaded) {
              console.log(`✓ Session loaded: ${name}`);
            } else {
              console.error(`✗ Session not found: ${name}`);
              process.exit(1);
            }
            break;
          }
          case "list": {
            const sessions = browser.listSessions();
            if (sessions.length === 0) {
              console.log("No saved sessions");
            } else {
              console.log("\n📋 Saved Sessions:\n");
              for (const session of sessions) {
                console.log(`  - ${session}`);
              }
            }
            break;
          }
          case "delete": {
            if (!name) {
              console.error("Error: Session name required");
              process.exit(1);
            }
            const deleted = browser.deleteSession(name);
            if (deleted) {
              console.log(`✓ Session deleted: ${name}`);
            } else {
              console.error(`✗ Session not found: ${name}`);
            }
            break;
          }
          default:
            console.error("Usage: cbrowser session [save|load|list|delete] <name>");
        }
        break;
      }

      case "storage":
      case "stats": {
        const stats = browser.getStorageStats();
        console.log("\n📊 Storage Usage:\n");
        let totalSize = 0;
        let totalCount = 0;
        for (const [category, { count, size }] of Object.entries(stats)) {
          console.log(`  ${category}: ${count} files (${formatBytes(size)})`);
          totalSize += size;
          totalCount += count;
        }
        console.log("");
        console.log(`  TOTAL: ${totalCount} files (${formatBytes(totalSize)})`);
        break;
      }

      case "cleanup": {
        const cleanupOptions = {
          dryRun: options["dry-run"] === true,
          olderThan: options["older-than"] ? parseInt(options["older-than"] as string, 10) : 7,
          keepScreenshots: options["keep-screenshots"] ? parseInt(options["keep-screenshots"] as string, 10) : 10,
          keepJourneys: options["keep-journeys"] ? parseInt(options["keep-journeys"] as string, 10) : 5,
          keepSessions: options["keep-sessions"] ? parseInt(options["keep-sessions"] as string, 10) : 3,
        };

        const result = browser.cleanup(cleanupOptions);

        if (cleanupOptions.dryRun) {
          console.log("\n🔍 Cleanup Preview (dry run):\n");
        } else {
          console.log("\n🧹 Cleanup Complete:\n");
        }

        console.log(`  Screenshots: ${result.details.screenshots.deleted} files (${formatBytes(result.details.screenshots.freed)})`);
        console.log(`  Journeys: ${result.details.journeys.deleted} files (${formatBytes(result.details.journeys.freed)})`);
        console.log(`  Sessions: ${result.details.sessions.deleted} files (${formatBytes(result.details.sessions.freed)})`);
        console.log(`  Audit: ${result.details.audit.deleted} files (${formatBytes(result.details.audit.freed)})`);
        console.log("");
        console.log(`  TOTAL: ${result.deleted} files | ${formatBytes(result.freedBytes)} ${cleanupOptions.dryRun ? "would be " : ""}freed`);
        break;
      }

      // =========================================================================
      // Cookie Management
      // =========================================================================

      case "cookie": {
        const subcommand = args[0];

        switch (subcommand) {
          case "list": {
            if (options.url) {
              await browser.navigate(options.url as string);
            }
            const cookies = await browser.getCookies();
            if (cookies.length === 0) {
              console.log("No cookies found");
            } else {
              console.log("\n🍪 Cookies:\n");
              for (const cookie of cookies) {
                console.log(`  ${cookie.name}`);
                console.log(`    Value: ${cookie.value.substring(0, 50)}${cookie.value.length > 50 ? "..." : ""}`);
                console.log(`    Domain: ${cookie.domain}`);
                console.log(`    Path: ${cookie.path}`);
                console.log(`    Expires: ${cookie.expires === -1 ? "Session" : new Date(cookie.expires * 1000).toISOString()}`);
                console.log("");
              }
            }
            break;
          }
          case "set": {
            const name = args[1];
            const value = args[2];
            if (!name || !value) {
              console.error("Usage: cbrowser cookie set <name> <value> [--domain <domain>]");
              process.exit(1);
            }
            if (options.url) {
              await browser.navigate(options.url as string);
            }
            const domain = (options.domain as string) || "localhost";
            const path = (options.path as string) || "/";
            await browser.setCookies([{
              name,
              value,
              domain,
              path,
              expires: -1,
              httpOnly: false,
              secure: false,
              sameSite: "Lax",
            }]);
            console.log(`✓ Cookie set: ${name}=${value}`);
            break;
          }
          case "delete": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser cookie delete <name> [--domain <domain>]");
              process.exit(1);
            }
            if (options.url) {
              await browser.navigate(options.url as string);
            }
            await browser.deleteCookie(name, options.domain as string);
            console.log(`✓ Cookie deleted: ${name}`);
            break;
          }
          case "clear": {
            await browser.clearCookies();
            console.log("✓ All cookies cleared");
            break;
          }
          default:
            console.error("Usage: cbrowser cookie [list|set|delete|clear]");
        }
        break;
      }

      // =========================================================================
      // Device Emulation
      // =========================================================================

      case "device": {
        const subcommand = args[0];

        switch (subcommand) {
          case "list": {
            console.log("\n📱 Available Device Presets:\n");
            for (const [name, device] of Object.entries(DEVICE_PRESETS)) {
              console.log(`  ${name}`);
              console.log(`    ${device.name}`);
              console.log(`    ${device.viewport.width}x${device.viewport.height} @${device.deviceScaleFactor}x`);
              console.log(`    Mobile: ${device.isMobile} | Touch: ${device.hasTouch}`);
              console.log("");
            }
            break;
          }
          case "set": {
            const deviceName = args[1];
            if (!deviceName) {
              console.error("Usage: cbrowser device set <name>");
              process.exit(1);
            }
            if (!DEVICE_PRESETS[deviceName]) {
              console.error(`Unknown device: ${deviceName}`);
              console.error("Run 'cbrowser device list' to see available devices");
              process.exit(1);
            }
            console.log(`✓ Device set: ${deviceName}`);
            console.log("  Note: Device emulation applies to new browser sessions");
            break;
          }
          default:
            console.error("Usage: cbrowser device [list|set]");
        }
        break;
      }

      // =========================================================================
      // Geolocation
      // =========================================================================

      case "geo": {
        const subcommand = args[0];

        switch (subcommand) {
          case "list": {
            console.log("\n🌍 Available Location Presets:\n");
            for (const [name, loc] of Object.entries(LOCATION_PRESETS)) {
              console.log(`  ${name}`);
              console.log(`    Lat: ${loc.latitude}, Lon: ${loc.longitude}`);
              console.log("");
            }
            break;
          }
          case "set": {
            const location = args[1];
            if (!location) {
              console.error("Usage: cbrowser geo set <location>");
              console.error("  Location can be a preset name or lat,lon coordinates");
              process.exit(1);
            }
            const geo = parseGeoLocation(location);
            if (!geo) {
              console.error(`Invalid location: ${location}`);
              process.exit(1);
            }
            await browser.setGeolocationRuntime(geo);
            console.log(`✓ Geolocation set: ${geo.latitude}, ${geo.longitude}`);
            break;
          }
          default:
            console.error("Usage: cbrowser geo [list|set]");
        }
        break;
      }

      // =========================================================================
      // Performance
      // =========================================================================

      case "perf": {
        const subcommand = args[0];

        if (subcommand === "audit") {
          const url = args[1];
          if (url) {
            await browser.navigate(url);
          } else if (options.url) {
            await browser.navigate(options.url as string);
          }

          // Create performance budget from options
          const budget = {
            lcp: options["budget-lcp"] ? parseInt(options["budget-lcp"] as string) : 2500,
            fcp: options["budget-fcp"] ? parseInt(options["budget-fcp"] as string) : 1800,
            cls: options["budget-cls"] ? parseFloat(options["budget-cls"] as string) : 0.1,
          };

          // Temporarily set budget in config
          (browser as any).config.performanceBudget = budget;

          const result = await browser.auditPerformance();

          console.log("\n📊 Performance Audit:\n");
          console.log(`  URL: ${result.url}`);
          console.log(`  Result: ${result.passed ? "✓ PASSED" : "✗ FAILED"}`);
          console.log("");
          console.log("  Metrics:");
          if (result.metrics.lcp) console.log(`    LCP: ${result.metrics.lcp.toFixed(0)}ms (${result.metrics.lcpRating})`);
          if (result.metrics.fcp) console.log(`    FCP: ${result.metrics.fcp.toFixed(0)}ms`);
          if (result.metrics.cls !== undefined) console.log(`    CLS: ${result.metrics.cls.toFixed(3)} (${result.metrics.clsRating})`);
          if (result.metrics.ttfb) console.log(`    TTFB: ${result.metrics.ttfb.toFixed(0)}ms`);
          if (result.metrics.load) console.log(`    Load: ${result.metrics.load.toFixed(0)}ms`);
          if (result.metrics.resourceCount) console.log(`    Resources: ${result.metrics.resourceCount}`);
          if (result.metrics.transferSize) console.log(`    Transfer: ${formatBytes(result.metrics.transferSize)}`);

          if (result.violations.length > 0) {
            console.log("");
            console.log("  ⚠️  Budget Violations:");
            for (const v of result.violations) {
              console.log(`    - ${v}`);
            }
          }
        } else {
          // Just collect metrics
          const url = args[0];
          if (url) {
            await browser.navigate(url);
          } else if (options.url) {
            await browser.navigate(options.url as string);
          }

          const metrics = await browser.getPerformanceMetrics();

          console.log("\n📊 Performance Metrics:\n");
          if (metrics.lcp) console.log(`  LCP: ${metrics.lcp.toFixed(0)}ms (${metrics.lcpRating})`);
          if (metrics.fcp) console.log(`  FCP: ${metrics.fcp.toFixed(0)}ms`);
          if (metrics.cls !== undefined) console.log(`  CLS: ${metrics.cls.toFixed(3)} (${metrics.clsRating})`);
          if (metrics.ttfb) console.log(`  TTFB: ${metrics.ttfb.toFixed(0)}ms`);
          if (metrics.domContentLoaded) console.log(`  DOMContentLoaded: ${metrics.domContentLoaded.toFixed(0)}ms`);
          if (metrics.load) console.log(`  Load: ${metrics.load.toFixed(0)}ms`);
          if (metrics.resourceCount) console.log(`  Resources: ${metrics.resourceCount}`);
          if (metrics.transferSize) console.log(`  Transfer Size: ${formatBytes(metrics.transferSize)}`);
        }
        break;
      }

      // =========================================================================
      // HAR Recording
      // =========================================================================

      case "har": {
        const subcommand = args[0];

        switch (subcommand) {
          case "start": {
            browser.startHarRecording();
            console.log("✓ HAR recording started");
            console.log("  Navigate and interact with pages, then run 'cbrowser har stop'");
            break;
          }
          case "stop": {
            const output = args[1];
            const filename = await browser.exportHar(output);
            console.log(`✓ HAR saved: ${filename}`);
            break;
          }
          default:
            console.error("Usage: cbrowser har [start|stop]");
        }
        break;
      }

      // =========================================================================
      // Network
      // =========================================================================

      case "network": {
        const subcommand = args[0];

        switch (subcommand) {
          case "list": {
            const requests = browser.getNetworkRequests();
            if (requests.length === 0) {
              console.log("No network requests captured");
              console.log("Navigate to a page first to capture requests");
            } else {
              console.log(`\n🌐 Network Requests (${requests.length}):\n`);
              for (const req of requests.slice(-20)) {
                console.log(`  ${req.method} ${req.url.substring(0, 80)}${req.url.length > 80 ? "..." : ""}`);
                console.log(`    Type: ${req.resourceType} | Time: ${req.timestamp}`);
              }
              if (requests.length > 20) {
                console.log(`\n  ... and ${requests.length - 20} more requests`);
              }
            }
            break;
          }
          case "clear": {
            browser.clearNetworkHistory();
            console.log("✓ Network history cleared");
            break;
          }
          default:
            console.error("Usage: cbrowser network [list|clear]");
        }
        break;
      }

      // =========================================================================
      // Visual Regression (Tier 2)
      // =========================================================================

      case "visual": {
        const subcommand = args[0];

        switch (subcommand) {
          case "save": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser visual save <name> [--url <url>]");
              process.exit(1);
            }
            if (options.url) {
              await browser.navigate(options.url as string);
            }
            const path = await browser.saveBaseline(name);
            console.log(`✓ Baseline saved: ${name}`);
            console.log(`  Path: ${path}`);
            break;
          }
          case "compare": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser visual compare <name> [--threshold <n>]");
              process.exit(1);
            }
            if (options.url) {
              await browser.navigate(options.url as string);
            }
            const threshold = options.threshold ? parseFloat(options.threshold as string) : 0.1;
            const result = await browser.compareBaseline(name, threshold);

            console.log("\n🔍 Visual Comparison:\n");
            console.log(`  Baseline: ${name}`);
            console.log(`  Difference: ${(result.diffPercentage * 100).toFixed(2)}%`);
            console.log(`  Threshold: ${(threshold * 100).toFixed(0)}%`);
            console.log(`  Result: ${result.passed ? "✓ PASSED" : "✗ FAILED"}`);
            if (result.diffPath) {
              console.log(`  Diff image: ${result.diffPath}`);
            }
            if (!result.passed) {
              process.exit(1);
            }
            break;
          }
          case "list": {
            const baselines = browser.listBaselines();
            if (baselines.length === 0) {
              console.log("No baselines saved");
            } else {
              console.log("\n📸 Visual Baselines:\n");
              for (const b of baselines) {
                console.log(`  - ${b}`);
              }
            }
            break;
          }
          case "delete": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser visual delete <name>");
              process.exit(1);
            }
            // Delete baseline file
            const fs = await import("fs");
            const path = await import("path");
            const baselinePath = path.join(browser.getDataDir(), "baselines", `${name}.png`);
            if (fs.existsSync(baselinePath)) {
              fs.unlinkSync(baselinePath);
              console.log(`✓ Baseline deleted: ${name}`);
            } else {
              console.error(`✗ Baseline not found: ${name}`);
              process.exit(1);
            }
            break;
          }
          default:
            console.error("Usage: cbrowser visual [save|compare|list|delete]");
        }
        break;
      }

      // =========================================================================
      // Accessibility (Tier 2)
      // =========================================================================

      case "a11y": {
        const subcommand = args[0];

        if (subcommand === "audit") {
          const url = args[1];
          if (url) {
            await browser.navigate(url);
          } else if (options.url) {
            await browser.navigate(options.url as string);
          }

          const result = await browser.auditAccessibility();

          console.log("\n♿ Accessibility Audit:\n");
          console.log(`  URL: ${result.url}`);
          console.log(`  Score: ${result.score}/100`);
          console.log(`  Passes: ${result.passes}`);
          console.log(`  Violations: ${result.violations.length}`);

          if (result.violations.length > 0) {
            console.log("\n  ⚠️  Violations:\n");
            for (const v of result.violations) {
              console.log(`    [${v.impact.toUpperCase()}] ${v.id}`);
              console.log(`      ${v.description}`);
              console.log(`      Help: ${v.helpUrl}`);
              console.log("");
            }
          }
        } else {
          console.error("Usage: cbrowser a11y audit [url]");
        }
        break;
      }

      // =========================================================================
      // Test Recording (Tier 2)
      // =========================================================================

      case "record": {
        const subcommand = args[0];

        switch (subcommand) {
          case "start": {
            const url = options.url as string;
            await browser.startRecording(url);
            console.log("✓ Recording started");
            if (url) {
              console.log(`  Navigated to: ${url}`);
            }
            console.log("  Interact with the page, then run 'cbrowser record stop'");
            break;
          }
          case "stop": {
            const actions = browser.stopRecording();
            console.log(`✓ Recording stopped`);
            console.log(`  Captured ${actions.length} actions`);
            if (actions.length > 0) {
              console.log("\n  Actions:");
              for (const action of actions) {
                console.log(`    ${action.type}: ${action.selector || action.url || action.value || ""}`);
              }
            }
            break;
          }
          case "save": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser record save <name>");
              process.exit(1);
            }
            const path = browser.saveRecording(name);
            console.log(`✓ Recording saved: ${name}`);
            console.log(`  Path: ${path}`);
            break;
          }
          case "list": {
            const fs = await import("fs");
            const path = await import("path");
            const recordingsDir = path.join(browser.getDataDir(), "recordings");
            if (!fs.existsSync(recordingsDir)) {
              console.log("No recordings saved");
            } else {
              const files = fs.readdirSync(recordingsDir).filter((f: string) => f.endsWith(".json"));
              if (files.length === 0) {
                console.log("No recordings saved");
              } else {
                console.log("\n🎬 Saved Recordings:\n");
                for (const f of files) {
                  console.log(`  - ${f.replace(".json", "")}`);
                }
              }
            }
            break;
          }
          case "generate": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser record generate <name>");
              process.exit(1);
            }
            const fs = await import("fs");
            const path = await import("path");
            const recordingPath = path.join(browser.getDataDir(), "recordings", `${name}.json`);
            if (!fs.existsSync(recordingPath)) {
              console.error(`Recording not found: ${name}`);
              process.exit(1);
            }
            const recording = JSON.parse(fs.readFileSync(recordingPath, "utf-8"));
            const code = browser.generateTestCode(name, recording.actions);
            console.log(code);
            break;
          }
          default:
            console.error("Usage: cbrowser record [start|stop|save|list|generate]");
        }
        break;
      }

      // =========================================================================
      // Test Export (Tier 2)
      // =========================================================================

      case "export": {
        const format = args[0];
        const name = args[1];
        const output = args[2];

        if (!format || !name) {
          console.error("Usage: cbrowser export [junit|tap] <name> [output]");
          process.exit(1);
        }

        // Load test results (for now, create a mock suite)
        const fs = await import("fs");
        const path = await import("path");
        const resultsPath = path.join(browser.getDataDir(), "results", `${name}.json`);

        let suite;
        if (fs.existsSync(resultsPath)) {
          suite = JSON.parse(fs.readFileSync(resultsPath, "utf-8"));
        } else {
          console.error(`Test results not found: ${name}`);
          console.error("Run tests first to generate results");
          process.exit(1);
        }

        if (format === "junit") {
          const exportPath = browser.exportJUnit(suite, output);
          console.log(`✓ JUnit XML exported: ${exportPath}`);
        } else if (format === "tap") {
          const exportPath = browser.exportTAP(suite, output);
          console.log(`✓ TAP exported: ${exportPath}`);
        } else {
          console.error("Unknown export format. Use 'junit' or 'tap'");
          process.exit(1);
        }
        break;
      }

      // =========================================================================
      // Webhooks (Tier 2)
      // =========================================================================

      case "webhook": {
        const subcommand = args[0];
        const fs = await import("fs");
        const path = await import("path");
        const webhooksPath = path.join(browser.getDataDir(), "webhooks.json");

        // Load existing webhooks
        let webhooks: Array<{ name: string; url: string; events: string[]; format: string }> = [];
        if (fs.existsSync(webhooksPath)) {
          webhooks = JSON.parse(fs.readFileSync(webhooksPath, "utf-8"));
        }

        switch (subcommand) {
          case "add": {
            const name = args[1];
            const url = args[2];
            if (!name || !url) {
              console.error("Usage: cbrowser webhook add <name> <url> [--events <events>] [--format <format>]");
              process.exit(1);
            }
            const events = options.events
              ? (options.events as string).split(",")
              : ["test.fail", "journey.complete"];
            const format = (options.format as string) || "generic";

            // Remove existing webhook with same name
            webhooks = webhooks.filter(w => w.name !== name);
            webhooks.push({ name, url, events, format });

            fs.writeFileSync(webhooksPath, JSON.stringify(webhooks, null, 2));
            console.log(`✓ Webhook added: ${name}`);
            console.log(`  URL: ${url}`);
            console.log(`  Events: ${events.join(", ")}`);
            console.log(`  Format: ${format}`);
            break;
          }
          case "list": {
            if (webhooks.length === 0) {
              console.log("No webhooks configured");
            } else {
              console.log("\n🔔 Configured Webhooks:\n");
              for (const w of webhooks) {
                console.log(`  ${w.name}`);
                console.log(`    URL: ${w.url}`);
                console.log(`    Events: ${w.events.join(", ")}`);
                console.log(`    Format: ${w.format}`);
                console.log("");
              }
            }
            break;
          }
          case "delete": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser webhook delete <name>");
              process.exit(1);
            }
            const originalLength = webhooks.length;
            webhooks = webhooks.filter(w => w.name !== name);
            if (webhooks.length < originalLength) {
              fs.writeFileSync(webhooksPath, JSON.stringify(webhooks, null, 2));
              console.log(`✓ Webhook deleted: ${name}`);
            } else {
              console.error(`✗ Webhook not found: ${name}`);
              process.exit(1);
            }
            break;
          }
          case "test": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser webhook test <name>");
              process.exit(1);
            }
            const webhook = webhooks.find(w => w.name === name);
            if (!webhook) {
              console.error(`✗ Webhook not found: ${name}`);
              process.exit(1);
            }

            // Send test notification
            const testPayload = webhook.format === "slack"
              ? { text: "🔔 CBrowser test notification" }
              : webhook.format === "discord"
              ? { content: "🔔 CBrowser test notification" }
              : { event: "test", message: "CBrowser test notification", timestamp: new Date().toISOString() };

            try {
              const response = await fetch(webhook.url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(testPayload),
              });
              if (response.ok) {
                console.log(`✓ Test notification sent to: ${name}`);
              } else {
                console.error(`✗ Webhook returned ${response.status}`);
                process.exit(1);
              }
            } catch (e: any) {
              console.error(`✗ Failed to send notification: ${e.message}`);
              process.exit(1);
            }
            break;
          }
          default:
            console.error("Usage: cbrowser webhook [add|list|delete|test]");
        }
        break;
      }

      // =========================================================================
      // Parallel Execution (Tier 2)
      // =========================================================================

      case "parallel": {
        const subcommand = args[0];

        switch (subcommand) {
          case "devices": {
            const url = args[1];
            if (!url) {
              console.error("Usage: cbrowser parallel devices <url> [--devices <list>] [--concurrency <n>]");
              process.exit(1);
            }

            const deviceList = options.devices
              ? (options.devices as string).split(",")
              : Object.keys(DEVICE_PRESETS);
            const concurrency = options.concurrency ? parseInt(options.concurrency as string) : 3;

            console.log(`\n🚀 Running parallel device tests...`);
            console.log(`   URL: ${url}`);
            console.log(`   Devices: ${deviceList.length}`);
            console.log(`   Concurrency: ${concurrency}\n`);

            const results = await CBrowser.parallelDevices(
              deviceList,
              async (b, device) => {
                const nav = await b.navigate(url);
                const screenshot = await b.screenshot();
                return { title: nav.title, loadTime: nav.loadTime, screenshot };
              },
              { maxConcurrency: concurrency }
            );

            console.log("📊 Results:\n");
            for (const r of results) {
              if (r.error) {
                console.log(`  ✗ ${r.device}: ${r.error} (${r.duration}ms)`);
              } else {
                console.log(`  ✓ ${r.device}: ${r.result?.title} - ${r.result?.loadTime}ms (${r.duration}ms total)`);
              }
            }

            const passed = results.filter(r => !r.error).length;
            console.log(`\n  Summary: ${passed}/${results.length} passed`);
            break;
          }

          case "urls": {
            const urls = args.slice(1);
            if (urls.length === 0) {
              console.error("Usage: cbrowser parallel urls <url1> <url2> ... [--concurrency <n>]");
              process.exit(1);
            }

            const concurrency = options.concurrency ? parseInt(options.concurrency as string) : 3;

            console.log(`\n🚀 Running parallel URL tests...`);
            console.log(`   URLs: ${urls.length}`);
            console.log(`   Concurrency: ${concurrency}\n`);

            const results = await CBrowser.parallelUrls(
              urls,
              async (b, url) => {
                const nav = await b.navigate(url);
                return { title: nav.title, loadTime: nav.loadTime };
              },
              { maxConcurrency: concurrency }
            );

            console.log("📊 Results:\n");
            for (const r of results) {
              if (r.error) {
                console.log(`  ✗ ${r.url}: ${r.error}`);
              } else {
                console.log(`  ✓ ${r.url}: ${r.result?.title} (${r.result?.loadTime}ms)`);
              }
            }
            break;
          }

          case "perf": {
            const urls = args.slice(1);
            if (urls.length === 0) {
              console.error("Usage: cbrowser parallel perf <url1> <url2> ... [--concurrency <n>]");
              process.exit(1);
            }

            const concurrency = options.concurrency ? parseInt(options.concurrency as string) : 3;

            console.log(`\n🚀 Running parallel performance audits...`);
            console.log(`   URLs: ${urls.length}`);
            console.log(`   Concurrency: ${concurrency}\n`);

            const results = await CBrowser.parallelUrls(
              urls,
              async (b, url) => {
                await b.navigate(url);
                return await b.getPerformanceMetrics();
              },
              { maxConcurrency: concurrency }
            );

            console.log("📊 Performance Results:\n");
            for (const r of results) {
              if (r.error) {
                console.log(`  ✗ ${r.url}: ${r.error}`);
              } else {
                const m = r.result;
                console.log(`  ✓ ${r.url}`);
                if (m?.lcp) console.log(`      LCP: ${m.lcp.toFixed(0)}ms (${m.lcpRating})`);
                if (m?.fcp) console.log(`      FCP: ${m.fcp.toFixed(0)}ms`);
                if (m?.cls !== undefined) console.log(`      CLS: ${m.cls.toFixed(3)}`);
              }
            }
            break;
          }

          default:
            console.error("Usage: cbrowser parallel [devices|urls|perf]");
        }
        break;
      }

      // =========================================================================
      // Natural Language (Tier 3)
      // =========================================================================

      case "run": {
        const nlCommand = args.join(" ");
        if (!nlCommand) {
          console.error("Usage: cbrowser run \"<natural language command>\"");
          console.error("Examples:");
          console.error("  cbrowser run \"go to https://example.com\"");
          console.error("  cbrowser run \"click the login button\"");
          console.error("  cbrowser run \"type 'hello' in the search box\"");
          process.exit(1);
        }

        console.log(`\n🗣️  Executing: "${nlCommand}"\n`);

        const result = await executeNaturalLanguage(browser, nlCommand);

        if (result.success) {
          console.log(`✓ Action: ${result.action}`);
          if (result.result && typeof result.result === "object") {
            const r = result.result as Record<string, unknown>;
            if (r.url) console.log(`  URL: ${r.url}`);
            if (r.title) console.log(`  Title: ${r.title}`);
            if (r.message) console.log(`  ${r.message}`);
            if (r.screenshot) console.log(`  Screenshot: ${r.screenshot}`);
          }
        } else {
          console.error(`✗ ${result.error}`);
          process.exit(1);
        }
        break;
      }

      case "script": {
        const scriptFile = args[0];
        if (!scriptFile) {
          console.error("Usage: cbrowser script <file>");
          process.exit(1);
        }

        const fs = await import("fs");
        if (!fs.existsSync(scriptFile)) {
          console.error(`Script file not found: ${scriptFile}`);
          process.exit(1);
        }

        const content = fs.readFileSync(scriptFile, "utf-8");
        const commands = content.split("\n").filter(line => line.trim() && !line.trim().startsWith("#"));

        console.log(`\n📜 Executing script: ${scriptFile}`);
        console.log(`   Commands: ${commands.length}\n`);

        const results = await executeNaturalLanguageScript(browser, commands);

        for (const r of results) {
          if (r.success) {
            console.log(`✓ ${r.command}`);
          } else {
            console.log(`✗ ${r.command}`);
            console.log(`  Error: ${r.error}`);
          }
        }

        const passed = results.filter(r => r.success).length;
        console.log(`\n  Summary: ${passed}/${results.length} commands succeeded`);

        if (passed < results.length) {
          process.exit(1);
        }
        break;
      }

      // =========================================================================
      // Visual AI (Tier 4)
      // =========================================================================

      case "ai": {
        const subcommand = args[0];
        const intent = args.slice(1).join(" ");

        if (!intent) {
          console.error("Usage: cbrowser ai [find|click] \"<intent>\"");
          console.error("Examples:");
          console.error("  cbrowser ai find \"the cheapest product\"");
          console.error("  cbrowser ai click \"login button\"");
          process.exit(1);
        }

        if (options.url) {
          await browser.navigate(options.url as string);
        }

        switch (subcommand) {
          case "find": {
            console.log(`\n🧠 Finding element: "${intent}"\n`);
            const result = await findElementByIntent(browser, intent);
            if (result) {
              console.log(`✓ Found element`);
              console.log(`  Selector: ${result.selector}`);
              console.log(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`);
              console.log(`  Description: ${result.description}`);
            } else {
              console.log(`✗ Could not find element matching: "${intent}"`);
              process.exit(1);
            }
            break;
          }
          case "click": {
            console.log(`\n🧠 Finding and clicking: "${intent}"\n`);
            const result = await findElementByIntent(browser, intent);
            if (result) {
              console.log(`✓ Found: ${result.description}`);
              await browser.click(result.selector);
              console.log(`✓ Clicked element`);
            } else {
              console.log(`✗ Could not find element matching: "${intent}"`);
              process.exit(1);
            }
            break;
          }
          default:
            console.error("Usage: cbrowser ai [find|click] \"<intent>\"");
        }
        break;
      }

      // =========================================================================
      // Bug Hunter (Tier 4)
      // =========================================================================

      case "hunt": {
        const url = args[0];
        if (!url) {
          console.error("Usage: cbrowser hunt <url> [--max-pages <n>] [--timeout <ms>]");
          process.exit(1);
        }

        const maxPages = options["max-pages"] ? parseInt(options["max-pages"] as string) : 10;
        const timeout = options.timeout ? parseInt(options.timeout as string) : 60000;

        console.log(`\n🔍 Bug Hunter starting...`);
        console.log(`   URL: ${url}`);
        console.log(`   Max pages: ${maxPages}`);
        console.log(`   Timeout: ${timeout}ms\n`);

        const result = await huntBugs(browser, url, { maxPages, timeout });

        console.log(`📊 Bug Hunt Results:\n`);
        console.log(`   Pages visited: ${result.pagesVisited}`);
        console.log(`   Duration: ${result.duration}ms`);
        console.log(`   Bugs found: ${result.bugs.length}\n`);

        if (result.bugs.length > 0) {
          const critical = result.bugs.filter(b => b.severity === "critical").length;
          const high = result.bugs.filter(b => b.severity === "high").length;
          const medium = result.bugs.filter(b => b.severity === "medium").length;

          console.log(`   Severity: ${critical} critical, ${high} high, ${medium} medium\n`);

          for (const bug of result.bugs) {
            const icon = bug.severity === "critical" ? "🔴" : bug.severity === "high" ? "🟠" : "🟡";
            console.log(`   ${icon} [${bug.type}] ${bug.description}`);
            if (bug.selector) console.log(`      Selector: ${bug.selector}`);
          }
        } else {
          console.log(`   ✅ No bugs found!`);
        }
        break;
      }

      // =========================================================================
      // Cross-Browser Diff (Tier 4)
      // =========================================================================

      case "diff": {
        const url = args[0];
        if (!url) {
          console.error("Usage: cbrowser diff <url> [--browsers <list>]");
          process.exit(1);
        }

        const browserList = options.browsers
          ? (options.browsers as string).split(",") as Array<"chromium" | "firefox" | "webkit">
          : ["chromium", "firefox", "webkit"] as const;

        console.log(`\n🔀 Cross-Browser Diff`);
        console.log(`   URL: ${url}`);
        console.log(`   Browsers: ${browserList.join(", ")}\n`);

        const result = await crossBrowserDiff(url, [...browserList]);

        console.log(`📊 Results:\n`);
        console.log(`   Metrics:`);
        for (const [browser, metrics] of Object.entries(result.metrics)) {
          console.log(`     ${browser}: ${metrics.loadTime}ms, ${metrics.resourceCount} resources`);
        }

        if (result.differences.length > 0) {
          console.log(`\n   ⚠️  Differences found: ${result.differences.length}`);
          for (const diff of result.differences) {
            console.log(`     [${diff.type}] ${diff.description}`);
          }
        } else {
          console.log(`\n   ✅ No significant differences found`);
        }

        console.log(`\n   Screenshots:`);
        for (const [browser, path] of Object.entries(result.screenshots)) {
          console.log(`     ${browser}: ${path}`);
        }
        break;
      }

      // =========================================================================
      // Chaos Engineering (Tier 4)
      // =========================================================================

      case "chaos": {
        const url = args[0];
        if (!url) {
          console.error("Usage: cbrowser chaos <url> [--latency <ms>] [--offline] [--block <patterns>]");
          process.exit(1);
        }

        const chaosConfig: any = {};

        if (options.latency) {
          chaosConfig.networkLatency = parseInt(options.latency as string);
        }
        if (options.offline) {
          chaosConfig.offline = true;
        }
        if (options.block) {
          chaosConfig.blockUrls = (options.block as string).split(",");
        }
        if (options["fail-api"]) {
          const [pattern, status] = (options["fail-api"] as string).split(":");
          chaosConfig.failApis = [{ pattern, status: parseInt(status) }];
        }

        console.log(`\n💥 Chaos Engineering Test`);
        console.log(`   URL: ${url}`);
        console.log(`   Chaos config:`, chaosConfig);
        console.log("");

        const result = await runChaosTest(browser, url, chaosConfig);

        console.log(`📊 Results:\n`);
        console.log(`   Passed: ${result.passed ? "✅ Yes" : "❌ No"}`);
        console.log(`   Duration: ${result.duration}ms`);

        if (result.errors.length > 0) {
          console.log(`\n   Errors:`);
          for (const error of result.errors) {
            console.log(`     - ${error}`);
          }
        }

        if (result.screenshot) {
          console.log(`\n   Screenshot: ${result.screenshot}`);
        }

        if (!result.passed) {
          process.exit(1);
        }
        break;
      }

      case "reset": {
        await browser.reset();
        console.log("✓ Browser state reset (cookies, localStorage cleared)");
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.error("Run 'cbrowser help' for usage");
        process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
