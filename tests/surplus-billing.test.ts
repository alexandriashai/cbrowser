/**
 * Whose surplus costs, and whose does not.
 *
 * Billing surplus at 0.3 across every dimension meant a persona was charged for
 * being MORE capable than the page required. Measured on a mid-density page
 * before this change, SEVENTY PERCENT of `power-user`'s total cost was surplus,
 * and a uniform-capacity sweep produced a U:
 *
 *   capacity  0.2    0.4    0.6    0.8    1.0
 *   cost      0.549  0.081  0.076  0.179  0.516
 *
 * A maximally capable persona scored almost exactly as badly as a maximally
 * impaired one, for opposite reasons, and nothing in the output distinguished
 * them.
 *
 * THE RULE: surplus is FREE where a dimension's own `highEnd` names an ABILITY,
 * BILLED where it names a TENDENCY, BIAS or SUSCEPTIBILITY. It is derivable
 * from the trait reference rather than chosen, which is what makes it
 * defensible and what lets a future dimension be classified without a debate.
 *
 * @since 2026-08-03
 */
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COGNITIVE_TRAITS, buildOTCognitiveProfile } from "../src/visual/cognitive-transport.js";
import { DEMAND_DIMENSIONS, computeDemandDistribution, computeSequentialCTC } from "../src/visual/cognitive-transport-chain.js";
import { TRAIT_DEFINITIONS } from "../src/trait-reference.js";
import { withLawSeconds } from "./fixtures/law-seconds.js";

const CHAIN = readFileSync(join(import.meta.dir, "..", "src", "visual", "cognitive-transport-chain.ts"), "utf8");
const setNamed = (name: string): string[] => {
  const i = CHAIN.indexOf(`const ${name} = new Set([`);
  const body = CHAIN.slice(i, CHAIN.indexOf("]);", i));
  return Array.from(body.matchAll(/'([a-zA-Z]+)'/g), (m) => m[1]);
};
const FREE = setNamed("SURPLUS_FREE_DIMENSIONS");
const BILLED = setNamed("SURPLUS_BILLED_DIMENSIONS");

const page = computeDemandDistribution(withLawSeconds({
  informationDensity: 0.5, visualComplexity: 0.5, interactiveElementCount: 40,
  textDensity: 0.5, animationLevel: 0.2, choiceCount: 15, navigationDepth: 2,
} as never));
const cost = (t: Record<string, number>) =>
  computeSequentialCTC(buildOTCognitiveProfile("p", t), page, { asymmetric: true, interactions: true }).totalCTC;
const uniform = (v: number) => Object.fromEntries((COGNITIVE_TRAITS as readonly string[]).map((t) => [t, v]));

describe("every dimension is classified — none gets a default", () => {
  test("each appears in exactly one set", () => {
    for (const d of DEMAND_DIMENSIONS as readonly string[]) {
      const inFree = FREE.includes(d), inBilled = BILLED.includes(d);
      expect({ dim: d, classified: (inFree ? 1 : 0) + (inBilled ? 1 : 0) })
        .toEqual({ dim: d, classified: 1 });
    }
  });

  test("neither set names a dimension that does not exist", () => {
    const dims = new Set(DEMAND_DIMENSIONS as readonly string[]);
    for (const d of [...FREE, ...BILLED]) {
      expect({ dim: d, real: dims.has(d) }).toEqual({ dim: d, real: true });
    }
  });

  test("the sets are non-trivial in both directions", () => {
    // A rule that freed everything, or nothing, would pass the checks above.
    expect(FREE.length).toBeGreaterThan(5);
    expect(BILLED.length).toBeGreaterThan(5);
  });
});

