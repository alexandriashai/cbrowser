/**
 * CBrowser MCP Tools - Base Tools Index
 * Registers 81 base tools across 22 categories
 * (Marketing tools register everywhere but as stubs on local MCP)
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import type { McpServer, ToolRegistrationContext } from "../types.js";

// Category imports
import { registerNavigationTools } from "./navigation-tools.js";
import { registerInteractionTools } from "./interaction-tools.js";
import { registerExtractionTools } from "./extraction-tools.js";
import { registerAssertionTools } from "./assertion-tools.js";
import { registerAnalysisTools } from "./analysis-tools.js";
import { registerSessionTools } from "./session-tools.js";
import { registerHealingTools } from "./healing-tools.js";
import { registerVisualTestingTools } from "./visual-testing-tools.js";
import { registerTestingTools } from "./testing-tools.js";
import { registerBugAnalysisTools } from "./bug-analysis-tools.js";
import { registerPersonaComparisonTools } from "./persona-comparison-tools.js";
import { registerPersonaLifecycleTools } from "../persona-lifecycle-tools.js";
import { registerCognitiveTools } from "./cognitive-tools.js";
import { registerValuesTools } from "./values-tools.js";
import { registerPerformanceTools } from "./performance-tools.js";
import { registerAuditTools } from "./audit-tools.js";
import { registerBrowserManagementTools } from "./browser-management-tools.js";
import { registerSecurityTools } from "./security-tools.js";
import { registerMarketingTools } from "./marketing-tools.js";
import { registerRemediationTools } from "./remediation-tools.js";
import { registerLlmsTxtTools } from "./llms-txt-tools.js";
import { registerSiteKnowledgeTools } from "./site-knowledge-tools.js";
import { registerGifTools } from "./gif-tools.js";
import { registerAdvancedInteractionTools } from "./advanced-interaction-tools.js";
import { registerBrowserStateTools } from "./browser-state-tools.js";
import { registerCaptureTools } from "./capture-tools.js";
import { registerArtifactTools } from "./artifact-tools.js";

/**
 * Register all 65 base tools on an MCP server
 *
 * Tool count by category:
 * - Navigation: 1 (navigate)
 * - Interaction: 5 (click, smart_click, dismiss_overlay, fill, scroll)
 * - Extraction: 2 (screenshot, extract)
 * - Assertion: 1 (assert)
 * - Analysis: 4 (analyze_page, generate_tests, find_element_by_intent, ai_benchmark)
 * - Session: 4 (save_session, load_session, list_sessions, delete_session)
 * - Healing: 1 (heal_stats)
 * - Visual Testing: 11 (visual_baseline, visual_regression, cross_browser_test, cross_browser_diff, responsive_test, ab_comparison, smart_baseline, smart_regression, transport_map, attention_analysis, attention_compare)
 * - Testing: 5 (nl_test_file, nl_test_inline, repair_test, detect_flaky_tests, coverage_map)
 * - Bug Analysis: 2 (hunt_bugs, chaos_test)
 * - Persona Comparison: 7 (compare_personas, compare_personas_init, compare_personas_complete, cognitive_distance, cognitive_coverage, cognitive_interpolate, cognitive_load_estimate)
 * - Cognitive: 3 (cognitive_journey_init, cognitive_journey_update_state, list_cognitive_personas)
 * - Values: 7 (persona_values_list, persona_values_lookup, list_influence_patterns, persona_questionnaire_get, persona_questionnaire_build, persona_trait_lookup, persona_category_guidance)
 * - Performance: 3 (perf_baseline, perf_regression, list_baselines)
 * - Audit: 4 (agent_ready_audit, competitive_benchmark, empathy_audit, webmcp_ready_audit)
 * - Browser Management: 4 (status, browser_health, browser_recover, reset_browser)
 * - Security: 1 (security_audit)
 * - Marketing: 4 (marketing_personas_list, marketing_campaign_create, marketing_campaign_run, marketing_campaign_report_result)
 *   NOTE: Marketing tools register as stubs on local MCP, real implementations on demo/enterprise
 * - Remediation: 3 (remediation_patches, llms_txt_generate, structured_data_suggest)
 * - llms.txt: 2 (llms_txt_validate, llms_txt_diff)
 * - Site Knowledge: 6 (page_understand, site_model_status, site_model_query, site_profile_list, site_profile_delete, site_profile_status)
 *
 * Total: 78 tools (always registered; marketing tools are stubs on local MCP)
 */
