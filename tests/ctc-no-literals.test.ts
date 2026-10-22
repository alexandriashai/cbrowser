/**
 * No hand-set number may live inline in the chain's arithmetic.
 *
 * Parses cognitive-transport-chain.ts with the TypeScript compiler and walks
 * computeDemandDistribution, computeSequentialCTC and
 * computeSequentialScrollCTC (plus the helpers they call and any function
 * declared inside them), collecting every numeric literal. Only 0, 1 and 2
 * are allowed (with -1 arising as unary minus on 1): identity, clamp bounds
 * and the square in `gap * gap`'s cousin `Math.pow(x, 2)` need no provenance.
 * Anything else is a constant that belongs in provenance/chain.ts, read
 * through param(), so the registry and the code cannot disagree.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const CHAIN_PATH = join(import.meta.dir, "..", "src", "visual", "cognitive-transport-chain.ts");
const WATCHED = ["computeDemandDistribution", "computeSequentialCTC", "computeSequentialScrollCTC", "sigmoid", "traitValue", "readParams"];
const ALLOWED = new Set([0, 1, 2]);

export function inlineLiterals(source: string): Array<{ fn: string; value: number; line: number }> {
  const sf = ts.createSourceFile("chain.ts", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: Array<{ fn: string; value: number; line: number }> = [];
  const seen = new Set<string>();

  const collect = (fn: string, node: ts.Node) => {
    if (ts.isNumericLiteral(node)) {
      const value = Number(node.text);
      if (!ALLOWED.has(value)) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        found.push({ fn, value, line });
      }
    }
    ts.forEachChild(node, (c) => collect(fn, c));
  };

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name && WATCHED.includes(node.name.text)) {
      seen.add(node.name.text);
      collect(node.name.text, node);
      return; // nested functions are covered by collect's full walk
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  const missing = WATCHED.filter((n) => !seen.has(n));
  if (missing.length) throw new Error(`watched functions not found: ${missing.join(", ")}`);
  return found;
}

describe("the chain's arithmetic carries no inline constants", () => {
  test("only 0, 1 and 2 appear as numeric literals in the watched functions", () => {
    const source = readFileSync(CHAIN_PATH, "utf8");
    const offenders = inlineLiterals(source);
    expect(offenders.map((o) => `${o.fn}:${o.line} = ${o.value}`)).toEqual([]);
  });

  test("the detector goes red on a literal put back (absence test of the test)", () => {
    const source = readFileSync(CHAIN_PATH, "utf8");
    const marker = "const useAsymmetric = options?.asymmetric !== false;";
    expect(source).toContain(marker);
    const tampered = source.replace(marker, `${marker} const leak = 0.37;`);
    const offenders = inlineLiterals(tampered);
    expect(offenders.length).toBe(1);
    expect(offenders[0].fn).toBe("computeSequentialCTC");
    expect(offenders[0].value).toBe(0.37);
  });
});
