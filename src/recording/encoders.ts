/**
 * Recording encoders — turn a directory of captured frames into an animated
 * GIF, an animated WebP, or a video.
 *
 * Two hard constraints shape this module:
 *
 * 1. Frames arrive from a CDP screencast, so they are JPEGs of *differing*
 *    byte length and occasionally differing pixel dimensions (a viewport
 *    change mid-capture re-sizes the stream). Every frame is therefore
 *    normalised to one locked output size before encoding. Do not "optimise"
 *    this into raw-buffer stacking — sharp's animated encoders need a joined
 *    input, and a stacked raw buffer silently produces a single tall page.
 *
 * 2. Capture is event-driven, so frames are *not* evenly spaced. Per-frame
 *    delays come from the caller (derived from frame timestamps), never from
 *    a constant cadence.
 *
 * @since v18.70.0
 */

import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readdirSync, renameSync, rmSync, statSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Writable } from "node:stream";
import sharp from "sharp";

/**
 * How many frames are normalised at once.
 *
 * Every encoder used to run Promise.all over the whole frame list, so a capture
 * held every normalised frame (and, for video, every repeated copy of it) in the
 * Node process at the same moment. Measured 2026-11-12 on a 1920x1080 page:
 * webm at fps 100 for 10 s took Node from 74 to 1,899 MB, and the hosted
 * server is one process for every account (leaks-static-1). A small window
 * keeps sharp busy without holding more than a few frames.
 */
export const NORMALISE_CONCURRENCY = 4;

/**
 * Frames per animated GIF/WebP encode, at about one megapixel per frame. A
 * longer capture is encoded in batches and the batches are joined into one
 * file, so memory follows the batch, not the capture. Captures that fit in one
 * batch take the single encode they always did, byte for byte.
 */
export const ANIMATED_BATCH_FRAMES = 32;

/**
 * Pixels one batch may hold. A batch costs memory by pixels, not by frames:
 * measured 2026-11-12, a 32-frame batch at 1280x800 peaked about 170 MB above
 * the starting RSS, so a 4K frame gets a proportionally smaller batch.
 */
const ANIMATED_BATCH_PIXELS = ANIMATED_BATCH_FRAMES * 1_024_000;

/** Frames per batch for a given output size: never above 32, never below 2. */
export function animatedBatchFrames(width: number, height: number): number {
  const byPixels = Math.floor(ANIMATED_BATCH_PIXELS / Math.max(1, width * height));
  return Math.max(2, Math.min(ANIMATED_BATCH_FRAMES, byPixels));
}

/** ffmpeg output kept for an error message; it never needs more. */
const FFMPEG_OUTPUT_CAP = 64 * 1024;

/** Map with at most `limit` calls in flight, results in input order. */
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  for (let start = 0; start < items.length; start += limit) {
    const slice = items.slice(start, start + limit);
    const done = await Promise.all(slice.map((item, k) => fn(item, start + k)));
    for (let k = 0; k < done.length; k++) out[start + k] = done[k]!;
  }
  return out;
}

/** Result of a successful encode. */
export interface EncodeResult {
  /** Absolute path to the encoded artifact. */
  path: string;
  /** Size of the artifact in bytes. */
  bytes: number;
  /** Number of frames encoded. */
  frames: number;
  /** Locked output width in pixels. */
  width: number;
  /** Locked output height in pixels. */
  height: number;
}

export interface EncodeOptions {
  /** Locked output width. Defaults to the first frame's width. */
  width?: number;
  /** Locked output height. Defaults to the first frame's height. */
  height?: number;
  /**
   * Per-frame source crop, parallel to `frames`. Screencast frames are written
   * to disk full-viewport so a capture can be re-cropped later, so region and
   * element captures crop here at encode time rather than at capture time.
   * A crop that falls outside its frame is trimmed to the frame.
   */
  crops?: { x: number; y: number; width: number; height: number }[];
  /** Downscale factor applied to the locked size (0 < scale <= 1). */
  scale?: number;
  /** Loop count for animated formats (0 = infinite, the default). */
  loop?: number;
}

