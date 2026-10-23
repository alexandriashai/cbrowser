/**
 * Law times for a hand-built test page (Stage B).
 *
 * computeDemandDistribution takes the motor, decision, procedure and reading
 * demands from four law times (pointingSeconds, choosingSeconds,
 * readingSeconds, procedureSeconds; demand-laws.ts) and throws without them.
 * A measured page gets them from deriveMetrics. A test page described by the
 * counts it was written with before Stage B (interactiveElementCount,
 * choiceCount, textDensity, informationDensity) gets them here, as the times
 * that ask the SAME demand the retired hand-set curves asked of those counts:
 *
 *   motor       0.9 n / (n + 20)              (n interactive elements)
 *   procedure   0.9 n / (n + 20)
 *   decision    c / (c + 10)                  (c choices)
 *   reading     0.9 max(textDensity, informationDensity)
 *
 * inverted through d = T / (T + tau): T = tau d / (1 - d), with tau the
 * registered law.timeBudget read as a value, not through param(), so a test
 * that overrides tau still sees the demand move. A test fixture convention,
 * not a model of real pages: it keeps a test written against counts asking
 * what it asked. A test about the demand mechanism itself builds its page from
 * law times or a raw measurement instead.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { MODEL_PROVENANCE } from "../../src/visual/model-provenance.js";
import { computeDemandFromRawMetrics, type DemandDistribution } from "../../src/visual/cognitive-transport-chain.js";

export interface LawSeconds {
  pointingSeconds: number;
  choosingSeconds: number;
  readingSeconds: number;
  procedureSeconds: number;
  /** Stage C: the choosing time's Hick-Hyman expert limit (expertFor). */
  choosingSecondsExpert: number;
}

const TAU = MODEL_PROVENANCE["law.timeBudget"].value;
const LAW = (id: string) => MODEL_PROVENANCE[`law.${id}`].value;

/**
 * The expert limit for a hand-built page's choosing time, read as ONE choice
 * group: n = (T - a_search) / b_search items found by novice search, chosen
 * among by Hick-Hyman, a_hick + b_hick log2 n (Cockburn, Gutwin & Greenberg
 * 2007), never above T. A fixture convention like the rest of this file: a
 * measured page has its groups, a hand-built one only a time. It moves a
 * demand only on a run with siteFamiliarity above 0.
 */
export function expertFor(choosingSeconds: number): number {
  if (!(choosingSeconds > 0)) return 0;
  const n = Math.max(1, (choosingSeconds - LAW("search.intercept")) / LAW("search.slope"));
  return Math.min(choosingSeconds, LAW("hick.intercept") + LAW("hick.slope") * Math.log2(n));
}
const timeFor = (d: number) => (d <= 0 ? 0 : (TAU * d) / (1 - d));
const nonNeg = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0);

/** The law times that ask the demand the retired curves asked of these counts. */
export function legacySeconds(m: { interactiveElementCount?: number; choiceCount?: number; textDensity?: number; informationDensity?: number }): LawSeconds {
  const n = nonNeg(m.interactiveElementCount);
  const c = nonNeg(m.choiceCount);
  const text = Math.min(1, Math.max(nonNeg(m.textDensity), nonNeg(m.informationDensity)));
  const inter = n / (n + 20);
  const choosingSeconds = timeFor(c / (c + 10));
  return {
    pointingSeconds: timeFor(0.9 * inter),
    choosingSeconds,
    readingSeconds: timeFor(0.9 * text),
    procedureSeconds: timeFor(0.9 * inter),
    choosingSecondsExpert: expertFor(choosingSeconds),
  };
}

/** A hand-built PageMetrics with the four law times filled in where it has none (a measured one keeps its own). */
export function withLawSeconds<T extends object>(m: T): T & LawSeconds {
  const has = (k: keyof LawSeconds) => typeof (m as Partial<LawSeconds>)[k] === "number";
  if (has("pointingSeconds") && has("choosingSeconds") && has("readingSeconds") && has("procedureSeconds")) {
    if (has("choosingSecondsExpert")) return m as T & LawSeconds;
    return { ...m, choosingSecondsExpert: expertFor((m as unknown as LawSeconds).choosingSeconds) } as T & LawSeconds;
  }
  return { ...legacySeconds(m as Record<string, number>), ...m } as T & LawSeconds;
}

/** computeDemandFromRawMetrics in its pre-Stage-B argument order, the counts turned into law times by legacySeconds. */
export function demandFromLegacy(
  informationDensity: number, visualComplexity: number, interactiveElementCount: number, textDensity: number,
  animationLevel: number, choiceCount: number, navigationDepth: number,
): DemandDistribution {
  const s = legacySeconds({ interactiveElementCount, choiceCount, textDensity, informationDensity });
  return computeDemandFromRawMetrics(informationDensity, visualComplexity, textDensity, animationLevel, navigationDepth,
    s.pointingSeconds, s.choosingSeconds, s.readingSeconds, s.procedureSeconds, s.choosingSecondsExpert);
}

/** The design's maxima, above every page in the reference sample (research/stage-b-design.md, section 7). */
export const MAX_LAW_SECONDS: LawSeconds = { pointingSeconds: 1500, choosingSeconds: 130, readingSeconds: 1800, procedureSeconds: 15, choosingSecondsExpert: expertFor(130) };
