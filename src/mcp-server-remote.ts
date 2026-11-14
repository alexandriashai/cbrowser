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
 *   AUTH0_DOMAIN, AUTH0_AUDIENCE - when set, authentication stays required, but
 *     Auth0 tokens are refused (no CBrowser account can be matched to one);
 *     sign-in is by cbk_ API key or this server's own /authorize (2026-11-12)
 *
 * Rate Limiting Environment Variables:
 *   RATE_LIMIT_ENABLED - Enable IP-based rate limiting (default: false)
 *   RATE_LIMIT_REQUESTS - Max requests per window (default: 5)
 *   RATE_LIMIT_WINDOW_MS - Window size in milliseconds (default: 3600000 = 1 hour)
 *   RATE_LIMIT_WHITELIST - Comma-separated IPs to skip rate limiting
 */

import { registerUiResources } from "./mcp-tools/ui-resources.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CBrowser } from "./browser.js";
import { ensureDirectories, getDataDir } from "./config.js";

// Version from package.json - single source of truth
import { VERSION } from "./version.js";

// Stealth/Enterprise loader (v16.2.0)
import {
  type IConstitutionalEnforcer,
  type StealthConfig,
} from "./stealth/index.js";

// Modular MCP tools (v17.5.0)
// getActiveKeyHash is deliberately no longer imported: billing identity is per-request
// (see resolveRequestKeyHash). setActiveKeyHash, setActiveTier and setSessionApiKey
// write the calling request's own identity context (request-context.ts), which every
// HTTP request enters at createServer below. (sec-identity, 2026-10-10)
import { registerAllPublicTools, setRemoteMode, setHostedMode, setActiveTier as setTierGate, setActiveKeyHash, isToolAccessible, upgradePrompt } from "./mcp-tools/index.js";
import { withPersonaScope, scopedAccountId } from "./persona-scope.js";
import { withChargeScope } from "./charge-scope.js";
import { refundCharge } from "./mcp-tools/credit-refund.js";
import { withRequestIdentity } from "./request-context.js";
import { checkOwnAddressConfig } from "./egress.js";

/**
 * The account owning this request, or null when it carries no account key or
 * the CMS named no account for it.
 *
 * Read from the same cache entry as the key's tier (tierCache, filled by
 * validateAccountKey), so the outage grace that keeps a key authenticated also
 * keeps its account. The account used to live in a cache of its own with no
 * grace: 30 s into a CMS outage the key still authenticated but the request
 * ran with no account scope, so its browser tokens, saved sessions and personas
 * landed in the shared process directory where another unscoped caller could
 * load them (auth-tenancy-billing-6, 2026-11-12).
 *
 * Deliberately NOT a module-level "current account": the value is looked up by
 * the request's own key and carried through AsyncLocalStorage.
 */
export async function resolveRequestAccountId(req: IncomingMessage): Promise<number | null> {
  const apiKey = extractApiKey(req);
  if (!apiKey?.startsWith("cbk_")) return null;
  const verdict = await validateAccountKey(apiKey);
  return verdict.valid && typeof verdict.accountId === "number" ? verdict.accountId : null;
}
import { type PricingTier, TOOL_CATEGORIES, categorizedToolNames } from "./mcp-tools/tool-categories.js";
import { BUILTIN_PERSONAS, ACCESSIBILITY_PERSONAS, EMOTIONAL_PERSONAS, AGENT_PERSONAS } from "./personas.js";
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

const browserTokens = new Map<string, { sessionId: string; createdAt: number; accountId: number | undefined }>();
const TOKEN_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Generate a short browser token that maps to a session's browser.
 */
export function generateBrowserToken(sessionId: string): string {
  // 64 bits from the CSPRNG, bound to the account that minted it. It was 8
  // base36 chars from Math.random and bound to nobody, so a token seen by
  // another account drove the minting account's logged-in browser. (v8 O3)
  const token = `cb_${randomBytes(8).toString("hex")}`;
  browserTokens.set(token, { sessionId, createdAt: Date.now(), accountId: scopedAccountId() });
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
    // Another account's token resolves exactly like an unknown one: refusing it
    // differently would confirm that it exists. (v8 O3, 2026-10-10)
    if (info && info.accountId === scopedAccountId()) {
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
    accountId: scopedAccountId(),
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
  /** Account scope that created it; undefined when unscoped. (tenant, 2026-10-10) */
  accountId: number | undefined;
}

/** Thrown when a session id names a browser another account created. */
export class SessionOwnedElsewhereError extends Error {
  constructor() {
    super("This MCP session id is not available to this caller. Reconnect to start a new session, or call navigate() without a _browserToken.");
    this.name = "SessionOwnedElsewhereError";
  }
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
export async function getSessionBrowser(sessionId: string): Promise<CBrowser> {
  // Check if this session was recently expired - auto-recover by creating new session
  const expiredInfo = expiredSessions.get(sessionId);
  if (expiredInfo) {
    const minutesAgo = Math.round((Date.now() - expiredInfo.expiredAt) / 60000);
    console.log(`[Session] Auto-recovering expired session ${sessionId.substring(0, 8)}... (expired ${minutesAgo}m ago: ${expiredInfo.reason})`);
    // Clear the expired marker so we can create a fresh session
    expiredSessions.delete(sessionId);
    // Fall through to create new session below
  }

  // Check if session already exists. The id is the client's mcp-session-id
  // header on the /mcp path, so holding it proves nothing: this map is one per
  // process and returned the browser (cookies, logged-in pages) to any caller
  // presenting the id. A session is now reused only by the account scope that
  // created it; unscoped callers keep the old behaviour among themselves.
  // (tenant, 2026-10-10)
  const existing = activeSessions.get(sessionId);
  if (existing) {
    if (existing.accountId !== scopedAccountId()) throw new SessionOwnedElsewhereError();
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
    accountId: scopedAccountId(),
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
      // The shared legacy browser belongs to no account, so its files stay
      // in the process data dir even if it is first built inside a scope;
      // the config default is now the caller's directory. (tenant, 2026-10-10)
      dataDir: getDataDir(),
    });
  }
  return browser;
}

/**
 * The browser a tokenless, session-less (stateless) tool call gets: the calling
 * account's own isolated browser inside an account scope, the shared legacy
 * browser otherwise. See configureMcpTools for why. (v8 O3, 2026-10-10)
 */
export async function getTokenlessBrowser(): Promise<CBrowser> {
  const accountId = scopedAccountId();
  return accountId === undefined ? getBrowser() : getSessionBrowser(`${ACCOUNT_SESSION_PREFIX}${accountId}`);
}

/**
 * Session ids in this namespace name an account's own tokenless browser. On the
 * /mcp path the session id is the client's mcp-session-id header, and account
 * ids are small integers, so 19.3.7 let any caller send "account:2" and drive
 * account 2's browser, or claim the id first and lock the owner out. A client
 * header in this namespace is ignored, as if no session id had been sent.
 * (19.3.8, 2026-10-10)
 */
export const ACCOUNT_SESSION_PREFIX = "account:";

export function sessionIdFromHeader(header: string | string[] | undefined): string | undefined {
  const id = Array.isArray(header) ? header[0] : header;
  return id && !id.startsWith(ACCOUNT_SESSION_PREFIX) ? id : undefined;
}

// Transport storage for stateful sessions
const transports = new Map<string, StreamableHTTPServerTransport>();

