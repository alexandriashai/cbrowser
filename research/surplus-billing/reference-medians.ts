/**
 * The reference medians on the tree TREE: per scope, the pooled raw cost at
 * the reference curve's 25th, 50th, 80th and 95th percentiles (25 built-in
 * personas x 514 pages, tool-default options), and per persona the median
 * totalCTC and rawCTC over the 514 pages. Writes JSON to stdout; report.ts
 * reads two of them (before, after) with MEDIANS_BEFORE / MEDIANS_AFTER.
 *
 *   TREE=/path/to/tree bun research/surplus-billing/reference-medians.ts > out.json
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
const TREE = process.env.TREE ?? `${import.meta.dir}/../..`;
const { referenceRaw, referencePopulation, CTC_REFERENCE, percentileAt } = await import(`${TREE}/src/visual/ctc-reference.ts`);
const { computeDemandDistribution, computeSequentialCTC, ctcReferenceCurve } = await import(`${TREE}/src/visual/cognitive-transport-chain.ts`);
const { buildOTCognitiveProfile, deriveMetrics } = await import(`${TREE}/src/visual/cognitive-transport.ts`);

const OPTS = { asymmetric: true, interactions: true };
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
/** The raw cost at percentile q on the interpolated curve (inverse of percentileAt). */
function rawAt(curve: { xs: Float64Array; ps: Float64Array }, q: number): number {
  for (let i = 1; i < curve.ps.length; i++) {
    if (curve.ps[i] >= q) { const t = (q - curve.ps[i - 1]) / (curve.ps[i] - curve.ps[i - 1]); return curve.xs[i - 1] + t * (curve.xs[i] - curve.xs[i - 1]); }
  }
  return curve.xs[curve.xs.length - 1];
}

const personas = referencePopulation().map((p: { name: string; traits: Record<string, number> }) => ({ name: p.name, profile: buildOTCognitiveProfile(p.name, p.traits) }));
const out: Record<string, unknown> = { tree: TREE, reference: CTC_REFERENCE.id };
for (const scope of ["viewport", "full_page"] as const) {
  const ref = ctcReferenceCurve(scope, OPTS);
  const curve = ref.curve;
  const quantiles = Object.fromEntries([0.25, 0.5, 0.8, 0.95].map((q) => [`p${Math.round(q * 100)}`, rawAt(curve, q)]));
  const demands = (referenceRaw(scope) as unknown[]).map((raw) => computeDemandDistribution(deriveMetrics(raw)));
  const perPersona: Record<string, { medianTotalCTC: number; medianRawCTC: number }> = {};
  for (const p of personas) {
    const rs = demands.map((d: unknown) => computeSequentialCTC(p.profile, d, OPTS));
    perPersona[p.name] = { medianTotalCTC: median(rs.map((r: { totalCTC: number }) => r.totalCTC)), medianRawCTC: median(rs.map((r: { rawCTC: number }) => r.rawCTC)) };
  }
  // A check that the inverse is right: the raw median ranks at 0.5 on the same curve.
  out[scope] = { pages: ref.pages, personas: ref.personas, rawAtPercentile: quantiles, checkP50: percentileAt(curve, quantiles.p50), perPersona };
}
console.log(JSON.stringify(out, null, 1));
