/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Recording manifest contract.
 *
 * The manifest is the single artifact that describes a recording run: how it
 * was captured, what was captured, and every frame that made it into the
 * output. Encoders, the CLI, and any downstream consumer read this file rather
 * than re-deriving state from the frame directory.
 *
 * Schemas are zod v4; every exported TS type is inferred from its schema so the
 * runtime contract and the compile-time contract cannot drift.
 */

import { z } from "zod";

/**
 * Manifest format version emitted by this build.
 *
 * v2 (2026-07-19) added the two-tier change signal: `key_frames`,
 * `change_points_saturated` and `ssim_thresholds`, all OPTIONAL in the schema
 * (expand-contract, so older files keep parsing) but always emitted, so
 * `version >= 2` reliably signals their presence.
 *
 * v3 (2026-07-19) changed the DETECTOR behind those fields from global SSIM to
 * {@link SSIM_THRESHOLDS} window-min ({@link changeScore}), and re-tuned the
 * thresholds to the new scale (0.999/0.9 -> 0.95/0.6). The field shapes are
 * unchanged, but a v3 `change_points` is not numerically comparable to a v2
 * one — the version is the signal for that, since the values in
 * `ssim_thresholds` alone cannot convey that the underlying metric changed.
 * Readers wanting a uniform view across versions should use {@link changeSignal}.
 */
export const MANIFEST_VERSION = 3;

/**
 * Change-detection thresholds for the two-tier signal.
 *
 * These are measured against the {@link changeScore} scale (minimum SSIM over an
 * 8x8 window grid on a 128px signature), NOT global SSIM. The scale is entirely
 * different from a whole-frame metric and the two are not interchangeable — a
 * localized text change reads ~0.87 under changeScore versus ~0.9998 under
 * global SSIM. The producer MUST feed these thresholds changeScore values;
 * `ssim_thresholds` records them in every manifest so a reader never guesses.
 *
 * `CHANGE` (0.95) — "did anything change". Below the practical noise floor
 * (an unchanging page scores exactly 1.0; window-min does not fire on codec
 * noise) and above a 12px counter tick (~0.87), which is the localized change
 * global SSIM could not see at any resolution.
 *
 * `KEY` (0.6) — "did something notable happen". The sparse tier, and the same
 * signal that sets each frame's `anomaly` flag. It sits in the wide gap between
 * a minor tick (~0.87, excluded) and a real interaction like a form fill
 * (~0.21, included), so background chrome does not flood it. Because KEY <
 * CHANGE, `key_frames` is necessarily a subset of `change_points`;
 * {@link changeSignalIssues} checks a manifest honours it.
 *
 * Derived from measurement on five fixtures (static / ticking counter / two
 * form fills / banner toggle / full-viewport animation), 2026-07-19. The
 * counter fixture is why the two tiers matter: change_points fires on every
 * tick and saturates, while key_frames stays empty — so key_frames is the
 * usable signal precisely when change_points is not.
 */
export const SSIM_THRESHOLDS = { change: 0.95, key: 0.6 } as const;

/**
 * Fraction of frames above which `change_points` is considered saturated —
 * carrying no discriminating information for that capture.
 */
export const CHANGE_SATURATION_RATIO = 0.7;

// ============================================================================
// Primitives
// ============================================================================

export const EngineSchema = z.enum(["chromium", "firefox", "webkit"]);

export const CaptureMethodSchema = z.enum(["cdp-screencast", "screenshot-loop"]);

export const ViewportSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  deviceScaleFactor: z.number().positive(),
});

export const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const DimsSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

// ============================================================================
// Capture target
// ============================================================================

/**
 * What the recorder was pointed at. Discriminated on `kind` so encoders can
 * switch exhaustively without guessing from the presence of optional fields.
 */
export const TargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("viewport") }),
  z.object({ kind: z.literal("region"), rect: RectSchema }),
  z.object({
    kind: z.literal("element"),
    selector: z.string().min(1),
    padding: z.number().nonnegative(),
  }),
]);

// ============================================================================
// Per-frame side-channel records
// ============================================================================

/**
 * Console and network records are kept deliberately permissive: the recorder
 * owns their exact shape and may attach engine-specific extras. Only the fields
 * the encoders and reports actually read are required; unknown keys survive
 * parsing untouched.
 */
