/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * The browser a library function launches for its caller.
 *
 * The visual, testing and performance functions each build their own CBrowser,
 * and took at most `headless` from the caller, so the CLI's --browser, --device
 * and --viewport were accepted on ab, ai-visual, flaky-check and the rest and
 * changed nothing (audit D20/F20, 2026-10-21). BrowserLaunchOptions (types.ts)
 * is the one shape those functions now take; this turns it into CBrowser config.
 */

import type { CBrowserConfig } from "./config.js";
import type { BrowserLaunchOptions } from "./types.js";

export type { BrowserLaunchOptions };

/**
 * The CBrowser config for the options. Only the keys given: an unset one leaves
 * the environment or config-file value in place.
 */
export function browserLaunchConfig(options: BrowserLaunchOptions = {}): Partial<CBrowserConfig> {
  return {
    ...(options.headless !== undefined ? { headless: options.headless } : {}),
    ...(options.browser ? { browser: options.browser } : {}),
    ...(options.device ? { device: options.device } : {}),
    ...(options.viewport
      ? {
          viewportWidth: options.viewport.width,
          viewportHeight: options.viewport.height,
          viewportOverride: { ...options.viewport },
        }
      : {}),
  };
}
