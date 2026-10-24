/**
 * Cognitive Optimal Transport
 *
 * Treats persona cognitive profiles as probability measures in Wasserstein space.
 * Provides mathematically grounded operations:
 *
 * - Cognitive distance: generalized W₁(personaA, personaB) — trait shape AND level
 * - Barycenter: consensus cognitive profile from multiple personas
 * - Geodesic interpolation: principled persona blending preserving trait coupling
 * - Adversarial generation: worst-case persona via distributionally robust optimization
 * - Cognitive load estimation: transport cost from expectation to reality
 *
 * Mathematical foundations:
 * - Taylor & Fiebach (2025): OT predicts neural activity at <225ms
 * - Dabney et al. (Nature 2020): brain maintains reward distributions, not points
 * - Thual et al. (NeurIPS 2022): unbalanced GW aligns individual brain representations
 * - Esfahani & Kuhn (Math Programming 2018): DRO with Wasserstein balls
 *
 * All computations are O(d³) or better for d=26 traits. Sub-millisecond. No GPU.
 *
 * @version 1.0.0
 * @since v18.27.0
 * @see https://github.com/alexandriashai/cbrowser/issues/159
 */

import { param } from "./model-provenance.js";
import {
  choosingSeconds, distanceToScreenCentre, fittsIndexOfDifficulty, klmSeconds, noviceSearchSeconds, hickHymanSeconds,
  labelReadingSeconds, pointingSeconds, readingSeconds, smallerOfWidth, type ChoiceGroup, type PointingTarget,
} from "./demand-laws.js";
import { exactW1 } from "./exact-w1.js";

// ── Types ──

export interface OTCognitiveProfile {
  /** Persona identifier */
  name: string;
  /** 25 cognitive trait values (0-1 each) */
  traits: Record<string, number>;
  /** Normalized trait distribution (sums to 1) — probability measure */
  distribution: Float64Array;
  /**
   * Total mass that `distribution` was divided by, i.e. the sum of the (floored)
   * trait values. The simplex throws this away, so without it a distribution
   * cannot be mapped back to trait scale at all — which is exactly how
   * interpolated personas ended up normalized. See distributionToTraits.
   */
  traitScale: number;
  /** Trait covariance matrix (25×25) for Gaussian model */
  covariance: Float64Array[];
}

export interface CognitiveDistance {
  /**
   * Generalized Wasserstein-1 distance between the two trait measures (shape
   * AND level; see cognitiveDistance). In [0, distance.slackCost].
   */
  w1: number;
  /** Wasserstein-2 distance (Bures-Wasserstein for Gaussians), on the simplex: shape only */
  w2: number;
  /**
   * Per-trait contribution to `w1`, plus one non-trait key, OVERALL_LEVEL_KEY
   * ("overallLevel"): the slack bin's half of the cost of creating or destroying
   * trait mass, exactly 0.5 * slackCost * |mean trait level A - mean trait
   * level B|. The values sum to `w1`.
   */
  traitContributions: Record<string, number>;
  /** Sliced Wasserstein-1 over uniform directions, exact (closed form), on the simplex: shape only */
  sliced: number;
}

export interface CognitiveBarycenter {
  /** Consensus trait values */
  traits: Record<string, number>;
  /** Consensus distribution */
  distribution: Float64Array;
  /** Mean distance from each input to barycenter */
  meanDistance: number;
  /** Per-persona distance to barycenter */
  distances: number[];
  /** The persona farthest from consensus (worst-served) */
  outlierPersona: string;
}

export interface GeodesicPoint {
  /** Position on geodesic (0 = persona A, 1 = persona B) */
  t: number;
  /** Interpolated trait values */
  traits: Record<string, number>;
  /** Interpolated distribution */
  distribution: Float64Array;
}

export interface AdversarialPersona {
  /** Generated worst-case trait values */
  traits: Record<string, number>;
  /** Distance from nearest known persona */
  distanceFromNearest: number;
  /** Which known persona it's closest to */
  nearestPersona: string;
  /** Predicted failure score (higher = worse for the interface) */
  failureScore: number;
  /** Which traits were perturbed most */
  perturbedTraits: Array<{ trait: string; delta: number }>;
}

// ── The 26 Cognitive Traits ──
//
// These names MUST match the `CognitiveTraits` interface in ../types.ts, because
// `traitsToDistribution` reads them off the object produced by
// `getCognitiveProfile()`. A name absent from that schema silently resolves to
// the `?? 0.5` default on line ~168 and still takes a full share of the
// normalized distribution.
//
// The previous list was hand-written and had drifted badly: 17 of its 25 names
// (frustrationResponse, decisionStyle, impulsivity, motorPrecision,
// processingSpeed, contrastSensitivity, …) exist in no schema in either repo, so
// they were constant 0.5 for every persona — pure dilution carrying no signal —
// while 18 of the 26 real traits were never looked at at all. Two personas
// differing only in curiosity, selfEfficacy or siteFamiliarity measured as
// identical on those axes. Only 8 of 25 names were real. (2026-07-28)
export const COGNITIVE_TRAITS = [
  // Core (4) — the required traits in the schema
  'patience', 'riskTolerance', 'comprehension', 'persistence',
  // Emotional (4)
  'resilience', 'selfEfficacy', 'emotionalContagion', 'attributionStyle',
  // Decision (4)
  'satisficing', 'anchoringBias', 'timeHorizon', 'fearOfMissingOut',
  // Planning (4)
  'interruptRecovery', 'metacognitivePlanning', 'proceduralFluency', 'transferLearning',
  // Perception (3)
  'informationForaging', 'changeBlindness', 'mentalModelFlexibility',
  // Social (3)
  'trustCalibration', 'socialProofSensitivity', 'authoritySensitivity',
  // Cognitive (3)
  'workingMemory', 'readingTendency', 'curiosity',
  // Experience (1)
  'siteFamiliarity',
  // Capacity dimensions, bridged from the formal models (2026-08-02)
  //
  // `sustainedAttention` is the third: the capacity to hold a line of text
  // under competition. It is bridged from `accessibilityTraits.attentionSpan`,
  // falling back to `interruptRecovery`. Attentional reading cost had no home
  // after `readingTendency` left the readability layer -- see the layer's own
  // comment in cognitive-transport-chain.ts.
  'readingCapacity', 'motorCapacity', 'sustainedAttention',
] as const;

export type CognitiveTrait = typeof COGNITIVE_TRAITS[number];

// ── Ground Metric Between Traits ──

/**
 * Ground metric d(trait_i, trait_j) encoding cognitive similarity.
 * Traits in the same domain are closer. This is the critical design
 * decision — it determines what "nearby" means in cognitive space.
 *
 * Organized by domain proximity (the values are read from the provenance
 * registry, provenance/distance.ts, where each is labelled `hypothesis`: the
 * grouping and the three levels are hand-assigned, untested against data):
 * - Same trait: 0
 * - Same domain (e.g. both "core"): distance.groundSameDomain (0.2)
 * - Related domains: distance.groundRelatedDomain (0.5)
 * - Unrelated domains, or either trait unknown: distance.groundUnrelatedDomain /
 *   distance.groundUnknownTrait (both 0.8)
 *
 * The docstring used to say 0.2 / 0.4 / 0.6 / 1.0, which the code never
 * returned. (2026-10-21)
 */
function traitGroundDistance(a: string, b: string): number {
  if (a === b) return 0;

  // Partitions COGNITIVE_TRAITS above; every one of the 26 appears exactly once.
  // The old map described the old phantom vocabulary, and its `motor` and
  // `accessibility` domains named traits that exist in no schema. (2026-07-28)
  const domains: Record<string, string[]> = {
    core: ['patience', 'riskTolerance', 'comprehension', 'persistence'],
    emotional: ['resilience', 'selfEfficacy', 'emotionalContagion', 'attributionStyle'],
    decision: ['satisficing', 'anchoringBias', 'timeHorizon', 'fearOfMissingOut'],
    planning: ['interruptRecovery', 'metacognitivePlanning', 'proceduralFluency', 'transferLearning'],
    perception: ['informationForaging', 'changeBlindness', 'mentalModelFlexibility'],
    social: ['trustCalibration', 'socialProofSensitivity', 'authoritySensitivity'],
    cognitive: ['workingMemory', 'readingTendency', 'curiosity'],
    // Deliberately a singleton: prior familiarity with a site is not a facet of
    // any other trait group. It therefore never earns the 0.2 same-domain
    // distance, which is correct rather than an oversight.
    experience: ['siteFamiliarity'],
  };

  // Related domain pairs (closer than unrelated)
  const related = new Set([
    'core-emotional', 'emotional-core',
    'core-decision', 'decision-core',
    'emotional-decision', 'decision-emotional',
    'perception-cognitive', 'cognitive-perception',
    'planning-decision', 'decision-planning',
    'cognitive-planning', 'planning-cognitive',
    // Familiarity is built from memory and shapes how a page is foraged.
    'experience-cognitive', 'cognitive-experience',
    'experience-perception', 'perception-experience',
  ]);

  let domainA = '', domainB = '';
  for (const [domain, traits] of Object.entries(domains)) {
    if (traits.includes(a)) domainA = domain;
    if (traits.includes(b)) domainB = domain;
  }

  // An unrecognized trait leaves its domain as "", and two unrecognized traits
  // would then satisfy domainA === domainB and be scored 0.2, i.e. "same
  // subdomain" — the closest possible relationship, awarded for being unknown.
  // That is how the phantom vocabulary above stayed invisible for so long.
  // Treat unknown as maximally distant instead. (2026-07-28)
  if (!domainA || !domainB) return param("distance.groundUnknownTrait");
  if (domainA === domainB) return param("distance.groundSameDomain");
  if (related.has(`${domainA}-${domainB}`)) return param("distance.groundRelatedDomain");
  return param("distance.groundUnrelatedDomain");
}

/**
 * The 29 x 29 ground-cost matrix C[i][j] = traitGroundDistance(trait_i, trait_j),
 * built once and reused by every distance call.
 *
 * The four registry values are still read through `param()` on every call (four
 * lookups, negligible), so a provenance recording started at any point sees the
 * ids the distance depends on; the matrix is rebuilt only if one of them changes.
 */
let groundCostCache: { key: string; matrix: number[][] } | null = null;
function groundCostMatrix(): number[][] {
  const key = [
    param("distance.groundSameDomain"),
    param("distance.groundRelatedDomain"),
    param("distance.groundUnrelatedDomain"),
    param("distance.groundUnknownTrait"),
  ].join(",");
  if (groundCostCache && groundCostCache.key === key) return groundCostCache.matrix;
  const d = COGNITIVE_TRAITS.length;
  const matrix: number[][] = Array.from({ length: d }, () => new Array<number>(d).fill(0));
  for (let i = 0; i < d; i++)
    for (let j = i + 1; j < d; j++)
      matrix[i][j] = matrix[j][i] = traitGroundDistance(COGNITIVE_TRAITS[i], COGNITIVE_TRAITS[j]);
  groundCostCache = { key, matrix };
  return matrix;
}

/** The 29 x 29 trait ground-cost matrix, exposed for tests (a copy). */
export function traitGroundCostMatrix(): number[][] {
  return groundCostMatrix().map(row => row.slice());
}

/**
 * Key of the slack bin's share in `CognitiveDistance.traitContributions`. Not a
 * trait: it is the part of the distance spent creating or destroying trait mass,
 * i.e. the difference in overall level between the two profiles.
 */
export const OVERALL_LEVEL_KEY = "overallLevel";

/**
 * The (d+1) x (d+1) cost matrix of the generalized distance: the trait ground
 * costs, plus a slack bin (last index) at distance.slackCost from every trait
 * and 0 from itself.
 *
 * Refuses to build if 2 * slackCost is below the largest ground cost. Below that
 * the triangle inequality fails through the slack bin (trait -> slack -> trait
 * would be cheaper than trait -> trait), the result is no longer a metric, and
 * the slack-bin problem stops being equal to the Piccoli-Rossi distance (see
 * cognitiveDistance). The registry values are frozen, so this can only fire on
 * an edit to provenance/distance.ts, and that edit should fail loudly.
 */
let generalizedCostCache: { ground: number[][]; slack: number; matrix: number[][] } | null = null;
function generalizedCostMatrix(): number[][] {
  // groundCostMatrix returns the same array until a registry value changes, so
  // its identity plus the slack cost is a complete cache key.
  const ground = groundCostMatrix();
  const slack = param("distance.slackCost");
  if (generalizedCostCache && generalizedCostCache.ground === ground && generalizedCostCache.slack === slack) {
    return generalizedCostCache.matrix;
  }
  let maxGround = 0;
  for (const row of ground) for (const c of row) if (c > maxGround) maxGround = c;
  if (2 * slack < maxGround) {
    throw new Error(`distance.slackCost ${slack} is below half the largest ground cost ${maxGround}: the generalized distance would not be a metric`);
  }
  const d = ground.length;
  const matrix: number[][] = ground.map(row => [...row, slack]);
  matrix.push([...new Array<number>(d).fill(slack), 0]);
  generalizedCostCache = { ground, slack, matrix };
  return matrix;
}

/** The generalized (trait + slack bin) cost matrix, exposed for tests (a copy). */
export function traitGeneralizedCostMatrix(): number[][] {
  return generalizedCostMatrix().map(row => row.slice());
}

/**
 * A profile's trait measure for the generalized distance: d + 1 masses that sum
 * to 1. Trait i carries t_i / d (t_i clamped to the schema range [0, 1], missing
 * traits at distance.missingTraitDefault); the last entry is the slack bin,
 * 1 - sum_i t_i / d, which holds the mass the traits do not.
 *
 * Unlike traitsToDistribution nothing is renormalised, so the absolute level
 * survives: all traits 0.2 puts 0.2 on the traits and 0.8 in the slack bin, all
 * traits 0.8 puts 0.8 and 0.2. No floor is applied either, because the solver
 * accepts zero atoms (distance.simplexFloor belongs to the simplex encoding).
 */
