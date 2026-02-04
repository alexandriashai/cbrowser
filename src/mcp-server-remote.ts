#!/usr/bin/env node
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
 *   AUTH0_AUDIENCE - API audience/identifier (e.g., 'https://cbrowser-mcp.wyldfyre.ai')
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
  runNLTestFile,
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
} from "./analysis/index.js";

// Performance module imports
import {
  capturePerformanceBaseline,
  detectPerformanceRegression,
  listPerformanceBaselines,
} from "./performance/index.js";

// Shared browser instance
let browser: CBrowser | null = null;

async function getBrowser(): Promise<CBrowser> {
  if (!browser) {
    browser = new CBrowser({
      headless: true,
      persistent: true,
    });
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

  const serverUrl = process.env.MCP_SERVER_URL || `https://cbrowser-mcp.wyldfyre.ai`;

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
    "Click with auto-retry and self-healing selectors",
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
      const loaded = await b.loadSession(name);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: loaded, sessionName: name }, null, 2),
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
            text: JSON.stringify({
              overallStatus: result.overallStatus,
              similarityScore: result.analysis?.similarityScore,
              summary: result.analysis?.summary,
              changesCount: result.analysis?.changes?.length || 0,
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
      const result = await runChaosTest(b, url, { networkLatency, offline, blockUrls });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              passed: result.passed,
              errors: result.errors,
              duration: result.duration,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "compare_personas",
    "Compare how different user personas experience a journey",
    {
      url: z.string().url().describe("Starting URL"),
      goal: z.string().describe("Goal to accomplish"),
      personas: z.array(z.string()).describe("Persona names to compare"),
    },
    async ({ url, goal, personas }) => {
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
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              name: result.name,
              url: result.url,
              lcp: result.metrics.lcp,
              fcp: result.metrics.fcp,
              ttfb: result.metrics.ttfb,
              cls: result.metrics.cls,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "perf_regression",
    "Detect performance regression against baseline with configurable sensitivity. Uses dual thresholds: both percentage AND absolute change must be exceeded. Profiles: strict (CI/CD, FCP 10%/50ms), normal (default, FCP 20%/100ms), lenient (dev, FCP 30%/200ms). Sub-50ms FCP variations ignored by default.",
    {
      url: z.string().url().describe("URL to test"),
      baselineName: z.string().describe("Name of baseline to compare against"),
      sensitivity: z.enum(["strict", "normal", "lenient"]).optional().default("normal").describe("Sensitivity profile: strict (CI/CD), normal (default), lenient (development)"),
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

  // Diagnostics
  server.tool(
    "status",
    "Get CBrowser environment status and diagnostics including data directories, installed browsers, configuration, and self-healing cache statistics",
    {},
    async () => {
      const info = await getStatusInfo("7.4.12");
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
}

/**
 * Create a configured MCP server instance
 */
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "cbrowser",
    version: "7.9.0",
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
    const parsedBody = body ? JSON.parse(body) : undefined;

    // Log request details
    const method = parsedBody?.method || "unknown";
    let logLine = `← ${method}`;
    if (method === "tools/call" && parsedBody?.params?.name) {
      logLine += ` [${parsedBody.params.name}]`;
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
 * Start the remote HTTP MCP server
 */
export async function startRemoteMcpServer(): Promise<void> {
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

  console.log(`Starting CBrowser Remote MCP Server v7.10.0...`);
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
    res.setHeader("Access-Control-Allow-Origin", "*");
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
        version: "7.9.0",
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
        version: "7.9.0",
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
    console.log(`  URL: https://cbrowser-mcp.wyldfyre.ai/mcp`);
    if (auth0Enabled) {
      console.log(`  OAuth metadata: https://cbrowser-mcp.wyldfyre.ai/.well-known/oauth-protected-resource`);
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
