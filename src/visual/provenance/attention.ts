/**
 * Provenance entries for the attention model's constants (attention-transport.ts).
 * See ../model-provenance.ts for the statuses.
 *
 * This is the one layer with fitted numbers. research/study1/run-optimize.ts
 * fitted the blend weight, the foveal smoothing width and the spatial prior's
 * strength jointly, by nested 5-fold cross-validation over the 495 web stimuli
 * of UEyes (Jiang et al., CHI 2023) against real fixations from 554 participant
 * logs: held-out AUC-Judd 0.7367 (in-sample 0.7372, optimism gap 0.0005; all
 * five folds chose the same values; results/2026-08-04_optimize-shipconfig).
 * The spatial prior table itself was emitted by `run-optimize.ts --emit-prior`
 * from the same fixations. A full-corpus run of the shipped model scores 0.7371
 * (results/2026-08-04_semantic), in-sample because the prior and blend were
 * fitted on those pages; 0.7367 is the held-out estimate to cite.
 *
 * Everything that run did NOT vary is hand-set: the CIE-Lab channel weights
 * (wA = wB = 3 arrived by hand in f36cd88), the element-type weights, the
 * persona filters, the Schwartz-value and trait modulations. Those are
 * `hypothesis` entries naming the data that would test them. Two caveats bind
 * every one of them: UEyes is FREE VIEWING pooled over 62 people with no group
 * labels, so it cannot test a persona-specific or goal-directed constant; and
 * the fit is conditional on the hand-set numbers it held fixed.
 *
 * The CIE-Lab conversion constants are `published` (IEC 61966-2-1 sRGB, CIE
 * 1976 L*a*b*). Numerical guards, display rounding and the analysis grid are
 * `definition`.
 *
 * THE SPATIAL PRIOR IS ONE ENTRY, NOT 192. The 12x16 table stays in
 * attention-transport.ts as WEB_SPATIAL_PRIOR, and the registry carries its
 * checksum (FNV-1a over the table's IEEE-754 bytes), which applyGazeCalibration
 * reads through param() and checks on every use: edit a cell without
 * re-registering and the model throws instead of running on an unregistered
 * table. One entry because it is one fitted object, produced by one procedure
 * and normalised as a whole (peak 1, floor 0.05). 192 cell entries would make a
 * provenance summary report 192 fitted constants beside ~100 hand-set ones,
 * which reads as a model mostly calibrated when one table and three scalars are,
 * and perturbing one cell of a smoothed density is not a meaningful parameter.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { ProvenanceEntry } from "../model-provenance.js";

const f = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `attention.${id}`, value, status: "fitted", source });
const p = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `attention.${id}`, value, status: "published", source });
const d = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `attention.${id}`, value, status: "definition", source });
const h = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `attention.${id}`, value, status: "hypothesis", source });

/**
 * FNV-1a (32-bit) over the little-endian IEEE-754 bytes of `values`. The
 * checksum attention.spatialPrior.checksum is registered against. Lives here,
 * beside the registry, because its own constants (the FNV offset basis and
 * prime, from Fowler, Noll and Vo) describe a hash, not the model.
 */
export function tableChecksum(values: readonly number[]): number {
  const bytes = new Uint8Array(values.length * 8);
  const view = new DataView(bytes.buffer);
  values.forEach((v, i) => view.setFloat64(i * 8, v, true));
  let hash = 0x811c9dc5;
  for (const b of bytes) hash = Math.imul(hash ^ b, 0x01000193) >>> 0;
  return hash;
}

const UEYES_CV =
  "UEyes web category (495 stimuli, 554 Gazepoint participant logs), fitted jointly with the other two GAZE_CALIBRATION values by coordinate ascent inside nested 5-fold cross-validation (research/study1/run-optimize.ts --freeze-types): held-out AUC-Judd 0.7367, in-sample 0.7372, optimism gap 0.0005, all five folds selected this value (results/2026-08-04_optimize-shipconfig/optimize.json). Free viewing pooled over 62 people, so it is fitted for the average free viewer, not for a task or a persona.";

