/**
 * Persona registry data must say what the persona descriptions say.
 *
 * Four defects measured 2026-10-06 (dist list_cognitive_personas handler):
 *
 *  - NOT fixed here (LOW-08a, deferred 2026-10-07): a "65-year-old retiree" is
 *    still stored as age_range "25-45". Two attempts to read the age from the
 *    description were rejected in review - a stated age can belong to someone
 *    the description only mentions (a parent, a patient, a grandchild), and
 *    "pre-retiree" matched "retiree" - so the regex is left as it was.
 *  - elderly-low-vision ("age-related vision and motor decline") was listed as
 *    "Cognitive (Processing)": the label was inferred last-match-wins, so
 *    processingSpeed < 0.6 overwrote "Low vision".
 *  - deaf-user was listed with barrierTypes [] (the name fallback set a label
 *    and never a barrier type), and dyscalculia as "General accessibility", []
 *    -- no inference branch knows hearing or numeracy.
 *  - The same persona got a different label from each of the four places that
 *    infer one: the two list_cognitive_personas copies (remote and stdio), the
 *    empathy audit, and the stdio empathy session (dyslexic-user read
 *    "Cognitive (Processing)" in the roster and "Cognitive (ADHD/Memory)" in its
 *    own audit). The labels are now declared on the persona, once, and every
 *    site reads the declaration -- the parity tests below quantify over all of
 *    them so a fifth site cannot drift either.
 *
 * Also here: a value block of ten 0.5s is a neutral placeholder, not a
 * measurement. color-blind's is deliberate (colour perception is not a
 * motivation) and this change does not invent values for it -- but it is
 * flagged by name, so a new all-0.5 block cannot slip in unnoticed.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

let dataDir: string;
const prevDataDir = process.env.CBROWSER_DATA_DIR;
beforeAll(() => {
  dataDir = mkdtempSync(join(tmpdir(), "persona-data-"));
  process.env.CBROWSER_DATA_DIR = dataDir;
});
afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
  if (prevDataDir === undefined) delete process.env.CBROWSER_DATA_DIR;
  else process.env.CBROWSER_DATA_DIR = prevDataDir;
});

/** The AccessibilityBarrierType union, read from types.ts so it cannot drift. */
function barrierTypeUnion(): Set<string> {
  const src = readFileSync(join(import.meta.dir, "..", "src", "types.ts"), "utf8");
  const m = src.match(/export type AccessibilityBarrierType =([^;]+);/);
  if (!m) throw new Error("AccessibilityBarrierType not found in types.ts");
  return new Set([...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]));
}

type Row = { name: string; category: string; disabilityType?: string; barrierTypes?: string[] };

async function remoteRoster(): Promise<Row[]> {
  const { registerCognitiveTools } = await import("../src/mcp-tools/base/cognitive-tools.js");
  let handler: (() => Promise<{ content: Array<{ text: string }> }>) | undefined;
  registerCognitiveTools(
    {
      registerTool: (name: string, _c: unknown, fn: typeof handler) => {
        if (name === "list_cognitive_personas") handler = fn;
      },
      tool: () => {}, registerResource: () => {}, resource: () => {},
    } as never,
    { getBrowser: async () => { throw new Error("no browser"); } } as never,
  );
  const res = await handler!();
  return (JSON.parse(res.content[0].text) as { personas: Row[] }).personas;
}

