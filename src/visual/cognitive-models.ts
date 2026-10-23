/**
 * Cognitive Models — Formal implementations from cognitive science
 *
 * Layer 4: Grossman & Balakrishnan (2005) probabilistic pointing model
 * Layer 6: Perry, Zorzi & Ziegler (2019) multi-deficit reading model
 *
 * These replace the heuristic multipliers in cognitive-transport.ts
 * with empirically grounded computational models.
 *
 * @see Grossman & Balakrishnan (2005) ACM TOCHI — probabilistic 2D pointing
 * @see Perry, Zorzi & Ziegler (2019) Psychological Science — personalized dyslexia models
 * @since v18.39.0
 */
import { MODEL_PROVENANCE, param, personaScope } from "./model-provenance.js";
import { measuredRate, pointingCapacity, readingCapacity } from "./demand-laws.js";

/**
 * A registered constant, read as persona-model work (model-provenance.ts,
 * personaScope): every read in this module describes a persona or an audit,
 * not a score, so none lands in a score's recording. Calls into demand-laws.ts
 * are wrapped the same way.
 */
const pp = (id: string): number => personaScope(() => param(id));

// ── Mathematical Primitives ──

/**
 * Standard normal CDF (cumulative distribution function).
 * Abramowitz and Stegun approximation (7.1.26), error < 7.5e-8.
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 0.5 * (1 + sign * y);
}

/**
 * Standard normal PDF (probability density function).
 */
function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// ── Layer 4: Probabilistic Pointing Model ──

/**
 * Collapse a reading profile into one 0-1 capacity for the transport chain.
 *
 * The chain models cost as transport between a persona's CAPACITY on a
 * dimension and the page's DEMAND for it. Until now its readability layer read
 * `readingTendency` -- a DISPOSITION ("how much text does this person read")
 * -- which is not decoding ability, so a dyslexic persona with a higher
 * tendency scored LOWER readability cost than an ADHD persona on a text-dense
 * page, while this module's own decomposition reported the dyslexic reader at
 * 157 WPM against 204, a 4-character visual span against 6, and a +65ms
 * phonological penalty against +25ms.
 *
 * Two models of reading, disagreeing under one name, with the layer using the
 * one that knows nothing about decoding. This is the bridge. (2026-08-02)
 *
 * STAGE B: A RATE RATIO. The capacity is c = r_p / (r_p + r_ref)
 * (demand-laws.ts), the persona's silent reading rate against the reference
 * reader, so it sits at 0.5 for a typical reader and is on the same scale as a
 * reading demand in seconds. The weighted sum of the five profile values it
 * replaced had no unit.
 *
 * ONE REFERENCE READER: Brysbaert's 238 wpm (law.reading.wpm), the rate the
 * reading demand uses, so a persona's own reading time is judged against the
 * same budget the page is. The fixation model contributes only a ratio: the
 * profile's per-word time against the neurotypical profile's, so the
 * neurotypical profile reads at exactly the reference. Its absolute times are
 * not compared with 238: they start from a fixation duration (250 ms) plus a
 * penalty the neurotypical profile pays itself, 270 ms per word or 222 wpm, and
 * would put every reader about 7% below the reference by construction.
 */
export function readingCapacityOf(profile: ReadingProfile): number {
  return personaScope(() => readingCapacity(readingRateRatioOf(profile) * pp("law.reading.wpm")));
}

/**
 * The text-independent part of computeReadingDifficulty's per-word time, ms:
 * base + (1 - phonological) x phonologicalMs + (normalSpan / visualSpan - 1) x spanMs.
 */
function perWordMs(profile: Pick<ReadingProfile, "phonological" | "visualSpan">): number {
  return pp("profile.fixation.baseMs")
    + (1 - profile.phonological) * pp("profile.fixation.phonologicalMs")
    + (pp("profile.fixation.normalSpan") / profile.visualSpan - 1) * pp("profile.fixation.spanMs");
}

/** A reading profile's silent reading rate as a share of the reference reader's: the neurotypical profile's per-word time over its own. */
export function readingRateRatioOf(profile: ReadingProfile): number {
  return perWordMs(KNOWN_READING_PROFILES.neurotypical) / perWordMs(profile);
}

export interface PointingProfile {
  /** Endpoint dispersion SD in pixels (x-axis) */
  sigmaX: number;
  /** Endpoint dispersion SD in pixels (y-axis) */
  sigmaY: number;
  /** Correlation between x and y endpoint distributions */
  rho: number;
  /** Fitts' throughput (bits/s) */
  throughput: number;
}

/**
 * Collapse a pointing profile into one 0-1 capacity for the transport chain.
 *
 * Same defect as reading: the motor layer read `patience` and
 * `proceduralFluency`, so two personas with no motor traits at all differed 5.6x
 * in motor cost while this module was computing real Fitts movement times and
 * hit probabilities that the layer never saw.
 *
 * STAGE B: A RATE RATIO. The capacity is c = TP_p / (TP_p + TP_ref), the
 * profile's Fitts throughput against the reference mouse throughput
 * (law.rate.pointing.reference, 4.9 bits/s), so it sits at 0.5 for a typical
 * pointer. Endpoint dispersion no longer subtracts: ISO 9241-9 throughput is
 * computed with the effective width We = 4.133 SDx, so it already carries
 * accuracy, and subtracting dispersion again counted it twice.
 */
export function motorCapacityOf(profile: PointingProfile): number {
  return personaScope(() => pointingCapacity(profile.throughput));
}

