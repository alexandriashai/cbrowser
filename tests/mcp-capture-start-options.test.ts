/**
 * capture_start takes the CLI's triggers and device, in the casing the other
 * MCP tools use, and the old snake_case names keep working.
 *
 * Audit 2026-10-21 (MCP parity lane, M16): `cbrowser capture start` has
 * --after, --after-element, --after-delay, --until-element,
 * --until-element-gone, --until-idle, --timeout and --device; the MCP tool had
 * none of them, so a hosted caller could not start a capture when a modal
 * opens or stop it when a spinner goes. Its option names were also snake_case
 * (max_frames, out_dir) unlike every other tool.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Artifacts go to a temp dir, never the directory nginx serves (/var/www/cbrowser-data/heatmaps).
process.env.CBROWSER_ARTIFACT_DIR ??= mkdtempSync(join(tmpdir(), "cb-artifacts-"));
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-capture-opts-"));

const { CBrowser } = await import("../src/browser.js");
const capture = await import("../src/mcp-tools/base/capture-tools.js");
const { setHostedMode } = await import("../src/mcp-tools/hosted-inputs.js");

type Result = { isError?: boolean; content: Array<{ type: string; text?: string }> };
type Handler = (args: Record<string, unknown>) => Promise<Result>;

const handlers: Record<string, Handler> = {};
const workDir = mkdtempSync(join(tmpdir(), "cb-capture-opts-out-"));
let b: InstanceType<typeof CBrowser>;
let http: Server;
let base: string;

// #done appears after 700 ms; #spinner disappears after 700 ms; #late appears after 500 ms.
const PAGE = `<!doctype html><html lang="en"><head><title>Capture</title></head>
<body style="margin:0;background:#123"><h1 id="h" style="color:#fff">0</h1><div id="spinner">...</div>
<script>
let n = 0; setInterval(() => { n++; document.getElementById("h").textContent = n; }, 60);
setTimeout(() => { const d = document.createElement("div"); d.id = "done"; d.textContent = "done"; document.body.append(d); }, 700);
setTimeout(() => { document.getElementById("spinner").remove(); }, 700);
setTimeout(() => { const d = document.createElement("div"); d.id = "late"; d.textContent = "late"; document.body.append(d); }, 500);
</script></body></html>`;

beforeAll(async () => {
  http = createServer((_req, res) => { res.writeHead(200, { "Content-Type": "text/html" }); res.end(PAGE); });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}/`;
  b = new CBrowser({ headless: true });
  capture.registerCaptureTools({
    registerTool: (name: string, _cfg: unknown, h: Handler) => { handlers[name] = h; },
    tool: () => {}, registerResource: () => {}, resource: () => {},
  } as never, { getBrowser: async () => b } as never);
});

afterAll(async () => {
  setHostedMode(false);
  capture.clearCaptureSessions();
  await b.close();
  await new Promise<void>((r) => http.close(() => r()));
  rmSync(workDir, { recursive: true, force: true });
});

const body = (r: Result) => JSON.parse(r.content.find((c) => c.type === "text")!.text!);

async function waitStopped(timeoutMs = 15_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (capture.captureStatus(undefined).state === "stopped") return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("capture never stopped on its own");
}

describe("capture_start schema (M16)", () => {
  test("has the CLI's triggers and device, camelCase names, and the old names", () => {
    const keys = Object.keys(capture.captureStartSchema);
    expect(keys).toEqual(expect.arrayContaining([
      "after", "afterElement", "afterDelay", "untilElement", "untilElementGone", "untilIdle", "timeout",
      "device", "maxFrames", "outDir", "attentionOverlay", "overlayPersona", "overlayGoal",
      "max_frames", "out_dir", "attention_overlay", "overlay_persona", "overlay_goal",
    ]));
  });
});

describe("capture_start triggers (M16)", () => {
  test("untilElement stops the capture when the element appears", async () => {
    capture.clearCaptureSessions();
    const r = await handlers.capture_start({ url: base, untilElement: "#done", outDir: join(workDir, "until"), name: "until" });
    expect(r.isError).not.toBe(true);
    await waitStopped();
    const stop = body(await handlers.capture_stop({}));
    expect(stop.stop_trigger).toContain("#done");
    expect(stop.out_dir).toBe(join(workDir, "until"));
  }, 60_000);

  test("untilElementGone stops when the element goes", async () => {
    capture.clearCaptureSessions();
    await handlers.capture_start({ url: base, untilElementGone: "#spinner", name: "gone" });
    await waitStopped();
    expect(body(await handlers.capture_stop({})).stop_trigger).toContain("#spinner");
  }, 60_000);

  test("afterElement starts when the element appears", async () => {
    capture.clearCaptureSessions();
    const r = await handlers.capture_start({ url: base, afterElement: "#late", duration: "500ms", name: "after" });
    expect(r.isError).not.toBe(true);
    await waitStopped();
    expect(body(await handlers.capture_stop({})).start_trigger).toContain("#late");
  }, 60_000);

  test("after and afterElement together are refused", async () => {
    capture.clearCaptureSessions();
    const r = await handlers.capture_start({ url: base, after: "load", afterElement: "#late", duration: "1s" });
    expect(r.isError).toBe(true);
  });

  test("two stop triggers together are refused", async () => {
    capture.clearCaptureSessions();
    const r = await handlers.capture_start({ url: base, untilElement: "#done", untilIdle: "500ms" });
    expect(r.isError).toBe(true);
  });
});

describe("capture_start device and names (M16)", () => {
  test("device emulates the preset", async () => {
    capture.clearCaptureSessions();
    const r = await handlers.capture_start({ url: base, device: "mobile", duration: "300ms", name: "dev" });
    expect(r.isError).not.toBe(true);
    expect(body(r).viewport).toBe("393x852");
    await waitStopped();
    await handlers.capture_stop({});
  }, 60_000);

  test("snake_case names still work", async () => {
    capture.clearCaptureSessions();
    const r = await handlers.capture_start({ url: base, duration: "300ms", out_dir: join(workDir, "snake"), name: "snake", max_frames: 5 });
    expect(r.isError).not.toBe(true);
    await waitStopped();
    const stop = body(await handlers.capture_stop({}));
    expect(stop.out_dir).toBe(join(workDir, "snake"));
    expect(stop.frames).toBeLessThanOrEqual(5);
  }, 60_000);

  test("hosted: outDir is refused like out_dir", async () => {
    capture.clearCaptureSessions();
    setHostedMode(true);
    try {
      const r = await handlers.capture_start({ url: base, outDir: "/tmp/x" });
      expect(r.isError).toBe(true);
      expect(body(r).error).toBe("not_available_on_hosted_server");
    } finally {
      setHostedMode(false);
    }
  });
});
