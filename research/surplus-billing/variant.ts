/**
 * Write one surplus-billing option into a SCRATCH copy of the tree, for
 * predict.ts, stage-c-refset.ts and stage-c-golden-repin.ts to measure. Never
 * run it on a working tree: it rewrites src/visual/cognitive-transport-chain.ts
 * in place.
 *
 *   bun research/surplus-billing/variant.ts <scratch-tree> <option>
 *
 * Options (research/surplus-billing-design.md, section 2):
 *   a-motion    emotionalContagion and changeBlindness surplus-free
 *   a-class     every susceptibility surplus-free (the six of class A)
 *   b-class     class A surplus billed in proportion to its demand: w (c - d)^2 d
 *   c-motion    emotionalContagion and changeBlindness priced by exposure: w c d
 *   c-class     class A priced by exposure: w c d
 *   d           c-class, and patience surplus-free
 *   e           emotionalContagion priced by exposure, changeBlindness surplus-free
 *   f           e, and patience surplus-free
 * w is chain.weightSurplus throughout (0.3), so no option adds a constant.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const [tree, option] = process.argv.slice(2);
if (!tree || !option) throw new Error("usage: variant.ts <scratch-tree> <option>");
if (!tree.startsWith(tmpdir())) throw new Error(`refusing to rewrite ${tree}: options are written into scratch copies in the system temp dir only`);

const MOTION = ["emotionalContagion", "changeBlindness"];
const CLASS_A = [...MOTION, "fearOfMissingOut", "socialProofSensitivity", "anchoringBias", "riskTolerance"];
const PLAN: Record<string, { free?: string[]; scaled?: string[]; exposure?: string[] }> = {
  "a-motion": { free: MOTION },
  "a-class": { free: CLASS_A },
  "b-class": { scaled: CLASS_A },
  "c-motion": { exposure: MOTION },
  "c-class": { exposure: CLASS_A },
  "d": { exposure: CLASS_A, free: ["patience"] },
  "e": { exposure: ["emotionalContagion"], free: ["changeBlindness"] },
  "f": { exposure: ["emotionalContagion"], free: ["changeBlindness", "patience"] },
};
const plan = PLAN[option];
if (!plan) throw new Error(`unknown option ${option}; one of ${Object.keys(PLAN).join(", ")}`);

const file = join(tree, "src", "visual", "cognitive-transport-chain.ts");
let src = readFileSync(file, "utf8");
const replaceOnce = (from: string, to: string) => {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`${option}: expected one "${from.slice(0, 60)}", found ${n}`);
  src = src.replace(from, to);
};

const anchor = "  'attentionPattern',        // scanning-vs-thorough disposition\n]);\n";
replaceOnce(anchor, anchor + [
  `// research/surplus-billing variant ${option}`,
  `const SB_FREE: string[] = ${JSON.stringify(plan.free ?? [])};`,
  `const SB_SCALED = new Set<string>(${JSON.stringify(plan.scaled ?? [])});`,
  `const SB_EXPOSURE = new Set<string>(${JSON.stringify(plan.exposure ?? [])});`,
  `for (const t of SB_FREE) { SURPLUS_BILLED_DIMENSIONS.delete(t); SURPLUS_FREE_DIMENSIONS.add(t); }`,
  "",
].join("\n"));
replaceOnce(
  "      if (gap > 0) {\n        // Deficit: demand exceeds capacity",
  "      if (useAsymmetric && SB_EXPOSURE.has(trait)) {\n        cost = P.weightSurplus * c * d;\n        layerDeficit += cost;\n      } else if (gap > 0) {\n        // Deficit: demand exceeds capacity",
);
replaceOnce(
  "const surplusWeight = SURPLUS_FREE_DIMENSIONS.has(trait) ? 0 : P.weightSurplus;",
  "const surplusWeight = SURPLUS_FREE_DIMENSIONS.has(trait) ? 0 : P.weightSurplus * (SB_SCALED.has(trait) ? d : 1);",
);
writeFileSync(file, src);
console.log(`${option}: wrote ${file}`);
