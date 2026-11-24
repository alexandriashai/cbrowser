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
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CBrowser } from "./browser.js";
import { ensureDirectories } from "./config.js";
// Version from package.json - single source of truth
import { VERSION } from "./version.js";
// Modular MCP tools (v17.5.0)
import { registerAllPublicTools, setRemoteMode, setActiveTier as setTierGate, setActiveKeyHash, getActiveKeyHash } from "./mcp-tools/index.js";
// Shared browser instance (single Chromium process)
let browser = null;
// Stealth state (enterprise integration)
const stealthConfig = null;
// Cached tool manifest for unauthenticated tools/list requests (populated at startup)
let cachedToolManifest = null;
// ============================================================================
// Tool-Level Session Tokens (v18.33.0)
// Provides browser continuity across tool calls without relying on MCP session
// headers. Works with any MCP client including Claude.ai's proxy.
// ============================================================================
const browserTokens = new Map();
const TOKEN_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
/**
 * Generate a short browser token that maps to a session's browser.
 */
export function generateBrowserToken(sessionId) {
    // Short readable token
    const token = `cb_${Math.random().toString(36).substring(2, 10)}`;
    browserTokens.set(token, { sessionId, createdAt: Date.now() });
    return token;
}
/**
 * Resolve a browser token to a session's browser.
 * Falls back to creating a new session if token is invalid/expired.
 */
export async function getBrowserByToken(token) {
    // Clean expired tokens
    const now = Date.now();
    for (const [t, info] of browserTokens) {
        if (now - info.createdAt > TOKEN_EXPIRY_MS)
            browserTokens.delete(t);
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
            // Session expired but token exists — create new session with same ID
            browserTokens.delete(token);
        }
    }
    // No valid token — create new session
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
// Active sessions: sessionId -> SessionInfo
const activeSessions = new Map();
// Track recently expired sessions for clear error messaging
// Sessions stay in this set for 10 minutes after expiry
const expiredSessions = new Map();
const EXPIRED_SESSION_RETENTION_MS = 600000; // 10 min
/**
 * Get or create a session-specific browser instance.
 * Each session gets its own CBrowser with isolated context.
 * If a session expired, transparently create a new one (low-friction reconnect).
 */