/**
 * Resolve the persona's capacity to HOLD attention on text, 0-1.
 *
 * The third capacity bridge, and the one that closes the gap the readability
 * rewrite opened. Reading has two halves -- decoding the words, and staying on
 * the line while you do it -- and after `readingTendency` left the layer the
 * chain modelled only the first. A persona whose reading difficulty is entirely
 * attentional was scored as an unimpaired reader.
 *
 * Resolution order, most-stated first:
 *
 * 1. `accessibilityTraits.attentionSpan`. Already authored on all 12 personas
 *    that carry accessibility traits, already documented as "focus duration
 *    before fatigue", and until now it reached no layer of the transport chain
 *    at all -- only perceptual noiseTolerance and some prose warnings.
 * 2. `interruptRecovery`. The closest thing in the cognitive vector: task
 *    resumption after interruption is the standard HCI measure of attentional
 *    control. It matters that this exists -- 24 of 36 personas state no
 *    accessibility traits, including `distracted-user`, whose entire identity
 *    is this dimension (interruptRecovery 0.10) and who would otherwise have
 *    been handed the same attention as `power-user` (0.85).
 * 3. 0.7. Unremarkable rather than perfect, for a persona that states neither.
 */
export function sustainedAttentionOf(persona: {
  traits?: Record<string, number>;
  accessibilityTraits?: { attentionSpan?: number };
}): number {
  const stated = persona.accessibilityTraits?.attentionSpan;
  if (typeof stated === "number") return Math.max(0, Math.min(1, stated));
  const recovery = persona.traits?.interruptRecovery;
  if (typeof recovery === "number") return Math.max(0, Math.min(1, recovery));
  return 0.7;
}

export interface TargetElement {
  /** CSS selector or description */
  selector: string;
  /** Target width in pixels */
  width: number;
  /** Target height in pixels */
  height: number;
  /** Distance from likely cursor position (center of viewport) in pixels */
  distance: number;
}

export interface MotorAccessibilityResult {
  /** Per-element hit probability (0-1) */
  elements: Array<{
    selector: string;
    hitProbability: number;
    movementTime: number;
    isBarrier: boolean;
  }>;
  /** Overall motor accessibility score (0-1, higher = more accessible) */
  score: number;
  /** Number of motor barriers found */
  barrierCount: number;
  /** Transport cost for this layer */
  transportCost: number;
}

/**
 * Pointing profiles. Each throughput is a registered constant, read when the
 * profile is used (a getter), so an override reaches every profile:
 *
 * - neurotypical: law.rate.pointing.reference, 4.9 bits/s for regular mouse
 *   users (MacKenzie, Kauppinen & Silfverberg 2001).
 * - tremor: the motion-impaired rate measured against its own able-bodied
 *   controls, 1.77 / 4.88 (Keates et al. 2002, in Soukoreff & MacKenzie 2004,
 *   Table 4), rescaled to the reference: 4.9 x 1.77 / 4.88 = 1.777 bits/s. It is
 *   also the low anchor getPointingProfile interpolates toward.
 * - elderly: a hypothesis with no measured throughput (provenance/profiles.ts).
 * - adhd: the reference. No throughput for adults with ADHD was found, and the
 *   4.2 bits/s it carried had no source.
 *
 * The endpoint dispersions (sigma, rho) feed the hit-probability audit only and
 * are not registered.
 */
const KNOWN_POINTING_PROFILES: Record<string, PointingProfile> = {
  neurotypical: { sigmaX: 4, sigmaY: 4, rho: 0.0, get throughput() { return pp("law.rate.pointing.reference"); } },
  tremor: { sigmaX: 12, sigmaY: 12, rho: 0.3, get throughput() { return pp("law.rate.pointing.reference") * personaScope(() => measuredRate("motionImpaired").ratio); } },
  elderly: { sigmaX: 7.2, sigmaY: 7.2, rho: 0.1, get throughput() { return pp("profile.pointing.elderly.throughput"); } },
  adhd: { sigmaX: 5.5, sigmaY: 5.5, rho: 0.0, get throughput() { return pp("law.rate.pointing.reference"); } },
};

/**
 * A built-in persona's registered rate on one channel, as a share of the
 * reference rate (provenance/persona-rates.ts), or undefined for a persona with
 * no entry (a custom persona), whose rate comes from the profiles.
 */
export function registeredPersonaRate(name: string | undefined, channel: "pointing" | "reading"): number | undefined {
  if (!name) return undefined;
  const id = `personaRate.${name}.${channel}`;
  return id in MODEL_PROVENANCE ? pp(id) : undefined;
}

/**
 * The pointing profile a persona is scored and audited with.
 *
 * A built-in persona's throughput is its registered rate (registeredPersonaRate)
 * times the reference, so the motor layer and the motor audit read one number;
 * its endpoint dispersion still comes from the route below. A persona with no
 * registered rate gets the whole profile from the route.
 */
export function getPointingProfile(persona: {
  traits?: Record<string, number>;
  /** The persona's stored accessibility traits; only `tremor` is read here. Numbers and booleans both occur. */
  accessibilityTraits?: Record<string, number | boolean>;
  name?: string;
}): PointingProfile {
  const profile = pointingProfileFromTraits(persona);
  const share = registeredPersonaRate(persona.name, "pointing");
  return share === undefined ? profile : { ...profile, throughput: share * pp("law.rate.pointing.reference") };
}

