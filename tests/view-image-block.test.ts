/**
 * The attention view's "Predicted attention" image, in a real browser.
 *
 * Alexa, 2026-10-10: "predicted attention inline images aren't loading". The
 * server was fine -- artifact_fetch returned a 111k-char JPEG for every
 * heatmap it had. 9 of her last 10 attention_analysis runs had been called
 * with heatmap: false, so there was no heatmap, and the view still drew the
 * image block, called artifact_fetch with file undefined, and showed a broken
 * image. That reads as "images don't load" when none was ever made.
 *
 * So these tests drive the REAL widget document (buildAttentionTemplate) in an
 * iframe under a stub MCP Apps host that speaks the ext-apps postMessage
 * protocol, delivers a tool result, and answers -- and counts -- tools/call:
 *   - no heatmapFile: the panel says why, and makes no fetch at all
 *   - a heatmapFile: one artifact_fetch, and the picture is drawn
 *   - a refusal: the panel shows the server's reason, not a broken image
 *
 * A source-text test could not tell "the note is in the code" from "the note
 * is what renders", and rendering is what was wrong.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-view-image-"));
const { buildAttentionTemplate } = await import("../src/mcp-tools/ui-resources.js");
const { CBrowser } = await import("../src/browser.js");

const PNG_1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const BASE = {
  persona: "cognitive-adhd",
  attentionReasoning: "fixture",
  topAttentionAreas: [{ element: "h1", attention: 0.4 }],
  attentionQuality: 0.5,
  alignmentScore: 0.5,
  concentration: 0.5,
};

type Case = { result: Record<string, unknown>; fetchReply: Record<string, unknown> };
const CASES: Record<string, Case> = {
  noheatmap: {
    result: { ...BASE, hasHeatmap: false },
    fetchReply: { content: [{ type: "image", data: PNG_1x1, mimeType: "image/png" }] },
  },
  heatmap: {
    result: { ...BASE, hasHeatmap: true, heatmapFile: "attn-cognitive-adhd-1.png", heatmapNote: "Red is attention." },
    fetchReply: { content: [{ type: "image", data: PNG_1x1, mimeType: "image/png" }] },
  },
  refused: {
    result: { ...BASE, hasHeatmap: true, heatmapFile: "attn-cognitive-adhd-2.png" },
    fetchReply: {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ error: "Upgrade Required", message: "artifact_fetch requires CBrowser Pro." }) }],
    },
  },
};

// The host side of the ext-apps protocol, just enough of it: answer
// ui/initialize, deliver the tool result once the view says it is initialized,
// and answer every tools/call with the case's reply while recording it.
const hostPage = (c: Case) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>host</title></head>
<body><iframe id="view" src="/widget" style="width:900px;height:1400px;border:0"></iframe>
<script>
window.__calls = [];
const RESULT = ${JSON.stringify({ content: [{ type: "text", text: JSON.stringify(c.result) }] })};
const FETCH_REPLY = ${JSON.stringify(c.fetchReply)};
const view = document.getElementById("view");
const send = (msg) => view.contentWindow.postMessage(msg, "*");
window.addEventListener("message", (ev) => {
  if (ev.source !== view.contentWindow) return;
  const m = ev.data;
  if (!m || m.jsonrpc !== "2.0" || !m.method) return;
  if (m.method === "ui/initialize") {
    send({ jsonrpc: "2.0", id: m.id, result: {
      protocolVersion: (m.params && m.params.protocolVersion) || "2026-01-26",
      hostInfo: { name: "stub-host", version: "1" },
      hostCapabilities: { serverTools: {}, openLinks: {} },
      hostContext: { theme: "light" },
    } });
  } else if (m.method === "ui/notifications/initialized") {
    send({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: RESULT });
  } else if (m.method === "tools/call") {
    window.__calls.push(m.params);
    send({ jsonrpc: "2.0", id: m.id, result: FETCH_REPLY });
  } else if (m.id !== undefined) {
    send({ jsonrpc: "2.0", id: m.id, result: {} });
  }
});
</script></body></html>`;

let server: ReturnType<typeof Bun.serve>;
let browser: InstanceType<typeof CBrowser>;
let current: Case = CASES.noheatmap;
beforeAll(() => {
  const widget = buildAttentionTemplate();
  server = Bun.serve({
    port: 0,
    fetch: (req) => {
      const path = new URL(req.url).pathname;
      const html = path === "/widget" ? widget : hostPage(current);
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    },
  });
  browser = new CBrowser({ headless: true, persistent: false, skipSessionRestore: true });
});
afterAll(async () => { await browser?.close(); server?.stop(true); });

/** Load the host for a case and wait until the image block has settled. */
async function render(name: keyof typeof CASES) {
  current = CASES[name];
  const page = await browser.getPage();
  await page.goto(`http://localhost:${server.port}/host`);
  const frame = page.frames().find((f) => f.url().endsWith("/widget"));
  if (!frame) throw new Error("view iframe not found");
  // Settled = the image block exists and is no longer "Loading image…".
  // The widget's script lives in <body> and its source contains "Loading
  // image", so text is read with script and style removed.
  try {
    await frame.waitForFunction(() => {
      const c = document.body.cloneNode(true) as HTMLElement;
      c.querySelectorAll("script,style").forEach((n) => n.remove());
      const t = c.textContent || "";
      return t.includes("Predicted attention") && !t.includes("Loading image");
    }, undefined, { timeout: 20000 });
  } catch (e) {
    // Say what the panel DID show, so a handshake failure is not a bare timeout.
    const shown = await frame.evaluate(() => {
      const c = document.body.cloneNode(true) as HTMLElement;
      c.querySelectorAll("script,style").forEach((n) => n.remove());
      return (c.textContent || "").slice(0, 400);
    }).catch(() => "?");
    throw new Error(`view never settled; it shows: ${JSON.stringify(shown)}`);
  }
  const view = await frame.evaluate(() => {
    const shot = document.querySelector("img.shot") as HTMLImageElement | null;
    const c = document.body.cloneNode(true) as HTMLElement;
    c.querySelectorAll("script,style").forEach((n) => n.remove());
    return { text: c.textContent || "", shotSrc: shot ? shot.getAttribute("src") : null };
  });
  const calls = await page.evaluate(() => (window as unknown as { __calls: unknown[] }).__calls);
  return { ...view, calls: calls as Array<{ name: string; arguments: Record<string, unknown> }> };
}

describe("attention view: Predicted attention image", () => {
  test("heatmap: false -> says why, and fetches nothing", async () => {
    const v = await render("noheatmap");
    expect(v.text).toContain("the call passed heatmap: false");
    expect(v.calls).toEqual([]);
    expect(v.shotSrc).toBeNull();
  }, 60000);

  test("a heatmap -> one artifact_fetch for that file, and the picture is drawn", async () => {
    const v = await render("heatmap");
    // The SDK adds _meta (a progress token) to each call; the request is name + arguments.
    expect(v.calls.map(({ name, arguments: args }) => ({ name, arguments: args })))
      .toEqual([{ name: "artifact_fetch", arguments: { file: "attn-cognitive-adhd-1.png" } }]);
    expect(v.shotSrc).toBe(`data:image/png;base64,${PNG_1x1}`);
    expect(v.text).not.toContain("heatmap: false");
  }, 60000);

  test("a refused fetch -> the server's reason, never a broken image", async () => {
    const v = await render("refused");
    expect(v.calls.length).toBe(1);
    expect(v.text).toContain("The image could not be loaded: artifact_fetch requires CBrowser Pro.");
    expect(v.shotSrc).toBeNull();
  }, 60000);
});
