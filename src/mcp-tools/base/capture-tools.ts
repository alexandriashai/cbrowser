/**
 * CBrowser MCP Tools - Screen Capture Tools
 *
 * Screen capture (pixels -> GIF/WebP/video), exposed as `capture_start`,
 * `capture_stop`, `capture_status`.
 *
 * Distinct from the `record` feature, which records user ACTIONS for test
 * generation. Nothing here touches that.
 *
 * The response discipline is the point of this module: a recording is hundreds
 * of frames and tens of megabytes of video, none of which can cross an MCP
 * boundary. Frames and artifacts are returned as PATHS; the only inlined pixels
 * are a contact sheet sized to whatever is left of the response budget after
 * the JSON payload is measured.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import type { Page } from "playwright";

import { getPaths } from "../../config.js";
import { writeArtifact } from "../../artifact-store.js";
import { buildContactSheet } from "../../recording/contact-sheet.js";
import { VideoCaptureSession, type CaptureFormat, type VideoCaptureOptions } from "../../recording/engine.js";
import type { RecordingManifest } from "../../recording/types.js";
import { VIEWPORT_PRESETS } from "../../types.js";
import { buildContentWithScreenshots, MAX_RESPONSE_SIZE } from "../screenshot-utils.js";
import type { CBrowser, McpServer, ToolRegistrationContext } from "../types.js";

/**
 * Does the active key entitle paid model calls?
 *
 * A null tier is the self-hosted "no gating" path, which is entitled: someone
 * running their own instance with their own API key is spending their own money.
 */
async function hasProAccess(): Promise<boolean> {
  try {
    const { getActiveTier } = await import("../tier-gate.js");
    const { tierHasAccess } = await import("../tool-categories.js");
    const tier = getActiveTier();
    return tier === null ? true : tierHasAccess(tier, "pro");
  } catch {
    return false;
  }
}

/** Formats the engine can encode. */
const CAPTURE_FORMATS = ["gif", "webp", "mp4", "webm"] as const;

/** Change points and gaps are truncated at these counts before serialising. */
const MAX_CHANGE_POINTS = 200;
const MAX_FRAME_GAPS = 50;
const MAX_CONSOLE_ERRORS = 20;

/**
 * Base64 inflates a payload by 4/3; the same 1.37 fudge `screenshot` uses in
 * src/browser.ts, which also covers the JSON envelope around the block.
 */
const BASE64_OVERHEAD = 1.37;

/**
 * A contact sheet smaller than this is not worth inlining — below roughly this
 * size the JPEG is too degraded to read, so the path alone is more useful.
 */
const MIN_USEFUL_SHEET_BYTES = 12000;

// ===========================================================================
// Session registry
// ===========================================================================

/**
 * Live capture sessions, keyed by browser token.
 *
 * Capture is stateful across tool calls — `capture_start` returns before the
 * recording ends — so the session has to outlive the handler. Keying by the
 * same `_browserToken` that carries page continuity means a caller driving two
 * browsers gets two independent captures.
 */
const MCP_APP_MIME_LOCAL = "text/html;profile=mcp-app";

const sessions = new Map<string, { session: VideoCaptureSession; url?: string; viewport?: { width: number; height: number } }>();

/** Summary of a capture that has already stopped. */
interface FinishedCapture {
  slug: string;
  outDir: string;
  manifestPath: string;
  frames: number;
  durationMs: number;
  actualFps: number;
  stoppedAt: string;
}

/**
 * The most recent finished capture per key.
 *
 * Without this, `capture_status` after a stop reports "no capture has been
 * started" — the session is gone from the live map and the completed run
 * vanishes with it, which reads as though the capture never happened.
 */
const finished = new Map<string, FinishedCapture>();

/** Sessions are keyed by token; an untokened caller shares the default slot. */
function sessionKey(token?: string): string {
  return token ?? "__default__";
}

/** Exposed for tests and for `reset_browser`-style teardown. */
/**
 * Viewport of the capture currently recording, if any.
 *
 * Exported so the screenshot tool can match it. Returns undefined when nothing
 * is recording, which is the common case and must stay a no-op.
 */
export function activeRecordingViewport(token?: string): { width: number; height: number } | undefined {
  const entry = sessions.get(sessionKey(token));
  if (!entry || entry.session.status().state !== "recording") return undefined;
  return entry.viewport;
}

export function clearCaptureSessions(): void {
  sessions.clear();
  finished.clear();
}

/**
 * A capture started by another process (the CLI or its daemon), discovered
 * through the pointer file the CLI maintains at `videosDir/active.json`.
 *
 * Read-only on purpose: this surface does not write the pointer, because the
 * CLI's `capture stop` signals the pid it finds there, and pointing that at the
 * long-lived MCP server would let a CLI command kill an unrelated process.
 * Cross-surface visibility is one-directional until the daemon owns the pointer.
 */
function foreignActiveCapture(): { slug: string; outDir: string; url?: string; startedAt: string; pid: number } | null {
  try {
    const pointer = join(getPaths().videosDir, "active.json");
    if (!existsSync(pointer)) return null;
    const active = JSON.parse(readFileSync(pointer, "utf-8")) as {
      pid: number; slug: string; outDir: string; url?: string; startedAt: string;
    };
    if (typeof active.pid !== "number") return null;
    // A stale pointer outlives its process; signal 0 tests liveness without
    // touching the process.
    try { process.kill(active.pid, 0); } catch { return null; }
    return active;
  } catch {
    return null;
  }
}

