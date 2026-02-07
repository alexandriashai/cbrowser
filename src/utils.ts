/**
 * CBrowser Utility Functions
 *
 * Shared utilities for security, validation, and common operations.
 */

import { normalize, resolve, isAbsolute, relative } from "path";
import { CBrowserError, CBrowserErrorCode } from "./types.js";

/**
 * Validate that a file path is safe and within allowed directories.
 * Prevents path traversal attacks (e.g., ../../etc/passwd).
 *
 * @param filePath - The path to validate
 * @param allowedBase - Base directory that paths must be within
 * @returns The normalized, validated path
 * @throws CBrowserError if path traversal is detected
 */
export function validateFilePath(filePath: string, allowedBase: string): string {
  // Normalize both paths to remove ../ and ./
  const normalizedPath = normalize(filePath);
  const normalizedBase = normalize(allowedBase);

  // Resolve to absolute paths
  const absolutePath = isAbsolute(normalizedPath)
    ? normalizedPath
    : resolve(normalizedBase, normalizedPath);
  const absoluteBase = resolve(normalizedBase);

  // Check if the resolved path is within the allowed base
  const relativePath = relative(absoluteBase, absolutePath);

  // If the relative path starts with "..", it's outside the base
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new CBrowserError(
      CBrowserErrorCode.PATH_TRAVERSAL_BLOCKED,
      `Path traversal blocked: "${filePath}" resolves outside allowed directory`,
      { attemptedPath: filePath, allowedBase, resolvedPath: absolutePath }
    );
  }

  return absolutePath;
}

/**
 * Sanitize a filename to remove potentially dangerous characters.
 * Keeps alphanumeric, dash, underscore, and dot.
 *
 * @param filename - The filename to sanitize
 * @returns Sanitized filename
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_") // Replace unsafe chars with underscore
    .replace(/\.{2,}/g, ".") // Collapse multiple dots
    .replace(/^\.+|\.+$/g, "") // Remove leading/trailing dots
    .substring(0, 255); // Limit length
}

/**
 * Create a safe path by combining base and user-provided path.
 *
 * @param base - The base directory (must be absolute)
 * @param userPath - User-provided path (may contain dangerous chars)
 * @returns Safe, validated absolute path
 */
export function safePath(base: string, userPath: string): string {
  const sanitized = userPath
    .split(/[/\\]/)
    .map(sanitizeFilename)
    .filter(Boolean)
    .join("/");

  return validateFilePath(sanitized, base);
}
