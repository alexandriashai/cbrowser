/**
 * Stage C prediction tables from research/stage-c-predict/<VARIANT>.json
 * (written by stage-c-predict.ts): mean rawCTC and totalCTC per persona,
 * mean cognitiveLoad cost, and face validity of first-timer against the
 * typical user and the impaired personas.
 *
 *   bun research/stage-c-predict-report.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
const VARIANTS = ["V0", "V1", "V2", "V3", "V4"];
const data = Object.fromEntries(VARIANTS.map((v) => [v, JSON.parse(readFileSync(join(import.meta.dir, "stage-c-predict", `${v}.json`), "utf8"))]));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const f = (x: number) => x.toFixed(3);
const FACE = ["typical-user", "cognitive-adhd", "dyslexic-user", "low-vision-magnified", "elderly-low-vision", "elderly-user", "motor-impairment-tremor", "intellectual-disability", "power-user"];
for (const scope of ["viewport", "full_page"]) {
  console.log(`\n### ${scope}: mean totalCTC (variant's own percentile scale)\n`);
  console.log("| persona | " + VARIANTS.join(" | ") + " |\n|---|" + VARIANTS.map(() => "---").join("|") + "|");
  const personas = Object.keys(data.V0[scope].total);
  for (const p of personas) console.log(`| ${p} | ` + VARIANTS.map((v) => f(mean(data[v][scope].total[p]))).join(" | ") + " |");
  console.log(`\n### ${scope}: mean rawCTC\n`);
  console.log("| persona | " + VARIANTS.join(" | ") + " |\n|---|" + VARIANTS.map(() => "---").join("|") + "|");
  for (const p of personas) console.log(`| ${p} | ` + VARIANTS.map((v) => f(mean(data[v][scope].raw[p]))).join(" | ") + " |");
  console.log(`\n### ${scope}: mean cognitiveLoad layer cost\n`);
  console.log("| persona | " + VARIANTS.join(" | ") + " |\n|---|" + VARIANTS.map(() => "---").join("|") + "|");
  for (const p of ["first-timer", ...FACE]) console.log(`| ${p} | ` + VARIANTS.map((v) => f(data[v][scope].layer[p].cognitiveLoad ?? 0)).join(" | ") + " |");
  console.log(`\n### ${scope}: first-timer minus X, mean totalCTC difference (share of pages where first-timer is costlier, on rawCTC)\n`);
  console.log("| X | " + VARIANTS.join(" | ") + " |\n|---|" + VARIANTS.map(() => "---").join("|") + "|");
  for (const x of FACE) {
    console.log(`| ${x} | ` + VARIANTS.map((v) => {
      const a = data[v][scope].total["first-timer"], b = data[v][scope].total[x];
      const ra = data[v][scope].raw["first-timer"], rb = data[v][scope].raw[x];
      const diff = mean(a.map((y: number, i: number) => y - b[i]));
      const share = ra.filter((y: number, i: number) => y > rb[i]).length / ra.length;
      return `${diff >= 0 ? "+" : ""}${f(diff)} (${(share * 100).toFixed(0)}%)`;
    }).join(" | ") + " |");
  }
  console.log(`\n### ${scope}: X minus typical-user, mean totalCTC difference\n`);
  console.log("| X | " + VARIANTS.join(" | ") + " |\n|---|" + VARIANTS.map(() => "---").join("|") + "|");
  for (const x of ["first-timer", ...FACE.slice(1)]) {
    console.log(`| ${x} | ` + VARIANTS.map((v) => {
      const a = data[v][scope].total[x], b = data[v][scope].total["typical-user"];
      const diff = mean(a.map((y: number, i: number) => y - b[i]));
      return `${diff >= 0 ? "+" : ""}${f(diff)}`;
    }).join(" | ") + " |");
  }
}
