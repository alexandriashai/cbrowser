/**
 * BUG-03, narrow fix: an element that is ITSELF a keyboard path is not a
 * "hover-dependent interaction without click alternative".
 *
 * Measured on cbrowser.ai at 1280x800 (tremor, viewport, 2026-10-06): the audit
 * charged `hover_dependent: -20.7` and claimed WCAG 2.1.1 for three elements --
 * the promo link `a.block` (hover:opacity-90), the Docs nav link
 * (hover:bg-accent) and a Radix `button.group` trigger (aria-expanded). Each
 * matched the candidate selector only through a Tailwind `hover:` utility, and
 * the "click alternative" test looked only at DESCENDANT a/button elements,
 * never at the element itself.
 *
 * The excuse is applied to the detector's OWN selection -- after its
 * 20-candidate window and 5-barrier cap -- so the fix can only remove a finding
 * the detector already made, never add one. A first version applied it before
 * the caps and was rejected on measurement: lifting the window let the
 * unchanged candidate selector reach elements it had never examined, and on
 * cbrowser.ai it reported two shadcn badges (and, in full_page, five decorative
 * elements) that the unfixed detector never flagged. The "only removes" tests
 * below pin that. The window's own false negatives are untouched, and a
 * stylesheet-level detector is separate work.
 *
 * "Keyboard path" means operable from the keyboard: rendered, not :disabled,
 * and focusable -- a native control with no negative tabindex, any element
 * with tabindex >= 0, or a tab/menuitem with tabindex=-1 (APG roving focus).
 * ARIA alone does not make a div operable, so role=button or aria-expanded
 * without a tabindex is still flagged, as is a link hidden in a CSS-only hover
 * sub-menu. Each of those is a WCAG 2.1.1 failure in itself.
 *
 * Fixtures are installed with page.setContent and run through the SHIPPED
 * runEmpathyAudit, the call the empathy_audit MCP handler makes.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Audit side files go to a throwaway dir. Set before the module loads.
const ORIGINAL_DATA_DIR = process.env.CBROWSER_DATA_DIR;
const DATA_DIR = mkdtempSync(join(ORIGINAL_DATA_DIR ?? tmpdir(), "cbrowser-hover-self-"));
process.env.CBROWSER_DATA_DIR = DATA_DIR;
const { runEmpathyAudit } = await import("../src/analysis/accessibility-empathy.js");
const { BUILTIN_PERSONAS, ACCESSIBILITY_PERSONAS, EMOTIONAL_PERSONAS } = await import("../src/personas.js");
const { AGENT_PERSONAS } = await import("../src/agent-personas.js");

const REGISTRY = new Set<string>([
  ...Object.keys(BUILTIN_PERSONAS),
  ...Object.keys(ACCESSIBILITY_PERSONAS),
  ...Object.keys(EMOTIONAL_PERSONAS),
  ...Object.keys(AGENT_PERSONAS),
]);

const doc = (body: string, css = "", js = "") =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>fixture</title>` +
  `<style>body{margin:0;font:16px sans-serif}${css}</style></head>` +
  `<body>${body}<script>${js}</script></body></html>`;

type Barrier = {
  type: string; element: string; description: string; affectedPersonas: string[];
  rect?: { x: number; y: number; width: number; height: number };
};
type PersonaResult = {
  barriers: Barrier[];
  outOfViewportBarriersDropped?: number;
  scoreContext?: { deductionsByType?: Record<string, number> };
};

const hoverBarriers = (r: PersonaResult) =>
  r.barriers.filter((b) => b.type === "motor_precision" && /Hover-dependent/.test(b.description));
const flagged = (r: PersonaResult) => hoverBarriers(r).map((b) => b.element);

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  rmSync(DATA_DIR, { recursive: true, force: true });
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.CBROWSER_DATA_DIR;
  else process.env.CBROWSER_DATA_DIR = ORIGINAL_DATA_DIR;
}, 60_000);

/**
 * One tremor audit, called the way audit-tools.ts calls it. runEmpathyAudit
 * navigates the page itself, so the fixture is installed with page.setContent
 * at that moment instead of being fetched.
 */
async function audit(html: string, scope: "viewport" | "full_page" = "viewport"): Promise<PersonaResult> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.goto = (async () => { await page.setContent(html); return null; }) as Page["goto"];
  try {
    const result = await runEmpathyAudit("about:blank", {
      disabilities: ["motor-impairment-tremor"], wcagLevel: "AA", maxSteps: 5, maxTime: 20,
      headless: true, scope, page,
    });
    return result.results[0] as unknown as PersonaResult;
  } finally {
    await context.close();
  }
}

