/**
 * Visual testing: visual, ai-visual, cross-browser, responsive, ab.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */

import { browserFlagsOrExit, refuseBrowserFlags } from "../../cli-browser-flags.js";
import { captureVisualBaseline, runVisualRegression, formatVisualRegressionReport, generateVisualRegressionHtmlReport, runVisualRegressionSuite, listVisualBaselines, getVisualBaseline, deleteVisualBaseline, runCrossBrowserSuite, generateCrossBrowserHtmlReport, runCrossBrowserTest, formatCrossBrowserReport, listViewportPresets, runResponsiveSuite, generateResponsiveHtmlReport, formatViewportPresetList, runResponsiveTest, formatResponsiveReport, runABSuite, generateABHtmlReport, runABComparison, formatABReport } from "../../visual/index.js";
import type { VisualTestSuiteResult, VisualTestSuite, CrossBrowserSuite, SupportedBrowser, CrossBrowserSuiteResult, ViewportPreset, ResponsiveSuite, ResponsiveSuiteResult, ABSuite, ABSuiteResult } from "../../types.js";
import { numberOption, enumOption } from "../options.js";
import type { CommandContext } from "../context.js";

/** Runs `command` when it belongs to this group; false when it does not. */
export async function runVisualCommand(ctx: CommandContext): Promise<boolean> {
  const { command, args, options, browser } = ctx;
  switch (command) {
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
          const threshold = numberOption("threshold", options.threshold, 0.1, { min: 0, max: 1 });
          const result = await browser.compareBaseline(name, threshold);

          console.log("\n🔍 Visual Comparison:\n");
          console.log(`  Baseline: ${name}`);
          console.log(`  Difference: ${(result.diffPercentage * 100).toFixed(2)}%`);
          console.log(`  Threshold: ${(threshold * 100).toFixed(0)}%`);
          console.log(`  Result: ${result.passed ? "✓ PASSED" : "✗ FAILED"}`);
          if (!result.passed) process.exitCode = 1;
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
          process.exit(1);
      }
      break;
    }

    // =========================================================================
    // AI Visual Regression (v7.0.0)
    // =========================================================================

    case "ai-visual": {
      const subcommand = args[0];
      // A test renders the way its baseline was captured.
      const BASELINE_SHAPE_FLAGS = {
        browser: "a test renders with its baseline's engine; capture a new baseline to change it",
        device: "a test renders with its baseline's device; capture a new baseline to change it",
        viewport: "a test renders at its baseline's size; capture a new baseline to change it",
        doNotTrack: "a test sends the Do Not Track its baseline was captured with; capture a new baseline to change it",
        globalPrivacyControl: "a test sends the Global Privacy Control its baseline was captured with; capture a new baseline to change it",
      };

      switch (subcommand) {
        case "capture": {
          const url = args[1];
          if (!url || !options.name) {
            console.error("Usage: cbrowser ai-visual capture <url> --name <name> [options]");
            console.error("  --selector <sel>    Capture specific element");
            console.error("  --device <device>   Device emulation");
            console.error("  --viewport <WxH>    Page size (default: 1920x1080)");
            console.error("  --width/--height    One side of the page size");
            console.error("  --browser <engine>  chromium, firefox or webkit");
            console.error("  --wait <ms|sel>     Wait before capture");
            process.exit(1);
          }

          const flags = browserFlagsOrExit("ai-visual capture", options);

          console.log(`📸 Capturing visual baseline: ${options.name}`);
          console.log(`   URL: ${url}`);

          const baseline = await captureVisualBaseline(url, options.name as string, {
            selector: options.selector as string | undefined,
            ...flags,
            waitFor: options.wait ? (
              /^\d+$/.test(options.wait as string)
                ? parseInt(options.wait as string)
                : options.wait as string
            ) : undefined,
          });

          console.log(`\n✅ Baseline captured successfully!`);
          console.log(`   ID: ${baseline.id}`);
          console.log(`   Viewport: ${baseline.viewport.width}x${baseline.viewport.height}`);
          if (baseline.device) console.log(`   Device: ${baseline.device}`);
          if (baseline.browser) console.log(`   Browser: ${baseline.browser}`);
          console.log(`   Screenshot: ${baseline.screenshotPath}`);
          break;
        }

        case "test": {
          const url = args[1];
          const baselineName = args[2];

          if (!url || !baselineName) {
            console.error("Usage: cbrowser ai-visual test <url> <baseline-name> [options]");
            console.error("  --threshold <n>     Similarity threshold 0-1 (default: 0.9)");
            console.error("  --sensitivity <l>   low, medium, high (default: medium)");
            console.error("  --html              Generate HTML report");
            console.error("  --output <file>     Save JSON report");
            process.exit(1);
          }

          const flags = browserFlagsOrExit("ai-visual test", options);
          refuseBrowserFlags("ai-visual test", flags, BASELINE_SHAPE_FLAGS);

          console.log(`\n🔍 Running AI visual regression test...`);
          console.log(`   URL: ${url}`);
          console.log(`   Baseline: ${baselineName}\n`);

          const result = await runVisualRegression(url, baselineName, {
            threshold: numberOption("threshold", options.threshold, 0.9, { min: 0, max: 1 }),
            sensitivity: enumOption("sensitivity", options.sensitivity, ["low", "medium", "high"] as const) ?? "medium",
            generateDiff: true,
            headless: flags.headless,
          });

          // Print report
          console.log(formatVisualRegressionReport(result));

          // Save JSON output if requested
          if (options.output && !options.html) {
            const fs = await import("fs");
            fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
            console.log(`\n📄 JSON report saved to: ${options.output}`);
          }

          // Generate HTML report if requested
          if (options.html) {
            const fs = await import("fs");
            const suiteResult: VisualTestSuiteResult = {
              suite: {
                name: baselineName,
                pages: [{ name: baselineName, url, baselineName }],
              },
              results: [result],
              summary: {
                total: 1,
                passed: result.passed ? 1 : 0,
                failed: result.passed ? 0 : 1,
                warnings: result.analysis.overallStatus === "warning" ? 1 : 0,
              },
              duration: result.duration,
              timestamp: new Date().toISOString(),
            };
            const htmlReport = generateVisualRegressionHtmlReport(suiteResult);
            const outputPath = (options.output as string) || `visual-regression-${baselineName}-${Date.now()}.html`;
            fs.writeFileSync(outputPath, htmlReport);
            console.log(`\n📄 HTML report saved to: ${outputPath}`);
          }

          if (!result.passed) {
            process.exit(1);
          }
          break;
        }

        case "suite": {
          const suiteFile = args[1];
          if (!suiteFile) {
            console.error("Usage: cbrowser ai-visual suite <file.json> [options]");
            console.error("  --threshold <n>     Global similarity threshold");
            console.error("  --html              Generate HTML report");
            console.error("  --output <file>     Save report to file");
            process.exit(1);
          }

          const fs = await import("fs");
          if (!fs.existsSync(suiteFile)) {
            console.error(`Suite file not found: ${suiteFile}`);
            process.exit(1);
          }

          const flags = browserFlagsOrExit("ai-visual suite", options);
          refuseBrowserFlags("ai-visual suite", flags, BASELINE_SHAPE_FLAGS);

          const suite: VisualTestSuite = JSON.parse(fs.readFileSync(suiteFile, "utf-8"));
          console.log(`\n🔍 Running visual regression suite: ${suite.name}`);

          const result = await runVisualRegressionSuite(suite, {
            threshold: numberOption("threshold", options.threshold, 0.9, { min: 0, max: 1 }),
            headless: flags.headless,
          });

          // Save outputs
          if (options.output && !options.html) {
            fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
            console.log(`📄 JSON report saved to: ${options.output}`);
          }

          if (options.html) {
            const htmlReport = generateVisualRegressionHtmlReport(result);
            const outputPath = (options.output as string) || `visual-suite-${Date.now()}.html`;
            fs.writeFileSync(outputPath, htmlReport);
            console.log(`📄 HTML report saved to: ${outputPath}`);
          }

          if (result.summary.failed > 0) {
            process.exit(1);
          }
          break;
        }

        case "list": {
          const baselines = listVisualBaselines();
          if (baselines.length === 0) {
            console.log("\nNo AI visual baselines saved.\n");
            console.log("Capture one with:");
            console.log("  cbrowser ai-visual capture <url> --name <name>\n");
          } else {
            console.log("\n📸 AI Visual Baselines:\n");
            console.log("┌──────────────────────┬─────────────────────────────────┬────────────────────┬──────────────┐");
            console.log("│ Name                 │ URL                             │ Viewport           │ Created      │");
            console.log("├──────────────────────┼─────────────────────────────────┼────────────────────┼──────────────┤");
            for (const b of baselines) {
              const name = b.name.substring(0, 20).padEnd(20);
              const url = b.url.substring(0, 31).padEnd(31);
              const viewport = `${b.viewport.width}x${b.viewport.height}`.padEnd(18);
              const created = new Date(b.timestamp).toLocaleDateString().padEnd(12);
              console.log(`│ ${name} │ ${url} │ ${viewport} │ ${created} │`);
            }
            console.log("└──────────────────────┴─────────────────────────────────┴────────────────────┴──────────────┘\n");
          }
          break;
        }

        case "show": {
          const name = args[1];
          if (!name) {
            console.error("Usage: cbrowser ai-visual show <name>");
            process.exit(1);
          }

          const baseline = getVisualBaseline(name);
          if (!baseline) {
            console.error(`Baseline not found: ${name}`);
            process.exit(1);
          }

          console.log("\n📸 AI Visual Baseline Details:\n");
          console.log(`  Name:       ${baseline.name}`);
          console.log(`  ID:         ${baseline.id}`);
          console.log(`  URL:        ${baseline.url}`);
          console.log(`  Viewport:   ${baseline.viewport.width}x${baseline.viewport.height}`);
          if (baseline.device) {
            console.log(`  Device:     ${baseline.device}`);
          }
          if (baseline.selector) {
            console.log(`  Selector:   ${baseline.selector}`);
          }
          console.log(`  Created:    ${baseline.timestamp}`);
          console.log(`  Screenshot: ${baseline.screenshotPath}`);
          console.log("");
          break;
        }

        case "delete": {
          const name = args[1];
          if (!name) {
            console.error("Usage: cbrowser ai-visual delete <name>");
            process.exit(1);
          }

          if (deleteVisualBaseline(name)) {
            console.log(`✅ Baseline deleted: ${name}`);
          } else {
            console.error(`Baseline not found: ${name}`);
            process.exit(1);
          }
          break;
        }

        default:
          console.error("Usage: cbrowser ai-visual [capture|test|suite|list|show|delete]");
          console.error("       cbrowser ai-visual capture <url> --name <name>");
          console.error("       cbrowser ai-visual test <url> <baseline>");
          console.error("       cbrowser ai-visual suite <file.json>");
          console.error("       cbrowser ai-visual list");
          console.error("       cbrowser ai-visual show <name>");
          console.error("       cbrowser ai-visual delete <name>");
          process.exit(1);
      }
      break;
    }

    // =========================================================================
    // Cross-Browser Visual Testing (v7.3.0)
    // =========================================================================

    case "cross-browser": {
      const subcommand = args[0];
      const flags = browserFlagsOrExit("cross-browser", options);
      refuseBrowserFlags("cross-browser", flags, {
        browser: "it runs each engine in turn; choose them with --browsers chromium,firefox,webkit",
      });

      if (subcommand === "suite") {
        // Cross-browser suite
        const suiteFile = args[1];
        if (!suiteFile) {
          console.error("Usage: cbrowser cross-browser suite <file.json> [options]");
          console.error("  --html              Generate HTML report");
          console.error("  --output <file>     Save report to file");
          process.exit(1);
        }

        const fs = await import("fs");
        if (!fs.existsSync(suiteFile)) {
          console.error(`Suite file not found: ${suiteFile}`);
          process.exit(1);
        }

        const suite: CrossBrowserSuite = JSON.parse(fs.readFileSync(suiteFile, "utf-8"));
        // Flags given on the command line win over the suite file's options.
        const result = await runCrossBrowserSuite({ ...suite, options: { ...suite.options, ...flags } });

        // Save outputs
        if (options.output && !options.html) {
          fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
          console.log(`\n📄 JSON report saved to: ${options.output}`);
        }

        if (options.html) {
          const htmlReport = generateCrossBrowserHtmlReport(result);
          const outputPath = (options.output as string) || `cross-browser-${Date.now()}.html`;
          fs.writeFileSync(outputPath, htmlReport);
          console.log(`\n📄 HTML report saved to: ${outputPath}`);
        }

        // Summary
        console.log(`\n${"═".repeat(60)}`);
        console.log(`   Results: ${result.summary.consistent} consistent, ${result.summary.minorDifferences} minor, ${result.summary.majorDifferences} major`);
        console.log(`${"═".repeat(60)}\n`);

        if (result.summary.majorDifferences > 0) {
          process.exit(1);
        }
      } else {
        // Single URL test
        const url = subcommand; // First arg is the URL
        if (!url || url.startsWith("--")) {
          console.error("Usage: cbrowser cross-browser <url> [options]");
          console.error("       cbrowser cross-browser suite <file.json>");
          console.error("\nOptions:");
          console.error("  --browsers <list>   chromium,firefox,webkit (default: all)");
          console.error("  --viewport <WxH>    Page size (default: 1920x1080)");
          console.error("  --width/--height    One side of the page size");
          console.error("  --device <name>     Device preset (firefox cannot emulate a mobile one)");
          console.error("  --wait <ms>         Wait before screenshot");
          console.error("  --wait-for <sel>    Wait for selector");
          console.error("  --sensitivity <l>   low, medium, high");
          console.error("  --html              Generate HTML report");
          console.error("  --output <file>     Save report");
          process.exit(1);
        }

        const browsers = options.browsers
          ? (options.browsers as string).split(",") as SupportedBrowser[]
          : undefined;

        const result = await runCrossBrowserTest(url, {
          browsers,
          ...flags,
          waitBeforeCapture: options.wait ? parseInt(options.wait as string) : undefined,
          waitForSelector: options["wait-for"] as string | undefined,
          sensitivity: enumOption("sensitivity", options.sensitivity, ["low", "medium", "high"] as const),
        });

        // Print report
        console.log("\n" + formatCrossBrowserReport(result));

        // Save outputs
        const fs = await import("fs");

        if (options.output && !options.html) {
          fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
          console.log(`\n📄 JSON report saved to: ${options.output}`);
        }

        if (options.html) {
          const suiteResult: CrossBrowserSuiteResult = {
            suite: { name: "Single URL Test", urls: [url] },
            results: [result],
            summary: {
              total: 1,
              consistent: result.overallStatus === "consistent" ? 1 : 0,
              minorDifferences: result.overallStatus === "minor_differences" ? 1 : 0,
              majorDifferences: result.overallStatus === "major_differences" ? 1 : 0,
            },
            duration: result.duration,
            timestamp: result.timestamp,
          };
          const htmlReport = generateCrossBrowserHtmlReport(suiteResult);
          const outputPath = (options.output as string) || `cross-browser-${Date.now()}.html`;
          fs.writeFileSync(outputPath, htmlReport);
          console.log(`\n📄 HTML report saved to: ${outputPath}`);
        }

        if (result.overallStatus === "major_differences") {
          process.exit(1);
        }
      }
      break;
    }

    // =========================================================================
    // Responsive Visual Testing (v7.3.0)
    // =========================================================================

    case "responsive": {
      const subcommand = args[0];
      // Headless and the engine apply; the page shapes are the presets'.
      const responsiveFlags = () => {
        const flags = browserFlagsOrExit("responsive", options);
        refuseBrowserFlags("responsive", flags, {
          device: "the sizes come from --viewports, whose mobile and tablet presets emulate their own devices",
          viewport: "the sizes come from --viewports ('cbrowser responsive viewports' lists them)",
        });
        // Only the flags given, so a suite file's own options stand otherwise.
        return {
          ...(flags.headless !== undefined ? { headless: flags.headless } : {}),
          ...(flags.browser ? { browser: flags.browser } : {}),
        };
      };

      if (subcommand === "viewports") {
        // List viewport presets
        const presets = listViewportPresets();
        console.log("\n📱 Available Viewport Presets\n");
        console.log("─".repeat(60));

        const byType: Record<string, ViewportPreset[]> = {
          mobile: [],
          tablet: [],
          desktop: [],
        };

        for (const preset of presets) {
          byType[preset.deviceType].push(preset);
        }

        for (const [type, typePresets] of Object.entries(byType)) {
          console.log(`\n${type.toUpperCase()}:`);
          for (const p of typePresets) {
            const touch = p.hasTouch ? " (touch)" : "";
            const device = p.deviceName ? ` - ${p.deviceName}` : "";
            console.log(`   ${p.name.padEnd(15)} ${p.width}x${p.height}${touch}${device}`);
          }
        }
        console.log("");
      } else if (subcommand === "suite") {
        // Responsive suite
        const flags = responsiveFlags();
        const suiteFile = args[1];
        if (!suiteFile) {
          console.error("Usage: cbrowser responsive suite <file.json> [options]");
          console.error("  --html              Generate HTML report");
          console.error("  --output <file>     Save report to file");
          process.exit(1);
        }

        const fs = await import("fs");
        if (!fs.existsSync(suiteFile)) {
          console.error(`Suite file not found: ${suiteFile}`);
          process.exit(1);
        }

        const suite: ResponsiveSuite = JSON.parse(fs.readFileSync(suiteFile, "utf-8"));
        // Flags given on the command line win over the suite file's options.
        const result = await runResponsiveSuite({ ...suite, options: { ...suite.options, ...flags } });

        // Save outputs
        if (options.output && !options.html) {
          fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
          console.log(`\n📄 JSON report saved to: ${options.output}`);
        }

        if (options.html) {
          const htmlReport = generateResponsiveHtmlReport(result);
          const outputPath = (options.output as string) || `responsive-${Date.now()}.html`;
          fs.writeFileSync(outputPath, htmlReport);
          console.log(`\n📄 HTML report saved to: ${outputPath}`);
        }

        // Summary
        console.log(`\n${"═".repeat(60)}`);
        console.log(`   Results: ${result.summary.responsive} responsive, ${result.summary.minorIssues} minor, ${result.summary.majorIssues} major`);
        console.log(`   Total issues: ${result.summary.totalIssues}`);
        console.log(`${"═".repeat(60)}\n`);

        if (result.summary.majorIssues > 0) {
          process.exit(1);
        }
      } else {
        // Single URL test
        const url = subcommand; // First arg is the URL
        if (!url || url.startsWith("--")) {
          console.error("Usage: cbrowser responsive <url> [options]");
          console.error("       cbrowser responsive suite <file.json>");
          console.error("       cbrowser responsive viewports");
          console.error("\nOptions:");
          console.error("  --viewports <list>  mobile,tablet,desktop (default: mobile,tablet,desktop)");
          console.error("  --wait <ms>         Wait before screenshot");
          console.error("  --wait-for <sel>    Wait for selector");
          console.error("  --sensitivity <l>   low, medium, high");
          console.error("  --html              Generate HTML report");
          console.error("  --output <file>     Save report");
          console.error("\nViewport presets:");
          console.error(formatViewportPresetList("  "));
          process.exit(1);
        }

        const flags = responsiveFlags();
        const viewports = options.viewports
          ? (options.viewports as string).split(",")
          : undefined;

        const result = await runResponsiveTest(url, {
          viewports,
          ...flags,
          waitBeforeCapture: options.wait ? parseInt(options.wait as string) : undefined,
          waitForSelector: options["wait-for"] as string | undefined,
          sensitivity: enumOption("sensitivity", options.sensitivity, ["low", "medium", "high"] as const),
        });

        // Print report
        console.log("\n" + formatResponsiveReport(result));

        // Save outputs
        const fs = await import("fs");

        if (options.output && !options.html) {
          fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
          console.log(`\n📄 JSON report saved to: ${options.output}`);
        }

        if (options.html) {
          const suiteResult: ResponsiveSuiteResult = {
            suite: { name: "Single URL Test", urls: [url] },
            results: [result],
            summary: {
              total: 1,
              responsive: result.overallStatus === "responsive" ? 1 : 0,
              minorIssues: result.overallStatus === "minor_issues" ? 1 : 0,
              majorIssues: result.overallStatus === "major_issues" ? 1 : 0,
              totalIssues: result.issues.length,
            },
            commonIssues: result.issues,
            duration: result.duration,
            timestamp: result.timestamp,
          };
          const htmlReport = generateResponsiveHtmlReport(suiteResult);
          const outputPath = (options.output as string) || `responsive-${Date.now()}.html`;
          fs.writeFileSync(outputPath, htmlReport);
          console.log(`\n📄 HTML report saved to: ${outputPath}`);
        }

        if (result.overallStatus === "major_issues") {
          process.exit(1);
        }
      }
      break;
    }

    // =========================================================================
    // A/B Visual Comparison (v7.3.0)
    // =========================================================================

    case "ab": {
      const subcommand = args[0];
      const flags = browserFlagsOrExit("ab", options);

      if (subcommand === "suite") {
        // A/B suite
        const suiteFile = args[1];
        if (!suiteFile) {
          console.error("Usage: cbrowser ab suite <file.json> [options]");
          console.error("  --html              Generate HTML report");
          console.error("  --output <file>     Save report to file");
          process.exit(1);
        }

        const fs = await import("fs");
        if (!fs.existsSync(suiteFile)) {
          console.error(`Suite file not found: ${suiteFile}`);
          process.exit(1);
        }

        const suite: ABSuite = JSON.parse(fs.readFileSync(suiteFile, "utf-8"));
        // Flags given on the command line win over the suite file's options.
        const result = await runABSuite({ ...suite, options: { ...suite.options, ...flags } });

        // Save outputs
        if (options.output && !options.html) {
          fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
          console.log(`\n📄 JSON report saved to: ${options.output}`);
        }

        if (options.html) {
          const htmlReport = generateABHtmlReport(result);
          const outputPath = (options.output as string) || `ab-comparison-${Date.now()}.html`;
          fs.writeFileSync(outputPath, htmlReport);
          console.log(`\n📄 HTML report saved to: ${outputPath}`);
        }

        // Summary
        console.log(`\n${"═".repeat(60)}`);
        console.log(`   Results: ${result.summary.identical} identical, ${result.summary.similar} similar, ${result.summary.different} different, ${result.summary.veryDifferent} very different`);
        console.log(`${"═".repeat(60)}\n`);

        if (result.summary.veryDifferent > 0) {
          process.exit(1);
        }
      } else {
        // Single A/B comparison: ab <urlA> <urlB>
        const urlA = args[0];
        const urlB = args[1];

        if (!urlA || !urlB || urlA.startsWith("--") || urlB.startsWith("--")) {
          console.error("Usage: cbrowser ab <urlA> <urlB> [options]");
          console.error("       cbrowser ab suite <file.json>");
          console.error("\nOptions:");
          console.error("  --label-a <name>    Label for URL A (default: 'Version A')");
          console.error("  --label-b <name>    Label for URL B (default: 'Version B')");
          console.error("  --viewport <WxH>    Page size (default: 1920x1080)");
          console.error("  --width/--height    One side of the page size");
          console.error("  --device <name>     Device preset");
          console.error("  --wait <ms>         Wait before screenshot");
          console.error("  --wait-for <sel>    Wait for selector");
          console.error("  --sensitivity <l>   low, medium, high");
          console.error("  --html              Generate HTML report");
          console.error("  --output <file>     Save report");
          process.exit(1);
        }

        const result = await runABComparison(urlA, urlB, {
          labels: options["label-a"] || options["label-b"] ? {
            a: (options["label-a"] as string) || "Version A",
            b: (options["label-b"] as string) || "Version B",
          } : undefined,
          ...flags,
          waitBeforeCapture: options.wait ? parseInt(options.wait as string) : undefined,
          waitForSelector: options["wait-for"] as string | undefined,
          sensitivity: enumOption("sensitivity", options.sensitivity, ["low", "medium", "high"] as const),
        });

        // Print report
        console.log("\n" + formatABReport(result));

        // Save outputs
        const fs = await import("fs");

        if (options.output && !options.html) {
          fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
          console.log(`\n📄 JSON report saved to: ${options.output}`);
        }

        if (options.html) {
          const suiteResult: ABSuiteResult = {
            suite: { name: "Single Comparison", pairs: [{ urlA, urlB }] },
            results: [result],
            summary: {
              total: 1,
              identical: result.overallStatus === "identical" ? 1 : 0,
              similar: result.overallStatus === "similar" ? 1 : 0,
              different: result.overallStatus === "different" ? 1 : 0,
              veryDifferent: result.overallStatus === "very_different" ? 1 : 0,
            },
            duration: result.duration,
            timestamp: result.timestamp,
          };
          const htmlReport = generateABHtmlReport(suiteResult);
          const outputPath = (options.output as string) || `ab-comparison-${Date.now()}.html`;
          fs.writeFileSync(outputPath, htmlReport);
          console.log(`\n📄 HTML report saved to: ${outputPath}`);
        }

        if (result.overallStatus === "very_different") {
          process.exit(1);
        }
      }
      break;
    }

    default:
      return false;
  }
  return true;
}
