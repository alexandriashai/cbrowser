/**
 * chaos_test survives a blockUrls glob that is not a valid pattern (v8 B27).
 *
 * Found 2026-10-10 in the B27 listener sweep: chaos_test compiled each "*.ext"
 * glob into a RegExp inside its route handler, so blockUrls ["*.("] threw
 * SyntaxError there on every request. Playwright rethrows a route handler's
 * rejection from an event listener, where nothing catches it: it escaped the
 * caller's try/catch, and under Node (both hosted servers) an unhandled
 * rejection ends the process. Patterns are now compiled up front; an invalid
 * one is reported in `errors`, and the handler cannot reject.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-chaos-pattern-"));

const { CBrowser } = await import("../src/browser.js");
const { runChaosTest, applyChaos } = await import("../src/analysis/chaos-testing.js");

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>c</title>
<link rel="stylesheet" href="/a.css"></head><body><main><p>chaos</p></main></body></html>`;

let server: ReturnType<typeof Bun.serve>;
let base: string;
let b: InstanceType<typeof CBrowser>;

// What a route handler throws surfaces as an unhandled rejection: fatal under
// Node, so captured here to assert that none happened.
const escaped: string[] = [];
const onEscaped = (e: unknown) => { escaped.push(e instanceof Error ? e.message : String(e)); };

beforeAll(() => {
  process.on("unhandledRejection", onEscaped);
  process.on("uncaughtException", onEscaped);
  server = Bun.serve({
    port: 0,
    fetch: (req) => new URL(req.url).pathname === "/"
      ? new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } })
      : new Response("p { color: black }", { headers: { "content-type": "text/css" } }),
  });
  base = `http://localhost:${server.port}`;
  b = new CBrowser({ headless: true });
});

afterAll(async () => {
  await b?.close();
  server?.stop(true);
  process.off("unhandledRejection", onEscaped);
  process.off("uncaughtException", onEscaped);
});

beforeEach(() => { escaped.length = 0; });

const settle = () => new Promise((r) => setTimeout(r, 300));

describe("chaos_test blockUrls", () => {
  test("an invalid glob is reported in errors, and nothing escapes", async () => {
    const r = await runChaosTest(b, `${base}/`, { blockUrls: ["*.("] });
    await settle();
    expect(escaped).toEqual([]);
    expect(r.passed).toBe(false);
    expect(r.errors).toContain('blockUrls pattern "*.(" is not a valid pattern; nothing was blocked for it');
    expect(r.impact.pageCompleted).toBe(true);
  }, 90_000);

  test("the valid patterns beside it still block", async () => {
    const r = await runChaosTest(b, `${base}/`, { blockUrls: ["*.(", "*.css"] });
    await settle();
    expect(escaped).toEqual([]);
    expect(r.impact.blockedResources).toContain("stylesheet: /a.css");
    expect(r.errors).toEqual(['blockUrls pattern "*.(" is not a valid pattern; nothing was blocked for it']);
  }, 90_000);

  test("applyChaos refuses an invalid glob before changing anything", async () => {
    await expect(applyChaos(b, { blockUrls: ["*.("] })).rejects.toThrow('Invalid blockUrls pattern(s): "*.("');
    await b.navigate(`${base}/`);
    await settle();
    expect(escaped).toEqual([]);
  }, 90_000);
});
