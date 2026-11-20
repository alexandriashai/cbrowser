/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Constitutional safety
 *
 * Classifying actions and elements into zones, the red-zone checks for points, drags and keystrokes, and the audit log.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import type { Locator, ElementHandle } from "playwright";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { ClickResult, AuditEntry, ActionZone } from "../types.js";
import type { CBrowser } from "../browser.js";

// =========================================================================
// Constitutional Safety
// =========================================================================

export function classifyAction(this: CBrowser, action: string, target: string, options: { ignoreBlack?: boolean } = {}): ActionZone {
  const lowerTarget = target.toLowerCase();

  // =========================================================================
  // BLACK ZONE - Security violations, never execute
  // ignoreBlack: the black patterns describe an INSTRUCTION ("bypass the login"), not a control on a
  // page. classifyElement skips them so page text like "SQL injection course" is not a violation and a
  // red label that happens to sit next to a black word still classifies red.
  // =========================================================================
  const blackPatterns = [
    /bypass/i,
    /inject/i,
    /\bhack\b/i,
    /exploit/i,
    /sql\s*injection/i,
    /xss/i,
  ];

  if (!options.ignoreBlack && blackPatterns.some(p => p.test(lowerTarget))) {
    return "black";
  }

  // =========================================================================
  // For non-click actions, use simple classification
  // =========================================================================
  if (action !== "click") {
    if (action === "fill") return "yellow";
    return "green";
  }

  // =========================================================================
  // RED ZONE - Truly dangerous actions requiring --force
  // These patterns indicate financial commitment or irreversible destruction
  // =========================================================================

  // Financial transactions - always Red
  const financialPatterns = [
    /\b(buy|purchase)\s*(now|this|item)?/i,
    /\bpay\s*(\$|€|£|\d)/i,           // "Pay $50", "Pay 50"
    /\bpay\s*(now|with)/i,             // "Pay now", "Pay with card"
    /\bcheckout\b/i,
    /\bplace\s*order/i,
    /\bcomplete\s*(order|purchase|payment)/i,
    /\bsubmit\s*(order|payment)/i,
    /\bproceed\s*to\s*(checkout|payment)/i,
  ];

  if (financialPatterns.some(p => p.test(lowerTarget))) {
    return "red";
  }

  // Destructive actions - context matters
  const destructivePatterns = [
    /\bdelete\s*(my\s*)?(account|profile|data|all)/i,
    /\bremove\s*(my\s*)?(account|profile|permanently)/i,
    /\bpermanently\s*(delete|remove)/i,
    /\bclose\s*(my\s*)?account/i,
    /\bdeactivate\s*(my\s*)?account/i,
    /\berase\s*(all|my\s*data)/i,
  ];

  if (destructivePatterns.some(p => p.test(lowerTarget))) {
    return "red";
  }

  // High-impact actions on named objects: destroying something that is not an account, moving money out,
  // revoking access, deploying to production, signing out everywhere. Verb then object, at most a few words
  // apart ("Delete this repository"), so form paths read verb-first also match ("delete 12 projects").
  const OWNED = "(?:repositor(?:y|ies)|repos?|projects?|workspaces?|organi[sz]ations?|orgs?|teams?|servers?|instances?|clusters?|databases?|buckets?|domains?|sites?|stores?|environments?|apps?|applications?|channels?|pipelines?|deployments?|volumes?|snapshots?|backups?)";
  const highImpactPatterns = [
    new RegExp(`\\b(?:delete|destroy|drop)\\b(?:\\s+[\\w.-]+){0,3}?\\s+(?:${OWNED}|users?|members?)\\b`, "i"),
    // "remove" also means "take off a list": not when followed by "from" ("Remove project from favorites").
    new RegExp(`\\bremove\\b(?:\\s+[\\w.-]+){0,3}?\\s+${OWNED}\\b(?!\\s+from\\b)`, "i"),
    /\b(?:delete|remove|destroy|erase|wipe)\s+(?:everything|all\s+(?:data|files|items|projects|repositories|records|messages|users|members))\b/i,
    /\bwipe\b(?:\s+\w+){0,2}?\s+(?:device|phone|disk|drive|data)\b/i,
    /\bfactory\s*reset\b|\breset\s+(?:to\s+)?factory\b|\breset\s+(?:all\s+data|everything)\b/i,
    /\bempty\s+(?:the\s+)?(?:trash|recycle\s+bin|bin)\b/i,
    /\bterminate\b(?:\s+\w+){0,2}?\s+(?:instances?|servers?|subscriptions?|accounts?|contracts?|clusters?)\b/i,
    /\b(?:cancel|end|terminate)\s+(?:my\s+|your\s+|the\s+)?(?:subscription|membership|plan|contract)\b/i,
    /\brevoke\b(?:\s+\w+){0,2}?\s+(?:access|tokens?|keys?|certificates?|sessions?|permissions?|all)\b/i,
    /\b(?:suspend|ban)\b(?:\s+\w+){0,2}?\s+(?:users?|members?|accounts?)\b/i,
    /\b(?:transfer|withdraw|send|wire)\b(?:\s+\w+){0,2}?\s+(?:funds|money|payments?|ownership)\b(?!\s+(?:reminders?|requests?|links?|details|methods?|info|history|settings))/i,
    /\brefund\b(?:\s+\w+){0,2}?\s+(?:orders?|payments?|charges?)\b|\bissue\s+(?:a\s+)?refund\b/i,
    /\bmerge\s+(?:this\s+)?(?:pull\s+request|pr|branch)\b/i,
    /\bdeploy\b(?:\s+\w+){0,2}?\s+to\s+(?:production|prod|live)\b/i,
    /\b(?:sign|log)\s*out\s+(?:of\s+)?(?:all\s+(?:devices|sessions|browsers)|every\s*where|everywhere|all)\b/i,
    /\bdisable\s+(?:two[- ]factor|2fa|mfa|multi[- ]factor)\b/i,
    /\bleave\s+(?:the\s+|this\s+)?(?:organi[sz]ation|workspace)\b/i,
  ];

  if (highImpactPatterns.some(p => p.test(lowerTarget))) {
    return "red";
  }

  // Confirmation of dangerous actions
  const dangerousConfirmPatterns = [
    /\bconfirm\s*(purchase|order|payment|deletion|removal)/i,
    /\byes,?\s*(delete|remove|pay|purchase|buy)/i,
    /\bi\s*agree.*(purchase|payment|terms)/i,
  ];

  if (dangerousConfirmPatterns.some(p => p.test(lowerTarget))) {
    return "red";
  }

  // =========================================================================
  // YELLOW ZONE - Safe interactive actions (explicit benign patterns)
  // These are common actions that sound dangerous but are actually safe
  // =========================================================================

  // Benign "submit" actions
  const benignSubmitPatterns = [
    /\bsubmit\s*(search|review|feedback|form|comment|email|message|query)/i,
    /\bsubmit\b(?!.*(?:order|payment|purchase))/i,  // "submit" without financial
  ];

  // Benign "remove" actions
  const benignRemovePatterns = [
    /\bremove\s*(filter|item|from\s*cart|selection|tag|label)/i,
    /\bremove\b(?!.*(?:account|profile|permanently|all))/i,
  ];

  // Benign "delete" actions
  const benignDeletePatterns = [
    /\bdelete\s*(filter|item|from\s*cart|selection|draft|message)/i,
    /\bdelete\b(?!.*(?:account|profile|permanently|all|my))/i,
  ];

  // Benign "confirm" actions
  const benignConfirmPatterns = [
    /\bconfirm\s*(email|selection|password|choice|age|identity)/i,
    /\bconfirm\b(?!.*(?:purchase|order|payment|deletion|removal))/i,
  ];

  // Check all benign patterns - if matched, safe to proceed as Yellow
  const allBenignPatterns = [
    ...benignSubmitPatterns,
    ...benignRemovePatterns,
    ...benignDeletePatterns,
    ...benignConfirmPatterns,
  ];

  if (allBenignPatterns.some(p => p.test(lowerTarget))) {
    return "yellow";
  }

  // =========================================================================
  // FALLBACK - Default to Yellow for any click action
  // This ensures we don't over-block; clicks are logged but proceed
  // =========================================================================
  return "yellow";
}

