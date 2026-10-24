/**
 * Menu labels in the reading law (ISC-76; Alexa, 2026-10-23). On a first
 * visit a menu label is read once and then searched: Cockburn, Gutwin &
 * Greenberg (2007) fitted the search law without the one-off cost of reading
 * the labels for the first time. So the reading law reads the prose outside
 * every group at Brysbaert's rate, and charges law.reading.labelFirstRead per
 * grouped link for the labels.
 *
 * A browser measurement of page-metrics-nav-prose.html (a nav of 8 two-word
 * labels beside a 12-word paragraph; tests/page-metrics-format2.test.ts pins
 * its counts): only the paragraph is read at the prose rate, plus 8 x 0.13 s.
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

let browser: Browser;
const measured: Partial<Record<MetricScope, Raw>> = {};

beforeAll(async () => {
  browser = await chromium.launch();
  const fixtures = await serveFixtures();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    try {
      await page.goto(`${fixtures.base}page-metrics-nav-prose.html`, { waitUntil: "load" });
      for (const scope of SCOPES) measured[scope] = await measurePageRaw(page, scope);
    } finally {
      await page.close();
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
      const r = measured[scope]!;
      expect(r.groupedLinks).toBe(8);
      const label = MODEL_PROVENANCE["law.reading.labelFirstRead"];
      expect(label).toMatchObject({ value: 0.13, status: "hypothesis" });
      const m = deriveMetrics(r);
      expect(m.readingSeconds).toBeCloseTo(lettersReadingSeconds(PARAGRAPH_LETTERS) + 8 * 0.13, 12);
      expect(m.lawDiagnostics).toMatchObject({ labels: 8 });
      expect(m.lawDiagnostics.labelSeconds).toBeCloseTo(8 * 0.13, 12);
    });
  }
});
