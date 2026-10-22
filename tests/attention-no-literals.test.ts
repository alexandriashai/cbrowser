/**
 * No hand-set number may live inline in the attention model.
 *
 * Parses attention-transport.ts with the TypeScript compiler and collects
 * every numeric literal in the whole file: the file is the model, so a new
 * helper is covered the moment it is written. Only 0, 1 and 2 are allowed
 * (with -1 arising as unary minus on 1): identity, "nothing", the halving in a
 * centre and a square need no provenance. Anything else belongs in
 * visual/provenance/attention.ts, read through param().
 *
 * One initializer is exempt, by name: WEB_SPATIAL_PRIOR, the fitted 12x16
 * table, which is registered as a single entry by checksum and refused at use
 * when it stops matching (tests/attention-provenance.test.ts). The exemption
 * covers that array literal and nothing else in the file.
 *
 * Numbers inside strings, comments and regular expressions are not literals
 * and are not checked.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const PATH = join(import.meta.dir, "..", "src", "visual", "attention-transport.ts");
const ALLOWED = new Set([0, 1, 2]);
const EXEMPT_INITIALIZER = "WEB_SPATIAL_PRIOR";

export function attentionInlineLiterals(source: string): { found: Array<{ fn: string; value: number; line: number }>; exemptCount: number } {
  const sf = ts.createSourceFile("attention-transport.ts", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: Array<{ fn: string; value: number; line: number }> = [];
  let exemptCount = 0;

  const countExempt = (node: ts.Node) => {
    if (ts.isNumericLiteral(node)) exemptCount++;
    ts.forEachChild(node, countExempt);
  };

  const visit = (node: ts.Node, fn: string) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === EXEMPT_INITIALIZER && node.initializer
      && ts.isArrayLiteralExpression(node.initializer)) {
      countExempt(node.initializer);
      return;
    }
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
  return { found, exemptCount };
}

describe("the attention model carries no inline constants", () => {
  const source = readFileSync(PATH, "utf8");

  test("the file is the model and reads its constants through param()", () => {
    // Guards against a vacuous pass: a moved or emptied file has no literals either.
    expect(source).toContain("export async function analyzeAttention(");
    expect(source).toContain("export function buildSemanticMap(");
    expect(source).toContain("export async function computeLabSaliency(");
    expect(source).toContain("from './model-provenance.js'");
    expect((source.match(/param\(/g) ?? []).length).toBeGreaterThanOrEqual(60);
  });

  test("only 0, 1 and 2 appear as numeric literals, outside the fitted prior table", () => {
    const { found, exemptCount } = attentionInlineLiterals(source);
    expect(found.map((o) => `${o.fn}:${o.line} = ${o.value}`)).toEqual([]);
    // The exemption is the 192-cell table and only that.
    expect(exemptCount).toBe(192);
  });

  test("the detector goes red on a literal put back in a function (absence test of the test)", () => {
    const marker = "const params = computeValueAttentionParams(filter, schwartzValues);";
    expect(source).toContain(marker);
    const { found } = attentionInlineLiterals(source.replace(marker, `${marker} const leak = 0.37;`));
    expect(found.map((o) => `${o.fn} = ${o.value}`)).toEqual(["applyPersonaFilter = 0.37"]);
  });

  test("a registered weight typed back inline is caught where it lands", () => {
    const marker = "    let weight = TYPE_W[elType] ?? typeFallback;";
    expect(source).toContain(marker);
    const { found } = attentionInlineLiterals(source.replace(marker, "    let weight = TYPE_W[elType] ?? 0.2;"));
    expect(found.map((o) => `${o.fn} = ${o.value}`)).toEqual(["buildSemanticMap = 0.2"]);
  });

  test("a second table at module level is not covered by the exemption", () => {
    const { found } = attentionInlineLiterals(`${source}\nconst ANOTHER_PRIOR = [0.25, 0.75];\n`);
    expect(found.map((o) => o.value)).toEqual([0.25, 0.75]);
  });
});
