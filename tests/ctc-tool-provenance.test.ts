/**
 * The two tools that hand customers a cognitive transport score say what the
 * score rests on.
 *
 * cognitive_effort and site_cognitive_assessment build the page's demand and
 * run the chain under withProvenance and attach a `modelProvenance` summary:
 * status counts of every registry constant the answer read, and the ids of the
 * hand-set ones. Nothing in the chain is fitted or published today, so the
 * hypothesis count must be above zero and the fitted/published counts zero; a
 * response that said otherwise would be claiming calibration that does not
 * exist.
 *
 * The block has to cover the whole answer, not the last step of it. Through
 * 21.0 the demand curves (35 hand-set weights that turn page metrics into
 * per-trait demand) ran outside the recording, so the block listed 22
 * hypotheses for an answer that read 57. Each tool block is now compared with
 * the same demand + chain run under withProvenance directly.
 *
 * useValues goes through the chain's registered Schwartz modulation and nothing
 * else: the tool's numbers with useValues on equal computeSequentialCTC with
 * the persona's schwartzValues, on the same page.
 *
 * Since the recorder became async-safe (withProvenanceAsync), each tool's
 * handler is one recording (recordedAnswer) and the block is everything the
 * answer read across every await: the page measurement, the persona profile
 * (two distance.* constants, read by buildOTCognitiveProfile), the demand,
 * the chain and the verdict's band cut points. The direct runs below do the
 * same steps, page measurement included, inside withProvenanceAsync.
 *
 * Verdicts state the rank (visual/ctc-bands.ts): the interpretation and the
 * recommendations carry ctcRank's sentence for the chain run, and
 * visual_cognitive_story reports the same block and honours useValues.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveFixtures } from "./fixtures/serve-fixtures.js";

process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-ctc-prov-data-"));
process.env.CBROWSER_ARTIFACT_DIR = mkdtempSync(join(tmpdir(), "cb-ctc-prov-art-"));
delete process.env.ANTHROPIC_API_KEY;

const { CBrowser } = await import("../src/browser.js");
const { registerPersonaComparisonTools } = await import("../src/mcp-tools/base/persona-comparison-tools.js");
const { registerAuditTools } = await import("../src/mcp-tools/base/audit-tools.js");
const { withProvenance, withProvenanceAsync, readsOf, ATTENTION_PROVENANCE_TEXT } = await import("../src/visual/model-provenance.js");
const { ctcRank, ctcBandsDescription } = await import("../src/visual/ctc-bands.js");
const { computeDemandDistribution, computeSequentialCTC, computeSequentialScrollCTC } = await import("../src/visual/cognitive-transport-chain.js");
const { extractPageMetrics, extractPerScreenMetrics, measurePageGeometry } = await import("../src/visual/cognitive-transport.js");
const { ROSTER, toolProfile, schwartzFor } = await import("./fixtures/ctc-golden-matrix.js");

type Block = { type: string; text?: string };
type Handler = (args: Record<string, unknown>) => Promise<{ content: Block[]; isError?: boolean }>;
type Summary = { counts: Record<string, number>; hypotheses: string[]; scope: string; note: string };

let browser: InstanceType<typeof CBrowser>;
let fixtures: Awaited<ReturnType<typeof serveFixtures>>;
const handlers: Record<string, Handler> = {};
const CHAIN_OPTIONS = { asymmetric: true, interactions: true } as const;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

function expectHonestSummary(p: Summary) {
  expect(p.counts.hypothesis).toBeGreaterThan(0);
  expect(p.counts.definition).toBeGreaterThan(0);
  expect(p.counts.fitted).toBe(0);
  expect(p.counts.published).toBe(0);
  expect(p.hypotheses.length).toBe(p.counts.hypothesis);
  expect(p.hypotheses).toContain("chain.depletionRate");
  // The output logistic's constants are gone (totalCTC is a percentile since
  // 21.x); the percentile's reference is a definition, so it is counted there.
  expect(p.hypotheses).not.toContain("chain.ctcSigmoidSlope");
  // The score's hypotheses: the page-metric extraction, the chain, and the one
  // the persona profile reads. No attention.* id: an attention map drawn as
  // context carries its own block (expectAttentionBlock).
  expect(p.hypotheses.filter((id) => !id.startsWith("chain.") && !id.startsWith("pageMetrics.") && id !== "distance.missingTraitDefault")).toEqual([]);
  expect(p.note).toContain("hypothesis");
  // The scope says what the score block covers, and where the attention
  // model's constants (the fitted ones among them) are counted instead.
  expect(p.scope).toContain("demand");
  expect(p.scope).toContain("pageMetrics");
  expect(p.scope).toContain("does not count the attention model");
  expect(p.scope).toContain("carries its own block");
  expect(p.scope).toContain("0.7367");
}

/**
 * An attention map's own block: attention constants (published colour
 * science in every map; the fitted gaze calibration where the map applies
 * it), and none of its hypotheses in the score block beside it.
 */
