/**
 * B5 (2026-10-09 report): the 2.2.2 animation barrier had no selector and never
 * credited a pause control.
 *
 * The check was a class-name match, `[class*=animate|slider|carousel]`, whose
 * page script returned {type, description, count}. The barrier was built with
 * `element: "animation"` -- the literal string -- no rect, and the count thrown
 * away, so deduplication counted it as one element. Nothing looked for a pause
 * control: a carousel with a labelled, associated "Pause auto-play" button was
 * reported exactly like one with none.
 *
 * Now: candidates from document.getAnimations() (infinite, or > 5 s) unioned
 * with the class match (timer-driven carousels never show up in
 * getAnimations), grouped by motion container; a visible, enabled
 * pause/stop/autoplay control inside the container or its parent, or naming it
 * in aria-controls, credits the group. An uncredited group is one barrier with a
 * unique selector, a document-space rect and its animated-member count.
 *
 * Fixtures run through the SHIPPED runEmpathyAudit.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGINAL_DATA_DIR = process.env.CBROWSER_DATA_DIR;
const DATA_DIR = mkdtempSync(join(ORIGINAL_DATA_DIR ?? tmpdir(), "cbrowser-motion-"));
process.env.CBROWSER_DATA_DIR = DATA_DIR;
const { runEmpathyAudit } = await import("../src/analysis/accessibility-empathy.js");

type Rect = { x: number; y: number; width: number; height: number };
type Barrier = {
  type: string; element: string; description: string; wcagCriteria: string[];
  rect?: Rect; affectedElementCount?: number; members?: string[]; pageLevel?: boolean;
};
type Audit = {
  barriers: Barrier[];
  violations: string[];
  credited: Array<{ content: string; control: string }>;
  /** querySelector(selector).id, else its aria-label, resolved while the page was open. */
  idOf: Record<string, string | null>;
};

const CSS =
  `body{margin:0;font:16px sans-serif;color:#000;background:#fff}` +
  `@keyframes heroProgress{from{width:0}to{width:100%}}` +
  `@keyframes pulse{50%{opacity:.5}}` +
  `.animate-pulse{animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite;height:40px;margin:4px;background:#ddd}` +
  `.animate-marquee{animation:fade 2s linear infinite}` +
  `@keyframes slide{from{transform:translateX(0)}to{transform:translateX(-12px)}}` +
  `@keyframes fade{from{opacity:.5}to{opacity:1}}` +
  `.slide{display:inline-block;width:280px;height:150px;background:#eee;animation:slide 3s linear infinite}` +
  `#hero{width:900px;height:170px;overflow:hidden}` +
  `button{font:16px sans-serif;padding:12px 16px}`;
