/**
 * A saved tool result names the cbrowser version that computed it.
 *
 * 21.0 changes the scale of the CIF, cognitive transport and empathy scores. The
 * dashboard stores results from the hosted servers and the audit worker side by
 * side, and only the version tells it which scale a stored score is on, so it can
 * average and chart each scale on its own. A result posted without one is read as
 * coming from a version before 21.0.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { saveToolResult, scorerVersionFor } from "../src/mcp-tools/tool-result-saver.js";
import { VERSION } from "../src/version.js";

async function postedBody(): Promise<Record<string, unknown>> {
  const realFetch = globalThis.fetch;
  let body: string | undefined;
  let resolveSent: () => void;
  const sent = new Promise<void>((r) => { resolveSent = r; });
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    body = init?.body;
    resolveSent();
    return new Response("{}", { status: 201 });
  }) as unknown as typeof fetch;
  try {
    saveToolResult({
      apiKey: "key-hash",
      toolName: "empathy_audit",
      targetUrl: "https://example.com/",
      result: { overallScore: 70 },
    });
    await sent;
  } finally {
    globalThis.fetch = realFetch;
  }
  return JSON.parse(body ?? "{}") as Record<string, unknown>;
}

describe("saveToolResult", () => {
  test("posts the package version as scorer_version", async () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
    const body = await postedBody();
    expect(body.scorer_version).toBe(VERSION);
    expect(body.tool_name).toBe("empathy_audit");
  });

  test("sends no version when the package version could not be read", () => {
    // version.ts falls back to "0.0.0"; the CMS stores a missing version as none.
    expect(scorerVersionFor("0.0.0")).toBeUndefined();
    expect(scorerVersionFor("21.0.0")).toBe("21.0.0");
  });
});
