/**
 * Provenance entries for the CIF score's constants (cif-score.ts).
 * See ../model-provenance.ts for the statuses.
 *
 * Three numbers are published: WCAG 2.2's 44 px enhanced target size and its
 * 4.5:1 and 3:1 text-contrast minimums. Four are definitions: the 0-100
 * scale, an unreachable empty-average value, how many top issues to list and
 * how many decimals to print. Everything else (every category and component
 * weight, every per-barrier deduction, every knee and slope of the piecewise
 * scores, every grade and certification band, the one missing-input score)
 * was set by hand, so it is a `hypothesis` whose `source` names what would
 * test it.
 *
 * Most of them would be tested by one study that does not exist yet: CIF
 * scores for a set of pages against an external criterion, either expert
 * accessibility ratings of those pages or the task success of disabled users
 * on them. Weights and bands would be fitted to the criterion; knees, slopes
 * and per-barrier deductions to the criterion's response to the one input
 * each reads.
 *
 * MISSING INPUTS. There is one rule, registered as cif.noData.score with its
 * rationale in the source. It replaced eighteen per-input defaults that
 * disagreed with each other (21.0): a missing agent-ready score was taken as
 * 60 by contrastCompliance, 50 by focusVisibility and semanticStructure and 70
 * by layoutConsistency; a missing element count was 50 for contrast and 100
 * for density; missing CTC decision data, animation count and navigation-item
 * count scored full marks while missing readability and attention data scored
 * a "conservative" 60; missing target sizes scored 100 and said "No touch
 * target barriers detected"; and a missing barrier list read as "no barriers"
 * in eight components. research/cif-21-deltas.md measures what the rule moved.
 *
 * cif-score.ts reads every entry through param() at function entry, and
 * tests/cif-no-literals.test.ts fails on any other numeric literal than
 * 0, 1 or 2 in its arithmetic, so the registry and the code cannot disagree.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { ProvenanceEntry } from "../model-provenance.js";

const h = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `cif.${id}`, value, status: "hypothesis", source });
const d = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `cif.${id}`, value, status: "definition", source });
const p = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `cif.${id}`, value, status: "published", source });

// The external criterion weights, bands and slopes would be fitted to.
const CRITERION = "expert accessibility ratings of the same pages, or the task success of disabled users on them";

const CATEGORY_WEIGHT = (category: string) =>
  `Hand-set share of the composite CIF score given to ${category}; regressing ${CRITERION} on the five category scores would fit it.`;
const COMPONENT_WEIGHT = (category: string, component: string) =>
  `Hand-set share of the ${category} score given to ${component}; regressing ${CRITERION} on the five ${category} component scores would fit it.`;
const PER_BARRIER = (barrier: string, who: string) =>
  `Hand-set points deducted per ${barrier} barrier; the drop in task success of ${who} per additional such barrier on otherwise matched pages would fit it.`;
const GRADE = (band: string) =>
  `Hand-set lower bound of ${band} on the composite score; agreement between the grade bands and ${CRITERION} would set them.`;
const CERTIFICATION = (level: string) =>
  `Hand-set minimum category score for ${level} certification; whether pages certified at each level differ in ${CRITERION} would test it.`;

export const CIF_PROVENANCE: ProvenanceEntry[] = [
  // ── Units and reporting ──
  d("scale.max", 100, "Top of the 0-100 scale every CIF score is reported on, and the factor that turns a fraction into a point on it or into a displayed percent; a choice of units."),
  d("emptyAverage", 50, "Value weightedAvg returns for a list with no weight, the scale midpoint. Unreachable from computeCIFScore, which always passes five positive weights, so it carries no claim."),
  d("topIssues.count", 5, "How many of the 25 components, lowest score first, are reported as top issues; a reporting choice."),
  d("display.costDecimals", 3, "Decimal places printed for CTC costs in the details text; a display choice that no score reads."),

  // ── Missing inputs: the one rule ──
  h("noData.score", 50, "Hand-set score of a component none of whose inputs the caller supplied, the same for all 25 components. The rule: a component scores only from supplied inputs and no assumed value ever stands in for a missing one; when nothing it reads was supplied it scores this value, is marked measured: false, says 'Not measured' and names the missing input in its details, is listed in CIFScore.notMeasured, and is never a top issue (it is not an issue found). Why 50: it is the scale midpoint, the one value whose largest possible error is the smallest (50 points either way) when nothing about the page is known, so a missing input is never scored as a pass, full marks least of all, and never as a failure. A barrier list counts as supplied when it is an array, even an empty one; a page whose barriers are undefined was not audited. The distribution of measured component scores across a crawl of real pages would set an honest prior in its place."),

  // ── Published thresholds ──
  p("wcag.targetSizeEnhancedPx", 44, "WCAG 2.2 Success Criterion 2.5.5 Target Size (Enhanced), Level AAA: pointer targets at least 44 by 44 CSS pixels. touchTargetCompliance counts the non-exempt targets whose smaller side reaches it, and the details and fix text quote it. Scoring against this AAA criterion rather than 2.5.8 Target Size (Minimum), Level AA (24 by 24), is this scorer's choice; the number is WCAG's. 2.5.5's exceptions (equivalent, inline, user agent control, essential) are not checked beyond the caller's `exempt` flag."),
  p("wcag.contrastNormalText", 4.5, "WCAG 2.2 Success Criterion 1.4.3 Contrast (Minimum), Level AA: a contrast ratio of at least 4.5:1 for text. Used only to count, in the details and fix text, which reported issues fall below it; the contrastCompliance score itself is the share of elements with any reported issue (or, with no element count supplied, a deduction per issue)."),
  p("wcag.contrastLargeText", 3, "WCAG 2.2 Success Criterion 1.4.3 Contrast (Minimum), Level AA: at least 3:1 for large-scale text. Used only in the details and fix text, as for wcag.contrastNormalText."),

  // ── Composite ──
  h("weight.motor", 0.2, CATEGORY_WEIGHT("motor fitness")),
  h("weight.visual", 0.2, CATEGORY_WEIGHT("visual fitness")),
  h("weight.cognitive", 0.25, CATEGORY_WEIGHT("cognitive fitness")),
  h("weight.sensory", 0.15, CATEGORY_WEIGHT("sensory fitness")),
  h("weight.navigation", 0.2, CATEGORY_WEIGHT("navigation fitness")),

  // ── Motor ──
  h("motor.weight.touchTargetCompliance", 0.3, COMPONENT_WEIGHT("motor", "touchTargetCompliance")),
  h("motor.weight.hitProbability", 0.25, COMPONENT_WEIGHT("motor", "hitProbability")),
  h("motor.weight.interactionCount", 0.2, COMPONENT_WEIGHT("motor", "interactionCount")),
  h("motor.weight.spacingAdequacy", 0.15, COMPONENT_WEIGHT("motor", "spacingAdequacy")),
  h("motor.weight.dragFreeAlternatives", 0.1, COMPONENT_WEIGHT("motor", "dragFreeAlternatives")),
  h("motor.touchTarget.barrierPenalty", 15, PER_BARRIER("touch_target (the fallback when no target sizes were measured)", "users with motor impairments")),
  h("motor.touchTarget.barrierFloor", 30, "Hand-set lowest touchTargetCompliance the barrier-count fallback can reach, however many touch_target barriers are reported; measured target compliance on pages with many such barriers would set the floor or remove it."),
  h("motor.hit.midpointPx", 20, "Hand-set mean target size (smaller side, px) at which hitProbability scores 50; hit rates of users with motor impairments on targets of measured size (a Fitts-style pointing study) would place the midpoint."),
  h("motor.hit.scalePx", 10, "Hand-set width (px) of the hitProbability sigmoid; the same pointing study would fit its slope."),
  h("motor.interactive.freeCount", 20, "Hand-set interactive-element count up to which interactionCount scores full marks; task time or error rate of users with motor impairments against interactive-element count would place it."),
  h("motor.interactive.kneeCount", 40, "Hand-set count at which interactionCount's penalty slope changes; the same task-time data would place the knee or show there is none."),
  h("motor.interactive.slopeBelowKnee", 2.5, "Hand-set points lost per interactive element between the free count and the knee; the same task-time data would fit it."),
  h("motor.interactive.kneeScore", 50, "Hand-set interactionCount at the knee, continuous with the slope below it; the same task-time data would fit it."),
  h("motor.interactive.slopeAboveKnee", 1, "Hand-set points lost per interactive element above the knee; the same task-time data would fit it."),
  h("motor.spacing.barrierPenalty", 15, PER_BARRIER("touch_target (read here as a spacing barrier; these are the same barriers the touchTargetCompliance fallback counts, so a page with them and no size data is penalised twice)", "users with motor impairments")),
  h("motor.drag.barrierPenalty", 25, PER_BARRIER("drag-dependent", "users with motor impairments and keyboard-only users")),

  // ── Visual ──
  h("visual.weight.contrastCompliance", 0.3, COMPONENT_WEIGHT("visual", "contrastCompliance")),
  h("visual.weight.textScalability", 0.2, COMPONENT_WEIGHT("visual", "textScalability")),
  h("visual.weight.colorIndependence", 0.2, COMPONENT_WEIGHT("visual", "colorIndependence")),
  h("visual.weight.focusVisibility", 0.15, COMPONENT_WEIGHT("visual", "focusVisibility")),
  h("visual.weight.spacingDensity", 0.15, COMPONENT_WEIGHT("visual", "spacingDensity")),
  h("visual.contrast.barrierPenalty", 10, PER_BARRIER("contrast (and per reported contrast issue when no element count is supplied, since the failing share then has no denominator)", "low-vision users")),
  h("visual.contrast.proxySlope", 0.8, "Hand-set slope mapping the agent-ready score onto contrastCompliance when no contrast data exist; correlating agent-ready scores with measured contrast compliance across pages would fit it, or show the proxy carries no information."),
  h("visual.contrast.proxyIntercept", 20, "Hand-set intercept of the same agent-ready proxy; the same correlation would fit it."),
  h("visual.textScalability.densityKnee", 0.6, "Hand-set information density above which textScalability is penalised. The score never zooms anything; zooming pages to 200% and recording loss of content or function (the test WCAG 1.4.4 describes) against density would place the knee."),
  h("visual.textScalability.slope", 80, "Hand-set points lost per unit of density above the knee; the same zoom test would fit it."),
  h("visual.color.barrierPenalty", 20, PER_BARRIER("color-only information", "colour-blind users")),

  // ── Cognitive ──
  h("cognitive.weight.decisionComplexity", 0.25, COMPONENT_WEIGHT("cognitive", "decisionComplexity")),
  h("cognitive.weight.readability", 0.2, COMPONENT_WEIGHT("cognitive", "readability")),
  h("cognitive.weight.informationDensity", 0.2, COMPONENT_WEIGHT("cognitive", "informationDensity")),
  h("cognitive.weight.attentionClarity", 0.2, COMPONENT_WEIGHT("cognitive", "attentionClarity")),
  h("cognitive.weight.predictability", 0.15, COMPONENT_WEIGHT("cognitive", "predictability")),
  h("cognitive.decision.costSlope", 200, "Hand-set points lost per unit of decision-layer cost. That layer is itself a hypothesis of the transport chain, so task success at decision points against the layer's cost would fit the slope only once the layer is."),
  h("cognitive.readability.fleschGain", 1.2, "Hand-set multiplier from Flesch reading ease to readability, capped at the top of the scale (Flesch 83.3 and above scores full marks); comprehension scores of readers with cognitive or reading disabilities against Flesch on the same pages would fit it."),
  h("cognitive.density.freeCount", 200, "Hand-set element count up to which informationDensity scores full marks; task success or self-reported overload against element count would place it."),
  h("cognitive.density.kneeCount", 500, "Hand-set element count at which informationDensity's penalty slope changes; the same data would place the knee or show there is none."),
  h("cognitive.density.divisorBelowKnee", 6, "Hand-set elements per point lost between the free count and the knee; the same data would fit it."),
  h("cognitive.density.kneeScore", 50, "Hand-set informationDensity at the knee, continuous with the slope below it; the same data would fit it."),
  h("cognitive.density.divisorAboveKnee", 30, "Hand-set elements per point lost above the knee; the same data would fit it."),
  h("cognitive.attention.captureGain", 200, "Hand-set multiplier from CTA capture rate to attentionClarity (a capture rate of 0.5 or more scores full marks); success at finding the primary action against measured capture rate would fit it."),
  h("cognitive.predictability.freeCount", 7, "Hand-set navigation-item count up to which predictability scores full marks; cif-score.ts cites nothing for it. Wayfinding success against navigation-item count would place it."),
  h("cognitive.predictability.kneeCount", 12, "Hand-set count at which predictability's two branches meet. Both lose the same points per item and meet continuously, so with today's values the knee changes no score; wayfinding success against item count would test whether a knee exists."),
  h("cognitive.predictability.slopeBelowKnee", 5, "Hand-set points lost per navigation item between the free count and the knee; wayfinding success against item count would fit it."),
  h("cognitive.predictability.kneeScore", 75, "Hand-set predictability at the knee, continuous with the slope below it; the same wayfinding data would fit it."),
  h("cognitive.predictability.slopeAboveKnee", 5, "Hand-set points lost per navigation item above the knee; the same wayfinding data would fit it."),

  // ── Sensory ──
  h("sensory.weight.animationControl", 0.3, COMPONENT_WEIGHT("sensory", "animationControl")),
  h("sensory.weight.sensoryIndependence", 0.25, COMPONENT_WEIGHT("sensory", "sensoryIndependence")),
  h("sensory.weight.visualCalm", 0.2, COMPONENT_WEIGHT("sensory", "visualCalm")),
  h("sensory.weight.layoutConsistency", 0.15, COMPONENT_WEIGHT("sensory", "layoutConsistency")),
  h("sensory.weight.overloadThreshold", 0.1, COMPONENT_WEIGHT("sensory", "overloadThreshold")),
  h("sensory.animation.controlledFloor", 90, "Hand-set lowest animationControl when prefers-reduced-motion is supported, however many animations there are; distraction ratings by users with vestibular or attention disorders on pages that honour reduced motion would set it."),
  h("sensory.animation.controlledPenalty", 1, "Hand-set points lost per animation when prefers-reduced-motion is supported, down to the floor; the same distraction ratings would fit it."),
  h("sensory.animation.uncontrolledPenalty", 20, "Hand-set points lost per animation without prefers-reduced-motion support, quoted in the details text; task success or symptom reports of users with vestibular or attention disorders against uncontrolled animation count would fit it."),
  h("sensory.audio.barrierPenalty", 15, PER_BARRIER("caption or audio (quoted in the details text)", "deaf and hard-of-hearing users")),
  h("sensory.calm.densityWeight", 50, "Hand-set visualCalm points lost across the full range of information density; calm ratings by users with sensory sensitivities against measured density would fit it."),
  h("sensory.calm.animationPenalty", 15, "Hand-set visualCalm points lost per uncontrolled animation; the same calm ratings would fit it."),
  h("sensory.overload.easyCTC", 0.3, "Hand-set total CTC up to which overloadThreshold scores full marks ('easy' on cbrowser's own CTC scale, whose constants are hypotheses too); abandonment or overload reports against total CTC would place it."),
  h("sensory.overload.kneeCTC", 0.6, "Hand-set total CTC at which overloadThreshold's slope changes; the same abandonment data would place it."),
  h("sensory.overload.slopeBelowKnee", 130, "Hand-set points lost per unit of CTC between easy and the knee; the same abandonment data would fit it."),
  h("sensory.overload.kneeScore", 60, "Hand-set overloadThreshold just above the knee. The branch below ends at 61 (100 - 0.3 x 130), so the score steps down one point at CTC 0.6; the same abandonment data would fit it."),
  h("sensory.overload.slopeAboveKnee", 100, "Hand-set points lost per unit of CTC above the knee; the same abandonment data would fit it."),

  // ── Navigation ──
  h("navigation.weight.semanticStructure", 0.25, COMPONENT_WEIGHT("navigation", "semanticStructure")),
  h("navigation.weight.keyboardOperability", 0.25, COMPONENT_WEIGHT("navigation", "keyboardOperability")),
  h("navigation.weight.skipMechanisms", 0.15, COMPONENT_WEIGHT("navigation", "skipMechanisms")),
  h("navigation.weight.linkButtonClarity", 0.15, COMPONENT_WEIGHT("navigation", "linkButtonClarity")),
  h("navigation.weight.formAccessibility", 0.2, COMPONENT_WEIGHT("navigation", "formAccessibility")),
  h("navigation.keyboard.barrierPenalty", 15, PER_BARRIER("keyboard or motor_precision", "keyboard-only and switch users")),
  h("navigation.skip.barrierPenalty", 25, PER_BARRIER("skip-mechanism", "keyboard and screen-reader users")),
  h("navigation.form.barrierPenalty", 10, PER_BARRIER("form", "screen-reader users")),

  // ── Grade and certification bands ──
  h("grade.aPlus", 95, GRADE("grade A+")),
  h("grade.a", 85, GRADE("grade A")),
  h("grade.b", 70, GRADE("grade B")),
  h("grade.c", 50, GRADE("grade C")),
  h("grade.d", 30, GRADE("grade D (below it the grade is F)")),
  h("certification.platinum", 95, CERTIFICATION("platinum")),
  h("certification.gold", 85, CERTIFICATION("gold")),
  h("certification.silver", 70, CERTIFICATION("silver")),
  h("certification.bronze", 50, CERTIFICATION("bronze (below it there is none)")),

  // ── Fix recommendations ──
  h("fix.decision.choiceThreshold", 10, "Hand-set interactive-element count above which the decisionComplexity fix names a choice count to cut to; it changes recommendation text only. Decision time against option count on real pages (Hick-Hyman style data) would place it."),
];
