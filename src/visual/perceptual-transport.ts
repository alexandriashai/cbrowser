/**
 * Perceptual Transport — Persona-aware visual analysis via optimal transport
 *
 * Models how different personas PERCEIVE the same page differently by
 * transforming the visual distribution through persona-specific filters,
 * then measuring the transport cost (information loss, attention mismatch,
 * motor accessibility cost) using Wasserstein distance.
 *
 * This produces meaningfully different scores per persona from the same page.
 *
 * @version 1.0.0
 * @since v18.26.0
 * @see https://github.com/alexandriashai/cbrowser/issues/158
 */

import { computeWassersteinDistance, type WassersteinConfig } from './distance-metrics.js';

// ── Types ──

export interface PerceptualProfile {
  /** Persona identifier */
  persona: string;
  /** Category for selecting filter */
  category: 'motor' | 'vision' | 'cognitive' | 'hearing' | 'general';
  /** Per-barrier-type severity multipliers (1.0 = normal, 3.0 = 3x worse for this persona) */
  barrierWeights: Record<string, number>;
  /** Visual filter to simulate perception */
  visualFilter: PerceptualFilter;
}

export interface PerceptualFilter {
  /** Minimum contrast ratio this persona can perceive (lower = worse vision) */
  contrastThreshold: number;
  /** Blur radius to simulate reduced acuity (0 = perfect vision) */
  blurRadius: number;
  /** Color channel attenuation [r, g, b] — 1.0 = full, 0.0 = blind to channel */
  colorAttenuation: [number, number, number];
  /** Attention distribution: how visual weight is distributed */
  attentionMode: 'uniform' | 'center-heavy' | 'motion-attracted' | 'text-focused' | 'large-elements';
  /** Interactive element reach cost multiplier (1.0 = normal, 3.0 = hard to reach) */
  motorCostMultiplier: number;
  /** Cognitive processing speed (1.0 = normal, 0.5 = needs 2x time) */
  processingSpeed: number;
  /** Visual noise tolerance (0-1, lower = more easily overwhelmed) */
  noiseTolerance: number;
}

export interface PerceptualAnalysis {
  persona: string;
  category: string;
  /** Information loss: how much visual information this persona loses (0 = none, 1 = total) */
  informationLoss: number;
  /** Attention mismatch: how far persona's attention diverges from intended design (0 = aligned, 1 = opposite) */
  attentionMismatch: number;
  /** Motor accessibility cost: how hard interactive elements are to reach (0 = easy, 1 = impossible) */
  motorCost: number;
  /** Cognitive load: how overwhelming the visual complexity is (0 = simple, 1 = overwhelming) */
  cognitiveLoad: number;
  /** Composite perceptual score (0-100, higher = more accessible for this persona) */
  perceptualScore: number;
  /** Per-barrier-type weighted deductions */
  weightedDeductions: Record<string, number>;
  /** Comparison to baseline (unfiltered) Wasserstein distance */
  transportDistance: number;
  computeTimeMs: number;
}

/**
 * Asymptotic ceiling for a single susceptibility bucket's deduction. Buckets
 * approach it and never reach it, so no two can max out onto the same value.
 */
const BARRIER_DEDUCTION_CEILING = 30;

// ── Persona Perceptual Profiles ──

