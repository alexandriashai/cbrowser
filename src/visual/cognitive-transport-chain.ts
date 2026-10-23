/**
 * Cognitive Optimal Transport — Sequential Transport Chain
 *
 * Implements the CHI 2027 paper's core contribution:
 * - 29-dimensional demand distribution computed from page features
 * - Sequential transport chain where each layer depletes capacity
 * - Asymmetric deficit-surplus cost
 * - Layer interaction terms
 *
 * Mathematical foundation: The total Cognitive Transport Cost is NOT
 * the sum of independent layers. Each layer receives the user's RESIDUAL
 * capacity after prior layers have consumed resources.
 *
 * @see Section 3.4 of "Cognitive Optimal Transport: A Unified Framework"
 * @since v18.39.0
 */

import {
  type OTCognitiveProfile,
  type MetricScope,
  deriveMetrics,
  extractPageMetrics,
} from './cognitive-transport.js';
import { activeOverrides, param, readsOf } from './model-provenance.js';
import { timeDemand } from './demand-laws.js';
import {
  type PercentileCurve,
  type PercentileInterval,
  bootstrapPercentileInterval,
  intervalAt,
  percentileAt,
  percentileCurve,
  referencePopulation,
  referenceRaw,
} from './ctc-reference.js';

// ── Types ──

/** Page metrics extracted from a live page (matches extractPageMetrics return) */
export interface PageMetrics {
  informationDensity: number;       // 0-1: how dense the content is
  visualComplexity: number;         // 0-1: how visually complex
  interactiveElementCount: number;  // raw count of interactive elements
  textDensity: number;              // 0-1: text-heaviness
  animationLevel: number;           // 0-1: motion/animation amount
  choiceCount: number;              // number of decision points
  navigationDepth: number;          // clicks to reach content
  // Text readability metrics (v18.56) — HOW HARD the text is, not just how much
  avgWordLength?: number;           // 0-1: normalized avg word length (longer = harder)
  avgSentenceLength?: number;       // 0-1: normalized avg words per sentence
  lexicalDiversity?: number;        // 0-1: type-token ratio (higher = more diverse vocab)
  longWordRatio?: number;           // 0-1: fraction of 7+ character words
  technicalDensity?: number;        // 0-1: fraction of 10+ character words
  scriptFamily?: 'alphabetic' | 'cjk' | 'abjad';  // Detected script family
  /** What the metrics were measured over; extractPageMetrics always sets it. */
  scope?: MetricScope;
  /**
   * Stage B: seconds of work for the reference user from published laws
   * (deriveMetrics, demand-laws.ts). The motor, decision, procedure and
   * reading demands are these against one time budget, d = T / (T + tau)
   * (law.timeBudget). Required: computeDemandDistribution throws without them,
   * so no demand falls back to a hand-set curve.
   */
  pointingSeconds: number;
  choosingSeconds: number;
  readingSeconds: number;
  procedureSeconds: number;
  /**
   * Stage C: the same choices by Hick-Hyman, the expert limit of the menu
   * model whose novice limit is choosingSeconds (Cockburn, Gutwin & Greenberg
   * 2007). cognitiveLoad's demand reads (1 - e) choosingSeconds +
   * e choosingSecondsExpert, e the run's siteFamiliarity (DemandOptions).
   * Required like the four above.
   */
  choosingSecondsExpert: number;
}

/** What a run supplies to the demand besides the page: the visit, the same for every persona scored in it. */
export interface DemandOptions {
  /**
   * Cockburn et al.'s (2007) expertise e with the page's choices, from 0 (a
   * first visit, the default and the reference curve's) to 1 (a daily user
   * who knows where everything is): Eq. 4, T = (1 - e) T_novice + e T_expert,
   * applied to the choosing time the cognitiveLoad abilities are asked (the
   * decision dispositions keep the first-visit time; see
   * computeDemandDistribution). A definition: the parameter IS their e, with
   * the layout's learnability L folded in by whoever supplies it. Refused
   * outside [0, 1], never clamped.
   */
  siteFamiliarity?: number;
}

export interface DemandDistribution {
  /** 29-dimensional demand vector (0-1 per trait), one slot per DEMAND_DIMENSIONS entry */
  demands: Record<string, number>;
  /**
   * The scope the page metrics were measured at, carried from PageMetrics so
   * that totalCTC is ranked against reference pages measured the same way. A
   * full-page measurement of a long page asks far more than its first screen,
   * and ranking it among first screens would call every long page hard.
   * Absent on a demand built from raw numbers; such a demand is ranked against
   * the viewport reference, extractPageMetrics' default scope.
   */
  scope?: MetricScope;
}

export interface LayerResult {
  name: string;
  transportCost: number;
  /**
   * Capacity this layer actually removed from the account, summed over all
   * DEMAND_DIMENSIONS: its own dimensions (direct drawdown) and every other one
   * (indirect, cross-layer fatigue). Measured from the balances before and
   * after the layer, so everything that limits the draw is inside it: 0 when
   * the content gate kept the layer from depleting, the drawdown cap
   * (chain.maxDrawdownFraction) on a heavy layer, and the capacity floor
   * (chain.capacityEpsilon), which can stop a draw but is never counted as one.
   * Units are capacity summed over dimensions, so the most one layer can
   * remove is the number of dimensions.
   *
   * Why this definition. The name promises what the layer took out of the
   * budget. The indirect share is the part every LATER layer on the page
   * feels (a layer's own dimensions are not read again on the same page), so
   * a figure without it would report only the part that matters least.
   * Through 21.0 this was depletionRate x cost: the draw the layer would have
   * made with no gate, no cap and no floor, reported even when nothing was
   * drawn.
   */
  capacityConsumed: number;
  residualCapacity: Record<string, number>;
  /**
   * Mean spare capacity across this layer's dimensions, 0 when the layer is in
   * deficit. Read it when `transportCost` is 0: the cost floor cannot tell a
   * comfortable reader from an extremely comfortable one, and this can.
   */
  headroom: number;
}

export interface SequentialTransportResult {
  /**
   * Total Cognitive Transport Cost as a PERCENTILE in [0, 1]: where `rawCTC`
   * falls among the raw costs of the reference pages (src/data/ctc-reference-*.ts,
   * measured at this demand's scope) for every built-in persona, pooled, under
   * the same asymmetric and interactions options. Linear between the order
   * statistics (ctc-reference.ts). 0.5 is the pooled median; 1 means at least
   * as costly as the costliest (page, persona) pair in the reference, and 0 no
   * costlier than the cheapest. Relative to real pages, not a probability and
   * not a validated difficulty: no human data has tested it.
   */
  totalCTC: number;
  /**
   * 95% interval for totalCTC, [low, high]: where this rawCTC's percentile
   * falls across bootstrap resamples of the reference PAGES
   * (ctc-reference.ts, bootstrapPercentileInterval). It measures how firmly
   * the reference fixes the scale, the sampling error of ranking against a
   * few hundred real pages; it says nothing about whether rawCTC is right.
   * [0, 0] below the reference and [1, 1] above it.
   */
  totalCTCInterval: [number, number];
  /** Which reference totalCTC was ranked against: the demand's scope, or viewport when it has none. */
  referenceScope: MetricScope;
  /** Per-layer results in sequential order */
  layers: LayerResult[];
  /** Pairwise interaction terms */
  interactions: Record<string, number>;
  /** Additive-only CTC for comparison */
  additiveCTC: number;
  /**
   * The un-normalised total, in layer-cost units: the sum of layer costs and
   * interaction terms. `totalCTC` is its percentile, so any ratio against
   * additiveCTC, and any bound on the chain itself (dro-bound.ts), uses this.
   */
  rawCTC: number;
  /** Asymmetric deficit-surplus breakdown */
  deficitCost: number;
  surplusCost: number;
  /** Per-trait transport cost */
  traitCosts: Record<string, number>;
  /** Bottleneck layer (highest cost) */
  bottleneckLayer: string;
  /** Predicted abandonment probability (0-1) */
  abandonmentRisk: number;
  /**
   * Capacity remaining when the chain finished, per dimension.
   *
   * Feed it back in as `carriedCapacity` to score the next screen against the
   * budget this one left behind.
   */
  remainingCapacity: Record<string, number>;
}

// ── Constants ──

/**
 * The 29 demand dimensions used by the sequential transport chain, covering
 * the core capacities plus decision biases, learning transfer, emotional
 * regulation and the bridged reading/motor/attention capacities.
 *
 * NOT the same space as COGNITIVE_TRAITS (29). Four dimensions exist only here
 * (attentionPattern, motorPrecision, processingSpeed, textProcessing: no persona
 * in the tool path carries them, so they read the missing-trait fallback, and
 * none is in a layer). Four traits exist only there (attributionStyle,
 * timeHorizon, authoritySensitivity: no demand term; siteFamiliarity: a visit
 * state the demand reads, DemandOptions, since 21.0). Both differences are
 * pinned in tests/transport-dimension-alignment.test.ts, so a new one fails a
 * test; nothing asserts the two sets are equal.
 */
export const DEMAND_DIMENSIONS = [
  // Core capacity traits
  'patience', 'riskTolerance', 'comprehension',
  'persistence', 'workingMemory', 'readingTendency',
  // Emotional regulation
  'resilience', 'selfEfficacy', 'emotionalContagion',
  // Decision-making
  'satisficing', 'anchoringBias', 'fearOfMissingOut', 'socialProofSensitivity',
  // Perceptual
  'changeBlindness', 'attentionPattern',
  // Motor & procedural
  'motorPrecision', 'proceduralFluency',
  // Cognitive strategy
  'informationForaging', 'metacognitivePlanning', 'transferLearning',
  // Interrupt & recovery
  'interruptRecovery',
  // Trust
  'trustCalibration',
  // Additional extended traits
  'mentalModelFlexibility', 'curiosity',
  // Processing
  'processingSpeed', 'textProcessing',
  // siteFamiliarity left the vector in 21.0 (Stage C). It is the visit's
  // state, not the person's: Cockburn, Gutwin & Greenberg's (2007) expertise e
  // on the choosing time, supplied per run (DemandOptions) and the same for
  // every persona in it. As a capacity it read a navigation-depth demand that
  // was a constant on 92% of real pages, so every persona paid the same 0.056.
  // Capacity, bridged from the formal reading and pointing models.
  //
  // These layers previously read DISPOSITION traits -- readingTendency for
  // readability, patience and proceduralFluency for motor -- while the modules
  // that actually model decoding and Fitts pointing sat beside them, computing
  // WPM, visual span, phonological penalties, movement times and hit
  // probabilities that no layer ever consumed. A dyslexic persona therefore
  // scored LOWER readability cost than an ADHD persona on a text-dense page.
  //
  // `sustainedAttention` is the attentional half of reading, and it was missing
  // from the model entirely. Taking `readingTendency` out of the readability
  // layer left decoding and nothing else, so an ADHD reader -- whose decoding is
  // typically intact and whose difficulty is holding the line -- read a wall of
  // text at no attentional cost at all.
  'readingCapacity', 'motorCapacity', 'sustainedAttention',
] as const;

