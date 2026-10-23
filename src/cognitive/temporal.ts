/**
 * Circadian + temporal context for cognitive journeys.
 *
 * The same person behaves differently at 9am vs 11pm vs Sunday morning vs
 * Monday at deadline. This module gives the journey runner a time-of-day
 * lens so a persona's cognitive traits, distractibility, and emotional
 * baseline shift naturally with the hour.
 *
 * Core curves:
 *   • Circadian energy — cosine model peaking ~10am, dipping ~3am and
 *     ~3pm, declining after 9pm. Range 0..1.
 *   • Day-of-week intensity — workdays (Mon-Fri) lift task focus, weekends
 *     lift exploration. Friday evening drops focus (already winding down).
 *   • Distraction probability — inverse of energy (low energy = more
 *     micro-interruptions like phone buzzes, family asks, etc.)
 *
 * Trait modulations are applied DELTA-style: traits shift by an amount
 * proportional to how far from "ideal" the time is. A high-energy persona
 * at 10am Monday is barely modified; a low-energy persona at 11pm Friday
 * is heavily affected.
 *
 * All math uses local time (caller passes hour/minute) so a single Date
 * works correctly regardless of server timezone.
 *
 * Every number the model computes with is registered, with where it comes
 * from, in src/visual/provenance/temporal.ts and read here through param().
 * None is fitted or published.
 */
import { param } from "../visual/model-provenance.js";

/** Date.getDay() indices the model names. */
const FRIDAY = 5;
const SATURDAY = 6;

export interface TemporalContext {
  /** ISO timestamp or Date object representing the persona's "now". */
  now: Date | string;
  /** IANA timezone string (e.g. "America/New_York"). Defaults to UTC. */
  timezone?: string;
}

export interface TemporalState {
  hour: number;          // 0-23 local hour
  dayOfWeek: number;     // 0=Sun, 6=Sat
  isWeekend: boolean;
  energy: number;        // 0..1 circadian energy
  focusContext: "morning" | "midday" | "afternoon" | "evening" | "night";
  description: string;   // human-readable, for system prompt
}

export interface TemporalModulators {
  // Additive deltas applied to the persona's base cognitive traits.
  // Positive = boost, negative = penalty. All clamped to [-0.4, 0.4] so
  // no single time-of-day swing dominates the persona's identity.
  patienceDelta: number;
  workingMemoryDelta: number;
  curiosityDelta: number;
  metacognitiveDelta: number;
  // Probability per step that a distraction (5-30s pause) fires.
  distractionRate: number;
  // Multiplier on emotional satisfaction baseline (lower at night, higher
  // weekend morning) — captures "the same UI feels worse when I'm tired".
  satisfactionMultiplier: number;
}

/**
 * Decompose a Date into the relevant local-time fields. Uses Intl with
 * timezone if provided; falls back to system local time.
 */
export function getTemporalState(ctx: TemporalContext): TemporalState {
  const date = typeof ctx.now === "string" ? new Date(ctx.now) : ctx.now;
  const tz = ctx.timezone || "UTC";

  // Get hour + day in target timezone
  let hour: number;
  let dayOfWeek: number;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
      weekday: "short",
    }).formatToParts(date);
    hour = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
    if (hour === param("temporal.hoursPerDay")) hour = 0; // Intl edge case
    const wd = parts.find(p => p.type === "weekday")?.value || "Mon";
    dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  } catch {
    hour = date.getHours();
    dayOfWeek = date.getDay();
  }

  const isWeekend = dayOfWeek === 0 || dayOfWeek === SATURDAY;
  const energy = circadianEnergy(hour);
  const focusContext = phaseOfDay(hour);
  const description = describeTemporal(hour, dayOfWeek, focusContext);

  return { hour, dayOfWeek, isWeekend, energy, focusContext, description };
}

/**
 * Circadian alertness on 0..1 scale. Two-cycle cosine model from chronobiology
 * literature: dominant ~24h rhythm + secondary post-lunch dip ~12h.
 *
 * References: Borbély's two-process model; Folkard & Tucker (2003) on
 * post-prandial alertness dip.
 *
 * Key features of the curve:
 *   • Trough ~3am (energy ≈ 0.05)
 *   • Rapid rise 6-10am
 *   • Morning peak ~10-11am (energy ≈ 0.95)
 *   • Post-lunch dip 13-15h (energy ≈ 0.55)
 *   • Late afternoon recovery ~16-18h (energy ≈ 0.80)
 *   • Evening decline after 21h
 *   • Late-night low after 23h (energy ≈ 0.20)
 */
export function circadianEnergy(hour: number): number {
  // Primary 24h cosine: peak at ~14h offset for the normal awake cycle
  const primary = param("temporal.circadian.mean") + param("temporal.circadian.amplitude") * Math.cos((hour - param("temporal.circadian.peakHour")) * 2 * Math.PI / param("temporal.hoursPerDay"));
  // Secondary post-lunch dip: cosine peaking at 14h but inverted (so it dips)
  const lunchDip = param("temporal.circadian.dipAmplitude") * Math.cos((hour - param("temporal.circadian.dipHour")) * 2 * Math.PI / param("temporal.circadian.dipPeriodHours"));
  // Sleep penalty: between 23h and 6h, suppress further
  const sleepPenalty = (hour >= param("temporal.lateNight.startHour") || hour < param("temporal.night.endHour")) ? param("temporal.lateNight.energyPenalty") : 0;
  return Math.max(param("temporal.energy.floor"), Math.min(1, primary - lunchDip - sleepPenalty));
}