/**
 * Whether this deployment has an Auth0 tenant configured (AUTH0_DOMAIN and
 * AUTH0_AUDIENCE). Only one thing still depends on it: a server configured for
 * Auth0 keeps authentication required, as it always did.
 *
 * Auth0 tokens are no longer ACCEPTED (2026-11-12, enterprise-7). A verified
 * token authenticated the caller with no CBrowser account behind it, so the
 * tier check, the CMS deduct (which is also the domain gate) and the account
 * scope were all skipped: every tool on the enterprise server, unbilled, on the
 * shared unscoped data directory. The CMS has no way to map an Auth0 subject to
 * an account (no such column or route in cbrowser-web/cms, read 2026-11-12),
 * and 30 days of logs showed no request authenticated this way. So a token of
 * that shape is refused with a pointer to API-key sign-in, and the discovery
 * documents below advertise this server's own /authorize and /token, which
 * hand out cbk_ keys, instead of the tenant.
 */
function auth0Configured(): boolean {
  return Boolean(process.env.AUTH0_DOMAIN && process.env.AUTH0_AUDIENCE);
}

/** Three base64url segments: the shape of a JWT, which is what Auth0 issues. */
export function looksLikeJwt(token: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(token);
}

export const AUTH0_REFUSED_MESSAGE =
  "Auth0 tokens are not accepted on this server: no CBrowser account is linked to them. " +
  "Connect with your CBrowser API key (cbk_...) as the Bearer token, or sign in through this server's /authorize. " +
  "Get a key at https://cbrowser.ai/account.";

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
const tierCache = new Map<string, { tier: PricingTier; accountId?: number; expiresAt: number }>();
/** Pre-auth request bodies are capped; see the read loop in handleMcpRequest. */
const MAX_REQUEST_BODY_BYTES = 4 * 1024 * 1024;

/** Bound the CMS deduct call; an unanswered one used to hang the whole request. */
const CREDIT_DEDUCT_TIMEOUT_MS = 5_000;

/**
 * "none" on the enterprise server: enterprise is unlimited use (Alexa, 2026-10-12).
 * The deduct call is still made, because the CMS deduct route is also the domain,
 * tier and URL gate; `charge=none` makes the CMS price the call at 0. Set once at
 * startup from `RemoteMcpServerOptions.chargeCredits`.
 */
let creditChargeMode: "charge" | "none" = "charge";

export function setCreditChargeMode(mode: "charge" | "none"): void {
  creditChargeMode = mode;
}

/**
 * Did this deduct response actually take credits? Decides whether the call enters a
 * charge scope (where an isError result is refunded). A 0-credit deduct (charge=none,
 * or a free tool) took nothing, and the CMS refund route credits the catalog price
 * without finding the matching deduct, so refunding it would mint credits. A CMS that
 * does not report `cost` keeps the old behaviour.
 */
export function chargedByDeduct(httpOk: boolean, data: { allowed?: boolean; cost?: number }): boolean {
  return httpOk && data.allowed === true && data.cost !== 0;
}

/** Longest path, and longest non-http(s) string, sent as the deduct target. */
const DEDUCT_TARGET_PATH_MAX = 512;

/**
 * The target URL as the deduct call carries it: origin plus at most
 * DEDUCT_TARGET_PATH_MAX characters of path, no query, no fragment.
 *
 * The CMS deduct route reads its arguments from the query string only (it has
 * no body form, cbrowser-web/cms/routes/credits.ts read 2026-11-12) and gates on
 * the URL's host alone. The whole caller URL used to go into that query, and a
 * url argument over about 16 KB (a #fragment of padding changes nothing about
 * the page loaded) made the request line too long: the CMS runtime answered 431
 * before the route ran, and that answer used to run the tool unbilled
 * (auth-tenancy-billing-4, 2026-11-12). A string that is not an http(s) URL is
 * cut to the same length and passed on, so the CMS still refuses a data: or
 * unparseable target for a scoped tool as it did.
 */
export function deductTarget(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.protocol === "http:" || u.protocol === "https:") {
      return u.origin + u.pathname.slice(0, DEDUCT_TARGET_PATH_MAX);
    }
  } catch {
    // not a URL: passed on, bounded
  }
  return raw.slice(0, DEDUCT_TARGET_PATH_MAX);
}

/** Query string for POST /api/credits/deduct. */
export function deductQuery(keyHash: string, toolName: string, targetUrl: string | undefined): string {
  return new URLSearchParams({
    key_hash: keyHash,
    tool: toolName,
    ...(targetUrl ? { target_url: deductTarget(targetUrl) } : {}),
    ...(creditChargeMode === "none" ? { charge: "none" } : {}),
  }).toString();
}

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
  | { valid: true; tier: PricingTier; accountId?: number }
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
}

/** Test seam: make every cached key `ms` older, to reach the outage grace without waiting. */
export function _ageTierCache(ms: number): void {
  for (const entry of tierCache.values()) entry.expiresAt -= ms;
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

/** A refused or unbillable call, answered as a tool error so nothing runs. */
function billingErrorResult(error: string, message: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error, message }, null, 2) }],
  };
}

/** How a deduct call came back. Only "ok" lets the tool run. */
export type DeductOutcome =
  | { kind: "ok"; charged: boolean }
  | { kind: "denied"; data: { reason?: string; message?: string; remaining?: number } }
  | { kind: "refused"; why: string }
  | { kind: "outage"; why: string };

/**
 * Classify a deduct response. Exported for tests.
 *
 *   2xx with allowed:true          -> ok (charged unless cost is 0)
 *   2xx/402/403 with allowed:false -> denied (the CMS's own refusal, shown as is)
 *   5xx                            -> outage (the CMS is up but failing)
 *   anything else                  -> refused, and the tool does not run
 *
 * "Anything else" used to run the tool unbilled. That included statuses the
 * caller can cause: a 431 from a long URL (auth-tenancy-billing-4), a 404 for a
 * key revoked inside the tier-cache window, a 403 or 2xx without a verdict.
 * The CMS answers every real decision with an `allowed` field, so a response
 * without one is not a decision and is not treated as permission. (2026-11-12)
 */
export function classifyDeduct(status: number, data: unknown): DeductOutcome {
  const d = (data && typeof data === "object" ? data : {}) as { allowed?: unknown; cost?: number; reason?: string; message?: string; remaining?: number };
  const ok = status >= 200 && status < 300;
  if ((ok || status === 402 || status === 403) && d.allowed === false) {
    return { kind: "denied", data: { reason: d.reason, message: d.message, remaining: d.remaining } };
  }
  if (ok && d.allowed === true) return { kind: "ok", charged: chargedByDeduct(true, { allowed: true, cost: d.cost }) };
  if (status >= 500) return { kind: "outage", why: `CMS returned HTTP ${status}` };
  if (ok) return { kind: "refused", why: `CMS answered HTTP ${status} without a verdict` };
  return { kind: "refused", why: `CMS returned HTTP ${status}` };
}

/** One deduct call for one target. Never throws. */
async function deductOnce(keyHash: string, toolName: string, targetUrl: string | undefined): Promise<DeductOutcome> {
  const cmsUrl = process.env.CMS_URL || "http://localhost:3200";
  let res: Response;
  try {
    res = await fetch(`${cmsUrl}/api/credits/deduct?${deductQuery(keyHash, toolName, targetUrl)}`, {
      method: "POST",
      // The CMS deduct endpoint is internal-only and 403s without this header.
      headers: { "X-Internal-Secret": process.env.CMS_INTERNAL_SECRET || "" },
      // Without this, a CMS that accepts the connection and never answers
      // hangs the MCP request forever, before the handler is ever reached.
      signal: AbortSignal.timeout(CREDIT_DEDUCT_TIMEOUT_MS),
    });
  } catch (err) {
    // Connection refused or reset, or the time limit: the CMS cannot be reached.
    return { kind: "outage", why: `CMS unreachable (${describeError(err)})` };
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // A 2xx whose body is not JSON is a CMS fault, not a decision.
    if (res.ok) return { kind: "outage", why: `CMS answered HTTP ${res.status} with a body that is not JSON` };
  }
  return classifyDeduct(res.status, data);
}