// ===========================================================================
// Argument parsing
// ===========================================================================

/** Parse "5s", "2m", "1500ms" or a bare millisecond count. */
export function parseDurationMs(input: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m)?$/i.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid duration "${input}" - use 5s, 2m, 1500ms or a millisecond count`);
  }
  const value = parseFloat(match[1]!);
  const unit = (match[2] || "ms").toLowerCase();
  const ms = unit === "s" ? value * 1000 : unit === "m" ? value * 60_000 : value;
  if (ms <= 0) throw new Error(`Invalid duration "${input}" - must be greater than zero`);
  return Math.round(ms);
}

/** Parse "gif,webp,mp4" into validated formats. */
export function parseFormats(input: string): CaptureFormat[] {
  const parsed = input.split(",").map((f) => f.trim().toLowerCase()).filter(Boolean);
  const bad = parsed.filter((f) => !CAPTURE_FORMATS.includes(f as CaptureFormat));
  if (bad.length > 0) {
    throw new Error(`Unknown format(s): ${bad.join(", ")}. Supported: ${CAPTURE_FORMATS.join(", ")}`);
  }
  if (parsed.length === 0) throw new Error("format requires at least one format");
  return parsed as CaptureFormat[];
}

/**
 * Resolve a viewport argument: either `WxH` or the name of a built-in preset
 * (`mobile`, `tablet`, `desktop-lg`, ...).
 */
export function parseViewport(input: string): { width: number; height: number } {
  const trimmed = input.trim();
  const match = /^(\d+)\s*x\s*(\d+)$/i.exec(trimmed);
  if (match) {
    const width = parseInt(match[1]!, 10);
    const height = parseInt(match[2]!, 10);
    if (width < 1 || height < 1) {
      throw new Error(`Invalid viewport "${input}" - width and height must be positive`);
    }
    return { width, height };
  }

  const preset = VIEWPORT_PRESETS.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  if (preset) return { width: preset.width, height: preset.height };

  throw new Error(
    `Invalid viewport "${input}" - use WIDTHxHEIGHT (e.g. 1280x720) or a preset: ` +
      VIEWPORT_PRESETS.map((p) => p.name).join(", "),
  );
}

/** Parse "x,y,width,height" into a rect. */
export function parseRegion(input: string): { x: number; y: number; width: number; height: number } {
  const parts = input.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`Invalid region "${input}" - use x,y,width,height (e.g. 0,0,800,600)`);
  }
  const [x, y, width, height] = parts as [number, number, number, number];
  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid region "${input}" - width and height must be positive`);
  }
  return { x, y, width, height };
}

// ===========================================================================
// Payload shaping
// ===========================================================================

export interface CaptureStopPayload {
  success: true;
  slug: string;
  manifest_path: string;
  out_dir: string;
  frames: number;
  target_fps: number;
  actual_fps: number;
  duration_ms: number;
  capture_method: string;
  engine: string;
  output_dims: { width: number; height: number };
  target: RecordingManifest["target"];
  region_clamped?: boolean;
  artifacts: Record<string, string>;
  encode_errors?: Record<string, string>;
  change_points: number[];
  change_points_total: number;
  frame_gaps: { after_index: number; gap_ms: number }[];
  frame_gaps_total: number;
  console_errors: string[];
  console_errors_total: number;
  network_requests_total: number;
  frames_dir: string;
  contact_sheet?: string;
  contact_sheet_note?: string;
  /**
   * Public HTTPS URLs for the encoded artifacts, keyed by the same format names
   * as `artifacts`. Present only for artifacts that were successfully copied
   * into the served directory — a missing key means no URL to offer, never a
   * URL that 404s.
   */
  artifact_urls?: Record<string, string>;
  /** Public URL for the contact sheet, when it was published. */
  contact_sheet_url?: string;
  /**
   * Public URL of a standalone HTML player carrying the recording, the
   * per-moment attention judgements and the closing narrative.
   *
   * This is the link to hand a person: it opens in any browser, needs no client,
   * and is the only artifact here that survives leaving the tool response.
   */
  player_url?: string;
  note: string;
}

/**
 * Build the `capture_stop` JSON payload from a manifest.
 *
 * Deliberately excludes the frame array: 500 frames of paths, crops, SSIM
 * scores and per-frame console/network records is megabytes of JSON that would
 * blow the response budget and tell the model nothing it can act on. The frames
 * live on disk and the directory is named instead. Unbounded lists
 * (change points, gaps, console errors) are truncated with their true totals
 * reported alongside, so the model can tell "3 change points" from
 * "200 shown of 4,812".
 *
 * Pure and exported so the budget can be tested without running a browser.
 */
