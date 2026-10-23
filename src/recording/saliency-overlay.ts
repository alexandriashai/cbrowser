/**
 * Attention overlay for captured frames.
 *
 * Renders the model's predicted-attention map over each captured frame so a
 * recording can be watched with the attention structure visible, then handed to
 * the normal encoders as an ordinary frame sequence.
 *
 * WHY THIS USES THE DOM. Capture runs against a LIVE page, so the DOM is right
 * there — and `analyzeAttention` blends 20% bottom-up colour contrast with 80%
 * DOM semantics (element type x persona priority x goal relevance). Overlaying
 * the bottom-up half alone would paint the one component that has been
 * benchmarked and LOST: on 495 web pages against real human fixations it scored
 * AUC 0.585 versus a plain centre-bias baseline's 0.658. Passing DOM elements
 * makes this the actual production attention model rather than the weakest
 * quarter of it. Falls back to visual-only when no DOM is supplied, and says so
 * in the result.
 *
 * WHAT IT DOES AND DOES NOT ESTABLISH. With DOM this is the product's attention
 * prediction — legitimately what cbrowser computes and sells. It is not a
 * *validated* gaze prediction: the semantic layer carrying most of the blend has
 * never been tested against human eye movements in either direction, which is
 * what the primary collection study is being built to settle. So "predicted
 * attention" is accurate; "where users look" asserts an accuracy nobody has
 * measured yet. (2026-07-30)
 *
 * Cost: one attention pass per frame, roughly 0.5-1s each at typical viewport
 * sizes. A 5s capture at 10fps is ~50 frames, so budget 30-60s. That is why
 * this is opt-in and never the default.
 */

import { existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";

import { analyzeAttention, type AttentionAnalysis, type DOMAttentionElement } from "../visual/attention-transport.js";
import { personaStoredAccessibilityTraits } from "../visual/stored-accessibility-traits.js";
import type { AccessibilityTraits } from "../types.js";
import {
  judgeRelevance,
  summarizeCapture,
  type JudgedMoment,
  type RelevanceContext,
  type RelevanceElement,
} from "../visual/llm-relevance.js";

export interface AttentionOverlayOptions {
  /** 0-1 opacity of the heat layer. Default 0.55 — readable without hiding the page. */
  opacity?: number;
  /**
   * Cells below this fraction of the frame's peak stay fully transparent, so the
   * overlay marks hot regions rather than tinting everything. Default 0.35.
   */
  floor?: number;
  /** Analysis cell size in px. Default 16, matching the shipped attention model. */
  cellSize?: number;
  /** Persona whose priorities weight the semantic layer. Default "first-timer". */
  persona?: string;
  /**
   * DOM elements as the attention model consumes them. Supply these and the
   * overlay reflects the full 20/80 blend; omit them and it degrades to
   * bottom-up contrast only.
   */
  domElements?: DOMAttentionElement[];
  /** Goal string, which weights goal-relevance in the semantic layer. */
  goal?: string;
  /**
   * Frame indices where the interface changed enough to warrant re-judging.
   *
   * The capture engine already computes this as `key_frames` via SSIM, and it is
   * the right trigger precisely because it does not saturate the way
   * `change_points` does. Re-judging every frame would cost one model call per
   * frame; re-judging only where the page actually changed costs a handful per
   * recording and produces the same map, because between keyframes the page —
   * and therefore the judgement — is unchanged.
   */
  keyFrames?: number[];
  /** Per-frame timestamps, used to place moments on the recording timeline. */
  frameTimesMs?: number[];
  /**
   * DOM as it stood at points in time, captured on navigation during recording.
   *
   * A judged frame uses the snapshot in effect AT ITS TIMESTAMP. Without this,
   * every frame was scored against the page the capture ended on — so a frame
   * on the pricing page got ranked against a post-click verification screen,
   * every moment came back identical, and the summary read that uniformity as a
   * UX finding rather than as the artifact it was.
   */
  domTimeline?: Array<{ atMs: number; scrollY?: number; elements: DOMAttentionElement[] }>;
  /** Scroll position over time, used to correct rects for drift since capture. */
  scrollTrack?: Array<{ atMs: number; scrollY: number }>;
  /** Real interactions, for the click pulse and for the summary's action log. */
  interactions?: Array<{ atMs: number; type: string; x: number; y: number; label: string }>;
  /** Persona context for the relevance judge and the closing summary. */
  relevanceContext?: Omit<RelevanceContext, "screenshot">;
  /** Produce a narrative of the whole recording after the frames are overlaid. */
  summarize?: boolean;
  /** Resolves the Anthropic key. Absent means no judging and no summary. */
  getApiKey?: () => string | null;
}

export interface OverlayResult {
  frames: string[];
  dir: string;
  /** Judged moments, one per keyframe the judge was re-run on. */
  moments?: JudgedMoment[];
  /** Narrative of the whole recording, when a summary was requested. */
  summary?: string;
  /** Frames that could not be overlaid and fell back to the original. */
  failed: number;
  /** True when DOM elements were supplied, i.e. the full model ran. */
  usedDom: boolean;
  /** The quantity that was painted, for callers that label the artifact. */
  quantity: "predicted-attention" | "visual-contrast-only";
  /**
   * Whether the requested persona actually exists.
   *
   * An unknown name does not error — it falls through keyword inference to a
   * default, which is right for custom personas and silent for typos. A caller
   * who asks for "alexa-eden" and gets a generic profile has no way to tell,
   * and every number downstream is then attributed to a persona that never ran.
   */
  personaResolved?: boolean;
  /** The persona actually used, which may differ from the one requested. */
  personaUsed?: string;
  /**
   * How the persona's perceptual filter was found for the painted frames
   * (AttentionAnalysis.perceptualProfile). Absent when no frame was overlaid.
   */
  perceptualProfile?: AttentionAnalysis["perceptualProfile"];
}

/**
 * Map a normalised 0-1 value to an RGBA pixel.
 *
 * Blue -> cyan -> green -> yellow -> red, the convention every saliency paper
 * uses, so the output reads correctly to anyone who has seen a fixation map.
 * Alpha ramps with heat, which keeps cold regions showing the actual page
 * instead of a uniform blue wash.
 */
function heatColour(v: number, opacity: number, floor: number): [number, number, number, number] {
  if (v <= floor) return [0, 0, 0, 0];
  const t = (v - floor) / (1 - floor || 1);

  let r: number, g: number, b: number;
  if (t < 0.25) { const u = t / 0.25; r = 0; g = Math.round(255 * u); b = 255; }
  else if (t < 0.5) { const u = (t - 0.25) / 0.25; r = 0; g = 255; b = Math.round(255 * (1 - u)); }
  else if (t < 0.75) { const u = (t - 0.5) / 0.25; r = Math.round(255 * u); g = 255; b = 0; }
  else { const u = (t - 0.75) / 0.25; r = 255; g = Math.round(255 * (1 - u)); b = 0; }

  return [r, g, b, Math.round(255 * opacity * Math.min(1, 0.35 + t))];
}

/** How long a click pulse stays visible. Long enough to see at 2x, short enough not to smear. */
const PULSE_MS = 900;
/** Ring radius at the start and end of the pulse. */
const PULSE_R0 = 22;
const PULSE_R1 = 86;

/**
 * Draw an expanding ring over an interaction point.
 *
 * Painted in a colour outside the heat ramp (blue->red) so it cannot be mistaken
 * for attention: an interaction is something that HAPPENED, attention is
 * something the model PREDICTED, and a viewer must never have to guess which a
 * mark represents. White with a dark rim reads on both light and dark pages.
 */
function drawPulse(
  buf: Buffer, w: number, h: number,
  cx: number, cy: number, progress: number,
): void {
  const radius = PULSE_R0 + (PULSE_R1 - PULSE_R0) * progress;
  const alpha = Math.round(235 * (1 - progress));
  if (alpha <= 0) return;
  const thickness = 5;

  const y0 = Math.max(0, Math.floor(cy - radius - thickness));
  const y1 = Math.min(h - 1, Math.ceil(cy + radius + thickness));
  const x0 = Math.max(0, Math.floor(cx - radius - thickness));
  const x1 = Math.min(w - 1, Math.ceil(cx + radius + thickness));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const edge = Math.abs(d - radius);
      if (edge > thickness) continue;
      // Soft edge so the ring does not alias into a jagged circle.
      const a = Math.round(alpha * (1 - edge / thickness));
      if (a <= 0) continue;
      const i = (y * w + x) * 4;
      const dark = edge > thickness * 0.6;
      buf[i] = dark ? 20 : 255;
      buf[i + 1] = dark ? 20 : 255;
      buf[i + 2] = dark ? 30 : 255;
      buf[i + 3] = Math.max(buf[i + 3], a);
    }
  }
}