/**
 * Thrown when an encoder's external dependency is missing. Callers surface the
 * message verbatim and exit non-zero — recording itself has already succeeded
 * at this point, so this must never be swallowed into a silent partial result.
 */
export class MissingEncoderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingEncoderError";
  }
}

// =========================================================================
// Frame normalisation
// =========================================================================

/**
 * Resolve the locked output dimensions from the first frame, honouring any
 * caller override and forcing even numbers (video encoders reject odd sizes).
 */
async function lockDimensions(
  firstFrame: string,
  options: EncodeOptions,
  requireEven = false,
): Promise<{ width: number; height: number }> {
  const meta = await sharp(firstFrame).metadata();
  const firstCrop = options.crops?.[0];
  const baseWidth = options.width ?? firstCrop?.width ?? meta.width;
  const baseHeight = options.height ?? firstCrop?.height ?? meta.height;

  if (!baseWidth || !baseHeight) {
    throw new Error(`Cannot determine frame dimensions from ${firstFrame}`);
  }

  const scale = options.scale ?? 1;
  if (scale <= 0 || scale > 1) {
    throw new Error(`Invalid scale ${scale} - must be > 0 and <= 1`);
  }

  const width = Math.max(1, Math.round(baseWidth * scale));
  const height = Math.max(1, Math.round(baseHeight * scale));

  // Only the video path forces even dimensions - yuv420p subsampling requires
  // them. Applying that rounding to GIF/WebP made a 393px-wide iPhone capture
  // emit a 394px artifact, and a one-pixel drift from the declared viewport is
  // exactly what breaks a pixel-exact visual baseline for no real reason.
  if (!requireEven) return { width, height };
  return {
    width: Math.max(2, Math.round(width / 2) * 2),
    height: Math.max(2, Math.round(height / 2) * 2),
  };
}

/**
 * Normalise one frame to the locked size. `fit: "contain"` preserves aspect
 * ratio and letterboxes rather than distorting - a frame that arrived at a
 * different viewport size should look small, not stretched.
 */
async function normaliseFrame(
  framePath: string,
  width: number,
  height: number,
  crop?: { x: number; y: number; width: number; height: number },
): Promise<Buffer> {
  let pipeline = sharp(framePath);

  if (crop) {
    // The crop is trimmed to the frame it is being applied to: an element that
    // drifts partly off-screen still yields the visible part rather than
    // failing the whole encode on a sharp extract_area error.
    const meta = await pipeline.metadata();
    const frameWidth = meta.width ?? width;
    const frameHeight = meta.height ?? height;
    const left = Math.max(0, Math.min(Math.round(crop.x), frameWidth - 1));
    const top = Math.max(0, Math.min(Math.round(crop.y), frameHeight - 1));
    const extractWidth = Math.max(1, Math.min(Math.round(crop.width), frameWidth - left));
    const extractHeight = Math.max(1, Math.min(Math.round(crop.height), frameHeight - top));
    pipeline = pipeline.extract({ left, top, width: extractWidth, height: extractHeight });
  }

  return pipeline
    .resize(width, height, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .png()
    .toBuffer();
}

/** Validate the frames/delays pairing shared by every animated encoder. */
function assertEncodable(frames: string[], delays: number[], label: string): void {
  if (frames.length === 0) {
    throw new Error(`Cannot encode ${label}: no frames`);
  }
  if (delays.length !== frames.length) {
    throw new Error(
      `Cannot encode ${label}: ${frames.length} frames but ${delays.length} delays - ` +
        `delays must be derived per-frame from capture timestamps`,
    );
  }
  const missing = frames.filter((f) => !existsSync(f));
  if (missing.length > 0) {
    throw new Error(`Cannot encode ${label}: ${missing.length} frame file(s) missing, first: ${missing[0]}`);
  }
}

// =========================================================================
// Animated image encoders (sharp)
// =========================================================================

/**
 * Encode frames into an animated GIF with per-frame delays.
 *
 * A single-frame recording (a static page that emitted no screencast events)
 * encodes to a one-page GIF rather than failing.
 */
export async function encodeGif(
  frames: string[],
  delays: number[],
  outPath: string,
  options: EncodeOptions = {},
): Promise<EncodeResult> {
  return encodeAnimated("gif", frames, delays, outPath, options);
}

/** Encode frames into an animated WebP with per-frame delays. */
export async function encodeWebp(
  frames: string[],
  delays: number[],
  outPath: string,
  options: EncodeOptions = {},
): Promise<EncodeResult> {
  return encodeAnimated("webp", frames, delays, outPath, options);
}

/** One sharp animated encode of a run of frames, ready for toFile or toBuffer. */
async function encodeAnimatedRun(
  kind: "gif" | "webp",
  frames: string[],
  delays: number[],
  crops: EncodeOptions["crops"],
  offset: number,
  width: number,
  height: number,
  loop: number,
): Promise<ReturnType<typeof sharp>> {
  const normalised = await mapLimited(frames, NORMALISE_CONCURRENCY, (f, i) =>
    normaliseFrame(f, width, height, crops?.[offset + i]));
  const delay = delays.map((d) => Math.max(10, Math.round(d)));
  const joined = sharp(normalised, { join: { animated: true } });
  return kind === "gif" ? joined.gif({ delay, loop }) : joined.webp({ delay, loop });
}

/**
 * Split `count` frames into runs of at most `size`, none shorter than two:
 * sharp refuses to join a single image, so a lone last frame joins the run
 * before it.
 */
export function animatedBatches(count: number, size = ANIMATED_BATCH_FRAMES): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  for (let start = 0; start < count; start += size) runs.push([start, Math.min(count, start + size)]);
  const last = runs[runs.length - 1];
  if (runs.length > 1 && last && last[1] - last[0] < 2) {
    runs.pop();
    runs[runs.length - 1]![1] = count;
  }
  return runs;
}

