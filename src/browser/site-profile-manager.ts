/**
 * CBrowser - Site Profile Manager
 * Persistent browser profiles per site with encrypted credential storage.
 * Auto-saves cookies/localStorage on close, auto-restores on reconnection.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 * @since v18.35.0
 */

import { readFile, writeFile, mkdir, readdir, rm, stat, chmod } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { homedir, hostname } from "os";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "crypto";
import type { BrowserContext, Page } from "playwright";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SiteProfile {
  domain: string;
  created: string;
  lastUsed: string;
  cookieCount: number;
  localStorageKeys: number;
  lastUrl: string;
  authStatus: "unknown" | "authenticated" | "expired" | "none";
  profileVersion: number;
}

export interface ProfileLoadResult {
  success: boolean;
  domain: string;
  cookiesRestored: number;
  storageKeysRestored: number;
  sessionValid: boolean;
  message: string;
}

export interface SessionValidity {
  valid: boolean;
  reason: "active" | "expired" | "redirected" | "unknown";
  redirectedTo?: string;
}

export interface SiteProfileSummary {
  domain: string;
  lastUsed: string;
  cookieCount: number;
  authStatus: string;
  sizeBytes: number;
  healthy: boolean;
  /**
   * Whether a profile exists at all.
   *
   * Without this, a domain that was never profiled returned exactly what a
   * CORRUPTED profile returns — zeros, "unknown", healthy: false — so "you
   * have not created this yet" and "this is broken, investigate" were the same
   * response. They call for opposite actions. (2026-07-29)
   */
  exists: boolean;
  /** Why `healthy` is what it is, so a caller does not have to guess. */
  status: "missing" | "healthy" | "expired" | "incomplete" | "unreadable";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Paths that indicate a login/auth redirect */
const LOGIN_PATH_PATTERNS = [
  "/login",
  "/signin",
  "/sign-in",
  "/auth",
  "/sso",
  "/oauth",
  "/accounts/login",
  "/session/new",
];

/** Current profile data format version */
const PROFILE_VERSION = 1;

/** File permission: owner read/write only */
const FILE_MODE = 0o600;

// ---------------------------------------------------------------------------
// SiteProfileManager
// ---------------------------------------------------------------------------

export class SiteProfileManager {
  private profileDir: string;

  /** Max profile age for auto-restore (24 hours default) */
  static readonly MAX_PROFILE_AGE_MS = 24 * 60 * 60 * 1000;