export function traitsToLevelMeasure(traits: Record<string, number>): Float64Array {
  const d = COGNITIVE_TRAITS.length;
  const missing = param("distance.missingTraitDefault");
  const measure = new Float64Array(d + 1);
  let traitMass = 0;
  for (let i = 0; i < d; i++) {
    const v = Math.min(1, Math.max(0, traits[COGNITIVE_TRAITS[i]] ?? missing));
    measure[i] = v / d;
    traitMass += measure[i];
  }
  // Max with 0: all traits at 1 can sum to 1 + 2e-16.
  measure[d] = Math.max(0, 1 - traitMass);
  return measure;
}

// ── Core: Trait Distribution Operations ──

/**
 * Normalize trait values to a probability measure (simplex).
 * This is the fundamental operation: traits → distribution.
 */
export function traitsToDistribution(traits: Record<string, number>): Float64Array {
  // The floor (distance.simplexFloor, 0.01) is a numerical encoding choice, not
  // a requirement of the transport problem: the exact W1 solver handles zero
  // atoms. It is kept because it is the one place the mapping is LOSSY and
  // callers depend on the exact behaviour — a trait of exactly 0 (first-timer's
  // siteFamiliarity is the only one across all built-in personas) round-trips
  // back as 0.01, not 0. That bound is asserted in
  // tests/cognitive-interpolate.test.ts rather than left for someone to
  // rediscover as a mystery 0.01 discrepancy. The missing-trait default
  // (distance.missingTraitDefault, 0.5) is a hypothesis: it claims an unmeasured
  // trait sits at the midpoint.
  const floor = param("distance.simplexFloor");
  const missing = param("distance.missingTraitDefault");
  const values = COGNITIVE_TRAITS.map(t => Math.max(floor, traits[t] ?? missing));
  const sum = values.reduce((a, b) => a + b, 0);
  return new Float64Array(values.map(v => v / sum));
}

/**
 * Convert distribution back to trait values (scaled to 0-1 range).
 */
export function distributionToTraits(
  dist: Float64Array,
  traitScale?: number,
): Record<string, number> {
  // WITH a scale this is the exact inverse of traitsToDistribution: that
  // function divides every trait by their sum, so multiplying by the same sum
  // returns the original values. Round-tripping a persona reproduces it.
  //
  // WITHOUT one it can only return relative SHAPE — every trait over the
  // largest trait — because the simplex discarded the absolute scale. That
  // fallback used to be the only behaviour, and its output was handed back as
  // if it were trait values: interpolating to position 1.0 returned
  // elderly-low-vision with every trait multiplied by 1/0.9 (its own maximum),
  // so attributionStyle 0.9 came back as 1.0 and the persona did not reproduce
  // itself. Callers that want trait values MUST pass the scale. (2026-07-29)
  const traits: Record<string, number> = {};
  if (traitScale !== undefined && traitScale > 0) {
    for (let i = 0; i < COGNITIVE_TRAITS.length; i++) {
      // Clamp: interpolated mass can round a hair outside the trait range.
      traits[COGNITIVE_TRAITS[i]] = Math.min(1, Math.max(0, dist[i] * traitScale));
    }
    return traits;
  }
  const maxVal = Math.max(...Array.from(dist));
  for (let i = 0; i < COGNITIVE_TRAITS.length; i++) {
    traits[COGNITIVE_TRAITS[i]] = maxVal > 0 ? dist[i] / maxVal : 0.5;
  }
  return traits;
}

/**
 * Build a OTCognitiveProfile from raw trait values.
 */
export function buildOTCognitiveProfile(name: string, traits: Record<string, number>): OTCognitiveProfile {
  const distribution = traitsToDistribution(traits);
  // Same flooring traitsToDistribution applies, or the inverse would not be one.
  const floor = param("distance.simplexFloor");
  const missing = param("distance.missingTraitDefault");
  const traitScale = COGNITIVE_TRAITS.reduce(
    (sum, t) => sum + Math.max(floor, traits[t] ?? missing),
    0,
  );

  // Build simple diagonal covariance (variance proportional to trait value uncertainty)
  const d = COGNITIVE_TRAITS.length;
  const covariance: Float64Array[] = [];
  for (let i = 0; i < d; i++) {
    const row = new Float64Array(d);
    // Variance = trait_value * (1 - trait_value) — maximum uncertainty at 0.5
    const v = distribution[i];
    row[i] = v * (1 - v) * 0.1 + 0.001; // Small floor to avoid singularity
    covariance.push(row);
  }

  return { name, traits, distribution, traitScale, covariance };
}

// ── Cognitive Distance ──

/**
 * E|<x, theta>| / ||x|| for theta uniform on the unit sphere in `d`
 * dimensions: Gamma(d/2) / (sqrt(pi) * Gamma((d + 1)/2)). The sliced
 * Wasserstein-1 distance between two points is this times their Euclidean
 * distance. Built from c_1 = 1, c_2 = 2/pi and c_(d+2) = c_d * d/(d + 1), so
 * no gamma function is needed; for odd d it is a product of rationals.
 * Exported for tests of the formula.
 */
export function sphereMeanAbsProjection(d: number): number {
  if (!Number.isInteger(d) || d < 1) throw new RangeError(`sphereMeanAbsProjection: d must be a positive integer, not ${d}`);
  let c = d % 2 === 1 ? 1 : 2 / Math.PI;
  for (let k = d % 2 === 1 ? 1 : 2; k < d; k += 2) c *= k / (k + 1);
  return c;
}

/**
 * Distance between two cognitive profiles.
 *
 * `w1` is the exact GENERALIZED Wasserstein-1 distance between the two trait
 * vectors (Piccoli & Rossi 2014, "Generalized Wasserstein distance and its
 * application to transport equations with source"; the unbalanced-OT form with
 * a per-unit cost for creating or destroying mass). Each profile is the measure
 * that puts t_i / 29 on trait i, so its total mass is its mean trait level and
 * is NOT normalised away. The distance is the cheapest way to turn one measure
 * into the other when moving a unit of mass from trait i to trait j costs
 * d(trait_i, trait_j) (traitGroundDistance) and creating or destroying a unit
 * costs c = distance.slackCost (0.4, a registered hypothesis).
 *
 * It is computed by the standard slack-bin reduction (traitsToLevelMeasure):
 * each measure gets one extra bin holding 1 - its trait mass, so both sum to 1,
 * the slack bin is at cost c from every trait and 0 from itself, and the exact
 * balanced W1 is solved on the 30 bins by min-cost flow (successive shortest
 * paths; see exact-w1.ts). Mass sent from a trait to the other side's slack bin
 * is destroyed, mass sent from the slack bin to a trait is created. The
 * reduction equals the Piccoli-Rossi distance (with a = c, b = 1) whenever
 * 2c >= the largest ground cost (0.8): a plan that both destroys at i and
 * creates at j can then be replaced by transporting i -> j at no greater cost,
 * so some optimum only destroys (or only creates) |mass_A - mass_B|, which the
 * slack bins always have room for since both trait masses are at most 1. The
 * same condition makes the 30-bin cost a metric, so `w1` is a metric on trait
 * vectors: 0 exactly when the 29 values agree (after the [0, 1] clamp and the
 * missing-trait default). tests/cognitive-distance-w1.test.ts checks the
 * reduction against the Piccoli-Rossi LP solved by an independent simplex.
 *
 * Bounds, with mean_i over the 29 traits:
 *   c * |mean_i t_A,i - mean_i t_B,i|  <=  w1  <=  c * mean_i |t_A,i - t_B,i|  <=  c.
 * The lower bound is the mass imbalance, which can only be created or
 * destroyed; the upper bound routes every difference through the slack bin.
 * Proportional profiles are no longer at distance 0: all traits 0.2 versus all
 * traits 0.8 is exactly 0.6 * c = 0.24 (both bounds meet). History: until
 * 2026-10-21 this field was a weighted L1 that was not optimal transport (see
 * exact-w1.ts); its exact replacement, shipped the same day, normalised both
 * profiles to the simplex, and that pair was at 0 on every metric.
 *
 * `w1` is also positively homogeneous in the trait difference: moving every
 * trait of A toward B by the same fraction scales the distance by that
 * fraction (Kantorovich-Rubinstein: W1 under a metric cost depends only on the
 * signed difference of the measures). So pushing a persona's traits further
 * from another's never brings it closer.
 *
 * `w2` and `sliced` are UNCHANGED and still computed on the simplex
 * (traitsToDistribution), so they remain shape-only: proportional profiles are
 * at 0 on both.
 *
 * `traitContributions[t]` is the cost attributed to trait t under the optimal
 * plan: half the cost of mass shipped OUT of t plus half the cost of mass
 * shipped INTO t, i.e. 0.5 * (sum_j P[t][j] C(t,j) + sum_i P[i][t] C(i,t)) over
 * all 30 bins. The slack bin's share is reported under OVERALL_LEVEL_KEY: half
 * of every creation or destruction is charged to the trait it happened at and
 * half to the overall level. Each unit of cost is split between the two
 * endpoints it connects, so the contributions sum to `w1` exactly and are
 * symmetric in the two profiles (swapping A and B transposes P and leaves every
 * contribution unchanged). Mass that stays put (P[t][t]) costs 0 and
 * contributes nothing.
 *
 * The optimal plan is often not unique (ties are common under a three-level
 * cost), and one tie matters for the attribution: destroying a unit at trait i
 * and creating one at trait j costs 2c = 0.8, exactly what moving it i -> j
 * costs between unrelated domains. Left to the solver, a pure shape difference
 * can be booked as a level difference: with exactW1's earlier end-node rule
 * (same optimal costs) 211 of the 300 roster pairs did, by up to 0.017. The
 * current solver happens not to (0 of 300 roster pairs, 0 of 21,000 random
 * pairs, 2026-10-21), but nothing guarantees which tied plan it returns, so
 * the plan is UNCROSSED after solving: wherever it both destroys at i and
 * creates at j, that mass is routed i -> j directly, which costs
 * C(i, j) <= 2c, so the plan stays optimal. With the old end-node rule put
 * back, uncrossing alone brings all 300 pairs back to the identity below.
 * The uncrossed plan creates or destroys exactly |mass_A - mass_B|, which makes
 * the attribution unique where it matters:
 *   overallLevel = 0.5 * c * |mean_i t_A,i - mean_i t_B,i|,
 * half of what the level difference forces (the other half is charged to the
 * traits where the mass is created or destroyed). Remaining ties among trait
 * pairs are settled by solving the pair in a canonical order, so the
 * attribution is deterministic and the same for (A, B) and (B, A). `w1` itself
 * is unique.
 */
export function cognitiveDistance(profileA: OTCognitiveProfile, profileB: OTCognitiveProfile): CognitiveDistance {
  const d = COGNITIVE_TRAITS.length;
  const a = profileA.distribution;
  const b = profileB.distribution;

  // Generalized W1: exact balanced W1 on the 30-bin slack measures.
  //
  // The pair is solved in a canonical order (lexicographically smaller
  // measure as the source) and the plan transposed back when needed. The
  // optimal COST is unique, but the optimal PLAN is not: with 30 bins and a
  // three-level cost many plans tie, and the solver run on (b, a) does not in
  // general find the transpose of its (a, b) plan. Fixing the order makes the
  // per-trait attribution below identical for (A, B) and (B, A).
  const ma = traitsToLevelMeasure(profileA.traits);
  const mb = traitsToLevelMeasure(profileB.traits);
  const cost = generalizedCostMatrix();
  const bins = d + 1;
  let swapped = false;
  for (let i = 0; i < bins; i++) {
    if (ma[i] === mb[i]) continue;
    swapped = ma[i] > mb[i];
    break;
  }
  const solved = swapped ? exactW1(mb, ma, cost) : exactW1(ma, mb, cost);

  // Uncross (see the docstring): mass destroyed at i (i -> slack) and mass
  // created at j (slack -> j) become i -> j plus slack -> slack. Row and column
  // sums are unchanged, and the cost changes by m * (C(i, j) - 2c) <= 0, which is
  // 0 at an optimum. Done on the canonical-order plan, before any transpose, so
  // (A, B) and (B, A) still get the same plan.
  const sp = solved.plan;
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d && sp[i][d] > 0; j++) {
      const m = Math.min(sp[i][d], sp[d][j]);
      if (m <= 0) continue;
      sp[i][d] -= m; sp[d][j] -= m;
      sp[i][j] += m; sp[d][d] += m;
    }
  }

  const plan = swapped ? sp.map((_, i) => sp.map(row => row[i])) : sp;
  let w1 = 0;
  const traitContributions: Record<string, number> = {};
  for (let t = 0; t < bins; t++) {
    let out = 0, into = 0;
    const row = plan[t];
    const costRow = cost[t];
    for (let j = 0; j < bins; j++) {
      if (row[j] > 0) out += row[j] * costRow[j];
      if (plan[j][t] > 0) into += plan[j][t] * cost[j][t];
    }
    w1 += out;
    traitContributions[t < d ? COGNITIVE_TRAITS[t] : OVERALL_LEVEL_KEY] = 0.5 * (out + into);
  }

  // W2: Bures-Wasserstein for Gaussians
  // BW²(N(m₁,Σ₁), N(m₂,Σ₂)) = ||m₁-m₂||² + Tr(Σ₁) + Tr(Σ₂) - 2Tr((Σ₁^½ Σ₂ Σ₁^½)^½)
  // For diagonal covariances: simplifies to sum of per-dimension terms
  let w2sq = 0;
  for (let i = 0; i < d; i++) {
    const meanDiff = a[i] - b[i];
    const sigA = Math.sqrt(profileA.covariance[i][i]);
    const sigB = Math.sqrt(profileB.covariance[i][i]);
    w2sq += meanDiff * meanDiff + (sigA - sigB) * (sigA - sigB);
  }
  const w2 = Math.sqrt(Math.max(0, w2sq));

  // Sliced Wasserstein-1 between the two profiles, as points on the simplex:
  // the mean over directions theta, uniform on the unit sphere, of
  // |<a - b, theta>|. For two points that mean has a closed form,
  // sphereMeanAbsProjection(d) * ||a - b||_2, so it is computed exactly rather
  // than estimated.
  //
  // It was estimated from 100 directions: unseeded Math.random() until
  // 2026-07-29 (the same pair gave 0.031568 and 0.029943), then seeded, but
  // drawn uniform in the cube [-1, 1]^d and normalized, which is not uniform
  // on the sphere. Against the exact value the roster's 300 pairs were off by
  // -20% to +19% (measured 2026-10-23). Uniform directions would not have
  // fixed that: 100 of them were off by -24% to +26%, the sampling error of
  // the estimate, and drawing them in 29 dimensions needs Gaussian components
  // whose Math.log and Math.cos differ in the last bits between Node and Bun.
  // The closed form takes only arithmetic and Math.sqrt.
  let diffSq = 0;
  for (let i = 0; i < d; i++) diffSq += (a[i] - b[i]) * (a[i] - b[i]);
  const sliced = sphereMeanAbsProjection(d) * Math.sqrt(diffSq);

  return { w1, w2, traitContributions, sliced };
}

