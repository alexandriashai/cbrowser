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
 * The shipped reference is v2 (raw measurements, three frames, six page
 * types); each page's metrics are derived from its raw measurement as the
 * curve derives them (referencePages). The committed ctc-reference-scores.csv
 * was written from v1 (111 brand landing pages) and is replaced by re-running
 * this. power.py reads the url, scope, persona and total_ctc columns.
 *
 * Usage (as wyld-web, worktree root): bun research/paper-calcs/ctc-reference-scores.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { referenceGraded, referencePages, referencePopulation, CTC_REFERENCE } from "../../src/visual/ctc-reference.js";
import { computeDemandDistribution, computeSequentialCTC } from "../../src/visual/cognitive-transport-chain.js";
import { buildOTCognitiveProfile } from "../../src/visual/cognitive-transport.js";

const population = referencePopulation().map((p) => ({ name: p.name, profile: buildOTCognitiveProfile(p.name, p.traits) }));
const graded = referenceGraded();
const rows: string[] = [];
const csv = (s: string) => s.replace(/,/g, ";");
for (const scope of ["viewport", "full_page"] as const) {
  // referencePages returns the graded pages in referenceGraded's order.
  referencePages(scope).forEach((metrics, i) => {
    const page = graded[i];
    const demand = computeDemandDistribution(metrics);
    for (const { name, profile } of population) {
      const r = computeSequentialCTC(profile, demand, { asymmetric: true, interactions: true });
      rows.push([page.url, page.frame, page.pageType, csv(page.sector), scope, name, r.rawCTC.toFixed(6), r.totalCTC.toFixed(6)].join(","));
    }
  });
}
writeFileSync(join(import.meta.dir, "ctc-reference-scores.csv"), "url,frame,page_type,sector,scope,persona,raw_ctc,total_ctc\n" + rows.join("\n") + "\n");
console.log(`reference ${CTC_REFERENCE.id}: ${graded.length} graded pages x ${population.length} personas x 2 scopes = ${rows.length} rows`);
