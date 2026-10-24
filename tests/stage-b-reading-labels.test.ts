/**
 * Menu labels in the reading law (ISC-76; Alexa, 2026-10-23). On a first
 * visit a menu label is read once and then searched: Cockburn, Gutwin &
 * Greenberg (2007) fitted the search law without the one-off cost of reading
 * the labels for the first time. So the reading law reads the prose outside
 * every group at Brysbaert's rate, and charges law.reading.labelFirstRead per
 * grouped link with visible text (groupedLinksWithText): an icon-only link has
 * nothing to read.
 *
 * Browser measurements of two fixtures beside the same 12-word paragraph:
 *   - page-metrics-nav-prose.html, a nav of 8 two-word labels
 *     (tests/page-metrics-format2.test.ts pins its counts): the paragraph at
 *     the prose rate, plus 8 x 0.13 s;
 *   - page-metrics-nav-icons.html, a nav of 8 links of which 4 are list labels,
 *     1 a label in a span outside the prose selector and 3 icon-only: the
 *     paragraph, plus 5 x 0.13 s.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser } from "playwright";
import { serveFixtures } from "./fixtures/serve-fixtures.js";
import { deriveMetrics, measurePageRaw, type MetricScope } from "../src/visual/cognitive-transport.js";
import { lettersReadingSeconds } from "../src/visual/demand-laws.js";
import { MODEL_PROVENANCE } from "../src/visual/model-provenance.js";

type Raw = Awaited<ReturnType<typeof measurePageRaw>>;
const SCOPES: MetricScope[] = ["viewport", "full_page"];
const PARAGRAPH = "One paragraph of ordinary reading text with exactly twelve words in it.";
const PARAGRAPH_LETTERS = PARAGRAPH.split(/\s+/).reduce((n, w) => n + w.replace(/[^a-zA-Z]/g, "").length, 0);

const PAGES = ["page-metrics-nav-prose.html", "page-metrics-nav-icons.html"] as const;

let browser: Browser;
const measured: Record<string, Partial<Record<MetricScope, Raw>>> = {};

beforeAll(async () => {
  browser = await chromium.launch();
  const fixtures = await serveFixtures();
  try {
    for (const name of PAGES) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
      try {
        await page.goto(`${fixtures.base}${name}`, { waitUntil: "load" });
        measured[name] = {};
        for (const scope of SCOPES) measured[name][scope] = await measurePageRaw(page, scope);
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

describe("menu labels are read once each, not at the prose rate", () => {
  for (const scope of SCOPES) {
    test(`${scope}: a nav of 8 two-word labels beside a 12-word paragraph reads the paragraph plus 8 x 0.13 s`, () => {
      const r = measured["page-metrics-nav-prose.html"][scope]!;
      expect(r.groupedLinks).toBe(8);
      expect(r.groupedLinksWithText).toBe(8);
      const label = MODEL_PROVENANCE["law.reading.labelFirstRead"];
      expect(label).toMatchObject({ value: 0.13, status: "hypothesis" });
      const m = deriveMetrics(r);
      expect(m.readingSeconds).toBeCloseTo(lettersReadingSeconds(PARAGRAPH_LETTERS) + 8 * 0.13, 12);
      expect(m.lawDiagnostics).toMatchObject({ labels: 8 });
      expect(m.lawDiagnostics.labelSeconds).toBeCloseTo(8 * 0.13, 12);
    });
  }

  for (const scope of SCOPES) {
    test(`${scope}: an icon-only link costs no first read; a label outside the prose selector costs one`, () => {
      const r = measured["page-metrics-nav-icons.html"][scope]!;
      expect(r.groupedLinks).toBe(8);
      expect(r.groupedLinksWithText).toBe(5);
      const m = deriveMetrics(r);
      expect(m.lawDiagnostics).toMatchObject({ labels: 5 });
      expect(m.readingSeconds).toBeCloseTo(lettersReadingSeconds(PARAGRAPH_LETTERS) + 5 * 0.13, 12);
    });
  }
});
