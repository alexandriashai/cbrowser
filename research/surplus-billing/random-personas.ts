/**
 * The motion property over personas nobody wrote: for N seeded random trait
 * vectors (every trait uniform in [0, 1]) on every static reference page, does
 * one carousel ever lower the frustration layer's cost, or totalCTC? Run on the
 * tree TREE. Reports the counts, and the range of emotionalContagion and
 * patience over the personas in violation (the two traits frustration reads).
 *
 *   TREE=/path/to/tree N=400 bun research/surplus-billing/random-personas.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
const TREE = process.env.TREE ?? `${import.meta.dir}/../..`;
const N = Number(process.env.N ?? 400);
const { referenceRaw } = await import(`${TREE}/src/visual/ctc-reference.ts`);
const { computeDemandDistribution, computeSequentialCTC } = await import(`${TREE}/src/visual/cognitive-transport-chain.ts`);
const { buildOTCognitiveProfile, COGNITIVE_TRAITS, deriveMetrics } = await import(`${TREE}/src/visual/cognitive-transport.ts`);

// mulberry32, seeded, so a run can be repeated exactly.
let seed = 0x5eed2024;
const rand = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const personas = Array.from({ length: N }, (_, k) => {
  const traits: Record<string, number> = {};
  for (const t of COGNITIVE_TRAITS as string[]) traits[t] = rand();
  traits.siteFamiliarity = 0;
  return { traits, profile: buildOTCognitiveProfile(`random-${k}`, traits) };
});
const OPTS = { asymmetric: true, interactions: true };
const EPS = 1e-12;
const frustration = (r: { layers: Array<{ name: string; transportCost: number }> }) => r.layers.find((l) => l.name === "frustration")?.transportCost ?? 0;

const out: Record<string, unknown> = { tree: TREE, personas: N };
for (const scope of ["viewport", "full_page"] as const) {
  const raws = referenceRaw(scope) as Array<Record<string, unknown> & { runningAnimations: number; autoplayElements: number; carousel: boolean }>;
  const idx = raws.map((r, i) => (r.runningAnimations + r.autoplayElements === 0 && !r.carousel ? i : -1)).filter((i) => i >= 0);
  let pairs = 0, fLow = 0, tLow = 0;
  const ec: number[] = [], pat: number[] = [];
  for (const i of idx) {
    const d0 = computeDemandDistribution(deriveMetrics(raws[i]));
    const d1 = computeDemandDistribution(deriveMetrics({ ...raws[i], carousel: true }));
    for (const p of personas) {
      const r0 = computeSequentialCTC(p.profile, d0, OPTS), r1 = computeSequentialCTC(p.profile, d1, OPTS);
      pairs++;
      if (frustration(r0) - frustration(r1) > EPS) {
        fLow++;
        ec.push(p.traits.emotionalContagion); pat.push(p.traits.patience);
      }
      if (r1.totalCTC < r0.totalCTC - EPS) tLow++;
    }
  }
  const range = (v: number[]) => (v.length ? { min: v.reduce((a, b) => Math.min(a, b)), max: v.reduce((a, b) => Math.max(a, b)) } : null);
  out[scope] = { staticPages: idx.length, pairs, frustrationLowered: fLow, totalCTCLowered: tLow, violators: { emotionalContagion: range(ec), patience: range(pat) } };
}
console.log(JSON.stringify(out, null, 1));
