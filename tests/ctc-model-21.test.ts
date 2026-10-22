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
  DEMAND_DIMENSIONS,
} from "../src/visual/cognitive-transport-chain.js";
import { MODEL_PROVENANCE } from "../src/visual/model-provenance.js";
import { ROSTER, RAW_DEMANDS, PAGE_DEMANDS, toolProfile } from "./fixtures/ctc-golden-matrix.js";

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
      const r = computeSequentialCTC(toolProfile(name, p), computeDemandFromRawMetrics(...args));
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
    const { demands } = computeDemandDistribution(MAX_PAGE);
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
      const { demands } = computeDemandDistribution(page);
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
