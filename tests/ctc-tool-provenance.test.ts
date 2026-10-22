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
const { withProvenance } = await import("../src/visual/model-provenance.js");
const { computeDemandDistribution, computeSequentialCTC, computeSequentialScrollCTC } = await import("../src/visual/cognitive-transport-chain.js");
const { extractPageMetrics, measurePageGeometry } = await import("../src/visual/cognitive-transport.js");
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
  expect(p.hypotheses.every((id) => id.startsWith("chain."))).toBe(true);
  expect(p.note).toContain("hypothesis");
  // The counts cover demand construction, the chain and the distance; say so,
  // and point at the fitted layer that is not counted.
  expect(p.scope).toContain("demand");
  expect(p.scope).toContain("Layer 1");
  expect(p.scope).toContain("not counted here");
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

describe("tool responses carry the provenance of the whole answer", () => {
  test("cognitive_effort: the block equals demand + chain run under withProvenance directly", async () => {
    const data = await effort({ url: `${fixtures.base}noisy-page.html`, persona: "first-timer" });
    expect(data.modelProvenance).toBeDefined();
    const block = data.modelProvenance as Summary;
    expectDemandCounted(block);
    expectHonestSummary(block);
    // Still beside the numbers it describes.
    expect(typeof data.cognitiveTransportCost.total).toBe("number");

    const metrics = await metricsNow("viewport");
    const profile = toolProfile("first-timer", ROSTER["first-timer"]);
    const direct = withProvenance(() =>
      computeSequentialCTC(profile, computeDemandDistribution(metrics), CHAIN_OPTIONS));
    expect(block.hypotheses).toEqual(direct.provenance.hypotheses);
    expect(block.counts).toEqual(direct.provenance.counts);
    // And the same number, so the comparison is against the computation the tool ran.
    expect(data.cognitiveTransportCost.total).toBe(r3(direct.result.totalCTC));
  }, 180_000);

  test("cognitive_effort at scope 'sequential': the block also covers the per-screen curve", async () => {
    const data = await effort({ url: `${fixtures.base}noisy-page.html`, persona: "first-timer", scope: "sequential" });
    expect(data.sequential?.error).toBeUndefined();
    const block = data.modelProvenance as Summary;
    expectDemandCounted(block);
    expectHonestSummary(block);

    // Which ids are read does not depend on the page, so one screen of the
    // same metrics reads what the tool's screens read.
    const metrics = await metricsNow("full_page");
    const profile = toolProfile("first-timer", ROSTER["first-timer"]);
    const direct = withProvenance(() => {
      computeSequentialCTC(profile, computeDemandDistribution(metrics), CHAIN_OPTIONS);
      return computeSequentialScrollCTC(profile, [computeDemandDistribution(metrics)], CHAIN_OPTIONS);
    });
    expect(block.hypotheses).toEqual(direct.provenance.hypotheses);
    // chain.depthRoundingScale (a definition) is read by the curve alone.
    expect(block.counts).toEqual(direct.provenance.counts);
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

    const metrics = await metricsNow("viewport");
    const profile = toolProfile("cognitive-adhd", ROSTER["cognitive-adhd"]);
    const direct = withProvenance(() =>
      computeSequentialCTC(profile, computeDemandDistribution(metrics), CHAIN_OPTIONS));
    expect(block.hypotheses).toEqual(direct.provenance.hypotheses);
    expect(block.counts).toEqual(direct.provenance.counts);
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
    const metrics = await metricsNow("viewport");
    const profile = toolProfile(persona, ROSTER[persona]);
    const plain = computeSequentialCTC(profile, computeDemandDistribution(metrics), CHAIN_OPTIONS);
    const valued = withProvenance(() =>
      computeSequentialCTC(profile, computeDemandDistribution(metrics), { ...CHAIN_OPTIONS, schwartzValues: own.values }));

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
