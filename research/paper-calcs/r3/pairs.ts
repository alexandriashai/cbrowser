/**
 * Candidate variant pairs for the Study 3 redesign D3: every one-factor variant
 * (raw-perturb.ts) of every graded reference page at viewport scope, scored by the
 * shipped chain for the typical user and the four Study 3 personas, original and
 * variant.
 *
 * Personas are built exactly as round 2 scored them: the typical user's traits are
 * read from ../r2/typical-user.json (primary definition) and the matched personas
 * come from referencePopulation(). The originals are checked against
 * ../r2/ctc-scores.csv (same tree, same path), so the variant scores differ from
 * the round-2 scores only by the perturbation.
 *
 * Output: candidates-viewport.csv (one row per page x variant: totalCTC and rawCTC
 * for each scored persona, original and variant, and the metrics the variant
 * changed) and candidates-viewport.json (provenance and counts).
 *
 * Usage (as the tree's owner, worktree root): bun research/paper-calcs/r3/pairs.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { referencePopulation, referenceOutcomes, referencePages, CTC_REFERENCE } from "../../../src/visual/ctc-reference.js";
import { computeDemandDistribution, computeSequentialCTC } from "../../../src/visual/cognitive-transport-chain.js";
import { buildOTCognitiveProfile } from "../../../src/visual/cognitive-transport.js";
import { provenance } from "../r2/provenance.ts";
import { rawFromMetrics, metricsFromRaw, variants, selfTest } from "./raw-perturb.ts";

const HERE = import.meta.dir;
const SCOPE = "viewport" as const;
const SUBGROUPS = ["cognitive-adhd", "dyslexic-user", "low-vision-magnified", "elderly-user"];

const tu = JSON.parse(readFileSync(join(HERE, "..", "r2", "typical-user.json"), "utf8"));
const byName = new Map(referencePopulation().map((p) => [p.name, p.traits]));
const scored: Array<{ name: string; traits: Record<string, number> }> = [
  { name: "typical-user", traits: tu.traits["typical-user"] },
  ...SUBGROUPS.map((n) => ({ name: n, traits: byName.get(n)! })),
];
const profiles = scored.map((s) => ({ name: s.name, profile: buildOTCognitiveProfile(s.name, s.traits) }));
const score = (m: Parameters<typeof computeDemandDistribution>[0]) => {
  const demand = computeDemandDistribution(m);
  return profiles.map(({ profile }) => {
    const r = computeSequentialCTC(profile, demand, { asymmetric: true, interactions: true });
    if (r.referenceScope !== SCOPE) throw new Error(`ranked against ${r.referenceScope}`);
    return { raw: r.rawCTC, total: r.totalCTC };
  });
};

// Round-2 scores for the originals, to prove the scoring path is the same.
const r2 = new Map<string, number>();
for (const line of readFileSync(join(HERE, "..", "r2", "ctc-scores.csv"), "utf8").trim().split("\n").slice(1)) {
  const [url, scope, persona, , total] = line.split(",");
  if (scope === SCOPE) r2.set(`${url}|${persona}`, Number(total));
}

const st = selfTest();
const urls = referenceOutcomes().filter((o) => o.outcome === "graded").map((o) => o.url);
const pages = referencePages(SCOPE);
const metricKeys = ["informationDensity", "visualComplexity", "interactiveElementCount", "textDensity", "animationLevel", "choiceCount",
  "navigationDepth", "avgWordLength", "avgSentenceLength", "lexicalDiversity", "longWordRatio", "technicalDensity"] as const;
const rows: string[] = [];
let worstOrig = 0, n = 0;
pages.forEach((m, i) => {
  const orig = score(m);
  orig.forEach((o, j) => {
    const ref = r2.get(`${urls[i]}|${scored[j].name}`);
    if (ref === undefined) throw new Error(`no round-2 score for ${urls[i]} ${scored[j].name}`);
    worstOrig = Math.max(worstOrig, Math.abs(Number(o.total.toFixed(6)) - ref));
  });
  for (const v of variants(rawFromMetrics(m))) {
    const vm = metricsFromRaw(v.raw);
    const changed = metricKeys.filter((k) => Math.abs(((vm as Record<string, number>)[k] ?? 0) - ((m as Record<string, number>)[k] ?? 0)) > 1e-12);
    const vs = score(vm);
    n++;
    rows.push([urls[i], v.factor, `"${v.label}"`, changed.join(";"),
      ...scored.flatMap((s, j) => [orig[j].total.toFixed(6), vs[j].total.toFixed(6), orig[j].raw.toFixed(6), vs[j].raw.toFixed(6)])].join(","));
  }
});
if (worstOrig > 1e-6) throw new Error(`originals differ from round 2 by ${worstOrig}`);

const header = ["url", "factor", "label", "metrics_changed",
  ...scored.flatMap((s) => [`${s.name}_total_orig`, `${s.name}_total_var`, `${s.name}_raw_orig`, `${s.name}_raw_var`])];
writeFileSync(join(HERE, "candidates-viewport.csv"), header.join(",") + "\n" + rows.join("\n") + "\n");
const prov = provenance();
writeFileSync(join(HERE, "candidates-viewport.json"), JSON.stringify({
  provenance: prov, reference: CTC_REFERENCE.id, scope: SCOPE, pages: pages.length, candidates: n, personas: scored.map((s) => s.name),
  raw_perturb_selftest: st, originals_vs_round2_max_abs_total: worstOrig,
}, null, 2) + "\n");
console.log(`git ${prov.git_head.slice(0, 7)} src ${prov.src_tree.slice(0, 7)}; ${pages.length} pages, ${n} variants; originals equal round 2 (max |diff| ${worstOrig.toExponential(1)}); raw-perturb self-test ${st.checks} checks pass`);
