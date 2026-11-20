/**
 * Option and argument parsers shared by the commands, and interactive input.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */

import * as readline from "readline";
import { parseArgs } from "../cli-args.js";
import { VIEWPORT_PRESETS, LOCATION_PRESETS } from "../types.js";
import type { CaptureFormat } from "../recording/engine.js";

/**
 * Helper function for interactive readline input.
 */
export function readlineQuestion(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY || false,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/** Parse "5s", "2m", "1500ms" or a bare millisecond count. */
/**
 * A numeric option, checked. parseInt/parseFloat let "abc" through as NaN and
 * read "0.2" as 0 (flaky-check --threshold flagged every test), so a value
 * outside the range or not a number exits 1 naming the flag (audit F21).
 */
export function numberOption(flag: string, value: string | boolean | undefined, fallback: number, range: { min: number; max: number }): number {
  if (value === undefined) return fallback;
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < range.min || n > range.max) {
    console.error(`Error: --${flag} must be a number from ${range.min} to ${range.max}, got "${String(value)}"`);
    process.exit(1);
  }
  return n;
}

/** An option from a fixed set of words; anything else exits 1 (audit F21). */
export function enumOption<T extends string>(flag: string, value: string | boolean | undefined, allowed: readonly T[]): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    console.error(`Error: --${flag} must be ${allowed.join(", ")}, got "${String(value)}"`);
    process.exit(1);
  }
  return value as T;
}

/**
 * Where --html writes when --output names the JSON report. The HTML used to
 * take `output.replace(".json", ".html")`, so `--output report` or
 * `--output report.html` wrote the HTML over the JSON (audit 2026-10-21).
 */
export function htmlReportPath(output: string | boolean | undefined, fallback: string): string {
  if (typeof output !== "string" || output === "") return fallback;
  const base = output.replace(/\.(json|html?)$/i, "");
  const html = `${base}.html`;
  return html === output ? `${base}.report.html` : html;
}

/**
 * A --timeout value in milliseconds: a bare number is ms, and 5s / 2m / 1h work.
 * Exits 1 on anything else rather than guessing.
 */
export function timeoutOption(value: string | boolean | undefined, fallbackMs: number): number {
  if (value === undefined) return fallbackMs;
  try {
    return parseDurationMs(String(value));
  } catch {
    console.error(`Error: --timeout must be a positive number of milliseconds or a duration (5s, 2m, 1h), got "${String(value)}"`);
    process.exit(1);
  }
}

export function parseDurationMs(input: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/i.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid duration "${input}" - use 5s, 2m, 1h, 1500ms or a millisecond count`);
  }
  const value = parseFloat(match[1]);
  const unit = (match[2] || "ms").toLowerCase();
  const ms = unit === "s" ? value * 1000 : unit === "m" ? value * 60_000 : unit === "h" ? value * 3_600_000 : value;
  if (ms <= 0) throw new Error(`Invalid duration "${input}" - must be greater than zero`);
  return Math.round(ms);
}

/** Parse "gif,webp,mp4" into validated formats. */
export function parseFormats(input: string): CaptureFormat[] {
  const allowed: CaptureFormat[] = ["gif", "webp", "mp4", "webm"];
  const parsed = input.split(",").map((f) => f.trim().toLowerCase()).filter(Boolean);
  const bad = parsed.filter((f) => !allowed.includes(f as CaptureFormat));
  if (bad.length > 0) {
    throw new Error(`Unknown format(s): ${bad.join(", ")}. Supported: ${allowed.join(", ")}`);
  }
  if (parsed.length === 0) throw new Error("--format requires at least one format");
  return parsed as CaptureFormat[];
}

/** Parse "1280x720". */
function parseViewportSize(input: string): { width: number; height: number } {
  const preset = VIEWPORT_PRESETS.find((p) => p.name === input.trim().toLowerCase());
  if (preset) return { width: preset.width, height: preset.height };
  const match = /^(\d+)x(\d+)$/i.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid viewport "${input}" - use WIDTHxHEIGHT, e.g. 1280x720, or a size name: ${VIEWPORT_PRESETS.map((p) => p.name).join(", ")}`);
  }
  const width = parseInt(match[1], 10);
  const height = parseInt(match[2], 10);
  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid viewport "${input}" - width and height must be positive`);
  }
  return { width, height };
}

/** Parse "390x844,1280x800" into one or more viewport sizes. */
export function parseViewportList(input: string): { width: number; height: number }[] {
  const parts = input.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error("--viewport requires at least one WIDTHxHEIGHT");
  return parts.map(parseViewportSize);
}

/** Parse "x,y,width,height" in CSS pixels. */
export function parseRegion(input: string): { x: number; y: number; width: number; height: number } {
  const parts = input.split(",").map((p) => p.trim());
  if (parts.length !== 4) {
    throw new Error(`Invalid --region "${input}" - use x,y,width,height (4 comma-separated numbers)`);
  }
  const [x, y, width, height] = parts.map(Number);
  for (const [name, value] of [["x", x], ["y", y], ["width", width], ["height", height]] as const) {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid --region "${input}" - ${name} is not a number ("${parts[["x", "y", "width", "height"].indexOf(name)]}")`);
    }
  }
  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid --region "${input}" - width and height must be positive (got ${width}x${height})`);
  }
  return { x, y, width, height };
}

export function parseGeoLocation(location: string): { latitude: number; longitude: number } | null {
  // Check if it's a preset
  if (LOCATION_PRESETS[location]) {
    return LOCATION_PRESETS[location];
  }
  // Try parsing as lat,lon
  const parts = location.split(",");
  if (parts.length === 2) {
    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);
    if (!isNaN(lat) && !isNaN(lon)) {
      return { latitude: lat, longitude: lon };
    }
  }
  return null;
}

/**
 * `scroll <top|bottom|up|down> [px]` is `run "scroll ..."`: the same executor,
 * the same daemon route. The CLI had no way to scroll at all (audit 2026-10-21,
 * daemon lane: the likely cause of a screenshot stuck at the top of the page).
 */
export function rewriteScroll(parsed: ReturnType<typeof parseArgs>): ReturnType<typeof parseArgs> {
  if (parsed.command !== "scroll") return parsed;
  const [where, px] = parsed.args;
  const dir = (where ?? "").toLowerCase();
  let nl: string | undefined;
  if ((dir === "top" || dir === "bottom") && px === undefined) nl = `scroll to ${dir}`;
  else if ((dir === "up" || dir === "down") && (px === undefined || /^\d+$/.test(px))) nl = `scroll ${dir}${px ? ` ${px}` : ""}`;
  if (!nl) {
    console.error("Usage: cbrowser scroll <top|bottom|up|down> [pixels]   (default 300 for up/down)");
    process.exit(1);
  }
  return { command: "run", args: [nl], options: parsed.options };
}