export function buildCaptureStopPayload(
  manifest: RecordingManifest,
  extra: {
    manifestPath: string;
    outDir: string;
    encodeErrors?: Record<string, string>;
    contactSheet?: string;
    contactSheetNote?: string;
    artifactUrls?: Record<string, string>;
    contactSheetUrl?: string;
    playerUrl?: string;
  },
): CaptureStopPayload {
  const consoleErrors: string[] = [];
  let networkTotal = 0;
  let consoleErrorTotal = 0;

  for (const frame of manifest.frames) {
    networkTotal += frame.network.length;
    for (const entry of frame.console) {
      if (entry.type !== "error") continue;
      consoleErrorTotal++;
      if (consoleErrors.length < MAX_CONSOLE_ERRORS) {
        // Long stack-trace-bearing messages are the usual budget offender.
        consoleErrors.push(entry.text.length > 300 ? `${entry.text.slice(0, 300)}...` : entry.text);
      }
    }
  }

  const encodeErrors = extra.encodeErrors && Object.keys(extra.encodeErrors).length > 0
    ? extra.encodeErrors
    : undefined;

  return {
    success: true,
    slug: manifest.slug,
    manifest_path: extra.manifestPath,
    out_dir: extra.outDir,
    frames: manifest.frames.length,
    target_fps: manifest.target_fps,
    actual_fps: manifest.actual_fps,
    duration_ms: manifest.duration_ms,
    capture_method: manifest.capture_method,
    engine: manifest.engine,
    output_dims: manifest.output_dims,
    target: manifest.target,
    ...(manifest.region_clamped !== undefined ? { region_clamped: manifest.region_clamped } : {}),
    artifacts: manifest.artifacts,
    ...(encodeErrors ? { encode_errors: encodeErrors } : {}),
    change_points: manifest.change_points.slice(0, MAX_CHANGE_POINTS),
    change_points_total: manifest.change_points.length,
    frame_gaps: manifest.frame_gaps.slice(0, MAX_FRAME_GAPS),
    frame_gaps_total: manifest.frame_gaps.length,
    console_errors: consoleErrors,
    console_errors_total: consoleErrorTotal,
    network_requests_total: networkTotal,
    frames_dir: join(extra.outDir, "frames"),
    ...(extra.contactSheet ? { contact_sheet: extra.contactSheet } : {}),
    ...(extra.contactSheetNote ? { contact_sheet_note: extra.contactSheetNote } : {}),
    ...(extra.artifactUrls && Object.keys(extra.artifactUrls).length > 0
      ? { artifact_urls: extra.artifactUrls }
      : {}),
    ...(extra.contactSheetUrl ? { contact_sheet_url: extra.contactSheetUrl } : {}),
    ...(extra.playerUrl ? { player_url: extra.playerUrl } : {}),
    // The manifest carried this and the player rendered it, but the MCP
    // response never surfaced it — so a caller who asked for an overlay had no
    // way to learn whether one ran, which persona it used, or whether the DOM
    // was read. Silence read as "not applied" whether or not it was.
    ...(manifest.attention_overlay ? { attention_overlay: manifest.attention_overlay } : {}),
    note:
      "Frames stay on disk — read them by path. Encoded artifacts are also published " +
      "to public HTTPS URLs in `artifact_urls`, so a GIF or video can be displayed " +
      "directly in a chat client. The contact sheet is an evenly spaced visual sample.",
  };
}

/**
 * Last line of defence on the response budget.
 *
 * The payload builder and the contact-sheet budget already keep the response
 * small, but "small by construction" is a claim about code that can drift. This
 * measures the actual serialized content blocks and sheds until they fit:
 * image blocks first (the sheet is a convenience, the paths are the payload),
 * then the text block itself, replaced by a minimal pointer to the manifest.
 *
 * An over-budget response is therefore not merely unlikely, it cannot be
 * returned — the tool would have to skip this function to emit one.
 */
export function enforceResponseBudget<T extends { type: string; text?: string; data?: string }>(
  content: T[],
  maxBytes = MAX_RESPONSE_SIZE,
  fallbackText = '{"success":true,"note":"Response exceeded the size budget; read the manifest from disk."}',
): T[] {
  const size = (blocks: T[]) => Buffer.byteLength(JSON.stringify(blocks));
  if (size(content) <= maxBytes) return content;

  // Shed pixels before prose: the paths are what the caller acts on.
  const withoutImages = content.filter((block) => block.type !== "image");
  if (size(withoutImages) <= maxBytes) return withoutImages;

  const minimal = withoutImages
    .filter((block) => block.type === "text")
    .slice(0, 1)
    .map((block) => ({ ...block, text: fallbackText }));
  return (size(minimal) <= maxBytes ? minimal : []) as T[];
}

/**
 * Byte budget left for an inlined contact sheet once the JSON payload is
 * accounted for. Returns 0 when there is no room worth using.
 */
export function contactSheetBudget(payloadBytes: number, totalBudget = MAX_RESPONSE_SIZE): number {
  const remaining = totalBudget - payloadBytes;
  if (remaining <= 0) return 0;
  const budget = Math.floor(remaining / BASE64_OVERHEAD);
  return budget >= MIN_USEFUL_SHEET_BYTES ? budget : 0;
}

// ===========================================================================
// Core operations (shared by both MCP servers)
// ===========================================================================

export interface CaptureStartArgs {
  url?: string;
  fps?: number;
  duration?: string;
  viewport?: string;
  region?: string;
  element?: string;
  padding?: number;
  format?: string;
  quality?: number;
  max_frames?: number;
  name?: string;
  out_dir?: string;
  attention_overlay?: boolean;
  overlay_persona?: string;
  overlay_goal?: string;
}

/**
 * Resolve a selector to a fixed capture region.
 *
 * The engine has no element target, so an element capture is resolved to the
 * element's bounding box ONCE, at start. The region does not follow the element
 * if it later moves — that limitation is reported back to the caller rather
 * than hidden.
 */
