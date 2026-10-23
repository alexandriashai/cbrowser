/**
 * Provenance catalogue for the built-in personas' trait values
 * (personas.ts: BUILTIN_PERSONAS, ACCESSIBILITY_PERSONAS, EMOTIONAL_PERSONAS).
 * See ../model-provenance.ts for the statuses.
 *
 * CATALOGUED, NOT READ THROUGH param(). Every other provenance group is read
 * by id at the point of use. These are not: the chain and the distance take a
 * persona's traits from the persona object, and rewriting personas.ts to read
 * each of its numbers by id would bury the profiles it exists to make
 * readable. So the entries are built FROM the persona objects at module load.
 * The value here is the value the tools run on and cannot drift from it; what
 * the registry adds is the status and the source. No code reads a `persona.`
 * id through param(), so a recording will not contain one, and a check for
 * registered ids that are never read must leave this prefix out.
 * tests/persona-provenance.test.ts fails if a numeric trait in personas.ts has
 * no entry or two, if a value differs from the source text, or if a persona or
 * trait name appears that this file has no population or measure for.
 *
 * Every value is a `hypothesis`. All but the norm-anchored ones (NORM_ANCHORS
 * below) were set by hand on a scale that no instrument defines (0-1 for all
 * but visualSpan and contrastSensitivity, which have units). For those,
 * personas.ts cites research in three ways, and none of them is a
 * measurement of a value:
 *   - construct references. trait-reference.ts names a source per trait
 *     (Bandura for selfEfficacy, the Brief Resilience Scale for resilience),
 *     and personas.ts tags values with the same names, e.g. "(Bandura)". These
 *     say what the scale means, not where a persona sits on it.
 *   - a finding cited beside one value, e.g. dyslexic-user.workingMemory cites
 *     de Jong 2006 and PMC3496727. That is evidence for the DIRECTION of the
 *     persona's difference from typical, not for the number. Each such entry
 *     names its citation and what it was cited for.
 *   - a persona-level research note, e.g. the tremor prevalence on
 *     motor-impairment-tremor. It supports the persona's design, not any trait
 *     value, and is named in each of that persona's entries.
 * A norm-anchored value is the percentile a published population mean
 * implies on a normed instrument (paper section 3.1.1); its entry names that
 * source and its interval, and it stays a hypothesis because mapping the
 * instrument onto the trait is cbrowser's choice.
 *
 * What would test a value: the measure named per trait, given to a sample of
 * the persona's population, with a 0-1 value compared as that sample's mean
 * percentile against a general-population norm in the direction of the
 * scale's high end. The scale has no other anchor, so fixing that mapping is
 * the first step of any test. Five built-in personas are behavioural
 * archetypes (impatient-user, distracted-user, careful-reader, explorer,
 * task-focused) with no population until a screening criterion defines one,
 * and their entries say so.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { ProvenanceEntry } from "../model-provenance.js";
import { BUILTIN_PERSONAS, ACCESSIBILITY_PERSONAS, EMOTIONAL_PERSONAS } from "../../personas.js";
import { TRAIT_DEFINITIONS } from "../../trait-reference.js";
import { _normalCDF as Phi } from "../cognitive-models.js";

/** The persona tables this catalogue covers, by the name personas.ts exports them under. */
export const PERSONA_TABLES = { BUILTIN_PERSONAS, ACCESSIBILITY_PERSONAS, EMOTIONAL_PERSONAS };

/** The two trait groups whose numeric values are catalogued. */
export const TRAIT_GROUPS = ["cognitiveTraits", "accessibilityTraits"] as const;

/** Traits measured in their own units rather than on a 0-1 scale. */
const UNIT_TRAITS: Record<string, string> = {
  visualSpan: "characters per fixation",
  contrastSensitivity: "a multiplier of the normal contrast threshold (1-5x)",
};

