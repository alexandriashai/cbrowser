/**
 * Raw format 2: the two measurement defects format 1 carried into the CTC
 * reference, each on a fixture page whose right answer is known by
 * construction.
 *
 *   1. Prose counted once. Format 1 took the innerText of every element
 *      matching the prose selector, so a p inside an li (or an li inside a
 *      td, a p inside a blockquote) was counted once per matching ancestor.
 *      Format 2 counts only the outermost matching element, so each visible
 *      character is in the prose exactly once. The fixture has 8 outermost
 *      prose elements and 45 words; per element, nested ones again, it is 15
 *      and 74.
 *   2. A language picker is not the page's language. www.w3.org read as CJK:
 *      the key-element rule (more than scriptKeyShare CJK in h1 + the first
 *      nav) fired on its first nav, which lists the Japanese and Chinese
 *      editions. Text declared in another language (lang, or a link's
 *      hreflang) is not key-element text, and a nav that is a language picker
 *      (named so, or mostly other-language links) is not the nav. A partial
 *      translation, which the rule exists for, still reads as CJK.
 *
 * Both are browser measurements (measurePageRaw), at both scopes; the pages
 * fit the first screen, so both scopes count the same elements.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser } from "playwright";
import { serveFixtures } from "./fixtures/serve-fixtures.js";
import { measurePageRaw, type MetricScope } from "../src/visual/cognitive-transport.js";

type Raw = Awaited<ReturnType<typeof measurePageRaw>>;

const PAGES = [
  "page-metrics-nested-prose.html",
  "page-metrics-lang-picker.html",
  "page-metrics-lang-picker-unmarked.html",
  "page-metrics-lang-links-in-nav.html",
  "page-metrics-partial-translation.html",
  "page-metrics-cjk.html",
  "page-metrics-abjad.html",
];
const SCOPES: MetricScope[] = ["viewport", "full_page"];

let browser: Browser;
const measured: Record<string, Record<MetricScope, Raw>> = {};

beforeAll(async () => {
  browser = await chromium.launch();
  const fixtures = await serveFixtures();
  try {
    for (const name of PAGES) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
      try {
        await page.goto(`${fixtures.base}${name}`, { waitUntil: "load" });
        measured[name] = {
          viewport: await measurePageRaw(page, "viewport"),
          full_page: await measurePageRaw(page, "full_page"),
        };
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

const words = (r: Raw) => r.text.wordLengths.reduce((n, [, c]) => n + c, 0);

describe("prose is counted once: the outermost matching element only", () => {
  for (const scope of SCOPES) {
    test(`${scope}: 8 prose blocks and 45 words, not 15 and 74`, () => {
      const r = measured["page-metrics-nested-prose.html"][scope];
      expect(r.text.script).toBe("alphabetic");
      expect(r.textBlockCount).toBe(8);
      expect(words(r)).toBe(45);
      expect(r.textBlocks.length).toBe(8 * 8);
      // Each block's own word count, in document order: p, li > p, li > ul,
      // td > ul > li, th, blockquote > p p, figcaption > p, h2 with a span.
      const blockWords: number[] = [];
      for (let i = 0; i < r.textBlocks.length; i += 8) blockWords.push(r.textBlocks[i + 1]);
      expect(blockWords).toEqual([5, 5, 9, 4, 3, 10, 4, 5]);
      // The totals are the blocks' sums, uncapped.
      let chars = 0;
      for (let i = 0; i < r.textBlocks.length; i += 8) chars += r.textBlocks[i];
      expect((r as Raw & { prose: { chars: number; words: number } }).prose).toEqual({ chars, words: 45 });
      // Format 1's count, kept for comparison only, measured on the same DOM.
      const nested = (r as Raw & { proseNested: { elements: number; chars: number; words: number } }).proseNested;
      expect(nested.elements).toBe(15);
      expect(nested.words).toBe(74);
      expect(nested.chars).toBeGreaterThan(chars);
    });
  }

  test("one fragment per sentence: the nested copies no longer add fragments", () => {
    const r = measured["page-metrics-nested-prose.html"].full_page;
    // Ten sentences end in a full stop, and the h2, which has none, is one more.
    const nonEmpty = r.text.fragmentLengths.filter(([len]) => len > 0).reduce((n, [, c]) => n + c, 0);
    expect(nonEmpty).toBe(11);
  });
});

describe("script detection: a language picker is not the page's language", () => {
  for (const scope of SCOPES) {
    test(`${scope}: the www.w3.org case (picker marked with lang and hreflang, first nav) reads alphabetic`, () => {
      const r = measured["page-metrics-lang-picker.html"][scope];
      expect(r.text.script).toBe("alphabetic");
    });

    test(`${scope}: an unmarked picker, named so, reads alphabetic`, () => {
      expect(measured["page-metrics-lang-picker-unmarked.html"][scope].text.script).toBe("alphabetic");
    });

    test(`${scope}: other-language links inside the main nav do not make it CJK`, () => {
      expect(measured["page-metrics-lang-links-in-nav.html"][scope].text.script).toBe("alphabetic");
    });

    test(`${scope}: controls: a partial translation still reads CJK; the CJK and abjad fixtures keep their script`, () => {
      expect(measured["page-metrics-partial-translation.html"][scope].text.script).toBe("cjk");
      expect(measured["page-metrics-cjk.html"][scope].text.script).toBe("cjk");
      expect(measured["page-metrics-abjad.html"][scope].text.script).toBe("abjad");
    });
  }
});
