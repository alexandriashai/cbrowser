/**
 * Performance metrics, baselines and regression: perf, perf-baseline,
 * perf-regression.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */

import { browserFlagsOrExit, refuseBrowserFlags } from "../../cli-browser-flags.js";
import { type PerformanceBaselineOptions, capturePerformanceBaseline, listPerformanceBaselines, loadPerformanceBaseline, deletePerformanceBaseline, type PerformanceRegressionOptions, detectPerformanceRegression, formatPerformanceRegressionReport } from "../../performance/index.js";
import type { PerformanceRegressionThresholds } from "../../types.js";
import { formatBytes } from "../format.js";
import type { CommandContext } from "../context.js";

/** Runs `command` when it belongs to this group; false when it does not. */
export async function runPerformanceCommand(ctx: CommandContext): Promise<boolean> {
  const { command, args, browser, options, headless } = ctx;
  switch (command) {
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
        if (!result.passed) process.exitCode = 1;
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
    // Performance Regression Detection (Tier 6 - v6.4.0)
    // =========================================================================

    case "perf-baseline": {
      const subcommand = args[0];
      const _fs = await import("fs");

      switch (subcommand) {
        case "save": {
          const url = args[1];
          if (!url) {
            console.error("Usage: cbrowser perf-baseline save <url> [--name <name>] [--runs <n>]");
            process.exit(1);
          }

          const perfFlags = browserFlagsOrExit("perf-baseline save", options);
          refuseBrowserFlags("perf-baseline save", perfFlags, {
            browser: "each run disables the HTTP cache through Chromium's DevTools protocol; on another engine the runs would mix cold and warm loads",
          });

          console.log(`\n📊 Capturing performance baseline for: ${url}`);

          const baselineOptions: PerformanceBaselineOptions = {
            headless,
            device: perfFlags.device,
            viewport: perfFlags.viewport,
            name: options.name as string | undefined,
            runs: options.runs ? parseInt(options.runs as string) : 3,
          };

          console.log(`   Running ${baselineOptions.runs} measurement(s)...`);

          const baseline = await capturePerformanceBaseline(url, baselineOptions);

          console.log(`\n✅ Baseline saved: ${baseline.name}`);
          console.log(`   ID: ${baseline.id}`);
          console.log(`   URL: ${baseline.url}`);
          const env = baseline.environment;
          console.log(`   Page: ${env.viewport.width}x${env.viewport.height}${env.device ? ` (${env.device})` : ""}`);
          console.log(`   Timestamp: ${new Date(baseline.timestamp).toLocaleString()}`);
          console.log(`\n📈 Metrics (averaged over ${baseline.runsAveraged} runs):`);
          if (baseline.metrics.lcp !== undefined) {
            console.log(`   LCP: ${baseline.metrics.lcp.toFixed(0)}ms (${baseline.metrics.lcpRating})`);
          }
          if (baseline.metrics.fcp !== undefined) {
            console.log(`   FCP: ${baseline.metrics.fcp.toFixed(0)}ms`);
          }
          if (baseline.metrics.cls !== undefined) {
            console.log(`   CLS: ${baseline.metrics.cls.toFixed(3)} (${baseline.metrics.clsRating})`);
          }
          if (baseline.metrics.ttfb !== undefined) {
            console.log(`   TTFB: ${baseline.metrics.ttfb.toFixed(0)}ms`);
          }
          if (baseline.metrics.tti !== undefined) {
            console.log(`   TTI: ${baseline.metrics.tti.toFixed(0)}ms`);
          }
          if (baseline.metrics.transferSize !== undefined) {
            console.log(`   Transfer: ${(baseline.metrics.transferSize / 1024).toFixed(1)}KB`);
          }
          break;
        }

        case "list": {
          const baselines = listPerformanceBaselines();

          if (baselines.length === 0) {
            console.log("\n📊 No performance baselines saved yet.");
            console.log("   Use: cbrowser perf-baseline save <url> --name <name>");
          } else {
            console.log(`\n📊 Performance Baselines (${baselines.length}):\n`);
            for (const b of baselines) {
              const date = new Date(b.timestamp).toLocaleDateString();
              const lcp = b.metrics.lcp ? `LCP: ${b.metrics.lcp.toFixed(0)}ms` : "";
              console.log(`   ${b.name}`);
              console.log(`     ID: ${b.id}`);
              console.log(`     URL: ${b.url}`);
              console.log(`     Date: ${date} | ${lcp}`);
              console.log("");
            }
          }
          break;
        }

        case "show": {
          const name = args[1];
          if (!name) {
            console.error("Usage: cbrowser perf-baseline show <name|id>");
            process.exit(1);
          }

          const baseline = loadPerformanceBaseline(name);
          if (!baseline) {
            console.error(`Baseline not found: ${name}`);
            process.exit(1);
          }

          console.log(`\n📊 Performance Baseline: ${baseline.name}`);
          console.log(`   ID: ${baseline.id}`);
          console.log(`   URL: ${baseline.url}`);
          console.log(`   Timestamp: ${new Date(baseline.timestamp).toLocaleString()}`);
          console.log(`   Runs Averaged: ${baseline.runsAveraged}`);
          console.log(`\n📈 Metrics:`);
          console.log(JSON.stringify(baseline.metrics, null, 2));
          console.log(`\n🖥️  Environment:`);
          console.log(JSON.stringify(baseline.environment, null, 2));
          break;
        }

        case "delete": {
          const name = args[1];
          if (!name) {
            console.error("Usage: cbrowser perf-baseline delete <name|id>");
            process.exit(1);
          }

          const deleted = deletePerformanceBaseline(name);
          if (deleted) {
            console.log(`\n✅ Deleted baseline: ${name}`);
          } else {
            console.error(`Baseline not found: ${name}`);
            process.exit(1);
          }
          break;
        }

        default:
          console.error("Usage: cbrowser perf-baseline <save|list|show|delete>");
          console.error("");
          console.error("Subcommands:");
          console.error("  save <url>        Capture and save performance baseline");
          console.error("  list              List all saved baselines");
          console.error("  show <name>       Show baseline details");
          console.error("  delete <name>     Delete a baseline");
          process.exit(1);
      }
      break;
    }

    case "perf-regression": {
      const url = args[0];
      const baselineName = args[1];

      if (!url || !baselineName) {
        console.error("Usage: cbrowser perf-regression <url> <baseline-name> [options]");
        console.error("");
        console.error("Options:");
        console.error("  --sensitivity <level> strict|normal|ci|lenient (default: normal)");
        console.error("  --threshold-lcp <n>   Max LCP increase % (default: 20)");
        console.error("  --threshold-cls <n>   Max CLS increase absolute (default: 0.1)");
        console.error("  --threshold-fcp <n>   Max FCP increase % (default: 20)");
        console.error("  --threshold-ttfb <n>  Max TTFB increase % (default: 30)");
        console.error("  --output <file>       Save JSON report to file");
        console.error("");
        console.error("Sensitivity profiles (both % AND absolute must be exceeded):");
        console.error("  strict:  FCP 10%/50ms, LCP 10%/100ms, TTFB 15%/30ms, CLS 10%/0.02");
        console.error("  normal:  FCP 20%/100ms, LCP 20%/200ms, TTFB 20%/50ms, CLS 20%/0.05");
        console.error("  ci:      FCP 25%/150ms, LCP 25%/300ms, TTFB 25%/75ms, CLS 25%/0.08 (for CI/CD)");
        console.error("  lenient: FCP 30%/200ms, LCP 30%/400ms, TTFB 30%/100ms, CLS 30%/0.1");
        console.error("");
        console.error("Examples:");
        console.error("  cbrowser perf-regression https://example.com homepage");
        console.error("  cbrowser perf-regression https://example.com homepage --sensitivity strict");
        console.error("  cbrowser perf-regression https://example.com homepage --sensitivity lenient");
        console.error("  cbrowser perf-regression https://example.com homepage --threshold-lcp 30");
        process.exit(1);
      }

      // A regression renders as its baseline was captured; a different
      // device or size here would compare unlike pages (audit F20: these
      // flags were accepted and dropped).
      refuseBrowserFlags("perf-regression", browserFlagsOrExit("perf-regression", options), {
        device: "it renders with the baseline's recorded device; capture a new baseline with perf-baseline save --device",
        viewport: "it renders with the baseline's recorded size; capture a new baseline with perf-baseline save --viewport",
        browser: "performance baselines are measured in Chromium",
        doNotTrack: "it sends the baseline's recorded Do Not Track; capture a new baseline with perf-baseline save --dnt",
        globalPrivacyControl: "it sends the baseline's recorded Global Privacy Control; capture a new baseline with perf-baseline save --gpc",
      });
      const sensitivity = (options.sensitivity as string) || "normal";
      if (!["strict", "normal", "ci", "lenient"].includes(sensitivity)) {
        console.error(`Error: --sensitivity must be strict, normal, ci or lenient, got: ${sensitivity}`);
        process.exit(1);
      }
      console.log(`\n🔍 Checking for performance regressions...`);
      console.log(`   URL: ${url}`);
      console.log(`   Baseline: ${baselineName}`);
      console.log(`   Sensitivity: ${sensitivity}`);

      const thresholds: PerformanceRegressionThresholds = {};
      if (options["threshold-lcp"]) thresholds.lcp = parseInt(options["threshold-lcp"] as string);
      if (options["threshold-cls"]) thresholds.cls = parseFloat(options["threshold-cls"] as string);
      if (options["threshold-fcp"]) thresholds.fcp = parseInt(options["threshold-fcp"] as string);
      if (options["threshold-ttfb"]) thresholds.ttfb = parseInt(options["threshold-ttfb"] as string);
      if (options["threshold-tti"]) thresholds.tti = parseInt(options["threshold-tti"] as string);
      if (options["threshold-tbt"]) thresholds.tbt = parseInt(options["threshold-tbt"] as string);

      const regressionOptions: PerformanceRegressionOptions = {
        headless,
        sensitivity: sensitivity as "strict" | "normal" | "ci" | "lenient",
        thresholds: Object.keys(thresholds).length > 0 ? thresholds : undefined,
      };

      try {
        const result = await detectPerformanceRegression(url, baselineName, regressionOptions);

        // Print formatted report
        const report = formatPerformanceRegressionReport(result);
        console.log("\n" + report);

        // Save JSON report if requested
        const fs = await import("fs");
        if (options.output) {
          fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
          console.log(`\n📄 JSON report saved: ${options.output}`);
        }

        // Exit with error code if regressions found
        if (!result.passed) {
          process.exit(1);
        }
      } catch (error: any) {
        console.error(`\n❌ Error: ${error.message}`);
        process.exit(1);
      }
      break;
    }

    default:
      return false;
  }
  return true;
}
