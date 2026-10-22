/**
 * Every number in the perceptual profiles has exactly one provenance entry,
 * with the identical value.
 *
 * The entries are catalogued from PERCEPTUAL_PROFILES and DEFAULT_PROFILE at
 * module load, not read through param() (see provenance/perceptual.ts). This
 * test checks them against two independent enumerations: a walk of the
 * runtime objects, and a parse of perceptual-transport.ts itself, so a
 * catalogue that read the wrong object or a value altered at load would show
 * up as a mismatch with the source text. The count is pinned, and a profile,
 * barrier key or filter field the catalogue has no description for is
 * reported as uncovered rather than silently registered.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import {
  PERCEPTUAL_PROVENANCE,
  PERCEPTUAL_PROVENANCE_UNCOVERED,
  PERCEPTUAL_PROVENANCE_KEYS,
  cataloguePerceptualProfiles,
} from "../src/visual/provenance/perceptual.js";
import { PERCEPTUAL_PROFILES, DEFAULT_PROFILE, type PerceptualProfile } from "../src/visual/perceptual-transport.js";
import { MODEL_PROVENANCE } from "../src/visual/model-provenance.js";

const PATH = join(import.meta.dir, "..", "src", "visual", "perceptual-transport.ts");

// Pinned exactly: 13 built-in profiles plus the default.
const PROFILE_COUNT = 13;
const ENTRY_COUNT = 244;

/** Walk the runtime objects: id -> value for every numeric leaf of barrierWeights and visualFilter. */
function runtimeLeaves(): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (name: string, p: PerceptualProfile) => {
    for (const [k, v] of Object.entries(p.barrierWeights)) out.set(`perceptual.${name}.barrierWeights.${k}`, v);
    for (const [k, v] of Object.entries(p.visualFilter)) {
      if (Array.isArray(v)) v.forEach((x, i) => out.set(`perceptual.${name}.visualFilter.${k}.${"rgb"[i]}`, x));
      else if (typeof v === "number") out.set(`perceptual.${name}.visualFilter.${k}`, v);
    }
  };
  for (const [name, p] of Object.entries(PERCEPTUAL_PROFILES)) walk(name, p);
  walk("default", DEFAULT_PROFILE);
  return out;
}

/** Parse the source: id -> value for every numeric literal in the two tables. */
function sourceLeaves(): { values: Map<string, number>; nonLiteral: string[] } {
  const src = readFileSync(PATH, "utf8");
  const sf = ts.createSourceFile("perceptual-transport.ts", src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const values = new Map<string, number>();
  const nonLiteral: string[] = [];
  const num = (e: ts.Expression): number | null => {
    if (ts.isNumericLiteral(e)) return Number(e.text);
    if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(e.operand)) return -Number(e.operand.text);
    return null;
  };
  const key = (n: ts.PropertyName) => (ts.isIdentifier(n) || ts.isStringLiteral(n) ? n.text : n.getText(sf));
  const profile = (name: string, obj: ts.ObjectLiteralExpression) => {
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop) || !ts.isObjectLiteralExpression(prop.initializer)) continue;
      const group = key(prop.name);
      if (group !== "barrierWeights" && group !== "visualFilter") continue;
      for (const leaf of prop.initializer.properties) {
        if (!ts.isPropertyAssignment(leaf)) { nonLiteral.push(`${name}.${group}.?`); continue; }
        const k = key(leaf.name);
        if (ts.isArrayLiteralExpression(leaf.initializer)) {
          leaf.initializer.elements.forEach((el, i) => {
            const v = num(el as ts.Expression);
            if (v === null) nonLiteral.push(`${name}.${group}.${k}.${i}`);
            else values.set(`perceptual.${name}.${group}.${k}.${"rgb"[i]}`, v);
          });
          continue;
        }
        if (ts.isStringLiteral(leaf.initializer)) continue; // attentionMode
        const v = num(leaf.initializer);
        if (v === null) nonLiteral.push(`${name}.${group}.${k}`);
        else values.set(`perceptual.${name}.${group}.${k}`, v);
      }
    }
  };
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      if (node.name.text === "PERCEPTUAL_PROFILES") {
        for (const p of node.initializer.properties) {
          if (ts.isPropertyAssignment(p) && ts.isObjectLiteralExpression(p.initializer)) profile(key(p.name), p.initializer);
        }
      } else if (node.name.text === "DEFAULT_PROFILE") {
        profile("default", node.initializer);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { values, nonLiteral };
}

