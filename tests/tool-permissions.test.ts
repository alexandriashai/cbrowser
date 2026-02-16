/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Tool Permissions Tests
 *
 * Tests for per-tool permission model.
 * Ensures tools are correctly classified into zones and permissions are enforced.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  loadToolPermissions,
  saveToolPermissions,
  setToolZone,
  getToolZone,
  checkToolPermission,
  listToolZones,
  resetToolZones,
  DEFAULT_ZONES,
  type ToolZone,
  type ToolPermissionConfig,
  type PermissionCheckResult,
} from "../src/security/tool-permissions.js";

describe("Tool Permissions", () => {
  // Use a temp directory for tests to avoid polluting ~/.cbrowser/
  const testDir = join(tmpdir(), "cbrowser-test-permissions-" + Date.now());
  const originalEnv = process.env.CBROWSER_DATA_DIR;

  beforeEach(() => {
    // Set up test directory
    process.env.CBROWSER_DATA_DIR = testDir;
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up
    process.env.CBROWSER_DATA_DIR = originalEnv;
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("DEFAULT_ZONES", () => {
    test("has green zone tools (read-only, safe)", () => {
      expect(DEFAULT_ZONES["navigate"]).toBe("green");
      expect(DEFAULT_ZONES["screenshot"]).toBe("green");
      expect(DEFAULT_ZONES["extract"]).toBe("green");
      expect(DEFAULT_ZONES["status"]).toBe("green");
      expect(DEFAULT_ZONES["list_sessions"]).toBe("green");
    });

    test("has yellow zone tools (interactive but safe)", () => {
      expect(DEFAULT_ZONES["click"]).toBe("yellow");
      expect(DEFAULT_ZONES["hover"]).toBe("yellow");
      expect(DEFAULT_ZONES["scroll"]).toBe("yellow");
      expect(DEFAULT_ZONES["assert"]).toBe("yellow");
      expect(DEFAULT_ZONES["analyze_page"]).toBe("yellow");
    });

    test("has orange zone tools (state-modifying)", () => {
      expect(DEFAULT_ZONES["fill"]).toBe("orange");
      expect(DEFAULT_ZONES["smart_click"]).toBe("orange");
      expect(DEFAULT_ZONES["save_session"]).toBe("orange");
      expect(DEFAULT_ZONES["delete_session"]).toBe("orange");
    });

    test("has red zone tools (sensitive/autonomous)", () => {
      expect(DEFAULT_ZONES["cognitive_journey_autonomous"]).toBe("red");
      expect(DEFAULT_ZONES["stealth_enable"]).toBe("red");
      expect(DEFAULT_ZONES["chaos_test"]).toBe("red");
    });
  });

  describe("getToolZone", () => {
    test("returns default zone for known tools", () => {
      expect(getToolZone("screenshot")).toBe("green");
      expect(getToolZone("click")).toBe("yellow");
      expect(getToolZone("fill")).toBe("orange");
      expect(getToolZone("cognitive_journey_autonomous")).toBe("red");
    });

    test("returns yellow for unknown tools (conservative default)", () => {
      expect(getToolZone("some_unknown_tool")).toBe("yellow");
    });

    test("returns user override if set", () => {
      // Set override
      setToolZone("screenshot", "red");
      expect(getToolZone("screenshot")).toBe("red");
    });
  });

  describe("setToolZone", () => {
    test("creates permission file on first write", () => {
      setToolZone("screenshot", "yellow");
      const permissionsPath = join(testDir, "tool-permissions.json");
      expect(existsSync(permissionsPath)).toBe(true);
    });

    test("saves override to file", () => {
      setToolZone("navigate", "red");

      const permissionsPath = join(testDir, "tool-permissions.json");
      const content = JSON.parse(readFileSync(permissionsPath, "utf-8"));

      expect(content.toolPermissions["navigate"]).toBe("red");
    });

    test("updates lastUpdated timestamp", () => {
      const before = Date.now();
      setToolZone("screenshot", "orange");
      const after = Date.now();

      const config = loadToolPermissions();
      expect(config).not.toBeNull();

      const timestamp = new Date(config!.lastUpdated).getTime();
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("loadToolPermissions", () => {
    test("returns null when no file exists", () => {
      const config = loadToolPermissions();
      expect(config).toBeNull();
    });

    test("returns saved permissions", () => {
      setToolZone("screenshot", "red");
      setToolZone("click", "orange");

      const config = loadToolPermissions();
      expect(config).not.toBeNull();
      expect(config!.toolPermissions["screenshot"]).toBe("red");
      expect(config!.toolPermissions["click"]).toBe("orange");
    });
  });

  describe("saveToolPermissions", () => {
    test("creates directory if needed", () => {
      const subDir = join(testDir, "nested", "dir");
      process.env.CBROWSER_DATA_DIR = subDir;

      const config: ToolPermissionConfig = {
        toolPermissions: { screenshot: "red" },
        lastUpdated: new Date().toISOString(),
      };
      saveToolPermissions(config);

      expect(existsSync(join(subDir, "tool-permissions.json"))).toBe(true);
    });

    test("includes setBy if provided", () => {
      const config: ToolPermissionConfig = {
        toolPermissions: { screenshot: "red" },
        lastUpdated: new Date().toISOString(),
        setBy: "test-user",
      };
      saveToolPermissions(config);

      const loaded = loadToolPermissions();
      expect(loaded?.setBy).toBe("test-user");
    });
  });

  describe("checkToolPermission", () => {
    describe("green zone tools", () => {
      test("are always allowed", () => {
        const result = checkToolPermission("screenshot");
        expect(result.allowed).toBe(true);
        expect(result.requiresForce).toBe(false);
        expect(result.zone).toBe("green");
        expect(result.source).toBe("default");
      });

      test("do not need force flag", () => {
        const result = checkToolPermission("screenshot", false);
        expect(result.allowed).toBe(true);
        expect(result.requiresForce).toBe(false);
      });
    });

    describe("yellow zone tools", () => {
      test("are allowed without confirmation", () => {
        const result = checkToolPermission("click");
        expect(result.allowed).toBe(true);
        expect(result.requiresForce).toBe(false);
        expect(result.zone).toBe("yellow");
      });
    });

    describe("orange zone tools", () => {
      test("are allowed with warning", () => {
        const result = checkToolPermission("fill");
        expect(result.allowed).toBe(true);
        expect(result.requiresForce).toBe(false);
        expect(result.zone).toBe("orange");
        expect(result.message).toBeDefined();
        expect(result.message).toContain("state-modifying");
      });
    });

    describe("red zone tools", () => {
      test("are blocked without force flag", () => {
        const result = checkToolPermission("cognitive_journey_autonomous");
        expect(result.allowed).toBe(false);
        expect(result.requiresForce).toBe(true);
        expect(result.zone).toBe("red");
        expect(result.message).toContain("--force");
      });

      test("are allowed with force flag", () => {
        const result = checkToolPermission("cognitive_journey_autonomous", true);
        expect(result.allowed).toBe(true);
        expect(result.requiresForce).toBe(true);
        expect(result.zone).toBe("red");
      });
    });

    describe("black zone tools", () => {
      test("are always blocked", () => {
        // First set a tool to black zone
        setToolZone("some_dangerous_tool", "black");

        const result = checkToolPermission("some_dangerous_tool");
        expect(result.allowed).toBe(false);
        expect(result.requiresForce).toBe(false);
        expect(result.zone).toBe("black");
        expect(result.message).toContain("prohibited");
      });

      test("are blocked even with force flag", () => {
        setToolZone("some_dangerous_tool", "black");

        const result = checkToolPermission("some_dangerous_tool", true);
        expect(result.allowed).toBe(false);
        expect(result.zone).toBe("black");
      });
    });

    describe("user overrides", () => {
      test("are reflected in permission check", () => {
        // Override a green tool to red
        setToolZone("screenshot", "red");

        const result = checkToolPermission("screenshot");
        expect(result.allowed).toBe(false);
        expect(result.zone).toBe("red");
        expect(result.source).toBe("user_override");
        expect(result.requiresForce).toBe(true);
      });

      test("allow escalation with force", () => {
        setToolZone("screenshot", "red");

        const result = checkToolPermission("screenshot", true);
        expect(result.allowed).toBe(true);
        expect(result.source).toBe("user_override");
      });
    });
  });

  describe("listToolZones", () => {
    test("returns default zones for all known tools", () => {
      const zones = listToolZones();

      expect(zones["screenshot"]).toEqual({ zone: "green", source: "default" });
      expect(zones["click"]).toEqual({ zone: "yellow", source: "default" });
      expect(zones["fill"]).toEqual({ zone: "orange", source: "default" });
    });

    test("includes user overrides with correct source", () => {
      setToolZone("screenshot", "red");

      const zones = listToolZones();

      expect(zones["screenshot"]).toEqual({ zone: "red", source: "user_override" });
    });

    test("includes both defaults and overrides", () => {
      setToolZone("screenshot", "orange");

      const zones = listToolZones();

      // Overridden
      expect(zones["screenshot"].source).toBe("user_override");
      // Not overridden
      expect(zones["click"].source).toBe("default");
    });
  });

  describe("resetToolZones", () => {
    test("removes all user overrides", () => {
      setToolZone("screenshot", "red");
      setToolZone("click", "orange");

      resetToolZones();

      const config = loadToolPermissions();
      expect(config).toBeNull();
    });

    test("restores default zones", () => {
      setToolZone("screenshot", "red");
      expect(getToolZone("screenshot")).toBe("red");

      resetToolZones();

      expect(getToolZone("screenshot")).toBe("green");
    });

    test("handles no existing file gracefully", () => {
      // Should not throw even if no file exists
      expect(() => resetToolZones()).not.toThrow();
    });
  });

  describe("edge cases", () => {
    test("handles corrupted permission file", () => {
      const permissionsPath = join(testDir, "tool-permissions.json");
      writeFileSync(permissionsPath, "{ invalid json");

      // Should return null instead of throwing
      const config = loadToolPermissions();
      expect(config).toBeNull();
    });

    test("handles empty permission file", () => {
      const permissionsPath = join(testDir, "tool-permissions.json");
      writeFileSync(permissionsPath, "");

      const config = loadToolPermissions();
      expect(config).toBeNull();
    });

    test("validates zone values on load", () => {
      const permissionsPath = join(testDir, "tool-permissions.json");
      writeFileSync(
        permissionsPath,
        JSON.stringify({
          toolPermissions: { screenshot: "invalid_zone" },
          lastUpdated: new Date().toISOString(),
        })
      );

      // Invalid zone should be ignored, fall back to default
      expect(getToolZone("screenshot")).toBe("green");
    });
  });
});
