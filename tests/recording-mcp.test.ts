/**
 * Recording MCP Tool Tests
 *
 * Asserts the three capture tools register on both servers with the expected
 * schema keys, and that a `capture_stop` payload for a long recording stays
 * inside the MCP response budget.
 */

import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPaths } from "../src/config.js";
import {
  registerCaptureTools,
  buildCaptureStopPayload,
  contactSheetBudget,
  enforceResponseBudget,
  parseDurationMs,
  parseFormats,
  parseViewport,
  parseRegion,
  captureStatus,
  clearCaptureSessions,
  captureStartSchema,
  captureStopSchema,
  captureStatusSchema,
} from "../src/mcp-tools/base/capture-tools.js";
import { TOOL_CATEGORIES } from "../src/mcp-tools/tool-categories.js";
import { MAX_RESPONSE_SIZE } from "../src/mcp-tools/screenshot-utils.js";
import { parseManifest, type RecordingManifest } from "../src/recording/types.js";

// ---------------------------------------------------------------------------
// Server doubles
// ---------------------------------------------------------------------------

interface RegisteredTool {
  name: string;
  config: { title?: string; description: string; inputSchema: Record<string, unknown> };
  handler: (args: Record<string, unknown>) => unknown;
}

/** Records `registerTool(name, config, handler)` — the remote server's form. */
function fakeRemoteServer() {
  const tools: RegisteredTool[] = [];
  const server = {
    registerTool(name: string, config: RegisteredTool["config"], handler: RegisteredTool["handler"]) {
      tools.push({ name, config, handler });
    },
  };
  return { server, tools };
}

/** Records `tool(name, description, schema, handler)` — the legacy stdio form. */
function fakeLegacyServer() {
  const tools: RegisteredTool[] = [];
  const server = {
    tool(
      name: string,
      description: string,
      inputSchema: Record<string, unknown>,
      handler: RegisteredTool["handler"],
    ) {
      tools.push({ name, config: { description, inputSchema }, handler });
    },
  };
  return { server, tools };
}

// ---------------------------------------------------------------------------
// Manifest fixtures
// ---------------------------------------------------------------------------

/**
 * A manifest with `frameCount` frames, each carrying console and network
 * records — the shape that would blow the budget if frames were inlined.
 */
