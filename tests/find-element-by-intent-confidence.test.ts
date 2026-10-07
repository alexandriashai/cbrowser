/**
 * find_element_by_intent reports confidence to 2 decimals.
 *
 * The 2026-10-06 bug report (LOW-07, BUG-01) quoted 0.9999999999999999 and
 * 0.7749999999999999 from the live tool: float sums printed raw. Rounding happens
 * once, in buildElementResult, after the clamp. It is display only: a 1282-case
 * side-by-side run against 6da7718 returned the same selector and description for
 * every case (2026-10-07). BUG-01's ranking defects are deliberately NOT fixed here.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";
import { findElementByIntent } from "../src/analysis/natural-language.js";

let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
}, 120_000);
afterAll(async () => { await browser?.close(); }, 30_000);

const doc = (body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>${body}</body></html>`;

/** The report's shape: the header's first <button> is unrelated to the intent. */
const REPORT = doc(`<header><a href="/">Brand</a><button>Capabilities</button>
  <a data-testid="signup-button" data-slot="button" href="/account/register/">Sign up</a></header>
  <main><h1>Hello</h1><p>Body text</p><a href="/privacy">Privacy</a></main>`);

async function confidence(html: string, intent: string): Promise<number | null> {
  await page.setContent(html);
  const r = await findElementByIntent({ getPage: async () => page } as any, intent);
  return r ? r.confidence : null;
}

const twoDecimals = (c: number) => Math.round(c * 100) / 100 === c;

describe("find_element_by_intent confidence is rounded to 2 decimals", () => {
  test("the reported 0.9999999999999999 case now reports 1", async () => {
    expect(await confidence(REPORT, "sign up button in the header")).toBe(1);
  });

  test("every result is within (0,1] with at most 2 decimals", async () => {
    const intents = ["sign up button in the header", "Sign up button", "Sign up", "header", "first link",
      "last link", "privacy link", "brand", "capabilities button", "link to create an account", "Log in"];
    let seen = 0;
    for (const intent of intents) {
      const c = await confidence(REPORT, intent);
      if (c === null) continue;
      seen++;
      expect(c, intent).toBeGreaterThan(0);
      expect(c, intent).toBeLessThanOrEqual(1);
      expect(twoDecimals(c), `${intent} -> ${c}`).toBe(true);
    }
    expect(seen, "the intents must produce results, or this proves nothing").toBeGreaterThan(5);
  });
});
