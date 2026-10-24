/**
 * Every hand-set trait value of a built-in persona has exactly one
 * provenance entry, with the identical value.
 *
 * The entries are catalogued from the persona objects at module load, not
 * read through param() (see src/visual/provenance/personas.ts). This test
 * checks them against two independent enumerations: a walk of the runtime
 * persona tables, and a parse of personas.ts itself, so a value that load-time
 * code altered, or a catalogue that read the wrong object, would show up as a
 * mismatch with the source text. The count is pinned, so a trait value added
 * to or removed from a built-in persona changes it on purpose, and a persona
 * or trait name the catalogue has no population or measure for is reported as
 * uncovered rather than silently registered.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import {
  PERSONA_PROVENANCE,
  PERSONA_PROVENANCE_UNCOVERED,
  PERSONA_PROVENANCE_KEYS,
  PERSONA_TABLES,
  TRAIT_GROUPS,
  NORM_ANCHORS,
  cataloguePersonaTraits,
} from "../src/visual/provenance/personas.js";
import { MODEL_PROVENANCE } from "../src/visual/model-provenance.js";
import { _normalCDF as Phi } from "../src/visual/cognitive-models.js";

const PERSONAS_PATH = join(import.meta.dir, "..", "src", "personas.ts");

// Pinned exactly. 25 personas: 10 built-in, 11 accessibility, 4 emotional.
const PERSONA_COUNT = 25;
const ENTRY_COUNT = 686;

// The cells set to their norm-implied value (research/persona-norms/applied.md).
const NORM_ANCHORED = ["autism-spectrum.workingMemory", "cognitive-adhd.workingMemory"];

/**
 * Anchored entries whose value is not Phi(z) to two decimals, falls outside
 * the source's interval, or does not name the source. Empty when all hold.
 */
function anchorMismatches(entries: Array<{ id: string; value: number; source: string }>): string[] {
  const out: string[] = [];
  for (const [key, a] of Object.entries(NORM_ANCHORS)) {
    const e = entries.find((x) => x.id === `persona.${key}`);
    const expected = Math.round(Phi(a.z) * 100) / 100;
    const ok = !!e && Object.is(e.value, expected) &&
      e.value >= Phi(a.zLo) && e.value <= Phi(a.zHi) &&
      e.source.includes(a.cite) && e.source.includes("norm-anchored");
    if (!ok) out.push(`persona.${key}`);
  }
  return out;
}

/** Cited values not on the side of neutral their citation states, sorted. */
function wrongSide(directions: Record<string, "low" | "mid" | "high">, valueOf: (key: string) => number | undefined): string[] {
  const on = { low: (v: number) => v < 0.5, mid: (v: number) => v >= 0.45 && v <= 0.55, high: (v: number) => v > 0.5 };
  return Object.entries(directions)
    .filter(([k, d]) => { const v = valueOf(k); return v === undefined || !on[d](v); })
    .map(([k]) => k)
    .sort();
}

/** Walk the runtime tables: id -> value for every numeric trait. */
function runtimeTraits(): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const table of Object.values(PERSONA_TABLES) as Array<Record<string, Record<string, unknown>>>) {
    for (const [name, persona] of Object.entries(table)) {
      for (const group of TRAIT_GROUPS) {
        const traits = persona[group] as Record<string, unknown> | undefined;
        if (!traits) continue;
        for (const [trait, value] of Object.entries(traits)) {
          if (typeof value !== "number") continue;
          const id = `persona.${name}.${trait}`;
          out.set(id, [...(out.get(id) ?? []), value]);
        }
      }
    }
  }
  return out;
}

