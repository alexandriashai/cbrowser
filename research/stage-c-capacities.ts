/**
 * Stage C: the bridged capacities and readingTendency that decide the layers
 * left after cognitiveLoad, for the face-validity personas (tool path).
 *
 *   bun research/stage-c-capacities.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
const { ROSTER, toolProfile } = await import("../tests/fixtures/ctc-golden-matrix.ts");
const K = ["readingCapacity", "motorCapacity", "sustainedAttention", "readingTendency", "interruptRecovery", "satisficing", "anchoringBias", "riskTolerance", "fearOfMissingOut", "socialProofSensitivity", "patience", "emotionalContagion", "proceduralFluency"];
console.log("| persona | " + K.join(" | ") + " |\n|---|" + K.map(() => "---").join("|") + "|");
for (const n of ["first-timer", "cognitive-adhd", "dyslexic-user", "low-vision-magnified", "motor-impairment-tremor", "elderly-user", "power-user"]) {
  const p = toolProfile(n, ROSTER[n]);
  console.log(`| ${n} | ` + K.map((k) => typeof p.traits[k] === "number" ? (p.traits[k] as number).toFixed(3) : "-").join(" | ") + " |");
}
