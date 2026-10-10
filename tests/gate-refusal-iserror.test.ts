/**
 * Gate refusals are tool errors, not results (2026-10-09).
 *
 * On pro.cbrowser.ai a Free-tier key calling empathy_audit got the "Upgrade
 * Required" prompt with no `isError`, and a credit refusal (capture_status:
 * tool_not_available) came back the same way, so an MCP client read each
 * refusal as the tool's completed result. Both now set `isError: true`. The
 * text is unchanged, and the flag refunds nothing: neither path ever charged.
 *
 * Filename sorts before the recording-* cluster on purpose; see the note in
 * tests/auth-remote.test.ts.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, afterAll } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-gate-iserror-"));
const { upgradePrompt, setActiveTier, createGatedServer } = await import("../src/mcp-tools/tier-gate.js");
const { creditDeniedResult } = await import("../src/mcp-server-remote.js");

type Result = { isError?: boolean; content: Array<{ type: string; text?: string }> };
const body = (r: Result) => JSON.parse(r.content[0].text!);

afterAll(() => { setActiveTier(null); });

describe("upgrade prompt", () => {
  test("is flagged isError and keeps its text", () => {
    setActiveTier("free");
    const r = upgradePrompt("empathy_audit") as Result;
    expect(r.isError).toBe(true);
    expect(body(r)).toMatchObject({ error: "Upgrade Required", tool: "empathy_audit", currentTier: "free", requiredTier: "pro" });
  });

  test("the gated handler returns it without running the tool or touching the network", async () => {
    setActiveTier("free");
    const handlers: Record<string, (a: unknown) => Promise<Result> | Result> = {};
    const server = { registerTool: (name: string, _c: unknown, h: (a: unknown) => Result) => { handlers[name] = h; } };
    createGatedServer(server);
    let ran = false;
    (server as { registerTool: (n: string, c: Record<string, unknown>, h: () => unknown) => void })
      .registerTool("empathy_audit", { description: "audit" }, () => { ran = true; return { content: [] }; });

    const realFetch = globalThis.fetch;
    let fetches = 0;
    globalThis.fetch = (async () => { fetches++; return new Response("{}"); }) as unknown as typeof fetch;
    try {
      const r = await handlers.empathy_audit({ url: "https://cbrowser.ai" });
      expect(r.isError).toBe(true);
      expect(body(r).error).toBe("Upgrade Required");
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(ran).toBe(false);
    expect(fetches).toBe(0); // no refund call: nothing was charged
  });

  test("Anti: an accessible tool's result passes through without isError", async () => {
    setActiveTier("free");
    const handlers: Record<string, (a: unknown) => Promise<Result>> = {};
    const server = { registerTool: (name: string, _c: unknown, h: (a: unknown) => Promise<Result>) => { handlers[name] = h; } };
    createGatedServer(server);
    (server as { registerTool: (n: string, c: Record<string, unknown>, h: () => unknown) => void })
      .registerTool("navigate", { description: "nav" }, async () => ({ content: [{ type: "text", text: "{\"ok\":true}" }] }));
    const r = await handlers.navigate({});
    expect(r.isError).toBeUndefined();
    expect(body(r)).toEqual({ ok: true });
  });
});

describe("credit refusal", () => {
  for (const [reason, action] of [
    ["insufficient_credits", "Purchase credits at cbrowser.ai/pricing"],
    ["domain_not_registered", "Add this domain at cbrowser.ai/account/reports"],
    ["tool_not_available", "Upgrade to Pro at cbrowser.ai/pricing"],
  ] as const) {
    test(`${reason} is flagged isError and keeps its text`, () => {
      const r = creditDeniedResult({ reason, message: "m", remaining: 3 }) as Result;
      expect(r.isError).toBe(true);
      expect(body(r)).toMatchObject({ error: reason, message: "m", action });
    });
  }

  test("a refusal with no message still says it was denied", () => {
    const r = creditDeniedResult({ reason: "other" }) as Result;
    expect(r.isError).toBe(true);
    expect(body(r)).toEqual({ error: "other", message: "Tool execution denied" });
  });
});
