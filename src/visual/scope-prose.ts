/**
 * The sentences that describe what was measured.
 *
 * These lived inline in the tool handler as three separate ternaries testing
 * `scope === "full_page"`. When a third enum value arrived, all three fell through to
 * the viewport arm, so `scope: "sequential"` returned whole-document NUMBERS wrapped in
 * first-screen PROSE: "VIEWPORT ONLY", "the page is 6.7 screens, so most of it was not
 * measured", and an abandonment figure explained as conditional on the first screen
 * while it was conditional on the whole document.
 *
 * The criterion covering it passed. The response did state a scope and did state its
 * conditional; both statements were false. That is the same defect the scope-echo bug
 * was -- a claim satisfied by being present rather than by being true -- displaced from
 * a number into a sentence.
 *
 * Extracting them here is what makes the property assertable: a test can ask for all
 * three scopes and check they differ and that none of them claims the wrong subject.
 * Left inline, the only available check was a regex over ternaries, which would have
 * passed on any chain that happened to mention the right words.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import type { MetricScope } from "./cognitive-transport.js";

/** Every scope-dependent sentence in a cognitive_effort response. */
export interface ScopeProse {
  /** What was measured, and what that makes the numbers comparable with. */
  scopeNote: string;
  /** What the abandonment figure is conditional on. */
  abandonmentBasis: string;
  /** Noun phrase for the thing measured, e.g. "this page" / "the top of this page". */
  subject: string;
  /** True when the measurement covered the whole document rather than one screen. */
  wholeDocument: boolean;
}

export function scopeProse(scope: MetricScope | "sequential", personaName = "this persona"): ScopeProse {
  // `sequential` extracts at full_page and then scores screen by screen, so its
  // SUBJECT is the whole document. Every earlier version of this logic asked
  // `scope === "full_page"` and therefore answered "the top of this page".
  const wholeDocument = scope !== "viewport";

  if (scope === "sequential") {
    return {
      wholeDocument,
      subject: "this page",
      scopeNote:
        "SEQUENTIAL: the page is measured whole (every laid-out element, densities normalised against document area, scrolled first so lazy content exists) and then scored screen by screen, carrying capacity forward so screen 7 is scored against what screens 1-6 left. The top-level layer costs and abandonmentRisk are the WHOLE-DOCUMENT aggregate — identical to scope='full_page' — and the per-screen answers are in the `sequential` block. Not comparable with viewport-scoped numbers.",
      abandonmentBasis:
        `P(this persona's budget is exhausted | they process the ENTIRE document). This top-level figure is the WHOLE-DOCUMENT one — identical to what scope='full_page' reports — not a per-screen number. The per-screen conditionals are in the \`sequential\` block, where each screen carries its own stop hazard and \`expectedDepthScreens\` says how far ${personaName} is likely to get. For a depth answer read \`sequential\`; this figure is the envelope around it, and on a long page the envelope is the least trustworthy number in the payload.`,
    };
  }

  if (scope === "full_page") {
    return {
      wholeDocument,
      subject: "this page",
      scopeNote:
        "Whole-page measurement: every laid-out element counted, densities normalised against document area, and the page scrolled first so lazy content exists. Not comparable with viewport-scoped numbers, including every CTC this tool published before 2026-08-02.",
      abandonmentBasis:
        "P(this persona's budget is exhausted | they process the ENTIRE document). A conditional upper bound, not a prediction of observed behaviour: almost nobody reads a whole page. Deficit is summed across the whole document and compared against the blended patience and resilience this persona has left after it. Independent of totalCTC, so the two can disagree without either being wrong.",
    };
  }

  return {
    wholeDocument,
    subject: "the top of this page",
    scopeNote:
      "VIEWPORT ONLY: demand is computed from elements intersecting the first screenful. Content below the fold contributed nothing. This was the tool's undeclared behaviour until 2026-08-02 — measured on a 229-link, 8-screen page it saw 4 links and 47 words and reported LOWER cognitive load than a shorter homepage. Pass scope='full_page' to measure the whole page.",
    abandonmentBasis:
      "P(this persona's budget is exhausted ON THE FIRST SCREEN). Real and interpretable, and it ignores everything below the fold. Deficit is summed across the viewport only and compared against the blended patience and resilience this persona has left after it. Independent of totalCTC, so the two can disagree without either being wrong.",
  };
}

/** Every scope this function must answer for. Exported so a test cannot drift from it. */
export const SCOPE_PROSE_VALUES = ["viewport", "full_page", "sequential"] as const;