/**
 * Derive a pointing profile from persona traits.
 *
 * Maps cognitive trait values to motor parameters by interpolating
 * between known empirical profiles. Uses `motorPrecision` (derived from
 * proceduralFluency and patience) as the primary interpolation axis.
 * The interpolation has no source: dispositions are not motor measures. Only
 * personas without a registered rate reach it.
 *
 * @param persona - Persona traits object with cognitive dimensions
 * @returns Empirically calibrated pointing profile
 */
function pointingProfileFromTraits(persona: {
  traits?: Record<string, number>;
  /** The persona's stored accessibility traits; only `tremor` is read here. Numbers and booleans both occur. */
  accessibilityTraits?: Record<string, number | boolean>;
  name?: string;
}): PointingProfile {
  const traits = persona.traits ?? {};
  const a11y = persona.accessibilityTraits ?? {};

  // Check for explicit tremor trait
  if (a11y.tremor) {
    return { ...KNOWN_POINTING_PROFILES.tremor };
  }

  // Check for persona name hints
  const name = (persona.name ?? '').toLowerCase();
  if (name.includes('tremor') || name.includes('parkinson')) {
    return { ...KNOWN_POINTING_PROFILES.tremor };
  }
  if (name.includes('elderly') || name.includes('senior') || name.includes('aging')) {
    return { ...KNOWN_POINTING_PROFILES.elderly };
  }
  if (name.includes('adhd')) {
    return { ...KNOWN_POINTING_PROFILES.adhd };
  }

  // Derive motorPrecision from available traits
  // motorPrecision is a composite of fine motor control indicators
  const motorPrecision = traits.motorPrecision
    ?? (traits.proceduralFluency !== undefined && traits.patience !== undefined
      ? (traits.proceduralFluency * 0.6 + traits.patience * 0.4)
      : undefined);

  if (motorPrecision === undefined) {
    return { ...KNOWN_POINTING_PROFILES.neurotypical };
  }

  // Interpolate between profiles based on motorPrecision (0-1)
  // 1.0 = neurotypical, 0.0 = severe impairment (tremor)
  const clamped = Math.max(0, Math.min(1, motorPrecision));

  const neuro = KNOWN_POINTING_PROFILES.neurotypical;
  const impaired = KNOWN_POINTING_PROFILES.tremor;

  return {
    sigmaX: neuro.sigmaX + (impaired.sigmaX - neuro.sigmaX) * (1 - clamped),
    sigmaY: neuro.sigmaY + (impaired.sigmaY - neuro.sigmaY) * (1 - clamped),
    rho: neuro.rho + (impaired.rho - neuro.rho) * (1 - clamped),
    throughput: neuro.throughput + (impaired.throughput - neuro.throughput) * (1 - clamped),
  };
}

/**
 * Compute the probability that a user hits a rectangular target.
 *
 * Grossman & Balakrishnan (2005) bivariate normal integral over target rectangle.
 * For independent axes (rho=0): P(hit) = Phi(W/(2*sigmaX)) * Phi(H/(2*sigmaY))
 * For correlated axes (rho!=0): applies the Plackett (1954) correction term.
 *
 * Assumes the user aims at the target center (optimal aiming point).
 *
 * @param target - Target element dimensions
 * @param profile - User's pointing profile
 * @returns Hit probability in [0, 1]
 */
/**
 * How far the correlated correction may move the independent estimate before it
 * is treated as out of range. 1.25 = a 25% perturbation in either direction.
 *
 * At realistic target sizes the correction never approaches this: measured 1.00x
 * at 24px and 48px, 1.04x at 12px, 1.19x at 6px. It is only reached on targets
 * small enough that the approximation is no longer one.
 */
const MAX_CORRELATION_CORRECTION = 1.25;

export function computeHitProbability(target: TargetElement, profile: PointingProfile): number {
  const { width, height } = target;
  const { sigmaX, sigmaY, rho } = profile;

  // Guard: degenerate targets
  if (width <= 0 || height <= 0) return 0;
  if (sigmaX <= 0 || sigmaY <= 0) return 1;

  // Standardized half-widths
  const zx = width / (2 * sigmaX);
  const zy = height / (2 * sigmaY);

  // CDF of standard normal at the standardized edges
  // P(|X| < W/2) = 2*Phi(W/(2*sigma)) - 1
  const pX = 2 * normalCDF(zx) - 1;
  const pY = 2 * normalCDF(zy) - 1;

  // Independent-axis approximation (exact for rho=0)
  const pIndependent = pX * pY;

  if (Math.abs(rho) < 1e-6) {
    return pIndependent;
  }

  // Correlated correction (Grossman & Balakrishnan's approximation)
  // P(hit) ~= Phi_x * Phi_y * (1 + rho * phi(zx) * phi(zy) / (Phi_x * Phi_y))
  // where phi is PDF and Phi is the one-sided CDF P(|X| < ...)
  const phiX = normalPDF(zx);
  const phiY = normalPDF(zy);

  if (pX < 1e-10 || pY < 1e-10) {
    return pIndependent;
  }

  const correction = 1 + rho * phiX * phiY / (pX * pY);

  // THE CORRECTION IS A PERTURBATION, AND IT DIVERGES.
  //
  // `pX * pY` is the denominator, so as the target shrinks the term grows
  // without bound. Measured at sigma 7.7 / rho 0.13:
  //
  //   48x48px  factor 1.00     12x12px  factor 1.04     3x3px  factor 1.83
  //   24x24px  factor 1.00      6x6px   factor 1.19     1x1px  factor 8.69
  //
  // That INVERTS the model against its own inputs, because rho co-varies with
  // sigma across personas -- the more impaired a pointer is, the larger both
  // are. On a 1x1 target, motor-impairment-tremor (sigma 12, rho 0.30) scored
  // 4.88% against cognitive-adhd's 0.52%: nine times better BECAUSE it is
  // worse. That is the ordering the bug report saw, and it read as an inversion
  // against movement time only because it was measured on one degenerate
  // element. Movement time and hit probability share no parameter but W --
  // MT is (D, W, throughput), P(hit) is (W, H, sigma, rho) -- so they were
  // never expected to track each other.
  //
  // Grossman & Balakrishnan derive this as a small correction and it is
  // trustworthy while it stays one. Past that the approximation has left its
  // validity domain, and the exact independent-axis form is the honest answer
  // -- it is a real bound, not a fallback of convenience. (2026-08-03, BUG-02)
  if (correction > MAX_CORRELATION_CORRECTION || correction < 1 / MAX_CORRELATION_CORRECTION) {
    return pIndependent;
  }

  // Frechet bound: a joint probability can never exceed its smaller marginal,
  // whatever the correlation. Exact and true for every rho -- and, measured, it
  // never binds once the perturbation bound above is in place: removing this
  // line turns no test red. Kept as a stated invariant rather than as working
  // code, so a future change to that bound cannot quietly produce a joint
  // probability above its own marginal.
  return Math.max(0, Math.min(1, pX, pY, pIndependent * correction));
}