/**
 * Layer definitions for the sequential transport chain.
 * Order reflects temporal processing: perception -> cognition -> decision -> action -> affect -> comprehension.
 *
 * Exported (2026-08-03) so that prose ABOUT the chain can be checked against the
 * chain. Two served strings stated a layer count -- a tool description and the
 * server's own instructions -- and they disagreed with each other and with this
 * array, because nothing could compare them to it. The instructions still said
 * "6-layer" two layers after the chain became eight, and an external client read it
 * and reasoned about a six-layer model. A count in a served string is a claim about
 * this list; a claim about a list should be checkable against the list.
 */
export const LAYER_DEFINITIONS: Array<{ name: string; traits: string[] }> = [
  {
    // Named `saliency` until 21.0, which claimed a mechanism this layer does not
    // have. Its demand is pageMetrics.visualComplexity (a count of visual
    // elements) and the animation level; the fitted attention model (UEyes,
    // attention-transport.ts) never reaches it. The name now says what it reads.
    //
    // attentionPattern left this layer in 21.0. It is not a CognitiveTraits
    // field, so as cognitive_effort builds a persona its capacity was the
    // missing-trait fallback for everyone: a term that moved every score and
    // told no two personas apart.
    name: 'visualComplexity',
    traits: ['changeBlindness'],
  },
  {
    name: 'cognitiveLoad',
    // STAGE C (21.0): four abilities asked the choosing time. Each takes the
    // decision demand, d = T_choose / (T_choose + tau), with no share, so a
    // value reads as tolerated reference choosing time tau c / (1 - c): the
    // claim is the persona value (a hypothesis, provenance/personas.ts), not a
    // coefficient. Through 20.x the layer read text features (word and
    // sentence length, a lexical diversity that is 1 on any page with 100
    // distinct words, a nested text count) that the reading law now prices,
    // against `comprehension`, which is grasp of UI conventions, not reading.
    // The channel is where the evidence points (convention knowledge and web
    // experience act on finding things: research/stage-c-design.md, 3.5); the
    // magnitude is the persona's value. Same seconds, second layer: decision
    // prices dispositions against them, this layer abilities, as reading
    // seconds feed both readability and readingAttention.
    //
    // siteFamiliarity left this layer: it is the visit's e on the choosing
    // time (DemandOptions), not a capacity. `transferLearning` moved here from
    // readability 2026-08-02.
    traits: ['comprehension', 'workingMemory', 'informationForaging', 'transferLearning'],
  },
  {
    name: 'decision',
    traits: ['satisficing', 'anchoringBias', 'riskTolerance', 'fearOfMissingOut', 'socialProofSensitivity'],
  },
  {
    name: 'motor',
    // POINTING ONLY, as of 2026-08-03 (D-9 resolution). This layer answers one
    // question: how expensive is it for this person to ACQUIRE a target.
    //
    // It used to sum pointing capability and procedural execution at equal
    // weight in one scalar, which is the same failure shape the readability
    // layer had before it was split. Measured on identical demand:
    //
    //   motor-impairment-tremor  cost 0.072   hitProbability 48.4%
    //   elderly-user             cost 0.107   hitProbability 81.9%
    //
    // Worse pointing, lower cost -- because the tremor persona's procedural
    // fluency (0.60) outweighed its pointing deficit against elderly's 0.40.
    // `motorAccessibility` is reported in the same response and tracks only
    // pointing, so every ordering check against it read as broken.
    //
    // `proceduralFluency` moved to `motorProcedure` below. Nothing was weighted
    // to achieve this: the two layers contribute additively like every other
    // layer, which makes their relative contribution visible and inspectable
    // rather than hidden inside a scalar. There is no empirical basis for a
    // relative weighting between target acquisition and sequence execution, and
    // a constant invented here would acquire false authority by ending up in a
    // research instrument. The calibration slot is deliberately left empty --
    // see MOTOR_LAYER_WEIGHTS.
    traits: ['motorCapacity'],
  },
  {
    name: 'motorProcedure',
    // Executing an interaction SEQUENCE once a target has been acquired --
    // multi-step flows, form progressions, anything where the cost is in the
    // order of operations rather than in hitting the control.
    //
    // Separate from `motor` because the two genuinely move in opposite
    // directions for the same persona, which is precisely what makes them
    // separable rather than one number: a tremor persona can be a poor pointer
    // and a competent sequence-follower, and an elderly persona the reverse.
    //
    // DEMAND IS ABSOLUTE, not area-normalised. The number of steps in a
    // sequence does not shrink because the page is tall. Its demand derives
    // from interactiveElementCount, which is a raw count -- so there is nothing
    // to remove here today, and this is recorded for the D-12 layer
    // classification table rather than decided silently in code.
    traits: ['proceduralFluency'],
  },
  {
    name: 'frustration',
    // Two traits, not four, as of 21.0. resilience and selfEfficacy sat here
    // through 20.x, but no page feature writes demand to either, so in the
    // asymmetric mode every tool runs they could only ever be surplus on
    // surplus-free dimensions: cost 0, every time. All they did there was halve
    // the content gate, which is the mean demand over this list, so frustration
    // scored at roughly half its own demand. (In the symmetric ablation, where
    // all surplus is billed, they instead charged their whole capacity squared
    // against a page that asked nothing of them.) They remain dimensions --
    // abandonment reads resilience -- and are no longer in a layer.
    traits: ['patience', 'emotionalContagion'],
  },
  {
    name: 'readability',
    // DECODING ONLY, as of 2026-08-02 (D-3 Option 1). This layer answers one
    // question -- how expensive is it for this person to turn these glyphs into
    // words -- and it is the layer `legibilityQuality` makes a promise about:
    // lower legibility for someone means higher readability cost for them.
    //
    // Everything else that was here has been moved out, and the history is why
    // it had to be:
    //
    //   R1  adhd 0.401 / dyslexic 0.189   inverted   (disposition drove it)
    //   R2  adhd 0.112 / dyslexic 0.142   correct    (attentional term removed)
    //   R4  adhd 0.161 / dyslexic 0.126   inverted   (attentional term restored)
    //
    // Removing the attentional term fixed the ordering and deleted ADHD reading
    // cost. Restoring it recovered ADHD reading cost and broke the ordering.
    // BOTH were correct fixes. The layer was carrying two mechanisms through
    // one scalar under a contract that only describes one of them, and no
    // weighting satisfies both -- an ADHD attentionSpan of 0.30 against a
    // dyslexic 0.50 swamps five decoding terms pointing the other way.
    //
    // So the second mechanism gets its own layer rather than a smaller weight.
    // `sustainedAttention` moved to `readingAttention` below.
    // `comprehension` moved out entirely: it is "grasp of UI conventions", not
    // decoding, and it already drives cognitiveLoad -- keeping it here made the
    // contract non-monotonic for personas whose comprehension and decoding
    // disagree, which after the reading-capacity schema change is most of them.
    // `transferLearning` moved to cognitiveLoad: applying a pattern learned on
    // one interface to another is not reading. It is not orphaned by the move.
    traits: ['readingCapacity'],
  },
  {
    name: 'readingAttention',
    // The attentional half of reading, split out of `readability` so both are
    // separately attributable rather than summed into one number that can only
    // be right about one of them.
    //
    // This is the layer an ADHD reader's cost lands in: decoding intact, loses
    // place, re-reads, pulled off the line by movement in the periphery. It is
    // NOT frustration -- losing your place is a processing cost, not an
    // emotional response to one, and routing it through frustration would point
    // remediation at reassurance instead of at chunking, shorter blocks and
    // fewer moving distractors.
    //
    // Appended as layer 7 rather than inserted before readability, deliberately:
    // layers spend from a budget the earlier ones depleted, so inserting would
    // have changed readability's numbers through depletion as well as through
    // its trait list, and the two effects could not be told apart.
    traits: ['sustainedAttention'],
  },
];

/**
 * Pairwise interaction definitions: five cross-layer couplings, each a
 * hand-set hypothesis registered in provenance/chain.ts (no empirical
 * calibration exists for them; an earlier comment claimed one). The weight
 * is read through param() so a run records that it depended on it.
 */
export const INTERACTION_PAIRS: Array<{ a: string; b: string; weight: string }> = [
  { a: 'cognitiveLoad', b: 'decision', weight: 'chain.interaction.cognitiveLoadXdecision' },
  { a: 'visualComplexity', b: 'cognitiveLoad', weight: 'chain.interaction.visualComplexityXcognitiveLoad' },
  { a: 'frustration', b: 'readability', weight: 'chain.interaction.frustrationXreadability' },
  { a: 'cognitiveLoad', b: 'motor', weight: 'chain.interaction.cognitiveLoadXmotor' },
  { a: 'frustration', b: 'decision', weight: 'chain.interaction.frustrationXdecision' },
];

// Asymmetric cost weights (chain.weightDeficit 1, chain.weightSurplus 0.3):
// hand-set hypotheses registered in provenance/chain.ts, not a theorem. Read
// into CHAIN_PARAMS at function entry.

