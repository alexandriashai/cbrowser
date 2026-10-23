/**
 * extractPageMetrics is measurePageRaw then deriveMetrics, and the split puts
 * every constant on the side that can apply it.
 *
 * Claims:
 *   1. Every pageMetrics constant outside PAGE_METRICS_MEASURE_IDS is applied
 *      by deriveMetrics, and moves its output: scaled by 1.1 (or 0.9, for a
 *      threshold that only binds from one side) under withParamOverrides, it
 *      changes what deriveMetrics returns for the SAME raw measurement. This
 *      is what lets a stored measurement (the CTC reference set) follow a
 *      changed normaliser instead of carrying the old one baked in.
 *   2. The measure-stage ids are read by measurePageRaw and never by
 *      deriveMetrics; the derive-stage ids the other way round.
 *   3. A raw measurement is plain data: it survives a JSON round trip and
 *      derives to the same numbers.
 *   4. A length threshold the record's histograms cannot resolve is refused,
 *      not approximated.
 *   5. Both raw layouts derive, and nothing else: a format-1 record derives
 *      exactly as the format-2 record with the same counts (its prose totals
 *      are new fields deriveMetrics does not read); any other format throws.
 *
 * tests/page-metrics-golden.test.ts proves derive(measure()) is still exactly
 * what extractPageMetrics returned before the split; tests/page-metrics-raw.test.ts
 * does claims 1 and 3 on raw measurements of real fixture pages.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { deriveMetrics, measurePageRaw, extractPageMetrics, RAW_PAGE_FORMAT, type RawPageMeasurement, type RawPageMeasurementV1 } from "../src/visual/cognitive-transport.js";
import { readsOf, withParamOverrides } from "../src/visual/model-provenance.js";
import { PAGE_METRICS_PROVENANCE, PAGE_METRICS_MEASURE_IDS } from "../src/visual/provenance/page-metrics.js";
import { RAW_FIXTURES, RAW_LATIN } from "./fixtures/raw-page-measurements.js";

const DERIVE_IDS = PAGE_METRICS_PROVENANCE.map((e) => e.id).filter((id) => !PAGE_METRICS_MEASURE_IDS.includes(id));

/** deriveMetrics on every fixture, as one comparable string. */
function derivedAll(): string {
  return JSON.stringify(Object.fromEntries(Object.entries(RAW_FIXTURES).map(([k, r]) => [k, deriveMetrics(r)])));
}

/** A stub page whose measurement callback returns `raw`: enough to run measurePageRaw's Node side. */
function stubPage(raw: RawPageMeasurement) {
  return {
    evaluate: async (_fn: unknown, arg?: unknown) => (Array.isArray(arg) ? structuredClone(raw) : { viewportHeight: 800, documentHeight: 1600 }),
    waitForTimeout: async () => {},
  };
}

describe("the derive stage", () => {
  test("every derive-stage constant moves deriveMetrics on the same raw input", () => {
    // 28 of the registry's entries; the rest decide what is counted.
    expect(DERIVE_IDS.length).toBe(PAGE_METRICS_PROVENANCE.length - PAGE_METRICS_MEASURE_IDS.length);
    expect(DERIVE_IDS.length).toBe(28);
    const base = derivedAll();
    const dead: string[] = [];
    for (const e of PAGE_METRICS_PROVENANCE.filter((x) => DERIVE_IDS.includes(x.id))) {
      const moves = (f: number) => withParamOverrides({ [e.id]: e.value * f }, derivedAll) !== base;
      if (!moves(1.1) && !moves(0.9)) dead.push(e.id);
    }
    expect(dead).toEqual([]);
    // And the override is gone afterwards.
    expect(derivedAll()).toBe(base);
  });

  test("the detector goes red on a constant the derivation ignores (absence test)", () => {
    // A measure-stage id cannot move deriveMetrics: the same check reports it dead.
    const base = derivedAll();
    const ignored = withParamOverrides({ "pageMetrics.visual.colourSample": 5 }, derivedAll);
    expect(ignored).toBe(base);
  });

  test("a midpoint moves exactly the field it normalises", () => {
    const before = deriveMetrics(RAW_LATIN);
    const after = withParamOverrides({ "pageMetrics.informationDensity.midpoint": 2500 }, () => deriveMetrics(RAW_LATIN));
    expect(after.informationDensity).toBeGreaterThan(before.informationDensity);
    expect({ ...after, informationDensity: 0 }).toEqual({ ...before, informationDensity: 0 });
  });
});

