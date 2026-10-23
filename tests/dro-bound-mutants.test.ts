/**
 * Mutation test of the DRO bound's tests: do the checks in dro-bound.test.ts
 * catch an unsound derivation?
 *
 * Each mutant is a string edit of src/visual/dro-bound.ts, read at test time
 * and written to a temp directory with its imports pointed back at the real
 * chain, so the shipped file is never touched. Every mutant is put through the
 * same three checks the shipped bound passes (tests/fixtures/dro-adversary.ts):
 * the per-coordinate adversary, the constructed populations, and the
 * precondition cases, on three independent search seeds. A mutant is killed
 * on a seed when any check fails.
 *
 * Must be killed on 3 of 3 seeds: M1, M2, M6, M7, M9, M10 (the six unsound
 * variants a 2026-10-21 cross-vendor audit found passing the previous tests;
 * the edits here are reconstructions from its descriptions), and every
 * reconstructed mutant shown unsound. The interaction mutants (M2, M2b, M10)
 * are refuted on the fixture's INTERACTION_PAGES, found by a scan after the
 * 21.0 chain changes emptied the page that refuted them before. M11 and M14
 * are reported and not required: no slope above them was found anywhere (on
 * the 21.0 chain, 508 pages with any subset of the generator's inputs at max,
 * mid, 0.1x or 0.03x plus 2000 random sparse pages, 4 option sets: best ratio
 * 0.9999, the same as the shipped bound), because the derivation's
 * depletion-coupling term over-counts by more than twice, so halving or
 * truncating it still leaves a valid bound.
 *
 * An unmutated copy goes through the same pipeline and must survive every
 * check on every seed; without it, a broken import path would "kill" every
 * mutant.
 *
 * M4 (sigma' taken at rawMax instead of the point nearest the logistic's
 * centre) was retired in 21.x with the logistic: the bound is on rawCTC now
 * and has no sigma' to mutate. The percentile bound built on it
 * (percentileLipschitzBound) is tested in dro-bound.test.ts and has no row
 * here: it is the raw constant times the curve's steepest slope, and the
 * steepest totalCTC slope any search finds is a few ten-thousandths of it, so
 * only a gross mutant could be refuted.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  adversarialPopulations,
  adversarialSearch,
  checkCoordinates,
  checkPopulations,
  checkPreconditions,
  type BoundModule,
} from "./fixtures/dro-adversary.js";
import { MUTANTS, loadBoundModules } from "./fixtures/dro-mutants.js";
import { demandFromLegacy } from "./fixtures/law-seconds.js";

const SEEDS = [1, 2, 3];
const MID = demandFromLegacy(0.5, 0.5, 40, 0.5, 0.2, 12, 3);

let dir = "";
const mods = new Map<string, BoundModule>();
type Verdict = { seed: number; coordinates: number; populations: number; preconditions: number };
const verdicts = new Map<string, Verdict[]>();

function judge(id: string): Verdict[] {
  const hit = verdicts.get(id);
  if (hit) return hit;
  const mod = mods.get(id)!;
  const out = SEEDS.map((seed) => ({
    seed,
    coordinates: checkCoordinates(adversarialSearch(seed), mod).violations.length,
    populations: checkPopulations(adversarialPopulations(seed), mod).violations.length,
    preconditions: checkPreconditions(mod, MID).length,
  }));
  verdicts.set(id, out);
  return out;
}

const killed = (v: Verdict) => v.coordinates + v.populations + v.preconditions > 0;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "dro-mutants-"));
  for (const [id, mod] of await loadBoundModules(dir)) mods.set(id, mod);
  // The searches and populations depend on the seed only, never on a bound: build them once.
  for (const seed of SEEDS) adversarialPopulations(seed);
}, 180_000);

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("DRO bound mutants", () => {
  test("the unmutated copy survives every check on every seed", () => {
    expect(judge("control").filter(killed)).toEqual([]);
  });

  for (const m of MUTANTS.filter((x) => x.mustKill)) {
    test(`${m.id} (${m.what}) is killed on ${SEEDS.length} of ${SEEDS.length} seeds`, () => {
      expect(judge(m.id).filter((v) => !killed(v)).map((v) => v.seed)).toEqual([]);
    });
  }

  test("kill table", () => {
    const rows = MUTANTS.map((m) => {
      const v = judge(m.id);
      const cells = v.map((x) => `${killed(x) ? "killed" : "SURVIVED"} (c${x.coordinates}/p${x.populations}/pre${x.preconditions})`);
      return `  ${m.id.padEnd(4)} ${String(v.filter(killed).length)}/${v.length}  ${m.mustKill ? "must" : "info"}  ${m.what.padEnd(58)} ${cells.join("  ")}`;
    });
    console.log(`[dro mutants] seeds ${SEEDS.join(", ")}; per seed: violations found by the coordinate / population / precondition checks\n${rows.join("\n")}`);
    expect(rows.length).toBe(MUTANTS.length);
  });
});
