/**
 * Provenance catalogue for the pointing and reading profiles in
 * src/visual/cognitive-models.ts: the four pointing throughputs, and the
 * fixation model's text-independent per-word terms with the two reading-profile
 * values they read. See ../model-provenance.ts for the statuses.
 *
 * WHY THESE. Stage B states motor and reading capacity as rate ratios,
 * c = r_p / (r_p + r_ref) (demand-laws.ts, rateCapacity). The rates would come
 * from these numbers: a pointing profile's throughput, and a reading profile's
 * per-word time base + (1 - phonological) x phonologicalMs +
 * (normalSpan / visualSpan - 1) x spanMs. They are load-bearing the moment the
 * capacity bridges change, so they are registered, with what a source check
 * found about each, before that happens. Most of them are not supported by the
 * sources the code cites; research/stage-b-persona-rates.md compares them
 * with the measured rates in provenance/laws.ts (law.rate.*) and recommends
 * values. This file changes none of them.
 *
 * CATALOGUED, NOT READ THROUGH param(), like provenance/personas.ts. The code
 * holds the values (KNOWN_POINTING_PROFILES, KNOWN_READING_PROFILES and the
 * literals in computeReadingDifficulty); the entries copy them, and
 * tests/demand-laws.test.ts fails if a copy and the code disagree, checking
 * the fixation terms by running computeReadingDifficulty itself. They are not
 * built from the profile objects at load because this file must not import
 * cognitive-models.ts: once the bridges read demand-laws.ts, that import
 * would close a cycle through model-provenance.ts. When the bridges change,
 * the code should read these ids through param() and the copies go away. No
 * code reads a `profile.` id through param() today, so a recording will not
 * contain one.
 *
 * Citations named "per the source check" were not retrieved for this registry
 * (the publisher pages were behind a bot wall); what is said about them is the
 * finding of the 2026-10-22 source check, not a reading of the paper.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { ProvenanceEntry } from "../model-provenance.js";

const p = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `profile.${id}`, value, status: "published", source });
const h = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `profile.${id}`, value, status: "hypothesis", source });

const SCALE = "a hand-set value on a 0-1 scale that no instrument defines";

const LEGGE_2007 = "Legge, G. E., Cheung, S.-H., Yu, D., Chung, S. T. L., Lee, H.-W. & Owens, D. P. (2007). The case for the visual span as a sensory bottleneck in reading. Journal of Vision 7(2):9, doi:10.1167/7.2.9";

const RAYNER_2009 = "Rayner, K. (2009). Eye movements and attention in reading, scene perception, and visual search. QJEP 62(8), 1457-1506, doi:10.1080/17470210902816461";

export const PROFILE_PROVENANCE: ProvenanceEntry[] = [
  // ── Pointing throughputs (KNOWN_POINTING_PROFILES), bits/s ──
  p("pointing.neurotypical.throughput", 4.9, "Fitts throughput of the neurotypical pointing profile, bits/s. The number is published, under a different citation than the code gives: MacKenzie, Kauppinen & Silfverberg (2001), CHI 2001, 9-16: \"The throughput was 4.9 bps for the mouse\". The code cites MacKenzie (1992), which does not report it. Same value and source as law.rate.pointing.reference, the reference rate a capacity is a ratio against; one of the two should read the other."),
  h("pointing.tremor.throughput", 2.1, "Fitts throughput of the tremor profile, bits/s. Cited to Hwang et al. (2004); the paper retrieved under that name (Hwang, Keates, Langdon & Clarkson, Mouse movements of motion-impaired users: a submovement analysis, ASSETS 2004) studies \"six motion-impaired users and three able-bodied users ... according to their submovement structure\" and its abstract reports no throughput. The nearest measured value is 1.77 bits/s for motion-impaired mouse users (law.rate.pointing.motionImpaired). It is also the low anchor that getPointingProfile interpolates every persona without a named profile toward, so changing it moves those personas too. An ISO 9241-9 mouse throughput measured on users with essential tremor would set it."),
  h("pointing.elderly.throughput", 3.2, "Fitts throughput of the elderly profile, bits/s. No measured ISO mouse throughput for adults 65+ was found, so the value has no source. Cited to Chaparro et al. (1999) and Ketcham et al. (2002). Chaparro, Bohan, Fernandez, Kattel & Choi (1999), Is the trackball a better input device for the older computer user? J Occup Rehabil 9(1), 33-43, abstract: \"older adults took longer to complete movements than younger adults and did so to a greater extent for large amplitude movements, but that their movements were less variable\"; no throughput. Ketcham et al. (2002) used a tablet, per the source check. An ISO 9241-9 mouse study of adults 65+ would set it."),
  h("pointing.adhd.throughput", 4.2, "Fitts throughput of the ADHD profile, bits/s. No measured throughput for adults with ADHD was found, so the value has no source. Cited to Flapper et al. (2006): Flapper, Houwen & Schoemaker, Fine motor skills and effects of methylphenidate in children with ADHD and DCD, Dev Med Child Neurol 48(3), 165-169, abstract: \"A group of 12 children with ADHD-DCD ... and 12 age- and sex-matched controls\", measured with manual dexterity subtests, handwriting and a graphomotor task. Children, with developmental coordination disorder as well as ADHD, and no throughput. An ISO 9241-9 mouse study of adults with ADHD and no coordination disorder would set it."),

  // ── Fixation model, text-independent terms (computeReadingDifficulty) ──
  h("fixation.baseMs", 250, `Base time per word, ms, before any deficit penalty. The code calls it a per-word time and cites Rayner (2009). ${RAYNER_2009}, Table 1 and text: "the average fixation duration in reading is on the order of 225–250 ms" (silent reading 225–250 ms). That is a duration per fixation, not per word: readers skip some words and refixate others. As a per-word time 250 ms is 240 wpm, close to Brysbaert's 238 wpm (252 ms per word), but the neurotypical profile's own phonological penalty adds 20 ms (222 wpm). A per-word silent reading time of fluent adults, or the fixation count per word times Rayner's duration, would set it.`),
  h("fixation.phonologicalMs", 100, "Milliseconds added per word at phonological 0: the penalty is (1 - phonological) x 100. Cited to Perry, Zorzi & Ziegler (2019), which models reading accuracy in children and gives no milliseconds, per the source check. A regression of adult per-word reading time on a measured phonological decoding score would set it."),
  h("fixation.spanMs", 80, `Milliseconds added per word per unit of (normalSpan / visualSpan - 1). No source in the code. The term is additive and not clamped, so a visualSpan above normalSpan subtracts time. ${LEGGE_2007}, abstract: "an increase in the visual span by one letter is associated with a 39% increase in reading speed" (RSVP), a multiplicative relation this term does not have. Legge et al.'s span-to-speed relation, converted to per-word time on the same visual-span scale, would set or replace it.`),
  h("fixation.normalSpan", 7, `Visual span, in letters, of a normal reader, against which a profile's span is compared (the span penalty, and readingCapacityOf's visualSpan / 7). Cited to Legge et al. (2007), which gives about 9: ${LEGGE_2007}, Introduction: "Applying Bouma's factor to the upper bound on the size of the visual span of 36 ... we arrive at an estimate of 9, close to empirical estimates for the size of the visual span under optimal viewing conditions." Rayner (2009), Table 1, gives 7-9 letters, but as mean saccade length in silent reading, a different quantity. A trigram visual-span measurement of fluent adult readers at text size would set it.`),

  // ── Reading-profile values the text-independent terms read (KNOWN_READING_PROFILES) ──
  h("reading.neurotypical.phonological", 0.8, `Phonological decoding of the neurotypical reading profile, ${SCALE}. Cited to Rayner (2009) as a typical college reader; Rayner reports eye movements, not a decoding score. A phonological decoding test of fluent adults, mapped to this scale, would set it.`),
  h("reading.neurotypical.visualSpan", 7, `Visual span, letters, of the neurotypical reading profile. Same value and evidence as profile.fixation.normalSpan: Legge et al. (2007) estimate about 9. A trigram visual-span measurement of fluent adult readers would set it.`),
  h("reading.dyslexic.phonological", 0.35, `Phonological decoding of the dyslexic reading profile, ${SCALE}. Cited to Perry, Zorzi & Ziegler (2019), which models accuracy in children, per the source check. With visualSpan 4 it makes the profile 1.39x slower per word than the neurotypical one; adults with dyslexia measured 1.32x slower (law.rate.reading.dyslexiaAdults against law.rate.reading.dyslexiaControls, Callens et al. 2012). A phonological decoding test of adults with dyslexia, mapped to this scale, would set it.`),
  h("reading.dyslexic.visualSpan", 4, `Visual span, letters, of the dyslexic reading profile. Cited to Perry, Zorzi & Ziegler (2019), per the source check a model of accuracy in children with no span measurement. A trigram visual-span measurement of adults with dyslexia would set it.`),
  h("reading.lowVision.phonological", 0.75, `Phonological decoding of the low-vision reading profile, ${SCALE}. Low vision is not a decoding deficit; the measured effect is on rate. A decoding test of low-vision adults would set it, and law.rate.reading.lowVisionCentralLoss / lowVisionIntactFields (Legge et al. 1985, peak 25 and 130 wpm) would replace the rate it feeds.`),
  h("reading.lowVision.visualSpan", 3, `Visual span, letters, of the low-vision reading profile. Cited to Legge et al. (2007), whose subjects had normal vision (Methods: "Five young adults (18 to 32 years of age) with corrected-to-normal vision participated"), the span varied by character size and contrast. A trigram visual-span measurement of low-vision readers at their magnified text size would set it.`),
  h("reading.adhd.phonological", 0.75, `Phonological decoding of the ADHD reading profile, ${SCALE}. Cited to Dhar et al. (2010) as intact decoding (not retrieved). No measured silent-reading rate for adults with ADHD was found: adults with ADHD read more slowly, per the source check, but no numbers were retrieved. A silent-reading rate of adults with ADHD against matched controls would set the rate this feeds.`),
  h("reading.adhd.visualSpan", 6, `Visual span, letters, of the ADHD reading profile. No source in the code for a reduced span in ADHD. A trigram visual-span measurement of adults with ADHD would set it.`),
  h("reading.elderly.phonological", 0.65, `Phonological decoding of the elderly reading profile, ${SCALE}. Cited to Rayner et al. (2006) on aging and eye movements (not retrieved). No silent-reading norm for adults 65+ was found: Brysbaert (2019) reports that "several authors have reported lower silent reading rates in old adults than in young adults" and that "This drop, however, is not expected to occur before the age of 60–65 in healthy participants", with no rate. A silent-reading rate of adults 65+ against young adults would set the rate this feeds.`),
  h("reading.elderly.visualSpan", 5, `Visual span, letters, of the elderly reading profile. No source in the code for the value. A trigram visual-span measurement of adults 65+ would set it.`),
];
