/**
 * find_element_by_intent: the locator cascade's must-fix list (BUG-01 redesign, 2026-10-08).
 *
 * Each block is one judged gap in design C, reproduced on a fixture of the same shape as the
 * one that exposed it and asserted on the live cascade:
 *   (a) a trailing container word that names no container is part of the name ("pay with card")
 *   (b) the superset rung: the name is a sub-phrase of the intent ("purchase credits" -> "Purchase")
 *   (c) "X in the navigation" never resolves into a footer, and a hidden header nav yields null
 *   (d) links and buttons take inflections ("category link" -> "Categories") but not the
 *       promiscuous phrases in NO_FUZZY_SYNONYMS
 *   (e) `zone` is the most severe classification over every name the element carries
 *   (f) the verbose miss lists visible controls; an empty kind pool returns null in one round trip
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";
import { findElementByIntent, type FindByIntentOptions } from "../src/analysis/natural-language.js";

let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
}, 120_000);
afterAll(async () => { await browser?.close(); }, 30_000);

const doc = (body: string, head = "") =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>t</title>${head}</head><body>${body}</body></html>`;

type Found = NonNullable<Awaited<ReturnType<typeof findElementByIntent>>>;

async function find(html: string, intent: string, opts: FindByIntentOptions & { width?: number } = {}): Promise<Found | null> {
  await page.setViewportSize({ width: opts.width ?? 1280, height: 800 });
  await page.setContent(html);
  return findElementByIntent({ getPage: async () => page } as any, intent, { verbose: opts.verbose });
}

/** The returned selector matches exactly one element, and it is the one `expected` names. */
async function resolvesTo(r: Found | null, expected: string): Promise<void> {
  expect(r, "expected a result").not.toBeNull();
  expect(r!.selector.length).toBeGreaterThan(0);
  const n = await page.locator(r!.selector).count();
  expect(n, `selector ${r!.selector} must be unique`).toBe(1);
  // page.$eval is Playwright's in-page DOM evaluation of a fixed function, not JavaScript eval().
  const same = await page.$eval(r!.selector, (el, css) => el.matches(css as string), expected);
  expect(same, `selector ${r!.selector} must be ${expected}`).toBe(true);
}

// ---------------------------------------------------------------------------
// (a) + (b): a wallet page with a "Pay with card" submit and a "Purchase" link under a Credits heading
// ---------------------------------------------------------------------------
const WALLET = doc(`
  <header><a href="/" id="brand">Shop</a>
    <nav aria-label="Account"><a href="/orders">Orders</a> <a href="/wallet" aria-current="page">Wallet</a></nav></header>
  <main><h1>Wallet</h1>
    <section aria-labelledby="bal-h"><h2 id="bal-h">Balance due: $42.00</h2>
      <form action="/wallet/pay" method="post">
        <label>Card <select name="card"><option>Mastercard ending 1111</option></select></label>
        <button type="submit" class="pay">Pay with card</button>
      </form></section>
    <section aria-labelledby="top-h"><h2 id="top-h">Credits</h2><p>1,000 credits for $25</p>
      <a class="btn" data-testid="purchase-credits" href="/wallet/purchase?pack=1000">Purchase</a>
      <a class="btn" href="/wallet/history">View history</a></section>
  </main>`);

/** Real product cards: the card kind must still resolve containers when they exist. */
const PLANS = doc(`
  <main><h1>Plans</h1>
    <section class="card" id="plan-basic"><h2>Basic</h2><p class="price">$5/mo</p><a href="/buy/basic" class="btn">Choose Basic</a></section>
    <section class="card" id="plan-team"><h2>Team</h2><p class="price">$20/mo</p><a href="/buy/team" class="btn">Choose Team</a></section>
  </main>`);

