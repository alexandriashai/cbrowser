/**
 * Published laws of human performance, in seconds, for the reference user.
 *
 * Stage B replaces the chain's hand-set motor, decision, procedure and reading
 * demand curves with times from laws measured on people, all on one scale:
 *
 *   pointing   Fitts' law, Shannon form, SMALLER-OF width (MacKenzie & Buxton 1992)
 *   choosing   novice linear search, Cockburn, Gutwin & Greenberg (2007); their
 *              expert limit, Hick-Hyman, weighted by the run's siteFamiliarity
 *              in cognitiveLoad's demand (their Eq. 4, Stage C)
 *   reading    Brysbaert's (2019) silent reading rate, as a letter rate
 *   procedure  the keystroke-level model's mental preparation M per entry step
 *              (Card, Moran & Newell 1980)
 *
 * A time becomes a demand against one budget tau, d = T / (T + tau), and a
 * persona's rate becomes a capacity against the reference rate,
 * c = r_p / (r_p + r_ref). Then d > c exactly when the persona's own time on
 * the page, T x r_ref / r_p, exceeds tau, and tau cancels out of every
 * capacity (research/stage-b-design.md, section 6). The pair is unit-coherent
 * for the two layers whose capacity is a rate, pointing and reading.
 *
 * Every function is pure and takes plain numbers, so it does not depend on the
 * layout of a raw page measurement; turning a RawPageMeasurement into these
 * inputs is the caller's job. Every constant is read through param()
 * (provenance/laws.ts), so a stored raw measurement re-derives under a changed
 * constant, and tests/demand-laws.test.ts fails on any other numeric literal
 * here. Invalid input throws instead of returning a default: a NaN or negative
 * time must not reach a demand silently.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { param } from "./model-provenance.js";
import type { MetricScope } from "./cognitive-transport.js";

/** Rates are published per minute and the laws return seconds. A unit, not a model constant. */
const SECONDS_PER_MINUTE = 60;

function nonNegative(name: string, v: number): number {
  if (!Number.isFinite(v) || v < 0) throw new RangeError(`${name} must be a finite number >= 0, got ${v}`);
  return v;
}

function positive(name: string, v: number): number {
  if (!Number.isFinite(v) || v <= 0) throw new RangeError(`${name} must be a finite number > 0, got ${v}`);
  return v;
}

/** An item count for a choice law: 0 (no choice offered) or at least 1. */
function itemCount(name: string, v: number): number {
  nonNegative(name, v);
  if (v > 0 && v < 1) throw new RangeError(`${name} must be 0 or at least 1, got ${v}`);
  return v;
}

/** `sum` over the `stored` items scaled to `total`, for a raw record that keeps only the first N of a count. */
function scaledToTotal(name: string, sum: number, stored: number, total: number): number {
  nonNegative(name, total);
  if (total < stored) throw new RangeError(`${name} (${total}) is below the ${stored} items given`);
  if (total === stored) return sum;
  if (stored === 0) throw new RangeError(`${name} is ${total} but no items were given to scale from`);
  return (sum * total) / stored;
}

// ── Pointing ──

/**
 * Fitts' index of difficulty, bits, in the Shannon form ID = log2(D / W + 1)
 * (Soukoreff & MacKenzie 2004, section 3.3). W is floored at law.fitts.minWidth,
 * where ID would otherwise be undefined.
 */
export function fittsIndexOfDifficulty(distance: number, width: number): number {
  const w = Math.max(nonNegative("width", width), param("law.fitts.minWidth"));
  return Math.log2(nonNegative("distance", distance) / w + 1);
}

/**
 * Movement time, seconds, to acquire one target: MT = a + b ID, the regression
 * MacKenzie & Buxton (1992) fit with the SMALLER-OF width. Predicted from the
 * regression, not as ID / throughput, because the regression is what predicts
 * time (Soukoreff & MacKenzie 2004).
 */
export function fittsMovementTime(distance: number, width: number): number {
  return param("law.fitts.intercept") + param("law.fitts.slope") * fittsIndexOfDifficulty(distance, width);
}

/** The width a two-dimensional target enters Fitts' law with: the smaller of its width and height (SMALLER-OF). */
export function smallerOfWidth(width: number, height: number): number {
  return Math.min(nonNegative("width", width), nonNegative("height", height));
}

export interface PointingTarget {
  /** From where the pointer starts to the target's centre, CSS px. */
  distance: number;
  width: number;
  height: number;
}

