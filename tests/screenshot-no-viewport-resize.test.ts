/**
 * Screenshots meet the byte budget with the IMAGE, never the live viewport.
 *
 * BUG-02 (2026-10-07). In remote mode every screenshot -- and navigate, click,
 * hover, extract, which all take one -- is compressed to fit
 * floor((MAX_RESPONSE_SIZE - 28000) / 1.37) bytes. screenshotCompressed met
 * that budget by calling page.setViewportSize on the caller's page at
 * 0.75 / 0.5 / 0.4 / 0.3 and back. Measured on cbrowser.ai: navigate fired
 * resizes ["960x600","1280x800","640x400","1280x800"] and returned a 640px
 * image of the hamburger layout that the DOM tools never saw. The quality
 * ladder meant to run first was dead code behind an inverted skip guard, so
 * only q85 was ever tried.
 *
 * The obvious fix (quality ladder, no resize, the old one-pass sharp fallback)
 * was measured shipping OVER budget at 2560x1440, on a full-page capture and on
 * an incompressible canvas, because the fallback re-encoded a q25 file at q62
 * and kept the larger original. So the budget cases below guard against that
 * fix as much as against the bug.
 *
 * Every fixture is local and seeded, so the byte counts are the same each run.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { CBrowser } from "../src/browser.js";
import { setRemoteMode, MAX_RESPONSE_SIZE } from "../src/mcp-tools/screenshot-utils.js";
import { registerExtractionTools } from "../src/mcp-tools/base/extraction-tools.js";
import { registerNavigationTools } from "../src/mcp-tools/base/navigation-tools.js";

const workDir = mkdtempSync(join(tmpdir(), "cbrowser-bug02-"));
// Remote mode publishes every screenshot to the artifact store, whose default
// is the live nginx directory, and the navigate tool's site-model hook writes
// under the data dir. Both read their variable per call, so setting them here,
// after the imports, still points both at this test's own temp dir.
process.env.CBROWSER_ARTIFACT_DIR = join(workDir, "artifacts");
process.env.CBROWSER_DATA_DIR = join(workDir, "data");

/** The budget screenshot() applies in remote mode (src/browser.ts). */
const BUDGET = Math.floor((MAX_RESPONSE_SIZE - 28_000) / 1.37);

const PRNG = `function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}`;
// Records every resize the page sees. Installed before anything else runs.
const RESIZE_PROBE = `<script>window.__r=[];addEventListener('resize',()=>window.__r.push(innerWidth+'x'+innerHeight));</script>`;

/**
 * Textured hero plus copy. At the default ?amp=8 it is calibrated to the live
 * cbrowser.ai home page, which measured q85 131KB / q70 90KB / q55 69KB at
 * 1280x800: this one is over budget at q85 and q70 and fits at q55, so only a
 * working quality ladder keeps it full size. The nav hides its links under
 * 1000px, the breakpoint a resize-to-compress crossed.
 *
 * At 2560x1440 with ?amp=16, q25 at full size lands just over budget (95.5KB),
 * the shape cbrowser.ai had at desktop-xl (q25 92KB). That is the case where a
 * re-encode of the q25 file came out larger, was discarded, and the over-budget
 * file shipped.
 */
