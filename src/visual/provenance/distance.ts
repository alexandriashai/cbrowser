/**
 * Provenance entries for the persona distance's constants
 * (cognitive-transport.ts). See ../model-provenance.ts for the statuses.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { ProvenanceEntry } from "../model-provenance.js";

/**
 * The ground metric is a three-level step function over a hand-drawn grouping
 * of the 29 traits into 8 domains plus a hand-picked list of "related" domain
 * pairs (traitGroundDistance). Nothing in data backs the grouping or the
 * levels; they were chosen so that moving mass between sibling traits is
 * cheaper than moving it across the profile. What would test them: trait
 * co-variation across a measured population — if traits in the same declared
 * domain are not more correlated across people than traits in unrelated
 * domains, the grouping is wrong; the levels could then be fitted as a
 * monotone function of (1 - |correlation|) or of a learned embedding distance.
 */
const GROUND_METRIC_TEST =
  "hand-assigned domain proximity; would be tested by trait co-variation across a measured population " +
  "(same-domain pairs should correlate more than unrelated pairs) and refitted from it";

export const DISTANCE_PROVENANCE: ProvenanceEntry[] = [
  {
    id: "distance.groundSameDomain",
    value: 0.2,
    status: "hypothesis",
    source: `ground cost between two traits in the same declared domain; ${GROUND_METRIC_TEST}`,
  },
  {
    id: "distance.groundRelatedDomain",
    value: 0.5,
    status: "hypothesis",
    source: `ground cost between traits in domains listed as related; ${GROUND_METRIC_TEST}`,
  },
  {
    id: "distance.groundUnrelatedDomain",
    value: 0.8,
    status: "hypothesis",
    source: `ground cost between traits in unrelated domains, the maximum; ${GROUND_METRIC_TEST}`,
  },
  {
    id: "distance.groundUnknownTrait",
    value: 0.8,
    status: "hypothesis",
    source:
      "ground cost when either trait is outside COGNITIVE_TRAITS: set equal to the unrelated cost so an unknown " +
      "name is maximally distant rather than scored as a sibling (the 2026-07-28 phantom-vocabulary defect); " +
      "a measured population containing the unknown trait would replace it",
  },
  {
    id: "distance.slackCost",
    value: 0.4,
    status: "hypothesis",
    source:
      "cost per unit of trait mass created or destroyed in the generalized W1 (the slack bin's distance to " +
      "every trait); set to half the largest ground cost, the smallest value at which the slack-bin cost is " +
      "still a metric and creating plus destroying mass is never cheaper than transporting it between two " +
      "traits; it fixes the exchange rate between a difference in overall trait level and a difference in " +
      "profile shape. Would be tested by behavioural divergence between persona pairs that differ only in " +
      "level versus pairs that differ only in shape at matched L1 difference (e.g. task completion or " +
      "abandonment gaps on the same pages), fitting c >= 0.4 to whichever predicts the measured gaps",
  },
  {
    id: "distance.simplexFloor",
    value: 0.01,
    status: "definition",
    source:
      "numerical floor applied to every trait before normalising to the simplex; a pure encoding choice " +
      "kept because the trait<->distribution round trip and tests/cognitive-interpolate.test.ts pin it; " +
      "carries no claim about people. It no longer applies to the distance's w1: the generalized W1 reads " +
      "trait values directly (the solver accepts zero atoms), so a trait of 0 and one of 0.01 are 0.01/29 " +
      "units of mass apart. It still applies to the simplex encoding behind w2, sliced, the geodesic and " +
      "the barycenter",
  },
  {
    id: "distance.missingTraitDefault",
    value: 0.5,
    status: "hypothesis",
    source:
      "value assumed for a trait a persona does not define; claims an unmeasured trait sits at the midpoint " +
      "of its range; would be tested by the population mean of each trait among personas that do define it",
  },
];