  constructor(dataDir?: string) {
    const baseDir =
      dataDir || process.env.CBROWSER_DATA_DIR || join(homedir(), ".cbrowser");
    this.profileDir = join(baseDir, "site-profiles");
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Save the current browser context state for a domain.
   *
   * Persists cookies (AES-256-GCM encrypted), localStorage, and metadata
   * so the session can be restored on the next connection to the same site.
   */
  async saveProfile(
    domain: string,
    context: BrowserContext,
    lastUrl: string,
  ): Promise<SiteProfile> {
    const domainDir = this.domainDir(domain);
    await mkdir(domainDir, { recursive: true });

    // -- Cookies (encrypted) -----------------------------------------------
    const cookies = await context.cookies();
    const cookiesJson = JSON.stringify(cookies);
    const encryptedCookies = this.encrypt(cookiesJson);
    await this.writeSecure(
      join(domainDir, "cookies.enc.json"),
      encryptedCookies,
    );

    // -- localStorage (plain — no credentials) -----------------------------
    const storageData = await this.extractLocalStorage(context);
    await this.writeSecure(
      join(domainDir, "storage.json"),
      JSON.stringify(storageData, null, 2),
    );

    // -- Auth status heuristic ---------------------------------------------
    const authStatus = this.inferAuthStatus(cookies, lastUrl);

    // -- Metadata ----------------------------------------------------------
    const now = new Date().toISOString();
    const existingMeta = await this.readMeta(domain);

    const meta: SiteProfile = {
      domain,
      created: existingMeta?.created ?? now,
      lastUsed: now,
      cookieCount: cookies.length,
      localStorageKeys: Object.keys(storageData).length,
      lastUrl,
      authStatus,
      profileVersion: PROFILE_VERSION,
    };

    await this.writeSecure(
      join(domainDir, "meta.json"),
      JSON.stringify(meta, null, 2),
    );

    // -- State snapshot -----------------------------------------------------
    const state = {
      lastUrl,
      timestamp: now,
      authStatus,
    };
    await this.writeSecure(
      join(domainDir, "state.json"),
      JSON.stringify(state, null, 2),
    );

    return meta;
  }

  /**
   * Restore a previously saved profile into the current browser context.
   *
   * Checks profile age (default 24 h), decrypts cookies, and restores
   * localStorage if a page is available.
   */
  async loadProfile(
    domain: string,
    context: BrowserContext,
    page?: Page,
  ): Promise<ProfileLoadResult> {
    const domainDir = this.domainDir(domain);

    // -- Existence check ---------------------------------------------------
    if (!existsSync(domainDir)) {
      return this.loadResult(domain, false, 0, 0, false, "No profile found");
    }

    // -- Age check ---------------------------------------------------------
    const meta = await this.readMeta(domain);
    if (meta) {
      const age = Date.now() - new Date(meta.lastUsed).getTime();
      if (age > SiteProfileManager.MAX_PROFILE_AGE_MS) {
        return this.loadResult(
          domain,
          false,
          0,
          0,
          false,
          `Profile expired (${Math.round(age / 3600000)}h old, max ${SiteProfileManager.MAX_PROFILE_AGE_MS / 3600000}h)`,
        );
      }
    }

    // -- Cookies -----------------------------------------------------------
    let cookiesRestored = 0;
    try {
      const encData = await readFile(
        join(domainDir, "cookies.enc.json"),
        "utf-8",
      );
      const decrypted = this.decrypt(encData);
      const cookies = JSON.parse(decrypted);

      if (Array.isArray(cookies) && cookies.length > 0) {
        // Filter out expired cookies before restoring
        const now = Math.floor(Date.now() / 1000);
        const validCookies = cookies.filter(
          (c: { expires?: number }) =>
            c.expires === undefined || c.expires === -1 || c.expires > now,
        );
        if (validCookies.length > 0) {
          await context.addCookies(validCookies);
        }
        cookiesRestored = validCookies.length;
      }
    } catch (err) {
      console.debug(
        `[SiteProfileManager] Cookie restore failed for ${domain}: ${(err as Error).message}`,
      );
    }

    // -- localStorage ------------------------------------------------------
    let storageKeysRestored = 0;
    if (page) {
      try {
        const storageRaw = await readFile(
          join(domainDir, "storage.json"),
          "utf-8",
        );
        const storageData: Record<string, string> = JSON.parse(storageRaw);
        const keys = Object.keys(storageData);

        if (keys.length > 0) {
          await page.evaluate((data: Record<string, string>) => {
            for (const [key, value] of Object.entries(data)) {
              try {
                window.localStorage.setItem(key, value);
              } catch {
                // Storage quota or security — skip this key
              }
            }
          }, storageData);
          storageKeysRestored = keys.length;
        }
      } catch (err) {
        console.debug(
          `[SiteProfileManager] Storage restore failed for ${domain}: ${(err as Error).message}`,
        );
      }
    }

    const sessionValid = cookiesRestored > 0 || storageKeysRestored > 0;
    const message = sessionValid
      ? `Restored ${cookiesRestored} cookies and ${storageKeysRestored} storage keys`
      : "Profile loaded but no session data was restorable";

    return this.loadResult(
      domain,
      true,
      cookiesRestored,
      storageKeysRestored,
      sessionValid,
      message,
    );
  }

  /**
   * List all saved site profiles with summary information.
   */
  async listProfiles(): Promise<SiteProfileSummary[]> {
    if (!existsSync(this.profileDir)) {
      return [];
    }

    const entries = await readdir(this.profileDir, { withFileTypes: true });
    const summaries: SiteProfileSummary[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      try {
        const summary = await this.getProfileHealth(entry.name);
        summaries.push(summary);
      } catch {
        // Corrupted profile directory — skip
        summaries.push({
          domain: entry.name,
          lastUsed: "unknown",
          cookieCount: 0,
          authStatus: "unknown",
          sizeBytes: 0,
          healthy: false,
          // The directory IS there — it just could not be read. That is a real
          // profile in trouble, not an absent one.
          exists: true,
          status: "unreadable",
        });
      }
    }

    // Sort by lastUsed descending (most recent first)
    return summaries.sort((a, b) => {
      if (a.lastUsed === "unknown") return 1;
      if (b.lastUsed === "unknown") return -1;
      return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
    });
  }

  /**
   * Delete a site profile and all its data.
   */
  async deleteProfile(domain: string): Promise<boolean> {
    const domainDir = this.domainDir(domain);
    if (!existsSync(domainDir)) {
      return false;
    }
    await rm(domainDir, { recursive: true, force: true });
    return true;
  }

  /**
   * Check whether the current page session is still valid.
   *
   * Detects login redirects and login forms to determine if the
   * previously restored session has expired.
   */
  async checkSessionValidity(
    page: Page,
    domain: string,
  ): Promise<SessionValidity> {
    try {
      const currentUrl = page.url();

      // Blank or error pages are unknown
      if (!currentUrl || currentUrl === "about:blank") {
        return { valid: false, reason: "unknown" };
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(currentUrl);
      } catch {
        return { valid: false, reason: "unknown" };
      }

      // Check if we were redirected to a different domain
      const currentDomain = parsedUrl.hostname;
      if (currentDomain !== domain && !currentDomain.endsWith(`.${domain}`)) {
        return {
          valid: false,
          reason: "redirected",
          redirectedTo: currentUrl,
        };
      }

      // Check if URL path contains login-related segments
      const path = parsedUrl.pathname.toLowerCase();
      const isLoginPath = LOGIN_PATH_PATTERNS.some((pattern) =>
        path.includes(pattern),
      );

      if (isLoginPath) {
        return {
          valid: false,
          reason: "expired",
          redirectedTo: currentUrl,
        };
      }

      // Check for login forms on the page
      const hasLoginForm = await page
        .evaluate(() => {
          // Look for forms containing password inputs
          const passwordInputs = document.querySelectorAll(
            'input[type="password"]',
          );
          if (passwordInputs.length > 0) {
            // Check if any password input is visible
            for (let i = 0; i < passwordInputs.length; i++) {
              const el = passwordInputs[i] as HTMLInputElement;
              const rect = el.getBoundingClientRect();
              // Only count visible password fields
              if (rect.width > 0 && rect.height > 0) {
                return true;
              }
            }
          }
          return false;
        })
        .catch(() => false);

      if (hasLoginForm) {
        return { valid: false, reason: "expired" };
      }

      return { valid: true, reason: "active" };
    } catch {
      return { valid: false, reason: "unknown" };
    }
  }

  /**
   * Get health and summary information for a single domain profile.
   */
  async getProfileHealth(domain: string): Promise<SiteProfileSummary> {
    const domainDir = this.domainDir(domain);
    const metaPath = join(domainDir, "meta.json");

    const defaultSummary: SiteProfileSummary = {
      domain,
      lastUsed: "unknown",
      cookieCount: 0,
      authStatus: "unknown",
      sizeBytes: 0,
      healthy: false,
      exists: false,
      status: "unreadable",
    };

    if (!existsSync(metaPath)) {
      return { ...defaultSummary, status: "missing" };
    }

    try {
      const metaRaw = await readFile(metaPath, "utf-8");
      const meta: SiteProfile = JSON.parse(metaRaw);

      // Compute total profile size
      const totalSize = await this.computeDirSize(domainDir);

      // Check cookie freshness
      const age = Date.now() - new Date(meta.lastUsed).getTime();
      const isExpired = age > SiteProfileManager.MAX_PROFILE_AGE_MS;

      // Verify required files exist
      const hasCookies = existsSync(join(domainDir, "cookies.enc.json"));
      const hasState = existsSync(join(domainDir, "state.json"));

      const healthy = !isExpired && hasCookies && hasState;
      const status: SiteProfileSummary["status"] = healthy
        ? "healthy"
        : isExpired
          ? "expired"
          : "incomplete";

      return {
        domain: meta.domain,
        lastUsed: meta.lastUsed,
        cookieCount: meta.cookieCount,
        authStatus: isExpired ? "expired" : meta.authStatus,
        sizeBytes: totalSize,
        healthy,
        exists: true,
        status,
      };
    } catch {
      // meta.json is present but unparseable — the profile exists and is broken.
      return { ...defaultSummary, exists: true, status: "unreadable" };
    }
  }

  // -------------------------------------------------------------------------
  // Encryption
  // -------------------------------------------------------------------------

  /**
   * Derive a machine-bound encryption key from hostname, home directory,
   * and a fixed salt. This ties profiles to the machine they were created on.
   */
  private getEncryptionKey(): Buffer {
    const material = `cbrowser-profile-${hostname()}-${homedir()}-v1`;
    return createHash("sha256").update(material).digest();
  }

  /**
   * Encrypt a string with AES-256-GCM.
   * Returns a JSON string containing { iv, authTag, data }.
   */
  private encrypt(data: string): string {
    const key = this.getEncryptionKey();
    const iv = randomBytes(12); // 96-bit IV for GCM
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(data, "utf8", "base64");
    encrypted += cipher.final("base64");
    const authTag = cipher.getAuthTag();
    return JSON.stringify({
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      data: encrypted,
    });
  }

  /**
   * Decrypt an AES-256-GCM encrypted JSON envelope.
   * Throws on tampered or corrupted data (GCM auth tag verification).
   */
  private decrypt(encryptedJson: string): string {
    const parsed = JSON.parse(encryptedJson);
    const { iv, authTag, data } = parsed as {
      iv: string;
      authTag: string;
      data: string;
    };
    const key = this.getEncryptionKey();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(authTag, "base64"));
    let decrypted = decipher.update(data, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Get the filesystem path for a domain's profile directory. */
  private domainDir(domain: string): string {
    // Sanitize domain for filesystem safety
    const safeDomain = domain.replace(/[^a-zA-Z0-9._-]/g, "_");
    // "." and ".." pass the character filter and name the profile root and
    // the data directory above it, so deleteProfile("..") (site_profile_delete)
    // removed the whole data directory; "" named the profile root. A domain is
    // one path segment inside site-profiles, or it is refused.
    // (tenant, 2026-10-10)
    if (safeDomain === "" || safeDomain === "." || safeDomain === "..") {
      throw new Error(`Invalid domain "${domain}": a site profile is named by a host name`);
    }
    return join(this.profileDir, safeDomain);
  }

  /** Write data to a file with restricted permissions (0o600). */
  private async writeSecure(filePath: string, data: string): Promise<void> {
    await writeFile(filePath, data, { encoding: "utf-8", mode: FILE_MODE });
    // Ensure permissions even if file existed with different mode
    await chmod(filePath, FILE_MODE);
  }

  /** Read meta.json for a domain, returning null if missing or corrupt. */
  private async readMeta(domain: string): Promise<SiteProfile | null> {
    const metaPath = join(this.domainDir(domain), "meta.json");
    try {
      const raw = await readFile(metaPath, "utf-8");
      return JSON.parse(raw) as SiteProfile;
    } catch {
      return null;
    }
  }

  /**
   * Extract localStorage from all pages in the context.
   * Falls back gracefully if pages are inaccessible.
   */
  private async extractLocalStorage(
    context: BrowserContext,
  ): Promise<Record<string, string>> {
    const pages = context.pages();
    // Use the first available page
    const page = pages.find((p) => {
      try {
        const url = p.url();
        return url && url !== "about:blank" && !url.startsWith("chrome");
      } catch {
        return false;
      }
    });

    if (!page) return {};

    try {
      return await page.evaluate(() => {
        const data: Record<string, string> = {};
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key) {
            data[key] = window.localStorage.getItem(key) || "";
          }
        }
        return data;
      });
    } catch (err) {
      console.debug(
        `[SiteProfileManager] localStorage extraction failed: ${(err as Error).message}`,
      );
      return {};
    }
  }