/**
 * Dimensions where having MORE than the page asks for costs nothing at all.
 *
 * THE RULE, decided 2026-08-03, and it is derivable rather than chosen: surplus
 * is FREE where the dimension's own `highEnd` names an ABILITY, and BILLED
 * where it names a TENDENCY, a BIAS, or a SUSCEPTIBILITY. Read the trait
 * reference and the classification falls out; a new dimension is classified by
 * its own definition, not by anyone's taste.
 *
 * Why the split is real. Billing surplus is defensible for a disposition: a
 * maximiser on a trivial page genuinely over-deliberates, and a careful reader
 * genuinely reads a page that did not need reading. That is effort spent. It is
 * NOT defensible for an ability -- having more working memory, or recognising
 * conventions faster, than a page requires cannot make that page harder. The
 * capacity/disposition axis is the same one that moved readingTendency to the
 * demand side and kept comprehension out of the readability layer.
 *
 * What it was costing. Measured on a mid-density page before this change,
 * SEVENTY PERCENT of `power-user`'s total cost was surplus, and 60% of
 * `cognitive-adhd`'s. A uniform-capacity sweep produced a U:
 *
 *   capacity  0.2    0.4    0.6    0.8    1.0
 *   cost      0.549  0.081  0.076  0.179  0.516
 *
 * A maximally capable persona scored almost exactly as badly as a maximally
 * impaired one, for opposite reasons, and the output could not tell you which.
 * That is the same defect as every other one this campaign found: a number that
 * does not mean what its name says.
 *
 * Four dimensions are billed BECAUSE THEIR SCALE IS INVERTED -- changeBlindness,
 * trustCalibration, curiosity and attentionPattern name a deficit at their high
 * end ("misses most changes", "accepts claims at face value", "easily
 * distracted"). Surplus there is more of the deficit, and billing it is
 * correct.
 *
 * `selfEfficacy` is the weakest call in the free set: over-confidence is a real
 * hazard, but its cost surfaces through riskTolerance and trustCalibration
 * rather than as effort spent, so it is treated as the ability its high end
 * describes.
 */
export const SURPLUS_FREE_DIMENSIONS = new Set([
  // Derived capacity bridges -- pure abilities by construction.
  'readingCapacity', 'motorCapacity', 'sustainedAttention', 'processingSpeed', 'textProcessing', 'motorPrecision',
  // Abilities: every one of these has a highEnd naming something a person CAN
  // do, not something they TEND to do.
  'comprehension',           // "Instant recognition of all conventions"
  'workingMemory',           // "Perfect recall of all attempts and context"
  'resilience',              // "Instantly shrugs off errors, stays positive"
  'selfEfficacy',            // "I can solve anything"
  'proceduralFluency',       // "Follows procedures precisely and efficiently"
  'transferLearning',        // "Instantly applies patterns across all interfaces"
  'interruptRecovery',       // "Seamlessly resumes exactly where left off"
  'mentalModelFlexibility',  // "Highly adaptive - quickly forms new mental models"
  'informationForaging',     // "Follows information scent efficiently, abandons low-yield paths"
]);

/**
 * Dimensions whose surplus IS billed, and why each one earns it.
 *
 * Stated explicitly rather than left as "everything else", so that a dimension
 * added to DEMAND_DIMENSIONS cannot acquire a billing treatment by default. A
 * test asserts every dimension appears in exactly one of the two sets.
 */
const SURPLUS_BILLED_DIMENSIONS = new Set([
  'patience',                // "Waits indefinitely" -- waiting longer than needed is time spent
  'riskTolerance',           // "Clicks anything that might work" -- a tendency, and a hazard
  'persistence',             // "Keeps trying same approach repeatedly" -- repeating unnecessary work
  'readingTendency',         // "Reads every word before acting" -- reading a page that did not need it
  'emotionalContagion',      // susceptibility to the interface's tone
  'satisficing',             // a decision STRATEGY, not an ability
  'anchoringBias',           // a bias, by name
  'fearOfMissingOut',        // susceptibility to urgency and scarcity
  'socialProofSensitivity',  // susceptibility to what others chose
  'metacognitivePlanning',   // "Careful planning before any action" -- planning a trivial page is waste
  // Inverted scales: the HIGH end is the deficit, so surplus is more deficit.
  'changeBlindness',         // "Misses most changes outside focus area"
  'trustCalibration',        // "Highly trusting, accepts claims at face value"
  'curiosity',               // "Easily distracted by interesting elements"
  'attentionPattern',        // scanning-vs-thorough disposition
]);

/**
 * Hill exponent on the abandonment curve. UNCALIBRATED.
 *
 * Same status as MOTOR_LAYER_WEIGHTS and flagged for the same reason: it is
 * doing a great deal of work and nothing empirical set it. At 2 the curve is
 * superlinear, which means the same total cost delivered in small increments
 * barely registers -- splitting a fixed deficit of 0.607 across 14 steps takes
 * cumulative abandonment from 22% to 2%.
 *
 * That matters beyond the scalar. Any future per-screen hazard model inherits
 * this exponent, and at 2 it would make a long page SAFER than a short one with
 * identical total demand purely from chunking. The exponent is not the fix for
 * that -- per-screen demand measured on its own content is -- but a sequential
 * model must not be built without knowing this constant is load-bearing.
 *
 * What would settle it: observed abandonment against measured task difficulty,
 * or a dose-response fit on real session data. Until then it is a shape someone
 * chose, not a shape anyone measured. (2026-08-03)
 */
export const ABANDONMENT_HILL_EXPONENT = param('chain.abandonmentHillExponent');

/**
 * Relative weighting between the two motor layers. BOTH DEFAULT TO 1.0 AND ARE
 * UNCALIBRATED.
 *
 * They exist as named constants so that if a weighting is ever introduced it is
 * visible, greppable and dated, rather than baked into the cost function as a
 * bare multiplier. Nothing reads them today; the layers contribute additively
 * like every other layer.
 *
 * What would settle them: motor-control literature on tremor adaptation in
 * target acquisition, or validation of chain output against measured
 * task-completion times. Until one of those exists, a number here would be an
 * invention wearing the authority of a research instrument. (2026-08-03)
 */
export const MOTOR_LAYER_WEIGHTS = {
  /** UNCALIBRATED. Target acquisition. */
  motor: 1.0,
  /** UNCALIBRATED. Sequence execution. */
  motorProcedure: 1.0,
} as const;

// ── Registry reads ──
//
// Every hand-set number the chain uses lives in provenance/chain.ts and is
// read through param() once per call, at function entry. The code cannot
// drift from the registry (an unregistered id throws), and a run under
// withProvenance records exactly which constants its answer rested on.
//
// Depletion (chain.depletionRate 0.15, chain.maxDrawdownFraction 0.5,
// chain.indirectDepletionShare 0.5) and the numerical floor
// (chain.capacityEpsilon 1e-4) are registered there with their status and what
// would settle them. The floor binds only when a residual falls below it; through
// 20.x siteFamiliarity sat at 0 in the tool path and was lifted to 1e-4 on every
// run, and since it left the vector in 21.0 no built-in persona starts below 0.1.
// The old CAPACITY_FLOOR (0.05)
// was removed 2026-10-21: nothing read it since proportional drawdown replaced
// the clamp on 2026-08-03.

/** Read every id in `ids` through param(); one object per call so the reads are recorded. */
function readParams<K extends string>(ids: Record<K, string>): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const k in ids) out[k] = param(ids[k]);
  return out;
}

const DEMAND_IDS = {
  animationSigmoidThreshold: 'chain.demand.animation.sigmoidThreshold',
  animationSigmoidScale: 'chain.demand.animation.sigmoidScale',
  animationChangeBlindness: 'chain.demand.animation.changeBlindness',
  animationEmotionalContagion: 'chain.demand.animation.emotionalContagion',
  distractorAnimationShare: 'chain.demand.distractor.animationShare',
  distractorVisualShare: 'chain.demand.distractor.visualShare',
  sustainedBase: 'chain.demand.sustained.base',
  sustainedDistractorGain: 'chain.demand.sustained.distractorGain',
  choiceAnchoringBias: 'chain.demand.choice.anchoringBias',
  choiceFearOfMissingOut: 'chain.demand.choice.fearOfMissingOut',
  choiceSocialProofSensitivity: 'chain.demand.choice.socialProofSensitivity',
  decisionRiskTolerance: 'chain.demand.decision.riskTolerance',
} as const;

const CHAIN_IDS = {
  missingTraitCapacity: 'chain.missingTraitCapacity',
  engagementAtSkim: 'chain.engagement.atSkim',
  engagementRange: 'chain.engagement.range',
  weightDeficit: 'chain.weightDeficit',
  weightSurplus: 'chain.weightSurplus',
  contentScaleGain: 'chain.contentScaleGain',
  depletionGate: 'chain.depletionGate',
  depletionRate: 'chain.depletionRate',
  indirectDepletionShare: 'chain.indirectDepletionShare',
  maxDrawdownFraction: 'chain.maxDrawdownFraction',
  capacityEpsilon: 'chain.capacityEpsilon',
  roundingScale: 'chain.roundingScale',
  patienceShare: 'chain.abandonment.patienceShare',
  resilienceShare: 'chain.abandonment.resilienceShare',
  toleranceGain: 'chain.abandonment.toleranceGain',
  toleranceFloor: 'chain.abandonment.toleranceFloor',
  abandonmentHillExponent: 'chain.abandonmentHillExponent',
} as const;

type ChainParams = Record<keyof typeof CHAIN_IDS, number>;

// ── Sigmoid Helper ──

/**
 * Standard logistic sigmoid for mapping raw page metrics to demand values.
 * The threshold and scale are hand-set hypotheses (see provenance/chain.ts),
 * chosen so typical web pages produce demands in [0.1, 0.9]; not calibrated.
 */
function sigmoid(raw: number, threshold: number, scale: number): number {
  // No exponent clamp. One was registered (chain.sigmoidExponentClamp, 500)
  // and could not change a value: x > 500 needs raw below zero, which the
  // input sanitiser forbids, and for x < -500 the plain form already returns
  // exactly 1. Math.exp overflows to Infinity, which this form maps to 0, not
  // NaN. Removed in 21.0 when the dead-constant test found it.
  const x = -(raw - threshold) / scale;
  return 1 / (1 + Math.exp(x));
}

// ── 1. Demand Distribution Computation ──

