/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Cookies, video, device emulation and geolocation
 *
 * Settings of the browser context: cookies, the recorded video, device and colour-scheme emulation, new tabs, and geolocation.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import type { Page } from "playwright";
import { existsSync, writeFileSync } from "fs";
import { type ColorScheme, COLOR_SCHEMES, isColorScheme } from "../config.js";
import type { SavedSession } from "../types.js";
import { LOCATION_PRESETS, CBrowserError, CBrowserErrorCode } from "../types.js";
import { resolveDevice } from "../devices.js";
import type { CBrowser } from "../browser.js";

// =========================================================================
// Cookie Management
// =========================================================================

export async function getCookies(this: CBrowser, urls?: string[]): Promise<SavedSession["cookies"]> {
  if (!this.context) {
    await this.launch();
  }
  return await this.context!.cookies(urls) as SavedSession["cookies"];
}

export async function setCookies(this: CBrowser, cookies: SavedSession["cookies"]): Promise<void> {
  if (!this.context) {
    await this.launch();
  }
  await this.context!.addCookies(cookies);
}

export async function clearCookies(this: CBrowser): Promise<void> {
  if (!this.context) return;
  await this.context.clearCookies();
  // Clear the cross-invocation snapshot too, so the clear actually sticks
  // even if the process is killed before a graceful close re-snapshots.
  try {
    if (existsSync(this.persistedCookiesFile)) {
      writeFileSync(this.persistedCookiesFile, "[]");
    }
  } catch {
    /* best effort */
  }
}

export async function deleteCookie(this: CBrowser, name: string, domain?: string): Promise<void> {
  const cookies = await this.getCookies();
  const filtered = cookies.filter((c) => {
    if (c.name !== name) return true;
    // ".example.com" and "example.com" name the same cookie domain.
    if (domain && c.domain.replace(/^\./, "") !== domain.replace(/^\./, "")) return true;
    return false;
  });

  await this.clearCookies();
  if (filtered.length > 0) {
    await this.setCookies(filtered);
  }
}

// =========================================================================
// Video Recording
// =========================================================================

export async function getVideoPath(this: CBrowser): Promise<string | null> {
  if (!this.page) return null;

  const video = this.page.video();
  if (!video) return null;

  return await video.path();
}

export async function saveVideo(this: CBrowser, outputPath: string): Promise<string | null> {
  if (!this.page) return null;

  const video = this.page.video();
  if (!video) return null;

  await video.saveAs(outputPath);
  return outputPath;
}

// =========================================================================
// Device Emulation
// =========================================================================

export function setDevice(this: CBrowser, deviceName: string): boolean {
  const resolved = resolveDevice(deviceName);
  if ("error" in resolved) return false;
  this.config.device = resolved.key;
  return true;
}

export async function emulate(this: CBrowser, opts: { device?: string; viewport?: { width: number; height: number } }): Promise<{ device: string | null }> {
  let key: string | undefined;
  if (opts.device) {
    const resolved = resolveDevice(opts.device);
    if ("error" in resolved) {
      const closest = resolved.suggestions.length > 0 ? ` Closest presets: ${resolved.suggestions.join(", ")}.` : "";
      throw new CBrowserError(CBrowserErrorCode.CONFIG_INVALID, `${resolved.error}.${closest}`, {
        device: opts.device,
        suggestions: resolved.suggestions,
      });
    }
    key = resolved.key;
  }
  if (this.browser || this.context) await this.close();
  if (key) this.config.device = key;
  if (opts.viewport) {
    this.config.viewportOverride = { ...opts.viewport };
    if (!key) {
      this.config.viewportWidth = opts.viewport.width;
      this.config.viewportHeight = opts.viewport.height;
    }
  }
  return { device: this.config.device ?? null };
}

export async function setColorScheme(this: CBrowser, scheme: ColorScheme): Promise<void> {
  if (!isColorScheme(scheme)) {
    throw new CBrowserError(CBrowserErrorCode.CONFIG_INVALID,
      `colorScheme must be ${COLOR_SCHEMES.join(", ")}, got: ${String(scheme)}`, { colorScheme: scheme });
  }
  this.config.colorScheme = scheme;
  const context = this.context;
  if (!context) return;
  for (const p of context.pages()) {
    if (!p.isClosed()) await p.emulateMedia({ colorScheme: scheme });
  }
  if (!this.colorSchemeFollowers.has(context)) {
    this.colorSchemeFollowers.add(context);
    // The context was created with the scheme it launched with; a page it
    // opens now would start from that, not from this call. This listener
    // cannot hold a page's first load: a page the site opens itself (a
    // popup) gets the scheme a moment after it exists, so a script that
    // reads prefers-color-scheme once while that page is still loading can
    // read the launch scheme. Tabs cbrowser opens go through newTab, which
    // applies it first.
    context.on("page", (p) => {
      if (this.config.colorScheme) p.emulateMedia({ colorScheme: this.config.colorScheme }).catch(() => {});
    });
  }
}

export async function newTab(this: CBrowser): Promise<Page> {
  if (!this.context) await this.launch();
  const page = await this.context!.newPage();
  if (this.config.colorScheme && this.colorSchemeFollowers.has(this.context!)) {
    await page.emulateMedia({ colorScheme: this.config.colorScheme });
  }
  return page;
}

// =========================================================================
// Geolocation
// =========================================================================

export function setGeolocation(this: CBrowser, location: string | { latitude: number; longitude: number; accuracy?: number }): boolean {
  if (typeof location === "string") {
    if (LOCATION_PRESETS[location]) {
      this.config.geolocation = LOCATION_PRESETS[location];
      return true;
    }
    return false;
  }
  this.config.geolocation = location;
  return true;
}

export async function setGeolocationRuntime(
  this: CBrowser,
  location: string | { latitude: number; longitude: number; accuracy?: number }
): Promise<boolean> {
  if (!this.context) return false;

  let geo: { latitude: number; longitude: number; accuracy?: number };

  if (typeof location === "string") {
    if (!LOCATION_PRESETS[location]) return false;
    geo = LOCATION_PRESETS[location];
  } else {
    geo = location;
  }

  await this.context.setGeolocation(geo);
  await this.context.grantPermissions(["geolocation"]);
  return true;
}

export async function applyPersonaLocation(this: CBrowser, location: {
  timezone?: string;
  locale?: string;
  geolocation?: { latitude: number; longitude: number; accuracy?: number };
}): Promise<{
  geolocationApplied: boolean;
  timezoneStored: boolean;
  localeStored: boolean;
  effectiveTimezone: string | undefined;
  effectiveLocale: string | undefined;
  note?: string;
}> {
  let geolocationApplied = false;
  let timezoneStored = false;
  let localeStored = false;

  // Apply geolocation at runtime (immediate effect)
  if (location.geolocation) {
    geolocationApplied = await this.setGeolocationRuntime(location.geolocation);
  }

  // Store timezone for context (affects Date objects, Intl APIs)
  if (location.timezone) {
    this.config.timezone = location.timezone;
    timezoneStored = true;
  }

  // Store locale for context (affects number/date formatting, language)
  if (location.locale) {
    this.config.locale = location.locale;
    localeStored = true;
  }

  return {
    geolocationApplied,
    timezoneStored,
    localeStored,
    effectiveTimezone: this.config.timezone,
    effectiveLocale: this.config.locale,
    note: (timezoneStored || localeStored)
      ? "Timezone/locale stored in config. For full effect, these apply when browser context is recreated."
      : undefined,
  };
}
