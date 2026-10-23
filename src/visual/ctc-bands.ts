/**
 * What a verdict may say about totalCTC: its rank, and the band the rank is in.
 *
 * totalCTC is a percentile (ctc-reference.ts): rawCTC placed among the raw
 * costs of the real reference pages for the built-in personas. The cost
 * itself is untested against human data, so a sentence built on it can say
 * where a page ranks and nothing about how a person feels. Through 21.0 the
 * tools said "should handle this page comfortably", "will struggle
 * significantly" and "is likely to abandon" off fixed points on a logistic
 * nobody fitted; none of those claims had anything under it.
 *
 * The bands are fixed cut points on the percentile, registered as
 * definitions (ctcBands.*, provenance/ctc-reference.ts) and chosen as
 * conventions. Every number in a sentence is read, not typed: the page count
 * from ctcReference.<scope>, the persona count from the reference population,
 * the scope from the result.
 *
 * Abandonment is a separate quantity (a hazard of unmet demand against the
 * patience left) and borrows nothing from here.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { param } from "./model-provenance.js";
import { referencePersonaCount } from "./ctc-reference.js";
import type { MetricScope } from "./cognitive-transport.js";

/** The registered cut points, lowest first. */
export function ctcBands(): { upperHalf: number; high: number; top: number } {
  return { upperHalf: param("ctcBands.upperHalf"), high: param("ctcBands.high"), top: param("ctcBands.top") };
}

export interface CtcBand {
  /** "lower half", "upper half", "high", or "top N%" from the top cut point. */
  name: string;
  /** The band's span in percentiles, e.g. "80th-95th percentile". */
  range: string;
}

/** 1st, 2nd, 3rd, 11th, 50th ... */
function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

/** A cut point as a whole percentile, so 0.95 reads 95 and never 94.99999999999999. */
const pct = (cut: number) => Math.round(cut * 100);

/** The band a percentile falls in, or null when it is not a number. Each band includes its lower cut point. */
export function ctcBand(totalCTC: number): CtcBand | null {
  if (!Number.isFinite(totalCTC)) return null;
  const { upperHalf, high, top } = ctcBands();
  if (totalCTC >= top) return { name: `top ${pct(1 - top)}%`, range: `${ordinal(pct(top))} percentile and above` };
  if (totalCTC >= high) return { name: "high", range: `${ordinal(pct(high))}-${ordinal(pct(top))} percentile` };
  if (totalCTC >= upperHalf) return { name: "upper half", range: `${ordinal(pct(upperHalf))}-${ordinal(pct(high))} percentile` };
  return { name: "lower half", range: `below the ${ordinal(pct(upperHalf))} percentile` };
}

/** The bands in words, from the registered cut points: "below 0.5 lower half, 0.5 to 0.8 upper half, ...". */
export function ctcBandsDescription(): string {
  const { upperHalf, high, top } = ctcBands();
  const name = (t: number) => ctcBand(t)!.name;
  return `below ${upperHalf} ${name(0)}, ${upperHalf} to ${high} ${name(upperHalf)}, ${high} to ${top} ${name(high)}, ${top} and above ${name(top)}`;
}

/** floor(t x 100), the N in "costlier than N%". The 1e-9 keeps binary fractions honest: 0.29 x 100 is 28.999999999999996. */
const percentOf = (t: number) => Math.floor(t * 100 + 1e-9);

/** True when `t` is a percentile: a number within zero to one. */
export function isPercentile(t: number): boolean {
  return Number.isFinite(t) && t >= 0 && t <= 1;
}

/**
 * The rank clause for a percentile, lower-case: "costlier than N% of the real
 * pages we measured", or, at the ends, "at or below the cheapest real page we
 * measured" and "at least as costly as the costliest real page we measured".
 * `pool`, when given, follows "measured". N rounds down (percentOf). For a
 * value isPercentile accepts.
 */
export function rankStatement(t: number, pool?: string): string {
  const measured = pool ? `we measured ${pool}` : "we measured";
  if (t === 0) return `at or below the cheapest real page ${measured}`;
  if (t === 1) return `at least as costly as the costliest real page ${measured}`;
  const percent = percentOf(t);
  return `costlier than ${percent === 0 ? "under 1" : percent}% of the real pages ${measured}`;
}

/** "Band: high (80th-95th percentile)." for a percentile, "No band." otherwise. */
export function bandSentence(t: number): string {
  const band = isPercentile(t) ? ctcBand(t) : null;
  return band ? `Band: ${band.name} (${band.range}).` : "No band.";
}

export interface CtcRank {
  /** floor(totalCTC x 100): the N in "costlier than N%". Null when the cost could not be ranked. */
  percent: number | null;
  /** The band name, or null when the cost could not be ranked. */
  band: string | null;
  /** "Costlier than N% of the real pages we measured (P pages x Q personas, S scope). Band: B (R)." */
  sentence: string;
  /** The rank clause alone, lower-case, to follow "<subject> is": "costlier than N% of ... scope)". */
  statement: string;
  /** "Band: B (R)." The sentence that follows the statement. */
  bandSentence: string;
}

/**
 * The rank of one chain result among the reference, in the form every verdict
 * uses. N rounds down, so the sentence never claims a rank the page did not
 * reach. The two ends say what they are: 0 is at or below the cheapest
 * reference pair and 1 at or above the costliest, and since the percentile
 * cannot separate pages beyond either end, rawCTC is quoted to do it.
 */
export function ctcRank(result: { totalCTC: number; rawCTC: number; referenceScope: MetricScope }): CtcRank {
  const { totalCTC: t, rawCTC: raw, referenceScope: scope } = result;
  const pool = `(${param(`ctcReference.${scope}`)} pages x ${referencePersonaCount()} personas, ${scope} scope)`;
  const band = bandSentence(t);
  if (!isPercentile(t)) {
    const statement = `not rankable among the real pages we measured ${pool}: totalCTC is ${t} and rawCTC ${raw}`;
    return { percent: null, band: null, statement, bandSentence: band, sentence: `This cost is ${statement}. ${band}` };
  }
  const atEnd = t === 0 || t === 1 ? `; rawCTC ${raw.toFixed(2)} tells such pages apart` : "";
  const statement = rankStatement(t, pool) + atEnd;
  const sentence = `${statement[0].toUpperCase()}${statement.slice(1)}. ${band}`;
  return { percent: percentOf(t), band: ctcBand(t)!.name, statement, bandSentence: band, sentence };
}
