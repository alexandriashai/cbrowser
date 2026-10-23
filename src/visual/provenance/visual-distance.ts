/**
 * Provenance for the sliced Wasserstein image distance (distance-metrics.ts):
 * the projection seed and the number of projections. See ../model-provenance.ts
 * for the statuses.
 *
 * Read through param() at call time by computeWassersteinDistance and
 * analyzePerceptualTransport, never at module load: perceptual-transport.ts
 * imports distance-metrics.ts, and the registry imports perceptual-transport.ts
 * through provenance/perceptual.ts, so a static import of the registry from
 * either file would close an import cycle.
 *
 * Both are approximation choices with no claim about people or pages, hence
 * `definition`. The sliced distance averages one-dimensional Wasserstein
 * distances over random directions; the seed fixes which directions, and the
 * count sets how closely the average approaches its expectation.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { ProvenanceEntry } from "../model-provenance.js";

export const VISUAL_DISTANCE_PROVENANCE: ProvenanceEntry[] = [
  {
    id: "visualDistance.projectionSeed",
    value: 2654435769,
    status: "definition",
    source:
      "Seed of the generator (mulberry32) that draws the sliced Wasserstein projection directions, so the same two images always "
      + "give the same distance. Until 2026-10-22 the directions came from unseeded Math.random() and identical inputs scored "
      + "differently on every call (low-vision-magnified's perceptual score 74-78 on one screenshot). Any seed draws from the same "
      + "uniform distribution of directions; this one (2^32 / golden ratio) carries no claim, and changing it moves a distance "
      + "within the spread that numProjections allows.",
  },
  {
    id: "visualDistance.numProjections",
    value: 64,
    status: "definition",
    source:
      "Number of projection directions the visual regression distance averages over (computeWassersteinDistance's default; "
      + "performWassersteinAnalysis and the smart-baseline comparison use it). An approximation budget, not a finding: more "
      + "directions bring the sliced estimate closer to its expectation at linear cost. The verdict lines in "
      + "VISUAL_DISTANCE_THRESHOLDS (regression.ts) were measured at 64.",
  },
  {
    id: "visualDistance.perceptualNumProjections",
    value: 32,
    status: "definition",
    source:
      "Number of projection directions analyzePerceptualTransport averages over when it measures what a persona's perceptual "
      + "filter removes from a screenshot (the information-loss term of empathy_audit's perceptual score). Half the visual "
      + "regression budget, set for speed; an approximation choice, not a finding.",
  },
];
