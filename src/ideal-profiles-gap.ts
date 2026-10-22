/**
 * Gap Score Calculator — Measures how well a page serves a specific persona
 *
 * Compares actual attention distribution, structural metrics, and cognitive
 * metrics against the ideal profile for a persona. Produces a 0-100 fitness
 * score with actionable fix recommendations.
 *
 * Scoring weights: attention 40%, structure 35%, cognitive 25%
 *
 * @version 1.0.0
 * @since v18.60.0
 */

import type { IdealProfile, IntentPreset, AttentionTarget } from './ideal-profiles.js';

// ── Types ──

export interface AttentionGap {
  /** Element type: "cta", "heading", "navigation", etc. */
  element: string;
  /** Actual % of attention this element received */
  actual: number;
  /** Ideal % for this persona */
  ideal: number;
  /** Absolute difference between actual and ideal */
  gap: number;
  /** Status: "good" if within min-max range, "low" if below, "high" if above */
  status: 'good' | 'low' | 'high';
  /** Actionable recommendation to fix the gap */
  fix: string;
}

export interface StructuralViolation {
  /** The structural rule that was violated */
  rule: string;
  /** The actual value found */
  actual: number | boolean;
  /** The limit defined in the profile */
  limit: number | boolean;
  /** Severity of the violation */
  severity: 'critical' | 'major' | 'minor';
  /** Actionable recommendation to fix the violation */
  fix: string;
}

export interface CognitiveOverThreshold {
  metric: string;
  actual: number;
  max: number;
  fix: string;
}

export interface FitnessScore {
  persona: string;
  intent: string;
  overall: number; // 0-100
  attentionFit: { score: number; gaps: AttentionGap[] };
  structureFit: { score: number; violations: StructuralViolation[] };
  cognitiveFit: { score: number; overThreshold: CognitiveOverThreshold[] };
  topFixes: string[]; // Top 5 prioritized recommendations
}

export interface StructuralMetrics {
  navItemCount: number;
  ctaCount: number;
  maxContentBlockWords: number;
  hasVisibleLabels: boolean;
  animationCount: number;
  hasColorRedundancy: boolean;
  minTouchTargetSize: number;
  informationDensity: number;
}

export interface CognitiveMetrics {
  /** The chain's totalCTC: a percentile of the real reference pages (21.x), not a logistic of the raw cost. */
  totalCTC: number;
  abandonmentRisk: number;
  decisionComplexity: number;
  readabilityCost: number;
}

// ── Fix Message Generators ──

const ELEMENT_LABELS: Record<string, string> = {
  cta: 'CTA (call-to-action)',
  heading: 'heading',
  navigation: 'navigation',
  content: 'content block',
  decorative: 'decorative element',
  search: 'search',
  form: 'form',
  price: 'price display',
  trust: 'trust signal',
};

function makeAttentionFix(element: string, actual: number, ideal: number, status: 'low' | 'high'): string {
  const label = ELEMENT_LABELS[element] || element;
  const rounded = (n: number) => Math.round(n);

  if (status === 'low') {
    switch (element) {
      case 'cta':
        return `Increase ${label} attention from ${rounded(actual)}% to ${rounded(ideal)}%: make primary CTA larger (min 200\u00d760px), use high-contrast color, reduce competing elements`;
      case 'heading':
        return `Increase ${label} attention from ${rounded(actual)}% to ${rounded(ideal)}%: use larger font size (min 24px), add whitespace above, use clear hierarchy`;
      case 'navigation':
        return `Increase ${label} attention from ${rounded(actual)}% to ${rounded(ideal)}%: use consistent placement, add visual weight with background or border`;
      case 'search':
        return `Increase ${label} attention from ${rounded(actual)}% to ${rounded(ideal)}%: expand search bar width, add placeholder text with example queries`;
      case 'content':
        return `Increase ${label} attention from ${rounded(actual)}% to ${rounded(ideal)}%: break into scannable chunks, use bullet points and short paragraphs`;
      default:
        return `Increase ${label} attention from ${rounded(actual)}% to ${rounded(ideal)}%: increase visual prominence and size`;
    }
  } else {
    switch (element) {
      case 'decorative':
        return `Reduce ${label} attention from ${rounded(actual)}% to ${rounded(ideal)}%: remove or fade decorative images, use subtle backgrounds instead`;
      case 'navigation':
        return `Reduce ${label} attention from ${rounded(actual)}% to ${rounded(ideal)}%: collapse secondary navigation into hamburger menu, reduce visual weight`;
      case 'content':
        return `Reduce ${label} attention from ${rounded(actual)}% to ${rounded(ideal)}%: shorten text blocks, use progressive disclosure, move details to sub-pages`;
      default:
        return `Reduce ${label} attention from ${rounded(actual)}% to ${rounded(ideal)}%: decrease visual prominence, reduce size or contrast`;
    }
  }
}

