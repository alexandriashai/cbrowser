/**
 * Raw format 2: the measurement defects format 1 carried into the CTC
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
 *   3. A choice counted in one group only. Format 1 counted a nav's links,
 *      then the menubar inside it, then the submenu inside that, so the
 *      same link sat in three groups (a nav inside a navigation region, in
 *      two). Format 2 gives each choice to the outermost group that offers it
 *      and drops a group left with none. The fixture has 5 groups and 14
 *      choices; per group, nested ones again, 8 and 23.
 *   4. Nav totals the stored list cannot cap. choiceGroups stores the first
 *      raw.maxChoiceGroups (64) groups, so the nav sizes in it undercount on
 *      a page with more; navGroupCount, navLinks and groupedLinks are
 *      uncapped, so links minus groupedLinks is the ungrouped links.
 *   5. Menu labels apart from the prose. The prose that sits in a nav or
 *      composite group (the groups 3 counts) is reported as proseInNav, so a
 *      reading law can leave out what the choosing law already reads: a nav
 *      of 8 labels beside one paragraph gives the labels' 16 words, and prose
 *      minus proseInNav is the paragraph, in words, characters and letters.
 *
 * All are browser measurements (measurePageRaw), at both scopes; the pages
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
  "page-metrics-nested-groups.html",
  "page-metrics-many-navs.html",
  "page-metrics-nav-prose.html",
  "page-metrics-nav-prose-nested.html",
  "page-metrics-nav-prose-abjad.html",
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

/** The stored choice groups as [kind, size] pairs. */
const groups = (r: Raw) => {
  const out: Array<[string, number]> = [];
  for (let i = 0; i < r.choiceGroups.length; i += 2) out.push([r.kinds[r.choiceGroups[i]], r.choiceGroups[i + 1]]);
  return out;
};
type NavTotals = { navGroupCount: number; navLinks: number; groupedLinks: number; choiceNested: { groups: number; items: number } };

describe("a choice is counted in one group only: the outermost that offers it", () => {
  for (const scope of SCOPES) {
    test(`${scope}: a menubar, its submenu and a nav inside a navigation region add no second count`, () => {
      const r = measured["page-metrics-nested-groups.html"][scope];
      expect(r.links).toBe(11);
      // Navs first, then the ARIA composites, each in document order; the
      // menubar, its menu and the inner Legal nav are left with no choice of
      // their own and are not groups.
      expect(groups(r)).toEqual([["nav", 5], ["nav", 3], ["nav", 1], ["tablist", 3], ["tablist", 2]]);
      expect(r.choiceGroupCount).toBe(5);
      const t = r as Raw & NavTotals;
      expect(t.navGroupCount).toBe(3);
      expect(t.navLinks).toBe(9);
      expect(t.groupedLinks).toBe(9);
      expect(r.links - t.groupedLinks).toBe(2);
      // Format 1's count, for comparison, on the same DOM.
      expect(t.choiceNested).toEqual({ groups: 8, items: 23 });
    });

    test(`${scope}: past the stored list's 64 groups, the nav totals are still whole`, () => {
      const r = measured["page-metrics-many-navs.html"][scope];
      expect(r.choiceGroupCount).toBe(70);
      expect(r.choiceGroups.length / 2).toBe(64);
      expect(groups(r).reduce((n, [, size]) => n + size, 0)).toBe(128);
      const t = r as Raw & NavTotals;
      expect(t.navGroupCount).toBe(70);
      expect(t.navLinks).toBe(140);
      expect(t.groupedLinks).toBe(140);
      expect(r.links - t.groupedLinks).toBe(1);
      expect(t.choiceNested).toEqual({ groups: 70, items: 140 });
    });
  }
});

type InNav = { proseInNav: { chars: number; words: number; letters: number; abjadWords: number; cjkChars: number } };
const letterCount = (r: Raw) => r.text.wordLengths.reduce((n, [len, c]) => n + len * c, 0);
const PARAGRAPH = "One paragraph of ordinary reading text with exactly twelve words in it.";

describe("menu labels apart from the prose: proseInNav", () => {
  for (const scope of SCOPES) {
    test(`${scope}: a nav of 8 labels beside one paragraph; prose minus proseInNav is the paragraph`, () => {
      const r = measured["page-metrics-nav-prose.html"][scope] as Raw & InNav;
      expect(r.proseInNav.words).toBe(16);
      expect(r.prose.words).toBe(28);
      expect(r.prose.words - r.proseInNav.words).toBe(12);
      expect(r.prose.chars - r.proseInNav.chars).toBe(PARAGRAPH.length);
      // In the reading law's units: the paragraph's letters are what is left.
      const paragraphLetters = PARAGRAPH.split(/\s+/).reduce((n, w) => n + w.replace(/[^a-zA-Z]/g, "").length, 0);
      expect(letterCount(r) - r.proseInNav.letters).toBe(paragraphLetters);
      expect(r.proseInNav.abjadWords).toBe(0);
      expect(r.proseInNav.cjkChars).toBe(0);
    });

    test(`${scope}: a block that holds a nav gives the nav's text; a composite outside any nav counts too`, () => {
      const r = measured["page-metrics-nav-prose-nested.html"][scope] as Raw & InNav;
      expect(r.prose.words).toBe(21);
      // The cell's nav (6 words) and the menubar's labels (4 words).
      expect(r.proseInNav.words).toBe(10);
      expect(r.prose.words - r.proseInNav.words).toBe(11);
    });

    test(`${scope}: abjad and CJK pages count their in-group prose in their own units`, () => {
      const a = measured["page-metrics-nav-prose-abjad.html"][scope] as Raw & InNav;
      expect(a.text.script).toBe("abjad");
      expect(a.proseInNav.abjadWords).toBe(8);
      expect(a.text.abjadWordLengths.reduce((n, [, c]) => n + c, 0) - a.proseInNav.abjadWords).toBe(9);
      const c = measured["page-metrics-partial-translation.html"][scope] as Raw & InNav;
      expect(c.text.script).toBe("cjk");
      // Four seven-character nav labels; the h1's nine characters are not in a group.
      expect(c.proseInNav.cjkChars).toBe(28);
      expect(c.text.cjkChars - c.proseInNav.cjkChars).toBe(9);
      // A page with no prose in any group reports none.
      const p = measured["page-metrics-nested-prose.html"][scope] as Raw & InNav;
      expect(p.proseInNav).toEqual({ chars: 0, words: 0, letters: 0, abjadWords: 0, cjkChars: 0 });
    });
  }
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
