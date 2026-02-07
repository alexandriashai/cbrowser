/**
 * Selector Cache Tests
 *
 * Tests for the self-healing selector cache module.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { SelectorCacheManager } from "../src/browser/selector-cache.js";
import { existsSync, rmSync, mkdirSync } from "fs";
import { join } from "path";

describe("SelectorCacheManager", () => {
  const testDataDir = "/tmp/cbrowser-test-selector-cache";
  let cache: SelectorCacheManager;

  beforeEach(() => {
    // Clean up and create fresh test directory
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true });
    }
    mkdirSync(testDataDir, { recursive: true });

    cache = new SelectorCacheManager({
      dataDir: testDataDir,
      verbose: false,
    });
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true });
    }
  });

  describe("domain management", () => {
    test("sets and gets current domain", () => {
      cache.setCurrentDomain("example.com");
      expect(cache.getCurrentDomain()).toBe("example.com");
    });

    test("defaults to 'unknown' domain", () => {
      expect(cache.getCurrentDomain()).toBe("unknown");
    });
  });

  describe("cacheAlternative", () => {
    test("caches a working selector alternative", () => {
      cache.setCurrentDomain("example.com");
      cache.cacheAlternative("login button", "#login-btn", "Found by ID");

      const cached = cache.getCached("login button");
      expect(cached).not.toBeNull();
      expect(cached?.workingSelector).toBe("#login-btn");
      expect(cached?.domain).toBe("example.com");
      expect(cached?.reason).toBe("Found by ID");
    });

    test("rejects empty selectors", () => {
      cache.setCurrentDomain("example.com");
      cache.cacheAlternative("test", "", "Empty");

      const cached = cache.getCached("test");
      expect(cached).toBeNull();
    });

    test("rejects text=\"\" selectors", () => {
      cache.setCurrentDomain("example.com");
      cache.cacheAlternative("test", 'text=""', "Empty text");

      const cached = cache.getCached("test");
      expect(cached).toBeNull();
    });

    test("persists to disk", () => {
      cache.setCurrentDomain("example.com");
      cache.cacheAlternative("button", "#btn", "Test");

      // Create new instance to verify persistence
      const cache2 = new SelectorCacheManager({
        dataDir: testDataDir,
        verbose: false,
      });
      cache2.setCurrentDomain("example.com");

      const cached = cache2.getCached("button");
      expect(cached).not.toBeNull();
      expect(cached?.workingSelector).toBe("#btn");
    });
  });

  describe("getCached", () => {
    test("returns null for uncached selectors", () => {
      cache.setCurrentDomain("example.com");
      expect(cache.getCached("nonexistent")).toBeNull();
    });

    test("is case-insensitive for selector matching", () => {
      cache.setCurrentDomain("example.com");
      cache.cacheAlternative("Login Button", "#login", "Test");

      const cached = cache.getCached("login button");
      expect(cached).not.toBeNull();
    });

    test("uses domain for cache key", () => {
      cache.setCurrentDomain("site1.com");
      cache.cacheAlternative("button", "#btn1", "Test");

      cache.setCurrentDomain("site2.com");
      cache.cacheAlternative("button", "#btn2", "Test");

      cache.setCurrentDomain("site1.com");
      expect(cache.getCached("button")?.workingSelector).toBe("#btn1");

      cache.setCurrentDomain("site2.com");
      expect(cache.getCached("button")?.workingSelector).toBe("#btn2");
    });
  });

  describe("updateStats", () => {
    test("increments success count", () => {
      cache.setCurrentDomain("example.com");
      cache.cacheAlternative("btn", "#btn", "Test");
      cache.updateStats("btn", true);
      cache.updateStats("btn", true);

      const cached = cache.getCached("btn");
      expect(cached?.successCount).toBe(3); // 1 initial + 2 updates
    });

    test("increments fail count", () => {
      cache.setCurrentDomain("example.com");
      cache.cacheAlternative("btn", "#btn", "Test");
      cache.updateStats("btn", false);

      const cached = cache.getCached("btn");
      expect(cached?.failCount).toBe(1);
    });
  });

  describe("getStats", () => {
    test("returns empty stats for fresh cache", () => {
      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.totalHeals).toBe(0);
    });

    test("calculates stats correctly", () => {
      cache.setCurrentDomain("example.com");
      cache.cacheAlternative("btn1", "#btn1", "Test");
      cache.cacheAlternative("btn2", "#btn2", "Test");
      cache.updateStats("btn1", true);
      cache.updateStats("btn1", true);

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(2);
      expect(stats.totalHeals).toBe(4); // 2 initial + 2 updates
      expect(stats.byDomain["example.com"]).toBe(2);
    });
  });

  describe("clear", () => {
    test("clears all entries", () => {
      cache.setCurrentDomain("example.com");
      cache.cacheAlternative("btn1", "#btn1", "Test");
      cache.cacheAlternative("btn2", "#btn2", "Test");

      const cleared = cache.clear();
      expect(cleared).toBe(2);
      expect(cache.getStats().totalEntries).toBe(0);
    });

    test("clears only specific domain", () => {
      cache.setCurrentDomain("site1.com");
      cache.cacheAlternative("btn", "#btn1", "Test");

      cache.setCurrentDomain("site2.com");
      cache.cacheAlternative("btn", "#btn2", "Test");

      const cleared = cache.clear("site1.com");
      expect(cleared).toBe(1);
      expect(cache.getStats().totalEntries).toBe(1);
    });
  });

  describe("list", () => {
    test("lists all cached selectors", () => {
      cache.setCurrentDomain("example.com");
      cache.cacheAlternative("btn1", "#btn1", "Test");
      cache.cacheAlternative("btn2", "#btn2", "Test");

      const list = cache.list();
      expect(list.length).toBe(2);
    });

    test("filters by domain", () => {
      cache.setCurrentDomain("site1.com");
      cache.cacheAlternative("btn", "#btn1", "Test");

      cache.setCurrentDomain("site2.com");
      cache.cacheAlternative("btn", "#btn2", "Test");

      const list = cache.list("site1.com");
      expect(list.length).toBe(1);
      expect(list[0].domain).toBe("site1.com");
    });

    test("sorts by success count descending", () => {
      cache.setCurrentDomain("example.com");
      cache.cacheAlternative("btn1", "#btn1", "Test");
      cache.cacheAlternative("btn2", "#btn2", "Test");
      cache.updateStats("btn2", true);
      cache.updateStats("btn2", true);

      const list = cache.list();
      expect(list[0].workingSelector).toBe("#btn2");
    });
  });
});
