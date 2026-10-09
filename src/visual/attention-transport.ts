/**
 * Attention Transport — Saliency modeling via optimal transport
 *
 * Generates persona-specific saliency maps showing WHERE each persona's
 * attention goes on a page, using W₂ distance on CIE-Lab color distributions
 * for center-surround contrast detection.
 *
 * Based on:
 * - Klein & Frintrop (DAGM 2012): W₂ saliency on multivariate normals
 * - Bylinskii et al. (IEEE TPAMI 2019): EMD for saliency evaluation
 * - Mialon et al. (ICLR 2021): attention as optimal transport plan
 * - Sun & Li (JEI 2018): multi-scale aggregated Wasserstein saliency
 *
 * The transport plan between persona's attention prior and page's
 * saliency map reveals WHERE attention flows — richer than saliency
 * alone because it shows the mapping, not just the destination.
 *
 * @version 1.0.0
 * @since v18.28.0
 * @see https://github.com/alexandriashai/cbrowser/issues/159
 */

import { getPerceptualProfile, type PerceptualFilter } from './perceptual-transport.js';

// ── Types ──

export interface SaliencyMap {
  /**
   * Which model produced `cells`.
   *
   * "visual+semantic" — 35% centre-surround CIE-Lab saliency blended with 65%
   * DOM-semantic attention (element type x persona priority).
   * "visual-only" — the bottom-up layer alone: local colour-contrast pop-out.
   * Useful, but NOT a model of where a person looks. The fallback was silent
   * until 2026-07-29 and two of three production callers take it.
   */
  attentionModel?: "visual+semantic" | "visual-only";
  /** Saliency values per grid cell (0-1, higher = more salient) */
  cells: Float64Array;
  /** Grid dimensions */
  rows: number;
  cols: number;
  /** Image dimensions */
  width: number;
  height: number;
  /** Cell size in pixels */
  cellSize: number;
  /** Top N most salient regions */
  hotspots: Array<{
    row: number;
    col: number;
    x: number;
    y: number;
    saliency: number;
  }>;
}

export interface AttentionAnalysis {
  /** Persona name */
  persona: string;
  /** Persona-specific saliency map */
  saliencyMap: SaliencyMap;
  /** Attention alignment: how well persona's attention matches the page's intended hierarchy */
  alignmentScore: number;
  /** Attention entropy: how dispersed the persona's attention is (0=focused, 1=scattered) */
  entropy: number;
  /** Attention concentration: what fraction of attention goes to top 20% of regions */
  concentration: number;
  /** Top elements competing for attention */
  attentionCompetitors: Array<{ region: string; saliency: number }>;
  /** Transport cost from persona's attention prior to actual saliency */
  transportCost: number;
  computeTimeMs: number;
}

export interface AttentionComparisonResult {
  /** Persona A's attention analysis */
  personaA: AttentionAnalysis;
  /** Persona B's attention analysis */
  personaB: AttentionAnalysis;
  /**
   * Distance between the two saliency maps: the L1 distance between the
   * normalized maps (sum over cells of |pA - pB|), range 0..2.
   *
   * NOTE: the field was documented, and attention_compare still describes it,
   * as a Wasserstein distance. It is not one: no mass is transported between
   * cells, so moving a hotspot one cell scores the same as moving it across
   * the page. Flagged 2026-10-09, not changed here.
   */
  attentionDivergence: number;
  /** Connected regions where attention differs most, largest share first (see rankDivergentRegions). */
  divergentRegions: DivergentRegion[];
}

/**
 * One connected area where two attention maps disagree, in one direction.
 */
export interface DivergentRegion {
  /** Peak cell (largest |difference|) row/col, and its top-left in image pixels. Kept from the single-cell shape. */
  row: number;
  col: number;
  x: number;
  y: number;
  /** Bounding box of the region in image pixels. */
  bbox: { x: number; y: number; width: number; height: number };
  /** Grid cells in the region. */
  cellCount: number;
  /** Which persona gives this region MORE of its attention (decided on attentionA vs attentionB). */
  direction: "personaA" | "personaB";
  /**
   * Fraction of each persona's TOTAL attention that falls inside this region
   * (0-1). This is what direction and divergence are computed from.
   */
  attentionA: number;
  attentionB: number;
  /**
   * Mean raw saliency over the region's cells (0-1), per persona. Kept for
   * compatibility. It can point the other way from direction: a persona whose
   * map is bright everywhere has high raw saliency here and still a SMALLER
   * share of its attention here. Read attentionA/attentionB for the comparison.
   */
  saliencyA: number;
  saliencyB: number;
  /**
   * Share of attentionDivergence this region accounts for: sum of |pA - pB|
   * over its cells divided by attentionDivergence. 0..1; the shares of all
   * regions sum to at most 1, and a region that contributes more has a larger
   * share.
   */
  divergence: number;
}

/**
 * Locate where two attention maps differ, as regions rather than cells.
 *
 * Before 2026-10-09 attention_compare returned the top single cells ranked by
 * |pA - pB|. Each map is normalized over ~16,000 cells at the tool's grid, so
 * every value was ~1/16,000 and, rounded to 4 decimals, read 0.0001-0.0002:
 * a constant column, presented as the "divergence" of each region. And the
 * foveal smoothing makes neighbours near-identical, so the top five were five
 * adjacent cells of one hotspot.
 *
 * Now, on the same normalized quantity the aggregate sums:
 *   1. signed per-cell difference d = pA - pB;
 *   2. keep cells whose |d| is at least the MEAN cell's contribution
 *      (divergence / cells), falling back to every non-zero cell, so a
 *      non-zero divergence never yields no region;
 *   3. group kept cells into 8-neighbour connected components of the SAME
 *      sign, so "A looks here more" and "B looks here more" never merge;
 *   4. each region's divergence = its share of the total;
 *   5. rank by share.
 *
 * Why the mean and not the "1% of the total" floor the single-cell version
 * used: 1% of the total is the mean only at 100 cells. At the tool's grid
 * (7,500 cells on an 800x600 capture, ~16,000 at 1280x800) no cell ever reaches
 * it (measured: largest cell 0.4% of the total on a two-block fixture), so the
 * fallback fired every time and kept every non-zero cell. Regions then became
 * "everywhere A looks more" and "everywhere B looks more", each exactly half
 * the divergence, because two normalized maps differ by equal mass in each
 * direction. The mean scales with the grid.
 *
 * Pure: no image, no persona. `cellSize` is the cell's size in image pixels.
 */
