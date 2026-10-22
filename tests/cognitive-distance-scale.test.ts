/**
 * cognitive_distance — scale comparability and verdict discrimination.
 *
 * Two defects this pins, both measured across all pairs of built-in personas:
 *
 * 1. The verdict was calibrated for a scale w1 does not occupy. Its bands were
 *    0.01 / 0.03 / 0.06; w1 actually spans 0.055 to 0.684. Result: 209 of 210
 *    pairs returned "Substantially different cognitive profiles" — one sentence
 *    for nearly every question, which carries no information.
 *
 * 2. slicedWasserstein drew its projections from Math.random(), so two identical
 *    calls disagreed (0.031568 vs 0.029943, ~5%) while the MCP tool exposing it
 *    declares idempotentHint: true.
 *
 * These assert the properties, not the specific numbers, so re-tuning persona
 * traits doesn't force a test edit — but a return to a dead threshold or an
 * unseeded projection does.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { describe, test, expect } from "bun:test";
import {
  buildOTCognitiveProfile,
  cognitiveDistance,
} from "../src/visual/cognitive-transport.js";
import {
  BUILTIN_PERSONAS,
  ACCESSIBILITY_PERSONAS,
  EMOTIONAL_PERSONAS,
  getCognitiveProfile,
} from "../src/personas.js";
import type { Persona, AccessibilityPersona } from "../src/types.js";

const ALL = { ...BUILTIN_PERSONAS, ...ACCESSIBILITY_PERSONAS, ...EMOTIONAL_PERSONAS };

const profiles = Object.entries(ALL).map(([name, p]) => {
  const profile = getCognitiveProfile(p as Persona | AccessibilityPersona);
  return buildOTCognitiveProfile(name, (profile.traits as unknown as Record<string, number>) || {});
});

const pairs: { w1: number; w2: number; sliced: number }[] = [];
for (let i = 0; i < profiles.length; i++) {
  for (let j = i + 1; j < profiles.length; j++) {
    const d = cognitiveDistance(profiles[i], profiles[j]);
    pairs.push({ w1: d.w1, w2: d.w2, sliced: d.sliced });
  }
}

/** Mirrors the percentile banding the MCP tool applies to w1. */
function verdictFor(w1: number, sortedW1: number[]): string {
  let below = 0;
  while (below < sortedW1.length && sortedW1[below] < w1) below++;
  const pct = (below / sortedW1.length) * 100;
  return pct < 10 ? "nearly-identical"
    : pct < 30 ? "similar"
    : pct < 70 ? "moderate"
    : pct < 90 ? "substantial"
    : "extreme";
}

describe("cognitive_distance scale comparability", () => {
  test("the built-in persona population is large enough to calibrate against", () => {
    expect(profiles.length).toBeGreaterThan(10);
    expect(pairs.length).toBeGreaterThan(100);
  });

  test("sliced Wasserstein is deterministic across repeated calls", () => {
    const a = cognitiveDistance(profiles[0], profiles[1]);
    const b = cognitiveDistance(profiles[0], profiles[1]);
    expect(b.sliced).toBe(a.sliced);
    expect(b.w1).toBe(a.w1);
    expect(b.w2).toBe(a.w2);
  });

  test("determinism holds for every pair, not just the first", () => {
    for (let i = 0; i < profiles.length; i++) {
      const first = cognitiveDistance(profiles[i], profiles[(i + 1) % profiles.length]);
      const again = cognitiveDistance(profiles[i], profiles[(i + 1) % profiles.length]);
      expect(again.sliced).toBe(first.sliced);
    }
  });

  test("the three metrics really are on different scales", () => {
    // Not a defect to fix — a fact the output must disclose rather than hide.
    //
    // This asserted mean(w1) > 5 * mean(sliced), which pinned the magnitude of
    // the simplex W1 (roster means 2026-10-21: w1 0.0847, w2 0.1090, sliced
    // 0.0132, ratio 6.4). The generalized W1 puts t/29 rather than t/sum(t) on
    // each trait, about half the mass, so its mean is 0.0474 and the ratio 3.6.
    // The property is that no two of the three share a scale, so that is what
    // is asserted now: every pair of means differs by more than a factor of 2
    // (measured: w2/w1 2.3, w1/sliced 3.6, w2/sliced 8.2).
    const mean = (k: "w1" | "w2" | "sliced") =>
      pairs.reduce((a, p) => a + p[k], 0) / pairs.length;
    const ratio = (x: number, y: number) => Math.max(x, y) / Math.min(x, y);
    expect(ratio(mean("w1"), mean("sliced"))).toBeGreaterThan(2);
    expect(ratio(mean("w2"), mean("w1"))).toBeGreaterThan(2);
    expect(ratio(mean("w2"), mean("sliced"))).toBeGreaterThan(2);
  });

  test("the verdict discriminates instead of returning one bucket", () => {
    const sortedW1 = pairs.map(p => p.w1).sort((a, b) => a - b);
    const counts = new Map<string, number>();
    for (const p of pairs) {
      const v = verdictFor(p.w1, sortedW1);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    // The old absolute bands produced 209/210 in a single bucket.
    const largest = Math.max(...counts.values());
    expect(largest).toBeLessThan(pairs.length * 0.75);
    expect(counts.size).toBeGreaterThanOrEqual(4);
  });

  test("the old absolute thresholds would have collapsed — the reason this exists", () => {
    // Until 2026-10-21 this asserted >90% of pairs at w1 >= 0.06, which pinned
    // the SCALE of the old weighted-L1 heuristic (0.055-0.684). w1 became the
    // exact simplex W1 (0.029-0.206 across the roster) and is now the
    // generalized W1 (0.017-0.118), so the pin moved to the property that
    // matters: the old absolute bands still put most pairs in one bucket
    // (178 of 300 in 0.03-0.06 today).
    const oldBand = (w1: number) => (w1 < 0.01 ? 0 : w1 < 0.03 ? 1 : w1 < 0.06 ? 2 : 3);
    const buckets = [0, 0, 0, 0];
    for (const p of pairs) buckets[oldBand(p.w1)]++;
    expect(Math.max(...buckets)).toBeGreaterThan(pairs.length * 0.5);
  });
});