/**
 * Compute the 29-dimensional demand distribution from page metrics.
 *
 * Since Stage B and C the demand is law times against one time budget, d =
 * T / (T + tau) (demand-laws.ts, law.timeBudget): pointing (Fitts), choosing
 * (Cockburn et al.'s menu model), reading (Brysbaert), procedure (KLM). What
 * remains hand-set are the shares of those demands some traits take and the
 * motion and clutter curves, every one a hypothesis in provenance/chain.ts.
 * The text features (informationDensity, textDensity, word and sentence
 * length, lexical diversity, long and technical words) and navigationDepth
 * are reported on PageMetrics and drive no demand: reading time prices text,
 * and depth is a property of the path, not the page (research/stage-c-design.md).
 *
 * Traits not affected by any page feature receive demand = 0.0 (no demand).
 *
 * @param pageMetrics - Extracted page analysis metrics
 * @param options - The visit: siteFamiliarity, Cockburn et al.'s expertise e
 *   on the choosing time, the same for every persona scored in a run
 * @returns DemandDistribution with per-trait demand
 */
export function computeDemandDistribution(pageMetrics: PageMetrics, options?: DemandOptions): DemandDistribution {
  const D = readParams(DEMAND_IDS);
  const demands: Record<string, number> = {};

  // Initialize every dimension to zero demand
  for (const dim of DEMAND_DIMENSIONS) {
    demands[dim] = 0;
  }

  // Sanitize inputs — guard against NaN, undefined, negative
  const safe = (v: number | undefined, fallback: number = 0): number => {
    if (v === undefined || v === null || Number.isNaN(v)) return fallback;
    return Math.max(0, v);
  };

  const visCplx = safe(pageMetrics.visualComplexity);
  const animLevel = safe(pageMetrics.animationLevel);

  // ── The law times, each a demand against one budget ──
  // d = T / (T + tau), tau = law.timeBudget: 0 at no work, 0.5 at the budget.
  // No fallback: a PageMetrics without them was not derived from a measurement
  // (deriveMetrics) and has no motor, decision, procedure or reading demand to
  // give. interactiveElementCount and choiceCount stay on PageMetrics as
  // reported counts; no demand reads them now.
  const seconds = (k: 'pointingSeconds' | 'choosingSeconds' | 'choosingSecondsExpert' | 'readingSeconds' | 'procedureSeconds'): number => {
    const v = (pageMetrics as Partial<PageMetrics>)[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      throw new Error(`computeDemandDistribution: pageMetrics.${k} must be a finite number of seconds >= 0 (got ${String(v)}). Derive the metrics from a measurement (extractPageMetrics, deriveMetrics) or pass the law times to computeDemandFromRawMetrics.`);
    }
    return v;
  };
  // The visit. Cockburn, Gutwin & Greenberg (2007), Eq. 4: decision/search time
  // interpolates from novice linear search to the Hick-Hyman expert limit by
  // expertise e, because the expert's "visual search time decreases towards
  // zero". A first visit (e = 0) is the default and what the reference curve is
  // built at, and it reads the novice time alone, exactly as before.
  const e = options?.siteFamiliarity ?? 0;
  if (typeof e !== 'number' || !Number.isFinite(e) || e < 0 || e > 1) {
    throw new Error(`computeDemandDistribution: siteFamiliarity must be a number in [0, 1], Cockburn et al.'s expertise e (got ${String(e)})`);
  }
  const novice = seconds('choosingSeconds');
  const expert = seconds('choosingSecondsExpert');
  const pointingDemand = timeDemand(seconds('pointingSeconds'));
  // The decision dispositions keep the first-visit choosing time on every run
  // (Stage B). Familiarity acts on the finding abilities below instead: the
  // dispositions bill surplus, so a shorter choosing time would turn a small
  // deficit into billed surplus, and measured on the reference pages a familiar
  // visit then cost MORE than a first one on 72 of 513 for the typical user.
  // Knowing a site cannot make it harder.
  const decisionDemand = timeDemand(novice);
  // What familiarity shortens: the search for where things are, the work the
  // cognitiveLoad abilities are asked. At e = 0 this is 1 x novice + 0, the
  // novice time to the last bit, so a first visit is unchanged.
  const findingDemand = timeDemand((1 - e) * novice + e * expert);
  const readingDemand = timeDemand(seconds('readingSeconds'));
  const procedureDemand = timeDemand(seconds('procedureSeconds'));

  // Demand is written only to dimensions some layer reads. Through 20.x these
  // curves also wrote readingTendency, mentalModelFlexibility,
  // interruptRecovery, metacognitivePlanning, persistence and motorPrecision,
  // none of which is in a layer, so those terms (and eight registered weights)
  // changed no number. Removed in 21.0; the dimensions themselves remain.

  // ── visualComplexity → changeBlindness
  const visDemand = visCplx; // already 0-1 from logScale
  demands.changeBlindness = Math.max(demands.changeBlindness, visDemand);

  // ── procedure (KLM M per entry step) → proceduralFluency
  demands.proceduralFluency = Math.max(demands.proceduralFluency, procedureDemand);

  // ── reading → patience (Stage C)
  //
  // patience is "tolerance for delays, loading, friction before abandoning",
  // and its registered measure is a time to abandonment. It takes the reading
  // demand whole, so a value reads as tolerated reference reading time,
  // tau c / (1 - c): 0.5 tolerates the budget itself, the median first-visit
  // stay the budget is. Through 20.x it took 0.7 of textDensity (a nested text
  // count per unit area) and 0.7 of sentence length, two hand-set shares of two
  // text features the reading law now prices.
  demands.patience = Math.max(demands.patience, readingDemand);

  // ── animationLevel → changeBlindness, emotionalContagion
  //
  // ZERO AT REST, as of 21.0. The logistic is centred at the threshold (0.3),
  // so at animationLevel 0 it already reads 0.119, and that offset was demand:
  // a page with nothing moving asked ~0.107 of changeBlindness and ~0.083 of
  // emotionalContagion and fed distractor pressure, so an empty page had a
  // non-zero raw cost. The curve is now shifted and rescaled by its own value at
  // 0: still monotone in animationLevel, 0 at rest, below 1 and approaching it.
  // No new constant: the offset is the registered curve evaluated at 0.
  const animRaw = sigmoid(animLevel, D.animationSigmoidThreshold, D.animationSigmoidScale);
  const animAtRest = sigmoid(0, D.animationSigmoidThreshold, D.animationSigmoidScale);
  const animDemand = animAtRest < 1 ? Math.max(0, (animRaw - animAtRest) / (1 - animAtRest)) : 0;
  demands.changeBlindness = Math.max(demands.changeBlindness, animDemand * D.animationChangeBlindness);
  demands.emotionalContagion = Math.max(demands.emotionalContagion, animDemand * D.animationEmotionalContagion);

  // ── textDensity × distractor pressure → sustainedAttention
  //
  // How much attention the page asks you to HOLD, as opposed to how hard its
  // words are to decode (readingCapacity) or how much of it you choose to read
  // (readingTendency, which modulates demand below). Gated on text: a page with
  // no prose asks nothing here, however busy it is, because there is no line to
  // lose your place in.
  //
  // Multiplicative rather than this file's usual `max`, deliberately -- the
  // interaction IS the mechanism. A long article with nothing moving on it is
  // readable; the same article beside an autoplaying carousel is where the
  // re-reading happens. Two `max` terms would score those two pages the same.
  //
  // Animation dominates the distractor term because moving peripheral content
  // captures attention involuntarily, while static clutter merely competes for
  // it (Yantis & Jonides 1990 on abrupt-onset capture).
  //
  // The 0.7 base sits deliberately BELOW readingCapacity's 0.9: on a page with
  // nothing moving, decoding is the larger demand of text and attention is the
  // secondary one. The distractor multiplier is what lets it overtake decoding,
  // and only on a page that has earned it. Without that ordering this dimension
  // re-creates the exact inversion that removing readingTendency fixed --
  // measured: at a flat 1.0 base, ADHD outscored dyslexic on readability on a
  // page with animationLevel 0, which is the wrong answer.
  const distractorPressure = Math.min(1, animDemand * D.distractorAnimationShare + visDemand * D.distractorVisualShare);
  // `max(textDens, infoDensity)`, not `textDens` alone -- the same base
  // readingCapacity uses below, and for the same reason.
  //
  // textDensity is AREA-NORMALISED: logScale(textLength / (viewportArea * 0.001)),
  // and at full_page the divisor is the whole document height. So on a tall page
  // it FALLS as the page grows -- measured on a 6.7-screen page, 0.698 -> 0.492 --
  // and since it was the multiplicative base here, attentional reading cost fell
  // with it, to zero for two of four personas. A longer page came out SAFER on
  // this layer, which is the direction the whole scoring model forbids.
  //
  // Attentional reading cost is absolute: twice the prose is twice the
  // line-holding, however it is spread. informationDensity is logScale(textLength,
  // 5000) with no area term -- it RISES 0.587 -> 0.799 on the same measurement --
  // which is exactly why readability moved correctly while its sibling inverted.
  // Sharing the base makes the two halves of reading agree about how much there is
  // to read; the 0.7 vs 0.9 coefficients still order them.
  //
  // NOT applied to visualComplexity, whose fall has a different cause: its inputs
  // (visualComplexity, animationLevel) are counts and RISE with page size. It falls
  // because its traits are surplus-BILLED, so rising demand shrinks the surplus gap
  // and the 0.3-weighted cost with it. Same symptom, unrelated mechanism, and it
  // needs its own decision rather than this one applied twice.
  //
  // STAGE B: the base is the reading demand (reading seconds against the time
  // budget), which is absolute in the amount of prose, the property the
  // max(textDensity, informationDensity) base above was chosen for.
  const sustainDemand = Math.min(1, readingDemand * D.sustainedBase * (1 + distractorPressure * D.sustainedDistractorGain));
  demands.sustainedAttention = Math.max(demands.sustainedAttention, sustainDemand);

  // ── choosing (novice linear search, Cockburn et al. 2007) → the decision traits
  // satisficing takes the whole decision demand; the others hand-set shares of it.
  demands.satisficing = Math.max(demands.satisficing, decisionDemand);
  demands.anchoringBias = Math.max(demands.anchoringBias, decisionDemand * D.choiceAnchoringBias);
  demands.fearOfMissingOut = Math.max(demands.fearOfMissingOut, decisionDemand * D.choiceFearOfMissingOut);
  demands.socialProofSensitivity = Math.max(demands.socialProofSensitivity, decisionDemand * D.choiceSocialProofSensitivity);
  demands.riskTolerance = Math.max(demands.riskTolerance, decisionDemand * D.decisionRiskTolerance);

  // ── choosing → comprehension, workingMemory, informationForaging, transferLearning (Stage C)
  //
  // The four abilities of cognitiveLoad take the choosing demand whole, as
  // satisficing does on a first visit, so each value reads as tolerated
  // reference choosing time. On a familiar run they take it at the run's e.
  // Through 20.x they read text features (and siteFamiliarity a
  // navigation-depth constant); see LAYER_DEFINITIONS.
  demands.comprehension = Math.max(demands.comprehension, findingDemand);
  demands.workingMemory = Math.max(demands.workingMemory, findingDemand);
  demands.informationForaging = Math.max(demands.informationForaging, findingDemand);
  demands.transferLearning = Math.max(demands.transferLearning, findingDemand);

  // Reading capacity is demanded by the time the prose takes to read, and motor
  // capacity by the time its targets take to acquire, each against the same
  // budget as the persona's rate-ratio capacity (cognitive-models.ts), so a
  // deficit means the persona's own time exceeds the budget. A page with no
  // prose asks nothing of decoding, one with no controls nothing of pointing.
  demands.readingCapacity = Math.max(demands.readingCapacity, readingDemand);
  demands.motorCapacity = Math.max(demands.motorCapacity, pointingDemand);

  // Clamp all demands to [0, 1]
  for (const dim of DEMAND_DIMENSIONS) {
    demands[dim] = Math.max(0, Math.min(1, demands[dim]));
  }

  // Per-dimension demand variance was computed here from 41 hand-set
  // coefficients and returned, but nothing in the chain or any tool read it, so
  // it changed no score. Removed in 21.0 rather than registered as 41 more
  // hypotheses that do nothing. (2026-10-21)
  //
  // The scope travels with the demand so totalCTC can be ranked against
  // reference pages measured the same way, without every caller having to
  // repeat a scope it already gave extractPageMetrics.
  return pageMetrics.scope ? { demands, scope: pageMetrics.scope } : { demands };
}