export function rankDivergentRegions(
  salA: ArrayLike<number>,
  salB: ArrayLike<number>,
  rows: number,
  cols: number,
  cellSize: number,
): { divergence: number; regions: DivergentRegion[] } {
  const n = Math.min(salA.length, salB.length, rows * cols);
  let totalA = 0;
  let totalB = 0;
  for (let i = 0; i < n; i++) { totalA += salA[i]; totalB += salB[i]; }
  totalA = totalA || 1;
  totalB = totalB || 1;

  const d = new Float64Array(n);
  let divergence = 0;
  for (let i = 0; i < n; i++) {
    d[i] = salA[i] / totalA - salB[i] / totalB;
    divergence += Math.abs(d[i]);
  }
  if (!(divergence > 0)) return { divergence: 0, regions: [] };

  const floor = divergence / n;
  let keep = Array.from({ length: n }, (_, i) => d[i] !== 0 && Math.abs(d[i]) >= floor);
  if (!keep.some(Boolean)) keep = Array.from({ length: n }, (_, i) => d[i] !== 0);

  const seen = new Uint8Array(n);
  const regions: Array<DivergentRegion & { _sum: number; _peak: number; _peakIdx: number }> = [];
  for (let start = 0; start < n; start++) {
    if (!keep[start] || seen[start]) continue;
    const positive = d[start] > 0;
    const stack = [start];
    seen[start] = 1;
    let sum = 0, peak = -1, peakIdx = start, sumA = 0, sumB = 0, shareA = 0, shareB = 0, count = 0;
    let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    while (stack.length > 0) {
      const i = stack.pop()!;
      const r = Math.floor(i / cols);
      const c = i % cols;
      const abs = Math.abs(d[i]);
      sum += abs;
      sumA += salA[i];
      sumB += salB[i];
      shareA += salA[i] / totalA;
      shareB += salB[i] / totalB;
      count++;
      if (abs > peak || (abs === peak && i < peakIdx)) { peak = abs; peakIdx = i; }
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nc < 0 || nc >= cols) continue;
          const j = nr * cols + nc;
          if (j >= n || seen[j] || !keep[j] || (d[j] > 0) !== positive) continue;
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    const peakRow = Math.floor(peakIdx / cols);
    const peakCol = peakIdx % cols;
    regions.push({
      row: peakRow,
      col: peakCol,
      x: peakCol * cellSize,
      y: peakRow * cellSize,
      bbox: {
        x: minC * cellSize,
        y: minR * cellSize,
        width: (maxC - minC + 1) * cellSize,
        height: (maxR - minR + 1) * cellSize,
      },
      cellCount: count,
      direction: positive ? "personaA" : "personaB",
      attentionA: Math.round(shareA * 1000) / 1000,
      attentionB: Math.round(shareB * 1000) / 1000,
      saliencyA: Math.round((sumA / count) * 100) / 100,
      saliencyB: Math.round((sumB / count) * 100) / 100,
      divergence: Math.round((sum / divergence) * 1000) / 1000,
      _sum: sum,
      _peak: peak,
      _peakIdx: peakIdx,
    });
  }

  // Rank on the unrounded share; ties broken by peak, then position, so the
  // order is deterministic.
  regions.sort((a, b) => (b._sum - a._sum) || (b._peak - a._peak) || (a._peakIdx - b._peakIdx));
  return {
    divergence,
    regions: regions.map(({ _sum: _s, _peak: _p, _peakIdx: _i, ...r }) => r),
  };
}

// ── CIE-Lab Color Space Conversion ──

function srgbToLab(r: number, g: number, b: number): [number, number, number] {
  // sRGB to linear
  const toLinear = (c: number) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const rl = toLinear(r), gl = toLinear(g), bl = toLinear(b);

  // Linear RGB to XYZ (D65)
  const x = 0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl;
  const y = 0.2126729 * rl + 0.7151522 * gl + 0.0721750 * bl;
  const z = 0.0193339 * rl + 0.1191920 * gl + 0.9503041 * bl;

  // XYZ to Lab (D65 reference)
  const xn = 0.95047, yn = 1.0, zn = 1.08883;
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const fx = f(x / xn), fy = f(y / yn), fz = f(z / zn);

  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bLab = 200 * (fy - fz);

  return [L, a, bLab];
}

// ── Core: Center-Surround Saliency via W₂ ──

/**
 * Compute saliency map using Wasserstein-2 distance on CIE-Lab distributions.
 *
 * For each grid cell, computes the mean and variance of the Lab color distribution.
 * Saliency = W₂ distance between the cell's distribution and its surround's
 * distribution (center-surround contrast, Klein & Frintrop method).
 *
 * For Gaussian measures, W₂ has a closed-form solution:
 * BW²(N(μ₁,σ₁²), N(μ₂,σ₂²)) = ||μ₁-μ₂||² + (σ₁-σ₂)²
 */
/**
 * Exported so calibration work can obtain the PRE-filter saliency once per
 * image and then sweep persona parameters over it cheaply. Recomputing the
 * Lab pass for every parameter combination would make a grid search
 * impractical, and re-deriving it in a separate script is how the Study 1
 * Python port drifted from shipped code. (2026-07-29)
 */
export async function computeLabSaliency(
  imagePath: string,
  cellSize: number = 16,
  surroundRadius: number = 3,
): Promise<{ cells: Float64Array; rows: number; cols: number; width: number; height: number }> {
  const sharpModule: any = await import('sharp');
  const sharp = sharpModule.default ?? sharpModule;

  // Load and downscale
  const scale = 0.5;
  const img = sharp(imagePath);
  const metadata = await img.metadata();
  const width = Math.round((metadata.width || 800) * scale);
  const height = Math.round((metadata.height || 600) * scale);

  const { data } = await img
    .resize(width, height)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

  const rows = Math.ceil(height / cellSize);
  const cols = Math.ceil(width / cellSize);
  const numCells = rows * cols;

  // Compute per-cell Lab statistics (mean L, a, b and variance)
  const cellStats: Array<{ meanL: number; meanA: number; meanB: number; varL: number; varA: number; varB: number; count: number }> = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let sumL = 0, sumA = 0, sumB = 0;
      let sumL2 = 0, sumA2 = 0, sumB2 = 0;
      let count = 0;

      const yStart = row * cellSize;
      const xStart = col * cellSize;
      const yEnd = Math.min(yStart + cellSize, height);
      const xEnd = Math.min(xStart + cellSize, width);

      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          const idx = (y * width + x) * 4;
          if (pixels[idx + 3] < 25) continue; // Skip transparent

          const [L, a, b] = srgbToLab(pixels[idx], pixels[idx + 1], pixels[idx + 2]);
          sumL += L; sumA += a; sumB += b;
          sumL2 += L * L; sumA2 += a * a; sumB2 += b * b;
          count++;
        }
      }

      if (count > 0) {
        const mL = sumL / count, mA = sumA / count, mB = sumB / count;
        cellStats.push({
          meanL: mL, meanA: mA, meanB: mB,
          varL: Math.max(0.01, sumL2 / count - mL * mL),
          varA: Math.max(0.01, sumA2 / count - mA * mA),
          varB: Math.max(0.01, sumB2 / count - mB * mB),
          count,
        });
      } else {
        cellStats.push({ meanL: 0, meanA: 0, meanB: 0, varL: 0.01, varA: 0.01, varB: 0.01, count: 0 });
      }
    }
  }

  // Compute center-surround W₂ saliency for each cell
  const saliency = new Float64Array(numCells);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      const center = cellStats[idx];
      if (center.count === 0) continue;

      // Compute surround statistics (average of surrounding cells)
      let sCount = 0;
      let sMeanL = 0, sMeanA = 0, sMeanB = 0;
      let sVarL = 0, sVarA = 0, sVarB = 0;

      for (let dr = -surroundRadius; dr <= surroundRadius; dr++) {
        for (let dc = -surroundRadius; dc <= surroundRadius; dc++) {
          if (dr === 0 && dc === 0) continue; // Skip center
          const sr = row + dr, sc = col + dc;
          if (sr < 0 || sr >= rows || sc < 0 || sc >= cols) continue;
          const si = sr * cols + sc;
          const s = cellStats[si];
          if (s.count === 0) continue;

          sMeanL += s.meanL; sMeanA += s.meanA; sMeanB += s.meanB;
          sVarL += s.varL; sVarA += s.varA; sVarB += s.varB;
          sCount++;
        }
      }

      if (sCount === 0) continue;
      sMeanL /= sCount; sMeanA /= sCount; sMeanB /= sCount;
      sVarL /= sCount; sVarA /= sCount; sVarB /= sCount;

      // Bures-Wasserstein distance for 3D Gaussians (diagonal covariance)
      // BW² = w_L||ΔL||² + w_a||Δa||² + w_b||Δb||² + variance terms
      //
      // Chrominance boost: a/b channels weighted 3x relative to L.
      // This captures the preattentive "pop-out effect" where a uniquely-colored
      // item captures attention even when its luminance is similar to surroundings.
      // Without this, teal text on white scores LOWER than black text on white
      // because teal has less luminance contrast — the opposite of perceptual reality.
      const wL = 1.0;  // luminance weight
      const wA = 3.0;  // chrominance a* weight (red-green axis)
      const wB = 3.0;  // chrominance b* weight (blue-yellow axis)

      const meanDist = wL * (center.meanL - sMeanL) ** 2 +
                       wA * (center.meanA - sMeanA) ** 2 +
                       wB * (center.meanB - sMeanB) ** 2;
      const varDist = wL * (Math.sqrt(center.varL) - Math.sqrt(sVarL)) ** 2 +
                      wA * (Math.sqrt(center.varA) - Math.sqrt(sVarA)) ** 2 +
                      wB * (Math.sqrt(center.varB) - Math.sqrt(sVarB)) ** 2;

      saliency[idx] = Math.sqrt(meanDist + varDist);
    }
  }

  // Normalize to 0-1
  const maxSal = Math.max(...Array.from(saliency), 0.001);
  for (let i = 0; i < numCells; i++) saliency[i] /= maxSal;

  return { cells: saliency, rows, cols, width: width / scale, height: height / scale };
}

