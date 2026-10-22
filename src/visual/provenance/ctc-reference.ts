/**
 * Provenance entries for the reference set totalCTC is ranked against
 * (../ctc-reference.ts, src/data/ctc-reference-2026-10-22.ts).
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

export const CTC_REFERENCE_PROVENANCE: ProvenanceEntry[] = [
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
