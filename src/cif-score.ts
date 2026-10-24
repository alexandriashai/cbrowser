/**
 * CIF -- Cognitive Interface Fitness
 *
 * 5-category scoring system measuring whether a website actually works
 * for people with specific disabilities. Scores 0-100 per category.
 *
 * Categories:
 * 1. Motor Fitness (20%)  -- can they physically interact?
 * 2. Visual Fitness (20%) -- can they see and distinguish?
 * 3. Cognitive Fitness (25%) -- can they understand and decide?
 * 4. Sensory Fitness (15%) -- can they process without overload?
 * 5. Navigation Fitness (20%) -- can they get around?
 *
 * Every number the score computes with is read through param() from
 * visual/provenance/cif.ts, which says where it comes from: five are WCAG's,
 * four are units or display choices, and the rest (the weights above among
 * them) were set by hand. tests/cif-no-literals.test.ts keeps it that way.
 *
 * MISSING INPUTS follow one rule, stated with its rationale at cif.noData.score
 * in visual/provenance/cif.ts: a component scores only from inputs the caller
 * supplied, no assumed value ever stands in for a missing one, and a component
 * with none of its inputs supplied is marked `measured: false`, scores
 * cif.noData.score, says "Not measured" in its details, is listed in
 * `notMeasured` and is never a top issue. `barriers` counts as supplied when it
 * is an array, even an empty one (an audit ran and found nothing); undefined
 * means no audit ran.
 *
 * CERTIFICATION needs every component measured. The grade is read from the
 * composite as always, but platinum, gold, silver and bronze are issued only
 * when all 25 components were measured; otherwise the certification is "none"
 * and `certificationNote` says how many were not. An unmeasured component scores
 * cif.noData.score, so without this a page with nothing measured certified
 * bronze. (Alexa, 2026-10-24.)
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 * @since v19.0.0
 */

import { param } from "./visual/model-provenance.js";
import { bandSentence, isPercentile, rankStatement } from "./visual/ctc-bands.js";

// ============================================================================
// Types
// ============================================================================

export interface CIFComponentScore {
  score: number;
  details: string;
  /**
   * False when none of the inputs this component reads was supplied: it then
   * scores cif.noData.score, its details begin "Not measured", and it is left
   * out of topIssues.
   */
  measured: boolean;
}

export interface CIFScore {
  composite: number;
  grade: string;
  /** platinum, gold, silver or bronze only when every component was measured; otherwise "none". */
  certification: string;
  /** How many of the components were not measured (the length of `notMeasured`). */
  notMeasuredCount: number;
  /**
   * The sentence a customer reads when a component went unmeasured, e.g.
   * "Not certified: 3 of 25 components not measured."; null when all were measured.
   */
  certificationNote: string | null;

  motor: {
    score: number;
    components: {
      touchTargetCompliance: CIFComponentScore;
      hitProbability: CIFComponentScore;
      interactionCount: CIFComponentScore;
      spacingAdequacy: CIFComponentScore;
      dragFreeAlternatives: CIFComponentScore;
    };
  };

  visual: {
    score: number;
    components: {
      contrastCompliance: CIFComponentScore;
      textScalability: CIFComponentScore;
      colorIndependence: CIFComponentScore;
      focusVisibility: CIFComponentScore;
      spacingDensity: CIFComponentScore;
    };
  };

  cognitive: {
    score: number;
    components: {
      decisionComplexity: CIFComponentScore;
      readability: CIFComponentScore;
      informationDensity: CIFComponentScore;
      attentionClarity: CIFComponentScore;
      predictability: CIFComponentScore;
    };
  };

  sensory: {
    score: number;
    components: {
      animationControl: CIFComponentScore;
      sensoryIndependence: CIFComponentScore;
      visualCalm: CIFComponentScore;
      layoutConsistency: CIFComponentScore;
      overloadThreshold: CIFComponentScore;
    };
  };

  navigation: {
    score: number;
    components: {
      semanticStructure: CIFComponentScore;
      keyboardOperability: CIFComponentScore;
      skipMechanisms: CIFComponentScore;
      linkButtonClarity: CIFComponentScore;
      formAccessibility: CIFComponentScore;
    };
  };

  topIssues: Array<{
    category: string;
    component: string;
    score: number;
    fix: string;
  }>;
  /** "category.component" for every component that was not measured, so the grade is never read without them. */
  notMeasured: string[];
  url: string;
  timestamp: string;
}

export interface CIFInput {
  // From empathy_audit
  barriers?: Array<{
    type: string;
    severity: string;
    element?: string;
    description?: string;
    wcagCriteria?: string[];
    /**
     * The persona-weight key empathy_audit's detector set, if any. Its
     * close-spacing barrier (type motor_precision) carries "target_spacing";
     * spacingAdequacy counts those and keyboardOperability skips them, so the
     * barrier is counted once.
     */
    weightKey?: string;
  }>;
  touchTargets?: Array<{
    width: number;
    height: number;
    exempt?: boolean;
  }>;
  contrastIssues?: Array<{
    ratio: number;
    isLargeText: boolean;
    element?: string;
  }>;

  // From agent_ready_audit
  agentReadyScore?: number;
  semanticScore?: number;
  ariaScore?: number;
  landmarkScore?: number;
  headingScore?: number;
  formLabelScore?: number;

  // From cognitive_effort CTC
  totalCTC?: number;
  layers?: Array<{ name: string; cost: number }>;
  abandonmentRisk?: number;

  // From page_understand
  pageType?: string;
  elementCount?: number;
  interactiveCount?: number;
  formFieldCount?: number;
  navItemCount?: number;
  linkCount?: number;
  imageCount?: number;
  animationCount?: number;
  hasReducedMotionSupport?: boolean;

  // From attention_analysis
  ctaCaptureRate?: number;
  distractorRatio?: number;
  attentionQualityScore?: number;

  // Text metrics
  avgSentenceLength?: number;
  fleschScore?: number;
  technicalDensity?: number;
  informationDensity?: number;

  url: string;
}

// ============================================================================
// Utility functions
// ============================================================================

/** Read every id in `ids` through param(); one object per call so the reads are recorded. */
function readParams<K extends string>(ids: Record<K, string>): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const k in ids) out[k] = param(ids[k]);
  return out;
}