async function resolveElementRegion(
  page: Page,
  selector: string,
  padding: number,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) {
    throw new Error(`Element "${selector}" is not visible, so it has no region to capture`);
  }
  return {
    x: box.x - padding,
    y: box.y - padding,
    width: box.width + padding * 2,
    height: box.height + padding * 2,
  };
}

/** Start a capture on the given browser. Returns the payload object. */
export async function startCapture(
  browser: CBrowser,
  args: CaptureStartArgs,
  token?: string,
): Promise<Record<string, unknown>> {
  const key = sessionKey(token);
  const existing = sessions.get(key);
  if (existing && existing.session.status().state === "recording") {
    throw new Error(
      `A capture is already running (${existing.session.status().slug}). ` +
        "Call capture_stop before starting another.",
    );
  }

  if (args.viewport) {
    const size = parseViewport(args.viewport);
    const page = await browser.getPage();
    await page.setViewportSize(size);
  }

  if (args.url) await browser.navigate(args.url);
  const page = await browser.getPage();

  if (args.region && args.element) {
    throw new Error("Pass region or element, not both");
  }

  let target: VideoCaptureOptions["target"];
  let elementNote: string | undefined;
  if (args.region) {
    target = { kind: "region", rect: parseRegion(args.region) };
  } else if (args.element) {
    const padding = args.padding ?? 0;
    target = { kind: "region", rect: await resolveElementRegion(page, args.element, padding) };
    elementNote =
      `Region resolved from selector "${args.element}" at capture start. ` +
      "It is fixed for the run and does not follow the element if it moves.";
  }

  // The browser's own config is private, so the engine family is read off the
  // live Playwright context rather than duplicated from CBrowser config.
  const engineName = page.context().browser()?.browserType().name();
  const engine = engineName === "firefox" ? "firefox" : engineName === "webkit" ? "webkit" : "chromium";

  const options: VideoCaptureOptions = {
    ...(args.fps !== undefined ? { fps: args.fps } : {}),
    ...(args.duration !== undefined ? { durationMs: parseDurationMs(args.duration) } : {}),
    ...(target ? { target } : {}),
    ...(args.format !== undefined ? { format: parseFormats(args.format) } : {}),
    ...(args.quality !== undefined ? { quality: args.quality } : {}),
    ...(args.max_frames !== undefined ? { maxFrames: args.max_frames } : {}),
    ...(args.name !== undefined ? { slug: args.name } : {}),
    ...(args.out_dir !== undefined ? { outDir: resolve(args.out_dir) } : {}),
    // Overlay is resolved at stop, against the still-live page, so the DOM it
    // reads is the page as recorded rather than a reconstruction.
    // Register the account's custom personas before the overlay resolves one.
    // They live in the CMS, not on disk, so without this a persona created
    // through the account is silently replaced by a generic profile and every
    // number is attributed to a persona that never ran.
    ...(args.attention_overlay ? await (async () => {
      try {
        const { loadAccountPersonas } = await import("../account-personas.js");
        const { getSessionApiKey } = await import("./cognitive-tools.js");
        await loadAccountPersonas(getSessionApiKey());
      } catch { /* falls back to disk and built-ins */ }
      return {};
    })() : {}),
    ...(args.attention_overlay
      ? {
          saliencyOverlay: {
            ...(args.overlay_persona ? { persona: args.overlay_persona } : {}),
            ...(args.overlay_goal ? { goal: args.overlay_goal } : {}),
            // screen_capture is a free-tier tool, but the persona relevance
            // judge and the capture summary each cost a model call. Entitlement
            // is resolved from the live key's tier rather than from the tool's
            // own tier, so a free key still gets the overlay — computed with the
            // keyword scorer instead of a paid judgement.
            entitled: await hasProAccess(),
          },
        }
      : {}),
  };

  // videosDir, not recordingsDir — the latter is the ACTION-recording feature's
  // .json store, and screenshotsDir is swept by the 1-hour retention cleanup,
  // which would delete users' GIFs. Session-scoped to match the CLI layout
  // (~/.cbrowser/videos/<sessionId>/<slug>/): without the session segment, two
  // concurrent captures that pick the same slug interleave frames into one dir.
  const paths = getPaths();
  const session = new VideoCaptureSession(page, engine, join(paths.videosDir, paths.sessionId));
  const status = await session.start(options);
  // Recorded so screenshots taken mid-capture can be forced to the same size.
  // A screenshot at a different viewport reflows the page, so the frame it
  // returns is not the frame the recording contains -- two artifacts of the
  // same moment that disagree, which is worse than having only one.
  const recViewport = page.viewportSize();
  sessions.set(key, {
    session,
    ...(args.url ? { url: args.url } : {}),
    ...(recViewport ? { viewport: recViewport } : {}),
  });

  // An opening frame, returned inline. Without it the caller is blind until
  // capture_stop: it has just been told recording started but has no idea what
  // is on screen, so it cannot tell "the page loaded" from "the page is a 404"
  // until the whole capture is spent. Cheap, and it anchors everything after.
  // Routed through browser.screenshot rather than page.screenshot so it obeys
  // the same compression budget every other screenshot does. A raw grab here was
  // returning a full-size frame while the screenshot tool returned a compressed
  // one, so the two disagreed on size within a single session. noResize because
  // a capture is now running and the viewport is not the budget's to spend
  // (since 2026-10-07, BUG-02, compression never resizes the viewport at all).
  let openingFrame: string | undefined;
  try {
    const shotPath = await browser.screenshot(undefined, { compress: true, noResize: true });
    openingFrame = (await import("node:fs")).readFileSync(shotPath).toString("base64");
  } catch { /* a capture that started is still a success without the preview */ }

  return {
    success: true,
    state: status.state,
    slug: status.slug,
    out_dir: status.outDir,
    capture_method: status.captureMethod,
    engine,
    ...(recViewport ? { viewport: `${recViewport.width}x${recViewport.height}` } : {}),
    ...(openingFrame ? { opening_frame: openingFrame, opening_frame_mime: "image/jpeg" } : {}),
    ...(elementNote ? { element_note: elementNote } : {}),
    note:
      "Capture is event-driven: a page that never repaints emits no frames, and still " +
      "stretches are reported as frame_gaps rather than padded out. Interact with the page " +
      "(navigate, click, scroll) to produce frames, then call capture_stop.",
  };
}

