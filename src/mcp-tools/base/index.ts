/**
 * CBrowser MCP Tools - Base Tools Index
 * Registers all 52 base tools across 17 categories
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
import { registerCognitiveTools } from "./cognitive-tools.js";
import { registerValuesTools } from "./values-tools.js";
import { registerPerformanceTools } from "./performance-tools.js";
import { registerAuditTools } from "./audit-tools.js";
import { registerBrowserManagementTools } from "./browser-management-tools.js";

/**
 * Register all 52 base tools on an MCP server
 *
 * Tool count by category:
 * - Navigation: 1 (navigate)
 * - Interaction: 5 (click, smart_click, dismiss_overlay, fill, scroll)
 * - Extraction: 2 (screenshot, extract)
 * - Assertion: 1 (assert)
 * - Analysis: 3 (analyze_page, generate_tests, find_element_by_intent)
 * - Session: 4 (save_session, load_session, list_sessions, delete_session)
 * - Healing: 1 (heal_stats)
 * - Visual Testing: 6 (visual_baseline, visual_regression, cross_browser_test, cross_browser_diff, responsive_test, ab_comparison)
 * - Testing: 5 (nl_test_file, nl_test_inline, repair_test, detect_flaky_tests, coverage_map)
 * - Bug Analysis: 2 (hunt_bugs, chaos_test)
 * - Persona Comparison: 3 (compare_personas, compare_personas_init, compare_personas_complete)
 * - Cognitive: 3 (cognitive_journey_init, cognitive_journey_update_state, list_cognitive_personas)
 * - Values: 6 (persona_values_lookup, list_influence_patterns, persona_questionnaire_get, persona_questionnaire_build, persona_trait_lookup, persona_category_guidance)
 * - Performance: 3 (perf_baseline, perf_regression, list_baselines)
 * - Audit: 3 (agent_ready_audit, competitive_benchmark, empathy_audit)
 * - Browser Management: 4 (status, browser_health, browser_recover, reset_browser)
 *
 * Total: 52 tools
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

  // Analysis (3)
  registerAnalysisTools(server, context);

  // Session (4)
  registerSessionTools(server, context);

  // Healing (1)
  registerHealingTools(server, context);

  // Visual Testing (6) - no browser context needed
  registerVisualTestingTools(server);

  // Testing (5) - no browser context needed
  registerTestingTools(server);

  // Bug Analysis (2)
  registerBugAnalysisTools(server, context);

  // Persona Comparison (3)
  registerPersonaComparisonTools(server, context);

  // Cognitive (3)
  registerCognitiveTools(server, context);

  // Values (6) - no browser context needed
  registerValuesTools(server);

  // Performance (3) - no browser context needed
  registerPerformanceTools(server);

  // Audit (3) - no browser context needed
  registerAuditTools(server);

  // Browser Management (4)
  registerBrowserManagementTools(server, context);
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
export { registerCognitiveTools } from "./cognitive-tools.js";
export { registerValuesTools } from "./values-tools.js";
export { registerPerformanceTools } from "./performance-tools.js";
export { registerAuditTools } from "./audit-tools.js";
export { registerBrowserManagementTools } from "./browser-management-tools.js";