/** Parse personas.ts: id -> value for every numeric literal trait, plus anything that is not a literal. */
function sourceTraits(): { values: Map<string, number>; nonLiteral: string[]; personas: string[] } {
  const src = readFileSync(PERSONAS_PATH, "utf8");
  const sf = ts.createSourceFile("personas.ts", src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const values = new Map<string, number>();
  const nonLiteral: string[] = [];
  const personas: string[] = [];
  const tables = new Set(Object.keys(PERSONA_TABLES));
  const groups = new Set<string>(TRAIT_GROUPS);
  const key = (n: ts.PropertyName) => (ts.isIdentifier(n) || ts.isStringLiteral(n) ? n.text : n.getText(sf));

  ts.forEachChild(sf, (stmt) => {
    if (!ts.isVariableStatement(stmt)) return;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !tables.has(decl.name.text)) continue;
      const table = decl.initializer;
      if (!table || !ts.isObjectLiteralExpression(table)) throw new Error(`${decl.name.text} is not an object literal`);
      for (const p of table.properties) {
        if (!ts.isPropertyAssignment(p) || !ts.isObjectLiteralExpression(p.initializer)) continue;
        const persona = key(p.name);
        personas.push(persona);
        for (const q of p.initializer.properties) {
          if (!ts.isPropertyAssignment(q) || !groups.has(key(q.name)) || !ts.isObjectLiteralExpression(q.initializer)) continue;
          for (const t of q.initializer.properties) {
            if (!ts.isPropertyAssignment(t)) { nonLiteral.push(`${persona}.${t.getText(sf)}`); continue; }
            const id = `persona.${persona}.${key(t.name)}`;
            const init = t.initializer;
            if (ts.isNumericLiteral(init)) values.set(id, Number(init.text));
            else if (init.kind !== ts.SyntaxKind.TrueKeyword && init.kind !== ts.SyntaxKind.FalseKeyword && !ts.isStringLiteral(init)) nonLiteral.push(id);
          }
        }
      }
    }
  });
  return { values, nonLiteral, personas };
}

const byId = new Map(PERSONA_PROVENANCE.map((e) => [e.id, e]));