async function getSessionBrowser(sessionId) {
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
        throw new Error(`🚫 CBrowser Demo Server at Capacity\n\n` +
            `The demo server currently has ${MAX_CONCURRENT_SESSIONS} active sessions.\n\n` +
            `Please tell the user:\n` +
            `"The CBrowser demo server is currently at full capacity. ` +
            `Please wait a few minutes and try again, or visit https://cbrowser.ai/enterprise for unlimited access."\n\n` +
            `Sessions automatically expire after 5 minutes of inactivity.`);
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
async function cleanupSession(sessionId, reason = "Session ended") {
    const session = activeSessions.get(sessionId);
    if (session) {
        // Capture Chrome PID before closing (for force-kill fallback)
        let chromePid;
        try {
            const browserInstance = session.browser.browser;
            chromePid = browserInstance?.process?.()?.pid;
        }
        catch { /* ignore */ }
        // Graceful close with timeout
        try {
            await Promise.race([
                session.browser.close(),
                new Promise(resolve => setTimeout(resolve, 5000)), // 5s timeout
            ]);
        }
        catch (e) {
            // Ignore cleanup errors
        }
        // Force-kill Chrome if graceful close didn't work
        if (chromePid) {
            try {
                process.kill(chromePid, 0); // Check if still alive
                process.kill(chromePid, "SIGKILL");
                console.log(`[Session] Force-killed Chrome PID ${chromePid} for session ${sessionId.substring(0, 8)}...`);
            }
            catch { /* already dead — good */ }
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
async function getSessionMemoryMB(session) {
    try {
        // CBrowser wraps Playwright - try to get the underlying browser process
        const browserInstance = session.browser.browser;
        if (!browserInstance)
            return null;
        const browserProcess = browserInstance.process?.();
        if (!browserProcess?.pid)
            return null;
        // Read /proc/<pid>/status for RSS memory
        const { readFileSync } = await import("node:fs");
        const status = readFileSync(`/proc/${browserProcess.pid}/status`, "utf-8");
        const rssMatch = status.match(/VmRSS:\s+(\d+)\s+kB/);
        if (rssMatch) {
            return Math.round(parseInt(rssMatch[1], 10) / 1024); // Convert kB to MB
        }
    }
    catch (e) {
        // Process may have exited or not be accessible
    }
    return null;
}
/**
 * Kill orphaned chrome-headless-shell processes not tracked by any active session.
 * These accumulate when clients disconnect abruptly or sessions aren't cleaned up properly.
 */
async function killOrphanedChromeProcesses() {
    try {
        const { execSync } = await import("node:child_process");
        // Get all chrome-headless-shell PIDs on the system
        const output = execSync("pgrep -f chrome-headless-shell 2>/dev/null || true", { encoding: "utf-8" }).trim();
        if (!output)
            return 0;
        const allChromePids = new Set(output.split("\n").map(p => parseInt(p, 10)).filter(p => !isNaN(p)));
        if (allChromePids.size === 0)
            return 0;
        // Collect PIDs tracked by active sessions
        const trackedPids = new Set();
        for (const [, session] of activeSessions) {
            try {
                const browserInstance = session.browser.browser;
                if (browserInstance) {
                    const proc = browserInstance.process?.();
                    if (proc?.pid) {
                        trackedPids.add(proc.pid);
                        // Also add child PIDs (chrome spawns sub-processes)
                        const children = execSync(`pgrep -P ${proc.pid} 2>/dev/null || true`, { encoding: "utf-8" }).trim();
                        if (children) {
                            children.split("\n").forEach(p => { const n = parseInt(p, 10); if (!isNaN(n))
                                trackedPids.add(n); });
                        }
                    }
                }
            }
            catch { /* session browser may not be launched yet */ }
        }
        // Also check the shared browser instance
        if (browser) {
            try {
                const proc = browser.browser?.process?.();
                if (proc?.pid) {
                    trackedPids.add(proc.pid);
                    const children = execSync(`pgrep -P ${proc.pid} 2>/dev/null || true`, { encoding: "utf-8" }).trim();
                    if (children) {
                        children.split("\n").forEach(p => { const n = parseInt(p, 10); if (!isNaN(n))
                            trackedPids.add(n); });
                    }
                }
            }
            catch { /* ignore */ }
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
                }
                catch { /* already dead or inaccessible */ }
            }
        }
        if (killed > 0) {
            console.log(`[Cleanup] Killed ${killed} orphaned chrome processes (${allChromePids.size} total, ${trackedPids.size} tracked)`);
        }
        return killed;
    }
    catch {
        return 0;
    }
}
/**
 * Periodic cleanup of idle sessions, memory hogs, expired session tracking,
 * and orphaned Chrome processes.
 */
setInterval(async () => {
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
    // Kill orphaned Chrome processes every cycle
    await killOrphanedChromeProcesses();
}, 30000); // Check every 30 seconds
/**
 * Legacy getBrowser for backward compatibility (uses shared instance)
 */
async function getBrowser() {
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
const transports = new Map();
// Token cache for Auth0 validation
const tokenCache = new Map();
const TOKEN_CACHE_MARGIN = 60 * 1000; // 1 minute margin before expiry
function getAuth0Config() {
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
async function validateAuth0Token(token) {
    const auth0 = getAuth0Config();
    if (!auth0)
        return null;
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
    }
    catch (jwtError) {
        // If JWT validation fails, try opaque token validation via userinfo
        try {
            const userinfoResponse = await fetch(`https://${auth0.domain}/userinfo`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            if (userinfoResponse.ok) {
                const userinfo = await userinfoResponse.json();
                const payload = {
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
        }
        catch {
            // Opaque token validation also failed
        }
        return null;
    }
}
function getProtectedResourceMetadata() {
    const auth0 = getAuth0Config();
    if (!auth0)
        return null;
    return {
        resource: auth0.audience,
        authorization_servers: [`https://${auth0.domain}`],
        bearer_methods_supported: ["header"],
        scopes_supported: ["openid", "profile", "email"],
    };
}
function getApiKeys() {
    const singleKey = process.env.MCP_API_KEY;
    const multipleKeys = process.env.MCP_API_KEYS;
    if (!singleKey && !multipleKeys) {
        return null;
    }
    const keys = new Set();
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
function validateApiKey(req, validKeys) {
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
const oauthCodes = new Map();
/** Token → key hash map (for session tracking after OAuth) */
const tokenToKeyHash = new Map();
/** Cache resolved tiers by API key hash (5-min TTL) */
const tierCache = new Map();
const TIER_CACHE_TTL_MS = 5 * 60 * 1000;
/**
 * Extract the raw API key from an incoming HTTP request.
 * Checks Authorization: Bearer and X-API-Key headers.
 */
function extractApiKey(req) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer "))
        return authHeader.slice(7);
    const xApiKey = req.headers["x-api-key"];
    if (typeof xApiKey === "string")
        return xApiKey;
    return null;
}
/**
 * Resolve the pricing tier for an API key by calling the CMS backend.
 * Returns null for non-cbk keys (server admin keys pass through as-is).
 * Caches results for 5 minutes.
 */
async function resolveApiKeyTier(apiKey) {
    // Only resolve cbk_ keys (user account keys)
    if (!apiKey.startsWith("cbk_"))
        return null;
    // Check cache
    const { createHash } = await import("crypto");
    const keyHash = createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
    const cached = tierCache.get(keyHash);
    if (cached && cached.expiresAt > Date.now())
        return cached.tier;
    // Call CMS to validate key and get tier
    const cmsUrl = process.env.CMS_URL || "http://localhost:3200";
    try {
        const res = await fetch(`${cmsUrl}/api/accounts/validate-key`, {
            headers: { "X-API-Key": apiKey },
        });
        if (!res.ok)
            return "free"; // Invalid key → free tier
        const data = await res.json();
        if (!data.valid)
            return "free";
        const tier = data.tier || "free";
        tierCache.set(keyHash, { tier, expiresAt: Date.now() + TIER_CACHE_TTL_MS });
        return tier;
    }
    catch {
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
const TIER_RATE_LIMITS = {
    free: { requests: 100, burst: 30 }, // ~12 reconnections/hour
    pro: { requests: 1000, burst: 100 }, // ~125 reconnections/hour
    enterprise: { requests: 0, burst: 0 }, // unlimited (0 = no limit)
};
const RATE_LIMIT_WINDOW_MS = 3600000; // 1 hour
const RATE_LIMIT_BURST_WINDOW_MS = 300000; // 5 minutes
// Rate limit storage: account key hash or IP -> entry
const rateLimitStore = new Map();
function getClientIP(req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string")
        return forwarded.split(",")[0].trim();
    const realIp = req.headers["x-real-ip"];
    if (typeof realIp === "string")
        return realIp.trim();
    return req.socket.remoteAddress || "unknown";
}
/**
 * Check rate limit for a request, keyed by account (API key hash) with tier-based limits.
 * Falls back to IP-based limiting for unauthenticated requests (free tier limits).
 */
function checkRateLimit(req, tier) {
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
    let key;
    if (apiKey) {
        // Use a fast hash of the key for storage
        let hash = 0;
        for (let i = 0; i < apiKey.length; i++) {
            hash = ((hash << 5) - hash + apiKey.charCodeAt(i)) | 0;
        }
        key = `account:${hash}`;
    }
    else {
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
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        entry.requests = entry.requests.filter(t => t > now - RATE_LIMIT_WINDOW_MS);
        if (entry.requests.length === 0 && (now - entry.sessionStart) > RATE_LIMIT_WINDOW_MS * 2) {
            rateLimitStore.delete(key);
        }
    }
}, 10 * 60 * 1000);
async function validateAuth(req, apiKeys, auth0Enabled) {
    // Try static API key first (fastest — for admin/server keys)
    if (apiKeys && validateApiKey(req, apiKeys)) {
        return { valid: true };
    }
    // Try cbk_ account key (validates against CMS)
    const rawKey = extractApiKey(req);
    if (rawKey?.startsWith("cbk_")) {
        const tier = await resolveApiKeyTier(rawKey);
        if (tier)
            return { valid: true };
        return { valid: false, reason: "Invalid or expired API key" };
    }
    // Try Auth0 / OAuth token (includes tokens from our /authorize flow)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        // Check if it's a cbk_ key returned by our OAuth flow
        if (token.startsWith("cbk_")) {
            const tier = await resolveApiKeyTier(token);
            if (tier)
                return { valid: true };
            return { valid: false, reason: "Invalid or expired API key" };
        }
        // Try Auth0 if enabled
        if (auth0Enabled) {
            const payload = await validateAuth0Token(token);
            if (payload)
                return { valid: true };
        }
    }
    return { valid: false, reason: "Authentication required. Get your API key at https://cbrowser.ai/account/register then enter it as the Bearer token when connecting." };
}
function sendUnauthorized(res, message) {
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
function configureMcpTools(server, customRegisterTools, sessionId, resolvedTier) {
    // Create session-aware getBrowser function
    const sessionGetBrowser = sessionId
        ? () => getSessionBrowser(sessionId)
        : getBrowser;
    const context = { getBrowser: sessionGetBrowser, getBrowserByToken };
    // Tier priority: resolved from API key > CBROWSER_TIER env > null (self-hosted, no gating)
    const tier = resolvedTier ?? process.env.CBROWSER_TIER ?? null;
    if (customRegisterTools) {
        // Set tier BEFORE custom registration so createGatedServer uses resolved tier
        setTierGate(tier);
        customRegisterTools(server, context);
    }
    else {
        registerAllPublicTools(server, context, tier);
    }
}
/**
 * Create a configured MCP server instance
 *
 * @param customRegisterTools - Optional custom tool registration
 * @param sessionId - Optional session ID for session isolation
 */
function createMcpServer(customRegisterTools, sessionId, resolvedTier) {
    const server = new McpServer({
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
    }, {
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
• cognitive_effort — 6-layer cognitive transport cost per persona
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
    });
    // Register prompts for common workflows
    server.prompt("audit-site", "Run a comprehensive site audit with empathy, agent-readiness, and visual baseline", async () => ({
        messages: [{
                role: "user",
                content: {
                    type: "text",
                    text: "Please run a comprehensive audit on this site:\n1. Run agent_ready_audit to check AI-friendliness\n2. Run empathy_audit with persona \"cognitive-adhd\" to test accessibility\n3. Run page_understand to analyze the page structure\n4. Summarize the findings with recommendations",
                },
            }],
    }));
    server.prompt("cognitive-journey", "Simulate a user journey with a specific persona and goal", async () => ({
        messages: [{
                role: "user",
                content: {
                    type: "text",
                    text: "Start a cognitive journey simulation. Ask me for:\n1. The URL to test\n2. Which persona to use (first-timer, elderly-user, power-user, etc.)\n3. The goal to accomplish\n\nThen use cognitive_journey_init and simulate step by step.",
                },
            }],
    }));
    server.prompt("security-scan", "Run a security scan on an authorized domain", async () => ({
        messages: [{
                role: "user",
                content: {
                    type: "text",
                    text: "Run a security scan. Ask me for the URL to scan, then use web_security_scan with confirm_authorized=true. Also run security_audit to check MCP tool definitions. Summarize all findings.",
                },
            }],
    }));
    // Register resources
    server.resource("docs://tools-overview", "docs://tools-overview", { description: "Overview of all 105 CBrowser MCP tools organized by category", mimeType: "text/plain" }, async () => ({
        contents: [{
                uri: "docs://tools-overview",
                text: "CBrowser provides 120 MCP tools across 11 categories: Browser Automation, Visual Testing, Cognitive Journeys, Site Knowledge, Accessibility, Persona System, Testing, Performance, Security, Session Management, and Marketing. Visit https://cbrowser.ai/docs/Tools-Overview for the complete reference.",
                mimeType: "text/plain",
            }],
    }));
    server.resource("docs://personas", "docs://personas", { description: "List of 21 built-in personas with cognitive traits", mimeType: "text/plain" }, async () => ({
        contents: [{
                uri: "docs://personas",
                text: "CBrowser includes 21 personas: Cognitive (6): power-user, first-timer, mobile-user, elderly-user, impatient-user, screen-reader-user. Accessibility (11): motor-impairment-tremor, low-vision-magnified, cognitive-adhd, dyslexic-user, deaf-user, elderly-low-vision, color-blind-deuteranopia, autism-spectrum, intellectual-disability, aphasia-receptive, dyscalculia. Emotional (4): anxious-user, confident-user, emotional-user, stoic-user. Each persona has 26 cognitive traits. Visit https://cbrowser.ai/docs/Persona-Index for details.",
                mimeType: "text/plain",
            }],
    }));
    configureMcpTools(server, customRegisterTools, sessionId, resolvedTier);
    return server;
}
/**
 * Handle incoming HTTP MCP request
 */
async function handleMcpRequest(req, res, transport) {
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
        }
        else {
            req.rawHeaders.push("Accept", fixedAccept);
        }
    }
    // Parse body for POST requests
    if (req.method === "POST") {
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(chunk);
        }
        const body = Buffer.concat(chunks).toString("utf-8");
        // Safely parse JSON - reject malformed requests gracefully
        let parsedBody;
        try {
            parsedBody = body ? JSON.parse(body) : undefined;
        }
        catch (parseError) {
            console.error(`Invalid JSON in request body: ${parseError.message}`);
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
        const method = parsedBody?.method || "unknown";
        let logLine = `← ${method}`;
        const params = parsedBody?.params;
        if (method === "tools/call" && params?.name) {
            logLine += ` [${params.name}]`;
            // Deduct credits and enforce domain scoping (blocking for denials)
            const toolName = params.name;
            const toolArgs = params.arguments;
            const targetUrl = (toolArgs?.url || (Array.isArray(toolArgs?.sites) ? toolArgs.sites[0] : "") || "");
            const keyHash = getActiveKeyHash();
            if (keyHash) {
                const cmsUrl = process.env.CMS_URL || "http://localhost:3200";
                const deductParams = new URLSearchParams({
                    key_hash: keyHash,
                    tool: toolName,
                    ...(targetUrl ? { target_url: targetUrl } : {}),
                });
                try {
                    const creditRes = await fetch(`${cmsUrl}/api/credits/deduct?${deductParams}`, { method: "POST" });
                    if (creditRes.ok || creditRes.status === 402 || creditRes.status === 403) {
                        const data = await creditRes.json();
                        if (!data.allowed) {
                            console.log(`[Credits] ${toolName}: DENIED (${data.reason})`);
                            // Block tool execution — return JSON-RPC error to client
                            res.writeHead(200, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({
                                jsonrpc: "2.0",
                                id: parsedBody?.id ?? null,
                                result: {
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
                                },
                            }));
                            return;
                        }
                    }
                }
                catch {
                    // CMS unreachable — allow tool execution (fail open)
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
        const clientSessionId = req.headers["mcp-session-id"];
        if (method !== "initialize" && method !== "notifications/initialized") {
            console.log(`[Session Debug] ${method}: client sent session=${clientSessionId?.substring(0, 8) || "NONE"}, mode=${process.env.MCP_SESSION_MODE || "stateless"}`);
        }
        await transport.handleRequest(req, res, parsedBody);
        const duration = Date.now() - start;
        if (!connectionClosed) {
            console.log(`${logLine} → ${res.statusCode} (${duration}ms)`);
        }
    }
    else {
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
                }
                catch {
                    // Connection already dead
                    clearInterval(keepaliveInterval);
                }
            }
            else {
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
 * Start the remote HTTP MCP server
 * @param options - Optional configuration including tool extension callback
 */
export async function startRemoteMcpServer(options) {
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
    // REQUIRE_AUTH=true forces auth even without static API keys (uses cbk_ keys + OAuth)
    const requireAuth = process.env.REQUIRE_AUTH === "true";
    const authEnabled = apiKeyAuthEnabled || auth0Enabled || requireAuth;
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
            for await (const chunk of req)
                body += chunk;
            const params = new URLSearchParams(body);
            const email = params.get("email") || "";
            const password = params.get("password") || "";
            const redirectUri = params.get("redirect_uri") || "";
            const state = params.get("state") || "";
            const codeChallenge = params.get("code_challenge") || "";
            // Build authorize URL for error redirects
            const errorRedirect = (msg) => {
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
            if (!email || !password) {
                errorRedirect("Email and password required");
                return;
            }
            // Validate against CMS
            const cmsUrl = process.env.CMS_URL || "http://localhost:3200";
            try {
                let apiKey;
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
                }
                else {
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
                    const loginData = await loginRes.json();
                    // Generate or get API key for this account
                    const keyRes = await fetch(`${cmsUrl}/api/accounts/keys?name=Claude+MCP`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${loginData.token}` },
                    });
                    const keyData = await keyRes.json();
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
            }
            catch {
                errorRedirect("Authentication service unavailable");
            }
            return;
        }
        // POST /token — exchange auth code for API key (bearer token)
        if (url.pathname === "/token" && req.method === "POST") {
            let body = "";
            for await (const chunk of req)
                body += chunk;
            let params;
            if (body.startsWith("{")) {
                const json = JSON.parse(body);
                params = new URLSearchParams(json);
            }
            else {
                params = new URLSearchParams(body);
            }
            const grantType = params.get("grant_type");
            let accessToken = null;
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
                // Verify PKCE
                if (stored.codeChallenge && codeVerifier) {
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
            }
            else if (grantType === "client_credentials") {
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
                }
                else {
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
                    const loginData = await loginRes.json();
                    // Generate API key for this session
                    const keyRes = await fetch(`${cmsUrl}/api/accounts/keys?name=Claude+Session`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${loginData.token}` },
                    });
                    const keyData = await keyRes.json();
                    accessToken = keyData.key || null;
                    if (!accessToken) {
                        res.writeHead(400, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: "server_error", error_description: "Max API keys reached. Delete unused keys at cbrowser.ai/account" }));
                        return;
                    }
                }
            }
            else {
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
- GitHub: https://github.com/wyldfyre-ai/cbrowser
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
    <li><a href="https://github.com/wyldfyre-ai/cbrowser">GitHub Repository</a></li>
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
        if (url.pathname === "/.well-known/oauth-authorization-server" && !auth0Enabled) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                error: "No OAuth server configured",
                message: "Authenticate with a Bearer token. Get your API key at https://cbrowser.ai/account/register",
            }));
            return;
        }
        if (url.pathname === "/.well-known/oauth-protected-resource") {
            const metadata = getProtectedResourceMetadata();
            if (metadata) {
                // Full OAuth configured
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify(metadata));
            }
            else {
                // No OAuth provider — advertise API key auth only
                // Claude.ai will prompt user for Bearer token (their cbk_ API key)
                const serverHost = req.headers.host || `${host}:${port}`;
                const protocol = req.headers["x-forwarded-proto"] || "http";
                const baseUrl = `${protocol}://${serverHost}`;
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    resource: baseUrl,
                    authorization_servers: [],
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
        let requestTier = null;
        if (authEnabled) {
            const authResult = await validateAuth(req, apiKeys, auth0Enabled);
            if (!authResult.valid) {
                // Allow tools/list without auth (discovery surface is public, action surface is gated).
                // Buffer the body to check if this is a tools/list or initialize request.
                if (req.method === "POST" && (url.pathname === "/mcp" || url.pathname === "/")) {
                    const bodyChunks = [];
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
                                    capabilities: { tools: { listChanged: false } },
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
                    }
                    catch {
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
            const existingSessionId = req.headers["mcp-session-id"];
            let transport;
            let browserSessionId;
            // First, determine the browser session ID (independent of transport mode)
            // Always prefer client's session ID for browser continuity
            let sessionSource;
            if (existingSessionId && activeSessions.has(existingSessionId)) {
                // Reuse existing browser session
                browserSessionId = existingSessionId;
                sessionSource = "reused";
                const session = activeSessions.get(browserSessionId);
                if (session) {
                    session.lastActivity = Date.now();
                }
            }
            else if (existingSessionId) {
                // Client has a session ID but we don't have a browser for it yet
                // Use their ID to create a new browser session (enables session continuity)
                browserSessionId = existingSessionId;
                sessionSource = "client-new";
            }
            else {
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
                transport = transports.get(existingSessionId);
                console.log(`[Transport] Reusing cached transport for ${existingSessionId.substring(0, 8)}...`);
            }
            else {
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
                }
                else if (requestApiKey) {
                    // Check token→keyHash map (OAuth tokens that aren't raw cbk_ keys)
                    const mapped = tokenToKeyHash.get(requestApiKey);
                    if (mapped && mapped.expiresAt > Date.now()) {
                        setActiveKeyHash(mapped.keyHash);
                    }
                    else {
                        setActiveKeyHash(null);
                    }
                }
                else {
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
                }
                else {
                    // For stateless mode, clean up idle sessions (the 30s interval handles this)
                    // Don't aggressively clean on transport close since Claude.ai sends rapid sequential requests
                    transport.onclose = async () => {
                        // Mark the session so the periodic cleanup can evaluate it
                        // The 30s cleanup interval will handle actual cleanup after idle timeout
                    };
                }
                // Add error handling for transport errors
                transport.onerror = (error) => {
                    console.error(`[MCP Transport Error] ${error.message}`);
                };
            }
            // Handle the request with error wrapping
            try {
                await handleMcpRequest(req, res, transport);
            }
            catch (error) {
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
        // Cache tool manifest for unauthenticated tools/list (discovery surface is public).
        // Create a temporary server to extract the registered tool list directly.
        // Tool registration works without a browser — only tool execution needs one.
        try {
            const dummyContext = { getBrowser: () => null };
            const tempServer = createMcpServer(options?.registerTools, "manifest-cache", null);
            const toolMap = tempServer._registeredTools;
            if (toolMap && typeof toolMap === "object") {
                cachedToolManifest = Object.entries(toolMap)
                    .filter(([, tool]) => tool.enabled !== false)
                    .map(([name, tool]) => ({
                    name,
                    description: tool.description || "",
                    inputSchema: tool.inputSchema || { type: "object" },
                }));
                console.log(`[tools/list] Public manifest cached: ${cachedToolManifest.length} tools`);
            }
        }
        catch (err) {
            console.log(`[tools/list] Direct cache failed, will cache on first authenticated request`);
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
//# sourceMappingURL=mcp-server-remote.js.map