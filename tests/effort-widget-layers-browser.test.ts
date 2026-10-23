/**
 * cognitive_effort's layer screenshot, in a real browser. Split out of
 * tests/effort-widget.test.ts (whose other tests read source and need no
 * browser) so it can sit on scripts/browser-tests.txt: the release gate leaves
 * browser files out, and a browser test inside a gate file failed the 20.0.3
 * release run.
 */
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";

/**
 * The layer overlays' screenshot lives exactly as long as the overlays drawn
 * from it: it exists while saliency and readability are drawn, and its
 * per-call temp dir is gone when the tool returns.
 *
 * This was a grep for a source comment ("ssPath is deliberately NOT deleted
 * here any more"), which proved nothing about behaviour and failed the moment
 * the determinism fix (4097718) rewrote the block around a per-call temp dir.
 * Now the real handler runs on a page that gives every screenshot overlay
 * something to draw. Deleting the screenshot before the overlays turns both
 * entries into "failed" reasons; leaving the temp dir behind leaves it in
 * TMPDIR, watched here so "gone" cannot pass by never having existed.
 */
describe("the layer screenshot lives exactly as long as the overlays drawn from it", () => {
  const words = "Every account keeps its own records and the reports you run are drawn from them, so a change here shows up in the next report you open.";
  const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>layers</title><style>
body{margin:0;font:17px/1.5 sans-serif;color:#222} header{background:#123;color:#fff;padding:18px 32px}
main{padding:24px 32px;max-width:760px} button{font-size:16px;padding:10px 18px;margin-right:12px}
</style></head><body><header><nav><a href="#">Home</a> <a href="#">Pricing</a> <a href="#">Help</a></nav></header>
<main><h1>Your reports</h1>${[1, 2, 3, 4].map(() => `<p>${words} ${words}</p>`).join("")}
<button>Run report</button><button>Export</button></main></body></html>`;

  type Entry = { layer: string; file?: string; available: boolean; reason?: string };
  let result: { isError?: boolean; content: Array<{ type: string; text?: string }> };
  let created: string[] = [];
  let leftover: string[] = [];
  let artifacts = "";
  const cleanup: Array<() => Promise<void> | void> = [];

  beforeAll(async () => {
    const { mkdtempSync, rmSync, readdirSync, watch } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const keep = { data: process.env.CBROWSER_DATA_DIR, art: process.env.CBROWSER_ARTIFACT_DIR, tmp: process.env.TMPDIR };
    const data = mkdtempSync(join(tmpdir(), "cb-effort-layers-data-"));
    artifacts = mkdtempSync(join(tmpdir(), "cb-effort-layers-art-"));
    const callTmp = mkdtempSync(join(tmpdir(), "cb-effort-layers-tmp-"));
    process.env.CBROWSER_DATA_DIR = data;
    process.env.CBROWSER_ARTIFACT_DIR = artifacts;
    delete process.env.ANTHROPIC_API_KEY;
    cleanup.push(() => {
      for (const [k, v] of [["CBROWSER_DATA_DIR", keep.data], ["CBROWSER_ARTIFACT_DIR", keep.art]] as const) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
      for (const d of [data, artifacts, callTmp]) rmSync(d, { recursive: true, force: true });
    });

    const server = Bun.serve({ port: 0, fetch: () => new Response(PAGE, { headers: { "content-type": "text/html" } }) });
    cleanup.push(() => server.stop(true));
    const { CBrowser } = await import("../src/browser.js");
    const browser = new CBrowser({ headless: true, viewportWidth: 1280, viewportHeight: 800, persistent: false, skipSessionRestore: true });
    await browser.launch();
    cleanup.push(() => browser.close());
    const { registerPersonaComparisonTools } = await import("../src/mcp-tools/base/persona-comparison-tools.js");
    let handler: ((a: Record<string, unknown>) => Promise<typeof result>) | undefined;
    registerPersonaComparisonTools({
      registerTool: (name: string, _c: unknown, h: typeof handler) => { if (name === "cognitive_effort") handler = h; },
      tool: () => {}, registerResource: () => {}, resource: () => {},
    } as never, { getBrowser: async () => browser } as never);

    // Only the call itself makes its temp dirs here: the browser is already
    // up, and TMPDIR points at a directory of the test's own for the call.
    const seen = new Set<string>();
    const watcher = watch(callTmp, (_e, name) => { if (name && String(name).startsWith("cbrowser-cog-effort")) seen.add(String(name)); });
    process.env.TMPDIR = callTmp;
    try {
      result = await handler!({ url: `http://localhost:${server.port}/`, persona: "first-timer", useValues: false, scope: "viewport" });
    } finally {
      if (keep.tmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = keep.tmp;
      watcher.close();
    }
    leftover = readdirSync(callTmp).filter((n) => n.startsWith("cbrowser-cog-effort")).sort();
    // A dir the watcher reported, or one still there: either way the call
    // made it here. (The watcher can miss a creation; a removal it reports.)
    created = [...new Set([...seen, ...leftover])].sort();
  }, 180_000);

  afterAll(async () => { for (const c of cleanup.reverse()) await c(); }, 60_000);

  const overlays = (): Entry[] => JSON.parse(result.content.find((c) => c.type === "text")!.text!).layerOverlays;
  /** Width and height from a PNG's IHDR. */
  const pngSize = (bytes: Buffer) => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });

  test("every overlay drawn from the screenshot was drawn: saliency and readability", async () => {
    expect(result.isError).toBeFalsy();
    const { readFileSync, existsSync } = await import("node:fs");
    // The 20.0.x line names the first layer "saliency" (21.0 renames it visualComplexity).
    for (const layer of ["saliency", "readability"]) {
      const e = overlays().find((o) => o.layer === layer)!;
      // A screenshot gone before the draw reads "saliency map failed: ..." or
      // "readability overlay failed: ...", with available false.
      expect({ layer, available: e.available, reason: e.reason }).toEqual({ layer, available: true, reason: undefined });
      const png = join(artifacts, e.file!);
      expect(existsSync(png)).toBe(true);
      // Drawn over the page itself: the overlay has the screenshot's size.
      expect(pngSize(readFileSync(png))).toEqual({ width: 1280, height: 800 });
    }
  });

  test("the per-call temp dirs existed during the call and are gone after it returns", () => {
    // Both: the motor overlay's (cbrowser-cog-effort-*) and the layers' (cbrowser-cog-effort-layers-*).
    expect(created.some((n) => n.startsWith("cbrowser-cog-effort-layers-"))).toBe(true);
    expect(created.some((n) => !n.startsWith("cbrowser-cog-effort-layers-"))).toBe(true);
    expect(leftover).toEqual([]);
  });
});
