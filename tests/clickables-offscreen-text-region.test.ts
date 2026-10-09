/**
 * The element lists name below-fold elements and put footer links in the footer.
 *
 * Reported on click verbose output for cbrowser.ai: availableElements listed
 * below-fold buttons with text "" and labelled the footer's links header-nav.
 *
 *   - text came from innerText only. innerText is "" for an element inside a
 *     render-skipped subtree, and cbrowser.ai sets
 *     `main>section:nth-child(n+3){content-visibility:auto}`;
 *   - classifyRegion tested `nav` before `footer`, and the site's footer holds
 *     its link groups in <nav aria-label="Product links">.
 *
 * The same builder feeds click --verbose (CLI and MCP) and the cognitive
 * journey's element list and region grouping; the headings outline the journey
 * also reads had the same innerText-only defect and dropped those headings.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { CBrowser } from "../src/browser.js";

const FIXTURE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>offscreen</title>
<style>
  .spacer { height: 3000px; }
  .far { content-visibility: auto; contain-intrinsic-size: auto 600px; }
</style></head><body>
<header><nav aria-label="Main"><a href="#home">Home</a></nav></header>
<main>
  <section><h1>Top of page</h1></section>
  <div class="spacer"></div>
  <section class="far" id="far">
    <h2>Below the fold heading</h2>
    <button type="button" id="hunt">Hunt bugs</button>
    <label for="email">Work email</label><input id="email" type="email">
  </section>
  <article><header><a href="#card" id="card-link">Card title link</a></header><p>card</p></article>
</main>
<footer><nav aria-label="Product links"><a href="#p" id="product-link">Product link</a></nav></footer>
</body></html>`;

let server: ReturnType<typeof Bun.serve>;
let browser: CBrowser;

beforeAll(async () => {
  server = Bun.serve({ port: 0, fetch: () => new Response(FIXTURE, { headers: { "content-type": "text/html" } }) });
  browser = new CBrowser({ headless: true, viewportWidth: 1280, viewportHeight: 800 });
  await browser.launch();
  await browser.navigate(`http://localhost:${server.port}/`);
});

afterAll(async () => {
  try { await browser?.close(); } catch { /* closing is not the assertion */ }
  server?.stop(true);
});

describe("precondition: the fixture reproduces the empty innerText", () => {
  test("the below-fold button's innerText is empty while its textContent is not", async () => {
    // Without this the text assertions below would pass for the wrong reason.
    const page = await browser.getPage();
    const probe = await page.evaluate(() => {
      const b = document.getElementById("hunt") as HTMLElement;
      const l = document.querySelector('label[for="email"]') as HTMLElement;
      return { button: b.innerText, buttonContent: b.textContent, label: l.innerText };
    });
    expect(probe.button).toBe("");
    expect(probe.buttonContent).toBe("Hunt bugs");
    expect(probe.label).toBe("");
  });
});

describe("getAvailableClickables", () => {
  test("a button in a render-skipped section is listed with its text", async () => {
    const els = await browser.getAvailableClickables();
    const hunt = els.find((e) => e.selector === "#hunt");
    expect(hunt).toBeDefined();
    expect(hunt!.text).toBe("Hunt bugs");
  });

  test("a link in footer > nav is in the footer region", async () => {
    const els = await browser.getAvailableClickables();
    expect(els.find((e) => e.selector === "#product-link")?.region).toBe("footer");
  });

  test("the page header's nav is still header-nav", async () => {
    const els = await browser.getAvailableClickables();
    expect(els.find((e) => e.text === "Home")?.region).toBe("header-nav");
  });

  test("a card's own <header> inside an article is not the page header", async () => {
    const els = await browser.getAvailableClickables();
    const card = els.find((e) => e.selector === "#card-link");
    expect(card).toBeDefined();
    expect(card!.region).not.toBe("header-nav");
  });
});

describe("siblings fed by the same page", () => {
  test("the headings outline keeps the below-fold heading", async () => {
    const ctx = await browser.getViewportContext();
    expect(ctx.headings.map((h) => h.text)).toContain("Below the fold heading");
  });

  test("a below-fold input keeps its label", async () => {
    const inputs = await browser.getAvailableInputs();
    expect(inputs.find((i) => i.selector.includes("email"))?.label).toBe("Work email");
  });
});
