/**
 * CBrowser MCP Tools - Main Index
 *
 * Modular tool registration for CBrowser MCP servers.
 *
 * Tool counts by deployment:
 *
 * LOCAL MCP (npx cbrowser mcp-server):
 * - Base tools: 57 (4 marketing as stubs)
 * - Persona creation: 7
 * - Ask user: 1
 * - Enterprise stubs: 18
 * - Total: 83 (61 real + 22 stubs)
 *
 * DEMO SERVER (MCP_MODE=demo):
 * - Base tools: 57 (4 marketing real)
 * - Persona creation: 7
 * - Ask user: 1
 * - Enterprise stubs: 18
 * - Total: 83 (65 real + 18 stubs)
 *
 * ENTERPRISE (MCP_MODE=enterprise):
 * - All 83 tools fully functional
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
  registerSecurityTools,
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
 * Tool count: 83 tools across all deployments
 * - LOCAL: 83 tools (61 real + 22 stubs including 4 marketing stubs)
 * - DEMO: 83 tools (65 real + 18 stubs)
 * - ENTERPRISE: 83 tools all functional
 */
export function registerAllPublicTools(
  server: McpServer,
  context: ToolRegistrationContext
): void {
  // Base tools (57)
  registerBaseTools(server, context);

  // Persona creation tools (7)
  registerPersonaCreationTools(server);

  // Ask user tool (1)
  registerAskUserTool(server);

  // Enterprise stubs (18)
  registerEnterpriseStubs(server);
}