/**
 * Calls an account may run unbilled while the CMS cannot be reached.
 *
 * Every call during an outage used to run unbilled and ungated for as long as
 * the outage lasted, and an outage can be caused from outside: wrong-password
 * logins hold the CMS's single thread (prior-plan-status-6). A CMS blip must not
 * take the product down, so a few calls still run; past this allowance the call
 * is refused until the CMS answers again. Per account, so one account using its
 * allowance leaves every other account's intact. (2026-11-12)
 */
const OUTAGE_ALLOWANCE_CALLS = 5;
const OUTAGE_ALLOWANCE_WINDOW_MS = 10 * 60_000;
const outageAllowanceUse = new Map<string, number[]>();

/** Take one unbilled call from `who`'s allowance; false when it is used up. Exported for tests. */
export function takeOutageAllowance(who: string, now: number = Date.now()): { allowed: boolean; used: number } {
  const recent = (outageAllowanceUse.get(who) ?? []).filter((t) => now - t < OUTAGE_ALLOWANCE_WINDOW_MS);
  if (recent.length >= OUTAGE_ALLOWANCE_CALLS) {
    outageAllowanceUse.set(who, recent);
    return { allowed: false, used: recent.length };
  }
  recent.push(now);
  outageAllowanceUse.set(who, recent);
  // Entries for accounts that stopped calling are dropped as others arrive.
  if (outageAllowanceUse.size > 1000) {
    for (const [k, ts] of outageAllowanceUse) {
      if (!ts.some((t) => now - t < OUTAGE_ALLOWANCE_WINDOW_MS)) outageAllowanceUse.delete(k);
    }
  }
  return { allowed: true, used: recent.length };
}

/** Test seam: forget every account's outage allowance use. */
export function _resetOutageAllowance(): void {
  outageAllowanceUse.clear();
}

/**
 * Argument names that carry a target URL but do not say "url". Everything whose
 * name contains "url" is collected anyway (urlA, start_url, entry_url, baseUrl,
 * restoreUrl, mcp_url, competitor_url...), and so is any other top-level string
 * that is an absolute http(s) address, so a tool added later with a new name
 * cannot slip past the gate by naming its argument differently.
 */
const URL_ARRAY_ARGS = new Set(["sites", "variants"]);

/**
 * Arguments that hold a URL that is NOT where the tool goes: a proxy to route
 * through, request patterns to block. Gating them against the account's
 * registered sites would refuse every proxied or chaos-tested call.
 */
const NOT_A_TARGET_ARGS = new Set(["proxy", "proxy_server", "proxyServer", "blockUrls", "_browserToken"]);

/** At most this many distinct hosts are gated for one call. */
export const MAX_GATED_HOSTS = 10;

/** At most this many distinct URLs are resolved and gated for one call (each costs an outbound HEAD chain). */
export const MAX_GATED_URLS = 10;

const isHttpUrl = (s: string): boolean => /^https?:\/\//i.test(s.trim());

/**
 * Every URL a tool call names as a target, in argument order with `url` first,
 * duplicates removed. Exported for tests.
 *
 * The domain gate used to see only `url` or `sites[0]`, so cognitive_journey_
 * autonomous (start_url), marketing_funnel_analyze (entry_url),
 * cognitive_journey_init (startUrl), coverage_map (baseUrl) and ab_comparison
 * (urlA, urlB) reached the CMS with no target and skipped the registered-domain
 * check (enterprise-3, 2026-11-12). Found by reading every inputSchema the
 * demo and enterprise servers publish (131 tools each).
 */
export function targetUrlsOf(args: Record<string, unknown> | undefined): string[] {
  if (!args || typeof args !== "object") return [];
  const out: string[] = [];
  const add = (v: unknown, named: boolean) => {
    if (typeof v !== "string" || !v) return;
    if (named || isHttpUrl(v)) out.push(v);
  };
  const keys = Object.keys(args);
  keys.sort((a, b) => (a === "url" ? -1 : b === "url" ? 1 : 0));
  for (const k of keys) {
    if (NOT_A_TARGET_ARGS.has(k)) continue;
    const v = args[k];
    const named = /url/i.test(k) || URL_ARRAY_ARGS.has(k);
    if (Array.isArray(v)) for (const item of v) add(item, named);
    else add(v, named);
  }
  return [...new Set(out)];
}

/** The host a target is gated on: its hostname, or the string itself when it is not a URL. */
function gateHost(target: string): string {
  try {
    return new URL(target).hostname.toLowerCase() || target;
  } catch {
    return target;
  }
}

const BILLING_UNAVAILABLE = "billing is temporarily unavailable, try again shortly";

/**
 * Charge and gate one tool call. Returns the refusal to send instead of running
 * the tool, or whether the call was charged (and so enters a charge scope, where
 * an isError result is refunded).
 *
 * The first target is charged. Each further target on a different host gets a
 * deduct of its own, because the CMS route gates one target per call and has
 * no gate-only form; credits that extra deduct took are given back at once, so
 * the call costs what one call of the tool costs. Any refusal refuses the whole
 * call and gives back whatever was taken. (2026-11-12)
 */
async function chargeAndGate(
  keyHash: string,
  toolName: string,
  targets: string[],
  who: string,
): Promise<{ refusal: ReturnType<typeof billingErrorResult> | ReturnType<typeof creditDeniedResult> } | { charged: boolean }> {
  const giveBack = async (n: number) => {
    for (let i = 0; i < n; i++) await refundCharge({ keyHash, tool: toolName, idempotencyKey: randomUUID() });
  };
  const refusalFor = (o: Exclude<DeductOutcome, { kind: "ok" }>) => {
    if (o.kind === "denied") return creditDeniedResult(o.data);
    if (o.kind === "outage") return billingErrorResult("billing_unavailable", `${toolName} did not run: ${BILLING_UNAVAILABLE}.`);
    return billingErrorResult("billing_refused", `${toolName} did not run: the billing service refused the charge (${o.why}). Nothing was charged.`);
  };

  const first = await deductOnce(keyHash, toolName, targets[0]);
  if (first.kind === "outage") {
    const take = takeOutageAllowance(who);
    if (take.allowed) {
      console.warn(`[Credits] OUTAGE ALLOWANCE: ${who} ran ${toolName} unbilled (${take.used} of ${OUTAGE_ALLOWANCE_CALLS} in ${OUTAGE_ALLOWANCE_WINDOW_MS / 60_000} min): ${first.why}`);
      return { charged: false };
    }
    console.warn(`[Credits] OUTAGE REFUSED: ${who} ${toolName}: allowance of ${OUTAGE_ALLOWANCE_CALLS} unbilled calls in ${OUTAGE_ALLOWANCE_WINDOW_MS / 60_000} min used: ${first.why}`);
    return { refusal: refusalFor(first) };
  }
  if (first.kind !== "ok") {
    console.warn(`[Credits] ${toolName}: ${first.kind === "denied" ? `DENIED (${first.data.reason})` : `REFUSED: ${first.why}`}`);
    return { refusal: refusalFor(first) };
  }

  const seen = new Set([gateHost(targets[0] ?? "")]);
  for (const target of targets.slice(1)) {
    const host = gateHost(target);
    if (seen.has(host)) continue;
    seen.add(host);
    const o = await deductOnce(keyHash, toolName, target);
    if (o.kind === "ok") {
      if (o.charged) await giveBack(1);
      continue;
    }
    console.warn(`[Credits] ${toolName}: further target ${host} ${o.kind === "denied" ? `DENIED (${o.data.reason})` : `REFUSED: ${o.why}`}; call refused`);
    if (first.charged) await giveBack(1);
    return { refusal: refusalFor(o) };
  }
  return { charged: first.charged };
}

