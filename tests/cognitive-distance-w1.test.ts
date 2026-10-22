/**
 * cognitiveDistance.w1 is an exact GENERALIZED Wasserstein-1 distance.
 *
 * History. Until 2026-10-21 the field called "w1" was sum_i |a_i - b_i| *
 * mean_j d(i,j): a weighted L1 that never looked at which traits mass moved
 * between. 2026-10-21 replaced it with the exact balanced W1 between the two
 * profiles normalised to the simplex, solved as a successive-shortest-path
 * min-cost flow (src/visual/exact-w1.ts). Normalising discarded scale: every
 * trait 0.2 and every trait 0.8 were at distance 0, which this file pinned as a
 * documented limit. The limit is now gone: w1 is the Piccoli-Rossi generalized
 * W1 (mass creation/destruction at distance.slackCost per unit), computed by the
 * slack-bin reduction on 30 bins (29 traits + slack).
 *
 * What is checked, universally quantified over random profiles (fast-check,
 * 1000 runs each, trait values uniform on [0, 1] in steps of 1e-6 -- not
 * fc.double, which piles samples up near 0 and the bounds):
 *
 *   1. metric axioms and bounds: identity, symmetry, triangle inequality,
 *      non-negativity, w1 <= slackCost, the level sandwich
 *      c|mean diff| <= w1 <= c*mean|diff|, and the total-variation sandwich
 *      on the 30-bin measures (which makes w1 > 0 whenever the traits differ);
 *   2. the analytic uniform-level case: all u versus all v is exactly c|u - v|,
 *      so all 0.2 versus all 0.8 is 0.6 * 0.4 = 0.24;
 *   3. scale monotonicity: moving every trait of A toward B by a common fraction
 *      scales w1 by exactly that fraction, so pushing traits further from B
 *      never decreases it;
 *   4. agreement with an INDEPENDENT oracle: a dense two-phase tableau simplex
 *      (Bland's rule) written here, sharing no code with the flow solver, on
 *      the balanced transportation LP (with and without a slack bin) AND on the
 *      Piccoli-Rossi LP itself (explicit create/destroy variables, no slack
 *      bin), which is what checks that the reduction computes the distance it
 *      claims to; instances include zero atoms, disjoint supports and an
 *      all-slack side;
 *   5. overallLevel is exactly 0.5 * c * |mean diff| (the attribution does not
 *      depend on which tied optimal plan the solver returns);
 *   6. solver tolerances: residuals each below EPS that sum above it, and mass
 *      differences inside the 1e-9 balance check, neither throw, and a short
 *      side yields the min-cost flow of the smaller mass in either direction.
 *
 * Absence checks, run by hand:
 *   - with exactW1's body swapped for the old weighted-L1 formula the oracle
 *     test fails on the first runs (2026-10-21; the metric tests alone would
 *     not all have caught it, which is why the oracle exists);
 *   - with cognitiveDistance swapped back to the simplex-only W1 (2026-10-21)
 *     the scale tests fail; the simplex-only distance is also kept below as
 *     `simplexOnlyW1` and a test asserts it fails the scale case, so the
 *     discrimination is pinned permanently, not just remembered;
 *   - exactW1 with its old stopping rule (loop while the TOTAL unshipped mass
 *     exceeds EPS) fails the four tolerance tests; with its old end-node rule
 *     (reduced distance) the short-side test fails; with that rule AND the
 *     uncrossing step removed the overallLevel test fails, and with the rule
 *     alone it passes, i.e. uncrossing is what holds it (all 2026-10-21).
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import {
  COGNITIVE_TRAITS,
  OVERALL_LEVEL_KEY,
  buildOTCognitiveProfile,
  cognitiveDistance,
  traitGroundCostMatrix,
  traitGeneralizedCostMatrix,
  traitsToLevelMeasure,
  type OTCognitiveProfile,
} from "../src/visual/cognitive-transport.js";
import { exactW1 } from "../src/visual/exact-w1.js";
import { withProvenance } from "../src/visual/model-provenance.js";
import { DISTANCE_PROVENANCE } from "../src/visual/provenance/distance.js";

const RUNS = 1000;
const N = COGNITIVE_TRAITS.length;

// ── Independent oracle: dense two-phase simplex on an equality-form LP ──

/**
 * min c.x  s.t.  A x = rhs,  x >= 0,  rhs >= 0.
 *
 * Tableau simplex with one artificial variable per row, Bland's rule
 * (smallest-index entering and leaving), two phases. A redundant row leaves an
 * artificial in the basis that cannot be pivoted out; that row is dropped before
 * phase II. Returns the optimal cost, after checking the plan it read off the
 * tableau against the ORIGINAL constraints and objective.
 */
