/**
 * totalCTC is a percentile against real pages (src/visual/ctc-reference.ts).
 *
 * Claims:
 *   1. The reference is what it says: every attempted site has an outcome,
 *      only graded pages carry metrics, both scopes are present, and the
 *      registry entries name the graded count the code ranks against.
 *   2. The population is the golden matrix's: the same 25 personas, built the
 *      way cognitive_effort builds them.
 *   3. The curve is a continuous, monotone, piecewise-linear interpolated ECDF
 *      with 0 below the reference and 1 above it, Lipschitz with curveSlope.
 *   4. totalCTC is that curve at rawCTC, for the curve of the demand's scope
 *      and the run's asymmetric/interactions options; values and carried
 *      capacity do not select a curve.
 *   5. Persona differences survive the pooling, and the reference pages use
 *      the whole scale: about 5% of them above 0.95 and 5% below 0.05 (ISC-41).
 *   6. The curve is derived through the live chain: a changed constant moves it.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import {
  CTC_REFERENCE,
  curveSlope,
  percentileAt,
  percentileCurve,
  referenceOutcomes,
  referencePages,
  referencePopulation,
} from "../src/visual/ctc-reference.js";
import {
  computeDemandDistribution,
  computeDemandFromRawMetrics,
  computeSequentialCTC,
  computeSequentialScrollCTC,
  ctcReferenceCurve,
} from "../src/visual/cognitive-transport-chain.js";
import { MODEL_PROVENANCE, readsOf, withParamOverrides, withProvenance } from "../src/visual/model-provenance.js";
import { CTC_REFERENCE_PROVENANCE } from "../src/visual/provenance/ctc-reference.js";
import { ROSTER, toolProfile, allDemands, schwartzFor } from "./fixtures/ctc-golden-matrix.js";

const ROOT = join(import.meta.dir, "..");
const OPTION_PAIRS = [
  { asymmetric: true, interactions: true },
  { asymmetric: true, interactions: false },
  { asymmetric: false, interactions: true },
  { asymmetric: false, interactions: false },
];

describe("the reference set", () => {
  test("every attempted site has one outcome; only graded pages carry metrics, at both scopes", () => {
    const o = CTC_REFERENCE.outcomes;
    expect(o.graded + o.blocked + o.error).toBe(o.attempted);
    const sites = JSON.parse(readFileSync(join(ROOT, "research", "benchmark", "sites.json"), "utf8")) as unknown[];
    expect(o.attempted).toBe(sites.length);
    const rows = referenceOutcomes();
    expect(rows.length).toBe(o.attempted);
    expect(rows.filter((r) => r.outcome === "graded").length).toBe(o.graded);
    expect(rows.filter((r) => r.outcome === "blocked").length).toBe(o.blocked);
    // An excluded page says why.
    for (const r of rows.filter((x) => x.outcome !== "graded")) expect(typeof r.detail).toBe("string");
    expect(CTC_REFERENCE.scopes).toEqual(["viewport", "full_page"]);
    expect(CTC_REFERENCE.viewport).toEqual({ width: 1920, height: 1080 });
    for (const scope of ["viewport", "full_page"] as const) {
      const pages = referencePages(scope);
      expect(pages.length).toBe(o.graded);
      for (const m of pages) expect(m.scope).toBe(scope);
    }
  });

  test("blocked means did not load: no graded page has zero interactive elements on the whole document", () => {
    for (const m of referencePages("full_page")) expect(m.interactiveElementCount).toBeGreaterThan(0);
  });

  test("the registry names the graded count at each scope, as a definition, and the chain ranks only against it", () => {
    for (const scope of ["viewport", "full_page"] as const) {
      const e = MODEL_PROVENANCE[`ctcReference.${scope}`];
      expect(e.status).toBe("definition");
      expect(e.value).toBe(CTC_REFERENCE.outcomes.graded);
      expect(e.source).toContain(CTC_REFERENCE.id);
      expect(e.source).toMatch(/not a fit/);
    }
    expect(CTC_REFERENCE_PROVENANCE.map((e) => e.id).sort()).toEqual(["ctcReference.full_page", "ctcReference.viewport"]);
    const demand = computeDemandFromRawMetrics(0.5, 0.5, 40, 0.5, 0.2, 12, 3);
    const prof = toolProfile("first-timer", ROSTER["first-timer"]);
    // A registry that disagrees with the shipped data is refused, not ranked against.
    expect(() => withParamOverrides({ "ctcReference.viewport": CTC_REFERENCE.outcomes.graded + 1 }, () => computeSequentialCTC(prof, demand)))
      .toThrow(/registers .* pages; the shipped reference has/);
  });

  test("a score records the reference it was ranked against, and the same dependencies cached or not", () => {
    const prof = toolProfile("elderly-user", ROSTER["elderly-user"]);
    const demand = computeDemandFromRawMetrics(0.5, 0.5, 40, 0.5, 0.2, 12, 3);
    const summary = () => withProvenance(() => computeSequentialCTC(prof, demand)).provenance;
    const first = summary();
    expect(summary()).toEqual(first);
    // A curve built inside this call (an override context has its own cache)
    // records exactly what a cached one does.
    expect(withParamOverrides({}, summary)).toEqual(first);
    // The demand curves shape the reference pages, so the score depends on them
    // even though this demand was computed outside the recording.
    expect(first.hypotheses).toContain("chain.demand.info.workingMemory");
    const { ids } = readsOf(() => computeSequentialCTC(prof, demand));
    expect(ids.has("ctcReference.viewport")).toBe(true);
    expect(ids.has("ctcReference.full_page")).toBe(false);
  });

  test("the BLOCK_SIGNATURES the crawl applied are cognitive_effort's, verbatim", () => {
    const list = (src: string) => {
      const m = src.match(/BLOCK_SIGNATURES = \[([\s\S]*?)\];/);
      if (!m) throw new Error("no BLOCK_SIGNATURES list");
      return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    };
    const tool = list(readFileSync(join(ROOT, "src", "mcp-tools", "base", "persona-comparison-tools.ts"), "utf8"));
    const crawl = list(readFileSync(join(ROOT, "research", "ctc-reference", "crawl.ts"), "utf8"));
    expect(tool.length).toBeGreaterThan(5);
    expect(crawl).toEqual(tool);
  });
});

describe("the reference population", () => {
  test("is the golden roster, each persona built as cognitive_effort builds it", () => {
    const pop = referencePopulation();
    expect(pop.map((p) => p.name)).toEqual(Object.keys(ROSTER));
    expect(pop.length).toBe(25);
    for (const p of pop) expect(p.traits).toEqual(toolProfile(p.name, ROSTER[p.name]).traits);
  });
});

describe("the percentile curve", () => {
  test("is 0 at and below the lowest sample, 1 at and above the highest, linear between knots", () => {
    const c = percentileCurve([3, 1, 2, 5]);
    expect([...c.xs]).toEqual([1, 2, 3, 5]);
    expect([...c.ps]).toEqual([0, 1 / 3, 2 / 3, 1]);
    expect(percentileAt(c, 0)).toBe(0);
    expect(percentileAt(c, 1)).toBe(0);
    expect(percentileAt(c, 1.5)).toBeCloseTo(1 / 6, 15);
    expect(percentileAt(c, 4)).toBeCloseTo(5 / 6, 15);
    expect(percentileAt(c, 5)).toBe(1);
    expect(percentileAt(c, 99)).toBe(1);
    expect(Number.isNaN(percentileAt(c, Number.NaN))).toBe(true);
    expect(curveSlope(c)).toBeCloseTo(1 / 3, 15);
    expect(curveSlope(c, 3.5, 4)).toBeCloseTo(1 / 6, 15);
    expect(curveSlope(c, 6, 9)).toBe(0);
  });

  test("ties share their mean rank; the ends are pinned to 0 and 1", () => {
    const c = percentileCurve([1, 2, 2, 2, 3]);
    expect([...c.xs]).toEqual([1, 2, 3]);
    expect([...c.ps]).toEqual([0, 0.5, 1]);
    const ends = percentileCurve([1, 1, 2, 3, 3]);
    expect([...ends.ps]).toEqual([0, 0.5, 1]);
    expect(ends.samples).toBe(5);
  });

  test("refuses a reference with one distinct value or a non-finite sample", () => {
    expect(() => percentileCurve([2, 2, 2])).toThrow(/two distinct/);
    expect(() => percentileCurve([1, Number.NaN, 3])).toThrow(/not finite/);
  });

  test("property: monotone, in [0, 1], and Lipschitz with curveSlope", () => {
    fc.assert(fc.property(
      fc.array(fc.double({ min: 0, max: 10, noNaN: true }), { minLength: 2, maxLength: 60 }),
      fc.double({ min: -1, max: 11, noNaN: true }),
      fc.double({ min: -1, max: 11, noNaN: true }),
      (samples, a, b) => {
        fc.pre(new Set(samples).size >= 2);
        const c = percentileCurve(samples);
        const fa = percentileAt(c, a), fb = percentileAt(c, b);
        expect(fa).toBeGreaterThanOrEqual(0);
        expect(fa).toBeLessThanOrEqual(1);
        if (a <= b) expect(fa).toBeLessThanOrEqual(fb + 1e-12);
        expect(Math.abs(fa - fb)).toBeLessThanOrEqual(curveSlope(c) * Math.abs(a - b) * (1 + 1e-9) + 1e-12);
      },
    ), { numRuns: 500, seed: 7 });
  });

  test("the shipped curves are built from every graded page for every persona", () => {
    for (const scope of ["viewport", "full_page"] as const)
      for (const opts of OPTION_PAIRS) {
        const r = ctcReferenceCurve(scope, opts);
        expect(r.pages).toBe(CTC_REFERENCE.outcomes.graded);
        expect(r.personas).toBe(25);
        expect(r.curve.samples).toBe(r.pages * r.personas);
        expect(r.curve.xs.length).toBeGreaterThan(r.pages);
      }
  });
});

describe("totalCTC is the curve at rawCTC", () => {
  test("for every roster persona, golden page and option pair, against the demand's scope", () => {
    let n = 0;
    for (const [name, p] of Object.entries(ROSTER)) {
      const prof = toolProfile(name, p);
      for (const { demand } of allDemands())
        for (const opts of OPTION_PAIRS) {
          const r = computeSequentialCTC(prof, demand, opts);
          expect(r.referenceScope).toBe("viewport");
          expect(Object.is(r.totalCTC, percentileAt(ctcReferenceCurve("viewport", opts).curve, r.rawCTC))).toBe(true);
          n++;
        }
    }
    expect(n).toBe(25 * allDemands().length * 4);
  });

  test("the scope travels from the page metrics, and full_page is ranked against full_page pages", () => {
    const metrics = referencePages("full_page")[0];
    const demand = computeDemandDistribution(metrics);
    expect(demand.scope).toBe("full_page");
    const prof = toolProfile("power-user", ROSTER["power-user"]);
    const r = computeSequentialCTC(prof, demand);
    expect(r.referenceScope).toBe("full_page");
    expect(r.totalCTC).toBe(percentileAt(ctcReferenceCurve("full_page").curve, r.rawCTC));
    // The two references are different yardsticks.
    expect([...ctcReferenceCurve("full_page").curve.xs]).not.toEqual([...ctcReferenceCurve("viewport").curve.xs]);
  });

  test("Schwartz values and carried capacity do not select a curve: they describe the person, not the yardstick", () => {
    const demand = computeDemandFromRawMetrics(0.6, 0.5, 30, 0.6, 0.2, 10, 3);
    const curve = ctcReferenceCurve("viewport").curve;
    for (const name of ["elderly-user", "power-user", "cognitive-adhd"]) {
      const prof = toolProfile(name, ROSTER[name]);
      const withValues = computeSequentialCTC(prof, demand, { schwartzValues: schwartzFor(name).values });
      expect(withValues.totalCTC).toBe(percentileAt(curve, withValues.rawCTC));
      const carried = computeSequentialCTC(prof, demand, { carriedCapacity: computeSequentialCTC(prof, demand).remainingCapacity });
      expect(carried.totalCTC).toBe(percentileAt(curve, carried.rawCTC));
    }
    // And each screen of a scroll is ranked against the viewport reference.
    const prof = toolProfile("first-timer", ROSTER["first-timer"]);
    const screens = [computeDemandFromRawMetrics(0.4, 0.5, 20, 0.4, 0.2, 8, 1), computeDemandFromRawMetrics(0.7, 0.3, 5, 0.8, 0, 2, 1)];
    const scroll = computeSequentialScrollCTC(prof, screens, { asymmetric: true, interactions: true });
    expect(scroll.screens.length).toBe(2);
    for (const s of scroll.screens) expect(s.screenCTC).toBeGreaterThanOrEqual(0);
  });

  test("the option pairs are different yardsticks: a symmetric cost is ranked among symmetric costs", () => {
    const a = ctcReferenceCurve("viewport", { asymmetric: true, interactions: true }).curve;
    const s = ctcReferenceCurve("viewport", { asymmetric: false, interactions: true }).curve;
    expect(s.xs[s.xs.length - 1]).toBeGreaterThan(a.xs[a.xs.length - 1]);
  });
});

describe("what the percentile buys", () => {
  test("persona differences survive the pooling: on every reference page the raw order is the totalCTC order", () => {
    let differ = 0, pages = 0;
    for (const metrics of referencePages("viewport")) {
      const demand = computeDemandDistribution(metrics);
      const elderly = computeSequentialCTC(toolProfile("elderly-user", ROSTER["elderly-user"]), demand);
      const power = computeSequentialCTC(toolProfile("power-user", ROSTER["power-user"]), demand);
      // A monotone map cannot reverse an order; it can only tie at the ends.
      if (elderly.rawCTC > power.rawCTC) expect(elderly.totalCTC).toBeGreaterThanOrEqual(power.totalCTC);
      if (elderly.rawCTC < power.rawCTC) expect(elderly.totalCTC).toBeLessThanOrEqual(power.totalCTC);
      if (elderly.totalCTC !== power.totalCTC) differ++;
      pages++;
    }
    // And they still differ, on (nearly) every page: one curve per persona would have erased this.
    expect(differ).toBeGreaterThanOrEqual(pages - 1);
  });

  test("the reference uses the whole scale: about 5% of pooled (page, persona) pairs above 0.95, and 5% below 0.05", () => {
    for (const scope of ["viewport", "full_page"] as const) {
      const curve = ctcReferenceCurve(scope).curve;
      const pop = referencePopulation();
      let above = 0, below = 0, n = 0;
      for (const metrics of referencePages(scope)) {
        const demand = computeDemandDistribution(metrics);
        for (const p of pop) {
          const t = computeSequentialCTC({ name: p.name, traits: p.traits } as never, demand).totalCTC;
          if (t > 0.95) above++;
          if (t < 0.05) below++;
          n++;
        }
      }
      // By construction the pooled reference is spread evenly over [0, 1]: the
      // share above 0.95 is 5% up to ties and the pinned ends.
      expect(n).toBe(curve.samples);
      expect(above / n).toBeGreaterThan(0.03);
      expect(above / n).toBeLessThan(0.07);
      expect(below / n).toBeGreaterThan(0.03);
      expect(below / n).toBeLessThan(0.07);
    }
  });
});

describe("the curve is derived through the live chain", () => {
  test("a changed chain constant re-derives the curve, and the cache never serves it across the change", () => {
    const base = ctcReferenceCurve("viewport");
    expect(ctcReferenceCurve("viewport")).toBe(base);
    const moved = withParamOverrides({ "chain.weightDeficit": 1.1 }, () => ctcReferenceCurve("viewport"));
    expect(moved).not.toBe(base);
    expect([...moved.curve.xs]).not.toEqual([...base.curve.xs]);
    // A demand-curve constant moves the reference pages' demand, so it moves the curve too.
    const demandMoved = withParamOverrides({ "chain.demand.text.readingCapacity": 0.99 }, () => ctcReferenceCurve("viewport"));
    expect([...demandMoved.curve.xs]).not.toEqual([...base.curve.xs]);
    // Out of the override, the original curve is served again.
    expect(ctcReferenceCurve("viewport")).toBe(base);
    // The same raw cost ranks differently against the two curves.
    const mid = base.curve.xs[Math.floor(base.curve.xs.length / 2)];
    expect(percentileAt(moved.curve, mid)).not.toBe(percentileAt(base.curve, mid));
  });
});
