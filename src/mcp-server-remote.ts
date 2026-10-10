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

import { registerUiResources } from "./mcp-tools/ui-resources.js";
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
// getActiveKeyHash is deliberately no longer imported: billing identity is per-request
// (see resolveRequestKeyHash). setActiveKeyHash stays for the usage-logging path, which
// is per-session rather than per-charge.
import { registerAllPublicTools, setRemoteMode, setActiveTier as setTierGate, setActiveKeyHash, isToolAccessible, upgradePrompt } from "./mcp-tools/index.js";
import { withPersonaScope } from "./persona-scope.js";
import { withChargeScope } from "./charge-scope.js";

/**
 * keyHash -> accountId, so a request can be scoped to the tenant that owns it.
 *
 * Deliberately NOT a module-level "current account" the way setActiveKeyHash
 * works: that shape is why billing identity had to be moved to a per-request
 * resolver, and applied to personas it would let one tenant's tool call read
 * another's directory whenever two requests overlap. This is a lookup keyed by
 * the request's own hash, and the value is carried through AsyncLocalStorage.
 */
const accountCache = new Map<string, { accountId: number; expiresAt: number }>();

/** The account owning this request, or null when unauthenticated/unknown. */
export async function resolveRequestAccountId(req: IncomingMessage): Promise<number | null> {
  const apiKey = extractApiKey(req);
  if (!apiKey) return null;
  const { createHash } = await import("crypto");
  const keyHash = createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
  const hit = accountCache.get(keyHash);
  if (hit && hit.expiresAt > Date.now()) return hit.accountId;
  // Populated as a side effect of tier resolution, which every authed request
  // already performs.
  await resolveApiKeyTier(apiKey);
  const after = accountCache.get(keyHash);
  return after && after.expiresAt > Date.now() ? after.accountId : null;
}
import type { PricingTier } from "./mcp-tools/tool-categories.js";
import type { ToolRegistrationContext } from "./mcp-tools/types.js";

// Shared browser instance (single Chromium process)
let browser: CBrowser | null = null;

// Stealth state (enterprise integration)
const stealthConfig: Partial<StealthConfig> | null = null;

// Cached tool manifest for unauthenticated tools/list requests (populated at startup)
let cachedToolManifest: Array<{
  name: string; description?: string; inputSchema?: unknown;
  outputSchema?: unknown; _meta?: unknown;
}> | null = null;

// ============================================================================
// Tool-Level Session Tokens (v18.33.0)
// Provides browser continuity across tool calls without relying on MCP session
// headers. Works with any MCP client including Claude.ai's proxy.
// ============================================================================

const browserTokens = new Map<string, { sessionId: string; createdAt: number }>();
const TOKEN_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Generate a short browser token that maps to a session's browser.
 */
export function generateBrowserToken(sessionId: string): string {
  // Short readable token
  const token = `cb_${Math.random().toString(36).substring(2, 10)}`;
  browserTokens.set(token, { sessionId, createdAt: Date.now() });
  return token;
}

/** Thrown when a caller supplies a browser token that no longer resolves. */
export class BrowserSessionExpiredError extends Error {
  constructor(token: string) {
    super(`Browser session '${token}' has expired or does not exist. Call navigate() to start a new session and pass the _browserToken it returns.`);
    this.name = "BrowserSessionExpiredError";
  }
}

/**
 * Resolve a browser token to a session's browser.
 *
 * A SUPPLIED-BUT-UNRESOLVABLE token throws. This used to fall through to minting
 * a fresh session: the caller passed `cb_abc`, got back a DIFFERENT token and a
 * blank about:blank page, and every downstream tool then reported confidently on
 * nothing. `assert` returned `passed:false, actual:""` — so a negative assertion
 * like "page does not contain 'error'" FALSELY PASSED — `find_element_by_intent`
 * returned `confidence:0`, and `save_session` persisted an empty context while
 * reporting `success:true`.
 *
 * A wrong answer is worse than an error, and that fallback manufactured wrong
 * answers by design. Minting is now reserved for callers who supplied NO token,
 * which is the only case where "start me a session" is what they meant.
 * (2026-07-28)
 */
export async function getBrowserByToken(token?: string): Promise<{ browser: CBrowser; token: string }> {
  // Clean expired tokens
  const now = Date.now();
  for (const [t, info] of browserTokens) {
    if (now - info.createdAt > TOKEN_EXPIRY_MS) browserTokens.delete(t);
  }

  // Try to resolve existing token
  if (token) {
    const info = browserTokens.get(token);
    if (info) {
      const session = activeSessions.get(info.sessionId);
      if (session) {
        session.lastActivity = now;
        return { browser: session.browser, token };
      }
      browserTokens.delete(token);
    }
    throw new BrowserSessionExpiredError(token);
  }

  // No token supplied — create new session
  const sessionId = randomUUID();
  const proxyConfig = stealthConfig?.proxy;
  const sessionBrowser = new CBrowser({
    headless: true,
    persistent: false,
    proxy: proxyConfig,
  });

  activeSessions.set(sessionId, {
    browser: sessionBrowser,
    createdAt: now,
    lastActivity: now,
  });

  const newToken = generateBrowserToken(sessionId);
  console.log(`[Token] New browser session ${sessionId.substring(0, 8)}... → token ${newToken}`);
  return { browser: sessionBrowser, token: newToken };
}

// ============================================================================
// Session Isolation (v18.4.0)
// ============================================================================

const MAX_CONCURRENT_SESSIONS = parseInt(process.env.MAX_CONCURRENT_SESSIONS || "20", 10);
const SESSION_IDLE_TIMEOUT_MS = parseInt(process.env.SESSION_IDLE_TIMEOUT_MS || "300000", 10); // 5 min
const SESSION_MEMORY_LIMIT_MB = parseInt(process.env.SESSION_MEMORY_LIMIT_MB || "800", 10); // 800MB per session

interface SessionInfo {
  browser: CBrowser;
  createdAt: number;
  lastActivity: number;
}

// Active sessions: sessionId -> SessionInfo
const activeSessions = new Map<string, SessionInfo>();

// Track recently expired sessions for clear error messaging
// Sessions stay in this set for 10 minutes after expiry
const expiredSessions = new Map<string, { expiredAt: number; reason: string }>();
const EXPIRED_SESSION_RETENTION_MS = 600000; // 10 min

/**
 * Get or create a session-specific browser instance.
 * Each session gets its own CBrowser with isolated context.
 * If a session expired, transparently create a new one (low-friction reconnect).
 */
async function getSessionBrowser(sessionId: string): Promise<CBrowser> {
  // Check if this session was recently expired - auto-recover by creating new session
  const expiredInfo = expiredSessions.get(sessionId);
  if (expiredInfo) {
    const minutesAgo = Math.round((Date.now() - expiredInfo.expiredAt) / 60000);
    console.log(`[Session] Auto-recovering expired session ${sessionId.substring(0, 8)}... (expired ${minutesAgo}m ago: ${expiredInfo.reason})`);
    // Clear the expired marker so we can create a fresh session
    expiredSessions.delete(sessionId);
    // Fall through to create new session below
  }

  // Check if session already exists
  const existing = activeSessions.get(sessionId);
  if (existing) {
    existing.lastActivity = Date.now();
    return existing.browser;
  }

  // Check concurrent session limit
  if (activeSessions.size >= MAX_CONCURRENT_SESSIONS) {
    throw new Error(
      `🚫 CBrowser Demo Server at Capacity\n\n` +
      `The demo server currently has ${MAX_CONCURRENT_SESSIONS} active sessions.\n\n` +
      `Please tell the user:\n` +
      `"The CBrowser demo server is currently at full capacity. ` +
      `Please wait a few minutes and try again, or visit https://cbrowser.ai/enterprise for unlimited access."\n\n` +
      `Sessions automatically expire after 5 minutes of inactivity.`
    );
  }

  // Create new session with isolated browser context
  const proxyConfig = stealthConfig?.proxy;
  const sessionBrowser = new CBrowser({
    headless: true,
    persistent: false, // Non-persistent = fresh context per session
    proxy: proxyConfig,
  });

  activeSessions.set(sessionId, {
    browser: sessionBrowser,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  });

  console.log(`[Session] Created new session ${sessionId.substring(0, 8)}... (${activeSessions.size}/${MAX_CONCURRENT_SESSIONS} active)`);

  return sessionBrowser;
}

/**
 * Clean up a session's browser context
 * @param reason - Why the session was cleaned up (for user messaging)
 */
async function cleanupSession(sessionId: string, reason: string = "Session ended"): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (session) {
    // Capture Chrome PID before closing (for force-kill fallback)
    let chromePid: number | undefined;
    try {
      const browserInstance = (session.browser as any).browser;
      chromePid = browserInstance?.process?.()?.pid;
    } catch { /* ignore */ }

    // Graceful close with timeout
    try {
      await Promise.race([
        session.browser.close(),
        new Promise(resolve => setTimeout(resolve, 5000)), // 5s timeout
      ]);
    } catch (e) {
      // Ignore cleanup errors
    }

    // Force-kill Chrome if graceful close didn't work
    if (chromePid) {
      try {
        process.kill(chromePid, 0); // Check if still alive
        process.kill(chromePid, "SIGKILL");
        console.log(`[Session] Force-killed Chrome PID ${chromePid} for session ${sessionId.substring(0, 8)}...`);
      } catch { /* already dead — good */ }
    }

    activeSessions.delete(sessionId);

    // Also clean any browser tokens pointing to this session
    for (const [token, info] of browserTokens) {
      if (info.sessionId === sessionId) {
        browserTokens.delete(token);
      }
    }

    // Track as expired so subsequent requests get a clear message
    expiredSessions.set(sessionId, {
      expiredAt: Date.now(),
      reason,
    });

    console.log(`[Session] Cleaned up session ${sessionId.substring(0, 8)}... (${activeSessions.size}/${MAX_CONCURRENT_SESSIONS} active) - ${reason}`);
  }
}

/**
 * Get memory usage of a browser session in MB
 * Returns null if unable to determine
 */
async function getSessionMemoryMB(session: SessionInfo): Promise<number | null> {
  try {
    // CBrowser wraps Playwright - try to get the underlying browser process
    const browserInstance = (session.browser as any).browser;
    if (!browserInstance) return null;

    const browserProcess = browserInstance.process?.();
    if (!browserProcess?.pid) return null;

    // Read /proc/<pid>/status for RSS memory
    const { readFileSync } = await import("node:fs");
    const status = readFileSync(`/proc/${browserProcess.pid}/status`, "utf-8");
    const rssMatch = status.match(/VmRSS:\s+(\d+)\s+kB/);
    if (rssMatch) {
      return Math.round(parseInt(rssMatch[1], 10) / 1024); // Convert kB to MB
    }
  } catch (e) {
    // Process may have exited or not be accessible
  }
  return null;
}

/**
 * Kill orphaned chrome-headless-shell processes not tracked by any active session.
 * These accumulate when clients disconnect abruptly or sessions aren't cleaned up properly.
 */
