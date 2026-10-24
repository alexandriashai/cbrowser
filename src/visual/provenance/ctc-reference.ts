/**
 * Provenance entries for the reference set totalCTC is ranked against
 * (../ctc-reference.ts, src/data/ctc-reference-v2-2026-10-24.ts), for the
 * bootstrap interval reported beside it, and for the numbers defined on that
 * percentile: the verdict band cut points (ctcBands.*) and the ideal-profile
 * caps (idealProfiles.maxCTC.*), below.
 *
 * Status `definition`, not `fitted`. The percentile DEFINES the scale of
 * totalCTC: "how this page's cost ranks among real pages for the built-in
 * personas". Nothing is estimated against a target, so there is no held-out
 * score to report and `fitted` would claim a calibration that does not exist.
 * The pages are measured, but measuring the yardstick does not validate what
 * it measures: the chain's constants stay hypotheses, and a percentile of an
 * untested cost is an untested cost, ranked.
 *
 * The page-count entries' value is the number of graded reference pages at
 * that scope. The chain reads it on every score and refuses to rank against a
 * shipped reference whose page count differs, so the registry cannot describe
 * one dataset while the code ranks against another.
 *
 * The interval entries are settings of a resampling procedure, not claims
 * about people: how many resamples, which seed, which central share, and how
 * finely the interval is precomputed. They are definitions for the same
 * reason the reference is.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { ProvenanceEntry } from "../model-provenance.js";

/** Graded pages in the shipped reference; both scopes measure the same pages. */
const GRADED = 514;

const DATASET =
  "src/data/ctc-reference-v2-2026-10-24.ts: raw measurements (measurePageRaw, raw format 2) of real pages crawled 2026-10-24 by research/ctc-reference/crawl-v2.ts " +
  "with cbrowser's own browser at 1920x1080, from three frames (the v1 brand list; a seeded random draw from Tranco list 746PX across four rank bands; " +
  "government and nonprofit sites from CISA's .gov registry, USAGov's state pages and Wikidata) and six page types (landing, form, search, article, help, cart), " +
  "direct first and through a residential proxy only where the direct attempt was blocked. Blocked, failed, excluded and robots-disallowed pages carry no " +
  "measurement and are excluded; the blocked ones are a selection effect: the reference is the web that lets cbrowser's browser in, not the web";

const POOL =
  "Each graded page's metrics are derived from its raw measurement under the live page-metric constants, scored through the live chain for all 25 built-in " +
  "human personas (built as cognitive_effort builds them, no site model), and the raw costs are pooled into one distribution per option set, every page " +
  "counted once; totalCTC is the linear-interpolated percentile of rawCTC in it";

const REFERENCE: ProvenanceEntry[] = [
  {
    id: "ctcReference.viewport",
    value: GRADED,
    status: "definition",
    source: `${DATASET}; measured at viewport scope (the first screen, before scrolling). ${POOL}. A definition of the score's scale, not a fit: no target, no held-out score.`,
  },
  {
    id: "ctcReference.full_page",
    value: GRADED,
    status: "definition",
    source: `${DATASET}; measured at full_page scope (the whole document, after the lazy-content walk). ${POOL}. A definition of the score's scale, not a fit: no target, no held-out score.`,
  },
  {
    id: "ctcReference.interval.replicates",
    value: 1000,
    status: "definition",
    source: "Bootstrap resamples behind totalCTCInterval. Each draws as many reference pages as there are, with replacement, keeping a page's personas together (pages are the sampling unit). 1,000 is the usual count for a percentile interval; a setting of the procedure, not a model claim.",
  },
  {
    id: "ctcReference.interval.seed",
    value: 20261022,
    status: "definition",
    source: "Seed of the bootstrap's random draws, so the same reference gives the same interval on every run and machine; a setting of the procedure, not a model claim.",
  },
  {
    id: "ctcReference.interval.level",
    value: 0.95,
    status: "definition",
    source: "Central share of the resampled percentiles totalCTCInterval reports (2.5th to 97.5th): a choice of how wide an interval to report, not a model claim.",
  },
  {
    id: "ctcReference.interval.grid",
    value: 101,
    status: "definition",
    source: "Raw costs at which the interval is precomputed: the pooled reference's quantiles at every percentile point (0, 0.01, ..., 1), interpolated between, so a score pays a binary search rather than a bootstrap. A resolution choice, not a model claim.",
  },
];

const BAND =
  "A cut point on totalCTC, the reference percentile, naming the band a verdict reports (../ctc-bands.ts). Chosen as a convention, " +
  "not fitted: it marks a rank among the reference (page, persona) pairs, and makes no claim about how a person experiences the page, " +
  "which the CTC has not been tested against";

/**
 * The verdict bands: fixed cut points on the percentile, so a verdict states a
 * rank ("costlier than 87% of the real pages we measured; band: high"), never a
 * comfort claim. `definition`: a choice of where to draw lines on a scale the
 * reference already defines, with nothing estimated.
 */
const BANDS: ProvenanceEntry[] = [
  { id: "ctcBands.upperHalf", value: 0.5, status: "definition", source: `${BAND}. Below it: lower half; from it: upper half (the median).` },
  { id: "ctcBands.high", value: 0.8, status: "definition", source: `${BAND}. From it: high.` },
  { id: "ctcBands.top", value: 0.95, status: "definition", source: `${BAND}. From it: the top 5% band.` },
];

const IDEAL =
  "Hand-set cap on totalCTC in this persona's ideal profile (../../ideal-profiles.ts), compared in the ideal-profile gap score " +
  "(ideal-profiles-gap.ts; a library API no tool calls). Set when totalCTC was a logistic of rawCTC (slope 2.5, centre 1.2) and kept at the " +
  "same number on the percentile scale, so its meaning changed in 21.x: it is now the percentile of the reference the page must not exceed. " +
  "On the logistic, 0.5 / 0.6 / 0.7 / 0.8 sat at rawCTC 1.20 / 1.36 / 1.54 / 1.76, which rank at 0.90 / 0.93 / 0.96 / 0.97 among real " +
  "first screens and 0.58 / 0.66 / 0.74 / 0.81 among whole pages (research/ctc-21-deltas.md), so every cap is far stricter now at viewport " +
  "scope and somewhat stricter at full_page. Task completion or abandonment measured for this " +
  "persona on pages either side of the cap would test it";

/**
 * The ideal-profile caps on totalCTC (IDEAL_PROFILES[].thresholds.maxCTC),
 * read through param() so the profile and the registry cannot disagree.
 * Hypotheses: nothing ties any of them to an outcome.
 */
const IDEAL_PROFILE_CAPS: ProvenanceEntry[] = ([
  ["cognitive-adhd", 0.6],
  ["autism-spectrum", 0.7],
  ["motor-impairment-tremor", 0.8],
  ["first-timer", 0.8],
  ["impatient-user", 0.5],
  ["elderly-user", 0.7],
  ["low-vision-magnified", 0.8],
  ["dyslexic-user", 0.7],
] as const).map(([persona, value]) => ({
  id: `idealProfiles.maxCTC.${persona}`,
  value,
  status: "hypothesis" as const,
  source: `${IDEAL}.`,
}));

/**
 * Everything defined on the reference percentile: the reference itself, the
 * verdict bands cut on it, and the ideal-profile caps compared against it.
 * One export, so model-provenance.ts merges all three with one import.
 */
export const CTC_REFERENCE_PROVENANCE: ProvenanceEntry[] = [...REFERENCE, ...BANDS, ...IDEAL_PROFILE_CAPS];
