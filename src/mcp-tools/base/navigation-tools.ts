/**
 * CBrowser MCP Tools - Navigation Tools
 *
 * @copyright 2026 Alexa Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import { buildContentWithScreenshots } from "../screenshot-utils.js";

/**
 * Register navigation tools (1 tool: navigate)
 */
export function registerNavigationTools(
  server: McpServer,
  { getBrowser }: ToolRegistrationContext
): void {
  server.tool(
    "navigate",
    "Navigate to a URL and take a screenshot",
    {
      url: z.string().url().describe("The URL to navigate to"),
    },
    async ({ url }) => {
      const b = await getBrowser();
      const result = await b.navigate(url);

      return {
        content: buildContentWithScreenshots(
          {
            success: true,
            url: result.url,
            title: result.title,
            loadTime: result.loadTime,
            screenshot: result.screenshot,
          },
          result.screenshot
        ),
      };
    }
  );
}
