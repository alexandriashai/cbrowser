/**
 * Generated overlays come back inline as previews fitted to the result cap.
 *
 * attention_analysis stopped returning its heatmap: the PNG overlay is ~500 KB
 * (~670k characters of base64) and was inlined only under a fixed 100k budget,
 * so at real page sizes it was always dropped. Its siblings had the opposite
 * defect: attention_compare and visual_cognitive_story pushed full PNGs inline
 * with no budget at all, past the host's ~150k-character cap, where the host
 * swaps the whole result for a file pointer.
 *
 * Pinned here: the fitting helper (budget met, output really is JPEG), the
 * multi-image split (text plus every image under the cap), attention_analysis's
 * assembly, journey_heatmap_gif's budget check (it compared raw bytes to a
 * base64 cap), and a source guard so no tool goes back to pushing an image
 * block outside the budgeted paths.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { fitImageForInline, buildContentWithPreviews, contentSize } from "../src/mcp-tools/inline-image.js";
import { MAX_RESPONSE_SIZE } from "../src/mcp-tools/screenshot-utils.js";
import { assembleAttentionContent } from "../src/mcp-tools/base/visual-testing-tools.js";
import { journeyGifContent } from "../src/mcp-tools/base/gif-tools.js";

/** A 1280x800 PNG of seeded noise over a gradient: incompressible enough to be far over any inline budget. */
async function noisyPng(width = 1280, height = 800, seed = 7): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  let s = seed;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const n = s & 0x7f;
      const i = (y * width + x) * 3;
      raw[i] = (x * 255 / width + n) & 0xff;
      raw[i + 1] = (y * 255 / height + (n >> 1)) & 0xff;
      raw[i + 2] = (n * 2) & 0xff;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

type Block = { type: string; text?: string; data?: string; mimeType?: string };

describe("fitImageForInline", () => {
  test("a 1280x800 PNG far over budget comes back within budget, as a real JPEG", async () => {
    const png = await noisyPng();
    const budget = 100_000;
    expect(png.toString("base64").length).toBeGreaterThan(budget * 4);

    const fitted = await fitImageForInline(png, budget);
    expect(fitted).not.toBeNull();
    expect(fitted!.data.length).toBeLessThanOrEqual(budget);
    expect(fitted!.mimeType).toBe("image/jpeg");
    expect(fitted!.sourceWidth).toBe(1280);
    expect(fitted!.sourceHeight).toBe(800);

    // Decoded, not trusted: the bytes are a JPEG of the dimensions reported.
    const meta = await sharp(Buffer.from(fitted!.data, "base64")).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(fitted!.width);
    expect(meta.height).toBe(fitted!.height);
    // Aspect ratio survives the downscale.
    expect(Math.abs(fitted!.width / fitted!.height - 1.6)).toBeLessThan(0.01);
  });

  test("a generous budget keeps full size and spends it on quality first", async () => {
    const png = await noisyPng(320, 200);
    const fitted = await fitImageForInline(png, 1_000_000);
    expect(fitted!.width).toBe(320);
    expect(fitted!.height).toBe(200);
    expect(fitted!.quality).toBe(80);
  });

  test("returns null when nothing useful fits, and for no budget at all", async () => {
    const png = await noisyPng();
    expect(await fitImageForInline(png, 300)).toBeNull();
    expect(await fitImageForInline(png, 0)).toBeNull();
    expect(await fitImageForInline(png, -5)).toBeNull();
  });

  test("returns null for bytes that are not an image", async () => {
    expect(await fitImageForInline(Buffer.from("not an image"), 100_000)).toBeNull();
  });
});

describe("buildContentWithPreviews", () => {
  test("four overlays and the JSON all fit under the cap together", async () => {
    const pngs = await Promise.all([1, 2, 3, 4].map((seed) => noisyPng(1280, 800, seed)));
    const data = { narrative: "x".repeat(8_000), url: "https://example.test/" };
    const names = ["attention", "motor", "quality", "combined"];

    const content = await buildContentWithPreviews(
      data,
      pngs.map((png, i) => ({ name: names[i], png, fullResolution: `images.${names[i]}` })),
      (previews) => ({ imagePreviews: previews }),
    ) as Block[];

    expect(contentSize(content)).toBeLessThanOrEqual(MAX_RESPONSE_SIZE);
    expect(content[0].type).toBe("text");
    const images = content.filter((b) => b.type === "image");
    expect(images.length).toBe(4);
    for (const img of images) expect(img.mimeType).toBe("image/jpeg");

    const parsed = JSON.parse(content[0].text!);
    expect(parsed.narrative.length).toBe(8_000);
    for (const name of names) {
      expect(parsed.imagePreviews[name].inline).toBe(true);
      expect(parsed.imagePreviews[name].mimeType).toBe("image/jpeg");
      expect(parsed.imagePreviews[name].fullSize).toBe("1280x800");
      expect(parsed.imagePreviews[name].note).toContain(`images.${name}`);
    }
  });

  test("a JSON that leaves no room ships text only and says the image is absent", async () => {
    const png = await noisyPng(640, 400);
    // Inside the margin already: no characters left for any image.
    const data = { blob: "y".repeat(MAX_RESPONSE_SIZE - 5_000) };
    const content = await buildContentWithPreviews(
      data,
      [{ name: "heatmap", png, fullResolution: "heatmapUrl" }],
      (p) => ({ heatmapPreview: p.heatmap }),
    ) as Block[];

    expect(content.filter((b) => b.type === "image").length).toBe(0);
    expect(contentSize(content)).toBeLessThanOrEqual(MAX_RESPONSE_SIZE);
    const parsed = JSON.parse(content[0].text!);
    expect(parsed.heatmapPreview.inline).toBe(false);
    expect(parsed.heatmapPreview.note).toMatch(/NOT in this response/);
    expect(parsed.heatmapPreview.note).toContain("heatmapUrl");
  });

  test("maxCharsPerImage caps a preview below the remaining budget", async () => {
    const png = await noisyPng();
    const content = await buildContentWithPreviews(
      { a: 1 },
      [{ name: "motor", png, fullResolution: "motorOverlayUrl" }],
      (p) => ({ motorOverlayPreview: p.motor }),
      { maxCharsPerImage: 40_000 },
    ) as Block[];
    const img = content.find((b) => b.type === "image");
    expect(img).toBeDefined();
    expect(img!.data!.length).toBeLessThanOrEqual(40_000);
  });
});