/** Serve a previously-validated key during a backend outage, or reject. */
function staleServe(keyHash: string): KeyVerdict {
  const cached = tierCache.get(keyHash);
  if (cached && cached.expiresAt + AUTH_STALE_GRACE_MS > Date.now()) {
    return { valid: true, tier: cached.tier, accountId: cached.accountId };
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
  if (cached && cached.expiresAt > Date.now()) return { valid: true, tier: cached.tier, accountId: cached.accountId };

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
  // The account goes in the SAME entry as the tier, so the outage grace in
  // staleServe returns both. It lived in a second cache with no grace, and 30 s
  // into an outage a key that still authenticated ran with no account scope
  // (auth-tenancy-billing-6, 2026-11-12). Before that it was not recorded here
  // at all, so no account key ever entered persona scope (B16, 2026-10-09).
  const accountId = typeof data.accountId === "number" ? data.accountId : undefined;
  tierCache.set(keyHash, { tier, accountId, expiresAt: Date.now() + TIER_CACHE_TTL_MS });
  return { valid: true, tier, accountId };
}

/**
 * The pricing tier for an API key: null for a key that is not an account key
 * (server admin keys pass through as-is), "free" when the CMS does not vouch for it.
 *
 * PRICING ONLY. This runs AFTER authentication has already succeeded, so its
 * "free" fallback is a safe-by-default *billing* decision. It must never be used
 * to decide whether a caller is authenticated — use validateAccountKey for that.
 *
 * It asks validateAccountKey, so it shares that function's cache, its 3 s time
 * limit and its outage grace. It used to make its own CMS call with no time
 * limit, so a CMS that accepted connections and never answered hung every
 * authenticated request here, after auth had already passed (2026-11-12).
 */
async function resolveApiKeyTier(apiKey: string): Promise<PricingTier | null> {
  if (!apiKey.startsWith("cbk_")) return null;
  const verdict = await validateAccountKey(apiKey);
  return verdict.valid ? verdict.tier : "free";
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

// ============================================================================
// Request guard (crash hotfix, 2026-11-12)
//
// The HTTP listener was an async function whose promise nobody caught, and the
// process had no unhandledRejection handler, so any throw before the MCP
// dispatch ended the process for every account: POST /token with the body "{"
// (bare JSON.parse), a request line of "//" or a Host header that is not a
// host (new URL), a password grant while the CMS was down (bare fetch), and
// any POST whose body was cut off (the body loop rejects). None needed
// credentials. Every request now runs inside answerRequestSafely, which turns
// a throw into one log line and a 400, 413 or 500, and the branches that read
// client input answer it themselves.
// ============================================================================

/** OAuth bodies are a few hundred bytes; anything past this is refused unread. */
const MAX_OAUTH_BODY_BYTES = 64 * 1024;

/**
 * Bound each CMS call a sign-in makes. Without it a CMS that accepted the
 * connection and never answered held the sign-in open forever. Longer than
 * the 3 s key check because a password login runs a slow hash on the CMS.
 */
const OAUTH_CMS_TIMEOUT_MS = 10_000;

/** A request the server could not read. The guard answers it with `status`, never 500. */
export class RequestInputError extends Error {
  constructor(readonly status: number, readonly errorCode: string, message: string) {
    super(message);
    this.name = "RequestInputError";
  }
}

/**
 * One short description of an error for the log. A SyntaxError from JSON.parse
 * quotes the start of the body it failed on, which can be a password, so for
 * that one only the name is kept.
 */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(typeof err).slice(0, 40);
  const code = (err as NodeJS.ErrnoException).code;
  const head = code ? `${err.name} ${code}` : err.name;
  if (err instanceof SyntaxError) return head;
  return `${head}: ${err.message}`.replace(/[\r\n]+/g, " ").slice(0, 200);
}

/**
 * Why a parsed POST /mcp body cannot be dispatched, or null when it can.
 * Exported for tests.
 *
 * The body must be ONE JSON-RPC message object. A batch (array) is refused
 * because the charge and every gate read the body as one message, and the SDK
 * ran each element of a batch past them (auth-tenancy-billing-2, -5). A
 * tools/call without a string or number id is a notification to the SDK: it is
 * never run, so charging for it would take credits for nothing. (2026-11-12)
 */
export function unsupportedBodyShape(parsed: unknown): string | null {
  if (Array.isArray(parsed)) {
    return "Batch requests are not supported: send one JSON-RPC message per request.";
  }
  if (parsed === undefined) return "The request body is empty: send one JSON-RPC message object.";
  if (parsed === null || typeof parsed !== "object") {
    return "The request body must be one JSON-RPC message object.";
  }
  const msg = parsed as { method?: unknown; id?: unknown };
  if (msg.method === "tools/call" && typeof msg.id !== "string" && typeof msg.id !== "number") {
    return "A tools/call must carry an id: as a notification it would not run.";
  }
  return null;
}

/** The request path for the log: no query string (it can carry codes and state), no control characters. */
function pathForLog(target: string | undefined): string {
  return (target ?? "").split("?")[0].replace(/[^\x20-\x7e]/g, "?").slice(0, 100);
}

/**
 * Read a request body, refusing it past `limit` bytes. Too large: rejects with
 * RequestInputError(413) and stops keeping what arrives, so the rest is
 * discarded rather than buffered. Client gone before the end: rejects, and the
 * guard closes the socket.
 */
export function readBodyCapped(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    const cleanup = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      req.off("close", onClose);
    };
    const onData = (chunk: Buffer | string) => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      received += buf.length;
      if (received > limit) {
        cleanup();
        // An error listener stays, so a reset after this is not an unhandled 'error' event.
        req.on("error", () => {});
        req.resume();
        reject(new RequestInputError(413, "payload_too_large", `Request body exceeds ${limit} bytes.`));
        return;
      }
      chunks.push(buf);
    };
    const onEnd = () => {
      cleanup();
      resolve(Buffer.concat(chunks).toString("utf-8"));
    };
    const onError = (err: Error) => {
      cleanup();
      req.on("error", () => {});
      reject(err);
    };
    const onClose = () => {
      cleanup();
      reject(Object.assign(new Error("request body ended early"), { code: "ECONNRESET" }));
    };
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
    req.on("close", onClose);
  });
}

/**
 * The request target as a URL, or RequestInputError(400). Origin-form must be
 * one slash and a path: new URL reads "//x" and "/\x" as a host named x, and
 * throws on "//" alone. Absolute-form ("http://host/path") is legal HTTP/1.1
 * and parses as given; only its path and query are used. The Host header is
 * the base, so a Host that is not a host is refused here too.
 */
export function parseRequestUrl(req: IncomingMessage): URL {
  const target = req.url || "/";
  const absolute = /^https?:\/\//i.test(target);
  if (!absolute && (!target.startsWith("/") || /^\/[/\\]/.test(target))) {
    throw new RequestInputError(400, "bad_request", "Malformed request target.");
  }
  try {
    return new URL(target, `http://${req.headers.host}`);
  } catch {
    throw new RequestInputError(400, "bad_request", "Malformed request target or Host header.");
  }
}