async function encodeAnimated(
  kind: "gif" | "webp",
  frames: string[],
  delays: number[],
  outPath: string,
  options: EncodeOptions,
): Promise<EncodeResult> {
  assertEncodable(frames, delays, kind === "gif" ? "GIF" : "WebP");
  const { width, height } = await lockDimensions(frames[0], options);
  const loop = options.loop ?? 0;

  const batchFrames = animatedBatchFrames(width, height);

  // Short captures: the one encode they always had, so their output is unchanged.
  if (frames.length <= batchFrames) {
    await (await encodeAnimatedRun(kind, frames, delays, options.crops, 0, width, height, loop)).toFile(outPath);
    return { path: outPath, bytes: statSync(outPath).size, frames: frames.length, width, height };
  }

  // Longer ones: encode a batch, append its frames to the file, drop it, next.
  // Written beside the target and renamed, so a failed encode leaves no
  // half-written artifact that looks finished.
  const partial = `${outPath}.partial`;
  const writer = kind === "gif" ? new GifSplicer(partial) : new WebpSplicer(partial);
  try {
    for (const [start, end] of animatedBatches(frames.length, batchFrames)) {
      const run = await encodeAnimatedRun(
        kind, frames.slice(start, end), delays.slice(start, end), options.crops, start, width, height, loop);
      writer.append(await run.toBuffer());
    }
    writer.finish();
    renameSync(partial, outPath);
  } catch (err) {
    writer.abort();
    rmSync(partial, { force: true });
    throw err;
  }
  return { path: outPath, bytes: statSync(outPath).size, frames: frames.length, width, height };
}

/** Appends to a file through one descriptor, tracking the offset. */
class FileAppender {
  private fd: number | null;
  offset = 0;
  constructor(path: string) {
    this.fd = openSync(path, "w");
  }
  write(bytes: Buffer): void {
    if (this.fd === null) throw new Error("writer already closed");
    let at = 0;
    while (at < bytes.length) at += writeSync(this.fd, bytes, at, bytes.length - at);
    this.offset += bytes.length;
  }
  writeAt(bytes: Buffer, position: number): void {
    if (this.fd === null) throw new Error("writer already closed");
    writeSync(this.fd, bytes, 0, bytes.length, position);
  }
  close(): void {
    if (this.fd !== null) closeSync(this.fd);
    this.fd = null;
  }
}

