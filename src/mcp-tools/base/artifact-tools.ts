/**
 * Artifact fetch for MCP Apps views.
 *
 * Views cannot load images the ordinary way. The widget sandbox allowlists a
 * fixed set of origins that does not include cbrowser.ai, so an <img> pointed
 * at an artifact URL renders broken; and the image cannot ride in the tool
 * result either, because hosts truncate results near 150k characters and
 * substitute a file pointer, which reaches the widget as unparseable text.
 *
 * The remaining channel is callServerTool: the view fetches the bytes itself,
 * after mount, over the MCP connection. This tool is that endpoint.
 */
import { z } from "zod";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { artifactDir } from "../../artifact-store.js";
import { fitImageForInline } from "../inline-image.js";
import { MAX_RESPONSE_SIZE } from "../screenshot-utils.js";
import type { McpServer } from "../types.js";

/** Largest artifact returned inline. Base64 adds a third on top of this. */
const MAX_BYTES = 3_500_000;

/**
 * Base64 budget for an image this tool returns by default.
 *
 * The comment above says it: hosts truncate a tool result near 150k chars. That
 * holds for a view's callServerTool too. A 1280x800 attention heatmap PNG is
 * ~666k chars of base64, so the attention view asked for it, the host cut it,
 * and the panel showed no image -- while the tool result it rendered from
 * carried a perfectly good inline preview it never reads (Alexa, 2026-10-09:
 * "the attention analysis image doesn't load inline again"). Images over this
 * are fitted (JPEG quality ladder, then downscale) unless `full: true`.
 */
const VIEW_IMAGE_BUDGET = MAX_RESPONSE_SIZE - 10_000;

const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp",
};

export function registerArtifactTools(server: McpServer): void {
  server.registerTool("artifact_fetch", {
    title: "Fetch Artifact",
    description: "Fetch a generated image artifact (heatmap, diff, capture frame) as inline image data. Called by interactive views to display images the widget sandbox cannot load by URL; not usually needed directly.",
    inputSchema: {
      file: z.string().describe("Artifact filename as returned by the producing tool, e.g. 'heatmap-abc123.png'"),
      full: z.boolean().optional().describe("Return the original bytes even when they exceed the host's ~150k-char result cap (a host may then truncate the result). Default false: a larger still image comes back as a JPEG fitted under the cap."),
    },
    annotations: {
      title: "Fetch Artifact",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    // Hidden from the model's tool list: it exists for views to call, and an
    // agent reaching for it directly would be fetching bytes it cannot use.
    _meta: { ui: { visibility: ["app"] } },
  }, async ({ file, full }) => {
      // basename strips any directory component, so a traversal attempt
      // resolves to a plain name inside the artifact dir rather than escaping it.
      // The name is then re-validated, because basename alone would happily
      // return something like ".." on its own.
      const safe = basename(String(file));
      const ext = extname(safe).toLowerCase();
      if (!/^[A-Za-z0-9._-]+$/.test(safe) || safe.startsWith(".") || !MIME[ext]) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Invalid artifact name." }) }],
          isError: true,
        };
      }
      const path = join(artifactDir(), safe);
      if (!existsSync(path)) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: `No such artifact: ${safe}` }) }],
          isError: true,
        };
      }
      const size = statSync(path).size;
      if (size > MAX_BYTES) {
        return {
          content: [{ type: "text", text: JSON.stringify({
            error: `Artifact is ${(size / 1e6).toFixed(1)}MB, over the ${(MAX_BYTES / 1e6).toFixed(1)}MB inline limit.`,
          }) }],
          isError: true,
        };
      }
      const bytes = readFileSync(path);
      const base64 = bytes.toString("base64");
      // Animated GIFs are never re-encoded: a JPEG would keep one frame.
      if (full !== true && ext !== ".gif" && base64.length > VIEW_IMAGE_BUDGET) {
        const fitted = await fitImageForInline(bytes, VIEW_IMAGE_BUDGET).catch(() => null);
        if (fitted) {
          return {
            content: [{ type: "image" as const, data: fitted.data, mimeType: fitted.mimeType }],
            _meta: { fitted: { width: fitted.width, height: fitted.height, sourceWidth: fitted.sourceWidth, sourceHeight: fitted.sourceHeight, quality: fitted.quality, originalBase64Chars: base64.length } },
          };
        }
      }
      return {
        content: [{
          type: "image" as const,
          data: base64,
          mimeType: MIME[ext] as string,
        }],
      };
    }
  );
}