/**
 * The /token parameters, or null when the body cannot be read. JSON when the
 * Content-Type says so or the body starts with "{" or "["; then it must be an
 * object, and only its string, number and boolean fields are taken. Form data
 * otherwise, which is what RFC 6749 clients send.
 */
export function parseTokenRequestBody(body: string, contentType: string | undefined): URLSearchParams | null {
  const trimmed = body.trimStart();
  const isJson = /^application\/([\w.+-]+\+)?json\b/i.test(contentType ?? "") || trimmed.startsWith("{") || trimmed.startsWith("[");
  if (!isJson) return new URLSearchParams(body);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") params.set(k, String(v));
  }
  return params;
}

/** An OAuth error answer (RFC 6749 section 5.2 shape). */
function oauthError(res: ServerResponse, status: number, error: string, description: string): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error, error_description: description }));
}

/**
 * Run one request's handler so that nothing it throws leaves this function.
 * A throw is logged as one line (method, path without query, status, error
 * name and message; never the body or headers) and answered: the error's own
 * status for a request the server could not read, 500 for anything else. When
 * the client has gone, or headers are already out, the socket is closed
 * instead. This function never rejects.
 */
export async function answerRequestSafely(
  req: IncomingMessage,
  res: ServerResponse,
  handler: () => Promise<void>,
): Promise<void> {
  try {
    await handler();
  } catch (err) {
    try {
      const clientGone = (req.destroyed && !req.complete) || (err as NodeJS.ErrnoException)?.code === "ECONNRESET";
      const status = err instanceof RequestInputError ? err.status : 500;
      console.error(`[HTTP] ${String(req.method).slice(0, 10)} ${pathForLog(req.url)} -> ${clientGone ? "client gone" : status}: ${describeError(err)}`);
      if (clientGone || res.headersSent) {
        res.destroy();
        return;
      }
      res.writeHead(status, {
        "Content-Type": "application/json",
        // A refused oversized body is not read to its end, so the connection cannot be reused.
        ...(status === 413 ? { Connection: "close" } : {}),
      });
      res.end(JSON.stringify(err instanceof RequestInputError
        ? { error: err.errorCode, error_description: err.message }
        : { error: "server_error" }));
    } catch {
      res.destroy();
    }
  }
}

let rejectionLoggerInstalled = false;

/**
 * Second layer behind answerRequestSafely, for a promise that rejects outside
 * any request (a timer, a fire-and-forget call). Node and Bun end the process
 * on an unhandled rejection; here it is logged and the server keeps serving.
 *
 * uncaughtException is deliberately NOT caught. A synchronous throw that
 * reaches the top can leave module state half-updated (a map entry written,
 * its pair not), and serving every account from that state is worse than a
 * restart; systemd restarts the unit (Restart=always). A rejected promise has
 * already unwound its own async function, so the state it leaves is the same
 * as a handled error's.
 */
function installRejectionLogger(): void {
  if (rejectionLoggerInstalled) return;
  rejectionLoggerInstalled = true;
  process.on("unhandledRejection", (reason) => {
    console.error(`[process] unhandled rejection, server kept running: ${describeError(reason)}`);
  });
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
    // An Auth0 token is refused on its shape, without asking the tenant: there
    // is no CBrowser account it could be billed and scoped to (see
    // auth0Configured). It used to authenticate as a caller with no account.
    if (looksLikeJwt(token)) return { valid: false, reason: AUTH0_REFUSED_MESSAGE };
  }

  return { valid: false, reason: "Authentication required. Get your API key at https://cbrowser.ai/account/register then enter it as the Bearer token when connecting." };
}

function sendUnauthorized(res: ServerResponse, message?: string): void {
  // No Auth0 endpoints here any more: they named a tenant whose tokens this
  // server refuses. Sign-in is this server's own /authorize, which discovery
  // (/.well-known/oauth-authorization-server) describes. (2026-11-12)
  res.writeHead(401, {
    "Content-Type": "application/json",
    "WWW-Authenticate": "Bearer",
  });
  res.end(JSON.stringify({
    error: "Unauthorized",
    message: message || "Valid authentication required. Use Authorization: Bearer <token>",
  }));
}

/**
 * The tier a request is gated at.
 * Priority: resolved from API key > CBROWSER_TIER env > null (self-hosted, no gating).
 */
function effectiveTier(resolvedTier?: PricingTier | null): PricingTier | null {
  return resolvedTier ?? (process.env.CBROWSER_TIER as PricingTier | undefined) ?? null;
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
  // Create session-aware getBrowser function. Stateless hosted requests have no
  // MCP session, and used to share ONE persistent browser across every account:
  // its profile collected one tenant's logins and any other tenant's tokenless
  // manage_cookies read them (v8 O3, 2026-10-10). Inside an account scope a
  // tokenless call now gets that account's own isolated browser, swept on idle
  // like any session. Unscoped (operator key, CLI, local) keeps the old one.
  const sessionGetBrowser = sessionId
    ? () => getSessionBrowser(sessionId)
    : getTokenlessBrowser;

  const context: ToolRegistrationContext = { getBrowser: sessionGetBrowser, getBrowserByToken };

  const tier = effectiveTier(resolvedTier);

  if (customRegisterTools) {
    // Set tier BEFORE custom registration so createGatedServer uses resolved tier
    setTierGate(tier);
    customRegisterTools(server, context);
  } else {
    registerAllPublicTools(server, context, tier);
  }
}

/**
 * Counts this server prints about itself, all derived, never typed.
 *
 * Every number below used to be a literal, and they disagreed with each other
 * and with tools/list: the instructions said "120 tools across 16 categories",
 * docs://tools-overview said 105 in its description and "120 across 11" in its
 * body, persona_creation was "(6 tools)" with nine registered, and
 * docs://personas said 21 while listing 6 of the 10 general personas. Measured
 * 2026-10-10: tools/list on the enterprise server returned 130 tools, 126 of
 * them in TOOL_CATEGORIES' 20 categories and 4 in none (B33).
 */
function catalogCounts(): { tools: number; categories: number } {
  return { tools: categorizedToolNames().length, categories: TOOL_CATEGORIES.length };
}

/** One line per specialist category, counted from TOOL_CATEGORIES. */
function specialistCategoryLines(): string {
  return TOOL_CATEGORIES
    .filter((cat) => cat.tier > 1)
    .map((cat) => `• ${cat.name} (${cat.tools.length} tool${cat.tools.length === 1 ? "" : "s"}) — ${cat.tools.slice(0, 5).join(", ")}${cat.tools.length > 5 ? "..." : ""}`)
    .join("\n");
}

/** The server instructions sent on initialize. Exported so the counts can be tested. */
export function buildServerInstructions(): string {
  const { tools, categories } = catalogCounts();
  return `CBrowser — cognitive browser automation with ${tools} tools across ${categories} categories.

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
${specialistCategoryLines()}

TIPS:
• Pass _browserToken between tool calls to maintain browser state
• Use site_cognitive_assessment for comprehensive site analysis (runs all gates automatically)
• For disability testing, pass one persona at a time to empathy_audit to avoid timeouts

SITE FAMILIARITY AND SITE KNOWLEDGE:
• Familiarity is per run, not per persona: no persona (power-user included) carries one
• cognitive_effort and site_cognitive_assessment score the siteFamiliarity you pass (0 first visit, 1 daily user), else a first visit (0)
• Site knowledge (site_model_status) is reported in their results but does not change the score
• cognitive_journey_init caps a journey's familiarity by how many pages this install has crawled
• navigate, click, and page_understand all build site knowledge automatically

SELF-HELP:
• If you are unsure what a tool does, what a score means, which persona to use, or how tools work together — call question_answer with your question
• question_answer searches 290+ pages of CBrowser documentation and returns a grounded answer
• Use it before guessing. Example: question_answer(question: "What is the difference between viewport and full_page scope?")
• Use it to explain results to the user. Example: question_answer(question: "What does a CTC in the high band with a readability bottleneck mean?")`;
}

