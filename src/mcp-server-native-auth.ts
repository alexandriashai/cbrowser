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
 * CBrowser MCP Server with Native SDK OAuth Authentication
 *
 * Uses the official MCP SDK auth router (Express-based) with ProxyOAuthServerProvider
 * for RFC-compliant OAuth 2.1 integration with Auth0 or other providers.
 *
 * Run with: cbrowser mcp-native-auth
 * Or: npx cbrowser mcp-native-auth
 *
 * Environment variables:
 *   PORT - Port to listen on (default: 3000)
 *   HOST - Host to bind to (default: 0.0.0.0)
 *   MCP_SERVER_URL - Public URL of this server (required for OAuth metadata)
 *
 * Auth0 OAuth Environment Variables:
 *   AUTH0_DOMAIN - Your Auth0 tenant domain (e.g., 'your-tenant.auth0.com')
 *   AUTH0_AUDIENCE - API audience/identifier (e.g., 'https://your-server.com')
 *   AUTH0_CLIENT_ID - Optional: Client ID for static registration
 */

import express, { Request, Response, NextFunction } from "express";
import { createServer } from "node:http";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter, mcpAuthMetadataRouter, type AuthRouterOptions } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { ProxyOAuthServerProvider, type ProxyOptions } from "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthClientInformationFull, OAuthMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { z } from "zod";
import { CBrowser } from "./browser.js";
import { ensureDirectories, getStatusInfo, getSessionId } from "./config.js";

// Version from package.json
const VERSION = "16.14.5";

// =========================================================================
// Configuration
// =========================================================================

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const SERVER_URL = process.env.MCP_SERVER_URL || `http://localhost:${PORT}`;

// Token cache to avoid hitting Auth0 rate limits
const tokenCache = new Map<string, { payload: JWTPayload; expires: number }>();
const TOKEN_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// =========================================================================
// Auth0 Configuration
// =========================================================================

interface Auth0Config {
  domain: string;
  audience: string;
  clientId?: string;
  jwks: ReturnType<typeof createRemoteJWKSet>;
}

let auth0Config: Auth0Config | null = null;

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
async function validateAuth0Token(token: string): Promise<AuthInfo | null> {
  const config = getAuth0Config();
  if (!config) {
    return null;
  }

  // Check cache first (use first 32 chars of token as key for security)
  const cacheKey = token.substring(0, 32);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return {
      token,
      clientId: cached.payload.azp as string || "unknown",
      scopes: (cached.payload.scope as string)?.split(" ") || [],
      expiresAt: cached.payload.exp ? cached.payload.exp * 1000 : undefined,
    };
  }

  const tokenParts = token.split(".");

  // If it's a proper JWT (3 parts), validate locally
  if (tokenParts.length === 3) {
    try {
      const { payload } = await jwtVerify(token, config.jwks, {
        issuer: `https://${config.domain}/`,
        audience: config.audience,
      });
      console.log("[Auth] JWT validated successfully for subject:", payload.sub);
      // Cache the result
      tokenCache.set(cacheKey, { payload, expires: Date.now() + TOKEN_CACHE_TTL });
      return {
        token,
        clientId: payload.azp as string || "unknown",
        scopes: (payload.scope as string)?.split(" ") || [],
        expiresAt: payload.exp ? payload.exp * 1000 : undefined,
      };
    } catch (error) {
      console.error("[Auth] JWT validation failed:", error instanceof Error ? error.message : error);
      return null;
    }
  }

  // For opaque/JWE tokens, validate via Auth0's userinfo endpoint
  console.log("[Auth] Opaque token detected, validating via Auth0 userinfo...");
  try {
    const response = await fetch(`https://${config.domain}/userinfo`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.ok) {
      const userinfo = await response.json();
      console.log("[Auth] Token validated via userinfo for:", userinfo.sub || userinfo.email);
      // Cache the result
      tokenCache.set(cacheKey, { payload: userinfo as JWTPayload, expires: Date.now() + TOKEN_CACHE_TTL });
      return {
        token,
        clientId: userinfo.sub || "unknown",
        scopes: [],
      };
    } else {
      console.error("[Auth] Userinfo validation failed:", response.status, await response.text());
      return null;
    }
  } catch (error) {
    console.error("[Auth] Userinfo request failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

// =========================================================================
// Browser Instance Management
// =========================================================================

let browserInstance: CBrowser | null = null;

async function getBrowser(): Promise<CBrowser> {
  if (!browserInstance) {
    browserInstance = new CBrowser({ headless: true });
    await browserInstance.launch();
  }
  return browserInstance;
}

// =========================================================================
// Create MCP Server with Tools
// =========================================================================

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "cbrowser",
    version: VERSION,
  });

  // Register basic tools
  server.tool(
    "status",
    "Get CBrowser environment status",
    {},
    async () => {
      const info = await getStatusInfo(VERSION);
      return {
        content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
      };
    }
  );

  server.tool(
    "navigate",
    "Navigate to a URL",
    {
      url: z.string().describe("URL to navigate to"),
    },
    async ({ url }) => {
      const browser = await getBrowser();
      await browser.navigate(url);
      return {
        content: [{ type: "text", text: `Navigated to ${url}` }],
      };
    }
  );

  server.tool(
    "screenshot",
    "Take a screenshot of the current page",
    {
      name: z.string().optional().describe("Screenshot filename"),
    },
    async ({ name }) => {
      const browser = await getBrowser();
      const paths = ensureDirectories();
      const filename = name || `screenshot_${Date.now()}.png`;
      const filepath = `${paths.screenshotsDir}/${filename}`;
      await browser.screenshot(filepath);
      return {
        content: [{ type: "text", text: `Screenshot saved to ${filepath} (session: ${paths.sessionId})` }],
      };
    }
  );

  server.tool(
    "click",
    "Click an element on the page",
    {
      selector: z.string().describe("CSS selector or natural language description"),
    },
    async ({ selector }) => {
      const browser = await getBrowser();
      await browser.click(selector);
      return {
        content: [{ type: "text", text: `Clicked: ${selector}` }],
      };
    }
  );

  server.tool(
    "fill",
    "Fill a form field",
    {
      selector: z.string().describe("CSS selector or natural language description"),
      value: z.string().describe("Value to fill"),
    },
    async ({ selector, value }) => {
      const browser = await getBrowser();
      await browser.fill(selector, value);
      return {
        content: [{ type: "text", text: `Filled ${selector} with value` }],
      };
    }
  );

  return server;
}