async function killOrphanedChromeProcesses(): Promise<number> {
  try {
    const { execSync } = await import("node:child_process");

    // Get all chrome-headless-shell PIDs on the system
    const output = execSync("pgrep -f chrome-headless-shell 2>/dev/null || true", { encoding: "utf-8" }).trim();
    if (!output) return 0;

    const allChromePids = new Set(output.split("\n").map(p => parseInt(p, 10)).filter(p => !isNaN(p)));
    if (allChromePids.size === 0) return 0;

    // Collect PIDs tracked by active sessions
    const trackedPids = new Set<number>();
    for (const [, session] of activeSessions) {
      try {
        const browserInstance = (session.browser as any).browser;
        if (browserInstance) {
          const proc = browserInstance.process?.();
          if (proc?.pid) {
            trackedPids.add(proc.pid);
            // Also add child PIDs (chrome spawns sub-processes)
            const children = execSync(`pgrep -P ${proc.pid} 2>/dev/null || true`, { encoding: "utf-8" }).trim();
            if (children) {
              children.split("\n").forEach(p => { const n = parseInt(p, 10); if (!isNaN(n)) trackedPids.add(n); });
            }
          }
        }
      } catch { /* session browser may not be launched yet */ }
    }

    // Also check the shared browser instance
    if (browser) {
      try {
        const proc = (browser as any).browser?.process?.();
        if (proc?.pid) {
          trackedPids.add(proc.pid);
          const children = execSync(`pgrep -P ${proc.pid} 2>/dev/null || true`, { encoding: "utf-8" }).trim();
          if (children) {
            children.split("\n").forEach(p => { const n = parseInt(p, 10); if (!isNaN(n)) trackedPids.add(n); });
          }
        }
      } catch { /* ignore */ }
    }

    // Kill orphans (chrome PIDs not tracked by any session)
    // Safety: only kill processes older than 2 minutes to avoid killing
    // browsers mid-tool-call that haven't been tracked yet
    let killed = 0;
    for (const pid of allChromePids) {
      if (!trackedPids.has(pid)) {
        try {
          // Check process age via /proc/<pid>/stat (field 22 = starttime in jiffies)
          const stat = execSync(`stat -c %Z /proc/${pid} 2>/dev/null || echo 0`, { encoding: "utf-8" }).trim();
          const startTime = parseInt(stat, 10);
          const ageSeconds = startTime > 0 ? Math.floor(Date.now() / 1000) - startTime : 0;
          if (ageSeconds > 120) { // Only kill if older than 2 minutes
            process.kill(pid, "SIGKILL");
            killed++;
          }
        } catch { /* already dead or inaccessible */ }
      }
    }

    if (killed > 0) {
      console.log(`[Cleanup] Killed ${killed} orphaned chrome processes (${allChromePids.size} total, ${trackedPids.size} tracked)`);
    }
    return killed;
  } catch {
    return 0;
  }
}

/**
 * Periodic cleanup of idle sessions, memory hogs, expired session tracking,
 * and orphaned Chrome processes.
 */
let sessionCleanupTimer: NodeJS.Timeout | null = null;
let rateLimitCleanupTimer: NodeJS.Timeout | null = null;

const makeSessionCleanupTimer = () => setInterval(async () => {
  const now = Date.now();

  // Clean up expired session tracking (older than retention period)
  for (const [sessionId, info] of expiredSessions) {
    if (now - info.expiredAt > EXPIRED_SESSION_RETENTION_MS) {
      expiredSessions.delete(sessionId);
    }
  }

  // Clean up expired browser tokens
  for (const [token, info] of browserTokens) {
    if (now - info.createdAt > TOKEN_EXPIRY_MS) {
      browserTokens.delete(token);
    }
  }

  // Check each active session for idle timeout and memory usage
  for (const [sessionId, session] of activeSessions) {
    // Check idle timeout
    if (now - session.lastActivity > SESSION_IDLE_TIMEOUT_MS) {
      const idleSeconds = Math.round((now - session.lastActivity) / 1000);
      console.log(`[Session] Cleaning up idle session ${sessionId.substring(0, 8)}... (idle for ${idleSeconds}s)`);
      await cleanupSession(sessionId, `Idle timeout (inactive for ${idleSeconds}s)`);
      continue;
    }

    // Check memory usage
    const memoryMB = await getSessionMemoryMB(session);
    if (memoryMB !== null && memoryMB > SESSION_MEMORY_LIMIT_MB) {
      console.log(`[Session] Killing session ${sessionId.substring(0, 8)}... (${memoryMB}MB > ${SESSION_MEMORY_LIMIT_MB}MB limit)`);
      await cleanupSession(sessionId, `Memory limit exceeded (${memoryMB}MB used, ${SESSION_MEMORY_LIMIT_MB}MB limit)`);
    }
  }

  // Kill orphaned Chrome processes every cycle.
  //
  // OFF BY DEFAULT since 2026-09-08. This sweep is host-wide: it runs
  // `pgrep -f chrome-headless-shell` and SIGKILLs anything older than its age
  // heuristic that is not in `trackedPids`. `trackedPids` is built from
  // `(session.browser as any).browser?.process?.()`, and Playwright declares
  // `process()` only on BrowserServer and ElectronApplication -- never on
  // Browser -- so the tracked set is ALWAYS empty and the sweep kills every
  // Chromium on the box over ~120s, including this server's own live sessions,
  // the sibling server's, and any unrelated process. Measured 2026-09-05:
  // cbrowser-enterprise killed all 7 pids of a browser owned by a third process.
  //
  // The idle-timeout and memory checks above still run every cycle; only the
  // host-wide kill is gated. Set CBROWSER_ORPHAN_REAPER=on to restore the old
  // behaviour. The real fix -- launching via launchServer() so pids are known --
  // replaces this flag.
  if (process.env.CBROWSER_ORPHAN_REAPER === "on") {
    await killOrphanedChromeProcesses();
  }
}, 30000); // Check every 30 seconds

