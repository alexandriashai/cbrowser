/**
 * Norm-implied trait values for the population-named personas, by the method of
 * the paper's section 3.1.1: a persona's value is the percentile, within a
 * typical reference population, of its population's mean on a normed
 * instrument.
 *
 * DIRECTION CONVENTION (one place, applied to every row):
 *
 *   zInst  = (population mean - reference mean) / reference SD, on the
 *            instrument as scored (negative = population lower).
 *   sign   = +1 when a higher instrument score means MORE of the trait as
 *            src/trait-reference.ts defines it, -1 when it means less.
 *   value  = Phi(sign * zInst). The typical reference sits at 0.5.
 *
 * So a deficit reported as Cohen's d (reference minus population, positive =
 * population worse) on a capacity whose high end is "better" gives
 * Phi(-d). A trait whose high end is the deficit-like behaviour (timeHorizon =
 * wants results now, changeBlindness = misses more) uses sign -1 or a positive
 * zInst, as each row states.
 *
 * Every number below was read this session; README.md and sources.md give the
 * table/page each came from. Current values are read from src/personas.ts on
 * this tree, not typed here.
 *
 *   bun research/persona-norms/norm-implied.ts            # markdown
 *   bun research/persona-norms/norm-implied.ts --json     # machine-readable
 */
import { ACCESSIBILITY_PERSONAS, BUILTIN_PERSONAS } from "../../src/personas.js";
import {
  bridgeCapacityTraits, getPointingProfile, getReadingProfile, motorCapacityOf, readingCapacityOf,
} from "../../src/visual/cognitive-models.js";

/** Standard normal CDF via erfc (Numerical Recipes erfcc, |error| < 1.2e-7). */
export function Phi(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
    t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? 1 - r / 2 : r / 2;
}

/** Point-biserial r to Cohen's d (equal-n approximation, as Kofler et al. 2020 report it). */
export const rToD = (r: number) => (2 * r) / Math.sqrt(1 - r * r);

/** 95% CI of r by Fisher z. */
function fisherCI(r: number, n: number): [number, number] {
  const z = Math.atanh(r), se = 1 / Math.sqrt(n - 3);
  return [Math.tanh(z - 1.959964 * se), Math.tanh(z + 1.959964 * se)];
}

type Fit = "good" | "partial" | "weak";

interface Effect {
  persona: string;
  trait: string;
  instrument: string;
  fit: Fit;
  /** Population minus reference, in reference SD units, on the instrument as scored. */
  zInst: number;
  /** CI (or reported range) of zInst, when the source gives one. */
  zLo?: number;
  zHi?: number;
  /** "ci" = a 95% CI; "range" = spread across tasks/measures, not a CI. */
  spread?: "ci" | "range";
  sign: 1 | -1;
  /** How zInst was obtained from the reported number. */
  derivation: string;
  population: string;
  source: string;
  /** The single estimate used for this persona-trait cell in the gap ranking. */
  primary?: boolean;
  note?: string;
}

const d = (x: number) => -x; // deficit d (reference minus population) -> zInst
const kofler = (r: number) => {
  const [lo, hi] = fisherCI(r, 172);
  return { zInst: -rToD(r), zLo: -rToD(hi), zHi: -rToD(lo), spread: "ci" as const };
};
const fromSE = (z: number, se: number) => ({ zInst: z, zLo: z - 1.959964 * se, zHi: z + 1.959964 * se, spread: "ci" as const });
const vsNorm = (m: number, normM: number, normSD: number, lo?: number, hi?: number) => ({
  zInst: (m - normM) / normSD,
  ...(lo !== undefined && hi !== undefined
    ? { zLo: (lo - normM) / normSD, zHi: (hi - normM) / normSD, spread: "ci" as const } : {}),
});
/** Two-group main effect, partial eta squared -> d (equal cells). Approximate. */
const etaToD = (eta2: number) => 2 * Math.sqrt(eta2 / (1 - eta2));

