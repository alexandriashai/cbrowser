/**
 * Screen capture (capture start/stop/status) and the auto-capture setting
 * other commands take.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */

import { CBrowser } from "../browser.js";
import { resolveDevice, DEVICE_PRESETS } from "../devices.js";
import { isDaemonRunning, sendToDaemon } from "../daemon.js";
import { getPaths } from "../config.js";
import { uniqueStamp } from "../temp-files.js";
import { mkdirSync, writeFileSync, existsSync, unlinkSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { type StartTrigger, type StopTrigger, VideoCaptureSession } from "../recording/engine.js";
import { type RecordingTarget, parseManifest, changeSignal } from "../recording/types.js";
import type { AutoCaptureSetting, AutoCaptureResult } from "../recording/auto-capture.js";
import { isBoundedCapture } from "../page-continuity.js";
import { allowedFlags } from "./flags.js";
import { parseDurationMs, parseRegion, parseFormats, parseViewportList } from "./options.js";

// =========================================================================
// Screen capture (capture start/stop/status)
//
// Distinct from the `record` command, which records user ACTIONS for test
// generation. This captures PIXELS into a GIF/WebP/video.
// =========================================================================

/** Where the active-capture pointer lives, so `capture stop` can find it. */
function captureStatePath(): string {
  return join(getPaths().videosDir, "active.json");
}

interface ActiveCapture {
  pid: number;
  slug: string;
  outDir: string;
  url?: string;
  startedAt: string;
}

/**
 * Flags `capture start` understands. Anything outside this set is rejected
 * rather than ignored: a flag that is accepted and silently dropped returns a
 * confident "✓" for a capture the user did not ask for, which is worse than
 * an error. The globals are the ones the CLI itself consumes before dispatch.
 */
const CAPTURE_FLAGS = allowedFlags("capture");

/**
 * Resolve `--device` to a real preset key, or exit naming the bad value.
 *
 * `capture start` checks here, before it builds anything. Every other command
 * gets the same check from CBrowser.launch() (src/devices.ts resolveDevice);
 * before 2026-10-21 the browser skipped names it did not know and rendered
 * 1280x800 desktop. Case and spaces do not matter: "iPhone 15" is "iphone-15".
 */
export function resolveDevicePreset(value: string): string {
  const resolved = resolveDevice(value);
  if ("key" in resolved) return resolved.key;

  console.error(`Error: unknown --device "${value}"`);
  if (resolved.suggestions.length > 0) console.error(`  Did you mean: ${resolved.suggestions.join(", ")}?`);
  console.error(`  'cbrowser device list' shows all ${Object.keys(DEVICE_PRESETS).length} presets; --viewport WIDTHxHEIGHT sets any size.`);
  process.exit(1);
}

/** Reject any flag `capture start` cannot honour, naming it. */
function assertCaptureFlagsSupported(options: Record<string, string | boolean>): void {
  const unknown = Object.keys(options).filter((flag) => !CAPTURE_FLAGS.has(flag));
  if (unknown.length === 0) return;

  console.error(`Error: 'capture start' does not support ${unknown.map((f) => `--${f}`).join(", ")}`);
  console.error(`  Supported: ${[...CAPTURE_FLAGS].map((f) => `--${f}`).join(" ")}`);
  process.exit(1);
}

/**
 * Build the start/stop triggers from the trigger flags.
 *
 * Triggers compose: `--after-element .modal --after-delay 200ms --duration 3s`
 * waits for the modal, waits another 200ms, then records for three seconds.
 */
function buildCaptureTriggers(options: Record<string, string | boolean>): {
  startTrigger?: StartTrigger;
  startDelayMs?: number;
  stopTrigger?: StopTrigger;
  triggerTimeoutMs?: number;
} {
  const LIFECYCLE = ["load", "domcontentloaded", "networkidle"] as const;

  let startTrigger: StartTrigger | undefined;
  if (typeof options.after === "string" && typeof options["after-element"] === "string") {
    console.error("Error: --after and --after-element are mutually exclusive - pick one");
    process.exit(1);
  }
  if (typeof options.after === "string") {
    const event = options.after.trim().toLowerCase();
    if (!LIFECYCLE.includes(event as typeof LIFECYCLE[number])) {
      console.error(`Error: --after must be one of ${LIFECYCLE.join(", ")} (got "${options.after}")`);
      process.exit(1);
    }
    startTrigger = { kind: "lifecycle", event: event as typeof LIFECYCLE[number] };
  } else if (typeof options["after-element"] === "string") {
    startTrigger = { kind: "element", selector: options["after-element"] };
  } else if (options.after !== undefined || options["after-element"] !== undefined) {
    console.error("Error: --after / --after-element require a value");
    process.exit(1);
  }

  const startDelayMs = typeof options["after-delay"] === "string"
    ? parseDurationMs(options["after-delay"])
    : undefined;

  const stopFlags = ["until-element", "until-element-gone", "until-idle"].filter(
    (f) => options[f] !== undefined,
  );
  if (stopFlags.length > 1) {
    console.error(`Error: ${stopFlags.map((f) => `--${f}`).join(" and ")} are mutually exclusive - pick one`);
    process.exit(1);
  }

  let stopTrigger: StopTrigger | undefined;
  if (typeof options["until-element"] === "string") {
    stopTrigger = { kind: "element-appears", selector: options["until-element"] };
  } else if (typeof options["until-element-gone"] === "string") {
    stopTrigger = { kind: "element-disappears", selector: options["until-element-gone"] };
  } else if (typeof options["until-idle"] === "string") {
    stopTrigger = { kind: "idle", idleMs: parseDurationMs(options["until-idle"]) };
  } else if (stopFlags.length === 1) {
    console.error(`Error: --${stopFlags[0]} requires a value`);
    process.exit(1);
  }

  const triggerTimeoutMs = typeof options.timeout === "string"
    ? parseDurationMs(options.timeout)
    : undefined;

  return { startTrigger, startDelayMs, stopTrigger, triggerTimeoutMs };
}

/**
 * Build the capture target from the target flags.
 *
 * The three targets are mutually exclusive; asking for two is a contradiction
 * the CLI cannot silently resolve, so it errors instead of picking one.
 */
function buildCaptureTarget(options: Record<string, string | boolean>): RecordingTarget {
  const hasRegion = typeof options.region === "string";
  const hasElement = typeof options.element === "string";

  if (hasRegion && hasElement) {
    console.error("Error: --region and --element are mutually exclusive - pick one");
    process.exit(1);
  }

  if (typeof options["element-padding"] !== "undefined" && !hasElement) {
    console.error("Error: --element-padding only applies with --element");
    process.exit(1);
  }

  if (hasRegion) {
    return { kind: "region", rect: parseRegion(options.region as string) };
  }

  if (hasElement) {
    const selector = options.element as string;
    if (selector.trim() === "") {
      console.error("Error: --element requires a selector");
      process.exit(1);
    }
    const padding = options["element-padding"] !== undefined ? Number(options["element-padding"]) : 0;
    if (!Number.isFinite(padding) || padding < 0) {
      console.error(`Error: --element-padding must be a non-negative number (got "${String(options["element-padding"])}")`);
      process.exit(1);
    }
    return { kind: "element", selector, padding };
  }

  return { kind: "viewport" };
}

/**
 * Run a screencast capture to completion in this process.
 *
 * Capture is single-process by necessity: the browser profile is locked by
 * whoever launched it, so a second CLI invocation cannot attach to a running
 * capture's page. `capture stop` therefore signals this process rather than
 * doing any capture work of its own.
 */
export async function runCaptureStart(
  browser: CBrowser,
  url: string | undefined,
  options: Record<string, string | boolean>,
): Promise<void> {
  assertCaptureFlagsSupported(options);

  // A capture with no end condition needs somewhere to live that outlasts this
  // process. The daemon owns the browser, so the capture runs there and later
  // commands drive the same page into the same recording.
  const openEnded = !isBoundedCapture(options);

  // A bounded capture records in a browser of its own, so with no URL it got a
  // blank page while the daemon held the real one, and exited 0 (2026-11-08).
  if (!openEnded && !url && await isDaemonRunning()) {
    console.error("Error: a bounded capture (--duration or --until-*) records in a browser of its own, not the daemon's,");
    console.error("  so with no URL it would record a blank page.");
    console.error("");
    console.error("  Record the daemon's page:  leave out --duration and --until-*, then cbrowser capture stop");
    console.error("  Or give it the page:       cbrowser capture start <url> --duration 5s");
    process.exit(1);
  }

  if (openEnded) {
    if (await isDaemonRunning()) {
      await runCaptureStartViaDaemon(url, options);
      return;
    }
    console.error("Error: an open-ended capture needs the daemon, which is not running.");
    console.error("  Without it the capture would live and die inside this one process, so");
    console.error("  'capture stop' from another shell and any later click/fill/navigate");
    console.error("  would never reach it.");
    console.error("");
    console.error("  Start it:      cbrowser daemon start");
    console.error("  Or bound it:   --duration 5s | --until-element <sel> | --until-idle 800ms");
    process.exit(1);
  }

  const fps = options.fps !== undefined ? Number(options.fps) : undefined;
  if (fps !== undefined && (!Number.isFinite(fps) || fps <= 0)) {
    console.error(`Error: --fps must be a positive number (got "${String(options.fps)}")`);
    process.exit(1);
  }

  const quality = options.quality !== undefined ? Number(options.quality) : undefined;
  if (quality !== undefined && (!Number.isInteger(quality) || quality < 1 || quality > 100)) {
    console.error(`Error: --quality must be an integer from 1 to 100 (got "${String(options.quality)}")`);
    process.exit(1);
  }

  const maxFrames = options["max-frames"] !== undefined ? Number(options["max-frames"]) : undefined;
  if (maxFrames !== undefined && (!Number.isInteger(maxFrames) || maxFrames < 1)) {
    console.error(`Error: --max-frames must be a positive integer (got "${String(options["max-frames"])}")`);
    process.exit(1);
  }

  // Normalise in place so the browser built below gets a key it recognises.
  if (typeof options.device === "string") options.device = resolveDevicePreset(options.device);

  const durationMs = typeof options.duration === "string" ? parseDurationMs(options.duration) : undefined;
  const format = typeof options.format === "string" ? parseFormats(options.format) : undefined;
  const outDir = typeof options.out === "string" ? resolve(options.out) : undefined;

  if (url) await browser.navigate(url);
  const page = await browser.getPage();

  // Multiple viewports run as separate, sequential captures. Sequential rather
  // than concurrent by design: one page cannot be two sizes at once, so
  // overlapping them would interleave frames from different viewports into one
  // stream. Each run gets its own slug, directory and manifest.
  const viewports = typeof options.viewport === "string" ? parseViewportList(options.viewport) : [];
  if (viewports.length > 1) {
    if (durationMs === undefined && !options["until-element"] && !options["until-element-gone"] && !options["until-idle"]) {
      console.error("Error: --viewport with more than one size needs --duration or a stop trigger, so each run can end on its own");
      process.exit(1);
    }
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      console.log(`\n── viewport ${viewport.width}x${viewport.height} ──`);
      // Each viewport gets its OWN directory. Sharing one --out would let the
      // second run overwrite the first run's manifest.json and frames/ while
      // both GIFs survived - keeping the human artifact and destroying the AI
      // artifact, which inverts this feature's whole premise.
      await runOneCapture(
        browser, page, options,
        `${slugFor(options)}-${viewport.width}x${viewport.height}`,
        typeof options.out === "string"
          ? join(resolve(options.out), `${viewport.width}x${viewport.height}`)
          : undefined,
      );
    }
    return;
  }

  await runOneCapture(browser, page, options, slugFor(options));
}

