/**
 * journey_heatmap_gif draws every frame through the perceptual filter the
 * persona's own accessibility traits give it, as attention_analysis does
 * (ISC-48.1).
 *
 * It called analyzeAttention without the record's accessibilityTraits, so a
 * custom persona with low vision on record was animated with the generic
 * default filter while attention_analysis drew it "synthesized".
 *
 * Its own file because the tool launches its own browser on every call, and
 * under Bun a third browser launch in one test process can hang (it did, in 2
 * of 7 runs, when these tests shared a process with the empathy tests in
 * tests/attention-traits-callers.test.ts). Not reproduced under Node, which the
 * hosted servers run; treated as a Bun or test-environment hang, not fixed.
 * Two launches per process here. (2026-10-22)
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CBROWSER_ARTIFACT_DIR = mkdtempSync(join(tmpdir(), "cb-gif-traits-art-"));
process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-gif-traits-data-"));
delete process.env.ANTHROPIC_API_KEY;

const { registerGifTools } = await import("../src/mcp-tools/base/gif-tools.js");
const { createCognitivePersona, saveCustomPersona } = await import("../src/personas.js");

// Named so that no name keyword infers a profile: "synthesized" can only come
// from the traits on record.
const WITH_TRAITS = "zz-gif-reader-traits";
const WITHOUT_TRAITS = "zz-gif-reader-plain";

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
let gif: Handler;
const body = (r: { content: Block[] }) => JSON.parse(r.content.find((c) => c.type === "text")!.text!);
const run = (persona: string) =>
  gif({ url: `http://localhost:${server.port}/`, persona, goal: "start a free trial", maxSteps: 2, frameDelay: 200 });

beforeAll(() => {
  for (const [name, a11y] of [[WITH_TRAITS, true], [WITHOUT_TRAITS, false]] as const) {
    const p = createCognitivePersona(name, "A careful reader used by the journey GIF tests.", {
      patience: 0.5, curiosity: 0.5, readingTendency: 0.5, comprehension: 0.6,
    });
    if (a11y) {
      (p as unknown as { accessibilityTraits: Record<string, number> }).accessibilityTraits = {
        visionLevel: 0.3, contrastSensitivity: 0.4, processingSpeed: 0.5, attentionSpan: 0.6, fatigueSusceptibility: 0.5,
      };
    }
    saveCustomPersona(p);
  }
  server = Bun.serve({ port: 0, fetch: () => new Response(PAGE, { headers: { "content-type": "text/html" } }) });
  registerGifTools({
    registerTool: (name: string, _c: unknown, h: Handler) => { if (name === "journey_heatmap_gif") gif = h; },
    tool: () => {}, registerResource: () => {}, resource: () => {},
  } as never, { getBrowser: async () => { throw new Error("unused"); } } as never);
});

afterAll(() => {
  server?.stop(true);
  for (const dir of [process.env.CBROWSER_DATA_DIR!, process.env.CBROWSER_ARTIFACT_DIR!]) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe("journey_heatmap_gif draws its frames with the persona's stored traits", () => {
  test("a custom persona with accessibility traits on record resolves 'synthesized'", async () => {
    const r = await run(WITH_TRAITS);
    expect(r.isError).toBeFalsy();
    expect(body(r).perceptualProfile).toEqual({ resolution: "synthesized", name: WITH_TRAITS });
  }, 120_000);

  test("one without them falls back as before ('default')", async () => {
    const r = await run(WITHOUT_TRAITS);
    expect(r.isError).toBeFalsy();
    expect(body(r).perceptualProfile).toEqual({ resolution: "default", name: "default" });
  }, 120_000);
});
