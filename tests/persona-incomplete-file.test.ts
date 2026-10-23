/**
 * An incomplete persona.json must load usably, not silently score as blank.
 *
 * `getCognitiveProfile` read `persona.demographics.device` unguarded. The YAML
 * read branch defaults `demographics`; the JSON branch defaulted only
 * `behaviors` — the comment there records someone noticing that exact asymmetry
 * and fixing one field of it. So a hand-written or CMS-exported persona.json
 * without `demographics` loaded fine and threw downstream.
 *
 * The throw was invisible. `resolvePersonaContext` caught it and returned `{}`,
 * so the LLM relevance judge received no traits, no values and no description —
 * a malformed persona scored exactly like a blank one, with nothing anywhere
 * saying so.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ACCOUNT = 876543;
let root: string;
const prevRoot = process.env.CBROWSER_MIRROR_ROOT;

/** Deliberately missing demographics, humanBehavior and context. */
const SPARSE = {
  name: "sparse-persona",
  description: "A persona file written by hand, carrying only the essentials.",
  cognitiveTraits: { patience: 0.2, curiosity: 0.9, comprehension: 0.8 },
  schwartzValues: {
    selfDirection: 0.6, stimulation: 0.5, hedonism: 0.5, achievement: 0.5,
    power: 0.4, security: 0.5, conformity: 0.4, tradition: 0.4,
    benevolence: 0.6, universalism: 0.6,
  },
};

beforeAll(() => {
  // withPersonaScope, not CBROWSER_DATA_DIR: until 21.0 personas.ts froze
  // DATA_DIR at first import, so an env var set here was read too late in a
  // shared process. It is read per call now; the scoped setup still holds.
  root = mkdtempSync(join(tmpdir(), "sparse-persona-"));
  process.env.CBROWSER_MIRROR_ROOT = root;
  const dir = join(root, "accounts", String(ACCOUNT), "personas");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "sparse-persona.json"), JSON.stringify(SPARSE, null, 2));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  if (prevRoot === undefined) delete process.env.CBROWSER_MIRROR_ROOT;
  else process.env.CBROWSER_MIRROR_ROOT = prevRoot;
});

async function inScope<T>(fn: () => T | Promise<T>): Promise<T> {
  const { withPersonaScope } = await import("../src/persona-scope.js");
  return await withPersonaScope(ACCOUNT, fn);
}

describe("an incomplete persona still resolves", () => {
  test("the read boundary supplies demographics", async () => {
    const p = await inScope(async () => {
      const { getAnyPersona } = await import("../src/personas.js");
      return getAnyPersona("sparse-persona") as { demographics?: Record<string, string> } | undefined;
    });
    expect(p).toBeDefined();
    expect(p!.demographics).toBeDefined();
    expect(p!.demographics!.device).toBeTruthy();
  });

  test("getCognitiveProfile does not throw", async () => {
    await inScope(async () => {
      const { getAnyPersona, getCognitiveProfile } = await import("../src/personas.js");
      const p = getAnyPersona("sparse-persona");
      expect(() => getCognitiveProfile(p as never)).not.toThrow();
    });
  });

  test("the relevance context is populated, NOT an empty object", async () => {
    // The assertion that fails on the pre-fix code: the catch returned {}, so
    // every one of these was undefined and the judge saw nothing.
    const { resolvePersonaContext } = await import("../src/visual/persona-context.js");
    const ctx = await inScope(() => resolvePersonaContext("sparse-persona"));
    expect(ctx.personaDescription).toBeTruthy();
    expect(Object.keys(ctx.traits ?? {}).length).toBeGreaterThan(0);
    expect(ctx.values).toBeDefined();
  });

  test("the traits the file DID declare survive", async () => {
    const { resolvePersonaContext } = await import("../src/visual/persona-context.js");
    const ctx = await inScope(() => resolvePersonaContext("sparse-persona"));
    expect(ctx.traits!.patience).toBe(0.2);
    expect(ctx.traits!.curiosity).toBe(0.9);
  });
});

describe("an unresolvable persona degrades loudly, not silently", () => {
  test("a genuinely missing persona still returns an empty context", async () => {
    // Degrading is correct — the keyword path is a real floor and an audit
    // should not fail over this. Degrading QUIETLY was the defect.
    const { resolvePersonaContext } = await import("../src/visual/persona-context.js");
    const ctx = await resolvePersonaContext("no-such-persona-at-all");
    expect(ctx.traits).toBeUndefined();
  });

  test("the catch reports rather than swallowing", async () => {
    const src = await Bun.file(
      new URL("../src/visual/persona-context.ts", import.meta.url),
    ).text();
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code).not.toContain("} catch {\n    return {};");
    expect(code).toContain("console.warn");
  });
});

describe("no unguarded demographics access remains", () => {
  test("personas.ts and cli.ts optional-chain every read", async () => {
    for (const f of ["../src/personas.ts", "../src/cli.ts"]) {
      const src = await Bun.file(new URL(f, import.meta.url)).text();
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      // `basePersona.demographics.x = ...` assignments are on an object this
      // module just constructed, so they are excluded by name.
      const unguarded = [...code.matchAll(/(\w+)\.demographics\.[a-z_]+/g)]
        .map((m) => m[0])
        .filter((m) => !m.startsWith("basePersona."));
      expect(unguarded).toEqual([]);
    }
  });
});
