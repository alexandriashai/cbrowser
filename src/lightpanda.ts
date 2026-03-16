/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Lightpanda Integration
 *
 * Lightpanda is a high-performance headless browser written in Zig.
 * It's 11x faster and uses 9x less memory than Chrome headless.
 *
 * This module provides CDP-based integration with Playwright, allowing
 * CBrowser to use Lightpanda as an alternative browser backend.
 *
 * @see https://lightpanda.io/
 * @since 18.19.0
 */

import { chromium, type Browser } from "playwright";

/**
 * Lightpanda connection configuration
 */
export interface LightpandaConfig {
  /** WebSocket endpoint (e.g., ws://127.0.0.1:9222, wss://cloud.lightpanda.io/ws) */
  endpoint?: string;
  /** API token for cloud connections */
  token?: string;
  /** Connection timeout in ms (default: 30000) */
  timeout?: number;
}

/**
 * Lightpanda connection result
 */
export interface LightpandaConnectionResult {
  success: boolean;
  browser?: Browser;
  endpoint?: string;
  error?: string;
  isCloud: boolean;
}

/**
 * Default local endpoint for Lightpanda
 */
export const LIGHTPANDA_LOCAL_ENDPOINT = "ws://127.0.0.1:9222";

/**
 * Cloud endpoint template
 */
export const LIGHTPANDA_CLOUD_ENDPOINT = "wss://euwest.cloud.lightpanda.io/ws";

/**
 * Get Lightpanda configuration from environment variables
 */
export function getLightpandaConfig(): LightpandaConfig {
  return {
    endpoint: process.env.LIGHTPANDA_ENDPOINT,
    token: process.env.LIGHTPANDA_TOKEN,
    timeout: parseInt(process.env.LIGHTPANDA_TIMEOUT || "30000", 10) || 30000,
  };
}

/**
 * Check if Lightpanda is configured and should be used
 */
export function isLightpandaConfigured(): boolean {
  const config = getLightpandaConfig();
  // Configured if either local endpoint is set, or cloud token is provided
  return !!(config.endpoint || config.token);
}

/**
 * Check if Lightpanda should be preferred for the current operation
 *
 * Lightpanda is preferred for:
 * - Headless operations (no GUI needed)
 * - Non-visual audits (agent-ready, empathy audit, etc.)
 * - Performance-critical batch operations
 *
 * Lightpanda is NOT suitable for:
 * - Visual regression testing (rendering differences)
 * - Cross-browser testing (only Chromium-compatible)
 * - Operations requiring full browser feature parity
 */
export function shouldUseLightpanda(options: {
  headless?: boolean;
  requiresVisualAccuracy?: boolean;
  browserType?: string;
}): boolean {
  // Only use Lightpanda for headless chromium operations
  if (options.browserType && options.browserType !== "chromium") {
    return false;
  }

  // Don't use for visual accuracy requirements
  if (options.requiresVisualAccuracy) {
    return false;
  }

  // Only use for headless mode
  if (options.headless === false) {
    return false;
  }

  // Check if configured
  return isLightpandaConfigured();
}

/**
 * Build the Lightpanda WebSocket URL
 */
export function buildLightpandaUrl(config: LightpandaConfig): string {
  // If explicit endpoint provided, use it
  if (config.endpoint) {
    let url = config.endpoint;
    // Append token if provided and endpoint doesn't have it
    if (config.token && !url.includes("token=")) {
      const separator = url.includes("?") ? "&" : "?";
      url = `${url}${separator}token=${config.token}`;
    }
    return url;
  }

  // If only token provided, use cloud endpoint
  if (config.token) {
    return `${LIGHTPANDA_CLOUD_ENDPOINT}?token=${config.token}`;
  }

  // Default to local endpoint
  return LIGHTPANDA_LOCAL_ENDPOINT;
}

/**
 * Check if a Lightpanda server is available at the given endpoint
 *
 * Uses Playwright's connectOverCDP with a short timeout to verify connectivity.
 */
