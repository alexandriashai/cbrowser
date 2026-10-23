/**
 * The mutants of src/visual/dro-bound.ts that tests/dro-bound-mutants.test.ts
 * puts through the adversary (the kill table), and that
 * research/stage-b-dro-scan.ts scans with. Each is a string edit of the
 * shipped file; loadBoundModules writes every one, and an unmutated control,
 * to a directory with its relative imports pointed back at the real chain, so
 * the shipped file is never touched.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BoundModule } from "./dro-adversary.js";

const VISUAL = resolve(dirname(fileURLToPath(import.meta.url)), "../../src/visual");

export interface Mutant { id: string; what: string; from: string; to: string; mustKill: boolean }

export const MUTANTS: Mutant[] = [
  { id: "M1", what: "drop depletion coupling", mustKill: true,
    from: "let dk = (l.g[s] ?? 0) + l.A * rhoSigma * earlier;", to: "let dk = (l.g[s] ?? 0);" },
  { id: "M2", what: "drop interaction terms (partials and rawMax)", mustKill: true,
    from: "const useInter = options.interactions !== false;", to: "const useInter = false;" },
  { id: "M2b", what: "drop interaction terms from the partials only", mustKill: true,
    from: "for (const p of pairs) rawPartial += p.w * ((D[p.a] ?? 0) * maxCostOf(p.b) + maxCostOf(p.a) * (D[p.b] ?? 0));", to: "" },
  { id: "M3", what: "drop the surplus gap from the per-trait slope", mustKill: true,
    from: "g[t] = gate * 2 * Math.max(wDef * defGap, wSur(t) * surGap);", to: "g[t] = gate * 2 * wDef * defGap;" },
  { id: "M5", what: "drop the factor 2 of the squared-gap derivative", mustKill: true,
    from: "g[t] = gate * 2 * Math.max(", to: "g[t] = gate * Math.max(" },
  { id: "M6", what: "drop the content-gate derivative on the readingTendency path", mustKill: true,
    from: "P.contentScaleGain * wMax * gapMax * gapMax + ", to: "" },
  { id: "M7", what: "content gate from the low end of the demand range", mustKill: true,
    from: "const mean = def.traits.reduce((s, t) => s + dHi(t), 0)", to: "const mean = def.traits.reduce((s, t) => s + dLo(t), 0)" },
  { id: "M8", what: "drop the readingTendency demand path", mustKill: true,
    from: "if (s === RT && l.traits.includes(SA)) {", to: "if (false) {" },
  { id: "M9", what: "multiply the bound by 0.9", mustKill: true,
    from: "const bound = rawPartial;", to: "const bound = 0.9 * rawPartial;" },
  { id: "M10", what: "halve the layer maxCost the interaction terms read", mustKill: true,
    from: "const maxCostOf = (name: string) => layers.find((l) => l.name === name)?.maxCost ?? 0;",
    to: "const maxCostOf = (name: string) => 0.5 * (layers.find((l) => l.name === name)?.maxCost ?? 0);" },
  { id: "M11", what: "halve the depletion coupling rate", mustKill: false,
    from: "const rhoSigma = P.depletionRate * P.indirectShare;", to: "const rhoSigma = P.depletionRate * P.indirectShare * P.indirectShare;" },
  { id: "M12", what: "halve epsilon * L in upper", mustKill: true,
    from: "upper: Math.min(ceiling, nominal + epsilon * lipschitz),", to: "upper: Math.min(ceiling, nominal + 0.5 * epsilon * lipschitz)," },
  { id: "M13", what: "nominal ignores the weights", mustKill: true,
    from: "mean += ((m.weight ?? 1) / total) * f(", to: "mean += (1 / population.length) * f(" },
  { id: "M14", what: "first-order depletion coupling only", mustKill: false,
    from: "if (l.gated) earlier += dk;", to: "if (l.gated) earlier += l.g[s] ?? 0;" },
  { id: "P1", what: "ctcLipschitzBound ignores broken preconditions", mustKill: true,
    from: "if (broken.length) throw new Error(", to: "if (false) throw new Error(" },
  { id: "P2", what: "no disjointness check", mustKill: true,
    from: "else\n        broken.push(`trait", to: "else if (false)\n        broken.push(`trait" },
  { id: "P3", what: "no last-layer check for sustainedAttention", mustKill: true,
    from: "if (iSA !== layout.layers.length - 1)", to: "if (false)" },
  { id: "P4", what: "interaction weight sign unchecked", mustKill: true,
    from: "if (!(Number.isFinite(p.weight) && p.weight >= 0))", to: "if (!Number.isFinite(p.weight))" },
  { id: "P5", what: "demand sign unchecked", mustKill: true,
    from: 'if (typeof v !== "number" || !Number.isFinite(v) || v < 0)', to: 'if (typeof v !== "number" || !Number.isFinite(v))' },
  { id: "P6", what: "unmodelled options accepted", mustKill: true,
    from: 'if (k !== "asymmetric" && k !== "interactions" && v !== undefined)', to: "if (false)" },
];

/** Write `source` with its relative imports pointed at the real src/visual, and import it. */
async function load(dir: string, id: string, source: string): Promise<BoundModule> {
  const file = join(dir, `${id}.ts`);
  writeFileSync(file, source.replace(/from "\.\/([^"]+)"/g, (_, p: string) => `from "${join(VISUAL, p)}"`));
  return (await import(file)) as BoundModule;
}

/** "control" (the shipped file, unmutated) and every mutant, written to `dir` and imported. Throws when an edit no longer matches exactly one place. */
export async function loadBoundModules(dir: string): Promise<Map<string, BoundModule>> {
  const source = readFileSync(join(VISUAL, "dro-bound.ts"), "utf8");
  const mods = new Map<string, BoundModule>();
  mods.set("control", await load(dir, "control", source));
  for (const m of MUTANTS) {
    const n = source.split(m.from).length - 1;
    if (n !== 1) throw new Error(`${m.id}: the edit "${m.from}" matches ${n} places in dro-bound.ts, not 1; update the mutant`);
    mods.set(m.id, await load(dir, m.id, source.replace(m.from, m.to)));
  }
  return mods;
}
