/**
 * Exact Wasserstein-1 (earth mover's) distance between two discrete
 * distributions over the same n points, under an arbitrary non-negative cost
 * matrix.
 *
 * Solves the transportation problem
 *
 *     min  sum_ij C[i][j] * P[i][j]
 *     s.t. sum_j P[i][j] = a[i],  sum_i P[i][j] = b[j],  P >= 0
 *
 * as a min-cost flow on the bipartite graph source -> i -> j -> sink with
 * successive shortest paths (Dijkstra with Johnson potentials, so reverse edges
 * with negative reduced cost never break the search). Every augmentation ships
 * the bottleneck mass along a shortest source-to-sink path in the residual
 * graph; the plan it leaves behind is optimal by the standard SSP argument
 * (each augmentation is along a shortest path, so no negative cycle is ever
 * created in the residual graph).
 *
 * Complexity: one Dijkstra is O(V^2) on this dense graph, V = 2n + 2. The number
 * of augmentations K is bounded by the number of edges whose residual capacity
 * can be exhausted (each augmentation saturates a supply edge, a demand edge or
 * cancels a reverse edge), so the total is O(K * n^2) with K = O(n^2) in the
 * worst case. Measured on the 29-trait persona problem across all 300 roster
 * pairs (2026-10-21): K = 54 min, 67 median, 120 max, i.e. roughly 2n to 4n,
 * and a 25 x 25 distance matrix takes ~65 ms.
 * Mass is floating point, so "saturated" means residual <= EPS and the loop
 * stops once the unshipped supply is below EPS.
 *
 * `cognitiveDistance` used to call its result "W1" while computing a weighted
 * L1 sum (|a_i - b_i| times the mean ground distance of trait i), which is not
 * optimal transport and does not respect the ground metric. This module is the
 * exact replacement. Its oracle test (tests/cognitive-distance-w1.test.ts)
 * checks it against an independent dense two-phase simplex on the same LP.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

/** Mass below this is treated as zero. Both inputs sum to 1, so 1e-12 is far below any real atom. */
const EPS = 1e-12;

export interface TransportResult {
  /** Optimal transport cost, i.e. the exact W1 distance. */
  cost: number;
  /** Optimal plan: plan[i][j] = mass moved from point i to point j (diagonal included). */
  plan: number[][];
  /** Number of augmenting paths the solver used (diagnostic, for the complexity claim). */
  augmentations: number;
}

/**
 * Exact W1 between distributions `a` and `b` (same length n, both summing to
 * the same total up to EPS) under cost matrix `cost` (n x n, non-negative).
 *
 * Throws if the shapes disagree or the masses differ by more than 1e-9: unequal
 * mass is an unbalanced problem and W1 is undefined for it.
 */