// Schmiedek et al. 2014, Table 1: younger (20-31) vs older (65-80), proportion correct, M and SD.
const SCHMIEDEK: Array<[string, number, number, number]> = [
  // task, YA mean, YA SD, OA mean
  ["reading span", 0.87, 0.11, 0.80], ["counting span", 0.85, 0.16, 0.74], ["rotation span", 0.82, 0.13, 0.54],
  ["n-back numerical", 0.89, 0.09, 0.75], ["n-back spatial", 0.85, 0.11, 0.70],
  ["memory updating numerical", 0.79, 0.17, 0.58], ["memory updating spatial", 0.64, 0.16, 0.43],
  ["alpha span", 0.73, 0.09, 0.60], ["animal span", 0.84, 0.12, 0.57],
];
const schmiedekZ = SCHMIEDEK.map(([, ya, sd, oa]) => (oa - ya) / sd).sort((a, b) => a - b);
const median = (xs: number[]) => (xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2);

// Sleimen-Malkoun et al. 2013, Table 1: movement time (ms) by index of difficulty, YA (n=10) vs OA (n=14).
const SLEIMEN: Array<[number, number, number, number, number]> = [
  // ID, YA M, YA SD, OA M, OA SD
  [3, 228, 48, 387, 122], [4, 296, 64, 460, 103], [5, 401, 55, 604, 138], [6, 500, 34, 746, 172], [7, 652, 47, 980, 201],
];
const sleimenPooledZ = SLEIMEN.map(([, ym, ysd, om, osd]) => {
  const pooled = Math.sqrt((9 * ysd ** 2 + 13 * osd ** 2) / 22);
  return -(om - ym) / pooled; // longer movement time = lower capacity
}).sort((a, b) => a - b);

const AGING = (persona: string, primary = true): Effect[] => [
  { persona, trait: "workingMemory", instrument: "9 WM tasks (complex span, n-back, updating, span); median of 9", fit: "good",
    zInst: median(schmiedekZ), zLo: schmiedekZ[0], zHi: schmiedekZ[schmiedekZ.length - 1], spread: "range", sign: 1,
    derivation: "(OA mean - YA mean) / YA SD per task, Table 1; median, range = min..max of the 9",
    population: "YA 20-31 (n=101) vs OA 65-80 (n=103)", source: "Schmiedek2014", primary,
    note: persona === "elderly-low-vision" ? "persona is 75+; data end at 80" : undefined },
  { persona, trait: "workingMemory", instrument: "alphabet span / computation span", fit: "good",
    zInst: (37.79 - 47.74) / 10.58, zLo: (28.75 - 41.20) / 15.33, zHi: (37.79 - 47.74) / 10.58, spread: "range", sign: 1,
    derivation: "(old M - young M) / young SD, Appendix B; range spans the two tasks",
    population: "young 18-39 (n=470) vs old 60-91 (n=461)", source: "Czaja2006" },
  { persona, trait: "mentalModelFlexibility", instrument: "Trail Making B-A (log, higher = better)", fit: "partial",
    zInst: (-3.83 - -3.24) / 0.84, sign: 1,
    derivation: "(old M - young M) / young SD, Appendix B",
    population: "young 18-39 (n=470) vs old 60-91 (n=461)", source: "Czaja2006", primary },
  { persona, trait: "riskTolerance", instrument: "behavioural risky-choice tasks, all tasks pooled", fit: "partial",
    zInst: 0.07, zLo: 0.05, zHi: 0.09, spread: "ci", sign: 1,
    derivation: "g as reported; positive g = older MORE risk seeking (the paper's coding)",
    population: "29 comparisons, N=4,093; 18-35 vs 65-85", source: "Mata2011", primary,
    note: "by task: description -0.001 [-0.02, 0.02], BART -0.38 [-0.44, -0.31], IGT 0.28, CGT 0.47" },
  { persona, trait: "riskTolerance", instrument: "BART (lowest task) .. CGT (highest task)", fit: "partial",
    zInst: -0.38, zLo: -0.38, zHi: 0.47, spread: "range", sign: 1,
    derivation: "task-level g as reported (range across tasks)", population: "as above", source: "Mata2011" },
  { persona, trait: "trustCalibration", instrument: "trust ratings and trust games", fit: "partial",
    zInst: 0.22, zLo: 0.15, zHi: 0.33, spread: "range", sign: 1,
    derivation: "overall g as reported; range = g for positive (0.15) .. negative (0.33) cues; no CI in the abstract",
    population: "38 data sets, young vs older adults", source: "BaileyLeon2019", primary },
  { persona, trait: "sustainedAttention", instrument: "SART no-go accuracy", fit: "partial",
    zInst: 0.59, zLo: 0.32, zHi: 0.85, spread: "ci", sign: 1,
    derivation: "g as reported; older MORE accurate (they are also slower on go trials, g = 1 [.72, 1.27])",
    population: "12 studies, 832 YA / 690 OA", source: "Vallesi2021", primary },
  { persona, trait: "motorCapacity", instrument: "stylus Fitts aiming, movement time, ID 3-7", fit: "partial",
    zInst: median(sleimenPooledZ), zLo: sleimenPooledZ[0], zHi: sleimenPooledZ[sleimenPooledZ.length - 1], spread: "range", sign: 1,
    derivation: "-(OA MT - YA MT) / pooled SD per ID, Table 1; median, range = min..max of 5 IDs",
    population: "YA n=10 (26 +/- 3) vs OA n=14 (78 +/- 7)", source: "SleimenMalkoun2013", primary,
    note: "n = 24; tablet stylus, not a mouse" },
  { persona, trait: "readingCapacity", instrument: "MNREAD maximum reading speed, normal vision", fit: "good",
    zInst: (175 - 200) / 25, sign: 1,
    derivation: "(175 wpm at age 81 - 200 wpm at 16-40) / 25; '+/- 25' is not labelled SD in the paper",
    population: "normally sighted, N=645, ages 8-81 (curve fit, not a group contrast)", source: "Calabrese2016", primary: persona === "elderly-user" },
];