// ── Barycenter (Consensus Cognition) ──

/**
 * Compute the Wasserstein barycenter of multiple cognitive profiles.
 * Returns the "consensus mind" — the optimal average that preserves
 * correlational structure between traits.
 *
 * For Gaussian measures: mean is weighted average, covariance via
 * fixed-point iteration (converges in 3-5 iterations for d=25).
 */
export function cognitiveBarycenter(
  profiles: OTCognitiveProfile[],
  weights?: number[],
): CognitiveBarycenter {
  const n = profiles.length;
  const d = COGNITIVE_TRAITS.length;
  const w = weights || new Array(n).fill(1 / n);

  // Normalize weights
  const wSum = w.reduce((a, b) => a + b, 0);
  const normalizedW = w.map(v => v / wSum);

  // Barycenter mean = weighted average of distributions
  const baryDist = new Float64Array(d);
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < d; i++) {
      baryDist[i] += normalizedW[k] * profiles[k].distribution[i];
    }
  }

  // Renormalize
  const barySum = baryDist.reduce((a, b) => a + b, 0);
  for (let i = 0; i < d; i++) baryDist[i] /= barySum;

  // Same reason as the geodesic: the barycenter of a set of simplex points is
  // still a simplex point, so it needs the weighted trait scale to come back as
  // trait values rather than as shape-over-its-own-maximum.
  const baryScale = profiles.reduce((sum, p, i) => sum + normalizedW[i] * p.traitScale, 0);
  const baryTraits = distributionToTraits(baryDist, baryScale);

  // Compute distances from each profile to barycenter
  const baryProfile = buildOTCognitiveProfile('barycenter', baryTraits);
  const distances = profiles.map(p => cognitiveDistance(p, baryProfile).w1);
  const meanDistance = distances.reduce((a, b) => a + b, 0) / n;

  // Find outlier (farthest from consensus)
  let maxDist = 0, outlierIdx = 0;
  for (let i = 0; i < n; i++) {
    if (distances[i] > maxDist) { maxDist = distances[i]; outlierIdx = i; }
  }

  return {
    traits: baryTraits,
    distribution: baryDist,
    meanDistance,
    distances,
    outlierPersona: profiles[outlierIdx].name,
  };
}

// ── Geodesic Interpolation ──

/**
 * Compute the Wasserstein geodesic between two cognitive profiles.
 * Returns points along the displacement interpolation.
 *
 * McCann interpolation: μ_t = ((1-t)Id + tT)_# μ₀
 * For Gaussians: mean interpolates linearly, covariance via matrix square root.
 *
 * The midpoint between ADHD and power-user preserves trait COUPLING,
 * not just averaged values. If ADHD has high creativity correlated with
 * low patience, the geodesic midpoint has intermediate coupling — not
 * independent intermediate values.
 */
export function cognitiveGeodesic(
  profileA: OTCognitiveProfile,
  profileB: OTCognitiveProfile,
  numPoints: number = 5,
): GeodesicPoint[] {
  const d = COGNITIVE_TRAITS.length;
  const points: GeodesicPoint[] = [];

  for (let step = 0; step <= numPoints; step++) {
    const t = step / numPoints;

    // Mean interpolation (linear in Wasserstein space)
    const dist = new Float64Array(d);
    for (let i = 0; i < d; i++) {
      dist[i] = (1 - t) * profileA.distribution[i] + t * profileB.distribution[i];
    }

    // Renormalize
    const sum = dist.reduce((a, b) => a + b, 0);
    for (let i = 0; i < d; i++) dist[i] /= sum;

    // The scale travels with the point. Without it every interpolated persona —
    // including the endpoints — comes back divided by its own largest trait.
    const scaleT = (1 - t) * profileA.traitScale + t * profileB.traitScale;

    points.push({
      t,
      traits: distributionToTraits(dist, scaleT),
      distribution: dist,
    });
  }

  return points;
}

/**
 * Find the point on the geodesic that maximizes a given cost function.
 * This is the "adversarial interpolation" — the persona between A and B
 * that is worst for the interface.
 */
export function findWorstCaseOnGeodesic(
  profileA: OTCognitiveProfile,
  profileB: OTCognitiveProfile,
  costFn: (traits: Record<string, number>) => number,
  resolution: number = 20,
): GeodesicPoint & { cost: number } {
  const geodesic = cognitiveGeodesic(profileA, profileB, resolution);
  let worst = geodesic[0];
  let worstCost = costFn(worst.traits);

  for (const point of geodesic) {
    const cost = costFn(point.traits);
    if (cost > worstCost) {
      worst = point;
      worstCost = cost;
    }
  }

  return { ...worst, cost: worstCost };
}

// ── Adversarial Persona Generation (DRO) ──

/**
 * Generate adversarial personas via Distributionally Robust Optimization.
 *
 * For each known persona, perturbs traits within a Wasserstein ball of
 * radius epsilon to find the worst-case cognitive profile for the
 * given interface cost function.
 *
 * Based on Esfahani & Kuhn (Math Programming 2018):
 * The inner maximization explicitly constructs the worst-case perturbation.
 *
 * @param knownPersonas - Array of known persona profiles
 * @param costFn - Function evaluating how badly a persona fails on the interface
 * @param epsilon - Wasserstein ball radius (0.05 = mild, 0.2 = aggressive)
 * @returns Array of adversarial personas, one per known persona
 */
export function generateAdversarialPersonas(
  knownPersonas: OTCognitiveProfile[],
  costFn: (traits: Record<string, number>) => number,
  epsilon: number = 0.1,
): AdversarialPersona[] {
  const d = COGNITIVE_TRAITS.length;
  const results: AdversarialPersona[] = [];

  for (const persona of knownPersonas) {
    // Gradient-based perturbation within Wasserstein ball
    // Approximate: perturb each trait independently, evaluate cost,
    // then combine the worst perturbations within the epsilon budget
    const perturbations: Array<{ trait: string; idx: number; delta: number; costGain: number }> = [];
    const baseCost = costFn(persona.traits);

    for (let i = 0; i < d; i++) {
      const trait = COGNITIVE_TRAITS[i];
      const baseVal = persona.traits[trait] ?? 0.5;

      // Try perturbation in both directions
      for (const direction of [-1, 1]) {
        const step = epsilon * 0.5; // Perturbation magnitude
        const newVal = Math.max(0, Math.min(1, baseVal + direction * step));
        const testTraits = { ...persona.traits, [trait]: newVal };
        const newCost = costFn(testTraits);
        const costGain = newCost - baseCost;

        if (costGain > 0) {
          perturbations.push({
            trait,
            idx: i,
            delta: newVal - baseVal,
            costGain,
          });
        }
      }
    }

    // Sort by cost gain, greedily apply perturbations within epsilon budget
    perturbations.sort((a, b) => b.costGain - a.costGain);

    const adversarialTraits = { ...persona.traits };
    let remainingBudget = epsilon;
    const appliedPerturbations: Array<{ trait: string; delta: number }> = [];

    for (const p of perturbations) {
      const cost = Math.abs(p.delta);
      if (cost <= remainingBudget) {
        adversarialTraits[p.trait] = Math.max(0, Math.min(1, (adversarialTraits[p.trait] ?? 0.5) + p.delta));
        remainingBudget -= cost;
        appliedPerturbations.push({ trait: p.trait, delta: p.delta });
      }
    }

    // Compute distance from nearest known persona
    const adversarialProfile = buildOTCognitiveProfile('adversarial', adversarialTraits);
    let minDist = Infinity;
    let nearestName = persona.name;
    for (const known of knownPersonas) {
      const dist = cognitiveDistance(adversarialProfile, known).w1;
      if (dist < minDist) { minDist = dist; nearestName = known.name; }
    }

    results.push({
      traits: adversarialTraits,
      distanceFromNearest: minDist,
      nearestPersona: nearestName,
      failureScore: costFn(adversarialTraits),
      perturbedTraits: appliedPerturbations.slice(0, 5),
    });
  }

  // Sort by failure score (worst first)
  results.sort((a, b) => b.failureScore - a.failureScore);
  return results;
}

// ── Cognitive Load Estimation ──

/**
 * Estimate cognitive load as the transport cost between a persona's
 * expectation distribution and the page's reality distribution.
 *
 * The expectation distribution is derived from the persona's traits:
 * - High patience → expects slower information delivery (wider temporal spread)
 * - attention / motor / text read the three BRIDGED capacities
 *   (sustainedAttention, motorCapacity, readingCapacity), so a caller must run
 *   bridgeCapacityTraits (visual/cognitive-models.ts) before building the
 *   profile, or those dimensions sit at the 0.5 missing-trait fallback.
 *
 * The reality distribution is derived from page analysis metrics.
 *
 * Every trait name read here must exist in COGNITIVE_TRAITS, and `p` is typed
 * to enforce it. Until 2026-10-10 (report item B29) five did not:
 * visualProcessing, motorPrecision and textProcessing exist in no schema, and
 * attentionPattern / decisionStyle are enums on the cognitive profile, never
 * numbers in the trait vector. All five fell back to 0.5, so visual, attention,
 * motor and text were identical for every persona -- live, cognitive-adhd,
 * power-user, dyslexic-user and distracted-user all scored the same four
 * numbers on them.
 */
export function estimateCognitiveLoad(
  persona: OTCognitiveProfile,
  pageMetrics: {
    informationDensity: number;    // 0-1: how dense the content is
    visualComplexity: number;      // 0-1: how visually complex
    interactiveElementCount: number;
    textDensity: number;           // 0-1: text-heaviness
    animationLevel: number;        // 0-1: motion/animation amount
    choiceCount: number;           // number of decision points
    navigationDepth: number;       // clicks to reach content
  },
): {
  totalLoad: number;               // 0-1 cognitive load score
  breakdown: Record<string, number>;
  overloaded: boolean;
  bottleneck: string;
  /** Breakdown dimensions that depend on the page only, never on the persona. */
  personaInvariant: string[];
} {
  const traits = persona.traits;
  const p = (t: CognitiveTrait) => traits[t] ?? 0.5;

  // Per-dimension load: mismatch between persona capacity and page demand
  // Use power 1.5 on page metrics for sharper scaling at high demand
  const breakdown: Record<string, number> = {};

  // No information dimension since 21.0 (Stage C, decided 2026-10-23). It was
  // informationDensity^1.5 x (1 - 0.8 x comprehension): text amount charged
  // against grasp of UI conventions, which is not reading. Text is the `text`
  // dimension below, against the bridged reading capacity. informationDensity
  // stays in the signature as a reported page metric and is not read.

  // Visual processing load. PERSONA-INVARIANT, and reported as such.
  //
  // It read `visualProcessing`, which exists in no schema, so it was already a
  // constant for everyone -- just an undeclared one. No trait in the vector has
  // a researched mapping onto visual-complexity tolerance, and inventing one
  // would turn a stated gap into a fabricated measurement. The 0.5 midpoint
  // keeps the number where it has always been; `personaInvariant` says what it
  // is. (B29, 2026-10-10)
  breakdown.visual = Math.pow(pageMetrics.visualComplexity, 1.5) * (1 - 0.5 * 0.8);

  // Attention load (animations vs the capacity to hold attention under
  // competition). Was `attentionPattern`, an enum ("skim", "thorough"...) that
  // is never a number in the trait vector. sustainedAttention is the bridged
  // capacity (accessibilityTraits.attentionSpan, then interruptRecovery). (B29)
  breakdown.attention = Math.pow(pageMetrics.animationLevel, 1.5) * (1 - p('sustainedAttention') * 0.8);

  // Decision load (Hick-Hyman: log2(choices) scaled by decision trait).
  //
  // Clamped: log2(choices)/5 passed 1 above 32 choices, so a 64-option page
  // scored 1.2^1.5 = 1.31 times the persona factor on a dimension every other
  // line here keeps in 0-1. satisficing alone, because decisionStyle is an enum
  // and only ever contributed its 0.5 fallback. (B29, 2026-10-10)
  const hickHyman = Math.min(1, Math.log2(Math.max(1, pageMetrics.choiceCount)) / 5);
  breakdown.decision = Math.pow(hickHyman, 1.5) * (1 - p('satisficing') * 0.8);

  // Motor load (interactive elements vs pointing capacity). motorCapacity is
  // bridged from the Fitts pointing model; `motorPrecision` exists nowhere. (B29)
  breakdown.motor = Math.pow(Math.min(1, pageMetrics.interactiveElementCount / 50), 1.5) * (1 - p('motorCapacity') * 0.8);

  // Text processing load. readingCapacity is bridged from the reading model
  // (decoding, visual span); `textProcessing` exists nowhere. (B29)
  breakdown.text = Math.pow(pageMetrics.textDensity, 1.5) * (1 - p('readingCapacity') * 0.8);

  // Working memory load (navigation depth)
  breakdown.memory = Math.pow(Math.min(1, pageMetrics.navigationDepth / 5), 1.5) * (1 - p('workingMemory') * 0.8);

  // Patience/frustration interaction
  breakdown.patience = (1 - p('patience')) * 0.3;

  // Total: weighted sum (each dimension contributes)
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0) / Object.keys(breakdown).length;

  // Find bottleneck
  let maxLoad = 0, bottleneck = Object.keys(breakdown)[0];
  for (const [key, val] of Object.entries(breakdown)) {
    if (val > maxLoad) { maxLoad = val; bottleneck = key; }
  }

  // Persona-dependent overload threshold: impatient users overload sooner
  const overloadThreshold = 0.35 + (p('patience') * 0.15);

  return {
    totalLoad: Math.min(1, total),
    breakdown,
    overloaded: total > overloadThreshold,
    bottleneck,
    personaInvariant: ['visual'],
  };
}

