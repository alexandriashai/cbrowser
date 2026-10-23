/**
 * The attention tools build a persona's perceptual filter from its own
 * accessibility traits, as empathy_audit does (ISC-48).
 *
 * empathy_audit scores every persona that has no built-in perceptual profile
 * through a profile synthesized from accessibility traits. attention_analysis
 * and attention_compare passed none, so the same persona fell back to name
 * inference or the generic default there: a custom persona with low vision
 * on record was "synthesized" in one tool and "default" in the other, and the
 * four built-in accessibility personas without a perceptual profile
 * (autism-spectrum, intellectual-disability, aphasia-receptive, dyscalculia)
 * were drawn with the default filter on every attention map.
 *
 * The custom personas are named so that no name keyword infers a profile, so
 * "synthesized" can only come from the traits on record.
 *
 * runEmpathyAudit used to replace a CUSTOM persona's stored accessibilityTraits
 * with ones inferred from the name and cognitive traits, so both tools said
 * "synthesized" from different trait values. Since 2026-10-22 stored traits win
 * there too, and empathy_audit's own attention pass, journey_heatmap_gif and
 * the capture overlay pass the record's traits as well
 * (tests/attention-traits-callers.test.ts, tests/empathy-stored-traits.test.ts,
 * tests/saliency-overlay-traits.test.ts).
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CBROWSER_ARTIFACT_DIR = mkdtempSync(join(tmpdir(), "cb-attn-a11y-art-"));
process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-attn-a11y-data-"));
delete process.env.ANTHROPIC_API_KEY;

const { CBrowser } = await import("../src/browser.js");
const { registerVisualTestingTools } = await import("../src/mcp-tools/base/visual-testing-tools.js");
const { createCognitivePersona, saveCustomPersona } = await import("../src/personas.js");
const { runEmpathyAudit } = await import("../src/analysis/accessibility-empathy.js");

const WITH_TRAITS = "zz-qa-reader-traits";
const WITHOUT_TRAITS = "zz-qa-reader-plain";
const TRAITS = { patience: 0.5, curiosity: 0.5, readingTendency: 0.5, comprehension: 0.6 };

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Plans</title><style>
body{margin:0;font:16px sans-serif} header{height:80px;background:#223;color:#fff}
main{padding:24px} .cta{display:inline-block;padding:12px 24px;background:#06c;color:#fff}
</style></head><body><header><h1>Choose a plan</h1></header><main>
<p>Compare the plans below. Every plan includes support and a 30-day trial.</p>
<a class="cta" href="#start">Start free trial</a> <a href="#pricing">See pricing</a>
<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='120'%3E%3Crect width='200' height='120' fill='%23c63'/%3E%3C/svg%3E" width="200" height="120" alt="Plan chart">
</main></body></html>`;

type Block = { type: string; text?: string };
type Handler = (a: Record<string, unknown>) => Promise<{ isError?: boolean; content: Block[] }>;
let server: ReturnType<typeof Bun.serve>;
let browser: InstanceType<typeof CBrowser>;
let analysis: Handler;
let compare: Handler;
const TOKEN = "cb_attn_a11y";
const body = (r: { content: Block[] }) => JSON.parse(r.content.find((c) => c.type === "text")!.text!);
const url = () => `http://localhost:${server.port}/`;

beforeAll(async () => {
  for (const [name, a11y] of [[WITH_TRAITS, true], [WITHOUT_TRAITS, false]] as const) {
    const p = createCognitivePersona(name, "A careful reader used by the attention tests.", TRAITS);
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

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
  for (const dir of [process.env.CBROWSER_DATA_DIR!, process.env.CBROWSER_ARTIFACT_DIR!]) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}, 60_000);

describe("attention_analysis builds the filter from the persona's accessibility traits", () => {
  test("a custom persona with accessibility traits resolves 'synthesized'", async () => {
    const r = await analysis({ url: url(), _browserToken: TOKEN, persona: WITH_TRAITS, heatmap: false });
    expect(r.isError).toBeFalsy();
    expect(body(r).perceptualProfile).toEqual({ resolution: "synthesized", name: WITH_TRAITS });
  }, 120_000);

  test("one without them still falls back as before ('default': nothing in its name matches)", async () => {
    const r = await analysis({ url: url(), _browserToken: TOKEN, persona: WITHOUT_TRAITS, heatmap: false });
    expect(body(r).perceptualProfile).toEqual({ resolution: "default", name: "default" });
  }, 120_000);

  test("a built-in accessibility persona without a perceptual profile is synthesized from its record", async () => {
    for (const persona of ["autism-spectrum", "dyscalculia"]) {
      const r = await analysis({ url: url(), _browserToken: TOKEN, persona, heatmap: false });
      expect(body(r).perceptualProfile).toEqual({ resolution: "synthesized", name: persona });
    }
  }, 180_000);

  test("a built-in with its own perceptual profile is unchanged ('builtin' wins over traits)", async () => {
    const r = await analysis({ url: url(), _browserToken: TOKEN, persona: "low-vision-magnified", heatmap: false });
    expect(body(r).perceptualProfile).toEqual({ resolution: "builtin", name: "low-vision-magnified" });
  }, 120_000);
});

describe("attention_compare passes each persona's traits", () => {
  test("two personas identical but for accessibility traits on record now attend differently", async () => {
    // Same cognitive traits, no values, no goal: without the traits both
    // resolved to the default filter and the comparison was exactly 0.
    const r = await compare({ url: url(), _browserToken: TOKEN, personaA: WITH_TRAITS, personaB: WITHOUT_TRAITS });
    expect(r.isError).toBeFalsy();
    const b = body(r);
    expect(b.attentionDivergence).toBeGreaterThan(0);
    expect(b.personaA.entropy).not.toBe(b.personaB.entropy);
  }, 120_000);
});

describe("empathy_audit resolves the same persona through a synthesized profile too", () => {
  test("its perceptual noise penalty is a synthesized profile's, not the default's 0", async () => {
    // The default profile's noiseTolerance is 1, so its visual-complexity load
    // is 0; any synthesized profile for this persona has a lower tolerance.
    const audit = await runEmpathyAudit(url(), {
      disabilities: [WITH_TRAITS], wcagLevel: "AA", maxSteps: 1, maxTime: 10, headless: true, scope: "viewport",
    });
    const ctx = (audit.results[0] as unknown as { scoreContext: { visualComplexityCognitiveLoad: number } }).scoreContext;
    expect(ctx.visualComplexityCognitiveLoad).toBeGreaterThan(0);
  }, 180_000);
});