// What would fit a Lab channel weight.
const LAB_WEIGHT = (channel: string) =>
  `Hand-set weight of the ${channel} in the centre-surround distance. wA = wB = 3 arrived by hand in f36cd88 (2026-04-13) to make chromatic pop-out outrank luminance; run-optimize.ts held all three fixed. A sweep of the three weights on the Lab channel alone, scored against UEyes fixations under the same nested CV, would fit them.`;

// What would fit a persona-filter constant: per-population gaze, which UEyes does not have.
const FILTER = (what: string) =>
  `Hand-set ${what}. UEyes pools 62 unlabelled free viewers, so nothing in hand can fit a persona-specific filter; eye-tracking from a sample of the population the persona models (fixation dispersion and centre bias on the same pages) would fit it.`;

const VALUE_MOD = (value: string, param: string, cite: string) =>
  `Hand-set coefficient of (${value} - neutral) on the saliency ${param}. ${cite} motivates the direction only, not this number. Fixation dispersion and centre bias measured on the same pages across people with measured Schwartz ${value} scores would fit it.`;

const TYPE_WEIGHT = (type: string) =>
  `Hand-set base attention weight of a ${type} element. With the spatial prior and smoothing in place the hand-set 10x spread of these weights contributes nothing measurable: typed beats flat (every element weighted alike) on 165 of 495 UEyes pages, mean -0.0007 AUC (research/study1/results/README.md, 'The element-type weights stop mattering'). A learned table (+0.0265) was fitted and not shipped because free viewing pulls it toward body text and navigation. Fixations under a TASK on pages with labelled element types would fit it.`;

const TRAIT_MOD = (type: string, trait: string, part: string) =>
  `Hand-set ${part} of the ${type} element modifier as a function of ${trait}. Gaze share on ${type} elements across people with measured ${trait}, on the same pages, would fit it.`;

/** Fallback element modifiers by persona, used only when no cognitive traits resolve for the name. */
const STATIC_MODIFIERS: Record<string, Record<string, number>> = {
  "first-timer": { cta: 1.2, heading: 1.3, navigation: 1.2, search: 1.0, content: 0.6, decorative: 0.4 },
  "power-user": { cta: 0.6, heading: 0.5, navigation: 1.4, search: 1.5, content: 0.3, form: 1.2, decorative: 0.1 },
  "impatient-user": { cta: 1.5, heading: 1.0, navigation: 0.8, search: 1.3, content: 0.2, decorative: 0.1, price: 1.3 },
  "elderly-user": { cta: 1.0, heading: 1.4, navigation: 1.3, search: 0.8, content: 0.8, form: 0.9, decorative: 0.3 },
  "cognitive-adhd": { cta: 0.8, heading: 0.7, navigation: 0.5, image: 1.5, decorative: 1.2, content: 0.3, search: 0.6 },
  "anxious-user": { cta: 0.7, heading: 1.0, price: 1.5, error: 1.5, form: 0.8, decorative: 0.3 },
  "motor-impairment-tremor": { cta: 1.0, heading: 0.8, navigation: 0.6, form: 0.7, search: 0.9, content: 0.5 },
  "dyslexic-user": { cta: 1.1, heading: 1.3, image: 1.3, content: 0.4, navigation: 0.9, decorative: 0.5 },
  "low-vision-magnified": { cta: 1.2, heading: 1.5, navigation: 1.0, content: 0.5, image: 0.8, decorative: 0.2 },
  "mobile-user": { cta: 1.3, heading: 1.0, search: 1.2, navigation: 0.7, content: 0.4, decorative: 0.2 },
  "confident-user": { cta: 0.7, heading: 0.5, navigation: 1.3, search: 1.4, form: 1.2, content: 0.3, decorative: 0.1 },
};

/** Which element types each persona's fallback table sets, in source order. buildSemanticMap reads each through param(). */
export const ATTENTION_STATIC_MODIFIER_TYPES: Readonly<Record<string, readonly string[]>> = Object.freeze(
  Object.fromEntries(Object.entries(STATIC_MODIFIERS).map(([persona, mods]) => [persona, Object.freeze(Object.keys(mods))])),
);

/**
 * Schwartz values each text pattern rewards, in the order the boost sums them
 * (the sum is order-sensitive in floating point, so the order is the code's).
 */
