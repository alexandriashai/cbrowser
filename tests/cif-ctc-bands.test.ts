/**
 * CIF's overload component reads totalCTC on the scale it is now on.
 *
 * overloadThreshold scored totalCTC against cut points of its own,
 * cif.sensory.overload.easyCTC 0.3 and kneeCTC 0.6, set on the logistic
 * totalCTC was until 21.x, and called anything at or below 0.3 "within easy
 * range". totalCTC is now a percentile of real pages, so those numbers cut a
 * different scale: 0.3 is the 30th percentile, where on the logistic it sat
 * near the 80th of real first screens. The CMS audit worker feeds
 * cognitive_effort's totalCTC straight into computeCIFScore, so customers'
 * CIF scores read the new scale.
 *
 * The component now reads the registered verdict bands: full marks at or
 * below ctcBands.upperHalf (0.5), the knee at ctcBands.high (0.8), so CIF has
 * no CTC cut points of its own to drift. Its details state the rank, never a
 * comfort word, and a totalCTC outside zero to one is from another scale and
 * is not measured rather than scored as if it ranked.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { computeCIFScore } from "../src/cif-score.js";
import { CIF_PROVENANCE } from "../src/visual/provenance/cif.js";
import { param, readsOf, withParamOverrides } from "../src/visual/model-provenance.js";

const overload = (totalCTC: number) =>
  computeCIFScore({ url: "https://example.test/", totalCTC }).sensory.components.overloadThreshold;
const score = (t: number) => overload(t).score;
const EPS = 1e-9;

describe("overloadThreshold reads the registered bands", () => {
  test("CIF registers no CTC cut points of its own", () => {
    const ids = CIF_PROVENANCE.map((e) => e.id);
    expect(ids).not.toContain("cif.sensory.overload.easyCTC");
    expect(ids).not.toContain("cif.sensory.overload.kneeCTC");
    const { ids: read } = readsOf(() => overload(0.6));
    expect(read.has("ctcBands.upperHalf")).toBe(true);
    expect(read.has("ctcBands.high")).toBe(true);
  });

  test("full marks through the lower half, the knee at the high band, continuous there", () => {
    const top = param("cif.scale.max");
    const below = param("cif.sensory.overload.slopeBelowKnee");
    const above = param("cif.sensory.overload.slopeAboveKnee");
    const half = param("ctcBands.upperHalf");
    const high = param("ctcBands.high");
    expect(score(0)).toBe(top);
    expect(score(half)).toBe(top);
    expect(score(half + 0.05)).toBe(Math.round(top - 0.05 * below));
    const knee = Math.round(top - (high - half) * below);
    expect(score(high)).toBe(knee);
    expect(score(high + EPS)).toBe(knee);
    expect(score(1)).toBe(Math.round(knee - (1 - high) * above));
  });

  test("the registry decides the cut points", () => {
    expect(score(0.45)).toBe(param("cif.scale.max"));
    withParamOverrides({ "ctcBands.upperHalf": 0.4 }, () => {
      expect(score(0.45)).toBeLessThan(param("cif.scale.max"));
    });
  });
});

describe("overloadThreshold's details state the rank", () => {
  test("in the interior: the percentile and its band", () => {
    expect(overload(0.34).details).toBe(
      "Total CTC 0.340: costlier than 34% of the real pages we measured. Band: lower half (below the 50th percentile).",
    );
    expect(overload(0.87).details).toBe(
      "Total CTC 0.870: costlier than 87% of the real pages we measured. Band: high (80th-95th percentile).",
    );
  });

  test("at the ends of the reference", () => {
    expect(overload(0).details).toBe(
      "Total CTC 0.000: at or below the cheapest real page we measured. Band: lower half (below the 50th percentile).",
    );
    expect(overload(1).details).toBe(
      "Total CTC 1.000: at least as costly as the costliest real page we measured. Band: top 5% (95th percentile and above).",
    );
  });

  test("never a comfort word or an abandonment claim", () => {
    for (const t of [0, 0.1, 0.3, 0.5, 0.79, 0.8, 0.96, 1]) {
      expect(overload(t).details).not.toMatch(/easy|comfort|struggl|abandon|lower = less/i);
    }
  });
});

describe("a totalCTC that is not a percentile is not measured", () => {
  test("above one or below zero: from another scale, so neither scored nor ranked", () => {
    for (const t of [1.42, -0.1]) {
      const c = overload(t);
      expect(c.measured).toBe(false);
      expect(c.score).toBe(param("cif.noData.score"));
      // The one rule for anything not measured: "Not measured: no ... supplied".
      expect(c.details).toBe(`Not measured: no percentile total CTC (${t} is not a percentile, so it is from another scale and has no rank among the real pages we measured) supplied`);
    }
  });
});