/** Body of docs://tools-overview, counted from TOOL_CATEGORIES. */
export function buildToolsOverviewText(): string {
  const { tools, categories } = catalogCounts();
  const list = TOOL_CATEGORIES.map((cat) => `${cat.name} (${cat.tools.length})`).join(", ");
  return `CBrowser provides ${tools} MCP tools across ${categories} categories: ${list}. Visit https://cbrowser.ai/docs/Tools-Overview for the complete reference.`;
}

/** Body of docs://personas, listed from the persona maps themselves. */
export function buildPersonasOverviewText(): string {
  const groups: Array<[string, string[]]> = [
    ["Cognitive", Object.keys(BUILTIN_PERSONAS)],
    ["Accessibility", Object.keys(ACCESSIBILITY_PERSONAS)],
    ["Emotional", Object.keys(EMOTIONAL_PERSONAS)],
    ["AI agent", Object.keys(AGENT_PERSONAS)],
  ];
  const total = groups.reduce((n, [, names]) => n + names.length, 0);
  const body = groups.map(([label, names]) => `${label} (${names.length}): ${names.join(", ")}`).join(". ");
  return `CBrowser includes ${total} built-in personas: ${body}. Each human persona has 25 cognitive traits; agent personas describe AI agents with agent traits instead. Visit https://cbrowser.ai/docs/Persona-Index for details.`;
}

/** Number of built-in personas across every map docs://personas lists. */
function builtinPersonaCount(): number {
  return [BUILTIN_PERSONAS, ACCESSIBILITY_PERSONAS, EMOTIONAL_PERSONAS, AGENT_PERSONAS]
    .reduce((n, map) => n + Object.keys(map).length, 0);
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
      description: `AI-powered browser automation with cognitive user simulation. ${catalogCounts().tools} MCP tools for navigation, visual testing, accessibility auditing, persona-based testing, site knowledge learning, and security scanning. Simulates how real humans think, struggle, and give up on your site.`,
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
      instructions: buildServerInstructions(),
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
    { description: `Overview of all ${catalogCounts().tools} CBrowser MCP tools organized by category`, mimeType: "text/plain" },
    async () => ({
      contents: [{
        uri: "docs://tools-overview",
        text: buildToolsOverviewText(),
        mimeType: "text/plain",
      }],
    })
  );

  server.resource(
    "docs://personas",
    "docs://personas",
    { description: `List of ${builtinPersonaCount()} built-in personas`, mimeType: "text/plain" },
    async () => ({
      contents: [{
        uri: "docs://personas",
        text: buildPersonasOverviewText(),
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
    let parsedJson: unknown;
    try {
      parsedJson = body ? JSON.parse(body) : undefined;
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

    // ONE JSON-RPC MESSAGE OBJECT, OR NOTHING IS DISPATCHED.
    //
    // Everything below (the tier check, the charge, the domain gate, the
    // account scope) reads the body as one message. A JSON array is a batch,
    // and the SDK transport ran every element of it: those calls skipped all of
    // the above, were never charged and counted as one request for the rate
    // limit (auth-tenancy-billing-2 and -5, reproduced on 21.4.8 2026-11-12).
    // Refused before anything else, so no transport shape can bypass billing.
    const shapeError = unsupportedBodyShape(parsedJson);
    if (shapeError) {
      console.warn(`[MCP] refused a request body: ${shapeError}`);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: shapeError } }));
      return;
    }
    const parsedBody = parsedJson as Record<string, unknown>;

    // Log request details
    const method = (parsedBody.method as string) || "unknown";
    let logLine = `← ${method}`;
    const params = parsedBody.params as Record<string, unknown> | undefined;

    // The account this request runs as. Resolved here, before any charge, so
    // a call is never charged or run for an account key whose account is not
    // known. The CMS vouching for a key without naming its account used to
    // dispatch the call with no account scope: its browser tokens, saved
    // sessions and personas went to the shared process directory
    // (auth-tenancy-billing-6, 2026-11-12). Callers that are not account keys
    // (the operator key, a local server with no auth) keep running unscoped.
    const scopeAccountId = await resolveRequestAccountId(req);
    if (scopeAccountId === null && extractApiKey(req)?.startsWith("cbk_")) {
      console.warn(`[MCP] ${method}: an account key with no resolvable account; answered 503, nothing run`);
      res.writeHead(503, { "Content-Type": "application/json", "Retry-After": "5" });
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        id: parsedBody.id ?? null,
        error: { code: -32603, message: "Your account could not be looked up right now, so nothing was run. Try again shortly." },
      }));
      return;
    }

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
      // Every URL the call names, not only `url` and `sites[0]` (enterprise-3).
      const requestedUrls = targetUrlsOf(toolArgs);
      const distinctHosts = new Set(requestedUrls.map(gateHost));
      if (distinctHosts.size > MAX_GATED_HOSTS) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          id: parsedBody.id ?? null,
          result: billingErrorResult("too_many_sites", `${toolName} did not run: it names ${distinctHosts.size} different sites, and one call can name at most ${MAX_GATED_HOSTS}. Nothing was charged.`),
        }));
        return;
      }
      // Each URL below costs the box a HEAD chain to a host the caller picks,
      // before any charge. Counting hosts alone let one call name 5,000 paths
      // on one host and have the box send 5,000 requests for free (review of
      // 2026-11-14). So URLs are capped too, before anything is resolved.
      if (requestedUrls.length > MAX_GATED_URLS) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          id: parsedBody.id ?? null,
          result: billingErrorResult("too_many_sites", `${toolName} did not run: it names ${requestedUrls.length} different URLs, and one call can name at most ${MAX_GATED_URLS}. Nothing was charged.`),
        }));
        return;
      }
      // Derived from THIS request, not from the module global — see resolveRequestKeyHash.
      const keyHash = await resolveRequestKeyHash(req);

      // GATE BEFORE CHARGE. The CMS credit catalog and the package's tier catalog
      // are two independent lists, and they disagree: CMS lists
      // agent_ready_audit as a free-tier tool costing 5 credits, while the
      // package gates it as "pro". A free account with credits was therefore
      // debited 5 and then handed the upgrade prompt that createGatedServer had
      // substituted for the handler — paying for an advertisement. Checking
      // accessibility BEFORE the deduct fixes every present and future
      // disagreement between the two lists, not just the one instance we found.
      // (2026-07-26) It also runs before the URLs are resolved, so a call the
      // tier refuses costs the box no outbound request. (2026-11-14)
      if (keyHash && !isToolAccessible(toolName)) {
        console.log(`[Credits] ${toolName}: unavailable at this tier — upgrade prompt returned WITHOUT charging`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          id: parsedBody.id ?? null,
          result: upgradePrompt(toolName),
        }));
        return;
      }

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
      // Each URL is resolved; they are resolved together, so a call naming
      // several waits for the slowest, not their sum.
      //
      // One lookup owner for every URL and hop of this request, so the
      // per-owner share in the system lookup (egress.ts) limits what one call
      // can hold. Each hostedFetch call used to be an owner of its own, and
      // only the process-wide pool bound a call naming many URLs. (review,
      // 2026-11-14)
      const lookupOwner = {};
      const { hostedFetch } = await import("./hosted-fetch.js");
      const ownedFetch = (input: string | URL, init?: RequestInit) =>
        hostedFetch(input, { method: init?.method, redirect: init?.redirect, credentials: init?.credentials, headers: init?.headers, signal: init?.signal, owner: lookupOwner });
      const targetUrls = await Promise.all(requestedUrls.map(async (requestedUrl) => {
        try {
          const { resolveFinalUrl } = await import("./url-resolution.js");
          const r = await resolveFinalUrl(requestedUrl, ownedFetch);
          if (r.hostChanged && !r.error) {
            logLine += ` [redirects ${r.requestedHost} -> ${r.finalHost}, gating on ${r.finalHost}]`;
            console.log(`[Domain] ${toolName}: ${pathForLog(requestedUrl)} resolves to ${pathForLog(r.finalUrl)} after ${r.hops} hop(s); gating on ${r.finalHost}`);
            return r.finalUrl;
          }
          if (r.error) {
            console.log(`[Domain] ${toolName}: could not resolve ${pathForLog(requestedUrl)} (${r.error}); gating on the requested host`);
          }
        } catch (e) {
          console.log(`[Domain] ${toolName}: resolver unavailable (${String(e)}); gating on the requested host`);
        }
        return requestedUrl;
      }));
      // chargedKeyHash/chargedTool (outer scope) get set ONLY when a real deduct
      // succeeded below (a 2xx AND an explicit allowed:true AND a cost), never
      // on the outage allowance. That ran the tool UNBILLED, and entering a
      // charge scope for it would let a later isError refund credits the caller
      // never paid. (P-09, 2026-09-17)

      if (keyHash) {
        // Only an explicit allowed:true from the CMS runs the tool. Every other
        // answer refuses the call, except an unreachable or failing CMS, where
        // the account's small outage allowance decides (see chargeAndGate).
        // Callers with a billing key but no account (none exist today: an
        // account key without an account was answered 503 above) share one
        // allowance, and nothing that identifies the key is logged.
        const who = scopeAccountId !== null ? `account ${scopeAccountId}` : "a caller with no account";
        const outcome = await chargeAndGate(keyHash, toolName, targetUrls, who);
        if ("refusal" in outcome) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            id: parsedBody.id ?? null,
            result: outcome.refusal,
          }));
          return;
        }
        if (outcome.charged) {
          chargedKeyHash = keyHash;
          chargedTool = toolName;
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
    const dispatch = () =>
      scopeAccountId !== null
        ? withPersonaScope(scopeAccountId, () => transport.handleRequest(req, res, parsedBody))
        : transport.handleRequest(req, res, parsedBody);

    // Charge scope: entered ONLY when this request's tool call was actually
    // billed (chargedKeyHash/chargedTool set above, on a real deduct success).
    // The tier-gate wrapper (createGatedServer) reads currentCharge() after the
    // handler returns (or throws) and refunds when the result carries isError:
    // true. An unbilled call (no key, or the outage allowance) enters no scope,
    // so nothing downstream can refund money that was never taken. (P-09, 2026-09-17)
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
  /**
   * false = calls cost no credits (the enterprise server). The CMS gates still run.
   * Default true.
   */
  chargeCredits?: boolean;
}

