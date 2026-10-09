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

// ---------------------------------------------------------------------------
// (g)-(j): a GOV.UK-shaped header (super-navigation: labelled <nav>, toggle named by aria-label,
// logo link named only by aria-label) and a marketing header collapsed at 393
// ---------------------------------------------------------------------------
const GOVUK = doc(`
  <header class="govuk-header"><div class="govuk-header__container">
    <a id="logo" href="/" aria-label="Go to the GOV.UK homepage" class="govuk-header__link--homepage">
      <svg aria-hidden="true" focusable="false" width="32" height="30" viewBox="0 0 32 30"><path d="M0 0h32v30H0z"/></svg></a>
    <nav aria-labelledby="super-navigation-menu-heading" class="app-navigation js-app-navigation">
      <h2 id="super-navigation-menu-heading" class="visually-hidden">Navigation menu</h2>
      <div class="app-navigation__container">
        <button type="button" class="app-navigation__toggle" id="super-navigation-menu-toggle" aria-controls="super-navigation-menu"
          aria-label="Show navigation menu" aria-expanded="false">Menu</button>
        <ul id="super-navigation-menu" class="app-navigation__list" hidden>
          <li><a href="/services">Services</a></li><li><a href="/guidance">Guidance</a></li><li><a href="/departments">Departments</a></li>
        </ul>
      </div></nav></div></header>
  <main><h1>Welcome</h1><p>Body</p></main>`,
  `<style>.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}</style>`);

const MARKETING = doc(`
  <header><a href="/" class="brand"><img src="data:," alt="Acme" width="80" height="24"></a>
    <nav id="navigation-menu" aria-label="Main">
      <button class="nav-toggle" aria-label="Toggle navigation menu" aria-expanded="false" aria-controls="nav-list"><span class="bar"></span></button>
      <ul id="nav-list"><li><a href="/product">Product</a></li><li><a href="/pricing">Pricing</a></li><li><a href="/docs">Docs</a></li></ul>
    </nav></header>
  <main><h1>Acme</h1><p>Body</p></main>
  <footer><nav aria-label="Footer"><a href="/legal">Legal</a></nav></footer>`,
  `<style>.bar{display:block;width:20px;height:2px;background:#000}.nav-toggle{display:none;padding:8px}
   @media (max-width: 600px){ #nav-list{display:none} .nav-toggle{display:inline-block} }</style>`);

describe("(g) a menu toggle named by an aria-label with extra words", () => {
  test("'Menu button' reaches the GOV.UK super-navigation toggle", async () => {
    const r = await find(GOVUK, "Menu button");
    await resolvesTo(r, "#super-navigation-menu-toggle");
    expect(r!.confidence).toBeGreaterThanOrEqual(0.8);
  });

  test("'menu' and 'hamburger menu' at 393 reach the same toggle", async () => {
    await resolvesTo(await find(GOVUK, "menu", { width: 393 }), "#super-navigation-menu-toggle");
    await resolvesTo(await find(GOVUK, "hamburger menu", { width: 393 }), "#super-navigation-menu-toggle");
  });

  test("a Stripe-style 'Toggle navigation menu' toggle at 393", async () => {
    await resolvesTo(await find(MARKETING, "Menu button", { width: 393 }), "button.nav-toggle");
  });

  test("the visible text Menu alone qualifies when the aria-label says something else", async () => {
    const T = doc(`<header><button id="t" aria-label="Open site drawer" aria-expanded="false">Menu</button><nav hidden><a href="/a">A</a></nav></header>`);
    await resolvesTo(await find(T, "Menu button"), "#t");
  });
});

describe("(h) a logo link named only by its aria-label", () => {
  test("'GOV.UK logo' reaches the header's homepage link", async () => {
    const r = await find(GOVUK, "GOV.UK logo");
    await resolvesTo(r, "#logo");
    expect(r!.confidence).toBeGreaterThanOrEqual(0.8);
  });

  test("'logo' and 'site logo' reach it too; a brand word the page does not carry is null", async () => {
    await resolvesTo(await find(GOVUK, "logo"), "#logo");
    await resolvesTo(await find(GOVUK, "site logo"), "#logo");
    expect(await find(GOVUK, "Contoso logo")).toBeNull();
  });

  test("'Acme logo' on the marketing header reaches the brand link by its image alt", async () => {
    await resolvesTo(await find(MARKETING, "Acme logo"), "a.brand");
  });
});