/** Size in bytes of a GIF colour table from a packed field's low three bits. */
function gifTableBytes(packed: number): number {
  return 3 << ((packed & 7) + 1);
}

/** Offset just past a run of GIF data sub-blocks starting at `at`. */
function skipGifSubBlocks(buf: Buffer, at: number): number {
  let pos = at;
  while (pos < buf.length && buf[pos] !== 0) pos += buf[pos]! + 1;
  if (pos >= buf.length) throw new Error("GIF data runs past the end of the buffer");
  return pos + 1;
}

/**
 * Joins GIFs that sharp encoded batch by batch into one animation.
 *
 * The first batch is written as sharp wrote it, minus its trailer. Each later
 * batch contributes its frames only: its looping extension is dropped (the
 * first one's stands), and a frame that used that batch's global colour table
 * carries the table as its own local one, because each batch quantises its own
 * palette. The first frame of every batch is a whole frame, so no frame depends
 * on one from another batch.
 */
class GifSplicer {
  private out: FileAppender;
  private batches = 0;
  constructor(path: string) {
    this.out = new FileAppender(path);
  }

  append(buf: Buffer): void {
    if (buf.length < 14 || buf.toString("ascii", 0, 3) !== "GIF") throw new Error("encoder did not return a GIF");
    const screenPacked = buf[10]!;
    let pos = 13;
    const gct = screenPacked & 0x80 ? buf.subarray(pos, pos + gifTableBytes(screenPacked)) : null;
    if (gct) pos += gct.length;

    const parts: Buffer[] = [];
    while (pos < buf.length && buf[pos] !== 0x3b) {
      const start = pos;
      if (buf[pos] === 0x21) {
        const label = buf[pos + 1];
        pos = skipGifSubBlocks(buf, pos + 2);
        // Application extensions (the loop count) come from the first batch only.
        if (label !== 0xff) parts.push(buf.subarray(start, pos));
      } else if (buf[pos] === 0x2c) {
        const packed = buf[pos + 9]!;
        let dataAt = pos + 10;
        if (packed & 0x80) dataAt += gifTableBytes(packed);
        pos = skipGifSubBlocks(buf, dataAt + 1);
        if (!(packed & 0x80) && gct) {
          const descriptor = Buffer.from(buf.subarray(start, start + 10));
          descriptor[9] = (packed & 0x40) | 0x80 | (screenPacked & 7);
          parts.push(descriptor, gct, buf.subarray(dataAt, pos));
        } else {
          parts.push(buf.subarray(start, pos));
        }
      } else {
        throw new Error(`unexpected GIF block 0x${buf[pos]!.toString(16)} at ${pos}`);
      }
    }
    if (pos >= buf.length) throw new Error("GIF has no trailer");

    if (this.batches === 0) this.out.write(buf.subarray(0, pos));
    else for (const part of parts) this.out.write(part);
    this.batches++;
  }

  finish(): void {
    this.out.write(Buffer.from([0x3b]));
    this.out.close();
  }

  abort(): void {
    this.out.close();
  }
}

/**
 * Joins animated WebPs that sharp encoded batch by batch into one file.
 *
 * The file is RIFF: a VP8X header, one ANIM chunk (background and loop count)
 * and one ANMF chunk per frame. The headers come from the first batch and every
 * batch adds its ANMF chunks; each batch starts on a key frame, so its frames
 * decode without the previous batch. The RIFF size and the VP8X alpha flag are
 * known only at the end and are written back then.
 */
class WebpSplicer {
  private out: FileAppender;
  private batches = 0;
  private flags = 0;
  constructor(path: string) {
    this.out = new FileAppender(path);
  }

