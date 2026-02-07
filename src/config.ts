/**
 * CBrowser Configuration
 *
 * All paths are configurable via environment variables or constructor options.
 * Default: ~/.cbrowser/
 */

import { existsSync, mkdirSync, readFileSync, readdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { GeoLocation, DeviceDescriptor, NetworkMock, PerformanceBudget, CBrowserConfigFile } from "./types.js";

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
  const dataDir = getDataDir();
  const configFile = loadConfigFile(dataDir);

  return {
    dataDir,
    browser: parseBrowserType(process.env.CBROWSER_BROWSER || configFile?.browser),
    headless: process.env.CBROWSER_HEADLESS !== "false" && (configFile?.headless !== false),
    viewportWidth: parseInt(process.env.CBROWSER_VIEWPORT_WIDTH || (configFile?.viewport?.width?.toString()) || "1280", 10) || 1280,
    viewportHeight: parseInt(process.env.CBROWSER_VIEWPORT_HEIGHT || (configFile?.viewport?.height?.toString()) || "800", 10) || 800,
    timeout: parseInt(process.env.CBROWSER_TIMEOUT || (configFile?.timeout?.toString()) || "30000", 10) || 30000,
    verbose: process.env.CBROWSER_VERBOSE === "true",
    device: process.env.CBROWSER_DEVICE || configFile?.device,
    locale: process.env.CBROWSER_LOCALE || configFile?.locale,
    timezone: process.env.CBROWSER_TIMEZONE || configFile?.timezone,
    colorScheme: (process.env.CBROWSER_COLOR_SCHEME as ColorScheme) || configFile?.colorScheme,
    recordVideo: process.env.CBROWSER_RECORD_VIDEO === "true" || configFile?.recordVideo || false,
    videoDir: join(dataDir, "videos"),
    networkMocks: configFile?.networkMocks,
    performanceBudget: configFile?.performanceBudget,
  };
}

/**
 * Directory paths derived from config.
 */
export interface CBrowserPaths {
  dataDir: string;
  sessionsDir: string;
  screenshotsDir: string;
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
}

/**
 * Get all paths based on the data directory.
 */
export function getPaths(dataDir?: string): CBrowserPaths {
  const base = dataDir || getDataDir();

  return {
    dataDir: base,
    sessionsDir: join(base, "sessions"),
    screenshotsDir: join(base, "screenshots"),
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
  };
}

/**
 * Ensure all required directories exist.
 */
export function ensureDirectories(paths?: CBrowserPaths): CBrowserPaths {
  const p = paths || getPaths();

  const dirs = [
    p.dataDir,
    p.sessionsDir,
    p.screenshotsDir,
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
 * Status info for diagnostics.
 */
export interface DirStatus {
  name: string;
  path: string;
  exists: boolean;
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
}

function countFiles(dir: string, ext?: string): number {
  if (!existsSync(dir)) return 0;
  try {
    const files = readdirSync(dir);
    if (ext) return files.filter(f => f.endsWith(ext)).length;
    return files.filter(f => !f.startsWith(".")).length;
  } catch {
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
 * Gather environment status info for diagnostics.
 */
export async function getStatusInfo(version: string): Promise<StatusInfo> {
  const paths = getPaths();
  const config = getDefaultConfig();

  // Directory status
  const dirEntries: Array<[string, string, string?]> = [
    ["screenshots", paths.screenshotsDir, ".png"],
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
  const visualBaselines = countFiles(paths.visualBaselinesDir);
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
    },
    healCache,
    sessions,
    baselines,
    visualBaselines,
    recordings,
    suggestions,
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
  lines.push("   └── Ready to start: npx cbrowser mcp-server");
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
