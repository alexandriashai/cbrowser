/**
 * visual_cognitive_story draws attention through the persona's own
 * accessibility traits, as attention_analysis does (ISC-48).
 *
 * The story's attention pass called analyzeAttention with no accessibility
 * traits, so a persona with no built-in perceptual profile fell back to name
 * inference or the generic default: the four built-in accessibility personas
 * without one (autism-spectrum, intellectual-disability, aphasia-receptive,
 * dyscalculia) and every custom persona with traits on record were drawn with
 * a different filter from the one empathy_audit and attention_analysis use.
 * The story now passes the persona record's accessibilityTraits when it has
 * any, and reports which perceptual profile drew its attention map.
 *
 * Custom personas are named so that no name keyword infers a profile, so
 * "synthesized" can only come from the traits on record.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CBROWSER_ARTIFACT_DIR = mkdtempSync(join(tmpdir(), "cb-story-a11y-art-"));
process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-story-a11y-data-"));
delete process.env.ANTHROPIC_API_KEY;

const { CBrowser } = await import("../src/browser.js");
const { registerAuditTools } = await import("../src/mcp-tools/base/audit-tools.js");
const { createCognitivePersona, saveCustomPersona } = await import("../src/personas.js");

const WITH_TRAITS = "zz-story-reader-traits";
const WITHOUT_TRAITS = "zz-story-reader-plain";
const TRAITS = { patience: 0.5, curiosity: 0.5, readingTendency: 0.5, comprehension: 0.6 };

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Plans</title><style>
body{margin:0;font:16px sans-serif} header{height:80px;background:#223;color:#fff}
main{padding:24px} .cta{display:inline-block;padding:12px 24px;background:#06c;color:#fff}
</style></head><body><header><h1>Choose a plan</h1></header><main>
<p>Compare the plans below. Every plan includes support and a 30-day trial.</p>
<a class="cta" href="#start">Start free trial</a> <a href="#pricing">See pricing</a>
</main></body></html>`;

type Block = { type: string; text?: string };
type Handler = (a: Record<string, unknown>) => Promise<{ isError?: boolean; content: Block[] }>;
let server: ReturnType<typeof Bun.serve>;
let browser: InstanceType<typeof CBrowser>;
let story: Handler;
const TOKEN = "cb_story_a11y";

beforeAll(async () => {
  for (const [name, a11y] of [[WITH_TRAITS, true], [WITHOUT_TRAITS, false]] as const) {
    const p = createCognitivePersona(name, "A careful reader used by the story tests.", TRAITS);
    if (a11y) {
      (p as unknown as { accessibilityTraits: Record<string, number> }).accessibilityTraits = {
        visionLevel: 0.3, contrastSensitivity: 0.4, processingSpeed: 0.5, attentionSpan: 0.6, fatigueSusceptibility: 0.5,
      };
    }
    saveCustomPersona(p);
  }
  server = Bun.serve({ port: 0, fetch: () => new Response(PAGE, { headers: { "content-type": "text/html" } }) });
  browser = new CBrowser({ headless: true, viewportWidth: 1280, viewportHeight: 800 });
  await browser.launch();
  registerAuditTools({
    registerTool: (name: string, _c: unknown, h: Handler) => { if (name === "visual_cognitive_story") story = h; },
    tool: () => {}, registerResource: () => {}, resource: () => {},
  } as never, {
    getBrowser: async () => browser,
    getBrowserByToken: async (t?: string) => { if (t !== TOKEN) throw new Error("bad token"); return { browser, token: TOKEN }; },
  } as never);
}, 60_000);

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
  for (const dir of [process.env.CBROWSER_DATA_DIR!, process.env.CBROWSER_ARTIFACT_DIR!]) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}, 60_000);

async function profileOf(persona: string) {
  const r = await story({ url: `http://localhost:${server.port}/`, persona, useValues: false, aiLayer: false, _browserToken: TOKEN });
  expect(r.isError).toBeFalsy();
  return JSON.parse(r.content.find((c) => c.type === "text")!.text!).attention?.perceptualProfile;
}

describe("visual_cognitive_story draws attention through the persona's accessibility traits", () => {
  test("a custom persona with accessibility traits resolves 'synthesized'", async () => {
    expect(await profileOf(WITH_TRAITS)).toEqual({ resolution: "synthesized", name: WITH_TRAITS });
  }, 120_000);

  test("one without them still falls back as before ('default': nothing in its name matches)", async () => {
    expect(await profileOf(WITHOUT_TRAITS)).toEqual({ resolution: "default", name: "default" });
  }, 120_000);

  test("a built-in accessibility persona without a perceptual profile is synthesized from its record", async () => {
    for (const persona of ["autism-spectrum", "dyscalculia"]) {
      expect(await profileOf(persona)).toEqual({ resolution: "synthesized", name: persona });
    }
  }, 180_000);

  test("a built-in with its own perceptual profile is unchanged ('builtin' wins over traits)", async () => {
    expect(await profileOf("low-vision-magnified")).toEqual({ resolution: "builtin", name: "low-vision-magnified" });
  }, 120_000);
});
