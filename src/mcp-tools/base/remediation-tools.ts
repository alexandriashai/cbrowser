/**
 * CBrowser MCP Tools - Remediation Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import { refuseHostedUrl } from "../hosted-inputs.js";
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
  server.registerTool("remediation_patches", {
    title: "Generate Remediation Patches",
    description: "Generate code patches to fix agent-ready audit issues. Returns before/after code snippets with explanations, sorted by impact. Run agent_ready_audit first to get issues.",
    inputSchema: {
      url: z.string().url().describe("URL to audit and generate patches for"),
      maxPatches: z.number().optional().default(10).describe("Maximum number of patches to return"),
    },
    annotations: {
      title: "Generate Remediation Patches",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ url, maxPatches }) => {
      // Hosted: http(s) only (sec-paths, 2026-10-10; see hosted-inputs.ts).
      const hostedRefusal = refuseHostedUrl("remediation_patches", { url });
      if (hostedRefusal) return hostedRefusal;
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

  server.registerTool("llms_txt_generate", {
    title: "Generate llms.txt",
    description: "Generate an llms.txt file from a website. Extracts title, description, and navigation structure in the llms.txt format for AI-readable site descriptions.",
    inputSchema: {
      url: z.string().url().describe("URL to analyze"),
      crawl: z.boolean().optional().default(false).describe("Whether to crawl linked pages for more content"),
      maxPages: z.number().optional().default(10).describe("Maximum pages to crawl if crawl is true"),
    },
    annotations: {
      title: "Generate llms.txt",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ url, crawl, maxPages }) => {
      // Hosted: http(s) only (sec-paths, 2026-10-10; see hosted-inputs.ts).
      const hostedRefusal = refuseHostedUrl("llms_txt_generate", { url });
      if (hostedRefusal) return hostedRefusal;
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

  server.registerTool("structured_data_suggest", {
    title: "Suggest Structured Data",
    description: "Suggest Schema.org JSON-LD structured data for a page. Detects page type (article, product, organization, etc.) and generates appropriate schema markup.",
    inputSchema: {
      url: z.string().url().describe("URL to analyze"),
    },
    annotations: {
      title: "Suggest Structured Data",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ url }) => {
      // Hosted: http(s) only (sec-paths, 2026-10-10; see hosted-inputs.ts).
      const hostedRefusal = refuseHostedUrl("structured_data_suggest", { url });
      if (hostedRefusal) return hostedRefusal;
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
                // What a low-confidence "unknown" nearly was. (2026-10-10, B34)
                candidates: suggestion.candidates.map((c) => ({ type: c.type, confidence: Math.round(c.confidence * 100) + "%" })),
                suggestedSchema: suggestion.suggestedSchema,
                // No schema when the page already declares it or declares one it
                // would contradict; the reasoning says which. (2026-10-10, B34)
                implementation: suggestion.suggestedSchema
                  ? `Add this to your page's <head>:\n\n<script type="application/ld+json">\n${suggestion.suggestedSchemaString}\n</script>`
                  : "Nothing to add. See reasoning.",
                note: suggestion.suggestedSchema
                  ? "Many fields are auto-extracted from the page. Fill in any remaining empty strings with your actual content."
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
