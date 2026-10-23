/**
 * Verdicts state the rank, not a comfort claim.
 *
 * totalCTC is a percentile: rawCTC placed among the raw costs of the real
 * reference pages for the built-in personas (src/visual/ctc-reference.ts).
 * The CTC is untested against human data, so a verdict may say where a page
 * ranks and nothing about how a person feels: no "comfortable", no
 * "struggle", and no abandonment, which is a separate quantity.
 *
 * The bands are fixed cut points on that percentile, registered as
 * definitions (ctcBands.*, provenance/ctc-reference.ts): below 0.5 lower
 * half, 0.5 to 0.8 upper half, 0.8 to 0.95 high, 0.95 and above top 5%. They
 * are conventions, not fits. Every number in a verdict comes from the
 * registry or the result: the page count from ctcReference.<scope>, the
 * persona count from the reference population, the scope from the result.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { ctcBand, ctcBands, ctcBandsDescription, ctcRank } from "../src/visual/ctc-bands.js";
import { MODEL_PROVENANCE, readsOf, withParamOverrides } from "../src/visual/model-provenance.js";
import { CTC_REFERENCE, referencePopulation } from "../src/visual/ctc-reference.js";
import { computeDemandFromRawMetrics, computeSequentialCTC } from "../src/visual/cognitive-transport-chain.js";
import { demandFromLegacy } from "./fixtures/law-seconds.js";
import { ROSTER, toolProfile } from "./fixtures/ctc-golden-matrix.js";

const PAGES = CTC_REFERENCE.outcomes.graded;
const PERSONAS = referencePopulation().length;
const POOL = `(${PAGES} pages x ${PERSONAS} personas, viewport scope)`;

/** Words that describe a person's experience, or abandonment, rather than a rank. */
const FEELING = /comfort|struggl|abandon|easy|easily|hard\b|difficult|frustrat|overwhelm|burden|likely to|will experience|should handle/i;

describe("the band cut points are registered definitions", () => {
  test("three ids, values 0.5 / 0.8 / 0.95, status definition, sourced as conventions on the reference percentile", () => {
    const want: Record<string, number> = { "ctcBands.upperHalf": 0.5, "ctcBands.high": 0.8, "ctcBands.top": 0.95 };
    for (const [id, value] of Object.entries(want)) {
      const e = MODEL_PROVENANCE[id];
      expect(e).toBeDefined();
      expect(e.value).toBe(value);
      expect(e.status).toBe("definition");
      expect(e.source).toMatch(/cut point/);
      expect(e.source).toMatch(/percentile/);
      expect(e.source).toMatch(/convention/);
      expect(e.source).toMatch(/not fitted/);
    }
  });

  test("ctcBands() reads them, so the registry and the verdict cannot disagree", () => {
    const { result, ids } = readsOf(() => ctcBands());
    expect(result).toEqual({ upperHalf: 0.5, high: 0.8, top: 0.95 });
    expect([...ids].sort()).toEqual(["ctcBands.high", "ctcBands.top", "ctcBands.upperHalf"]);
  });
});

describe("ctcBand maps a percentile to its band", () => {
  test("each band's edges: lower edge in, upper edge out", () => {
    const cases: Array<[number, string, string]> = [
      [0, "lower half", "below the 50th percentile"],
      [0.4999, "lower half", "below the 50th percentile"],
      [0.5, "upper half", "50th-80th percentile"],
      [0.7999, "upper half", "50th-80th percentile"],
      [0.8, "high", "80th-95th percentile"],
      [0.9499, "high", "80th-95th percentile"],
      [0.95, "top 5%", "95th percentile and above"],
      [1, "top 5%", "95th percentile and above"],
    ];
    for (const [t, name, range] of cases) expect({ t, ...pick(ctcBand(t)!) }).toEqual({ t, name, range });
  });

  test("the bands in words, as the tools print them", () => {
    expect(ctcBandsDescription()).toBe("below 0.5 lower half, 0.5 to 0.8 upper half, 0.8 to 0.95 high, 0.95 and above top 5%");
  });

  test("a percentile that is not a number has no band", () => {
    expect(ctcBand(Number.NaN)).toBeNull();
  });

  test("names and ranges follow the registered cut points, not hand-typed text", () => {
    withParamOverrides({ "ctcBands.top": 0.9, "ctcBands.high": 0.75 }, () => {
      expect(pick(ctcBand(0.92)!)).toEqual({ name: "top 10%", range: "90th percentile and above" });
      expect(pick(ctcBand(0.8)!)).toEqual({ name: "high", range: "75th-90th percentile" });
      expect(pick(ctcBand(0.6)!)).toEqual({ name: "upper half", range: "50th-75th percentile" });
    });
    withParamOverrides({ "ctcBands.top": 0.99 }, () => {
      expect(pick(ctcBand(0.991)!)).toEqual({ name: "top 1%", range: "99th percentile and above" });
      expect(pick(ctcBand(0.95)!)).toEqual({ name: "high", range: "80th-99th percentile" });
    });
  });

  test("property: the band never moves down as the percentile moves up", () => {
    const order = ["lower half", "upper half", "high", "top 5%"];
    fc.assert(fc.property(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (a, b) => {
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      expect(order.indexOf(ctcBand(lo)!.name)).toBeLessThanOrEqual(order.indexOf(ctcBand(hi)!.name));
    }), { numRuns: 500, seed: 11 });
  });
});