function simplexLP(A: number[][], rhs: number[], c: number[]): number {
  const rows = A.length;
  const nx = c.length;
  const nv = nx + rows;       // + one artificial per row
  const RHS = nv;
  const TOL = 1e-11;

  // Build the tableau.
  const T: number[][] = [];
  const basis: number[] = [];
  for (let r = 0; r < rows; r++) {
    if (!(rhs[r] >= 0)) throw new Error("oracle: rhs must be non-negative");
    const row = new Array<number>(nv + 1).fill(0);
    for (let k = 0; k < nx; k++) row[k] = A[r][k];
    row[nx + r] = 1; row[RHS] = rhs[r];
    T.push(row); basis.push(nx + r);
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
    for (let iter = 0; iter < 100000; iter++) {
      let enter = -1;
      for (let k = 0; k < nv; k++) if (allowed(k) && obj[k] < -TOL) { enter = k; break; } // Bland: smallest index
      if (enter < 0) return;
      let leave = -1, best = Infinity;
      for (let r = 0; r < T.length; r++) {
        if (T[r][enter] <= TOL) continue;
        const ratio = T[r][RHS] / T[r][enter];
        if (ratio < best - TOL || (Math.abs(ratio - best) <= TOL && leave >= 0 && basis[r] < basis[leave])) { best = ratio; leave = r; }
      }
      if (leave < 0) throw new Error("oracle: unbounded (impossible for these LPs)");
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
  for (let k = 0; k < nx; k++) obj2[k] = c[k];
  for (let r = 0; r < T.length; r++) {
    const bcol = basis[r];
    if (Math.abs(obj2[bcol]) < TOL) continue;
    const f = obj2[bcol];
    for (let k = 0; k <= nv; k++) obj2[k] -= f * T[r][k];
  }
  run(obj2, (col) => !isArtificial(col));

  // Self-check: read the plan off the tableau, check it against the original
  // constraints, and recompute its cost.
  const x = new Array<number>(nx).fill(0);
  for (let r = 0; r < T.length; r++) if (!isArtificial(basis[r])) x[basis[r]] = T[r][RHS];
  for (let k = 0; k < nx; k++) if (x[k] < -1e-9) throw new Error("oracle: negative plan entry");
  for (let r = 0; r < rows; r++) {
    let lhs = 0;
    for (let k = 0; k < nx; k++) lhs += A[r][k] * x[k];
    if (Math.abs(lhs - rhs[r]) > 1e-9) throw new Error(`oracle: plan violates row ${r} by ${lhs - rhs[r]}`);
  }
  let cost = 0;
  for (let k = 0; k < nx; k++) cost += x[k] * c[k];
  if (Math.abs(cost - -obj2[RHS]) > 1e-9) throw new Error("oracle: tableau objective disagrees with its own plan");
  return cost;
}

/** Balanced transportation LP: sum_j x_ij = a_i, sum_i x_ij = b_j. Variable x_ij at column i*m + j. */
function simplexTransport(a: number[], b: number[], c: number[][]): number {
  const n = a.length, m = b.length;
  const A: number[][] = [];
  for (let i = 0; i < n; i++) { const row = new Array<number>(n * m).fill(0); for (let j = 0; j < m; j++) row[i * m + j] = 1; A.push(row); }
  for (let j = 0; j < m; j++) { const row = new Array<number>(n * m).fill(0); for (let i = 0; i < n; i++) row[i * m + j] = 1; A.push(row); }
  const cost: number[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) cost.push(c[i][j]);
  return simplexLP(A, [...a, ...b], cost);
}

/**
 * Piccoli-Rossi generalized W1 (a = cs, b = 1) as an LP, with NO slack bin:
 *   min sum d_ij x_ij + cs * (sum_i u_i + sum_j v_j)
 *   s.t. sum_j x_ij + u_i = a_i   (u_i: mass of a destroyed at i)
 *        sum_i x_ij + v_j = b_j   (v_j: mass of b not reached, i.e. created at j)
 * a and b need not have equal mass. Columns: x (n*n), then u (n), then v (n).
 */
function simplexPiccoliRossi(a: number[], b: number[], d: number[][], cs: number): number {
  const n = a.length;
  const nx = n * n + 2 * n;
  const A: number[][] = [];
  for (let i = 0; i < n; i++) { const row = new Array<number>(nx).fill(0); for (let j = 0; j < n; j++) row[i * n + j] = 1; row[n * n + i] = 1; A.push(row); }
  for (let j = 0; j < n; j++) { const row = new Array<number>(nx).fill(0); for (let i = 0; i < n; i++) row[i * n + j] = 1; row[n * n + n + j] = 1; A.push(row); }
  const cost: number[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cost.push(d[i][j]);
  for (let k = 0; k < 2 * n; k++) cost.push(cs);
  return simplexLP(A, [...a, ...b], cost);
}

// ── Arbitraries ──

/** Uniform on [0, 1] in steps of 1e-6. */
const unit = fc.noBias(fc.integer({ min: 0, max: 1_000_000 })).map((i) => i / 1e6);
/** A trait value that is exactly 0 a fifth of the time, so zero atoms are exercised. */
const atom = fc.oneof({ arbitrary: fc.constant(0), weight: 1 }, { arbitrary: unit, weight: 4 });

/** A random trait record over the real vocabulary; values in [0, 1]. */
const traitsArb = fc
  .array(unit, { minLength: N, maxLength: N })
  .map((vals) => {
    const t: Record<string, number> = {};
    COGNITIVE_TRAITS.forEach((name, i) => { t[name] = vals[i]; });
    return t;
  });
const profileArb = traitsArb.map((t) => buildOTCognitiveProfile("p", t));

const uniform = (v: number) => { const t: Record<string, number> = {}; for (const name of COGNITIVE_TRAITS) t[name] = v; return t; };
/** Traits of A moved toward B's by the fraction 1 - lambda: t_B + lambda * (t_A - t_B). Stays in [0, 1] for lambda in [0, 1]. */
const toward = (a: Record<string, number>, b: Record<string, number>, lambda: number) => {
  const t: Record<string, number> = {};
  for (const name of COGNITIVE_TRAITS) t[name] = b[name] + lambda * (a[name] - b[name]);
  return t;
};

const euclidean = (points: [number, number][]) => points.map((p) => points.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])));

