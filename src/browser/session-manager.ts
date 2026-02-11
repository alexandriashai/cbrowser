/**
 * CBrowser - Cognitive Browser Automation
 * 
 * Copyright (c) 2026 WF Media (Alexandria Eden)
 * Email: alexandria.shai.eden@gmail.com
 * Website: https://cbrowser.ai/
 * 
 * This source code is licensed under the Business Source License 1.1
 * found in the LICENSE file in the root directory of this source tree.
 * 
 * Non-production use is permitted. Production use requires a commercial license.
 * See LICENSE for full terms.
 */


/**
 * Session Manager - Handles browser session persistence
 *
 * Extracted from CBrowser class for better modularity.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";
import type { Page, BrowserContext, Cookie } from "playwright";
import type { SavedSession, LoadSessionResult, SessionMetadata } from "../types.js";

export interface SessionManagerConfig {
  sessionsDir: string;
  viewportWidth: number;
  viewportHeight: number;
  verbose?: boolean;
}

/**
 * Manages browser session persistence - save, load, list, delete sessions.
 */
export class SessionManager {
  private config: SessionManagerConfig;

  constructor(config: SessionManagerConfig) {
    this.config = config;
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

    const sessionPath = join(this.config.sessionsDir, `${name}.json`);
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
    const sessionPath = join(this.config.sessionsDir, `${name}.json`);

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

    // Navigate to saved URL
    await page.goto(session.url, { waitUntil: "networkidle" });

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
    const sessionPath = join(this.config.sessionsDir, `${name}.json`);
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
    const sessionPath = join(this.config.sessionsDir, `${name}.json`);
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
    const sessionPath = join(this.config.sessionsDir, `${name}.json`);
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
      const sessionPath = join(this.config.sessionsDir, `${name}.json`);
      writeFileSync(sessionPath, JSON.stringify(data, null, 2));
      return true;
    } catch (e) {
      console.debug(`[CBrowser] Import failed: ${(e as Error).message}`);
      return false;
    }
  }
}