export function registerBaseTools(
  server: McpServer,
  context: ToolRegistrationContext
): void {
  // Navigation (1)
  registerNavigationTools(server, context);

  // Interaction (5)
  registerInteractionTools(server, context);

  // Extraction (2)
  registerExtractionTools(server, context);

  // Assertion (1)
  registerAssertionTools(server, context);

  // Analysis (4)
  registerAnalysisTools(server, context);

  // Session (4)
  registerSessionTools(server, context);

  // Healing (1)
  registerHealingTools(server, context);

  // Visual Testing (6) - attention_analysis can analyze a live session by token
  registerVisualTestingTools(server, context);

  // Testing (5) - no browser context needed
  registerTestingTools(server);

  // Bug Analysis (2)
  registerBugAnalysisTools(server, context);

  // Persona Comparison (3)
  registerPersonaComparisonTools(server, context);

  // Update + delete. Registered on the shared path so the stdio and remote
  // servers get them together rather than diverging, which is how this
  // subsystem accumulated eight duplicate tool families.
  registerPersonaLifecycleTools(server);

  // Cognitive (3)
  registerCognitiveTools(server, context);

  // Values (6) - no browser context needed
  registerValuesTools(server);

  // Performance (3) - no browser context needed
  registerPerformanceTools(server);

  // Audit (6) - site_cognitive_assessment now supports _browserToken
  registerAuditTools(server, context);

  // Browser Management (4)
  registerBrowserManagementTools(server, context);

  // Security (1) - no browser context needed
  registerSecurityTools(server);

  // Marketing (3) - no browser context needed
  registerMarketingTools(server);

  // Remediation (3) - no browser context needed
  registerRemediationTools(server, context);

  // llms.txt (2) - no browser context needed
  registerLlmsTxtTools(server, context);

  // Site Knowledge (6) - page understanding, site model, site profiles
  registerSiteKnowledgeTools(server, context);

  // GIF tools (1) - journey heatmap animation
  registerGifTools(server, context);

  // Advanced Interaction (6) - hover, type_text, press_key, handle_dialog, upload_file, drag
  registerAdvancedInteractionTools(server, context);

  // Browser State (5) - evaluate_script, get_console_messages, get_network_requests, manage_cookies, manage_storage
  registerBrowserStateTools(server, context);

  // Screen Capture (3) - capture_start, capture_stop, capture_status (pixels to GIF/video)
  registerCaptureTools(server, context);
  registerArtifactTools(server);
}

// Re-export individual registration functions for granular use
export { registerNavigationTools } from "./navigation-tools.js";
export { registerInteractionTools } from "./interaction-tools.js";
export { registerExtractionTools } from "./extraction-tools.js";
export { registerAssertionTools } from "./assertion-tools.js";
export { registerAnalysisTools } from "./analysis-tools.js";
export { registerSessionTools } from "./session-tools.js";
export { registerHealingTools } from "./healing-tools.js";
export { registerVisualTestingTools } from "./visual-testing-tools.js";
export { registerTestingTools } from "./testing-tools.js";
export { registerBugAnalysisTools } from "./bug-analysis-tools.js";
export { registerPersonaComparisonTools } from "./persona-comparison-tools.js";
export { registerPersonaLifecycleTools } from "../persona-lifecycle-tools.js";
export { registerCognitiveTools } from "./cognitive-tools.js";
export { registerValuesTools } from "./values-tools.js";
export { registerPerformanceTools } from "./performance-tools.js";
export { registerAuditTools } from "./audit-tools.js";
export { registerBrowserManagementTools } from "./browser-management-tools.js";
export { registerSecurityTools, setSecurityAuditToolList } from "./security-tools.js";
export { registerMarketingTools } from "./marketing-tools.js";
export { registerRemediationTools } from "./remediation-tools.js";
export { registerLlmsTxtTools } from "./llms-txt-tools.js";
export { registerSiteKnowledgeTools } from "./site-knowledge-tools.js";
export { registerGifTools } from "./gif-tools.js";
export { registerAdvancedInteractionTools } from "./advanced-interaction-tools.js";
export { registerBrowserStateTools } from "./browser-state-tools.js";
export { registerCaptureTools } from "./capture-tools.js";
export { registerArtifactTools } from "./artifact-tools.js";
