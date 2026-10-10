/**
 * Per-request caller identity on the hosted server. (sec-identity, 2026-10-10)
 *
 * The hosted server kept the caller's key hash and tier in tier-gate.ts module
 * variables and the raw API key in a cognitive-tools.ts one. Each request set
 * them while its MCP server was built and read them when its tool ran, several
 * awaits later (body read, redirect check, CMS credit deduct). A second
 * account's request arriving in that window overwrote all three, so the first
 * request logged usage and autosaved results under the other key hash, was
 * tier-gated by the other account's plan, and called the CMS with the other
 * account's raw key: list_cognitive_personas returned the other account's
 * custom personas, and persona_update/persona_delete would write to them.
 *
 * Each test runs two overlapping requests that set their identity the way the
 * hosted server does (setters, inside a per-request context) and then read it
 * after the other request has set its own. Both must see their own.
 *
 * The CMS is never contacted: globalThis.fetch is replaced with a recorder.
 * Filename sorts before the recording-* cluster on purpose; see the note in
 * tests/auth-remote.test.ts.
 */
import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-identity-"));
process.env.CMS_URL = "http://cms.invalid";

const { withRequestIdentity } = await import("../src/request-context.js");
const tg = await import("../src/mcp-tools/tier-gate.js");
const { setSessionApiKey, getSessionApiKey, registerCognitiveTools } = await import("../src/mcp-tools/base/cognitive-tools.js");

type Tier = "free" | "pro" | "enterprise" | null;
type Call = { url: string; headers: Record<string, string>; body?: string };

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));
const read = () => ({ keyHash: tg.getActiveKeyHash(), tier: tg.getActiveTier(), apiKey: getSessionApiKey() });
const anonymous = { keyHash: null, tier: null, apiKey: undefined };

let calls: Call[] = [];
const realFetch = globalThis.fetch;

/** Custom personas the fake CMS holds, per account key. */
const CMS_PERSONAS: Record<string, string> = { cbk_A: "Alpha Only", cbk_B: "Beta Only" };

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  const headers = (init?.headers ?? {}) as Record<string, string>;
  calls.push({ url, headers, body: typeof init?.body === "string" ? init.body : undefined });
  if (url.endsWith("/api/personas")) {
    await tick(5);
    const key = (headers.Authorization ?? "").replace(/^Bearer /, "");
    const name = CMS_PERSONAS[key];
    const personas = name ? [{ name, slug: name.toLowerCase().replace(/ /g, "-"), description: "d", traits: "{}", source: "cms" }] : [];
    return new Response(JSON.stringify({ personas }), { status: 200 });
  }
  return new Response("{}", { status: 200 });
}) as typeof fetch;

/** Reset the process fallback so a value left by one test cannot pass another. */
beforeEach(() => {
  calls = [];
  tg.setActiveKeyHash(null);
  tg.setActiveTier(null);
  setSessionApiKey(undefined);
});

afterAll(() => {
  globalThis.fetch = realFetch;
  tg.setActiveKeyHash(null);
  tg.setActiveTier(null);
  setSessionApiKey(undefined);
});

/**
 * One hosted request: enter a context, wait `setAt` ms, set the caller the way
 * mcp-server-remote.ts does, wait `runAt` ms more (the body read, redirect check
 * and credit deduct), then run `work`.
 */
function hostedRequest<T>(who: string, tier: Tier, setAt: number, runAt: number, work: () => T | Promise<T>): Promise<T> {
  return withRequestIdentity(anonymous, async () => {
    await tick(setAt);
    tg.setActiveKeyHash(`hash-${who}`);
    tg.setActiveTier(tier);
    setSessionApiKey(`cbk_${who}`);
    await tick(runAt);
    return work();
  });
}