/**
 * Stop the capture and build the response payload plus a budget-fitted contact
 * sheet. Returns the payload and the sheet path (if one was produced).
 */
export async function stopCapture(
  token?: string,
): Promise<{ payload: CaptureStopPayload; contactSheet?: string; captureUiUri?: string }> {
  const key = sessionKey(token);
  const entry = sessions.get(key);
  if (!entry) {
    throw new Error("No capture has been started on this browser session. Call capture_start first.");
  }

  const result = await entry.session.stop();
  const status = entry.session.status();
  const manifest = result.manifest;

  // Frame paths are relative to the manifest, so they resolve against outDir.
  const framePaths = manifest.frames.map((f) =>
    isAbsolute(f.path) ? f.path : join(status.outDir, f.path),
  );

  // Size the JSON first, then spend what is left of the budget on pixels.
  const provisional = buildCaptureStopPayload(manifest, {
    manifestPath: result.manifestPath,
    outDir: status.outDir,
    encodeErrors: result.encodeErrors,
    contactSheet: join(status.outDir, "contact-sheet.jpg"),
  });
  const budget = contactSheetBudget(Buffer.byteLength(JSON.stringify(provisional, null, 2)));

  let contactSheet: string | undefined;
  let contactSheetNote: string | undefined;

  const usable = framePaths.filter((p) => existsSync(p));
  if (usable.length === 0) {
    contactSheetNote = "No frames were captured, so there is no contact sheet.";
  } else if (budget === 0) {
    contactSheetNote = "Response budget left no room to inline a contact sheet.";
  } else {
    try {
      const sheet = await buildContactSheet({
        framePaths: usable,
        outPath: join(status.outDir, "contact-sheet.jpg"),
        maxBytes: budget,
      });
      contactSheet = sheet.path;
    } catch (e) {
      // A capture that succeeded is not failed by an unrenderable summary.
      contactSheetNote = `Contact sheet could not be built: ${(e as Error).message}`;
    }
  }

  // Publish encoded artifacts to the served directory so a chat client can
  // render them. Same store screenshots use. A copy that fails yields no key
  // rather than a URL that 404s — handing back a dead link is worse than
  // handing back only the disk path.
  const artifactUrls: Record<string, string> = {};
  for (const [format, artifactPath] of Object.entries(manifest.artifacts ?? {})) {
    if (typeof artifactPath !== "string" || artifactPath.length === 0) continue;
    // The engine stores `relative(outDir, outPath)` — a bare filename. Calling
    // existsSync on it resolved against the process CWD, always missed, and the
    // loop skipped every artifact, so artifact_urls came back absent while the
    // note in the same payload advertised it. contact_sheet_url worked only
    // because that path was already absolute.
    const diskPath = isAbsolute(artifactPath) ? artifactPath : join(status.outDir, artifactPath);
    if (!existsSync(diskPath)) continue;
    try {
      const written = writeArtifact(readFileSync(diskPath), `${manifest.slug}.${format}`);
      if (written) artifactUrls[format] = written.url;
    } catch { /* keep the capture; just omit this URL */ }
  }

  let contactSheetUrl: string | undefined;
  if (contactSheet && existsSync(contactSheet)) {
    try {
      const written = writeArtifact(readFileSync(contactSheet), `${manifest.slug}-contact-sheet.jpg`);
      if (written) contactSheetUrl = written.url;
    } catch { /* same */ }
  }

  // Build a standalone player and publish it alongside the media. This is the
  // only artifact a chat client can actually open: video will not cross an MCP
  // boundary and the judgement JSON is not something a person reads.
  let playerUrl: string | undefined;
  try {
    const { buildCapturePlayer } = await import("../../recording/capture-player.js");
    const overlay = manifest.attention_overlay;
    const html = buildCapturePlayer({
      slug: manifest.slug,
      targetUrl: entry?.url,
      durationMs: manifest.duration_ms,
      frames: manifest.frames.length,
      actualFps: manifest.actual_fps,
      artifactUrls,
      ...(manifest.interactions?.length ? { interactions: manifest.interactions } : {}),
      ...(contactSheetUrl ? { contactSheetUrl } : {}),
      ...(overlay
        ? {
            overlay: {
              quantity: overlay.quantity,
              usedDom: overlay.used_dom,
              domElements: overlay.dom_elements,
            },
            // The player was already built to render these; nothing was passing
            // them, so every capture rendered an empty timeline.
            ...(overlay.moments
              ? {
                  moments: overlay.moments.map((m) => ({
                    frameIndex: m.frame_index,
                    tMs: m.t_ms,
                    ...(m.reasoning ? { reasoning: m.reasoning } : {}),
                    topElements: m.top_elements,
                  })),
                }
              : {}),
            ...(overlay.summary ? { summary: overlay.summary } : {}),
          }
        : {}),
    });
    const written = writeArtifact(Buffer.from(html, "utf8"), `${manifest.slug}-player.html`);
    if (written) playerUrl = written.url;
  } catch { /* the recording stands without its player */ }

  // Inline player for MCP Apps. Separate build from the hosted page above,
  // because that one links its artifacts by URL and this one cannot: the widget
  // sandbox allowlists origins that do not include cbrowser.ai, so every frame
  // it shows has to be embedded as a data: URI under a byte budget.
  let captureUiUri: string | undefined;
  try {
    const { buildInlineCapturePlayer } = await import("../../recording/inline-player.js");
    const { publishCaptureUi } = await import("../ui-resources.js");
    const overlay = manifest.attention_overlay;
    const framesDir = overlay?.applied ? "frames-attention" : "frames";
    const inline = await buildInlineCapturePlayer({
      slug: manifest.slug,
      ...(entry?.url ? { targetUrl: entry.url } : {}),
      durationMs: manifest.duration_ms,
      actualFps: manifest.actual_fps,
      framePaths: manifest.frames.map((_f, i) =>
        join(status.outDir, framesDir, `${String(i).padStart(4, "0")}.jpg`)),
      frameTimesMs: manifest.frames.map((f) => f.t_ms),
      ...(manifest.interactions?.length ? { interactions: manifest.interactions } : {}),
      ...(overlay?.moments
        ? { moments: overlay.moments.map((m) => ({
            frameIndex: m.frame_index, tMs: m.t_ms,
            ...(m.reasoning ? { reasoning: m.reasoning } : {}),
            topElements: (m.top_elements ?? []) as Array<{ text: string; score: number; type: string }>,
          })) }
        : {}),
      ...(overlay?.summary ? { summary: overlay.summary } : {}),
      artifactUrls,
      ...(playerUrl ? { playerUrl } : {}),
      ...(overlay
        ? { overlay: { quantity: overlay.quantity, domElements: overlay.dom_elements } }
        : {}),
    });
    captureUiUri = publishCaptureUi(manifest.slug, inline);
  } catch { /* inline panel is additive; the recording and hosted player stand */ }

  // Surface the recording in the account's Visual Reports gallery, the same way
  // heatmaps and empathy screenshots appear. Prefer the GIF: it plays inline in
  // a gallery, where a WebM needs a player and the contact sheet is only a
  // sample. Fire-and-forget — a gallery write never costs the recording.
  try {
    const galleryUrl = artifactUrls.gif ?? artifactUrls.webp ?? contactSheetUrl;
    if (galleryUrl) {
      const { saveVisualReport } = await import("../visual-report-saver.js");
      const { getSessionApiKey } = await import("./cognitive-tools.js");
      const overlay = manifest.attention_overlay;
      saveVisualReport({
        apiKey: getSessionApiKey(),
        imageUrl: galleryUrl,
        toolName: "capture_stop",
        targetUrl: entry?.url,
        ...(overlay?.used_dom ? { persona: "first-timer" } : {}),
        description: overlay?.applied
          // Name the quantity, not just the artifact: with DOM this is the full
          // attention model, without it only the bottom-up contrast half.
          ? `Screen recording with ${overlay.quantity === "predicted-attention"
              ? "predicted-attention"
              : "visual-contrast"} overlay — ${manifest.frames.length} frames over ${
              Math.round(manifest.duration_ms / 1000)}s.`
          : `Screen recording — ${manifest.frames.length} frames over ${
              Math.round(manifest.duration_ms / 1000)}s.`,
        metadata: {
          slug: manifest.slug,
          frames: manifest.frames.length,
          duration_ms: manifest.duration_ms,
          actual_fps: manifest.actual_fps,
          artifact_urls: artifactUrls,
          ...(contactSheetUrl ? { contact_sheet_url: contactSheetUrl } : {}),
          ...(overlay ? { attention_overlay: overlay } : {}),
        },
      });
    }
  } catch { /* gallery is a nicety; the capture is the deliverable */ }

  const payload = buildCaptureStopPayload(manifest, {
    manifestPath: result.manifestPath,
    outDir: status.outDir,
    encodeErrors: result.encodeErrors,
    ...(contactSheet ? { contactSheet } : {}),
    ...(contactSheetNote ? { contactSheetNote } : {}),
    ...(Object.keys(artifactUrls).length > 0 ? { artifactUrls } : {}),
    ...(contactSheetUrl ? { contactSheetUrl } : {}),
    ...(playerUrl ? { playerUrl } : {}),
  });

  finished.set(key, {
    slug: manifest.slug,
    outDir: status.outDir,
    manifestPath: result.manifestPath,
    frames: manifest.frames.length,
    durationMs: manifest.duration_ms,
    actualFps: manifest.actual_fps,
    stoppedAt: new Date().toISOString(),
  });
  sessions.delete(key);
  return { payload, ...(contactSheet ? { contactSheet } : {}), ...(captureUiUri ? { captureUiUri } : {}) };
}