  append(buf: Buffer): void {
    if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") {
      throw new Error("encoder did not return a WebP");
    }
    let vp8x: Buffer | null = null;
    let anim: Buffer | null = null;
    const frames: Buffer[] = [];
    let pos = 12;
    while (pos + 8 <= buf.length) {
      const id = buf.toString("ascii", pos, pos + 4);
      const size = buf.readUInt32LE(pos + 4);
      const end = pos + 8 + size + (size & 1);
      if (end > buf.length) throw new Error(`WebP chunk ${id} runs past the end of the buffer`);
      const chunk = buf.subarray(pos, end);
      if (id === "VP8X") vp8x = chunk;
      else if (id === "ANIM") anim = chunk;
      else if (id === "ANMF") frames.push(chunk);
      pos = end;
    }
    if (!vp8x || !anim || frames.length === 0) throw new Error("encoder did not return an animated WebP");
    // Only animation and alpha are carried; metadata chunks are not copied.
    this.flags |= vp8x[8]! & 0x12;

    if (this.batches === 0) {
      this.out.write(Buffer.from("RIFF\0\0\0\0WEBP", "latin1"));
      this.out.write(vp8x);
      this.out.write(anim);
    }
    for (const frame of frames) this.out.write(frame);
    this.batches++;
  }

  finish(): void {
    const size = Buffer.alloc(4);
    size.writeUInt32LE(this.out.offset - 8);
    this.out.writeAt(size, 4);
    // VP8X flags byte: 12 bytes of RIFF header plus the chunk's own 8.
    this.out.writeAt(Buffer.from([this.flags]), 20);
    this.out.close();
  }

  abort(): void {
    this.out.close();
  }
}

// =========================================================================
// ffmpeg resolution
// =========================================================================

/**
 * Locate Playwright's bundled ffmpeg. A bare `ffmpeg` is never invoked: the
 * PATH binary is not guaranteed to exist on deploy targets, and silently
 * picking up an arbitrary system build makes output non-reproducible.
 *
 * Probe order: $PLAYWRIGHT_BROWSERS_PATH, then the per-user cache directories.
 */
export function resolveFfmpegPath(): string | null {
  const override = process.env.CBROWSER_FFMPEG_PATH;
  if (override && existsSync(override)) return override;

  const roots: string[] = [];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) roots.push(process.env.PLAYWRIGHT_BROWSERS_PATH);
  roots.push(join(homedir(), ".cache", "ms-playwright"));

  for (const root of roots) {
    if (!existsSync(root)) continue;
    let entries: string[];
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries.filter((e) => e.startsWith("ffmpeg-")).sort().reverse()) {
      for (const bin of ["ffmpeg-linux", "ffmpeg-mac", "ffmpeg-win64.exe"]) {
        const candidate = join(root, entry, bin);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

/**
 * Start ffmpeg. `input` is what the caller writes to its stdin; `done` settles
 * when it exits, with stdout and stderr (the first FFMPEG_OUTPUT_CAP bytes).
 */
function startFfmpeg(bin: string, args: string[]): { input: Writable; done: Promise<{ code: number; output: string }> } {
  const proc = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  const collect = (d: Buffer) => { if (output.length < FFMPEG_OUTPUT_CAP) output += d.toString(); };
  proc.stdout.on("data", collect);
  proc.stderr.on("data", collect);
  // ffmpeg may exit before a write drains; the write itself reports that.
  proc.stdin.on("error", () => { /* surfaced through writeWithBackpressure and the exit code */ });
  const done = new Promise<{ code: number; output: string }>((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (code) => resolve({ code: code ?? -1, output }));
  });
  return { input: proc.stdin, done };
}

/** Run ffmpeg with no input and collect stdout+stderr. */
function runFfmpeg(bin: string, args: string[]): Promise<{ code: number; output: string }> {
  const { input, done } = startFfmpeg(bin, args);
  input.end();
  return done;
}

/**
 * Write one chunk and wait until the pipe can take more. Rejects when the
 * reader has gone, so a dead ffmpeg ends the encode instead of buffering the
 * rest of the capture in memory.
 */
export function writeWithBackpressure(stream: Writable, chunk: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    if (stream.destroyed || !stream.writable) {
      reject(new Error("ffmpeg closed its input before the encode finished"));
      return;
    }
    if (stream.write(chunk)) {
      resolve();
      return;
    }
    const cleanup = () => {
      stream.off("drain", onDrain);
      stream.off("error", onError);
      stream.off("close", onClose);
    };
    const onDrain = () => { cleanup(); resolve(); };
    const onError = (err: Error) => { cleanup(); reject(err); };
    const onClose = () => { cleanup(); reject(new Error("ffmpeg closed its input before the encode finished")); };
    stream.on("drain", onDrain);
    stream.on("error", onError);
    stream.on("close", onClose);
  });
}