/** A random small balanced instance: n points in the unit square (Euclidean ground metric) and two distributions over them. */
const smallInstanceArb = fc.integer({ min: 3, max: 6 }).chain((n) =>
  fc.record({
    points: fc.array(fc.tuple(unit, unit), { minLength: n, maxLength: n }),
    wa: fc.array(unit.map((u) => 0.01 + 0.99 * u), { minLength: n, maxLength: n }),
    wb: fc.array(unit.map((u) => 0.01 + 0.99 * u), { minLength: n, maxLength: n }),
  }).map(({ points, wa, wb }) => {
    const norm = (w: number[]) => { const s = w.reduce((x, y) => x + y, 0); return w.map((v) => v / s); };
    return { a: norm(wa), b: norm(wb), cost: euclidean(points) };
  }),
);

/**
 * How the two weight vectors of an oracle instance share their support:
 *   random    independent draws, zero a fifth of the time per point;
 *   disjoint  a lives only on a random proper subset S, b only off it;
 *   oneEmpty  a is all zero (balanced instances re-seed one point, since a
 *             probability vector cannot be empty; slack instances keep it
 *             empty, which is a measure that is all slack).
 */
type Support = "random" | "disjoint" | "oneEmpty";
const supportArb = fc.constantFrom<Support>("random", "disjoint", "oneEmpty");
function shapeSupport(mode: Support, wa: number[], wb: number[], mask: boolean[], keepEmpty: boolean) {
  const k = wa.length;
  let a = wa.slice(), b = wb.slice();
  if (mode === "disjoint") {
    // A proper non-empty subset: force the first point in and the last one out.
    const inS = mask.map((m, i) => (i === 0 ? true : i === k - 1 ? false : m));
    a = a.map((v, i) => (inS[i] ? Math.max(v, 1e-3) : 0));
    b = b.map((v, i) => (inS[i] ? 0 : Math.max(v, 1e-3)));
  } else if (mode === "oneEmpty") {
    a = a.map(() => 0);
  }
  if (!keepEmpty) {
    // Balanced instances need positive total mass on both sides.
    if (!a.some((v) => v > 0)) a[0] = 1;
    if (!b.some((v) => v > 0)) b[k - 1] = 1;
  }
  return { a, b };
}

/** Balanced instances with zero atoms, disjoint supports and point masses. */
const supportInstanceArb = fc.integer({ min: 3, max: 6 }).chain((n) =>
  fc.record({
    points: fc.array(fc.tuple(unit, unit), { minLength: n, maxLength: n }),
    wa: fc.array(atom, { minLength: n, maxLength: n }),
    wb: fc.array(atom, { minLength: n, maxLength: n }),
    mask: fc.array(fc.boolean(), { minLength: n, maxLength: n }),
    mode: supportArb,
  }).map(({ points, wa, wb, mask, mode }) => {
    const { a, b } = shapeSupport(mode, wa, wb, mask, false);
    const norm = (w: number[]) => { const s = w.reduce((x, y) => x + y, 0); return w.map((v) => v / s); };
    return { a: norm(a), b: norm(b), cost: euclidean(points), mode };
  }),
);

/**
 * A random small UNBALANCED instance in the shape cognitiveDistance builds: k
 * points with Euclidean ground costs, trait values in [0, 1] (zeros, disjoint
 * supports and an all-zero side included) giving masses t_i / k, and a
 * creation/destruction cost cs drawn anywhere in [max ground / 2, max ground / 2
 * + 0.5], the range where the reduction is claimed to be exact.
 */
const slackInstanceArb = fc.integer({ min: 3, max: 6 }).chain((k) =>
  fc.record({
    points: fc.array(fc.tuple(unit, unit), { minLength: k, maxLength: k }),
    ta: fc.array(atom, { minLength: k, maxLength: k }),
    tb: fc.array(atom, { minLength: k, maxLength: k }),
    mask: fc.array(fc.boolean(), { minLength: k, maxLength: k }),
    mode: supportArb,
    extra: unit,
  }).map(({ points, ta, tb, mask, mode, extra }) => {
    const ground = euclidean(points);
    const maxGround = Math.max(...ground.flat());
    const cs = maxGround / 2 + 0.5 * extra;
    const { a, b } = shapeSupport(mode, ta, tb, mask, true);
    return { ground, cs, a: a.map((t) => t / k), b: b.map((t) => t / k), mode };
  }),
);

/**
 * Two probability vectors that agree up to residuals each at or below the
 * solver's EPS (1e-12) but summing to more than EPS: b_i = a_i + k on even i and
 * a_i - k on odd i, k in [0.25e-12, 0.99e-12], n even in [10, 40], so the total
 * residual (n/2) k is 1.25e-12 to 2e-11. The solver used to loop while the TOTAL
 * unshipped supply exceeded EPS, and threw "no augmenting path" here.
 */