describe("attention_analysis assembly", () => {
  test("the heatmap rides along as an image block within the cap, described accurately", async () => {
    const png = await noisyPng();
    const data: Record<string, unknown> = {
      persona: "first-timer",
      topAttentionAreas: Array.from({ length: 20 }, (_, i) => ({ x: i, y: i, saliency: i / 20 })),
      heatmapUrl: "https://cbrowser.ai/heatmaps/attn-first-timer-1.png",
      heatmapFile: "attn-first-timer-1.png",
      heatmapNote: "Show this heatmap image to the user.",
    };
    const content = await assembleAttentionContent(
      data, png, "the PNG at heatmapUrl, or artifact_fetch({ file: heatmapFile })",
    ) as Block[];

    expect(contentSize(content)).toBeLessThanOrEqual(MAX_RESPONSE_SIZE);
    const images = content.filter((b) => b.type === "image");
    expect(images.length).toBe(1);
    expect(images[0].mimeType).toBe("image/jpeg");
    expect((await sharp(Buffer.from(images[0].data!, "base64")).metadata()).format).toBe("jpeg");

    const parsed = JSON.parse(content[0].text!);
    expect(parsed.inlineHeatmapOmitted).toBeUndefined();
    expect(parsed.heatmapNote).toBe("Show this heatmap image to the user.");
    expect(parsed.heatmapFile).toBe("attn-first-timer-1.png");
    expect(parsed.heatmapPreview.inline).toBe(true);
    expect(parsed.heatmapPreview.mimeType).toBe("image/jpeg");
    expect(parsed.heatmapPreview.fullSize).toBe("1280x800");
    expect(parsed.heatmapPreview.size).toMatch(/^\d+x\d+$/);
    expect(parsed.heatmapPreview.base64Chars).toBe(images[0].data!.length);
    expect(parsed.heatmapPreview.note).toContain("heatmapUrl");
  });

  test("no heatmap requested means a text-only result", async () => {
    const content = await assembleAttentionContent({ hasHeatmap: false }, undefined, "") as Block[];
    expect(content.length).toBe(1);
    expect(JSON.parse(content[0].text!).heatmapPreview).toBeUndefined();
  });
});

describe("journey_heatmap_gif budget", () => {
  const data = { url: "https://example.test/", gifUrl: "https://cbrowser.ai/heatmaps/journey-x.gif" };

  test("a GIF under the old 190 KB raw gate but over the cap in base64 is left out, and the result says so", () => {
    const gif = Buffer.alloc(180_000, 7); // 240k characters of base64
    const content = journeyGifContent(data, gif) as Block[];
    expect(contentSize(content)).toBeLessThanOrEqual(MAX_RESPONSE_SIZE);
    expect(content.filter((b) => b.type === "image").length).toBe(0);
    const parsed = JSON.parse(content[0].text!);
    expect(parsed.gifInline).toBe(false);
    expect(parsed.gifNote).toContain("gifUrl");
  });

  test("a GIF that fits still rides along as image/gif", () => {
    const gif = Buffer.alloc(50_000, 7);
    const content = journeyGifContent(data, gif) as Block[];
    expect(content.length).toBe(2);
    expect(content[1].mimeType).toBe("image/gif");
    expect(JSON.parse(content[0].text!).gifInline).toBeUndefined();
  });
});

describe("source guard: image blocks only leave through budgeted paths", () => {
  // Each entry is a file allowed to build an MCP image block, and why.
  const ALLOWED: Record<string, string> = {
    "inline-image.ts": "the fitting helper itself",
    "screenshot-utils.ts": "screenshots, budgeted against the JSON (buildContentWithScreenshots)",
    "artifact-tools.ts": "artifact_fetch, deliberately full size: it is the full-resolution channel",
    "capture-tools.ts": "capture_start's opening frame, compressed by browser.screenshot to the shared budget",
    "gif-tools.ts": "journey_heatmap_gif, measured against the cap (journeyGifContent)",
    "widget-kit.ts": "a widget block TYPE, not image data",
    "ui-resources.ts": "widget specs that fetch images through artifact_fetch",
  };

  test("no other MCP tool file constructs an image content block", () => {
    const root = resolve(import.meta.dir, "..", "src", "mcp-tools");
    const files = [
      ...readdirSync(root).filter((f) => f.endsWith(".ts")).map((f) => join(root, f)),
      ...readdirSync(join(root, "base")).filter((f) => f.endsWith(".ts")).map((f) => join(root, "base", f)),
    ];
    const offenders: string[] = [];
    for (const file of files) {
      const name = file.split("/").pop()!;
      if (ALLOWED[name]) continue;
      const src = readFileSync(file, "utf8");
      if (/type:\s*["']image["']/.test(src)) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });
});
