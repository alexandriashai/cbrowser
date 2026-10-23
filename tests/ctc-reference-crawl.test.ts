/**
 * The v2 reference crawl's rules, as code (research/ctc-reference/robots.ts and
 * discover.ts). The crawl is run by hand, so these are the only checks its
 * politeness and safety rules get before it touches other people's sites.
 *
 *   1. robots.txt is read as RFC 9309 reads it: the named group over `*`,
 *      longest match, allow on a tie, wildcards and the end anchor, an empty
 *      disallow allowing everything; a missing file allows, an unreachable one
 *      disallows.
 *   2. Inner-page discovery only follows what a first visitor could: on-site
 *      http(s) links, never one that names a side effect, never a form but a
 *      search, and that only as the GET its own form sends.
 *   3. The frame filters exclude what they name and not the innocent
 *      substrings around it.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { parseRobots, robotsAllows, type Robots } from "../research/ctc-reference/robots.js";
import {
  discoverInner, searchUrl, domainExclusion, contentFlags, contentExclusion, DENY,
  type AnchorInfo, type FormInfo,
} from "../research/ctc-reference/discover.js";

const robots = (body: string, agent = "cbrowser"): Robots => ({ status: "parsed", detail: "HTTP 200", ...parseRobots(body, agent) });

describe("robots.txt", () => {
  test("longest match wins, allow wins a tie, wildcards and the end anchor apply", () => {
    const r = robots(`User-agent: *\nDisallow: /private\nAllow: /private/public\nDisallow: /*.pdf$\nAllow: /tie\nDisallow: /tie\nDisallow: /search?*q=`);
    expect(robotsAllows(r, "https://x.test/private/a")).toBe(false);
    expect(robotsAllows(r, "https://x.test/private/public/a")).toBe(true);
    expect(robotsAllows(r, "https://x.test/doc.pdf")).toBe(false);
    expect(robotsAllows(r, "https://x.test/doc.pdf?x=1")).toBe(true);
    expect(robotsAllows(r, "https://x.test/tie")).toBe(true);
    expect(robotsAllows(r, "https://x.test/search?lang=en&q=help")).toBe(false);
    expect(robotsAllows(r, "https://x.test/search")).toBe(true);
    expect(robotsAllows(r, "https://x.test/")).toBe(true);
  });

  test("a group naming the crawler replaces the * group; groups for one agent merge", () => {
    const body = `User-agent: *\nDisallow: /\n\nUser-agent: cbrowser\nDisallow: /admin\n\nUser-agent: CBrowser\nDisallow: /tmp\nCrawl-delay: 7`;
    const r = robots(body);
    expect(robotsAllows(r, "https://x.test/page")).toBe(true);
    expect(robotsAllows(r, "https://x.test/admin/x")).toBe(false);
    expect(robotsAllows(r, "https://x.test/tmp/x")).toBe(false);
    expect(r.crawlDelay).toBe(7);
    // Any other crawler falls to *.
    expect(robotsAllows(robots(body, "otherbot"), "https://x.test/page")).toBe(false);
    // A prefix of the token is not the token.
    expect(robotsAllows(robots(`User-agent: cb\nDisallow: /\n`), "https://x.test/page")).toBe(true);
  });

  test("an empty disallow allows everything; several user-agent lines share one group", () => {
    expect(robotsAllows(robots(`User-agent: *\nDisallow:\n`), "https://x.test/a")).toBe(true);
    const r = robots(`User-agent: a\nUser-agent: *\nDisallow: /x\n`);
    expect(robotsAllows(r, "https://x.test/x/1")).toBe(false);
  });

  test("a missing robots.txt allows; an unreachable one disallows; robots.txt itself is always allowed", () => {
    expect(robotsAllows({ status: "absent", detail: "HTTP 404", rules: [] }, "https://x.test/a")).toBe(true);
    expect(robotsAllows({ status: "unreachable", detail: "HTTP 503", rules: [] }, "https://x.test/a")).toBe(false);
    expect(robotsAllows(robots(`User-agent: *\nDisallow: /\n`), "https://x.test/robots.txt")).toBe(true);
  });
});

const a = (href: string, text: string, region: AnchorInfo["region"] = "nav", visible = true): AnchorInfo => ({ href, text, region, visible });
const field = (o: Partial<FormInfo["fields"][number]>): FormInfo["fields"][number] => ({ tag: "input", type: "text", name: null, value: "", placeholder: null, label: null, checked: false, ...o });

describe("inner-page discovery", () => {
  const landing = "https://www.shop.test/";

  test("sign-up before login before contact; help, cart and an article from content", () => {
    const anchors = [
      a("/contact", "Contact us"), a("/login", "Log in"), a("/register", "Sign up"),
      a("/help", "Help"), a("/cart", "Cart"), a("/about", "About"),
      a("/blog/how-we-measure-things", "How we measure things", "main"),
    ];
    const d = discoverInner(landing, anchors, []);
    expect(d.form?.url).toBe("https://www.shop.test/register");
    expect(d.help?.url).toBe("https://www.shop.test/help");
    expect(d.cart?.url).toBe("https://www.shop.test/cart");
    expect(d.article?.url).toBe("https://www.shop.test/blog/how-we-measure-things");
    expect(d.search).toBeUndefined();
    // Without a sign-up link the form type falls to login, then to contact.
    expect(discoverInner(landing, anchors.filter((x) => x.text !== "Sign up"), []).form?.url).toBe("https://www.shop.test/login");
  });

  test("never follows a link that names a side effect, leaves the site, or downloads a file", () => {
    const anchors = [
      a("/logout", "Sign up"), a("/account/delete", "Help"), a("/cart/add?id=3", "Add to cart"),
      a("https://other.test/register", "Sign up"), a("javascript:void(0)", "Log in"), a("/manual.pdf", "Help"),
      a("/subscribe", "Join now"), a("/cart", "Cart"),
    ];
    const d = discoverInner(landing, anchors, []);
    expect(d.form).toBeUndefined();
    expect(d.help).toBeUndefined();
    expect(d.cart?.url).toBe("https://www.shop.test/cart");
    for (const t of ["Sign out", "Delete account", "Buy now", "Unsubscribe", "Donate", "Pay now", "Confirm order"]) expect(DENY.test(t)).toBe(true);
    for (const t of ["Sign up", "Log in", "Help center", "Contact us", "Cart"]) expect(DENY.test(t)).toBe(false);
  });

  test("subdomains of the site count as the site", () => {
    const d = discoverInner(landing, [a("https://accounts.shop.test/signin", "Sign in"), a("https://help.shop.test/", "Support")], []);
    expect(d.form?.url).toBe("https://accounts.shop.test/signin");
    expect(d.help?.url).toBe("https://help.shop.test/");
  });

  test("a search is the GET its own form would send, query \"help\", hidden fields kept, buttons and unchecked boxes not", () => {
    const form: FormInfo = {
      action: "https://www.shop.test/search?stale=1", method: "get", inSearch: false, role: null,
      fields: [
        field({ name: "q", type: "search" }),
        field({ name: "lang", type: "hidden", value: "en" }),
        field({ name: "go", type: "submit", value: "Search" }),
        field({ tag: "button", name: "b", type: "", value: "x" }),
        field({ name: "exact", type: "checkbox", value: "1", checked: false }),
      ],
    };
    const d = searchUrl([form], new URL(landing));
    expect(d?.url).toBe("https://www.shop.test/search?q=help&lang=en");
    // A POST form is never used, nor one that leaves the site, nor one with no search field.
    expect(searchUrl([{ ...form, method: "post" }], new URL(landing))).toBeNull();
    expect(searchUrl([{ ...form, action: "https://other.test/search" }], new URL(landing))).toBeNull();
    expect(searchUrl([{ ...form, fields: [field({ name: "email", type: "email" })] }], new URL(landing))).toBeNull();
    // A text field counts when its name, placeholder, label or a role=search ancestor says search.
    expect(searchUrl([{ ...form, fields: [field({ name: "s" })] }], new URL(landing))?.url).toBe("https://www.shop.test/search?s=help");
    expect(searchUrl([{ ...form, fields: [field({ name: "term1", placeholder: "Search products" })] }], new URL(landing))?.url).toBe("https://www.shop.test/search?term1=help");
    expect(searchUrl([{ ...form, inSearch: true, fields: [field({ name: "zz" })] }], new URL(landing))?.url).toBe("https://www.shop.test/search?zz=help");
  });
});

describe("frame filters", () => {
  test("domain names: adult and gambling terms exclude, innocent neighbours do not", () => {
    expect(domainExclusion("bestcasino.fun")).toMatch(/^gambling/);
    expect(domainExclusion("myhentaicomics.com")).toMatch(/^adult/);
    for (const d of ["sussexuniversity.ac.uk", "essex.gov.uk", "alphabet.com", "better.com", "timeout.com"]) expect(domainExclusion(d)).toBeNull();
  });

  test("page content: two terms of one kind exclude, one does not; a parked page is named once", () => {
    expect(contentExclusion(contentFlags("live casino and sportsbook odds"))).toMatch(/^gambling/);
    expect(contentExclusion(contentFlags("news: the casino closed"))).toBeNull();
    expect(contentExclusion(contentFlags("this domain is for sale"))).toMatch(/^parked/);
    expect(contentExclusion(contentFlags("hotels in sedona, arizona"))).toBeNull();
  });
});
