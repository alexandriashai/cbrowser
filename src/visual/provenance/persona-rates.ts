/**
 * Each built-in persona's pointing and reading rate, as a share of the
 * reference rate: the r_p / r_ref a capacity c = r_p / (r_p + r_ref) is built
 * from (demand-laws.ts, rateCapacity). See ../model-provenance.ts for the
 * statuses.
 *
 * WHY ON THE PERSONA. Four personas state all five reading-profile values in
 * their accessibilityTraits, so the reading-profile table never reaches them,
 * and twenty get a throughput by interpolating on dispositions. A rate per
 * persona, registered here with its own status and source, is the one place
 * a decision about that persona's rate lands. A custom persona has no entry;
 * its rates come from the profiles (provenance/profiles.ts).
 *
 * The values follow the persona-rate decisions of 2026-10-23
 * (research/stage-b-persona-rates.md):
 *   pointing  tremor: the motion-impaired rate against its own controls;
 *             elderly (two personas): the elderly profile, a hypothesis;
 *             cognitive-adhd: the reference, a hypothesis (no measured rate);
 *             mobile-user: unchanged until touch is modelled;
 *             every other persona: the reference, "no measured difference".
 *   reading   dyslexic-user: the dyslexia rate against its own controls;
 *             low-vision-magnified, elderly-low-vision: low vision with intact
 *             central fields against the reference rate;
 *             aphasia-receptive: aphasia with impaired reading comprehension
 *             against age-matched controls (Webster et al. 2018, Stage C);
 *             elderly-user, cognitive-adhd: today's fixation-model slowdown,
 *             a hypothesis; intellectual-disability: its pre-21.0 share,
 *             frozen as a number, a hypothesis;
 *             every other persona: the reference, "no measured difference".
 *
 * A measured ratio is `published` only when the population and its control
 * were measured in the same study by the same method. The low-vision rate
 * against 238 wpm crosses methods (a peak rate on drifting text against a
 * meta-analytic silent reading rate), so it is a hypothesis built on two
 * published numbers. Ratios are computed here from the registered numbers they
 * come from, so the two cannot disagree; the bridge reads them through param()
 * (cognitive-models.ts), unrecorded, like the persona's catalogued traits.
 * tests/persona-capacity-rates.test.ts fails if a built-in persona has no
 * entry on a channel, or an entry names no built-in persona.
 *
 * CUSTOM PERSONAS (customRate.*) take the same rule as the built-ins, decided
 * 2026-10-23: the reference rate where nothing is measured ("no measured
 * difference"), a measured ratio where one is. The rule reads what a stored
 * custom persona carries: the tremor flag, and words in its name and
 * description (customPointingRule, customReadingRule; an elderly cue reads the
 * built-in elderly-user's reading entry). An author's stated
 * reading-profile values are honoured first, through the fixation-model
 * ratio (cognitive-models.ts, readingRateShare), labelled hypothesis.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { ProvenanceEntry, ProvenanceStatus } from "../model-provenance.js";
import { LAW_PROVENANCE } from "./laws.js";
import { PROFILE_PROVENANCE } from "./profiles.js";

type Channel = "pointing" | "reading";

const registered = (id: string): number => {
  const e = [...LAW_PROVENANCE, ...PROFILE_PROVENANCE].find((x) => x.id === id);
  if (!e) throw new Error(`persona-rates: ${id} is not registered`);
  return e.value;
};
const ratio = (rate: string, control: string): number => registered(rate) / registered(control);

/** The fixation model's per-word slowdown, as a rate share: the neurotypical profile's time over this profile's. */
const fixationRatio = (phonological: number, visualSpan: number): number => {
  const ms = (phon: number, span: number) => registered("profile.fixation.baseMs")
    + (1 - phon) * registered("profile.fixation.phonologicalMs")
    + (registered("profile.fixation.normalSpan") / span - 1) * registered("profile.fixation.spanMs");
  return ms(registered("profile.reading.neurotypical.phonological"), registered("profile.reading.neurotypical.visualSpan")) / ms(phonological, visualSpan);
};

