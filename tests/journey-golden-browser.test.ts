/**
 * The cognitive journey's numbers in a real browser are pinned, bit for bit.
 *
 * Two scripted journeys (tests/fixtures/journey-browser-scenarios.ts) run
 * through runCognitiveJourney against the journey-*.html fixtures in
 * Chromium, with a scripted decision source and no model. Every state number
 * after every step (patience, confusion, frustration, the emotional state,
 * decision fatigue, scan width, peripheral vision, habituation), the prompts
 * the persona is shown (which carry the thresholds and the page as the
 * journey read it) and the result are compared with Object.is against
 * tests/fixtures/golden-journey-browser.json, recorded before the journey's
 * constants were registered. Wall-clock values are left out (see
 * stripWallClock); the scripted world golden (journey-golden.test.ts) pins
 * timing on a virtual clock.
 *
 * If the journey's behaviour is meant to change, regenerate the fixture with
 * `bun tests/fixtures/generate-journey-golden.ts --browser` and say so in the commit.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveFixtures } from "./fixtures/serve-fixtures.js";
import { diffExact } from "./fixtures/ctc-golden-matrix.js";

process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-journey-golden-data-"));
process.env.CBROWSER_ARTIFACT_DIR = mkdtempSync(join(tmpdir(), "cb-journey-golden-art-"));
delete process.env.ANTHROPIC_API_KEY;

const { BROWSER_SCENARIOS, runBrowserScenario } = await import("./fixtures/journey-browser-scenarios.js");
const pinned = JSON.parse(readFileSync(join(import.meta.dir, "fixtures", "golden-journey-browser.json"), "utf8")) as { runs: Record<string, unknown> };

let server: Awaited<ReturnType<typeof serveFixtures>>;
beforeAll(async () => { server = await serveFixtures(); });
afterAll(async () => { await server.close(); });

describe("journey golden in a real browser", () => {
  test("the pin covers every scenario", () => {
    expect(Object.keys(pinned.runs)).toEqual(BROWSER_SCENARIOS.map((s) => s.name));
  });

  for (const s of BROWSER_SCENARIOS) {
    test(`${s.name}: every state number, prompt and result is Object.is-equal to the pin`, async () => {
      const actual = await runBrowserScenario(s, server.base);
      const diffs = diffExact(pinned.runs[s.name], actual, s.name);
      expect(diffs.slice(0, 20)).toEqual([]);
      expect(diffs.length).toBe(0);
    }, 300_000);
  }
});
