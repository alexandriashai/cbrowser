/**
 * CBrowser MCP Tools - Inline image fitting
 *
 * Generated overlays (attention heatmaps, comparison maps, motor and story
 * overlays) are full-resolution PNGs of 0.5-1 MB. A tool result has to stay
 * under the host's ~150k-character cap (MAX_RESPONSE_SIZE), or the host swaps
 * the whole result for a file pointer and the JSON beside the image arrives as
 * unparseable text.
 *
 * Those two facts used to be resolved by dropping the picture: an overlay over
 * a fixed budget was left out and named instead, so the tool whose finding IS
 * the picture returned no picture. The PNG is not the only thing that can be
 * shown. This fits a JPEG preview into whatever budget the JSON leaves, and the
 * full-resolution PNG stays in the artifact store for artifact_fetch and the
 * public URL.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import sharp from "sharp";
import { MAX_RESPONSE_SIZE, type ContentBlock, type ImageContent } from "./screenshot-utils.js";

/** A JPEG preview that fits an inline budget. */
export interface InlineImage {
  /** Base64 JPEG, no data-URL prefix. */
  data: string;
  mimeType: "image/jpeg";
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  quality: number;
}

/** Tried at each size, best first. */
const QUALITY_LADDER = [80, 65, 50, 40, 30];

/** Tried in order once no quality fits at the current size. */
const SCALE_LADDER = [1, 0.75, 0.6, 0.5, 0.4, 0.3, 0.25, 0.2];

/** Narrower than this a page overlay shows nothing a reader can use. */
const MIN_PREVIEW_WIDTH = 160;

/** Base64 length of n bytes, exact. */
function base64Length(bytes: number): number {
  return 4 * Math.ceil(bytes / 3);
}

/**
 * Re-encode an image as the largest, best-quality JPEG whose base64 fits in
 * `budgetChars`: the quality ladder at full size first, then each downscale
 * step. Returns null when even the smallest useful preview does not fit, or
 * when the input cannot be decoded.
 */
export async function fitImageForInline(png: Buffer, budgetChars: number): Promise<InlineImage | null> {
  if (!Number.isFinite(budgetChars) || budgetChars <= 0) return null;

  let sourceWidth: number;
  let sourceHeight: number;
  try {
    const meta = await sharp(png).metadata();
    if (!meta.width || !meta.height) return null;
    sourceWidth = meta.width;
    sourceHeight = meta.height;
  } catch {
    return null;
  }

  const lowest = QUALITY_LADDER[QUALITY_LADDER.length - 1];
  for (const scale of SCALE_LADDER) {
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    if (scale < 1 && width < MIN_PREVIEW_WIDTH) break;

    // JPEG has no alpha channel. Flattened onto white explicitly, because the
    // encoder's own default is black and a translucent overlay would darken.
    const encode = (quality: number) => {
      let pipeline = sharp(png).flatten({ background: "#ffffff" });
      if (scale < 1) pipeline = pipeline.resize(width, height);
      return pipeline.jpeg({ quality }).toBuffer();
    };

    // The cheapest rung first: when even the lowest quality misses at this
    // size, no higher quality can fit, so the size is skipped in one encode.
    const floor = await encode(lowest);
    if (base64Length(floor.length) > budgetChars) continue;

    for (const quality of QUALITY_LADDER) {
      const buf = quality === lowest ? floor : await encode(quality);
      if (base64Length(buf.length) <= budgetChars) {
        return {
          data: buf.toString("base64"),
          mimeType: "image/jpeg",
          width,
          height,
          sourceWidth,
          sourceHeight,
          quality,
        };
      }
    }
  }
  return null;
}

/** What a result says about one preview, so the reader knows what it is looking at. */
export interface InlinePreview {
  inline: boolean;
  mimeType?: "image/jpeg";
  /** Preview size, "WxH". */
  size?: string;
  /** Size of the full-resolution original, "WxH". */
  fullSize?: string;
  quality?: number;
  base64Chars?: number;
  note: string;
}

/** An overlay to preview, and where its full-resolution original can be had. */
export interface PreviewSource {
  name: string;
  png: Buffer;
  /** Human-readable pointer to the full-resolution PNG, e.g. "heatmapUrl, or artifact_fetch({ file: heatmapFile })". */
  fullResolution: string;
}

