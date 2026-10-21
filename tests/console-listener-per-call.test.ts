/**
 * hunt_bugs and the heuristic journey leave no console listener on the tab (v8 B27).
 *
 * Found 2026-10-10 while verifying the B27 fix, which stopped navigate adding a
 * page.on("console") per call: huntBugs (src/analysis/bug-hunter.ts) and the
 * heuristic CBrowser.journey (src/browser.ts) did the same and never removed
 * theirs. They run on CBrowser's shared page, so in a long-lived hosted session
 * every hunt_bugs or journey call left one more closure and array attached to
 * the tab. Both now remove their listener in a finally, also when they throw.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-listener-per-call-"));

const { CBrowser } = await import("../src/browser.js");
const { huntBugs } = await import("../src/analysis/bug-hunter.js");
const { isApiKeyConfigured } = await import("../src/cognitive/index.js");

const html = (body: string) => new Response(
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>${body}</body></html>`,
  { headers: { "content-type": "text/html; charset=utf-8" } },
);

const PAGES: Record<string, () => Response> = {
  "/": () => html(`<script>console.error("start-err")</script><main><a href="/next">Next page</a></main>`),
  "/next": () => html(`<script>console.error("next-err")</script><main><p>next</p></main>`),
};

let server: ReturnType<typeof Bun.serve>;
let base: string;
let b: InstanceType<typeof CBrowser>;
// With a key configured, journey() takes the paid cognitive path instead of the
// heuristic one this file is about.
const savedKey = process.env.ANTHROPIC_API_KEY;

beforeAll(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  server = Bun.serve({
    port: 0,
    fetch: (req) => {
      const page = PAGES[new URL(req.url).pathname];
      return page ? page() : new Response("not found", { status: 404 });
    },
  });
  base = `http://localhost:${server.port}`;
  b = new CBrowser({ headless: true });
});

afterAll(async () => {
  await b?.close();
  server?.stop(true);
  if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
});

/** Make the next navigate() throw, so the caller's error path runs. */
const failingNavigate = async <T>(fn: () => Promise<T>): Promise<void> => {
  const target = b as unknown as { navigate: () => Promise<never> };
  target.navigate = async () => { throw new Error("navigate failed (test)"); };
  try {
    await expect(fn()).rejects.toThrow("navigate failed (test)");
  } finally {
    delete (b as unknown as { navigate?: unknown }).navigate;
  }
};

describe("hunt_bugs", () => {
  test("three calls leave the tab's console listener count unchanged and still report the page's console error", async () => {
    const page = await b.getPage();
    const before = page.listenerCount("console");
    let last: Awaited<ReturnType<typeof huntBugs>> | undefined;
    for (let i = 0; i < 3; i++) last = await huntBugs(b, `${base}/`, { maxPages: 1, timeout: 30_000 });
    expect(page.listenerCount("console")).toBe(before);
    expect(last!.bugs.some((x) => x.type === "console-error" && x.description.includes("start-err"))).toBe(true);
  }, 120_000);

  test("a call that throws removes its listener too", async () => {
    const page = await b.getPage();
    const before = page.listenerCount("console");
    await failingNavigate(() => huntBugs(b, `${base}/`, { maxPages: 1, timeout: 30_000 }));
    expect(page.listenerCount("console")).toBe(before);
  }, 60_000);
});

describe("journey", () => {
  // The heuristic explorer this block used to pin was removed in 20.0.0. Without a
  // key journey() now refuses before it touches the tab, so it cannot leak a listener.
  test("without a key it refuses and leaves the tab's console listeners alone", async () => {
    expect(isApiKeyConfigured()).toBe(false);
    const page = await b.getPage();
    const before = page.listenerCount("console");
    await expect(b.journey({ persona: "first-timer", startUrl: `${base}/`, goal: "zzqx", maxSteps: 1 }))
      .rejects.toThrow("needs an Anthropic API key");
    expect(page.listenerCount("console")).toBe(before);
  }, 60_000);
});
