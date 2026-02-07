/**
 * Utils Tests
 *
 * Tests for security utilities including path validation and filename sanitization.
 */

import { describe, test, expect } from "bun:test";
import { validateFilePath, sanitizeFilename, safePath } from "../src/utils.js";
import { CBrowserError, CBrowserErrorCode } from "../src/types.js";

describe("Utils", () => {
  describe("validateFilePath", () => {
    const baseDir = "/home/user/data";

    test("allows paths within base directory", () => {
      const result = validateFilePath("file.txt", baseDir);
      expect(result).toBe("/home/user/data/file.txt");
    });

    test("allows nested paths within base directory", () => {
      const result = validateFilePath("subdir/file.txt", baseDir);
      expect(result).toBe("/home/user/data/subdir/file.txt");
    });

    test("blocks path traversal with ../", () => {
      expect(() => validateFilePath("../etc/passwd", baseDir)).toThrow(CBrowserError);
    });

    test("blocks path traversal with multiple ../", () => {
      expect(() => validateFilePath("../../etc/passwd", baseDir)).toThrow(CBrowserError);
    });

    test("blocks path traversal hidden in middle of path", () => {
      expect(() => validateFilePath("subdir/../../../etc/passwd", baseDir)).toThrow(CBrowserError);
    });

    test("throws CBrowserError with correct error code", () => {
      try {
        validateFilePath("../../../etc/passwd", baseDir);
        expect(true).toBe(false); // Should not reach here
      } catch (e) {
        expect(e).toBeInstanceOf(CBrowserError);
        expect((e as CBrowserError).code).toBe(CBrowserErrorCode.PATH_TRAVERSAL_BLOCKED);
      }
    });

    test("handles absolute paths within base", () => {
      const result = validateFilePath("/home/user/data/file.txt", baseDir);
      expect(result).toBe("/home/user/data/file.txt");
    });

    test("blocks absolute paths outside base", () => {
      expect(() => validateFilePath("/etc/passwd", baseDir)).toThrow(CBrowserError);
    });
  });

  describe("sanitizeFilename", () => {
    test("keeps safe characters", () => {
      expect(sanitizeFilename("file.txt")).toBe("file.txt");
      expect(sanitizeFilename("my-file_v2.txt")).toBe("my-file_v2.txt");
    });

    test("replaces unsafe characters with underscore", () => {
      expect(sanitizeFilename("file<>:.txt")).toBe("file___.txt");
      expect(sanitizeFilename("file|?*.txt")).toBe("file___.txt");
    });

    test("collapses multiple dots", () => {
      expect(sanitizeFilename("file...txt")).toBe("file.txt");
    });

    test("removes leading and trailing dots", () => {
      expect(sanitizeFilename(".hidden")).toBe("hidden");
      expect(sanitizeFilename("file.")).toBe("file");
      expect(sanitizeFilename("...file...")).toBe("file");
    });

    test("limits filename length to 255 characters", () => {
      const longName = "a".repeat(300);
      expect(sanitizeFilename(longName).length).toBe(255);
    });

    test("handles empty strings", () => {
      expect(sanitizeFilename("")).toBe("");
    });

    test("handles spaces", () => {
      expect(sanitizeFilename("my file.txt")).toBe("my_file.txt");
    });
  });

  describe("safePath", () => {
    const baseDir = "/home/user/data";

    test("creates safe path from user input", () => {
      const result = safePath(baseDir, "file.txt");
      expect(result).toBe("/home/user/data/file.txt");
    });

    test("sanitizes dangerous characters in path", () => {
      const result = safePath(baseDir, "my<file>.txt");
      expect(result).toBe("/home/user/data/my_file_.txt");
    });

    test("handles path separators in user input", () => {
      const result = safePath(baseDir, "subdir/file.txt");
      expect(result).toBe("/home/user/data/subdir/file.txt");
    });

    test("blocks path traversal even after sanitization", () => {
      // After sanitization, ../ becomes __ which is safe
      const result = safePath(baseDir, "../file.txt");
      expect(result).toContain("/home/user/data/");
    });

    test("handles empty path segments", () => {
      const result = safePath(baseDir, "subdir//file.txt");
      expect(result).toBe("/home/user/data/subdir/file.txt");
    });
  });
});
