/**
 * The 21.0 chain corrections: each block pins one structural contradiction
 * that the chain carried through 20.x, written red against 20.0.1 first.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LAYER_DEFINITIONS,
  INTERACTION_PAIRS,
  capacityVector,
  computeDemandDistribution,
  computeDemandFromRawMetrics,
  computeSequentialCTC,
  computeSequentialScrollCTC,
  DEMAND_DIMENSIONS,
} from "../src/visual/cognitive-transport-chain.js";
import { buildOTCognitiveProfile } from "../src/visual/cognitive-transport.js";
import { MODEL_PROVENANCE } from "../src/visual/model-provenance.js";
import { withLawSeconds, demandFromLegacy } from "./fixtures/law-seconds.js";
import { ROSTER, RAW_DEMANDS, PAGE_DEMANDS, SCROLL_INPUTS, BOUNDARY_PERSONAS, toolProfile, allDemands } from "./fixtures/ctc-golden-matrix.js";

const ROOT = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("layer 1 is named for what it computes (visualComplexity, not saliency)", () => {
  // Its demand comes from pageMetrics.visualComplexity (a count) and the
  // animation level, and its capacity from changeBlindness. The fitted
  // attention model never reaches it, so "saliency" claimed a mechanism the
  // layer does not have.
  test("the first layer is visualComplexity and no layer is called saliency", () => {
    expect(LAYER_DEFINITIONS[0].name).toBe("visualComplexity");
    expect(LAYER_DEFINITIONS.map((l) => l.name)).not.toContain("saliency");
  });

  test("the interaction pair and its registry id carry the new name", () => {
    const pair = INTERACTION_PAIRS.find((p) => p.a === "visualComplexity" && p.b === "cognitiveLoad");
    expect(pair?.weight).toBe("chain.interaction.visualComplexityXcognitiveLoad");
    expect(MODEL_PROVENANCE["chain.interaction.visualComplexityXcognitiveLoad"]).toBeDefined();
    expect(MODEL_PROVENANCE["chain.interaction.saliencyXcognitiveLoad"]).toBeUndefined();
    expect(INTERACTION_PAIRS.some((p) => p.a === "saliency" || p.b === "saliency")).toBe(false);
  });

  test("a chain run reports no layer, bottleneck or interaction named saliency", () => {
    const [name, p] = Object.entries(ROSTER)[0];
    for (const args of [[0, 0, 0, 0, 0, 0, 0], [0.3, 0.95, 25, 0.2, 0.9, 6, 2]] as const) {
      const r = computeSequentialCTC(toolProfile(name, p), demandFromLegacy(...args));
      expect(r.layers.map((l) => l.name)).not.toContain("saliency");
      expect(r.bottleneckLayer).not.toBe("saliency");
      expect(Object.keys(r.interactions).some((k) => k.includes("saliency"))).toBe(false);
    }
  });

  test("cognitive_effort describes the layer as visual complexity, and its overlay does not claim to be the layer's input", () => {
    const tool = read("src/mcp-tools/base/persona-comparison-tools.ts");
    const desc = tool.slice(tool.indexOf('registerTool("cognitive_effort"'), tool.indexOf("inputSchema", tool.indexOf('registerTool("cognitive_effort"')));
    expect(desc).toContain("visual complexity");
    expect(desc).not.toMatch(/saliency →/);
    // The Lab saliency heatmap stays as visual context, keyed to the layer's
    // real name so the widget bar opens it, and says it is not what the layer computed.
    expect(tool).toContain('layer: "visualComplexity", file:');
    expect(tool).not.toContain('layer: "saliency"');
    expect(tool).toMatch(/not computed from this map/);
  });

  test("the README layer table no longer credits layer 1 to the perceptual model", () => {
    const readme = read("README.md");
    expect(readme).not.toMatch(/\|\s*\*\*Saliency\*\*\s*\|/);
    expect(readme).toMatch(/\|\s*\*\*Visual Complexity\*\*\s*\|/);
  });
});

/** Every page input at its maximum, readability fields included. */
const MAX_PAGE = {
  informationDensity: 1, visualComplexity: 1, interactiveElementCount: 1000, textDensity: 1,
  animationLevel: 1, choiceCount: 500, navigationDepth: 30,
  avgWordLength: 1, avgSentenceLength: 1, lexicalDiversity: 1, longWordRatio: 1, technicalDensity: 1,
};