/** Per trait: the measure that would place a population on the trait's scale. */
const MEASURES: Record<string, string> = {
  // Cognitive traits (scale anchors in trait-reference.ts)
  patience: "time to abandonment under injected load delays and repeated failures in a usability task",
  riskTolerance: "the rate of clicking unlabelled or ambiguous controls in a usability task, or a risk-taking scale such as DOSPERT",
  comprehension: "a UI-convention recognition test (what icons, menus and gestures do)",
  persistence: "retries of the same approach before switching or abandoning on a task with a failing step",
  curiosity: "the share of actions spent on elements off the task path, or a trait scale such as the Curiosity and Exploration Inventory",
  workingMemory: "a complex span task (e.g. operation span) or n-back",
  readingTendency: "the eye-tracked share of body text fixated before acting",
  resilience: "the Brief Resilience Scale",
  selfEfficacy: "a computer self-efficacy scale",
  satisficing: "the Maximization Scale (reverse-scored), or options inspected before choosing",
  trustCalibration: "acceptance of true versus false claims in a web-credibility judgement task",
  interruptRecovery: "resumption lag after a scripted interruption",
  informationForaging: "link-choice accuracy on information-scent navigation tasks",
  changeBlindness: "the miss rate in a flicker change-detection task on interface screenshots",
  anchoringBias: "the anchoring effect size in an estimation or price-judgement task",
  timeHorizon: "a delay-discounting rate (e.g. the Monetary Choice Questionnaire)",
  attributionStyle: "the internality dimension of an attributional-style questionnaire, applied to technology failures",
  metacognitivePlanning: "the planning subscale of the Metacognitive Awareness Inventory, or planning time before a multi-step task",
  proceduralFluency: "step-order errors on a scripted multi-step procedure",
  transferLearning: "time saved on a second, unfamiliar interface after learning a first",
  authoritySensitivity: "choice shift toward official-looking cues in a controlled choice task",
  emotionalContagion: "the Emotional Contagion Scale",
  fearOfMissingOut: "the Fear of Missing Out scale, or choice shift under scarcity and urgency cues",
  socialProofSensitivity: "choice shift toward review counts and ratings in a controlled choice task",
  mentalModelFlexibility: "a task-switching cost, or perseverative errors in a card-sorting task",
  // Accessibility traits (scales documented on AccessibilityTraits in types.ts)
  motorControl: "pointing throughput on an ISO 9241-411 multi-directional tapping task",
  reachability: "the share of screen area reachable in a reach test on the persona's device",
  visionLevel: "visual acuity (logMAR), mapped to the scale's anchors (0 blind, 0.5 low vision, 1 sighted)",
  contrastSensitivity: "Pelli-Robson contrast sensitivity, expressed as the ratio of the sample's contrast threshold to the normal-vision threshold",
  processingSpeed: "a processing-speed test such as the Symbol Digit Modalities Test",
  attentionSpan: "a continuous performance test of sustained attention",
  orthographicFluency: "sight-word reading efficiency (e.g. TOWRE)",
  phonologicalDecoding: "nonword decoding efficiency (e.g. TOWRE phonemic decoding)",
  visualSpan: "a visual-span profile from letter-trigram recognition",
  vocabularyBreadth: "a receptive vocabulary test",
  crowdingSensitivity: "critical spacing for letter crowding relative to typical readers",
  fatigueSusceptibility: "the performance decrement across a long session (time-on-task slope)",
};

/**
 * Per persona: the population a test sample would be drawn from. An archetype
 * is defined by the behaviour its traits describe, so it is marked as such
 * with the screening criterion that would turn it into a population.
 */
