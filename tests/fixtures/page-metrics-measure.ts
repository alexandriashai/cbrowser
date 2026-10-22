/**
 * Measure the page-metrics fixtures with extractPageMetrics, at both scopes and
 * per screen. Shared by tests/page-metrics-golden.test.ts and the generator
 * (generate-page-metrics-golden.ts), so the golden is written and checked by
 * the same code.
 *
 * The fixtures give every text-bearing box a fixed height, so which element
 * intersects the viewport depends on the stylesheet, not on the fonts the
 * machine has. Between them they reach every branch of the extractor: Latin,
 * CJK and abjad text, the carousel and running CSS animations, more than 50
 * visible elements (the colour sample), more than 100 links at full_page (the
 * choice cap) and the lazy-load scroll walk.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { Browser } from "playwright";
import { serveFixtures } from "./serve-fixtures.js";
import { extractPageMetrics, extractPerScreenMetrics } from "../../src/visual/cognitive-transport.js";

export const PAGE_METRICS_FIXTURES = ["page-metrics-latin.html", "page-metrics-cjk.html", "page-metrics-abjad.html"];

export type PageMetricsGolden = Record<string, { viewport: unknown; fullPage: unknown; perScreen: unknown }>;

export async function measurePageMetricsFixtures(browser: Browser): Promise<PageMetricsGolden> {
  const fixtures = await serveFixtures();
  const out: PageMetricsGolden = {};
  try {
    for (const name of PAGE_METRICS_FIXTURES) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
      try {
        await page.goto(`${fixtures.base}${name}`, { waitUntil: "load" });
        const viewport = await extractPageMetrics(page, "viewport");
        const fullPage = await extractPageMetrics(page, "full_page");
        const perScreen = await extractPerScreenMetrics(page, 6);
        out[name] = { viewport, fullPage, perScreen };
      } finally {
        await page.close();
      }
    }
  } finally {
    await fixtures.close();
  }
  return out;
}