const TOOLTIP_CSS =
  `.tooltip{position:relative;border-bottom:1px dotted}` +
  `.tooltip:hover::after{content:attr(data-tip);position:absolute;left:0;top:1.5em;background:#000;color:#fff}`;
const HOVER_CSS = `.hover\\:bg-accent:hover{background:#eee}`;
const hoverLinks = (n: number) =>
  Array.from({ length: n }, (_, i) => `<a href="/l${i}" class="hover:bg-accent">L${i}</a>`).join(" ");
// A WordPress-shaped primary menu: every li holds a link, so the detector's
// descendant test excuses each one, and 22 of them fill its 20-candidate window.
const wpMenu = (n: number) =>
  `<nav><ul class="menu">${Array.from({ length: n }, (_, i) =>
    `<li class="menu-item"><a href="/m${i}">M${i}</a></li>`).join("")}</ul></nav>`;
const WP_CSS = `.menu{display:flex;flex-wrap:wrap;list-style:none;margin:0;padding:0}.menu-item{margin-right:4px}`;

describe("an element that is itself a keyboard path is not hover-dependent", () => {
  test("the three reported cbrowser.ai elements are not flagged and cost nothing", async () => {
    const r = await audit(doc(
      `<a href="/pricing/" class="block bg-primary px-4 py-2 text-center hover:opacity-90">Sign up for Pro and get 500 bonus credits</a>
       <nav>
         <a href="/docs/home/" class="data-[active=true]:focus:bg-accent hover:bg-accent inline-flex h-11 px-4">Docs</a>
         <button type="button" class="group inline-flex h-11 px-4 hover:bg-accent" aria-expanded="false" id="cap">Capabilities</button>
       </nav>`,
      `.block{display:block}.inline-flex{display:inline-flex}
       .hover\\:opacity-90:hover{opacity:.9}.hover\\:bg-accent:hover{background:#eee}`,
      // Radix attaches its handler with addEventListener, which no attribute shows.
      `document.getElementById('cap').addEventListener('click', e =>
         e.currentTarget.setAttribute('aria-expanded', String(e.currentTarget.getAttribute('aria-expanded') !== 'true')));`,
    ));
    expect(flagged(r)).toEqual([]);
    expect(r.scoreContext?.deductionsByType?.hover_dependent).toBeUndefined();
  }, 60_000);

  // At most five per page: the excuse applies to the detector's five, so a
  // sixth would pass without being examined at all.
  test.each([
    ["native form controls and summary",
      `<input class="menu-input" type="search" aria-label="Search">
       <select class="menu-select" aria-label="Sort"><option>Newest</option></select>
       <textarea class="tooltip-textarea" aria-label="Note"></textarea>
       <details><summary class="menu-summary">More</summary><p>Body</p></details>`],
    ["ARIA widgets that are focusable",
      `<div class="menu-role-button" role="button" tabindex="0">Open</div>
       <div class="menu-role-link" role="link" tabindex="0">Docs</div>
       <div class="menu-role-switch" role="switch" aria-checked="false" tabindex="0">Dark</div>
       <div class="dropdown-aria-expanded" aria-expanded="false" tabindex="0">Filters</div>
       <div class="dropdown-aria-haspopup" aria-haspopup="menu" tabindex="0">Account</div>`],
    ["tabindex >= 0, and roving tabindex=-1 on a tab or menuitem",
      `<div class="hover-tabindex-0" tabindex="0">Card</div>
       <div class="hover-tabindex-2" tabindex="2">Card</div>
       <div role="tablist"><div class="menu-role-tab" role="tab" tabindex="-1">Overview</div></div>
       <div role="menu"><div class="menu-role-menuitem" role="menuitem" tabindex="-1">Copy</div></div>`],
  ])("%s excuse the element on its own", async (_name, body) => {
    expect(flagged(await audit(doc(body)))).toEqual([]);
  }, 60_000);

  test.each([
    // An <a> with no href is not focusable, tabindex=-1 takes an element out of
    // the tab order, and aria-haspopup="false" declares that there is no popup.
    ["look-alikes", "viewport",
      `<a class="menu-anchor-no-href">No href</a>
       <div class="hover-tabindex-neg" tabindex="-1">Card</div>
       <div class="dropdown-haspopup-false" aria-haspopup="false">Account</div>`,
      ``, ["a.menu-anchor-no-href", "div.hover-tabindex-neg", "div.dropdown-haspopup-false"]],
    // On the attribute list, but no keyboard user can reach them: a disabled
    // button, a link removed from the tab order, and ARIA with no tabindex.
    // Their hover-only content is a real barrier, and each is a 2.1.1 failure.
    ["listed but not operable", "viewport",
      `<button disabled class="tooltip-trigger">Save<span class="tip">You need edit rights</span></button>
       <p>Rate <a href="#r" tabindex="-1" class="tooltip" data-tip="Annual percentage rate">i</a></p>
       <div class="menu-role-button-unfocusable" role="button">Open</div>
       <div class="dropdown" aria-expanded="false"><span>Products</span><div class="dropdown-content">Widgets and gadgets</div></div>`,
      `.tip,.dropdown-content{display:none}.tooltip-trigger:hover .tip{display:inline}.dropdown:hover .dropdown-content{display:block}${TOOLTIP_CSS}`,
      // div.dropdown-content is display:none, so 0x0, and the viewport filter drops it.
      ["button.tooltip-trigger", "a.tooltip", "div.menu-role-button-unfocusable", "div.dropdown"]],
    // A control inside a disabled fieldset is :disabled too; a hidden input is
    // not operable at all. 0x0, so full_page, where nothing drops it.
    ["disabled by its fieldset, and type=hidden", "full_page",
      `<fieldset disabled><legend>Shipping</legend><input class="menu-fs-input" type="text" aria-label="Zip"></fieldset>
       <input type="hidden" class="menu-state" value="1">`,
      ``, ["input.menu-fs-input", "input.menu-state"]],
    // Links inside a CSS-only hover sub-menu: hidden until the pointer opens
    // it, so no keyboard can focus them. Here the flag on the hidden link is
    // the only trace the detector has of the hover-only menu.
    ["links hidden in a CSS-only hover sub-menu", "full_page",
      `<nav><ul><li class="has-sub">Services
         <ul class="sub-none"><li><a href="/s1" class="menu-link">Audit</a></li></ul>
         <ul class="sub-hidden"><li><a href="/s2" class="menu-link-v">Repair</a></li></ul>
       </li></ul></nav>`,
      `.sub-none{display:none}.sub-hidden{visibility:hidden}
       .has-sub:hover .sub-none{display:block}.has-sub:hover .sub-hidden{visibility:visible}`,
      ["a.menu-link", "a.menu-link-v"]],
  ] as const)("%s are still flagged", async (_name, scope, body, css, expected) => {
    expect(flagged(await audit(doc(body, css), scope))).toEqual([...expected]);
  }, 60_000);
});

