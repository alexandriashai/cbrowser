#!/usr/bin/env node
/**
 * CBrowser - Cognitive Browser Automation
 *
 * Copyright (c) 2026 WF Media (Alexandria Eden)
 * Email: alexandria.shai.eden@gmail.com
 *
 * This source code is licensed under the Business Source License 1.1
 * found in the LICENSE file in the root directory of this source tree.
 *
 * Non-production use is permitted. Production use requires a commercial license.
 * See LICENSE for full terms.
 */

/**
 * CBrowser Remote MCP Server
 *
 * HTTP-based MCP server for remote access via claude.ai custom connectors.
 * Uses StreamableHTTPServerTransport for HTTP/SSE communication.
 * Supports OAuth 2.1 via Auth0 for claude.ai integration.
 *
 * Run with: cbrowser mcp-remote
 * Or: npx cbrowser mcp-remote
 * Or: node dist/mcp-server-remote.js
 *
 * Environment variables:
 *   PORT - Port to listen on (default: 3000)
 *   HOST - Host to bind to (default: 0.0.0.0)
 *   MCP_SESSION_MODE - 'stateful' or 'stateless' (default: stateless)
 *   MCP_API_KEY - API key for authentication (optional, if not set server is open)
 *   MCP_API_KEYS - Comma-separated list of valid API keys (optional, alternative to MCP_API_KEY)
 *
 * Auth0 OAuth Environment Variables:
 *   AUTH0_DOMAIN - Your Auth0 tenant domain (e.g., 'your-tenant.auth0.com')
 *   AUTH0_AUDIENCE - API audience/identifier (e.g., 'https://cbrowser-mcp.yourdomain.com')
 *   AUTH0_CLIENT_ID - Optional: Client ID for static registration
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { CBrowser } from "./browser.js";
import { ensureDirectories, getStatusInfo } from "./config.js";

// Visual module imports
import {
  runVisualRegression,
  runCrossBrowserTest,
  runResponsiveTest,
  runABComparison,
  crossBrowserDiff,
  captureVisualBaseline,
  listVisualBaselines,
} from "./visual/index.js";

// Testing module imports
import {
  runNLTestSuite,
  parseNLTestSuite,
  dryRunNLTestSuite,
  repairTest,
  detectFlakyTests,
  generateCoverageMap,
} from "./testing/index.js";
import type { NLTestCase, NLTestStep } from "./types.js";

// Analysis module imports
import {
  huntBugs,
  runChaosTest,
  comparePersonas,
  findElementByIntent,
  runAgentReadyAudit,
  runCompetitiveBenchmark,
  runEmpathyAudit,
} from "./analysis/index.js";

// Accessibility personas for empathy audit
import { listAccessibilityPersonas, getAccessibilityPersona } from "./personas.js";

// Persona imports for cognitive journey
import {
  getPersona,
  getAnyPersona,
  listPersonas,
  listAllPersonas,
  getCognitiveProfile,
  createCognitivePersona,
  saveCustomPersona,
} from "./personas.js";

// Import API key check for bridge workflow detection
import { isApiKeyConfigured } from "./cognitive/index.js";
import type {
  CognitiveState,
  AbandonmentThresholds,
  CognitiveTraits,
  Persona,
  AccessibilityPersona,
} from "./types.js";

// Performance module imports
import {
  capturePerformanceBaseline,
  detectPerformanceRegression,
  listPerformanceBaselines,
} from "./performance/index.js";

// Values system (Schwartz's 10 Universal Values)
import {
  getPersonaValues,
  hasPersonaValues,
  PERSONA_VALUE_PROFILES,
  calculatePatternSusceptibility,
  rankInfluencePatternsForProfile,
  INFLUENCE_PATTERNS,
} from "./values/index.js";

// Version from package.json - single source of truth
import { VERSION } from "./version.js";

// Stealth/Enterprise loader (v16.2.0)
import {
  getEnforcer,
  isEnterpriseAvailable,
  getEnterpriseVersion,
  type IConstitutionalEnforcer,
  type StealthConfig,
} from "./stealth/index.js";

// Shared browser instance
let browser: CBrowser | null = null;

// Stealth state (enterprise integration)
const stealthEnforcer: IConstitutionalEnforcer | null = null;
const stealthConfig: Partial<StealthConfig> | null = null;

async function getBrowser(): Promise<CBrowser> {
  if (!browser) {
    // Pass proxy configuration from stealth config if available
    const proxyConfig = stealthConfig?.proxy;

    browser = new CBrowser({
      headless: true,
      persistent: true,
      proxy: proxyConfig,
    });

    // If stealth is enabled and we have an enforcer, apply to new pages
    if (stealthEnforcer && stealthConfig?.enabled) {
      const page = await browser.getPage();
      if (page) {
        await stealthEnforcer.applyStealthMeasures(page);
        if (proxyConfig) {
          console.log(`[Stealth] Browser launched with proxy: ${proxyConfig.server.replace(/:[^:@]*@/, ":****@")}`);
        }
      }
    }
  }
  return browser;
}

// Transport instances by session (for stateful mode)
const transports = new Map<string, StreamableHTTPServerTransport>();

// =========================================================================
// Auth0 OAuth Configuration
// =========================================================================

interface Auth0Config {
  domain: string;
  audience: string;
  clientId?: string;
  jwks: ReturnType<typeof createRemoteJWKSet>;
}

let auth0Config: Auth0Config | null = null;

// Token cache to avoid hitting Auth0 rate limits
const tokenCache = new Map<string, { payload: JWTPayload; expires: number }>();
const TOKEN_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Initialize Auth0 configuration from environment variables
 */
function getAuth0Config(): Auth0Config | null {
  const domain = process.env.AUTH0_DOMAIN;
  const audience = process.env.AUTH0_AUDIENCE;

  if (!domain || !audience) {
    return null;
  }

  if (!auth0Config || auth0Config.domain !== domain) {
    auth0Config = {
      domain,
      audience,
      clientId: process.env.AUTH0_CLIENT_ID,
      jwks: createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`)),
    };
  }

  return auth0Config;
}

/**
 * Validate Auth0 token - supports both JWT and opaque tokens with caching
 */
async function validateAuth0Token(token: string): Promise<JWTPayload | null> {
  const config = getAuth0Config();
  if (!config) {
    return null;
  }

  // Check cache first (use first 32 chars of token as key for security)
  const cacheKey = token.substring(0, 32);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.payload;
  }

  const tokenParts = token.split('.');

  // If it's a proper JWT (3 parts), validate locally
  if (tokenParts.length === 3) {
    try {
      const { payload } = await jwtVerify(token, config.jwks, {
        issuer: `https://${config.domain}/`,
        audience: config.audience,
      });
      console.log("JWT validated successfully for subject:", payload.sub);
      // Cache the result
      tokenCache.set(cacheKey, { payload, expires: Date.now() + TOKEN_CACHE_TTL });
      return payload;
    } catch (error) {
      console.error("JWT validation failed:", error instanceof Error ? error.message : error);
      return null;
    }
  }

  // For opaque/JWE tokens (5 parts), validate via Auth0's userinfo endpoint
  console.log("Opaque token detected, validating via Auth0 userinfo...");
  try {
    const response = await fetch(`https://${config.domain}/userinfo`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.ok) {
      const userinfo = await response.json();
      console.log("Token validated via userinfo for:", userinfo.sub || userinfo.email);
      // Cache the result
      tokenCache.set(cacheKey, { payload: userinfo as JWTPayload, expires: Date.now() + TOKEN_CACHE_TTL });
      return userinfo as JWTPayload;
    } else {
      console.error("Userinfo validation failed:", response.status, await response.text());
      return null;
    }
  } catch (error) {
    console.error("Userinfo request failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Get Protected Resource Metadata (RFC 9728)
 * This tells OAuth clients where to authenticate
 */
function getProtectedResourceMetadata(): object | null {
  const config = getAuth0Config();
  if (!config) {
    return null;
  }

  const serverUrl = process.env.MCP_SERVER_URL || `https://localhost:${process.env.PORT || 3000}`;

  return {
    resource: serverUrl,
    authorization_servers: [`https://${config.domain}`],
    bearer_methods_supported: ["header"],
    scopes_supported: ["openid", "profile", "cbrowser:read", "cbrowser:write"],
    resource_documentation: "https://github.com/alexandriashai/cbrowser#readme",
  };
}

/**
 * Get configured API keys from environment
 */
function getApiKeys(): Set<string> | null {
  const singleKey = process.env.MCP_API_KEY;
  const multipleKeys = process.env.MCP_API_KEYS;

  if (!singleKey && !multipleKeys) {
    return null; // No authentication configured
  }

  const keys = new Set<string>();
  if (singleKey) {
    keys.add(singleKey);
  }
  if (multipleKeys) {
    multipleKeys.split(",").map(k => k.trim()).filter(k => k).forEach(k => keys.add(k));
  }
  return keys;
}

/**
 * Validate API key from request headers
 * Supports: Authorization: Bearer <key> or X-API-Key: <key>
 */
function validateApiKey(req: IncomingMessage, validKeys: Set<string>): boolean {
  // Check Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (validKeys.has(token)) {
      return true;
    }
  }

  // Check X-API-Key header
  const apiKeyHeader = req.headers["x-api-key"];
  if (typeof apiKeyHeader === "string" && validKeys.has(apiKeyHeader)) {
    return true;
  }

  return false;
}

/**
 * Validate authentication - supports both API keys and Auth0 JWT
 * Returns: { valid: true } or { valid: false, reason: string }
 */
async function validateAuth(
  req: IncomingMessage,
  apiKeys: Set<string> | null,
  auth0Enabled: boolean
): Promise<{ valid: boolean; reason?: string; user?: JWTPayload }> {
  const authHeader = req.headers.authorization;

  // Try API key first (if configured)
  if (apiKeys && apiKeys.size > 0) {
    if (validateApiKey(req, apiKeys)) {
      return { valid: true };
    }
  }

  // Try Auth0 JWT (if configured)
  if (auth0Enabled && authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = await validateAuth0Token(token);
    if (payload) {
      return { valid: true, user: payload };
    }
    return { valid: false, reason: "Invalid or expired JWT token" };
  }

  // No valid auth found
  if (!apiKeys && !auth0Enabled) {
    // No auth configured - allow all
    return { valid: true };
  }

  return { valid: false, reason: "Authentication required" };
}

/**
 * Send 401 Unauthorized response with proper WWW-Authenticate header
 */
function sendUnauthorized(res: ServerResponse, message?: string): void {
  const auth0 = getAuth0Config();
  let wwwAuth = 'Bearer realm="cbrowser-mcp"';

  if (auth0) {
    // Include Auth0 authorization server info per RFC 9728
    wwwAuth = `Bearer realm="cbrowser-mcp", authorization_uri="https://${auth0.domain}/authorize", token_uri="https://${auth0.domain}/oauth/token"`;
  }

  res.writeHead(401, {
    "Content-Type": "application/json",
    "WWW-Authenticate": wwwAuth,
  });
  res.end(JSON.stringify({
    error: "Unauthorized",
    message: message || "Valid authentication required. Use Authorization: Bearer <token>",
    ...(auth0 && {
      auth0_domain: auth0.domain,
      authorization_endpoint: `https://${auth0.domain}/authorize`,
      token_endpoint: `https://${auth0.domain}/oauth/token`,
    }),
  }));
}

