/**
 * Tables for research/surplus-billing-design.md from the measurement outputs
 * in OUT: <option>.predict.json (predict.ts), <option>.refset.json
 * (stage-c-refset.ts) and <option>.golden.txt (stage-c-golden-repin.ts against
 * 0686210's pin), one set per option, O0 being 0686210 unchanged, and
 * <option>.random.json (random-personas.ts) where it was run.
 *
 *   OUT=/path/to/outputs bun research/surplus-billing/report.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.env.OUT;
if (!OUT) throw new Error("OUT is the directory holding the per-option outputs");
const OPTIONS = ["O0", "a-motion", "a-class", "b-class", "c-motion", "c-class", "d", "e", "f"];
const SCOPES = ["viewport", "full_page"] as const;
const IMPAIRED = ["cognitive-adhd", "dyslexic-user", "low-vision-magnified", "motor-impairment-tremor", "elderly-user", "elderly-low-vision", "intellectual-disability", "aphasia-receptive"];
const FOUR = ["typical-user", "first-timer", "cognitive-adhd", "elderly-user"];
const OWN_STIMULUS: Record<string, string> = {
  emotionalContagion: "motion", changeBlindness: "motion", patience: "reading",
  satisficing: "choice", anchoringBias: "choice", riskTolerance: "choice", fearOfMissingOut: "choice", socialProofSensitivity: "choice",
};
const json = (f: string) => JSON.parse(readFileSync(join(OUT, f), "utf8"));
const sg = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(3)}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

// 1. The surplus-billed traits some layer reads, on 0686210.
const base = json("O0.predict.json");
console.log(`## Surplus-billed traits on 0686210 (${base.reference}, ${base.pages} pages, ${base.personas} personas)\n`);
console.log("| trait | own stimulus | demand 0 on a static page (viewport / full_page) | own stimulus lowers its cost (viewport / full_page) | motion lowers its cost (viewport / full_page) |");
console.log("|---|---|---|---|---|");
for (const [t, s] of Object.entries(OWN_STIMULUS)) {
  const cell = (stim: string, k: string) => SCOPES.map((sc) => pct(base[sc][stim].traits[t][k])).join(" / ");
  console.log(`| ${t} | ${s} | ${cell("motion", "demandZeroBeforeShare")} | ${cell(s, "loweredShare")} | ${cell("motion", "loweredShare")} |`);
}

// 2. Each option: carousel check, the property, face validity, golden delta.
console.log("\n## Options\n");
for (const sc of SCOPES) {
  console.log(`### ${sc}: one carousel on each static page, mean totalCTC change (share of pages cheaper)\n`);
  console.log(`| option | ${FOUR.join(" | ")} | pairs where motion lowers frustration (through) | pairs where it lowers totalCTC |`);
  console.log(`|---|${FOUR.map(() => "---").join("|")}|---|---|`);
  for (const o of OPTIONS) {
    const m = json(`${o}.predict.json`)[sc].motion;
    const through = Object.entries(m.property.loweredThrough as Record<string, number>).map(([k, v]) => `${k} ${v}`).join(", ");
    console.log(`| ${o} | ${FOUR.map((n) => `${sg(m.carouselCheck[n].meanTotal)} (${pct(m.carouselCheck[n].cheaperShare)})`).join(" | ")} | ${m.property.frustrationLowered} of ${m.property.pairs}${through ? ` (${through})` : ""} | ${m.property.totalCTCLowered} |`);
  }
  console.log();
}
console.log("### Face validity on the reference (mean totalCTC, X minus the typical user) and golden delta against 0686210's pin\n");
console.log("| option | smallest impaired minus typical (viewport / full_page) | which | power-user minus typical | first-timer minus typical | typical-user mean totalCTC | golden numbers moved | golden Spearman |");
console.log("|---|---|---|---|---|---|---|---|");
for (const o of OPTIONS) {
  const r = json(`${o}.refset.json`);
  const mins = SCOPES.map((sc) => IMPAIRED.map((p) => [p, r[sc].face[p].xMinusTypical] as [string, number]).reduce((a, b) => (b[1] < a[1] ? b : a)));
  const g = readFileSync(join(OUT, `${o}.golden.txt`), "utf8");
  const moved = g.match(/^(\d+) of (\d+) pinned numbers/m), rho = g.match(/Spearman of totalCTC over all \d+ runs: (\d\.\d+)/);
  const both = (k: string) => SCOPES.map((sc) => sg(r[sc].face[k].xMinusTypical)).join(" / ");
  console.log(`| ${o} | ${mins.map((m) => sg(m[1])).join(" / ")} | ${mins.map((m) => m[0]).join(" / ")} | ${both("power-user")} | ${both("first-timer")} | ${SCOPES.map((sc) => r[sc].summary["typical-user"].totalCTC.toFixed(3)).join(" / ")} | ${moved ? `${moved[1]} of ${moved[2]}` : "?"} | ${rho ? rho[1] : "?"} |`);
}

console.log("\n### The motion property over 400 seeded random personas (every static page)\n");
console.log("| option | scope | pairs | motion lowers frustration | motion lowers totalCTC | emotionalContagion of the violators | patience of the violators |");
console.log("|---|---|---|---|---|---|---|");
for (const o of OPTIONS) {
  let r: Record<string, { pairs: number; frustrationLowered: number; totalCTCLowered: number; violators: Record<string, { min: number; max: number } | null> }>;
  try { r = json(`${o}.random.json`); } catch { continue; }
  for (const sc of SCOPES) {
    const v = r[sc].violators, rg = (x: { min: number; max: number } | null) => (x ? `${x.min.toFixed(3)} to ${x.max.toFixed(3)}` : "none");
    console.log(`| ${o} | ${sc} | ${r[sc].pairs} | ${r[sc].frustrationLowered} | ${r[sc].totalCTCLowered} | ${rg(v.emotionalContagion)} | ${rg(v.patience)} |`);
  }
}