const POPULATIONS: Record<string, { population: string } | { archetype: string }> = {
  "power-user": { population: "expert daily web users (e.g. professional developers) aged 25-45" },
  "first-timer": { population: "adults using the interface under test for the first time" },
  "mobile-user": { population: "smartphone-primary web users aged 18-45" },
  "screen-reader-user": { population: "blind adults who use a screen reader daily" },
  "elderly-user": { population: "adults aged 65 and over" },
  "impatient-user": { archetype: "users in the top quartile of observed abandonment rate" },
  "distracted-user": { archetype: "users in the top quartile of observed task switching" },
  "careful-reader": { archetype: "users in the top quartile of reading time before acting" },
  "explorer": { archetype: "users in the top quartile of off-path clicks" },
  "task-focused": { archetype: "users in the bottom quartile of off-path clicks" },
  "motor-impairment-tremor": { population: "adults aged 40-65 with essential tremor" },
  "low-vision-magnified": { population: "adults aged 45-75 with low vision who use about 3x screen magnification" },
  "cognitive-adhd": { population: "adults aged 18-45 diagnosed with ADHD" },
  "dyslexic-user": { population: "adults aged 18-55 diagnosed with dyslexia" },
  "deaf-user": { population: "deaf adults" },
  "elderly-low-vision": { population: "adults aged 75 and over with age-related low vision" },
  "color-blind-deuteranopia": { population: "adults with confirmed deuteranopia" },
  "autism-spectrum": { population: "autistic adults aged 18-45 without intellectual disability, the group the persona's spectrum note describes" },
  "intellectual-disability": { population: "adults aged 18-55 with mild intellectual disability" },
  "aphasia-receptive": { population: "adults aged 35-75 with receptive aphasia" },
  "dyscalculia": { population: "adults aged 18-55 with diagnosed dyscalculia" },
  "anxious-user": { population: "adults high in trait anxiety on the State-Trait Anxiety Inventory, the instrument the persona names" },
  "confident-user": { population: "adults high in computer self-efficacy" },
  "emotional-user": { population: "adults high on the Affect Intensity Measure, the instrument the persona names" },
  "stoic-user": { population: "adults high in cognitive reappraisal (e.g. on the Emotion Regulation Questionnaire)" },
};

/** Persona-level research notes in personas.ts. They support the persona's design, not a trait value. */
const PERSONA_NOTES: Record<string, string> = {
  "motor-impairment-tremor": "essential tremor prevalence 0.4-5.6% (npj Digital Medicine 2019) and 1-15 Hz tremor filtering",
  "cognitive-adhd": "75-81% of ADHD cases showing central-executive working-memory impairment (Kofler et al. 2020, Neuropsychology, PMC7483636; children aged 8-13)",
  "dyslexic-user": "dyslexic adults reading about 178 vs 248 words per minute (Scientific Reports 2021)",
  "elderly-low-vision": "memory loss in over a third of people over 70 (ScienceDaily 2025), faster decline after 70 (Nature Communications 2026) and an unnamed PMC review on inhibitory control",
  "autism-spectrum": "Yaneva et al. eye tracking (2018, Behaviour & Information Technology; 2020, W4A) and the AASPIRE guidelines (Raymaker/Nicolaidis 2019)",
  "intellectual-disability": "Karreman, van der Geest & Buursink (2007), Rocha et al. (2015, PMC4467236) and the W3C COGA Down Syndrome module",
  "aphasia-receptive": "the W3C COGA aphasia module, Brandenburg et al. (PMC12336571) and Roper's usability testing",
  "dyscalculia": "the W3C COGA dyscalculia module, the UK Government Design System (2022), the UK Accessibility Blog (2025) and a 3-7% prevalence (Butterworth 2005, Science)",
  "anxious-user": "the State-Trait Anxiety Inventory (Spielberger 1983) and Grupe & Nitschke (2013)",
  "confident-user": "Self-Efficacy Theory (Bandura 1977)",
  "emotional-user": "the Affect Intensity Measure (Larsen & Diener 1987)",
  "stoic-user": "emotion regulation (Gross 2002) and Pigliucci (2017)",
};

interface ValueCitation {
  /** The source as personas.ts names it. */
  cite: string;
  /** What personas.ts cites it for, in its own terms. */
  claim: string;
  /** Anything about the value the citation does not square with. */
  note?: string;
}

const READING_TRAITS = ["orthographicFluency", "phonologicalDecoding", "visualSpan", "vocabularyBreadth", "crowdingSensitivity"];
const readingProfile = (persona: string, cite: string, claim: string): Record<string, ValueCitation> =>
  Object.fromEntries(READING_TRAITS.map((t) => [`${persona}.${t}`, {
    cite,
    claim: `${claim}; the five reading values are the ones getReadingProfile returned for this persona by name before they became traits`,
  }]));
const DYSLEXIA_COMPENSATION = "the compensation literature cited at dyslexic-user.patience (Annals of Dyslexia, 10.1007/s11881-020-00195-w)";

/**
 * Citations personas.ts places beside a single value, keyed `<persona>.<trait>`.
 * Only comments that name a source are listed; construct tags such as
 * "(Bandura)" and claims marked "documented" with no source are not.
 */