// ── Persona-Filtered Saliency (v18.54.0: value-driven attention) ──

/**
 * Schwartz value → saliency modulation parameters.
 *
 * Values don't just change how you process — they change WHERE you look.
 * Research basis:
 * - Motivated attention (Pessoa 2009): emotional/motivational state biases visual attention
 * - Value-driven attentional capture (Anderson 2013): reward-associated stimuli capture attention
 * - Need states alter perception (Balcetis & Dunning 2006): what you value changes what you see
 *
 * Each value modulates the saliency power curve:
 * filtered[i] = saliency[i]^exponent × (1 + bias)
 *
 * High exponent → concentrated attention (only strongest signals register)
 * Low exponent → dispersed attention (more things capture attention)
 * Positive bias → global boost (vigilant, scanning everything)
 * Negative bias → selective suppression (focused, ignoring distractors)
 */
interface ValueAttentionParams {
  /** Saliency power exponent: <1 = dispersed (notices more), >1 = concentrated (fewer things) */
  exponent: number;
  /** Global saliency bias: +boost/-suppress */
  bias: number;
  /** Center-bias strength: 0 = none, 1 = strong center focus */
  centerBias: number;
  /** Threshold floor: below this, saliency is suppressed */
  threshold: number;
}

function computeValueAttentionParams(
  filter: PerceptualFilter,
  schwartzValues?: Record<string, number>,
): ValueAttentionParams {
  // Start with the base attention mode
  let exponent = 1.0;
  let bias = 0.0;
  let centerBias = 0.0;
  let threshold = 0.0;

  // Apply categorical attention mode (legacy — still used for accessibility personas)
  switch (filter.attentionMode) {
    case 'center-heavy':
      centerBias = 0.7;
      break;
    case 'motion-attracted':
      exponent = 0.5; // square root = more things register
      break;
    case 'text-focused':
      threshold = 0.2; // suppress low-saliency distractors
      bias = -0.1;     // slightly suppress overall
      break;
    case 'large-elements':
      threshold = 0.3;
      break;
  }

  // Apply value-driven modulation (v18.54.0)
  if (schwartzValues) {
    const v = (key: string) => schwartzValues[key] ?? 0.5;

    // Stimulation: high → dispersed attention (notices novelty everywhere)
    // Anderson (2013): reward-seeking broadens attentional spotlight
    exponent -= (v('stimulation') - 0.5) * 0.4; // 0.9 stim → exponent -0.16

    // Security: high → vigilant scanning (boost everything slightly, lower threshold)
    // Pessoa (2009): threat-sensitive individuals show broadened attention
    bias += (v('security') - 0.5) * 0.15;
    threshold -= (v('security') - 0.5) * 0.1;

    // Achievement: high → focused on high-value targets (increase exponent)
    // Concentrate attention on the most salient elements, ignore distractors
    exponent += (v('achievement') - 0.5) * 0.3;

    // Conformity: high → center-biased (follows expected layout patterns)
    // F-pattern and Z-pattern readers look where convention says to look
    centerBias += (v('conformity') - 0.5) * 0.3;

    // Self-direction: high → less center-biased (explores periphery)
    centerBias -= (v('selfDirection') - 0.5) * 0.2;

    // Tradition: high → suppresses novel elements (sticks to familiar patterns)
    threshold += (v('tradition') - 0.5) * 0.1;
  }

  // Clamp values to sane ranges
  exponent = Math.max(0.3, Math.min(2.0, exponent));
  bias = Math.max(-0.3, Math.min(0.3, bias));
  centerBias = Math.max(0, Math.min(1.0, centerBias));
  threshold = Math.max(0, Math.min(0.5, threshold));

  return { exponent, bias, centerBias, threshold };
}

/**
 * Apply persona's perceptual filter + value-driven attention modulation.
 *
 * The saliency map is modified by both the persona's physical perceptual
 * constraints (attention mode) and their motivational values (what they
 * care about changes what they notice).
 */
export function applyPersonaFilter(
  saliency: Float64Array,
  rows: number,
  cols: number,
  filter: PerceptualFilter,
  schwartzValues?: Record<string, number>,
): Float64Array {
  const params = computeValueAttentionParams(filter, schwartzValues);
  const filtered = new Float64Array(saliency.length);

  const centerRow = rows / 2;
  const centerCol = cols / 2;
  const maxDist = Math.sqrt(centerRow ** 2 + centerCol ** 2);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      let s = saliency[idx];

      // Apply threshold floor
      if (s < params.threshold) {
        s *= 0.2;
      }

      // Apply power curve (exponent controls attention concentration)
      s = Math.pow(Math.max(0, s), params.exponent);

      // Apply center bias
      if (params.centerBias > 0) {
        const dist = Math.sqrt((r - centerRow) ** 2 + (c - centerCol) ** 2) / maxDist;
        s *= 1 - dist * params.centerBias;
      }

      // Apply global bias
      s *= (1 + params.bias);

      filtered[idx] = Math.max(0, s);
    }
  }

  // Apply processing speed
  if (filter.processingSpeed < 0.8) {
    const speedThreshold = 0.3 + (1 - filter.processingSpeed) * 0.3;
    for (let i = 0; i < filtered.length; i++) {
      if (filtered[i] < speedThreshold) filtered[i] *= filter.processingSpeed;
    }
  }

  // Renormalize
  const max = Math.max(...Array.from(filtered), 0.001);
  for (let i = 0; i < filtered.length; i++) filtered[i] /= max;

  return filtered;
}

// ── DOM-Based Semantic Attention Layer ──

/**
 * Element type → base attention weight.
 * These represent how inherently attention-grabbing each element type is,
 * independent of visual appearance. A search bar is visually subtle but
 * a power user looks there first.
 */
const ELEMENT_TYPE_WEIGHTS: Record<string, number> = {
  cta: 1.0,           // Calls to action — highest inherent draw
  heading: 0.8,       // Headings — structural anchors
  form: 0.7,          // Form fields — interactive, task-relevant
  search: 0.7,        // Search bars — navigation entry point
  image: 0.5,         // Images — visual anchors
  navigation: 0.4,    // Nav elements — wayfinding
  link: 0.3,          // Regular links
  content: 0.2,       // Body text
  decorative: 0.1,    // Decorative images, spacers
  price: 0.9,         // Prices — high commercial relevance
  error: 0.9,         // Error messages — demand immediate attention
};

/**
 * Persona trait → element type weight modifiers.
 * Each persona amplifies or suppresses attention to certain element types
 * based on their cognitive traits and goals.
 */
const PERSONA_ELEMENT_MODIFIERS: Record<string, Record<string, number>> = {
  "first-timer": {
    cta: 1.2, heading: 1.3, navigation: 1.2, search: 1.0, content: 0.6, decorative: 0.4,
  },
  "power-user": {
    cta: 0.6, heading: 0.5, navigation: 1.4, search: 1.5, content: 0.3, form: 1.2, decorative: 0.1,
  },
  "impatient-user": {
    cta: 1.5, heading: 1.0, navigation: 0.8, search: 1.3, content: 0.2, decorative: 0.1, price: 1.3,
  },
  "elderly-user": {
    cta: 1.0, heading: 1.4, navigation: 1.3, search: 0.8, content: 0.8, form: 0.9, decorative: 0.3,
  },
  "cognitive-adhd": {
    cta: 0.8, heading: 0.7, navigation: 0.5, image: 1.5, decorative: 1.2, content: 0.3, search: 0.6,
  },
  "anxious-user": {
    cta: 0.7, heading: 1.0, price: 1.5, error: 1.5, form: 0.8, decorative: 0.3,
  },
  "motor-impairment-tremor": {
    cta: 1.0, heading: 0.8, navigation: 0.6, form: 0.7, search: 0.9, content: 0.5,
  },
  "dyslexic-user": {
    cta: 1.1, heading: 1.3, image: 1.3, content: 0.4, navigation: 0.9, decorative: 0.5,
  },
  "low-vision-magnified": {
    cta: 1.2, heading: 1.5, navigation: 1.0, content: 0.5, image: 0.8, decorative: 0.2,
  },
  "mobile-user": {
    cta: 1.3, heading: 1.0, search: 1.2, navigation: 0.7, content: 0.4, decorative: 0.2,
  },
  "confident-user": {
    cta: 0.7, heading: 0.5, navigation: 1.3, search: 1.4, form: 1.2, content: 0.3, decorative: 0.1,
  },
};

