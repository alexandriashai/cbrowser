/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Screenshots
 *
 * Screenshots, clipping, and fitting a JPEG to a byte budget.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { getRemoteMode, MAX_RESPONSE_SIZE } from "../mcp-tools/screenshot-utils.js";
import { clampRect } from "../recording/timing.js";
import { uniqueStamp } from "../temp-files.js";
import type { ScreenshotOptions, FittedJpeg, ClipRect } from "./helpers.js";
import type { CBrowser } from "../browser.js";

// =========================================================================
// Screenshots
// =========================================================================

export async function screenshot(this: CBrowser, path?: string, options?: ScreenshotOptions): Promise<string> {
  const page = await this.getPage();
  const opts = options || {};
  // A stale record must never describe a newer file.
  this._lastScreenshotInfo = undefined;

  // In remote mode, auto-enable compression to stay under Claude.ai's 200KB limit
  // unless explicitly disabled
  const useCompression = opts.compress ??
    (getRemoteMode() && opts.compress !== false);

  // If compression requested, maxSize specified, or in remote mode
  if (useCompression || opts.maxSize) {
    const compressionOpts = {
      ...opts,
      compress: true,
      // Reserve room for the JSON the image ships beside.
      //
      // This targeted MAX_RESPONSE_SIZE / 1.37, which compresses the image
      // to fill the entire response budget on its own -- a measured 144,731
      // base64 characters against a 150k cap, 96.7% of it, leaving nothing
      // for the payload. Anything but the barest JSON then tipped the result
      // over, at which point the host swaps in a file pointer and the whole
      // thing arrives unreadable.
      maxSize: opts.maxSize || Math.floor((MAX_RESPONSE_SIZE - 28_000) / 1.37),
    };
    return this.screenshotCompressed(path, compressionOpts);
  }

  // Time plus random bits (src/temp-files.ts): two screenshots of one account
  // in the same millisecond, from two browsers, wrote one file and each
  // returned it.
  const filename = path || join(this.paths.screenshotsDir, `screenshot-${uniqueStamp()}.png`);

  const clip = opts.clip ? await this.resolveClip(opts) : undefined;
  await page.screenshot({ path: filename, fullPage: opts.fullPage || false, ...(clip ? { clip } : {}) });
  return filename;
}

export async function resolveClip(this: CBrowser, opts: ScreenshotOptions): Promise<ClipRect | undefined> {
  if (!opts.clip) return undefined;
  const page = await this.getPage();
  const viewport = page.viewportSize() || { width: 1280, height: 800 };
  const bounds = opts.fullPage
    ? await page.evaluate(() => ({
        width: Math.max(document.documentElement.scrollWidth, window.innerWidth),
        height: Math.max(document.documentElement.scrollHeight, window.innerHeight),
      }))
    : viewport;

  const { rect, clamped } = clampRect(opts.clip, bounds);
  if (clamped && this.config.verbose) {
    console.log(`  Clip clamped to capture area (${bounds.width}x${bounds.height}): ` +
      `{x:${opts.clip.x}, y:${opts.clip.y}, w:${opts.clip.width}, h:${opts.clip.height}} -> ` +
      `{x:${rect.x}, y:${rect.y}, w:${rect.width}, h:${rect.height}}`);
  }
  return rect;
}

