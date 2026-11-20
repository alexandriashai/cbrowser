/**
 * The context main() hands to each command module.
 *
 * The fields are the locals of main() that the moved code read; each module
 * destructures only the ones it uses.
 */

import type { CBrowser } from "../browser.js";
import type { ColorScheme } from "../config.js";

/** What main() has parsed before any browser exists. */
export interface PreBrowserContext {
  command: string;
  args: string[];
  options: Record<string, string | boolean>;
  colorScheme: ColorScheme | undefined;
}

/** What a command group handler receives: the parsed command line and the browser built for it. */
export interface CommandContext extends PreBrowserContext {
  browser: CBrowser;
  browserType: "chromium" | "firefox" | "webkit";
  headless: boolean;
  geolocation: { latitude: number; longitude: number } | undefined;
  viewportOverride: { width: number; height: number } | undefined;
}