/** DOM element with bounding rect for semantic attention mapping */
export interface DOMAttentionElement {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  isCTA?: boolean;
  isHeading?: boolean;
  isNav?: boolean;
  isDecorative?: boolean;
  /**
   * Per-word boxes for this element's text.
   *
   * When present the semantic map paints THESE instead of the element rect, so
   * heat lands on glyphs rather than on the whitespace a text box spans. A
   * 400x44 heading is mostly empty pixels; painting the box puts attention where
   * there is nothing to attend to.
   */
  words?: Array<{ text: string; x: number; y: number; width: number; height: number }>;
}

/**
 * How many ranked cells to keep as the hotspot pool.
 *
 * This was a hard `slice(0, 10)`, and 10 cells is not a sample of a page. At the
 * default 4px grid a 1280x800 viewport is 64,000 cells and a single H1 spans
 * over a thousand of them, so all ten routinely landed on ONE element -- which
 * is why `computeAttentionQuality` could only ever return ratios of 0 or 1.
 *
 * Fixing the quality window to stop on distinct ELEMENTS (attention-quality.ts)
 * was necessary but not sufficient: a window cannot widen past the cells it is
 * given. Measured live on cbrowser.ai after that fix shipped, the payload read
 * `sampledHotspots: 10, sampledElements: 1` -- honest, and still saturated.
 *
 * The pool is proportional rather than a new magic constant, because the right
 * number depends on grid resolution: at 4px there are 16x more cells than at
 * 16px, and a fixed count would sample proportionally less of the finer grid.
 * 5% is bounded (a few thousand small objects at most), costs nothing to build
 * since the array is already sorted, and is not published -- the pool feeds
 * analysis only. `topAttentionAreas` in the MCP response comes from
 * `attentionCompetitors`, a different field, so response size is unchanged.
 */
function hotspotPoolSize(totalCells: number): number {
  return Math.min(4000, Math.max(200, Math.round(totalCells * 0.05)));
}

/**
 * Compute trait-driven element modifiers from cognitive traits.
 * Generalizes the static PERSONA_ELEMENT_MODIFIERS table to work with
 * ANY persona's trait values, not just the 11 hardcoded ones.
 */
function computeTraitModifiers(traits: Record<string, number>): Record<string, number> {
  const t = (key: string) => traits[key] ?? 0.5;
  return {
    // Low patience → fixate on CTAs and search, skip content
    cta: 1.0 + (1.0 - t("patience")) * 0.5,
    search: 0.7 + (1.0 - t("patience")) * 0.6,
    content: 0.2 + t("patience") * 0.4,
    // High curiosity → explore headings, images, more elements
    heading: 0.8 + t("curiosity") * 0.4,
    image: 0.5 + t("curiosity") * 0.5,
    // Navigation weight is deliberately FAMILIARITY-INDEPENDENT.
    //
    // This read `0.4 + (1.0 - t("siteFamiliarity")) * 0.6`, which made the
    // attention map depend on a trait the attention tools do not expose. The
    // incoherence that produced: `cognitive_effort` takes `siteFamiliarity` as
    // an explicit per-call parameter, while `attention_analysis` has no such
    // parameter and yet silently read whatever value happened to be baked into
    // the persona's static trait vector. So the same persona's attention could
    // not be steered first-timer vs returning by any caller, but WAS being
    // steered by an invisible default.
    //
    // Alexa's design call, 2026-08-05: "attention familiarity is independent now
    // by design so it is only used on tool call. the first timer vs returning
    // user case." siteFamiliarity stays in the cognitive-transport chain, where
    // the tool call supplies it and the first-timer/returning distinction is the
    // whole point. It does not belong in the saliency map.
    //
    // 0.7 is the previous formula evaluated at familiarity 0.5, so a persona
    // with a neutral (or absent) value sees no change at all.
    navigation: 0.7,
    // High readingTendency → content draws attention
    // (overrides patience for reading-heavy personas)
    ...(t("readingTendency") > 0.6 ? { content: 0.4 + t("readingTendency") * 0.4 } : {}),
    // Low selfEfficacy → error messages, help text draw attention
    error: 0.5 + (1.0 - t("selfEfficacy")) * 0.5,
    // High riskTolerance → prices don't scare, CTAs are natural
    price: 0.5 + (1.0 - t("riskTolerance")) * 0.5,
    // Decorative: ADHD-like attention (low metacognitivePlanning = distracted by visuals)
    decorative: 0.1 + (1.0 - t("metacognitivePlanning")) * 0.4,
    form: 0.5 + t("proceduralFluency") * 0.3,
  };
}

/**
 * Compute goal relevance boost for an element.
 * If the element's text matches the user's goal, massively boost its weight.
 * This is the "task-driven attention" component (Yarbus 1967).
 */
function computeGoalRelevance(elementText: string, goal: string): number {
  if (!goal || !elementText) return 0;
  const goalLower = goal.toLowerCase();
  const textLower = elementText.toLowerCase();

  // Extract goal keywords (remove stop words)
  const stopWords = new Set(["the", "a", "an", "to", "for", "of", "in", "on", "at", "is", "it", "my", "i", "me", "and", "or", "how", "do", "can"]);
  const goalWords = goalLower.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

  if (goalWords.length === 0) return 0;

  // Score based on keyword matches
  let matches = 0;
  for (const word of goalWords) {
    if (textLower.includes(word)) matches++;
  }

  if (matches === 0) return 0;
  // Partial match: some keywords found
  const matchRatio = matches / goalWords.length;
  // 2.0x boost for full match, proportional for partial
  return matchRatio * 2.0;
}

/**
 * Build a semantic attention map from DOM elements.
 *
 * Three layers of element weighting:
 * 1. Base weight by element type (CTA=1.0, heading=0.8, etc.)
 * 2. Persona modifiers from cognitive traits (patience, curiosity, familiarity)
 * 3. Goal relevance — elements matching the user's goal get massive boost
 *
 * Also applies Schwartz value relevance (trust signals for security-oriented,
 * novelty badges for stimulation-seeking, etc.)
 */