const entry = (persona: string, channel: Channel, value: number, status: ProvenanceStatus, source: string): ProvenanceEntry =>
  ({ id: `personaRate.${persona}.${channel}`, value, status, source });

const NO_DIFFERENCE_POINTING = "No measured difference: no source retrieved measures a mouse throughput for this persona's population (or the persona is a behavioural archetype with no population) that differs from typical, so it points at the reference rate, law.rate.pointing.reference (ratio 1, c = 0.5). It replaced an interpolation on 0.6 proceduralFluency + 0.4 patience, dispositions that no source maps to throughput. An ISO 9241-9 mouse study of the population the persona stands for would set it.";
const NO_DIFFERENCE_READING = "No measured difference: no source retrieved measures a silent reading rate for this persona's population (or the persona is a behavioural archetype with no population) that differs from typical, so it reads at the reference rate, law.reading.wpm (ratio 1, c = 0.5). It replaced the fixation model's interpolation on 0.6 textProcessing + 0.4 comprehension toward the dyslexic profile, which no source supports. A silent reading study of the population the persona stands for would set it.";

const POINTING_NO_DIFFERENCE = [
  "power-user", "first-timer", "screen-reader-user", "impatient-user", "distracted-user", "careful-reader", "explorer",
  "task-focused", "low-vision-magnified", "dyslexic-user", "deaf-user", "color-blind-deuteranopia", "autism-spectrum",
  "intellectual-disability", "aphasia-receptive", "dyscalculia", "anxious-user", "confident-user", "emotional-user", "stoic-user",
];
const READING_NO_DIFFERENCE = [
  "power-user", "first-timer", "mobile-user", "screen-reader-user", "impatient-user", "distracted-user", "careful-reader",
  "explorer", "task-focused", "motor-impairment-tremor", "deaf-user", "color-blind-deuteranopia", "autism-spectrum",
  "dyscalculia", "anxious-user", "confident-user", "emotional-user", "stoic-user",
];

const ELDERLY_POINTING = "The elderly pointing profile, profile.pointing.elderly.throughput (3.2 bits/s) against law.rate.pointing.reference (4.9). No measured ISO mouse throughput for adults 65+ was found; Chaparro et al. (1999) support the direction (\"older adults took longer to complete movements than younger adults\") but give no rate. An ISO 9241-9 mouse study of adults 65+ would set it.";

const FIXATION_KEPT = (who: string, inputs: string, ms: string, why: string) =>
  `Today's fixation-model slowdown for ${who}, kept as a hypothesis: the text-independent per-word time at ${inputs} is ${ms}, against 270 ms for the neurotypical profile, so the persona reads at that share of the reference rate (law.reading.wpm). ${why} A silent reading rate of the population against matched controls would set or replace it.`;

// Stage C (21.0, research/stage-c-design.md 10.5): the cognitiveLoad text terms
// that charged these two personas' comprehension against text are retired, so
// their language deficit is priced here alone. The before and after are mean
// totalCTC on the reference set named, viewport and full_page.
const STAGE_C_SEARCH = " (also not by the one targeted PubMed search of 2026-10-23 for aphasia or intellectual disability with reading rate, reading speed or words per minute: 51 records; its one intellectual-disability record is of children, and an adult rate against controls appears in none)";
const STAGE_C_ONLY = (who: string, comprehension: string, viewport: string, fullPage: string) =>
  `Since Stage C (21.0) this share is the only place ${who}'s language-comprehension deficit is priced: the cognitiveLoad text terms that charged it through comprehension (${comprehension}, a UI-convention trait, not reading) are retired. On ctc-reference-v2-2026-10-24 (514 pages) its mean totalCTC moved ${viewport} at the viewport and ${fullPage} at full_page.`;

/** intellectual-disability's reading share before 21.0 (270 / 338 ms per word), frozen: see its entry. */
const ID_READING_BEFORE_21 = 0.7988165680473372;

