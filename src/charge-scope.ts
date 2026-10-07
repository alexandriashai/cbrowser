/**
 * Per-request charge scope: "this request was billed for this tool".
 *
 * THE PROBLEM
 *
 * The hosted MCP server deducts credits BEFORE a tool runs (gate-before-charge, in
 * mcp-server-remote.ts). If the tool then fails, the caller has paid for nothing.
 * The CMS can refund - `POST /api/credits/refund` - but the place that knows a
 * charge happened (the HTTP deduct, before dispatch) is not the place that knows
 * the tool failed (the tier-gate wrapper, after the handler returns). Between them
 * sits `transport.handleRequest`, which streams the result straight to the client;
 * the deduct site never sees it.
 *
 * So the charge is carried from one to the other through the async context of the
 * request - the same mechanism, and for the same reason, as persona-scope.ts.
 *
 * WHY NOT A MODULE VARIABLE
 *
 * tier-gate.ts already keeps the billing key in one (`currentKeyHash`, set by
 * `setActiveKeyHash`) and its autosave reads it. Under two overlapping requests that
 * global holds whichever key was set last. For an autosave that mislabels a dashboard
 * row. For a refund it would CREDIT THE WRONG ACCOUNT. The refund must therefore read
 * the key from here and never from the global. `AsyncLocalStorage` binds the value to
 * one request's async context, so overlapping requests each see their own.
 *
 * WHAT IS DELIBERATELY NOT IN SCOPE
 *
 * A charge scope is entered ONLY when a deduct actually succeeded (`allowed === true`
 * and a non-zero cost). The fail-open paths - CMS unreachable, a non-2xx status, a
 * response without `allowed` - ran the tool UNBILLED, so there is nothing to refund,
 * and entering a scope there would give the caller money they never paid.
 *
 * @since 2026-09-17
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export interface ChargeScope {
  /** Hash of the API key that was debited. Identifies the account to refund. */
  keyHash: string;
  /** The tool the deduct was for. A refund only fires for this exact tool. */
  tool: string;
  /**
   * Unique per charged call. The CMS dedupes refunds on it, so a retried or
   * duplicated refund request can never credit the account twice.
   * [A-Za-z0-9-] only - the CMS matches prior refunds with SQL LIKE, where
   * `%` and `_` are wildcards.
   */
  idempotencyKey: string;
  /** Set once a refund has been attempted, so one charge yields at most one attempt. */
  refundAttempted: boolean;
}

const storage = new AsyncLocalStorage<ChargeScope>();

/** Run `fn` in a context that records a successful charge for `tool`. */
export function withChargeScope<T>(keyHash: string, tool: string, fn: () => T): T {
  return storage.run(
    { keyHash, tool, idempotencyKey: randomUUID(), refundAttempted: false },
    fn,
  );
}

/** The current request's charge, or undefined when this request was not billed. */
export function currentCharge(): ChargeScope | undefined {
  return storage.getStore();
}
