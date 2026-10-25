/**
 * The MCP App views show what each answer rests on (21.0 provenance).
 *
 * Since 21.0 every score carries a provenance summary, attention maps carry
 * their own, and every built-in persona value is registered as a hypothesis.
 * The views still drew the numbers bare: the effort view had no word on what
 * its percentile rests on, the attention view did not say which perceptual
 * filter drew the map, and the persona and trait views drew hand-set values
 * on the same meters as a user's own with nothing saying which was which.
 *
 * Drives the REAL widget documents under a stub MCP Apps host (the protocol
 * view-image-block.test.ts speaks), in light and dark, at 900 and 393 px, and
 * checks in each: the provenance text is on screen, nothing overflows, and
 * every text element meets WCAG AA against what is actually behind it (its
 * ancestors' backgrounds composited over the host page, colours resolved by
 * the browser through a canvas). Persona, manager and trait payloads are the
 * real tool handlers' output; effort and attention payloads carry blocks
 * built from the real registry by provenanceSummary.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const priorDataDir = process.env.CBROWSER_DATA_DIR;
const dataDir = mkdtempSync(join(tmpdir(), "cb-prov-views-"));
process.env.CBROWSER_DATA_DIR = dataDir;
const ui = await import("../src/mcp-tools/ui-resources.js");
const { CBrowser } = await import("../src/browser.js");
const { MODEL_PROVENANCE, provenanceSummary, ATTENTION_PROVENANCE_TEXT } = await import("../src/visual/model-provenance.js");
const { registerValuesTools } = await import("../src/mcp-tools/base/values-tools.js");
const { registerPersonaLifecycleTools } = await import("../src/mcp-tools/persona-lifecycle-tools.js");
const { createCognitivePersona, saveCustomPersona } = await import("../src/personas.js");

type Handler = (a: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
const handlers: Record<string, Handler> = {};
const fake = { registerTool: (n: string, _c: unknown, h: Handler) => { handlers[n] = h; }, tool() {}, registerResource() {}, resource() {} } as never;
registerValuesTools(fake, {} as never);
registerPersonaLifecycleTools(fake);
const call = async (name: string, args: Record<string, unknown>) =>
  JSON.parse((await handlers[name](args)).content.find((c) => c.type === "text")!.text);

const ids = Object.keys(MODEL_PROVENANCE);
// A score's block: the registry's non-persona, non-attention constants; the
// attention map's: its attention ids. Real ids, real statuses.
const SCORE = provenanceSummary(ids.filter((id) => !/^(persona|perceptual|attention)\./.test(id)));
const MAP = provenanceSummary(ids.filter((id) => id.startsWith("attention.")), ATTENTION_PROVENANCE_TEXT);

const LAYERS = ["visualComplexity", "cognitiveLoad", "decision", "motor", "motorProcedure", "frustration", "readability", "readingAttention"];
const effort = (extra: Record<string, unknown> = {}) => ({
  url: "https://example.test/", persona: "cognitive-adhd",
  interpretation: "For cognitive-adhd, the top of this page is costlier than 27% of the real pages we measured.",
  cognitiveTransportCost: { total: 0.277, band: "lower half", raw: 0.253, additive: 0.251, chainCoefficient: 1.008, ...extra },
  abandonmentRisk: "21%", bottleneck: "visualComplexity",
  layers: LAYERS.map((name, i) => ({ name, cost: 0.01 * (8 - i), capacityConsumed: 0.01 })),
  layerOverlays: [{ layer: "visualComplexity", file: "sal.png", available: true, legend: "Lab-space saliency, shown as context.", provenance: MAP }],
  modelProvenance: SCORE,
});
const attention = (resolution: string, name: string) => ({
  persona: "cognitive-adhd", perceptualProfile: { resolution, name }, attentionProvenance: MAP, hasHeatmap: false,
  topAttentionAreas: [{ region: "(10, 0)", saliency: 0.57 }], alignmentScore: 0.4, concentration: 0.47,
});
const compare = {
  url: "https://example.test/", interpretation: "Substantially different attention patterns", attentionDivergence: 0.31,
  personaA: { name: "cognitive-adhd", perceptualProfile: { resolution: "builtin", name: "cognitive-adhd" }, alignment: 0.4 },
  personaB: { name: "careful-reader", perceptualProfile: { resolution: "default", name: "default" }, alignment: 0.9 },
  divergentRegions: [{ x: 1, y: 2, share: 0.2 }], attentionProvenance: MAP,
  comparisonHeatmapFile: "cmp.png", heatmapNote: "Blue = A, red = B.",
};

const PNG_1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const BG = { light: "#ffffff", dark: "#1f1f1e" };
const hostPage = (theme: "light" | "dark", width: number, payload: unknown) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>host</title></head>
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

let server: ReturnType<typeof Bun.serve>;
let browser: InstanceType<typeof CBrowser>;
let current = { widget: "", host: "" };

beforeAll(async () => {
  const custom = createCognitivePersona("zz-prov-view-custom", "A custom persona for the view tests.", { patience: 0.2 });
  delete (custom.cognitiveTraits as unknown as Record<string, number>).anchoringBias;
  saveCustomPersona(custom);
  server = Bun.serve({ port: 0, fetch: (req) => new Response(new URL(req.url).pathname === "/widget" ? current.widget : current.host,
    { headers: { "content-type": "text/html; charset=utf-8" } }) });
  browser = new CBrowser({ headless: true, persistent: false, skipSessionRestore: true });
});
afterAll(async () => {
  await browser?.close();
  server?.stop(true);
  if (priorDataDir === undefined) delete process.env.CBROWSER_DATA_DIR; else process.env.CBROWSER_DATA_DIR = priorDataDir;
  rmSync(dataDir, { recursive: true, force: true });
});

interface Seen {
  dark: boolean; overflow: number; text: string;
  fails: Array<{ k: number; sel: string; text: string }>; checked: number;
  q: Record<string, string[]>;
}

/** Everything a view shows, after opening the named drawers (and clicking a chain bar). */
async function render(widget: string, payload: unknown, theme: "light" | "dark", width: number,
  opts: { open?: string[]; click?: string; ready: string; query?: string[] }): Promise<Seen> {
  current = { widget, host: hostPage(theme, width, payload) };
  const page = await browser.getPage();
  // A dark host runs on a dark-preferring system; without this Chrome paints
  // the transparent view's canvas light under the host's dark page.
  await page.emulateMedia({ colorScheme: theme });
  await page.goto(`http://localhost:${server.port}/host`);
  const frame = page.frames().find((f) => f.url().endsWith("/widget"));
  if (!frame) throw new Error("view iframe not found");
  await frame.waitForSelector(opts.ready, { timeout: 20000 });
  return frame.evaluate(async (a: { open: string[]; click: string; bg: string; query: string[] }) => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (const d of Array.from(document.querySelectorAll("details.drawer")) as HTMLDetailsElement[]) {
      const t = d.querySelector("summary")?.textContent || "";
      if (a.open.some((o) => t.includes(o))) { d.open = true; d.querySelectorAll("details").forEach((x) => { (x as HTMLDetailsElement).open = true; }); }
    }
    if (a.click) {
      const b = Array.from(document.querySelectorAll(".chain button.seg")).find((x) => (x.textContent || "").trim().startsWith(a.click)) as HTMLElement | undefined;
      b?.click();
      for (let i = 0; i < 40 && !document.querySelector(".ovpane .prov"); i++) await wait(50);
    }
    await wait(150);
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
    for (const s of a.query) q[s] = Array.from(document.querySelectorAll(s)).map((x) => (x.textContent || "").replace(/\s+/g, " ").trim());
    const root = document.documentElement;
    return { dark: root.classList.contains("dark"), overflow: root.scrollWidth - root.clientWidth,
      text: (document.body.textContent || "").replace(/\s+/g, " "), fails, checked, q };
  }, { open: opts.open ?? [], click: opts.click ?? "", bg: BG[theme], query: opts.query ?? [] });
}