  /**
   * Infer authentication status from cookies and the last visited URL.
   * Simple heuristic: presence of session-like cookies suggests authentication.
   */
  private inferAuthStatus(
    cookies: Array<{ name: string; value: string }>,
    lastUrl: string,
  ): SiteProfile["authStatus"] {
    // Check URL for login pages
    try {
      const path = new URL(lastUrl).pathname.toLowerCase();
      if (LOGIN_PATH_PATTERNS.some((p) => path.includes(p))) {
        return "none";
      }
    } catch {
      // Invalid URL — can't determine from path
    }

    if (cookies.length === 0) {
      return "none";
    }

    // Look for common session cookie patterns
    const sessionCookieNames = [
      "session",
      "sid",
      "token",
      "auth",
      "jwt",
      "access_token",
      "refresh_token",
      "PHPSESSID",
      "JSESSIONID",
      "connect.sid",
      "_session",
      "laravel_session",
      "rack.session",
      "user",
    ];

    const hasSessionCookie = cookies.some((c) => {
      const name = c.name.toLowerCase();
      return sessionCookieNames.some(
        (pattern) =>
          name === pattern.toLowerCase() ||
          name.includes(pattern.toLowerCase()),
      );
    });

    return hasSessionCookie ? "authenticated" : "unknown";
  }

  /** Compute total size of all files in a directory (non-recursive). */
  private async computeDirSize(dirPath: string): Promise<number> {
    try {
      const entries = await readdir(dirPath);
      let total = 0;
      for (const entry of entries) {
        try {
          const s = await stat(join(dirPath, entry));
          if (s.isFile()) {
            total += s.size;
          }
        } catch {
          // Skip inaccessible files
        }
      }
      return total;
    } catch {
      return 0;
    }
  }

  /** Build a ProfileLoadResult object. */
  private loadResult(
    domain: string,
    success: boolean,
    cookiesRestored: number,
    storageKeysRestored: number,
    sessionValid: boolean,
    message: string,
  ): ProfileLoadResult {
    return {
      success,
      domain,
      cookiesRestored,
      storageKeysRestored,
      sessionValid,
      message,
    };
  }
}
