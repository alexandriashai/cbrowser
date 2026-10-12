/**
 * v10 B41: perf_baseline averaged its runs with no rounding, so a 3-run baseline
 * stored fcp 146.66666666666666 and ttfb 57.666666666666664. Averages are now
 * rounded at the source: millisecond timings to 0.1 ms, CLS to 4 decimals,
 * counts and byte sizes to whole numbers, and no value moves by more than the
 * rounding step.
 */
import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { averageMetrics } from "../src/performance/metrics.js";

const MS = ["lcp", "fid", "fcp", "ttfb", "tti", "tbt", "domContentLoaded", "load"] as const;
const decimals = (v: number) => (String(v).split(".")[1] ?? "").length;

describe("perf baseline averages are rounded (v10 B41)", () => {
  test("the report's three runs: fcp/ttfb/domContentLoaded have one decimal at most", () => {
    const avg = averageMetrics([
      { fcp: 140, ttfb: 57, domContentLoaded: 102 },
      { fcp: 150, ttfb: 58, domContentLoaded: 103 },
      { fcp: 150, ttfb: 58, domContentLoaded: 103 },
    ]);
    expect(avg.fcp).toBe(146.7);
    expect(avg.ttfb).toBe(57.7);
    expect(avg.domContentLoaded).toBe(102.7);
  });

  test("property: every average is rounded to its step and within half a step of the true mean", () => {
    const run = fc.record({
      fcp: fc.double({ min: 0, max: 20_000, noNaN: true }),
      ttfb: fc.double({ min: 0, max: 5_000, noNaN: true }),
      cls: fc.double({ min: 0, max: 2, noNaN: true }),
      resourceCount: fc.integer({ min: 0, max: 500 }),
      transferSize: fc.integer({ min: 0, max: 50_000_000 }),
    });
    fc.assert(fc.property(fc.array(run, { minLength: 1, maxLength: 7 }), (runs) => {
      const avg = averageMetrics(runs) as Record<string, number>;
      const mean = (k: string) => runs.reduce((s, r) => s + (r as Record<string, number>)[k]!, 0) / runs.length;
      for (const k of ["fcp", "ttfb"]) {
        if (decimals(avg[k]!) > 1) return false;
        if (Math.abs(avg[k]! - mean(k)) > 0.05 + 1e-9) return false;
      }
      if (decimals(avg.cls!) > 4 || Math.abs(avg.cls! - mean("cls")) > 0.00005 + 1e-12) return false;
      for (const k of ["resourceCount", "transferSize"]) {
        if (!Number.isInteger(avg[k]!) || Math.abs(avg[k]! - mean(k)) > 0.5 + 1e-9) return false;
      }
      return true;
    }), { numRuns: 1000 });
  });

  test("a metric no run reported stays absent, not 0", () => {
    const avg = averageMetrics([{ fcp: 100 }, { fcp: 120 }]);
    expect(avg.fcp).toBe(110);
    expect("lcp" in avg).toBe(false);
    for (const k of MS) if (k !== "fcp") expect(k in avg).toBe(false);
  });
});