/** What every render must satisfy, whatever the view. */
function expectSound(v: Seen, theme: "light" | "dark") {
  expect(v.dark).toBe(theme === "dark");
  expect(v.overflow).toBeLessThanOrEqual(0);
  expect(v.checked).toBeGreaterThan(10);
  expect(v.fails).toEqual([]);
}

const COMBOS = (["light", "dark"] as const).flatMap((theme) => [900, 393].map((width) => ({ theme, width })));
const LINE = (subject: string) => new RegExp(`This ${subject} reads \\d+ registered constants?: \\d+ fitted to data, \\d+ published, \\d+ definitions, and \\d+ design values \\(hypotheses\\)`);

describe("effort view: modelProvenance in its own drawer", () => {
  for (const { theme, width } of COMBOS)
    test(`${theme} at ${width}px`, async () => {
      const v = await render(ui.buildEffortTemplate(), effort(), theme, width,
        { ready: ".chain .seg", open: ["What this score rests on"], click: "visualComplexity",
          query: [".body > .prov", "details.drawer > summary", ".pcounts .pchip", ".pidl li", ".pint", ".ovpane .prov"] });
      expectSound(v, theme);
      // The line beside the finding, naming the drawer.
      expect(v.q[".body > .prov"].length).toBe(1);
      expect(v.q[".body > .prov"][0]).toMatch(LINE("score"));
      expect(v.q[".body > .prov"][0]).toContain(`${SCORE.counts.hypothesis} design values`);
      expect(v.q[".body > .prov"][0]).toContain('What each means is under "What this score rests on"');
      expect(v.q["details.drawer > summary"].some((s) => s.startsWith("What this score rests on"))).toBe(true);
      // The drawer: four statuses with their meaning, and every hand-set id.
      expect(v.q[".pcounts .pchip"]).toEqual(["fitted", "published", "definition", "hypothesis"]);
      expect(v.q[".pidl li"].length).toBe(SCORE.hypotheses.length);
      expect(v.text).toContain(SCORE.scope.slice(0, 60));
      // No interval in the payload, none drawn.
      expect(v.q[".pint"]).toEqual([]);
      // The saliency overlay names its own block, apart from the score's.
      expect(v.q[".ovpane .prov"][0]).toMatch(/^This map reads \d+ registered constants of the attention model, counted apart from the score/);
    }, 60000);

  test("an interval in the payload is drawn first in the drawer, in percent as the rank block says it (ISC-70)", async () => {
    const v = await render(ui.buildEffortTemplate(), effort({ totalCTCInterval: [0.62, 0.81] }), "light", 900,
      { ready: ".chain .seg", open: ["What this score rests on"], query: [".pint"] });
    expect(v.q[".pint"]).toEqual(["95% interval of the percentile: 62% to 81%"]);
  }, 60000);
});

