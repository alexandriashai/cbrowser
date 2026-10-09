/**
 * artifact_fetch returns images a host can actually deliver (2026-10-09).
 *
 * Views (MCP Apps) load images through artifact_fetch, and hosts truncate a
 * tool result near 150k characters -- a view's callServerTool included. A
 * 1280x800 attention heatmap PNG is ~666k chars of base64, so the attention
 * view's fetch was cut and the panel showed no image ("the attention analysis
 * image doesn't load inline again"). By default a still image over the cap now
 * comes back as a JPEG fitted under it; `full: true` returns the original.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import sharp from "sharp";

const dir = mkdtempSync(join(tmpdir(), "cb-artifact-fit-"));
process.env.CBROWSER_ARTIFACT_DIR = dir;
const { registerArtifactTools } = await import("../src/mcp-tools/base/artifact-tools.js");
const { MAX_RESPONSE_SIZE } = await import("../src/mcp-tools/screenshot-utils.js");

type Result = { isError?: boolean; content: Array<{ type: string; data?: string; mimeType?: string }> };
let fetchArtifact: (a: Record<string, unknown>) => Promise<Result>;
let bigPngBase64 = 0;

beforeAll(async () => {
  registerArtifactTools({
    registerTool: (name: string, _c: unknown, h: typeof fetchArtifact) => { if (name === "artifact_fetch") fetchArtifact = h; },
    tool: () => {}, registerResource: () => {}, resource: () => {},
  } as never);
  // Noise does not compress, so this PNG is far over the cap like a real heatmap.
  const { randomBytes } = await import("crypto");
  const raw = randomBytes(1280 * 800 * 3);
  const big = await sharp(raw, { raw: { width: 1280, height: 800, channels: 3 } }).png().toBuffer();
  writeFileSync(join(dir, "attn-big.png"), big);
  bigPngBase64 = big.toString("base64").length;
  const small = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#3366cc" } }).png().toBuffer();
  writeFileSync(join(dir, "attn-small.png"), small);
});

describe("artifact_fetch fits still images under the host cap", () => {
  test("precondition: the fixture is over the cap, like a 1280x800 heatmap", () => {
    expect(bigPngBase64).toBeGreaterThan(MAX_RESPONSE_SIZE);
  });

  test("default: an over-cap PNG comes back as a JPEG under the cap", async () => {
    const r = await fetchArtifact({ file: "attn-big.png" });
    expect(r.isError).toBeFalsy();
    const img = r.content.find((c) => c.type === "image")!;
    expect(img.mimeType).toBe("image/jpeg");
    expect(img.data!.length).toBeLessThan(MAX_RESPONSE_SIZE);
    const meta = await sharp(Buffer.from(img.data!, "base64")).metadata();
    expect(meta.format).toBe("jpeg");
  });

  test("full: true returns the original PNG bytes", async () => {
    const r = await fetchArtifact({ file: "attn-big.png", full: true });
    const img = r.content.find((c) => c.type === "image")!;
    expect(img.mimeType).toBe("image/png");
    expect(img.data!.length).toBe(bigPngBase64);
  });

  test("an image already under the cap is returned untouched", async () => {
    const r = await fetchArtifact({ file: "attn-small.png" });
    const img = r.content.find((c) => c.type === "image")!;
    expect(img.mimeType).toBe("image/png");
  });
});