describe("a hover-only tooltip on a non-focusable element is still flagged", () => {
  test("a CSS pseudo-element tooltip on a span", async () => {
    const r = await audit(doc(
      `<p>Deductible <span class="tooltip" data-tip="The amount you pay before coverage starts">?</span></p>`,
      TOOLTIP_CSS,
    ));
    expect(flagged(r)).toEqual(["span.tooltip"]);
    // Deductions are published as negative numbers (-14.6 here).
    expect(r.scoreContext?.deductionsByType?.hover_dependent).toBeLessThan(0);
  }, 60_000);

  // Final review, 2026-10-07: the keyboard-path probe reads tabIndex, matches(),
  // getComputedStyle and getClientRects on page-controlled elements. Page script
  // can make any of them throw; without a guard that aborted the whole audit.
  // A throw must fall back to base behaviour (flag it), never crash the audit.
  test("a page whose element throws from tabIndex still gets base's result, not a crash", async () => {
    const r = await audit(doc(
      `<p>Need help? <x-t class="hover-x" tabindex="0">?</x-t></p>`,
      "",
      `customElements.define("x-t", class extends HTMLElement { get tabIndex() { throw new Error("hostile"); } });`,
    ));
    expect(flagged(r)).toContain("x-t.hover-x");
  }, 60_000);
});

