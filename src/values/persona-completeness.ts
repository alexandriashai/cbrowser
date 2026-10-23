/**
 * What a persona must account for before it can be submitted.
 *
 * THE PROBLEM
 *
 * `persona_create_submit_traits` accepted whatever it was given. A caller who
 * named three traits got back a complete 26-trait persona, because
 * `buildTraitsFromAnswers` fills every unsupplied one from a research baseline.
 * The persona then looked finished from the outside — full trait vector, real
 * numbers, no warning in the payload — while most of those numbers were
 * population defaults nobody had considered for this person.
 *
 * Five personas on this install carry exactly that history: each is missing the
 * same four traits (selfEfficacy, satisficing, trustCalibration,
 * interruptRecovery), which means one creation session skipped them and nothing
 * asked. Filling them afterwards is archaeology — reading the description months
 * later and hoping it still supports a number.
 *
 * THE RULE
 *
 * Every trait must be ACCOUNTED FOR at submission: either given a value, or
 * named explicitly as something the description does not support. Both are fine
 * answers. Silence is not, because silence and "0.5 is genuinely right here"
 * produce the same persona and nothing downstream can tell them apart.
 *
 * This is the same contract the Big Five inference already uses — supply it with
 * evidence, or omit it deliberately and let the caller know what that costs.
 *
 * WHY REJECT RATHER THAN WARN
 *
 * A warning in a response is read once, by a model that has already moved on to
 * the next tool call. The persona is written either way, and the gap is only
 * discovered when someone audits months later. Refusing the write is the only
 * version of this that changes what gets stored.
 *
 * @since 2026-08-01
 */

/** Traits a persona description can realistically speak to, and what to look for. */
export const TRAIT_INFERENCE_CRITERIA: Record<string, string> = {
  patience: "Tolerance for delay and friction. Look for: waits, gives up quickly, abandons on slow loads.",
  riskTolerance: "Willingness to act without certainty. Look for: cautious, double-checks, dives in, experiments.",
  comprehension: "Grasp of UI conventions. Look for: expert, unfamiliar with the web, knows the patterns.",
  persistence: "Continues after obstacles. Look for: won't give up, abandons, keeps trying.",
  curiosity: "Explores beyond the task. Look for: interested, focused only on the goal, pokes around.",
  workingMemory: "Holds context across steps. Look for: loses place, remembers, multi-step difficulty.",
  readingTendency: "How much text is read. Look for: skims, reads carefully, scans for buttons.",
  resilience: "Recovery after error or frustration. Look for: rattled, shrugs it off, gives up after failure.",
  selfEfficacy: "Confidence in figuring things out. Look for: confident, low confidence, self-blaming, capable.",
  satisficing: "First adequate option vs the best one. Look for: settles, maximizer, seeks optimal, good enough.",
  trustCalibration: "Trust in what a site asks or claims. Look for: sceptical, cautious with payment info, trusting.",
  interruptRecovery: "Resuming after interruption. Look for: distracted, juggles tabs, loses their place.",
  informationForaging: "How they hunt for information. Look for: exhaustive, follows the obvious link, scans.",
  changeBlindness: "Noticing changes on a page. Look for: misses updates, attentive to changes.",
  anchoringBias: "Weight given to the first option seen. Look for: compares thoroughly, takes the first quote.",
  timeHorizon: "Now versus later. Look for: impulsive, plans ahead, time-pressured.",
  attributionStyle: "Blames self or the site. Look for: self-blaming, blames the interface.",
  metacognitivePlanning: "Plans before acting. Look for: methodical, trial-and-error, systematic.",
  proceduralFluency: "Ease with multi-step flows. Look for: expert, struggles with forms, fluent.",
  transferLearning: "Applies knowledge from other sites. Look for: technical, unfamiliar with modern web.",
  authoritySensitivity: "Response to official signals. Look for: defers to institutions, sceptical of authority.",
  emotionalContagion: "Picks up tone from the page. Look for: emotionally activated, even-tempered.",
  fearOfMissingOut: "Reaction to scarcity and urgency. Look for: FOMO, unmoved by urgency.",
  socialProofSensitivity: "Weight given to what others do. Look for: reads reviews, ignores ratings.",
  mentalModelFlexibility: "Adapting when conventions break. SCALE RUNS TOWARD FLEXIBILITY: 0 rigid, 1 instantly adapts.",
};