describe("attention views: attentionProvenance and the perceptual filter", () => {
  for (const { theme, width } of COMBOS)
    test(`attention_analysis, ${theme} at ${width}px`, async () => {
      const v = await render(ui.buildAttentionTemplate(), attention("builtin", "cognitive-adhd"), theme, width,
        { ready: ".prov", open: ["What this map rests on"], query: [".facts .fact", ".body > .prov", ".pcounts li"] });
      expectSound(v, theme);
      expect(v.q[".facts .fact"]).toContain("built-in: cognitive-adhdperceptual filter");
      expect(v.q[".body > .prov"][0]).toMatch(LINE("map"));
      expect(v.text).toContain("Drawn through the built-in perceptual filter for cognitive-adhd.");
      expect(v.q[".pcounts li"].length).toBe(4);
      expect(v.text).toContain(ATTENTION_PROVENANCE_TEXT.scope.slice(0, 60));
    }, 60000);

  test("a persona with no filter of its own reads as the neutral default, not a modelled one", async () => {
    const v = await render(ui.buildAttentionTemplate(), attention("default", "default"), "light", 393,
      { ready: ".prov", query: [".facts .fact"] });
    expect(v.q[".facts .fact"]).toContain("none (neutral default)perceptual filter");
    expect(v.text).toContain("No perceptual filter matched this persona, so the map used the neutral default");
  }, 60000);

  for (const { theme, width } of COMBOS)
    test(`attention_compare, ${theme} at ${width}px`, async () => {
      const v = await render(ui.buildAttentionCompareTemplate(), compare, theme, width,
        { ready: ".prov", open: ["What these maps rest on"], query: [".facts .fact", ".body > .prov", ".pcounts li"] });
      expectSound(v, theme);
      expect(v.q[".facts .fact"]).toContain("built-in: cognitive-adhdfilter, persona A");
      expect(v.q[".facts .fact"]).toContain("none (neutral default)filter, persona B");
      expect(v.q[".body > .prov"][0]).toMatch(LINE("comparison"));
      expect(v.text).toContain("Drawn through the built-in perceptual filter for cognitive-adhd.");
      expect(v.text).toContain("No perceptual filter matched this persona");
      expect(v.q[".pcounts li"].length).toBe(4);
    }, 60000);
});