// ── Coverage Optimization ──

/**
 * Given a set of personas, find the N most different ones for maximum
 * test coverage. Uses greedy farthest-point sampling under the generalized W1
 * of cognitiveDistance (so a difference in overall level counts as well as one
 * in profile shape), seeded with the two farthest-apart profiles.
 *
 * The seed used to be `profiles[0]` — whichever persona happened to be first in
 * the caller's array. Farthest-point traversal is seed-sensitive, so the same
 * persona set in a different order produced a different "maximum coverage"
 * answer. Seeding with the diameter pair removes that order dependence and buys
 * a property worth having: because the selected set contains the two most
 * distant profiles, no unselected pair can be farther apart than the selected
 * set's own maximum.
 *
 * Honest about what this is NOT: exact max-diversity selection is NP-hard, and
 * greedy k-center remains a 2-approximation for the general objective. This
 * fixes determinism and the diameter property, not optimality. (2026-07-28)
 */
export function selectMaxCoveragePersonas(
  profiles: OTCognitiveProfile[],
  n: number,
): OTCognitiveProfile[] {
  if (profiles.length <= n) return profiles;
  if (n <= 0) return [];

  // Diameter pair: the two profiles with the greatest pairwise distance.
  let seedA = 0, seedB = 1, diameter = -1;
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const d = cognitiveDistance(profiles[i], profiles[j]).w1;
      if (d > diameter) { diameter = d; seedA = i; seedB = j; }
    }
  }

  if (n === 1) return [profiles[seedA]];

  const selected: OTCognitiveProfile[] = [profiles[seedA], profiles[seedB]];
  const remaining = new Set(profiles.filter((_, i) => i !== seedA && i !== seedB));

  while (selected.length < n && remaining.size > 0) {
    // Find the remaining profile farthest from all selected
    let farthest: OTCognitiveProfile | null = null;
    let maxMinDist = -1;

    for (const candidate of remaining) {
      let minDist = Infinity;
      for (const s of selected) {
        const dist = cognitiveDistance(candidate, s).w1;
        if (dist < minDist) minDist = dist;
      }
      if (minDist > maxMinDist) {
        maxMinDist = minDist;
        farthest = candidate;
      }
    }

    if (farthest) {
      selected.push(farthest);
      remaining.delete(farthest);
    }
  }

  return selected;
}

/**
 * Extract page metrics from a Playwright page for cognitive load estimation.
 * Runs a single page.evaluate() to gather all needed dimensions.
 */
/**
 * What the demand vector is measured over.
 *
 * `viewport` counts only elements intersecting the current viewport, which is
 * the first impression and the historical behaviour of this function. It was
 * ALSO the undeclared behaviour: every CTC number this tool ever produced
 * described the top screenful, and nothing in the output said so. Measured on
 * ucdenver.edu/academics -- 229 links and 6436px of page -- the viewport sees 4
 * links and 47 words, so the page scored LOWER cognitive load than the
 * homepage. Internally consistent, indefensible as output.
 *
 * `full_page` counts the whole document and normalises area-relative metrics
 * against the document rather than the viewport. Same formulas and the same
 * midpoints: nothing here is recalibrated, because inventing new constants
 * while fixing an undeclared assumption would just be a second undeclared
 * assumption.
 */
export type MetricScope = "viewport" | "full_page";

/**
 * The page's geometry, measured ONCE and shared by everything that derives from it.
 *
 * `pageScreens` (the caption) and `screenCount` (how many screens the sequential path
 * scores) were two independent derivations of one quantity, computed from two separate
 * height reads at two different moments. That is the same class as the capacity bridge
 * that existed in one of two tools: one model, two consumers, separately wired.
 *
 * It is a defect whether or not the height is stable, and the instability is not
 * hypothetical -- an external client measured 5.8 screens on the first navigation of a
 * session and 6.7 on every later one. With two reads, the caption could say 6.7 while
 * the curve was scored over 6 screens, and NOTHING in the payload would show the
 * disagreement: a 6-screen curve is internally consistent and unmarked.
 *
 * Sharing the FUNCTION would not have been enough. Two calls at two moments agree on
 * arithmetic and still read a page that moved in between, which fixes the formula and
 * keeps the race. So this is one measurement, threaded to both consumers.
 *
 * The fields are published in the response for the same reason they are shared here:
 * an invisible variance is indistinguishable from no variance, and every defect this
 * campaign closed had that shape.
 */
export interface PageGeometry {
  /** Viewport height in CSS pixels at the moment of measurement. */
  viewportHeight: number;
  /** Document height in CSS pixels, never less than the viewport. */
  documentHeight: number;
  /** documentHeight / viewportHeight, one decimal. The human-facing caption. */
  pageScreens: number;
  /** Screens the sequential path scores. Load-bearing: it sets the curve length. */
  screenCount: number;
}

/**
 * Measure the page's geometry in a single evaluate.
 *
 * One round trip on purpose: two reads of `innerHeight` and `scrollHeight` can
 * straddle a layout change, and the whole point of this function is that they cannot.
 */
export async function measurePageGeometry(page: any, maxScreens = 20): Promise<PageGeometry> {
  const { viewportHeight, documentHeight } = await page.evaluate(() => ({
    viewportHeight: window.innerHeight,
    documentHeight: Math.max(window.innerHeight, document.documentElement.scrollHeight),
  }));
  return {
    viewportHeight,
    documentHeight,
    pageScreens: Math.round((documentHeight / viewportHeight) * 10) / 10,
    screenCount: Math.max(1, Math.min(maxScreens, Math.ceil(documentHeight / viewportHeight))),
  };
}

/**
 * Measure the page one screen at a time, each on its own content.
 *
 * The unit of consumption is a screenful, not a document. Measuring per screen
 * is what makes a sequential score possible, and it also removes the
 * area-normalisation problem for the two layers that had it: the denominator
 * becomes one viewport, constant, so a tall page cannot dilute its own density.
 *
 * NEWLY-ENCOUNTERED COUNTING. Count-based demands -- interactive elements,
 * choices -- are charged only for elements not seen on an earlier screen. A
 * sticky nav is present on every screen and is one decision, made once;
 * charging it fourteen times would make persistent navigation the most
 * expensive thing on any long page. Text and visual density are NOT deduped:
 * re-encountering text is re-reading it, which is a real cost.
 *
 * Returns one metrics object per screen, in document order.
 */
export async function extractPerScreenMetrics(
  page: any,
  maxScreens = 20,
  geometry?: PageGeometry,
): Promise<Array<Awaited<ReturnType<typeof extractPageMetrics>>>> {
  // The caller's geometry when it has one, so the curve length and the caption come
  // from the SAME measurement rather than two reads of a page that can move between
  // them. Measuring here is the fallback for direct callers, not the normal path.
  const choiceCap = param("pageMetrics.choiceCap");
  const geo = geometry ?? (await measurePageGeometry(page, maxScreens));
  const vh = geo.viewportHeight;
  const docHeight = geo.documentHeight;
  const screenCount = geo.screenCount;

  // Identity is assigned once, before any scrolling, so an element keeps the
  // same tag across screens even as rects change.
  await page.evaluate(() => {
    let n = 0;
    for (const el of Array.from(document.querySelectorAll("*"))) {
      if (!(el as HTMLElement).dataset) continue;
      if (!(el as HTMLElement).dataset.cbSeqId) (el as HTMLElement).dataset.cbSeqId = String(n++);
    }
    (window as any).__cbSeqSeen = new Set<string>();
  });

  const out: Array<Awaited<ReturnType<typeof extractPageMetrics>>> = [];
  for (let i = 0; i < screenCount; i++) {
    await page.evaluate((y: number) => window.scrollTo(0, y), i * vh);
    await page.waitForTimeout(250);
    const metrics = await extractPageMetrics(page, "viewport");
    // Re-charge only what this screen introduces.
    const fresh = await page.evaluate(() => {
      const seen: Set<string> = (window as any).__cbSeqSeen;
      const vh2 = window.innerHeight;
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh2;
      };
      let newInteractive = 0, newChoices = 0;
      for (const el of Array.from(document.querySelectorAll(
        'a, button, input, select, textarea, [role="button"], [onclick], [tabindex]'))) {
        if (!visible(el)) continue;
        const id = (el as HTMLElement).dataset?.cbSeqId;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        newInteractive++;
        if (el.tagName === "A") newChoices++;
        if (el.tagName === "SELECT") newChoices += el.querySelectorAll("option").length;
      }
      return { newInteractive, newChoices };
    });
    // The law times are re-charged for the same share: what this screen
    // introduces, so a sticky nav or a header search box is not acquired, chosen
    // from or filled in again on every screen (a definition; exact per-element
    // times would need box identities across screens). Procedure takes the
    // interactive share, not a count of new entry fields: KLM charges an entry
    // step once per visit, so a header search box seen on every screen is one
    // step, not one per screen. Scaling this screen's steps by the share of its
    // controls that are new assumes a field is as likely to be new as any other
    // control. Menu labels are read once per visit too (the first read the
    // search law leaves out), so a screen charges its labels' first read by the
    // share of its choices that are new, like choosing; its other prose is read
    // per screen as before.
    const share = (newOnes: number, all: number) => (all > 0 ? Math.min(1, newOnes / all) : 0);
    const pointShare = share(fresh.newInteractive, metrics.interactiveElementCount);
    const chooseShare = share(fresh.newChoices, metrics.choiceCountRaw);
    out.push({
      ...metrics,
      interactiveElementCount: fresh.newInteractive,
      choiceCount: Math.min(fresh.newChoices, choiceCap),
      choiceCountRaw: fresh.newChoices,
      choiceCountCapped: fresh.newChoices > choiceCap,
      pointingSeconds: metrics.pointingSeconds * pointShare,
      choosingSeconds: metrics.choosingSeconds * chooseShare,
      choosingSecondsExpert: metrics.choosingSecondsExpert * chooseShare,
      procedureSeconds: metrics.procedureSeconds * pointShare,
      readingSeconds: metrics.readingSeconds - metrics.lawDiagnostics.labelSeconds * (1 - chooseShare),
      lawDiagnostics: { ...metrics.lawDiagnostics, labelSeconds: metrics.lawDiagnostics.labelSeconds * chooseShare },
    });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  return out;
}

/**
 * What extractPageMetrics returns: the PageMetrics the chain reads, plus the
 * fields reported beside them.
 */
export interface ExtractedPageMetrics {
  informationDensity: number;
  visualComplexity: number;
  interactiveElementCount: number;
  textDensity: number;
  animationLevel: number;
  choiceCount: number;
  navigationDepth: number;
  // Text readability metrics (v18.56)
  avgWordLength: number;      // 0-1: normalized average word length (longer = harder)
  avgSentenceLength: number;  // 0-1: normalized average sentence length
  lexicalDiversity: number;   // 0-1: type-token ratio (higher = more diverse vocabulary)
  longWordRatio: number;      // 0-1: fraction of words with 7+ characters
  technicalDensity: number;   // 0-1: fraction of words with 10+ characters (technical/compound terms)
  scriptFamily: 'alphabetic' | 'cjk' | 'abjad';  // Detected script family
  scope: MetricScope;
  /** Document height in viewports. 1 means the page is one screenful. */
  pageScreens: number;
  /** Uncapped choice count, so the cap below is visible rather than silent. */
  choiceCountRaw: number;
  choiceCountCapped: boolean;
  /**
   * Stage B: seconds of work for the reference user, from published laws
   * (demand-laws.ts). The chain turns each into a demand against one time
   * budget (computeDemandDistribution). See lawSecondsOf for what each covers.
   */
  pointingSeconds: number;
  choosingSeconds: number;
  readingSeconds: number;
  procedureSeconds: number;
  /**
   * Stage C: the same choices by Hick-Hyman, the expert limit of the menu
   * model (Cockburn, Gutwin & Greenberg 2007) whose novice limit is
   * choosingSeconds. cognitiveLoad's demand reads (1 - e) choosingSeconds +
   * e choosingSecondsExpert, e the run's siteFamiliarity.
   */
  choosingSecondsExpert: number;
  /** Diagnostics beside the law times; no demand reads them. */
  lawDiagnostics: LawDiagnostics;
}

/** What lawSecondsOf measured besides the law times. */
export interface LawDiagnostics {
  /** Mean Fitts index of difficulty over the stored targets, bits. */
  meanFittsID: number;
  /** Targets acquired (interactiveElements, uncapped). */
  targets: number;
  /** Entry steps the KLM time charges an M for. */
  entrySteps: number;
  /** Choice groups resolved, uncapped, plus the ungrouped links as one more when there are any. */
  choiceGroups: number;
  /** Links in no choice group, which form one more choice set. */
  ungroupedLinks: number;
  /**
   * How ungroupedLinks was counted: `groupedLinks` (format 2: links -
   * groupedLinks, each link once) or `navGroupSizes` (format 1: links minus the
   * stored nav groups' sizes, where a link in nested groups may count twice).
   */
  ungroupedLinksFrom: "groupedLinks" | "navGroupSizes";
  /**
   * Menu labels read once each: the grouped links whose drawn text holds a
   * letter or digit (groupedLinksWithText); an icon-only link has nothing to
   * read. 0 for format 1, which has no in-group prose.
   */
  labels: number;
  /** The part of readingSeconds that is the labels' first read (law.reading.labelFirstRead per label). */
  labelSeconds: number;
}

