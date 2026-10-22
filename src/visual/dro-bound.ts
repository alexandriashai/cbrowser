/**
 * A Wasserstein distributionally robust bound on the cognitive transport cost.
 *
 * What it answers. A population of users is a distribution P over capacity
 * vectors x in [0, 1]^30 (one coordinate per DEMAND_DIMENSION, read exactly as
 * the chain reads a persona: capacityVector()). The true population is not
 * known; assume only that it lies within Wasserstein-1 distance epsilon of P,
 * with the ground metric |x - y|_1. Then for every such population Q
 *
 *     E_Q[CTC] <= E_P[CTC] + epsilon * L
 *
 * where L is a Lipschitz constant of CTC(x) in the L1 metric on x
 * (Kantorovich-Rubinstein duality: W1 is the supremum of E_Q f - E_P f over
 * 1-Lipschitz f). The bound is also capped at 1, since CTC lies in (0, 1).
 *
 * What it does NOT answer. This is a property of the MODEL: how far the
 * model's own output can move when the population moves. It says nothing about
 * whether the model predicts people. The chain's constants are hand-set
 * hypotheses (see provenance/chain.ts) and CTC has not been tested against
 * human data; a bound around such a function is not evidence about users and
 * must never be reported as such.
 *
 * epsilon has no default. No data fixes how far a real population sits from a
 * persona roster, so the radius is the caller's assumption and must be named
 * by the caller.
 *
 * How L is derived (sound, not sampled). CTC = sigma(raw) with
 * sigma(z) = 1 / (1 + exp(-k (z - z0))). For each input coordinate s the code
 * below bounds sup |d raw / d x_s| by walking the chain's own structure:
 *
 *  - layer k's cost is c_k * sum_t w_t (d_t - cap_t)^2, with c_k the content
 *    gate (a function of demand alone, except in readingAttention, see below);
 *    |d cost / d cap_t| <= c_k * 2 * max(w_def * d_t, w_sur(t) * (1 - d_t)),
 *    because a deficit gap is at most d_t and a surplus gap at most 1 - d_t;
 *  - the layers' trait sets are disjoint, so a coordinate reaches a later
 *    layer only through the indirect drawdown cap *= 1 - min(m, rho*sigma*L_j)
 *    of every gated earlier layer, whose derivative in L_j is at most
 *    rho*sigma (capacities are <= 1); the drawdown of a layer's own traits
 *    is never read again on the same page;
 *  - readingTendency enters through demand: it scales sustainedAttention
 *    demand by atSkim + x * range, which moves both the gap and the content
 *    gate of readingAttention, the last layer (so its depletion gate cannot
 *    feed back into anything on the page);
 *  - interaction terms w_p * L_a * L_b are bounded by the product rule with
 *    each layer's maximum attainable cost;
 *  - sigma' is bounded by its value at the point of [0, rawMax] nearest z0.
 *
 * Every piece of the chain is continuous in x (the deficit/surplus switch
 * meets at gap 0, min/max clamps are continuous, and the only x-dependent gate
 * sits after the last layer), so a bound on the partial derivatives where they
 * exist is a Lipschitz constant. Each partial is bounded separately and the
 * L1 constant is their maximum, which is the dual norm of L1.
 *
 * Schwartz value modulation of demand is not supported here (it would add
 * further demand-dependence on options); no shipped caller passes it.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import {
  computeSequentialCTC,
  capacityVector,
  DEMAND_DIMENSIONS,
  LAYER_DEFINITIONS,
  INTERACTION_PAIRS,
  SURPLUS_FREE_DIMENSIONS,
  type DemandDistribution,
} from "./cognitive-transport-chain.js";
import { buildOTCognitiveProfile } from "./cognitive-transport.js";
import { param } from "./model-provenance.js";

export interface DroOptions {
  /** Same meaning as computeSequentialCTC's options. Default true. */
  asymmetric?: boolean;
  /** Same meaning as computeSequentialCTC's options. Default true. */
  interactions?: boolean;
}

export interface LipschitzBound {
  /** Lipschitz constant of CTC(x) in the L1 metric on capacity vectors. */
  lipschitz: number;
  /** The coordinate whose partial derivative bound attains it. */
  worstDimension: string;
  /** Per-coordinate bounds on |d CTC / d x_s|. */
  perDimension: Record<string, number>;
  /** Upper bound on raw CTC before the sigmoid, used to bound sigma'. */
  rawMax: number;
}

