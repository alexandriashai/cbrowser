/**
 * CBrowser MCP Tools - Remediation Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import {
  generateRemediationPatches,
  summarizePatches,
  generateLlmsTxt,
  crawlSiteForLlmsTxt,
  suggestStructuredData,
} from "../../remediation/index.js";
import { runAgentReadyAudit } from "../../analysis/index.js";

/**
 * Register remediation tools (3 tools: remediation_patches, llms_txt_generate, structured_data_suggest)
 */
export function registerRemediationTools(
  server: McpServer,
  _context: ToolRegistrationContext
): void {
  server.tool(
    "remediation_patches",
    "Generate code patches to fix agent-ready audit issues. Returns before/after code snippets with explanations, sorted by impact. Run agent_ready_audit first to get issues.",
    {
      url: z.string().url().describe("URL to audit and generate patches for"),
      maxPatches: z.number().optional().default(10).describe("Maximum number of patches to return"),
    },
    async ({ url, maxPatches }) => {
      // Run audit first
      const auditResult = await runAgentReadyAudit(url, { headless: true });

      // Generate patches
      const patches = generateRemediationPatches(auditResult);
      const summary = summarizePatches(patches);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                url,
                auditGrade: auditResult.grade,
                auditScore: auditResult.score.overall,
                summary: {
                  totalPatches: summary.total,
                  quickWins: summary.quickWins,
                  byImpact: summary.byImpact,
                  byEffort: summary.byEffort,
                },
                patches: patches.slice(0, maxPatches).map((p) => ({
                  category: p.category,
                  description: p.description,
                  effort: p.effort,
                  impact: p.impact,
                  before: p.before,
                  after: p.after,
                  explanation: p.explanation,
                })),
                note: patches.length > maxPatches
                  ? `Showing ${maxPatches} of ${patches.length} patches. Use maxPatches parameter for more.`
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

  server.tool(
    "llms_txt_generate",
    "Generate an llms.txt file from a website. Extracts title, description, and navigation structure in the llms.txt format for AI-readable site descriptions.",
    {
      url: z.string().url().describe("URL to analyze"),
      crawl: z.boolean().optional().default(false).describe("Whether to crawl linked pages for more content"),
      maxPages: z.number().optional().default(10).describe("Maximum pages to crawl if crawl is true"),
    },
    async ({ url, crawl, maxPages }) => {
      const result = crawl
        ? await crawlSiteForLlmsTxt(url, { maxPages, headless: true })
        : await generateLlmsTxt({ url, headless: true });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                title: result.title,
                description: result.description,
                sectionCount: result.sections.length,
                sections: result.sections.map((s) => ({
                  title: s.title,
                  linkCount: s.links.length,
                })),
                llmsTxt: result.markdown,
                usage: "Save the llmsTxt content as /llms.txt in your site's root directory",
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
    "structured_data_suggest",
    "Suggest Schema.org JSON-LD structured data for a page. Detects page type (article, product, organization, etc.) and generates appropriate schema markup.",
    {
      url: z.string().url().describe("URL to analyze"),
    },
    async ({ url }) => {
      const suggestion = await suggestStructuredData({ url, headless: true });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                url,
                pageType: suggestion.pageType,
                confidence: Math.round(suggestion.confidence * 100) + "%",
                reasoning: suggestion.reasoning,
                existingSchema: suggestion.existingSchema.length > 0
                  ? suggestion.existingSchema
                  : "None detected",
                suggestedSchema: suggestion.suggestedSchema,
                implementation: `Add this to your page's <head>:\n\n<script type="application/ld+json">\n${suggestion.suggestedSchemaString}\n</script>`,
                note: "Fill in the empty string fields with your actual content",
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
