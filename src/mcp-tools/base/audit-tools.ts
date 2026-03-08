/**
 * CBrowser MCP Tools - Audit Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer } from "../types.js";
import {
  runAgentReadyAudit,
  runCompetitiveBenchmark,
  runEmpathyAudit,
  runWebMCPReadyAudit,
} from "../../analysis/index.js";
import { listAccessibilityPersonas } from "../../personas.js";

/**
 * Register audit tools (4 tools: agent_ready_audit, competitive_benchmark, empathy_audit, webmcp_ready_audit)
 */
export function registerAuditTools(server: McpServer): void {
  server.tool(
    "agent_ready_audit",
    "Audit a website for AI-agent friendliness. Analyzes findability, stability, accessibility, and semantics. Returns score (0-100), grade (A-F), issues, and remediation recommendations.",
    {
      url: z.string().url().describe("URL to audit"),
    },
    async ({ url }) => {
      const result = await runAgentReadyAudit(url, { headless: true });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              url: result.url,
              score: result.score,
              grade: result.grade,
              summary: result.summary,
              topIssues: result.issues.slice(0, 5),
              topRecommendations: result.recommendations.slice(0, 5),
              duration: result.duration,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "competitive_benchmark",
    "Compare UX across competitor sites. Runs identical cognitive journeys on multiple sites and generates head-to-head comparison with rankings, friction analysis, and recommendations.",
    {
      sites: z.array(z.string().url()).describe("Array of URLs to compare"),
      goal: z.string().describe("Task goal (e.g., 'sign up for free trial')"),
      persona: z.string().optional().default("first-timer").describe("Persona to use"),
      maxSteps: z.number().optional().default(30).describe("Max steps per site"),
      maxTime: z.number().optional().default(180).describe("Max time per site in seconds"),
    },
    async ({ sites, goal, persona, maxSteps, maxTime }) => {
      const result = await runCompetitiveBenchmark({
        sites: sites.map((url) => ({ url })),
        goal,
        persona,
        maxSteps,
        maxTime,
        headless: true,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              goal: result.goal,
              persona: result.persona,
              ranking: result.ranking,
              comparison: result.comparison,
              recommendations: result.recommendations.slice(0, 5),
              duration: result.duration,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "empathy_audit",
    "Simulate how people with disabilities experience a site. Tests ONE persona per call to avoid timeout. Call multiple times with different disabilities for full coverage. Available: motor-impairment-tremor, low-vision-magnified, cognitive-adhd, dyslexic-user, deaf-user, elderly-low-vision, color-blind-deuteranopia.",
    {
      url: z.string().url().describe("URL to audit"),
      goal: z.string().describe("Task goal (e.g., 'complete checkout')"),
      disabilities: z.array(z.string()).optional().describe("Disability persona to test. Pass ONE for reliable results. If multiple passed, only first is used."),
      wcagLevel: z.enum(["A", "AA", "AAA"]).optional().default("AA").describe("WCAG conformance level"),
      maxSteps: z.number().optional().default(20).describe("Max steps per persona"),
      maxTime: z.number().optional().default(120).describe("Max time per persona in seconds"),
    },
    async ({ url, goal, disabilities, wcagLevel, maxSteps, maxTime }) => {
      try {
        // Auto-limit to 1 persona to avoid MCP client timeout on Claude.ai (~60s limit)
        const allPersonas = listAccessibilityPersonas();
        const requestedList = disabilities || allPersonas;
        const wasLimited = requestedList.length > 1;
        const singlePersona = [requestedList[0]];

        const result = await runEmpathyAudit(url, {
          goal,
          disabilities: singlePersona,
          wcagLevel,
          maxSteps,
          maxTime,
          headless: true,
        });
        // Build response with guidance for additional personas
        const testedPersona = singlePersona[0];
        const remainingPersonas = allPersonas.filter(p => p !== testedPersona);

        const response: Record<string, unknown> = {
          url: result.url,
          goal: result.goal,
          testedPersona,
          overallScore: result.overallScore,
          resultsSummary: result.results.map((r) => {
            const uniqueTypes = new Set(r.barriers.map(b => b.type));
            return {
              persona: r.persona,
              disabilityType: r.disabilityType,
              goalAchieved: r.goalAchieved,
              empathyScore: r.empathyScore,
              barrierTypeCount: uniqueTypes.size,
              barrierTypes: Array.from(uniqueTypes),
              affectedElements: r.barriers.length,
              wcagViolationCount: r.wcagViolations.length,
            };
          }),
          allWcagViolations: result.allWcagViolations,
          topBarriers: result.topBarriers.slice(0, 5),
          topRemediation: result.combinedRemediation.slice(0, 5),
          duration: result.duration,
        };

        // Add guidance if we limited the request
        if (wasLimited) {
          response.note = `Limited to 1 persona to avoid timeout. For full coverage, call again with: ${remainingPersonas.slice(0, 3).join(", ")}${remainingPersonas.length > 3 ? `, and ${remainingPersonas.length - 3} more` : ""}`;
          response.remainingPersonas = remainingPersonas;
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (error) {
        // Categorize the error for better user feedback
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        // Determine error type for actionable feedback
        let errorType = "unknown";
        let suggestion = "Please try again or contact support if the issue persists.";

        if (errorMessage.includes("timeout") || errorMessage.includes("Timeout")) {
          errorType = "timeout";
          suggestion = "The page took too long to load. Try increasing maxTime or testing a faster page.";
        } else if (errorMessage.includes("net::") || errorMessage.includes("DNS") || errorMessage.includes("ERR_")) {
          errorType = "network";
          suggestion = "Unable to reach the URL. Check the URL is valid and accessible.";
        } else if (errorMessage.includes("blocked") || errorMessage.includes("403") || errorMessage.includes("captcha")) {
          errorType = "bot-detection";
          suggestion = "The site may be blocking automation. Try with a different URL.";
        } else if (errorMessage.includes("chromium") || errorMessage.includes("browser")) {
          errorType = "browser";
          suggestion = "Browser automation error. The server may need to restart.";
        }

        // Log the full error for debugging
        console.error(`[empathy_audit] Error: ${errorMessage}`);
        if (errorStack) {
          console.error(`[empathy_audit] Stack: ${errorStack}`);
        }

        // Return a structured error response
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                errorType,
                message: errorMessage,
                suggestion,
                url,
                goal,
                disabilities: disabilities || "all",
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "webmcp_ready_audit",
    "Audit an MCP server for Claude in Chrome / WebMCP compatibility. Uses 6-tier evaluation: Server Implementation (25%), Tool Discoverability (20%), Instrumentation (15%), Consistency (15%), Agent Optimizations (15%), Documentation (10%). Returns score (0-100), grade (A-F), tier breakdown, issues, and recommendations.",
    {
      url: z.string().url().describe("MCP server URL to audit (e.g., https://demo.cbrowser.ai/mcp)"),
      apiKey: z.string().optional().describe("API key if server requires authentication"),
      oauthToken: z.string().optional().describe("OAuth token if server uses OAuth"),
      timeout: z.number().optional().default(30000).describe("Timeout in ms (default: 30000)"),
    },
    async ({ url, apiKey, oauthToken, timeout }) => {
      const result = await runWebMCPReadyAudit(url, {
        apiKey,
        oauthToken,
        timeout,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              url: result.url,
              score: result.score,
              grade: result.grade,
              summary: result.summary,
              tierScores: result.tiers.map((t) => ({
                tier: t.tier,
                name: t.name,
                score: t.score,
                weight: `${Math.round(t.weight * 100)}%`,
              })),
              topIssues: result.issues.slice(0, 5),
              topRecommendations: result.recommendations.slice(0, 5),
              duration: result.duration,
            }, null, 2),
          },
        ],
      };
    }
  );
}