/**
 * Seconds to acquire every target once: the sum of each target's movement
 * time. `totalTargets` is the uncapped count when the targets given are the
 * first N of it; the sum is then scaled by totalTargets / N, assuming the
 * targets not given are as hard on average as those given (a definition).
 */
export function pointingSeconds(targets: readonly PointingTarget[], totalTargets: number = targets.length): number {
  let sum = 0;
  for (const t of targets) sum += fittsMovementTime(t.distance, smallerOfWidth(t.width, t.height));
  return scaledToTotal("totalTargets", sum, targets.length, totalTargets);
}

/** A target's box, CSS px in document coordinates. */
export interface TargetBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Distance, CSS px, from a target's centre to the centre of the screen it is
 * seen on, the pointer's assumed start (a definition). At viewport scope that
 * screen is the one scrolled to; at full_page it is the screen-sized band, tiled
 * from the top of the document, that holds the target's centre. The motor
 * audits measure from the same point.
 */
export function distanceToScreenCentre(
  box: TargetBox,
  view: { viewportWidth: number; viewportHeight: number; scrollY: number },
  scope: MetricScope,
): number {
  const vh = positive("viewportHeight", view.viewportHeight);
  const cx = box.x + nonNegative("box width", box.width) / 2;
  const cy = box.y + nonNegative("box height", box.height) / 2;
  const screenTop = scope === "viewport" ? view.scrollY : Math.floor(cy / vh) * vh;
  return Math.hypot(cx - positive("viewportWidth", view.viewportWidth) / 2, cy - (screenTop + vh / 2));
}

// ── Choosing ──

/**
 * Seconds to find an item in a group of `items` by linear visual search, the
 * novice limit of Cockburn et al.'s menu model: T = a + b n. A group of 0
 * offers no choice and takes 0.
 */
export function noviceSearchSeconds(items: number): number {
  if (itemCount("items", items) === 0) return 0;
  return param("law.search.intercept") + param("law.search.slope") * items;
}

/** The expert limit of the same model, Hick-Hyman: T = a + b log2 n. cognitiveLoad's demand weights it by the run's siteFamiliarity e (Eq. 4); a first visit reads none of it. */
export function hickHymanSeconds(items: number): number {
  if (itemCount("items", items) === 0) return 0;
  return param("law.hick.intercept") + param("law.hick.slope") * Math.log2(items);
}

export interface ChoiceGroup {
  /** Items offered. */
  size: number;
  /**
   * True when every item is its own yes/no decision (a checkbox group): the
   * group costs `size` decisions of one item each, one item inspected by search
   * and one bit by Hick-Hyman (a definition). False or absent: one decision
   * among `size` items.
   */
  each?: boolean;
}

/**
 * Seconds to make every choice the groups offer once: the sum over groups.
 * `law` picks novice search (the first-visit demand) or Hick-Hyman (the expert limit, weighted by siteFamiliarity).
 * `totalGroups` scales a capped list as in pointingSeconds.
 */
export function choosingSeconds(groups: readonly ChoiceGroup[], law: "novice" | "expert" = "novice", totalGroups: number = groups.length): number {
  const one = law === "novice" ? noviceSearchSeconds : hickHymanSeconds;
  const yesNo = law === "novice" ? noviceSearchSeconds(1) : hickHymanSeconds(2);
  let sum = 0;
  for (const g of groups) sum += g.each ? itemCount("size", g.size) * yesNo : one(g.size);
  return scaledToTotal("totalGroups", sum, groups.length, totalGroups);
}

// ── Reading ──

/** Seconds to read `words` at `wpm` words per minute. */
export function wordsReadingSeconds(words: number, wpm: number): number {
  return (nonNegative("words", words) / positive("wpm", wpm)) * SECONDS_PER_MINUTE;
}

/**
 * Seconds to read `letters` letters of alphabetic text: Brysbaert's equation
 * for a text, wpm = 238 x 4.6 / mean word length, is a constant rate of
 * 238 x 4.6 letters per minute, so time depends on letters, not words.
 */
export function lettersReadingSeconds(letters: number): number {
  return wordsReadingSeconds(letters, param("law.reading.wpm") * param("law.reading.lettersPerWord"));
}

export interface ReadingCounts {
  /** Letters of alphabetic words (on any page: the Latin words of an abjad or CJK page too). */
  letters: number;
  /** Abjad words, read at the Arabic rate. */
  abjadWords?: number;
  /**
   * CJK characters, read at the Chinese character rate (260 wpm x 1.5
   * characters per word). Japanese and Korean read at that rate is an
   * assumption: Brysbaert's Table 5 has no Japanese row and counts Korean in
   * space-separated words.
   */
  cjkChars?: number;
}