export const PERSONA_RATE_PROVENANCE: ProvenanceEntry[] = [
  // ── Pointing ──
  entry("motor-impairment-tremor", "pointing", ratio("law.rate.pointing.motionImpaired", "law.rate.pointing.motionImpairedControls"), "published",
    "Motion-impaired mouse users measured against able-bodied controls in the same study, ISO 9241-9: 1.77 / 4.88 bits/s (law.rate.pointing.motionImpaired, law.rate.pointing.motionImpairedControls). Keates, Hwang, Langdon, Clarkson & Robinson (2002), read in Soukoreff & MacKenzie (2004), IJHCS 61, Table 4: \"1.77 69 Mouse (motion impared [sic])\" and \"4.88 11 Mouse (able-bodied)\". The group is motion-impaired users in general, not essential tremor specifically, at a 69% error rate."),
  entry("elderly-user", "pointing", ratio("profile.pointing.elderly.throughput", "law.rate.pointing.reference"), "hypothesis", ELDERLY_POINTING),
  entry("elderly-low-vision", "pointing", ratio("profile.pointing.elderly.throughput", "law.rate.pointing.reference"), "hypothesis", ELDERLY_POINTING),
  entry("cognitive-adhd", "pointing", 1, "hypothesis",
    "No measured difference, and no measured rate: no throughput for adults with ADHD was found, so the persona points at the reference rate (ratio 1). The 4.2 bits/s it carried cited Flapper, Houwen & Schoemaker (2006), Dev Med Child Neurol 48(3), 165-169: \"A group of 12 children with ADHD-DCD\", with no throughput, and a motor deficit there belongs to the coordination disorder. An ISO 9241-9 mouse study of adults with ADHD and no coordination disorder would set it."),
  entry("mobile-user", "pointing", 3.444 / 4.9, "hypothesis",
    "Unchanged until touch is modelled: the 3.444 bits/s that getPointingProfile's interpolation gave the persona (0.6 x 0.6 proceduralFluency + 0.4 x 0.3 patience between 4.9 and 2.1) before the tremor anchor moved, as a share of 4.9. A mouse throughput is the wrong measure for a finger; MacKenzie (2015) reports touch throughput but no regression, so no touch path exists to set it from. A touch pointing model with a measured rate would replace it."),
  ...POINTING_NO_DIFFERENCE.map((p) => entry(p, "pointing", 1, "hypothesis", NO_DIFFERENCE_POINTING)),

  // ── Reading ──
  entry("dyslexic-user", "reading", ratio("law.rate.reading.dyslexiaAdults", "law.rate.reading.dyslexiaControls"), "published",
    "Students with dyslexia measured against controls in the same study, silent text reading: 184.63 / 243.64 wpm (law.rate.reading.dyslexiaAdults, law.rate.reading.dyslexiaControls). Callens, Tops & Brysbaert (2012), PLoS ONE 7(6), e38081, Table 5, row \"Silent text reading (Tekenbeet)\": \"a group of 100 Dutch-speaking students diagnosed with dyslexia with a control group of 100 students without learning disabilities\". Dutch text; higher-education students are the more able end of adult dyslexia. A second source agrees in direction and size: Franzen, Stark & Johnson (2021), Individuals with dyslexia use a different visual sampling strategy to read text, Scientific Reports 11, 6449, doi:10.1038/s41598-021-84945-9: \"a lower words per minute reading rate among readers with dyslexia (Median Dyslexia = 178.09, Median Control = 248.18\", 67 adults reading silently, a ratio of 0.718 against Callens' 0.758."),
  ...["low-vision-magnified", "elderly-low-vision"].map((p) => entry(p, "reading", ratio("law.rate.reading.lowVisionIntactFields", "law.reading.wpm"), "hypothesis",
    "Low vision with intact central fields, 130 wpm median peak (law.rate.reading.lowVisionIntactFields; Legge, Rubin, Pelli & Schleske 1985, Vision Research 25(2): \"peak reading rates for observers with intact central fields were at least 90 words/minute (median 130 words/minute)\"), against the reference 238 wpm. Both numbers are published; the ratio is not, because it crosses methods (a peak rate at the best character size on drifting text against a silent reading rate) and the same-method normal-vision rate was not retrieved. Intact fields rather than central-field loss (25 wpm) was decided for both low-vision personas. Legge et al.'s normal-vision peak rate on the same apparatus would set it.")),
  entry("elderly-user", "reading", fixationRatio(0.65, 5), "hypothesis",
    FIXATION_KEPT("elderly-user", "the elderly reading profile (phonological 0.65, visualSpan 5)", "317 ms", "No silent-reading norm for adults 65+ was found; Brysbaert (2019) reports that the drop \"is not expected to occur before the age of 60–65\", with no rate. Custom personas cued elderly or 65+ read at this same entry (decided 2026-10-23).")),
  entry("cognitive-adhd", "reading", fixationRatio(0.75, 6), "hypothesis",
    FIXATION_KEPT("cognitive-adhd", "its stated reading traits (phonologicalDecoding 0.75, visualSpan 6)", "288.3 ms", "No measured silent-reading rate for adults with ADHD was found.")),
  entry("intellectual-disability", "reading", ID_READING_BEFORE_21, "hypothesis",
    `No adult reading rate found; the value is the pre-21.0 one, frozen as a number (decided 2026-10-23). Through 20.x it was the fixation model's slowdown at the profile getReadingProfile interpolated from comprehension 0.2 (phonological 0.44, visualSpan 5: 338 ms per word against the neurotypical profile's 270 ms, a share of 270 / 338). getReadingProfile no longer reads comprehension, a UI-convention trait, so the share is kept as it was rather than recomputed from a profile nothing now produces. No reading rate for adults with intellectual disability was retrieved${STAGE_C_SEARCH}. ${STAGE_C_ONLY("intellectual-disability", "0.2", "0.855 -> 0.643", "0.837 -> 0.661")} A silent reading rate of adults with mild intellectual disability against matched controls would set or replace it.`),
  entry("aphasia-receptive", "reading", ratio("law.rate.reading.aphasiaControlsSeconds", "law.rate.reading.aphasiaReadingImpairedSeconds"), "published",
    "People with aphasia whose reading comprehension is impaired, measured against age-matched controls in the same study by the same method: 30 / 71 seconds for the same paragraph (law.rate.reading.aphasiaControlsSeconds, law.rate.reading.aphasiaReadingImpairedSeconds), a reading-rate share of 0.423, c = 0.297. Webster, Morris, Howard & Garraffa (2018), AJSLP 27(1S), 423-437. Found by the one targeted PubMed search of 2026-10-23 (aphasia or intellectual disability with reading rate, reading speed or words per minute; 51 records). The group is post-stroke aphasia whose comprehension accuracy fell below the controls' 5th percentile, the closest measured group to receptive aphasia; the study does not classify aphasia type. Those without a measured reading impairment took 55 seconds (share 0.545). Until 21.0 the share was the fixation model's 0.804, interpolated from comprehension 0.25, a UI-convention trait. Since Stage C this share is the only place the persona's language-comprehension deficit is priced: the cognitiveLoad text terms that charged it through comprehension are retired."),
  ...READING_NO_DIFFERENCE.map((p) => entry(p, "reading", 1, "hypothesis", NO_DIFFERENCE_READING)),
];

