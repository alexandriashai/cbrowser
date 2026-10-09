/**
 * Reports must not contradict their own evidence.
 *
 * Four defects from the 18.74.0 round, all one shape — a summary computed from
 * less data than the detail printed beside it, or on a different scale:
 *
 *   B14  competitive_benchmark returned one site as fastestSite, leastFriction
 *        AND highestAbandonmentRisk simultaneously. Array.sort is stable, so on
 *        tied values every metric returns whichever site came first in the
 *        input — one array order presented as three findings.
 *   B18  attention_compare reported attentionDivergence 0.2606 and
 *        "substantially different attention patterns" with divergentRegions
 *        EMPTY. The aggregate summed NORMALIZED per-cell saliency; the region
 *        filter compared RAW values against a fixed 0.3 threshold, which
 *        individually small cells never reach.
 *   B19  site_profile_status returned zeros and healthy:false for a profile
 *        that had never been created — identical to a corrupted one. Those call
 *        for opposite actions.
 *
 * The invariant worth pinning is not any specific number: it is that a reported
 * aggregate and the detail offered to explain it come from the same data.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import * as attention from "../src/visual/attention-transport.js";

describe("B18 — divergence and its regions share one scale", () => {
  /**
   * The SHIPPING function, not a mirror of it. This block used to re-implement
   * the selection inline, so it would have kept passing if compareAttention
   * drifted from it. Since 2026-10-09 compareAttention takes both the aggregate
   * and the regions from rankDivergentRegions; a single row of n cells is the
   * 1-D case. Read through the namespace so a missing export fails this block
   * only.
   */
  function analyse(salA: number[], salB: number[]) {
    const rank = (attention as unknown as {
      rankDivergentRegions: (a: number[], b: number[], rows: number, cols: number, cell: number) =>
        { divergence: number; regions: unknown[] };
    }).rankDivergentRegions;
    return rank(salA, salB, 1, salA.length, 1);
  }

  test("the reported case: small per-cell values, non-zero divergence", () => {
    // Every cell is far below the old raw 0.3 threshold, which is exactly when
    // the list used to come back empty.
    const a = [0.05, 0.10, 0.02, 0.20, 0.01];
    const b = [0.20, 0.02, 0.05, 0.03, 0.10];
    const { divergence, regions } = analyse(a, b);
    expect(divergence).toBeGreaterThan(0);
    expect(regions.length).toBeGreaterThan(0);
  });

  test("PROPERTY: non-zero divergence never yields an empty region list", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 4, maxLength: 40 }),
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 4, maxLength: 40 }),
        (rawA, rawB) => {
          const n = Math.min(rawA.length, rawB.length);
          const a = rawA.slice(0, n), b = rawB.slice(0, n);
          if (a.every((v) => v === 0) || b.every((v) => v === 0)) return;
          const { divergence, regions } = analyse(a, b);
          if (divergence > 1e-9) expect(regions.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 500 },
    );
  });

  test("identical attention yields zero divergence and no regions", () => {
    const a = [0.1, 0.2, 0.3, 0.4];
    const { divergence, regions } = analyse(a, [...a]);
    expect(divergence).toBeLessThan(1e-9);
    expect(regions.length).toBe(0);
  });
});

describe("B14 — a tie is reported as a tie", () => {
  interface Site { siteName: string; value: number }

  /** Mirrors metricLeader in analysis/competitive-benchmark.ts. */
  function leader(sites: Site[], direction: "lowest" | "highest"): string {
    if (sites.length === 0) return "N/A";
    if (sites.length === 1) return "N/A (single site — nothing to compare against)";
    const ranked = [...sites].sort((a, b) =>
      direction === "lowest" ? a.value - b.value : b.value - a.value,
    );
    if (ranked[0].value === ranked[1].value) {
      const tied = ranked.filter((r) => r.value === ranked[0].value);
      return `tie (${tied.map((r) => r.siteName).join(", ")})`;
    }
    return ranked[0].siteName;
  }

  test("equal scores report a tie rather than naming the first entry", () => {
    const tied = [{ siteName: "example.com", value: 42 }, { siteName: "example.org", value: 42 }];
    expect(leader(tied, "lowest")).toBe("tie (example.com, example.org)");
    expect(leader(tied, "highest")).toBe("tie (example.com, example.org)");
  });

  test("a genuine winner is still named", () => {
    const sites = [{ siteName: "fast.com", value: 10 }, { siteName: "slow.com", value: 90 }];
    expect(leader(sites, "lowest")).toBe("fast.com");
    expect(leader(sites, "highest")).toBe("slow.com");
  });

  test("a single site cannot win a comparison", () => {
    expect(leader([{ siteName: "only.com", value: 1 }], "lowest")).toContain("N/A");
  });

  test("PROPERTY: the same input can never win a metric in both directions", () => {
    // This is what made the original defect visible: one site returned as both
    // leastFriction and highestAbandonmentRisk off one array order.
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 2, maxLength: 8 }),
        (values) => {
          const sites = values.map((value, i) => ({ siteName: `site-${i}`, value }));
          const lo = leader(sites, "lowest");
          const hi = leader(sites, "highest");
          if (lo.startsWith("tie") || hi.startsWith("tie")) return;
          expect(lo).not.toBe(hi);
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe("B19 — missing is not the same as broken", () => {
  test("a profile that was never created is distinguishable", async () => {
    const { SiteProfileManager } = await import("../src/browser/site-profile-manager.js");
    const manager = new SiteProfileManager();
    const health = await manager.getProfileHealth(`never-created-${Date.now()}.invalid`);
    expect(health.exists).toBe(false);
    expect(health.status).toBe("missing");
    // healthy stays false — the point is that `status` says WHY.
    expect(health.healthy).toBe(false);
  });
});
