/**
 * v10 B42: cognitive_distance's scaleNote said "w1 (L1 sum over 26 traits)" while
 * the distance runs over every entry of COGNITIVE_TRAITS (29 once the three bridge
 * traits arrived). The count is read from the list now, so it cannot go stale again.
 */
import { describe, test, expect } from "bun:test";
import { registerPersonaComparisonTools } from "../src/mcp-tools/base/persona-comparison-tools.js";
import { COGNITIVE_TRAITS } from "../src/visual/cognitive-transport.js";

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }>;
const handlers = new Map<string, Handler>();
registerPersonaComparisonTools(
  { registerTool: (n: string, _c: unknown, h: Handler) => { handlers.set(n, h); } } as never,
  { getBrowser: async () => { throw new Error("no browser in this test"); } } as never,
);

describe("cognitive_distance scaleNote names the real trait count (v10 B42)", () => {
  test("the note's count equals COGNITIVE_TRAITS.length", async () => {
    const r = await handlers.get("cognitive_distance")!({ personaA: "first-timer", personaB: "power-user" });
    const body = JSON.parse(r.content.find((c) => c.type === "text")!.text!);
    // "L1 sum" became "exact Wasserstein-1" on 2026-10-21; the count is what this pins.
    expect(body.scaleNote).toContain(`over ${COGNITIVE_TRAITS.length} traits`);
    expect(COGNITIVE_TRAITS.length).toBe(new Set(COGNITIVE_TRAITS).size);
  });
});
