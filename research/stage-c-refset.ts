/**
 * Stage C on the real reference pages, as the tree TREE computes them (default:
 * this tree): mean totalCTC, rawCTC and abandonmentRisk per persona on the
 * shipped percentile curve, mean layer costs, and face validity of first-timer
 * and of each impaired persona against the typical user (paper-calcs round 2's
 * definition, built on TREE). Writes JSON to stdout.
 *
 *   TREE=/path/to/worktree bun research/stage-c-refset.ts > out.json
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
const TREE = process.env.TREE ?? `${import.meta.dir}/..`;
const { referenceRaw, CTC_REFERENCE } = await import(`${TREE}/src/visual/ctc-reference.ts`);
const { deriveMetrics, COGNITIVE_TRAITS, buildOTCognitiveProfile } = await import(`${TREE}/src/visual/cognitive-transport.ts`);
const { computeDemandDistribution, computeSequentialCTC } = await import(`${TREE}/src/visual/cognitive-transport-chain.ts`);
const { readingCapacityOf, getReadingProfile, motorCapacityOf, getPointingProfile, sustainedAttentionOf } = await import(`${TREE}/src/visual/cognitive-models.ts`);
const { ROSTER, toolProfile } = await import(`${TREE}/tests/fixtures/ctc-golden-matrix.ts`);

const CAP = ["readingCapacity", "motorCapacity", "sustainedAttention"];
const typicalTraits: Record<string, number> = {};
for (const t of COGNITIVE_TRAITS) if (t !== "siteFamiliarity" && !CAP.includes(t)) typicalTraits[t] = 0.5;
typicalTraits.siteFamiliarity = 0;
typicalTraits.readingCapacity = readingCapacityOf(getReadingProfile({}));
typicalTraits.motorCapacity = motorCapacityOf(getPointingProfile({}));
typicalTraits.sustainedAttention = sustainedAttentionOf({});
const profiles: Record<string, unknown> = { "typical-user": buildOTCognitiveProfile("typical-user", typicalTraits) };
for (const n of Object.keys(ROSTER)) profiles[n] = toolProfile(n, ROSTER[n]);

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const out: Record<string, unknown> = { reference: CTC_REFERENCE.id, tree: TREE };
for (const scope of ["viewport", "full_page"] as const) {
  const demands = referenceRaw(scope).map((r: unknown) => computeDemandDistribution(deriveMetrics(r)));
  const per: Record<string, { total: number[]; raw: number[]; risk: number[]; layers: Record<string, number> }> = {};
  for (const [n, prof] of Object.entries(profiles)) {
    const row = { total: [] as number[], raw: [] as number[], risk: [] as number[], layers: {} as Record<string, number> };
    for (const d of demands) {
      const r = computeSequentialCTC(prof as never, d, { asymmetric: true, interactions: true });
      row.total.push(r.totalCTC); row.raw.push(r.rawCTC); row.risk.push(r.abandonmentRisk);
      for (const l of r.layers) row.layers[l.name] = (row.layers[l.name] ?? 0) + l.transportCost / demands.length;
    }
    per[n] = row;
  }
  const summary: Record<string, unknown> = {};
  for (const [n, r] of Object.entries(per)) summary[n] = { totalCTC: mean(r.total), rawCTC: mean(r.raw), abandonmentRisk: mean(r.risk), layers: r.layers };
  const face: Record<string, unknown> = {};
  for (const x of Object.keys(per)) {
    if (x === "first-timer") continue;
    const ft = per["first-timer"], o = per[x];
    face[x] = {
      firstTimerMinusX: mean(ft.total.map((v, i) => v - o.total[i])),
      shareFirstTimerCostlier: ft.raw.filter((v, i) => v > o.raw[i]).length / ft.raw.length,
      xMinusTypical: mean(o.total.map((v, i) => v - per["typical-user"].total[i])),
    };
  }
  face["first-timer"] = { xMinusTypical: mean(per["first-timer"].total.map((v, i) => v - per["typical-user"].total[i])) };
  out[scope] = { pages: demands.length, summary, face };
}
console.log(JSON.stringify(out));
