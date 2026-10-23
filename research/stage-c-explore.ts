/**
 * Stage C exploration: what the cognitiveLoad layer reads and charges on the
 * 513 reference pages today (feat/cot-integration 8707e49, unchanged src).
 *
 *   bun research/stage-c-explore.ts
 *
 * Prints, per scope: the five demands' median [p10, p90], which page feature
 * wins each max() term, and per persona the mean per-trait deficit cost
 * (gap squared x the layer's content gate) in the cognitiveLoad layer.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
const { referenceRaw } = await import("../src/visual/ctc-reference.ts");
const { deriveMetrics } = await import("../src/visual/cognitive-transport.ts");
const { computeDemandDistribution, computeSequentialCTC } = await import("../src/visual/cognitive-transport-chain.ts");
const { param } = await import("../src/visual/model-provenance.ts");
const { ROSTER, toolProfile } = await import("../tests/fixtures/ctc-golden-matrix.ts");

const T = ["comprehension", "workingMemory", "informationForaging", "siteFamiliarity", "transferLearning"] as const;
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) * p; const lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
const f = (x: number) => x.toFixed(3);
const D = (id: string) => param(`chain.demand.${id}`);

for (const scope of ["viewport", "full_page"] as const) {
  const metrics = referenceRaw(scope).map((r: unknown) => deriveMetrics(r));
  const demands = metrics.map((m: any) => computeDemandDistribution(m));
  console.log(`\n## ${scope} (${metrics.length} pages)\n`);
  console.log("| demand | median [p10, p90] |\n|---|---|");
  for (const t of T) {
    const xs = demands.map((d: any) => d.demands[t]);
    console.log(`| ${t} | ${f(q(xs, 0.5))} [${f(q(xs, 0.1))}, ${f(q(xs, 0.9))}] |`);
  }
  // which term wins comprehension's max
  const terms: Record<string, (m: any) => number> = {
    informationDensity: (m) => m.informationDensity,
    textDensity: (m) => m.textDensity * D("text.comprehension"),
    avgWordLength: (m) => m.avgWordLength * D("wordLength.comprehension"),
    avgSentenceLength: (m) => m.avgSentenceLength * D("sentenceLength.comprehension"),
    lexicalDiversity: (m) => m.lexicalDiversity * D("lexicalDiversity.comprehension"),
    longWordRatio: (m) => m.longWordRatio * D("longWords.comprehension"),
    technicalDensity: (m) => m.technicalDensity * D("technical.comprehension"),
  };
  const wins: Record<string, number> = {};
  for (const m of metrics) {
    let best = "", bv = -1;
    for (const [k, fn] of Object.entries(terms)) { const v = fn(m); if (v > bv) { bv = v; best = k; } }
    wins[best] = (wins[best] ?? 0) + 1;
  }
  console.log("\ncomprehension max() winner:", JSON.stringify(wins));
  const wmTerms: Record<string, (m: any) => number> = {
    informationDensity: (m) => m.informationDensity * D("info.workingMemory"),
    avgSentenceLength: (m) => m.avgSentenceLength * D("sentenceLength.workingMemory"),
    navigationDepth: (m) => (m.navigationDepth / (m.navigationDepth + D("nav.halfSaturation"))) * D("nav.workingMemory"),
  };
  const wmw: Record<string, number> = {};
  for (const m of metrics) { let best = "", bv = -1; for (const [k, fn] of Object.entries(wmTerms)) { const v = fn(m); if (v > bv) { bv = v; best = k; } } wmw[best] = (wmw[best] ?? 0) + 1; }
  console.log("workingMemory max() winner:", JSON.stringify(wmw));
  const tlTerms: Record<string, (m: any) => number> = {
    lexicalDiversity: (m) => m.lexicalDiversity * D("lexicalDiversity.transferLearning"),
    technicalDensity: (m) => m.technicalDensity * D("technical.transferLearning"),
    navigationDepth: (m) => (m.navigationDepth / (m.navigationDepth + D("nav.halfSaturation"))) * D("nav.transferLearning"),
  };
  const tlw: Record<string, number> = {};
  for (const m of metrics) { let best = "", bv = -1; for (const [k, fn] of Object.entries(tlTerms)) { const v = fn(m); if (v > bv) { bv = v; best = k; } } tlw[best] = (tlw[best] ?? 0) + 1; }
  console.log("transferLearning max() winner:", JSON.stringify(tlw));
  const nd = metrics.map((m: any) => m.navigationDepth);
  console.log("navigationDepth (max(1, breadcrumbLinks)): share at 1 =", (nd.filter((x: number) => x === 1).length / nd.length).toFixed(3), " median", q(nd, 0.5), " p90", q(nd, 0.9));
  for (const k of ["informationDensity", "textDensity", "avgWordLength", "avgSentenceLength", "lexicalDiversity", "longWordRatio", "technicalDensity"]) {
    const xs = metrics.map((m: any) => m[k]);
    console.log(`  ${k}: ${f(q(xs, 0.5))} [${f(q(xs, 0.1))}, ${f(q(xs, 0.9))}]`);
  }

  console.log("\n| persona | cognitiveLoad cost | " + T.join(" | ") + " |\n|---|---|" + T.map(() => "---").join("|") + "|");
  for (const name of Object.keys(ROSTER)) {
    const prof = toolProfile(name, ROSTER[name]);
    const sums: Record<string, number> = {}; let layer = 0;
    for (const d of demands) {
      const r = computeSequentialCTC(prof, d, { asymmetric: true, interactions: true });
      const before = r.layers[0].residualCapacity; // after visualComplexity
      const cl = r.layers[1];
      layer += cl.transportCost / demands.length;
      const mean = T.reduce((s, t) => s + d.demands[t], 0) / T.length;
      const gate = Math.min(1, mean * param("chain.contentScaleGain"));
      for (const t of T) { const g = d.demands[t] - before[t]; sums[t] = (sums[t] ?? 0) + (g > 0 ? g * g * gate : 0) / demands.length; }
    }
    console.log(`| ${name} | ${f(layer)} | ` + T.map((t) => f(sums[t])).join(" | ") + " |");
  }
}