const doc = (body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>fixture</title><style>${CSS}</style></head>` +
  `<body>${body}</body></html>`;
const slides = `<div class="slide" id="s1">One</div><div class="slide" id="s2">Two</div><div class="slide" id="s3">Three</div>`;
/** A carousel with three infinitely animated slides, inside a wrapper, with `extra` placed by the caller. */
const hero = (insideHero = "", afterMain = "") => doc(
  `<main><div class="wrap"><section id="hero" class="carousel" aria-label="Featured">${slides}${insideHero}</section></div>` +
  `<p>Short body copy.</p></main><footer>${afterMain}</footer>`);
const PAUSE_CONTROLS_HERO = `<button aria-label="Pause auto-play" aria-controls="hero">II</button>`;

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); }, 60_000);
afterAll(async () => {
  await browser?.close();
  rmSync(DATA_DIR, { recursive: true, force: true });
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.CBROWSER_DATA_DIR;
  else process.env.CBROWSER_DATA_DIR = ORIGINAL_DATA_DIR;
}, 60_000);

async function audit(html: string): Promise<Audit> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.goto = (async () => { await page.setContent(html); return null; }) as Page["goto"];
  try {
    const result = await runEmpathyAudit("about:blank", {
      disabilities: ["cognitive-adhd"], wcagLevel: "AA", maxSteps: 1, maxTime: 15,
      headless: true, scope: "viewport", page,
    });
    const r = result.results[0] as unknown as {
      barriers: Barrier[]; motionControlsCredited?: Array<{ content: string; control: string }>;
    };
    const barriers = r.barriers.filter((b) => b.wcagCriteria.includes("2.2.2"));
    const credited = r.motionControlsCredited ?? [];
    const idOf: Record<string, string | null> = {};
    const selectors = [
      ...barriers.flatMap((b) => [b.element, ...(b.members ?? [])]),
      ...credited.flatMap((c) => [c.content, c.control]),
    ];
    for (const sel of selectors) {
      idOf[sel] = await page.evaluate((s) => {
        try {
          const el = document.querySelector(s);
          return el?.id || el?.getAttribute("aria-label") || null;
        } catch { return null; }
      }, sel);
    }
    return { barriers, violations: result.allWcagViolations, credited, idOf };
  } finally {
    await context.close();
  }
}

describe("an associated pause control credits the moving content", () => {
  test("a control naming the carousel in aria-controls: no 2.2.2 barrier or violation", async () => {
    const a = await audit(hero("", PAUSE_CONTROLS_HERO));
    expect(a.barriers).toEqual([]);
    expect(a.violations).not.toContain("2.2.2");
  }, 60_000);

  test("the credit is reported, naming the content and the control", async () => {
    const a = await audit(hero("", PAUSE_CONTROLS_HERO));
    expect(a.credited.length).toBe(1);
    expect(a.idOf[a.credited[0].content]).toBe("hero");
  }, 60_000);

  test("a pause control inside the carousel credits it without aria-controls", async () => {
    const a = await audit(hero(`<button>Pause</button>`));
    expect(a.barriers).toEqual([]);
    expect(a.violations).not.toContain("2.2.2");
  }, 60_000);
});

describe("a control credits only its own group (round 2)", () => {
  // The verifier's fixture. The parent rule credited any group whose parent
  // held a pause control, so the carousel's own button -- in <main>, the
  // marquee's parent -- credited the marquee too, and main's real 2.2.2
  // failure disappeared.
  const neighbours = (mainClass = "") => doc(
    `<main${mainClass ? ` class="${mainClass}"` : ""}>` +
    `<section id="hero" class="carousel" aria-label="Featured">` +
    `<div class="slide" id="s1">One</div><div class="slide" id="s2">Two</div>` +
    `<button>Pause slides</button></section>` +
    `<p id="ticker" class="animate-marquee">Breaking: an endless ticker</p></main>`);

  test("the marquee beside a credited carousel is still reported", async () => {
    const a = await audit(neighbours());
    expect(a.barriers.length).toBe(1);
    expect(a.idOf[a.barriers[0].element]).toBe("ticker");
    expect(a.violations).toContain("2.2.2");
  }, 60_000);

  test("the carousel is credited by its own button, and only the carousel", async () => {
    const a = await audit(neighbours());
    expect(a.credited.map((c) => a.idOf[c.content])).toEqual(["hero"]);
  }, 60_000);

  test("a slider-classed page wrapper does not carry the carousel's credit to the marquee", async () => {
    // Outermost-container grouping made <main class="slider-page"> one group
    // holding every animation on the page, credited by the carousel's button.
    const a = await audit(neighbours("slider-page"));
    expect(a.credited.map((c) => a.idOf[c.content])).toEqual(["hero"]);
    expect(a.barriers.length).toBe(1);
    expect((a.barriers[0].members ?? []).map((m) => a.idOf[m])).toEqual(["ticker"]);
    expect(a.violations).toContain("2.2.2");
  }, 60_000);

  test("a control in the container's parent credits it when the parent holds nothing else that moves", async () => {
    const a = await audit(doc(
      `<main><div class="wrap"><section id="hero" class="carousel" aria-label="Featured">${slides}</section>` +
      `<button>Pause</button></div></main>`));
    expect(a.barriers).toEqual([]);
    expect(a.credited.map((c) => a.idOf[c.content])).toEqual(["hero"]);
  }, 60_000);

  test("a timer-driven Bootstrap carousel is one widget: its pause button in .carousel credits it", async () => {
    // carousel-inner, carousel-item and carousel-control-* all match the
    // container selector. As separate nearest-container groups, a button in
    // .carousel could credit only the outer one; class-only parts join it.
    const a = await audit(doc(
      `<main><div id="bs" class="carousel slide"><div class="carousel-inner">` +
      `<div class="carousel-item active" style="height:120px">Slide 1</div></div>` +
      `<button class="carousel-control-prev">Previous</button><button class="carousel-control-next">Next</button>` +
      `<button>Pause</button></div><p>Copy.</p></main>`));
    expect(a.barriers).toEqual([]);
    expect(a.credited.map((c) => a.idOf[c.content])).toEqual(["bs"]);
  }, 60_000);

  test("a bare carousel-classed wrapper does not claim the button beside its moving track", async () => {
    const a = await audit(doc(
      `<main><div class="carousel"><div id="track" class="carousel-track" style="height:120px;animation:slide 3s linear infinite">Track</div>` +
      `<button>Pause</button></div><p>Copy.</p></main>`));
    expect(a.barriers).toEqual([]);
    expect(a.credited.map((c) => a.idOf[c.content])).toEqual(["track"]);
  }, 60_000);

  test("cbrowser.ai's structure: the in-carousel \"Pause auto-play\" credits the carousel, not the skeletons", async () => {
    // Read from the live DOM (curl https://cbrowser.ai, 2026-10-09): the
    // button has no aria-controls and sits two divs deep INSIDE the
    // aria-roledescription="carousel" region, beside Previous/Next; slides
    // carry tailwindcss-animate's animate-in, the progress bar a 10 s CSS
    // animation. Sibling sections in <main> hold animate-pulse skeletons.
    const a = await audit(doc(
      `<main><div role="region" aria-roledescription="carousel" aria-label="CBrowser use cases" class="relative overflow-hidden">` +
      `<div class="absolute inset-0 hero-pattern"></div>` +
      `<div class="container mx-auto"><div role="group" aria-roledescription="slide" aria-label="1 of 6: Persona Testing" ` +
      `class="text-center animate-in fade-in slide-in-from-bottom-3 duration-500"><h1>Persona Testing</h1></div></div>` +
      `<div class="container mx-auto mt-8"><div class="flex items-center">` +
      `<button aria-label="Previous slide">&lt;</button><span>1 / 6</span><button aria-label="Next slide">&gt;</button>` +
      `<button aria-label="Pause auto-play"><svg aria-hidden="true" width="16" height="16"><rect x="3" y="2" width="4" height="12"></rect></svg></button>` +
      `</div></div>` +
      `<div class="absolute bottom-0"><div id="progress" style="height:2px;background:#999;animation:heroProgress 10000ms linear forwards"></div></div>` +
      `</div>` +
      `<section><div class="rounded-xl border animate-pulse" id="sk1"></div><div class="rounded-xl border animate-pulse" id="sk2"></div></section>` +
      `</main>`));
    expect(a.credited.map((c) => [a.idOf[c.content], a.idOf[c.control]]))
      .toEqual([["CBrowser use cases", "Pause auto-play"]]);
    expect(a.barriers.map((b) => a.idOf[b.element]).sort()).toEqual(["sk1", "sk2"]);
  }, 60_000);
});

describe("a control that is not associated, visible and enabled does not credit", () => {
  test.each([
    ["unrelated: outside the carousel and its parent, no aria-controls", hero("", `<button>Pause</button>`)],
    ["hidden", hero(`<button style="display:none">Pause</button>`)],
    ["disabled", hero(`<button disabled>Pause</button>`)],
    ["not a pause control", hero(`<button>Next slide</button>`)],
  ])("%s", async (_name, html) => {
    const a = await audit(html);
    expect(a.barriers.length).toBe(1);
    expect(a.violations).toContain("2.2.2");
  }, 60_000);
});

describe("an uncredited group is one located barrier", () => {
  test("its selector resolves to the carousel, with a viewport rect and the member count", async () => {
    const a = await audit(hero());
    expect(a.barriers.length).toBe(1);
    const b = a.barriers[0];
    expect(b.element).not.toBe("animation");
    expect(a.idOf[b.element]).toBe("hero");
    expect(b.rect).toBeDefined();
    expect(b.rect!.width).toBeGreaterThan(0);
    expect(b.rect!.y).toBeLessThan(800);
    expect(b.affectedElementCount).toBe(3);
  }, 60_000);
});

describe("candidates come from getAnimations as well as class names", () => {
  test("an infinite animation with no matching class is found", async () => {
    const a = await audit(doc(
      `<main><div id="ticker" style="animation:fade 2s ease-in-out infinite">Breaking: news ticker</div></main>`));
    expect(a.barriers.length).toBe(1);
    expect(a.idOf[a.barriers[0].element]).toBe("ticker");
  }, 60_000);

  test("a one-shot 1 s animation with no matching class is not moving content", async () => {
    const a = await audit(doc(
      `<main><div id="once" style="animation:fade 1s ease-in 1">Welcome</div></main>`));
    expect(a.barriers).toEqual([]);
  }, 60_000);
});

describe("sibling: autoplaying media with native controls is credited too", () => {
  /** The 1.4.2/2.2.2 autoplay barriers for one fixture, with the ids their selectors resolve to. */
  async function autoplay(html: string): Promise<Array<{ element: string; id: string | null }>> {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.goto = (async () => { await page.setContent(html); return null; }) as Page["goto"];
    try {
      const result = await runEmpathyAudit("about:blank", {
        disabilities: ["cognitive-adhd"], wcagLevel: "AA", maxSteps: 1, maxTime: 15,
        headless: true, scope: "viewport", page,
      });
      const found = (result.results[0].barriers as Barrier[]).filter((b) => b.wcagCriteria.includes("1.4.2"));
      const out: Array<{ element: string; id: string | null }> = [];
      for (const b of found) {
        out.push({ element: b.element, id: await page.evaluate((s) => document.querySelector(s)?.id || null, b.element) });
      }
      return out;
    } finally {
      await context.close();
    }
  }

  test("a video with controls is not reported as uncontrollable sound", async () => {
    expect(await autoplay(doc(`<main><video id="v" autoplay controls width="320" height="180"></video></main>`))).toEqual([]);
  }, 60_000);

  test("without controls it is, under a selector that names it (was the bare tag)", async () => {
    const found = await autoplay(doc(
      `<main><video id="a" autoplay width="320" height="180"></video><video id="b" autoplay width="320" height="180"></video></main>`));
    expect(found.map((f) => f.id).sort()).toEqual(["a", "b"]);
  }, 60_000);
});