/** Clamp value between 0 and the top of the scale */
function clamp(val: number): number {
  return Math.max(0, Math.min(param("cif.scale.max"), val));
}

/** Sigmoid function centered at 0, scaled to [0, 1] */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Weighted average of component scores */
function weightedAvg(components: Array<{ score: number; weight: number }>): number {
  const empty = param("cif.emptyAverage");
  let totalWeight = 0;
  let totalScore = 0;
  for (const c of components) {
    totalScore += c.score * c.weight;
    totalWeight += c.weight;
  }
  return totalWeight > 0 ? totalScore / totalWeight : empty;
}

/** True when the caller supplied a usable number (not null, undefined or NaN). */
function supplied(val: number | undefined | null): val is number {
  return val != null && !Number.isNaN(val);
}

/** A measured component score. */
function measured(score: number, details: string): CIFComponentScore {
  return { score, details, measured: true };
}

/** A component none of whose inputs was supplied; `missing` names them. See cif.noData.score. */
function notMeasured(missing: string): CIFComponentScore {
  return { score: param("cif.noData.score"), details: `Not measured: no ${missing} supplied`, measured: false };
}

/**
 * Score at the knee of a two-slope piecewise component: where the slope from
 * the free point reaches it. Derived rather than registered, so the branch
 * above the knee always starts where the branch below ends. overloadThreshold
 * stepped from 61 to 60 at its knee because its knee score was a separate
 * constant (21.0).
 */
function kneeScore(top: number, free: number, knee: number, slopeBelow: number): number {
  return top - (knee - free) * slopeBelow;
}

/** Count barriers of a given type */
function countBarriersByType(
  barriers: CIFInput["barriers"],
  type: string,
): number {
  if (!barriers) return 0;
  return barriers.filter((b) => b.type === type).length;
}

type Barrier = NonNullable<CIFInput["barriers"]>[number];

/** Does a barrier's type or description contain `pattern`? */
function matchesBarrier(b: Barrier, pattern: string): boolean {
  const p = pattern.toLowerCase();
  return b.type.toLowerCase().includes(p) || (b.description || "").toLowerCase().includes(p);
}

/** Count barriers matching a substring in type or description */
function countBarriersMatching(
  barriers: CIFInput["barriers"],
  pattern: string,
): number {
  if (!barriers) return 0;
  return barriers.filter((b) => matchesBarrier(b, pattern)).length;
}

/** empathy_audit's close-spacing barrier, which it weights as target_spacing. */
function isCloseSpacing(b: Barrier): boolean {
  return b.weightKey === "target_spacing";
}

function countCloseSpacingBarriers(barriers: CIFInput["barriers"]): number {
  return barriers ? barriers.filter(isCloseSpacing).length : 0;
}

// ============================================================================
// Category Scorers
// ============================================================================

const MOTOR_IDS = {
  scale: "cif.scale.max",
  targetPx: "cif.wcag.targetSizeEnhancedPx",
  touchBarrierPenalty: "cif.motor.touchTarget.barrierPenalty",
  touchBarrierFloor: "cif.motor.touchTarget.barrierFloor",
  hitMidpointPx: "cif.motor.hit.midpointPx",
  hitScalePx: "cif.motor.hit.scalePx",
  interactiveFree: "cif.motor.interactive.freeCount",
  interactiveKnee: "cif.motor.interactive.kneeCount",
  interactiveSlopeBelow: "cif.motor.interactive.slopeBelowKnee",
  interactiveSlopeAbove: "cif.motor.interactive.slopeAboveKnee",
  spacingBarrierPenalty: "cif.motor.spacing.barrierPenalty",
  spacingGapPx: "cif.motor.spacing.minGapPx",
  dragBarrierPenalty: "cif.motor.drag.barrierPenalty",
  wTouchTarget: "cif.motor.weight.touchTargetCompliance",
  wHit: "cif.motor.weight.hitProbability",
  wInteraction: "cif.motor.weight.interactionCount",
  wSpacing: "cif.motor.weight.spacingAdequacy",
  wDrag: "cif.motor.weight.dragFreeAlternatives",
} as const;

