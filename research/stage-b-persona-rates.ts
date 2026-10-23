/**
 * Each built-in persona's motor, reading and decision capacity today, beside
 * the capacity c = r_p / (r_p + r_ref) its current rate implies and the one a
 * measured rate implies (research/stage-b-persona-rates.md).
 *
 * Pointing rate: the throughput getPointingProfile gives the persona, as the
 * capacity bridge calls it (name and traits, no accessibilityTraits). Reading
 * rate: the inverse of the per-word time computeReadingDifficulty gives the
 * persona's reading profile on neutral text (no text-dependent penalty), so
 * the number is the code's own. Measured rates: law.rate.* through
 * measuredRate(). Nothing here changes a persona.
 *
 *   bun research/stage-b-persona-rates.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { BUILTIN_PERSONAS, ACCESSIBILITY_PERSONAS, EMOTIONAL_PERSONAS } from "../src/personas.js";
import {
  bridgeCapacityTraits, computeReadingDifficulty, getPointingProfile, getReadingProfile,
} from "../src/visual/cognitive-models.js";
import { measuredRate, pointingCapacity, rateCapacity } from "../src/visual/demand-laws.js";

type P = { cognitiveTraits?: Record<string, number>; accessibilityTraits?: Record<string, number> };
const roster = { ...BUILTIN_PERSONAS, ...ACCESSIBILITY_PERSONAS, ...EMOTIONAL_PERSONAS } as Record<string, P>;

const NEUTRAL = { text: "a cat sat on the mat", fontSize: 16, lineHeight: 1.5, fontFamily: "sans-serif", isSerif: false, contrastRatio: 21 };
const msPerWord = (name: string, traits: Record<string, number>, a11y?: Record<string, number>) =>
  computeReadingDifficulty(NEUTRAL.text, getReadingProfile({ name, traits, accessibilityTraits: a11y }), NEUTRAL).fixationDuration;
const msRef = msPerWord("reference", {});

const READING_STATED = ["orthographicFluency", "phonologicalDecoding", "visualSpan", "vocabularyBreadth", "crowdingSensitivity"];
function readingRoute(name: string, traits: Record<string, number>, a11y?: Record<string, number>): string {
  const n = name.toLowerCase();
  const stated = READING_STATED.filter((k) => typeof a11y?.[k] === "number");
  const base = n.includes("dyslexi") ? "dyslexic" : (n.includes("low-vision") || n.includes("low vision") || n.includes("magnified")) ? "lowVision"
    : (n.includes("adhd") || n.includes("attention deficit")) ? "adhd" : (n.includes("elderly") || n.includes("senior") || n.includes("aging")) ? "elderly"
      : (traits.textProcessing !== undefined || traits.comprehension !== undefined) ? "interpolated" : "neurotypical";
  return stated.length ? `${base} + stated ${stated.join(", ")}` : base;
}
function pointingRoute(name: string, traits: Record<string, number>): string {
  const n = name.toLowerCase();
  if (n.includes("tremor") || n.includes("parkinson")) return "tremor";
  if (n.includes("elderly") || n.includes("senior") || n.includes("aging")) return "elderly";
  if (n.includes("adhd")) return "adhd";
  if (traits.motorPrecision !== undefined) return "interpolated (motorPrecision)";
  if (traits.proceduralFluency !== undefined && traits.patience !== undefined) return "interpolated (0.6 pf + 0.4 patience)";
  return "neurotypical";
}

// The persona each measured population stands for. Low vision has two
// measured groups and the personas do not say which field loss they have.
const POINTING_MEASURED: Record<string, "motionImpaired"> = { "motor-impairment-tremor": "motionImpaired" };
const READING_MEASURED: Record<string, Array<"dyslexiaAdults" | "lowVisionCentralLoss" | "lowVisionIntactFields">> = {
  "dyslexic-user": ["dyslexiaAdults"],
  "low-vision-magnified": ["lowVisionIntactFields", "lowVisionCentralLoss"],
  "elderly-low-vision": ["lowVisionIntactFields", "lowVisionCentralLoss"],
};
const DECISION = ["satisficing", "anchoringBias", "riskTolerance", "fearOfMissingOut", "socialProofSensitivity"];

const f3 = (x: number) => x.toFixed(3);
const rows: string[][] = [];
for (const [name, p] of Object.entries(roster)) {
  const raw = { ...(p.cognitiveTraits ?? {}) } as Record<string, number>;
  const traits = { ...raw };
  bridgeCapacityTraits(name, traits, p.accessibilityTraits);
  const tp = getPointingProfile({ name, traits: raw }).throughput;
  const ms = msPerWord(name, raw, p.accessibilityTraits);
  const k = ms / msRef;
  const pm = POINTING_MEASURED[name];
  const pointLit = pm ? `${f3(rateCapacity(measuredRate(pm).ratio, 1))} (${pm})` : "none";
  const rm = READING_MEASURED[name];
  const readLit = rm ? rm.map((r) => `${f3(rateCapacity(measuredRate(r).ratio, 1))} (${r})`).join(" / ") : "none";
  const decision = DECISION.map((t) => (typeof raw[t] === "number" ? raw[t].toFixed(2) : "-")).join(" ");
  rows.push([
    name, pointingRoute(name, raw), tp.toFixed(2), f3(traits.motorCapacity), f3(pointingCapacity(tp)), pointLit,
    readingRoute(name, raw, p.accessibilityTraits), String(ms), k.toFixed(2), f3(traits.readingCapacity), f3(rateCapacity(1 / k, 1)), readLit,
    decision,
  ]);
}

const head = ["persona", "pointing route", "TP", "motor today", "motor c (TP)", "motor c (measured)",
  "reading route", "ms/word", "k", "reading today", "reading c (k)", "reading c (measured)", `decision ${DECISION.join("/")}`];
console.log(`reference reader: ${msRef} ms/word (neurotypical profile on neutral text)`);
console.log(`| ${head.join(" | ")} |`);
console.log(`|${head.map(() => "---").join("|")}|`);
for (const r of rows) console.log(`| ${r.join(" | ")} |`);
