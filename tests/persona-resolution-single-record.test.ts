/**
 * One persona name, one record, one refusal (bug report 2026-10-09, B1-B4).
 *
 * B4: list_cognitive_personas and persona_lookup returned different trait
 * vectors for alexa-eden. loadAccountPersonas wrote an account's CMS personas
 * into RUNTIME_PERSONAS -- one map for the whole process, checked FIRST by
 * getAnyPersona and never by getPersona -- so the lookup read the CMS copy and
 * the roster read the disk copy, and every other account in the process could
 * resolve that account's persona by name.
 *
 * B1-B3: empathy_audit scored an unknown persona 0 with errors: [], and
 * attention_analysis / attention_compare measured one, each tool resolving on
 * its own. They now refuse through one resolver before anything launches.
 *
 * Pure: no browser is launched on the fixed code (the refusals happen first).
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const mirrorRoot = mkdtempSync(join(tmpdir(), "cb-persona-mirror-"));
process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-persona-flat-"));
process.env.CBROWSER_MIRROR_ROOT = mirrorRoot;
process.env.CMS_URL = "http://cms.invalid";

const personas = await import("../src/personas.js");
const { withPersonaScope } = await import("../src/persona-scope.js");
const { loadAccountPersonas } = await import("../src/mcp-tools/account-personas.js");
const { setSessionApiKey } = await import("../src/mcp-tools/base/cognitive-tools.js");

const traits = (wm: number, fomo: number) => ({ workingMemory: wm, fearOfMissingOut: fomo, patience: 0.5 });

// Account 7's on-disk mirror holds the revised record; the "CMS" holds a stale
// one. The mirror dir is resolved per call (CBROWSER_MIRROR_ROOT), so this never
// touches a real data dir -- unlike the unscoped store, which personas.ts fixes at
// first import and which, in the full suite, is the runner's real ~/.cbrowser.
const mirrorDir = join(mirrorRoot, "accounts", "7", "personas");
mkdirSync(mirrorDir, { recursive: true });
writeFileSync(join(mirrorDir, "split-persona.json"), JSON.stringify({
  name: "split-persona", description: "disk copy",
  demographics: { age_range: "25-45", tech_level: "expert", device: "desktop" },
  cognitiveTraits: traits(0.25, 0.25),
}));

const cmsRows = [
  { name: "split-persona", description: "cms copy", traits: JSON.stringify(traits(0.4, 0.6)) },
  { name: "account-seven-only", description: "belongs to account 7", traits: JSON.stringify(traits(0.3, 0.3)) },
];
const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ personas: cmsRows }), {
    status: 200, headers: { "content-type": "application/json" },
  })) as unknown as typeof fetch;
  setSessionApiKey("cbk_test_key");
});
afterAll(() => { globalThis.fetch = realFetch; setSessionApiKey(undefined); });

const wm = (p: unknown) => (p as { cognitiveTraits?: { workingMemory?: number } } | undefined)?.cognitiveTraits?.workingMemory;

describe("B4: one record per name, and no cross-account reads", () => {
  test("an unscoped load registers nothing process-wide", async () => {
    await loadAccountPersonas("cbk_test_key");
    expect(personas.getAnyPersona("account-seven-only")).toBeUndefined();
    // roster path and lookup path agree on the shared name (here: neither has it)
    expect(personas.getAnyPersona("split-persona")).toBeUndefined();
    expect(personas.getPersona("split-persona")).toBeUndefined();
  });

  test("account 7's personas resolve inside account 7's scope", async () => {
    await withPersonaScope(7, async () => {
      await loadAccountPersonas("cbk_test_key");
      expect(personas.getAnyPersona("account-seven-only")).toBeDefined();
      expect(personas.listAllPersonas()).toContain("account-seven-only");
      expect(personas.listPersonas()).toContain("account-seven-only");
    });
  });

  test("...and never outside it: not unscoped, not under another account", async () => {
    await withPersonaScope(7, () => loadAccountPersonas("cbk_test_key"));
    expect(personas.getAnyPersona("account-seven-only")).toBeUndefined();
    await withPersonaScope(8, async () => {
      expect(personas.getAnyPersona("account-seven-only")).toBeUndefined();
      expect(personas.listAllPersonas()).not.toContain("account-seven-only");
    });
  });

  test("getAnyPersona (lookup, measurement) and getPersona (roster) return the same record in every context", async () => {
    await withPersonaScope(7, () => loadAccountPersonas("cbk_test_key"));
    const contexts: Array<[string, () => Promise<[unknown, unknown]>]> = [
      ["unscoped", async () => [personas.getAnyPersona("split-persona"), personas.getPersona("split-persona")]],
      ["account 7", () => withPersonaScope(7, async () => [personas.getAnyPersona("split-persona"), personas.getPersona("split-persona")])],
      ["account 8", () => withPersonaScope(8, async () => [personas.getAnyPersona("split-persona"), personas.getPersona("split-persona")])],
    ];
    for (const [label, run] of contexts) {
      const [lookup, roster] = await run();
      expect(wm(lookup), label).toBe(wm(roster));
    }
    // Inside account 7 the on-disk mirror wins over the CMS registry, for both.
    const [inSeven] = await contexts[1][1]();
    expect(wm(inSeven)).toBe(0.25);
  });
});

describe("one resolver: every roster name resolves, unknown names refuse", () => {
  test("every name in listAllPersonas resolves to itself", () => {
    for (const name of personas.listAllPersonas()) {
      expect(personas.resolvePersonaForTool(name).name).toBe(name);
    }
  });

  test("names nothing knows throw UnknownPersonaError, with suggestions for a typo", () => {
    for (const bad of ["zzz-not-a-persona", "qqq-unknown-two", "cognitve-adhd"]) {
      expect(() => personas.resolvePersonaForTool(bad)).toThrow(personas.UnknownPersonaError);
    }
    try { personas.resolvePersonaForTool("cognitve-adhd"); } catch (e) {
      expect((e as InstanceType<typeof personas.UnknownPersonaError>).suggestions).toContain("cognitive-adhd");
    }
  });

  test("an alias reports what it resolved from", () => {
    const r = personas.resolvePersonaForTool("motor-tremor", { "motor-tremor": "motor-impairment-tremor" });
    expect(r.name).toBe("motor-impairment-tremor");
    expect(r.resolvedFrom).toBe("motor-tremor");
  });

  test("journey engines refuse unknown names instead of running first-timer", () => {
    expect(() => personas.getPersonaOrRefuse("zzz-not-a-persona")).toThrow(personas.UnknownPersonaError);
    expect(personas.getPersonaOrRefuse(undefined).name).toBe("first-timer");
    expect(personas.getPersonaOrRefuse("power-user").name).toBe("power-user");
  });
});

// ---- tool level: refusals happen before any browser launch ----
type Handler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ type: string; text?: string }> }>;
function capture(register: (server: never, ctx?: never) => void): Record<string, Handler> {
  const handlers: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, h: Handler) => { handlers[name] = h; },
    tool: () => {}, registerResource: () => {}, resource: () => {},
  };
  const ctx = { getBrowser: async () => { throw new Error("no browser in this test"); }, getBrowserByToken: async () => { throw new Error("no browser in this test"); } };
  register(server as never, ctx as never);
  return handlers;
}
const text = (r: { content: Array<{ text?: string }> }) => r.content.map((c) => c.text ?? "").join("\n");

describe("tool refusals (B1, B2, B3 and the class sweep)", () => {
  test("empathy_audit refuses unknown personas instead of scoring 0", async () => {
    const { registerEmpathyAuditTool } = await import("../src/mcp-tools/base/audit-tools.js");
    const h = capture(registerEmpathyAuditTool as never).empathy_audit;
    for (const bad of ["zzz-not-a-persona", "qqq-unknown-two", "cognitve-adhd"]) {
      const r = await h({ url: "https://example.invalid/", disabilities: [bad] });
      expect(r.isError).toBe(true);
      expect(text(r)).toContain(`Unknown persona \\"${bad}\\"`);
      expect(text(r)).toContain("unknown_persona");
    }
  }, 30000);

  test("attention_analysis refuses each unknown name", async () => {
    const { registerVisualTestingTools } = await import("../src/mcp-tools/base/visual-testing-tools.js");
    const h = capture(registerVisualTestingTools as never).attention_analysis;
    for (const bad of ["zzz-not-a-persona", "qqq-unknown-two", "cognitve-adhd", "motor-tremor-typo"]) {
      const r = await h({ url: "https://example.invalid/", persona: bad, heatmap: false });
      expect(r.isError).toBe(true);
      expect(text(r)).toContain("Unknown persona");
    }
  }, 30000);

  test("attention_compare refuses an unknown persona on either side", async () => {
    const { registerVisualTestingTools } = await import("../src/mcp-tools/base/visual-testing-tools.js");
    const h = capture(registerVisualTestingTools as never).attention_compare;
    const r = await h({ url: "https://example.invalid/", personaA: "power-user", personaB: "zzz-not-a-persona" });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("Unknown persona");
  }, 30000);

  test("journey init, distance, coverage, values lookup and the gif tool refuse with isError", async () => {
    const { registerCognitiveTools } = await import("../src/mcp-tools/base/cognitive-tools.js");
    const { registerPersonaComparisonTools } = await import("../src/mcp-tools/base/persona-comparison-tools.js");
    const { registerValuesTools } = await import("../src/mcp-tools/base/values-tools.js");
    const { registerGifTools } = await import("../src/mcp-tools/base/gif-tools.js");
    const cog = capture(registerCognitiveTools as never);
    const cmp = capture(registerPersonaComparisonTools as never);
    const val = capture(registerValuesTools as never);
    const gif = capture(registerGifTools as never);
    const cases: Array<[string, Handler, Record<string, unknown>]> = [
      ["cognitive_journey_init", cog.cognitive_journey_init, { persona: "zzz-not-a-persona", goal: "x", startUrl: "https://example.invalid/" }],
      ["cognitive_distance", cmp.cognitive_distance, { personaA: "power-user", personaB: "zzz-not-a-persona" }],
      ["cognitive_load_estimate", cmp.cognitive_load_estimate, { persona: "zzz-not-a-persona", url: "https://example.invalid/" }],
      ["cognitive_coverage", cmp.cognitive_coverage, { personas: ["power-user", "zzz-not-a-persona"], count: 1 }],
      ["persona_values_lookup", val.persona_values_lookup, { persona: "zzz-not-a-persona" }],
      ["journey_heatmap_gif", gif.journey_heatmap_gif, { url: "https://example.invalid/", persona: "zzz-not-a-persona", goal: "x" }],
    ];
    for (const [name, h, args] of cases) {
      expect(h, name).toBeDefined();
      const r = await h(args);
      expect(r.isError, name).toBe(true);
      expect(text(r), name).toMatch(/not found|Unknown persona/i);
    }
  }, 30000);
});