// ── Custom personas: one entry per rule ──

const custom = (rule: string, channel: Channel, value: number, status: ProvenanceStatus, source: string): ProvenanceEntry =>
  ({ id: `customRate.${rule}.${channel}`, value, status, source });

export const CUSTOM_RATE_PROVENANCE: ProvenanceEntry[] = [
  custom("tremor", "pointing", ratio("law.rate.pointing.motionImpaired", "law.rate.pointing.motionImpairedControls"), "published",
    "A custom persona with the tremor flag (accessibilityTraits.tremor, which the creation tool also sets for motor, arthritis, dexterity and mobility words) or tremor or Parkinson in its name or description: the motion-impaired rate against its same-study controls, 1.77 / 4.88 bits/s (Keates et al. 2002, in Soukoreff & MacKenzie 2004, Table 4), as for motor-impairment-tremor."),
  custom("elderly", "pointing", ratio("profile.pointing.elderly.throughput", "law.rate.pointing.reference"), "hypothesis",
    `A custom persona whose name or description says elderly, senior, aging or older adult, or whose age range starts at 65 or above: the elderly profile, as for the built-in elderly personas. ${ELDERLY_POINTING}`),
  custom("noMeasuredDifference", "pointing", 1, "hypothesis", `A custom persona with no tremor flag and no elderly cue. ${NO_DIFFERENCE_POINTING}`),
  custom("dyslexia", "reading", ratio("law.rate.reading.dyslexiaAdults", "law.rate.reading.dyslexiaControls"), "published",
    "A custom persona with dyslexia in its name or description and no stated reading-profile values: students with dyslexia against same-study controls, 184.63 / 243.64 wpm (Callens, Tops & Brysbaert 2012, PLoS ONE 7(6), e38081, Table 5), as for dyslexic-user."),
  custom("lowVision", "reading", ratio("law.rate.reading.lowVisionIntactFields", "law.reading.wpm"), "hypothesis",
    "A custom persona with low vision, magnification, visual impairment, partial sight, vision loss, macular degeneration or glaucoma in its name or description and no stated reading-profile values: low vision with intact central fields, 130 wpm median peak (Legge, Rubin, Pelli & Schleske 1985) against the reference 238 wpm, as for the built-in low-vision personas. The ratio crosses methods; Legge et al.'s normal-vision peak rate on the same apparatus would set it. \"Blind\" is not a low-vision word: a blind reader does not read print."),
  custom("noMeasuredDifference", "reading", 1, "hypothesis", `A custom persona with no stated reading-profile values and no dyslexia or low-vision cue. ${NO_DIFFERENCE_READING}`),
];

