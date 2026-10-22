/**
 * Every constant in the chain's registry moves a score.
 *
 * ctc-provenance.test.ts proves every registered id is READ. That is weaker
 * than it looks: a weight multiplied into a demand no layer consumes, an
 * overflow clamp no input can reach, or a threshold no page sits near is read
 * on every run and changes nothing. Through 20.x the registry carried 21 such
 * entries: 15 demand and modulation weights writing to dimensions no layer
 * reads, five string levels for an attentionPattern no persona carries as a
 * string, and the logistic's overflow clamp.
 *
 * The test: for every id in CHAIN_PROVENANCE, scale its value by 1.1 (and by
 * 0.9 if 1.1 moves nothing, for constants that sit behind a min or max), run
 * the whole golden matrix, and require that some SCORE differs. Scores are
 * everything in the matrix except the per-dimension state arrays
 * (remainingCapacity, traitCosts): those also report dimensions no layer
 * reads, so a constant that only moved the leftover capacity of an unread
 * dimension would pass a looser check while changing no answer.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CHAIN_PROVENANCE } from "../src/visual/provenance/chain.js";
import { withParamOverrides } from "../src/visual/model-provenance.js";
import { buildGoldenMatrix } from "./fixtures/ctc-golden-matrix.js";

/** The matrix with the per-dimension state arrays dropped: scores only. */
export function scores(build: () => unknown = buildGoldenMatrix): string {
  return JSON.stringify(build(), (k, v) => (k === "remainingCapacity" || k === "traitCosts" ? undefined : v));
}

/** Ids whose value can be scaled by 1.1 or 0.9 without moving any score. */
export function deadConstants(ids: Array<{ id: string; value: number }>, build: () => unknown = buildGoldenMatrix): string[] {
  const base = scores(build);
  const dead: string[] = [];
  for (const { id, value } of ids) {
    const moves = (factor: number) => scores(() => withParamOverrides({ [id]: value * factor }, build)) !== base;
    if (!moves(1.1) && !moves(0.9)) dead.push(id);
  }
  return dead;
}

describe("no constant in the chain registry is dead", () => {
  // Each perturbed build re-derives the totalCTC reference curves (three
  // option pairs x 111 pages x 25 personas) under the new constant, so this
  // is a few seconds of chain runs rather than under one; the bound is set
  // well above it.
  test("every CHAIN_PROVENANCE id, scaled by 1.1 or 0.9, moves a score in the golden matrix", () => {
    expect(deadConstants(CHAIN_PROVENANCE)).toEqual([]);
  }, 120_000);

  test("the detector goes red on a constant that is read but cannot matter (absence test of the test)", () => {
    // Pin weightSurplus to its registered value INSIDE the build, so the outer
    // perturbation is read and then overruled: the shape of a dead constant.
    // A live one beside it must still be reported live.
    const w = CHAIN_PROVENANCE.find((e) => e.id === "chain.weightSurplus")!;
    const live = CHAIN_PROVENANCE.find((e) => e.id === "chain.weightDeficit")!;
    const pinned = () => withParamOverrides({ [w.id]: w.value }, buildGoldenMatrix);
    expect(deadConstants([w, live], pinned)).toEqual(["chain.weightSurplus"]);
  });

  test("withParamOverrides is test-only: nothing under src calls it", () => {
    const callers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.ts$/.test(name) && !p.endsWith(join("visual", "model-provenance.ts"))
          && readFileSync(p, "utf8").includes("withParamOverrides")) callers.push(p);
      }
    };
    walk(join(import.meta.dir, "..", "src"));
    expect(callers).toEqual([]);
  });

  test("an override restores on exit and refuses an unregistered id", () => {
    const before = scores();
    expect(() => withParamOverrides({ "chain.doesNotExist": 1 }, () => 0)).toThrow(/unregistered/);
    expect(() => withParamOverrides({ "chain.weightDeficit": 2 }, () => { throw new Error("boom"); })).toThrow(/boom/);
    expect(scores()).toBe(before);
  });
});