describe("every trait in a layer can receive demand", () => {
  // Every demand term is a non-negative weight on a feature that only rises
  // with its input, combined by max (and one product of rising terms), so the
  // all-maximum page is where every dimension's demand is largest. A layer
  // trait with zero demand there has zero demand on every page: it costs
  // nothing as surplus-free capacity and only dilutes the layer's content
  // gate, which is the mean demand over the layer's traits.
  //
  // resilience and selfEfficacy sat in frustration on these terms through
  // 20.x, halving its gate (mean over four traits, two always zero).
  test("at the all-maximum page, every layer trait has demand above zero", () => {
    const { demands } = computeDemandDistribution(withLawSeconds(MAX_PAGE));
    const demandless = LAYER_DEFINITIONS.flatMap((l) => l.traits.filter((t) => !(demands[t] > 0)).map((t) => `${l.name}.${t}`));
    expect(demandless).toEqual([]);
  });

  test("resilience and selfEfficacy stay dimensions, read by abandonment, in no layer", () => {
    const inLayers = new Set(LAYER_DEFINITIONS.flatMap((l) => l.traits));
    expect(inLayers.has("resilience")).toBe(false);
    expect(inLayers.has("selfEfficacy")).toBe(false);
    expect(DEMAND_DIMENSIONS as readonly string[]).toContain("resilience");
    expect(DEMAND_DIMENSIONS as readonly string[]).toContain("selfEfficacy");
    expect(LAYER_DEFINITIONS.find((l) => l.name === "frustration")?.traits).toEqual(["patience", "emotionalContagion"]);
  });
});

describe("no layer trait is the same number for every persona", () => {
  // attentionPattern is not a CognitiveTraits field, so in the tool path its
  // capacity was chain.missingTraitCapacity (0.5) for every persona: a
  // persona-invariant term inside layer 1 that moved every score and
  // distinguished no one. siteFamiliarity is the one dimension allowed to be
  // the same across the roster, because it is a per-run parameter (the
  // caller's value, else 0 for a first visit), not a persona property.
  const RUN_SCOPED = new Set(["siteFamiliarity"]);

  test("every layer trait's capacity varies across the roster as cognitive_effort builds it", () => {
    const caps = Object.entries(ROSTER).map(([n, p]) => capacityVector(toolProfile(n, p).traits));
    const invariant = LAYER_DEFINITIONS.flatMap((l) => l.traits
      .filter((t) => !RUN_SCOPED.has(t) && new Set(caps.map((c) => c[t])).size === 1)
      .map((t) => `${l.name}.${t} = ${caps[0][t]}`));
    expect(invariant).toEqual([]);
  });

  test("attentionPattern's demand weight and its five string levels are gone from the registry", () => {
    for (const id of ["chain.demand.visual.attentionPattern", "chain.attentionString.targeted", "chain.attentionString.sequential",
      "chain.attentionString.fPattern", "chain.attentionString.zPattern", "chain.attentionString.exploratory"]) {
      expect({ id, registered: id in MODEL_PROVENANCE }).toEqual({ id, registered: false });
    }
  });

  test("a string-valued trait reads as a missing trait, not as one of the retired levels", () => {
    expect(capacityVector({ attentionPattern: "targeted" }).attentionPattern).toBe(MODEL_PROVENANCE["chain.missingTraitCapacity"].value);
  });
});

