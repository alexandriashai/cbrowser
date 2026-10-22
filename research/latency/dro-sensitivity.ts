/**
 * How sensitive is CTC to the capacity vector, page by page, and how tight is
 * the derived Lipschitz constant? A soundness test over a function that never
 * moves passes vacuously, so this measures where it moves.
 *
 * Usage: bun research/latency/dro-sensitivity.ts
 */
import { computeDemandFromRawMetrics, DEMAND_DIMENSIONS } from "../../src/visual/cognitive-transport-chain.js";
import { ctcLipschitzBound, ctcOfCapacity } from "../../src/visual/dro-bound.js";

const DIMS = DEMAND_DIMENSIONS as readonly string[];
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const vec = () => Object.fromEntries(DIMS.map((d) => [d, rand()])) as Record<string, number>;

const pages: Array<[string, Parameters<typeof computeDemandFromRawMetrics>]> = [
  ["empty", [0, 0, 0, 0, 0, 0, 0]],
  ["light", [0.2, 0.2, 10, 0.2, 0, 3, 1]],
  ["mid", [0.5, 0.5, 40, 0.5, 0.2, 12, 3]],
  ["busy", [0.8, 0.8, 120, 0.8, 0.6, 30, 5]],
  ["max", [1, 1, 200, 1, 1, 60, 8]],
];

for (const [name, args] of pages) {
  const demand = computeDemandFromRawMetrics(...args);
  const { lipschitz, worstDimension } = ctcLipschitzBound(demand);
  let lo = 1, hi = 0, maxSlope = 0, slopeDim = "";
  for (let k = 0; k < 2000; k++) {
    const x = vec();
    const c = ctcOfCapacity(x, demand);
    lo = Math.min(lo, c); hi = Math.max(hi, c);
    const i = Math.floor(rand() * DIMS.length);
    const y = { ...x, [DIMS[i]]: Math.min(1, x[DIMS[i]] + 0.01) };
    const step = y[DIMS[i]] - x[DIMS[i]];
    if (step > 0) {
      const s = Math.abs(ctcOfCapacity(y, demand) - c) / step;
      if (s > maxSlope) { maxSlope = s; slopeDim = DIMS[i]; }
    }
  }
  // Corner probe: all-zero vs all-one capacity, the largest possible move.
  const zero = Object.fromEntries(DIMS.map((d) => [d, 0])) as Record<string, number>;
  const one = Object.fromEntries(DIMS.map((d) => [d, 1])) as Record<string, number>;
  console.log(`${name.padEnd(6)} CTC range [${lo.toFixed(4)}, ${hi.toFixed(4)}]  corners ${ctcOfCapacity(zero, demand).toFixed(4)}/${ctcOfCapacity(one, demand).toFixed(4)}  steepest ${maxSlope.toFixed(4)} (${slopeDim})  L ${lipschitz.toFixed(4)} (${worstDimension})  L/steepest ${(lipschitz / Math.max(maxSlope, 1e-12)).toFixed(1)}`);
}
