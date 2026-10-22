/**
 * cognitiveDistance.w1 is an EXACT Wasserstein-1 distance (2026-10-21).
 *
 * Until this change the field called "w1" was sum_i |a_i - b_i| * mean_j d(i,j):
 * a weighted L1 that never looked at which traits mass moved between, so it was
 * not optimal transport and did not respect the ground metric. The solver is a
 * successive-shortest-path min-cost flow (src/visual/exact-w1.ts). These tests
 * are universally quantified over random profiles (fast-check, 1000 runs each)
 * and check it two ways:
 *
 *   1. metric axioms and bounds that any W1 must satisfy on the 29-trait
 *      problem: identity, symmetry, triangle inequality, 0 <= W1 <= max cost,
 *      and the total-variation sandwich  c_min * TV <= W1 <= c_max * TV;
 *   2. agreement with an INDEPENDENT oracle on random small instances: a dense
 *      two-phase tableau simplex (Bland's rule) on the transportation LP,
 *      written here, sharing no code with the flow solver.
 *
 * Absence check, run by hand when this file was written: with exactW1's body
 * swapped for the old weighted-L1 formula the oracle test fails on the first
 * runs; the metric tests alone would NOT all have caught it (the weighted L1 is
 * also symmetric and zero on identical inputs), which is why the oracle exists.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import {
  COGNITIVE_TRAITS,
  buildOTCognitiveProfile,
  cognitiveDistance,
  traitGroundCostMatrix,
} from "../src/visual/cognitive-transport.js";
import { exactW1 } from "../src/visual/exact-w1.js";
import { withProvenance } from "../src/visual/model-provenance.js";
import { DISTANCE_PROVENANCE } from "../src/visual/provenance/distance.js";

const RUNS = 1000;
const N = COGNITIVE_TRAITS.length;

// ── Independent oracle: dense two-phase simplex on the transportation LP ──

/**
 * min sum c_ij x_ij  s.t.  sum_j x_ij = a_i,  sum_i x_ij = b_j,  x >= 0.
 *
 * Tableau simplex with artificial variables, Bland's rule (smallest-index
 * entering and leaving), two phases. One of the n+m equality constraints is
 * redundant; the artificial left in the basis for it is driven out or its row
 * dropped before phase II. Returns the optimal cost.
 */