async function stdioClient(): Promise<Client> {
  const { createMcpServer } = await import("../src/mcp-server.js");
  const server: McpServer = await createMcpServer();
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "persona-data-test", version: "1" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

const text = (r: unknown) => (r as { content: Array<{ text: string }> }).content[0].text;

describe("accessibility persona disability labels", () => {
  test("every built-in accessibility persona declares a label and barrier types", async () => {
    const { ACCESSIBILITY_PERSONAS } = await import("../src/personas.js");
    const union = barrierTypeUnion();
    const bad: string[] = [];
    for (const [name, p] of Object.entries(ACCESSIBILITY_PERSONAS)) {
      const decl = p as { disabilityType?: string; barrierTypes?: string[] };
      if (!decl.disabilityType || decl.disabilityType === "General accessibility") bad.push(`${name}: no disabilityType`);
      if (!decl.barrierTypes?.length) bad.push(`${name}: no barrierTypes`);
      for (const t of decl.barrierTypes ?? []) if (!union.has(t)) bad.push(`${name}: unknown barrier type ${t}`);
    }
    expect(bad).toEqual([]);
  });

  test("the three measured defects, in the roster the hosted servers serve", async () => {
    const rows = await remoteRoster();
    const get = (n: string) => rows.find((r) => r.name === n && r.category === "accessibility")!;

    expect(get("elderly-low-vision").disabilityType).toMatch(/^Low vision/);
    expect(get("elderly-low-vision").barrierTypes).toEqual(expect.arrayContaining(["visual_clarity", "contrast"]));

    expect(get("deaf-user").disabilityType).toMatch(/Hearing/);
    expect(get("deaf-user").barrierTypes).toContain("sensory");

    expect(get("dyscalculia").disabilityType).not.toBe("General accessibility");
    expect(get("dyscalculia").disabilityType).toMatch(/numera/i);
    expect(get("dyscalculia").barrierTypes).toContain("cognitive_load");
  });

  // The empathy audit's side of this parity runs the real audit, in
  // tests/empathy-disability-label.test.ts (a browser test). It used to call
  // getDisabilityType here, which meant exporting it -- and analysis/index.ts
  // re-exports accessibility-empathy with `export *`, so a test-only export
  // became package API. This pins that neither label helper leaks. (2026-10-07)
  test("the label helpers stay off every public entry point", async () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")) as {
      exports: Record<string, { import: string }>;
    };
    const leaks: string[] = [];
    for (const [subpath, entry] of Object.entries(pkg.exports)) {
      const src = entry.import.replace(/^\.\/dist\//, "../src/").replace(/\.js$/, ".ts");
      const mod = await import(src);
      for (const name of ["getDisabilityType", "describeAccessibilityPersona"]) {
        if (name in mod) leaks.push(`${subpath} exports ${name}`);
      }
    }
    expect(Object.keys(pkg.exports).length).toBeGreaterThan(5);
    expect(leaks).toEqual([]);
  }, 60_000); // the root entry imports the whole package; ~0.3s warm, more cold

  test("the stdio roster and stdio empathy session agree with the hosted roster", async () => {
    const remote = await remoteRoster();
    const client = await stdioClient();
    try {
      const stdioRows = (JSON.parse(text(await client.callTool({ name: "list_cognitive_personas", arguments: {} }))) as { personas: Row[] }).personas;
      const init = JSON.parse(text(await client.callTool({
        name: "empathy_audit_init",
        arguments: { url: "https://example.com/", goal: "read the page" },
      }))) as { personas: Array<{ name: string; disabilityType: string }> };

      const mismatches: string[] = [];
      for (const r of remote.filter((x) => x.category === "accessibility")) {
        const s = stdioRows.find((x) => x.name === r.name && x.category === "accessibility");
        if (s?.disabilityType !== r.disabilityType) mismatches.push(`${r.name}: stdio roster "${s?.disabilityType}" vs "${r.disabilityType}"`);
        if (JSON.stringify(s?.barrierTypes) !== JSON.stringify(r.barrierTypes)) mismatches.push(`${r.name}: stdio barrierTypes ${JSON.stringify(s?.barrierTypes)} vs ${JSON.stringify(r.barrierTypes)}`);
        const sess = init.personas.find((x) => x.name === r.name);
        if (sess && sess.disabilityType !== r.disabilityType) mismatches.push(`${r.name}: session "${sess.disabilityType}" vs "${r.disabilityType}"`);
      }
      expect(mismatches).toEqual([]);
      expect(init.personas.length).toBeGreaterThan(5);
    } finally {
      await client.close();
    }
  }, 30_000);
});

describe("all-0.5 value blocks are flagged as unset, not read as measured", () => {
  const SCHWARTZ = ["selfDirection", "stimulation", "hedonism", "achievement", "power",
    "security", "conformity", "tradition", "benevolence", "universalism"] as const;
  const allHalf = (v: Record<string, unknown> | undefined) =>
    !!v && SCHWARTZ.every((k) => v[k] === 0.5);

  /**
   * Neutral by design and documented as such in its rationale. Listed so the
   * placeholder is visible; values are NOT invented for it here (2026-10-07).
   * Its maslowLevel "esteem" is likewise a literal, not a derivation.
   */
  const KNOWN_UNSET = ["color-blind"];

  test("the shipped value registry: only the documented placeholder is all-0.5", async () => {
    const { PERSONA_VALUE_PROFILES } = await import("../src/values/persona-values.js");
    const flagged = PERSONA_VALUE_PROFILES
      .filter((p) => allHalf(p.values as unknown as Record<string, unknown>))
      .map((p) => p.personaName);
    expect(flagged).toEqual(KNOWN_UNSET);
  });

  test("the placeholder's rationale says it is neutral, so the flag is honest", async () => {
    const { PERSONA_VALUE_PROFILES } = await import("../src/values/persona-values.js");
    const p = PERSONA_VALUE_PROFILES.find((x) => x.personaName === "color-blind")!;
    expect(p.rationale).toMatch(/does not affect motivational values/);
  });

  test("no built-in persona carries its own all-0.5 schwartzValues block", async () => {
    const reg = await import("../src/personas.js");
    const { AGENT_PERSONAS } = await import("../src/agent-personas.js");
    const flagged: string[] = [];
    for (const table of [reg.BUILTIN_PERSONAS, reg.ACCESSIBILITY_PERSONAS, reg.EMOTIONAL_PERSONAS, AGENT_PERSONAS]) {
      for (const [name, p] of Object.entries(table)) {
        if (allHalf((p as { schwartzValues?: Record<string, unknown> }).schwartzValues)) flagged.push(name);
      }
    }
    expect(flagged).toEqual([]);
  });
});