/**
 * Compute Fitts' Law movement time for reaching a target.
 *
 * Uses the Shannon formulation (MacKenzie 1992, ISO 9241-9):
 *   MT = (1/throughput) * log2(D/W + 1)
 *
 * @param distance - Distance to target center in pixels
 * @param width - Effective target width in the movement direction (pixels)
 * @param throughput - User's Fitts' throughput in bits/s
 * @returns Movement time in milliseconds
 */
export function computeFittsTime(distance: number, width: number, throughput: number): number {
  if (distance <= 0 || width <= 0 || throughput <= 0) return 0;

  const indexOfDifficulty = Math.log2(distance / width + 1);
  return (1 / throughput) * indexOfDifficulty * 1000;
}

/**
 * Compute motor accessibility for a set of target elements.
 *
 * For each element, computes hit probability and movement time using the
 * Grossman & Balakrishnan pointing model and Fitts' Law. Identifies
 * motor barriers: elements where P(hit) falls below a persona-adjusted threshold.
 *
 * Barrier thresholds (from WCAG 2.5 / AAA guidance):
 * - Neurotypical (throughput >= 4.0): P(hit) < 0.85 is a barrier
 * - Impaired (throughput < 4.0): P(hit) < 0.70 is a barrier (relaxed standard)
 *
 * @param targets - Interactive elements on the page
 * @param persona - Persona to evaluate for
 * @returns Motor accessibility result with per-element breakdown
 */
export function motorAccessibility(
  targets: TargetElement[],
  persona: {
    traits?: Record<string, number>;
    accessibilityTraits?: Record<string, boolean>;
    name?: string;
  },
): MotorAccessibilityResult {
  if (targets.length === 0) {
    return { elements: [], score: 1, barrierCount: 0, transportCost: 0 };
  }

  const profile = getPointingProfile(persona);
  const barrierThreshold = profile.throughput >= 4.0 ? 0.85 : 0.70;

  const elements = targets.map(target => {
    const hitProbability = computeHitProbability(target, profile);

    // Use geometric mean of width and height as effective width for Fitts
    const effectiveWidth = Math.sqrt(target.width * target.height);
    const movementTime = computeFittsTime(target.distance, effectiveWidth, profile.throughput);

    return {
      selector: target.selector,
      hitProbability: Math.round(hitProbability * 10000) / 10000,
      movementTime: Math.round(movementTime),
      isBarrier: hitProbability < barrierThreshold,
    };
  });

  const barrierCount = elements.filter(e => e.isBarrier).length;
  const meanHitProbability = elements.reduce((sum, e) => sum + e.hitProbability, 0) / elements.length;
  const score = Math.round(meanHitProbability * 10000) / 10000;
  const transportCost = Math.round((1 - score) * 10000) / 10000;

  return { elements, score, barrierCount, transportCost };
}

// ── Layer 6: Multi-Deficit Reading Model ──

export interface ReadingProfile {
  /** Orthographic processing speed (0-1, 1=fluent) */
  orthographic: number;
  /** Phonological decoding ability (0-1) */
  phonological: number;
  /** Visual span (number of characters processed per fixation) */
  visualSpan: number;
  /** Vocabulary breadth (0-1) */
  vocabulary: number;
  /** Crowding sensitivity (0-1, higher = more affected by crowding) */
  crowding: number;
}

export interface TextBlock {
  /** Text content */
  text: string;
  /** Font size in pixels */
  fontSize: number;
  /** Line height ratio (e.g., 1.5) */
  lineHeight: number;
  /** Font family */
  fontFamily: string;
  /** Whether font is serif or sans-serif */
  isSerif: boolean;
  /** Contrast ratio (foreground vs background) */
  contrastRatio: number;
}

