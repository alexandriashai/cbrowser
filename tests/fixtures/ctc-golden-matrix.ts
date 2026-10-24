/**
 * The golden matrix for the cognitive transport chain: every human persona,
 * built the way cognitive_effort builds it, plus two synthetic boundary
 * personas, against a spread of demand vectors, under every option set the
 * tools use.
 *
 * Shared by three callers so they cannot drift from each other:
 *   generate-ctc-golden.ts   writes tests/fixtures/ctc-golden-21.0.0.json
 *   ctc-golden.test.ts       recomputes it and asserts Object.is on every number
 *   ctc-provenance.test.ts   runs it under provenance recording
 *
 * The persona build mirrors src/mcp-tools/base/persona-comparison-tools.ts
 * (cognitive_effort): copy cognitiveTraits, siteFamiliarity 0.0 (no site
 * model), bridgeCapacityTraits on the copy, buildOTCognitiveProfile.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { BUILTIN_PERSONAS, ACCESSIBILITY_PERSONAS, EMOTIONAL_PERSONAS } from "../../src/personas.js";
import { bridgeCapacityTraits } from "../../src/visual/cognitive-models.js";
import { demandFromLegacy, withLawSeconds, MAX_LAW_SECONDS, type LawSeconds } from "./law-seconds.js";
import { buildOTCognitiveProfile, type OTCognitiveProfile } from "../../src/visual/cognitive-transport.js";
import {
  computeDemandDistribution,
  computeDemandFromRawMetrics,
  computeSequentialCTC,
  computeSequentialScrollCTC,
  DEMAND_DIMENSIONS,
  type DemandDistribution,
  type PageMetrics,
} from "../../src/visual/cognitive-transport-chain.js";
import { resolveValuesForPersona } from "../../src/values/index.js";

type AnyPersona = { name?: string; cognitiveTraits?: Record<string, number>; accessibilityTraits?: Record<string, number> };

export const ROSTER: Record<string, AnyPersona> = {
  ...BUILTIN_PERSONAS,
  ...ACCESSIBILITY_PERSONAS,
  ...EMOTIONAL_PERSONAS,
} as Record<string, AnyPersona>;

/** Twelve raw-metric demand vectors spanning low to high on all seven inputs. */
/** A page's demand from its pre-Stage-B counts, or with the law times given. */
export function rawDemand(args: [number, number, number, number, number, number, number], seconds?: LawSeconds): DemandDistribution {
  if (!seconds) return demandFromLegacy(...args);
  const [info, vis, , text, anim, , nav] = args;
  return computeDemandFromRawMetrics(info, vis, text, anim, nav, seconds.pointingSeconds, seconds.choosingSeconds, seconds.readingSeconds, seconds.procedureSeconds, seconds.choosingSecondsExpert);
}

/**
 * Pages described by their pre-Stage-B counts (informationDensity,
 * visualComplexity, interactiveElementCount, textDensity, animationLevel,
 * choiceCount, navigationDepth). Stage B takes the motor, decision, procedure
 * and reading demands from law times; tests/fixtures/law-seconds.ts gives each
 * page the times that ask what the retired curves asked of its counts, except
 * where `seconds` is set: "max" and the wall screens carry the design's maxima,
 * above every page in the reference sample, so the near-saturated regime real
 * full_page measurements sit in is pinned too.
 */
