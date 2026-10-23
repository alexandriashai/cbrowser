/**
 * Every attention caller draws a persona through the perceptual filter its own
 * accessibility traits give it, as attention_analysis does (ISC-48.1).
 *
 * attention_analysis and attention_compare pass the persona record's
 * accessibilityTraits to analyzeAttention (8d97c38). Three more callers did
 * not, so the same persona resolved "synthesized" there and "default" (or a
 * name-inferred built-in) here:
 *
 *   - empathy_audit's own attention pass, whose entropy, concentration and
 *     transport cost feed the perceptual score blended into empathyScore (here)
 *   - journey_heatmap_gif, every frame (tests/journey-gif-traits.test.ts)
 *   - the capture overlay (tests/saliency-overlay-traits.test.ts, no browser)
 *
 * And runEmpathyAudit replaced a custom persona's STORED accessibilityTraits
 * with ones inferred from its name and cognitive traits, so empathy_audit
 * scored a custom persona with low vision on record as fully sighted. Stored
 * traits now win; inference fills only the fields the record does not carry.
 *
 * The custom personas are named so that no name keyword infers a profile or a
 * disability, so "synthesized" and any vision loss can only come from the
 * traits on record.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CBROWSER_ARTIFACT_DIR = mkdtempSync(join(tmpdir(), "cb-attn-callers-art-"));
process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-attn-callers-data-"));
delete process.env.ANTHROPIC_API_KEY;

const { CBrowser } = await import("../src/browser.js");
const { createCognitivePersona, saveCustomPersona } = await import("../src/personas.js");
const { runEmpathyAudit } = await import("../src/analysis/accessibility-empathy.js");

const WITH_TRAITS = "zz-callers-reader-traits";
const WITHOUT_TRAITS = "zz-callers-reader-plain";
const TRAITS = { patience: 0.5, curiosity: 0.5, readingTendency: 0.5, comprehension: 0.6 };
const STORED = { visionLevel: 0.3, contrastSensitivity: 0.4, processingSpeed: 0.5, attentionSpan: 0.6, fatigueSusceptibility: 0.5 };

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Plans</title><style>
body{margin:0;font:16px sans-serif} header{height:80px;background:#223;color:#fff}
main{padding:24px} .cta{display:inline-block;padding:12px 24px;background:#06c;color:#fff}
</style></head><body><header><h1>Choose a plan</h1></header><main>
<p>Compare the plans below. Every plan includes support and a 30-day trial.</p>
<a class="cta" href="#start">Start free trial</a> <a href="#pricing">See pricing</a>
<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='120'%3E%3Crect width='200' height='120' fill='%23c63'/%3E%3C/svg%3E" width="200" height="120" alt="Plan chart">
</main></body></html>`;

let server: ReturnType<typeof Bun.serve>;
let browser: InstanceType<typeof CBrowser>;
const url = () => `http://localhost:${server.port}/`;

type EmpathyRow = {
  attentionAnalysis?: { perceptualProfile?: { resolution: string; name: string } };
  perceptualTransport?: { informationLoss: number };
};
// One shared page, because under Bun a runEmpathyAudit that launches its own
// browser hangs on its third call in one process (inside the first barrier
// detector's page.$$eval). It does not reproduce under Node, which the hosted
// servers run (four sequential own-browser audits on the 20.0.1 dist all return
// in about 2 s), so it is treated as a Bun or test-environment hang rather than
// a product bug and is not fixed. Unrelated to traits. (2026-10-22)
async function empathy(persona: string): Promise<EmpathyRow> {
  const audit = await runEmpathyAudit(url(), {
    disabilities: [persona], wcagLevel: "AA", maxSteps: 1, maxTime: 10, headless: true, scope: "viewport",
    page: (await browser.getPage()) as never,
  });
  return audit.results[0] as unknown as EmpathyRow;
}

beforeAll(async () => {
  for (const [name, a11y] of [[WITH_TRAITS, true], [WITHOUT_TRAITS, false]] as const) {
    const p = createCognitivePersona(name, "A careful reader used by the attention caller tests.", TRAITS);
    if (a11y) (p as unknown as { accessibilityTraits: Record<string, number> }).accessibilityTraits = { ...STORED };
    saveCustomPersona(p);
  }
  server = Bun.serve({ port: 0, fetch: () => new Response(PAGE, { headers: { "content-type": "text/html" } }) });
  browser = new CBrowser({ headless: true, persistent: false, viewportWidth: 1280, viewportHeight: 800 });
  await browser.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
  for (const dir of [process.env.CBROWSER_DATA_DIR!, process.env.CBROWSER_ARTIFACT_DIR!]) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}, 60_000);

describe("empathy_audit's attention pass uses the persona's stored accessibility traits", () => {
  test("a custom persona with accessibility traits on record resolves 'synthesized'", async () => {
    const r = await empathy(WITH_TRAITS);
    expect(r.attentionAnalysis?.perceptualProfile).toEqual({ resolution: "synthesized", name: WITH_TRAITS });
  }, 120_000);

  test("one without them still resolves as attention_analysis resolves it ('default')", async () => {
    const r = await empathy(WITHOUT_TRAITS);
    expect(r.attentionAnalysis?.perceptualProfile).toEqual({ resolution: "default", name: "default" });
  }, 120_000);

  test("a built-in accessibility persona without a perceptual profile is synthesized from its record", async () => {
    const r = await empathy("autism-spectrum");
    expect(r.attentionAnalysis?.perceptualProfile).toEqual({ resolution: "synthesized", name: "autism-spectrum" });
  }, 120_000);

  test("a built-in general persona keeps its built-in profile", async () => {
    const r = await empathy("first-timer");
    expect(r.attentionAnalysis?.perceptualProfile).toEqual({ resolution: "builtin", name: "first-timer" });
  }, 120_000);
});

describe("empathy_audit scores a custom persona with the traits it stores", () => {
  test("stored low vision is seen: information loss exceeds the same persona without it", async () => {
    // Identical cognitive traits and no name hints, so before the fix both
    // were scored with the same inferred traits (visionLevel 1.0) and lost the
    // same information to within run noise (about 0.001).
    const withTraits = await empathy(WITH_TRAITS);
    const without = await empathy(WITHOUT_TRAITS);
    const lossWith = withTraits.perceptualTransport!.informationLoss;
    const lossWithout = without.perceptualTransport!.informationLoss;
    expect(lossWith - lossWithout).toBeGreaterThan(0.01);
  }, 240_000);
});
