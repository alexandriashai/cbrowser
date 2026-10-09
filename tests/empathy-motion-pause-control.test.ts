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
 * getAnimations), grouped by motion container. A visible, enabled
 * pause/stop/autoplay control credits a group only on explicit evidence it is FOR
 * that motion: aria-controls naming it (or an ancestor of it), or the ARIA
 * carousel pattern -- control and motion inside the same
 * [aria-roledescription="carousel"] region. Class-name containment never credits:
 * two rounds of class-based rules each let one widget's button hide another's
 * Level A failure (round 3, 2026-10-09). An uncredited group is one barrier with
 * a unique selector, a document-space rect and its animated-member count.
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
  `.animate-pulse{height:40px;margin:4px;background:#ddd}` +
  // Tailwind's animate-pulse, applied only where a fixture opts in: a bare
  // .animate-pulse is the class-only (JavaScript-timer) case.
  `.tw .animate-pulse{animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite}` +
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
/** The ARIA carousel pattern's region attributes. */
const ARIA = ` role="region" aria-roledescription="carousel"`;

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

  test("a pause control inside an ARIA carousel region credits it without aria-controls", async () => {
    const a = await audit(doc(
      `<main><section id="hero"${ARIA} aria-label="Featured">${slides}<button>Pause</button></section><p>Copy.</p></main>`));
    expect(a.barriers).toEqual([]);
    expect(a.violations).not.toContain("2.2.2");
  }, 60_000);

  test("named limit: inside a class-named carousel with no ARIA, the same button does not credit", async () => {
    // A class name cannot say which motion a button controls; reporting a
    // carousel that has a control is the safe direction (round 3).
    const a = await audit(hero(`<button>Pause</button>`));
    expect(a.barriers.length).toBe(1);
    expect(a.idOf[a.barriers[0].element]).toBe("hero");
  }, 60_000);
});

describe("a control credits only motion it is explicitly for (round 3)", () => {
  // The verifier fixtures. Round 1's parent rule and round 2's class-only
  // merge each let the carousel's own button credit the marquee beside it (or
  // a second carousel), and main's real 2.2.2 failure disappeared.
  const neighbours = (mainClass = "", heroAttrs = ARIA) => doc(
    `<main${mainClass ? ` class="${mainClass}"` : ""}>` +
    `<section id="hero" class="carousel"${heroAttrs} aria-label="Featured">` +
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
    const a = await audit(neighbours("slider-page"));
    expect(a.credited.map((c) => a.idOf[c.content])).not.toContain("ticker");
    const reported = a.barriers.flatMap((b) => [b.element, ...(b.members ?? [])]).map((m) => a.idOf[m]);
    expect(reported).toContain("ticker");
    expect(a.violations).toContain("2.2.2");
  }, 60_000);

  test("verifier P1: a timer-driven carousel in a slider-classed wrapper does not credit the ticker", async () => {
    const a = await audit(doc(
      `<main class="slider-page"><section id="hero" class="carousel"><div class="carousel-item" style="height:120px">Slide</div>` +
      `<button>Pause slides</button></section><p id="ticker" class="animate-marquee">Breaking: an endless ticker</p></main>`));
    const reported = a.barriers.flatMap((b) => [b.element, ...(b.members ?? [])]).map((m) => a.idOf[m]);
    expect(reported).toContain("ticker");
    expect(a.violations).toContain("2.2.2");
  }, 60_000);

  test("verifier P2: one carousel's pause button does not credit a second carousel in the same wrapper", async () => {
    const a = await audit(doc(
      `<main><div class="carousels"><section id="first" class="carousel" style="height:120px">First<button>Pause</button></section>` +
      `<section id="second" class="carousel" style="height:120px">Second, rotating on a timer</section></div></main>`));
    expect(a.credited.map((c) => a.idOf[c.content])).not.toContain("second");
    expect(a.barriers.length).toBeGreaterThan(0);
    expect(a.violations).toContain("2.2.2");
  }, 60_000);

  test("named limit: a button in the carousel's parent does not credit without aria-controls", async () => {
    const a = await audit(doc(
      `<main><div class="wrap"><section id="hero" class="carousel" aria-label="Featured">${slides}</section>` +
      `<button>Pause</button></div></main>`));
    expect(a.barriers.length).toBe(1);
    expect(a.idOf[a.barriers[0].element]).toBe("hero");
  }, 60_000);

  test("...while the same button naming the carousel in aria-controls credits it", async () => {
    const a = await audit(doc(
      `<main><div class="wrap"><section id="hero" class="carousel" aria-label="Featured">${slides}</section>` +
      `<button aria-controls="hero">Pause</button></div></main>`));
    expect(a.barriers).toEqual([]);
    expect(a.credited.map((c) => a.idOf[c.content])).toEqual(["hero"]);
  }, 60_000);

  test("a Bootstrap carousel marked up with the ARIA pattern is credited by its pause button", async () => {
    const a = await audit(doc(
      `<main><div id="bs" class="carousel slide"${ARIA} aria-label="Offers"><div class="carousel-inner">` +
      `<div class="carousel-item active" style="height:120px">Slide 1</div></div>` +
      `<button class="carousel-control-prev">Previous</button><button class="carousel-control-next">Next</button>` +
      `<button>Pause</button></div><p>Copy.</p></main>`));
    expect(a.barriers).toEqual([]);
    expect(a.violations).not.toContain("2.2.2");
  }, 60_000);

  test("verifier P4: a BEM marquee's controls div does not hide its moving track", async () => {
    const a = await audit(doc(
      `<main><section class="logo-carousel"><div id="track" class="logo-carousel__track" style="height:60px;animation:slide 3s linear infinite">Logos</div>` +
      `<div class="logo-carousel__controls"><button>Pause</button></div></section></main>`));
    const reported = a.barriers.flatMap((b) => [b.element, ...(b.members ?? [])]).map((m) => a.idOf[m]);
    expect(reported).toContain("track");
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
      `<section class="tw"><div class="rounded-xl border animate-pulse" id="sk1"></div><div class="rounded-xl border animate-pulse" id="sk2"></div></section>` +
      `</main>`));
    expect(a.credited.map((c) => [a.idOf[c.content], a.idOf[c.control]]))
      .toEqual([["CBrowser use cases", "Pause auto-play"]]);
    expect(a.barriers.map((b) => a.idOf[b.element]).sort()).toEqual(["sk1", "sk2"]);
  }, 60_000);
});