export async function screenshotCompressed(this: CBrowser, path?: string, options?: ScreenshotOptions): Promise<string> {
  const page = await this.getPage();
  const maxSize = options?.maxSize || 110000; // ~150KB after base64 (110KB raw = ~150KB base64)
  const fullPage = options?.fullPage || false;
  const startQuality = options?.quality || 85;

  // Generate filename with .jpg extension
  const baseFilename = path || join(this.paths.screenshotsDir, `screenshot-${uniqueStamp()}`);
  const filename = baseFilename.endsWith('.jpg') || baseFilename.endsWith('.jpeg')
    ? baseFilename
    : baseFilename.replace(/\.png$/, '') + '.jpg';

  const clip = options?.clip ? await this.resolveClip(options) : undefined;

  // BUG-02 (2026-10-07): the budget is met by the IMAGE, never the viewport.
  //
  // This used to call page.setViewportSize on the caller's live page at
  // 0.75 / 0.5 / 0.4 / 0.3 of its size and back. That reflowed the page for
  // real: navigate on cbrowser.ai fired resizes ["960x600","1280x800",
  // "640x400","1280x800"] and returned a 640px picture of the hamburger nav,
  // a layout the DOM tools never saw, and anything that reacts to resize
  // (open menus, carousels) reacted. The quality ladder meant to run first
  // was dead behind an inverted skip guard, so a page over budget at q85 went
  // straight to 960px even when q55 fitted at full size.
  //
  // So: one capture, at the caller's viewport, then fit it in memory.
  const source = await page.screenshot({
    fullPage,
    type: 'jpeg',
    quality: startQuality,
    ...(clip ? { clip } : {}),
  });

  let fitted: FittedJpeg | undefined;
  try {
    fitted = await this.fitJpegToBudget(source, maxSize, startQuality);
  } catch { /* sharp failed: an oversized screenshot still beats no screenshot */ }
  const out = fitted?.buffer ?? source;

  // page.screenshot({ path }) created missing directories; keep that for
  // callers that pass a path of their own.
  mkdirSync(dirname(filename), { recursive: true });
  writeFileSync(filename, out);

  if (fitted) {
    this._lastScreenshotInfo = {
      path: filename,
      width: fitted.width,
      height: fitted.height,
      sourceWidth: fitted.sourceWidth,
      sourceHeight: fitted.sourceHeight,
      downscaled: fitted.width < fitted.sourceWidth,
      quality: fitted.quality,
      bytes: out.length,
      maxSize,
    };
  }
  if (this.config.verbose) {
    const dims = fitted ? ` ${fitted.width}x${fitted.height} of ${fitted.sourceWidth}x${fitted.sourceHeight}, quality=${fitted.quality},` : '';
    console.log(`  Screenshot:${dims} ${out.length} bytes (target ${maxSize})`);
  }

  return filename;
}

export async function fitJpegToBudget(this: CBrowser, source: Buffer, maxSize: number, startQuality: number): Promise<FittedJpeg> {
  const sharp = (await import("sharp")).default;
  const meta = await sharp(source).metadata();
  const sourceWidth = meta.width ?? 0;
  const sourceHeight = meta.height ?? 0;
  let best: FittedJpeg = { buffer: source, width: sourceWidth, height: sourceHeight, sourceWidth, sourceHeight, quality: startQuality };
  if (source.length <= maxSize || !sourceWidth) return best;

  const QUALITY_FLOOR = 55;
  const READABLE_WIDTH = 700;
  const MIN_WIDTH = 200;

  // Decoded once; no attempt starts from another attempt's output.
  const { data, info } = await sharp(source).raw().toBuffer({ resolveWithObject: true });
  const raw = { width: info.width, height: info.height, channels: info.channels };
  const attempt = async (width: number, quality: number): Promise<FittedJpeg> => {
    let img = sharp(data, { raw });
    if (width < sourceWidth) img = img.resize({ width });
    const enc = await img.jpeg({ quality }).toBuffer({ resolveWithObject: true });
    const result = { buffer: enc.data, width: enc.info.width, height: enc.info.height, sourceWidth, sourceHeight, quality };
    if (result.buffer.length < best.buffer.length) best = result;
    return result;
  };

  let width = sourceWidth;
  let lastBytes = source.length;
  const atThisWidth = async (qualities: number[]): Promise<FittedJpeg | undefined> => {
    for (const q of qualities) {
      const r = await attempt(width, q);
      if (r.buffer.length <= maxSize) return r;
    }
    return undefined;
  };
  const narrower = async (floor: number, qualities: number[]): Promise<FittedJpeg | undefined> => {
    while (width > floor) {
      // Bytes scale roughly with area, so width with the square root of the
      // overshoot. At least 10% narrower each pass, so the loop always ends.
      const target = Math.floor(width * Math.sqrt(maxSize / lastBytes) * 0.95);
      width = Math.max(floor, Math.min(Math.floor(width * 0.9), target));
      for (const q of qualities) {
        const r = await attempt(width, q);
        if (r.buffer.length <= maxSize) return r;
        lastBytes = r.buffer.length;
      }
    }
    return undefined;
  };

  const fullSize = [70, QUALITY_FLOOR].filter((q) => q < startQuality);
  const ladder = fullSize.length > 0 ? fullSize : [startQuality];
  const floorQuality = ladder[ladder.length - 1]!;
  if (fullSize.length > 0) {
    const r = await atThisWidth(fullSize);
    if (r) return r;
    lastBytes = best.buffer.length;
  }
  return (await narrower(Math.min(READABLE_WIDTH, width), ladder))
    ?? (await atThisWidth([45, 35].filter((q) => q < floorQuality)))
    ?? (await narrower(Math.min(MIN_WIDTH, width), [floorQuality]))
    ?? (await atThisWidth([45, 35, 25].filter((q) => q < floorQuality)))
    ?? best;
}