describe("perceptual profile provenance", () => {
  const byId = new Map(PERCEPTUAL_PROVENANCE.map((e) => [e.id, e]));

  test("pinned counts, nothing uncovered, every id unique", () => {
    expect(Object.keys(PERCEPTUAL_PROFILES).length).toBe(PROFILE_COUNT);
    expect(PERCEPTUAL_PROVENANCE.length).toBe(ENTRY_COUNT);
    expect(byId.size).toBe(ENTRY_COUNT);
    expect(PERCEPTUAL_PROVENANCE_UNCOVERED).toEqual([]);
  });

  test("the catalogue equals a walk of the runtime profiles, value for value", () => {
    const leaves = runtimeLeaves();
    expect([...byId.keys()].sort()).toEqual([...leaves.keys()].sort());
    for (const [id, v] of leaves) expect(byId.get(id)!.value).toBe(v);
  });

  test("the catalogue equals the literals in the source text", () => {
    const { values, nonLiteral } = sourceLeaves();
    expect(nonLiteral).toEqual([]);
    expect(values.size).toBe(ENTRY_COUNT);
    for (const [id, v] of values) expect(byId.get(id)?.value).toBe(v);
  });

  test("built-in values are hypotheses naming what would test them; the default profile is definition", () => {
    for (const e of PERCEPTUAL_PROVENANCE) {
      expect(MODEL_PROVENANCE[e.id]).toBe(e);
      if (e.id.startsWith("perceptual.default.")) {
        expect(e.status).toBe("definition");
        expect(e.source).toContain("models no one");
      } else {
        expect(e.status).toBe("hypothesis");
        expect(e.source).toMatch(/What would (fit|test) it/);
      }
    }
  });

  test("an unknown profile, barrier key or filter field is reported as uncovered, not registered (absence test)", () => {
    const base = PERCEPTUAL_PROFILES["first-timer"];
    const { entries, uncovered } = cataloguePerceptualProfiles({
      ...PERCEPTUAL_PROFILES,
      "new-profile": { ...base, persona: "new-profile" },
      "first-timer": {
        ...base,
        barrierWeights: { ...base.barrierWeights, brand_new_barrier: 2 },
        visualFilter: { ...base.visualFilter, squint: 0.5 } as never,
      },
    }, DEFAULT_PROFILE);
    expect(uncovered).toContain("perceptual.first-timer.barrierWeights.brand_new_barrier");
    expect(uncovered).toContain("perceptual.first-timer.visualFilter.squint");
    expect(uncovered.filter((id) => id.startsWith("perceptual.new-profile.")).length).toBeGreaterThan(10);
    expect(entries.some((e) => e.id.startsWith("perceptual.new-profile."))).toBe(false);
  });

  test("the hand-written tables have no stale keys", () => {
    const leaves = [...runtimeLeaves().keys()];
    for (const b of PERCEPTUAL_PROVENANCE_KEYS.barriers) expect(leaves.some((id) => id.endsWith(`.barrierWeights.${b}`))).toBe(true);
    for (const f of PERCEPTUAL_PROVENANCE_KEYS.filterFields) expect(leaves.some((id) => id.endsWith(`.visualFilter.${f}`))).toBe(true);
    expect([...PERCEPTUAL_PROVENANCE_KEYS.populations].sort()).toEqual(Object.keys(PERCEPTUAL_PROFILES).sort());
  });
});
