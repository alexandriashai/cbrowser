/**
 * Motion never makes a page cheaper (research/surplus-billing-design.md,
 * option f, decided 2026-10-24).
 *
 * Through 21.0's first cut, one carousel on a static page LOWERED the typical
 * user's viewport totalCTC by 0.085 on average, and on 92% of the 305 static
 * reference pages. emotionalContagion's only demand is motion, which is 0 on a
 * calm page, and its surplus was billed as weightSurplus (c - d)^2. So a calm
 * page charged every susceptible persona the most, and a carousel cut the
 * bill. Now emotionalContagion is priced by exposure (weightSurplus x c x d:
 * nothing to catch, nothing caught), and changeBlindness and patience are
 * surplus-free.
 *
 * "Static" is a reference page with no running animation, no autoplay and no
 * carousel; "one carousel" sets `carousel: true` on its raw measurement, as
 * research/sensitivity/carousel-check.ts does.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { referenceRaw, referencePopulation } from "../src/visual/ctc-reference.js";
import { computeDemandDistribution, computeSequentialCTC } from "../src/visual/cognitive-transport-chain.js";
import { buildOTCognitiveProfile, COGNITIVE_TRAITS, deriveMetrics, type RawPageMeasurement } from "../src/visual/cognitive-transport.js";
import { bridgeCapacityTraits } from "../src/visual/cognitive-models.js";

const OPTS = { asymmetric: true, interactions: true };
const EPS = 1e-12;
const SCOPES = ["viewport", "full_page"] as const;
const EC = "emotionalContagion";

/** The typical user as carousel-check.ts builds it: every authored trait 0.5, the bridge's capacities. */
function typicalTraits(): Record<string, number> {
  const caps = ["readingCapacity", "motorCapacity", "sustainedAttention"];
  const stated: Record<string, number> = {};
  bridgeCapacityTraits("typical-user", stated);
  const t: Record<string, number> = { siteFamiliarity: 0 };
  for (const k of COGNITIVE_TRAITS as readonly string[]) if (k !== "siteFamiliarity" && !caps.includes(k)) t[k] = 0.5;
  for (const c of caps) t[c] = stated[c];
  return t;
}
const ROSTER = [{ name: "typical-user", traits: typicalTraits() }, ...referencePopulation()];

const staticRaws = (scope: (typeof SCOPES)[number]) =>
  (referenceRaw(scope) as RawPageMeasurement[]).filter((r) => r.runningAnimations + r.autoplayElements === 0 && !r.carousel);
const PAGES = Object.fromEntries(SCOPES.map((s) => {
  const raws = staticRaws(s);
  return [s, raws.map((raw) => ({
    calm: computeDemandDistribution(deriveMetrics(raw)),
    moving: computeDemandDistribution(deriveMetrics({ ...raw, carousel: true })),
    metrics: deriveMetrics(raw),
  }))];
})) as Record<(typeof SCOPES)[number], Array<{ calm: ReturnType<typeof computeDemandDistribution>; moving: ReturnType<typeof computeDemandDistribution>; metrics: ReturnType<typeof deriveMetrics> }>>;
const frustration = (r: { layers: Array<{ name: string; transportCost: number }> }) => r.layers.find((l) => l.name === "frustration")!.transportCost;

