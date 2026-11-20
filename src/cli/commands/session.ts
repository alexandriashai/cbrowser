/**
 * Browser state: session, storage (stats), cleanup, cookie, device, geo,
 * reset, lightpanda-status, lightpanda-setup.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */

import { CBrowser } from "../../browser.js";
import { LOCATION_PRESETS } from "../../types.js";
import { DEVICE_PRESETS } from "../../devices.js";
import { resolveCookieDomain, hostFromUrl } from "../../utils.js";
import { getLightpandaStatus, LIGHTPANDA_SECURITY_WARNING, LIGHTPANDA_SETUP_GUIDE } from "../../lightpanda.js";
import { resolveDevicePreset } from "../capture.js";
import { formatBytes } from "../format.js";
import { parseGeoLocation } from "../options.js";
import type { CommandContext } from "../context.js";

/** Runs `command` when it belongs to this group; false when it does not. */
export async function runSessionCommand(ctx: CommandContext): Promise<boolean> {
  const { command, args, options, browser } = ctx;
  switch (command) {
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
          const loadResult = await browser.loadSession(name);
          if (loadResult.success) {
            console.log(`✓ Session loaded: ${name}`);
            console.log(`  Cookies: ${loadResult.cookiesRestored}, localStorage: ${loadResult.localStorageKeysRestored}, sessionStorage: ${loadResult.sessionStorageKeysRestored}`);
            if (loadResult.warning) {
              console.log(`  ⚠️  ${loadResult.warning}`);
            }
          } else {
            console.error(`✗ Session not found: ${name}`);
            process.exit(1);
          }
          break;
        }
        case "list": {
          const sessions = browser.listSessionsDetailed();
          if (sessions.length === 0) {
            console.log("No saved sessions");
          } else {
            console.log("\n📋 Saved Sessions:\n");
            // Table header
            const nameW = Math.max(16, ...sessions.map((s) => s.name.length)) + 2;
            const domainW = Math.max(16, ...sessions.map((s) => s.domain.length)) + 2;
            console.log(
              `  ${"Name".padEnd(nameW)}${"Domain".padEnd(domainW)}${"Created".padEnd(22)}${"Cookies".padEnd(10)}${"Size".padEnd(10)}`
            );
            console.log(`  ${"─".repeat(nameW)}${"─".repeat(domainW)}${"─".repeat(22)}${"─".repeat(10)}${"─".repeat(10)}`);
            for (const s of sessions) {
              const created = new Date(s.created).toLocaleString("en-US", {
                month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
              });
              const size = s.sizeBytes < 1024
                ? `${s.sizeBytes} B`
                : `${(s.sizeBytes / 1024).toFixed(1)} KB`;
              console.log(
                `  ${s.name.padEnd(nameW)}${s.domain.padEnd(domainW)}${created.padEnd(22)}${String(s.cookies).padEnd(10)}${size.padEnd(10)}`
              );
            }
            console.log();
          }
          break;
        }
        case "show": {
          if (!name) {
            console.error("Error: Session name required");
            process.exit(1);
          }
          const details = browser.getSessionDetails(name);
          if (!details) {
            console.error(`✗ Session not found: ${name}`);
            process.exit(1);
          }
          const fs = await import("fs");
          const path = await import("path");
          const sessionPath = path.join(browser["paths"].sessionsDir, `${name}.json`);
          const fileSize = fs.statSync(sessionPath).size;
          console.log(`\n📋 Session: ${name}\n`);
          console.log(`  Domain:           ${details.domain}`);
          console.log(`  URL:              ${details.url}`);
          console.log(`  Created:          ${new Date(details.created).toLocaleString()}`);
          console.log(`  Last Used:        ${new Date(details.lastUsed).toLocaleString()}`);
          console.log(`  Viewport:         ${details.viewport.width}x${details.viewport.height}`);
          console.log(`  File Size:        ${(fileSize / 1024).toFixed(1)} KB`);
          console.log(`\n  Cookies (${details.cookies.length}):`);
          if (details.cookies.length > 0) {
            const domains = [...new Set(details.cookies.map((c) => c.domain))];
            for (const d of domains) {
              const count = details.cookies.filter((c) => c.domain === d).length;
              console.log(`    ${d}: ${count}`);
            }
          }
          console.log(`\n  localStorage (${Object.keys(details.localStorage).length} keys):`);
          for (const key of Object.keys(details.localStorage).slice(0, 10)) {
            const val = details.localStorage[key];
            const preview = val.length > 60 ? val.substring(0, 60) + "..." : val;
            console.log(`    ${key}: ${preview}`);
          }
          if (Object.keys(details.localStorage).length > 10) {
            console.log(`    ... and ${Object.keys(details.localStorage).length - 10} more`);
          }
          console.log(`\n  sessionStorage (${Object.keys(details.sessionStorage).length} keys):`);
          for (const key of Object.keys(details.sessionStorage).slice(0, 10)) {
            const val = details.sessionStorage[key];
            const preview = val.length > 60 ? val.substring(0, 60) + "..." : val;
            console.log(`    ${key}: ${preview}`);
          }
          if (Object.keys(details.sessionStorage).length > 10) {
            console.log(`    ... and ${Object.keys(details.sessionStorage).length - 10} more`);
          }
          if (details.testCredentials) {
            console.log(`\n  Test Credentials:  ${details.testCredentials.email} @ ${details.testCredentials.baseUrl}`);
          }
          console.log();
          break;
        }
        case "cleanup": {
          const olderThan = parseInt(options["older-than"] as string || "30", 10);
          if (isNaN(olderThan) || olderThan <= 0) {
            console.error("Error: --older-than must be a positive number of days");
            process.exit(1);
          }
          const result = browser.cleanupSessions(olderThan);
          if (result.deleted.length === 0) {
            console.log(`No sessions older than ${olderThan} days`);
          } else {
            console.log(`\n🧹 Cleaned up ${result.deleted.length} session(s):\n`);
            for (const d of result.deleted) {
              console.log(`  ✓ Deleted: ${d}`);
            }
          }
          console.log(`  ${result.kept.length} session(s) kept`);
          break;
        }
        case "export": {
          if (!name) {
            console.error("Error: Session name required");
            process.exit(1);
          }
          const output = (options.output as string) || `${name}.json`;
          const exported = browser.exportSession(name, output);
          if (exported) {
            console.log(`✓ Session exported: ${name} → ${output}`);
          } else {
            console.error(`✗ Session not found: ${name}`);
            process.exit(1);
          }
          break;
        }
        case "import": {
          // args[0] = "import", args[1] = file path
          const filePath = args[1];
          if (!filePath) {
            console.error("Error: File path required");
            process.exit(1);
          }
          const importName = (options.name as string) || filePath.replace(/\.json$/, "").split("/").pop()!;
          const imported = browser.importSession(filePath, importName);
          if (imported) {
            console.log(`✓ Session imported: ${filePath} → ${importName}`);
          } else {
            console.error(`✗ Failed to import session from: ${filePath}`);
            process.exit(1);
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
            process.exit(1);
          }
          break;
        }
        default:
          console.error("Usage: cbrowser session [save|load|list|show|delete|cleanup|export|import] <name>");
          console.error("\n  save <name>                    Save current session");
          console.error("  load <name>                    Load a saved session");
          console.error("  list                           List all sessions with metadata");
          console.error("  show <name>                    Show detailed session info");
          console.error("  delete <name>                  Delete a session");
          console.error("  cleanup --older-than <days>    Delete old sessions");
          console.error("  export <name> --output <file>  Export session to file");
          console.error("  import <file> --name <name>    Import session from file");
          process.exit(1);
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
          const domain = resolveCookieDomain(options.domain as string | undefined, options.url as string | undefined);
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
          const delDomain = (options.domain as string | undefined)
            ?? (options.url ? hostFromUrl(options.url as string) ?? undefined : undefined);
          await browser.deleteCookie(name, delDomain);
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
          process.exit(1);
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
          // One line per preset: there are a few hundred now. An optional
          // filter matches the key or the display name.
          const filter = (args[1] ?? "").toLowerCase();
          const rows = Object.entries(DEVICE_PRESETS).filter(([key, d]) =>
            !filter || key.includes(filter) || d.name.toLowerCase().includes(filter));
          const width = Math.max(...rows.map(([key]) => key.length), 4);
          console.log(`\n📱 Device presets${filter ? ` matching "${filter}"` : ""}: ${rows.length}\n`);
          for (const [key, d] of rows) {
            const kind = d.isMobile ? "mobile" : "desktop";
            const touch = d.hasTouch ? ", touch" : "";
            console.log(`  ${key.padEnd(width)}  ${d.viewport.width}x${d.viewport.height} @${d.deviceScaleFactor}x  ${kind}${touch}  (${d.name})`);
          }
          console.log("\n  Case and spaces do not matter: --device \"iPhone 16\" is iphone-16.");
          break;
        }
        case "set": {
          const deviceName = args[1];
          if (!deviceName) {
            console.error("Usage: cbrowser device set <name>");
            process.exit(1);
          }
          const presetKey = resolveDevicePreset(deviceName);
          // Save device setting to persistent session state
          const deviceBrowser = new CBrowser({ persistent: true, headless: true, verbose: false });
          deviceBrowser.saveDeviceSetting(presetKey);
          console.log(`✓ Device set: ${presetKey}`);
          console.log("  Device emulation will apply to all subsequent commands");
          break;
        }
        default:
          console.error("Usage: cbrowser device [list|set]");
          process.exit(1);
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
          // Saved to session state like `device set`: each command is its own
          // process, so a runtime change here died with this one.
          const geoBrowser = new CBrowser({ persistent: true, headless: true, verbose: false });
          if (!geoBrowser.saveGeolocationSetting(geo)) process.exit(1);
          console.log(`✓ Geolocation set: ${geo.latitude}, ${geo.longitude}`);
          console.log("  Applies to later commands in the persistent session (for an hour, like device set)");
          break;
        }
        default:
          console.error("Usage: cbrowser geo [list|set]");
          process.exit(1);
      }
      break;
    }

    case "reset": {
      await browser.reset();
      console.log("✓ Browser state reset (cookies, localStorage cleared)");
      break;
    }

    // =========================================================================
    // Lightpanda Integration (v18.20.0) - OPT-IN ONLY
    // =========================================================================

    case "lightpanda-status": {
      console.log("\n🐼 Lightpanda Status\n");

      const status = await getLightpandaStatus();

      if (!status.configured) {
        console.log("❌ Not configured");
        console.log("");
        console.log("To enable Lightpanda, set one of these environment variables:");
        console.log("  LIGHTPANDA_ENDPOINT=ws://127.0.0.1:9222  (local, recommended)");
        console.log("  LIGHTPANDA_TOKEN=your-api-token          (cloud, ⚠️ data exposure)");
        console.log("");
        console.log("Run 'cbrowser lightpanda-setup' for full setup instructions.");
      } else if (status.available) {
        console.log("✅ Available and connected");
        console.log(`   Endpoint: ${status.endpoint}`);
        console.log(`   Mode: ${status.isCloud ? "Cloud ⚠️ (traffic via lightpanda.io)" : "Local (recommended)"}`);
        console.log("");

        // Show security warning for cloud mode
        if (status.isCloud && status.securityWarning) {
          console.log(status.securityWarning);
          console.log("");
        }

        console.log("Usage (OPT-IN REQUIRED):");
        console.log("  cbrowser agent-ready-audit https://example.com --lightpanda");
        console.log("");
        console.log("Note: Lightpanda is NOT used automatically. Only agent-ready-audit uses it, with --lightpanda.");
      } else {
        console.log("⚠️  Configured but unavailable");
        console.log(`   Endpoint: ${status.endpoint}`);
        console.log(`   Error: ${status.error}`);
        console.log("");
        if (!status.isCloud) {
          console.log("Make sure Lightpanda is running:");
          console.log("  docker run -d -p 9222:9222 lightpanda/browser:nightly");
        } else {
          console.log("Check your API token and network connection.");
        }
      }

      // Always show security notice
      console.log("");
      console.log(LIGHTPANDA_SECURITY_WARNING);
      break;
    }

    case "lightpanda-setup": {
      console.log(LIGHTPANDA_SETUP_GUIDE);
      break;
    }

    default:
      return false;
  }
  return true;
}