/**
 * Held back from the cap for the preview descriptions written into the JSON
 * after the budget is set, and for the result envelope. Same margin the
 * screenshot path keeps (screenshot-utils RESULT_MARGIN).
 */
export const PREVIEW_RESULT_MARGIN = 6_000;

/** Characters an image block costs beyond its data: {"type":"image","data":"","mimeType":"image/jpeg"} and a separator. */
const IMAGE_BLOCK_OVERHEAD = 64;

/** Serialized size of a set of content blocks, in bytes (never fewer than characters). */
export function contentSize(blocks: unknown[]): number {
  return Buffer.byteLength(JSON.stringify(blocks));
}

function describe(fitted: InlineImage | null, source: PreviewSource, budget: number): InlinePreview {
  if (!fitted) {
    return {
      inline: false,
      note: `No preview fits in this result (${Math.max(0, budget)} characters left for it after the JSON), so this image is NOT in this response. Full resolution: ${source.fullResolution}.`,
    };
  }
  const scaled = fitted.width !== fitted.sourceWidth || fitted.height !== fitted.sourceHeight;
  return {
    inline: true,
    mimeType: fitted.mimeType,
    size: `${fitted.width}x${fitted.height}`,
    fullSize: `${fitted.sourceWidth}x${fitted.sourceHeight}`,
    quality: fitted.quality,
    base64Chars: fitted.data.length,
    note: `The inline image is a ${fitted.width}x${fitted.height} JPEG preview (quality ${fitted.quality}) of the ${fitted.sourceWidth}x${fitted.sourceHeight} PNG, ${scaled ? "downscaled and " : ""}compressed to keep this result under the host's size cap. Full resolution: ${source.fullResolution}.`,
  };
}

/**
 * Build `[text, ...images]` for a result that carries generated overlays.
 *
 * The images share whatever the JSON leaves of the cap, split evenly with any
 * share an earlier image did not use carried to the next. `annotate` receives
 * the preview descriptions (by source name) and returns fields merged into the
 * JSON, so the result states exactly what was attached.
 *
 * The cap is then MEASURED on the finished content, not trusted: if the
 * descriptions pushed it over, the images are refitted into a smaller budget,
 * and if nothing fits the result goes out with no images and says so.
 */
export async function buildContentWithPreviews(
  data: Record<string, unknown>,
  sources: PreviewSource[],
  annotate: (previews: Record<string, InlinePreview>) => Record<string, unknown>,
  opts: { cap?: number; maxCharsPerImage?: number } = {},
): Promise<ContentBlock[]> {
  const cap = opts.cap ?? MAX_RESPONSE_SIZE;
  const textOf = (fields: Record<string, unknown>): ContentBlock =>
    ({ type: "text", text: JSON.stringify({ ...data, ...fields }, null, 2) });

  let reserve = PREVIEW_RESULT_MARGIN;
  for (let attempt = 0; attempt < 3; attempt++) {
    const base = contentSize([textOf({})]);
    let remaining = cap - reserve - base - sources.length * IMAGE_BLOCK_OVERHEAD;

    const blocks: ImageContent[] = [];
    const previews: Record<string, InlinePreview> = {};
    for (let i = 0; i < sources.length; i++) {
      const share = Math.floor(Math.max(0, remaining) / (sources.length - i));
      const budget = opts.maxCharsPerImage !== undefined ? Math.min(share, opts.maxCharsPerImage) : share;
      const fitted = await fitImageForInline(sources[i].png, budget);
      previews[sources[i].name] = describe(fitted, sources[i], budget);
      if (fitted) {
        blocks.push({ type: "image", data: fitted.data, mimeType: fitted.mimeType });
        remaining -= fitted.data.length;
      }
    }

    const content: ContentBlock[] = [textOf(annotate(previews)), ...blocks];
    const size = contentSize(content);
    if (size <= cap) return content;
    reserve += size - cap + 1_000;
  }

  // Unreachable in practice (the margin dwarfs the descriptions), but the cap
  // is a hard limit, so the fallback is a result with no images that says so.
  const none: Record<string, InlinePreview> = {};
  for (const source of sources) none[source.name] = describe(null, source, 0);
  return [textOf(annotate(none))];
}
