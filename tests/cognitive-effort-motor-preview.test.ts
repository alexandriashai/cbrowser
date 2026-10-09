/**
 * cognitive_effort shows its motor overlay inline, as a small preview.
 *
 * The overlay rode along only when its PNG was under 40k characters of base64,
 * which a real page's never is, so it was always dropped with a "too large to
 * inline" note and the model never saw it. Now a JPEG preview is fitted into
 * that same 40k, so the picture is always there and the result stays small;
 * the full PNG is still fetched on demand through artifact_fetch.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveFixtures } from "./fixtures/serve-fixtures.js";

process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-motor-preview-data-"));
process.env.CBROWSER_ARTIFACT_DIR = mkdtempSync(join(tmpdir(), "cb-motor-preview-art-"));
delete process.env.ANTHROPIC_API_KEY;

const { CBrowser } = await import("../src/browser.js");
const { registerPersonaComparisonTools } = await import("../src/mcp-tools/base/persona-comparison-tools.js");
const { MAX_RESPONSE_SIZE } = await import("../src/mcp-tools/screenshot-utils.js");

type Block = { type: string; text?: string; data?: string; mimeType?: string };
type Handler = (args: Record<string, unknown>) => Promise<{ content: Block[]; isError?: boolean }>;

let browser: InstanceType<typeof CBrowser>;
let fixtures: Awaited<ReturnType<typeof serveFixtures>>;
const handlers: Record<string, Handler> = {};

beforeAll(async () => {
  fixtures = await serveFixtures();
  browser = new CBrowser({ headless: true, viewportWidth: 1280, viewportHeight: 800 });
  registerPersonaComparisonTools({
    registerTool: (name: string, _cfg: unknown, handler: Handler) => { handlers[name] = handler; },
    tool: () => {}, registerResource: () => {}, resource: () => {},
  } as never, { getBrowser: async () => browser } as never);
});

afterAll(async () => {
  await browser.close();
  await fixtures.close();
  for (const dir of [process.env.CBROWSER_DATA_DIR!, process.env.CBROWSER_ARTIFACT_DIR!]) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe("cognitive_effort motor overlay", () => {
  test("rides along as a JPEG preview within its 40k inline footprint", async () => {
    const result = await handlers.cognitive_effort({
      url: `${fixtures.base}noisy-page.html`, persona: "first-timer", useValues: false, scope: "viewport",
    });
    expect(result.isError).toBeUndefined();
    const content = result.content;
    const data = JSON.parse(content[0].text!);
    expect(typeof data.motorOverlayUrl).toBe("string");

    const images = content.filter((b) => b.type === "image");
    expect(images.length).toBe(1);
    expect(images[0].mimeType).toBe("image/jpeg");
    expect(images[0].data!.length).toBeLessThanOrEqual(40_000);
    expect(Buffer.byteLength(JSON.stringify(content))).toBeLessThanOrEqual(MAX_RESPONSE_SIZE);

    expect(data.motorOverlayInline).toBeUndefined();
    expect(data.motorOverlayPreview.inline).toBe(true);
    expect(data.motorOverlayPreview.note).toContain("motorOverlayUrl");
    // The legend stays a legend: the chain view shows it beside the motor bar.
    expect(data.motorOverlayNote).toBe("Green = easy to click. Yellow = moderate difficulty. Red = motor barrier for this persona.");
  }, 180_000);
});
