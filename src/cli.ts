#!/usr/bin/env node
/**
 * CBrowser CLI
 *
 * AI-powered browser automation from the command line.
 */

import { CBrowser } from "./browser.js";
import { BUILTIN_PERSONAS } from "./personas.js";
import { DEVICE_PRESETS, LOCATION_PRESETS } from "./types.js";

function showHelp(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                           CBrowser CLI v2.4.0                                ║
║       AI-powered browser automation with devices, geo & performance          ║
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
    --record-video            Record journey as video

PERSONAS
  persona list                List available personas

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

STORAGE & CLEANUP
  storage                     Show storage usage statistics
  cleanup                     Clean up old files
    --dry-run                 Preview what would be deleted
    --older-than <days>       Delete files older than N days (default: 7)
    --keep-screenshots <n>    Keep at least N screenshots (default: 10)
    --keep-journeys <n>       Keep at least N journeys (default: 5)

OPTIONS
  --browser <type>            Browser: chromium, firefox, webkit (default: chromium)
  --device <name>             Device preset: iphone-15, pixel-8, ipad-pro-12, etc.
  --geo <location>            Location preset or lat,lon coordinates
  --locale <locale>           Browser locale (e.g., en-US, fr-FR)
  --timezone <tz>             Timezone (e.g., America/New_York)
  --record-video              Enable video recording
  --force                     Bypass red zone safety checks
  --headless                  Run browser in headless mode

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

  const browser = new CBrowser({
    browser: browserType,
    headless: options.headless === true || options.headless === "true",
    device: options.device as string,
    geolocation,
    locale: options.locale as string,
    timezone: options.timezone as string,
    recordVideo: options["record-video"] === true,
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