export async function checkLightpandaAvailability(
  endpoint: string = LIGHTPANDA_LOCAL_ENDPOINT,
  timeout: number = 5000
): Promise<boolean> {
  try {
    const browser = await chromium.connectOverCDP(endpoint, { timeout });
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Connect to Lightpanda via CDP
 *
 * Lightpanda exposes a Chrome DevTools Protocol (CDP) interface,
 * which Playwright can connect to using chromium.connectOverCDP().
 *
 * @example
 * ```typescript
 * // Local Lightpanda instance
 * const result = await connectToLightpanda({ endpoint: "ws://127.0.0.1:9222" });
 *
 * // Lightpanda Cloud
 * const result = await connectToLightpanda({ token: "your-api-token" });
 * ```
 */
export async function connectToLightpanda(
  config?: LightpandaConfig
): Promise<LightpandaConnectionResult> {
  const cfg = config || getLightpandaConfig();
  const endpoint = buildLightpandaUrl(cfg);
  const isCloud = endpoint.includes("cloud.lightpanda.io");

  try {
    // Use Playwright's CDP connection
    const browser = await chromium.connectOverCDP(endpoint, {
      timeout: cfg.timeout || 30000,
    });

    console.log(`🐼 Connected to Lightpanda ${isCloud ? "(Cloud)" : "(Local)"}`);

    return {
      success: true,
      browser,
      endpoint,
      isCloud,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      error: `Failed to connect to Lightpanda at ${endpoint}: ${message}`,
      endpoint,
      isCloud,
    };
  }
}

/**
 * Launch a browser with Lightpanda fallback
 *
 * Tries Lightpanda first (if configured), then falls back to Playwright.
 * This enables automatic performance optimization when Lightpanda is available.
 *
 * @example
 * ```typescript
 * // Environment: LIGHTPANDA_ENDPOINT=ws://127.0.0.1:9222
 * const browser = await launchWithLightpandaFallback({ headless: true });
 * // Uses Lightpanda if available, otherwise Playwright Chromium
 * ```
 */
export async function launchWithLightpandaFallback(options: {
  headless?: boolean;
  requiresVisualAccuracy?: boolean;
  browserType?: "chromium" | "firefox" | "webkit";
  launchOptions?: Parameters<typeof chromium.launch>[0];
}): Promise<{ browser: Browser; isLightpanda: boolean }> {
  const { headless = true, requiresVisualAccuracy = false, browserType = "chromium", launchOptions = {} } = options;

  // Check if we should try Lightpanda
  if (shouldUseLightpanda({ headless, requiresVisualAccuracy, browserType })) {
    const result = await connectToLightpanda();

    if (result.success && result.browser) {
      return {
        browser: result.browser,
        isLightpanda: true,
      };
    }

    // Log fallback reason if verbose
    if (process.env.CBROWSER_VERBOSE === "true") {
      console.log(`⚠️  Lightpanda unavailable: ${result.error}`);
      console.log("   Falling back to Playwright Chromium...");
    }
  }

  // Fall back to Playwright
  const { chromium: playwrightChromium, firefox, webkit } = await import("playwright");

  const launchers = {
    chromium: playwrightChromium,
    firefox,
    webkit,
  };

  const launcher = launchers[browserType] || playwrightChromium;
  const browser = await launcher.launch({
    headless,
    ...launchOptions,
  });

  return {
    browser,
    isLightpanda: false,
  };
}

/**
 * Get Lightpanda status information
 */
export async function getLightpandaStatus(): Promise<{
  configured: boolean;
  available: boolean;
  endpoint: string;
  isCloud: boolean;
  error?: string;
}> {
  const config = getLightpandaConfig();
  const configured = isLightpandaConfigured();
  const endpoint = buildLightpandaUrl(config);
  const isCloud = endpoint.includes("cloud.lightpanda.io");

  if (!configured) {
    return {
      configured: false,
      available: false,
      endpoint: LIGHTPANDA_LOCAL_ENDPOINT,
      isCloud: false,
    };
  }

  // Try to connect
  const result = await connectToLightpanda(config);

  if (result.success && result.browser) {
    await result.browser.close();
    return {
      configured: true,
      available: true,
      endpoint,
      isCloud,
    };
  }

  return {
    configured: true,
    available: false,
    endpoint,
    isCloud,
    error: result.error,
  };
}

/**
 * Lightpanda setup instructions
 */
export const LIGHTPANDA_SETUP_GUIDE = `
╔══════════════════════════════════════════════════════════════════════════════╗
║  Lightpanda Setup - High-Performance Headless Browser                        ║
╚══════════════════════════════════════════════════════════════════════════════╝

Lightpanda is 11x faster and uses 9x less memory than Chrome headless.
It's ideal for AI agents, web scraping, and automated testing.

━━━ Option 1: Local Installation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Docker (recommended):
  docker run -d --name lightpanda -p 9222:9222 lightpanda/browser:nightly

Binary (Linux/macOS):
  curl -LO https://github.com/nicecoder/lightpanda/releases/latest/download/lightpanda
  chmod +x lightpanda
  ./lightpanda serve --host 127.0.0.1 --port 9222

Then set environment variable:
  export LIGHTPANDA_ENDPOINT=ws://127.0.0.1:9222

━━━ Option 2: Lightpanda Cloud ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Sign up at https://lightpanda.io/
2. Get your API token from the dashboard
3. Set environment variable:
   export LIGHTPANDA_TOKEN=your-api-token

━━━ Verification ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Check status:
  npx cbrowser lightpanda-status

Test connection:
  npx cbrowser screenshot https://example.com --lightpanda

━━━ When to Use Lightpanda ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Great for:
  • Agent-ready audits
  • Empathy audits
  • Web scraping
  • API testing
  • Performance-critical batch operations

❌ Not suitable for:
  • Visual regression testing (use Playwright Chromium)
  • Cross-browser testing (Firefox/WebKit not supported)
  • Operations requiring pixel-perfect rendering

━━━ More Information ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Documentation: https://lightpanda.io/docs
GitHub: https://github.com/nicecoder/lightpanda
CBrowser Integration: https://cbrowser.ai/docs/lightpanda
`;
