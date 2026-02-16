/**
 * CBrowser MCP Tools - Main Index
 *
 * Modular tool registration for CBrowser MCP servers.
 *
 * Tool counts:
 * - Base tools: 56 (across 18 categories)
 * - Persona creation: 7
 * - Ask user: 1
 * - Enterprise stubs: 19
 *
 * Public npm total: 83 (64 real + 19 stubs)
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

// Re-export types
export type { McpServer, CBrowser, ToolRegistrationContext } from "./types.js";

// Re-export screenshot utilities
export {
  setRemoteMode,
  getRemoteMode,
  transformResponseForRemote,
} from "./screenshot-utils.js";

// Re-export base tools
export { registerBaseTools } from "./base/index.js";

// Re-export individual base tool categories for granular use
export {
  registerNavigationTools,
  registerInteractionTools,
  registerExtractionTools,
  registerAssertionTools,
  registerAnalysisTools,
  registerSessionTools,
  registerHealingTools,
  registerVisualTestingTools,
  registerTestingTools,
  registerBugAnalysisTools,
  registerPersonaComparisonTools,
  registerCognitiveTools,
  registerValuesTools,
  registerPerformanceTools,
  registerAuditTools,
  registerBrowserManagementTools,
  registerMarketingTools,
} from "./base/index.js";

// Re-export persona creation tools
export { registerPersonaCreationTools } from "./persona-creation-tools.js";

// Re-export ask user tool
export { registerAskUserTool } from "./ask-user-tools.js";

// Re-export enterprise stubs
export { registerEnterpriseStubs } from "./enterprise-stubs.js";

import type { McpServer, ToolRegistrationContext } from "./types.js";
import { registerBaseTools } from "./base/index.js";
import { registerPersonaCreationTools } from "./persona-creation-tools.js";
import { registerAskUserTool } from "./ask-user-tools.js";
import { registerEnterpriseStubs } from "./enterprise-stubs.js";

/**
 * Register all public npm tools on an MCP server
 *
 * This registers:
 * - 56 base tools (including 3 marketing tools)
 * - 7 persona creation tools
 * - 1 ask_user tool
 * - 19 enterprise stubs
 *
 * Total: 83 tools (64 real + 19 stubs)
 */
export function registerAllPublicTools(
  server: McpServer,
  context: ToolRegistrationContext
): void {
  // Base tools (52)
  registerBaseTools(server, context);

  // Persona creation tools (7)
  registerPersonaCreationTools(server);

  // Ask user tool (1)
  registerAskUserTool(server);

  // Enterprise stubs (22)
  registerEnterpriseStubs(server);
}
