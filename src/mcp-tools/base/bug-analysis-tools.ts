/**
 * CBrowser MCP Tools - Bug Analysis Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import { refuseHostedUrl } from "../hosted-inputs.js";
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
      // Hosted: http(s) only (sec-paths, 2026-10-10; see hosted-inputs.ts).
      const hostedRefusal = refuseHostedUrl("hunt_bugs", { url });
      if (hostedRefusal) return hostedRefusal;
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
      // The CLI's --fail-api pattern:status, which this tool did not take.
      // (audit M22, 2026-10-21)
      failApis: z.array(z.object({
        pattern: z.string().describe("Substring of the request URL to fail, e.g. '/api/checkout'"),
        status: z.number().int().min(100).max(599).describe("HTTP status to answer with, e.g. 500 or 503"),
        body: z.string().optional().describe("Response body (default 'Chaos: Simulated failure')"),
      })).optional().describe("Requests to answer with an error status instead of the real response (the CLI's --fail-api pattern:status)"),
    },
    annotations: {
      title: "Chaos Engineering Test",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ url, networkLatency, offline, blockUrls, failApis }) => {
      // Hosted: http(s) only (sec-paths, 2026-10-10; see hosted-inputs.ts).
      const hostedRefusal = refuseHostedUrl("chaos_test", { url });
      if (hostedRefusal) return hostedRefusal;
      const b = await getBrowser();
      try {
        const result = await runChaosTest(b, url, { networkLatency, offline, blockUrls, ...(failApis?.length ? { failApis } : {}) });
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
