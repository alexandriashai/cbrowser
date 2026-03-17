/**
 * CBrowser MCP Tools - Analysis Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import { findElementByIntent, runAIReadinessBenchmark } from "../../analysis/index.js";

/**
 * Register analysis tools (4 tools: analyze_page, generate_tests, find_element_by_intent, ai_benchmark)
 */
export function registerAnalysisTools(
  server: McpServer,
  { getBrowser }: ToolRegistrationContext
): void {
  server.tool(
    "analyze_page",
    "Analyze page structure for forms, buttons, links",
    {},
    async () => {
      const b = await getBrowser();
      const analysis = await b.analyzePage();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              title: analysis.title,
              forms: analysis.forms.length,
              buttons: analysis.buttons.length,
              links: analysis.links.length,
              hasLogin: analysis.hasLogin,
              hasSearch: analysis.hasSearch,
              hasNavigation: analysis.hasNavigation,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "generate_tests",
    "Generate test scenarios for a page",
    {
      url: z.string().url().optional().describe("URL to analyze (uses current page if not provided)"),
    },
    async ({ url }) => {
      const b = await getBrowser();
      const result = await b.generateTests(url);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              testsGenerated: result.tests.length,
              tests: result.tests.map(t => ({
                name: t.name,
                description: t.description,
                steps: t.steps.length,
              })),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "find_element_by_intent",
    "AI-powered semantic element finding with ARIA-first selector strategy. Prioritizes aria-label > role > semantic HTML > ID > name > class. Returns selectorType, accessibilityScore (0-1), and alternatives. Use verbose=true for enriched failure responses.",
    {
      intent: z.string().describe("Natural language description like 'the cheapest product' or 'login form'"),
      verbose: z.boolean().optional().describe("Include alternative matches with confidence scores and AI suggestions"),
    },
    async ({ intent, verbose }) => {
      const b = await getBrowser();
      const result = await findElementByIntent(b, intent, { verbose });
      if (result && result.confidence > 0) {
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result || { found: false, message: "No matching element found" }, null, 2) }],
      };
    }
  );

  server.tool(
    "ai_benchmark",
    "Compare AI-friendliness across competitor sites. Runs agent-ready audits on each URL, ranks by AI readiness grade, and identifies what each competitor does better for AI agents. Use for competitive intelligence on AI-readiness.",
    {
      urls: z.array(z.string().url()).describe("Array of competitor URLs to benchmark"),
      goal: z.string().optional().describe("Optional goal for context (e.g., 'complete checkout')"),
    },
    async ({ urls, goal }) => {
      const result = await runAIReadinessBenchmark({
        urls,
        goal,
        headless: true,
        maxConcurrency: 3,
      });

      // Calculate audit success/failure counts for summary
      const successCount = result.sites.filter((s) => s.auditStatus === "complete").length;
      const failedCount = result.sites.filter((s) => s.auditStatus === "failed").length;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                timestamp: result.timestamp,
                duration: `${(result.duration / 1000).toFixed(1)}s`,
                sitesAnalyzed: result.sites.length,
                sitesSucceeded: successCount,
                sitesFailed: failedCount,
                ranking: result.ranking.map((r) => ({
                  rank: r.rank,
                  site: r.site,
                  grade: r.grade,
                  score: r.score,
                  auditStatus: r.auditStatus,
                })),
                comparison: {
                  bestOverall: result.comparison.bestOverall,
                  bestFindability: result.comparison.bestFindability,
                  bestStability: result.comparison.bestStability,
                  bestAccessibility: result.comparison.bestAccessibility,
                  bestSemantics: result.comparison.bestSemantics,
                  commonIssues: result.comparison.commonIssues.slice(0, 3),
                },
                siteAdvantages: result.comparison.siteAdvantages,
                topRecommendations: result.recommendations
                  .slice(0, 10)
                  .map((r) => ({
                    site: r.site,
                    priority: r.priority,
                    improvement: r.improvement,
                    competitorReference: r.competitorReference,
                  })),
                detailedResults: result.sites.map((s) => ({
                  site: s.siteName,
                  grade: s.grade,
                  score: s.score,
                  strengths: s.strengths,
                  weaknesses: s.weaknesses,
                  topIssues: s.topIssues,
                  // Include failure details for transparency (v18.22.0)
                  auditStatus: s.auditStatus,
                  ...(s.auditStatus === "failed" && {
                    failureCategory: s.failureCategory,
                    failureDetails: s.failureDetails,
                    suggestion: s.suggestion,
                    retryAttempts: s.retryAttempts,
                  }),
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
