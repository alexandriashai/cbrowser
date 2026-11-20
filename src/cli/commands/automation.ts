/**
 * Natural-language automation, parallel runs, bug hunting, browser diff and
 * chaos testing: run, script, ai, parallel, hunt-bugs, diff, chaos.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */

import { CBrowser } from "../../browser.js";
import { browserFlagsOrExit, refuseBrowserFlags } from "../../cli-browser-flags.js";
import { browserLaunchConfig } from "../../browser-options.js";
import { executeNaturalLanguage, executeNaturalLanguageScript, findElementByIntent, huntBugs, runChaosTest } from "../../analysis/index.js";
import { crossBrowserDiff } from "../../visual/index.js";
import { CBROWSER_DEVICE_KEYS } from "../../devices.js";
import { resolveDevicePreset } from "../capture.js";
import { timeoutOption } from "../options.js";
import type { CommandContext } from "../context.js";

/** Runs `command` when it belongs to this group; false when it does not. */
export async function runAutomationCommand(ctx: CommandContext): Promise<boolean> {
  const { command, args, options, browser } = ctx;
  switch (command) {
    // =========================================================================
    // Parallel Execution (Tier 2)
    // =========================================================================

    case "parallel": {
      const subcommand = args[0];
      const flags = browserFlagsOrExit("parallel", options);

      switch (subcommand) {
        case "devices": {
          const url = args[1];
          if (!url) {
            console.error("Usage: cbrowser parallel devices <url> [--devices <list>] [--concurrency <n>]");
            process.exit(1);
          }
          refuseBrowserFlags("parallel devices", flags, {
            device: "it runs every device in --devices; list them there",
            viewport: "each device renders at its own size",
          });

          // Without --devices, cbrowser's own presets, not all few hundred.
          const deviceList = options.devices
            ? (options.devices as string).split(",").map((d) => resolveDevicePreset(d))
            : [...CBROWSER_DEVICE_KEYS];
          const concurrency = options.concurrency ? parseInt(options.concurrency as string) : 3;

          console.log(`\n🚀 Running parallel device tests...`);
          console.log(`   URL: ${url}`);
          console.log(`   Devices: ${deviceList.length}`);
          console.log(`   Concurrency: ${concurrency}\n`);

          const results = await CBrowser.parallelDevices(
            deviceList,
            async (b, _device) => {
              const nav = await b.navigate(url);
              const screenshot = await b.screenshot();
              return { title: nav.title, loadTime: nav.loadTime, screenshot };
            },
            { maxConcurrency: concurrency, config: browserLaunchConfig(flags) }
          );

          console.log("📊 Results:\n");
          for (const r of results) {
            if (r.error) {
              console.log(`  ✗ ${r.device}: ${r.error} (${r.duration}ms)`);
              process.exitCode = 1;
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
            { maxConcurrency: concurrency, config: browserLaunchConfig(flags) }
          );

          console.log("📊 Results:\n");
          for (const r of results) {
            if (r.error) {
              console.log(`  ✗ ${r.url}: ${r.error}`);
              process.exitCode = 1;
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
            { maxConcurrency: concurrency, config: browserLaunchConfig(flags) }
          );

          console.log("📊 Performance Results:\n");
          for (const r of results) {
            if (r.error) {
              console.log(`  ✗ ${r.url}: ${r.error}`);
              process.exitCode = 1;
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
          process.exit(1);
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

      if (typeof options.url === "string") await browser.navigate(options.url);
      const result = await executeNaturalLanguage(browser, nlCommand);

      if (result.success) {
        console.log(`✓ Action: ${result.action}`);
        if (result.result && typeof result.result === "object") {
          const r = result.result as Record<string, unknown>;
          if (r.url) console.log(`  URL: ${r.url}`);
          if (r.title) console.log(`  Title: ${r.title}`);
          if (r.message) console.log(`  ${r.message}`);
          if (r.screenshot) console.log(`  Screenshot: ${r.screenshot}`);
          if (typeof r.scrollY === "number") console.log(`  scrollY: ${r.scrollY}`);
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
          process.exitCode = 1;
          console.error(`  Error: ${r.error}`);
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
            console.error(`✗ Could not find element matching: "${intent}"`);
            process.exit(1);
          }
          break;
        }
        case "click": {
          console.log(`\n🧠 Finding and clicking: "${intent}"\n`);
          const result = await findElementByIntent(browser, intent);
          if (result) {
            console.log(`✓ Found: ${result.description}`);
            // The click's own result decides: a red-zone refusal or a miss used
            // to print "Clicked element" and exit 0 (audit 2026-10-21).
            const clicked = await browser.click(result.selector, { force: options.force === true });
            if (!clicked.success) {
              console.error(`✗ ${clicked.message}`);
              process.exit(1);
            }
            console.log(`✓ Clicked element`);
          } else {
            console.error(`✗ Could not find element matching: "${intent}"`);
            process.exit(1);
          }
          break;
        }
        default:
          console.error("Usage: cbrowser ai [find|click] \"<intent>\"");
          process.exit(1);
      }
      break;
    }

    // =========================================================================
    // Bug Hunter (Tier 4)
    // =========================================================================

    case "hunt-bugs":
    case "hunt": {
      const url = args[0];
      if (!url) {
        console.error("Usage: cbrowser hunt <url> [--max-pages <n>] [--timeout <ms>]");
        process.exit(1);
      }

      const maxPages = options["max-pages"] ? parseInt(options["max-pages"] as string) : 10;
      const timeout = timeoutOption(options.timeout, 60000);

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
          if (bug.recommendation) console.log(`      💡 ${bug.recommendation}`);
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
        console.error("Usage: cbrowser diff <url> [--browsers <list>] [--viewport <WxH>] [--device <name>]");
        process.exit(1);
      }
      const flags = browserFlagsOrExit("diff", options);
      refuseBrowserFlags("diff", flags, {
        browser: "it runs each engine in turn; choose them with --browsers chromium,firefox,webkit",
      });

      const browserList = options.browsers
        ? (options.browsers as string).split(",") as Array<"chromium" | "firefox" | "webkit">
        : ["chromium", "firefox", "webkit"] as const;

      console.log(`\n🔀 Cross-Browser Diff`);
      console.log(`   URL: ${url}`);
      console.log(`   Browsers: ${browserList.join(", ")}\n`);

      const result = await crossBrowserDiff(url, [...browserList], {
        headless: flags.headless,
        device: flags.device,
        viewport: flags.viewport,
      });

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

    case "chaos-test":
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
      if (!result.passed) process.exitCode = 1;
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

    default:
      return false;
  }
  return true;
}
