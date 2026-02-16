/**
 * Tool Pinning Tests
 *
 * Tests for tool definition pinning and hash verification.
 * Ensures MCP tool definitions cannot be modified without detection.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  hashToolDefinition,
  createToolManifest,
  loadToolManifest,
  saveToolManifest,
  verifyToolDefinitions,
  approveToolChange,
  getManifestPath,
  type ToolDefinition,
  type ToolManifest,
  type PinningResult,
} from "../src/security/tool-pinning.js";

describe("Tool Pinning", () => {
  // Use a temp directory for tests to avoid polluting ~/.cbrowser/
  const testDir = join(tmpdir(), "cbrowser-test-" + Date.now());
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

  describe("hashToolDefinition", () => {
    test("generates consistent hashes for same inputs", () => {
      const hash1 = hashToolDefinition("navigate", "Navigate to a URL", { url: { type: "string" } });
      const hash2 = hashToolDefinition("navigate", "Navigate to a URL", { url: { type: "string" } });
      expect(hash1).toBe(hash2);
    });

    test("generates different hashes for different names", () => {
      const hash1 = hashToolDefinition("navigate", "Navigate to a URL", { url: { type: "string" } });
      const hash2 = hashToolDefinition("click", "Navigate to a URL", { url: { type: "string" } });
      expect(hash1).not.toBe(hash2);
    });

    test("generates different hashes for different descriptions", () => {
      const hash1 = hashToolDefinition("navigate", "Navigate to a URL", { url: { type: "string" } });
      const hash2 = hashToolDefinition("navigate", "Go to a URL", { url: { type: "string" } });
      expect(hash1).not.toBe(hash2);
    });

    test("generates different hashes for different schemas", () => {
      const hash1 = hashToolDefinition("navigate", "Navigate to a URL", { url: { type: "string" } });
      const hash2 = hashToolDefinition("navigate", "Navigate to a URL", { url: { type: "number" } });
      expect(hash1).not.toBe(hash2);
    });

    test("hash is a valid sha256 hex string", () => {
      const hash = hashToolDefinition("test", "Test tool", {});
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("createToolManifest", () => {
    test("creates manifest with correct structure", () => {
      const tools: ToolDefinition[] = [
        { name: "navigate", description: "Navigate to a URL", schema: { url: { type: "string" } } },
        { name: "click", description: "Click an element", schema: { selector: { type: "string" } } },
      ];

      const manifest = createToolManifest(tools);

      expect(manifest.server).toBe("cbrowser");
      expect(manifest.version).toBeDefined();
      expect(manifest.pinnedAt).toBeDefined();
      expect(Object.keys(manifest.tools)).toHaveLength(2);
    });

    test("creates correct pin entries for each tool", () => {
      const tools: ToolDefinition[] = [
        { name: "navigate", description: "Navigate to a URL", schema: { url: { type: "string" } } },
      ];

      const manifest = createToolManifest(tools);

      expect(manifest.tools.navigate).toBeDefined();
      expect(manifest.tools.navigate.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(manifest.tools.navigate.descriptionLength).toBe("Navigate to a URL".length);
      expect(manifest.tools.navigate.parameterCount).toBe(1);
      expect(manifest.tools.navigate.pinnedAt).toBeDefined();
    });

    test("counts parameters correctly", () => {
      const tools: ToolDefinition[] = [
        {
          name: "fill",
          description: "Fill a form field",
          schema: {
            selector: { type: "string" },
            value: { type: "string" },
            verbose: { type: "boolean" },
          },
        },
      ];

      const manifest = createToolManifest(tools);
      expect(manifest.tools.fill.parameterCount).toBe(3);
    });
  });

  describe("saveToolManifest and loadToolManifest", () => {
    test("saves and loads manifest correctly", () => {
      const tools: ToolDefinition[] = [
        { name: "navigate", description: "Navigate to a URL", schema: { url: { type: "string" } } },
      ];

      const manifest = createToolManifest(tools);
      saveToolManifest(manifest);

      const loaded = loadToolManifest();
      expect(loaded).not.toBeNull();
      expect(loaded!.tools.navigate.hash).toBe(manifest.tools.navigate.hash);
    });

    test("returns null when no manifest exists", () => {
      const loaded = loadToolManifest();
      expect(loaded).toBeNull();
    });

    test("creates directory if it does not exist", () => {
      const subDir = join(testDir, "nested", "dir");
      process.env.CBROWSER_DATA_DIR = subDir;

      const manifest = createToolManifest([]);
      saveToolManifest(manifest);

      expect(existsSync(join(subDir, "tool-manifest.json"))).toBe(true);
    });

    test("manifest file is valid JSON", () => {
      const manifest = createToolManifest([
        { name: "test", description: "Test", schema: {} },
      ]);
      saveToolManifest(manifest);

      const path = getManifestPath();
      const content = readFileSync(path, "utf-8");
      const parsed = JSON.parse(content);

      expect(parsed.server).toBe("cbrowser");
    });
  });

  describe("verifyToolDefinitions", () => {
    test("returns 'created' when no manifest exists", () => {
      const tools: ToolDefinition[] = [
        { name: "navigate", description: "Navigate to a URL", schema: { url: { type: "string" } } },
      ];

      const result = verifyToolDefinitions(tools);

      expect(result.status).toBe("created");
      expect(result.message).toContain("created");
    });

    test("returns 'verified' when all tools match", () => {
      const tools: ToolDefinition[] = [
        { name: "navigate", description: "Navigate to a URL", schema: { url: { type: "string" } } },
      ];

      // First call creates manifest
      verifyToolDefinitions(tools);

      // Second call verifies
      const result = verifyToolDefinitions(tools);

      expect(result.status).toBe("verified");
      expect(result.message).toContain("verified");
    });

    test("detects changed tool description", () => {
      const tools: ToolDefinition[] = [
        { name: "navigate", description: "Navigate to a URL", schema: { url: { type: "string" } } },
      ];

      verifyToolDefinitions(tools);

      // Modify description
      tools[0].description = "MODIFIED description";
      const result = verifyToolDefinitions(tools);

      expect(result.status).toBe("changed");
      expect(result.changedTools).toContain("navigate");
    });

    test("detects changed tool schema", () => {
      const tools: ToolDefinition[] = [
        { name: "navigate", description: "Navigate to a URL", schema: { url: { type: "string" } } },
      ];

      verifyToolDefinitions(tools);

      // Modify schema
      tools[0].schema = { url: { type: "string" }, timeout: { type: "number" } };
      const result = verifyToolDefinitions(tools);

      expect(result.status).toBe("changed");
      expect(result.changedTools).toContain("navigate");
    });

    test("detects new tools", () => {
      const tools: ToolDefinition[] = [
        { name: "navigate", description: "Navigate to a URL", schema: { url: { type: "string" } } },
      ];

      verifyToolDefinitions(tools);

      // Add new tool
      tools.push({ name: "click", description: "Click element", schema: { selector: { type: "string" } } });
      const result = verifyToolDefinitions(tools);

      expect(result.status).toBe("changed");
      expect(result.newTools).toContain("click");
    });

    test("detects removed tools", () => {
      const tools: ToolDefinition[] = [
        { name: "navigate", description: "Navigate to a URL", schema: { url: { type: "string" } } },
        { name: "click", description: "Click element", schema: { selector: { type: "string" } } },
      ];

      verifyToolDefinitions(tools);

      // Remove a tool
      tools.pop();
      const result = verifyToolDefinitions(tools);

      expect(result.status).toBe("changed");
      expect(result.removedTools).toContain("click");
    });

    test("detects multiple changes at once", () => {
      const tools: ToolDefinition[] = [
        { name: "navigate", description: "Navigate", schema: { url: { type: "string" } } },
        { name: "click", description: "Click", schema: { selector: { type: "string" } } },
        { name: "fill", description: "Fill", schema: { value: { type: "string" } } },
      ];

      verifyToolDefinitions(tools);

      // Make multiple changes
      tools[0].description = "Changed"; // Modified
      tools.splice(1, 1); // Remove click
      tools.push({ name: "scroll", description: "Scroll", schema: {} }); // Add new

      const result = verifyToolDefinitions(tools);

      expect(result.status).toBe("changed");
      expect(result.changedTools).toContain("navigate");
      expect(result.removedTools).toContain("click");
      expect(result.newTools).toContain("scroll");
    });
  });

  describe("approveToolChange", () => {
    test("updates hash for a changed tool", () => {
      const tools: ToolDefinition[] = [
        { name: "navigate", description: "Original", schema: { url: { type: "string" } } },
      ];

      verifyToolDefinitions(tools);

      // Change the tool
      tools[0].description = "Modified";
      const changeResult = verifyToolDefinitions(tools);
      expect(changeResult.status).toBe("changed");

      // Approve the change
      approveToolChange("navigate", tools[0]);

      // Verify again - should pass now
      const result = verifyToolDefinitions(tools);
      expect(result.status).toBe("verified");
    });

    test("adds entry for new tool", () => {
      const tools: ToolDefinition[] = [
        { name: "navigate", description: "Navigate", schema: {} },
      ];

      verifyToolDefinitions(tools);

      // Add new tool
      const newTool: ToolDefinition = { name: "click", description: "Click", schema: {} };
      tools.push(newTool);

      // Approve the new tool
      approveToolChange("click", newTool);

      // Verify - should pass
      const result = verifyToolDefinitions(tools);
      expect(result.status).toBe("verified");
    });

    test("throws if no manifest exists", () => {
      const tool: ToolDefinition = { name: "test", description: "Test", schema: {} };

      expect(() => approveToolChange("test", tool)).toThrow();
    });
  });

  describe("getManifestPath", () => {
    test("returns path in data directory", () => {
      const path = getManifestPath();
      expect(path).toContain("tool-manifest.json");
      expect(path).toContain(testDir);
    });
  });
});
