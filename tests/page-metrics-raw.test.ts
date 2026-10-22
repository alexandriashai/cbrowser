/**
 * measurePageRaw on real pages: the stored form derives back to the golden.
 *
 * The CTC reference set stores RawPageMeasurement records as JSON and derives
 * PageMetrics from them when the curve is built. That is only sound if a
 * record measured in a browser, serialised and parsed again, derives to
 * exactly what extractPageMetrics returns on the live page. This proves it on
 * the golden fixture pages (Latin, CJK, abjad; viewport and full_page), and
 * that a derive-stage constant moves the result from the same stored record.
 *
 * It also holds the shape Stage B reads: boxes in fives, choice groups in
 * pairs, text blocks in eights, every list within its registered bound and
 * every capped list beside its uncapped count.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { serveFixtures } from "./fixtures/serve-fixtures.js";
import { PAGE_METRICS_FIXTURES, type PageMetricsGolden } from "./fixtures/page-metrics-measure.js";
import { measurePageRaw, deriveMetrics, type RawPageMeasurement, type MetricScope } from "../src/visual/cognitive-transport.js";
import { param, withParamOverrides } from "../src/visual/model-provenance.js";

const golden = JSON.parse(readFileSync(join(import.meta.dir, "fixtures", "page-metrics-golden.json"), "utf8")) as PageMetricsGolden;

let browser: Browser;
const raws: Record<string, Record<MetricScope, string>> = {};

beforeAll(async () => {
  browser = await chromium.launch();
  const fixtures = await serveFixtures();
  try {
    for (const name of PAGE_METRICS_FIXTURES) {
      // Measured as the golden was: same viewport, viewport first, then full_page.
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
      try {
        await page.goto(`${fixtures.base}${name}`, { waitUntil: "load" });
        const viewport = await measurePageRaw(page, "viewport");
        const full_page = await measurePageRaw(page, "full_page");
        raws[name] = { viewport: JSON.stringify(viewport), full_page: JSON.stringify(full_page) };
      } finally {
        await page.close();
      }
    }
  } finally {
    await fixtures.close();
  }
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

const parsed = (name: string, scope: MetricScope) => JSON.parse(raws[name][scope]) as RawPageMeasurement;

describe("a stored raw measurement derives to the golden", () => {
  for (const name of PAGE_METRICS_FIXTURES) {
    test(`${name}: JSON round trip, then deriveMetrics, equals extractPageMetrics' golden at both scopes`, () => {
      expect(deriveMetrics(parsed(name, "viewport"))).toEqual(golden[name].viewport as never);
      expect(deriveMetrics(parsed(name, "full_page"))).toEqual(golden[name].fullPage as never);
    });
  }

  test("a derive-stage constant moves the result from the same stored record", () => {
    const r = parsed("page-metrics-latin.html", "full_page");
    const base = deriveMetrics(r);
    const moved = withParamOverrides({ "pageMetrics.textDensity.midpoint": 6 }, () => deriveMetrics(r));
    expect(moved.textDensity).toBeLessThan(base.textDensity);
    const cap = withParamOverrides({ "pageMetrics.choiceCap": 10 }, () => deriveMetrics(r));
    expect(cap.choiceCount).toBe(10);
    expect(cap.choiceCountRaw).toBe(base.choiceCountRaw);
  });
});

describe("the geometry Stage B reads is well formed", () => {
  test("lists in fixed strides, within their bounds, beside their uncapped counts", () => {
    const maxBoxes = param("pageMetrics.raw.maxBoxes");
    const maxBlocks = param("pageMetrics.raw.maxTextBlocks");
    const maxGroups = param("pageMetrics.raw.maxChoiceGroups");
    let boxes = 0, blocks = 0, groups = 0;
    for (const name of PAGE_METRICS_FIXTURES)
      for (const scope of ["viewport", "full_page"] as const) {
        const r = parsed(name, scope);
        expect(r.format).toBe(1);
        expect(r.scope).toBe(scope);
        expect(r.boxes.length % 5).toBe(0);
        expect(r.boxes.length / 5).toBe(Math.min(r.interactiveElements, maxBoxes));
        expect(r.choiceGroups.length % 2).toBe(0);
        expect(r.choiceGroups.length / 2).toBe(Math.min(r.choiceGroupCount, maxGroups));
        expect(r.textBlocks.length % 8).toBe(0);
        expect(r.textBlocks.length / 8).toBe(Math.min(r.textBlockCount, maxBlocks));
        for (let i = 0; i < r.boxes.length; i += 5) {
          expect(r.kinds[r.boxes[i]]).toBeString();
          expect(r.boxes[i + 3]).toBeGreaterThanOrEqual(0);
          expect(r.boxes[i + 4]).toBeGreaterThanOrEqual(0);
        }
        for (let i = 0; i < r.choiceGroups.length; i += 2) {
          expect(r.kinds[r.choiceGroups[i]]).toBeString();
          expect(r.choiceGroups[i + 1]).toBeGreaterThan(0);
        }
        // Font sizes are real on a real page.
        for (let i = 0; i < r.textBlocks.length; i += 8) expect(r.textBlocks[i + 4]).toBeGreaterThan(0);
        boxes += r.boxes.length / 5; blocks += r.textBlocks.length / 8; groups += r.choiceGroups.length / 2;
      }
    // Non-vacuity: the fixtures produce every list.
    expect(boxes).toBeGreaterThan(50);
    expect(blocks).toBeGreaterThan(5);
    expect(groups).toBeGreaterThan(0);
  });

  test("viewport boxes are in document coordinates measured at the top, inside the first screen", () => {
    const r = parsed("page-metrics-latin.html", "viewport");
    expect(r.scrollY).toBe(0);
    for (let i = 0; i < r.boxes.length; i += 5) {
      expect(r.boxes[i + 2]).toBeLessThan(r.viewportHeight);
      expect(r.boxes[i + 2] + r.boxes[i + 4]).toBeGreaterThan(0);
    }
    // The caption it carries is the shared geometry's rounding of its own heights.
    expect(r.pageScreens).toBe(Math.round((r.documentHeight / r.viewportHeight) * 10) / 10);
  });
});
