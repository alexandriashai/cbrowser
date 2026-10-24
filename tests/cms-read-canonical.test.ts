/**
 * A persona read straight from the CMS gets the same trait names as one read
 * from a file.
 *
 * canonicalizeTraits (trait-reference.ts) maps the deprecated
 * `mentalModelRigidity` key to `mentalModelFlexibility` with the value
 * unchanged, because everything cbrowser wrote under the old key was already
 * flexibility. It ran only where persona files are read, so on the two CMS
 * read paths an old-key row kept a key nothing recognises and the trait was
 * silently ignored. It waited on the CMS persona generator, which wrote
 * rigidity under the old key; that writer is fixed and its one stored row
 * migrated (2026-10-24).
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, afterEach } from "bun:test";
import { cmsPersonaToPersona } from "../src/mcp-tools/account-personas.js";
import { fetchCustomPersonasFromCMS } from "../src/mcp-tools/base/cognitive-tools.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

/** A CMS /api/personas answer with the given rows. */
function cmsReturns(rows: Array<Record<string, unknown>>) {
  globalThis.fetch = (async () => new Response(JSON.stringify({ personas: rows }), { status: 200 })) as unknown as typeof fetch;
}

describe("cmsPersonaToPersona", () => {
  test("an old-key row is read as flexibility, value unchanged, old key gone", () => {
    const p = cmsPersonaToPersona({ name: "Old Key", traits: JSON.stringify({ mentalModelRigidity: 0.65, patience: 0.4 }) });
    const t = p.cognitiveTraits as unknown as Record<string, number>;
    expect(t.mentalModelFlexibility).toBe(0.65);
    expect("mentalModelRigidity" in t).toBe(false);
    expect(t.patience).toBe(0.4);
  });

  test("a row with both keys keeps the canonical value", () => {
    const p = cmsPersonaToPersona({ name: "Both", traits: { mentalModelFlexibility: 0.7, mentalModelRigidity: 0.2 } });
    expect((p.cognitiveTraits as unknown as Record<string, number>).mentalModelFlexibility).toBe(0.7);
  });
});

describe("fetchCustomPersonasFromCMS", () => {
  test("an old-key row is read as flexibility, value unchanged, old key gone", async () => {
    cmsReturns([{ name: "Old Key", slug: "old-key", description: "", traits: JSON.stringify({ mentalModelRigidity: 0.3 }), source: "mcp" }]);
    const [p] = await fetchCustomPersonasFromCMS("cbk_test");
    expect(p.traits.mentalModelFlexibility).toBe(0.3);
    expect("mentalModelRigidity" in p.traits).toBe(false);
  });

  test("a current-key row is unchanged", async () => {
    cmsReturns([{ name: "New Key", slug: "new-key", description: "", traits: { mentalModelFlexibility: 0.65, curiosity: 0.2 }, source: "ai" }]);
    const [p] = await fetchCustomPersonasFromCMS("cbk_test");
    expect(p.traits).toEqual({ mentalModelFlexibility: 0.65, curiosity: 0.2 });
  });
});