// Re-export for enterprise use
export type { ToolRegistrationContext };

/**
 * What the remote server checks about its egress rule before it starts, and
 * the one line it logs about it.
 *
 * A hosted server opens only public internet addresses, and never its own
 * (egress.ts). Two settings decide whether that rule can hold, and until
 * 2026-11-12 nothing looked at either before the first tool call (review,
 * regression-9 and policy-4):
 *
 *  - CBROWSER_OWN_ADDRESSES names the addresses that reach this machine
 *    without being on one of its interfaces (Docker, NAT, a load balancer).
 *    An entry that cannot be read makes every address refused, so the server
 *    would start and then fail every page. It stops here instead, with the
 *    variable and the entry named.
 *  - PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK lets chromium reach
 *    this machine's own addresses around the egress gate, so no hosted
 *    browser is started while it is set (openBrowserRoute). The server would
 *    start and then fail every browser launch. It stops here instead.
 *
 * The line gives counts, not addresses: this log is read more widely than
 * the machine's interface list, and the server has no switch for verbose
 * logging. Throws an Error whose message is for the operator.
 */
export function hostedEgressStartupCheck(): string {
  const loopbackSwitch = "PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK";
  if (process.env[loopbackSwitch]) {
    throw new Error(`The remote MCP server was not started: ${loopbackSwitch} is set, and with it chromium connects to this machine's own addresses around the egress gate, so no browser could be started. Unset it and start the server again.`);
  }
  let own: { v4: number; v6: number };
  try {
    own = checkOwnAddressConfig();
  } catch (error) {
    throw new Error(`The remote MCP server was not started: ${error instanceof Error ? error.message : String(error)}`);
  }
  return `Egress: only public internet addresses are opened. Refused as this server's own: ${own.v4} IPv4 and ${own.v6} IPv6 addresses or ranges (interfaces, the kernel's local table, CBROWSER_OWN_ADDRESSES).`;
}

/**
 * Start the remote HTTP MCP server
 * @param options - Optional configuration including tool extension callback
 */
