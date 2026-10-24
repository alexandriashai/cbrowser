/**
 * Provenance entries for the emotional engine's constants
 * (src/cognitive/emotions.ts). See ../model-provenance.ts for the statuses.
 *
 * The engine keeps seven emotion intensities on 0-1, moves them by a fixed
 * table of trigger effects, decays them toward a trait-set baseline, and
 * reduces them to a valence, an arousal, a dominant emotion, a patience
 * reading and a few behavioural modifiers. The file cites Scherer's component
 * process model, Russell's circumplex and the OCC model for its structure;
 * none of those sources states any number used here, and no number here was
 * fitted, so every entry is a `hypothesis` whose source says what would set
 * it. The one kind of data that could set most of them at once: per-step
 * self-reports (or physiological arousal) from people working through tasks
 * with scripted successes, failures and errors, regressed on the trigger
 * sequence.
 *
 * Read through param() at the point of use; tests/journey-provenance.test.ts
 * fails on an id that is registered and never read, and
 * tests/journey-no-literals.test.ts on a numeric literal in emotions.ts.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { ProvenanceEntry } from "../model-provenance.js";

const h = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `emotion.${id}`, value, status: "hypothesis", source });

const SELF_REPORT =
  "Per-step emotion self-reports (or skin-conductance arousal) from people working through tasks with scripted successes, failures and errors, regressed on the trigger sequence, would set it.";

const effect = (trigger: string, emotion: string, value: number) =>
  h(`effect.${trigger}.${emotion}`, value, `Hand-set change in ${emotion} (0-1 intensity) per unit of sensitivity when a "${trigger}" trigger fires. ${SELF_REPORT}`);

const valence = (emotion: string, value: number) =>
  h(`valence.${emotion}`, value, `Hand-set valence of ${emotion} on -1..+1, after the placement of affect words in Russell's (1980) circumplex, which gives positions on a figure, not these numbers. Valence ratings of the emotion word from a published norm (e.g. Warriner, Kuperman & Brysbaert 2013), mapped onto -1..+1, would set it.`);

const arousal = (emotion: string, value: number) =>
  h(`arousal.${emotion}`, value, `Hand-set arousal of ${emotion} on 0..1, after Russell's (1980) circumplex, which gives positions on a figure, not these numbers. Arousal ratings of the emotion word from a published norm (e.g. Warriner, Kuperman & Brysbaert 2013), mapped onto 0..1, would set it.`);

export const EMOTION_PROVENANCE: ProvenanceEntry[] = [
  // ── Rates ──
  h("decayRate", 0.15, `Hand-set share of the gap to baseline each emotion closes per step (before trait scaling). The half-life of self-reported frustration and anxiety after a task event, in steps, would set it. ${SELF_REPORT}`),
  h("changeThreshold", 0.05, "Hand-set minimum change carried on EmotionalConfig as the size that registers as an event. Nothing in cbrowser applies it. The smallest self-reported change people notice would set it."),

  // ── The circumplex placement of each emotion ──
  valence("anxiety", -0.7), valence("frustration", -0.8), valence("boredom", -0.4), valence("confusion", -0.5),
  valence("satisfaction", 0.7), valence("excitement", 0.8), valence("relief", 0.5),
  arousal("anxiety", 0.8), arousal("frustration", 0.7), arousal("boredom", 0.2), arousal("confusion", 0.5),
  arousal("satisfaction", 0.5), arousal("excitement", 0.9), arousal("relief", 0.3),
  h("arousal.neutral", 0.3, "Hand-set arousal of the neutral state, used as the arousal of a state with no emotion above the blend floor and as the starting arousal. Resting arousal ratings (or skin conductance) at task start would set it."),

  // ── Baseline from traits ──
  h("baseline.anxiety", 0.1, `Hand-set anxiety of a patient, self-assured persona at the start of a task. Pre-task state anxiety (e.g. STAI-S) across people of known patience and self-efficacy would set it, with the two slopes below.`),
  h("baseline.anxietyPerImpatience", 0.2, "Hand-set extra starting anxiety per unit of impatience (1 - patience). The same pre-task anxiety regression would set it."),
  h("baseline.anxietyPerLowEfficacy", 0.15, "Hand-set extra starting anxiety per unit of low self-efficacy (1 - selfEfficacy). Pre-task anxiety regressed on a computer self-efficacy scale would set it."),
  h("baseline.excitementPerCuriosity", 0.2, "Hand-set starting excitement per unit of curiosity. Pre-task interest ratings regressed on a curiosity scale would set it."),
  h("baseline.boredomPerIncuriosity", 0.1, "Hand-set starting boredom per unit of incuriosity (1 - curiosity). Pre-task boredom ratings regressed on a curiosity scale would set it."),
  h("baseline.satisfaction", 0.1, "Hand-set starting satisfaction (slight initial optimism). Pre-task satisfaction or expectation ratings would set it."),

  // ── Configuration from traits ──
  h("config.decayBase", 0.5, "Hand-set share of the decay rate a persona with no resilience keeps (0.5x at resilience 0, 1x at 1). Recovery times after a setback across people of measured resilience (Brief Resilience Scale) would set it."),
  h("config.decayPerResilience", 0.5, "Hand-set extra share of the decay rate per unit of resilience. The same recovery-time regression would set it."),
  h("config.sensitivityBase", 1.5, "Hand-set sensitivity to triggers of a persona with no patience (1.5x at patience 0, 1x at 1). The size of self-reported reactions to the same failure across people of measured patience would set it."),
  h("config.sensitivityPerPatience", 0.5, "Hand-set drop in sensitivity per unit of patience. The same reaction-size regression would set it."),

  // ── Trigger effects ──
  effect("success", "satisfaction", 0.2), effect("success", "excitement", 0.1), effect("success", "frustration", -0.15), effect("success", "anxiety", -0.1), effect("success", "confusion", -0.1),
  effect("failure", "frustration", 0.25), effect("failure", "anxiety", 0.15), effect("failure", "satisfaction", -0.1), effect("failure", "excitement", -0.05),
  effect("error", "anxiety", 0.3), effect("error", "frustration", 0.2), effect("error", "confusion", 0.15), effect("error", "satisfaction", -0.15),
  effect("progress", "satisfaction", 0.15), effect("progress", "excitement", 0.1), effect("progress", "boredom", -0.1), effect("progress", "frustration", -0.05),
  effect("setback", "frustration", 0.2), effect("setback", "anxiety", 0.1), effect("setback", "satisfaction", -0.15), effect("setback", "excitement", -0.1),
  effect("waiting", "boredom", 0.15), effect("waiting", "frustration", 0.05), effect("waiting", "excitement", -0.05),
  effect("discovery", "excitement", 0.25), effect("discovery", "satisfaction", 0.1), effect("discovery", "boredom", -0.2),
  effect("completion", "satisfaction", 0.3), effect("completion", "relief", 0.2), effect("completion", "excitement", 0.05), effect("completion", "frustration", -0.2), effect("completion", "anxiety", -0.15),
  effect("confusion_onset", "confusion", 0.25), effect("confusion_onset", "anxiety", 0.1), effect("confusion_onset", "frustration", 0.1), effect("confusion_onset", "satisfaction", -0.1),
  effect("clarity", "confusion", -0.2), effect("clarity", "relief", 0.15), effect("clarity", "satisfaction", 0.1), effect("clarity", "anxiety", -0.1),
  effect("time_pressure", "anxiety", 0.25), effect("time_pressure", "frustration", 0.1), effect("time_pressure", "boredom", -0.1),
  effect("recovery", "relief", 0.25), effect("recovery", "satisfaction", 0.1), effect("recovery", "frustration", -0.15), effect("recovery", "anxiety", -0.2),

  // ── Derived values ──
  h("dominantFloor", 0.15, "Hand-set intensity below which no emotion is dominant (the state reads neutral), also the floor for describing a state. The intensity at which people report an emotion as present at all would set it."),
  h("blendFloor", 0.05, "Hand-set intensity an emotion must exceed to count toward valence and arousal. The same presence threshold would set it."),

  // ── Abandonment modifier (multiplier on the patience floor) ──
  h("abandonModifier.anxiety", 0.3, "Hand-set weight of anxiety in the abandonment modifier. A survival model of time to abandonment on per-step emotion reports would fit the five negative and three positive weights together."),
  h("abandonModifier.frustration", 0.35, "Hand-set weight of frustration in the abandonment modifier. The same survival model would fit it."),
  h("abandonModifier.boredom", 0.25, "Hand-set weight of boredom in the abandonment modifier. The same survival model would fit it."),
  h("abandonModifier.confusion", 0.2, "Hand-set weight of confusion in the abandonment modifier. The same survival model would fit it."),
  h("abandonModifier.satisfaction", 0.3, "Hand-set weight of satisfaction in the abandonment modifier's positive load. The same survival model would fit it."),
  h("abandonModifier.excitement", 0.25, "Hand-set weight of excitement in the positive load. The same survival model would fit it."),
  h("abandonModifier.relief", 0.15, "Hand-set weight of relief in the positive load. The same survival model would fit it."),
  h("abandonModifier.positiveShare", 0.7, "Hand-set share of the positive load that offsets the negative load. The same survival model would fit it."),
  h("abandonModifier.min", 0.5, "Hand-set lower clamp of the abandonment modifier. The fitted hazard ratios' range would set it."),
  h("abandonModifier.max", 2, "Hand-set upper clamp of the abandonment modifier. The fitted hazard ratios' range would set it."),

  // ── Exploration tendency ──
  h("exploration.base", 0.5, "Hand-set exploration tendency of a persona with no emotion. The share of off-path clicks in a task, regressed on per-step emotion reports, would fit the base and the weights below."),
  h("exploration.excitement", 0.4, "Hand-set weight of excitement in exploration. The same off-path regression would fit it."),
  h("exploration.satisfaction", 0.3, "Hand-set weight of satisfaction in exploration. The same off-path regression would fit it."),
  h("exploration.relief", 0.1, "Hand-set weight of relief in exploration. The same off-path regression would fit it."),
  h("exploration.anxiety", 0.4, "Hand-set weight of anxiety against exploration. The same off-path regression would fit it."),
  h("exploration.frustration", 0.3, "Hand-set weight of frustration against exploration. The same off-path regression would fit it."),
  h("exploration.confusion", 0.2, "Hand-set weight of confusion against exploration. The same off-path regression would fit it."),
  h("exploration.boredomOnset", 0.5, "Hand-set boredom above which boredom adds to exploration. The same off-path regression, with a boredom breakpoint, would set it."),
  h("exploration.boredom", 0.2, "Hand-set weight of boredom above its onset. The same off-path regression would fit it."),

  // ── Decision speed ──
  h("decisionSpeed.anxiety", 0.3, "Hand-set slowing of decisions per unit of anxiety. Decision times in a task regressed on per-step emotion reports would fit the weights below."),
  h("decisionSpeed.confusion", 0.4, "Hand-set slowing per unit of confusion. The same decision-time regression would fit it."),
  h("decisionSpeed.impulsiveOnset", 0.6, "Hand-set frustration above which decisions speed up (impulsive). The same regression, with a frustration breakpoint, would set it."),
  h("decisionSpeed.impulsiveGain", 0.5, "Hand-set speed-up per unit of frustration above its onset. The same regression would fit it."),
  h("decisionSpeed.excitement", 0.2, "Hand-set speed-up per unit of excitement. The same regression would fit it."),

  // ── Describing a state ──
  h("describe.very", 0.7, "Hand-set intensity above which an emotion is described as \"very\". Ratings of how people label an intensity would set the three word bands."),
  h("describe.somewhat", 0.4, "Hand-set intensity above which an emotion is described as \"somewhat\". The same labelling ratings would set it."),
  h("describe.secondary", 0.3, "Hand-set intensity above which a second emotion is mentioned. The same labelling ratings would set it."),

  // ── When to consider abandoning ──
  h("considerAbandon.frustration", 0.8, "Hand-set frustration above which abandonment is considered. Emotion reports in the step before people abandon a task would set the cut points of all five rules."),
  h("considerAbandon.anxiety", 0.7, "Hand-set anxiety above which, with low satisfaction, abandonment is considered. The same pre-abandonment reports would set it."),
  h("considerAbandon.satisfaction", 0.2, "Hand-set satisfaction below which high anxiety, or high confusion with low relief, leads to considering abandonment. The same pre-abandonment reports would set it."),
  h("considerAbandon.boredom", 0.6, "Hand-set boredom above which, with frustration, abandonment is considered. The same pre-abandonment reports would set it."),
  h("considerAbandon.boredFrustration", 0.5, "Hand-set frustration that, with boredom above its cut, leads to considering abandonment. The same pre-abandonment reports would set it."),
  h("considerAbandon.confusion", 0.7, "Hand-set confusion above which, with little relief, abandonment is considered. The same pre-abandonment reports would set it."),
  h("considerAbandon.relief", 0.2, "Hand-set relief below which high confusion leads to considering abandonment. The same pre-abandonment reports would set it."),
  h("considerAbandon.valence", -0.6, "Hand-set valence below which, with high arousal, abandonment is considered. The same pre-abandonment reports would set it."),
  h("considerAbandon.arousal", 0.6, "Hand-set arousal above which, with negative valence, abandonment is considered. The same pre-abandonment reports would set it."),

  // ── Patience as a view of the emotional state ──
  h("patience.boredomWeight", 0.6, "Hand-set weight of boredom in the patience drain (frustration weighs 1). Self-rated willingness to keep trying, regressed on per-step emotion reports, would fit the weights and gains below."),
  h("patience.anxietyWeight", 0.5, "Hand-set weight of anxiety in the patience drain. The same willingness regression would fit it."),
  h("patience.traitFloor", 0.2, "Hand-set lowest patience trait the drain divides by, so a trait near 0 cannot drain patience without bound. A numerical guard whose value changes every persona below it; the willingness regression would set the drain's dependence on the trait instead."),
  h("patience.drainScale", 1.3, "Hand-set scale of the patience drain: the drain multiplier is 1 / (patience trait x 1.3), about 1.54 at patience 0.5. The same willingness regression, across people of measured patience, would set it."),
  h("patience.excitementWeight", 0.7, "Hand-set weight of excitement, beside satisfaction, in the positive buffer on patience. The same willingness regression would fit it."),
  h("patience.bufferGain", 0.3, "Hand-set share of the positive emotions that buffers the patience drain. The same willingness regression would fit it."),

  // ── Trait-modulated decay ──
  h("decay.traitBase", 0.5, "Hand-set decay multiplier of confusion, frustration and boredom at trait 0 (0.5x), rising to 2x at trait 1 (comprehension for confusion, resilience for frustration, curiosity for boredom). Recovery times of each emotion across people of measured trait level would set it."),
  h("decay.traitGain", 1.5, "Hand-set rise in that decay multiplier per unit of the trait. The same recovery-time regression would set it."),
  h("decay.satisfaction", 0.5, "Hand-set decay multiplier of satisfaction (positive states are sticky). The half-life of self-reported satisfaction after a success would set it."),
  h("decay.excitement", 0.7, "Hand-set decay multiplier of excitement. The half-life of self-reported excitement after a discovery would set it."),
  h("decay.dominantFloor", 0.1, "Hand-set intensity below which no emotion is dominant after a trait-modulated decay. emotion.dominantFloor (0.15) does the same job after a trigger; the two disagree. The intensity at which people report an emotion as present would set both."),
];
