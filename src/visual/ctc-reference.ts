/**
 * The reference set totalCTC is ranked against, and the curve that ranks it.
 *
 * WHAT totalCTC IS, as of 21.x: a percentile. A page's raw transport cost for
 * a persona, placed among the raw costs of real pages for the built-in
 * personas. 0.5 is the pooled median of the reference; 0.9 is costlier than
 * nine in ten (page, persona) pairs in it; 1 is at least as costly as the
 * costliest one.
 *
 * Until 21.x it was a logistic of the raw cost with a hand-set slope (2.5) and
 * centre (1.2). Neither number was tied to anything, and on real pages it used
 * little of its range: at viewport scope half of all (page, persona) scores sat
 * between 0.055 and 0.133 and the logistic's floor at raw 0 was 0.047, so "0.2"
 * read as low while it was costlier than most real first screens
 * (research/ctc-21-deltas.md). A percentile has no free constant to set; its
 * scale is the reference set, which is named and shipped.
 *
 * THE REFERENCE STORES METRICS, NOT SCORES. src/data/ctc-reference-*.ts
 * holds what extractPageMetrics measured on each real page
 * (research/ctc-reference/crawl.ts). The curve is derived from those metrics
 * through the live chain, so a change to any chain constant moves the curve
 * with it rather than leaving the score ranked against costs a retired chain
 * computed.
 *
 * POOLED OVER PERSONAS, so persona differences survive the mapping. One curve
 * per persona would rank every persona against itself: an elderly user and a
 * power user on the same page would both land near their own median and the
 * difference the tool exists to report would be gone.
 *
 * This module holds the data, the population and the curve arithmetic. The
 * chain (cognitive-transport-chain.ts) builds and caches the curves, because
 * only it can compute a raw cost; nothing here imports it.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { CTC_REFERENCE_DATA } from "../data/ctc-reference-2026-10-22.js";
import { BUILTIN_PERSONAS, ACCESSIBILITY_PERSONAS, EMOTIONAL_PERSONAS } from "../personas.js";
import { bridgeCapacityTraits } from "./cognitive-models.js";
import type { MetricScope } from "./cognitive-transport.js";
import type { PageMetrics } from "./cognitive-transport-chain.js";

type Outcome = "graded" | "blocked" | "error";

export interface ReferencePageRecord {
  site: string;
  url: string;
  industry: string;
  outcome: Outcome;
  finalUrl?: string;
  detail?: string;
  measuredViewport?: { w: number; h: number };
  metrics?: Record<MetricScope, ReferenceMetrics>;
}

/** extractPageMetrics' output as stored: the chain's inputs plus the fields it reports beside them. */
export type ReferenceMetrics = PageMetrics & { pageScreens?: number; choiceCountRaw?: number; choiceCountCapped?: boolean };

export interface ReferenceDataset {
  id: string;
  crawledOn: string;
  viewport: { width: number; height: number };
  scopes: MetricScope[];
  cbrowserVersion: string;
  gitHead: string;
  measurementCode?: string;
  source: string;
  outcomes: { attempted: number; graded: number; blocked: number; error: number };
  crawlNote?: string;
  note: string;
  pages: ReferencePageRecord[];
}

const DATA: ReferenceDataset = CTC_REFERENCE_DATA;

/** Where the reference came from: everything about the dataset except the pages. */
export const CTC_REFERENCE = Object.freeze({
  id: DATA.id,
  crawledOn: DATA.crawledOn,
  viewport: DATA.viewport,
  scopes: DATA.scopes,
  cbrowserVersion: DATA.cbrowserVersion,
  gitHead: DATA.gitHead,
  measurementCode: DATA.measurementCode,
  source: DATA.source,
  outcomes: DATA.outcomes,
  crawlNote: DATA.crawlNote,
});

/** Every attempted site with its outcome, graded or not, so the exclusions stay visible. */
export function referenceOutcomes(): Array<{ url: string; outcome: Outcome; detail?: string }> {
  return DATA.pages.map((p) => ({ url: p.url, outcome: p.outcome, ...(p.detail ? { detail: p.detail } : {}) }));
}

/**
 * The graded pages' metrics at one scope, in dataset order. Blocked and error
 * pages are absent measurements and are never part of the reference: a bot
 * challenge measures as a nearly empty page and would rank as the easiest page
 * on the web.
 */
export function referencePages(scope: MetricScope): PageMetrics[] {
  if (!DATA.scopes.includes(scope)) throw new Error(`ctc reference ${DATA.id} carries no ${scope} measurements`);
  const out: PageMetrics[] = [];
  for (const p of DATA.pages) {
    if (p.outcome !== "graded") continue;
    const m = p.metrics?.[scope];
    if (!m) throw new Error(`ctc reference ${DATA.id}: graded page ${p.url} has no ${scope} metrics`);
    out.push(m);
  }
  return out;
}

