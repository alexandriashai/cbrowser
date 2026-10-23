/**
 * Stage B deltas on the real reference pages (research/stage-b-deltas.md):
 * mean layer cost per persona over the viewport reference pages, as the tree
 * TREE computes them.
 *
 *   TREE=/path/to/worktree bun research/stage-b-refset-layers.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
const TREE = process.env.TREE!;
const { referenceRaw } = await import(`${TREE}/src/visual/ctc-reference.ts`);
const { deriveMetrics } = await import(`${TREE}/src/visual/cognitive-transport.ts`);
const { computeDemandDistribution, computeSequentialCTC } = await import(`${TREE}/src/visual/cognitive-transport-chain.ts`);
const { ROSTER, toolProfile } = await import(`${TREE}/tests/fixtures/ctc-golden-matrix.ts`);
const demands = referenceRaw("viewport").map((r: unknown) => computeDemandDistribution(deriveMetrics(r)));
const out: Record<string, Record<string, number>> = {};
for (const name of ["first-timer", "cognitive-adhd", "dyslexic-user", "low-vision-magnified", "motor-impairment-tremor", "power-user"]) {
  const prof = toolProfile(name, ROSTER[name]);
  const sums: Record<string, number> = {};
  for (const d of demands) {
    for (const l of computeSequentialCTC(prof, d, { asymmetric: true, interactions: true }).layers) sums[l.name] = (sums[l.name] ?? 0) + l.transportCost / demands.length;
  }
  out[name] = sums;
}
console.log(JSON.stringify(out));
