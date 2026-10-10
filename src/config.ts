/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */


/**
 * CBrowser Configuration
 *
 * All paths are configurable via environment variables or constructor options.
 * Default: ~/.cbrowser/
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, statSync, rmdirSync, rmSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { scopedDataDir } from "./persona-scope.js";
import type { GeoLocation, DeviceDescriptor, NetworkMock, PerformanceBudget, CBrowserConfigFile, ProxyConfig } from "./types.js";

/**
 * Session ID for multi-user safety.
 * Each MCP server instance or CLI invocation gets a unique session.
 * Screenshots are stored in session-specific subdirectories.
 */
let currentSessionId: string | null = null;

/**
 * Get or create the current session ID.
 * For MCP server mode, this isolates each user's screenshots.
 */
export function getSessionId(): string {
  if (!currentSessionId) {
    currentSessionId = randomUUID().slice(0, 8);
  }
  return currentSessionId;
}

/**
 * Set the session ID explicitly (useful for MCP server).
 */
export function setSessionId(id: string): void {
  currentSessionId = id;
}

/**
 * Reset session ID (for testing).
 */
export function resetSessionId(): void {
  currentSessionId = null;
}

export type BrowserType = "chromium" | "firefox" | "webkit";
export type ColorScheme = "light" | "dark" | "no-preference";

export interface CBrowserConfig {
  /** Base directory for all CBrowser data. Default: ~/.cbrowser/ */
  dataDir: string;
  /** Browser engine to use. Default: chromium */
  browser: BrowserType;
  /** Run browser in headless mode. Default: true (for CLI) */
  headless: boolean;
  /** Browser viewport width. Default: 1280 */
  viewportWidth: number;
  /** Browser viewport height. Default: 800 */
  viewportHeight: number;
  /** Default timeout for operations in ms. Default: 30000 */
  timeout: number;
  /** Enable verbose logging. Default: false */
  verbose: boolean;
  /** Device emulation preset name */
  device?: string;
  /** Device descriptor for custom emulation */
  deviceDescriptor?: DeviceDescriptor;
  /** Geolocation coordinates */
  geolocation?: GeoLocation;
  /** Browser locale (e.g., "en-US") */
  locale?: string;
  /** Browser timezone (e.g., "America/New_York") */
  timezone?: string;
  /** Color scheme preference */
  colorScheme?: ColorScheme;
  /** Record video of sessions */
  recordVideo?: boolean;
  /** Video output directory */
  videoDir?: string;
  /** Network mocks to apply */
  networkMocks?: NetworkMock[];
  /** Performance budget thresholds */
  performanceBudget?: PerformanceBudget;
  /** User agent string override */
  userAgent?: string;
  /** Enable persistent browser context (cookies/localStorage survive between sessions) */
  persistent?: boolean;
  /** Skip session URL restoration on launch (preserves current page state for screenshots after interactions) */
  skipSessionRestore?: boolean;
  /** Proxy configuration for residential/datacenter proxies */
  proxy?: ProxyConfig;
  /** Extra env vars passed to the browser process at launch (e.g. DISPLAY for headed Xvfb). Merged with process.env. */
  launchEnv?: Record<string, string>;
  /**
   * Launch chromium in kiosk mode — no URL bar, no tabs, no chrome at all.
   * The page fills the entire OS window. Useful for screen-recording or VNC
   * overlay alignment where any browser chrome offset would break coords.
   */
  kioskMode?: boolean;
  /**
   * OS window dimensions (chromium --window-size). When unset, chromium uses
   * viewportWidth/Height. Decoupling lets us have a viewport smaller than the
   * window — required for VNC overlay alignment, where viewport must equal
   * the visible page area (after browser chrome) but the window must fill Xvfb.
   */
  windowWidth?: number;
  windowHeight?: number;
  /**
   * When set, any new page opened via target="_blank", window.open(), or other
   * popup mechanisms automatically becomes the active page (CBrowser.getPage()
   * returns the new tab). bringToFront() is also called on the new page so
   * VNC streams show the active tab. Used by live cognitive journeys so the
   * persona follows clicks that open new tabs.
   */
  followPopups?: boolean;
}

/**
 * Get the data directory from environment or default.
 */
export function getDataDir(): string {
  return process.env.CBROWSER_DATA_DIR || join(homedir(), ".cbrowser");
}

/**
 * Get default configuration, merging with environment variables.
 */
/**
 * Validate and return browser type from string.
 */
function parseBrowserType(value: string | undefined): BrowserType {
  if (value === "firefox" || value === "webkit") {
    return value;
  }
  return "chromium"; // default
}

