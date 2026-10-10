/**
 * Tier Gating for CBrowser Hosted MCP Server
 *
 * Wraps tool registration so gated tools return upgrade prompts
 * instead of executing. Tools still appear in the tool list so
 * users can discover what's available.
 *
 * Self-hosted (no tier set) = all tools ungated.
 * Hosted demo (free tier) = core browser + testing + sessions only.
 *
 * @since v18.43.0
 */

import { type PricingTier, getToolPricingTier, tierHasAccess } from "./tool-categories.js";
import { saveToolResult } from "./tool-result-saver.js";
import { refundCharge } from "./credit-refund.js";
import { currentCharge } from "../charge-scope.js";

/** Tools that should NOT auto-save results (no analytics value) */
const SKIP_AUTOSAVE = new Set([
  "navigate", "click", "smart_click", "fill", "scroll", "dismiss_overlay",
  "hover", "type_text", "press_key", "handle_dialog", "upload_file", "drag",
  "screenshot", "extract",
  "status", "browser_health", "browser_recover", "reset_browser", "manage_tabs",
  "save_session", "load_session", "list_sessions", "delete_session",
  "manage_cookies", "manage_storage", "evaluate_script",
  "get_console_messages", "get_network_requests",
  "list_cognitive_personas", "list_baselines", "persona_manager",
  "heal_stats",
  "persona_values_list", "persona_values_lookup", "list_influence_patterns",
  "persona_questionnaire_get", "persona_questionnaire_build",
  "persona_trait_lookup", "persona_category_guidance",
  "marketing_personas_list",
  "site_profile_list", "site_profile_delete", "site_profile_status",
  "site_model_status",
]);

/** The current user tier for this server session */
let currentTier: PricingTier | null = null;

/** The current session's API key hash (for usage logging) */
let currentKeyHash: string | null = null;

/** Set the current API key hash for usage tracking */
export function setActiveKeyHash(hash: string | null): void {
  currentKeyHash = hash;
}

/** Get the current API key hash */
export function getActiveKeyHash(): string | null {
  return currentKeyHash;
}

/**
 * Log a tool call to the CMS usage endpoint (fire and forget).
 *
 * `/api/accounts/log-usage` is an INTERNAL endpoint and rejects any request without
 * `X-Internal-Secret`. This call omitted it, so every log POST 403'd and the failure
 * was swallowed by a bare `.catch(() => {})`: `api_usage` recorded nothing between
 * 2026-04-25 and 2026-07-20 while tool calls kept succeeding and billing kept working.
 * Same defect class as the credits/deduct bug fixed 2026-07-19 — this was its sibling.
 *
 * Still fire-and-forget, because analytics must never fail a paid tool call. But a
 * failure is now logged rather than discarded: the silent catch is what hid this.
 */
function logToolCall(toolName: string): void {
  if (!currentKeyHash) return;
  const cmsUrl = process.env.CMS_URL || "http://localhost:3200";
  fetch(`${cmsUrl}/api/accounts/log-usage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": process.env.CMS_INTERNAL_SECRET || "",
    },
    body: JSON.stringify({ keyHash: currentKeyHash, toolName }),
  })
    .then((res) => {
      if (!res.ok) console.warn(`[tier-gate] usage log rejected for ${toolName}: HTTP ${res.status}`);
    })
    .catch((err) => {
      console.warn(`[tier-gate] usage log failed for ${toolName}: ${String(err)}`);
    });
}

/** Set the active pricing tier. null = self-hosted (no gating). */
export function setActiveTier(tier: PricingTier | null): void {
  currentTier = tier;
}

/** Get the active pricing tier. null = ungated. */
export function getActiveTier(): PricingTier | null {
  return currentTier;
}

/** Check if a tool is accessible at the current tier */
export function isToolAccessible(toolName: string): boolean {
  if (currentTier === null) return true; // Self-hosted: no gating
  const required = getToolPricingTier(toolName);
  return tierHasAccess(currentTier, required);
}

/**
 * Generate upgrade prompt for a gated tool.
 *
 * isError: the tool did not run, so this is a refusal, and a client must be
 * able to tell it from a result without parsing the text. It went out
 * without the flag, so an agent read "Upgrade Required" as a completed
 * empathy_audit. Setting it refunds nothing: both callers refuse before the
 * deduct (mcp-server-remote's gate-before-charge) or outside the refund
 * wrapper (the gated handler below). (2026-10-09)
 */
export function upgradePrompt(toolName: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  const required = getToolPricingTier(toolName);
  const tierLabel = required.charAt(0).toUpperCase() + required.slice(1);
  const userLabel = currentTier ? currentTier.charAt(0).toUpperCase() + currentTier.slice(1) : "Free";

  return {
    isError: true,
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        error: "Upgrade Required",
        tool: toolName,
        currentTier: currentTier || "free",
        requiredTier: required,
        message: `⚡ ${toolName} requires CBrowser ${tierLabel}.\n\nYou're on the ${userLabel} tier. Upgrade to unlock ${toolName} and ${required === 'pro' ? '60+ cognitive analysis tools' : 'marketing suite, stealth, and web security'}.`,
        upgrade: "https://cbrowser.ai/pricing",
        features: required === 'pro'
          ? [
            "Cognitive Transport Chain (layered effort analysis)",
            "Attention heatmaps and visual cognitive stories",
            "11 disability persona empathy audits",
            "AI Friendliness Suite (agent-ready, benchmark, remediation)",
            "Custom persona creation (26 traits)",
            "Visual regression and cross-browser testing",
            "Site knowledge and persistent models",
            "Competitive UX benchmarking",
            "Unlimited MCP access",
          ]
          : [
            "Everything in Pro, plus:",
            "Marketing campaign suite (8 buyer personas)",
            "Influence matrix and lever analysis",
            "Constitutional stealth for authorized testing",
            "Geo proxy (12 regions)",
            "Web security scanning",
            "Autonomous cognitive journeys",
            "Self-hosted deployment support",
          ],
      }, null, 2),
    }],
  };
}