/**
 * Configure all CBrowser tools on an MCP server instance.
 * This is shared between stdio and HTTP transports.
 */
function configureMcpTools(server: McpServer): void {
  // =========================================================================
  // Navigation Tools
  // =========================================================================

  server.tool(
    "navigate",
    "Navigate to a URL and take a screenshot",
    {
      url: z.string().url().describe("The URL to navigate to"),
    },
    async ({ url }) => {
      const b = await getBrowser();
      const result = await b.navigate(url);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              url: result.url,
              title: result.title,
              loadTime: result.loadTime,
              screenshot: result.screenshot,
            }, null, 2),
          },
        ],
      };
    }
  );

  // NOTE: cloudflare_detect and cloudflare_wait moved to Enterprise (v16.18.0)

  // =========================================================================
  // Interaction Tools
  // =========================================================================

  server.tool(
    "click",
    "Click an element on the page using text, selector, or description. Use verbose=true for detailed debug info on failure.",
    {
      selector: z.string().describe("Element to click (text content, CSS selector, or description)"),
      force: z.boolean().optional().describe("Bypass safety checks for destructive actions"),
      verbose: z.boolean().optional().describe("Return available elements and AI suggestions on failure"),
    },
    async ({ selector, force, verbose }) => {
      const b = await getBrowser();
      const result = await b.click(selector, { force, verbose });
      const response: Record<string, unknown> = {
        success: result.success,
        message: result.message,
        screenshot: result.screenshot,
      };
      if (verbose && !result.success) {
        if (result.availableElements) response.availableElements = result.availableElements;
        if (result.aiSuggestion) response.aiSuggestion = result.aiSuggestion;
        if (result.debugScreenshot) response.debugScreenshot = result.debugScreenshot;
      }
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }
  );

  server.tool(
    "smart_click",
    "Click with auto-retry and self-healing selectors. v11.8.0: Added confidence gating - only reports success if healed selector has >= 60% confidence.",
    {
      selector: z.string().describe("Element to click"),
      maxRetries: z.number().optional().default(3).describe("Maximum retry attempts"),
      dismissOverlays: z.boolean().optional().default(false).describe("Dismiss overlays before clicking"),
    },
    async ({ selector, maxRetries, dismissOverlays }) => {
      const b = await getBrowser();
      const result = await b.smartClick(selector, { maxRetries, dismissOverlays });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: result.success,
              attempts: result.attempts.length,
              finalSelector: result.finalSelector,
              message: result.message,
              aiSuggestion: result.aiSuggestion,
              // v11.8.0: Confidence gating fields
              confidence: result.confidence,
              healed: result.healed,
              healReason: result.healReason,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "dismiss_overlay",
    "Detect and dismiss modal overlays (cookie consent, age verification, newsletter popups). Constitutional Yellow zone.",
    {
      type: z.enum(["auto", "cookie", "age-verify", "newsletter", "custom"]).optional().default("auto").describe("Overlay type to detect"),
      customSelector: z.string().optional().describe("Custom CSS selector for overlay close button"),
    },
    async ({ type, customSelector }) => {
      const b = await getBrowser();
      const result = await b.dismissOverlay({ type, customSelector });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              dismissed: result.dismissed,
              overlaysFound: result.overlaysFound,
              overlaysDismissed: result.overlaysDismissed,
              details: result.details,
              suggestion: result.suggestion,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "fill",
    "Fill a form field with text. Use verbose=true for detailed debug info on failure.",
    {
      selector: z.string().describe("Input field to fill (name, placeholder, label, or selector)"),
      value: z.string().describe("Value to enter"),
      verbose: z.boolean().optional().describe("Return available inputs and AI suggestions on failure"),
    },
    async ({ selector, value, verbose }) => {
      const b = await getBrowser();
      const result = await b.fill(selector, value, { verbose });
      const response: Record<string, unknown> = {
        success: result.success,
        message: result.message,
      };
      if (verbose && !result.success) {
        if (result.availableInputs) response.availableInputs = result.availableInputs;
        if (result.aiSuggestion) response.aiSuggestion = result.aiSuggestion;
        if (result.debugScreenshot) response.debugScreenshot = result.debugScreenshot;
      }
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }
  );

  server.tool(
    "scroll",
    "Scroll the page in a direction. Use when content might be below the fold or to navigate long pages.",
    {
      direction: z.enum(["down", "up", "top", "bottom"]).default("down").describe("Scroll direction: down (400px), up (400px), top (page start), bottom (page end)"),
      amount: z.number().optional().describe("Custom scroll amount in pixels (overrides direction default)"),
    },
    async ({ direction, amount }) => {
      const b = await getBrowser();
      const page = await b.getPage();

      const scrollAmount = amount || 400;
      let scrollPosition = 0;
      let maxScroll = 0;

      try {
        switch (direction) {
          case "top":
            await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
            break;
          case "bottom":
            await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
            break;
          case "up":
            await page.evaluate((amt) => window.scrollBy({ top: -amt, behavior: "smooth" }), scrollAmount);
            break;
          case "down":
          default:
            await page.evaluate((amt) => window.scrollBy({ top: amt, behavior: "smooth" }), scrollAmount);
            break;
        }

        // Wait for scroll animation
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Get final scroll position
        const scrollInfo = await page.evaluate(() => ({
          scrollY: window.scrollY,
          maxScroll: document.body.scrollHeight - window.innerHeight,
        }));
        scrollPosition = scrollInfo.scrollY;
        maxScroll = scrollInfo.maxScroll;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                direction,
                scrollPosition,
                maxScroll,
                atTop: scrollPosition <= 0,
                atBottom: scrollPosition >= maxScroll - 10,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: (error as Error).message,
              }, null, 2),
            },
          ],
        };
      }
    }
  );

  // =========================================================================
  // Extraction Tools
  // =========================================================================

  server.tool(
    "screenshot",
    "Take a screenshot of the current page",
    {
      path: z.string().optional().describe("Optional path to save the screenshot"),
    },
    async ({ path }) => {
      const b = await getBrowser();
      const file = await b.screenshot(path);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ screenshot: file }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "extract",
    "Extract data from the page",
    {
      what: z.enum(["links", "headings", "forms", "images", "text"]).describe("What to extract"),
    },
    async ({ what }) => {
      const b = await getBrowser();
      const result = await b.extract(what);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result.data, null, 2),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Assertion Tools
  // =========================================================================

  server.tool(
    "assert",
    "Assert a condition using natural language",
    {
      assertion: z.string().describe("Natural language assertion like \"page contains 'Welcome'\" or \"title is 'Home'\""),
    },
    async ({ assertion }) => {
      const b = await getBrowser();
      const result = await b.assert(assertion);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              passed: result.passed,
              message: result.message,
              actual: result.actual,
              expected: result.expected,
            }, null, 2),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Analysis Tools
  // =========================================================================

  server.tool(
    "analyze_page",
    "Analyze page structure for forms, buttons, links",
    {},
    async () => {
      const b = await getBrowser();
      const analysis = await b.analyzePage();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              title: analysis.title,
              forms: analysis.forms.length,
              buttons: analysis.buttons.length,
              links: analysis.links.length,
              hasLogin: analysis.hasLogin,
              hasSearch: analysis.hasSearch,
              hasNavigation: analysis.hasNavigation,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "generate_tests",
    "Generate test scenarios for a page",
    {
      url: z.string().url().optional().describe("URL to analyze (uses current page if not provided)"),
    },
    async ({ url }) => {
      const b = await getBrowser();
      const result = await b.generateTests(url);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              testsGenerated: result.tests.length,
              tests: result.tests.map(t => ({
                name: t.name,
                description: t.description,
                steps: t.steps.length,
              })),
            }, null, 2),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Session Tools
  // =========================================================================

  server.tool(
    "save_session",
    "Save browser session (cookies, storage) for later use",
    {
      name: z.string().describe("Name for the saved session"),
    },
    async ({ name }) => {
      const b = await getBrowser();
      await b.saveSession(name);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, sessionName: name }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "load_session",
    "Load a previously saved session",
    {
      name: z.string().describe("Name of the session to load"),
    },
    async ({ name }) => {
      const b = await getBrowser();
      const result = await b.loadSession(name);
      // v11.8.0: Return flat structure, not nested
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "list_sessions",
    "List all saved sessions with metadata (name, domain, cookies count, localStorage keys, created date, size)",
    {},
    async () => {
      const b = await getBrowser();
      const sessions = b.listSessionsDetailed();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ sessions }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "delete_session",
    "Delete a saved session by name",
    {
      name: z.string().describe("Name of the session to delete"),
    },
    async ({ name }) => {
      const b = await getBrowser();
      const deleted = b.deleteSession(name);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: deleted, name, message: deleted ? `Session '${name}' deleted` : `Session '${name}' not found` }),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Self-Healing Tools
  // =========================================================================

  server.tool(
    "heal_stats",
    "Get self-healing selector cache statistics",
    {},
    async () => {
      const b = await getBrowser();
      const stats = b.getSelectorCacheStats();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Visual Testing Tools (v7.0.0+)
  // =========================================================================

  server.tool(
    "visual_baseline",
    "Capture a visual baseline for a URL",
    {
      url: z.string().url().describe("URL to capture baseline for"),
      name: z.string().describe("Name for the baseline"),
    },
    async ({ url, name }) => {
      const result = await captureVisualBaseline(url, name, {});
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              name: result.name,
              url: result.url,
              timestamp: result.timestamp,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "visual_regression",
    "Run AI visual regression test against a baseline",
    {
      url: z.string().url().describe("URL to test"),
      baselineName: z.string().describe("Name of baseline to compare against"),
    },
    async ({ url, baselineName }) => {
      const result = await runVisualRegression(url, baselineName);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              passed: result.passed,
              similarityScore: result.analysis?.similarityScore,
              summary: result.analysis?.summary,
              changes: result.analysis?.changes?.length || 0,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "cross_browser_test",
    "Test page rendering across multiple browsers",
    {
      url: z.string().url().describe("URL to test"),
      browsers: z.array(z.enum(["chromium", "firefox", "webkit"])).optional().describe("Browsers to test"),
    },
    async ({ url, browsers }) => {
      const result = await runCrossBrowserTest(url, { browsers });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              url: result.url,
              overallStatus: result.overallStatus,
              summary: result.summary,
              screenshotCount: result.screenshots.length,
              comparisonCount: result.comparisons.length,
              ...(result.missingBrowsers?.length ? { missingBrowsers: result.missingBrowsers } : {}),
              ...(result.availableBrowsers ? { availableBrowsers: result.availableBrowsers } : {}),
              ...(result.suggestion ? { suggestion: result.suggestion } : {}),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "cross_browser_diff",
    "Quick diff of page metrics across browsers",
    {
      url: z.string().url().describe("URL to compare"),
      browsers: z.array(z.enum(["chromium", "firefox", "webkit"])).optional().describe("Browsers to compare"),
    },
    async ({ url, browsers }) => {
      const result = await crossBrowserDiff(url, browsers);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              url: result.url,
              browsers: result.browsers,
              differences: result.differences,
              metrics: result.metrics,
              ...(result.missingBrowsers?.length ? { missingBrowsers: result.missingBrowsers } : {}),
              ...(result.availableBrowsers ? { availableBrowsers: result.availableBrowsers } : {}),
              ...(result.suggestion ? { suggestion: result.suggestion } : {}),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "responsive_test",
    "Test page across different viewport sizes",
    {
      url: z.string().url().describe("URL to test"),
      viewports: z.array(z.string()).optional().describe("Viewport presets (mobile, tablet, desktop, etc.)"),
    },
    async ({ url, viewports }) => {
      const result = await runResponsiveTest(url, { viewports });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              url: result.url,
              overallStatus: result.overallStatus,
              summary: result.summary,
              viewportsCount: result.screenshots.length,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "ab_comparison",
    "Compare two URLs visually (staging vs production)",
    {
      urlA: z.string().url().describe("First URL (e.g., staging)"),
      urlB: z.string().url().describe("Second URL (e.g., production)"),
      labelA: z.string().optional().describe("Label for first URL"),
      labelB: z.string().optional().describe("Label for second URL"),
    },
    async ({ urlA, urlB, labelA, labelB }) => {
      const labels = labelA && labelB ? { a: labelA, b: labelB } : undefined;
      const result = await runABComparison(urlA, urlB, { labels });
      return {
        content: [
          {
            type: "text",
            // v11.11.0: Include full differences for structured diff (stress test fix)
            text: JSON.stringify({
              overallStatus: result.overallStatus,
              similarityScore: result.analysis?.similarityScore,
              summary: result.summary,
              // v11.11.0: Return detailed differences instead of just count
              differences: result.differences.slice(0, 10).map(d => ({
                type: d.type,
                severity: d.severity,
                description: d.description,
                affectedSide: d.affectedSide,
              })),
              differenceCount: result.differences.length,
              // v11.11.0: Include page structure comparison summary
              structureSummary: {
                a: {
                  headings: (result.screenshots.a as any).structure?.headings?.length || 0,
                  links: (result.screenshots.a as any).structure?.links?.length || 0,
                  forms: (result.screenshots.a as any).structure?.forms || 0,
                  buttons: (result.screenshots.a as any).structure?.buttons?.length || 0,
                },
                b: {
                  headings: (result.screenshots.b as any).structure?.headings?.length || 0,
                  links: (result.screenshots.b as any).structure?.links?.length || 0,
                  forms: (result.screenshots.b as any).structure?.forms || 0,
                  buttons: (result.screenshots.b as any).structure?.buttons?.length || 0,
                },
              },
              duration: result.duration,
            }, null, 2),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Testing Tools (v6.0.0+)
  // =========================================================================

  server.tool(
    "nl_test_file",
    "Run natural language test suite from a file. Returns step-level results with enriched error info, partial matches, and suggestions.",
    {
      filepath: z.string().describe("Path to the test file"),
      dryRun: z.boolean().optional().describe("Parse and display steps without executing"),
      fuzzyMatch: z.boolean().optional().describe("Use case-insensitive fuzzy matching for assertions"),
    },
    async ({ filepath, dryRun, fuzzyMatch }) => {
      const fs = await import("fs");
      if (!fs.existsSync(filepath)) {
        return { content: [{ type: "text", text: JSON.stringify({ error: `Test file not found: ${filepath}` }) }] };
      }
      const fileContent = fs.readFileSync(filepath, "utf-8");
      const suiteName = filepath.split("/").pop()?.replace(/\.[^.]+$/, "") || "Test Suite";
      const suite = parseNLTestSuite(fileContent, suiteName);

      if (dryRun) {
        const dryResult = dryRunNLTestSuite(suite);
        return { content: [{ type: "text", text: JSON.stringify(dryResult, null, 2) }] };
      }

      const result = await runNLTestSuite(suite, { fuzzyMatch: fuzzyMatch || false });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              name: result.name,
              total: result.summary.total,
              passed: result.summary.passed,
              failed: result.summary.failed,
              passRate: `${result.summary.passRate.toFixed(1)}%`,
              // v11.6.0: Step-level statistics for better granularity
              totalSteps: result.summary.totalSteps,
              passedSteps: result.summary.passedSteps,
              failedSteps: result.summary.failedSteps,
              stepPassRate: result.summary.stepPassRate ? `${result.summary.stepPassRate.toFixed(1)}%` : undefined,
              duration: result.duration,
              recommendations: result.recommendations,
              testResults: result.testResults.map(t => ({
                name: t.name,
                passed: t.passed,
                duration: t.duration,
                error: t.error,
                steps: t.stepResults.map(s => ({
                  instruction: s.instruction,
                  parsed: s.parsed,
                  passed: s.passed,
                  duration: s.duration,
                  error: s.error,
                  actualValue: s.actualValue,
                })),
              })),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "nl_test_inline",
    "Run natural language tests from inline content. Returns step-level results with enriched error info, partial matches, and suggestions.",
    {
      content: z.string().describe("Test content with instructions like 'go to https://...' and 'click login'"),
      name: z.string().optional().describe("Name for the test suite"),
      dryRun: z.boolean().optional().describe("Parse and display steps without executing"),
      fuzzyMatch: z.boolean().optional().describe("Use case-insensitive fuzzy matching for assertions"),
    },
    async ({ content, name, dryRun, fuzzyMatch }) => {
      const suite = parseNLTestSuite(content, name || "Inline Test");

      if (dryRun) {
        const dryResult = dryRunNLTestSuite(suite);
        return { content: [{ type: "text", text: JSON.stringify(dryResult, null, 2) }] };
      }

      const result = await runNLTestSuite(suite, { fuzzyMatch: fuzzyMatch || false });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              name: result.name,
              total: result.summary.total,
              passed: result.summary.passed,
              failed: result.summary.failed,
              passRate: `${result.summary.passRate.toFixed(1)}%`,
              // v11.6.0: Step-level statistics for better granularity
              totalSteps: result.summary.totalSteps,
              passedSteps: result.summary.passedSteps,
              failedSteps: result.summary.failedSteps,
              stepPassRate: result.summary.stepPassRate ? `${result.summary.stepPassRate.toFixed(1)}%` : undefined,
              duration: result.duration,
              recommendations: result.recommendations,
              testResults: result.testResults.map(t => ({
                name: t.name,
                passed: t.passed,
                duration: t.duration,
                error: t.error,
                steps: t.stepResults.map(s => ({
                  instruction: s.instruction,
                  parsed: s.parsed,
                  passed: s.passed,
                  duration: s.duration,
                  error: s.error,
                  actualValue: s.actualValue,
                })),
              })),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "repair_test",
    "AI-powered test repair for broken tests",
    {
      testName: z.string().describe("Name for the test"),
      steps: z.array(z.string()).describe("Test step instructions"),
      autoApply: z.boolean().optional().describe("Automatically apply repairs"),
    },
    async ({ testName, steps, autoApply }) => {
      const testCase: NLTestCase = {
        name: testName,
        steps: steps.map(instruction => ({
          instruction,
          action: "unknown" as NLTestStep["action"],
        })),
      };
      const result = await repairTest(testCase, { autoApply: autoApply || false });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              originalTest: result.originalTest.name,
              failedSteps: result.failedSteps,
              repairedSteps: result.repairedSteps,
              repairedTestPasses: result.repairedTestPasses,
              repairs: result.failureAnalyses.map(a => ({
                step: a.step.instruction,
                error: a.error,
                suggestion: a.suggestions[0]?.suggestedInstruction || "No suggestion",
              })),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "detect_flaky_tests",
    "Detect flaky/unreliable tests by running multiple times",
    {
      testContent: z.string().describe("Test content to analyze"),
      runs: z.number().optional().default(5).describe("Number of times to run each test"),
      threshold: z.number().optional().default(20).describe("Flakiness threshold percentage"),
    },
    async ({ testContent, runs, threshold }) => {
      const suite = parseNLTestSuite(testContent, "Flaky Test Analysis");
      const result = await detectFlakyTests(suite, { runs, flakinessThreshold: threshold });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              suiteName: result.suiteName,
              totalTests: result.summary.totalTests,
              stablePass: result.summary.stablePassTests,
              stableFail: result.summary.stableFailTests,
              flakyTests: result.summary.flakyTests,
              overallFlakiness: `${result.summary.overallFlakinessScore.toFixed(1)}%`,
              analyses: result.testAnalyses.map(a => ({
                test: a.testName,
                classification: a.classification,
                passRate: `${((a.passCount / a.totalRuns) * 100).toFixed(0)}%`,
                flakiness: `${a.flakinessScore}%`,
              })),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "coverage_map",
    "Generate test coverage map for a site",
    {
      baseUrl: z.string().url().describe("Base URL to analyze"),
      testFiles: z.array(z.string()).describe("Array of test file paths"),
      maxPages: z.number().optional().default(100).describe("Maximum pages to crawl"),
    },
    async ({ baseUrl, testFiles, maxPages }) => {
      const result = await generateCoverageMap(baseUrl, testFiles, { maxPages });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              totalPages: result.sitePages.length,
              testedPages: result.testedPages.length,
              untestedPages: result.analysis.untestedPages,
              overallCoverage: `${result.analysis.coveragePercent.toFixed(1)}%`,
              gaps: result.gaps.slice(0, 10).map(g => ({
                url: g.page.url,
                priority: g.priority,
                reason: g.reason,
              })),
            }, null, 2),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Analysis Tools (v4.0.0+)
  // =========================================================================

  server.tool(
    "hunt_bugs",
    "Autonomous bug hunting - crawl and find issues. Returns bugs with severity, selector, and actionable recommendation for each issue found.",
    {
      url: z.string().url().describe("Starting URL to hunt from"),
      maxPages: z.number().optional().default(10).describe("Maximum pages to visit"),
      timeout: z.number().optional().default(60000).describe("Timeout in milliseconds"),
    },
    async ({ url, maxPages, timeout }) => {
      const b = await getBrowser();
      const result = await huntBugs(b, url, { maxPages, timeout });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              pagesVisited: result.pagesVisited,
              bugsFound: result.bugs.length,
              duration: result.duration,
              bugs: result.bugs.slice(0, 10).map(bug => ({
                type: bug.type,
                severity: bug.severity,
                description: bug.description,
                url: bug.url,
                selector: bug.selector,
                recommendation: bug.recommendation,
              })),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "chaos_test",
    "Inject failures and test resilience",
    {
      url: z.string().url().describe("URL to test"),
      networkLatency: z.number().optional().describe("Simulate network latency (ms)"),
      offline: z.boolean().optional().describe("Simulate offline mode"),
      blockUrls: z.array(z.string()).optional().describe("URL patterns to block"),
    },
    async ({ url, networkLatency, offline, blockUrls }) => {
      const b = await getBrowser();
      try {
        const result = await runChaosTest(b, url, { networkLatency, offline, blockUrls });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                passed: result.passed,
                errors: result.errors,
                duration: result.duration,
                // v16.11.0: Include impact analysis in response
                impact: result.impact,
              }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        // v16.11.0: Graceful error handling for chaos test crashes
        // Attempt browser recovery to prevent server crash
        try {
          await b.recoverBrowser();
        } catch {
          // Browser recovery failed, but continue with error response
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                passed: false,
                errors: [`Chaos test crashed: ${error.message}`],
                duration: 0,
                impact: {
                  loadTimeMs: 0,
                  blockedResources: [],
                  failedResources: [],
                  delayedResources: [],
                  pageCompleted: false,
                  pageInteractive: false,
                  consoleErrors: 0,
                  degradationSummary: ["Test crashed - browser recovered"],
                },
                recovered: true,
              }, null, 2),
            },
          ],
        };
      }
    }
  );

  server.tool(
    "compare_personas",
    "Compare how different user personas experience a journey. In Claude Code sessions (no API key), use compare_personas_init and compare_personas_complete instead for the bridge workflow.",
    {
      url: z.string().url().describe("Starting URL"),
      goal: z.string().describe("Goal to accomplish"),
      personas: z.array(z.string()).describe("Persona names to compare"),
    },
    async ({ url, goal, personas }) => {
      // v10.10.0: Check if API key is configured (not just env vars)
      // The env var check didn't work on remote servers
      const hasApiKey = isApiKeyConfigured();

      if (!hasApiKey) {
        // Return instructions for Claude Code to use the bridge workflow
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                mode: "bridge",
                message: "Running in Claude Code session - use the bridge workflow for API-free persona comparison",
                instructions: `
COMPARE PERSONAS BRIDGE WORKFLOW (No API Key Required):

1. Call compare_personas_init with your URL, goal, and personas list
2. For each persona returned, run a cognitive_journey_init and drive the journey using browser tools
3. After all journeys complete, call compare_personas_complete with the results

Example:
1. compare_personas_init({ url: "${url}", goal: "${goal}", personas: ${JSON.stringify(personas)} })
2. For each persona: cognitive_journey_init → navigate/click/fill → track state
3. compare_personas_complete({ journeyResults: [...], url: "${url}", goal: "${goal}" })
`,
                url,
                goal,
                personas,
              }, null, 2),
            },
          ],
        };
      }

      // Standard API-based comparison
      const result = await comparePersonas({
        startUrl: url,
        goal,
        personas,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              url: result.url,
              goal: result.goal,
              personasCompared: result.personas.length,
              summary: result.summary,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "compare_personas_init",
    "Initialize persona comparison for Claude Code bridge workflow. Returns persona profiles and instructions for running journeys without API key.",
    {
      url: z.string().url().describe("Starting URL for all journeys"),
      goal: z.string().describe("Goal to accomplish"),
      personas: z.array(z.string()).describe("Persona names to compare (e.g., ['first-timer', 'power-user', 'elderly-user'])"),
    },
    async ({ url, goal, personas }) => {
      // Gather persona profiles
      // v16.14.1: Use getAnyPersona to find personas in ALL registries
      const personaProfiles = personas.map((personaName) => {
        const existingPersona = getAnyPersona(personaName);
        let personaObj: Persona | AccessibilityPersona;

        if (!existingPersona) {
          // Only create generic stub if persona truly doesn't exist
          personaObj = createCognitivePersona(personaName, personaName, {});
        } else {
          personaObj = existingPersona;
        }

        const profile = getCognitiveProfile(personaObj);

        return {
          name: personaName,
          description: personaObj.description,
          demographics: personaObj.demographics,
          cognitiveTraits: profile.traits,
          attentionPattern: profile.attentionPattern,
          decisionStyle: profile.decisionStyle,
        };
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              mode: "compare_personas_bridge",
              url,
              goal,
              personaCount: personas.length,
              personas: personaProfiles,
              instructions: `
PERSONA COMPARISON BRIDGE WORKFLOW:

You have ${personas.length} personas to compare. For each persona:

1. Call cognitive_journey_init with the persona name, goal, and URL
2. Drive the journey using browser tools (navigate, click, fill, screenshot)
3. Track cognitive state using cognitive_journey_update_state
4. Continue until goal achieved or persona abandons
5. Record the final result

After ALL personas complete their journeys, call compare_personas_complete with:
{
  url: "${url}",
  goal: "${goal}",
  journeyResults: [
    {
      persona: "persona-name",
      goalAchieved: true/false,
      totalTime: seconds,
      stepCount: number,
      finalState: { patienceRemaining, frustrationLevel, confusionLevel },
      abandonmentReason: null or "patience" | "frustration" | "confusion" | "timeout" | "loop",
      frictionPoints: ["description of friction point", ...]
    },
    // ... one for each persona
  ]
}

PERSONA ORDER:
${personaProfiles.map((p, i) => `${i + 1}. ${p.name} - ${p.description}`).join("\n")}

Begin with the first persona: ${personas[0]}
`,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "compare_personas_complete",
    "Complete persona comparison by aggregating journey results. Call this after running all persona journeys via the bridge workflow.",
    {
      url: z.string().url().describe("The URL that was tested"),
      goal: z.string().describe("The goal that was attempted"),
      journeyResults: z.array(z.object({
        persona: z.string().describe("Persona name"),
        goalAchieved: z.boolean().describe("Whether the goal was achieved"),
        totalTime: z.number().describe("Total time in seconds"),
        stepCount: z.number().describe("Number of steps taken"),
        finalState: z.object({
          patienceRemaining: z.number(),
          frustrationLevel: z.number(),
          confusionLevel: z.number(),
        }).describe("Final cognitive state"),
        abandonmentReason: z.enum(["patience", "frustration", "confusion", "timeout", "loop"]).nullable().describe("Why journey ended if not goal achieved"),
        frictionPoints: z.array(z.string()).describe("List of friction point descriptions"),
      })).describe("Results from each persona journey"),
    },
    async ({ url, goal, journeyResults }) => {
      const startTime = Date.now();

      // Calculate rankings and generate comparison
      const successfulResults = journeyResults.filter((r) => r.goalAchieved);
      const failedResults = journeyResults.filter((r) => !r.goalAchieved);

      const sortedByTime = [...successfulResults].sort((a, b) => a.totalTime - b.totalTime);
      const sortedByFriction = [...journeyResults].sort((a, b) => b.frictionPoints.length - a.frictionPoints.length);

      // Collect all friction points
      const allFrictionPoints = journeyResults.flatMap((r) => r.frictionPoints);
      const frictionCounts = allFrictionPoints.reduce((acc, fp) => {
        acc[fp] = (acc[fp] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const commonFriction = Object.entries(frictionCounts)
        .filter(([_, count]) => count > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([fp]) => fp);

      // Generate recommendations
      const recommendations: string[] = [];

      // Abandonment analysis
      const abandonedByPatience = failedResults.filter((r) => r.abandonmentReason === "patience");
      const abandonedByFrustration = failedResults.filter((r) => r.abandonmentReason === "frustration");
      const abandonedByConfusion = failedResults.filter((r) => r.abandonmentReason === "confusion");

      if (abandonedByPatience.length > 0) {
        recommendations.push(
          `${abandonedByPatience.length} persona(s) abandoned due to PATIENCE exhaustion: ${abandonedByPatience.map((r) => r.persona).join(", ")} - consider shorter flows`
        );
      }

      if (abandonedByFrustration.length > 0) {
        recommendations.push(
          `${abandonedByFrustration.length} persona(s) abandoned due to FRUSTRATION: ${abandonedByFrustration.map((r) => r.persona).join(", ")} - review error messages and feedback`
        );
      }

      if (abandonedByConfusion.length > 0) {
        recommendations.push(
          `${abandonedByConfusion.length} persona(s) abandoned due to CONFUSION: ${abandonedByConfusion.map((r) => r.persona).join(", ")} - improve UI clarity and labeling`
        );
      }

      // Friction analysis
      if (sortedByFriction[0]?.frictionPoints.length > 0) {
        const worstPersona = sortedByFriction[0];
        const avgFrustration = worstPersona.finalState.frustrationLevel;
        recommendations.push(
          `"${worstPersona.persona}" experienced the most friction (${worstPersona.frictionPoints.length} points, ${Math.round(avgFrustration * 100)}% frustration)`
        );
      }

      // Common friction points
      if (commonFriction.length > 0) {
        recommendations.push(
          `Common friction across personas: ${commonFriction.slice(0, 2).join("; ")}`
        );
      }

      if (recommendations.length === 0) {
        recommendations.push(
          "All personas completed the journey without significant cognitive barriers"
        );
      }

      const avgTime = successfulResults.length > 0
        ? successfulResults.reduce((sum, r) => sum + r.totalTime, 0) / successfulResults.length
        : 0;

      const comparison = {
        url,
        goal,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        personas: journeyResults.map((r) => ({
          persona: r.persona,
          success: r.goalAchieved,
          totalTime: r.totalTime * 1000, // Convert to ms for consistency
          stepCount: r.stepCount,
          frictionCount: r.frictionPoints.length,
          frictionPoints: r.frictionPoints,
          cognitive: {
            patienceRemaining: r.finalState.patienceRemaining,
            frustrationLevel: r.finalState.frustrationLevel,
            confusionLevel: r.finalState.confusionLevel,
            abandonmentReason: r.abandonmentReason,
          },
        })),
        summary: {
          totalPersonas: journeyResults.length,
          successCount: successfulResults.length,
          failureCount: failedResults.length,
          fastestPersona: sortedByTime[0]?.persona || "N/A",
          slowestPersona: sortedByTime[sortedByTime.length - 1]?.persona || "N/A",
          mostFriction: sortedByFriction[0]?.persona || "N/A",
          leastFriction: sortedByFriction[sortedByFriction.length - 1]?.persona || "N/A",
          avgCompletionTime: Math.round(avgTime * 1000),
          commonFrictionPoints: commonFriction,
        },
        recommendations,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(comparison, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "find_element_by_intent",
    "AI-powered semantic element finding with ARIA-first selector strategy. Prioritizes aria-label > role > semantic HTML > ID > name > class. Returns selectorType, accessibilityScore (0-1), and alternatives. Use verbose=true for enriched failure responses.",
    {
      intent: z.string().describe("Natural language description like 'the cheapest product' or 'login form'"),
      verbose: z.boolean().optional().describe("Include alternative matches with confidence scores and AI suggestions"),
    },
    async ({ intent, verbose }) => {
      const b = await getBrowser();
      const result = await findElementByIntent(b, intent, { verbose });
      if (result && result.confidence > 0) {
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result || { found: false, message: "No matching element found" }, null, 2) }],
      };
    }
  );

  // =========================================================================
  // Cognitive Simulation Tools (v8.3.0)
  // =========================================================================

  server.tool(
    "cognitive_journey_init",
    "Initialize a cognitive user journey simulation. Returns the persona's cognitive profile, initial state, and abandonment thresholds. The actual simulation is driven by the LLM using browser tools (navigate, click, fill, screenshot) while tracking cognitive state.",
    {
      persona: z.string().describe("Persona name (e.g., 'first-timer', 'elderly-user', 'power-user') or custom description"),
      goal: z.string().describe("What the simulated user is trying to accomplish"),
      startUrl: z.string().url().describe("Starting URL for the journey"),
      customTraits: z.object({
        // Core 7 traits
        patience: z.number().min(0).max(1).optional(),
        riskTolerance: z.number().min(0).max(1).optional(),
        comprehension: z.number().min(0).max(1).optional(),
        persistence: z.number().min(0).max(1).optional(),
        curiosity: z.number().min(0).max(1).optional(),
        workingMemory: z.number().min(0).max(1).optional(),
        readingTendency: z.number().min(0).max(1).optional(),
        // v16.11.0: Extended traits (18 more = 25 total)
        resilience: z.number().min(0).max(1).optional(),
        selfEfficacy: z.number().min(0).max(1).optional(),
        satisficing: z.number().min(0).max(1).optional(),
        trustCalibration: z.number().min(0).max(1).optional(),
        interruptRecovery: z.number().min(0).max(1).optional(),
        informationForaging: z.number().min(0).max(1).optional(),
        changeBlindness: z.number().min(0).max(1).optional(),
        anchoringBias: z.number().min(0).max(1).optional(),
        timeHorizon: z.number().min(0).max(1).optional(),
        attributionStyle: z.number().min(0).max(1).optional(),
        metacognitivePlanning: z.number().min(0).max(1).optional(),
        proceduralFluency: z.number().min(0).max(1).optional(),
        transferLearning: z.number().min(0).max(1).optional(),
        authoritySensitivity: z.number().min(0).max(1).optional(),
        emotionalContagion: z.number().min(0).max(1).optional(),
        fearOfMissingOut: z.number().min(0).max(1).optional(),
        socialProofSensitivity: z.number().min(0).max(1).optional(),
        mentalModelRigidity: z.number().min(0).max(1).optional(),
      }).optional().describe("Override specific cognitive traits (25 available)"),
    },
    async ({ persona: personaName, goal, startUrl, customTraits }) => {
      // Get or create persona
      // v16.14.1: Use getAnyPersona to find personas in ALL registries
      const existingPersona = getAnyPersona(personaName);
      let personaObj: Persona | AccessibilityPersona;

      if (!existingPersona) {
        // Create from description
        personaObj = createCognitivePersona(personaName, personaName, customTraits || {});
      } else if (customTraits) {
        // v16.11.0: Full 25-trait default set (was only 7, causing trait dropout)
        const defaultTraits: CognitiveTraits = {
          // Core 7 traits
          patience: 0.5,
          riskTolerance: 0.5,
          comprehension: 0.5,
          persistence: 0.5,
          curiosity: 0.5,
          workingMemory: 0.5,
          readingTendency: 0.5,
          // Tier 1: Core (5 more)
          resilience: 0.5,
          selfEfficacy: 0.5,
          satisficing: 0.5,
          trustCalibration: 0.5,
          interruptRecovery: 0.5,
          // Tier 2-6: Extended (13 more)
          informationForaging: 0.5,
          changeBlindness: 0.3,
          anchoringBias: 0.5,
          timeHorizon: 0.5,
          attributionStyle: 0.5,
          metacognitivePlanning: 0.5,
          proceduralFluency: 0.5,
          transferLearning: 0.5,
          authoritySensitivity: 0.5,
          emotionalContagion: 0.5,
          fearOfMissingOut: 0.5,
          socialProofSensitivity: 0.5,
          mentalModelRigidity: 0.5,
        };
        personaObj = {
          ...existingPersona,
          cognitiveTraits: {
            ...defaultTraits,
            ...(existingPersona.cognitiveTraits || {}),
            ...customTraits,
          },
        };
      } else {
        personaObj = existingPersona;
      }

      // Get cognitive profile
      const profile = getCognitiveProfile(personaObj);

      // Initial cognitive state
      const initialState: CognitiveState = {
        patienceRemaining: 1.0,
        confusionLevel: 0.0,
        frustrationLevel: 0.0,
        goalProgress: 0.0,
        confidenceLevel: 0.5,
        currentMood: "neutral",
        memory: {
          pagesVisited: [startUrl],
          actionsAttempted: [],
          errorsEncountered: [],
          backtrackCount: 0,
        },
        timeElapsed: 0,
        stepCount: 0,
      };

      // Abandonment thresholds (adjusted by persona traits)
      const traits = profile.traits;
      const thresholds: AbandonmentThresholds = {
        patienceMin: 0.1,
        confusionMax: traits.comprehension < 0.4 ? 0.6 : 0.8,
        frustrationMax: traits.patience < 0.3 ? 0.7 : 0.85,
        maxStepsWithoutProgress: traits.persistence > 0.7 ? 15 : 10,
        loopDetectionThreshold: 3,
        timeLimit: traits.patience > 0.7 ? 180 : (traits.patience < 0.3 ? 60 : 120),
      };

      // Navigate to start URL
      const b = await getBrowser();
      await b.navigate(startUrl);

      // v16.12.0: Include persona values for influence pattern analysis
      const personaValues = getPersonaValues(personaObj.name);
      const influencePatterns = personaValues
        ? rankInfluencePatternsForProfile(personaValues).slice(0, 5) // Top 5 most effective patterns
        : undefined;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              persona: {
                name: personaObj.name,
                description: personaObj.description,
                demographics: personaObj.demographics,
                values: personaValues ? {
                  schwartz: {
                    selfDirection: personaValues.selfDirection,
                    stimulation: personaValues.stimulation,
                    hedonism: personaValues.hedonism,
                    achievement: personaValues.achievement,
                    power: personaValues.power,
                    security: personaValues.security,
                    conformity: personaValues.conformity,
                    tradition: personaValues.tradition,
                    benevolence: personaValues.benevolence,
                    universalism: personaValues.universalism,
                  },
                  higherOrder: {
                    openness: personaValues.openness,
                    selfEnhancement: personaValues.selfEnhancement,
                    conservation: personaValues.conservation,
                    selfTranscendence: personaValues.selfTranscendence,
                  },
                  sdt: {
                    autonomyNeed: personaValues.autonomyNeed,
                    competenceNeed: personaValues.competenceNeed,
                    relatednessNeed: personaValues.relatednessNeed,
                  },
                  maslowLevel: personaValues.maslowLevel,
                } : undefined,
                influenceSusceptibility: influencePatterns?.map(ip => ({
                  pattern: ip.pattern.name,
                  susceptibility: ip.susceptibility,
                })),
              },
              cognitiveProfile: profile,
              initialState,
              abandonmentThresholds: thresholds,
              goal,
              startUrl,
              instructions: `
COGNITIVE JOURNEY SIMULATION INSTRUCTIONS:

You are now simulating a "${personaObj.name}" user with these cognitive traits:
- Patience: ${profile.traits.patience.toFixed(2)} ${profile.traits.patience < 0.3 ? "(impatient - will give up quickly)" : profile.traits.patience > 0.7 ? "(patient - will persist)" : "(moderate)"}
- Risk Tolerance: ${profile.traits.riskTolerance.toFixed(2)} ${profile.traits.riskTolerance < 0.3 ? "(cautious - hesitates)" : profile.traits.riskTolerance > 0.7 ? "(bold - clicks freely)" : "(moderate)"}
- Comprehension: ${profile.traits.comprehension.toFixed(2)} ${profile.traits.comprehension < 0.3 ? "(struggles with UI)" : profile.traits.comprehension > 0.7 ? "(expert at UI patterns)" : "(moderate)"}
- Reading Tendency: ${profile.traits.readingTendency.toFixed(2)} ${profile.traits.readingTendency < 0.3 ? "(scans only)" : profile.traits.readingTendency > 0.7 ? "(reads everything)" : "(selective reader)"}

Attention Pattern: ${profile.attentionPattern}
Decision Style: ${profile.decisionStyle}

GOAL: "${goal}"

SIMULATION LOOP:
1. PERCEIVE - Use screenshot/snapshot to see the page. Filter by attention pattern.
2. COMPREHEND - Interpret elements as this persona would (lower comprehension = more confusion)
3. DECIDE - Choose action based on traits. Generate inner monologue.
4. EXECUTE - Use click/fill/navigate tools.
5. EVALUATE - Update cognitive state after each action:
   - patienceRemaining -= 0.02 + (frustrationLevel × 0.05)
   - confusionLevel changes based on UI clarity
   - frustrationLevel increases on failures
6. CHECK ABANDONMENT - If thresholds exceeded, end journey with appropriate message.
7. LOOP - Return to PERCEIVE until goal achieved or abandoned.

ABANDONMENT TRIGGERS:
- Patience < ${thresholds.patienceMin}: "This is taking too long. I give up."
- Confusion > ${thresholds.confusionMax} for 30s: "I have no idea what to do."
- Frustration > ${thresholds.frustrationMax}: "This is so frustrating!"
- No progress after ${thresholds.maxStepsWithoutProgress} steps: "I'm not getting anywhere."
- Same page ${thresholds.loopDetectionThreshold}x: "I keep ending up here."
- Time > ${thresholds.timeLimit}s: "I've spent too long on this."

Begin the simulation now. Narrate your thoughts as this persona.
`,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "cognitive_journey_update_state",
    "Update the cognitive state during a journey simulation. Call this after each action to track mental state.",
    {
      currentState: z.object({
        patienceRemaining: z.number(),
        confusionLevel: z.number(),
        frustrationLevel: z.number(),
        goalProgress: z.number(),
        confidenceLevel: z.number(),
        currentMood: z.enum(["neutral", "hopeful", "confused", "frustrated", "defeated", "relieved"]),
        stepCount: z.number(),
        timeElapsed: z.number(),
      }).describe("Current cognitive state"),
      actionResult: z.object({
        success: z.boolean(),
        wasConfusing: z.boolean().optional(),
        progressMade: z.boolean().optional(),
        wentBack: z.boolean().optional(),
      }).describe("Result of the last action"),
      personaTraits: z.object({
        patience: z.number(),
        riskTolerance: z.number(),
        comprehension: z.number(),
        persistence: z.number(),
      }).describe("Persona traits affecting state changes"),
    },
    async ({ currentState, actionResult, personaTraits }) => {
      // Calculate new state based on action result
      let newPatienceRemaining = currentState.patienceRemaining - 0.02;
      let newConfusionLevel = currentState.confusionLevel;
      let newFrustrationLevel = currentState.frustrationLevel;
      let newConfidenceLevel = currentState.confidenceLevel;
      let newMood = currentState.currentMood;

      // Apply frustration decay on patience
      newPatienceRemaining -= currentState.frustrationLevel * 0.05;

      if (actionResult.success) {
        // Success reduces confusion and frustration
        newConfusionLevel = Math.max(0, newConfusionLevel - 0.1);
        newFrustrationLevel = Math.max(0, newFrustrationLevel - 0.05);

        if (actionResult.progressMade) {
          newConfidenceLevel = Math.min(1, newConfidenceLevel + 0.1);
          if (newMood === "confused" || newMood === "frustrated") {
            newMood = "hopeful";
          }
        }
      } else {
        // Failure increases frustration
        newFrustrationLevel = Math.min(1, newFrustrationLevel + 0.2);

        if (newFrustrationLevel > 0.7) {
          newMood = "frustrated";
        }
        if (newFrustrationLevel > 0.8 && personaTraits.persistence < 0.5) {
          newMood = "defeated";
        }
      }

      if (actionResult.wasConfusing) {
        // Confusion builds based on comprehension
        newConfusionLevel = Math.min(1, newConfusionLevel + (1 - personaTraits.comprehension) * 0.15);

        if (newConfusionLevel > 0.5 && newMood !== "frustrated") {
          newMood = "confused";
        }
      }

      if (actionResult.wentBack) {
        newConfidenceLevel = Math.max(0, newConfidenceLevel - 0.15);
      }

      const newState: Partial<CognitiveState> = {
        patienceRemaining: Math.max(0, newPatienceRemaining),
        confusionLevel: newConfusionLevel,
        frustrationLevel: newFrustrationLevel,
        confidenceLevel: newConfidenceLevel,
        currentMood: newMood as CognitiveState["currentMood"],
        stepCount: currentState.stepCount + 1,
        timeElapsed: currentState.timeElapsed + 2,
      };

      // Check abandonment conditions
      let shouldAbandon = false;
      let abandonmentReason: string | undefined;
      let abandonmentMessage: string | undefined;

      if (newState.patienceRemaining! < 0.1) {
        shouldAbandon = true;
        abandonmentReason = "patience";
        abandonmentMessage = "This is taking too long. I give up.";
      } else if (newState.frustrationLevel! > 0.85) {
        shouldAbandon = true;
        abandonmentReason = "frustration";
        abandonmentMessage = "This is so frustrating! I'm done.";
      } else if (newState.confusionLevel! > 0.8 && currentState.confusionLevel > 0.8) {
        shouldAbandon = true;
        abandonmentReason = "confusion";
        abandonmentMessage = "I have no idea what I'm supposed to do here.";
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              newState,
              shouldAbandon,
              abandonmentReason,
              abandonmentMessage,
              stateChange: {
                patienceDelta: newState.patienceRemaining! - currentState.patienceRemaining,
                confusionDelta: newState.confusionLevel! - currentState.confusionLevel,
                frustrationDelta: newState.frustrationLevel! - currentState.frustrationLevel,
              },
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "list_cognitive_personas",
    "List all available personas with their cognitive traits (includes accessibility and emotional personas)",
    {},
    async () => {
      // v16.11.0: Include all persona types - BUILTIN + ACCESSIBILITY + EMOTIONAL
      const builtinNames = listPersonas();
      const accessibilityNames = listAccessibilityPersonas();

      // Built-in personas (power-user, first-timer, etc.)
      const builtinPersonas = builtinNames.map(name => {
        const p = getPersona(name);
        if (!p) return null;
        const profile = getCognitiveProfile(p);
        // v16.12.0: Include Schwartz values for each persona
        const values = getPersonaValues(p.name);
        return {
          name: p.name,
          description: p.description,
          category: "builtin",
          demographics: p.demographics,
          cognitiveTraits: profile.traits,
          attentionPattern: profile.attentionPattern,
          decisionStyle: profile.decisionStyle,
          values: values ? {
            schwartz: {
              selfDirection: values.selfDirection,
              stimulation: values.stimulation,
              hedonism: values.hedonism,
              achievement: values.achievement,
              power: values.power,
              security: values.security,
              conformity: values.conformity,
              tradition: values.tradition,
              benevolence: values.benevolence,
              universalism: values.universalism,
            },
            higherOrder: {
              openness: values.openness,
              selfEnhancement: values.selfEnhancement,
              conservation: values.conservation,
              selfTranscendence: values.selfTranscendence,
            },
            sdt: {
              autonomyNeed: values.autonomyNeed,
              competenceNeed: values.competenceNeed,
              relatednessNeed: values.relatednessNeed,
            },
            maslowLevel: values.maslowLevel,
          } : undefined,
        };
      }).filter(Boolean);

      // Accessibility personas (motor-tremor, low-vision, adhd, etc.)
      const accessibilityPersonas = accessibilityNames.map(name => {
        const p = getAccessibilityPersona(name);
        if (!p) return null;
        // v16.11.0: Compute disabilityType and barrierTypes from accessibilityTraits
        const traits = p.accessibilityTraits;
        let disabilityType = "General accessibility";
        const barrierTypes: string[] = [];

        if (traits?.tremor) {
          disabilityType = "Motor impairment (tremor)";
          barrierTypes.push("motor_precision", "touch_target");
        }
        if (traits?.visionLevel !== undefined && traits.visionLevel < 0.5) {
          disabilityType = "Low vision";
          barrierTypes.push("visual_clarity", "contrast");
        }
        if (traits?.colorBlindness) {
          disabilityType = `Color blindness (${traits.colorBlindness})`;
          barrierTypes.push("sensory");
        }
        if (traits?.processingSpeed !== undefined && traits.processingSpeed < 0.6) {
          disabilityType = "Cognitive (Processing)";
          barrierTypes.push("cognitive_load", "temporal");
        }
        if (traits?.attentionSpan !== undefined && traits.attentionSpan < 0.5) {
          if (!disabilityType.includes("Cognitive")) {
            disabilityType = "Cognitive (ADHD/Attention)";
          }
          barrierTypes.push("cognitive_load");
        }
        // Name-based fallback
        if (disabilityType === "General accessibility") {
          if (p.name.includes("deaf") || p.name.includes("hearing")) disabilityType = "Hearing impairment";
          else if (p.name.includes("motor")) disabilityType = "Motor impairment";
          else if (p.name.includes("vision") || p.name.includes("blind")) disabilityType = "Vision impairment";
          else if (p.name.includes("cognitive") || p.name.includes("adhd")) disabilityType = "Cognitive";
        }

        // v16.12.0: Include Schwartz values for accessibility personas
        const values = getPersonaValues(p.name);
        return {
          name: p.name,
          description: p.description,
          category: "accessibility",
          disabilityType,
          demographics: p.demographics,
          cognitiveTraits: p.cognitiveTraits || {},
          barrierTypes: [...new Set(barrierTypes)], // Deduplicate
          values: values ? {
            schwartz: {
              selfDirection: values.selfDirection,
              stimulation: values.stimulation,
              hedonism: values.hedonism,
              achievement: values.achievement,
              power: values.power,
              security: values.security,
              conformity: values.conformity,
              tradition: values.tradition,
              benevolence: values.benevolence,
              universalism: values.universalism,
            },
            higherOrder: {
              openness: values.openness,
              selfEnhancement: values.selfEnhancement,
              conservation: values.conservation,
              selfTranscendence: values.selfTranscendence,
            },
            sdt: {
              autonomyNeed: values.autonomyNeed,
              competenceNeed: values.competenceNeed,
              relatednessNeed: values.relatednessNeed,
            },
            maslowLevel: values.maslowLevel,
          } : undefined,
        };
      }).filter(Boolean);

      const allPersonas = [...builtinPersonas, ...accessibilityPersonas];

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              personas: allPersonas,
              count: allPersonas.length,
              categories: {
                builtin: builtinPersonas.length,
                accessibility: accessibilityPersonas.length,
              },
            }, null, 2),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Values System Tools (v16.12.0)
  // Schwartz's 10 Universal Values, Self-Determination Theory, Maslow
  // =========================================================================

  server.tool(
    "persona_values_lookup",
    "Look up the values profile for a persona (Schwartz's 10 Universal Values, SDT needs, Maslow level). Values describe WHO the persona is at a deeper motivational level, informing influence susceptibility.",
    {
      persona: z.string().describe("Persona name (e.g., 'first-timer', 'power-user', 'anxious-user')"),
      includeInfluencePatterns: z.boolean().optional().default(true).describe("Include ranked influence patterns this persona is susceptible to"),
    },
    async ({ persona, includeInfluencePatterns }) => {
      const values = getPersonaValues(persona);

      if (!values) {
        const availablePersonas = PERSONA_VALUE_PROFILES.map(p => p.personaName);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: `No values profile found for persona: ${persona}`,
                availablePersonas,
                note: "Values are defined for all built-in personas. Custom personas can have values added via the questionnaire.",
              }, null, 2),
            },
          ],
        };
      }

      const profile = PERSONA_VALUE_PROFILES.find(
        p => p.personaName.toLowerCase() === persona.toLowerCase()
      );

      let influencePatterns: Array<{pattern: string; susceptibility: number; description: string}> | undefined;
      if (includeInfluencePatterns) {
        const ranked = rankInfluencePatternsForProfile(values);
        influencePatterns = ranked.slice(0, 7).map(r => ({
          pattern: r.pattern.name,
          susceptibility: r.susceptibility,
          description: r.pattern.description,
        }));
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              persona,
              rationale: profile?.rationale,
              schwartzValues: {
                selfDirection: { value: values.selfDirection, meaning: "Independent thought, creativity, freedom" },
                stimulation: { value: values.stimulation, meaning: "Excitement, novelty, challenge" },
                hedonism: { value: values.hedonism, meaning: "Pleasure, sensuous gratification" },
                achievement: { value: values.achievement, meaning: "Personal success through competence" },
                power: { value: values.power, meaning: "Social status, prestige, control" },
                security: { value: values.security, meaning: "Safety, harmony, stability" },
                conformity: { value: values.conformity, meaning: "Restraint of actions that harm others" },
                tradition: { value: values.tradition, meaning: "Respect for customs, heritage" },
                benevolence: { value: values.benevolence, meaning: "Welfare of close others" },
                universalism: { value: values.universalism, meaning: "Tolerance, social justice, environment" },
              },
              higherOrderValues: {
                openness: { value: values.openness, meaning: "(selfDirection + stimulation) / 2" },
                selfEnhancement: { value: values.selfEnhancement, meaning: "(achievement + power) / 2" },
                conservation: { value: values.conservation, meaning: "(security + conformity + tradition) / 3" },
                selfTranscendence: { value: values.selfTranscendence, meaning: "(benevolence + universalism) / 2" },
              },
              selfDeterminationTheory: {
                autonomyNeed: { value: values.autonomyNeed, meaning: "Need for choice and control" },
                competenceNeed: { value: values.competenceNeed, meaning: "Need to feel capable" },
                relatednessNeed: { value: values.relatednessNeed, meaning: "Need for connection" },
              },
              maslowLevel: {
                level: values.maslowLevel,
                meaning: values.maslowLevel === "physiological" ? "Basic survival needs"
                  : values.maslowLevel === "safety" ? "Security and stability"
                  : values.maslowLevel === "belonging" ? "Social connection and love"
                  : values.maslowLevel === "esteem" ? "Achievement and recognition"
                  : "Self-fulfillment and growth",
              },
              influencePatterns,
              researchBasis: {
                schwartz: "Schwartz, S. H. (1992, 2012). Theory of Basic Human Values. DOI: 10.1016/S0065-2601(08)60281-6",
                sdt: "Deci, E. L., & Ryan, R. M. (1985, 2000). Self-Determination Theory. DOI: 10.1037/0003-066X.55.1.68",
                maslow: "Maslow, A. H. (1943). A Theory of Human Motivation. DOI: 10.1037/h0054346",
              },
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "list_influence_patterns",
    "List all research-backed influence/persuasion patterns and which persona values make someone susceptible to each pattern. Based on Cialdini, Kahneman, and behavioral economics research.",
    {},
    async () => {
      // INFLUENCE_PATTERNS is an array of InfluencePattern objects
      const patterns = INFLUENCE_PATTERNS.map(pattern => ({
        name: pattern.name,
        description: pattern.description,
        researchBasis: pattern.researchBasis,
        targetValues: pattern.targetValues,
        mechanism: pattern.mechanism,
        examples: pattern.examples,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              count: patterns.length,
              patterns,
              usage: "Use persona_values_lookup to see which patterns a specific persona is susceptible to",
              note: "These patterns describe psychological influence mechanisms. Use ethically for UX optimization, not manipulation.",
            }, null, 2),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Persona Questionnaire Tools (v16.5.0)
  // Research-based persona generation via questionnaire
  // =========================================================================

  server.tool(
    "persona_questionnaire_get",
    "Get the persona questionnaire for building a custom persona. Returns research-backed questions that map to cognitive traits. Use comprehensive=true for all 25 traits, or leave false for 8 core traits. v16.12.0: Now includes optional category question for disability-specific value safeguards.",
    {
      comprehensive: z.boolean().optional().default(false).describe("Include all 25 traits (true) or just 8 core traits (false)"),
      traits: z.array(z.string()).optional().describe("Specific trait names to include (overrides comprehensive)"),
      includeCategory: z.boolean().optional().default(true).describe("Include category question for disability-aware values (v16.12.0)"),
    },
    async ({ comprehensive, traits, includeCategory }) => {
      const { generatePersonaQuestionnaire, formatForAskUserQuestion, CATEGORY_QUESTION } = await import("./persona-questionnaire.js");

      const questions = generatePersonaQuestionnaire({
        comprehensive,
        traits: traits as Array<keyof import("./types.js").CognitiveTraits> | undefined,
      });

      const formatted = formatForAskUserQuestion(questions);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              instructions: "Present these questions to the user one at a time or all at once. Each answer maps to a trait value. After collecting answers, use persona_questionnaire_build to create the persona. v16.12.0: Start with the category question to enable disability-aware value safeguards.",
              questionCount: questions.length,
              questions: formatted,
              rawQuestions: questions,  // Include raw for programmatic use
              ...(includeCategory && {
                categoryQuestion: CATEGORY_QUESTION,
                categoryInstructions: "Ask this FIRST to determine persona category. The category affects which values are applied and provides research-based safeguards for disability simulations.",
              }),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "persona_questionnaire_build",
    "Build a custom persona from questionnaire answers with category-aware value safeguards. Answers should be a map of trait names to values (0-1). Missing traits will use intelligent defaults based on research correlations. v16.12.0: Optionally specify category for disability-specific value handling.",
    {
      name: z.string().describe("Name for the new persona"),
      description: z.string().describe("Description of the persona"),
      answers: z.record(z.string(), z.number()).describe("Map of trait names to values (0-1), e.g. {patience: 0.25, riskTolerance: 0.75}"),
      category: z.enum(["cognitive", "physical", "sensory", "emotional", "general"]).optional().describe("Persona category for value safeguards (v16.12.0)"),
      valueOverrides: z.record(z.string(), z.number()).optional().describe("Override specific values (0-1) if different from category defaults"),
      save: z.boolean().optional().default(true).describe("Save the persona to disk for future use"),
    },
    async ({ name, description, answers, category, valueOverrides, save }) => {
      const {
        buildTraitsFromAnswers,
        getTraitLabel,
        getTraitBehaviors,
        detectPersonaCategory,
        buildValuesFromCategory,
        validateCategoryValues,
      } = await import("./persona-questionnaire.js");
      const { createCognitivePersona, saveCustomPersona } = await import("./personas.js");

      // Detect or use provided category
      const detectedCategory = category || detectPersonaCategory(name, description);

      // Build traits from answers with research-based correlations (moved up for v16.14.0)
      const traits = buildTraitsFromAnswers(answers);

      // Build category-appropriate values with optional overrides
      // v16.14.0: Pass traits for trait_based categories (general, emotional)
      const categoryResult = buildValuesFromCategory(
        detectedCategory,
        valueOverrides as Record<string, number> | undefined,
        traits  // v16.14.0: Pass traits for trait-based value derivation
      );

      // Validate values match category guidelines
      const warnings = validateCategoryValues(detectedCategory, categoryResult.values);

      // Create the persona
      const persona = createCognitivePersona(name, description, traits, {});

      // Save if requested
      let savedPath: string | undefined;
      if (save) {
        savedPath = saveCustomPersona(persona);
      }

      // Generate behavioral summary for key traits
      const traitSummary: Record<string, { value: number; label: string; behaviors: string[] }> = {};
      for (const [trait, value] of Object.entries(traits)) {
        if (value !== 0.5) {  // Only include non-default traits
          traitSummary[trait] = {
            value: value as number,
            label: getTraitLabel(trait as keyof import("./types.js").CognitiveTraits, value as number),
            behaviors: getTraitBehaviors(trait as keyof import("./types.js").CognitiveTraits, value as number),
          };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              persona: {
                name: persona.name,
                description: persona.description,
                demographics: persona.demographics,
              },
              cognitiveTraits: traits,
              traitSummary,
              // v16.12.0: Category-aware values
              category: {
                detected: detectedCategory,
                strategy: categoryResult.valueStrategy,
                guidance: categoryResult.guidance,
              },
              values: categoryResult.values,
              researchBasis: categoryResult.researchBasis,
              // v16.14.0: Show how traits influenced values for trait_based categories
              ...(categoryResult.derivations && categoryResult.derivations.length > 0 && {
                valueDerivations: categoryResult.derivations,
              }),
              ...(warnings.length > 0 && { warnings }),
              savedPath,
              usage: `Use persona "${name}" with cognitive-journey or other commands`,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "persona_trait_lookup",
    "Look up behavioral descriptions for specific trait values. Useful for understanding what a trait value means in practice.",
    {
      trait: z.string().describe("Trait name (e.g., 'patience', 'riskTolerance')"),
      value: z.number().min(0).max(1).describe("Trait value (0-1)"),
    },
    async ({ trait, value }) => {
      const { getTraitReference, getTraitLabel, getTraitBehaviors } = await import("./persona-questionnaire.js");

      const reference = getTraitReference(trait as keyof import("./types.js").CognitiveTraits);

      if (!reference) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: `Unknown trait: ${trait}`,
                availableTraits: [
                  "patience", "riskTolerance", "comprehension", "persistence", "curiosity",
                  "workingMemory", "readingTendency", "resilience", "selfEfficacy", "satisficing",
                  "trustCalibration", "interruptRecovery", "informationForaging", "changeBlindness",
                  "anchoringBias", "timeHorizon", "attributionStyle", "metacognitivePlanning",
                  "proceduralFluency", "transferLearning", "authoritySensitivity", "emotionalContagion",
                  "fearOfMissingOut", "socialProofSensitivity", "mentalModelRigidity"
                ],
              }, null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              trait: reference.name,
              description: reference.description,
              researchBasis: reference.researchBasis,
              value,
              label: getTraitLabel(trait as keyof import("./types.js").CognitiveTraits, value),
              behaviors: getTraitBehaviors(trait as keyof import("./types.js").CognitiveTraits, value),
              allLevels: reference.levels,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "persona_category_guidance",
    "Get guidance for value assignment based on persona category. (v16.12.0) Explains research basis for why cognitive, physical, sensory, and emotional disability categories require different value handling approaches.",
    {
      category: z.enum(["cognitive", "physical", "sensory", "emotional", "general"]).describe("Persona category to get guidance for"),
    },
    async ({ category }) => {
      const { CATEGORY_VALUE_PRESETS, COGNITIVE_SUBTYPES } = await import("./persona-questionnaire.js");

      const preset = CATEGORY_VALUE_PRESETS.find(p => p.category === category);

      if (!preset) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: `Unknown category: ${category}`,
                availableCategories: ["cognitive", "physical", "sensory", "emotional", "general"],
              }, null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              category: preset.category,
              description: preset.description,
              valueStrategy: preset.valueStrategy,
              guidance: preset.guidance,
              defaultValues: preset.defaultValues,
              researchBasis: preset.researchBasis,
              ...(category === "cognitive" && {
                subtypes: Object.entries(COGNITIVE_SUBTYPES).map(([key, subtype]) => ({
                  name: key,
                  values: subtype.values,
                  researchBasis: subtype.researchBasis,
                })),
              }),
            }, null, 2),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Performance Tools (v6.4.0+)
  // =========================================================================

  server.tool(
    "perf_baseline",
    "Capture performance baseline for a URL",
    {
      url: z.string().url().describe("URL to capture baseline for"),
      name: z.string().describe("Name for the baseline"),
      runs: z.number().optional().default(3).describe("Number of runs to average"),
    },
    async ({ url, name, runs }) => {
      const result = await capturePerformanceBaseline(url, { name, runs });
      // v16.11.0: Return all available metrics, not just core 4
      const m = result.metrics;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              name: result.name,
              url: result.url,
              // Core Web Vitals
              coreWebVitals: {
                lcp: m.lcp,
                lcpRating: m.lcpRating,
                fid: m.fid,
                fidRating: m.fidRating,
                cls: m.cls,
                clsRating: m.clsRating,
              },
              // Additional timing metrics
              timingMetrics: {
                fcp: m.fcp,
                fcpRating: m.fcpRating,
                ttfb: m.ttfb,
                ttfbRating: m.ttfbRating,
                tti: m.tti,
                tbt: m.tbt,
                domContentLoaded: m.domContentLoaded,
                load: m.load,
              },
              // Resource metrics
              resourceMetrics: {
                resourceCount: m.resourceCount,
                transferSize: m.transferSize,
              },
              // Flat copy for backward compatibility
              metrics: {
                lcp: m.lcp,
                fcp: m.fcp,
                ttfb: m.ttfb,
                cls: m.cls,
              },
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "perf_regression",
    "Detect performance regression against baseline with configurable sensitivity. Uses dual thresholds: both percentage AND absolute change must be exceeded. Profiles: strict (perf envs, FCP 10%/50ms), normal (default, FCP 20%/100ms), ci (automated pipelines, FCP 25%/150ms), lenient (dev, FCP 30%/200ms).",
    {
      url: z.string().url().describe("URL to test"),
      baselineName: z.string().describe("Name of baseline to compare against"),
      sensitivity: z.enum(["strict", "normal", "ci", "lenient"]).optional().default("normal").describe("Sensitivity profile: strict (perf testing), normal (local dev), ci (automated pipelines), lenient (development)"),
      thresholdLcp: z.number().optional().describe("Override LCP threshold percentage"),
    },
    async ({ url, baselineName, sensitivity, thresholdLcp }) => {
      const result = await detectPerformanceRegression(url, baselineName, {
        sensitivity,
        thresholds: thresholdLcp ? { lcp: thresholdLcp } : undefined,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              passed: result.passed,
              sensitivity: result.sensitivity,
              notes: result.notes,
              regressions: result.regressions,
              currentMetrics: result.currentMetrics,
              baseline: result.baseline.name,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "list_baselines",
    "List all saved baselines (visual and performance)",
    {},
    async () => {
      const visualBaselines = await listVisualBaselines();
      const perfBaselines = await listPerformanceBaselines();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              visual: visualBaselines,
              performance: perfBaselines,
            }, null, 2),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Agent-Ready Audit, Competitive Benchmark, Accessibility Empathy (v9.0.0)
  // =========================================================================

  server.tool(
    "agent_ready_audit",
    "Audit a website for AI-agent friendliness. Analyzes findability, stability, accessibility, and semantics. Returns score (0-100), grade (A-F), issues, and remediation recommendations.",
    {
      url: z.string().url().describe("URL to audit"),
    },
    async ({ url }) => {
      const result = await runAgentReadyAudit(url, { headless: true });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              url: result.url,
              score: result.score,
              grade: result.grade,
              summary: result.summary,
              topIssues: result.issues.slice(0, 5),
              topRecommendations: result.recommendations.slice(0, 5),
              duration: result.duration,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "competitive_benchmark",
    "Compare UX across competitor sites. Runs identical cognitive journeys on multiple sites and generates head-to-head comparison with rankings, friction analysis, and recommendations.",
    {
      sites: z.array(z.string().url()).describe("Array of URLs to compare"),
      goal: z.string().describe("Task goal (e.g., 'sign up for free trial')"),
      persona: z.string().optional().default("first-timer").describe("Persona to use"),
      maxSteps: z.number().optional().default(30).describe("Max steps per site"),
      maxTime: z.number().optional().default(180).describe("Max time per site in seconds"),
    },
    async ({ sites, goal, persona, maxSteps, maxTime }) => {
      const result = await runCompetitiveBenchmark({
        sites: sites.map((url) => ({ url })),
        goal,
        persona,
        maxSteps,
        maxTime,
        headless: true,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              goal: result.goal,
              persona: result.persona,
              ranking: result.ranking,
              comparison: result.comparison,
              recommendations: result.recommendations.slice(0, 5),
              duration: result.duration,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "empathy_audit",
    "Simulate how people with disabilities experience a site. Tests motor impairments, cognitive differences, and sensory limitations. Returns barriers, WCAG violations, and remediation suggestions.",
    {
      url: z.string().url().describe("URL to audit"),
      goal: z.string().describe("Task goal (e.g., 'complete checkout')"),
      disabilities: z.array(z.string()).optional().describe("Disability personas to test. Available: motor-impairment-tremor, low-vision-magnified, cognitive-adhd, dyslexic-user, deaf-user, elderly-low-vision, color-blind-deuteranopia"),
      wcagLevel: z.enum(["A", "AA", "AAA"]).optional().default("AA").describe("WCAG conformance level"),
      maxSteps: z.number().optional().default(20).describe("Max steps per persona"),
      maxTime: z.number().optional().default(120).describe("Max time per persona in seconds"),
    },
    async ({ url, goal, disabilities, wcagLevel, maxSteps, maxTime }) => {
      const disabilityList = disabilities || listAccessibilityPersonas();
      const result = await runEmpathyAudit(url, {
        goal,
        disabilities: disabilityList,
        wcagLevel,
        maxSteps,
        maxTime,
        headless: true,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              url: result.url,
              goal: result.goal,
              overallScore: result.overallScore,
              resultsSummary: result.results.map((r) => {
                // v16.7.2: Separate barrier types from element counts
                const uniqueTypes = new Set(r.barriers.map(b => b.type));
                return {
                  persona: r.persona,
                  disabilityType: r.disabilityType,
                  goalAchieved: r.goalAchieved,
                  empathyScore: r.empathyScore,
                  barrierTypeCount: uniqueTypes.size,  // Unique barrier categories
                  barrierTypes: Array.from(uniqueTypes),
                  affectedElements: r.barriers.length,  // Raw element count
                  wcagViolationCount: r.wcagViolations.length,
                };
              }),
              allWcagViolations: result.allWcagViolations,
              topBarriers: result.topBarriers.slice(0, 5), // v11.11.0: Deduplicated by type
              topRemediation: result.combinedRemediation.slice(0, 5),
              duration: result.duration,
            }, null, 2),
          },
        ],
      };
    }
  );

  // Diagnostics
  server.tool(
    "status",
    "Get CBrowser environment status and diagnostics including data directories, installed browsers, configuration, and self-healing cache statistics",
    {},
    async () => {
      const info = await getStatusInfo(VERSION);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(info, null, 2),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Browser Management Tools (v11.8.0)
  // =========================================================================

  server.tool(
    "browser_health",
    "Check if the browser is healthy and responsive. Use this before operations if you suspect the browser may have crashed.",
    {},
    async () => {
      const b = await getBrowser();
      const result = await b.isBrowserHealthy();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "browser_recover",
    "Attempt to recover from a browser crash by restarting the browser process. Use this when browser_health returns unhealthy.",
    {
      restoreUrl: z.string().url().optional().describe("URL to restore after recovery (uses last known URL if not provided)"),
      maxAttempts: z.number().optional().default(3).describe("Maximum recovery attempts"),
    },
    async ({ restoreUrl, maxAttempts }) => {
      const b = await getBrowser();
      const result = await b.recoverBrowser({ restoreUrl, maxAttempts });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "reset_browser",
    "Reset the browser to a clean state. Clears all cookies, localStorage, sessionStorage, and browser state. Use this when you need a fresh browser environment.",
    {},
    async () => {
      const b = await getBrowser();
      await b.reset();
      // Relaunch for immediate use
      await b.launch();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "Browser reset to clean state and relaunched",
            }, null, 2),
          },
        ],
      };
    }
  );

  // ============================================================================
  // NOTE: Stealth tools moved to Enterprise (v16.18.0)
  // The following tools are now Enterprise-only:
  //   - stealth_status, stealth_enable, stealth_disable, stealth_check, stealth_diagnose
  //   - cloudflare_detect, cloudflare_wait
  // Contact alexandria.shai.eden@gmail.com for Enterprise access.
  // ============================================================================
}

/**
 * Create a configured MCP server instance
 */
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "cbrowser",
    version: VERSION,
  });
  configureMcpTools(server);
  return server;
}

/**
 * Handle incoming HTTP MCP request
 */
async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  transport: StreamableHTTPServerTransport
): Promise<void> {
  // CORS headers are set at the top level in startRemoteMcpServer
  const start = Date.now();

  // Parse body for POST requests
  if (req.method === "POST") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString("utf-8");

    // Safely parse JSON - reject malformed requests gracefully
    let parsedBody: Record<string, unknown> | undefined;
    try {
      parsedBody = body ? JSON.parse(body) : undefined;
    } catch (parseError) {
      console.error(`Invalid JSON in request body: ${(parseError as Error).message}`);
      console.error(`Body preview: ${body.substring(0, 100)}...`);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32700,
          message: "Parse error: Invalid JSON in request body",
        },
        id: null,
      }));
      return;
    }

    // Log request details
    const method = (parsedBody?.method as string) || "unknown";
    let logLine = `← ${method}`;
    const params = parsedBody?.params as Record<string, unknown> | undefined;
    if (method === "tools/call" && params?.name) {
      logLine += ` [${params.name}]`;
    }
    if (method === "notifications/initialized") {
      logLine = `← session initialized`;
    }

    await transport.handleRequest(req, res, parsedBody);

    const duration = Date.now() - start;
    console.log(`${logLine} → ${res.statusCode} (${duration}ms)`);
  } else {
    await transport.handleRequest(req, res);
    const duration = Date.now() - start;
    console.log(`← ${req.method} → ${res.statusCode} (${duration}ms)`);
  }
}

/**
 * Options for starting the remote MCP server
 */
export interface RemoteMcpServerOptions {
  /** Callback to register additional tools after base tools are configured */
  extendServer?: (server: McpServer) => void | Promise<void>;
  /** Custom server name (default: "cbrowser") */
  serverName?: string;
}

/**
 * Start the remote HTTP MCP server
 * @param options - Optional configuration including tool extension callback
 */
export async function startRemoteMcpServer(options?: RemoteMcpServerOptions): Promise<void> {
  // Auto-initialize all data directories on server start
  ensureDirectories();

  const port = parseInt(process.env.PORT || "3000", 10);
  const host = process.env.HOST || "0.0.0.0";
  const sessionMode = process.env.MCP_SESSION_MODE || "stateless";
  const apiKeys = getApiKeys();
  const auth0 = getAuth0Config();
  const apiKeyAuthEnabled = apiKeys !== null && apiKeys.size > 0;
  const auth0Enabled = auth0 !== null;
  const authEnabled = apiKeyAuthEnabled || auth0Enabled;

  console.log(`Starting CBrowser Remote MCP Server v${VERSION}...`);
  console.log(`Mode: ${sessionMode}`);
  console.log(`Auth: ${authEnabled ? "enabled" : "disabled (open access)"}`);
  if (apiKeyAuthEnabled) {
    console.log(`  - API Key auth: enabled (${apiKeys?.size} keys)`);
  }
  if (auth0Enabled) {
    console.log(`  - Auth0 OAuth: enabled (${auth0?.domain})`);
  }
  console.log(`Listening on ${host}:${port}`);

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    // CORS headers for all responses
    // Use request origin for CORS to avoid wildcard security issues
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id, X-API-Key");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, WWW-Authenticate");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // =====================================================================
    // Public Endpoints (no auth required)
    // =====================================================================

    // Health check endpoint
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        version: VERSION,
        auth: authEnabled,
        auth_methods: {
          api_key: apiKeyAuthEnabled,
          oauth: auth0Enabled,
        },
      }));
      return;
    }

    // Server info endpoint
    if (url.pathname === "/info") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        name: "cbrowser",
        version: VERSION,
        description: "Cognitive Browser - AI-powered browser automation with constitutional safety",
        mcp_endpoint: "/mcp",
        auth_required: authEnabled,
        auth_methods: {
          api_key: apiKeyAuthEnabled,
          oauth: auth0Enabled ? {
            domain: auth0?.domain,
            authorization_endpoint: `https://${auth0?.domain}/authorize`,
            token_endpoint: `https://${auth0?.domain}/oauth/token`,
          } : false,
        },
        capabilities: ["navigation", "interaction", "visual-testing", "nlp-testing", "performance"],
      }));
      return;
    }

    // Protected Resource Metadata (RFC 9728) - required for OAuth
    if (url.pathname === "/.well-known/oauth-protected-resource") {
      const metadata = getProtectedResourceMetadata();
      if (metadata) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(metadata));
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "OAuth not configured" }));
      }
      return;
    }

    // =====================================================================
    // Protected Endpoints (auth required)
    // =====================================================================

    // Auth check for protected endpoints
    if (authEnabled) {
      const authResult = await validateAuth(req, apiKeys, auth0Enabled);
      if (!authResult.valid) {
        sendUnauthorized(res, authResult.reason);
        return;
      }
    }

    // MCP endpoint
    if (url.pathname === "/mcp" || url.pathname === "/") {
      // Get or create session
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      let transport: StreamableHTTPServerTransport;

      if (sessionMode === "stateful" && sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId)!;
      } else {
        // Create new transport
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: sessionMode === "stateful" ? () => randomUUID() : undefined,
        });

        // Create and connect server
        const server = createMcpServer();

        // Allow extension with additional tools (for Enterprise)
        if (options?.extendServer) {
          await options.extendServer(server);
        }

        await server.connect(transport);

        // Store transport for stateful mode
        if (sessionMode === "stateful") {
          const newSessionId = transport.sessionId;
          if (newSessionId) {
            transports.set(newSessionId, transport);
            transport.onclose = () => {
              transports.delete(newSessionId);
            };
          }
        }
      }

      await handleMcpRequest(req, res, transport);
      return;
    }

    // 404 for other paths
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  httpServer.listen(port, host, () => {
    console.log(`\nCognitive Browser Remote MCP Server running at http://${host}:${port}`);
    console.log(`\nEndpoints:`);
    console.log(`  MCP:      http://${host}:${port}/mcp`);
    console.log(`  Health:   http://${host}:${port}/health`);
    console.log(`  Info:     http://${host}:${port}/info`);
    if (auth0Enabled) {
      console.log(`  OAuth:    http://${host}:${port}/.well-known/oauth-protected-resource`);
    }
    if (authEnabled) {
      console.log(`\nAuthentication:`);
      if (apiKeyAuthEnabled) {
        console.log(`  API Key:  Authorization: Bearer <your-api-key>`);
        console.log(`            X-API-Key: <your-api-key>`);
      }
      if (auth0Enabled) {
        console.log(`  OAuth:    Authorization: Bearer <jwt-token>`);
        console.log(`            Auth0 Domain: ${auth0?.domain}`);
      }
    }
    console.log(`\nFor claude.ai custom connector:`);
    console.log(`  URL: http://${host}:${port}/mcp`);
    if (auth0Enabled) {
      console.log(`  OAuth metadata: http://${host}:${port}/.well-known/oauth-protected-resource`);
    }
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");
    if (browser) {
      await browser.close();
    }
    httpServer.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Run if executed directly
if (process.argv[1]?.endsWith("mcp-server-remote.js") ||
    process.argv[1]?.endsWith("mcp-server-remote.ts")) {
  startRemoteMcpServer().catch((err) => {
    console.error("Failed to start remote MCP server:", err);
    process.exit(1);
  });
}