const PERCEPTUAL_PROFILES: Record<string, PerceptualProfile> = {
  // Non-disabled baseline personas. These existed conceptually in the persona
  // registry but had no perceptual profile, so they fell through to DEFAULT_PROFILE
  // (every weight = 1.0). That meant a non-disabled "first-timer" got full
  // deductions for low_contrast / touch_target / missing_alt / color_only —
  // i.e., scored as if they had low vision AND motor impairment AND were blind
  // simultaneously. Stripe / Linear / Notion / GitHub all returning ~25 for
  // first-timer was a direct consequence.
  'first-timer': {
    persona: 'first-timer',
    category: 'general',
    barrierWeights: {
      cognitive_load: 1.0,     // New users do feel cognitive overload from complex UIs
      form_complexity: 1.2,    // Unfamiliar forms add real friction for newcomers
      timing: 0.8,             // Some patience pressure but not severe
      hover_dependent: 0.6,    // Can hover; slightly hurts on mobile
      missing_label: 0.8,      // Labels help orientation but they have time to figure out
      // No disability — these matter little or not at all:
      touch_target: 0.3,       // Has full motor control; only matters for badly broken targets
      low_contrast: 0.2,       // Has full vision
      color_only: 0.2,         // Has color vision
      missing_alt: 0.1,        // Doesn't use a screen reader
    },
    visualFilter: {
      contrastThreshold: 0, blurRadius: 0, colorAttenuation: [1, 1, 1],
      attentionMode: 'uniform', motorCostMultiplier: 1.0,
      processingSpeed: 0.9,    // Slightly slower because everything is new
      noiseTolerance: 0.7,     // Moderately overwhelmed by busy pages
    },
  },

  'mobile-user': {
    persona: 'mobile-user',
    category: 'general',
    barrierWeights: {
      touch_target: 1.5,       // Touch is their only input — small targets hurt
      hover_dependent: 2.5,    // Can't hover on touch devices, period
      cognitive_load: 0.8,
      form_complexity: 1.2,    // Mobile keyboards make forms harder
      timing: 0.8,
      low_contrast: 0.4,       // Vision is fine but small screens compound
      color_only: 0.3,
      missing_alt: 0.1,
      missing_label: 0.6,
    },
    visualFilter: {
      contrastThreshold: 0, blurRadius: 0, colorAttenuation: [1, 1, 1],
      attentionMode: 'center-heavy', motorCostMultiplier: 1.3,
      processingSpeed: 0.9, noiseTolerance: 0.7,
    },
  },

  'impatient-user': {
    persona: 'impatient-user',
    category: 'general',
    barrierWeights: {
      timing: 2.0,             // Anything slow is unbearable
      cognitive_load: 1.8,     // Won't tolerate complex UIs
      form_complexity: 2.0,    // Long forms = abandon
      hover_dependent: 0.5,
      touch_target: 0.4,
      low_contrast: 0.2,
      color_only: 0.2,
      missing_alt: 0.1,
      missing_label: 0.6,
    },
    visualFilter: {
      contrastThreshold: 0, blurRadius: 0, colorAttenuation: [1, 1, 1],
      attentionMode: 'uniform', motorCostMultiplier: 1.0,
      processingSpeed: 1.2,    // Reads fast, expects fast response
      noiseTolerance: 0.3,     // Quickly overwhelmed by clutter
    },
  },

  'power-user': {
    persona: 'power-user',
    category: 'general',
    barrierWeights: {
      // Power users tolerate complexity but hate friction in flows they know
      cognitive_load: 0.4,
      form_complexity: 0.5,
      timing: 1.0,
      hover_dependent: 0.6,
      touch_target: 0.3,
      low_contrast: 0.2,
      color_only: 0.2,
      missing_alt: 0.1,
      missing_label: 0.4,
    },
    visualFilter: {
      contrastThreshold: 0, blurRadius: 0, colorAttenuation: [1, 1, 1],
      attentionMode: 'uniform', motorCostMultiplier: 1.0,
      processingSpeed: 1.3, noiseTolerance: 1.0,
    },
  },

  'elderly-user': {
    persona: 'elderly-user',
    category: 'general',
    barrierWeights: {
      // Different from elderly-low-vision — this persona is older but not visually impaired.
      // Real older users care about modest contrast, slower pace, clearer labels.
      timing: 1.6,
      form_complexity: 1.5,
      cognitive_load: 1.3,
      missing_label: 1.4,
      low_contrast: 1.0,       // Contrast helps but isn't critical
      touch_target: 1.0,       // Larger targets help; not crisis-level
      hover_dependent: 1.2,
      color_only: 0.7,
      missing_alt: 0.4,
    },
    visualFilter: {
      contrastThreshold: 1.5, blurRadius: 0.5, colorAttenuation: [0.95, 0.95, 0.9],
      attentionMode: 'large-elements', motorCostMultiplier: 1.2,
      processingSpeed: 0.7, noiseTolerance: 0.6,
    },
  },

  'motor-impairment-tremor': {
    persona: 'motor-impairment-tremor',
    category: 'motor',
    barrierWeights: {
      touch_target: 3.0,      // Critical — small targets + tremor = impossible
      hover_dependent: 2.5,    // Can't hover precisely
      timing: 2.0,             // Need more time due to imprecise movement
      form_complexity: 1.5,    // Each field is a motor challenge
      cognitive_load: 0.8,     // Cognitive is less affected
      low_contrast: 0.5,       // Vision is fine
      color_only: 0.3,         // Can see colors fine
      missing_alt: 0.2,        // Not relevant
      missing_label: 1.5,      // Labels help target the right field
    },
    visualFilter: {
      contrastThreshold: 0,    // Vision is fine
      blurRadius: 0,
      colorAttenuation: [1, 1, 1],
      attentionMode: 'center-heavy',  // Attention narrows to avoid accidental clicks
      motorCostMultiplier: 3.0,       // Everything is 3x harder to click
      processingSpeed: 0.8,
      noiseTolerance: 0.7,
    },
  },

  'low-vision-magnified': {
    persona: 'low-vision-magnified',
    category: 'vision',
    barrierWeights: {
      low_contrast: 3.0,       // Critical — can't see low contrast at all
      touch_target: 1.5,       // Magnified so targets appear larger, but still relevant
      color_only: 2.0,         // May not distinguish subtle color differences
      missing_alt: 2.5,        // Relies heavily on alt text
      missing_label: 2.0,      // Relies on labels
      audio_description: 1.5,  // Sees the video, loses on-screen detail and text
      cognitive_load: 1.0,
      timing: 1.5,             // Needs more time to scan magnified view
      hover_dependent: 1.0,
      form_complexity: 1.2,
    },
    visualFilter: {
      contrastThreshold: 7.0,   // Needs very high contrast
      blurRadius: 2.0,          // Reduced acuity
      colorAttenuation: [0.7, 0.7, 0.7],  // Reduced color perception
      attentionMode: 'large-elements',     // Only sees large things
      motorCostMultiplier: 1.2,
      processingSpeed: 0.6,     // Slow visual processing
      noiseTolerance: 0.4,      // Easily overwhelmed
    },
  },

  'cognitive-adhd': {
    persona: 'cognitive-adhd',
    category: 'cognitive',
    barrierWeights: {
      cognitive_load: 3.0,     // Critical — overwhelmed by complexity
      timing: 2.5,             // Time pressure causes panic
      form_complexity: 2.5,    // Long forms = abandonment
      touch_target: 0.5,       // Motor is fine
      low_contrast: 0.8,       // Vision is fine
      color_only: 0.5,
      missing_alt: 0.3,
      hover_dependent: 1.0,
      missing_label: 1.5,      // Needs clear labels to stay focused
    },
    visualFilter: {
      contrastThreshold: 0,
      blurRadius: 0,
      colorAttenuation: [1, 1, 1],
      attentionMode: 'motion-attracted',  // Attention hijacked by movement
      motorCostMultiplier: 1.0,
      processingSpeed: 0.5,    // Slow sustained attention
      noiseTolerance: 0.3,     // Very easily overwhelmed
    },
  },

  'dyslexic-user': {
    persona: 'dyslexic-user',
    category: 'cognitive',
    barrierWeights: {
      cognitive_load: 2.5,     // Text-heavy pages are exhausting
      form_complexity: 2.0,    // Reading labels is hard
      low_contrast: 1.5,       // Low contrast makes text harder
      timing: 1.5,             // Need more time to read
      missing_label: 2.0,      // Relies on clear labels
      touch_target: 0.5,
      color_only: 0.8,
      missing_alt: 1.0,
      hover_dependent: 0.8,
    },
    visualFilter: {
      contrastThreshold: 0,
      blurRadius: 0,
      colorAttenuation: [1, 1, 1],
      attentionMode: 'text-focused',  // Attention locked on text, struggling
      motorCostMultiplier: 1.0,
      processingSpeed: 0.4,    // Very slow text processing
      noiseTolerance: 0.5,
    },
  },

  'color-blind-deuteranopia': {
    persona: 'color-blind-deuteranopia',
    category: 'vision',
    barrierWeights: {
      color_only: 3.0,         // Critical — can't see color differences
      low_contrast: 2.0,       // Some contrasts disappear
      missing_alt: 1.0,
      missing_label: 1.0,
      cognitive_load: 0.8,
      touch_target: 0.5,
      timing: 0.5,
      hover_dependent: 0.5,
      form_complexity: 0.8,
    },
    visualFilter: {
      contrastThreshold: 0,
      blurRadius: 0,
      colorAttenuation: [1.0, 0.0, 0.7],  // No green channel (deuteranopia)
      attentionMode: 'uniform',
      motorCostMultiplier: 1.0,
      processingSpeed: 0.9,
      noiseTolerance: 0.8,
    },
  },

  /**
   * Navigating by audio, not by sight.
   *
   * Absent entirely before, so screen-reader-user fell through to
   * DEFAULT_PROFILE and every barrier weighed a flat 1.0. That is not neutral:
   * with no damping, full deductions applied and the persona scored 2 out of
   * 100 -- worse than any recognised one -- because nothing was weighting the
   * arithmetic, not because the page was worse for them.
   *
   * The weights invert the visual defaults. Touch-target size and contrast are
   * close to irrelevant to someone who never sees the target; missing alt text
   * and missing labels are the whole experience, since they are the only
   * description of an image or control that exists.
   */
  'screen-reader-user': {
    persona: 'screen-reader-user',
    category: 'vision',
    barrierWeights: {
      missing_alt: 3.0,        // The image IS the alt text; without it there is nothing
      missing_label: 3.0,      // An unlabelled control is unusable, not just awkward
      audio_description: 3.0,  // The only route to a video's visual content
      // Captions transcribe audio this persona can already hear. Near-zero is
      // the honest weight; it read 1.0 while audio description had no key at
      // all, so "add captions" ranked as their top media fix.
      captions: 0.2,
      hover_dependent: 2.5,    // Hover has no keyboard or AT equivalent
      timing: 2.0,             // Re-reading by audio takes longer than by eye
      form_complexity: 1.8,
      cognitive_load: 1.2,     // Linear audio traversal of a busy page is costly
      low_contrast: 0.1,       // Not perceived
      color_only: 0.1,         // Not perceived
      touch_target: 0.1,       // Not pointed at
    },
    visualFilter: {
      contrastThreshold: 0,
      blurRadius: 0,
      colorAttenuation: [1, 1, 1],
      noiseTolerance: 0.8,
      motorCostMultiplier: 1.0,
      // text-focused: the page reaches this persona as text in DOM order.
      // The union has no 'sequential' member and adding one would change a type
      // other code switches on, for a distinction this model does not yet act
      // on -- text-focused is the closest true statement available.
      attentionMode: 'text-focused',
      processingSpeed: 1.0,
    },
  },

  'deaf-user': {
    persona: 'deaf-user',
    category: 'hearing',
    barrierWeights: {
      // Most visual barriers are less relevant
      touch_target: 0.5,
      low_contrast: 0.5,
      color_only: 0.5,
      cognitive_load: 0.8,
      timing: 1.5,            // Can't hear audio cues for time limits
      // The criterion this persona exists to surface. Left unweighted it
      // resolved to a neutral 1.0, so an audit run AS a deaf user rated
      // missing captions no higher than anything else on the page.
      captions: 3.0,
      audio_description: 0.1,  // Visual content is perceived directly
      missing_alt: 1.0,
      missing_label: 1.0,
      hover_dependent: 0.5,
      form_complexity: 0.8,
    },
    visualFilter: {
      contrastThreshold: 0,
      blurRadius: 0,
      colorAttenuation: [1, 1, 1],
      attentionMode: 'uniform',
      motorCostMultiplier: 1.0,
      processingSpeed: 1.0,
      noiseTolerance: 0.9,
    },
  },

  'elderly-low-vision': {
    persona: 'elderly-low-vision',
    category: 'vision',
    barrierWeights: {
      touch_target: 2.0,      // Reduced dexterity
      low_contrast: 2.5,      // Aging eyes need high contrast
      timing: 2.0,            // Slower processing
      form_complexity: 2.0,   // Cognitive decline
      cognitive_load: 2.0,    // Easily confused
      color_only: 1.5,
      missing_alt: 1.5,
      missing_label: 2.0,
      audio_description: 1.5,
      hover_dependent: 1.5,
    },
    visualFilter: {
      contrastThreshold: 5.0,
      blurRadius: 1.5,
      colorAttenuation: [0.8, 0.8, 0.7],  // Yellowing lens
      attentionMode: 'text-focused',
      motorCostMultiplier: 1.8,
      processingSpeed: 0.5,
      noiseTolerance: 0.4,
    },
  },
};

