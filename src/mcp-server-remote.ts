#!/usr/bin/env node
/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
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
 *
 * Rate Limiting Environment Variables:
 *   RATE_LIMIT_ENABLED - Enable IP-based rate limiting (default: false)
 *   RATE_LIMIT_REQUESTS - Max requests per window (default: 5)
 *   RATE_LIMIT_WINDOW_MS - Window size in milliseconds (default: 3600000 = 1 hour)
 *   RATE_LIMIT_WHITELIST - Comma-separated IPs to skip rate limiting
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CBrowser } from "./browser.js";
import { ensureDirectories } from "./config.js";

// Version from package.json - single source of truth
import { VERSION } from "./version.js";

// Stealth/Enterprise loader (v16.2.0)
import {
  type IConstitutionalEnforcer,
  type StealthConfig,
} from "./stealth/index.js";

// Modular MCP tools (v17.5.0)
import { registerAllPublicTools, setRemoteMode } from "./mcp-tools/index.js";
import type { ToolRegistrationContext } from "./mcp-tools/types.js";

// Shared browser instance
let browser: CBrowser | null = null;

// Stealth state (enterprise integration)
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
  }
  return browser;
}

// Transport storage for stateful sessions
const transports = new Map<string, StreamableHTTPServerTransport>();

// Auth0 configuration interface
interface Auth0Config {
  domain: string;
  audience: string;
  clientId?: string;
}

// Token cache for Auth0 validation
const tokenCache = new Map<string, { payload: JWTPayload; expiry: number }>();
const TOKEN_CACHE_MARGIN = 60 * 1000; // 1 minute margin before expiry

function getAuth0Config(): Auth0Config | null {
  const domain = process.env.AUTH0_DOMAIN;
  const audience = process.env.AUTH0_AUDIENCE;

  if (!domain || !audience) {
    return null;
  }

  return {
    domain,
    audience,
    clientId: process.env.AUTH0_CLIENT_ID,
  };
}

async function validateAuth0Token(token: string): Promise<JWTPayload | null> {
  const auth0 = getAuth0Config();
  if (!auth0) return null;

  // Check cache first
  const cached = tokenCache.get(token);
  if (cached && cached.expiry > Date.now()) {
    return cached.payload;
  }

  try {
    // Try JWT validation first
    const jwks = createRemoteJWKSet(new URL(`https://${auth0.domain}/.well-known/jwks.json`));

    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://${auth0.domain}/`,
      audience: auth0.audience,
    });

    // Cache the result
    const exp = payload.exp ? payload.exp * 1000 : Date.now() + 30 * 60 * 1000;
    tokenCache.set(token, {
      payload,
      expiry: exp - TOKEN_CACHE_MARGIN,
    });

    return payload;
  } catch (jwtError) {
    // If JWT validation fails, try opaque token validation via userinfo
    try {
      const userinfoResponse = await fetch(`https://${auth0.domain}/userinfo`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (userinfoResponse.ok) {
        const userinfo = await userinfoResponse.json();
        const payload: JWTPayload = {
          sub: userinfo.sub,
          email: userinfo.email,
          name: userinfo.name,
        };

        // Cache opaque tokens for 30 minutes
        tokenCache.set(token, {
          payload,
          expiry: Date.now() + 30 * 60 * 1000 - TOKEN_CACHE_MARGIN,
        });

        return payload;
      }
    } catch {
      // Opaque token validation also failed
    }

    return null;
  }
}

function getProtectedResourceMetadata(): object | null {
  const auth0 = getAuth0Config();
  if (!auth0) return null;

  return {
    resource: auth0.audience,
    authorization_servers: [`https://${auth0.domain}`],
    bearer_methods_supported: ["header"],
    scopes_supported: ["openid", "profile", "email"],
  };
}

function getApiKeys(): Set<string> | null {
  const singleKey = process.env.MCP_API_KEY;
  const multipleKeys = process.env.MCP_API_KEYS;

  if (!singleKey && !multipleKeys) {
    return null;
  }

  const keys = new Set<string>();

  if (singleKey) {
    keys.add(singleKey);
  }

  if (multipleKeys) {
    for (const key of multipleKeys.split(",")) {
      const trimmed = key.trim();
      if (trimmed) {
        keys.add(trimmed);
      }
    }
  }

  return keys.size > 0 ? keys : null;
}

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