/** Cached capability probe of a resolved ffmpeg binary. */
const capabilityCache = new Map<string, { muxers: Set<string>; encoders: Set<string> }>();

async function ffmpegCapabilities(bin: string): Promise<{ muxers: Set<string>; encoders: Set<string> }> {
  const cached = capabilityCache.get(bin);
  if (cached) return cached;

  const parse = (text: string): Set<string> => {
    const names = new Set<string>();
    for (const line of text.split("\n")) {
      const match = line.match(/^\s*[A-Z. ]{2,6}\s+(\S+)/);
      if (match) names.add(match[1]);
    }
    return names;
  };

  const [muxers, encoders] = await Promise.all([
    runFfmpeg(bin, ["-hide_banner", "-muxers"]),
    runFfmpeg(bin, ["-hide_banner", "-encoders"]),
  ]);

  const caps = { muxers: parse(muxers.output), encoders: parse(encoders.output) };
  capabilityCache.set(bin, caps);
  return caps;
}

/**
 * Resample variable-delay frames onto a constant-rate timeline by repeating
 * each frame for as long as it was on screen. Video containers assume a fixed
 * frame rate; repeating is how event-driven capture maps onto one without
 * inventing content that was never displayed.
 */
export function resampleToConstantRate(frames: string[], delays: number[], fps: number): string[] {
  const timeline: string[] = [];
  const repeats = constantRateRepeats(frames.length, delays, fps);
  for (let i = 0; i < frames.length; i++) {
    for (let r = 0; r < repeats[i]!; r++) timeline.push(frames[i]);
  }
  return timeline;
}

/**
 * How many times each frame is shown on a constant-rate timeline: the counts
 * resampleToConstantRate expands to, without building the expanded list. The
 * video encoder writes each frame that many times rather than materialising
 * the repeats.
 */
export function constantRateRepeats(count: number, delays: number[], fps: number): number[] {
  const frameMs = 1000 / fps;
  const repeats: number[] = [];
  for (let i = 0; i < count; i++) repeats.push(Math.max(1, Math.round((delays[i] ?? frameMs) / frameMs)));
  return repeats;
}

/**
 * Encode frames into a video via an ffmpeg-family binary.
 *
 * `container` selects the muxer/encoder pair. Playwright's bundled ffmpeg is a
 * stripped build that ships only the WebM muxer and the libvpx (VP8) encoder,
 * so "webm" works out of the box and "mp4" requires a fuller ffmpeg.
 */
