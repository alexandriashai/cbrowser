/**
 * Test suites and their tooling: test-suite, repair-tests, flaky-check,
 * coverage, export, webhook.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */

import { browserFlagsOrExit, refuseBrowserFlags } from "../../cli-browser-flags.js";
import { webhooksPath, loadWebhooks, webhookUrlProblem, SENT_WEBHOOK_EVENTS, WEBHOOK_FORMATS, WEBHOOK_TIMEOUT_MS, sendWebhookEvent } from "../../webhooks.js";
import { loadSuiteForExport, resultsName, saveSuiteResult } from "../../testing/suite-results.js";
import { parseNLInstruction, parseNLTestSuite, dryRunNLTestSuite, type NLTestSuiteOptions, runNLTestSuite, formatNLTestReport, type RepairTestOptions, repairTestSuite, formatRepairReport, exportRepairedTest, type FlakyTestOptions, detectFlakyTests, formatFlakyTestReport, generateCoverageMap, generateCoverageHtmlReport, formatCoverageReport } from "../../testing/index.js";
import type { NLTestCase, CoverageMapOptions } from "../../types.js";
import { uniqueStamp } from "../../temp-files.js";
import { join } from "node:path";
import { assertCaptureNamespaceFlags, buildAutoCaptureSetting, reportAutoCapture } from "../capture.js";
import { timeoutOption, htmlReportPath, numberOption } from "../options.js";
import { generateTestSuiteHtmlReport } from "../reports.js";
import type { CommandContext } from "../context.js";