describe("overlapping requests each read their own identity", () => {
  test("identity given at entry: key hash, tier and API key through the public getters", async () => {
    const request = (who: string, tier: Tier, first: number, second: number) =>
      withRequestIdentity({ keyHash: `hash-${who}`, tier, apiKey: `cbk_${who}` }, async () => {
        await tick(first);
        const a = read();
        await tick(second);
        return [a, read()];
      });
    // A reads at 5 and 25 ms, B at 15 and 20: every read of each falls between the other's.
    const [a, b] = await Promise.all([request("A", "free", 5, 20), request("B", "pro", 15, 5)]);
    for (const seen of a) expect(seen).toEqual({ keyHash: "hash-A", tier: "free", apiKey: "cbk_A" });
    for (const seen of b) expect(seen).toEqual({ keyHash: "hash-B", tier: "pro", apiKey: "cbk_B" });
  });

  test("identity set through the setters: B sets its own between A's set and A's read", async () => {
    // A sets at 0 and reads at 30; B sets at 10 and reads at 15.
    const [a, b] = await Promise.all([
      hostedRequest("A", "free", 0, 30, read),
      hostedRequest("B", "pro", 10, 5, read),
    ]);
    expect(a).toEqual({ keyHash: "hash-A", tier: "free", apiKey: "cbk_A" });
    expect(b).toEqual({ keyHash: "hash-B", tier: "pro", apiKey: "cbk_B" });
  });

  test("a setter inside a request does not change the process fallback (CLI, stdio)", async () => {
    tg.setActiveTier("enterprise");
    tg.setActiveKeyHash("cli-hash");
    setSessionApiKey("cbk_cli");
    await hostedRequest("A", "free", 0, 0, () => undefined);
    expect(read()).toEqual({ keyHash: "cli-hash", tier: "enterprise", apiKey: "cbk_cli" });
  });

  test("Anti: outside any request the setters and getters still work (CLI, stdio, local install)", () => {
    tg.setActiveTier("pro");
    tg.setActiveKeyHash("local-hash");
    setSessionApiKey("cbk_local");
    expect(read()).toEqual({ keyHash: "local-hash", tier: "pro", apiKey: "cbk_local" });
  });
});

describe("tier decisions use the calling request's plan", () => {
  test("a free request is refused a pro tool while an overlapping pro request is allowed it", async () => {
    // The gate-before-charge check in mcp-server-remote.ts runs after the
    // request's awaits. Reading B's "pro" there let a free account through to
    // the deduct and then handed it the upgrade prompt it had paid for.
    const decide = () => ({
      accessible: tg.isToolAccessible("empathy_audit"),
      shownTier: JSON.parse(tg.upgradePrompt("empathy_audit").content[0].text).currentTier,
    });
    const [free, pro] = await Promise.all([
      hostedRequest("A", "free", 0, 20, decide),
      hostedRequest("B", "pro", 5, 5, decide),
    ]);
    expect(free).toEqual({ accessible: false, shownTier: "free" });
    expect(pro.accessible).toBe(true);
  });
});

describe("usage log and autosave carry the calling request's key hash", () => {
  test("two overlapping calls through the gated wrapper are each filed under their own key", async () => {
    // Registered outside any request, at the process tier, as the stdio server does.
    tg.setActiveTier("enterprise");
    let handler: ((...a: unknown[]) => Promise<unknown>) | undefined;
    const fake = { registerTool: (_n: string, _c: Record<string, unknown>, h: (...a: unknown[]) => Promise<unknown>) => { handler = h; } };
    (tg.createGatedServer(fake) as typeof fake).registerTool("cognitive_effort", { description: "t" }, async () => {
      await tick(10);
      return { content: [{ type: "text", text: JSON.stringify({ score: 0.2 }) }] };
    });
    if (!handler) throw new Error("gate did not register a handler");
    const h = handler;

    await Promise.all([
      hostedRequest("A", "enterprise", 0, 20, () => h({ url: "https://a.example/" })),
      hostedRequest("B", "enterprise", 5, 5, () => h({ url: "https://b.example/" })),
    ]);

    const logged = calls
      .filter((c) => c.url.endsWith("/api/accounts/log-usage"))
      .map((c) => JSON.parse(c.body!).keyHash)
      .sort();
    expect(logged).toEqual(["hash-A", "hash-B"]);

    const saved = Object.fromEntries(calls
      .filter((c) => c.url.endsWith("/api/tool-results"))
      .map((c) => [JSON.parse(c.body!).target_url, c.headers.Authorization]));
    expect(saved).toEqual({ "https://a.example/": "Bearer hash-A", "https://b.example/": "Bearer hash-B" });
  });
});

describe("account-scoped CMS reads use the calling request's own key", () => {
  test("list_cognitive_personas returns only the caller's custom personas", async () => {
    const handlers: Record<string, () => Promise<{ content: Array<{ text: string }> }>> = {};
    const server = { registerTool: (name: string, _c: unknown, h: () => Promise<{ content: Array<{ text: string }> }>) => { handlers[name] = h; } };
    registerCognitiveTools(server as never, { getBrowser: async () => { throw new Error("no browser in this test"); } } as never);
    const list = async () => handlers.list_cognitive_personas().then((r) => r.content[0].text);

    const [a, b] = await Promise.all([
      hostedRequest("A", "pro", 0, 20, list),
      hostedRequest("B", "pro", 5, 5, list),
    ]);
    expect(a).toContain("Alpha Only");
    expect(a).not.toContain("Beta Only");
    expect(b).toContain("Beta Only");
    expect(b).not.toContain("Alpha Only");

    const keysSent = calls.filter((c) => c.url.endsWith("/api/personas")).map((c) => c.headers.Authorization).sort();
    expect(keysSent).toEqual(["Bearer cbk_A", "Bearer cbk_B"]);
  });
});
