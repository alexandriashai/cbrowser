/**
 * Config Tests
 *
 * Tests for configuration and data directory management.
 */

import { describe, test, expect } from "bun:test";
import {
  getDataDir,
  ensureDirectories,
} from "../src/config.js";
import { existsSync } from "fs";

describe("Config", () => {
  describe("getDataDir", () => {
    test("returns a valid path", () => {
      const dataDir = getDataDir();
      expect(typeof dataDir).toBe("string");
      expect(dataDir.length).toBeGreaterThan(0);
    });

    test("path contains cbrowser", () => {
      const dataDir = getDataDir();
      expect(dataDir).toContain("cbrowser");
    });
  });

  describe("ensureDirectories", () => {
    test("creates required directories", () => {
      ensureDirectories();
      const dataDir = getDataDir();
      expect(existsSync(dataDir)).toBe(true);
    });
  });
});