/**
 * A page as measured, before any normaliser: the counts every PageMetrics
 * field is computed from, and the geometry a demand model needs beyond them
 * (interactive targets, choice groups, text blocks). Plain numbers, strings
 * and arrays, so it serialises as JSON and round-trips exactly.
 *
 * WHY IT EXISTS. extractPageMetrics used to count and normalise in one pass
 * inside the page, so the only thing a caller could keep was the normalised
 * 0-1 metric. The CTC reference set stored exactly that, and a registered
 * normaliser (a midpoint, a weight, a cap) could not move the curve built from
 * it: every stored page had the old value baked in. Now measurePageRaw counts,
 * deriveMetrics normalises, and extractPageMetrics is the two in sequence,
 * returning what it always returned (tests/page-metrics-golden.test.ts).
 *
 * WHICH CONSTANTS ARE APPLIED WHERE. The ids in PAGE_METRICS_MEASURE_IDS
 * (provenance/page-metrics.ts) decide what is counted at all, so they are
 * applied while measuring and a stored record cannot be re-derived under
 * another value: the lazy-load walk, the colour sample, the prose length
 * filter, script detection, and this record's own storage bounds. Every other
 * pageMetrics constant is applied by deriveMetrics, the word, run and
 * sentence-length thresholds included: they read the length histograms below
 * rather than counts already cut at one threshold.
 *
 * FORMAT 2 (RAW_PAGE_FORMAT). Four things format 1 measured wrongly or not
 * at all, fixed where they are measured because a stored record cannot be
 * corrected later:
 *   - Prose counted once. Format 1 took every element matching the prose
 *     selector, so a p inside an li, an li inside a td or a p inside a
 *     blockquote was counted once per matching ancestor (a nested menu many
 *     times over). Format 2 counts the outermost matching element only, so
 *     `text`, `textBlocks` and `prose` hold each visible character once.
 *     Format 1's count survives as `proseNested`, three totals measured on
 *     the same DOM, for comparison; nothing derives from it.
 *   - A language picker is not the page's language. The key-element script
 *     rule read the first nav, and www.w3.org's first nav lists its Japanese
 *     and Chinese editions, so the page read as CJK. Text declared to be in
 *     another language (lang, or a link's hreflang) is no longer key-element
 *     text, and a nav that is a language picker is not "the nav".
 *   - Menu labels apart from the prose (proseInNav): the prose that sits in
 *     a nav or composite group, which the choosing law already reads.
 *   - A choice in one group only, with whole nav totals. Format 1 counted a
 *     nav's links, then a menubar inside it, then its submenus, so one link
 *     sat in up to three groups, and its nav sizes stopped at the stored
 *     list's 64 groups. Format 2 gives each choice to the outermost group
 *     that offers it and stores navGroupCount, navLinks and groupedLinks
 *     uncapped; format 1's group totals survive as `choiceNested`.
 * deriveMetrics reads groupedLinks (the links in no group, for the choosing
 * law) and none of the other new fields. It still accepts a format-1 record
 * (RawPageMeasurementV1), which derives as format 2 does except choosing,
 * whose ungrouped links come from the stored nav sizes, so the two can be
 * compared.
 */
export interface RawPageMeasurement {
  /** Version of this record's layout: RAW_PAGE_FORMAT. */
  format: 2;
  scope: MetricScope;
  /** window.innerWidth, CSS px. */
  viewportWidth: number;
  /** From the shared PageGeometry. */
  viewportHeight: number;
  documentHeight: number;
  pageScreens: number;
  /** window.scrollY when measured. Boxes are in document coordinates; subtract it for viewport ones. */
  scrollY: number;
  /** Summed trimmed innerText length of every text element in scope (nested elements count their text again). */
  textChars: number;
  /** Elements matching the interactive selector, in scope. */
  interactiveElements: number;
  /** a[href] in scope. */
  links: number;
  /** option elements inside the selects in scope. */
  selectOptions: number;
  /** Elements in scope with a running CSS animation. */
  runningAnimations: number;
  /** [autoplay] elements in scope. */
  autoplayElements: number;
  /** An element whose class names a carousel, slider or swiper, anywhere in the document. */
  carousel: boolean;
  /** Breadcrumb links, anywhere in the document. */
  breadcrumbLinks: number;
  /** Distinct colours among the body and the first visual.colourSample visible elements. */
  colours: number;
  /** Laid-out elements in scope. */
  visibleElements: number;
  /** img, svg and role=img elements in scope. */
  images: number;
  /** The visible prose, each character once, tokenised for its script. */
  text: RawText;
  /**
   * The visible prose's totals, uncapped: trimmed characters and
   * whitespace-separated words over the outermost prose elements (the
   * textBlocks, all of them). `textBlockCount` is their number.
   */
  prose: { chars: number; words: number };
  /**
   * The part of `prose` inside a nav or ARIA composite group in scope (the
   * groups choiceGroups counts, each choice once): menu labels, which the
   * choosing law already reads as choices. A block a group holds counts
   * whole; a block that holds groups (a layout td around a nav) counts their
   * text. chars and words as `prose` counts them; letters, abjadWords and
   * cjkChars in the reading law's units, tokenised as `text` is, so
   * prose minus proseInNav is the prose outside every group.
   */
  proseInNav: { chars: number; words: number; letters: number; abjadWords: number; cjkChars: number };
  /**
   * The same totals as format 1 counted them: every element matching the
   * prose selector, nested ones again (elements, characters, words). For
   * comparison only; nothing derives from it.
   */
  proseNested: { elements: number; chars: number; words: number };
  /** Element kinds, indexed by `boxes` and `choiceGroups`: tag, `:type` for inputs, `[role]` when set. */
  kinds: string[];
  /**
   * The interactive elements in scope, five numbers each: kind index, x, y,
   * width, height (CSS px, document coordinates, rounded). The first
   * pageMetrics.raw.maxBoxes in document order; interactiveElements is the
   * uncapped count.
   */
  boxes: number[];
  /**
   * Choice groups in scope, two numbers each: kind index and size. A nav's
   * visible links, a select's options, a named radio or checkbox group (an
   * unnamed one is a group of one), a menu, listbox, tablist or radiogroup's
   * visible items. The first pageMetrics.raw.maxChoiceGroups, navs first,
   * then selects, toggles and the ARIA composites, each in document order.
   *
   * Each choice is in one group only: the outermost nav or composite that
   * offers it (an item and the link inside it are one choice). A menubar
   * inside a nav, its submenus, or a nav inside a navigation region keep only
   * what no outer group took, and are no group when that is nothing.
   */
  choiceGroups: number[];
  /** Every group, uncapped: the length choiceGroups would have without its bound. */
  choiceGroupCount: number;
  /** Nav groups (nav, role=navigation) left with at least one link of their own, uncapped. */
  navGroupCount: number;
  /** The links those nav groups hold, each once, uncapped: the sum of every nav size, stored or not. */
  navLinks: number;
  /** Visible links inside any choice group (nav or composite), each once, uncapped; `links - groupedLinks` are in none. */
  groupedLinks: number;
  /**
   * Of groupedLinks, those whose drawn text holds at least one letter or
   * digit (any script: a Latin letter, an abjad word, a CJK character, a page
   * number), uncapped. Text a sighted user does not see is left out:
   * aria-label, title and alt, an svg title, and text hidden, transparent,
   * sub-pixel or clipped away inside the link (a visually-hidden span).
   * groupedLinks minus this is the icon-only grouped links.
   */
  groupedLinksWithText: number;
  /**
   * The group totals as format 1 counted them: every nav, select, toggle and
   * composite group with a choice, nested groups counting their choices again.
   * For comparison only; nothing derives from it.
   */
  choiceNested: { groups: number; items: number };
  /**
   * The prose elements the readability metrics read, eight numbers each:
   * characters, whitespace-separated words, CJK characters, sentences
   * (non-empty fragments between . ! ? and their CJK and Arabic forms), font
   * size px, line height px (0 when `normal`), width and height px. Sizes to
   * half a pixel, boxes rounded. The first pageMetrics.raw.maxTextBlocks.
   *
   * A block is an OUTERMOST prose element: one that matches the prose
   * selector, is laid out in scope and longer than prose.lengthAbove, and has
   * no such element above it. Its text includes everything nested inside it,
   * so its font size and box are the outer element's. At viewport scope an
   * outer element that is partly on screen brings all of its text, as every
   * element-level count here does.
   */
  textBlocks: number[];
  textBlockCount: number;
}

/** The layout measurePageRaw writes, and the only one the CTC reference loads. */
export const RAW_PAGE_FORMAT = 2;

/**
 * A format-1 record (2026-10-22): nested prose counted per element, the
 * first-nav script rule, nested choice groups counted again, no prose or nav
 * totals. deriveMetrics still derives it,
 * exactly as it did then, so format-1 data can be compared with format 2.
 */
export type RawPageMeasurementV1 = Omit<RawPageMeasurement, "format" | "prose" | "proseNested" | "proseInNav" | "navGroupCount" | "navLinks" | "groupedLinks" | "groupedLinksWithText" | "choiceNested"> & { format: 1 };

/** The visible prose of a RawPageMeasurement, as length histograms rather than threshold counts. */
export interface RawText {
  script: 'alphabetic' | 'cjk' | 'abjad';
  /**
   * [length, count] pairs, exact. alphabetic: every word, letters only.
   * abjad: the words with no abjad letter. cjk: the words starting with a
   * Latin letter, as written.
   */
  wordLengths: Array<[number, number]>;
  /** abjad only: the abjad words, [length, count] pairs, exact. */
  abjadWordLengths: Array<[number, number]>;
  /** cjk only: CJK characters in the prose. */
  cjkChars: number;
  /** cjk only: maximal runs of CJK characters, [length, count]; lengths at or above lengthBins share that bin. */
  cjkRunLengths: Array<[number, number]>;
  /** Distinct words (cjk: distinct CJK bigrams plus Latin words). */
  uniqueWords: number;
  /** The script's sentence split, [trimmed length, count]; lengths at or above lengthBins share that bin. */
  fragmentLengths: Array<[number, number]>;
  /** pageMetrics.raw.lengthBins when measured: a threshold must sit below it to be re-derived. */
  lengthBins: number;
}

/** The registered constants measurePageRaw applies (PAGE_METRICS_MEASURE_IDS), handed to the page. */
interface MeasureParams {
  walkMaxSteps: number; walkSettleMs: number;
  colourSample: number; proseLengthAbove: number;
  scriptMinChars: number; scriptTextShare: number; scriptKeyShare: number;
  lengthBins: number; maxBoxes: number; maxTextBlocks: number; maxChoiceGroups: number;
}

function readMeasureParams(): MeasureParams {
  const P = (id: string) => param(`pageMetrics.${id}`);
  return {
    walkMaxSteps: P("walk.maxSteps"), walkSettleMs: P("walk.settleMs"),
    colourSample: P("visual.colourSample"), proseLengthAbove: P("prose.lengthAbove"),
    scriptMinChars: P("script.minChars"), scriptTextShare: P("script.textShare"), scriptKeyShare: P("script.keyShare"),
    lengthBins: P("raw.lengthBins"), maxBoxes: P("raw.maxBoxes"),
    maxTextBlocks: P("raw.maxTextBlocks"), maxChoiceGroups: P("raw.maxChoiceGroups"),
  };
}

/** The registered constants deriveMetrics applies: every pageMetrics id not in PAGE_METRICS_MEASURE_IDS. */
interface DeriveParams {
  textNestedShare: number; informationMidpoint: number;
  colourWeight: number; imageWeight: number; elementWeight: number; visualMidpoint: number;
  areaUnit: number; textDensityMidpoint: number; carouselCount: number; animationSaturation: number;
  choiceCap: number;
  abjadLengthScale: number; abjadLongWordMin: number; abjadTechWordMin: number; abjadSentenceLengthAbove: number;
  latinLongWordMin: number; latinTechWordMin: number; alphabeticSentenceLengthAbove: number;
  cjkCharsPerWord: number; cjkLatinEquivalentLength: number; cjkLongRunMin: number; cjkTechRunMin: number;
  cjkLatinTechWordMin: number; cjkSentenceLengthAbove: number;
  wordLengthOffset: number; wordLengthSpan: number; sentenceSaturation: number; lexicalWindow: number;
}

function readDeriveParams(): DeriveParams {
  const P = (id: string) => param(`pageMetrics.${id}`);
  return {
    textNestedShare: P("text.nestedShare"), informationMidpoint: P("informationDensity.midpoint"),
    colourWeight: P("visual.colourWeight"), imageWeight: P("visual.imageWeight"),
    elementWeight: P("visual.elementWeight"), visualMidpoint: P("visual.midpoint"),
    areaUnit: P("textDensity.areaUnit"), textDensityMidpoint: P("textDensity.midpoint"),
    carouselCount: P("animation.carouselCount"), animationSaturation: P("animation.saturation"),
    choiceCap: P("choiceCap"),
    abjadLengthScale: P("abjad.lengthScale"), abjadLongWordMin: P("abjad.longWordMin"),
    abjadTechWordMin: P("abjad.techWordMin"), abjadSentenceLengthAbove: P("abjad.sentenceLengthAbove"),
    latinLongWordMin: P("latin.longWordMin"), latinTechWordMin: P("latin.techWordMin"),
    alphabeticSentenceLengthAbove: P("alphabetic.sentenceLengthAbove"),
    cjkCharsPerWord: P("cjk.charsPerWord"), cjkLatinEquivalentLength: P("cjk.latinEquivalentLength"),
    cjkLongRunMin: P("cjk.longRunMin"), cjkTechRunMin: P("cjk.techRunMin"),
    cjkLatinTechWordMin: P("cjk.latinTechWordMin"), cjkSentenceLengthAbove: P("cjk.sentenceLengthAbove"),
    wordLengthOffset: P("wordLength.offset"), wordLengthSpan: P("wordLength.span"),
    sentenceSaturation: P("sentenceLength.saturation"), lexicalWindow: P("lexicalDiversity.window"),
  };
}

/**
 * Measure the page: counts and geometry, no normaliser (RawPageMeasurement).
 * The scope decides which elements count; at full_page the page is walked
 * first so lazy content exists to be counted.
 */