/** Runs `command` when it belongs to this group; false when it does not. */
export async function runTestingCommand(ctx: CommandContext): Promise<boolean> {
  const { command, args, browser, options, headless, viewportOverride, browserType, geolocation } = ctx;
  switch (command) {
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
      if (format !== "junit" && format !== "tap") {
        console.error("Unknown export format. Use 'junit' or 'tap'");
        process.exit(1);
      }

      // The last `test-suite` run of that suite (it saves every run).
      const suite = loadSuiteForExport(browser.getDataDir(), name);
      if (!suite) {
        console.error(`Test results not found: ${name}`);
        console.error(`  Run 'cbrowser test-suite <file>' first; it saves results as ${resultsName(name)}.json under ${join(browser.getDataDir(), "results")}`);
        process.exit(1);
      }

      if (format === "junit") {
        const exportPath = browser.exportJUnit(suite, output);
        console.log(`✓ JUnit XML exported: ${exportPath}`);
      } else {
        const exportPath = browser.exportTAP(suite, output);
        console.log(`✓ TAP exported: ${exportPath}`);
      }
      break;
    }

    // =========================================================================
    // Webhooks (Tier 2)
    // =========================================================================

    case "webhook": {
      const subcommand = args[0];
      const fs = await import("fs");
      const hooksFile = webhooksPath(browser.getDataDir());

      // Load existing webhooks
      let webhooks = loadWebhooks(browser.getDataDir());

      switch (subcommand) {
        case "add": {
          const name = args[1];
          const url = args[2];
          if (!name || !url) {
            console.error("Usage: cbrowser webhook add <name> <url> [--events <events>] [--format <format>]");
            process.exit(1);
          }
          const urlProblem = webhookUrlProblem(url);
          if (urlProblem) {
            console.error(`Error: ${urlProblem}`);
            process.exit(1);
          }
          // Only events something sends. journey.complete was the default
          // and nothing ever sent it, nor test.fail (audit O17).
          const events = options.events === undefined
            ? ["test.fail"]
            : String(options.events).split(",").map((e) => e.trim()).filter(Boolean);
          const unsent = events.filter((e) => !(SENT_WEBHOOK_EVENTS as readonly string[]).includes(e));
          if (events.length === 0 || unsent.length > 0) {
            console.error(`Error: no command sends ${unsent.join(", ") || "an empty event list"}. Events sent: ${SENT_WEBHOOK_EVENTS.join(", ")} (test.pass/test.fail by test-suite once per run, journey.complete by cognitive-journey)`);
            process.exit(1);
          }
          const format = options.format === undefined ? "generic" : String(options.format);
          if (!(WEBHOOK_FORMATS as readonly string[]).includes(format)) {
            console.error(`Error: --format must be ${WEBHOOK_FORMATS.join(", ")}, got "${format}"`);
            process.exit(1);
          }

          // Remove existing webhook with same name
          webhooks = webhooks.filter(w => w.name !== name);
          webhooks.push({ name, url, events, format });

          fs.writeFileSync(hooksFile, JSON.stringify(webhooks, null, 2));
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
              // An event no command sends (a typo, or one stored before 20.0 checked) is named as such.
              const unsent = w.events.filter((e) => !(SENT_WEBHOOK_EVENTS as readonly string[]).includes(e));
              console.log(`  ${w.name}`);
              console.log(`    URL: ${w.url}`);
              console.log(`    Events: ${w.events.join(", ")}${unsent.length > 0 ? ` (never sent: ${unsent.join(", ")})` : ""}`);
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
            fs.writeFileSync(hooksFile, JSON.stringify(webhooks, null, 2));
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

          const urlProblem = webhookUrlProblem(webhook.url);
          if (urlProblem) {
            console.error(`✗ ${urlProblem}`);
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
              redirect: "error",
              signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
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
          process.exit(1);
      }
      break;
    }

    // =========================================================================
    // Natural Language Test Suites (Tier 6)
    // =========================================================================

    case "test-suite": {
      const filepath = args[0];
      const inlineTest = options.inline as string;

      if (!filepath && !inlineTest) {
        console.error("Usage: cbrowser test-suite <file.txt> [--continue-on-failure] [--output <report.json>]");
        console.error("       cbrowser test-suite --inline \"go to https://... ; click login ; verify ...\"");
        console.error("");
        console.error("Options:");
        console.error("  --continue-on-failure    Continue running after a test fails");
        console.error("  --screenshot-on-failure  Take screenshots on failure (default: true)");
        console.error("  --output <file>          Save JSON report to file");
        console.error("  --html                   Generate HTML report");
        console.error("  --timeout <ms>           Timeout per step (default: 30000)");
        console.error("  --dry-run                Parse and display test steps without executing");
        console.error("  --fuzzy-match            Case-insensitive fuzzy matching for assertions");
        console.error("  --step-through           Pause before each step for interactive execution");
        console.error("");
        console.error("Test File Format:");
        console.error("  # Test: Login Flow");
        console.error("  go to https://example.com");
        console.error("  click the login button");
        console.error("  type \"user@example.com\" in email field");
        console.error("  verify url contains \"/dashboard\"");
        process.exit(1);
      }

      let suite: { name: string; tests: NLTestCase[] };

      if (inlineTest) {
        // Parse inline test - semicolons separate steps
        const steps = inlineTest.split(";").map(s => s.trim()).filter(s => s);
        const testCase: NLTestCase = {
          name: "Inline Test",
          steps: steps.map(s => parseNLInstruction(s)),
        };
        suite = { name: "Inline Suite", tests: [testCase] };
      } else {
        // Load from file
        const fs = await import("fs");
        if (!fs.existsSync(filepath!)) {
          console.error(`Test file not found: ${filepath}`);
          process.exit(1);
        }
        const content = fs.readFileSync(filepath!, "utf-8");
        const suiteName = filepath!.split("/").pop()?.replace(/\.[^.]+$/, "") || "Test Suite";
        suite = parseNLTestSuite(content, suiteName);
      }

      console.log(`\n📝 Parsed ${suite.tests.length} test(s) from ${inlineTest ? "inline" : filepath}`);
      for (const test of suite.tests) {
        console.log(`   - ${test.name}: ${test.steps.length} steps`);
      }

      // Dry-run mode: parse and display without executing
      if (options["dry-run"]) {
        const dryResult = dryRunNLTestSuite(suite);
        console.log(`\n🔍 DRY RUN - Parsed steps (no execution):\n`);
        for (const test of dryResult.tests) {
          console.log(`  📋 ${test.name}`);
          for (let i = 0; i < test.steps.length; i++) {
            const step = test.steps[i];
            const parsed = `[${step.action}${step.target ? `: ${step.target}` : ""}${step.value ? ` = "${step.value}"` : ""}]`;
            console.log(`     ${i + 1}. ${step.instruction}  ${parsed}`);
          }
          console.log("");
        }
        break;
      }

      // Step-through mode: pause before each step
      if (options["step-through"]) {
        const readline = await import("readline");
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY || false });
        const ask = (q: string): Promise<string> => new Promise((resolve, reject) => {
          rl.question(q, resolve);
          rl.once("close", () => reject(new Error("stdin closed")));
        });

        console.log(`\n🔍 Step-through mode enabled. Press Enter to execute each step.\n`);

        const { CBrowser } = await import("../../browser.js");
        const stepBrowser = new CBrowser({
          headless,
          ...(typeof options.device === "string" ? { device: options.device } : {}),
          ...(viewportOverride ? { viewportWidth: viewportOverride.width, viewportHeight: viewportOverride.height, viewportOverride } : {}),
        });
        await (stepBrowser as any).launch();

        try {
          const totalSteps = suite.tests.reduce((sum, t) => sum + t.steps.length, 0);
          let stepNum = 0;
          let stopped = false;

          for (const test of suite.tests) {
            if (stopped) break;
            console.log(`\n📋 Test: ${test.name}`);

            for (const step of test.steps) {
              stepNum++;
              const parsed = `[${step.action}${step.target ? `: ${step.target}` : ""}${step.value ? ` = "${step.value}"` : ""}]`;
              console.log(`\nStep ${stepNum}/${totalSteps}: ${step.instruction}`);
              console.log(`  → Parsed as: ${parsed}`);

              let input = "";
              try {
                input = await ask("  Press [Enter] to execute, [s] to skip, [q] to quit: ");
              } catch {
                console.log("\n⏹ Stopped (stdin closed).");
                stopped = true;
                break;
              }

              if (input.trim().toLowerCase() === "q") {
                console.log("\n⏹ Stopped by user.");
                stopped = true;
                break;
              }
              if (input.trim().toLowerCase() === "s") {
                console.log("  ⏭ Skipped");
                continue;
              }

              const start = Date.now();
              try {
                switch (step.action) {
                  case "navigate":
                    await stepBrowser.navigate(step.target || "");
                    break;
                  case "click":
                    await stepBrowser.smartClick(step.target || "");
                    break;
                  case "fill":
                    await stepBrowser.fill(step.target || "", step.value || "");
                    break;
                  case "assert":
                    // Same contract as runNLTestSuite: exact unless --fuzzy-match.
                    const r = await stepBrowser.assert(step.instruction, { caseSensitive: options["fuzzy-match"] !== true });
                    if (!r.passed) throw new Error(r.message);
                    break;
                  case "screenshot":
                    await stepBrowser.screenshot();
                    break;
                  case "wait":
                    if (step.value) await new Promise(r => setTimeout(r, parseFloat(step.value!) * 1000));
                    break;
                  default:
                    await stepBrowser.smartClick(step.target || step.instruction);
                }
                console.log(`  ✓ Completed (${Date.now() - start}ms)`);
              } catch (e: any) {
                console.log(`  ✗ Failed: ${e.message} (${Date.now() - start}ms)`);
                process.exitCode = 1;
              }
            }
          }
        } finally {
          rl.close();
          await stepBrowser.close();
        }
        break;
      }

      assertCaptureNamespaceFlags("test-suite", options);

      const suiteOptions: NLTestSuiteOptions = {
        stepTimeout: timeoutOption(options.timeout, 30000),
        continueOnFailure: options["continue-on-failure"] === true,
        screenshotOnFailure: options["screenshot-on-failure"] !== false,
        headless,
        device: typeof options.device === "string" ? options.device : undefined,
        viewport: viewportOverride,
        ...(options.browser !== undefined ? { browser: browserType } : {}),
        ...(geolocation ? { geolocation } : {}),
        ...(typeof options.locale === "string" ? { locale: options.locale } : {}),
        ...(typeof options.timezone === "string" ? { timezone: options.timezone } : {}),
        fuzzyMatch: options["fuzzy-match"] === true,
        capture: buildAutoCaptureSetting(options, `test-suite-${suite.name.replace(/[^a-zA-Z0-9-_]+/g, "-").toLowerCase()}-${uniqueStamp()}`),
      };

      const result = await runNLTestSuite(suite, suiteOptions);

      // Print formatted report
      const report = formatNLTestReport(result);
      console.log(report);
      reportAutoCapture(result.capture);

      // Saved for `cbrowser export junit|tap`, which read this directory
      // while nothing wrote it (audit O17).
      const savedPath = saveSuiteResult(browser.getDataDir(), result);
      console.log(`\n💾 Results saved: ${savedPath} (export: cbrowser export junit ${resultsName(result.name)})`);

      // Webhooks: one event per run. A failed send is a warning, never the
      // run's result.
      await sendWebhookEvent(browser.getDataDir(), result.summary.failed > 0 ? "test.fail" : "test.pass", {
        suite: result.name,
        summary: {
          total: result.summary.total,
          passed: result.summary.passed,
          failed: result.summary.failed,
          skipped: result.summary.skipped,
        },
        failedTests: result.testResults.filter((t) => !t.passed).map((t) => ({ name: t.name, ...(t.error ? { error: t.error } : {}) })),
      });

      // Save JSON output if requested
      if (options.output) {
        const fs = await import("fs");
        fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
        console.log(`\n📄 JSON report saved: ${options.output}`);
      }

      // Generate HTML report if requested
      if (options.html) {
        const fs = await import("fs");
        const htmlReport = generateTestSuiteHtmlReport(result);
        const htmlPath = htmlReportPath(options.output, "test-report.html");
        fs.writeFileSync(htmlPath, htmlReport);
        console.log(`\n🌐 HTML report saved: ${htmlPath}`);
      }

      // Exit with error code if any tests failed
      if (result.summary.failed > 0) {
        process.exit(1);
      }
      break;
    }

    // =========================================================================
    // AI Test Repair (Tier 6 - v6.2.0)
    // =========================================================================

    case "repair":
    case "repair-tests": {
      const filepath = args[0];

      if (!filepath) {
        console.error("Usage: cbrowser repair-tests <test-file.txt> [--auto-apply] [--verify] [--output <file>]");
        console.error("");
        console.error("Options:");
        console.error("  --auto-apply    Automatically apply the best repair suggestion");
        console.error("  --verify        Re-run repaired tests to verify they pass");
        console.error("  --output <file> Save repaired tests to a new file");
        console.error("  --json-out <file>  Save repair report as JSON (--json prints it)");
        console.error("");
        console.error("Examples:");
        console.error("  cbrowser repair-tests broken-test.txt");
        console.error("  cbrowser repair-tests tests.txt --auto-apply --verify");
        console.error("  cbrowser repair-tests tests.txt --auto-apply --output fixed-tests.txt");
        process.exit(1);
      }

      const fs = await import("fs");
      if (!fs.existsSync(filepath)) {
        console.error(`Test file not found: ${filepath}`);
        process.exit(1);
      }

      const content = fs.readFileSync(filepath, "utf-8");
      const suiteName = filepath.split("/").pop()?.replace(/\.[^.]+$/, "") || "Test Suite";
      const suite = parseNLTestSuite(content, suiteName);

      console.log(`\n📝 Parsed ${suite.tests.length} test(s) from ${filepath}`);
      for (const test of suite.tests) {
        console.log(`   - ${test.name}: ${test.steps.length} steps`);
      }

      // --output writes the repaired file, which only exists with --auto-apply;
      // without it the flag used to do nothing and say nothing.
      if (options.output && options["auto-apply"] !== true) {
        console.error("Error: --output saves the repaired tests, which needs --auto-apply");
        process.exit(1);
      }

      const repairFlags = browserFlagsOrExit("repair-tests", options);
      const repairOptions: RepairTestOptions = {
        headless,
        browser: repairFlags.browser,
        device: repairFlags.device,
        viewport: repairFlags.viewport,
        autoApply: options["auto-apply"] === true,
        verifyRepairs: options.verify === true,
        maxRetries: options.retries ? parseInt(options.retries as string) : 3,
      };

      const result = await repairTestSuite(suite, repairOptions);

      // Print formatted report
      const report = formatRepairReport(result);
      console.log(report);

      // Save the JSON report: --json-out <file>, or the older --json=<file>.
      // --json alone is the on/off flag every other command uses, so here it
      // prints the report to stdout instead of passing `true` as a path.
      // (Audit 2026-10-21: --json was a path here and a switch elsewhere.)
      const jsonOut = typeof options["json-out"] === "string" ? options["json-out"]
        : typeof options.json === "string" ? options.json : undefined;
      if (jsonOut) {
        fs.writeFileSync(jsonOut, JSON.stringify(result, null, 2));
        console.log(`\n📄 JSON report saved: ${jsonOut}`);
      } else if (options.json === true) {
        console.log(JSON.stringify(result, null, 2));
      }

      // Save repaired tests if requested
      if (options.output && repairOptions.autoApply) {
        const repairedContent: string[] = [];

        for (const testResult of result.testResults) {
          repairedContent.push(exportRepairedTest(testResult));
          repairedContent.push("");
        }

        fs.writeFileSync(options.output as string, repairedContent.join("\n"));
        console.log(`\n📝 Repaired tests saved: ${options.output}`);
      }

      // Exit with status based on whether repairs were needed
      if (result.summary.testsWithFailures > 0 && !repairOptions.autoApply) {
        console.log("\n💡 Run with --auto-apply to automatically fix issues");
        process.exit(1);
      }
      // With --auto-apply, a test that failed and was not repaired still fails.
      if (result.summary.testsRepaired < result.summary.testsWithFailures) {
        console.error(`✗ ${result.summary.testsWithFailures - result.summary.testsRepaired} failing test(s) could not be repaired`);
        process.exit(1);
      }
      break;
    }

    // =========================================================================
    // Flaky Test Detection (Tier 6 - v6.3.0)
    // =========================================================================

    case "flaky":
    case "flaky-check": {
      const filepath = args[0];

      if (!filepath) {
        console.error("Usage: cbrowser flaky-check <test-file.txt> [--runs <n>] [--threshold <n>] [--output <file>]");
        console.error("");
        console.error("Options:");
        console.error("  --runs <n>        Number of times to run each test (default: 5)");
        console.error("  --threshold <n>   Flakiness threshold % to flag a test (default: 20)");
        console.error("  --delay <ms>      Delay between runs in ms (default: 500)");
        console.error("  --output <file>   Save JSON report to file");
        console.error("");
        console.error("Examples:");
        console.error("  cbrowser flaky-check tests.txt");
        console.error("  cbrowser flaky-check tests.txt --runs 10");
        console.error("  cbrowser flaky-check tests.txt --runs 5 --threshold 30 --output flaky-report.json");
        process.exit(1);
      }

      const fs = await import("fs");
      if (!fs.existsSync(filepath)) {
        console.error(`Test file not found: ${filepath}`);
        process.exit(1);
      }

      const content = fs.readFileSync(filepath, "utf-8");
      const suiteName = filepath.split("/").pop()?.replace(/\.[^.]+$/, "") || "Test Suite";
      const suite = parseNLTestSuite(content, suiteName);

      console.log(`\n📝 Parsed ${suite.tests.length} test(s) from ${filepath}`);
      for (const test of suite.tests) {
        console.log(`   - ${test.name}: ${test.steps.length} steps`);
      }

      const flakyFlags = browserFlagsOrExit("flaky-check", options);
      const flakyOptions: FlakyTestOptions = {
        headless,
        browser: flakyFlags.browser,
        device: flakyFlags.device,
        viewport: flakyFlags.viewport,
        runs: options.runs ? parseInt(options.runs as string) : 5,
        // A percentage: parseInt read "0.2" as 0, which flagged every test.
        flakinessThreshold: numberOption("threshold", options.threshold, 20, { min: 0, max: 100 }),
        delayBetweenRuns: options.delay ? parseInt(options.delay as string) : 500,
      };

      const result = await detectFlakyTests(suite, flakyOptions);

      // Print formatted report
      const report = formatFlakyTestReport(result);
      console.log(report);

      // Save JSON report if requested
      if (options.output) {
        fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
        console.log(`\n📄 JSON report saved: ${options.output}`);
      }

      // Exit with error code if flaky tests found
      if (result.summary.flakyTests > 0) {
        process.exit(1);
      }
      break;
    }

    // =========================================================================
    // Test Coverage Map (Tier 6 - v6.5.0)
    // =========================================================================

    case "coverage": {
      const fs = await import("fs");
      const path = await import("path");
      const subcommand = args[0];

      // Simple glob function for test files
      function findTestFiles(pattern: string): string[] {
        const files: string[] = [];
        const parts = pattern.split("/");
        const dir = parts.slice(0, -1).join("/") || ".";
        const filePattern = parts[parts.length - 1];
        const regex = new RegExp("^" + filePattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");

        try {
          const dirFiles = fs.readdirSync(dir);
          for (const file of dirFiles) {
            if (regex.test(file)) {
              files.push(path.join(dir, file));
            }
          }
        } catch {
          // Directory doesn't exist
        }
        return files;
      }

      // The browser flags reach the crawl. A sitemap is read without one.
      const coverageFlags = browserFlagsOrExit("coverage", options);
      if (options.sitemap) {
        const noBrowser = "--sitemap reads the sitemap without a browser, so there is no page to apply it to";
        refuseBrowserFlags("coverage", coverageFlags, { headless: noBrowser, browser: noBrowser, device: noBrowser, viewport: noBrowser });
      }

      // Handle "coverage gaps" subcommand
      if (subcommand === "gaps") {
        const url = args[1];
        if (!url) {
          console.error("Usage: cbrowser coverage gaps <url> [--tests <glob>] [--sitemap <url>]");
          process.exit(1);
        }

        console.log(`\n🔍 Finding untested pages for: ${url}`);

        const testPattern = (options.tests as string) || "tests/*.txt";
        const testFiles = findTestFiles(testPattern);

        if (testFiles.length === 0) {
          console.error(`No test files found matching: ${testPattern}`);
          process.exit(1);
        }

        console.log(`   Analyzing ${testFiles.length} test file(s)...`);

        const coverageOptions: CoverageMapOptions = {
          sitemapUrl: options.sitemap as string | undefined,
          maxPages: 50, // Quick mode
          minCoverage: 50,
          ...coverageFlags,
        };

        const result = await generateCoverageMap(url, testFiles, coverageOptions);

        // Show only gaps
        console.log(`\n🕳️  Coverage Gaps (${result.gaps.length} found):\n`);

        const priorityEmoji: Record<string, string> = { critical: "🚨", high: "🔴", medium: "🟡", low: "🟢" };

        for (const gap of result.gaps) {
          const emoji = priorityEmoji[gap.priority];
          console.log(`  ${emoji} ${gap.page.path}`);
          console.log(`     Priority: ${gap.priority} | Reason: ${gap.reason}`);
        }

        console.log(`\n📊 Coverage: ${result.analysis.coveragePercent}% (${result.analysis.testedPages}/${result.analysis.totalPages} pages)`);
        break;
      }

      // Main coverage command
      const url = subcommand;
      if (!url || url.startsWith("-")) {
        console.error("Usage: cbrowser coverage <url> [--tests <glob>] [--sitemap <url>] [--html] [--output <file>]");
        process.exit(1);
      }

      console.log(`\n📊 Generating test coverage map for: ${url}`);

      const testPattern = (options.tests as string) || "tests/*.txt";
      const testFiles = findTestFiles(testPattern);

      if (testFiles.length === 0) {
        console.error(`No test files found matching: ${testPattern}`);
        console.error("Use --tests <glob> to specify test files");
        process.exit(1);
      }

      console.log(`   Found ${testFiles.length} test file(s)`);
      for (const f of testFiles.slice(0, 5)) {
        console.log(`     - ${f}`);
      }
      if (testFiles.length > 5) {
        console.log(`     ... and ${testFiles.length - 5} more`);
      }

      const coverageOptions: CoverageMapOptions = {
        sitemapUrl: options.sitemap as string | undefined,
        maxPages: options["max-pages"] ? parseInt(options["max-pages"] as string) : 100,
        includePattern: options.include as string | undefined,
        excludePattern: options.exclude as string | undefined,
        minCoverage: options["min-coverage"] ? parseInt(options["min-coverage"] as string) : 50,
        ...coverageFlags,
      };

      if (coverageOptions.sitemapUrl) {
        console.log(`   Using sitemap: ${coverageOptions.sitemapUrl}`);
      } else {
        console.log(`   Crawling site (max ${coverageOptions.maxPages} pages)...`);
      }

      const result = await generateCoverageMap(url, testFiles, coverageOptions);

      // Output format
      if (options.html) {
        const htmlReport = generateCoverageHtmlReport(result);
        const outputPath = (options.output as string) || "coverage-report.html";
        fs.writeFileSync(outputPath, htmlReport);
        console.log(`\n✅ HTML report saved: ${outputPath}`);
      } else if (options.output && (options.output as string).endsWith(".json")) {
        fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
        console.log(`\n✅ JSON report saved: ${options.output}`);
      } else {
        // Print text report
        const report = formatCoverageReport(result);
        console.log(report);

        if (options.output) {
          fs.writeFileSync(options.output as string, report);
          console.log(`\n📄 Report saved: ${options.output}`);
        }
      }

      // Exit with error if coverage too low
      if (result.analysis.coveragePercent < (coverageOptions.minCoverage || 50)) {
        console.log(`\n⚠️  Coverage (${result.analysis.coveragePercent}%) is below threshold (${coverageOptions.minCoverage}%)`);
        process.exit(1);
      }
      break;
    }

    default:
      return false;
  }
  return true;
}
