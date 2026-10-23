/**
 * Provenance entries for the human-input timing (src/visual/human-input.ts):
 * the keystroke intervals, typos, click aim, mis-clicks, hover dwell, wheel
 * deltas, glance-backs and settle pauses a journey adds with humanInput on.
 * See ../model-provenance.ts for the statuses.
 *
 * Every number was set by hand to look plausible in a session replay, and
 * each is a `hypothesis` unless an entry quotes a source. The data that would
 * set most of them is a large log of real keystrokes and pointer events
 * (inter-key intervals and error corrections by typing speed; click offsets
 * from target centres and dwell before press; wheel deltas and reversals),
 * split by the persona's traits.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { ProvenanceEntry } from "../model-provenance.js";

const h = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `humanInput.${id}`, value, status: "hypothesis", source });
const p = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `humanInput.${id}`, value, status: "published", source });

// Read for this registry: Table 3, the Typist Groups definition and the
// Results section. Online transcription of sentences on physical keyboards,
// 136,857,600 keystrokes from 168,960 participants.
const DHAKAL =
  "Dhakal, V., Feit, A. M., Kristensson, P. O. & Oulasvirta, A. (2018). Observations on typing from 136 million keystrokes. CHI '18, Paper 646";
const GROUPS =
  "\"Fast Typists are the typists with speeds higher than that of 90% of participants (above approx. 78 WPM in our data), Slow Typists are those whose performance is among the slowest 10% (less than approx. 26 WPM in our data)\"";

const KEYS = (what: string) => `Hand-set ${what}. Inter-key intervals and corrections from a large keystroke log, by typing speed, would set it.`;
const POINTER = (what: string) => `Hand-set ${what}. Pointer logs of real clicks (offset from the target centre, path samples, dwell before the press), by user motor ability, would set it.`;
const WHEEL = (what: string) => `Hand-set ${what}. Wheel-event logs of real reading sessions (deltas, reversals, pauses) would set it.`;

export const HUMAN_INPUT_PROVENANCE: ProvenanceEntry[] = [
  h("defaultMotorPrecision", 0.7, POINTER("motor precision of a persona that gives none (0 jittery, 1 bullseye)")),
  h("clampSd", 2, "Hand-set number of standard deviations at which a random offset is clamped: the aim offset of a click, and a scroll's distance (whose standard deviation is its clamp / 2). The tails of real click offsets and wheel deltas would set it."),

  // ── Typing ──
  p("type.slowIntervalMs", 481.03, `Mean inter-key interval, ms, at proceduralFluency 0: the slowest decile of typists. ${DHAKAL}, Table 3, row "IKI (ms)", column Slow: 481.03 (SD 123.36 between typists); ${GROUPS}. Placing fluency 0 at the slowest decile is the timing's choice.`),
  p("type.fastIntervalMs", 121.7, `Mean inter-key interval, ms, at proceduralFluency 1: the fastest decile of typists. ${DHAKAL}, Table 3, row "IKI (ms)", column Fast: 121.70 (SD 11.96 between typists); ${GROUPS}. Placing fluency 1 at the fastest decile is the timing's choice; between the two the mean is linear in fluency, which is a hypothesis.`),
  h("type.intervalSdMs", 50, KEYS("standard deviation of one typist's inter-key intervals, ms, at proceduralFluency 1. The SDs in Dhakal et al. (2018) Table 3 are between typists, not within one, so they do not set it")),
  h("type.intervalSdPerSlowness", 60, KEYS("extra standard deviation, ms, per unit of (1 - proceduralFluency)")),
  p("type.minIntervalMs", 60, `Shortest inter-key interval, ms, after a keystroke or a correction. ${DHAKAL}, Results, Inter-key intervals: "Average inter-key interval is 238.656 ms (SD = 111.6). A lower bound of about 60 ms can be observed."`),
  h("type.maxIntervalMs", 800, KEYS("longest inter-key interval, ms")),
  h("type.focusMinMs", 300, KEYS("shortest pause, ms, before the first key (finding the field)")),
  h("type.focusMaxMs", 800, KEYS("longest pause, ms, before the first key")),
  h("type.focusReadingGain", 0.6, KEYS("lengthening of that pause per unit of readingTendency")),
  h("type.pauseRate", 0.04, KEYS("chance per character of a thinking pause")),
  h("type.pauseMinMs", 600, KEYS("shortest thinking pause, ms")),
  h("type.pauseMaxMs", 1500, KEYS("longest thinking pause, ms")),
  h("type.pauseSlownessGain", 0.5, KEYS("lengthening of a thinking pause per unit of (1 - proceduralFluency)")),
  h("type.typoRate", 0.05, KEYS("chance per letter of a typo that is noticed and corrected (one wrong key and one backspace). Dhakal et al. (2018) report backspace or delete in 6.31% of keypresses (3.40% fast, 9.05% slow typists, Table 3, \"Error Correct. (%)\"); turning that into a rate per letter is a model step this entry has not taken")),
  h("type.noticeMeanMs", 220, KEYS("mean pause, ms, before a typo is noticed")),
  h("type.noticeSdMs", 90, KEYS("standard deviation of that pause, ms")),
  h("type.noticeMinMs", 80, KEYS("shortest pause, ms, before a typo is noticed")),
  h("type.noticeMaxMs", 600, KEYS("longest pause, ms, before a typo is noticed")),
  h("type.correctionShare", 0.7, KEYS("share of the ordinary interval (mean and spread) the keystroke after a backspace takes")),
  h("type.correctionMaxMs", 400, KEYS("longest interval, ms, after a backspace")),

  // ── Clicking ──
  h("click.maxSpreadPx", 8, POINTER("aim spread, px (one standard deviation), at motorPrecision 0")),
  h("click.precisionNarrowingPx", 6, POINTER("narrowing of the aim spread, px, from motorPrecision 0 to 1")),
  h("click.defaultHalfWidthPx", 30, POINTER("half-width, px, assumed for a target of unknown size")),
  h("click.defaultHalfHeightPx", 12, POINTER("half-height, px, assumed for a target of unknown size")),
  h("click.spreadShareOfHalf", 0.4, POINTER("largest aim spread as a share of the target's half-size, so the click lands inside")),
  h("click.misclickRate", 0.02, POINTER("chance of a click just outside a target of known size before the corrected click")),
  h("click.missMinPx", 6, POINTER("smallest distance, px, beyond the target's half-width of a mis-click")),
  h("click.missMaxPx", 12, POINTER("largest distance, px, beyond the target's half-width of a mis-click")),
  h("click.missMoveSteps", 8, POINTER("number of path samples of the move to a mis-click")),
  h("click.missPauseMeanMs", 120, POINTER("mean pause, ms, before the mis-click")),
  h("click.missPauseSdMs", 40, POINTER("standard deviation of that pause, ms")),
  h("click.missPauseMinMs", 60, POINTER("shortest pause, ms, before the mis-click")),
  h("click.missPauseMaxMs", 250, POINTER("longest pause, ms, before the mis-click")),
  h("click.recoverMeanMs", 450, POINTER("mean pause, ms, to notice and recover from a mis-click")),
  h("click.recoverSdMs", 120, POINTER("standard deviation of that pause, ms")),
  h("click.recoverMinMs", 250, POINTER("shortest recovery pause, ms")),
  h("click.recoverMaxMs", 900, POINTER("longest recovery pause, ms")),
  h("click.moveStepsMean", 12, POINTER("mean number of path samples of a move to the target")),
  h("click.moveStepsSd", 3, POINTER("standard deviation of the number of path samples")),
  h("click.moveStepsMin", 6, POINTER("fewest path samples of a move")),
  h("click.moveStepsMax", 24, POINTER("most path samples of a move")),
  h("click.dwellMeanMs", 180, POINTER("mean dwell, ms, on the target before pressing")),
  h("click.dwellSdMs", 80, POINTER("standard deviation of the dwell, ms")),
  h("click.dwellMinMs", 60, POINTER("shortest dwell, ms")),
  h("click.dwellMaxMs", 500, POINTER("longest dwell, ms")),
  h("click.dwellReadingGain", 0.4, POINTER("lengthening of the dwell per unit of readingTendency")),

  // ── Scrolling ──
  h("scroll.deltaVariance", 0.2, WHEEL("spread of a scroll's distance as a share of the intended distance (the offset is clamped at this share)")),
  h("scroll.glancePatience", 0.4, WHEEL("patience above which a persona may glance back while scrolling")),
  h("scroll.glanceRate", 0.05, WHEEL("chance of a glance-back on a scroll")),
  h("scroll.glanceMinPx", 60, WHEEL("shortest glance-back, px")),
  h("scroll.glanceMaxPx", 100, WHEEL("longest glance-back, px")),
  h("scroll.glancePauseMeanMs", 400, WHEEL("mean pause, ms, after a glance-back")),
  h("scroll.glancePauseSdMs", 120, WHEEL("standard deviation of that pause, ms")),
  h("scroll.glancePauseMinMs", 200, WHEEL("shortest pause, ms, after a glance-back")),
  h("scroll.glancePauseMaxMs", 900, WHEEL("longest pause, ms, after a glance-back")),
  h("scroll.settleMeanMs", 380, WHEEL("mean wait, ms, for a smooth scroll to settle")),
  h("scroll.settleSdMs", 80, WHEEL("standard deviation of that wait, ms")),
  h("scroll.settleMinMs", 200, WHEEL("shortest settle wait, ms")),
  h("scroll.settleMaxMs", 700, WHEEL("longest settle wait, ms")),

  // ── Between actions ──
  h("settle.baseMs", 400, POINTER("mean pause, ms, between actions of an impatient skimmer (patience 0, readingTendency 0)")),
  h("settle.patienceMs", 600, POINTER("lengthening of the mean pause, ms, per unit of patience")),
  h("settle.readingMs", 200, POINTER("lengthening of the mean pause, ms, per unit of readingTendency")),
  h("settle.sdMs", 180, POINTER("standard deviation of the pause between actions, ms")),
  h("settle.minMs", 150, POINTER("shortest pause between actions, ms")),
  h("settle.maxMs", 1500, POINTER("longest pause between actions, ms")),
];
