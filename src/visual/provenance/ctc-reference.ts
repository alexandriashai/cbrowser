/**
 * Provenance entries for the reference set totalCTC is ranked against
 * (../ctc-reference.ts, src/data/ctc-reference-v2-2026-10-22.ts), and for the
 * bootstrap interval reported beside it.
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
const GRADED = 16;

const DATASET =
  "src/data/ctc-reference-v2-2026-10-22.ts: raw measurements (measurePageRaw) of real pages crawled 2026-10-22 by research/ctc-reference/crawl-v2.ts " +
  "with cbrowser's own browser at 1920x1080, from three frames (the v1 brand list; a seeded random draw from Tranco list 746PX across four rank bands; " +
  "government and nonprofit sites from CISA's .gov registry, USAGov's state pages and Wikidata) and six page types (landing, form, search, article, help, cart), " +
  "direct first and through a residential proxy only where the direct attempt was blocked. Blocked, failed, excluded and robots-disallowed pages carry no " +
  "measurement and are excluded; the blocked ones are a selection effect: the reference is the web that lets cbrowser's browser in, not the web";

const POOL =
  "Each graded page's metrics are derived from its raw measurement under the live page-metric constants, scored through the live chain for all 25 built-in " +
  "human personas (built as cognitive_effort builds them, no site model), and the raw costs are pooled into one distribution per option set, every page " +
  "counted once; totalCTC is the linear-interpolated percentile of rawCTC in it";

export const CTC_REFERENCE_PROVENANCE: ProvenanceEntry[] = [
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