// ── 2. Sequential Transport Chain ──

/**
 * Resolve a trait value from the persona's trait record.
 * Falls back to chain.missingTraitCapacity (0.5, a hypothesis) for missing traits.
 */
/**
 * A persona's capacity vector over DEMAND_DIMENSIONS, exactly as the chain reads
 * it at the start of a page: each trait through traitValue (clamped to [0, 1],
 * missing or non-numeric traits at chain.missingTraitCapacity).
 * The Wasserstein-DRO bound (dro-bound.ts) works on these vectors.
 */
export function capacityVector(traits: Record<string, number | string>): Record<string, number> {
  const P = readParams(CHAIN_IDS);
  const out: Record<string, number> = {};
  for (const dim of DEMAND_DIMENSIONS) out[dim] = traitValue(traits, dim, P);
  return out;
}

function traitValue(traits: Record<string, number | string>, trait: string, P: ChainParams): number {
  const v = traits?.[trait];
  // A string attentionPattern ("targeted", "f-pattern", ...) used to map to five
  // hand-set levels. attentionPattern is in no layer since 21.0, so the levels
  // moved nothing and were removed; a non-numeric trait reads as missing.
  if (typeof v === 'number' && !isNaN(v)) return Math.max(0, Math.min(1, v));
  return P.missingTraitCapacity;
}

/**
 * Schwartz Value → Trait Demand Modulation Coefficients
 *
 * Each entry maps a Schwartz value to the cognitive traits it amplifies or
 * dampens in the demand distribution. The coefficient represents how much
 * a high value score (1.0) amplifies (+) or dampens (-) the demand on that trait.
 * Every coefficient is a hand-set hypothesis registered in provenance/chain.ts
 * (the citations below motivate a direction, not a number) and is read
 * through param() by id.
 *
 * Theoretical basis:
 * - Security-driven personas demand MORE trustCalibration (Fogg 2003)
 * - Achievement-driven personas demand LESS satisficing (Simon 1956 — they optimize)
 * - Conformity-driven personas amplify socialProof demands (Cialdini 2001)
 * - Stimulation-driven personas amplify curiosity but deplete patience faster
 *
 * @see Schwartz (1992) "Universals in the content and structure of values"
 * @see Section 4.2 of "Cognitive Optimal Transport: A Unified Framework"
 * @since v18.54.0
 *
 * Exported so cognitive_effort's useValues description can be checked against
 * it; this table is the only place values reach a transport score.
 */
export const VALUE_DEMAND_MODULATION: Array<{
  value: string;
  trait: string;
  coefficient: string; // provenance id; positive = amplifies demand, negative = dampens
  layer: string;       // the layer whose trait this modulates (a test checks the trait is in it)
}> = [
  // Seven entries were removed in 21.0 because their trait is in no layer, so
  // the modulated demand was never read: stimulation and conformity on
  // attentionPattern, security on trustCalibration, stimulation on curiosity,
  // selfDirection on metacognitivePlanning, tradition on mentalModelFlexibility
  // and universalism on readingTendency.

  // ── Visual Complexity Layer Modulations ──
  // Stimulation → reduces changeBlindness threshold (novelty-seekers notice changes more)
  { value: 'stimulation', trait: 'changeBlindness', coefficient: 'chain.valueModulation.stimulation.changeBlindness', layer: 'visualComplexity' },
  // Security → amplifies changeBlindness demand (vigilant scanners notice more changes)
  { value: 'security', trait: 'changeBlindness', coefficient: 'chain.valueModulation.security.changeBlindness', layer: 'visualComplexity' },

  // ── Decision Layer ──
  // Achievement → reduces satisficing demand (optimizers don't settle for "good enough")
  { value: 'achievement', trait: 'satisficing', coefficient: 'chain.valueModulation.achievement.satisficing', layer: 'decision' },
  // Achievement → increases riskTolerance capacity (confident decision-makers)
  { value: 'achievement', trait: 'riskTolerance', coefficient: 'chain.valueModulation.achievement.riskTolerance', layer: 'decision' },

  // Conformity → amplifies social proof demand (Cialdini 2001: need validation from others)
  { value: 'conformity', trait: 'socialProofSensitivity', coefficient: 'chain.valueModulation.conformity.socialProofSensitivity', layer: 'decision' },
  // Conformity → amplifies anchoring (defer to first/default option)
  { value: 'conformity', trait: 'anchoringBias', coefficient: 'chain.valueModulation.conformity.anchoringBias', layer: 'decision' },

  // Self-Direction → reduces conformity-related demand (independent thinkers)
  { value: 'selfDirection', trait: 'socialProofSensitivity', coefficient: 'chain.valueModulation.selfDirection.socialProofSensitivity', layer: 'decision' },

  // Power → reduces fear of missing out (confident, not swayed by urgency)
  { value: 'power', trait: 'fearOfMissingOut', coefficient: 'chain.valueModulation.power.fearOfMissingOut', layer: 'decision' },

  // ── Frustration Layer ──
  // Stimulation → depletes patience (novelty-seekers abandon monotonous pages).
  // Labelled `motor` through 20.x; patience is in frustration.
  { value: 'stimulation', trait: 'patience', coefficient: 'chain.valueModulation.stimulation.patience', layer: 'frustration' },

  // Benevolence → reduces emotionalContagion cost (emotionally regulated)
  { value: 'benevolence', trait: 'emotionalContagion', coefficient: 'chain.valueModulation.benevolence.emotionalContagion', layer: 'frustration' },
];

/**
 * Compute the Sequential Cognitive Transport Cost (CTC).
 *
 * Unlike additive cognitive load models, the sequential chain depletes
 * capacity at each processing layer. A user who spends cognitive resources
 * on visual clutter and motion has LESS available for subsequent decision-making.
 *
 * The algorithm processes the eight layers of LAYER_DEFINITIONS in order:
 *   visualComplexity -> cognitiveLoad -> decision -> motor -> motorProcedure
 *   -> frustration -> readability -> readingAttention
 *
 * Each layer:
 * 1. Applies Schwartz value modulation to demand (v18.54.0)
 * 2. Computes asymmetric transport cost (deficit is expensive, surplus is cheap)
 * 3. Depletes residual capacity proportional to cost incurred
 * 4. Records the remaining capacity for downstream layers
 *
 * @param persona - OTCognitiveProfile with trait values
 * @param demand - 29D demand distribution from page analysis
 * @param options - Enable/disable asymmetric costs, interaction terms, and value modulation
 * @returns Complete sequential transport result with per-layer breakdown
 */
export function computeSequentialCTC(
  persona: OTCognitiveProfile,
  demand: DemandDistribution,
  options?: ChainOptions,
): SequentialTransportResult {
  const cost = transportChain(persona, demand, options);
  const referenceScope: MetricScope = demand.scope ?? 'viewport';
  const reference = ctcReferenceCurve(referenceScope, options);
  // totalCTC depends on every constant the curve was built from, the demand
  // curves included. Re-read them here so a run under withProvenance records
  // the same dependencies whether the curve was built in this call or cached.
  for (const id of reference.reads) param(id);
  // Read on every call for the same reason, and checked: the registered page
  // count must be the count the curve was built from, so a reference file
  // swapped without its registry entry is refused rather than ranked against.
  const registeredPages = param(`ctcReference.${referenceScope}`);
  if (registeredPages !== reference.pages) {
    throw new Error(`ctcReference.${referenceScope} registers ${registeredPages} pages; the shipped reference has ${reference.pages}`);
  }
  const totalCTC = percentileAt(reference.curve, cost.rawCTC);
  return { ...cost, totalCTC, totalCTCInterval: intervalAt(reference.interval, cost.rawCTC, totalCTC), referenceScope };
}

/** Options every chain entry point takes. */
export interface ChainOptions {
  asymmetric?: boolean;
  interactions?: boolean;
  schwartzValues?: Record<string, number>;
  /**
   * Capacity carried in from a previous screen. Omit to start from the
   * persona's full trait vector, which is what a single-page run does.
   *
   * This is the whole mechanism behind sequential scoring: a screen is not a
   * fresh persona, it is the same account after everything above it has been
   * spent. (2026-08-03)
   */
  carriedCapacity?: Record<string, number>;
}

