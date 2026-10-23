/**
 * No hand-set number may live inline in extractPageMetrics.
 *
 * Parses cognitive-transport.ts with the TypeScript compiler and walks
 * extractPageMetrics and the two halves it is made of: measurePageRaw,
 * including the callback it runs inside the page, and deriveMetrics, plus the
 * helpers that read their constants. Only 0, 1 and 2 are allowed (with -1 from
 * unary minus on 1). Anything else belongs in visual/provenance/page-metrics.ts,
 * read through param() in Node (and handed to the page for the measurement);
 * the golden (tests/page-metrics-golden.test.ts) proves that move changed no
 * output.
 *
 * Numbers inside strings, comments and regular expressions are not literals.
 * The one quantifier that was a constant ({3,} on CJK runs) is now built from
 * the registered value, so it is covered.
 *
 * Out of scope here, and still inline: extractPerScreenMetrics' settle waits
 * and default screen cap, and measurePageGeometry's rounding.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { PAGE_METRICS_PROVENANCE } from "../src/visual/provenance/page-metrics.js";
import { MODEL_PROVENANCE, startProvenanceRecording, stopProvenanceRecording } from "../src/visual/model-provenance.js";
import { extractPageMetrics, extractPerScreenMetrics } from "../src/visual/cognitive-transport.js";
import { RAW_LATIN } from "./fixtures/raw-page-measurements.js";

const PATH = join(import.meta.dir, "..", "src", "visual", "cognitive-transport.ts");
const WATCHED = ["extractPageMetrics", "measurePageRaw", "deriveMetrics", "readMeasureParams", "readDeriveParams"];
const ALLOWED = new Set([0, 1, 2]);

export function pageMetricLiterals(source: string): Array<{ fn: string; value: number; line: number }> {
  const sf = ts.createSourceFile("cognitive-transport.ts", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: Array<{ fn: string; value: number; line: number }> = [];
  const seen = new Set<string>();
  const collect = (fn: string, node: ts.Node) => {
    if (ts.isNumericLiteral(node)) {
      const value = Number(node.text);
      if (!ALLOWED.has(value)) found.push({ fn, value, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
    }
    ts.forEachChild(node, (c) => collect(fn, c));
  };
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name && WATCHED.includes(node.name.text)) {
      seen.add(node.name.text);
      collect(node.name.text, node);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  const missing = WATCHED.filter((n) => !seen.has(n));
  if (missing.length) throw new Error(`watched functions not found: ${missing.join(", ")}`);
  return found;
}

describe("extractPageMetrics carries no inline constants", () => {
  const source = readFileSync(PATH, "utf8");

  test("only 0, 1 and 2 appear as numeric literals in the extractor", () => {
    expect(pageMetricLiterals(source).map((o) => `${o.fn}:${o.line} = ${o.value}`)).toEqual([]);
  });

  test("the detector goes red on a literal put back, in the derivation and in the page callback (absence test)", () => {
    const marker = "const informationDensity = logScale(textLength, P.informationMidpoint);";
    expect(source).toContain(marker);
    const found = pageMetricLiterals(source.replace(marker, "const informationDensity = logScale(textLength, 5000);"));
    expect(found.map((o) => `${o.fn} = ${o.value}`)).toEqual(["deriveMetrics = 5000"]);
    const inPage = "if (!t || t.length <= P.proseLengthAbove) return;";
    expect(source).toContain(inPage);
    const foundInPage = pageMetricLiterals(source.replace(inPage, "if (!t || t.length <= 5) return;"));
    expect(foundInPage.map((o) => `${o.fn} = ${o.value}`)).toEqual(["measurePageRaw = 5"]);
  });
});

describe("page-metrics provenance registry", () => {
  const registered = new Set(PAGE_METRICS_PROVENANCE.map((e) => e.id));

  test("pinned, unique, prefixed; the definitions are units and storage bounds, the rest hypotheses naming what would set them", () => {
    // 35 at registration (2026-10-22); 39 with the raw measurement's four
    // storage bounds (the measure/derive split).
    expect(PAGE_METRICS_PROVENANCE.length).toBe(39);
    expect(registered.size).toBe(39);
    for (const e of PAGE_METRICS_PROVENANCE) {
      expect(e.id.startsWith("pageMetrics.")).toBe(true);
      expect(Number.isFinite(e.value)).toBe(true);
      expect(e.source.trim().length).toBeGreaterThan(40);
      expect(MODEL_PROVENANCE[e.id]).toBe(e);
      if (e.status === "hypothesis") expect(e.source).toMatch(/would (fit|set|test|place|show)/);
    }
    expect(PAGE_METRICS_PROVENANCE.filter((e) => e.status !== "hypothesis").map((e) => `${e.id}:${e.status}`))
      .toEqual([
        "pageMetrics.textDensity.areaUnit:definition",
        "pageMetrics.raw.lengthBins:definition",
        "pageMetrics.raw.maxBoxes:definition",
        "pageMetrics.raw.maxTextBlocks:definition",
        "pageMetrics.raw.maxChoiceGroups:definition",
      ]);
  });

  test("the midpoints a source-text test used to pin are the registered values", () => {
    const v = (id: string) => MODEL_PROVENANCE[`pageMetrics.${id}`].value;
    expect([v("informationDensity.midpoint"), v("visual.midpoint"), v("textDensity.midpoint")]).toEqual([5000, 200, 3]);
    expect([v("visual.colourWeight"), v("visual.imageWeight"), v("visual.elementWeight"), v("textDensity.areaUnit")]).toEqual([3, 2, 0.5, 0.001]);
  });

  test("every registered id is read, and only registered ids are (stub page, no browser)", async () => {
    // The ids are read in Node, so a stub that never runs the callback is
    // enough to record them. Its measurement is a hand-built raw record, which
    // deriveMetrics then turns into metrics, reading the rest.
    const stub = {
      evaluate: async (_fn: unknown, arg?: unknown) => (Array.isArray(arg) ? structuredClone(RAW_LATIN) : { viewportHeight: 800, documentHeight: 1600 }),
      waitForTimeout: async () => {},
    };
    startProvenanceRecording();
    await extractPageMetrics(stub, "full_page");
    await extractPerScreenMetrics(stub, 1, { viewportHeight: 800, documentHeight: 800, pageScreens: 1, screenCount: 1 }).catch(() => {});
    const read = stopProvenanceRecording();
    const reads = [...read].filter((id) => id.startsWith("pageMetrics."));
    expect(reads.filter((id) => !registered.has(id))).toEqual([]);
    expect([...registered].filter((id) => !read.has(id))).toEqual([]);
  });
});