describe("ctcRank states the rank in the required form", () => {
  test("the interior: 'Costlier than N% of the real pages we measured (...). Band: ...'", () => {
    const r = ctcRank({ totalCTC: 0.873, rawCTC: 1.5, referenceScope: "viewport" });
    expect(r.sentence).toBe(`Costlier than 87% of the real pages we measured ${POOL}. Band: high (80th-95th percentile).`);
    expect(r.statement).toBe(`costlier than 87% of the real pages we measured ${POOL}`);
    expect(r.bandSentence).toBe("Band: high (80th-95th percentile).");
    expect(r.band).toBe("high");
    expect(r.percent).toBe(87);
  });

  test("N rounds down, so the sentence never claims a rank the page did not reach", () => {
    expect(ctcRank({ totalCTC: 0.999, rawCTC: 3, referenceScope: "viewport" }).sentence)
      .toStartWith("Costlier than 99% of the real pages");
    expect(ctcRank({ totalCTC: 0.5, rawCTC: 1, referenceScope: "viewport" }).sentence)
      .toBe(`Costlier than 50% of the real pages we measured ${POOL}. Band: upper half (50th-80th percentile).`);
    expect(ctcRank({ totalCTC: 0.004, rawCTC: 0.1, referenceScope: "viewport" }).sentence)
      .toBe(`Costlier than under 1% of the real pages we measured ${POOL}. Band: lower half (below the 50th percentile).`);
    // Not lost to binary fractions: 0.29 * 100 is 28.999999999999996.
    expect(ctcRank({ totalCTC: 0.29, rawCTC: 0.5, referenceScope: "viewport" }).percent).toBe(29);
    expect(ctcRank({ totalCTC: 0.57, rawCTC: 0.5, referenceScope: "viewport" }).percent).toBe(57);
  });

  test("0 and 1 are the ends of the reference, said as such, with rawCTC to tell such pages apart", () => {
    expect(ctcRank({ totalCTC: 0, rawCTC: 0.0213, referenceScope: "viewport" }).sentence)
      .toBe(`At or below the cheapest real page we measured ${POOL}; rawCTC 0.02 tells such pages apart. Band: lower half (below the 50th percentile).`);
    expect(ctcRank({ totalCTC: 1, rawCTC: 4.2071, referenceScope: "viewport" }).sentence)
      .toBe(`At least as costly as the costliest real page we measured ${POOL}; rawCTC 4.21 tells such pages apart. Band: top 5% (95th percentile and above).`);
  });

  test("the scope is the result's, and the page count is the registered one at that scope", () => {
    const full = ctcRank({ totalCTC: 0.6, rawCTC: 2, referenceScope: "full_page" });
    expect(full.sentence).toContain(`(${PAGES} pages x ${PERSONAS} personas, full_page scope)`);
    const { ids } = readsOf(() => ctcRank({ totalCTC: 0.6, rawCTC: 2, referenceScope: "full_page" }));
    expect(ids.has("ctcReference.full_page")).toBe(true);
    expect(ids.has("ctcReference.viewport")).toBe(false);
    // Overriding the registered count changes the sentence: it is read, not typed.
    withParamOverrides({ "ctcReference.full_page": 999 }, () => {
      expect(ctcRank({ totalCTC: 0.6, rawCTC: 2, referenceScope: "full_page" }).sentence).toContain("(999 pages x");
    });
  });

  test("a rank that is not a number says so instead of inventing one", () => {
    const r = ctcRank({ totalCTC: Number.NaN, rawCTC: Number.NaN, referenceScope: "viewport" });
    expect(r.band).toBeNull();
    expect(r.percent).toBeNull();
    expect(r.sentence).toMatch(/^This cost is not rankable among the real pages we measured/);
    expect(r.bandSentence).toBe("No band.");
  });

  test("no sentence, at any rank, describes how a person feels or predicts abandonment", () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 20, noNaN: true }), (t, raw) => {
      const s = ctcRank({ totalCTC: t, rawCTC: raw, referenceScope: "viewport" }).sentence;
      expect(s).not.toMatch(FEELING);
    }), { numRuns: 300, seed: 5 });
    for (const t of [0, 1, Number.NaN]) expect(ctcRank({ totalCTC: t, rawCTC: 1, referenceScope: "viewport" }).sentence).not.toMatch(FEELING);
  });

  test("on a real chain result the sentence carries the result's own rank and scope", () => {
    const prof = toolProfile("elderly-user", ROSTER["elderly-user"]);
    const r = computeSequentialCTC(prof, demandFromLegacy(0.6, 0.5, 30, 0.6, 0.2, 10, 3), { asymmetric: true, interactions: true });
    const rank = ctcRank(r);
    expect(rank.band).toBe(ctcBand(r.totalCTC)!.name);
    if (r.totalCTC > 0 && r.totalCTC < 1) expect(rank.percent).toBe(Math.floor(r.totalCTC * 100));
    expect(rank.sentence).toContain(`${r.referenceScope} scope`);
    // ISC-62: the verdict states the result's own interval.
    expect(r.totalCTC).toBeGreaterThan(0);
    expect(r.totalCTC).toBeLessThan(1);
    expect(rank.interval).toEqual([Math.floor(r.totalCTCInterval[0] * 100 + 1e-9), Math.ceil(r.totalCTCInterval[1] * 100 - 1e-9)]);
    expect(rank.sentence).toContain(`; 95% interval ${rank.interval![0]}-${rank.interval![1]}%)`);
    expect(rank.statement).toContain("% interval");
  });
});