export interface PopulationMember {
  /** Persona traits; read through capacityVector exactly as the chain reads them. */
  traits: Record<string, number | string>;
  /** Non-negative weight. Weights are normalised; default 1. */
  weight?: number;
}

export interface WorstCaseBound {
  /** E_P[CTC] over the given population. */
  nominal: number;
  /** epsilon as passed. */
  epsilon: number;
  lipschitz: number;
  /** min(1, nominal + epsilon * lipschitz): no population within W1 epsilon can have a higher mean CTC. */
  upper: number;
  /** max(0, nominal - epsilon * lipschitz). */
  lower: number;
  metric: "W1 over capacity vectors in [0,1]^30 with ground metric |x - y|_1";
  note: string;
}

function readChainParams() {
  return {
    weightDeficit: param("chain.weightDeficit"),
    weightSurplus: param("chain.weightSurplus"),
    contentScaleGain: param("chain.contentScaleGain"),
    depletionGate: param("chain.depletionGate"),
    depletionRate: param("chain.depletionRate"),
    indirectShare: param("chain.indirectDepletionShare"),
    atSkim: param("chain.engagement.atSkim"),
    range: param("chain.engagement.range"),
    slope: param("chain.ctcSigmoidSlope"),
    centre: param("chain.ctcSigmoidCentre"),
  };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * A sound Lipschitz constant of totalCTC in the capacity vector, for one demand
 * distribution. See the module comment for the derivation.
 */
export function ctcLipschitzBound(demand: DemandDistribution, options: DroOptions = {}): LipschitzBound {
  const P = readChainParams();
  const asym = options.asymmetric !== false;
  const useInter = options.interactions !== false;
  const d0 = (t: string) => demand.demands[t] ?? 0;
  const wDef = asym ? P.weightDeficit : 1;
  const wSur = (t: string) => (asym ? (SURPLUS_FREE_DIMENSIONS.has(t) ? 0 : P.weightSurplus) : 1);

  // sustainedAttention demand ranges with readingTendency in [0, 1].
  const SA = "sustainedAttention";
  const RT = "readingTendency";
  const saLo = clamp01(d0(SA) * P.atSkim);
  const saHi = clamp01(d0(SA) * (P.atSkim + P.range));
  const saSlope = d0(SA) * P.range; // |d demand_sa / d x_rt| where unclamped

  // Per layer: content gate (max over the reachable demand), per-trait bound on
  // |d cost / d cap_t| and the largest attainable layer cost.
  type L = { name: string; traits: string[]; gate: number; gated: boolean; g: Record<string, number>; A: number; maxCost: number };
  const layers: L[] = LAYER_DEFINITIONS.map((def) => {
    const dep = def.traits.includes(SA);
    const dHi = (t: string) => (t === SA ? saHi : Math.max(0, d0(t)));
    const dLo = (t: string) => (t === SA ? saLo : Math.max(0, d0(t)));
    const mean = def.traits.reduce((s, t) => s + dHi(t), 0) / def.traits.length;
    const gate = Math.min(1, mean * P.contentScaleGain);
    // Depletion gating depends on demand only, except in a layer whose demand
    // moves with x; treat such a layer as gated (an upper bound on coupling).
    const meanLo = def.traits.reduce((s, t) => s + dLo(t), 0) / def.traits.length;
    const gated = dep ? true : Math.min(1, meanLo * P.contentScaleGain) > P.depletionGate;
    const g: Record<string, number> = {};
    let A = 0, maxCost = 0;
    for (const t of def.traits) {
      const defGap = dHi(t);
      const surGap = Math.max(0, 1 - dLo(t));
      g[t] = gate * 2 * Math.max(wDef * defGap, wSur(t) * surGap);
      A += g[t];
      maxCost += Math.max(wDef * defGap * defGap, wSur(t) * surGap * surGap);
    }
    return { name: def.name, traits: def.traits, gate, gated, g, A, maxCost: gate * maxCost };
  });

  const rhoSigma = P.depletionRate * P.indirectShare;
  const pairs = useInter ? INTERACTION_PAIRS.map((p) => ({ a: p.a, b: p.b, w: param(p.weight) })) : [];
  const maxCostOf = (name: string) => layers.find((l) => l.name === name)?.maxCost ?? 0;

  let rawMax = layers.reduce((s, l) => s + l.maxCost, 0);
  for (const p of pairs) rawMax += p.w * maxCostOf(p.a) * maxCostOf(p.b);

  // sigma'(z) = k * s(1-s) is largest at z0; on [0, rawMax] use the nearest point.
  const zStar = Math.max(0, Math.min(rawMax, P.centre));
  const sStar = 1 / (1 + Math.exp(-P.slope * (zStar - P.centre)));
  const sigmaPrime = P.slope * sStar * (1 - sStar);

  const perDimension: Record<string, number> = {};
  let lipschitz = 0, worstDimension = DEMAND_DIMENSIONS[0] as string;
  for (const s of DEMAND_DIMENSIONS as readonly string[]) {
    const D: Record<string, number> = {};
    let earlier = 0; // sum over earlier gated layers of D_j(s)
    let rawPartial = 0;
    for (const l of layers) {
      let dk = (l.g[s] ?? 0) + l.A * rhoSigma * earlier;
      if (s === RT && l.traits.includes(SA)) {
        // readingTendency moves this layer's demand: gap and content gate.
        const wMax = Math.max(wDef, wSur(SA));
        const gapMax = Math.max(saHi, 1 - saLo);
        dk += saSlope * (P.contentScaleGain * wMax * gapMax * gapMax + 2 * l.gate * wMax * gapMax);
      }
      D[l.name] = dk;
      rawPartial += dk;
      if (l.gated) earlier += dk;
    }
    for (const p of pairs) rawPartial += p.w * ((D[p.a] ?? 0) * maxCostOf(p.b) + maxCostOf(p.a) * (D[p.b] ?? 0));
    const bound = sigmaPrime * rawPartial;
    perDimension[s] = bound;
    if (bound > lipschitz) { lipschitz = bound; worstDimension = s; }
  }
  return { lipschitz, worstDimension, perDimension, rawMax };
}

/** totalCTC of one capacity vector (numbers over DEMAND_DIMENSIONS). */
export function ctcOfCapacity(x: Record<string, number>, demand: DemandDistribution, options: DroOptions = {}): number {
  return computeSequentialCTC(buildOTCognitiveProfile("dro", x), demand, {
    asymmetric: options.asymmetric !== false,
    interactions: options.interactions !== false,
  }).totalCTC;
}

/**
 * Worst-case mean CTC over every population within W1 distance `epsilon` of
 * the given one. `epsilon` is required: it is the caller's assumption about
 * how far real users can sit from the personas, in mean L1 change of the
 * capacity vector.
 */
export function worstCaseCTCBound(
  population: PopulationMember[],
  demand: DemandDistribution,
  epsilon: number,
  options: DroOptions = {},
): WorstCaseBound {
  if (typeof epsilon !== "number" || !Number.isFinite(epsilon) || epsilon < 0)
    throw new Error("worstCaseCTCBound: epsilon must be a finite number >= 0 (no default; it is the caller's assumption)");
  if (!population.length) throw new Error("worstCaseCTCBound: population is empty");
  let total = 0, mean = 0;
  for (const m of population) {
    const w = m.weight ?? 1;
    if (!(w >= 0) || !Number.isFinite(w)) throw new Error("worstCaseCTCBound: weights must be finite and >= 0");
    total += w;
  }
  if (!(total > 0)) throw new Error("worstCaseCTCBound: weights sum to 0");
  for (const m of population) mean += ((m.weight ?? 1) / total) * ctcOfCapacity(capacityVector(m.traits), demand, options);
  const { lipschitz } = ctcLipschitzBound(demand, options);
  return {
    nominal: mean,
    epsilon,
    lipschitz,
    upper: Math.min(1, mean + epsilon * lipschitz),
    lower: Math.max(0, mean - epsilon * lipschitz),
    metric: "W1 over capacity vectors in [0,1]^30 with ground metric |x - y|_1",
    note: "A property of the model, not of people: how far the model's mean CTC can move when the population moves by epsilon. The chain's constants are hand-set hypotheses.",
  };
}
