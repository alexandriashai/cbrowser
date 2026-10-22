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
    id: "distance.simplexFloor",
    value: 0.01,
    status: "definition",
    source:
      "numerical floor applied to every trait before normalising to the simplex; a pure encoding choice " +
      "(the exact W1 solver accepts zero atoms) kept because the trait<->distribution round trip and " +
      "tests/cognitive-interpolate.test.ts pin it; carries no claim about people",
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
