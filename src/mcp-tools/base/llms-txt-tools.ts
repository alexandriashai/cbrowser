/**
 * CBrowser MCP Tools - llms.txt Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import {
  validateLlmsTxt,
  validateLlmsTxtFromUrl,
  diffLlmsTxt,
  diffLlmsTxtFromUrl,
} from "../../llms-txt/index.js";

/**
 * Register llms.txt tools (2 tools: llms_txt_validate, llms_txt_diff)
 */
export function registerLlmsTxtTools(
  server: McpServer,
  _context: ToolRegistrationContext
): void {
  server.tool(
    "llms_txt_validate",
    "Validate an llms.txt file for format compliance and link validity. Checks for proper markdown structure, valid URLs, and optionally verifies links are reachable. Use to ensure llms.txt files follow the specification.",
    {
      content: z.string().optional().describe("llms.txt content to validate (provide either content or url)"),
      url: z.string().url().optional().describe("URL to fetch llms.txt from (appends /llms.txt if needed)"),
      validateLinks: z.boolean().optional().default(true).describe("Whether to check if links are reachable"),
      maxLinksToValidate: z.number().optional().default(20).describe("Max links to validate (for performance)"),
    },
    async ({ content, url, validateLinks, maxLinksToValidate }) => {
      if (!content && !url) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Either content or url must be provided",
              }, null, 2),
            },
          ],
        };
      }

      const result = content
        ? await validateLlmsTxt(content, { validateLinks, maxLinksToValidate })
        : await validateLlmsTxtFromUrl(url!, { validateLinks, maxLinksToValidate });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                valid: result.valid,
                title: result.title,
                sectionCount: result.sectionCount,
                linkCount: result.linkCount,
                linksValidated: result.linksValidated,
                brokenLinks: result.brokenLinks,
                summary: result.summary,
                issues: result.issues.map((i) => ({
                  line: i.line,
                  severity: i.severity,
                  type: i.type,
                  message: i.message,
                  content: i.content,
                })),
                recommendation: result.valid
                  ? "llms.txt is valid and ready for use"
                  : `Fix ${result.summary.errors} error(s) before deploying`,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "llms_txt_diff",
    "Compare a site's current structure against its existing llms.txt file. Detects pages that have been added, removed, or changed. Use to keep llms.txt up to date as your site evolves.",
    {
      url: z.string().url().describe("Site URL to analyze"),
      existingContent: z.string().optional().describe("Existing llms.txt content (if not provided, fetches from site/llms.txt)"),
      crawl: z.boolean().optional().default(false).describe("Whether to crawl linked pages for comprehensive diff"),
      maxPages: z.number().optional().default(10).describe("Max pages to crawl if crawl is true"),
    },
    async ({ url, existingContent, crawl, maxPages }) => {
      const result = existingContent
        ? await diffLlmsTxt(url, {
            existingContent,
            crawl,
            maxPages,
            headless: true,
          })
        : await diffLlmsTxtFromUrl(url, {
            crawl,
            maxPages,
            headless: true,
          });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                url: result.url,
                timestamp: result.timestamp,
                upToDate: result.upToDate,
                summary: result.summary,
                additions: result.additions.map((a) => ({
                  type: a.type,
                  title: a.title,
                  url: a.url,
                  action: a.action,
                })),
                removals: result.removals.map((r) => ({
                  type: r.type,
                  title: r.title,
                  url: r.url,
                  action: r.action,
                })),
                changes: result.changes.map((c) => ({
                  type: c.type,
                  title: c.title,
                  url: c.url,
                  changes: c.changes,
                  action: c.action,
                })),
                recommendation: result.upToDate
                  ? "llms.txt is up to date with site structure"
                  : `Update llms.txt: ${result.summary.additions} additions, ${result.summary.removals} removals, ${result.summary.changes} changes`,
                suggestedUpdate: result.suggestedUpdate
                  ? "See suggestedUpdate field for updated llms.txt content"
                  : undefined,
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