describe("(i)/(j) a bare landmark intent returns the nav landmark even when its links are collapsed", () => {
  test("'navigation' on the GOV.UK header is the labelled <nav>, not the toggle", async () => {
    const r = await find(GOVUK, "navigation");
    await resolvesTo(r, "nav.app-navigation");
    expect(r!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  test("'main navigation' on the GOV.UK header is the <nav> at both widths", async () => {
    await resolvesTo(await find(GOVUK, "main navigation"), "nav.app-navigation");
    await resolvesTo(await find(GOVUK, "main navigation", { width: 393 }), "nav.app-navigation");
  });

  test("'main navigation' at 393 on the marketing header is <nav id=navigation-menu>, not the toggle", async () => {
    const r = await find(MARKETING, "main navigation", { width: 393 });
    await resolvesTo(r, "#navigation-menu");
    expect(r!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  test("'navigation' at 1280 on the marketing header is the same <nav>", async () => {
    await resolvesTo(await find(MARKETING, "navigation"), "#navigation-menu");
  });

  test("'menu' at 393 on the marketing header is still the toggle (the control, not the landmark)", async () => {
    await resolvesTo(await find(MARKETING, "menu", { width: 393 }), "button.nav-toggle");
  });
});

// ---------------------------------------------------------------------------
// D2 cross-vendor audit (Forge, 2026-10-08): page shapes the auditor wrote, reproduced here as fixtures.
// ---------------------------------------------------------------------------
const SITE = (extra = "") => `<header><a href="/" class="site-logo"><img src="data:," alt="Acme" width="80" height="24"></a>
  <nav aria-label="Main"><a href="/shop">Shop</a> <a href="/about">About</a> ${extra}</nav></header>`;

/** The click resolver reads a selector as page text first: exact, then a case-insensitive substring. */
async function clickSafe(sel: string): Promise<void> {
  expect(sel.split(/\s*>\s*/).length > 1 || /[#.\[]/.test(sel), `lone tag ${sel}`).toBe(true);
  expect(await page.getByText(sel, { exact: true }).count(), `${sel} is exact page text`).toBe(0);
  expect(await page.getByText(sel).count(), `${sel} is a substring of page text`).toBe(0);
}

describe("F1: the selector cannot be read as page text by the click resolver", () => {
  test("a lone tag is never emitted: 'join button' beside 'Press the button below'", async () => {
    const r = await find(doc(`<main><h1>Community</h1><p>Press the button below to join the waitlist.</p><button type="button" id="j">Join</button></main>`), "join button");
    await resolvesTo(r, "#j");
    await clickSafe(r!.selector);
  });

  test("an id that is also a hashtag's text is skipped for the next form", async () => {
    const r = await find(doc(`<header><nav><a href="/" id="home">Home</a> <a href="/explore">Explore</a></nav></header>
      <main><p>Loving this <a href="/tags/home">#home</a> setup</p></main>`), "home link");
    await resolvesTo(r, "a#home");
    expect(r!.selector).not.toBe("#home");
    await clickSafe(r!.selector);
  });

  test("a link whose text is the word 'button' does not capture a bare-tag selector", async () => {
    const r = await find(doc(`<main><p>Read our guide to <a href="/guides/button-design">button design</a>.</p><button type="button" id="s">Subscribe</button></main>`), "subscribe button");
    await resolvesTo(r, "#s");
    await clickSafe(r!.selector);
  });
});

describe("F3: an ordinal beyond the visible exact matches is null, not a looser rung", () => {
  const CART = doc(`${SITE()}<main><h1>Cart</h1><ul><li>Shirt <button id="r1">Remove</button></li></ul>
    <section><h2>Payment</h2><button id="rpm">Remove payment method</button></section></main>`);
  test("'second remove button' with one Remove is null", async () => {
    expect(await find(CART, "second remove button")).toBeNull();
    await resolvesTo(await find(CART, "first remove button"), "#r1");
  });
  test("'third delete button' with two Delete rows and a Delete all is null", async () => {
    expect(await find(doc(`<main><ul><li>A <button>Delete</button></li><li>B <button>Delete</button></li></ul><section><button>Delete all projects</button></section></main>`), "third delete button")).toBeNull();
  });
});

describe("F4: the danger guard looks at the verb in the candidate's name", () => {
  test("object-only intents never reach a destructive name", async () => {
    expect(await find(doc(`${SITE()}<main><button id="d">Delete account</button></main>`), "account button")).toBeNull();
    expect(await find(doc(`${SITE()}<main><button>Cancel subscription</button></main>`), "subscription button")).toBeNull();
    expect(await find(doc(`${SITE()}<main><button>Leave team</button></main>`), "team button")).toBeNull();
    expect(await find(doc(`${SITE()}<main><button>Clear browsing history</button></main>`), "browsing history button")).toBeNull();
    expect(await find(doc(`${SITE()}<main><button>Close my account</button></main>`), "my account button")).toBeNull();
  });
  test("an intent that says the verb still reaches it", async () => {
    await resolvesTo(await find(doc(`${SITE()}<main><button id="d">Delete account</button></main>`), "delete account button"), "#d");
    await resolvesTo(await find(doc(`${SITE()}<main><button id="l">Leave team</button></main>`), "leave team button"), "#l");
  });
});

describe("F5: the logo special needs real logo evidence", () => {
  test("an unlinked logo beside a Sign in link is null, not the Sign in link", async () => {
    expect(await find(doc(`<header><div class="logo"><img src="data:," alt="Acme" width="80" height="24"></div><a href="/signin">Sign in</a></header><main><h1>Hi</h1></main>`), "logo")).toBeNull();
  });
  test("an attribute-less header link with an image child is a logo; a text link to the root with the brand is too", async () => {
    await resolvesTo(await find(doc(`<header><a href="/" id="h"><img src="data:," alt="Acme" width="80" height="24"></a><a href="/signin">Sign in</a></header>`), "logo"), "#h");
    await resolvesTo(await find(doc(`<header><a href="/" id="b">Acme</a><a href="/signin">Sign in</a></header>`), "Acme logo"), "#b");
    // the header's text link to the site root is the brand link (the corpus labels it so); a link elsewhere is not
    await resolvesTo(await find(doc(`<header><a href="/" id="b">Acme</a><a href="/signin">Sign in</a></header>`), "logo"), "#b");
    expect(await find(doc(`<header><a href="/signin">Sign in</a></header><main><a href="/">Acme</a></main>`), "logo")).toBeNull();
  });
});

describe("F2: 'X button' prefers a link named exactly X over a button that merely contains X", () => {
  const cases: Array<[string, string, string, string]> = [
    ["cart button", `<a href="/cart" id="t">Cart (2)</a>`, `<button>Add to cart</button>`, "#t"],
    ["sign up button", `<a href="/signup" id="t">Sign up</a>`, `<form><button type="submit">Sign up for our newsletter</button></form>`, "#t"],
    ["settings button", `<a href="/settings" id="t" aria-label="Settings"><svg width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="8"/></svg></a>`, `<button>Reset all settings</button>`, "#t"],
    ["browsing history button", `<a href="/history" id="t">Browsing history</a>`, `<button>Clear browsing history</button>`, "#t"],
    ["log in button", `<a href="/login" id="t">Log in</a>`, `<button>Log in with SSO</button>`, "#t"],
    ["pricing button", `<a href="/pricing" id="t">Pricing</a>`, `<button>Compare pricing plans</button>`, "#t"],
    ["download button", `<a href="/download" id="t">Download</a>`, `<button>Download invoice PDF</button>`, "#t"],
  ];
  for (const [intent, link, button, expected] of cases) {
    test(`'${intent}'`, async () => {
      const r = await find(doc(`${SITE(link)}<main><h1>Page</h1>${button}</main>`), intent);
      await resolvesTo(r, expected);
      // "Cart (2)" is the exact name with a badge count (exact-badge); the rest are exact links
      expect(["exact-link", "exact-badge"]).toContain(r!.matchedBy);
    });
  }
  test("a real button that is X plus one word still wins: 'features button' -> Features tour, not the nav link", async () => {
    const r = await find(doc(`<nav><a data-slot="navigation-menu-link" href="/x">Features</a></nav><main><button type="button" id="real">Features tour</button></main>`), "features button");
    await resolvesTo(r, "#real");
  });
  test("'search button' with an icon submit prefers the search form's submit over 'Clear search'", async () => {
    const r = await find(doc(`${SITE()}<main><form role="search" action="/s"><input name="q" type="search" aria-label="Search products">
      <button type="submit" id="go"><svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6"/></svg></button></form><button type="button">Clear search</button></main>`), "search button");
    await resolvesTo(r, "#go");
  });
});

describe("F6: synonyms that cross actions no longer match", () => {
  test("unsubscribe / sign up / send / forward / exit", async () => {
    expect(await find(doc(`${SITE()}<main><button>Cancel subscription</button></main>`), "unsubscribe button")).toBeNull();
    expect(await find(doc(`${SITE()}<main><button>Join meeting</button></main>`), "sign up button")).toBeNull();
    expect(await find(doc(`${SITE()}<main><aside><button>Apply</button></aside></main>`), "send button")).toBeNull();
    expect(await find(doc(`${SITE()}<main><button>Reply</button> <button>Next</button></main>`), "forward button")).toBeNull();
  });
  test("'exit' is a weak synonym of Close: a labelled guess at 0.65, and never over an Exit control", async () => {
    const r = await find(doc(`${SITE()}<main><button id="c">Close</button></main>`), "exit button");
    await resolvesTo(r, "#c");
    expect(r!.matchedBy).toBe("exact-synonym-weak");
    expect(r!.confidence).toBeLessThan(0.7);
    await resolvesTo(await find(doc(`${SITE()}<main><button>Close</button><button id="x">Exit fullscreen</button></main>`), "exit button"), "#x");
  });
  test("same-action synonyms still match: 'log in' -> Sign in, 'remove' -> Delete", async () => {
    await resolvesTo(await find(doc(`<main><button id="s">Sign in</button></main>`), "log in button"), "#s");
    await resolvesTo(await find(doc(`<main><button id="d">Delete</button></main>`), "remove button"), "#d");
  });
});

describe("F7: transparent, aria-hidden, inert, and behind-a-modal elements are not person-visible", () => {
  test("a background Save behind an open aria-modal dialog is null", async () => {
    expect(await find(doc(`${SITE()}<main><button>Save</button></main>
      <div role="dialog" aria-modal="true" style="position:fixed;inset:0;background:#fff;z-index:10"><p>Session expired</p><button>Log in</button></div>`), "save button")).toBeNull();
  });
  test("an opacity:0 Save is null", async () => {
    expect(await find(doc(`${SITE()}<main><button style="opacity:0;width:100px;height:40px">Save</button><button>Cancel</button></main>`), "save button")).toBeNull();
  });
  test("a transparent checkbox-as-button input with a visible label is what the person sees (Wikipedia's Vector menus)", async () => {
    const r = await find(doc(`<header><input type="checkbox" id="mm" role="button" aria-label="Main menu" style="opacity:0;position:absolute;width:32px;height:32px">
      <label for="mm" style="display:inline-block;width:32px;height:32px;border:1px solid #000">=</label></header><main><h1>Topic</h1></main>`), "main menu button");
    await resolvesTo(r, "#mm");
  });
  test("an aria-hidden clone loses to the real Subscribe, unambiguously", async () => {
    const r = await find(doc(`${SITE()}<main><div aria-hidden="true"><button tabindex="-1">Subscribe</button></div><div><button id="real">Subscribe</button></div></main>`), "subscribe button");
    await resolvesTo(r, "#real");
    expect(r!.confidence).toBeGreaterThanOrEqual(0.9);
  });
  test("an inert page's Continue loses to the open dialog's", async () => {
    await resolvesTo(await find(doc(`${SITE()}<main inert><button>Continue</button></main><dialog open><p>Confirm email</p><button id="dc">Continue</button></dialog>`), "continue button"), "#dc");
  });
  test("an off-canvas drawer pushed outside an overflow-x:hidden body is not visible", async () => {
    const r = await find(doc(`<header><button aria-label="Open menu">=</button><nav class="desk"><a href="/about">About</a></nav></header>
      <div class="drawer"><nav><a href="/about">About</a></nav></div><main><h1>Home</h1></main>`,
      `<style>body{overflow-x:hidden;margin:0} .drawer{position:absolute;top:0;left:100%;width:280px} .desk{display:none}</style>`), "about link", { width: 393 });
    expect(r).toBeNull();
  });
});

describe("F10: the cheapest product reads the price a person would pay", () => {
  test("a struck-through list price is ignored", async () => {
    const r = await find(doc(`<main><div class="product" id="a"><h2>Basic</h2><span class="price"><s>$10.00</s> $8.00</span><button>Choose Basic</button></div>
      <div class="product" id="b"><h2>Standard</h2><span class="price">$9.00</span><button>Choose Standard</button></div></main>`), "cheapest product");
    await resolvesTo(r, "#a");
  });
  test("a line-through styled list price is ignored too", async () => {
    const r = await find(doc(`<main><div class="product" id="a"><h2>Basic</h2><span class="price"><span style="text-decoration:line-through">$10.00</span> $8.00</span><button>Choose Basic</button></div>
      <div class="product" id="b"><h2>Standard</h2><span class="price">$9.00</span><button>Choose Standard</button></div></main>`), "most expensive product");
    await resolvesTo(r, "#b");
  });
});

// ---------------------------------------------------------------------------
// D2 round 3 (Forge re-audit): the shapes next to the round-2 fixes, and the BUG-01 class that survived them.
// ---------------------------------------------------------------------------
const TALL = `<div style="height:1400px" aria-hidden="true"></div>`;

describe("R3-1: body and html never clip vertically; only overflow hidden/clip clips", () => {
  const CLIP = `<style>html,body{height:100%;margin:0}body{overflow-x:hidden}</style>`;
  test("a Subscribe below the fold under html,body{height:100%} + overflow-x:hidden is visible", async () => {
    await resolvesTo(await find(doc(`${SITE()}<main><h1>Blog</h1>${TALL}<form><label for="nl">Email</label><input id="nl" type="email"><button type="submit" id="sub">Subscribe</button></form></main>`, CLIP), "subscribe button"), "#sub");
  });
  test("a header Sign up link-button and a form Sign up below the fold: the form's real button, never the header alone", async () => {
    const r = await find(doc(`${SITE(`<a href="/signup" class="btn">Sign up</a>`)}<main>${TALL}<form><button type="submit" id="fs">Sign up</button></form></main>`, CLIP), "sign up button");
    await resolvesTo(r, "#fs");
    expect(r!.candidates).toBe(2);
  });
  test("an inner overflow:auto list is scrollable, so Load more at its end is visible", async () => {
    const rows = Array.from({ length: 40 }, (_, i) => `<div>Message ${i}</div>`).join("");
    await resolvesTo(await find(doc(`<div class="shell"><main class="list"><h1>Inbox</h1>${rows}<button type="button" id="more">Load more</button></main></div>`,
      `<style>html,body{margin:0;height:100%}.shell{display:flex;height:100vh}.list{flex:1;overflow-y:auto}</style>`), "load more button"), "#more");
  });
  test("a drawer parked at left:100% behind body overflow-x:hidden is still not on the page", async () => {
    expect(await find(doc(`<header><button aria-label="Open menu">=</button></header><div class="drawer"><nav><a href="/about">About</a></nav></div><main><h1>Home</h1></main>`,
      `<style>body{overflow-x:hidden;margin:0}.drawer{position:absolute;top:0;left:100%;width:280px}</style>`), "about link", { width: 393 })).toBeNull();
  });
});

describe("R3-2: a trailing number is the exact name only as a '(2)' badge or a count in its own element", () => {
  test("Cart (2) is exact-badge below 0.95; Delete 2, Save 20%, Save $5, Pricing 2025 and Call 988 are not exact", async () => {
    const r = await find(doc(`${SITE(`<a href="/cart" id="c">Cart (2)</a>`)}<main><button>Add to cart</button></main>`), "cart button");
    await resolvesTo(r, "#c");
    expect(r!.matchedBy).toBe("exact-badge");
    expect(r!.confidence).toBeLessThan(0.95);
    expect(await find(doc(`<main><table><tr><td>Acme</td></tr></table><button id="b">Delete 2</button></main>`), "delete button")).toBeNull();
    await resolvesTo(await find(doc(`${SITE()}<main><button>Save 20%</button><form><button type="submit" id="s">Save changes</button></form></main>`), "save button"), "#s");
    await resolvesTo(await find(doc(`<main><button>Save $5</button> <a id="save" href="/save">Save</a></main>`), "save button"), "#save");
    expect(await find(doc(`${SITE()}<main><aside><a href="/archive/pricing-2025">Pricing 2025</a></aside></main>`), "pricing link")).toBeNull();
    await resolvesTo(await find(doc(`<div><a class="btn" href="tel:988">Call 988</a></div>${SITE()}<main><a class="btn" id="clinic" href="tel:+13035550100">Call the clinic</a></main>`), "call button"), "#clinic");
  });
  test("a count in its own badge element keeps the exact name: Star <span>1.2k</span>", async () => {
    const r = await find(doc(`${SITE()}<main><button>Watch <span class="Counter">12</span></button><button id="star">Star <span class="Counter">1.2k</span></button></main>`), "star button");
    await resolvesTo(r, "#star");
    expect(r!.matchedBy).toBe("exact-badge");
  });
});

describe("R3-3: a hidden exact match means null, unless it is a folded navigation's copy", () => {
  test("display:none Save with a visible Save draft is null", async () => {
    expect(await find(doc(`<main><button style="display:none">Save</button><button>Save draft</button></main>`), "save button")).toBeNull();
  });
  test("opacity-0-until-hover row Remove with a toolbar Remove all is null", async () => {
    expect(await find(doc(`<main><div class="row">Sam <button class="act">Remove</button></div><div class="toolbar"><button>Remove all</button></div></main>`,
      `<style>.row .act{opacity:0}.row:hover .act{opacity:1}</style>`), "remove button")).toBeNull();
  });
  test("a header nav Docs folded at 393 lets the footer Documentation link through, capped at 0.7", async () => {
    const r = await find(doc(`<header><nav class="desk"><a href="/docs">Docs</a><a href="/pricing">Pricing</a></nav></header><main><h1>Acme</h1></main>
      <footer><nav><a href="/docs" id="fd">Documentation</a><a href="/terms">Terms</a></nav></footer>`,
      `<style>@media (max-width:600px){.desk{display:none}}</style>`), "docs link", { width: 393 });
    await resolvesTo(r, "#fd");
    expect(r!.confidence).toBeLessThanOrEqual(0.7);
    // the same page at 393 with no visible equivalent is null
    expect(await find(doc(`<header><nav class="desk"><a href="/docs">Docs</a></nav></header><main><h1>Acme</h1></main>`, `<style>@media (max-width:600px){.desk{display:none}}</style>`), "docs link", { width: 393 })).toBeNull();
  });
});

describe("R3-6b: quantifiers are the phrase's object; prices, mid-name counts and badge counts are not", () => {
  test("'unsubscribe button' -> Unsubscribe from all emails; 'pay button' -> Pay $12.00", async () => {
    await resolvesTo(await find(doc(`<main><h1>Email</h1><button id="u">Unsubscribe from all emails</button></main>`), "unsubscribe button"), "#u");
    await resolvesTo(await find(doc(`<main><h1>Balance</h1><button id="p">Pay $12.00</button></main>`), "pay button"), "#p");
  });
  test("'Browse all tools' -> Browse all tools (120+) by its badge; 'Try Free' -> Try Free - 5 Tests", async () => {
    const r = await find(doc(`${SITE()}<main><a href="/tools" id="all">Browse all tools (120+)</a></main><footer><a href="/tools" data-testid="footer-all-tools">All tools</a></footer>`), "Browse all tools");
    await resolvesTo(r, "#all");
    expect(r!.matchedBy).toBe("exact-badge");
    await resolvesTo(await find(doc(`<main><a href="/try" id="t">Try Free — 5 Tests</a><a href="/pro">Go Pro</a></main>`), "Try Free"), "#t");
  });
});

describe("R3-4: only an opaque, on-screen modal blocks, and only what it covers", () => {
  const BANNER = `<div role="dialog" aria-modal="true" aria-label="Cookie consent" style="position:fixed;left:0;right:0;bottom:0;background:#fff;padding:8px">We use cookies. <button type="button">Cookie settings</button> <button type="button">Allow all</button></div>`;
  test("a bottom cookie banner with aria-modal does not hide the page", async () => {
    await resolvesTo(await find(doc(`${SITE(`<a href="/settings" id="st">Settings</a>`)}<main><h1>Dashboard</h1><button id="np">New project</button></main>${BANNER}`), "settings button"), "#st");
    await resolvesTo(await find(doc(`${SITE()}<main><h1>Dashboard</h1><button id="np">New project</button></main>${BANNER}`), "new project button"), "#np");
  });
  test("a closed off-canvas drawer and an opacity-0 closed modal do not block", async () => {
    await resolvesTo(await find(doc(`${SITE()}<div role="dialog" aria-modal="true" style="position:fixed;top:0;left:0;width:300px;height:100vh;background:#fff;transform:translateX(-100%)"><a href="/">Home</a></div><main><a href="/start" class="btn" id="go">Get started</a></main>`), "get started button"), "#go");
    await resolvesTo(await find(doc(`${SITE()}<main><a href="/start" class="btn" id="go">Get started</a></main><div role="dialog" aria-modal="true" style="position:fixed;inset:0;opacity:0;pointer-events:none;background:#fff"><button>Subscribe</button></div>`), "get started button"), "#go");
  });
  test("a full-screen modal still blocks the page behind it; a stacked closed drawer does not hide the open dialog", async () => {
    expect(await find(doc(`<main><button>Save</button></main><div role="dialog" aria-modal="true" style="position:fixed;inset:0;background:#fff"><p>Expired</p><button>Log in</button></div>`), "save button")).toBeNull();
    await resolvesTo(await find(doc(`${SITE()}<div role="dialog" aria-modal="true" style="position:fixed;top:20%;left:20%;width:60%;background:#fff"><button id="ok">Confirm</button></div>
      <div role="dialog" aria-modal="true" style="position:fixed;top:0;right:0;width:300px;height:100vh;background:#fff;transform:translateX(100%)"><a href="/">Home</a></div>`), "confirm button"), "#ok");
  });
});

describe("R3-5: an exact link named X beats every fuzzy or synonym button; X+1 wins only without one", () => {
  const cases: Array<[string, string, string]> = [
    ["cart button", `<a href="/cart" id="t">Cart</a>`, `<button>Empty cart</button>`],
    ["settings button", `<a href="/settings" id="t">Settings</a>`, `<button aria-label="Options">&#8942;</button>`],
    ["settings button", `<a href="/settings" id="t" aria-label="Settings"><svg width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="7"/></svg></a>`, `<button class="ot-sdk-show-settings">Cookie settings</button>`],
    ["profile button", `<a href="/u/me" id="t" aria-label="Profile"><img src="data:," alt="" width="24" height="24"></a>`, `<button>Edit profile</button>`],
    ["notifications button", `<a href="/notifications" id="t">Notifications</a>`, `<button>Mute notifications</button>`],
    ["next button", `<a href="?p=3" id="t">Next</a>`, `<button>Next month</button>`],
    ["download button", `<a href="/dl/acme.dmg" id="t">Download</a>`, `<button>Get the app</button>`],
  ];
  for (const [intent, link, button] of cases) {
    test(`'${intent}' -> the link, not '${button.replace(/<[^>]+>/g, "").trim() || "the icon button"}'`, async () => {
      const r = await find(doc(`${SITE(link)}<main><h1>Page</h1>${button}</main>`), intent);
      await resolvesTo(r, "#t");
      expect(r!.matchedBy).toBe("exact-link");
    });
  }
  test("'features button' with no exact link still takes the X+1 button", async () => {
    await resolvesTo(await find(doc(`<nav><a href="/x">Products</a></nav><main><button id="real">Features tour</button></main>`), "features button"), "#real");
  });
});

describe("R3-6: bulk quantifiers and the wider verb list", () => {
  test("a name with all/everything/a count after the phrase needs it in the intent", async () => {
    const r = await find(doc(`${SITE()}<main><div class="toolbar"><button>Delete all</button></div><table><tr><td><a href="#" id="d1">Delete</a></td></tr><tr><td><a href="#">Delete</a></td></tr></table></main>`), "delete button");
    await resolvesTo(r, "#d1");
    expect(r!.confidence).toBeLessThan(0.7);
    expect(await find(doc(`<main><button>Approve 12</button></main>`), "approve button")).toBeNull();
    await resolvesTo(await find(doc(`<main><button id="a">Approve all requests</button></main>`), "approve all button"), "#a");
    await resolvesTo(await find(doc(`<main><button id="o" aria-label="Approve order 10002">Approve</button></main>`), "approve order button"), "#o");
  });
  test("end / empty / wipe / archive / transfer / upgrade / place / confirm / send / approve are danger verbs", async () => {
    for (const [intent, name] of [["subscription button", "End subscription"], ["meeting button", "End meeting"], ["device button", "Wipe device"],
      ["repository button", "Archive repository"], ["money button", "Transfer money"], ["cart button", "Empty cart"]]) {
      expect(await find(doc(`<main><h1>Page</h1><button>${name}</button></main>`), intent), `${intent} -> ${name}`).toBeNull();
    }
    await resolvesTo(await find(doc(`${SITE(`<a href="/plan" id="p">Plan</a>`)}<main><button>Upgrade plan</button></main>`), "plan button"), "#p");
    await resolvesTo(await find(doc(`<main><form role="search"><input type="search" aria-label="Search"><button id="c">Clear search</button></form></main>`), "clear search button"), "#c");
  });
});

describe("R3-7: ordinals stop at the first rung with visible matches, and price intents honour them", () => {
  test("'third approve button' with two Approve request buttons is null, not Approve all requests", async () => {
    expect(await find(doc(`<main><button>Approve request</button><button>Approve request</button><div class="toolbar"><button>Approve all requests</button></div></main>`), "third approve button")).toBeNull();
    expect(await find(doc(`<main><button>Delete file</button><button>Delete file</button><button>Delete all files</button></main>`), "third delete button")).toBeNull();
  });
  test("'second cheapest product' and 'third most expensive product'", async () => {
    const PLANS = doc(`<main><section class="card" id="free"><h2>Free</h2><p class="price">$0.00</p></section><section class="card" id="starter"><h2>Starter</h2><p class="price">$9.00</p></section><section class="card" id="team"><h2>Team</h2><p class="price">$29.00</p></section></main>`);
    await resolvesTo(await find(PLANS, "second cheapest product"), "#starter");
    await resolvesTo(await find(PLANS, "third most expensive product"), "#free");
    expect(await find(PLANS, "fourth cheapest product")).toBeNull();
  });
});

describe("R3-8: logo evidence excludes icon-plus-text controls and a bare Home nav item", () => {
  test("an unlinked logo beside '<svg/> Account' is null; so is a Home nav link alone", async () => {
    const svg = `<svg width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="7"/></svg>`;
    expect(await find(doc(`<header><div class="logo"><img src="data:," alt="Acme" width="80" height="24"></div><a href="/account">${svg} Account</a> <a href="/cart">${svg} Cart</a></header>`), "logo")).toBeNull();
    expect(await find(doc(`<header><nav><a id="home" href="/">Home</a> <a href="/pricing">Pricing</a></nav></header><main><h1>Pricing</h1></main>`), "logo")).toBeNull();
  });
  test("an absolute wordmark href is a site-root link; an icon-only link to the root is a logo", async () => {
    await resolvesTo(await find(doc(`<header><a href="https://acme.example/" class="wordmark" id="w">Acme</a><nav><a href="/">Home</a></nav></header>`), "logo"), "#w");
    await resolvesTo(await find(doc(`<header><a href="/" id="l"><svg width="32" height="30" aria-hidden="true"><path d="M0 0h32v30H0z"/></svg></a><a href="/signin">Sign in</a></header>`), "logo"), "#l");
  });
});

describe("R3-9: open shadow roots count for uniqueness, text collisions and selectors", () => {
  test("a light #email beside a shadow #email gets a selector Playwright resolves to the light one", async () => {
    const r = await find(doc(`<div id="host"></div><script>document.getElementById('host').attachShadow({mode:"open"}).innerHTML='<input id="email" aria-label="Wrong shadow email">';</script><main><input id="email" type="email"></main>`), "email field");
    await resolvesTo(r, "main input");
    expect(r!.selector).not.toBe("#email");
  });
  test("text that lives only inside a shadow root still collides", async () => {
    const r = await find(doc(`<code-sample id="cs"></code-sample><script>const t=['#','sub','mit'].join('');document.getElementById('cs').attachShadow({mode:"open"}).innerHTML='<pre>'+t+' button</pre>';</script>
      <main><form onsubmit="return false"><label for="cc">Card</label><input id="cc"><button id="submit" type="button">Pay</button></form></main>`), "pay button");
    await resolvesTo(r, "#submit");
    expect(r!.selector).not.toBe("#submit");
    await clickSafe(r!.selector);
  });
  test("a candidate inside a shadow root gets a host-anchored selector", async () => {
    const r = await find(doc(`<site-header id="sh"></site-header><script>document.getElementById('sh').attachShadow({mode:'open'}).innerHTML='<header><a href="/">Acme</a> <button type="button">Sign in</button></header>';</script><main><button>Sign in with Google</button></main>`), "sign in button");
    expect(r).not.toBeNull();
    expect(r!.selector.startsWith("#sh ")).toBe(true);
    expect(await page.locator(r!.selector).count()).toBe(1);
    expect(await page.locator(r!.selector).evaluate(e => e.textContent)).toBe("Sign in");
  });
  test("'close button' prefers the open dialog's Close over a web component's", async () => {
    const r = await find(doc(`<site-banner id="sb"></site-banner><script>document.getElementById('sb').attachShadow({mode:'open'}).innerHTML='<div><span>Sale</span><button aria-label="Close" type="button">x</button></div>';</script>
      <main><div role="dialog" aria-label="Offer"><p>10% off</p><button type="button" aria-label="Close" id="dc">x</button></div></main>`), "close button");
    await resolvesTo(r, "#dc");
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