export const RAW_DEMANDS: Array<{ id: string; args: [number, number, number, number, number, number, number]; seconds?: LawSeconds }> = [
  { id: "empty",         args: [0, 0, 0, 0, 0, 0, 0] },
  { id: "sparse",        args: [0.1, 0.1, 2, 0.1, 0, 1, 1] },
  { id: "light",         args: [0.2, 0.25, 8, 0.2, 0.05, 3, 1] },
  { id: "mid",           args: [0.5, 0.5, 40, 0.5, 0.2, 12, 3] },
  { id: "text-heavy",    args: [0.9, 0.3, 10, 0.95, 0, 4, 2] },
  { id: "visual-heavy",  args: [0.3, 0.95, 25, 0.2, 0.9, 6, 2] },
  { id: "control-heavy", args: [0.4, 0.5, 300, 0.3, 0.1, 50, 2] },
  { id: "choice-heavy",  args: [0.5, 0.4, 60, 0.4, 0.15, 150, 4] },
  { id: "deep",          args: [0.6, 0.6, 30, 0.6, 0.3, 10, 12] },
  { id: "animated",      args: [0.5, 0.7, 20, 0.5, 1.0, 8, 3] },
  { id: "dense",         args: [0.85, 0.85, 120, 0.8, 0.5, 40, 6] },
  { id: "max",           args: [1, 1, 1000, 1, 1, 500, 30], seconds: MAX_LAW_SECONDS },
];

/**
 * Full PageMetrics with the v18.56 readability fields set, so the
 * text-difficulty branch of computeDemandDistribution (which
 * computeDemandFromRawMetrics never reaches) is pinned too, plus boundary
 * pages that put each threshold or max-term in play.
 */
export const PAGE_DEMANDS: Array<{ id: string; metrics: Omit<PageMetrics, keyof LawSeconds> }> = [
  { id: "readable-prose", metrics: {
    informationDensity: 0.5, visualComplexity: 0.3, interactiveElementCount: 15, textDensity: 0.6,
    animationLevel: 0.1, choiceCount: 5, navigationDepth: 2,
    avgWordLength: 0.3, avgSentenceLength: 0.35, lexicalDiversity: 0.4, longWordRatio: 0.2, technicalDensity: 0.1,
  } },
  { id: "technical-prose", metrics: {
    informationDensity: 0.8, visualComplexity: 0.5, interactiveElementCount: 30, textDensity: 0.9,
    animationLevel: 0.2, choiceCount: 10, navigationDepth: 4,
    avgWordLength: 0.9, avgSentenceLength: 0.85, lexicalDiversity: 0.9, longWordRatio: 0.8, technicalDensity: 0.95,
  } },
  // Added in 21.0. comprehension demand is a max over seven terms, and on the
  // two pages above the density and technical terms always won, so the four
  // readability weights below never set a number (the dead-constant test found
  // them). One page per term, each where that term is the largest.
  ...(["avgWordLength", "avgSentenceLength", "lexicalDiversity", "longWordRatio"] as const).map((field) => ({
    id: `dominant-${field}`,
    metrics: {
      informationDensity: 0.2, visualComplexity: 0.3, interactiveElementCount: 10, textDensity: 0.2,
      animationLevel: 0.1, choiceCount: 4, navigationDepth: 2,
      avgWordLength: 0.1, avgSentenceLength: 0.1, lexicalDiversity: 0.1, longWordRatio: 0.1, technicalDensity: 0.05,
      [field]: 0.95,
    } as PageMetrics,
  })),
  // Just above the depletion gate: cognitiveLoad's content scale is 0.1004
  // against chain.depletionGate 0.1, so the gate decides whether this page
  // depletes. Without a page near it, the threshold changed no number.
  { id: "gate-edge", metrics: {
    informationDensity: 0.062, visualComplexity: 0, interactiveElementCount: 0, textDensity: 0,
    animationLevel: 0, choiceCount: 0, navigationDepth: 0,
  } },
];

