/**
 * An authenticated account key enters persona scope (bug report 2026-10-09 v2, B16).
 *
 * validateAccountKey runs first on every request and filled tierCache but threw
 * away the accountId the CMS returns. resolveRequestAccountId then fell through
 * to resolveApiKeyTier, hit that tier cache, returned early and never learned the
 * account -- so no account key ever entered persona scope. 19.2.1 made custom
 * personas resolve only inside scope, and every custom persona became
 * unresolvable by the measurement tools while list_cognitive_personas (which
 * fetches the CMS directly) still listed them.
 *
 * Also pins the v2 follow-ups: one alias table for every tool, one
 * unknown-persona error shape.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-scope-auth-"));

const { validateAccountKey, resolveRequestAccountId, _clearTierCache } = await import("../src/mcp-server-remote.js");
const { resolvePersonaForTool } = await import("../src/personas.js");

const cms = (body: unknown): typeof fetch => (async () => new Response(JSON.stringify(body), {
  status: 200, headers: { "content-type": "application/json" },
})) as unknown as typeof fetch;
const req = (key: string) => ({ headers: { authorization: `Bearer ${key}` } }) as never;

describe("B16: the account key that authenticated is the account that scopes", () => {
  beforeEach(() => _clearTierCache());

  test("after validateAccountKey, resolveRequestAccountId returns the CMS accountId", async () => {
    const key = `cbk_scope_${Date.now()}`;
    // Any second CMS call would be a different code path; make it impossible.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("resolveApiKeyTier must not be needed"); }) as unknown as typeof fetch;
    try {
      const v = await validateAccountKey(key, { fetch: cms({ valid: true, tier: "pro", accountId: 42 }), cmsUrl: "http://cms.invalid" });
      expect(v.valid).toBe(true);
      expect(await resolveRequestAccountId(req(key))).toBe(42);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("a key the CMS returns no accountId for stays unscoped", async () => {
    const key = `cbk_noacct_${Date.now()}`;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    try {
      await validateAccountKey(key, { fetch: cms({ valid: true, tier: "pro" }), cmsUrl: "http://cms.invalid" });
      expect(await resolveRequestAccountId(req(key))).toBeNull();
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("one alias table for every tool", () => {
  test("motor-tremor resolves without passing a table (attention used to refuse it)", () => {
    const r = resolvePersonaForTool("motor-tremor");
    expect(r.name).toBe("motor-impairment-tremor");
    expect(r.resolvedFrom).toBe("motor-tremor");
  });

  test("an exact roster name wins over an alias by default", () => {
    expect(resolvePersonaForTool("elderly-user").name).toBe("elderly-user");
  });

  test("empathy_audit's alias-first mapping is preserved", () => {
    expect(resolvePersonaForTool("elderly-user", undefined, true).name).toBe("elderly-low-vision");
  });
});

describe("one unknown-persona error shape", () => {
  test("empathy_audit carries code and suggestions like the attention tools", async () => {
    const { registerEmpathyAuditTool } = await import("../src/mcp-tools/base/audit-tools.js");
    let handler: ((a: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ text?: string }> }>) | undefined;
    registerEmpathyAuditTool({
      registerTool: (name: string, _c: unknown, h: typeof handler) => { if (name === "empathy_audit") handler = h; },
      tool: () => {}, registerResource: () => {}, resource: () => {},
    } as never);
    const r = await handler!({ url: "https://example.invalid/", disabilities: ["cognitve-adhd"] });
    expect(r.isError).toBe(true);
    const body = JSON.parse(r.content[0].text ?? "{}");
    expect(body.code).toBe("unknown_persona");
    expect(body.suggestions).toContain("cognitive-adhd");
    expect(body.persona).toBe("cognitve-adhd");
  }, 30000);
});
