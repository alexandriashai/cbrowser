/**
 * CBrowser Configuration
 *
 * All paths are configurable via environment variables or constructor options.
 * Default: ~/.cbrowser/
 */

import { existsSync, mkdirSync, readFileSync } from "fs";
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
  /** Run browser in headless mode. Default: false */
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
      } catch {
        // Invalid JSON, skip
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
    headless: process.env.CBROWSER_HEADLESS === "true" || configFile?.headless || false,
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
    p.personasDir,
    p.scenariosDir,
    p.helpersDir,
    p.auditDir,
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