describe("(a) a trailing kind word that names no container is part of the name", () => {
  test("'pay with card' reaches the Pay with card submit, not a card", async () => {
    const r = await find(WALLET, "pay with card");
    await resolvesTo(r, "button.pay");
    expect(r!.matchedBy).toBe("exact");
    expect(r!.accessibleName).toBe("Pay with card");
    expect(r!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test("'click pay with card' (verb form) reaches the same control", async () => {
    await resolvesTo(await find(WALLET, "click pay with card"), "button.pay");
  });

  test("the card kind still resolves a real product card", async () => {
    await resolvesTo(await find(PLANS, "Team card"), "#plan-team");
    await resolvesTo(await find(PLANS, "second card"), "#plan-team");
  });

  test("the retry does not invent a control: 'pay with card' on the plans page is null", async () => {
    expect(await find(PLANS, "pay with card")).toBeNull();
  });
});

describe("(b) superset: the accessible name is a sub-phrase of the intent", () => {
  test("'purchase credits' reaches the link named Purchase under the Credits heading, as a guess", async () => {
    const r = await find(WALLET, "purchase credits");
    await resolvesTo(r, "[data-testid='purchase-credits']");
    expect(r!.matchedBy).toBe("superset");
    expect(r!.confidence).toBeGreaterThanOrEqual(0.5);
    expect(r!.confidence).toBeLessThanOrEqual(0.65);
    expect(r!.zone).toBe("red");
  });

  test("'purchase credits link' takes the same path with the kind given", async () => {
    const r = await find(WALLET, "purchase credits link");
    await resolvesTo(r, "[data-testid='purchase-credits']");
    expect(r!.confidence).toBeLessThanOrEqual(0.65);
  });

  const HN = doc(`
    <header><nav class="navbar"><a href="/" class="brand"><b>Hacker News</b></a>
      <a href="/newest">new</a> <a href="/front">past</a> <a href="/ask">ask</a> <a href="/show">show</a> <a href="/jobs">jobs</a></nav></header>
    <main><table><tr><td><a href="/vote?id=1" class="vote">upvote</a></td><td><a href="/item?id=1">A story title</a></td></tr>
      <tr><td><a href="/vote?id=2" class="vote">upvote</a></td><td><a href="/item?id=2">Another story</a></td></tr></table></main>
    <footer><a href="/home">Home</a> <a href="/guidelines">Guidelines</a></footer>`);

  test("'Hacker News home link' prefers the two-word name over the footer's Home", async () => {
    const r = await find(HN, "Hacker News home link");
    await resolvesTo(r, "a.brand");
    expect(r!.matchedBy).toBe("superset");
    expect(r!.confidence).toBeLessThanOrEqual(0.65);
  });

  test("a row-scoped intent on a table-layout page with no landmarks returns null rather than a guess", async () => {
    expect(await find(HN, "upvote button for the first story")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (c) navigation scope: header nav hidden under 600px; a breadcrumb nav in main; a footer nav
// ---------------------------------------------------------------------------
const NAVS = doc(`
  <header><button class="menu-toggle" aria-expanded="false" aria-controls="primary">Menu</button>
    <nav id="primary" aria-label="Main"><a href="/docs">Docs</a> <a href="/pricing">Pricing</a> <a href="/blog">Blog</a></nav></header>
  <main><nav aria-label="Breadcrumb" id="crumbs"><a href="/">Home</a> <a href="/docs/api">API docs</a></nav><h1>Page</h1><p>Body</p></main>
  <footer><nav aria-label="Footer" id="footnav"><a href="/docs">Docs</a> <a href="/pricing">Pricing</a> <a href="/legal">Legal</a></nav></footer>`,
  `<style>@media (max-width: 600px) { #primary { display: none } }</style>`);

describe("(c) 'X in the navigation' excludes footer navs; a hidden header nav yields null", () => {
  test("at 1280 the header nav's Pricing wins over the footer's", async () => {
    const r = await find(NAVS, "pricing link in the navigation");
    await resolvesTo(r, "#primary a[href='/pricing']");
    expect(r!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test("at 393, with the header nav hidden, the answer is null, not the footer's Pricing", async () => {
    expect(await find(NAVS, "pricing link in the navigation", { width: 393 })).toBeNull();
  });

  test("a link that exists only in the footer nav is a capped guess while the page's own nav is visible, null when it is hidden", async () => {
    const r = await find(NAVS, "legal link in the navigation");
    await resolvesTo(r, "#footnav a[href='/legal']");
    expect(r!.confidence).toBeLessThanOrEqual(0.6);
    expect(await find(NAVS, "legal link in the navigation", { width: 393 })).toBeNull();
  });

  test("a header built from a div still counts as the page's own navigation", async () => {
    const DIVNAV = doc(`<header><div class="navbar"><a href="/">Home</a> <a id="nav-about" href="/about">About</a></div></header>
      <main><p>Hello</p></main><footer><nav aria-label="Footer"><a href="/privacy">Privacy</a> <a href="/terms">Terms</a></nav></footer>`);
    await resolvesTo(await find(DIVNAV, "about link in the navigation"), "#nav-about");
    const r = await find(DIVNAV, "privacy link in the navigation");
    await resolvesTo(r, "footer a[href='/privacy']");
    expect(r!.confidence).toBeLessThanOrEqual(0.6);
  });

  test("the same link is found when the intent says footer", async () => {
    await resolvesTo(await find(NAVS, "legal link in the footer"), "#footnav a[href='/legal']");
  });

  test("a contains hit in a non-primary nav, while a primary nav is visible, is capped at 0.6", async () => {
    const r = await find(NAVS, "api link in the navigation");
    await resolvesTo(r, "#crumbs a[href='/docs/api']");
    expect(r!.matchedBy).toBe("contains");
    expect(r!.confidence).toBeLessThanOrEqual(0.6);
  });
});

// ---------------------------------------------------------------------------
// (d) stems for links and buttons
// ---------------------------------------------------------------------------
// hrefs, ids and classes carry none of the intent words, so the attribute rung cannot be what answers
const STEMS = doc(`
  <nav><a href="/c">Categories</a> <a href="/s">Stories</a> <a href="/shop">Store</a> <a href="/old">Archived items</a> <a href="/bin">Removed items</a></nav>
  <main><button type="button" id="b1">Saved searches</button> <button type="button" id="b2">Archived posts</button></main>`);

describe("(d) the stem rung reaches links and buttons by inflection only", () => {
  test("'category link' -> Categories", async () => {
    const r = await find(STEMS, "category link");
    await resolvesTo(r, "a[href='/c']");
    expect(r!.matchedBy).toBe("stem");
    expect(r!.confidence).toBeLessThanOrEqual(0.6);
  });

  test("'story link' -> Stories, never Store", async () => {
    const r = await find(STEMS, "story link");
    await resolvesTo(r, "a[href='/s']");
    expect(r!.matchedBy).toBe("stem");
  });

  test("an e-final word inflects: 'archive link' -> Archived items", async () => {
    const r = await find(STEMS, "archive link");
    await resolvesTo(r, "a[href='/old']");
    expect(r!.matchedBy).toBe("stem");
  });

  test("'archive button' -> Archived posts", async () => {
    const r = await find(STEMS, "archive button");
    await resolvesTo(r, "#b2");
    expect(r!.matchedBy).toBe("stem");
  });

  test("a NO_FUZZY_SYNONYMS phrase does not stem: 'remove link' and 'save button' are null", async () => {
    expect(await find(STEMS, "remove link")).toBeNull();
    expect(await find(STEMS, "save button")).toBeNull();
  });

  test("the stem rung keeps the contains length guard: a long name wrapping the words is not it", async () => {
    const r = await find(doc(`<main><a href="/n">Jump straight to the Release notes</a></main>`), "release note link");
    expect(r).toBeNull();
  });
});

describe("rungs that reach beyond the kind pool still run", () => {
  test("'Talk tab' on a page whose tabs are plain links in a list (no role=tab) lifts the text match", async () => {
    const WIKI = doc(`<nav><ul><li><a href="/w" title="View the content page">Article</a></li>
      <li><a href="/t" title="Discuss improvements">Talk</a></li></ul></nav><main><h1>Topic</h1></main>`);
    const r = await find(WIKI, "Talk tab");
    await resolvesTo(r, "a[href='/t']");
    expect(r!.matchedBy).toBe("text-exact");
  });

  test("an intent naming a structure does not fall to a control named with the rest of its words", async () => {
    const PRICING = doc(`<header><nav><a href="/pricing" data-testid="nav-pricing">Pricing</a></nav></header>
      <main><table id="plans"><tr><th>Plan</th><th>Price</th></tr><tr><td>Basic</td><td>$5</td></tr></table></main>`);
    const r = await find(PRICING, "pricing table");
    expect(r === null || r.selector !== '[data-testid="nav-pricing"]').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (e) zone over every name
// ---------------------------------------------------------------------------
const ZONES = doc(`
  <main>
    <button type="button" id="confirm" aria-label="Confirm" title="Pay now">OK</button>
    <input type="submit" id="go" value="Buy now" aria-label="Continue">
    <button type="button" id="plain">OK</button>
  </main>`);

describe("(e) zone is the most severe classification over every name the element carries", () => {
  test("an aria-label of Confirm with a title of Pay now is red", async () => {
    const r = await find(ZONES, "confirm button");
    await resolvesTo(r, "#confirm");
    expect(r!.accessibleName).toBe("Confirm");
    expect(r!.zone).toBe("red");
  });

  test("an aria-label of Continue over a value of Buy now is red", async () => {
    const r = await find(ZONES, "continue button");
    await resolvesTo(r, "#go");
    expect(r!.zone).toBe("red");
  });

  test("a plain OK button is not red", async () => {
    const r = await find(ZONES, "ok button");
    expect(r).not.toBeNull();
    expect(r!.zone).toBeDefined();
    expect(r!.zone).not.toBe("red");
  });
});

// ---------------------------------------------------------------------------
// (f) misses: the verbose shape lists visible controls; an empty pool is null in one round trip
// ---------------------------------------------------------------------------
describe("(f) misses", () => {
  test("verbose on a miss lists the first visible links and buttons so an agent can rephrase", async () => {
    const r = await find(WALLET, "frobnicate widget", { verbose: true });
    expect(r).not.toBeNull();
    expect(r!.selector).toBe("");
    expect(r!.confidence).toBe(0);
    const tags = (r!.alternatives ?? []).map(a => a.tag);
    expect(tags.length).toBeGreaterThanOrEqual(3);
    expect(tags.every(t => ["a", "button", "select", "input"].includes(t))).toBe(true);
    expect(r!.aiSuggestion).toContain("Pay with card");
  });

  test("an empty kind pool returns null", async () => {
    expect(await find(doc("<main><h1>No controls</h1><p>Only text.</p></main>"), "docs link")).toBeNull();
    expect(await find(doc("<main><h1>No controls</h1><p>Only text.</p></main>"), "docs link", { verbose: true }))
      .toMatchObject({ selector: "", confidence: 0 });
  });

  test("a css-only rung still runs when no intent word appears in the pool", async () => {
    const r = await find(doc(`<form><label>Reach me <input type="tel" name="contact"></label></form>`), "phone field");
    await resolvesTo(r, "input[name='contact']");
    expect(r!.matchedBy).toBe("field-type");
  });
});