function simplexTransport(a: number[], b: number[], c: number[][]): number {
  const n = a.length, m = b.length;
  const nx = n * m;           // transport variables x_ij at column i*m + j
  const rows = n + m;         // constraints
  const nv = nx + rows;       // + one artificial per row
  const RHS = nv;
  const TOL = 1e-11;

  // Build the tableau.
  const T: number[][] = [];
  const basis: number[] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(nv + 1).fill(0);
    for (let j = 0; j < m; j++) row[i * m + j] = 1;
    row[nx + i] = 1; row[RHS] = a[i];
    T.push(row); basis.push(nx + i);
  }
  for (let j = 0; j < m; j++) {
    const row = new Array<number>(nv + 1).fill(0);
    for (let i = 0; i < n; i++) row[i * m + j] = 1;
    row[nx + n + j] = 1; row[RHS] = b[j];
    T.push(row); basis.push(nx + n + j);
  }
  const isArtificial = (col: number) => col >= nx;

  function pivot(r: number, col: number, obj: number[]) {
    const p = T[r][col];
    for (let k = 0; k <= nv; k++) T[r][k] /= p;
    for (let i = 0; i < T.length; i++) {
      if (i === r || Math.abs(T[i][col]) < TOL) continue;
      const f = T[i][col];
      for (let k = 0; k <= nv; k++) T[i][k] -= f * T[r][k];
    }
    if (Math.abs(obj[col]) >= TOL) {
      const f = obj[col];
      for (let k = 0; k <= nv; k++) obj[k] -= f * T[r][k];
    }
    basis[r] = col;
  }

  function run(obj: number[], allowed: (col: number) => boolean) {
    for (let iter = 0; iter < 10000; iter++) {
      let enter = -1;
      for (let k = 0; k < nv; k++) if (allowed(k) && obj[k] < -TOL) { enter = k; break; } // Bland: smallest index
      if (enter < 0) return;
      let leave = -1, best = Infinity;
      for (let r = 0; r < T.length; r++) {
        if (T[r][enter] <= TOL) continue;
        const ratio = T[r][RHS] / T[r][enter];
        if (ratio < best - TOL || (Math.abs(ratio - best) <= TOL && leave >= 0 && basis[r] < basis[leave])) { best = ratio; leave = r; }
      }
      if (leave < 0) throw new Error("oracle: unbounded (impossible for a transportation LP)");
      pivot(leave, enter, obj);
    }
    throw new Error("oracle: did not converge");
  }

  // Phase I: minimise the sum of artificials. Reduced costs for the original
  // columns are -(column sum over all rows), the rhs entry is -(sum of rhs).
  const obj1 = new Array<number>(nv + 1).fill(0);
  for (let k = 0; k < nx; k++) for (let r = 0; r < rows; r++) obj1[k] -= T[r][k];
  for (let r = 0; r < rows; r++) obj1[RHS] -= T[r][RHS];
  run(obj1, () => true);
  if (-obj1[RHS] > 1e-8) throw new Error(`oracle: infeasible (phase I objective ${-obj1[RHS]})`);

  // Drive artificials out of the basis; a row with no usable original column is redundant.
  for (let r = T.length - 1; r >= 0; r--) {
    if (!isArtificial(basis[r])) continue;
    let col = -1;
    for (let k = 0; k < nx; k++) if (Math.abs(T[r][k]) > 1e-9) { col = k; break; }
    if (col >= 0) pivot(r, col, obj1);
    else { T.splice(r, 1); basis.splice(r, 1); }
  }

  // Phase II: the real objective, with artificials barred from entering.
  const obj2 = new Array<number>(nv + 1).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) obj2[i * m + j] = c[i][j];
  for (let r = 0; r < T.length; r++) {
    const bcol = basis[r];
    if (Math.abs(obj2[bcol]) < TOL) continue;
    const f = obj2[bcol];
    for (let k = 0; k <= nv; k++) obj2[k] -= f * T[r][k];
  }
  run(obj2, (col) => !isArtificial(col));

  // Self-check: read the plan off the tableau and recompute its cost.
  const x = new Array<number>(nx).fill(0);
  for (let r = 0; r < T.length; r++) if (!isArtificial(basis[r])) x[basis[r]] = T[r][RHS];
  let cost = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    if (x[i * m + j] < -1e-9) throw new Error("oracle: negative plan entry");
    cost += x[i * m + j] * c[i][j];
  }
  if (Math.abs(cost - -obj2[RHS]) > 1e-9) throw new Error("oracle: tableau objective disagrees with its own plan");
  return cost;
}

// ── Arbitraries ──

/** A random trait record over the real vocabulary; values in [0, 1]. */
const traitsArb = fc
  .array(fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }), { minLength: N, maxLength: N })
  .map((vals) => {
    const t: Record<string, number> = {};
    COGNITIVE_TRAITS.forEach((name, i) => { t[name] = vals[i]; });
    return t;
  });
const profileArb = traitsArb.map((t, ) => buildOTCognitiveProfile("p", t));

/** A random small instance: n points in the unit square (Euclidean ground metric) and two distributions over them. */
const smallInstanceArb = fc.integer({ min: 3, max: 6 }).chain((n) =>
  fc.record({
    points: fc.array(fc.tuple(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true })), { minLength: n, maxLength: n }),
    wa: fc.array(fc.double({ min: 0.01, max: 1, noNaN: true }), { minLength: n, maxLength: n }),
    wb: fc.array(fc.double({ min: 0.01, max: 1, noNaN: true }), { minLength: n, maxLength: n }),
  }).map(({ points, wa, wb }) => {
    const norm = (w: number[]) => { const s = w.reduce((x, y) => x + y, 0); return w.map((v) => v / s); };
    const cost = points.map((p) => points.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])));
    return { a: norm(wa), b: norm(wb), cost };
  }),
);

