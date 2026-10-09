/**
 * describeReasoningScope: what the attention narrative was computed over (B19).
 *
 * attentionReasoning is the LLM relevance pass over every candidate element (N);
 * the quantitative targets come from the few distinct elements the saliency
 * hotspots sampled (M, 2-4 per run on cbrowser.ai). The scope line states both
 * so a reader cannot take the narrative as a description of the measured
 * targets, and says so when M is below the sampling floor.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import * as reconcile from "../src/visual/narrative-reconcile.js";
import * as quality from "../src/visual/attention-quality.js";

const describeScope = (reconcile as Record<string, unknown>).describeReasoningScope as
  ((n: number, m: number | undefined, floor: number) => string) | undefined;
const FLOOR = (quality as Record<string, unknown>).MIN_DISTINCT_ELEMENTS as number | undefined;

describe("B19: describeReasoningScope", () => {
  test("the floor is the one computeAttentionQuality uses", () => {
    expect(FLOOR).toBe(8);
    // And it is the floor the sampleNote fires on: 7 distinct elements carry it.
    const els = Array.from({ length: 7 }, (_, i) => ({
      selector: `#e${i}`, text: `e${i}`, type: "a", x: 50 + i * 200, y: 50, width: 100, height: 40, isCTA: true,
    }));
    const hs = els.map((e, i) => ({ x: e.x + 50, y: 70, saliency: 0.9 - i * 0.01, row: 0, col: i }));
    const q = quality.computeAttentionQuality(hs, els, 4);
    expect(q.sampledElements).toBe(7);
    expect(q.sampleNote).toBeDefined();
  });

  test("states N and M, and names the gap between them", () => {
    expect(typeof describeScope).toBe("function");
    const s = describeScope!(37, 3, 8);
    expect(s).toContain("LLM relevance pass over 37 candidate elements");
    expect(s).toContain("counted over 3 sampled elements");
    expect(s).toMatch(/not among the measured targets/);
    expect(s).toContain("3 is below the sampling floor of 8");
  });

  test("at or above the floor it does not claim a thin sample", () => {
    expect(typeof describeScope).toBe("function");
    for (const m of [8, 12]) {
      const s = describeScope!(40, m, 8);
      expect(s).toContain(`counted over ${m} sampled elements`);
      expect(s).not.toContain("below the sampling floor");
    }
  });

  test("singular counts read as singular", () => {
    expect(typeof describeScope).toBe("function");
    const s = describeScope!(1, 1, 8);
    expect(s).toContain("over 1 candidate element ");
    expect(s).toContain("counted over 1 sampled element,");
  });

  test("with no quantitative targets it says nothing measured the named elements", () => {
    expect(typeof describeScope).toBe("function");
    const s = describeScope!(12, undefined, 8);
    expect(s).toContain("over 12 candidate elements");
    expect(s).toContain("were not computed on this run");
    expect(s).not.toContain("sampled element");
  });
});