const LOW_VISION_WORDS = /low.?vision|magnif|visual(ly)?.?impair|partial(ly)?.?sight|vision.?loss|macular|glaucoma/;
const ELDERLY_WORDS = /elderly|senior|aging|older.?adult/;

/** An elderly cue: the words in name or description, or an age range starting at 65 or above. */
function isElderly(text: string, ageRange: string | undefined): boolean {
  return ELDERLY_WORDS.test(text) || /^\s*(6[5-9]|[7-9]\d|1\d\d)/.test(ageRange ?? "");
}

/** Which customRate.* pointing rule a custom persona falls under. */
export function customPointingRule(p: { name?: string; description?: string; tremor?: unknown; ageRange?: string }): "tremor" | "elderly" | "noMeasuredDifference" {
  const text = `${p.name ?? ""} ${p.description ?? ""}`.toLowerCase();
  if (p.tremor === true || /tremor|parkinson/.test(text)) return "tremor";
  if (isElderly(text, p.ageRange)) return "elderly";
  return "noMeasuredDifference";
}

/** Which reading rule a custom persona with no stated reading-profile values falls under. */
export function customReadingRule(p: { name?: string; description?: string; ageRange?: string }): "dyslexia" | "lowVision" | "elderly" | "noMeasuredDifference" {
  const text = `${p.name ?? ""} ${p.description ?? ""}`.toLowerCase();
  if (/dyslexi/.test(text)) return "dyslexia";
  if (LOW_VISION_WORDS.test(text)) return "lowVision";
  if (isElderly(text, p.ageRange)) return "elderly";
  return "noMeasuredDifference";
}

/**
 * The registry id a reading rule reads. An elderly cue reads the built-in
 * elderly-user's own entry (personaRate.elderly-user.reading, the fixation-model
 * hypothesis), decided 2026-10-23 so a custom elderly persona reads as the
 * built-in one does; the others their customRate.* entry.
 */
export function customReadingRateId(rule: ReturnType<typeof customReadingRule>): string {
  return rule === "elderly" ? "personaRate.elderly-user.reading" : `customRate.${rule}.reading`;
}

/**
 * A persona's silent reading rate for display, wpm: 238 x its registered
 * reading share, rounded. For the humanBehavior.timing.readingSpeed a persona
 * carries, which personas.ts sets at load and so cannot read through param()
 * (model-provenance.ts imports the persona tables); tests hold it equal to the
 * param() value.
 */
export function displayReadingWpm(rateId: string): number {
  return Math.round(registered("law.reading.wpm") * [...PERSONA_RATE_PROVENANCE, ...CUSTOM_RATE_PROVENANCE].find((e) => e.id === rateId)!.value);
}