// Default profile for unknown personas
const DEFAULT_PROFILE: PerceptualProfile = {
  persona: 'default',
  category: 'general',
  barrierWeights: {
    touch_target: 1.0, low_contrast: 1.0, cognitive_load: 1.0,
    timing: 1.0, color_only: 1.0, missing_alt: 1.0,
    missing_label: 1.0, hover_dependent: 1.0, form_complexity: 1.0,
  },
  visualFilter: {
    contrastThreshold: 0, blurRadius: 0, colorAttenuation: [1, 1, 1],
    attentionMode: 'uniform', motorCostMultiplier: 1.0,
    processingSpeed: 1.0, noiseTolerance: 1.0,
  },
};

// ── Public API ──

/**
 * Get the perceptual profile for a persona.
 *
 * For built-in personas, returns the hardcoded profile.
 * For custom personas, synthesizes a profile from accessibility traits if provided,
 * or infers from the persona name as a fallback.
 */
export function getPerceptualProfile(
  personaName: string,
  accessibilityTraits?: {
    motorControl?: number;
    tremor?: boolean;
    visionLevel?: number;
    contrastSensitivity?: number;
    processingSpeed?: number;
    attentionSpan?: number;
    fatigueSusceptibility?: number;
  },
): PerceptualProfile {
  // Built-in profiles take priority
  if (PERCEPTUAL_PROFILES[personaName]) {
    return PERCEPTUAL_PROFILES[personaName];
  }

  // Synthesize from accessibility traits if provided
  if (accessibilityTraits) {
    return synthesizePerceptualProfile(personaName, accessibilityTraits);
  }

  // Name-based inference as last resort
  const name = personaName.toLowerCase();
  if (name.includes('vision') || name.includes('blind') || name.includes('magnif') || name.includes('elderly')) {
    // Clone elderly-low-vision as a reasonable default for vision-related custom personas
    return { ...PERCEPTUAL_PROFILES['elderly-low-vision'], persona: personaName };
  }
  if (name.includes('motor') || name.includes('tremor') || name.includes('parkinson')) {
    return { ...PERCEPTUAL_PROFILES['motor-impairment-tremor'], persona: personaName };
  }
  if (name.includes('adhd') || name.includes('cognitive') || name.includes('dyslexic')) {
    return { ...PERCEPTUAL_PROFILES['cognitive-adhd'], persona: personaName };
  }
  if (name.includes('screen-reader') || name.includes('screenreader')
      || name.includes('nvda') || name.includes('jaws') || name.includes('voiceover')) {
    return { ...PERCEPTUAL_PROFILES['screen-reader-user'], persona: personaName };
  }
  if (name.includes('deaf') || name.includes('hearing')) {
    return { ...PERCEPTUAL_PROFILES['deaf-user'], persona: personaName };
  }
  if (name.includes('color') && name.includes('blind') || name.includes('deuteranop')) {
    return { ...PERCEPTUAL_PROFILES['color-blind-deuteranopia'], persona: personaName };
  }

  return DEFAULT_PROFILE;
}

