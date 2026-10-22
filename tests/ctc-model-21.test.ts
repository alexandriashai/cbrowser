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
  computeDemandFromRawMetrics,
  computeSequentialCTC,
} from "../src/visual/cognitive-transport-chain.js";
import { MODEL_PROVENANCE } from "../src/visual/model-provenance.js";
import { ROSTER, toolProfile } from "./fixtures/ctc-golden-matrix.js";

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