const COST = traitGroundCostMatrix();
const MAX_COST = Math.max(...COST.flat());
let minOff = Infinity;
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j) minOff = Math.min(minOff, COST[i][j]);
const tv = (p: Float64Array, q: Float64Array) => { let s = 0; for (let i = 0; i < N; i++) s += Math.abs(p[i] - q[i]); return 0.5 * s; };

// ── Tests ──

describe("exact W1: metric axioms on the 29-trait problem", () => {
  test("the ground cost matrix is what the metric tests assume", () => {
    expect(MAX_COST).toBe(0.8);
    expect(minOff).toBe(0.2);
    for (let i = 0; i < N; i++) expect(COST[i][i]).toBe(0);
  });

  test("W1(a, a) = 0", () => {
    fc.assert(fc.property(profileArb, (p) => {
      expect(cognitiveDistance(p, p).w1).toBeLessThan(1e-12);
    }), { numRuns: RUNS });
  });

  test("symmetry: W1(a, b) = W1(b, a)", () => {
    fc.assert(fc.property(profileArb, profileArb, (p, q) => {
      expect(Math.abs(cognitiveDistance(p, q).w1 - cognitiveDistance(q, p).w1)).toBeLessThan(1e-9);
    }), { numRuns: RUNS });
  });

  test("triangle inequality on random triples", () => {
    fc.assert(fc.property(profileArb, profileArb, profileArb, (p, q, r) => {
      const pq = cognitiveDistance(p, q).w1, qr = cognitiveDistance(q, r).w1, pr = cognitiveDistance(p, r).w1;
      expect(pr).toBeLessThanOrEqual(pq + qr + 1e-9);
    }), { numRuns: RUNS });
  });

  test("0 <= W1 <= max ground cost, and the total-variation sandwich c_min*TV <= W1 <= c_max*TV", () => {
    fc.assert(fc.property(profileArb, profileArb, (p, q) => {
      const w1 = cognitiveDistance(p, q).w1;
      const t = tv(p.distribution, q.distribution);
      expect(w1).toBeGreaterThanOrEqual(0);
      expect(w1).toBeLessThanOrEqual(MAX_COST + 1e-12);
      expect(w1).toBeGreaterThanOrEqual(minOff * t - 1e-9);
      expect(w1).toBeLessThanOrEqual(MAX_COST * t + 1e-9);
    }), { numRuns: RUNS });
  });

  test("trait contributions are the optimal plan's cost split per endpoint: they sum to w1 and are symmetric", () => {
    fc.assert(fc.property(profileArb, profileArb, (p, q) => {
      const ab = cognitiveDistance(p, q), ba = cognitiveDistance(q, p);
      const sum = Object.values(ab.traitContributions).reduce((x, y) => x + y, 0);
      expect(Math.abs(sum - ab.w1)).toBeLessThan(1e-9);
      for (const t of COGNITIVE_TRAITS) {
        expect(ab.traitContributions[t]).toBeGreaterThanOrEqual(0);
        expect(Math.abs(ab.traitContributions[t] - ba.traitContributions[t])).toBeLessThan(1e-9);
      }
    }), { numRuns: RUNS });
  });

  test("the solver's plan is a feasible coupling of the two distributions", () => {
    fc.assert(fc.property(profileArb, profileArb, (p, q) => {
      const { plan } = exactW1(p.distribution, q.distribution, COST);
      for (let i = 0; i < N; i++) {
        let row = 0, col = 0;
        for (let j = 0; j < N; j++) { row += plan[i][j]; col += plan[j][i]; expect(plan[i][j]).toBeGreaterThanOrEqual(0); }
        expect(Math.abs(row - p.distribution[i])).toBeLessThan(1e-9);
        expect(Math.abs(col - q.distribution[i])).toBeLessThan(1e-9);
      }
    }), { numRuns: RUNS });
  });
});