export interface ReadabilityResult {
  /** Per-text-block reading difficulty */
  blocks: Array<{
    text: string;
    difficulty: number;
    fixationDuration: number;
    wordsPerMinute: number;
    penalties: string[];
  /** Every penalty component in ms, including the zeroes. See BUG-12. */
  penaltyBreakdown: {
    baseFixationMs: number; orthographicMs: number; phonologicalMs: number;
    visualSpanMs: number; vocabularyMs: number; crowdingMs: number;
    serifFontMs: number; lowContrastMs: number;
  };
  }>;
  /** Overall readability score (0-1, higher = more readable) */
  score: number;
  /** Transport cost for this layer */
  transportCost: number;
}

/**
 * Known reading profiles from the empirical literature.
 *
 * - Neurotypical: Rayner (2009) — typical college reader
 * - Dyslexic: Perry, Zorzi & Ziegler (2019) Psychological Science
 * - Low vision: Legge et al. (2007) — central scotoma and crowding
 * - ADHD: Dhar et al. (2010) — intact decoding, reduced sustained attention
 * - Elderly: Rayner et al. (2006) — aging effects on eye movements
 *
 * The citations motivate a direction, not the numbers (provenance/profiles.ts
 * records what a source check found). phonological and visualSpan, the two
 * values the per-word rate reads, are registered; the other three are not.
 */
const readingProfile = (kind: string, rest: Pick<ReadingProfile, "orthographic" | "vocabulary" | "crowding">): ReadingProfile => ({
  ...rest,
  // The two values the per-word rate reads are registered (provenance/profiles.ts)
  // and read at use, so an override reaches the profile.
  get phonological() { return pp(`profile.reading.${kind}.phonological`); },
  get visualSpan() { return pp(`profile.reading.${kind}.visualSpan`); },
});
const KNOWN_READING_PROFILES: Record<string, ReadingProfile> = {
  neurotypical: readingProfile("neurotypical", { orthographic: 0.85, vocabulary: 0.75, crowding: 0.15 }),
  dyslexic: readingProfile("dyslexic", { orthographic: 0.40, vocabulary: 0.65, crowding: 0.55 }),
  lowVision: readingProfile("lowVision", { orthographic: 0.60, vocabulary: 0.75, crowding: 0.70 }),
  adhd: readingProfile("adhd", { orthographic: 0.80, vocabulary: 0.70, crowding: 0.20 }),
  elderly: readingProfile("elderly", { orthographic: 0.70, vocabulary: 0.85, crowding: 0.30 }),
};

/**
 * Derive a reading profile from persona traits.
 *
 * Maps cognitive trait values to reading parameters by selecting the
 * closest known profile and interpolating with the neurotypical baseline.
 *
 * @param persona - Persona traits object
 * @returns Empirically calibrated reading profile
 */
export function getReadingProfile(persona: {
  /**
   * Explicit reading capacity, if the persona states it.
   *
   * Checked BEFORE the name lookup: an author who has written down a reading
   * profile means it, and matching on name.includes("dyslexic") instead is how
   * the model became untunable. Partial objects are allowed -- each field falls
   * back to whatever the name lookup would have produced, so stating one value
   * does not silently reset the other four. (2026-08-02)
   */
  accessibilityTraits?: {
    orthographicFluency?: number;
    phonologicalDecoding?: number;
    visualSpan?: number;
    vocabularyBreadth?: number;
    crowdingSensitivity?: number;
  };
  traits?: Record<string, number>;
  name?: string;
}): ReadingProfile {
  const traits = persona.traits ?? {};
  const name = (persona.name ?? '').toLowerCase();
  const stated = persona.accessibilityTraits;

  // Stated capacity wins over every other route.
  //
  // Applied as an OVERLAY on whatever the rest of this function would have
  // returned, so a persona can state one field without silently resetting the
  // other four to defaults. Computed by recursing with the stated values
  // stripped, which keeps the name and trait paths as the base.
  if (stated && Object.values(stated).some((v) => typeof v === "number")) {
    const base = getReadingProfile({ traits: persona.traits, name: persona.name });
    return {
      orthographic: stated.orthographicFluency ?? base.orthographic,
      phonological: stated.phonologicalDecoding ?? base.phonological,
      visualSpan: stated.visualSpan ?? base.visualSpan,
      vocabulary: stated.vocabularyBreadth ?? base.vocabulary,
      crowding: stated.crowdingSensitivity ?? base.crowding,
    };
  }

  // Direct name matching for known profiles
  if (name.includes('dyslexic') || name.includes('dyslexia')) {
    return { ...KNOWN_READING_PROFILES.dyslexic };
  }
  if (name.includes('low-vision') || name.includes('low vision') || name.includes('magnified')) {
    return { ...KNOWN_READING_PROFILES.lowVision };
  }
  if (name.includes('adhd') || name.includes('attention deficit')) {
    return { ...KNOWN_READING_PROFILES.adhd };
  }
  if (name.includes('elderly') || name.includes('senior') || name.includes('aging')) {
    return { ...KNOWN_READING_PROFILES.elderly };
  }

  // Trait-based interpolation
  const textProcessing = traits.textProcessing;
  const comprehension = traits.comprehension;

  if (textProcessing === undefined && comprehension === undefined) {
    return { ...KNOWN_READING_PROFILES.neurotypical };
  }

  // Use textProcessing as primary axis, comprehension as secondary
  const readingAbility = textProcessing !== undefined && comprehension !== undefined
    ? textProcessing * 0.6 + comprehension * 0.4
    : (textProcessing ?? comprehension ?? 0.75);

  const clamped = Math.max(0, Math.min(1, readingAbility));

  const neuro = KNOWN_READING_PROFILES.neurotypical;
  const impaired = KNOWN_READING_PROFILES.dyslexic;

  return {
    orthographic: impaired.orthographic + (neuro.orthographic - impaired.orthographic) * clamped,
    phonological: impaired.phonological + (neuro.phonological - impaired.phonological) * clamped,
    visualSpan: Math.round(impaired.visualSpan + (neuro.visualSpan - impaired.visualSpan) * clamped),
    vocabulary: impaired.vocabulary + (neuro.vocabulary - impaired.vocabulary) * clamped,
    crowding: neuro.crowding + (impaired.crowding - neuro.crowding) * (1 - clamped),
  };
}