const nearIdenticalArb = fc.integer({ min: 5, max: 20 }).chain((half) =>
  fc.record({
    w: fc.array(unit.map((u) => 0.01 + 0.99 * u), { minLength: 2 * half, maxLength: 2 * half }),
    k: unit.map((u) => (0.25 + 0.74 * u) * 1e-12),
    scale: unit.map((u) => 0.1 + 0.9 * u),
  }).map(({ w, k, scale }) => {
    const s = w.reduce((x, y) => x + y, 0);
    const a = w.map((v) => v / s);
    const b = a.map((v, i) => (i % 2 === 0 ? v + k : v - k));
    // A three-level metric (scale/3, 2scale/3, scale off the diagonal).
    const cost = a.map((_, i) => a.map((_, j) => (i === j ? 0 : (scale * (1 + ((i + j) % 3))) / 3)));
    return { a, b, cost, k, n: a.length, maxCost: scale };
  }),
);

/**
 * A balanced pair, then one entry of b shrunk so the masses differ by eps in
 * [5e-12, 9e-10]: inside the 1e-9 balance check, which accepted these inputs
 * and then threw on any eps above EPS.
 */
const imbalanceArb = fc.integer({ min: 3, max: 30 }).chain((n) =>
  fc.record({
    wa: fc.array(unit.map((u) => 0.01 + 0.99 * u), { minLength: n, maxLength: n }),
    wb: fc.array(unit.map((u) => 0.01 + 0.99 * u), { minLength: n, maxLength: n }),
    e: unit.map((u) => 5e-12 + u * (9e-10 - 5e-12)),
    at: fc.integer({ min: 0, max: n - 1 }),
  }).map(({ wa, wb, e, at }) => {
    const norm = (w: number[]) => { const s = w.reduce((x, y) => x + y, 0); return w.map((v) => v / s); };
    const a = norm(wa), b = norm(wb);
    const short = b.slice();
    short[at] -= e;
    // Points on a line: |i - j| / n, a metric with max cost (n - 1) / n.
    const cost = a.map((_, i) => a.map((_, j) => Math.abs(i - j) / n));
    return { a, b, short, eps: b[at] - short[at], cost, maxCost: (n - 1) / n };
  }),
);

/** The slack-bin reduction, written independently of traitsToLevelMeasure / the production cost matrix. */
function withSlackBin(a: number[], b: number[], ground: number[][], cs: number) {
  const slack = (m: number[]) => [...m, Math.max(0, 1 - m.reduce((x, y) => x + y, 0))];
  const cost = ground.map((row) => [...row, cs]);
  cost.push([...ground.map(() => cs), 0]);
  return { a: slack(a), b: slack(b), cost };
}

const COST = traitGroundCostMatrix();
const GEN = traitGeneralizedCostMatrix();
const MAX_COST = Math.max(...COST.flat());
let minOff = Infinity;
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j) minOff = Math.min(minOff, COST[i][j]);
const SLACK = DISTANCE_PROVENANCE.find((e) => e.id === "distance.slackCost")!.value;

const mean = (v: number[]) => v.reduce((x, y) => x + y, 0) / v.length;
const traitVec = (p: OTCognitiveProfile) => COGNITIVE_TRAITS.map((t) => p.traits[t]);
const tv = (p: ArrayLike<number>, q: ArrayLike<number>) => { let s = 0; for (let i = 0; i < p.length; i++) s += Math.abs(p[i] - q[i]); return 0.5 * s; };

/**
 * The distance as shipped on 2026-10-21, before this change: exact W1 between
 * the two profiles normalised to the simplex, on the 29 x 29 ground cost. Kept
 * as the control for the absence test.
 */
const simplexOnlyW1 = (p: OTCognitiveProfile, q: OTCognitiveProfile) => exactW1(p.distribution, q.distribution, COST).cost;

// ── Tests ──