/** The chain without its output scale: every result field except totalCTC, its interval and referenceScope. */
type ChainCost = Omit<SequentialTransportResult, 'totalCTC' | 'totalCTCInterval' | 'referenceScope'>;

/**
 * The transport chain itself: demand against capacity, layer by layer, ending
 * at rawCTC. computeSequentialCTC adds the percentile; the reference curve is
 * built from this function directly, since ranking the reference against
 * itself would need the curve it is building. Only `traits` is read from the
 * persona.
 */
function transportChain(
  persona: Pick<OTCognitiveProfile, 'traits'>,
  demand: DemandDistribution,
  options?: ChainOptions,
): ChainCost {
  const P = readParams(CHAIN_IDS);
  const useAsymmetric = options?.asymmetric !== false; // default true
  const useInteractions = options?.interactions !== false; // default true
  const values = options?.schwartzValues;

  // Apply Schwartz value modulation to demand distribution (v18.54.0)
  // Values amplify or dampen demands on specific traits, changing what the page "asks" of the user
  const modulatedDemand: DemandDistribution = {
    demands: { ...demand.demands },
  };

  // readingTendency modulates DEMAND, not capacity.
  //
  // It was in the readability layer as a capacity and inverted it: an ADHD
  // persona who skims (0.2) scored a large capacity deficit against text
  // demand, so a text-dense page cost them MORE than a dyslexic reader at 0.4,
  // while the same run reported the dyslexic reader at 157 WPM against 204.
  //
  // The trait is not an ability, it is a STRATEGY -- its own criteria are
  // "skims, reads carefully, scans for buttons" -- and skimming is how someone
  // spends less effort on text, not evidence they cannot decode it. On the
  // demand side that reads correctly: a skimmer engages less of the page's text,
  // a careful reader engages more.
  //
  // Bounded to +/-25% around neutral, for two reasons. A skimmer still has to
  // find the content, so demand cannot fall toward zero. And an unbounded
  // modulator would recreate the very inversion this fixes by letting strategy
  // outweigh decoding ability -- verified it does not: dyslexic still costs more
  // than ADHD on a text-dense page after this. (2026-08-02)
  const readingTendency = persona.traits?.readingTendency;
  if (typeof readingTendency === "number") {
    const engagement = P.engagementAtSkim + readingTendency * P.engagementRange; // 0.75 at pure skim, 1.25 at careful
    // ATTENTIONAL demand only. Applied to `readingCapacity` as well for one
    // commit, and that was wrong on the merits as well as breaking a contract.
    //
    // Engagement is how much of the page you read. That scales how long you
    // must hold the line -- genuinely an attentional quantity -- but it does
    // not change how hard the words you do read are to decode. Skimming reduces
    // exposure, not difficulty.
    //
    // It also made decoding demand persona-specific, which silently voided the
    // `legibilityQuality` contract the readability layer prints in its own
    // output: measured, `distracted-user` at legibility 0.619 paid 0.000 while
    // `careful-reader` at 0.724 paid 0.016 -- lower legibility, lower cost --
    // purely because the skimmer's demand had been scaled down. A contract
    // stated cross-persona has to be computed against a demand that does not
    // vary by persona. (2026-08-02)
    if (modulatedDemand.demands.sustainedAttention) {
      modulatedDemand.demands.sustainedAttention = Math.max(0, Math.min(1,
        modulatedDemand.demands.sustainedAttention * engagement));
    }
  }

  if (values && Object.keys(values).length > 0) {
    const demandFloor = param('chain.valueModulation.demandFloor');
    for (const mod of VALUE_DEMAND_MODULATION) {
      // Read before the skip so a run records every coefficient it could have used.
      const coefficient = param(mod.coefficient);
      const valueScore = values[mod.value];
      if (valueScore === undefined || valueScore === null) continue;

      const currentDemand = modulatedDemand.demands[mod.trait] ?? 0;
      // Modulation: demand += coefficient * valueScore * currentDemand
      // High value score amplifies the modulation effect
      // Multiplicative on current demand, floored so a zero-demand trait still moves a little
      const modulation = coefficient * valueScore * Math.max(demandFloor, currentDemand);
      modulatedDemand.demands[mod.trait] = Math.max(0, Math.min(1, currentDemand + modulation));
    }
  }

  // Initialize residual capacity from persona traits
  const residualCapacity: Record<string, number> = {};
  for (const dim of DEMAND_DIMENSIONS) {
    residualCapacity[dim] = options?.carriedCapacity?.[dim] ?? traitValue(persona.traits, dim, P);
  }

  const layers: LayerResult[] = [];
  const traitCosts: Record<string, number> = {};
  let totalDeficit = 0;
  let totalSurplus = 0;
  let additiveCTC = 0;

  // Initialize per-trait costs to zero
  for (const dim of DEMAND_DIMENSIONS) {
    traitCosts[dim] = 0;
  }

  // Process each layer sequentially
  for (const layerDef of LAYER_DEFINITIONS) {
    let layerCost = 0;
    let layerDeficit = 0;
    let layerSurplus = 0;

    // Compute transport cost for this layer's traits (using modulated demands)
    //
    // Headroom is tracked alongside cost because a surplus-free layer reports a
    // bare 0 across its whole upper range and stops discriminating there. A
    // reader at 91% legibility and one at 99% both cost 0 on a page neither of
    // them struggles with -- true, and useless as a signal. Headroom is the
    // spare capacity that produced the zero, so the upper range is readable
    // without inventing a cost that is not there. (2026-08-03, BUG-18)
    let layerHeadroom = 0;
    for (const trait of layerDef.traits) {
      const d = modulatedDemand.demands[trait] ?? 0;
      const c = residualCapacity[trait] ?? P.missingTraitCapacity;
      const gap = d - c;

      let cost: number;
      if (gap > 0) {
        // Deficit: demand exceeds capacity — expensive
        cost = (useAsymmetric ? P.weightDeficit : 1.0) * gap * gap;
        layerDeficit += cost;
      } else {
        // Surplus: capacity exceeds demand — cheap
        const surplusWeight = SURPLUS_FREE_DIMENSIONS.has(trait) ? 0 : P.weightSurplus;
        cost = (useAsymmetric ? surplusWeight : 1.0) * gap * gap;
        layerSurplus += cost;
      }

      if (gap < 0) layerHeadroom += -gap;
      layerCost += cost;
      traitCosts[trait] = (traitCosts[trait] ?? 0) + cost;
    }
    layerHeadroom = layerHeadroom / Math.max(1, layerDef.traits.length);

    // Scale layer cost by demand presence — empty pages shouldn't produce high costs
    const layerDemandMagnitude = layerDef.traits.reduce(
      (sum, t) => sum + (modulatedDemand.demands[t] ?? 0), 0
    ) / layerDef.traits.length;
    const contentScale = Math.min(1.0, layerDemandMagnitude * P.contentScaleGain); // 0-1 scale, saturates at demand=0.33
    layerCost *= contentScale;
    layerDeficit *= contentScale;
    layerSurplus *= contentScale;

    totalDeficit += layerDeficit;
    totalSurplus += layerSurplus;
    additiveCTC += layerCost;

    // Deplete capacity for next layers (only when page has meaningful content)
    // Each trait in this layer loses capacity proportional to the layer's total cost
    const DEPLETION_RATE = P.depletionRate;
    const MAX_DRAWDOWN_FRACTION = P.maxDrawdownFraction;
    const INDIRECT_DEPLETION_SHARE = P.indirectDepletionShare;
    const CAPACITY_EPSILON = P.capacityEpsilon;
    // What this layer actually removed, summed over every dimension from the
    // balances themselves (LayerResult.capacityConsumed). It stays 0 when the
    // gate below keeps the layer from depleting.
    let capacityConsumed = 0;
    if (contentScale > P.depletionGate) {
      // PROPORTIONAL DRAWDOWN, not subtraction against a clamp.
      //
      // Capacity used to be spent as a flat amount and clamped at
      // CAPACITY_FLOOR, which meant the account did not deplete -- it hit a
      // wall and stopped carrying information. Measured on a dense page in a
      // single eight-layer run: `intellectual-disability` finished with TEN
      // dimensions pinned at exactly 0.05 and `elderly-user` with five. Every
      // layer after that point saw an identical capacity vector, so the chain
      // could no longer tell them apart. The personas the accessibility model
      // exists to describe were the ones whose vector collapsed to a constant.
      //
      // Spending a FRACTION of what remains asymptotes toward zero instead of
      // reaching it. A full account gives up more per unit cost than an empty
      // one, the balance stays strictly ordered and strictly decreasing, and
      // every later step is still distinguishable from the one before it.
      // Measured over 112 steps: the clamped form produced 1 distinct value
      // across the final four screens, this produces 32 of 32.
      //
      // This also makes the sequential model well-posed. Chaining screens is
      // now just more draws on the same account, with no wall to hit at screen
      // three and no `k` anywhere in the arithmetic. (2026-08-03)
      const drawFraction = Math.min(MAX_DRAWDOWN_FRACTION, DEPLETION_RATE * layerCost);
      for (const trait of layerDef.traits) {
        const before = residualCapacity[trait];
        residualCapacity[trait] *= (1 - drawFraction);
        residualCapacity[trait] = Math.max(CAPACITY_EPSILON, residualCapacity[trait]);
        // A floor lift (a dimension below CAPACITY_EPSILON raised to it) is not a draw.
        capacityConsumed += Math.max(0, before - residualCapacity[trait]);
      }

      // Also deplete shared traits that appear in later layers
      // (cross-layer fatigue: cognitive exhaustion bleeds across boundaries)
      const indirectFraction = Math.min(MAX_DRAWDOWN_FRACTION, (DEPLETION_RATE * INDIRECT_DEPLETION_SHARE) * layerCost);
      for (const dim of DEMAND_DIMENSIONS) {
        if (!layerDef.traits.includes(dim)) {
          // Indirect depletion at half rate
          const before = residualCapacity[dim];
          residualCapacity[dim] *= (1 - indirectFraction);
          residualCapacity[dim] = Math.max(CAPACITY_EPSILON, residualCapacity[dim]);
          capacityConsumed += Math.max(0, before - residualCapacity[dim]);
        }
      }
    }

    layers.push({
      name: layerDef.name,
      transportCost: layerCost,
      capacityConsumed,
      residualCapacity: { ...residualCapacity },
      // Mean spare capacity across this layer's dimensions. Only meaningful
      // when the cost is at or near zero; above that the cost carries the
      // signal itself.
      headroom: Math.round(layerHeadroom * P.roundingScale) / P.roundingScale,
    });
  }

  // Compute interaction terms
  const interactions: Record<string, number> = {};
  let interactionTotal = 0;

  if (useInteractions) {
    const layerCostMap: Record<string, number> = {};
    for (const layer of layers) {
      layerCostMap[layer.name] = layer.transportCost;
    }

    for (const pair of INTERACTION_PAIRS) {
      const costA = layerCostMap[pair.a] ?? 0;
      const costB = layerCostMap[pair.b] ?? 0;
      const interaction = costA * costB * param(pair.weight);
      const key = `${pair.a}x${pair.b}`;
      interactions[key] = interaction;
      interactionTotal += interaction;
    }
  }

  // Total CTC = sum of layer costs + interaction terms
  // Note: additiveCTC is layers-only (no interactions, no sequential effects)
  // The sequential effect is already embedded in layer costs via capacity depletion
  const rawCTC = layers.reduce((sum, l) => sum + l.transportCost, 0) + interactionTotal;

  // No normalisation here. Through 21.0 totalCTC was a logistic of rawCTC,
  // slope 2.5 and centre 1.2 (chain.ctcSigmoidSlope / chain.ctcSigmoidCentre,
  // both hand-set), which nothing tied to where real pages fall: at viewport
  // scope it put half of them between 0.055 and 0.133. computeSequentialCTC
  // now ranks rawCTC against real pages instead.

  // Find bottleneck layer
  let maxLayerCost = 0;
  let bottleneckLayer = layers[0]?.name ?? LAYER_DEFINITIONS[0].name;
  for (const layer of layers) {
    if (layer.transportCost > maxLayerCost) {
      maxLayerCost = layer.transportCost;
      bottleneckLayer = layer.name;
    }
  }

  // Compute abandonment risk.
  //
  // A page that costs this persona NOTHING must produce a risk of zero. The
  // previous shape could not: it was a logistic centred at 1.5x tolerance, and
  // a logistic evaluated below its centre still returns a substantial value, so
  // every persona carried a floor that no page could lower. Measured:
  //
  //   persona          risk at deficit 0    real range over these pages (0-0.28)
  //   impatient-user               40%              40% -> 52%
  //   cognitive-adhd               34%              34% -> 45%
  //   power-user                   25%              25% -> 34%
  //   elderly-user                 11%              11% -> 16%
  //   perfect patience              8%                    --
  //
  // So "39% abandonment" beside "should handle this page comfortably" was never
  // two independent measures disagreeing. It was one number that is ~85% floor
  // and ~15% page. The reported fix -- fold abandonment into the verdict --
  // would have made it worse, importing a near-constant into the sentence so
  // that every ADHD run read as risky regardless of the page.
  //
  // Replaced with a Hill function: zero cost gives exactly zero risk, cost
  // equal to tolerance gives 50%, and it approaches 1 from below. The
  // "centre at 1.5x blended patience" intent is unchanged and so is the
  // persona ordering; what is gone is the offset. (2026-08-03, BUG-17)
  //
  // UNMET DEMAND ONLY, as of 21.0. Through 20.x the hazard's input was
  // deficit - 0.3 x surplus: billed surplus (a maximiser over-deliberating a
  // trivial page) was RELIEF here while the same surplus was COST in totalCTC.
  // One quantity cannot be both. A disposition surplus is effort spent, not
  // comfort, so it no longer offsets the deficit; chain.abandonment.surplusRelief
  // is gone. The per-screen hazard in computeSequentialScrollCTC reads this
  // value, so it changed with it.
  //
  // RESIDUAL TOLERANCE, as of 21.0. The page spends patience in the
  // frustration layer and drains resilience through cross-layer depletion;
  // judging abandonment against the persona as it ARRIVED treated that spending
  // as free. Tolerance now comes from what the page left (residualCapacity at
  // the end of the layer loop), so a later screen in a scroll is judged against
  // the smaller budget it actually has.
  const patienceCapacity = residualCapacity.patience;
  const resilienceCapacity = residualCapacity.resilience;
  const effectivePatience = patienceCapacity * P.patienceShare + resilienceCapacity * P.resilienceShare; // blended tolerance
  const unmetDemand = totalDeficit;
  // Floored so a persona with no patience at all does not divide by zero and
  // read as certain abandonment on a blank page.
  const tolerance = Math.max(P.toleranceFloor, effectivePatience * P.toleranceGain);
  // The same registry value ABANDONMENT_HILL_EXPONENT exports; read here so the
  // dependency is recorded per run.
  const ABANDONMENT_STEEPNESS = P.abandonmentHillExponent;
  const abandonmentRisk = unmetDemand <= 0 ? 0 : Math.max(0, Math.min(1,
    Math.pow(unmetDemand, ABANDONMENT_STEEPNESS) /
    (Math.pow(unmetDemand, ABANDONMENT_STEEPNESS) + Math.pow(tolerance, ABANDONMENT_STEEPNESS))
  ));

  return {
    // The un-normalized cost, exposed because totalCTC is a PERCENTILE of it
    // and the two are not interchangeable. Every ratio against additiveCTC has
    // to use this one: additiveCTC is a raw sum, totalCTC is a rank in 0-1, and
    // dividing one by the other compares different units. (2026-08-02)
    rawCTC,
    layers,
    interactions,
    additiveCTC,
    deficitCost: totalDeficit,
    surplusCost: totalSurplus,
    traitCosts,
    bottleneckLayer,
    abandonmentRisk,
    remainingCapacity: { ...residualCapacity },
  };
}

