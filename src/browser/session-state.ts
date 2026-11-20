/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Session state and browser installation
 *
 * The saved page, device and geolocation a persistent browser restores between CLI invocations, the stale Chrome profile lock, and installing a missing Playwright browser.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, readlinkSync } from "fs";
import { isRestorablePageUrl, isStaleSingletonLock } from "../utils.js";
import { join } from "path";
import { execSync } from "child_process";
import type { SessionState } from "./helpers.js";
import type { CBrowser } from "../browser.js";

// =========================================================================
// Session State Persistence
// =========================================================================

export function clearStaleSingletonLock(this: CBrowser, browserStateDir: string): void {
  const lock = join(browserStateDir, "SingletonLock");
  let target: string;
  try {
    target = readlinkSync(lock);
  } catch {
    return; // no lock, or not a symlink — nothing to recover
  }
  const stale = isStaleSingletonLock(target, (pid) => {
    try {
      process.kill(pid, 0);
      return true; // signal delivered — process is alive
    } catch (e) {
      // ESRCH = no such process (dead); EPERM = alive but not ours (keep it)
      return (e as NodeJS.ErrnoException).code === "EPERM";
    }
  });
  if (stale) {
    try {
      unlinkSync(lock);
      if (this.config.verbose) {
        console.error(`[browser] removed stale SingletonLock (target: ${target})`);
      }
    } catch (e) {
      if (this.config.verbose) {
        console.warn(`[browser] failed to remove stale SingletonLock: ${(e as Error).message}`);
      }
    }
  }
}

export function saveSessionState(this: CBrowser, url: string, viewport?: { width: number; height: number }, device?: string): void {
  try {
    // Not about:blank, an empty URL or a browser error page: the next
    // command would reload it and act on nothing (isRestorablePageUrl).
    if (!isRestorablePageUrl(url)) return;

    // Device and location persist only when set on purpose (`device set`,
    // `geo set`), so carry those over from the file. Saving this run's
    // values made a one-off --device or --geo stick to every later command
    // for an hour (audit 2026-10-21).
    let previous: SessionState | null = null;
    try {
      if (existsSync(this.sessionStateFile)) previous = JSON.parse(readFileSync(this.sessionStateFile, "utf-8")) as SessionState;
    } catch { /* unreadable: start fresh */ }
    const state: SessionState = {
      url,
      timestamp: Date.now(),
      viewport,
      device: device ?? previous?.device,
      ...(previous?.geolocation ? { geolocation: previous.geolocation } : {}),
    };

    const stateDir = join(this.paths.dataDir, "browser-state");
    if (!existsSync(stateDir)) {
      mkdirSync(stateDir, { recursive: true });
    }

    writeFileSync(this.sessionStateFile, JSON.stringify(state, null, 2));
  } catch (e) {
    // Best-effort feature, but the user should know if it's silently failing
    // (filesystem full, permissions, etc) — surface a warning when verbose.
    if (this.config.verbose) {
      console.warn(`[browser] saveSessionState failed: ${(e as Error).message}`);
    }
  }
}

export function saveDeviceSetting(this: CBrowser, device: string): void {
  try {
    const stateDir = join(this.paths.dataDir, "browser-state");
    if (!existsSync(stateDir)) {
      mkdirSync(stateDir, { recursive: true });
    }

    // Load existing state or create new
    let state: SessionState;
    if (existsSync(this.sessionStateFile)) {
      state = JSON.parse(readFileSync(this.sessionStateFile, "utf-8"));
    } else {
      state = { url: "", timestamp: Date.now() };
    }

    state.device = device;
    state.timestamp = Date.now();
    writeFileSync(this.sessionStateFile, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error(`Failed to save device setting: ${(e as Error).message}`);
  }
}

export function saveGeolocationSetting(this: CBrowser, geo: { latitude: number; longitude: number; accuracy?: number }): boolean {
  try {
    const stateDir = join(this.paths.dataDir, "browser-state");
    if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
    const state: SessionState = existsSync(this.sessionStateFile)
      ? JSON.parse(readFileSync(this.sessionStateFile, "utf-8"))
      : { url: "", timestamp: Date.now() };
    state.geolocation = geo;
    state.timestamp = Date.now();
    writeFileSync(this.sessionStateFile, JSON.stringify(state, null, 2));
    return true;
  } catch (e) {
    console.error(`Failed to save geolocation: ${(e as Error).message}`);
    return false;
  }
}

export function loadSessionState(this: CBrowser): SessionState | null {
  try {
    if (!existsSync(this.sessionStateFile)) return null;
    const content = readFileSync(this.sessionStateFile, "utf-8");
    const state = JSON.parse(content) as SessionState;

    // Expire sessions older than 1 hour
    const oneHour = 60 * 60 * 1000;
    if (Date.now() - state.timestamp > oneHour) {
      unlinkSync(this.sessionStateFile);
      return null;
    }

    return state;
  } catch (e) {
    return null;
  }
}

export function clearSessionState(this: CBrowser): void {
  try {
    if (existsSync(this.sessionStateFile)) {
      unlinkSync(this.sessionStateFile);
    }
  } catch (e) {
    // Silently fail
  }
}

// =========================================================================
// Browser Installation
// =========================================================================

export function isBrowserNotInstalledError(this: CBrowser, error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("executable doesn't exist") ||
    message.includes("executable does not exist") ||
    message.includes("browsertype.launch") ||
    message.includes("no usable browser") ||
    message.includes("browser was not found")
  );
}

export async function installPlaywrightBrowsers(this: CBrowser): Promise<boolean> {
  console.error("🔧 Playwright browsers not found. Installing automatically...");
  console.error("   This may take a few minutes on first run.\n");

  try {
    // Install all browsers to avoid future issues
    execSync("npx playwright install chromium firefox webkit", {
      stdio: "inherit",
      timeout: 300000, // 5 minute timeout
    });
    console.error("\n✅ Playwright browsers installed successfully.\n");
    return true;
  } catch (installError) {
    console.error("\n❌ Automatic browser installation failed.\n");
    return false;
  }
}

export function getBrowserInstallErrorMessage(this: CBrowser, browserName: string): string {
  return `
╔══════════════════════════════════════════════════════════════════════════════╗
║  Playwright browsers are not installed                                        ║
╚══════════════════════════════════════════════════════════════════════════════╝

CBrowser requires Playwright browsers to run. Automatic installation failed.

To fix this, run one of these commands:

  npx playwright install                    # Install all browsers
  npx playwright install ${browserName.padEnd(20)} # Install ${browserName} only

Common issues:
  • Corporate network blocking downloads → Contact IT or use a VPN
  • Permission errors → Try with sudo or check write permissions
  • PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 → Unset this environment variable

For more help: https://playwright.dev/docs/browsers
`;
}
