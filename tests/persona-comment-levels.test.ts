/**
 * A level word in the comment beside a persona trait value agrees with the value.
 *
 * personas.ts labels most values with a level word ("Low - gives up if
 * fiddly"). The 2026-08-02 doc reconciliation moved 159 values and left the
 * comment beside each one as it was, so a "Very high" sat beside 0.7 and a
 * "Medium" beside 0.2. A reader trusts the word; the tools run on the number.
 *
 * The check is deliberately coarse. Each word allows a band, wide enough
 * that a neighbouring reading passes ("Low" beside 0.4, "Medium" beside 0.6),
 * and the extreme words are held to the extremes, the reading the 21.0
 * comment corrections used ("Very high" needs 0.75 or more). Only a word that
 * opens the trailing comment counts: leading comment blocks are prose, and
 * "Low = ..." there defines the scale's end, not the persona.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const PERSONAS_PATH = join(import.meta.dir, "..", "src", "personas.ts");
const TABLES = new Set(["BUILTIN_PERSONAS", "ACCESSIBILITY_PERSONAS", "EMOTIONAL_PERSONAS"]);

/** The values each opening level word allows, longest phrase first. */
const BANDS: Array<[RegExp, number, number]> = ([
  ["almost none", 0, 0.15], ["minimum", 0, 0.15], ["extremely low", 0, 0.15],
  ["maximum", 0.85, 1], ["extremely high", 0.85, 1], ["full", 0.85, 1],
  ["very low", 0, 0.25], ["very high", 0.75, 1],
  ["low-medium", 0.25, 0.5], ["low-med", 0.25, 0.5], ["low-moderate", 0.25, 0.5], ["medium-low", 0.25, 0.5],
  ["medium-high", 0.5, 0.8], ["moderate-high", 0.5, 0.8],
  ["low", 0, 0.4], ["high", 0.6, 1],
  ["medium", 0.4, 0.6], ["moderate", 0.4, 0.6], ["neutral", 0.4, 0.6], ["balanced", 0.4, 0.6],
] as Array<[string, number, number]>).map(([w, lo, hi]) => [new RegExp(`^${w.replace("-", "[- ]")}\\b(?!-)(?!\\s*=)`, "i"), lo, hi]);

export interface Labelled { id: string; value: number; comment: string; line: number }

/** Every cognitive trait value with a trailing comment, from the source text. */
export function labelled(source: string): Labelled[] {
  const sf = ts.createSourceFile("personas.ts", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const lines = source.split("\n");
  const key = (n: ts.PropertyName) => (ts.isIdentifier(n) || ts.isStringLiteral(n) ? n.text : n.getText(sf));
  const out: Labelled[] = [];
  ts.forEachChild(sf, (stmt) => {
    if (!ts.isVariableStatement(stmt)) return;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !TABLES.has(decl.name.text) || !decl.initializer || !ts.isObjectLiteralExpression(decl.initializer)) continue;
      for (const p of decl.initializer.properties) {
        if (!ts.isPropertyAssignment(p) || !ts.isObjectLiteralExpression(p.initializer)) continue;
        for (const q of p.initializer.properties) {
          if (!ts.isPropertyAssignment(q) || key(q.name) !== "cognitiveTraits" || !ts.isObjectLiteralExpression(q.initializer)) continue;
          for (const t of q.initializer.properties) {
            if (!ts.isPropertyAssignment(t) || !ts.isNumericLiteral(t.initializer)) continue;
            const line = sf.getLineAndCharacterOfPosition(t.getStart(sf)).line;
            const at = lines[line].indexOf("//");
            if (at < 0) continue;
            out.push({ id: `${key(p.name)}.${key(t.name)}`, value: Number(t.initializer.text), comment: lines[line].slice(at + 2).trim(), line: line + 1 });
          }
        }
      }
    }
  });
  return out;
}

/** Values whose opening level word does not allow them. */
export function disagreements(items: Labelled[]): string[] {
  const out: string[] = [];
  for (const it of items) {
    const band = BANDS.find(([re]) => re.test(it.comment));
    if (band && (it.value < band[1] || it.value > band[2])) out.push(`${it.id} = ${it.value} (line ${it.line}): "${it.comment}"`);
  }
  return out;
}

const items = labelled(readFileSync(PERSONAS_PATH, "utf8"));

describe("persona trait comments", () => {
  test("the reader finds the labelled values", () => {
    expect(items.length).toBeGreaterThan(300);
    expect(items.filter((i) => BANDS.some(([re]) => re.test(i.comment))).length).toBeGreaterThan(250);
  });

  test("every opening level word agrees with the value beside it", () => {
    expect(disagreements(items)).toEqual([]);
  });

  test("a level word against its value is reported, and a neighbouring reading is not (absence test)", () => {
    const at = (value: number, comment: string): Labelled => ({ id: "p.t", value, comment, line: 1 });
    expect(disagreements([at(0.2, "Medium - careful but experienced")])).toHaveLength(1);
    expect(disagreements([at(0.7, "Very high - plans carefully")])).toHaveLength(1);
    expect(disagreements([at(0.8, "Maximum - emotions barely register")])).toHaveLength(1);
    expect(disagreements([at(0.4, "Low - gives up if fiddly"), at(0.6, "Medium - knows mobile patterns")])).toEqual([]);
    expect(disagreements([at(0.5, "Low-Med - constant phone interruptions")])).toEqual([]);
    // "Low =" defines a scale end; a comment that opens with no level word is not judged.
    expect(disagreements([at(0.9, "Low = only clicks the obvious"), at(0.1, "Long-term - invests in learning")])).toEqual([]);
  });
});