function makeStructuralFix(rule: string, actual: number | boolean, limit: number | boolean): string {
  switch (rule) {
    case 'maxNavItems':
      return `Reduce visible nav items from ${actual} to ${limit}: collapse secondary navigation into hamburger menu or "More" dropdown`;
    case 'maxCTAsAboveFold':
      return `Reduce CTAs above fold from ${actual} to ${limit}: keep only the primary action visible, move secondary CTAs below fold`;
    case 'maxContentBlockWords':
      return `Break content blocks from ${actual} words to max ${limit}: use bullet points and short paragraphs`;
    case 'requireVisibleLabels':
      return 'Add visible labels to all form inputs: do not rely on placeholder text alone as labels';
    case 'requirePredictableLayout':
      return 'Use a predictable, conventional layout: navigation at top, main content centered, footer at bottom';
    case 'maxAnimations':
      return `Remove ${Number(actual) - Number(limit)} animations: users lose focus with motion. Use prefers-reduced-motion CSS`;
    case 'requireColorRedundancy':
      return 'Add icons or patterns alongside color coding: color alone is not sufficient for conveying information';
    case 'minTouchTarget':
      return `Increase smallest touch target from ${actual}px to ${limit}px minimum: resize buttons and interactive elements`;
    case 'maxInformationDensity':
      return `Reduce information density from ${(Number(actual) * 100).toFixed(0)}% to max ${(Number(limit) * 100).toFixed(0)}%: add whitespace, reduce content per viewport`;
    default:
      return `Fix structural constraint: ${rule} (actual: ${actual}, limit: ${limit})`;
  }
}