export const EFFECTS: Effect[] = [
  // ── cognitive-adhd ──
  { persona: "cognitive-adhd", trait: "workingMemory", instrument: "WAIS-IV Working Memory Index (norm 100/15)", fit: "good",
    ...vsNorm(95.2, 100, 15, 92.5, 98.0), sign: 1,
    derivation: "(meta-analytic adult mean - 100) / 15; CI from the reported 95% CI of the mean",
    population: "adults with ADHD, 5 samples in Table 3 (two rows identical, n=66 each)", source: "Wilson2024", primary: true },
  { persona: "cognitive-adhd", trait: "workingMemory", instrument: "latent central-executive WM, bifactor Tier 1", fit: "good",
    ...kofler(0.71), sign: 1,
    derivation: "r = .71 -> d = 2r/sqrt(1-r^2); CI by Fisher z on r with N = 172",
    population: "children 8-13, 81 ADHD / 91 non-ADHD (30% of non-ADHD clinical)", source: "Kofler2020",
    note: "child sample; the system's source for this value" },
  { persona: "cognitive-adhd", trait: "workingMemory", instrument: "latent central-executive WM, bifactor Tier 2", fit: "good",
    ...kofler(0.63), sign: 1, derivation: "r = .63 -> d; CI by Fisher z, N = 172",
    population: "as above", source: "Kofler2020" },
  { persona: "cognitive-adhd", trait: "workingMemory", instrument: "WAIS Digit Span backward", fit: "good",
    zInst: d(0.44), zLo: d(0.78), zHi: d(0.10), spread: "ci", sign: 1, derivation: "d as reported",
    population: "adults, 156 ADHD / 109 controls", source: "Boonstra2005" },
  { persona: "cognitive-adhd", trait: "sustainedAttention", instrument: "CPT omission errors", fit: "good",
    zInst: d(0.50), zLo: d(0.70), zHi: d(0.31), spread: "ci", sign: 1, derivation: "d as reported (more omissions = worse)",
    population: "adults, 245 ADHD / 219 controls", source: "Boonstra2005", primary: true },
  { persona: "cognitive-adhd", trait: "sustainedAttention", instrument: "CPT attentiveness d'", fit: "good",
    zInst: d(0.55), zLo: d(0.75), zHi: d(0.35), spread: "ci", sign: 1, derivation: "d as reported",
    population: "adults, 215 / 189", source: "Boonstra2005" },
  { persona: "cognitive-adhd", trait: "timeHorizon", instrument: "monetary delay discounting", fit: "good",
    zInst: 0.40, sign: 1, derivation: "d as reported for adult studies; ADHD discounts MORE, and high discounting = high timeHorizon",
    population: "adult studies (mean age > 18) within 25 case-control comparisons, N = 3,913", source: "Jackson2016", primary: true,
    note: "overall d = 0.43; no CI in the retrieved text" },
  { persona: "cognitive-adhd", trait: "mentalModelFlexibility", instrument: "Trail Making Test B (set shifting)", fit: "partial",
    zInst: d(0.65), zLo: d(0.85), zHi: d(0.46), spread: "ci", sign: 1, derivation: "d as reported",
    population: "adults, 397 ADHD / 187 controls", source: "Boonstra2005", primary: true },
  { persona: "cognitive-adhd", trait: "mentalModelFlexibility", instrument: "set-shifting domain mean", fit: "partial",
    zInst: d(0.35), sign: 1, derivation: "unweighted mean SMD as reported", population: "34 meta-analyses, mixed ages", source: "Pievsky2018" },
  { persona: "cognitive-adhd", trait: "metacognitivePlanning", instrument: "planning/organization domain mean", fit: "partial",
    zInst: d(0.51), sign: 1, derivation: "unweighted mean SMD as reported", population: "34 meta-analyses, mixed ages", source: "Pievsky2018", primary: true,
    note: "measures planning ability; the trait is a tendency to plan" },
  { persona: "cognitive-adhd", trait: "riskTolerance", instrument: "laboratory risky decision-making", fit: "partial",
    zInst: 0.36, zLo: 0.22, zHi: 0.51, spread: "ci", sign: 1, derivation: "SMD as reported; ADHD riskier",
    population: "37 studies, 1,175 ADHD / 1,222 controls, mixed ages", source: "Dekkers2016", primary: true },
  { persona: "cognitive-adhd", trait: "resilience", instrument: "general emotion dysregulation", fit: "partial",
    zInst: 1.17, zLo: 0.70, zHi: 1.64, spread: "ci", sign: -1, derivation: "g as reported; ADHD MORE dysregulated, and dysregulation is the low end of resilience",
    population: "adults > 18, 13 studies, N = 2,535", source: "Beheshti2020", primary: true,
    note: "dysregulation is not the BRS construct (speed of recovery)" },
  { persona: "cognitive-adhd", trait: "selfEfficacy", instrument: "academic self-efficacy", fit: "partial",
    zInst: d(0.45), sign: 1, derivation: "d = -.45 as reported (ADHD lower)",
    population: "university students, 99 ADHD / 182 controls; one study", source: "Andreassen2026", primary: true },
  { persona: "cognitive-adhd", trait: "readingCapacity", instrument: "Stroop word card (word naming speed)", fit: "partial",
    zInst: d(0.60), zLo: d(1.08), zHi: d(0.11), spread: "ci", sign: 1, derivation: "d as reported",
    population: "adults, 318 / 111", source: "Boonstra2005", primary: true },
  { persona: "cognitive-adhd", trait: "motorCapacity", instrument: "Trail Making Test A (scanning + motor speed)", fit: "weak",
    zInst: d(0.46), zLo: d(0.65), zHi: d(0.28), spread: "ci", sign: 1, derivation: "d as reported",
    population: "adults, 422 / 217", source: "Boonstra2005" },

  // ── dyslexic-user ──
  { persona: "dyslexic-user", trait: "readingCapacity", instrument: "reading and writing tasks (excluding comprehension)", fit: "good",
    zInst: d(1.8845), zLo: d(2.034), zHi: d(1.735), spread: "range", sign: 1,
    derivation: "midpoint of the reported range 1.735 <= d <= 2.034 (range across measures, not a CI)",
    population: "adults, 178 studies", source: "Reis2020", primary: true, note: "reading comprehension alone d = 0.729" },
  { persona: "dyslexic-user", trait: "readingCapacity", instrument: "text reading time", fit: "good",
    zInst: d(1.29), zLo: d(1.59), zHi: d(0.98), spread: "ci", sign: 1, derivation: "d as reported, Table 5",
    population: "higher-education students, 100 / 100", source: "Callens2012", note: "word reading speed d = 1.97" },
  { persona: "dyslexic-user", trait: "workingMemory", instrument: "memory with sorting (reordering span)", fit: "good",
    zInst: d(0.45), sign: 1, derivation: "d as reported", population: "higher-education students, 100 / 100", source: "Callens2012", primary: true },
  { persona: "dyslexic-user", trait: "workingMemory", instrument: "WM tasks", fit: "good",
    zInst: -0.67, zLo: -0.68, zHi: -0.64, spread: "ci", sign: 1, derivation: "ES as reported (negative = RD lower)",
    population: "children; 320 effect sizes", source: "Swanson2009" },
  { persona: "dyslexic-user", trait: "sustainedAttention", instrument: "Digit Crossing Test, concentration", fit: "weak",
    zInst: d(0.51), sign: 1, derivation: "d as reported", population: "higher-education students, 100 / 100", source: "Callens2012" },
  { persona: "dyslexic-user", trait: "resilience", instrument: "anxiety + depression composite", fit: "weak",
    zInst: 0.54, sign: -1, derivation: "g = -.54 as reported, read as more internalizing", population: "96 studies, N = 83,260, ages 7-35", source: "Vieira2023" },

  // ── dyscalculia ──
  { persona: "dyscalculia", trait: "workingMemory", instrument: "WM capacity (accuracy, untimed)", fit: "good",
    ...fromSE(-0.61, 0.11), sign: 1, derivation: "g = 0.61, SE 0.11 as reported (Table 2); CI = g +/- 1.96 SE",
    population: "children 8-12, 13 studies", source: "Haberstroh2022", primary: true, note: "no adult dyscalculia samples found" },
  { persona: "dyscalculia", trait: "workingMemory", instrument: "short-term WM, all tasks", fit: "good",
    ...fromSE(-0.56, 0.07), sign: 1, derivation: "g, SE as reported", population: "children 8-12, 16 studies", source: "Haberstroh2022" },
  { persona: "dyscalculia", trait: "sustainedAttention", instrument: "attentional control (accuracy / RT)", fit: "partial",
    zInst: -0.23, zLo: -0.58, zHi: -0.23, spread: "range", sign: 1, derivation: "g = 0.23 (accuracy) and 0.58 (RT) as reported",
    population: "children 8-12, 5 studies each", source: "Haberstroh2022", primary: true },
  { persona: "dyscalculia", trait: "readingCapacity", instrument: "reading and writing", fit: "partial",
    ...fromSE(-0.33, 0.04), sign: 1, derivation: "g, SE as reported (first data set)", population: "children; reading difficulties excluded by design",
    source: "Haberstroh2022", primary: true },

  // ── elderly-user / elderly-low-vision (age effects) ──
  ...AGING("elderly-user"),
  ...AGING("elderly-low-vision"),
  { persona: "elderly-low-vision", trait: "readingCapacity", instrument: "MNREAD max reading speed, AMD vs normal-vision norm", fit: "good",
    ...vsNorm(141.3, 200, 25), sign: 1,
    derivation: "(141.3 - 200) / 25: AMD baseline (Patel2020) against the young-adult norm (Calabrese2016). CROSS-STUDY",
    population: "neovascular AMD, n = 50, age 78.7", source: "Patel2020+Calabrese2016", primary: true,
    note: "against the age-81 norm (175 wpm) z = -1.35" },

  // ── low-vision-magnified ──
  { persona: "low-vision-magnified", trait: "readingCapacity", instrument: "MNREAD max reading speed, AMD vs normal-vision norm", fit: "partial",
    ...vsNorm(141.3, 200, 25), sign: 1, derivation: "as for elderly-low-vision; CROSS-STUDY",
    population: "AMD, age 78.7 (persona is 45-75)", source: "Patel2020+Calabrese2016", primary: true },

  // ── deaf-user ──
  { persona: "deaf-user", trait: "workingMemory", instrument: "verbal serial recall, backward", fit: "partial",
    zInst: -0.66, zLo: -0.89, zHi: -0.45, spread: "ci", sign: 1, derivation: "g as reported",
    population: "35 studies, N = 1,701, deaf signers vs hearing non-signers, all ages", source: "McFayden2023", primary: true,
    note: "visuospatial STM g = -0.055 [-0.39, 0.28]: the deficit is verbal-sequential, not general" },
  { persona: "deaf-user", trait: "workingMemory", instrument: "visuospatial serial recall, forward", fit: "partial",
    zInst: -0.055, zLo: -0.39, zHi: 0.28, spread: "ci", sign: 1, derivation: "g as reported", population: "as above", source: "McFayden2023" },
  { persona: "deaf-user", trait: "changeBlindness", instrument: "Useful Field of View threshold (peripheral selective attention)", fit: "partial",
    zInst: etaToD(0.24), sign: -1,
    derivation: "partial eta^2 = .24 for the deafness main effect -> d = 2*sqrt(eta2/(1-eta2)) (equal-cell approximation); deaf BETTER",
    population: "adults, N = 40 in a 2 x 2 design", source: "Dye2009", primary: true },

  // ── autism-spectrum ──
  { persona: "autism-spectrum", trait: "workingMemory", instrument: "WAIS-IV Working Memory Index (norm 100/15)", fit: "good",
    ...vsNorm(92.9, 100, 15, 83.5, 102.3), sign: 1,
    derivation: "(meta-analytic adult mean - 100) / 15; CI from the reported 95% CI",
    population: "autistic adults, 10 samples, N = 437 (one sample has FSIQ 51.3)", source: "Wilson2024", primary: true },
  { persona: "autism-spectrum", trait: "workingMemory", instrument: "phonological WM accuracy, adults", fit: "good",
    zInst: -0.79, zLo: -1.53, zHi: -0.04, spread: "ci", sign: 1, derivation: "d as reported", population: "adults, k = 5", source: "Habib2019" },
  { persona: "autism-spectrum", trait: "workingMemory", instrument: "visuospatial WM accuracy, adults", fit: "good",
    zInst: -0.47, zLo: -0.91, zHi: -0.03, spread: "ci", sign: 1, derivation: "d as reported", population: "adults, k = 4", source: "Habib2019" },
  { persona: "autism-spectrum", trait: "mentalModelFlexibility", instrument: "EF flexibility domain, adults with HFA", fit: "partial",
    zInst: d(0.69), sign: 1, derivation: "g as reported (positive = ASD worse)", population: "42 studies, N = 2,419 adults", source: "Xie2020", primary: true },
  { persona: "autism-spectrum", trait: "mentalModelFlexibility", instrument: "WCST, 4 measures", fit: "partial",
    zInst: d(0.52), zLo: d(0.74), zHi: d(0.30), spread: "range", sign: 1, derivation: "midpoint of the reported range 0.30-0.74",
    population: "31 studies, mixed ages", source: "Landry2016" },
  { persona: "autism-spectrum", trait: "metacognitivePlanning", instrument: "planning tasks (ToL, ToH, SoC, BADS)", fit: "partial",
    zInst: d(0.52), zLo: d(0.66), zHi: d(0.39), spread: "ci", sign: 1, derivation: "g as reported; trim-and-fill 0.37 [0.21, 0.51]",
    population: "50 studies (13 adult), 1,755 ASD / 1,642 TD; age not a moderator", source: "OldeDubbelink2017", primary: true,
    note: "planning ability, not the tendency to plan" },
  { persona: "autism-spectrum", trait: "anchoringBias", instrument: "gain/loss framing effect size", fit: "weak",
    zInst: -0.80, zLo: -1.44, zHi: -0.15, spread: "ci", sign: 1,
    derivation: "between-group d on the framing effect (controls > ASD), read as ASD LESS susceptible",
    population: "adults, 20 ASD / 20 alexithymia-matched controls", source: "Shah2016",
    note: "framing, not anchoring; the ASD group still showed a framing effect (within-group d = 1.08)" },

  // ── intellectual-disability ──
  { persona: "intellectual-disability", trait: "workingMemory", instrument: "WAIS-IV Working Memory Index vs norm", fit: "good",
    zInst: -2.27, zLo: -2.92, zHi: -2.12, spread: "range", sign: 1,
    derivation: "WAIS-IV g vs norm 100/15 as reported (sec. 3.3); range = -2.92 .. WAIS-III -2.12. The pooled ID WMI is -2.84 in Table 2; the text's -2.92 is the Table 2 ASD+ID row",
    population: "ID samples on Wechsler scales; adult rows report no k or n", source: "MortariFerreira2026", primary: true,
    note: "definition: FSIQ about 2 SD or more below the mean (AAIDD)" },
  { persona: "intellectual-disability", trait: "trustCalibration", instrument: "Gudjonsson Suggestibility Scale, Yield 1", fit: "partial",
    zInst: 1.11, zLo: 0.81, zHi: 1.41, spread: "ci", sign: 1, derivation: "SMD vs normative data as reported; ID yield MORE",
    population: "14 studies, 1,438 participants (691 adults)", source: "Gilbert2026", primary: true },
  { persona: "intellectual-disability", trait: "authoritySensitivity", instrument: "Gudjonsson Suggestibility Scale, Shift", fit: "partial",
    zInst: 0.70, zLo: 0.44, zHi: 0.98, spread: "ci", sign: 1, derivation: "SMD vs normative data as reported (answers changed under interviewer pressure)",
    population: "as above", source: "Gilbert2026", primary: true },

  // ── aphasia-receptive ──
  { persona: "aphasia-receptive", trait: "sustainedAttention", instrument: "TEA Telephone Search while Counting (norm 10/3)", fit: "partial",
    ...vsNorm(5.3, 10, 3), sign: 1, derivation: "(mean scaled score - 10) / 3; vs this study's controls d = (11.7-5.3)/3.1 = 2.06",
    population: "39 IWA, age 60.2 (32-83), mild to moderately severe, 52 months post-stroke", source: "Murray2011", primary: true,
    note: "Elevator Counting (pure sustained) has a ceiling of 7 and is unusable; this subtest adds a dual-task load" },
  { persona: "aphasia-receptive", trait: "workingMemory", instrument: "WMS-R visual memory span backward (mean percentile)", fit: "good",
    zInst: 0, sign: 1, derivation: "mean percentile 46.6 used directly as the value (see PERCENTILE below)",
    population: "39 IWA vs 39 controls (controls 63.6)", source: "Murray2011", primary: true },
  { persona: "aphasia-receptive", trait: "workingMemory", instrument: "high-load WM tasks after stroke (all stroke, not aphasia-specific)", fit: "partial",
    zInst: -0.59, zLo: -0.73, zHi: -0.45, spread: "ci", sign: 1, derivation: "high-load g as reported in the abstract (low-load -.58 [-.82, -.43])",
    population: "50 studies, 3,084 stroke patients vs controls", source: "Lugtmeijer2020" },
  { persona: "aphasia-receptive", trait: "mentalModelFlexibility", instrument: "TEA Visual Elevator (attention switching, norm 10/3)", fit: "partial",
    ...vsNorm(5.9, 10, 3), sign: 1, derivation: "(mean scaled score - 10) / 3",
    population: "39 IWA", source: "Murray2011", primary: true, note: "Ruff Figural Fluency mean percentile 21.7" },
];

