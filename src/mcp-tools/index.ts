/**
 * CBrowser MCP Tools - Main Index
 *
 * Modular tool registration for CBrowser MCP servers.
 *
 * Tool counts:
 * - Base tools: 52 (across 16 categories)
 * - Persona creation: 7
 * - Ask user: 1
 * - Enterprise stubs: 22
 *
 * Public npm total: 82 (60 real + 22 stubs)
 *
 * @copyright 2026 WF Media (Alexandria Eden) alexandria.shai.eden@gmail.com
 * @license BSL-1.1 (Business Source License 1.1)
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
 * - 52 base tools
 * - 7 persona creation tools
 * - 1 ask_user tool
 * - 22 enterprise stubs
 *
 * Total: 82 tools (60 real + 22 stubs)
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
