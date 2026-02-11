/**
 * CBrowser MCP Tools - Navigation Tools
 *
 * @copyright 2026 WF Media (Alexandria Eden) alexandria.shai.eden@gmail.com
 * @license BSL-1.1 (Business Source License 1.1)
 */

import { z } from "zod";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import { getRemoteMode, screenshotToBase64 } from "../screenshot-utils.js";

/** Text content block */
interface TextContent {
  type: "text";
  text: string;
}

/** Image content block */
interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

type ContentBlock = TextContent | ImageContent;

/**
 * Build content array with optional image for remote mode
 */
function buildContentWithScreenshot(
  data: Record<string, unknown>,
  screenshotPath?: string
): ContentBlock[] {
  const content: ContentBlock[] = [
    {
      type: "text",
      text: JSON.stringify(data, null, 2),
    },
  ];

  // In remote mode, add image content block for screenshots
  if (getRemoteMode() && screenshotPath) {
    const base64Data = screenshotToBase64(screenshotPath);
    if (base64Data) {
      const base64Only = base64Data.split(",")[1];
      const mimeType = base64Data.split(";")[0].split(":")[1];
      content.push({
        type: "image",
        data: base64Only,
        mimeType: mimeType,
      });
    }
  }

  return content;
}

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
        content: buildContentWithScreenshot(
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