describe("persona trait provenance", () => {
  test("every numeric trait of a built-in persona has a description (nothing uncovered)", () => {
    expect([...PERSONA_PROVENANCE_UNCOVERED]).toEqual([]);
  });

  test("the catalogue is pinned: 25 personas and every one of their numeric trait values", () => {
    const personas = new Set(PERSONA_PROVENANCE.map((e) => e.id.split(".")[1]));
    expect(personas.size).toBe(PERSONA_COUNT);
    expect(PERSONA_PROVENANCE.length).toBe(ENTRY_COUNT);
  });

  test("each runtime trait value has exactly one entry with the identical value, and no entry is extra", () => {
    const runtime = runtimeTraits();
    for (const [id, vals] of runtime) {
      expect({ id, occurrences: vals.length }).toEqual({ id, occurrences: 1 });
      expect({ id, value: byId.get(id)?.value }).toEqual({ id, value: vals[0] });
      expect(Object.is(byId.get(id)?.value, vals[0])).toBe(true);
    }
    expect(PERSONA_PROVENANCE.length).toBe(runtime.size);
    expect(byId.size).toBe(PERSONA_PROVENANCE.length);
  });

  test("the registry agrees with the numbers as written in personas.ts", () => {
    const { values, nonLiteral, personas } = sourceTraits();
    expect(personas.length).toBe(PERSONA_COUNT);
    expect(nonLiteral).toEqual([]);
    expect([...values.keys()].sort()).toEqual([...byId.keys()].sort());
    const mismatched = [...values].filter(([id, v]) => !Object.is(byId.get(id)?.value, v));
    expect(mismatched).toEqual([]);
  });

  test("every entry is merged into MODEL_PROVENANCE and is an honest hypothesis", () => {
    for (const e of PERSONA_PROVENANCE) {
      expect(MODEL_PROVENANCE[e.id]).toBe(e);
      expect(e.status).toBe("hypothesis");
      expect(e.source).toMatch(/would (then )?test it/);
      const anchored = NORM_ANCHORED.includes(e.id.slice("persona.".length));
      expect({ id: e.id, says: e.source.match(/set by hand|norm-anchored/)?.[0] })
        .toEqual({ id: e.id, says: anchored ? "norm-anchored" : "set by hand" });
    }
  });

  test("a norm-anchored value is Phi of its source's z to two decimals, inside the source's 95% CI, and still a hypothesis", () => {
    expect([...PERSONA_PROVENANCE_KEYS.normAnchors].sort()).toEqual(NORM_ANCHORED);
    expect(anchorMismatches(PERSONA_PROVENANCE)).toEqual([]);
    for (const key of NORM_ANCHORED) {
      const e = byId.get(`persona.${key}`)!;
      expect(e.status).toBe("hypothesis");
      expect(e.source).toContain("Still a hypothesis");
      expect(e.source).toContain("Until 21.0 the value was");
      // An anchored value is a measurement-derived number, so it is not also
      // described as a direction-only citation.
      expect(PERSONA_PROVENANCE_KEYS.valueCitations).not.toContain(key);
    }
  });

  test("an anchored value moved off Phi(z) is caught (absence test)", () => {
    const [persona, trait] = NORM_ANCHORED[0].split(".");
    const tampered = {
      ...PERSONA_TABLES,
      ACCESSIBILITY_PERSONAS: {
        ...PERSONA_TABLES.ACCESSIBILITY_PERSONAS,
        [persona]: {
          ...PERSONA_TABLES.ACCESSIBILITY_PERSONAS[persona as keyof typeof PERSONA_TABLES.ACCESSIBILITY_PERSONAS],
          cognitiveTraits: {
            ...PERSONA_TABLES.ACCESSIBILITY_PERSONAS[persona as keyof typeof PERSONA_TABLES.ACCESSIBILITY_PERSONAS].cognitiveTraits,
            [trait]: 0.6,
          },
        },
      },
    } as unknown as Parameters<typeof cataloguePersonaTraits>[0];
    expect(anchorMismatches(cataloguePersonaTraits(tampered).entries)).toEqual([`persona.${NORM_ANCHORED[0]}`]);
  });

  test("a citation beside a value is named in that entry and never upgrades its status", () => {
    const cited = PERSONA_PROVENANCE_KEYS.valueCitations;
    expect(cited.length).toBeGreaterThan(0);
    for (const k of cited) {
      const e = byId.get(`persona.${k}`);
      expect({ k, registered: !!e }).toEqual({ k, registered: true });
      expect(e!.source).toContain("Cited beside the value in personas.ts");
      expect(e!.source).toContain("not a measurement of");
      expect(e!.status).toBe("hypothesis");
    }
    const withCitation = PERSONA_PROVENANCE.filter((e) => e.source.includes("Cited beside the value"));
    expect(withCitation.length).toBe(cited.length);
  });

  test("a value sits on the side of neutral its citation states", () => {
    // The 2026-08-02 doc reconciliation moved four cited values off the side
    // the finding beside them states; 21.0 restored them. This is the guard
    // against the next one.
    const directions = PERSONA_PROVENANCE_KEYS.citedDirections;
    expect(Object.keys(directions).length).toBe(17);
    expect(wrongSide(directions, (k) => byId.get(`persona.${k}`)?.value)).toEqual([]);
  });

  test("a cited value moved across neutral is caught (absence test)", () => {
    const moved: Record<string, number> = { "low-vision-magnified.selfEfficacy": 0.6, "dyslexic-user.resilience": 0.6 };
    expect(wrongSide(PERSONA_PROVENANCE_KEYS.citedDirections, (k) => moved[k] ?? byId.get(`persona.${k}`)?.value))
      .toEqual(["dyslexic-user.resilience", "low-vision-magnified.selfEfficacy"]);
  });

  test("the hand-written tables carry no stale keys", () => {
    const personas = new Set(PERSONA_PROVENANCE.map((e) => e.id.split(".")[1]));
    const traits = new Set(PERSONA_PROVENANCE.map((e) => e.id.split(".")[2]));
    expect(PERSONA_PROVENANCE_KEYS.populations.filter((p) => !personas.has(p))).toEqual([]);
    expect(PERSONA_PROVENANCE_KEYS.notes.filter((p) => !personas.has(p))).toEqual([]);
    expect(PERSONA_PROVENANCE_KEYS.normAnchors.filter((k) => !byId.has(`persona.${k}`))).toEqual([]);
    expect(PERSONA_PROVENANCE_KEYS.measures.filter((t) => !traits.has(t))).toEqual([]);
  });

  test("an unregistered persona or trait name is reported, not silently catalogued (absence test)", () => {
    const tampered = {
      ...PERSONA_TABLES,
      EXTRA: {
        "new-persona": { cognitiveTraits: { patience: 0.5 } },
        "power-user": { cognitiveTraits: { brandNewTrait: 0.4 } },
      },
    } as unknown as Parameters<typeof cataloguePersonaTraits>[0];
    const { entries, uncovered } = cataloguePersonaTraits(tampered);
    expect(uncovered.sort()).toEqual(["persona.new-persona.patience", "persona.power-user.brandNewTrait"]);
    expect(entries.length).toBe(ENTRY_COUNT);
  });

  test("a value added to a known persona under a known trait is catalogued, so the pin catches it", () => {
    const tampered = {
      ...PERSONA_TABLES,
      BUILTIN_PERSONAS: {
        ...PERSONA_TABLES.BUILTIN_PERSONAS,
        "power-user": {
          ...PERSONA_TABLES.BUILTIN_PERSONAS["power-user"],
          accessibilityTraits: { motorControl: 0.9 },
        },
      },
    } as unknown as Parameters<typeof cataloguePersonaTraits>[0];
    const { entries, uncovered } = cataloguePersonaTraits(tampered);
    expect(uncovered).toEqual([]);
    expect(entries.length).toBe(ENTRY_COUNT + 1);
    expect(entries.find((e) => e.id === "persona.power-user.motorControl")?.value).toBe(0.9);
  });
});
