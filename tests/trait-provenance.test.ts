/**
 * The persona tools say where each trait value comes from.
 *
 * Every built-in persona trait value is registered in MODEL_PROVENANCE as
 * persona.<name>.<trait>, status hypothesis (provenance/personas.ts). The
 * persona views drew built-in and custom values on the same meters with
 * nothing saying which was which, or that either was set by hand.
 * persona_lookup and persona_manager now carry a compact block per trait group:
 * the status, the citation personas.ts places beside a value (for its
 * direction, not its number), and which shown values the persona does not set.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-trait-prov-"));

const { MODEL_PROVENANCE } = await import("../src/visual/model-provenance.js");
const { PERSONA_PROVENANCE_KEYS } = await import("../src/visual/provenance/personas.js");
const { citationOf, traitProvenance, builtinTraitValues, traitScaleNote, CUSTOM_LABEL } = await import("../src/mcp-tools/trait-provenance.js");
const { PERSONA_TABLES } = await import("../src/visual/provenance/personas.js");
const { createCognitivePersona, saveCustomPersona, getAnyPersona, getCognitiveProfile, BUILTIN_PERSONAS } = await import("../src/personas.js");
const { registerValuesTools } = await import("../src/mcp-tools/base/values-tools.js");
const { registerPersonaLifecycleTools } = await import("../src/mcp-tools/persona-lifecycle-tools.js");

type Handler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ type: string; text: string }> }>;
const handlers: Record<string, Handler> = {};
const fake = {
  registerTool: (name: string, _cfg: unknown, fn: Handler) => { handlers[name] = fn; },
  tool: () => {}, registerResource: () => {}, resource: () => {},
} as never;
const call = async (name: string, args: Record<string, unknown>) =>
  JSON.parse((await handlers[name](args)).content.find((c) => c.type === "text")!.text);

const CUSTOM = "zz-prov-custom";
// A custom persona saved under a built-in's name shadows it everywhere
// getAnyPersona resolves names; its values are the user's, not the registry's.
const SHADOW = "first-timer";

beforeAll(() => {
  // Saved with two traits dropped, as an older or hand-written persona file
  // has them: the profile then fills those two with defaults.
  const custom = createCognitivePersona(CUSTOM, "A custom persona for the provenance tests.", { patience: 0.2, curiosity: 0.9 });
  const own = custom.cognitiveTraits as unknown as Record<string, number>;
  delete own.anchoringBias;
  delete own.timeHorizon;
  saveCustomPersona(custom);
  registerValuesTools(fake, {} as never);
  registerPersonaLifecycleTools(fake);
});

describe("citationOf reads the citation personas.ts places beside a value", () => {
  const personaEntries = Object.values(MODEL_PROVENANCE).filter((e) => e.id.startsWith("persona."));
  const citedKeys = new Set(PERSONA_PROVENANCE_KEYS.valueCitations);

  test("every registered value with a citation yields it, and no other value does", () => {
    expect(personaEntries.length).toBeGreaterThan(600);
    const wrong: string[] = [];
    for (const e of personaEntries) {
      const key = e.id.slice("persona.".length);
      const c = citationOf(e.source);
      if (citedKeys.has(key) !== !!c) wrong.push(`${key}: expected ${citedKeys.has(key) ? "a citation" : "none"}`);
      if (c && (!c.cite || !c.for || !e.source.includes(c.cite) || !e.source.includes(c.for))) wrong.push(`${key}: ${JSON.stringify(c)}`);
    }
    expect(wrong).toEqual([]);
  });

  test("the Kofler citation on cognitive-adhd.workingMemory comes out whole", () => {
    const c = citationOf(MODEL_PROVENANCE["persona.cognitive-adhd.workingMemory"].source);
    expect(c?.cite).toContain("Kofler et al. 2020");
    expect(c?.for).toContain("central-executive working-memory impairment");
  });
});

describe("traitProvenance", () => {
  test("a built-in persona's values are hypotheses, with their citations and its unset traits", () => {
    const rec = getAnyPersona("cognitive-adhd")!;
    const shown = getCognitiveProfile(rec as never).traits as unknown as Record<string, number>;
    const p = traitProvenance("cognitive-adhd", rec, shown, "cognitiveTraits");
    expect(p.status).toBe("hypothesis");
    expect(p.label).toBe("hypothesis");
    expect(p.cited?.workingMemory?.cite).toContain("Kofler");
    // Every cited trait is a registered hypothesis for this persona.
    for (const t of Object.keys(p.cited ?? {})) expect(MODEL_PROVENANCE[`persona.cognitive-adhd.${t}`]?.status).toBe("hypothesis");
    // A shown value the persona does not set is the model default, not a registered value.
    for (const t of p.unset ?? []) expect(MODEL_PROVENANCE[`persona.cognitive-adhd.${t}`]).toBeUndefined();
    expect(p.note).toMatch(/set by hand/);
  });

  test("a custom persona's values are custom (user-set), never hypotheses", () => {
    const rec = getAnyPersona(CUSTOM)!;
    const p = traitProvenance(CUSTOM, rec, (rec as { cognitiveTraits: Record<string, number> }).cognitiveTraits, "cognitiveTraits");
    expect(p.status).toBe("custom");
    expect(p.label).toBe(CUSTOM_LABEL);
    expect(CUSTOM_LABEL).toBe("custom (user-set)");
    expect(p.cited).toBeUndefined();
  });

  test("a custom persona under a built-in's name is custom: the registry describes the shipped record, not this one", () => {
    const shadow = { ...BUILTIN_PERSONAS[SHADOW], cognitiveTraits: { ...BUILTIN_PERSONAS[SHADOW].cognitiveTraits, patience: 0.99 } };
    const p = traitProvenance(SHADOW, shadow, shadow.cognitiveTraits as unknown as Record<string, number>, "cognitiveTraits");
    expect(p.status).toBe("custom");
  });

  test("accessibility traits of a built-in accessibility persona are hypotheses too", () => {
    const rec = getAnyPersona("dyslexic-user") as unknown as Record<string, unknown>;
    const shown = rec.accessibilityTraits as Record<string, number>;
    const p = traitProvenance("dyslexic-user", rec, shown, "accessibilityTraits");
    expect(p.status).toBe("hypothesis");
    expect(p.unset ?? []).toEqual([]);
  });
});

describe("the persona tools carry the block", () => {
  test("persona_lookup: built-in traits and accessibility traits say hypothesis; a custom persona says custom", async () => {
    const adhd = await call("persona_lookup", { persona: "cognitive-adhd" });
    expect(adhd.traitProvenance.status).toBe("hypothesis");
    expect(adhd.traitProvenance.cited.workingMemory.cite).toContain("Kofler");
    expect(adhd.accessibilityProvenance.status).toBe("hypothesis");
    const custom = await call("persona_lookup", { persona: CUSTOM });
    expect(custom.traitProvenance.status).toBe("custom");
    expect(custom.traitProvenance.label).toBe("custom (user-set)");
    // The profile fills traits the persona does not set with defaults; those are named.
    expect(custom.traitProvenance.unset).toEqual(["anchoringBias", "timeHorizon"]);
  });

  test("persona_manager: every roster entry says where its values come from", async () => {
    const all = await call("persona_manager", { filter: "all" });
    const byName = Object.fromEntries(all.personas.map((p: { name: string }) => [p.name, p]));
    // The roster lists BUILTIN_PERSONAS and customs (listPersonas), not the
    // accessibility or emotional tables.
    expect(byName["elderly-user"].provenance.status).toBe("hypothesis");
    expect(byName["elderly-user"].provenance.cited.proceduralFluency.cite).toContain("Fisk et al. 2009");
    expect(byName[CUSTOM].provenance.label).toBe("custom (user-set)");
    for (const p of all.personas) expect(["hypothesis", "custom"]).toContain(p.provenance.status);
    // The roster ships every persona's traits under the host's ~150k result cap.
    expect(JSON.stringify(all).length).toBeLessThan(120_000);
  });

  test("the survey mode no longer promises research-backed defaults", async () => {
    const all = await call("persona_manager", { filter: "custom" });
    expect(all.modes.survey.note).not.toMatch(/research/i);
    expect(all.modes.survey.note).toMatch(/set by hand/);
  });
});

describe("each value's status is read from the registry, not assumed", () => {
  // A copy of the registry with one cognitive-adhd value recorded as fitted:
  // the block must say so on that value, and stop saying "each value is a hypothesis".
  const withFitted = { ...MODEL_PROVENANCE,
    "persona.cognitive-adhd.patience": { ...MODEL_PROVENANCE["persona.cognitive-adhd.patience"], status: "fitted" as const } };

  test("one value with another status makes the block mixed and names that value", () => {
    const rec = getAnyPersona("cognitive-adhd")!;
    const p = traitProvenance("cognitive-adhd", rec, (rec as { cognitiveTraits: Record<string, number> }).cognitiveTraits, "cognitiveTraits", withFitted);
    expect(p.status).toBe("mixed");
    expect(p.statuses).toEqual({ patience: "fitted" });
    expect(p.note).not.toMatch(/Each value is set by hand/);
    // Against the real registry nothing is named: every value is a hypothesis.
    const real = traitProvenance("cognitive-adhd", rec, (rec as { cognitiveTraits: Record<string, number> }).cognitiveTraits, "cognitiveTraits");
    expect(real.status).toBe("hypothesis");
    expect(real.statuses).toBeUndefined();
  });

  test("the trait view's sentence stops saying 'all hypotheses' once one is not", () => {
    expect(traitScaleNote(builtinTraitValues("patience"))).toMatch(/^The scale source \(researchBasis\) names .* All \d+ built-in personas' values on it are set by hand and registered as hypotheses/);
    const mixed = traitScaleNote(builtinTraitValues("patience", withFitted));
    expect(mixed).not.toMatch(/All \d+ built-in/);
    expect(mixed).toMatch(/of the \d+ built-in personas' values on it are set by hand/);
  });
});

describe("builtinTraitValues: where the shipped personas sit on one trait's scale", () => {
  test("every shipped persona that sets the trait, lowest first, each with its registry status and citation", () => {
    const rows = builtinTraitValues("workingMemory");
    const expected = Object.values(PERSONA_TABLES).flatMap((t) => Object.entries(t as Record<string, { cognitiveTraits?: Record<string, unknown> }>))
      .filter(([, d]) => typeof d.cognitiveTraits?.workingMemory === "number").map(([n]) => n).sort();
    expect(rows.map((r) => r.persona).sort()).toEqual(expected);
    for (let i = 1; i < rows.length; i++) expect(rows[i].value).toBeGreaterThanOrEqual(rows[i - 1].value);
    for (const r of rows) expect(r.status).toBe(MODEL_PROVENANCE[`persona.${r.persona}.workingMemory`].status);
    const cited = new Set(PERSONA_PROVENANCE_KEYS.valueCitations.filter((k) => k.endsWith(".workingMemory")).map((k) => k.split(".")[0]));
    expect(new Set(rows.filter((r) => r.citation).map((r) => r.persona))).toEqual(cited);
    expect(rows.find((r) => r.persona === "cognitive-adhd")?.citation).toMatch(/^Kofler et al\. 2020 .*, cited for .*working-memory impairment/);
  });

  test("persona_trait_lookup carries them, and says what researchBasis does and does not cover", async () => {
    const t = await call("persona_trait_lookup", { trait: "workingMemory", value: 0.3 });
    expect(t.builtinValues).toEqual(builtinTraitValues("workingMemory"));
    expect(t.scaleProvenance).toBe(traitScaleNote(t.builtinValues));
    expect(t.scaleProvenance).toMatch(/written by hand/);
    expect(t.researchBasis).toBeTruthy();
  });
});
