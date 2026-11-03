/**
 * CBrowser Geo Proxy — residential proxy routing by region.
 *
 * Maps simple region names to IPRoyal residential proxy credentials.
 * Users pass geoRegion="us-west" instead of raw proxy URLs.
 *
 * @since v18.39.0
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { describeLoosePermissions } from "./secure-file.js";

export interface ProxyConfig {
  server: string;
  username: string;
  password: string;
}

export interface GeoProxyConfig {
  host: string;
  port: number;
  username: string;
  basePassword: string;
  regions: Record<string, { country: string; city?: string }>;
}

// Default regions — can be overridden by ~/.cbrowser/geo-proxy.json
const DEFAULT_REGIONS: Record<string, { country: string; city?: string }> = {
  "us-west": { country: "us", city: "losangeles" },
  "us-east": { country: "us", city: "newyorkcity" },
  "us-central": { country: "us", city: "denver" },
  "uk": { country: "gb", city: "london" },
  "germany": { country: "de", city: "frankfurt" },
  "japan": { country: "jp", city: "tokyo" },
  "france": { country: "fr", city: "paris" },
  "australia": { country: "au", city: "sydney" },
  "canada": { country: "ca", city: "toronto" },
  "brazil": { country: "br", city: "saopaulo" },
};

// Session counter for sticky sessions
let sessionCounter = 0;
const SESSION_IDS = [
  "z8p87Ove", "7BjThBGI", "vqNtbY6R", "PwmmFqYw", "4QKzehe7",
  "pS7cjz1D", "rvcLDL1k", "5YGY14QC", "0YndsOWL", "fG8N9wp3",
];

/**
 * Load geo proxy config from disk or environment.
 */
function loadConfig(): GeoProxyConfig | null {
  // Check env first
  const envUser = process.env.IPROYAL_USERNAME;
  const envPass = process.env.IPROYAL_PASSWORD;
  if (envUser && envPass) {
    return {
      host: "geo.iproyal.com",
      port: 12321,
      username: envUser,
      basePassword: envPass,
      regions: DEFAULT_REGIONS,
    };
  }

  // Check config file: the data dir's first (CBROWSER_DATA_DIR, where
  // uninstall looks for it), then ~/.cbrowser, then the working directory.
  const configPaths = [...new Set([
    join(process.env.CBROWSER_DATA_DIR || join(homedir(), ".cbrowser"), "geo-proxy.json"),
    join(homedir(), ".cbrowser", "geo-proxy.json"),
    join(process.cwd(), "geo-proxy.json"),
  ])];

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        // This file holds basePassword and is written by hand, so there is no
        // write site to harden -- load time is the only place its permissions
        // can be noticed. Warn rather than refuse: the credential still works,
        // and breaking a working setup over a permission bit would be a worse
        // trade than telling the user about it. Measured on a real install:
        // mode 0664, i.e. every account on the box could read the password.
        const loose = describeLoosePermissions(configPath);
        if (loose) console.warn(`[CBrowser] ${loose}`);

        const raw = readFileSync(configPath, "utf-8");
        const config = JSON.parse(raw) as GeoProxyConfig;
        return { ...config, regions: { ...DEFAULT_REGIONS, ...config.regions } };
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * Get proxy config for a geo region.
 *
 * @param region - Region name (e.g., "us-west", "uk", "germany")
 * @returns ProxyConfig for Playwright, or null if not configured
 */
export function getGeoProxy(region: string): ProxyConfig | null {
  const config = loadConfig();
  if (!config) return null;

  const regionConfig = config.regions[region.toLowerCase()];
  if (!regionConfig) return null;

  // Build password with geo targeting and sticky session
  const sessionId = SESSION_IDS[sessionCounter % SESSION_IDS.length];
  sessionCounter++;

  let password = config.basePassword;
  password += `_country-${regionConfig.country}`;
  if (regionConfig.city) {
    password += `_city-${regionConfig.city}`;
  }
  password += `_session-${sessionId}_lifetime-30m`;

  return {
    server: `http://${config.host}:${config.port}`,
    username: config.username,
    password,
  };
}

/**
 * List available geo regions.
 */
export function listGeoRegions(): string[] {
  const config = loadConfig();
  if (!config) return [];
  return Object.keys(config.regions);
}

/**
 * Check if geo proxy is configured.
 */
export function isGeoProxyConfigured(): boolean {
  return loadConfig() !== null;
}
