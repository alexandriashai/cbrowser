/**
 * No string the package serves says hand-set persona numbers are research-backed.
 *
 * Every built-in persona trait value is registered in MODEL_PROVENANCE as a
 * hypothesis: set by hand on a scale no instrument defines. The questionnaire
 * defaults and the trait-correlation rules are set by hand too. Through 21.0
 * the tools said otherwise in their own words: "the rest take research-backed
 * defaults" (persona_manager), "research-backed questions" (the questionnaire
 * tool), "a research-backed persona" and "research-backed traits" (the CLI),
 * "intelligent defaults based on research correlations" (questionnaire build).
 *
 * Scans every string literal and template text under src with the TypeScript
 * parser, as ctc-old-scale-text.test.ts does, so comments are not matched but
 * tool descriptions, payload text, CLI output and the widget scripts are. A
 * claim that IS accurate stays, on the allowlist below with the reason; an
 * allowlist entry that no longer matches anything fails, so the list cannot
 * outlive the text it excuses.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const SRC = join(import.meta.dir, "..", "src");

/** Ways a served string has claimed that hand-set numbers rest on research or validation. */
export const CLAIMS: Array<[RegExp, string]> = [
  [/research[- ]?(backed|based|grounded|derived|validated)/i, "research-backed"],
  [/evidence[- ]based/i, "evidence-based"],
  [/(clinically|psychometrically|empirically|scientifically)[- ](validated|derived|grounded|calibrated|proven)/i, "validated"],
  [/\bvalidated (persona|trait|value|default|question|questionnaire|scale|profile)s?\b/i, "validated"],
  [/(based on|from|grounded in) research (correlations|averages|baselines?|defaults)/i, "defaults from research"],
  [/\bresearch (baselines?|defaults|averages)\b/i, "defaults from research"],
  // A hand-set default called a population figure claims it was measured on one.
  [/\bpopulation (baseline|average|default)s?\b/i, "population baseline"],
];

/**
 * Accurate uses, each with why. `file` is relative to src; `text` is a
 * substring of the string literal it excuses.
 */
export const ALLOWED: Array<{ file: string; text: string; why: string }> = [];

/** Every string literal and template text in a source file, with its line. */
export function strings(source: string): Array<{ text: string; line: number }> {
  const sf = ts.createSourceFile("f.ts", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const out: Array<{ text: string; line: number }> = [];
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      out.push({ text: n.text, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** One entry per (line, reason), skipping allowlisted text. */
export function offenders(source: string, file = "f.ts", allowed = ALLOWED): string[] {
  const hits = new Map<string, string>();
  for (const { text, line } of strings(source))
    for (const [re, why] of CLAIMS) {
      if (!re.test(text)) continue;
      if (allowed.some((a) => a.file === file && text.includes(a.text))) continue;
      const key = `${file}:${line} ${why}`;
      if (!hits.has(key)) hits.set(key, `${key}: ${text.replace(/\s+/g, " ").slice(0, 110)}`);
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

describe("served strings do not call hand-set persona numbers research-backed", () => {
  const files = walk(SRC).map((f) => ({ rel: relative(SRC, f), text: readFileSync(f, "utf8") }));

  test("no string literal under src claims research backing or validation it does not have", () => {
    expect(files.flatMap((f) => offenders(f.text, f.rel))).toEqual([]);
  });

  test("every allowlist entry still excuses a string that exists", () => {
    const stale = ALLOWED.filter((a) => {
      const f = files.find((x) => x.rel === a.file);
      return !f || !strings(f.text).some((s) => s.text.includes(a.text));
    });
    expect(stale.map((a) => `${a.file}: ${a.text}`)).toEqual([]);
  });

  test("the scanner finds a claim put back, and ignores the same words in a comment (absence test)", () => {
    expect(offenders('note: "Set the traits you know; the rest take research-backed defaults."').length).toBe(1);
    expect(offenders("console.log(`This questionnaire will help you create a research-backed persona.`);").length).toBe(1);
    expect(offenders('d: "Missing traits will use intelligent defaults based on research correlations."').length).toBe(1);
    expect(offenders('d: "Trait values are clinically validated."').length).toBe(1);
    expect(offenders("const base = `3 of 26 supplied; 23 filled from research baselines`;").length).toBe(1);
    expect(offenders('why: "An unsupplied trait is filled from a population baseline."').length).toBe(1);
    expect(offenders("// v16.11.0: Research-based defaults instead of flat 0.5\nconst x = 1;").length).toBe(0);
  });
});