export async function measurePageRaw(
  page: any,
  scope: MetricScope = "viewport",
  /** Geometry already measured by the caller, so both derivations share one read. */
  geometry?: PageGeometry,
): Promise<RawPageMeasurement> {
  // Every constant the measurement uses, read here in Node (the page cannot call
  // param()) and handed to the browser side with the scope and geometry.
  const P = readMeasureParams();
  // Lazy content does not exist until it has been scrolled past, so a full-page
  // measurement that never scrolls measures a page the user would never see.
  // Same five-step walk empathy_audit does for scope:"full_page", including the
  // return to the top so later screenshots and geometry are taken from origin.
  if (scope === "full_page") {
    try {
      // Step count and step size from the SHARED measurement. This computed its own
      // scrollHeight/innerHeight -- a third independent derivation of the one quantity,
      // found by the anti-test that says nothing may derive it independently. It is the
      // least consequential of the three (it only decides how far to scroll to trigger
      // lazy content) and it is exactly the kind that survives a fix aimed at the two
      // obvious ones.
      const walkGeo = geometry ?? (await measurePageGeometry(page));
      const steps = Math.min(P.walkMaxSteps, walkGeo.screenCount);
      for (let i = 1; i <= steps; i++) {
        await page.evaluate((y: number) => window.scrollTo(0, y), i * walkGeo.viewportHeight);
        await page.waitForTimeout(P.walkSettleMs);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(P.walkSettleMs);
    } catch { /* a page that will not scroll is still measurable */ }
  }
  // The caller's geometry when it has one. `pageScreens` here and `screenCount` in
  // the sequential path were two derivations of one quantity from two separate reads;
  // passing it in makes them one measurement rather than two that agree by luck.
  const geo = geometry ?? (await measurePageGeometry(page));
  return page.evaluate(([measureScope, geoIn, P]: [MetricScope, PageGeometry, MeasureParams]) => {
    const vw = window.innerWidth;
    const vh = geoIn.viewportHeight;
    const fullPage = measureScope === "full_page";

    // Viewport check — only count elements whose bounding box intersects the
    // viewport. At full_page scope every laid-out element counts, so the filter
    // becomes a zero-size check only.
    const inViewport = (el: Element): boolean => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      if (fullPage) return true;
      return rect.bottom > 0 && rect.top < vh &&
        rect.right > 0 && rect.left < vw;
    };

    const scrollX = window.scrollX || 0;
    const scrollY = window.scrollY || 0;
    const kinds: string[] = [];
    const kindIndex = new Map<string, number>();
    const kindOf = (k: string): number => {
      let i = kindIndex.get(k);
      if (i === undefined) { i = kinds.length; kinds.push(k); kindIndex.set(k, i); }
      return i;
    };
    const elementKind = (el: Element): string => {
      const tag = el.tagName.toLowerCase();
      const type = tag === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : '';
      const role = el.getAttribute('role');
      return `${tag}${type ? `:${type}` : ''}${role ? `[${role}]` : ''}`;
    };
    const half = (x: number) => (Number.isFinite(x) ? Math.round(x * 2) / 2 : 0);

    // Gather only viewport-visible text
    const textEls = Array.from(document.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, td, th, span, div, a, button, label'));
    let viewportTextLength = 0;
    textEls.forEach(el => {
      if (inViewport(el)) {
        const text = (el as HTMLElement).innerText?.trim();
        if (text) viewportTextLength += text.length;
      }
    });

    // Interactive elements — viewport only, with their boxes
    const interactive = Array.from(document.querySelectorAll('a, button, input, select, textarea, [role="button"], [onclick], [tabindex]'));
    let interactiveCount = 0;
    const boxes: number[] = [];
    interactive.forEach(el => {
      if (!inViewport(el)) return;
      if (interactiveCount < P.maxBoxes) {
        const r = el.getBoundingClientRect();
        boxes.push(kindOf(elementKind(el)), Math.round(r.left + scrollX), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height));
      }
      interactiveCount++;
    });

    // Links and choices — viewport only
    const links = Array.from(document.querySelectorAll('a[href]'));
    const selects = Array.from(document.querySelectorAll('select'));
    let linkCount = 0;
    let optionCount = 0;
    links.forEach(el => { if (inViewport(el)) linkCount++; });
    selects.forEach(s => { if (inViewport(s)) optionCount += s.querySelectorAll('option').length; });

    // Choice groups: what the choices are offered in.
    const choiceGroups: number[] = [];
    let choiceGroupCount = 0;
    // Format 1's count, for comparison: every group, nested ones again.
    let nestedGroups = 0, nestedItems = 0;
    const addGroup = (kind: string, size: number, nestedSize = size) => {
      if (nestedSize > 0) { nestedGroups++; nestedItems += nestedSize; }
      if (size <= 0) return;
      if (choiceGroupCount < P.maxChoiceGroups) choiceGroups.push(kindOf(kind), size);
      choiceGroupCount++;
    };
    // Each choice in one group only: the outermost that offers it. A nav's
    // links are its visible a[href]; a menu, menubar, listbox, tablist or
    // radiogroup's are its visible items, each read as the link inside it
    // when it has one, so an item and its link are one choice. Groups are
    // decided in document order, every ancestor before its descendants, so a
    // menubar inside a nav (or a submenu inside the menubar, or a nav inside a
    // navigation region) keeps only the choices no outer group took, and is
    // no group at all when that is none.
    const NAV = 'nav, [role="navigation"]';
    const COMPOSITE = '[role="menu"], [role="menubar"], [role="listbox"], [role="tablist"], [role="radiogroup"]';
    const ITEM = '[role^="menuitem"], [role="option"], [role="tab"], [role="radio"]';
    const claimed = new Set<Element>();
    // The groups in scope, kept for the prose pass: the prose inside them is
    // menu labels, read as choices, and is reported apart (proseInNav).
    const scopedGroups = new Set<Element>();
    const navGroups: Array<[number, number]> = [];
    const compositeGroups: Array<[string, number, number]> = [];
    document.querySelectorAll(`${NAV}, ${COMPOSITE}`).forEach(g => {
      if (!inViewport(g)) return;
      scopedGroups.add(g);
      const nav = g.matches(NAV);
      const offered = nav
        ? Array.from(g.querySelectorAll('a[href]')).filter(inViewport)
        : Array.from(g.querySelectorAll(ITEM)).filter(inViewport).map(x => (x.matches('a[href]') ? x : x.querySelector('a[href]') || x));
      let own = 0;
      for (const c of new Set(offered)) {
        if (claimed.has(c)) continue;
        claimed.add(c);
        own++;
      }
      if (nav) navGroups.push([own, offered.length]);
      else compositeGroups.push([g.getAttribute('role') || '', own, offered.length]);
    });
    // Uncapped, so links minus groupedLinks is the links in no group however
    // many groups the page has (choiceGroups stores the first maxChoiceGroups).
    const navGroupCount = navGroups.filter(([own]) => own > 0).length;
    const navLinks = navGroups.reduce((n, [own]) => n + own, 0);
    const groupedLinkList = Array.from(claimed).filter(c => c.matches('a[href]') && inViewport(c));
    const groupedLinks = groupedLinkList.length;
    // Of those, the links that show visible text: at least one letter or
    // digit (any script, so an abjad word, a CJK character or a page number)
    // in text that is drawn.
    // aria-label, title and alt are attributes and never reach this; an svg
    // <title> is not drawn, so it has no box. A link is in scope by the rule
    // every count here uses (inViewport); its text must also be visible
    // inside it: hidden, transparent or sub-pixel text does not count, nor
    // text clipped away by a box inside the link (the visually-hidden
    // pattern, a 1px clipped span, and the off-screen text indent), however
    // innerText would report it.
    const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
    const textDrawn = (node: Text, link: Element): boolean => {
      if (!LETTER_OR_DIGIT.test(node.nodeValue || '')) return false;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0);
      if (!rects.length) return false;
      let left = Math.min(...rects.map(r => r.left)), top = Math.min(...rects.map(r => r.top));
      let right = Math.max(...rects.map(r => r.right)), bottom = Math.max(...rects.map(r => r.bottom));
      for (let el = node.parentElement; el; el = el.parentElement) {
        const cs = getComputedStyle(el);
        if (cs.visibility !== 'visible' || parseFloat(cs.opacity) === 0 || parseFloat(cs.fontSize) < 1) return false;
        if (/inset\(\s*50%/.test(cs.clipPath) || /^rect\(0px,? 0px,? 0px,? 0px\)$/.test(cs.clip)) return false;
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || cs.clip !== 'auto' || cs.clipPath !== 'none') {
          const r = el.getBoundingClientRect();
          left = Math.max(left, r.left); top = Math.max(top, r.top);
          right = Math.min(right, r.right); bottom = Math.min(bottom, r.bottom);
          if (right - left < 2 || bottom - top < 2) return false;
        }
        if (el === link) break;
      }
      return true;
    };
    const readable = (link: Element): boolean => {
      const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) if (textDrawn(n as Text, link)) return true;
      return false;
    };
    const groupedLinksWithText = groupedLinkList.filter(readable).length;
    navGroups.forEach(([own, offered]) => addGroup('nav', own, offered));
    selects.forEach(s => { if (inViewport(s)) addGroup('select', s.querySelectorAll('option').length); });
    const toggles = new Map<string, { kind: string; size: number }>();
    let unnamed = 0;
    document.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(el => {
      if (!inViewport(el)) return;
      const kind = (el.getAttribute('type') || '').toLowerCase();
      const name = el.getAttribute('name');
      const key = name ? `${kind}\u0000${name}` : `${kind}\u0001${unnamed++}`;
      const g = toggles.get(key);
      if (g) g.size++;
      else toggles.set(key, { kind, size: 1 });
    });
    toggles.forEach(g => addGroup(g.kind, g.size));
    compositeGroups.forEach(([kind, own, offered]) => addGroup(kind, own, offered));

    // Animations — count only ACTUAL running animations, not CSS transition utilities
    // WCAG 2.3.3 cares about content that moves/blinks automatically, not hover transitions
    let runningAnimations = 0;
    document.querySelectorAll('*').forEach(el => {
      if (!inViewport(el)) return;
      const style = getComputedStyle(el);
      // Only count elements with actual running CSS animations (not transitions)
      if (style.animationName && style.animationName !== 'none' &&
          style.animationPlayState === 'running' &&
          style.animationDuration !== '0s' && style.animationDuration !== '0.01ms') {
        runningAnimations++;
      }
    });
    // Also count auto-playing media
    let autoplayElements = 0;
    document.querySelectorAll('video[autoplay], [autoplay]').forEach(el => {
      if (inViewport(el)) autoplayElements++;
    });
    const hasCarousel = !!document.querySelector('[class*="carousel"], [class*="slider"], [class*="swiper"]');

    // Navigation depth (breadcrumbs — these are structural, keep full-page)
    const breadcrumbs = document.querySelectorAll('[class*="breadcrumb"] a, nav[aria-label*="breadcrumb"] a');

    // Visual complexity — sample viewport-visible elements only
    const all = document.querySelectorAll('*');
    const uniqueColors = new Set<string>();
    const computed = getComputedStyle(document.body);
    uniqueColors.add(computed.backgroundColor);
    uniqueColors.add(computed.color);
    let visibleCount = 0;
    let imageCount = 0;
    for (let i = 0; i < all.length; i++) {
      if (!inViewport(all[i])) continue;
      visibleCount++;
      if (visibleCount <= P.colourSample) {
        const cs = getComputedStyle(all[i]);
        uniqueColors.add(cs.backgroundColor);
        uniqueColors.add(cs.color);
      }
      const tag = all[i].tagName;
      if (tag === 'IMG' || tag === 'SVG' || all[i].getAttribute('role') === 'img') imageCount++;
    }

    // ── Text Readability Analysis (v18.56) ──
    // Extract actual visible text for linguistic analysis
    const cjkRegex = /[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/;
    const cjkCharRegex = /[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/g;
    const visibleTextParts: string[] = [];
    const textBlocks: number[] = [];
    const proseSelectors = 'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, figcaption';
    // Each visible character once: an element counts only when no element
    // above it already counted, so a p inside an li (or an li inside a td) is
    // read as part of its outermost container, never again on its own.
    // querySelectorAll is in document order, so every ancestor is decided
    // before its descendants. An ancestor that did not count (not laid out, or
    // too short) leaves its descendants free to.
    const counted = new Set<Element>();
    const insideCounted = (el: Element): boolean => {
      for (let a = el.parentElement?.closest(proseSelectors); a; a = a.parentElement?.closest(proseSelectors)) {
        if (counted.has(a)) return true;
      }
      return false;
    };
    const wordsIn = (t: string) => t.split(/\s+/).filter(w => w.length > 0).length;
    // The part of each counted block that sits in a nav or composite group in
    // scope (the groups choiceGroups counts): the whole block when a group
    // holds it (a menu's li), or the text of the outermost groups it holds (a
    // layout td around a nav). Kept as text, so it is tokenised below as the
    // prose is.
    const GROUP = `${NAV}, ${COMPOSITE}`;
    const inScopedGroup = (el: Element): boolean => {
      for (let a: Element | null | undefined = el.closest(GROUP); a; a = a.parentElement?.closest(GROUP)) {
        if (scopedGroups.has(a)) return true;
      }
      return false;
    };
    const navParts: string[] = [];
    let proseChars = 0, proseWords = 0;
    let nestedElements = 0, nestedChars = 0, nestedWords = 0;
    document.querySelectorAll(proseSelectors).forEach(el => {
      if (!inViewport(el)) return;
      const t = (el as HTMLElement).innerText?.trim();
      if (!t || t.length <= P.proseLengthAbove) return;
      const words = wordsIn(t);
      // Format 1's count, for comparison: every matching element.
      nestedElements++;
      nestedChars += t.length;
      nestedWords += words;
      if (insideCounted(el)) return;
      counted.add(el);
      proseChars += t.length;
      proseWords += words;
      if (inScopedGroup(el)) {
        navParts.push(t);
      } else {
        const held: Element[] = [];
        el.querySelectorAll(GROUP).forEach(g => {
          if (scopedGroups.has(g) && !held.some(o => o.contains(g))) held.push(g);
        });
        for (const g of held) {
          const gt = (g as HTMLElement).innerText?.trim();
          if (gt) navParts.push(gt);
        }
      }
      if (visibleTextParts.length < P.maxTextBlocks) {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        textBlocks.push(
          t.length,
          words,
          (t.match(cjkCharRegex) || []).length,
          t.split(/[.。؟！!?؛]+|\n{2,}/).filter(s => s.trim().length > 0).length,
          half(parseFloat(cs.fontSize)),
          half(parseFloat(cs.lineHeight)),
          Math.round(r.width),
          Math.round(r.height),
        );
      }
      visibleTextParts.push(t);
    });
    const visibleText = visibleTextParts.join(' ');

    // ── Script detection ──
    // Three script families with distinct tokenization requirements:
    // 1. CJK logographic (Chinese, Japanese, Korean) — no word boundaries, character = morpheme
    // 2. Abjad (Arabic, Hebrew, Persian, Urdu) — short stems, root-based morphology, RTL
    // 3. Alphabetic (Latin, Cyrillic, Greek, Devanagari) — space-delimited, variable word length

    // Arabic/Hebrew/Persian/Urdu characters
    const abjadRegex = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff\u0590-\u05ff]/;
    const abjadCharRegex = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff\u0590-\u05ff]/g;
    // What a word keeps before its letters are counted, per script; shared by the
    // prose and its in-group part (proseInNav) so both count letters alike.
    const ABJAD_CLEAN = /[^\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff\u0590-\u05ffa-zA-Z\u00c0-\u00ff]/g;
    const LATIN_CLEAN = /[^a-zA-ZÀ-ÿÀ-ɏḀ-ỿ]/g;
    const cjkCharCount = (visibleText.match(cjkCharRegex) || []).length;
    const totalCharCount = visibleText.replace(/\s/g, '').length;

    // Also check key page elements independently (Tolgee translations fire
    // faster than GT): the first h1 and the first nav. Neither may count text
    // the page declares to be in ANOTHER language, and a language picker is
    // not the nav: www.w3.org's first nav lists 日本語 and 简体中文 editions,
    // and the rule read the whole page as CJK.
    //
    // A text's language is the nearest lang attribute above it, or, failing
    // that, the hreflang of a link it sits in, or the page's own (html, then
    // body). It is another language when its primary subtag differs.
    const primary = (tag: string | null) => (tag || '').trim().toLowerCase().split(/[-_]/)[0];
    const pageLang = primary(document.documentElement.getAttribute('lang') || document.body?.getAttribute('lang'));
    const otherLanguage = (el: Element | null): boolean => {
      for (let a = el; a; a = a.parentElement) {
        if (a.hasAttribute('lang')) return primary(a.getAttribute('lang')) !== pageLang;
        if (a.tagName === 'A' && a.hasAttribute('hreflang')) return primary(a.getAttribute('hreflang')) !== pageLang;
      }
      return false;
    };
    // The text of an element as textContent reads it (hidden text included,
    // as before), less scripts, styles and other-language text.
    const keyText = (root: Element | null | undefined): string => {
      if (!root) return '';
      let out = '';
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const parent = n.parentElement;
        if (!parent || parent.closest('script, style, noscript, template') || otherLanguage(parent)) continue;
        out += n.nodeValue || '';
      }
      return out;
    };
    // A language picker: named so (aria-label, its labelling element, id,
    // class, title), or most of its links lead to another-language edition.
    const PICKER_NAME = /(^|[^a-z])(lang|langs|language|languages|locale|locales|i18n)([^a-z]|$)/i;
    const isLanguagePicker = (nav: Element): boolean => {
      const labelledBy = (nav.getAttribute('aria-labelledby') || '').split(/\s+/)
        .map(id => (id ? document.getElementById(id)?.textContent || '' : '')).join(' ');
      const name = [nav.getAttribute('aria-label'), labelledBy, nav.id, nav.getAttribute('class'), nav.getAttribute('title')].join(' ');
      if (PICKER_NAME.test(name)) return true;
      const links = Array.from(nav.querySelectorAll('a[href]'));
      const elsewhere = links.filter(a => otherLanguage(a) || (a.hasAttribute('hreflang') && primary(a.getAttribute('hreflang')) !== pageLang));
      return links.length > 0 && elsewhere.length * 2 >= links.length;
    };
    const h1Text = keyText(document.querySelector('h1'));
    const navText = keyText(Array.from(document.querySelectorAll('nav')).find(nav => !isLanguagePicker(nav)));
    const keyElementsCJK = (h1Text.match(cjkCharRegex) || []).length + (navText.match(cjkCharRegex) || []).length;
    const keyElementsTotal = (h1Text + navText).replace(/\s/g, '').length;

    // Abjad detection (Arabic, Hebrew, etc.)
    const abjadCharCount = (visibleText.match(abjadCharRegex) || []).length;
    const keyElementsAbjad = ((h1Text.match(abjadCharRegex) || []).length) + ((navText.match(abjadCharRegex) || []).length);

    // Consider CJK if:
    // - >30% of visible text is CJK, OR
    // - >20% of key elements (h1 + nav) are CJK (catches partial translation)
    // - AND at least 5 CJK characters present (avoid false positives on single emoji)
    const isCJKDominant = cjkCharCount >= P.scriptMinChars && (
      (totalCharCount > 0 && cjkCharCount / totalCharCount > P.scriptTextShare) ||
      (keyElementsTotal > 0 && keyElementsCJK / keyElementsTotal > P.scriptKeyShare)
    );

    // Consider Abjad if:
    // - >30% of visible text is abjad, OR
    // - >20% of key elements are abjad
    // - AND at least 5 abjad characters present
    const isAbjadDominant = !isCJKDominant && abjadCharCount >= P.scriptMinChars && (
      (totalCharCount > 0 && abjadCharCount / totalCharCount > P.scriptTextShare) ||
      (keyElementsTotal > 0 && keyElementsAbjad / keyElementsTotal > P.scriptKeyShare)
    );

    // Lengths are kept as histograms so every length threshold is applied in
    // deriveMetrics. Word lengths exactly; run and fragment lengths, which only
    // ever meet a threshold, share one bin from lengthBins up.
    const tally = (m: Map<number, number>, len: number) => m.set(len, (m.get(len) || 0) + 1);
    const binned = (len: number) => Math.min(len, P.lengthBins);
    const pairs = (m: Map<number, number>): Array<[number, number]> =>
      Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
    const wordLengths = new Map<number, number>();
    const abjadWordLengths = new Map<number, number>();
    const cjkRunLengths = new Map<number, number>();
    const fragmentLengths = new Map<number, number>();
    const uniqueWords = new Set<string>();
    let sentenceSplit: RegExp;

    if (isAbjadDominant) {
      // ── Abjad text analysis (Arabic, Hebrew, Persian, Urdu) ──
      // Arabic/Hebrew use spaces between words but have:
      // - Short stems (3-4 char roots) — word length metrics need recalibration
      // - Root-based morphology — complex words look short
      // - Technical terms are multi-word phrases, not compound words
      // - Diacritics (tashkeel) and ligatures affect visual complexity
      for (const word of visibleText.split(/\s+/).filter(w => w.length > 0)) {
        // Count only abjad + Latin characters (strip punctuation, numbers)
        const clean = word.replace(ABJAD_CLEAN, '');
        // An abjad word's length is mapped to a Latin equivalent in deriveMetrics
        // (short root-based stems carry more per character); the rest count as Latin.
        tally(abjadRegex.test(clean) ? abjadWordLengths : wordLengths, clean.length);
        uniqueWords.add(clean);
      }
      // Sentence analysis: Arabic uses ، (comma) and . (period) and ؟ and ؛
      sentenceSplit = /[.。؟！!?؛]+|\n{2,}/;

    } else if (isCJKDominant) {
      // ── CJK text analysis ──
      // CJK languages don't use spaces between words. Each character is roughly
      // one morpheme; deriveMetrics estimates the word count from the character
      // count. Latin words in CJK text (English loanwords, technical terms) are
      // counted as written.
      for (const w of visibleText.split(/\s+/).filter(w => /^[a-zA-Z]/.test(w))) {
        tally(wordLengths, w.length);
        uniqueWords.add(w.toLowerCase());
      }
      // "Long words" and "technical terms" in CJK are compounds: maximal runs of
      // CJK characters, kept by length.
      for (const run of visibleText.match(/[\u3000-\u9fff\uac00-\ud7af]+/g) || []) tally(cjkRunLengths, binned(run.length));
      // Lexical diversity: use unique CJK bigrams as proxy for vocabulary
      for (let i = 0; i < visibleText.length - 1; i++) {
        if (cjkRegex.test(visibleText[i]) && cjkRegex.test(visibleText[i + 1])) {
          uniqueWords.add(visibleText[i] + visibleText[i + 1]);
        }
      }
      // Sentence analysis: CJK uses 。！？ as sentence enders
      sentenceSplit = /[。！？.!?]+|\n{2,}/;

    } else {
      // ── Alphabetic text analysis ──
      for (const word of visibleText.split(/\s+/).filter(w => w.length > 0)) {
        const clean = word.replace(LATIN_CLEAN, '');
        tally(wordLengths, clean.length);
        uniqueWords.add(clean.toLowerCase());
      }
      sentenceSplit = /[.!?]+|\n{2,}/;
    }
    for (const s of visibleText.split(sentenceSplit)) tally(fragmentLengths, binned(s.trim().length));

    // The in-group part in the reading law's units, as the branches above count
    // the prose: letters of the words they keep as Latin, abjad words, CJK
    // characters (CJK only when the page reads as CJK).
    const inGroupText = navParts.join(' ');
    let navLetters = 0, navAbjadWords = 0, navCjkChars = 0;
    const navWordList = inGroupText.split(/\s+/).filter(w => w.length > 0);
    if (isAbjadDominant) {
      for (const word of navWordList) {
        const clean = word.replace(ABJAD_CLEAN, '');
        if (abjadRegex.test(clean)) navAbjadWords++;
        else navLetters += clean.length;
      }
    } else if (isCJKDominant) {
      for (const w of navWordList) if (/^[a-zA-Z]/.test(w)) navLetters += w.length;
      navCjkChars = (inGroupText.match(cjkCharRegex) || []).length;
    } else {
      for (const word of navWordList) navLetters += word.replace(LATIN_CLEAN, '').length;
    }
    const proseInNav = {
      chars: navParts.reduce((n, part) => n + part.length, 0),
      words: navWordList.length,
      letters: navLetters,
      abjadWords: navAbjadWords,
      cjkChars: navCjkChars,
    };

    return {
      format: 2 as const,
      scope: measureScope,
      viewportWidth: vw,
      viewportHeight: vh,
      documentHeight: geoIn.documentHeight,
      // From the shared measurement, so it can never disagree with the screenCount
      // the sequential curve was scored over.
      pageScreens: geoIn.pageScreens,
      scrollY,
      textChars: viewportTextLength,
      interactiveElements: interactiveCount,
      links: linkCount,
      selectOptions: optionCount,
      runningAnimations,
      autoplayElements,
      carousel: hasCarousel,
      breadcrumbLinks: breadcrumbs.length,
      colours: uniqueColors.size,
      visibleElements: visibleCount,
      images: imageCount,
      text: {
        script: isCJKDominant ? 'cjk' as const : isAbjadDominant ? 'abjad' as const : 'alphabetic' as const,
        wordLengths: pairs(wordLengths),
        abjadWordLengths: pairs(abjadWordLengths),
        cjkChars: isCJKDominant ? cjkCharCount : 0,
        cjkRunLengths: pairs(cjkRunLengths),
        uniqueWords: uniqueWords.size,
        fragmentLengths: pairs(fragmentLengths),
        lengthBins: P.lengthBins,
      },
      prose: { chars: proseChars, words: proseWords },
      proseInNav,
      proseNested: { elements: nestedElements, chars: nestedChars, words: nestedWords },
      kinds,
      boxes,
      choiceGroups,
      choiceGroupCount,
      navGroupCount,
      navLinks,
      groupedLinks,
      groupedLinksWithText,
      choiceNested: { groups: nestedGroups, items: nestedItems },
      textBlocks,
      textBlockCount: visibleTextParts.length,
    };
  }, [scope, geo, P]);
}

