/**
 * The cognitive transport chain's numbers are pinned, bit for bit.
 *
 * Every human persona, built the way cognitive_effort builds it, plus two
 * synthetic boundary personas, against nineteen demand vectors under four
 * option sets, plus four multi-screen scroll inputs, recorded on 21.0.0
 * (tests/fixtures/ctc-golden-21.0.0.json). Every number is compared with
 * Object.is: no tolerance, because a tolerance is where "nothing changed"
 * quietly becomes "a little".
 *
 * 21.0.0 replaced the 20.0.1 pin (tests/fixtures/ctc-golden-20.0.1.json, kept
 * as history and no longer asserted) because 21.0 changed the chain's numbers
 * on purpose; research/ctc-21-deltas.md measures what each change moved.
 *
 * If the chain's behaviour is meant to change, regenerate the fixture with
 * tests/fixtures/generate-ctc-golden.ts and say so in the commit.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildGoldenMatrix, diffExact, ROSTER, BOUNDARY_PERSONAS, type GoldenMatrix } from "./fixtures/ctc-golden-matrix.js";

const pinned = JSON.parse(readFileSync(join(import.meta.dir, "fixtures", "ctc-golden-21.0.0.json"), "utf8")) as GoldenMatrix & { pinnedOn: string };
const actual = buildGoldenMatrix();

describe("CTC golden matrix (21.0.0)", () => {
  test("covers the whole human roster plus the two boundary personas, 19 demands and 4 option sets", () => {
    expect(pinned.pinnedOn).toBe("21.0.0");
    expect(Object.keys(ROSTER).length).toBe(25);
    expect(actual.personas).toEqual([...Object.keys(ROSTER), ...Object.keys(BOUNDARY_PERSONAS)]);
    expect(actual.personas.length).toBe(27);
    expect(actual.personas).toEqual(pinned.personas);
    expect(actual.demands).toEqual(pinned.demands);
    expect(actual.demands.length).toBe(19);
    expect(Object.keys(actual.scroll[actual.personas[0]]).length).toBe(4);
    expect(actual.optionSets).toEqual(pinned.optionSets);
    expect(actual.optionSets.length).toBe(4);
    expect(actual.valuesSource).toEqual(pinned.valuesSource);
    expect(actual.dimensions).toEqual(pinned.dimensions);
    expect(actual.dimensions.length).toBe(30);
  });

  for (const persona of pinned.personas) {
    test(`${persona}: every chain number is Object.is-equal to the pin`, () => {
      const diffs = diffExact(pinned.runs[persona], actual.runs[persona], `runs.${persona}`);
      expect(diffs.slice(0, 20)).toEqual([]);
      expect(diffs.length).toBe(0);
    });
    test(`${persona}: every scroll number is Object.is-equal to the pin`, () => {
      const diffs = diffExact(pinned.scroll[persona], actual.scroll[persona], `scroll.${persona}`);
      expect(diffs.slice(0, 20)).toEqual([]);
      expect(diffs.length).toBe(0);
    });
  }

  test("the comparison is exact, not approximate", () => {
    // A one-ulp change must be a diff. Guards the guard.
    const x = 0.1 + 0.2;
    const y = x + Number.EPSILON * x;
    expect(diffExact({ a: [x] }, { a: [y] }).length).toBe(1);
    expect(diffExact({ a: [x] }, { a: [x] }).length).toBe(0);
    expect(diffExact({ a: 0 }, { a: -0 }).length).toBe(1);
  });
});
