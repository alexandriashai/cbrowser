/**
 * Stage C: the cognitiveLoad layer and frustration's patience read law times,
 * not text features (research/stage-c-design.md).
 *
 * - The 15 text and navigation demand terms of cognitiveLoad and the two
 *   text-to-patience terms of frustration are retired from the registry.
 * - comprehension, workingMemory, informationForaging and transferLearning are
 *   asked the decision demand (choosing seconds against the time budget), and
 *   patience the reading demand, with no share constant.
 * - siteFamiliarity is Cockburn, Gutwin & Greenberg's (2007) expertise e on the
 *   choosing time the four abilities are asked, a per-run visit state:
 *   T = (1 - e) T_novice + e T_expert. The decision dispositions keep the
 *   first-visit time (they bill surplus, and a shorter time would make a
 *   familiar visit costlier). It is no longer a trait the chain reads, so a
 *   persona's own value changes nothing and every persona in a run is scored
 *   against the same demand, and more familiarity never costs more.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { deriveMetrics } from "../src/visual/cognitive-transport.js";
import {
  computeDemandDistribution,
  computeSequentialCTC,
  DEMAND_DIMENSIONS,
  LAYER_DEFINITIONS,
  SURPLUS_FREE_DIMENSIONS,
} from "../src/visual/cognitive-transport-chain.js";
import { MODEL_PROVENANCE } from "../src/visual/model-provenance.js";
import { referenceRaw } from "../src/visual/ctc-reference.js";
import { timeDemand } from "../src/visual/demand-laws.js";
import { ROSTER, toolProfile } from "./fixtures/ctc-golden-matrix.js";

const LOAD = ["comprehension", "workingMemory", "informationForaging", "transferLearning"];

const RETIRED = [
  "chain.demand.info.workingMemory",
  "chain.demand.info.informationForaging",
  "chain.demand.text.comprehension",
  "chain.demand.wordLength.comprehension",
  "chain.demand.sentenceLength.workingMemory",
  "chain.demand.sentenceLength.comprehension",
  "chain.demand.lexicalDiversity.comprehension",
  "chain.demand.lexicalDiversity.transferLearning",
  "chain.demand.longWords.comprehension",
  "chain.demand.technical.comprehension",
  "chain.demand.technical.transferLearning",
  "chain.demand.nav.halfSaturation",
  "chain.demand.nav.workingMemory",
  "chain.demand.nav.transferLearning",
  "chain.demand.nav.siteFamiliarity",
  "chain.demand.text.patience",
  "chain.demand.sentenceLength.patience",
];

const PAGES = (["viewport", "full_page"] as const).flatMap((scope) => referenceRaw(scope).map((r) => deriveMetrics(r)));

describe("the retired demand terms", () => {
  test("none of the 17 is registered", () => {
    expect(RETIRED.filter((id) => id in MODEL_PROVENANCE)).toEqual([]);
  });

  test("text features and navigation depth move no demand", () => {
    for (const m of PAGES.slice(0, 40)) {
      const base = computeDemandDistribution(m).demands;
      const moved = computeDemandDistribution({
        ...m,
        informationDensity: 1 - m.informationDensity,
        textDensity: 1 - m.textDensity,
        avgWordLength: 1,
        avgSentenceLength: 1,
        lexicalDiversity: 0,
        longWordRatio: 1,
        technicalDensity: 1,
        navigationDepth: 40,
      }).demands;
      expect(moved).toEqual(base);
    }
  });
});

describe("what cognitiveLoad and patience are asked", () => {
  test("cognitiveLoad reads the four abilities; siteFamiliarity is no dimension and in no layer", () => {
    const layer = LAYER_DEFINITIONS.find((l) => l.name === "cognitiveLoad");
    expect(layer?.traits).toEqual(LOAD);
    expect((DEMAND_DIMENSIONS as readonly string[]).includes("siteFamiliarity")).toBe(false);
    expect(SURPLUS_FREE_DIMENSIONS.has("siteFamiliarity")).toBe(false);
    expect(LAYER_DEFINITIONS.some((l) => l.traits.includes("siteFamiliarity"))).toBe(false);
  });

  test("on every reference page, each load trait is asked the decision demand and patience the reading demand", () => {
    for (const m of PAGES) {
      const d = computeDemandDistribution(m).demands;
      for (const t of LOAD) expect(d[t]).toBe(d.satisficing);
      expect(d.patience).toBe(d.readingCapacity);
      expect(d.satisficing).toBe(timeDemand(m.choosingSeconds));
    }
  });
});

describe("site familiarity is Cockburn et al.'s expertise e on the choosing time", () => {
  test("PageMetrics carries the expert limit, never above the novice time", () => {
    for (const m of PAGES) {
      expect(typeof m.choosingSecondsExpert).toBe("number");
      expect(m.choosingSecondsExpert).toBeGreaterThanOrEqual(0);
      expect(m.choosingSecondsExpert).toBeLessThanOrEqual(m.choosingSeconds + 1e-12);
    }
  });

  test("a PageMetrics without the expert time, or a familiarity outside [0, 1], is refused", () => {
    const m = PAGES[0];
    const { choosingSecondsExpert: _drop, ...without } = m;
    expect(() => computeDemandDistribution(without as never)).toThrow(/choosingSecondsExpert/);
    for (const bad of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => computeDemandDistribution(m, { siteFamiliarity: bad })).toThrow(/siteFamiliarity/);
    }
  });

  test("property: for any e in [0, 1] the abilities are asked d((1 - e) T_novice + e T_expert), the dispositions the first-visit time, and e = 0 is the pre-change choosing time exactly", () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: PAGES.length - 1 }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      (i, e) => {
        const m = PAGES[i];
        const d = computeDemandDistribution(m, { siteFamiliarity: e }).demands;
        const expected = timeDemand((1 - e) * m.choosingSeconds + e * m.choosingSecondsExpert);
        for (const t of LOAD) if (Math.abs(d[t] - expected) > 1e-12) return false;
        if (!Object.is(d.satisficing, timeDemand(m.choosingSeconds))) return false;
        const at0 = computeDemandDistribution(m, { siteFamiliarity: 0 }).demands;
        return LOAD.every((t) => Object.is(at0[t], timeDemand(m.choosingSeconds)))
          && JSON.stringify(computeDemandDistribution(m).demands) === JSON.stringify(at0);
      },
    ), { numRuns: 500 });
  });

  test("property: more familiarity never asks more of the abilities, and a daily user is asked less on a page with choices", () => {
    const withChoices = PAGES.filter((m) => m.choosingSeconds > m.choosingSecondsExpert);
    expect(withChoices.length).toBeGreaterThan(PAGES.length / 2);
    for (const m of withChoices) {
      expect(computeDemandDistribution(m, { siteFamiliarity: 1 }).demands.comprehension)
        .toBeLessThan(computeDemandDistribution(m, { siteFamiliarity: 0 }).demands.comprehension);
    }
    fc.assert(fc.property(
      fc.integer({ min: 0, max: PAGES.length - 1 }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      (i, a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const dLo = computeDemandDistribution(PAGES[i], { siteFamiliarity: lo }).demands;
        const dHi = computeDemandDistribution(PAGES[i], { siteFamiliarity: hi }).demands;
        return LOAD.every((t) => dHi[t] <= dLo[t] + 1e-15) && dHi.satisficing === dLo.satisficing;
      },
    ), { numRuns: 300 });
  });

  // The invariant that kept e off the decision layer (research/stage-c-design.md
  // 10.2): with e also shortening the dispositions' choosing time, a familiar
  // visit cost MORE than a first one on 72 of 513 viewport reference pages for
  // the typical user (billed surplus). Checked on every persona, the typical
  // user included, as a property and as a sweep over a sample of the reference.
  const TYPICAL = { name: "typical-user", traits: Object.fromEntries(Object.keys(ROSTER["power-user"].cognitiveTraits!).map((t) => [t, 0.5])) };
  const FAMILIARITY_PERSONAS = [...Object.keys(ROSTER).map((n) => toolProfile(n, ROSTER[n])), TYPICAL];
  const SAMPLE = PAGES.filter((_, i) => i % 8 === 0);
  const E_PAIRS: Array<[number, number]> = [[0, 0.5], [0.5, 1], [0, 1]];
  const costlierWhenFamiliar = (demandAt: (m: (typeof PAGES)[number], e: number) => ReturnType<typeof computeDemandDistribution>) => {
    let n = 0;
    for (const p of FAMILIARITY_PERSONAS) for (const m of SAMPLE) for (const [lo, hi] of E_PAIRS) {
      if (computeSequentialCTC(p as never, demandAt(m, hi)).rawCTC > computeSequentialCTC(p as never, demandAt(m, lo)).rawCTC + 1e-12) n++;
    }
    return n;
  };

  test("property: for any persona, reference page and e1 < e2, the more familiar visit never costs more", () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: PAGES.length - 1 }),
      fc.integer({ min: 0, max: FAMILIARITY_PERSONAS.length - 1 }),
      fc.integer({ min: 0, max: 999 }),
      fc.integer({ min: 1, max: 1000 }),
      (i, k, a, step) => {
        const e1 = a / 1000;
        const e2 = Math.min(1, (a + step) / 1000);
        const at = (e: number) => computeSequentialCTC(FAMILIARITY_PERSONAS[k] as never, computeDemandDistribution(PAGES[i], { siteFamiliarity: e })).rawCTC;
        return at(e2) <= at(e1) + 1e-12;
      },
    ), { numRuns: 500 });
  });

  test("sweep: every persona and the typical user, every 8th reference page at both scopes, e pairs 0-0.5, 0.5-1 and 0-1: none costlier when familiar", () => {
    expect(SAMPLE.length).toBeGreaterThan(120);
    expect(costlierWhenFamiliar((m, e) => computeDemandDistribution(m, { siteFamiliarity: e }))).toBe(0);
  }, 60_000);

  test("the sweep goes red when e also reaches the decision dispositions (absence test of the test)", () => {
    const DECISION = ["satisficing", "anchoringBias", "fearOfMissingOut", "socialProofSensitivity", "riskTolerance"];
    const onDecisionToo = (m: (typeof PAGES)[number], e: number) => {
      const d = computeDemandDistribution(m, { siteFamiliarity: e });
      const first = computeDemandDistribution(m).demands;
      const scale = first.satisficing > 0 ? d.demands.comprehension / first.satisficing : 1;
      const out = { ...d, demands: { ...d.demands } };
      for (const t of DECISION) out.demands[t] = first[t] * scale;
      return out;
    };
    // 1,464 of the sweep's 10,062 cases when measured (2026-10-23).
    expect(costlierWhenFamiliar(onDecisionToo)).toBeGreaterThan(0);
  }, 60_000);

  test("property: within a run the demand is the run's, not the persona's: a persona's own siteFamiliarity changes nothing", () => {
    const names = Object.keys(ROSTER);
    fc.assert(fc.property(
      fc.integer({ min: 0, max: PAGES.length - 1 }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.integer({ min: 0, max: names.length - 1 }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      (i, e, k, own) => {
        const demand = computeDemandDistribution(PAGES[i], { siteFamiliarity: e });
        const prof = toolProfile(names[k], ROSTER[names[k]]);
        const a = computeSequentialCTC({ ...prof, traits: { ...prof.traits, siteFamiliarity: own } }, demand);
        const b = computeSequentialCTC({ ...prof, traits: { ...prof.traits, siteFamiliarity: 1 - own } }, demand);
        return Object.is(a.rawCTC, b.rawCTC);
      },
    ), { numRuns: 200 });
  });
});
