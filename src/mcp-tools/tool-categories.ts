/**
 * CBrowser Tool Categories — for lazy loading and context efficiency.
 *
 * Tier 1: Always loaded — core tools used in most conversations (~15 tools)
 * Tier 2: Loaded on demand by category — specialist tools loaded when needed (~45 tools)
 * Tier 3: Rarely needed — loaded only on explicit request (~26 tools)
 *
 * This reduces token cost from ~105 tool descriptions to ~15 in the default context,
 * with category summaries for the rest that let the LLM request specific groups.
 *
 * @since v18.39.0
 */

export type PricingTier = 'free' | 'pro' | 'enterprise';

export interface ToolCategory {
  name: string;
  description: string;
  tier: 1 | 2 | 3;
  pricingTier: PricingTier;
  tools: string[];
}

export const TOOL_CATEGORIES: ToolCategory[] = [
  // ── Tier 1: Always loaded (~15 tools) ──
  // These are used in 80%+ of conversations
  {
    name: "core_browser",
    description: "Navigate, interact with, and capture web pages",
    tier: 1,
    pricingTier: "free",
    tools: [
      "navigate",
      "click",
      "fill",
      "scroll",
      "screenshot",
      "extract",
      "hover",
      "type_text",
      "press_key",
      "drag",
      "upload_file",
      "handle_dialog",
      "evaluate_script",
      // Loads the images screenshot and the other views produce. It was in no
      // category, so every count built from this table missed it. Free by NAME
      // (FREE_TIER_TOOLS), whatever the category. (B33, 2026-10-10)
      "artifact_fetch",
    ],
  },
  {
    name: "core_analysis",
    description: "Assess sites for AI-friendliness, accessibility, and cognitive effort",
    tier: 1,
    pricingTier: "pro",
    tools: [
      "agent_ready_audit",
      "empathy_audit",
      "cognitive_effort",
      "site_cognitive_assessment",
      "page_understand",
      "cognitive_journey_init",
      "cognitive_journey_update_state",
      "list_cognitive_personas",
      "security_audit",
    ],
  },

  // ── Tier 2: Loaded on demand (~45 tools) ──
  // Loaded when the user asks about a specific capability
  {
    name: "visual_testing",
    description: "Visual regression, baselines, cross-browser, responsive, and A/B comparison",
    tier: 2,
    pricingTier: "pro",
    tools: [
      "visual_baseline",
      "visual_regression",
      "cross_browser_test",
      "cross_browser_diff",
      "responsive_test",
      "ab_comparison",
      "transport_map",
      "attention_analysis",
      "attention_compare",
      // Uncategorized until 2026-10-10 (B33), which already priced it pro by
      // default; this category is pro, so its price is unchanged.
      "visual_cognitive_story",
    ],
  },
  {
    name: "cognitive_transport",
    description: "Wasserstein persona distance, interpolation, coverage, load estimation, and comparison",
    tier: 2,
    pricingTier: "pro",
    tools: [
      "cognitive_distance",
      "cognitive_coverage",
      "cognitive_interpolate",
      "cognitive_load_estimate",
      "compare_personas",
      "compare_personas_init",
      "compare_personas_complete",
    ],
  },
  {
    name: "testing",
    description: "Natural language tests, flaky detection, test repair, and coverage mapping",
    tier: 2,
    pricingTier: "free",
    tools: [
      "nl_test_inline",
      "nl_test_file",
      "repair_test",
      "detect_flaky_tests",
      "coverage_map",
    ],
  },
  {
    name: "site_knowledge",
    description: "Persistent site models, profiles, navigation knowledge, and answers from CBrowser's own docs",
    tier: 2,
    pricingTier: "pro",
    tools: [
      "site_model_status",
      "site_model_query",
      "site_profile_list",
      "site_profile_delete",
      "site_profile_status",
      // Registered beside these in site-knowledge-tools.ts and in no category
      // until 2026-10-10 (B33). Uncategorized already meant pro; still pro.
      "question_answer",
    ],
  },
  {
    name: "performance",
    description: "Performance baselines and regression detection",
    tier: 2,
    pricingTier: "pro",
    tools: [
      "perf_baseline",
      "perf_regression",
      "list_baselines",
    ],
  },
  {
    name: "bug_hunting",
    description: "Autonomous bug hunting and chaos engineering",
    tier: 2,
    pricingTier: "pro",
    tools: [
      "hunt_bugs",
      "chaos_test",
      "competitive_benchmark",
    ],
  },
  {
    name: "marketing",
    description: "Marketing campaigns, persona-based A/B testing, influence analysis",
    tier: 2,
    pricingTier: "enterprise",
    tools: [
      "marketing_personas_list",
      "marketing_campaign_create",
      "marketing_campaign_run",
      "marketing_campaign_report_result",
    ],
  },
  {
    name: "sessions",
    description: "Save, load, list, and delete browser sessions",
    tier: 2,
    pricingTier: "free",
    tools: [
      "save_session",
      "load_session",
      "list_sessions",
      "delete_session",
    ],
  },

  // ── Tier 3: Specialist tools (~26 tools) ──
  // Rarely needed, loaded only on explicit request
  {
    name: "persona_creation",
    description: "Create custom personas via questionnaire or description",
    tier: 3,
    pricingTier: "pro",
    tools: [
      "persona_create_start",
      "persona_create_questionnaire_start",
      "persona_create_questionnaire_answer",
      "persona_create_from_description",
      "persona_manager",
      "persona_update",
      "persona_delete",
      "persona_create_submit_traits",
      "persona_create_cancel",
    ],
  },
  {
    name: "persona_values",
    description: "Persona value systems, traits, influence patterns, and questionnaires",
    tier: 3,
    pricingTier: "pro",
    tools: [
      "persona_values_list",
      "persona_values_lookup",
      "list_influence_patterns",
      "persona_questionnaire_get",
      "persona_questionnaire_build",
      "persona_trait_lookup",
      "persona_traits_list",
      "persona_category_guidance",
      // The whole-persona view beside persona_values_lookup; in no category
      // until 2026-10-10 (B33). Uncategorized already meant pro; still pro.
      "persona_lookup",
    ],
  },
  {
    name: "browser_management",
    description: "Browser health, recovery, reset, and status",
    tier: 3,
    pricingTier: "free",
    tools: [
      "status",
      "browser_health",
      "browser_recover",
      "reset_browser",
      "manage_tabs",
      "get_console_messages",
      "get_network_requests",
      "manage_cookies",
      "manage_storage",
    ],
  },
  {
    name: "advanced_interaction",
    description: "Smart click with self-healing, dismiss overlays, find by intent, AI benchmark",
    tier: 3,
    pricingTier: "free",
    tools: [
      "smart_click",
      "dismiss_overlay",
      "find_element_by_intent",
      "analyze_page",
      "generate_tests",
      "assert",
      "ai_benchmark",
    ],
  },
  {
    name: "remediation",
    description: "Generate remediation patches, llms.txt, structured data, and WebMCP audit",
    tier: 3,
    pricingTier: "pro",
    tools: [
      "remediation_patches",
      "llms_txt_generate",
      "llms_txt_validate",
      "llms_txt_diff",
      "structured_data_suggest",
      "webmcp_ready_audit",
      "heal_stats",
      "ask_user",
    ],
  },

  {
    name: "gif_generation",
    description: "Animated cognitive journey heatmap GIFs",
    tier: 2,
    pricingTier: "pro",
    tools: [
      "journey_heatmap_gif",
    ],
  },

  {
    name: "screen_capture",
    description: "Record the screen to GIF/WebP/video with a frame manifest and change points",
    tier: 2,
    pricingTier: "free",
    tools: [
      "capture_start",
      "capture_stop",
      "capture_status",
    ],
  },

  // ── Enterprise Tools ──
  {
    name: "enterprise_security",
    description: "Web security scanning and stealth mode for authorized domains",
    tier: 2,
    pricingTier: "enterprise",
    tools: [
      "web_security_scan",
      "stealth_status",
      "stealth_enable",
      "stealth_disable",
      "stealth_check",
      "stealth_diagnose",
      "cloudflare_detect",
      "cloudflare_wait",
    ],
  },
  {
    name: "enterprise_autonomous",
    description: "Autonomous cognitive journeys and API key management",
    tier: 2,
    pricingTier: "enterprise",
    tools: [
      "cognitive_journey_autonomous",
      "set_api_key",
      "clear_api_key",
      "api_key_status",
      "get_api_key_prompt",
    ],
  },
  {
    name: "enterprise_marketing",
    description: "Advanced marketing: influence matrix, lever analysis, funnel analysis, competitive, audience discovery",
    tier: 3,
    pricingTier: "enterprise",
    tools: [
      "marketing_influence_matrix",
      "marketing_lever_analysis",
      "marketing_funnel_analyze",
      "marketing_compete",
      "marketing_audience_discover",
      "marketing_discover_status",
    ],
  },
];

