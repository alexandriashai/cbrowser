/**
 * Every built-in persona's cognitive trait values, with the comments written
 * beside each one, read from src/personas.ts as it stood at a git revision.
 *
 *   bun research/persona-citation-direction/extract.ts <rev>     # JSON on stdout
 *
 * The file is parsed, not imported, so an old revision needs none of its own
 * dependencies. For each value it records the trailing comment on the same
 * line and the block of comment lines directly above it.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { execFileSync } from "node:child_process";
import ts from "typescript";

export interface TraitSite { value: number; line: number; trailing: string; leading: string }
export type Extract = Record<string, Record<string, TraitSite>>;

const TABLES = new Set(["BUILTIN_PERSONAS", "ACCESSIBILITY_PERSONAS", "EMOTIONAL_PERSONAS"]);

export function extract(source: string): Extract {
  const sf = ts.createSourceFile("personas.ts", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const lines = source.split("\n");
  const key = (n: ts.PropertyName) => (ts.isIdentifier(n) || ts.isStringLiteral(n) ? n.text : n.getText(sf));
  const out: Extract = {};
  ts.forEachChild(sf, (stmt) => {
    if (!ts.isVariableStatement(stmt)) return;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !TABLES.has(decl.name.text) || !decl.initializer || !ts.isObjectLiteralExpression(decl.initializer)) continue;
      for (const p of decl.initializer.properties) {
        if (!ts.isPropertyAssignment(p) || !ts.isObjectLiteralExpression(p.initializer)) continue;
        const persona = key(p.name);
        for (const q of p.initializer.properties) {
          if (!ts.isPropertyAssignment(q) || key(q.name) !== "cognitiveTraits" || !ts.isObjectLiteralExpression(q.initializer)) continue;
          for (const t of q.initializer.properties) {
            if (!ts.isPropertyAssignment(t) || !ts.isNumericLiteral(t.initializer)) continue;
            const line = sf.getLineAndCharacterOfPosition(t.getStart(sf)).line;
            const text = lines[line];
            const trailing = text.includes("//") ? text.slice(text.indexOf("//") + 2).trim() : "";
            const above: string[] = [];
            for (let i = line - 1; i >= 0 && /^\s*\/\//.test(lines[i]); i--) above.unshift(lines[i].trim().replace(/^\/\/\s?/, ""));
            (out[persona] ??= {})[key(t.name)] = { value: Number(t.initializer.text), line: line + 1, trailing, leading: above.join(" ") };
          }
        }
      }
    }
  });
  return out;
}

if (import.meta.main) {
  const rev = process.argv[2];
  if (!rev) { console.error("usage: extract.ts <rev>"); process.exit(2); }
  const source = execFileSync("git", ["show", `${rev}:src/personas.ts`], { encoding: "utf8", maxBuffer: 64 << 20 });
  console.log(JSON.stringify(extract(source)));
}
