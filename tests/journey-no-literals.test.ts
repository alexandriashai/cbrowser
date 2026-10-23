/**
 * No hand-set number may live inline in the cognitive journey's code.
 *
 * Parses each journey file with the TypeScript compiler and collects every
 * numeric literal in it (in src/types.ts, only in the journey helpers). A
 * literal is allowed when it is
 *   - 0 or 1 (identity, clamp bounds, booleans by another name; -1 is unary
 *     minus on 1),
 *   - a formatting argument: the digits of toFixed() or toPrecision(), the
 *     radix of parseInt(), the indent of JSON.stringify(),
 *   - a display scaling inside a template string: `* 100` (a percentage) or
 *     `/ 1000` (seconds from milliseconds) in a ${...} span,
 *   - or one of the counted exceptions below, each an encoding with no claim
 *     in it (a centre, an enum label, a weekday index, 2 pi).
 * Anything else belongs in the journey's provenance registry
 * (src/visual/provenance/journey*.ts and friends), read through param().
 *
 * The exceptions are counted per function, so a second `/ 2` in a function
 * that is allowed one fails, and a hand-set 2 cannot hide behind a centre.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dir, "..");

/** The journey helpers in types.ts; the rest of that file is not journey code. */
const TYPES_HELPERS = [
  "calculateFatigueIncrement", "DEFAULT_FITTS_PARAMS", "calculateFittsMovementTime", "shouldSwitchToSystem2", "canReturnToSystem1",
  "KLM_OPERATORS", "calculateTypingTime", "calculateScanWidthMultiplier", "isElementInTunnelVision", "calculateGazeMouseLag",
  "calculatePeripheralVision", "calculateHabituationVisibility", "createHabituationState", "updateHabituationState", "classifyUIPattern",
];

export const WATCHED: Array<{ file: string; only?: string[] }> = [
  { file: "src/cognitive/index.ts" },
  { file: "src/cognitive/emotions.ts" },
  { file: "src/cognitive/temporal.ts" },
  { file: "src/cognitive/default-traits.ts" },
  { file: "src/visual/human-input.ts" },
  { file: "src/mcp-tools/base/cognitive-tools.ts" },
  { file: "src/types.ts", only: TYPES_HELPERS },
];

/** Counted exceptions: file -> enclosing name -> value -> how many, and why. */
export const EXCEPTIONS: Record<string, Record<string, Record<number, number>>> = {
  // Centres of boxes (x + width / 2), the mean of confusion and frustration,
  // and System 2 of the dual-process mode (an enum label, twice).
  "src/cognitive/index.ts": {
    runCognitiveJourney: { 2: 9 },
    score: { 2: 1 },
    // English ordinal suffixes: 11th-13th, then by the last digit.
    ordinalSuffix: { 100: 1, 11: 1, 13: 1, 10: 1, 2: 1, 3: 1 },
  },
  // Date.getDay() indices, and 2 pi in the circadian cosines.
  "src/cognitive/temporal.ts": {
    FRIDAY: { 5: 1 },
    SATURDAY: { 6: 1 },
    circadianEnergy: { 2: 2 },
  },
  // The Box-Muller transform (sqrt(-2 ln u) cos(2 pi v)), half a target's
  // width and height, and 2 pi for a random direction.
  "src/visual/human-input.ts": {
    gauss: { 2: 2 },
    humanClick: { 2: 3 },
  },
  // The schema's latitude and longitude ranges.
  "src/mcp-tools/base/cognitive-tools.ts": {
    "tool:cognitive_journey_init": { 90: 2, 180: 2 },
  },
};

interface Found { file: string; fn: string; value: number; line: number }

/**
 * The name a literal is attributed to: the nearest function (declared, a
 * method or getter, or an arrow or function expression held in a variable),
 * an MCP tool's handler, or else the module-level variable it sits in.
 */
function enclosingName(n: ts.Node, sf: ts.SourceFile): string | null {
  if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isGetAccessorDeclaration(n)) && n.name) return n.name.getText(sf);
  if (ts.isVariableDeclaration(n)) {
    const fnValued = !!n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer));
    const topLevel = ts.isVariableStatement(n.parent.parent) && ts.isSourceFile(n.parent.parent.parent);
    if (fnValued || topLevel) return n.name.getText(sf);
  }
  if (ts.isCallExpression(n) && n.expression.getText(sf).endsWith("registerTool") && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
    return `tool:${n.arguments[0].text}`;
  }
  return null;
}