function computeMotorFitness(data: CIFInput): CIFScore["motor"] {
  const P = readParams(MOTOR_IDS);
  const targets = data.touchTargets && data.touchTargets.length > 0 ? data.touchTargets : null;

  // --- touchTargetCompliance (30%) ---
  let touchTargetCompliance: CIFComponentScore;
  if (targets) {
    const nonExempt = targets.filter((t) => !t.exempt);
    if (nonExempt.length === 0) {
      touchTargetCompliance = measured(P.scale, "All interactive elements are exempt from size requirements");
    } else {
      const compliant = nonExempt.filter(
        (t) => Math.min(t.width, t.height) >= P.targetPx,
      ).length;
      const pct = (compliant / nonExempt.length) * P.scale;
      touchTargetCompliance = measured(
        clamp(Math.round(pct)),
        `${compliant}/${nonExempt.length} interactive elements meet ${P.targetPx}px minimum (${Math.round(pct)}%)`,
      );
    }
  } else if (data.barriers) {
    // No sizes: fall back to the audit's touch_target barriers
    const touchBarriers = countBarriersByType(data.barriers, "touch_target");
    touchTargetCompliance = measured(
      clamp(Math.max(P.touchBarrierFloor, P.scale - touchBarriers * P.touchBarrierPenalty)),
      touchBarriers > 0
        ? `${touchBarriers} touch target barriers detected (no size data; scored from barriers)`
        : "No touch target barriers detected (no size data; scored from barriers)",
    );
  } else {
    touchTargetCompliance = notMeasured("touch target sizes or audit barriers");
  }

  // --- hitProbability (25%) ---
  let hitProbability: CIFComponentScore;
  if (targets) {
    const nonExempt = targets.filter((t) => !t.exempt);
    if (nonExempt.length === 0) {
      hitProbability = measured(P.scale, "No non-exempt interactive elements");
    } else {
      const avgMinDim =
        nonExempt.reduce((sum, t) => sum + Math.min(t.width, t.height), 0) /
        nonExempt.length;
      const score = sigmoid((avgMinDim - P.hitMidpointPx) / P.hitScalePx) * P.scale;
      hitProbability = measured(
        clamp(Math.round(score)),
        `Average minimum dimension: ${Math.round(avgMinDim)}px (sigmoid-scored)`,
      );
    }
  } else {
    hitProbability = notMeasured("touch target sizes");
  }

  // --- interactionCount (20%) ---
  // Under the free count interactive elements are fine; penalize progressively above that
  let interactionCount: CIFComponentScore;
  if (supplied(data.interactiveCount)) {
    const interactiveCount = data.interactiveCount;
    const interactionCountScore = interactiveCount <= P.interactiveFree ? P.scale
      : interactiveCount <= P.interactiveKnee ? clamp(Math.round(P.scale - (interactiveCount - P.interactiveFree) * P.interactiveSlopeBelow))
      : clamp(Math.round(kneeScore(P.scale, P.interactiveFree, P.interactiveKnee, P.interactiveSlopeBelow) - (interactiveCount - P.interactiveKnee) * P.interactiveSlopeAbove));
    interactionCount = measured(
      interactionCountScore,
      interactiveCount <= P.interactiveFree
        ? `${interactiveCount} interactive elements — manageable for motor impairments`
        : `${interactiveCount} interactive elements on page (fewer is easier for motor impairments)`,
    );
  } else {
    interactionCount = notMeasured("interactive element count");
  }

  // --- spacingAdequacy (15%) ---
  // Reads only the audit's close-spacing barrier. touch_target barriers are SIZE
  // findings and belong to touchTargetCompliance; counting them here too
  // penalised a page twice for the same barrier.
  let spacingAdequacy: CIFComponentScore;
  if (data.barriers) {
    const closeSpacing = countCloseSpacingBarriers(data.barriers);
    spacingAdequacy = measured(
      clamp(Math.round(P.scale - closeSpacing * P.spacingBarrierPenalty)),
      closeSpacing > 0
        ? `${closeSpacing} close-spacing barriers detected (interactive elements under ${P.spacingGapPx}px apart)`
        : "No close-spacing barriers detected",
    );
  } else {
    spacingAdequacy = notMeasured("audit barriers");
  }

  // --- dragFreeAlternatives (10%) ---
  let dragFreeAlternatives: CIFComponentScore;
  if (data.barriers) {
    const dragBarriers = countBarriersMatching(data.barriers, "drag");
    dragFreeAlternatives = measured(
      clamp(P.scale - dragBarriers * P.dragBarrierPenalty),
      dragBarriers > 0
        ? `${dragBarriers} drag-dependent interactions found without alternatives`
        : "No drag-dependent interactions detected",
    );
  } else {
    dragFreeAlternatives = notMeasured("audit barriers");
  }

  const components = {
    touchTargetCompliance,
    hitProbability,
    interactionCount,
    spacingAdequacy,
    dragFreeAlternatives,
  };

  const score = clamp(
    Math.round(
      weightedAvg([
        { score: touchTargetCompliance.score, weight: P.wTouchTarget },
        { score: hitProbability.score, weight: P.wHit },
        { score: interactionCount.score, weight: P.wInteraction },
        { score: spacingAdequacy.score, weight: P.wSpacing },
        { score: dragFreeAlternatives.score, weight: P.wDrag },
      ]),
    ),
  );

  return { score, components };
}

const VISUAL_IDS = {
  scale: "cif.scale.max",
  normalText: "cif.wcag.contrastNormalText",
  largeText: "cif.wcag.contrastLargeText",
  contrastBarrierPenalty: "cif.visual.contrast.barrierPenalty",
  proxySlope: "cif.visual.contrast.proxySlope",
  proxyIntercept: "cif.visual.contrast.proxyIntercept",
  densityKnee: "cif.visual.textScalability.densityKnee",
  scalabilitySlope: "cif.visual.textScalability.slope",
  resizePct: "cif.wcag.resizeTextPercent",
  colorBarrierPenalty: "cif.visual.color.barrierPenalty",
  wContrast: "cif.visual.weight.contrastCompliance",
  wScalability: "cif.visual.weight.textScalability",
  wColor: "cif.visual.weight.colorIndependence",
  wFocus: "cif.visual.weight.focusVisibility",
  wSpacing: "cif.visual.weight.spacingDensity",
} as const;