const VALUE_CITATIONS: Record<string, ValueCitation> = {
  "screen-reader-user.riskTolerance": {
    cite: "Information Wayfinding of Screen Reader Users (ASSETS 2024, 10.1145/3663548.3688539) and Context-Aware Guidance for Screen Reader Users (CHI 2026, 10.1145/3772318.3790661)",
    claim: "cautious exploration to avoid disorientation, the low end of this scale",
  },
  "elderly-user.proceduralFluency": {
    cite: "Fisk et al. 2009, Designing for Older Adults",
    claim: "a speed-accuracy tradeoff that shifts toward accuracy with age; personas.ts calls 0.5 a reasoned midpoint",
  },
  "motor-impairment-tremor.selfEfficacy": { cite: "Lorig et al. 2001 (Chronic Disease Self-Management)", claim: "motor impairment and self-efficacy" },
  "motor-impairment-tremor.satisficing": { cite: "Kool et al. 2010 (effort discounting)", claim: "physical effort increasing satisficing" },
  "motor-impairment-tremor.interruptRecovery": { cite: "Mark's interruption research", claim: "motor issues making resumption harder, with adaptation helping" },
  ...readingProfile("low-vision-magnified", "Legge et al. 2007", "central scotoma and crowding"),
  "low-vision-magnified.selfEfficacy": { cite: "Brody et al. 2002 (AMD and depression)", claim: "reduced vision correlating with lower confidence in task completion" },
  "low-vision-magnified.satisficing": {
    cite: "Pachur & Hertwig 2006 (J Exp Psychol Learn Mem Cogn 32(5):983-1002)",
    claim: "limited information access increasing satisficing",
    note: "the paper studies recognition-based inference, which is faster and more prevalent under time pressure; it is not a study of low vision or of satisficing, so it supports the direction only by analogy. Until 21.0 the value was 0.4, on the opposite side from the cited direction",
  },
  "low-vision-magnified.trustCalibration": { cite: "Brody 2002", claim: "vision impairment increasing caution" },
  "low-vision-magnified.interruptRecovery": { cite: "Mark's interruption research", claim: "a limited visible area making context recovery harder" },
  ...readingProfile("cognitive-adhd", "Dhar et al. 2010", "intact decoding with reduced sustained attention"),
  ...readingProfile("dyslexic-user", "Perry, Zorzi & Ziegler 2019 (Psychological Science)", "the dyslexic reading profile"),
  "dyslexic-user.workingMemory": { cite: "de Jong 2006 and an n-back fNIRS study (PMC3496727)", claim: "a working-memory deficit that persists into adulthood" },
  "dyslexic-user.patience": { cite: "Annals of Dyslexia, 10.1007/s11881-020-00195-w", claim: "slower reading as a compensatory mechanism" },
  "dyslexic-user.persistence": { cite: DYSLEXIA_COMPENSATION, claim: "compensatory strategies built and sustained across schooling" },
  "dyslexic-user.informationForaging": { cite: DYSLEXIA_COMPENSATION, claim: "text-structure use as a compensator" },
  "dyslexic-user.resilience": {
    cite: "Kapur & Agrawal 2026",
    claim: "secondary anxiety in dyslexia pulling the value down from 0.6, held at neutral by the compensation literature",
    note: "until 21.0 the value was 0.6, the value the comment says it was pulled down from",
  },
  "dyslexic-user.selfEfficacy": { cite: "PMC11488781 (Nigerian undergraduate cohort)", claim: "dyslexia predicting lower academic self-efficacy" },
  "dyslexic-user.attributionStyle": { cite: "Kapur & Agrawal 2026", claim: "psychoeducation reducing self-blame, which places the untreated baseline above neutral" },
  "elderly-low-vision.vocabularyBreadth": {
    cite: "Rayner et al. 2006",
    claim: "vocabulary growing across the lifespan, so the elderly reading profile's value is kept over low vision's",
  },
  "elderly-low-vision.workingMemory": { cite: "an unnamed PMC review (the persona note)", claim: "inhibitory-control decline limiting working memory" },
  "color-blind-deuteranopia.changeBlindness": { cite: "MDPI 13/2/53 (a simulated-interface study)", claim: "a state change signalled by colour alone being invisible without a second cue" },
  "dyscalculia.workingMemory": { cite: "PMC8946289 (numerical activities of daily living)", claim: "working memory underpinning number processing, with math anxiety reducing it further" },
};