/**
 * Describe a capture running somewhere other than this browser session, if any:
 * another token on this server, or another process (CLI / daemon).
 */
function runningElsewhere(): Record<string, unknown> | null {
  for (const [otherKey, other] of sessions) {
    const status = other.session.status();
    if (status.state !== "recording") continue;
    return {
      scope: "another browser token on this server",
      slug: status.slug,
      out_dir: status.outDir,
      frames: status.frames,
      elapsed_ms: status.elapsedMs,
      ...(other.url ? { url: other.url } : {}),
      note:
        "Pass that call's _browserToken to capture_stop; this session's " +
        "capture_stop will not find it." +
        (otherKey === "__default__" ? " It was started without a token." : ""),
    };
  }

  const foreign = foreignActiveCapture();
  if (foreign) {
    return {
      scope: `another process (pid ${foreign.pid})`,
      slug: foreign.slug,
      out_dir: foreign.outDir,
      started_at: foreign.startedAt,
      ...(foreign.url ? { url: foreign.url } : {}),
      note:
        "Started outside the MCP server (CLI or daemon). It is stopped from the " +
        "process that started it; capture_stop here will not find it.",
    };
  }

  return null;
}

/**
 * Report the running or most recent capture for this browser session.
 *
 * Two rules, in tension, both honoured:
 *   - A running capture is never invisible. If one is live on another token or
 *     in another process, it is always surfaced.
 *   - The caller's own capture is never masked by someone else's. A session
 *     that just finished a recording is told about its own run first, with the
 *     other capture attached alongside rather than in place of it.
 *
 * The failure this replaces: after `capture_stop`, status reported
 * "No capture has been started on this browser session" — the completed run
 * vanished with the session object, reading as though it never happened.
 */