// ============================================================================
// Rate Limiting (with session tracking and burst allowance)
// ============================================================================

interface RateLimitConfig {
  enabled: boolean;
  maxRequests: number;        // Sustained limit per hour
  windowMs: number;           // Main window (default: 1 hour)
  burstRequests: number;      // Burst limit (first few minutes)
  burstWindowMs: number;      // Burst window (default: 5 minutes)
  whitelist: Set<string>;
}

interface RateLimitEntry {
  requests: number[];         // Timestamps of all requests
  sessionStart: number;       // When this session/IP first appeared
}

// Rate limit storage: key (session or IP) -> entry
const rateLimitStore = new Map<string, RateLimitEntry>();

function getRateLimitConfig(): RateLimitConfig {
  const enabled = process.env.RATE_LIMIT_ENABLED === "true";
  const maxRequests = parseInt(process.env.RATE_LIMIT_REQUESTS || "30", 10);
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "3600000", 10);
  const burstRequests = parseInt(process.env.RATE_LIMIT_BURST || "15", 10);
  const burstWindowMs = parseInt(process.env.RATE_LIMIT_BURST_WINDOW_MS || "300000", 10);
  const whitelistStr = process.env.RATE_LIMIT_WHITELIST || "";

  const whitelist = new Set<string>();
  for (const ip of whitelistStr.split(",")) {
    const trimmed = ip.trim();
    if (trimmed) {
      whitelist.add(trimmed);
    }
  }

  return { enabled, maxRequests, windowMs, burstRequests, burstWindowMs, whitelist };
}

function getClientIP(req: IncomingMessage): string {
  // Check X-Forwarded-For header (behind proxy/load balancer)
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    // Take the first IP in the chain (original client)
    return forwarded.split(",")[0].trim();
  }

  // Check X-Real-IP header (nginx)
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string") {
    return realIp.trim();
  }

  // Fall back to socket remote address
  return req.socket.remoteAddress || "unknown";
}

function getRateLimitKey(req: IncomingMessage): string {
  // Prefer MCP session ID for per-session tracking
  const sessionId = req.headers["mcp-session-id"];
  if (typeof sessionId === "string" && sessionId.length > 0) {
    return `session:${sessionId}`;
  }

  // Fall back to IP-based tracking
  return `ip:${getClientIP(req)}`;
}

function checkRateLimit(
  req: IncomingMessage,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetTime: number; burstRemaining?: number } {
  if (!config.enabled) {
    return { allowed: true, remaining: config.maxRequests, resetTime: 0 };
  }

  const ip = getClientIP(req);

  // Skip rate limiting for whitelisted IPs
  if (config.whitelist.has(ip)) {
    return { allowed: true, remaining: config.maxRequests, resetTime: 0 };
  }

  const key = getRateLimitKey(req);
  const now = Date.now();
  const windowStart = now - config.windowMs;
  const burstWindowStart = now - config.burstWindowMs;

  // Get or create entry
  let entry = rateLimitStore.get(key);
  if (!entry) {
    entry = { requests: [], sessionStart: now };
    rateLimitStore.set(key, entry);
  }

  // Filter out requests outside the main window
  entry.requests = entry.requests.filter(timestamp => timestamp > windowStart);

  // Count requests in burst window
  const burstRequests = entry.requests.filter(timestamp => timestamp > burstWindowStart).length;

  // Check if within burst period (first burstWindowMs of session)
  const inBurstPeriod = (now - entry.sessionStart) < config.burstWindowMs;

  // Determine current limit based on burst period
  let currentLimit: number;
  let currentWindowRequests: number;

  if (inBurstPeriod) {
    // During burst period: use burst limit
    currentLimit = config.burstRequests;
    currentWindowRequests = burstRequests;
  } else {
    // After burst period: use sustained limit
    currentLimit = config.maxRequests;
    currentWindowRequests = entry.requests.length;
  }

  // Calculate remaining requests
  const remaining = Math.max(0, currentLimit - currentWindowRequests);

  // Calculate reset time
  const resetTime = entry.requests.length > 0
    ? entry.requests[0] + config.windowMs
    : now + config.windowMs;

  if (currentWindowRequests >= currentLimit) {
    // Rate limit exceeded
    return {
      allowed: false,
      remaining: 0,
      resetTime,
      burstRemaining: inBurstPeriod ? 0 : undefined,
    };
  }

  // Allow request and record it
  entry.requests.push(now);

  return {
    allowed: true,
    remaining: remaining - 1,
    resetTime,
    burstRemaining: inBurstPeriod ? Math.max(0, config.burstRequests - burstRequests - 1) : undefined,
  };
}

