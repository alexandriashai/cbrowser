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
 * ⚠️ SECURITY NOTICE:
 * - Lightpanda is BETA software with no formal security audit
 * - No SECURITY.md or vulnerability disclosure policy
 * - Cloud mode routes traffic through lightpanda.io servers
 * - Never use for credential handling or sensitive operations
 *
 * @see https://lightpanda.io/
 * @see https://github.com/lightpanda-io/browser
 * @since 18.20.0
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
  /** Explicitly opt-in to Lightpanda (required for use) */
  explicitOptIn?: boolean;
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
  /** Security warning if using cloud mode */
  securityWarning?: string;
}

/**
 * Operations that should NEVER use Lightpanda due to security concerns
 */
export type SensitiveOperation =
  | "auth"
  | "login"
  | "credential"
  | "payment"
  | "checkout"
  | "password"
  | "2fa"
  | "mfa"
  | "oauth";

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
    explicitOptIn: false, // Must be explicitly set
  };
}

/**
 * Check if Lightpanda is configured (env vars set)
 */
export function isLightpandaConfigured(): boolean {
  const config = getLightpandaConfig();
  return !!(config.endpoint || config.token);
}

/**
 * Check if an operation is sensitive and should never use Lightpanda
 */
export function isSensitiveOperation(operation?: string): boolean {
  if (!operation) return false;
  const lower = operation.toLowerCase();
  const sensitivePatterns: SensitiveOperation[] = [
    "auth",
    "login",
    "credential",
    "payment",
    "checkout",
    "password",
    "2fa",
    "mfa",
    "oauth",
  ];
  return sensitivePatterns.some((pattern) => lower.includes(pattern));
}

/**
 * Check if Lightpanda should be used for the current operation
 *
 * SECURITY: Lightpanda is OPT-IN ONLY. It will NOT be used automatically
 * even if configured. The caller must explicitly set explicitOptIn: true.
 *
 * Lightpanda is suitable for:
 * - Agent-ready audits (public page analysis)
 * - Empathy audits (accessibility testing)
 * - Web scraping of public content
 * - Performance-critical batch operations
 *
 * Lightpanda is NOT suitable for:
 * - Any authentication flows
 * - Credential handling
 * - Payment/checkout flows
 * - Visual regression testing
 * - Cross-browser testing
 */
