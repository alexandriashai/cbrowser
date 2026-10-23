/**
 * Stage C: the cognitiveLoad layer's five traits for every built-in persona,
 * as the golden matrix builds them (siteFamiliarity 0, the tool path).
 *
 *   bun research/stage-c-traits.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
const { ROSTER, toolProfile } = await import("../tests/fixtures/ctc-golden-matrix.ts");
const T = ["comprehension", "workingMemory", "informationForaging", "siteFamiliarity", "transferLearning"];
const rows: string[] = ["| persona | " + T.join(" | ") + " |", "|---|" + T.map(() => "---").join("|") + "|"];
for (const [name, p] of Object.entries(ROSTER)) {
  const prof = toolProfile(name, p as never);
  rows.push(`| ${name} | ` + T.map((t) => String(prof.traits[t] ?? "missing")).join(" | ") + " |");
}
console.log(rows.join("\n"));