// ── Output scale: the reference curve ──

/** The curve totalCTC is read from, for one scope and option set, and what it was built from. */
export interface ReferenceCurve {
  scope: MetricScope;
  asymmetric: boolean;
  interactions: boolean;
  /** Graded reference pages at this scope. */
  pages: number;
  /** Built-in personas pooled on every page. */
  personas: number;
  /**
   * Every registry id the build read: the chain's constants (demand curves
   * included), the page-metric constants the reference pages were derived and
   * measured with, the reference's page count and the interval's settings.
   */
  reads: readonly string[];
  curve: PercentileCurve;
  /** The bootstrap interval of the curve, precomputed on a grid of raw costs. */
  interval: PercentileInterval;
}

const referenceCurves = new Map<string, ReferenceCurve>();
const overriddenReferenceCurves = new WeakMap<object, Map<string, ReferenceCurve>>();

/**
 * The percentile curve for one scope and option set: rawCTC of every graded
 * reference page (ctc-reference.ts) for every built-in persona, through this
 * chain, pooled. Each page's metrics are derived from its stored raw
 * measurement (deriveMetrics) inside the build, so the page-metric
 * normalisers move the curve exactly as the chain's constants do.
 *
 * WHICH OPTIONS SELECT A CURVE. `asymmetric` and `interactions` change the
 * cost function, so each pair has its own curve: a symmetric raw cost ranked
 * among asymmetric ones would compare two different quantities.
 * `schwartzValues` and `carriedCapacity` do not. Both describe the person
 * being scored (what they value, what earlier screens left them), not the
 * yardstick, and a curve that moved with them would cancel part of the effect
 * it is there to show. So a values-modulated score, and every screen after the
 * first in a scroll, are ranked against the reference population as it
 * arrives at a page. cognitive_effort's useValues edits demand before the chain
 * runs, which lands in the same place.
 *
 * COST AND CACHE. One build is one deriveMetrics per page, one chain run per
 * page per persona, and the page bootstrap (ctcReference.interval.*), under a
 * second for the whole reference; cached per scope and option set for the
 * life of the process, so every later score pays two binary searches. While a
 * test overrides registered constants (activeOverrides() is non-null) a curve
 * is cached against that override object instead: a change to any chain or
 * page-metric constant re-derives the curve rather than reusing one built
 * under other constants.
 */
