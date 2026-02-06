/**
 * CLI Tests
 *
 * Tests for CLI argument parsing and command routing.
 */

import { describe, test, expect } from "bun:test";
import { execSync } from "child_process";

const CLI = "bun run src/cli.ts";

describe("CLI", () => {
  describe("version command", () => {
    test("--version returns version string", () => {
      const output = execSync(`${CLI} --version`).toString().trim();
      expect(output).toMatch(/^\d+\.\d+\.\d+$/);
    });

    test("-v returns version string", () => {
      const output = execSync(`${CLI} -v`).toString().trim();
      expect(output).toMatch(/^\d+\.\d+\.\d+$/);
    });

    test("version command returns version string", () => {
      const output = execSync(`${CLI} version`).toString().trim();
      expect(output).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe("help command", () => {
    test("help shows usage information", () => {
      const output = execSync(`${CLI} help`).toString();
      expect(output).toContain("CBrowser CLI");
      expect(output).toContain("NAVIGATION");
      expect(output).toContain("INTERACTION");
    });

    test("unknown command shows error", () => {
      try {
        execSync(`${CLI} nonexistent-command`, { stdio: "pipe" });
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.stderr.toString()).toContain("Unknown command");
      }
    });
  });

  describe("status command", () => {
    test("status shows environment info", () => {
      const output = execSync(`${CLI} status`).toString();
      expect(output).toContain("CBrowser");
      expect(output).toContain("Data Directory");
      expect(output).toContain("Browsers");
    });
  });
});
