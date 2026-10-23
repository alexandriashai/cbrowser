/**
 * Stage C: what Cockburn, Gutwin & Greenberg's (2007) Eq. 4 would do with site
 * familiarity on the reference pages. choosingSeconds at expertise e is
 * (1 - e) x novice search + e x Hick-Hyman, both already computed by
 * lawSecondsOf (choosingSeconds, lawDiagnostics.choosingSecondsExpert).
 *
 *   bun research/stage-c-familiarity.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
const { referenceRaw } = await import("../src/visual/ctc-reference.ts");
const { deriveMetrics } = await import("../src/visual/cognitive-transport.ts");
const { timeDemand } = await import("../src/visual/demand-laws.ts");
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) * p; const lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
const f = (x: number) => x.toFixed(2);
console.log("| scope | e | choosing s, median [p10, p90] | demand d, median [p10, p90] |\n|---|---|---|---|");
for (const scope of ["viewport", "full_page"] as const) {
  const m = referenceRaw(scope).map((r: unknown) => deriveMetrics(r));
  for (const e of [0, 0.5, 0.9, 1]) {
    const t = m.map((x: any) => (1 - e) * x.choosingSeconds + e * x.lawDiagnostics.choosingSecondsExpert);
    const d = t.map(timeDemand);
    console.log(`| ${scope} | ${e} | ${f(q(t, 0.5))} [${f(q(t, 0.1))}, ${f(q(t, 0.9))}] | ${f(q(d, 0.5))} [${f(q(d, 0.1))}, ${f(q(d, 0.9))}] |`);
  }
}
// Eq. 5, e = L (1 - 1/t), at L = 1
console.log("\nEq. 5 at L = 1: " + [1, 2, 3, 5, 10, 20].map((t) => `t=${t} -> e=${(1 - 1 / t).toFixed(2)}`).join(", "));
