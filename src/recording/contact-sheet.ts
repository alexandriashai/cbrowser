/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Contact sheet: a single tiled image summarising a recording.
 *
 * A recording can be hundreds of frames, which no MCP response can carry and no
 * reviewer wants to page through. The contact sheet picks an evenly spaced
 * sample, tiles it into a labelled grid, and compresses the result until it
 * fits the MCP response budget — so one image answers "what happened here?".
 *
 * The byte budget is not advisory: an over-budget sheet is never returned, it
 * throws. Silently handing back something the transport will truncate is worse
 * than failing loudly.
 */

import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { MAX_RESPONSE_SIZE } from "../mcp-tools/screenshot-utils.js";

/**
 * Default byte budget, tracking the MCP response limit
 * (`MAX_RESPONSE_SIZE` in src/mcp-tools/screenshot-utils.ts) so the two cannot
 * drift apart.
 */
export const MAX_CONTACT_SHEET_BYTES = MAX_RESPONSE_SIZE;

/** Default number of frames sampled into the sheet. */
export const DEFAULT_MAX_FRAMES = 12;

/**
 * Longest edge of the assembled sheet before the compression ladder starts.
 * Capping here keeps the ladder cheap: a 12-tile grid of 1280x720 frames would
 * otherwise be re-encoded at 5120x2160 several times before shrinking.
 */
export const MAX_SHEET_EDGE = 1600;

/** JPEG quality ladder, mirroring `screenshotCompressed` in src/browser.ts. */
const QUALITY_STEPS = [85, 70, 55, 45, 35, 25];

/**
 * Scale ladder. Runs one step lower than the screenshot ladder because a grid
 * packs far more detail per pixel than a single capture.
 */
const SCALE_STEPS = [1.0, 0.75, 0.5, 0.4, 0.3, 0.2];

/** Sheet background / letterbox colour. */
const BACKGROUND = { r: 12, g: 12, b: 14 };

export interface ContactSheetOptions {
  /** Paths of every frame in the recording, in capture order. */
  framePaths: string[];
  /** Where to write the sheet. A non-JPEG extension is rewritten to `.jpg`. */
  outPath: string;
  /** Grid columns. Defaults to `ceil(sqrt(frames sampled))`. */
  columns?: number;
  /** How many frames to sample. Default {@link DEFAULT_MAX_FRAMES}. */
  maxFrames?: number;
  /** Byte budget for the written file. Default {@link MAX_CONTACT_SHEET_BYTES}. */
  maxBytes?: number;
  /** Burn each frame's index into its tile. Default true. */
  labelIndices?: boolean;
}

export interface ContactSheetResult {
  /** Path actually written (may differ from `outPath` by extension). */
  path: string;
  /** Size of the written file in bytes; always <= the requested budget. */
  bytes: number;
  /** Indices into `framePaths` that were sampled, ascending. */
  frameIndices: number[];
}

/**
 * Pick `k` evenly spaced indices across `n` items.
 *
 * Always includes the first item, and the last item whenever more than one is
 * requested — the ends of a recording are the two frames a reviewer always
 * wants. Returns `min(n, k)` strictly increasing indices, so asking for more
 * frames than exist yields every frame exactly once.
 *
 * @throws if `n` or `k` is not a positive integer.
 */
export function pickEvenlySpaced(n: number, k: number): number[] {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`pickEvenlySpaced: n must be a positive integer, got ${n}`);
  }
  if (!Number.isInteger(k) || k < 1) {
    throw new Error(`pickEvenlySpaced: k must be a positive integer, got ${k}`);
  }

  const m = Math.min(n, k);
  if (m === 1) return [0];

  const step = (n - 1) / (m - 1);
  const picked = new Array<number>(m);
  for (let i = 0; i < m; i++) {
    picked[i] = Math.round(i * step);
  }
  // The ends are pinned rather than derived, so rounding can never move them.
  picked[0] = 0;
  picked[m - 1] = n - 1;
  return picked;
}

/**
 * Overlay carrying every tile's index label.
 *
 * One SVG for the whole sheet rather than one per tile: a single composite
 * layer instead of `k` of them. Text is rendered by sharp's SVG support, so no
 * font or canvas dependency is required.
 */
function buildLabelSvg(
  sheetWidth: number,
  sheetHeight: number,
  tiles: { left: number; top: number; label: string }[],
  tileHeight: number,
): Buffer {
  // Floored at 14px: below that, JPEG chroma subsampling at the low end of the
  // quality ladder smears the glyphs into the badge and the label stops being
  // readable, which defeats the point of burning it in.
  const fontSize = Math.min(28, Math.max(14, Math.round(tileHeight * 0.14)));
  const padding = Math.max(3, Math.round(fontSize * 0.25));
  const boxHeight = fontSize + padding * 2;

  const parts = tiles.map(({ left, top, label }) => {
    const boxWidth = Math.round(fontSize * 0.7 * label.length) + padding * 2;
    const x = left + padding;
    const y = top + padding;
    return (
      `<rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="${padding}" ` +
      `fill="rgba(0,0,0,0.65)"/>` +
      `<text x="${x + padding}" y="${y + fontSize + padding * 0.5}" ` +
      `font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-size="${fontSize}" ` +
      `fill="#ffffff">${label}</text>`
    );
  });

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}">` +
      parts.join("") +
      `</svg>`,
  );
}

