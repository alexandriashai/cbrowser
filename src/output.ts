/**
 * CBrowser Output Formatting System
 *
 * Provides accessible output modes for CLI:
 * - Default: Full color + emoji (unchanged behavior)
 * - --no-color / NO_COLOR: Strip ANSI color codes
 * - --plain: Strip emoji, box-drawing, and unicode decorations
 * - --json: Structured JSON output on stdout
 *
 * Follows the NO_COLOR standard (https://no-color.org)
 */

import { writeSync } from "node:fs";

export interface OutputOptions {
  /** Suppress ANSI color codes */
  noColor: boolean;
  /** Suppress emoji, box-drawing, and unicode decorations */
  plain: boolean;
  /** Output structured JSON instead of human-readable text */
  json: boolean;
}

/** Singleton output options — set once at CLI startup */
let globalOptions: OutputOptions = {
  noColor: false,
  plain: false,
  json: false,
};

/**
 * Detect output mode from CLI flags and environment variables.
 * Precedence: --no-color flag > NO_COLOR env > TERM=dumb > TTY detection
 */
export function detectOutputOptions(cliOptions: Record<string, string | boolean>): OutputOptions {
  const noColorFlag = !!cliOptions["no-color"];
  const noColorEnv = process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "";
  const dumbTerminal = process.env.TERM === "dumb";
  const plainFlag = !!cliOptions["plain"];
  const jsonFlag = !!cliOptions["json-output"];

  const noColor = noColorFlag || noColorEnv || dumbTerminal;

  return {
    noColor: noColor || jsonFlag,
    plain: plainFlag || jsonFlag,
    json: jsonFlag,
  };
}

/** Set global output options (called once at CLI startup) */
export function setOutputOptions(opts: OutputOptions): void {
  globalOptions = opts;
}

/** Get current output options */
export function getOutputOptions(): OutputOptions {
  return globalOptions;
}

// Regex to match ANSI escape codes (colors, bold, underline, etc.)
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;

// Regex to match common emoji (emoji presentation sequences, skin tones, etc.)
// eslint-disable-next-line no-misleading-character-class
const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

// Box-drawing and decorative unicode characters
const BOX_DRAWING_REGEX = /[\u2500-\u257F\u2580-\u259F\u25A0-\u25FF\u2550-\u256C]/g;

// Non-emoji decorative unicode used in CLIs (bullets, arrows, stars, checks)
// Emoji are already handled by EMOJI_REGEX — this only covers non-emoji symbols
const DECORATIVE_REGEX = /[━┃┏┓┗┛┣┫╋┳┻•●○◎◉▶▷►▻▪▫★☆✓✗✔✘]/gu;

// Checked before the generic emoji/decoration strip. The variation selector that
// often follows (U+FE0F) is consumed with the glyph.
const PASS_GLYPHS = /[\u2713\u2714\u2705\u2611]\uFE0F?/gu;
const FAIL_GLYPHS = /[\u2717\u2718\u274C\u2716\u274E]\uFE0F?/gu;
const WARN_GLYPHS = /\u26A0\uFE0F?/gu;

/**
 * Strip ANSI color codes from a string.
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "");
}

/**
 * Strip emoji and decorative unicode from a string.
 * Preserves the semantic meaning by removing only the visual decoration.
 */
export function stripDecorations(text: string): string {
  return text
    // Pass/fail glyphs carry meaning, so they become words, not nothing. Deleting
    // them made a passing and a failing test line read the same in the
    // screen-reader mode (audit 2026-10-21); doctor already printed [PASS]/[FAIL].
    .replace(PASS_GLYPHS, "[PASS]")
    .replace(FAIL_GLYPHS, "[FAIL]")
    .replace(WARN_GLYPHS, "[WARN]")
    .replace(EMOJI_REGEX, "")
    .replace(BOX_DRAWING_REGEX, "-")
    .replace(DECORATIVE_REGEX, "")
    .replace(/[ \t]{2,}/g, " ")  // collapse spaces left by removal (never newlines: that rewrote multi-line text)
    .replace(/^\s+$/gm, "");  // remove lines that became whitespace-only
}

/**
 * Format text according to current output options.
 * Use this to wrap any text before printing to console.
 */
export function formatOutput(text: string): string {
  let result = text;
  if (globalOptions.noColor) {
    result = stripAnsi(result);
  }
  if (globalOptions.plain) {
    result = stripDecorations(result);
  }
  return result;
}

