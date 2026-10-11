/**
 * get_console_messages returns what the page logged, from the start (v8 B27).
 *
 * Reported 2026-10-10 against 19.3.6: the tool patched console.* from page
 * script on its FIRST call, so it returned [] for everything logged before that
 * call (page load included), lost its buffer on every navigation, never saw
 * browser-generated messages such as "Failed to load resource" (a 404 is not a
 * console.* call), and its "warning" filter never matched because the patch
 * recorded "warn". navigate meanwhile added a fresh page.on("console") listener
 * on every call and never removed it.
 *
 * Now CBrowser keeps one console + pageerror listener per tab, attached when the
 * tab is created, writing a ring buffer of the latest 500 entries; the tool and
 * navigate both read it.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-console-capture-"));

const { CBrowser } = await import("../src/browser.js");
const { registerBrowserStateTools } = await import("../src/mcp-tools/base/browser-state-tools.js");

const html = (body: string) => new Response(
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>${body}</body></html>`,
  { headers: { "content-type": "text/html; charset=utf-8" } },
);

const PAGES: Record<string, () => Response> = {
  "/": () => html(`<script>console.log("hi")</script><img src="/missing" alt="" width="1" height="1"><p>x</p>`),
  "/a": () => html(`<script>console.log("from-a")</script><p>a</p>`),
  "/b": () => html(`<script>console.warn("from-b")</script><p>b</p>`),
  "/clean": () => html(`<p>clean</p>`),
  "/throws": () => html(`<script>throw new Error("boom-b27")</script><p>t</p>`),
  "/flood": () => html(`<script>for (let i = 1; i <= 600; i++) console.log("n" + i)</script><p>f</p>`),
};

type Msg = { type: string; text: string; timestamp: number; source?: string; url?: string; pageUrl?: string };
type Body = { messages: Msg[]; count: number; dropped?: number };
type Result = { isError?: boolean; content: Array<{ type: string; text: string }> };
type Handler = (args: Record<string, unknown>) => Promise<Result>;

let server: ReturnType<typeof Bun.serve>;
let base: string;
let b: InstanceType<typeof CBrowser>;
let handler: Handler;

const read = async (args: Record<string, unknown> = {}): Promise<Body> => {
  const r = await handler({ filter: "all", clear: false, ...args });
  expect(r.isError).toBeUndefined();
  return JSON.parse(r.content[0].text) as Body;
};

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    fetch: (req) => {
      const page = PAGES[new URL(req.url).pathname];
      return page ? page() : new Response("not found", { status: 404 });
    },
  });
  base = `http://localhost:${server.port}`;
  b = new CBrowser({ headless: true });
  registerBrowserStateTools({
    registerTool: (name: string, _cfg: unknown, h: Handler) => {
      if (name === "get_console_messages") handler = h;
    },
    tool: () => {}, registerResource: () => {}, resource: () => {},
  } as never, { getBrowser: async () => b } as never);
});

afterAll(async () => {
  await b?.close();
  server?.stop(true);
});

describe("get_console_messages", () => {
  test("returns messages logged during page load and the browser's own 404 error, on the first call", async () => {
    await b.navigate(`${base}/`);
    const body = await read({ clear: true });
    const hi = body.messages.find((m) => m.text === "hi");
    expect(hi).toBeDefined();
    expect(hi!.type).toBe("log");
    expect(hi!.pageUrl).toBe(`${base}/`);
    const missing = body.messages.find((m) => m.type === "error" && /Failed to load resource/.test(m.text));
    expect(missing).toBeDefined();
    expect(missing!.url).toBe(`${base}/missing`);
    expect(body.count).toBe(body.messages.length);
  }, 60_000);

  test("filter narrows by type, warning included, and clear empties the buffer", async () => {
    await b.navigate(`${base}/b`);
    const warnings = await read({ filter: "warning" });
    expect(warnings.messages.map((m) => m.text)).toEqual(["from-b"]);
    expect((await read({ filter: "error" })).messages).toEqual([]);
    expect((await read({ clear: true })).count).toBe(1);
    expect((await read()).messages).toEqual([]);
  }, 60_000);

  test("messages survive navigation in the same tab, each naming the page it was logged on", async () => {
    await b.navigate(`${base}/a`);
    await b.navigate(`${base}/b`);
    const body = await read({ clear: true });
    const byText = Object.fromEntries(body.messages.map((m) => [m.text, m]));
    expect(byText["from-a"]?.pageUrl).toBe(`${base}/a`);
    expect(byText["from-b"]?.pageUrl).toBe(`${base}/b`);
    expect(byText["from-b"]?.type).toBe("warning");
  }, 60_000);

  test("an uncaught exception is reported as an error from pageerror", async () => {
    await b.navigate(`${base}/throws`);
    const body = await read({ filter: "error", clear: true });
    const boom = body.messages.find((m) => m.text.includes("boom-b27"));
    expect(boom).toBeDefined();
    expect(boom!.source).toBe("pageerror");
  }, 60_000);

  test("the buffer keeps the latest 500 and says how many it dropped", async () => {
    await b.navigate(`${base}/flood`);
    const body = await read({ clear: true });
    expect(body.count).toBe(500);
    expect(body.dropped).toBe(100);
    expect(body.messages[0].text).toBe("n101");
    expect(body.messages[499].text).toBe("n600");
    expect((await read()).dropped).toBeUndefined(); // clear resets the count too
  }, 60_000);

  test("a tab opened outside CBrowser (manage_tabs create) is captured too", async () => {
    const internals = b as unknown as { context: { newPage(): Promise<unknown> }; page: unknown };
    const first = internals.page;
    const tab = await internals.context.newPage() as { goto(u: string): Promise<unknown>; close(): Promise<void> };
    internals.page = tab;
    try {
      await tab.goto(`${base}/a`);
      expect((await read({ clear: true })).messages.map((m) => m.text)).toContain("from-a");
    } finally {
      internals.page = first;
      await tab.close();
    }
  }, 60_000);
});

describe("navigate", () => {
  test("reports this navigation's console errors without adding a listener per call", async () => {
    const page = await b.getPage();
    const before = page.listenerCount("console");
    const first = await b.navigate(`${base}/`);
    expect(first.errors.some((e) => /Failed to load resource/.test(e))).toBe(true);
    await b.navigate(`${base}/b`);
    const clean = await b.navigate(`${base}/clean`);
    expect(clean.errors).toEqual([]);
    expect(clean.warnings).toEqual([]);
    expect(page.listenerCount("console")).toBe(before);
  }, 90_000);

  test("reports warnings logged during the navigation", async () => {
    const r = await b.navigate(`${base}/b`);
    expect(r.warnings).toContain("from-b");
  }, 60_000);
});