/** Force a JPEG extension, matching `screenshotCompressed`'s behaviour. */
function jpegPath(outPath: string): string {
  if (/\.jpe?g$/i.test(outPath)) return outPath;
  return outPath.replace(/\.[^./\\]+$/, "") + ".jpg";
}

/**
 * Build a contact sheet from a recording's frames.
 *
 * Samples with {@link pickEvenlySpaced}, tiles into a grid, optionally labels
 * each tile with its frame index, then walks a scale x quality ladder until the
 * encoded sheet fits `maxBytes`.
 *
 * @throws if `framePaths` is empty, if options are out of range, or if the
 *         sheet cannot be squeezed under the budget even at the floor of the
 *         ladder — the message names the smallest size achieved.
 */
export async function buildContactSheet(opts: ContactSheetOptions): Promise<ContactSheetResult> {
  const {
    framePaths,
    outPath,
    columns,
    maxFrames = DEFAULT_MAX_FRAMES,
    maxBytes = MAX_CONTACT_SHEET_BYTES,
    labelIndices = true,
  } = opts;

  if (framePaths.length === 0) {
    throw new Error("buildContactSheet: framePaths must not be empty");
  }
  if (!outPath) {
    throw new Error("buildContactSheet: outPath is required");
  }
  if (!Number.isInteger(maxFrames) || maxFrames < 1) {
    throw new Error(`buildContactSheet: maxFrames must be a positive integer, got ${maxFrames}`);
  }
  if (columns !== undefined && (!Number.isInteger(columns) || columns < 1)) {
    throw new Error(`buildContactSheet: columns must be a positive integer, got ${columns}`);
  }
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new Error(`buildContactSheet: maxBytes must be positive, got ${maxBytes}`);
  }

  const frameIndices = pickEvenlySpaced(framePaths.length, maxFrames);
  const selected = frameIndices.map((i) => framePaths[i]!);

  const cols = columns ?? Math.ceil(Math.sqrt(selected.length));
  const rows = Math.ceil(selected.length / cols);

  // Every frame of a recording shares the capture geometry, so the first frame
  // sets the tile size for the whole sheet.
  const meta = await sharp(selected[0]!).metadata();
  if (!meta.width || !meta.height) {
    throw new Error(`buildContactSheet: could not read dimensions of ${selected[0]}`);
  }

  let baseWidth = meta.width;
  let baseHeight = meta.height;
  const longestEdge = Math.max(cols * baseWidth, rows * baseHeight);
  if (longestEdge > MAX_SHEET_EDGE) {
    const preScale = MAX_SHEET_EDGE / longestEdge;
    baseWidth = Math.max(1, Math.round(baseWidth * preScale));
    baseHeight = Math.max(1, Math.round(baseHeight * preScale));
  }

  const target = jpegPath(outPath);
  mkdirSync(dirname(target), { recursive: true });

  const render = async (scale: number, quality: number): Promise<Buffer> => {
    const tileWidth = Math.max(1, Math.round(baseWidth * scale));
    const tileHeight = Math.max(1, Math.round(baseHeight * scale));
    const sheetWidth = tileWidth * cols;
    const sheetHeight = tileHeight * rows;

    const placements = selected.map((_, i) => ({
      left: (i % cols) * tileWidth,
      top: Math.floor(i / cols) * tileHeight,
    }));

    const tiles = await Promise.all(
      selected.map((path) =>
        sharp(path)
          .resize(tileWidth, tileHeight, { fit: "contain", background: BACKGROUND })
          .toBuffer(),
      ),
    );

    const layers: OverlayOptions[] = tiles.map((input, i) => ({
      input,
      left: placements[i]!.left,
      top: placements[i]!.top,
    }));

    if (labelIndices) {
      layers.push({
        input: buildLabelSvg(
          sheetWidth,
          sheetHeight,
          placements.map((p, i) => ({ ...p, label: String(frameIndices[i]) })),
          tileHeight,
        ),
        left: 0,
        top: 0,
      });
    }

    return sharp({
      create: { width: sheetWidth, height: sheetHeight, channels: 3, background: BACKGROUND },
    })
      .composite(layers)
      .jpeg({ quality, chromaSubsampling: "4:2:0" })
      .toBuffer();
  };

  let smallest = Number.POSITIVE_INFINITY;
  for (const scale of SCALE_STEPS) {
    for (const quality of QUALITY_STEPS) {
      const buffer = await render(scale, quality);
      if (buffer.length < smallest) smallest = buffer.length;
      if (buffer.length <= maxBytes) {
        writeFileSync(target, buffer);
        return { path: target, bytes: statSync(target).size, frameIndices };
      }
    }
  }

  throw new Error(
    `buildContactSheet: cannot fit ${selected.length} frames within ${maxBytes} bytes — ` +
      `smallest achieved ${smallest} bytes at scale ${SCALE_STEPS[SCALE_STEPS.length - 1]} / ` +
      `quality ${QUALITY_STEPS[QUALITY_STEPS.length - 1]}. Lower maxFrames or raise maxBytes.`,
  );
}
