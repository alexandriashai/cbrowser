/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Per-Tool Permission Model for CBrowser MCP Server
 *
 * Provides granular permission control for MCP tools based on security zones.
 * Users can override default zone assignments to customize tool access.
 *
 * Zone Levels:
 * - GREEN: Read-only, always safe - auto-execute
 * - YELLOW: Interactive but safe - allowed, no confirmation
 * - ORANGE: State-modifying - allowed with warning
 * - RED: Sensitive/Autonomous - requires --force flag
 * - BLACK: Prohibited - always blocked, even with --force
 *
 * Storage: ~/.cbrowser/tool-permissions.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ============================================================================
// Types
// ============================================================================

/**
 * Security zone classification for tools.
 * Extends ActionZone with "orange" for more granular control.
 */
export type ToolZone = "green" | "yellow" | "orange" | "red" | "black";

/**
 * Configuration for per-tool permissions.
 * Stored in ~/.cbrowser/tool-permissions.json
 */
export interface ToolPermissionConfig {
  /** Tool name to zone mapping (user overrides only) */
  toolPermissions: Record<string, ToolZone>;
  /** When this config was last updated */
  lastUpdated: string;
  /** User who set the permissions (optional) */
  setBy?: string;
}

/**
 * Result of a permission check for a tool.
 */
export interface PermissionCheckResult {
  /** Tool name that was checked */
  tool: string;
  /** Zone classification of the tool */
  zone: ToolZone;
  /** Whether zone came from default or user override */
  source: "default" | "user_override";
  /** Whether the tool is allowed to execute */
  allowed: boolean;
  /** Whether --force flag is required for execution */
  requiresForce: boolean;
  /** Message explaining the permission status */
  message?: string;
}

// ============================================================================
// Default Zone Assignments
// ============================================================================

/**
 * Default zone assignments for CBrowser tools.
 * Conservative by default - unknown tools are classified as YELLOW.
 */
export const DEFAULT_ZONES: Record<string, ToolZone> = {
  // =========================================================================
  // GREEN - Read-only, always safe
  // =========================================================================
  navigate: "green",
  screenshot: "green",
  extract: "green",
  status: "green",
  list_sessions: "green",
  list_baselines: "green",
  list_cognitive_personas: "green",
  list_influence_patterns: "green",
  persona_traits_list: "green",
  persona_values_lookup: "green",
  persona_trait_lookup: "green",
  visual_baseline: "green",
  heal_stats: "green",
  stealth_status: "green",
  stealth_check: "green",
  browser_health: "green",
  perf_baseline: "green",
  ab_comparison: "green",
  coverage_map: "green",
  compare_personas_init: "green",
  compare_personas_complete: "green",
  competitive_benchmark: "green",
  cross_browser_diff: "green",
  agent_ready_audit: "green",
  empathy_audit: "green",
  api_key_status: "green",
  get_api_key_prompt: "green",
  marketing_discover_status: "green",
  marketing_personas_list: "green",

  // =========================================================================
  // YELLOW - Interactive but safe
  // =========================================================================
  click: "yellow",
  hover: "yellow",
  scroll: "yellow",
  assert: "yellow",
  analyze_page: "yellow",
  find_element_by_intent: "yellow",
  dismiss_overlay: "yellow",
  compare_personas: "yellow",
  cloudflare_detect: "yellow",
  cloudflare_wait: "yellow",
  persona_category_guidance: "yellow",
  persona_questionnaire_get: "yellow",
  load_session: "yellow",
  visual_regression: "yellow",
  perf_regression: "yellow",
  responsive_test: "yellow",
  cross_browser_test: "yellow",

  // =========================================================================
  // ORANGE - State-modifying
  // =========================================================================
  fill: "orange",
  smart_click: "orange",
  save_session: "orange",
  delete_session: "orange",
  reset_browser: "orange",
  browser_recover: "orange",
  persona_create_start: "orange",
  persona_create_submit_traits: "orange",
  persona_create_from_description: "orange",
  persona_create_questionnaire_start: "orange",
  persona_create_questionnaire_answer: "orange",
  persona_questionnaire_build: "orange",
  persona_create_cancel: "orange",
  cognitive_journey_init: "orange",
  cognitive_journey_update_state: "orange",
  nl_test_inline: "orange",
  nl_test_file: "orange",
  generate_tests: "orange",
  repair_test: "orange",
  detect_flaky_tests: "orange",
  hunt_bugs: "orange",
  marketing_audience_discover: "orange",
  marketing_campaign_create: "orange",
  marketing_campaign_run: "orange",
  marketing_campaign_report_result: "orange",
  marketing_compete: "orange",
  marketing_funnel_analyze: "orange",
  marketing_influence_matrix: "orange",
  marketing_lever_analysis: "orange",

  // =========================================================================
  // RED - Sensitive/Autonomous (requires --force)
  // =========================================================================
  cognitive_journey_autonomous: "red",
  stealth_enable: "red",
  stealth_disable: "red",
  stealth_diagnose: "red",
  chaos_test: "red",
  set_api_key: "red",
  clear_api_key: "red",
  ask_user: "red", // Can be used for social engineering
};

// Valid zone values for validation
const VALID_ZONES = new Set<ToolZone>(["green", "yellow", "orange", "red", "black"]);