/**
 * Synthesize a perceptual profile from accessibility traits.
 * Maps trait values (0-1) to perceptual filter parameters.
 */
function synthesizePerceptualProfile(
  personaName: string,
  traits: Record<string, unknown>,
): PerceptualProfile {
  const motorControl = (traits.motorControl as number) ?? 1.0;
  const visionLevel = (traits.visionLevel as number) ?? 1.0;
  const contrastSensitivity = (traits.contrastSensitivity as number) ?? 1.0;
  const processingSpeed = (traits.processingSpeed as number) ?? 1.0;
  const attentionSpan = (traits.attentionSpan as number) ?? 1.0;
  const fatigue = (traits.fatigueSusceptibility as number) ?? 0.0;
  const hasTremor = !!traits.tremor;

  // Determine category from trait profile
  const isVision = visionLevel < 0.7 || contrastSensitivity < 0.7;
  const isMotor = motorControl < 0.7 || hasTremor;
  const isCognitive = processingSpeed < 0.6 || attentionSpan < 0.5;
  const category: PerceptualProfile['category'] =
    isVision ? 'vision' : isMotor ? 'motor' : isCognitive ? 'cognitive' : 'general';

  // Map vision level to blur/contrast/attenuation
  const blurRadius = Math.max(0, (1 - visionLevel) * 4); // 0 at 1.0, 4.0 at 0.0
  const contrastThreshold = Math.max(0, (1 - contrastSensitivity) * 10); // 0 at 1.0, 10 at 0.0
  const colorDim = 0.3 + visionLevel * 0.7; // 0.3 at 0.0, 1.0 at 1.0
  const colorAttenuation: [number, number, number] = [colorDim, colorDim, colorDim * 0.9]; // slight yellowing

  // Map motor control to motor cost
  const motorCostMultiplier = hasTremor ? 3.0 : 1 + (1 - motorControl) * 2; // 1.0 at 1.0, 3.0 at 0.0

  // Attention mode from traits
  const attentionMode: PerceptualFilter['attentionMode'] =
    isVision ? 'large-elements' :
    isCognitive ? 'motion-attracted' :
    isMotor ? 'center-heavy' :
    'uniform';

  // Barrier weights derived from trait profile
  const barrierWeights: Record<string, number> = {
    touch_target: isMotor ? 3.0 : isVision ? 1.5 : 1.0,
    low_contrast: isVision ? 3.0 : 1.0,
    cognitive_load: isCognitive ? 3.0 : isVision ? 2.0 : 1.0,
    timing: isVision || isCognitive ? 2.0 : isMotor ? 1.5 : 1.0,
    color_only: isVision ? 2.0 : 1.0,
    missing_alt: isVision ? 2.5 : 1.0,
    missing_label: isVision || isMotor ? 2.0 : 1.0,
    hover_dependent: isMotor ? 2.5 : 1.0,
    form_complexity: isCognitive ? 2.5 : isMotor ? 1.5 : 1.0,
  };

  return {
    persona: personaName,
    category,
    barrierWeights,
    visualFilter: {
      contrastThreshold,
      blurRadius,
      colorAttenuation,
      attentionMode,
      motorCostMultiplier,
      processingSpeed: Math.max(0.3, processingSpeed),
      noiseTolerance: Math.max(0.2, attentionSpan * (1 - fatigue)),
    },
  };
}

