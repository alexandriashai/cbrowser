/**
 * totalCTC is a percentile against real pages (src/visual/ctc-reference.ts).
 *
 * Claims:
 *   1. The reference is what it says: every attempted page has one outcome,
 *      only graded pages carry measurements, both scopes are present, the
 *      frames and page types are all represented, and the registry entries
 *      name the graded count the code ranks against.
 *   2. The crawl's rules show in the record: the proxy only after a blocked
 *      direct attempt and never for .gov or .mil, proxy failures as codes
 *      only, every graded page allowed by robots.txt, every robots outcome a
 *      disallow, and the measure-stage page-metric constants recorded and
 *      enforced.
 *   3. The population is the golden matrix's: the same 25 personas, built the
 *      way cognitive_effort builds them.
 *   4. The curve is a continuous, monotone, piecewise-linear interpolated ECDF
 *      with 0 below the reference and 1 above it, Lipschitz with curveSlope.
 *   5. totalCTC is that curve at rawCTC, for the curve of the demand's scope
 *      and the run's asymmetric/interactions options; values and carried
 *      capacity do not select a curve. totalCTCInterval is the curve's
 *      bootstrap interval at the same rawCTC.
 *   6. The interval resamples PAGES, contains the point, collapses outside
 *      the reference, is monotone, is reproducible, covers about 95% when the
 *      truth is known, and costs microseconds per score.
 *   7. Persona differences survive the pooling, and the reference pages use
 *      the whole scale: about 5% of them above 0.95 and 5% below 0.05 (ISC-41).
 *   8. The curve is derived through the live chain from raw measurements: a
 *      changed chain constant or page-metric normaliser moves it, a changed
 *      measure-stage constant is refused, and a build stays under a second.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync } from "node:zlib";
import fc from "fast-check";
import {
  CTC_REFERENCE,
  bootstrapPercentileInterval,
  curveSlope,
  decodeReferenceRaw,
  intervalAt,
  percentileAt,
  percentileCurve,
  referenceGraded,
  referenceOutcomes,
  referencePages,
  referencePopulation,
  referenceRaw,
} from "../src/visual/ctc-reference.js";
import {
  computeDemandDistribution,
  computeDemandFromRawMetrics,
  computeSequentialCTC,
  computeSequentialScrollCTC,
  ctcReferenceCurve,
} from "../src/visual/cognitive-transport-chain.js";
import { RAW_PAGE_FORMAT } from "../src/visual/cognitive-transport.js";
import { MODEL_PROVENANCE, param, readsOf, withParamOverrides, withProvenance } from "../src/visual/model-provenance.js";
import { CTC_REFERENCE_PROVENANCE } from "../src/visual/provenance/ctc-reference.js";
import { PAGE_METRICS_MEASURE_IDS } from "../src/visual/provenance/page-metrics.js";
import { withLawSeconds, demandFromLegacy } from "./fixtures/law-seconds.js";
import { ROSTER, toolProfile, allDemands, schwartzFor } from "./fixtures/ctc-golden-matrix.js";

const ROOT = join(import.meta.dir, "..");
const OPTION_PAIRS = [
  { asymmetric: true, interactions: true },
  { asymmetric: true, interactions: false },
  { asymmetric: false, interactions: true },
  { asymmetric: false, interactions: false },
];
const FRAMES = ["brand", "tranco", "public"];
const TYPES = ["landing", "form", "search", "article", "help", "cart"];

describe("the reference set", () => {
  test("every attempted page has one outcome; only graded pages carry measurements, at both scopes", () => {
    const o = CTC_REFERENCE.outcomes;
    expect(o.graded + o.blocked + o.error + o.excluded + o.robots).toBe(o.attempted);
    const rows = referenceOutcomes();
    expect(rows.length).toBe(o.attempted);
    for (const k of ["graded", "blocked", "error", "excluded", "robots"] as const) expect(rows.filter((r) => r.outcome === k).length).toBe(o[k]);
    // An excluded page says why.
    for (const r of rows.filter((x) => x.outcome !== "graded")) expect(typeof r.detail).toBe("string");
    expect(CTC_REFERENCE.scopes).toEqual(["viewport", "full_page"]);
    expect(CTC_REFERENCE.viewport).toEqual({ width: 1920, height: 1080 });
    for (const scope of ["viewport", "full_page"] as const) {
      const raws = referenceRaw(scope);
      expect(raws.length).toBe(o.graded);
      for (const r of raws) expect(r.scope).toBe(scope);
      const pages = referencePages(scope);
      expect(pages.length).toBe(o.graded);
      for (const m of pages) expect(m.scope).toBe(scope);
    }
    expect(referenceGraded().length).toBe(o.graded);
  });

  test("every frame and every core page type is in the graded reference", () => {
    const graded = referenceGraded();
    for (const r of referenceOutcomes()) {
      expect(FRAMES).toContain(r.frame);
      expect(TYPES).toContain(r.pageType);
    }
    for (const f of FRAMES) expect(graded.filter((r) => r.frame === f).length).toBeGreaterThan(0);
    for (const t of TYPES.filter((x) => x !== "cart")) expect(graded.filter((r) => r.pageType === t).length).toBeGreaterThan(0);
    // An inner page says how it was found; a landing page needs no finding.
    for (const r of referenceOutcomes()) {
      if (r.pageType === "landing") expect(r.how).toBeUndefined();
      else expect(typeof r.how).toBe("string");
    }
    expect(CTC_REFERENCE.frames.map((f) => f.id)).toEqual(FRAMES);
    for (const f of CTC_REFERENCE.frames) expect(f.sitesTaken).toBeLessThanOrEqual(f.sitesListed);
  });

  test("the shipped measurements are raw format 2, and a record of another format is refused, not derived", () => {
    for (const scope of ["viewport", "full_page"] as const) for (const r of referenceRaw(scope)) expect(r.format).toBe(RAW_PAGE_FORMAT);
    const pack = (records: unknown[]) => brotliCompressSync(Buffer.from(JSON.stringify(records), "utf8")).toString("base64");
    const vp = referenceRaw("viewport"), fp = referenceRaw("full_page");
    const good = [0, 1].map((i) => ({ viewport: vp[i], full_page: fp[i] }));
    expect(decodeReferenceRaw(pack(good), 2, "t")).toEqual(good);
    // A format-1 record (nested prose counted again) is not ranked against.
    const old = good.map((p, i) => (i === 1 ? { ...p, full_page: { ...p.full_page, format: 1 } } : p));
    expect(() => decodeReferenceRaw(pack(old), 2, "t")).toThrow(/graded page 1 full_page is raw format 1; this build measures and ranks against format 2/);
    expect(() => decodeReferenceRaw(pack([{ viewport: vp[0] }, good[1]]), 2, "t")).toThrow(/graded page 0 full_page is raw format undefined/);
    expect(() => decodeReferenceRaw(pack(good), 3, "t")).toThrow(/2 raw measurements for 3 graded pages/);
  });

  test("blocked means did not load: no graded page has zero interactive elements on the whole document", () => {
    for (const m of referenceRaw("full_page")) expect(m.interactiveElements).toBeGreaterThan(0);
  });

  test("the registry names the graded count at each scope, as a definition, and the chain ranks only against it", () => {
    for (const scope of ["viewport", "full_page"] as const) {
      const e = MODEL_PROVENANCE[`ctcReference.${scope}`];
      expect(e.status).toBe("definition");
      expect(e.value).toBe(CTC_REFERENCE.outcomes.graded);
      expect(e.source).toContain(`src/data/${CTC_REFERENCE.id}.ts`);
      expect(e.source).toMatch(/not a fit/);
    }
    // The file also registers what is defined ON the percentile (ctcBands.*,
    // idealProfiles.maxCTC.*; tests/ctc-bands.test.ts, tests/ideal-profiles-ctc.test.ts).
    const own = CTC_REFERENCE_PROVENANCE.filter((e) => e.id.startsWith("ctcReference."));
    expect(own.map((e) => e.id).sort()).toEqual([
      "ctcReference.full_page", "ctcReference.interval.grid", "ctcReference.interval.level",
      "ctcReference.interval.replicates", "ctcReference.interval.seed", "ctcReference.viewport",
    ]);
    for (const e of own) expect(e.status).toBe("definition");
    const demand = demandFromLegacy(0.5, 0.5, 40, 0.5, 0.2, 12, 3);
    const prof = toolProfile("first-timer", ROSTER["first-timer"]);
    // A registry that disagrees with the shipped data is refused, not ranked against.
    expect(() => withParamOverrides({ "ctcReference.viewport": CTC_REFERENCE.outcomes.graded + 1 }, () => computeSequentialCTC(prof, demand)))
      .toThrow(/registers .* pages; the shipped reference has/);
  });

  test("a score records the reference it was ranked against, and the same dependencies cached or not", () => {
    const prof = toolProfile("elderly-user", ROSTER["elderly-user"]);
    const demand = demandFromLegacy(0.5, 0.5, 40, 0.5, 0.2, 12, 3);
    const summary = () => withProvenance(() => computeSequentialCTC(prof, demand)).provenance;
    const first = summary();
    expect(summary()).toEqual(first);
    // A curve built inside this call (an override context has its own cache)
    // records exactly what a cached one does.
    expect(withParamOverrides({}, summary)).toEqual(first);
    // The demand curves shape the reference pages, so the score depends on them
    // even though this demand was computed outside the recording; so do the
    // normalisers the reference pages' metrics are derived with.
    expect(first.hypotheses).toContain("chain.demand.info.workingMemory");
    expect(first.hypotheses).toContain("pageMetrics.informationDensity.midpoint");
    const { ids } = readsOf(() => computeSequentialCTC(prof, demand));
    expect(ids.has("ctcReference.viewport")).toBe(true);
    expect(ids.has("ctcReference.full_page")).toBe(false);
    for (const id of ["ctcReference.interval.replicates", "ctcReference.interval.seed", "ctcReference.interval.level", "ctcReference.interval.grid"]) expect(ids.has(id)).toBe(true);
    for (const id of PAGE_METRICS_MEASURE_IDS) expect(ids.has(id)).toBe(true);
  });

  test("the BLOCK_SIGNATURES both crawls applied are cognitive_effort's, verbatim", () => {
    const list = (src: string) => {
      const m = src.match(/BLOCK_SIGNATURES = \[([\s\S]*?)\];/);
      if (!m) throw new Error("no BLOCK_SIGNATURES list");
      return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    };
    const tool = list(readFileSync(join(ROOT, "src", "mcp-tools", "base", "persona-comparison-tools.ts"), "utf8"));
    expect(tool.length).toBeGreaterThan(5);
    for (const crawler of ["crawl.ts", "crawl-v2.ts"]) {
      expect(list(readFileSync(join(ROOT, "research", "ctc-reference", crawler), "utf8"))).toEqual(tool);
    }
  });
});

describe("the crawl's rules, as the record shows them", () => {
  const rows = referenceOutcomes();

  test("the proxy only for a page whose direct attempt was blocked, never for .gov or .mil", () => {
    for (const r of rows) {
      if (r.route === "proxy") {
        expect(/\.(gov|mil)$/i.test(new URL(r.url).hostname)).toBe(false);
        if (r.finalUrl) expect(/\.(gov|mil)$/i.test(new URL(r.finalUrl).hostname)).toBe(false);
        expect(r.proxyBytes).toBeGreaterThanOrEqual(0);
        // The record says why: the direct attempt before it was classified blocked.
        expect(r.proxiedBecause).toMatch(/^blocked: /);
      } else {
        expect(r.proxyBytes).toBe(0);
        expect(r.proxiedBecause).toBeUndefined();
      }
    }
    const p = CTC_REFERENCE.proxy;
    expect(p.region).toBe("us-central");
    expect(p.budgetBytes).toBe(3 * 1024 ** 3);
    // Every proxy attempt is counted, including one that a www. retry later replaced.
    expect(p.pages).toBeGreaterThanOrEqual(rows.filter((r) => r.route === "proxy").length);
    expect(p.bytes).toBeGreaterThanOrEqual(rows.reduce((x, r) => x + r.proxyBytes, 0));
    // The budget is only reported spent when it was.
    if (p.budgetExhausted) expect(p.bytes).toBeGreaterThanOrEqual(p.budgetBytes);
  });

  test("a failure through the proxy is stored as a code, never as a message that could name the proxy", () => {
    for (const r of rows.filter((x) => x.route === "proxy" && x.outcome === "error")) {
      expect(r.detail).toMatch(/^(net::ERR_[A-Z_]+|timeout|navigation failed|no result|unparseable result)$/);
    }
    for (const r of rows) for (const s of [r.detail, r.robots, r.how]) if (s) expect(s).not.toMatch(/proxy:|<proxy>|iproyal|_country-/i);
  });

  test("robots.txt: every graded page was allowed, every robots outcome was a disallow", () => {
    for (const r of rows.filter((x) => x.outcome === "graded")) expect(r.robots.startsWith("allowed")).toBe(true);
    for (const r of rows.filter((x) => x.outcome === "robots")) expect(r.robots.startsWith("disallowed")).toBe(true);
  });

  test("the measure-stage page-metric constants are recorded, and a different live value is refused", () => {
    expect(Object.keys(CTC_REFERENCE.measureParams).sort()).toEqual([...PAGE_METRICS_MEASURE_IDS].sort());
    for (const id of PAGE_METRICS_MEASURE_IDS) expect(CTC_REFERENCE.measureParams[id]).toBe(param(id));
    for (const id of ["pageMetrics.visual.colourSample", "pageMetrics.prose.lengthAbove", "pageMetrics.script.textShare"]) {
      expect(() => withParamOverrides({ [id]: param(id) * 1.1 }, () => ctcReferenceCurve("viewport")))
        .toThrow(new RegExp(`${id.replace(/\./g, "\\.")} is applied while a page is measured`));
    }
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
        expect(r.interval.replicates).toBe(param("ctcReference.interval.replicates"));
        expect(r.interval.level).toBe(param("ctcReference.interval.level"));
      }
  });
});

describe("totalCTC is the curve at rawCTC, and totalCTCInterval its interval there", () => {
  test("for every roster persona, golden page and option pair, against the demand's scope", () => {
    let n = 0;
    for (const [name, p] of Object.entries(ROSTER)) {
      const prof = toolProfile(name, p);
      for (const { demand } of allDemands())
        for (const opts of OPTION_PAIRS) {
          const r = computeSequentialCTC(prof, demand, opts);
          const ref = ctcReferenceCurve("viewport", opts);
          expect(r.referenceScope).toBe("viewport");
          expect(Object.is(r.totalCTC, percentileAt(ref.curve, r.rawCTC))).toBe(true);
          expect(r.totalCTCInterval).toEqual(intervalAt(ref.interval, r.rawCTC, r.totalCTC));
          expect(r.totalCTCInterval[0]).toBeLessThanOrEqual(r.totalCTC);
          expect(r.totalCTCInterval[1]).toBeGreaterThanOrEqual(r.totalCTC);
          n++;
        }
    }
    expect(n).toBe(25 * allDemands().length * 4);
  });

  test("the scope travels from the page metrics, and full_page is ranked against full_page pages", () => {
    const metrics = referencePages("full_page")[0];
    const demand = computeDemandDistribution(withLawSeconds(metrics));
    expect(demand.scope).toBe("full_page");
    const prof = toolProfile("power-user", ROSTER["power-user"]);
    const r = computeSequentialCTC(prof, demand);
    expect(r.referenceScope).toBe("full_page");
    expect(r.totalCTC).toBe(percentileAt(ctcReferenceCurve("full_page").curve, r.rawCTC));
    // The two references are different yardsticks.
    expect([...ctcReferenceCurve("full_page").curve.xs]).not.toEqual([...ctcReferenceCurve("viewport").curve.xs]);
  });

  test("Schwartz values and carried capacity do not select a curve: they describe the person, not the yardstick", () => {
    const demand = demandFromLegacy(0.6, 0.5, 30, 0.6, 0.2, 10, 3);
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
    const screens = [demandFromLegacy(0.4, 0.5, 20, 0.4, 0.2, 8, 1), demandFromLegacy(0.7, 0.3, 5, 0.8, 0, 2, 1)];
    const scroll = computeSequentialScrollCTC(prof, screens, { asymmetric: true, interactions: true });
    expect(scroll.screens.length).toBe(2);
    for (const s of scroll.screens) expect(s.screenCTC).toBeGreaterThanOrEqual(0);
  });

  test("the option pairs are different yardsticks: a symmetric cost is ranked among symmetric costs", () => {
    const a = ctcReferenceCurve("viewport", { asymmetric: true, interactions: true }).curve;
    const s = ctcReferenceCurve("viewport", { asymmetric: false, interactions: true }).curve;
    // Symmetric costs also bill surplus, so they sit higher: the asymmetric
    // median raw cost ranks far lower among symmetric costs. (The top can be
    // shared: on the v2 reference the costliest pair carries no surplus, so
    // both curves end at the same raw cost.)
    expect(s.xs[s.xs.length - 1]).toBeGreaterThanOrEqual(a.xs[a.xs.length - 1]);
    const median = a.xs[Math.floor((a.xs.length - 1) / 2)];
    expect(percentileAt(s, median)).toBeLessThan(percentileAt(a, median) - 0.1);
  });
});

describe("the interval", () => {
  const settings = { replicates: 1000, seed: 20261022, level: 0.95, grid: 101 };

  test("contains the point, sits in [0, 1], collapses below and above the reference, and is monotone in rawCTC", () => {
    for (const scope of ["viewport", "full_page"] as const) {
      const ref = ctcReferenceCurve(scope);
      const { xs } = ref.curve;
      const lo = xs[0], hi = xs[xs.length - 1];
      expect(intervalAt(ref.interval, lo - 1, 0)).toEqual([0, 0]);
      expect(intervalAt(ref.interval, hi + 1, 1)).toEqual([1, 1]);
      let prev: [number, number] = [0, 0];
      for (let k = 0; k <= 400; k++) {
        const x = lo + ((hi - lo) * k) / 400;
        const p = percentileAt(ref.curve, x);
        const [a, b] = intervalAt(ref.interval, x, p);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(1);
        expect(a).toBeLessThanOrEqual(p);
        expect(b).toBeGreaterThanOrEqual(p);
        expect(a).toBeGreaterThanOrEqual(prev[0] - 1e-12);
        expect(b).toBeGreaterThanOrEqual(prev[1] - 1e-12);
        prev = [a, b];
      }
      // Real width in the middle of the reference: a few hundred pages do not fix a median exactly.
      const mid = ref.interval.xs[Math.floor(ref.interval.xs.length / 2)];
      const [a, b] = intervalAt(ref.interval, mid, percentileAt(ref.curve, mid));
      expect(b - a).toBeGreaterThan(0.005);
      expect(b - a).toBeLessThan(0.3);
    }
  });

  test("pages are the sampling unit: a page's personas move together, and treating pairs as independent would narrow it", () => {
    // 60 pages whose 25 costs are all the page's own value: perfectly correlated within a page.
    const rng = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    const perPage = 25;
    const values = Array.from({ length: 60 }, () => rng() * 3);
    const costs = Float64Array.from(values.flatMap((v) => Array(perPage).fill(v)));
    const byPage = bootstrapPercentileInterval(costs, perPage, settings);
    const oneEach = bootstrapPercentileInterval(Float64Array.from(values), 1, settings);
    const pairs = bootstrapPercentileInterval(costs, 1, settings);
    const curve = percentileCurve(costs);
    const width = (iv: typeof byPage, x: number) => {
      const [a, b] = intervalAt(iv, x, percentileAt(curve, x));
      return b - a;
    };
    for (const x of [0.75, 1.5, 2.25]) {
      // The same as resampling the 60 pages' values: 25 equal costs are one draw.
      expect(Math.abs(width(byPage, x) - width(oneEach, x))).toBeLessThan(0.03);
      // Treating the 1,500 pairs as independent draws claims far more certainty.
      expect(width(pairs, x)).toBeLessThan(width(byPage, x) / 2);
    }
  });

  test("reproducible: the registered seed gives the same interval, another seed a different one", () => {
    const costs = Float64Array.from({ length: 40 * 5 }, (_, i) => Math.sin(i * 12.9898) * 43758.5453 % 1 + 1);
    const a = bootstrapPercentileInterval(costs, 5, settings);
    const b = bootstrapPercentileInterval(costs, 5, settings);
    const c = bootstrapPercentileInterval(costs, 5, { ...settings, seed: settings.seed + 1 });
    expect([...a.lo]).toEqual([...b.lo]);
    expect([...a.hi]).toEqual([...b.hi]);
    expect([...a.lo]).not.toEqual([...c.lo]);
  });

  test("calibration: on samples from a known distribution it covers the true percentile about 95% of the time", () => {
    // Uniform(0, 1) pages, one cost each: the true percentile of x is x. 200
    // reference sets of 150 pages; the interval at x = 0.5 and x = 0.8 should
    // contain 0.5 and 0.8 in roughly 95% of them.
    let seed = 1;
    const rand = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
    let hits50 = 0, hits80 = 0;
    const runs = 200;
    for (let r = 0; r < runs; r++) {
      const sample = Float64Array.from({ length: 150 }, rand);
      const iv = bootstrapPercentileInterval(sample, 1, { ...settings, seed: 1000 + r, replicates: 400, grid: 21 });
      const curve = percentileCurve(sample);
      const [a, b] = intervalAt(iv, 0.5, percentileAt(curve, 0.5));
      if (a <= 0.5 && 0.5 <= b) hits50++;
      const [c, d] = intervalAt(iv, 0.8, percentileAt(curve, 0.8));
      if (c <= 0.8 && 0.8 <= d) hits80++;
    }
    expect(hits50 / runs).toBeGreaterThan(0.88);
    expect(hits80 / runs).toBeGreaterThan(0.88);
    expect(hits50 / runs).toBeLessThanOrEqual(1);
  }, 60_000);

  test("a score pays microseconds for the percentile and its interval", () => {
    const ref = ctcReferenceCurve("viewport");
    const { xs } = ref.curve;
    const span = xs[xs.length - 1] - xs[0];
    let sink = 0;
    const t0 = performance.now();
    for (let i = 0; i < 100_000; i++) {
      const x = xs[0] + ((i * 0.618033988749895) % 1) * span;
      const p = percentileAt(ref.curve, x);
      sink += intervalAt(ref.interval, x, p)[1] - p;
    }
    const perCall = ((performance.now() - t0) * 1000) / 100_000;
    expect(Number.isFinite(sink)).toBe(true);
    expect(perCall).toBeLessThan(5);
  });
});

describe("what the percentile buys", () => {
  test("persona differences survive the pooling: on every reference page the raw order is the totalCTC order", () => {
    let differ = 0, pages = 0;
    for (const metrics of referencePages("viewport")) {
      const demand = computeDemandDistribution(withLawSeconds(metrics));
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
        const demand = computeDemandDistribution(withLawSeconds(metrics));
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

describe("the curve is derived through the live chain, from raw measurements", () => {
  test("a changed chain constant re-derives the curve, and the cache never serves it across the change", () => {
    const base = ctcReferenceCurve("viewport");
    expect(ctcReferenceCurve("viewport")).toBe(base);
    const moved = withParamOverrides({ "chain.weightDeficit": 1.1 }, () => ctcReferenceCurve("viewport"));
    expect(moved).not.toBe(base);
    expect([...moved.curve.xs]).not.toEqual([...base.curve.xs]);
    expect([...moved.interval.xs]).not.toEqual([...base.interval.xs]);
    // A demand-curve constant moves the reference pages' demand, so it moves the curve too.
    const demandMoved = withParamOverrides({ "chain.demand.sustained.base": 0.99 }, () => ctcReferenceCurve("viewport"));
    expect([...demandMoved.curve.xs]).not.toEqual([...base.curve.xs]);
    // Out of the override, the original curve is served again.
    expect(ctcReferenceCurve("viewport")).toBe(base);
    // The same raw cost ranks differently against the two curves.
    const mid = base.curve.xs[Math.floor(base.curve.xs.length / 2)];
    expect(percentileAt(moved.curve, mid)).not.toBe(percentileAt(base.curve, mid));
  });

  test("a changed page-metric normaliser re-derives the curve: the reference stores raw measurements, not metrics", () => {
    const base = ctcReferenceCurve("viewport");
    // A midpoint, a cap, and a sentence threshold applied to the stored length histograms.
    // Stage B: the law constants re-derive the curve from the stored raw records too
    // (choiceCap no longer does: no demand reads choiceCount, so it only bounds
    // the reported count).
    for (const [id, v] of [["pageMetrics.informationDensity.midpoint", 2500], ["pageMetrics.alphabetic.sentenceLengthAbove", 20],
      ["law.fitts.slope", 0.2], ["law.search.slope", 0.1], ["law.reading.wpm", 300], ["law.klm.mentalPreparation", 2], ["law.timeBudget", 20]] as const) {
      const moved = withParamOverrides({ [id]: v }, () => ctcReferenceCurve("viewport"));
      expect([...moved.curve.xs]).not.toEqual([...base.curve.xs]);
      expect(moved.reads).toContain(id);
    }
    // The pages it ranks against moved with it.
    const before = referencePages("viewport")[0].informationDensity;
    const after = withParamOverrides({ "pageMetrics.informationDensity.midpoint": 2500 }, () => referencePages("viewport")[0].informationDensity);
    expect(after).toBeGreaterThan(before);
  });

  test("a curve build stays under a second per scope and option pair", () => {
    for (const scope of ["viewport", "full_page"] as const)
      for (const opts of OPTION_PAIRS) {
        const t0 = performance.now();
        withParamOverrides({}, () => ctcReferenceCurve(scope, opts));
        expect(performance.now() - t0).toBeLessThan(1000);
      }
  });
});