/**
 * The built-in human personas, each built the way cognitive_effort builds it
 * with no site model: its cognitive traits, siteFamiliarity 0 (first visit),
 * and the reading, pointing and attention capacities bridged from the formal
 * models. The same 25 the golden matrix pins (tests/fixtures/ctc-golden-matrix.ts,
 * ROSTER and toolProfile); a test holds the two to each other.
 */
export function referencePopulation(): Array<{ name: string; traits: Record<string, number> }> {
  const roster = { ...BUILTIN_PERSONAS, ...ACCESSIBILITY_PERSONAS, ...EMOTIONAL_PERSONAS } as Record<
    string,
    { cognitiveTraits?: unknown; accessibilityTraits?: Record<string, number> }
  >;
  return Object.entries(roster).map(([name, p]) => {
    const traits = { ...((p.cognitiveTraits ?? {}) as Record<string, number>) };
    traits.siteFamiliarity = 0;
    bridgeCapacityTraits(name, traits, p.accessibilityTraits);
    return { name, traits };
  });
}

let populationSize: number | undefined;

/** How many personas the reference pools: the length of referencePopulation(), counted once. */
export function referencePersonaCount(): number {
  return (populationSize ??= referencePopulation().length);
}

/**
 * A piecewise-linear interpolated empirical distribution function.
 *
 * Knots sit at the distinct sample values. A knot's height is its mean
 * zero-based rank over n - 1 (ties share the mean of their ranks), which is
 * the inverse of the linear-interpolation quantile (Hyndman and Fan type 7,
 * numpy's default); the lowest knot is pinned to 0 and the highest to 1.
 * Between knots the curve is a straight line, so it is continuous and
 * Lipschitz with constant `curveSlope`: a step function would make the score
 * jump at every sample and no Wasserstein bound could cover it.
 */
export interface PercentileCurve {
  /** Distinct sample values, strictly increasing. */
  readonly xs: Float64Array;
  /** Height at each knot, strictly increasing from 0 to 1. */
  readonly ps: Float64Array;
  /** Samples the curve was built from (n, ties included). */
  readonly samples: number;
}

export function percentileCurve(samples: readonly number[]): PercentileCurve {
  const s = Float64Array.from(samples).sort();
  const n = s.length;
  for (const v of s) if (!Number.isFinite(v)) throw new Error(`percentileCurve: sample ${v} is not finite`);
  const xs: number[] = [];
  const ps: number[] = [];
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && s[j + 1] === s[i]) j++;
    xs.push(s[i]);
    ps.push((i + j) / 2 / (n - 1));
    i = j + 1;
  }
  // One distinct value has no spread to rank against, and the only curve
  // through it is a step.
  if (xs.length < 2) throw new Error(`percentileCurve: needs two distinct samples, got ${xs.length} from ${n}`);
  ps[0] = 0;
  ps[ps.length - 1] = 1;
  return { xs: Float64Array.from(xs), ps: Float64Array.from(ps), samples: n };
}

/**
 * The curve at x: 0 at or below the lowest sample, 1 at or above the highest,
 * linear between knots. NaN in, NaN out, so a broken cost is not reported as
 * a rank.
 */
export function percentileAt(curve: PercentileCurve, x: number): number {
  const { xs, ps } = curve;
  if (Number.isNaN(x)) return Number.NaN;
  const last = xs.length - 1;
  if (x <= xs[0]) return 0;
  if (x >= xs[last]) return 1;
  // Largest k with xs[k] <= x; xs[0] <= x < xs[last] holds here.
  let lo = 0, hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  return ps[lo] + ((ps[hi] - ps[lo]) * (x - xs[lo])) / (xs[hi] - xs[lo]);
}

/**
 * The largest slope of the curve over [lo, hi]: its Lipschitz constant there.
 * Outside the sampled range the curve is flat, so only segments meeting
 * [lo, hi] count. With knots close together this can be large; it is the
 * honest constant of a curve that follows the data.
 */
export function curveSlope(curve: PercentileCurve, lo = -Infinity, hi = Infinity): number {
  const { xs, ps } = curve;
  let max = 0;
  for (let k = 0; k + 1 < xs.length; k++) {
    if (xs[k + 1] < lo || xs[k] > hi) continue;
    const slope = (ps[k + 1] - ps[k]) / (xs[k + 1] - xs[k]);
    if (slope > max) max = slope;
  }
  return max;
}
