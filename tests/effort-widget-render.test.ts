/**
 * The cognitive-effort view, rendered: the chain bars share one unit, and the
 * headline is labelled as the rank it is.
 *
 * The chain block draws every layer cost, the sum of layers and the
 * in-sequence total on ONE scale. Its scale took the in-sequence total from
 * `cognitiveTransportCost.total`, which since 21.x is a percentile (0-1) while
 * the bars are layer-cost units; whenever total exceeded every cost (a costly
 * rank on a page with small layer costs) the whole chain shrank to fit a
 * number that was not a cost. EFFORT_SPEC now points totalField at `raw`.
 * The hero labelled the percentile "transport cost"; it now reads "percentile
 * vs real pages", with the band beside it.
 *
 * Drives the REAL widget document under a stub MCP Apps host (the protocol
 * view-image-block.test.ts speaks), in light and dark, at 900 and 393 px.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-effort-widget-"));
const { buildEffortTemplate } = await import("../src/mcp-tools/ui-resources.js");
const { CBrowser } = await import("../src/browser.js");

// Small layer costs (sum 0.50), raw just above them, and a top-5% rank: the
// shape on which a percentile on the cost scale set the scale.
const LAYERS: Array<[string, number]> = [
  ["visualComplexity", 0.05], ["cognitiveLoad", 0.1], ["decision", 0.15], ["motor", 0.05],
  ["motorProcedure", 0.05], ["frustration", 0.04], ["readability", 0.03], ["readingAttention", 0.03],
];
const PAYLOAD = {
  url: "https://example.test/",
  persona: "cognitive-adhd",
  interpretation: "For cognitive-adhd, the top of this page is costlier than 95% of the real pages we measured (513 pages x 25 personas, viewport scope; 95% interval 94-97%). Band: top 5% (95th percentile and above). Bottleneck: decision.",
  cognitiveTransportCost: { total: 0.951, band: "top 5%", raw: 0.52, additive: 0.5, chainCoefficient: 1.04, chainNote: "fixture" },
  abandonmentRisk: "12%",
  bottleneck: "decision",
  layers: LAYERS.map(([name, cost]) => ({ name, cost, capacityConsumed: cost })),
};

// The host paints its own page in its theme, as claude.ai does; the view is a
// transparent iframe on top of it.
const hostPage = (theme: "light" | "dark", width: number) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>host</title></head>
<body style="margin:0;background:${theme === "dark" ? "#1f1f1e" : "#ffffff"};color-scheme:${theme}"><iframe id="view" src="/widget" style="width:${width}px;height:1600px;border:0"></iframe>
<script>
const RESULT = ${JSON.stringify({ content: [{ type: "text", text: JSON.stringify(PAYLOAD) }] })};
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
      hostContext: { theme: "${theme}" },
    } });
  } else if (m.method === "ui/notifications/initialized") {
    send({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: RESULT });
  } else if (m.id !== undefined) {
    send({ jsonrpc: "2.0", id: m.id, result: {} });
  }
});
</script></body></html>`;

let server: ReturnType<typeof Bun.serve>;
let browser: InstanceType<typeof CBrowser>;
let host = { theme: "light" as "light" | "dark", width: 900 };
const SHOTS = process.env.EFFORT_WIDGET_SHOTS; // a directory, to look at the four renders by eye

beforeAll(() => {
  const widget = buildEffortTemplate();
  server = Bun.serve({
    port: 0,
    fetch: (req) => {
      const path = new URL(req.url).pathname;
      const html = path === "/widget" ? widget : hostPage(host.theme, host.width);
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    },
  });
  browser = new CBrowser({ headless: true, persistent: false, skipSessionRestore: true });
});
afterAll(async () => { await browser?.close(); server?.stop(true); });

async function render(theme: "light" | "dark", width: number) {
  host = { theme, width };
  const page = await browser.getPage();
  // A dark host runs on a dark-preferring system; without this Chrome paints
  // the transparent view's canvas light under the host's dark page.
  await page.emulateMedia({ colorScheme: theme });
  await page.goto(`http://localhost:${server.port}/host`);
  const frame = page.frames().find((f) => f.url().endsWith("/widget"));
  if (!frame) throw new Error("view iframe not found");
  await frame.waitForFunction(() => document.querySelectorAll(".chain .seg").length >= 10, undefined, { timeout: 20000 });
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `effort-${theme}-${width}.png`), fullPage: false });
  return frame.evaluate(() => {
    const bars: Record<string, number> = {};
    document.querySelectorAll(".chain .seg").forEach((seg) => {
      const label = (seg.querySelector(".lbl")?.firstChild?.textContent || "").trim();
      const fill = seg.querySelector(".fill") as HTMLElement | null;
      if (label && fill) bars[label] = parseFloat(fill.style.width);
    });
    const facts = Array.from(document.querySelectorAll(".facts .fact")).map((f) => (f.textContent || "").trim());
    const root = document.documentElement;
    return { bars, facts, dark: root.classList.contains("dark"), overflow: root.scrollWidth - root.clientWidth };
  });
}

describe("cognitive-effort view", () => {
  for (const theme of ["light", "dark"] as const)
    for (const width of [900, 393]) {
      test(`${theme} at ${width}px: the chain is drawn to the raw cost, and the headline reads as a rank`, async () => {
        const v = await render(theme, width);
        expect(v.dark).toBe(theme === "dark");
        // raw (0.52) is the largest cost, so it fills its track; the sum of
        // layers and each layer sit on the same scale. With the percentile
        // (0.951) setting the scale, the in-sequence bar read 55%.
        expect(v.bars["actual, in sequence"]).toBeCloseTo(100, 2);
        expect(v.bars["sum of layers"]).toBeCloseTo((0.5 / 0.52) * 100, 2);
        expect(v.bars["decision"]).toBeCloseTo((0.15 / 0.52) * 100, 2);
        expect(v.facts).toContain("0.951percentile vs real pages");
        expect(v.facts).toContain("top 5%band");
        expect(v.facts.some((f) => /transport cost$/.test(f))).toBe(false);
        expect(v.overflow).toBeLessThanOrEqual(0);
      }, 60000);
    }
});
