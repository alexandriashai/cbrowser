/**
 * What `cognitive_effort` and `page_understand` measure, and saying so.
 *
 * Both were viewport-scoped and neither declared it. Every CTC number the tool
 * ever produced described the first screenful, and the output called it the
 * page. On ucdenver.edu/academics -- 6436px, 8 screens -- the viewport sees 4
 * laid-out links and 47 words, so the page scored LOWER cognitive load than a
 * shorter homepage. Internally consistent, indefensible as output; the same
 * shape as the skip-link false positive.
 *
 * `empathy_audit` already had a `scope` enum of viewport | full_page. These two
 * now match it, defaulting to viewport so that no published number changes
 * meaning underneath anyone.
 *
 * @since 2026-08-02
 */
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { MODEL_PROVENANCE } from "../src/visual/model-provenance.js";
import { join } from "node:path";

const SRC = join(import.meta.dir, "..", "src");
const transport = readFileSync(join(SRC, "visual", "cognitive-transport.ts"), "utf8");
const effort = readFileSync(join(SRC, "mcp-tools", "base", "persona-comparison-tools.ts"), "utf8");
const understanding = readFileSync(join(SRC, "analysis", "page-understanding.ts"), "utf8");
const knowledge = readFileSync(join(SRC, "mcp-tools", "base", "site-knowledge-tools.ts"), "utf8");
const audit = readFileSync(join(SRC, "mcp-tools", "base", "audit-tools.ts"), "utf8");

describe("the scope parameter matches empathy_audit", () => {
  test("cognitive_effort shares empathy_audit's values and default, and may add to them", () => {
    // Was an equality assertion. cognitive_effort gained `sequential`, which
    // empathy_audit has no analogue for -- it answers "how far do they get",
    // and a barrier audit has no depth to report. The contract that matters is
    // that the SHARED values are spelled and defaulted identically, so a caller
    // moving between tools is never surprised; an additive third value does not
    // violate that.
    const empathyEnum = audit.match(/scope: z\.enum\(\[([^\]]+)\]\)\.optional\(\)\.default\("viewport"\)/)![1];
    expect(empathyEnum).toContain('"viewport"');
    expect(empathyEnum).toContain('"full_page"');
    const effortEnum = effort.match(/scope: z\.enum\(\[([^\]]+)\]\)\.optional\(\)\.default\("viewport"\)/)![1];
    expect(effortEnum).toContain('"viewport"');
    expect(effortEnum).toContain('"full_page"');
    // Both default to viewport, which is the part that preserves published numbers.
    expect(effort).toMatch(/scope: z\.enum\(\[[^\]]+\]\)\.optional\(\)\.default\("viewport"\)/);
  });

  test("page_understand exposes its third mode rather than hiding it", () => {
    // Its restriction was CONDITIONAL -- full document under 1000 elements,
    // viewport above -- so one call measured two different things depending on
    // page size and said neither. `auto` keeps that for compatibility and is
    // now nameable and reportable.
    expect(knowledge).toMatch(/scope: z\.enum\(\["auto", "viewport", "full_page"\]\)/);
    expect(understanding).toContain('mode === "viewport" ? true');
    expect(understanding).toContain('mode === "full_page" ? false');
    expect(understanding).toContain("totalElementCount > maxElements");
  });

  test("the default is still viewport, so no published number changed", () => {
    expect(transport).toContain('scope: MetricScope = "viewport"');
    expect(effort).toContain('const measureScope = scope ?? "viewport"');
  });
});

