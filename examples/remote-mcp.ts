/**
 * CBrowser v7.4.6 Remote MCP Server Examples
 *
 * Demonstrates:
 * - Starting a remote MCP server
 * - Authentication options (API key, OAuth)
 * - Connecting from claude.ai
 *
 * Run the server: npx cbrowser mcp-remote
 * Or with authentication: MCP_API_KEY=your-key npx cbrowser mcp-remote
 */

import { createServer } from "http";

/**
 * Example: Start Remote MCP Server Programmatically
 *
 * Note: In most cases, use the CLI:
 *   npx cbrowser mcp-remote
 *
 * This example shows programmatic configuration.
 */
async function startRemoteMCPServer() {
  console.log("=== Remote MCP Server Configuration ===\n");

  console.log("Environment Variables:\n");

  console.log("Basic Configuration:");
  console.log("  PORT=3100                     # Server port (default: 3000)");
  console.log("  HOST=127.0.0.1                # Bind address");
  console.log("  MCP_SESSION_MODE=stateless    # Session handling\n");

  console.log("API Key Authentication:");
  console.log("  MCP_API_KEY=your-secret-key   # Single API key");
  console.log("  MCP_API_KEYS=key1,key2,key3   # Multiple API keys\n");

  console.log("Auth0 OAuth (for claude.ai):");
  console.log("  AUTH0_DOMAIN=your-tenant.auth0.com");
  console.log("  AUTH0_AUDIENCE=https://your-server.com/\n");

  console.log("Start command:");
  console.log("  npx cbrowser mcp-remote\n");
}

/**
 * Example: Client Configuration for claude.ai
 */
function claudeAISetup() {
  console.log("=== claude.ai Custom Connector Setup ===\n");

  console.log("Demo Server (rate-limited, no auth):");
  console.log("  URL: https://cbrowser-mcp-demo.wyldfyre.ai/mcp");
  console.log("  Rate limit: 5 requests/minute, burst of 10");
  console.log("  Purpose: Evaluation only\n");

  console.log("Authenticated Server (full access):");
  console.log("  URL: https://cbrowser-mcp.wyldfyre.ai/mcp");
  console.log("  Auth: Auth0 OAuth 2.1");
  console.log("  Rate limit: None\n");

  console.log("Setup Steps:");
  console.log("  1. Go to claude.ai");
  console.log("  2. Open Settings -> Integrations -> Custom MCP Servers");
  console.log("  3. Add the server URL");
  console.log("  4. Complete OAuth login when prompted (for authenticated server)");
  console.log("  5. You now have 31 browser automation tools!\n");
}

/**
 * Example: API Key Authentication
 */
function apiKeyAuth() {
  console.log("=== API Key Authentication ===\n");

  console.log("Set API key when starting server:");
  console.log("  MCP_API_KEY=your-secret-key npx cbrowser mcp-remote\n");

  console.log("Client usage (Bearer token - recommended):");
  console.log('  curl -H "Authorization: Bearer your-api-key" https://server/mcp\n');

  console.log("Client usage (X-API-Key header):");
  console.log('  curl -H "X-API-Key: your-api-key" https://server/mcp\n');

  console.log("Generate a secure key:");
  console.log("  openssl rand -hex 32\n");
}

/**
 * Example: OAuth Protected Resource Metadata
 */
function oauthMetadata() {
  console.log("=== OAuth Protected Resource Metadata ===\n");

  console.log("Endpoint: /.well-known/oauth-protected-resource\n");

  console.log("Response example:");
  const metadata = {
    resource: "https://cbrowser-mcp.wyldfyre.ai",
    authorization_servers: ["https://your-tenant.auth0.com"],
    bearer_methods_supported: ["header"],
    scopes_supported: ["openid", "profile", "cbrowser:read", "cbrowser:write"],
  };
  console.log(JSON.stringify(metadata, null, 2));
  console.log();
}

/**
 * Example: Health Check
 */
function healthCheck() {
  console.log("=== Health Check Endpoint ===\n");

  console.log("Endpoint: /health\n");

  console.log("Response example:");
  const health = {
    status: "ok",
    version: "7.4.6",
    auth: true,
    auth_methods: {
      api_key: true,
      oauth: true,
    },
  };
  console.log(JSON.stringify(health, null, 2));
  console.log();
}

async function main() {
  await startRemoteMCPServer();
  claudeAISetup();
  apiKeyAuth();
  oauthMetadata();
  healthCheck();
}

main().catch(console.error);