/**
 * Load config from .cbrowserrc.json file if it exists.
 */
export function loadConfigFile(dir?: string): CBrowserConfigFile | null {
  const searchPaths = [
    join(process.cwd(), ".cbrowserrc.json"),
    join(process.cwd(), ".cbrowserrc"),
    join(process.cwd(), "cbrowser.config.json"),
    join(dir || getDataDir(), "config.json"),
    join(homedir(), ".cbrowserrc.json"),
  ];

  for (const path of searchPaths) {
    if (existsSync(path)) {
      try {
        const content = readFileSync(path, "utf-8");
        return JSON.parse(content) as CBrowserConfigFile;
      } catch (e) {
        console.debug(`[CBrowser] Invalid config file ${path}: ${(e as Error).message}`);
      }
    }
  }
  return null;
}

/**
 * Get default configuration, merging with environment variables and config file.
 */
export function getDefaultConfig(): CBrowserConfig {
  // The operator's config file is still read from the process data dir. The
  // browser's own files (screenshots, HAR, videos, selector cache, journeys,
  // browser state) go under effectiveDataDir(): a CBrowser built during a
  // hosted request took getDataDir(), the one directory every account
  // shared, and heal_stats read that selector cache back to any account.
  // Unscoped: unchanged. (tenant, 2026-10-10)
  const dataDir = effectiveDataDir();
  const configFile = loadConfigFile(getDataDir());

  // Build proxy config from environment if available
  // Format: CBROWSER_PROXY=http://user:pass@proxy.example.com:8080
  // Or use separate vars: CBROWSER_PROXY_SERVER, CBROWSER_PROXY_USERNAME, CBROWSER_PROXY_PASSWORD
  let proxy: ProxyConfig | undefined;
  const proxyUrl = process.env.CBROWSER_PROXY;
  const proxyServer = process.env.CBROWSER_PROXY_SERVER;

  if (proxyUrl) {
    // Parse full proxy URL (http://user:pass@host:port)
    try {
      const url = new URL(proxyUrl);
      proxy = {
        server: `${url.protocol}//${url.host}`,
        username: url.username || undefined,
        password: url.password || undefined,
      };
    } catch {
      // Invalid URL, use as-is
      proxy = { server: proxyUrl };
    }
  } else if (proxyServer) {
    proxy = {
      server: proxyServer,
      username: process.env.CBROWSER_PROXY_USERNAME,
      password: process.env.CBROWSER_PROXY_PASSWORD,
    };
  }

  return {
    dataDir,
    browser: parseBrowserType(process.env.CBROWSER_BROWSER || configFile?.browser),
    headless: process.env.CBROWSER_HEADLESS !== "false" && (configFile?.headless !== false),
    viewportWidth: parseInt(process.env.CBROWSER_VIEWPORT_WIDTH || (configFile?.viewport?.width?.toString()) || "1280", 10) || 1280,
    viewportHeight: parseInt(process.env.CBROWSER_VIEWPORT_HEIGHT || (configFile?.viewport?.height?.toString()) || "800", 10) || 800,
    timeout: parseInt(process.env.CBROWSER_TIMEOUT || (configFile?.timeout?.toString()) || "30000", 10) || 30000,
    verbose: process.env.CBROWSER_VERBOSE === "true",
    device: process.env.CBROWSER_DEVICE || configFile?.device,
    // CBrowser defaults: America/Denver timezone, en-US locale
    // Priority: env var > config file > CBrowser default > (system default unused)
    locale: process.env.CBROWSER_LOCALE || configFile?.locale || "en-US",
    timezone: process.env.CBROWSER_TIMEZONE || configFile?.timezone || "America/Denver",
    colorScheme: (process.env.CBROWSER_COLOR_SCHEME as ColorScheme) || configFile?.colorScheme,
    recordVideo: process.env.CBROWSER_RECORD_VIDEO === "true" || configFile?.recordVideo || false,
    videoDir: join(dataDir, "videos"),
    networkMocks: configFile?.networkMocks,
    performanceBudget: configFile?.performanceBudget,
    proxy,
  };
}

/**
 * Directory paths derived from config.
 */
export interface CBrowserPaths {
  dataDir: string;
  sessionsDir: string;
  screenshotsDir: string;
  /** Base screenshots directory (without session ID) */
  screenshotsBaseDir: string;
  videosDir: string;
  harDir: string;
  personasDir: string;
  scenariosDir: string;
  helpersDir: string;
  auditDir: string;
  baselinesDir: string;
  recordingsDir: string;
  visualBaselinesDir: string;
  visualScreenshotsDir: string;
  browserStateDir: string;
  credentialsFile: string;
  /** Current session ID for screenshot isolation */
  sessionId: string;
}