/** Seconds to read all of the prose once, at the reference rate of each script. */
export function readingSeconds(counts: ReadingCounts): number {
  return lettersReadingSeconds(counts.letters)
    + wordsReadingSeconds(counts.abjadWords ?? 0, param("law.reading.abjadWpm"))
    + wordsReadingSeconds(counts.cjkChars ?? 0, param("law.reading.cjkWpm") * param("law.reading.cjkCharsPerWord"));
}

// ── Procedure ──

/**
 * Seconds of mental preparation for `entrySteps` entry steps: KLM's M per
 * step. One M per field is a definition borrowing KLM's operator; KLM places
 * M by rules applied to a task method, which a page does not give.
 */
export function klmSeconds(entrySteps: number): number {
  return param("law.klm.mentalPreparation") * nonNegative("entrySteps", entrySteps);
}

// ── Demand and capacity on the time scale ──

/** A time as a demand, d = T / (T + tau): 0 at no work, 0.5 at the budget, below 1 for any finite time. */
export function timeDemand(seconds: number): number {
  const t = nonNegative("seconds", seconds);
  return t / (t + param("law.timeBudget"));
}

/**
 * A rate as a capacity, c = r_p / (r_p + r_ref): 0.5 at the reference rate.
 * Under timeDemand this is the share of the budget's reference-user work the
 * persona gets through, so tau does not appear in it.
 */
export function rateCapacity(rate: number, referenceRate: number): number {
  const r = nonNegative("rate", rate);
  return r / (r + positive("referenceRate", referenceRate));
}

/** Pointing capacity from a Fitts throughput, bits/s, against the reference mouse throughput. */
export function pointingCapacity(throughput: number): number {
  return rateCapacity(throughput, param("law.rate.pointing.reference"));
}

/** Reading capacity from a silent reading rate, wpm, against the reference rate the reading time uses. */
export function readingCapacity(wpm: number): number {
  return rateCapacity(wpm, param("law.reading.wpm"));
}

/**
 * The populations with a measured rate in provenance/laws.ts. Adults 65+, adults
 * with ADHD and adults with intellectual disability have none.
 */
export type MeasuredPopulation = "motionImpaired" | "dyslexiaAdults" | "lowVisionCentralLoss" | "lowVisionIntactFields" | "aphasiaReadingImpaired";

export interface MeasuredRate {
  channel: "pointing" | "reading";
  /**
   * The population's measurement: bits/s for pointing, wpm for reading, or
   * seconds for one text when `timed` (Stage C: aphasia, Webster et al. 2018).
   */
  rate: number;
  /** What it is compared with, in the same unit. */
  control: number;
  /** True when the control group was measured in the same study and method; false when it is the reference law rate. */
  sameStudyControl: boolean;
  /** True when rate and control are times on the same text, so the faster group has the smaller number. */
  timed: boolean;
  /** The population's rate as a share of typical, the r_p / r_ref a capacity is built from: rate / control, or control / rate when timed. */
  ratio: number;
}

const MEASURED: Record<MeasuredPopulation, { channel: MeasuredRate["channel"]; rate: string; control: string; sameStudy: boolean; timed?: boolean }> = {
  motionImpaired: { channel: "pointing", rate: "law.rate.pointing.motionImpaired", control: "law.rate.pointing.motionImpairedControls", sameStudy: true },
  dyslexiaAdults: { channel: "reading", rate: "law.rate.reading.dyslexiaAdults", control: "law.rate.reading.dyslexiaControls", sameStudy: true },
  lowVisionCentralLoss: { channel: "reading", rate: "law.rate.reading.lowVisionCentralLoss", control: "law.reading.wpm", sameStudy: false },
  lowVisionIntactFields: { channel: "reading", rate: "law.rate.reading.lowVisionIntactFields", control: "law.reading.wpm", sameStudy: false },
  aphasiaReadingImpaired: { channel: "reading", rate: "law.rate.reading.aphasiaReadingImpairedSeconds", control: "law.rate.reading.aphasiaControlsSeconds", sameStudy: true, timed: true },
};

/** A population's measured rate and its ratio to a control, from the registered sources. */
export function measuredRate(population: MeasuredPopulation): MeasuredRate {
  const m = MEASURED[population];
  if (!m) throw new RangeError(`no measured rate for "${population}"`);
  const rate = param(m.rate);
  const control = param(m.control);
  const timed = m.timed === true;
  return { channel: m.channel, rate, control, sameStudyControl: m.sameStudy, timed, ratio: timed ? control / rate : rate / control };
}
