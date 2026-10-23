/**
 * The cognitive journey's numbers are pinned, bit for bit, on a virtual clock.
 *
 * Forty scripted journeys through runCognitiveJourney
 * (tests/fixtures/journey-scenarios.ts: every emotional trigger, the progress
 * gate, every abandonment reason the loop can reach, the final evaluation and
 * its fallback, every action, returning visits, the time of day, human input,
 * the live viewer, and a trait sweep across the threshold cut points), plus
 * sweeps of every helper the journey computes with and of the two MCP journey
 * tools (tests/fixtures/journey-sweeps.ts), compared with Object.is against
 * tests/fixtures/golden-journey-world.json. A journey runs in a scripted page
 * world with a fake browser, scripted decisions, a virtual clock and a seeded
 * random source (tests/fixtures/journey-world.ts), so its timing is pinned
 * too: the delay of every timer it sets, timeElapsed, and every timestamp.
 *
 * Recorded before the journey's constants were registered, so the move to
 * the registry is proven to change nothing. If the journey's behaviour is
 * meant to change, regenerate with `bun tests/fixtures/generate-journey-golden.ts`
 * and say so in the commit.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diffExact } from "./fixtures/ctc-golden-matrix.js";

process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-journey-golden-data-"));
process.env.CBROWSER_ARTIFACT_DIR = mkdtempSync(join(tmpdir(), "cb-journey-golden-art-"));
delete process.env.ANTHROPIC_API_KEY;

const { SCENARIOS, runScenario } = await import("./fixtures/journey-scenarios.js");
const { runHelperSweeps } = await import("./fixtures/journey-sweeps.js");
const pinned = JSON.parse(readFileSync(join(import.meta.dir, "fixtures", "golden-journey-world.json"), "utf8")) as {
  runs: Record<string, unknown>;
  sweeps: Record<string, unknown>;
};

describe("journey golden (scripted world, virtual clock)", () => {
  test("the pin covers every scenario and sweep", () => {
    expect(Object.keys(pinned.runs)).toEqual(SCENARIOS.map((s) => s.name));
    expect(Object.keys(pinned.sweeps)).toEqual(["helpers", "emotions", "temporal", "humanInput", "mcp"]);
  });

  for (const s of SCENARIOS) {
    test(`${s.name}: every number, prompt, delay and call is Object.is-equal to the pin`, async () => {
      const diffs = diffExact(pinned.runs[s.name], await runScenario(s), s.name);
      expect(diffs.slice(0, 20)).toEqual([]);
      expect(diffs.length).toBe(0);
    });
  }

  test("every helper sweep is Object.is-equal to the pin", async () => {
    const diffs = diffExact(pinned.sweeps, await runHelperSweeps(), "sweeps");
    expect(diffs.slice(0, 20)).toEqual([]);
    expect(diffs.length).toBe(0);
  });
});