/**
 * The data directory for THIS call: the calling account's directory when a
 * hosted request entered an account scope, otherwise getDataDir().
 *
 * Per call, never cached. Both hosted servers run as root with one HOME, so
 * every account shared /root/.cbrowser: saved sessions (cookies included),
 * visual and perf baselines were listable, loadable and deletable by any key,
 * free tier included (v8 O3, 2026-10-10). getDataDir() itself is unchanged
 * on purpose: the shared legacy browser reads it at construction, and making
 * it scope-aware would bind whichever account happened to create it.
 */
export function effectiveDataDir(): string {
  return scopedDataDir() ?? getDataDir();
}

/**
 * Get all paths based on the data directory.
 * Screenshots are stored in session-specific subdirectories for multi-user safety.
 */
export function getPaths(dataDir?: string): CBrowserPaths {
  const base = dataDir || effectiveDataDir();
  const sessionId = getSessionId();
  const screenshotsBase = join(base, "screenshots");

  return {
    dataDir: base,
    sessionsDir: join(base, "sessions"),
    screenshotsBaseDir: screenshotsBase,
    screenshotsDir: join(screenshotsBase, sessionId), // Session-scoped!
    videosDir: join(base, "videos"),
    harDir: join(base, "har"),
    personasDir: join(base, "personas"),
    scenariosDir: join(base, "scenarios"),
    helpersDir: join(base, "helpers"),
    auditDir: join(base, "audit"),
    baselinesDir: join(base, "baselines"),
    recordingsDir: join(base, "recordings"),
    visualBaselinesDir: join(base, "visual-baselines"),
    visualScreenshotsDir: join(base, "visual-baselines", "screenshots"),
    browserStateDir: join(base, "browser-state"),
    credentialsFile: join(base, "credentials.json"),
    sessionId,
  };
}

/**
 * Ensure all required directories exist.
 * Also runs automatic screenshot cleanup based on retention settings.
 */
