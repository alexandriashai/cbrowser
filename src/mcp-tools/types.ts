/**
 * CBrowser MCP Tools - Shared Types
 *
 * @copyright 2026 Alexa Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
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