/**
 * Get the description prefix for a tool based on its pricing tier.
 * Returns "" for free tools, "[Pro] " or "[Enterprise] " for gated ones.
 */
export function tierPrefix(toolName: string): string {
  if (currentTier === null) return ""; // Self-hosted: no prefixes
  const required = getToolPricingTier(toolName);
  if (required === "free") return "";
  if (required === "pro") return "[Pro] ";
  return "[Enterprise] ";
}

/**
 * Create a proxy around an MCP server that intercepts registerTool calls
 * and wraps handlers with tier gating. Gated tools still register (visible
 * in tool list) but return upgrade prompts when called.
 *
 * If no tier is set (self-hosted), returns the server unchanged.
 */
export function createGatedServer(server: unknown): unknown {
  if (currentTier === null) return server; // Self-hosted: no gating

  const srv = server as {
    registerTool: (name: string, config: Record<string, unknown>, handler: (...args: unknown[]) => unknown) => void;
  };
  const originalRegisterTool = srv.registerTool.bind(srv);

  srv.registerTool = (name: string, config: Record<string, unknown>, handler: (...args: unknown[]) => unknown) => {
    if (isToolAccessible(name)) {
      // User has access — wrap handler with usage logging + auto-save
      const prefix = tierPrefix(name);
      if (prefix && typeof config.description === "string") {
        config.description = prefix + config.description;
      }
      const wrappedHandler = async (...args: unknown[]) => {
        logToolCall(name);
        const startTime = Date.now();
        const result = await (handler as (...a: unknown[]) => Promise<unknown>)(...args);
        const durationMs = Date.now() - startTime;

        // isError is the MCP protocol's own failure flag, and the ONLY thing
        // that triggers a refund below. Not "the JSON has an error key" — that
        // heuristic would refund a failed nl_test/repair_test run whose tool
        // DID drive a real browser and did billable work. (P-09, 2026-09-17)
        const isError = (result as { isError?: boolean } | undefined)?.isError === true;

        // Bill only what ran: a call this request was charged for, that came
        // back isError, gets refunded exactly once. currentCharge() is only
        // non-undefined when mcp-server-remote.ts's deduct actually succeeded
        // for THIS request — an unbilled call (no key, fail-open) has nothing
        // to refund. The `.tool` check guards against a scope somehow
        // outliving its request and being read by an unrelated tool call.
        if (isError) {
          const charge = currentCharge();
          if (charge && charge.tool === name && !charge.refundAttempted) {
            charge.refundAttempted = true;
            await refundCharge({ keyHash: charge.keyHash, tool: charge.tool, idempotencyKey: charge.idempotencyKey });
          }
        }

        // Auto-save tool result (fire-and-forget). Skipped on isError (F-L13):
        // the tier-gate autosave used to post the error body itself as though
        // it were a completed result, so a customer's dashboard showed a
        // "result" for a call that failed and was just refunded above.
        try {
          const toolArgs = args[0] as Record<string, unknown> | undefined;
          const targetUrl = (toolArgs?.url || (Array.isArray(toolArgs?.sites) ? (toolArgs.sites as string[])[0] : null)) as string | null;
          if (targetUrl && !isError && !SKIP_AUTOSAVE.has(name)) {
            const resultContent = result as { content?: Array<{ type: string; text?: string }> };
            let resultData: Record<string, unknown> = {};
            try {
              const text = resultContent?.content?.[0]?.text;
              if (text) resultData = JSON.parse(text);
            } catch {}
            saveToolResult({
              apiKey: currentKeyHash || undefined,
              toolName: name,
              targetUrl,
              result: resultData,
              persona: (toolArgs?.persona || (Array.isArray(toolArgs?.disabilities) ? (toolArgs.disabilities as string[])[0] : undefined)) as string | undefined,
              scope: toolArgs?.scope as string | undefined,
              durationMs,
            });
          }
        } catch {}
        return result;
      };
      originalRegisterTool(name, config, wrappedHandler);
    } else {
      // User doesn't have access — register with upgrade handler
      const required = getToolPricingTier(name);
      const tierLabel = required.charAt(0).toUpperCase() + required.slice(1);
      const desc = typeof config.description === "string" ? config.description : "";
      originalRegisterTool(
        name,
        { ...config, description: `[${tierLabel}] ${desc}` },
        () => upgradePrompt(name),
      );
    }
  };

  return srv;
}
