/**
 * A click the journey resolves to an element's box is charged the same
 * pointing time as a hover: Stage B's Fitts' law on the box the pointer is
 * sent to, measured from the centre of the screen, plus the gaze-to-mouse lag.
 *
 * Before 21.0 such a click went out as page.mouse.click with no wait at all,
 * so only hovers, hover-clicks and clicks the journey could not resolve paid
 * to point. Now:
 *   - the coordinate click waits law time + gaze lag before the click, on the
 *     box it actually clicks (after the journey's own scroll, if any);
 *   - with human input on, humanClick's move and pre-click dwell pace the click
 *     and replace that wait;
 *   - if the coordinate click throws after the wait, the retry by name does not
 *     wait again;
 *   - with human input on, a hover, hover-click or click by name, which
 *     Playwright drives rather than humanClick, still waits law time + gaze
 *     lag once (before 21.0 it waited nothing).
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-journey-click-data-"));
process.env.CBROWSER_ARTIFACT_DIR = mkdtempSync(join(tmpdir(), "cb-journey-click-art-"));
delete process.env.ANTHROPIC_API_KEY;

const { MODEL_PROVENANCE } = await import("../src/visual/model-provenance.js");
const { runScenario, WORLD } = await import("./fixtures/journey-scenarios.js");
const { VIEWPORT } = await import("./fixtures/journey-world.js");
const { distanceToScreenCentre } = await import("../src/visual/demand-laws.js");

const v = (id: string) => MODEL_PROVENANCE[id]?.value;
const MS = 1000;
const U = (p: string) => `https://acme.example${p}`;
type Box = { selector: string; x: number; y: number; width: number; height: number };
const box = (page: string, selector: string) => WORLD[U(page)].elements.find((e: Box) => e.selector === selector)! as Box;

// power-user: age range 25-45 (no age slowdown), mouse jitter 2 (tremor 0.2).
const TREMOR = 2 / v("journey.fitts.jitterScale");
const motor = (distance: number, width: number) =>
  (v("law.fitts.intercept") * MS + v("law.fitts.slope") * MS * Math.log2(distance / Math.max(width, v("law.fitts.minWidth")) + 1)) * (1 + TREMOR * v("journey.fitts.tremorGain"));

async function clickDelays(action: string, startUrl: string, humanInput = false) {
  const r = await runScenario({
    name: "click-probe",
    options: { persona: "power-user", goal: "Find the price", startUrl, temporalContext: { now: "2026-10-21T10:00:00Z", timezone: "UTC" }, maxSteps: 1, humanInput },
    steps: [{ phase: "decide", monologue: "click", action }],
  });
  const gaze = (r.result as { finalState: { gazeMouseLag: number } }).finalState.gazeMouseLag;
  return { delays: r.delays, gaze, calls: r.calls };
}

describe("a coordinate click's pointing time", () => {
  test("a click on a listed element on screen waits the law's time for its box, plus the gaze lag", async () => {
    // The Pricing link: 80 x 30 at (600, 20), centre (640, 35), 365 px above
    // the centre (640, 400) of the 1280 x 800 screen.
    const b = box("/", "#nav-pricing");
    expect(Math.hypot(b.x + b.width / 2 - VIEWPORT.width / 2, b.y + b.height / 2 - VIEWPORT.height / 2)).toBe(365);
    const { delays, gaze, calls } = await clickDelays("click:Pricing", U("/"));
    expect(calls).toContain("mouse 640,35");
    const wait = motor(365, 30) + gaze;
    expect(gaze).toBe(v("journey.gazeLag.mean"));
    // (230 + 166 log2(365/30 + 1)) ms x 1.02 for the tremor, + 700 ms.
    expect(wait).toBeCloseTo(1564.27, 2);
    expect(delays).toContain(wait);
  });

  test("a click on a listed element below the fold waits for the box the journey's own scroll puts it at", async () => {
    // Pricing details: 140 x 30 at (100, 1600). The journey scrolls its centre
    // (1615) to the middle of the screen (scrollY 1215), so the pointer goes to
    // (170, 400): 470 px across from the centre, a 30 px target.
    const b = box("/", "#body-pricing");
    const index = WORLD[U("/")].elements.indexOf(b);
    const { delays, gaze, calls } = await clickDelays(`click:#${index}`, U("/"));
    expect(calls).toContain("mouse 170,1615");
    expect(delays).toContain(motor(470, 30) + gaze);
  });

  test("when the coordinate click throws after its wait, the retry by name does not wait again", async () => {
    // Enterprise pricing: 160 x 30 at (100, 1200) on a 1400 px page, a link to a
    // page that does not exist. The journey scrolls as far as the page goes
    // (600), so the pointer goes to (180, 615): 507.77 px, a 30 px target. The
    // click's navigation throws and the journey retries by name.
    const b = box("/pricing", "#enterprise");
    const sentTo = Math.hypot(180 - VIEWPORT.width / 2, 615 - VIEWPORT.height / 2);
    const { delays, gaze, calls } = await clickDelays("click:Enterprise pricing", U("/pricing"));
    expect(calls).toContain("mouse 180,1215");
    expect(delays.filter((d: number) => d === motor(sentTo, 30) + gaze)).toHaveLength(1);
    // Neither the retry's own geometry (the listed box, tiled) nor the fallback move is paid.
    const listed = distanceToScreenCentre(b, { viewportWidth: VIEWPORT.width, viewportHeight: VIEWPORT.height, scrollY: 0 }, "full_page");
    expect(delays).not.toContain(motor(listed, 30) + gaze);
    expect(delays).not.toContain(motor(v("journey.fitts.unlocatedDistancePx"), v("journey.fitts.unlocatedTargetWidthPx")) + gaze);
  });

  test("with human input on, humanClick's dwell replaces the wait: the law time is not also slept", async () => {
    const { delays, gaze, calls } = await clickDelays("click:Pricing", U("/"), true);
    expect(calls.some((c: string) => c.startsWith("mouse "))).toBe(true);
    expect(delays).not.toContain(motor(365, 30) + gaze);
  });
});

describe("with human input on, a mouse action humanClick does not drive", () => {
  // Hovers, hover-clicks and clicks by name go through Playwright (browser.hover,
  // browser.hoverClick, locator clicks), not humanClick, so there is no human
  // move or dwell to stand in for the law time. Each waits the law time and the
  // gaze lag once, as it does with human input off: 1564.27 ms for the Pricing
  // link (365 px, 30 px target).
  const once = (delays: number[], wait: number) => delays.filter((d) => d === wait).length;

  test("a hover waits the law's time for its box, plus the gaze lag, once", async () => {
    const { delays, gaze, calls } = await clickDelays("hover:Pricing", U("/"), true);
    expect(calls).toContain("hover Pricing");
    expect(motor(365, 30) + gaze).toBeCloseTo(1564.27, 2);
    expect(once(delays, motor(365, 30) + gaze)).toBe(1);
  });

  test("a click by selector waits the law's time for its box, plus the gaze lag, once", async () => {
    // "#nav-pricing" names the element by selector, which the coordinate click
    // does not take, so it is clicked by name.
    const { delays, gaze, calls } = await clickDelays("click:#nav-pricing", U("/"), true);
    expect(calls).toContain("hoverClick #nav-pricing -> #nav-pricing");
    expect(calls.some((c: string) => c.startsWith("mouse "))).toBe(false);
    expect(once(delays, motor(365, 30) + gaze)).toBe(1);
  });

  test("a hover-click waits the law's time for its target's box, plus the gaze lag, once", async () => {
    const { delays, gaze, calls } = await clickDelays("hoverclick:Pricing:Home", U("/"), true);
    expect(calls.some((c: string) => c.startsWith("hoverClick Pricing"))).toBe(true);
    expect(once(delays, motor(365, 30) + gaze)).toBe(1);
  });
});
