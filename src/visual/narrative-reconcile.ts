/**
 * Reconcile the LLM attention narrative against the computed attention metrics.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT JUST "PASS THE METRICS TO THE PROMPT"
 *
 * `attention_analysis` ships two things in one payload:
 *
 *   attentionQuality.ctaCaptureRate: 0
 *   attentionQuality.interpretation: "CTAs are invisible to this persona..."
 *   attentionReasoning: "Clear, plainly-labeled CTAs like 'Try Free' and
 *                        'See Example Report' stand out as safe next steps..."
 *
 * Both were true of their own inputs and they say opposite things, with nothing
 * telling the reader they can disagree. Reproduced against cbrowser.ai on
 * 2026-08-05; first logged in July and still open.
 *
 * The obvious fix — hand `attentionQuality` to the narrative prompt — is not
 * available, and the dependency chain is the reason:
 *
 *   judgeRelevance()  ->  relevanceScores
 *   relevanceScores   ->  analyzeAttention()  ->  saliency hotspots
 *   hotspots          ->  computeAttentionQuality()  ->  ctaCaptureRate
 *
 * The narrative is generated at step 1 to PRODUCE the scores that eventually
 * yield the metric at step 3. Feeding step 3 back into step 1 is a cycle. So
 * reconciliation has to happen after the fact, which is what this module does.
 *
 * It also does NOT delete the narrative. The narrative carries real signal the
 * metrics do not — why this persona attends to what it attends to — and the two
 * are answering different questions: the narrative is a trait-based PREDICTION
 * about what the persona would seek, the metric is a MEASUREMENT of where the
 * saliency model actually put mass. They are allowed to differ. What is not
 * allowed is presenting them in one voice as though they agree.
 *
 * @since 2026-08-05
 */

/** Nouns that denote a call to action in LLM prose. */
const CTA_NOUN = /\b(?:CTAs?|calls?[- ]to[- ]action|buttons?|sign[- ]?up link|primary actions?)\b/i;

/**
 * Verbs/adjectives asserting something captured attention. Deliberately narrow:
 * this module only fires on a HIGH-CONFIDENCE contradiction, because a false
 * "these disagree" note on a narrative that was fine is its own defect.
 */
const SALIENCE_CLAIM = /\b(?:stands? out|standing out|prominent(?:ly)?|eye[- ]?catching|draws? (?:the )?(?:eye|attention)|catch(?:es|ing)? (?:the )?(?:eye|attention)|immediately (?:visible|obvious|apparent)|highly visible|dominates?)\b/i;

/** Sentence split that keeps decimals and common abbreviations intact enough. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z"'])/).filter((s) => s.trim().length > 0);
}

export interface NarrativeReconciliation {
  /** The narrative, unchanged. It is never rewritten or deleted. */
  narrative: string;
  /** True when a checkable claim in the narrative contradicts a computed metric. */
  contradictsMetrics: boolean;
  /** Present only on a contradiction: what disagrees with what, and why both exist. */
  reconciliationNote?: string;
  /** The sentences that triggered it, so the note is not an unfalsifiable assertion. */
  contradictingClaims?: string[];
}

/**
 * The same threshold `computeAttentionQuality` uses to say "CTAs are invisible",
 * so the two cannot drift into disagreeing about what counts as invisible.
 */
export const CTA_INVISIBLE_THRESHOLD = 0.05;

/**
 * Flag a narrative that asserts CTA salience while the map measured none.
 *
 * Sentence-scoped on purpose: "CTAs are ignored. The headline stands out." must
 * not trip, and it would under a whole-string match.
 */
export function reconcileAttentionNarrative(
  narrative: string | undefined,
  quality: { ctaCaptureRate?: number } | null | undefined,
): NarrativeReconciliation | undefined {
  if (!narrative) return undefined;
  const rate = quality?.ctaCaptureRate;
  if (typeof rate !== "number") {
    return { narrative, contradictsMetrics: false };
  }
  if (rate >= CTA_INVISIBLE_THRESHOLD) {
    return { narrative, contradictsMetrics: false };
  }

  const offending = sentences(narrative).filter(
    (s) => CTA_NOUN.test(s) && SALIENCE_CLAIM.test(s),
  );
  if (offending.length === 0) {
    return { narrative, contradictsMetrics: false };
  }

  return {
    narrative,
    contradictsMetrics: true,
    contradictingClaims: offending,
    reconciliationNote:
      `These two disagree, and the disagreement is real rather than a rendering bug. `
      + `attentionReasoning asserts that calls to action capture attention, while the `
      + `computed saliency map put ctaCaptureRate at ${rate} — below the ${CTA_INVISIBLE_THRESHOLD} `
      + `threshold at which this tool calls CTAs invisible. `
      + `They are answering different questions: attentionReasoning is a PREDICTION from the `
      + `persona's traits about what they would look for, generated before the saliency map `
      + `exists (its scores are an input to that map). ctaCaptureRate is a MEASUREMENT of where `
      + `the map actually placed attention mass. `
      + `Trust the metric for what the model saw; treat the narrative as a hypothesis about why. `
      + `When they diverge this far it usually means the CTAs are semantically right for the `
      + `persona but visually weak on the page — which is a design finding, not a tool error.`,
  };
}

/**
 * Say what the attention narrative was computed over, beside the narrative.
 *
 * attentionReasoning is written by the LLM relevance pass, which reads EVERY
 * candidate element collected from the DOM (dozens on a real page). The
 * quantitative targets -- attentionQuality's ratios and topAttentionTargets --
 * come from the few distinct elements the saliency hotspots landed on, two to
 * four per run on cbrowser.ai. So the narrative routinely names elements that
 * are not among the measured targets, and a reader seeing them side by side
 * reasonably assumed it described them (B19, 2026-10-09).
 *
 * Labelled, not changed: the prompt and the scoring are untouched.
 *
 * @param candidateElements N: elements the relevance pass judged.
 * @param sampledElements   M: attentionQuality.sampledElements, or undefined when it was not computed.
 * @param samplingFloor     The distinct-element floor the attention window aims for.
 */
export function describeReasoningScope(
  candidateElements: number,
  sampledElements: number | undefined,
  samplingFloor: number,
): string {
  const n = `${candidateElements} candidate element${candidateElements === 1 ? "" : "s"}`;
  const head = `attentionReasoning comes from an LLM relevance pass over ${n} read from the page, `
    + "made before the saliency map is computed (its scores help build it). ";
  if (sampledElements === undefined) {
    return head + "The quantitative targets were not computed on this run, so nothing in this payload "
      + "measures the elements the narrative names.";
  }
  const m = `${sampledElements} sampled element${sampledElements === 1 ? "" : "s"}`;
  let text = head + `The quantitative targets are counted over ${m}, the distinct elements the top `
    + "saliency hotspots landed on (topAttentionTargets can also list hotspots that hit no element, "
    + "which that count excludes). The narrative can therefore name elements that are not among the "
    + "measured targets; naming one is not evidence it drew measured attention.";
  if (sampledElements < samplingFloor) {
    text += ` ${sampledElements} is below the sampling floor of ${samplingFloor} distinct elements, so the `
      + "quantitative targets are indicative, not measurements (see attentionQuality.sampleNote).";
  }
  return text;
}
