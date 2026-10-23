/**
 * Every constant in the journey's registry moves a number.
 *
 * journey-provenance.test.ts proves every registered id is READ. That is
 * weaker than it looks: before 21.0 the journey read a loop rule that could
 * never fire, two emotional rules no state could reach, a dwell nothing
 * triggered and clamps no input could bind. The test: for every journey id,
 * scale its value by 1.1 (and by 0.9 if 1.1 moves nothing, for constants
 * behind a min or max), re-run every golden scenario and sweep that reads
 * it, and require that some output differs (tests/fixtures/journey-perturb.ts).
 *
 * Exempt, by name: the update rule's division guard, whose value never
 * matters, only that it is positive, and the token ceiling of the live
 * model call, which no test reaches.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-journey-dead-data-"));
process.env.CBROWSER_ARTIFACT_DIR = mkdtempSync(join(tmpdir(), "cb-journey-dead-art-"));
delete process.env.ANTHROPIC_API_KEY;

const { JOURNEY_GROUP_PROVENANCE } = await import("../src/visual/provenance/journey-group.js");
const { journeyUnits, baseline, deadJourneyConstants } = await import("./fixtures/journey-perturb.js");

const EXEMPT: Record<string, string> = {
  "journeyMcp.update.marginEpsilon": "a division guard against a zero or negative threshold; only its sign matters",
  "journey.llm.maxTokens": "the live model call's response ceiling; no test calls a model",
};

describe("no constant in the journey registry is dead", () => {
  test("every journey id, scaled by 1.1 or 0.9, moves some scenario or sweep", async () => {
    const units = journeyUnits();
    const base = await baseline(units);
    const ids = JOURNEY_GROUP_PROVENANCE.map((e) => e.id).filter((id) => !(id in EXEMPT));
    expect(await deadJourneyConstants(ids, units, base)).toEqual([]);
  }, 300_000);

  test("the exempt ids are exactly the ones that move nothing (exemptions do not hide a live constant)", async () => {
    const units = journeyUnits();
    const base = await baseline(units);
    expect(await deadJourneyConstants(Object.keys(EXEMPT), units, base)).toEqual(Object.keys(EXEMPT));
  }, 120_000);

  test("the detector goes red on a constant that is read but cannot matter (absence test)", async () => {
    // A unit that reads a live constant and then ignores it has the shape of a
    // dead one; the detector must name it and pass a unit that uses the value.
    const { param } = await import("../src/visual/model-provenance.js");
    const id = "journey.stepPauseMs";
    const reads = () => { param(id); return Promise.resolve("ignored"); };
    const uses = () => Promise.resolve(param(id));
    const unitsDead = [{ name: "reads-and-ignores", run: reads }];
    expect(await deadJourneyConstants([id], unitsDead, await baseline(unitsDead))).toEqual([id]);
    const unitsLive = [{ name: "uses", run: uses }];
    expect(await deadJourneyConstants([id], unitsLive, await baseline(unitsLive))).toEqual([]);
  });
});