async function encodeVideo(
  frames: string[],
  delays: number[],
  outPath: string,
  container: "webm" | "mp4",
  options: EncodeOptions & { fps?: number } = {},
): Promise<EncodeResult> {
  assertEncodable(frames, delays, container.toUpperCase());

  const bin = resolveFfmpegPath();
  if (!bin) {
    throw new MissingEncoderError(
      `Cannot encode ${container.toUpperCase()}: no ffmpeg binary found. ` +
        `Looked for Playwright's bundled ffmpeg under $PLAYWRIGHT_BROWSERS_PATH and ` +
        `${join(homedir(), ".cache", "ms-playwright")}/ffmpeg-*/. ` +
        `Install it with 'cbrowser install-browsers ffmpeg', or re-run with --format gif,webp.`,
    );
  }

  const caps = await ffmpegCapabilities(bin);
  const wanted = container === "webm"
    ? { muxer: "webm", encoders: ["libvpx", "libvpx-vp9"] }
    : { muxer: "mp4", encoders: ["libx264", "libopenh264", "h264_videotoolbox", "mpeg4"] };

  const encoder = wanted.encoders.find((e) => caps.encoders.has(e));
  if (!caps.muxers.has(wanted.muxer) || !encoder) {
    const missing = [
      !caps.muxers.has(wanted.muxer) ? `muxer '${wanted.muxer}'` : null,
      !encoder ? `video encoder (need one of: ${wanted.encoders.join(", ")})` : null,
    ].filter(Boolean).join(" and ");
    throw new MissingEncoderError(
      `Cannot encode ${container.toUpperCase()}: ${bin} is missing ${missing}. ` +
        `Playwright's bundled ffmpeg is a stripped build (WebM/VP8 only). ` +
        `Install a full ffmpeg and set CBROWSER_FFMPEG_PATH, or re-run with --format ${container === "mp4" ? "webm" : "gif"}.`,
    );
  }

  const { width, height } = await lockDimensions(frames[0], options, true);
  const fps = options.fps ?? 10;
  // Each frame is shown for as many slots of the constant-rate timeline as it
  // was on screen. The timeline is never built: a frame is converted once and
  // its JPEG written once per slot, so memory holds a few frames whatever the
  // fps and duration. It used to be built in full (Promise.all over every
  // slot, then Buffer.concat of all of them), and a static page at fps 100
  // for 10 s became 1,000 JPEGs in memory at once (leaks-static-1).
  const repeats = constantRateRepeats(frames.length, delays, fps);

  // Frames are normalised to identical JPEG dimensions and sent as one mjpeg
  // stream; the stripped build has only the image2pipe demuxer, and it needs
  // the decoder named explicitly when reading from a pipe.
  const args = [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(fps), "-i", "pipe:0",
    "-c:v", encoder,
    "-pix_fmt", "yuv420p",
    "-an",
    outPath,
  ];

  const { input, done } = startFfmpeg(bin, args);
  let slots = 0;
  // A frame that will not convert is our failure; a pipe that closed is
  // ffmpeg's, and its exit code and output say why.
  let frameError: Error | null = null;
  let pipeError: Error | null = null;
  try {
    for (let start = 0; start < frames.length && !pipeError; start += NORMALISE_CONCURRENCY) {
      const indexes = frames.slice(start, start + NORMALISE_CONCURRENCY).map((_, k) => start + k);
      const jpegs = await Promise.all(indexes.map(async (i) =>
        sharp(await normaliseFrame(frames[i]!, width, height, options.crops?.[i]))
          .jpeg({ quality: 90 })
          .toBuffer()));
      for (let k = 0; k < indexes.length && !pipeError; k++) {
        for (let r = 0; r < repeats[indexes[k]!]!; r++) {
          try {
            await writeWithBackpressure(input, jpegs[k]!);
          } catch (err) {
            pipeError = err as Error;
            break;
          }
          slots++;
        }
      }
    }
  } catch (err) {
    frameError = err as Error;
  }
  if (frameError || pipeError) input.destroy();
  else input.end();

  let exit: { code: number; output: string };
  try {
    exit = await done;
  } catch (err) {
    rmSync(outPath, { force: true });
    throw err;
  }
  const { code, output } = exit;
  if (frameError || pipeError || code !== 0 || !existsSync(outPath)) {
    // Never leave a truncated video where a finished one would be.
    rmSync(outPath, { force: true });
    if (frameError) throw frameError;
    throw new Error(`ffmpeg failed encoding ${container} (exit ${code}): ${output.trim() || pipeError?.message || "no output"}`);
  }

  return { path: outPath, bytes: statSync(outPath).size, frames: slots, width, height };
}

/** Encode frames into a WebM/VP8 video. Works with Playwright's bundled ffmpeg. */
export async function encodeWebm(
  frames: string[],
  delays: number[],
  outPath: string,
  options: EncodeOptions & { fps?: number } = {},
): Promise<EncodeResult> {
  return encodeVideo(frames, delays, outPath, "webm", options);
}

/**
 * Encode frames into an MP4.
 *
 * Requires an ffmpeg with the mp4 muxer and an H.264-family encoder. Playwright's
 * bundled binary has neither, so this throws {@link MissingEncoderError} unless a
 * fuller ffmpeg is installed.
 */
export async function encodeMp4(
  frames: string[],
  delays: number[],
  outPath: string,
  options: EncodeOptions & { fps?: number } = {},
): Promise<EncodeResult> {
  return encodeVideo(frames, delays, outPath, "mp4", options);
}
