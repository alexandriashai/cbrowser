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
 *             elderly-user, cognitive-adhd, intellectual-disability,
 *             aphasia-receptive: today's fixation-model slowdown, a hypothesis;
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
    "Students with dyslexia measured against controls in the same study, silent text reading: 184.63 / 243.64 wpm (law.rate.reading.dyslexiaAdults, law.rate.reading.dyslexiaControls). Callens, Tops & Brysbaert (2012), PLoS ONE 7(6), e38081, Table 5, row \"Silent text reading (Tekenbeet)\": \"a group of 100 Dutch-speaking students diagnosed with dyslexia with a control group of 100 students without learning disabilities\". Dutch text; higher-education students are the more able end of adult dyslexia."),
  ...["low-vision-magnified", "elderly-low-vision"].map((p) => entry(p, "reading", ratio("law.rate.reading.lowVisionIntactFields", "law.reading.wpm"), "hypothesis",
    "Low vision with intact central fields, 130 wpm median peak (law.rate.reading.lowVisionIntactFields; Legge, Rubin, Pelli & Schleske 1985, Vision Research 25(2): \"peak reading rates for observers with intact central fields were at least 90 words/minute (median 130 words/minute)\"), against the reference 238 wpm. Both numbers are published; the ratio is not, because it crosses methods (a peak rate at the best character size on drifting text against a silent reading rate) and the same-method normal-vision rate was not retrieved. Intact fields rather than central-field loss (25 wpm) was decided for both low-vision personas. Legge et al.'s normal-vision peak rate on the same apparatus would set it.")),
  entry("elderly-user", "reading", fixationRatio(0.65, 5), "hypothesis",
    FIXATION_KEPT("elderly-user", "the elderly reading profile (phonological 0.65, visualSpan 5)", "317 ms", "No silent-reading norm for adults 65+ was found; Brysbaert (2019) reports that the drop \"is not expected to occur before the age of 60–65\", with no rate.")),
  entry("cognitive-adhd", "reading", fixationRatio(0.75, 6), "hypothesis",
    FIXATION_KEPT("cognitive-adhd", "its stated reading traits (phonologicalDecoding 0.75, visualSpan 6)", "288.3 ms", "No measured silent-reading rate for adults with ADHD was found.")),
  entry("intellectual-disability", "reading", fixationRatio(0.44, 5), "hypothesis",
    FIXATION_KEPT("intellectual-disability", "the profile interpolated from comprehension 0.2 (phonological 0.44, visualSpan 5)", "338 ms", "No reading rate for adults with intellectual disability was retrieved.")),
  entry("aphasia-receptive", "reading", fixationRatio(0.4625, 5), "hypothesis",
    FIXATION_KEPT("aphasia-receptive", "the profile interpolated from comprehension 0.25 (phonological 0.4625, visualSpan 5)", "335.75 ms", "No reading rate for adults with receptive aphasia was retrieved.")),
  ...READING_NO_DIFFERENCE.map((p) => entry(p, "reading", 1, "hypothesis", NO_DIFFERENCE_READING)),
];