/**
 * Two synthetic personas at the edges of the capacity space, added in 21.0.
 * They are not people and are not in ROSTER (the DRO tests and the delta
 * report iterate ROSTER): they pin branches no human persona reaches.
 *
 *   boundary-floor   every dimension at 0.02: the only
 *                    persona deep enough in deficit for the drawdown cap
 *                    (chain.maxDrawdownFraction) and the tolerance floor
 *                    (chain.abandonment.toleranceFloor) to bind.
 *   boundary-sparse  no traits at all: every dimension reads
 *                    chain.missingTraitCapacity, the path a caller takes with
 *                    a partial trait record (computeSequentialCTC and the DRO
 *                    population both accept one).
 *   boundary-zero    every dimension at 0, a caller-built persona at the very
 *                    bottom (added with Stage C): the only path on which the
 *                    numerical floor (chain.capacityEpsilon) binds now that no
 *                    built-in persona starts below 0.1. Through 20.x it bound on
 *                    every tool-path run, through siteFamiliarity at 0.
 */
export const BOUNDARY_PERSONAS: Record<string, Record<string, number>> = {
  "boundary-floor": Object.fromEntries(DEMAND_DIMENSIONS.map((d) => [d, 0.02])),
  "boundary-sparse": {},
  "boundary-zero": Object.fromEntries(DEMAND_DIMENSIONS.map((d) => [d, 0])),
};

/** Multi-screen inputs for computeSequentialScrollCTC (3, 5, 8 and 2 screens). */
export const SCROLL_INPUTS: Array<{ id: string; screens: Array<[number, number, number, number, number, number, number]>; seconds?: LawSeconds }> = [
  { id: "short-3", screens: [[0.4, 0.5, 20, 0.4, 0.2, 8, 1], [0.6, 0.4, 10, 0.7, 0.1, 4, 1], [0.3, 0.3, 30, 0.2, 0.0, 12, 1]] },
  { id: "article-5", screens: [
    [0.5, 0.6, 25, 0.5, 0.3, 10, 2], [0.8, 0.3, 5, 0.9, 0.0, 2, 2], [0.85, 0.3, 4, 0.95, 0.0, 2, 2],
    [0.7, 0.4, 8, 0.8, 0.1, 3, 2], [0.4, 0.5, 40, 0.3, 0.2, 20, 2],
  ] },
  { id: "landing-8", screens: [
    [0.3, 0.9, 15, 0.2, 0.9, 6, 1], [0.5, 0.7, 30, 0.4, 0.5, 12, 1], [0.6, 0.6, 20, 0.6, 0.2, 8, 1],
    [0.7, 0.5, 10, 0.7, 0.1, 4, 1], [0.5, 0.8, 50, 0.3, 0.6, 24, 1], [0.6, 0.4, 12, 0.6, 0.0, 6, 1],
    [0.9, 0.3, 6, 0.9, 0.0, 3, 1], [0.4, 0.6, 60, 0.3, 0.3, 30, 1],
  ] },
  // Added in 21.0: two maximal screens. The drawdown cap only binds for a layer
  // costing more than 1/depletionRate x the cap, and only a layer's OWN traits
  // feel it, which nothing reads again on the same page. A second screen is
  // where that capped capacity is read, so this is what pins
  // chain.maxDrawdownFraction (via boundary-floor).
  { id: "wall-2", screens: [[1, 1, 1000, 1, 1, 500, 30], [1, 1, 1000, 1, 1, 500, 30]], seconds: MAX_LAW_SECONDS },
];

const SCHWARTZ_KEYS = ["selfDirection", "stimulation", "hedonism", "achievement", "power", "security", "conformity", "tradition", "benevolence", "universalism"];

/** The ten Schwartz scores of a real persona, via resolveValuesForPersona; falls back to power-user. */
export function schwartzFor(name: string): { source: string; values: Record<string, number> } {
  const own = resolveValuesForPersona(name);
  const source = own ? name : "power-user";
  const pv = (own ?? resolveValuesForPersona("power-user")) as unknown as Record<string, number> | undefined;
  if (!pv) throw new Error("no persona values resolvable, not even power-user");
  const values: Record<string, number> = {};
  for (const k of SCHWARTZ_KEYS) if (typeof pv[k] === "number") values[k] = pv[k];
  return { source, values };
}

