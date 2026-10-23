/**
 * Stage C: how much the cognitiveLoad layer varies across real pages, per
 * persona, against the other layers (feat/cot-integration 8707e49 src).
 *
 *   bun research/stage-c-spread.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
const { referenceRaw } = await import("../src/visual/ctc-reference.ts");
const { deriveMetrics } = await import("../src/visual/cognitive-transport.ts");
const { computeDemandDistribution, computeSequentialCTC } = await import("../src/visual/cognitive-transport-chain.ts");
const { ROSTER, toolProfile } = await import("../tests/fixtures/ctc-golden-matrix.ts");
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) * p; const lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
const sd = (xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };
const f = (x: number) => x.toFixed(3);
for (const scope of ["viewport", "full_page"] as const) {
  const demands = referenceRaw(scope).map((r: unknown) => computeDemandDistribution(deriveMetrics(r)));
  console.log(`\n## ${scope}\n\n| persona | cognitiveLoad median [p10, p90] | sd across pages | rawCTC sd | rawCTC sd without cognitiveLoad |\n|---|---|---|---|---|`);
  for (const name of ["first-timer", "power-user", "cognitive-adhd", "dyslexic-user", "low-vision-magnified", "elderly-user", "intellectual-disability", "motor-impairment-tremor"]) {
    const prof = toolProfile(name, ROSTER[name]);
    const cl: number[] = [], raw: number[] = [], rest: number[] = [];
    for (const d of demands) {
      const r = computeSequentialCTC(prof, d, { asymmetric: true, interactions: true });
      const c = r.layers[1].transportCost;
      cl.push(c); raw.push(r.rawCTC); rest.push(r.rawCTC - c);
    }
    console.log(`| ${name} | ${f(q(cl, 0.5))} [${f(q(cl, 0.1))}, ${f(q(cl, 0.9))}] | ${f(sd(cl))} | ${f(sd(raw))} | ${f(sd(rest))} |`);
  }
}
