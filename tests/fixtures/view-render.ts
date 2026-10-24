/**
 * Render a real MCP App view document under a stub MCP Apps host, in a real
 * browser, and read back what it shows: text, chosen elements, horizontal
 * overflow, and every text element's WCAG contrast against what is actually
 * behind it (its ancestors' backgrounds composited over the host page, colours
 * resolved by the browser through a canvas). The protocol is the one
 * view-image-block.test.ts speaks; provenance-views.test.ts carries its own
 * copy of the same harness.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { expect } from "bun:test";
import { join } from "node:path";

export const BG = { light: "#ffffff", dark: "#1f1f1e" } as const;
export type Theme = keyof typeof BG;
export const COMBOS = (["light", "dark"] as const).flatMap((theme) => [900, 393].map((width) => ({ theme, width })));

const PNG_1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function hostPage(theme: Theme, width: number, payload: unknown): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>host</title></head>
<body style="margin:0;background:${BG[theme]};color-scheme:${theme}"><iframe id="view" src="/widget" style="width:${width}px;height:2400px;border:0"></iframe>
<script>
const RESULT = ${JSON.stringify({ content: [{ type: "text", text: JSON.stringify(payload) }] })};
const view = document.getElementById("view");
const send = (msg) => view.contentWindow.postMessage(msg, "*");
window.addEventListener("message", (ev) => {
  if (ev.source !== view.contentWindow) return;
  const m = ev.data;
  if (!m || m.jsonrpc !== "2.0" || !m.method) return;
  if (m.method === "ui/initialize") {
    send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: (m.params && m.params.protocolVersion) || "2026-01-26",
      hostInfo: { name: "stub-host", version: "1" }, hostCapabilities: { serverTools: {}, openLinks: {} }, hostContext: { theme: "${theme}" } } });
  } else if (m.method === "ui/notifications/initialized") {
    send({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: RESULT });
  } else if (m.method === "tools/call") {
    send({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "image", data: "${PNG_1x1}", mimeType: "image/png" }] } });
  } else if (m.id !== undefined) {
    send({ jsonrpc: "2.0", id: m.id, result: {} });
  }
});
</script></body></html>`;
}

export interface Seen {
  dark: boolean;
  overflow: number;
  text: string;
  fails: Array<{ k: number; sel: string; text: string }>;
  checked: number;
  /** Text of each element a query matched. */
  q: Record<string, string[]>;
  /** Inline style percentages (left, width) of each element a query matched. */
  geom: Record<string, Array<{ left: number | null; width: number | null }>>;
  /** aria-label of each element a query matched. */
  aria: Record<string, string[]>;
  /** Rendered height in px, and the line height, of each element a query matched. */
  box: Record<string, Array<{ height: number; lineHeight: number }>>;
}