const VALUE_PATTERNS: Record<string, Record<string, number>> = {
  trust: { security: 1.0, conformity: 0.5 },
  social: { conformity: 1.0, security: 0.6 },
  novelty: { stimulation: 1.0, selfDirection: 0.5 },
  metrics: { achievement: 1.0, power: 0.4 },
  urgency: { stimulation: 0.5, achievement: 0.4 },
  community: { benevolence: 0.8, universalism: 0.6 },
};

/** The values each text pattern weighs, in summation order. */
export const ATTENTION_VALUE_PATTERN_VALUES: Readonly<Record<string, readonly string[]>> = Object.freeze(
  Object.fromEntries(Object.entries(VALUE_PATTERNS).map(([pattern, vals]) => [pattern, Object.freeze(Object.keys(vals))])),
);

export const ATTENTION_PROVENANCE: ProvenanceEntry[] = [
  // ── Fitted against UEyes ──
  f("gaze.visualWeight", 0.2, `Share of the blend given to the bottom-up Lab channel (the semantic map takes the rest). ${UEYES_CV}`),
  f("gaze.sigmaCells", 2.5, `Foveal smoothing width in cells of the fitted grid (attention.gaze.cellSize, so 80 capture px). ${UEYES_CV}`),
  f("gaze.spatialPrior", 1, `Strength with which the fitted spatial prior multiplies the map (0 off, 1 full). ${UEYES_CV}`),
  f("spatialPrior.checksum", 4153505348, "Checksum (tableChecksum: FNV-1a over the IEEE-754 bytes) of WEB_SPATIAL_PRIOR in attention-transport.ts, the 12x16 position prior emitted by research/study1/run-optimize.ts --emit-prior from the UEyes web fixations (495 stimuli, 554 logs; smoothed, normalised to peak 1, floored at 0.05). Its strength (attention.gaze.spatialPrior) was chosen under nested 5-fold CV with the prior re-fitted on each training fold; the table shipped is the full-corpus fit. Ablating it in the joint fit drops AUC from 0.7371 to 0.6597 (-0.0774, optimize-shipconfig/optimize.json). Left-to-right desktop web under free viewing only: wrong for RTL, unfitted for mobile, and expected to flatten under a task. The value is a checksum, not a model number; applyGazeCalibration throws when the table no longer hashes to it."),
  f("blend.legacyVisualWeight", 0.05, "Default visual share of blendSaliencyMaps, the optimum of the 2026-08-04 morning sweep WITHOUT the spatial prior or smoothing: research/study1/run-blend-sweep.ts, 0..1 in 0.05 steps over 495 UEyes web stimuli, 5-fold CV chose 0.05 in 5 of 5 folds (AUC 0.6567, +0.0231 over 0.35, 95% CI [+0.0196, +0.0266]). Superseded for the shipped path, which passes attention.gaze.visualWeight; kept as the function's default for callers that blend without the prior."),

  // ── Units, grids and numerical guards ──
  d("gaze.cellSize", 16, "Grid cell, in pixels of the half-resolution analysis image, that every Study 1 fit ran at (run-optimize.ts and run-semantic.ts, CELL = 16). The unit gazeSigmaCells rescales sigma by, and the default grid; one cell spans 32 capture px."),
  d("spatialPrior.rows", 12, "Row count of WEB_SPATIAL_PRIOR, the resolution run-optimize.ts --emit-prior binned fixations into; part of the table's encoding, checked against its length."),
  d("spatialPrior.cols", 16, "Column count of WEB_SPATIAL_PRIOR, the resolution run-optimize.ts --emit-prior binned fixations into; part of the table's encoding, checked against its length."),
  d("lab.downscale", 0.5, "computeLabSaliency analyses the capture at half resolution, and the calibration was fitted at that scale, so a grid cell of n px spans n / 0.5 capture px. A processing resolution, not a claim; changing it moves every fitted width."),
  d("lab.fallbackWidth", 800, "Width assumed for an image whose header reports none; sharp reports dimensions for every PNG and JPEG a capture produces, so it is unreachable in the tools."),
  d("lab.fallbackHeight", 600, "Height assumed for an image whose header reports none; unreachable for the same reason as lab.fallbackWidth."),
  d("lab.channels", 4, "Bytes per pixel of the RGBA buffer sharp returns after ensureAlpha(); the last byte is alpha."),
  d("lab.varianceFloor", 0.01, "Floor on each cell's per-channel Lab variance (0.1 Lab units of SD), so a flat cell's spread is defined. A numerical guard; it does enter the variance term for flat cells, as chain.capacityEpsilon does."),
  d("normFloor", 0.001, "Smallest denominator any normalisation divides by, so a blank map divides by 0.001 instead of 0. A numerical guard."),
  d("blend.legacySemanticWeight", 0.95, "Complement of attention.blend.legacyVisualWeight (1 - 0.05), blendSaliencyMaps' default semantic share; it carries no claim of its own."),
  d("smooth.radiusSigmas", 3, "Truncation of the Gaussian kernel at 3 sigma, the usual numerical cut (beyond 3 sigma lies 0.27% of a 1-D Gaussian's mass). run-optimize.ts used the same cut, so the fitted sigma is conditional on it."),
  d("grid.edgeEpsilon", 1e-6, "Pixel tolerance that keeps a box ending exactly on a cell boundary out of the next cell. A numerical guard."),
  d("value.neutral", 0.5, "Midpoint of the 0-1 Schwartz-value scale. Every value modulation is zero at it, and a value the persona does not carry is taken as it, so an absent value modulates nothing. It defines 'no effect' rather than estimating anything."),
  d("hotspotPool.share", 0.05, "Share of ranked cells kept as the hotspot pool attention-quality samples elements from (see hotspotPoolSize). A sampling window for analysis; it changes no attention value."),
  d("hotspotPool.min", 200, "Lower bound of the hotspot pool, so a coarse grid still yields a usable sample. A sampling window."),
  d("hotspotPool.max", 4000, "Upper bound of the hotspot pool, so a fine grid's pool stays bounded. A sampling window."),
  d("metric.entropyEpsilon", 1e-10, "Added inside log2 when computing entropy, so a zero cell contributes 0 rather than NaN. A numerical guard."),
  d("metric.concentrationShare", 0.2, "Concentration is defined as the share of attention in the top 20% of cells; the definition of the reported metric."),
  d("report.competitors", 5, "How many hotspots are reported as attentionCompetitors; a reporting choice."),
  d("report.divergentRegions", 10, "How many divergent regions attention_compare reports; a reporting choice."),
  d("rounding.hundredths", 100, "Rounding to two decimals on reported saliency values; a display choice."),
  d("rounding.thousandths", 1000, "Rounding to three decimals on entropy, concentration, alignment and region shares; a display choice."),
  d("rounding.tenThousandths", 10000, "Rounding to four decimals on transportCost and attentionDivergence; a display choice."),

  // ── sRGB -> CIE-Lab (published) ──
  d("srgb.channelMax", 255, "Largest 8-bit channel value, mapping a byte to [0, 1]; an encoding."),
  p("srgb.linearKnee", 0.04045, "sRGB electro-optical transfer: below this encoded value the curve is linear. IEC 61966-2-1:1999 (sRGB), the encoding transfer function."),
  p("srgb.linearSlope", 12.92, "Slope of the linear segment of the sRGB transfer (C / 12.92). IEC 61966-2-1:1999 (sRGB), the encoding transfer function."),
  p("srgb.gammaOffset", 0.055, "Offset of the sRGB power segment ((C + 0.055) / 1.055)^2.4. IEC 61966-2-1:1999 (sRGB), the encoding transfer function."),
  p("srgb.gammaScale", 1.055, "Scale of the sRGB power segment. IEC 61966-2-1:1999 (sRGB), the encoding transfer function."),
  p("srgb.gamma", 2.4, "Exponent of the sRGB power segment. IEC 61966-2-1:1999 (sRGB), the encoding transfer function."),
  p("xyz.rX", 0.4124564, "Linear sRGB to CIE XYZ (D65), row X, R coefficient, as tabulated by B. Lindbloom ('RGB/XYZ Matrices', sRGB, D65) from the IEC 61966-2-1 primaries."),
  p("xyz.gX", 0.3575761, "Linear sRGB to CIE XYZ (D65), row X, G coefficient (Lindbloom, sRGB D65)."),
  p("xyz.bX", 0.1804375, "Linear sRGB to CIE XYZ (D65), row X, B coefficient (Lindbloom, sRGB D65)."),
  p("xyz.rY", 0.2126729, "Linear sRGB to CIE XYZ (D65), row Y, R coefficient (Lindbloom, sRGB D65); the Rec. 709 luminance weight."),
  p("xyz.gY", 0.7151522, "Linear sRGB to CIE XYZ (D65), row Y, G coefficient (Lindbloom, sRGB D65)."),
  p("xyz.bY", 0.072175, "Linear sRGB to CIE XYZ (D65), row Y, B coefficient (Lindbloom, sRGB D65)."),
  p("xyz.rZ", 0.0193339, "Linear sRGB to CIE XYZ (D65), row Z, R coefficient (Lindbloom, sRGB D65)."),
  p("xyz.gZ", 0.119192, "Linear sRGB to CIE XYZ (D65), row Z, G coefficient (Lindbloom, sRGB D65)."),
  p("xyz.bZ", 0.9503041, "Linear sRGB to CIE XYZ (D65), row Z, B coefficient (Lindbloom, sRGB D65)."),
  p("white.x", 0.95047, "D65 reference white Xn (2-degree observer, Y normalised to 1), ASTM E308 (D65, 2-degree: 95.047, 100.000, 108.883)."),
  p("white.y", 1, "D65 reference white Yn, the normalisation of Y. CIE 15:2004."),
  p("white.z", 1.08883, "D65 reference white Zn (2-degree observer), ASTM E308 (D65, 2-degree: 95.047, 100.000, 108.883)."),
  p("lab.epsilon", 0.008856, "CIE 1976 L*a*b*: (6/29)^3, below which f(t) is linear. CIE 15:2004, the CIE 1976 L*a*b* formulae."),
  p("lab.kappaSlope", 7.787, "CIE 1976 L*a*b*: slope (1/3)(29/6)^2 of the linear segment of f(t). CIE 15:2004, the CIE 1976 L*a*b* formulae."),
  p("lab.lScale", 116, "CIE 1976 L* = 116 f(Y/Yn) - 16; also the denominator of the linear segment's offset 16/116. CIE 15:2004."),
  p("lab.lOffset", 16, "CIE 1976 L* = 116 f(Y/Yn) - 16. CIE 15:2004."),
  p("lab.aScale", 500, "CIE 1976 a* = 500 (f(X/Xn) - f(Y/Yn)). CIE 15:2004."),
  p("lab.bScale", 200, "CIE 1976 b* = 200 (f(Y/Yn) - f(Z/Zn)). CIE 15:2004."),

  // ── Bottom-up channel (hand-set) ──
  h("lab.weightL", 1, LAB_WEIGHT("luminance difference (the unit the chroma weights are relative to)")),
  h("lab.weightA", 3, LAB_WEIGHT("a* (red-green) difference")),
  h("lab.weightB", 3, LAB_WEIGHT("b* (blue-yellow) difference")),
  h("lab.surroundRadius", 3, "Hand-set surround radius in cells (3 cells = 96 capture px on the fitted grid). run-optimize.ts held it fixed; sweeping it under the same nested CV on UEyes would fit it."),
  h("lab.alphaCutoff", 25, "Hand-set alpha below which a pixel is skipped as transparent. Never binds on an opaque screenshot; saliency on captures with transparent regions scored against gaze would test it."),

  // ── Persona perceptual filter: attention modes ──
  h("mode.centerHeavy.centerBias", 0.7, FILTER("centre-bias strength of the 'center-heavy' attention mode")),
  h("mode.motionAttracted.exponent", 0.5, FILTER("saliency exponent of the 'motion-attracted' mode (a square root, so more cells register)")),
  h("mode.textFocused.threshold", 0.2, FILTER("saliency floor of the 'text-focused' mode, below which cells are suppressed")),
  h("mode.textFocused.bias", -0.1, FILTER("global saliency bias of the 'text-focused' mode")),
  h("mode.largeElements.threshold", 0.3, FILTER("saliency floor of the 'large-elements' mode")),

  // ── Persona perceptual filter: Schwartz-value modulation ──
  h("valueMod.stimulation.exponent", -0.4, VALUE_MOD("stimulation", "exponent (negative: high stimulation disperses attention)", "Anderson 2013 (value-driven attentional capture)")),
  h("valueMod.security.bias", 0.15, VALUE_MOD("security", "global bias", "Pessoa 2009 (motivated attention)")),
  h("valueMod.security.threshold", -0.1, VALUE_MOD("security", "suppression threshold (negative: vigilance lowers it)", "Pessoa 2009")),
  h("valueMod.achievement.exponent", 0.3, VALUE_MOD("achievement", "exponent (positive: attention concentrates)", "Balcetis & Dunning 2006")),
  h("valueMod.conformity.centerBias", 0.3, VALUE_MOD("conformity", "centre bias", "F- and Z-pattern reading conventions")),
  h("valueMod.selfDirection.centerBias", -0.2, VALUE_MOD("selfDirection", "centre bias (negative: explores the periphery)", "the exploration literature")),
  h("valueMod.tradition.threshold", 0.1, VALUE_MOD("tradition", "suppression threshold", "familiar-pattern preference")),

  // ── Persona perceptual filter: clamps and processing speed ──
  h("filter.exponentMin", 0.3, FILTER("lower clamp on the saliency exponent")),
  h("filter.exponentMax", 2, FILTER("upper clamp on the saliency exponent")),
  h("filter.biasLimit", 0.3, FILTER("symmetric clamp on the global saliency bias (+/-)")),
  h("filter.thresholdMax", 0.5, FILTER("upper clamp on the suppression threshold")),
  h("filter.belowThresholdGain", 0.2, FILTER("gain applied to a cell below the suppression threshold")),
  h("filter.slowProcessingBelow", 0.8, FILTER("processing speed below which weak cells are further attenuated")),
  h("filter.speedThresholdBase", 0.3, FILTER("saliency below which a slow processor's cells are attenuated, at processing speed 1")),
  h("filter.speedThresholdSlope", 0.3, FILTER("rise of that saliency threshold per unit of processing-speed deficit")),

  // ── Semantic channel: element types ──
  h("type.cta", 1.0, TYPE_WEIGHT("call-to-action")),
  h("type.heading", 0.8, TYPE_WEIGHT("heading")),
  h("type.form", 0.7, TYPE_WEIGHT("form-field")),
  h("type.search", 0.7, TYPE_WEIGHT("search")),
  h("type.image", 0.5, TYPE_WEIGHT("image")),
  h("type.navigation", 0.4, TYPE_WEIGHT("navigation")),
  h("type.link", 0.3, TYPE_WEIGHT("link")),
  h("type.content", 0.2, TYPE_WEIGHT("body-text")),
  h("type.decorative", 0.1, TYPE_WEIGHT("decorative")),
  h("type.price", 0.9, TYPE_WEIGHT("price")),
  h("type.error", 0.9, TYPE_WEIGHT("error-message")),
  h("type.fallback", 0.2, "Hand-set weight of an element whose type is not in the table (equal to body text). The share of gaze such elements draw under a task, on pages where they are labelled, would test it."),

  // ── Semantic channel: trait-driven element modifiers ──
  h("traitMod.missingTrait", 0.5, "Trait value assumed when the persona does not carry the trait (the midpoint, as chain.missingTraitCapacity). Measured trait distributions, or refusing to modulate on an absent trait, would replace it."),
  h("traitMod.cta.base", 1.0, TRAIT_MOD("call-to-action", "patience", "value at full patience")),
  h("traitMod.cta.slope", 0.5, TRAIT_MOD("call-to-action", "patience", "rise per unit of impatience")),
  h("traitMod.search.base", 0.7, TRAIT_MOD("search", "patience", "value at full patience")),
  h("traitMod.search.slope", 0.6, TRAIT_MOD("search", "patience", "rise per unit of impatience")),
  h("traitMod.content.base", 0.2, TRAIT_MOD("body-text", "patience", "value at zero patience")),
  h("traitMod.content.slope", 0.4, TRAIT_MOD("body-text", "patience", "rise per unit of patience")),
  h("traitMod.heading.base", 0.8, TRAIT_MOD("heading", "curiosity", "value at zero curiosity")),
  h("traitMod.heading.slope", 0.4, TRAIT_MOD("heading", "curiosity", "rise per unit of curiosity")),
  h("traitMod.image.base", 0.5, TRAIT_MOD("image", "curiosity", "value at zero curiosity")),
  h("traitMod.image.slope", 0.5, TRAIT_MOD("image", "curiosity", "rise per unit of curiosity")),
  h("traitMod.navigation", 0.7, "Hand-set navigation modifier, deliberately independent of site familiarity (Alexa, 2026-08-05); 0.7 is the earlier familiarity formula at familiarity 0.5. Gaze share on navigation under a task, across first-time and returning visitors, would test whether it should vary."),
  h("traitMod.reading.threshold", 0.6, TRAIT_MOD("body-text", "readingTendency", "readingTendency above which the reading formula replaces the patience one")),
  h("traitMod.reading.base", 0.4, TRAIT_MOD("body-text", "readingTendency", "value at zero readingTendency (once above the threshold)")),
  h("traitMod.reading.slope", 0.4, TRAIT_MOD("body-text", "readingTendency", "rise per unit of readingTendency")),
  h("traitMod.error.base", 0.5, TRAIT_MOD("error-message", "selfEfficacy", "value at full self-efficacy")),
  h("traitMod.error.slope", 0.5, TRAIT_MOD("error-message", "selfEfficacy", "rise per unit of self-efficacy deficit")),
  h("traitMod.price.base", 0.5, TRAIT_MOD("price", "riskTolerance", "value at full risk tolerance")),
  h("traitMod.price.slope", 0.5, TRAIT_MOD("price", "riskTolerance", "rise per unit of risk aversion")),
  h("traitMod.decorative.base", 0.1, TRAIT_MOD("decorative", "metacognitivePlanning", "value at full planning")),
  h("traitMod.decorative.slope", 0.4, TRAIT_MOD("decorative", "metacognitivePlanning", "rise per unit of planning deficit")),
  h("traitMod.form.base", 0.5, TRAIT_MOD("form-field", "proceduralFluency", "value at zero fluency")),
  h("traitMod.form.slope", 0.3, TRAIT_MOD("form-field", "proceduralFluency", "rise per unit of fluency")),

  // ── Semantic channel: fallback modifiers by persona name ──
  ...Object.entries(STATIC_MODIFIERS).flatMap(([persona, mods]) =>
    Object.entries(mods).map(([type, value]) => h(`personaMod.${persona}.${type}`, value,
      `Hand-set ${type} modifier for ${persona}, used only when no cognitive traits resolve for that name (every built-in persona carries traits, so the shipped tools reach this only if the persona lookup fails). Gaze share on ${type} elements under a task, in a sample of the population ${persona} models, would fit it.`)),
  ),

  // ── Semantic channel: relevance and values ──
  h("relevance.gain", 2, "Hand-set gain on relevance: a fully relevant element (judge score 1, or every goal keyword matched) gets 1 + 2 = 3x weight. Gaze share on goal-relevant targets against non-targets under a stated task would fit it."),
  h("goal.minKeywordLength", 3, "Hand-set shortest goal word that counts as a keyword (shorter ones are dropped as stop-word-like). Agreement of the keyword matcher with judged relevance on a labelled set of goals would test it."),
  h("normPercentile", 0.95, "Hand-set percentile the semantic map is normalised against, so a boosted element clips instead of compressing the rest of the field. Sweeping it under the UEyes nested CV would fit it; run-optimize.ts held it fixed."),
  ...Object.entries(VALUE_PATTERNS).flatMap(([pattern, vals]) =>
    Object.entries(vals).map(([value, w]) => h(`valuePattern.${pattern}.${value}`, w,
      `Hand-set weight with which ${value} (above neutral) boosts an element whose text matches the '${pattern}' pattern. Gaze share on ${pattern}-cue elements across people with measured Schwartz ${value} scores would fit it.`)),
  ),
];
