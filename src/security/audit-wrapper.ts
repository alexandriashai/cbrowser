/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Tool Invocation Audit Wrapper for CBrowser MCP Server
 *
 * Provides comprehensive audit logging for all MCP tool invocations.
 * Captures tool name, parameters (with sensitive value redaction),
 * timing, results, and links to triggered actions.
 *
 * Usage:
 *   import { wrapToolHandler, createAuditContext } from "./security/audit-wrapper.js";
 *
 *   const auditContext = createAuditContext();
 *   const wrappedHandler = wrapToolHandler(originalHandler, "tool_name", auditContext);
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ActionZone, ToolInvocationEntry } from "../types.js";

// Sensitive parameter patterns - values matching these will be redacted
const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /key/i,
  /credential/i,
  /auth/i,
  /apikey/i,
  /api_key/i,
  /bearer/i,
  /private/i,
  /passphrase/i,
  /pin/i,
  /ssn/i,
  /credit/i,
  /card/i,
];

// Tool zone classifications for security audit categorization
// Green: Read-only, safe operations
// Yellow: Potentially modifying state
// Red: Sensitive operations (credentials, payments)
// Black: Should not happen in normal operation
const TOOL_ZONES: Record<string, ActionZone> = {
  // Green zone - read-only operations
  screenshot: "green",
  status: "green",
  extract: "green",
  analyze_page: "green",
  agent_ready_audit: "green",
  empathy_audit: "green",
  list_sessions: "green",
  list_baselines: "green",
  list_cognitive_personas: "green",
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

  // Yellow zone - state-modifying operations
  navigate: "yellow",
  click: "yellow",
  smart_click: "yellow",
  fill: "yellow",
  scroll: "yellow",
  hover: "yellow",
  assert: "yellow",
  save_session: "yellow",
  load_session: "yellow",
  delete_session: "yellow",
  reset_browser: "yellow",
  browser_recover: "yellow",
  dismiss_overlay: "yellow",
  stealth_enable: "yellow",
  stealth_disable: "yellow",
  stealth_diagnose: "yellow",
  cognitive_journey_init: "yellow",
  cognitive_journey_update_state: "yellow",
  cognitive_journey_autonomous: "yellow",
  find_element_by_intent: "yellow",
  nl_test_inline: "yellow",
  nl_test_file: "yellow",
  generate_tests: "yellow",
  repair_test: "yellow",
  detect_flaky_tests: "yellow",
  chaos_test: "yellow",
  responsive_test: "yellow",
  cross_browser_test: "yellow",
  visual_regression: "yellow",
  perf_regression: "yellow",
  hunt_bugs: "yellow",

  // Persona creation - yellow (creates persistent data)
  persona_create_start: "yellow",
  persona_create_submit_traits: "yellow",
  persona_create_from_description: "yellow",
  persona_create_questionnaire_start: "yellow",
  persona_create_questionnaire_answer: "yellow",
  persona_questionnaire_build: "yellow",
  persona_questionnaire_get: "yellow",
  persona_category_guidance: "yellow",
  persona_create_cancel: "yellow",
  compare_personas: "yellow",

  // Red zone - sensitive operations
  set_api_key: "red",
  clear_api_key: "red",
  ask_user: "red", // Can be used for phishing

  // Marketing tools - yellow (external integrations)
  marketing_audience_discover: "yellow",
  marketing_campaign_create: "yellow",
  marketing_campaign_run: "yellow",
  marketing_campaign_report_result: "yellow",
  marketing_compete: "yellow",
  marketing_discover_status: "yellow",
  marketing_funnel_analyze: "yellow",
  marketing_influence_matrix: "yellow",
  marketing_lever_analysis: "yellow",
  marketing_personas_list: "yellow",
  list_influence_patterns: "yellow",

  // Cloudflare/anti-detection - yellow
  cloudflare_detect: "yellow",
  cloudflare_wait: "yellow",
};

/**
 * Audit context for tracking session and request state
 */
export interface AuditContext {
  /** Session ID for this MCP server instance */
  sessionId: string;
  /** Directory for audit log files */
  auditDir: string;
  /** Whether audit logging is enabled */
  enabled: boolean;
  /** Whether to include full stack traces on errors */
  includeStackTraces: boolean;
  /** Actions triggered tracking (for linking) */
  actionsTriggered: Map<string, string[]>;
}

/**
 * Create an audit context for tool wrapping
 *
 * @param options Optional configuration
 * @returns AuditContext instance
 */
