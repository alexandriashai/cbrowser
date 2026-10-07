/**
 * CBrowser MCP Tools - Screenshot Utilities
 *
 * Utilities for converting screenshot file paths to inline base64 images
 * for remote MCP mode where claude.ai can't access server filesystem.
 *
 * Includes automatic compression to stay under Claude.ai's 200KB tool response limit.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { readFileSync, existsSync, writeFileSync, unlinkSync, createReadStream } from "node:fs";
import { join, dirname } from "node:path";
import { basename } from "node:path";
import { writeArtifact } from "../artifact-store.js";
import type { ScreenshotInfo } from "../browser.js";

/**
 * Maximum allowed size for tool responses in bytes.
 * Claude.ai enforces a 200KB limit. We target 150KB to leave headroom.
 */
export const MAX_RESPONSE_SIZE = 150000; // 150KB target (200KB limit)

/**
 * JPEG quality settings to try when compressing screenshots
 */
const QUALITY_STEPS = [85, 70, 55, 40, 25];

/**
 * Scale factors to try when JPEG quality alone isn't enough
 */
const SCALE_FACTORS = [1.0, 0.75, 0.5, 0.35];

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
 * Check if a file's base64 encoding would exceed the size limit
 */
export function willExceedLimit(filePath: string, limit: number = MAX_RESPONSE_SIZE): boolean {
  try {
    if (!existsSync(filePath)) return false;
    const buffer = readFileSync(filePath);
    // Base64 encoding inflates size by ~33%
    const estimatedBase64Size = Math.ceil(buffer.length * 1.37);
    return estimatedBase64Size > limit;
  } catch {
    return false;
  }
}

/**
 * Get file size in bytes
 */
export function getFileSize(filePath: string): number {
  try {
    if (!existsSync(filePath)) return 0;
    return readFileSync(filePath).length;
  } catch {
    return 0;
  }
}

/**
 * Screenshot compression options for remote MCP mode
 */
export interface ScreenshotCompressionOptions {
  /** Target max size in bytes (default: 150KB) */
  maxSize?: number;
  /** Initial JPEG quality (default: 85) */
  quality?: number;
  /** Scale factor for resizing (default: 1.0) */
  scale?: number;
}

/**
 * Get recommended compression settings based on current file size
 */
export function getCompressionSettings(currentSize: number, targetSize: number = MAX_RESPONSE_SIZE): ScreenshotCompressionOptions {
  // Base64 inflates size by ~33%, so actual file needs to be smaller
  const actualTargetSize = Math.floor(targetSize / 1.37);

  if (currentSize <= actualTargetSize) {
    return { quality: 85, scale: 1.0 };
  }

  const ratio = currentSize / actualTargetSize;

  if (ratio <= 1.5) {
    return { quality: 70, scale: 1.0 };
  } else if (ratio <= 2.5) {
    return { quality: 55, scale: 1.0 };
  } else if (ratio <= 4) {
    return { quality: 50, scale: 0.75 };
  } else if (ratio <= 6) {
    return { quality: 45, scale: 0.5 };
  } else {
    return { quality: 40, scale: 0.35 };
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

/**
 * Fields naming an in-memory downscale, for a tool result that carries the
 * screenshot at `file`. Empty when the image is the size it was captured at,
 * or when `info` describes some other file.
 *
 * BUG-02 (2026-10-07): the byte budget is now met by shrinking the image, not
 * the viewport, so a picture can be smaller than the page it shows. A caller
 * reading coordinates or text size off it has to be told; absence of these
 * fields means the image is the capture's own size.
 */
export function describeDownscale(
  info: ScreenshotInfo | undefined,
  file: string | undefined,
): { screenshotSize?: string; screenshotDownscaledFrom?: string } {
  if (!info || !file || info.path !== file || !info.downscaled) return {};
  return {
    screenshotSize: `${info.width}x${info.height}`,
    screenshotDownscaledFrom: `${info.sourceWidth}x${info.sourceHeight}`,
  };
}

/**
 * Build MCP content array with optional images for remote mode.
 * This is the standard pattern for tools that return screenshots.
 *
 * @param data - The JSON data to include in text content
 * @param screenshotPaths - Screenshot path(s) to convert to images in remote mode
 * @returns Array of MCP content blocks
 */
/**
 * Upload a screenshot to the CMS media endpoint and return a public URL.
 * Falls back to null if CMS is unreachable.
 */
async function uploadScreenshotToCMS(filePath: string): Promise<string | null> {
  const cmsUrl = process.env.CMS_URL || "http://localhost:3200";
  try {
    const fileBuffer = readFileSync(filePath);
    const fileName = basename(filePath);

    // Build multipart form data manually (no FormData in Node without polyfill)
    const boundary = `----CBrowserUpload${Date.now()}`;
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: image/png\r\n\r\n`),
      fileBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const res = await fetch(`${cmsUrl}/api/media/upload`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (res.ok) {
      const data = await res.json() as { media?: { url?: string } };
      const mediaUrl = data.media?.url;
      if (mediaUrl) {
        // Convert relative URL to absolute
        return mediaUrl.startsWith("http") ? mediaUrl : `https://cbrowser.ai${mediaUrl}`;
      }
    }
  } catch {
    // CMS unreachable — fall through to base64
  }
  return null;
}

