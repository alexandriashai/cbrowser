/**
 * P-09: bill only what ran.
 *
 * The hosted server deducts BEFORE a tool runs. When the tool then reports
 * failure (isError: true), the tier-gate wrapper must refund that exact charge,
 * once. Everything else must NOT refund - a successful call, an unbilled call,
 * or a call whose charge was for a different tool.
 *
 * The CMS is never contacted: globalThis.fetch is replaced with a recorder, so
 * these tests cannot write a ledger row anywhere. (2026-09-17)
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { createGatedServer, setActiveTier, setActiveKeyHash } from "../src/mcp-tools/tier-gate.js";
import { withChargeScope, currentCharge } from "../src/charge-scope.js";

type Call = { url: string; method?: string; headers?: Record<string, string> };
let calls: Call[] = [];
const realFetch = globalThis.fetch;

beforeAll(() => {
  // Enterprise tier: every tool is accessible, so the wrapper (not the
  // upgrade-prompt substitute) is what gets registered.
  setActiveTier("enterprise");
  setActiveKeyHash("module-global-hash-must-not-be-used");
  process.env.CMS_URL = "http://cms.invalid";
  process.env.CMS_INTERNAL_SECRET = "test-secret";
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method, headers: init?.headers as Record<string, string> });
    return new Response(JSON.stringify({ refunded: true, cost: 2 }), { status: 200 });
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
  setActiveTier(null);
  setActiveKeyHash(null);
});

beforeEach(() => { calls = []; });

/** Register one handler through the gate and return the wrapped version. */
function gated(name: string, handler: (...a: unknown[]) => unknown) {
  let wrapped: ((...a: unknown[]) => Promise<unknown>) | undefined;
  const fake = { registerTool: (_n: string, _c: Record<string, unknown>, h: (...a: unknown[]) => Promise<unknown>) => { wrapped = h; } };
  (createGatedServer(fake) as typeof fake).registerTool(name, { description: "t" }, handler);
  if (!wrapped) throw new Error("gate did not register a handler");
  return wrapped;
}

const failed = () => ({ isError: true, content: [{ type: "text", text: JSON.stringify({ error: "page_blocked" }) }] });
const ok = () => ({ content: [{ type: "text", text: JSON.stringify({ score: 0.2 }) }] });
const refundCalls = () => calls.filter((c) => c.url.includes("/api/credits/refund"));
const saveCalls = () => calls.filter((c) => c.url.includes("/api/tool-results"));

describe("refund on isError (ISC-5)", () => {
  test("a charged call that returns isError is refunded exactly once", async () => {
    const h = gated("cognitive_effort", failed);
    await withChargeScope("hash-of-the-payer", "cognitive_effort", () => h({ url: "https://example.com" }));
    expect(refundCalls().length).toBe(1);
    const u = new URL(refundCalls()[0].url);
    expect(u.searchParams.get("tool")).toBe("cognitive_effort");
    expect(u.searchParams.get("key_hash")).toBe("hash-of-the-payer");
    expect(u.searchParams.get("idempotency_key")).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(refundCalls()[0].headers?.["X-Internal-Secret"]).toBe("test-secret");
  });

  test("the refund uses the REQUEST's key, never the module-global currentKeyHash", async () => {
    // Two overlapping requests would both read the global; only the scope is per-request.
    const h = gated("cognitive_effort", failed);
    await withChargeScope("request-scoped-hash", "cognitive_effort", () => h({}));
    const u = new URL(refundCalls()[0].url);
    expect(u.searchParams.get("key_hash")).toBe("request-scoped-hash");
    expect(u.searchParams.get("key_hash")).not.toBe("module-global-hash-must-not-be-used");
  });

  test("the handler is invoked twice in one charge scope -> still only one refund", async () => {
    const h = gated("cognitive_effort", failed);
    await withChargeScope("hash", "cognitive_effort", async () => { await h({}); await h({}); });
    expect(refundCalls().length).toBe(1);
  });

  test("overlapping requests each refund their own payer", async () => {
    const slowFail = async () => { await new Promise((r) => setTimeout(r, 20)); return failed(); };
    const h = gated("cognitive_effort", slowFail);
    await Promise.all([
      withChargeScope("payer-A", "cognitive_effort", () => h({})),
      withChargeScope("payer-B", "cognitive_effort", () => h({})),
    ]);
    const payers = refundCalls().map((c) => new URL(c.url).searchParams.get("key_hash")).sort();
    expect(payers).toEqual(["payer-A", "payer-B"]);
  });
});

describe("no refund where none is owed (ISC-6, ISC-7)", () => {
  test("a charged call that SUCCEEDS is not refunded", async () => {
    const h = gated("cognitive_effort", ok);
    await withChargeScope("hash", "cognitive_effort", () => h({}));
    expect(refundCalls().length).toBe(0);
  });

  test("an error-shaped body WITHOUT isError is not refunded (a failed test is still paid work)", async () => {
    const failedTestButToolRan = () => ({ content: [{ type: "text", text: JSON.stringify({ failed: 3, error: "assertion failed" }) }] });
    const h = gated("nl_test_inline", failedTestButToolRan);
    await withChargeScope("hash", "nl_test_inline", () => h({}));
    expect(refundCalls().length).toBe(0);
  });

  test("an UNBILLED call (no charge scope) that returns isError is not refunded", async () => {
    const h = gated("cognitive_effort", failed);
    await h({});
    expect(currentCharge()).toBeUndefined();
    expect(refundCalls().length).toBe(0);
  });

  test("a charge for a DIFFERENT tool does not refund this one", async () => {
    const h = gated("cognitive_effort", failed);
    await withChargeScope("hash", "some_other_tool", () => h({}));
    expect(refundCalls().length).toBe(0);
  });
});

describe("refund failures are loud, and never break the response", () => {
  test("a CMS that rejects the refund does not throw out of the handler", async () => {
    const prev = globalThis.fetch;
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    try {
      const h = gated("cognitive_effort", failed);
      const r = await withChargeScope("hash", "cognitive_effort", () => h({})) as { isError?: boolean };
      expect(r.isError).toBe(true); // the caller still gets the tool's own result
    } finally {
      globalThis.fetch = prev;
    }
  });
});

describe("autosave skips failures (ISC-11, F-L13)", () => {
  test("an isError result is NOT posted to /api/tool-results", async () => {
    const h = gated("cognitive_effort", failed);
    await h({ url: "https://example.com" });
    await new Promise((r) => setTimeout(r, 10)); // autosave is fire-and-forget
    expect(saveCalls().length).toBe(0);
  });

  test("control: a successful result IS posted, so the check above is not vacuous", async () => {
    const h = gated("cognitive_effort", ok);
    await h({ url: "https://example.com" });
    await new Promise((r) => setTimeout(r, 10));
    expect(saveCalls().length).toBe(1);
  });
});
