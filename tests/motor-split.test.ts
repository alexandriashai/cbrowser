/**
 * Splitting `motor` into target acquisition and sequence execution.
 *
 * Same failure shape as the pre-R5 readability layer: one scalar carrying two
 * mechanisms while the inspectable sub-metric tracks only one of them. Measured
 * on identical demand before the split:
 *
 *   motor-impairment-tremor  cost 0.072  hitProbability 48.4%
 *   elderly-user             cost 0.107  hitProbability 81.9%
 *
 * Worse pointing, lower cost -- because tremor's proceduralFluency (0.60)
 * outweighed its pointing deficit against elderly's (0.40).
 *
 * NO WEIGHTING WAS INVENTED. Both layers contribute additively like every other
 * layer, which makes their relative contribution visible instead of hidden. The
 * calibration slot exists, is named, defaults to 1.0 each, and is marked
 * uncalibrated.
 *
 * @since 2026-08-03
 */
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COGNITIVE_TRAITS, buildOTCognitiveProfile } from "../src/visual/cognitive-transport.js";
import { withLawSeconds } from "./fixtures/law-seconds.js";
import { computeDemandDistribution, computeSequentialCTC, MOTOR_LAYER_WEIGHTS } from "../src/visual/cognitive-transport-chain.js";

const SRC = join(import.meta.dir, "..", "src");
const CHAIN = readFileSync(join(SRC, "visual", "cognitive-transport-chain.ts"), "utf8");
const TOOL = readFileSync(join(SRC, "mcp-tools", "base", "persona-comparison-tools.ts"), "utf8");

const PAGE = {
  informationDensity: 0.6, visualComplexity: 0.5, interactiveElementCount: 60,
  textDensity: 0.5, animationLevel: 0.2, choiceCount: 20, navigationDepth: 2,
} as never;
const base: Record<string, number> = Object.fromEntries(
  (COGNITIVE_TRAITS as readonly string[]).map((t) => [t, 0.5]));

async function bridged(name: string): Promise<Record<string, number>> {
  const { getAnyPersona, getCognitiveProfile } = await import("../src/personas.js");
  const m = await import("../src/visual/cognitive-models.js");
  const p = getAnyPersona(name)!;
  const t = { ...(getCognitiveProfile(p as never).traits as Record<string, number>) };
  const acc = (p as never as { accessibilityTraits?: Record<string, number> }).accessibilityTraits;
  t.readingCapacity = m.readingCapacityOf(m.getReadingProfile({ name, traits: t, accessibilityTraits: acc }));
  t.motorCapacity = m.motorCapacityOf(m.getPointingProfile({ name, traits: t }));
  t.sustainedAttention = m.sustainedAttentionOf({ traits: t, accessibilityTraits: acc });
  return t;
}
const layer = (traits: Record<string, number>, name: string, page = PAGE) => {
  const r = computeSequentialCTC(buildOTCognitiveProfile("p", traits), computeDemandDistribution(withLawSeconds(page)),
    { asymmetric: true, interactions: true });
  return (r.layers as Array<{ name: string; transportCost: number; headroom: number }>).find((l) => l.name === name)!;
};

describe("the chain is eight layers, in order", () => {
  test("motorProcedure sits directly after motor", () => {
    const block = CHAIN.slice(CHAIN.indexOf("LAYER_DEFINITIONS"), CHAIN.indexOf("INTERACTION_PAIRS"));
    const names = Array.from(block.matchAll(/name: '([a-zA-Z]+)'/g), (m) => m[1]);
    expect(names).toEqual(["visualComplexity", "cognitiveLoad", "decision", "motor", "motorProcedure",
      "frustration", "readability", "readingAttention"]);
  });

  test("each half holds exactly its own mechanism", () => {
    const block = CHAIN.slice(CHAIN.indexOf("name: 'motor'"), CHAIN.indexOf("name: 'frustration'"));
    const [motor, procedure] = Array.from(block.matchAll(/traits: \[([^\]]*)\]/g), (m) => m[1]);
    expect(motor).toContain("motorCapacity");
    expect(motor).not.toContain("proceduralFluency");
    expect(procedure).toContain("proceduralFluency");
    expect(procedure).not.toContain("motorCapacity");
  });

  test("every layer reports headroom, and floored ones say so", () => {
    // BUG-21 asked for this on both new layers and on saliency. It is computed
    // generically for all eight, and has been since the readability split.
    const r = computeSequentialCTC(buildOTCognitiveProfile("p", { ...base, motorCapacity: 0.95, proceduralFluency: 0.95 }),
      computeDemandDistribution(withLawSeconds({ ...(PAGE as object), interactiveElementCount: 3 } as never)),
      { asymmetric: true, interactions: true });
    for (const l of r.layers as Array<{ name: string; headroom: number }>) {
      expect({ layer: l.name, hasHeadroom: typeof l.headroom === "number" })
        .toEqual({ layer: l.name, hasHeadroom: true });
    }
    expect(TOOL).toContain("costIsAtFloor: true");
  });
});