/** A host server and a browser, shared by every render of one test file. */
export async function startViewHost(): Promise<{
  render: (widget: string, payload: unknown, theme: Theme, width: number,
    opts: { ready: string; open?: string[]; query?: string[]; shot?: string }) => Promise<Seen>;
  close: () => Promise<void>;
}> {
  const { CBrowser } = await import("../../src/browser.js");
  let current = { widget: "", host: "" };
  const server = Bun.serve({ port: 0, fetch: (req) => new Response(new URL(req.url).pathname === "/widget" ? current.widget : current.host,
    { headers: { "content-type": "text/html; charset=utf-8" } }) });
  const browser = new CBrowser({ headless: true, persistent: false, skipSessionRestore: true });

  async function render(widget: string, payload: unknown, theme: Theme, width: number,
    opts: { ready: string; open?: string[]; query?: string[]; shot?: string }): Promise<Seen> {
    current = { widget, host: hostPage(theme, width, payload) };
    const page = await browser.getPage();
    await page.setViewportSize({ width, height: 1100 });
    // A dark host runs on a dark-preferring system; without this Chrome paints
    // the transparent view's canvas light under the host's dark page.
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(`http://localhost:${server.port}/host`);
    const frame = page.frames().find((f) => f.url().endsWith("/widget"));
    if (!frame) throw new Error("view iframe not found");
    await frame.waitForSelector(opts.ready, { timeout: 20000 });
    const seen = await frame.evaluate(async (a: { open: string[]; bg: string; query: string[] }) => {
      for (const d of Array.from(document.querySelectorAll("details.drawer")) as HTMLDetailsElement[]) {
        const t = d.querySelector("summary")?.textContent || "";
        if (a.open.some((o) => t.includes(o))) { d.open = true; d.querySelectorAll("details").forEach((x) => { (x as HTMLDetailsElement).open = true; }); }
      }
      await new Promise((r) => setTimeout(r, 150));
      const cv = document.createElement("canvas"); cv.width = cv.height = 1;
      const cx = cv.getContext("2d", { willReadFrequently: true })!;
      const rgba = (c: string): number[] | null => {
        cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#010203"; cx.fillStyle = c;
        if (cx.fillStyle === "#010203" && c.replace(/\s/g, "") !== "#010203") return null;
        cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255];
      };
      const over = (t: number[], u: number[]) => [0, 1, 2].map((i) => t[i] * t[3] + u[i] * (1 - t[3])).concat([1]);
      const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const ratio = (x: number[], y: number[]) => { const p = lum(x), q = lum(y); return (Math.max(p, q) + 0.05) / (Math.min(p, q) + 0.05); };
      const host = rgba(a.bg)!;
      const fails: Array<{ k: number; sel: string; text: string }> = [];
      let checked = 0;
      document.querySelectorAll("body *").forEach((n) => {
        // The hero sits on a gradient and an image (measured off pixels
        // elsewhere); the tooltip is shown on demand; a disabled control is
        // exempt from 1.4.3.
        if (n.closest(".hero") || n.closest(".tip") || n.closest("button:disabled, input:disabled")) return;
        if (!Array.from(n.childNodes).some((t) => t.nodeType === 3 && (t.textContent || "").trim())) return;
        const r = n.getBoundingClientRect(); if (!r.width || !r.height) return;
        const cs = getComputedStyle(n);
        const chain: string[] = []; for (let x: Element | null = n; x; x = x.parentElement) chain.push(getComputedStyle(x).backgroundColor);
        let bg = host; for (const c of chain.reverse()) { const v = rgba(c); if (v && v[3] > 0) bg = over(v, bg); }
        const fg = rgba(cs.color); if (!fg) return;
        let op = 1; for (let x: Element | null = n; x; x = x.parentElement) op *= +getComputedStyle(x).opacity;
        const k = ratio(over([fg[0], fg[1], fg[2], fg[3] * op], bg), bg);
        const size = parseFloat(cs.fontSize), large = size >= 24 || (+cs.fontWeight >= 700 && size >= 18.66);
        checked++;
        if (k < (large ? 3 : 4.5)) fails.push({ k: +k.toFixed(2), sel: `${n.tagName}.${n.className}`, text: (n.textContent || "").trim().slice(0, 60) });
      });
      const q: Record<string, string[]> = {};
      const geom: Record<string, Array<{ left: number | null; width: number | null }>> = {};
      const aria: Record<string, string[]> = {};
      const box: Record<string, Array<{ height: number; lineHeight: number }>> = {};
      const pc = (s: string) => (s.endsWith("%") ? parseFloat(s) : null);
      for (const s of a.query) {
        const els = Array.from(document.querySelectorAll(s)) as HTMLElement[];
        q[s] = els.map((x) => (x.textContent || "").replace(/\s+/g, " ").trim());
        geom[s] = els.map((x) => ({ left: pc(x.style.left), width: pc(x.style.width) }));
        aria[s] = els.map((x) => x.getAttribute("aria-label") || "");
        box[s] = els.map((x) => {
          const cs = getComputedStyle(x);
          const lh = cs.lineHeight === "normal" ? parseFloat(cs.fontSize) * 1.2 : parseFloat(cs.lineHeight);
          return { height: x.getBoundingClientRect().height, lineHeight: lh };
        });
      }
      const root = document.documentElement;
      return { dark: root.classList.contains("dark"), overflow: root.scrollWidth - root.clientWidth,
        text: (document.body.textContent || "").replace(/\s+/g, " "), fails, checked, q, geom, aria, box };
    }, { open: opts.open ?? [], bg: BG[theme], query: opts.query ?? [] });
    if (opts.shot) {
      // The host sizes the frame to the view, as an MCP Apps host does on
      // size-changed, so the picture shows the whole view.
      const h = await frame.evaluate(() => document.documentElement.scrollHeight);
      await page.evaluate((px: number) => { (document.getElementById("view") as HTMLElement).style.height = `${px}px`; }, h + 8);
      await page.screenshot({ path: join(opts.shot), fullPage: true });
    }
    return seen;
  }

  return { render, close: async () => { await browser.close(); server.stop(true); } };
}

/** What every render must satisfy, whatever the view. */
export function expectSound(v: Seen, theme: Theme): void {
  expect(v.dark).toBe(theme === "dark");
  expect(v.overflow).toBeLessThanOrEqual(0);
  expect(v.checked).toBeGreaterThan(10);
  expect(v.fails).toEqual([]);
}
