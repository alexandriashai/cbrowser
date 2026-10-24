/**
 * The four law times of a measured page beside the demand each makes, as a
 * tool response reports them (cognitive_effort's lawTimes, the site
 * assessment's pageMetrics.lawTimes). Display rounding only; the laws and
 * their constants are in demand-laws.ts.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { param } from "./model-provenance.js";
import { timeDemand } from "./demand-laws.js";

export interface LawTimesReport {
  /** The time budget each law time is a demand against, seconds (law.timeBudget). */
  budgetSeconds: number;
  pointing: { seconds: number; demand: number };
  /**
   * First-visit choosing (novice search), the decision layer's demand on every
   * run. On a familiar run (siteFamiliarity e > 0) the time the cognitiveLoad
   * abilities are asked, (1 - e) novice + e expert (Cockburn et al. 2007,
   * Eq. 4), is reported beside it.
   */
  choosing: { seconds: number; demand: number; expertSeconds?: number; siteFamiliarity?: number; familiarSeconds?: number; familiarDemand?: number };
  reading: { seconds: number; demand: number };
  procedure: { seconds: number; demand: number };
  note: string;
}

const round = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places;

/**
 * The four law times of a measured page beside the demand each makes, for a
 * tool response: seconds of work for the reference user, d = T / (T + budget).
 */
export function lawTimesReport(m: {
  pointingSeconds: number; choosingSeconds: number; readingSeconds: number; procedureSeconds: number;
  choosingSecondsExpert?: number;
}, siteFamiliarity: number = 0): LawTimesReport {
  const one = (seconds: number) => ({ seconds: round(seconds, 1), demand: round(timeDemand(seconds), 3) });
  const expert = m.choosingSecondsExpert;
  const familiar = siteFamiliarity > 0 && typeof expert === "number";
  const at = familiar ? one((1 - siteFamiliarity) * m.choosingSeconds + siteFamiliarity * expert) : undefined;
  return {
    budgetSeconds: param("law.timeBudget"),
    pointing: one(m.pointingSeconds),
    choosing: {
      ...one(m.choosingSeconds),
      ...(typeof expert === "number" ? { expertSeconds: round(expert, 1) } : {}),
      ...(at ? { siteFamiliarity, familiarSeconds: at.seconds, familiarDemand: at.demand } : {}),
    },
    reading: one(m.readingSeconds),
    procedure: one(m.procedureSeconds),
    note: "Seconds of work this page asks of a typical first-time visitor, from published laws: pointing (Fitts, every target once), choosing (novice visual search, every choice group once; expertSeconds is the Hick-Hyman expert limit; on a run with siteFamiliarity e the cognitiveLoad abilities are asked (1 - e) novice + e expert, familiarSeconds, Cockburn et al. 2007), reading (Brysbaert's silent reading rate for all prose outside menus once, plus a first read of each menu label with visible text, 0.13 s, a hypothesis read off Cockburn et al. 2007) and procedure (the keystroke-level model's mental preparation per entry field). Each is a demand against one time budget, d = T / (T + budget); the budget is the median stay on a first-time page visit (Weinreich et al. 2008), a hypothesis.",
  };
}