export function ctcReferenceCurve(
  scope: MetricScope,
  options?: { asymmetric?: boolean; interactions?: boolean },
): ReferenceCurve {
  const asymmetric = options?.asymmetric !== false;
  const interactions = options?.interactions !== false;
  const overrides = activeOverrides();
  let cache = referenceCurves;
  if (overrides) {
    cache = overriddenReferenceCurves.get(overrides) ?? new Map<string, ReferenceCurve>();
    overriddenReferenceCurves.set(overrides, cache);
  }
  const key = `${scope}|${asymmetric}|${interactions}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const population = referencePopulation();
  const { result: { costs, pages, settings }, ids } = readsOf(() => {
    const raws = referenceRaw(scope);
    // Page-major, every persona of a page together: the bootstrap resamples pages.
    const out = new Float64Array(raws.length * population.length);
    let k = 0;
    for (const raw of raws) {
      const demand = computeDemandDistribution(deriveMetrics(raw));
      for (const persona of population) out[k++] = transportChain(persona, demand, { asymmetric, interactions }).rawCTC;
    }
    const settings = {
      replicates: param('ctcReference.interval.replicates'),
      seed: param('ctcReference.interval.seed'),
      level: param('ctcReference.interval.level'),
      grid: param('ctcReference.interval.grid'),
    };
    return { costs: out, pages: raws.length, settings };
  });
  const curve = percentileCurve(costs);
  const built: ReferenceCurve = {
    scope, asymmetric, interactions,
    pages, personas: population.length,
    reads: [...ids].sort(),
    curve,
    interval: bootstrapPercentileInterval(costs, population.length, settings),
  };
  cache.set(key, built);
  return built;
}

// ── 3. Convenience: Full COT Pipeline ──

/**
 * End-to-end Cognitive Optimal Transport computation.
 *
 * Extracts page metrics from a live Playwright page, computes the
 * 29D demand distribution, and runs the full sequential transport chain.
 *
 * This is the primary entry point for MCP tools that need a single
 * CTC score with full breakdown.
 *
 * @param persona - OTCognitiveProfile with trait values
 * @param page - Playwright Page object (or any object with evaluate())
 * @returns Complete sequential transport result
 */
export async function computeFullCOT(
  persona: OTCognitiveProfile,
  page: any,
): Promise<SequentialTransportResult> {
  // Extract page metrics via Playwright's page.evaluate()
  const metrics = await extractPageMetrics(page);

  // Compute 29D demand distribution
  const demand = computeDemandDistribution(metrics);

  // Run sequential transport chain with full options
  return computeSequentialCTC(persona, demand, {
    asymmetric: true,
    interactions: true,
  });
}

// ── 4. Utility Exports ──

/**
 * Compute demand distribution from raw metric values (no page required).
 * Useful for testing, simulation, and sensitivity analysis.
 *
 * informationDensity, textDensity and navigationDepth are carried onto the
 * PageMetrics as reported values; since Stage C no demand reads them.
 * choosingSecondsExpert (Stage C) is the choosing time's Hick-Hyman expert
 * limit. It is required like the other law times and moves a demand only when
 * options.siteFamiliarity is above 0.
 */
export function computeDemandFromRawMetrics(
  informationDensity: number,
  visualComplexity: number,
  textDensity: number,
  animationLevel: number,
  navigationDepth: number,
  pointingSeconds: number,
  choosingSeconds: number,
  readingSeconds: number,
  procedureSeconds: number,
  choosingSecondsExpert: number,
  options?: DemandOptions,
): DemandDistribution {
  // interactiveElementCount and choiceCount are reported counts that no demand
  // reads since Stage B; the law times replace them.
  return computeDemandDistribution({
    informationDensity,
    visualComplexity,
    interactiveElementCount: 0,
    textDensity,
    animationLevel,
    choiceCount: 0,
    navigationDepth,
    pointingSeconds,
    choosingSeconds,
    readingSeconds,
    procedureSeconds,
    choosingSecondsExpert,
  }, options);
}

/**
 * Compare sequential vs. additive CTC to quantify the sequential effect.
 *
 * Returns rawCTC / additiveCTC -- both in layer-cost units.
 *
 * NAMED FOR WHAT IT DOES, NOT WHAT IT WAS EXPECTED TO DO. The old name,
 * `sequentialAmplification`, promised a value above 1.0 — depletion and
 * interactions pushing total cost past what independent layers would predict.
 * Measured across five real runs it was 0.30, 0.31 and 0.39: the chain
 * ATTENUATES the additive sum by 61-70%, and has never been observed above 1.
 *
 * The transform is saturating rather than corrupting: the coefficient rises
 * monotonically with the additive sum (0.30 -> 0.31 -> 0.39), so rank ordering
 * across personas and pages is preserved and comparative claims built on CTC
 * hold. What does not hold is any reading of an ABSOLUTE cost, which carries an
 * undocumented compression of roughly 3x.
 *
 * "Amplification" for a term that only ever shrinks actively misleads anyone
 * reading the JSON without the source, which is most readers. (2026-08-02)
 */
export function chainCoefficient(result: SequentialTransportResult): number {
  if (result.additiveCTC === 0) return 1.0;
  // rawCTC, NOT totalCTC. Both are in layer-cost units, so their ratio is the
  // actual contribution of interactions and sequential depletion. Measured
  // 1.002-1.019 across page densities: the chain does amplify, by 0.2-2%.
  //
  // The old form divided totalCTC (a sigmoid, 0-1) by additiveCTC (a raw,
  // unbounded sum) and reported 0.30-0.56 as if the chain were dampening by
  // 60%. It was not measuring the chain at all, it was measuring the sigmoid --
  // and it was not even monotonic across density (0.329, 0.399, 0.556, 0.313,
  // 0.425), so it could not be used for ranking either.
  return result.rawCTC / result.additiveCTC;
}

/** @deprecated Misleading name — it has never exceeded 1. Use `chainCoefficient`. */
export const sequentialAmplification = chainCoefficient;

/**
 * Identify the top N most costly traits across all layers.
 * Useful for targeted remediation — fix the traits that hurt most.
 */
export function topCostlyTraits(
  result: SequentialTransportResult,
  n: number = 5,
): Array<{ trait: string; cost: number }> {
  return Object.entries(result.traitCosts)
    .filter(([, cost]) => cost > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([trait, cost]) => ({ trait, cost }));
}

/**
 * Compute CTC for a minimal/empty page (baseline).
 * Useful for normalizing CTC scores against the best-case scenario.
 */
export function baselineCTC(persona: OTCognitiveProfile): SequentialTransportResult {
  const emptyDemand: DemandDistribution = {
    demands: {},
  };
  for (const dim of DEMAND_DIMENSIONS) {
    emptyDemand.demands[dim] = 0;
  }
  return computeSequentialCTC(persona, emptyDemand);
}

// ── Sequential (per-screen) scoring ──

export interface ScreenResult {
  /** 1-based screen index from the top of the document. */
  screen: number;
  /** Layer costs for this screen alone. */
  layers: LayerResult[];
  /**
   * This screen's totalCTC, rounded: its own raw cost (against the capacity
   * earlier screens left) as a percentile of the reference, ranked against the
   * reference matching its demand's scope (viewport for per-screen metrics).
   */
  screenCTC: number;
  /** P(this persona stops HERE, given they reached this screen). */
  stopHazard: number;
  /** P(they have stopped at or before this screen). */
  cumulativeAbandonment: number;
  /** P(they are still reading when this screen begins). */
  reachProbability: number;
  /** The costliest layer on this screen. */
  bottleneckLayer: string;
  /** Capacity left when this screen finished. */
  remainingCapacity: Record<string, number>;
}

export interface SequentialScrollResult {
  screens: ScreenResult[];
  /** P(abandoned by the end of the document). */
  totalAbandonment: number;
  /** Expected number of screens reached, weighted by reach probability. */
  expectedDepthScreens: number;
  /** The screen where the most sessions end, and the layer that ends them. */
  dropOff: { screen: number; layer: string; share: number } | null;
  /**
   * Sum over screens of reachProbability x screenCTC: each screen's percentile,
   * weighted by the chance of reaching it. A sum of percentiles, so it grows
   * with the number of screens reached and is not itself a percentile.
   */
  reachWeightedCTC: number;
}

/**
 * Score a page as a SEQUENCE of screens rather than one aggregate.
 *
 * The aggregate model answers "what would this cost if the whole document were
 * processed at once", which is a counterfactual almost nobody performs. This
 * answers the question customers actually have: where do people stop.
 *
 * Three things make it different from dividing the aggregate by k, which was
 * the obvious wrong implementation:
 *
 * 1. EACH SCREEN'S DEMAND IS MEASURED ON ITS OWN CONTENT. Splitting a fixed
 *    total across k screens makes long pages safer than short ones -- measured,
 *    a deficit of 0.607 split fourteen ways drops cumulative abandonment from
 *    22% to 2%, because the hazard is superlinear. A genuinely sparse long page
 *    SHOULD be safer; a dense one must not become safe by being tall.
 * 2. CAPACITY CARRIES FORWARD. Screen 7 is scored against the budget screens
 *    1-6 left, not against a fresh persona. This is why depletion had to stop
 *    saturating first: with the old clamp, every screen after the third saw an
 *    identical capacity vector.
 * 3. DEMAND IS WEIGHTED BY THE CHANCE OF EVER GETTING THERE. A cost on screen
 *    twelve that 4% of sessions reach is not a cost of the same size as one on
 *    screen one.
 *
 * The hazard is the same Hill function the aggregate uses, applied per screen
 * against the capacity remaining at that point -- so ABANDONMENT_HILL_EXPONENT
 * is load-bearing here too and remains uncalibrated.
 */
export function computeSequentialScrollCTC(
  persona: OTCognitiveProfile,
  screenDemands: DemandDistribution[],
  options?: { asymmetric?: boolean; interactions?: boolean; schwartzValues?: Record<string, number> },
): SequentialScrollResult {
  const P = readParams(CHAIN_IDS);
  const R = P.roundingScale;
  const depthR = param('chain.depthRoundingScale');
  const screens: ScreenResult[] = [];
  let carried: Record<string, number> | undefined;
  let survive = 1;

  for (let i = 0; i < screenDemands.length; i++) {
    const r = computeSequentialCTC(persona, screenDemands[i], { ...options, carriedCapacity: carried });
    carried = r.remainingCapacity;

    // Hazard for THIS screen: the screen's own abandonment risk, which is the
    // Hill hazard of its unmet demand. One formula, read from the chain run,
    // rather than a second copy here that could drift from it (the copy that
    // was here applied surplus relief in step with the aggregate; 21.0 removed
    // it from both by removing this copy).
    const stopHazard = r.abandonmentRisk;

    const reachProbability = survive;
    survive = survive * (1 - stopHazard);

    screens.push({
      screen: i + 1,
      layers: r.layers,
      screenCTC: Math.round(r.totalCTC * R) / R,
      stopHazard: Math.round(stopHazard * R) / R,
      cumulativeAbandonment: Math.round((1 - survive) * R) / R,
      reachProbability: Math.round(reachProbability * R) / R,
      bottleneckLayer: r.bottleneckLayer,
      remainingCapacity: r.remainingCapacity,
    });
  }

  // Where the most sessions end. Mass lost on a screen is reach x hazard, so a
  // brutal screen nobody reaches does not win.
  let dropOff: SequentialScrollResult["dropOff"] = null;
  for (const s of screens) {
    const lost = s.reachProbability * s.stopHazard;
    if (!dropOff || lost > dropOff.share) {
      dropOff = { screen: s.screen, layer: s.bottleneckLayer, share: Math.round(lost * R) / R };
    }
  }
  if (dropOff && dropOff.share <= 0) dropOff = null;

  return {
    screens,
    totalAbandonment: Math.round((1 - survive) * R) / R,
    // Sum of reach probabilities: the expected count of screens actually seen.
    expectedDepthScreens: Math.round(screens.reduce((a, s) => a + s.reachProbability, 0) * depthR) / depthR,
    dropOff,
    reachWeightedCTC: Math.round(screens.reduce((a, s) => a + s.reachProbability * s.screenCTC, 0) * R) / R,
  };
}
