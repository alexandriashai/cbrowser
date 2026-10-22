/**
 * Provenance catalogue for the perceptual profiles (perceptual-transport.ts:
 * PERCEPTUAL_PROFILES and DEFAULT_PROFILE): each profile's barrier weights and
 * the numeric fields of its visual filter. See ../model-provenance.ts for the
 * statuses.
 *
 * CATALOGUED, NOT READ THROUGH param(), for the reason personas.ts gives: the
 * profiles are readable tables, and rewriting them to read each number by id
 * would bury them. It is also forced here: this file must import the profiles
 * to describe them, so perceptual-transport.ts importing the registry would
 * close an import cycle. The entries are built FROM the profile objects at
 * module load, so a value here is the value the tools run on and cannot drift
 * from it; the registry adds the status and the source. No code reads a
 * `perceptual.` id through param(), so a check for registered ids that are
 * never read must leave this prefix out. tests/perceptual-provenance.test.ts
 * fails if a numeric field has no entry, if a value differs, or if a profile,
 * barrier key or filter field appears that this file has no description for.
 *
 * Every built-in profile value is a `hypothesis`: set by hand, with comments in
 * perceptual-transport.ts explaining the direction (e.g. "has full vision")
 * and none measuring the number. A barrier weight multiplies the points a
 * barrier deducts in empathy_audit; a filter field shapes the attention map
 * (attentionMode, processingSpeed) or the perceptual score. DEFAULT_PROFILE,
 * which a name nothing recognises falls back to, is all `definition`: weight 1
 * charges a barrier at face value and the filter is the identity, a neutral
 * profile that models no one rather than a claim about anyone.
 *
 * What would test a built-in value: the measure named below, in a sample of
 * the profile's population, compared with a general-population sample on the
 * same pages or task. impatient-user is a behavioural archetype and needs a
 * screening criterion before it has a population.
 *
 * Not covered: the numbers in synthesizePerceptualProfile (how accessibility
 * traits map to a filter for a custom persona) and in calculatePerceptualScore
 * and analyzePerceptualTransport are inline literals, still unregistered.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { ProvenanceEntry } from "../model-provenance.js";
import { PERCEPTUAL_PROFILES, DEFAULT_PROFILE, type PerceptualProfile } from "../perceptual-transport.js";

/** Per barrier key: the barrier, as a reader would name it. */
const BARRIERS: Record<string, string> = {
  touch_target: "small or crowded touch and click target",
  low_contrast: "low-contrast text",
  cognitive_load: "high cognitive load (dense or complex layout)",
  timing: "time limit or timed content",
  color_only: "information carried by colour alone",
  missing_alt: "image without a text alternative",
  missing_label: "form field without a label",
  hover_dependent: "content reachable only by hover",
  form_complexity: "long or complex form",
  audio_description: "video without audio description",
  captions: "media without captions",
};

/** Per visual-filter field: what it models and the measure that would place a population on it. */
const FILTER_FIELDS: Record<string, { what: string; measure: string }> = {
  contrastThreshold: { what: "minimum contrast perceived", measure: "Pelli-Robson contrast sensitivity" },
  blurRadius: { what: "blur simulating reduced acuity", measure: "visual acuity (logMAR) at a stated viewing distance, converted to screen pixels" },
  "colorAttenuation.r": { what: "red-channel attenuation", measure: "axis-specific colour discrimination (e.g. Farnsworth-Munsell 100-hue, protan axis)" },
  "colorAttenuation.g": { what: "green-channel attenuation", measure: "axis-specific colour discrimination (e.g. Farnsworth-Munsell 100-hue, deutan axis)" },
  "colorAttenuation.b": { what: "blue-channel attenuation", measure: "axis-specific colour discrimination (e.g. Farnsworth-Munsell 100-hue, tritan axis)" },
  motorCostMultiplier: { what: "cost of reaching interactive elements, relative to typical", measure: "pointing throughput on an ISO 9241-411 tapping task, as a ratio to a typical sample" },
  processingSpeed: { what: "processing speed, relative to typical (it attenuates weak saliency in the attention map)", measure: "the Symbol Digit Modalities Test, as a ratio to the norm" },
  noiseTolerance: { what: "tolerance of visual clutter", measure: "the slowdown of visual search on cluttered against uncluttered displays" },
};

/** Per profile: the population a test sample would come from, or the archetype's screening criterion. */
const POPULATIONS: Record<string, { population: string } | { archetype: string }> = {
  "first-timer": { population: "adults using the interface under test for the first time" },
  "mobile-user": { population: "smartphone-primary web users aged 18-45" },
  "impatient-user": { archetype: "users in the top quartile of observed abandonment rate" },
  "power-user": { population: "expert daily web users (e.g. professional developers) aged 25-45" },
  "elderly-user": { population: "adults aged 65 and over" },
  "motor-impairment-tremor": { population: "adults aged 40-65 with essential tremor" },
  "low-vision-magnified": { population: "adults aged 45-75 with low vision who use about 3x screen magnification" },
  "cognitive-adhd": { population: "adults aged 18-45 diagnosed with ADHD" },
  "dyslexic-user": { population: "adults aged 18-55 diagnosed with dyslexia" },
  "color-blind-deuteranopia": { population: "adults with confirmed deuteranopia" },
  "screen-reader-user": { population: "blind adults who use a screen reader daily" },
  "deaf-user": { population: "deaf adults" },
  "elderly-low-vision": { population: "adults aged 75 and over with age-related low vision" },
};

