/**
 * Stage C: how much of what the cognitiveLoad text terms read is already in
 * Stage B's reading time, on the 513 reference pages. Spearman rank
 * correlation of each text metric with readingSeconds, and with the mean
 * word length in letters that sets Brysbaert's rate; the share of pages
 * where lexicalDiversity is exactly 1.
 *
 *   bun research/stage-c-overlap.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
const { referenceRaw } = await import("../src/visual/ctc-reference.ts");
const { deriveMetrics } = await import("../src/visual/cognitive-transport.ts");
const rank = (xs: number[]) => { const idx = xs.map((x, i) => [x, i] as [number, number]).sort((a, b) => a[0] - b[0]); const r = new Array(xs.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; } return r; };
const pearson = (a: number[], b: number[]) => { const n = a.length; const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n; let num = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return num / Math.sqrt(da * db); };
const rho = (a: number[], b: number[]) => pearson(rank(a), rank(b));
for (const scope of ["viewport", "full_page"] as const) {
  const raws = referenceRaw(scope);
  const alpha = raws.map((r: any, i: number) => ({ r, m: deriveMetrics(r) })).filter((x: any) => x.r.text.script === "alphabetic");
  const read = alpha.map((x: any) => x.m.readingSeconds);
  const letters = alpha.map((x: any) => { let l = 0, w = 0; for (const [len, c] of x.r.text.wordLengths) { l += len * c; w += c; } return w > 0 ? l / w : 0; });
  console.log(`\n${scope}: ${alpha.length} alphabetic pages of ${raws.length}`);
  for (const k of ["informationDensity", "textDensity", "avgWordLength", "avgSentenceLength", "lexicalDiversity", "longWordRatio", "technicalDensity"]) {
    const xs = alpha.map((x: any) => x.m[k]);
    console.log(`  ${k}: rho with readingSeconds ${rho(xs, read).toFixed(3)}; rho with mean letters per word ${rho(xs, letters).toFixed(3)}`);
  }
  const all = raws.map((r: any) => deriveMetrics(r));
  console.log(`  lexicalDiversity == 1 on ${all.filter((m: any) => m.lexicalDiversity === 1).length} of ${all.length} pages`);
  console.log(`  navigationDepth == 1 on ${all.filter((m: any) => m.navigationDepth === 1).length} of ${all.length} pages`);
}
