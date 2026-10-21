/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * The global browser flags, for CLI commands that hand off to a library
 * function which launches its own browser (ai-visual, cross-browser, diff,
 * responsive, ab, coverage, parallel, repair-tests, flaky-check, perf-baseline,
 * compare-personas).
 *
 * None of those commands passed --browser, --device or --viewport on, and some
 * not --headless, and none checks its flags, so each was accepted and did
 * nothing (audit D20/F20, 2026-10-21). A command now passes what it can and
 * refuses, by name and with the reason, what it cannot.
 */

import type { BrowserLaunchOptions } from "./browser-options.js";
import { DEVICE_PRESETS, resolveDevice } from "./devices.js";
import { VIEWPORT_PRESETS } from "./types.js";

export type BrowserFlag = keyof BrowserLaunchOptions;

const ENGINES = ["chromium", "firefox", "webkit"] as const;

/** A positive whole number of pixels, or an error naming the flag. */
function pixels(flag: string, value: string | boolean): number {
  const n = typeof value === "string" && /^\d+$/.test(value.trim()) ? parseInt(value, 10) : NaN;
  if (!(n > 0)) throw new Error(`--${flag} must be a positive whole number of pixels, got "${String(value)}"`);
  return n;
}

/**
 * Parse --headless, --browser, --device and --viewport WxH. --width and
 * --height are aliases of --viewport (the visual commands' own flags); one
 * given alone keeps the other at its old default, 1920 or 1080. Throws on a
 * bad value, an unknown device or engine, or --viewport with --width/--height.
 */
export function parseBrowserFlags(options: Record<string, string | boolean>): BrowserLaunchOptions {
  const flags: BrowserLaunchOptions = {};

  if (options.headless !== undefined) flags.headless = options.headless !== false && options.headless !== "false";

  if (options.browser !== undefined) {
    const engine = String(options.browser);
    if (!(ENGINES as readonly string[]).includes(engine)) {
      throw new Error(`--browser must be ${ENGINES.join(", ")}, got "${engine}"`);
    }
    flags.browser = engine as BrowserLaunchOptions["browser"];
  }

  if (options.device !== undefined) {
    const resolved = resolveDevice(String(options.device));
    if ("error" in resolved) {
      const closest = resolved.suggestions.length > 0 ? ` Did you mean: ${resolved.suggestions.join(", ")}?` : "";
      throw new Error(`unknown --device "${String(options.device)}".${closest} 'cbrowser device list' shows all ${Object.keys(DEVICE_PRESETS).length} presets.`);
    }
    flags.device = resolved.key;
  }

  const sized = options.width !== undefined || options.height !== undefined;
  if (options.viewport !== undefined) {
    if (sized) throw new Error("give --viewport WIDTHxHEIGHT or --width/--height, not both");
    // Size names (mobile, tablet, desktop-md...) work as on every other command.
    const preset = VIEWPORT_PRESETS.find((p) => p.name === String(options.viewport).trim().toLowerCase());
    const match = /^(\d+)x(\d+)$/i.exec(String(options.viewport).trim());
    if (preset) {
      flags.viewport = { width: preset.width, height: preset.height };
    } else {
      if (!match) throw new Error(`--viewport takes one WIDTHxHEIGHT, e.g. 1280x720, or a size name, got "${String(options.viewport)}"`);
      flags.viewport = { width: pixels("viewport", match[1]), height: pixels("viewport", match[2]) };
    }
  } else if (sized) {
    flags.viewport = {
      width: options.width !== undefined ? pixels("width", options.width) : 1920,
      height: options.height !== undefined ? pixels("height", options.height) : 1080,
    };
  }

  return flags;
}

/** parseBrowserFlags, printing the error and exiting 1 on a bad flag. */
export function browserFlagsOrExit(command: string, options: Record<string, string | boolean>): BrowserLaunchOptions {
  try {
    return parseBrowserFlags(options);
  } catch (e) {
    console.error(`Error: ${command}: ${(e as Error).message}`);
    process.exit(1);
  }
}

/**
 * Refuse the flags a command cannot honour, naming each and why, and exit 1.
 * A refused flag would otherwise run the command without it and exit 0.
 */
export function refuseBrowserFlags(
  command: string,
  flags: BrowserLaunchOptions,
  cannot: Partial<Record<BrowserFlag, string>>,
): void {
  const refused = (Object.keys(cannot) as BrowserFlag[]).filter((flag) => flags[flag] !== undefined);
  if (refused.length === 0) return;
  for (const flag of refused) {
    const name = flag === "viewport" ? "--viewport (or --width/--height)" : `--${flag}`;
    console.error(`Error: '${command}' cannot take ${name}: ${cannot[flag]}`);
  }
  process.exit(1);
}
