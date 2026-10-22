/**
 * No hand-set number may live inline in the CIF score's arithmetic.
 *
 * Parses cif-score.ts with the TypeScript compiler and collects every numeric
 * literal in the whole file: the file is the scorer, so a new helper is
 * covered the moment it is written. Only 0, 1 and 2 are allowed (with -1
 * arising as unary minus on 1): identity, the bottom of the scale, "nothing
 * detected" and toFixed precision need no provenance. Anything else is a
 * constant that belongs in visual/provenance/cif.ts, read through param(), so
 * the registry and the code cannot disagree. Numbers inside strings are not
 * literals and are not checked; the details text interpolates the registered
 * value wherever it restates one.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const CIF_PATH = join(import.meta.dir, "..", "src", "cif-score.ts");
const ALLOWED = new Set([0, 1, 2]);

export function cifInlineLiterals(source: string): Array<{ fn: string; value: number; line: number }> {
  const sf = ts.createSourceFile("cif-score.ts", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: Array<{ fn: string; value: number; line: number }> = [];

  const visit = (node: ts.Node, fn: string) => {
    const inner = ts.isFunctionDeclaration(node) && node.name ? node.name.text : fn;
    if (ts.isNumericLiteral(node)) {
      const value = Number(node.text);
      if (!ALLOWED.has(value)) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        found.push({ fn: inner, value, line });
      }
    }
    ts.forEachChild(node, (c) => visit(c, inner));
  };
  visit(sf, "(top level)");
  return found;
}

describe("the CIF score's arithmetic carries no inline constants", () => {
  const source = readFileSync(CIF_PATH, "utf8");

  test("the file is the scorer and reads its constants through param()", () => {
    // Guards against a vacuous pass: a moved or emptied file has no literals either.
    expect(source).toContain("export function computeCIFScore");
    expect(source).toContain('from "./visual/model-provenance.js"');
    expect((source.match(/readParams\(/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });

  test("only 0, 1 and 2 appear as numeric literals anywhere in cif-score.ts", () => {
    const offenders = cifInlineLiterals(source);
    expect(offenders.map((o) => `${o.fn}:${o.line} = ${o.value}`)).toEqual([]);
  });

  test("the detector goes red on a literal put back (absence test of the test)", () => {
    const marker = "const P = readParams(MOTOR_IDS);";
    expect(source).toContain(marker);
    const tampered = source.replace(marker, `${marker} const leak = 0.37;`);
    const offenders = cifInlineLiterals(tampered);
    expect(offenders.length).toBe(1);
    expect(offenders[0].fn).toBe("computeMotorFitness");
    expect(offenders[0].value).toBe(0.37);
  });

  test("a weight typed back inline is caught where it lands", () => {
    const marker = "{ score: readability.score, weight: P.wReadability }";
    expect(source).toContain(marker);
    const offenders = cifInlineLiterals(source.replace(marker, "{ score: readability.score, weight: 0.20 }"));
    expect(offenders.map((o) => `${o.fn} = ${o.value}`)).toEqual(["computeCognitiveFitness = 0.2"]);
  });
});
