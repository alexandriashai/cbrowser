/**
 * attention_analysis and attention_compare say what their maps rest on.
 *
 * Every number the attention model computes with is registered
 * (provenance/attention.ts): published colour science, the gaze constants
 * fitted on UEyes eye-tracking, and hand-set weights and persona filters.
 * cognitive_effort already reported the map it draws as context with its own
 * block; the two attention tools, whose answer IS the map, reported none, and
 * attention_compare did not say which perceptual filter drew either map.
 *
 * Each answer now carries `attentionProvenance`: the constants the model read
 * for this answer, recorded in a block of its own (isolatedProvenanceAsync)
 * with the attention scope text, and compare carries each persona's
 * `perceptualProfile`.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
// Artifacts go to a temp dir, never the directory nginx serves.
process.env.CBROWSER_ARTIFACT_DIR ??= mkdtempSync(join(tmpdir(), "cb-artifacts-"));
process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-attn-answer-prov-"));

const { CBrowser } = await import("../src/browser.js");
const { registerVisualTestingTools } = await import("../src/mcp-tools/base/visual-testing-tools.js");
const { MODEL_PROVENANCE, ATTENTION_PROVENANCE_TEXT } = await import("../src/visual/model-provenance.js");

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>attn</title><style>
body{margin:0;font:16px sans-serif} header{height:80px;background:#222;color:#fff;padding:20px}
main{padding:40px} button{font-size:22px;padding:14px 28px;background:#06c;color:#fff;border:0}
</style></head><body><header><nav><a href="#">Home</a> <a href="#">Pricing</a></nav></header>
<main><h1>One clear heading</h1><p>Body text that a reader would scan before acting.</p><button>Start free</button></main></body></html>`;

type Handler = (a: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ type: string; text?: string }> }>;
let server: ReturnType<typeof Bun.serve>;
let browser: InstanceType<typeof CBrowser>;
let analysis: Handler;
let compare: Handler;
const TOKEN = "cb_attn_answer_prov";

beforeAll(async () => {
  server = Bun.serve({ port: 0, fetch: () => new Response(PAGE, { headers: { "content-type": "text/html" } }) });
  // One session browser for every call: the handlers reuse it instead of
  // launching their own, the way attention-session-scroll.test.ts runs.
  browser = new CBrowser({ headless: true, viewportWidth: 1280, viewportHeight: 800, persistent: false, skipSessionRestore: true });
  await browser.launch();
  await browser.navigate(`http://localhost:${server.port}/`);
  registerVisualTestingTools({
    registerTool: (name: string, _c: unknown, h: Handler) => {
      if (name === "attention_analysis") analysis = h;
      if (name === "attention_compare") compare = h;
    },
    tool: () => {}, registerResource: () => {}, resource: () => {},
  } as never, {
    getBrowser: async () => browser,
    getBrowserByToken: async (t?: string) => { if (t !== TOKEN) throw new Error("bad token"); return { browser, token: TOKEN }; },
  } as never);
}, 60_000);
afterAll(async () => { await browser?.close(); server?.stop(true); }, 60_000);

const body = (r: { content: Array<{ type: string; text?: string }> }) => JSON.parse(r.content.find((c) => c.type === "text")!.text!);

type Block = { counts: Record<string, number>; hypotheses: string[]; scope: string; note: string };
/** A block counts only registered attention-model constants, and lists exactly its hand-set ones. */
function expectAttentionBlock(p: Block) {
  expect(p).toBeTruthy();
  expect(p.scope).toBe(ATTENTION_PROVENANCE_TEXT.scope);
  expect(p.note).toBe(ATTENTION_PROVENANCE_TEXT.note);
  const total = Object.values(p.counts).reduce((a, b) => a + b, 0);
  expect(total).toBeGreaterThan(0);
  // The colour science is published and every map applies it.
  expect(p.counts.published).toBeGreaterThan(0);
  expect(p.hypotheses.length).toBe(p.counts.hypothesis);
  for (const id of p.hypotheses) {
    expect(MODEL_PROVENANCE[id]?.status).toBe("hypothesis");
    // The attention model's own constants: no chain, page-metric or
    // reference-curve id belongs in this block.
    expect(id.startsWith("attention.")).toBe(true);
  }
}

describe("attention_analysis carries its own block", () => {
  test("attentionProvenance counts what the map read, with the attention scope", async () => {
    const r = await analysis({ _browserToken: TOKEN, persona: "cognitive-adhd", heatmap: false });
    expect(r.isError).toBeFalsy();
    const b = body(r);
    expectAttentionBlock(b.attentionProvenance);
    expect(b.perceptualProfile).toEqual({ resolution: "builtin", name: "cognitive-adhd" });
  }, 120_000);

  test("a persona with no filter of its own says so: default, not a modelled filter", async () => {
    const b = body(await analysis({ _browserToken: TOKEN, persona: "careful-reader", heatmap: false }));
    expect(b.perceptualProfile.resolution).toBe("default");
    expectAttentionBlock(b.attentionProvenance);
  }, 120_000);
});

describe("attention_compare carries its own block and both filters", () => {
  test("attentionProvenance for both maps, and each persona's perceptualProfile", async () => {
    const r = await compare({ _browserToken: TOKEN, personaA: "cognitive-adhd", personaB: "careful-reader" });
    expect(r.isError).toBeFalsy();
    const b = body(r);
    expectAttentionBlock(b.attentionProvenance);
    expect(b.personaA.perceptualProfile).toEqual({ resolution: "builtin", name: "cognitive-adhd" });
    expect(b.personaB.perceptualProfile.resolution).toBe("default");
  }, 120_000);
});