export function captureStatus(token?: string): Record<string, unknown> {
  const key = sessionKey(token);
  const elsewhere = runningElsewhere();
  const withElsewhere = (base: Record<string, unknown>) =>
    elsewhere ? { ...base, also_running_elsewhere: elsewhere } : base;

  // 1. This session's own capture, running or just stopped.
  const entry = sessions.get(key);
  if (entry) {
    const status = entry.session.status();
    return withElsewhere({
      success: true,
      state: status.state,
      slug: status.slug,
      out_dir: status.outDir,
      frames: status.frames,
      elapsed_ms: status.elapsedMs,
      capture_method: status.captureMethod,
      ...(status.manifestPath ? { manifest_path: status.manifestPath } : {}),
      ...(entry.url ? { url: entry.url } : {}),
    });
  }

  // 2. This session's most recent completed capture.
  const own = finished.get(key);
  if (own) return withElsewhere(finishedPayload(own));

  // 3. Nothing of this session's own — surface whatever is running elsewhere.
  if (elsewhere) {
    return {
      success: true,
      state: "recording",
      started_by: elsewhere.scope,
      ...elsewhere,
    };
  }

  // 4. Any other session's completed capture.
  const recent = mostRecentFinished();
  if (recent) return finishedPayload(recent);

  return {
    success: true,
    state: "idle",
    note: "No capture has been started on this browser session.",
  };
}

function finishedPayload(capture: FinishedCapture): Record<string, unknown> {
  return {
    success: true,
    state: "stopped",
    slug: capture.slug,
    out_dir: capture.outDir,
    manifest_path: capture.manifestPath,
    frames: capture.frames,
    duration_ms: capture.durationMs,
    actual_fps: capture.actualFps,
    stopped_at: capture.stoppedAt,
    note: "No capture is running on this session. This is its most recent completed capture.",
  };
}

/** Most recently stopped capture across all keys. */
function mostRecentFinished(): FinishedCapture | undefined {
  let best: FinishedCapture | undefined;
  for (const candidate of finished.values()) {
    if (!best || candidate.stoppedAt > best.stoppedAt) best = candidate;
  }
  return best;
}

/** Shared error envelope, matching the house shape for tool failures. */
function errorContent(error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          { success: false, error: error instanceof Error ? error.message : String(error) },
          null,
          2,
        ),
      },
    ],
  };
}

// ===========================================================================
// Registration
// ===========================================================================

/** Input schema shared by both servers, so the two cannot drift. */
export const captureStartSchema = {
  url: z.string().optional().describe("URL to navigate to before capturing. Omit to capture the current page."),
  fps: z.number().optional().describe("Target frames per second (default: 10)"),
  duration: z.string().optional().describe("Auto-stop after this long: 5s, 2m, 1500ms. Omit for an open-ended capture stopped by capture_stop."),
  viewport: z.string().optional().describe("Viewport as WIDTHxHEIGHT (e.g. 1280x720) or a preset name (mobile, tablet, desktop, desktop-lg)"),
  region: z.string().optional().describe("Capture a fixed region as x,y,width,height (e.g. 0,0,800,600). Clamped to the viewport."),
  element: z.string().optional().describe("CSS selector to capture. Resolved to the element's bounding box once at start; the region does not follow the element if it moves."),
  padding: z.number().optional().describe("Padding in pixels around the element region (default: 0)"),
  format: z.string().optional().describe("Comma-separated output formats: gif,webp,mp4,webm (default: gif). mp4 needs a full ffmpeg; the bundled one does webm."),
  quality: z.number().optional().describe("JPEG quality for captured frames, 1-100 (default: 80)"),
  max_frames: z.number().optional().describe("Hard cap on retained frames (default: 3000)"),
  name: z.string().optional().describe("Capture name / slug"),
  out_dir: z.string().optional().describe("Output directory (default: a slug directory under the recordings dir)"),
  attention_overlay: z.boolean().optional().describe("Paint the predicted-attention heatmap over every frame before encoding. Uses the live DOM, so this is the full attention model (5% visual contrast + 95% DOM semantics), not contrast alone. Costs roughly 0.5-1s per frame. Default false."),
  overlay_persona: z.string().optional().describe("Persona whose priorities weight the attention overlay (default: first-timer). Only used with attention_overlay."),
  overlay_goal: z.string().optional().describe("Goal string that weights goal-relevance in the attention overlay. Only used with attention_overlay."),
  _browserToken: z.string().optional().describe("Browser session token from a previous tool call"),
};

