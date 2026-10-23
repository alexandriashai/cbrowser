/**
 * Provenance entries for the time-of-day model (src/cognitive/temporal.ts).
 * See ../model-provenance.ts for the statuses.
 *
 * The model turns the persona's local hour and weekday into a circadian
 * energy on 0-1, trait deltas (patience, working memory, curiosity,
 * metacognitive planning) and an ambient distraction rate and duration. It
 * cites Borbely's two-process model and Folkard & Tucker (2003) on the
 * post-lunch dip for its shape; neither states these coefficients, and none
 * was fitted, so every model entry is a `hypothesis`. The data that would set
 * most of them: performance or alertness measured across the day (e.g. the
 * psychomotor vigilance task, or task times on a fixed web task) in the
 * population the persona stands for. The weekday and clock encodings are
 * definitions.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { ProvenanceEntry } from "../model-provenance.js";

const h = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `temporal.${id}`, value, status: "hypothesis", source });
const d = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `temporal.${id}`, value, status: "definition", source });

const ALERTNESS = "Alertness or performance measured across the day (psychomotor vigilance, or task times on a fixed web task), in the population the persona stands for, would set it.";
const TRAIT_SHIFT = (trait: string) =>
  `Hand-set shift in ${trait}. The trait's measure (provenance/personas.ts) taken at different hours and days, in the same people, would set it.`;
const INTERRUPTION =
  "Self-interruption and external-interruption logs of people working on a computer (when they occur and how long they last) would set it.";

export const TEMPORAL_PROVENANCE: ProvenanceEntry[] = [
  d("hoursPerDay", 24, "Hours per day: the period of the circadian cosine, and the hour Intl reports for midnight in some locales."),

  // ── Circadian energy ──
  h("circadian.mean", 0.5, `Hand-set mean of the 24-hour energy cosine. ${ALERTNESS}`),
  h("circadian.amplitude", 0.45, `Hand-set amplitude of the 24-hour energy cosine. ${ALERTNESS}`),
  h("circadian.peakHour", 14, `Hand-set hour at which the 24-hour cosine peaks (the comment's "morning peak ~10-11am" comes from subtracting the dip). ${ALERTNESS}`),
  h("circadian.dipHour", 14, `Hand-set hour at which the post-lunch dip is deepest. ${ALERTNESS}`),
  h("circadian.dipAmplitude", 0.1, `Hand-set depth of the post-lunch dip. ${ALERTNESS}`),
  h("circadian.dipPeriodHours", 6, `Hand-set period, hours, of the dip's cosine. The file's header calls the dip a secondary ~12-hour rhythm; the code's period is 6 hours. ${ALERTNESS}`),
  h("lateNight.startHour", 23, `Hand-set hour from which late-night sleep pressure lowers energy and the description says "late night". ${ALERTNESS}`),
  h("night.endHour", 6, `Hand-set hour at which the night ends: sleep pressure stops, the phase becomes morning and the late-night patience penalty lifts. ${ALERTNESS}`),
  h("lateNight.energyPenalty", 0.2, `Hand-set energy lost to sleep pressure during the night. ${ALERTNESS}`),
  h("energy.floor", 0.05, `Hand-set lowest energy. ${ALERTNESS}`),

  // ── Phases and descriptions ──
  h("phase.middayStart", 12, "Hand-set hour at which the morning phase ends. How people describe the parts of their day would set the phase edges."),
  h("phase.eveningStart", 17, "Hand-set hour at which the midday phase ends and the evening begins. The same descriptions would set it."),
  h("phase.nightStart", 21, "Hand-set hour at which the evening ends and the night begins. The same descriptions would set it."),
  h("label.earlyMorningEnd", 9, "Hand-set hour before which a morning is described as easing into the day. The same descriptions would set it."),
  h("label.lunchEnd", 14, "Hand-set hour before which midday is described as lunchtime. The same descriptions would set it."),
  d("clockHalfDay", 12, "Hours in half a day, for the 12-hour clock in the description (am/pm, and 0 h shown as 12)."),

  // ── Trait deltas ──
  h("energy.typical", 0.7, "Hand-set energy at which the time of day shifts no trait (typical waking). The energy reading at which measured traits equal their daily mean would set it."),
  h("patience.gain", 0.3, TRAIT_SHIFT("patience per unit of energy away from typical")),
  h("friday.hour", 16, TRAIT_SHIFT("patience on Friday afternoons: the hour from which it applies")),
  h("friday.patienceDrop", 0.1, TRAIT_SHIFT("patience on Friday afternoons")),
  h("lateNight.patienceHour", 22, TRAIT_SHIFT("patience late at night: the hour from which it applies (one hour before the energy penalty)")),
  h("lateNight.patienceDrop", 0.15, TRAIT_SHIFT("patience late at night")),
  h("workingMemory.gain", 0.3, TRAIT_SHIFT("working memory per unit of energy away from typical")),
  h("curiosity.weekendEvening", 0.12, TRAIT_SHIFT("curiosity on weekend evenings")),
  h("curiosity.weekdayEveningDrop", 0.05, TRAIT_SHIFT("curiosity (a drop) on weekday evenings")),
  h("curiosity.weekdayMorningDrop", 0.1, TRAIT_SHIFT("curiosity (a drop) on weekday mornings")),
  h("metacognition.collapseEnergy", 0.4, TRAIT_SHIFT("metacognitive planning: the energy below which it collapses")),
  h("metacognition.collapse", -0.2, TRAIT_SHIFT("metacognitive planning when energy is very low")),
  h("metacognition.gain", 0.2, TRAIT_SHIFT("metacognitive planning per unit of energy away from typical")),
  h("deltaClamp", 0.4, "Hand-set largest shift the time of day may make to any trait. The largest within-person daily swing of each trait's measure would set it."),
  h("satisfaction.base", 0.7, "Hand-set satisfaction multiplier at zero energy, carried on TemporalModulators. Nothing in cbrowser applies it. Satisfaction ratings of the same interface at different hours would set it."),
  h("satisfaction.gain", 0.4, "Hand-set rise in that multiplier per unit of energy. Nothing in cbrowser applies it. The same ratings would set it."),

  // ── Ambient distraction ──
  h("distraction.floor", 0.03, `Hand-set lowest chance per step of an ambient distraction. ${INTERRUPTION}`),
  h("distraction.atZeroEnergy", 0.3, `Hand-set chance per step of a distraction at zero energy. ${INTERRUPTION}`),
  h("distraction.energyGain", 0.3, `Hand-set fall in that chance per unit of energy. ${INTERRUPTION}`),
  h("distraction.shortShare", 0.7, `Hand-set share of distractions that are short glances. ${INTERRUPTION}`),
  h("distraction.shortMinMs", 3000, `Hand-set shortest short distraction, ms. ${INTERRUPTION}`),
  h("distraction.shortSpanMs", 7000, `Hand-set spread of short distractions, ms (uniform). ${INTERRUPTION}`),
  h("distraction.mediumCumShare", 0.95, `Hand-set cumulative share of distractions that are short or medium. ${INTERRUPTION}`),
  h("distraction.mediumMinMs", 10000, `Hand-set shortest medium distraction, ms. ${INTERRUPTION}`),
  h("distraction.mediumSpanMs", 20000, `Hand-set spread of medium distractions, ms. ${INTERRUPTION}`),
  h("distraction.longMinMs", 30000, `Hand-set shortest long distraction, ms. ${INTERRUPTION}`),
  h("distraction.longSpanMs", 30000, `Hand-set spread of long distractions, ms. ${INTERRUPTION}`),
];