/** Get tier for a tool name */
export function getToolTier(toolName: string): 1 | 2 | 3 {
  for (const cat of TOOL_CATEGORIES) {
    if (cat.tools.includes(toolName)) return cat.tier;
  }
  return 3; // default to tier 3 for unknown tools
}

/** Get category for a tool name */
export function getToolCategory(toolName: string): string | undefined {
  for (const cat of TOOL_CATEGORIES) {
    if (cat.tools.includes(toolName)) return cat.name;
  }
  return undefined;
}

/**
 * Every tool in the catalog, once. The one source for any tool count the server
 * prints about itself.
 *
 * Those counts were hand-written and had drifted three different ways in one
 * file: the instructions said "120 tools across 16 categories", the
 * tools-overview resource said 105 in its description and "120 across 11" in
 * its body, and persona_creation was "(6 tools)" with nine in it. tools/list on
 * the enterprise server returned 130 from 20 categories. (B33, 2026-10-10)
 */
export function categorizedToolNames(): string[] {
  return [...new Set(TOOL_CATEGORIES.flatMap(cat => cat.tools))];
}

/** Get all tools in a tier */
export function getToolsByTier(tier: 1 | 2 | 3): string[] {
  return TOOL_CATEGORIES
    .filter(cat => cat.tier === tier)
    .flatMap(cat => cat.tools);
}