/**
 * Irregular word patterns in English.
 *
 * These are grapheme-phoneme correspondence violations — words containing
 * these patterns violate standard decoding rules and require whole-word
 * (orthographic) recognition. Dyslexic readers with impaired orthographic
 * processing are disproportionately slowed by these.
 *
 * Source: Plaut et al. (1996), Coltheart et al. (2001) DRC model.
 */
const IRREGULAR_PATTERN = /\b\w*(ough|tion|sion|ight|ould|alk|omb|wr|kn|gn|pn|ps|mn)\w*\b/gi;

/**
 * Estimate the proportion of irregular words in a text passage.
 *
 * Returns the fraction of words that contain irregular grapheme-phoneme
 * correspondences. This determines the orthographic processing demand:
 * higher irregularity = more reliance on whole-word recognition.
 *
 * @param text - Text passage to analyze
 * @returns Proportion of irregular words (0-1)
 */
export function estimateIrregularity(text: string): number {
  const words = text.trim().split(/\s+/);
  if (words.length === 0) return 0;

  // Reset regex state (global flag)
  IRREGULAR_PATTERN.lastIndex = 0;
  const matches = text.match(IRREGULAR_PATTERN);
  const irregularCount = matches ? matches.length : 0;

  return Math.min(1, irregularCount / words.length);
}

/**
 * Compute reading difficulty for a text block using the multi-deficit model.
 *
 * The Perry, Zorzi & Ziegler (2019) framework models dyslexia as the
 * intersection of multiple independent deficits. Each deficit independently
 * increases fixation duration. The total penalty is additive (not multiplicative)
 * because deficits affect different processing stages in the reading pipeline:
 *
 *   Visual input -> Visual span (crowding) -> Orthographic processing ->
 *   Phonological decoding -> Lexical access (vocabulary) -> Comprehension
 *
 * Additional penalties from Rello & Baeza-Yates (2016) for font effects
 * and WCAG 2.1 contrast requirements.
 *
 * @param text - Text content to analyze
 * @param profile - Reader's deficit profile
 * @param textBlock - Typographic properties of the text
 * @returns Reading difficulty (0-1) and fixation duration
 */
