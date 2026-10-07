/**
 * Refund a charged tool call whose handler reported failure.
 *
 * Sibling to tool-result-saver.ts's autosave call, but deliberately NOT
 * fire-and-forget: a missed refund is a customer overcharged, and this
 * codebase's own convention (the deduct FAIL-OPEN warnings in
 * mcp-server-remote.ts) is that a billing-adjacent failure must be loud, never
 * silent. The caller awaits this so a refund failure is logged before the
 * response returns, not raced against process shutdown.
 *
 * @since 2026-09-17 (P-09)
 */
export interface RefundParams {
  keyHash: string;
  tool: string;
  idempotencyKey: string;
}

/** Refund a previously-charged tool call. Logs, never throws. */
export async function refundCharge(params: RefundParams): Promise<void> {
  const cmsUrl = process.env.CMS_URL || "http://localhost:3200";
  const qs = new URLSearchParams({
    key_hash: params.keyHash,
    tool: params.tool,
    idempotency_key: params.idempotencyKey,
  });
  try {
    const res = await fetch(`${cmsUrl}/api/credits/refund?${qs}`, {
      method: "POST",
      headers: { "X-Internal-Secret": process.env.CMS_INTERNAL_SECRET || "" },
      // Same shape as the deduct call: a CMS that accepts the connection and
      // never answers must not hang the response indefinitely.
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      console.warn(`[Refund] FAILED: ${params.tool} — CMS returned HTTP ${res.status}`);
      return;
    }
    const data = await res.json() as { refunded: boolean; cost: number };
    if (data.refunded) {
      console.log(`[Refund] ${params.tool}: refunded ${data.cost} credit(s) (isError result)`);
    } else {
      // Idempotency hit (already refunded this exact call) or a free tool.
      // Either is expected, not a failure — logged at debug, not warn.
      console.debug(`[Refund] ${params.tool}: not refunded (already processed or free tool)`);
    }
  } catch (err) {
    // CMS unreachable — the customer stays charged. Loud, because a silent
    // failure here is indistinguishable from "nothing needed refunding".
    console.warn(`[Refund] FAILED: ${params.tool} — CMS unreachable (${String(err)})`);
  }
}