describe("generalized W1: metric axioms and bounds on the 29-trait problem", () => {
  test("the cost matrices are what the tests assume", () => {
    expect(MAX_COST).toBe(0.8);
    expect(minOff).toBe(0.2);
    for (let i = 0; i < N; i++) expect(COST[i][i]).toBe(0);
    expect(SLACK).toBe(0.4);
    expect(GEN.length).toBe(N + 1);
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

  test("non-negativity and the upper bound: 0 <= W1 <= slackCost", () => {
    fc.assert(fc.property(profileArb, profileArb, (p, q) => {
      const w1 = cognitiveDistance(p, q).w1;
      expect(w1).toBeGreaterThanOrEqual(0);
      expect(w1).toBeLessThanOrEqual(SLACK + 1e-12);
    }), { numRuns: RUNS });
  });

  test("level sandwich: c * |mean(tA) - mean(tB)| <= W1 <= c * mean|tA - tB|", () => {
    // Lower: the mass imbalance can only be created or destroyed, at c per unit.
    // Upper: routing every difference through the slack bin is always feasible.
    fc.assert(fc.property(profileArb, profileArb, (p, q) => {
      const w1 = cognitiveDistance(p, q).w1;
      const a = traitVec(p), b = traitVec(q);
      expect(w1).toBeGreaterThanOrEqual(SLACK * Math.abs(mean(a) - mean(b)) - 1e-9);
      expect(w1).toBeLessThanOrEqual(SLACK * mean(a.map((x, i) => Math.abs(x - b[i]))) + 1e-9);
    }), { numRuns: RUNS });
  });

  test("total-variation sandwich on the 30-bin measures, so W1 > 0 whenever any trait differs", () => {
    fc.assert(fc.property(profileArb, profileArb, (p, q) => {
      const w1 = cognitiveDistance(p, q).w1;
      const t = tv(traitsToLevelMeasure(p.traits), traitsToLevelMeasure(q.traits));
      expect(w1).toBeGreaterThanOrEqual(minOff * t - 1e-9);
      expect(w1).toBeLessThanOrEqual(MAX_COST * t + 1e-9);
      const b = traitVec(q);
      if (traitVec(p).some((x, i) => x !== b[i])) expect(w1).toBeGreaterThan(0);
    }), { numRuns: RUNS });
  });

  test("contributions: 29 traits plus overallLevel, non-negative, summing to w1, symmetric", () => {
    fc.assert(fc.property(profileArb, profileArb, (p, q) => {
      const ab = cognitiveDistance(p, q), ba = cognitiveDistance(q, p);
      const keys = [...COGNITIVE_TRAITS, OVERALL_LEVEL_KEY];
      expect(Object.keys(ab.traitContributions).sort()).toEqual([...keys].sort());
      const sum = Object.values(ab.traitContributions).reduce((x, y) => x + y, 0);
      expect(Math.abs(sum - ab.w1)).toBeLessThan(1e-9);
      for (const t of keys) {
        expect(ab.traitContributions[t]).toBeGreaterThanOrEqual(0);
        expect(Math.abs(ab.traitContributions[t] - ba.traitContributions[t])).toBeLessThan(1e-9);
      }
    }), { numRuns: RUNS });
  });

  test("overallLevel is exactly 0.5 * c * |mean(tA) - mean(tB)| (the uncrossed plan creates or destroys only the imbalance)", () => {
    // Without the uncrossing step this depends on which of the tied optimal
    // plans the solver lands on: destroy-at-i plus create-at-j costs 2c = 0.8,
    // the same as moving i -> j between unrelated domains.
    fc.assert(fc.property(profileArb, profileArb, (p, q) => {
      const level = cognitiveDistance(p, q).traitContributions[OVERALL_LEVEL_KEY];
      expect(Math.abs(level - 0.5 * SLACK * Math.abs(mean(traitVec(p)) - mean(traitVec(q))))).toBeLessThan(1e-12);
    }), { numRuns: RUNS });
  });

  test("the solver's plan is a feasible coupling of the two 30-bin measures", () => {
    fc.assert(fc.property(profileArb, profileArb, (p, q) => {
      const a = traitsToLevelMeasure(p.traits), b = traitsToLevelMeasure(q.traits);
      const { plan } = exactW1(a, b, GEN);
      for (let i = 0; i <= N; i++) {
        let row = 0, col = 0;
        for (let j = 0; j <= N; j++) { row += plan[i][j]; col += plan[j][i]; expect(plan[i][j]).toBeGreaterThanOrEqual(0); }
        expect(Math.abs(row - a[i])).toBeLessThan(1e-9);
        expect(Math.abs(col - b[i])).toBeLessThan(1e-9);
      }
    }), { numRuns: RUNS });
  });
});

describe("generalized W1: the scale is kept", () => {
  test("all traits 0.2 versus all traits 0.8 is exactly 0.6 * slackCost = 0.24", () => {
    // Trait i holds 0.2/29 in A and 0.8/29 in B; A's slack bin holds 0.8, B's 0.2.
    // B's traits need 0.6 more mass than A's traits have, and only A's slack bin
    // can supply it, at c per unit: W1 >= 0.6c. Keeping 0.2/29 in place at every
    // trait, sending 0.2 slack -> slack free and 0.6 slack -> traits at c attains
    // it: W1 = 0.6c = 0.24.
    const d = cognitiveDistance(buildOTCognitiveProfile("low", uniform(0.2)), buildOTCognitiveProfile("high", uniform(0.8)));
    expect(d.w1).toBeGreaterThan(0);
    expect(d.w1).toBeCloseTo(0.6 * SLACK, 12);
    expect(d.w1).toBeCloseTo(0.24, 12);
    // Every unit of cost is a slack -> trait creation: half to overallLevel, half spread evenly over the traits.
    expect(d.traitContributions[OVERALL_LEVEL_KEY]).toBeCloseTo(0.12, 12);
    for (const t of COGNITIVE_TRAITS) expect(d.traitContributions[t]).toBeCloseTo(0.12 / N, 12);
  });

  test("uniform levels: all traits u versus all traits v is exactly slackCost * |u - v|", () => {
    fc.assert(fc.property(unit, unit, (u, v) => {
      const w1 = cognitiveDistance(buildOTCognitiveProfile("u", uniform(u)), buildOTCognitiveProfile("v", uniform(v))).w1;
      expect(Math.abs(w1 - SLACK * Math.abs(u - v))).toBeLessThan(1e-12);
    }), { numRuns: RUNS });
  });

  test("the largest possible distance is all 0 versus all 1, at exactly slackCost", () => {
    expect(cognitiveDistance(buildOTCognitiveProfile("z", uniform(0)), buildOTCognitiveProfile("o", uniform(1))).w1).toBeCloseTo(SLACK, 12);
  });

  test("scale monotonicity against a uniform level: scaling every deviation of A from B's level v by a factor >= 1 never decreases W1, and scales it exactly", () => {
    // Precisely: B has every trait at v; A_l has trait i at v + l * (tA_i - v).
    // For 0 <= lo <= hi <= 1, A_hi is A_lo with every deviation from v scaled by
    // hi/lo >= 1, and W1(A_lo, B) <= W1(A_hi, B). Stronger, and also asserted:
    // W1(A_l, B) = l * W1(A_1, B) (Kantorovich-Rubinstein: under a metric cost
    // W1 depends only on the signed difference of the measures).
    fc.assert(fc.property(traitsArb, unit, unit, unit, (ta, v, l1, l2) => {
      const lo = Math.min(l1, l2), hi = Math.max(l1, l2);
      const B = uniform(v);
      const pB = buildOTCognitiveProfile("B", B);
      const full = cognitiveDistance(buildOTCognitiveProfile("A", ta), pB).w1;
      const dLo = cognitiveDistance(buildOTCognitiveProfile("lo", toward(ta, B, lo)), pB).w1;
      const dHi = cognitiveDistance(buildOTCognitiveProfile("hi", toward(ta, B, hi)), pB).w1;
      expect(dLo).toBeLessThanOrEqual(dHi + 1e-12);
      expect(Math.abs(dLo - lo * full)).toBeLessThan(1e-9);
      expect(Math.abs(dHi - hi * full)).toBeLessThan(1e-9);
    }), { numRuns: RUNS });
  });

  test("the same homogeneity holds against any profile B, not only a uniform one", () => {
    fc.assert(fc.property(traitsArb, traitsArb, unit, (ta, tb, l) => {
      const pB = buildOTCognitiveProfile("B", tb);
      const full = cognitiveDistance(buildOTCognitiveProfile("A", ta), pB).w1;
      const dl = cognitiveDistance(buildOTCognitiveProfile("Al", toward(ta, tb, l)), pB).w1;
      expect(Math.abs(dl - l * full)).toBeLessThan(1e-9);
    }), { numRuns: RUNS });
  });

  test("absence control: the simplex-only W1 shipped before this change fails the scale case", () => {
    const low = buildOTCognitiveProfile("low", uniform(0.2)), high = buildOTCognitiveProfile("high", uniform(0.8));
    expect(simplexOnlyW1(low, high)).toBeLessThan(1e-12);           // the old limit: proportional = identical
    expect(cognitiveDistance(low, high).w1).toBeCloseTo(0.24, 12);  // the generalized distance sees it
    // And it is not homogeneous: a uniform-0.9 persona and the same persona moved
    // halfway to uniform 0.5 are both at 0 from uniform 0.5 on the simplex.
    const mid = buildOTCognitiveProfile("mid", uniform(0.5));
    expect(simplexOnlyW1(buildOTCognitiveProfile("far", uniform(0.9)), mid)).toBeLessThan(1e-12);
    expect(simplexOnlyW1(buildOTCognitiveProfile("half", toward(uniform(0.9), uniform(0.5), 0.5)), mid)).toBeLessThan(1e-12);
  });

  test("w2 and sliced still live on the simplex: proportional vectors are 0 on both (documented)", () => {
    const d = cognitiveDistance(buildOTCognitiveProfile("low", uniform(0.2)), buildOTCognitiveProfile("high", uniform(0.8)));
    expect(d.w2).toBeLessThan(1e-12);
    expect(d.sliced).toBeLessThan(1e-12);
  });
});

describe("generalized W1 agrees with an independent simplex oracle", () => {
  test("balanced: random 3-6 point instances with Euclidean ground costs, within 1e-9", () => {
    fc.assert(fc.property(smallInstanceArb, ({ a, b, cost }) => {
      const flow = exactW1(a, b, cost).cost;
      const lp = simplexTransport(a, b, cost);
      expect(Math.abs(flow - lp)).toBeLessThan(1e-9);
    }), { numRuns: RUNS });
  });

  test("balanced, with zero atoms, disjoint supports and point masses: flow == transportation LP", () => {
    fc.assert(fc.property(supportInstanceArb, ({ a, b, cost }) => {
      expect(Math.abs(exactW1(a, b, cost).cost - simplexTransport(a, b, cost))).toBeLessThan(1e-9);
    }), { numRuns: RUNS });
  });

  test("with a slack bin (zeros, disjoint supports, an all-slack side): flow == transportation LP == Piccoli-Rossi LP", () => {
    fc.assert(fc.property(slackInstanceArb, ({ ground, cs, a, b }) => {
      const s = withSlackBin(a, b, ground, cs);
      const flow = exactW1(s.a, s.b, s.cost).cost;
      expect(Math.abs(flow - simplexTransport(s.a, s.b, s.cost))).toBeLessThan(1e-9);
      expect(Math.abs(flow - simplexPiccoliRossi(a, b, ground, cs))).toBeLessThan(1e-9);
    }), { numRuns: RUNS });
  });

  test("end to end: cognitiveDistance equals the Piccoli-Rossi LP on the full 29-trait problem", () => {
    // Each LP is 58 rows by 957 columns, so fewer runs; the small-instance test
    // above carries the 1000-run weight, this one ties the production path
    // (measure, cost matrix, canonical order) to the definition.
    fc.assert(fc.property(profileArb, profileArb, (p, q) => {
      const a = traitVec(p).map((t) => t / N), b = traitVec(q).map((t) => t / N);
      expect(Math.abs(cognitiveDistance(p, q).w1 - simplexPiccoliRossi(a, b, COST, SLACK))).toBeLessThan(1e-9);
    }), { numRuns: 25 });
  });

  test("a hand-checked instance: moving 0.5 of mass one unit costs 0.5", () => {
    // Three points on a line at 0, 1, 2. a = all at 0, b = half at 0, half at 1.
    const cost = [[0, 1, 2], [1, 0, 1], [2, 1, 0]];
    expect(exactW1([1, 0, 0], [0.5, 0.5, 0], cost).cost).toBeCloseTo(0.5, 12);
    expect(simplexTransport([1, 0, 0], [0.5, 0.5, 0], cost)).toBeCloseTo(0.5, 12);
    // The old weighted-L1 formula would give 0.5 * mean(1, 2) + 0.5 * mean(1, 1) = 1.25.
  });

  test("a hand-checked unbalanced instance: 0.45 by the LP and by the slack reduction", () => {
    // Two points 1 apart and cs = 0.5, so 2cs equals d: moving a unit and
    // destroying-then-creating it tie. a = (0.5, 0), b = (0.2, 0.6). Keep 0.2 at
    // point 0. a's other 0.3 either moves to point 1 (0.3 * 1) or is destroyed
    // and created there (2 * 0.3 * 0.5): 0.3 either way. b still lacks 0.3 at
    // point 1, which can only be created: 0.15. Total 0.45.
    const ground = [[0, 1], [1, 0]];
    const s = withSlackBin([0.5, 0], [0.2, 0.6], ground, 0.5);
    expect(simplexPiccoliRossi([0.5, 0], [0.2, 0.6], ground, 0.5)).toBeCloseTo(0.45, 12);
    expect(exactW1(s.a, s.b, s.cost).cost).toBeCloseTo(0.45, 12);
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
      const m = cost[i].filter((_, j) => j !== i).reduce((x, y) => x + y, 0) / (a.length - 1);
      return s + Math.abs(ai - b[i]) * m;
    }, 0);
    expect(weightedL1([0.6, 0.2, 0.2], [0.2, 0.6, 0.2])).toBeCloseTo(0.4, 12); // same number ...
    expect(weightedL1([0.6, 0.2, 0.2], [0.2, 0.2, 0.6])).toBeCloseTo(0.52, 12); // ... and neither is W1
  });
});