describe("one carousel on a static page never makes it cheaper", () => {
  test("the reference has static pages at both scopes", () => {
    for (const s of SCOPES) expect(PAGES[s].length).toBeGreaterThan(200);
  });

  for (const scope of SCOPES) {
    test(`${scope}: for the roster and the typical user, on every static reference page, frustration and totalCTC never fall`, () => {
      const cheaper: string[] = [];
      PAGES[scope].forEach((p, i) => {
        for (const who of ROSTER) {
          const profile = buildOTCognitiveProfile(who.name, who.traits);
          const r0 = computeSequentialCTC(profile, p.calm, OPTS), r1 = computeSequentialCTC(profile, p.moving, OPTS);
          if (frustration(r1) < frustration(r0) - EPS) cheaper.push(`page ${i} ${who.name}: frustration ${frustration(r0)} -> ${frustration(r1)}`);
          if (r1.totalCTC < r0.totalCTC - EPS) cheaper.push(`page ${i} ${who.name}: totalCTC ${r0.totalCTC} -> ${r1.totalCTC}`);
        }
      });
      expect({ scope, cheaper: cheaper.length, first: cheaper.slice(0, 5) }).toEqual({ scope, cheaper: 0, first: [] });
    });
  }

  test("property: for any persona on any static reference page, frustration and totalCTC never fall", () => {
    const traits = fc.record(Object.fromEntries((COGNITIVE_TRAITS as readonly string[]).map((t) => [t, fc.double({ min: 0, max: 1, noNaN: true })])) as Record<string, fc.Arbitrary<number>>);
    const where = fc.tuple(fc.constantFrom(...SCOPES), fc.nat());
    fc.assert(fc.property(traits, where, (t, [scope, k]) => {
      const p = PAGES[scope][k % PAGES[scope].length];
      const profile = buildOTCognitiveProfile("arbitrary", t);
      const r0 = computeSequentialCTC(profile, p.calm, OPTS), r1 = computeSequentialCTC(profile, p.moving, OPTS);
      return frustration(r1) >= frustration(r0) - EPS && r1.totalCTC >= r0.totalCTC - EPS;
    }), { numRuns: 1500, seed: 20261024 });
  });
});

describe("emotionalContagion is priced by exposure", () => {
  test("its cost is 0 on every static reference page, for every roster persona and the typical user, at both scopes", () => {
    const charged: string[] = [];
    for (const scope of SCOPES) PAGES[scope].forEach((p, i) => {
      for (const who of ROSTER) {
        const c = computeSequentialCTC(buildOTCognitiveProfile(who.name, who.traits), p.calm, OPTS).traitCosts[EC];
        if (c !== 0) charged.push(`${scope} page ${i} ${who.name}: ${c}`);
      }
    });
    expect({ charged: charged.length, first: charged.slice(0, 5) }).toEqual({ charged: 0, first: [] });
  });

  test("its cost never falls as the page's motion rises (animationLevel 0 to 1), for every roster persona on every static page", () => {
    const LEVELS = [0, 0.05, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1];
    const falls: string[] = [];
    for (const scope of SCOPES) PAGES[scope].forEach((p, i) => {
      const demands = LEVELS.map((a) => computeDemandDistribution({ ...p.metrics, animationLevel: a }));
      for (const who of ROSTER) {
        const profile = buildOTCognitiveProfile(who.name, who.traits);
        const costs = demands.map((d) => computeSequentialCTC(profile, d, OPTS).traitCosts[EC]);
        for (let k = 1; k < costs.length; k++) if (costs[k] < costs[k - 1] - EPS) falls.push(`${scope} page ${i} ${who.name}: ${LEVELS[k - 1]} -> ${LEVELS[k]}: ${costs[k - 1]} -> ${costs[k]}`);
      }
    });
    expect({ falls: falls.length, first: falls.slice(0, 5) }).toEqual({ falls: 0, first: [] });
  });

  test("its cost never falls as the persona's emotionalContagion rises, on every static page with one carousel", () => {
    const VALUES = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
    const falls: string[] = [];
    for (const scope of SCOPES) PAGES[scope].forEach((p, i) => {
      for (const who of ROSTER) {
        const costs = VALUES.map((v) => computeSequentialCTC(buildOTCognitiveProfile(who.name, { ...who.traits, [EC]: v }), p.moving, OPTS).traitCosts[EC]);
        for (let k = 1; k < costs.length; k++) if (costs[k] < costs[k - 1] - EPS) falls.push(`${scope} page ${i} ${who.name}: ${VALUES[k - 1]} -> ${VALUES[k]}: ${costs[k - 1]} -> ${costs[k]}`);
      }
    });
    expect({ falls: falls.length, first: falls.slice(0, 5) }).toEqual({ falls: 0, first: [] });
  });
});
