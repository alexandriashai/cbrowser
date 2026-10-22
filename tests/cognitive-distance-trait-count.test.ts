/**
 * v10 B42: cognitive_distance's scaleNote said "w1 (L1 sum over 26 traits)" while
 * the distance runs over every entry of COGNITIVE_TRAITS (29 once the three bridge
 * traits arrived). The count is read from the list now, so it cannot go stale again.
 *
 * The generalized W1 (2026-10-21) put four more registry numbers into prose --
 * the three ground-cost levels and the slack cost, plus the 0.24 worked example
 * -- in the tool description and the scaleNote. Those strings are literals, so
 * this file pins them to the registry instead: changing a value without the
 * prose fails here, the same way the stale trait count would have.
 */
import { describe, test, expect } from "bun:test";
import { registerPersonaComparisonTools } from "../src/mcp-tools/base/persona-comparison-tools.js";
import { COGNITIVE_TRAITS, OVERALL_LEVEL_KEY } from "../src/visual/cognitive-transport.js";
import { DISTANCE_PROVENANCE } from "../src/visual/provenance/distance.js";

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }>;
const handlers = new Map<string, Handler>();
const descriptions = new Map<string, string>();
registerPersonaComparisonTools(
  { registerTool: (n: string, c: { description?: string }, h: Handler) => { handlers.set(n, h); descriptions.set(n, c.description ?? ""); } } as never,
  { getBrowser: async () => { throw new Error("no browser in this test"); } } as never,
);

const reg = (id: string) => DISTANCE_PROVENANCE.find((e) => e.id === id)!.value;
const SAME = reg("distance.groundSameDomain"), RELATED = reg("distance.groundRelatedDomain");
const UNRELATED = reg("distance.groundUnrelatedDomain"), SLACK = reg("distance.slackCost");

async function scaleNote(a: string, b: string) {
  const r = await handlers.get("cognitive_distance")!({ personaA: a, personaB: b });
  return JSON.parse(r.content.find((c) => c.type === "text")!.text!);
}

describe("cognitive_distance scaleNote names the real trait count (v10 B42)", () => {
  test("the note's count equals COGNITIVE_TRAITS.length", async () => {
    const body = await scaleNote("first-timer", "power-user");
    // "L1 sum" became "exact Wasserstein-1" on 2026-10-21, then "exact generalized
    // Wasserstein-1"; the count is what this pins.
    expect(body.scaleNote).toContain(`over ${COGNITIVE_TRAITS.length} traits`);
    expect(body.scaleNote).toContain(`t/${COGNITIVE_TRAITS.length}`);
    expect(COGNITIVE_TRAITS.length).toBe(new Set(COGNITIVE_TRAITS).size);
  });
});

describe("the distance prose quotes the registry values", () => {
  test("scaleNote: ground levels, slack cost, range and the 0.2 vs 0.8 example", async () => {
    const { scaleNote: note } = await scaleNote("first-timer", "power-user");
    expect(note).toContain("generalized Wasserstein-1");
    expect(note).toContain(`(${SAME} / ${RELATED} / ${UNRELATED})`);
    expect(note).toContain(`costs ${SLACK} per unit`);
    expect(note).toContain(`from 0 to ${SLACK}`);
    expect(note).toContain(`0.8 is ${+(0.6 * SLACK).toFixed(4)}`);
    expect(note).toContain(OVERALL_LEVEL_KEY);
    expect(note).toContain(`0.5 x ${SLACK} x |mean A - mean B|`);
    // The old note said proportional vectors are at 0 on w1; it is now true only of w2 and sliced.
    expect(note).not.toMatch(/w1 is computed on profiles normalised/);
  });

  test("tool descriptions: cognitive_distance quotes the same values, cognitive_coverage names the distance", () => {
    const d = descriptions.get("cognitive_distance")!;
    expect(d).toContain("generalized (unbalanced) Wasserstein-1");
    expect(d).toContain(`${SAME} same domain, ${RELATED} related, ${UNRELATED} unrelated`);
    expect(d).toContain(`costs ${SLACK} per unit`);
    expect(d).toContain(OVERALL_LEVEL_KEY);
    expect(descriptions.get("cognitive_coverage")!).toContain("generalized Wasserstein-1");
  });
});