describe("persona and trait views: each built-in value's status", () => {
  for (const { theme, width } of COMBOS)
    test(`persona_lookup (built-in), ${theme} at ${width}px`, async () => {
      const payload = await call("persona_lookup", { persona: "dyslexic-user" });
      const v = await render(ui.buildPersonaTemplate(), payload, theme, width,
        { ready: ".pstatus", query: [".pstatus .pchip", "button.ptag", "span.ptag"] });
      expectSound(v, theme);
      // A status line over the cognitive traits and over the accessibility traits.
      expect(v.q[".pstatus .pchip"]).toEqual(["hypothesis", "hypothesis"]);
      // One "cited" tag per value personas.ts cites a source beside.
      const cited = Object.keys(payload.traitProvenance.cited ?? {}).length + Object.keys(payload.accessibilityProvenance.cited ?? {}).length;
      expect(cited).toBeGreaterThan(0);
      expect(v.q["button.ptag"].length).toBe(cited);
      expect(v.text).toContain("registered as a hypothesis");
    }, 60000);

  for (const { theme, width } of COMBOS)
    test(`a norm-anchored value carries its own tag, ${theme} at ${width}px`, async () => {
      const payload = await call("persona_lookup", { persona: "cognitive-adhd" });
      const v = await render(ui.buildPersonaTemplate(), payload, theme, width,
        { ready: ".pstatus", query: ["button.ptag"] });
      expectSound(v, theme);
      expect(Object.keys(payload.traitProvenance.anchored)).toContain("workingMemory");
      expect(v.q["button.ptag"]).toContain("anchored");
      expect(v.text).toContain("anchored: the value is the percentile a published population mean implies");
    }, 60000);

  test("a custom persona reads custom (user-set), and its unset traits are marked default", async () => {
    const payload = await call("persona_lookup", { persona: "zz-prov-view-custom" });
    const v = await render(ui.buildPersonaTemplate(), payload, "dark", 393,
      { ready: ".pstatus", query: [".pstatus .pchip", "span.ptag"] });
    expectSound(v, "dark");
    expect(v.q[".pstatus .pchip"][0]).toBe("custom (user-set)");
    expect(v.q["span.ptag"]).toEqual(["default"]);
  }, 60000);

  for (const { theme, width } of COMBOS)
    test(`persona_manager, ${theme} at ${width}px`, async () => {
      const payload = await call("persona_manager", { filter: "all" });
      const v = await render(ui.buildPersonaManagerTemplate(), payload, theme, width,
        { ready: ".mgrrow", query: [".mgrrow .cap", ".mgrpane .pstatus .pchip"] });
      expectSound(v, theme);
      expect(v.q[".mgrrow .cap"].some((s) => s.includes("built-in · hypothesis"))).toBe(true);
      expect(v.q[".mgrrow .cap"].some((s) => s.includes("custom (user-set)"))).toBe(true);
      expect(v.q[".mgrpane .pstatus .pchip"].length).toBe(1);
    }, 60000);

  for (const { theme, width } of COMBOS)
    test(`persona_trait_lookup, ${theme} at ${width}px`, async () => {
      const payload = await call("persona_trait_lookup", { trait: "workingMemory", value: 0.3 });
      const v = await render(ui.buildTraitTemplate(), payload, theme, width,
        { ready: ".band", open: ["Built-in personas on this scale"], query: [".btitle", "details.drawer[open] .grid tbody tr"] });
      expectSound(v, theme);
      expect(v.q[".btitle"]).toContain("Scale source");
      expect(v.q[".btitle"]).toContain("What the source covers");
      expect(v.text).not.toContain("Research basis");
      expect(v.text).toContain(payload.scaleProvenance);
      // One row per built-in persona that sets the trait, each with its status.
      expect(v.q["details.drawer[open] .grid tbody tr"].length).toBe(payload.builtinValues.length);
      expect(v.q["details.drawer[open] .grid tbody tr"].every((r) => r.includes("hypothesis"))).toBe(true);
      // Each row names how its number was chosen; the anchored ones say so.
      const anchored = payload.builtinValues.filter((r: { basis: string }) => r.basis === "norm-anchored").length;
      expect(anchored).toBeGreaterThan(0);
      expect(v.q["details.drawer[open] .grid tbody tr"].filter((r) => r.includes("norm-anchored")).length).toBe(anchored);
    }, 60000);
});