export const captureStopSchema = {
  _browserToken: z.string().optional().describe("Browser session token from a previous tool call"),
};

export const captureStatusSchema = {
  _browserToken: z.string().optional().describe("Browser session token from a previous tool call"),
};

const CAPTURE_START_DESCRIPTION =
  "Start capturing the screen to GIF/WebP/video. Records PIXELS over time — distinct from the " +
  "`record` tool family, which records user actions for test generation. Capture runs in the " +
  "background: call capture_start, interact with the page, then capture_stop. " +
  "IMPORTANT: If you received a _browserToken from a previous tool call, you MUST pass it here " +
  "to capture the same page. Without it, you get a blank new browser.";

const CAPTURE_STOP_DESCRIPTION =
  "Stop the running screen capture, encode the requested formats and return the manifest path, " +
  "artifact paths, change points and an inlined contact sheet (an evenly spaced visual sample). " +
  "Frames and video are returned as paths, never inlined — read them from disk if you need them.";

const CAPTURE_STATUS_DESCRIPTION =
  "Report the running or most recent screen capture for this browser session: state, frame count, " +
  "elapsed time and output directory.";

/**
 * Register capture tools (3 tools: capture_start, capture_stop, capture_status)
 */
export function registerCaptureTools(
  server: McpServer,
  { getBrowser, getBrowserByToken }: ToolRegistrationContext,
): void {
  /** Resolve the browser + token exactly as the other tool modules do. */
  const resolveBrowser = async (
    _browserToken?: string,
  ): Promise<{ browser: CBrowser; token?: string }> => {
    if (getBrowserByToken) {
      const result = await getBrowserByToken(_browserToken);
      return { browser: result.browser, token: result.token };
    }
    return { browser: await getBrowser() };
  };

  server.registerTool("capture_start", {
    title: "Start Screen Capture",
    description: CAPTURE_START_DESCRIPTION,
    inputSchema: captureStartSchema,
    annotations: {
      title: "Start Screen Capture",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ _browserToken, ...args }) => {
    try {
      const { browser, token } = await resolveBrowser(_browserToken);
      const payload = await startCapture(browser, args, token);
      // The opening frame is split out of the JSON and emitted as a real image
      // block. Left in the payload it would be a multi-KB base64 string the
      // caller can read but not SEE, which is the opposite of the point.
      const { opening_frame: frame, opening_frame_mime: mime, ...rest } = payload as
        Record<string, unknown> & { opening_frame?: string; opening_frame_mime?: string };
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ ...rest, ...(token ? { _browserToken: token } : {}) }, null, 2),
          },
          ...(frame
            ? [{ type: "image" as const, data: frame, mimeType: mime ?? "image/jpeg" }]
            : []),
        ],
      };
    } catch (error) {
      return errorContent(error);
    }
  });

  server.registerTool("capture_stop", {
    title: "Stop Screen Capture",
    description: CAPTURE_STOP_DESCRIPTION,
    inputSchema: captureStopSchema,
    annotations: {
      title: "Stop Screen Capture",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ _browserToken }) => {
    try {
      const { token } = await resolveBrowser(_browserToken);
      const { payload, contactSheet, captureUiUri } = await stopCapture(token);
      // No embedded HTML here either: it would land in the model's context as
      // a multi-hundred-KB string and still not render. The per-capture view is
      // referenced by URI and fetched by the host; only the pointer travels.
      return {
        content: enforceResponseBudget(
          buildContentWithScreenshots(
            { ...payload, ...(token ? { _browserToken: token } : {}) },
            contactSheet,
          ),
        ),
        ...(captureUiUri ? { _meta: { ui: { resourceUri: captureUiUri } } } : {}),
      };
    } catch (error) {
      return errorContent(error);
    }
  });

  server.registerTool("capture_status", {
    title: "Screen Capture Status",
    description: CAPTURE_STATUS_DESCRIPTION,
    inputSchema: captureStatusSchema,
    annotations: {
      title: "Screen Capture Status",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ _browserToken }) => {
    try {
      const { token } = await resolveBrowser(_browserToken);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { ...captureStatus(token), ...(token ? { _browserToken: token } : {}) },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return errorContent(error);
    }
  });
}

export { CAPTURE_START_DESCRIPTION, CAPTURE_STOP_DESCRIPTION, CAPTURE_STATUS_DESCRIPTION };
