/**
 * Inner-page discovery and site filters for the CTC reference crawl (crawl-v2.ts).
 *
 * The crawl measures a site's landing page and up to five inner pages of named
 * types, found from the landing page's own links and forms. Everything here is
 * a pure function of what the landing page exposed, so the choice is
 * reproducible from the recorded anchors and testable without a browser.
 *
 * WHAT IS NEVER DONE. No form is submitted except a search, and that only as
 * the GET request its own form would send, with the neutral query "help". No
 * login, no click, nothing that creates, buys, deletes, subscribes or sends:
 * a link whose text or address names such an action is never followed
 * (DENY), whatever type it would otherwise match. A cart or checkout page is
 * loaded as linked, so it is the empty cart a first visitor sees.
 *
 * HEURISTICS (first match wins, in this order of preference):
 *   form     a sign-up link, else a login link, else a contact link: by link
 *            text or path (FORM_SIGNUP, FORM_LOGIN, FORM_CONTACT)
 *   search   a GET form with a search field (type=search, a search-like name,
 *            or a placeholder, label or role=search saying so; or the one
 *            named text field of a form that names itself a search form by
 *            id, class, label or action path), filled with "help"; the URL is
 *            the one the browser would submit. Failing a form, the site's own
 *            published search URL template (schema.org WebSite SearchAction,
 *            JSON-LD), filled with "help": still a GET of the site's search
 *   article  a content link with a slug under a content section (/blog/x,
 *            /news/x, /2026/10/x ...) or a long hyphenated slug, preferring
 *            links in main content over navigation and footer
 *   help     a help, support or FAQ link (a contact link when the form type
 *            did not take it)
 *   cart     a cart, basket, bag or checkout link
 * Visible links are preferred to hidden ones, then document order. A link
 * must stay on the site (same host, or a subdomain of the landing page's
 * domain), be http(s), not a file download, and not the landing page itself.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

export type InnerType = "form" | "search" | "article" | "help" | "cart";
export const INNER_TYPES: InnerType[] = ["form", "search", "article", "help", "cart"];

export interface AnchorInfo { href: string; text: string; region: "nav" | "footer" | "main" | "body"; visible: boolean }
export interface FieldInfo {
  tag: string; type: string; name: string | null; value: string;
  placeholder: string | null; label: string | null; checked: boolean;
}
export interface FormInfo {
  action: string; method: string; inSearch: boolean; role: string | null; fields: FieldInfo[];
  /** The form's own id, class and aria-label, when it has them. */
  id?: string | null; className?: string | null; label?: string | null;
}
/** A schema.org SearchAction the page publishes: its target URL template and its query-input. */
export interface SearchTemplate { url: string; input: string }
export interface Discovered { url: string; how: string }