/**
 * Apply persona-weighted barrier scoring.
 *
 * Instead of flat deductions per barrier type, multiplies each deduction
 * by the persona's sensitivity to that barrier type. This produces
 * meaningfully different scores per persona from the same set of barriers.
 *
 * @param barriers - Detected barriers (same for all personas on same page)
 * @param frictionPoints - Detected friction points
 * @param goalAchieved - Whether the persona achieved their goal
 * @param personaName - Persona to score for
 * @returns Weighted score and breakdown
 */
export function calculatePerceptualScore(
  barriers: Array<{ type: string; severity: string; element?: string; wcagCriteria?: string[] }>,
  frictionPoints: Array<{ impact: string }>,
  goalAchieved: boolean,
  personaName: string,
  accessibilityTraits?: Record<string, unknown>,
): {
  score: number;
  deductions: Record<string, number>;
  informationLoss: number;
  cognitiveLoad: number;
  motorCost: number;
  explanation: string;
  /** Per-barrier-type susceptibility weight applied for this persona. */
  appliedWeights: Record<string, number>;
  /** Points deducted for reading/processing friction. */
  frictionDeduction: number;
  /** Points deducted for failing the goal, capped at 25. */
  goalDeduction: number;
  /** Points deducted for cognitive overload. */
  cognitiveOverloadPenalty: number;
} {
  const profile = getPerceptualProfile(personaName, accessibilityTraits as any);
  const filter = profile.visualFilter;
  let score = 100;
  const deductions: Record<string, number> = {};
  /** Per-barrier-type susceptibility weight actually applied for this persona. */
  const appliedWeights: Record<string, number> = {};

  // Grouped by the susceptibility key that WEIGHTS them, not by the detector's
  // type label.
  //
  // Grouping by type meant one weight for the whole bucket, and "sensory"
  // holds barriers that could not be more different for the same person:
  // missing alt text (3.0 for a screen-reader user), missing audio description
  // (3.0), missing captions (0.2) and colour-only information (0.1). The
  // type-level lookup resolved sensory to colour-only, so the two findings
  // ranked #1 and #2 for that persona -- both critical, both weight 3.0 in the
  // list -- were scored at 0.1 and deducted 4.2 points between them, while
  // hover interaction at 2.5 dominated the score.
  //
  // That left two weighting systems in one payload: per-key weights driving
  // severityForPersona and the ordering, per-type weights driving the
  // arithmetic. They disagreed and the arithmetic used the coarser one.
  // (2026-07-31)
  const byKey = new Map<string, Array<{ severity: string }>>();
  for (const b of barriers) {
    const key = weightKeyFor(b.type, b.wcagCriteria) ?? b.type;
    const existing = byKey.get(key) || [];
    existing.push(b);
    byKey.set(key, existing);
  }

  // Apply persona-weighted deductions
  for (const [weightKey, typeBarriers] of byKey) {
    // The group key IS the susceptibility key, resolved by the same
    // weightKeyFor the payload reports as personaWeightKey. Scoring and
    // display therefore cannot disagree: there is one lookup, one table, one
    // answer per barrier. (2026-07-31)
    const weight = profile.barrierWeights[weightKey] ?? 1.0;

    const critical = typeBarriers.filter(b => b.severity === 'critical').length;
    const major = typeBarriers.filter(b => b.severity === 'major').length;
    const minor = typeBarriers.filter(b => b.severity === 'minor').length;

    // Base deductions (same formula as before)
    const criticalBase = Math.min(25, critical > 0 ? 15 + Math.min(critical - 1, 2) * 5 : 0);
    const majorBase = Math.min(15, major > 0 ? 8 + Math.min(major - 1, 2) * 3 : 0);
    const minorBase = Math.min(8, minor > 0 ? 3 + Math.min(minor - 1, 3) * 1.5 : 0);

    // Apply persona weight — this is the key differentiator
    const weighted = (criticalBase + majorBase + minorBase) * weight;
    // Saturating ceiling rather than a hard clip.
    //
    // Math.min(35, weighted) flattened everything above the cap onto the same
    // number. Once deductions were grouped by susceptibility key instead of by
    // type the buckets got much finer, and a single critical barrier at weight
    // 3.0 raws to 45 -- so the clip bound constantly and unequal findings came
    // out equal: one undescribed video (raw 45) and three hover-only controls
    // (raw 62.5) both reported exactly -35.
    //
    // Lowering the clip makes that worse, not better: it binds more often. An
    // exponential approach to the ceiling is strictly increasing, so two
    // buckets are equal only when their raw values are equal. They can get
    // close to the ceiling but never reach it and never collide there. The
    // ceiling also drops 35 -> 30, because finer buckets mean more of them.
    // (2026-07-31)
    const capped = BARRIER_DEDUCTION_CEILING *
      (1 - Math.exp(-weighted / BARRIER_DEDUCTION_CEILING));

    if (capped > 0) {
      deductions[weightKey] = -Math.round(capped * 10) / 10;
      // Barriers carry an affectedPersonas list naming a couple of exemplars,
      // which reads as exclusive next to a deduction charged to some other
      // persona. It is not a contradiction — susceptibility is applied here as a
      // weight, not a filter (cognitive-adhd carries touch_target 0.5 against
      // motor-impairment-tremor's 3.0). Recording the weight makes the payload
      // explain its own arithmetic instead of looking self-contradictory.
      // (2026-07-28)
      appliedWeights[weightKey] = weight;
      score -= capped;
    }
  }

  // Friction deduction scaled by processing speed
  // Slower processors are more affected by friction
  let rawFriction = 0;
  for (const fp of frictionPoints) {
    switch (fp.impact) {
      case 'high': rawFriction += 8; break;
      case 'medium': rawFriction += 4; break;
      case 'low': rawFriction += 2; break;
    }
  }
  const frictionDeduction = Math.min(25, rawFriction / filter.processingSpeed);
  score -= frictionDeduction;

  // Goal penalty scaled by motor cost (harder to reach = harder to achieve)
  const goalDeduction = goalAchieved ? 0 : 15 * filter.motorCostMultiplier;
  score -= Math.min(25, goalDeduction);

  // Persona susceptibility to visual noise, NOT a finding that the page
  // overloaded anyone.
  //
  // Derived from the persona's own noiseTolerance and charged on every page,
  // so it is non-zero for a sensitive persona even on a calm one. The separate
  // `overloaded` flag is a page measurement from cognitive-transport.ts,
  // computed against a threshold. The two disagreeing is expected and not a
  // bug -- but the name said otherwise, and a -7 charge sitting beside
  // "overloaded: false" reads as one of the two being broken.
  const cognitiveLoad = 1 - filter.noiseTolerance;
  // Rounded at the source. Binary floating point turns 1 - 0.9 into
  // 0.09999999999999998, and that reached a report a customer reads.
  const cognitiveOverloadPenalty = Math.round(cognitiveLoad * 10 * 1000) / 1000;
  score -= cognitiveOverloadPenalty;

  // Information loss estimate from filter properties
  const channelLoss = 1 - (filter.colorAttenuation[0] + filter.colorAttenuation[1] + filter.colorAttenuation[2]) / 3;
  const acuityLoss = Math.min(1, filter.blurRadius / 5);
  const informationLoss = (channelLoss + acuityLoss) / 2;

  // Motor cost from filter
  const motorCost = Math.min(1, (filter.motorCostMultiplier - 1) / 2);

  score = Math.max(0, Math.min(100, Math.round(score)));

  // Build explanation
  //
  // Every bucket is named, largest first. `.slice(0, 3)` dropped the rest, so
  // on a four-bucket tremor audit the prose summed to -46.1 beside a
  // deductionsByType totalling -50 (color_only -3.9 went unmentioned). There
  // are only a handful of weight keys, so naming all of them costs a few words
  // and lets a reader add the sentence up to the number. (2026-10-07)
  const topDeductions = Object.entries(deductions)
    .sort(([, a], [, b]) => a - b)
    .map(([type, d]) => `${type.replace(/_/g, ' ')} (${d})`)
    .join(', ');

  const explanation = [
    topDeductions ? `Weighted barrier deductions: ${topDeductions}` : '',
    frictionDeduction > 0 ? `Friction (${filter.processingSpeed}x speed): -${frictionDeduction.toFixed(1)}` : '',
    // The capped figure -- the one subtracted above and returned as
    // goalDeduction. The raw value printed "-45.0" for tremor (3.0x) beside a
    // 25-point deduction. (2026-10-07)
    goalDeduction > 0 ? `Goal penalty (${filter.motorCostMultiplier}x motor): -${Math.min(25, goalDeduction).toFixed(1)}` : '',
    cognitiveOverloadPenalty > 0 ? `Cognitive overload (${filter.noiseTolerance} tolerance): -${cognitiveOverloadPenalty.toFixed(1)}` : '',
    informationLoss > 0.05 ? `Visual info loss: ${(informationLoss * 100).toFixed(0)}%` : '',
  ].filter(Boolean).join('. ');

  return {
    score,
    deductions,
    informationLoss,
    cognitiveLoad,
    motorCost,
    explanation,
    appliedWeights,
    // These three were computed, subtracted from the score, written into the
    // explanation prose above, and then discarded. The caller therefore had no
    // way to read them, which is why scoreContext.frictionDeduction was
    // hardcoded to 0 while the prose beside it reported a real friction figure.
    // (2026-07-28)
    frictionDeduction,
    goalDeduction: Math.min(25, goalDeduction),
    cognitiveOverloadPenalty,
  };
}