/**
 * Render one frame's attention map as a full-size RGBA buffer.
 *
 * The grid is computed at cell resolution, so it is upsampled here by
 * nearest-cell lookup against the ORIGINAL frame dimensions — resampling the
 * grid to the frame rather than the frame to the grid is what keeps the overlay
 * aligned with what the viewer actually sees.
 */
async function renderHeatLayer(
  framePath: string,
  frameWidth: number,
  frameHeight: number,
  // Names exactly what rendering needs rather than deriving from the whole
  // options type: the option bag also carries judging and summary concerns that
  // have nothing to do with painting a frame, and a Required<Omit<...>> over it
  // breaks every time an unrelated option is added.
  opts: {
    opacity: number;
    floor: number;
    cellSize: number;
    persona: string;
    domElements?: DOMAttentionElement[];
    goal?: string;
    /** The persona's stored accessibility traits (storedAccessibilityTraits). */
    accessibilityTraits?: AccessibilityTraits;
  },
): Promise<{ layer: Buffer; perceptualProfile: AttentionAnalysis["perceptualProfile"] } | null> {
  const analysis = await analyzeAttention(
    framePath,
    opts.persona,
    opts.cellSize,
    undefined,
    opts.domElements,
    opts.goal,
    undefined,
    undefined,
    opts.accessibilityTraits,
  );
  const map = analysis.saliencyMap;
  if (!map) return null;

  const { cells, rows, cols } = map;
  let peak = 0;
  for (const c of cells) if (c > peak) peak = c;
  const norm = peak > 0 ? peak : 1;

  // Bilinear sample, not nearest-cell. Nearest-cell paints every pixel of a
  // cell the same value, which is why the overlay read as a mosaic of hard
  // squares rather than a field of attention.
  const at = (r: number, c: number): number =>
    cells[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))] / norm;

  const out = Buffer.alloc(frameWidth * frameHeight * 4);
  for (let y = 0; y < frameHeight; y++) {
    const fy = (y / frameHeight) * rows - 0.5;
    const r0 = Math.floor(fy), ty = fy - r0;
    for (let x = 0; x < frameWidth; x++) {
      const fx = (x / frameWidth) * cols - 0.5;
      const c0 = Math.floor(fx), tx = fx - c0;
      const v =
        at(r0, c0) * (1 - tx) * (1 - ty) +
        at(r0, c0 + 1) * tx * (1 - ty) +
        at(r0 + 1, c0) * (1 - tx) * ty +
        at(r0 + 1, c0 + 1) * tx * ty;
      const [r, g, b, a] = heatColour(v, opts.opacity, opts.floor);
      const i = (y * frameWidth + x) * 4;
      out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a;
    }
  }
  return { layer: out, perceptualProfile: analysis.perceptualProfile };
}

/**
 * Overlay predicted attention onto every frame, writing a parallel set beside
 * the originals.
 *
 * A frame that fails falls back to the ORIGINAL frame rather than being
 * dropped: a recording with one un-overlaid frame is still usable, while a
 * missing frame corrupts the timing of every frame after it.
 */