export function buildSemanticMap(
  elements: DOMAttentionElement[],
  rows: number,
  cols: number,
  cellSize: number,
  imageWidth: number,
  imageHeight: number,
  personaName: string,
  goal?: string,
  cognitiveTraits?: Record<string, number>,
  schwartzValues?: Record<string, number>,
  /**
   * Per-element relevance, keyed by index into `elements`, 0-1.
   *
   * Supplied by the LLM judge when available. Kept as a PARAMETER rather than
   * computed here so this function stays synchronous — the judge is one network
   * call per page, and the caller is where it can be cached, tier-gated and
   * reused across the frames of a recording.
   */
  relevanceScores?: Record<number, number>,
  /**
   * Override for `ELEMENT_TYPE_WEIGHTS`. Defaults to the shipped table.
   *
   * A seam, added 2026-08-04, so a weight search runs against THIS function
   * rather than a reimplementation of it. Study 1's published result was wrong
   * for exactly that reason -- it scored `cot_saliency.py`, a "vectorized Python
   * port of computeLabSaliency()" that had already diverged from the TypeScript
   * on the day the numbers were written. A calibration harness that re-derives
   * the thing it is calibrating measures the harness.
   */
  typeWeights?: Record<string, number>,
): Float64Array {
  const map = new Float64Array(rows * cols);
  const TYPE_W = typeWeights ?? ELEMENT_TYPE_WEIGHTS;

  // Use trait-driven modifiers if traits available, else fall back to static table
  const modifiers = cognitiveTraits
    ? computeTraitModifiers(cognitiveTraits)
    : (PERSONA_ELEMENT_MODIFIERS[personaName] || {});

  // Value-driven semantic patterns (imported from attention-quality)
  const VALUE_PATTERNS: Record<string, { pattern: RegExp; values: Record<string, number> }> = {
    trust: { pattern: /secur|trust|verif|guarant|privacy|encrypt|safe|protect/i, values: { security: 1.0, conformity: 0.5 } },
    social: { pattern: /review|rating|star|trusted.?by|\d+[kK]?\+?\s*users|testimonial/i, values: { conformity: 1.0, security: 0.6 } },
    novelty: { pattern: /\bnew\b|beta|launch|updat|just.?added|latest|early.?access/i, values: { stimulation: 1.0, selfDirection: 0.5 } },
    metrics: { pattern: /\d+%|\d+x\s|roi|faster|improv|performance|\$\d/i, values: { achievement: 1.0, power: 0.4 } },
    urgency: { pattern: /limited|only\s*\d|hurry|expire|last.?chance|act.?now/i, values: { stimulation: 0.5, achievement: 0.4 } },
    community: { pattern: /community|join|forum|together|open.?source|contrib/i, values: { benevolence: 0.8, universalism: 0.6 } },
  };

  for (const [elementIndex, el] of elements.entries()) {
    // Determine element type
    let elType = el.type || "content";
    if (el.isCTA) elType = "cta";
    else if (el.isHeading) elType = "heading";
    else if (el.isNav) elType = "navigation";
    else if (el.isDecorative) elType = "decorative";

    // Layer 1: Base weight by element type
    let weight = TYPE_W[elType] ?? 0.2;

    // Layer 2: Persona modifier (trait-driven or static lookup)
    const modifier = modifiers[elType] ?? 1.0;
    weight *= modifier;

    // Layer 3: Relevance — how much THIS persona should attend to this element.
    //
    // Prefers the LLM judge's score when the caller supplied one. The keyword
    // scorer below is the fallback and is kept deliberately: for the goal "buy a
    // subscription" it scores "Checkout", "Get Started" and "Upgrade to Pro" at
    // zero while giving a footer link "Subscription terms" the full boost, so it
    // is a floor to degrade to, never the intended path.
    const judged = relevanceScores?.[elementIndex];
    if (judged !== undefined && judged > 0) {
      weight *= (1.0 + judged * 2.0); // same 3x ceiling as the keyword path
    } else if (goal && el.text) {
      const goalBoost = computeGoalRelevance(el.text, goal);
      if (goalBoost > 0) {
        weight *= (1.0 + goalBoost);
      }
    }

    // Layer 4: Schwartz value relevance — elements matching persona values get boost
    if (schwartzValues && el.text) {
      for (const [, pattern] of Object.entries(VALUE_PATTERNS)) {
        if (pattern.pattern.test(el.text)) {
          let valueBoost = 0;
          for (const [valueName, valueWeight] of Object.entries(pattern.values)) {
            const personaValue = schwartzValues[valueName] ?? 0.5;
            valueBoost += (personaValue - 0.5) * valueWeight;
          }
          weight *= (1.0 + Math.max(0, valueBoost));
        }
      }
    }

    // Map element bounds to grid cells, weighted by how much of each cell the
    // element actually covers.
    //
    // Whole-cell assignment bled an element's full weight into every cell it
    // merely touched: a button at x=540 with 16px cells lit the cell starting at
    // x=528, so 12px of heat sat outside the button, and a 1px underline lit a
    // full 16px row. Fractional coverage keeps the heat on the element, which is
    // what makes an overlay point at something a designer can go and fix.
    //
    // This is a rendering-fidelity fix, not an accuracy one — no attention claim
    // at 16px is verifiable against human gaze, where the foveal limit alone is
    // 35-60px. It buys legibility, not truth.
    const pxPerCol = imageWidth / cols;
    const pxPerRow = imageHeight / rows;

    // Text elements paint their WORDS; everything else paints its box. A button
    // is a solid target and its whole rect is the thing you look at, but a
    // paragraph's box is mostly gaps between lines.
    const boxes = (el.words && el.words.length > 0)
      ? el.words.map((w) => ({ x: w.x, y: w.y, width: w.width, height: w.height }))
      : [{ x: el.x, y: el.y, width: el.width, height: el.height }];

    for (const box of boxes) {
    const x0 = box.x, x1 = box.x + box.width;
    const y0 = box.y, y1 = box.y + box.height;
    const startCol = Math.max(0, Math.floor(x0 / pxPerCol));
    const endCol = Math.min(cols - 1, Math.floor((x1 - 1e-6) / pxPerCol));
    const startRow = Math.max(0, Math.floor(y0 / pxPerRow));
    const endRow = Math.min(rows - 1, Math.floor((y1 - 1e-6) / pxPerRow));

    for (let r = startRow; r <= endRow; r++) {
      const cellTop = r * pxPerRow;
      const overlapY = Math.max(0, Math.min(y1, cellTop + pxPerRow) - Math.max(y0, cellTop));
      if (overlapY <= 0) continue;
      for (let c = startCol; c <= endCol; c++) {
        const cellLeft = c * pxPerCol;
        const overlapX = Math.max(0, Math.min(x1, cellLeft + pxPerCol) - Math.max(x0, cellLeft));
        if (overlapX <= 0) continue;
        // Fraction of the CELL covered, so a sliver of element contributes a
        // sliver of heat instead of the whole cell's worth.
        const coverage = (overlapX * overlapY) / (pxPerCol * pxPerRow);
        const idx = r * cols + c;
        map[idx] = Math.max(map[idx], weight * coverage);
      }
    }
    }
  }

  // Normalize against a robust high percentile, not the max.
  //
  // Dividing by the max let a single element crush the whole field: the
  // relevance boost multiplies a goal-matched CTA by up to 3x, so it becomes the
  // denominator, and an image weighted 0.5 lands at 0.17 while every other
  // element compresses toward zero. The visible result was a map with two or
  // three glowing elements and a dead page around them — images and photos in
  // particular disappeared, which is not what a person looking at the page sees.
  //
  // The 95th percentile keeps the field's dynamic range and lets genuinely
  // exceptional cells clip, which is standard practice for rendering saliency.
  const sorted = Array.from(map).filter((v) => v > 0).sort((a, b) => a - b);
  const p95 = sorted.length > 0
    ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
    : 0.001;
  const denom = Math.max(p95, 0.001);
  for (let i = 0; i < map.length; i++) map[i] = Math.min(1, map[i] / denom);

  return map;
}

/**
 * Blend visual saliency with semantic attention map.
 * visual: what POPS visually (color contrast)
 * semantic: what MATTERS structurally (element types × persona priorities)
 *
 * ## The default was 0.35/0.65 until 2026-08-04. It was measured and it was wrong.
 *
 * `research/study1/run-blend-sweep.ts` swept this weight from 0 to 1 in 0.05
 * steps over all 495 UEyes web stimuli, against real fixation points from 554
 * participant logs, with DOM elements reconstructed by a model-free OCR
 * extractor. Mean AUC-Judd:
 *
 *     w      0.00     0.05     0.10     0.15     0.20     0.35     1.00
 *     AUC  0.6466   0.6567   0.6521   0.6472   0.6427   0.6336   0.5854
 *
 * 0.05 beats the old 0.35 by +0.0231 AUC (95% CI [+0.0196, +0.0266], p<0.0001,
 * better on 386 of 495 pages). 5-fold cross-validation selected 0.05 in 5 of 5
 * folds with an optimism gap of 0.0000, so this is not a curve fitted to its own
 * peak.
 *
 * The useful number is the break-even at w ~= 0.16: ABOVE that, blending in the
 * visual channel is worse than not having it at all. The old 0.35 sat well past
 * it, which is why the blend scored below the semantic map alone.
 *
 * Note this is a coefficient, not a mixing ratio. The two inputs are each
 * p95-normalised to peak at 1.0 but their mean mass is not matched, so the
 * visual channel's actual share of blended mass varies per page (measured range
 * 0.070 to 0.759, median 0.190 at the old constant). Equalising the masses first
 * was tested and REJECTED: it makes the constant mean the same thing everywhere
 * but costs 0.0064 AUC at the optimum (p<0.0001).
 *
 * Caveat carried deliberately: UEyes is FREE-VIEWING and its ground truth is
 * aggregated over 62 participants, while this model targets task-driven
 * attention for a specific persona. 0.05 is the best available estimate, not a
 * validated constant for the goal-directed case.
 */