/** Build a persona's profile the way cognitive_effort does with no site model. */
export function toolProfile(name: string, p: AnyPersona): OTCognitiveProfile {
  const traits = { ...(p.cognitiveTraits ?? {}) } as Record<string, number>;
  traits.siteFamiliarity = 0.0;
  try { bridgeCapacityTraits(name, traits, p.accessibilityTraits); } catch { /* the tool tolerates this too */ }
  return buildOTCognitiveProfile(name, traits);
}

export const OPTION_SETS: Array<{ id: string; options: { asymmetric?: boolean; interactions?: boolean; withValues?: boolean } }> = [
  { id: "asym+inter", options: { asymmetric: true, interactions: true } },
  { id: "symmetric", options: { asymmetric: false } },
  { id: "no-inter", options: { interactions: false } },
  { id: "asym+inter+values", options: { asymmetric: true, interactions: true, withValues: true } },
];

export interface GoldenRun {
  totalCTC: number; totalCTCInterval: [number, number]; rawCTC: number; additiveCTC: number; deficitCost: number; surplusCost: number;
  bottleneckLayer: string; abandonmentRisk: number;
  layers: Array<{ name: string; transportCost: number; capacityConsumed: number; headroom: number }>;
  interactions: Record<string, number>; interactionTotal: number;
  /** In `dimensions` order (DEMAND_DIMENSIONS), to keep the fixture small. */
  traitCosts: number[]; remainingCapacity: number[];
}

export interface GoldenScroll {
  totalAbandonment: number; expectedDepthScreens: number; reachWeightedCTC: number;
  dropOff: { screen: number; layer: string; share: number } | null;
  screens: Array<{
    screen: number; screenCTC: number; stopHazard: number; cumulativeAbandonment: number; reachProbability: number;
    bottleneckLayer: string; layers: Array<{ name: string; transportCost: number; capacityConsumed: number; headroom: number }>;
    /** In `dimensions` order. */
    remainingCapacity: number[];
  }>;
}

export interface GoldenMatrix {
  personas: string[];
  /** The order of every per-dimension array below. */
  dimensions: string[];
  demands: string[];
  optionSets: string[];
  valuesSource: Record<string, string>;
  /** runs[persona][demand][optionSet] */
  runs: Record<string, Record<string, Record<string, GoldenRun>>>;
  /** scroll[persona][input] */
  scroll: Record<string, Record<string, GoldenScroll>>;
}

export function allDemands(): Array<{ id: string; demand: DemandDistribution }> {
  return [
    ...RAW_DEMANDS.map((d) => ({ id: d.id, demand: rawDemand(d.args, d.seconds) })),
    ...PAGE_DEMANDS.map((d) => ({ id: d.id, demand: computeDemandDistribution(withLawSeconds(d.metrics)) })),
  ];
}

/** A per-dimension record as an array in DEMAND_DIMENSIONS order; a missing dimension fails loudly. */
function byDimension(rec: Record<string, number>): number[] {
  return DEMAND_DIMENSIONS.map((d) => {
    const v = rec[d];
    if (typeof v !== "number") throw new Error(`dimension ${d} missing from record`);
    return v;
  });
}

function pickRun(r: ReturnType<typeof computeSequentialCTC>): GoldenRun {
  let interactionTotal = 0;
  for (const v of Object.values(r.interactions)) interactionTotal += v;
  return {
    totalCTC: r.totalCTC, totalCTCInterval: [...r.totalCTCInterval], rawCTC: r.rawCTC, additiveCTC: r.additiveCTC, deficitCost: r.deficitCost, surplusCost: r.surplusCost,
    bottleneckLayer: r.bottleneckLayer, abandonmentRisk: r.abandonmentRisk,
    layers: r.layers.map((l) => ({ name: l.name, transportCost: l.transportCost, capacityConsumed: l.capacityConsumed, headroom: l.headroom })),
    interactions: { ...r.interactions }, interactionTotal,
    traitCosts: byDimension(r.traitCosts), remainingCapacity: byDimension(r.remainingCapacity),
  };
}

