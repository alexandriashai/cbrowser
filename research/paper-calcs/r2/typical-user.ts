/**
 * A typical-user baseline for the paper, and the model's CTC for it and for every
 * built-in human persona on every graded page of the shipped reference set.
 *
 * WHY. Round 1 used first-timer as the generic ("neurotypical") baseline. It is a
 * novice persona (comprehension 0.3, proceduralFluency 0.2), so "persona X costs
 * less than first-timer" compared X with a novice, not with a typical user.
 *
 * DEFINITION OF "POPULATION MEDIAN" (primary variant, `typical-user`).
 *   The paper's trait scale (Section 3.1.1) reads a trait value as the percentile
 *   of the reference population on a normed instrument. On that scale the
 *   population median is 0.5 by definition. It is not computed over personas.
 *   - the 25 authored cognitive traits (COGNITIVE_TRAITS minus siteFamiliarity and
 *     the three bridged capacities; every built-in human persona authors exactly
 *     these 25) at 0.5;
 *   - siteFamiliarity 0, the first visit every reference persona is scored at;
 *   - the three bridged capacities at the values the bridge gives a persona that
 *     states nothing, i.e. cognitive-models.ts's own neurotypical profiles:
 *       readingCapacity    = readingCapacityOf(getReadingProfile({}))
 *                            (KNOWN_READING_PROFILES.neurotypical)
 *       motorCapacity      = motorCapacityOf(getPointingProfile({}))
 *                            (KNOWN_POINTING_PROFILES.neurotypical)
 *       sustainedAttention = sustainedAttentionOf({}) (0.7, the function's
 *                            "unremarkable" default)
 *
 *   Why not bridge the 0.5 traits: the bridge's trait routes interpolate from an
 *   impaired profile at trait 0 to the neurotypical one at trait 1. comprehension
 *   0.5 yields a reader halfway to the dyslexic profile, proceduralFluency 0.5 +
 *   patience 0.5 a pointer halfway to tremor, interruptRecovery 0.5 an attention of
 *   0.5. Those routes treat 1, not 0.5, as typical.
 *
 * SENSITIVITY VARIANTS, scored beside it:
 *   `typical-user-bridged`        the 25 traits at 0.5 and capacities from
 *                                 bridgeCapacityTraits on them: what cognitive_effort
 *                                 computes for a custom persona with every trait 0.5.
 *   `typical-user-roster-median`  "median over personas": each authored trait at its
 *                                 median over the 25 built-in human personas, each
 *                                 bridged capacity at its median over the same 25
 *                                 (as referencePopulation() bridges them),
 *                                 siteFamiliarity 0. The roster is 11 accessibility
 *                                 and 4 emotional-state personas out of 25, so this
 *                                 is not a sample of a population; it is reported so
 *                                 the reader can see whether the choice moves the
 *                                 result.
 *
 * Scored as cognitive_effort scores by default: buildOTCognitiveProfile, values off,
 * asymmetric and interactions on, ranked against the shipped percentile curve of the
 * matching scope. Pages come from the reference module's API (referenceOutcomes +
 * referencePages), not from a data file name, so a new reference is picked up
 * without editing this script.
 *
 * Output: ctc-scores.csv (page x scope x persona: raw, total, the eight layer
 * costs) and typical-user.json (definition, traits, capacities, provenance).
 * Statistics are in face_validity.py.
 *
 * Usage (as the tree's owner, worktree root): bun research/paper-calcs/r2/typical-user.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { referencePopulation, referenceOutcomes, referencePages, CTC_REFERENCE } from "../../../src/visual/ctc-reference.js";
import { computeDemandDistribution, computeSequentialCTC, LAYER_DEFINITIONS } from "../../../src/visual/cognitive-transport-chain.js";
import { buildOTCognitiveProfile, COGNITIVE_TRAITS } from "../../../src/visual/cognitive-transport.js";
import {
  bridgeCapacityTraits, readingCapacityOf, getReadingProfile, motorCapacityOf, getPointingProfile, sustainedAttentionOf,
} from "../../../src/visual/cognitive-models.js";
import { provenance } from "./provenance.ts";

const OUT = import.meta.dir;
const SCOPES = ["viewport", "full_page"] as const;
const CAPACITIES = ["readingCapacity", "motorCapacity", "sustainedAttention"] as const;
const AUTHORED = COGNITIVE_TRAITS.filter((t) => t !== "siteFamiliarity" && !(CAPACITIES as readonly string[]).includes(t));

const median = (v: number[]) => { const s = v.slice().sort((a, b) => a - b); const h = (s.length - 1) / 2; return (s[Math.floor(h)] + s[Math.ceil(h)]) / 2; };

const population = referencePopulation();
for (const p of population) {
  const missing = AUTHORED.filter((t) => typeof p.traits[t] !== "number");
  if (missing.length) throw new Error(`${p.name} does not author ${missing.join(", ")}: the roster median would mix defaults in`);
  for (const c of CAPACITIES) if (typeof p.traits[c] !== "number") throw new Error(`${p.name} has no bridged ${c}`);
}

const atHalf = (): Record<string, number> => {
  const t: Record<string, number> = {};
  for (const k of AUTHORED) t[k] = 0.5;
  t.siteFamiliarity = 0;
  return t;
};

const neurotypicalCapacities = {
  readingCapacity: readingCapacityOf(getReadingProfile({})),
  motorCapacity: motorCapacityOf(getPointingProfile({})),
  sustainedAttention: sustainedAttentionOf({}),
};
const typical = { ...atHalf(), ...neurotypicalCapacities };
const bridged = atHalf();
bridgeCapacityTraits("typical-user", bridged);
const rosterMedian: Record<string, number> = { siteFamiliarity: 0 };
for (const k of [...AUTHORED, ...CAPACITIES]) rosterMedian[k] = median(population.map((p) => p.traits[k]));

const TYPICAL = [
  { name: "typical-user", traits: typical },
  { name: "typical-user-bridged", traits: bridged },
  { name: "typical-user-roster-median", traits: rosterMedian },
];
const scored = [...TYPICAL, ...population.map((p) => ({ name: p.name, traits: p.traits }))];

// Graded pages in dataset order, zipped with their metrics (referencePages keeps the same order).
const gradedUrls = referenceOutcomes().filter((o) => o.outcome === "graded").map((o) => o.url);
const layerNames = LAYER_DEFINITIONS.map((l) => l.name);
const rows: string[] = [];
for (const scope of SCOPES) {
  const pages = referencePages(scope);
  if (pages.length !== gradedUrls.length) throw new Error(`${scope}: ${pages.length} metric rows for ${gradedUrls.length} graded pages`);
  pages.forEach((metrics, i) => {
    const demand = computeDemandDistribution(metrics);
    if ((demand.scope ?? "viewport") !== scope) throw new Error(`${gradedUrls[i]}: demand scope ${demand.scope} under ${scope}`);
    for (const { name, traits } of scored) {
      const r = computeSequentialCTC(buildOTCognitiveProfile(name, traits), demand, { asymmetric: true, interactions: true });
      if (r.referenceScope !== scope) throw new Error(`ranked against ${r.referenceScope}, expected ${scope}`);
      const layers = layerNames.map((ln) => r.layers.find((l) => l.name === ln)?.transportCost ?? NaN);
      rows.push([gradedUrls[i], scope, name, r.rawCTC.toFixed(6), r.totalCTC.toFixed(6), ...layers.map((x) => x.toFixed(6))].join(","));
    }
  });
}

const prov = provenance();
writeFileSync(join(OUT, "ctc-scores.csv"),
  `url,scope,persona,raw_ctc,total_ctc,${layerNames.map((l) => `layer_${l}`).join(",")}\n${rows.join("\n")}\n`);
writeFileSync(join(OUT, "typical-user.json"), JSON.stringify({
  provenance: prov,
  reference: CTC_REFERENCE,
  graded_pages: gradedUrls.length,
  personas_scored: population.map((p) => p.name),
  definition: {
    primary: "typical-user",
    population_median: "0.5 on the paper's percentile trait scale (Section 3.1.1); not computed over personas",
    authored_traits: AUTHORED,
    siteFamiliarity: 0,
    capacities: {
      readingCapacity: "readingCapacityOf(getReadingProfile({})): the neurotypical reading profile",
      motorCapacity: "motorCapacityOf(getPointingProfile({})): the neurotypical pointing profile",
      sustainedAttention: "sustainedAttentionOf({}): 0.7, the function's default for a persona that states nothing",
    },
    variants: {
      "typical-user-bridged": "authored traits 0.5, capacities from bridgeCapacityTraits on them",
      "typical-user-roster-median": `each authored trait and bridged capacity at its median over the ${population.length} built-in human personas`,
    },
    scoring: "buildOTCognitiveProfile + computeSequentialCTC, asymmetric and interactions on, values off; percentile against the shipped curve of the same scope",
  },
  traits: Object.fromEntries(TYPICAL.map((t) => [t.name, t.traits])),
  population_capacities: Object.fromEntries(population.map((p) => [p.name, Object.fromEntries(CAPACITIES.map((c) => [c, p.traits[c]]))])),
}, null, 2) + "\n");

console.log(`git ${prov.git_head.slice(0, 7)} (src tree ${prov.src_tree.slice(0, 7)}${prov.src_dirty ? ", src DIRTY" : ""}), reference ${CTC_REFERENCE.id}`);
console.log(`${gradedUrls.length} graded pages x ${scored.length} personas x ${SCOPES.length} scopes = ${rows.length} rows`);
for (const t of TYPICAL) console.log(`  ${t.name.padEnd(28)} reading ${t.traits.readingCapacity.toFixed(4)} motor ${t.traits.motorCapacity.toFixed(4)} attention ${t.traits.sustainedAttention.toFixed(4)}`);