/**
 * Host cap on total tool-result characters, and the margin held back from it.
 *
 * Past the cap the host substitutes a file pointer, which downstream arrives
 * as unparseable text. The budget for images is what remains after the JSON,
 * computed per call rather than fixed: this helper serves a bare screenshot
 * whose JSON is ~450 characters and audits whose JSON runs to tens of
 * thousands, and one constant cannot be right for both. A fixed 120k budget
 * dropped a 144,731-character screenshot that would have fitted beside 448
 * characters of JSON with room to spare.
 */
const RESULT_CAP = 150_000;
const RESULT_MARGIN = 6_000;

export function buildContentWithScreenshots(
  data: Record<string, unknown>,
  ...screenshotPaths: (string | undefined)[]
): ContentBlock[] {
  // In remote mode, upload screenshots to CMS for public URLs
  // and include both the image content block AND a URL in the JSON
  if (getRemoteMode()) {
    const imageBlocks: ContentBlock[] = [];
    const files: string[] = [];
    const urls: string[] = [];
    let omitted = 0;
    // Reserve what the JSON already costs, plus the fields about to be added.
    let remaining = RESULT_CAP - RESULT_MARGIN - JSON.stringify(data).length;

    for (const path of screenshotPaths) {
      if (!path) continue;

      // Published to the artifact store regardless of whether it rides inline,
      // so a view always has something to fetch. artifact_fetch serves this
      // directory, and the sandbox cannot load the public URL directly.
      try {
        const buf = readFileSync(path);
        const written = writeArtifact(buf, basename(path));
        if (written) { files.push(basename(written.path)); urls.push(written.url); }
      } catch { /* publishing is additive; the inline block still stands */ }

      const base64Data = screenshotToBase64(path);
      if (base64Data) {
        const base64Only = base64Data.split(",")[1];
        const mimeType = base64Data.split(";")[0].split(":")[1];
        if (base64Only.length <= remaining) {
          imageBlocks.push({ type: "image", data: base64Only, mimeType: mimeType });
          remaining -= base64Only.length;
        } else {
          // Publishing already happened above, so an omitted image is still
          // reachable -- by the view through artifact_fetch, or by URL.
          omitted++;
        }
      }
    }

    if (files.length) {
      data.screenshotFile = files.length === 1 ? files[0] : files;
      data.screenshotUrl = urls.length === 1 ? urls[0] : urls;
    }
    if (omitted > 0) {
      // Says what actually happened. The previous note claimed the image was
      // "included as image content blocks below" whether or not one was
      // emitted, so a caller that could not see an image was told to look for
      // one that was never sent -- worse than silence, because it sends them
      // hunting in the wrong place.
      data._screenshotOmitted = true;
      data._screenshotNote =
        `${omitted} screenshot(s) exceeded the inline budget and are NOT in this response. ` +
        `Retrieve with artifact_fetch({ file: screenshotFile }), or open screenshotUrl in a browser.`;
    } else if (screenshotPaths.filter(Boolean).length > 0) {
      data._screenshotNote = "Screenshots are included as image content blocks below. If images don't render inline, the screenshot data is available in the image blocks of this tool response.";
    }

    const content: ContentBlock[] = [
      { type: "text", text: JSON.stringify(data, null, 2) },
      ...imageBlocks,
    ];
    return content;
  }

  // Local mode: just return text with file paths
  return [
    { type: "text", text: JSON.stringify(data, null, 2) },
  ];
}

/**
 * Async version that uploads screenshots to CMS for public URLs.
 * Use this when you need URLs that Claude.ai can render as markdown images.
 */
export async function buildContentWithScreenshotUrls(
  data: Record<string, unknown>,
  ...screenshotPaths: (string | undefined)[]
): Promise<ContentBlock[]> {
  if (!getRemoteMode()) {
    return [{ type: "text", text: JSON.stringify(data, null, 2) }];
  }

  const imageBlocks: ContentBlock[] = [];
  const uploadedUrls: string[] = [];

  for (const path of screenshotPaths) {
    if (!path) continue;

    // Try to upload for a public URL
    const url = await uploadScreenshotToCMS(path);
    if (url) {
      uploadedUrls.push(url);
    }

    // Also include as base64 image block (belt and suspenders)
    const base64Data = screenshotToBase64(path);
    if (base64Data) {
      const base64Only = base64Data.split(",")[1];
      const mimeType = base64Data.split(";")[0].split(":")[1];
      imageBlocks.push({
        type: "image",
        data: base64Only,
        mimeType: mimeType,
      });
    }
  }

  // Add public URLs to the data so Claude can render them as markdown
  if (uploadedUrls.length > 0) {
    data.screenshotUrls = uploadedUrls;
    data._screenshotNote = "Screenshots uploaded to public URLs. Render with: ![Screenshot](" + uploadedUrls[0] + ")";
  }

  return [
    { type: "text", text: JSON.stringify(data, null, 2) },
    ...imageBlocks,
  ];
}