export function buildGoldenMatrix(): GoldenMatrix {
  const personas = [...Object.keys(ROSTER), ...Object.keys(BOUNDARY_PERSONAS)];
  const demands = allDemands();
  const runs: GoldenMatrix["runs"] = {};
  const scroll: GoldenMatrix["scroll"] = {};
  const valuesSource: Record<string, string> = {};
  for (const name of personas) {
    const profile = name in BOUNDARY_PERSONAS
      ? buildOTCognitiveProfile(name, { ...BOUNDARY_PERSONAS[name] })
      : toolProfile(name, ROSTER[name]);
    const sv = schwartzFor(name);
    valuesSource[name] = sv.source;
    runs[name] = {};
    for (const d of demands) {
      runs[name][d.id] = {};
      for (const o of OPTION_SETS) {
        const { withValues, ...rest } = o.options;
        const opts = withValues ? { ...rest, schwartzValues: sv.values } : rest;
        runs[name][d.id][o.id] = pickRun(computeSequentialCTC(profile, d.demand, opts));
      }
    }
    scroll[name] = {};
    for (const s of SCROLL_INPUTS) {
      const r = computeSequentialScrollCTC(profile, s.screens.map((a) => rawDemand(a, s.seconds)), { asymmetric: true, interactions: true });
      scroll[name][s.id] = {
        totalAbandonment: r.totalAbandonment, expectedDepthScreens: r.expectedDepthScreens, reachWeightedCTC: r.reachWeightedCTC,
        dropOff: r.dropOff ? { ...r.dropOff } : null,
        screens: r.screens.map((x) => ({
          screen: x.screen, screenCTC: x.screenCTC, stopHazard: x.stopHazard, cumulativeAbandonment: x.cumulativeAbandonment,
          reachProbability: x.reachProbability, bottleneckLayer: x.bottleneckLayer,
          layers: x.layers.map((l) => ({ name: l.name, transportCost: l.transportCost, capacityConsumed: l.capacityConsumed, headroom: l.headroom })),
          remainingCapacity: byDimension(x.remainingCapacity),
        })),
      };
    }
  }
  return {
    personas, dimensions: [...DEMAND_DIMENSIONS], demands: demands.map((d) => d.id),
    optionSets: OPTION_SETS.map((o) => o.id), valuesSource, runs, scroll,
  };
}

/**
 * Walk two values in parallel and return every path where they differ.
 * Numbers compare with Object.is (no tolerance, -0 and NaN distinct); strings
 * and nulls with ===; arrays and objects by shape and recursively.
 */
export function diffExact(expected: unknown, actual: unknown, path = "", out: string[] = []): string[] {
  if (typeof expected === "number" || typeof actual === "number") {
    if (!Object.is(expected, actual)) out.push(`${path}: expected ${String(expected)} got ${String(actual)}`);
    return out;
  }
  if (expected === null || actual === null || typeof expected !== "object" || typeof actual !== "object") {
    if (expected !== actual) out.push(`${path}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
    return out;
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    const e = expected as unknown[]; const a = actual as unknown[];
    if (!Array.isArray(e) || !Array.isArray(a) || e.length !== a.length) { out.push(`${path}: array shape differs`); return out; }
    e.forEach((v, i) => diffExact(v, a[i], `${path}[${i}]`, out));
    return out;
  }
  const e = expected as Record<string, unknown>; const a = actual as Record<string, unknown>;
  const keys = new Set([...Object.keys(e), ...Object.keys(a)]);
  for (const k of keys) {
    if (!(k in e) || !(k in a)) { out.push(`${path}.${k}: present on one side only`); continue; }
    diffExact(e[k], a[k], path ? `${path}.${k}` : k, out);
  }
  return out;
}