/**
 * Compute visual perception analysis for a persona using a screenshot.
 *
 * Applies the persona's visual filter to the image and measures
 * the Wasserstein distance between original and filtered versions —
 * quantifying how much visual information this persona loses.
 *
 * @param screenshotPath - Path to page screenshot
 * @param personaName - Persona to analyze for
 * @returns Perceptual analysis with transport-based metrics
 */
export async function analyzePerceptualTransport(
  screenshotPath: string,
  personaName: string,
  attentionData?: { entropy: number; concentration: number; transportCost: number },
  accessibilityTraits?: Record<string, unknown>,
): Promise<PerceptualAnalysis> {
  const startTime = performance.now();
  const profile = getPerceptualProfile(personaName, accessibilityTraits as any);
  const filter = profile.visualFilter;

  // Load and apply perceptual filter to create "what this persona sees"
  const sharpModule: any = await import('sharp');
  const sharp = sharpModule.default ?? sharpModule;

  const original = sharp(screenshotPath);
  const metadata = await original.metadata();
  const width = Math.round((metadata.width || 800) * 0.5);
  const height = Math.round((metadata.height || 600) * 0.5);

  // Build the filtered version
  let filtered = sharp(screenshotPath).resize(width, height);

  // Apply blur for reduced acuity
  if (filter.blurRadius > 0) {
    filtered = filtered.blur(Math.max(0.3, filter.blurRadius));
  }

  // Apply color attenuation (simulate color blindness / reduced color perception)
  const [rAtt, gAtt, bAtt] = filter.colorAttenuation;
  if (rAtt < 1 || gAtt < 1 || bAtt < 1) {
    // Use recomb matrix to attenuate channels
    // For deuteranopia: shift green into red/blue
    filtered = filtered.recomb([
      [rAtt, (1 - rAtt) * 0.5, (1 - rAtt) * 0.5],
      [(1 - gAtt) * 0.5, gAtt, (1 - gAtt) * 0.5],
      [(1 - bAtt) * 0.3, (1 - bAtt) * 0.3, bAtt + (1 - bAtt) * 0.4],
    ]);
  }

  // Apply contrast reduction for low-vision
  if (filter.contrastThreshold > 3) {
    const factor = Math.max(0.3, 1 - (filter.contrastThreshold - 3) / 10);
    filtered = filtered.modulate({ brightness: factor });
  }

  // Save filtered version to temp file
  const { join } = await import('path');
  const { tmpdir } = await import('os');
  const filteredPath = join(tmpdir(), `perceptual-${personaName}-${Date.now()}.png`);
  await filtered.png().toFile(filteredPath);

  // Also save downscaled original for comparison
  const originalPath = join(tmpdir(), `perceptual-original-${Date.now()}.png`);
  await sharp(screenshotPath).resize(width, height).png().toFile(originalPath);

  // Compute Wasserstein distance between original and filtered
  const transportResult = await computeWassersteinDistance(originalPath, filteredPath, {
    compareMode: 'combined',
    numProjections: 32,
    downscale: 1.0, // Already downscaled
  });

  // Clean up temp files
  const { unlinkSync } = await import('fs');
  try { unlinkSync(filteredPath); } catch {}
  try { unlinkSync(originalPath); } catch {}

  // Derive metrics — all MUST incorporate page-specific transport distance
  const distance = transportResult.distance;
  const informationLoss = Math.min(1, distance * 3);
  const channelDistances = transportResult.details.channelDistances;

  // Spatial channel distance indicates visual layout complexity
  const spatialComplexity = Math.min(1, (channelDistances?.spatial ?? distance) * 4);
  // Color channel variance indicates visual differentiation difficulty
  const colorComplexity = Math.min(1,
    ((channelDistances?.r ?? 0) + (channelDistances?.g ?? 0) + (channelDistances?.b ?? 0)) * 2
  );

  // Attention mismatch: persona sensitivity × page visual complexity × attention analysis
  const processingFactor = 1 - filter.processingSpeed;
  const pageVisualLoad = (spatialComplexity * 0.6 + colorComplexity * 0.4);

  // Use attention analysis data when available (page-specific entropy/concentration)
  // High entropy = scattered attention = higher mismatch for focused personas
  // Low concentration = distributed attention = harder for goal-directed personas
  const attnEntropy = attentionData?.entropy ?? 0.5;
  const attnConcentration = attentionData?.concentration ?? 0.5;
  const attnTransportCost = attentionData?.transportCost ?? 0;
  console.log(`[perceptual] attentionData=${attentionData ? 'YES' : 'NO'} entropy=${attnEntropy.toFixed(3)} concentration=${attnConcentration.toFixed(3)} transportCost=${attnTransportCost.toFixed(3)}`);

  // Concentration scatter: the most discriminating page metric (63% range in testing)
  const scatterCost = (1 - attnConcentration); // 0.44 for cbrowser, 0.66 for UCDenver

  // attentionMismatch: 50% page-driven (scatter + transport), 50% persona
  let personaAttentionBase = 0;
  switch (filter.attentionMode) {
    case 'motion-attracted': personaAttentionBase = 0.3; break;
    case 'center-heavy': personaAttentionBase = 0.1; break;
    case 'large-elements': personaAttentionBase = 0.2; break;
    case 'text-focused': personaAttentionBase = 0.1; break;
    case 'uniform': personaAttentionBase = 0.05; break;
  }
  const attentionMismatch = Math.min(1,
    personaAttentionBase * 0.3 + processingFactor * 0.1 +  // 40% persona
    scatterCost * 0.35 + attnTransportCost * 0.25          // 60% page
  );

  // Motor cost: persona motor multiplier × page spatial complexity
  const motorCost = Math.min(1, ((filter.motorCostMultiplier - 1) / 2) * (0.3 + spatialComplexity * 0.7));

  // cognitiveLoad: 60% page-driven (scatter + information + entropy), 40% persona
  const cognitiveLoad = Math.min(1,
    (1 - filter.noiseTolerance) * 0.15 + processingFactor * 0.05 +  // 20% persona
    scatterCost * 0.4 + informationLoss * 0.2 + attnEntropy * 0.2  // 80% page
  );

  // Composite perceptual score
  // Direct concentration term ensures the most discriminating signal drives the score
  const concentrationBonus = (attnConcentration - 0.45) * 20; // ±11 points
  const perceptualScore = Math.max(0, Math.min(100, Math.round(
    100
    - informationLoss * 25
    - attentionMismatch * 20
    - cognitiveLoad * 20
    - motorCost * 10
    + concentrationBonus
  )));

  return {
    persona: personaName,
    category: profile.category,
    informationLoss,
    attentionMismatch,
    motorCost,
    cognitiveLoad,
    perceptualScore,
    weightedDeductions: {},
    transportDistance: transportResult.distance,
    computeTimeMs: performance.now() - startTime,
  };
}