export async function overlayAttentionOnFrames(
  framePaths: string[],
  outDir: string,
  options: AttentionOverlayOptions = {},
): Promise<OverlayResult> {
  const opts = {
    opacity: options.opacity ?? 0.55,
    floor: options.floor ?? 0.12,
    cellSize: options.cellSize ?? 4,
    persona: options.persona ?? "first-timer",
    domElements: options.domElements,
    goal: options.goal,
    // Looked up once, not per frame. Without them the overlay painted a persona
    // through the default filter while attention_analysis drew the same persona
    // through one synthesized from its record (ISC-48.1, 2026-10-22).
    accessibilityTraits: await personaStoredAccessibilityTraits(options.persona ?? "first-timer")
      .catch(() => undefined),
  };

  const sharpModule: any = await import("sharp");
  const sharp = sharpModule.default ?? sharpModule;

  const dir = join(outDir, "frames-attention");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  /**
   * DOM in effect at a moment — the newest snapshot at or before it.
   *
   * Used by BOTH rendering and judging. Rendering previously passed one
   * stop-time DOM into every frame, which made the semantic half of the blend —
   * 80% of it — byte-identical across the whole recording. Only the visual 20%
   * varied, so the overlay looked static no matter what happened on the page,
   * and a capture measured nothing a single screenshot did not.
   */
  const scrollAt = (tMs: number): number => {
    const track = options.scrollTrack;
    if (!track || track.length === 0) return 0;
    let best = track[0];
    for (const s of track) if (s.atMs <= tMs) best = s;
    return best.scrollY;
  };

  const domAt = (tMs: number): DOMAttentionElement[] => {
    const tl = options.domTimeline;
    if (!tl || tl.length === 0) return options.domElements ?? [];
    let best = tl[0];
    for (const snap of tl) if (snap.atMs <= tMs) best = snap;

    // Correct for scroll drift since the snapshot was taken. Rects are
    // viewport-relative at extraction, so if the page scrolled DOWN by d
    // afterwards, every element is now d pixels higher than its stored y —
    // painting at the stored value puts the heat that far below the element.
    const drift = scrollAt(tMs) - (best.scrollY ?? scrollAt(best.atMs));
    if (Math.abs(drift) < 1) return best.elements;

    return best.elements.map((el) => ({
      ...el,
      y: el.y - drift,
      ...(el.words
        ? { words: el.words.map((w) => ({ ...w, y: w.y - drift })) }
        : {}),
    }));
  };

  const frames: string[] = [];
  let failed = 0;
  let perceptualProfile: OverlayResult["perceptualProfile"];

  for (const [frameIdx, framePath] of framePaths.entries()) {
    const target = join(dir, basename(framePath));
    try {
      const meta = await sharp(framePath).metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;
      if (!width || !height) throw new Error("frame has no dimensions");

      const heat = await renderHeatLayer(framePath, width, height, {
        ...opts,
        domElements: domAt(options.frameTimesMs?.[frameIdx] ?? 0),
      });
      if (!heat) throw new Error("no attention map produced");
      perceptualProfile ??= heat.perceptualProfile;

      // Blur at foveal scale. The saliency literature smooths fixation maps with
      // a Gaussian at sigma ~= 1 degree of visual angle BECAUSE that is the size
      // of the fovea — roughly 35-60 CSS px at laptop viewing distance. An
      // attention map with edges sharper than the eye's own acuity is claiming a
      // precision no measurement supports, so this is the honest rendering as
      // well as the one that reads correctly.
      const blurred = await sharp(heat.layer, { raw: { width, height, channels: 4 } })
        .blur(Math.max(2, Math.round(Math.min(width, height) * 0.012)))
        .raw()
        .toBuffer();

      // Pulses go on AFTER the blur. Blurring a ring turns it into a smudge, and
      // the whole point of the mark is that it is crisp where the heat is soft —
      // that contrast is what separates "this happened" from "this is predicted".
      const tNow = options.frameTimesMs?.[frameIdx] ?? 0;
      const scrollNow = scrollAt(tNow);
      for (const it of options.interactions ?? []) {
        const age = tNow - it.atMs;
        if (age < 0 || age > PULSE_MS) continue;
        // Interaction coords are viewport-relative at click time, so they need
        // the same scroll correction the element rects get.
        const y = it.y - (scrollNow - scrollAt(it.atMs));
        drawPulse(blurred, width, height, it.x, y, age / PULSE_MS);
      }

      await sharp(framePath)
        .composite([{ input: blurred, raw: { width, height, channels: 4 }, blend: "over" }])
        .toFile(target);

      frames.push(target);
    } catch {
      failed++;
      frames.push(framePath);
    }
  }

  const usedDom = (opts.domElements?.length ?? 0) > 0;

  let personaResolved = true;
  try {
    const { getAnyPersona } = await import("../personas.js");
    personaResolved = Boolean(getAnyPersona(opts.persona));
  } catch { /* registry unavailable; assume resolved rather than cry wolf */ }

  // Judge the persona's attention at each KEYFRAME, not each frame. The engine's
  // SSIM keyframes are the moments the interface actually changed, so between
  // them the page — and therefore the judgement — is identical. This turns an
  // unusable per-frame cost into a handful of calls per recording.
  let moments: JudgedMoment[] | undefined;
  let summary: string | undefined;

  const ctx = options.relevanceContext;
  const getApiKey = options.getApiKey;

  // Frame 0 is ALWAYS judged, then each keyframe after it.
  //
  // Keying purely on keyframes meant a page that never changed produced no
  // judgement at all — and a static page is precisely where "what does this
  // persona attend to" is worth asking. Measured on a real pricing capture:
  // key_frames was empty, so twelve frames were overlaid and nothing was ever
  // judged. Deduped because frame 0 is sometimes a keyframe too.
  const judgeAt = ctx && getApiKey && usedDom
    ? Array.from(new Set([0, ...(options.keyFrames ?? [])])).sort((a, b) => a - b)
    : [];

  if (ctx && getApiKey && usedDom && judgeAt.length > 0) {
    moments = [];
    for (const frameIndex of judgeAt) {
      if (frameIndex < 0 || frameIndex >= framePaths.length) continue;
      try {
        const tMs = options.frameTimesMs?.[frameIndex] ?? 0;
        const frameDom = domAt(tMs);
        const elements: RelevanceElement[] = frameDom.map((el, i) => ({
          index: i,
          type: el.type,
          text: el.text ?? "",
          x: el.x, y: el.y, width: el.width, height: el.height,
        }));
        const judged = await judgeRelevance(elements, { ...ctx, screenshot: undefined }, getApiKey);
        const top = Object.entries(judged.scores)
          .map(([i, score]) => ({ el: elements[Number(i)], score }))
          .filter((e) => e.el)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map((e) => ({ text: e.el.text, type: e.el.type, score: e.score }));
        moments.push({
          frameIndex,
          tMs: options.frameTimesMs?.[frameIndex] ?? 0,
          ...(judged.reasoning ? { reasoning: judged.reasoning } : {}),
          source: judged.source,
          ...(judged.unavailable ? { unavailable: judged.unavailable } : {}),
          topElements: top,
        });
      } catch { /* one unjudged moment must not cost the recording */ }
    }

    if (options.summarize && moments.length > 0) {
      const narrated = await summarizeCapture(
        moments,
        {
          ...ctx,
          durationMs: options.frameTimesMs?.[framePaths.length - 1] ?? 0,
          frameCount: framePaths.length,
          actions: (options.interactions ?? []).map((i) => ({
            atMs: i.atMs, type: i.type, label: i.label,
          })),
        },
        getApiKey,
      );
      if (narrated.source === "llm" && narrated.narrative) summary = narrated.narrative;
    }
  }

  return {
    frames,
    dir,
    failed,
    usedDom,
    quantity: usedDom ? "predicted-attention" : "visual-contrast-only",
    personaResolved,
    personaUsed: opts.persona,
    ...(perceptualProfile ? { perceptualProfile } : {}),
    ...(moments && moments.length > 0 ? { moments } : {}),
    ...(summary ? { summary } : {}),
  };
}
