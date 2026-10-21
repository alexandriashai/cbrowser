export { registerUiResources, publishCaptureUi, buildStatusTemplate, UI_PROBE_URI, CAPTURE_UI_PREFIX, MCP_APP_MIME } from "./ui-resources.js";
/**
 * CBrowser MCP Tools - Main Index
 *
 * Modular tool registration for CBrowser MCP servers.
 *
 * Tool counts by deployment (measured 2026-10-21 by listing tools/list; the
 * numbers that stood here before, 104 and 91, were typed and had drifted):
 *
 * SHARED SET (registerAllPublicTools): 129
 * - Base tools: 103 (registerBaseTools; the 4 marketing_campaign/personas
 *   tools run for real only with MCP_MODE=demo or enterprise, and answer
 *   with an upgrade message otherwise, as on local MCP)
 * - Persona creation: 7
 * - Ask user: 1
 * - Enterprise stubs: 18 (stealth_*, cloudflare_*, marketing_* analysis, api key)
 * The tier gate changes what a call returns, never what is listed.
 *
 * LOCAL MCP (npx cbrowser mcp-server): 138
 * - The shared set above (129), with tier null: no gate, no credits, no
 *   hosted path/URL refusals.
 * - Stdio-only session bridges: 9 (empathy_audit_init/record_barrier/
 *   complete_persona/summarize, compare_personas_record_result/summarize,
 *   get_emotional_state, list_emotional_personas, trigger_emotional_event).
 *
 * HOSTED (demo / pro): the shared set, 129, plus whatever the server adds.
 * ENTERPRISE: its own registerTools replaces the stubs with the real tools.
 *
 * tests/mcp-stdio-parity.test.ts pins the stdio = shared + 9 relation.
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

// Hosted-transport input policy (sec-paths, 2026-10-10). Exported so a server
// built on startRemoteMcpServer can consult the same flag for its own tools.
export {
  setHostedMode,
  isHostedMode,
  refuseHostedPath,
  refuseHostedPathName,
  refuseHostedUrl,
  confineToAccountDir,
  isWebUrl,
} from "./hosted-inputs.js";

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
  registerSiteKnowledgeTools,
  registerAdvancedInteractionTools,
  registerBrowserStateTools,
  registerGifTools,
  registerCaptureTools,
  registerArtifactTools,
  setSecurityAuditToolList,
} from "./base/index.js";

// Re-export persona creation tools
export { registerPersonaCreationTools } from "./persona-creation-tools.js";
export { registerPersonaLifecycleTools } from "./persona-lifecycle-tools.js";

// Re-export ask user tool
export { registerAskUserTool } from "./ask-user-tools.js";

// Re-export enterprise stubs
export { registerEnterpriseStubs } from "./enterprise-stubs.js";

import type { McpServer, ToolRegistrationContext } from "./types.js";
import { registerBaseTools } from "./base/index.js";
import { registerPersonaCreationTools } from "./persona-creation-tools.js";
import { registerAskUserTool } from "./ask-user-tools.js";
import { registerEnterpriseStubs } from "./enterprise-stubs.js";
import { setActiveTier, createGatedServer } from "./tier-gate.js";
import { applySecurityLayer } from "./security-layer.js";
import type { PricingTier } from "./tool-categories.js";

// Re-export tier gating
export { setActiveTier, getActiveTier, isToolAccessible, upgradePrompt, createGatedServer, setActiveKeyHash, getActiveKeyHash } from "./tier-gate.js";
export type { PricingTier } from "./tool-categories.js";

/**
 * Register all public npm tools on an MCP server
 *
 * Tool count: 129 (see the header of this file for the breakdown)
 *
 * @param server - MCP server instance
 * @param context - Tool registration context with browser access
 * @param pricingTier - User's pricing tier. null = self-hosted (no gating).
 *   'free' = core browser/testing/sessions only. 'pro' = cognitive/visual/personas.
 *   'enterprise' = marketing/stealth/security.
 */
export function registerAllPublicTools(
  server: McpServer,
  context: ToolRegistrationContext,
  pricingTier?: PricingTier | null,
): void {
  // Set active tier for gating (null = self-hosted, no gating)
  setActiveTier(pricingTier ?? null);

  // Wrap server with tier gate proxy (intercepts registerTool calls)
  const gatedServer = createGatedServer(server) as McpServer;

  // Security layer: audit logging, description scanning, zone checks. Applied
  // OUTSIDE the tier gate deliberately — createGatedServer returns the server
  // untouched when the tier is null, which is the live enterprise config, so
  // nesting security inside it would inherit that hole. Until 2026-07-26 the
  // entire security module had zero call sites while the README shipped a Zone
  // table and SKILL.md claimed constitutional safety. (See security-layer.ts for
  // what is enforced and why red-zone denial is opt-in.)
  const securedServer = applySecurityLayer(gatedServer) as McpServer;

  // Base tools (103)
  registerBaseTools(securedServer, context);

  // Persona creation tools (7)
  registerPersonaCreationTools(securedServer);

  // Ask user tool (1)
  registerAskUserTool(securedServer);

  // Enterprise stubs (18)
  registerEnterpriseStubs(securedServer);
}