describe("the 30-bin measure and solver edge cases", () => {
  test("missing traits take the registered default and values outside [0, 1] are clamped", () => {
    const empty = traitsToLevelMeasure({});
    for (let i = 0; i < N; i++) expect(empty[i]).toBeCloseTo(0.5 / N, 15);
    expect(empty[N]).toBeCloseTo(0.5, 12);
    const over = traitsToLevelMeasure({ ...uniform(0.3), patience: 1.7, comprehension: -0.4 });
    const clamped = traitsToLevelMeasure({ ...uniform(0.3), patience: 1, comprehension: 0 });
    expect(Array.from(over)).toEqual(Array.from(clamped));
    const ones = traitsToLevelMeasure(uniform(1));
    expect(ones[N]).toBeGreaterThanOrEqual(0); // the slack bin never goes negative on rounding
  });

  test("trait values far below the solver's EPS do not throw (fast-check counterexample, 2026-10-21)", () => {
    // Several atoms each below 1e-12 summed to more than 1e-12; the solver's loop
    // ran on the total and threw "no augmenting path". Unreachable while the
    // distance floored every trait at 0.01.
    const tiny = { ...uniform(0), resilience: 6.152369232512104e-12, anchoringBias: 2.284438656370251e-11,
      proceduralFluency: 2.300832017034803e-15, authoritySensitivity: 2.9282516801803962e-27,
      readingTendency: 1.2073675392769297e-15, sustainedAttention: 7.042977312377989e-16 };
    const p = buildOTCognitiveProfile("tiny", tiny), q = buildOTCognitiveProfile("zero", uniform(0));
    expect(cognitiveDistance(p, q).w1).toBeLessThan(1e-12);
    expect(cognitiveDistance(q, p).w1).toBeLessThan(1e-12);
  });

  test("near-identical distributions, residuals each <= EPS but summing above it: no throw, cost within the residual", () => {
    // Threw "no augmenting path" on every run before the per-point stopping rule.
    fc.assert(fc.property(nearIdenticalArb, ({ a, b, cost, k, n, maxCost }) => {
      const r = exactW1(a, b, cost);
      expect(r.cost).toBeGreaterThanOrEqual(0);
      expect(r.cost).toBeLessThanOrEqual((n / 2) * k * maxCost + 1e-15);
      for (let i = 0; i < n; i++) {
        let row = 0, col = 0;
        for (let j = 0; j < n; j++) { row += r.plan[i][j]; col += r.plan[j][i]; }
        expect(Math.abs(row - a[i])).toBeLessThan(1e-11);
        expect(Math.abs(col - b[i])).toBeLessThan(1e-11);
      }
    }), { numRuns: RUNS });
  });

  test("masses differing by less than the 1e-9 balance tolerance: no throw, the min-cost flow of the smaller mass, either direction", () => {
    // The balance check accepted |mass_a - mass_b| <= 1e-9 while the loop threw
    // for any difference above EPS. Now the residue is left unshipped and the
    // result is the min-cost flow of value mass_b. Checked against that flow
    // built independently as a BALANCED problem: one extra bin, free to and from
    // everything, that holds the eps shortfall. And bracketed by the balanced W1:
    //   cost(a, b_short) <= W1(a, b) <= cost(a, b_short) + eps * max cost
    // (take an optimal plan for (a, b) and remove eps from the shrunk column;
    // conversely complete the short plan by shipping eps at most max cost).
    fc.assert(fc.property(imbalanceArb, ({ a, b, short, eps, cost, maxCost }) => {
      const forward = exactW1(a, short, cost).cost;
      const back = exactW1(short, a, cost).cost;
      const n = a.length;
      const withFree = cost.map((row) => [...row, 0]);
      withFree.push(new Array<number>(n + 1).fill(0));
      const partial = exactW1([...a, 0], [...short, eps], withFree).cost;
      // On small instances, the balanced reference itself against the simplex oracle.
      if (n <= 6) expect(Math.abs(partial - simplexTransport([...a, 0], [...short, eps], withFree))).toBeLessThan(1e-9);
      expect(Math.abs(forward - partial)).toBeLessThan(1e-12);
      // The reverse direction leaves the shortfall on the DEMAND side, where the
      // solver must pick which demand goes unfilled; it used to pick a dearer one.
      expect(Math.abs(back - partial)).toBeLessThan(1e-12);
      const full = exactW1(a, b, cost).cost;
      expect(forward).toBeLessThanOrEqual(full + 1e-12);
      expect(full).toBeLessThanOrEqual(forward + eps * maxCost + 1e-12);
    }), { numRuns: RUNS });
  });

  test("a mass difference above the 1e-9 balance tolerance is still refused", () => {
    const cost = [[0, 1], [1, 0]];
    expect(() => exactW1([0.5, 0.5], [0.5, 0.5 - 2e-9], cost)).toThrow(/unbalanced/);
    expect(() => exactW1([0.5, 0.5], [0.5, 0.5 - 5e-12], cost)).not.toThrow();
  });
});

