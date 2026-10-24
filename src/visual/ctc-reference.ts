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
 * THE REFERENCE STORES RAW MEASUREMENTS, NOT METRICS OR SCORES.
 * src/data/ctc-reference-v2-*.ts holds what measurePageRaw measured on each
 * real page (research/ctc-reference/crawl-v2.ts): counts, length histograms
 * and geometry, before any normaliser. The curve is derived from them through
 * deriveMetrics and the live chain, so a change to a chain constant OR to a
 * page-metric normaliser moves the curve with it. The first reference
 * (2026-10-22, research/ctc-reference/v1/) stored normalised metrics, so a
 * changed normaliser could not reach it. The constants that decide what is
 * counted at all (PAGE_METRICS_MEASURE_IDS) are recorded with the data, and a
 * live value that differs is refused: a stored measurement cannot follow them.
 * For the same reason every record must be the raw layout this build measures
 * (RAW_PAGE_FORMAT, 2: prose counted once, language pickers not read as the
 * page's script); decodeReferenceRaw refuses any other.
 *
 * WHAT IS IN IT. About 500 graded pages from three sampling frames (the v1
 * brand list, a random draw from a dated Tranco top-sites list, government and
 * nonprofit directories) and six page types (landing, form, search, article,
 * help, cart), crawled direct first and through a residential proxy only where
 * the direct attempt was blocked. Every attempted page is listed with its
 * outcome (referenceOutcomes), graded or not.
 *
 * WEIGHTING. Every graded page counts once. The crawl's quotas, not the
 * curve, balance frames and types: each frame stopped at about a third of the
 * pages and each inner type at a cap, so the counts are near balance by
 * construction, and "ranked among N real pages" stays literally true.
 * Weighting cells equally would let a handful of cart pages carry as much
 * weight as the landing pages and widen every interval for it.
 *
 * POOLED OVER PERSONAS, so persona differences survive the mapping. One curve
 * per persona would rank every persona against itself: an elderly user and a
 * power user on the same page would both land near their own median and the
 * difference the tool exists to report would be gone.
 *
 * UNCERTAINTY. A different draw of real pages would place the same raw cost at
 * a somewhat different percentile. bootstrapPercentileInterval measures that:
 * it resamples PAGES (each with all its personas, since a page's personas are
 * not independent draws) and reports, for any raw cost, the central interval
 * of its percentile across the resamples. It says nothing about whether the
 * chain's costs are right; only how firmly the yardstick is fixed.
 *
 * This module holds the data, the population and the curve arithmetic. The
 * chain (cognitive-transport-chain.ts) builds and caches the curves, because
 * only it can compute a raw cost; nothing here imports it.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { brotliDecompressSync } from "node:zlib";
import { CTC_REFERENCE_META, CTC_REFERENCE_PAGES, CTC_REFERENCE_RAW } from "../data/ctc-reference-v2-2026-10-24.js";
import { BUILTIN_PERSONAS, ACCESSIBILITY_PERSONAS, EMOTIONAL_PERSONAS } from "../personas.js";
import { bridgeCapacityTraits } from "./cognitive-models.js";
import { RAW_PAGE_FORMAT, deriveMetrics, type ExtractedPageMetrics, type MetricScope, type RawPageMeasurement } from "./cognitive-transport.js";
import { param } from "./model-provenance.js";
import { PAGE_METRICS_MEASURE_IDS } from "./provenance/page-metrics.js";

export type ReferenceFrame = "brand" | "tranco" | "public";
export type ReferencePageType = "landing" | "form" | "search" | "article" | "help" | "cart";
export type ReferenceOutcome = "graded" | "blocked" | "error" | "excluded" | "robots";

/** One attempted page. The list of them is the published outcome list, graded or not. */
export interface ReferencePageRecord {
  frame: ReferenceFrame;
  site: string;
  /** brand: the v1 industry; tranco: from the top-level domain; public: government level or nonprofit. */
  sector: string;
  pageType: ReferencePageType;
  url: string;
  /** How an inner page was found from its landing page (research/ctc-reference/discover.ts). */
  how?: string;
  outcome: ReferenceOutcome;
  /** Why a page is not graded: the block, the error, the exclusion or the robots.txt rule. */
  detail?: string;
  /** The route of the final attempt: direct, or proxy after a blocked direct attempt. */
  route?: "direct" | "proxy";
  /** route proxy only: what the direct attempt before it was classified as ("blocked: ..."). */
  proxiedBecause?: string;
  /** The robots.txt decision for this URL. */
  robots: string;
  /** Bytes over the wire for all attempts, and for the proxy attempt alone. */
  bytes: number;
  proxyBytes: number;
  finalUrl?: string;
  /** tranco: the domain's rank and its band; public: the directory it came from. */
  rank?: number;
  band?: string;
  source?: string;
}

export interface ReferenceMeta {
  id: string;
  crawledOn: string;
  viewport: { width: number; height: number };
  scopes: MetricScope[];
  cbrowserVersion: string;
  gitHead: string;
  measurementCode: string;
  source: string;
  crawlNote: string;
  note: string;
  weighting: string;
  /** PAGE_METRICS_MEASURE_IDS as they were when the pages were measured. */
  measureParams: Record<string, number>;
  frames: Array<{ id: ReferenceFrame; description: string; sitesListed: number; sitesTaken: number; [k: string]: unknown }>;
  outcomes: { attempted: number; graded: number; blocked: number; error: number; excluded: number; robots: number };
  proxy: { region: string; pages: number; bytes: number; budgetBytes: number; budgetExhausted: boolean };
  /** Bytes over the wire for the whole crawl, both routes. */
  bytes: number;
}

const META: ReferenceMeta = CTC_REFERENCE_META;
const PAGES: readonly ReferencePageRecord[] = CTC_REFERENCE_PAGES;

/** Where the reference came from: everything about the dataset except the pages. */
export const CTC_REFERENCE = Object.freeze({ ...META });

/** Every attempted page with its outcome, graded or not, so the exclusions stay visible. */
export function referenceOutcomes(): ReferencePageRecord[] {
  return PAGES.map((p) => ({ ...p }));
}

let rawCache: Array<Record<MetricScope, RawPageMeasurement>> | null = null;

/**
 * Decode a reference's packed raw measurements (brotli JSON, base64) and
 * check them: one record per graded page, each scope a record of the layout
 * this build measures (RAW_PAGE_FORMAT). A record of another layout is
 * refused, not derived: a format-1 record counts nested prose again and reads
 * some language pickers as CJK, so ranking a live page against it would rank
 * one measurement against another.
 */
/** What format 2 adds to format 1; a record without any of them is not format 2. */
const FORMAT_2_FIELDS = ["prose", "proseNested", "proseInNav", "navGroupCount", "navLinks", "groupedLinks", "groupedLinksWithText", "choiceNested"] as const;

export function decodeReferenceRaw(packed: string, graded: number, id: string): Array<Record<MetricScope, RawPageMeasurement>> {
  const decoded = JSON.parse(brotliDecompressSync(Buffer.from(packed, "base64")).toString("utf8")) as Array<Record<string, { format?: unknown }>>;
  if (decoded.length !== graded) {
    throw new Error(`ctc reference ${id}: ${decoded.length} raw measurements for ${graded} graded pages`);
  }
  decoded.forEach((page, i) => {
    for (const scope of META.scopes) {
      const record = page[scope] as Record<string, unknown> | undefined;
      const format = record?.format;
      if (format !== RAW_PAGE_FORMAT) {
        throw new Error(`ctc reference ${id}: graded page ${i} ${scope} is raw format ${String(format)}; this build measures and ranks against format ${RAW_PAGE_FORMAT}. Re-crawl the reference (research/ctc-reference/crawl-v2.ts) rather than mixing layouts.`);
      }
      // Format 2 gained its nav totals, proseInNav and groupedLinksWithText
      // before it left the branch it was made on, so an early format-2 record
      // (crawled 2026-10-23 from fd28165, eaf3b36 or 711f0b4) carries the
      // number without them: refused by its fields, not its number.
      const missing = FORMAT_2_FIELDS.filter((k) => !(k in record!));
      if (missing.length) {
        throw new Error(`ctc reference ${id}: graded page ${i} ${scope} is raw format ${RAW_PAGE_FORMAT} without ${missing.join(", ")}; re-crawl the reference (research/ctc-reference/crawl-v2.ts).`);
      }
    }
  });
  return decoded as unknown as Array<Record<MetricScope, RawPageMeasurement>>;
}

/**
 * The graded pages' raw measurements, in outcome-list order, decoded once.
 * Shipped brotli-compressed (base64 in a TS module, so it loads on every Node
 * the package supports); the decoded count must equal the graded count.
 */
function rawPages(): Array<Record<MetricScope, RawPageMeasurement>> {
  if (!rawCache) {
    const graded = PAGES.filter((p) => p.outcome === "graded").length;
    if (graded !== META.outcomes.graded) {
      throw new Error(`ctc reference ${META.id}: ${graded} graded pages listed, meta says ${META.outcomes.graded}`);
    }
    rawCache = decodeReferenceRaw(CTC_REFERENCE_RAW, graded, META.id);
  }
  return rawCache;
}

/**
 * Refuse to derive the reference under a measure-stage constant other than
 * the one its pages were measured with. Reads each through param(), so a curve
 * built under withProvenance records that it rests on them.
 */
function assertMeasuredWith(): void {
  for (const id of PAGE_METRICS_MEASURE_IDS) {
    const live = param(id);
    const at = META.measureParams[id];
    if (live !== at) {
      throw new Error(`${id} is applied while a page is measured; the reference ${META.id} was measured with ${at}, not ${live}. A stored measurement cannot follow it: re-crawl the reference (research/ctc-reference/crawl-v2.ts) to change it.`);
    }
  }
}

/**
 * The graded pages' raw measurements at one scope, in dataset order. Blocked,
 * error, excluded and robots-disallowed pages are absent measurements and are
 * never part of the reference: a bot challenge measures as a nearly empty
 * page and would rank as the easiest page on the web.
 */
export function referenceRaw(scope: MetricScope): RawPageMeasurement[] {
  if (!META.scopes.includes(scope)) throw new Error(`ctc reference ${META.id} carries no ${scope} measurements`);
  assertMeasuredWith();
  return rawPages().map((p, i) => {
    const m = p[scope];
    if (!m || m.scope !== scope) throw new Error(`ctc reference ${META.id}: graded page ${i} has no ${scope} measurement`);
    return m;
  });
}

/** The graded pages' metrics at one scope, derived from their raw measurements under the live constants. */
export function referencePages(scope: MetricScope): ExtractedPageMetrics[] {
  return referenceRaw(scope).map(deriveMetrics);
}

/** The graded pages' records, in the order referenceRaw returns their measurements. */
export function referenceGraded(): ReferencePageRecord[] {
  return PAGES.filter((p) => p.outcome === "graded").map((p) => ({ ...p }));
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

export function percentileCurve(samples: ArrayLike<number>): PercentileCurve {
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

/**
 * The bootstrap interval of the percentile, precomputed on a grid of raw costs.
 *
 * At each grid cost the interval is the central `level` share of the cost's
 * percentile across `replicates` resamples of the reference pages; between
 * grid costs both ends are interpolated linearly. Below the lowest reference
 * cost every resample says 0 and above the highest every one says 1, so the
 * interval collapses there to the point.
 */
export interface PercentileInterval {
  /** Grid raw costs, strictly increasing, from the lowest reference cost to the highest. */
  readonly xs: Float64Array;
  readonly lo: Float64Array;
  readonly hi: Float64Array;
  readonly replicates: number;
  readonly level: number;
}

/** A small, fast, seeded generator (mulberry32): the same seed gives the same resamples on every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The type-7 quantile of sorted values (numpy's default), the inverse of percentileCurve. */
function quantileSorted(sorted: ArrayLike<number>, q: number): number {
  const h = q * (sorted.length - 1);
  const f = Math.floor(h);
  const c = Math.min(sorted.length - 1, f + 1);
  return sorted[f] + (h - f) * (sorted[c] - sorted[f]);
}

/**
 * Bootstrap over PAGES. `costs` is page-major: page i's costs for every
 * persona sit at [i * perPage, (i + 1) * perPage). A resample draws as many
 * pages as there are, with replacement, and keeps each drawn page's costs for
 * all personas together, because a page's personas share the page and are
 * not independent draws. A grid cost's percentile in a resample is its
 * mid-rank share of the resampled costs (below, plus half of the ties), which
 * differs from the interpolated curve by at most one sample's share.
 *
 * Cost: grid x pages x replicates additions (101 x 500 x 1000 is about 50
 * million), once per curve build.
 */
export function bootstrapPercentileInterval(
  costs: Float64Array,
  perPage: number,
  opts: { replicates: number; seed: number; level: number; grid: number },
): PercentileInterval {
  const N = costs.length;
  const n = N / perPage;
  if (!Number.isInteger(n) || n < 2) throw new Error(`bootstrapPercentileInterval: ${N} costs are not whole pages of ${perPage}`);
  const B = opts.replicates;
  const sorted = Float64Array.from(costs).sort();
  // The grid: the pooled sample's quantiles at even steps, duplicates dropped.
  const gridXs: number[] = [];
  for (let g = 0; g < opts.grid; g++) {
    const x = quantileSorted(sorted, g / (opts.grid - 1));
    if (gridXs.length === 0 || x > gridXs[gridXs.length - 1]) gridXs.push(x);
  }
  const G = gridXs.length;
  // Per page and grid cost: twice the costs below it plus the ties, so a sum
  // over drawn pages divided by twice the sample size is the mid-rank share.
  const D = new Int32Array(n * G);
  const page = new Float64Array(perPage);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < perPage; j++) page[j] = costs[i * perPage + j];
    page.sort();
    let below = 0;
    for (let g = 0; g < G; g++) {
      const x = gridXs[g];
      while (below < perPage && page[below] < x) below++;
      let ties = 0;
      while (below + ties < perPage && page[below + ties] === x) ties++;
      D[i * G + g] = 2 * below + ties;
    }
  }
  const rng = mulberry32(opts.seed);
  const F = new Float64Array(G * B);
  const acc = new Int32Array(G);
  const twoN = 2 * N;
  for (let b = 0; b < B; b++) {
    acc.fill(0);
    for (let k = 0; k < n; k++) {
      const off = Math.floor(rng() * n) * G;
      for (let g = 0; g < G; g++) acc[g] += D[off + g];
    }
    for (let g = 0; g < G; g++) F[g * B + b] = acc[g] / twoN;
  }
  const lo = new Float64Array(G);
  const hi = new Float64Array(G);
  const tail = (1 - opts.level) / 2;
  for (let g = 0; g < G; g++) {
    const reps = F.subarray(g * B, (g + 1) * B).sort();
    lo[g] = quantileSorted(reps, tail);
    hi[g] = quantileSorted(reps, 1 - tail);
  }
  return { xs: Float64Array.from(gridXs), lo, hi, replicates: B, level: opts.level };
}

/**
 * The interval at raw cost x, for the point estimate p = percentileAt(curve, x).
 * Interpolated between grid costs; [0, 0] below the reference and [1, 1]
 * above it; widened if needed to contain p, which the mid-rank resamples can
 * miss by at most one sample's share. NaN in, [NaN, NaN] out.
 */
export function intervalAt(iv: PercentileInterval, x: number, p: number): [number, number] {
  if (Number.isNaN(x) || Number.isNaN(p)) return [Number.NaN, Number.NaN];
  const { xs } = iv;
  const last = xs.length - 1;
  if (x < xs[0]) return [0, 0];
  if (x > xs[last]) return [1, 1];
  let k = 0, top = last;
  while (top - k > 1) {
    const mid = (k + top) >> 1;
    if (xs[mid] <= x) k = mid;
    else top = mid;
  }
  const t = top === k ? 0 : (x - xs[k]) / (xs[top] - xs[k]);
  const lo = iv.lo[k] + t * (iv.lo[top] - iv.lo[k]);
  const hi = iv.hi[k] + t * (iv.hi[top] - iv.hi[k]);
  return [Math.min(lo, p), Math.max(hi, p)];
}
