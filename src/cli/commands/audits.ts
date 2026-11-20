/**
 * Audits and benchmarks: a11y, agent-ready-audit, ai-benchmark, webmcp-ready,
 * competitive-benchmark, empathy-audit.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */

import { browserFlagsOrExit, refuseBrowserFlags } from "../../cli-browser-flags.js";
import { runAgentReadyAudit, formatAgentReadyReport, generateAgentReadyHtmlReport, runAIReadinessBenchmark, runWebMCPReadyAudit, generateWebMCPReadyHtmlReport, runCompetitiveBenchmark, formatCompetitiveBenchmarkReport, generateCompetitiveBenchmarkHtmlReport, runEmpathyAudit, formatEmpathyAuditReport, generateEmpathyAuditHtmlReport } from "../../analysis/index.js";
import { listAccessibilityPersonas, PERSONA_ALIASES } from "../../personas.js";
import { defaultGeoRegion } from "../../config.js";
import { isApiKeyConfigured } from "../../cognitive/index.js";
import { isLightpandaConfigured } from "../../lightpanda.js";
import { resolveDevicePreset } from "../capture.js";
import { htmlReportPath, timeoutOption } from "../options.js";
import type { CommandContext } from "../context.js";

/** Runs `command` when it belongs to this group; false when it does not. */
export async function runAuditCommand(ctx: CommandContext): Promise<boolean> {
  const { command, args, browser, options, headless, colorScheme } = ctx;
  switch (command) {
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
        process.exit(1);
      }
      break;
    }

    // =========================================================================
    // Agent-Ready Audit, Competitive Benchmark, Accessibility Empathy (v9.0.0)
    // =========================================================================

    case "agent-ready-audit": {
      const url = args[0];
      if (!url) {
        console.error("Error: URL required");
        console.error("Usage: cbrowser agent-ready-audit <url> [--html] [--output <file>] [--lightpanda]");
        process.exit(1);
      }

      const useLightpanda = options.lightpanda === true;
      if (useLightpanda && !isLightpandaConfigured()) {
        console.error("Error: --lightpanda flag requires LIGHTPANDA_ENDPOINT or LIGHTPANDA_TOKEN to be set");
        console.error("Run 'cbrowser lightpanda-setup' for instructions.");
        process.exit(1);
      }

      // --geo-region was checked and set for this run above (an unconfigured
      // one exits 1 there); the audit's browser takes it from its config.
      const geoRegion = defaultGeoRegion();
      if (useLightpanda && geoRegion) {
        console.error(`Error: --lightpanda does not go through geo region ${geoRegion}: Lightpanda's browser does not use the proxy, so the audit would run from its own IP.`);
        console.error("  Run without --lightpanda, or without the region.");
        process.exit(1);
      }

      console.log(`\n🤖 Running Agent-Ready Audit on ${url}...${useLightpanda ? " (with Lightpanda)" : ""}${geoRegion ? ` (via ${geoRegion})` : ""}\n`);

      const result = await runAgentReadyAudit(url, {
        headless,
        useLightpanda,
        // Accepted by the engine and dropped here until 20.0, so a mobile
        // audit from the CLI was silently a desktop audit.
        ...(typeof options.device === "string" ? { device: resolveDevicePreset(options.device) } : {}),
        ...(typeof options.locale === "string" ? { locale: options.locale } : {}),
        // Its Lightpanda path builds a context without CBrowser, so the env
        // var does not reach it.
        ...(colorScheme ? { colorScheme } : {}),
      });

      // Print formatted report
      const report = formatAgentReadyReport(result);
      console.log(report);

      // Save JSON output if requested
      if (options.output) {
        const fs = await import("fs");
        fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
        console.log(`\n📄 JSON report saved: ${options.output}`);
      }

      // Generate HTML report if requested
      if (options.html) {
        const fs = await import("fs");
        const htmlReport = generateAgentReadyHtmlReport(result);
        const htmlPath = htmlReportPath(options.output, "agent-ready-report.html");
        fs.writeFileSync(htmlPath, htmlReport);
        console.log(`🌐 HTML report saved: ${htmlPath}`);
      }

      // Exit with error if grade is failing
      if (result.grade === "F") {
        process.exit(1);
      }
      break;
    }

    case "ai-benchmark": {
      const urlsOption = options.urls as string;
      if (!urlsOption) {
        console.error("Error: --urls required");
        console.error("Usage: cbrowser ai-benchmark --urls <url1,url2,...> [--output <file>] [--html]");
        process.exit(1);
      }

      const urls = urlsOption.split(",").map(u => u.trim());
      if (urls.length < 2) {
        console.error("Error: At least 2 URLs required for benchmark comparison");
        process.exit(1);
      }

      console.log(`\n🏁 Running AI Readiness Benchmark on ${urls.length} sites...\n`);

      // --device was accepted and dropped (audit F20). The audit can emulate a
      // device but not set a bare size or another engine.
      const benchFlags = browserFlagsOrExit("ai-benchmark", options);
      refuseBrowserFlags("ai-benchmark", benchFlags, {
        viewport: "the agent-ready audit takes a device, not a bare size; use --device",
        browser: "the agent-ready audit runs in Chromium",
      });
      const result = await runAIReadinessBenchmark({
        urls,
        ...(benchFlags.device ? { device: benchFlags.device } : {}),
        headless: options.headless !== false,
        maxConcurrency: options.concurrency ? parseInt(options.concurrency as string) : 3,
      });

      // Print ranking table
      console.log(`╔══════════════════════════════════════════════════════════════════════════════╗`);
      console.log(`║  AI Readiness Benchmark Results                                              ║`);
      console.log(`╠══════════════════════════════════════════════════════════════════════════════╣`);
      console.log(`║  Rank  Site                          Score   Grade   Find  Stab  A11y  Sem  ║`);
      console.log(`╠══════════════════════════════════════════════════════════════════════════════╣`);

      for (const site of result.sites) {
        const rank = result.ranking.find(r => r.site === site.siteName)?.rank || "-";
        const score = site.score !== null ? site.score.toString().padStart(3) : "ERR";
        // A site that could not be scored is a failed run, not a blank row.
        if (site.score === null) process.exitCode = 1;
        const grade = site.grade || "-";
        const find = site.scoreBreakdown?.findability?.toString().padStart(3) || "-";
        const stab = site.scoreBreakdown?.stability?.toString().padStart(3) || "-";
        const a11y = site.scoreBreakdown?.agentPerceivability?.toString().padStart(3) || "-";
        const sem = site.scoreBreakdown?.semantics?.toString().padStart(3) || "-";
        const siteName = site.siteName.substring(0, 32).padEnd(32);
        console.log(`║  ${String(rank).padStart(2)}    ${siteName}  ${score}     ${grade.padEnd(2)}      ${find}   ${stab}   ${a11y}   ${sem}  ║`);
      }

      console.log(`╚══════════════════════════════════════════════════════════════════════════════╝`);
      console.log(`\nDuration: ${result.duration}ms`);

      // Print best-in-class
      if (result.comparison.bestOverall) {
        console.log(`\n🏆 Best Overall: ${result.comparison.bestOverall}`);
      }
      if (result.comparison.bestFindability) {
        console.log(`🔍 Best Findability: ${result.comparison.bestFindability}`);
      }
      if (result.comparison.bestStability) {
        console.log(`🔒 Best Stability: ${result.comparison.bestStability}`);
      }
      if (result.comparison.bestAgentPerceivability) {
        console.log(`♿ Best Accessibility: ${result.comparison.bestAgentPerceivability}`);
      }
      if (result.comparison.bestSemantics) {
        console.log(`📋 Best Semantics: ${result.comparison.bestSemantics}`);
      }

      // Print recommendations
      if (result.recommendations.length > 0) {
        console.log(`\n📝 Recommendations:`);
        for (const rec of result.recommendations.slice(0, 5)) {
          console.log(`  • ${rec}`);
        }
      }

      // Save JSON output if requested
      if (options.output) {
        const fs = await import("fs");
        fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
        console.log(`\n📄 JSON report saved: ${options.output}`);
      }

      // Generate HTML report if requested
      if (options.html) {
        const fs = await import("fs");
        const htmlPath = htmlReportPath(options.output, "ai-benchmark-report.html");

        // Simple HTML table report
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AI Readiness Benchmark Report</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 1200px; margin: 0 auto; padding: 2rem; }
    h1 { color: #333; }
    table { width: 100%; border-collapse: collapse; margin: 2rem 0; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f5f5f5; font-weight: 600; }
    .grade-A { color: #22c55e; font-weight: bold; }
    .grade-B { color: #84cc16; font-weight: bold; }
    .grade-C { color: #eab308; font-weight: bold; }
    .grade-D { color: #f97316; font-weight: bold; }
    .grade-F { color: #ef4444; font-weight: bold; }
    .best { background: #f0fdf4; }
    .timestamp { color: #666; font-size: 0.875rem; }
  </style>
</head>
<body>
  <h1>🏁 AI Readiness Benchmark Report</h1>
  <p class="timestamp">Generated: ${result.timestamp} | Duration: ${result.duration}ms</p>

  <h2>Rankings</h2>
  <table>
    <thead>
      <tr><th>Rank</th><th>Site</th><th>Score</th><th>Grade</th><th>Findability</th><th>Stability</th><th>Accessibility</th><th>Semantics</th></tr>
    </thead>
    <tbody>
      ${result.sites.map(site => {
        const rank = result.ranking.find(r => r.site === site.siteName)?.rank || "-";
        const isBest = result.comparison.bestOverall === site.siteName;
        return `<tr class="${isBest ? 'best' : ''}">
          <td>${rank}</td>
          <td>${site.siteName}</td>
          <td>${site.score ?? 'ERR'}</td>
          <td class="grade-${site.grade || 'F'}">${site.grade || '-'}</td>
          <td>${site.scoreBreakdown?.findability ?? '-'}</td>
          <td>${site.scoreBreakdown?.stability ?? '-'}</td>
          <td>${site.scoreBreakdown?.agentPerceivability ?? '-'}</td>
          <td>${site.scoreBreakdown?.semantics ?? '-'}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>

  <h2>Best in Class</h2>
  <ul>
    ${result.comparison.bestOverall ? `<li>🏆 Overall: <strong>${result.comparison.bestOverall}</strong></li>` : ''}
    ${result.comparison.bestFindability ? `<li>🔍 Findability: <strong>${result.comparison.bestFindability}</strong></li>` : ''}
    ${result.comparison.bestStability ? `<li>🔒 Stability: <strong>${result.comparison.bestStability}</strong></li>` : ''}
    ${result.comparison.bestAgentPerceivability ? `<li>♿ Accessibility: <strong>${result.comparison.bestAgentPerceivability}</strong></li>` : ''}
    ${result.comparison.bestSemantics ? `<li>📋 Semantics: <strong>${result.comparison.bestSemantics}</strong></li>` : ''}
  </ul>

  ${result.recommendations.length > 0 ? `
  <h2>Recommendations</h2>
  <ul>
    ${result.recommendations.map(r => `<li>${r}</li>`).join('')}
  </ul>
  ` : ''}

  <footer style="margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #ddd; color: #666; font-size: 0.875rem;">
    Generated by <a href="https://cbrowser.ai">CBrowser</a> v${(await import("../../version.js")).VERSION}
  </footer>
</body>
</html>`;

        fs.writeFileSync(htmlPath, html);
        console.log(`🌐 HTML report saved: ${htmlPath}`);
      }

      break;
    }

    case "webmcp-ready": {
      const url = args[0];
      if (!url) {
        console.error("Error: URL required");
        console.error("Usage: cbrowser webmcp-ready <url> [--api-key <key>] [--timeout <ms>] [--html] [--output <file>]");
        process.exit(1);
      }

      console.log(`\n🔍 Running WebMCP Readiness Audit on ${url}...\n`);

      const result = await runWebMCPReadyAudit(url, {
        apiKey: options["api-key"] as string,
        oauthToken: options["oauth-token"] as string,
        timeout: timeoutOption(options.timeout, 30000),
      });

      // Print formatted summary
      console.log(`╔══════════════════════════════════════════════════════════════╗`);
      console.log(`║  WebMCP Readiness Audit Results                              ║`);
      console.log(`╠══════════════════════════════════════════════════════════════╣`);
      console.log(`║  URL: ${result.url.padEnd(54)}║`);
      console.log(`║  Score: ${result.score}/100  Grade: ${result.grade.padEnd(42)}║`);
      console.log(`║  Checks: ${result.summary.passedChecks}/${result.summary.totalChecks} passed  Duration: ${result.duration}ms${' '.repeat(Math.max(0, 24 - result.duration.toString().length))}║`);
      console.log(`╚══════════════════════════════════════════════════════════════╝`);

      console.log(`\n📊 Tier Scores:`);
      for (const tier of result.tiers) {
        const bar = '█'.repeat(Math.round(tier.score / 10)) + '░'.repeat(10 - Math.round(tier.score / 10));
        console.log(`  ${tier.tier}. ${tier.name.padEnd(22)} ${bar} ${tier.score}%`);
      }

      if (result.issues.length > 0) {
        console.log(`\n⚠️  Issues Found (${result.issues.length}):`);
        for (const issue of result.issues.slice(0, 5)) {
          const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'high' ? '🟠' : '🟡';
          console.log(`  ${icon} [Tier ${issue.tier}] ${issue.issue}`);
        }
        if (result.issues.length > 5) {
          console.log(`  ... and ${result.issues.length - 5} more issues`);
        }
      }

      if (result.recommendations.length > 0) {
        console.log(`\n💡 Top Recommendations:`);
        for (const rec of result.recommendations.slice(0, 3)) {
          console.log(`  • ${rec}`);
        }
      }

      // Save JSON output if requested
      if (options.output) {
        const fs = await import("fs");
        fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
        console.log(`\n📄 JSON report saved: ${options.output}`);
      }

      // Generate HTML report if requested
      if (options.html) {
        const fs = await import("fs");
        const htmlPath = htmlReportPath(options.output, "webmcp-ready-report.html");
        const htmlReport = generateWebMCPReadyHtmlReport(result);
        fs.writeFileSync(htmlPath, htmlReport);
        console.log(`🌐 HTML report saved: ${htmlPath}`);
      }

      // Exit with error if grade is failing
      if (result.grade === "F") {
        process.exit(1);
      }
      break;
    }

    case "competitive-benchmark": {
      const sitesArg = options.sites as string;
      const goal = options.goal as string;

      if (!sitesArg) {
        console.error("Error: --sites required (comma-separated URLs)");
        console.error("Usage: cbrowser competitive-benchmark --sites <urls> --goal <goal> [--persona <name>] [--html]");
        process.exit(1);
      }

      if (!goal) {
        console.error("Error: --goal required");
        console.error("Usage: cbrowser competitive-benchmark --sites <urls> --goal <goal> [--persona <name>] [--html]");
        process.exit(1);
      }

      // 20.0.0: no keyless mode (its goal verdicts were not accurate).
      if (!isApiKeyConfigured()) {
        console.error("Error: competitive-benchmark needs an Anthropic API key (cbrowser config set-api-key <key>). The keyless heuristic mode was removed in 20.0.0 because its goal verdicts were not accurate.");
        process.exit(1);
      }
      const sites = sitesArg.split(",").map((s) => ({ url: s.trim() }));
      const personaName = (options.persona as string) || "first-timer";
      const maxSteps = options["max-steps"] ? parseInt(options["max-steps"] as string) : 30;
      const maxTime = options["max-time"] ? parseInt(options["max-time"] as string) : 180;

      console.log(`\n🏆 Running Competitive UX Benchmark...\n`);
      console.log(`   Sites: ${sites.map((s) => s.url).join(", ")}`);
      console.log(`   Goal: ${goal}`);
      console.log(`   Persona: ${personaName}\n`);

      // --device and --viewport were accepted and dropped (audit F20).
      const journeyFlags = browserFlagsOrExit("competitive-benchmark", options);
      refuseBrowserFlags("competitive-benchmark", journeyFlags, {
        browser: "cognitive journeys run in Chromium",
      });
      const result = await runCompetitiveBenchmark({
        sites,
        goal,
        persona: personaName,
        maxSteps,
        maxTime,
        headless,
        ...(journeyFlags.device ? { device: journeyFlags.device } : {}),
        ...(journeyFlags.viewport ? { viewport: journeyFlags.viewport } : {}),
      });

      // Print formatted report
      const report = formatCompetitiveBenchmarkReport(result);
      console.log(report);

      // Save JSON output if requested
      if (options.output) {
        const fs = await import("fs");
        fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
        console.log(`\n📄 JSON report saved: ${options.output}`);
      }

      // Generate HTML report if requested
      if (options.html) {
        const fs = await import("fs");
        const htmlReport = generateCompetitiveBenchmarkHtmlReport(result);
        const htmlPath = htmlReportPath(options.output, "competitive-benchmark-report.html");
        fs.writeFileSync(htmlPath, htmlReport);
        console.log(`🌐 HTML report saved: ${htmlPath}`);
      }
      break;
    }

    case "empathy-audit": {
      const url = args[0];
      const goal = options.goal as string;
      // --personas is what the help and its examples say; --disabilities is the
      // older name. Before 2026-10-21 only --disabilities was read, so the
      // documented form silently ran every accessibility persona.
      const disabilitiesArg = (typeof options.personas === "string" ? options.personas : options.disabilities) as string;

      if (!url) {
        console.error("Error: URL required");
        console.error("Usage: cbrowser empathy-audit <url> [--goal <goal>] [--personas <list>] [--device <name>] [--html]");
        process.exit(1);
      }

      // --goal is optional, as it is over MCP: without one the audit checks
      // the page rather than a task (it was required here only).

      // Parse disabilities or use all
      const allAccessibilityNames = listAccessibilityPersonas();

      // The shared alias table (personas.ts), as MCP uses. This command had its
      // own stale copy, so --disabilities autism failed here and worked there.
      const aliasMap = PERSONA_ALIASES;

      const disabilityNames = disabilitiesArg
        ? disabilitiesArg.split(",").map((d) => {
            const trimmed = d.trim().toLowerCase();
            return aliasMap[trimmed] || trimmed;
          })
        : allAccessibilityNames;

      // Validate disability names
      const invalidNames = disabilityNames.filter((d) => !allAccessibilityNames.includes(d));
      if (invalidNames.length > 0) {
        console.error(`Error: Unknown disability persona(s): ${invalidNames.join(", ")}`);
        console.error(`Available: ${allAccessibilityNames.join(", ")}`);
        console.error(`Aliases: ${Object.keys(aliasMap).filter((a) => allAccessibilityNames.includes(aliasMap[a]) && a !== aliasMap[a]).join(", ")}`);
        process.exit(1);
      }

      const wcagLevel = (options["wcag-level"] as string) || "AA";
      const maxSteps = options["max-steps"] ? parseInt(options["max-steps"] as string) : 20;
      const maxTime = options["max-time"] ? parseInt(options["max-time"] as string) : 120;

      console.log(`\n♿ Running Accessibility Empathy Audit...\n`);
      console.log(`   URL: ${url}`);
      console.log(`   Goal: ${goal}`);
      console.log(`   Disabilities: ${disabilityNames.join(", ")}`);
      console.log(`   WCAG Level: ${wcagLevel}\n`);

      const scope = options.scope === undefined ? undefined : String(options.scope);
      if (scope !== undefined && scope !== "viewport" && scope !== "full_page") {
        console.error(`Error: --scope must be viewport or full_page, got: ${scope}`);
        process.exit(1);
      }
      const result = await runEmpathyAudit(url, {
        ...(goal ? { goal } : {}),
        disabilities: disabilityNames,
        wcagLevel: wcagLevel as "A" | "AA" | "AAA",
        maxSteps,
        maxTime,
        headless,
        // Accepted by the engine and dropped here until 20.0 (the MCP tool
        // passed it), so a mobile empathy audit from the CLI was a desktop one.
        ...(typeof options.device === "string" ? { device: resolveDevicePreset(options.device) } : {}),
        ...(scope ? { scope: scope as "viewport" | "full_page" } : {}),
      });

      // Print formatted report
      const report = formatEmpathyAuditReport(result);
      console.log(report);

      // Save JSON output if requested
      if (options.output) {
        const fs = await import("fs");
        fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
        console.log(`\n📄 JSON report saved: ${options.output}`);
      }

      // Generate HTML report if requested
      if (options.html) {
        const fs = await import("fs");
        const htmlReport = generateEmpathyAuditHtmlReport(result);
        const htmlPath = htmlReportPath(options.output, "empathy-audit-report.html");
        fs.writeFileSync(htmlPath, htmlReport);
        console.log(`🌐 HTML report saved: ${htmlPath}`);
      }

      // Exit with error if overall score is poor
      if (result.overallScore < 50) {
        process.exit(1);
      }
      break;
    }

    default:
      return false;
  }
  return true;
}
