/**
 * A failed click's suggestion names only elements its own list contains (v5 B25).
 *
 * Reported against 19.3.4 on cbrowser.ai: `click "Nonexistent Button Label
 * Qwerty"` failed with a suggestion listing `- BUTTON: ""` while the
 * availableElements in the same response had no empty-text button. The
 * suggestion came from smartClick's own raw scan (`button, a, [role=button]`,
 * hidden ones included, DOM order); availableElements came from
 * getAvailableClickables (visible only). Both are now one named, visible list.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-click-list-"));
const { parseNLTestSuite, runNLTestSuite } = await import("../src/testing/nl-test-suite.js");
const { CBrowser, namedClickables } = await import("../src/browser.js");

// Shaped like cbrowser.ai's header: a hidden nameless mobile-menu toggle first
// in DOM order, a visible icon-only button with no accessible name, then named
// controls.
const FIXTURE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>click list</title>
<style>.mobile-menu-toggle{display:none} .icon{width:24px;height:24px}</style></head><body>
<header><button class="mobile-menu-toggle"></button>
<button class="icon"><svg width="16" height="16" aria-hidden="true"><rect width="16" height="16"/></svg></button>
<a href="#pricing">Pricing</a> <a href="#docs">Docs</a></header>
<main><h1>Click list fixture</h1><button type="button">Sign up</button></main>
</body></html>`;

let server: ReturnType<typeof Bun.serve>;
let url: string;
beforeAll(() => {
  server = Bun.serve({ port: 0, fetch: () => new Response(FIXTURE, { headers: { "content-type": "text/html; charset=utf-8" } }) });
  url = `http://localhost:${server.port}/`;
});
afterAll(() => { server?.stop(true); });

/** `- TAG: "text"` lines of a suggestion, as [tag, text]. */
const suggested = (s: string) => [...s.matchAll(/^- ([A-Z0-9]+): "(.*)"$/gm)].map((m) => [m[1].toLowerCase(), m[2]] as const);

describe("namedClickables, pure", () => {
  test("drops elements without an accessible name, keeps order", () => {
    const list = [{ text: "" }, { text: "  " }, { text: "Pricing" }, { text: "Sign up" }];
    expect(namedClickables(list)).toEqual([{ text: "Pricing" }, { text: "Sign up" }]);
  });
});

describe("nl_test click failure: suggestion and availableElements agree", () => {
  test("every element the suggestion names is in availableElements, and none is nameless", async () => {
    const suite = parseNLTestSuite(`# missing\ngo to ${url}\nclick "Nonexistent Button Label Qwerty"\n`, "b25");
    const r = await runNLTestSuite(suite, { headless: true, screenshotOnFailure: false });
    const step = (r.testResults[0].stepResults as Array<{ action: string; passed: boolean; error?: { suggestion?: string; availableElements?: Array<{ tag: string; text: string }> } }>)
      .find((s) => s.action === "click")!;
    expect(step.passed).toBe(false);
    const listed = step.error?.availableElements ?? [];
    const named = suggested(step.error?.suggestion ?? "");

    expect(named.length).toBeGreaterThan(0); // the suggestion still offers something
    expect(named.map(([, t]) => t)).not.toContain("");
    expect(listed.map((e) => e.text.trim())).not.toContain("");
    for (const [tag, text] of named) {
      expect(listed.some((e) => e.tag === tag && e.text === text), `${tag} "${text}" offered but not listed`).toBe(true);
    }
    // The named controls are the ones offered.
    expect(named.map(([, t]) => t)).toEqual(expect.arrayContaining(["Pricing", "Docs", "Sign up"]));
  }, 120_000);
});

describe("smartClick failure carries the list its suggestion was built from", () => {
  test("availableElements on the result matches the suggestion's lines", async () => {
    const b = new CBrowser({ headless: true });
    try {
      await b.navigate(url);
      const res = await b.smartClick("Nonexistent Button Label Qwerty", { maxRetries: 1 });
      expect(res.success).toBe(false);
      const named = suggested(res.aiSuggestion ?? "");
      expect(named.length).toBeGreaterThan(0);
      expect(named).toEqual((res.availableElements ?? []).slice(0, 10).map((e) => [e.tag, e.text] as const));
    } finally {
      await b.close();
    }
  }, 120_000);
});
