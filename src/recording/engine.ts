/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Frame-capture engine for screen recordings.
 *
 * Chromium capture goes through the CDP screencast (`Page.startScreencast`),
 * which is **event-driven, not clocked**: the browser emits a frame when the
 * page paints, so a static page emits nothing at all. Three consequences run
 * through this whole file:
 *
 * - The clock is wall time. Every frame is stamped at receipt, and playback
 *   delays are derived from those stamps. Nothing is ever synthesised to fill
 *   a quiet stretch; quiet stretches are recorded as `frame_gaps`.
 * - A recording always brackets its window with a directly-captured frame at
 *   the start and (when the stream has gone quiet) at the end, so a completely
 *   static page still produces a valid recording rather than an empty one.
 * - Frames stream to disk as they arrive. Nothing accumulates the full frame
 *   set in memory, so recording length is bounded by disk, not RAM.
 *
 * Screencast frames arrive full-viewport - CDP takes no clip parameter - so
 * the frames on disk are always the whole viewport. Cropping is a post-hoc
 * concern, which is what keeps a recording re-croppable after the fact.
 *
 * Firefox and WebKit have no screencast; they fall back to a screenshot loop.
 *
 * @since v18.70.0
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { CDPSession, ConsoleMessage, Locator, Page, Request } from "playwright";

import { buildContactSheet } from "./contact-sheet.js";
import { encodeGif, encodeMp4, encodeWebm, encodeWebp, MissingEncoderError } from "./encoders.js";
import { changeScore, detectChangePoints, frameSignature } from "./ssim.js";
import { clampRect, expandForPlayback, findFrameGaps } from "./timing.js";
import {
  CHANGE_SATURATION_RATIO,
  MANIFEST_VERSION,
  SSIM_THRESHOLDS,
  parseManifest,
  type CaptureMethod,
  type ConsoleEntry,
  type Engine,
  type Frame,
  type NetworkEntry,
  type RecordingManifest,
  type RecordingTarget,
  type Rect,
} from "./types.js";

/** Output formats the CLI can request. */
export type CaptureFormat = "gif" | "webp" | "mp4" | "webm";

/** Condition that delays the first frame. */
export type StartTrigger =
  | { kind: "lifecycle"; event: "load" | "domcontentloaded" | "networkidle" }
  | { kind: "element"; selector: string };

/** Condition that ends the capture. */
export type StopTrigger =
  | { kind: "element-appears"; selector: string }
  | { kind: "element-disappears"; selector: string }
  | { kind: "idle"; idleMs: number };

/** Default ceiling on how long any trigger may wait. */
export const DEFAULT_TRIGGER_TIMEOUT_MS = 30_000;

/** Human-readable trigger label for the manifest. */
function describeStartTrigger(trigger: StartTrigger, delayMs: number, waitedMs: number): string {
  const base = trigger.kind === "lifecycle" ? trigger.event : `element:${trigger.selector}`;
  const withDelay = delayMs > 0 ? `${base}+${delayMs}ms` : base;
  return `${withDelay} (waited ${Math.round(waitedMs)}ms)`;
}

/** Human-readable stop-reason label for the manifest. */
function describeStopTrigger(trigger: StopTrigger): string {
  switch (trigger.kind) {
    case "element-appears": return `element-appears:${trigger.selector}`;
    case "element-disappears": return `element-disappears:${trigger.selector}`;
    case "idle": return `idle:${trigger.idleMs}ms`;
  }
}

export interface VideoCaptureOptions {
  /** What to capture: the whole viewport, a fixed region, or a tracked element. */
  target?: RecordingTarget;
  /** Requested frames per second. Screencast frames above this rate are dropped. */
  fps?: number;
  /** Auto-stop after this many milliseconds. Omit for an open-ended recording. */
  durationMs?: number;
  /** Directory for frames, manifest and artifacts. Defaults to a slug dir under `baseDir`. */
  outDir?: string;
  /** Encoders to run at stop time. Defaults to `["gif"]`. */
  format?: CaptureFormat[];
  /** JPEG quality for captured frames (1-100, default 80). */
  quality?: number;
  /** Hard cap on retained frames; protects the disk on a long open-ended run. */
  maxFrames?: number;
  /** Recording name. Defaults to a timestamp slug. */
  slug?: string;
  /** Also write a contact sheet: one JPEG summarising the whole capture. */
  contactSheet?: boolean | { columns?: number; maxFrames?: number };
  /**
   * Paint the visual-contrast (saliency) map over every frame before encoding.
   *
   * Opt-in because it costs one saliency pass per frame (~0.5-1s each), so a
   * 50-frame capture adds 30-60s. The result is a CONTRAST map, not a gaze
   * prediction — see `saliency-overlay.ts` for why that distinction is load-bearing.
   */
  saliencyOverlay?: boolean | {
    opacity?: number;
    floor?: number;
    cellSize?: number;
    /** Persona whose priorities weight the semantic half of the blend. */
    persona?: string;
    /** Goal string weighting goal-relevance in the semantic half. */
    goal?: string;
    /** Whether the caller may spend paid model calls on judging and summary. */
    entitled?: boolean;
  };
  /** Delay the first frame until this condition holds. */
  startTrigger?: StartTrigger;
  /** Extra delay after the start trigger fires, in milliseconds. */
  startDelayMs?: number;
  /** Stop capture when this condition holds. */
  stopTrigger?: StopTrigger;
  /** How long a trigger may wait before giving up (default 30s). */
  triggerTimeoutMs?: number;
  /**
   * Resolves a selector to a Locator for element targets. Supplied by the
   * caller so the engine reuses the browser's existing nine-strategy resolver
   * (including its self-healing cache) rather than owning a second one.
   */
  resolveElement?: (selector: string) => Promise<Locator | null>;
}

export interface VideoCaptureStatus {
  state: "idle" | "recording" | "stopped";
  slug: string;
  outDir: string;
  /** Frames retained so far. */
  frames: number;
  /** Milliseconds since capture started (frozen once stopped). */
  elapsedMs: number;
  captureMethod: CaptureMethod;
  /** Present once stopped. */
  manifestPath?: string;
}

export interface VideoCaptureResult {
  manifestPath: string;
  manifest: RecordingManifest;
  /** Encoders that failed, by format. Encoding failure never loses the frames. */
  encodeErrors: Record<string, string>;
}

const DEFAULT_FPS = 10;
const DEFAULT_QUALITY = 80;
const DEFAULT_MAX_FRAMES = 3000;

/** How often to check whether the page scrolled far enough to re-read the DOM. */
const SCROLL_SNAPSHOT_INTERVAL_MS = 200;
/** Scroll distance that changes the viewport enough to warrant a fresh snapshot. */
const SCROLL_SNAPSHOT_THRESHOLD_PX = 200;

