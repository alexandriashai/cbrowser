/**
 * The journey's registry and its code cannot drift from each other.
 *
 * Every scenario and sweep of the journey golden is run under provenance
 * recording. Every journey id read must be registered (param() throws
 * otherwise, so the run itself proves that), and every registered id must
 * be read by some scenario or sweep, so a constant cannot sit in the
 * registry describing a number the code no longer uses. The one exception
 * is named: the live model call's token ceiling, which no test reaches
 * because no test calls a model.
 *
 * Each entry carries a status from the four, a source, and the source says
 * what it claims: a hypothesis names the data that would set or test it,
 * and a published entry quotes its source. Nothing here is fitted.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-journey-prov-data-"));
process.env.CBROWSER_ARTIFACT_DIR = mkdtempSync(join(tmpdir(), "cb-journey-prov-art-"));
delete process.env.ANTHROPIC_API_KEY;

const { JOURNEY_GROUPS, JOURNEY_GROUP_PROVENANCE } = await import("../src/visual/provenance/journey-group.js");
const { MODEL_PROVENANCE } = await import("../src/visual/model-provenance.js");
const { journeyUnits, baseline } = await import("./fixtures/journey-perturb.js");

/** Registered, and reached by nothing a test can run. */
export const UNREACHED_IN_TESTS: Record<string, string> = {
  "journey.llm.maxTokens": "the response-token ceiling of the live model call; every test journey answers from a scripted decision source",
  "journey.llm.retryMaxTokens": "the ceiling of the live call's one re-ask; every test journey answers from a scripted decision source",
};

const STATUSES = ["fitted", "published", "definition", "hypothesis"];
const base = await baseline(journeyUnits());
const read = new Set<string>();
for (const ids of base.reads.values()) for (const id of ids) read.add(id);

describe("journey provenance registry", () => {
  test("the groups are pinned, ids unique and prefixed by their group", () => {
    // Pinned exactly: a constant added to or removed from the journey must
    // change these on purpose. 444 at registration (21.0); 428 after the 16
    // that could change nothing were removed; 427 after the init text's
    // "for 30s", which update_state never applied, became its two
    // consecutive updates; 423 after the five hand-set gaze-lag constants
    // gave way to the published average (journey.gazeLag.mean). The typing
    // grounding (Dhakal et al. 2018) replaced one entry with one. 424 with
    // llm.retryMaxTokens, the re-ask ceiling the 20.1.2 reply reader added.
    const counts = Object.fromEntries(Object.entries(JOURNEY_GROUPS).map(([g, es]) => [g, es.length]));
    expect(counts).toEqual({ journey: 152, emotion: 123, temporal: 44, humanInput: 67, journeyMcp: 38 });
    expect(new Set(JOURNEY_GROUP_PROVENANCE.map((e) => e.id)).size).toBe(424);
    for (const [g, es] of Object.entries(JOURNEY_GROUPS)) for (const e of es) expect(e.id.startsWith(`${g}.`)).toBe(true);
    for (const e of JOURNEY_GROUP_PROVENANCE) expect(MODEL_PROVENANCE[e.id]).toBe(e);
  });

  test("every entry has a status, a finite value and a source that says what it claims", () => {
    for (const e of JOURNEY_GROUP_PROVENANCE) {
      expect(STATUSES).toContain(e.status);
      expect(Number.isFinite(e.value)).toBe(true);
      expect(e.source.trim().length).toBeGreaterThan(20);
      if (e.status === "hypothesis") expect(e.source).toMatch(/would (fit|set|test|place|replace)/);
      // A published entry quotes the source that states its number, and names it with its year.
      if (e.status === "published") {
        expect(e.source).toMatch(/"[^"]+"/);
        expect(e.source).toMatch(/\(\d{4}\)/);
      }
    }
  });

  test("nothing is fitted; the published entries are the ones read for this registry", () => {
    const counts = { fitted: 0, published: 0, definition: 0, hypothesis: 0 };
    for (const e of JOURNEY_GROUP_PROVENANCE) counts[e.status]++;
    // definition 15 with llm.retryMaxTokens (20.1.2); was 14.
    expect(counts).toEqual({ fitted: 0, published: 9, definition: 15, hypothesis: 400 });
    expect(JOURNEY_GROUP_PROVENANCE.filter((e) => e.status === "published").map((e) => e.id).sort()).toEqual([
      "humanInput.type.fastIntervalMs", "humanInput.type.minIntervalMs", "humanInput.type.slowIntervalMs",
      "journey.gazeLag.mean",
      "journey.klm.homing", "journey.klm.keystrokeAverage", "journey.klm.keystrokeExpert", "journey.klm.keystrokeNovice", "journey.klm.pointing",
    ]);
  });

  test("every journey id the golden reads is registered", () => {
    const prefixes = Object.keys(JOURNEY_GROUPS).map((g) => `${g}.`);
    const journeyReads = [...read].filter((id) => prefixes.some((p) => id.startsWith(p)));
    expect(journeyReads.filter((id) => !MODEL_PROVENANCE[id])).toEqual([]);
    expect(journeyReads.length).toBe(JOURNEY_GROUP_PROVENANCE.length - Object.keys(UNREACHED_IN_TESTS).length);
  });

  test("every registered id is read by some scenario or sweep, but the one no test can reach", () => {
    const unread = JOURNEY_GROUP_PROVENANCE.map((e) => e.id).filter((id) => !read.has(id));
    expect(unread).toEqual(Object.keys(UNREACHED_IN_TESTS));
  });
});
