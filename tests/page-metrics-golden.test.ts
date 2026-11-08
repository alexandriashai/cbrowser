/**
 * extractPageMetrics returns exactly what it returned before its constants
 * were registered.
 *
 * The golden (fixtures/page-metrics-golden.json) was written on e9b4f03, when
 * every midpoint, weight and threshold in the extractor was still an inline
 * literal. Those numbers now live in visual/provenance/page-metrics.ts and are
 * read through param(), and the outputs must not move by a single bit: every
 * field is compared with toEqual on the parsed JSON, which round-trips a double
 * exactly.
 *
 * The coverage checks below keep the golden from passing vacuously: if the
 * fixtures stopped reaching the CJK or abjad branch, the choice cap or the
 * animation count, a constant in that branch could change unseen.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { measureFixturePage, measurePageMetricsFixtures, PAGE_METRICS_FIXTURES, type PageMetricsGolden } from "./fixtures/page-metrics-measure.js";
import { serveFixtures } from "./fixtures/serve-fixtures.js";
import { extractPerScreenMetrics, measurePageGeometry } from "../src/visual/cognitive-transport.js";

const golden = JSON.parse(readFileSync(join(import.meta.dir, "fixtures", "page-metrics-golden.json"), "utf8")) as PageMetricsGolden;

type Metrics = Record<string, unknown>;
const all = (g: PageMetricsGolden): Metrics[] =>
  Object.values(g).flatMap((p) => [p.viewport as Metrics, p.fullPage as Metrics, ...(p.perScreen as Metrics[])]);

let browser: Browser;
let measured: PageMetricsGolden;

beforeAll(async () => {
  browser = await chromium.launch();
  measured = await measurePageMetricsFixtures(browser);
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

describe("the golden reaches every branch of the extractor", () => {
  test("all three script families, the choice cap, motion and the colour sample", () => {
    expect(Object.keys(golden).sort()).toEqual([...PAGE_METRICS_FIXTURES].sort());
    const rows = all(golden);
    const families = new Set(rows.map((m) => m.scriptFamily));
    expect([...families].sort()).toEqual(["abjad", "alphabetic", "cjk"]);
    expect(rows.some((m) => m.choiceCountCapped === true)).toBe(true);
    expect(rows.some((m) => (m.animationLevel as number) > 0)).toBe(true);
    expect(rows.some((m) => m.scope === "full_page")).toBe(true);
    // More than 50 visible elements, so the colour sample limit binds.
    expect(rows.some((m) => (m.interactiveElementCount as number) > 50)).toBe(true);
  });
});

describe("extractPageMetrics output is unchanged on the fixture pages", () => {
  for (const name of PAGE_METRICS_FIXTURES) {
    test(`${name}: viewport, full_page and per-screen equal the golden`, () => {
      expect(measured[name].viewport).toEqual(golden[name].viewport);
      expect(measured[name].fullPage).toEqual(golden[name].fullPage);
      expect(measured[name].perScreen).toEqual(golden[name].perScreen);
    });
  }
});

describe("the measurement does not depend on when it runs", () => {
  // Every animation on the page, open shadow roots included, set to `ms` into
  // its cycle and slowed a millionfold, so a test lands on that angle every
  // time while the page still reports the animation running.
  const runAt = (page: Page, ms: number) =>
    page.evaluate((t) => {
      const roots: Array<Document | ShadowRoot> = [document];
      for (const el of Array.from(document.querySelectorAll("*"))) if (el.shadowRoot) roots.push(el.shadowRoot);
      for (const root of roots) for (const a of root.getAnimations()) { a.playbackRate = 1e-6; a.currentTime = t; }
    }, ms);

  const open = async (name: string) => {
    const fixtures = await serveFixtures();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await page.goto(`${fixtures.base}${name}`, { waitUntil: "load" });
    return { page, close: async () => { await page.close(); await fixtures.close(); } };
  };

  test("latin, its animations running at 90 degrees, still equals the golden", async () => {
    // 500 ms of the 2 s turn is 90 degrees, inside the window where a
    // measurement that read the turn as it stood differed on screen 2 (see
    // measureFixturePage): the worst-timed runner, every time.
    const { page, close } = await open("page-metrics-latin.html");
    try {
      await runAt(page, 500);
      expect(await measureFixturePage(page)).toEqual(golden["page-metrics-latin.html"]);
    } finally {
      await close();
    }
  }, 60_000);

  test("a turning bar at the foot of the page does not lengthen it", async () => {
    // 1000 px of page, then a 1000 x 20 bar: 1020 px at rest, 1510 at 90
    // degrees, because a transformed box adds to the scrollable overflow.
    const { page, close } = await open("page-metrics-motion-geometry.html");
    try {
      await runAt(page, 500);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(1510);
      expect((await measurePageGeometry(page)).documentHeight).toBe(1020);
    } finally {
      await close();
    }
  }, 60_000);

  test("per screen, a link a looping animation lifts across a screen edge counts where its first frame puts it", async () => {
    // At its first frame the lifted link starts at 850 px, on screen 2;
    // halfway through the cycle it is 100 px higher and on screen 1. Both
    // the extractor's own read and the per-screen count of new controls
    // decide visibility from the transformed box.
    const { page, close } = await open("page-metrics-motion-screens.html");
    try {
      await runAt(page, 0);
      const first = await extractPerScreenMetrics(page, 6);
      expect(first.map((s) => s.interactiveElementCount)).toEqual([1, 1, 0]);
      await runAt(page, 1000);
      expect(await page.evaluate(() => document.querySelector(".lift a")!.getBoundingClientRect().top)).toBeCloseTo(750, 1);
      expect(await extractPerScreenMetrics(page, 6)).toEqual(first);
    } finally {
      await close();
    }
  }, 60_000);

  test("a loop inside an open shadow root is held too", async () => {
    // document.getAnimations() leaves out an animation whose target is in a
    // shadow tree. Here one lifts a slotted light-DOM link across the screen
    // edge, as in the test above, from inside the shadow root.
    const { page, close } = await open("page-metrics-motion-shadow.html");
    try {
      await runAt(page, 0);
      const first = await extractPerScreenMetrics(page, 6);
      expect(first.map((s) => s.interactiveElementCount)).toEqual([1, 1, 0]);
      await runAt(page, 1000);
      expect(await page.evaluate(() => document.querySelector(".host a")!.getBoundingClientRect().top)).toBeCloseTo(750, 1);
      expect(await extractPerScreenMetrics(page, 6)).toEqual(first);
    } finally {
      await close();
    }
  }, 60_000);

  test("motion the hold leaves alone is read where it stands", async () => {
    // Two links lifted 100 px onto screen 1, one by a one-shot animation
    // halfway through a long run and one by a loop the page paused halfway.
    // Both are counted where they are now, on screen 1; a hold that sought
    // them to their first frame would count them on screen 2.
    const { page, close } = await open("page-metrics-motion-exclusions.html");
    try {
      // Halfway: 1000 s into the one-shot's 2000 s run, 1 s into the paused 2 s loop.
      expect(await page.evaluate(() => document.getAnimations().map((a) => {
        a.currentTime = a.playState === "paused" ? 1000 : 1_000_000;
        return a.playState;
      }))).toEqual(["running", "paused"]);
      const screens = await extractPerScreenMetrics(page, 6);
      expect(screens.map((s) => s.interactiveElementCount)).toEqual([3, 0, 0]);
    } finally {
      await close();
    }
  }, 60_000);

  test("the hold leaves the scroll where it was, and reads where it was asked to", async () => {
    // Scrolled to the bottom of the 1510 px page the turning bar makes at 90
    // degrees: the first frame is 1020 px tall, so the browser clamps the
    // offset during the read, and the hold must put it back.
    const geo = await open("page-metrics-motion-geometry.html");
    try {
      await runAt(geo.page, 500);
      await geo.page.evaluate(() => window.scrollTo(0, 710));
      expect(await geo.page.evaluate(() => window.scrollY)).toBe(710);
      expect((await measurePageGeometry(geo.page)).documentHeight).toBe(1020);
      expect(await geo.page.evaluate(() => window.scrollY)).toBe(710);
    } finally {
      await geo.close();
    }
    // A box above the fold that grows and shrinks forever: scroll anchoring
    // moves the offset when the hold changes its height, so without the
    // offset put back, each screen would be read from wherever the box's
    // cycle had anchored it.
    const grow = await open("page-metrics-motion-anchor.html");
    try {
      await runAt(grow.page, 0);
      const first = await extractPerScreenMetrics(grow.page, 6);
      expect(first.map((s) => s.interactiveElementCount)).toEqual([2, 2, 2, 0]);
      await runAt(grow.page, 1000);
      expect(await extractPerScreenMetrics(grow.page, 6)).toEqual(first);
    } finally {
      await grow.close();
    }
  }, 60_000);

  test("the page's own animations are as it left them after a measurement", async () => {
    // The hold must not become the page's state: a looping animation goes on
    // from where it was, one the page paused stays paused where the page put
    // it, and the page's CSS still controls them afterwards. A hold through
    // pause() and play() would fail the last check: once a script calls
    // either, animation-play-state no longer pauses that animation.
    const { page, close } = await open("page-metrics-latin.html");
    try {
      await runAt(page, 500);
      await page.evaluate(() => {
        const badge = document.getAnimations().find((a) => ((a.effect as KeyframeEffect).target as Element).classList.contains("badge"))!;
        badge.pause();
        badge.currentTime = 700;
      });
      await measureFixturePage(page);
      const states = () => page.evaluate(() => document.getAnimations().map((a) => ({
        badge: ((a.effect as KeyframeEffect).target as Element).classList.contains("badge"),
        state: a.playState,
        at: Math.round(Number(a.currentTime)),
      })));
      expect(await states()).toEqual([
        { badge: false, state: "running", at: 500 },
        { badge: true, state: "paused", at: 700 },
        { badge: false, state: "running", at: 500 },
      ]);
      await page.addStyleTag({ content: ".spin { animation-play-state: paused; }" });
      expect((await states()).map((a) => a.state)).toEqual(["paused", "paused", "paused"]);
    } finally {
      await close();
    }
  }, 60_000);
});