/** True for a literal that formats rather than computes. */
function isFormatting(lit: ts.NumericLiteral, sf: ts.SourceFile): boolean {
  let node: ts.Node = lit;
  if (ts.isPrefixUnaryExpression(node.parent)) node = node.parent;
  const p = node.parent;
  if (ts.isCallExpression(p)) {
    const callee = p.expression.getText(sf);
    const i = p.arguments.indexOf(node as ts.Expression);
    if (/\.(toFixed|toPrecision)$/.test(callee) && i === 0) return true;
    if (callee === "parseInt" && i === 1) return true;
    if (callee === "JSON.stringify" && i === 2) return true;
  }
  // `x * 100` or `x / 1000` that lands, through parentheses and calls, in a ${...} span.
  if (ts.isBinaryExpression(p) && p.right === node) {
    const op = p.operatorToken.kind;
    const display = (op === ts.SyntaxKind.AsteriskToken && Number(lit.text) === 100) || (op === ts.SyntaxKind.SlashToken && Number(lit.text) === 1000);
    if (display) {
      let up: ts.Node = p.parent;
      while (up && (ts.isParenthesizedExpression(up) || ts.isCallExpression(up) || ts.isPropertyAccessExpression(up))) up = up.parent;
      if (up && ts.isTemplateSpan(up)) return true;
    }
  }
  return false;
}

export function journeyLiterals(file: string, source: string, only?: string[]): Found[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: Found[] = [];
  const stack: string[] = [];
  const visit = (n: ts.Node) => {
    const name = enclosingName(n, sf);
    if (name) stack.push(name);
    if (ts.isNumericLiteral(n) && !inType(n)) {
      const value = Number(n.text);
      const inScope = !only || stack.some((s) => only.includes(s));
      if (inScope && value !== 0 && value !== 1 && !isFormatting(n, sf)) {
        found.push({ file, fn: stack[stack.length - 1] ?? "", value, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 });
      }
    }
    ts.forEachChild(n, visit);
    if (name) stack.pop();
  };
  const inType = (n: ts.Node): boolean => {
    for (let p = n.parent; p; p = p.parent) if (ts.isTypeNode(p)) return true;
    return false;
  };
  visit(sf);
  return found;
}

/** The literals left once the counted exceptions are spent. */
export function offenders(file: string, source: string, only?: string[]): string[] {
  const budget: Record<string, Record<number, number>> = JSON.parse(JSON.stringify(EXCEPTIONS[file] ?? {}));
  const out: string[] = [];
  for (const f of journeyLiterals(file, source, only)) {
    const left = budget[f.fn]?.[f.value] ?? 0;
    if (left > 0) budget[f.fn][f.value] = left - 1;
    else out.push(`${f.file}:${f.line} ${f.fn} = ${f.value}`);
  }
  return out;
}

describe("the journey's code carries no inline constants", () => {
  for (const w of WATCHED) {
    test(`${w.file}: every numeric literal is 0, 1, formatting or a counted exception`, () => {
      expect(offenders(w.file, readFileSync(join(ROOT, w.file), "utf8"), w.only)).toEqual([]);
    });
  }

  test("every counted exception is used exactly (none left over to absorb a new literal)", () => {
    for (const w of WATCHED) {
      const used: Record<string, Record<number, number>> = {};
      for (const f of journeyLiterals(w.file, readFileSync(join(ROOT, w.file), "utf8"), w.only)) {
        if (EXCEPTIONS[w.file]?.[f.fn]?.[f.value] !== undefined) ((used[f.fn] ??= {})[f.value] = (used[f.fn]?.[f.value] ?? 0) + 1);
      }
      expect(used).toEqual(EXCEPTIONS[w.file] ?? {});
    }
  });

  test("the detector goes red on a literal put back, in each kind of place (absence test)", () => {
    const index = readFileSync(join(ROOT, "src/cognitive/index.ts"), "utf8");
    const marker = `progressDeltaAllowed = Math.min(progressDeltaProposed, param("journey.progress.inPageCap"));`;
    expect(index).toContain(marker);
    expect(offenders("src/cognitive/index.ts", index.replace(marker, "progressDeltaAllowed = Math.min(progressDeltaProposed, 0.05);")))
      .toEqual([expect.stringMatching(/ runCognitiveJourney = 0\.05$/)]);
    // A second centre in a function allowed nine is a tenth.
    const centre = "const vc = viewportCtx.viewport.height / 2;";
    expect(index).toContain(centre);
    expect(offenders("src/cognitive/index.ts", index.replace(centre, `${centre} const vc2 = viewportCtx.viewport.width / 2;`))).toHaveLength(1);
    // A display scaling outside a template string is computation.
    expect(offenders("src/cognitive/index.ts", index.replace(marker, `${marker} const pct = state.goalProgress * 100;`))).toHaveLength(1);

    const emotions = readFileSync(join(ROOT, "src/cognitive/emotions.ts"), "utf8");
    const em = `const DEFAULT_SENSITIVITY = 1.0;`;
    expect(emotions).toContain(em);
    expect(offenders("src/cognitive/emotions.ts", emotions.replace(em, "const DEFAULT_SENSITIVITY = 1.1;"))).toEqual([expect.stringMatching(/DEFAULT_SENSITIVITY = 1\.1$/)]);

    const types = readFileSync(join(ROOT, "src/types.ts"), "utf8");
    const t = `return param("journey.fatigue.gain") * Math.log(optionsConsidered + 1);`;
    expect(types).toContain(t);
    expect(offenders("src/types.ts", types.replace(t, "return 0.05 * Math.log(optionsConsidered + 1);"), TYPES_HELPERS)).toHaveLength(1);
  });
});
