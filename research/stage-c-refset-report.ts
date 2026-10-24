/**
 * Before/after tables from two stage-c-refset.ts outputs.
 *
 *   BEFORE=before.json AFTER=after.json bun research/stage-c-refset-report.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { readFileSync } from "node:fs";
const b = JSON.parse(readFileSync(process.env.BEFORE!, "utf8"));
const a = JSON.parse(readFileSync(process.env.AFTER!, "utf8"));
const f = (x: number) => x.toFixed(3);
const sg = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(3)}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
console.log(`Reference: before ${b.reference}, after ${a.reference}.\n`);
for (const scope of ["viewport", "full_page"]) {
  console.log(`### ${scope} (${a[scope].pages} pages): mean totalCTC, rawCTC and abandonmentRisk, before -> after\n`);
  console.log("| persona | totalCTC | rawCTC | abandonmentRisk |\n|---|---|---|---|");
  for (const n of Object.keys(a[scope].summary)) {
    const x = b[scope].summary[n], y = a[scope].summary[n];
    console.log(`| ${n} | ${f(x.totalCTC)} -> ${f(y.totalCTC)} | ${f(x.rawCTC)} -> ${f(y.rawCTC)} | ${f(x.abandonmentRisk)} -> ${f(y.abandonmentRisk)} |`);
  }
  console.log(`\n### ${scope}: face validity, before -> after\n`);
  console.log("first-timer minus X (mean totalCTC difference; share of pages where first-timer's rawCTC is the larger), and X minus the typical user:\n");
  console.log("| X | first-timer minus X | first-timer costlier on | X minus typical-user |\n|---|---|---|---|");
  for (const n of ["typical-user", "cognitive-adhd", "dyslexic-user", "low-vision-magnified", "motor-impairment-tremor", "elderly-user", "elderly-low-vision", "intellectual-disability", "aphasia-receptive", "power-user"]) {
    const x = b[scope].face[n], y = a[scope].face[n];
    console.log(`| ${n} | ${sg(x.firstTimerMinusX)} -> ${sg(y.firstTimerMinusX)} | ${pct(x.shareFirstTimerCostlier)} -> ${pct(y.shareFirstTimerCostlier)} | ${n === "typical-user" ? "" : `${sg(x.xMinusTypical)} -> ${sg(y.xMinusTypical)}`} |`);
  }
  const ft = (j: typeof a) => j[scope].face["first-timer"].xMinusTypical;
  console.log(`| first-timer | | | ${sg(ft(b))} -> ${sg(ft(a))} |`);
  console.log(`\n### ${scope}: mean layer cost after (before in brackets)\n`);
  const layers = Object.keys(a[scope].summary["first-timer"].layers);
  console.log(`| persona | ${layers.join(" | ")} |\n|---|${layers.map(() => "---").join("|")}|`);
  for (const n of ["typical-user", "first-timer", "cognitive-adhd", "dyslexic-user", "low-vision-magnified", "motor-impairment-tremor", "elderly-user", "power-user", "aphasia-receptive", "intellectual-disability"]) {
    console.log(`| ${n} | ${layers.map((l) => `${f(a[scope].summary[n].layers[l])} (${f(b[scope].summary[n].layers[l])})`).join(" | ")} |`);
  }
  console.log("");
}
