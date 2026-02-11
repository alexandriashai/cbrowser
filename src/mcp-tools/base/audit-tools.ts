/**
 * CBrowser MCP Tools - Audit Tools
 *
 * @copyright 2026 WF Media (Alexandria Eden) alexandria.shai.eden@gmail.com
 * @license BSL-1.1 (Business Source License 1.1)
 */

import { z } from "zod";
import type { McpServer } from "../types.js";
import {
  runAgentReadyAudit,
  runCompetitiveBenchmark,
  runEmpathyAudit,
} from "../../analysis/index.js";
import { listAccessibilityPersonas } from "../../personas.js";

/**
 * Register audit tools (3 tools: agent_ready_audit, competitive_benchmark, empathy_audit)
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
    "Simulate how people with disabilities experience a site. Tests motor impairments, cognitive differences, and sensory limitations. Returns barriers, WCAG violations, and remediation suggestions.",
    {
      url: z.string().url().describe("URL to audit"),
      goal: z.string().describe("Task goal (e.g., 'complete checkout')"),
      disabilities: z.array(z.string()).optional().describe("Disability personas to test. Available: motor-impairment-tremor, low-vision-magnified, cognitive-adhd, dyslexic-user, deaf-user, elderly-low-vision, color-blind-deuteranopia"),
      wcagLevel: z.enum(["A", "AA", "AAA"]).optional().default("AA").describe("WCAG conformance level"),
      maxSteps: z.number().optional().default(20).describe("Max steps per persona"),
      maxTime: z.number().optional().default(120).describe("Max time per persona in seconds"),
    },
    async ({ url, goal, disabilities, wcagLevel, maxSteps, maxTime }) => {
      const disabilityList = disabilities || listAccessibilityPersonas();
      const result = await runEmpathyAudit(url, {
        goal,
        disabilities: disabilityList,
        wcagLevel,
        maxSteps,
        maxTime,
        headless: true,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              url: result.url,
              goal: result.goal,
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
            }, null, 2),
          },
        ],
      };
    }
  );
}