/**
 * The provenance surfaces work from the keyboard: each drawer is reached by
 * Tab, shows a focus ring of at least 3:1 against what is behind it (WCAG
 * 1.4.11), and opens with Enter; the hand-set id list opens with Space; a
 * persona's cited or anchored tag shows its source on focus and hides it on
 * Escape. Real Tab presses from inside the view, not programmatic focus.
 */
const KBD_SHOTS = process.env.PROVENANCE_VIEW_SHOTS; // a directory, to look at the focused states by eye

async function viaKeyboard(widget: string, payload: unknown, theme: "light" | "dark", width: number,
  target: { summary?: string; tag?: string; ready: string; shot?: string }) {
  current = { widget, host: hostPage(theme, width, payload) };
  const page = await browser.getPage();
  await page.setViewportSize({ width, height: 1100 });
  await page.emulateMedia({ colorScheme: theme });
  await page.goto(`http://localhost:${server.port}/host`);
  const frame = page.frames().find((f) => f.url().endsWith("/widget"))!;
  await frame.waitForSelector(target.ready, { timeout: 20000 });
  // The host sizes the frame to the view, as an MCP Apps host does on
  // size-changed, so the view never scrolls inside its own frame.
  const fit = async () => {
    const h = await frame.evaluate(() => document.documentElement.scrollHeight);
    await page.evaluate((px: number) => { (document.getElementById("view") as HTMLElement).style.height = `${px}px`; }, h + 8);
  };
  await fit();
  // Start inside the view, at its title, as a reader tabbing through it would.
  await frame.click(".htitle");
  const isTarget = () => frame.evaluate((t: { summary?: string; tag?: string }) => {
    const a = document.activeElement as HTMLElement | null;
    if (!a) return false;
    const text = (a.textContent || "").trim();
    return t.summary ? a.tagName === "SUMMARY" && text.startsWith(t.summary) : a.classList.contains("ptag") && text === t.tag;
  }, target);
  let tabs = 0;
  while (!(await isTarget()) && tabs < 200) { await page.keyboard.press("Tab"); tabs++; }
  const ring = await frame.evaluate((bg: string) => {
    const a = document.activeElement as HTMLElement;
    const cs = getComputedStyle(a);
    const cv = document.createElement("canvas"); cv.width = cv.height = 1;
    const cx = cv.getContext("2d", { willReadFrequently: true })!;
    const rgb = (c: string) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
    const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const host = rgb(bg), o = rgb(cs.outlineColor);
    const ring = [0, 1, 2].map((i) => o[i] * o[3] + host[i] * (1 - o[3]));
    const x = lum(ring), y = lum(host);
    return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), contrast: (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05),
      focusVisible: a.matches(":focus-visible") };
  }, BG[theme]);
  const result: Record<string, unknown> = { tabs, reached: await isTarget(), ring };
  if (target.summary) {
    await page.keyboard.press("Enter");
    result.openAfterEnter = await frame.evaluate(() => (document.activeElement?.parentElement as HTMLDetailsElement | null)?.open === true);
    // The section inside starts open; the id list inside it is a disclosure of its own.
    let more = 0;
    const onIds = () => frame.evaluate(() => (document.activeElement?.parentElement as HTMLElement | null)?.classList.contains("pids") === true);
    const hasIds = await frame.evaluate(() => !!document.activeElement?.parentElement?.querySelector("details.pids"));
    while (hasIds && !(await onIds()) && more < 20) { await page.keyboard.press("Tab"); more++; }
    if (hasIds && await onIds()) {
      await page.keyboard.press(" ");
      result.idsOpenAfterSpace = await frame.evaluate(() => (document.activeElement?.parentElement as HTMLDetailsElement | null)?.open === true);
      // Back to the drawer's own summary, for the picture.
      for (let i = 0; i < more; i++) await page.keyboard.press("Shift+Tab");
      result.backOnDrawer = await isTarget();
    }
  } else {
    result.tip = await frame.evaluate(() => { const t = document.querySelector(".tip.on"); return t ? (t.textContent || "") : null; });
  }
  if (KBD_SHOTS && target.shot) {
    await fit();
    // The view is one tall iframe, so the host page scrolls: the focused
    // control near the top for a drawer, mid-screen for a tag, whose tip
    // opens above it.
    // boundingBox is relative to the host's viewport, which focusing has
    // already scrolled, so the target is that scroll plus both offsets.
    const box = await (await frame.frameElement()).boundingBox();
    const at = await frame.evaluate(() => (document.activeElement as HTMLElement).getBoundingClientRect().top);
    const scrolled = await page.evaluate(() => window.scrollY);
    await page.evaluate((y: number) => window.scrollTo(0, y), scrolled + (box?.y ?? 0) + at - (target.tag ? 400 : 12));
    await page.screenshot({ path: join(KBD_SHOTS, `${target.shot}-${theme}-${width}.png`) });
  }
  if (target.tag) {
    await page.keyboard.press("Escape");
    result.tipAfterEscape = await frame.evaluate(() => !!document.querySelector(".tip.on"));
  }
  return result;
}