/**
 * Tools available on the free tier, by NAME.
 *
 * Pricing is not a function of category. TOOL_CATEGORIES groups tools by what
 * they DO (visual_testing, bug_hunting, performance...), and pricing was being
 * read off that grouping — so a tool could not be free unless every sibling in
 * its functional category was too. That is why 18 free-tier tools were being
 * refused: agent_ready_audit and hunt_bugs sit in "pro" categories beside tools
 * that genuinely are Pro.
 *
 * Measured 2026-08-13: the CMS (cbrowser-web/cms/lib/credit-config.ts) and this
 * file disagreed about 18 tools. The CMS permitted them and this gate refused
 * them, so a free user was told they had the tool and then got "Upgrade
 * Required" — including on the two the public homepage demo runs, which is how
 * this surfaced.
 *
 * This set is the UNION of both former lists: every tool either side considered
 * free stays free, so no user loses access that they have today.
 *
 * KEEP IN SYNC with FREE_TIER_TOOLS in cbrowser-web/cms/lib/credit-config.ts.
 * Both sides have a test that fails when they drift.
 */
export const FREE_TIER_TOOLS = new Set([
  "ab_comparison", "agent_ready_audit", "ai_benchmark", "analyze_page",
  // artifact_fetch is how a view loads its own picture (the widget sandbox
  // cannot fetch cbrowser.ai). Unlisted, it defaulted to Pro, so the free
  // screenshot tool's view could never show its screenshot. Free, 0 credits.
  // (Alexa, 2026-10-10)
  "artifact_fetch",
  "assert", "browser_health", "browser_recover", "capture_start",
  "capture_status", "capture_stop", "click", "cognitive_effort",
  "cognitive_load_estimate", "coverage_map", "cross_browser_diff",
  "cross_browser_test", "delete_session", "detect_flaky_tests",
  "dismiss_overlay", "drag", "evaluate_script", "extract", "fill",
  "find_element_by_intent", "generate_tests", "get_console_messages",
  "get_network_requests", "handle_dialog", "heal_stats", "hover", "hunt_bugs",
  "list_baselines", "list_cognitive_personas", "list_sessions",
  "llms_txt_generate", "load_session", "manage_cookies", "manage_storage",
  "manage_tabs", "navigate", "nl_test_file", "nl_test_inline",
  "page_understand", "perf_baseline", "perf_regression",
  "persona_create_from_description", "press_key", "repair_test",
  "reset_browser", "responsive_test", "save_session", "screenshot", "scroll",
  "smart_click", "status", "type_text", "upload_file", "visual_baseline",
  "visual_regression"
]);

/** Get pricing tier required for a tool */
export function getToolPricingTier(toolName: string): PricingTier {
  // Name first, category second. A tool's price is a product decision; its
  // category is a functional one, and reading the first off the second is what
  // put 18 free tools behind an upgrade prompt.
  if (FREE_TIER_TOOLS.has(toolName)) return 'free';
  for (const cat of TOOL_CATEGORIES) {
    if (cat.tools.includes(toolName)) return cat.pricingTier;
  }
  return 'pro'; // default to pro for unknown tools
}

/** Check if a user tier has access to a tool's required tier */
export function tierHasAccess(userTier: PricingTier, requiredTier: PricingTier): boolean {
  const levels: Record<PricingTier, number> = { free: 0, pro: 1, enterprise: 2 };
  return levels[userTier] >= levels[requiredTier];
}

/** Get all tools accessible at a given tier */
export function getToolsForTier(tier: PricingTier): string[] {
  return TOOL_CATEGORIES
    .filter(cat => tierHasAccess(tier, cat.pricingTier))
    .flatMap(cat => cat.tools);
}

/** Get all tools that require upgrade from a given tier */
export function getGatedTools(userTier: PricingTier): Array<{ tool: string; requiredTier: PricingTier }> {
  const gated: Array<{ tool: string; requiredTier: PricingTier }> = [];
  for (const cat of TOOL_CATEGORIES) {
    if (!tierHasAccess(userTier, cat.pricingTier)) {
      for (const tool of cat.tools) {
        gated.push({ tool, requiredTier: cat.pricingTier });
      }
    }
  }
  return gated;
}

/** Get category summary for LLM context (one line per category) */
export function getCategorySummary(): string {
  return TOOL_CATEGORIES
    .filter(cat => cat.tier > 1)
    .map(cat => `[${cat.name}] ${cat.description} (${cat.tools.length} tools: ${cat.tools.slice(0, 3).join(', ')}${cat.tools.length > 3 ? '...' : ''})`)
    .join('\n');
}