const DEFAULT_ID = "default";

export interface PerceptualCatalogue {
  entries: ProvenanceEntry[];
  /** Ids of numeric fields that could not be described (unknown profile, barrier key or filter field, or a duplicate). */
  uncovered: string[];
}

function sample(profile: string): string {
  const who = POPULATIONS[profile];
  return "population" in who
    ? `a sample of ${who.population}`
    : `a sample screened as ${who.archetype} (the profile is a behavioural archetype with no population until then)`;
}

function barrierSource(profile: string, key: string, value: number): string {
  if (profile === DEFAULT_ID) {
    return `DEFAULT_PROFILE.${key} = ${value}: a ${BARRIERS[key]} is charged at face value for a persona no profile describes. The neutral weight of a profile that models no one; no empirical claim.`;
  }
  return `${profile} barrier weight ${key} = ${value}, set by hand: the multiple of the points one ${BARRIERS[key]} deducts for this persona. What would fit it: the drop in task success (or rise in time on task) one such barrier costs ${sample(profile)}, divided by the drop it costs a general-population sample, on otherwise matched pages.`;
}

function filterSource(profile: string, field: string, value: number): string {
  const f = FILTER_FIELDS[field];
  if (profile === DEFAULT_ID) {
    return `DEFAULT_PROFILE visual filter ${field} = ${value} (${f.what}): the identity filter of a profile that models no one; no empirical claim.`;
  }
  return `${profile} visual filter ${field} = ${value} (${f.what}), set by hand. What would test it: ${f.measure}, in ${sample(profile)}.`;
}

/**
 * Build one entry per numeric barrier weight and visual-filter field. A value
 * whose profile, barrier key or field this file has no description for is
 * reported as uncovered instead of registered, so the test fails rather than
 * the module.
 */
export function cataloguePerceptualProfiles(
  profiles: Record<string, PerceptualProfile>,
  defaultProfile: PerceptualProfile,
): PerceptualCatalogue {
  const entries: ProvenanceEntry[] = [];
  const uncovered: string[] = [];
  const seen = new Set<string>();
  const add = (id: string, value: number, known: boolean, status: ProvenanceEntry["status"], source: () => string) => {
    if (seen.has(id) || !known) { uncovered.push(id); return; }
    seen.add(id);
    entries.push({ id, value, status, source: source() });
  };

  const all: Array<[string, PerceptualProfile]> = [...Object.entries(profiles), [DEFAULT_ID, defaultProfile]];
  for (const [name, profile] of all) {
    const isDefault = name === DEFAULT_ID && profile === defaultProfile;
    const knownProfile = isDefault || (name !== DEFAULT_ID && Object.hasOwn(POPULATIONS, name));
    const status = isDefault ? "definition" : "hypothesis";
    for (const [key, value] of Object.entries(profile.barrierWeights)) {
      if (typeof value !== "number") continue;
      add(`perceptual.${name}.barrierWeights.${key}`, value, knownProfile && Object.hasOwn(BARRIERS, key), status,
        () => barrierSource(name, key, value));
    }
    const filter = profile.visualFilter as unknown as Record<string, unknown>;
    for (const [field, value] of Object.entries(filter)) {
      const leaves: Array<[string, unknown]> = Array.isArray(value)
        ? value.map((v, i) => [`${field}.${"rgb"[i] ?? i}`, v])
        : [[field, value]];
      for (const [leaf, v] of leaves) {
        if (typeof v !== "number") continue;
        add(`perceptual.${name}.visualFilter.${leaf}`, v, knownProfile && Object.hasOwn(FILTER_FIELDS, leaf), status,
          () => filterSource(name, leaf, v));
      }
    }
  }
  return { entries, uncovered };
}

const CATALOGUE = cataloguePerceptualProfiles(PERCEPTUAL_PROFILES, DEFAULT_PROFILE);

export const PERCEPTUAL_PROVENANCE: ProvenanceEntry[] = CATALOGUE.entries;

/** Numeric fields in the profiles this file cannot describe yet. Must be empty; the test says which. */
export const PERCEPTUAL_PROVENANCE_UNCOVERED: readonly string[] = CATALOGUE.uncovered;

/** The keys of the hand-written tables above, so the test can catch a stale one. */
export const PERCEPTUAL_PROVENANCE_KEYS = {
  barriers: Object.keys(BARRIERS),
  filterFields: Object.keys(FILTER_FIELDS),
  populations: Object.keys(POPULATIONS),
};