function computeVisualFitness(data: CIFInput): CIFScore["visual"] {
  const P = readParams(VISUAL_IDS);

  // --- contrastCompliance (30%) ---
  let contrastCompliance: CIFComponentScore;
  const contrastBarriers = countBarriersByType(data.barriers, "contrast");
  if (data.contrastIssues && data.contrastIssues.length > 0) {
    const issues = data.contrastIssues.length;
    const failingNormalText = data.contrastIssues.filter(
      (c) => !c.isLargeText && c.ratio < P.normalText,
    ).length;
    const failingLargeText = data.contrastIssues.filter(
      (c) => c.isLargeText && c.ratio < P.largeText,
    ).length;
    const breakdown = `${failingNormalText} normal text below ${P.normalText}:1, ${failingLargeText} large text below ${P.largeText}:1`;
    if (supplied(data.elementCount)) {
      // Share of elements with an issue, the element count standing in for the text elements checked
      const failRatio = issues / Math.max(data.elementCount, issues);
      contrastCompliance = measured(
        clamp(Math.round(P.scale - failRatio * P.scale)),
        `${issues} contrast issues among ${Math.max(data.elementCount, issues)} elements (${breakdown})`,
      );
    } else {
      // No element count, so no share: scored per issue, like contrast barriers
      contrastCompliance = measured(
        clamp(P.scale - issues * P.contrastBarrierPenalty),
        `${issues} contrast issues (${breakdown}); no element count, so scored per issue`,
      );
    }
  } else if (contrastBarriers > 0) {
    contrastCompliance = measured(
      clamp(P.scale - contrastBarriers * P.contrastBarrierPenalty),
      `${contrastBarriers} contrast barriers detected`,
    );
  } else if (supplied(data.agentReadyScore)) {
    // Use agent_ready accessibility subscore as proxy
    contrastCompliance = measured(
      clamp(Math.round(data.agentReadyScore * P.proxySlope + P.proxyIntercept)),
      "No contrast data -- estimated from agent-ready accessibility score",
    );
  } else {
    contrastCompliance = notMeasured("contrast issues, contrast barriers or agent-ready score");
  }

  // --- textScalability (20%) ---
  // A proxy: nothing is zoomed. Penalised only when density is high enough that
  // zooming would plausibly break the layout; the details say it was not checked.
  let textScalability: CIFComponentScore;
  if (supplied(data.informationDensity)) {
    const density = data.informationDensity;
    const scalabilityDeduction = density > P.densityKnee ? (density - P.densityKnee) * P.scalabilitySlope : 0;
    textScalability = measured(
      clamp(Math.round(P.scale - scalabilityDeduction)),
      scalabilityDeduction > 0
        ? `High density (${(density * P.scale).toFixed(0)}%) may cause overlap at ${P.resizePct}% zoom (-${Math.round(scalabilityDeduction)}); estimated from density, the page was not zoomed`
        : `Information density ${(density * P.scale).toFixed(0)}% is at or below ${(P.densityKnee * P.scale).toFixed(0)}%, so no deduction; resizing text to ${P.resizePct}% (WCAG 1.4.4) was not checked`,
    );
  } else {
    textScalability = notMeasured("information density");
  }

  // --- colorIndependence (20%) ---
  let colorIndependence: CIFComponentScore;
  if (data.barriers) {
    const colorOnlyBarriers = countBarriersMatching(data.barriers, "color");
    colorIndependence = measured(
      clamp(P.scale - colorOnlyBarriers * P.colorBarrierPenalty),
      colorOnlyBarriers > 0
        ? `${colorOnlyBarriers} color-only information barriers detected`
        : "No color-only information barriers detected",
    );
  } else {
    colorIndependence = notMeasured("audit barriers");
  }

  // --- focusVisibility (15%) ---
  let focusVisibility: CIFComponentScore;
  if (supplied(data.semanticScore)) {
    focusVisibility = measured(
      clamp(Math.round(data.semanticScore)),
      `Estimated from semantic score (${Math.round(data.semanticScore)}/${P.scale})`,
    );
  } else if (supplied(data.agentReadyScore)) {
    focusVisibility = measured(
      clamp(Math.round(data.agentReadyScore)),
      `Estimated from agent-ready score (${Math.round(data.agentReadyScore)}/${P.scale})`,
    );
  } else {
    focusVisibility = notMeasured("semantic or agent-ready score");
  }

  // --- spacingDensity (15%) ---
  const spacingDensity: CIFComponentScore = supplied(data.informationDensity)
    ? measured(
      clamp(Math.round(P.scale - data.informationDensity * P.scale)),
      `Information density: ${(data.informationDensity * P.scale).toFixed(0)}% (lower is better for visual processing)`,
    )
    : notMeasured("information density");

  const components = {
    contrastCompliance,
    textScalability,
    colorIndependence,
    focusVisibility,
    spacingDensity,
  };

  const score = clamp(
    Math.round(
      weightedAvg([
        { score: contrastCompliance.score, weight: P.wContrast },
        { score: textScalability.score, weight: P.wScalability },
        { score: colorIndependence.score, weight: P.wColor },
        { score: focusVisibility.score, weight: P.wFocus },
        { score: spacingDensity.score, weight: P.wSpacing },
      ]),
    ),
  );

  return { score, components };
}

const COGNITIVE_IDS = {
  scale: "cif.scale.max",
  costDecimals: "cif.display.costDecimals",
  decisionCostSlope: "cif.cognitive.decision.costSlope",
  fleschGain: "cif.cognitive.readability.fleschGain",
  densityFree: "cif.cognitive.density.freeCount",
  densityKnee: "cif.cognitive.density.kneeCount",
  densityDivisorBelow: "cif.cognitive.density.divisorBelowKnee",
  densityDivisorAbove: "cif.cognitive.density.divisorAboveKnee",
  captureGain: "cif.cognitive.attention.captureGain",
  navFree: "cif.cognitive.predictability.freeCount",
  navSlope: "cif.cognitive.predictability.slope",
  wDecision: "cif.cognitive.weight.decisionComplexity",
  wReadability: "cif.cognitive.weight.readability",
  wDensity: "cif.cognitive.weight.informationDensity",
  wAttention: "cif.cognitive.weight.attentionClarity",
  wPredictability: "cif.cognitive.weight.predictability",
} as const;

function computeCognitiveFitness(data: CIFInput): CIFScore["cognitive"] {
  const P = readParams(COGNITIVE_IDS);

  // --- decisionComplexity (25%) ---
  const decisionLayer = data.layers?.find(
    (l) => l.name.toLowerCase().includes("decision") || l.name.toLowerCase().includes("choice"),
  );
  const decisionComplexity: CIFComponentScore = decisionLayer
    ? measured(
      clamp(Math.round(P.scale - decisionLayer.cost * P.decisionCostSlope)),
      `Decision layer cost: ${decisionLayer.cost.toFixed(P.costDecimals)} (lower is better)`,
    )
    : notMeasured(data.layers && data.layers.length > 0 ? "decision or choice layer among the CTC layers" : "CTC layers");

  // --- readability (20%) ---
  const readability: CIFComponentScore = supplied(data.fleschScore)
    ? measured(
      clamp(Math.round(Math.min(P.scale, data.fleschScore * P.fleschGain))),
      `Flesch readability score: ${Math.round(data.fleschScore)} (higher = more readable)`,
    )
    : notMeasured("Flesch reading-ease score");

  // --- informationDensity (20%) ---
  // A well-structured page can have many elements without being overwhelming.
  // Only penalize when element count is extremely high relative to viewport.
  // Threshold: the free count is fine, the knee starts getting dense, 2000+ is overwhelming.
  let informationDensity: CIFComponentScore;
  if (supplied(data.elementCount)) {
    const elemCount = data.elementCount;
    const infoScore = elemCount <= P.densityFree ? P.scale
      : elemCount <= P.densityKnee ? clamp(Math.round(P.scale - (elemCount - P.densityFree) / P.densityDivisorBelow))
      : clamp(Math.round(kneeScore(P.scale, P.densityFree, P.densityKnee, 1 / P.densityDivisorBelow) - (elemCount - P.densityKnee) / P.densityDivisorAbove));
    informationDensity = measured(
      infoScore,
      elemCount <= P.densityFree
        ? `${elemCount} elements — well within cognitive limits`
        : `${elemCount} elements on page (progressive penalty above ${P.densityFree})`,
    );
  } else {
    informationDensity = notMeasured("element count");
  }

  // --- attentionClarity (20%) ---
  const attentionClarity: CIFComponentScore = supplied(data.ctaCaptureRate)
    ? measured(
      clamp(Math.round(Math.min(P.scale, data.ctaCaptureRate * P.captureGain))),
      `CTA capture rate: ${(data.ctaCaptureRate * P.scale).toFixed(1)}% (higher = clearer attention guidance)`,
    )
    : notMeasured("CTA capture rate");

  // --- predictability (15%) ---
  let predictability: CIFComponentScore;
  if (supplied(data.navItemCount)) {
    const navItems = data.navItemCount;
    // One slope above the free count. The knee at 12 it replaced joined two equal
    // slopes, so it changed no score (21.0).
    predictability = measured(
      navItems <= P.navFree ? P.scale : clamp(Math.round(P.scale - (navItems - P.navFree) * P.navSlope)),
      navItems <= P.navFree
        ? `${navItems} navigation items — clear, predictable structure`
        : `${navItems} navigation items (${P.navFree} or fewer is optimal for cognitive predictability)`,
    );
  } else {
    predictability = notMeasured("navigation item count");
  }

  const components = {
    decisionComplexity,
    readability,
    informationDensity,
    attentionClarity,
    predictability,
  };

  const score = clamp(
    Math.round(
      weightedAvg([
        { score: decisionComplexity.score, weight: P.wDecision },
        { score: readability.score, weight: P.wReadability },
        { score: informationDensity.score, weight: P.wDensity },
        { score: attentionClarity.score, weight: P.wAttention },
        { score: predictability.score, weight: P.wPredictability },
      ]),
    ),
  );

  return { score, components };
}