/**
 * A value set to its norm-implied value (paper section 3.1.1): the
 * percentile, in the instrument's typical reference, of the persona
 * population's mean, Phi(z) with z = (population mean - reference mean) /
 * reference SD. A cell is here only if the source's 95% interval excluded the
 * old value and all three of these held: the instrument measures the trait as
 * trait-reference.ts defines it, the sample's age matches the persona's, and
 * the 95% CI was read in the source. Every cell
 * considered, and why each other one did not qualify, is listed in
 * research/persona-norms/applied.md.
 *
 * The status stays `hypothesis`. The source measured the population on its
 * instrument; that the instrument measures this trait is cbrowser's mapping.
 * personas.ts holds Phi(z) to two decimals, and the test recomputes it from z.
 */
export interface NormAnchor {
  /** The source, as retrieved. */
  cite: string;
  /** Where the number is printed in the source, and the number as printed. */
  reported: string;
  /** Population minus reference in reference SDs, with the source's 95% CI. */
  z: number;
  zLo: number;
  zHi: number;
  /** The value before 21.0 and what personas.ts cited it to. */
  replaced: string;
  /** What the value does not settle about the source. */
  note?: string;
}

/** Norm-anchored values, keyed `<persona>.<trait>`. */
export const NORM_ANCHORS: Record<string, NormAnchor> = {
  "cognitive-adhd.workingMemory": {
    cite: "Wilson AC 2024, Cognitive profile in autism and ADHD: a meta-analysis of performance on the WAIS-IV and WISC-V, Arch Clin Neuropsychol 39(4):498-515, doi 10.1093/arclin/acad073, PMC11110614",
    reported: "Table 5, adults with ADHD on the WAIS-IV (scored to a norm of mean 100, SD 15): Working Memory Index mean 95.2, 95% CI 92.5-98.0; five samples, mean age 29",
    z: (95.2 - 100) / 15,
    zLo: (92.5 - 100) / 15,
    zHi: (98.0 - 100) / 15,
    replaced: "0.3, cited to Kofler et al. 2020 (Neuropsychology 34(6):686-698, PMC7483636; d = 1.63-2.03), whose 172 participants are children aged 8-13; that study now gives the direction only",
    note: "two of the five adult rows in Wilson's Table 3 (Baggio et al. 2020, Shepler & Callan 2022, n = 66 each) are identical in every cell and may be one sample counted twice. The Working Memory Index is Digit Span plus Arithmetic, so it also loads on arithmetic",
  },
  "autism-spectrum.workingMemory": {
    cite: "Habib A, Harris L, Pollick F, Melville C 2019, A meta-analysis of working memory in individuals with autism spectrum disorders, PLoS One 14(4):e0216198, doi 10.1371/journal.pone.0216198, PMC6490940",
    reported: "Table 6, visuospatial working-memory accuracy, adult subgroup: k = 4, SMD -0.47, 95% CI -0.91 to -0.03, against typically developed controls matched on age and IQ, every participant at IQ 70 or above",
    z: -0.47,
    zLo: -0.91,
    zHi: -0.03,
    replaced: "0.6, cited to Happé & Frith 2006 for detail-oriented processing (\"working memory often good\"), which both of Habib's adult estimates exclude",
    note: "the adult phonological estimate is lower (Table 3: d = -0.79, 95% CI -1.53 to -0.04, value 0.21), and the smaller deficit is used. Wilson 2024 (Table 5) puts autistic adults at a WAIS-IV Working Memory Index of 92.9 (95% CI 83.5-102.3), which is also 0.32, but its pool includes a sample with mean FSIQ 51.3, outside this persona's population",
  },
};

/** A persona as the catalogue sees it: only the two trait groups matter. */
type PersonaLike = { cognitiveTraits?: object; accessibilityTraits?: object };

export interface PersonaCatalogue {
  entries: ProvenanceEntry[];
  /** Ids of numeric traits that could not be described (unknown persona or trait name, or a duplicate). */
  uncovered: string[];
}

