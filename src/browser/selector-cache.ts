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
 * Selector Cache - Self-healing selector persistence
 *
 * Stores working selector alternatives for faster element finding.
 * Extracted from CBrowser class for better modularity.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { SelectorCache as SelectorCacheType, SelectorCacheEntry, SelectorCacheStats } from "../types.js";

export interface SelectorCacheConfig {
  dataDir: string;
  verbose?: boolean;
}

/**
 * Manages self-healing selector cache for faster element finding.
 */
export class SelectorCacheManager {
  private config: SelectorCacheConfig;
  private cache: SelectorCacheType | null = null;
  private currentDomain: string = "unknown";

  constructor(config: SelectorCacheConfig) {
    this.config = config;
  }

  /**
   * Set current domain for cache key generation.
   */
  setCurrentDomain(domain: string): void {
    this.currentDomain = domain;
  }

  /**
   * Get current domain.
   */
  getCurrentDomain(): string {
    return this.currentDomain;
  }

  /**
   * Get the cache file path.
   */
  private getCachePath(): string {
    return join(this.config.dataDir, "selector-cache.json");
  }

  /**
   * Load the cache from disk.
   */
  private load(): SelectorCacheType {
    if (this.cache) return this.cache;

    const cachePath = this.getCachePath();
    if (existsSync(cachePath)) {
      try {
        const data = readFileSync(cachePath, "utf-8");
        this.cache = JSON.parse(data);
        return this.cache!;
      } catch (e) {
        if (this.config.verbose) {
          console.debug(`[CBrowser] Corrupted selector cache, starting fresh: ${(e as Error).message}`);
        }
      }
    }

    this.cache = { version: 1, entries: {} };
    return this.cache;
  }

  /**
   * Save the cache to disk.
   */
  private save(): void {
    if (!this.cache) return;
    const cachePath = this.getCachePath();
    writeFileSync(cachePath, JSON.stringify(this.cache, null, 2));
  }

  /**
   * Get cache key for a selector.
   */
  private getKey(selector: string, domain?: string): string {
    const d = domain || this.currentDomain;
    return `${d}::${selector.toLowerCase()}`;
  }

  /**
   * Cache a working alternative selector.
   */
  cacheAlternative(original: string, working: string, reason: string = "Alternative found"): void {
    // Reject empty or meaningless selectors
    if (!working || working.trim() === "" || working === 'text=""' || working === "text=''") {
      if (this.config.verbose) {
        console.log(`⚠️ Rejected invalid selector for caching: "${working}"`);
      }
      return;
    }

    const cache = this.load();
    const key = this.getKey(original);
    const domain = this.currentDomain;

    cache.entries[key] = {
      originalSelector: original,
      workingSelector: working,
      domain,
      successCount: 1,
      failCount: 0,
      lastUsed: new Date().toISOString(),
      reason,
    };

    this.save();

    if (this.config.verbose) {
      console.log(`📦 Cached healed selector: "${original}" → "${working}"`);
    }
  }

  /**
   * Get a cached alternative selector if available.
   */
  getCached(original: string): SelectorCacheEntry | null {
    const cache = this.load();
    const key = this.getKey(original);
    const entry = cache.entries[key] || null;
    if (entry && (entry.workingSelector === 'text=""' || entry.workingSelector === "text=''" || entry.workingSelector.trim() === "")) {
      return null; // Reject invalid cached selectors
    }
    return entry;
  }

  /**
   * Update cache entry statistics.
   */
  updateStats(original: string, success: boolean): void {
    const cache = this.load();
    const key = this.getKey(original);
    const entry = cache.entries[key];

    if (entry) {
      if (success) {
        entry.successCount++;
      } else {
        entry.failCount++;
      }
      entry.lastUsed = new Date().toISOString();
      this.save();
    }
  }

  /**
   * Get cache statistics.
   */
  getStats(): SelectorCacheStats {
    const cache = this.load();
    const entries = Object.values(cache.entries);

    const byDomain: Record<string, number> = {};
    for (const entry of entries) {
      byDomain[entry.domain] = (byDomain[entry.domain] || 0) + 1;
    }

    const topHealedSelectors = entries
      .sort((a, b) => b.successCount - a.successCount)
      .slice(0, 10)
      .map((e) => ({
        original: e.originalSelector,
        working: e.workingSelector,
        heals: e.successCount,
      }));

    return {
      totalEntries: entries.length,
      totalHeals: entries.reduce((sum, e) => sum + e.successCount, 0),
      byDomain,
      topHealedSelectors,
    };
  }

  /**
   * Clear the cache.
   */
  clear(domain?: string): number {
    const cache = this.load();
    let cleared = 0;

    if (domain) {
      // Clear only for specific domain
      for (const [key, entry] of Object.entries(cache.entries)) {
        if (entry.domain === domain) {
          delete cache.entries[key];
          cleared++;
        }
      }
    } else {
      // Clear all
      cleared = Object.keys(cache.entries).length;
      cache.entries = {};
    }

    this.save();
    return cleared;
  }

  /**
   * List all cached selectors.
   */
  list(domain?: string): SelectorCacheEntry[] {
    const cache = this.load();
    let entries = Object.values(cache.entries);

    if (domain) {
      entries = entries.filter((e) => e.domain === domain);
    }

    return entries.sort((a, b) => b.successCount - a.successCount);
  }
}