// ============================================================================
// File Path Utilities
// ============================================================================

/**
 * Get the path to the tool permissions file.
 */
function getPermissionsPath(): string {
  const dataDir = process.env.CBROWSER_DATA_DIR || join(homedir(), ".cbrowser");
  return join(dataDir, "tool-permissions.json");
}

/**
 * Ensure the data directory exists.
 */
function ensureDataDir(): void {
  const dataDir = process.env.CBROWSER_DATA_DIR || join(homedir(), ".cbrowser");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

// ============================================================================
// Configuration Functions
// ============================================================================

/**
 * Load tool permissions from file.
 *
 * @returns The permission config, or null if no file exists or file is invalid
 */
export function loadToolPermissions(): ToolPermissionConfig | null {
  const path = getPermissionsPath();

  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, "utf-8");
    if (!content.trim()) {
      return null;
    }
    const config = JSON.parse(content) as ToolPermissionConfig;

    // Validate the structure
    if (!config.toolPermissions || typeof config.toolPermissions !== "object") {
      return null;
    }

    return config;
  } catch {
    return null;
  }
}

/**
 * Save tool permissions to file.
 *
 * @param config The permission config to save
 */
export function saveToolPermissions(config: ToolPermissionConfig): void {
  ensureDataDir();
  const path = getPermissionsPath();
  writeFileSync(path, JSON.stringify(config, null, 2));
}

/**
 * Set the zone for a specific tool.
 * Creates the permission file if it doesn't exist.
 *
 * @param tool The tool name
 * @param zone The zone to assign
 */
export function setToolZone(tool: string, zone: ToolZone): void {
  let config = loadToolPermissions();

  if (!config) {
    config = {
      toolPermissions: {},
      lastUpdated: new Date().toISOString(),
    };
  }

  config.toolPermissions[tool] = zone;
  config.lastUpdated = new Date().toISOString();

  saveToolPermissions(config);
}

/**
 * Get the zone for a tool.
 * Returns user override if set, otherwise returns default zone.
 * Unknown tools default to YELLOW (conservative).
 *
 * @param tool The tool name
 * @returns The zone classification
 */
export function getToolZone(tool: string): ToolZone {
  // Check for user override first
  const config = loadToolPermissions();
  if (config?.toolPermissions[tool]) {
    const userZone = config.toolPermissions[tool];
    // Validate the zone is valid
    if (VALID_ZONES.has(userZone)) {
      return userZone;
    }
  }

  // Fall back to default
  return DEFAULT_ZONES[tool] || "yellow";
}

/**
 * Check if a tool is allowed to execute based on its zone.
 *
 * @param tool The tool name
 * @param forceFlag Whether the --force flag was provided
 * @returns Permission check result
 */
export function checkToolPermission(tool: string, forceFlag = false): PermissionCheckResult {
  const config = loadToolPermissions();
  const hasOverride = config?.toolPermissions[tool] && VALID_ZONES.has(config.toolPermissions[tool]);
  const zone = getToolZone(tool);
  const source: "default" | "user_override" = hasOverride ? "user_override" : "default";

  const result: PermissionCheckResult = {
    tool,
    zone,
    source,
    allowed: false,
    requiresForce: false,
  };

  switch (zone) {
    case "green":
      // Always allowed, no restrictions
      result.allowed = true;
      result.requiresForce = false;
      break;

    case "yellow":
      // Allowed without confirmation
      result.allowed = true;
      result.requiresForce = false;
      break;

    case "orange":
      // Allowed with warning
      result.allowed = true;
      result.requiresForce = false;
      result.message = `Tool '${tool}' is state-modifying (orange zone). Proceeding with caution.`;
      break;

    case "red":
      // Requires --force flag
      result.requiresForce = true;
      if (forceFlag) {
        result.allowed = true;
        result.message = `Tool '${tool}' is sensitive (red zone). Executing with --force override.`;
      } else {
        result.allowed = false;
        result.message = `Tool '${tool}' is classified as RED (sensitive/autonomous). Use --force flag to execute.`;
      }
      break;

    case "black":
      // Always blocked, even with --force
      result.allowed = false;
      result.requiresForce = false;
      result.message = `Tool '${tool}' is prohibited (black zone). This action is not allowed.`;
      break;
  }

  return result;
}

/**
 * List all tool zones (both defaults and overrides).
 *
 * @returns Map of tool names to zone info
 */
export function listToolZones(): Record<string, { zone: ToolZone; source: "default" | "user_override" }> {
  const result: Record<string, { zone: ToolZone; source: "default" | "user_override" }> = {};

  // Add all default zones
  for (const [tool, zone] of Object.entries(DEFAULT_ZONES)) {
    result[tool] = { zone, source: "default" };
  }

  // Overlay user overrides
  const config = loadToolPermissions();
  if (config?.toolPermissions) {
    for (const [tool, zone] of Object.entries(config.toolPermissions)) {
      if (VALID_ZONES.has(zone)) {
        result[tool] = { zone, source: "user_override" };
      }
    }
  }

  return result;
}

/**
 * Reset all tool zones to defaults.
 * Removes the permission file entirely.
 */
export function resetToolZones(): void {
  const path = getPermissionsPath();
  if (existsSync(path)) {
    rmSync(path);
  }
}
