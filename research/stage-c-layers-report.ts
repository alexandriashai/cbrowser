/**
 * Stage C: mean layer costs per persona under each variant
 * (research/stage-c-predict/<VARIANT>.json), to show where the remaining
 * first-timer surplus sits once cognitiveLoad changes.
 *
 *   VARIANTS=V1,V2 bun research/stage-c-layers-report.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
const VARIANTS = (process.env.VARIANTS ?? "V0,V2").split(",");
const P = ["typical-user", "first-timer", "cognitive-adhd", "dyslexic-user", "low-vision-magnified", "motor-impairment-tremor", "elderly-user", "power-user"];
for (const v of VARIANTS) {
  const d = JSON.parse(readFileSync(join(import.meta.dir, "stage-c-predict", `${v}.json`), "utf8"));
  for (const scope of ["viewport", "full_page"]) {
    const layers = Object.keys(d[scope].layer["first-timer"]);
    console.log(`\n#### ${v}, ${scope}: mean layer cost\n\n| persona | ${layers.join(" | ")} |\n|---|${layers.map(() => "---").join("|")}|`);
    for (const p of P) console.log(`| ${p} | ${layers.map((l) => d[scope].layer[p][l].toFixed(3)).join(" | ")} |`);
  }
}
