/**
 * Coverage of the 406 trait pairs by retrieved correlation estimates.
 *
 * Every pair below is a row of README.md deliverable 2. Trait names are checked
 * against COGNITIVE_TRAITS, so a misspelt or retired name fails loudly instead
 * of silently shrinking the count.
 *
 *   bun research/persona-norms/coverage.ts
 */
import { COGNITIVE_TRAITS } from "../../src/visual/cognitive-transport.js";
import { INDICATORS } from "./sro-correlations.js";

/** Published coefficient, general (non-clinical) population. */
export const PUBLISHED: Array<[string, string, string]> = [
  ["resilience", "selfEfficacy", "Kunzler2018"],
  ["metacognitivePlanning", "timeHorizon", "Cyders2011"],
  ["riskTolerance", "timeHorizon", "Cyders2011"],
  ["workingMemory", "sustainedAttention", "McVayKane2009; Ikegami2026"],
  ["workingMemory", "readingCapacity", "Peng2018"],
  ["changeBlindness", "workingMemory", "Andermane2019"],
  ["changeBlindness", "sustainedAttention", "Andermane2019"],
  ["satisficing", "readingTendency", "Lai2010"],
  ["riskTolerance", "satisficing", "Lai2010"],
  ["satisficing", "selfEfficacy", "Lai2010"],
  ["sustainedAttention", "timeHorizon", "Ikegami2026"],
  ["timeHorizon", "workingMemory", "Ikegami2026"],
  ["resilience", "mentalModelFlexibility", "Mor2026"],
  ["fearOfMissingOut", "socialProofSensitivity", "Wall2019"],
  ["fearOfMissingOut", "authoritySensitivity", "Wall2019"],
  ["socialProofSensitivity", "authoritySensitivity", "Wall2019"],
];

/** Proxy only (patience via CANTAB CGT delay aversion); listed, not counted. */
export const PROXY: Array<[string, string, string]> = [
  ["patience", "timeHorizon", "Ikegami2026"],
  ["patience", "workingMemory", "Ikegami2026"],
  ["patience", "sustainedAttention", "Ikegami2026"],
];

/** Published coefficient within a named condition or age group. */
export const CONDITION: Array<[string, string, string, string]> = [
  ["workingMemory", "mentalModelFlexibility", "older adults 60-73 and 74-98", "Glisky2020"],
];

const key = (a: string, b: string) => [a, b].sort().join("|");

if (import.meta.main) {
  const traits = new Set<string>(COGNITIVE_TRAITS);
  const total = (traits.size * (traits.size - 1)) / 2;
  for (const [a, b] of [...PUBLISHED, ...PROXY, ...CONDITION].map((r) => [r[0], r[1]])) {
    if (!traits.has(a) || !traits.has(b)) throw new Error(`not a COGNITIVE_TRAITS name: ${a} / ${b}`);
  }
  const sroTraits = Object.keys(INDICATORS);
  for (const t of sroTraits) if (!traits.has(t)) throw new Error(`SRO indicator not a trait: ${t}`);
  const sro = new Set<string>();
  for (let i = 0; i < sroTraits.length; i++) for (let j = i + 1; j < sroTraits.length; j++) sro.add(key(sroTraits[i], sroTraits[j]));

  const pub = new Set(PUBLISHED.map(([a, b]) => key(a, b)));
  const any = new Set([...pub, ...sro]);
  const sroOnly = [...sro].filter((k) => !pub.has(k));
  const cond = new Set(CONDITION.map(([a, b]) => key(a, b)));
  const pct = (n: number) => `${((100 * n) / total).toFixed(1)}%`;

  console.log(`dimensions: ${traits.size}, pairs: ${total}`);
  console.log(`general population, published coefficient: ${pub.size} (${pct(pub.size)})`);
  console.log(`general population, computed from SRO open data: ${sro.size} (${sroOnly.length} not also published)`);
  console.log(`general population, any estimate: ${any.size} (${pct(any.size)})`);
  console.log(`proxy-only pairs, not counted: ${PROXY.length}`);
  console.log(`condition-specific, published: ${cond.size} (${pct(cond.size)})`);
  const touched = new Set([...any].flatMap((k) => k.split("|")));
  console.log(`traits in at least one general-population pair: ${touched.size} of ${traits.size}`);
  console.log(`traits in none: ${[...traits].filter((t) => !touched.has(t)).join(", ")}`);
}
