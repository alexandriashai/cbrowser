/**
 * visual_cognitive_story's effort section and verdict.
 *
 * Built on the registered bands (visual/ctc-bands.ts): totalCTC is a
 * percentile of real pages, so the section states the rank and the verdict
 * crosses the band with the attention data. Through 21.0 both read totalCTC on
 * the logistic ("comfortable" below 0.5, "Significant cognitive burden" from
 * 1.0) and the verdict's "Hard but focused" branch needed totalCTC > 1.0,
 * which nothing can reach; a mid-ranked page with its CTAs seen fell through
 * to "High effort AND low CTA visibility", and a failed effort run scored 0
 * and was called comfortable.
 *
 * Pure functions of their inputs, so every branch is testable without a
 * browser (tests/story-verdict.test.ts).
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { ctcBand, ctcBands, ctcRank } from "../../visual/ctc-bands.js";
import type { MetricScope } from "../../visual/cognitive-transport.js";

export interface StoryEffort {
  totalCTC: number;
  /** Its 95% interval (SequentialTransportResult.totalCTCInterval), stated in the rank sentence when present. */
  totalCTCInterval?: [number, number];
  rawCTC: number;
  referenceScope: MetricScope;
  bottleneck: string;
  /** abandonmentRisk as a whole percent. */
  abandonmentRiskPercent: number;
}

export interface StoryQuality {
  ctaCaptureRate?: number;
  distractorRatio?: number;
  qualityScore?: number;
}

/** Every verdict branch, so a test can check it reached each one. */
export const STORY_VERDICTS = [
  "strong", "mixed", "lowUnfocused",
  "upperFocused", "upperUnfocused",
  "highFocused", "highUnfocused",
  "costOnly", "unranked",
] as const;
export type StoryVerdict = typeof STORY_VERDICTS[number];

// Attention thresholds, unchanged from the inline verdict they replace.
/** CTAs are "seen" above this share of top attention. */
const CTA_SEEN = 0.2;
/** Attention is "leaking" above this share on non-actionable elements ... */
const DISTRACTOR_LEAK = 0.4;
/** ... or below this attention quality score. */
const QUALITY_LEAK = 50;

/** The "### The Effort" section: the rank, the bottleneck, and abandonment as its own quantity. */
export function storyEffortSection(persona: string, effort: StoryEffort | null): string {
  let out = `### The Effort: Where the Cost Ranks\n`;
  if (!effort) {
    return out + `The cognitive transport cost could not be computed for this page, so there is no rank to report.\n\n`;
  }
  out += `${persona}: ${ctcRank(effort).sentence}\n`;
  out += `The bottleneck is **${effort.bottleneck}**, the layer with the highest transport cost.\n`;
  out += `Abandonment risk on this screen, a separate quantity that does not use the rank: **${effort.abandonmentRiskPercent}%**.\n\n`;
  return out;
}

/** "the lower half", "the high band", "the top 5%": a band as a place in a sentence. */
function bandPhrase(totalCTC: number): string {
  const name = ctcBand(totalCTC)!.name;
  return name === "high" ? "the high band" : `the ${name}`;
}

/**
 * The verdict: cost band crossed with whether attention reaches the CTAs.
 * The cost axis is lower half / upper half / high-or-top, by the registered
 * cut points; the attention axis is the CTA capture rate, with distractor
 * share and quality score splitting the cheap-and-seen case.
 */
export function storyVerdict(persona: string, effort: StoryEffort | null, quality: StoryQuality | undefined): { branch: StoryVerdict; text: string } {
  if (!effort || !Number.isFinite(effort.totalCTC)) {
    return { branch: "unranked", text: `**Not ranked.** The cognitive transport cost could not be computed, so there is no rank to judge; the attention findings above stand on their own.` };
  }
  if (!quality) {
    return { branch: "costOnly", text: `**Cost only.** Attention quality could not be measured, so this verdict covers cost alone: ${ctcRank(effort).sentence}` };
  }

  const { upperHalf, high } = ctcBands();
  const t = effort.totalCTC;
  const cost = t < upperHalf ? "low" : t < high ? "upper" : "high";
  const seen = (quality.ctaCaptureRate ?? 0) > CTA_SEEN;
  const distract = quality.distractorRatio ?? 0;
  const q = quality.qualityScore ?? 0;
  const leaking = distract > DISTRACTOR_LEAK || q < QUALITY_LEAK;
  const where = `${bandPhrase(t)} of the real pages we measured`;
  const b = effort.bottleneck;

  if (cost === "low") {
    if (seen && !leaking) return { branch: "strong", text: `**Strong.** Cost ranks in ${where}, and attention lands on the CTAs.` };
    if (seen) return { branch: "mixed", text: `**Mixed.** Cost ranks in ${where} and the CTAs do get seen, but attention quality is ${q}/100 with ${(distract * 100).toFixed(0)}% going to non-actionable elements: the design spends most of ${persona}'s attention on things that do not convert.` };
    return { branch: "lowUnfocused", text: `**Cheap but unfocused.** Cost ranks in ${where}, but attention misses the CTAs. The page needs stronger visual hierarchy to guide ${persona} toward conversion.` };
  }
  if (cost === "upper") {
    if (seen) return { branch: "upperFocused", text: `**Focused, mid-ranked cost.** Cost ranks in ${where}, below the high band, and attention lands on the CTAs. ${b} is the costliest layer to work on.` };
    return { branch: "upperUnfocused", text: `**Unfocused, mid-ranked cost.** Cost ranks in ${where} and attention misses the CTAs. Make the CTAs more prominent first, then work on ${b}, the costliest layer.` };
  }
  if (seen) return { branch: "highFocused", text: `**Costly but focused.** Cost ranks in ${where}, and attention lands on the CTAs. Simplify ${b}, the costliest layer, without losing the visual focus.` };
  return { branch: "highUnfocused", text: `**Needs work.** Cost ranks in ${where} AND attention misses the CTAs. Prioritize: simplify the ${b} layer, then make CTAs more prominent.` };
}