/** Never followed: the link names an action with a side effect, or leaves the page for an account action. */
export const DENY = /log ?out|sign ?out|delete|remove|unsubscribe|subscribe|cancel|deactivate|add[-_ ]?to[-_ ]?(cart|bag|basket)|buy|purchase|donat|payment|pay[-_ ]?now|order[-_ ]?now|checkout\/(pay|confirm|place)|confirm|verify|reset/i;
const FILE = /\.(pdf|zip|gz|rar|7z|docx?|xlsx?|pptx?|csv|mp4|mov|mp3|wav|jpe?g|png|gif|webp|svg|exe|dmg|msi|apk|ics)(\?|#|$)/i;

export const FORM_SIGNUP = { text: /\b(sign ?up|register|create (an |your )?account|join (now|free|us|today)|get started|start (your )?free trial)\b/i, path: /\/(sign-?up|register|registration|join|create-account|get-started)(\/|\?|$)/i };
export const FORM_LOGIN = { text: /\b(log ?in|sign ?in|my account|account login)\b/i, path: /\/(log-?in|sign-?in|account\/login|auth\/login)(\/|\?|$)/i };
export const FORM_CONTACT = { text: /\bcontact( us)?\b/i, path: /\/contact(-us)?(\/|\?|\.html?|$)/i };
export const HELP = { text: /\b(help|support|faqs?|customer (service|care)|help cent(er|re))\b/i, path: /\/(help|support|faqs?|customer-?service|help-?cent(er|re))(\/|\?|\.html?|$)/i };
export const CART = { text: /^(cart|basket|bag|shopping (cart|bag|basket)|view (cart|bag|basket))\b/i, path: /\/(cart|basket|bag|checkout|shopping-?cart)(\/|\?|\.html?|$)/i };
const CONTENT_SECTION = /\/(blog|news|articles?|stor(y|ies)|posts?|press|insights|learn|guides?|resources|magazine|features)\/[^/?#]{3,}/i;
const DATED = /\/20\d\d\/\d{1,2}\//;
const SEARCH_NAME = /^(q|query|search|s|k|kw|keys|keywords?|terms?|text|searchterm|search_?query|searchtext|searchword|searchstring|search_api_fulltext|w|qs|query_?string|search_?term)$/i;
/** A form that names itself a search form: by id, class, aria-label or the path it submits to. */
const SEARCH_FORM = /search/i;
const TEXT_LIKE = (x: FieldInfo) => x.tag === "input" && (x.type === "" || x.type === "text" || x.type === "search");

/** The registrable part we treat as "the site": the host without a leading www. */
export function siteDomain(host: string): string {
  return host.replace(/^www\./i, "").toLowerCase();
}

function onSite(u: URL, domain: string): boolean {
  const h = u.hostname.toLowerCase();
  return h === domain || h.endsWith(`.${domain}`);
}

function normalised(u: URL): string {
  return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "") || "/"}${u.search}`;
}

/** A link the crawl may follow from `landing`, as a URL, or null with nothing said. */
function followable(href: string, text: string, landing: URL): URL | null {
  let u: URL;
  try { u = new URL(href, landing); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!onSite(u, siteDomain(landing.hostname))) return null;
  if (FILE.test(u.pathname)) return null;
  if (DENY.test(`${u.pathname}${u.search}`) || DENY.test(text)) return null;
  u.hash = "";
  if (normalised(u) === normalised(landing)) return null;
  return u;
}

/** Order candidates: visible first, then by region preference, then document order. */
function ranked(anchors: AnchorInfo[], regionOrder: AnchorInfo["region"][]): AnchorInfo[] {
  return anchors
    .map((a, i) => ({ a, i }))
    .sort((x, y) =>
      Number(y.a.visible) - Number(x.a.visible) ||
      regionOrder.indexOf(x.a.region) - regionOrder.indexOf(y.a.region) ||
      x.i - y.i)
    .map((x) => x.a);
}

function firstMatch(
  anchors: AnchorInfo[], landing: URL, pat: { text: RegExp; path: RegExp }, label: string,
  regionOrder: AnchorInfo["region"][], taken: Set<string>,
): Discovered | null {
  for (const a of ranked(anchors, regionOrder)) {
    const byText = pat.text.test(a.text);
    let u: URL | null = null;
    try { u = new URL(a.href, landing); } catch { continue; }
    const byPath = pat.path.test(u.pathname);
    if (!byText && !byPath) continue;
    const f = followable(a.href, a.text, landing);
    if (!f || taken.has(normalised(f))) continue;
    return { url: f.toString(), how: `${label} link ${byText ? `text "${a.text.slice(0, 40)}"` : `path ${f.pathname}`}${a.visible ? "" : " (hidden)"}` };
  }
  return null;
}

/** The GET URL a search form would submit with the query "help", or null if no form qualifies. */
export function searchUrl(forms: FormInfo[], landing: URL): Discovered | null {
  for (const f of forms) {
    if (f.method !== "get") continue;
    let action: URL;
    try { action = new URL(f.action || landing.toString(), landing); } catch { continue; }
    const looksSearch = (x: FieldInfo) =>
      (x.tag === "input" && x.type === "search") ||
      (TEXT_LIKE(x) &&
        ((x.name !== null && SEARCH_NAME.test(x.name)) || /search/i.test(x.placeholder ?? "") || /search/i.test(x.label ?? "") ||
          ((f.inSearch || f.role === "search") && x.name !== null)));
    // A form that calls itself a search form (Drupal's search-block-form
    // submitting to /search/node with a field named "keys", for one) has its
    // search box as its only named text field.
    const namedText = f.fields.filter((x) => TEXT_LIKE(x) && x.name);
    const selfNamed = [f.id, f.className, f.label, action.pathname].some((v) => SEARCH_FORM.test(v ?? ""));
    const field = f.fields.find((x) => looksSearch(x) && x.name) ?? (selfNamed && namedText.length === 1 ? namedText[0] : undefined);
    if (!field) continue;
    if (action.protocol !== "https:" && action.protocol !== "http:") continue;
    if (!onSite(action, siteDomain(landing.hostname))) continue;
    if (DENY.test(action.pathname)) continue;
    // A GET submission replaces the action's query with the form data set:
    // every named control except buttons, unchecked toggles and files.
    const params = new URLSearchParams();
    for (const x of f.fields) {
      if (!x.name) continue;
      if (x.tag === "button" || ["submit", "button", "image", "reset", "file"].includes(x.type)) continue;
      if ((x.type === "checkbox" || x.type === "radio") && !x.checked) continue;
      params.append(x.name, x === field ? "help" : x.value);
    }
    action.search = params.toString();
    action.hash = "";
    return { url: action.toString(), how: `GET search form, field "${field.name}" = "help"` };
  }
  return null;
}

/**
 * The site's own search URL, from a schema.org SearchAction it publishes
 * (WebSite potentialAction, JSON-LD), with the query "help": the one required
 * placeholder (named by query-input, "required name=search_term_string", or
 * the template's only one) filled, optional ones dropped. Held to the
 * same rules as a link: http(s), on the site, nothing DENY names.
 */
export function searchFromTemplates(templates: SearchTemplate[], landing: URL): Discovered | null {
  for (const t of templates) {
    const declared = t.input.match(/name\s*=\s*([\w.-]+)/)?.[1];
    const required = [...t.url.matchAll(/\{([^}?]+)\}/g)].map((m) => m[1]);
    const name = declared ?? (required.length === 1 ? required[0] : undefined);
    if (!name || required.some((r) => r !== name)) continue;
    // Optional placeholders, OpenSearch's {name?} and a URI template's {?name}, are dropped.
    const filled = t.url.split(`{${name}}`).join("help").replace(/\{\?[^}]*\}|\{[^}]*\?\}/g, "");
    let u: URL;
    try { u = new URL(filled, landing); } catch { continue; }
    if (u.protocol !== "https:" && u.protocol !== "http:") continue;
    if (!onSite(u, siteDomain(landing.hostname))) continue;
    if (DENY.test(`${u.pathname}${u.search}`)) continue;
    u.hash = "";
    return { url: u.toString(), how: `schema.org SearchAction template, {${name}} = "help"` };
  }
  return null;
}

/**
 * Pick at most one URL per inner type from what the landing page exposed.
 * Types are resolved in a fixed order (form, search, help, cart, article), so
 * a link taken by one is not offered to the next.
 */
export function discoverInner(landingUrl: string, anchors: AnchorInfo[], forms: FormInfo[], templates: SearchTemplate[] = []): Partial<Record<InnerType, Discovered>> {
  const landing = new URL(landingUrl);
  const taken = new Set<string>();
  const out: Partial<Record<InnerType, Discovered>> = {};
  const take = (type: InnerType, d: Discovered | null) => {
    if (!d) return;
    out[type] = d;
    taken.add(normalised(new URL(d.url)));
  };
  const chrome: AnchorInfo["region"][] = ["nav", "footer", "main", "body"];
  take("form",
    firstMatch(anchors, landing, FORM_SIGNUP, "sign-up", chrome, taken) ??
    firstMatch(anchors, landing, FORM_LOGIN, "login", chrome, taken) ??
    firstMatch(anchors, landing, FORM_CONTACT, "contact", chrome, taken));
  take("search", searchUrl(forms, landing) ?? searchFromTemplates(templates, landing));
  take("help",
    firstMatch(anchors, landing, HELP, "help", chrome, taken) ??
    firstMatch(anchors, landing, FORM_CONTACT, "contact", chrome, taken));
  take("cart", firstMatch(anchors, landing, CART, "cart", chrome, taken));
  // Articles live in content; navigation links to a section, not a piece.
  for (const a of ranked(anchors, ["main", "body", "footer", "nav"])) {
    const f = followable(a.href, a.text, landing);
    if (!f || taken.has(normalised(f))) continue;
    const last = f.pathname.split("/").filter(Boolean).pop() ?? "";
    const slug = (last.match(/-/g)?.length ?? 0) >= 3 && last.length >= 20;
    if (!CONTENT_SECTION.test(f.pathname) && !DATED.test(f.pathname) && !slug) continue;
    if ([FORM_SIGNUP, FORM_LOGIN, FORM_CONTACT, HELP, CART].some((p) => p.path.test(f.pathname))) continue;
    take("article", { url: f.toString(), how: `content link in ${a.region} ${CONTENT_SECTION.test(f.pathname) ? "under a content section" : DATED.test(f.pathname) ? "with a dated path" : "with a long slug"}${a.visible ? "" : " (hidden)"}` });
    break;
  }
  return out;
}

// ── Site filters (frame b: the random draw from the top-sites ranking) ──

/** Adult and gambling terms matched against a domain name (substring, case-insensitive). */
export const DOMAIN_ADULT = ["porn", "xxx", "xvideo", "xnxx", "xhamster", "hentai", "redtube", "youporn", "nsfw", "chaturbate", "onlyfans", "stripchat", "bongacams", "livejasmin", "spankbang", "eporner", "escort", "camgirl", "brazzers", "rule34", "sexcam", "sexvid", "sextube", "freesex", "sexy"];
export const DOMAIN_GAMBLING = ["casino", "poker", "gambl", "betting", "sportsbook", "bet365", "1xbet", "22bet", "parimatch", "betway", "bwin", "betfair", "betano", "betfred", "melbet", "mostbet", "1win", "fanduel", "draftkings", "williamhill", "ladbrokes", "paddypower", "unibet", "lottery", "lotto", "bingo", "roulette", "blackjack", "jackpot", "bookmaker", "slots"];
/** The same, matched against a landing page's title, description and opening text; two distinct terms of one kind exclude. */
export const PAGE_ADULT = ["porn", "xxx", "sex video", "sex cam", "erotic", "escort", "hentai", "milf", "camgirl", "live cams", "adult content", "nsfw"];
export const PAGE_GAMBLING = ["casino", "sportsbook", "betting", "poker", "slots", "jackpot", "roulette", "blackjack", "free spins", "bookmaker", "place a bet", "bet now"];
export const PAGE_PARKED = ["domain is for sale", "domain may be for sale", "buy this domain", "this domain is parked", "domain parking", "parked free", "hugedomains", "sedo.com", "afternic", "is available for purchase", "inquire about this domain", "make an offer on this domain"];

export function domainExclusion(domain: string): string | null {
  const d = domain.toLowerCase();
  const adult = DOMAIN_ADULT.find((t) => d.includes(t));
  if (adult) return `adult: domain contains "${adult}"`;
  const gambling = DOMAIN_GAMBLING.find((t) => d.includes(t));
  if (gambling) return `gambling: domain contains "${gambling}"`;
  return null;
}

/** Content terms present in `text` (lower-cased by the caller), per kind. */
export function contentFlags(text: string): { adult: string[]; gambling: string[]; parked: string[] } {
  const has = (terms: string[]) => terms.filter((t) => text.includes(t));
  return { adult: has(PAGE_ADULT), gambling: has(PAGE_GAMBLING), parked: has(PAGE_PARKED) };
}

export function contentExclusion(flags: { adult: string[]; gambling: string[]; parked: string[] }): string | null {
  if (flags.parked.length >= 1) return `parked: page says "${flags.parked[0]}"`;
  if (flags.adult.length >= 2) return `adult: page terms ${flags.adult.slice(0, 3).map((t) => `"${t}"`).join(", ")}`;
  if (flags.gambling.length >= 2) return `gambling: page terms ${flags.gambling.slice(0, 3).map((t) => `"${t}"`).join(", ")}`;
  return null;
}