describe("the rule matches what each dimension says about itself", () => {
  test("no billed dimension has an ability-shaped high end", () => {
    // Spot-checked against the wording the trait reference uses. These are the
    // phrasings that mark a tendency, a bias, or a susceptibility.
    const dispositionish = /waits|clicks anything|keeps trying|reads every|adopts|accepts first|first information|responsive to|influenced by|misses most|highly trusting|easily distracted|careful planning before/i;
    for (const d of BILLED) {
      const hi = (TRAIT_DEFINITIONS as Record<string, { highEnd?: string }>)[d]?.highEnd;
      if (!hi) continue;  // derived dimensions carry no definition
      expect({ dim: d, hi, dispositionShaped: dispositionish.test(hi) })
        .toEqual({ dim: d, hi, dispositionShaped: true });
    }
  });

  test("the free set records the ability phrasing that put each one there", () => {
    // So the classification can be re-checked by a reader rather than trusted.
    const block = CHAIN.slice(CHAIN.indexOf("const SURPLUS_FREE_DIMENSIONS"), CHAIN.indexOf("const SURPLUS_BILLED_DIMENSIONS"));
    for (const d of ["comprehension", "workingMemory", "resilience", "transferLearning", "interruptRecovery"]) {
      expect({ dim: d, quoted: block.includes(d) && /\/\/ "/.test(block) }).toEqual({ dim: d, quoted: true });
    }
  });

  test("the inverted scales are billed, and the note says why", () => {
    for (const d of ["changeBlindness", "trustCalibration", "curiosity"]) {
      expect({ dim: d, billed: BILLED.includes(d) }).toEqual({ dim: d, billed: true });
    }
    expect(CHAIN).toContain("THEIR SCALE IS INVERTED");
  });
});

describe("what the rule buys", () => {
  test("more ABILITY never costs more", () => {
    // The claim the whole change exists for. Dispositions held at neutral.
    const abilities = FREE;
    const costs = [0.2, 0.4, 0.6, 0.8, 1.0].map((v) => {
      const t = uniform(0.5) as Record<string, number>;
      for (const a of abilities) t[a] = v;
      return cost(t);
    });
    for (let i = 1; i < costs.length; i++) expect(costs[i]).toBeLessThanOrEqual(costs[i - 1] + 1e-9);
    expect(costs[0]).toBeGreaterThan(costs[costs.length - 1]);
  });

  test("ability surplus flattens rather than turning back up", () => {
    const abilities = FREE;
    const top = [0.8, 0.9, 1.0].map((v) => {
      const t = uniform(0.5) as Record<string, number>;
      for (const a of abilities) t[a] = v;
      return cost(t);
    });
    expect(new Set(top.map((c) => c.toFixed(9))).size).toBe(1);
  });

  test("the rule still has teeth — disposition surplus is NOT free", () => {
    // If billing had simply been switched off everywhere, this would pass
    // trivially and the model would stop describing over-deliberation at all.
    const t = uniform(0.5) as Record<string, number>;
    for (const d of BILLED) t[d] = 1.0;
    expect(cost(t)).toBeGreaterThan(cost(uniform(0.5) as Record<string, number>));
  });

  test("the capable persona now scores better than the impaired one", async () => {
    const { getAnyPersona, getCognitiveProfile } = await import("../src/personas.js");
    const m = await import("../src/visual/cognitive-models.js");
    const bridged = (name: string) => {
      const p = getAnyPersona(name)!;
      const t = { ...(getCognitiveProfile(p as never).traits as Record<string, number>) };
      const acc = (p as never as { accessibilityTraits?: Record<string, number> }).accessibilityTraits;
      t.readingCapacity = m.readingCapacityOf(m.getReadingProfile({ name, traits: t, accessibilityTraits: acc }));
      t.motorCapacity = m.motorCapacityOf(m.getPointingProfile({ name, traits: t }));
      t.sustainedAttention = m.sustainedAttentionOf({ traits: t, accessibilityTraits: acc });
      return t;
    };
    expect(cost(bridged("power-user"))).toBeLessThan(cost(bridged("intellectual-disability")));
  });
});
