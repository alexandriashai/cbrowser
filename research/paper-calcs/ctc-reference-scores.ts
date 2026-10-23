/**
 * The model's own CTC for every built-in human persona on every graded page of
 * the shipped reference set, at both scopes: the input the power simulation
 * (power.py) draws realistic stimulus sets from.
 *
 * Personas are built as cognitive_effort builds them with no site model and
 * useValues off (its default): the persona's cognitive traits, siteFamiliarity 0,
 * capacities bridged by bridgeCapacityTraits. That is referencePopulation() in
 * src/visual/ctc-reference.ts, which the percentile curve itself is built from.
 * totalCTC is the shipped percentile (computeSequentialCTC, asymmetric and
 * interactions on).
 *
 * Usage (as wyld-web, worktree root): bun research/paper-calcs/ctc-reference-scores.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CTC_REFERENCE_DATA } from "../../src/data/ctc-reference-2026-10-22.js";
import { referencePopulation, CTC_REFERENCE } from "../../src/visual/ctc-reference.js";
import { computeDemandDistribution, computeSequentialCTC, type PageMetrics } from "../../src/visual/cognitive-transport-chain.js";
import { buildOTCognitiveProfile } from "../../src/visual/cognitive-transport.js";

const population = referencePopulation().map((p) => ({ name: p.name, profile: buildOTCognitiveProfile(p.name, p.traits) }));
const rows: string[] = [];
let pages = 0;
for (const page of CTC_REFERENCE_DATA.pages) {
  if (page.outcome !== "graded" || !page.metrics) continue;
  pages++;
  for (const scope of ["viewport", "full_page"] as const) {
    const demand = computeDemandDistribution(page.metrics[scope] as PageMetrics);
    for (const { name, profile } of population) {
      const r = computeSequentialCTC(profile, demand, { asymmetric: true, interactions: true });
      rows.push([page.url, page.industry.replace(/,/g, ";"), scope, name, r.rawCTC.toFixed(6), r.totalCTC.toFixed(6)].join(","));
    }
  }
}
writeFileSync(join(import.meta.dir, "ctc-reference-scores.csv"), "url,industry,scope,persona,raw_ctc,total_ctc\n" + rows.join("\n") + "\n");
console.log(`reference ${CTC_REFERENCE.id}: ${pages} graded pages x ${population.length} personas x 2 scopes = ${rows.length} rows`);