/*
 * The change thresholds and the saturation ratio live in types.ts, next to the
 * schema that documents them, and are imported rather than restated here.
 * Two copies of a number that must agree is how they stop agreeing.
 *
 * Two tiers, because one threshold cannot answer both questions a reader asks:
 *   SSIM_THRESHOLDS.key    (0.9)   -> key_frames:    "something notable happened"
 *   SSIM_THRESHOLDS.change (0.999) -> change_points: "anything changed at all"
 *
 * 0.9 alone was blind to the events this feature exists to record (a form fill
 * on a 1280x800 page scores ~0.998); 0.999 alone saturates on an animating page
 * (measured 31 of 32 frames), and a filter that matches everything looks
 * identical to one that works.
 */

/*
 * There is no separate idle threshold. --until-idle uses changeScore against
 * SSIM_THRESHOLDS.change, the same comparator and bar the manifest's
 * change_points use (D-7: one definition of "the page changed"). Consequence,
 * and it is correct: a page with a ticking clock or ticker never goes idle,
 * because it IS changing every frame - which is exactly what --timeout is the
 * backstop for (ISC-45). The capture help says so.
 */

/**
 * Slack allowed when matching a paint event to its slot on the frame grid.
 * Paint events land a few milliseconds either side of the nominal boundary;
 * without this, every near-miss is deferred to the next slot and the effective
 * rate drifts below the target.
 */
const FRAME_DUE_TOLERANCE_MS = 8;

/**
 * How far past the last frame the recording may end before `stop()` captures a
 * closing frame, as a fraction of the frame interval.
 */
const CLOSING_FRAME_THRESHOLD = 0.8;

/**
 * Strip the query string and fragment from a URL before it enters the manifest.
 *
 * The manifest is designed to be handed to AI models and shared around, and a
 * query string routinely carries auth tokens, session ids and API keys. Only
 * origin+pathname is kept - enough to say WHICH endpoint fired when, without
 * the secret riding along. Full-fidelity network capture is HAR's job (cbrowser
 * already has HAR), which carries the sensitive-handling expectations the
 * manifest deliberately should not inherit.
 *
 * A URL that will not parse (data:, blob:, malformed) is truncated at the first
 * `?` or `#` as a fail-safe rather than dropped, so an odd scheme still cannot
 * smuggle a query through.
 */
function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return u.origin && u.origin !== "null" ? `${u.origin}${u.pathname}` : `${u.protocol}${u.pathname}`;
  } catch {
    return raw.split(/[?#]/, 1)[0];
  }
}

interface PendingFrame {
  index: number;
  tMs: number;
  path: string;
  crop: Rect;
  tracking: "ok" | "stale" | null;
}

/** A stalled probe costs at most this before the loop retries. */
const PROBE_BUDGET_FLOOR_MS = 500;

/**
 * Poll `holds` until it returns true or `timeoutMs` elapses.
 *
 * Each probe is bounded by the REMAINING time, and that is the whole point.
 * This loop used to read:
 *
 *   while (Date.now() < deadline) {
 *     if (await holds().catch(() => false)) return true;
 *     await new Promise((r) => setTimeout(r, intervalMs));
 *   }
 *
 * which checks the deadline only BETWEEN iterations. `holds` queries the page
 * over CDP, so a single probe that never settles skips every further deadline
 * check and the timeout is bypassed completely — the function advertises a
 * bound it cannot enforce.
 *
 * Measured 2026-08-14: running tests/recording-engine.test.ts alongside
 * tests/recording-change-tiers.test.ts hung five tests at exactly 60000.94ms,
 * one of them literally named "a start trigger that never fires reports the
 * timeout instead of hanging". Each ran alone without incident (45 pass and 12
 * pass), because an uncontended CDP probe always returns. The bug needed a slow
 * page query to become visible, which is why it read as flakiness for weeks and
 * survived twelve refuted hypotheses.
 *
 * Exported so it can be tested without a browser: the failure mode is "a probe
 * that never settles", which is trivial to construct directly and near
 * impossible to stage reliably through a real page.
 */
export async function pollUntil(
  holds: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    // Each probe gets its OWN budget, not the whole remaining window.
    //
    // Bounding by the remaining time was the first fix and it was not enough:
    // one hung probe then swallowed the entire budget, so a condition that
    // became true a moment later was never seen. A stalled CDP query should
    // cost one probe, not the whole wait. The floor keeps a merely-slow page
    // from being abandoned every round.
    const remaining = deadline - Date.now();
    const probeBudget = Math.min(remaining, Math.max(intervalMs, PROBE_BUDGET_FLOOR_MS));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bound = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), probeBudget);
    });
    try {
      // NOT unref'd: this timer is the only thing enforcing the bound, so it
      // must be able to wake the loop. It is always cleared below, and its
      // lifetime is capped by the caller's deadline.
      //
      // An abandoned probe may still settle later; its result is ignored.
      // Polling is idempotent by construction, so that is safe.
      if (await Promise.race([holds().catch(() => false), bound])) return true;
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (Date.now() >= deadline) break;
    await new Promise((r) => setTimeout(r, Math.min(intervalMs, deadline - Date.now())));
  }
  return false;
}

/**
 * One recording run. Not reusable: `start()` may be called once, and `stop()`
 * is idempotent, returning the same result on every subsequent call.
 */
export class VideoCaptureSession {
  private opts!: Required<Omit<VideoCaptureOptions, "target" | "durationMs" | "outDir" | "slug" | "resolveElement" | "startTrigger" | "startDelayMs" | "stopTrigger">> &
    Pick<VideoCaptureOptions, "durationMs">;
  private startTrigger?: StartTrigger;
  private startDelayMs = 0;
  private stopTrigger?: StopTrigger;
  private target: RecordingTarget = { kind: "viewport" };
  private slug = "";
  private outDir = "";
  private framesDir = "";

  private state: "idle" | "recording" | "stopped" = "idle";
  private captureMethod: CaptureMethod = "cdp-screencast";
  private cdp: CDPSession | null = null;
  private loopTimer: NodeJS.Timeout | null = null;
  private durationTimer: NodeJS.Timeout | null = null;
  private stopping: Promise<VideoCaptureResult> | null = null;

