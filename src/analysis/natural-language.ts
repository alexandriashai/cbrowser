/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */


/**
 * Natural Language API for Browser Automation
 *
 * Tier 3: Provides natural language command parsing and execution for browser automation.
 * Allows commands like "click on the login button" or "fill 'hello' in the search box".
 */

import type { CBrowser } from "../browser.js";

/**
 * Natural language command patterns.
 */
const NL_PATTERNS: Array<{
  pattern: RegExp;
  action: string;
  extract: (match: RegExpMatchArray) => Record<string, string>;
}> = [
  // Navigation
  { pattern: /^(?:go to|navigate to|open|visit)\s+(.+)$/i, action: "navigate", extract: (m) => ({ url: m[1] }) },
  { pattern: /^(?:go\s+)?back$/i, action: "back", extract: () => ({}) },
  { pattern: /^(?:go\s+)?forward$/i, action: "forward", extract: () => ({}) },
  { pattern: /^refresh|reload$/i, action: "reload", extract: () => ({}) },

  // Clicking
  { pattern: /^click(?:\s+on)?\s+(?:the\s+)?["']?(.+?)["']?$/i, action: "click", extract: (m) => ({ selector: m[1] }) },
  { pattern: /^press(?:\s+the)?\s+["']?(.+?)["']?(?:\s+button)?$/i, action: "click", extract: (m) => ({ selector: m[1] }) },
  { pattern: /^tap(?:\s+on)?\s+["']?(.+?)["']?$/i, action: "click", extract: (m) => ({ selector: m[1] }) },

  // Form filling
  { pattern: /^(?:type|enter|input|fill(?:\s+in)?)\s+["'](.+?)["']\s+(?:in(?:to)?|on)\s+(?:the\s+)?["']?(.+?)["']?$/i, action: "fill", extract: (m) => ({ value: m[1], selector: m[2] }) },
  { pattern: /^(?:fill(?:\s+in)?|set)\s+(?:the\s+)?["']?(.+?)["']?\s+(?:to|with|as)\s+["'](.+?)["']$/i, action: "fill", extract: (m) => ({ selector: m[1], value: m[2] }) },

  // Selecting
  { pattern: /^select\s+["'](.+?)["']\s+(?:from|in)\s+(?:the\s+)?["']?(.+?)["']?$/i, action: "select", extract: (m) => ({ value: m[1], selector: m[2] }) },
  { pattern: /^choose\s+["'](.+?)["']$/i, action: "click", extract: (m) => ({ selector: m[1] }) },

  // Screenshots
  { pattern: /^(?:take\s+a?\s*)?screenshot(?:\s+as\s+["']?(.+?)["']?)?$/i, action: "screenshot", extract: (m) => ({ path: m[1] || "" }) },
  { pattern: /^capture(?:\s+the)?\s+(?:page|screen)$/i, action: "screenshot", extract: () => ({}) },

  // Waiting
  { pattern: /^wait(?:\s+for)?\s+(\d+)\s*(?:ms|milliseconds?)?$/i, action: "wait", extract: (m) => ({ ms: m[1] }) },
  { pattern: /^wait(?:\s+for)?\s+(\d+)\s*(?:s|seconds?)$/i, action: "waitSeconds", extract: (m) => ({ seconds: m[1] }) },
  { pattern: /^wait(?:\s+for)?\s+["']?(.+?)["']?(?:\s+to\s+appear)?$/i, action: "waitFor", extract: (m) => ({ selector: m[1] }) },

  // Scrolling
  { pattern: /^scroll\s+(?:to\s+)?(?:the\s+)?(top|bottom)$/i, action: "scroll", extract: (m) => ({ direction: m[1] }) },
  { pattern: /^scroll\s+(up|down)(?:\s+(\d+))?$/i, action: "scrollBy", extract: (m) => ({ direction: m[1], amount: m[2] || "300" }) },

  // Extraction
  { pattern: /^(?:get|extract|find)\s+(?:all\s+)?(?:the\s+)?(.+)$/i, action: "extract", extract: (m) => ({ what: m[1] }) },
];

/**
 * Parse natural language into browser action.
 */
export function parseNaturalLanguage(command: string): { action: string; params: Record<string, string> } | null {
  const trimmed = command.trim();

  for (const { pattern, action, extract } of NL_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return { action, params: extract(match) };
    }
  }

  return null;
}

/**
 * Execute a natural language command.
 */
export async function executeNaturalLanguage(browser: CBrowser, command: string): Promise<{
  success: boolean;
  action: string;
  result?: unknown;
  error?: string;
}> {
  const parsed = parseNaturalLanguage(command);

  if (!parsed) {
    return { success: false, action: "unknown", error: `Could not parse command: "${command}"` };
  }

  const { action, params } = parsed;

  try {
    let result: unknown;

    switch (action) {
      case "navigate":
        result = await browser.navigate(params.url);
        break;
      case "click":
        result = await browser.click(params.selector);
        break;
      case "fill":
        result = await browser.fill(params.selector, params.value);
        break;
      case "screenshot":
        result = await browser.screenshot(params.path || undefined);
        break;
      case "wait":
        await new Promise(r => setTimeout(r, parseInt(params.ms)));
        result = { waited: parseInt(params.ms) };
        break;
      case "waitSeconds":
        await new Promise(r => setTimeout(r, parseInt(params.seconds) * 1000));
        result = { waited: parseInt(params.seconds) * 1000 };
        break;
      case "extract":
        result = await browser.extract(params.what);
        break;
      default:
        return { success: false, action, error: `Unsupported action: ${action}` };
    }

    return { success: true, action, result };
  } catch (e: any) {
    return { success: false, action, error: e.message };
  }
}

/**
 * Execute multiple natural language commands in sequence.
 */
export async function executeNaturalLanguageScript(
  browser: CBrowser,
  commands: string[]
): Promise<Array<{ command: string; success: boolean; action: string; result?: unknown; error?: string }>> {
  const results = [];

  for (const command of commands) {
    if (!command.trim() || command.startsWith("#")) continue; // Skip empty lines and comments
    const result = await executeNaturalLanguage(browser, command);
    results.push({ command, ...result });
    if (!result.success) break; // Stop on first error
  }

  return results;
}

// ============================================================================
// Tier 4: Visual AI Understanding (v4.0.0)
// ============================================================================

/** Options for findElementByIntent */
export interface FindByIntentOptions {
  verbose?: boolean;
  debugDir?: string;
}

/** The MCP tool description, shared by both server registrations so they cannot drift. */
export const FIND_ELEMENT_BY_INTENT_DESCRIPTION =
  "Find ONE element from a natural-language intent by walking a cascade of accessible-name locators "
  + "(exact name > a real button named X plus one word (\"Features tour\"; never when X is destructive, financial, a sign-out or "
  + "a paging word) > exact link > badge-count name > synonym > contains > label/placeholder > all words > visible text > attributes > "
  + "stems > sub-phrase), "
  + "scoped to a landmark when the intent says so ('in the header', 'in the navigation', 'in the footer'). "
  + "Returns a plain CSS selector that Playwright resolves to exactly that element (open shadow roots included) and that cbrowser's click "
  + "resolver will not read as page text, plus confidence (2 decimals). Confidence is the rung, not a probability: "
  + "0.95 = a unique match on the exact name, or a unique landmark ('header', 'footer navigation'); "
  + "0.88-0.92 = a unique synonym, label/placeholder, typed field, badge-count name ('Cart (2)', never on a destructive name), a kind-only "
  + "intent ('first link', 'button') with an ordinal or a single candidate, or a recognised logo/home/search/menu/theme/language control; "
  + "0.7-0.85 = fuzzy (the name contains the phrase, or every word of it; a search-form submit; an exact button for a 'link' intent; "
  + "a logo found page-wide, 0.8, or by its image, 0.75; a language named by its own name, 0.7); "
  + "0.65 = a weak synonym (exit -> Close, remove -> Delete, learn more -> See more); 0.6 = a guess (attributes carry the words, a stem, "
  + "a sub-phrase of the intent, the only X under 'in the navigation' sitting in a footer nav). An ordinal keeps its rung's band less a "
  + "little (exact 0.92, contains 0.78). Several equally good matches lower each rung (exact 0.65, landmark 0.8, specials 0.7-0.75, "
  + "fuzzy 0.5-0.55) and are listed in alternatives. matchedBy names the rung. "
  + "Also accessibleName (the finder's own name computation, which can differ from Playwright's in edge cases), visible (laid out and not "
  + "display:none, not clipped by an overflow hidden/clip ancestor - body and html clip only horizontally, a horizontal scroller never clips - "
  + "not transparent unless a visible label or a styled parent box stands for it, not aria-hidden or inert, not covered by an opaque on-screen "
  + "modal; scrolled-away content IS visible), zone, candidates (how many visible elements that rung matched), and alternatives (each with its own unique selector). "
  + "zone is the click gate's verdict on the element itself (green/yellow/red; red is refused without force however it is addressed); "
  + "a click on a container is ADDITIONALLY judged where the pointer lands, so a card or section can read yellow and still be refused "
  + "when its centre is a red control, and a stale self-healing cache entry for the same selector string can still steer click() elsewhere. "
  + "CHECK zone AND visible BEFORE clicking. "
  + "It returns null / found:false when nothing qualifies; when the only exact match is hidden at this viewport, whatever its kind (two "
  + "exceptions: a visible real button named X plus one word still answers, since that rung runs before the exact ones - a hidden 'Save' "
  + "with a visible 'Save changes' gives 'Save changes' at 0.8; and an exact match display-hidden inside a folded navigation or the page "
  + "header lets the search continue to the page's visible equivalent, capped at 0.7, and only to an exact-family match or a name that "
  + "starts with the phrase); when an ordinal asks for "
  + "more matches than the first rung that matched has ('second remove button' with one Remove); when 'X in the navigation' finds X only in "
  + "a footer while the header nav is collapsed; when a fuzzy match adds an action the intent did not say - a destructive, financial or "
  + "bulk verb (delete, remove, cancel, clear, reset, leave, end, wipe, archive, transfer, upgrade, place, approve, pay, buy, ...: 'account "
  + "button' never reaches Delete account), a bulk quantifier (all, everything, selected, everyone, everywhere, 'of all', or a count ending "
  + "the name), or any word in front of the phrase other than a known-benign one (view, send, report, confirm, edit, add, ...: 'funds button' "
  + "never reaches Withdraw funds, 'spam button' does reach Report spam); and for row-scoped intents on table-layout pages with no "
  + "landmarks ('upvote button for the first story' - say 'first upvote link' instead). "
  + "Ordinals count person-visible elements in DOM order, not visual order ('third delete button'; 'second cheapest product' ranks by price). "
  + "verbose=true on a miss lists the first visible links, buttons and fields with unique selectors so you can rephrase, and says when a "
  + "locator evaluation failed during the search.";


import type { SelectorStrategyType } from "../types.js";
import type { Locator, Page } from "playwright";

/** Where a rung is resolved: the page, or the landmark locator the intent scopes to. */
type Scope = Page | Locator;
/** Playwright's own role union (not exported by name), so KIND_ROLES is checked against it. */
type AriaRole = Parameters<Page["getByRole"]>[0];

// ============================================================================
// findElementByIntent - semantic locator cascade (BUG-01 redesign, design C)
// ============================================================================
//
// The intent is parsed into {scope, ordinal, kind, name}. The name is turned into an
// ordered cascade of Playwright locators (getByRole / getByLabel / getByPlaceholder /
// getByAltText / getByTitle / getByText) so that accessible names are computed by
// Playwright's own engine, chained inside a landmark scope when the intent asks for one.
// Each rung is resolved with ONE round trip (locator.evaluateAll): the page-side picker
// filters to what a person can see, applies the ordinal, picks the element, and emits a
// CSS selector that is verified in the same evaluation to match exactly that element.
// The first rung that yields an element wins; confidence is a function of the rung.
// Nothing qualifies -> null (or the verbose "no match" shape).

type CandidateInfo = {
  selector: string;
  selectorType: SelectorStrategyType;
  name: string;
  names: string[];      // every name the element carries (aria-label, label, value, alt, title, visible text)
  text: string;
  tag: string;
  role: string;
  visible: boolean;
  marked?: boolean;     // inside arg.markCss (when asked)
};

type PickFilter = {
  nameRe?: string;      // accessible name (i)
  attrRe?: string;      // id / class / aria-label / name / data-testid (i)
  textRe?: string;      // innerText (i)
  hasCss?: string;      // must contain a descendant matching this
  withinCss?: string;   // must be inside (closest) this
  notWithinCss?: string;
  tagRe?: string;
  matchCss?: string;    // element itself matches
  hasVisibleCss?: string; // must contain a visible descendant matching this
  minVisible?: number;  // how many such descendants (default 1)
  notHasVisibleCss?: string; // must NOT contain a visible descendant matching this
  anyOf?: PickFilter[]; // passes when any sub-filter passes
  iconLink?: boolean;   // a link whose only content is an image/svg (no visible text of its own)
  rootLink?: boolean;   // a link to the site root (pathname "/", no query/hash, absolute or not), outside any nav or list, not named Home
  notNameRe?: string;   // accessible name must NOT match (i)
};

type PickArg = {
  ordinal: number | null;        // 0-based; -1 = last
  mode: "first" | "unique";      // several visible, no ordinal: pick the first, or report ambiguity
  container: boolean;            // container visibility rule (a landmark is visible when a child is)
  require: PickFilter[];         // hard filters
  prefer: PickFilter[];          // soft filters, applied in order while something survives
  guard?: { words: string[]; maxExtra: number; prefixMaxExtra: number; danger: boolean; quant?: boolean; lettersOnlyExtra?: boolean; noWordsBefore?: boolean };
  dedupeNested?: boolean;        // drop a candidate that contains another candidate
  dedupeOuter?: boolean;         // drop a candidate that is inside another candidate (keep the outer)
  liftToControl?: boolean;       // text matches: lift to the nearest interactive ancestor
  preferLonger?: boolean;        // no ordinal: keep only the candidates whose name has the most words
  minNameWords?: number;         // drop candidates whose name has fewer words than this
  badge?: boolean;               // the name may end in a count only when it is "(2)" or sits in its own badge element
  markCss?: string;              // report whether each candidate is inside this (CandidateInfo.marked)
  countCss?: string;             // report how many visible elements match this document-wide (PickResult.countVisible)
  maxOthers?: number;
};

type PickResult = {
  total: number;
  visibleCount: number;
  hiddenOnly: boolean;
  hiddenInCollapsedNav?: boolean; // every hidden match is display-hidden inside a nav/header/menu/dropdown
  ambiguous: boolean;
  chosen: CandidateInfo | null;
  others: CandidateInfo[];
  countVisible?: number;
  ordinalOutOfRange?: boolean;   // visible matches existed, but fewer than the ordinal asked for
};

/**
 * Page-side picker. Runs inside locator.evaluateAll(), so it must be self-contained.
 */
const PICK = (input: Element[], arg: PickArg): PickResult => {
  const CONTAINERS = new Set(["HEADER", "NAV", "FOOTER", "MAIN", "ASIDE", "SECTION", "FORM", "ARTICLE", "DIV", "UL", "OL", "TR", "TABLE", "TBODY", "DIALOG", "LI"]);
  // The verbs that make a name destructive or financial. A fuzzy rung may only land on a name carrying one of
  // these when the intent itself says that verb: "account button" never reaches "Delete account".
  // (host-side copy: DANGER_VERB_LIST; "send" and "confirm" are not destructive, financial or bulk and were dropped)
  const DANGER_VERBS = ["delete", "remove", "cancel", "unsubscribe", "leave", "clear", "reset", "disconnect", "revoke", "erase",
    "deactivate", "disable", "discard", "destroy", "terminate", "end", "empty", "wipe", "archive", "transfer", "upgrade", "place",
    "approve", "pay", "buy", "purchase", "checkout"];
  // A bulk quantifier in the name ("Delete all", "Remove selected", "Sign out everywhere", "Approve 12") needs the same in the intent.
  const QUANTIFIERS = ["all", "everything", "every", "selected", "everyone", "everybody", "everywhere"];
  const GENERATED_ID = /^(radix-|:r|«r|_R_|:R|ember\d|mui-|headlessui-|react-aria|__|rc-|ant-|chakra-|downshift-|react-select)|[:«»]|^[a-z]{1,2}\d+$|^[0-9a-f]{8,}$/i;
  const STATE_CLASS = /^(active|open|opened|closed|hover|focus|focused|visible|hidden|show|shown|selected|current|expanded|collapsed|disabled|checked|is-|has-|js-)/;
  const HASHED_CLASS = /^(css-|sc-|_|jsx-)|[_-][a-z0-9]{6,}$|\d{3,}/i;

  const q = (v: string) => String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const esc = (s: string) => (typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(s) : s.replace(/([^\w-])/g, "\\$1"));
  // checkVisibility is missing from older engines; treat "unavailable" as "not hidden by it"
  const cssVisible = (e: Element) => typeof e.checkVisibility !== "function" || e.checkVisibility({ visibilityProperty: true });
  let bodyClipsXCache: boolean | undefined;
  const bodyClipsX = (): boolean => {
    if (bodyClipsXCache === undefined) {
      bodyClipsXCache = [document.body, document.documentElement].some(n => n && /^(hidden|clip)$/.test(getComputedStyle(n).overflowX));
    }
    return bodyClipsXCache;
  };
  // SVG elements carry an SVGAnimatedString, not a string
  const classNameOf = (e: Element): string => {
    const c: string | SVGAnimatedString | undefined = (e as unknown as { className?: string | SVGAnimatedString }).className;
    return typeof c === "string" ? c : (c?.baseVal ?? "");
  };

  // ---- visibility: what a person can see at this width ----
  // Modals that can block the page: opaque, accepting pointer events, and on screen. A closed off-canvas
  // drawer (translateX(-100%)), an opacity-0 closed modal, and a cookie banner that sits at the bottom are
  // either not blocking at all or block only what they cover, which the hit-test below decides.
  let modalsCache: Element[] | undefined;
  const blockingModals = (): Element[] => {
    if (modalsCache) return modalsCache;
    modalsCache = [];
    try {
      const vw = window.innerWidth, vh = window.innerHeight;
      for (const m of Array.from(document.querySelectorAll('[aria-modal="true"], dialog:modal'))) {
        if (!cssVisible(m)) continue;
        const cs = getComputedStyle(m);
        if (cs.opacity === "0" || cs.pointerEvents === "none" || cs.visibility === "hidden") continue;
        const b = m.getBoundingClientRect();
        if (b.width < 2 || b.height < 2 || b.right <= 0 || b.bottom <= 0 || b.left >= vw || b.top >= vh) continue;
        modalsCache.push(m);
      }
    } catch { /* :modal unsupported */ }
    return modalsCache;
  };
  function coveredByModal(e: Element, r: DOMRect): boolean {
    const modals = blockingModals();
    if (!modals.length || modals.some(m => m.contains(e))) return false;
    const vw = window.innerWidth, vh = window.innerHeight;
    // a modal that covers the whole viewport blocks everything outside it, on screen or not
    if (modals.some(m => { const b = m.getBoundingClientRect(); return b.left <= 0 && b.top <= 0 && b.right >= vw && b.bottom >= vh; })) return true;
    // otherwise only what the modal actually covers: hit-test the element's centre when it is on screen
    if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) return false;
    const cx = Math.min(Math.max(r.left + r.width / 2, 0), vw - 1), cy = Math.min(Math.max(r.top + r.height / 2, 0), vh - 1);
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || hit === e || e.contains(hit)) return false;
    return modals.some(m => m.contains(hit));
  }
  function leafVisible(e: Element): boolean {
    if (!e || !e.isConnected) return false;
    if (!cssVisible(e)) return false;
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const sx = window.scrollX, sy = window.scrollY;
    if (r.right + sx <= 0 || r.bottom + sy <= 0) return false;
    // Past the document's right edge: off the page, unless the element sits in a horizontal scroller (a
    // .table-responsive, a product rail), which a person can scroll. body/html clip only horizontally:
    // overflow-x:hidden on body is the off-canvas idiom (a drawer parked at left:100% is not on the page);
    // vertical overflow on body is scrolling, never clipping.
    const docW = Math.max(document.documentElement.scrollWidth, document.documentElement.clientWidth);
    if (r.left + sx >= docW || (r.left >= window.innerWidth && bodyClipsX())) {
      let a = e.parentElement, scroller = false;
      while (a && a !== document.body && a !== document.documentElement) { if (/^(auto|scroll)$/.test(getComputedStyle(a).overflowX)) { scroller = true; break; } a = a.parentElement; }
      if (!scroller) return false;
    }
    const cs = getComputedStyle(e);
    if (cs.clip && cs.clip !== "auto" && /rect\((0|1)px?,?\s*(0|1)px?/.test(cs.clip)) return false;
    if (cs.clipPath && /inset\(50%\)/.test(cs.clipPath)) return false;
    // transparent, hidden from assistive tech, inert, or behind an open modal: not something a person can act on.
    // A transparent control with a visible label is what the person sees (Wikipedia's checkbox-as-button inputs);
    // a transparent button with nothing in its place is a ghost.
    if (cs.opacity === "0") {
      const labels = (e as HTMLInputElement).labels;
      const labelled = !!labels && Array.from(labels).slice(0, 3).some(l => getComputedStyle(l).opacity !== "0" && cssVisible(l) && l.getBoundingClientRect().width >= 2);
      // a transparent native select/input laid over a styled box is what the person sees (the box is its parent)
      const p = e.parentElement;
      const styledBox = /^(SELECT|INPUT|TEXTAREA)$/.test(e.tagName) && !!p && cssVisible(p) && getComputedStyle(p).opacity !== "0"
        && p.getBoundingClientRect().width >= 2 && p.getBoundingClientRect().height >= 2;
      if (!labelled && !styledBox) return false;
    }
    if (e.closest('[aria-hidden="true"], [inert]')) return false;
    if (coveredByModal(e, r)) return false;
    // Clipping ancestors: only overflow hidden/clip clips for good; auto/scroll can be scrolled to, so it is
    // not clipping. Body and html are never clipping ancestors (html,body{height:100%} + overflow-x:hidden makes
    // body's overflow-y compute to auto and would hide everything below the first screen).
    let p = e.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
      const pcs = getComputedStyle(p);
      if (pcs.opacity === "0") return false;
      if (pcs.position === "fixed") break;
      const clipX = /^(hidden|clip)$/.test(pcs.overflowX), clipY = /^(hidden|clip)$/.test(pcs.overflowY);
      if (clipX || clipY) {
        const pr = p.getBoundingClientRect();
        if (pr.width < 1 || pr.height < 1) return false;
        if (clipX && (r.right <= pr.left || r.left >= pr.right)) return false;
        if (clipY && (r.bottom <= pr.top || r.top >= pr.bottom)) return false;
      }
      p = p.parentElement;
    }
    return true;
  }
  function isVisible(e: Element, container: boolean = arg.container): boolean {
    if (leafVisible(e)) return true;
    if (!container) return false;
    const contents = e.isConnected && getComputedStyle(e).display === "contents";
    if (e.isConnected && CONTAINERS.has(e.tagName) && (contents || cssVisible(e))) {
      const kids = e.querySelectorAll("a, button, input, select, textarea, img, svg, h1, h2, h3, h4, p, span, li, label");
      for (let i = 0; i < kids.length && i < 300; i++) if (leafVisible(kids[i])) return true;
    }
    return false;
  }

  // ---- accessible name (approximation; used for descriptions, guards and zone) ----
  const norm = (s: string) => String(s || "").replace(/\s+/g, " ").trim();
  function ownText(e: Element): string {
    return norm((e as HTMLElement).innerText || e.textContent || "");
  }
  function accName(e: Element): string {
    const rootNode: Node = typeof e.getRootNode === "function" ? e.getRootNode() : document;
    const byId = (id: string) => ("getElementById" in rootNode ? (rootNode as Document | DocumentFragment).getElementById(id) : document.getElementById(id));
    const lb = e.getAttribute("aria-labelledby");
    if (lb) {
      const t = lb.split(/\s+/).map(id => byId(id)).filter((n): n is HTMLElement => !!n).map(n => ownText(n)).join(" ").trim();
      if (t) return norm(t).slice(0, 200);
    }
    const al = e.getAttribute("aria-label");
    if (al && al.trim()) return norm(al).slice(0, 200);
    const tag = e.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
      const ie = e as HTMLInputElement;
      if (tag === "INPUT" && /^(submit|button|reset|image)$/i.test(ie.type)) {
        if (ie.value) return norm(ie.value).slice(0, 200);
        const alt = e.getAttribute("alt"); if (alt) return norm(alt);
      }
      const labels = ie.labels;
      if (labels && labels.length) {
        const t = Array.from(labels).map(l => ownText(l)).join(" ").trim();
        if (t) return norm(t).slice(0, 200);
      }
      const ph = e.getAttribute("placeholder"); if (ph) return norm(ph).slice(0, 200);
      const ti = e.getAttribute("title"); if (ti) return norm(ti).slice(0, 200);
      if (tag === "INPUT" && /^(checkbox|radio)$/i.test(ie.type)) {
        // unassociated label text right after the control: "<input type=checkbox> I agree to the terms"
        let t = "", n: Node | null = e.nextSibling;
        while (n && t.length < 120) {
          if (n.nodeType === 3) t += n.textContent || "";
          else if (n.nodeType === 1 && /^(SPAN|LABEL|B|I|EM|STRONG|A)$/.test((n as Element).tagName)) t += " " + ((n as HTMLElement).innerText || "");
          else break;
          n = n.nextSibling;
        }
        if (norm(t)) return norm(t).slice(0, 200);
        const lp = e.closest("label"); if (lp) return ownText(lp).slice(0, 200);
      }
      return "";
    }
    const t = ownText(e);
    if (t) return t.slice(0, 200);
    const img = e.querySelector("img[alt], [role='img'][aria-label], svg[aria-label], svg > title");
    if (img) {
      const a = img.getAttribute("alt") || img.getAttribute("aria-label") || (img.tagName.toLowerCase() === "title" ? img.textContent : "");
      if (a && a.trim()) return norm(a).slice(0, 200);
    }
    const inner = e.querySelector("[aria-label]");
    if (inner && inner.getAttribute("aria-label")) return norm(inner.getAttribute("aria-label") || "").slice(0, 200);
    return norm(e.getAttribute("title") || e.getAttribute("alt") || "").slice(0, 200);
  }
  function roleOf(e: Element): string {
    const r = e.getAttribute("role");
    if (r) return r.split(/\s+/)[0];
    const tag = e.tagName.toLowerCase();
    if (tag === "a") return e.hasAttribute("href") ? "link" : "";
    if (tag === "button") return "button";
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";
    if (tag === "input") {
      const t = ((e as HTMLInputElement).type || "text").toLowerCase();
      if (t === "submit" || t === "button" || t === "reset" || t === "image") return "button";
      if (t === "checkbox" || t === "radio") return t;
      if (t === "search") return "searchbox";
      if (t === "number") return "spinbutton";
      if (t === "range") return "slider";
      return "textbox";
    }
    if (tag === "nav") return "navigation";
    if (tag === "main") return "main";
    if (tag === "header") return "banner";
    if (tag === "footer") return "contentinfo";
    if (tag === "aside") return "complementary";
    if (tag === "form") return "form";
    if (tag === "dialog") return "dialog";
    if (tag === "img") return "img";
    if (/^h[1-6]$/.test(tag)) return "heading";
    return "";
  }

  // Every name the element carries, for the zone: a testid selector says nothing, but "Pay with card" in
  // the value, the title or the visible text does, and the most severe of them is the one that counts.
  function allNames(e: Element): string[] {
    const out = new Set<string>();
    const add = (v: string | null | undefined) => { const t = norm(v || "").slice(0, 200); if (t) out.add(t); };
    add(accName(e));
    add(e.getAttribute("aria-label"));
    add(e.getAttribute("title"));
    add(e.getAttribute("alt"));
    add(e.getAttribute("placeholder"));
    if (e.tagName === "INPUT" || e.tagName === "SELECT" || e.tagName === "TEXTAREA") {
      const ie = e as HTMLInputElement;
      if (e.tagName === "INPUT" && /^(submit|button|reset|image)$/i.test(ie.type)) add(ie.value);
      if (ie.labels) for (const l of Array.from(ie.labels).slice(0, 3)) add(ownText(l));
    }
    add(ownText(e));
    const img = e.querySelector("img[alt], [aria-label], svg > title");
    if (img) add(img.getAttribute("alt") || img.getAttribute("aria-label") || (img.tagName.toLowerCase() === "title" ? img.textContent : ""));
    return [...out];
  }

  // ---- stable, verified-unique selector ----
  // Playwright's CSS pierces open shadow roots and cbrowser's click resolver uses Playwright, so uniqueness is
  // counted across every open shadow root too, and a candidate inside one gets "<host path> <inner path>".
  let rootsCache: ShadowRoot[] | null = null;
  const shadowRoots = (): ShadowRoot[] => {
    if (rootsCache) return rootsCache;
    const out: ShadowRoot[] = [];
    const walk = (root: Document | ShadowRoot) => {
      const all = root.querySelectorAll("*");
      for (let i = 0; i < all.length && out.length < 200; i++) { const sr = all[i].shadowRoot; if (sr) { out.push(sr); walk(sr); } }
    };
    try { walk(document); } catch { /* ignore */ }
    rootsCache = out;
    return out;
  };
  function uniq(sel: string, el: Element): boolean {
    try {
      const m = document.querySelectorAll(sel);
      if (m.length > 1 || (m.length === 1 && m[0] !== el)) return false;
      let n = m.length;
      for (const sr of shadowRoots()) { const k = sr.querySelectorAll(sel); n += k.length; if (n > 1 || (k.length === 1 && k[0] !== el)) return false; }
      return n === 1;
    } catch { return false; }
  }
  function uniqWithin(sel: string, el: Element, scope: ShadowRoot): boolean {
    try { const m = scope.querySelectorAll(sel); return m.length === 1 && m[0] === el; } catch { return false; }
  }
  function stableId(e: Element): string | null {
    const id = e.id;
    if (!id || GENERATED_ID.test(id)) return null;
    return id;
  }
  function stableClasses(e: Element): string[] {
    return classNameOf(e).split(/\s+/).filter(c => c && /^[a-zA-Z][\w-]*$/.test(c) && !STATE_CLASS.test(c) && !HASHED_CLASS.test(c)).slice(0, 3);
  }
  function part(e: Element): string {
    const tag = e.tagName.toLowerCase();
    const parent = e.parentElement;
    let p = tag;
    if (parent) {
      const same = Array.from(parent.children).filter(c => c.tagName === e.tagName);
      if (same.length > 1) p += `:nth-of-type(${same.indexOf(e) + 1})`;
    }
    return p;
  }
  function anchorFor(e: Element): string | null {
    const id = stableId(e);
    if (id) return "#" + esc(id);
    for (const a of ["data-testid", "data-test-id", "data-test", "data-cy", "data-qa"]) {
      const v = e.getAttribute(a);
      if (v) return `[${a}="${q(v)}"]`;
    }
    return null;
  }
  // cbrowser's click resolver reads a selector string as page TEXT first (exact, then a case-insensitive
  // substring, then placeholder / label / button-name), and only then as CSS. So a form is usable only when
  // no text or name on the page contains it: "#home" with a hashtag "#home" in a post, or a lone "button"
  // beside "Press the button below", would click the wrong element. One haystack per pick, built lazily.
  let hayCache: string | null = null;
  const haystack = (): string => {
    if (hayCache !== null) return hayCache;
    const parts: string[] = [norm(document.body ? document.body.textContent || "" : "")];
    const addNamed = (root: Document | ShadowRoot) => {
      const named = root.querySelectorAll("[aria-label], [placeholder], [title], [alt], input[value]");
      for (let i = 0; i < named.length && i < 3000; i++) {
        for (const a of ["aria-label", "placeholder", "title", "alt", "value"]) { const v = named[i].getAttribute(a); if (v) parts.push(norm(v)); }
      }
    };
    addNamed(document);
    // getByText sees into open shadow roots too
    for (const sr of shadowRoots()) { parts.push(norm(sr.textContent || "")); addNamed(sr); }
    hayCache = parts.join(" \n ").toLowerCase();
    return hayCache;
  };
  const collides = (sel: string): boolean => haystack().includes(norm(sel).toLowerCase());
  function uniqueSelector(e: Element): { selector: string; type: SelectorStrategyType } {
    const root = e.getRootNode();
    if (typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot) {
      // "<host path> <inner path>": Playwright's CSS descends into the open shadow root of the host
      const host = uniqueSelector(root.host);
      const inner = uniqueSelectorWith(e, (sel, el) => uniqWithin(sel, el, root) && !collides(sel), root);
      return host.selector && inner.selector ? { selector: `${host.selector} ${inner.selector}`, type: inner.type } : { selector: "", type: "nth-of-type" };
    }
    return uniqueSelectorWith(e, (sel, el) => uniq(sel, el) && !collides(sel), null);
  }
  function uniqueSelectorWith(e: Element, usable: (sel: string, el: Element) => boolean, scope: ShadowRoot | null): { selector: string; type: SelectorStrategyType } {
    const tag = e.tagName.toLowerCase();
    const tries: Array<[string, SelectorStrategyType]> = [];
    for (const a of ["data-testid", "data-test-id", "data-test", "data-cy", "data-qa"]) {
      const v = e.getAttribute(a);
      if (v) tries.push([`[${a}="${q(v)}"]`, "data-testid"]);
    }
    const al = e.getAttribute("aria-label");
    if (al) tries.push([`${tag}[aria-label="${q(al)}"]`, "aria-label"]);
    if (tag === "input") {
      const ie = e as HTMLInputElement;
      const v = e.getAttribute("value");
      if (v && /^(submit|button|reset)$/i.test(ie.type)) tries.push([`input[value="${q(v)}"]`, "input-type"]);
    }
    const id = stableId(e);
    if (id) tries.push(["#" + esc(id), "id"]);
    const nm = e.getAttribute("name");
    if (nm) tries.push([`${tag}[name="${q(nm)}"]`, "name"]);
    const ti = e.getAttribute("title");
    if (ti) tries.push([`${tag}[title="${q(ti)}"]`, "aria-label"]);
    const ph = e.getAttribute("placeholder");
    if (ph) tries.push([`${tag}[placeholder="${q(ph)}"]`, "name"]);
    if (tag === "a") {
      const href = e.getAttribute("href");
      if (href && href !== "#" && !/^javascript:/i.test(href)) tries.push([`a[href="${q(href)}"]`, "css-class"]);
    }
    if (tag === "input") {
      const t = e.getAttribute("type");
      if (t) tries.push([`input[type="${q(t)}"]`, "input-type"]);
    }
    const role = e.getAttribute("role");
    if (role) tries.push([`${tag}[role="${q(role)}"]`, "role"]);
    // "body > footer" rather than bare "footer": cbrowser's click resolver reads a bare word as page text first
    if (["header", "footer", "main", "nav", "aside", "form", "dialog", "section", "article"].includes(tag)) {
      const parent = e.parentElement;
      if (parent && parent.tagName === "BODY") tries.push(["body > " + tag, "semantic-element"]);
      tries.push(["body " + tag, "semantic-element"]);
    }
    const lb = e.getAttribute("aria-labelledby");
    if (lb) tries.push([`${tag}[aria-labelledby="${q(lb)}"]`, "aria-labelledby"]);
    const cls = stableClasses(e);
    if (cls.length) tries.push([tag + cls.map(c => "." + esc(c)).join(""), "css-class"]);
    for (const [s, t] of tries) if (usable(s, e)) return { selector: s, type: t };
    // Structural path: walk up until unique, anchoring at the nearest stable id/testid. Never a lone part:
    // a bare tag ("button") is page text to the click resolver, and a lone positional part is unique only by accident.
    const parts: string[] = [part(e)];
    let cur: Element | null = e.parentElement;
    let guardN = 0;
    while (cur && cur !== document.documentElement && guardN++ < 40) {
      const sel = parts.join(" > ");
      if (parts.length > 1 && usable(sel, e)) return { selector: sel, type: "nth-of-type" };
      const anchor = anchorFor(cur);
      if (anchor) {
        const s2 = anchor + " > " + sel;
        if (usable(s2, e)) return { selector: s2, type: "nth-of-type" };
      }
      if (cur.tagName === "BODY") { parts.unshift("body"); break; }
      parts.unshift(part(cur));
      cur = cur.parentElement;
    }
    const full = parts.join(" > ");
    if (scope ? uniqWithin(full, e, scope) : uniq(full, e)) return { selector: full, type: "nth-of-type" };
    return { selector: "", type: "nth-of-type" };
  }

  // ---- filters ----
  const re = (s?: string) => (s ? new RegExp(s, "i") : null);
  function attrBlob(e: Element): string {
    return [
      e.id, classNameOf(e), e.getAttribute("aria-label"), e.getAttribute("name"), e.getAttribute("data-testid"),
      e.getAttribute("title"), e.getAttribute("role"), e.getAttribute("action"), e.getAttribute("type"),
    ].filter(Boolean).join(" ");
  }
  function passes(e: Element, f: PickFilter, name: string): boolean {
    if (f.anyOf) return f.anyOf.some(sub => passes(e, sub, name));
    if (f.matchCss) { try { if (!e.matches(f.matchCss)) return false; } catch { return false; } }
    if (f.hasVisibleCss) { try { if (Array.from(e.querySelectorAll(f.hasVisibleCss)).slice(0, 300).filter(k => leafVisible(k)).length < (f.minVisible ?? 1)) return false; } catch { return false; } }
    if (f.notHasVisibleCss) { try { if (Array.from(e.querySelectorAll(f.notHasVisibleCss)).slice(0, 300).some(k => leafVisible(k))) return false; } catch { return false; } }
    const nr = re(f.nameRe); if (nr && !nr.test(name)) return false;
    const ar = re(f.attrRe); if (ar && !ar.test(attrBlob(e))) return false;
    const tr = re(f.textRe); if (tr && !tr.test(ownText(e))) return false;
    const gr = re(f.tagRe); if (gr && !gr.test(e.tagName.toLowerCase())) return false;
    if (f.hasCss) { try { if (!e.querySelector(f.hasCss)) return false; } catch { return false; } }
    if (f.withinCss) { try { if (!e.closest(f.withinCss)) return false; } catch { return false; } }
    if (f.notWithinCss) { try { if (e.closest(f.notWithinCss)) return false; } catch { return false; } }
    const nn = re(f.notNameRe); if (nn && nn.test(name)) return false;
    if (f.iconLink && !(e.querySelector("img, svg, picture") && !norm(ownText(e)))) return false;
    if (f.rootLink) {
      if (e.tagName !== "A") return false;
      const href = (e.getAttribute("href") || "").trim();
      // literal roots first (location can be about:blank, where relative URLs do not parse), then an absolute wordmark href
      let isRoot = /^(\/|\.\/|index\.html|\/index\.html)$/.test(href);
      if (!isRoot) { try { const u = new URL(href); isRoot = u.pathname === "/" && !u.search && !u.hash; } catch { /* relative, not a root */ } }
      if (!isRoot || e.closest("nav, [role='navigation'], ul, ol, [role='menu']") || /^\s*(home|homepage|home page)\s*$/i.test(name)) return false;
    }
    return true;
  }
  const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
  function guardOk(name: string): boolean {
    const g = arg.guard; if (!g) return true;
    const nw = words(name);
    const iw = g.words;
    if (g.danger) {
      for (const v of DANGER_VERBS) if (nw.includes(v) && !iw.includes(v)) return false;
      // "Close account" is the one destructive name without a listed verb
      if (/\bclose\s+(?:my\s+|your\s+|the\s+)?account\b/.test(name.toLowerCase()) && !(iw.includes("close") && iw.includes("account"))) return false;
    }
    // "all" / "everything" anywhere, or a count (1-3 digits, or a year) right after the phrase ("Delete 2",
    // "Pricing 2025", "Call 988"); a longer number is an identifier ("Approve order 10002"). A container's text
    // is not a control's name, so container kinds skip the number rule (a card's price follows its title).
    if (g.quant !== false) {
      // The quantifier is the phrase's object: "Remove all", "Delete everything", "Approve 12", "Delete 2", "Pricing 2025",
      // "Call 988". Not "Unsubscribe from all emails" (all modifies emails), not "Try Free - 5 Tests" (the count is
      // mid-name), not "Pay $12.00" (a price). A count is 1-3 digits or a year, and must end the name.
      const lastIntent = iw[iw.length - 1];
      const after = (i: number) => i > 0 && nw[i - 1] === lastIntent;
      const priceLike = /[$£€¥]\s?\d|\b\d{1,3}[.,]\d{2}\b/.test(name);
      const isCount = (w: string) => /^\d{1,3}$/.test(w) || /^(19|20)\d{2}$/.test(w);
      // "of all" anywhere is bulk too ("Sign out of all devices"); "from all" is not ("Unsubscribe from all emails")
      const quantAfterPhrase = nw.some((w, i) => QUANTIFIERS.includes(w) && (after(i) || (w === "all" && i > 0 && nw[i - 1] === "of")));
      const countEndsName = !priceLike && nw.length > 0 && isCount(nw[nw.length - 1]) && after(nw.length - 1);
      if ((quantAfterPhrase && !iw.some(w => QUANTIFIERS.includes(w))) || (countEndsName && !iw.some(w => /^\d+$/.test(w)))) return false;
    }
    // An object-only intent ("funds button", "pull request button") never takes a name that puts words in front of the
    // phrase: the word in front is the action ("Withdraw funds", "Merge pull request", "Cookie settings"), and the intent
    // did not say it. Field labels are sentences, so field kinds are exempt.
    // A known-benign lead is allowed ("Report spam", "Send invite", "Confirm email", "View orders"); anything else in front
    // of the phrase is an action the intent did not name (Withdraw, Merge, Refund, Suspend, Ban, Stop, Publish, Deploy, Cookie).
    if (g.noWordsBefore && iw.length) {
      const BENIGN_LEAD = new Set(["report", "view", "show", "open", "see", "read", "add", "new", "create", "edit", "learn", "get", "start", "go",
        "browse", "search", "find", "filter", "sort", "export", "download", "print", "share", "copy", "select", "choose", "toggle", "change",
        "update", "manage", "contact", "send", "confirm", "write", "compose", "reply", "mark", "save", "continue", "more", "my", "your", "our",
        "the", "a", "an", "to", "hide", "expand", "collapse", "back", "forward", "previous", "next", "main", "skip", "visit", "explore", "watch",
        "play", "listen", "subscribe", "follow", "like", "upload", "attach", "insert", "request", "invite", "join", "accept", "sign", "log"]);
      let start = -1;
      for (let i = 0; i + iw.length <= nw.length && start < 0; i++) if (iw.every((w, j) => nw[i + j] === w)) start = i;
      if (start < 0) start = nw.indexOf(iw[0]);
      if (start > 0 && nw.slice(0, start).some(w => !iw.includes(w) && !BENIGN_LEAD.has(w))) return false;
    }
    // "X plus one word": the extra must be a word ("Features tour"), not a number or a price ("Save $5", "Delete 2")
    if (g.lettersOnlyExtra && nw.some(w => !iw.includes(w) && !/^\p{L}+$/u.test(w))) return false;
    const extra = nw.length - iw.length;
    if (extra <= g.maxExtra) return true;
    // prefix match: the name starts with the intent words
    let prefix = iw.length > 0;
    for (let i = 0; i < iw.length; i++) if (nw[i] !== iw[i]) { prefix = false; break; }
    return prefix && extra <= g.prefixMaxExtra;
  }

  function isPrefix(name: string): boolean {
    const g = arg.guard; if (!g || !g.words.length) return false;
    const nw = words(name);
    for (let i = 0; i < g.words.length; i++) if (nw[i] !== g.words[i]) return false;
    return true;
  }

  // ---- pipeline ----
  let els = [...new Set(input.filter(e => e && e.nodeType === 1 && !/^(HTML|BODY|HEAD)$/.test(e.tagName)))];
  if (arg.liftToControl) {
    const lifted = els.map(e => (e.closest("a[href], button, [role='button'], [role='link'], [role='tab'], [role='menuitem'], summary, label, select, input") as Element | null) || e);
    els = [...new Set(lifted)];
  }
  const total = els.length;
  const named = els.map(e => ({ e, name: accName(e) }));
  let cands = named.filter(x => arg.require.every(f => passes(x.e, f, x.name)));
  cands = cands.filter(x => guardOk(x.name));
  if (arg.minNameWords) cands = cands.filter(x => words(x.name).length >= arg.minNameWords!);
  if (arg.badge) {
    // "Cart (2)" and "Star <span class=Counter>1.2k</span>" are the exact name with a badge; "Delete 2", "Call 988"
    // and "Pricing 2025" are different names that happen to end in a number
    cands = cands.filter(x => {
      const m = x.name.match(/(\(\s*[\d.,]+k?\+?\s*\)|[\d.,]+k?\+?)[\s\W_]*$/i);
      if (!m) return true;
      // a count on a destructive or financial name is a bulk action ("Delete (2)", "Archive <span>3</span>"), never the exact name
      if (words(x.name).some(w => DANGER_VERBS.includes(w))) return false;
      if (m[1].startsWith("(")) return true;
      const count = norm(m[1]);
      return Array.from(x.e.querySelectorAll("span, b, i, em, strong, sup, small, div")).slice(0, 20).some(c => norm(c.textContent || "") === count);
    });
  }
  // nesting is resolved among the candidates that survived the filters (a product card contains its image)
  if (arg.dedupeNested) {
    const set = new Set(cands.map(x => x.e));
    cands = cands.filter(x => ![...set].some(o => o !== x.e && x.e.contains(o)));
  }
  if (arg.dedupeOuter) {
    const set = new Set(cands.map(x => x.e));
    cands = cands.filter(x => ![...set].some(o => o !== x.e && o.contains(x.e)));
  }
  const visibleAll = cands.filter(x => isVisible(x.e));
  const hiddenOnly = cands.length > 0 && visibleAll.length === 0;
  // Hidden how? A match display-hidden inside a navigation, header, menu or dropdown is a collapsed copy of a
  // control the page shows elsewhere (the footer Documentation link when the header nav is folded at 393); a
  // control hidden on its own (a display:none Save, an opacity-0 row action) is simply not there.
  // Real navigation only: a nav landmark or the page header (whose links fold at narrow widths). A row's action
  // dropdown or a <details> menu in the main content is not a folded copy of the page's navigation.
  const COLLAPSIBLE = "nav, [role='navigation'], [role='menubar'], header, [role='banner']";
  const hiddenInCollapsedNav = hiddenOnly && cands.every(x => !cssVisible(x.e) && !!x.e.closest(COLLAPSIBLE));
  let pool = visibleAll;
  if (arg.ordinal === null) {
    for (const f of arg.prefer) {
      const kept = pool.filter(x => passes(x.e, f, x.name));
      if (kept.length) pool = kept;
    }
    if (arg.guard && arg.guard.words.length) {
      // a name that starts with the phrase ("Cart (2)") beats one that merely contains it ("Add to cart")
      const pre = pool.filter(x => isPrefix(x.name)), rest = pool.filter(x => !isPrefix(x.name));
      if (pre.length && rest.length) pool = [...pre, ...rest];
    }
    if (arg.preferLonger && pool.length > 1) {
      // "Hacker News" over "News": the name that covers the most intent words
      const wc = (x: { name: string }) => words(x.name).length;
      const most = Math.max(...pool.map(wc));
      pool = pool.filter(x => wc(x) === most);
    }
  }
  const info = (x: { e: Element; name: string }): CandidateInfo => {
    const u = uniqueSelector(x.e);
    const c: CandidateInfo = {
      selector: u.selector, selectorType: u.type, name: x.name, names: allNames(x.e), text: ownText(x.e).slice(0, 100),
      tag: x.e.tagName.toLowerCase(), role: roleOf(x.e), visible: isVisible(x.e),
    };
    if (arg.markCss) { try { c.marked = !!x.e.closest(arg.markCss); } catch { c.marked = false; } }
    return c;
  };
  const out: PickResult = { total, visibleCount: visibleAll.length, hiddenOnly, hiddenInCollapsedNav, ambiguous: false, chosen: null, others: [] };
  if (arg.countCss) {
    try { out.countVisible = Array.from(document.querySelectorAll(arg.countCss)).slice(0, 200).filter(e => isVisible(e, true)).length; } catch { /* unsupported selector: leave undefined */ }
  }
  if (!pool.length) return out;
  let idx = 0;
  if (arg.ordinal !== null) {
    idx = arg.ordinal === -1 ? pool.length - 1 : arg.ordinal;
    if (idx < 0 || idx >= pool.length) { out.ordinalOutOfRange = true; return out; }
  } else if (pool.length > 1) {
    out.ambiguous = true;
    if (arg.mode === "unique") {
      out.others = pool.slice(0, arg.maxOthers ?? 5).map(info).filter(c => c.selector);
      return out;
    }
  }
  const chosen = info(pool[idx]);
  if (!chosen.selector) return out;
  out.chosen = chosen;
  out.others = pool.filter((_, i) => i !== idx).slice(0, arg.maxOthers ?? 5).map(info).filter(c => c.selector);
  return out;
};

// ============================================================================
// Intent parsing
// ============================================================================

type Kind =
  | "button" | "link" | "tab" | "checkbox" | "radio" | "dropdown" | "field" | "textarea" | "menuitem"
  | "image" | "card" | "product" | "heading" | "toggle" | "section" | "article" | "form" | "any";

type LandmarkKind = "header" | "footer" | "main" | "nav" | "aside" | "form" | "section" | "article" | "dialog" | "toc" | "pagination";

type ParsedIntent = {
  raw: string;
  phrase: string;                 // after verbs / scope / ordinal / kind removed
  phraseFull: string;             // the phrase before verb stripping (so "go to site" can still match literally)
  clickVerb: boolean;
  words: string[];
  ordinal: number | null;         // 0-based; -1 last
  scope: LandmarkKind | null;     // "... in the header"
  kind: Kind;
  kindExplicit: boolean;
  kindWord: string;               // the trailing word the kind came from ("card", "tile"), "" when none
  landmark: { kind: LandmarkKind; qualifiers: string[] } | null;
  special: "cheapest" | "expensive" | "submit" | "logo" | "home" | "search" | "menu" | "language" | "theme" | "close" | null;
  brand?: string[];               // "GOV.UK logo": the words the logo link's name must carry
};

const ORDINALS: Record<string, number> = {
  first: 0, second: 1, third: 2, fourth: 3, fifth: 4, sixth: 5, seventh: 6, eighth: 7, ninth: 8, tenth: 9,
  "1st": 0, "2nd": 1, "3rd": 2, "4th": 3, "5th": 4, "6th": 5, "7th": 6, "8th": 7, "9th": 8, "10th": 9,
  last: -1, final: -1,
};

const SCOPE_WORDS: Record<string, LandmarkKind> = {
  header: "header", banner: "header", "top bar": "header", topbar: "header", masthead: "header",
  nav: "nav", navbar: "nav", navigation: "nav", menu: "nav", "navigation bar": "nav", "nav bar": "nav", "menu bar": "nav", menubar: "nav",
  footer: "footer", "page footer": "footer", "site footer": "footer",
  sidebar: "aside", aside: "aside", "side bar": "aside",
  main: "main", content: "main", "main content": "main", body: "main",
  form: "form", dialog: "dialog", modal: "dialog", popup: "dialog",
  "table of contents": "toc", toc: "toc", pagination: "pagination",
};

const LANDMARK_LAST: Record<string, LandmarkKind> = {
  header: "header", banner: "header", masthead: "header", topbar: "header",
  footer: "footer",
  main: "main", content: "main", area: "main",
  nav: "nav", navbar: "nav", navigation: "nav", menu: "nav", bar: "nav", menubar: "nav",
  sidebar: "aside", aside: "aside",
  form: "form",
  section: "section", article: "article",
  dialog: "dialog", modal: "dialog", popup: "dialog",
  contents: "toc", toc: "toc", pagination: "pagination",
};
// Words that are only landmark qualifiers (never a control name on their own).
const LANDMARK_QUALIFIERS = new Set([
  "the", "main", "primary", "secondary", "global", "site", "page", "top", "bottom", "fixed", "fixed-position", "sticky",
  "header", "footer", "article", "post", "docs", "nav", "navigation", "menu", "login", "signin", "sign-in", "signup",
  "register", "registration", "newsletter", "contact", "search", "pricing", "left", "right", "of", "table", "contents",
  "content", "area", "bar", "hero", "features", "sidebar", "mobile", "desktop", "app", "shell", "web",
]);

const KIND_WORDS: Array<[RegExp, Kind]> = [
  [/\b(?:button|btn|cta)$/, "button"],
  [/\b(?:link|anchor|hyperlink)$/, "link"],
  [/\btab$/, "tab"],
  [/\b(?:checkbox|check box|tick box)$/, "checkbox"],
  [/\b(?:radio|radio button|radio option)$/, "radio"],
  [/\b(?:dropdown|drop-down|drop down|select|selector|combobox|combo box|picker)$/, "dropdown"],
  [/\b(?:textarea|text area|comment box|message box)$/, "textarea"],
  [/\b(?:field|input|input field|text input|text field|text box|textbox|box|entry)$/, "field"],
  [/\b(?:menu item|menuitem|option)$/, "menuitem"],
  [/\b(?:image|img|picture|icon)$/, "image"],
  [/\b(?:card|tile|panel)$/, "card"],
  [/\b(?:product|item|listing)$/, "product"],
  [/\b(?:heading|headline|title)$/, "heading"],
  [/\b(?:toggle|switch)$/, "toggle"],
  [/\bsection$/, "section"],
  [/\barticle$/, "article"],
  [/\bform$/, "form"],
];

const STOP = new Set(["the", "a", "an", "to", "for", "of", "on", "at", "is", "that", "this", "it", "my", "me", "please", "some", "any"]);

function parseIntent(raw: string): ParsedIntent {
  let s = String(raw || "").toLowerCase().replace(/["'`“”‘’]/g, "").replace(/\s+/g, " ").trim();
  const out: ParsedIntent = {
    raw, phrase: "", phraseFull: "", clickVerb: false, words: [], ordinal: null, scope: null,
    kind: "any", kindExplicit: false, kindWord: "", landmark: null, special: null,
  };

  // leading verbs
  const vm = s.match(/^(?:please\s+)?(click|clicking|press|tap|hit|go to|navigate to|take me to|jump to|focus|focus on|locate|where is|show me)\s+(?:on\s+)?(?:the\s+)?/);
  if (vm) { if (/^(click|clicking|press|tap|hit)$/.test(vm[1])) out.clickVerb = true; s = s.slice(vm[0].length); }
  s = s.replace(/^(?:the|a|an)\s+/, "");

  // scope: "... in the header" / "... inside the navigation" / "... in nav"
  const scopeKeys = Object.keys(SCOPE_WORDS).sort((a, b) => b.length - a.length);
  const scopeAlts = scopeKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const scopeRe = new RegExp(
    `\\s*\\b(?:in|inside|within|on|at|from|of|under)\\s+(?:the\\s+|this\\s+)?(?:(?:main|primary|top|site|page|global)\\s+)?` +
    `(${scopeAlts})\\b\\s*(?:area|bar|region|section)?\\s*$`,
  );
  const sm = s.match(scopeRe);
  if (sm && sm.index! > 0) { out.scope = SCOPE_WORDS[sm[1]]; s = s.slice(0, sm.index).trim(); }

  // ordinal
  const toks = s.split(" ");
  for (let i = 0; i < toks.length; i++) {
    if (ORDINALS[toks[i]] !== undefined && !(toks[i] === "last" && i === toks.length - 1 && toks.length > 1 && false)) {
      out.ordinal = ORDINALS[toks[i]];
      toks.splice(i, 1);
      break;
    }
  }
  s = toks.join(" ").replace(/^(?:the|a|an)\s+/, "").trim();

  // "link to X" / "button to X" / "button for X"
  const lt = s.match(/^(button|link|tab|field|input|checkbox)\s+(?:to|for|that says|labelled|labeled|named|called|with text|with label)\s+(.+)$/);
  if (lt) {
    s = lt[2].replace(/^(?:the|a|an)\s+/, "").trim();
    out.kind = lt[1] === "input" ? "field" : (lt[1] as Kind);
    out.kindExplicit = true;
  }
  // "<container> <kind>" with nothing else: "nav button", "header link", "footer button", "sidebar button", "form button"
  const ck = s.match(/^(header|nav|navbar|navigation|footer|sidebar|aside|form|main|dialog|modal)\s+(button|btn|link|input|field|checkbox|dropdown|select)$/);
  if (ck && !out.scope) {
    out.scope = SCOPE_WORDS[ck[1]] ?? (ck[1] === "modal" ? "dialog" : "nav");
    s = ck[2];
  }

  // price specials
  if (/\b(cheapest|lowest[- ]price[d]?|least expensive)\b/.test(s)) out.special = "cheapest";
  else if (/\b(most expensive|highest[- ]price[d]?|priciest|dearest)\b/.test(s)) out.special = "expensive";

  // landmark intents (whole phrase)
  const lmWords = s.split(" ").filter(Boolean);
  const lastWord = lmWords[lmWords.length - 1] || "";
  const lmKind = LANDMARK_LAST[lastWord];
  const onlyQualifiers = lmWords.slice(0, -1).every(w => LANDMARK_QUALIFIERS.has(w) || LANDMARK_LAST[w] !== undefined);
  const isTocPhrase = /^(?:the\s+)?table of contents$/.test(s);
  const isBareMenuControl = /^(?:open|close|toggle|hamburger|user|account|profile|product|products|more|options|kebab|overflow|dropdown|context)\s+menu$/.test(s);
  if (!out.special && lmKind && onlyQualifiers && !out.kindExplicit && !isBareMenuControl && (lmWords.length <= 4 || isTocPhrase)) {
    const quals = isTocPhrase ? [] : lmWords.slice(0, -1).filter(w => w !== "the" && w !== "of");
    // "nav menu" / "navigation menu" / "navigation bar" / "menu bar": the extra landmark word is not a qualifier
    out.landmark = { kind: isTocPhrase ? "toc" : lmKind, qualifiers: quals.filter(w => !(["nav", "navigation", "menu", "bar", "navbar"].includes(w) && lmKind === "nav")) };
    if (lmKind === "nav" && lastWord === "bar") out.landmark.kind = "nav";
    out.phrase = s;
    out.phraseFull = s;
    out.words = lmWords;
    return out;
  }

  // kind (trailing word)
  if (!out.kindExplicit) {
    for (const [rx, k] of KIND_WORDS) {
      const m = s.match(rx);
      if (m && m.index !== undefined) {
        // keep single-word intents like "button", "link", "input" as kind-only
        out.kind = k; out.kindExplicit = true; out.kindWord = m[0].trim();
        s = s.slice(0, m.index).trim().replace(/\s+(?:the|a|an)$/, "").trim();
        break;
      }
    }
  }
  // "product card" / "item tile": a card of product kind, not a card named "product"
  if ((out.kind === "card" || out.kind === "product") && /^(?:product|item|listing)s?$/.test(s)) s = "";
  // "x button" -> close ; "close the dialog" -> close
  if (out.kind === "button" && /^(x|×|✕|✖|cross)$/.test(s)) { out.special = "close"; s = "close"; }
  if (/^(close|dismiss|exit)\s+(?:the\s+|this\s+)?(dialog|modal|popup|pop-up|window|overlay|banner|notification|toast|alert|panel|drawer|sheet|box)$/.test(s)) s = s.split(" ")[0];

  out.phrase = s;
  out.phraseFull = vm ? String(raw || "").toLowerCase().replace(/["'`“”‘’]/g, "").replace(/\s+/g, " ").trim().replace(/^(?:please\s+)?/, "").replace(scopeRe, "").trim().slice(0, 200) : s;
  out.words = s.split(/[^\p{L}\p{N}]+/u).filter(w => w && !STOP.has(w));
  // a click verb on a bare phrase means a clickable: "click search" is the search button, "click docs" the link
  if (out.clickVerb && out.kind === "any") { out.kind = "button"; }

  const ph = s.replace(/^(?:the|a|an)\s+/, "");
  if (!out.special) {
    if (/^(?:submit|submission)$/.test(ph) && (out.kind === "button" || out.kind === "any")) out.special = "submit";
    else if (/^(?:site |store |company |brand |page )?(?:logo|brand|logotype|wordmark|brand logo|logo image|logo link)$/.test(ph) && out.kind !== "field") out.special = "logo";
    else if (/^\S+(?:\s+\S+)?\s+logo$/.test(ph) && out.kind !== "field") {
      // "GOV.UK logo", "Acme Corp logo": the logo special, with the brand words to look for in the link's name
      out.special = "logo";
      out.brand = ph.replace(/\s+logo$/, "").split(/[^\p{L}\p{N}]+/u).filter(w => w && !STOP.has(w));
    }
    else if (/^(?:home|homepage|home page)$/.test(ph) && out.kind !== "field" && out.kind !== "button") out.special = "home";
    else if (/^(?:search|site search|search bar|search box|search input|search field)$/.test(ph) && (out.kind === "any" || out.kind === "field") && !out.clickVerb) out.special = "search";
    else if (/^(?:menu|hamburger|hamburger menu|burger|burger menu|mobile menu|navigation toggle|menu toggle|nav toggle)$/.test(ph)
      && (out.kind === "button" || out.kind === "any" || out.kind === "toggle" || out.kind === "image")) out.special = "menu";
    else if (/^(?:language|languages|language selector|language switcher|locale|change language|select language|language picker)$/.test(ph)) out.special = "language";
    else if (/^(?:theme|dark mode|light mode|dark theme|color scheme|colour scheme|theme toggle|dark mode toggle|appearance)$/.test(ph)) out.special = "theme";
    else if (/^(?:close|dismiss|x|×|✕)$/.test(ph) && (out.kind === "button" || out.kind === "any" || out.kind === "image")) out.special = "close";
  }
  return out;
}

// ============================================================================
// Name regexes and synonyms
// ============================================================================

const COMPOUNDS: Record<string, string> = { login: "log in", logout: "log out", signin: "sign in", signout: "sign out", signup: "sign up", checkout: "check out", dropdown: "drop down" };

const SYNONYM_GROUPS: string[][] = [
  ["log in", "login", "sign in", "signin", "log on", "logon"],
  ["log out", "logout", "sign out", "signout"],
  // Synonyms are the same action under another name. Pairs that cross actions were split out after a
  // cross-vendor audit: "join" (a meeting), "start free trial", "exit", "apply", "go", "forward", "unsubscribe".
  ["sign up", "signup", "register", "create account", "create an account", "create your account", "create free account",
    "create a free account", "create one", "create one free", "create one now", "join now"],
  ["search", "find", "look up", "lookup", "look for"],
  ["close", "dismiss", "x", "×", "✕", "✖", "close dialog", "close modal", "close window"],
  ["submit", "send"],
  ["menu", "hamburger", "hamburger menu", "open menu", "toggle menu", "toggle navigation", "toggle navigation menu",
    "navigation menu", "main menu", "open main menu", "open navigation", "show menu", "nav menu", "burger"],
  ["home", "homepage", "home page", "start page"],
  ["docs", "documentation"],
  ["cart", "basket", "my cart", "shopping cart", "my basket", "shopping bag", "bag"],
  ["theme", "dark mode", "light mode", "toggle theme", "toggle dark mode", "switch theme", "dark theme", "appearance", "color scheme"],
  ["language", "languages", "change language", "select language", "switch language", "locale"],
  ["pricing", "plans", "prices", "plans and pricing", "pricing plans"],
  ["buy", "buy now", "purchase", "purchase now"],
  ["pay", "pay now", "make payment"],
  ["checkout", "check out", "proceed to checkout", "go to checkout"],
  // deleting, closing and deactivating an account are three different actions (two of them reversible)
  ["delete account", "delete my account", "remove account"],
  ["close account", "close my account"],
  ["deactivate account", "deactivate my account"],
  ["cancel subscription", "end subscription"],
  ["next", "next page"],
  ["previous", "prev", "previous page"],
  ["settings", "preferences"],
  ["profile", "my profile", "account", "my account"],
  ["help", "support", "help center", "help centre"],
  ["contact", "contact us", "get in touch"],
  ["about", "about us"],
  ["try free", "try for free", "free trial", "start free", "try it free"],
  ["github", "view on github", "source code"],
  ["add to cart", "add to basket", "add to bag"],
  ["forgot password", "forgot your password", "lost password", "lost your password", "reset password", "forgotten password"],
  ["continue", "next step", "proceed"],
  ["save", "save changes"],
  ["cancel", "nevermind", "never mind"],
  ["edit", "modify", "change"],
  ["open", "view", "show"],
  ["learn more", "read more", "more info", "find out more"],
  ["download", "downloads"],
  ["skip to content", "skip to main content", "skip navigation", "skip to main"],
  ["back to site", "go to site", "back to home", "return to site", "back to homepage", "back to website", "go to website"],
  ["remove card", "remove payment method", "delete card", "remove credit card", "delete payment method", "remove payment card"],
  ["privacy", "privacy policy"],
  ["terms", "terms of service", "terms and conditions", "terms of use"],
];
// Near-synonyms that usually, not always, mean the same control: matched exactly, scored as a guess (0.65).
const WEAK_SYNONYM_GROUPS: string[][] = [
  ["exit", "close", "dismiss"],
  ["remove", "delete"],
  ["learn more", "see more"],
];
// The destructive, financial and bulk verbs, host-side copy of the list inside PICK (keep both in step).
const DANGER_VERB_LIST = ["delete", "remove", "cancel", "unsubscribe", "leave", "clear", "reset", "disconnect", "revoke", "erase",
  "deactivate", "disable", "discard", "destroy", "terminate", "end", "empty", "wipe", "archive", "transfer", "upgrade", "place",
  "approve", "pay", "buy", "purchase", "checkout"];
function weakSynonymsOf(phrase: string): string[] {
  const p = phrase.toLowerCase().trim();
  const out = new Set<string>();
  for (const g of WEAK_SYNONYM_GROUPS) if (g.includes(p)) for (const s of g) if (s !== p) out.add(s);
  return [...out];
}
// Groups where fuzzy (substring) matching over synonyms is too loose to trust.
const NO_FUZZY_SYNONYMS = new Set([
  "remove", "delete", "edit", "open", "cancel", "close", "learn more", "continue", "save", "profile", "settings",
  "help", "contact", "about", "search", "submit", "account", "options", "view", "show", "change", "modify",
]);

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "sign up" -> "sign[\s\-_]*up" (so it matches "Sign up", "Signup", "Sign-up"). Compound words are split first. */
function phraseRe(phrase: string): string {
  const ws = phrase.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(Boolean).map(w => COMPOUNDS[w] ?? w).join(" ").split(" ").filter(Boolean);
  if (!ws.length) return "";
  return ws.map(escRe).join("[\\s\\-_]*(?:(?:the|a|an|my|your|to|of|for|our)[\\s\\-_]+)?");
}
function synonymsOf(phrase: string): string[] {
  const p = phrase.toLowerCase().trim();
  const canon = p.split(/\s+/).map(w => COMPOUNDS[w] ?? w).join(" ");
  const out = new Set<string>();
  for (const g of SYNONYM_GROUPS) {
    if (g.includes(p) || g.includes(canon)) for (const s of g) if (s !== p && s !== canon) out.add(s);
  }
  return [...out];
}
const EDGE = "[\\s\\W_]*";
function exactRe(alts: string[]): RegExp | null {
  const parts = alts.map(phraseRe).filter(Boolean);
  if (!parts.length) return null;
  return new RegExp(`^${EDGE}(?:${parts.join("|")})${EDGE}$`, "i");
}
/**
 * The exact name followed by a badge count: "Cart (2)", "Inbox (12)", or "Star 1.2k" when the count sits in its own
 * element (the picker checks that with `badge`). "Save $5", "Save 20%", "Delete 2" and "Call 988" are not this.
 */
function exactBadgeRe(alts: string[]): RegExp | null {
  const parts = alts.map(phraseRe).filter(Boolean);
  if (!parts.length) return null;
  return new RegExp(`^${EDGE}(?:${parts.join("|")})(?:\\s*\\(\\s*[\\d.,]+k?\\+?\\s*\\)|\\s+[\\d.,]+k?\\+?)\\s*$`, "i");
}
function containsRe(alts: string[]): RegExp | null {
  const parts = alts.map(phraseRe).filter(Boolean);
  if (!parts.length) return null;
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${parts.join("|")})(?=$|[^\\p{L}\\p{N}])`, "iu");
}
function allWordsRe(words: string[]): RegExp | null {
  const ws = words.filter(w => w.length > 1 || /\d/.test(w));
  if (ws.length < 2) return null;
  return new RegExp(ws.map(w => `(?=.*(?:^|[^\\p{L}\\p{N}])${escRe(w)}(?=$|[^\\p{L}\\p{N}]))`).join("") + ".*", "iu");
}
function stemWordsRe(words: string[]): RegExp | null {
  if (!words.length || !words.some(w => w.length >= 3)) return null;
  const stem = (w: string) => w.replace(/(ing|ed|es|s|er|ers|ion|ions)$/, "");
  return new RegExp(words.map(w => w.length >= 3
    ? `(?=.*(?:^|[^\\p{L}\\p{N}])${escRe(stem(w).length >= 3 ? stem(w) : w)}\\p{L}*)`
    : `(?=.*(?:^|[^\\p{L}\\p{N}])${escRe(w)}(?=$|[^\\p{L}\\p{N}]))`).join("") + ".*", "iu");
}
/**
 * Inflections only, for links and buttons: "category" matches "Categories", "story" matches "Stories",
 * but "stor" never reaches "Store". A stem shorter than 4 letters is used verbatim ("news" stays "news").
 */
function inflections(w: string): string {
  const e = escRe;
  // the word itself, plus the base it was inflected from (settings -> setting, stories -> story, removed -> remove)
  const bases = new Set<string>([w]);
  if (/ies$/.test(w) && w.length >= 5) bases.add(w.slice(0, -3) + "y");
  else if (/(ings|ers)$/.test(w) && w.length >= 6) bases.add(w.slice(0, -1));
  else if (/ing$/.test(w) && w.length >= 6) { bases.add(w.slice(0, -3)); bases.add(w.slice(0, -3) + "e"); }
  else if (/(ed|es)$/.test(w) && w.length >= 5) { bases.add(w.slice(0, -2)); bases.add(w.slice(0, -1)); }
  else if (/[^s]s$/.test(w) && w.length >= 5) bases.add(w.slice(0, -1));
  const alts = new Set<string>();
  for (const b of bases) {
    if (b.length < 4) { if (b === w) alts.add(e(w)); continue; }   // "news" stays "news", never "new"
    if (b.endsWith("y")) alts.add(`${e(b.slice(0, -1))}(?:y|ies)`);
    else if (b.endsWith("e")) { alts.add(`${e(b)}(?:s|d|r|rs)?`); alts.add(`${e(b.slice(0, -1))}(?:ing|er|ers|ion|ions)`); }
    else alts.add(`${e(b)}(?:s|es|ed|ing|er|ers|ion|ions)?`);
  }
  return `(?:${[...alts].join("|")})`;
}
function inflectRe(words: string[]): RegExp | null {
  const ws = words.filter(w => w.length > 1 || /\d/.test(w));
  if (!ws.length || !ws.some(w => w.length >= 4)) return null;
  return new RegExp(ws.map(w => `(?=.*(?:^|[^\\p{L}\\p{N}])${w.length >= 4 ? inflections(w) : escRe(w)}(?=$|[^\\p{L}\\p{N}]))`).join("") + ".*", "iu");
}
/** The whole accessible name is made of intent words: "purchase credits" reaches a control named "Purchase". */
function supersetRe(words: string[]): RegExp | null {
  const ws = words.filter(w => w.length > 1 || /\d/.test(w));
  if (ws.length < 2) return null;
  return new RegExp(`^${EDGE}(?:(?:${ws.map(escRe).join("|")})[\\s\\-_]*)+${EDGE}$`, "iu");
}

// ============================================================================
// Scopes and pools (CSS)
// ============================================================================

const LANDMARK_CSS: Record<LandmarkKind, { primary: string; fallback: string }> = {
  header: { primary: "header, [role='banner']", fallback: "#header, .header, .site-header, .page-header, .masthead, .topbar, .top-bar, #masthead, #top" },
  footer: { primary: "footer, [role='contentinfo']", fallback: "#footer, .footer, .site-footer, .page-footer, #colophon" },
  main: { primary: "main, [role='main']", fallback: "#main, #content, .main, .content, #main-content, .main-content, #primary" },
  nav: {
    primary: "nav, [role='navigation'], [role='menubar']",
    fallback: ".navbar, .nav, #nav, .navigation, #navigation, .menu, #menu, .mobile-menu, .main-menu, .site-nav, .primary-menu, [role='menu']",
  },
  aside: { primary: "aside, [role='complementary'], nav[aria-label*='sidebar' i]", fallback: ".sidebar, #sidebar, .side-bar, #secondary, [class*='sidebar' i]" },
  form: { primary: "form, [role='form'], [role='search']", fallback: "" },
  section: { primary: "section", fallback: "" },
  article: { primary: "article", fallback: ".post, .article" },
  dialog: { primary: "dialog, [role='dialog'], [role='alertdialog']", fallback: ".modal, .dialog, .popup" },
  toc: {
    primary: "nav[aria-label*='contents' i], [role='navigation'][aria-label*='contents' i], .toc, #toc, .table-of-contents, #table-of-contents, "
      + "[class*='tableOfContents' i], nav[id*='toc' i], div[id*='toc' i], aside[id*='toc' i], nav[class*='toc' i], [role='navigation'][class*='toc' i]",
    fallback: "",
  },
  pagination: { primary: "nav[aria-label*='pagination' i], nav[aria-label*='pages' i], .pagination, .pager, [role='navigation'].pagination", fallback: "" },
};
const scopeCss = (k: LandmarkKind) => [LANDMARK_CSS[k].primary, LANDMARK_CSS[k].fallback].filter(Boolean).join(", ");

const BUTTON_CSS = "button, input[type='submit'], input[type='button'], input[type='reset'], input[type='image'], [role='button'], summary";
const LINK_BUTTON_CSS = "a[href][role='button'], a[href][data-slot='button'], a[href].btn, a[href].button, a[href][class*='btn'], "
  + "a[href][class*='button'], a[href][class*='cta' i]";
const LINK_CSS = "a[href], [role='link']";
// an <input> that takes typed or chosen input (not a button, not a check, not a file/range/color widget)
const INPUT_FIELD_CSS = "input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']):not([type='image'])"
  + ":not([type='checkbox']):not([type='radio']):not([type='file']):not([type='range']):not([type='color'])";
const FIELD_CSS = `${INPUT_FIELD_CSS}, textarea, select, [role='textbox'], [role='searchbox'], [role='combobox'], [contenteditable='true'], [contenteditable='']`;
const SUBMIT_CSS = "form button:not([type='button']):not([type='reset']), form input[type='submit'], form input[type='image'], "
  + "button[type='submit'], input[type='submit'], form [role='button']:not(a)";

const KIND_POOL: Record<Kind, string> = {
  button: `${BUTTON_CSS}, ${LINK_BUTTON_CSS}`,
  link: LINK_CSS,
  tab: "[role='tab']",
  checkbox: "input[type='checkbox'], [role='checkbox'], [role='switch']",
  radio: "input[type='radio'], [role='radio']",
  dropdown: "select, [role='combobox'], [role='listbox'], [aria-haspopup='listbox'], [aria-haspopup='menu'], .dropdown, [class*='dropdown' i]",
  field: FIELD_CSS,
  textarea: "textarea, [role='textbox'][aria-multiline='true'], [contenteditable='true']",
  menuitem: "[role='menuitem'], [role='menuitemcheckbox'], [role='menuitemradio'], option",
  image: "img, [role='img'], svg, picture",
  card: ".card, [class*='card' i], article, [role='article'], li.item, a[href]:has(h2, h3, h4)",
  product: ".product, [class*='product' i]:not(img):not(span):not(p):not(h1):not(h2):not(h3), [data-product], [data-price], [id^='product'], li.item",
  heading: "h1, h2, h3, h4, h5, h6, [role='heading']",
  toggle: "[role='switch'], input[type='checkbox'], button[aria-pressed], button[aria-checked], button[class*='toggle' i], button[aria-label*='toggle' i], button",
  section: "section",
  article: "article",
  form: "form, [role='form'], [role='search']",
  any: `${BUTTON_CSS}, ${LINK_CSS}, ${FIELD_CSS}, input[type='checkbox'], input[type='radio'], [role='tab'], [role='menuitem'], `
    + "[role='checkbox'], [role='radio'], [role='switch'], [role='option'], summary",
};
const KIND_ROLES: Record<Kind, AriaRole[]> = {
  button: ["button"],
  link: ["link"],
  tab: ["tab"],
  checkbox: ["checkbox", "switch"],
  radio: ["radio"],
  dropdown: ["combobox", "listbox", "button"],
  field: ["textbox", "searchbox", "combobox", "spinbutton"],
  textarea: ["textbox"],
  menuitem: ["menuitem", "menuitemcheckbox", "menuitemradio", "option"],
  image: ["img"],
  card: [],
  product: [],
  heading: ["heading"],
  toggle: ["switch", "checkbox", "button"],
  section: ["region"],
  article: ["article"],
  form: ["form", "search"],
  any: ["link", "button", "tab", "menuitem", "checkbox", "radio", "switch", "combobox", "textbox", "searchbox", "option"],
};

const FOOTERISH_CSS = "footer, [role='contentinfo'], #footer, .footer, .site-footer";
// A navigation that is the page's own: in the header, or labelled/classed as the main one.
const PRIMARY_NAV_CSS = "header nav, [role='banner'] nav, header [role='navigation'], #header nav, .header nav, .site-header nav, .masthead nav, "
  + "nav.navbar, .navbar, nav[aria-label*='main' i], nav[aria-label*='primary' i], nav[aria-label*='global' i], nav[aria-label*='site' i], "
  + "[role='navigation'][aria-label*='main' i], [role='navigation'][aria-label*='primary' i], nav[class*='main' i], nav[class*='primary' i], "
  + "nav[id*='main' i], nav[id*='primary' i], .main-menu, .primary-menu, .site-nav, .main-nav, #main-nav";

// ============================================================================
// Prefilter: the elements a kind's rungs can ever return, as one CSS pool
// ============================================================================
//
// Wider than KIND_POOL where the role unions reach further (a "button" intent also tries plain links,
// a "dropdown" tries every button). Checked in one round trip for a count and for any intent word.
// What text-exact lifts a text match to (the same list the page-side picker uses): any non-container kind can land here.
const LIFT_CSS = "a[href], button, [role='button'], [role='link'], [role='tab'], [role='menuitem'], summary, label, select, input";
const PREFILTER_POOL: Record<Kind, string> = {
  button: `${KIND_POOL.button}, ${LINK_CSS}, ${LIFT_CSS}`,
  link: `${LINK_CSS}, ${LIFT_CSS}`,
  tab: `${KIND_POOL.tab}, ${LIFT_CSS}`,
  checkbox: `${KIND_POOL.checkbox}, ${LIFT_CSS}`,
  radio: `${KIND_POOL.radio}, ${LIFT_CSS}`,
  dropdown: `${KIND_POOL.dropdown}, ${BUTTON_CSS}, [role='menu'], ${LIFT_CSS}`,
  field: `${FIELD_CSS}, [role='spinbutton'], [role='listbox'], ${LIFT_CSS}`,
  textarea: `${FIELD_CSS}, [role='spinbutton'], [role='listbox'], ${LIFT_CSS}`,
  menuitem: `${KIND_POOL.menuitem}, ${LIFT_CSS}`,
  image: `${KIND_POOL.image}, [alt], ${LIFT_CSS}`,
  card: KIND_POOL.card,
  product: KIND_POOL.product,
  heading: `${KIND_POOL.heading}, ${LIFT_CSS}`,
  toggle: `${KIND_POOL.toggle}, ${BUTTON_CSS}, [role='checkbox'], ${LIFT_CSS}`,
  section: KIND_POOL.section,
  article: KIND_POOL.article,
  form: KIND_POOL.form,
  any: `${KIND_POOL.any}, ${LIFT_CSS}`,
};
// An intent that names one of these is asking for a structure, which no control named with its other words is.
const STRUCTURE_WORDS = new Set(["table", "list", "grid", "chart", "map", "video", "gallery", "carousel", "sidebar", "section", "form", "dialog",
  "modal", "menu", "panel", "banner", "footer", "header", "nav", "navigation", "page", "sheet", "calendar", "editor", "player", "widget"]);

type PrefilterNeed = {
  literal: string[][];   // each literal phrase as tokens; a literal rung needs every token of one phrase in one element
  syn: string[][];       // each synonym as tokens
  cover: string[];       // the intent's own tokens; superset needs at least half of them in one element
  any: string[];         // provider / menu-trigger need any token at all
  container: boolean;    // container kinds match on their whole text
};
type PrefilterHit = { count: number; literal: boolean; syn: boolean; any: boolean; cover: number };

/** Page-side: how many pool elements there are, and which token sets some element carries anywhere a name can come from. */
const PREFILTER = (els: Element[], need: PrefilterNeed): PrefilterHit => {
  const out: PrefilterHit = { count: els.length, literal: !need.literal.length, syn: !need.syn.length, any: !need.any.length, cover: 0 };
  if (out.literal && out.syn && out.any) return { ...out, cover: need.cover.length };
  const ATTRS = ["id", "class", "name", "aria-label", "title", "alt", "placeholder", "value", "data-testid", "href", "type"];
  const cap = need.container ? 20000 : 3000;
  for (const e of els) {
    let blob = (e.textContent || "").slice(0, cap);
    for (const a of ATTRS) { const v = e.getAttribute(a); if (v) blob += " " + v; }
    const lb = e.getAttribute("aria-labelledby");
    if (lb) for (const id of lb.split(/\s+/)) { const n = document.getElementById(id); if (n) blob += " " + (n.textContent || ""); }
    const labels = (e as HTMLInputElement).labels;
    if (labels) for (const l of Array.from(labels)) blob += " " + (l.textContent || "");
    // an unassociated label is the text next to the box
    if (e.tagName === "INPUT" && /^(checkbox|radio)$/i.test((e as HTMLInputElement).type) && e.parentElement) blob += " " + (e.parentElement.textContent || "").slice(0, 300);
    const inner = e.querySelectorAll("[alt], [aria-label], [title]");
    for (let i = 0; i < inner.length && i < 5; i++) {
      blob += " " + (inner[i].getAttribute("alt") || "") + " " + (inner[i].getAttribute("aria-label") || "") + " " + (inner[i].getAttribute("title") || "");
    }
    blob = blob.toLowerCase();
    const has = (t: string) => blob.includes(t);
    if (!out.any && need.any.some(has)) out.any = true;
    if (!out.literal && need.literal.some(alt => alt.every(has))) out.literal = true;
    if (!out.syn && need.syn.some(alt => alt.every(has))) out.syn = true;
    const c = need.cover.filter(has).length;
    if (c > out.cover) out.cover = c;
    if (out.literal && out.syn && out.any && out.cover >= need.cover.length) break;
  }
  return out;
};

/** The substrings each rung family needs to see: intent and synonym words, compound-split, stemmed loosely. */
function prefilterNeed(q: { words: string[]; phrase: string; phraseFull: string }, syns: string[], container: boolean): PrefilterNeed {
  const stem = (w: string) => w.replace(/(ies|ing|ed|es|s|er|ers|ion|ions|y)$/, "");
  const tok = (s: string): string[] => {
    const out = new Set<string>();
    for (const w0 of s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w && !STOP.has(w))) {
      for (const w of (COMPOUNDS[w0] ? COMPOUNDS[w0].split(" ") : [w0])) {
        const st = stem(w);
        const t = st.length >= 3 ? st : w;
        if (t.length > 1 || /\d/.test(t)) out.add(t);
      }
    }
    return [...out];
  };
  const literal = [...new Set([q.phraseFull, q.phrase])].filter(Boolean).map(tok).filter(a => a.length);
  const syn = syns.map(tok).filter(a => a.length);
  const cover = tok(q.words.join(" "));
  const any = [...new Set([...literal.flat(), ...syn.flat()])];
  return { literal, syn, cover, any, container };
}

// ============================================================================
// Cascade
// ============================================================================

type Rung = {
  label: string;
  locator: Locator;
  conf: { unique: number; ordinal: number; ambiguous: number };
  pick: Partial<PickArg>;
};

function unionRole(root: Scope, roles: AriaRole[], name: RegExp | null): Locator | null {
  let loc: Locator | null = null;
  for (const r of roles) {
    const l = root.getByRole(r, name ? { name, includeHidden: true } : { includeHidden: true });
    loc = loc ? loc.or(l) : l;
  }
  return loc;
}

const red2 = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 100) / 100;

/** The most severe zone over every name the element carries (an aria-label can be benign while the value says "Pay"). */
const ZONE_SEVERITY: Record<string, number> = { green: 0, yellow: 1, red: 2, black: 3 };
function dangerZone(names: string[], classify: ((s: string) => string) | null): string | undefined {
  if (!classify) return undefined;
  let worst: string | undefined;
  for (const n of names) {
    let z: string;
    try { z = classify(n); } catch { continue; }
    if (worst === undefined || (ZONE_SEVERITY[z] ?? 0) > (ZONE_SEVERITY[worst] ?? 0)) worst = z;
  }
  return worst;
}

/**
 * AI-powered semantic element finding with accessibility-first selectors.
 * Playwright locator cascade over accessible names; selectors are verified unique.
 *
 * Examples: "the cheapest product", "login form", "main navigation", "sign up button in the header"
 */
export async function findElementByIntent(
  browser: CBrowser,
  intent: string,
  options: FindByIntentOptions = {}
): ReturnType<typeof findElementByIntentCore> {
  const res = await findElementByIntentCore(browser, intent, options);
  // The reported zone is the click gate's own verdict on the element when a real browser is behind the
  // call; the name-based zone computed during the search is the fallback (e.g. the corpus scorer).
  if (res && res.selector && res.confidence > 0) {
    const gate = (browser as unknown as { elementZone?: (s: string) => Promise<{ zone: string } | null> }).elementZone;
    if (typeof gate === "function") {
      try { const z = await gate.call(browser, res.selector); if (z) res.zone = z.zone; } catch { /* keep the name-based zone */ }
    }
  }
  return res;
}

async function findElementByIntentCore(
  browser: CBrowser,
  intent: string,
  options: FindByIntentOptions = {}
): Promise<{
  selector: string;
  confidence: number;
  description: string;
  selectorType?: SelectorStrategyType;
  accessibilityScore?: number;
  alternatives?: Array<{ selector: string; text: string; tag: string; type: SelectorStrategyType; confidence: number }>;
  aiSuggestion?: string;
  debugScreenshot?: string;
  accessibleName?: string;
  visible?: boolean;
  zone?: string;
  matchedBy?: string;
  candidates?: number;
} | null> {
  const page: Page = await browser.getPage();
  const parsed = parseIntent(intent);

  // Element-level danger: classifyAction applied to the accessible name of what was found.
  // It is private on CBrowser, so it is read structurally off the prototype.
  let classify: ((s: string) => string) | null = null;
  try {
    const mod = await import("../browser.js");
    const proto = mod.CBrowser?.prototype as unknown as { classifyAction?: (action: string, target: string, o?: { ignoreBlack?: boolean }) => string } | undefined;
    const fn = proto?.classifyAction;
    // Black-zone words describe an instruction, not a page control (same rule as the click gate).
    if (typeof fn === "function") classify = (s: string) => fn.call({}, "click", s, { ignoreBlack: true });
  } catch { /* browser module unavailable (tests); zone stays undefined */ }

  const root: Scope = parsed.scope ? page.locator(scopeCss(parsed.scope)) : page;
  const basePick: PickArg = { ordinal: parsed.ordinal, mode: "first", container: false, require: [], prefer: [], maxOthers: 5 };

  // A rung that throws (a navigation mid-search, a closed page, an unsupported selector) is skipped, and the
  // verbose miss says so, so "no match" is not mistaken for "nothing happened".
  const rungErrors: string[] = [];
  const run = async (label: string, locator: Locator, pick: Partial<PickArg>): Promise<PickResult | null> => {
    try {
      return await locator.evaluateAll(PICK, { ...basePick, ...pick } as PickArg);
    } catch (e) {
      if (rungErrors.length < 5) rungErrors.push(`${label}: ${String((e as Error)?.message ?? e).split("\n")[0].slice(0, 160)}`);
      return null;
    }
  };
  const verboseMiss = (p: Page, i: string) => verboseMissWith(p, i, rungErrors);

  const accessibilityScore = (c: CandidateInfo): number => {
    let s = 0;
    if (c.role) s += 0.3;
    if (c.name) s += 0.3;
    if (["button", "a", "input", "select", "textarea", "nav", "main", "header", "footer", "form", "aside", "dialog"].includes(c.tag)) s += 0.2;
    if (c.selectorType === "data-testid" || c.selectorType === "aria-label" || c.selectorType === "id") s += 0.2;
    return Math.min(1, Math.round(s * 100) / 100);
  };

  const build = (r: PickResult, label: string, conf: number, descriptionPrefix: string) => {
    const c = r.chosen!;
    const zone = dangerZone(c.names.length ? c.names : [c.name || c.text], classify);
    return {
      selector: c.selector,
      confidence: red2(conf),
      description: `${descriptionPrefix}: ${c.name || c.text || c.tag}`.slice(0, 120),
      selectorType: c.selectorType,
      accessibilityScore: accessibilityScore(c),
      alternatives: r.others.map(o => ({ selector: o.selector, text: (o.name || o.text).slice(0, 60), tag: o.tag, type: o.selectorType, confidence: red2(conf * 0.6) })),
      accessibleName: c.name,
      visible: c.visible,
      zone,
      matchedBy: label,
      candidates: r.visibleCount,
    };
  };

  const take = async (label: string, locator: Locator, pick: Partial<PickArg>, conf: { unique: number; ordinal: number; ambiguous: number }, desc: string) => {
    const r = await run(label, locator, pick);
    if (!r || !r.chosen) return r ? { r, res: null } : null;
    const conf1 = parsed.ordinal !== null ? conf.ordinal : (r.ambiguous ? conf.ambiguous : conf.unique);
    return { r, res: build(r, label, conf1, desc) };
  };

  // --------------------------------------------------------------------------
  // 1. Price intents
  // --------------------------------------------------------------------------
  if (parsed.special === "cheapest" || parsed.special === "expensive") {
    const wantMin = parsed.special === "cheapest";
    const PROD_CSS = ".product, .card, [data-price], [data-product], article, li, a[href], tr, [class*='product' i], [class*='item' i], [class*='card' i]";
    const pool = root.locator(`${PROD_CSS}, .price, [class*='price' i]`);
    const r = await run("price", pool, {
      ordinal: null, container: true, mode: "first",
      require: [{ textRe: "(?:[$£€¥]\\s?\\d[\\d,]*(?:\\.\\d{2})?|\\d[\\d,]*\\.\\d{2}\\s?(?:usd|eur|gbp)?|\\d[\\d,]*\\s?[$£€¥])" }],
      prefer: [],
    });
    // The pool contains nested containers; choose by price in a second pass over the visible ones.
    if (r && r.visibleCount > 0) {
      // "buy credits button for the cheapest pack": the words that name a control inside the chosen container
      const PRICE_NOISE = ["cheapest", "expensive", "most", "lowest", "highest", "least", "price", "priced", "product", "pack", "plan",
        "item", "button", "link", "one", "card", "tier", "option"];
      const ctlWords = parsed.words.filter(w => !PRICE_NOISE.includes(w));
      const ctlReSrc = ctlWords.length ? (containsRe([ctlWords.join(" ")])?.source ?? null) : null;
      const chosen = await pool.evaluateAll((els: Element[], want: { min: boolean; container: boolean; ctlRe: string | null; prod: string; ordinal: number | null }) => {
        const priceOf = (t: string) => {
          const m = t.match(/[$£€¥]\s?(\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*\.\d{2})/);
          return m ? parseFloat((m[1] || m[2]).replace(/,/g, "")) : NaN;
        };
        // the price a person would pay: text that is not struck through (<s>, <del>, line-through) comes first
        const struck = (n: Node, top: Element): boolean => {
          let p = n.parentElement;
          while (p && p !== top.parentElement) {
            if (/^(S|DEL|STRIKE)$/.test(p.tagName) || getComputedStyle(p).textDecorationLine.includes("line-through")) return true;
            p = p.parentElement;
          }
          return false;
        };
        const currentText = (el: Element): string => {
          const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let t = "", n: Node | null, i = 0;
          while ((n = w.nextNode()) && i++ < 2000) if (!struck(n, el)) t += (n.textContent || "") + " ";
          return t;
        };
        const priceOfEl = (el: Element): number => {
          const v = priceOf(currentText(el));
          return isNaN(v) ? priceOf((el as HTMLElement).innerText || "") : v;
        };
        const vis = (e: Element) => {
          if (typeof e.checkVisibility === "function" && !e.checkVisibility({ visibilityProperty: true })) return false;
          const b = e.getBoundingClientRect();
          return b.width >= 2 && b.height >= 2;
        };
        // product = smallest container that holds exactly one price text node family
        const priceEls = els.filter(e => vis(e) && e.matches(".price, [class*='price' i]") && !isNaN(priceOfEl(e)));
        const products: Element[] = [];
        const PROD = want.prod;
        if (priceEls.length) {
          for (const p of priceEls) { const c = p.closest(PROD); if (c && !products.includes(c)) products.push(c); }
        } else {
          for (const e of els) if (vis(e) && e.matches(PROD) && !isNaN(priceOfEl(e))) products.push(e);
          // keep innermost
          const set = new Set(products);
          for (const e of [...set]) if ([...set].some(o => o !== e && e.contains(o))) set.delete(e);
          products.length = 0; products.push(...set);
        }
        if (want.ctlRe) {
          const cr = new RegExp(want.ctlRe, "i");
          const ctlName = (b: Element) => ((b as HTMLElement).innerText || b.getAttribute("aria-label") || (b as HTMLInputElement).value || "").trim();
          const withCtl = products.filter(p => Array.from(p.querySelectorAll("button, a[href], input[type='submit']")).some(b => cr.test(ctlName(b))));
          products.length = 0; products.push(...withCtl);
        }
        if (!products.length) return -1;
        // rank by price; "second cheapest" is the ordinal into that ranking, out of range is null
        const ranked = products.map(p => ({ p, v: priceOfEl(p) })).filter(x => !isNaN(x.v)).sort((a, b) => want.min ? a.v - b.v : b.v - a.v);
        if (!ranked.length) return -1;
        const k = want.ordinal === null ? 0 : (want.ordinal === -1 ? ranked.length - 1 : want.ordinal);
        if (k < 0 || k >= ranked.length) return -1;
        // return the element index in els so the caller can address it
        return els.indexOf(ranked[k].p);
      }, { min: wantMin, container: true, ctlRe: ctlReSrc, prod: PROD_CSS, ordinal: parsed.ordinal }).catch(() => -1);
      if (chosen >= 0) {
        const single = pool.nth(chosen);
        if (ctlWords.length) {
          const ctlPhrase = ctlWords.join(" ");
          const cre = exactRe([ctlPhrase]) || containsRe([ctlPhrase]);
          const ctl = single.getByRole("button", { name: cre!, includeHidden: true }).or(single.getByRole("link", { name: cre!, includeHidden: true }));
          const rc = await run("price-control", ctl, { ordinal: null, container: false, mode: "first", require: [], prefer: [] });
          if (rc && rc.chosen) return build(rc, "price-control", 0.85, wantMin ? "Cheapest" : "Most expensive");
          const cre2 = containsRe([ctlPhrase])!;
          const ctl2 = single.getByRole("button", { name: cre2, includeHidden: true }).or(single.getByRole("link", { name: cre2, includeHidden: true }));
          const rc2 = await run("price-control", ctl2, { ordinal: null, container: false, mode: "first", require: [], prefer: [] });
          if (rc2 && rc2.chosen) return build(rc2, "price-control", 0.8, wantMin ? "Cheapest" : "Most expensive");
          return options.verbose ? await verboseMiss(page, intent) : null;
        }
        const rr = await run("price", single, { ordinal: null, container: true, mode: "first", require: [], prefer: [] });
        if (rr && rr.chosen) return build(rr, "price", 0.85, wantMin ? "Cheapest" : "Most expensive");
      }
    }
    return options.verbose ? await verboseMiss(page, intent) : null;
  }

  // --------------------------------------------------------------------------
  // 2. Landmark intents
  // --------------------------------------------------------------------------
  if (parsed.landmark) {
    const { kind, qualifiers } = parsed.landmark;
    const css = LANDMARK_CSS[kind];
    const quals = new Set(qualifiers);
    const inside = (k: LandmarkKind) => scopeCss(k);
    const req: PickFilter[] = [];
    const pref: PickFilter[] = [];
    const mode: "first" | "unique" = "first";
    const confUnique = 0.95;
    let confAmb = 0.55;
    let fallbackToControl = false;
    const FOOTERISH = FOOTERISH_CSS;
    const SIDEISH = "aside, [role='complementary']";

    // container qualifiers: "footer navigation", "article header", "post footer", "header navigation", "sidebar navigation"
    if (quals.has("footer")) req.push({ withinCss: inside("footer") });
    if (quals.has("header") || quals.has("top")) req.push({ withinCss: kind === "header" ? "body" : inside("header") });
    if (quals.has("article") || quals.has("post")) req.push({ withinCss: inside("article") });
    if (quals.has("sidebar")) req.push({ withinCss: inside("aside") });

    if (kind === "nav") {
      // A navigation is something with visible links in it.
      if (quals.has("secondary")) {
        req.push({ hasVisibleCss: "a[href], [role='link'], [role='menuitem']" });
        pref.push({ attrRe: "\\b(secondary|sub|utility|aux)\\b" });
        pref.push({ tagRe: "^nav$" });
        confAmb = 0.5;
      } else {
        const LINKS = "a[href], [role='link'], [role='menuitem']";
        const TOGGLE = "button[aria-expanded], button[aria-controls], button[aria-label*='menu' i], button[aria-label*='navigation' i], "
          + "[class*='hamburger' i], [class*='burger' i], button[class*='toggle' i]";
        // a navigation has visible links; one link next to a visible menu toggle is a collapsed navigation, not a navigation
        if (quals.has("footer") || quals.has("sidebar") || quals.has("header") || quals.has("top")) req.push({ hasVisibleCss: LINKS });
        else req.push({ anyOf: [{ hasVisibleCss: LINKS, minVisible: 2 }, { hasVisibleCss: LINKS, notHasVisibleCss: TOGGLE }] });
        if (!quals.has("footer") && !quals.has("sidebar")) req.push({ notWithinCss: FOOTERISH });
        if (!quals.has("sidebar") && !quals.has("secondary")) pref.push({ notWithinCss: SIDEISH });
        if (quals.has("main") || quals.has("primary") || quals.has("global") || quals.has("site") || quals.has("page")) pref.push({ attrRe: "\\b(main|primary|global|site|page)\\b" });
        pref.push({ withinCss: inside("header") });
        pref.push({ tagRe: "^nav$" });
        confAmb = 0.7;
        if (!qualifiers.length || quals.has("main") || quals.has("primary")) fallbackToControl = true;
      }
    } else if (kind === "header") {
      if (!(quals.has("article") || quals.has("post"))) pref.push({ notWithinCss: "article, section, aside, [role='article']" });
      pref.push({ notWithinCss: "main, [role='main']" });
      confAmb = 0.8;
    } else if (kind === "footer") {
      if (!(quals.has("article") || quals.has("post"))) pref.push({ notWithinCss: "article, section, aside, [role='article']" });
      pref.push({ notWithinCss: "main, [role='main']" });
      confAmb = 0.8;
    } else if (kind === "form") {
      if (quals.has("login") || quals.has("signin") || quals.has("sign-in")) {
        req.push({ anyOf: [{ hasCss: "input[type='password'], input[autocomplete='current-password']" }, { attrRe: "log-?in|sign-?in|session|auth" }, { textRe: "\\b(log|sign)[ -]?in\\b" }] });
        pref.push({ hasCss: "input[type='password']" });
      } else if (quals.has("signup") || quals.has("register") || quals.has("registration")) {
        req.push({ anyOf: [{ attrRe: "sign-?up|register|create" }, { textRe: "\\b(sign[ -]?up|register|create account)\\b" }] });
        pref.push({ hasCss: "input[type='password']" });
      } else if (quals.has("newsletter")) {
        req.push({ anyOf: [{ attrRe: "newsletter|subscribe|\\bnl\\b" }, { textRe: "newsletter|subscribe" }] });
      } else if (quals.has("contact")) {
        req.push({ anyOf: [{ attrRe: "contact|message|enquir|inquir" }, { textRe: "contact|message" }, { hasCss: "textarea" }] });
      } else if (quals.has("search")) {
        req.push({ anyOf: [{ attrRe: "search" }, { hasCss: "input[type='search'], [role='searchbox'], input[name='q'], input[name='s']" }] });
      } else if (qualifiers.length) {
        req.push({ anyOf: [{ attrRe: qualifiers.join("|") }, { textRe: qualifiers.join("|") }] });
      } else {
        pref.push({ hasCss: "input[type='password']" });
        pref.push({ withinCss: inside("main") });
        confAmb = 0.55;
      }
    } else if (kind === "section" || kind === "article") {
      if (qualifiers.length) req.push({ attrRe: qualifiers.map(escRe).join("|") });
      confAmb = 0.55;
    } else if (kind === "main") {
      pref.push({ notWithinCss: "article, aside" });
      confAmb = 0.8;
    } else if (kind === "aside") {
      if (qualifiers.length) { req.push({ attrRe: qualifiers.map(escRe).join("|") }); pref.push({ tagRe: "^nav$" }); }
      pref.push({ tagRe: "^(aside|nav)$" });
      confAmb = 0.7;
    } else if (kind === "dialog") {
      confAmb = 0.7;
    }

    const tryPool = async (selector: string, label: string, extra: Partial<PickArg> = {}) => {
      const loc = page.locator(selector);
      const r = await run(label, loc, { container: true, mode, require: req, prefer: pref, dedupeNested: false, ...extra });
      if (r && r.chosen) {
        const conf = parsed.ordinal !== null ? 0.92 : (r.ambiguous ? confAmb : confUnique);
        return build(r, label, conf, "Landmark");
      }
      return r;
    };

    if (kind === "nav") {
      // One pool: real navs and div-based menus together, so a visible mobile menu beats a hidden <nav>.
      const poolCss = css.primary + ", " + css.fallback;
      if (quals.has("secondary")) {
        // "secondary": the nav labelled so; otherwise the second of exactly two navigations.
        const probe = await run("landmark:nav-count", page.locator(poolCss), {
          container: true, mode: "unique", require: req, prefer: [{ tagRe: "^nav$" }], dedupeNested: true,
        });
        const labelledSecondary = async () => {
          const labelled = await run("landmark:nav-secondary", page.locator(poolCss), {
            container: true, mode: "first", require: [...req, { attrRe: "\\b(secondary|sub|utility|aux)\\b" }], prefer: [],
          });
          return labelled && labelled.chosen ? build(labelled, "landmark:nav", 0.9, "Landmark") : null;
        };
        if (probe && probe.chosen) {
          const labelled = await labelledSecondary();
          if (labelled) return labelled;
        } else if (probe && probe.ambiguous && probe.others.length === 2) {
          const labelled = await labelledSecondary();
          if (labelled) return labelled;
          const second = await run("landmark:nav-second", page.locator(poolCss), {
            container: true, mode: "first", ordinal: 1, require: req, prefer: [], dedupeNested: true,
          });
          if (second && second.chosen) return build(second, "landmark:nav-second", 0.6, "Landmark");
        } else if (probe && probe.ambiguous) {
          const labelled = await labelledSecondary();
          if (labelled) return labelled;
        }
        return options.verbose ? await verboseMiss(page, intent) : null;
      }
      const rn = await tryPool(poolCss, `landmark:${kind}`, { dedupeNested: false });
      if (rn && "selector" in rn) return rn;
      if (!fallbackToControl) return options.verbose ? await verboseMiss(page, intent) : null;
      // A navigation whose links are collapsed behind a toggle is still the navigation landmark: take a nav that is
      // showing (its toggle or heading is), holds links in the DOM, and is not in the footer. The toggle is a control, not a landmark.
      // ("menu" alone still means the control that opens it, which the corpus and common usage agree on.)
      if (parsed.words[parsed.words.length - 1] !== "menu") {
        const reqCollapsed: PickFilter[] = [...req.filter(f => !f.anyOf && !f.hasVisibleCss), { hasCss: "a[href], [role='link'], [role='menuitem']" }];
        const rc = await run("landmark:nav-collapsed", page.locator(poolCss), { container: true, mode, require: reqCollapsed, prefer: pref, dedupeNested: true });
        if (rc && rc.chosen) return build(rc, "landmark:nav-collapsed", parsed.ordinal !== null ? 0.85 : (rc.ambiguous ? 0.6 : 0.85), "Landmark");
      }
    } else {
      const r1 = await tryPool(css.primary, `landmark:${kind}`);
      if (r1 && "selector" in r1) return r1;
      if (css.fallback && !(r1 && (r1 as PickResult).hiddenOnly)) {
        const r2 = await tryPool(css.fallback, `landmark-fallback:${kind}`);
        if (r2 && "selector" in r2) return { ...r2, confidence: red2(Math.min(r2.confidence, 0.85)) };
      }
      if (kind === "section" && qualifiers.length) {
        // a section whose heading mentions the qualifier
        const loc = page.locator("section, [role='region'], div[id], div[class]").filter({ has: page.locator("h1, h2, h3", { hasText: new RegExp(qualifiers.map(escRe).join("|"), "i") }) });
        const r = await run("landmark:section-heading", loc, { container: true, mode: "first", require: [], prefer: [], dedupeNested: true });
        if (r && r.chosen) return build(r, "landmark:section-heading", 0.75, "Section");
      }
      return options.verbose ? await verboseMiss(page, intent) : null;
    }
    // "menu" / "navigation" with no visible nav: the control that opens it
    const menuRe = exactRe(["menu", ...synonymsOf("menu")]);
    const ctl = unionRole(root, ["button", "link"], menuRe)!;
    const r = await take("menu-control", ctl, { container: false, mode: "first", require: [], prefer: [{ tagRe: "^button$" }] },
      { unique: 0.8, ordinal: 0.8, ambiguous: 0.5 }, "Menu control");
    if (r && r.res) return r.res;
    const ctl2 = unionRole(root, ["button"], containsRe(["menu", "navigation"]))!;
    const r2 = await take("menu-control-fuzzy", ctl2,
      { container: false, mode: "first", require: [], prefer: [], guard: { words: ["menu"], maxExtra: 3, prefixMaxExtra: 3, danger: true } },
      { unique: 0.7, ordinal: 0.7, ambiguous: 0.45 }, "Menu control");
    if (r2 && r2.res) return r2.res;
    return options.verbose ? await verboseMiss(page, intent) : null;
  }

  // --------------------------------------------------------------------------
  // 3. Specials
  // --------------------------------------------------------------------------
  const kind = parsed.kind;
  const phrase = parsed.phrase.trim();
  const nameWords = parsed.words;
  const loose = ["field", "textarea", "checkbox", "radio", "dropdown", "card", "product"].includes(parsed.kind);
  // form labels are sentences, so the loose kinds tolerate longer names
  const guard = (maxExtra: number, prefixMaxExtra: number) => ({
    words: nameWords.map(w => COMPOUNDS[w] ? COMPOUNDS[w].split(" ") : [w]).flat(),
    maxExtra: loose ? maxExtra + 6 : maxExtra,
    prefixMaxExtra: loose ? prefixMaxExtra + 8 : prefixMaxExtra,
    danger: true,
  });

  if (parsed.special === "logo") {
    // A logo/brand/home link in the header; else the first header link; else a site-root link; else a logo image lifted to its link.
    // "GOV.UK logo": the link must also carry the brand words somewhere a name comes from (aria-label, alt, title, text, id/class).
    const brandRe = parsed.brand?.length ? parsed.brand.map(w => `(?=.*(?:^|[^\\p{L}\\p{N}])${escRe(w)})`).join("") + ".*" : null;
    const brandReq: PickFilter[] = brandRe ? [{ anyOf: [{ nameRe: brandRe }, { attrRe: brandRe }] }] : [];
    // Real logo evidence: an icon-only link (an image/svg and no text of its own), logo/brand/wordmark in its
    // id/class/aria-label, or, with a brand word, the brand in its name. "<svg/> Account" is a control with an
    // icon, not a logo; a "Sign in" link beside an unlinked logo image has none of these.
    // Attribute evidence (class/id/aria-label with logo/brand/wordmark) counts only outside a nav or list: "Brands"
    // (class nav-brands) and aria-label "Shop by brand" are nav items, and an icon-only or site-root link always
    // outranks attribute evidence ("Brand guidelines" beside the real logo).
    const attrEvidence: PickFilter = { attrRe: "logo|brand|wordmark", notWithinCss: "nav, [role='navigation'], ul, ol, [role='menu']" };
    const evidence: PickFilter = { anyOf: [{ iconLink: true }, attrEvidence, ...(brandRe ? [{ nameRe: brandRe }] : [])] };
    // inside the header, a text link to the site root ("Acme", an absolute wordmark href) is the brand link too,
    // unless it sits in a nav or list or is named Home - that is the home link
    const headerEvidence: PickFilter = { anyOf: [...evidence.anyOf!, { rootLink: true }] };
    const hdr = page.locator(scopeCss("header"));
    const r = await run("logo", hdr.locator("a[href]"), {
      container: false, mode: "first", require: [headerEvidence, ...brandReq],
      prefer: [{ anyOf: [{ iconLink: true }, { rootLink: true }] }, { attrRe: "logo|brand|wordmark" }, { hasCss: "img, svg" }, { rootLink: true }],
    });
    if (r && r.chosen) return build(r, "logo", r.ambiguous ? 0.75 : 0.9, "Logo");
    if (brandRe) {
      // the header's link to the site root, named by the brand
      const r1 = await run("logo-brand", hdr.locator("a[href]"),
        { container: false, mode: "first", require: [{ rootLink: true }, ...brandReq], prefer: [{ hasCss: "img, svg, picture" }] });
      if (r1 && r1.chosen) return build(r1, "logo-brand", r1.ambiguous ? 0.7 : 0.85, "Logo");
    }
    const ROOT_LINKS = "a[href='/'], a[href='./'], a[href='index.html'], a[href='/index.html'], a[aria-label*='home' i], a[class*='wordmark' i], "
      + "a[aria-label*='logo' i], a[class*='logo' i], a[id*='logo' i], a[class*='brand' i], [class*='logo' i] a[href]";
    const r2 = await run("logo-root", page.locator(ROOT_LINKS), {
      container: false, mode: "first", require: [evidence, ...brandReq], prefer: [{ attrRe: "logo|brand" }, { hasCss: "img, svg, picture" }],
    });
    if (r2 && r2.chosen) return build(r2, "logo-root", 0.8, "Logo");
    // a logo image counts only when it lifts to a link or button; an unlinked logo is not something to click
    const r3 = await run("logo-img", page.locator("img[alt*='logo' i], img[class*='logo' i], [class*='logo' i] img, svg[aria-label*='logo' i]"),
      { container: false, mode: "first", require: [{ tagRe: "^(a|button)$" }, ...brandReq], prefer: [], liftToControl: true });
    if (r3 && r3.chosen) return build(r3, "logo-img", 0.75, "Logo");
    return options.verbose ? await verboseMiss(page, intent) : null;
  }
  if (parsed.special === "home") {
    const r = await take("home-link", unionRole(root, ["link"], exactRe(["home", ...synonymsOf("home")]))!,
      { container: false, mode: "first", require: [], prefer: [{ withinCss: scopeCss("nav") }] },
      { unique: 0.92, ordinal: 0.9, ambiguous: 0.6 }, "Home link");
    if (r && r.res) return r.res;
    const r2 = await run("home-root", root.locator("a[href='/'], a[href='./'], a[href='index.html'], a[href='/index.html'], a[aria-label*='home' i]"),
      { container: false, mode: "first", require: [], prefer: [{ withinCss: scopeCss("header") }, { attrRe: "logo|brand|home" }] });
    if (r2 && r2.chosen) return build(r2, "home-root", 0.8, "Home link");
    return options.verbose ? await verboseMiss(page, intent) : null;
  }
  if (parsed.special === "search" && kind !== "button") {
    const NOT_BTN = ":not([type='submit']):not([type='button']):not([type='image']):not([type='hidden']):not([type='checkbox']):not([type='radio'])";
    const inputs = root.locator(
      `input[type='search'], [role='searchbox'], input[name='q']${NOT_BTN}, input[name='s']${NOT_BTN}, input[name*='search' i]${NOT_BTN}, `
      + `input[id*='search' i]${NOT_BTN}, input[placeholder*='search' i]${NOT_BTN}, input[aria-label*='search' i]${NOT_BTN}, `
      + `[role='search'] input${NOT_BTN}, form[action*='search' i] input${NOT_BTN}, input[class*='search' i]${NOT_BTN}, [role='search'] [contenteditable='true']`,
    );
    const r = await run("search-input", inputs, {
      container: false, mode: "first", require: [],
      prefer: [{ matchCss: "input[type='search'], [role='searchbox']" }, { attrRe: "search" }, { tagRe: "^input$" }],
    });
    if (r && r.chosen) return build(r, "search-input", r.ambiguous ? 0.7 : 0.92, "Search input");
    const trig = unionRole(root, ["button", "link"], containsRe(["search"]))!;
    const r2 = await take("search-trigger", trig, { container: false, mode: "first", require: [], prefer: [], guard: guard(3, 3) },
      { unique: 0.8, ordinal: 0.8, ambiguous: 0.5 }, "Search control");
    if (r2 && r2.res) return r2.res;
    return options.verbose ? await verboseMiss(page, intent) : null;
  }
  if (parsed.special === "submit") {
    const r = await run("submit", root.locator(SUBMIT_CSS), {
      container: false, mode: "first", require: [],
      prefer: [{ withinCss: "form:has(input[type='password'])" }, { withinCss: "main, [role='main']" }], dedupeNested: true,
    });
    if (r && r.chosen) return build(r, "submit", parsed.ordinal !== null ? 0.9 : (r.ambiguous ? 0.6 : 0.9), "Submit control");
    return options.verbose ? await verboseMiss(page, intent) : null;
  }
  if (parsed.special === "language") {
    // A language control is NAMED as one ("Change language", "Language", "Locale", "Select your language"); "Golang" and
    // "Language Arts" are not. A link or button named with a language itself ("English", "Deutsch") is the selector on
    // many sites, scored below 0.9.
    const LANG_NAME = new RegExp(
      "^\\W*(?:(?:change|select|switch|choose|set)\\s+(?:your\\s+|the\\s+|site\\s+|display\\s+)?)?"
      + "(?:language|languages|locale|site language|display language|lang)(?:\\s+(?:selector|switcher|menu|settings?|picker|options?))?\\W*$", "i");
    const LANG_WORD = new RegExp(
      "^\\W*(?:english|español|espanol|deutsch|français|francais|italiano|português|portugues|nederlands|polski|svenska|norsk|dansk|suomi|"
      + "türkçe|turkce|čeština|magyar|română|ελληνικά|русский|українська|日本語|中文|简体中文|繁體中文|한국어|العربية|हिन्दी|bahasa indonesia|"
      + "tiếng việt|ไทย)\\W*$", "i");
    const byWord = root.getByRole("link", { name: LANG_WORD, includeHidden: true }).or(root.getByRole("button", { name: LANG_WORD, includeHidden: true }));
    const rw = await run("language-name", byWord, { container: false, mode: "first", require: [], prefer: [{ withinCss: "header, footer, nav, [role='navigation']" }], dedupeNested: true });
    const loc = root.getByRole("combobox", { name: LANG_NAME, includeHidden: true })
      .or(root.getByRole("button", { name: LANG_NAME, includeHidden: true }))
      .or(root.getByRole("link", { name: LANG_NAME, includeHidden: true }))
      .or(root.locator("select[name*='lang' i], select[id*='lang' i], select[class*='lang' i], [class*='language' i] select, [class*='lang-switch' i], [aria-label*='language' i]"));
    const r = await run("language", loc, { container: false, mode: "first", require: [], prefer: [{ tagRe: "^(select|button)$" }], dedupeNested: true });
    if (r && r.chosen) return build(r, "language", r.ambiguous ? 0.7 : 0.9, "Language control");
    if (rw && rw.chosen) return build(rw, "language-name", rw.ambiguous ? 0.5 : 0.7, "Language control");
    return options.verbose ? await verboseMiss(page, intent) : null;
  }
  if (parsed.special === "theme") {
    // A theme control is NAMED as one ("Toggle dark mode", "Dark mode", "Theme", "Switch to light theme", "Appearance");
    // "Dark roast" and "Add Dark Roast to cart" are not. Whole-name match at 0.9; a class/data-attribute fallback below it.
    // a theme PHRASE anywhere in the name ("Switch between dark and light mode (currently system mode)"), or a name
    // that is just Dark / Light; the bare word in a product name ("Dark roast") is not a phrase
    const THEME_NAME = new RegExp(
      "(?:\\b(?:dark|light|night|day)\\s*(?:mode|theme)s?\\b|\\btheme\\b|\\bappearance\\b|\\bcolou?r\\s*scheme\\b"
      + "|^\\W*(?:(?:toggle|switch to|enable|use)\\s+)?(?:dark|light)\\W*$)", "i");
    const named = root.getByRole("button", { name: THEME_NAME, includeHidden: true })
      .or(root.getByRole("switch", { name: THEME_NAME, includeHidden: true }))
      .or(root.getByRole("checkbox", { name: THEME_NAME, includeHidden: true }))
      .or(root.getByRole("menuitem", { name: THEME_NAME, includeHidden: true }));
    const r = await run("theme", named, { container: false, mode: "first", require: [], prefer: [], dedupeNested: true });
    if (r && r.chosen) return build(r, "theme", r.ambiguous ? 0.7 : 0.9, "Theme control");
    const r2 = await run("theme-css", root.locator("button[class*='theme' i], button[id*='theme' i], [data-theme-toggle], button[aria-label*='theme' i], [role='switch'][aria-label*='theme' i]"),
      { container: false, mode: "first", require: [], prefer: [], dedupeNested: true });
    if (r2 && r2.chosen) return build(r2, "theme-css", r2.ambiguous ? 0.6 : 0.8, "Theme control");
    return options.verbose ? await verboseMiss(page, intent) : null;
  }
  if (parsed.special === "menu") {
    const menuExact = exactRe(["menu", ...synonymsOf("menu")]);
    const ctl = unionRole(root, ["button", "link"], menuExact)!;
    const r = await take("menu-control", ctl, { container: false, mode: "first", require: [], prefer: [{ tagRe: "^button$" }] },
      { unique: 0.9, ordinal: 0.9, ambiguous: 0.6 }, "Menu control");
    if (r && r.res) return r.res;
    // An exactly-named "Menu" control that is hidden at this width means null, unless it is display-hidden inside
    // the navigation itself (a folded or no-JS copy such as GOV.UK's <a hidden>Menu</a> inside its <nav>): then the
    // visible toggle is still the answer, capped at 0.7.
    const hiddenExact = !!(r && r.r.hiddenOnly);
    if (hiddenExact && !r!.r.hiddenInCollapsedNav) return options.verbose ? await verboseMiss(page, intent) : null;
    const capped = (res: ReturnType<typeof build> | null) => res && hiddenExact ? { ...res, confidence: red2(Math.min(res.confidence, 0.7)) } : res;
    // the navigation toggle over a search or account toggle when several buttons mention "menu"
    const ctl2 = unionRole(root, ["button"], containsRe(["menu", "navigation", "hamburger"]))!;
    const r2 = await take("menu-control-fuzzy", ctl2,
      { container: false, mode: "first", require: [], prefer: [{ notNameRe: "search|account|user|profile|language" }, { nameRe: "navigation|\\bnav\\b|hamburger|main|site|primary" }],
        guard: { words: ["menu"], maxExtra: 3, prefixMaxExtra: 3, danger: true } },
      { unique: 0.8, ordinal: 0.8, ambiguous: 0.5 }, "Menu control");
    if (r2 && r2.res) return capped(r2.res);
    // the visible text says Menu even though the accessible name (an aria-label) says something else
    const rt = await run("menu-text", root.locator(BUTTON_CSS), {
      container: false, mode: "first", require: [{ textRe: "^\\s*(?:menu|hamburger|burger|navigation)\\s*$" }], prefer: [],
    });
    if (rt && rt.chosen) return capped(build(rt, "menu-text", rt.ambiguous ? 0.5 : 0.8, "Menu control"));
    const MENU_CSS = "button[class*='hamburger' i], button[class*='burger' i], button[class*='menu-toggle' i], button[class*='navbar-toggle' i], "
      + "button[class*='nav-toggle' i], .hamburger, [aria-controls*='menu' i][aria-expanded], [aria-controls*='nav' i][aria-expanded]";
    const r3 = await run("menu-css", root.locator(MENU_CSS), { container: false, mode: "first", require: [], prefer: [] });
    if (r3 && r3.chosen) return build(r3, "menu-css", 0.7, "Menu control");
    return options.verbose ? await verboseMiss(page, intent) : null;
  }

  // --------------------------------------------------------------------------
  // 4. Kind-only intents ("button", "first link", "the input", "second tab")
  // --------------------------------------------------------------------------
  if (!nameWords.length || (!phrase && kind !== "any")) {
    if (kind === "any") return options.verbose ? await verboseMiss(page, intent) : null;
    const isField = ["field", "textarea", "dropdown", "checkbox", "radio"].includes(kind);
    const prefer: PickFilter[] = [];
    // judgment: "button" means a real button; a link-button counts only when it is the only button-like control
    if (kind === "button") prefer.push({ tagRe: "^(button|input|summary)$" }, { tagRe: "^(button|input|summary|span|div)$" });
    if (kind === "field") prefer.push({ tagRe: "^(input|textarea)$" });
    const mode: "first" | "unique" = isField || parsed.ordinal !== null ? "first" : "unique";
    const realOnly = kind === "button" && parsed.scope === "nav";
    let pool2 = realOnly ? root.locator(BUTTON_CSS) : root.locator(KIND_POOL[kind]);
    if (kind === "button" && !realOnly) {
      // "first button": real buttons; a link styled as a button counts only when no real button is visible
      const rb = await run("kind:button", root.locator(BUTTON_CSS), { container: false, mode, require: [], prefer: [] });
      if (rb && rb.chosen) return build(rb, "kind:button", parsed.ordinal !== null ? 0.92 : (rb.ambiguous ? 0.6 : 0.9), "Button");
      if (rb && rb.ambiguous) return options.verbose ? await verboseMiss(page, intent) : null;
      if (rb && rb.visibleCount > 0) return options.verbose ? await verboseMiss(page, intent) : null;
      pool2 = root.locator(LINK_BUTTON_CSS);
    }
    const PRICE_RE = "(?:[$£€¥]\\s?\\d[\\d,]*(?:\\.\\d{2})?|\\d[\\d,]*\\.\\d{2}\\s?(?:usd|eur|gbp)?|\\d[\\d,]*\\s?[$£€¥])";
    const isProd = kind === "card" || kind === "product";
    let r = isProd ? await run(`kind:${kind}`, pool2, { container: true, mode, require: [{ textRe: PRICE_RE }], prefer, dedupeNested: true }) : null;
    if (!r || !r.chosen) {
      r = await run(`kind:${kind}`, pool2, {
        container: kind === "section" || kind === "article" || isProd || kind === "form", mode, require: [], prefer, dedupeOuter: isProd,
      });
    }
    if (r && r.chosen) return build(r, `kind:${kind}`, parsed.ordinal !== null ? 0.92 : (r.ambiguous ? 0.6 : 0.9), kind[0].toUpperCase() + kind.slice(1));
    if (realOnly && parsed.ordinal === null && !(r && r.ambiguous)) {
      // "nav button" when the navigation is collapsed: the control that opens it
      const ctl = unionRole(page, ["button"], exactRe(["menu", ...synonymsOf("menu")]))!;
      const rm = await take("menu-control", ctl, { container: false, mode: "first", require: [], prefer: [] },
        { unique: 0.8, ordinal: 0.8, ambiguous: 0.5 }, "Menu control");
      if (rm && rm.res) return rm.res;
      const ctl2 = unionRole(page, ["button"], containsRe(["menu", "navigation"]))!;
      const rm2 = await take("menu-control-fuzzy", ctl2,
        { container: false, mode: "first", require: [], prefer: [], guard: { words: ["menu"], maxExtra: 3, prefixMaxExtra: 3, danger: true } },
        { unique: 0.7, ordinal: 0.7, ambiguous: 0.45 }, "Menu control");
      if (rm2 && rm2.res) return rm2.res;
    }
    return options.verbose ? await verboseMiss(page, intent) : null;
  }

  // --------------------------------------------------------------------------
  // 5. Named controls: the cascade proper
  // --------------------------------------------------------------------------
  type Query = {
    kind: Kind; phrase: string; phraseFull: string; words: string[]; kindExplicit: boolean;
    footerOk?: boolean;   // nav scope: let footer navs in (the fallback pass)
    cap?: number;         // ceiling on the confidence of anything this pass returns
  };
  const navScoped = parsed.scope === "nav";
  // "X in the navigation" never means the footer's links; a footer intent says footer.
  const NAV_NOT_FOOTER_CSS = scopeCss("nav").split(", ").map(p => `${p}:not(${FOOTERISH_CSS.split(", ").map(f => `${f} *`).join(", ")})`).join(", ");

  const namedCascade = async (q: Query) => {
    const kind = q.kind;
    const phrase = q.phrase;
    const nameWords = q.words;
    const loose = ["field", "textarea", "checkbox", "radio", "dropdown", "card", "product"].includes(kind);
    const guard = (maxExtra: number, prefixMaxExtra: number) => ({
      words: nameWords.map(w => COMPOUNDS[w] ? COMPOUNDS[w].split(" ") : [w]).flat(),
      maxExtra: loose ? maxExtra + 6 : maxExtra,
      prefixMaxExtra: loose ? prefixMaxExtra + 8 : prefixMaxExtra,
      danger: true,
      quant: !["card", "product", "section", "article", "form"].includes(kind),
      noWordsBefore: !loose && !["section", "article", "form"].includes(kind),
    });
    const literal = [...new Set([q.phraseFull, phrase].filter(Boolean))];
    const syns = synonymsOf(phrase);
    const rungs: Rung[] = [];

    // What pool a kind resolves to, as a union of Playwright role locators plus CSS where ARIA roles fall short.
    const roleUnion = (name: RegExp | null, whichRoles: AriaRole[]): Locator | null => unionRole(root, whichRoles, name);
    // For links, anchors with role=button are still links.
    const linkPool = (name: RegExp | null): Locator => {
      const l1 = roleUnion(name, ["link"])!;
      const l2 = (roleUnion(name, ["button"])!).and(root.locator("a[href]"));
      return l1.or(l2);
    };
    const buttonPool = (name: RegExp | null): Locator => {
      const b = roleUnion(name, ["button"])!;
      const lb = roleUnion(name, ["link"])!.and(root.locator(LINK_BUTTON_CSS));
      return b.or(lb);
    };
    const buttonOrLinkPool = (name: RegExp | null): Locator => roleUnion(name, ["button", "link"])!;
    const fieldPool = (name: RegExp | null): Locator => {
      const r1 = roleUnion(name, ["textbox", "searchbox", "combobox", "spinbutton", "listbox"])!;
      const lab = name ? root.getByLabel(name).or(root.getByPlaceholder(name)) : null;
      const base = root.locator(FIELD_CSS);
      let u = r1;
      if (lab) u = u.or(lab.and(base));
      return u;
    };
    // the role union, plus the labelled <input>/<select> of that css when a name is given
    const roleOrLabelled = (name: RegExp | null, whichRoles: AriaRole[], css: string): Locator =>
      roleUnion(name, whichRoles)!.or(name ? root.getByLabel(name).and(root.locator(css)) : root.locator(css));
    const poolFor = (name: RegExp | null): Locator => {
      switch (kind) {
        case "button": return buttonOrLinkPool(name);
        case "link": return linkPool(name);
        case "field": case "textarea": return fieldPool(name);
        case "dropdown": return roleOrLabelled(name, ["combobox", "listbox", "button", "menu"], "select");
        case "checkbox": return roleOrLabelled(name, ["checkbox", "switch"], "input[type='checkbox']");
        case "radio": return roleOrLabelled(name, ["radio"], "input[type='radio']");
        case "tab": return roleUnion(name, ["tab"])!;
        case "menuitem": return roleUnion(name, ["menuitem", "menuitemcheckbox", "menuitemradio", "option"])!;
        case "image": return name ? root.getByAltText(name).or(root.getByRole("img", { name, includeHidden: true })) : root.locator("img, [role='img']");
        case "heading": return roleUnion(name, ["heading"])!;
        case "toggle": return roleUnion(name, ["switch", "checkbox", "button"])!;
        case "card": case "product": case "section": case "article": case "form":
          return name ? root.locator(KIND_POOL[kind]).filter({ hasText: name }) : root.locator(KIND_POOL[kind]);
        default: return roleUnion(name, KIND_ROLES.any)!;
      }
    };
    const isContainerKind = ["card", "product", "section", "article", "form"].includes(kind);
    const preferReal: PickFilter[] = kind === "button" ? [{ tagRe: "^(button|input|summary|span|div)$" }]
      : kind === "any" ? [{ tagRe: "^(a|button|input|select|textarea|summary)$" }] : [];
    // "close button" with a dialog open: the dialog's close, not a banner's or a web component's
    if (/^(close|dismiss|x|×|✕)$/.test(phrase)) preferReal.unshift({ withinCss: "dialog, [role='dialog'], [role='alertdialog'], [aria-modal='true'], .modal" });
    const scopeRequire: PickFilter[] = navScoped && !q.footerOk ? [{ notWithinCss: FOOTERISH_CSS }] : [];
    const pickBase: Partial<PickArg> = {
      container: isContainerKind, mode: "first", require: scopeRequire, prefer: preferReal, dedupeNested: isContainerKind,
      ...(navScoped ? { markCss: PRIMARY_NAV_CSS, countCss: NAV_NOT_FOOTER_CSS } : {}),
    };

    const exactLit = exactRe(literal);
    const exactSyn = syns.length ? exactRe(syns) : null;
    const containsLit = containsRe(literal);
    const fuzzySyns = syns.filter(s => !NO_FUZZY_SYNONYMS.has(s) && s.length > 2);
    const containsSyn = fuzzySyns.length && !NO_FUZZY_SYNONYMS.has(phrase) ? containsRe(fuzzySyns) : null;
    const allWords = allWordsRe(nameWords);
    const stems = stemWordsRe(nameWords);

    const CONF_EXACT = { unique: 0.95, ordinal: 0.92, ambiguous: 0.65 };
    const CONF_STRONG = { unique: 0.9, ordinal: 0.88, ambiguous: 0.6 };
    const CONF_GOOD = { unique: 0.85, ordinal: 0.85, ambiguous: 0.6 };
    const CONF_CONTAINS = { unique: 0.8, ordinal: 0.78, ambiguous: 0.55 };

    if (kind === "link" && /^(citation|cite|reference|footnote|ref)s?$/.test(phrase)) {
      const CITE_CSS = "sup a[href], a[href^='#cite'], .reference a[href], a[href*='cite_note'], .citation a[href], a.citation, a[role='doc-noteref'], a[href^='#fn'], a[href^='#ref']";
      rungs.push({ label: "citation", locator: root.locator(CITE_CSS), conf: CONF_GOOD, pick: pickBase });
    }
    // "search button" with no control named Search: the submit of the search form
    const SEARCH_SUBMIT_CSS = "[role='search'] button, [role='search'] input[type='submit'], [role='search'] input[type='image'], "
      + "form:has(input[type='search']) button, form:has(input[type='search']) input[type='submit'], "
      + "form:has(input[name='q']) button, form:has(input[name='q']) input[type='submit'], "
      + "form:has(input[name='s']) button, form:has(input[name='s']) input[type='submit'], "
      + "form[action*='search' i] button, form[action*='search' i] input[type='submit'], "
      + "button[class*='search' i], button[id*='search' i], a[class*='search' i][href]";
    const searchSubmitRung = (): Rung => ({ label: "search-submit", locator: root.locator(SEARCH_SUBMIT_CSS), conf: CONF_GOOD,
      pick: { ...pickBase, prefer: [{ matchCss: "[type='submit'], button:not([type='button'])" }] } });
    const CONF_BADGE = { unique: 0.88, ordinal: 0.86, ambiguous: 0.6 };
    const badgeLit = exactBadgeRe(literal);
    if (kind === "button" && exactLit) {
      // A control named exactly X, button or link, beats everything fuzzy: "cart button" is the Cart link, not
      // Empty cart; "settings button" is the Settings link, not the Options kebab. The one rung above the exact link
      // is a real button that is X plus one word ("Features tour"), with the limits described below.
      rungs.push({ label: "exact", locator: buttonPool(exactLit), conf: CONF_EXACT, pick: pickBase });
      // A real button that is X followed by ONE word is X qualified ("Features tour", "Download now") and beats a
      // plain link named X; a verb-first name ("Edit profile", "Mute notifications") does not, and a paging word's
      // exact link ("Next", "Previous") is always the canonical one.
      // ... and never when X is itself destructive, financial or a sign-out: "delete button" is not Delete selected,
      // "cancel button" is not Cancel subscription, "clear button" is not Clear history.
      const paging = /^(next|previous|prev|back|forward|first|last)$/.test(phrase);
      const xDanger = nameWords.some(w => DANGER_VERB_LIST.includes(w)) || /^(sign ?out|log ?out)$/.test(phrase);
      if (containsLit && !paging && !xDanger) {
        rungs.push({ label: "contains", locator: roleUnion(containsLit, ["button"])!, conf: CONF_CONTAINS,
          pick: { ...pickBase, guard: { ...guard(0, 1), lettersOnlyExtra: true } } });
      }
      rungs.push({ label: "exact-link", locator: linkPool(exactLit), conf: CONF_STRONG, pick: pickBase });
      if (badgeLit) rungs.push({ label: "exact-badge", locator: buttonOrLinkPool(badgeLit), conf: CONF_BADGE, pick: { ...pickBase, badge: true } });
      if (exactSyn) rungs.push({ label: "exact-synonym", locator: buttonPool(exactSyn), conf: CONF_STRONG, pick: pickBase });
      if (/^search$/.test(phrase)) rungs.push(searchSubmitRung());
      if (containsLit) rungs.push({ label: "contains", locator: roleUnion(containsLit, ["button"])!, conf: CONF_CONTAINS, pick: { ...pickBase, guard: guard(2, 4) } });
      if (exactSyn) rungs.push({ label: "exact-synonym-link", locator: linkPool(exactSyn), conf: CONF_GOOD, pick: pickBase });
    } else if (exactLit) {
      rungs.push({ label: "exact", locator: poolFor(exactLit), conf: CONF_EXACT, pick: pickBase });
      if (badgeLit && !isContainerKind) rungs.push({ label: "exact-badge", locator: poolFor(badgeLit), conf: CONF_BADGE, pick: { ...pickBase, badge: true } });
      // "cancel link" with an exact Cancel BUTTON and a "Cancel subscription" link: the exact button, not the fuzzy link
      if (kind === "link") rungs.push({ label: "exact-button", locator: roleUnion(exactLit, ["button"])!, conf: CONF_GOOD, pick: pickBase });
    }
    if (exactSyn && kind !== "button") rungs.push({ label: "exact-synonym", locator: poolFor(exactSyn), conf: CONF_STRONG, pick: pickBase });
    if (kind === "button" && /^search$/.test(phrase) && !exactLit) rungs.push(searchSubmitRung());
    // Label / placeholder / title / alt for the exact phrase (fields and icon controls)
    const isFieldKind = ["field", "textarea", "dropdown", "checkbox", "radio"].includes(kind);
    if (exactLit && (isFieldKind || kind === "any")) {
      const lab = root.getByLabel(exactLit).or(root.getByPlaceholder(exactLit)).or(root.getByTitle(exactLit)).or(root.getByAltText(exactLit));
      rungs.push({ label: "label-exact", locator: kind === "any" ? lab : lab.and(root.locator(FIELD_CSS)), conf: CONF_STRONG, pick: { ...pickBase, liftToControl: true } });
    }
    // Typed fields: "email field", "password field", "search box", "url input"
    if (kind === "field" || kind === "textarea") {
      const typeMap: Record<string, string> = {
        email: "input[type='email'], input[name*='email' i], input[id*='email' i], input[autocomplete='email']",
        password: "input[type='password']",
        search: "input[type='search'], [role='searchbox'], input[name='q'], input[name*='search' i], input[placeholder*='search' i]",
        url: "input[type='url'], input[name*='url' i], input[id*='url' i], input[placeholder*='url' i]",
        website: "input[type='url'], input[name*='url' i], input[name*='website' i], input[id*='website' i]",
        phone: "input[type='tel'], input[name*='phone' i], input[autocomplete='tel']",
        tel: "input[type='tel']",
        telephone: "input[type='tel']",
        username: "input[name='username'], input[autocomplete='username'], input[id*='user' i], input[name*='user' i], input[name='login'], input[id='login']",
        user: "input[name='username'], input[autocomplete='username'], input[id*='user' i], input[name*='user' i]",
        name: "input[name='name'], input[id='name'], input[autocomplete='name'], input[name*='name' i]:not([name*='user' i])",
        date: "input[type='date']",
        number: "input[type='number']",
        message: "textarea",
        comment: "textarea, input[name*='comment' i]",
        query: "input[name='q'], input[name='query'], input[type='search']",
      };
      const key = nameWords.find(w => typeMap[w]);
      if (key) {
        // the entry's first selector is its strongest signal (input[type=email] over input[id*=email])
        rungs.push({ label: "field-type", locator: root.locator(typeMap[key]), conf: CONF_STRONG,
          pick: { ...pickBase, prefer: [{ withinCss: "form:has(input[type='password'])" }, { matchCss: typeMap[key].split(",")[0].trim() }] } });
      }
    }
    if (containsLit) rungs.push({ label: "contains", locator: poolFor(containsLit), conf: CONF_CONTAINS, pick: { ...pickBase, guard: guard(2, 4) } });
    if (containsLit && isFieldKind) {
      const lab = root.getByLabel(containsLit).or(root.getByPlaceholder(containsLit));
      rungs.push({ label: "label-contains", locator: lab.and(root.locator(FIELD_CSS)), conf: CONF_CONTAINS, pick: { ...pickBase, guard: guard(3, 5) } });
    }
    if (containsLit && isFieldKind && kind !== "textarea") {
      rungs.push({ label: "field-text", locator: root.locator(KIND_POOL[kind]), conf: { unique: 0.75, ordinal: 0.72, ambiguous: 0.5 },
        pick: { ...pickBase, require: [...scopeRequire, { nameRe: containsLit.source }], guard: guard(3, 5) } });
    }
    if (containsSyn) rungs.push({ label: "contains-synonym", locator: poolFor(containsSyn), conf: { unique: 0.75, ordinal: 0.72, ambiguous: 0.5 }, pick: { ...pickBase, guard: guard(2, 3) } });
    // OAuth providers: "google sign in button", "continue with github"
    const PROVIDERS = ["google", "github", "facebook", "apple", "microsoft", "twitter", "linkedin", "gitlab", "okta", "sso"];
    const AUTH_WORDS = ["sign", "signin", "login", "log", "continue", "with", "auth", "oauth", "connect", "register", "signup"];
    const provider = nameWords.find(w => PROVIDERS.includes(w));
    if (provider && nameWords.some(w => AUTH_WORDS.includes(w) || w === provider)) {
      rungs.push({ label: "provider", locator: buttonOrLinkPool(new RegExp(`(?:^|[^\\p{L}])${escRe(provider)}(?=$|[^\\p{L}])`, "iu")),
        conf: { unique: 0.85, ordinal: 0.8, ambiguous: 0.55 }, pick: { ...pickBase, prefer: [{ nameRe: "sign|log|continue|with|auth" }, ...preferReal] } });
    }
    if (allWords) rungs.push({ label: "all-words", locator: poolFor(allWords), conf: { unique: 0.7, ordinal: 0.68, ambiguous: 0.5 }, pick: { ...pickBase, guard: guard(2, 4) } });
    // "exit button" -> Close: usually the same control, so an exact match on a weak synonym is a labelled guess,
    // after anything that carries the phrase itself ("Exit fullscreen")
    const weakSyn = weakSynonymsOf(phrase);
    const exactWeak = weakSyn.length ? exactRe(weakSyn) : null;
    if (exactWeak) rungs.push({ label: "exact-synonym-weak", locator: poolFor(exactWeak), conf: { unique: 0.65, ordinal: 0.65, ambiguous: 0.5 }, pick: pickBase });
    // Text fallback: the phrase as visible text, lifted to the nearest control
    if (exactLit && !isContainerKind) {
      // a <label> is a control only for field intents: "message button" must not land on the Message label
      const isControl: PickFilter = { anyOf: [
        { tagRe: isFieldKind ? "^(a|button|input|select|textarea|summary|label)$" : "^(a|button|input|select|textarea|summary)$" },
        { matchCss: "[role='button'], [role='link'], [role='tab'], [role='menuitem']" },
      ] };
      rungs.push({ label: "text-exact", locator: root.getByText(exactLit), conf: { unique: 0.7, ordinal: 0.68, ambiguous: 0.5 },
        pick: { ...pickBase, liftToControl: true, require: [...scopeRequire, isControl] } });
    }
    // "<name> menu": the control that opens a menu, named without the word. Before the attribute fallback:
    // a trigger named "Account" with data-testid="account-menu" is the trigger, not an attribute coincidence.
    if ((kind === "any" || kind === "button") && /\s+menu$/.test(phrase) && !parsed.special) {
      const stripped = phrase.replace(/\s+menu$/, "");
      const re1 = exactRe([stripped]);
      if (re1) {
        rungs.push({ label: "menu-trigger", locator: buttonOrLinkPool(re1), conf: { unique: 0.85, ordinal: 0.8, ambiguous: 0.55 },
          pick: { ...pickBase, prefer: [{ matchCss: "[aria-haspopup], [aria-expanded], [aria-controls], [data-state]" }, ...preferReal] } });
      }
    }
    // Attribute fallback (ids / names / testids that carry the words): "wishlist button" -> button#wishlist
    const attrWords = nameWords.filter(w => !["button", "link", "icon"].includes(w));
    if (q.kindExplicit && attrWords.length && attrWords.every(w => w.length >= 4)) {
      let attrLoc: Locator = root.locator(kind === "any" ? KIND_POOL.any : KIND_POOL[kind]);
      for (const w of attrWords) {
        attrLoc = attrLoc.and(root.locator(
          `[id*="${w}" i], [name*="${w}" i], [data-testid*="${w}" i], [class*="${w}" i], [aria-label*="${w}" i], [title*="${w}" i], a[href*="${w}" i]`,
        ));
      }
      // no length guard (the words are in the attributes, not the name), but the danger and quantifier rules still apply
      rungs.push({ label: "attribute", locator: attrLoc, conf: { unique: 0.6, ordinal: 0.6, ambiguous: 0.4 }, pick: { ...pickBase, guard: guard(99, 99) } });
    }
    const CONF_STEM = { unique: 0.6, ordinal: 0.58, ambiguous: 0.4 };
    if (stems && (loose || kind === "tab")) rungs.push({ label: "stem", locator: poolFor(stems), conf: CONF_STEM, pick: { ...pickBase, guard: guard(3, 5) } });
    // Links and buttons take inflections only ("category link" -> "Categories"); the promiscuous phrases stay out.
    const inflect = (kind === "link" || kind === "button") && !NO_FUZZY_SYNONYMS.has(phrase) ? inflectRe(nameWords) : null;
    // (the contains guard, not the field one: "Direct link to System requirements" is not "system requirements link")
    if (inflect) rungs.push({ label: "stem", locator: poolFor(inflect), conf: CONF_STEM, pick: { ...pickBase, guard: guard(2, 4) } });
    // Last: the name is a sub-phrase of the intent ("purchase credits" -> "Purchase", "hacker news home link" -> "Hacker News").
    // The name must cover at least half of the intent's words, or "upvote button for the first story" becomes a guess at "upvote";
    // and an intent that names a structure ("pricing table") is not asking for a control named with the rest of its words.
    const superset = nameWords.some(w => STRUCTURE_WORDS.has(w)) ? null : supersetRe(nameWords);
    if (superset) {
      rungs.push({ label: "superset", locator: poolFor(superset), conf: { unique: 0.6, ordinal: 0.6, ambiguous: 0.4 },
        pick: { ...pickBase, guard: guard(2, 4), preferLonger: true, minNameWords: Math.ceil(nameWords.length / 2) } });
    }

    // One round trip before the rungs: an empty pool, or a pool none of whose elements carries the tokens a rung needs,
    // cannot match that rung. Rungs that match by CSS alone (typed fields, search submits, citations) always run.
    const pre = await root.locator(PREFILTER_POOL[kind]).evaluateAll(PREFILTER, prefilterNeed(q, syns, isContainerKind)).catch(() => null);
    if (pre && pre.count === 0) return null;
    const NEEDS_LITERAL = /^(exact|exact-link|contains|label-exact|label-contains|field-text|all-words|text-exact|attribute|stem)$/;
    const NEEDS_SYN = /^(exact-synonym|exact-synonym-link|contains-synonym)$/;
    const NEEDS_ANY = /^(provider|menu-trigger)$/;

    let sawCollapsedExact = false;
    for (const rung of rungs) {
      // the exact name exists only in a folded navigation: the visible equivalent elsewhere is a capped find,
      // but the weak rungs would be guesses
      if (sawCollapsedExact && /^(all-words|text-exact|attribute|stem|menu-trigger|superset)$/.test(rung.label)) continue;
      if (pre) {
        if (NEEDS_LITERAL.test(rung.label) && !pre.literal) continue;
        if (NEEDS_SYN.test(rung.label) && !pre.syn) continue;
        if (NEEDS_ANY.test(rung.label) && !pre.any) continue;
        if (rung.label === "superset" && pre.cover < (rung.pick.minNameWords ?? 1)) continue;
      }
      // after a collapsed exact, a contains hit must START with the phrase ("Billing help" for a folded Billing,
      // "Sign up for free" for a folded Sign up): "Cookie settings" is not the folded Settings link
      const pick = sawCollapsedExact && /^contains/.test(rung.label) && rung.pick.guard
        ? { ...rung.pick, guard: { ...rung.pick.guard, maxExtra: 0 } } : rung.pick;
      const r = await run(rung.label, rung.locator, pick);
      if (!r) continue;
      // "second remove button" with one visible Remove, "third approve button" with two "Approve request": the
      // ordinal is the answer's shape, and a looser rung ("Remove payment method", "Approve all requests") is not
      // the second or third of them. The first rung that had visible matches decides.
      if (r.ordinalOutOfRange) return null;
      if (r.chosen) {
        let conf = parsed.ordinal !== null ? rung.conf.ordinal : (r.ambiguous ? rung.conf.ambiguous : rung.conf.unique);
        if (sawCollapsedExact) conf = Math.min(conf, 0.7);
        if (q.cap !== undefined) conf = Math.min(conf, q.cap);
        // a fuzzy hit in a sidebar or breadcrumb nav, when the page has a primary one, is a guess
        if (navScoped && /^contains/.test(rung.label) && r.chosen.marked === false && (r.countVisible ?? 0) > 1) conf = Math.min(conf, 0.6);
        return build(r, rung.label, conf, rung.label === "exact" ? "Exact match" : `Match (${rung.label})`);
      }
      if (r.hiddenOnly && /^(exact|exact-synonym|exact-link|exact-synonym-link|label-exact)$/.test(rung.label)) {
        // hidden in a folded navigation: the page shows the same control elsewhere, keep looking (capped);
        // hidden on its own (display:none Save, opacity-0 row Remove or Remove link): it means null, a fuzzy visible
        // one is not it, whatever kind the hidden one was
        if (r.hiddenInCollapsedNav) sawCollapsedExact = true;
        else return null;
      }
      if (r.ambiguous && rung.pick.mode === "unique") break;
    }
    return null;
  };

  const q0: Query = { kind, phrase, phraseFull: parsed.phraseFull.trim(), words: nameWords, kindExplicit: parsed.kindExplicit };
  const first = await namedCascade(q0);
  if (first) return first;
  // "X in the navigation" with X only in a footer nav: a guess, allowed only while the page's own navigation is visible
  // (a header nav collapsed at this width means null, not the footer's copy).
  if (navScoped) {
    const primaryVisible = await page.locator(NAV_NOT_FOOTER_CSS).evaluateAll((els: Element[], primaryCss: string) => {
      const box = (x: Element) => { const b = x.getBoundingClientRect(); return b.width >= 2 && b.height >= 2; };
      const vis = (x: Element) => (typeof x.checkVisibility !== "function" || x.checkVisibility({ visibilityProperty: true })) && box(x);
      const navVisible = (e: Element) => vis(e) && Array.from(e.querySelectorAll("a[href], [role='link'], [role='menuitem']")).slice(0, 50).some(vis);
      const primary = els.filter(e => { try { return e.matches(primaryCss); } catch { return false; } });
      // the page's own navigation is visible; a breadcrumb in main does not stand in for a collapsed header nav
      return primary.length ? primary.some(navVisible) : els.some(navVisible);
    }, PRIMARY_NAV_CSS).catch(() => false);
    if (primaryVisible) {
      const fb = await namedCascade({ ...q0, footerOk: true, cap: 0.6 });
      if (fb) return fb;
    }
  }
  // "pay with card": a trailing container word that named no container was part of the name all along
  if (/^(card|tile|panel|product|item|listing)$/.test(parsed.kindWord) && !parsed.special && nameWords.length) {
    const phrase2 = `${phrase} ${parsed.kindWord}`.trim();
    const full = parsed.phraseFull.trim();
    const again = await namedCascade({
      kind: "any", phrase: phrase2, phraseFull: full.endsWith(parsed.kindWord) ? full : `${full} ${parsed.kindWord}`,
      words: phrase2.split(/[^\p{L}\p{N}]+/u).filter(w => w && !STOP.has(w)), kindExplicit: false,
    });
    if (again) return again;
  }
  return options.verbose ? await verboseMiss(page, intent) : null;
}

/** The verbose "no match" shape: the first visible interactive elements, each with a unique selector. */
async function verboseMissWith(page: Page, intent: string, errors: string[] = []) {
  let alternatives: Array<{ selector: string; text: string; tag: string; type: SelectorStrategyType; confidence: number }> = [];
  try {
    const arg: PickArg = { ordinal: null, mode: "first", container: false, require: [], prefer: [], maxOthers: 12 };
    const r = await page.locator(KIND_POOL.any).evaluateAll(PICK, arg);
    const all = r.chosen ? [r.chosen, ...r.others] : r.others;
    const words = intent.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    alternatives = all.filter(c => c.selector && (c.name || c.text)).map(c => {
      const blob = (c.name + " " + c.text).toLowerCase();
      const hits = words.filter(w => blob.includes(w)).length;
      return { selector: c.selector, text: (c.name || c.text).slice(0, 60), tag: c.tag, type: c.selectorType, confidence: Math.round((words.length ? hits / words.length * 0.6 : 0) * 100) / 100 };
    }).sort((a, b) => b.confidence - a.confidence).slice(0, 10);
  } catch { /* ignore */ }
  const list = alternatives.slice(0, 8).map(a => `  • ${a.tag}: "${a.text}" (${a.type}) → ${a.selector}`).join("\n");
  return {
    selector: "",
    confidence: 0,
    description: "No match found",
    alternatives,
    aiSuggestion: (errors.length
      ? `Note: ${errors.length} locator evaluation(s) failed during the search (${errors.join("; ")}); `
        + "the page may have navigated or closed, so this miss is not conclusive.\n\n"
      : "")
      + `No element matching "${intent}" found.\n\nAvailable interactive elements:\n${list}\n\nTry using the exact text, aria-label, or a more specific description.`,
  };
}