/**
 * JSON output structure for --json-output mode.
 */
export interface JsonOutput {
  success: boolean;
  command: string;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    howToFix?: string;
    docUrl?: string;
  };
  warnings?: string[];
  meta: {
    version: string;
    duration_ms?: number;
  };
}

/**
 * Lines a command wrote to console.log while --json-output was active.
 *
 * Before 2026-07-26 these were thrown away: the JSON branch of
 * installOutputWrappers set `console.log = () => {}` under a comment claiming the
 * output was "captured for JSON", and only two call sites in the whole CLI ever
 * called emitJson against ~140 advertised commands. So `--json-output` — a
 * documented accessibility contract ("for scripts and screen readers") — made
 * essentially every command print NOTHING and exit 0. A CI step piping to jq got
 * empty stdin next to a success exit code, which reads as a clean pass.
 * Probed live: `cbrowser navigate <file-url> --json-output` -> 0 bytes, exit 0,
 * against 294 bytes without the flag.
 */
let capturedLines: string[] = [];
let jsonEmitted = false;

/** Test seam — reset capture state between assertions. */
export function _resetJsonCapture(): void {
  capturedLines = [];
  jsonEmitted = false;
  capturedBytes = 0;
  captureTruncated = false;
}

/** Test seam — whether the capture buffer hit its budget. */
export function _captureTruncated(): boolean {
  return captureTruncated;
}

/** Test seam — what the wrapper has captured so far. */
export function _capturedJsonLines(): string[] {
  return [...capturedLines];
}

/** Whether a command emitted a real JSON envelope in this process. */
export function hasEmittedJson(): boolean {
  return jsonEmitted;
}

/**
 * Cap on captured output carried in the fallback envelope.
 *
 * Two reasons, both measured. (a) `capturedLines` accumulates every console.log
 * for the process lifetime and is otherwise unbounded, so a long journey or a
 * large nl-test run grows it without limit. (b) the envelope is written from a
 * process-exit handler, and a pipe write past one buffer cannot be drained from
 * there (see writeAllSync). Keeping the payload well under a pipe buffer means
 * truncation is reached by design and reported, rather than silently.
 * `help --json-output` measured 31,692 bytes, so 48KB leaves real headroom.
 */
const CAPTURE_BYTE_BUDGET = 48 * 1024;
let capturedBytes = 0;
let captureTruncated = false;

/**
 * Write text to stdout synchronously, all of it.
 *
 * `process.stdout.write` to a pipe is ASYNCHRONOUS in Node, and a
 * `process.on("exit")` handler cannot await the drain, so everything past the
 * first 65,536-byte pipe buffer is discarded. Measured 2026-07-26 on a
 * 1,048,636-byte payload: 1,048,616 bytes reached a file, exactly 65,536 reached
 * a pipe, and still exactly 65,536 with `| cat` actively reading. It does not
 * deadlock, it silently truncates, which is the worse of the two failures and
 * lands precisely on the pipe-to-jq case this whole fix exists for.
 * `writeSync` on fd 1 is genuinely synchronous. The loop is required because a
 * partial write is legal; the EAGAIN retry because Node may leave the fd
 * non-blocking.
 */
function writeAllSync(text: string): void {
  const buf = Buffer.from(text, "utf-8");
  let off = 0;
  // EAGAIN is retried, but a BOUNDED number of times. The first version of this
  // did `if (code === "EAGAIN") continue;` with no limit, which busy-spins
  // forever against a non-blocking pipe whose reader never drains — an infinite
  // loop in an exit handler, i.e. a process that can never exit. Shipping an
  // unbounded retry while hunting a hang was not my finest moment. (2026-07-27)
  let eagainRetries = 0;
  const MAX_EAGAIN_RETRIES = 10_000;
  while (off < buf.length) {
    try {
      off += writeSync(1, buf, off, buf.length - off);
      eagainRetries = 0;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EAGAIN" && eagainRetries++ < MAX_EAGAIN_RETRIES) continue;
      // Give up on fd 1 and hand the remainder to the async path. Losing the
      // tail of an envelope beats never exiting.
      try { process.stdout.write(buf.subarray(off)); } catch { /* nothing left to try */ }
      return;
    }
  }
}

/**
 * Where the JSON envelope is written. Overridable ONLY so tests can observe it:
 * writeAllSync goes to fd 1 directly, which is the whole point of the fix and
 * which a `process.stdout.write` spy therefore cannot see. Production never
 * replaces this.
 */
