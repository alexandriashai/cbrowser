#!/usr/bin/env node
/**
 * CBrowser CLI
 *
 * AI-powered browser automation from the command line.
 */

import { CBrowser } from "./browser.js";
import { BUILTIN_PERSONAS } from "./personas.js";

function showHelp(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                           CBrowser CLI v2.3.0                                ║
║         AI-powered browser automation with multi-browser support             ║
╚══════════════════════════════════════════════════════════════════════════════╝

NAVIGATION
  navigate <url>              Navigate and take screenshot
  screenshot [path]           Take screenshot of current page

INTERACTION
  click <selector>            Click element (tries text, label, role, CSS)
  fill <selector> <value>     Fill input field

EXTRACTION
  extract <what>              Extract data (links, images, headings, forms)

AUTONOMOUS JOURNEYS
  journey <persona>           Run autonomous exploration
    --start <url>             Starting URL (required)
    --goal <goal>             What to accomplish

PERSONAS
  persona list                List available personas

SESSION MANAGEMENT
  session save <name>         Save browser session (cookies, storage, URL)
    --url <url>               Navigate to URL before saving
  session load <name>         Load a saved session
  session list                List all saved sessions
  session delete <name>       Delete a saved session

STORAGE & CLEANUP
  storage                     Show storage usage statistics
  cleanup                     Clean up old files
    --dry-run                 Preview what would be deleted
    --older-than <days>       Delete files older than N days (default: 7)
    --keep-screenshots <n>    Keep at least N screenshots (default: 10)
    --keep-journeys <n>       Keep at least N journeys (default: 5)

OPTIONS
  --browser <type>            Browser engine: chromium, firefox, webkit (default: chromium)
  --force                     Bypass red zone safety checks
  --headless                  Run browser in headless mode

ENVIRONMENT VARIABLES
  CBROWSER_DATA_DIR           Custom data directory (default: ~/.cbrowser)
  CBROWSER_BROWSER            Browser engine (chromium/firefox/webkit)
  CBROWSER_HEADLESS           Run headless by default (true/false)
  CBROWSER_TIMEOUT            Default timeout in ms (default: 30000)

EXAMPLES
  npx cbrowser navigate "https://example.com"
  npx cbrowser click "Sign in"
  npx cbrowser fill "email" "user@example.com"
  npx cbrowser journey first-timer --start "https://example.com" --goal "Find products"
  npx cbrowser session save "logged-in" --url "https://myapp.com"
  npx cbrowser cleanup --dry-run
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

async function main(): Promise<void> {
  const { command, args, options } = parseArgs(process.argv.slice(2));

  if (command === "help" || options.help) {
    showHelp();
    process.exit(0);
  }

  // Parse browser type
  const browserType = options.browser === "firefox" ? "firefox"
    : options.browser === "webkit" ? "webkit"
    : "chromium";

  const browser = new CBrowser({
    browser: browserType,
    headless: options.headless === true || options.headless === "true",
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
        if (subcommand === "list") {
          console.log("\n📋 Available Personas:\n");
          for (const [name, persona] of Object.entries(BUILTIN_PERSONAS)) {
            console.log(`  ${name}`);
            console.log(`    ${persona.description}`);
            console.log(`    Tech level: ${persona.demographics.tech_level}`);
            console.log("");
          }
        } else {
          console.error("Usage: cbrowser persona list");
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
