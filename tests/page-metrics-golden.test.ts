/**
 * extractPageMetrics returns exactly what it returned before its constants
 * were registered.
 *
 * The golden (fixtures/page-metrics-golden.json) was written on e9b4f03, when
 * every midpoint, weight and threshold in the extractor was still an inline
 * literal. Those numbers now live in visual/provenance/page-metrics.ts and are
 * read through param(), and the outputs must not move by a single bit: every
 * field is compared with toEqual on the parsed JSON, which round-trips a double
 * exactly.
 *
 * The coverage checks below keep the golden from passing vacuously: if the
 * fixtures stopped reaching the CJK or abjad branch, the choice cap or the
 * animation count, a constant in that branch could change unseen.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { measurePageMetricsFixtures, PAGE_METRICS_FIXTURES, type PageMetricsGolden } from "./fixtures/page-metrics-measure.js";

const golden = JSON.parse(readFileSync(join(import.meta.dir, "fixtures", "page-metrics-golden.json"), "utf8")) as PageMetricsGolden;

type Metrics = Record<string, unknown>;
const all = (g: PageMetricsGolden): Metrics[] =>
  Object.values(g).flatMap((p) => [p.viewport as Metrics, p.fullPage as Metrics, ...(p.perScreen as Metrics[])]);

let browser: Browser;
let measured: PageMetricsGolden;

beforeAll(async () => {
  browser = await chromium.launch();
  measured = await measurePageMetricsFixtures(browser);
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

describe("the golden reaches every branch of the extractor", () => {
  test("all three script families, the choice cap, motion and the colour sample", () => {
    expect(Object.keys(golden).sort()).toEqual([...PAGE_METRICS_FIXTURES].sort());
    const rows = all(golden);
    const families = new Set(rows.map((m) => m.scriptFamily));
    expect([...families].sort()).toEqual(["abjad", "alphabetic", "cjk"]);
    expect(rows.some((m) => m.choiceCountCapped === true)).toBe(true);
    expect(rows.some((m) => (m.animationLevel as number) > 0)).toBe(true);
    expect(rows.some((m) => m.scope === "full_page")).toBe(true);
    // More than 50 visible elements, so the colour sample limit binds.
    expect(rows.some((m) => (m.interactiveElementCount as number) > 50)).toBe(true);
  });
});

describe("extractPageMetrics output is unchanged on the fixture pages", () => {
  for (const name of PAGE_METRICS_FIXTURES) {
    test(`${name}: viewport, full_page and per-screen equal the golden`, () => {
      expect(measured[name].viewport).toEqual(golden[name].viewport);
      expect(measured[name].fullPage).toEqual(golden[name].fullPage);
      expect(measured[name].perScreen).toEqual(golden[name].perScreen);
    });
  }
});