  private startWallMs = 0;
  private startedAtIso = "";
  private stopWallMs = 0;
  private frames: PendingFrame[] = [];
  /**
   * DOM as it stood at a point in time, captured on navigation.
   *
   * Reading the DOM once at stop and stamping it across every frame is wrong the
   * moment a capture navigates: frame 0 on the pricing page was being judged
   * against the post-click verification screen, which made every judged moment
   * identical and let the summary confabulate a UX finding out of a tool
   * artifact. One extract per navigation is cheap; per frame would be a
   * page.evaluate on every screencast tick.
   */
  private domSnapshots: Array<{ atMs: number; scrollY: number; elements: unknown[] }> = [];
  /**
   * Scroll position over time, sampled cheaply.
   *
   * Element rects come from getBoundingClientRect, which is VIEWPORT-relative at
   * the instant of extraction. Between snapshots the page keeps scrolling, so a
   * rect captured before a scroll describes a position the element has since
   * left — the heat lands below where the element now is, by exactly the drift.
   * Storing scroll per sample lets the renderer correct each frame back to what
   * was actually on screen.
   */
  private scrollTrack: Array<{ atMs: number; scrollY: number }> = [];
  /**
   * Real interactions, captured from the page rather than inferred.
   *
   * The capture summary previously read the gap between two scripted tool calls
   * as a user deliberating, and recommended a design change to fix the stall it
   * had invented. Gagging the prompt stops the bad sentence; recording what
   * actually happened is what makes the good one possible — and it is the same
   * data needed to draw a ring where a click landed.
   */
  private interactions: Array<{
    atMs: number; type: string; x: number; y: number; label: string;
  }> = [];
  private navListener?: () => void;
  private scrollTimer?: ReturnType<typeof setInterval>;
  private nextDueMs = 0;
  private writeQueue: Promise<unknown> = Promise.resolve();

  private consoleEvents: ConsoleEntry[] = [];
  private networkEvents: NetworkEntry[] = [];
  private consoleListener: ((msg: ConsoleMessage) => void) | null = null;
  private requestListener: ((req: Request) => void) | null = null;

  private viewport = { width: 0, height: 0, deviceScaleFactor: 1 };
  private regionClamped = false;
  private outputDims = { width: 0, height: 0 };
  /**
   * Output dimensions as whole pixels.
   *
   * NOT rounded to even: the GIF/WebP encoders now emit exactly these numbers,
   * so a 393px-wide viewport produces a 393px artifact. Only the video path
   * rounds up to even internally (yuv420p needs it), which is the one place a
   * single pixel of difference is unavoidable.
   */
  private static outputDim(value: number): number {
    return Math.max(1, Math.round(value));
  }

  /** Crop applied to frames captured right now; re-derived per frame for element targets. */
  private currentCrop: Rect | null = null;
  /** Whether `currentCrop` still reflects a live element measurement. */
  private currentTracking: "ok" | "stale" | null = null;
  private elementLocator: Locator | null = null;
  private trackTimer: NodeJS.Timeout | null = null;

  private startTriggerLabel: string | null = null;
  private stopTriggerLabel: string | null = null;
  private triggerTimedOut = false;
  private stopTriggerTimer: NodeJS.Timeout | null = null;
  private stopTimeoutTimer: NodeJS.Timeout | null = null;
  /** Rolling SSIM state for the idle stop trigger. */
  private idleSignature: Float32Array | null = null;
  private lastChangeMs = 0;
  private idleScanQueue: Promise<unknown> = Promise.resolve();
  private result: VideoCaptureResult | null = null;
  private finishedResolve!: (result: VideoCaptureResult) => void;
  /**
   * Resolves when the capture has stopped from ANY source - explicit stop(),
   * the duration timer, or a stop trigger. Callers that started an open-ended
   * capture await this instead of assuming they are the ones who will end it.
   */
  readonly finished: Promise<VideoCaptureResult> = new Promise((resolve) => {
    this.finishedResolve = resolve;
  });

  /**
   * @param page  Page to record. Must already be navigated - the engine never
   *              navigates, so the caller controls what is on screen at t=0.
   * @param engine Browser family, which decides the capture method.
   * @param baseDir Directory recordings are created under when no `outDir` is given.
   */
  constructor(
    private page: Page,
    private engine: Engine,
    private baseDir: string,
  ) {}

  // =======================================================================
  // Lifecycle
  // =======================================================================

