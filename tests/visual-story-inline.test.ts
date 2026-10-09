/**
 * visual_cognitive_story carries every overlay inline, and stays under the cap.
 *
 * It pushed up to four full-resolution PNG overlays inline with no budget at
 * all: on a busy page that is megabytes against the host's ~150k-character
 * cap, past which the host swaps the whole result for a file pointer. Now each
 * overlay goes out as a JPEG preview, the budget split between them, with
 * imagePreviews saying what each one is and the full PNGs under images.
 *
 * Its own file, apart from attention-heatmap-inline.test.ts: a third
 * attention-pipeline call in one process intermittently stalls (seen on
 * 19.2.0 too), so each file keeps to the calls it needs.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveFixtures } from "./fixtures/serve-fixtures.js";

process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-story-inline-data-"));
process.env.CBROWSER_ARTIFACT_DIR = mkdtempSync(join(tmpdir(), "cb-story-inline-art-"));
delete process.env.ANTHROPIC_API_KEY;

const { registerAuditTools } = await import("../src/mcp-tools/base/audit-tools.js");
const { MAX_RESPONSE_SIZE } = await import("../src/mcp-tools/screenshot-utils.js");

type Block = { type: string; text?: string; data?: string; mimeType?: string };
type Handler = (args: Record<string, unknown>) => Promise<{ content: Block[]; isError?: boolean }>;

const handlers: Record<string, Handler> = {};
registerAuditTools({
  registerTool: (name: string, _cfg: unknown, handler: Handler) => { handlers[name] = handler; },
  tool: () => {}, registerResource: () => {}, resource: () => {},
} as never);

let fixtures: Awaited<ReturnType<typeof serveFixtures>>;

beforeAll(async () => { fixtures = await serveFixtures(); });

afterAll(async () => {
  await fixtures.close();
  for (const dir of [process.env.CBROWSER_DATA_DIR!, process.env.CBROWSER_ARTIFACT_DIR!]) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe("visual_cognitive_story", () => {
  test("every overlay rides along as a preview, text plus all images under the cap", async () => {
    const result = await handlers.visual_cognitive_story({
      url: `${fixtures.base}noisy-page.html`, persona: "cognitive-adhd", useValues: false, aiLayer: false,
    });
    expect(result.isError).toBeUndefined();
    const content = result.content;
    expect(Buffer.byteLength(JSON.stringify(content))).toBeLessThanOrEqual(MAX_RESPONSE_SIZE);
    const data = JSON.parse(content[0].text!);

    const images = content.filter((b) => b.type === "image");
    const previews = Object.entries(data.imagePreviews as Record<string, { inline: boolean }>);
    // The attention, motor and combined overlays are drawn on any page with a
    // button; quality also needs a hotspot on a classified element.
    expect(previews.length).toBeGreaterThanOrEqual(3);
    for (const [name, preview] of previews) {
      expect(preview.inline).toBe(true);
      expect(typeof data.images[name]).toBe("string");
    }
    expect(images.length).toBe(previews.length);
    for (const img of images) expect(img.mimeType).toBe("image/jpeg");
  }, 180_000);
});
