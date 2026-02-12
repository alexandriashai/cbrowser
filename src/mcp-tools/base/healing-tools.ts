/**
 * CBrowser MCP Tools - Self-Healing Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import type { McpServer, ToolRegistrationContext } from "../types.js";

/**
 * Register self-healing tools (1 tool: heal_stats)
 */
export function registerHealingTools(
  server: McpServer,
  { getBrowser }: ToolRegistrationContext
): void {
  server.tool(
    "heal_stats",
    "Get self-healing selector cache statistics",
    {},
    async () => {
      const b = await getBrowser();
      const stats = b.getSelectorCacheStats();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    }
  );
}
