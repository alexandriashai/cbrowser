/**
 * hunt_bugs' empty-link check, on the first page and on crawled pages.
 *
 * Both copies compared a.href with "#" and "javascript:void(0)". a.href is the
 * resolved address, so href="#" read "http://site/page#" and href="" read the
 * page's own address: only an <a> with no href at all was ever reported.
 * Found 2026-11-15 writing the CMS worker's hunt_bugs job test.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { huntBugs, type BugReport } from "../src/analysis/bug-hunter.js";
import { CBrowser } from "../src/browser.js";

const head = (t: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${t}</title></head><body>`;
const SITE: Record<string, string> = {
  "/": `${head("home")}<a href="#main">Skip</a><main id="main"><h1>Home</h1>
    <a href="#">hash</a> <a href="javascript:void(0)">voidjs</a> <a href="">blank</a> <a>none</a>
    <a href="#section">anchor</a> <a href="/two">Two</a></main></body></html>`,
  "/two": `${head("two")}<main><h1>Two</h1><a href="#">crawledhash</a> <a href="/">Home</a></main></body></html>`,
};

let site: ReturnType<typeof Bun.serve>;
let browser: CBrowser;
let bugs: BugReport[] = [];

beforeAll(async () => {
  site = Bun.serve({
    port: 0,
    fetch: (req) => {
      const body = SITE[new URL(req.url).pathname];
      return body ? new Response(body, { headers: { "content-type": "text/html" } }) : new Response("not found", { status: 404 });
    },
  });
  browser = new CBrowser({ headless: true });
  await browser.launch();
  bugs = (await huntBugs(browser, `http://localhost:${site.port}/`, { maxPages: 2, timeout: 30000 })).bugs;
}, 90_000);

afterAll(async () => {
  try { await browser?.close(); } catch { /* closing is not the assertion */ }
  site?.stop(true);
});

const empty = (pathEnd: string) =>
  bugs.filter((b) => b.type === "broken-link" && new URL(b.url).pathname === pathEnd).map((b) => b.description);

describe("links with no target", () => {
  test("first page: #, javascript:void(0), href=\"\" and a bare <a> are each reported", () => {
    const d = empty("/").join(" | ");
    for (const text of ["hash", "voidjs", "blank", "none"]) expect(d).toContain(text);
  });

  test("first page: an in-page anchor and a skip link are not", () => {
    const d = empty("/").join(" | ");
    expect(d).not.toContain("anchor");
    expect(d).not.toContain("Skip");
    expect(empty("/").length).toBe(4);
  });

  test("crawled page: href=\"#\" is reported there too", () => {
    expect(empty("/two").join(" | ")).toContain("crawledhash");
  });
});
