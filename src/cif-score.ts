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
 * visual/provenance/cif.ts, which says where it comes from: three are WCAG's,
 * four are units or display choices, and the rest (the weights above among
 * them) were set by hand. tests/cif-no-literals.test.ts keeps it that way.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 * @since v19.0.0
 */

import { param } from "./visual/model-provenance.js";

// ============================================================================
// Types
// ============================================================================

export interface CIFComponentScore {
  score: number;
  details: string;
}

export interface CIFScore {
  composite: number;
  grade: string;
  certification: string;

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

/** Safe number that defaults if input is null/undefined/NaN */
function safe(val: number | undefined | null, fallback: number): number {
  if (val == null || isNaN(val)) return fallback;
  return val;
}

/** Count barriers of a given type */
function countBarriersByType(
  barriers: CIFInput["barriers"],
  type: string,
): number {
  if (!barriers) return 0;
  return barriers.filter((b) => b.type === type).length;
}

/** Count barriers matching a substring in type or description */
function countBarriersMatching(
  barriers: CIFInput["barriers"],
  pattern: string,
): number {
  if (!barriers) return 0;
  const p = pattern.toLowerCase();
  return barriers.filter(
    (b) =>
      b.type.toLowerCase().includes(p) ||
      (b.description || "").toLowerCase().includes(p),
  ).length;
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
  hitNoData: "cif.motor.hit.noData",
  interactiveNoData: "cif.motor.interactive.noData",
  interactiveFree: "cif.motor.interactive.freeCount",
  interactiveKnee: "cif.motor.interactive.kneeCount",
  interactiveSlopeBelow: "cif.motor.interactive.slopeBelowKnee",
  interactiveKneeScore: "cif.motor.interactive.kneeScore",
  interactiveSlopeAbove: "cif.motor.interactive.slopeAboveKnee",
  spacingBarrierPenalty: "cif.motor.spacing.barrierPenalty",
  dragBarrierPenalty: "cif.motor.drag.barrierPenalty",
  wTouchTarget: "cif.motor.weight.touchTargetCompliance",
  wHit: "cif.motor.weight.hitProbability",
  wInteraction: "cif.motor.weight.interactionCount",
  wSpacing: "cif.motor.weight.spacingAdequacy",
  wDrag: "cif.motor.weight.dragFreeAlternatives",
} as const;

function computeMotorFitness(data: CIFInput): CIFScore["motor"] {
  const P = readParams(MOTOR_IDS);

  // --- touchTargetCompliance (30%) ---
  let touchTargetCompliance: CIFComponentScore;
  if (data.touchTargets && data.touchTargets.length > 0) {
    const nonExempt = data.touchTargets.filter((t) => !t.exempt);
    if (nonExempt.length === 0) {
      touchTargetCompliance = { score: P.scale, details: "All interactive elements are exempt from size requirements" };
    } else {
      const compliant = nonExempt.filter(
        (t) => Math.min(t.width, t.height) >= P.targetPx,
      ).length;
      const pct = (compliant / nonExempt.length) * P.scale;
      touchTargetCompliance = {
        score: clamp(Math.round(pct)),
        details: `${compliant}/${nonExempt.length} interactive elements meet ${P.targetPx}px minimum (${Math.round(pct)}%)`,
      };
    }
  } else {
    // Fall back to barrier count as proxy
    const touchBarriers = countBarriersByType(data.barriers, "touch_target");
    touchTargetCompliance = {
      score: clamp(Math.max(P.touchBarrierFloor, P.scale - touchBarriers * P.touchBarrierPenalty)),
      details: touchBarriers > 0
        ? `${touchBarriers} touch target barriers detected (no size data available)`
        : "No touch target data available -- estimated from barriers",
    };
  }

  // --- hitProbability (25%) ---
  let hitProbability: CIFComponentScore;
  if (data.touchTargets && data.touchTargets.length > 0) {
    const nonExempt = data.touchTargets.filter((t) => !t.exempt);
    if (nonExempt.length === 0) {
      hitProbability = { score: P.scale, details: "No non-exempt interactive elements" };
    } else {
      const avgMinDim =
        nonExempt.reduce((sum, t) => sum + Math.min(t.width, t.height), 0) /
        nonExempt.length;
      const score = sigmoid((avgMinDim - P.hitMidpointPx) / P.hitScalePx) * P.scale;
      hitProbability = {
        score: clamp(Math.round(score)),
        details: `Average minimum dimension: ${Math.round(avgMinDim)}px (sigmoid-scored)`,
      };
    }
  } else {
    hitProbability = {
      score: P.hitNoData,
      details: "No touch target barriers detected",
    };
  }

  // --- interactionCount (20%) ---
  // Under the free count interactive elements are fine; penalize progressively above that
  const interactiveCount = safe(data.interactiveCount, P.interactiveNoData);
  const interactionCountScore = interactiveCount <= P.interactiveFree ? P.scale
    : interactiveCount <= P.interactiveKnee ? clamp(Math.round(P.scale - (interactiveCount - P.interactiveFree) * P.interactiveSlopeBelow))
    : clamp(Math.round(P.interactiveKneeScore - (interactiveCount - P.interactiveKnee) * P.interactiveSlopeAbove));
  const interactionCount: CIFComponentScore = {
    score: interactionCountScore,
    details: interactiveCount <= P.interactiveFree
      ? `${interactiveCount} interactive elements — manageable for motor impairments`
      : `${interactiveCount} interactive elements on page (fewer is easier for motor impairments)`,
  };

  // --- spacingAdequacy (15%) ---
  const touchTargetBarriers = countBarriersByType(data.barriers, "touch_target");
  const spacingScore = clamp(Math.round(P.scale - touchTargetBarriers * P.spacingBarrierPenalty));
  const spacingAdequacy: CIFComponentScore = {
    score: spacingScore,
    details: touchTargetBarriers > 0
      ? `${touchTargetBarriers} touch target/spacing barriers detected`
      : "No spacing barriers detected",
  };

  // --- dragFreeAlternatives (10%) ---
  const dragBarriers = countBarriersMatching(data.barriers, "drag");
  const dragScore = clamp(P.scale - dragBarriers * P.dragBarrierPenalty);
  const dragFreeAlternatives: CIFComponentScore = {
    score: dragScore,
    details: dragBarriers > 0
      ? `${dragBarriers} drag-dependent interactions found without alternatives`
      : "No drag-dependent interactions detected",
  };

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
  elementCountNoData: "cif.visual.contrast.elementCountNoData",
  contrastBarrierPenalty: "cif.visual.contrast.barrierPenalty",
  agentReadyNoData: "cif.visual.contrast.agentReadyNoData",
  proxySlope: "cif.visual.contrast.proxySlope",
  proxyIntercept: "cif.visual.contrast.proxyIntercept",
  densityNoData: "cif.visual.densityNoData",
  densityKnee: "cif.visual.textScalability.densityKnee",
  scalabilitySlope: "cif.visual.textScalability.slope",
  colorBarrierPenalty: "cif.visual.color.barrierPenalty",
  focusNoData: "cif.visual.focus.agentReadyNoData",
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
  if (data.contrastIssues && data.contrastIssues.length > 0) {
    // Use element count as proxy for total text elements
    const totalTextEstimate = Math.max(
      safe(data.elementCount, P.elementCountNoData),
      data.contrastIssues.length,
    );
    const failRatio = data.contrastIssues.length / totalTextEstimate;
    const score = clamp(Math.round(P.scale - failRatio * P.scale));
    const failingNormalText = data.contrastIssues.filter(
      (c) => !c.isLargeText && c.ratio < P.normalText,
    ).length;
    const failingLargeText = data.contrastIssues.filter(
      (c) => c.isLargeText && c.ratio < P.largeText,
    ).length;
    contrastCompliance = {
      score,
      details: `${data.contrastIssues.length} contrast issues (${failingNormalText} normal text below ${P.normalText}:1, ${failingLargeText} large text below ${P.largeText}:1)`,
    };
  } else {
    // Fall back to contrast barriers
    const contrastBarriers = countBarriersByType(data.barriers, "contrast");
    if (contrastBarriers > 0) {
      contrastCompliance = {
        score: clamp(P.scale - contrastBarriers * P.contrastBarrierPenalty),
        details: `${contrastBarriers} contrast barriers detected`,
      };
    } else {
      // Use agent_ready accessibility subscore as proxy
      const accessibilityProxy = safe(data.agentReadyScore, P.agentReadyNoData);
      contrastCompliance = {
        score: clamp(Math.round(accessibilityProxy * P.proxySlope + P.proxyIntercept)),
        details: "No contrast data -- estimated from agent-ready accessibility score",
      };
    }
  }

  // --- textScalability (20%) ---
  // Assume text scales correctly unless density is very high (which breaks at zoom)
  const density = safe(data.informationDensity, P.densityNoData);
  const scalabilityDeduction = density > P.densityKnee ? (density - P.densityKnee) * P.scalabilitySlope : 0;
  const textScalability: CIFComponentScore = {
    score: clamp(Math.round(P.scale - scalabilityDeduction)),
    details: scalabilityDeduction > 0
      ? `High density (${(density * P.scale).toFixed(0)}%) may cause overlap at 200% zoom (-${Math.round(scalabilityDeduction)})`
      : "Text content can scale to 200% without loss of functionality",
  };

  // --- colorIndependence (20%) ---
  const colorOnlyBarriers = countBarriersMatching(data.barriers, "color");
  const colorScore = clamp(P.scale - colorOnlyBarriers * P.colorBarrierPenalty);
  const colorIndependence: CIFComponentScore = {
    score: colorScore,
    details: colorOnlyBarriers > 0
      ? `${colorOnlyBarriers} color-only information barriers detected`
      : "No color-only information barriers detected",
  };

  // --- focusVisibility (15%) ---
  const semanticProxy = safe(data.semanticScore, safe(data.agentReadyScore, P.focusNoData));
  const focusScore = clamp(Math.round((semanticProxy / P.scale) * P.scale));
  const focusVisibility: CIFComponentScore = {
    score: focusScore,
    details: `Estimated from semantic score (${Math.round(semanticProxy)}/100)`,
  };

  // --- spacingDensity (15%) ---
  const spacingDensityScore = clamp(Math.round(P.scale - density * P.scale));
  const spacingDensity: CIFComponentScore = {
    score: spacingDensityScore,
    details: `Information density: ${(density * P.scale).toFixed(0)}% (lower is better for visual processing)`,
  };

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
  decisionNoDataCost: "cif.cognitive.decision.noDataCost",
  decisionCostSlope: "cif.cognitive.decision.costSlope",
  fleschGain: "cif.cognitive.readability.fleschGain",
  readabilityNoData: "cif.cognitive.readability.noData",
  elementCountNoData: "cif.cognitive.density.elementCountNoData",
  densityFree: "cif.cognitive.density.freeCount",
  densityKnee: "cif.cognitive.density.kneeCount",
  densityDivisorBelow: "cif.cognitive.density.divisorBelowKnee",
  densityKneeScore: "cif.cognitive.density.kneeScore",
  densityDivisorAbove: "cif.cognitive.density.divisorAboveKnee",
  captureGain: "cif.cognitive.attention.captureGain",
  attentionNoData: "cif.cognitive.attention.noData",
  navItemsNoData: "cif.cognitive.predictability.navItemsNoData",
  navFree: "cif.cognitive.predictability.freeCount",
  navKnee: "cif.cognitive.predictability.kneeCount",
  navSlopeBelow: "cif.cognitive.predictability.slopeBelowKnee",
  navKneeScore: "cif.cognitive.predictability.kneeScore",
  navSlopeAbove: "cif.cognitive.predictability.slopeAboveKnee",
  wDecision: "cif.cognitive.weight.decisionComplexity",
  wReadability: "cif.cognitive.weight.readability",
  wDensity: "cif.cognitive.weight.informationDensity",
  wAttention: "cif.cognitive.weight.attentionClarity",
  wPredictability: "cif.cognitive.weight.predictability",
} as const;

function computeCognitiveFitness(data: CIFInput): CIFScore["cognitive"] {
  const P = readParams(COGNITIVE_IDS);

  // --- decisionComplexity (25%) ---
  let decisionCost = P.decisionNoDataCost;
  if (data.layers && data.layers.length > 0) {
    const decisionLayer = data.layers.find(
      (l) => l.name.toLowerCase().includes("decision") || l.name.toLowerCase().includes("choice"),
    );
    decisionCost = decisionLayer ? decisionLayer.cost : P.decisionNoDataCost;
  }
  const decisionScore = clamp(Math.round(P.scale - decisionCost * P.decisionCostSlope));
  const decisionComplexity: CIFComponentScore = {
    score: decisionScore,
    details: decisionCost > 0
      ? `Decision layer cost: ${decisionCost.toFixed(P.costDecimals)} (lower is better)`
      : "No CTC decision layer data available",
  };

  // --- readability (20%) ---
  const flesch = data.fleschScore;
  const readabilityScore = flesch != null
    ? clamp(Math.round(Math.min(P.scale, flesch * P.fleschGain)))
    : P.readabilityNoData; // No data = assume mediocre readability (not optimistic)
  const readability: CIFComponentScore = {
    score: readabilityScore,
    details: flesch != null
      ? `Flesch readability score: ${Math.round(flesch)} (higher = more readable)`
      : `No readability data available — estimated ${P.readabilityNoData} (conservative)`,
  };

  // --- informationDensity (20%) ---
  // A well-structured page can have many elements without being overwhelming.
  // Only penalize when element count is extremely high relative to viewport.
  // Threshold: the free count is fine, the knee starts getting dense, 2000+ is overwhelming.
  const elemCount = safe(data.elementCount, P.elementCountNoData);
  const infoScore = elemCount <= P.densityFree ? P.scale
    : elemCount <= P.densityKnee ? clamp(Math.round(P.scale - (elemCount - P.densityFree) / P.densityDivisorBelow))
    : clamp(Math.round(P.densityKneeScore - (elemCount - P.densityKnee) / P.densityDivisorAbove));
  const informationDensity: CIFComponentScore = {
    score: infoScore,
    details: elemCount <= P.densityFree
      ? `${elemCount} elements — well within cognitive limits`
      : `${elemCount} elements on page (progressive penalty above ${P.densityFree})`,
  };

  // --- attentionClarity (20%) ---
  const captureRate = data.ctaCaptureRate;
  const attentionScore = captureRate != null
    ? clamp(Math.round(Math.min(P.scale, captureRate * P.captureGain)))
    : P.attentionNoData; // No data = assume mediocre CTA clarity (not optimistic)
  const attentionClarity: CIFComponentScore = {
    score: attentionScore,
    details: captureRate != null
      ? `CTA capture rate: ${(captureRate * P.scale).toFixed(1)}% (higher = clearer attention guidance)`
      : `No attention data available — estimated ${P.attentionNoData} (conservative)`,
  };

  // --- predictability (15%) ---
  const navItems = safe(data.navItemCount, P.navItemsNoData);
  let predictScore: number;
  if (navItems <= P.navFree) {
    predictScore = P.scale;
  } else if (navItems <= P.navKnee) {
    predictScore = clamp(Math.round(P.scale - (navItems - P.navFree) * P.navSlopeBelow));
  } else {
    predictScore = clamp(Math.round(P.navKneeScore - (navItems - P.navKnee) * P.navSlopeAbove));
  }
  const predictability: CIFComponentScore = {
    score: predictScore,
    details: navItems <= P.navFree
      ? `${navItems} navigation items — clear, predictable structure`
      : `${navItems} navigation items (${P.navFree} or fewer is optimal for cognitive predictability)`,
  };

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
  animationNoData: "cif.sensory.animation.noData",
  controlledFloor: "cif.sensory.animation.controlledFloor",
  controlledPenalty: "cif.sensory.animation.controlledPenalty",
  uncontrolledPenalty: "cif.sensory.animation.uncontrolledPenalty",
  audioBarrierPenalty: "cif.sensory.audio.barrierPenalty",
  densityNoData: "cif.sensory.densityNoData",
  calmDensityWeight: "cif.sensory.calm.densityWeight",
  calmAnimationPenalty: "cif.sensory.calm.animationPenalty",
  agentReadyNoData: "cif.sensory.layout.agentReadyNoData",
  ctcNoData: "cif.sensory.overload.ctcNoData",
  easyCTC: "cif.sensory.overload.easyCTC",
  kneeCTC: "cif.sensory.overload.kneeCTC",
  overloadSlopeBelow: "cif.sensory.overload.slopeBelowKnee",
  overloadKneeScore: "cif.sensory.overload.kneeScore",
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
  const animCount = safe(data.animationCount, P.animationNoData);
  const hasMotionSupport = !!data.hasReducedMotionSupport;
  // If prefers-reduced-motion is supported, animations are user-controllable → a small tax per animation, down to the floor
  // Without support, each animation is a hard penalty
  const animScore = hasMotionSupport
    ? clamp(Math.max(P.controlledFloor, P.scale - animCount * P.controlledPenalty))  // floor-to-top range — minor tax for quantity
    : animCount === 0 ? P.scale : clamp(Math.round(P.scale - animCount * P.uncontrolledPenalty));
  const animationControl: CIFComponentScore = {
    score: animScore,
    details: animCount === 0
      ? "No animations detected"
      : hasMotionSupport
        ? `${animCount} animations detected — prefers-reduced-motion supported (user can disable)`
        : `${animCount} animations detected without motion preference support (each deducts ${P.uncontrolledPenalty} points)`,
  };

  // --- sensoryIndependence (25%) ---
  const captionBarriers = countBarriersMatching(data.barriers, "caption");
  const audioBarriers = countBarriersMatching(data.barriers, "audio");
  const sensoryDeductions = (captionBarriers + audioBarriers) * P.audioBarrierPenalty;
  const sensoryScore = clamp(P.scale - sensoryDeductions);
  const sensoryIndependence: CIFComponentScore = {
    score: sensoryScore,
    details: sensoryDeductions > 0
      ? `${captionBarriers + audioBarriers} audio/caption barriers (each deducts ${P.audioBarrierPenalty})`
      : "No audio/caption accessibility barriers detected",
  };

  // --- visualCalm (20%) ---
  const density = safe(data.informationDensity, P.densityNoData);
  // If animations are user-controllable, they don't contribute to visual noise
  const animCalmPenalty = hasMotionSupport ? 0 : animCount * P.calmAnimationPenalty;
  const calmScore = clamp(Math.round(P.scale - density * P.calmDensityWeight - animCalmPenalty));
  const visualCalm: CIFComponentScore = {
    score: calmScore,
    details: hasMotionSupport
      ? `Information density: ${(density * P.scale).toFixed(0)}% (animations controllable via prefers-reduced-motion)`
      : `Information density: ${(density * P.scale).toFixed(0)}%, ${animCount} uncontrolled animations`,
  };

  // --- layoutConsistency (15%) ---
  const agentReady = safe(data.agentReadyScore, P.agentReadyNoData);
  const consistencyScore = clamp(Math.round(agentReady));
  const layoutConsistency: CIFComponentScore = {
    score: consistencyScore,
    details: `Layout consistency derived from structural score (${Math.round(agentReady)}/100)`,
  };

  // --- overloadThreshold (10%) ---
  // CTC up to easyCTC is "easy" per our scale, up to kneeCTC moderate, then hard
  const totalCTC = safe(data.totalCTC, P.ctcNoData);
  const overloadScore = totalCTC <= P.easyCTC ? P.scale
    : totalCTC <= P.kneeCTC ? clamp(Math.round(P.scale - (totalCTC - P.easyCTC) * P.overloadSlopeBelow))
    : clamp(Math.round(P.overloadKneeScore - (totalCTC - P.kneeCTC) * P.overloadSlopeAbove));
  const overloadThreshold: CIFComponentScore = {
    score: overloadScore,
    details: totalCTC <= P.easyCTC ? `Total CTC: ${totalCTC.toFixed(P.costDecimals)} — within easy range`
      : `Total CTC: ${totalCTC.toFixed(P.costDecimals)} (lower = less cognitive overload risk)`,
  };

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
  agentReadyNoData: "cif.navigation.semantic.agentReadyNoData",
  keyboardBarrierPenalty: "cif.navigation.keyboard.barrierPenalty",
  skipBarrierPenalty: "cif.navigation.skip.barrierPenalty",
  ariaNoData: "cif.navigation.linkButton.ariaNoData",
  formLabelNoData: "cif.navigation.form.labelNoData",
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
  const semanticAvg =
    subScores.length > 0
      ? subScores.reduce((a, b) => a + b, 0) / subScores.length
      : safe(data.agentReadyScore, P.agentReadyNoData);
  const semanticStructure: CIFComponentScore = {
    score: clamp(Math.round(semanticAvg)),
    details: subScores.length > 0
      ? `Average of ${subScores.length} semantic sub-scores: ${Math.round(semanticAvg)}/100`
      : `Estimated from agent-ready score: ${Math.round(semanticAvg)}/100`,
  };

  // --- keyboardOperability (25%) ---
  const keyboardBarriers = countBarriersMatching(data.barriers, "keyboard");
  const motorPrecision = countBarriersByType(data.barriers, "motor_precision");
  const kbDeductions = (keyboardBarriers + motorPrecision) * P.keyboardBarrierPenalty;
  const kbScore = clamp(P.scale - kbDeductions);
  const keyboardOperability: CIFComponentScore = {
    score: kbScore,
    details: kbDeductions > 0
      ? `${keyboardBarriers + motorPrecision} keyboard/motor barriers detected`
      : "No keyboard accessibility barriers detected",
  };

  // --- skipMechanisms (15%) ---
  const skipBarriers = countBarriersMatching(data.barriers, "skip");
  const skipScore = clamp(P.scale - skipBarriers * P.skipBarrierPenalty);
  const skipMechanisms: CIFComponentScore = {
    score: skipScore,
    details: skipBarriers > 0
      ? `${skipBarriers} skip mechanism issues detected`
      : "No skip navigation issues detected",
  };

  // --- linkButtonClarity (15%) ---
  const ariaProxy = safe(data.ariaScore, P.ariaNoData);
  const linkButtonClarity: CIFComponentScore = {
    score: clamp(Math.round(ariaProxy)),
    details: `ARIA label score: ${Math.round(ariaProxy)}/100`,
  };

  // --- formAccessibility (20%) ---
  let formScore = safe(data.formLabelScore, P.formLabelNoData);
  const formBarriers = countBarriersMatching(data.barriers, "form");
  formScore = clamp(formScore - formBarriers * P.formBarrierPenalty);
  const formAccessibility: CIFComponentScore = {
    score: clamp(Math.round(formScore)),
    details: formBarriers > 0
      ? `Form label score: ${Math.round(safe(data.formLabelScore, P.formLabelNoData))}/100, ${formBarriers} form barriers`
      : `Form label score: ${Math.round(safe(data.formLabelScore, P.formLabelNoData))}/100`,
  };

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

const FIX_IDS = {
  targetPx: "cif.wcag.targetSizeEnhancedPx",
  normalText: "cif.wcag.contrastNormalText",
  largeText: "cif.wcag.contrastLargeText",
  choiceThreshold: "cif.fix.decision.choiceThreshold",
  navFree: "cif.cognitive.predictability.freeCount",
} as const;

function generateFixRecommendation(
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
    case "motor.hitProbability":
      return "Increase average interactive element dimensions -- target 48px minimum for reliable motor access";
    case "motor.interactionCount":
      return `Reduce interactive elements from ${safe(data.interactiveCount, 0)} to under 30 on a single view`;
    case "motor.spacingAdequacy":
      return "Add at least 8px spacing between adjacent interactive elements to prevent mis-taps";
    case "motor.dragFreeAlternatives":
      return "Provide keyboard/click alternatives for all drag-and-drop interactions";

    case "visual.contrastCompliance": {
      const count = data.contrastIssues?.length || countBarriersByType(data.barriers, "contrast");
      return `Fix ${count} elements with contrast ratios below ${F.normalText}:1 for normal text or ${F.largeText}:1 for large text`;
    }
    case "visual.textScalability":
      return "Ensure text scales to 200% without loss of content or functionality (WCAG 1.4.4)";
    case "visual.colorIndependence":
      return "Add non-color indicators (icons, patterns, text labels) wherever color conveys meaning";
    case "visual.focusVisibility":
      return "Ensure all interactive elements have visible focus indicators with at least 3:1 contrast";
    case "visual.spacingDensity":
      return "Increase whitespace between content blocks -- reduce information density below 60%";

    case "cognitive.decisionComplexity": {
      const choices = safe(data.interactiveCount, 0);
      if (choices > F.choiceThreshold) {
        return `Reduce choices from ${choices} to 5-7 options per decision point (Hick's Law)`;
      }
      return "Simplify decision points -- group related options, provide defaults, reduce choices per step";
    }
    case "cognitive.readability":
      return `Simplify text to 8th-grade reading level (current Flesch: ${Math.round(safe(data.fleschScore, 0))})`;
    case "cognitive.informationDensity":
      return `Reduce visible elements from ${safe(data.elementCount, 0)} -- use progressive disclosure to reveal content incrementally`;
    case "cognitive.attentionClarity":
      return "Make primary CTA visually dominant -- increase size, contrast, and whitespace around conversion elements";
    case "cognitive.predictability":
      return `Reduce navigation items from ${safe(data.navItemCount, 0)} to ${F.navFree} or fewer -- group secondary items in submenus`;

    case "sensory.animationControl":
      return `Add prefers-reduced-motion support for ${safe(data.animationCount, 0)} animations and provide pause controls`;
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
      return `Improve ${component} in ${category} category (current score: ${score}/100)`;
  }
}

// ============================================================================
// Top Issues
// ============================================================================

function buildTopIssues(
  motor: CIFScore["motor"],
  visual: CIFScore["visual"],
  cognitive: CIFScore["cognitive"],
  sensory: CIFScore["sensory"],
  navigation: CIFScore["navigation"],
  data: CIFInput,
): CIFScore["topIssues"] {
  const allComponents: Array<{
    category: string;
    component: string;
    score: number;
  }> = [];

  for (const [name, val] of Object.entries(motor.components)) {
    allComponents.push({ category: "motor", component: name, score: val.score });
  }
  for (const [name, val] of Object.entries(visual.components)) {
    allComponents.push({ category: "visual", component: name, score: val.score });
  }
  for (const [name, val] of Object.entries(cognitive.components)) {
    allComponents.push({ category: "cognitive", component: name, score: val.score });
  }
  for (const [name, val] of Object.entries(sensory.components)) {
    allComponents.push({ category: "sensory", component: name, score: val.score });
  }
  for (const [name, val] of Object.entries(navigation.components)) {
    allComponents.push({ category: "navigation", component: name, score: val.score });
  }

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
 * page_understand, and attention_analysis. All fields are optional --
 * missing data produces conservative estimates with lower confidence.
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
  const certification = computeCertification(
    motor.score,
    visual.score,
    cognitive.score,
    sensory.score,
    navigation.score,
  );

  const topIssues = buildTopIssues(motor, visual, cognitive, sensory, navigation, data);

  return {
    composite,
    grade,
    certification,
    motor,
    visual,
    cognitive,
    sensory,
    navigation,
    topIssues,
    url: data.url,
    timestamp: new Date().toISOString(),
  };
}