export const ConsoleEntrySchema = z
  .object({
    t_ms: z.number().nonnegative(),
    type: z.string(),
    text: z.string(),
  })
  .loose();

export const NetworkEntrySchema = z
  .object({
    t_ms: z.number().nonnegative(),
    url: z.string(),
    method: z.string().optional(),
    status: z.number().int().optional(),
    failed: z.boolean().optional(),
  })
  .loose();

// ============================================================================
// Frames
// ============================================================================

export const FrameSchema = z.object({
  /** Position in the frame sequence, 0-based and dense. */
  index: z.number().int().nonnegative(),
  /** Milliseconds since `started_at`. Non-decreasing across the sequence. */
  t_ms: z.number().nonnegative(),
  /** Path to the frame image, relative to the manifest. */
  path: z.string().min(1),
  /** Source-image crop this frame was cut from (post-clamp). */
  crop: RectSchema,
  /**
   * Change score against the previous frame; null for frame 0 or when not
   * computed. Computed with the comparator named in `ssim_thresholds.method`:
   * on v3 manifests that is minimum SSIM over a window grid (window-min), where
   * a lower value means MORE of the frame changed and a localized change is not
   * diluted by the unchanged remainder. v1/v2 manifests carry whole-frame
   * (global) SSIM here, a different scale — do not compare the two without
   * checking `method`. The field name is retained across versions because
   * window-min is itself an SSIM statistic (the minimum of windowed SSIMs).
   */
  ssim_prev: z.number().nullable(),
  /** Frame flagged as a visual anomaly by the change detector. */
  anomaly: z.boolean(),
  /** Element-tracking state for element targets; null when not tracking. */
  tracking: z.enum(["ok", "stale"]).nullable(),
  console: z.array(ConsoleEntrySchema),
  network: z.array(NetworkEntrySchema),
});

export const FrameGapSchema = z.object({
  /** Gap occurred between this frame index and the next one. */
  after_index: z.number().int().nonnegative(),
  gap_ms: z.number().positive(),
});

// ============================================================================
// Manifest
// ============================================================================

