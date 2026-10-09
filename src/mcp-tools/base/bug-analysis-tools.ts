/**
 * CBrowser MCP Tools - Bug Analysis Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import { huntBugs, huntBugsResponse, runChaosTest } from "../../analysis/index.js";

/**
 * Register bug analysis tools (2 tools: hunt_bugs, chaos_test)
 */
export function registerBugAnalysisTools(
  server: McpServer,
  { getBrowser }: ToolRegistrationContext
): void {
  server.registerTool("hunt_bugs", {
    _meta: { ui: { resourceUri: "ui://cbrowser/bugs" } },
    title: "Hunt Bugs",
    description: "Autonomous bug hunting - crawl and find issues. Returns bugs with severity, selector, and actionable recommendation for each issue found.",
    inputSchema: {
      url: z.string().url().describe("Starting URL to hunt from"),
      maxPages: z.number().optional().default(10).describe("Maximum pages to visit"),
      limit: z.number().optional().default(25).describe("How many bugs to return, worst first. The full count and a per-page/per-type breakdown are always reported, so a truncated list never hides the shape of what was found."),
      offset: z.number().optional().default(0).describe("Skip this many bugs before returning, for paging through a large result."),
      timeout: z.number().optional().default(60000).describe("Timeout in milliseconds"),
    },
    annotations: {
      title: "Hunt Bugs",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ url, maxPages, timeout, limit, offset }) => {
      const b = await getBrowser();
      const result = await huntBugs(b, url, { maxPages, timeout });
      // Grouping, worst-first paging, breakdowns and the visited-page list
      // live in huntBugsResponse, shared with the stdio server.
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(huntBugsResponse(result, { limit, offset }), null, 2),
          },
        ],
      };
    }
  );

  server.registerTool("chaos_test", {
    title: "Chaos Engineering Test",
    description: "Inject failures and test resilience",
    inputSchema: {
      url: z.string().url().describe("URL to test"),
      networkLatency: z.number().optional().describe("Simulate network latency (ms)"),
      offline: z.boolean().optional().describe("Simulate offline mode"),
      blockUrls: z.array(z.string()).optional().describe("URL patterns to block"),
    },
    annotations: {
      title: "Chaos Engineering Test",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ url, networkLatency, offline, blockUrls }) => {
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
