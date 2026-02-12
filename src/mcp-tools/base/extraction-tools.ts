/**
 * CBrowser MCP Tools - Extraction Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import { buildContentWithScreenshots } from "../screenshot-utils.js";

/**
 * Register extraction tools (2 tools: screenshot, extract)
 */
export function registerExtractionTools(
  server: McpServer,
  { getBrowser }: ToolRegistrationContext
): void {
  server.tool(
    "screenshot",
    "Take a screenshot of the current page",
    {
      path: z.string().optional().describe("Optional path to save the screenshot"),
    },
    async ({ path }) => {
      const b = await getBrowser();
      const file = await b.screenshot(path);
      return {
        content: buildContentWithScreenshots({ screenshot: file }, file),
      };
    }
  );

  server.tool(
    "extract",
    "Extract data from the page",
    {
      what: z.enum(["links", "headings", "forms", "images", "text"]).describe("What to extract"),
    },
    async ({ what }) => {
      const b = await getBrowser();
      const result = await b.extract(what);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result.data, null, 2),
          },
        ],
      };
    }
  );
}