export const RecordingManifestSchema = z.object({
  version: z.number().int().positive(),
  slug: z.string().min(1),
  engine: EngineSchema,
  capture_method: CaptureMethodSchema,
  /** Frame rate requested by the caller. */
  target_fps: z.number().positive(),
  /** Frame rate actually achieved: frames / (duration_ms / 1000). */
  actual_fps: z.number().nonnegative(),
  viewport: ViewportSchema,
  target: TargetSchema,
  /** Trigger that started capture; null when capture started immediately. */
  start_trigger: z.string().nullable(),
  /** Trigger that stopped capture; null when capture ran to a fixed duration. */
  stop_trigger: z.string().nullable(),
  /** True when capture ended because a trigger timed out rather than fired. */
  trigger_timeout: z.boolean(),
  /** ISO-8601 timestamp of the first frame. */
  started_at: z.string().min(1),
  duration_ms: z.number().nonnegative(),
  output_dims: DimsSchema,
  frames: z.array(FrameSchema),
  /**
   * Frame indices whose change score fell below the CHANGE threshold
   * ({@link SSIM_THRESHOLDS}.change). Sensitive tier: catches a localized change
   * like a form fill or a ticking counter, and saturates on a continuously
   * changing page — see `change_points_saturated`.
   */
  change_points: z.array(z.number().int().nonnegative()),
  /**
   * Frame indices where SSIM dropped below the KEY threshold: the sparse
   * "something notable happened" list, and a subset of `change_points`.
   *
   * v2+. Absent on v1 manifests, where `change_points` was itself computed at
   * the key threshold — see {@link changeSignal}.
   */
  key_frames: z.array(z.number().int().nonnegative()).optional(),
  /**
   * True when `change_points` covers more than
   * {@link CHANGE_SATURATION_RATIO} of frames, i.e. it carries no
   * discriminating information for this capture and a reader should fall back
   * to `key_frames`.
   *
   * Explicit rather than left for the reader to derive, so a saturated field
   * cannot masquerade as a working one. v2+.
   */
  change_points_saturated: z.boolean().optional(),
  /**
   * The thresholds this build actually used, so a reader never has to infer
   * which build produced a file. v2+.
   *
   * `method` names the comparator the scores and thresholds are on, e.g.
   * "changeScore-window-min" — the METRIC, which the threshold values alone
   * cannot convey (0.95 under window-min and 0.95 under global SSIM are entirely
   * different tests). It lives HERE, with the numbers it describes, rather than
   * at the manifest top level where it read as a sibling of `capture_method`.
   */
  ssim_thresholds: z
    .object({ change: z.number(), key: z.number(), method: z.string().optional() })
    .optional(),
  /**
   * @deprecated Provenance moved into `ssim_thresholds.method` (its canonical
   * home). Still admitted so the v3 manifests written before the move — which
   * carry `method` at the top level — keep parsing and stay readable through
   * {@link changeSignal}. Expand-contract: readers accept both locations now;
   * this admission is removed once no top-level-method files remain. The engine
   * writes only the nested location.
   */
  method: z.string().optional(),
  frame_gaps: z.array(FrameGapSchema),
  /** Present when a region/element rect had to be clamped into the viewport. */
  region_clamped: z.boolean().optional(),
  /** Output format ("gif", "webp", "mp4", ...) to artifact path. */
  artifacts: z.record(z.string(), z.string()),
  /**
   * Present when frames were overlaid with the attention map.
   *
   * `quantity` records WHAT was painted, because the two cases carry different
   * evidential weight: with DOM it is the full 20/80 production model, without
   * it only the bottom-up contrast half that lost to a centre-bias baseline.
   * A consumer that renders these frames should label them from this field
   * rather than assuming.
   */
  /**
   * Real interactions recorded during the capture, in capture-relative ms.
   *
   * Distinct from anything the attention model produces: these are events that
   * HAPPENED, not attention that was PREDICTED. Kept at manifest level rather
   * than inside attention_overlay for exactly that reason -- a capture with no
   * overlay still has a true interaction record.
   */
  interactions: z.array(z.object({
    atMs: z.number(),
    type: z.string(),
    x: z.number(),
    y: z.number(),
    label: z.string(),
  })).optional(),
  attention_overlay: z.object({
    applied: z.boolean(),
    quantity: z.enum(["predicted-attention", "visual-contrast-only"]),
    used_dom: z.boolean(),
    dom_elements: z.number(),
    frames_failed: z.number(),
    persona_resolved: z.boolean().optional(),
    persona_used: z.string().optional(),
    /** Per-keyframe judgements. Computed during overlay and previously dropped. */
    moments: z.array(z.object({
      frame_index: z.number(),
      t_ms: z.number(),
      reasoning: z.string().optional(),
      source: z.string().optional(),
      unavailable: z.string().optional(),
      top_elements: z.array(z.object({
        text: z.string(), type: z.string(), score: z.number(),
      })),
    })).optional(),
    /** Narrative of the whole run, when a summary was requested. */
    summary: z.string().optional(),
  }).optional(),
});

// ============================================================================
// Inferred types
// ============================================================================

export type Engine = z.infer<typeof EngineSchema>;
export type CaptureMethod = z.infer<typeof CaptureMethodSchema>;
export type Viewport = z.infer<typeof ViewportSchema>;
export type Rect = z.infer<typeof RectSchema>;
export type Dims = z.infer<typeof DimsSchema>;
export type RecordingTarget = z.infer<typeof TargetSchema>;
export type ConsoleEntry = z.infer<typeof ConsoleEntrySchema>;
export type NetworkEntry = z.infer<typeof NetworkEntrySchema>;
export type Frame = z.infer<typeof FrameSchema>;
export type FrameGap = z.infer<typeof FrameGapSchema>;
export type RecordingManifest = z.infer<typeof RecordingManifestSchema>;

// ============================================================================
// Parsing
// ============================================================================

/**
 * Parse and validate a manifest.
 *
 * Accepts an already-parsed object or a raw JSON string. Throws an `Error`
 * whose message lists every failing path, so a malformed manifest reports all
 * of its problems at once instead of one per run.
 */