/** 0.62 -> "62nd": a totalCTC as the percentile it is. */
function percentileOrdinal(t: number): string {
  const n = Math.floor(t * 100 + 1e-9);
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

function makeCognitiveFix(metric: string, actual: number, max: number): string {
  switch (metric) {
    case 'totalCTC':
      // A percentile of the reference since 21.x, so the fix names ranks.
      return `Lower the cognitive transport cost from the ${percentileOrdinal(actual)} to at most the ${percentileOrdinal(max)} percentile of the real pages in the reference: simplify forms, reduce steps, add autofill`;
    case 'abandonmentRisk':
      return `Reduce abandonment risk from ${actual.toFixed(0)}% to max ${max.toFixed(0)}%: add progress indicators, reduce friction, provide clear value proposition`;
    case 'decisionComplexity':
      return `Reduce decision complexity from ${actual.toFixed(2)} to max ${max.toFixed(2)}: limit choices, use clear defaults, add recommendation badges`;
    case 'readabilityCost':
      return `Reduce readability cost from ${actual.toFixed(2)} to max ${max.toFixed(2)}: use simpler language, shorter sentences, larger line spacing`;
    default:
      return `Reduce ${metric} from ${actual.toFixed(2)} to max ${max.toFixed(2)}`;
  }
}

// ── Severity Classification ──

function classifyStructuralSeverity(rule: string, actual: number | boolean, limit: number | boolean): 'critical' | 'major' | 'minor' {
  if (typeof actual === 'boolean' || typeof limit === 'boolean') {
    // Boolean violations (labels, predictable layout, color redundancy) are major
    return 'major';
  }

  const ratio = (actual as number) / (limit as number);

  switch (rule) {
    case 'maxAnimations':
      // Any animation for personas that need zero is critical
      return limit === 0 && (actual as number) > 0 ? 'critical' : 'major';
    case 'minTouchTarget':
      return (actual as number) < 30 ? 'critical' : ratio < 0.7 ? 'major' : 'minor';
    case 'maxNavItems':
    case 'maxCTAsAboveFold':
      return ratio > 2 ? 'critical' : ratio > 1.5 ? 'major' : 'minor';
    case 'maxContentBlockWords':
      return ratio > 3 ? 'critical' : ratio > 2 ? 'major' : 'minor';
    case 'maxInformationDensity':
      return ratio > 2 ? 'critical' : ratio > 1.5 ? 'major' : 'minor';
    default:
      return ratio > 2 ? 'major' : 'minor';
  }
}

// ── Core: Fitness Score Computation ──

/**
 * Compute how well a page serves a specific persona, given its attention
 * distribution, structural metrics, and cognitive metrics.
 *
 * @param profile - The ideal profile for the persona
 * @param intentPreset - Optional intent preset (modifies attention targets)
 * @param attentionDistribution - element_type -> % of top attention
 * @param structuralMetrics - Page structural measurements
 * @param cognitiveMetrics - Cognitive load measurements
 * @returns FitnessScore with 0-100 overall score and fix recommendations
 */
export function computeFitnessScore(
  profile: IdealProfile,
  intentPreset: IntentPreset | null,
  attentionDistribution: Record<string, number>,
  structuralMetrics: StructuralMetrics,
  cognitiveMetrics: CognitiveMetrics,
): FitnessScore {
  // ── 1. Attention Fit (40% of overall) ──
  const gaps: AttentionGap[] = [];
  let attentionScoreSum = 0;
  let attentionCount = 0;

  for (const [element, target] of Object.entries(profile.attentionTargets)) {
    const actual = attentionDistribution[element] ?? 0;

    // Apply intent modifier if present
    let adjustedTarget: AttentionTarget = target;
    if (intentPreset && intentPreset.elementModifiers[element] !== undefined) {
      const modifier = intentPreset.elementModifiers[element];
      adjustedTarget = {
        min: target.min * modifier,
        max: target.max * modifier,
        ideal: target.ideal * modifier,
      };
      // Clamp to 0-100 after modification
      adjustedTarget.min = Math.max(0, Math.min(100, adjustedTarget.min));
      adjustedTarget.max = Math.max(0, Math.min(100, adjustedTarget.max));
      adjustedTarget.ideal = Math.max(0, Math.min(100, adjustedTarget.ideal));
    }

    const gap = Math.abs(actual - adjustedTarget.ideal);
    let status: 'good' | 'low' | 'high';
    if (actual >= adjustedTarget.min && actual <= adjustedTarget.max) {
      status = 'good';
    } else if (actual < adjustedTarget.min) {
      status = 'low';
    } else {
      status = 'high';
    }

    // Score: 100 if within range, degrade as gap increases
    let elementScore: number;
    if (status === 'good') {
      // Perfect is at ideal, still good within range
      const rangeSpan = adjustedTarget.max - adjustedTarget.min || 1;
      const distFromIdeal = Math.abs(actual - adjustedTarget.ideal) / rangeSpan;
      elementScore = 100 - distFromIdeal * 20; // Slight penalty for being off-ideal within range
    } else {
      // Outside range: score degrades with distance from nearest boundary
      const boundary = status === 'low' ? adjustedTarget.min : adjustedTarget.max;
      const distance = Math.abs(actual - boundary);
      const rangeSpan = adjustedTarget.max - adjustedTarget.min || 1;
      elementScore = Math.max(0, 80 - (distance / rangeSpan) * 80);
    }

    attentionScoreSum += elementScore;
    attentionCount++;

    const fix = status !== 'good'
      ? makeAttentionFix(element, actual, adjustedTarget.ideal, status)
      : '';

    gaps.push({ element, actual, ideal: adjustedTarget.ideal, gap, status, fix });
  }

  const attentionScore = attentionCount > 0 ? attentionScoreSum / attentionCount : 100;

  // ── 2. Structure Fit (35% of overall) ──
  const violations: StructuralViolation[] = [];
  const structureChecks: Array<{ rule: string; passed: boolean }> = [];

  // Numeric checks (actual must be <= limit)
  const numericChecks: Array<{ rule: string; actual: number; limit: number }> = [
    { rule: 'maxNavItems', actual: structuralMetrics.navItemCount, limit: profile.structure.maxNavItems },
    { rule: 'maxCTAsAboveFold', actual: structuralMetrics.ctaCount, limit: profile.structure.maxCTAsAboveFold },
    { rule: 'maxContentBlockWords', actual: structuralMetrics.maxContentBlockWords, limit: profile.structure.maxContentBlockWords },
    { rule: 'maxAnimations', actual: structuralMetrics.animationCount, limit: profile.structure.maxAnimations },
    { rule: 'maxInformationDensity', actual: structuralMetrics.informationDensity, limit: profile.structure.maxInformationDensity },
  ];

  for (const check of numericChecks) {
    const passed = check.actual <= check.limit;
    structureChecks.push({ rule: check.rule, passed });
    if (!passed) {
      violations.push({
        rule: check.rule,
        actual: check.actual,
        limit: check.limit,
        severity: classifyStructuralSeverity(check.rule, check.actual, check.limit),
        fix: makeStructuralFix(check.rule, check.actual, check.limit),
      });
    }
  }

  // Min touch target (actual must be >= limit)
  const touchPassed = structuralMetrics.minTouchTargetSize >= profile.structure.minTouchTarget;
  structureChecks.push({ rule: 'minTouchTarget', passed: touchPassed });
  if (!touchPassed) {
    violations.push({
      rule: 'minTouchTarget',
      actual: structuralMetrics.minTouchTargetSize,
      limit: profile.structure.minTouchTarget,
      severity: classifyStructuralSeverity('minTouchTarget', structuralMetrics.minTouchTargetSize, profile.structure.minTouchTarget),
      fix: makeStructuralFix('minTouchTarget', structuralMetrics.minTouchTargetSize, profile.structure.minTouchTarget),
    });
  }

  // Boolean checks
  if (profile.structure.requireVisibleLabels && !structuralMetrics.hasVisibleLabels) {
    structureChecks.push({ rule: 'requireVisibleLabels', passed: false });
    violations.push({
      rule: 'requireVisibleLabels',
      actual: false,
      limit: true,
      severity: 'major',
      fix: makeStructuralFix('requireVisibleLabels', false, true),
    });
  } else {
    structureChecks.push({ rule: 'requireVisibleLabels', passed: true });
  }

  if (profile.structure.requireColorRedundancy && !structuralMetrics.hasColorRedundancy) {
    structureChecks.push({ rule: 'requireColorRedundancy', passed: false });
    violations.push({
      rule: 'requireColorRedundancy',
      actual: false,
      limit: true,
      severity: 'major',
      fix: makeStructuralFix('requireColorRedundancy', false, true),
    });
  } else {
    structureChecks.push({ rule: 'requireColorRedundancy', passed: true });
  }

  // Structure score: 100 minus penalties
  const severityPenalties: Record<string, number> = { critical: 25, major: 15, minor: 5 };
  let totalPenalty = 0;
  for (const v of violations) {
    totalPenalty += severityPenalties[v.severity] || 5;
  }
  const structureScore = Math.max(0, 100 - totalPenalty);

  // ── 3. Cognitive Fit (25% of overall) ──
  const overThreshold: CognitiveOverThreshold[] = [];
  const cognitiveChecks: Array<{ metric: string; actual: number; max: number; passed: boolean }> = [
    { metric: 'totalCTC', actual: cognitiveMetrics.totalCTC, max: profile.thresholds.maxCTC, passed: cognitiveMetrics.totalCTC <= profile.thresholds.maxCTC },
    { metric: 'abandonmentRisk', actual: cognitiveMetrics.abandonmentRisk, max: profile.thresholds.maxAbandonmentRisk, passed: cognitiveMetrics.abandonmentRisk <= profile.thresholds.maxAbandonmentRisk },
    { metric: 'decisionComplexity', actual: cognitiveMetrics.decisionComplexity, max: profile.thresholds.maxDecisionComplexity, passed: cognitiveMetrics.decisionComplexity <= profile.thresholds.maxDecisionComplexity },
    { metric: 'readabilityCost', actual: cognitiveMetrics.readabilityCost, max: profile.thresholds.maxReadabilityCost, passed: cognitiveMetrics.readabilityCost <= profile.thresholds.maxReadabilityCost },
  ];

  for (const check of cognitiveChecks) {
    if (!check.passed) {
      overThreshold.push({
        metric: check.metric,
        actual: check.actual,
        max: check.max,
        fix: makeCognitiveFix(check.metric, check.actual, check.max),
      });
    }
  }

  // Cognitive score: 100 minus proportional overshoot
  let cognitiveScoreSum = 0;
  for (const check of cognitiveChecks) {
    if (check.passed) {
      cognitiveScoreSum += 100;
    } else {
      // Score degrades proportionally to overshoot
      const overshoot = (check.actual - check.max) / (check.max || 1);
      cognitiveScoreSum += Math.max(0, 100 - overshoot * 100);
    }
  }
  const cognitiveScore = cognitiveScoreSum / cognitiveChecks.length;

  // ── 4. Overall Score ──
  const overall = Math.round(
    attentionScore * 0.4 +
    structureScore * 0.35 +
    cognitiveScore * 0.25
  );

  // ── 5. Top Fixes (prioritized by impact) ──
  // Collect all fixes with their estimated impact score
  const allFixes: Array<{ fix: string; impact: number }> = [];

  // Attention gaps outside range
  for (const g of gaps) {
    if (g.status !== 'good' && g.fix) {
      // Impact: proportional to gap size and element importance
      const importance = g.element === 'cta' ? 3 : g.element === 'heading' ? 2 : 1;
      allFixes.push({ fix: g.fix, impact: g.gap * importance });
    }
  }

  // Structural violations
  for (const v of violations) {
    const severityImpact = v.severity === 'critical' ? 30 : v.severity === 'major' ? 20 : 10;
    allFixes.push({ fix: v.fix, impact: severityImpact });
  }

  // Cognitive overshoots
  for (const o of overThreshold) {
    const overshoot = (o.actual - o.max) / (o.max || 1);
    allFixes.push({ fix: o.fix, impact: overshoot * 25 });
  }

  // Sort by impact descending, take top 5
  allFixes.sort((a, b) => b.impact - a.impact);
  const topFixes = allFixes.slice(0, 5).map(f => f.fix);

  return {
    persona: profile.persona,
    intent: intentPreset?.id || 'default',
    overall,
    attentionFit: { score: Math.round(attentionScore), gaps },
    structureFit: { score: Math.round(structureScore), violations },
    cognitiveFit: { score: Math.round(cognitiveScore), overThreshold },
    topFixes,
  };
}
