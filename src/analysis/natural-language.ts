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
  + "(exact name > synonym > label/placeholder/title/alt > contains > all words > visible text > attributes > stems > sub-phrase), "
  + "scoped to a landmark when the intent says so ('in the header', 'in the navigation', 'in the footer'). "
  + "Returns a CSS selector verified to match exactly that element, plus confidence (2 decimals; >= 0.9 exact and unique, 0.7-0.85 a strong fuzzy match, "
  + "<= 0.6 a guess), accessibleName, visible, zone (the most severe green/yellow/red/black classification over every name the element carries: "
  + "CHECK zone AND visible BEFORE clicking - a data-testid selector carries no words, so the click gate cannot see them), "
  + "matchedBy (the rung), candidates (how many visible elements that rung matched), and alternatives (the other matches, each with its own unique selector). "
  + "It returns null / found:false RATHER THAN GUESSING: when nothing qualifies, when the only exact match is hidden at this viewport, "
  + "when 'X in the navigation' finds X only in a footer or the header nav is collapsed at this width, and for row-scoped intents on "
  + "table-layout pages with no landmarks ('upvote button for the first story' - say 'first upvote link' instead). "
  + "Ordinals count what a person can see ('third delete button'). verbose=true on a miss lists the first visible links, buttons and fields "
  + "with unique selectors so you can rephrase.";


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
};

type PickArg = {
  ordinal: number | null;        // 0-based; -1 = last
  mode: "first" | "unique";      // several visible, no ordinal: pick the first, or report ambiguity
  container: boolean;            // container visibility rule (a landmark is visible when a child is)
  require: PickFilter[];         // hard filters
  prefer: PickFilter[];          // soft filters, applied in order while something survives
  guard?: { words: string[]; maxExtra: number; prefixMaxExtra: number; danger: boolean };
  dedupeNested?: boolean;        // drop a candidate that contains another candidate
  dedupeOuter?: boolean;         // drop a candidate that is inside another candidate (keep the outer)
  liftToControl?: boolean;       // text matches: lift to the nearest interactive ancestor
  preferLonger?: boolean;        // no ordinal: keep only the candidates whose name has the most words
  minNameWords?: number;         // drop candidates whose name has fewer words than this
  markCss?: string;              // report whether each candidate is inside this (CandidateInfo.marked)
  countCss?: string;             // report how many visible elements match this document-wide (PickResult.countVisible)
  maxOthers?: number;
};

type PickResult = {
  total: number;
  visibleCount: number;
  hiddenOnly: boolean;
  ambiguous: boolean;
  chosen: CandidateInfo | null;
  others: CandidateInfo[];
  countVisible?: number;
};

/**
 * Page-side picker. Runs inside locator.evaluateAll(), so it must be self-contained.
 */
