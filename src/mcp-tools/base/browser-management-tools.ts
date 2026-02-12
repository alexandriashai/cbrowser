/**
 * CBrowser MCP Tools - Browser Management Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import { getStatusInfo } from "../../config.js";
import { VERSION } from "../../version.js";

/**
 * Register browser management tools (4 tools: status, browser_health, browser_recover, reset_browser)
 */
export function registerBrowserManagementTools(
  server: McpServer,
  { getBrowser }: ToolRegistrationContext
): void {
  server.tool(
    "status",
    "Get CBrowser environment status and diagnostics including data directories, installed browsers, configuration, and self-healing cache statistics",
    {},
    async () => {
      const info = await getStatusInfo(VERSION);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(info, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "browser_health",
    "Check if the browser is healthy and responsive. Use this before operations if you suspect the browser may have crashed.",
    {},
    async () => {
      const b = await getBrowser();
      const result = await b.isBrowserHealthy();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "browser_recover",
    "Attempt to recover from a browser crash by restarting the browser process. Use this when browser_health returns unhealthy.",
    {
      restoreUrl: z.string().url().optional().describe("URL to restore after recovery (uses last known URL if not provided)"),
      maxAttempts: z.number().optional().default(3).describe("Maximum recovery attempts"),
    },
    async ({ restoreUrl, maxAttempts }) => {
      const b = await getBrowser();
      const result = await b.recoverBrowser({ restoreUrl, maxAttempts });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "reset_browser",
    "Reset the browser to a clean state. Clears all cookies, localStorage, sessionStorage, and browser state. Use this when you need a fresh browser environment.",
    {},
    async () => {
      const b = await getBrowser();
      await b.reset();
      await b.launch();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "Browser reset to clean state and relaunched",
            }, null, 2),
          },
        ],
      };
    }
  );
}