describe("demand is written only where a layer reads it", () => {
  // A demand weight on a dimension that is in no layer changes no number: the
  // chain reads demand per layer trait and nothing else. Through 20.x the
  // demand curves wrote to readingTendency, mentalModelFlexibility,
  // interruptRecovery, metacognitivePlanning, persistence and motorPrecision,
  // all outside every layer, and eight of those weights sat in the registry as
  // hypotheses that could not be tested because they did nothing.
  const inLayers = new Set(LAYER_DEFINITIONS.flatMap((l) => l.traits));
  const pages = [
    MAX_PAGE,
    ...RAW_DEMANDS.map((d) => {
      const [informationDensity, visualComplexity, interactiveElementCount, textDensity, animationLevel, choiceCount, navigationDepth] = d.args;
      return { informationDensity, visualComplexity, interactiveElementCount, textDensity, animationLevel, choiceCount, navigationDepth };
    }),
    ...PAGE_DEMANDS.map((d) => d.metrics),
  ];

  test("every dimension outside every layer gets zero demand, on every reference page", () => {
    const written = new Set<string>();
    for (const page of pages) {
      const { demands } = computeDemandDistribution(withLawSeconds(page));
      for (const dim of DEMAND_DIMENSIONS) if (!inLayers.has(dim) && demands[dim] !== 0) written.add(dim);
    }
    expect([...written].sort()).toEqual([]);
  });

  test("every Schwartz modulation targets a trait inside the layer it names", () => {
    // Read from the source so the layer label is checked too: a label naming a
    // layer the trait is not in is a claim about the model that is false.
    const src = read("src/visual/cognitive-transport-chain.ts");
    const block = src.slice(src.indexOf("const VALUE_DEMAND_MODULATION"), src.indexOf("export function computeSequentialCTC"));
    const entries = Array.from(block.matchAll(/\{ value: '(\w+)', trait: '(\w+)', coefficient: '([\w.]+)', layer: '(\w+)' \}/g),
      (m) => ({ value: m[1], trait: m[2], id: m[3], layer: m[4] }));
    expect(entries.length).toBeGreaterThanOrEqual(10);
    const wrong = entries
      .filter((e) => !LAYER_DEFINITIONS.find((l) => l.name === e.layer)?.traits.includes(e.trait))
      .map((e) => `${e.id} -> ${e.trait} labelled ${e.layer}`);
    expect(wrong).toEqual([]);
  });
});

// ── Abandonment ──
const reg = (id: string) => MODEL_PROVENANCE[id].value;
/** The chain's Hill hazard, restated from the registry. */
const hazard = (cost: number, tolerance: number) => {
  const n = reg("chain.abandonmentHillExponent");
  return cost <= 0 ? 0 : Math.max(0, Math.min(1, Math.pow(cost, n) / (Math.pow(cost, n) + Math.pow(tolerance, n))));
};
const toleranceOf = (patience: number, resilience: number) => Math.max(reg("chain.abandonment.toleranceFloor"),
  (patience * reg("chain.abandonment.patienceShare") + resilience * reg("chain.abandonment.resilienceShare")) * reg("chain.abandonment.toleranceGain"));
/**
 * Which patience and resilience the hazard reads: what the page LEFT, i.e. the
 * run's remainingCapacity (21.0). Through 20.x it was the starting values.
 */
const toleranceFor = (_initial: Record<string, number>, r: { remainingCapacity: Record<string, number> }) =>
  toleranceOf(r.remainingCapacity.patience, r.remainingCapacity.resilience);
const allPersonas = () => [
  ...Object.entries(ROSTER).map(([n, p]) => toolProfile(n, p)),
  ...Object.entries(BOUNDARY_PERSONAS).map(([n, t]) => buildOTCognitiveProfile(n, { ...t })),
];