const SENSORY_IDS = {
  scale: "cif.scale.max",
  costDecimals: "cif.display.costDecimals",
  controlledFloor: "cif.sensory.animation.controlledFloor",
  controlledPenalty: "cif.sensory.animation.controlledPenalty",
  uncontrolledPenalty: "cif.sensory.animation.uncontrolledPenalty",
  audioBarrierPenalty: "cif.sensory.audio.barrierPenalty",
  calmDensityWeight: "cif.sensory.calm.densityWeight",
  calmAnimationPenalty: "cif.sensory.calm.animationPenalty",
  // The verdict bands' cut points (provenance/ctc-reference.ts), not CIF's own:
  // totalCTC is a percentile of real pages since 21.x, and CIF's 0.3 and 0.6
  // were cuts on the logistic it used to be.
  easyCTC: "ctcBands.upperHalf",
  kneeCTC: "ctcBands.high",
  overloadSlopeBelow: "cif.sensory.overload.slopeBelowKnee",
  overloadSlopeAbove: "cif.sensory.overload.slopeAboveKnee",
  wAnimation: "cif.sensory.weight.animationControl",
  wIndependence: "cif.sensory.weight.sensoryIndependence",
  wCalm: "cif.sensory.weight.visualCalm",
  wLayout: "cif.sensory.weight.layoutConsistency",
  wOverload: "cif.sensory.weight.overloadThreshold",
} as const;

function computeSensoryFitness(data: CIFInput): CIFScore["sensory"] {
  const P = readParams(SENSORY_IDS);

  // --- animationControl (30%) ---
  // With prefers-reduced-motion support, animations are user-controllable → a small tax per animation, down to the floor.
  // Without support, each animation is a hard penalty. With animations and no support flag, the score is not measured.
  const motionSupport = data.hasReducedMotionSupport;
  let animationControl: CIFComponentScore;
  if (!supplied(data.animationCount)) {
    animationControl = notMeasured("animation count");
  } else if (data.animationCount === 0) {
    animationControl = measured(P.scale, "No animations detected");
  } else if (motionSupport === true) {
    animationControl = measured(
      clamp(Math.max(P.controlledFloor, P.scale - data.animationCount * P.controlledPenalty)), // floor-to-top range — minor tax for quantity
      `${data.animationCount} animations detected — prefers-reduced-motion supported (user can disable)`,
    );
  } else if (motionSupport === false) {
    animationControl = measured(
      clamp(Math.round(P.scale - data.animationCount * P.uncontrolledPenalty)),
      `${data.animationCount} animations detected without motion preference support (each deducts ${P.uncontrolledPenalty} points)`,
    );
  } else {
    animationControl = notMeasured(`prefers-reduced-motion support flag for the ${data.animationCount} animations detected`);
  }

  // --- sensoryIndependence (25%) ---
  let sensoryIndependence: CIFComponentScore;
  if (data.barriers) {
    // Each barrier once, even when it mentions both captions and audio
    const sensoryBarriers = data.barriers.filter((b) => matchesBarrier(b, "caption") || matchesBarrier(b, "audio")).length;
    sensoryIndependence = measured(
      clamp(P.scale - sensoryBarriers * P.audioBarrierPenalty),
      sensoryBarriers > 0
        ? `${sensoryBarriers} audio/caption barriers (each deducts ${P.audioBarrierPenalty})`
        : "No audio/caption accessibility barriers detected",
    );
  } else {
    sensoryIndependence = notMeasured("audit barriers");
  }

  // --- visualCalm (20%) ---
  // Density is the input; animations adjust it only when their count and, if any, their motion support are known.
  // If animations are user-controllable, they don't contribute to visual noise.
  let visualCalm: CIFComponentScore;
  if (supplied(data.informationDensity)) {
    const density = data.informationDensity;
    const densityText = `Information density: ${(density * P.scale).toFixed(0)}%`;
    let animCalmPenalty = 0;
    let animText: string;
    if (!supplied(data.animationCount)) {
      animText = ", animations not measured";
    } else if (motionSupport === true) {
      animText = " (animations controllable via prefers-reduced-motion)";
    } else if (motionSupport === false || data.animationCount === 0) {
      animCalmPenalty = data.animationCount * P.calmAnimationPenalty;
      animText = `, ${data.animationCount} uncontrolled animations`;
    } else {
      animText = `, ${data.animationCount} animations (prefers-reduced-motion support not measured)`;
    }
    visualCalm = measured(
      clamp(Math.round(P.scale - density * P.calmDensityWeight - animCalmPenalty)),
      `${densityText}${animText}`,
    );
  } else {
    visualCalm = notMeasured("information density");
  }

  // --- layoutConsistency (15%) ---
  const layoutConsistency: CIFComponentScore = supplied(data.agentReadyScore)
    ? measured(
      clamp(Math.round(data.agentReadyScore)),
      `Layout consistency derived from structural score (${Math.round(data.agentReadyScore)}/${P.scale})`,
    )
    : notMeasured("agent-ready score");

  // --- overloadThreshold (10%) ---
  // totalCTC is a percentile of real pages. Full marks through the lower half
  // (ctcBands.upperHalf), sloping to the knee at the high band (ctcBands.high),
  // then steeper. The details state the rank; the CTC is untested against
  // human data, so they say nothing about how easy the page is.
  let overloadThreshold: CIFComponentScore;
  if (supplied(data.totalCTC) && !isPercentile(data.totalCTC)) {
    // A value outside zero to one is from another scale (a raw cost, or a
    // number from before 21.x): it has no rank to score.
    overloadThreshold = notMeasured(`percentile total CTC (${data.totalCTC} is not a percentile, so it is from another scale and has no rank among the real pages we measured)`);
  } else if (supplied(data.totalCTC)) {
    const totalCTC = data.totalCTC;
    const overloadScore = totalCTC <= P.easyCTC ? P.scale
      : totalCTC <= P.kneeCTC ? clamp(Math.round(P.scale - (totalCTC - P.easyCTC) * P.overloadSlopeBelow))
      : clamp(Math.round(kneeScore(P.scale, P.easyCTC, P.kneeCTC, P.overloadSlopeBelow) - (totalCTC - P.kneeCTC) * P.overloadSlopeAbove));
    overloadThreshold = measured(
      overloadScore,
      `Total CTC ${totalCTC.toFixed(P.costDecimals)}: ${rankStatement(totalCTC)}. ${bandSentence(totalCTC)}`,
    );
  } else {
    overloadThreshold = notMeasured("total CTC");
  }

  const components = {
    animationControl,
    sensoryIndependence,
    visualCalm,
    layoutConsistency,
    overloadThreshold,
  };

  const score = clamp(
    Math.round(
      weightedAvg([
        { score: animationControl.score, weight: P.wAnimation },
        { score: sensoryIndependence.score, weight: P.wIndependence },
        { score: visualCalm.score, weight: P.wCalm },
        { score: layoutConsistency.score, weight: P.wLayout },
        { score: overloadThreshold.score, weight: P.wOverload },
      ]),
    ),
  );

  return { score, components };
}

