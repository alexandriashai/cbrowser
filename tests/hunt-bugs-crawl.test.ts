/**
 * hunt_bugs: one identity per page, one severity per finding, every page listed.
 *
 * Reported on a 5-page crawl of cbrowser.ai: pagesVisited 5 while byPage named
 * fewer pages, the home page analysed twice, and an alt="" image graded
 * "medium" although the first-page check grades the same finding "low".
 *
 *   - the start URL was stored as typed; the site's `href="/"` resolves to
 *     `https://cbrowser.ai/`, which did not match, so home was crawled again;
 *   - byPage tallied only bugs, so a clean page did not appear at all;
 *   - crawled pages used `a11y-violation ? "high" : "medium"`, bypassing the
 *     first page's mapping (a11y-verify -> "low");
 *   - console errors on crawled pages were collected and never reported: the
 *     only flush ran once, before the crawl.
 *
 * tests/alt-attribute-classification.test.ts runs with maxPages 1, which is
 * why it never reached the crawled-page copy.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as hunter from "../src/analysis/bug-hunter.js";
import { CBrowser } from "../src/browser.js";
import { registerBugAnalysisTools } from "../src/mcp-tools/base/bug-analysis-tools.js";
import type { BugReport } from "../src/analysis/bug-hunter.js";

const { huntBugs } = hunter;
// Through the namespace so a missing export fails its own tests, not the file.
const pure = hunter as unknown as {
  normalizeCrawlUrl: (u: string) => string;
  severityFor: (i: { type: string; description?: string }) => string;
  huntBugsResponse: (r: { bugs: BugReport[]; pagesVisited: number; visitedUrls?: string[]; duration: number }, o?: { limit?: number; offset?: number }) => Record<string, unknown>;
};

const PIX = "data:image/gif;base64,R0lGODlhZABkAIAAAP///wAAACH5BAEAAAAALAAAAABkAGQAAAIhhI+py+0Po5y02ouz3rz7D4biSJbmiabqyrbuC8fyTFcFADs=";
const head = (t: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${t}</title></head><body>`;

/** A site whose only link points back at "/". */
const SOLO = `${head("solo")}<a href="#main">Skip</a><main id="main"><h1>Solo</h1><a href="/">Home</a></main></body></html>`;

/** Home -> /two (alt="" image, a console error) and /three/ (clean). */
const SITE: Record<string, string> = {
  "/": `${head("home")}<a href="#main">Skip</a><main id="main"><h1>Home</h1>
    <a href="/">Home</a> <a href="/two">Two</a> <a href="/three/">Three</a></main></body></html>`,
  "/two": `${head("two")}<main><h1>Two</h1><img src="${PIX}" width="100" height="100" alt="">
    <a href="/">Home</a></main><script>console.error("page two broke");</script></body></html>`,
  "/three/": `${head("three")}<main><h1>Three</h1><a href="/">Home</a></main></body></html>`,
};

let solo: ReturnType<typeof Bun.serve>;
let site: ReturnType<typeof Bun.serve>;
let browser: CBrowser;

beforeAll(async () => {
  solo = Bun.serve({ port: 0, fetch: () => new Response(SOLO, { headers: { "content-type": "text/html" } }) });
  site = Bun.serve({
    port: 0,
    fetch: (req) => {
      const body = SITE[new URL(req.url).pathname];
      return body
        ? new Response(body, { headers: { "content-type": "text/html" } })
        : new Response("not found", { status: 404 });
    },
  });
  browser = new CBrowser({ headless: true });
  await browser.launch();
});

afterAll(async () => {
  try { await browser?.close(); } catch { /* closing is not the assertion */ }
  solo?.stop(true);
  site?.stop(true);
});