// =========================================================================
// Proxy OAuth Provider Setup
// =========================================================================

function createProxyOAuthProvider(): ProxyOAuthServerProvider | null {
  const config = getAuth0Config();
  if (!config) {
    console.log("[Auth] No Auth0 configuration found, auth disabled");
    return null;
  }

  const options: ProxyOptions = {
    endpoints: {
      authorizationUrl: `https://${config.domain}/authorize`,
      tokenUrl: `https://${config.domain}/oauth/token`,
      revocationUrl: `https://${config.domain}/oauth/revoke`,
      registrationUrl: `https://${config.domain}/oidc/register`,
    },
    verifyAccessToken: async (token: string): Promise<AuthInfo> => {
      const result = await validateAuth0Token(token);
      if (!result) {
        throw new Error("Invalid access token");
      }
      return result;
    },
    getClient: async (clientId: string): Promise<OAuthClientInformationFull | undefined> => {
      // For dynamic registration, we trust Auth0 to manage clients
      // Return basic info for any client ID that Auth0 issued
      return {
        client_id: clientId,
        client_name: "CBrowser Client",
        redirect_uris: [],
      };
    },
  };

  return new ProxyOAuthServerProvider(options);
}

// =========================================================================
// Express App Setup
// =========================================================================

function createApp(): express.Application {
  const app = express();

  // Trust proxy for accurate IP behind reverse proxy
  app.set("trust proxy", true);

  // CORS middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, MCP-Session-ID, X-API-Key");
    res.setHeader("Access-Control-Expose-Headers", "MCP-Session-ID");

    if (req.method === "OPTIONS") {
      res.status(200).end();
      return;
    }
    next();
  });

  // Health check (always available)
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      version: VERSION,
      session: getSessionId(),
      timestamp: new Date().toISOString(),
    });
  });

  // Server info (always available)
  app.get("/info", (_req: Request, res: Response) => {
    res.json({
      name: "CBrowser MCP Server (Native Auth)",
      version: VERSION,
      description: "Cognitive Browser automation with native MCP SDK OAuth",
      session: getSessionId(),
      authEnabled: !!getAuth0Config(),
    });
  });

  // Setup OAuth with native MCP SDK auth router
  const provider = createProxyOAuthProvider();
  if (provider) {
    const serverUrl = new URL(SERVER_URL);
    const config = getAuth0Config()!;

    // Full OAuth server mode - proxies to Auth0
    const authOptions: AuthRouterOptions = {
      provider,
      issuerUrl: new URL(`https://${config.domain}`),
      baseUrl: serverUrl,
      serviceDocumentationUrl: new URL("https://github.com/alexandriashai/cbrowser#readme"),
      scopesSupported: ["openid", "profile", "cbrowser:read", "cbrowser:write"],
      resourceName: "CBrowser MCP Server",
      resourceServerUrl: serverUrl,
    };

    app.use(mcpAuthRouter(authOptions));
    console.log("[Auth] Native MCP SDK OAuth router installed");
    console.log(`[Auth] Authorization endpoint: ${serverUrl.href}authorize`);
    console.log(`[Auth] Token endpoint: ${serverUrl.href}token`);
  } else {
    // No auth - expose protected resource metadata pointing to nothing
    console.log("[Auth] No authentication configured - server is open");
  }

  // MCP endpoint
  app.all("/mcp", express.raw({ type: "*/*" }), async (req: Request, res: Response) => {
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => getSessionId(),
      });

      const server = createMcpServer();
      await server.connect(transport);

      // Handle the request
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("[MCP] Error handling request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Root redirects to info
  app.get("/", (_req: Request, res: Response) => {
    res.redirect("/info");
  });

  return app;
}

// =========================================================================
// Main Entry Point
// =========================================================================

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║         CBrowser MCP Server (Native Auth)                    ║
║         v${VERSION}                                              ║
╚══════════════════════════════════════════════════════════════╝
`);

  // Ensure directories exist
  const paths = ensureDirectories();
  console.log(`[Config] Data directory: ${paths.dataDir}`);
  console.log(`[Config] Session ID: ${paths.sessionId}`);
  console.log(`[Config] Screenshots: ${paths.screenshotsDir}`);

  // Create and start Express app
  const app = createApp();
  const server = createServer(app);

  server.listen(PORT, HOST, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║  MCP Server running at: http://${HOST}:${PORT}
║  Health check: http://${HOST}:${PORT}/health
║  MCP endpoint: http://${HOST}:${PORT}/mcp
║  Auth mode: ${getAuth0Config() ? "OAuth 2.1 (Auth0)" : "OPEN (no auth)"}
╚══════════════════════════════════════════════════════════════╝
`);
  });

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n[Server] Shutting down...");
    if (browserInstance) {
      await browserInstance.close();
    }
    server.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\n[Server] Terminating...");
    if (browserInstance) {
      await browserInstance.close();
    }
    server.close();
    process.exit(0);
  });
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("[Fatal]", error);
    process.exit(1);
  });
}

export { createApp, createMcpServer, createProxyOAuthProvider };