export function ensureDirectories(paths?: CBrowserPaths): CBrowserPaths {
  const p = paths || getPaths();

  const dirs = [
    p.dataDir,
    p.sessionsDir,
    p.screenshotsBaseDir,  // Base screenshots dir
    p.screenshotsDir,       // Session-specific screenshots dir
    p.videosDir,
    p.harDir,
    p.personasDir,
    p.scenariosDir,
    p.helpersDir,
    p.auditDir,
    p.baselinesDir,
    p.recordingsDir,
    p.visualBaselinesDir,
    p.visualScreenshotsDir,
    p.browserStateDir,
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  // Automatic cleanup of OLD screenshot sessions on startup
  // This is safe for multi-user: only deletes sessions older than retention period
  cleanupOldScreenshotSessions(p);
  // Both no-ops unless their env var is set; see getVideoRetention.
  cleanupOldVideos(p);
  cleanupOldBrowserState(p);

  return p;
}

/**
 * Merge user config with defaults.
 */
export function mergeConfig(userConfig: Partial<CBrowserConfig>): CBrowserConfig {
  const defaults = getDefaultConfig();
  return { ...defaults, ...userConfig };
}

/**
 * Get screenshot retention period in milliseconds.
 * Default: 1 hour (3600000 ms)
 * Set CBROWSER_SCREENSHOT_RETENTION to customize (in ms or with suffix: 1h, 30m, 7d)
 */
export function getScreenshotRetention(): number {
  const value = process.env.CBROWSER_SCREENSHOT_RETENTION;
  if (!value) return 3600000; // 1 hour default

  // Parse suffixes: 1h, 30m, 7d, 24h
  const match = value.match(/^(\d+)(ms|s|m|h|d)?$/i);
  if (match) {
    const num = parseInt(match[1], 10);
    const unit = (match[2] || "ms").toLowerCase();
    switch (unit) {
      case "d": return num * 24 * 60 * 60 * 1000;
      case "h": return num * 60 * 60 * 1000;
      case "m": return num * 60 * 1000;
      case "s": return num * 1000;
      default: return num; // ms
    }
  }
  return parseInt(value, 10) || 3600000;
}

/**
 * Clean up old screenshots that exceed the retention period.
 * Called automatically on CBrowser startup.
 * Returns the number of files deleted.
 */
/**
 * Format retention period for display.
 */
function formatRetention(ms: number): string {
  if (ms === 0) return "disabled";
  if (ms >= 24 * 60 * 60 * 1000) {
    const days = Math.round(ms / (24 * 60 * 60 * 1000));
    return `${days}d`;
  }
  if (ms >= 60 * 60 * 1000) {
    const hours = Math.round(ms / (60 * 60 * 1000));
    return `${hours}h`;
  }
  if (ms >= 60 * 1000) {
    const mins = Math.round(ms / (60 * 1000));
    return `${mins}m`;
  }
  return `${ms}ms`;
}

/**
 * Clean up old screenshot SESSION DIRECTORIES that exceed the retention period.
 * This is safe for multi-user MCP server deployments:
 * - Each user gets their own session directory
 * - Only entire old sessions are cleaned up, not individual files
 * - A session directory is only deleted if ALL its contents are older than retention
 *
 * Called automatically on CBrowser startup.
 * Returns the number of session directories deleted.
 */
/**
 * What the sweepers would remove, without removing anything.
 *
 * Retention ships disabled, so the honest way to decide whether to enable it
 * is to see the cost first. Reports against the given windows regardless of
 * whether the env vars are set.
 */
export function previewRetention(videoHours = 24, browserStateDays = 30, paths?: CBrowserPaths): {
  videos: { directories: number; files: number };
  browserState: { profiles: number };
} {
  const p = paths || getPaths();
  const now = Date.now();
  const out = { videos: { directories: 0, files: 0 }, browserState: { profiles: 0 } };
  const scan = (base: string, cutoff: number, onHit: (dir: string) => void): void => {
    if (!existsSync(base)) return;
    try {
      for (const entry of readdirSync(base)) {
        if (entry.startsWith(".") || entry === p.sessionId) continue;
        const dir = join(base, entry);
        try {
          if (!statSync(dir).isDirectory()) continue;
          if (newestMtime(dir) > cutoff) continue;
          onHit(dir);
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  };
  scan(p.videosDir, now - videoHours * 3600_000, (dir) => {
    out.videos.directories += 1;
    out.videos.files += countFiles(dir);
  });
  scan(p.browserStateDir, now - browserStateDays * 86400_000, () => {
    out.browserState.profiles += 1;
  });
  return out;
}

/**
 * Retention for capture output, in milliseconds. 0 disables cleanup.
 *
 * Capture artifacts are regenerable: frames, GIFs and manifests can be
 * produced again by re-running the capture. Measured on this box before any
 * retention existed: 10,169 files and 344MB, growing with every capture and
 * never shrinking. A default of 24 hours keeps recent work reviewable while
 * bounding the directory.
 */
export function getVideoRetention(): number {
  const raw = process.env.CBROWSER_VIDEO_RETENTION;
  // Off unless asked for. Turning this on deletes existing captures on the
  // next start -- 344MB of them on this box at the time it was written -- and
  // that is a decision for whoever owns the data, not a default to inherit.
  // Set CBROWSER_VIDEO_RETENTION to a number of hours to enable.
  if (!raw || raw === "0" || raw === "off") return 0;
  const hours = parseFloat(raw);
  return Number.isFinite(hours) && hours > 0 ? hours * 3600_000 : 0;
}

/**
 * Retention for browser profiles, in milliseconds. 0 disables cleanup.
 *
 * Deliberately far longer than the others and measured from last use, because
 * unlike a screenshot or a capture frame this data is NOT regenerable: a
 * browser-state directory holds cookies and saved logins, and deleting one
 * signs the user out of whatever they had authenticated. 110MB across 1,659
 * files is worth bounding, but not at the cost of silently destroying a
 * session someone still relies on -- so the default is 30 days of disuse, and
 * the active profile is never touched.
 */
export function getBrowserStateRetention(): number {
  const raw = process.env.CBROWSER_BROWSER_STATE_RETENTION;
  // Off unless asked for, and doubly so here: these profiles hold cookies and
  // saved logins, so a sweep signs people out of whatever they had
  // authenticated. Set CBROWSER_BROWSER_STATE_RETENTION to a number of days.
  if (!raw || raw === "0" || raw === "off") return 0;
  const days = parseFloat(raw);
  return Number.isFinite(days) && days > 0 ? days * 86400_000 : 0;
}

/**
 * Delete capture directories older than the video retention period.
 *
 * Whole directories only, and only when every entry inside is older than the
 * cutoff -- the same rule the screenshot sweeper uses, so a capture still
 * being written is never half-removed.
 *
 * Returns the number of directories deleted.
 */
export function cleanupOldVideos(paths?: CBrowserPaths): number {
  const p = paths || getPaths();
  const retention = getVideoRetention();
  if (retention === 0) return 0;
  if (!existsSync(p.videosDir)) return 0;

  const now = Date.now();
  let deleted = 0;
  try {
    for (const entry of readdirSync(p.videosDir)) {
      if (entry.startsWith(".")) continue;
      const dir = join(p.videosDir, entry);
      try {
        const stats = statSync(dir);
        if (!stats.isDirectory()) {
          if (now - stats.mtimeMs > retention) { unlinkSync(dir); deleted += 1; }
          continue;
        }
        if (entry === p.sessionId) continue;
        if (newestMtime(dir) > now - retention) continue;
        rmSync(dir, { recursive: true, force: true });
        deleted += 1;
      } catch { /* a directory that vanished mid-sweep needs no action */ }
    }
  } catch { /* an unreadable videos dir is not worth failing startup over */ }
  return deleted;
}

/**
 * Delete browser profiles untouched for longer than the retention period.
 *
 * Never removes the profile in use. Keyed on the newest mtime anywhere inside
 * the profile, so a directory whose top-level entry is old but whose cookies
 * were written this morning counts as active.
 */
export function cleanupOldBrowserState(paths?: CBrowserPaths): number {
  const p = paths || getPaths();
  const retention = getBrowserStateRetention();
  if (retention === 0) return 0;
  const base = p.browserStateDir;
  if (!existsSync(base)) return 0;

  const now = Date.now();
  let deleted = 0;
  try {
    for (const entry of readdirSync(base)) {
      if (entry.startsWith(".")) continue;
      const dir = join(base, entry);
      try {
        const stats = statSync(dir);
        if (!stats.isDirectory()) continue;
        if (entry === p.sessionId) continue;
        if (newestMtime(dir) > now - retention) continue;
        rmSync(dir, { recursive: true, force: true });
        deleted += 1;
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return deleted;
}

/**
 * Newest mtime anywhere under a directory, depth-limited.
 *
 * A directory's own mtime only reflects its immediate entries, so a capture
 * whose frames were written minutes ago can present an hours-old timestamp at
 * the top level. Deleting on that reading would remove live work.
 */
function newestMtime(dir: string, depth = 3): number {
  let newest = 0;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          if (depth > 0) newest = Math.max(newest, newestMtime(full, depth - 1));
        } else {
          newest = Math.max(newest, statSync(full).mtimeMs);
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return newest;
}

export function cleanupOldScreenshotSessions(paths?: CBrowserPaths): number {
  const p = paths || getPaths();
  const retention = getScreenshotRetention();
  const now = Date.now();
  let deletedSessions = 0;

  // Skip cleanup if retention is 0 (disabled)
  if (retention === 0) return 0;

  if (!existsSync(p.screenshotsBaseDir)) return 0;

  try {
    const entries = readdirSync(p.screenshotsBaseDir);
    for (const entry of entries) {
      const sessionDir = join(p.screenshotsBaseDir, entry);

      try {
        const stats = statSync(sessionDir);

        // Skip if not a directory (legacy flat files)
        if (!stats.isDirectory()) {
          // Clean up legacy flat files too
          if (entry.endsWith(".png") || entry.endsWith(".jpg") || entry.endsWith(".jpeg")) {
            const age = now - stats.mtimeMs;
            if (age > retention) {
              unlinkSync(sessionDir);
            }
          }
          continue;
        }

        // Don't delete the current session
        if (entry === p.sessionId) continue;

        // Check if the session directory is old enough to delete
        const sessionAge = now - stats.mtimeMs;
        if (sessionAge > retention) {
          // Delete all files in the session directory
          const files = readdirSync(sessionDir);
          for (const file of files) {
            try {
              unlinkSync(join(sessionDir, file));
            } catch {
              // Skip files we can't delete
            }
          }
          // Remove the empty directory
          try {
            rmdirSync(sessionDir);
            deletedSessions++;
          } catch {
            // Directory not empty or permission error
          }
        }
      } catch {
        // Skip entries we can't stat
      }
    }
  } catch {
    // Directory read error, skip cleanup
  }

  return deletedSessions;
}

/**
 * Clean up screenshots in the CURRENT session only.
 * Useful for explicit cleanup without affecting other users.
 */
export function cleanupCurrentSessionScreenshots(paths?: CBrowserPaths): number {
  const p = paths || getPaths();
  let deleted = 0;

  if (!existsSync(p.screenshotsDir)) return 0;

  try {
    const files = readdirSync(p.screenshotsDir);
    for (const file of files) {
      if (!file.endsWith(".png") && !file.endsWith(".jpg") && !file.endsWith(".jpeg")) {
        continue;
      }
      try {
        unlinkSync(join(p.screenshotsDir, file));
        deleted++;
      } catch {
        // Skip files we can't delete
      }
    }
  } catch {
    // Directory read error
  }

  return deleted;
}

/**
 * Status info for diagnostics.
 */
export interface DirStatus {
  name: string;
  path: string;
  exists: boolean;
  /** Files on disk, counted recursively. Not the same as a registry count. */
  fileCount: number;
}

export interface BrowserStatus {
  name: string;
  installed: boolean;
  version: string;
}

export interface StatusInfo {
  version: string;
  dataDir: string;
  directories: DirStatus[];
  browsers: BrowserStatus[];
  config: {
    headless: boolean;
    browser: string;
    timeout: number;
    viewportWidth: number;
    viewportHeight: number;
    configFile: string | null;
    screenshotRetention: string;
    /** Current screenshot session ID */
    screenshotSession: string;
  };
  healCache: {
    totalEntries: number;
    totalHeals: number;
    topDomain: string | null;
  };
  sessions: number;
  baselines: number;
  visualBaselines: number;
  recordings: number;
  suggestions: string[];
  /** Number of active screenshot sessions */
  screenshotSessions: number;
  /** Number of registered MCP tools (v18.22.0, optional - only present when running as MCP server) */
  toolCount?: number;
}

/**
 * Count files in a directory, including nested ones.
 *
 * Recursive because these directories are session-scoped: screenshots live in
 * per-session subdirectories, and visual baselines under a nested store. A
 * top-level readdir therefore reported 0 screenshots while 12 sat one level
 * down, and 1 visual baseline against 34 on disk -- an extension filter also
 * excludes the subdirectory entries themselves, so the count collapsed to
 * zero rather than merely being low.
 *
 * Depth-limited because a runaway tree should not turn a status call into a
 * filesystem walk; three levels covers every layout in use.
 */
function countFiles(dir: string, ext?: string | string[], depth = 3): number {
  if (!existsSync(dir)) return 0;
  try {
    let total = 0;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) {
        if (depth > 0) total += countFiles(join(dir, entry.name), ext, depth - 1);
      } else if (!ext || (Array.isArray(ext)
        ? ext.some((e) => entry.name.endsWith(e))
        : entry.name.endsWith(ext))) {
        total += 1;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

/**
 * Count visual-baseline records the way list_baselines counts them: entries in the
 * `baselines` array of visual-baselines/baselines.json. Mirrors
 * visual/regression.ts:loadVisualBaselines, which returns `data.baselines || []`.
 */
function countVisualBaselineRecords(dir: string): number {
  const indexPath = join(dir, "baselines.json");
  if (!existsSync(indexPath)) return 0;
  try {
    const data = JSON.parse(readFileSync(indexPath, "utf-8"));
    return Array.isArray(data.baselines) ? data.baselines.length : 0;
  } catch (e) {
    console.debug(`[CBrowser] Failed to read visual baseline index: ${(e as Error).message}`);
    return 0;
  }
}

function findConfigFile(): string | null {
  const searchPaths = [
    join(process.cwd(), ".cbrowserrc.json"),
    join(process.cwd(), ".cbrowserrc"),
    join(process.cwd(), "cbrowser.config.json"),
    join(getDataDir(), "config.json"),
    join(homedir(), ".cbrowserrc.json"),
  ];
  for (const p of searchPaths) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Check which Playwright browsers are installed.
 * Uses executablePath() check instead of launching browsers for speed.
 */
export async function checkBrowsers(): Promise<BrowserStatus[]> {
  const results: BrowserStatus[] = [];
  const { chromium, firefox, webkit } = await import("playwright");

  for (const [name, browserType] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]] as const) {
    try {
      // Use executablePath() instead of launching - much faster and won't timeout
      const execPath = (browserType as any).executablePath();
      const installed = existsSync(execPath);
      // Extract version from path if possible (e.g., chromium-1148 -> 1148)
      const versionMatch = execPath.match(/(\d+)(?:[/\\]|$)/);
      const version = installed ? (versionMatch?.[1] || "installed") : "";
      results.push({ name, installed, version });
    } catch {
      results.push({ name, installed: false, version: "" });
    }
  }

  return results;
}

/**
 * Count screenshot sessions and total files across all sessions.
 */
function countScreenshotSessions(baseDir: string): { sessions: number; files: number } {
  if (!existsSync(baseDir)) return { sessions: 0, files: 0 };
  try {
    const entries = readdirSync(baseDir);
    let sessions = 0;
    let files = 0;
    for (const entry of entries) {
      const entryPath = join(baseDir, entry);
      try {
        const stats = statSync(entryPath);
        if (stats.isDirectory()) {
          sessions++;
          const sessionFiles = readdirSync(entryPath);
          files += sessionFiles.filter(f => f.endsWith(".png") || f.endsWith(".jpg")).length;
        } else if (entry.endsWith(".png") || entry.endsWith(".jpg")) {
          // Legacy flat files
          files++;
        }
      } catch {
        // Skip
      }
    }
    return { sessions, files };
  } catch {
    return { sessions: 0, files: 0 };
  }
}

/**
 * Gather environment status info for diagnostics.
 * @param version CBrowser version string
 * @param toolCount Optional number of registered MCP tools (v18.22.0)
 */
export async function getStatusInfo(version: string, toolCount?: number): Promise<StatusInfo> {
  const paths = getPaths();
  const config = getDefaultConfig();

  // Screenshot session stats
  const screenshotStats = countScreenshotSessions(paths.screenshotsBaseDir);

  // Directory status
  const dirEntries: Array<[string, string, (string | string[])?]> = [
    // Every extension screenshots are actually written in. It filtered on
    // .png alone while remote-mode compression writes .jpg, so a directory
    // holding twelve screenshots reported zero.
    ["screenshots", paths.screenshotsBaseDir, [".png", ".jpg", ".jpeg", ".webp"]],
    ["sessions", paths.sessionsDir, ".json"],
    ["baselines", paths.baselinesDir, ".json"],
    ["visual-baselines", paths.visualBaselinesDir],
    ["recordings", paths.recordingsDir, ".json"],
    ["har", paths.harDir, ".har"],
    ["personas", paths.personasDir],
    ["browser-state", paths.browserStateDir],
    ["videos", paths.videosDir],
    ["audit", paths.auditDir],
  ];

  // Directory counts read the filesystem; the summary counts below read
  // registries -- baselines.json for visualBaselines, the session store for
  // screenshotSessions, the built-in table plus custom files for personas.
  // They are different populations, not two views of one, and reporting both
  // without saying so left a reader to guess which was authoritative.
  const directories: DirStatus[] = dirEntries.map(([name, dirPath, ext]) => ({
    name,
    path: dirPath,
    exists: existsSync(dirPath),
    fileCount: countFiles(dirPath, ext),
  }));

  // Self-healing cache
  const cachePath = join(paths.dataDir, "selector-cache.json");
  let healCache = { totalEntries: 0, totalHeals: 0, topDomain: null as string | null };
  if (existsSync(cachePath)) {
    try {
      const data = JSON.parse(readFileSync(cachePath, "utf-8"));
      const entries = Object.values(data.entries || {}) as Array<{ domain: string; successCount: number }>;
      const byDomain: Record<string, number> = {};
      let totalHeals = 0;
      for (const e of entries) {
        byDomain[e.domain] = (byDomain[e.domain] || 0) + 1;
        totalHeals += e.successCount || 0;
      }
      const topDomain = Object.entries(byDomain).sort((a, b) => b[1] - a[1])[0];
      healCache = {
        totalEntries: entries.length,
        totalHeals,
        topDomain: topDomain ? `${topDomain[0]} (${topDomain[1]} entries)` : null,
      };
    } catch (e) {
      console.debug(`[CBrowser] Corrupted selector cache: ${(e as Error).message}`);
    }
  }

  // Browser detection
  const browsers = await checkBrowsers();

  // Suggestions
  const suggestions: string[] = [];
  const missingBrowsers = browsers.filter(b => !b.installed).map(b => b.name);
  if (missingBrowsers.length > 0) {
    suggestions.push(`Install missing browsers: npx playwright install ${missingBrowsers.join(" ")}`);
  }
  if (!findConfigFile()) {
    suggestions.push("Create a config file: .cbrowserrc.json for project-level settings");
  }
  const sessions = countFiles(paths.sessionsDir, ".json");
  const baselines = countFiles(paths.baselinesDir, ".json");
  // Visual baselines are records inside visual-baselines/baselines.json, not one
  // file per baseline. Counting directory entries returned 2 (the index file plus
  // screenshots/) while list_baselines reported 9 for the same data, so `status`
  // and `list_baselines` contradicted each other. (2026-07-28)
  //
  // This deliberately duplicates the read in visual/regression.ts:loadVisualBaselines
  // rather than calling it: that module imports CBrowser from ../browser.js, and
  // pulling the Playwright stack into config loading would be a bad trade for one
  // count. If the on-disk format changes, both readers must change together.
  const visualBaselines = countVisualBaselineRecords(paths.visualBaselinesDir);
  const recordings = countFiles(paths.recordingsDir, ".json");

  return {
    version,
    dataDir: paths.dataDir,
    directories,
    browsers,
    config: {
      headless: config.headless,
      browser: config.browser,
      timeout: config.timeout,
      viewportWidth: config.viewportWidth,
      viewportHeight: config.viewportHeight,
      configFile: findConfigFile(),
      screenshotRetention: formatRetention(getScreenshotRetention()),
      screenshotSession: paths.sessionId,
    },
    healCache,
    sessions,
    baselines,
    visualBaselines,
    recordings,
    suggestions,
    screenshotSessions: screenshotStats.sessions,
    ...(toolCount !== undefined && { toolCount }),
  };
}

/**
 * Format status info as a human-readable string.
 */
export function formatStatus(info: StatusInfo): string {
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push(`║               CBrowser v${info.version} Status${" ".repeat(Math.max(0, 26 - info.version.length))}║`);
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");

  // Data directory
  lines.push(`📁 Data Directory: ${info.dataDir}`);
  for (let i = 0; i < info.directories.length; i++) {
    const d = info.directories[i];
    const prefix = i === info.directories.length - 1 ? "└──" : "├──";
    const status = d.exists ? `✓ exists (${d.fileCount} files)` : "✗ missing";
    lines.push(`   ${prefix} ${d.name.padEnd(20)} ${status}`);
  }
  lines.push("");

  // Browsers
  lines.push("🌐 Browsers:");
  for (let i = 0; i < info.browsers.length; i++) {
    const b = info.browsers[i];
    const prefix = i === info.browsers.length - 1 ? "└──" : "├──";
    const status = b.installed ? `✓ installed (v${b.version})` : "✗ not installed";
    lines.push(`   ${prefix} ${b.name.padEnd(12)} ${status}`);
  }
  lines.push("");

  // Configuration
  lines.push("🔧 Configuration:");
  lines.push(`   ├── Browser:     ${info.config.browser}`);
  lines.push(`   ├── Headless:    ${info.config.headless}`);
  lines.push(`   ├── Timeout:     ${info.config.timeout}ms`);
  lines.push(`   ├── Viewport:    ${info.config.viewportWidth}x${info.config.viewportHeight}`);
  lines.push(`   ├── Screenshot cleanup: ${info.config.screenshotRetention} (auto, per-session)`);
  lines.push(`   ├── Session ID:  ${info.config.screenshotSession} (${info.screenshotSessions} active sessions)`);
  lines.push(`   └── Config file: ${info.config.configFile || "none found"}`);
  lines.push("");

  // Self-healing cache
  lines.push("📊 Self-Healing Cache:");
  lines.push(`   ├── Total entries: ${info.healCache.totalEntries}`);
  lines.push(`   ├── Total heals:   ${info.healCache.totalHeals}`);
  lines.push(`   └── Top domain:    ${info.healCache.topDomain || "none"}`);
  lines.push("");

  // Summary counts
  lines.push("📋 Data:");
  lines.push(`   ├── Sessions:         ${info.sessions}`);
  lines.push(`   ├── Baselines:        ${info.baselines}`);
  lines.push(`   ├── Visual baselines: ${info.visualBaselines}`);
  lines.push(`   └── Recordings:       ${info.recordings}`);
  lines.push("");

  // MCP
  lines.push("🔌 MCP Server:");
  if (info.toolCount !== undefined) {
    lines.push(`   ├── Tool count:    ${info.toolCount}`);
    lines.push("   └── Status:        Running");
  } else {
    lines.push("   └── Ready to start: npx cbrowser mcp-server");
  }
  lines.push("");

  // Suggestions
  if (info.suggestions.length > 0) {
    lines.push("💡 Suggestions:");
    for (const s of info.suggestions) {
      lines.push(`   • ${s}`);
    }
    lines.push("");
  }

  const allGood = info.browsers.some(b => b.installed) && info.directories.every(d => d.exists);
  lines.push(allGood ? "✅ All systems operational" : "⚠️  Some issues detected — see suggestions above");

  return lines.join("\n");
}