export function computeReadingDifficulty(
  text: string,
  profile: ReadingProfile,
  textBlock: TextBlock,
): {
  difficulty: number;
  fixationDuration: number;
  wordsPerMinute: number;
  penalties: string[];
  /** Every penalty component in ms, including the zeroes. See BUG-12. */
  penaltyBreakdown: {
    baseFixationMs: number; orthographicMs: number; phonologicalMs: number;
    visualSpanMs: number; vocabularyMs: number; crowdingMs: number;
    serifFontMs: number; lowContrastMs: number;
  };
} {
  const words = text.trim().split(/\s+/);
  const wordCount = Math.max(1, words.length);
  const penalties: string[] = [];

  // Base time per word. Registered as a hypothesis: the 250 ms it holds is
  // Rayner's (2009) fixation duration, not a per-word time.
  const baseFixation = pp("profile.fixation.baseMs");

  // 1. Orthographic deficit: irregular words take longer to process
  // When orthographic route is impaired, the reader must fall back to
  // phonological decoding for irregular words, which is slower.
  const irregularWordRatio = estimateIrregularity(text);
  const orthoPenalty = (1 - profile.orthographic) * irregularWordRatio * 150;
  if (orthoPenalty > 10) {
    penalties.push(`orthographic: +${Math.round(orthoPenalty)}ms (${Math.round(irregularWordRatio * 100)}% irregular words)`);
  }

  // 2. Phonological deficit: all words require phonological activation
  // Even for skilled readers, phonological codes are activated automatically.
  // Impaired phonological processing slows all word recognition.
  const phonoPenalty = (1 - profile.phonological) * pp("profile.fixation.phonologicalMs");
  if (phonoPenalty > 10) {
    penalties.push(`phonological: +${Math.round(phonoPenalty)}ms`);
  }

  // 3. Visual span: fewer characters per fixation = more fixations per word.
  // The normal span (7) is registered; Legge et al. (2007) estimate about 9.
  // Reduced span means more saccades to read the same word. Not clamped: a
  // span above normal subtracts time.
  const spanRatio = pp("profile.fixation.normalSpan") / profile.visualSpan;
  const spanPenalty = (spanRatio - 1) * pp("profile.fixation.spanMs");
  if (spanPenalty > 5) {
    penalties.push(`visual span: +${Math.round(spanPenalty)}ms (${profile.visualSpan} chars/fixation)`);
  }

  // 4. Vocabulary: unknown/rare words require additional processing
  // Long words are more likely to be uncommon (Zipf's law correlation).
  // Vocabulary deficit amplifies this effect.
  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / wordCount;
  const vocabPenalty = (1 - profile.vocabulary) * Math.max(0, avgWordLength - 5) * 30;
  if (vocabPenalty > 5) {
    // "chars" is load-bearing: pageMetrics.avgWordLength is a 0-1 NORMALIZED
    // score, and this one is raw characters. Same name, two scales — a reader
    // seeing 11.4 next to a field documented 0-1 has no way to tell which they
    // are looking at. (2026-07-29)
    penalties.push(`vocabulary: +${Math.round(vocabPenalty)}ms (avg word length ${avgWordLength.toFixed(1)} chars)`);
  }

  // 5. Crowding: small or dense text increases lateral masking
  // Below 16px, crowding effects increase substantially.
  // Pelli et al. (2004, 2007) established the critical spacing formula.
  const crowdingPenalty = profile.crowding * Math.max(0, 16 - textBlock.fontSize) * 10;
  if (crowdingPenalty > 5) {
    penalties.push(`crowding: +${Math.round(crowdingPenalty)}ms (${textBlock.fontSize}px font)`);
  }

  // 6. Font penalty: serif fonts penalize dyslexic readers
  // Rello & Baeza-Yates (2016): sans-serif fonts reduce fixation time
  // for readers with orthographic processing below 0.6.
  const fontPenalty = textBlock.isSerif && profile.orthographic < 0.6 ? 50 : 0;
  if (fontPenalty > 0) {
    penalties.push(`serif font: +${fontPenalty}ms (orthographic deficit)`);
  }

  // 7. Contrast penalty: low contrast increases fixation duration
  // WCAG 2.1 SC 1.4.3 minimum is 4.5:1 for normal text.
  // Below this threshold, all readers are affected, but impaired readers more so.
  const contrastPenalty = textBlock.contrastRatio < 4.5
    ? (4.5 - textBlock.contrastRatio) * 40
    : 0;
  if (contrastPenalty > 0) {
    penalties.push(`low contrast: +${Math.round(contrastPenalty)}ms (${textBlock.contrastRatio.toFixed(1)}:1 ratio)`);
  }

  // Total fixation duration per word
  const totalFixation = baseFixation + orthoPenalty + phonoPenalty + spanPenalty + vocabPenalty + crowdingPenalty + fontPenalty + contrastPenalty;

  // Words per minute
  const wpm = Math.round(60000 / totalFixation);

  // Normalize difficulty: the base time = 0.0 (fluent), base + 500ms+ = 1.0 (severe)
  const difficulty = Math.max(0, Math.min(1, (totalFixation - baseFixation) / 500));

  return {
    difficulty: Math.round(difficulty * 10000) / 10000,
    fixationDuration: Math.round(totalFixation),
    wordsPerMinute: wpm,
    penalties,
    /**
     * Every component, including the ones that came to zero.
     *
     * `penalties` above is a PROSE list and each entry is gated behind its own
     * threshold, so a component that evaluated to 0 is simply absent from it --
     * and absent is indistinguishable from not modelled at all. That is exactly
     * how `crowdingSensitivity` came to be reported as a trait that does
     * nothing: it is weighted at 0.15 in readingCapacityOf AND priced here, but
     * Pelli's critical-spacing effect only begins below 16px, and every page
     * tested set its body text at 16px or larger. Measured on 13px text it
     * discriminates cleanly -- adhd +6ms, dyslexic +17ms, low-vision +21ms,
     * tracking their crowding sensitivities of 0.20 / 0.55 / 0.70.
     *
     * So the breakdown ships whole. A zero here means evaluated and not
     * applicable to this text; a missing key would mean something else.
     * (2026-08-03, BUG-12)
     */
    penaltyBreakdown: {
      baseFixationMs: Math.round(baseFixation),
      orthographicMs: Math.round(orthoPenalty),
      phonologicalMs: Math.round(phonoPenalty),
      visualSpanMs: Math.round(spanPenalty),
      vocabularyMs: Math.round(vocabPenalty),
      crowdingMs: Math.round(crowdingPenalty),
      serifFontMs: Math.round(fontPenalty),
      lowContrastMs: Math.round(contrastPenalty),
    },
  };
}

/**
 * Compute readability for multiple text blocks using the multi-deficit model.
 *
 * Evaluates each text block independently, then computes an aggregate
 * readability score weighted by text length (longer blocks matter more).
 *
 * @param blocks - Array of text blocks with typographic properties
 * @param persona - Persona to evaluate for
 * @returns Readability result with per-block breakdown and aggregate score
 */
export function readability(
  blocks: TextBlock[],
  persona: {
    traits?: Record<string, number>;
    name?: string;
    /** Passed straight through to getReadingProfile: stated capacity wins. */
    accessibilityTraits?: {
      orthographicFluency?: number;
      phonologicalDecoding?: number;
      visualSpan?: number;
      vocabularyBreadth?: number;
      crowdingSensitivity?: number;
    };
  },
): ReadabilityResult {
  if (blocks.length === 0) {
    return { blocks: [], score: 1, transportCost: 0 };
  }

  const profile = getReadingProfile(persona);

  const results = blocks.map(block => {
    const { difficulty, fixationDuration, wordsPerMinute, penalties, penaltyBreakdown } = computeReadingDifficulty(
      block.text,
      profile,
      block,
    );

    return {
      text: block.text.length > 100 ? block.text.slice(0, 100) + '...' : block.text,
      difficulty,
      fixationDuration,
      wordsPerMinute,
      penalties,
      penaltyBreakdown,
    };
  });

  // Weighted average by text length (longer blocks count more)
  const totalChars = blocks.reduce((sum, b) => sum + b.text.length, 0) || 1;
  const weightedDifficulty = results.reduce((sum, r, i) => {
    const weight = blocks[i].text.length / totalChars;
    return sum + r.difficulty * weight;
  }, 0);

  const score = Math.round((1 - weightedDifficulty) * 10000) / 10000;
  const transportCost = Math.round(weightedDifficulty * 10000) / 10000;

  return { blocks: results, score, transportCost };
}