const PICK = (input: Element[], arg: PickArg): PickResult => {
  const CONTAINERS = new Set(["HEADER", "NAV", "FOOTER", "MAIN", "ASIDE", "SECTION", "FORM", "ARTICLE", "DIV", "UL", "OL", "TR", "TABLE", "TBODY", "DIALOG", "LI"]);
  const DANGER = ["account", "subscription", "permanently", "order", "payment", "purchase", "checkout", "delete", "remove", "cancel", "unsubscribe", "pay", "buy", "erase", "deactivate"];
  const GENERATED_ID = /^(radix-|:r|«r|_R_|:R|ember\d|mui-|headlessui-|react-aria|__|rc-|ant-|chakra-|downshift-|react-select)|[:«»]|^[a-z]{1,2}\d+$|^[0-9a-f]{8,}$/i;
  const STATE_CLASS = /^(active|open|opened|closed|hover|focus|focused|visible|hidden|show|shown|selected|current|expanded|collapsed|disabled|checked|is-|has-|js-)/;
  const HASHED_CLASS = /^(css-|sc-|_|jsx-)|[_-][a-z0-9]{6,}$|\d{3,}/i;

  const q = (v: string) => String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const esc = (s: string) => (typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(s) : s.replace(/([^\w-])/g, "\\$1"));
  // checkVisibility is missing from older engines; treat "unavailable" as "not hidden by it"
  const cssVisible = (e: Element) => typeof e.checkVisibility !== "function" || e.checkVisibility({ visibilityProperty: true });
  // SVG elements carry an SVGAnimatedString, not a string
  const classNameOf = (e: Element): string => {
    const c: string | SVGAnimatedString | undefined = (e as unknown as { className?: string | SVGAnimatedString }).className;
    return typeof c === "string" ? c : (c?.baseVal ?? "");
  };

  // ---- visibility: what a person can see at this width ----
  function leafVisible(e: Element): boolean {
    if (!e || !e.isConnected) return false;
    if (!cssVisible(e)) return false;
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const sx = window.scrollX, sy = window.scrollY;
    const docW = Math.max(document.documentElement.scrollWidth, document.documentElement.clientWidth);
    if (r.right + sx <= 0 || r.bottom + sy <= 0 || r.left + sx >= docW) return false;
    const cs = getComputedStyle(e);
    if (cs.clip && cs.clip !== "auto" && /rect\((0|1)px?,?\s*(0|1)px?/.test(cs.clip)) return false;
    if (cs.clipPath && /inset\(50%\)/.test(cs.clipPath)) return false;
    let p = e.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
      const pcs = getComputedStyle(p);
      if (pcs.position === "fixed") break;
      if (/(hidden|clip|auto|scroll)/.test(pcs.overflowX + " " + pcs.overflowY)) {
        const pr = p.getBoundingClientRect();
        if (pr.width < 1 || pr.height < 1) return false;
        if (r.right <= pr.left || r.left >= pr.right || r.bottom <= pr.top || r.top >= pr.bottom) return false;
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
  function uniq(sel: string, el: Element): boolean {
    try { const m = document.querySelectorAll(sel); return m.length === 1 && m[0] === el; } catch { return false; }
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
  function uniqueSelector(e: Element): { selector: string; type: SelectorStrategyType } {
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
    for (const [s, t] of tries) if (uniq(s, e)) return { selector: s, type: t };
    // Structural path: walk up until unique, anchoring at the nearest stable id/testid.
    const parts: string[] = [part(e)];
    let cur: Element | null = e.parentElement;
    let guardN = 0;
    while (cur && cur !== document.documentElement && guardN++ < 40) {
      const sel = parts.join(" > ");
      // a lone positional part ("a:nth-of-type(5)") is unique only by accident: anchor it to its parent
      if (uniq(sel, e) && !(parts.length === 1 && /:nth-of-type/.test(sel))) return { selector: sel, type: "nth-of-type" };
      const anchor = anchorFor(cur);
      if (anchor) {
        const s2 = anchor + " > " + sel;
        if (uniq(s2, e)) return { selector: s2, type: "nth-of-type" };
      }
      if (cur.tagName === "BODY") { parts.unshift("body"); break; }
      parts.unshift(part(cur));
      cur = cur.parentElement;
    }
    const full = parts.join(" > ");
    if (uniq(full, e)) return { selector: full, type: "nth-of-type" };
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
    return true;
  }
  const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
  function guardOk(name: string): boolean {
    const g = arg.guard; if (!g) return true;
    const nw = words(name);
    const iw = g.words;
    if (g.danger && !iw.some(w => DANGER.includes(w))) {
      for (const d of DANGER) if (nw.includes(d)) return false;
    }
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
  const out: PickResult = { total, visibleCount: visibleAll.length, hiddenOnly, ambiguous: false, chosen: null, others: [] };
  if (arg.countCss) {
    try { out.countVisible = Array.from(document.querySelectorAll(arg.countCss)).slice(0, 200).filter(e => isVisible(e, true)).length; } catch { /* unsupported selector: leave undefined */ }
  }
  if (!pool.length) return out;
  let idx = 0;
  if (arg.ordinal !== null) {
    idx = arg.ordinal === -1 ? pool.length - 1 : arg.ordinal;
    if (idx < 0 || idx >= pool.length) return out;
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
  ["sign up", "signup", "register", "create account", "create an account", "create your account", "create free account",
    "create a free account", "create one", "create one free", "create one now", "join", "join now", "start free trial"],
  ["search", "find", "look up", "lookup", "look for"],
  ["close", "dismiss", "exit", "x", "×", "✕", "✖", "close dialog", "close modal", "close window"],
  ["submit", "send", "go", "apply"],
  ["menu", "hamburger", "hamburger menu", "open menu", "toggle menu", "toggle navigation", "toggle navigation menu",
    "navigation menu", "main menu", "open main menu", "open navigation", "show menu", "nav menu", "burger"],
  ["home", "homepage", "home page", "start page"],
  ["docs", "documentation", "documents"],
  ["cart", "basket", "my cart", "shopping cart", "my basket", "shopping bag", "bag"],
  ["theme", "dark mode", "light mode", "toggle theme", "toggle dark mode", "switch theme", "dark theme", "appearance", "color scheme"],
  ["language", "languages", "change language", "select language", "switch language", "locale"],
  ["pricing", "plans", "prices", "plans and pricing", "pricing plans"],
  ["buy", "buy now", "purchase", "purchase now"],
  ["pay", "pay now", "make payment"],
  ["checkout", "check out", "proceed to checkout", "go to checkout"],
  ["delete account", "delete my account", "close account", "close my account", "deactivate account", "deactivate my account", "remove account"],
  ["unsubscribe", "cancel subscription", "end subscription"],
  ["next", "next page", "forward"],
  ["previous", "prev", "previous page"],
  ["settings", "preferences", "options"],
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
  ["remove", "delete"],
  ["edit", "modify", "change"],
  ["open", "view", "show"],
  ["learn more", "read more", "more info", "find out more", "see more"],
  ["download", "downloads", "get the app"],
  ["skip to content", "skip to main content", "skip navigation", "skip to main"],
  ["back to site", "go to site", "back to home", "return to site", "back to homepage", "back to website", "go to website"],
  ["remove card", "remove payment method", "delete card", "remove credit card", "delete payment method", "remove payment card"],
  ["privacy", "privacy policy"],
  ["terms", "terms of service", "terms and conditions", "terms of use"],
];
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

// An intent that names one of these is asking for a structure, which no control named with its other words is.
const STRUCTURE_WORDS = new Set(["table", "list", "grid", "chart", "map", "video", "gallery", "carousel", "sidebar", "section", "form", "dialog",
  "modal", "menu", "panel", "banner", "footer", "header", "nav", "navigation", "page", "sheet", "calendar", "editor", "player", "widget"]);

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
    const proto = mod.CBrowser?.prototype as unknown as { classifyAction?: (action: string, target: string) => string } | undefined;
    const fn = proto?.classifyAction;
    if (typeof fn === "function") classify = (s: string) => fn.call({}, "click", s);
  } catch { /* browser module unavailable (tests); zone stays undefined */ }

  const root: Scope = parsed.scope ? page.locator(scopeCss(parsed.scope)) : page;
  const basePick: PickArg = { ordinal: parsed.ordinal, mode: "first", container: false, require: [], prefer: [], maxOthers: 5 };

  const run = async (label: string, locator: Locator, pick: Partial<PickArg>): Promise<PickResult | null> => {
    try {
      return await locator.evaluateAll(PICK, { ...basePick, ...pick } as PickArg);
    } catch {
      return null;
    }
  };

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
      const chosen = await pool.evaluateAll((els: Element[], want: { min: boolean; container: boolean; ctlRe: string | null; prod: string }) => {
        const priceOf = (t: string) => {
          const m = t.match(/[$£€¥]\s?(\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*\.\d{2})/);
          return m ? parseFloat((m[1] || m[2]).replace(/,/g, "")) : NaN;
        };
        const vis = (e: Element) => {
          if (typeof e.checkVisibility === "function" && !e.checkVisibility({ visibilityProperty: true })) return false;
          const b = e.getBoundingClientRect();
          return b.width >= 2 && b.height >= 2;
        };
        // product = smallest container that holds exactly one price text node family
        const priceEls = els.filter(e => vis(e) && e.matches(".price, [class*='price' i]") && !isNaN(priceOf((e as HTMLElement).innerText || "")));
        const products: Element[] = [];
        const PROD = want.prod;
        if (priceEls.length) {
          for (const p of priceEls) { const c = p.closest(PROD); if (c && !products.includes(c)) products.push(c); }
        } else {
          for (const e of els) if (vis(e) && e.matches(PROD) && !isNaN(priceOf((e as HTMLElement).innerText || ""))) products.push(e);
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
        let best = -1, bestP = want.min ? Infinity : -Infinity;
        products.forEach((p, i) => {
          const v = priceOf((p as HTMLElement).innerText || "");
          if (isNaN(v)) return;
          if (want.min ? v < bestP : v > bestP) { bestP = v; best = i; }
        });
        // return the element index in els so the caller can address it
        return best >= 0 ? els.indexOf(products[best]) : -1;
      }, { min: wantMin, container: true, ctlRe: ctlReSrc, prod: PROD_CSS }).catch(() => -1);
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
    const hdr = page.locator(scopeCss("header"));
    const r = await run("logo", hdr.locator("a[href]"), {
      container: false, mode: "first", require: [{ attrRe: "logo|brand|home|^$" }],
      prefer: [{ attrRe: "logo|brand" }, { hasCss: "img, svg" }, { attrRe: "home" }],
    });
    if (r && r.chosen) return build(r, "logo", r.ambiguous ? 0.75 : 0.9, "Logo");
    const ROOT_LINKS = "a[href='/'], a[href='./'], a[href$='://'], a[href='index.html'], a[href='/index.html'], a[aria-label*='home' i], "
      + "a[aria-label*='logo' i], a[class*='logo' i], a[id*='logo' i], a[class*='brand' i], [class*='logo' i] a[href]";
    const r2 = await run("logo-root", page.locator(ROOT_LINKS), {
      container: false, mode: "first", require: [], prefer: [{ attrRe: "logo|brand" }, { hasCss: "img, svg, picture" }],
    });
    if (r2 && r2.chosen) return build(r2, "logo-root", 0.8, "Logo");
    const r3 = await run("logo-img", page.locator("img[alt*='logo' i], img[class*='logo' i], [class*='logo' i] img, svg[aria-label*='logo' i]"),
      { container: false, mode: "first", require: [], prefer: [], liftToControl: true });
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
    const loc = root.getByRole("combobox", { name: /lang|locale/i, includeHidden: true })
      .or(root.getByRole("button", { name: /lang|locale/i, includeHidden: true }))
      .or(root.getByRole("link", { name: /^\s*(lang|language|languages)\s*$/i, includeHidden: true }))
      .or(root.locator("select[name*='lang' i], select[id*='lang' i], select[class*='lang' i], [class*='language' i] select, [class*='lang-switch' i], [aria-label*='language' i]"));
    const r = await run("language", loc, { container: false, mode: "first", require: [], prefer: [{ tagRe: "^(select|button)$" }], dedupeNested: true });
    if (r && r.chosen) return build(r, "language", r.ambiguous ? 0.7 : 0.9, "Language control");
    return options.verbose ? await verboseMiss(page, intent) : null;
  }
  if (parsed.special === "theme") {
    const loc = root.getByRole("button", { name: /theme|dark|light mode|colou?r scheme|appearance/i, includeHidden: true })
      .or(root.getByRole("switch", { name: /theme|dark|light/i, includeHidden: true }))
      .or(root.getByRole("checkbox", { name: /theme|dark|light/i, includeHidden: true }))
      .or(root.locator("button[class*='theme' i], button[id*='theme' i], [data-theme-toggle], button[aria-label*='theme' i], button[aria-label*='dark' i]"));
    const r = await run("theme", loc, { container: false, mode: "first", require: [], prefer: [], dedupeNested: true });
    if (r && r.chosen) return build(r, "theme", r.ambiguous ? 0.7 : 0.9, "Theme control");
    return options.verbose ? await verboseMiss(page, intent) : null;
  }
  if (parsed.special === "menu") {
    const ctl = unionRole(root, ["button", "link"], exactRe(["menu", ...synonymsOf("menu")]))!;
    const r = await take("menu-control", ctl, { container: false, mode: "first", require: [], prefer: [{ tagRe: "^button$" }] },
      { unique: 0.9, ordinal: 0.9, ambiguous: 0.6 }, "Menu control");
    if (r && r.res) return r.res;
    if (r && r.r.hiddenOnly) return options.verbose ? await verboseMiss(page, intent) : null;
    const ctl2 = unionRole(root, ["button"], containsRe(["menu", "navigation", "hamburger"]))!;
    const r2 = await take("menu-control-fuzzy", ctl2,
      { container: false, mode: "first", require: [], prefer: [], guard: { words: ["menu"], maxExtra: 3, prefixMaxExtra: 3, danger: true } },
      { unique: 0.8, ordinal: 0.8, ambiguous: 0.5 }, "Menu control");
    if (r2 && r2.res) return r2.res;
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
    if (kind === "button" && exactLit) {
      // Real buttons (and link-buttons) first: exact, synonyms, then a fuzzy real button beats an exact plain link.
      rungs.push({ label: "exact", locator: buttonPool(exactLit), conf: CONF_EXACT, pick: pickBase });
      if (exactSyn) rungs.push({ label: "exact-synonym", locator: buttonPool(exactSyn), conf: CONF_STRONG, pick: pickBase });
      if (containsLit) rungs.push({ label: "contains", locator: roleUnion(containsLit, ["button"])!, conf: CONF_CONTAINS, pick: { ...pickBase, guard: guard(2, 4) } });
      rungs.push({ label: "exact-link", locator: linkPool(exactLit), conf: CONF_STRONG, pick: pickBase });
      if (exactSyn) rungs.push({ label: "exact-synonym-link", locator: linkPool(exactSyn), conf: CONF_GOOD, pick: pickBase });
    } else if (exactLit) rungs.push({ label: "exact", locator: poolFor(exactLit), conf: CONF_EXACT, pick: pickBase });
    if (exactSyn && kind !== "button") rungs.push({ label: "exact-synonym", locator: poolFor(exactSyn), conf: CONF_STRONG, pick: pickBase });
    // "search button" with no control named Search: the submit of the search form
    if (kind === "button" && /^search$/.test(phrase)) {
      const SEARCH_SUBMIT_CSS = "[role='search'] button, [role='search'] input[type='submit'], [role='search'] input[type='image'], "
        + "form:has(input[type='search']) button, form:has(input[type='search']) input[type='submit'], "
        + "form:has(input[name='q']) button, form:has(input[name='q']) input[type='submit'], "
        + "form:has(input[name='s']) button, form:has(input[name='s']) input[type='submit'], "
        + "form[action*='search' i] button, form[action*='search' i] input[type='submit'], "
        + "button[class*='search' i], button[id*='search' i], a[class*='search' i][href]";
      rungs.push({ label: "search-submit", locator: root.locator(SEARCH_SUBMIT_CSS), conf: CONF_GOOD,
        pick: { ...pickBase, prefer: [{ matchCss: "[type='submit'], button:not([type='button'])" }] } });
    }
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
        rungs.push({ label: "field-type", locator: root.locator(typeMap[key]), conf: CONF_STRONG,
          pick: { ...pickBase, prefer: [{ withinCss: "form:has(input[type='password'])" }] } });
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
    // Text fallback: the phrase as visible text, lifted to the nearest control
    if (exactLit && !isContainerKind) {
      const isControl: PickFilter = { anyOf: [
        { tagRe: "^(a|button|input|select|textarea|summary|label)$" },
        { matchCss: "[role='button'], [role='link'], [role='tab'], [role='menuitem']" },
      ] };
      rungs.push({ label: "text-exact", locator: root.getByText(exactLit), conf: { unique: 0.7, ordinal: 0.68, ambiguous: 0.5 },
        pick: { ...pickBase, liftToControl: true, require: [...scopeRequire, isControl] } });
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
      rungs.push({ label: "attribute", locator: attrLoc, conf: { unique: 0.6, ordinal: 0.6, ambiguous: 0.4 }, pick: { ...pickBase, guard: { ...guard(4, 6), words: [] } } });
    }
    const CONF_STEM = { unique: 0.6, ordinal: 0.58, ambiguous: 0.4 };
    if (stems && (loose || kind === "tab")) rungs.push({ label: "stem", locator: poolFor(stems), conf: CONF_STEM, pick: { ...pickBase, guard: guard(3, 5) } });
    // "<name> menu": the control that opens a menu, named without the word
    if ((kind === "any" || kind === "button") && /\s+menu$/.test(phrase) && !parsed.special) {
      const stripped = phrase.replace(/\s+menu$/, "");
      const re1 = exactRe([stripped]);
      if (re1) {
        rungs.push({ label: "menu-trigger", locator: buttonOrLinkPool(re1), conf: { unique: 0.85, ordinal: 0.8, ambiguous: 0.55 },
          pick: { ...pickBase, prefer: [{ matchCss: "[aria-haspopup], [aria-expanded], [aria-controls], [data-state]" }, ...preferReal] } });
      }
    }
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

    let sawHiddenExact = false;
    for (const rung of rungs) {
      // an exact match that is merely hidden makes the weak rungs guesses: skip them
      if (sawHiddenExact && /^(all-words|text-exact|attribute|stem|menu-trigger|superset)$/.test(rung.label)) continue;
      const r = await run(rung.label, rung.locator, rung.pick);
      if (!r) continue;
      if (r.chosen) {
        let conf = parsed.ordinal !== null ? rung.conf.ordinal : (r.ambiguous ? rung.conf.ambiguous : rung.conf.unique);
        if (sawHiddenExact) conf = Math.min(conf, 0.7);
        if (q.cap !== undefined) conf = Math.min(conf, q.cap);
        // a fuzzy hit in a sidebar or breadcrumb nav, when the page has a primary one, is a guess
        if (navScoped && /^contains/.test(rung.label) && r.chosen.marked === false && (r.countVisible ?? 0) > 1) conf = Math.min(conf, 0.6);
        return build(r, rung.label, conf, rung.label === "exact" ? "Exact match" : `Match (${rung.label})`);
      }
      if (r.hiddenOnly && /^(exact|exact-synonym|exact-link|exact-synonym-link|label-exact)$/.test(rung.label)) sawHiddenExact = true;
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
async function verboseMiss(page: Page, intent: string) {
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
    aiSuggestion: `No element matching "${intent}" found.\n\nAvailable interactive elements:\n${list}\n\nTry using the exact text, aria-label, or a more specific description.`,
  };
}