function sourceFor(persona: string, trait: string, value: number): string {
  const parts: string[] = [];
  const unit = UNIT_TRAITS[trait];
  const anchor = NORM_ANCHORS[`${persona}.${trait}`];
  if (anchor) {
    const f = (x: number) => x.toFixed(3);
    parts.push(`${persona}.${trait} = ${value}, norm-anchored (paper section 3.1.1): the percentile, in the instrument's typical reference, of this persona population's mean.`);
    parts.push(`Source: ${anchor.cite}. ${anchor.reported}. That is z = ${f(anchor.z)} (95% CI ${f(anchor.zLo)} to ${f(anchor.zHi)}), so Phi(z) = ${f(Phi(anchor.z))}, interval ${f(Phi(anchor.zLo))}-${f(Phi(anchor.zHi))}.`);
    parts.push(`Still a hypothesis: the source measured this population on its instrument, and that the instrument measures ${trait} as trait-reference.ts defines it is cbrowser's mapping${anchor.note ? `; ${anchor.note}` : ""}.`);
    parts.push(`Until 21.0 the value was ${anchor.replaced}.`);
  } else {
    parts.push(`${persona}.${trait} = ${value}, set by hand${unit ? ` in ${unit}` : " on a 0-1 scale no instrument defines"}.`);
  }

  const construct = (TRAIT_DEFINITIONS as Record<string, { research?: string }>)[trait]?.research;
  if (construct) parts.push(`The scale's construct source in trait-reference.ts is ${construct}; it defines the scale, not this persona's place on it.`);

  const cited = VALUE_CITATIONS[`${persona}.${trait}`];
  if (cited) {
    parts.push(`Cited beside the value in personas.ts: ${cited.cite}, for ${cited.claim}. That is a finding about direction, not a measurement of ${value}${cited.note ? `; ${cited.note}` : ""}.`);
  }

  const note = PERSONA_NOTES[persona];
  if (note) parts.push(`The persona's research note cites ${note}; that supports the persona's design, not this value.`);

  const who = POPULATIONS[persona];
  const measure = MEASURES[trait];
  const compare = unit ? "compared directly in that unit" : "as the sample's mean percentile against a general-population norm";
  if ("population" in who) {
    parts.push(`What would test it: ${measure}, in a sample of ${who.population}, ${compare}.`);
  } else {
    parts.push(`This persona is a behavioural archetype with no population yet; a screening criterion (e.g. ${who.archetype}) would define one. What would then test it: ${measure}, in that sample, ${compare}.`);
  }
  return parts.join(" ");
}

/**
 * Build one entry per numeric trait value in the given persona tables. A value
 * whose persona or trait name this file has no population or measure for is
 * reported as uncovered instead of registered, so the test fails rather than
 * the module.
 */
export function cataloguePersonaTraits(tables: Record<string, Record<string, PersonaLike>>): PersonaCatalogue {
  const entries: ProvenanceEntry[] = [];
  const uncovered: string[] = [];
  const seen = new Set<string>();
  for (const table of Object.values(tables)) {
    for (const [persona, def] of Object.entries(table)) {
      for (const group of TRAIT_GROUPS) {
        const traits = def[group] as Record<string, unknown> | undefined;
        if (!traits) continue;
        for (const [trait, value] of Object.entries(traits)) {
          if (typeof value !== "number") continue;
          const id = `persona.${persona}.${trait}`;
          if (seen.has(id) || !POPULATIONS[persona] || !MEASURES[trait]) {
            uncovered.push(id);
            continue;
          }
          seen.add(id);
          entries.push({ id, value, status: "hypothesis", source: sourceFor(persona, trait, value) });
        }
      }
    }
  }
  return { entries, uncovered };
}

const CATALOGUE = cataloguePersonaTraits(PERSONA_TABLES as unknown as Record<string, Record<string, PersonaLike>>);

export const PERSONA_PROVENANCE: ProvenanceEntry[] = CATALOGUE.entries;

/** Numeric traits in personas.ts this file cannot describe yet. Must be empty; the test says which. */
export const PERSONA_PROVENANCE_UNCOVERED: readonly string[] = CATALOGUE.uncovered;

/** The keys of the hand-written tables above, so the test can catch a stale one. */
export const PERSONA_PROVENANCE_KEYS = {
  populations: Object.keys(POPULATIONS),
  notes: Object.keys(PERSONA_NOTES),
  valueCitations: Object.keys(VALUE_CITATIONS),
  normAnchors: Object.keys(NORM_ANCHORS),
  measures: Object.keys(MEASURES),
};