/** Rows whose value is a reported mean percentile rather than Phi(z). */
const PERCENTILE: Record<string, number> = {
  "aphasia-receptive|workingMemory|WMS-R visual memory span backward (mean percentile)": 0.466,
};

const CAPACITIES = new Set(["readingCapacity", "motorCapacity", "sustainedAttention"]);

function currentValues(): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const name of new Set(EFFECTS.map((e) => e.persona))) {
    const p: any = (ACCESSIBILITY_PERSONAS as any)[name] ?? (BUILTIN_PERSONAS as any)[name];
    const traits: Record<string, number> = { ...(p.cognitiveTraits ?? {}) };
    bridgeCapacityTraits(name, traits, p.accessibilityTraits);
    out[name] = traits;
  }
  return out;
}

/** What the system's own capacity scales give a typical (neurotypical) persona. */
export function systemTypical(): Record<string, number> {
  return {
    readingCapacity: readingCapacityOf(getReadingProfile({ name: "reference" })),
    motorCapacity: motorCapacityOf(getPointingProfile({ name: "reference" })),
    // sustainedAttentionOf's stated fallback for a persona that states neither input
    sustainedAttention: 0.7,
  };
}

export function compute() {
  const cur = currentValues();
  return EFFECTS.map((e) => {
    const key = `${e.persona}|${e.trait}|${e.instrument}`;
    const pct = PERCENTILE[key];
    const value = pct ?? Phi(e.sign * e.zInst);
    let lo: number | undefined, hi: number | undefined;
    if (pct === undefined && e.zLo !== undefined && e.zHi !== undefined) {
      const a = Phi(e.sign * e.zLo), b = Phi(e.sign * e.zHi);
      lo = Math.min(a, b); hi = Math.max(a, b);
    }
    const current = cur[e.persona]?.[e.trait];
    const gap = current === undefined ? undefined : current - value;
    return {
      ...e, value, lo, hi, current, gap,
      capacityScale: CAPACITIES.has(e.trait),
      flag: gap !== undefined && Math.abs(gap) > 0.15,
      outsideInterval: current !== undefined && lo !== undefined && hi !== undefined && (current < lo || current > hi),
    };
  });
}

