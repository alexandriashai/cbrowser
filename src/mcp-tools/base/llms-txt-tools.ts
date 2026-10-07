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
  server.registerTool("llms_txt_validate", {
    title: "Validate llms.txt",
    description: "Validate an llms.txt file for format compliance and link validity. Checks for proper markdown structure, valid URLs, and optionally verifies links are reachable. Use to ensure llms.txt files follow the specification.",
    inputSchema: {
      content: z.string().optional().describe("llms.txt content to validate (provide either content or url)"),
      url: z.string().url().optional().describe("URL to fetch llms.txt from (appends /llms.txt if needed)"),
      validateLinks: z.boolean().optional().default(true).describe("Whether to check if links are reachable"),
      maxLinksToValidate: z.number().optional().default(20).describe("Max links to validate (for performance)"),
    },
    annotations: {
      title: "Validate llms.txt",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ content, url, validateLinks, maxLinksToValidate }) => {
      if (!content && !url) {
        return {
          isError: true,
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

  server.registerTool("llms_txt_diff", {
    title: "Diff llms.txt",
    description: "Compare a site's current structure against its existing llms.txt file. Detects pages that have been added, removed, or changed. Use to keep llms.txt up to date as your site evolves.",
    inputSchema: {
      url: z.string().url().describe("Site URL to analyze"),
      existingContent: z.string().optional().describe("Existing llms.txt content (if not provided, fetches from site/llms.txt)"),
      crawl: z.boolean().optional().default(false).describe("Whether to crawl linked pages for comprehensive diff"),
      maxPages: z.number().optional().default(10).describe("Max pages to crawl if crawl is true"),
    },
    annotations: {
      title: "Diff llms.txt",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ url, existingContent, crawl, maxPages }) => {
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
                // This field used to contain the sentence "See suggestedUpdate
                // field for updated llms.txt content" — pointing at itself, so
                // the one thing a caller runs this tool to GET was the one thing
                // it never returned. (llms_txt_generate returns real content, so
                // the omission was specific to diff.) The content is returned
                // now, with an explicit marker if it had to be trimmed, because
                // a truncation a caller cannot see is the same defect wearing a
                // different hat. (2026-07-29)
                suggestedUpdate: result.suggestedUpdate
                  ? (result.suggestedUpdate.length > 60_000
                      ? result.suggestedUpdate.slice(0, 60_000) +
                        `\n\n<!-- truncated: ${result.suggestedUpdate.length - 60_000} more characters. Run llms_txt_generate for the full document. -->`
                      : result.suggestedUpdate)
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