describe("class-only motion (the JavaScript-timer fallback) is ONE page-level barrier", () => {
  // No running animation, only a class name. One barrier per group turned four
  // bare .animate-pulse divs into four 2.2.2 barriers where main gave one, and
  // no fixture exercised the fallback at all: deleting it failed no test.
  const bare = (ids: string[]) => ids.map((id) => `<div class="animate-pulse" id="${id}"></div>`).join("");

  test("four bare .animate-pulse divs: one barrier listing all four", async () => {
    const a = await audit(doc(`<main>${bare(["p1", "p2", "p3", "p4"])}</main>`));
    expect(a.barriers.length).toBe(1);
    const b = a.barriers[0];
    expect(b.pageLevel).toBe(true);
    expect(b.affectedElementCount).toBe(4);
    expect((b.members ?? []).map((m) => a.idOf[m])).toEqual(["p1", "p2", "p3", "p4"]);
    expect(a.violations).toContain("2.2.2");
  }, 60_000);

  test("animation-backed groups stay individual beside the class-only aggregate", async () => {
    const a = await audit(doc(
      `<main>${bare(["p1", "p2"])}<p id="ticker" class="animate-marquee">Breaking: an endless ticker</p></main>`));
    expect(a.barriers.length).toBe(2);
    const located = a.barriers.filter((b) => !b.pageLevel);
    const aggregate = a.barriers.filter((b) => b.pageLevel);
    expect(located.map((b) => a.idOf[b.element])).toEqual(["ticker"]);
    expect(aggregate.length).toBe(1);
    expect((aggregate[0].members ?? []).map((m) => a.idOf[m])).toEqual(["p1", "p2"]);
  }, 60_000);

  test("a class-only group in an ARIA carousel region with its pause control is credited, not aggregated", async () => {
    const a = await audit(doc(
      `<main><div id="rot" class="slider"${ARIA} aria-label="Offers" style="height:120px">Rotating offers<button>Pause</button></div>${bare(["p1"])}</main>`));
    expect(a.credited.map((c) => a.idOf[c.content])).toEqual(["rot"]);
    expect(a.barriers.length).toBe(1);
    expect((a.barriers[0].members ?? []).map((m) => a.idOf[m])).toEqual(["p1"]);
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
