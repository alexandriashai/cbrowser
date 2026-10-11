/**
 * page_understand: what an element is called, what counts as interactive, and
 * when a page is a landing page. Report item B40, plus the page-understanding
 * half of B47 (glued text), 2026-10-10.
 *
 * Measured on cbrowser.ai/blog that day:
 *   - the GitHub icon link and the theme / accessibility / read-aloud buttons
 *     came back with elementText "" although each has an aria-label;
 *   - <div id="main-content" tabindex="-1"> (the skip link's target, i.e. the
 *     whole page body) was listed as a click affordance;
 *   - the page was typed "landing" because its header nav has more than three
 *     short links above the fold. Still true, a named limit: excluding header
 *     links from the hero count turned 10 of 62 real landing pages into
 *     "article" or "list", so that change was undone (see classifyPageType);
 *   - card text was glued: "8 minresearchattentionbenchmarks+2We Beat Two...".
 *
 * Every fixture is local (page.setContent). Tests call the shipped engine.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser } from "playwright";
import { PageUnderstandingEngine, type PageUnderstanding } from "../src/analysis/page-understanding.js";

const SVG = `<svg width="16" height="16" aria-hidden="true"><path d="M0 0h16v16z"/></svg>`;
const doc = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

const HEADER = `<header><a href="/">CBrowser</a><nav aria-label="Main">
  <a href="/docs/">Docs</a> <a href="/pricing/">Pricing</a> <a href="/blog/">Blog</a> <a href="/about/">About</a>
</nav></header>`;

const EXCERPT = "Our attention model lost to a blurred circle in the morning and beat two frontier vision models by the afternoon. Three unglamorous fixes did it: a constant nobody had measured, a property of the eye nobody had modelled, and a technique.";

const LABELS = doc("Labels fixture", `<nav aria-label="Social"><a href="https://x.test/" aria-label="Follow on X">${SVG}</a></nav>
<main>
  <a id="gh" href="https://github.com/x/y" aria-label="View on GitHub">${SVG}</a>
  <button id="settings" class="icon" title="Settings">${SVG}</button>
  <a href="/docs/">Docs</a>
</main>`);

const TABINDEX = doc("Tabindex fixture", `<a href="#main-content">Skip to main content</a>
<div id="main-content" tabindex="-1"><h1>Hello</h1><p>The whole page body.</p>
  <div id="roving" role="listbox" tabindex="0" aria-label="Options"><div role="option">One</div></div>
</div>`);

// Real landing pages (stripe.com, linear.app, cbrowser.ai/pricing) have one or
// two hero links and short blurbs, and are typed "landing" via the header nav's
// links, which count toward the hero.
const LANDING = doc("Product | Fixture", `${HEADER}<main>
  <section class="hero"><h1>Test like 17 users, not like you</h1><p>Short pitch.</p>
    <a class="btn" href="/register/">Try free</a></section>
  <section><h2>Features</h2>
    <div><h3>Journeys</h3><p>Watch simulated users.</p></div>
    <div><h3>Audits</h3><p>Find barriers.</p></div>
    <div><h3>Reports</h3><p>Share results.</p></div>
  </section>
</main>`);

// b268812 excluded every header from the hero count, so a hero marked up as
// <header> in <main> lost its three CTAs and the page was typed "article"; the
// same hero in a <section> stayed "landing". Both are "landing" on 6fbeda6 and
// again now that the exclusion is undone. (2026-10-10, B40)
const PROSE = `<section><h2>Why</h2><h3>One</h3><p>${EXCERPT}</p><p>${EXCERPT}</p>
  <h3>Two</h3><p>${EXCERPT}</p><p>${EXCERPT}</p><p>${EXCERPT}</p></section>`;
const HERO = `<h1>Test like 17 users</h1><a href="/register/">Start free</a> <a href="/demo/">Book a demo</a> <a href="/docs/">Read the docs</a>`;
const HERO_IN_HEADER = doc("Product | Fixture", `${HEADER}<main><header class="hero">${HERO}</header>${PROSE}</main>`);
const HERO_IN_SECTION = doc("Product | Fixture", `${HEADER}<main><section class="hero">${HERO}</section>${PROSE}</main>`);

const GLUE = doc("Glue fixture", `<main>
  <a id="card" class="card" href="/blog/we-beat/" style="display:block">
    <div style="display:flex;gap:8px"><span style="display:inline-flex">research</span><span style="display:inline-flex">attention</span><span>Aug 4, 2026</span></div>
    <h3>We Beat Two Frontier Vision Models</h3></a>
  <a id="pricing-link" href="/pricing/"><mark>Pri</mark>cing plans</a>
</main>`);

let browser: Browser;
const results: Record<string, PageUnderstanding> = {};

async function understand(html: string): Promise<PageUnderstanding> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.setContent(html);
  try {
    return await new PageUnderstandingEngine().analyze(page, "auto");
  } finally {
    await ctx.close();
  }
}

const textOf = (u: PageUnderstanding, needle: string) =>
  u.affordances.find((a) => a.element.includes(needle))?.elementText;

beforeAll(async () => {
  browser = await chromium.launch();
  results.labels = await understand(LABELS);
  results.tabindex = await understand(TABINDEX);
  results.landing = await understand(LANDING);
  results.glue = await understand(GLUE);
  results.heroInHeader = await understand(HERO_IN_HEADER);
  results.heroInSection = await understand(HERO_IN_SECTION);
}, 120_000);

afterAll(async () => { await browser?.close(); });

describe("an element with no visible text is named by aria-label, then title", () => {
  test("an icon link's elementText is its aria-label", () => {
    expect(textOf(results.labels, "#gh")).toBe("View on GitHub");
  });

  test("an icon button's elementText is its title", () => {
    expect(textOf(results.labels, "#settings")).toBe("Settings");
  });

  test("a nav's icon link carries its label too", () => {
    const social = results.labels.structure.navigation.find((g) => g.label === "Social");
    expect(social?.elements.map((e) => e.text)).toEqual(["Follow on X"]);
  });
});

describe("a negative tabindex is not an affordance", () => {
  test("the skip link's tabindex=-1 target is not listed", () => {
    expect(results.tabindex.affordances.map((a) => a.element)).not.toContain("#main-content");
  });

  test("tabindex=0 still is", () => {
    expect(results.tabindex.affordances.map((a) => a.element)).toContain("#roving");
  });
});

describe("a landing page stays landing", () => {
  test("a page with one hero link, short blurbs and a four-link header is landing", () => {
    expect(results.landing.type).toBe("landing");
  });

  test("a hero in a <header> inside main, with three CTAs and long prose, is landing", () => {
    expect(results.heroInHeader.type).toBe("landing");
  });

  test("the same hero in a <section> is landing too", () => {
    expect(results.heroInSection.type).toBe("landing");
  });
});

describe("text nodes are not glued", () => {
  test("a card's badges, date and heading keep their spaces", () => {
    expect(textOf(results.glue, "#card")).toBe("research attention Aug 4, 2026 We Beat Two Frontier Vision Models");
  });

  test("a word split by an inline element stays one word", () => {
    expect(textOf(results.glue, "#pricing-link")).toBe("Pricing plans");
  });
});