// Cleanup old rate limit entries periodically (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  const config = getRateLimitConfig();

  for (const [key, entry] of rateLimitStore.entries()) {
    // Filter out old requests
    entry.requests = entry.requests.filter(t => t > now - config.windowMs);

    // Remove entry if no requests and session is old (2x window)
    const sessionAge = now - entry.sessionStart;
    if (entry.requests.length === 0 && sessionAge > config.windowMs * 2) {
      rateLimitStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

async function validateAuth(
  req: IncomingMessage,
  apiKeys: Set<string> | null,
  auth0Enabled: boolean
): Promise<{ valid: boolean; reason?: string }> {
  // Try API key first (faster)
  if (apiKeys && validateApiKey(req, apiKeys)) {
    return { valid: true };
  }

  // Try Auth0 if enabled
  if (auth0Enabled) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const payload = await validateAuth0Token(token);
      if (payload) {
        return { valid: true };
      }
    }
  }

  return { valid: false, reason: "Invalid or missing authentication" };
}

function sendUnauthorized(res: ServerResponse, message?: string): void {
  const auth0 = getAuth0Config();
  let wwwAuth = "Bearer";

  if (auth0) {
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
function configureMcpTools(
  server: McpServer,
  customRegisterTools?: (server: McpServer, context: ToolRegistrationContext) => void | Promise<void>
): void {
  const context: ToolRegistrationContext = { getBrowser };

  if (customRegisterTools) {
    // Use custom tool registration (for Enterprise servers)
    customRegisterTools(server, context);
  } else {
    // Register all public npm tools (82 total: 60 real + 22 enterprise stubs)
    registerAllPublicTools(server, context);
  }
}

/**
 * Create a configured MCP server instance
 */
function createMcpServer(
  customRegisterTools?: (server: McpServer, context: ToolRegistrationContext) => void | Promise<void>
): McpServer {
  const server = new McpServer({
    name: "cbrowser",
    version: VERSION,
  });
  configureMcpTools(server, customRegisterTools);
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
  const start = Date.now();

  // Fix Accept header for clients that don't properly set it (e.g., Claude.ai custom connectors)
  // The MCP SDK requires "application/json, text/event-stream" but some clients omit this
  // We must modify both headers object AND rawHeaders array since @hono/node-server may read either
  const acceptHeader = req.headers.accept || "";
  if (!acceptHeader.includes("text/event-stream")) {
    const fixedAccept = "application/json, text/event-stream";
    req.headers.accept = fixedAccept;
    // Also fix rawHeaders array (Hono may read from this)
    const acceptIdx = req.rawHeaders.findIndex(h => h.toLowerCase() === "accept");
    if (acceptIdx >= 0) {
      req.rawHeaders[acceptIdx + 1] = fixedAccept;
    } else {
      req.rawHeaders.push("Accept", fixedAccept);
    }
  }

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
  /**
   * Custom tool registration function. If provided, replaces the default
   * registerAllPublicTools call. Use this for Enterprise servers that need
   * different tool compositions.
   */
  registerTools?: (server: McpServer, context: ToolRegistrationContext) => void | Promise<void>;
  /**
   * HTML content to serve on GET / requests.
   * If provided, GET / serves this homepage while POST / handles MCP.
   * If not provided, both GET and POST / go to MCP endpoint.
   */
  homepageHtml?: string;
}

// Re-export for enterprise use
export type { ToolRegistrationContext };

/**
 * Start the remote HTTP MCP server
 * @param options - Optional configuration including tool extension callback
 */
export async function startRemoteMcpServer(options?: RemoteMcpServerOptions): Promise<void> {
  // Auto-initialize all data directories on server start
  ensureDirectories();

  // Enable remote mode for screenshot handling (returns base64 images instead of paths)
  setRemoteMode(true);

  const port = parseInt(process.env.PORT || "3000", 10);
  const host = process.env.HOST || "0.0.0.0";
  const sessionMode = process.env.MCP_SESSION_MODE || "stateless";
  const apiKeys = getApiKeys();
  const auth0 = getAuth0Config();
  const apiKeyAuthEnabled = apiKeys !== null && apiKeys.size > 0;
  const auth0Enabled = auth0 !== null;
  const authEnabled = apiKeyAuthEnabled || auth0Enabled;
  const rateLimitConfig = getRateLimitConfig();

  console.log(`Starting CBrowser Remote MCP Server v${VERSION}...`);
  console.log(`Mode: ${sessionMode}`);
  console.log(`Auth: ${authEnabled ? "enabled" : "disabled (open access)"}`);
  if (apiKeyAuthEnabled) {
    console.log(`  - API Key auth: enabled (${apiKeys?.size} keys)`);
  }
  if (auth0Enabled) {
    console.log(`  - Auth0 OAuth: enabled (${auth0?.domain})`);
  }
  if (rateLimitConfig.enabled) {
    console.log(`Rate Limiting: enabled`);
    console.log(`  - Sustained: ${rateLimitConfig.maxRequests} requests per ${rateLimitConfig.windowMs / 1000 / 60} min`);
    console.log(`  - Burst: ${rateLimitConfig.burstRequests} requests in first ${rateLimitConfig.burstWindowMs / 1000 / 60} min`);
    console.log(`  - Tracking: per-session (falls back to IP)`);
    if (rateLimitConfig.whitelist.size > 0) {
      console.log(`  - Whitelisted IPs: ${Array.from(rateLimitConfig.whitelist).join(", ")}`);
    }
  }
  console.log(`Listening on ${host}:${port}`);

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    // Security headers (defense in depth)
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

    // CORS headers for all responses
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id, X-API-Key, X-Signature, X-Timestamp, X-Nonce");
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

    // Rate limit check (if enabled)
    const rateLimit = checkRateLimit(req, rateLimitConfig);
    if (!rateLimit.allowed) {
      const retryAfterSeconds = Math.ceil((rateLimit.resetTime - Date.now()) / 1000);
      const retryAfterMinutes = Math.ceil(retryAfterSeconds / 60);
      const humanReadableTime = retryAfterSeconds > 60
        ? `${retryAfterMinutes} minute${retryAfterMinutes !== 1 ? "s" : ""}`
        : `${retryAfterSeconds} second${retryAfterSeconds !== 1 ? "s" : ""}`;

      res.writeHead(429, {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(rateLimitConfig.maxRequests),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetTime / 1000)),
      });
      res.end(JSON.stringify({
        error: "Rate Limit Exceeded",
        message: `⚠️ CBrowser Demo Rate Limit Reached\n\nThe demo server allows ${rateLimitConfig.maxRequests} requests per hour to ensure fair access for all users.\n\nPlease wait ${humanReadableTime} before trying again.\n\nFor unlimited access, see: https://cbrowser.ai/enterprise`,
        user_message: `Rate limit reached. Please wait ${humanReadableTime} and try again.`,
        retry_after_seconds: retryAfterSeconds,
        retry_after_human: humanReadableTime,
        limit: rateLimitConfig.maxRequests,
        window_minutes: Math.round(rateLimitConfig.windowMs / 60000),
      }));
      return;
    }

    // Add rate limit headers to successful responses
    res.setHeader("X-RateLimit-Limit", String(rateLimitConfig.maxRequests));
    res.setHeader("X-RateLimit-Remaining", String(rateLimit.remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(rateLimit.resetTime / 1000)));

    // Auth check for protected endpoints
    if (authEnabled) {
      const authResult = await validateAuth(req, apiKeys, auth0Enabled);
      if (!authResult.valid) {
        sendUnauthorized(res, authResult.reason);
        return;
      }
    }

    // Homepage (GET / with homepageHtml option)
    if (url.pathname === "/" && req.method === "GET" && options?.homepageHtml) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(options.homepageHtml);
      return;
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

        // Create and connect server (with optional custom tool registration)
        const server = createMcpServer(options?.registerTools);

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
