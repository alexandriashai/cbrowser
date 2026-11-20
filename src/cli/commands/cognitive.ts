/**
 * Cognitive journeys and persona comparison: explore (journey),
 * compare-personas, cognitive-journey.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */

import { browserFlagsOrExit, refuseBrowserFlags } from "../../cli-browser-flags.js";
import { sendWebhookEvent } from "../../webhooks.js";
import { comparePersonas, formatComparisonReport } from "../../analysis/index.js";
import { BUILTIN_PERSONAS } from "../../personas.js";
import { uniqueStamp } from "../../temp-files.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AutoCaptureResult } from "../../recording/auto-capture.js";
import { isApiKeyConfigured, runCognitiveJourney, journeySlug } from "../../cognitive/index.js";
import { formatJourneyStep, journeyEndLine } from "../../cognitive/journey-dialog.js";
import { assertCaptureNamespaceFlags, buildAutoCaptureSetting, reportAutoCapture } from "../capture.js";
import { htmlReportPath } from "../options.js";
import { generateHtmlReport } from "../reports.js";
import type { CommandContext } from "../context.js";

/** Runs `command` when it belongs to this group; false when it does not. */
export async function runCognitiveCommand(ctx: CommandContext): Promise<boolean> {
  const { command, args, options, browser, headless, geolocation, viewportOverride } = ctx;
  switch (command) {
    case "journey": // Deprecated alias for 'explore'
    case "explore": {
      if (command === "journey") {
        console.warn("⚠️  'journey' is deprecated. Use 'explore' instead.\n");
      }
      const persona = args[0] || "first-timer";
      // --url works too (audit F25: four spellings of "start URL").
      const startUrl = (options.start ?? options.url) as string;
      const goal = (options.goal as string) || "Explore the site";

      if (!startUrl) {
        console.error("Error: --start URL required");
        process.exit(1);
      }

      // 20.0.0: no keyless mode. The heuristic explorer reported success
      // whenever any goal word ("the" included) was on the page (2026-10-21).
      if (!isApiKeyConfigured()) {
        console.error("Error: explore needs an Anthropic API key (cbrowser config set-api-key <key>). The keyless heuristic mode was removed in 20.0.0 because its results were not accurate.");
        process.exit(1);
      }
      console.log(`🔍 Starting exploration as "${persona}"...`);
      console.log(`   Goal: ${goal}`);
      console.log("");

      const result = await browser.journey({ persona, startUrl, goal });

      console.log("");
      console.log(`📊 Journey Results`);
      console.log(`   Success: ${result.success ? "✓" : "✗"}`);
      if (!result.success) process.exitCode = 1;
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

    // =========================================================================
    // Tier 6: Multi-Persona Comparison (v6.0.0)
    // =========================================================================

    case "compare-personas": {
      const startUrl = options.start as string;
      const goal = options.goal as string;
      const personaList = options.personas as string;

      if (!startUrl) {
        console.error("Error: --start URL required");
        process.exit(1);
      }

      if (!goal) {
        console.error("Error: --goal required");
        process.exit(1);
      }

      // Default to comparing all built-in personas if none specified
      const personaNames = personaList
        ? personaList.split(",").map((p) => p.trim())
        : Object.keys(BUILTIN_PERSONAS);

      const concurrency = options.concurrency
        ? parseInt(options.concurrency as string)
        : 3;

      const personaFlags = browserFlagsOrExit("compare-personas", options);
      refuseBrowserFlags("compare-personas", personaFlags, {
        browser: "it runs cognitive journeys, which take no engine option",
      });

      const comparison = await comparePersonas({
        startUrl,
        goal,
        personas: personaNames,
        maxConcurrency: concurrency,
        headless,
        device: personaFlags.device,
        viewport: personaFlags.viewport,
        // An override for every journey: two personas carry their own
        // locale, which beats CBROWSER_LOCALE, so the env alone left them
        // in en-US while the rest took the flag.
        ...(typeof options.locale === "string" ? { locale: options.locale } : {}),
      });

      // Print formatted report
      const report = formatComparisonReport(comparison);
      console.log(report);

      // Save JSON output if requested
      if (options.output) {
        const fs = await import("fs");
        fs.writeFileSync(options.output as string, JSON.stringify(comparison, null, 2));
        console.log(`\n📄 JSON report saved: ${options.output}`);
      }

      // Generate HTML report if requested
      if (options.html) {
        const fs = await import("fs");
        const htmlReport = generateHtmlReport(comparison);
        const htmlPath = htmlReportPath(options.output, "comparison-report.html");
        fs.writeFileSync(htmlPath, htmlReport);
        console.log(`\n🌐 HTML report saved: ${htmlPath}`);
      }

      // Exit with error if any personas failed
      if (comparison.summary.failureCount > 0) {
        process.exit(1);
      }
      break;
    }

    // =========================================================================
    // Cognitive Journey (v8.0.0) - API-powered autonomous user simulation
    // =========================================================================

    case "cognitive-journey": {
      // A replay makes no model calls, so it needs no key (audit 2026-10-21:
      // the key gate blocked replays, and --replay-trace never reached the
      // engine, so a "replay" was a live, paid run).
      const replayTrace = typeof options["replay-trace"] === "string" ? resolve(options["replay-trace"]) : undefined;
      if (replayTrace && !existsSync(replayTrace)) {
        console.error(`Error: trace file not found: ${replayTrace}`);
        process.exit(1);
      }
      // Check API key first
      if (!replayTrace && !isApiKeyConfigured()) {
        // Output structured prompt for Claude Code integration
        // Format matches Claude Agent SDK's AskUserQuestion tool
        const apiKeyPrompt = {
          questions: [
            {
              question: "Cognitive journeys require an Anthropic API key. How would you like to proceed?",
              header: "API Key",
              options: [
                {
                  label: "I'll provide my API key",
                  description: "Set with: cbrowser config set-api-key sk-ant-..."
                },
                {
                  label: "Set via environment",
                  description: "Set ANTHROPIC_API_KEY environment variable"
                },
                {
                  label: "Cancel",
                  description: "Skip this journey for now"
                }
              ],
              multiSelect: false
            }
          ],
          _metadata: {
            error: "api_key_missing",
            setup_command: "cbrowser config set-api-key <YOUR_KEY>",
            env_var: "ANTHROPIC_API_KEY"
          }
        };

        // Output JSON for Claude Code to parse
        console.log(JSON.stringify(apiKeyPrompt, null, 2));
        process.exit(1);
      }

      const startUrl = (options.start ?? options.url) as string; // --url works too (audit F25)
      const goal = options.goal as string;

      if (!startUrl) {
        console.error("Error: --start <url> is required (--url works too)");
        process.exit(1);
      }
      if (!goal) {
        console.error("Error: --goal <goal> is required");
        process.exit(1);
      }
      // The first word names the run (`cognitive-journey ucdenver --start ...`).
      // It used to be dropped without a word (2026-10-23); more than one
      // word is refused, since the rest would be dropped the same way.
      if (args.length > 1) {
        console.error(`Error: cognitive-journey takes one name before its flags; got ${args.map((a) => JSON.stringify(a)).join(" ")}.`);
        console.error(`  The persona goes in --persona <name>, the site in --start <url>, the goal in --goal "<goal>".`);
        process.exit(1);
      }
      const journeyName = args[0];

      const personaName = (options.persona as string) || "first-timer";
      const maxSteps = options["max-steps"] ? parseInt(options["max-steps"] as string) : 50;
      const maxTime = options["max-time"] ? parseInt(options["max-time"] as string) : 120;
      const verbose = options.verbose === true;
      // Undefined unless asked, so the engine decides from $DISPLAY. This was
      // `=== true`, which made a plain journey launch headed on a server
      // with no display, unlike every other command.
      const headless = options.headless === true ? true : options.headless === false ? false : undefined;
      const vision = options["no-vision"] !== true; // Vision ON by default (v17.1.0)

      // Parse location options
      let locationOverride: { timezone?: string; locale?: string; geolocation?: { latitude: number; longitude: number } } | undefined;
      if (options.timezone || options.locale || options.geolocation || geolocation) {
        locationOverride = {};
        // The global --geo (a preset or lat,lon) was accepted here and ignored.
        if (geolocation) locationOverride.geolocation = { latitude: geolocation.latitude, longitude: geolocation.longitude };
        if (options.timezone) locationOverride.timezone = options.timezone as string;
        if (options.locale) locationOverride.locale = options.locale as string;
        if (options.geolocation) {
          const [lat, lng] = (options.geolocation as string).split(",").map(s => parseFloat(s.trim()));
          if (!isNaN(lat) && !isNaN(lng)) {
            locationOverride.geolocation = { latitude: lat, longitude: lng };
          } else {
            console.warn("   ⚠️ Invalid geolocation format. Use: --geolocation lat,lng");
          }
        }
      }

      // Read custom traits from environment variable (for Enterprise autonomous mode)
      let customTraits: Record<string, number> | undefined;
      const envTraits = process.env.CBROWSER_CUSTOM_TRAITS;
      if (envTraits) {
        try {
          customTraits = JSON.parse(envTraits);
          if (verbose) {
            console.log(`   Custom traits: ${Object.keys(customTraits || {}).length} trait overrides from env`);
          }
        } catch {
          console.warn(`   ⚠️ Could not parse CBROWSER_CUSTOM_TRAITS env var`);
        }
      }

      console.log(`\n🧠 COGNITIVE JOURNEY${journeyName ? `: ${journeyName}` : ""}`);
      console.log(`   Persona: ${personaName}`);
      console.log(`   Goal: "${goal}"`);
      console.log(`   URL: ${startUrl}`);
      console.log(`   Max steps: ${maxSteps} | Max time: ${maxTime}s`);
      if (!vision) console.log(`   Vision: disabled (text-only mode)`);
      if (customTraits) console.log(`   Traits: custom profile (${Object.keys(customTraits).length} traits)`);
      if (locationOverride) {
        const locParts: string[] = [];
        if (locationOverride.timezone) locParts.push(`tz=${locationOverride.timezone}`);
        if (locationOverride.locale) locParts.push(`locale=${locationOverride.locale}`);
        if (locationOverride.geolocation) locParts.push(`geo=${locationOverride.geolocation.latitude},${locationOverride.geolocation.longitude}`);
        console.log(`   Location: ${locParts.join(", ")}`);
      }
      console.log("");

      try {
        assertCaptureNamespaceFlags("cognitive-journey", options);

        const result = await runCognitiveJourney({
          ...(journeyName ? { name: journeyName } : {}),
          persona: personaName,
          goal,
          startUrl,
          maxSteps,
          maxTime,
          verbose,
          headless,
          device: typeof options.device === "string" ? options.device : undefined,
          viewport: viewportOverride,
          trace: options.trace === true,
          replayTrace,
          // A persona is a new visitor: a fresh profile unless --persistent.
          // The engine's default used the shared logged-in profile, so a
          // "first-timer" carried the user's cookies (audit 2026-10-21).
          persistent: options.persistent === true,
          vision,
          customTraits, // Pass custom traits from env var
          location: locationOverride, // Pass location override
          capture: buildAutoCaptureSetting(options, `journey-${journeySlug(journeyName ?? personaName)}-${uniqueStamp()}`),
          // Each step's dialog as it happens: phase and mood, the persona's
          // monologue, and what it did (src/cognitive/journey-dialog.ts).
          // --verbose prints its own fuller block instead.
          onStep: verbose ? undefined : (step) => {
            console.log(formatJourneyStep(step).join("\n"));
          },
        });

        console.log("\n");
        reportAutoCapture(result.capture as AutoCaptureResult | undefined);
        if (result.tracePath) {
          console.log(`🧾 Trace: ${result.tracePath}`);
          console.log(`   Replay it with no API calls: cbrowser cognitive-journey --start <url> --goal <goal> --replay-trace ${result.tracePath}`);
        }

        console.log(journeyEndLine(result));
        if (!result.goalAchieved) {
          if (result.abandonmentMessage) {
            console.log(`   💭 "${result.abandonmentMessage}"`);
          }
        }

        console.log(`\n📊 Summary:`);
        console.log(`   Steps: ${result.stepCount}`);
        console.log(`   Time: ${result.totalTime.toFixed(1)}s`);
        console.log(`   Friction points: ${result.frictionPoints.length}`);
        console.log(`   Max frustration: ${(result.summary.maxFrustrationLevel * 100).toFixed(0)}%`);
        // Decision fatigue metrics (v9.9.0)
        if (result.summary.decisionsMade !== undefined) {
          console.log(`   Decisions made: ${result.summary.decisionsMade}`);
          console.log(`   Decision fatigue: ${((result.summary.finalDecisionFatigue ?? 0) * 100).toFixed(0)}%`);
          if (result.summary.wasChoosingDefaults) {
            console.log(`   ⚠️  Was choosing defaults (high fatigue)`);
          }
        }

        if (result.frictionPoints.length > 0) {
          console.log(`\n⚠️  Friction Points:`);
          for (const fp of result.frictionPoints) {
            console.log(`   Step ${fp.step}: ${fp.type} - ${fp.monologue}`);
            if (fp.element) {
              console.log(`      Element: ${fp.element}`);
            }
          }
        }

        // Save report
        if (options.output) {
          const fs = await import("fs");
          fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
          console.log(`\n📄 Report saved: ${options.output}`);
        }

        // Exit with appropriate code. This IS a cognitive journey, so
        // goalAchieved genuinely means the persona reached the goal — unlike
        // the empathy audit's field of the same old name, which measured
        // barriers and was renamed to noBlockingBarriers.
        // journey.complete, once per journey (audit O17: it was the default
        // event and nothing ever sent it). Never fails the journey.
        await sendWebhookEvent(browser.getDataDir(), "journey.complete", {
          ...(journeyName ? { name: journeyName } : {}),
          persona: personaName,
          goal,
          startUrl,
          goalAchieved: result.goalAchieved,
          ...(result.abandonmentReason ? { abandonmentReason: result.abandonmentReason } : {}),
          stepCount: result.stepCount,
          totalTimeSeconds: Math.round(result.totalTime * 10) / 10,
        });

        // Keep a failure reportAutoCapture already set: a lost capture used
        // to be overwritten by the goal's 0.
        process.exit(result.goalAchieved ? (process.exitCode ?? 0) : 1);
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