/**
 * Turn a RawPageMeasurement into PageMetrics with the registered normalisers:
 * exactly what extractPageMetrics returned when it did both in the page. Pure
 * and synchronous, so a stored measurement can be re-derived under other
 * constants (the CTC reference set is). A length threshold at or above the
 * record's lengthBins cannot be re-derived from it and throws.
 *
 * Both layouts derive: format 2, and format 1 (RawPageMeasurementV1), whose
 * fields this reads are the same but for groupedLinks and which derives as it
 * did, its nested-prose counts included; its ungrouped links come from the
 * stored nav sizes. A format-2 record without groupedLinks (measured before
 * the nav totals) and any other format are refused rather than guessed at.
 */
/** Numbers per entry in RawPageMeasurement.boxes and .choiceGroups (the record's layout, not model constants). */
const RAW_BOX_FIELDS = 5;
const RAW_GROUP_FIELDS = 2;

/**
 * Input types whose field takes typed or picked entry: one KLM mental
 * preparation each, with textarea and select (a definition; KLM places M by
 * rules on a task method, which a page does not give).
 */
const ENTRY_INPUT_TYPES = new Set(["text", "email", "password", "search", "tel", "url", "number", "date", "datetime-local", "month", "week", "time", "color", "file", "range"]);

function isEntryKind(kind: string | undefined): boolean {
  const m = /^([a-z0-9-]+)(?::([a-z0-9-]+))?/.exec(kind ?? "");
  if (!m) return false;
  if (m[1] === "textarea" || m[1] === "select") return true;
  return m[1] === "input" && ENTRY_INPUT_TYPES.has(m[2] ?? "text");
}

/**
 * Stage B's four law times for a raw page measurement, in seconds for the
 * reference user, with what they rest on. Everything in scope, once
 * (research/stage-b-design.md, decision 1):
 *
 *   pointing   every interactive box acquired once: Fitts, SMALLER-OF width,
 *              from the centre of the screen it is seen on; the stored boxes'
 *              sum scaled to interactiveElements when the box list is capped.
 *   choosing   every choice group resolved once by novice linear search
 *              (Cockburn et al. 2007); a checkbox group is one yes/no per box;
 *              links in no group form one more set. Groups beyond the stored
 *              ones are scaled to choiceGroupCount. choosingSecondsExpert is
 *              the same groups by Hick-Hyman, the menu model's expert limit
 *              (Stage C: cognitiveLoad's demand interpolates the two by the
 *              run's siteFamiliarity, Cockburn et al.'s Eq. 4).
 *   reading    the prose outside every group read once at Brysbaert's rate
 *              (letters of the alphabetic words, abjad words, CJK
 *              characters; format 2 counts each character once), plus a
 *              first read per menu label: law.reading.labelFirstRead per
 *              grouped link with visible text (an icon-only link has nothing
 *              to read), which the novice search above leaves out
 *              (Cockburn et al. fitted it without that one-off cost). Format
 *              1 has no in-group prose, so it reads all of its prose and
 *              charges no label.
 *   procedure  KLM's M per entry step: an entry field (ENTRY_INPUT_TYPES,
 *              textarea, select) or a radio or checkbox group.
 */
