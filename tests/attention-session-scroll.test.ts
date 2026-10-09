/**
 * attention_analysis on a live session, at a scroll offset (Alexa, 2026-10-09).
 *
 * The tool launched its own fresh browser at the top of the page, so an
 * authenticated or mid-flow state could not be measured, and nothing below the
 * fold could be analyzed. It now takes `_browserToken` (analyze that session;
 * `url` optional) and `scrollY` (screenshot, heatmap and DOM coordinates all
 * taken at that offset). A session is the caller's: it is never closed, and its
 * scroll position and animation state are restored afterwards.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-attn-session-"));
const { CBrowser } = await import("../src/browser.js");
const { registerVisualTestingTools } = await import("../src/mcp-tools/base/visual-testing-tools.js");

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>tall</title><style>
body{margin:0;font:16px sans-serif} header{height:80px;background:#222;color:#fff}
.band{height:900px;border-bottom:1px solid #ccc} @keyframes spin{to{transform:rotate(360deg)}}
.spinner{width:40px;height:40px;background:#c00;animation:spin 1s linear infinite}
#deep{margin-top:40px;font-size:28px;padding:20px 40px;background:#06c;color:#fff;border:0}
</style></head><body><header>Top</header><div class="band"><div class="spinner"></div></div>
<div class="band"><button id="deep">Deep CTA</button></div><div class="band">end</div></body></html>`;

let server: ReturnType<typeof Bun.serve>;
let browser: InstanceType<typeof CBrowser>;
let handler: (a: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ type: string; text?: string }> }>;
const TOKEN = "cb_attn_test";

beforeAll(async () => {
  server = Bun.serve({ port: 0, fetch: () => new Response(PAGE, { headers: { "content-type": "text/html" } }) });
  browser = new CBrowser({ headless: true });
  await browser.launch();
  await browser.navigate(`http://localhost:${server.port}/`);
  registerVisualTestingTools({
    registerTool: (name: string, _c: unknown, h: typeof handler) => { if (name === "attention_analysis") handler = h; },
    tool: () => {}, registerResource: () => {}, resource: () => {},
  } as never, {
    getBrowser: async () => browser,
    getBrowserByToken: async (t?: string) => { if (t !== TOKEN) throw new Error("bad token"); return { browser, token: TOKEN }; },
  } as never);
}, 60_000);
afterAll(async () => { await browser?.close(); server?.stop(true); }, 60_000);

const body = (r: { content: Array<{ type: string; text?: string }> }) => JSON.parse(r.content.find((c) => c.type === "text")!.text!);
const page = () => browser.getPage();

describe("attention_analysis with a session token", () => {
  test("no url: analyzes the session's current page and returns its token", async () => {
    const r = await handler({ _browserToken: TOKEN, persona: "first-timer", heatmap: false });
    expect(r.isError).toBeFalsy();
    const b = body(r);
    expect(b.url).toBe(`http://localhost:${server.port}/`);
    expect(b._browserToken).toBe(TOKEN);
    expect(String(b.renderedViewport)).toContain("(session)");
  }, 120_000);

  test("scrollY is applied for the measurement and the session's own scroll is restored", async () => {
    const p = await page();
    await p.evaluate(() => window.scrollTo(0, 300));
    const r = await handler({ _browserToken: TOKEN, persona: "first-timer", heatmap: false, scrollY: 1500 });
    const b = body(r);
    expect(b.scroll).toEqual({ requested: 1500, applied: 1500, maxScrollY: expect.any(Number) });
    expect(await p.evaluate(() => Math.round(window.scrollY))).toBe(300);
  }, 120_000);

  test("the DOM layer reads the scrolled viewport: a CTA 1000px down is seen at scrollY 900, not at 0", async () => {
    const at0 = JSON.stringify(body(await handler({ _browserToken: TOKEN, persona: "first-timer", heatmap: false, scrollY: 0 })));
    const at900 = JSON.stringify(body(await handler({ _browserToken: TOKEN, persona: "first-timer", heatmap: false, scrollY: 900 })));
    expect(at0).not.toContain("Deep CTA");
    expect(at900).toContain("Deep CTA");
  }, 120_000);

  test("an over-large scrollY is clamped and the applied value says so", async () => {
    const b = body(await handler({ _browserToken: TOKEN, persona: "first-timer", heatmap: false, scrollY: 99999 }));
    expect(b.scroll.applied).toBe(b.scroll.maxScrollY);
    expect(b.scroll.applied).toBeLessThan(99999);
  }, 120_000);

  test("freezeAnimations in a session is undone afterwards", async () => {
    const p = await page();
    const b = body(await handler({ _browserToken: TOKEN, persona: "first-timer", heatmap: false, freezeAnimations: true }));
    expect(b.animationState).toBe("frozen");
    const after = await p.evaluate(() => ({
      styles: Array.from(document.querySelectorAll("style")).filter((s) => (s.textContent ?? "").includes("cbrowser-freeze-animations")).length,
      running: document.getAnimations().filter((a) => a.playState === "running").length,
    }));
    expect(after.styles).toBe(0);
    expect(after.running).toBeGreaterThan(0);
  }, 120_000);

  test("the session browser is not closed", async () => {
    await handler({ _browserToken: TOKEN, persona: "first-timer", heatmap: false });
    expect(await (await page()).evaluate(() => document.title)).toBe("tall");
  }, 120_000);

  test("neither url nor token is refused before anything runs", async () => {
    const r = await handler({ persona: "first-timer", heatmap: false });
    expect(r.isError).toBe(true);
    expect(body(r).error).toMatch(/needs a url, or a _browserToken/);
  });
});