describe("abandonment is driven by unmet demand, not relieved by surplus", () => {
  // CTC bills surplus on disposition dimensions as a COST (over-deliberating a
  // trivial page is effort spent). Abandonment used to subtract 0.3 x that same
  // surplus from the deficit as RELIEF, so one quantity counted as harder in
  // the score and as more comfortable in the risk. A disposition surplus is not
  // comfort, so it no longer relieves anything.
  test("abandonmentRisk is the hazard of deficitCost alone, for every persona and reference page", () => {
    const off: string[] = [];
    for (const prof of allPersonas()) {
      const initial = capacityVector(prof.traits);
      for (const { id, demand } of allDemands()) {
        const r = computeSequentialCTC(prof, demand, { asymmetric: true, interactions: true });
        const want = hazard(r.deficitCost, toleranceFor(initial, r));
        if (Math.abs(r.abandonmentRisk - want) > 1e-12) off.push(`${prof.name}/${id}: ${r.abandonmentRisk} vs ${want}`);
      }
    }
    expect(off.slice(0, 5)).toEqual([]);
  });

  test("both directions: billed surplus now raises the risk over the old relieved figure, and with no surplus nothing changes", () => {
    let rose = 0, unchanged = 0;
    for (const prof of allPersonas()) {
      const initial = capacityVector(prof.traits);
      for (const { demand } of allDemands()) {
        const r = computeSequentialCTC(prof, demand, { asymmetric: true, interactions: true });
        const t = toleranceFor(initial, r);
        const relieved = hazard(Math.max(0, r.deficitCost - r.surplusCost * 0.3), t); // the 20.x figure
        if (r.surplusCost > 0 && r.deficitCost > 0) {
          expect(r.abandonmentRisk).toBeGreaterThanOrEqual(relieved);
          if (r.abandonmentRisk > relieved) rose++;
        } else {
          expect(r.abandonmentRisk).toBe(relieved);
          unchanged++;
        }
      }
    }
    expect(rose).toBeGreaterThan(0);
    expect(unchanged).toBeGreaterThan(0);
  });

  test("the per-screen hazard in the scroll path is the same quantity: unmet demand on that screen, no relief", () => {
    const R = reg("chain.roundingScale");
    const off: string[] = [];
    for (const prof of allPersonas()) {
      const initial = capacityVector(prof.traits);
      for (const s of SCROLL_INPUTS) {
        const demands = s.screens.map((a) => demandFromLegacy(...a));
        const scroll = computeSequentialScrollCTC(prof, demands, { asymmetric: true, interactions: true });
        let carried: Record<string, number> | undefined;
        demands.forEach((d, i) => {
          const r = computeSequentialCTC(prof, d, { asymmetric: true, interactions: true, carriedCapacity: carried });
          carried = r.remainingCapacity;
          const want = Math.round(hazard(r.deficitCost, toleranceFor(initial, r)) * R) / R;
          if (scroll.screens[i].stopHazard !== want) off.push(`${prof.name}/${s.id}#${i + 1}: ${scroll.screens[i].stopHazard} vs ${want}`);
          // And the aggregate run of that screen reports the same hazard.
          expect(Math.round(r.abandonmentRisk * R) / R).toBe(scroll.screens[i].stopHazard);
        });
      }
    }
    expect(off.slice(0, 5)).toEqual([]);
  });

  test("surplus relief is gone from the registry", () => {
    expect("chain.abandonment.surplusRelief" in MODEL_PROVENANCE).toBe(false);
  });
});