// ── Unified Access ──

/**
 * Compute both motor and reading accessibility for a persona.
 *
 * Combines Layer 4 (pointing model) and Layer 6 (reading model) into
 * a single assessment. Each layer contributes independently to the
 * total transport cost.
 *
 * @param targets - Interactive elements for motor assessment
 * @param textBlocks - Text blocks for reading assessment
 * @param persona - Persona to evaluate
 * @returns Combined accessibility result
 */
export function cognitiveAccessibility(
  targets: TargetElement[],
  textBlocks: TextBlock[],
  persona: {
    traits?: Record<string, number>;
    accessibilityTraits?: Record<string, boolean>;
    name?: string;
  },
): {
  motor: MotorAccessibilityResult;
  reading: ReadabilityResult;
  combinedScore: number;
  combinedTransportCost: number;
} {
  const motor = motorAccessibility(targets, persona);
  const reading = readability(textBlocks, persona);

  // Combined score: geometric mean (penalizes severe deficits in either domain)
  const combinedScore = Math.round(
    Math.sqrt(motor.score * reading.score) * 10000
  ) / 10000;

  // Combined transport cost: sum of independent layer costs (clamped to [0,1])
  const combinedTransportCost = Math.round(
    Math.min(1, motor.transportCost + reading.transportCost) * 10000
  ) / 10000;

  return { motor, reading, combinedScore, combinedTransportCost };
}

// ── Exports for testing ──

export { normalCDF as _normalCDF, normalPDF as _normalPDF };
export { KNOWN_POINTING_PROFILES, KNOWN_READING_PROFILES };

/**
 * Bridge the formal reading and pointing models onto a persona's trait vector.
 *
 * Three of the capacity dimensions -- readingCapacity, motorCapacity,
 * sustainedAttention -- are not authored on personas. They are DERIVED from the
 * formal models here, and injected before the profile is built rather than stored,
 * so no second copy can drift from the model that produces it.
 *
 * Extracted 2026-08-03 because it existed in exactly one of the two tools that score
 * the same chain. `cognitive_effort` bridged; `site_cognitive_assessment` did not, so
 * its motor layer scored against `traitValue`'s missing-trait fallback of 0.5 -- a
 * placeholder meaning "trait absent", not "this persona's pointing ability". On the
 * same page in the same run window that produced motor 0.022 in one tool and 0.058 in
 * the other, a 2.6x disagreement on the only layer whose sole trait is bridged.
 *
 * A helper rather than a copied block, deliberately. The defect IS two tools sharing
 * one model with only one of them wired to it; duplicating the block would fix this
 * instance and preserve the class.
 *
 * Mutates `traits` in place and never throws: a bridge that fails leaves the
 * dimensions ABSENT rather than defaulted, because a missing capacity is visible as a
 * gap while a defaulted one silently reads as average -- which is the exact failure
 * this function exists to end.
 *
 * Runs as persona-model work (model-provenance.ts, personaScope): the registered rates
 * it reads describe the persona and are not counted in the block of whatever score is
 * being computed. A tool reports the scored persona's rates on their own by wrapping
 * this call in collectPersonaReads.
 */
export function bridgeCapacityTraits(
  personaName: string,
  traits: Record<string, number>,
  accessibilityTraits?: Record<string, number | boolean>,
): { sigmaX: number; sigmaY: number; rho: number; throughput: number } | undefined {
  return personaScope(() => bridge(personaName, traits, accessibilityTraits));
}

function bridge(
  personaName: string,
  traits: Record<string, number>,
  accessibilityTraits?: Record<string, number | boolean>,
): { sigmaX: number; sigmaY: number; rho: number; throughput: number } | undefined {
  try {
    // A built-in persona reads at its registered rate share; a custom persona
    // at the fixation model's slowdown for its reading profile. Both against
    // the one reference reader, law.reading.wpm.
    const readingShare = registeredPersonaRate(personaName, "reading");
    traits.readingCapacity = readingShare === undefined
      ? readingCapacityOf(getReadingProfile({ name: personaName, traits, accessibilityTraits: accessibilityTraits as Record<string, number> | undefined }))
      : personaScope(() => readingCapacity(readingShare * pp("law.reading.wpm")));
    // The accessibility traits go to the pointing profile too: without them a
    // stated tremor never reached the motor capacity, and a custom persona whose
    // name does not say "tremor" was interpolated from its dispositions instead.
    const pointing = getPointingProfile({ name: personaName, traits, accessibilityTraits });
    traits.motorCapacity = motorCapacityOf(pointing);
    traits.sustainedAttention = sustainedAttentionOf({ traits, accessibilityTraits: accessibilityTraits as { attentionSpan?: number } | undefined });
    return pointing;
  } catch (e) {
    console.debug(`[capacity-bridge] unavailable: ${(e as Error).message}`);
    return undefined;
  }
}
