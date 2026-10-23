/**
 * Stage B deltas on the real reference pages (research/stage-b-deltas.md):
 * per persona and reference page, rawCTC, totalCTC and abandonmentRisk as the
 * tree TREE computes them. Run it on a worktree of the commit before and of
 * the commit after, and compare the two JSON files.
 *
 *   TREE=/path/to/worktree bun research/stage-b-refset-scores.ts > scores.json
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
const TREE = process.env.TREE!;
const { referenceRaw } = await import(`${TREE}/src/visual/ctc-reference.ts`);
const { deriveMetrics } = await import(`${TREE}/src/visual/cognitive-transport.ts`);
const { computeDemandDistribution, computeSequentialCTC } = await import(`${TREE}/src/visual/cognitive-transport-chain.ts`);
const { ROSTER, toolProfile } = await import(`${TREE}/tests/fixtures/ctc-golden-matrix.ts`);
const out: Record<string, Record<string, number[][]>> = {};
for (const scope of ["viewport", "full_page"] as const) {
  const demands = referenceRaw(scope).map((r: unknown) => computeDemandDistribution(deriveMetrics(r)));
  for (const name of Object.keys(ROSTER)) {
    const prof = toolProfile(name, ROSTER[name]);
    (out[name] ??= {})[scope] = demands.map((d: unknown) => {
      const r = computeSequentialCTC(prof, d, { asymmetric: true, interactions: true });
      return [r.rawCTC, r.totalCTC, r.abandonmentRisk];
    });
  }
}
console.log(JSON.stringify(out));
