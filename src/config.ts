/**
 * CBrowser Configuration
 *
 * All paths are configurable via environment variables or constructor options.
 * Default: ~/.cbrowser/
 */

import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export type BrowserType = "chromium" | "firefox" | "webkit";

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
 * Get default configuration, merging with environment variables.
 */
export function getDefaultConfig(): CBrowserConfig {
  const dataDir = getDataDir();

  return {
    dataDir,
    browser: parseBrowserType(process.env.CBROWSER_BROWSER),
    headless: process.env.CBROWSER_HEADLESS === "true",
    viewportWidth: parseInt(process.env.CBROWSER_VIEWPORT_WIDTH || "1280", 10),
    viewportHeight: parseInt(process.env.CBROWSER_VIEWPORT_HEIGHT || "800", 10),
    timeout: parseInt(process.env.CBROWSER_TIMEOUT || "30000", 10),
    verbose: process.env.CBROWSER_VERBOSE === "true",
  };
}

/**
 * Directory paths derived from config.
 */
export interface CBrowserPaths {
  dataDir: string;
  sessionsDir: string;
  screenshotsDir: string;
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