function expectRing(r: Record<string, unknown>) {
  expect(r.reached).toBe(true);
  const ring = r.ring as { style: string; width: number; contrast: number; focusVisible: boolean };
  expect(ring.focusVisible).toBe(true);
  expect(ring.style).toBe("solid");
  expect(ring.width).toBeGreaterThanOrEqual(2);
  expect(ring.contrast).toBeGreaterThanOrEqual(3);
}

describe("the provenance surfaces work from the keyboard", () => {
  for (const { theme, width } of COMBOS) {
    test(`effort drawer and id list, ${theme} at ${width}px`, async () => {
      const r = await viaKeyboard(ui.buildEffortTemplate(), effort(), theme, width,
        { summary: "What this score rests on", ready: ".chain .seg", shot: "kbd-effort" });
      expectRing(r);
      expect(r.openAfterEnter).toBe(true);
      expect(r.idsOpenAfterSpace).toBe(true);
      expect(r.backOnDrawer).toBe(true);
    }, 60000);

    test(`attention drawer, ${theme} at ${width}px`, async () => {
      const r = await viaKeyboard(ui.buildAttentionTemplate(), attention("builtin", "cognitive-adhd"), theme, width,
        { summary: "What this map rests on", ready: ".prov", shot: "kbd-attention" });
      expectRing(r);
      expect(r.openAfterEnter).toBe(true);
      expect(r.idsOpenAfterSpace).toBe(true);
    }, 60000);

    test(`attention_compare drawer, ${theme} at ${width}px`, async () => {
      const r = await viaKeyboard(ui.buildAttentionCompareTemplate(), compare, theme, width,
        { summary: "What these maps rest on", ready: ".prov", shot: "kbd-compare" });
      expectRing(r);
      expect(r.openAfterEnter).toBe(true);
      expect(r.idsOpenAfterSpace).toBe(true);
    }, 60000);

    test(`trait drawer, ${theme} at ${width}px`, async () => {
      const payload = await call("persona_trait_lookup", { trait: "workingMemory", value: 0.3 });
      const r = await viaKeyboard(ui.buildTraitTemplate(), payload, theme, width,
        { summary: "Built-in personas on this scale", ready: ".band", shot: "kbd-trait" });
      expectRing(r);
      expect(r.openAfterEnter).toBe(true);
      // No id list here, so focus stays on the drawer it opened.
      expect(r.idsOpenAfterSpace).toBeUndefined();
    }, 60000);

    test(`persona anchored tag, ${theme} at ${width}px`, async () => {
      const payload = await call("persona_lookup", { persona: "cognitive-adhd" });
      const r = await viaKeyboard(ui.buildPersonaTemplate(), payload, theme, width,
        { tag: "anchored", ready: ".pstatus", shot: "kbd-persona" });
      expectRing(r);
      expect(r.tip).toContain("Wilson AC 2024");
      expect(r.tip).toContain("Value interval");
      expect(r.tipAfterEscape).toBe(false);
    }, 60000);
  }
});
