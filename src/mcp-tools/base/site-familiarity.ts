/**
 * The siteFamiliarity a cognitive_effort or site_cognitive_assessment run
 * scores against: the caller's value for this run if one was given, else 0.0
 * (a first visit).
 *
 * Familiarity is a persona-SITE pair, so no persona carries one (personas.ts
 * strips any stored value) and this install's site knowledge does not supply
 * one either. Site knowledge is reported alongside the score; it does not
 * change it.
 *
 * Through 20.x both tools ran a "binary gate on site knowledge": with site
 * knowledge, a stored familiarity above 0.5 was raised to 1.0; without it,
 * everyone was forced to 0.0. The raise never fired, because nothing stores a
 * familiarity. But the site-knowledge branch also left the trait unset, and the
 * chain reads an unset trait as chain.missingTraitCapacity (0.5), so crawling a
 * site moved every persona from 0.0 to 0.5 by the back door. The value is now
 * always set.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

export interface ResolvedSiteFamiliarity {
  /** The siteFamiliarity the chain scores against. */
  value: number;
  /** Where the value came from, for the response. */
  source: "supplied for this run" | "first visit (0.0): none supplied";
  /** Whether this install has crawled the site. Reported only; it does not change `value`. */
  siteKnowledgeAvailable: boolean;
}

export function resolveSiteFamiliarity(supplied: number | undefined, hasSiteKnowledge: boolean): ResolvedSiteFamiliarity {
  const fromCaller = typeof supplied === "number" && Number.isFinite(supplied);
  return {
    value: fromCaller ? supplied : 0,
    source: fromCaller ? "supplied for this run" : "first visit (0.0): none supplied",
    siteKnowledgeAvailable: hasSiteKnowledge,
  };
}