/**
 * List all available perceptual profiles.
 */
export function listPerceptualProfiles(): string[] {
  return Object.keys(PERCEPTUAL_PROFILES);
}

/**
 * Severity of a barrier as this persona actually experiences it.
 *
 * Susceptibility weights already exist and already drive scoring, but the
 * severity a reader sees was persona-blind -- so a 169-item navigation
 * displayed as "minor" to cognitive-adhd while being charged at a 3.0
 * cognitive_load weight and driving the top bottleneck. The number said one
 * thing and the label said another, and the label is what gets acted on.
 *
 * The base severity is kept alongside, because it is the one that maps to WCAG
 * conformance: a criterion does not become more or less violated because of
 * who is reading. This is about triage order, not compliance.
 */
export type BarrierSeverityLevel = "minor" | "major" | "critical";

const SEVERITY_LADDER: BarrierSeverityLevel[] = ["minor", "major", "critical"];

export function weightedSeverity(
  base: string,
  weight: number,
): { severity: BarrierSeverityLevel; shifted: number } {
  const at = SEVERITY_LADDER.indexOf(base as BarrierSeverityLevel);
  if (at < 0) return { severity: "minor", shifted: 0 };
  // Thresholds chosen against the real weight table, which clusters at 0.3-0.5
  // for "not my problem", ~1.0 for baseline, and 2.5-3.0 for "this is the one
  // that stops me". Two steps only at the top of that range, so escalation
  // stays rare enough to mean something.
  const shift = weight >= 2.5 ? 2 : weight >= 1.5 ? 1 : weight <= 0.5 ? -1 : 0;
  const idx = Math.max(0, Math.min(SEVERITY_LADDER.length - 1, at + shift));
  return { severity: SEVERITY_LADDER[idx] as BarrierSeverityLevel, shifted: idx - at };
}