function expectAttentionBlock(a: Summary | undefined, score: Summary, fitted: "some" | "none") {
  expect(a).toBeDefined();
  expect(a!.hypotheses.some((id) => id.startsWith("attention."))).toBe(true);
  if (fitted === "some") expect(a!.counts.fitted).toBeGreaterThan(0);
  else expect(a!.counts.fitted).toBe(0);
  expect(a!.counts.published).toBeGreaterThan(0);
  expect(a!.hypotheses.filter((id) => score.hypotheses.includes(id))).toEqual([]);
  expect(a!.scope).toBe(ATTENTION_PROVENANCE_TEXT.scope);
  expect(a!.note).toBe(ATTENTION_PROVENANCE_TEXT.note);
}

/** The demand curves are in the block: the part that was missing. */
function expectDemandCounted(p: Summary) {
  expect(p.hypotheses.filter((id) => id.startsWith("chain.demand.")).length).toBeGreaterThan(0);
}

/** Page metrics of whatever the shared browser is showing, measured as cognitive_effort measures them. */
async function metricsNow(scope: "viewport" | "full_page") {
  const page = await browser.getPage();
  return extractPageMetrics(page, scope, await measurePageGeometry(page));
}

/**
 * What the tool's answer reads, run directly: measure the page the shared
 * browser shows, build the persona's profile, score it, and state the rank.
 */
async function directAnswer(persona: string, scope: "viewport" | "full_page", options: Record<string, unknown> = CHAIN_OPTIONS, verdict = true) {
  return withProvenanceAsync(async () => {
    const metrics = await metricsNow(scope);
    const profile = toolProfile(persona, ROSTER[persona]);
    const result = computeSequentialCTC(profile, computeDemandDistribution(metrics), options);
    if (verdict) {
      ctcRank(result);
      ctcBandsDescription();
    }
    return result;
  });
}

const BAND_IDS = ["ctcBands.high", "ctcBands.top", "ctcBands.upperHalf"];

async function effort(args: Record<string, unknown>) {
  const result = await handlers.cognitive_effort({ scope: "viewport", useValues: false, ...args });
  expect(result.isError).toBeUndefined();
  return JSON.parse(result.content[0].text!);
}

beforeAll(async () => {
  fixtures = await serveFixtures();
  browser = new CBrowser({ headless: true, viewportWidth: 1280, viewportHeight: 800 });
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => { handlers[name] = handler; },
    tool: () => {}, registerResource: () => {}, resource: () => {},
  } as never;
  const context = {
    getBrowser: async () => browser,
    getBrowserByToken: async () => ({ browser, token: "shared" }),
  } as never;
  registerPersonaComparisonTools(server, context);
  registerAuditTools(server, context);
});

