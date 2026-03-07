/**
 * CBrowser MCP Tools - Main Index
 *
 * Modular tool registration for CBrowser MCP servers.
 *
 * Tool counts by deployment:
 *
 * LOCAL MCP (npx cbrowser mcp-server):
 * - Base tools: 64 (4 marketing as stubs, 3 remediation, 1 ai_benchmark, 2 llms.txt)
 * - Persona creation: 7
 * - Ask user: 1
 * - Enterprise stubs: 18
 * - Total: 90 (67 real + 23 stubs)
 *
 * DEMO SERVER (MCP_MODE=demo):
 * - Base tools: 64 (4 marketing real, 3 remediation, 1 ai_benchmark, 2 llms.txt)
 * - Persona creation: 7
 * - Ask user: 1
 * - Enterprise stubs: 18
 * - Total: 90 (71 real + 19 stubs)
 *
 * ENTERPRISE (MCP_MODE=enterprise):
 * - All 90 tools fully functional
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
  MAX_RESPONSE_SIZE,
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
  registerRemediationTools,
  registerLlmsTxtTools,
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
 * Tool count: 90 tools across all deployments
 * - LOCAL: 90 tools (67 real + 23 stubs including 4 marketing stubs)
 * - DEMO: 90 tools (71 real + 19 stubs)
 * - ENTERPRISE: 90 tools all functional
 */
export function registerAllPublicTools(
  server: McpServer,
  context: ToolRegistrationContext
): void {
  // Base tools (64)
  registerBaseTools(server, context);

  // Persona creation tools (7)
  registerPersonaCreationTools(server);

  // Ask user tool (1)
  registerAskUserTool(server);

  // Enterprise stubs (18)
  registerEnterpriseStubs(server);
}
