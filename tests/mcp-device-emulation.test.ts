/**
 * Device emulation reaches the hosted MCP surface, and smart baselines keep
 * the device they were captured at.
 *
 * Audit 2026-10-21 (MCP parity lane):
 * - M9: hosted session browsers were built with headless/persistent/proxy
 *   only and navigate took no device or viewport, so no hosted caller could
 *   render a phone layout. navigate now takes device and viewport when it
 *   starts a session, and list_devices lists the presets.
 * - M6: SmartBaseline stored neither device nor viewport and
 *   runSmartRegression always captured at 1920x1080, so a mobile baseline was
 *   compared against a desktop render.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-device-emu-"));

const { CBrowser } = await import("../src/browser.js");
const { registerNavigationTools } = await import("../src/mcp-tools/base/navigation-tools.js");

type Result = { isError?: boolean; content: Array<{ type: string; text: string }> };
type Handler = (args: Record<string, unknown>) => Promise<Result>;

const PAGE = `<!doctype html><html lang="en"><head><title>Device</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><p id="ua"></p><script>document.getElementById("ua").textContent = navigator.userAgent</script></body></html>`;

let http: Server;
let base: string;
const sessions = new Map<string, InstanceType<typeof CBrowser>>();
const handlers: Record<string, Handler> = {};
let n = 0;

/** The hosted context shape: a token resolves the caller's session, none creates one. */
async function getBrowserByToken(token?: string) {
  if (token) {
    const b = sessions.get(token);
    if (!b) throw new Error("expired");
    return { browser: b, token };
  }
  const t = `cb_test_${++n}`;
  const b = new CBrowser({ headless: true, persistent: false });
  sessions.set(t, b);
  return { browser: b, token: t };
}

beforeAll(async () => {
  http = createServer((_req, res) => { res.writeHead(200, { "Content-Type": "text/html" }); res.end(PAGE); });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}/`;
  registerNavigationTools({
    registerTool: (name: string, _cfg: unknown, h: Handler) => { handlers[name] = h; },
    tool: () => {}, registerResource: () => {}, resource: () => {},
  } as never, { getBrowser: async () => { throw new Error("hosted shape: tokens only"); }, getBrowserByToken } as never);
});

afterAll(async () => {
  for (const b of sessions.values()) await b.close().catch(() => {});
  await new Promise<void>((r) => http.close(() => r()));
});

const body = (r: Result) => JSON.parse(r.content.find((c) => c.type === "text")!.text);

describe("navigate device on a hosted-shaped context (M9)", () => {
  test("device mobile starts an emulated session: phone size, phone user agent, touch", async () => {
    const r = await handlers.navigate({ url: base, device: "mobile" });
    expect(r.isError).not.toBe(true);
    const out = body(r);
    expect(out.device).toBe("mobile");
    expect(out.viewport).toEqual({ width: 393, height: 852 });
    const page = await sessions.get(out._browserToken)!.getPage();
    expect(await page.evaluate(() => navigator.userAgent)).toContain("iPhone");
    expect(await page.evaluate(() => navigator.maxTouchPoints > 0)).toBe(true);
  });

  test("viewport alone sets the size", async () => {
    const out = body(await handlers.navigate({ url: base, viewport: "700x500" }));
    expect(out.viewport).toEqual({ width: 700, height: 500 });
  });

  test("an unknown device is refused with suggestions, and no session is made", async () => {
    const before = sessions.size;
    const r = await handlers.navigate({ url: base, device: "iphone-99-ultra" });
    expect(r.isError).toBe(true);
    expect(body(r).error).toBe("unknown_device");
    expect(sessions.size).toBe(before);
  });

  test("device with an existing session token is refused, the session untouched", async () => {
    const first = body(await handlers.navigate({ url: base }));
    const r = await handlers.navigate({ url: base, device: "mobile", _browserToken: first._browserToken });
    expect(r.isError).toBe(true);
    expect(body(r).error).toBe("device_needs_new_session");
    const page = await sessions.get(first._browserToken)!.getPage();
    expect(page.viewportSize()?.width).not.toBe(393);
  });

  test("list_devices lists the presets with sizes, and filters", async () => {
    const all = body(await handlers.list_devices({}));
    expect(all.count).toBeGreaterThan(20);
    expect(all.devices.find((d: { key: string }) => d.key === "mobile")).toMatchObject({ width: 393, height: 852, hasTouch: true });
    const ipads = body(await handlers.list_devices({ query: "ipad" }));
    expect(ipads.count).toBeGreaterThan(0);
    for (const d of ipads.devices) expect(`${d.key} ${d.name}`.toLowerCase()).toContain("ipad");
  });
});

/** PNG width/height from the IHDR chunk. */
function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("smart baselines keep their device (M6)", () => {
  test("a mobile baseline stores device and viewport, and regression renders at them", async () => {
    const { captureSmartBaseline, runSmartRegression, getSmartBaseline } = await import("../src/visual/regression.js");
    const baseline = await captureSmartBaseline(base, "m6-mobile", { device: "mobile", numCaptures: 2, captureDelay: 10 });
    expect(baseline.device).toBe("mobile");
    expect(baseline.viewport).toEqual({ width: 393, height: 852 });
    expect(getSmartBaseline("m6-mobile")?.device).toBe("mobile");
    expect(pngSize(baseline.referencePath)).toEqual(pngSize(baseline.capturePaths[0]));

    const result = await runSmartRegression(base, "m6-mobile");
    // Same device, same pixel ratio: the current capture is the baseline's size.
    expect(pngSize(result.currentScreenshot)).toEqual(pngSize(baseline.referencePath));
  }, 60_000);
});