describe("exact W1 agrees with an independent simplex oracle", () => {
  test("random 3-6 point instances with Euclidean ground costs, within 1e-9", () => {
    fc.assert(fc.property(smallInstanceArb, ({ a, b, cost }) => {
      const flow = exactW1(a, b, cost).cost;
      const lp = simplexTransport(a, b, cost);
      expect(Math.abs(flow - lp)).toBeLessThan(1e-9);
    }), { numRuns: RUNS });
  });

  test("a hand-checked instance: moving 0.5 of mass one unit costs 0.5", () => {
    // Three points on a line at 0, 1, 2. a = all at 0, b = half at 0, half at 1.
    const cost = [[0, 1, 2], [1, 0, 1], [2, 1, 0]];
    expect(exactW1([1, 0, 0], [0.5, 0.5, 0], cost).cost).toBeCloseTo(0.5, 12);
    expect(simplexTransport([1, 0, 0], [0.5, 0.5, 0], cost)).toBeCloseTo(0.5, 12);
    // The old weighted-L1 formula would give 0.5 * mean(1, 2) + 0.5 * mean(1, 1) = 1.25.
  });

  test("the old weighted-L1 formula is NOT the W1 on an instance where the ground metric matters", () => {
    // Two traits in one domain (cost 0.2) and one far away (cost 0.8): shifting mass
    // between the siblings must be cheap. The weighted L1 scores it by each
    // trait's mean distance to everything, so it cannot tell the two moves apart.
    const cost = [[0, 0.2, 0.8], [0.2, 0, 0.8], [0.8, 0.8, 0]];
    const sibling = exactW1([0.6, 0.2, 0.2], [0.2, 0.6, 0.2], cost).cost;
    const far = exactW1([0.6, 0.2, 0.2], [0.2, 0.2, 0.6], cost).cost;
    expect(sibling).toBeCloseTo(0.4 * 0.2, 12);
    expect(far).toBeCloseTo(0.4 * 0.8, 12);
    const weightedL1 = (a: number[], b: number[]) => a.reduce((s, ai, i) => {
      const mean = cost[i].filter((_, j) => j !== i).reduce((x, y) => x + y, 0) / (a.length - 1);
      return s + Math.abs(ai - b[i]) * mean;
    }, 0);
    expect(weightedL1([0.6, 0.2, 0.2], [0.2, 0.6, 0.2])).toBeCloseTo(0.4, 12); // same number ...
    expect(weightedL1([0.6, 0.2, 0.2], [0.2, 0.2, 0.6])).toBeCloseTo(0.52, 12); // ... and neither is W1
  });
});

describe("documented modelling limit and provenance", () => {
  test("proportional trait vectors are at distance 0 (the simplex discards scale; deliberate, documented)", () => {
    const low: Record<string, number> = {}, high: Record<string, number> = {};
    for (const t of COGNITIVE_TRAITS) { low[t] = 0.2; high[t] = 0.8; }
    const d = cognitiveDistance(buildOTCognitiveProfile("low", low), buildOTCognitiveProfile("high", high));
    expect(d.w1).toBeLessThan(1e-12);
    expect(d.sliced).toBeLessThan(1e-12);
  });

  test("every registered distance constant is read by one distance call, and nothing unregistered is", () => {
    const { provenance } = withProvenance(() => {
      const t: Record<string, number> = {};
      for (const name of COGNITIVE_TRAITS) t[name] = 0.3;
      t.patience = 0.9;
      return cognitiveDistance(buildOTCognitiveProfile("a", t), buildOTCognitiveProfile("b", { patience: 0.1 }));
    });
    const registered = DISTANCE_PROVENANCE.map((e) => e.id).sort();
    expect(provenance.hypotheses.length + provenance.counts.definition).toBe(registered.length);
    expect(provenance.counts.hypothesis).toBe(5);
    expect(provenance.counts.definition).toBe(1);
    // Reading an unregistered id throws inside param(), so "read but not registered" cannot pass silently.
  });

  test("the ground metric values come from the registry, not from literals", () => {
    const byId = Object.fromEntries(DISTANCE_PROVENANCE.map((e) => [e.id, e.value]));
    const idx = (name: string) => COGNITIVE_TRAITS.indexOf(name as typeof COGNITIVE_TRAITS[number]);
    expect(COST[idx("patience")][idx("riskTolerance")]).toBe(byId["distance.groundSameDomain"]);
    expect(COST[idx("patience")][idx("resilience")]).toBe(byId["distance.groundRelatedDomain"]);
    expect(COST[idx("patience")][idx("trustCalibration")]).toBe(byId["distance.groundUnrelatedDomain"]);
  });
});
