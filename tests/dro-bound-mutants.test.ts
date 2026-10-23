/**
 * Mutation test of the DRO bound's tests: do the checks in dro-bound.test.ts
 * catch an unsound derivation?
 *
 * Each mutant is a string edit of src/visual/dro-bound.ts, read at test time
 * and written to a temp directory with its imports pointed back at the real
 * chain, so the shipped file is never touched. Every mutant is put through the
 * same three checks the shipped bound passes (tests/fixtures/dro-adversary.ts):
 * the per-coordinate adversary, the constructed populations, and the
 * precondition cases, on three independent search seeds. A mutant is killed
 * on a seed when any check fails.
 *
 * Must be killed on 3 of 3 seeds: M1, M2, M6, M7, M9, M10 (the six unsound
 * variants a 2026-10-21 cross-vendor audit found passing the previous tests;
 * the edits here are reconstructions from its descriptions), and every
 * reconstructed mutant shown unsound. The interaction mutants (M2, M2b, M10)
 * are refuted on the fixture's INTERACTION_PAGES, found by a scan after the
 * 21.0 chain changes emptied the page that refuted them before. M11 and M14
 * are reported and not required: no slope above them was found anywhere (on
 * the 21.0 chain, 508 pages with any subset of the generator's inputs at max,
 * mid, 0.1x or 0.03x plus 2000 random sparse pages, 4 option sets: best ratio
 * 0.9999, the same as the shipped bound), because the derivation's
 * depletion-coupling term over-counts by more than twice, so halving or
 * truncating it still leaves a valid bound.
 *
 * An unmutated copy goes through the same pipeline and must survive every
 * check on every seed; without it, a broken import path would "kill" every
 * mutant.
 *
 * M4 (sigma' taken at rawMax instead of the point nearest the logistic's
 * centre) was retired in 21.x with the logistic: the bound is on rawCTC now
 * and has no sigma' to mutate. The percentile bound built on it
 * (percentileLipschitzBound) is tested in dro-bound.test.ts and has no row
 * here: it is the raw constant times the curve's steepest slope, and the
 * steepest totalCTC slope any search finds is a few ten-thousandths of it, so
 * only a gross mutant could be refuted.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { computeDemandFromRawMetrics } from "../src/visual/cognitive-transport-chain.js";
import {
  adversarialPopulations,
  adversarialSearch,
  checkCoordinates,
  checkPopulations,
  checkPreconditions,
  type BoundModule,
} from "./fixtures/dro-adversary.js";
import { demandFromLegacy } from "./fixtures/law-seconds.js";

const SEEDS = [1, 2, 3];
const MID = demandFromLegacy(0.5, 0.5, 40, 0.5, 0.2, 12, 3);
const VISUAL = resolve(dirname(fileURLToPath(import.meta.url)), "../src/visual");

interface Mutant { id: string; what: string; from: string; to: string; mustKill: boolean }

const MUTANTS: Mutant[] = [
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

let dir = "";
const mods = new Map<string, BoundModule>();
type Verdict = { seed: number; coordinates: number; populations: number; preconditions: number };
const verdicts = new Map<string, Verdict[]>();

/** Write `source` with its relative imports pointed at the real src/visual, and import it. */
async function load(id: string, source: string): Promise<BoundModule> {
  const file = join(dir, `${id}.ts`);
  writeFileSync(file, source.replace(/from "\.\/([^"]+)"/g, (_, p: string) => `from "${join(VISUAL, p)}"`));
  return (await import(file)) as BoundModule;
}

function judge(id: string): Verdict[] {
  const hit = verdicts.get(id);
  if (hit) return hit;
  const mod = mods.get(id)!;
  const out = SEEDS.map((seed) => ({
    seed,
    coordinates: checkCoordinates(adversarialSearch(seed), mod).violations.length,
    populations: checkPopulations(adversarialPopulations(seed), mod).violations.length,
    preconditions: checkPreconditions(mod, MID).length,
  }));
  verdicts.set(id, out);
  return out;
}

const killed = (v: Verdict) => v.coordinates + v.populations + v.preconditions > 0;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "dro-mutants-"));
  const source = readFileSync(join(VISUAL, "dro-bound.ts"), "utf8");
  mods.set("control", await load("control", source));
  for (const m of MUTANTS) {
    const n = source.split(m.from).length - 1;
    if (n !== 1) throw new Error(`${m.id}: the edit "${m.from}" matches ${n} places in dro-bound.ts, not 1; update the mutant`);
    mods.set(m.id, await load(m.id, source.replace(m.from, m.to)));
  }
  // The searches and populations depend on the seed only, never on a bound: build them once.
  for (const seed of SEEDS) adversarialPopulations(seed);
}, 180_000);

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("DRO bound mutants", () => {
  test("the unmutated copy survives every check on every seed", () => {
    expect(judge("control").filter(killed)).toEqual([]);
  });

  for (const m of MUTANTS.filter((x) => x.mustKill)) {
    test(`${m.id} (${m.what}) is killed on ${SEEDS.length} of ${SEEDS.length} seeds`, () => {
      expect(judge(m.id).filter((v) => !killed(v)).map((v) => v.seed)).toEqual([]);
    });
  }

  test("kill table", () => {
    const rows = MUTANTS.map((m) => {
      const v = judge(m.id);
      const cells = v.map((x) => `${killed(x) ? "killed" : "SURVIVED"} (c${x.coordinates}/p${x.populations}/pre${x.preconditions})`);
      return `  ${m.id.padEnd(4)} ${String(v.filter(killed).length)}/${v.length}  ${m.mustKill ? "must" : "info"}  ${m.what.padEnd(58)} ${cells.join("  ")}`;
    });
    console.log(`[dro mutants] seeds ${SEEDS.join(", ")}; per seed: violations found by the coordinate / population / precondition checks\n${rows.join("\n")}`);
    expect(rows.length).toBe(MUTANTS.length);
  });
});
