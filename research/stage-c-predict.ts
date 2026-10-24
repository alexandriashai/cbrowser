/**
 * Stage C prediction: what candidate redesigns of the cognitiveLoad layer do
 * to the 513 reference pages, with no change under src/. Each variant patches
 * the chain's exported layer and interaction tables at run time and overrides
 * the cognitiveLoad demands after computeDemandDistribution, then ranks rawCTC
 * against a percentile curve rebuilt from the same variant (25 built-in
 * personas x 513 pages, pooled, as ctc-reference.ts does), so totalCTC is the
 * variant's own scale, not the shipped one.
 *
 *   VARIANT=V0|V1|V2|V3|V4|V5|V6|V7 bun research/stage-c-predict.ts   (one variant per process)
 *
 *   V0  today (feat/cot-integration 8707e49)
 *   V1  cognitiveLoad retired: layer removed, its three interaction pairs removed
 *   V2  layer = comprehension, workingMemory, informationForaging, transferLearning,
 *       each demanded the choosing-time demand d(choosingSeconds), share 1;
 *       siteFamiliarity out of the layer (it becomes Cockburn's e on choosing, 0 here)
 *   V3  as V2, but workingMemory demanded the reading-time demand d(readingSeconds)
 *   V4  as V2, every trait demanded d(readingSeconds + choosingSeconds)
 *   V5  as V2, and frustration's patience demanded d(readingSeconds) in place
 *       of its two text terms
 *   V6  as V2, and patience demanded d(pointing + choosing + reading + procedure
 *       seconds), the whole page's reference time
 *   V7  as V2, and patience demanded 0.7 x d(readingSeconds): the retired
 *       chain.demand.text.patience share re-pointed at the reading demand
 *
 * Writes research/stage-c-predict/<VARIANT>.json.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const V = process.env.VARIANT ?? "V0";
const chain = await import("../src/visual/cognitive-transport-chain.ts");
const { LAYER_DEFINITIONS, INTERACTION_PAIRS, computeDemandDistribution, computeSequentialCTC } = chain;
const { referenceRaw, percentileCurve, percentileAt } = await import("../src/visual/ctc-reference.ts");
const { deriveMetrics, COGNITIVE_TRAITS } = await import("../src/visual/cognitive-transport.ts");
const { timeDemand } = await import("../src/visual/demand-laws.ts");
const { buildOTCognitiveProfile } = await import("../src/visual/cognitive-transport.ts");
const { readingCapacityOf, getReadingProfile, motorCapacityOf, getPointingProfile, sustainedAttentionOf } = await import("../src/visual/cognitive-models.ts");
const { ROSTER, toolProfile } = await import("../tests/fixtures/ctc-golden-matrix.ts");

const LOAD = ["comprehension", "workingMemory", "informationForaging", "transferLearning"];
const cl = LAYER_DEFINITIONS.find((l: { name: string }) => l.name === "cognitiveLoad")!;
if (V === "V1") {
  LAYER_DEFINITIONS.splice(LAYER_DEFINITIONS.indexOf(cl), 1);
  for (let i = INTERACTION_PAIRS.length - 1; i >= 0; i--) {
    const p = INTERACTION_PAIRS[i];
    if (p.a === "cognitiveLoad" || p.b === "cognitiveLoad") INTERACTION_PAIRS.splice(i, 1);
  }
} else if (V !== "V0") {
  cl.traits = [...LOAD];
}

function override(d: { demands: Record<string, number> }, m: { choosingSeconds: number; readingSeconds: number; pointingSeconds: number; procedureSeconds: number }) {
  if (V === "V0") return d;
  const out = { ...d, demands: { ...d.demands } };
  for (const t of [...LOAD, "siteFamiliarity"]) out.demands[t] = 0;
  if (V === "V1") return out;
  const dc = timeDemand(m.choosingSeconds), dr = timeDemand(m.readingSeconds), dt = timeDemand(m.choosingSeconds + m.readingSeconds);
  for (const t of LOAD) out.demands[t] = V === "V4" ? dt : dc;
  if (V === "V3") out.demands.workingMemory = dr;
  if (V === "V5") out.demands.patience = dr;
  if (V === "V7") out.demands.patience = 0.7 * dr;
  if (V === "V6") out.demands.patience = timeDemand(m.pointingSeconds + m.choosingSeconds + m.readingSeconds + m.procedureSeconds);
  return out;
}

// typical-user as paper-calcs r2 defines it (25 authored traits at 0.5, first visit,
// the bridge's no-statement capacities), built on this tree.
const CAP = ["readingCapacity", "motorCapacity", "sustainedAttention"];
const typicalTraits: Record<string, number> = {};
for (const t of COGNITIVE_TRAITS) if (t !== "siteFamiliarity" && !CAP.includes(t)) typicalTraits[t] = 0.5;
typicalTraits.siteFamiliarity = 0;
typicalTraits.readingCapacity = readingCapacityOf(getReadingProfile({}));
typicalTraits.motorCapacity = motorCapacityOf(getPointingProfile({}));
typicalTraits.sustainedAttention = sustainedAttentionOf({});
const typical = buildOTCognitiveProfile("typical-user", typicalTraits);

const names = Object.keys(ROSTER);
const profiles = Object.fromEntries(names.map((n) => [n, toolProfile(n, ROSTER[n])]));
const OPTS = { asymmetric: true, interactions: true };
const result: Record<string, unknown> = { variant: V, layers: LAYER_DEFINITIONS.map((l: { name: string }) => l.name), interactions: INTERACTION_PAIRS.length };
for (const scope of ["viewport", "full_page"] as const) {
  const metrics = referenceRaw(scope).map((r: unknown) => deriveMetrics(r));
  const demands = metrics.map((m: any) => override(computeDemandDistribution(m), m));
  const raw: Record<string, number[]> = {};
  const layer: Record<string, Record<string, number>> = {};
  for (const [n, prof] of [...Object.entries(profiles), ["typical-user", typical]] as Array<[string, any]>) {
    raw[n] = []; layer[n] = {};
    for (const d of demands) {
      const r = computeSequentialCTC(prof, d, OPTS);
      raw[n].push(r.rawCTC);
      for (const l of r.layers) layer[n][l.name] = (layer[n][l.name] ?? 0) + l.transportCost / demands.length;
    }
  }
  const curve = percentileCurve(names.flatMap((n) => raw[n]));
  const total: Record<string, number[]> = Object.fromEntries(Object.entries(raw).map(([n, xs]) => [n, xs.map((x) => percentileAt(curve, x))]));
  result[scope] = { pages: metrics.length, raw, total, layer };
}
const dir = join(import.meta.dir, "stage-c-predict");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `${V}.json`), JSON.stringify(result));
console.log(`wrote ${V}: layers ${(result.layers as string[]).join(",")}; interactions ${result.interactions}`);