export function createAuditContext(options?: {
  sessionId?: string;
  auditDir?: string;
  enabled?: boolean;
  includeStackTraces?: boolean;
}): AuditContext {
  const dataDir = process.env.CBROWSER_DATA_DIR || join(homedir(), ".cbrowser");
  const auditDir = options?.auditDir || join(dataDir, "audit");

  // Ensure audit directory exists
  if (!existsSync(auditDir)) {
    mkdirSync(auditDir, { recursive: true });
  }

  return {
    sessionId: options?.sessionId || randomUUID().slice(0, 8),
    auditDir,
    enabled: options?.enabled ?? (process.env.CBROWSER_AUDIT_ENABLED !== "false"),
    includeStackTraces: options?.includeStackTraces ?? false,
    actionsTriggered: new Map(),
  };
}

/**
 * Redact sensitive values from parameters
 *
 * @param params The parameters object to redact
 * @returns Copy of params with sensitive values replaced with "[REDACTED]"
 */
export function redactSensitiveParams(
  params: Record<string, unknown>
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    // Check if key matches sensitive pattern
    const isSensitive = SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));

    // Process arrays and objects recursively (even if key is sensitive)
    // This allows nested structures to have their own sensitive fields redacted
    if (Array.isArray(value)) {
      // Handle arrays - check each element recursively
      redacted[key] = value.map((item) => {
        if (typeof item === "object" && item !== null) {
          return redactSensitiveParams(item as Record<string, unknown>);
        }
        // Redact primitive values in arrays if parent key is sensitive
        return isSensitive ? "[REDACTED]" : item;
      });
    } else if (typeof value === "object" && value !== null) {
      // Recursively redact nested objects
      redacted[key] = redactSensitiveParams(value as Record<string, unknown>);
    } else if (isSensitive && value !== undefined && value !== null) {
      // Redact primitive sensitive values
      redacted[key] = "[REDACTED]";
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Get the zone classification for a tool
 *
 * @param toolName The name of the tool
 * @returns ActionZone classification
 */
export function getToolZone(toolName: string): ActionZone {
  return TOOL_ZONES[toolName] || "yellow"; // Default to yellow for unknown tools
}

/**
 * Get the audit log file path for the current date
 *
 * @param auditDir The audit directory path
 * @returns Path to the tool invocations audit file
 */
function getAuditFilePath(auditDir: string): string {
  const date = new Date().toISOString().split("T")[0];
  return join(auditDir, `tool-invocations-${date}.json`);
}

/**
 * Write an audit entry to the log file
 *
 * @param entry The audit entry to write
 * @param auditDir The audit directory path
 */
function writeAuditEntry(entry: ToolInvocationEntry, auditDir: string): void {
  const filePath = getAuditFilePath(auditDir);

  let entries: ToolInvocationEntry[] = [];
  if (existsSync(filePath)) {
    try {
      entries = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      // If file is corrupted, start fresh
      entries = [];
    }
  }

  entries.push(entry);
  writeFileSync(filePath, JSON.stringify(entries, null, 2));
}

/**
 * MCP tool handler type - matches the server.tool callback signature
 */
export type ToolHandler<TParams extends Record<string, unknown> = Record<string, unknown>> = (
  params: TParams
) => Promise<{ content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> }>;

/**
 * Wrap a tool handler with audit logging
 *
 * This wraps any MCP tool handler to automatically:
 * - Generate a unique request ID
 * - Log the tool name and (redacted) parameters
 * - Time the execution
 * - Capture success/failure status
 * - Write to the audit log
 *
 * @param handler The original tool handler function
 * @param toolName The name of the tool being wrapped
 * @param context The audit context
 * @returns A wrapped handler with identical signature
 *
 * @example
 * ```typescript
 * const context = createAuditContext();
 *
 * server.tool(
 *   "navigate",
 *   "Navigate to a URL",
 *   { url: z.string().url() },
 *   wrapToolHandler(
 *     async ({ url }) => {
 *       await browser.navigate(url);
 *       return { content: [{ type: "text", text: "Navigated" }] };
 *     },
 *     "navigate",
 *     context
 *   )
 * );
 * ```
 */
export function wrapToolHandler<TParams extends Record<string, unknown>>(
  handler: ToolHandler<TParams>,
  toolName: string,
  context: AuditContext
): ToolHandler<TParams> {
  return async (params: TParams) => {
    // Skip logging if disabled
    if (!context.enabled) {
      return handler(params);
    }

    const requestId = randomUUID();
    const startTime = Date.now();
    const zone = getToolZone(toolName);

    // Initialize actions tracking for this request
    context.actionsTriggered.set(requestId, []);

    let result: "success" | "failure" | "blocked" = "success";
    let error: string | undefined;

    try {
      const response = await handler(params);
      return response;
    } catch (err) {
      result = "failure";
      error = err instanceof Error ? err.message : String(err);
      if (context.includeStackTraces && err instanceof Error && err.stack) {
        error = `${error}\n${err.stack}`;
      }
      throw err;
    } finally {
      const duration = Date.now() - startTime;
      const actionsTriggered = context.actionsTriggered.get(requestId) || [];
      context.actionsTriggered.delete(requestId);

      const entry: ToolInvocationEntry = {
        timestamp: new Date().toISOString(),
        sessionId: context.sessionId,
        requestId,
        tool: toolName,
        parameters: redactSensitiveParams(params as Record<string, unknown>),
        zone,
        result,
        duration,
        error,
        actionsTriggered,
      };

      try {
        writeAuditEntry(entry, context.auditDir);
      } catch (writeErr) {
        // Don't let audit logging failures break tool execution
        console.error(
          `[CBrowser Audit] Failed to write audit entry: ${
            writeErr instanceof Error ? writeErr.message : String(writeErr)
          }`
        );
      }
    }
  };
}

/**
 * Link an action to the current tool invocation
 *
 * Call this from within browser actions to link them to the triggering tool call.
 *
 * @param context The audit context
 * @param requestId The request ID of the tool invocation
 * @param actionId The ID of the triggered action (from AuditEntry)
 */
export function linkActionToInvocation(
  context: AuditContext,
  requestId: string,
  actionId: string
): void {
  const actions = context.actionsTriggered.get(requestId);
  if (actions) {
    actions.push(actionId);
  }
}

/**
 * Create a wrapper factory for a specific audit context
 *
 * This is useful when registering many tools with the same context.
 *
 * @param context The audit context
 * @returns A function that wraps handlers with the given context
 *
 * @example
 * ```typescript
 * const context = createAuditContext();
 * const wrap = createWrapperFactory(context);
 *
 * server.tool("navigate", "...", schema, wrap(navigateHandler, "navigate"));
 * server.tool("click", "...", schema, wrap(clickHandler, "click"));
 * ```
 */
export function createWrapperFactory(context: AuditContext): <TParams extends Record<string, unknown>>(
  handler: ToolHandler<TParams>,
  toolName: string
) => ToolHandler<TParams> {
  return <TParams extends Record<string, unknown>>(
    handler: ToolHandler<TParams>,
    toolName: string
  ) => wrapToolHandler(handler, toolName, context);
}

/**
 * Read audit entries for a specific date
 *
 * @param auditDir The audit directory path
 * @param date ISO date string (YYYY-MM-DD) or Date object
 * @returns Array of tool invocation entries
 */
export function readAuditEntries(
  auditDir: string,
  date?: string | Date
): ToolInvocationEntry[] {
  const dateStr = date
    ? typeof date === "string"
      ? date
      : date.toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  const filePath = join(auditDir, `tool-invocations-${dateStr}.json`);

  if (!existsSync(filePath)) {
    return [];
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return [];
  }
}

/**
 * Get audit statistics for a date range
 *
 * @param auditDir The audit directory path
 * @param startDate Start date (inclusive)
 * @param endDate End date (inclusive), defaults to today
 * @returns Audit statistics
 */
export function getAuditStats(
  auditDir: string,
  startDate?: Date,
  endDate?: Date
): {
  totalInvocations: number;
  successCount: number;
  failureCount: number;
  blockedCount: number;
  byTool: Record<string, number>;
  byZone: Record<ActionZone, number>;
  avgDuration: number;
  sessions: string[];
} {
  const end = endDate || new Date();
  const start = startDate || new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000); // Default to last 7 days

  const stats = {
    totalInvocations: 0,
    successCount: 0,
    failureCount: 0,
    blockedCount: 0,
    byTool: {} as Record<string, number>,
    byZone: { green: 0, yellow: 0, red: 0, black: 0 } as Record<ActionZone, number>,
    avgDuration: 0,
    sessions: [] as string[],
  };

  let totalDuration = 0;
  const sessionsSet = new Set<string>();

  // Iterate through dates in range
  const current = new Date(start);
  while (current <= end) {
    const entries = readAuditEntries(auditDir, current);

    for (const entry of entries) {
      stats.totalInvocations++;
      totalDuration += entry.duration;
      sessionsSet.add(entry.sessionId);

      // Count by result
      switch (entry.result) {
        case "success":
          stats.successCount++;
          break;
        case "failure":
          stats.failureCount++;
          break;
        case "blocked":
          stats.blockedCount++;
          break;
      }

      // Count by tool
      stats.byTool[entry.tool] = (stats.byTool[entry.tool] || 0) + 1;

      // Count by zone
      stats.byZone[entry.zone]++;
    }

    current.setDate(current.getDate() + 1);
  }

  stats.avgDuration = stats.totalInvocations > 0
    ? Math.round(totalDuration / stats.totalInvocations)
    : 0;
  stats.sessions = Array.from(sessionsSet);

  return stats;
}