/**
 * Legacy getBrowser for backward compatibility (uses shared instance)
 */
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
    // Opaque-token fallback via /userinfo — OFF by default since 2026-07-26.
    //
    // The JWT branch above validates `audience`. This one structurally cannot:
    // /userinfo answers 200 for ANY access token the tenant issued, for any
    // application in it, and returns no audience to check. So it authenticated
    // tokens minted for a different app in the same tenant with zero CMS
    // involvement — the one remaining route to valid:true that the account-key
    // fix did not touch.
    //
    // Defaulting it off is reasoned, not cautious-by-reflex: Auth0 issues an
    // OPAQUE token precisely when no audience was requested, which is exactly the
    // case the audience check exists to reject. And cbrowser's own OAuth flow
    // hands out `cbk_` keys as access tokens, so real customers take the
    // account-key path and are unaffected. AUTH0_ALLOW_OPAQUE_TOKENS=true
    // restores the old behaviour if some integration turns out to need it, and
    // the rejection is logged either way so it is diagnosable, not mysterious.
    if (process.env.AUTH0_ALLOW_OPAQUE_TOKENS !== "true") {
      console.error("[Auth0] Rejected an opaque access token: /userinfo exposes no audience to verify. Set AUTH0_ALLOW_OPAQUE_TOKENS=true to permit it.");
      return null;
    }

    try {
      const userinfoResponse = await fetch(`https://${auth0.domain}/userinfo`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        // Attacker-triggered outbound request on a pre-auth path: it must not be
        // able to hold the request open indefinitely.
        signal: AbortSignal.timeout(AUTH_BACKEND_TIMEOUT_MS),
      });

      if (userinfoResponse.ok) {
        const userinfo = await userinfoResponse.json();
        const payload: JWTPayload = {
          sub: userinfo.sub,
          email: userinfo.email,
          name: userinfo.name,
        };

        // 5 minutes, not 30: an opaque token carries no readable expiry, so a
        // long cache means a revoked token keeps working for that whole window.
        tokenCache.set(token, {
          payload,
          expiry: Date.now() + 5 * 60 * 1000 - TOKEN_CACHE_MARGIN,
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
// API Key → Tier Resolution (account-based gating)
// ============================================================================

/** OAuth PKCE auth codes (short-lived, 5 min TTL) */
const oauthCodes = new Map<string, { apiKey: string; redirectUri: string; codeChallenge: string; expiresAt: number }>();

/** Token → key hash map (for session tracking after OAuth) */
const tokenToKeyHash = new Map<string, { keyHash: string; expiresAt: number }>();

/**
 * Cache resolved tiers by API key hash.
 *
 * TTL was 5 minutes, which meant a customer who had just paid kept being served their
 * OLD tier for up to five minutes after the upgrade landed — the worst possible moment
 * to look broken. The lookup is a local HTTP call to the CMS on the same box, so the
 * cache is a micro-optimisation and a short window costs almost nothing.
 */
const tierCache = new Map<string, { tier: PricingTier; expiresAt: number }>();
/** Pre-auth request bodies are capped; see the read loop in handleMcpRequest. */
const MAX_REQUEST_BODY_BYTES = 4 * 1024 * 1024;

/** Bound the CMS deduct call; an unanswered one used to hang the whole request. */
const CREDIT_DEDUCT_TIMEOUT_MS = 5_000;

const TIER_CACHE_TTL_MS = 30 * 1000;

/**
 * Extract the raw API key from an incoming HTTP request.
 * Checks Authorization: Bearer and X-API-Key headers.
 */
function extractApiKey(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  const xApiKey = req.headers["x-api-key"];
  if (typeof xApiKey === "string") return xApiKey;
  return null;
}

/**
 * Resolve the billing key hash for THIS request.
 *
 * The charge used to be attributed with `getActiveKeyHash()` — a module-level global
 * assigned during transport setup and read back after several `await` boundaries. With
 * one active account that is invisible; with two concurrent requests from different
 * accounts it charges one customer for the other's call. Billing identity has to travel
 * with the request, so it is derived here from the request's own credentials.
 *
 * Returns the full SHA-256 hex digest — the form `api_keys.key_hash` stores.
 */
async function resolveRequestKeyHash(req: IncomingMessage): Promise<string | null> {
  const apiKey = extractApiKey(req);
  if (!apiKey) return null;

  if (apiKey.startsWith("cbk_")) {
    const { createHash } = await import("crypto");
    return createHash("sha256").update(apiKey).digest("hex");
  }

  // OAuth bearer tokens are not raw keys — map them back to the issuing key hash.
  const mapped = tokenToKeyHash.get(apiKey);
  if (mapped && mapped.expiresAt > Date.now()) return mapped.keyHash;

  return null;
}

/**
 * Verdict for an account key. Separates IDENTITY ("is this a real key?") from
 * PRICING ("what plan is it on?"). Those were the same question until 2026-07-26,
 * and conflating them was a complete authentication bypass — see validateAccountKey.
 */
export type KeyVerdict =
  | { valid: true; tier: PricingTier }
  | { valid: false; reason: "unknown_key" | "backend_unreachable" | "not_an_account_key" };

/**
 * Validate an account key against the CMS and report BOTH validity and tier.
 *
 * Why this exists (2026-07-26): `validateAuth` used to authenticate with
 *
 *     const tier = await resolveApiKeyTier(rawKey);
 *     if (tier) return { valid: true };
 *
 * and `resolveApiKeyTier` returns the string "free" on every failure path — CMS
 * says the key is unknown, CMS returns non-2xx, CMS is unreachable. "free" is
 * truthy, so EVERY `cbk_`-prefixed string authenticated, and the `valid: false`
 * line below that call was unreachable code. Probed live on 2026-07-26:
 * Verified live before the fix: a syntactically well-formed account key that the
 * backend did not recognise was nonetheless authenticated, while tokens without
 * the account-key prefix were correctly rejected. The prefix was the entire
 * check. (Reproduction detail withheld until the fix is published and adopted.)
 *
 * The failure branches are enumerated explicitly rather than collapsed into a
 * catch-all, because a catch-all here is precisely what failed open:
 *   - CMS answers, key unknown      -> unknown_key         (reject)
 *   - CMS answers non-2xx           -> backend_unreachable (reject, do not guess)
 *   - CMS unreachable / throws      -> backend_unreachable (reject; a CMS outage
 *                                      must stop auth, not open it)
 * Only an explicit `valid: true` from the CMS authenticates.
 */
/** How long to wait on the CMS before treating it as unreachable. */
const AUTH_BACKEND_TIMEOUT_MS = 3_000;

/**
 * How long past its TTL a previously-validated key may be served when the CMS
 * cannot be reached.
 *
 * Without this, failing closed turns a routine 40-second CMS redeploy into a
 * total auth outage for every MCP user, because a cache entry can only be
 * created by a live success. This does NOT reopen the bypass: the entry cannot
 * exist unless the CMS once answered `valid: true` for that exact key in this
 * process. It converts a hard outage into a bounded revocation delay, and an
 * explicit "invalid" answer still evicts immediately.
 */
const AUTH_STALE_GRACE_MS = 5 * 60_000;

/**
 * Test seam — drop cached tier entries.
 *
 * Exists so the revocation-eviction path can be exercised without a 30-second
 * sleep. Note the accepted consequence it makes visible: while a cache entry is
 * fresh, `validateAccountKey` returns before asking the CMS, so a revoked key
 * keeps working for up to TIER_CACHE_TTL_MS. That bounded delay is deliberate;
 * the invariant that matters is that once the CMS SAYS invalid, the entry is
 * evicted and the outage grace can never resurrect it.
 */
export function _clearTierCache(): void {
  tierCache.clear();
  accountCache.clear();
}

/**
 * The tool result for a call the CMS refused to charge (insufficient credits,
 * unregistered domain, tool not on the tier).
 *
 * isError: the tool never ran, and without the flag a client read the refusal
 * as the tool's result. Refunds nothing: this answers before any charge scope
 * exists. (2026-10-09)
 */
export function creditDeniedResult(data: { reason?: string; message?: string; remaining?: number }): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return {
    isError: true,
    content: [{
      type: "text",
      text: JSON.stringify({
        error: data.reason,
        message: data.message || "Tool execution denied",
        ...(data.reason === "domain_not_registered" ? { action: "Add this domain at cbrowser.ai/account/reports" } : {}),
        ...(data.reason === "insufficient_credits" ? { action: "Purchase credits at cbrowser.ai/pricing", remaining: data.remaining } : {}),
        ...(data.reason === "tool_not_available" ? { action: "Upgrade to Pro at cbrowser.ai/pricing" } : {}),
      }, null, 2),
    }],
  };
}

/** Serve a previously-validated key during a backend outage, or reject. */
function staleServe(keyHash: string): KeyVerdict {
  const cached = tierCache.get(keyHash);
  if (cached && cached.expiresAt + AUTH_STALE_GRACE_MS > Date.now()) {
    return { valid: true, tier: cached.tier };
  }
  return { valid: false, reason: "backend_unreachable" };
}

export async function validateAccountKey(
  apiKey: string,
  deps: { fetch?: typeof fetch; cmsUrl?: string } = {},
): Promise<KeyVerdict> {
  if (!apiKey.startsWith("cbk_")) return { valid: false, reason: "not_an_account_key" };

  const { createHash } = await import("crypto");
  const keyHash = createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
  const cached = tierCache.get(keyHash);
  if (cached && cached.expiresAt > Date.now()) return { valid: true, tier: cached.tier };

  const doFetch = deps.fetch ?? fetch;
  const cmsUrl = deps.cmsUrl ?? process.env.CMS_URL ?? "http://localhost:3200";
  let res: Response;
  try {
    // A timeout is not optional here. Without one, a CMS whose event loop is
    // blocked (a long SQLite write, a wedged worker) accepts the connection and
    // never answers, so EVERY MCP request hangs at auth instead of returning a
    // clean 401. A hang is worse than either the bypass or the rejection,
    // because clients retry and pile up. (2026-07-26, cross-vendor audit.)
    res = await doFetch(`${cmsUrl}/api/accounts/validate-key`, {
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(AUTH_BACKEND_TIMEOUT_MS),
    });
  } catch {
    return staleServe(keyHash);
  }
  // The CMS answers an unknown or revoked key with 401 (and a missing one with
  // 400) — NOT 200-with-valid:false. Verified against
  // cbrowser-web/cms/routes/accounts.ts:403. Those are explicit answers, so they
  // must evict and reject, never route to the outage grace: mapping a 401 to
  // "backend unreachable" would let a key revoked seconds ago ride the 5-minute
  // stale-serve window. Only 5xx and transport failures are genuine outages.
  // (2026-07-26, caught by probing the live CMS after the deploy rather than
  // trusting the shape the fix assumed.)
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    tierCache.delete(keyHash);
    return { valid: false, reason: "unknown_key" };
  }
  if (!res.ok) return staleServe(keyHash);

  let data: { valid?: boolean; tier?: string; accountId?: number };
  try {
    data = await res.json() as { valid?: boolean; tier?: string; accountId?: number };
  } catch {
    return staleServe(keyHash);
  }
  // An explicit "this key is not valid" is a DIFFERENT answer from "I could not
  // ask" — it must never fall through to the stale-serve grace, or a revoked key
  // would keep working for the whole grace window.
  if (data.valid !== true) {
    tierCache.delete(keyHash);
    return { valid: false, reason: "unknown_key" };
  }

  const tier = (data.tier as PricingTier) || "free";
  tierCache.set(keyHash, { tier, expiresAt: Date.now() + TIER_CACHE_TTL_MS });
  // Record the account here too. This runs FIRST on every authenticated request
  // and fills tierCache; resolveRequestAccountId then fell through to
  // resolveApiKeyTier, hit that tier cache, returned early and never learned the
  // account -- so no account key ever entered persona scope, from the day scoping
  // shipped (2026-08-01). Custom personas resolved only because a process-global
  // copy and the flat store papered over it; removing both in 19.2.1 made every
  // custom persona unresolvable by the measurement tools (B16). (2026-10-09)
  if (typeof data.accountId === "number") {
    accountCache.set(keyHash, { accountId: data.accountId, expiresAt: Date.now() + TIER_CACHE_TTL_MS });
  }
  return { valid: true, tier };
}

/**
 * Resolve the pricing tier for an API key by calling the CMS backend.
 * Returns null for non-cbk keys (server admin keys pass through as-is).
 * Caches results for 5 minutes.
 *
 * PRICING ONLY. This runs AFTER authentication has already succeeded, so its
 * "free" fallback is a safe-by-default *billing* decision. It must never be used
 * to decide whether a caller is authenticated — use validateAccountKey for that.
 */
async function resolveApiKeyTier(apiKey: string): Promise<PricingTier | null> {
  // Only resolve cbk_ keys (user account keys)
  if (!apiKey.startsWith("cbk_")) return null;

  // Check cache
  const { createHash } = await import("crypto");
  const keyHash = createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
  const cached = tierCache.get(keyHash);
  if (cached && cached.expiresAt > Date.now()) return cached.tier;

  // Call CMS to validate key and get tier
  const cmsUrl = process.env.CMS_URL || "http://localhost:3200";
  try {
    const res = await fetch(`${cmsUrl}/api/accounts/validate-key`, {
      headers: { "X-API-Key": apiKey },
    });
    if (!res.ok) return "free"; // Invalid key → free tier
    // accountId was already in this response and was being discarded. It is
    // what scopes persona reads to one tenant. (2026-08-01)
    const data = await res.json() as { valid: boolean; tier?: string; accountId?: number };
    if (!data.valid) return "free";
    const tier = (data.tier as PricingTier) || "free";
    tierCache.set(keyHash, { tier, expiresAt: Date.now() + TIER_CACHE_TTL_MS });
    if (typeof data.accountId === "number") {
      accountCache.set(keyHash, { accountId: data.accountId, expiresAt: Date.now() + TIER_CACHE_TTL_MS });
    }
    return tier;
  } catch {
    // CMS unreachable — fall back to free
    return "free";
  }
}

// ============================================================================
// Rate Limiting — per-account, tier-based
// ============================================================================

/**
 * Per-tier rate limits. MCP protocol sends ~8 requests per connection init,
 * so limits must account for protocol overhead, not just tool calls.
 */
const TIER_RATE_LIMITS: Record<string, { requests: number; burst: number }> = {
  free:       { requests: 100,  burst: 30  },  // ~12 reconnections/hour
  pro:        { requests: 1000, burst: 100 },  // ~125 reconnections/hour
  enterprise: { requests: 0,    burst: 0   },  // unlimited (0 = no limit)
};

/**
 * OAuth redirect_uri allowlist (added 2026-09-08).
 *
 * Before this, /authorize accepted ANY redirect_uri, stored it against the auth
 * code, and 303'd the browser to it after a successful CMS login -- and /token
 * returns the account's raw cbk_ key as the access token. So a link to the
 * genuine sign-in page with an attacker's redirect_uri handed that attacker the
 * victim's API key (billable credits + full tool access). Reproduced live on
 * demo/pro/enterprise.cbrowser.ai on 2026-09-05.
 *
 * Comma-separated exact matches, overridable per deployment. The journal shows
 * zero /authorize completions ever, so nothing legitimate is being narrowed --
 * if a real client is refused, add its exact callback here rather than widening
 * the check.
 */
const OAUTH_ALLOWED_REDIRECTS: string[] = (
  process.env.OAUTH_ALLOWED_REDIRECTS ||
  "https://claude.ai/api/mcp/auth_callback,https://claude.com/api/mcp/auth_callback"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Exact-match only. No prefix matching: "https://claude.ai.evil.test" must not pass. */
function isAllowedRedirect(uri: string): boolean {
  return uri !== "" && OAUTH_ALLOWED_REDIRECTS.includes(uri);
}

/** Plain 400. Never redirect to an unvalidated URI, not even to report the error. */
function rejectRedirectUri(res: import("http").ServerResponse, uri: string): void {
  console.warn(`[OAuth] refused redirect_uri: ${uri.slice(0, 120)}`);
  res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
  res.end(
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>CBrowser \u2014 Invalid request</title></head>` +
      `<body style="font-family:system-ui;background:#0a0a0a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">` +
      `<div style="max-width:34rem;padding:2rem"><h1 style="font-size:1.25rem">Invalid request</h1>` +
      `<p style="color:#888;line-height:1.5">This sign-in link carries a <code>redirect_uri</code> this server does not recognise, so it was refused before any credentials were requested. ` +
      `If you reached this from Claude, reconnect the connector from claude.ai rather than following a link someone sent you.</p></div></body></html>`,
  );
}

const RATE_LIMIT_WINDOW_MS = 3600000;       // 1 hour
const RATE_LIMIT_BURST_WINDOW_MS = 300000;  // 5 minutes

interface RateLimitEntry {
  requests: number[];
  sessionStart: number;
}

// Rate limit storage: account key hash or IP -> entry
const rateLimitStore = new Map<string, RateLimitEntry>();

function getClientIP(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string") return realIp.trim();
  return req.socket.remoteAddress || "unknown";
}

/**
 * Check rate limit for a request, keyed by account (API key hash) with tier-based limits.
 * Falls back to IP-based limiting for unauthenticated requests (free tier limits).
 */
function checkRateLimit(
  req: IncomingMessage,
  tier: PricingTier | null,
): { allowed: boolean; remaining: number; resetTime: number; limit: number } {
  if (process.env.RATE_LIMIT_ENABLED !== "true") {
    return { allowed: true, remaining: 999, resetTime: 0, limit: 999 };
  }

  const resolvedTier = tier || "free";
  const limits = TIER_RATE_LIMITS[resolvedTier] || TIER_RATE_LIMITS.free;

  // Enterprise = unlimited
  if (limits.requests === 0) {
    return { allowed: true, remaining: 999999, resetTime: 0, limit: 0 };
  }

  // Key by API key hash (account-based) or IP (unauthenticated)
  const apiKey = extractApiKey(req);
  let key: string;
  if (apiKey) {
    // Use a fast hash of the key for storage
    let hash = 0;
    for (let i = 0; i < apiKey.length; i++) {
      hash = ((hash << 5) - hash + apiKey.charCodeAt(i)) | 0;
    }
    key = `account:${hash}`;
  } else {
    key = `ip:${getClientIP(req)}`;
  }

  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const burstWindowStart = now - RATE_LIMIT_BURST_WINDOW_MS;

  let entry = rateLimitStore.get(key);
  if (!entry) {
    entry = { requests: [], sessionStart: now };
    rateLimitStore.set(key, entry);
  }

  // Prune old requests
  entry.requests = entry.requests.filter(t => t > windowStart);

  // Determine which limit applies
  const inBurstPeriod = (now - entry.sessionStart) < RATE_LIMIT_BURST_WINDOW_MS;
  const burstCount = entry.requests.filter(t => t > burstWindowStart).length;

  const currentLimit = inBurstPeriod ? limits.burst : limits.requests;
  const currentCount = inBurstPeriod ? burstCount : entry.requests.length;

  const remaining = Math.max(0, currentLimit - currentCount);
  const resetTime = entry.requests.length > 0
    ? entry.requests[0] + RATE_LIMIT_WINDOW_MS
    : now + RATE_LIMIT_WINDOW_MS;

  if (currentCount >= currentLimit) {
    return { allowed: false, remaining: 0, resetTime, limit: limits.requests };
  }

  entry.requests.push(now);
  return { allowed: true, remaining: remaining - 1, resetTime, limit: limits.requests };
}

// Cleanup old rate limit entries every 10 minutes
const makeRateLimitCleanupTimer = () => setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    entry.requests = entry.requests.filter(t => t > now - RATE_LIMIT_WINDOW_MS);
    if (entry.requests.length === 0 && (now - entry.sessionStart) > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

/**
 * Start the server's background timers.
 *
 * Both of these used to run at MODULE SCOPE, so merely IMPORTING this file
 * started them — including the session reaper, which closes browsers and
 * SIGKILLs Chrome pids every 30 seconds. A unit test importing the module for a
 * single exported function therefore got a Chrome-killing reaper running inside
 * its own process for the rest of the suite. That is how a 267s test run became
 * 438s with intermittent 180s browser timeouts: the reaper was reaping other
 * tests' browsers, and whichever browser-heavy test was unlucky absorbed it.
 * (Diagnosed 2026-07-27 by bisecting a clean 556-pass/0-fail baseline.)
 *
 * A library module must not start lifecycle timers on import. Both handles are
 * unref'd so they can never hold the event loop open on their own, and the
 * function is idempotent so repeated calls are harmless.
 */
export function startBackgroundTimers(): void {
  if (!sessionCleanupTimer) {
    sessionCleanupTimer = makeSessionCleanupTimer();
    sessionCleanupTimer.unref();
  }
  if (!rateLimitCleanupTimer) {
    rateLimitCleanupTimer = makeRateLimitCleanupTimer();
    rateLimitCleanupTimer.unref();
  }
}

async function validateAuth(
  req: IncomingMessage,
  apiKeys: Set<string> | null,
  auth0Enabled: boolean
): Promise<{ valid: boolean; reason?: string }> {
  // Try static API key first (fastest — for admin/server keys)
  if (apiKeys && validateApiKey(req, apiKeys)) {
    return { valid: true };
  }

  // Try cbk_ account key (validates against CMS)
  const rawKey = extractApiKey(req);
  if (rawKey?.startsWith("cbk_")) {
    const verdict = await validateAccountKey(rawKey);
    if (verdict.valid) return { valid: true };
    return {
      valid: false,
      reason: verdict.reason === "backend_unreachable"
        ? "Authentication backend is unavailable — try again shortly."
        : "Invalid or expired API key",
    };
  }

  // Try Auth0 / OAuth token (includes tokens from our /authorize flow)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    // Check if it's a cbk_ key returned by our OAuth flow
    if (token.startsWith("cbk_")) {
      const verdict = await validateAccountKey(token);
      if (verdict.valid) return { valid: true };
      return {
        valid: false,
        reason: verdict.reason === "backend_unreachable"
          ? "Authentication backend is unavailable — try again shortly."
          : "Invalid or expired API key",
      };
    }
    // Try Auth0 if enabled
    if (auth0Enabled) {
      const payload = await validateAuth0Token(token);
      if (payload) return { valid: true };
    }
  }

  return { valid: false, reason: "Authentication required. Get your API key at https://cbrowser.ai/account/register then enter it as the Bearer token when connecting." };
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
 *
 * @param sessionId - Optional session ID for session isolation
 */
function configureMcpTools(
  server: McpServer,
  customRegisterTools?: (server: McpServer, context: ToolRegistrationContext) => void | Promise<void>,
  sessionId?: string,
  resolvedTier?: PricingTier | null,
): void {
  // Create session-aware getBrowser function
  const sessionGetBrowser = sessionId
    ? () => getSessionBrowser(sessionId)
    : getBrowser;

  const context: ToolRegistrationContext = { getBrowser: sessionGetBrowser, getBrowserByToken };

  // Tier priority: resolved from API key > CBROWSER_TIER env > null (self-hosted, no gating)
  const tier = resolvedTier ?? (process.env.CBROWSER_TIER as PricingTier | undefined) ?? null;

  if (customRegisterTools) {
    // Set tier BEFORE custom registration so createGatedServer uses resolved tier
    setTierGate(tier);
    customRegisterTools(server, context);
  } else {
    registerAllPublicTools(server, context, tier);
  }
}

/**
 * Create a configured MCP server instance
 *
 * @param customRegisterTools - Optional custom tool registration
 * @param sessionId - Optional session ID for session isolation
 */
function createMcpServer(
  customRegisterTools?: (server: McpServer, context: ToolRegistrationContext) => void | Promise<void>,
  sessionId?: string,
  resolvedTier?: PricingTier | null,
): McpServer {
  const server = new McpServer(
    {
      name: "cbrowser",
      title: "CBrowser — Cognitive Browser Automation",
      version: VERSION,
      description: "AI-powered browser automation with cognitive user simulation. 120 MCP tools for navigation, visual testing, accessibility auditing, persona-based testing, site knowledge learning, and security scanning. Simulates how real humans think, struggle, and give up on your site.",
      websiteUrl: "https://cbrowser.ai",
      icons: [
        { src: "https://cbrowser.ai/icon-192.png", sizes: ["192x192"] },
        { src: "https://cbrowser.ai/icon-512.png", sizes: ["512x512"] },
        { src: "https://cbrowser.ai/logo.svg", sizes: ["1080x1080"] },
      ],
    },
    {
      capabilities: {
        tools: { listChanged: true },
        prompts: {},
        resources: {},
      },
      instructions: `CBrowser — cognitive browser automation with 120 tools across 16 categories.

CORE TOOLS (use these first):
• navigate, click, fill, scroll, screenshot, extract — browser control
• agent_ready_audit — AI-friendliness score (A-F grade)
• empathy_audit — disability barrier detection
• cognitive_effort — 8-layer cognitive transport cost per persona
• site_cognitive_assessment — 3-gate pipeline (bot detection → qualification → persona analysis)
• page_understand — page type, affordances, structure
• cognitive_journey_init/update_state — persona journey simulation
• security_audit — MCP tool injection scanning

SPECIALIST CATEGORIES (use when the task requires them):
• visual_testing (9 tools) — visual_baseline, visual_regression, cross_browser_test, responsive_test, ab_comparison, transport_map, attention_analysis...
• cognitive_transport (7 tools) — cognitive_distance, cognitive_coverage, cognitive_interpolate, cognitive_load_estimate, compare_personas...
• testing (5 tools) — nl_test_inline, nl_test_file, detect_flaky_tests, coverage_map, repair_test
• site_knowledge (5 tools) — site_model_status, site_model_query, site_profile_list/delete/status
• bug_hunting (3 tools) — hunt_bugs, chaos_test, competitive_benchmark
• performance (3 tools) — perf_baseline, perf_regression, list_baselines
• sessions (4 tools) — save_session, load_session, list_sessions, delete_session
• marketing (4 tools) — marketing_campaign_create/run/report, marketing_personas_list
• persona_creation (6 tools) — persona_create_start, questionnaire, from_description
• enterprise_security (8 tools) — web_security_scan, stealth_enable/disable/check, cloudflare_detect/wait
• enterprise_marketing (6 tools) — marketing_influence_matrix, lever_analysis, funnel_analyze, audience_discover

TIPS:
• Pass _browserToken between tool calls to maintain browser state
• Use site_cognitive_assessment for comprehensive site analysis (runs all gates automatically)
• For disability testing, pass one persona at a time to empathy_audit to avoid timeouts

SITE KNOWLEDGE WORKFLOW (IMPORTANT):
• High-familiarity personas (power-user, confident-user) REQUIRE site knowledge to produce accurate results
• Before using these personas, run site_model_status to check if knowledge exists
• If site knowledge EXISTS: ask the user "Site knowledge exists. Use it for experienced-user simulation, or test as first-time visitor?"
• If NO site knowledge: warn the user and offer to build it (run page_understand or navigate the site first)
• Without site knowledge, power-user/confident-user are automatically downgraded to first-time visitors
• navigate, click, and page_understand all build site knowledge automatically

SELF-HELP:
• If you are unsure what a tool does, what a score means, which persona to use, or how tools work together — call question_answer with your question
• question_answer searches 290+ pages of CBrowser documentation and returns a grounded answer
• Use it before guessing. Example: question_answer(question: "What is the difference between viewport and full_page scope?")
• Use it to explain results to the user. Example: question_answer(question: "What does a CTC of 1.6 with readability bottleneck mean?")`,
    }
  );

  // Register prompts for common workflows
  server.prompt(
    "audit-site",
    "Run a comprehensive site audit with empathy, agent-readiness, and visual baseline",
    async () => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: "Please run a comprehensive audit on this site:\n1. Run agent_ready_audit to check AI-friendliness\n2. Run empathy_audit with persona \"cognitive-adhd\" to test accessibility\n3. Run page_understand to analyze the page structure\n4. Summarize the findings with recommendations",
        },
      }],
    })
  );

  server.prompt(
    "cognitive-journey",
    "Simulate a user journey with a specific persona and goal",
    async () => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: "Start a cognitive journey simulation. Ask me for:\n1. The URL to test\n2. Which persona to use (first-timer, elderly-user, power-user, etc.)\n3. The goal to accomplish\n\nThen use cognitive_journey_init and simulate step by step.",
        },
      }],
    })
  );

  server.prompt(
    "security-scan",
    "Run a security scan on an authorized domain",
    async () => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: "Run a security scan. Ask me for the URL to scan, then use web_security_scan with confirm_authorized=true. Also run security_audit to check MCP tool definitions. Summarize all findings.",
        },
      }],
    })
  );

  registerUiResources(server);

  // Register resources
  server.resource(
    "docs://tools-overview",
    "docs://tools-overview",
    { description: "Overview of all 105 CBrowser MCP tools organized by category", mimeType: "text/plain" },
    async () => ({
      contents: [{
        uri: "docs://tools-overview",
        text: "CBrowser provides 120 MCP tools across 11 categories: Browser Automation, Visual Testing, Cognitive Journeys, Site Knowledge, Accessibility, Persona System, Testing, Performance, Security, Session Management, and Marketing. Visit https://cbrowser.ai/docs/Tools-Overview for the complete reference.",
        mimeType: "text/plain",
      }],
    })
  );

  server.resource(
    "docs://personas",
    "docs://personas",
    { description: "List of 21 built-in personas with cognitive traits", mimeType: "text/plain" },
    async () => ({
      contents: [{
        uri: "docs://personas",
        text: "CBrowser includes 21 personas: Cognitive (6): power-user, first-timer, mobile-user, elderly-user, impatient-user, screen-reader-user. Accessibility (11): motor-impairment-tremor, low-vision-magnified, cognitive-adhd, dyslexic-user, deaf-user, elderly-low-vision, color-blind-deuteranopia, autism-spectrum, intellectual-disability, aphasia-receptive, dyscalculia. Emotional (4): anxious-user, confident-user, emotional-user, stoic-user. Each persona has 26 cognitive traits. Visit https://cbrowser.ai/docs/Persona-Index for details.",
        mimeType: "text/plain",
      }],
    })
  );

  configureMcpTools(server, customRegisterTools, sessionId, resolvedTier);
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
    // Cap the body. This read happens BEFORE authentication, so an unauthenticated
    // POST to /mcp with a multi-gigabyte body was buffered into memory in full
    // before anything looked at its size — and after the auth fix it is the path
    // every REJECTED key walks down, which makes it the cheapest way to hurt the
    // box. 4MB is far above any real JSON-RPC payload. (2026-07-26)
    const chunks: Buffer[] = [];
    let received = 0;
    let tooLarge = false;
    for await (const chunk of req) {
      received += (chunk as Buffer).length;
      if (received > MAX_REQUEST_BODY_BYTES) { tooLarge = true; break; }
      chunks.push(chunk);
    }
    if (tooLarge) {
      req.destroy();
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Payload Too Large", message: `Request body exceeds ${MAX_REQUEST_BODY_BYTES} bytes.` }));
      return;
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
    // Set inside the tools/call branch below, read at dispatch time (after that
    // branch's own block scope has closed) to decide whether this request's
    // tool call runs inside withChargeScope. Declared out here, not inside,
    // because `keyHash`/`toolName` are block-scoped to the tools/call branch
    // and the dispatch call is after it closes. (P-09, 2026-09-17)
    let chargedKeyHash: string | null = null;
    let chargedTool: string | null = null;
    if (method === "tools/call" && params?.name) {
      logLine += ` [${params.name}]`;

      // Deduct credits and enforce domain scoping (blocking for denials)
      const toolName = params.name as string;
      const toolArgs = params.arguments as Record<string, unknown> | undefined;
      const requestedUrl = (toolArgs?.url || (Array.isArray(toolArgs?.sites) ? (toolArgs.sites as string[])[0] : "") || "") as string;
      // GATE ON WHERE THE URL GOES, NOT WHERE IT WAS TYPED.
      //
      // ucdenver.edu is a registered domain and 301s to cudenver.edu, which is
      // not, so every call in a five-hour session was accepted against the
      // registered host and then analysed the unregistered one. Any
      // unregistered domain reachable by redirect from a registered one was
      // analysable at no charge.
      //
      // Resolution failure falls back to the requested URL. That is the
      // pre-fix behaviour and it is the right direction to fail: denying
      // whenever a HEAD is blocked would break every site that rejects HEAD.
      let targetUrl = requestedUrl;
      let resolvedNote = "";
      if (requestedUrl) {
        try {
          const { resolveFinalUrl } = await import("./url-resolution.js");
          const r = await resolveFinalUrl(requestedUrl);
          if (r.hostChanged && !r.error) {
            targetUrl = r.finalUrl;
            resolvedNote = ` [redirects ${r.requestedHost} -> ${r.finalHost}, gating on ${r.finalHost}]`;
            console.log(`[Domain] ${toolName}: ${requestedUrl} resolves to ${r.finalUrl} after ${r.hops} hop(s); gating on ${r.finalHost}`);
          } else if (r.error) {
            console.log(`[Domain] ${toolName}: could not resolve ${requestedUrl} (${r.error}); gating on the requested host`);
          }
        } catch (e) {
          console.log(`[Domain] ${toolName}: resolver unavailable (${String(e)}); gating on the requested host`);
        }
      }
      if (resolvedNote) logLine += resolvedNote;
      // Derived from THIS request, not from the module global — see resolveRequestKeyHash.
      const keyHash = await resolveRequestKeyHash(req);
      // chargedKeyHash/chargedTool (outer scope) get set ONLY when a real deduct
      // succeeded below (creditRes.ok AND an explicit allowed:true) — never on
      // the fail-open paths (CMS unreachable, a non-2xx status, a response
      // missing `allowed`). Those ran the tool UNBILLED, and entering a charge
      // scope for them would let a later isError refund credits the caller
      // never paid. (P-09, 2026-09-17)

      // GATE BEFORE CHARGE. The CMS credit catalog and the package's tier catalog
      // are two independent lists, and they disagree: CMS lists
      // agent_ready_audit as a free-tier tool costing 5 credits, while the
      // package gates it as "pro". A free account with credits was therefore
      // debited 5 and then handed the upgrade prompt that createGatedServer had
      // substituted for the handler — paying for an advertisement. Checking
      // accessibility BEFORE the deduct fixes every present and future
      // disagreement between the two lists, not just the one instance we found.
      // (2026-07-26)
      if (keyHash && !isToolAccessible(toolName)) {
        console.log(`[Credits] ${toolName}: unavailable at this tier — upgrade prompt returned WITHOUT charging`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          id: parsedBody?.id ?? null,
          result: upgradePrompt(toolName),
        }));
        return;
      }

      if (keyHash) {
        const cmsUrl = process.env.CMS_URL || "http://localhost:3200";
        const deductParams = new URLSearchParams({
          key_hash: keyHash,
          tool: toolName,
          ...(targetUrl ? { target_url: targetUrl } : {}),
        });
        try {
          const creditRes = await fetch(`${cmsUrl}/api/credits/deduct?${deductParams}`, {
            method: "POST",
            // The CMS deduct endpoint is internal-only and 403s without this header.
            // Omitting it made the CMS return 403 → parsed as {allowed: undefined} →
            // every tool call denied ("Tool execution denied", reason undefined).
            headers: { "X-Internal-Secret": process.env.CMS_INTERNAL_SECRET || "" },
            // Without this, a CMS that accepts the connection and never answers
            // hangs the MCP request forever, before the handler is ever reached.
            signal: AbortSignal.timeout(CREDIT_DEDUCT_TIMEOUT_MS),
          });
          // Every status must land in a branch. Previously anything outside
          // {ok, 402, 403} — a 500, or an nginx 502 during a CMS restart — fell
          // straight through to execution with NO LOG LINE AT ALL, because the
          // deliberate loud fail-open message below only fires on a THROWN fetch.
          // That is the most likely outage shape, and it was the one shape that
          // stayed invisible, which defeats the point of the loud message.
          if (!(creditRes.ok || creditRes.status === 402 || creditRes.status === 403)) {
            console.warn(`[Credits] FAIL-OPEN: ${toolName} ran unbilled — CMS returned HTTP ${creditRes.status}`);
          } else if (creditRes.ok || creditRes.status === 402 || creditRes.status === 403) {
            const data = await creditRes.json() as { allowed: boolean; reason?: string; message?: string; remaining?: number };
            // Only deny on an EXPLICIT allowed:false from the deduct endpoint.
            // A missing `allowed` field means the response was not a real deduct
            // result (e.g. an internal-auth 403) — fail open rather than blanket-deny.
            if (data.allowed === false) {
              console.log(`[Credits] ${toolName}: DENIED (${data.reason})`);
              // Block tool execution — return the refusal as a tool error
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({
                jsonrpc: "2.0",
                id: parsedBody?.id ?? null,
                result: creditDeniedResult(data),
              }));
              return;
            }
            // Reached only on a genuine deduct success. The 402/403 statuses
            // above either returned already (allowed:false) or are fail-open
            // (a response with no `allowed` field at all, e.g. an internal-auth
            // failure) — neither charged the account, so neither sets this.
            if (creditRes.ok && data.allowed === true) {
              chargedKeyHash = keyHash;
              chargedTool = toolName;
            }
          }
        } catch (err) {
          // CMS unreachable — allow tool execution (fail open). Deliberate: a CMS blip
          // must not take the product down. But it IS an ungated, unbilled call, and it
          // used to pass in complete silence, so an outage was indistinguishable from
          // normal operation in every log and in the ledger. Make it loud.
          console.warn(`[Credits] FAIL-OPEN: ${toolName} ran unbilled — CMS unreachable (${String(err)})`);
        }
      }
    }
    if (method === "notifications/initialized") {
      logLine = `← session initialized`;
    }

    // Add connection close handler to detect early disconnects
    let connectionClosed = false;

    req.on("close", () => {
      if (!res.writableEnded) {
        connectionClosed = true;
        console.warn(`[Connection Closed] Client disconnected before response completed: ${logLine}`);
      }
    });

    // Debug: log session ID from client
    const clientSessionId = req.headers["mcp-session-id"] as string | undefined;
    if (method !== "initialize" && method !== "notifications/initialized") {
      console.log(`[Session Debug] ${method}: client sent session=${clientSessionId?.substring(0, 8) || "NONE"}, mode=${process.env.MCP_SESSION_MODE || "stateless"}`);
    }

    // Persona reads inside this request see ONLY the calling account's
    // directory. The scope wraps the dispatch rather than being assigned to a
    // module variable, so two overlapping requests cannot observe each other's
    // — the whole reason this uses AsyncLocalStorage. Unauthenticated requests
    // enter no scope and fall back to the process default, which is the
    // behaviour every local install already has. (2026-08-01)
    const scopeAccountId = await resolveRequestAccountId(req);
    const dispatch = () =>
      scopeAccountId !== null
        ? withPersonaScope(scopeAccountId, () => transport.handleRequest(req, res, parsedBody))
        : transport.handleRequest(req, res, parsedBody);

    // Charge scope: entered ONLY when this request's tool call was actually
    // billed (chargedKeyHash/chargedTool set above, on a real deduct success).
    // The tier-gate wrapper (createGatedServer) reads currentCharge() after the
    // handler returns and refunds when the result carries isError: true. An
    // unbilled call (no key, or the fail-open path) enters no scope, so nothing
    // downstream can refund money that was never taken. (P-09, 2026-09-17)
    if (chargedKeyHash !== null && chargedTool !== null) {
      await withChargeScope(chargedKeyHash, chargedTool, dispatch);
    } else {
      await dispatch();
    }

    const duration = Date.now() - start;
    if (!connectionClosed) {
      console.log(`${logLine} → ${res.statusCode} (${duration}ms)`);
    }
  } else {
    // GET requests (SSE streams)
    let connectionClosed = false;

    req.on("close", () => {
      if (!res.writableEnded) {
        connectionClosed = true;
      }
    });

    // Start SSE keepalive pings BEFORE handling the request
    // Claude.ai drops SSE connections that go idle — send `: ping` comments
    // every 15 seconds to keep the connection alive through proxies
    const keepaliveInterval = setInterval(() => {
      if (!connectionClosed && !res.writableEnded) {
        try {
          res.write(": ping\n\n");
        } catch {
          // Connection already dead
          clearInterval(keepaliveInterval);
        }
      } else {
        clearInterval(keepaliveInterval);
      }
    }, 15000);

    // Clean up keepalive on connection close
    req.on("close", () => {
      clearInterval(keepaliveInterval);
    });

    await transport.handleRequest(req, res);

    clearInterval(keepaliveInterval);
    const duration = Date.now() - start;
    if (!connectionClosed) {
      console.log(`← ${req.method} → ${res.statusCode} (${duration}ms)`);
    }
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

  // Session reaper + rate-limit sweeper. Started HERE rather than at module
  // import, so loading this file no longer spins up a Chrome-killing reaper in
  // whatever process happened to import it. See startBackgroundTimers.
  startBackgroundTimers();

  // Enable remote mode for screenshot handling (returns base64 images instead of paths)
  setRemoteMode(true);

  const port = parseInt(process.env.PORT || "3000", 10);
  const host = process.env.HOST || "0.0.0.0";
  const sessionMode = process.env.MCP_SESSION_MODE || "stateless";
  const apiKeys = getApiKeys();
  const auth0 = getAuth0Config();
  const apiKeyAuthEnabled = apiKeys !== null && apiKeys.size > 0;
  const auth0Enabled = auth0 !== null;
  // REQUIRE_AUTH=true forces auth even without static API keys (uses cbk_ keys + OAuth)
  const requireAuth = process.env.REQUIRE_AUTH === "true";
  const authEnabled = apiKeyAuthEnabled || auth0Enabled || requireAuth;
  // In requireAuth mode the server accepts dynamic cbk_ API keys even with no static
  // keys loaded, so API-key auth is genuinely active — advertise it as such in /health.
  const apiKeyAuthAdvertised = apiKeyAuthEnabled || requireAuth;
  console.log(`Starting CBrowser Remote MCP Server v${VERSION}...`);
  console.log(`Mode: ${sessionMode}`);
  console.log(`Auth: ${authEnabled ? "enabled" : "disabled (open access)"}`);
  if (apiKeyAuthEnabled) {
    console.log(`  - API Key auth: enabled (${apiKeys?.size} keys)`);
  }
  if (auth0Enabled) {
    console.log(`  - Auth0 OAuth: enabled (${auth0?.domain})`);
  }
  console.log(`Session Isolation: enabled`);
  console.log(`  - Max concurrent sessions: ${MAX_CONCURRENT_SESSIONS}`);
  console.log(`  - Idle timeout: ${SESSION_IDLE_TIMEOUT_MS / 1000}s`);
  console.log(`  - Memory limit per session: ${SESSION_MEMORY_LIMIT_MB}MB`);
  if (process.env.RATE_LIMIT_ENABLED === "true") {
    console.log(`Rate Limiting: per-account, tier-based`);
    console.log(`  - Free:       ${TIER_RATE_LIMITS.free.requests} req/hr (burst: ${TIER_RATE_LIMITS.free.burst})`);
    console.log(`  - Pro:        ${TIER_RATE_LIMITS.pro.requests} req/hr (burst: ${TIER_RATE_LIMITS.pro.burst})`);
    console.log(`  - Enterprise: unlimited`);
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
    // OAuth 2.1 PKCE Flow (for claude.ai custom MCP connectors)
    // =====================================================================

    // In-memory auth code store (short-lived, 5 min TTL)

    // GET /authorize — login form for OAuth PKCE (Claude.ai opens this in a popup)
    if ((url.pathname === "/authorize" || url.pathname === "/login") && req.method === "GET") {
      const clientId = url.searchParams.get("client_id") || "";
      const redirectUri = url.searchParams.get("redirect_uri") || "";
      const state = url.searchParams.get("state") || "";
      const codeChallenge = url.searchParams.get("code_challenge") || "";
      const codeChallengeMethod = url.searchParams.get("code_challenge_method") || "";
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientId);
      const prefillEmail = isEmail ? clientId : "";

      // Refuse an unrecognised callback BEFORE showing a password field, so a
      // phishing link never reaches the point of collecting credentials.
      if (!isAllowedRedirect(redirectUri)) {
        rejectRedirectUri(res, redirectUri);
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CBrowser — Sign In</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #0a0a0a; color: #e5e5e5; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
  .card { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 32px; width: 100%; max-width: 400px; }
  h1 { font-size: 24px; margin: 0 0 8px; background: linear-gradient(to right, #3b82f6, #06b6d4); -webkit-background-clip: text; background-clip: text; color: transparent; }
  p { color: #888; font-size: 14px; margin: 0 0 24px; }
  label { display: block; font-size: 13px; color: #aaa; margin-bottom: 6px; }
  input { width: 100%; padding: 10px 12px; background: #0a0a0a; border: 1px solid #333; border-radius: 8px; color: #e5e5e5; font-size: 14px; margin-bottom: 16px; box-sizing: border-box; }
  input:focus { outline: none; border-color: #3b82f6; }
  button { width: 100%; padding: 12px; background: linear-gradient(135deg, #3b82f6, #06b6d4); color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; }
  button:hover { opacity: 0.9; }
  .error { background: #3b1111; border: 1px solid #7f1d1d; color: #fca5a5; padding: 10px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; display: none; }
  .register { text-align: center; margin-top: 16px; font-size: 13px; color: #666; }
  .register a { color: #3b82f6; text-decoration: none; }
</style></head><body>
<div class="card">
  <h1>CBrowser</h1>
  <p>Sign in to connect your account to Claude</p>
  <div class="error" id="error"></div>
  <form id="form" method="POST" action="/authorize">
    <input type="hidden" name="redirect_uri" value="${redirectUri.replace(/"/g, '&quot;')}">
    <input type="hidden" name="state" value="${state.replace(/"/g, '&quot;')}">
    <input type="hidden" name="code_challenge" value="${codeChallenge.replace(/"/g, '&quot;')}">
    <input type="hidden" name="code_challenge_method" value="${codeChallengeMethod.replace(/"/g, '&quot;')}">
    <input type="hidden" name="client_id" value="${clientId.replace(/"/g, '&quot;')}">
    <label for="email">Email</label>
    <input type="email" id="email" name="email" required ${prefillEmail ? '' : 'autofocus'} placeholder="you@example.com" value="${prefillEmail.replace(/"/g, '&quot;')}">
    <label for="password">Password or API Key</label>
    <input type="password" id="password" name="password" required ${prefillEmail ? 'autofocus' : ''} placeholder="Password or cbk_... API key">
    <button type="submit">Sign In &amp; Authorize</button>
  </form>
  <div class="register">No account? <a href="https://cbrowser.ai/account/register" target="_blank">Create one free</a></div>
</div>
<script>
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('error')) {
  const err = document.getElementById('error');
  err.textContent = decodeURIComponent(urlParams.get('error'));
  err.style.display = 'block';
}
</script>
</body></html>`);
      return;
    }

    // POST /authorize — validate credentials, issue code, redirect
    if (url.pathname === "/authorize" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const params = new URLSearchParams(body);
      const email = params.get("email") || "";
      const password = params.get("password") || "";
      const redirectUri = params.get("redirect_uri") || "";
      const state = params.get("state") || "";
      const codeChallenge = params.get("code_challenge") || "";

      // Build authorize URL for error redirects
      const errorRedirect = (msg: string) => {
        const authUrl = new URL("/authorize", `https://${req.headers.host}`);
        authUrl.searchParams.set("error", msg);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("state", state);
        authUrl.searchParams.set("code_challenge", codeChallenge);
        authUrl.searchParams.set("code_challenge_method", params.get("code_challenge_method") || "S256");
        authUrl.searchParams.set("client_id", params.get("client_id") || "");
        res.writeHead(303, { Location: authUrl.toString() });
        res.end();
      };

      // Re-validate on POST: the form field is attacker-controllable independently
      // of the GET that rendered it.
      if (!isAllowedRedirect(redirectUri)) {
        rejectRedirectUri(res, redirectUri);
        return;
      }

      if (!email || !password) {
        errorRedirect("Email and password required");
        return;
      }

      // Validate against CMS
      const cmsUrl = process.env.CMS_URL || "http://localhost:3200";
      try {
        let apiKey: string;

        if (password.startsWith("cbk_")) {
          // Password is a cbk_ API key — validate it directly
          const validateRes = await fetch(`${cmsUrl}/api/accounts/validate-key`, {
            headers: { "X-API-Key": password },
          });
          if (!validateRes.ok) {
            errorRedirect("Invalid API key");
            return;
          }
          apiKey = password;
        } else {
          // Password is a regular password — login via CMS
          const loginRes = await fetch(`${cmsUrl}/api/accounts/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });

          if (!loginRes.ok) {
            errorRedirect("Invalid email or password");
            return;
          }

          const loginData = await loginRes.json() as { token: string; account: { id: number; tier: string } };

          // Generate or get API key for this account
          const keyRes = await fetch(`${cmsUrl}/api/accounts/keys?name=Claude+MCP`, {
            method: "POST",
            headers: { Authorization: `Bearer ${loginData.token}` },
          });
          const keyData = await keyRes.json() as { key?: string; error?: string };
          apiKey = keyData.key || "";

          if (!apiKey) {
            errorRedirect("Max API keys reached. Delete an unused key at cbrowser.ai/account");
            return;
          }
        }

        // Generate auth code
        const code = randomUUID();
        oauthCodes.set(code, {
          apiKey,
          redirectUri,
          codeChallenge,
          expiresAt: Date.now() + 5 * 60 * 1000,
        });

        // Redirect back to Claude with auth code
        const callbackUrl = new URL(redirectUri);
        callbackUrl.searchParams.set("code", code);
        callbackUrl.searchParams.set("state", state);

        res.writeHead(303, { Location: callbackUrl.toString() });
        res.end();
      } catch {
        errorRedirect("Authentication service unavailable");
      }
      return;
    }

    // POST /token — exchange auth code for API key (bearer token)
    if (url.pathname === "/token" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;

      let params: URLSearchParams;
      if (body.startsWith("{")) {
        const json = JSON.parse(body);
        params = new URLSearchParams(json);
      } else {
        params = new URLSearchParams(body);
      }

      const grantType = params.get("grant_type");

      let accessToken: string | null = null;

      if (grantType === "authorization_code") {
        // Standard OAuth PKCE flow
        const code = params.get("code") || "";
        const codeVerifier = params.get("code_verifier") || "";

        const stored = oauthCodes.get(code);
        if (!stored || stored.expiresAt < Date.now()) {
          oauthCodes.delete(code);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_grant", error_description: "Code expired or invalid" }));
          return;
        }

        // Verify PKCE. REQUIRED since 2026-09-08: this was
        // `if (stored.codeChallenge && codeVerifier)`, so an empty challenge or
        // an empty verifier skipped verification entirely and the branch was
        // decorative for any caller that simply omitted them.
        if (!stored.codeChallenge || !codeVerifier) {
          oauthCodes.delete(code);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_grant", error_description: "PKCE required" }));
          return;
        }
        {
          const { createHash } = await import("crypto");
          const computed = createHash("sha256").update(codeVerifier).digest("base64url");
          if (computed !== stored.codeChallenge) {
            oauthCodes.delete(code);
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "invalid_grant", error_description: "PKCE verification failed" }));
            return;
          }
        }

        accessToken = stored.apiKey;
        oauthCodes.delete(code);

      } else if (grantType === "client_credentials") {
        // Direct auth: client_id = email, client_secret = password or cbk_ key
        const clientId = params.get("client_id") || "";
        const clientSecret = params.get("client_secret") || "";

        if (!clientId || !clientSecret) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_request", error_description: "client_id and client_secret required" }));
          return;
        }

        const cmsUrl = process.env.CMS_URL || "http://localhost:3200";

        if (clientSecret.startsWith("cbk_")) {
          // client_secret is an API key — validate directly
          const valRes = await fetch(`${cmsUrl}/api/accounts/validate-key`, {
            headers: { "X-API-Key": clientSecret },
          });
          if (!valRes.ok) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "invalid_client", error_description: "Invalid API key" }));
            return;
          }
          accessToken = clientSecret;
        } else {
          // client_secret is a password — login via CMS
          const loginRes = await fetch(`${cmsUrl}/api/accounts/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: clientId, password: clientSecret }),
          });
          if (!loginRes.ok) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "invalid_client", error_description: "Invalid email or password" }));
            return;
          }
          const loginData = await loginRes.json() as { token: string };
          // Generate API key for this session
          const keyRes = await fetch(`${cmsUrl}/api/accounts/keys?name=Claude+Session`, {
            method: "POST",
            headers: { Authorization: `Bearer ${loginData.token}` },
          });
          const keyData = await keyRes.json() as { key?: string };
          accessToken = keyData.key || null;
          if (!accessToken) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "server_error", error_description: "Max API keys reached. Delete unused keys at cbrowser.ai/account" }));
            return;
          }
        }
      } else {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "unsupported_grant_type", error_description: "Use authorization_code or client_credentials" }));
        return;
      }

      if (!accessToken) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "server_error" }));
        return;
      }

      // Store token→keyHash mapping for session tracking
      // This ensures MCP tool calls get logged even when Claude.ai proxies the token
      const { createHash: hashFn } = await import("crypto");
      const tokenKeyHash = hashFn("sha256").update(accessToken).digest("hex");
      tokenToKeyHash.set(accessToken, { keyHash: tokenKeyHash, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 2592000,
      }));
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
          api_key: apiKeyAuthAdvertised,
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
          api_key: apiKeyAuthAdvertised,
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

    // llms.txt - AI-readable documentation (WebMCP standard)
    if (url.pathname === "/llms.txt" || url.pathname === "/.well-known/llms.txt") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`# CBrowser MCP Server
# AI-powered browser automation with cognitive user simulation

> CBrowser is an MCP server that provides 91 tools for browser automation,
> visual testing, cognitive user simulation, and accessibility auditing.
> It simulates how real humans think, struggle, and give up on websites.

## MCP Endpoint
POST /mcp - Model Context Protocol endpoint (JSON-RPC 2.0 over SSE)

## Key Capabilities
- navigate: Open URLs and take screenshots
- click, fill: Interact with page elements using natural language
- screenshot: Capture current page state
- cognitive_journey_init: Simulate real users with patience/frustration tracking
- empathy_audit: Test with disability personas (motor tremor, low vision, ADHD)
- agent_ready_audit: Grade site AI-friendliness (A+ to F)
- hunt_bugs: Autonomous bug discovery
- visual_baseline, visual_regression: AI-powered visual testing
- compare_personas: Test with multiple user types simultaneously

## Authentication
- OAuth 2.1 with PKCE for claude.ai integration
- API Key authentication for programmatic access
- Demo server (demo.cbrowser.ai): Rate-limited, no auth required

## Tool Categories (91 tools)
- Navigation (1): navigate
- Interaction (5): click, smart_click, fill, scroll, press_key
- Analysis (4): analyze_page, extract, find_element_by_intent, assert
- Visual Testing (6): visual_baseline, visual_regression, cross_browser_test, responsive_test, ab_comparison
- Cognitive (3): cognitive_journey_init, cognitive_journey_update_state, list_cognitive_personas
- Personas (10): compare_personas_init, persona_create, persona_traits_list, etc.
- Testing (5): nl_test_file, nl_test_inline, repair_test, detect_flaky_tests, coverage_map
- Audit (4): agent_ready_audit, competitive_benchmark, empathy_audit, webmcp_ready_audit
- Session (4): save_session, load_session, list_sessions, delete_session
- Browser (4): browser_health, browser_recover, reset_browser, status

## Links
- Documentation: https://cbrowser.ai/docs
- GitHub: https://github.com/alexandriashai/cbrowser
- npm: https://npmjs.com/package/cbrowser

## Version
${VERSION}
`);
      return;
    }

    // Documentation endpoint
    if (url.pathname === "/docs" || url.pathname === "/README") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CBrowser MCP Server Documentation</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; background: #0a0a0a; color: #e5e5e5; }
    h1 { color: #fff; }
    h2 { color: #3b82f6; border-bottom: 1px solid #333; padding-bottom: 8px; }
    code { background: #1e1e1e; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
    pre { background: #1e1e1e; padding: 16px; border-radius: 8px; overflow-x: auto; }
    a { color: #60a5fa; }
    .badge { display: inline-block; background: #3b82f6; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-right: 8px; }
  </style>
</head>
<body>
  <h1>CBrowser MCP Server <span class="badge">v${VERSION}</span></h1>
  <p>AI-powered browser automation with cognitive user simulation.</p>

  <h2>Quick Start</h2>
  <p>Connect to this MCP server from Claude Desktop or claude.ai:</p>
  <pre><code># Claude Desktop config
{
  "mcpServers": {
    "cbrowser": {
      "command": "npx",
      "args": ["cbrowser", "mcp-server"]
    }
  }
}</code></pre>

  <h2>Available Tools (91)</h2>
  <p>This server provides 91 MCP tools for browser automation, testing, and analysis.</p>
  <ul>
    <li><strong>Navigation:</strong> navigate, screenshot</li>
    <li><strong>Interaction:</strong> click, smart_click, fill, scroll, press_key</li>
    <li><strong>Cognitive:</strong> cognitive_journey_init, compare_personas, empathy_audit</li>
    <li><strong>Visual Testing:</strong> visual_baseline, visual_regression, cross_browser_test</li>
    <li><strong>Analysis:</strong> hunt_bugs, agent_ready_audit, chaos_test</li>
  </ul>

  <h2>Links</h2>
  <ul>
    <li><a href="https://cbrowser.ai/docs">Full Documentation</a></li>
    <li><a href="https://github.com/alexandriashai/cbrowser">GitHub Repository</a></li>
    <li><a href="https://npmjs.com/package/cbrowser">npm Package</a></li>
    <li><a href="/llms.txt">llms.txt (AI-readable docs)</a></li>
    <li><a href="/info">Server Info (JSON)</a></li>
    <li><a href="/health">Health Check</a></li>
  </ul>

  <h2>Authentication</h2>
  <p>Demo server: No authentication required (rate-limited)</p>
  <p>Self-hosted: Supports OAuth 2.1 and API Key authentication</p>
</body>
</html>`);
      return;
    }

    // Protected Resource Metadata (RFC 9728) - required for OAuth
    // OAuth Authorization Server Metadata (RFC 8414)
    // Return 404 when no Auth0 — prevents Claude.ai from initiating OAuth flow
    // Users authenticate via Bearer token (cbk_ API key) instead
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      const serverHost = req.headers.host || `${host}:${port}`;
      const protocol = req.headers["x-forwarded-proto"] || "http";
      const baseUrl = `${protocol}://${serverHost}`;

      if (auth0Enabled) {
        // This branch was EMPTY. No response written, no return -- just a comment
        // claiming "existing behavior" -- so an Auth0-configured server fell through
        // to the protected-endpoint auth gate below and answered its own OAuth
        // discovery document with 401. A client cannot authenticate when the metadata
        // telling it HOW to authenticate is itself behind authentication.
        //
        // That is the whole of the "enterprise connector exposes zero tools" report.
        // The enterprise deployment sets AUTH0_DOMAIN, so it took this branch and
        // 401'd; the pro deployment does not, took the else branch, and worked. A
        // client that cannot complete discovery keeps the connector unauthenticated
        // and renders only its own placeholder tools, which reads to a user as "this
        // server has no tools". The server was serving 130 the whole time.
        //
        // Auth0 publishes its own RFC 8414 document, so derive from the tenant rather
        // than restating endpoints that would then have two places to drift.
        const tenant = process.env.AUTH0_DOMAIN;
        if (tenant) {
          const issuer = `https://${tenant}/`;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            issuer,
            authorization_endpoint: `${issuer}authorize`,
            token_endpoint: `${issuer}oauth/token`,
            registration_endpoint: `${issuer}oidc/register`,
            jwks_uri: `${issuer}.well-known/jwks.json`,
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code", "refresh_token", "client_credentials"],
            code_challenge_methods_supported: ["S256"],
            token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
            scopes_supported: ["openid", "profile", "email"],
          }));
          return;
        }
        // auth0Enabled with no domain is a misconfiguration, not a request to fall
        // through into the auth gate. Say so, rather than emitting a 401 that blames
        // the caller for the server's own config.
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "server_error", error_description: "OAuth is enabled but AUTH0_DOMAIN is unset." }));
        return;
      } else {
        // Self-hosted OAuth PKCE (built-in /authorize + /token)
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          issuer: baseUrl,
          authorization_endpoint: `${baseUrl}/authorize`,
          token_endpoint: `${baseUrl}/token`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "client_credentials"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none"],
          scopes_supported: [],
        }));
        return;
      }
    }

    if (url.pathname === "/.well-known/oauth-protected-resource") {
      const metadata = getProtectedResourceMetadata();
      if (metadata) {
        // Full OAuth configured
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(metadata));
      } else {
        // Self-hosted OAuth — advertise built-in auth server
        const serverHost = req.headers.host || `${host}:${port}`;
        const protocol = req.headers["x-forwarded-proto"] || "http";
        const baseUrl = `${protocol}://${serverHost}`;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          resource: baseUrl,
          authorization_servers: [baseUrl],
          bearer_methods_supported: ["header"],
          scopes_supported: [],
          resource_documentation: `${protocol}://${serverHost}/docs`,
          resource_description: "CBrowser MCP Server - Open access (no authentication required)",
        }));
      }
      return;
    }

    // =====================================================================
    // Protected Endpoints (auth required)
    // =====================================================================

    // Auth check first (we need the tier for rate limiting)
    let requestTier: PricingTier | null = null;
    if (authEnabled) {
      const authResult = await validateAuth(req, apiKeys, auth0Enabled);
      if (!authResult.valid) {
        // Allow tools/list without auth (discovery surface is public, action surface is gated).
        // Buffer the body to check if this is a tools/list or initialize request.
        if (req.method === "POST" && (url.pathname === "/mcp" || url.pathname === "/")) {
          const bodyChunks: Buffer[] = [];
          for await (const chunk of req) {
            bodyChunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
          }
          const bodyStr = Buffer.concat(bodyChunks).toString("utf-8");
          try {
            const parsed = JSON.parse(bodyStr);
            const method = parsed.method || "";
            if (method === "tools/list" && cachedToolManifest) {
              // Return cached tool manifest without auth
              const response = { jsonrpc: "2.0", id: parsed.id ?? 1, result: { tools: cachedToolManifest } };
              const sseData = `data: ${JSON.stringify(response)}\n\n`;
              res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
              });
              res.end(sseData);
              return;
            }
            if (method === "initialize") {
              // Return server info without auth
              const response = {
                jsonrpc: "2.0",
                id: parsed.id ?? 1,
                result: {
                  protocolVersion: "2025-03-26",
                  serverInfo: { name: "cbrowser", version: VERSION },
                  // Must mirror the authenticated server's capabilities above.
                  // This pre-auth shortcut advertised tools only, so anything
                  // reading capabilities before authenticating concluded the
                  // server had no resources or prompts -- which is how the MCP
                  // Apps ui:// resource looked unreachable when it was not.
                  capabilities: {
                    tools: { listChanged: true },
                    prompts: {},
                    resources: {},
                  },
                },
              };
              const sseData = `data: ${JSON.stringify(response)}\n\n`;
              res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
              });
              res.end(sseData);
              return;
            }
            if (method === "notifications/initialized") {
              res.writeHead(200, { "Content-Type": "text/event-stream" });
              res.end();
              return;
            }
          } catch {
            // Not valid JSON — fall through to auth error
          }
        }
        sendUnauthorized(res, authResult.reason);
        return;
      }
    }

    // Resolve tier from API key for rate limiting
    const requestApiKeyForRate = extractApiKey(req);
    if (requestApiKeyForRate) {
      requestTier = await resolveApiKeyTier(requestApiKeyForRate);
    }

    // Per-account, tier-based rate limit check
    const rateLimit = checkRateLimit(req, requestTier);
    if (!rateLimit.allowed) {
      const retryAfterSeconds = Math.ceil((rateLimit.resetTime - Date.now()) / 1000);
      const retryAfterMinutes = Math.ceil(retryAfterSeconds / 60);
      const humanReadableTime = retryAfterSeconds > 60
        ? `${retryAfterMinutes} minute${retryAfterMinutes !== 1 ? "s" : ""}`
        : `${retryAfterSeconds} second${retryAfterSeconds !== 1 ? "s" : ""}`;

      const tierName = requestTier || "free";
      const tierLimit = rateLimit.limit;

      res.writeHead(429, {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(tierLimit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetTime / 1000)),
      });
      res.end(JSON.stringify({
        error: "Rate Limit Exceeded",
        message: `⚠️ CBrowser Rate Limit Reached (${tierName} tier)\n\nYour ${tierName} plan allows ${tierLimit} requests per hour.\n\nPlease wait ${humanReadableTime} before trying again.${tierName === "free" ? "\n\nUpgrade to Pro for 1,000 requests/hour: https://cbrowser.ai/pricing" : ""}`,
        user_message: `Rate limit reached (${tierName} tier). Please wait ${humanReadableTime} and try again.`,
        retry_after_seconds: retryAfterSeconds,
        retry_after_human: humanReadableTime,
        limit: tierLimit,
        tier: tierName,
        window_minutes: 60,
      }));
      return;
    }

    // Add rate limit headers to successful responses
    res.setHeader("X-RateLimit-Limit", String(rateLimit.limit));
    res.setHeader("X-RateLimit-Remaining", String(rateLimit.remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(rateLimit.resetTime / 1000)));

    // Homepage (GET / with homepageHtml option)
    if (url.pathname === "/" && req.method === "GET" && options?.homepageHtml) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(options.homepageHtml);
      return;
    }

    // MCP endpoint
    if (url.pathname === "/mcp" || url.pathname === "/") {
      // Get or create session
      // v18.14.0: Use client's mcp-session-id for browser session correlation
      // This fixes DOM interaction desync where navigate worked but other tools saw blank page
      const existingSessionId = req.headers["mcp-session-id"] as string | undefined;

      let transport: StreamableHTTPServerTransport;
      let browserSessionId: string;

      // First, determine the browser session ID (independent of transport mode)
      // Always prefer client's session ID for browser continuity
      let sessionSource: string;
      if (existingSessionId && activeSessions.has(existingSessionId)) {
        // Reuse existing browser session
        browserSessionId = existingSessionId;
        sessionSource = "reused";
        const session = activeSessions.get(browserSessionId);
        if (session) {
          session.lastActivity = Date.now();
        }
      } else if (existingSessionId) {
        // Client has a session ID but we don't have a browser for it yet
        // Use their ID to create a new browser session (enables session continuity)
        browserSessionId = existingSessionId;
        sessionSource = "client-new";
      } else {
        // No session ID from client - generate new one
        browserSessionId = randomUUID();
        sessionSource = "generated";
      }

      // Log session handling for debugging (truncate ID for readability)
      const shortId = browserSessionId.substring(0, 8);
      console.log(`[Session] ${sessionSource}: ${shortId}... (active: ${activeSessions.size})`);

      // Now handle transport (stateful mode caches transport, stateless creates new each time)
      const hasExistingTransport = existingSessionId ? transports.has(existingSessionId) : false;

      if (sessionMode === "stateful" && existingSessionId && hasExistingTransport) {
        transport = transports.get(existingSessionId)!;
        console.log(`[Transport] Reusing cached transport for ${existingSessionId.substring(0, 8)}...`);
      } else {

        // Create new transport
        // Stateful: return session ID for transport caching
        // Stateless: no session ID (each request is independent but browser reused via existingSessionId)
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: sessionMode === "stateful" ? () => browserSessionId : undefined,
        });

        // Resolve pricing tier from API key (cbk_ keys → CMS lookup)
        const requestApiKey = extractApiKey(req);
        const resolvedTier = requestApiKey ? await resolveApiKeyTier(requestApiKey) : null;

        // Set key hash for usage tracking
        if (requestApiKey?.startsWith("cbk_")) {
          const { createHash } = await import("crypto");
          setActiveKeyHash(createHash("sha256").update(requestApiKey).digest("hex"));
        } else if (requestApiKey) {
          // Check token→keyHash map (OAuth tokens that aren't raw cbk_ keys)
          const mapped = tokenToKeyHash.get(requestApiKey);
          if (mapped && mapped.expiresAt > Date.now()) {
            setActiveKeyHash(mapped.keyHash);
          } else {
            setActiveKeyHash(null);
          }
        } else {
          setActiveKeyHash(null);
        }

        // Set session API key for account-scoped features (custom personas, etc.)
        const { setSessionApiKey } = await import("./mcp-tools/base/cognitive-tools.js");
        setSessionApiKey(requestApiKey || undefined);

        // Create and connect server with session isolation and tier gating
        const server = createMcpServer(options?.registerTools, browserSessionId, resolvedTier);

        // Allow extension with additional tools (for Enterprise)
        if (options?.extendServer) {
          await options.extendServer(server);
        }

        await server.connect(transport);

        // Store transport for stateful mode
        // IMPORTANT: Use browserSessionId directly, not transport.sessionId
        // The transport.sessionId is only set AFTER the first response is sent,
        // but we need to store it NOW so subsequent requests can find it
        if (sessionMode === "stateful") {
          transports.set(browserSessionId, transport);
          transport.onclose = async () => {
            transports.delete(browserSessionId);
            // Clean up browser session on disconnect
            await cleanupSession(browserSessionId);
          };
        } else {
          // For stateless mode, clean up idle sessions (the 30s interval handles this)
          // Don't aggressively clean on transport close since Claude.ai sends rapid sequential requests
          transport.onclose = async () => {
            // Mark the session so the periodic cleanup can evaluate it
            // The 30s cleanup interval will handle actual cleanup after idle timeout
          };
        }

        // Add error handling for transport errors
        transport.onerror = (error: Error) => {
          console.error(`[MCP Transport Error] ${error.message}`);
        };
      }

      // Handle the request with error wrapping
      try {
        await handleMcpRequest(req, res, transport);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[MCP Request Error] ${errorMessage}`);

        // If response not yet sent, send error
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: `Tool execution failed: ${errorMessage}`,
            },
            id: null,
          }));
        }
      }
      return;
    }

    // 404 for other paths
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  httpServer.listen(port, host, () => { void (async () => {
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

    // Cache tool manifest for unauthenticated tools/list (discovery surface is public).
    // Create a temporary server to extract the registered tool list directly.
    // Tool registration works without a browser — only tool execution needs one.
    try {
      const dummyContext: ToolRegistrationContext = { getBrowser: () => null as any };
      const tempServer = createMcpServer(options?.registerTools, "manifest-cache", null);

      // Ask the server for its tool list the way a client does, rather than
      // reading `_registeredTools` and publishing `tool.inputSchema` directly.
      //
      // That internal field holds the ZodRawShape/ZodObject, NOT JSON Schema —
      // the SDK converts it only while serving tools/list. Publishing it raw put
      // Zod internals (`_def`, `~standard`, `_cached`) on the wire for every tool
      // whose schema is a ZodObject: measured 17 of 122 on demo and 14 of 125 on
      // enterprise. Because this manifest serves the UNAUTHENTICATED tools/list,
      // that was the first thing any prospective MCP client saw, while
      // authenticated clients got correct schemas from the SDK's own path — two
      // sources of truth for one contract, and the public one was the broken one.
      //
      // Driving the real handler means the public manifest cannot diverge from
      // the authenticated one again, because it is now the same code path.
      // (2026-07-26)
      const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
      const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const manifestClient = new Client({ name: "manifest-cache", version: "1" });
      await Promise.all([
        (tempServer as unknown as { connect: (t: unknown) => Promise<void> }).connect(serverTransport),
        manifestClient.connect(clientTransport),
      ]);
      const listed = await manifestClient.listTools();
      await manifestClient.close();

      if (listed?.tools?.length) {
        cachedToolManifest = listed.tools.map((tool) => ({
          name: tool.name,
          description: tool.description || "",
          inputSchema: tool.inputSchema || { type: "object" as const },
          // _meta and outputSchema carried through, not dropped. _meta.ui
          // .resourceUri is how a host learns a tool has a view at all, and a
          // manifest that omits it describes a server whose widgets do not
          // exist. outputSchema is what permits structuredContent, which is
          // what those views hydrate from.
          ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
          ...((tool as { _meta?: unknown })._meta ? { _meta: (tool as { _meta?: unknown })._meta } : {}),
        }));
        const malformed = cachedToolManifest.filter(
          (t) => !t.inputSchema || typeof t.inputSchema !== "object"
            || (t.inputSchema as { type?: unknown }).type !== "object",
        );
        console.log(`[tools/list] Public manifest cached: ${cachedToolManifest.length} tools`);
        if (malformed.length) {
          // Loud, because a silently malformed public contract is what this fix replaced.
          console.error(`[tools/list] WARNING: ${malformed.length} tool(s) have a non-JSON-Schema inputSchema: ${malformed.map((t) => t.name).join(", ")}`);
        }
      }
    } catch (err) {
      // The REASON, not just the fact. This swallowed its error and logged a
      // shrug, so an enterprise server whose manifest build throws advertises
      // ZERO tools to any unauthenticated lister -- which is what a connector
      // does when it refreshes -- and the log said only that something failed.
      // A silent catch on a discovery path is indistinguishable from a server
      // with no tools. (2026-08-01)
      console.error(`[tools/list] Direct manifest cache FAILED: ${(err as Error)?.message ?? err}`);
      console.error(`[tools/list] Unauthenticated tools/list will return an EMPTY list until the first authenticated request populates it. Connectors refreshing now will see no tools.`);
      const st = (err as Error)?.stack; if (st) console.error(st.split("\n").slice(0, 4).join("\n"));
    }
  })(); });

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