export function blendSaliencyMaps(
  visual: Float64Array,
  semantic: Float64Array,
  visualWeight: number = 0.05,
  semanticWeight: number = 0.95,
): Float64Array {
  const blended = new Float64Array(visual.length);
  for (let i = 0; i < visual.length; i++) {
    blended[i] = visual[i] * visualWeight + semantic[i] * semanticWeight;
  }
  // Renormalize
  const max = Math.max(...Array.from(blended), 0.001);
  for (let i = 0; i < blended.length; i++) blended[i] /= max;
  return blended;
}

// ── Spatial prior + foveal smoothing (added 2026-08-04) ──

/**
 * Where people actually look on a web page, independent of what is on it.
 *
 * A 12x16 normalised grid fitted from 554 UEyes participant logs over the 495
 * web-category stimuli (`research/study1/run-optimize.ts --emit-prior`). It is
 * the classic F-pattern: peak just above and left of centre, decaying toward the
 * bottom-right, floored at 0.05 so no cell can zero out a prediction.
 *
 * ## Why this exists
 *
 * The model had no positional prior at all, and a bare centred Gaussian scored
 * 0.6493 against the full model's 0.6567 -- within 0.007. That is the signature
 * of a model that has rediscovered "content is in the middle" and added little
 * else. Every competitive saliency model since Judd et al. 2009 multiplies in a
 * learned position prior; it is the single cheapest gain in this literature and
 * it is worth +0.0774 AUC here, more than smoothing and the blend combined.
 *
 * ## Provenance, and where it does NOT apply
 *
 * Fitted on LEFT-TO-RIGHT DESKTOP WEB screenshots under FREE VIEWING. Three
 * consequences, none of them hypothetical:
 *   - RTL layouts mirror this bias. The prior would be actively wrong.
 *   - Mobile stimuli were excluded from the fit (the corpus has 495 of them and
 *     they were not used).
 *   - Under a task, gaze concentrates on task-relevant targets and the prior
 *     flattens. It should weaken, not strengthen, for goal-directed use.
 *
 * Pass `spatialPrior: 0` to disable it for any of those cases.
 */
const WEB_SPATIAL_PRIOR_ROWS = 12;
const WEB_SPATIAL_PRIOR_COLS = 16;
const WEB_SPATIAL_PRIOR = [
  0.3438, 0.4761, 0.6428, 0.8103, 0.9375, 1.0000, 0.9920, 0.9220, 0.8109, 0.6831, 0.5571, 0.4409, 0.3344, 0.2406, 0.1686, 0.1216,
  0.3225, 0.4491, 0.6086, 0.7704, 0.8973, 0.9657, 0.9669, 0.9055, 0.8004, 0.6767, 0.5533, 0.4380, 0.3308, 0.2359, 0.1636, 0.1172,
  0.3024, 0.4229, 0.5746, 0.7294, 0.8538, 0.9255, 0.9340, 0.8806, 0.7825, 0.6646, 0.5460, 0.4335, 0.3264, 0.2307, 0.1584, 0.1127,
  0.2842, 0.3971, 0.5385, 0.6829, 0.8000, 0.8697, 0.8816, 0.8353, 0.7460, 0.6374, 0.5281, 0.4228, 0.3194, 0.2253, 0.1539, 0.1093,
  0.2655, 0.3676, 0.4946, 0.6240, 0.7292, 0.7925, 0.8049, 0.7655, 0.6872, 0.5918, 0.4963, 0.4031, 0.3085, 0.2194, 0.1507, 0.1074,
  0.2456, 0.3349, 0.4451, 0.5569, 0.6482, 0.7040, 0.7163, 0.6839, 0.6175, 0.5363, 0.4556, 0.3764, 0.2937, 0.2128, 0.1484, 0.1069,
  0.2266, 0.3036, 0.3976, 0.4924, 0.5699, 0.6180, 0.6296, 0.6032, 0.5475, 0.4794, 0.4120, 0.3461, 0.2759, 0.2048, 0.1459, 0.1066,
  0.2077, 0.2738, 0.3535, 0.4327, 0.4966, 0.5358, 0.5449, 0.5228, 0.4766, 0.4205, 0.3656, 0.3124, 0.2547, 0.1940, 0.1416, 0.1054,
  0.1856, 0.2410, 0.3071, 0.3713, 0.4216, 0.4509, 0.4560, 0.4368, 0.3996, 0.3557, 0.3133, 0.2725, 0.2273, 0.1779, 0.1336, 0.1021,
  0.1603, 0.2042, 0.2562, 0.3057, 0.3429, 0.3630, 0.3643, 0.3479, 0.3194, 0.2870, 0.2563, 0.2266, 0.1932, 0.1556, 0.1211, 0.0959,
  0.1355, 0.1682, 0.2067, 0.2426, 0.2686, 0.2818, 0.2811, 0.2677, 0.2465, 0.2236, 0.2021, 0.1813, 0.1578, 0.1310, 0.1061, 0.0877,
  0.1150, 0.1385, 0.1658, 0.1908, 0.2086, 0.2173, 0.2160, 0.2056, 0.1899, 0.1736, 0.1587, 0.1442, 0.1278, 0.1094, 0.0923, 0.0795,
];

/** Fitted operating point, all five CV folds unanimous. See `applyGazeCalibration`. */
export const GAZE_CALIBRATION = { visualWeight: 0.2, sigmaCells: 2.5, spatialPrior: 1.0 } as const;

/** Separable Gaussian blur over the cell grid. */
export function smoothSaliency(map: Float64Array, rows: number, cols: number, sigma: number): Float64Array {
  if (sigma <= 0) return map;
  const rad = Math.ceil(sigma * 3), inv = 1 / (2 * sigma * sigma), k: number[] = [];
  for (let d = -rad; d <= rad; d++) k.push(Math.exp(-d * d * inv));
  const tmp = new Float64Array(map.length), out = new Float64Array(map.length);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let s = 0, w = 0;
    for (let d = -rad; d <= rad; d++) { const cc = c + d; if (cc < 0 || cc >= cols) continue; s += map[r * cols + cc] * k[d + rad]; w += k[d + rad]; }
    tmp[r * cols + c] = s / w;
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let s = 0, w = 0;
    for (let d = -rad; d <= rad; d++) { const rr = r + d; if (rr < 0 || rr >= rows) continue; s += tmp[rr * cols + c] * k[d + rad]; w += k[d + rad]; }
    out[r * cols + c] = s / w;
  }
  return out;
}

/**
 * Foveal smoothing + spatial prior, applied to a persona-filtered map.
 *
 * **Smoothing (sigma 2.5 cells) is physiology, not preference.** The map paints
 * crisp element rectangles; the human fovea spans roughly 1-2 degrees, about
 * 35-60 screen px, and fixations scatter around a target rather than landing on
 * its bounding box. A map with hard element edges is claiming a precision the
 * eye does not have. Worth +0.0197 AUC.
 *
 * Fitted jointly by nested 5-fold CV over 495 web stimuli
 * (`research/study1/run-optimize.ts --freeze-types`): held-out 0.7367 against
 * 0.6567 for the previous configuration, +0.0800, with an optimism gap of
 * 0.0005. Human inter-observer ceiling on the same data is 0.8112, so this
 * closes about 52% of the reachable gap. All five folds selected the same
 * values.
 */
