/**
 * Provenance entries for the published laws that turn a page into seconds of
 * work (src/visual/demand-laws.ts). See ../model-provenance.ts for the
 * statuses.
 *
 * Stage B grounds four demands in laws measured on people: pointing (Fitts),
 * choosing (Cockburn, Gutwin & Greenberg's menu model: novice linear search,
 * with Hick-Hyman as its expert limit), reading (Brysbaert's silent reading
 * rate) and procedure (the keystroke-level model's mental preparation). It
 * puts all four on one time scale against one budget, and states persona
 * capacities as rate ratios against the same reference rates.
 *
 * `published` means a source read for this registry states the number; the
 * entry names the paper and the table, figure or section, and quotes it.
 * Every published law was measured on a narrow condition (a mouse on a 1992
 * Macintosh, menus of 2 to 12 items, English non-fiction, 1980 text editors),
 * and each entry says which. Applying it to a web page is the model's claim,
 * not the source's.
 *
 * The `law.rate.*` entries are measured rates of the populations the built-in
 * personas stand for. They are registered here, with their sources, so a
 * persona capacity can be set from them by id; research/stage-b-persona-rates.md
 * compares them with the values the personas carry today. Where no measured
 * rate was found (adults 65+, adults with ADHD), there is no entry here: the
 * persona's current value is catalogued in provenance/profiles.ts as a
 * hypothesis that says so.
 *
 * Every id is read through param() by demand-laws.ts;
 * tests/demand-laws.test.ts fails on an id that is registered and never read,
 * on one that is read and moves no output, and on any other numeric literal
 * in demand-laws.ts.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { ProvenanceEntry } from "../model-provenance.js";

const p = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `law.${id}`, value, status: "published", source });
const d = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `law.${id}`, value, status: "definition", source });
const h = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `law.${id}`, value, status: "hypothesis", source });

const MACKENZIE_BUXTON =
  "MacKenzie, I. S. & Buxton, W. (1992). Extending Fitts' law to two-dimensional tasks. CHI '92, 219-226, Figure 6 (Shannon formulation), row SMALLER-OF: \"SMALLER-OF 1.58 5.04 .9501 64 230 166 6.0\", i.e. ID range 1.58-5.04 bits, r = .9501, SE 64 ms, intercept 230 ms, slope 166 ms/bit, n = 78 conditions. \"Twelve computer literate subjects\", \"An Apple Macintosh II was used with the standard mouse for input. The C-D gain was set to 0.53\". Above 5.04 bits the regression is extrapolated.";

const COCKBURN =
  "Cockburn, A., Gutwin, C. & Greenberg, S. (2007). A predictive model of menu performance. CHI '07, 627-636, doi:10.1145/1240624.1240723, Calibration Study Results.";

const BRYSBAERT = "Brysbaert, M. (2019). How many words do we read per minute? A review and meta-analysis of reading rate. Journal of Memory and Language 109, 104047, doi:10.1016/j.jml.2019.104047";

const WEBSTER = "Webster, J., Morris, J., Howard, D. & Garraffa, M. (2018). Reading for meaning: what influences paragraph understanding in aphasia? American Journal of Speech-Language Pathology 27(1S), 423-437, doi:10.1044/2017_AJSLP-16-0213 (authors' accepted manuscript, Newcastle University repository, CC BY-NC-ND). 75 people with aphasia after a single stroke and 87 age-matched controls (mean age 62.9; the reading-impaired group 68.5) read narrative paragraphs silently, the paragraph was removed and comprehension questions followed (\"Participants read the paragraph silently, the paragraph was removed and then a series of written questions were presented\"). The 35 people whose comprehension accuracy fell below the controls' 5th percentile form the reading-impaired group (PWA: RI); the other 40 (PWA: NRI) took 55 seconds. Reading with the text removed afterwards is reading for later recall, slower than Brysbaert's reading for comprehension for both groups, so only the same-study ratio is used.";

export const LAW_PROVENANCE: ProvenanceEntry[] = [
  // ── Pointing: Fitts' law, Shannon form, SMALLER-OF width ──
  p("fitts.intercept", 0.23, `Movement-time intercept a, in seconds. ${MACKENZIE_BUXTON}`),
  p("fitts.slope", 0.166, `Movement-time slope b, in seconds per bit of ID = log2(D/W + 1). ${MACKENZIE_BUXTON}`),
  d("fitts.minWidth", 1, "Smallest target width, in CSS px, that enters ID = log2(D/W + 1): ID is undefined at W = 0, and a laid-out box only rounds to 0 below half a pixel. A choice of floor, not a measurement."),

  // ── Choosing: Cockburn, Gutwin & Greenberg's menu model ──
  p("search.intercept", 0.3, `Novice (linear visual search) intercept, seconds per choice group. ${COCKBURN} Random menus, where items moved on every posting: "Tdsi=Tvsi=0.08n+0.3, R2=0.99, giving values of 0.08s/item for bvs and 0.30s for avs." Eight participants, mouse, menus of 2, 4, 8 and 12 items; larger groups are extrapolation.`),
  p("search.slope", 0.08, `Novice (linear visual search) slope, seconds per item in the group. ${COCKBURN} "Tdsi=Tvsi=0.08n+0.3, R2=0.99, giving values of 0.08s/item for bvs and 0.30s for avs." Eight participants, menus of 2 to 12 items.`),
  p("hick.intercept", 0.24, `Expert (Hick-Hyman) intercept, seconds per choice group: the menu model's limit for an item the user knows. Since 21.0 (Stage C) the cognitiveLoad abilities' demand reads it at the run's siteFamiliarity e by their Eq. 4, "Tdsi = (1 - ei)Tvsi + ei Thhi ... where ei is the user's expertise with that item, from 0 (complete novice) to 1 (complete expert)"; at e = 0 (every first visit, and the reference curve) it moves no score. ${COCKBURN} Static, familiar menus, block 1 removed: "Tdsi=Thhi=0.08log2(n)+0.24, R2=0.98, giving values of 0.08s/bit for bhh and 0.24s for ahh."`),
  p("hick.slope", 0.08, `Expert (Hick-Hyman) slope, seconds per bit of log2(n). ${COCKBURN} "Tdsi=Thhi=0.08log2(n)+0.24, R2=0.98, giving values of 0.08s/bit for bhh and 0.24s for ahh."`),

  // ── Reading: Brysbaert's silent reading rate ──
  p("reading.wpm", 238, `Silent reading rate of English non-fiction, words per minute, for adults 18-60. ${BRYSBAERT}, abstract: "Based on the analysis of 190 studies (18,573 participants), we estimate that the average silent reading rate for adults in English is 238 words per minute (wpm) for non-fiction". It is also the reference rate a persona's reading rate is a ratio against.`),
  p("reading.lettersPerWord", 4.6, `Mean word length, in letters, of the non-fiction the 238 wpm was measured on, so 238 x 4.6 letters per minute is a letter rate that carries over to text of any word length. ${BRYSBAERT}, Conclusions: "Expected reading rate text = 238 * 4.6/average word length text." Derived for English; the paper notes that each language needs its own equation.`),
  p("reading.abjadWpm", 181, `Silent reading rate of Arabic, words per minute, used for abjad words. ${BRYSBAERT}, "Reading rates in different languages": "We found 15 studies on Arabic: 10 with silent reading and 5 with reading aloud. Mean silent reading rate was 181 wpm"; Table 5, row Arabic: 673 participants in the silent studies. Hebrew in the same table reads 224 wpm (5 studies, 168 participants); the raw measurement records the script, not the language, so Arabic (the larger sample) stands for both.`),
  p("reading.cjkWpm", 260, `Silent reading rate of Chinese, words per minute, used for CJK characters. ${BRYSBAERT}, "Reading rates in different languages": "In Chinese we found 26 studies coming from 23 articles: 18 on silent reading and 8 on reading aloud. Mean reading rates were respectively 260 wpm and 152 wpm." Table 5, row Chinese: 786 participants in the silent studies. Japanese is not in the table and Korean (226 wpm) counts space-separated words; reading both at the Chinese character rate is an assumption the reading function states.`),
  p("reading.cjkCharsPerWord", 1.5, `Characters per Chinese word, the conversion Brysbaert used to turn character counts into the 260 wpm, so 260 x 1.5 recovers his characters per minute. ${BRYSBAERT}, "Reading rates in different languages": "When we had to do so, we used the conversion 1.5 characters for 1 word." He calls it a language-industry rule of thumb. Not pageMetrics.cjk.charsPerWord (1.8, a hypothesis feeding avgWordLength).`),
  h("reading.labelFirstRead", 0.13, `Seconds to read one menu label for the first time, charged per grouped link (a link in a nav or composite group) in place of reading the labels' prose at the rates above; the novice search the choosing law charges leaves it out. ${COCKBURN} The search fit excludes block 1, "presumably because there is an additional cost in reading the menu labels for the first time. To avoid incorporating this one-off cost in the calibration of visual search we removed block 1 from the visual search analysis" (F2,14=4.9, p<.05; eight participants). The value is read by eye, +-0.02 s, off Figure 2 ("Mean decision/search time for the three menu conditions across blocks of trials (based on the mean of all menu lengths per block)"): random condition, block 1 about 0.97 s against block 2 about 0.84 s. A block is n selections over a menu's n labels, so the block-1 excess per selection is also the excess per label. An upper bound: block 1 also carries familiarisation with the task. Context: the static+familiar condition (labels from Microsoft Office's File menu) shows about 0.07 s (0.545 s against 0.48 s). Read off a figure rather than stated, hence a hypothesis; first-read times per label measured on web navigation would set it.`),

  // ── Procedure: the keystroke-level model ──
  p("klm.mentalPreparation", 1.35, "Mental preparation operator M, in seconds, charged once per entry step. Card, S. K., Moran, T. P. & Newell, A. (1980). The keystroke-level model for user performance time with interactive systems. CACM 23(7), 396-410. Figure 1: \"M Mentally preparing for executing physical actions. 1.35\"; section 4.2.1: \"The result was tM = 1.35 sec (R2 = .84, standard error of estimate = .11 sec ...). A rough estimate of the SD of tM is 1.1 sec\". Estimated on their own 28 users and 1980 editors. One M per field is this registry's placement, not KLM's (Figure 2 places M by rules applied to a task method)."),

  // ── The budget every law time is judged against ──
  h("timeBudget", 12.4, "Seconds of reference-user work at which a demand reads 0.5 (d = T / (T + tau)), one value for every channel so a second of reading costs what a second of pointing costs. The number is published: Weinreich, H., Obendorf, H., Herder, E. & Mayer, M. (2008). Not quite the average: an empirical study of Web use. ACM TWEB 2(1), 5:1-5:31, section 4.4: \"only first time page visits were considered ... nearly 50% were shown for less than 12 seconds and 11.6% were displayed for more than 2 minutes (median: 12.4s)\", 25 participants. Using it as the budget is the hypothesis, and the authors note that \"the attention times per page were definitely shorter than the stay times we recorded\". Time-to-abandon on first visits to the reference page set, against each page's law times, would set it or replace it."),

  // ── Rates the capacities are ratios of ──
  p("rate.pointing.reference", 4.9, "ISO 9241-9 mouse throughput, bits/s, of regular mouse users: the reference rate a persona's pointing throughput is a ratio against. MacKenzie, I. S., Kauppinen, T. & Silfverberg, M. (2001). Accuracy measures for evaluating computer pointing devices. CHI 2001, 9-16, Throughput and Error Rates: \"The throughput was 4.9 bps for the mouse\" (twelve participants, \"All participants were regular users of a GUI and mouse\"). It is the top of the ISO mouse range in Soukoreff & MacKenzie (2004), IJHCS 61, 751-789, section 4.2: \"All of the throughputs fall in the range [3.7–4.9]\". The pointing profiles in cognitive-models.ts cite MacKenzie (1992) for this value; that paper does not report it."),
  p("rate.pointing.motionImpaired", 1.77, "ISO 9241-9 mouse throughput, bits/s, of motion-impaired users. Read in Soukoreff, R. W. & MacKenzie, I. S. (2004). Towards a standard for pointing device evaluation. IJHCS 61, 751-789, Table 4 (\"Survey of nine studies that used the ISO9241-9 standard\"), row Keates, Hwang, Langdon, Clarkson & Robinson 2002: \"Shannon Mean Circular Serial No Yes — 1.77 69 Mouse (motion impared [sic])\", i.e. 1.77 bits/s at a 69% error rate. Origin: Keates et al. (2002), Cursor measures for motion-impaired computer users, ASSETS 2002, 135-142 (not retrieved; the number is the table's). The group is motion-impaired users in general, not tremor specifically."),
  p("rate.pointing.motionImpairedControls", 4.88, "ISO 9241-9 mouse throughput, bits/s, of the able-bodied group measured with the same method as law.rate.pointing.motionImpaired, so the ratio of the two is within one study. Soukoreff & MacKenzie (2004), IJHCS 61, Table 4, row Keates et al. 2002: \"Shannon Mean Circular Serial No Yes — 4.88 11 Mouse (able-bodied)\". Within 0.4% of law.rate.pointing.reference."),
  p("rate.reading.dyslexiaAdults", 184.63, "Silent text reading rate, words per minute, of students in higher education with dyslexia. Callens, M., Tops, W. & Brysbaert, M. (2012). Cognitive profile of students who enter higher education with an indication of dyslexia. PLoS ONE 7(6), e38081, doi:10.1371/journal.pone.0038081, Table 5, row \"Silent text reading (Tekenbeet)\", \"Words per minute\": 184.63 (SD 59.25) for students with dyslexia, 243.64 (SD 57.59) without, d = 1.13. \"a group of 100 Dutch-speaking students diagnosed with dyslexia with a control group of 100 students without learning disabilities\". Dutch text; students are the more able end of adult dyslexia."),
  p("rate.reading.dyslexiaControls", 243.64, "Silent text reading rate, words per minute, of the control group in Callens, Tops & Brysbaert (2012), PLoS ONE 7(6), e38081, Table 5, row \"Silent text reading (Tekenbeet)\", \"Words per minute\": 243.64 (SD 57.59) for students without dyslexia, the same-study comparison for law.rate.reading.dyslexiaAdults. Within 2.4% of law.reading.wpm."),
  p("rate.reading.aphasiaReadingImpairedSeconds", 71, `Silent reading time, seconds, of the reading-impaired group of people with aphasia for one paragraph of about 100 words (paragraph 14). ${WEBSTER} Results: "PWA: RI taking 71 seconds (SD = 71.43, range 22.09 to 224.29)".`),
  p("rate.reading.aphasiaControlsSeconds", 30, `Silent reading time, seconds, of the age-matched control group for the same paragraph, the same-study comparison for law.rate.reading.aphasiaReadingImpairedSeconds. ${WEBSTER} Results: "On average, the control participants took 30 seconds to read approximately 100 words (SD = 10.87, range 10.96 to 73.23 seconds) (paragraph 14)". About 200 words per minute under the recall condition.`),
  p("rate.reading.lowVisionCentralLoss", 25, "Peak reading rate, words per minute, of low-vision observers with central-field loss. Legge, G. E., Rubin, G. S., Pelli, D. G. & Schleske, M. M. (1985). Psychophysics of reading II. Low vision. Vision Research 25(2), 253-265, abstract: \"Peak reading rates for observers with central-field loss were very low (median 25 words/minute)\", 16 low-vision observers. A peak rate at the optimal character size on text drifted across a monitor, not silent reading of a page; the same-method normal-vision rate (Legge et al. 1985, part I) was not retrieved, so a ratio against law.reading.wpm crosses methods."),
  p("rate.reading.lowVisionIntactFields", 130, "Peak reading rate, words per minute, of low-vision observers with intact central fields. Legge, Rubin, Pelli & Schleske (1985), Vision Research 25(2), 253-265, abstract: \"peak reading rates for observers with intact central fields were at least 90 words/minute (median 130 words/minute)\". Same method and caveat as law.rate.reading.lowVisionCentralLoss."),
];
