/**
 * cognitiveDistance's `sliced` is the sliced Wasserstein-1 distance over
 * directions uniform on the sphere, computed exactly.
 *
 * It was an estimate from 100 seeded directions drawn uniform in the cube
 * [-1, 1]^29 and normalized, which is not uniform on the sphere; against the
 * exact value the roster pairs were off by -20% to +19%. Between two points
 * (the code projects the two trait vectors) the mean of |<a - b, theta>| over
 * uniform theta is c_d * ||a - b||, c_d = Gamma(d/2) / (sqrt(pi) Gamma((d+1)/2)).
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import * as CT from "../src/visual/cognitive-transport.js";
import { BUILTIN_PERSONAS, ACCESSIBILITY_PERSONAS, EMOTIONAL_PERSONAS, getCognitiveProfile } from "../src/personas.js";

const { buildOTCognitiveProfile, cognitiveDistance, COGNITIVE_TRAITS } = CT;
const D = COGNITIVE_TRAITS.length;

/** c_d by another route than the product the code uses: double factorials and factorials. */
function cdByFactorials(d: number): number {
  const fact = (n: number) => { let f = 1; for (let k = 2; k <= n; k++) f *= k; return f; };
  const dfact = (n: number) => { let f = 1; for (let k = n; k > 1; k -= 2) f *= k; return f; };
  // Gamma(n + 1/2) = (2n - 1)!! / 2^n * sqrt(pi); Gamma(n) = (n - 1)!
  if (d % 2 === 1) {
    const n = (d - 1) / 2; // Gamma(d/2) = Gamma(n + 1/2), Gamma((d+1)/2) = n!
    return dfact(2 * n - 1) / 2 ** n / fact(n);
  }
  const m = d / 2; // Gamma(d/2) = (m - 1)!, Gamma((d+1)/2) = Gamma(m + 1/2)
  return fact(m - 1) / (Math.PI * (dfact(2 * m - 1) / 2 ** m));
}

const roster = Object.entries({ ...BUILTIN_PERSONAS, ...ACCESSIBILITY_PERSONAS, ...EMOTIONAL_PERSONAS }).map(([name, p]) =>
  buildOTCognitiveProfile(name, (getCognitiveProfile(p as never).traits as unknown as Record<string, number>) || {}));

const l2 = (a: Float64Array, b: Float64Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
};

describe("sliced is exact", () => {
  test(`every roster pair (${(roster.length * (roster.length - 1)) / 2}): sliced = c_${D} x ||a - b||, symmetric`, () => {
    const c = cdByFactorials(D);
    let pairs = 0;
    for (let i = 0; i < roster.length; i++) {
      for (let j = i + 1; j < roster.length; j++) {
        const want = c * l2(roster[i].distribution, roster[j].distribution);
        const ab = cognitiveDistance(roster[i], roster[j]).sliced;
        const ba = cognitiveDistance(roster[j], roster[i]).sliced;
        expect(Math.abs(ab - want)).toBeLessThanOrEqual(1e-12 * Math.max(1, want));
        expect(ba).toBe(ab);
        pairs++;
      }
    }
    expect(pairs).toBeGreaterThan(200);
    expect(cognitiveDistance(roster[0], roster[0]).sliced).toBe(0);
  });

  test("c_d agrees with the factorial form, the known small cases and a Monte Carlo of uniform directions", () => {
    const f = (CT as Record<string, unknown>).sphereMeanAbsProjection as (d: number) => number;
    expect(typeof f).toBe("function");
    expect(f(1)).toBe(1);
    expect(Math.abs(f(2) - 2 / Math.PI)).toBeLessThan(1e-15);
    expect(f(3)).toBe(0.5); // |z| for z uniform on [-1, 1]
    for (let d = 1; d <= 40; d++) expect(Math.abs(f(d) - cdByFactorials(d)) / f(d)).toBeLessThan(1e-13);
    // E|theta_1| over 200,000 Gaussian-normalized directions in 29 dimensions.
    let a = 12345;
    const rand = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const N = 200_000;
    let sum = 0;
    for (let n = 0; n < N; n++) {
      let norm = 0, first = 0;
      for (let i = 0; i < D; i++) {
        const g = Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());
        if (i === 0) first = g;
        norm += g * g;
      }
      sum += Math.abs(first) / Math.sqrt(norm);
    }
    // Standard error of the mean is about 0.11 / sqrt(N) = 0.00025.
    expect(Math.abs(sum / N - f(D))).toBeLessThan(0.0015);
    expect(() => f(0)).toThrow(RangeError);
    expect(() => f(2.5)).toThrow(RangeError);
  });
});