describe("full_page actually measures the full page", () => {
  test("the viewport filter is bypassed, not merely widened", () => {
    const fn = transport.slice(transport.indexOf("const inViewport = (el: Element)"));
    const body = fn.slice(0, fn.indexOf("};"));
    expect(body).toContain("if (fullPage) return true;");
    // Zero-size elements stay excluded at BOTH scopes: a display:none link in a
    // mega-menu is not a choice anyone faces. This is why a raw
    // querySelectorAll('a') count does not match what this measures.
    expect(body).toContain("if (rect.width <= 0 || rect.height <= 0) return false;");
  });

  test("density is normalised against the document, not one screen", () => {
    // Counting whole-page text and dividing by a screenful would report a
    // density the page does not have.
    expect(transport).toContain("const viewportArea = vw * (fullPage ? docHeight : vh);");
  });

  test("it scrolls first, so lazy content exists to be counted", () => {
    // Everything before the measurement callback: the walk must be in it. (This
    // read the first 2,600 characters, which the registry reads pushed past.)
    // The walk is in measurePageRaw since extractPageMetrics became
    // measurePageRaw then deriveMetrics.
    const fn = transport.slice(transport.indexOf("export async function measurePageRaw"));
    const head = fn.slice(0, fn.indexOf("return page.evaluate(([measureScope"));
    expect(head.length).toBeGreaterThan(0);
    expect(head).toContain('if (scope === "full_page")');
    expect(head).toContain("window.scrollTo(0, 0)");
  });

  test("no midpoint was recalibrated while fixing an undeclared assumption", () => {
    // The formulas are unchanged; only what feeds them moved. Inventing new
    // constants here would replace one undeclared assumption with another.
    //
    // The midpoints are registered now (provenance/page-metrics.ts) and read
    // through param(), so the pin is on the registered values and on the
    // formulas reading them. tests/page-metrics-golden.test.ts proves the
    // outputs did not move when the literals became entries.
    expect(transport).toContain("logScale(textLength, P.informationMidpoint)");
    // Applied in deriveMetrics to the counts measurePageRaw stored (uniqueColors.size
    // is raw.colours, imageCount raw.images, visibleCount raw.visibleElements).
    expect(transport).toContain("raw.colours * P.colourWeight + raw.images * P.imageWeight + raw.visibleElements * P.elementWeight,\n    P.visualMidpoint");
    expect(transport).toContain("logScale(textLength / Math.max(1, viewportArea * P.areaUnit), P.textDensityMidpoint)");
    const v = (id: string) => MODEL_PROVENANCE[`pageMetrics.${id}`].value;
    expect([v("informationDensity.midpoint"), v("visual.colourWeight"), v("visual.imageWeight"), v("visual.elementWeight"), v("visual.midpoint")])
      .toEqual([5000, 3, 2, 0.5, 200]);
    expect([v("textDensity.areaUnit"), v("textDensity.midpoint")]).toEqual([0.001, 3]);
  });
});

describe("the output says which of the two it is", () => {
  test("the verdict names its own scope", () => {
    // "should handle this page comfortably" off the top 800px of a 6436px page
    // is the misleading claim; the sentence now says which it measured.
    //
    // Was a grep for the inline ternary `measureScope === "full_page" ? ...`.
    // That ternary WAS the BUG-26 defect: binary against a three-valued enum, so
    // `sequential` fell to the viewport arm and the sentence claimed the opposite
    // of what was measured. The subject now comes from scopeProse, which is
    // asserted per-scope in tests/scope-prose.test.ts. Checking the call rather
    // than a copy of the string is the point of extracting it.
    expect(effort).toContain("const subject = prose.subject");
    expect(effort).toContain("scope-prose.js");
  });

  test("a tall page measured at viewport scope says what it missed", () => {
    expect(effort).toContain("so most of it was not measured");
    expect(effort).toContain("pageScreens");
  });

  test("the response carries scope, page height and a note at every scope", () => {
    expect(effort).toContain("scope: measureScope,");
    expect(effort).toContain("pageScreens: pageMetrics.pageScreens,");
    expect(effort).toContain("scopeNote: prose.scopeNote,");
    // "both scopes" was the assumption that dated this test: there are three.
    // The per-scope content of the note is asserted in tests/scope-prose.test.ts,
    // against every value of the enum rather than the two someone remembered.
    const { scopeProse, SCOPE_PROSE_VALUES } = require("../src/visual/scope-prose.js");
    expect(SCOPE_PROSE_VALUES.length).toBe(3);
    expect(scopeProse("viewport").scopeNote).toContain("VIEWPORT ONLY");
    expect(scopeProse("full_page").scopeNote).toContain("Not comparable with viewport-scoped numbers");
    expect(scopeProse("sequential").scopeNote).toContain("SEQUENTIAL");
  });

  test("page_understand reports the mode that actually ran", () => {
    expect(understanding).toContain('extractionScope: (limitToViewport ? "viewport" : "full_page")');
    expect(knowledge).toContain("extractionScope: understanding.extractionScope");
    expect(knowledge).toContain("VIEWPORT ONLY");
  });

  test("the tool descriptions state the default, since that is what a model reads", () => {
    expect(effort).toContain("MEASURES THE VIEWPORT BY DEFAULT");
    expect(knowledge).toContain("silently falls back to the viewport above 1000 elements");
  });
});

describe("silent truncation is reported", () => {
  test("the choice-count cap emits the raw number beside it", () => {
    // Unreachable at viewport scope and hit at full_page on the CU Denver
    // homepage. A truncated value that looks like a measurement is the same
    // defect as analyze_page's undocumented 20-link cap.
    expect(transport).toContain("choiceCountRaw: choiceCount,");
    expect(transport).toContain("choiceCountCapped: choiceCount > P.choiceCap,");
    expect(MODEL_PROVENANCE["pageMetrics.choiceCap"].value).toBe(100);
  });
});