describe("the fix only removes findings: nothing past the detector's window is surfaced", () => {
  // Each page fills the 20-candidate window or the 5-barrier cap with elements
  // the detector excuses or that this fix excuses, and then holds a false
  // positive of the unchanged candidate selector. The unfixed detector never
  // reaches that element; neither may the fix.
  const cases = [
    // The live cbrowser.ai shape: three excused nav links, two hidden (0x0)
    // icons, then a shadcn badge whose only hover token is `[a&]:hover:...`,
    // a rule that can only ever match an <a>.
    ["shadcn badge after the nav", doc(
      `${hoverLinks(3)}<span class="hover:opacity-80 menu-icon" style="display:none"></span><span class="hover:opacity-80 menu-icon" style="display:none"></span>
       <h1>Title</h1><span data-slot="badge" class="inline-flex items-center rounded-md border px-2 [a&amp;]:hover:bg-secondary/90">Persona Testing for Product Teams</span>`,
      `${HOVER_CSS}.inline-flex{display:inline-flex}a.\\[a\\&\\]\\:hover\\:bg-secondary\\/90:hover{background:#ddd}`),
      // full_page keeps the two 0x0 icons, exactly as the unfixed detector does.
      { viewport: [], full_page: ["span.hover:opacity-80", "span.hover:opacity-80"] }],
    ["decorative card after a 22-item menu", doc(
      `${wpMenu(22)}<main><div class="card hover-lift"><h3>Feature</h3><p>Plain text</p></div></main>`,
      `${WP_CSS}.hover-lift:hover{transform:translateY(-2px)}`),
      { viewport: [], full_page: [] }],
    ["footer heading after a 22-item menu", doc(
      `${wpMenu(22)}<footer><h4 class="footer-menu-title">Quick links</h4></footer>`, WP_CSS),
      { viewport: [], full_page: [] }],
    // The live full_page shape: decoration inside a card link.
    ["group-hover decoration inside a card link after a 22-item menu", doc(
      `${wpMenu(22)}<a href="/features/" class="group relative block border p-6">
         <div class="absolute inset-0 opacity-0 group-hover:opacity-100"></div>
         <h3>Persona testing</h3><div class="mt-4 group-hover:translate-x-1">Learn more</div></a>`,
      `${WP_CSS}.group:hover .group-hover\\:opacity-100{opacity:1}.group:hover .group-hover\\:translate-x-1{transform:translateX(4px)}`),
      { viewport: [], full_page: [] }],
  ] as const;
  for (const [name, html, expected] of cases) {
    for (const scope of ["viewport", "full_page"] as const) {
      test(`${name} (${scope})`, async () => {
        const r = await audit(html, scope);
        expect(flagged(r)).toEqual([...expected[scope]]);
        if (expected[scope].length === 0) {
          expect(r.scoreContext?.deductionsByType?.hover_dependent).toBeUndefined();
        }
      }, 60_000);
    }
  }

  test("an off-screen finding is still dropped by the audit's one viewport filter, and counted", async () => {
    // filterBarriersToViewport documents that scope is applied once, centrally,
    // and that the count of what it dropped is published. A detector that
    // scopes its own findings hides them from that count.
    const html = doc(
      `<div style="height:1200px"></div>
       <p>Deductible <span class="tooltip" data-tip="The amount you pay before coverage starts">?</span></p>`,
      TOOLTIP_CSS,
    );
    const viewport = await audit(html, "viewport");
    expect(flagged(viewport)).toEqual([]);
    expect(viewport.outOfViewportBarriersDropped).toBe(1);
    expect(flagged(await audit(html, "full_page"))).toEqual(["span.tooltip"]);
  }, 60_000);

  test("the report cap still holds: eight visible tooltips report the first five, in document order", async () => {
    const tips = Array.from({ length: 8 }, (_, i) =>
      `<p>Term ${i} <span class="tooltip t${i}" data-tip="Definition ${i}">?</span></p>`).join("");
    const r = await audit(doc(tips, TOOLTIP_CSS));
    const hover = hoverBarriers(r);
    expect(hover.length).toBe(5);
    const ys = hover.map((b) => b.rect!.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
  }, 60_000);
});

describe("detectMotorBarriers names real personas", () => {
  test("hover and drag-and-drop barriers name registry personas, the two with the lowest motorControl", async () => {
    // "motor-impairment-limited-mobility" is not a persona: asking an audit for
    // it throws UnknownPersonaError. The two registry personas that declare
    // motorControl are motor-impairment-tremor (0.3) and elderly-low-vision (0.5).
    const r = await audit(doc(
      `<p>Deductible <span class="tooltip" data-tip="The amount you pay before coverage starts">?</span></p>
       <div draggable="true" class="drag-item">Drag me</div>`,
      TOOLTIP_CSS,
    ));
    const hover = hoverBarriers(r);
    const drag = r.barriers.filter((b) => /Drag-and-drop/.test(b.description));
    expect(hover.length).toBe(1);
    expect(drag.length).toBe(1);
    for (const b of [...hover, ...drag]) {
      expect(b.affectedPersonas.filter((p) => !REGISTRY.has(p))).toEqual([]);
      expect(b.affectedPersonas).toEqual(["motor-impairment-tremor", "elderly-low-vision"]);
    }
  }, 60_000);
});
