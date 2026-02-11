/**
 * CBrowser MCP Tools - Shared Types
 *
 * @copyright 2026 WF Media (Alexandria Eden) alexandria.shai.eden@gmail.com
 * @license BSL-1.1 (Business Source License 1.1)
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CBrowser } from "../browser.js";

/**
 * Context for tool registration functions
 */
export interface ToolRegistrationContext {
  /** Function to get or create a browser instance */
  getBrowser: () => Promise<CBrowser>;
}

/**
 * Type for MCP Server (re-exported for convenience)
 */
export type { McpServer };

/**
 * Type for CBrowser (re-exported for convenience)
 */
export type { CBrowser };