export function applyGazeCalibration(
  map: Float64Array, rows: number, cols: number,
  sigma: number = GAZE_CALIBRATION.sigmaCells,
  priorStrength: number = GAZE_CALIBRATION.spatialPrior,
): Float64Array {
  let m = smoothSaliency(map, rows, cols, sigma);
  if (priorStrength > 0) {
    const out = new Float64Array(m.length);
    for (let r = 0; r < rows; r++) {
      const pr = Math.min(WEB_SPATIAL_PRIOR_ROWS - 1, Math.floor((r / rows) * WEB_SPATIAL_PRIOR_ROWS));
      for (let c = 0; c < cols; c++) {
        const pc = Math.min(WEB_SPATIAL_PRIOR_COLS - 1, Math.floor((c / cols) * WEB_SPATIAL_PRIOR_COLS));
        const p = WEB_SPATIAL_PRIOR[pr * WEB_SPATIAL_PRIOR_COLS + pc];
        out[r * cols + c] = m[r * cols + c] * (1 - priorStrength + priorStrength * p);
      }
    }
    m = out;
  }
  return m;
}

// ── Public API ──

/**
 * Compute persona-specific attention analysis for a screenshot.
 *
 * Two-layer attention model:
 * 1. Visual saliency — W₂ on CIE-Lab distributions (what POPS visually)
 * 2. Semantic attention — DOM element classification × persona priorities (what MATTERS)
 *
 * Blended at 5% visual / 95% semantic. The direction is the one the literature
 * predicts — task-driven attention dominates bottom-up saliency for goal-oriented
 * users (Yarbus 1967, Henderson 2003, Tatler et al. 2011) — but the number is no
 * longer read off those papers. It was swept against 495 UEyes web stimuli and
 * real fixations; see `blendSaliencyMaps` for the curve and the cross-validation.
 *
 * When DOM elements are not provided, falls back to visual-only mode.
 */
/**
 * Fast DOM-only attention analysis. Skips the slow CIE-Lab saliency pass
 * (which decodes the screenshot, downscales, and computes per-pixel Lab
 * variance — typically 1-3s). Uses the semantic saliency map alone, which
 * is plenty for live cognitive-journey overlays where the persona is
 * attending to elements (CTAs, headings, links), not raw color hotspots.
 *
 * Returns the same AttentionAnalysis shape as analyzeAttention so callers
 * are interchangeable. Typical runtime: 5-30ms vs 1500-3000ms for the full
 * version.
 */
export async function analyzeAttentionFromDOM(
  viewportWidth: number,
  viewportHeight: number,
  domElements: DOMAttentionElement[],
  personaName: string,
  cellSize: number = 16,
  schwartzValues?: Record<string, number>,
  goal?: string,
  cognitiveTraits?: Record<string, number>,
  relevanceScores?: Record<number, number>,
): Promise<AttentionAnalysis> {
  const startTime = performance.now();
  const profile = getPerceptualProfile(personaName);

  // Look up Schwartz values from built-in profiles if caller didn't pass any
  let values = schwartzValues;
  if (!values) {
    try {
      const { resolveValuesForPersona } = await import('../values/index.js');
      const pv = resolveValuesForPersona(personaName);
      if (pv) {
        values = {
          selfDirection: pv.selfDirection, stimulation: pv.stimulation,
          hedonism: pv.hedonism, achievement: pv.achievement, power: pv.power,
          security: pv.security, conformity: pv.conformity, tradition: pv.tradition,
          benevolence: pv.benevolence, universalism: pv.universalism,
        };
      }
    } catch { /* best-effort */ }
  }
  let traits = cognitiveTraits;
  if (!traits) {
    try {
      const { getAnyPersona, getCognitiveProfile } = await import('../personas.js');
      const p = getAnyPersona(personaName);
      if (p) traits = getCognitiveProfile(p as any).traits as unknown as Record<string, number>;
    } catch {}
  }

  // DOM elements come back in full viewport coordinates (getBoundingClientRect),
  // so the grid + image dimensions passed to buildSemanticMap MUST also be in
  // full viewport space. The screenshot-based path scaled by 0.5 because the
  // image was downsampled; without an image we don't downsample. Using half
  // dimensions here was the bug: elements with x > viewport/2 all clamped to
  // the right edge of the grid, producing the "random hotspots on right side"
  // artifact.
  const rows = Math.ceil(viewportHeight / cellSize);
  const cols = Math.ceil(viewportWidth / cellSize);

  const semanticMap = buildSemanticMap(
    domElements,
    rows, cols, cellSize,
    viewportWidth, viewportHeight,
    personaName, goal, traits, values, relevanceScores,
  );

  // Apply persona perceptual filter directly to the semantic map (no Lab blend),
  // then the same foveal smoothing + spatial prior analyzeAttention applies.
  //
  // This path exists so callers are INTERCHANGEABLE with analyzeAttention (its
  // own docstring says so). Calibrating one and not the other would silently
  // make the fast path and the full path disagree about where a persona looks --
  // the live cognitive-journey overlay drawing a different map from the audit.
  const filtered = applyGazeCalibration(
    applyPersonaFilter(semanticMap, rows, cols, profile.visualFilter, values),
    rows, cols,
  );

  // Hotspots, entropy, concentration — same shape as analyzeAttention
  const indexed = Array.from(filtered).map((s, i) => ({ s, i }));
  indexed.sort((a, b) => b.s - a.s);
  const hotspots = indexed.slice(0, hotspotPoolSize(indexed.length)).map(({ s, i }) => ({
    row: Math.floor(i / cols),
    col: i % cols,
    x: (i % cols) * cellSize,
    y: Math.floor(i / cols) * cellSize,
    saliency: s,
  }));

  const totalSaliency = filtered.reduce((a, b) => a + b, 0) || 1;
  let entropy = 0;
  for (let i = 0; i < filtered.length; i++) {
    const p = filtered[i] / totalSaliency;
    if (p > 0) entropy -= p * Math.log2(p + 1e-10);
  }
  entropy = entropy / Math.log2(filtered.length || 1);

  const sorted = Array.from(filtered).sort((a, b) => b - a);
  const top20Count = Math.ceil(filtered.length * 0.2);
  const top20Sum = sorted.slice(0, top20Count).reduce((a, b) => a + b, 0);
  const concentration = top20Sum / totalSaliency;

  return {
    persona: personaName,
    saliencyMap: {
      cells: filtered,
      rows, cols,
      width: viewportWidth, height: viewportHeight,
      cellSize,
      hotspots,
    },
    alignmentScore: 1, // No base to compare against
    entropy: Math.round(entropy * 1000) / 1000,
    concentration: Math.round(concentration * 1000) / 1000,
    attentionCompetitors: hotspots.slice(0, 5).map((h) => ({
      region: `(${h.x}, ${h.y})`,
      saliency: Math.round(h.saliency * 100) / 100,
    })),
    transportCost: 0,
    computeTimeMs: Math.round(performance.now() - startTime),
  };
}