function bigManifest(frameCount: number): RecordingManifest {
  const frames = Array.from({ length: frameCount }, (_, i) => ({
    index: i,
    t_ms: i * 100,
    path: `frames/${String(i).padStart(4, "0")}.jpg`,
    crop: { x: 0, y: 0, width: 1280, height: 720 },
    ssim_prev: i === 0 ? null : 0.87 + (i % 10) / 1000,
    anomaly: i % 17 === 0,
    tracking: null,
    console: [
      {
        t_ms: i * 100,
        type: i % 3 === 0 ? "error" : "log",
        // Long messages are the usual budget offender.
        text: `Uncaught TypeError: cannot read property 'x' of undefined at frame ${i} ${"stack ".repeat(40)}`,
      },
    ],
    network: [
      {
        t_ms: i * 100,
        url: `https://example.com/api/resource/${i}?cache=${"x".repeat(60)}`,
        method: "GET",
        status: 200,
      },
    ],
  }));

  return {
    version: 1,
    slug: "long-capture",
    engine: "chromium",
    capture_method: "cdp-screencast",
    target_fps: 10,
    actual_fps: 9.8,
    viewport: { width: 1280, height: 720, deviceScaleFactor: 2 },
    target: { kind: "viewport" },
    start_trigger: null,
    stop_trigger: null,
    trigger_timeout: false,
    started_at: "2026-07-19T10:00:00.000Z",
    duration_ms: frameCount * 100,
    output_dims: { width: 1280, height: 720 },
    frames,
    change_points: frames.filter((f) => f.anomaly).map((f) => f.index),
    frame_gaps: frames.slice(0, 120).map((f) => ({ after_index: f.index, gap_ms: 400 })),
    region_clamped: false,
    artifacts: { gif: "/out/long-capture/capture.gif", webm: "/out/long-capture/capture.webm" },
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe("capture tools registration (remote server)", () => {
  const { server, tools } = fakeRemoteServer();
  registerCaptureTools(server as never, { getBrowser: async () => ({}) as never });
  const byName = new Map(tools.map((t) => [t.name, t]));

  test("registers exactly the three capture tools", () => {
    expect(tools.map((t) => t.name)).toEqual(["capture_start", "capture_stop", "capture_status"]);
  });

  test("capture_start exposes the documented schema keys", () => {
    const keys = Object.keys(byName.get("capture_start")!.config.inputSchema);
    for (const expected of [
      "url",
      "fps",
      "duration",
      "viewport",
      "region",
      "element",
      "padding",
      "format",
      "quality",
      "max_frames",
      "name",
      "out_dir",
      "_browserToken",
    ]) {
      expect(keys).toContain(expected);
    }
  });

  test("capture_start does NOT expose trigger flags the engine cannot honour", () => {
    const keys = Object.keys(byName.get("capture_start")!.config.inputSchema);
    expect(keys).not.toContain("start_trigger");
    expect(keys).not.toContain("stop_trigger");
    expect(keys).not.toContain("trigger_timeout");
  });

  test("stop and status accept the browser token", () => {
    expect(Object.keys(byName.get("capture_stop")!.config.inputSchema)).toEqual(["_browserToken"]);
    expect(Object.keys(byName.get("capture_status")!.config.inputSchema)).toEqual(["_browserToken"]);
  });

  test("every tool carries a title, description and annotations", () => {
    for (const tool of tools) {
      expect(tool.config.title).toBeTruthy();
      expect(tool.config.description.length).toBeGreaterThan(40);
      expect((tool.config as { annotations?: unknown }).annotations).toBeDefined();
    }
  });

  test("descriptions disambiguate capture from the `record` feature", () => {
    expect(byName.get("capture_start")!.config.description).toMatch(/record/i);
    expect(byName.get("capture_stop")!.config.description).toMatch(/never inlined|paths/i);
  });

  test("handlers return an error envelope instead of throwing", async () => {
    clearCaptureSessions();
    const result = (await byName.get("capture_stop")!.handler({})) as {
      content: { type: string; text: string }[];
    };
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/No capture has been started/);
  });
});

describe("capture tools registration (legacy stdio server)", () => {
  // The legacy server registers inline rather than via registerCaptureTools, so
  // this asserts the shared schema objects it is built from stay in step.
  const { server, tools } = fakeLegacyServer();
  server.tool("capture_start", "d", captureStartSchema, async () => ({}));
  server.tool("capture_stop", "d", captureStopSchema, async () => ({}));
  server.tool("capture_status", "d", captureStatusSchema, async () => ({}));

  test("the legacy form takes name, description, schema, handler", () => {
    expect(tools).toHaveLength(3);
    expect(tools.map((t) => t.name)).toEqual(["capture_start", "capture_stop", "capture_status"]);
  });

  test("shared start schema carries the same keys as the remote registration", () => {
    const { server: remote, tools: remoteTools } = fakeRemoteServer();
    registerCaptureTools(remote as never, { getBrowser: async () => ({}) as never });
    const remoteKeys = Object.keys(
      remoteTools.find((t) => t.name === "capture_start")!.config.inputSchema,
    ).sort();
    expect(Object.keys(captureStartSchema).sort()).toEqual(remoteKeys);
  });
});

describe("capture tools category", () => {
  test("screen_capture category lists all three tools", () => {
    const category = TOOL_CATEGORIES.find((c) => c.name === "screen_capture");
    expect(category).toBeDefined();
    expect(category!.tools).toEqual(["capture_start", "capture_stop", "capture_status"]);
    expect(category!.tier).toBe(2);
    // Capture itself is free on purpose: recording a page costs no inference.
    // The gate is on the LLM calls a capture can feed, not on the capture.
    // (Confirmed 2026-08-01.)
    expect(category!.pricingTier).toBe("free");
  });
});

// ---------------------------------------------------------------------------
// Response budget
// ---------------------------------------------------------------------------

describe("capture_stop response budget", () => {
  test("a 2000-frame capture serializes well under the MCP budget (ISC-36)", () => {
    const manifest = bigManifest(2000);
    const payload = buildCaptureStopPayload(manifest, {
      manifestPath: "/out/long-capture/manifest.json",
      outDir: "/out/long-capture",
      contactSheet: "/out/long-capture/contact-sheet.jpg",
    });

    const bytes = Buffer.byteLength(JSON.stringify(payload, null, 2));
    expect(bytes).toBeLessThan(MAX_RESPONSE_SIZE);

    // Frames and video come back as PATHS, never inlined.
    expect(payload.frames).toBe(2000);
    expect(payload.frames_dir).toBe("/out/long-capture/frames");
    expect(payload.artifacts.gif).toBe("/out/long-capture/capture.gif");
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("frames/1000.jpg");
    expect(serialized).not.toContain("ssim_prev");

    // The contact sheet is present and has room left inside the budget.
    expect(payload.contact_sheet).toBe("/out/long-capture/contact-sheet.jpg");
    const sheetBudget = contactSheetBudget(bytes);
    expect(sheetBudget).toBeGreaterThan(0);
    expect(bytes + Math.ceil(sheetBudget * 1.37)).toBeLessThanOrEqual(MAX_RESPONSE_SIZE);
  });

  test("a 500-frame capture serializes well under the MCP budget", () => {
    const manifest = bigManifest(500);
    const payload = buildCaptureStopPayload(manifest, {
      manifestPath: "/out/long-capture/manifest.json",
      outDir: "/out/long-capture",
      contactSheet: "/out/long-capture/contact-sheet.jpg",
    });

    const bytes = Buffer.byteLength(JSON.stringify(payload, null, 2));
    expect(bytes).toBeLessThan(MAX_RESPONSE_SIZE);

    // The raw manifest is what we are protecting the transport from.
    const rawBytes = Buffer.byteLength(JSON.stringify(manifest, null, 2));
    expect(rawBytes).toBeGreaterThan(MAX_RESPONSE_SIZE);
  });

  test("even a 5000-frame capture stays in budget", () => {
    const payload = buildCaptureStopPayload(bigManifest(5000), {
      manifestPath: "/out/long-capture/manifest.json",
      outDir: "/out/long-capture",
    });
    expect(Buffer.byteLength(JSON.stringify(payload, null, 2))).toBeLessThan(MAX_RESPONSE_SIZE);
  });

  test("frames are never inlined, only counted and pointed at", () => {
    const payload = buildCaptureStopPayload(bigManifest(500), {
      manifestPath: "/out/long-capture/manifest.json",
      outDir: "/out/long-capture",
    });
    expect((payload as unknown as { frames_list?: unknown }).frames_list).toBeUndefined();
    expect(payload.frames).toBe(500);
    expect(payload.frames_dir).toBe("/out/long-capture/frames");
    expect(JSON.stringify(payload)).not.toContain("frames/0250.jpg");
  });

  test("truncated lists report their true totals", () => {
    const manifest = bigManifest(500);
    const payload = buildCaptureStopPayload(manifest, {
      manifestPath: "/m.json",
      outDir: "/out",
    });

    expect(payload.change_points_total).toBe(manifest.change_points.length);
    expect(payload.change_points.length).toBeLessThanOrEqual(200);
    expect(payload.frame_gaps_total).toBe(120);
    expect(payload.frame_gaps.length).toBe(50);
    expect(payload.console_errors.length).toBeLessThanOrEqual(20);
    expect(payload.console_errors_total).toBeGreaterThan(payload.console_errors.length);
    expect(payload.network_requests_total).toBe(500);
  });

  test("short captures are reported in full, not truncated", () => {
    const manifest = bigManifest(5);
    const payload = buildCaptureStopPayload(manifest, { manifestPath: "/m.json", outDir: "/out" });
    expect(payload.change_points).toEqual(manifest.change_points);
    expect(payload.change_points_total).toBe(manifest.change_points.length);
    expect(payload.frame_gaps).toHaveLength(5);
  });

  test("encode errors surface only when encoders actually failed", () => {
    const manifest = bigManifest(3);
    expect(
      buildCaptureStopPayload(manifest, { manifestPath: "/m.json", outDir: "/o", encodeErrors: {} })
        .encode_errors,
    ).toBeUndefined();
    expect(
      buildCaptureStopPayload(manifest, {
        manifestPath: "/m.json",
        outDir: "/o",
        encodeErrors: { mp4: "ffmpeg not found" },
      }).encode_errors,
    ).toEqual({ mp4: "ffmpeg not found" });
  });

  test("the payload is built from a manifest that actually validates", () => {
    // Guards against the payload builder drifting from the manifest contract.
    expect(() => parseManifest(bigManifest(3))).not.toThrow();
  });
});

describe("contactSheetBudget", () => {
  test("leaves room for the JSON payload and accounts for base64 inflation", () => {
    const budget = contactSheetBudget(50000, 150000);
    expect(budget).toBeGreaterThan(0);
    // 100000 bytes remaining, inflated by 1.37 when base64-encoded.
    expect(budget).toBe(Math.floor(100000 / 1.37));
    expect(budget * 1.37).toBeLessThanOrEqual(100000);
  });

  test("returns 0 when the payload has consumed the budget", () => {
    expect(contactSheetBudget(150000, 150000)).toBe(0);
    expect(contactSheetBudget(200000, 150000)).toBe(0);
  });

  test("returns 0 rather than an unreadably small sheet", () => {
    expect(contactSheetBudget(145000, 150000)).toBe(0);
  });

  test("payload plus inlined sheet never exceeds the budget", () => {
    const payload = buildCaptureStopPayload(bigManifest(500), {
      manifestPath: "/m.json",
      outDir: "/out",
      contactSheet: "/out/contact-sheet.jpg",
    });
    const payloadBytes = Buffer.byteLength(JSON.stringify(payload, null, 2));
    const sheetBytes = contactSheetBudget(payloadBytes);
    expect(payloadBytes + Math.ceil(sheetBytes * 1.37)).toBeLessThanOrEqual(MAX_RESPONSE_SIZE);
  });
});

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

describe("capture argument parsing", () => {
  test("durations accept s, m, ms and bare counts", () => {
    expect(parseDurationMs("5s")).toBe(5000);
    expect(parseDurationMs("2m")).toBe(120000);
    expect(parseDurationMs("1500ms")).toBe(1500);
    expect(parseDurationMs("750")).toBe(750);
    expect(() => parseDurationMs("soon")).toThrow(/Invalid duration/);
    expect(() => parseDurationMs("0s")).toThrow(/greater than zero/);
  });

  test("formats validate against the encoder list", () => {
    expect(parseFormats("gif,webp")).toEqual(["gif", "webp"]);
    expect(parseFormats("MP4")).toEqual(["mp4"]);
    expect(() => parseFormats("avi")).toThrow(/Unknown format/);
    expect(() => parseFormats("")).toThrow(/at least one format/);
  });

  test("viewport accepts WxH and preset names", () => {
    expect(parseViewport("1280x720")).toEqual({ width: 1280, height: 720 });
    expect(parseViewport("1280 x 720")).toEqual({ width: 1280, height: 720 });
    // mobile is the device preset size since 2026-10-21 (audit M7); 375x667 was a second meaning.
    expect(parseViewport("mobile")).toEqual({ width: 393, height: 852 });
    expect(parseViewport("tablet-sm")).toEqual({ width: 768, height: 1024 });
    expect(parseViewport("desktop-lg")).toEqual({ width: 1920, height: 1080 });
    expect(() => parseViewport("huge")).toThrow(/use WIDTHxHEIGHT/);
  });

  test("region parses x,y,width,height and rejects empty areas", () => {
    expect(parseRegion("0,0,800,600")).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(parseRegion(" 10 , 20 , 30 , 40 ")).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    expect(() => parseRegion("0,0,800")).toThrow(/x,y,width,height/);
    expect(() => parseRegion("0,0,0,600")).toThrow(/must be positive/);
  });
});

describe("captureStatus", () => {
  test("reports idle only when nothing is running anywhere", () => {
    clearCaptureSessions();
    const status = captureStatus();
    expect(status.success).toBe(true);

    // captureStatus deliberately reads the CLI's videosDir/active.json pointer
    // so a capture started by the CLI or daemon is never invisible from MCP.
    // That makes this assertion depend on real machine state, so branch on it
    // rather than pretend the box is quiet — a concurrent CLI capture is a
    // legitimate observation, not a test failure.
    const pointer = join(getPaths().videosDir, "active.json");
    let foreignAlive = false;
    if (existsSync(pointer)) {
      try {
        const active = JSON.parse(readFileSync(pointer, "utf-8")) as { pid: number };
        process.kill(active.pid, 0);
        foreignAlive = true;
      } catch {
        foreignAlive = false;
      }
    }

    if (foreignAlive) {
      expect(status.state).toBe("recording");
      expect(String(status.started_by)).toMatch(/another process/);
    } else {
      expect(status.state).toBe("idle");
    }
  });
});

describe("enforceResponseBudget (ISC-36 anti-criterion)", () => {
  // The payload builder already keeps responses small. This asserts the
  // structural guarantee: even if it did not, an over-budget response cannot
  // leave the tool.

  test("passes through content that already fits", () => {
    const content = [{ type: "text", text: "{\"ok\":true}" }];
    expect(enforceResponseBudget(content)).toEqual(content);
  });

  test("sheds the image block before the text block", () => {
    const content = [
      { type: "text", text: JSON.stringify({ manifest_path: "/out/manifest.json" }) },
      { type: "image", data: "A".repeat(200000), mimeType: "image/jpeg" },
    ];
    const result = enforceResponseBudget(content);
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("text");
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(MAX_RESPONSE_SIZE);
  });

  test("falls back to a minimal pointer when even the text is too large", () => {
    const content = [
      { type: "text", text: "x".repeat(400000) },
      { type: "image", data: "A".repeat(200000), mimeType: "image/jpeg" },
    ];
    const result = enforceResponseBudget(content);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(MAX_RESPONSE_SIZE);
    expect(result[0]!.text).toMatch(/read the manifest from disk/);
  });

  test("no input can produce an over-budget output", () => {
    const sizes = [0, 1, 1000, 149000, 150000, 500000, 2000000];
    for (const textSize of sizes) {
      for (const imageSize of sizes) {
        const result = enforceResponseBudget([
          { type: "text", text: "x".repeat(textSize) },
          { type: "image", data: "A".repeat(imageSize), mimeType: "image/jpeg" },
        ]);
        expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(MAX_RESPONSE_SIZE);
      }
    }
  });
});
