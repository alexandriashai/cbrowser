/**
 * Provenance entries for the reference set totalCTC is ranked against
 * (../ctc-reference.ts, src/data/ctc-reference-2026-10-22.ts), and for the
 * numbers defined on that percentile: the verdict band cut points
 * (ctcBands.*) and the ideal-profile caps (idealProfiles.maxCTC.*), below.
 *
 * Status `definition`, not `fitted`. The percentile DEFINES the scale of
 * totalCTC: "how this page's cost ranks among real pages for the built-in
 * personas". Nothing is estimated against a target, so there is no held-out
 * score to report and `fitted` would claim a calibration that does not exist.
 * The pages are measured, but measuring the yardstick does not validate what
 * it measures: the chain's constants stay hypotheses, and a percentile of an
 * untested cost is an untested cost, ranked.
 *
 * The value is the number of graded reference pages at that scope. The chain
 * reads it on every score and refuses to rank against a shipped reference
 * whose page count differs, so the registry cannot describe one dataset while
 * the code ranks against another.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { ProvenanceEntry } from "../model-provenance.js";

const DATASET =
  "src/data/ctc-reference-2026-10-22.ts: extractPageMetrics output for the pages of research/benchmark/sites.json that loaded, " +
  "crawled 2026-10-22 by research/ctc-reference/crawl.ts with cbrowser's own browser at 1920x1080 (cbrowser 20.0.1 tree, 21.0 chain); " +
  "199 attempted, 111 graded, 77 blocked (HTTP errors and bot challenges, by cognitive_effort's own signature list, or no interactive element at all), " +
  "11 errors; blocked and error pages excluded as absent measurements. The 77 blocked are a selection effect: the reference is the web that lets " +
  "cbrowser's browser in from this server, not the web";

const POOL =
  "Each graded page is scored through the live chain for all 25 built-in human personas (built as cognitive_effort builds them, no site model) " +
  "and the raw costs are pooled into one distribution per option set; totalCTC is the linear-interpolated percentile of rawCTC in it";

const REFERENCE: ProvenanceEntry[] = [
  {
    id: "ctcReference.viewport",
    value: 111,
    status: "definition",
    source: `${DATASET}; metrics measured at viewport scope (the first screen, before scrolling). ${POOL}. A definition of the score's scale, not a fit: no target, no held-out score.`,
  },
  {
    id: "ctcReference.full_page",
    value: 111,
    status: "definition",
    source: `${DATASET}; metrics measured at full_page scope (the whole document, after the lazy-content walk). ${POOL}. A definition of the score's scale, not a fit: no target, no held-out score.`,
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