afterAll(async () => {
  await browser.close();
  await fixtures.close();
  for (const dir of [process.env.CBROWSER_DATA_DIR!, process.env.CBROWSER_ARTIFACT_DIR!]) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe("the scored persona's rates are reported apart from the score (personaRateProvenance)", () => {
  type RateBlock = Summary & { rates: string[] };
  test("cognitive_effort names the persona's two rates, published where measured, the same on a cold and a warm call", async () => {
    const url = `${fixtures.base}noisy-page.html`;
    const tremor = await effort({ url, persona: "motor-impairment-tremor" });
    const again = await effort({ url, persona: "motor-impairment-tremor" });
    const block = tremor.personaRateProvenance as RateBlock;
    expect(block.rates).toEqual(["personaRate.motor-impairment-tremor.pointing", "personaRate.motor-impairment-tremor.reading"]);
    expect(block.counts).toEqual({ fitted: 0, published: 1, definition: 0, hypothesis: 1 });
    expect(block.scope).toContain("reference population");
    expect(again.personaRateProvenance).toEqual(block);
    // The score's own block is untouched by the persona's rates.
    expectHonestSummary(tremor.modelProvenance as Summary);
    const first = (await effort({ url, persona: "first-timer" })).personaRateProvenance as RateBlock;
    expect(first.counts).toEqual({ fitted: 0, published: 0, definition: 0, hypothesis: 2 });
  }, 180_000);

  test("site_cognitive_assessment reports one section per scored persona", async () => {
    const result = await handlers.site_cognitive_assessment({
      url: `${fixtures.base}prose-page.html`, personas: "dyslexic-user,first-timer", threshold: 0, _browserToken: "shared",
    });
    const data = JSON.parse(result.content[0].text!);
    expect(Object.keys(data.personaRateProvenance).sort()).toEqual(["dyslexic-user", "first-timer"]);
    expect(data.personaRateProvenance["dyslexic-user"].rates).toEqual(["personaRate.dyslexic-user.pointing", "personaRate.dyslexic-user.reading"]);
    expect(data.personaRateProvenance["dyslexic-user"].counts.published).toBe(1);
    expectHonestSummary(data.modelProvenance as Summary);
  }, 240_000);
});

describe("tool responses carry the provenance of the whole answer", () => {
  test("cognitive_effort: the block equals demand + chain run under withProvenance directly", async () => {
    const data = await effort({ url: `${fixtures.base}noisy-page.html`, persona: "first-timer" });
    expect(data.modelProvenance).toBeDefined();
    const block = data.modelProvenance as Summary;
    expectDemandCounted(block);
    expectHonestSummary(block);
    // Still beside the numbers it describes.
    expect(typeof data.cognitiveTransportCost.total).toBe("number");

    const direct = await directAnswer("first-timer", "viewport");
    expect(block.hypotheses).toEqual(direct.provenance.hypotheses);
    expect(block.counts).toEqual(direct.provenance.counts);
    // And the same number, so the comparison is against the computation the tool ran.
    expect(data.cognitiveTransportCost.total).toBe(r3(direct.result.totalCTC));

    // The verdict is computed after the motor and readability awaits, so a
    // synchronous recording around the chain could not see its reads: the
    // three band cut points (definitions) are the difference.
    const withoutVerdict = await directAnswer("first-timer", "viewport", CHAIN_OPTIONS, false);
    expect(block.counts.definition).toBe(withoutVerdict.provenance.counts.definition + BAND_IDS.length);
    const verdictReads = readsOf(() => ctcRank(direct.result)).ids;
    for (const id of BAND_IDS) expect(verdictReads.has(id)).toBe(true);
  }, 180_000);

  test("cognitive_effort: the saliency overlay carries its own attention block, apart from the score's", async () => {
    const data = await effort({ url: `${fixtures.base}noisy-page.html`, persona: "first-timer" });
    const overlay = (data.layerOverlays as Array<{ layer: string; available: boolean; provenance?: Summary }>)
      .find((o) => o.layer === "visualComplexity")!;
    expect(overlay.available).toBe(true);
    // The Lab-space overlay is bottom-up colour contrast only: it reads the
    // published colour science and hand-set Lab weights, and no fitted gaze
    // constant (those enter where analyzeAttention calibrates a map).
    expectAttentionBlock(overlay.provenance, data.modelProvenance as Summary, "none");
    // And the score block is exactly the score's: no attention count leaked in.
    const direct = await directAnswer("first-timer", "viewport");
    expect((data.modelProvenance as Summary).counts).toEqual(direct.provenance.counts);
  }, 180_000);

  test("cognitive_effort states the rank: interpretation, band, rank and bands come from ctcRank", async () => {
    const data = await effort({ url: `${fixtures.base}noisy-page.html`, persona: "first-timer" });
    const direct = await directAnswer("first-timer", "viewport");
    const rank = ctcRank(direct.result);
    expect(data.cognitiveTransportCost.band).toBe(rank.band);
    expect(data.cognitiveTransportCost.rank).toBe(rank.sentence);
    expect(data.cognitiveTransportCost.referenceScope).toBe("viewport");
    expect(data.interpretation).toStartWith(`For first-timer, the top of this page is ${rank.statement}. ${rank.bandSentence} Bottleneck: ${direct.result.bottleneckLayer}.`);
    expect(data.interpretation).not.toMatch(/comfortabl|struggl|likely to abandon|moderate cognitive effort/i);
    expect(data.cognitiveTransportCost.interpretationBands).toContain(ctcBandsDescription());
    expect(data.cognitiveTransportCost.chainNote).not.toMatch(/sigmoid/);
  }, 180_000);

  test("cognitive_effort at scope 'sequential': the block also covers the per-screen curve", async () => {
    const data = await effort({ url: `${fixtures.base}noisy-page.html`, persona: "first-timer", scope: "sequential" });
    expect(data.sequential?.error).toBeUndefined();
    const block = data.modelProvenance as Summary;
    expectDemandCounted(block);
    expectHonestSummary(block);

    // Which ids are read does not depend on the page, so one screen reads what
    // the tool's screens read. extractPerScreenMetrics measures each screen at
    // viewport scope, so screens are ranked against the viewport reference and
    // the aggregate against the full_page one: the answer reads both.
    const metrics = await metricsNow("full_page");
    const screen = await metricsNow("viewport");
    const profile = toolProfile("first-timer", ROSTER["first-timer"]);
    const direct = await withProvenanceAsync(async () => {
      await metricsNow("full_page");
      const p = toolProfile("first-timer", ROSTER["first-timer"]);
      const aggregate = computeSequentialCTC(p, computeDemandDistribution(metrics), CHAIN_OPTIONS);
      ctcRank(aggregate);
      ctcBandsDescription();
      return computeSequentialScrollCTC(p, [computeDemandDistribution(screen)], CHAIN_OPTIONS);
    });
    const screenReads = readsOf(() => computeSequentialScrollCTC(profile, [computeDemandDistribution(screen)], CHAIN_OPTIONS)).ids;
    const aggregateReads = readsOf(() => computeSequentialCTC(profile, computeDemandDistribution(metrics), CHAIN_OPTIONS)).ids;
    expect(screenReads.has("ctcReference.viewport")).toBe(true);
    expect(aggregateReads.has("ctcReference.full_page")).toBe(true);
    expect(block.hypotheses).toEqual(direct.provenance.hypotheses);
    // chain.depthRoundingScale (a definition) is read by the curve alone.
    expect(block.counts).toEqual(direct.provenance.counts);
  }, 180_000);

  test("cognitive_effort at scope 'sequential' reports the mean screen percentile, not the sum", async () => {
    const data = await effort({ url: `${fixtures.base}noisy-page.html`, persona: "first-timer", scope: "sequential" });
    const seq = data.sequential;
    expect(seq.reachWeightedCTC).toBeUndefined();
    expect(seq.screenCTCNote).toMatch(/percentile/);
    // The same per-screen measurement the tool took, scored directly.
    const page = await browser.getPage();
    const screens = await extractPerScreenMetrics(page, 20, await measurePageGeometry(page));
    const curve = computeSequentialScrollCTC(toolProfile("first-timer", ROSTER["first-timer"]), screens.map((m) => computeDemandDistribution(m)), CHAIN_OPTIONS);
    expect(seq.curve.map((c: { screenCTC: number }) => c.screenCTC)).toEqual(curve.screens.map((x) => x.screenCTC));
    const reach = curve.screens.reduce((a, x) => a + x.reachProbability, 0);
    const mean = curve.screens.reduce((a, x) => a + x.reachProbability * x.screenCTC, 0) / reach;
    expect(seq.reachWeightedMeanScreenCTC).toBe(r3(mean));
    // A mean of percentiles is a percentile; the sum it replaces was not.
    expect(seq.reachWeightedMeanScreenCTC).toBeGreaterThanOrEqual(0);
    expect(seq.reachWeightedMeanScreenCTC).toBeLessThanOrEqual(1);
  }, 180_000);

  test("site_cognitive_assessment reports the same block once gate 3 has run", async () => {
    const result = await handlers.site_cognitive_assessment({
      // prose-page.html: enough elements and body text to pass the gate-1 empty-page
      // check (noisy-page.html and keyboard.html have under 50 characters of body,
      // which gate 1 reads as bot-blocked).
      url: `${fixtures.base}prose-page.html`, personas: "first-timer,cognitive-adhd", threshold: 0, _browserToken: "shared",
    });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text!);
    expect(data.gate3?.status).toBe("complete");
    expect(data.modelProvenance).toBeDefined();
    const block = data.modelProvenance as Summary;
    expectDemandCounted(block);
    expectHonestSummary(block);

    const direct = await directAnswer("cognitive-adhd", "viewport");
    expect(block.hypotheses).toEqual(direct.provenance.hypotheses);
    expect(block.counts).toEqual(direct.provenance.counts);

    // Recommendations state each persona's rank, never a bare CTC number.
    for (const persona of ["first-timer", "cognitive-adhd"]) {
      const d = await directAnswer(persona, "viewport");
      const rank = ctcRank(d.result);
      expect(data.gate3.personas[persona].band).toBe(rank.band);
      expect(data.gate3.personas[persona].totalCTC).toBe(r3(d.result.totalCTC));
      const rec = (data.recommendations as string[]).find((r) => r.startsWith(`${persona}:`))!;
      expect(rec).toBe(`${persona}: reduce ${d.result.bottleneckLayer} complexity first, the costliest layer. ${rank.sentence}`);
    }
    expect((data.recommendations as string[]).join(" ")).not.toContain("CTC=");
  }, 240_000);
});

describe("useValues has one path: the chain's registered modulation", () => {
  const persona = "first-timer";
  const url = () => `${fixtures.base}prose-page.html`;

  test("cognitive_effort with useValues equals computeSequentialCTC with the persona's schwartzValues", async () => {
    const own = schwartzFor(persona);
    expect(own.source).toBe(persona); // the persona's own values, not the fixture's fallback

    const off = await effort({ url: url(), persona, useValues: false });
    const on = await effort({ url: url(), persona, useValues: true });
    const plain = (await directAnswer(persona, "viewport")).result;
    const valued = await directAnswer(persona, "viewport", { ...CHAIN_OPTIONS, schwartzValues: own.values });

    // Guard: the re-measured page is the page the tool scored.
    expect(off.cognitiveTransportCost.total).toBe(r3(plain.totalCTC));
    // The claim: with values on, the tool's numbers are the chain's.
    expect(valued.result.totalCTC).not.toBe(plain.totalCTC); // values move this page, so the check has teeth
    expect(on.cognitiveTransportCost.total).toBe(r3(valued.result.totalCTC));
    expect(on.cognitiveTransportCost.raw).toBe(r3(valued.result.rawCTC));
    expect(on.layers.map((l: { name: string; cost: number }) => [l.name, l.cost]))
      .toEqual(valued.result.layers.map((l) => [l.name, r3(l.transportCost)]));

    // Every modulation coefficient the chain could apply is in the block, and
    // the block is exactly the direct run's.
    const block = on.modelProvenance as Summary;
    expectHonestSummary(block);
    expect(block.hypotheses.filter((id) => id.startsWith("chain.valueModulation.")).length).toBe(11);
    expect(block.hypotheses).toEqual(valued.provenance.hypotheses);
    expect(block.counts).toEqual(valued.provenance.counts);

    // And the response says values were applied, with the scores it used.
    expect(on.valueModulation?.applied).toBe(true);
    expect(on.valueModulation?.scores).toEqual(own.values);
    expect(off.valueModulation).toBeUndefined();
  }, 240_000);
});

describe("visual_cognitive_story: the effort summary's block, rank and values", () => {
  const persona = "first-timer";
  const url = () => `${fixtures.base}prose-page.html`;
  const FEELING = /comfort|struggl|easy|easily|difficult|burden|pushes through|can use this page|works for/i;

  async function story(useValues: boolean) {
    const result = await handlers.visual_cognitive_story({ url: url(), persona, useValues, aiLayer: false, _browserToken: "shared" });
    expect(result.isError).toBeUndefined();
    return JSON.parse(result.content[0].text!);
  }

  /** The narrative between one "### " heading and the next. */
  const section = (narrative: string, heading: string) => narrative.split("### ").find((x) => x.startsWith(heading)) ?? "";

  test("reports the same modelProvenance block as cognitive_effort, covering the effort summary", async () => {
    const data = await story(false);
    expect(data.modelProvenance).toBeDefined();
    const block = data.modelProvenance as Summary;
    expectDemandCounted(block);
    expectHonestSummary(block);
    const direct = await directAnswer(persona, "viewport");
    // The attention steps record into attentionProvenance, so the story's
    // score block is exactly the effort summary's.
    expect(block.hypotheses).toEqual(direct.provenance.hypotheses);
    expect(block.counts).toEqual(direct.provenance.counts);
    expect(data.effort.totalCTC).toBe(r3(direct.result.totalCTC));
    expect(data.valueModulation).toBeUndefined();
  }, 240_000);

  test("its attention analysis carries its own block, attentionProvenance, apart from the score's", async () => {
    const data = await story(false);
    // analyzeAttention applies the fitted gaze calibration.
    expectAttentionBlock(data.attentionProvenance, data.modelProvenance as Summary, "some");
  }, 240_000);

  test("its effort section and verdict state the rank and claim nothing about feelings", async () => {
    const data = await story(false);
    const direct = await directAnswer(persona, "viewport");
    const rank = ctcRank(direct.result);
    expect(data.effort.rank).toBe(rank.sentence);
    expect(data.effort.band).toBe(rank.band);
    expect(data.effort.referenceScope).toBe("viewport");
    const effortText = section(data.narrative, "The Effort");
    expect(effortText).toContain(rank.sentence);
    expect(effortText).not.toMatch(FEELING);
    expect(section(data.narrative, "The Verdict")).not.toMatch(FEELING);
  }, 240_000);

  test("useValues reaches the chain: the effort numbers equal the chain run with the persona's scores", async () => {
    const own = schwartzFor(persona);
    expect(own.source).toBe(persona);
    const on = await story(true);
    const plain = (await directAnswer(persona, "viewport")).result;
    const valued = await directAnswer(persona, "viewport", { ...CHAIN_OPTIONS, schwartzValues: own.values });
    expect(valued.result.totalCTC).not.toBe(plain.totalCTC); // values move this page
    expect(on.effort.totalCTC).toBe(r3(valued.result.totalCTC));
    expect(on.effort.raw).toBe(r3(valued.result.rawCTC));
    expect(on.effort.layers.map((l: { name: string; cost: number }) => [l.name, l.cost]))
      .toEqual(valued.result.layers.map((l) => [l.name, r3(l.transportCost)]));
    expect(on.valueModulation?.applied).toBe(true);
    expect(on.valueModulation?.scores).toEqual(own.values);
    const block = on.modelProvenance as Summary;
    expect(block.hypotheses.filter((id) => id.startsWith("chain.valueModulation.")).length).toBe(11);
    expect(block.hypotheses).toEqual(valued.provenance.hypotheses);
    expect(block.counts).toEqual(valued.provenance.counts);
  }, 240_000);
});