describe("ctcRank states the interval when the result carries one (ISC-62)", () => {
  const at = (t: number, iv?: [number, number]) => ctcRank({ totalCTC: t, rawCTC: 1.2, referenceScope: "viewport", ...(iv ? { totalCTCInterval: iv } : {}) });

  test("beside the pool, rounded outward so it always contains the stated rank", () => {
    const r = at(0.875, [0.8231, 0.9112]);
    expect(r.sentence).toBe(`Costlier than 87% of the real pages we measured (${PAGES} pages x ${PERSONAS} personas, viewport scope; 95% interval 82-92%). Band: high (80th-95th percentile).`);
    expect(r.interval).toEqual([82, 92]);
    fc.assert(fc.property(fc.double({ min: 0.001, max: 0.999, noNaN: true }), fc.double({ min: 0, max: 0.2, noNaN: true }), fc.double({ min: 0, max: 0.2, noNaN: true }), (t, dl, dh) => {
      const lo = Math.max(0, t - dl), hi = Math.min(1, t + dh);
      const [a, b] = at(t, [lo, hi]).interval!;
      const n = at(t, [lo, hi]).percent!;
      expect(a).toBeLessThanOrEqual(n);
      expect(b).toBeGreaterThanOrEqual(n);
    }), { numRuns: 300, seed: 11 });
  });

  test("the level is the registered one; without an interval, at either end, or unrankable, none is stated", () => {
    const { ids } = readsOf(() => at(0.6, [0.55, 0.65]));
    expect(ids.has("ctcReference.interval.level")).toBe(true);
    withParamOverrides({ "ctcReference.interval.level": 0.9 }, () => {
      expect(at(0.6, [0.55, 0.65]).sentence).toContain("; 90% interval 55-65%)");
    });
    expect(at(0.6).sentence).not.toContain("interval");
    expect(at(0.6).interval).toBeNull();
    expect(at(0, [0, 0]).sentence).not.toContain("interval");
    expect(at(1, [1, 1]).sentence).not.toContain("interval");
    expect(at(Number.NaN, [Number.NaN, Number.NaN]).sentence).not.toContain("interval");
  });
});

function pick(b: { name: string; range: string }) {
  return { name: b.name, range: b.range };
}