/**
 * Uniform view of the change signal across manifest versions.
 *
 * A pre-v2 manifest has only `change_points`, computed with a whole-frame
 * (global) SSIM detector — a DIFFERENT metric from the current window-min
 * {@link SSIM_THRESHOLDS} scale, so the two are not numerically comparable. For
 * such a file this returns the single list it has as both tiers rather than
 * inventing a key/change split it never carried, and marks `legacy: true` so a
 * reader knows the tiers are not really separated and the thresholds are not on
 * the current scale. `saturated` is false because the old global detector could
 * not saturate the way window-min can.
 *
 * This is NOT the exact identity an earlier version of this comment claimed:
 * once the detector changed from global SSIM to window-min, an old file's
 * change points stopped mapping onto today's `key_frames`. Reporting the one
 * list for both tiers is the honest fallback, not a translation.
 *
 * Use this in readers instead of touching the optional fields directly, so a
 * pre-v2 file does not read as "no key frames" when its change_points are the
 * only signal it has.
 */
export function changeSignal(manifest: RecordingManifest): {
  changePoints: number[];
  keyFrames: number[];
  saturated: boolean;
  thresholds: { change: number; key: number };
  /** Comparator name, read from either the nested or the deprecated top-level location; undefined on pre-v3 files. */
  method: string | undefined;
  legacy: boolean;
  manifestVersion: number;
} {
  const legacy = manifest.key_frames === undefined;
  const st = manifest.ssim_thresholds;
  return {
    changePoints: manifest.change_points,
    keyFrames: manifest.key_frames ?? manifest.change_points,
    saturated: manifest.change_points_saturated ?? false,
    // A legacy file's threshold is unknown and on a different scale; surface
    // its own recorded value if it has one, else NaN rather than a current-scale
    // number that would misrepresent how the list was computed. Strip any nested
    // `method` back out so `thresholds` stays purely numeric.
    thresholds: st ? { change: st.change, key: st.key } : { change: NaN, key: NaN },
    // Read from either home: nested is canonical, top-level is the transitional
    // v3 location still on disk today.
    method: st?.method ?? manifest.method,
    legacy,
    manifestVersion: manifest.version,
  };
}

/**
 * Consistency problems in a manifest's change signal, as human-readable
 * strings. Empty means consistent.
 *
 * These are invariants the two-tier design guarantees by construction, so a
 * violation means the producer is miscomputing rather than that the file is
 * merely old. Deliberately NOT enforced inside {@link parseManifest}: readers
 * such as `capture status` open whatever manifest is most recent, and failing
 * the read outright would turn a reporting bug into an unreadable capture. Call
 * this where you want the check — tests, or a diagnostic path.
 */
export function changeSignalIssues(manifest: RecordingManifest): string[] {
  const issues: string[] = [];
  const frameCount = manifest.frames.length;

  const inRange = (label: string, indices: number[]) => {
    for (const i of indices) {
      if (i >= frameCount) issues.push(`${label} contains index ${i} but there are only ${frameCount} frames`);
    }
  };
  inRange("change_points", manifest.change_points);

  if (manifest.key_frames) {
    inRange("key_frames", manifest.key_frames);
    const changeSet = new Set(manifest.change_points);
    const stray = manifest.key_frames.filter((i) => !changeSet.has(i));
    if (stray.length > 0) {
      issues.push(
        `key_frames must be a subset of change_points (the key threshold is lower, ` +
          `so anything below it is below the change threshold too), but ` +
          `${stray.length} index(es) are missing from change_points: ${stray.slice(0, 5).join(", ")}`,
      );
    }
  }

  if (manifest.ssim_thresholds) {
    const { change, key } = manifest.ssim_thresholds;
    if (key > change) {
      issues.push(`ssim_thresholds.key (${key}) must not exceed ssim_thresholds.change (${change})`);
    }
  }

  if (manifest.change_points_saturated !== undefined && frameCount > 0) {
    const expected = manifest.change_points.length > frameCount * CHANGE_SATURATION_RATIO;
    if (manifest.change_points_saturated !== expected) {
      issues.push(
        `change_points_saturated is ${manifest.change_points_saturated} but ` +
          `${manifest.change_points.length}/${frameCount} change points ` +
          `(ratio ${(manifest.change_points.length / frameCount).toFixed(3)}) implies ${expected}`,
      );
    }
  }

  return issues;
}

export function parseManifest(input: unknown): RecordingManifest {
  let candidate = input;

  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch (e) {
      throw new Error(`Invalid recording manifest: not valid JSON (${(e as Error).message})`);
    }
  }

  const result = RecordingManifestSchema.safeParse(candidate);
  if (result.success) return result.data;

  const details = result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `  - ${path}: ${issue.message}`;
    })
    .join("\n");

  throw new Error(`Invalid recording manifest:\n${details}`);
}