describe("each constant is read on one side of the split", () => {
  test("deriveMetrics reads exactly the derive-stage ids", () => {
    const read = new Set<string>();
    for (const r of Object.values(RAW_FIXTURES)) for (const id of readsOf(() => deriveMetrics(r)).ids) read.add(id);
    expect([...read].sort()).toEqual([...DERIVE_IDS].sort());
  });

  test("measurePageRaw reads exactly the measure-stage ids", async () => {
    const { startProvenanceRecording, stopProvenanceRecording } = await import("../src/visual/model-provenance.js");
    startProvenanceRecording();
    await measurePageRaw(stubPage(RAW_LATIN), "full_page");
    const read = stopProvenanceRecording();
    expect([...read].sort()).toEqual([...PAGE_METRICS_MEASURE_IDS].sort());
  });

  test("extractPageMetrics is deriveMetrics of what measurePageRaw returned", async () => {
    for (const r of Object.values(RAW_FIXTURES)) {
      expect(await extractPageMetrics(stubPage(r), r.scope)).toEqual(deriveMetrics(r));
    }
  });
});

describe("a raw measurement is data", () => {
  test("it survives a JSON round trip and derives to the same numbers", () => {
    for (const r of Object.values(RAW_FIXTURES)) {
      const back = JSON.parse(JSON.stringify(r)) as RawPageMeasurement;
      expect(back).toEqual(r);
      expect(deriveMetrics(back)).toEqual(deriveMetrics(r));
    }
  });

  test("a threshold at or above the record's length bins is refused, not approximated", () => {
    expect(() => withParamOverrides({ "pageMetrics.alphabetic.sentenceLengthAbove": 32 }, () => deriveMetrics(RAW_LATIN)))
      .toThrow(/cannot be re-derived .* one bin from 32/);
    // Just below the bins it is exact: a fragment of 31 or more sits above 31 only in the overflow bin.
    expect(() => withParamOverrides({ "pageMetrics.alphabetic.sentenceLengthAbove": 31 }, () => deriveMetrics(RAW_LATIN))).not.toThrow();
    expect(() => withParamOverrides({ "pageMetrics.cjk.longRunMin": 40 }, () => deriveMetrics(RAW_FIXTURES.cjk))).toThrow(/cjk\.longRunMin/);
  });

  test("fractional thresholds keep their strict and non-strict sense", () => {
    // A fragment is a sentence when its length EXCEEDS the threshold: 3.3 counts
    // a 4-character fragment, as 3 does, and 2.7 adds the 3-character ones.
    const at = (v: number) => withParamOverrides({ "pageMetrics.cjk.sentenceLengthAbove": v }, () => deriveMetrics(RAW_FIXTURES.cjk)).avgSentenceLength;
    expect(at(3.3)).toBe(at(3));
    expect(at(2.7)).toBeLessThan(at(3));
  });
});

describe("raw formats", () => {
  test("format 1 derives exactly as format 2 with the same counts; any other format is refused", () => {
    expect(RAW_PAGE_FORMAT).toBe(2);
    for (const r of Object.values(RAW_FIXTURES)) {
      expect(r.format).toBe(2);
      const { prose: _prose, proseNested: _nested, ...rest } = r;
      const v1: RawPageMeasurementV1 = { ...rest, format: 1 };
      expect(deriveMetrics(v1)).toEqual(deriveMetrics(r));
      for (const format of [0, 3, undefined, "2"]) {
        expect(() => deriveMetrics({ ...r, format } as never)).toThrow(/raw page format .* is not one this build reads \(1 or 2\)/);
      }
    }
  });
});