const HEAVY = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>heavy</title>${RESIZE_PROBE}
<style>body{margin:0;font:16px/1.5 sans-serif;color:#222}
nav{display:flex;gap:24px;padding:16px 32px;background:#0b1d3a;color:#fff}
@media (max-width:1000px){nav .wide{display:none}}
canvas{display:block;width:100%;height:520px}p{padding:0 32px;margin:8px 0}</style></head><body>
<nav><b>Brand</b><span class="wide">Product</span><span class="wide">Pricing</span><span class="wide">Docs</span><span class="wide">Sign up</span></nav>
<h1>Heavy page</h1><canvas id="c"></canvas>
${Array.from({ length: 12 }, (_, i) => `<p>Paragraph ${i}: the quick brown fox jumps over the lazy dog while the ladder walks quality before width.</p>`).join("")}
<script>{${PRNG}
const c=document.getElementById('c');c.width=innerWidth;c.height=520;const x=c.getContext('2d');
const r=mulberry32(42);const img=x.createImageData(c.width,c.height);const A=+(new URLSearchParams(location.search).get('amp')||8);
for(let y=0;y<c.height;y+=3)for(let xx=0;xx<c.width;xx+=3){const n=(r()-0.5)*A;
 const b=[120+90*Math.sin(xx/200),140+60*Math.cos(y/90),170+50*Math.sin((xx+y)/300)];
 for(let dy=0;dy<3&&y+dy<c.height;dy++)for(let dx=0;dx<3&&xx+dx<c.width;dx++){const i=((y+dy)*c.width+xx+dx)*4;
 img.data[i]=b[0]+n;img.data[i+1]=b[1]+n;img.data[i+2]=b[2]+n;img.data[i+3]=255;}}
x.putImageData(img,0,0);}</script></body></html>`;

/** Per-pixel seeded RGB noise over the whole viewport: no quality fits at full size. */
const NOISE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>noise</title>${RESIZE_PROBE}
<style>body{margin:0;overflow:hidden}canvas{display:block}</style></head><body><canvas id="c"></canvas>
<script>{${PRNG}
const c=document.getElementById('c');c.width=innerWidth;c.height=innerHeight;const x=c.getContext('2d');
const r=mulberry32(7);const img=x.createImageData(c.width,c.height);
for(let i=0;i<img.data.length;i+=4){img.data[i]=r()*256;img.data[i+1]=r()*256;img.data[i+2]=r()*256;img.data[i+3]=255;}
x.putImageData(img,0,0);}</script></body></html>`;

/** A long page of textured sections, for fullPage captures. */
const TALL = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>tall</title>${RESIZE_PROBE}
<style>body{margin:0;font:16px/1.5 sans-serif;color:#222}section{padding:24px 32px}canvas{display:block;width:100%;height:300px}</style></head><body>
${Array.from({ length: 10 }, (_, s) => `<section><h2>Section ${s}</h2><canvas class="t" data-seed="${s + 1}"></canvas>${Array.from({ length: 6 }, (_, i) => `<p>Section ${s} paragraph ${i}: dense copy so the page carries real text detail at full width.</p>`).join("")}</section>`).join("")}
<script>{${PRNG}
for(const c of document.querySelectorAll('canvas.t')){c.width=c.clientWidth;c.height=300;const x=c.getContext('2d');
const r=mulberry32(+c.dataset.seed);const img=x.createImageData(c.width,c.height);
for(let y=0;y<c.height;y+=3)for(let xx=0;xx<c.width;xx+=3){const n=(r()-0.5)*40;
 for(let dy=0;dy<3&&y+dy<c.height;dy++)for(let dx=0;dx<3&&xx+dx<c.width;dx++){const i=((y+dy)*c.width+xx+dx)*4;
 img.data[i]=110+60*Math.sin(xx/150)+n;img.data[i+1]=130+n;img.data[i+2]=160+40*Math.cos(y/70)+n;img.data[i+3]=255;}}
x.putImageData(img,0,0);}}</script></body></html>`;

/** Plain copy: fits at q85, so the first capture is the answer. */
const LIGHT = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>light</title>${RESIZE_PROBE}
</head><body style="margin:0;font:16px/1.5 sans-serif"><h1>Light page</h1><p>Nothing here needs compressing.</p></body></html>`;

const urls: Record<string, string> = {};
let b: CBrowser;

beforeAll(async () => {
  mkdirSync(process.env.CBROWSER_ARTIFACT_DIR!, { recursive: true });
  for (const [name, html] of Object.entries({ HEAVY, NOISE, TALL, LIGHT })) {
    const file = join(workDir, `${name.toLowerCase()}.html`);
    writeFileSync(file, html);
    urls[name] = pathToFileURL(file).href;
  }
  setRemoteMode(true);
  b = new CBrowser({ headless: true, persistent: false, dataDir: join(workDir, "data") });
  await b.getPage();
});

afterAll(async () => {
  setRemoteMode(false);
  await b?.close();
  rmSync(workDir, { recursive: true, force: true });
});

/** Size the viewport, then load a fresh document so its resize log starts empty. */
async function load(name: string, viewport: { width: number; height: number }, query = "") {
  const page = await b.getPage();
  await page.setViewportSize(viewport);
  await page.goto(urls[name]! + query, { waitUntil: "load" });
  return page;
}

/** What the page saw, once any queued resize events have had a frame to fire. */
async function observe(file: string) {
  const page = await b.getPage();
  await page.waitForTimeout(150);
  const meta = await sharp(file).metadata();
  return {
    resizes: await page.evaluate(() => (window as unknown as { __r: string[] }).__r),
    inner: await page.evaluate(() => `${innerWidth}x${innerHeight}`),
    viewport: page.viewportSize(),
    width: meta.width!,
    height: meta.height!,
    bytes: statSync(file).size,
  };
}

describe("screenshot never resizes the live viewport to meet the budget", () => {
  test("a 1280x800 page over budget at q85 stays full size via the quality ladder", async () => {
    const page = await load("HEAVY", { width: 1280, height: 800 });
    // Not vacuous: at q85 this page is over budget, so compression must act.
    expect((await page.screenshot({ type: "jpeg", quality: 85 })).length).toBeGreaterThan(BUDGET);

    const seen = await observe(await b.screenshot());

    expect(seen.resizes).toEqual([]);
    expect(`${seen.width}x${seen.height}`).toBe("1280x800");
    expect(seen.bytes).toBeLessThanOrEqual(BUDGET);
    expect(seen.viewport).toEqual({ width: 1280, height: 800 });
    expect(seen.inner).toBe("1280x800");
  }, 60_000);

  test("navigate returns a full-size image and the new page sees no resize", async () => {
    const page = await b.getPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    const result = await b.navigate(urls.HEAVY!);
    const seen = await observe(result.screenshot);

    expect(seen.resizes).toEqual([]);
    expect(`${seen.width}x${seen.height}`).toBe("1280x800");
    expect(seen.bytes).toBeLessThanOrEqual(BUDGET);
  }, 60_000);

  test("extract, which discards its screenshot over MCP, does not resize either", async () => {
    await load("HEAVY", { width: 1280, height: 800 });
    const result = await b.extract("headings");
    const seen = await observe(result.screenshot);

    expect(seen.resizes).toEqual([]);
    expect(seen.bytes).toBeLessThanOrEqual(BUDGET);
  }, 60_000);

  test("an incompressible 1280x800 canvas fits the budget without a resize", async () => {
    const page = await load("NOISE", { width: 1280, height: 800 });
    // Not vacuous: even q25 at full size is over budget for this page.
    expect((await page.screenshot({ type: "jpeg", quality: 25 })).length).toBeGreaterThan(BUDGET);

    const seen = await observe(await b.screenshot());

    expect(seen.resizes).toEqual([]);
    expect(seen.bytes).toBeLessThanOrEqual(BUDGET);
    expect(seen.viewport).toEqual({ width: 1280, height: 800 });
    // Downscaled in memory, aspect ratio kept.
    expect(seen.width).toBeLessThan(1280);
    expect(Math.abs(seen.width / seen.height - 1.6)).toBeLessThan(0.02);
  }, 60_000);
});

describe("the budget holds where the quality-ladder-only fix regressed", () => {
  // desktop-xl is a VIEWPORT_PRESETS entry capture_start accepts, and that
  // size persists on the session browser after the capture.
  const XL = { width: 2560, height: 1440 };

  test("2560x1440, default options: under budget, zero resizes", async () => {
    const page = await load("HEAVY", XL, "?amp=16");
    // Not vacuous: the bottom of the quality ladder at full size is over budget.
    expect((await page.screenshot({ type: "jpeg", quality: 25 })).length).toBeGreaterThan(BUDGET);

    const seen = await observe(await b.screenshot());

    expect(seen.resizes).toEqual([]);
    expect(seen.bytes).toBeLessThanOrEqual(BUDGET);
    expect(seen.viewport).toEqual(XL);
  }, 60_000);

  test("2560x1440 with noResize (capture_start / screenshot during a recording)", async () => {
    await load("HEAVY", XL, "?amp=16");
    const seen = await observe(await b.screenshot(undefined, { compress: true, noResize: true }));

    expect(seen.resizes).toEqual([]);
    expect(seen.bytes).toBeLessThanOrEqual(BUDGET);
  }, 60_000);

  test("2560x1440 incompressible canvas: still under budget", async () => {
    await load("NOISE", XL);
    const seen = await observe(await b.screenshot());

    expect(seen.resizes).toEqual([]);
    expect(seen.bytes).toBeLessThanOrEqual(BUDGET);
  }, 60_000);

  test("fullPage on a tall page: under budget, whole page, no resize beyond the capture's own", async () => {
    const page = await load("TALL", { width: 1280, height: 800 });
    const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(docHeight).toBeGreaterThan(4000);

    // A full-page capture is allowed whatever resizes Playwright's own capture
    // fires; compression may not add any. Measured: the FIRST native full-page
    // capture on a document fires one resize, every later one fires two ("1x1"
    // then the viewport). So the baseline is a second capture, after a warm-up.
    const reset = () => page.evaluate(() => { (window as unknown as { __r: string[] }).__r = []; });
    await page.screenshot({ type: "jpeg", quality: 85, fullPage: true });
    await page.waitForTimeout(150);
    await reset();
    await page.screenshot({ type: "jpeg", quality: 85, fullPage: true });
    await page.waitForTimeout(150);
    const native = (await page.evaluate(() => (window as unknown as { __r: string[] }).__r)).length;
    expect(native).toBeGreaterThan(0);
    await reset();

    const seen = await observe(await b.screenshot(undefined, { fullPage: true }));

    expect(seen.bytes).toBeLessThanOrEqual(BUDGET);
    expect(seen.resizes.length).toBeLessThanOrEqual(native);
    // The whole page, scaled, not a crop of it.
    expect(Math.abs(seen.height / seen.width - docHeight / 1280)).toBeLessThan(0.02);
  }, 90_000);
});

describe("the caller is told when the image was downscaled", () => {
  test("a page that fits at q85 is returned as captured", async () => {
    await load("LIGHT", { width: 1280, height: 800 });
    const file = await b.screenshot();
    const info = b.lastScreenshotInfo;

    expect(info?.path).toBe(file);
    expect(info).toMatchObject({ width: 1280, height: 800, sourceWidth: 1280, sourceHeight: 800, downscaled: false, quality: 85 });
  }, 60_000);

  test("the quality ladder alone is not a downscale", async () => {
    await load("HEAVY", { width: 1280, height: 800 });
    const file = await b.screenshot();
    const info = b.lastScreenshotInfo;

    expect(info?.path).toBe(file);
    expect(info?.downscaled).toBe(false);
    expect(info!.quality).toBeLessThan(85);
    expect(info!.bytes).toBe(statSync(file).size);
  }, 60_000);

  test("a 2560x1440 capture reports its source and output size", async () => {
    await load("HEAVY", { width: 2560, height: 1440 }, "?amp=16");
    const file = await b.screenshot();
    const info = b.lastScreenshotInfo;
    const meta = await sharp(file).metadata();

    expect(info?.path).toBe(file);
    expect(info).toMatchObject({ sourceWidth: 2560, sourceHeight: 1440, downscaled: true, width: meta.width, height: meta.height });
    expect(info!.width).toBeLessThan(2560);
  }, 60_000);

  type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }>;
  function tools(): Record<string, Handler> {
    const handlers: Record<string, Handler> = {};
    const server = { registerTool: (name: string, _c: unknown, fn: Handler) => { handlers[name] = fn; } } as never;
    registerExtractionTools(server, { getBrowser: async () => b });
    registerNavigationTools(server, { getBrowser: async () => b });
    return handlers;
  }

  test("the screenshot tool names the downscale and still inlines the image", async () => {
    await load("HEAVY", { width: 2560, height: 1440 }, "?amp=16");
    const res = await tools().screenshot!({});
    const json = JSON.parse(res.content[0]!.text!);
    const meta = await sharp(json.screenshot).metadata();

    expect(json.screenshotDownscaledFrom).toBe("2560x1440");
    expect(json.screenshotSize).toBe(`${meta.width}x${meta.height}`);
    expect(json._screenshotOmitted).toBeUndefined();
    expect(res.content.some((c) => c.type === "image")).toBe(true);
  }, 60_000);

  test("the navigate tool names the downscale too", async () => {
    const page = await b.getPage();
    await page.setViewportSize({ width: 2560, height: 1440 });
    const res = await tools().navigate!({ url: urls.HEAVY + "?amp=16" });
    const json = JSON.parse(res.content[0]!.text!);

    expect(json.screenshotDownscaledFrom).toBe("2560x1440");
    expect(res.content.some((c) => c.type === "image")).toBe(true);
  }, 60_000);

  test("a full-size image carries no downscale note", async () => {
    await load("LIGHT", { width: 1280, height: 800 });
    const res = await tools().screenshot!({});
    const json = JSON.parse(res.content[0]!.text!);

    expect(json.screenshotDownscaledFrom).toBeUndefined();
    expect(json.screenshotSize).toBeUndefined();
  }, 60_000);
});