export function shouldUseLightpanda(options: {
  headless?: boolean;
  requiresVisualAccuracy?: boolean;
  browserType?: string;
  /** Must be true to enable Lightpanda */
  explicitOptIn?: boolean;
  /** Operation name - checked against sensitive patterns */
  operation?: string;
}): boolean {
  // SECURITY: Require explicit opt-in
  if (!options.explicitOptIn) {
    return false;
  }

  // SECURITY: Block sensitive operations
  if (isSensitiveOperation(options.operation)) {
    if (process.env.CBROWSER_VERBOSE === "true") {
      console.log(`⚠️  Lightpanda blocked for sensitive operation: ${options.operation}`);
    }
    return false;
  }

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
 * Get security warning for cloud mode
 */
function getCloudSecurityWarning(): string {
  return `
⚠️  CLOUD MODE SECURITY WARNING:
   Your browser traffic will be routed through lightpanda.io servers.
   They can see: URLs visited, page content, cookies, and form data.

   DO NOT use cloud mode for:
   • Authentication flows
   • Handling credentials or passwords
   • Payment or checkout processes
   • Any sensitive data

   For sensitive operations, use local Lightpanda or Playwright Chromium.
`.trim();
}

/**
 * Connect to Lightpanda via CDP
 *
 * Lightpanda exposes a Chrome DevTools Protocol (CDP) interface,
 * which Playwright can connect to using chromium.connectOverCDP().
 *
 * ⚠️ SECURITY: Cloud connections route traffic through lightpanda.io.
 * Never use for sensitive operations.
 *
 * @example
 * ```typescript
 * // Local Lightpanda instance (recommended)
 * const result = await connectToLightpanda({ endpoint: "ws://127.0.0.1:9222" });
 *
 * // Lightpanda Cloud (⚠️ traffic visible to lightpanda.io)
 * const result = await connectToLightpanda({ token: "your-api-token" });
 * ```
 */
export async function connectToLightpanda(
  config?: LightpandaConfig
): Promise<LightpandaConnectionResult> {
  const cfg = config || getLightpandaConfig();
  const endpoint = buildLightpandaUrl(cfg);
  const isCloud = endpoint.includes("cloud.lightpanda.io");

  // Add security warning for cloud mode
  const securityWarning = isCloud ? getCloudSecurityWarning() : undefined;

  if (isCloud && process.env.CBROWSER_VERBOSE === "true") {
    console.log(securityWarning);
  }

  try {
    // Use Playwright's CDP connection
    const browser = await chromium.connectOverCDP(endpoint, {
      timeout: cfg.timeout || 30000,
    });

    console.log(`🐼 Connected to Lightpanda ${isCloud ? "(Cloud ⚠️)" : "(Local)"}`);

    return {
      success: true,
      browser,
      endpoint,
      isCloud,
      securityWarning,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      error: `Failed to connect to Lightpanda at ${endpoint}: ${message}`,
      endpoint,
      isCloud,
      securityWarning,
    };
  }
}

/**
 * Launch a browser with Lightpanda (OPT-IN ONLY)
 *
 * ⚠️ SECURITY: Lightpanda is NOT used automatically. You must explicitly
 * set explicitOptIn: true to use it. This is a security measure because:
 * - Lightpanda is beta software with no security audit
 * - Cloud mode exposes traffic to third party
 * - It should never be used for sensitive operations
 *
 * @example
 * ```typescript
 * // Explicit opt-in required
 * const { browser, isLightpanda } = await launchWithLightpandaFallback({
 *   headless: true,
 *   explicitOptIn: true,  // Required!
 *   operation: "agent-ready-audit",  // Checked against sensitive patterns
 * });
 * ```
 */
export async function launchWithLightpandaFallback(options: {
  headless?: boolean;
  requiresVisualAccuracy?: boolean;
  browserType?: "chromium" | "firefox" | "webkit";
  launchOptions?: Parameters<typeof chromium.launch>[0];
  /** Must be true to enable Lightpanda - OPT-IN ONLY */
  explicitOptIn?: boolean;
  /** Operation name - sensitive operations are blocked */
  operation?: string;
}): Promise<{ browser: Browser; isLightpanda: boolean; securityWarning?: string }> {
  const {
    headless = true,
    requiresVisualAccuracy = false,
    browserType = "chromium",
    launchOptions = {},
    explicitOptIn = false,
    operation,
  } = options;

  // Check if we should try Lightpanda (requires explicit opt-in)
  if (shouldUseLightpanda({ headless, requiresVisualAccuracy, browserType, explicitOptIn, operation })) {
    const result = await connectToLightpanda();

    if (result.success && result.browser) {
      return {
        browser: result.browser,
        isLightpanda: true,
        securityWarning: result.securityWarning,
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
  securityWarning?: string;
}> {
  const config = getLightpandaConfig();
  const configured = isLightpandaConfigured();
  const endpoint = buildLightpandaUrl(config);
  const isCloud = endpoint.includes("cloud.lightpanda.io");
  const securityWarning = isCloud ? getCloudSecurityWarning() : undefined;

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
      securityWarning,
    };
  }

  return {
    configured: true,
    available: false,
    endpoint,
    isCloud,
    error: result.error,
    securityWarning,
  };
}

/**
 * Lightpanda setup instructions with security warnings
 */
export const LIGHTPANDA_SETUP_GUIDE = `
╔══════════════════════════════════════════════════════════════════════════════╗
║  Lightpanda Setup - High-Performance Headless Browser                        ║
╚══════════════════════════════════════════════════════════════════════════════╝

Lightpanda is 11x faster and uses 9x less memory than Chrome headless.
It's ideal for AI agents, web scraping, and automated testing.

━━━ ⚠️ SECURITY NOTICE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lightpanda is BETA software. Before using, understand:

  🔴 NO SECURITY AUDIT - No formal security review or SECURITY.md
  🔴 BETA STATUS - Crashes and bugs are expected
  🔴 CLOUD EXPOSURE - Cloud mode routes traffic through lightpanda.io
  🔴 OPT-IN ONLY - Requires explicit --lightpanda flag

NEVER use Lightpanda for:
  ✗ Authentication or login flows
  ✗ Credential or password handling
  ✗ Payment or checkout processes
  ✗ Any sensitive data operations

━━━ Option 1: Local Installation (Recommended) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Docker (isolates Lightpanda from your system):
  docker run -d --name lightpanda -p 9222:9222 lightpanda/browser:nightly

Binary (Linux/macOS):
  curl -LO https://github.com/lightpanda-io/browser/releases/latest/download/lightpanda
  chmod +x lightpanda
  ./lightpanda serve --host 127.0.0.1 --port 9222

Then set environment variable:
  export LIGHTPANDA_ENDPOINT=ws://127.0.0.1:9222

━━━ Option 2: Lightpanda Cloud (⚠️ Third-Party Data Exposure) ━━━━━━━━━━━━━━━━

WARNING: Cloud mode sends ALL browser traffic through lightpanda.io servers.
They can see: URLs, page content, cookies, form submissions.

Only use for PUBLIC content you don't mind sharing.

1. Sign up at https://lightpanda.io/
2. Get your API token from the dashboard
3. Set environment variable:
   export LIGHTPANDA_TOKEN=your-api-token

━━━ Usage (OPT-IN REQUIRED) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lightpanda is NOT used automatically. You must explicitly opt-in:

  # Check status
  npx cbrowser lightpanda-status

  # Take screenshot with Lightpanda (--lightpanda flag required)
  npx cbrowser screenshot https://example.com --lightpanda

  # Run audit with Lightpanda
  npx cbrowser agent-ready-audit https://example.com --lightpanda

━━━ When to Use Lightpanda ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Good for (public, non-sensitive):
  • Agent-ready audits on public sites
  • Empathy audits (accessibility testing)
  • Web scraping public content
  • Performance benchmarking
  • Batch operations on public pages

❌ Never use for:
  • Visual regression testing (different rendering)
  • Cross-browser testing (Chromium only)
  • Authentication flows
  • Any operation with credentials
  • Payment or checkout testing

━━━ More Information ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GitHub: https://github.com/lightpanda-io/browser
Documentation: https://lightpanda.io/docs
CBrowser Integration: https://cbrowser.ai/docs/lightpanda
`;

/**
 * Security warning constant for display
 */
export const LIGHTPANDA_SECURITY_WARNING = `
⚠️  LIGHTPANDA SECURITY NOTICE

Lightpanda is beta software with no formal security audit.
• No SECURITY.md or vulnerability disclosure process
• No third-party code audit documented
• Cloud mode exposes traffic to lightpanda.io servers

Use only for public, non-sensitive operations.
Never use for authentication, credentials, or payments.
`.trim();
