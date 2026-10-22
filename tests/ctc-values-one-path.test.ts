/**
 * Schwartz values reach a cognitive transport score through one path: the
 * chain's VALUE_DEMAND_MODULATION, whose coefficients are registered
 * (chain.valueModulation.*) and whose output is clamped to [0, 1].
 *
 * Through 21.0 cognitive_effort carried a second path of its own: a
 * conservation/openness formula with unregistered 0.3 and 0.5 constants that
 * scaled five decision demands and emotionalContagion in place, unclamped (up
 * to 1.3), before the chain ran, and the chain's own modulation was never
 * reached from any tool. That block is gone; useValues now passes the
 * persona's scores into computeSequentialCTC.
 *
 * tests/ctc-tool-provenance.test.ts proves the tool's numbers equal the
 * chain's with values on, in a real browser. These are the pure halves: no
 * tool writes a demand vector, the chain clamps what it modulates, and the
 * tool's description names every modulation the chain applies.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  VALUE_DEMAND_MODULATION,
  computeDemandDistribution,
  computeSequentialCTC,
  type DemandDistribution,
} from "../src/visual/cognitive-transport-chain.js";
import { ROSTER, toolProfile, PAGE_DEMANDS } from "./fixtures/ctc-golden-matrix.js";

const SRC = join(import.meta.dir, "..", "src", "mcp-tools", "base");
const OPTIONS = { asymmetric: true, interactions: true } as const;

describe("one values path", () => {
  test("no tool writes to a demand vector; modulation lives in the chain", () => {
    for (const file of ["persona-comparison-tools.ts", "audit-tools.ts"]) {
      const source = readFileSync(join(SRC, file), "utf8");
      const writes = source.split("\n")
        .map((line, i) => ({ line: i + 1, text: line.trim() }))
        .filter(({ text }) => /\.demands\[[^\]]+\]\s*(\*|\/|\+|-)?=(?!=)/.test(text));
      expect(writes.map((w) => `${file}:${w.line} ${w.text}`)).toEqual([]);
    }
  });

  test("the chain clamps modulated demand to [0, 1]", () => {
    // A score far outside any real one drives every modulated demand past its
    // bound. Clamped, the result is the chain run on a demand already AT that
    // bound with no values; unclamped, a demand of thousands would cost more.
    const profile = toolProfile("first-timer", ROSTER["first-timer"]);
    const base = computeDemandDistribution(PAGE_DEMANDS[0].metrics);
    const at = (traits: string[], v: number): DemandDistribution => ({
      demands: { ...base.demands, ...Object.fromEntries(traits.map((t) => [t, v])) },
    });
    const traitsOf = (value: string) => VALUE_DEMAND_MODULATION.filter((m) => m.value === value).map((m) => m.trait);

    // conformity amplifies (both coefficients positive): ceiling.
    const up = computeSequentialCTC(profile, base, { ...OPTIONS, schwartzValues: { conformity: 1e6 } });
    const ceiling = computeSequentialCTC(profile, at(traitsOf("conformity"), 1), OPTIONS);
    expect(Object.is(up.totalCTC, ceiling.totalCTC)).toBe(true);
    expect(up.layers.map((l) => l.transportCost)).toEqual(ceiling.layers.map((l) => l.transportCost));

    // achievement dampens (both coefficients negative): floor.
    const down = computeSequentialCTC(profile, base, { ...OPTIONS, schwartzValues: { achievement: 1e6 } });
    const floor = computeSequentialCTC(profile, at(traitsOf("achievement"), 0), OPTIONS);
    expect(Object.is(down.totalCTC, floor.totalCTC)).toBe(true);
    expect(down.layers.map((l) => l.transportCost)).toEqual(floor.layers.map((l) => l.transportCost));
  });

  test("cognitive_effort's useValues description names every modulation the chain applies", async () => {
    const { registerPersonaComparisonTools } = await import("../src/mcp-tools/base/persona-comparison-tools.js");
    const schemas: Record<string, Record<string, { description?: string }>> = {};
    const server = {
      registerTool: (name: string, cfg: { inputSchema?: Record<string, { description?: string }> }) => {
        schemas[name] = cfg.inputSchema ?? {};
      },
      tool: () => {}, registerResource: () => {}, resource: () => {},
    } as never;
    registerPersonaComparisonTools(server, { getBrowser: async () => { throw new Error("unused"); } } as never);
    const text = schemas.cognitive_effort?.useValues?.description ?? "";

    // Every (value, trait) pair, as "<value> ... on <trait>" within one clause.
    for (const m of VALUE_DEMAND_MODULATION) {
      const clause = text.split(";").find((c) => c.includes(m.value) && c.includes(m.trait));
      expect(clause ? `${m.value} on ${m.trait}` : `missing ${m.value} on ${m.trait}`).toBe(`${m.value} on ${m.trait}`);
    }
    // The values that move nothing are named as such, and the old formula is not described.
    for (const inert of ["hedonism", "tradition", "universalism"]) expect(text).toContain(inert);
    expect(text).toContain("clamped to [0, 1]");
    expect(text).toContain("chain.valueModulation");
    expect(text).not.toMatch(/scale decision and frustration demand/);
  });
});
