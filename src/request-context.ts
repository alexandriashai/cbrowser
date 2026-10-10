/**
 * Per-request caller identity for the hosted server: key hash, pricing tier and
 * raw API key.
 *
 * THE DEFECT THIS REPLACES
 *
 * The hosted server kept all three in module variables, assigned while a
 * request's MCP server was being built and read when its tool ran:
 * `currentKeyHash` and `currentTier` in mcp-tools/tier-gate.ts, `_sessionApiKey`
 * in mcp-tools/base/cognitive-tools.ts. Between the assignment and the read sit
 * several awaits (body read, redirect resolution, the CMS credit deduct), so an
 * overlapping request from another account overwrote them and this request read
 * the other caller's values: the usage log, the tool-result autosave and
 * ask_cbrowser were filed under the other key hash; every CMS call made with
 * the raw key used the other caller's key, which is a cross-tenant read for the
 * custom-persona fetches (list_cognitive_personas, cognitive_journey_init,
 * attention_analysis, the comparison and audit tools) and a cross-tenant WRITE
 * for persona_update, persona_delete, persona creation and the visual-report
 * saves; and the gate-before-charge check and the paid model-call entitlement
 * (capture, attention_analysis) judged one account by another's plan. Same
 * defect class as billing identity (resolveRequestKeyHash, 2026-07-26) and
 * persona scope (persona-scope.ts, 2026-08-01); this closes the three variables
 * those fixes left behind. (sec-identity, 2026-10-10)
 *
 * HOW IT IS USED
 *
 * mcp-server-remote.ts enters one context per HTTP request with
 * `withRequestIdentity` (at createServer), so building the request's MCP server
 * and dispatching its tool call both run inside it, and the /mcp branch sets
 * the caller there. The existing setters (setActiveKeyHash, setActiveTier, setSessionApiKey)
 * write into the active context when there is one and into their module
 * variable when there is not; the getters read the same way. So code that sets
 * the tier during registration (registerAllPublicTools, the enterprise demo's
 * registrar) changes only its own request.
 *
 * DEFAULT BEHAVIOUR IS UNCHANGED. With no context entered the setters and
 * getters use the module variables exactly as before, so the CLI, the stdio
 * server and every local install are unaffected.
 *
 * @since 2026-10-10
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { PricingTier } from "./mcp-tools/tool-categories.js";

export interface RequestIdentity {
  /** SHA-256 hex of the caller's account key; null when unauthenticated or not an account key. */
  keyHash: string | null;
  /** Pricing tier this request is gated at. null = ungated (self-hosted). */
  tier: PricingTier | null;
  /** The raw key the caller presented, for account-scoped CMS reads. */
  apiKey: string | undefined;
}

const storage = new AsyncLocalStorage<RequestIdentity>();

/**
 * Run `fn` with `identity` as this request's caller. Everything awaited inside
 * sees it, and nothing outside does. The object is copied, so a setter called
 * inside changes this request's view and never the caller's argument.
 */
export function withRequestIdentity<T>(identity: RequestIdentity, fn: () => T): T {
  return storage.run({ ...identity }, fn);
}

/** The active request's identity, or undefined outside any request (CLI, stdio, tests). */
export function currentRequestIdentity(): RequestIdentity | undefined {
  return storage.getStore();
}
