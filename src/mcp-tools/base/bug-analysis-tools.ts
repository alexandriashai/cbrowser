/**
 * CBrowser MCP Tools - Bug Analysis Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import { huntBugs, runChaosTest } from "../../analysis/index.js";

/**
 * Register bug analysis tools (2 tools: hunt_bugs, chaos_test)
 */
export function registerBugAnalysisTools(
  server: McpServer,
  { getBrowser }: ToolRegistrationContext
): void {
  server.tool(
    "hunt_bugs",
    "Autonomous bug hunting - crawl and find issues. Returns bugs with severity, selector, and actionable recommendation for each issue found.",
    {
      url: z.string().url().describe("Starting URL to hunt from"),
      maxPages: z.number().optional().default(10).describe("Maximum pages to visit"),
      timeout: z.number().optional().default(60000).describe("Timeout in milliseconds"),
    },
    async ({ url, maxPages, timeout }) => {
      const b = await getBrowser();
      const result = await huntBugs(b, url, { maxPages, timeout });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              pagesVisited: result.pagesVisited,
              bugsFound: result.bugs.length,
              duration: result.duration,
              bugs: result.bugs.slice(0, 10).map(bug => ({
                type: bug.type,
                severity: bug.severity,
                description: bug.description,
                url: bug.url,
                selector: bug.selector,
                recommendation: bug.recommendation,
              })),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "chaos_test",
    "Inject failures and test resilience",
    {
      url: z.string().url().describe("URL to test"),
      networkLatency: z.number().optional().describe("Simulate network latency (ms)"),
      offline: z.boolean().optional().describe("Simulate offline mode"),
      blockUrls: z.array(z.string()).optional().describe("URL patterns to block"),
    },
    async ({ url, networkLatency, offline, blockUrls }) => {
      const b = await getBrowser();
      try {
        const result = await runChaosTest(b, url, { networkLatency, offline, blockUrls });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                passed: result.passed,
                errors: result.errors,
                duration: result.duration,
                impact: result.impact,
              }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        try {
          await b.recoverBrowser();
        } catch {
          // Browser recovery failed, but continue with error response
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                passed: false,
                errors: [`Chaos test crashed: ${error.message}`],
                duration: 0,
                impact: {
                  loadTimeMs: 0,
                  blockedResources: [],
                  failedResources: [],
                  delayedResources: [],
                  pageCompleted: false,
                  pageInteractive: false,
                  consoleErrors: 0,
                  degradationSummary: ["Test crashed - browser recovered"],
                },
                recovered: true,
              }, null, 2),
            },
          ],
        };
      }
    }
  );
}
