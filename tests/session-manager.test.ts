/**
 * Session Manager Tests
 *
 * Tests for browser session persistence module.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { SessionManager } from "../src/browser/session-manager.js";
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";

describe("SessionManager", () => {
  const testSessionsDir = "/tmp/cbrowser-test-sessions";
  let manager: SessionManager;

  beforeEach(() => {
    // Clean up and create fresh test directory
    if (existsSync(testSessionsDir)) {
      rmSync(testSessionsDir, { recursive: true });
    }
    mkdirSync(testSessionsDir, { recursive: true });

    manager = new SessionManager({
      sessionsDir: testSessionsDir,
      viewportWidth: 1280,
      viewportHeight: 720,
      verbose: false,
    });
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testSessionsDir)) {
      rmSync(testSessionsDir, { recursive: true });
    }
  });

  describe("list", () => {
    test("returns empty array for no sessions", () => {
      expect(manager.list()).toEqual([]);
    });

    test("lists session names without .json extension", () => {
      // Create test session files
      writeFileSync(
        join(testSessionsDir, "session1.json"),
        JSON.stringify({ name: "session1", cookies: [], localStorage: {}, sessionStorage: {} })
      );
      writeFileSync(
        join(testSessionsDir, "session2.json"),
        JSON.stringify({ name: "session2", cookies: [], localStorage: {}, sessionStorage: {} })
      );

      const sessions = manager.list();
      expect(sessions).toContain("session1");
      expect(sessions).toContain("session2");
      expect(sessions.length).toBe(2);
    });

    test("excludes last-session.json from list", () => {
      writeFileSync(
        join(testSessionsDir, "last-session.json"),
        JSON.stringify({ name: "last", cookies: [], localStorage: {}, sessionStorage: {} })
      );
      writeFileSync(
        join(testSessionsDir, "regular.json"),
        JSON.stringify({ name: "regular", cookies: [], localStorage: {}, sessionStorage: {} })
      );

      const sessions = manager.list();
      expect(sessions).not.toContain("last-session");
      expect(sessions).toContain("regular");
    });
  });

  describe("listDetailed", () => {
    test("returns empty array for no sessions", () => {
      expect(manager.listDetailed()).toEqual([]);
    });

    test("returns detailed metadata for sessions", () => {
      const sessionData = {
        name: "test-session",
        created: "2026-01-01T00:00:00.000Z",
        lastUsed: "2026-01-02T00:00:00.000Z",
        domain: "example.com",
        url: "https://example.com/page",
        cookies: [{ name: "auth", value: "token" }],
        localStorage: { key1: "value1" },
        sessionStorage: { key2: "value2" },
        viewport: { width: 1280, height: 720 },
      };

      writeFileSync(join(testSessionsDir, "test-session.json"), JSON.stringify(sessionData));

      const detailed = manager.listDetailed();
      expect(detailed.length).toBe(1);
      expect(detailed[0].name).toBe("test-session");
      expect(detailed[0].domain).toBe("example.com");
      expect(detailed[0].cookies).toBe(1);
      expect(detailed[0].localStorageKeys).toBe(1);
      expect(detailed[0].sessionStorageKeys).toBe(1);
    });

    test("sorts by lastUsed descending", () => {
      writeFileSync(
        join(testSessionsDir, "older.json"),
        JSON.stringify({
          name: "older",
          lastUsed: "2026-01-01T00:00:00.000Z",
          cookies: [],
          localStorage: {},
          sessionStorage: {},
        })
      );
      writeFileSync(
        join(testSessionsDir, "newer.json"),
        JSON.stringify({
          name: "newer",
          lastUsed: "2026-01-10T00:00:00.000Z",
          cookies: [],
          localStorage: {},
          sessionStorage: {},
        })
      );

      const detailed = manager.listDetailed();
      expect(detailed[0].name).toBe("newer");
      expect(detailed[1].name).toBe("older");
    });
  });

  describe("getDetails", () => {
    test("returns null for non-existent session", () => {
      expect(manager.getDetails("nonexistent")).toBeNull();
    });

    test("returns full session data", () => {
      const sessionData = {
        name: "test",
        domain: "example.com",
        cookies: [{ name: "c1", value: "v1" }],
        localStorage: { key: "value" },
        sessionStorage: {},
      };

      writeFileSync(join(testSessionsDir, "test.json"), JSON.stringify(sessionData));

      const details = manager.getDetails("test");
      expect(details).not.toBeNull();
      expect(details?.name).toBe("test");
      expect(details?.domain).toBe("example.com");
      expect(details?.cookies.length).toBe(1);
    });
  });

  describe("delete", () => {
    test("returns false for non-existent session", () => {
      expect(manager.delete("nonexistent")).toBe(false);
    });

    test("deletes session file and returns true", () => {
      const filePath = join(testSessionsDir, "to-delete.json");
      writeFileSync(filePath, JSON.stringify({ name: "to-delete", cookies: [], localStorage: {}, sessionStorage: {} }));

      expect(existsSync(filePath)).toBe(true);
      expect(manager.delete("to-delete")).toBe(true);
      expect(existsSync(filePath)).toBe(false);
    });
  });

  describe("cleanup", () => {
    test("deletes sessions older than specified days", () => {
      const now = new Date();
      const oldDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const newDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

      writeFileSync(
        join(testSessionsDir, "old.json"),
        JSON.stringify({ name: "old", lastUsed: oldDate.toISOString(), cookies: [], localStorage: {}, sessionStorage: {} })
      );
      writeFileSync(
        join(testSessionsDir, "new.json"),
        JSON.stringify({ name: "new", lastUsed: newDate.toISOString(), cookies: [], localStorage: {}, sessionStorage: {} })
      );

      const result = manager.cleanup(5); // Delete sessions older than 5 days

      expect(result.deleted).toContain("old");
      expect(result.kept).toContain("new");
      expect(existsSync(join(testSessionsDir, "old.json"))).toBe(false);
      expect(existsSync(join(testSessionsDir, "new.json"))).toBe(true);
    });
  });

  describe("export", () => {
    test("returns false for non-existent session", () => {
      expect(manager.export("nonexistent", "/tmp/export.json")).toBe(false);
    });

    test("exports session to specified path", () => {
      const sessionData = { name: "export-test", cookies: [], localStorage: {}, sessionStorage: {} };
      writeFileSync(join(testSessionsDir, "export-test.json"), JSON.stringify(sessionData));

      const exportPath = "/tmp/cbrowser-export-test.json";
      expect(manager.export("export-test", exportPath)).toBe(true);
      expect(existsSync(exportPath)).toBe(true);

      const exported = JSON.parse(readFileSync(exportPath, "utf-8"));
      expect(exported.name).toBe("export-test");

      // Clean up
      rmSync(exportPath);
    });
  });

  describe("import", () => {
    test("returns false for non-existent file", () => {
      expect(manager.import("/nonexistent/file.json", "imported")).toBe(false);
    });

    test("imports session with new name", () => {
      const importPath = "/tmp/cbrowser-import-test.json";
      const sessionData = { name: "original", cookies: [], localStorage: {}, sessionStorage: {} };
      writeFileSync(importPath, JSON.stringify(sessionData));

      expect(manager.import(importPath, "imported")).toBe(true);

      const imported = manager.getDetails("imported");
      expect(imported).not.toBeNull();
      expect(imported?.name).toBe("imported"); // Name should be updated

      // Clean up
      rmSync(importPath);
    });
  });
});