describe("abandonment reads the patience and resilience the page left, not the starting values", () => {
  // The chain spends patience in the frustration layer and drains resilience
  // through cross-layer depletion, then used to judge abandonment against the
  // persona as it arrived, as if the page had cost nothing. Tolerance now comes
  // from the run's residual capacity, so the same account that paid for the
  // page is the one deciding whether to leave.
  test("the change can only raise the risk, and does on pages that drain", () => {
    let rose = 0;
    for (const prof of allPersonas()) {
      const initial = capacityVector(prof.traits);
      for (const { demand } of allDemands()) {
        const r = computeSequentialCTC(prof, demand, { asymmetric: true, interactions: true });
        const fresh = hazard(r.deficitCost, toleranceOf(initial.patience, initial.resilience));
        expect(r.remainingCapacity.patience).toBeLessThanOrEqual(Math.max(initial.patience, reg("chain.capacityEpsilon")));
        expect(r.abandonmentRisk).toBeGreaterThanOrEqual(fresh - 1e-15);
        if (r.abandonmentRisk > fresh) rose++;
        if (r.deficitCost === 0) expect(r.abandonmentRisk).toBe(0);
      }
    }
    expect(rose).toBeGreaterThan(0);
  });

  test("both directions: arriving drained raises the risk, arriving rested lowers it", () => {
    const prof = toolProfile("first-timer", ROSTER["first-timer"]);
    const demand = demandFromLegacy(0.5, 0.5, 40, 0.5, 0.2, 12, 3);
    const start = capacityVector(prof.traits);
    const at = (patience: number, resilience: number) =>
      computeSequentialCTC(prof, demand, { asymmetric: true, interactions: true,
        carriedCapacity: { ...start, patience, resilience } });
    const base = at(start.patience, start.resilience);
    const drained = at(start.patience * 0.5, start.resilience * 0.5);
    const rested = at(Math.min(1, start.patience + 0.2), Math.min(1, start.resilience + 0.2));
    expect(base.deficitCost).toBeGreaterThan(0);
    expect(drained.abandonmentRisk).toBeGreaterThan(base.abandonmentRisk);
    expect(rested.abandonmentRisk).toBeLessThan(base.abandonmentRisk);
  });

  test("deeper screens are judged against a smaller budget: tolerance falls as the scroll goes on", () => {
    const prof = toolProfile("cognitive-adhd", ROSTER["cognitive-adhd"]);
    const wall = Array.from({ length: 4 }, () => demandFromLegacy(0.6, 0.6, 30, 0.6, 0.3, 10, 2));
    let carried: Record<string, number> | undefined;
    const tolerances: number[] = [];
    for (const d of wall) {
      const r = computeSequentialCTC(prof, d, { asymmetric: true, interactions: true, carriedCapacity: carried });
      carried = r.remainingCapacity;
      tolerances.push(toleranceOf(r.remainingCapacity.patience, r.remainingCapacity.resilience));
    }
    for (let i = 1; i < tolerances.length; i++) expect(tolerances[i]).toBeLessThan(tolerances[i - 1]);
  });
});

describe("a page with no motion makes no animation demand", () => {
  // The motion curve is a logistic centred at animationLevel 0.3, which is
  // 0.119 at animationLevel 0. Through 21.0's first pin that offset was demand:
  // a page with nothing moving still asked ~0.107 of changeBlindness and ~0.083
  // of emotionalContagion, and fed distractor pressure, so the all-zero page
  // carried a non-zero raw cost.
  const anim = (level: number) =>
    demandFromLegacy(0, 0, 0, 0, level, 0, 0).demands.emotionalContagion / reg("chain.demand.animation.emotionalContagion");

  test("animationLevel 0 yields zero animation demand", () => {
    const { demands } = demandFromLegacy(0, 0, 0, 0, 0, 0, 0);
    expect(demands.emotionalContagion).toBe(0);
    expect(demands.changeBlindness).toBe(0);
    // With visual complexity present and no motion, changeBlindness is the visual term alone.
    expect(demandFromLegacy(0, 0.4, 0, 0, 0, 0, 0).demands.changeBlindness).toBe(0.4);
  });

  test("the all-zero page costs nothing in any layer, raw cost 0, abandonment 0, for every persona", () => {
    const empty = demandFromLegacy(0, 0, 0, 0, 0, 0, 0);
    for (const prof of allPersonas()) {
      const r = computeSequentialCTC(prof, empty, { asymmetric: true, interactions: true });
      expect({ p: prof.name, raw: r.rawCTC, ab: r.abandonmentRisk, layers: r.layers.map((l) => l.transportCost) })
        .toEqual({ p: prof.name, raw: 0, ab: 0, layers: r.layers.map(() => 0) });
    }
  });

  test("motion demand still rises monotonically with animation and stays in [0, 1]", () => {
    const levels = [0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.6, 0.8, 1, 2, 10];
    const v = levels.map(anim);
    for (let i = 0; i < v.length; i++) {
      expect(v[i]).toBeGreaterThanOrEqual(0);
      expect(v[i]).toBeLessThanOrEqual(1);
      if (i > 0) expect(v[i]).toBeGreaterThan(v[i - 1]);
    }
    expect(v[0]).toBe(0);
    expect(v[levels.indexOf(1)]).toBeGreaterThan(0.95);
  });
});
