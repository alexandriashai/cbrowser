/**
 * A persona's age, read only from what its author stated.
 *
 * Until 21.0.1 the description generator set "65+" whenever a description
 * contained "elderly", "senior", "older", "65+" or "retired", and the
 * custom-persona rate rules matched "senior" and the substring "aging". So "A
 * senior software engineer", "a 30-year-old using an older phone", "retired
 * early at 52" and "managing a team" all read as older adults, and a stated age
 * was never read at all.
 *
 * Now, in order:
 *   1. an ageRange the author set (e.g. "65-74", "65+", "30");
 *   2. a stated number: "30-year-old", "30 years old", "aged 30", "age 30",
 *      "in her 70s";
 *   3. a phrase that states age and nothing else: "elderly", "older adult(s)",
 *      "senior citizen(s)", "pensioner(s)", a literal "65+";
 *   4. an age band for a young or middle-aged persona ("teenager", "student",
 *      "Gen Z", "middle-aged"), kept from the generator's old bands;
 *   5. otherwise unknown.
 * A stated number always wins over words, so "a 30-year-old caring for her
 * elderly mother" is 30. "Senior", "older" and "retired" alone state no age.
 *
 * Whether an age makes a persona an older adult is one threshold,
 * age.olderAdult.threshold (provenance/age.ts).
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { ageValue } from "./visual/provenance/age.js";

export type AgeSource = "ageRange" | "stated" | "phrase" | "band" | "none";

export interface PersonaAge {
  /** The lowest age the statement allows, or null when unknown. */
  low: number | null;
  /** What a persona's demographics.age_range should show. */
  label: string;
  source: AgeSource;
}

const STATED: RegExp[] = [
  /\b(\d{1,3})[\s-]{0,3}(?:years?|yrs?)[\s-]{0,3}old\b/,
  /\b(\d{1,3})\s{0,3}y\/o\b/,
  /\baged?\s{1,3}(\d{1,3})\b/,
];
const DECADE = /\bin\s{1,3}(?:his|her|their|my|your|the)\s{1,3}(?:(?:early|mid|late)\s{1,3})?([1-9])0s\b/;
const OLDER_PHRASE = /\b(?:elderly|older\s{1,3}adults?|senior\s{1,3}citizens?|pensioners?)\b|(?:^|[^\d])65\s{0,3}\+/;
const YOUNG_BAND = /\b(?:teens?|teenagers?|teenage|students?|gen\s?z)\b/;
const MIDDLE_BAND = /\bmiddle[\s-]aged?\b/;

/**
 * How much of a name + description, and of an ageRange, is read. A persona's
 * age is stated in its first lines; the cap keeps every match linear in a
 * bounded input, so a megabyte description sent to a hosted server costs
 * nothing here. (21.0.1 read the whole text with an unbounded
 * "\s*-?\s*" pattern: 32,000 characters of spaces after a digit took 479 ms.)
 */
export const AGE_TEXT_LIMIT = 2000;

/** The default band a persona with no stated age shows. */
export const UNKNOWN_AGE_LABEL = "25-45";

function firstNumber(s: string): number | null {
  const m = s.match(/(\d{1,3})/);
  return m ? Number(m[1]) : null;
}

/** Read a persona's age from its ageRange field, then its name and description. */
export function readPersonaAge(p: { name?: string; description?: string; ageRange?: string }): PersonaAge {
  const range = (p.ageRange ?? "").slice(0, 64).trim();
  if (range) {
    const low = firstNumber(range);
    if (low !== null) return { low, label: range, source: "ageRange" };
  }
  const text = `${p.name ?? ""} ${p.description ?? ""}`.slice(0, AGE_TEXT_LIMIT).toLowerCase();
  for (const re of STATED) {
    const m = text.match(re);
    if (m && Number(m[1]) <= 120) return { low: Number(m[1]), label: m[1], source: "stated" };
  }
  const d = text.match(DECADE);
  if (d) return { low: Number(d[1]) * 10, label: `${d[1]}0-${d[1]}9`, source: "stated" };
  const threshold = ageValue("age.olderAdult.threshold");
  if (OLDER_PHRASE.test(text)) return { low: threshold, label: `${threshold}+`, source: "phrase" };
  if (YOUNG_BAND.test(text)) return { low: 18, label: "18-24", source: "band" };
  if (MIDDLE_BAND.test(text)) return { low: 45, label: "45-65", source: "band" };
  return { low: null, label: UNKNOWN_AGE_LABEL, source: "none" };
}

/** Whether a persona is an older adult: its stated age is at or above the threshold. */
export function isOlderAdult(p: { name?: string; description?: string; ageRange?: string }): boolean {
  const { low } = readPersonaAge(p);
  return low !== null && low >= ageValue("age.olderAdult.threshold");
}