/**
 * Resolve a barrier to the key its susceptibility weight is stored under.
 *
 * The two vocabularies do not match and looking up the raw type silently
 * returned 1.0 for most barriers. Emitted types are sensory, cognitive_load,
 * motor_precision, visual_clarity, visual, motor, touch_target and timing;
 * weights are keyed color_only, missing_alt, low_contrast, touch_target,
 * cognitive_load, timing, missing_label, hover_dependent, form_complexity.
 * Only three overlap, so `sensory` -- the most common type -- always defaulted.
 *
 * That is how a deaf-user audit reported weight 1.0 on a colour-only barrier
 * while the persona's own table says 0.5: the table was right and the lookup
 * never reached it.
 *
 * WCAG criteria are consulted first because they identify the barrier far more
 * precisely than the type does: both a missing alt and a colour-only link are
 * "sensory", and they have opposite susceptibility profiles.
 */
/**
 * The single map from a detector-emitted barrier type to a profile weight key.
 *
 * Barrier types and susceptibility keys are different vocabularies, and this
 * file used to hold two independent translations between them -- one used to
 * SCORE, one used to DISPLAY the weight that was applied. They disagreed on
 * motor_precision, so an audit reported a 0.1 weight beside a deduction
 * computed at 2.5. Both paths read this now.
 */
export const BARRIER_TYPE_TO_WEIGHT_KEY: Record<string, string> = {
  contrast: "low_contrast",
  visual_clarity: "low_contrast",
  visual: "low_contrast",
  sensory: "color_only",
  motor_precision: "hover_dependent",
  motor: "touch_target",
  touch_target: "touch_target",
  cognitive_load: "cognitive_load",
  timing: "timing",
  form_complexity: "form_complexity",
};

const WCAG_TO_WEIGHT_KEY: Record<string, string> = {
  "1.4.1": "color_only",
  "1.1.1": "missing_alt",
  "1.4.3": "low_contrast",
  "1.4.11": "low_contrast",
  "2.5.8": "touch_target",
  "2.5.5": "touch_target",
  "1.2.1": "captions",
  "1.2.2": "captions",
  // Audio description is not captions, and collapsing them made the audit
  // recommend the wrong remedy to the wrong person: captions carry a video's
  // AUDIO to someone who cannot hear, audio description carries its VISUALS to
  // someone who cannot see. Under one key a blind user's top media finding was
  // "add captions" -- a fix that does nothing for them -- while the barrier
  // they actually hit had no criterion of its own. (2026-07-31)
  "1.2.3": "audio_description",
  "1.2.5": "audio_description",
  "2.2.1": "timing",
  "2.2.2": "timing",
  "3.3.2": "missing_label",
  "1.3.1": "missing_label",
};

const TYPE_TO_WEIGHT_KEY: Record<string, string> = BARRIER_TYPE_TO_WEIGHT_KEY;

export function weightKeyFor(barrierType: string, wcagCriteria?: string[]): string | null {
  for (const c of wcagCriteria ?? []) {
    const k = WCAG_TO_WEIGHT_KEY[c];
    if (k) return k;
  }
  return TYPE_TO_WEIGHT_KEY[barrierType] ?? null;
}

/**
 * Susceptibility weight for a barrier, and whether it was actually found.
 *
 * `defaulted` matters: an unmeasured 1.0 and a measured 1.0 mean different
 * things, and presenting the first as the second is what made a deaf user look
 * maximally susceptible to colour.
 */
export function barrierWeightFor(
  personaName: string,
  barrierType: string,
  wcagCriteria?: string[],
): { weight: number; key: string | null; defaulted: boolean } {
  const key = weightKeyFor(barrierType, wcagCriteria);
  try {
    const profile = getPerceptualProfile(personaName);
    // A profile that resolved to the generic default is not a configured
    // weight, whatever value it holds. DEFAULT_PROFILE carries 1.0 for every
    // key, so an unrecognised persona previously reported defaulted:false on
    // five identical 1.0s -- the field asserted "explicitly configured" about
    // numbers nobody had chosen for that persona.
    const isGeneric = profile.persona === "default";
    const w = key ? profile.barrierWeights?.[key] : undefined;
    if (typeof w === "number" && !isGeneric) return { weight: w, key, defaulted: false };
    return { weight: typeof w === "number" ? w : 1.0, key, defaulted: true };
  } catch {
    return { weight: 1.0, key, defaulted: true };
  }
}
