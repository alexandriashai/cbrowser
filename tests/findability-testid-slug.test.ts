/**
 * The data-testid that agent_ready_audit and remediation_patches suggest for a
 * card link must be made of words, not glued text. Report item B47,
 * 2026-10-10.
 *
 * Measured on cbrowser.ai that day, remediation_patches suggested
 *   data-testid="researchattentionaug-4-2026we-beat-two"
 *   data-testid="uxaccessibilityaug-4-2026your-mega-menu"
 * for the homepage's blog cards. They sit in a section with
 * content-visibility:auto, ~6,500px down, where innerText is "" (the browser
 * has not laid them out), so the code fell back to textContent, which joins
 * text nodes with no separator. Even spaced, the name would start with the
 * badges and the date that every card shares; the heading is what names it.
 *
 * Local fixtures (page.setContent); the shipped pipeline (runAgentReadyAudit).
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser } from "playwright";
import { runAgentReadyAudit } from "../src/analysis/agent-ready-audit.js";
import type { AgentReadyAuditResult } from "../src/types.js";

const BADGES = `<div style="display:flex;gap:8px">
  <span style="display:inline-flex">research</span><span style="display:inline-flex">attention</span>
  <span style="margin-left:auto">Aug 4, 2026</span></div>`;

const FIXTURE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Testid slug fixture page</title></head><body><main>
  <h1>Home</h1>
  <div style="height:4000px">spacer</div>
  <section style="content-visibility:auto;contain-intrinsic-size:auto 600px">
    <a class="group rounded-xl" href="/blog/we-beat-two/">${BADGES}
      <h3>We Beat Two Frontier Vision Models With Arithmetic</h3>
      <p>Our attention model lost to a blurred circle in the morning.</p>Read more</a>
    <a class="group plain" href="/reports/"><div style="display:flex"><span>Visual Reports</span><span>Gallery</span></div></a>
  </section>
</main></body></html>`;

let browser: Browser;
let result: AgentReadyAuditResult;

const exampleFor = (needle: string) =>
  result.issues.find((i) => i.detectionMethod === "findability-score-check" && (i.elementHtml || "").includes(needle))?.codeExample;

beforeAll(async () => {
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.setContent(FIXTURE);
  try {
    result = await runAgentReadyAudit("https://fixture.invalid/", { page, headless: true });
  } finally {
    await ctx.close();
  }
}, 120_000);

afterAll(async () => { await browser?.close(); });

describe("a card under content-visibility:auto, far below the fold", () => {
  test("the fixture really is skipped: the card's innerText is empty", async () => {
    // Guards the test itself: if the browser ever lays this out, the cases
    // below stop exercising the fallback they exist for.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.setContent(FIXTURE);
    const inner = await page.$eval('a[href="/blog/we-beat-two/"]', (a) => (a as HTMLElement).innerText);
    await ctx.close();
    expect(inner).toBe("");
  });

  test("its testid is cut from the heading, not from the badges and date", () => {
    const ex = exampleFor('href="/blog/we-beat-two/"');
    expect(ex).toBeDefined();
    expect(ex).toContain(`data-testid="we-beat-two-frontier-vision-models-with"`);
    expect(ex).not.toContain("researchattention");
  });

  test("a card with no heading keeps its words apart", () => {
    const ex = exampleFor('href="/reports/"');
    expect(ex).toBeDefined();
    expect(ex).toContain(`data-testid="visual-reports-gallery"`);
  });
});
