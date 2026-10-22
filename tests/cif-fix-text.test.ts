/**
 * The CIF fix text and details quote the scorer's registered constants.
 *
 * Until 21.0 the fix text disagreed with the scorer: it asked for "under 30"
 * interactive elements where the scorer's free count is 20, and hand-typed 48
 * px, 8 px spacing, "5-7 options (Hick's Law)", an 8th-grade level, 200% zoom,
 * 3:1 focus contrast and "below 60%" density. textScalability said "Text
 * content can scale to 200%" without zooming anything.
 *
 * Two checks hold that shut: a parse of cif-score.ts that fails on any digit
 * in a string or template literal (WCAG success-criterion numbers, the h1-h6
 * tag range and the ":1" of a ratio whose first term is interpolated
 * excepted), so a number in text must be interpolated from a
 * registered constant; and a behavioural check that changing each quoted
 * constant changes the text.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { computeCIFScore, generateFixRecommendation, type CIFInput } from "../src/cif-score.js";
import { withParamOverrides } from "../src/visual/model-provenance.js";

const CIF_PATH = join(import.meta.dir, "..", "src", "cif-score.ts");

/** Digit runs in the text parts of string and template literals, minus the allowed ones. */
export function digitsInText(source: string): string[] {
  const sf = ts.createSourceFile("cif-score.ts", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: string[] = [];
  const check = (text: string, node: ts.Node) => {
    const cleaned = text
      .replace(/WCAG \d+(\.\d+)+/g, "WCAG")
      .replace(/\bh1-h6\b/g, "headings")
      .replace(/^:1\b/, "");
    if (/\d/.test(cleaned)) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      found.push(`${line}: ${JSON.stringify(text)}`);
    }
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) check(node.text, node);
    else if (ts.isTemplateExpression(node)) {
      check(node.head.text, node);
      for (const span of node.templateSpans) check(span.literal.text, node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** A page where every component is measured and has room to be a top issue. */
const PAGE: CIFInput = {
  url: "https://example.test/fixes",
  barriers: [],
  touchTargets: [{ width: 30, height: 30 }, { width: 20, height: 20 }],
  informationDensity: 0.75,
  interactiveCount: 60,
  elementCount: 900,
  fleschScore: 40,
  navItemCount: 15,
  animationCount: 2,
  hasReducedMotionSupport: false,
  agentReadyScore: 60,
  semanticScore: 60,
  ariaScore: 60,
  formLabelScore: 60,
  totalCTC: 0.7,
  layers: [{ name: "decision", cost: 0.3 }],
  ctaCaptureRate: 0.2,
};

const fix = (key: string) => {
  const [category, component] = key.split(".");
  return generateFixRecommendation(category, component, 0, PAGE);
};

describe("CIF fix text and details quote registered constants", () => {
  test("no digit appears in any string or template literal of cif-score.ts outside WCAG criterion numbers", () => {
    const source = readFileSync(CIF_PATH, "utf8");
    expect(source).toContain("export function generateFixRecommendation");
    expect(digitsInText(source)).toEqual([]);
  });

  test("the detector goes red on a hand-typed number (absence test of the test)", () => {
    const source = readFileSync(CIF_PATH, "utf8");
    const marker = "for reliable motor access`;";
    expect(source).toContain(marker);
    const tampered = source.replace(marker, "for reliable motor access (target 48px)`;");
    expect(digitsInText(tampered).length).toBe(1);
  });

  const cases: Array<[string, string, number, string]> = [
    ["motor.hitProbability", "cif.wcag.targetSizeEnhancedPx", 48, "48x48px"],
    ["motor.interactionCount", "cif.motor.interactive.freeCount", 25, "to 25 or fewer"],
    ["motor.spacingAdequacy", "cif.motor.spacing.minGapPx", 6, "at least 6px apart"],
    ["visual.textScalability", "cif.wcag.resizeTextPercent", 300, "resizes to 300%"],
    ["visual.focusVisibility", "cif.wcag.nonTextContrast", 4, "at least 4:1 contrast"],
    ["visual.spacingDensity", "cif.visual.textScalability.densityKnee", 0.7, "above 70%"],
    ["cognitive.decisionComplexity", "cif.fix.decision.choiceThreshold", 12, "to 12 or fewer per decision point"],
    ["cognitive.readability", "cif.cognitive.readability.fleschGain", 1.25, "to 80 or more"],
    ["cognitive.informationDensity", "cif.cognitive.density.freeCount", 250, "toward 250"],
    ["cognitive.predictability", "cif.cognitive.predictability.freeCount", 9, "to 9 or fewer"],
  ];
  for (const [key, id, value, expected] of cases) {
    test(`${key} quotes ${id}`, () => {
      expect(fix(key)).not.toContain(expected);
      withParamOverrides({ [id]: value }, () => expect(fix(key)).toContain(expected));
    });
  }

  test("the old hand-typed figures are gone", () => {
    const keys = ["motor.touchTargetCompliance", "motor.hitProbability", "motor.interactionCount", "motor.spacingAdequacy",
      "visual.textScalability", "visual.focusVisibility", "visual.spacingDensity", "cognitive.decisionComplexity",
      "cognitive.readability", "cognitive.informationDensity", "cognitive.predictability"];
    for (const key of keys) {
      const text = fix(key);
      for (const old of ["48px", "under 30", "8px spacing", "5-7", "Hick's Law", "8th-grade", "below 60%"]) {
        expect({ key, old, present: text.includes(old) }).toEqual({ key, old, present: false });
      }
    }
  });

  test("textScalability never claims text scales; it says the resize was not checked", () => {
    for (const informationDensity of [0.3, 0.9]) {
      const details = computeCIFScore({ ...PAGE, informationDensity }).visual.components.textScalability.details;
      expect(details).not.toMatch(/can scale/);
      expect(details).toMatch(/not (checked|zoomed)/);
    }
  });
});
