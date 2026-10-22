/**
 * The two tools that hand customers a cognitive transport score say what the
 * score rests on.
 *
 * cognitive_effort and site_cognitive_assessment run the chain under
 * withProvenance and attach a `modelProvenance` summary: status counts of
 * every registry constant the chain read, and the ids of the hand-set ones.
 * Nothing in the chain is fitted or published today, so the hypothesis count
 * must be above zero and the fitted/published counts zero; a response that
 * said otherwise would be claiming calibration that does not exist.
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

type Block = { type: string; text?: string };
type Handler = (args: Record<string, unknown>) => Promise<{ content: Block[]; isError?: boolean }>;
type Summary = { counts: Record<string, number>; hypotheses: string[]; note: string };

let browser: InstanceType<typeof CBrowser>;
let fixtures: Awaited<ReturnType<typeof serveFixtures>>;
const handlers: Record<string, Handler> = {};

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
  // The counts cover the chain and the distance only; say so, and point at the fitted layer.
  expect(p.scope).toContain("Layer 1");
  expect(p.scope).toContain("not counted here");
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

describe("tool responses carry the chain's provenance", () => {
  test("cognitive_effort reports modelProvenance with hypothesis > 0 and nothing fitted", async () => {
    const result = await handlers.cognitive_effort({
      url: `${fixtures.base}noisy-page.html`, persona: "first-timer", useValues: false, scope: "viewport",
    });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text!);
    expect(data.modelProvenance).toBeDefined();
    expectHonestSummary(data.modelProvenance as Summary);
    // Still beside the numbers it describes.
    expect(typeof data.cognitiveTransportCost.total).toBe("number");
  }, 180_000);

  test("site_cognitive_assessment reports modelProvenance once gate 3 has run", async () => {
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
    expectHonestSummary(data.modelProvenance as Summary);
  }, 240_000);
});
