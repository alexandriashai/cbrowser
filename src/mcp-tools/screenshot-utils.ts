/**
 * CBrowser MCP Tools - Screenshot Utilities
 *
 * Utilities for converting screenshot file paths to inline base64 images
 * for remote MCP mode where claude.ai can't access server filesystem.
 *
 * @copyright 2026 WF Media (Alexandria Eden) alexandria.shai.eden@gmail.com
 * @license BSL-1.1 (Business Source License 1.1)
 */

import { readFileSync, existsSync } from "node:fs";

/**
 * MCP content block types
 */
export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export type ContentBlock = TextContent | ImageContent;

/**
 * Convert a screenshot file path to base64 data URL
 */
export function screenshotToBase64(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) {
      console.warn(`Screenshot file not found: ${filePath}`);
      return null;
    }

    const buffer = readFileSync(filePath);
    const base64 = buffer.toString("base64");

    // Determine mime type from extension
    const ext = filePath.toLowerCase().split(".").pop();
    const mimeType = ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "webp"
        ? "image/webp"
        : "image/png";

    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.warn(`Failed to read screenshot: ${(error as Error).message}`);
    return null;
  }
}

/**
 * Extract screenshot path from a JSON response object (recursively)
 */
function findScreenshotPaths(obj: unknown, paths: string[] = []): string[] {
  if (typeof obj !== "object" || obj === null) {
    return paths;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      findScreenshotPaths(item, paths);
    }
  } else {
    for (const [key, value] of Object.entries(obj)) {
      if (key === "screenshot" && typeof value === "string" && value.startsWith("/")) {
        paths.push(value);
      } else if (typeof value === "object") {
        findScreenshotPaths(value, paths);
      }
    }
  }

  return paths;
}

/**
 * Transform MCP tool response to include inline images for remote mode.
 *
 * Takes the original content blocks and:
 * 1. Finds any screenshot paths in text/JSON content
 * 2. Converts them to base64
 * 3. Adds MCP image content blocks for each screenshot
 *
 * @param content Original content blocks from tool response
 * @returns Transformed content blocks with inline images
 */
export function transformResponseForRemote(
  content: ContentBlock[]
): ContentBlock[] {
  const result: ContentBlock[] = [];
  const addedImages: Set<string> = new Set();

  for (const block of content) {
    if (block.type === "text") {
      try {
        // Try to parse as JSON to find screenshot paths
        const parsed = JSON.parse(block.text);
        const screenshotPaths = findScreenshotPaths(parsed);

        // Add the original text block (keep the path for reference)
        result.push(block);

        // Add image content blocks for each screenshot
        for (const path of screenshotPaths) {
          if (addedImages.has(path)) continue;

          const base64Data = screenshotToBase64(path);
          if (base64Data) {
            // Extract just the base64 part (without data URL prefix)
            const base64Only = base64Data.split(",")[1];
            const mimeType = base64Data.split(";")[0].split(":")[1];

            result.push({
              type: "image",
              data: base64Only,
              mimeType: mimeType,
            });
            addedImages.add(path);
          }
        }
      } catch {
        // Not JSON, just pass through
        result.push(block);
      }
    } else {
      // Pass through non-text blocks (including existing images)
      result.push(block);
    }
  }

  return result;
}

/**
 * Check if running in remote MCP mode
 */
export function isRemoteMcpMode(): boolean {
  // The remote server sets this, or we can check for HTTP-based transport indicators
  return process.env.MCP_REMOTE_MODE === "true" ||
         process.env.PORT !== undefined;
}

/**
 * Global flag to enable remote mode transformations
 * Set by remote MCP server on startup
 */
let remoteMode = false;

export function setRemoteMode(enabled: boolean): void {
  remoteMode = enabled;
}

export function getRemoteMode(): boolean {
  return remoteMode;
}
