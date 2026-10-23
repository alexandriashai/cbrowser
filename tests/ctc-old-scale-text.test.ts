/**
 * No string the package ships reads totalCTC on the scale it left.
 *
 * Through 21.0 totalCTC was a logistic of rawCTC, and the text around it said
 * so in the tools' own words: "total < 0.3 comfortable, < 0.6 moderate, < 0.8
 * struggling, else likely abandon", "should handle this page comfortably",
 * "total is a sigmoid of raw", "CTC=0.41". It is now a percentile of real
 * pages (ctc-reference.ts) and verdicts state the rank (ctc-bands.ts).
 *
 * Scans every string literal and template text under src (the TypeScript
 * parser, so comments are not matched but the widget scripts, which live in
 * template literals, are). Each pattern below is a sentence some tool shipped;
 * the absence test proves the scanner finds one when it is put back.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const SRC = join(import.meta.dir, "..", "src");

/** Old-scale readings of totalCTC, as they appeared in shipped strings. */
export const OLD_SCALE: Array<[RegExp, string]> = [
  [/should handle .{0,40}comfortabl/i, "comfort verdict"],
  [/is comfortable for/i, "comfort verdict"],
  [/will (struggle|experience moderate)/i, "feeling verdict"],
  [/is likely to abandon/i, "CTC read as abandonment"],
  [/Significant cognitive burden|Moderate effort required/i, "story effort verdict"],
  [/total\s*<\s*0\.\d+\s*comfortable/i, "old interpretation bands"],
  [/(total|it) is a sigmoid|sigmoid of raw|\(a sigmoid|sigmoid-squashed/i, "total described as a sigmoid"],
  [/0-1 score where/i, "old 0-1 score description"],
  [/CTC=\$?\{?/, "bare CTC number in a recommendation"],
  [/CTC of [1-9]\.\d/, "a totalCTC above 1, impossible on a percentile"],
  [/cognitive transaction cost/i, "misnamed cost"],
  [/Cognitive transport cost is \$\{Math\.round/, "percent of a logistic read as a cost"],
];

/** Every string literal and template text in a source file, with its line. */
export function strings(source: string): Array<{ text: string; line: number }> {
  const sf = ts.createSourceFile("f.ts", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const out: Array<{ text: string; line: number }> = [];
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      out.push({ text: n.text, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 });
    }
    // A template's raw text includes the ${...} spans' source, which the
    // patterns above sometimes need (the CTC= pattern): check the whole template too.
    if (ts.isTemplateExpression(n)) out.push({ text: n.getText(sf), line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 });
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** One entry per (line, reason): a template and its head can both match the same sentence. */
export function offenders(source: string, file = "f.ts"): string[] {
  const hits = new Map<string, string>();
  for (const { text, line } of strings(source))
    for (const [re, why] of OLD_SCALE) {
      const key = `${file}:${line} ${why}`;
      if (re.test(text) && !hits.has(key)) hits.set(key, `${key}: ${text.replace(/\s+/g, " ").slice(0, 90)}`);
    }
  return [...hits.values()];
}

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "data") walk(p, files);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p);
  }
  return files;
}

describe("shipped strings read totalCTC as a percentile", () => {
  test("no string literal under src carries an old-scale reading", () => {
    const hits = walk(SRC).flatMap((f) => offenders(readFileSync(f, "utf8"), relative(SRC, f)));
    expect(hits).toEqual([]);
  });

  test("the scanner finds an old verdict put back, and ignores the same words in a comment (absence test)", () => {
    expect(offenders('const v = `${p} should handle ${s} comfortably.`;').length).toBe(1);
    expect(offenders('const b = "total < 0.3 comfortable, < 0.6 moderate";').length).toBe(1);
    expect(offenders("recs.push(`${n}: Reduce x (primary bottleneck, CTC=${d.totalCTC})`);").length).toBe(1);
    expect(offenders("// total is a sigmoid of raw, kept here as history\nconst x = 1;").length).toBe(0);
  });
});
