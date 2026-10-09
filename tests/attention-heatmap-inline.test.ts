/**
 * attention_analysis returns its heatmap, and attention_compare stays under the cap.
 *
 * Reported against 19.2.0: "attention analysis doesn't return the visual
 * screenshot with heatmap". Reproduced live: the result held one text block,
 * `inlineHeatmapOmitted` and `heatmapUrl`, and no image. The overlay PNG of a
 * real page is far over the fixed 100k inline budget, so it was always
 * dropped. attention_compare had the mirror defect: it pushed its full PNG
 * inline with no budget, past the host's ~150k-character cap.
 *
 * Drives the REAL tool handlers against a real page, because the defect lived
 * in how the handler assembled its result, not in any helper: a page painted
 * with noise (fixtures/noisy-page.*) makes the overlay as incompressible as a
 * busy real site. visual_cognitive_story is in visual-story-inline.test.ts:
 * a third attention-pipeline call in one process intermittently stalls on
 * 19.2.0 as well as here, so each file keeps to two.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveFixtures } from "./fixtures/serve-fixtures.js";

process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-attn-inline-data-"));
process.env.CBROWSER_ARTIFACT_DIR = mkdtempSync(join(tmpdir(), "cb-attn-inline-art-"));
// No model call: the keyword path is deterministic and costs nothing.
delete process.env.ANTHROPIC_API_KEY;

const sharp = (await import("sharp")).default;
const { registerVisualTestingTools } = await import("../src/mcp-tools/base/visual-testing-tools.js");
const { MAX_RESPONSE_SIZE } = await import("../src/mcp-tools/screenshot-utils.js");

type Block = { type: string; text?: string; data?: string; mimeType?: string };
type Handler = (args: Record<string, unknown>) => Promise<{ content: Block[]; isError?: boolean }>;

const handlers: Record<string, Handler> = {};
const fakeServer = {
  registerTool: (name: string, _cfg: unknown, handler: Handler) => { handlers[name] = handler; },
  tool: () => {}, registerResource: () => {}, resource: () => {},
} as never;
registerVisualTestingTools(fakeServer);

let fixtures: Awaited<ReturnType<typeof serveFixtures>>;
let url = "";

beforeAll(async () => {
  fixtures = await serveFixtures();
  url = `${fixtures.base}noisy-page.html`;
});

afterAll(async () => {
  await fixtures.close();
  for (const dir of [process.env.CBROWSER_DATA_DIR!, process.env.CBROWSER_ARTIFACT_DIR!]) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

const size = (content: Block[]) => Buffer.byteLength(JSON.stringify(content));

describe("attention_analysis", () => {
  test("returns the heatmap as an inline image within the result cap", async () => {
    const result = await handlers.attention_analysis({
      url, persona: "first-timer", cellSize: 4, heatmap: true, useValues: false, freezeAnimations: false,
    });
    const content = result.content;
    expect(content[0].type).toBe("text");
    const data = JSON.parse(content[0].text!);

    // The full-resolution PNG is in the artifact store, at full size, and is
    // far over the old 100k budget: the case that used to come back imageless.
    expect(typeof data.heatmapFile).toBe("string");
    const pngPath = join(process.env.CBROWSER_ARTIFACT_DIR!, data.heatmapFile);
    expect(existsSync(pngPath)).toBe(true);
    const png = readFileSync(pngPath);
    expect((await sharp(png).metadata()).format).toBe("png");
    expect(png.toString("base64").length).toBeGreaterThan(100_000);

    const images = content.filter((b) => b.type === "image");
    expect(images.length).toBe(1);
    expect(images[0].mimeType).toBe("image/jpeg");
    expect((await sharp(Buffer.from(images[0].data!, "base64")).metadata()).format).toBe("jpeg");
    expect(size(content)).toBeLessThanOrEqual(MAX_RESPONSE_SIZE);

    expect(data.inlineHeatmapOmitted).toBeUndefined();
    expect(data.heatmapNote).toMatch(/Show this heatmap image to the user/);
    expect(data.heatmapPreview.inline).toBe(true);
    expect(data.heatmapPreview.mimeType).toBe("image/jpeg");
    expect(data.heatmapPreview.base64Chars).toBe(images[0].data!.length);
    expect(data.heatmapPreview.note).toContain("heatmapUrl");
  }, 180_000);
});

describe("attention_compare", () => {
  test("carries the comparison map as a preview and stays under the cap", async () => {
    const result = await handlers.attention_compare({ url, personaA: "first-timer", personaB: "power-user" });
    const content = result.content;
    const data = JSON.parse(content[0].text!);

    const images = content.filter((b) => b.type === "image");
    expect(images.length).toBe(1);
    expect(images[0].mimeType).toBe("image/jpeg");
    expect(size(content)).toBeLessThanOrEqual(MAX_RESPONSE_SIZE);
    expect(data.comparisonHeatmapPreview.inline).toBe(true);
    expect(data.comparisonHeatmapPreview.note).toContain("comparisonHeatmapUrl");
    expect(existsSync(join(process.env.CBROWSER_ARTIFACT_DIR!, data.comparisonHeatmapFile))).toBe(true);
  }, 180_000);
});