if (import.meta.main) {
  const rows = compute();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ systemTypical: systemTypical(), rows }, null, 2));
  } else {
    const f = (x?: number) => (x === undefined ? "-" : x.toFixed(3));
    console.log("system-typical capacity values:", JSON.stringify(systemTypical()));
    console.log("\n| persona | trait | instrument | fit | zInst | value | interval | current | gap | flag | primary | source |\n|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const r of rows) {
      const iv = r.lo === undefined ? "-" : `${f(r.lo)}-${f(r.hi)} (${r.spread})`;
      const zs = PERCENTILE[`${r.persona}|${r.trait}|${r.instrument}`] !== undefined ? "pct" : r.zInst.toFixed(3);
      console.log(`| ${r.persona} | ${r.trait} | ${r.instrument} | ${r.fit} | ${zs} | ${f(r.value)} | ${iv} | ${f(r.current)} | ${r.gap === undefined ? "-" : (r.gap >= 0 ? "+" : "") + r.gap.toFixed(3)} | ${r.flag ? (r.capacityScale ? "SCALE" : ">0.15") : ""} | ${r.primary ? "yes" : ""} | ${r.source} |`);
    }
    const ranked = rows
      .filter((r) => r.primary && r.fit !== "weak" && !r.capacityScale && r.gap !== undefined)
      .sort((a, b) => Math.abs(b.gap!) - Math.abs(a.gap!));
    const primaries = rows.filter((r) => r.primary);
    const anchored = primaries.filter((r) => r.fit !== "weak" && !r.capacityScale);
    console.log(`\nprimary cells: ${primaries.length}; 0.5-anchored with good/partial fit: ${anchored.length}, ` +
      `of which |gap| > 0.15: ${anchored.filter((r) => r.flag).length}, current outside the interval: ` +
      `${anchored.filter((r) => r.outsideInterval).length}; capacity-scale cells: ${primaries.filter((r) => r.capacityScale).length}`);
    console.log("\nLargest gaps, primary estimate, good/partial fit, 0.5-anchored traits only:");
    for (const r of ranked.slice(0, 8)) {
      console.log(`- ${r.persona} ${r.trait}: current ${f(r.current)} vs norm-implied ${f(r.value)} (${r.lo === undefined ? "no interval" : `${f(r.lo)}-${f(r.hi)}`}), gap ${(r.gap! >= 0 ? "+" : "") + r.gap!.toFixed(3)} [${r.source}]`);
    }
  }
}