export function lawSecondsOf(raw: RawPageMeasurement | RawPageMeasurementV1): Pick<ExtractedPageMetrics, "pointingSeconds" | "choosingSeconds" | "choosingSecondsExpert" | "readingSeconds" | "procedureSeconds" | "lawDiagnostics"> {
  const view = { viewportWidth: raw.viewportWidth, viewportHeight: raw.viewportHeight, scrollY: raw.scrollY };
  const targets: PointingTarget[] = [];
  let idSum = 0;
  let entryBoxes = 0;
  for (let i = 0; i + RAW_BOX_FIELDS <= raw.boxes.length; i += RAW_BOX_FIELDS) {
    const [kind, x, y, width, height] = raw.boxes.slice(i, i + RAW_BOX_FIELDS);
    const distance = distanceToScreenCentre({ x, y, width, height }, view, raw.scope);
    targets.push({ distance, width, height });
    idSum += fittsIndexOfDifficulty(distance, smallerOfWidth(width, height));
    if (isEntryKind(raw.kinds[kind])) entryBoxes++;
  }
  const storedTargets = targets.length;
  const totalTargets = Math.max(raw.interactiveElements, storedTargets);

  const groups: ChoiceGroup[] = [];
  let storedNavLinks = 0;
  let toggleGroups = 0;
  for (let i = 0; i + RAW_GROUP_FIELDS <= raw.choiceGroups.length; i += RAW_GROUP_FIELDS) {
    const kind = raw.kinds[raw.choiceGroups[i]];
    const size = raw.choiceGroups[i + 1];
    groups.push({ size, each: kind === "checkbox" });
    if (kind === "nav") storedNavLinks += size;
    if (kind === "radio" || kind === "checkbox") toggleGroups++;
  }
  const totalGroups = Math.max(raw.choiceGroupCount, groups.length);
  // Format 2 counts every grouped link once. Format 1 has no such count, so its
  // grouped links are the stored nav groups' sizes. A format-2 record without
  // the count, or without the in-group prose, predates them and is refused
  // rather than read as format 1.
  if (raw.format !== 1) {
    const missing = [
      typeof raw.groupedLinks !== "number" && "groupedLinks",
      !raw.proseInNav && "proseInNav",
      typeof raw.groupedLinksWithText !== "number" && "groupedLinksWithText",
    ].filter(Boolean);
    if (missing.length) throw new Error(`lawSecondsOf: raw format 2 record without ${missing.join(", ")} (measured before the nav totals and the in-group prose existed); re-measure the page`);
  }
  const ungroupedLinksFrom = raw.format === 1 ? "navGroupSizes" as const : "groupedLinks" as const;
  const ungroupedLinks = Math.max(0, raw.links - (raw.format === 1 ? storedNavLinks : raw.groupedLinks));
  const choose = (law: "novice" | "expert") => choosingSeconds(groups, law, totalGroups)
    + (law === "novice" ? noviceSearchSeconds(ungroupedLinks) : hickHymanSeconds(ungroupedLinks));

  let letters = 0;
  for (const [len, c] of raw.text.wordLengths) letters += len * c;
  let abjadWords = 0;
  for (const [, c] of raw.text.abjadWordLengths) abjadWords += c;
  // Menu labels (ISC-76): the prose inside a nav or composite group is read as
  // labels, one first read per grouped link, not at the prose rate.
  const inGroup = raw.format === 1 ? { letters: 0, abjadWords: 0, cjkChars: 0 } : raw.proseInNav;
  const labels = raw.format === 1 ? 0 : raw.groupedLinksWithText;
  const labelSeconds = labelReadingSeconds(labels);

  // Entry boxes scale with the box cap like targets; toggle groups with the group cap.
  const entrySteps = (storedTargets > 0 ? entryBoxes * (totalTargets / storedTargets) : 0)
    + (groups.length > 0 ? toggleGroups * (totalGroups / groups.length) : 0);

  return {
    pointingSeconds: pointingSeconds(targets, totalTargets),
    choosingSeconds: choose("novice"),
    choosingSecondsExpert: choose("expert"),
    readingSeconds: readingSeconds({
      letters: Math.max(0, letters - inGroup.letters),
      abjadWords: Math.max(0, abjadWords - inGroup.abjadWords),
      cjkChars: Math.max(0, raw.text.cjkChars - inGroup.cjkChars),
    }) + labelSeconds,
    procedureSeconds: klmSeconds(entrySteps),
    lawDiagnostics: {
      meanFittsID: storedTargets > 0 ? idSum / storedTargets : 0,
      targets: totalTargets,
      entrySteps,
      choiceGroups: totalGroups + (ungroupedLinks > 0 ? 1 : 0),
      ungroupedLinks,
      ungroupedLinksFrom,
      labels,
      labelSeconds,
    },
  };
}

export function deriveMetrics(raw: RawPageMeasurement | RawPageMeasurementV1): ExtractedPageMetrics {
  if (raw.format !== RAW_PAGE_FORMAT && raw.format !== 1) {
    throw new Error(`deriveMetrics: raw page format ${String((raw as { format?: unknown }).format)} is not one this build reads (1 or ${RAW_PAGE_FORMAT})`);
  }
  const P = readDeriveParams();
  const fullPage = raw.scope === "full_page";
  const vw = raw.viewportWidth;
  const vh = raw.viewportHeight;
  const docHeight = raw.documentHeight;

  // Deduplicate: rough estimate — child text counted in parent. Use 40% factor.
  const textLength = Math.round(raw.textChars * P.textNestedShare);
  // Area to normalise density against. Counting whole-page text and dividing
  // by one screen would report a density the page does not have.
  const viewportArea = vw * (fullPage ? docHeight : vh);
  const choiceCount = raw.links + raw.selectOptions;
  const animCount = raw.runningAnimations + raw.autoplayElements;
  const navDepth = Math.max(1, raw.breadcrumbLinks);

  // Normalize to 0-1 using logarithmic scaling
  const logScale = (value: number, midpoint: number) => {
    if (value <= 0) return 0;
    return value / (value + midpoint);
  };

  const informationDensity = logScale(textLength, P.informationMidpoint); // Viewport text: 0.5 at 5K chars
  const visualComplexity = logScale(
    raw.colours * P.colourWeight + raw.images * P.imageWeight + raw.visibleElements * P.elementWeight,
    P.visualMidpoint
  );
  const textDensity = logScale(textLength / Math.max(1, viewportArea * P.areaUnit), P.textDensityMidpoint);
  const animationLevel = Math.min(1, (animCount + (raw.carousel ? P.carouselCount : 0)) / P.animationSaturation);

  // ── Readability, from the length histograms ──
  const t = raw.text;
  const resolved = (threshold: number, id: string) => {
    if (threshold >= t.lengthBins) {
      throw new Error(`pageMetrics.${id} = ${threshold} cannot be re-derived from a measurement whose lengths share one bin from ${t.lengthBins}`);
    }
    return threshold;
  };
  const countAtLeast = (hist: Array<[number, number]>, min: number) => {
    let n = 0;
    for (const [len, c] of hist) if (len >= min) n += c;
    return n;
  };
  const countAbove = (hist: Array<[number, number]>, above: number) => {
    let n = 0;
    for (const [len, c] of hist) if (len > above) n += c;
    return n;
  };
  let wordCount = 0;
  let totalWordLength = 0;
  let longWords = 0;
  let techWords = 0;
  let sentenceLengthAbove: number;

  if (t.script === 'abjad') {
    // Arabic stems are 3-4 chars. Normalize: Arabic 3-char word → equivalent
    // of 5 Latin chars for readability (higher information per character than Latin)
    for (const [len, c] of t.abjadWordLengths) {
      wordCount += c;
      totalWordLength += Math.round(len * P.abjadLengthScale) * c;
      // "Long" in abjad: 5+ characters (stems with prefixes/suffixes), read as 8+ Latin
      if (len >= P.abjadLongWordMin) longWords += c;
      // "Technical" in abjad: 6+ character words, e.g. المعرفية (7 chars) or الشخصيات (8 chars)
      if (len >= P.abjadTechWordMin) techWords += c;
    }
    for (const [len, c] of t.wordLengths) {
      wordCount += c;
      totalWordLength += len * c;
      if (len >= P.latinLongWordMin) longWords += c;
      if (len >= P.latinTechWordMin) techWords += c;
    }
    sentenceLengthAbove = resolved(P.abjadSentenceLengthAbove, "abjad.sentenceLengthAbove");
  } else if (t.script === 'cjk') {
    // Estimate word count: CJK averages ~1.5-2 characters per "word"
    // (Chinese ~1.5, Japanese ~2 with particles, Korean ~2 with jamo)
    const cjkWordEstimate = Math.round(t.cjkChars / P.cjkCharsPerWord);
    let latinWords = 0;
    let latinLength = 0;
    for (const [len, c] of t.wordLengths) {
      latinWords += c;
      latinLength += len * c;
      if (len >= P.cjkLatinTechWordMin) techWords += c;
    }
    wordCount = cjkWordEstimate + latinWords;
    // A 2-character CJK word ≈ 5-7 character English word in information density.
    // Normalize: each estimated CJK word → the equivalent of ~6 Latin chars for readability
    totalWordLength = cjkWordEstimate * P.cjkLatinEquivalentLength + latinLength;
    // "Long words" in CJK: compound runs of 3+ characters (equivalent to 7+ Latin);
    // "technical terms": runs of 4+, among those.
    const longRunMin = resolved(P.cjkLongRunMin, "cjk.longRunMin");
    longWords = countAtLeast(t.cjkRunLengths, longRunMin);
    techWords += countAtLeast(t.cjkRunLengths, Math.max(longRunMin, resolved(P.cjkTechRunMin, "cjk.techRunMin")));
    sentenceLengthAbove = resolved(P.cjkSentenceLengthAbove, "cjk.sentenceLengthAbove");
  } else {
    for (const [len, c] of t.wordLengths) {
      wordCount += c;
      totalWordLength += len * c;
      if (len >= P.latinLongWordMin) longWords += c;
      if (len >= P.latinTechWordMin) techWords += c;
    }
    sentenceLengthAbove = resolved(P.alphabeticSentenceLengthAbove, "alphabetic.sentenceLengthAbove");
  }
  // A fragment is a sentence when its trimmed length exceeds the threshold.
  const sentenceCount = Math.max(1, countAbove(t.fragmentLengths, sentenceLengthAbove));
  const avgWordsPerSentence = wordCount / sentenceCount;

  // ── Normalize to 0-1 (script-aware) ──

  // Average word length: (length - 3) / 7.5, so Latin 4→0.13, 6→0.4, 10.5+→1.
  // (This comment read 4→0.2, 6→0.5, 9→0.8, which the formula never produced.)
  // CJK equivalent: normalized through the 6-char equivalence above
  const rawAvgWordLen = wordCount > 0 ? totalWordLength / wordCount : 0;
  const avgWordLength = Math.min(1, Math.max(0, (rawAvgWordLen - P.wordLengthOffset) / P.wordLengthSpan));

  // Average sentence length: words / 40, so 10 words → 0.25, 20 → 0.5, 40+ → 1
  // (it read 10 → 0.3, 20 → 0.6, 35+ → 0.9).
  const avgSentenceLength = Math.min(1, avgWordsPerSentence / P.sentenceSaturation);

  // Lexical diversity: unique items / total (capped at 100)
  const lexicalDiversity = wordCount > 0 ? Math.min(1, t.uniqueWords / Math.min(wordCount, P.lexicalWindow)) : 0;

  // Long word ratio
  const longWordRatio = wordCount > 0 ? longWords / wordCount : 0;

  // Technical density
  const technicalDensity = wordCount > 0 ? techWords / wordCount : 0;

  return {
    informationDensity,
    visualComplexity,
    interactiveElementCount: raw.interactiveElements,
    textDensity,
    animationLevel,
    // Capped for the demand math, which saturates well before 100 anyway
    // (choices/(choices+10) is 0.91 at 100 and 0.96 at 235). The raw count is
    // emitted beside it because a silently truncated number is
    // indistinguishable from a real one -- at viewport scope the cap was
    // unreachable, and at full_page the CU Denver homepage hits it.
    choiceCount: Math.min(choiceCount, P.choiceCap),
    choiceCountRaw: choiceCount,
    choiceCountCapped: choiceCount > P.choiceCap,
    navigationDepth: navDepth,
    avgWordLength,
    avgSentenceLength,
    lexicalDiversity,
    longWordRatio,
    technicalDensity,
    scriptFamily: t.script,
    // Emitted so a caller can never again be unable to tell which of these
    // two very different measurements it is holding.
    scope: raw.scope,
    // From the shared measurement, so it can never disagree with the screenCount
    // the sequential curve was scored over.
    pageScreens: raw.pageScreens,
    ...lawSecondsOf(raw),
  };
}

/**
 * Page metrics of a live page: measurePageRaw, then deriveMetrics. Callers
 * that keep the measurement (the CTC reference crawl) call the two halves.
 */
export async function extractPageMetrics(
  page: any,
  scope: MetricScope = "viewport",
  /** Geometry already measured by the caller, so both derivations share one read. */
  geometry?: PageGeometry,
): Promise<ExtractedPageMetrics> {
  return deriveMetrics(await measurePageRaw(page, scope, geometry));
}

/**
 * Compute the full pairwise distance matrix between personas.
 * Returns a symmetric matrix where entry [i][j] = cognitiveDistance(persona_i,
 * persona_j).w1, the generalized W₁ (shape and level; see cognitiveDistance).
 */
export function cognitiveDistanceMatrix(
  profiles: OTCognitiveProfile[],
): { matrix: number[][]; names: string[] } {
  const n = profiles.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = cognitiveDistance(profiles[i], profiles[j]).w1;
      matrix[i][j] = dist;
      matrix[j][i] = dist;
    }
  }

  return { matrix, names: profiles.map(p => p.name) };
}