describe("the acceptance criterion that the split exists for", () => {
  test("the worse pointer now costs more in `motor`", async () => {
    const tremor = layer(await bridged("motor-impairment-tremor"), "motor").transportCost;
    const elderly = layer(await bridged("elderly-user"), "motor").transportCost;
    expect(tremor).toBeGreaterThan(elderly);
  });

  test("motor cost is monotonic in motorCapacity, everything else fixed", () => {
    // The claim that is actually true of this layer. It cannot be monotonic in
    // hitProbability, because motorCapacity weights Fitts throughput at 0.75
    // while hitProbability uses endpoint dispersion alone -- two reductions of
    // one profile that rank personas differently by construction.
    const costs = [0.3, 0.45, 0.6, 0.75, 0.9].map((mc) => layer({ ...base, motorCapacity: mc }, "motor").transportCost);
    for (let i = 1; i < costs.length; i++) expect(costs[i]).toBeLessThanOrEqual(costs[i - 1] + 1e-9);
  });

  test("procedure cost is monotonic in proceduralFluency", () => {
    const costs = [0.2, 0.4, 0.6, 0.8, 1.0].map((pf) => layer({ ...base, proceduralFluency: pf }, "motorProcedure").transportCost);
    for (let i = 1; i < costs.length; i++) expect(costs[i]).toBeLessThanOrEqual(costs[i - 1] + 1e-9);
  });

  test("the two halves can move in opposite directions, which is the point", async () => {
    const tremor = await bridged("motor-impairment-tremor");
    const elderly = await bridged("elderly-user");
    // tremor: worse pointer, better sequence-follower. elderly: the reverse.
    expect(layer(tremor, "motor").transportCost).toBeGreaterThan(layer(elderly, "motor").transportCost);
    expect(layer(tremor, "motorProcedure").transportCost).toBeLessThan(layer(elderly, "motorProcedure").transportCost);
  });
});

describe("sequence execution is an absolute quantity", () => {
  test("its cost does not fall as a page gets taller", () => {
    // Demand comes from a raw interactive-element COUNT, which only grows when
    // scope widens. Area-normalising it would say a sequence has fewer steps
    // because the page is tall.
    const t = { ...base, proceduralFluency: 0.3 };
    const viewport = layer(t, "motorProcedure", { ...(PAGE as object), interactiveElementCount: 9 } as never).transportCost;
    const fullPage = layer(t, "motorProcedure", { ...(PAGE as object), interactiveElementCount: 58 } as never).transportCost;
    expect(fullPage).toBeGreaterThanOrEqual(viewport - 1e-9);
  });
});

describe("no weighting was invented", () => {
  test("the calibration slot exists, defaults to 1.0, and says it is uncalibrated", () => {
    expect(MOTOR_LAYER_WEIGHTS.motor).toBe(1.0);
    expect(MOTOR_LAYER_WEIGHTS.motorProcedure).toBe(1.0);
    const block = CHAIN.slice(CHAIN.indexOf("MOTOR_LAYER_WEIGHTS") - 900, CHAIN.indexOf("} as const;"));
    expect(block).toContain("UNCALIBRATED");
    // And names what would settle it, rather than leaving it as a shrug.
    expect(block).toContain("tremor adaptation");
    expect(block).toContain("task-completion times");
  });

  test("nothing multiplies a layer cost by a bare constant", () => {
    // The failure this guards: a weight baked into the cost function acquires
    // false authority by ending up in a research instrument.
    const loop = CHAIN.slice(CHAIN.indexOf("for (const trait of layerDef.traits)"), CHAIN.indexOf("layers.push({"));
    expect(loop).not.toMatch(/\*\s*0\.\d+\s*;/);
  });

  test("the response shows both halves and why they can disagree", () => {
    expect(TOOL).toContain("motorDecomposition");
    expect(TOOL).toContain("targetAcquisition");
    expect(TOOL).toContain("sequenceExecution");
    expect(TOOL).toContain("fittsThroughput");
    expect(TOOL).toContain("endpointDispersionPx");
    expect(TOOL).toContain("MOTOR_LAYER_WEIGHTS");
  });

  test("motorProcedure has an overlay entry with a reason", () => {
    expect(TOOL).toContain('layer: "motorProcedure", available: false');
    const i = TOOL.indexOf('layer: "motorProcedure", available: false');
    expect(TOOL.slice(i, i + 300)).toContain("reason:");
  });
});