  async start(options: VideoCaptureOptions = {}): Promise<VideoCaptureStatus> {
    if (this.state !== "idle") {
      throw new Error(`Recording already ${this.state}; construct a new VideoCaptureSession per run`);
    }

    const fps = options.fps ?? DEFAULT_FPS;
    if (!Number.isFinite(fps) || fps <= 0) {
      throw new Error(`Invalid fps ${options.fps} - must be a positive number`);
    }

    this.opts = {
      fps,
      durationMs: options.durationMs,
      format: options.format ?? ["gif"],
      quality: options.quality ?? DEFAULT_QUALITY,
      maxFrames: options.maxFrames ?? DEFAULT_MAX_FRAMES,
      contactSheet: options.contactSheet ?? false,
      saliencyOverlay: options.saliencyOverlay ?? false,
      triggerTimeoutMs: options.triggerTimeoutMs ?? DEFAULT_TRIGGER_TIMEOUT_MS,
    };
    this.startTrigger = options.startTrigger;
    this.startDelayMs = options.startDelayMs ?? 0;
    this.stopTrigger = options.stopTrigger;
    this.target = options.target ?? { kind: "viewport" };
    this.slug = options.slug ?? `recording-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    this.outDir = options.outDir ?? join(this.baseDir, this.slug);
    this.framesDir = join(this.outDir, "frames");
    mkdirSync(this.framesDir, { recursive: true });

    const vp = this.page.viewportSize() ?? { width: 1280, height: 800 };
    const scale = await this.page
      .evaluate(() => window.devicePixelRatio)
      .catch(() => 1);
    this.viewport = { width: vp.width, height: vp.height, deviceScaleFactor: scale || 1 };

    await this.setUpTarget(options);

    // The start trigger is awaited BEFORE the clock starts, so t=0 is the
    // moment the user asked to start from, not the moment the process launched.
    if (this.startTrigger || this.startDelayMs > 0) {
      const fired = await this.awaitStartTrigger(options);
      if (!fired) {
        // The condition never happened, so there is nothing the caller asked
        // for to record. Write an honest empty manifest rather than capturing
        // an arbitrary window and presenting it as the requested one.
        this.state = "recording";
        this.startWallMs = Date.now();
        this.startedAtIso = new Date(this.startWallMs).toISOString();
        this.triggerTimedOut = true;
        this.stopTriggerLabel = "start-trigger-timeout";
        await this.stop();
        return this.status();
      }
    }

    // Awaited: the interaction binding must exist before the first frame, or a
    // click in the opening moments is silently unrecorded.
    await this.attachPageListeners();

    this.startWallMs = Date.now();
    this.startedAtIso = new Date(this.startWallMs).toISOString();
    this.state = "recording";

    if (this.engine === "chromium") {
      await this.startScreencast();
    } else {
      this.captureMethod = "screenshot-loop";
      this.startScreenshotLoop();
    }

    // Bracket the window: a page that never paints again still has a frame at
    // t=0, and `stop()` adds the closing frame.
    await this.captureDirectFrame();

    if (this.stopTrigger) this.startStopTriggerWatch(options);

    if (this.opts.durationMs !== undefined) {
      this.durationTimer = setTimeout(() => {
        if (!this.stopTriggerLabel) this.stopTriggerLabel = "duration";
        void this.stop().catch(() => { /* surfaced to whoever awaits stop() */ });
      }, this.opts.durationMs);
      // Do not hold the event loop open on behalf of the auto-stop timer.
      this.durationTimer.unref?.();
    }

    return this.status();
  }

  /**
   * Stop capture, score the frames, write the manifest, run the encoders.
   *
   * Idempotent: concurrent and repeated calls all resolve to the same result,
   * so an auto-stop racing an explicit stop cannot double-encode.
   */
  async stop(): Promise<VideoCaptureResult> {
    if (this.stopping) return this.stopping;
    // An explicit stop wins over any pending trigger: whichever call arrives
    // first labels the recording, and the rest collapse onto its result.
    if (this.state === "recording" && !this.stopTriggerLabel) this.stopTriggerLabel = "manual";
    if (this.state === "idle") {
      throw new Error("Recording was never started");
    }
    this.stopping = this.doStop();
    return this.stopping;
  }

  status(): VideoCaptureStatus {
    return {
      state: this.state,
      slug: this.slug,
      outDir: this.outDir,
      frames: this.frames.length,
      elapsedMs: this.state === "stopped" ? this.stopWallMs - this.startWallMs
        : this.state === "recording" ? Date.now() - this.startWallMs
        : 0,
      captureMethod: this.captureMethod,
      ...(this.result ? { manifestPath: this.result.manifestPath } : {}),
    };
  }

  /**
   * Resolve the capture target into a crop rect and a locked output size.
   *
   * Output dimensions are fixed here, for the whole capture, because animated
   * GIF/WebP and every video container require a constant frame size. An
   * element that grows or shrinks is re-fitted into these locked dimensions
   * rather than changing them mid-stream.
   */
  private async setUpTarget(options: VideoCaptureOptions): Promise<void> {
    switch (this.target.kind) {
      case "viewport": {
        this.currentCrop = null;
        this.outputDims = {
          width: VideoCaptureSession.outputDim(this.viewport.width),
          height: VideoCaptureSession.outputDim(this.viewport.height),
        };
        return;
      }

      case "region": {
        // Overflow is trimmed, not rejected: "capture roughly there" is a
        // reasonable ask, and the manifest reports the trim via region_clamped.
        const { rect, clamped } = clampRect(this.target.rect, this.viewport);
        this.target = { kind: "region", rect };
        this.regionClamped = clamped;
        this.currentCrop = rect;
        this.outputDims = {
          width: VideoCaptureSession.outputDim(rect.width),
          height: VideoCaptureSession.outputDim(rect.height),
        };
        return;
      }

      case "element": {
        const { selector, padding } = this.target;
        if (!options.resolveElement) {
          throw new Error(
            `Cannot capture element "${selector}": no element resolver was supplied to the capture session`,
          );
        }

        this.elementLocator = await options.resolveElement(selector);
        if (!this.elementLocator) {
          throw new Error(`Cannot capture element "${selector}": no element matched that selector`);
        }

        const rect = await this.measureElement();
        if (!rect) {
          throw new Error(
            `Cannot capture element "${selector}": it resolved but has no visible box (display:none, zero size, or fully off-screen)`,
          );
        }

        this.currentCrop = rect;
        this.currentTracking = "ok";
        this.outputDims = {
          width: VideoCaptureSession.outputDim(rect.width),
          height: VideoCaptureSession.outputDim(rect.height),
        };
        this.startElementTracking();
        return;
      }
    }
  }

  /**
   * Measure the tracked element, padded and clamped into the viewport.
   * Returns null when the element has no usable box right now.
   */
  private async measureElement(): Promise<Rect | null> {
    if (!this.elementLocator || this.target.kind !== "element") return null;
    const padding = this.target.padding;

    try {
      const box = await this.elementLocator.boundingBox({ timeout: 1000 });
      if (!box || box.width <= 0 || box.height <= 0) return null;

      const padded = {
        x: box.x - padding,
        y: box.y - padding,
        width: box.width + padding * 2,
        height: box.height + padding * 2,
      };
      // clampRect throws when the padded box has left the viewport entirely,
      // which is a tracking outcome rather than a capture failure.
      return clampRect(padded, this.viewport).rect;
    } catch {
      return null;
    }
  }

  /**
   * Re-measure the tracked element on the frame cadence so `crop` follows it as
   * it moves. Polling rather than measuring inside the screencast handler: that
   * handler must stay synchronous to ack frames promptly, and an await there
   * would stall the stream.
   */
  private startElementTracking(): void {
    const intervalMs = 1000 / this.opts.fps;
    let inFlight = false;

    this.trackTimer = setInterval(() => {
      if (this.state !== "recording" || inFlight) return;
      inFlight = true;
      void this.measureElement()
        .then((rect) => {
          if (rect) {
            this.currentCrop = rect;
            this.currentTracking = "ok";
          } else {
            // Element detached, hidden or scrolled away: keep capturing with
            // the last known rect and mark the frames stale, so the recording
            // shows what happened instead of ending.
            this.currentTracking = "stale";
          }
        })
        .catch(() => { this.currentTracking = "stale"; })
        .finally(() => { inFlight = false; });
    }, intervalMs);
    this.trackTimer.unref?.();
  }


  // =======================================================================
  // Triggers
  // =======================================================================

  /**
   * Wait for the start trigger, then the start delay.
   *
   * Returns false when the trigger timed out. Timing out is a reportable
   * outcome, not an exception: the caller still gets a manifest saying which
   * trigger was asked for and that it never fired.
   */
  private async awaitStartTrigger(options: VideoCaptureOptions): Promise<boolean> {
    const began = Date.now();
    const trigger = this.startTrigger;

    if (trigger) {
      const fired = await this.waitForCondition(
        () => this.startConditionHolds(trigger, options),
        this.opts.triggerTimeoutMs,
      );
      if (!fired) {
        this.startTriggerLabel = `${
          trigger.kind === "lifecycle" ? trigger.event : `element:${trigger.selector}`
        } (timed out after ${this.opts.triggerTimeoutMs}ms)`;
        return false;
      }
    }

    if (this.startDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.startDelayMs));
    }

    this.startTriggerLabel = trigger
      ? describeStartTrigger(trigger, this.startDelayMs, Date.now() - began)
      : `delay:${this.startDelayMs}ms`;
    return true;
  }

  /** Whether the start condition currently holds. */
  private async startConditionHolds(trigger: StartTrigger, options: VideoCaptureOptions): Promise<boolean> {
    if (trigger.kind === "lifecycle") {
      try {
        // Already-fired lifecycle events resolve immediately; the short timeout
        // keeps this a poll rather than a second, competing wait.
        await this.page.waitForLoadState(trigger.event, { timeout: 500 });
        return true;
      } catch {
        return false;
      }
    }

    const locator = options.resolveElement
      ? await options.resolveElement(trigger.selector).catch(() => null)
      : this.page.locator(trigger.selector).first();
    if (!locator) return false;

    // Present AND visible: an element in the DOM but not painted is not
    // something a viewer would call "there yet".
    return locator.isVisible({ timeout: 500 }).catch(() => false);
  }

  /** Poll a condition until it holds or the budget runs out. */
  private async waitForCondition(
    holds: () => Promise<boolean>,
    timeoutMs: number,
  ): Promise<boolean> {
    const intervalMs = Math.min(100, Math.max(20, 1000 / this.opts.fps));
    return pollUntil(holds, timeoutMs, intervalMs);
  }

  /**
   * Watch for the stop condition, and enforce the trigger timeout.
   *
   * A stop trigger that never fires must not hang the capture: the timeout
   * stops it anyway and flags `trigger_timeout`, keeping every frame captured
   * up to that point.
   */
  private startStopTriggerWatch(options: VideoCaptureOptions): void {
    const trigger = this.stopTrigger;
    if (!trigger) return;

    if (trigger.kind === "idle") {
      this.lastChangeMs = Date.now();
      this.watchIdle(trigger.idleMs);
    } else {
      const intervalMs = 1000 / this.opts.fps;
      let inFlight = false;

      this.stopTriggerTimer = setInterval(() => {
        if (this.state !== "recording" || inFlight) return;
        inFlight = true;
        void this.stopConditionHolds(trigger, options)
          .then((fired) => {
            if (fired && this.state === "recording") {
              this.stopTriggerLabel = describeStopTrigger(trigger);
              void this.stop().catch(() => { /* awaited elsewhere */ });
            }
          })
          .catch(() => { /* a failed probe is retried on the next tick */ })
          .finally(() => { inFlight = false; });
      }, intervalMs);
      this.stopTriggerTimer.unref?.();
    }

    this.stopTimeoutTimer = setTimeout(() => {
      if (this.state !== "recording") return;
      this.triggerTimedOut = true;
      this.stopTriggerLabel = `${describeStopTrigger(trigger)} (timed out after ${this.opts.triggerTimeoutMs}ms)`;
      void this.stop().catch(() => { /* awaited elsewhere */ });
    }, this.opts.triggerTimeoutMs);
    this.stopTimeoutTimer.unref?.();
  }

  /** Whether an element-based stop condition currently holds. */
  private async stopConditionHolds(trigger: StopTrigger, options: VideoCaptureOptions): Promise<boolean> {
    if (trigger.kind === "idle") return false;

    const selector = trigger.selector;
    const locator = options.resolveElement
      ? await options.resolveElement(selector).catch(() => null)
      : this.page.locator(selector).first();

    if (!locator) return trigger.kind === "element-disappears";

    const visible = await locator.isVisible({ timeout: 500 }).catch(() => false);
    return trigger.kind === "element-appears" ? visible : !visible;
  }

  /**
   * Stop once no frame has changed for `idleMs`.
   *
   * Reuses the same SSIM comparator and threshold that produce `change_points`,
   * so "changed" means exactly the same thing live as it does in the manifest.
   */
  private watchIdle(idleMs: number): void {
    let lastScanned = -1;

    this.stopTriggerTimer = setInterval(() => {
      if (this.state !== "recording") return;

      const latest = this.frames.length - 1;
      if (latest > lastScanned) {
        const frame = this.frames[latest]!;
        lastScanned = latest;
        // Signatures are queued so scanning never overlaps itself and never
        // blocks the screencast handler.
        this.idleScanQueue = this.idleScanQueue
          .then(() => this.writeQueue)
          .then(() => frameSignature(frame.path))
          .then((signature) => {
            // D-7: ONE definition of "the page changed". Idle reuses the same
            // changeScore comparator and the same change threshold the manifest
            // reports, so "changed" means the same thing live and on disk.
            if (this.idleSignature && changeScore(this.idleSignature, signature) < SSIM_THRESHOLDS.change) {
              this.lastChangeMs = Date.now();
            }
            this.idleSignature = signature;
          })
          .catch(() => { /* an unreadable frame is not evidence of stillness */ });
      }

      if (Date.now() - this.lastChangeMs >= idleMs) {
        this.stopTriggerLabel = `idle:${idleMs}ms`;
        void this.stop().catch(() => { /* awaited elsewhere */ });
      }
    }, Math.min(100, 1000 / this.opts.fps));
    this.stopTriggerTimer.unref?.();
  }

  // =======================================================================
  // Capture
  // =======================================================================

  private async startScreencast(): Promise<void> {
    this.cdp = await this.page.context().newCDPSession(this.page);

    this.cdp.on("Page.screencastFrame", (event: { data: string; sessionId: number; metadata?: { deviceWidth?: number; deviceHeight?: number } }) => {
      const tMs = Date.now() - this.startWallMs;

      // The ack must go out for every frame regardless of whether the frame is
      // kept - Chromium stops emitting until the outstanding frame is acked.
      this.cdp?.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => {
        /* session detached mid-flight; nothing left to ack */
      });

      if (this.state !== "recording") return;
      if (!this.shouldKeep(tMs)) return;
      this.enqueueFrame(tMs, Buffer.from(event.data, "base64"));
    });

    await this.cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: this.opts.quality,
      everyNthFrame: 1,
    });
  }

  /** Firefox/WebKit fallback: poll `page.screenshot` at the target rate. */
  private startScreenshotLoop(): void {
    const intervalMs = 1000 / this.opts.fps;
    let inFlight = false;

    this.loopTimer = setInterval(() => {
      if (this.state !== "recording" || inFlight) return;
      inFlight = true;
      void this.captureDirectFrame()
        .catch(() => { /* a dropped poll is a gap, not a failure */ })
        .finally(() => { inFlight = false; });
    }, intervalMs);
    this.loopTimer.unref?.();
  }

  /**
   * Capture one frame directly through Playwright rather than the screencast.
   * Used to bracket the recording and to drive the non-Chromium fallback.
   */
  private async captureDirectFrame(): Promise<void> {
    try {
      const buffer = await this.page.screenshot({ type: "jpeg", quality: this.opts.quality });
      // Stamped on completion, not on entry: a screencast frame can land while
      // the screenshot is in flight, and an entry-time stamp would order this
      // frame behind a frame that was captured after it.
      this.enqueueFrame(Date.now() - this.startWallMs, buffer);
    } catch {
      // Page closed or navigating: no frame is better than a fabricated one.
    }
  }

  /**
   * Rate-limit screencast frames to the requested fps.
   *
   * Frames are matched against a fixed grid of due times rather than against
   * "time since the last kept frame". A since-last rule compounds every paint
   * event's jitter into the next interval and drifts the achieved rate away
   * from the target; the grid holds the average at exactly `fps`.
   */
  private shouldKeep(tMs: number): boolean {
    if (this.frames.length >= this.opts.maxFrames) return false;
    if (tMs + FRAME_DUE_TOLERANCE_MS < this.nextDueMs) return false;

    const interval = 1000 / this.opts.fps;
    this.nextDueMs += interval;
    // A stall longer than one interval must not bank credit for a burst of
    // frames once painting resumes; re-base the grid on the current time.
    if (this.nextDueMs < tMs) this.nextDueMs = tMs + interval;
    return true;
  }

  /**
   * Record a frame and stream its bytes to disk.
   *
   * The index and timestamp are assigned synchronously so frame ordering
   * follows arrival order; only the write is deferred, serialised through a
   * queue so a slow disk cannot reorder frames or unbound memory.
   */
  private enqueueFrame(rawTMs: number, buffer: Buffer): void {
    // Absolute cap, checked here rather than only in shouldKeep, because the
    // bracket frames captured directly at start and stop bypass shouldKeep -
    // and a --max-frames 5 that delivers 6 is a documented number the tool
    // does not honour.
    if (this.frames.length >= this.opts.maxFrames) return;

    const index = this.frames.length;
    // The manifest contract requires non-decreasing timestamps. Timestamps are
    // assigned at capture completion so they already arrive in order; this
    // floor is the backstop that keeps a clock adjustment or an unforeseen
    // interleaving from producing an unparseable manifest.
    const previous = this.frames[index - 1];
    const tMs = previous ? Math.max(rawTMs, previous.tMs) : Math.max(0, rawTMs);
    const name = `${String(index).padStart(4, "0")}.jpg`;
    const path = join(this.framesDir, name);

    this.frames.push({
      index,
      tMs,
      path,
      // Snapshotted, not referenced: currentCrop is re-measured on the tracking
      // timer, and a shared reference would rewrite every earlier frame's crop.
      crop: this.currentCrop
        ? { ...this.currentCrop }
        : { x: 0, y: 0, width: this.viewport.width, height: this.viewport.height },
      tracking: this.currentTracking,
    });

    this.writeQueue = this.writeQueue.then(() => {
      writeFileSync(path, buffer);
    }).catch(() => { /* reported via the frame-count mismatch check at stop */ });
  }

  private async attachPageListeners(): Promise<void> {
    this.consoleListener = (msg: ConsoleMessage) => {
      if (this.state !== "recording") return;
      this.consoleEvents.push({
        t_ms: Math.max(0, Date.now() - this.startWallMs),
        type: msg.type(),
        text: msg.text(),
      });
    };

    this.requestListener = (req: Request) => {
      if (this.state !== "recording") return;
      this.networkEvents.push({
        t_ms: Math.max(0, Date.now() - this.startWallMs),
        url: redactUrl(req.url()),
        method: req.method(),
      });
    };

    this.page.on("console", this.consoleListener);
    this.page.on("request", this.requestListener);

    // Snapshot the DOM now and again whenever the page navigates, so a judged
    // frame is scored against the page as it was AT THAT MOMENT.
    const snapshot = async (): Promise<void> => {
      try {
        const { extractPageElementsForAttention } = await import("../visual/attention-quality.js");
        const elements = await extractPageElementsForAttention(this.page);
        const scrollY = await this.page.evaluate(() => window.scrollY).catch(() => 0);
        this.domSnapshots.push({ atMs: Date.now() - this.startWallMs, scrollY, elements });
      } catch { /* a missing snapshot degrades that frame, never the recording */ }
    };
    void snapshot();
    this.navListener = () => { void snapshot(); };
    this.page.on("framenavigated", this.navListener);

    // Scroll changes what is on screen just as much as navigation does, and
    // extractPageElementsForAttention filters to the viewport — so a snapshot
    // taken before a 700px scroll describes elements that are no longer visible
    // and carries stale coordinates for the ones that are. Without this, a
    // time-series capture returns the same judgement at every scroll position,
    // which is to say it measures nothing a single static call did not.
    //
    // Polled rather than event-driven: scroll fires far too often to snapshot
    // on, and a threshold poll costs one cheap evaluate per interval.
    // Interactions are reported to Node the INSTANT they happen, and the
    // listener re-arms on every navigation.
    //
    // The first version buffered events in a page global and drained them on the
    // 200ms poll. That loses precisely the events worth having: a click that
    // navigates destroys the buffer before the next drain, and the listener
    // itself dies with the document, so nothing after the first navigation was
    // ever recorded. Nothing showed up at all.
    //
    // exposeFunction costs a binding call per event rather than one evaluate per
    // tick — the cost I was avoiding — but an event that arrives late is still
    // an event, and one that is never recorded is not.
    const BINDING = "__cbReportInteraction";
    try {
      await this.page.exposeFunction(BINDING, (raw: unknown) => {
        const it = raw as Record<string, unknown>;
        this.interactions.push({
          atMs: Date.now() - this.startWallMs,
          type: String(it?.type ?? "click"),
          x: Number(it?.x ?? 0),
          y: Number(it?.y ?? 0),
          label: String(it?.label ?? ""),
        });
      });
    } catch { /* already bound on this page; the init script below still runs */ }

    const initScript = `(() => {
      if (window.__cbArmed) return;
      window.__cbArmed = true;
      const send = (type) => (e) => {
        try {
          const t = e.target;
          const label = (t && (t.innerText || (t.getAttribute && t.getAttribute("aria-label")) || t.tagName) || "")
            .toString().trim().slice(0, 60);
          if (window.${BINDING}) {
            window.${BINDING}({ type, x: e.clientX || 0, y: e.clientY || 0, label });
          }
        } catch (_) {}
      };
      document.addEventListener("click", send("click"), true);
      document.addEventListener("change", send("input"), true);
      document.addEventListener("submit", send("submit"), true);
    })();`;

    // addInitScript runs on EVERY document, so the listener survives navigation.
    try { await this.page.addInitScript({ content: initScript }); } catch { /* CSP */ }
    // ...and once now, since the current document already loaded.
    try { await this.page.evaluate(initScript); } catch { /* CSP or closed page */ }

    let lastScrollY = 0;
    this.scrollTimer = setInterval(() => {
      void (async () => {
        try {
          const y = await this.page.evaluate(() => window.scrollY);
          // Sampled every tick regardless of the snapshot threshold: the
          // correction needs fine-grained scroll, even where a fresh DOM read
          // would be wasteful.
          this.scrollTrack.push({ atMs: Date.now() - this.startWallMs, scrollY: y });

          if (Math.abs(y - lastScrollY) >= SCROLL_SNAPSHOT_THRESHOLD_PX) {
            lastScrollY = y;
            await snapshot();
          }
        } catch { /* page gone; the stop path handles it */ }
      })();
    }, SCROLL_SNAPSHOT_INTERVAL_MS);
  }

  private detachPageListeners(): void {
    if (this.consoleListener) this.page.off("console", this.consoleListener);
    if (this.requestListener) this.page.off("request", this.requestListener);
    this.consoleListener = null;
    this.requestListener = null;
  }

  // =======================================================================
  // Stop / manifest / encode
  // =======================================================================

  private async doStop(): Promise<VideoCaptureResult> {
    if (this.durationTimer) { clearTimeout(this.durationTimer); this.durationTimer = null; }
    if (this.loopTimer) { clearInterval(this.loopTimer); this.loopTimer = null; }
    if (this.trackTimer) { clearInterval(this.trackTimer); this.trackTimer = null; }
    if (this.stopTriggerTimer) { clearInterval(this.stopTriggerTimer); this.stopTriggerTimer = null; }
    // A leaked interval holds the event loop open and keeps a finished capture's
    // process alive.
    if (this.scrollTimer) { clearInterval(this.scrollTimer); this.scrollTimer = undefined; }
    if (this.navListener) {
      try { this.page.off("framenavigated", this.navListener); } catch { /* page already gone */ }
      this.navListener = undefined;
    }
    if (this.stopTimeoutTimer) { clearTimeout(this.stopTimeoutTimer); this.stopTimeoutTimer = null; }

    // Close the window with a real frame when the stream has gone quiet, so the
    // recording's last timestamp reflects the requested duration instead of
    // whenever the page happened to stop painting.
    const nowMs = Date.now() - this.startWallMs;
    const lastMs = this.frames.length > 0 ? this.frames[this.frames.length - 1]!.tMs : -Infinity;
    if (nowMs - lastMs > (1000 / this.opts.fps) * CLOSING_FRAME_THRESHOLD) {
      await this.captureDirectFrame();
    }

    this.state = "stopped";
    this.stopWallMs = Date.now();
    this.detachPageListeners();

    if (this.cdp) {
      await this.cdp.send("Page.stopScreencast").catch(() => { /* page may already be gone */ });
      await this.cdp.detach().catch(() => { /* already detached */ });
      this.cdp = null;
    }

    await this.writeQueue;

    const durationMs = Math.max(
      this.stopWallMs - this.startWallMs,
      this.frames.length > 0 ? this.frames[this.frames.length - 1]!.tMs : 0,
    );

    const manifest = await this.buildManifest(durationMs);
    const manifestPath = join(this.outDir, "manifest.json");

    const encodeErrors = await this.runEncoders(manifest, durationMs);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    this.result = { manifestPath, manifest, encodeErrors };
    this.finishedResolve(this.result);
    return this.result;
  }

  private async buildManifest(durationMs: number): Promise<RecordingManifest> {
    const scores = await this.scoreFrames();
    const changePoints = detectChangePoints(scores, SSIM_THRESHOLDS.change);
    // The sparse tier. Derived from the same comparator and the same scores, so
    // key_frames and the per-frame `anomaly` flags cannot disagree.
    const keyFrames = detectChangePoints(scores, SSIM_THRESHOLDS.key);
    const anomalies = new Set(keyFrames);
    const tMs = this.frames.map((f) => f.tMs);

    const frames: Frame[] = this.frames.map((f, i) => ({
      index: f.index,
      t_ms: f.tMs,
      path: relative(this.outDir, f.path),
      crop: f.crop,
      ssim_prev: scores[i] ?? null,
      anomaly: anomalies.has(i),
      tracking: f.tracking,
      console: this.eventsForFrame(this.consoleEvents, i),
      network: this.eventsForFrame(this.networkEvents, i),
    }));

    const candidate = {
      version: MANIFEST_VERSION,
      slug: this.slug,
      engine: this.engine,
      ...(this.interactions.length > 0 ? { interactions: this.interactions } : {}),
      capture_method: this.captureMethod,
      target_fps: this.opts.fps,
      // Two decimals: 16 frames over 2.6 s printed 6.153846153846153. (v8 B41)
      actual_fps: durationMs > 0 ? Math.round((frames.length / (durationMs / 1000)) * 100) / 100 : 0,
      viewport: this.viewport,
      target: this.target,
      start_trigger: this.startTriggerLabel,
      stop_trigger: this.stopTriggerLabel,
      trigger_timeout: this.triggerTimedOut,
      started_at: this.startedAtIso,
      duration_ms: durationMs,
      output_dims: this.outputDims,
      frames,
      change_points: changePoints,
      key_frames: keyFrames,
      change_points_saturated:
        frames.length > 0 && changePoints.length > frames.length * CHANGE_SATURATION_RATIO,
      // method lives INSIDE ssim_thresholds now (v3): the metric and the
      // numbers it's on are one fact. 0.95 under window-min and 0.95 under
      // global SSIM are different tests, so a threshold without its metric is
      // ambiguous. changeSignal() still reads a top-level method as a fallback
      // for the v3 files already on disk.
      ssim_thresholds: { ...SSIM_THRESHOLDS, method: "changeScore-window-min" },
      frame_gaps: tMs.length > 0 ? findFrameGaps(tMs, this.opts.fps) : [],
      region_clamped: this.regionClamped,
      artifacts: {} as Record<string, string>,
    };

    return parseManifest(candidate);
  }

  /** SSIM of each frame against its predecessor; index 0 is always null. */
  private async scoreFrames(): Promise<(number | null)[]> {
    const scores: (number | null)[] = [];
    let previous: Float32Array | null = null;

    for (const frame of this.frames) {
      let signature: Float32Array | null = null;
      try {
        signature = await frameSignature(frame.path);
      } catch {
        // An unreadable frame scores null rather than poisoning its neighbours.
      }
      // changeScore (window-min SSIM), not global ssim: a change score is the
      // number the tiers and ssim_thresholds are computed from, so scores and
      // thresholds are on ONE scale. Global ssim diluted a localized change
      // into a whole-frame average, which is why a form fill on a large
      // viewport scored ~0.998 and registered as nothing.
      scores.push(previous && signature ? changeScore(previous, signature) : null);
      if (signature) previous = signature;
    }
    return scores;
  }

  /**
   * Attach each side-channel event to the frame whose display window contains
   * it: the last frame at or before the event, or frame 0 for anything that
   * fired before the first frame landed.
   */
  private eventsForFrame<T extends { t_ms: number }>(events: T[], index: number): T[] {
    if (this.frames.length === 0) return [];
    const start = this.frames[index]!.tMs;
    const next = this.frames[index + 1];
    const end = next ? next.tMs : Infinity;

    return events.filter((e) =>
      index === 0 ? e.t_ms < end : e.t_ms >= start && e.t_ms < end,
    );
  }

  /**
   * Run the requested encoders. An encoder failure is recorded and reported but
   * never thrown - the frames and manifest are the durable artifact, and losing
   * a recording because a codec is missing would be the worst possible trade.
   */
  private async runEncoders(
    manifest: RecordingManifest,
    durationMs: number,
  ): Promise<Record<string, string>> {
    const errors: Record<string, string> = {};
    if (this.frames.length === 0) return errors;

    // The contact sheet samples the REAL frames, so it keeps the unexpanded
    // list - expanded repeats would fill the sheet with duplicate tail frames.
    const paths = this.frames.map((f) => f.path);

    // A long quiet tail produces one enormous final delay, and GIF/WebP cap a
    // single delay at 65535ms. Capping alone would silently truncate playback
    // (a 5-minute recording rendered as 68 seconds), so the held frame is
    // repeated instead: identical consecutive frames merge back into one page
    // whose delays sum to the real hold. Frames and crops expand TOGETHER,
    // because encoders index crops per-frame and expanding one alone would
    // misalign every crop after the first repeat.
    const expanded = expandForPlayback(
      this.frames.map((f) => ({ path: f.path, crop: f.crop })),
      this.frames.map((f) => f.tMs),
      Math.max(durationMs, 1),
    );
    let encodePaths = expanded.items.map((i) => i.path);

    // Attention overlay, when asked for. Runs BEFORE encoding so every format
    // gets the overlaid frames from one pass rather than one pass per format.
    //
    // The DOM is read from the still-live page here rather than per frame: a
    // per-frame extract would cost a page.evaluate on every screencast frame,
    // and supplying the DOM at all is what upgrades this from bottom-up
    // contrast (benchmarked, lost to centre-bias) to the full 20/80 model.
    if (this.opts.saliencyOverlay) {
      const cfg = typeof this.opts.saliencyOverlay === "object" ? this.opts.saliencyOverlay : {};
      try {
        const { overlayAttentionOnFrames } = await import("./saliency-overlay.js");
        const { extractPageElementsForAttention } = await import("../visual/attention-quality.js");

        // Prefer snapshots taken DURING the recording. Falling back to a
        // stop-time read is only correct for a capture that never navigated.
        let domElements: Awaited<ReturnType<typeof extractPageElementsForAttention>> | undefined;
        if (this.domSnapshots.length === 0) {
          try {
            domElements = await extractPageElementsForAttention(this.page);
          } catch {
            // A navigated-away or closed page still yields a visual-only overlay.
          }
        } else {
          domElements = this.domSnapshots[this.domSnapshots.length - 1]
            .elements as Awaited<ReturnType<typeof extractPageElementsForAttention>>;
        }

        // Everything the judging path needs must actually be handed over.
        // Previously getApiKey was never passed, keyFrames and frameTimesMs were
        // never passed, and relevanceContext was built only when `entitled` was
        // defined — which no CLI caller sets. The guard inside the overlay then
        // failed silently on every path, so an overlay ran, painted frames, and
        // produced zero judged moments while reporting success.
        const { getAnthropicApiKey } = await import("../cognitive/index.js");
        const { resolvePersonaContext } = await import("../visual/persona-context.js");
        const overlay = await overlayAttentionOnFrames(encodePaths, this.outDir, {
          ...cfg,
          ...(domElements ? { domElements: domElements as never } : {}),
          relevanceContext: {
            personaName: cfg.persona ?? "first-timer",
            // Traits, values and description. This path had the same defect as
            // attention_analysis: only the name reached the judge, so every
            // frame was scored against a persona the model had to imagine.
            ...(await resolvePersonaContext(cfg.persona ?? "first-timer")),
            ...(cfg.goal ? { goal: cfg.goal } : {}),
            // Undefined means "no entitlement opinion" — the judge treats only
            // an explicit false as a block, so CLI and self-hosted callers work.
            ...(cfg.entitled !== undefined ? { entitled: cfg.entitled } : {}),
          },
          keyFrames: manifest.key_frames ?? [],
          // Time-indexed DOM, so a frame is judged against the page as it was
          // at that moment rather than against wherever the capture ended up.
          domTimeline: this.domSnapshots as never,
          scrollTrack: this.scrollTrack,
          interactions: this.interactions,
          frameTimesMs: manifest.frames.map((f) => f.t_ms),
          summarize: true,
          getApiKey: getAnthropicApiKey,
        });
        encodePaths = overlay.frames;
        manifest.attention_overlay = {
          applied: true,
          quantity: overlay.quantity,
          used_dom: overlay.usedDom,
          dom_elements: domElements?.length ?? 0,
          frames_failed: overlay.failed,
          ...(overlay.personaResolved !== undefined ? { persona_resolved: overlay.personaResolved } : {}),
          ...(overlay.personaUsed ? { persona_used: overlay.personaUsed } : {}),
          // These were computed and thrown away. A per-keyframe judgement that
          // never leaves the function is an LLM call spent for nothing.
          ...(overlay.moments && overlay.moments.length > 0
            ? {
                moments: overlay.moments.map((m) => ({
                  frame_index: m.frameIndex,
                  t_ms: m.tMs,
                  ...(m.reasoning ? { reasoning: m.reasoning } : {}),
                  ...(m.source ? { source: m.source } : {}),
                  ...(m.unavailable ? { unavailable: m.unavailable } : {}),
                  top_elements: m.topElements,
                })),
              }
            : {}),
          ...(overlay.summary ? { summary: overlay.summary } : {}),
        };
      } catch (err) {
        // An overlay failure must never cost the recording.
        errors["attention-overlay"] = `attention overlay failed: ${(err as Error).message}`;
      }
    }
    const delays = expanded.delays;

    // Frames on disk are full-viewport; the crop is applied here, at encode
    // time, which is what keeps a capture re-croppable after the fact.
    const cropOpts = this.target.kind === "viewport"
      ? { width: this.outputDims.width, height: this.outputDims.height }
      : {
          width: this.outputDims.width,
          height: this.outputDims.height,
          crops: expanded.items.map((i) => i.crop),
        };

    if (this.opts.contactSheet) {
      const sheetOpts = typeof this.opts.contactSheet === "object" ? this.opts.contactSheet : {};
      const sheetPath = join(this.outDir, `${this.slug}-contact-sheet.jpg`);
      try {
        const sheet = await buildContactSheet({ framePaths: paths, outPath: sheetPath, ...sheetOpts });
        manifest.artifacts["contact-sheet"] = relative(this.outDir, sheet.path);
      } catch (err) {
        errors["contact-sheet"] = `contact sheet failed: ${(err as Error).message}`;
      }
    }

    for (const format of this.opts.format) {
      const outPath = join(this.outDir, `${this.slug}.${format}`);
      try {
        switch (format) {
          case "gif": await encodeGif(encodePaths, delays, outPath, cropOpts); break;
          case "webp": await encodeWebp(encodePaths, delays, outPath, cropOpts); break;
          case "webm": await encodeWebm(encodePaths, delays, outPath, { ...cropOpts, fps: this.opts.fps }); break;
          case "mp4": await encodeMp4(encodePaths, delays, outPath, { ...cropOpts, fps: this.opts.fps }); break;
        }
        if (existsSync(outPath)) manifest.artifacts[format] = relative(this.outDir, outPath);
      } catch (err) {
        errors[format] = err instanceof MissingEncoderError
          ? err.message
          : `${format} encode failed: ${(err as Error).message}`;
      }
    }
    return errors;
  }
}