const NAVIGATION_IDS = {
  scale: "cif.scale.max",
  keyboardBarrierPenalty: "cif.navigation.keyboard.barrierPenalty",
  skipBarrierPenalty: "cif.navigation.skip.barrierPenalty",
  formBarrierPenalty: "cif.navigation.form.barrierPenalty",
  wSemantic: "cif.navigation.weight.semanticStructure",
  wKeyboard: "cif.navigation.weight.keyboardOperability",
  wSkip: "cif.navigation.weight.skipMechanisms",
  wLinkButton: "cif.navigation.weight.linkButtonClarity",
  wForm: "cif.navigation.weight.formAccessibility",
} as const;

function computeNavigationFitness(data: CIFInput): CIFScore["navigation"] {
  const P = readParams(NAVIGATION_IDS);

  // --- semanticStructure (25%) ---
  const subScores: number[] = [];
  if (data.semanticScore != null) subScores.push(data.semanticScore);
  if (data.headingScore != null) subScores.push(data.headingScore);
  if (data.landmarkScore != null) subScores.push(data.landmarkScore);
  let semanticStructure: CIFComponentScore;
  if (subScores.length > 0) {
    const semanticAvg = subScores.reduce((a, b) => a + b, 0) / subScores.length;
    semanticStructure = measured(
      clamp(Math.round(semanticAvg)),
      `Average of ${subScores.length} semantic sub-scores: ${Math.round(semanticAvg)}/${P.scale}`,
    );
  } else if (supplied(data.agentReadyScore)) {
    semanticStructure = measured(
      clamp(Math.round(data.agentReadyScore)),
      `Estimated from agent-ready score: ${Math.round(data.agentReadyScore)}/${P.scale}`,
    );
  } else {
    semanticStructure = notMeasured("semantic, heading or landmark score, or agent-ready score");
  }

  // --- keyboardOperability (25%) ---
  let keyboardOperability: CIFComponentScore;
  if (data.barriers) {
    // Each barrier once: a keyboard finding, or a motor_precision one other than
    // the close-spacing barrier (spacingAdequacy counts that)
    const kbBarriers = data.barriers.filter(
      (b) => matchesBarrier(b, "keyboard") || (b.type === "motor_precision" && !isCloseSpacing(b)),
    ).length;
    keyboardOperability = measured(
      clamp(P.scale - kbBarriers * P.keyboardBarrierPenalty),
      kbBarriers > 0
        ? `${kbBarriers} keyboard/motor barriers detected`
        : "No keyboard accessibility barriers detected",
    );
  } else {
    keyboardOperability = notMeasured("audit barriers");
  }

  // --- skipMechanisms (15%) ---
  let skipMechanisms: CIFComponentScore;
  if (data.barriers) {
    const skipBarriers = countBarriersMatching(data.barriers, "skip");
    skipMechanisms = measured(
      clamp(P.scale - skipBarriers * P.skipBarrierPenalty),
      skipBarriers > 0
        ? `${skipBarriers} skip mechanism issues detected`
        : "No skip navigation issues detected",
    );
  } else {
    skipMechanisms = notMeasured("audit barriers");
  }

  // --- linkButtonClarity (15%) ---
  const linkButtonClarity: CIFComponentScore = supplied(data.ariaScore)
    ? measured(clamp(Math.round(data.ariaScore)), `ARIA label score: ${Math.round(data.ariaScore)}/${P.scale}`)
    : notMeasured("ARIA score");

  // --- formAccessibility (20%) ---
  // The label score is the base; the audit's form barriers deduct from it. Either alone is a measurement.
  let formAccessibility: CIFComponentScore;
  if (supplied(data.formLabelScore) || data.barriers) {
    const labelScore = supplied(data.formLabelScore) ? data.formLabelScore : null;
    const formBarriers = data.barriers ? countBarriersMatching(data.barriers, "form") : 0;
    const labelText = labelScore !== null ? `Form label score: ${Math.round(labelScore)}/${P.scale}` : "Form label score not measured";
    const barrierText = !data.barriers ? ", form barriers not measured"
      : formBarriers > 0 ? `, ${formBarriers} form barriers` : "";
    formAccessibility = measured(
      clamp(Math.round((labelScore ?? P.scale) - formBarriers * P.formBarrierPenalty)),
      `${labelText}${barrierText}`,
    );
  } else {
    formAccessibility = notMeasured("form label score or audit barriers");
  }

  const components = {
    semanticStructure,
    keyboardOperability,
    skipMechanisms,
    linkButtonClarity,
    formAccessibility,
  };

  const score = clamp(
    Math.round(
      weightedAvg([
        { score: semanticStructure.score, weight: P.wSemantic },
        { score: keyboardOperability.score, weight: P.wKeyboard },
        { score: skipMechanisms.score, weight: P.wSkip },
        { score: linkButtonClarity.score, weight: P.wLinkButton },
        { score: formAccessibility.score, weight: P.wForm },
      ]),
    ),
  );

  return { score, components };
}

