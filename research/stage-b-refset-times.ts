/**
 * Stage B on the real reference pages (research/stage-b-deltas.md): the four
 * law times and the demands they make, median [p10, p90] per scope, and how
 * many pages counted their ungrouped links from the stored nav sizes (records
 * measured before groupedLinks existed).
 *
 *   bun research/stage-b-refset-times.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { referenceRaw } from "../src/visual/ctc-reference.js";
import { deriveMetrics } from "../src/visual/cognitive-transport.js";
import { timeDemand } from "../src/visual/demand-laws.js";

const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
};
for (const scope of ["viewport", "full_page"] as const) {
  const ms = referenceRaw(scope).map((r) => deriveMetrics(r));
  const cells = (["pointingSeconds", "choosingSeconds", "readingSeconds", "procedureSeconds"] as const).map((k) => {
    const xs = ms.map((m) => m[k]);
    const [p10, p50, p90] = [q(xs, 0.1), q(xs, 0.5), q(xs, 0.9)];
    return `${p50.toFixed(1)} [${p10.toFixed(1)}, ${p90.toFixed(1)}]; d ${timeDemand(p50).toFixed(2)} [${timeDemand(p10).toFixed(2)}, ${timeDemand(p90).toFixed(2)}]`;
  });
  const fallback = ms.filter((m) => m.lawDiagnostics.ungroupedLinksFrom === "navGroupSizes").length;
  console.log(`| ${scope} | ${cells.join(" | ")} | ${fallback} of ${ms.length} |`);
}
