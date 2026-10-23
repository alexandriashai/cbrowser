/**
 * Provenance entries for the cognitive transport chain's constants
 * (cognitive-transport-chain.ts). See ../model-provenance.ts for the statuses.
 *
 * Stage B: the motor, decision, procedure and reading demands are law times
 * (demand-laws.ts, provenance/laws.ts: Fitts, novice search, KLM, Brysbaert)
 * against one time budget, law.timeBudget; the seven hand-set curve constants
 * they replaced (demand.interactive.*, demand.choice.halfSaturation,
 * demand.text.readingCapacity) are gone. What remains here are the shares of
 * those demands that land on each trait, and the rest of the chain.
 *
 * Nothing in this chain is fitted or published today. Every curve constant,
 * weight, rate, cap and modulation coefficient was set by hand, so it is a
 * `hypothesis` whose `source` names the data that would test or fit it. The
 * only `definition` entries are pure encoding choices with no empirical
 * claim: a numerical epsilon and output rounding. The scale totalCTC is
 * reported on is the reference set, registered in provenance/ctc-reference.ts.
 *
 * The chain reads these through `param()` at function entry, so a tool that
 * runs it under `withProvenance` reports exactly which hand-set numbers its
 * answer rests on, and tests/ctc-provenance.test.ts fails on an id that is
 * registered but never read, or read but never registered.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { ProvenanceEntry } from "../model-provenance.js";

const h = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `chain.${id}`, value, status: "hypothesis", source });
const d = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `chain.${id}`, value, status: "definition", source });

// What would fit a demand weight: per-trait effort or error rates measured on
// pages that vary the named page feature alone, regressed on the feature.
const DEMAND = (feature: string, trait: string) =>
  `Hand-set share of ${feature} that lands on ${trait}; a regression of measured ${trait}-driven effort on pages varying ${feature} alone would fit it.`;

// What would fit a share of the decision demand (choosing seconds against law.timeBudget).
const DECISION = (trait: string) =>
  `Hand-set share of the decision demand (choosing seconds by Cockburn et al.'s novice search, against law.timeBudget) that lands on ${trait}; satisficing takes all of it. Decision time decomposed by a validated ${trait} measure on pages varying their choices alone would fit it.`;

export const CHAIN_PROVENANCE: ProvenanceEntry[] = [
  // ── Demand curves: page feature -> trait demand ──
  h("demand.info.workingMemory", 0.9, DEMAND("informationDensity", "workingMemory")),
  h("demand.info.informationForaging", 0.8, DEMAND("informationDensity", "informationForaging")),



  h("demand.text.patience", 0.7, DEMAND("textDensity", "patience")),
  h("demand.text.comprehension", 0.85, DEMAND("textDensity", "comprehension")),

  h("demand.wordLength.comprehension", 0.9, DEMAND("avgWordLength", "comprehension")),
  h("demand.sentenceLength.workingMemory", 0.85, DEMAND("avgSentenceLength", "workingMemory")),
  h("demand.sentenceLength.patience", 0.7, DEMAND("avgSentenceLength", "patience")),
  h("demand.sentenceLength.comprehension", 0.8, DEMAND("avgSentenceLength", "comprehension")),
  h("demand.lexicalDiversity.comprehension", 0.75, DEMAND("lexicalDiversity", "comprehension")),
  h("demand.lexicalDiversity.transferLearning", 0.65, DEMAND("lexicalDiversity", "transferLearning")),
  h("demand.longWords.comprehension", 0.8, DEMAND("longWordRatio", "comprehension")),
  h("demand.technical.comprehension", 0.95, DEMAND("technicalDensity", "comprehension")),
  h("demand.technical.transferLearning", 0.8, DEMAND("technicalDensity", "transferLearning")),

  h("demand.animation.sigmoidThreshold", 0.3, "Hand-set animation level at which motion demand reaches 0.5; a fit of measured distraction cost against animation level would place the threshold."),
  h("demand.animation.sigmoidScale", 0.15, "Hand-set width of the motion-demand sigmoid; the same distraction-cost fit would set its slope."),
  h("demand.animation.changeBlindness", 0.9, DEMAND("animationLevel", "changeBlindness")),
  h("demand.animation.emotionalContagion", 0.7, DEMAND("animationLevel", "emotionalContagion")),

  h("demand.distractor.animationShare", 0.7, "Hand-set share of distractor pressure from motion (vs static clutter); re-reading rates on text beside animated vs cluttered-static panels would fit it."),
  h("demand.distractor.visualShare", 0.3, "Hand-set share of distractor pressure from static visual complexity; the same re-reading measurement would fit it."),
  h("demand.sustained.base", 0.7, "Hand-set share of the reading demand (reading seconds against law.timeBudget) that lands on sustainedAttention, kept below readability's (all of it) so decoding dominates on a still page; measured line-loss or re-reading rates on still prose would fit it."),
  h("demand.sustained.distractorGain", 0.7, "Hand-set gain by which distractor pressure raises attentional demand; re-reading rates on the same prose with and without peripheral motion would fit it."),

  h("demand.choice.anchoringBias", 0.85, DECISION("anchoringBias")),
  h("demand.choice.fearOfMissingOut", 0.75, DECISION("fearOfMissingOut")),
  h("demand.choice.socialProofSensitivity", 0.7, DECISION("socialProofSensitivity")),
  h("demand.decision.riskTolerance", 0.75, DECISION("riskTolerance") + " Moved from the interactive-count curve (demand.interactive.riskTolerance, the same 0.75) when that curve was retired."),

  h("demand.nav.halfSaturation", 3, "Hand-set navigation depth at which wayfinding demand reaches 0.5 (d/(d+3)); task completion against click depth would fit it."),
  h("demand.nav.workingMemory", 0.95, DEMAND("navigationDepth", "workingMemory")),
  h("demand.nav.transferLearning", 0.65, DEMAND("navigationDepth", "transferLearning")),
  h("demand.nav.siteFamiliarity", 0.85, DEMAND("navigationDepth", "siteFamiliarity")),

  // ── Trait resolution ──
  h("missingTraitCapacity", 0.5, "Capacity assumed for a trait the persona does not carry; measured trait distributions across the roster (or refusing to score an absent trait) would replace it."),

  // ── Demand modulation by the persona ──
  h("engagement.atSkim", 0.75, "Hand-set share of attentional demand a pure skimmer (readingTendency 0) engages; reading time or fixation coverage against readingTendency would fit the bound."),
  h("engagement.range", 0.5, "Hand-set span from pure skim to careful reading (0.75 to 1.25 of attentional demand); the same fixation-coverage data would fit it."),
  h("valueModulation.demandFloor", 0.1, "Hand-set floor on the demand a Schwartz value can modulate, so zero-demand traits still move a little; value-driven effort differences on zero-demand pages would test whether the floor should be zero."),
  h("valueModulation.stimulation.changeBlindness", -0.2, "Hand-set Schwartz coefficient (Schwartz 1992 names the value, not this number); effort on changing displays across measured stimulation scores would fit it."),
  h("valueModulation.security.changeBlindness", -0.15, "Hand-set Schwartz coefficient; change-detection effort across measured security scores would fit it."),
  h("valueModulation.achievement.satisficing", -0.2, "Hand-set Schwartz coefficient (Simon 1956 motivates the direction only); deliberation time across measured achievement scores would fit it."),
  h("valueModulation.achievement.riskTolerance", -0.15, "Hand-set Schwartz coefficient; risky-click rates across measured achievement scores would fit it."),
  h("valueModulation.conformity.socialProofSensitivity", 0.3, "Hand-set Schwartz coefficient (Cialdini 2001 motivates the direction only); social-proof response across measured conformity scores would fit it."),
  h("valueModulation.conformity.anchoringBias", 0.2, "Hand-set Schwartz coefficient; default-option take-up across measured conformity scores would fit it."),
  h("valueModulation.stimulation.patience", 0.2, "Hand-set Schwartz coefficient; abandonment on monotonous pages across measured stimulation scores would fit it."),
  h("valueModulation.selfDirection.socialProofSensitivity", -0.2, "Hand-set Schwartz coefficient; social-proof response across measured self-direction scores would fit it."),
  h("valueModulation.benevolence.emotionalContagion", -0.15, "Hand-set Schwartz coefficient; affect response to interface tone across measured benevolence scores would fit it."),
  h("valueModulation.power.fearOfMissingOut", -0.2, "Hand-set Schwartz coefficient; urgency-cue response across measured power scores would fit it."),

  // ── Transport cost ──
  h("weightDeficit", 1, "Hand-set cost per squared unit of demand above capacity (the unit weightSurplus is relative to); effort measured on pages where demand exceeds capacity would fit the pair jointly."),
  h("weightSurplus", 0.3, "Hand-set cost per squared unit of capacity above demand on billed dimensions; effort measured on pages far below a persona's capacity would fit it against weightDeficit."),
  h("contentScaleGain", 3, "Hand-set slope of the content gate (layer cost saturates at mean demand 1/3); effort on near-empty pages would test whether layer cost should scale with demand presence at this rate."),
  h("depletionGate", 0.1, "Hand-set content scale below which a layer depletes no capacity; the same near-empty-page effort data would test the threshold."),
  h("depletionRate", 0.15, "Hand-set fraction of remaining capacity drawn per unit of layer cost; within-session effort or performance decline across a task sequence would fit it."),
  h("indirectDepletionShare", 0.5, "Hand-set share of the depletion rate applied to dimensions outside the current layer; cross-task fatigue transfer measurements would fit it."),
  h("maxDrawdownFraction", 0.5, "Hand-set cap on the fraction of remaining capacity one layer may draw; within-session effort measurements across a task sequence would fit it (same status as the Hill exponent)."),
  d("capacityEpsilon", 1e-4, "Numerical floor applied to residual capacity after each depletion step, NOT a behavioural limit: an encoding choice with no empirical claim. It does bind, though: a dimension that starts at exactly 0 is lifted to 1e-4 by the first gated layer, and siteFamiliarity is 0 for every persona in the tool path unless a caller supplies one, so cognitiveLoad reads 1e-4 there. A floor of 0 would remove that shift; it was set to keep the drawdown away from denormals."),
  h("interaction.cognitiveLoadXdecision", 0.15, "Hand-set cross-layer coupling; a product-term fit of measured effort against the two layers' costs would fit it."),
  h("interaction.visualComplexityXcognitiveLoad", 0.15, "Hand-set cross-layer coupling; a product-term fit of measured effort against the two layers' costs would fit it."),
  h("interaction.frustrationXreadability", 0.15, "Hand-set cross-layer coupling; a product-term fit of measured effort against the two layers' costs would fit it."),
  h("interaction.cognitiveLoadXmotor", 0.15, "Hand-set cross-layer coupling; a product-term fit of measured effort against the two layers' costs would fit it."),
  h("interaction.frustrationXdecision", 0.15, "Hand-set cross-layer coupling; a product-term fit of measured effort against the two layers' costs would fit it."),
  // chain.ctcSigmoidSlope (2.5) and chain.ctcSigmoidCentre (1.2) were the
  // hand-set logistic that mapped rawCTC to totalCTC through 21.0. totalCTC is
  // now a percentile against real pages (ctcReference.*, provenance/ctc-reference.ts),
  // which has no free constant.

  // ── Abandonment ──
  h("abandonment.patienceShare", 0.7, "Hand-set weight of patience in the blended tolerance; observed abandonment against measured patience and resilience would fit the blend."),
  h("abandonment.resilienceShare", 0.3, "Hand-set weight of resilience in the blended tolerance; the same abandonment data would fit it."),
  h("abandonment.toleranceGain", 1.5, "Hand-set multiple of blended patience at which abandonment reaches 50%; observed abandonment against measured task difficulty would fit it."),
  h("abandonment.toleranceFloor", 0.05, "Hand-set floor on tolerance so a zero-patience persona does not read as certain abandonment on a blank page; abandonment data from very low-patience users would test it."),
  h("abandonmentHillExponent", 2, "Hand-set Hill exponent on the abandonment curve, UNCALIBRATED and load-bearing (a fixed deficit split over 14 screens falls from 22% to 2%); a dose-response fit of observed abandonment against task difficulty would set it."),

  // ── Output encoding ──
  d("roundingScale", 1000, "Output rounding to three decimals on headroom and the per-screen figures; a display choice, not a model claim."),
  d("depthRoundingScale", 100, "Output rounding to two decimals on expectedDepthScreens; a display choice, not a model claim."),
];