/** The capture name, defaulted to a timestamp slug. */
function slugFor(options: Record<string, string | boolean>): string {
  return typeof options.name === "string" ? options.name : `capture-${uniqueStamp()}`;
}

/** Run exactly one capture to completion and report it. */
async function runOneCapture(
  browser: CBrowser,
  page: Awaited<ReturnType<CBrowser["getPage"]>>,
  options: Record<string, string | boolean>,
  slug: string,
  outDirOverride?: string,
): Promise<void> {
  const fps = options.fps !== undefined ? Number(options.fps) : undefined;
  const quality = options.quality !== undefined ? Number(options.quality) : undefined;
  const maxFrames = options["max-frames"] !== undefined ? Number(options["max-frames"]) : undefined;
  const durationMs = typeof options.duration === "string" ? parseDurationMs(options.duration) : undefined;
  const format = typeof options.format === "string" ? parseFormats(options.format) : undefined;
  const outDir = outDirOverride ?? (typeof options.out === "string" ? resolve(options.out) : undefined);

  const target = buildCaptureTarget(options);
  const triggers = buildCaptureTriggers(options);
  const engine = options.browser === "firefox" ? "firefox" : options.browser === "webkit" ? "webkit" : "chromium";
  // Output lives under paths.videosDir, session-scoped.
  //
  // videosDir over recordingsDir: `recordings/` is the legacy action-recording
  // store (`record save` writes *.json there, and status counts them), so
  // video artifacts in the same tree would be two features sharing a folder.
  // videosDir over screenshotsDir: screenshot retention deletes whole session
  // directories after an hour by default, which would silently delete the
  // user's GIF. The session segment is what stops concurrent captures from
  // colliding, the same isolation rule screenshots already use.
  const paths = getPaths();
  const session = new VideoCaptureSession(page, engine, join(paths.videosDir, paths.sessionId));

  await session.start({
    fps, durationMs, outDir, format, slug, target, quality, maxFrames,
    contactSheet: options["contact-sheet"] === true || typeof options["contact-sheet"] === "string",
    // Overlay the model's predicted-attention map on every frame. Opt-in: it
    // costs one attention pass per frame. DOM is read from the live page at
    // stop, so this is the full 20/80 model, not bottom-up contrast alone.
    ...(options["attention-overlay"]
      ? {
          saliencyOverlay: {
            ...(typeof options["overlay-persona"] === "string" ? { persona: options["overlay-persona"] } : {}),
            ...(typeof options["overlay-goal"] === "string" ? { goal: options["overlay-goal"] } : {}),
          },
        }
      : {}),
    ...triggers,
    // Element tracking resolves through the browser's existing nine-strategy
    // resolver rather than a second one living in the capture engine.
    resolveElement: (selector) => browser.resolveElementLocator(selector),
  });
  const status = session.status();

  mkdirSync(dirname(captureStatePath()), { recursive: true });
  const active: ActiveCapture = {
    pid: process.pid,
    slug: status.slug,
    outDir: status.outDir,
    url: typeof options.url === "string" ? options.url : undefined,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(captureStatePath(), JSON.stringify(active, null, 2));

  console.log(`🎥 Capturing ${status.captureMethod === "cdp-screencast" ? "via CDP screencast" : "via screenshot loop"}`);
  console.log(`  Output: ${status.outDir}`);
  if (triggers.startTrigger) {
    console.log(`  Waited for: ${triggers.startTrigger.kind === "lifecycle" ? triggers.startTrigger.event : triggers.startTrigger.selector}`);
  }
  if (target.kind === "region") {
    const r = target.rect;
    console.log(`  Region: ${r.width}x${r.height} at (${r.x}, ${r.y})`);
  } else if (target.kind === "element") {
    console.log(`  Element: ${target.selector}${target.padding ? ` +${target.padding}px padding` : ""}`);
  }
  if (durationMs) {
    console.log(`  Duration: ${durationMs}ms (auto-stops)`);
  } else {
    console.log(`  Stop with 'cbrowser capture stop' (or Ctrl-C in this terminal)`);
  }

  // A signal from `capture stop`, or an interactive Ctrl-C, finalises the same
  // way the duration timer does; stop() is idempotent so they cannot collide.
  let finished = false;
  const finish = async (): Promise<void> => {
    if (finished) return;
    finished = true;
    const result = await session.stop();

    if (existsSync(captureStatePath())) unlinkSync(captureStatePath());

    finishCaptureCommand(result);
  };

  process.on("SIGINT", () => { void finish().then(() => process.exit(process.exitCode ?? 0)); });
  process.on("SIGTERM", () => { void finish().then(() => process.exit(process.exitCode ?? 0)); });

  // Wait for whichever ends the capture first: the duration timer, a stop
  // trigger, an explicit `capture stop` signal, or the safety cap. Waiting on
  // the duration alone would sleep straight through a stop trigger.
  const capMs = 10 * 60_000;
  let hitCap = false;
  await Promise.race([
    session.finished,
    new Promise((r) => setTimeout(r, durationMs !== undefined ? durationMs + 500 : capMs))
      .then(() => { hitCap = durationMs === undefined; }),
  ]);
  if (hitCap) console.log(`\n⚠️  Reached the ${capMs / 60_000}-minute capture cap`);
  await finish();
}

/**
 * The one place a capture command ends.
 *
 * Printing the artifacts, reporting encoder failures and setting the exit code
 * were duplicated across the direct and daemon paths, and the duplicate drifted
 * immediately: the daemon path printed a "✗" and exited 0. Every capture path
 * funnels through here so "how a capture command ends" has a single definition.
 */
function finishCaptureCommand(result: {
  manifestPath: string;
  manifest: {
    frames: unknown[];
    duration_ms: number;
    actual_fps: number;
    target_fps: number;
    artifacts: Record<string, string>;
    frame_gaps?: { gap_ms: number }[];
    trigger_timeout?: boolean;
    start_trigger?: string | null;
    stop_trigger?: string | null;
  };
  encodeErrors: Record<string, string>;
}): void {
  const m = result.manifest;

  if (m.trigger_timeout) {
    console.error(`\n✗ Capture trigger timed out`);
  } else {
    console.log(`\n✓ Capture stopped`);
  }
  if (m.start_trigger) console.log(`  Start trigger: ${m.start_trigger}`);
  if (m.stop_trigger) console.log(`  Stop trigger: ${m.stop_trigger}`);

  console.log(`  Frames: ${m.frames.length} (${m.actual_fps.toFixed(1)} fps actual vs ${m.target_fps} requested)`);
  console.log(`  Duration: ${m.duration_ms}ms`);
  if (m.frame_gaps && m.frame_gaps.length > 0) {
    const worst = Math.max(...m.frame_gaps.map((g) => g.gap_ms));
    console.log(`  Frame gaps: ${m.frame_gaps.length} (largest ${Math.round(worst)}ms - the page was not repainting)`);
  }
  console.log(`  Manifest: ${result.manifestPath}`);
  for (const [fmt, rel] of Object.entries(m.artifacts)) {
    console.log(`  ${fmt.toUpperCase()}: ${join(dirname(result.manifestPath), rel)}`);
  }
  for (const [fmt, message] of Object.entries(result.encodeErrors)) {
    console.error(`  ✗ ${fmt}: ${message}`);
  }

  // A requested format that could not be encoded, or a trigger that never
  // fired, is a failed run even though the frames and manifest survive.
  if (Object.keys(result.encodeErrors).length > 0 || m.trigger_timeout) process.exitCode = 1;
}

/**
 * Fail a capture command with a message. Centralised for the same reason as
 * finishCaptureCommand: a "✗" printed with a zero exit is a lie a script
 * cannot detect.
 */
function failCaptureCommand(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/**
 * Start a capture inside the daemon and return immediately.
 *
 * The capture keeps running after this process exits, which is what lets a
 * later `cbrowser click` or `cbrowser fill` appear in the recording.
 */
async function runCaptureStartViaDaemon(
  url: string | undefined,
  options: Record<string, string | boolean>,
): Promise<void> {
  // The daemon's page size and device are fixed when it starts. These were
  // accepted here and dropped, so a capture "at 390x844" recorded at the
  // daemon's size and reported success (audit 2026-10-21).
  for (const flag of ["viewport", "device", "browser"] as const) {
    if (options[flag] !== undefined) {
      failCaptureCommand(`--${flag} cannot change a running daemon's browser. Restart it with: cbrowser daemon stop && cbrowser daemon start --${flag} <value>`);
    }
  }
  const target = buildCaptureTarget(options);
  const triggers = buildCaptureTriggers(options);
  const slug = slugFor(options);

  const response = await sendToDaemon("captureStart", {
    url,
    options: {
      fps: options.fps !== undefined ? Number(options.fps) : undefined,
      quality: options.quality !== undefined ? Number(options.quality) : undefined,
      maxFrames: options["max-frames"] !== undefined ? Number(options["max-frames"]) : undefined,
      format: typeof options.format === "string" ? parseFormats(options.format) : undefined,
      outDir: typeof options.out === "string" ? resolve(options.out) : undefined,
      contactSheet: options["contact-sheet"] === true,
      slug,
      target,
      // Plain strings, so the overlay crosses the HTTP boundary intact; the
      // daemon path used to drop it.
      ...(options["attention-overlay"]
        ? {
            saliencyOverlay: {
              ...(typeof options["overlay-persona"] === "string" ? { persona: options["overlay-persona"] } : {}),
              ...(typeof options["overlay-goal"] === "string" ? { goal: options["overlay-goal"] } : {}),
            },
          }
        : {}),
      ...triggers,
    },
  });

  if (!response.success) failCaptureCommand(response.error ?? "daemon refused the capture");

  const status = response.result as { slug: string; outDir: string; captureMethod: string };
  console.log(`🎥 Capturing in the daemon (${status.captureMethod})`);
  console.log(`  Name: ${status.slug}`);
  console.log(`  Output: ${status.outDir}`);
  console.log("");
  console.log("  The capture is live and this shell is free. Commands you run now drive");
  console.log("  the same page and appear in the recording:");
  console.log("    cbrowser navigate <url> / click <sel> / fill <sel> <value>");
  console.log("  Finish with: cbrowser capture stop");
}

/** Stop the daemon's capture and report it. */
async function runCaptureStopViaDaemon(): Promise<void> {
  const response = await sendToDaemon("captureStop", {});
  if (!response.success) failCaptureCommand(response.error ?? "daemon could not stop the capture");

  finishCaptureCommand(response.result as Parameters<typeof finishCaptureCommand>[0]);
}

/** Signal the running capture process and wait for its manifest to land. */
export async function runCaptureStop(): Promise<void> {
  // The daemon owns any open-ended capture, so ask it first.
  if (await isDaemonRunning()) {
    const status = await sendToDaemon("captureStatus", {});
    const state = (status.result as { state?: string } | undefined)?.state;
    if (status.success && state === "recording") {
      await runCaptureStopViaDaemon();
      return;
    }
  }

  const statePath = captureStatePath();
  if (!existsSync(statePath)) {
    console.error("No active capture. A capture is stopped from the process that started it.");
    process.exit(1);
  }

  const active: ActiveCapture = JSON.parse(readFileSync(statePath, "utf-8"));
  try {
    // SIGTERM rather than SIGINT: a capture launched into the background by a
    // non-interactive shell inherits SIGINT as ignored, so an interrupt never
    // reaches the handler and the capture dies without writing its manifest.
    process.kill(active.pid, "SIGTERM");
  } catch {
    console.error(`Capture process ${active.pid} is gone; clearing stale state.`);
    unlinkSync(statePath);
    process.exit(1);
  }

  const manifestPath = join(active.outDir, "manifest.json");
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (existsSync(manifestPath)) {
      console.log(`✓ Capture stopped: ${active.slug}`);
      console.log(`  Manifest: ${manifestPath}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  console.error(`Signalled process ${active.pid} but no manifest appeared at ${manifestPath} within 60s`);
  process.exit(1);
}

/** Report the active capture, or the most recent finished one. */
export async function runCaptureStatus(): Promise<void> {
  if (await isDaemonRunning()) {
    const response = await sendToDaemon("captureStatus", {});
    const status = response.result as {
      state?: string; slug?: string; frames?: number; elapsedMs?: number;
      outDir?: string; captureMethod?: string; manifestPath?: string;
    } | undefined;

    if (response.success && status && status.state === "recording") {
      console.log("🎥 Capture in progress (in the daemon)");
      console.log(`  Name: ${status.slug}`);
      console.log(`  Frames so far: ${status.frames}`);
      console.log(`  Elapsed: ${status.elapsedMs}ms`);
      console.log(`  Method: ${status.captureMethod}`);
      console.log(`  Output: ${status.outDir}`);
      console.log("  Stop with: cbrowser capture stop");
      return;
    }
    if (response.success && status && status.state === "stopped" && status.manifestPath) {
      console.log("No capture in progress. The daemon's most recent:");
      console.log(`  Name: ${status.slug}`);
      console.log(`  Frames: ${status.frames}`);
      console.log(`  Manifest: ${status.manifestPath}`);
      return;
    }
  }

  const statePath = captureStatePath();
  if (existsSync(statePath)) {
    const active: ActiveCapture = JSON.parse(readFileSync(statePath, "utf-8"));
    let alive = true;
    try { process.kill(active.pid, 0); } catch { alive = false; }

    if (alive) {
      const frames = existsSync(join(active.outDir, "frames"))
        ? readdirSync(join(active.outDir, "frames")).length
        : 0;
      console.log(`🎥 Capture in progress`);
      console.log(`  Name: ${active.slug}`);
      console.log(`  PID: ${active.pid}`);
      console.log(`  Started: ${active.startedAt}`);
      console.log(`  Frames so far: ${frames}`);
      console.log(`  Output: ${active.outDir}`);
      return;
    }
    console.log(`⚠️  Stale state file for a dead process (${active.pid}); last output: ${active.outDir}`);
    return;
  }

  const recordingsDir = getPaths().videosDir;
  if (!existsSync(recordingsDir)) {
    console.log("No captures yet");
    return;
  }
  // Captures live at videos/<session>/<slug>; earlier builds wrote
  // videos/<slug> and recordings/<slug>, so look one level either way.
  const candidates: string[] = [];
  for (const entry of readdirSync(recordingsDir)) {
    const entryPath = join(recordingsDir, entry);
    if (!statSync(entryPath).isDirectory()) continue;
    candidates.push(join(entryPath, "manifest.json"));
    for (const nested of readdirSync(entryPath)) {
      const nestedPath = join(entryPath, nested);
      if (statSync(nestedPath).isDirectory()) candidates.push(join(nestedPath, "manifest.json"));
    }
  }
  const manifests = candidates
    .filter((p) => existsSync(p))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  if (manifests.length === 0) {
    console.log("No captures yet");
    return;
  }

  const manifest = parseManifest(readFileSync(manifests[0], "utf-8"));
  console.log(`No capture in progress. Most recent:`);
  console.log(`  Name: ${manifest.slug}`);
  console.log(`  Started: ${manifest.started_at}`);
  console.log(`  Frames: ${manifest.frames.length} over ${manifest.duration_ms}ms (${manifest.actual_fps.toFixed(1)} fps)`);
  console.log(`  Capture: ${manifest.capture_method}`);

  // changeSignal() rather than the optional fields directly: it maps a v1
  // manifest's change_points onto keyFrames, which is exact rather than a
  // guess (v1 computed them at the 0.9 bar that v2 calls key_frames). Reading
  // the raw field would report "no key frames" for a file that has them.
  const signal = changeSignal(manifest);
  console.log(`  Key frames: ${signal.keyFrames.length}${signal.keyFrames.length > 0 ? ` (${signal.keyFrames.slice(0, 8).join(", ")}${signal.keyFrames.length > 8 ? ", ..." : ""})` : ""}`);
  console.log(
    `  Change points: ${signal.changePoints.length}` +
      (signal.saturated ? ` — saturated, use key frames instead` : ""),
  );
  console.log(`  Artifacts: ${Object.entries(manifest.artifacts).map(([k, v]) => `${k} -> ${v}`).join(", ") || "none"}`);
  console.log(`  Manifest: ${manifests[0]}`);
}


/**
 * Reject capture-namespace flags a wrapped run cannot honour.
 *
 * Deliberately narrower than the allowlists on `capture`/`evaluate`/`keyboard`:
 * `test-suite` and `cognitive-journey` have large, long-established flag sets
 * that I cannot enumerate with confidence, and a wrong allowlist would reject
 * flags that work today. So this rejects only what it can be sure about - any
 * unrecognised `--capture*` flag, plus the two spellings people actually
 * reached for before `--capture` existed.
 */
export function assertCaptureNamespaceFlags(command: string, options: Record<string, string | boolean>): void {
  const valid = new Set(["capture", "capture-fps", "capture-format", "capture-out"]);
  const wrong = Object.keys(options).filter((f) => f.startsWith("capture") && !valid.has(f));

  // `--record-video` is a real flag on `explore` (an older, separate feature
  // that saves a Playwright video). It is NOT a flag here, and silently
  // ignoring it is what let this whole class survive.
  const aliases = ["record", "record-video"].filter((f) => options[f] !== undefined);

  if (wrong.length === 0 && aliases.length === 0) return;

  for (const flag of wrong) {
    console.error(`Error: '${command}' does not support --${flag}`);
  }
  for (const flag of aliases) {
    console.error(`Error: '${command}' does not support --${flag}; use --capture`);
  }
  console.error(`  Capture flags: ${[...valid].map((f) => `--${f}`).join(" ")}`);
  process.exit(1);
}

/**
 * Build the `AutoCaptureSetting` for a wrapped run (test-suite, journey).
 *
 * Returns undefined when no capture flag was given, so a run that does not ask
 * for a recording behaves exactly as before.
 */
export function buildAutoCaptureSetting(
  options: Record<string, string | boolean>,
  defaultName: string,
): AutoCaptureSetting {
  const asked = options.capture === true || typeof options.capture === "string";
  const detailFlags = ["capture-fps", "capture-format", "capture-out"].filter(
    (f) => options[f] !== undefined,
  );

  if (!asked) {
    if (detailFlags.length > 0) {
      console.error(`Error: ${detailFlags.map((f) => `--${f}`).join(", ")} require --capture`);
      process.exit(1);
    }
    return undefined;
  }

  const fps = options["capture-fps"] !== undefined ? Number(options["capture-fps"]) : undefined;
  if (fps !== undefined && (!Number.isFinite(fps) || fps <= 0)) {
    console.error(`Error: --capture-fps must be a positive number (got "${String(options["capture-fps"])}")`);
    process.exit(1);
  }

  return {
    name: defaultName,
    fps,
    format: typeof options["capture-format"] === "string" ? parseFormats(options["capture-format"]) : undefined,
    outDir: typeof options["capture-out"] === "string" ? resolve(options["capture-out"]) : undefined,
  };
}

/** Report where a wrapped run's recording landed, or why it failed. */
export function reportAutoCapture(capture: AutoCaptureResult | undefined): void {
  if (!capture) return;

  if (capture.error) {
    console.error(`\n🎥 Capture failed: ${capture.error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n🎥 Capture: ${capture.frames} frames${capture.durationMs ? ` over ${capture.durationMs}ms` : ""}${capture.actualFps ? ` (${capture.actualFps.toFixed(1)} fps)` : ""}`);
  if (capture.manifestPath) console.log(`   Manifest: ${capture.manifestPath}`);
  for (const [fmt, rel] of Object.entries(capture.artifacts ?? {})) {
    console.log(`   ${fmt.toUpperCase()}: ${join(capture.outDir, rel)}`);
  }
}
