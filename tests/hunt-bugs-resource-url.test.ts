/**
 * hunt_bugs names the resource behind a "Failed to load resource" error (v5 B24).
 *
 * Reported against 19.3.4 on cbrowser.ai/blog: a high-severity console-error
 * "Failed to load resource: the server responded with a status of 404 ()" with
 * `url` = the page, so nobody could tell which asset 404'd. Chrome puts the
 * resource in the console message's location, not its text; it is now kept as
 * `resourceUrl` and in the description, and two missing assets are two bugs.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-hunt-resource-"));
const { CBrowser } = await import("../src/browser.js");
const { huntBugs, huntBugsResponse } = await import("../src/analysis/bug-hunter.js");

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>missing assets</title>
<link rel="stylesheet" href="/missing.css"></head><body><main><h1>Assets</h1>
<img src="/gone.png" alt="" width="10" height="10"><p>Text.</p></main></body></html>`;

let server: ReturnType<typeof Bun.serve>;
let base: string;
beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch: (req) => new URL(req.url).pathname === "/"
      ? new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } })
      : new Response("not found", { status: 404 }),
  });
  base = `http://localhost:${server.port}`;
});
afterAll(() => { server?.stop(true); });

describe("hunt_bugs 404 console errors", () => {
  test("each failed resource is its own bug, naming the resource", async () => {
    const b = new CBrowser({ headless: true });
    try {
      const r = await huntBugs(b, `${base}/`, { maxPages: 1, timeout: 30000 });
      const failed = r.bugs.filter((x) => x.type === "console-error" && /^Failed to load resource/.test(x.description));
      expect(failed.length).toBeGreaterThanOrEqual(2);
      const resources = failed.map((x) => x.resourceUrl).sort();
      expect(resources).toEqual(expect.arrayContaining([`${base}/gone.png`, `${base}/missing.css`]));
      for (const x of failed) {
        expect(x.url).toBe(`${base}/`); // still the page
        expect(x.description).toContain(x.resourceUrl!);
      }
      // And it reaches the MCP response, whose bug map lists fields by name
      // (live on 19.3.5 the field was dropped there; only the description had it).
      const shown = (huntBugsResponse(r).bugs as Array<{ description: string; resourceUrl?: string }>)
        .filter((x) => /^Failed to load resource/.test(x.description));
      expect(shown.map((x) => x.resourceUrl).sort()).toEqual(expect.arrayContaining([`${base}/gone.png`, `${base}/missing.css`]));
    } finally {
      await b.close();
    }
  }, 120_000);
});