/**
 * siteFamiliarity is deliberately NOT in the list above.
 *
 * It is a persona-SITE variable, not a disposition. The same person is familiar
 * with one site and new to another, so no description can answer it: "prior
 * experience with THIS site" has no value until a site is named. Requiring it
 * per persona forced a number that was wrong for every site except whichever
 * one the author happened to be thinking of, and the completeness contract made
 * that mandatory rather than optional.
 *
 * It is supplied per run instead, on the tools that audit a specific site.
 * A stored persona value, where one exists, is a fallback for callers that do
 * not pass it. (2026-08-01)
 */
export const SITE_SCOPED_TRAITS = ["siteFamiliarity"] as const;

export const ALL_TRAITS = Object.keys(TRAIT_INFERENCE_CRITERIA);

/**
 * How a supplied trait value was arrived at.
 *
 * The contract enforced ACCOUNTING and reported it as if it were honesty. A
 * caller who invented six values and supplied all 26 got back "26 of 26
 * supplied; 0 filled from research baselines" -- which reads as a quality
 * signal while six of those numbers were unfalsifiable inventions. The contract
 * had no way to tell, and the output format erased the question.
 *
 * `supported` means the description says it. `asserted` means the caller
 * decided it anyway -- a legitimate thing to do, and a different epistemic
 * object. Naming which is which costs a word and restores the distinction the
 * count destroyed. (2026-08-01)
 */
export type TraitProvenanceKind = "supported" | "asserted";

export interface CompletenessVerdict {
  ok: boolean;
  unaccounted: string[];
  message?: string;
  /** Traits the caller decided rather than read out of the description. */
  asserted?: string[];
  /** Traits supplied with no provenance stated — unknown, not supported. */
  unlabelled?: string[];
}

/**
 * Every trait must be supplied or explicitly declared unsupported.
 *
 * `unsupported` is a first-class answer, not a failure: a description that says
 * nothing about someone's response to scarcity should not be made to produce a
 * number. What it must not do is stay silent, because the persona is built
 * either way and a defaulted trait is indistinguishable from a considered one.
 */
export function assessTraitCompleteness(
  supplied: Record<string, number> | undefined,
  unsupported: string[] | undefined,
  /** Per-trait: did the description support this, or did the caller assert it? */
  provenance?: Record<string, TraitProvenanceKind>,
): CompletenessVerdict {
  const given = new Set(Object.keys(supplied ?? {}).filter((k) => typeof supplied![k] === "number"));
  const declared = new Set(unsupported ?? []);
  const unaccounted = ALL_TRAITS.filter((t) => !given.has(t) && !declared.has(t));
  if (!unaccounted.length) {
    // Provenance is optional, and its ABSENCE is reported rather than treated
    // as "all supported" -- silence about how a number was reached is exactly
    // what the old count turned into a clean bill of health.
    const asserted = Object.entries(provenance ?? {})
      .filter(([, k]) => k === "asserted").map(([t]) => t);
    const unlabelled = [...given].filter((t) => !(provenance ?? {})[t]);
    return { ok: true, unaccounted: [], asserted, unlabelled };
  }
  return {
    ok: false,
    unaccounted,
    message:
      `${unaccounted.length} of ${ALL_TRAITS.length} traits are unaccounted for: ${unaccounted.join(", ")}. `
      + `Every trait needs either a value inferred from the description, or a place in \`unsupportedTraits\` saying the description does not speak to it. `
      + `Both are acceptable; leaving one out is not, because an unsupplied trait is silently filled with the package's hand-set default and the result is indistinguishable from a considered value. `
      + `See \`trait_criteria\` in the persona_create_from_description response for what each trait looks like in a description.`,
  };
}
