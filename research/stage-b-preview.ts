/**
 * A preview of the Stage B chain on the sampled pages: today's demand with the
 * law demands substituted on the dimensions Stage B rewrites (motor, decision,
 * procedure, reading, reading attention), today's capacities and the rate-based
 * ones, through the shipped chain. Layer costs and rawCTC only: totalCTC is a
 * percentile against a reference built under today's demands, so it is not
 * comparable here. Prototype for research/stage-b-design.md, not product code.
 *
 *   bun research/stage-b-preview.ts [--decision search|hick]
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUILTIN_PERSONAS, ACCESSIBILITY_PERSONAS, EMOTIONAL_PERSONAS } from "../src/personas.js";
import {
  bridgeCapacityTraits, getPointingProfile, getReadingProfile, KNOWN_POINTING_PROFILES, KNOWN_READING_PROFILES,
} from "../src/visual/cognitive-models.js";
import { buildOTCognitiveProfile, deriveMetrics, type RawPageMeasurement } from "../src/visual/cognitive-transport.js";
import { computeDemandDistribution, computeSequentialCTC, LAYER_DEFINITIONS } from "../src/visual/cognitive-transport-chain.js";
import { param } from "../src/visual/model-provenance.js";
import { lawTimes } from "./stage-b-explore.js";

const TAU = 12.4;
const useHick = process.argv.includes("hick");
const d = (T: number) => T / (T + TAU);

type P = { cognitiveTraits?: Record<string, number>; accessibilityTraits?: Record<string, number> };
const roster = { ...BUILTIN_PERSONAS, ...ACCESSIBILITY_PERSONAS, ...EMOTIONAL_PERSONAS } as Record<string, P>;
const wordMs = (p: { phonological: number; visualSpan: number }) => 250 + (1 - p.phonological) * 100 + Math.max(0, 7 / p.visualSpan - 1) * 80;
const tpRef = KNOWN_POINTING_PROFILES.neurotypical.throughput;
const msRef = wordMs(KNOWN_READING_PROFILES.neurotypical);

const personas = Object.entries(roster).map(([name, p]) => {
  const old = { ...(p.cognitiveTraits ?? {}) } as Record<string, number>;
  old.siteFamiliarity = 0;
  bridgeCapacityTraits(name, old, p.accessibilityTraits);
  const tp = getPointingProfile({ name, traits: old }).throughput;
  const ms = wordMs(getReadingProfile({ name, traits: old, accessibilityTraits: p.accessibilityTraits }));
  const neu = { ...old, motorCapacity: tp / (tp + tpRef), readingCapacity: msRef / (msRef + ms) };
  return { name, old: buildOTCognitiveProfile(name, old), neu: buildOTCognitiveProfile(name, neu) };
});

function lawDemand(raw: RawPageMeasurement) {
  const m = deriveMetrics(raw);
  const base = computeDemandDistribution(m);
  const L = lawTimes(raw);
  const dem = { ...base.demands };
  const dDec = d(useHick ? L.hick : L.search);
  dem.motorCapacity = d(L.motorMB);
  dem.proceduralFluency = d(L.procedure);
  dem.satisficing = dDec;
  dem.anchoringBias = dDec * param("chain.demand.choice.anchoringBias");
  dem.fearOfMissingOut = dDec * param("chain.demand.choice.fearOfMissingOut");
  dem.socialProofSensitivity = dDec * param("chain.demand.choice.socialProofSensitivity");
  dem.riskTolerance = dDec * param("chain.demand.interactive.riskTolerance");
  const dRead = d(L.read);
  dem.readingCapacity = dRead;
  // sustainedAttention keeps its distractor multiplier; only the base changes.
  const oldBase = Math.max(m.textDensity, m.informationDensity);
  dem.sustainedAttention = oldBase > 0 ? Math.min(1, base.demands.sustainedAttention * (dRead / oldBase)) : 0;
  return { old: base, neu: { demands: dem, scope: base.scope } };
}

const file = join(import.meta.dir, "stage-b-sample", "raw.jsonl");
const layers = LAYER_DEFINITIONS.map((l) => l.name);
const acc: Record<string, Record<string, { old: number[]; neu: number[]; neuOldCap: number[] }>> = {};
for (const line of readFileSync(file, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const r = JSON.parse(line);
  if (r.outcome !== "measured") continue;
  for (const scope of ["viewport", "full_page"]) {
    const raw = r.raw[scope] as RawPageMeasurement;
    if (!raw || raw.interactiveElements === 0) continue;
    const { old, neu } = lawDemand(raw);
    for (const p of personas) {
      const a = computeSequentialCTC(p.old, old);
      const b = computeSequentialCTC(p.neu, neu);
      const c = computeSequentialCTC(p.old, neu);
      const key = `${scope}`;
      acc[key] ??= {};
      for (const [i, l] of [...layers, "rawCTC"].entries()) {
        acc[key][`${p.name}|${l}`] ??= { old: [], neu: [], neuOldCap: [] };
        const pick = (x: typeof a) => (l === "rawCTC" ? x.rawCTC : x.layers[i].transportCost);
        acc[key][`${p.name}|${l}`].old.push(pick(a));
        acc[key][`${p.name}|${l}`].neu.push(pick(b));
        acc[key][`${p.name}|${l}`].neuOldCap.push(pick(c));
      }
    }
  }
}
const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
const show = ["power-user", "first-timer", "elderly-user", "motor-impairment-tremor", "cognitive-adhd", "dyslexic-user", "low-vision-magnified", "intellectual-disability"];
for (const scope of Object.keys(acc)) {
  console.log(`\n${scope}: mean over pages, old -> new (new demand, old capacities in brackets)`);
  console.log(["persona", ...layers, "rawCTC"].join("\t"));
  for (const name of show) {
    console.log([name, ...[...layers, "rawCTC"].map((l) => {
      const v = acc[scope][`${name}|${l}`];
      return `${mean(v.old).toFixed(3)}->${mean(v.neu).toFixed(3)} [${mean(v.neuOldCap).toFixed(3)}]`;
    })].join("\t"));
  }
  // Ordering check on the two capacity layers: the persona ranking by mean cost.
  for (const l of ["motor", "readability", "decision"]) {
    const rank = (k: "old" | "neu") => [...personas].sort((x, y) => mean(acc[scope][`${y.name}|${l}`][k]) - mean(acc[scope][`${x.name}|${l}`][k])).slice(0, 5).map((x) => x.name).join(", ");
    console.log(`  ${l} costliest 5, old: ${rank("old")}\n  ${l} costliest 5, new: ${rank("neu")}`);
  }
}