export async function startRemoteMcpServer(options?: RemoteMcpServerOptions): Promise<void> {
  setCreditChargeMode(options?.chargeCredits === false ? "none" : "charge");

  // Auto-initialize all data directories on server start
  ensureDirectories();

  // Session reaper + rate-limit sweeper. Started HERE rather than at module
  // import, so loading this file no longer spins up a Chrome-killing reaper in
  // whatever process happened to import it. See startBackgroundTimers.
  startBackgroundTimers();

  // Enable remote mode for screenshot handling (returns base64 images instead of paths)
  setRemoteMode(true);

  // Hosted input policy: no tool parameter may name a path on this server, and
  // URL parameters must be http(s). Set here, explicitly, because this process
  // runs as root for many accounts; the stdio server and the CLI never set it.
  // (sec-paths, 2026-10-10 security review; see mcp-tools/hosted-inputs.ts)
  setHostedMode(true);

  // The egress rule's own settings, checked before anything listens: a
  // setting that would make every page or every browser fail stops the start
  // here, with the reason (hostedEgressStartupCheck above).
  console.log(hostedEgressStartupCheck());

  const port = parseInt(process.env.PORT || "3000", 10);
  const host = process.env.HOST || "0.0.0.0";
  const sessionMode = process.env.MCP_SESSION_MODE || "stateless";
  const apiKeys = getApiKeys();
  const apiKeyAuthEnabled = apiKeys !== null && apiKeys.size > 0;
  // A server configured for Auth0 still requires authentication, as it did when
  // it accepted Auth0 tokens; it now accepts only API keys (see auth0Configured).
  const auth0Set = auth0Configured();
  // REQUIRE_AUTH=true forces auth even without static API keys (uses cbk_ keys + OAuth)
  const requireAuth = process.env.REQUIRE_AUTH === "true";
  const authEnabled = apiKeyAuthEnabled || auth0Set || requireAuth;
  // In requireAuth mode the server accepts dynamic cbk_ API keys even with no static
  // keys loaded, so API-key auth is genuinely active — advertise it as such in /health.
  const apiKeyAuthAdvertised = apiKeyAuthEnabled || requireAuth || auth0Set;
  console.log(`Starting CBrowser Remote MCP Server v${VERSION}...`);
  console.log(`Mode: ${sessionMode}`);
  console.log(`Auth: ${authEnabled ? "enabled" : "disabled (open access)"}`);
  if (apiKeyAuthEnabled) {
    console.log(`  - API Key auth: enabled (${apiKeys?.size} keys)`);
  }
  if (auth0Set) {
    console.log(`  - AUTH0_DOMAIN is set, but Auth0 tokens are refused: no CBrowser account can be matched to one. Sign-in is by API key and this server's /authorize.`);
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

  // Every HTTP request runs in its own identity context, so the key hash, tier
  // and API key the /mcp branch sets for it belong to it alone. They were module
  // globals, set while the request's server was built and read when its tool
  // ran, several awaits later; an overlapping request from another account
  // overwrote them in between. The context starts as an unauthenticated caller
  // at the deployment's default tier. (sec-identity, 2026-10-10)
  //
  // The routing below runs inside answerRequestSafely, so nothing it throws
  // escapes the listener (see the request guard above). Before 2026-11-12 the
  // listener's promise was left uncaught and one malformed request ended the
  // process.
  installRejectionLogger();
  const routeRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = parseRequestUrl(req);

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
      const body = await readBodyCapped(req, MAX_OAUTH_BODY_BYTES);
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
            signal: AbortSignal.timeout(OAUTH_CMS_TIMEOUT_MS),
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
            signal: AbortSignal.timeout(OAUTH_CMS_TIMEOUT_MS),
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
            signal: AbortSignal.timeout(OAUTH_CMS_TIMEOUT_MS),
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
      const body = await readBodyCapped(req, MAX_OAUTH_BODY_BYTES);
      // A body that starts with "{" went to a bare JSON.parse here, so "{"
      // alone ended the process. (crash hotfix, 2026-11-12)
      const params = parseTokenRequestBody(body, req.headers["content-type"]);
      if (!params) {
        oauthError(res, 400, "invalid_request", "The request body must be form data or a JSON object.");
        return;
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

        // The CMS calls had no try and no time limit: with the CMS down or
        // restarting, one sign-in ended the process; with it hung, the
        // sign-in never answered. Now either is a 503. (crash hotfix, 2026-11-12)
        try {
          if (clientSecret.startsWith("cbk_")) {
            // client_secret is an API key — validate directly
            const valRes = await fetch(`${cmsUrl}/api/accounts/validate-key`, {
              headers: { "X-API-Key": clientSecret },
              signal: AbortSignal.timeout(OAUTH_CMS_TIMEOUT_MS),
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
              signal: AbortSignal.timeout(OAUTH_CMS_TIMEOUT_MS),
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
              signal: AbortSignal.timeout(OAUTH_CMS_TIMEOUT_MS),
            });
            const keyData = await keyRes.json() as { key?: string };
            accessToken = keyData.key || null;
            if (!accessToken) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "server_error", error_description: "Max API keys reached. Delete unused keys at cbrowser.ai/account" }));
              return;
            }
          }
        } catch (err) {
          console.error(`[OAuth] /token: account service unusable: ${describeError(err)}`);
          oauthError(res, 503, "temporarily_unavailable", "The account service could not be reached. Try again shortly.");
          return;
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
          // Auth0 tokens are refused (auth0Configured), so never advertised.
          oauth: false,
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
          oauth: false,
        },
        capabilities: ["navigation", "interaction", "visual-testing", "nlp-testing", "performance"],
      }));
      return;
    }

    // llms.txt - AI-readable documentation (WebMCP standard)
    if (url.pathname === "/llms.txt" || url.pathname === "/.well-known/llms.txt") {
      // Count and category list derived from TOOL_CATEGORIES. The hand-written
      // block said 91 tools, and its per-category numbers did not match the
      // names it listed ("Visual Testing (6)" named five). (B33, 2026-10-10)
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`# CBrowser MCP Server
# AI-powered browser automation with cognitive user simulation

> CBrowser is an MCP server that provides ${catalogCounts().tools} tools for browser automation,
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

## Tool Categories (${catalogCounts().tools} tools)
${TOOL_CATEGORIES.map((cat) => `- ${cat.name} (${cat.tools.length}): ${cat.tools.join(", ")}`).join("\n")}

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

  <h2>Available Tools (${catalogCounts().tools})</h2>
  <p>This server provides ${catalogCounts().tools} MCP tools for browser automation, testing, and analysis.</p>
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

    // OAuth Authorization Server Metadata (RFC 8414)
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      const serverHost = req.headers.host || `${host}:${port}`;
      const protocol = req.headers["x-forwarded-proto"] || "http";
      const baseUrl = `${protocol}://${serverHost}`;

      // Always this server's own /authorize and /token, which hand out cbk_
      // keys. With AUTH0_DOMAIN set this advertised the Auth0 tenant, whose
      // tokens the server now refuses (auth0Configured), so a connector that
      // followed it could never sign in. (2026-11-12)
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

    // Protected Resource Metadata (RFC 9728): the built-in auth server only,
    // for the reason given on the document above.
    if (url.pathname === "/.well-known/oauth-protected-resource") {
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
      return;
    }

    // =====================================================================
    // Protected Endpoints (auth required)
    // =====================================================================

    // Auth check first (we need the tier for rate limiting)
    let requestTier: PricingTier | null = null;
    if (authEnabled) {
      const authResult = await validateAuth(req, apiKeys);
      if (!authResult.valid) {
        // Allow tools/list without auth (discovery surface is public, action surface is gated).
        // Buffer the body to check if this is a tools/list or initialize request.
        if (req.method === "POST" && (url.pathname === "/mcp" || url.pathname === "/")) {
          // Capped like handleMcpRequest's read: this one runs for every
          // rejected caller and buffered whatever it was sent. (crash hotfix, 2026-11-12)
          const bodyStr = await readBodyCapped(req, MAX_REQUEST_BODY_BYTES);
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
      const existingSessionId = sessionIdFromHeader(req.headers["mcp-session-id"]);

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

      // This request's caller, written into its own identity context (entered at
      // createServer above). Set before the transport branch so a reused
      // stateful transport gets it too: that path used to run on whatever the
      // last request to build a server had left in the globals. Building a new
      // server below sets the tier again during registration, as it always did.
      // (sec-identity, 2026-10-10)
      const requestApiKey = extractApiKey(req);
      const resolvedTier = requestApiKey ? await resolveApiKeyTier(requestApiKey) : null;
      // Key hash for usage tracking: a cbk_ key's own hash, or the key an OAuth
      // token was issued for; null otherwise. The same derivation as billing.
      setActiveKeyHash(await resolveRequestKeyHash(req));
      // Raw key for account-scoped features (custom personas, etc.)
      const { setSessionApiKey } = await import("./mcp-tools/base/cognitive-tools.js");
      setSessionApiKey(requestApiKey || undefined);
      setTierGate(effectiveTier(resolvedTier));

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
  };

  const httpServer = createServer((req, res) => {
    void withRequestIdentity(
      { keyHash: null, tier: effectiveTier(null), apiKey: undefined },
      () => answerRequestSafely(req, res, () => routeRequest(req, res)),
    );
  });

  httpServer.listen(port, host, () => { void (async () => {
    console.log(`\nCognitive Browser Remote MCP Server running at http://${host}:${port}`);
    console.log(`\nEndpoints:`);
    console.log(`  MCP:      http://${host}:${port}/mcp`);
    console.log(`  Health:   http://${host}:${port}/health`);
    console.log(`  Info:     http://${host}:${port}/info`);
    if (authEnabled) {
      console.log(`\nAuthentication:`);
      if (apiKeyAuthEnabled) {
        console.log(`  API Key:  Authorization: Bearer <your-api-key>`);
        console.log(`            X-API-Key: <your-api-key>`);
      }
    }
    console.log(`\nFor claude.ai custom connector:`);
    console.log(`  URL: http://${host}:${port}/mcp`);

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