let jsonSink: (text: string) => void = writeAllSync;

/** Test seam — capture envelope output. Pass nothing to restore fd 1. */
export function _setJsonSink(sink?: (text: string) => void): void {
  jsonSink = sink ?? writeAllSync;
}

/**
 * Emit JSON output to stdout and exit.
 * All human-readable diagnostics go to stderr.
 */
export function emitJson(output: JsonOutput): void {
  jsonEmitted = true;
  jsonSink(JSON.stringify(output, null, 2) + "\n");
}

/**
 * Emit the fallback envelope for a command that never called emitJson.
 *
 * The contract this restores is narrow and deliberate: in --json-output mode
 * stdout is ALWAYS parseable JSON and never empty. It wraps whatever the command
 * printed rather than inventing structure, so a command with no native JSON shape
 * degrades to `{success, command, data.output[...]}` instead of degrading to
 * silence. Commands that do call emitJson are untouched.
 */
export function emitJsonFallback(command: string, version: string): void {
  if (jsonEmitted) return;
  // `success` is READ from the exit code, never assumed. Hardcoding `true` here
  // was the same defect as the auth bypass this release also fixes: a truthy
  // default standing in for a decision nobody made. Measured before the fix:
  // `cbrowser personas --json-output` exited 1 while the envelope said
  // "success": true, so `... | jq -e .success` passed on a hard failure. That is
  // worse than the empty stdout it replaced, because a lie beats silence at
  // fooling a script. (2026-07-26, found by the cross-vendor audit of this fix.)
  const failed = (process.exitCode ?? 0) !== 0;
  const warnings = ["This command has no native --json-output shape; data.output is its captured text output."];
  if (captureTruncated) {
    warnings.push(`Captured output exceeded ${CAPTURE_BYTE_BUDGET} bytes and was truncated; data.output is incomplete.`);
  }
  emitJson({
    success: !failed,
    command,
    data: { output: capturedLines, truncated: captureTruncated },
    warnings,
    meta: { version },
  });
}

/**
 * Install console wrappers that respect output options.
 * Call once at CLI startup, AFTER setting output options.
 *
 * In JSON mode: console.log is suppressed (captured for JSON), console.error goes to stderr.
 * In plain/no-color modes: console.log output is filtered through formatOutput.
 */
export function installOutputWrappers(): void {
  // Default case: no flags active — skip wrapping entirely (zero overhead)
  if (!globalOptions.json && !globalOptions.noColor && !globalOptions.plain) {
    return;
  }

  if (globalOptions.json) {
    // In JSON mode stdout is reserved for the JSON envelope, so console.log is
    // diverted — CAPTURED, not discarded. Discarding it is what made ~140
    // commands emit nothing at all under --json-output (see capturedLines).
    // Diagnostics keep going to stderr.
    const origError = console.error.bind(console);
    console.log = (...args: unknown[]) => {
      const line = args
        // Decorations stay stripped (the screen-reader contract); pass/fail
        // glyphs now become [PASS]/[FAIL] instead of vanishing. Data commands
        // (extract) emit a native envelope and skip this capture, so page text is
        // not altered (audit 2026-10-21). Objects are captured as JSON, not
        // "[object Object]".
        .map((a) => (typeof a === "string" ? stripAnsi(stripDecorations(a)) : a !== null && typeof a === "object" ? JSON.stringify(a) : String(a)))
        .join(" ")
        .trim();
      if (!line) return;
      if (capturedBytes + line.length > CAPTURE_BYTE_BUDGET) {
        // Drop rather than grow. The envelope must stay writable from an exit
        // handler, and a reported truncation beats an unparseable payload.
        captureTruncated = true;
        return;
      }
      capturedBytes += line.length;
      capturedLines.push(line);
    };
    console.error = (...args: unknown[]) => {
      origError(...args.map(a => typeof a === "string" ? stripAnsi(stripDecorations(a)) : a));
    };
  } else {
    const origLog = console.log.bind(console);
    const origError = console.error.bind(console);

    console.log = (...args: unknown[]) => {
      origLog(...args.map(a => typeof a === "string" ? formatOutput(a) : a));
    };
    console.error = (...args: unknown[]) => {
      origError(...args.map(a => typeof a === "string" ? formatOutput(a) : a));
    };
  }
}