// ============================================================================
// Grading & Certification
// ============================================================================

const GRADE_IDS = {
  aPlus: "cif.grade.aPlus",
  a: "cif.grade.a",
  b: "cif.grade.b",
  c: "cif.grade.c",
  d: "cif.grade.d",
} as const;

function computeGrade(composite: number): string {
  const G = readParams(GRADE_IDS);
  if (composite >= G.aPlus) return "A+";
  if (composite >= G.a) return "A";
  if (composite >= G.b) return "B";
  if (composite >= G.c) return "C";
  if (composite >= G.d) return "D";
  return "F";
}

const CERTIFICATION_IDS = {
  platinum: "cif.certification.platinum",
  gold: "cif.certification.gold",
  silver: "cif.certification.silver",
  bronze: "cif.certification.bronze",
} as const;

function computeCertification(
  motor: number,
  visual: number,
  cognitive: number,
  sensory: number,
  navigation: number,
): string {
  const C = readParams(CERTIFICATION_IDS);
  const all = [motor, visual, cognitive, sensory, navigation];
  const minScore = Math.min(...all);
  if (minScore >= C.platinum) return "platinum";
  if (minScore >= C.gold) return "gold";
  if (minScore >= C.silver) return "silver";
  if (minScore >= C.bronze) return "bronze";
  return "none";
}

// ============================================================================
// Fix Recommendations
// ============================================================================

// Every number a fix quotes is one of these, so the advice cannot drift from
// the scorer (tests/cif-fix-text.test.ts parses this file to hold it there).
const FIX_IDS = {
  scale: "cif.scale.max",
  targetPx: "cif.wcag.targetSizeEnhancedPx",
  normalText: "cif.wcag.contrastNormalText",
  largeText: "cif.wcag.contrastLargeText",
  nonTextContrast: "cif.wcag.nonTextContrast",
  resizePct: "cif.wcag.resizeTextPercent",
  interactiveFree: "cif.motor.interactive.freeCount",
  spacingGapPx: "cif.motor.spacing.minGapPx",
  densityKnee: "cif.visual.textScalability.densityKnee",
  choiceThreshold: "cif.fix.decision.choiceThreshold",
  fleschGain: "cif.cognitive.readability.fleschGain",
  elementsFree: "cif.cognitive.density.freeCount",
  navFree: "cif.cognitive.predictability.freeCount",
} as const;

