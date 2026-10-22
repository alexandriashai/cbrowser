/**
 * Cognitive Optimal Transport
 *
 * Treats persona cognitive profiles as probability measures in Wasserstein space.
 * Provides mathematically grounded operations:
 *
 * - Cognitive distance: W₁(personaA, personaB) — true distance between minds
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
  /** Wasserstein-1 distance between trait distributions */
  w1: number;
  /** Wasserstein-2 distance (Bures-Wasserstein for Gaussians) */
  w2: number;
  /** Per-trait contribution to total distance */
  traitContributions: Record<string, number>;
  /** Sliced Wasserstein approximation */
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

/** The ground-cost matrix the distance uses, exposed for tests (a copy). */
export function traitGroundCostMatrix(): number[][] {
  return groundCostMatrix().map(row => row.slice());
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
 * Fixed seed for the sliced-Wasserstein projection set. Any constant works; what
 * matters is that it never changes, so the same pair of profiles always yields
 * the same sliced distance across processes and releases.
 */
const SLICED_PROJECTION_SEED = 0x5f3759df;

/** mulberry32 — small, fast, well-distributed 32-bit PRNG. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Distance between two cognitive profiles.
 *
 * `w1` is the EXACT Wasserstein-1 (earth mover's) distance between the two
 * trait distributions under the ground metric `traitGroundDistance`: the
 * minimum, over every transport plan P with row sums `a` and column sums `b`,
 * of sum_ij P[i][j] * d(trait_i, trait_j). It is solved as a min-cost flow
 * (successive shortest paths; see exact-w1.ts). Before 2026-10-21 this field
 * was a "simplified weighted L1" — sum_i |a_i - b_i| times the mean ground
 * distance of trait i — which is not optimal transport and ignores WHICH traits
 * the mass moved between. The old values ran roughly 0.05-0.7; the exact
 * distance is bounded by max ground cost (0.8) times total variation, so it is
 * smaller. The MCP tool reports percentiles within the built-in roster, which
 * absorbs the rescale.
 *
 * `traitContributions[t]` is the transport cost attributed to trait t under the
 * optimal plan: half the cost of mass shipped OUT of t plus half the cost of
 * mass shipped INTO t, i.e. 0.5 * (sum_j P[t][j] d(t,j) + sum_i P[i][t] d(i,t)).
 * Each unit of cost is split between the two endpoints it connects, so the
 * contributions sum to `w1` exactly and are symmetric in the two profiles
 * (swapping A and B transposes P and leaves every contribution unchanged).
 * Mass that stays put (P[t][t]) costs 0 and contributes nothing. The optimal
 * plan is often not unique (ties are common under a three-level cost); the
 * attribution is the plan the solver finds for the pair in a canonical order,
 * so it is deterministic and the same for (A, B) and (B, A). `w1` itself is
 * unique.
 *
 * MODELLING LIMIT (deliberate, unchanged): both profiles are normalised to the
 * simplex before transport, so the absolute scale of the trait vector is
 * discarded. Two personas whose trait vectors are proportional — all traits
 * 0.2 versus all traits 0.8 — have identical distributions and are at
 * distance 0 on `w1`, `w2` and `sliced` alike, although they are very
 * different people. The distance measures the SHAPE of a profile (how traits
 * are weighted against each other), not its level. `OTCognitiveProfile.traitScale`
 * keeps the discarded total so interpolation can restore it; the distance does
 * not use it.
 */
export function cognitiveDistance(profileA: OTCognitiveProfile, profileB: OTCognitiveProfile): CognitiveDistance {
  const d = COGNITIVE_TRAITS.length;
  const a = profileA.distribution;
  const b = profileB.distribution;

  // W1 with ground metric: the exact discrete optimal transport problem.
  //
  // The pair is solved in a canonical order (lexicographically smaller
  // distribution as the source) and the plan transposed back when needed. The
  // optimal COST is unique, but the optimal PLAN is not: with 29 traits and a
  // three-level cost many plans tie, and the solver run on (b, a) does not in
  // general find the transpose of its (a, b) plan. Fixing the order makes the
  // per-trait attribution below identical for (A, B) and (B, A).
  const cost = groundCostMatrix();
  let swapped = false;
  for (let i = 0; i < d; i++) {
    if (a[i] === b[i]) continue;
    swapped = a[i] > b[i];
    break;
  }
  const solved = swapped ? exactW1(b, a, cost) : exactW1(a, b, cost);
  const w1 = solved.cost;
  const plan = swapped ? solved.plan.map((_, i) => solved.plan.map(row => row[i])) : solved.plan;
  const traitContributions: Record<string, number> = {};
  for (let t = 0; t < d; t++) {
    let out = 0, into = 0;
    const row = plan[t];
    const costRow = cost[t];
    for (let j = 0; j < d; j++) {
      if (row[j] > 0) out += row[j] * costRow[j];
      if (plan[j][t] > 0) into += plan[j][t] * cost[j][t];
    }
    traitContributions[COGNITIVE_TRAITS[t]] = 0.5 * (out + into);
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

  // Sliced Wasserstein (fast approximation for validation).
  //
  // The projections are drawn from a SEEDED generator, not Math.random(). Two
  // identical calls used to return different sliced values (measured: 0.031568
  // vs 0.029943 for the same persona pair, a ~5% swing) while the MCP tool that
  // exposes this declares idempotentHint: true. A metric a caller cannot
  // reproduce is not a metric they can act on or diff against a baseline, so the
  // projection set is now fixed. (2026-07-29)
  const numProjections = 100;
  let slicedSum = 0;
  const rand = seededRandom(SLICED_PROJECTION_SEED);
  for (let p = 0; p < numProjections; p++) {
    // Deterministic pseudo-random projection
    const dir = new Float64Array(d);
    let norm = 0;
    for (let i = 0; i < d; i++) {
      dir[i] = rand() * 2 - 1;
      norm += dir[i] * dir[i];
    }
    norm = Math.sqrt(norm);
    for (let i = 0; i < d; i++) dir[i] /= norm;

    // Project and compute 1D W1
    let projA = 0, projB = 0;
    for (let i = 0; i < d; i++) {
      projA += a[i] * dir[i];
      projB += b[i] * dir[i];
    }
    slicedSum += Math.abs(projA - projB);
  }
  const sliced = slicedSum / numProjections;

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
 * - High comprehension → expects denser information
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

  // Information processing load
  breakdown.information = Math.pow(pageMetrics.informationDensity, 1.5) * (1 - p('comprehension') * 0.8);

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
  let maxLoad = 0, bottleneck = 'information';
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
 * test coverage. Uses greedy farthest-point sampling in Wasserstein space,
 * seeded with the two farthest-apart profiles.
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
    out.push({
      ...metrics,
      interactiveElementCount: fresh.newInteractive,
      choiceCount: Math.min(fresh.newChoices, 100),
      choiceCountRaw: fresh.newChoices,
      choiceCountCapped: fresh.newChoices > 100,
    });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  return out;
}

export async function extractPageMetrics(
  page: any,
  scope: MetricScope = "viewport",
  /** Geometry already measured by the caller, so both derivations share one read. */
  geometry?: PageGeometry,
): Promise<{
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
}> {
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
      const steps = Math.min(5, walkGeo.screenCount);
      for (let i = 1; i <= steps; i++) {
        await page.evaluate((y: number) => window.scrollTo(0, y), i * walkGeo.viewportHeight);
        await page.waitForTimeout(300);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
    } catch { /* a page that will not scroll is still measurable */ }
  }
  // The caller's geometry when it has one. `pageScreens` here and `screenCount` in
  // the sequential path were two derivations of one quantity from two separate reads;
  // passing it in makes them one measurement rather than two that agree by luck.
  const geo = geometry ?? (await measurePageGeometry(page));
  return page.evaluate(([measureScope, geoIn]: [MetricScope, PageGeometry]) => {
    const vw = window.innerWidth;
    const vh = geoIn.viewportHeight;
    const fullPage = measureScope === "full_page";
    const docHeight = geoIn.documentHeight;

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

    // Gather only viewport-visible text
    const textEls = Array.from(document.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, td, th, span, div, a, button, label'));
    let viewportTextLength = 0;
    textEls.forEach(el => {
      if (inViewport(el)) {
        const text = (el as HTMLElement).innerText?.trim();
        if (text) viewportTextLength += text.length;
      }
    });
    // Deduplicate: rough estimate — child text counted in parent. Use 40% factor.
    const textLength = Math.round(viewportTextLength * 0.4);
    // Area to normalise density against. Counting whole-page text and dividing
    // by one screen would report a density the page does not have.
    const viewportArea = vw * (fullPage ? docHeight : vh);

    // Interactive elements — viewport only
    const interactive = Array.from(document.querySelectorAll('a, button, input, select, textarea, [role="button"], [onclick], [tabindex]'));
    let interactiveCount = 0;
    interactive.forEach(el => { if (inViewport(el)) interactiveCount++; });

    // Links and choices — viewport only
    const links = Array.from(document.querySelectorAll('a[href]'));
    const selects = Array.from(document.querySelectorAll('select'));
    let choiceCount = 0;
    links.forEach(el => { if (inViewport(el)) choiceCount++; });
    selects.forEach(s => { if (inViewport(s)) choiceCount += s.querySelectorAll('option').length; });

    // Animations — count only ACTUAL running animations, not CSS transition utilities
    // WCAG 2.3.3 cares about content that moves/blinks automatically, not hover transitions
    let animCount = 0;
    document.querySelectorAll('*').forEach(el => {
      if (!inViewport(el)) return;
      const style = getComputedStyle(el);
      // Only count elements with actual running CSS animations (not transitions)
      if (style.animationName && style.animationName !== 'none' &&
          style.animationPlayState === 'running' &&
          style.animationDuration !== '0s' && style.animationDuration !== '0.01ms') {
        animCount++;
      }
    });
    // Also count auto-playing media
    document.querySelectorAll('video[autoplay], [autoplay]').forEach(el => {
      if (inViewport(el)) animCount++;
    });
    const hasCarousel = !!document.querySelector('[class*="carousel"], [class*="slider"], [class*="swiper"]');

    // Navigation depth (breadcrumbs — these are structural, keep full-page)
    const breadcrumbs = document.querySelectorAll('[class*="breadcrumb"] a, nav[aria-label*="breadcrumb"] a');
    const navDepth = Math.max(1, breadcrumbs.length);

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
      if (visibleCount <= 50) {
        const cs = getComputedStyle(all[i]);
        uniqueColors.add(cs.backgroundColor);
        uniqueColors.add(cs.color);
      }
      const tag = all[i].tagName;
      if (tag === 'IMG' || tag === 'SVG' || all[i].getAttribute('role') === 'img') imageCount++;
    }

    // Normalize to 0-1 using logarithmic scaling
    const logScale = (value: number, midpoint: number) => {
      if (value <= 0) return 0;
      return value / (value + midpoint);
    };

    const informationDensity = logScale(textLength, 5000); // Viewport text: 0.5 at 5K chars
    const visualComplexity = logScale(
      uniqueColors.size * 3 + imageCount * 2 + visibleCount * 0.5,
      200
    );
    const textDensity = logScale(textLength / Math.max(1, viewportArea * 0.001), 3);
    const animationLevel = Math.min(1, (animCount + (hasCarousel ? 3 : 0)) / 10);

    // ── Text Readability Analysis (v18.56) ──
    // Extract actual visible text for linguistic analysis
    const visibleTextParts: string[] = [];
    const proseSelectors = 'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, figcaption';
    document.querySelectorAll(proseSelectors).forEach(el => {
      if (inViewport(el)) {
        const t = (el as HTMLElement).innerText?.trim();
        if (t && t.length > 5) visibleTextParts.push(t);
      }
    });
    const visibleText = visibleTextParts.join(' ');

    // ── Script detection ──
    // Three script families with distinct tokenization requirements:
    // 1. CJK logographic (Chinese, Japanese, Korean) — no word boundaries, character = morpheme
    // 2. Abjad (Arabic, Hebrew, Persian, Urdu) — short stems, root-based morphology, RTL
    // 3. Alphabetic (Latin, Cyrillic, Greek, Devanagari) — space-delimited, variable word length

    // CJK characters
    const cjkRegex = /[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/;
    // Arabic/Hebrew/Persian/Urdu characters
    const abjadRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF]/;
    const abjadCharRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF]/g;
    const cjkCharRegex = /[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/g;
    const cjkCharCount = (visibleText.match(cjkCharRegex) || []).length;
    const totalCharCount = visibleText.replace(/\s/g, '').length;

    // Also check key page elements independently (Tolgee translations fire faster than GT)
    const h1Text = document.querySelector('h1')?.textContent || '';
    const navText = document.querySelector('nav')?.textContent || '';
    const keyElementsCJK = (h1Text.match(cjkCharRegex) || []).length + (navText.match(cjkCharRegex) || []).length;
    const keyElementsTotal = (h1Text + navText).replace(/\s/g, '').length;

    // Abjad detection (Arabic, Hebrew, etc.)
    const abjadCharCount = (visibleText.match(abjadCharRegex) || []).length;
    const keyElementsAbjad = ((h1Text.match(abjadCharRegex) || []).length) + ((navText.match(abjadCharRegex) || []).length);

    // Consider CJK if:
    // - >30% of visible text is CJK, OR
    // - >20% of key elements (h1 + nav) are CJK (catches partial translation)
    // - AND at least 5 CJK characters present (avoid false positives on single emoji)
    const isCJKDominant = cjkCharCount >= 5 && (
      (totalCharCount > 0 && cjkCharCount / totalCharCount > 0.3) ||
      (keyElementsTotal > 0 && keyElementsCJK / keyElementsTotal > 0.2)
    );

    // Consider Abjad if:
    // - >30% of visible text is abjad, OR
    // - >20% of key elements are abjad
    // - AND at least 5 abjad characters present
    const isAbjadDominant = !isCJKDominant && abjadCharCount >= 5 && (
      (totalCharCount > 0 && abjadCharCount / totalCharCount > 0.3) ||
      (keyElementsTotal > 0 && keyElementsAbjad / keyElementsTotal > 0.2)
    );

    let wordCount: number;
    let totalWordLength: number;
    let longWords: number;
    let techWords: number;
    const uniqueWords = new Set<string>();
    let sentenceCount: number;
    let avgWordsPerSentence: number;

    if (isAbjadDominant) {
      // ── Abjad text analysis (Arabic, Hebrew, Persian, Urdu) ──
      // Arabic/Hebrew use spaces between words but have:
      // - Short stems (3-4 char roots) — word length metrics need recalibration
      // - Root-based morphology — complex words look short
      // - Technical terms are multi-word phrases, not compound words
      // - Diacritics (tashkeel) and ligatures affect visual complexity

      const abjadWords = visibleText.split(/\s+/).filter(w => w.length > 0);
      wordCount = abjadWords.length;
      totalWordLength = 0;
      longWords = 0;
      techWords = 0;

      for (const word of abjadWords) {
        // Count only abjad + Latin characters (strip punctuation, numbers)
        const clean = word.replace(/[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FFa-zA-ZÀ-ÿ]/g, '');
        const len = clean.length;
        // Arabic stems are 3-4 chars. Normalize: Arabic 3-char word → equivalent
        // of 5 Latin chars for readability (higher information per character than Latin)
        const isAbjadWord = abjadRegex.test(clean);
        const normalizedLen = isAbjadWord ? Math.round(len * 1.6) : len;
        totalWordLength += normalizedLen;
        // "Long" in abjad: 5+ characters (stems with prefixes/suffixes)
        // Equivalent to 8+ Latin chars
        if (isAbjadWord ? len >= 5 : len >= 7) longWords++;
        // "Technical" in abjad: 6+ character words or Latin technical terms
        // Arabic technical vocab like المعرفية (7 chars) or الشخصيات (8 chars)
        if (isAbjadWord ? len >= 6 : len >= 10) techWords++;
        uniqueWords.add(clean);
      }

      // Sentence analysis: Arabic uses ، (comma) and . (period) and ؟ and ؛
      const abjadSentences = visibleText.split(/[.。؟！!?؛]+|\n{2,}/).filter(s => s.trim().length > 5);
      sentenceCount = Math.max(1, abjadSentences.length);
      avgWordsPerSentence = wordCount / sentenceCount;

    } else if (isCJKDominant) {
      // ── CJK text analysis ──
      // CJK languages don't use spaces between words. Each character is roughly
      // one morpheme. We estimate word boundaries using bigram/trigram heuristics.

      // Estimate word count: CJK averages ~1.5-2 characters per "word"
      // (Chinese ~1.5, Japanese ~2 with particles, Korean ~2 with jamo)
      const cjkWordEstimate = Math.round(cjkCharCount / 1.8);
      // Latin words in CJK text (English loanwords, technical terms)
      const latinWords = visibleText.split(/\s+/).filter(w => /^[a-zA-Z]/.test(w));
      wordCount = cjkWordEstimate + latinWords.length;

      // Average "word" length in CJK: 1.8 chars per word normalized to same scale
      // CJK characters carry more meaning per character than Latin.
      // A 2-character CJK word ≈ 5-7 character English word in information density.
      // Normalize: CJK 2-char word → equivalent of ~6 Latin chars for readability
      totalWordLength = cjkWordEstimate * 6 + latinWords.reduce((sum, w) => sum + w.length, 0);

      // "Long words" in CJK: compound terms are 3-4+ characters (equivalent to 7+ Latin)
      // Extract runs of CJK characters and count those ≥ 3 characters
      const cjkRuns = visibleText.match(/[\u3000-\u9fff\uac00-\ud7af]{3,}/g) || [];
      longWords = cjkRuns.filter(r => r.length >= 3).length;

      // "Technical terms" in CJK: 4+ character compounds or Latin technical terms
      const cjkTechRuns = cjkRuns.filter(r => r.length >= 4);
      const latinTechWords = latinWords.filter(w => w.length >= 8);
      techWords = cjkTechRuns.length + latinTechWords.length;

      // Lexical diversity: use unique CJK bigrams as proxy for vocabulary
      for (let i = 0; i < visibleText.length - 1; i++) {
        if (cjkRegex.test(visibleText[i]) && cjkRegex.test(visibleText[i + 1])) {
          uniqueWords.add(visibleText[i] + visibleText[i + 1]);
        }
      }
      for (const w of latinWords) uniqueWords.add(w.toLowerCase());

      // Sentence analysis: CJK uses 。！？ as sentence enders
      const cjkSentences = visibleText.split(/[。！？.!?]+|\n{2,}/).filter(s => s.trim().length > 3);
      sentenceCount = Math.max(1, cjkSentences.length);
      // CJK sentences tend to be shorter in word count but longer in information density
      avgWordsPerSentence = wordCount / sentenceCount;

    } else {
      // ── Alphabetic text analysis ──
      const words_arr = visibleText.split(/\s+/).filter(w => w.length > 0);
      wordCount = words_arr.length;
      totalWordLength = 0;
      longWords = 0;
      techWords = 0;

      for (const word of words_arr) {
        const clean = word.replace(/[^a-zA-ZÀ-ÿ\u00C0-\u024F\u1E00-\u1EFF]/g, '');
        totalWordLength += clean.length;
        if (clean.length >= 7) longWords++;
        if (clean.length >= 10) techWords++;
        uniqueWords.add(clean.toLowerCase());
      }

      const sentences_arr = visibleText.split(/[.!?]+|\n{2,}/).filter(s => s.trim().length > 10);
      sentenceCount = Math.max(1, sentences_arr.length);
      avgWordsPerSentence = wordCount / sentenceCount;
    }

    // ── Normalize to 0-1 (script-aware) ──

    // Average word length: Latin 4→0.2, 6→0.5, 9→0.8
    // CJK equivalent: normalized through the 6-char equivalence above
    const rawAvgWordLen = wordCount > 0 ? totalWordLength / wordCount : 0;
    const avgWordLength = Math.min(1, Math.max(0, (rawAvgWordLen - 3) / 7.5));

    // Average sentence length: 10 words → 0.3, 20 → 0.6, 35+ → 0.9
    const avgSentenceLength = Math.min(1, avgWordsPerSentence / 40);

    // Lexical diversity: unique items / total (capped at 100)
    const lexicalDiversity = wordCount > 0 ? Math.min(1, uniqueWords.size / Math.min(wordCount, 100)) : 0;

    // Long word ratio
    const longWordRatio = wordCount > 0 ? longWords / wordCount : 0;

    // Technical density
    const technicalDensity = wordCount > 0 ? techWords / wordCount : 0;

    return {
      informationDensity,
      visualComplexity,
      interactiveElementCount: interactiveCount,
      textDensity,
      animationLevel,
      // Capped for the demand math, which saturates well before 100 anyway
      // (choices/(choices+10) is 0.91 at 100 and 0.96 at 235). The raw count is
      // emitted beside it because a silently truncated number is
      // indistinguishable from a real one -- at viewport scope the cap was
      // unreachable, and at full_page the CU Denver homepage hits it.
      choiceCount: Math.min(choiceCount, 100),
      choiceCountRaw: choiceCount,
      choiceCountCapped: choiceCount > 100,
      navigationDepth: navDepth,
      avgWordLength,
      avgSentenceLength,
      lexicalDiversity,
      longWordRatio,
      technicalDensity,
      scriptFamily: isCJKDominant ? 'cjk' as const : isAbjadDominant ? 'abjad' as const : 'alphabetic' as const,
      // Emitted so a caller can never again be unable to tell which of these
      // two very different measurements it is holding.
      scope: measureScope,
      // From the shared measurement, so it can never disagree with the screenCount
      // the sequential curve was scored over.
      pageScreens: geoIn.pageScreens,
    };
  }, [scope, geo]);
}

/**
 * Compute the full pairwise distance matrix between personas.
 * Returns a symmetric matrix where entry [i][j] = W₁(persona_i, persona_j).
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