export async function analyzeAttention(
  screenshotPath: string,
  personaName: string,
  cellSize: number = 16,
  schwartzValues?: Record<string, number>,
  domElements?: DOMAttentionElement[],
  goal?: string,
  cognitiveTraits?: Record<string, number>,
  relevanceScores?: Record<number, number>,
): Promise<AttentionAnalysis> {
  const startTime = performance.now();
  const profile = getPerceptualProfile(personaName);

  // v18.54.0: If no values passed, try to look them up from the built-in value profiles
  let values = schwartzValues;
  if (!values) {
    try {
      const { resolveValuesForPersona } = await import('../values/index.js');
      const pv = resolveValuesForPersona(personaName);
      if (pv) {
        values = {
          selfDirection: pv.selfDirection, stimulation: pv.stimulation,
          hedonism: pv.hedonism, achievement: pv.achievement, power: pv.power,
          security: pv.security, conformity: pv.conformity, tradition: pv.tradition,
          benevolence: pv.benevolence, universalism: pv.universalism,
        };
      }
    } catch { /* values not available — use filter-only mode */ }
  }

  // Layer 1: Visual saliency — W₂ on CIE-Lab distributions
  const baseSaliency = await computeLabSaliency(screenshotPath, cellSize);

  // Layer 2: Semantic attention — DOM element types × persona priorities
  let combinedSaliency: Float64Array;
  if (domElements && domElements.length > 0) {
    // Load cognitive traits if not provided
    let traits = cognitiveTraits;
    if (!traits) {
      try {
        const { getAnyPersona, getCognitiveProfile } = await import('../personas.js');
        const p = getAnyPersona(personaName);
        if (p) traits = getCognitiveProfile(p as any).traits as unknown as Record<string, number>;
      } catch {}
    }

    const semanticMap = buildSemanticMap(
      domElements,
      baseSaliency.rows, baseSaliency.cols,
      cellSize,
      baseSaliency.width, baseSaliency.height,
      personaName,
      goal,
      traits,
      values,
      relevanceScores,
    );
    // Blend: 20% visual (what pops) + 80% semantic (what matters).
    //
    // 0.05 was correct on 2026-08-04 morning and became wrong the same day, when
    // the spatial prior shipped. The parameters interact: a prior absorbs the
    // positional signal the semantic map was carrying alone, which frees the
    // blend to take more from the visual channel. Re-fitted WITH the prior and
    // smoothing in place -- all five CV folds selected 0.2. Carrying 0.05 over
    // would have been importing half of an optimum.
    combinedSaliency = blendSaliencyMaps(
      baseSaliency.cells, semanticMap,
      GAZE_CALIBRATION.visualWeight, 1 - GAZE_CALIBRATION.visualWeight,
    );
  } else {
    // No DOM data — fall back to visual-only.
    //
    // This fallback changes what the heatmap MEANS, and said so nowhere. With
    // DOM elements the map is 35% bottom-up saliency + 65% semantic (element
    // type x persona priority) — a model of attention. Without them it is the
    // bottom-up layer alone: centre-surround colour contrast in CIE-Lab. Those
    // are different quantities under one name, and two of the three production
    // callers take this branch (visual_cognitive_story and journey_heatmap_gif
    // both call analyzeAttention with three arguments), so most heatmaps this
    // product has shipped are contrast maps presented as attention maps.
    //
    // Not changing the fallback here — collecting DOM elements in those callers
    // is their change to make. But the caller must be able to tell which model
    // produced the number. (2026-07-29)
    combinedSaliency = baseSaliency.cells;
  }
  const attentionModel: "visual+semantic" | "visual-only" =
    domElements && domElements.length > 0 ? "visual+semantic" : "visual-only";

  // Apply persona perceptual filter + value-driven attention modulation, then
  // foveal smoothing and the fitted spatial prior (see applyGazeCalibration).
  const filtered = applyGazeCalibration(
    applyPersonaFilter(
      combinedSaliency, baseSaliency.rows, baseSaliency.cols,
      profile.visualFilter,
      values,
    ),
    baseSaliency.rows, baseSaliency.cols,
  );

  // Build saliency map with hotspots
  const indexed = Array.from(filtered).map((s, i) => ({ s, i }));
  indexed.sort((a, b) => b.s - a.s);
  const hotspots = indexed.slice(0, hotspotPoolSize(indexed.length)).map(({ s, i }) => ({
    row: Math.floor(i / baseSaliency.cols),
    col: i % baseSaliency.cols,
    x: (i % baseSaliency.cols) * cellSize * 2, // Scale back to original
    y: Math.floor(i / baseSaliency.cols) * cellSize * 2,
    saliency: s,
  }));

  const saliencyMap: SaliencyMap = {
    cells: filtered,
    /**
     * Which model produced `cells`.
     *
     * "visual+semantic" — 35% centre-surround CIE-Lab saliency blended with 65%
     * DOM-semantic attention (element type x persona priority).
     * "visual-only" — the bottom-up layer alone, i.e. local colour-contrast
     * pop-out. Useful, but NOT a model of where a person looks.
     */
    attentionModel,
    rows: baseSaliency.rows,
    cols: baseSaliency.cols,
    width: baseSaliency.width,
    height: baseSaliency.height,
    cellSize: cellSize * 2, // Scaled
    hotspots,
  };

  // Compute attention metrics
  const totalSaliency = filtered.reduce((a, b) => a + b, 0) || 1;

  // Entropy: -Σ p*log(p) where p = normalized saliency
  let entropy = 0;
  for (let i = 0; i < filtered.length; i++) {
    const p = filtered[i] / totalSaliency;
    if (p > 0) entropy -= p * Math.log2(p + 1e-10);
  }
  const maxEntropy = Math.log2(filtered.length);
  entropy = entropy / maxEntropy; // Normalize to 0-1

  // Concentration: fraction of total saliency in top 20% of cells
  const sorted = Array.from(filtered).sort((a, b) => b - a);
  const top20Count = Math.ceil(filtered.length * 0.2);
  const top20Sum = sorted.slice(0, top20Count).reduce((a, b) => a + b, 0);
  const concentration = top20Sum / totalSaliency;

  // Alignment: how well does the persona's saliency match the base (unfiltered) saliency?
  // Computed as correlation between filtered and base saliency
  let sumAB = 0, sumA2 = 0, sumB2 = 0;
  const meanA = baseSaliency.cells.reduce((a, b) => a + b, 0) / baseSaliency.cells.length;
  const meanB = filtered.reduce((a, b) => a + b, 0) / filtered.length;
  for (let i = 0; i < filtered.length; i++) {
    const da = baseSaliency.cells[i] - meanA;
    const db = filtered[i] - meanB;
    sumAB += da * db;
    sumA2 += da * da;
    sumB2 += db * db;
  }
  const alignmentScore = sumA2 > 0 && sumB2 > 0 ? sumAB / Math.sqrt(sumA2 * sumB2) : 1;

  // Transport cost: W₁ between base and filtered saliency (how much attention moved)
  let transportCost = 0;
  for (let i = 0; i < filtered.length; i++) {
    transportCost += Math.abs(baseSaliency.cells[i] / (totalSaliency || 1) - filtered[i] / (totalSaliency || 1));
  }

  // Attention competitors: group hotspots into regions
  const attentionCompetitors = hotspots.slice(0, 5).map((h, i) => ({
    region: `(${h.x}, ${h.y})`,
    saliency: Math.round(h.saliency * 100) / 100,
  }));

  return {
    persona: personaName,
    saliencyMap,
    alignmentScore: Math.round(alignmentScore * 1000) / 1000,
    entropy: Math.round(entropy * 1000) / 1000,
    concentration: Math.round(concentration * 1000) / 1000,
    attentionCompetitors,
    transportCost: Math.round(transportCost * 10000) / 10000,
    computeTimeMs: Math.round(performance.now() - startTime),
  };
}

/**
 * Compare attention patterns between two personas on the same screenshot.
 * Returns the L1 divergence between their normalized saliency maps (described
 * elsewhere as Wasserstein; it is not, see attentionDivergence) and the
 * connected regions where attention differs most.
 */
export async function compareAttention(
  screenshotPath: string,
  personaA: string,
  personaB: string,
  cellSize: number = 16,
  domElements?: DOMAttentionElement[],
  goal?: string,
): Promise<AttentionComparisonResult> {
  const [analysisA, analysisB] = await Promise.all([
    analyzeAttention(screenshotPath, personaA, cellSize, undefined, domElements, goal),
    analyzeAttention(screenshotPath, personaB, cellSize, undefined, domElements, goal),
  ]);

  // One pass computes the aggregate AND the regions from the same normalized
  // maps, so the regions are by construction the contributors to the number
  // reported beside them. History: until 2026-07-29 the regions used RAW
  // saliency against a fixed 0.3 threshold and came back empty beside a
  // divergence of 0.2606 (B18); until 2026-10-09 they were single cells whose
  // per-cell values were ~1/16,000 and adjacent to each other (see
  // rankDivergentRegions).
  const { divergence, regions } = rankDivergentRegions(
    analysisA.saliencyMap.cells,
    analysisB.saliencyMap.cells,
    analysisA.saliencyMap.rows,
    analysisA.saliencyMap.cols,
    analysisA.saliencyMap.cellSize,
  );

  return {
    personaA: analysisA,
    personaB: analysisB,
    attentionDivergence: Math.round(divergence * 10000) / 10000,
    divergentRegions: regions.slice(0, 10),
  };
}