export function exactW1(a: ArrayLike<number>, b: ArrayLike<number>, cost: ArrayLike<ArrayLike<number>>): TransportResult {
  const n = a.length;
  if (b.length !== n || cost.length !== n) throw new Error(`exactW1: shape mismatch (a=${n}, b=${b.length}, cost=${cost.length})`);
  let massA = 0, massB = 0;
  for (let i = 0; i < n; i++) {
    if (!(a[i] >= 0) || !(b[i] >= 0)) throw new Error(`exactW1: negative or NaN mass at index ${i}`);
    massA += a[i]; massB += b[i];
  }
  if (Math.abs(massA - massB) > 1e-9) throw new Error(`exactW1: unbalanced masses (${massA} vs ${massB})`);

  // Residual state. Supply edges source->i carry `supply[i]` remaining; demand
  // edges j->sink carry `demand[j]` remaining. Middle edges i->j have infinite
  // forward capacity, and their reverse edge j->i has capacity plan[i][j].
  const supply = new Float64Array(n);
  const demand = new Float64Array(n);
  for (let i = 0; i < n; i++) { supply[i] = a[i]; demand[i] = b[i]; }
  const plan: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  // Johnson potentials for the 2n inner nodes: left (supply side) and right
  // (demand side). All original costs are non-negative, so zero potentials are
  // valid initially; after each Dijkstra they are updated with the distances so
  // reduced costs stay non-negative.
  const potL = new Float64Array(n);
  const potR = new Float64Array(n);

  const distL = new Float64Array(n);
  const distR = new Float64Array(n);
  const doneL = new Uint8Array(n);
  const doneR = new Uint8Array(n);
  // Predecessors: for a left node, the right node we came from (-1 = source);
  // for a right node, the left node we came from.
  const prevL = new Int32Array(n);
  const prevR = new Int32Array(n);

  let remaining = massA;
  let total = 0;
  let augmentations = 0;

  while (remaining > EPS) {
    // Dijkstra over the residual graph with reduced costs.
    distL.fill(Infinity); distR.fill(Infinity);
    doneL.fill(0); doneR.fill(0);
    prevL.fill(-1); prevR.fill(-1);
    for (let i = 0; i < n; i++) if (supply[i] > EPS) distL[i] = 0; // source -> i, cost 0, potential 0 at source

    for (;;) {
      // Pick the unsettled node with the smallest tentative distance (dense O(V) scan).
      let best = Infinity, side = -1, idx = -1;
      for (let i = 0; i < n; i++) if (!doneL[i] && distL[i] < best) { best = distL[i]; side = 0; idx = i; }
      for (let j = 0; j < n; j++) if (!doneR[j] && distR[j] < best) { best = distR[j]; side = 1; idx = j; }
      if (idx < 0) break;
      if (side === 0) {
        doneL[idx] = 1;
        const costRow = cost[idx];
        // Forward edges idx -> j (infinite capacity).
        for (let j = 0; j < n; j++) {
          if (doneR[j]) continue;
          const nd = best + costRow[j] + potL[idx] - potR[j];
          if (nd < distR[j] - EPS) { distR[j] = nd; prevR[j] = idx; }
        }
      } else {
        doneR[idx] = 1;
        // Reverse edges idx -> i exist where plan[i][idx] > EPS, with cost -C[i][idx].
        for (let i = 0; i < n; i++) {
          if (doneL[i] || plan[i][idx] <= EPS) continue;
          const nd = best - cost[i][idx] + potR[idx] - potL[i];
          if (nd < distL[i] - EPS) { distL[i] = nd; prevL[i] = idx; }
        }
      }
    }

    // Cheapest reachable demand node with remaining capacity ends the path.
    let endJ = -1, endD = Infinity;
    for (let j = 0; j < n; j++) if (demand[j] > EPS && distR[j] < endD) { endD = distR[j]; endJ = j; }
    if (endJ < 0) throw new Error(`exactW1: no augmenting path with ${remaining} mass unshipped (masses unbalanced beyond tolerance?)`);

    // Walk the path back to find the bottleneck, then ship it.
    let bottleneck = demand[endJ];
    {
      let j = endJ;
      for (;;) {
        const i = prevR[j];
        const back = prevL[i];
        if (back < 0) { bottleneck = Math.min(bottleneck, supply[i]); break; }
        bottleneck = Math.min(bottleneck, plan[i][back]);
        j = back;
      }
    }
    {
      let j = endJ;
      for (;;) {
        const i = prevR[j];
        plan[i][j] += bottleneck;
        total += bottleneck * cost[i][j];
        const back = prevL[i];
        if (back < 0) { supply[i] -= bottleneck; break; }
        plan[i][back] -= bottleneck;
        total -= bottleneck * cost[i][back];
        if (plan[i][back] < EPS) plan[i][back] = 0;
        j = back;
      }
      demand[endJ] -= bottleneck;
    }
    remaining -= bottleneck;
    augmentations++;

    // Update potentials with the distances found (unreached nodes keep theirs).
    for (let i = 0; i < n; i++) if (distL[i] < Infinity) potL[i] += distL[i];
    for (let j = 0; j < n; j++) if (distR[j] < Infinity) potR[j] += distR[j];
  }

  // Recompute the cost from the final plan so accumulated add/subtract rounding
  // in `total` cannot drift the reported number.
  let exact = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (plan[i][j] > 0) exact += plan[i][j] * cost[i][j];
  void total;
  return { cost: exact, plan, augmentations };
}
