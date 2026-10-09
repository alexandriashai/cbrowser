/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */


/**
 * Session Manager - Handles browser session persistence
 *
 * Extracted from CBrowser class for better modularity.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from "fs";
import { join, resolve, sep } from "path";
import type { Page, BrowserContext, Cookie } from "playwright";
import type { SavedSession, LoadSessionResult, SessionMetadata } from "../types.js";
import { navigationError } from "../navigation-errors.js";

export interface SessionManagerConfig {
  sessionsDir: string;
  viewportWidth: number;
  viewportHeight: number;
  verbose?: boolean;
}

/**
 * Manages browser session persistence - save, load, list, delete sessions.
 */
/**
 * A session name that is safe to turn into a filename.
 *
 * Session names arrive from MCP tool arguments (`save_session`, `load_session`,
 * `delete_session`, export/import), whose schemas were a bare `z.string()`. Those
 * tools are priced `free`, and the remote server registers them for every caller,
 * and `join()` does not constrain its input, so a crafted name resolved outside
 * the sessions directory entirely — an arbitrary `.json` write on save and an
 * arbitrary `.json` unlink on delete, reachable by any caller. (2026-07-26)
 */
const SAFE_SESSION_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export class SessionManager {
  private config: SessionManagerConfig;

  constructor(config: SessionManagerConfig) {
    this.config = config;
  }

  /**
   * Resolve a session name to its file path, refusing anything that escapes.
   *
   * Two independent checks, because either alone has been enough to miss a
   * bypass elsewhere: the name must match a conservative allowlist, AND the
   * resolved path must still sit inside sessionsDir. Every path built from a
   * caller-supplied name goes through here — the six call sites that each
   * open-coded `join(sessionsDir, name + ".json")` are the class this closes.
   */
  private sessionPathFor(name: string): string {
    if (!SAFE_SESSION_NAME.test(name)) {
      throw new Error(
        `Invalid session name ${JSON.stringify(name)} — use letters, digits, dot, dash or underscore (max 64 chars).`,
      );
    }
    const dir = resolve(this.config.sessionsDir);
    const path = resolve(join(dir, `${name}.json`));
    if (path !== join(dir, `${name}.json`) || !path.startsWith(dir + sep)) {
      throw new Error(`Invalid session name ${JSON.stringify(name)} — resolves outside the sessions directory.`);
    }
    return path;
  }

  /**
   * Save the current session to disk.
   */
  async save(
    name: string,
    page: Page,
    context: BrowserContext
  ): Promise<void> {
    const cookies = await context.cookies();
    let localStorage: Record<string, string> = {};
    try {
      localStorage = await page.evaluate(() => {
        const data: Record<string, string> = {};
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key) data[key] = window.localStorage.getItem(key) || "";
        }
        return data;
      });
    } catch (e) {
      console.debug(`[CBrowser] localStorage inaccessible: ${(e as Error).message}`);
    }

    let sessionStorage: Record<string, string> = {};
    try {
      sessionStorage = await page.evaluate(() => {
        const data: Record<string, string> = {};
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const key = window.sessionStorage.key(i);
          if (key) data[key] = window.sessionStorage.getItem(key) || "";
        }
        return data;
      });
    } catch (e) {
      console.debug(`[CBrowser] sessionStorage inaccessible: ${(e as Error).message}`);
    }

    const url = page.url();
    const domain = new URL(url).hostname;

    const session: SavedSession = {
      name,
      created: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      domain,
      url,
      viewport: {
        width: this.config.viewportWidth,
        height: this.config.viewportHeight,
      },
      cookies: cookies as SavedSession["cookies"],
      localStorage,
      sessionStorage,
    };

    const sessionPath = this.sessionPathFor(name);
    writeFileSync(sessionPath, JSON.stringify(session, null, 2));
  }

  /**
   * Load a saved session from disk.
   */
  async load(
    name: string,
    page: Page,
    context: BrowserContext
  ): Promise<LoadSessionResult> {
    const sessionPath = this.sessionPathFor(name);

    if (!existsSync(sessionPath)) {
      return {
        success: false,
        name,
        cookiesRestored: 0,
        localStorageKeysRestored: 0,
        sessionStorageKeysRestored: 0,
      };
    }

    const session: SavedSession = JSON.parse(readFileSync(sessionPath, "utf-8"));

    const result: LoadSessionResult = {
      success: true,
      name,
      cookiesRestored: session.cookies.length,
      localStorageKeysRestored: Object.keys(session.localStorage).length,
      sessionStorageKeysRestored: Object.keys(session.sessionStorage).length,
    };

    // Cross-domain warning
    const currentUrl = page.url();
    if (currentUrl && currentUrl !== "about:blank") {
      try {
        const currentDomain = new URL(currentUrl).hostname;
        if (session.domain && currentDomain !== session.domain) {
          result.warning = `Session '${name}' was saved for ${session.domain} but current page is ${currentDomain}. Some cookies may not apply.`;
        }
      } catch (e) {
        console.debug(`[CBrowser] URL parsing failed: ${(e as Error).message}`);
      }
    }

    // Restore cookies
    if (session.cookies.length > 0) {
      await context.addCookies(session.cookies as Cookie[]);
    }

    // Navigate to saved URL (a failed load in plain words, not the raw Playwright error)
    await page.goto(session.url, { waitUntil: "networkidle" })
      .catch((e: unknown) => { throw navigationError(e, session.url); });

    // Restore localStorage
    await page.evaluate((data) => {
      for (const [key, value] of Object.entries(data)) {
        window.localStorage.setItem(key, value);
      }
    }, session.localStorage);

    // Restore sessionStorage
    await page.evaluate((data) => {
      for (const [key, value] of Object.entries(data)) {
        window.sessionStorage.setItem(key, value);
      }
    }, session.sessionStorage);

    // Refresh to apply storage
    await page.reload({ waitUntil: "networkidle" });

    // Update lastUsed
    session.lastUsed = new Date().toISOString();
    writeFileSync(sessionPath, JSON.stringify(session, null, 2));

    return result;
  }

  /**
   * List all saved session names.
   */
  list(): string[] {
    const files = readdirSync(this.config.sessionsDir);
    return files
      .filter((f) => f.endsWith(".json") && f !== "last-session.json")
      .map((f) => f.replace(".json", ""));
  }

  /**
   * List all saved sessions with rich metadata.
   */
  listDetailed(): SessionMetadata[] {
    const files = readdirSync(this.config.sessionsDir);
    const sessions: SessionMetadata[] = [];

    for (const file of files) {
      if (!file.endsWith(".json") || file === "last-session.json") continue;
      const filePath = join(this.config.sessionsDir, file);
      try {
        const data: SavedSession = JSON.parse(readFileSync(filePath, "utf-8"));
        const stats = statSync(filePath);
        sessions.push({
          name: data.name || file.replace(".json", ""),
          created: data.created,
          lastUsed: data.lastUsed,
          domain: data.domain,
          url: data.url,
          cookies: data.cookies?.length || 0,
          localStorageKeys: Object.keys(data.localStorage || {}).length,
          sessionStorageKeys: Object.keys(data.sessionStorage || {}).length,
          sizeBytes: stats.size,
        });
      } catch (e) {
        if (this.config.verbose) {
          console.debug(`[CBrowser] Skipping malformed session file ${file}: ${(e as Error).message}`);
        }
      }
    }

    return sessions.sort(
      (a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
    );
  }

  /**
   * Get detailed info for a single session.
   */
  getDetails(name: string): SavedSession | null {
    const sessionPath = this.sessionPathFor(name);
    if (!existsSync(sessionPath)) return null;
    try {
      return JSON.parse(readFileSync(sessionPath, "utf-8"));
    } catch (e) {
      if (this.config.verbose) {
        console.debug(`[CBrowser] Failed to load session ${name}: ${(e as Error).message}`);
      }
      return null;
    }
  }

  /**
   * Delete a saved session.
   */
  delete(name: string): boolean {
    const sessionPath = this.sessionPathFor(name);
    if (existsSync(sessionPath)) {
      unlinkSync(sessionPath);
      return true;
    }
    return false;
  }

  /**
   * Delete sessions older than a given number of days.
   */
  cleanup(olderThanDays: number): { deleted: string[]; kept: string[] } {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const deleted: string[] = [];
    const kept: string[] = [];

    const files = readdirSync(this.config.sessionsDir);
    for (const file of files) {
      if (!file.endsWith(".json") || file === "last-session.json") continue;
      const filePath = join(this.config.sessionsDir, file);
      const name = file.replace(".json", "");
      try {
        const data: SavedSession = JSON.parse(readFileSync(filePath, "utf-8"));
        const lastUsed = new Date(data.lastUsed).getTime();
        if (lastUsed < cutoff) {
          unlinkSync(filePath);
          deleted.push(name);
        } else {
          kept.push(name);
        }
      } catch (e) {
        console.debug(`[CBrowser] Session cleanup error for ${name}: ${(e as Error).message}`);
        kept.push(name);
      }
    }

    return { deleted, kept };
  }

  /**
   * Export a session to a portable JSON file.
   */
  export(name: string, outputPath: string): boolean {
    const sessionPath = this.sessionPathFor(name);
    if (!existsSync(sessionPath)) return false;
    const data = readFileSync(sessionPath, "utf-8");
    writeFileSync(outputPath, data);
    return true;
  }

  /**
   * Import a session from a JSON file.
   */
  import(inputPath: string, name: string): boolean {
    if (!existsSync(inputPath)) return false;
    try {
      const data: SavedSession = JSON.parse(readFileSync(inputPath, "utf-8"));
      data.name = name;
      const sessionPath = this.sessionPathFor(name);
      writeFileSync(sessionPath, JSON.stringify(data, null, 2));
      return true;
    } catch (e) {
      console.debug(`[CBrowser] Import failed: ${(e as Error).message}`);
      return false;
    }
  }
}