function phaseOfDay(hour: number): TemporalState["focusContext"] {
  if (hour < param("temporal.night.endHour")) return "night";
  if (hour < param("temporal.phase.middayStart")) return "morning";
  if (hour < param("temporal.phase.eveningStart")) return "midday";
  if (hour < param("temporal.phase.nightStart")) return "evening";
  return "night";
}

function describeTemporal(hour: number, dow: number, phase: string): string {
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const day = dayNames[dow];
  const isWeekend = dow === 0 || dow === SATURDAY;
  const halfDay = param("temporal.clockHalfDay");
  const h12 = hour === 0 ? halfDay : hour > halfDay ? hour - halfDay : hour;
  const ampm = hour < halfDay ? "am" : "pm";
  const time = `${h12}${ampm}`;

  if (phase === "night" && hour >= param("temporal.lateNight.startHour")) return `late ${day} night (${time}) — tired, winding down, want quick answers`;
  if (phase === "night") return `early ${day} morning (${time}) — pre-coffee, slow processing`;
  if (phase === "morning" && hour < param("temporal.label.earlyMorningEnd")) return `${day} ${time} — easing into the day`;
  if (phase === "morning") return `${day} ${time} — peak focus${isWeekend ? ", relaxed weekend energy" : ", workday momentum"}`;
  if (phase === "midday" && hour < param("temporal.label.lunchEnd")) return `${day} lunchtime (${time})${isWeekend ? ", weekend pace" : ""}`;
  if (phase === "midday") return `${day} ${time} — post-lunch, energy ebbing${isWeekend ? "" : ", afternoon work session"}`;
  if (phase === "evening" && isWeekend) return `${day} evening (${time}) — leisure time, exploring`;
  if (phase === "evening") return `${day} ${time} — winding down workday, less patience`;
  return `${day} ${time}`;
}

/**
 * Compute trait deltas from a temporal state. The deltas are MEANT to be
 * added to the persona's base cognitive traits — they're effects layered
 * ON TOP of who the persona fundamentally is.
 */
export function computeTemporalModulators(state: TemporalState): TemporalModulators {
  const e = state.energy;
  // Energy → traits. Centered such that energy=0.7 (typical waking) gives ~0.
  const eShift = (e - param("temporal.energy.typical")); // range roughly [-0.65, +0.30]

  // Patience drops sharply when tired or stressed (low energy or peak
  // workday hours). Friday evening: less patient (winding down).
  let patienceDelta = eShift * param("temporal.patience.gain");
  if (state.dayOfWeek === FRIDAY && state.hour >= param("temporal.friday.hour")) patienceDelta -= param("temporal.friday.patienceDrop");
  // Late night patience cliff
  if (state.hour >= param("temporal.lateNight.patienceHour") || state.hour < param("temporal.night.endHour")) patienceDelta -= param("temporal.lateNight.patienceDrop");

  // Working memory tracks energy directly
  const workingMemoryDelta = eShift * param("temporal.workingMemory.gain");

  // Curiosity: lower during peak work focus, higher in leisure windows
  let curiosityDelta = 0;
  if (state.focusContext === "evening" && state.isWeekend) curiosityDelta += param("temporal.curiosity.weekendEvening");
  if (state.focusContext === "evening" && !state.isWeekend) curiosityDelta -= param("temporal.curiosity.weekdayEveningDrop");
  if (state.focusContext === "morning" && !state.isWeekend) curiosityDelta -= param("temporal.curiosity.weekdayMorningDrop"); // workday focus

  // Metacognitive planning collapses when very tired
  const metacognitiveDelta = e < param("temporal.metacognition.collapseEnergy") ? param("temporal.metacognition.collapse") : eShift * param("temporal.metacognition.gain");

  // Distraction rate: ~3% per step at peak energy, up to ~25% at low energy
  const distractionRate = Math.max(param("temporal.distraction.floor"), param("temporal.distraction.atZeroEnergy") - e * param("temporal.distraction.energyGain"));

  // Satisfaction baseline: same UI feels worse when tired
  const satisfactionMultiplier = param("temporal.satisfaction.base") + e * param("temporal.satisfaction.gain"); // [0.7..1.1]

  // Clamp deltas to [-0.4, 0.4]
  const limit = param("temporal.deltaClamp");
  const clamp = (v: number) => Math.max(-limit, Math.min(limit, v));

  return {
    patienceDelta: clamp(patienceDelta),
    workingMemoryDelta: clamp(workingMemoryDelta),
    curiosityDelta: clamp(curiosityDelta),
    metacognitiveDelta: clamp(metacognitiveDelta),
    distractionRate,
    satisfactionMultiplier,
  };
}

/**
 * Should this step trigger a distraction (phone buzz, kid asks question,
 * etc.)? Returns the duration in ms if yes, 0 if no.
 */
export function rollDistraction(modulators: TemporalModulators): number {
  if (Math.random() >= modulators.distractionRate) return 0;
  // Distraction durations follow a long-tailed distribution: most are
  // 3-10s glances, occasional 30-60s genuine interruptions
  const r = Math.random();
  if (r < param("temporal.distraction.shortShare")) return param("temporal.distraction.shortMinMs") + Math.random() * param("temporal.distraction.shortSpanMs"); // short glance
  if (r < param("temporal.distraction.mediumCumShare")) return param("temporal.distraction.mediumMinMs") + Math.random() * param("temporal.distraction.mediumSpanMs"); // medium chat
  return param("temporal.distraction.longMinMs") + Math.random() * param("temporal.distraction.longSpanMs"); // long detour
}