describe("pure helpers", () => {
  test("normalizeCrawlUrl: one identity per page", () => {
    const n = pure.normalizeCrawlUrl;
    expect(n("http://localhost:3000")).toBe(n("http://localhost:3000/"));
    expect(n("http://localhost:3000/#top")).toBe("http://localhost:3000/");
    expect(n("https://a.test/pricing/")).toBe("https://a.test/pricing");
    expect(n("https://a.test/pricing/?q=1#x")).toBe("https://a.test/pricing?q=1");
    expect(n("not a url")).toBe("not a url");
  });

  test("severityFor: alt=\"\" verify is low, a violation high, placeholder-only medium", () => {
    expect(pure.severityFor({ type: "a11y-verify" })).toBe("low");
    expect(pure.severityFor({ type: "a11y-violation", description: "Image has no alt attribute" })).toBe("high");
    expect(pure.severityFor({ type: "a11y-violation", description: "Input relies only on placeholder for label" })).toBe("medium");
    expect(pure.severityFor({ type: "console-error", description: "x" })).toBe("high");
    expect(pure.severityFor({ type: "missing-image" })).toBe("medium");
  });

  test("huntBugsResponse lists every visited page in byPage, clean ones at 0", () => {
    const r = pure.huntBugsResponse({
      bugs: [{ type: "broken-link", severity: "medium", description: "Empty link", url: "https://a.test/" }],
      pagesVisited: 3,
      visitedUrls: ["https://a.test/", "https://a.test/b", "https://a.test/c"],
      duration: 1,
    });
    expect(r.byPage).toEqual({ "https://a.test/": 1, "https://a.test/b": 0, "https://a.test/c": 0 });
    expect(r.visitedUrls).toEqual(["https://a.test/", "https://a.test/b", "https://a.test/c"]);
  });
});

describe("huntBugs crawl", () => {
  test("a start URL without a trailing slash and a self-link to / is ONE page", async () => {
    const r = await huntBugs(browser, `http://localhost:${solo.port}`, { maxPages: 5 });
    expect(r.pagesVisited).toBe(1);
    expect((r as { visitedUrls?: string[] }).visitedUrls).toEqual([`http://localhost:${solo.port}/`]);
  }, 60_000);

  test("alt=\"\" on a crawled page is graded low, as on the first page", async () => {
    const r = await huntBugs(browser, `http://localhost:${site.port}/`, { maxPages: 2 });
    const verify = r.bugs.filter((b) => b.type === "a11y-verify");
    expect(verify.length).toBe(1);
    expect(verify[0].url).toBe(`http://localhost:${site.port}/two`);
    expect(verify[0].severity).toBe("low");
  }, 60_000);

  test("a console error on a crawled page is reported against that page", async () => {
    const r = await huntBugs(browser, `http://localhost:${site.port}/`, { maxPages: 3 });
    const errs = r.bugs.filter((b) => b.type === "console-error" && /page two broke/.test(b.description));
    expect(errs.length).toBe(1);
    expect(errs[0].url).toBe(`http://localhost:${site.port}/two`);
  }, 60_000);

  test("visitedUrls lists each page once, where it landed", async () => {
    const r = await huntBugs(browser, `http://localhost:${site.port}`, { maxPages: 10 });
    const p = site.port;
    expect((r as { visitedUrls?: string[] }).visitedUrls).toEqual([
      `http://localhost:${p}/`, `http://localhost:${p}/two`, `http://localhost:${p}/three`,
    ]);
    expect(r.pagesVisited).toBe(3);
  }, 60_000);
});

describe("the hunt_bugs tool", () => {
  test("byPage names every visited page, pagesVisited matches, visitedUrls returned", async () => {
    type Handler = (a: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    const handlers: Record<string, Handler> = {};
    registerBugAnalysisTools(
      { registerTool: (name: string, _c: unknown, h: Handler) => { handlers[name] = h; } } as never,
      { getBrowser: async () => browser } as never,
    );
    const res = await handlers["hunt_bugs"]({ url: `http://localhost:${site.port}/`, maxPages: 3, limit: 25, offset: 0, timeout: 60000 });
    const r = JSON.parse(res.content[0].text);
    const p = site.port;
    expect(r.pagesVisited).toBe(3);
    expect(r.visitedUrls).toEqual([`http://localhost:${p}/`, `http://localhost:${p}/two`, `http://localhost:${p}/three`]);
    expect(Object.keys(r.byPage).sort()).toEqual([...r.visitedUrls].sort());
    expect(r.byPage[`http://localhost:${p}/three`]).toBe(0);
  }, 60_000);
});
