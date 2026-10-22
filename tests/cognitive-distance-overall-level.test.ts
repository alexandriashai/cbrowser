/**
 * cognitive_distance reports the generalized W1's level term on its own.
 *
 * Since 21.0, w1 includes the cost of a difference in overall trait level
 * (traitContributions.overallLevel). That key is not a trait, so it must not
 * appear among topDifferentiatingTraits, where it read as one; the tool reports
 * it as overallLevelContribution instead.
 */
import { describe, test, expect } from "bun:test";
import { registerPersonaComparisonTools } from "../src/mcp-tools/base/persona-comparison-tools.js";

type Handler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ type: string; text?: string }> }>;

function capture(): Record<string, Handler> {
  const handlers: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, h: Handler) => { handlers[name] = h; },
    tool: () => {}, registerResource: () => {}, resource: () => {},
  };
  const ctx = { getBrowser: async () => { throw new Error("no browser in this test"); }, getBrowserByToken: async () => { throw new Error("no browser in this test"); } };
  registerPersonaComparisonTools(server as never, ctx as never);
  return handlers;
}

describe("cognitive_distance level term", () => {
  const h = capture().cognitive_distance;

  test("is reported apart from the traits, for pairs whose level differs", async () => {
    // deaf-user | autism-spectrum: about half of w1 is level (measured when the
    // generalized W1 landed), so the level term would rank in the top five.
    for (const [a, b] of [["deaf-user", "autism-spectrum"], ["first-timer", "power-user"], ["elderly-user", "impatient-user"]]) {
      const r = await h({ personaA: a, personaB: b });
      expect(r.isError).toBeFalsy();
      const out = JSON.parse(r.content[0].text ?? "{}");
      const names = (out.topDifferentiatingTraits as Array<{ trait: string }>).map((t) => t.trait);
      expect(names).not.toContain("overallLevel");
      expect(names.length).toBe(5);
      expect(typeof out.overallLevelContribution).toBe("number");
      expect(out.overallLevelContribution).toBeGreaterThanOrEqual(0);
      expect(out.overallLevelContribution).toBeLessThanOrEqual(out.w1Distance);
    }
    const r = await h({ personaA: "deaf-user", personaB: "autism-spectrum" });
    expect(JSON.parse(r.content[0].text ?? "{}").overallLevelContribution).toBeGreaterThan(0);
  });
});
