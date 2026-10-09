/**
 * An animation barrier is a 2.2.2 (Pause, Stop, Hide) finding, not 2.3.1.
 *
 * WCAG 2.3.1 "Three Flashes or Below Threshold" is a Level A seizure-safety
 * criterion about flash RATE. Nothing in the empathy audit measures flash rate;
 * the animation check is a class-name match on [class*=animate|slider|carousel].
 * Yet the mapping cited ["2.2.2", "2.3.1"] with violation "2.2.2", and because
 * wcagAdvisoryCriteria is only set when violation is null, deriveWcagViolations
 * published BOTH as violations. Observed 2026-10-06 on cbrowser.ai:
 * allWcagViolations ["2.2.2","2.3.1","1.4.1","2.1.1","2.5.1"] -- a seizure
 * finding asserted against a page nobody had measured for flashing.
 *
 * Runs the real audit against a local fixture page (no network).
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";
import { runEmpathyAudit } from "../src/analysis/accessibility-empathy.js";

const HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixture</title>
<style>body{font:16px system-ui;margin:24px}.animate-pulse{animation:p 2s infinite}
@keyframes p{50%{opacity:.6}}</style></head><body>
<main><h1>Plans</h1><div class="animate-pulse">Limited offer</div>
<p>Plain text that is short.</p></main></body></html>`;
const URL = `data:text/html;charset=utf-8,${encodeURIComponent(HTML)}`;

let browser: Browser;
let page: Page;
let result: Awaited<ReturnType<typeof runEmpathyAudit>>;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  result = await runEmpathyAudit(URL, {
    disabilities: ["cognitive-adhd"],
    wcagLevel: "AA",
    maxSteps: 1,
    maxTime: 15,
    headless: true,
    scope: "viewport",
    page,
  });
}, 120_000);

afterAll(async () => { await browser?.close(); });

// Found by what it is, not by `element === "animation"`: that literal string
// WAS the defect B5 fixed (2026-10-09). The barrier is now located -- a unique
// selector and a rect -- so the element field names the animated div.
const isMotion = (b: { description: string }) => /^Moving content/.test(b.description);

describe("animation barrier criteria", () => {
  test("the fixture produces an animation barrier at all", () => {
    const anim = result.results[0].barriers.filter(isMotion);
    expect(anim.length).toBe(1);
  });

  test("the animation barrier cites 2.2.2 only", () => {
    const anim = result.results[0].barriers.find(isMotion)!;
    expect(anim.wcagCriteria).toEqual(["2.2.2"]);
  });

  test("the animation barrier is located, not the literal string \"animation\"", () => {
    const anim = result.results[0].barriers.find(isMotion)!;
    expect(anim.element).not.toBe("animation");
    expect(anim.element).toContain("div");
    expect(anim.rect).toBeDefined();
  });

  test("2.3.1 is not published as a violation; 2.2.2 still is", () => {
    expect(result.allWcagViolations).not.toContain("2.3.1");
    expect(result.allWcagViolations).toContain("2.2.2");
  });
});