/** Fix text for a measured component. Exported for tests; topIssues is the only caller. */
export function generateFixRecommendation(
  category: string,
  component: string,
  score: number,
  data: CIFInput,
): string {
  const F = readParams(FIX_IDS);
  const key = `${category}.${component}`;
  switch (key) {
    case "motor.touchTargetCompliance": {
      const count = data.touchTargets
        ? data.touchTargets.filter((t) => !t.exempt && Math.min(t.width, t.height) < F.targetPx).length
        : countBarriersByType(data.barriers, "touch_target");
      return `Increase ${count || "undersized"} interactive element sizes to at least ${F.targetPx}x${F.targetPx}px (WCAG 2.5.5 AAA)`;
    }
    case "motor.hitProbability": {
      const sizes = (data.touchTargets ?? []).filter((t) => !t.exempt).map((t) => Math.min(t.width, t.height));
      const avg = sizes.length > 0 ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : null;
      return `Increase interactive element sizes${avg !== null ? ` (smaller side ${avg}px on average)` : ""} toward ${F.targetPx}x${F.targetPx}px (WCAG 2.5.5 AAA) for reliable motor access`;
    }
    case "motor.interactionCount":
      return `Reduce interactive elements on a single view from ${data.interactiveCount} to ${F.interactiveFree} or fewer`;
    case "motor.spacingAdequacy":
      return `Space adjacent interactive elements at least ${F.spacingGapPx}px apart (the gap below which the close-spacing barrier is reported) to prevent mis-taps`;
    case "motor.dragFreeAlternatives":
      return "Provide keyboard/click alternatives for all drag-and-drop interactions";

    case "visual.contrastCompliance": {
      const count = data.contrastIssues?.length || countBarriersByType(data.barriers, "contrast");
      return `Fix ${count} elements with contrast ratios below ${F.normalText}:1 for normal text or ${F.largeText}:1 for large text`;
    }
    case "visual.textScalability":
      return `Ensure text resizes to ${F.resizePct}% without loss of content or functionality (WCAG 1.4.4); this score is estimated from information density and the page was not zoomed`;
    case "visual.colorIndependence":
      return "Add non-color indicators (icons, patterns, text labels) wherever color conveys meaning";
    case "visual.focusVisibility":
      return `Ensure every interactive element has a visible focus indicator (WCAG 2.4.7) with at least ${F.nonTextContrast}:1 contrast against adjacent colors (WCAG 1.4.11)`;
    case "visual.spacingDensity":
      return `Increase whitespace between content blocks to lower information density${supplied(data.informationDensity) ? ` (now ${(data.informationDensity * F.scale).toFixed(0)}%)` : ""}; above ${(F.densityKnee * F.scale).toFixed(0)}% textScalability is penalised too`;

    case "cognitive.decisionComplexity": {
      const choices = data.interactiveCount;
      if (supplied(choices) && choices > F.choiceThreshold) {
        return `Reduce choices from ${choices} to ${F.choiceThreshold} or fewer per decision point (decision time grows with the number of options: Hick-Hyman law)`;
      }
      return "Simplify decision points -- group related options, provide defaults, reduce choices per step";
    }
    case "cognitive.readability":
      return `Simplify text to raise Flesch reading ease from ${Math.round(data.fleschScore as number)} to ${Math.ceil(F.scale / F.fleschGain)} or more, where readability scores full marks`;
    case "cognitive.informationDensity":
      return `Reduce visible elements from ${data.elementCount} toward ${F.elementsFree} -- use progressive disclosure to reveal content incrementally`;
    case "cognitive.attentionClarity":
      return "Make primary CTA visually dominant -- increase size, contrast, and whitespace around conversion elements";
    case "cognitive.predictability":
      return `Reduce navigation items from ${data.navItemCount} to ${F.navFree} or fewer -- group secondary items in submenus`;

    case "sensory.animationControl":
      return `Add prefers-reduced-motion support for ${data.animationCount} animations and provide pause controls`;
    case "sensory.sensoryIndependence":
      return "Add captions/transcripts for all audio and video content";
    case "sensory.visualCalm":
      return "Reduce visual noise -- fewer animations, lower information density, more whitespace";
    case "sensory.layoutConsistency":
      return "Standardize layout patterns -- consistent nav placement, predictable content regions";
    case "sensory.overloadThreshold":
      return "Reduce total cognitive load -- simplify page structure, reduce simultaneous information streams";

    case "navigation.semanticStructure":
      return "Add proper heading hierarchy (h1-h6), landmark roles, and semantic HTML elements";
    case "navigation.keyboardOperability":
      return "Ensure all interactive elements are keyboard-accessible with logical tab order";
    case "navigation.skipMechanisms":
      return "Add skip-to-content links at the top of the page for keyboard/screen reader users";
    case "navigation.linkButtonClarity":
      return "Add descriptive ARIA labels to all links and buttons -- avoid 'click here' or icon-only controls";
    case "navigation.formAccessibility":
      return "Associate every form field with a visible label using <label for> or aria-labelledby";

    default:
      return `Improve ${component} in ${category} category (current score: ${score}/${F.scale})`;
  }
}

// ============================================================================
// Top Issues
// ============================================================================

/** Every component of the five categories, in category order. */
function everyComponent(
  ...categories: Array<{ components: Record<string, CIFComponentScore> }>
): Array<{ category: string; component: string; score: number; measured: boolean }> {
  const names = ["motor", "visual", "cognitive", "sensory", "navigation"];
  return categories.flatMap((cat, i) =>
    Object.entries(cat.components).map(([component, val]) => ({
      category: names[i], component, score: val.score, measured: val.measured,
    })),
  );
}

function buildTopIssues(
  motor: CIFScore["motor"],
  visual: CIFScore["visual"],
  cognitive: CIFScore["cognitive"],
  sensory: CIFScore["sensory"],
  navigation: CIFScore["navigation"],
  data: CIFInput,
): CIFScore["topIssues"] {
  // A component that was not measured is not an issue found, so it is never listed
  const allComponents = everyComponent(motor, visual, cognitive, sensory, navigation)
    .filter((c) => c.measured);

  // Sort by score ascending (worst first)
  allComponents.sort((a, b) => a.score - b.score);

  // Return the top few
  return allComponents.slice(0, param("cif.topIssues.count")).map((c) => ({
    category: c.category,
    component: c.component,
    score: c.score,
    fix: generateFixRecommendation(c.category, c.component, c.score, data),
  }));
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Compute the CIF (Cognitive Interface Fitness) score from raw tool data.
 *
 * Accepts data from empathy_audit, agent_ready_audit, cognitive_effort CTC,
 * page_understand, and attention_analysis. All fields are optional; a
 * component whose inputs are all missing is reported as not measured (see
 * MISSING INPUTS at the top of this file), never estimated.
 */
const COMPOSITE_IDS = {
  motor: "cif.weight.motor",
  visual: "cif.weight.visual",
  cognitive: "cif.weight.cognitive",
  sensory: "cif.weight.sensory",
  navigation: "cif.weight.navigation",
} as const;

export function computeCIFScore(data: CIFInput): CIFScore {
  const W = readParams(COMPOSITE_IDS);
  const motor = computeMotorFitness(data);
  const visual = computeVisualFitness(data);
  const cognitive = computeCognitiveFitness(data);
  const sensory = computeSensoryFitness(data);
  const navigation = computeNavigationFitness(data);

  const composite = clamp(
    Math.round(
      W.motor * motor.score +
        W.visual * visual.score +
        W.cognitive * cognitive.score +
        W.sensory * sensory.score +
        W.navigation * navigation.score,
    ),
  );

  const grade = computeGrade(composite);

  const topIssues = buildTopIssues(motor, visual, cognitive, sensory, navigation, data);
  const components = everyComponent(motor, visual, cognitive, sensory, navigation);
  const notMeasuredComponents = components
    .filter((c) => !c.measured)
    .map((c) => `${c.category}.${c.component}`);

  // A certification speaks for the whole page, so it needs every component
  // measured. The band is still computed from the category scores; it is only
  // issued when nothing was left unmeasured.
  const allMeasured = notMeasuredComponents.length === 0;
  const certification = allMeasured
    ? computeCertification(motor.score, visual.score, cognitive.score, sensory.score, navigation.score)
    : "none";
  const certificationNote = allMeasured
    ? null
    : `Not certified: ${notMeasuredComponents.length} of ${components.length} components not measured.`;

  return {
    composite,
    grade,
    certification,
    notMeasuredCount: notMeasuredComponents.length,
    certificationNote,
    motor,
    visual,
    cognitive,
    sensory,
    navigation,
    topIssues,
    notMeasured: notMeasuredComponents,
    url: data.url,
    timestamp: new Date().toISOString(),
  };
}