export async function classifyElement(
  this: CBrowser,
  element: Locator | ElementHandle,
  options: { implicitSubmit?: boolean; skipHit?: boolean } = {},
): Promise<{ zone: ActionZone; tag: string; label: string; descriptors: string[]; position?: { x: number; y: number } } | null> {
  type Info = { tag: string; label: string; descriptors: string[]; position: { x: number; y: number } | null };
  type Arg = { implicitSubmit: boolean; skipHit: boolean };
  const inPage = (node: Element, arg: Arg): Info => {
    const norm = (s: string | null | undefined, max: number) => (s || "").replace(/\s+/g, " ").trim().slice(0, max);
    const INTERACTIVE = "a,button,input,select,textarea,summary,label,[role='button'],[role='link'],[role='menuitem'],[role='menuitemcheckbox'],[role='menuitemradio'],[role='tab'],[role='option'],[role='checkbox'],[role='radio'],[role='switch'],[onclick]";
    // Native checkboxes, radios and selects choose a value; role=checkbox/radio/switch likewise. NOT role=option or
    // menu items: command palettes (cmdk / shadcn Command) render every command as role=option and run it on click.
    const CHOICE = "input[type=checkbox],input[type=radio],select,option,[role='checkbox'],[role='radio'],[role='switch']";
    const BUTTON_INPUT = /^(submit|button|reset|image)$/i;
    const isTextField = (el: Element) => el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable ||
      (el.tagName === "INPUT" && !BUTTON_INPUT.test((el as HTMLInputElement).type || "") && !/^(checkbox|radio)$/i.test((el as HTMLInputElement).type || ""));
    const isData = (el: Element) => isTextField(el) || el.matches(CHOICE);
    // Composed-tree walk: a slotted node's parent is its slot, a shadow root's parent is its host, and
    // a same-origin frame's document hangs under its <iframe>.
    const up = (e: Element): Element | null => {
      const slot = (e as Element & { assignedSlot: HTMLSlotElement | null }).assignedSlot;
      if (slot) return slot;
      if (e.parentElement) return e.parentElement;
      const r = e.getRootNode() as ShadowRoot | Document;
      if ((r as ShadowRoot).host) return (r as ShadowRoot).host;
      try { return (e.ownerDocument.defaultView?.frameElement as Element | null) ?? null; } catch { return null; }
    };
    const composedClosest = (e: Element | null): Element | null => { for (let n = e; n; n = up(n)) if (n.matches(INTERACTIVE)) return n; return null; };
    const composedContains = (a: Element, b: Element) => { for (let n: Element | null = b; n; n = up(n)) if (n === a) return true; return false; };
    // The element a pointer at viewport (x, y) actually reaches: beneath anything not inside `within`
    // (a cookie bar, a loading overlay), into open shadow roots and same-origin frames.
    const deepAt = (x: number, y: number, within: Element | null): Element | null => {
      const hitRoot = (within ? within.getRootNode() : document) as Document | ShadowRoot;
      const stack = hitRoot.elementsFromPoint(x, y);
      let e: Element | null = within ? (stack.find(s => composedContains(within, s)) ?? null) : (stack[0] ?? null);
      let ox = 0, oy = 0;
      for (let i = 0; e && i < 12; i++) {
        const sr = (e as Element & { shadowRoot: ShadowRoot | null }).shadowRoot;
        if (sr) {
          const inner = sr.elementFromPoint(x - ox, y - oy);
          if (inner && inner !== e) { e = inner; continue; }
          // The point is on the host's own light-DOM text, rendered through a <slot>: that slot's control
          // is what the click activates.
          const host: Element = e;
          const slot = Array.from(sr.querySelectorAll("slot")).find(s => (s as HTMLSlotElement).assignedNodes().some(n => n.parentNode === host));
          if (slot) { e = slot; break; }
        }
        if (e.tagName === "IFRAME" || e.tagName === "FRAME") {
          let d: Document | null = null;
          try { d = (e as HTMLIFrameElement).contentDocument; } catch { d = null; }
          if (d) {
            const r = e.getBoundingClientRect();
            ox += r.left + e.clientLeft; oy += r.top + e.clientTop;
            const inner = d.elementFromPoint(x - ox, y - oy);
            if (inner) { e = inner; continue; }
          }
        }
        break;
      }
      return e;
    };
    // Something that is not an interactive element can still act as one: a <div> with a click listener
    // shows it by a pointer cursor, a tabindex or an inline pointer handler.
    const clickable = (el: Element) => {
      if (el.hasAttribute("tabindex")) return true;
      for (const a of Array.from(el.attributes)) if (/^on(click|mousedown|mouseup|pointerdown|pointerup|touchstart|touchend)$/i.test(a.name)) return true;
      // cursor is inherited: the clickable element is where a pointer cursor STARTS, not every child of it
      // (the icon inside a pointer-cursor menu item is not the item).
      try {
        const cs = (n: Element) => (n.ownerDocument.defaultView || window).getComputedStyle(n).cursor;
        if (cs(el) !== "pointer") return false;
        const p = up(el);
        return !p || cs(p) !== "pointer";
      } catch { return false; }
    };
    // An element's own text: its visible text minus the text of controls nested inside it. A text node counts
    // when no interactive element sits between it and `el` (el itself need not be an interactive element).
    const ownText = (el: Element): string => {
      if (!el.querySelector(INTERACTIVE)) return (el as HTMLElement).innerText;
      const parts: string[] = [];
      const walker = (el.ownerDocument || document).createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const p = n.parentElement;
        if (!p) continue;
        const c = p.closest(INTERACTIVE);
        if (!c || c === el || !el.contains(c)) parts.push(n.textContent || "");
      }
      return parts.join(" ");
    };
    // What a pointer on `e` activates: its nearest interactive element; else the nearest ancestor that shows a
    // click affordance (a pointer-cursor <div> menu item whose icon was hit); else the nearest element whose own
    // text is label-sized (a listener-only item, "Delete account"), never a prose paragraph. Kept strictly inside
    // `stopAt` when given.
    const activatorOf = (e: Element, stopAt: Element | null): Element | null => {
      const inside = (n: Element) => !stopAt || (n !== stopAt && composedContains(stopAt, n));
      const c = composedClosest(e);
      if (c) return inside(c) ? c : null;
      for (let n: Element | null = e, i = 0; n && i < 8 && inside(n); n = up(n), i++) {
        if (n === n.ownerDocument.body || n === n.ownerDocument.documentElement) break;
        if (clickable(n)) return n;
      }
      for (let n: Element | null = e, i = 0; n && i < 3 && inside(n); n = up(n), i++) {
        if (n === n.ownerDocument.body || n === n.ownerDocument.documentElement) break;
        const tx = norm(ownText(n), 200);
        if (tx && tx.length <= 60) return n;
      }
      return null;
    };
    // For an element that is already the deepest one at a known point (a coordinate click, a drag end, the
    // focused element), the thing activated may be an ancestor without an interactive role.
    const control = composedClosest(node) || (arg.skipHit ? activatorOf(node, null) : null) || node;
    const isContainer = !composedClosest(node);
    const viaActivator = control !== node && isContainer;
    // Where a click on this element lands: the centre of its first box clipped to the viewport (what
    // Playwright clicks), after scrolling it into view if none of it is visible. Not computed for a key
    // press or an element that is already the deepest one at a known point.
    let position: { x: number; y: number } | null = null;
    const hitControl = ((): Element | null => {
      if (arg.implicitSubmit || arg.skipHit) return null;
      const firstBox = () => node.getClientRects()[0] ?? node.getBoundingClientRect();
      const clip = (b: DOMRect) => ({ l: Math.max(b.left, 0), t: Math.max(b.top, 0), r: Math.min(b.right, innerWidth), b: Math.min(b.bottom, innerHeight) });
      let box = firstBox();
      if (!box || box.width === 0 || box.height === 0) return null;
      let v = clip(box);
      if (v.r <= v.l || v.b <= v.t) {
        node.scrollIntoView({ block: "center", inline: "center" });
        box = firstBox();
        v = clip(box);
      }
      if (v.r <= v.l || v.b <= v.t) return null;
      const px = (v.l + v.r) / 2;
      const py = (v.t + v.b) / 2;
      position = { x: px - box.left - node.clientLeft, y: py - box.top - node.clientTop };
      const deep = deepAt(px, py, node);
      if (!deep || deep === node) return null;
      const c = activatorOf(deep, node);
      return c && c !== control ? c : null;
    })();
    const nodes = [node, control, hitControl].filter((e, i, a): e is Element => !!e && a.indexOf(e) === i);
    const root = node.getRootNode() as Document | ShadowRoot;
    const byIdIn = (el: Element, id: string): Element | null => {
      const r = el.getRootNode() as Document | ShadowRoot;
      return (r as Document).getElementById ? (r as Document).getElementById(id) : (root as Document).getElementById?.(id) ?? null;
    };
    const labelledBy = (el: Element) => (el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean)
      .map(id => byIdIn(el, id)).filter(Boolean).map(n => (n as HTMLElement).innerText || n!.textContent || "").join(" ");
    const descriptors: string[] = [];
    const push = (s: string | null | undefined, max = 200) => { const v = norm(s, max); if (v && !descriptors.includes(v)) descriptors.push(v); };
    // A form's action names the consequence ("/checkout", "/account/close"). Paths name the object
    // first; the patterns read verb first ("close account"), so push both orders. A submitter's
    // formaction overrides the form's action for that button.
    const pushPath = (path: string | null) => {
      if (!path) return;
      let p = path;
      try { p = decodeURIComponent(p); } catch { /* keep raw */ }
      const words = norm(p.replace(/^[a-z]+:\/\/[^/]+/i, "").replace(/[/\-_.?=&+%#]+/g, " "), 120);
      push(words);
      push(words.split(" ").reverse().join(" "));
    };
    const pushSubmit = (form: HTMLFormElement, submitter: Element | null) => {
      const fa = submitter?.getAttribute("formaction");
      pushPath(fa ? fa : form.getAttribute("action"));
    };
    // The DOM's own submit test: a <button> with no or an invalid type is a submit button.
    const isSubmitter = (el: Element) =>
      (el.tagName === "BUTTON" && (el as HTMLButtonElement).type === "submit") ||
      (el.tagName === "INPUT" && /^(submit|image)$/.test((el as HTMLInputElement).type));
    const pushControl = (el: Element) => {
      push(el.getAttribute("aria-label"));
      push(labelledBy(el));
      if (el.tagName === "BUTTON" || (el.tagName === "INPUT" && BUTTON_INPUT.test((el as HTMLInputElement).type || ""))) {
        push((el as HTMLInputElement).value);
      }
      if (el.tagName === "INPUT" && (el as HTMLInputElement).type === "image") push(el.getAttribute("alt"));
      if (el.tagName === "IMG") push((el as HTMLImageElement).alt);
      // <label for> names a button or submit input too.
      const labels = (el as HTMLInputElement).labels;
      if (labels) for (const l of Array.from(labels)) push((l as HTMLElement).innerText);
      push(el.getAttribute("title"));
    };
    // A descendant's name belongs to `el` only when no other control sits between them: the icon inside
    // a button labels the button; the icon button inside a clickable row does not label the row.
    const owns = (el: Element, d: Element) => { const c = composedClosest(d); return !c || c === el || composedContains(c, el); };
    const pushBelow = (el: Element) => {
      Array.from(el.querySelectorAll("[aria-label]")).filter(d => owns(el, d)).slice(0, 5).forEach(d => push(d.getAttribute("aria-label")));
      Array.from(el.querySelectorAll("svg title")).filter(d => owns(el, d)).slice(0, 5).forEach(d => push(d.textContent));
      Array.from(el.querySelectorAll("img[alt]")).filter(d => owns(el, d)).slice(0, 5).forEach(d => push((d as HTMLImageElement).alt));
      const sr = (el as Element & { shadowRoot: ShadowRoot | null }).shadowRoot;
      if (sr) {
        push(sr.textContent, 120);
        Array.from(sr.querySelectorAll("img[alt],[aria-label]")).slice(0, 5).forEach(d => push(d.getAttribute("alt") || d.getAttribute("aria-label")));
      }
      // A control inside a shadow root shows its host's light-DOM text through a <slot>.
      Array.from(el.querySelectorAll("slot")).slice(0, 5).forEach(s =>
        push((s as HTMLSlotElement).assignedNodes({ flatten: true }).map(n => n.textContent || "").join(" "), 120));
    };
    let label = "";
    let submitsVia = "";
    const nameOf = (el: Element): string => {
      const lb = norm(labelledBy(el), 200);
      if (lb) return lb;
      const al = el.getAttribute("aria-label");
      if (al && al.trim()) return norm(al, 200);
      if (el.tagName === "INPUT" && (el as HTMLInputElement).value && BUTTON_INPUT.test((el as HTMLInputElement).type || "")) return norm((el as HTMLInputElement).value, 200);
      if (el.tagName === "INPUT" && (el as HTMLInputElement).type === "image" && el.getAttribute("alt")) return norm(el.getAttribute("alt"), 200);
      if (el.tagName === "IMG" && (el as HTMLImageElement).alt) return norm((el as HTMLImageElement).alt, 200);
      if (isData(el)) {
        const labels = (el as HTMLInputElement).labels;
        const lt = labels ? Array.from(labels).map(l => (l as HTMLElement).innerText).join(" ") : "";
        return norm(lt || el.getAttribute("placeholder") || el.getAttribute("name"), 200);
      }
      const t = norm((el as HTMLElement).innerText, 200);
      if (t) return t;
      const slotted = Array.from(el.querySelectorAll("slot")).map(s => (s as HTMLSlotElement).assignedNodes({ flatten: true }).map(n => n.textContent || "").join(" ")).join(" ");
      const below = norm(slotted, 200) || el.querySelector("[aria-label]")?.getAttribute("aria-label") || el.querySelector("svg title")?.textContent
        || (el.querySelector("img[alt]") as HTMLImageElement | null)?.alt
        || (el as Element & { shadowRoot: ShadowRoot | null }).shadowRoot?.textContent;
      if (below && below.trim()) return norm(below, 200);
      const lbl = (el as HTMLInputElement).labels;
      if (lbl && lbl.length) return norm(Array.from(lbl).map(l => (l as HTMLElement).innerText).join(" "), 200);
      return norm(el.getAttribute("title"), 200);
    };
    for (const el of nodes) {
      const isControl = (el === control && (!isContainer || viaActivator)) || el === hitControl;
      if (!isData(el)) {
        // Judged by its own names: a control, or something acting as one. A control's own text counts in
        // full; an acting-as-control element's own text by its opening 120 characters (a long div-button is
        // labelled by how it starts). A plain container or inert text is not a label: the hit-test above
        // judges the control a click on it lands on.
        const isLeaf = !el.querySelector(INTERACTIVE);
        // The resolved element as a leaf is judged by how its text starts, affordance or not: a refused inert
        // heading costs one force retry, a missed listener-only "Delete account" div cannot be undone.
        const actsAsControl = isControl || (el === node && isLeaf) || clickable(el);
        if (actsAsControl) {
          pushControl(el);
          push(norm(ownText(el), isControl ? 300 : 120), 300);
          pushBelow(el);
        } else if (el === node) {
          // A listener-only row that also holds a help link or an info button: its own opening text.
          push(norm(ownText(el), 120), 120);
        }
        const form = (el as HTMLButtonElement).form as HTMLFormElement | null | undefined;
        if (form && isSubmitter(el)) pushSubmit(form, el);
      } else if (arg.implicitSubmit && el.tagName !== "TEXTAREA") {
        // Enter in a field submits its form through the form's default button.
        const form = (el as HTMLInputElement).form;
        if (form) {
          // The default button is the first submit button in tree order; if it is disabled, Enter submits nothing.
          const def = Array.from(form.elements).find(isSubmitter) ?? null;
          if (!(def && (def as HTMLButtonElement).disabled)) pushSubmit(form, def);
          if (def && !(def as HTMLButtonElement).disabled) {
            pushControl(def);
            pushBelow(def);
            push((def as HTMLElement).innerText);
            submitsVia = nameOf(def);
          }
        }
      }
      if (!label) label = nameOf(el);
    }
    if (submitsVia) label = `${label} (Enter submits "${submitsVia}")`;
    if (hitControl) label = `${label} (click lands on <${hitControl.tagName.toLowerCase()}> "${nameOf(hitControl)}")`;
    return { tag: control.tagName.toLowerCase(), label, descriptors, position: isContainer ? position : null };
  };
  const arg = { implicitSubmit: !!options.implicitSubmit, skipHit: !!options.skipHit };
  let info: Info | null = null;
  try {
    info = "count" in element
      ? await (element as Locator).evaluate(inPage, arg, { timeout: 3000 })
      : await (element as ElementHandle).evaluate(inPage as (node: Node, a: Arg) => Info, arg);
  } catch {
    return null;
  }
  if (!info) return null;
  let zone: ActionZone = "yellow";
  for (const d of info.descriptors) zone = this.maxZone(zone, this.classifyAction("click", d, { ignoreBlack: true }));
  return { zone, tag: info.tag, label: info.label, descriptors: info.descriptors, position: info.position ?? undefined };
}

export async function gateElement(
  this: CBrowser,
  verb: string,
  selector: string,
  element: Locator | ElementHandle,
  stringZone: ActionZone,
  force: boolean | undefined,
  options: { implicitSubmit?: boolean } = {},
): Promise<{ zone: ActionZone; target?: ClickResult["target"]; refusal?: ClickResult; position?: { x: number; y: number } }> {
  const el = await this.classifyElement(element, options);
  if (!el) return { zone: stringZone };
  const target = { tag: el.tag, label: el.label };
  const zone = this.maxZone(stringZone, el.zone);
  if (el.zone === "red" && !force) {
    this.audit(verb, selector, "red", "blocked");
    return {
      zone,
      target,
      refusal: {
        success: false,
        screenshot: await this.screenshot(),
        message: `Red zone action requires --force: ${verb} "${selector}" resolves to <${el.tag}> "${el.label}"`,
        zone,
        target,
      },
    };
  }
  return { zone, target, position: el.position };
}

export async function deepElementAt(this: CBrowser, x: number, y: number): Promise<ElementHandle | null> {
  const page = await this.getPage();
  const h = await page.evaluateHandle(([px, py]) => {
    let e: Element | null = document.elementFromPoint(px, py);
    let ox = 0, oy = 0;
    for (let i = 0; e && i < 12; i++) {
      const sr = (e as Element & { shadowRoot: ShadowRoot | null }).shadowRoot;
      if (sr) {
        const inner = sr.elementFromPoint(px - ox, py - oy);
        if (inner && inner !== e) { e = inner; continue; }
        const host: Element = e;
        const slot = Array.from(sr.querySelectorAll("slot")).find(s => (s as HTMLSlotElement).assignedNodes().some(n => n.parentNode === host));
        if (slot) { e = slot; break; }
      }
      if (e.tagName === "IFRAME" || e.tagName === "FRAME") {
        let d: Document | null = null;
        try { d = (e as HTMLIFrameElement).contentDocument; } catch { d = null; }
        if (d) {
          const r = e.getBoundingClientRect();
          ox += r.left + e.clientLeft; oy += r.top + e.clientTop;
          const inner = d.elementFromPoint(px - ox, py - oy);
          if (inner) { e = inner; continue; }
        }
      }
      break;
    }
    return e;
  }, [x, y]);
  const el = h.asElement();
  if (!el) await h.dispose();
  return el;
}

export async function elementZone(this: CBrowser, selector: string): Promise<{ zone: ActionZone; label: string } | null> {
  const page = await this.getPage();
  const loc = page.locator(selector).first();
  if ((await loc.count().catch(() => 0)) === 0) return null;
  const el = await this.classifyElement(loc, { skipHit: true });
  return el ? { zone: el.zone, label: el.label } : null;
}

export async function pointRedZone(this: CBrowser, x: number, y: number, force?: boolean): Promise<string | null> {
  if (force) return null;
  const handle = await this.deepElementAt(x, y);
  if (!handle) return null;
  try {
    const el = await this.classifyElement(handle, { skipHit: true });
    if (el?.zone !== "red") return null;
    this.audit("click", `at:${x},${y}`, "red", "blocked");
    return `Red zone action requires --force: click at ${x},${y} lands on <${el.tag}> "${el.label}"`;
  } finally {
    await handle.dispose().catch(() => {});
  }
}

export async function dragRedZone(this: CBrowser, source: string, target: string, force?: boolean): Promise<string | null> {
  if (force) return null;
  const page = await this.getPage();
  const pointOf = async (sel: string) => {
    const loc = page.locator(sel).first();
    await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    // Playwright presses the centre of the element's first box (a wrapped inline element's first line),
    // clipped to the viewport.
    const p = await loc.evaluate((el: Element) => {
      const r = el.getClientRects()[0] ?? el.getBoundingClientRect();
      const l = Math.max(r.left, 0), rr = Math.min(r.right, innerWidth);
      const tp = Math.max(r.top, 0), bt = Math.min(r.bottom, innerHeight);
      return rr > l && bt > tp ? { x: (l + rr) / 2, y: (tp + bt) / 2 } : null;
    }, undefined, { timeout: 3000 }).catch(() => null);
    const at = p ? await this.deepElementAt(p.x, p.y) : null;
    return at ?? (await loc.elementHandle({ timeout: 3000 }).catch(() => null));
  };
  const a = await pointOf(source);
  const b = a ? await pointOf(target) : null;
  if (!a || !b) { await a?.dispose(); return null; }
  const common = (await page.evaluateHandle(([x, y]) => {
    const up = (e: Element): Element | null => {
      const slot = (e as Element & { assignedSlot: HTMLSlotElement | null }).assignedSlot;
      if (slot) return slot;
      if (e.parentElement) return e.parentElement;
      const r = e.getRootNode() as ShadowRoot | Document;
      if ((r as ShadowRoot).host) return (r as ShadowRoot).host;
      try { return (e.ownerDocument.defaultView?.frameElement as Element | null) ?? null; } catch { return null; }
    };
    const chain = new Set<Element>();
    for (let n: Element | null = x as Element; n; n = up(n)) chain.add(n);
    let n: Element | null = y as Element;
    while (n && !chain.has(n)) n = up(n);
    return n;
  }, [a, b])).asElement();
  try {
    if (!common) return null;
    const el = await this.classifyElement(common, { skipHit: true });
    if (el?.zone !== "red") return null;
    this.audit("drag", `${source} -> ${target}`, "red", "blocked");
    return `Red zone action requires --force: dragging "${source}" onto "${target}" clicks <${el.tag}> "${el.label}"`;
  } finally {
    await Promise.all([a.dispose(), b.dispose(), common?.dispose()].map(p => p?.catch(() => {})));
  }
}

export async function classifyKeyActivation(this: CBrowser, key: string): Promise<{ zone: ActionZone; tag: string; label: string } | null> {
  const raw = key.split("+").pop() || "";
  const last = raw.trim();
  // Playwright maps "\n" and "\r" to Enter, so they are Enter here too.
  const isEnter = /^(enter|numpadenter)$/i.test(last) || raw === "\n" || raw === "\r";
  const isSpace = last === "" ? key.endsWith(" ") : /^(space|spacebar)$/i.test(last);
  if (!isEnter && !isSpace) return null;
  const page = await this.getPage();
  const h = await page.evaluateHandle(() => {
    let a: Element | null = document.activeElement;
    for (let i = 0; a && i < 12; i++) {
      const sr = (a as Element & { shadowRoot: ShadowRoot | null }).shadowRoot;
      if (sr?.activeElement) { a = sr.activeElement; continue; }
      if (a.tagName === "IFRAME" || a.tagName === "FRAME") {
        let d: Document | null = null;
        try { d = (a as HTMLIFrameElement).contentDocument; } catch { d = null; }
        if (d?.activeElement && d.activeElement !== d.body) { a = d.activeElement; continue; }
      }
      break;
    }
    return a && a !== document.body && a !== document.documentElement ? a : null;
  });
  const focused = h.asElement();
  if (!focused) { await h.dispose(); return null; }
  try {
    if (isSpace) {
      const buttonLike = await focused.evaluate((el: Element) =>
        el.matches("button,summary,input[type=submit],input[type=button],input[type=reset],input[type=image],[role=button],[role=menuitem],[role=tab]"),
      ).catch(() => false);
      if (!buttonLike) return null;
    }
    const el = await this.classifyElement(focused, { implicitSubmit: isEnter, skipHit: true });
    // A combobox or listbox keeps focus on itself and points at the highlighted item with
    // aria-activedescendant; Enter activates that item (a command palette runs it) and, in a form, may also
    // submit the form. Both are judged and the more severe wins. The id is looked up only in the field's own
    // root, so a same-id element elsewhere on the page is never the one judged.
    let item: { zone: ActionZone; tag: string; label: string } | null = null;
    if (isEnter) {
      const ih = await focused.evaluateHandle((a: Element) => {
        const ad = a.getAttribute("aria-activedescendant");
        return ad ? (a.getRootNode() as Document | ShadowRoot).getElementById(ad) : null;
      }).catch(() => null);
      const ie = ih?.asElement() ?? null;
      if (ie) {
        const c = await this.classifyElement(ie, { skipHit: true });
        if (c) item = { zone: c.zone, tag: c.tag, label: c.label };
      }
      await ih?.dispose().catch(() => {});
    }
    const own = el ? { zone: el.zone, tag: el.tag, label: el.label } : null;
    if (own && item) return this.maxZone(own.zone, item.zone) === item.zone && item.zone !== own.zone ? item : own;
    return own ?? item;
  } finally {
    await focused.dispose().catch(() => {});
  }
}

export async function keystrokeRedZone(this: CBrowser, input: { key?: string; text?: string }, force?: boolean): Promise<string | null> {
  if (force) return null;
  const keys: string[] = [];
  if (input.key) keys.push(input.key);
  if (input.text !== undefined) {
    if (/[\r\n]/.test(input.text)) keys.push("Enter");
    if (input.text.includes(" ")) keys.push(" ");
  }
  for (const key of keys) {
    const a = await this.classifyKeyActivation(key);
    if (a?.zone === "red") {
      const what = input.key ? key : key === "Enter" ? "a newline in the typed text" : "a space in the typed text";
      this.audit("keyboard", input.key ?? JSON.stringify(input.text), "red", "blocked");
      return `Red zone action requires --force: ${what} would activate <${a.tag}> "${a.label}"`;
    }
  }
  return null;
}

export function audit(
  this: CBrowser,
  action: string,
  target: string,
  zone: ActionZone,
  result: "success" | "failure" | "blocked"
): void {
  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    action,
    target,
    zone,
    result,
    persona: this.currentPersona?.name,
  };

  const auditFile = join(this.paths.auditDir, `audit-${new Date().toISOString().split("T")[0]}.json`);

  let entries: AuditEntry[] = [];
  if (existsSync(auditFile)) {
    entries = JSON.parse(readFileSync(auditFile, "utf-8"));
  }

  entries.push(entry);
  writeFileSync(auditFile, JSON.stringify(entries, null, 2));
}