describe("elderly-user procedural fluency, corrected from its own page", () => {
  /**
   * It read 0.4, identical to cognitive-adhd, while carrying higher working
   * memory (0.40 vs 0.30) and four times the patience (0.80 vs 0.20). The old
   * rationale -- "slower development of procedural skills with new interfaces"
   * -- describes ACQUISITION RATE; the trait measures EXECUTION, and its low
   * end is "skips steps, confuses order", which is impulsive error. This
   * persona's own page says older users make FEWER of those.
   *
   * Third instance of that defect class after timeHorizon and attributionStyle:
   * a number set for the construct the rationale describes rather than the one
   * the trait measures.
   */
  test("it no longer scores identically to the impulsive persona", async () => {
    const { getAnyPersona } = await import("../src/personas.js");
    const pf = (n: string) => (getAnyPersona(n) as never as { cognitiveTraits: Record<string, number> })
      .cognitiveTraits.proceduralFluency;
    expect(pf("elderly-user")).toBeGreaterThan(pf("cognitive-adhd"));
    expect(pf("elderly-user")).toBe(0.5);
  });

  test("it sits between the personas that bracket it", async () => {
    const { getAnyPersona } = await import("../src/personas.js");
    const pf = (n: string) => (getAnyPersona(n) as never as { cognitiveTraits: Record<string, number> })
      .cognitiveTraits.proceduralFluency;
    // Above first-timer, which has no procedural schema at all.
    expect(pf("elderly-user")).toBeGreaterThan(pf("first-timer"));
    // Below motor-impairment-tremor, which is cognitively intact -- working
    // memory 0.70 and metacognitive planning 0.70 against 0.40 and 0.25.
    expect(pf("elderly-user")).toBeLessThan(pf("motor-impairment-tremor"));
  });

  test("0.5 is reasoned, and the code says so where it could be mistaken for a default", async () => {
    // The BUG-05 trap: a value at the default is indistinguishable from a value
    // nobody filled in. This one is a midpoint two opposing forces land on, and
    // the source states that rather than leaving it to be re-litigated.
    // Anchored on the PERSONA block, not on the first match in the file. The
    // first `proceduralFluency: 0.5` is in defaultTraits -- which is the whole
    // hazard: a reasoned value that happens to equal the default is
    // indistinguishable from one nobody filled in, unless something says so.
    const src = readFileSync(join(SRC, "personas.ts"), "utf8");
    const start = src.indexOf('"elderly-user": {');
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, src.indexOf('"impatient-user"', start) > start
      ? src.indexOf('"impatient-user"', start) : start + 9000);
    expect(block).toContain("proceduralFluency: 0.5,");
    expect(block).toContain("REASONED MIDPOINT rather");
    expect(block).toContain("Fisk et al.");
  });

  test("it narrows the motorProcedure gap without closing it, and that is correct", async () => {
    // The brief's acceptance criterion wanted elderly <= tremor. It still does
    // not hold, and should not: tremor is cognitively intact with a motor
    // impairment, so it SHOULD follow a sequence better than an older adult
    // with reduced working memory. Meeting the criterion would need elderly at
    // 0.6+, which nothing supports.
    const bridgedElderly = await bridged("elderly-user");
    const bridgedTremor = await bridged("motor-impairment-tremor");
    expect(layer(bridgedElderly, "motorProcedure").transportCost)
      .toBeGreaterThan(layer(bridgedTremor, "motorProcedure").transportCost);
  });
});