describe("provenance", () => {
  test("every registered distance constant is read by one distance call, and nothing unregistered is", () => {
    const { provenance } = withProvenance(() => {
      const t: Record<string, number> = {};
      for (const name of COGNITIVE_TRAITS) t[name] = 0.3;
      t.patience = 0.9;
      return cognitiveDistance(buildOTCognitiveProfile("a", t), buildOTCognitiveProfile("b", { patience: 0.1 }));
    });
    const registered = DISTANCE_PROVENANCE.map((e) => e.id).sort();
    expect(provenance.hypotheses.length + provenance.counts.definition).toBe(registered.length);
    expect(provenance.counts.hypothesis).toBe(6);
    expect(provenance.counts.definition).toBe(1);
    expect(provenance.hypotheses).toContain("distance.slackCost");
    // Reading an unregistered id throws inside param(), so "read but not registered" cannot pass silently.
  });

  test("the slack cost is a registered hypothesis that keeps the 30-bin cost a metric", () => {
    const e = DISTANCE_PROVENANCE.find((x) => x.id === "distance.slackCost")!;
    expect(e.status).toBe("hypothesis");
    expect(e.source).toMatch(/would be tested by/i);
    expect(2 * SLACK).toBeGreaterThanOrEqual(MAX_COST);
    // Checked exhaustively over all 30^3 triples, not just via the bound above.
    let violations = 0;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      expect(GEN[i][j]).toBe(GEN[j][i]);
      if (i !== j) expect(GEN[i][j]).toBeGreaterThan(0);
      for (let k = 0; k <= N; k++) if (GEN[i][k] > GEN[i][j] + GEN[j][k] + 1e-15) violations++;
    }
    expect(violations).toBe(0);
  });

  test("the ground metric and slack values come from the registry, not from literals", () => {
    const byId = Object.fromEntries(DISTANCE_PROVENANCE.map((e) => [e.id, e.value]));
    const idx = (name: string) => COGNITIVE_TRAITS.indexOf(name as typeof COGNITIVE_TRAITS[number]);
    expect(COST[idx("patience")][idx("riskTolerance")]).toBe(byId["distance.groundSameDomain"]);
    expect(COST[idx("patience")][idx("resilience")]).toBe(byId["distance.groundRelatedDomain"]);
    expect(COST[idx("patience")][idx("trustCalibration")]).toBe(byId["distance.groundUnrelatedDomain"]);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) expect(GEN[i][j]).toBe(COST[i][j]);
      expect(GEN[i][N]).toBe(byId["distance.slackCost"]);
      expect(GEN[N][i]).toBe(byId["distance.slackCost"]);
    }
    expect(GEN[N][N]).toBe(0);
  });
});
