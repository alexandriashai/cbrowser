/**
 * Provenance entries for the autonomous cognitive journey's constants
 * (runCognitiveJourney and its helpers in src/cognitive/index.ts, and the
 * motor, typing, scan, gaze, peripheral-vision, habituation and fatigue
 * helpers in src/types.ts). See ../model-provenance.ts for the statuses.
 *
 * Three kinds of number live here:
 *   - the persona model: abandonment thresholds, the progress gate, trigger
 *     severities, decision fatigue, the dual-process switch, tunnel vision,
 *     banner blindness, gaze lag, Fitts and keystroke timing. Hand-set unless
 *     a source read for this registry states the value (each such entry
 *     quotes it).
 *   - the harness: how long the journey waits for a page, how much of a page
 *     it shows the model, how it retries. These carry an assumption about
 *     pages, not people, and are hypotheses whose source names the
 *     measurement that would set them.
 *   - definitions: units, the live viewer's screen, display rounding.
 *
 * Where Stage B (src/visual/provenance/laws.ts) registers a published value
 * for the same quantity, the journey reads the law's id and registers no
 * copy: Fitts' law (law.fitts.*) times the pointer moves the journey
 * charges, on the measured geometry of the element the action names, and
 * the keystroke-level model's mental operator is law.klm.mentalPreparation.
 *
 * Read through param() at the point of use; tests/journey-provenance.test.ts
 * fails on an id that is registered and never read, and
 * tests/journey-no-literals.test.ts on a numeric literal in the journey code.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { ProvenanceEntry } from "../model-provenance.js";

const h = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `journey.${id}`, value, status: "hypothesis", source });
const d = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `journey.${id}`, value, status: "definition", source });
const p = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `journey.${id}`, value, status: "published", source });

// Read for this registry: the paper, pages 398-399, Figure 1 ("The Operators of
// the Keystroke Model"). Every K value in it is a time per keystroke "as
// determined by standard one-minute typing tests" (section 3.1), measured on
// 1980 keyboards; the journey's use of them is its own claim.
const KLM_1980 =
  "Card, S. K., Moran, T. P. & Newell, A. (1980). The keystroke-level model for user performance time with interactive systems. Communications of the ACM 23(7), 396-410, Figure 1";

// What would set an abandonment limit: time-to-abandon and the state reported
// in the step before abandoning, for people of measured trait level working
// through tasks with scripted failures.
const ABANDON = (what: string) =>
  `Hand-set ${what}. The level reached in the step before people abandon a task, for people of measured trait level working through scripted failures, would set it.`;

const BAND = (side: "low" | "high", trait: string, value: number) =>
  h(`band.${side}.${trait}`, value, `Hand-set ${side === "low" ? "upper" : "lower"} edge of the ${side} band of ${trait} (${side === "low" ? "below" : "above"} ${value}), where the journey switches to its ${side}-${trait} rule or label. The scale has no anchor until ${trait}'s measure (provenance/personas.ts) is mapped onto it; the percentile of that measure where the behaviour changes would set it.`);

const PAGE_WAIT = (what: string) =>
  `Hand-set ${what}. The distribution of the time it takes across a reference set of real pages would set it (a high percentile, so a slow page is not mistaken for a broken one).`;

const SHOWN = (what: string) =>
  `Hand-set ${what}. How often the goal-relevant item falls beyond the cut, across journeys on a reference set of real pages, would set it.`;

export const JOURNEY_PROVENANCE: ProvenanceEntry[] = [
  // ── Persona defaults ──
  h("defaultTrait", 0.5, "Hand-set value of a trait a persona does not set (the scale's midpoint), used when a caller overrides some traits and wherever a missing trait falls back. The population median on the trait's measure (provenance/personas.ts) would place it once the 0-1 scale is anchored to that measure."),
  h("defaultTrait.changeBlindness", 0.3, "Hand-set default changeBlindness when a caller overrides some traits, below the midpoint the other traits default to. Detection rates in a flicker change-detection task, mapped onto the trait's scale, would set it."),
  h("initialConfidence", 0.5, "Hand-set confidence a journey starts with. The autonomous journey never changes it; cognitive_journey_update_state moves it. A pre-task confidence rating would set it."),
  h("input.motorPrecisionFloor", 0.1, "Hand-set lowest motor precision handed to the human-input timing (proceduralFluency x motorControl, clamped). Click-error rates of the most motor-impaired users, mapped onto the scale, would set it."),

  // ── Trait bands ──
  BAND("low", "comprehension", 0.4), BAND("high", "comprehension", 0.7),
  BAND("low", "patience", 0.3), BAND("high", "patience", 0.7),
  BAND("low", "persistence", 0.3), BAND("high", "persistence", 0.7),
  BAND("low", "riskTolerance", 0.3), BAND("high", "riskTolerance", 0.7),
  BAND("low", "readingTendency", 0.3), BAND("high", "readingTendency", 0.7),

  // ── Abandonment thresholds ──
  h("abandon.patienceFloor", 0.1, ABANDON("patience below which the persona gives up (also the floor cognitive_journey_update_state applies)")),
  h("abandon.confusionLimit", 0.9, ABANDON("confusion above which a persona of ordinary comprehension gives up")),
  h("abandon.confusionLimit.lowComprehension", 0.75, ABANDON("confusion above which a low-comprehension persona gives up")),
  h("abandon.frustrationLimit", 0.95, ABANDON("frustration above which a persona of ordinary patience gives up")),
  h("abandon.frustrationLimit.lowPatience", 0.8, ABANDON("frustration above which an impatient persona gives up")),
  h("abandon.noProgressSteps", 15, ABANDON("number of steps without progress after which a persona of ordinary persistence gives up")),
  h("abandon.noProgressSteps.highPersistence", 20, ABANDON("number of steps without progress after which a persistent persona gives up")),
  h("abandon.timeLimitSeconds", 120, ABANDON("time limit, in seconds, of a persona of ordinary patience")),
  h("abandon.timeLimitSeconds.highPatience", 180, ABANDON("time limit, in seconds, of a patient persona")),
  h("abandon.timeLimitSeconds.lowPatience", 60, ABANDON("time limit, in seconds, of an impatient persona")),
  h("abandon.fatigueLimit", 0.85, ABANDON("decision fatigue above which a persona of ordinary persistence gives up")),
  h("abandon.fatigueLimit.highPersistence", 0.95, ABANDON("decision fatigue above which a persistent persona gives up")),
  h("abandon.fatigueLimit.lowPersistence", 0.7, ABANDON("decision fatigue above which a persona of low persistence gives up")),
  h("emotionalAbandon.anxiety", 0.85, ABANDON("anxiety above which, with high frustration and low patience, the persona gives up from stress")),
  h("emotionalAbandon.frustration", 0.8, ABANDON("frustration above which, with high anxiety and low patience, the persona gives up from stress")),
  h("emotionalAbandon.patience", 0.3, ABANDON("patience below which high anxiety and frustration make the persona give up")),
  h("emotionalAbandon.modifier", 1.3, ABANDON("emotional abandonment modifier (the multiplier on the patience floor) above which a raised floor ends the journey")),

  // ── The persona's reported state becomes triggers ──
  h("signal.changeThreshold", 0.05, "Hand-set change in the model's reported confusion or frustration below which the journey treats it as no change. The smallest change in self-reported confusion people make deliberately would set it."),
  h("severity.error", 1.2, "Hand-set severity of the error trigger when the model reports an error message (1 = the trigger table's effect). The size of self-reported reactions to a shown error relative to a silent failure would set it."),
  h("severity.actionThrew", 1.3, "Hand-set severity of the error trigger when the action itself throws. The same reaction-size comparison would set it."),
  h("severity.signalFloor", 0.5, "Hand-set smallest severity of a confusion-onset or setback trigger fired by the model's reported increase. The relation between reported change and the next step's self-report would set it, with the gain."),
  h("severity.signalGain", 2, "Hand-set gain from the model's reported increase in confusion or frustration to the trigger's severity (severity = max(floor, delta x gain)). The same relation would set it."),
  h("severity.clarity", 0.8, "Hand-set severity of the clarity trigger when the model reports less confusion. The size of self-reported relief when a confusing step resolves would set it."),
  h("severity.timePressure", 0.8, "Hand-set severity of the time-pressure trigger. The rise in self-reported anxiety as a time limit nears would set it."),
  h("severity.success", 0.8, "Hand-set severity of the success trigger after an action that succeeds without advancing the goal. Self-reported satisfaction after a neutral success would set it."),
  h("severity.progress", 1.2, "Hand-set severity of the progress trigger after an action that advances the goal. Self-reported satisfaction after progress relative to a neutral success would set it."),
  h("timePressure.patience", 0.3, "Hand-set patience below which a step with no other trigger fires time pressure. The patience level at which people start to report hurrying would set it."),

  // ── Evidence-gated goal progress ──
  h("progress.inPageCap", 0.05, "Hand-set most goal progress the journey accepts from the model in one step without a navigation. The share of task completion people credit to an in-page action, against observed completion, would set it."),
  h("progress.madeLevel", 0.1, "Hand-set goal progress above which the journey counts progress as made (the progress trigger, and the no-progress rule). The completion level observers agree is real progress would set it."),
  h("fallback.progress", 0.9, "Hand-set goal progress at or above which a final \"found it\" thought counts as achieving the goal. The share of such claims that observers verify, by progress level, would set it."),

  // ── Decision fatigue ──
  h("fatigue.gain", 0.05, "Hand-set decision fatigue per decision, 0.05 x ln(options + 1), after Baumeister's ego-depletion account, which gives no such function. Default-taking or choice deferral as a function of the number and size of earlier decisions in a session would set it."),
  h("fatigue.options.fill", 5, "Hand-set number of options a form fill is counted as considering. A count of the options people weigh on a form field (from think-aloud protocols) would set it."),
  h("fatigue.options.navigate", 8, "Hand-set number of options a navigation or search is counted as considering. The number of links people weigh before choosing (eye-tracked fixations on candidates) would set it."),
  h("fatigue.options.other", 3, "Hand-set number of options any other action (click, scroll) is counted as considering. The same eye-tracked count would set it."),
  h("fatigue.defaultsLevel", 0.7, "Hand-set fatigue above which the persona starts choosing defaults. The fatigue level at which default-taking rises would set it."),

  // ── Dual process ──
  h("dualProcess.system1ErrorLimit", 3, "Hand-set number of fast-mode errors that forces slow, deliberate mode. The autonomous journey never counts these errors, so only a caller of shouldSwitchToSystem2 reaches it. Error runs before people slow down (response-time change after errors) would set it."),
  h("dualProcess.returnConfusion", 0.2, "Hand-set confusion below which, after a success, the persona returns to fast mode. The confusion level at which response times recover would set it."),
  h("dualProcess.switchThreshold", 0.6, "Hand-set confusion above which a persona of ordinary comprehension switches to slow mode. Response-time slowing against self-reported confusion would set it."),
  h("dualProcess.switchThreshold.lowComprehension", 0.4, "Hand-set confusion above which a low-comprehension persona switches to slow mode. The same slowing curve for low-comprehension users would set it."),

  // ── Tunnel vision under load ──
  h("scan.severeLoad", 0.8, "Hand-set cognitive load (mean of confusion and frustration) above which the scanned width falls to its severe value. Eye-tracked horizontal fixation spread against measured load would set the three cut points and widths."),
  h("scan.highLoad", 0.7, "Hand-set load above which the scanned width falls to its high-load value. The same fixation-spread curve would set it."),
  h("scan.moderateLoad", 0.5, "Hand-set load above which the scanned width narrows. The same fixation-spread curve would set it."),
  h("scan.severeWidth", 0.2, "Hand-set share of the viewport width scanned under severe load. The same fixation-spread curve would set it."),
  h("scan.highWidth", 0.3, "Hand-set share of the viewport width scanned under high load. The same fixation-spread curve would set it."),
  h("scan.moderateWidth", 0.6, "Hand-set share of the viewport width scanned under moderate load. The same fixation-spread curve would set it."),
  d("percentScale", 100, "Percent per unit: the scanned width is reported as a percentage of the viewport."),

  // ── Stress narrows the peripheral field ──
  h("peripheral.severeArousal", 0.8, "Hand-set arousal (the larger of frustration and confusion) above which the visual field narrows most, after the Yerkes-Dodson and Easterbrook accounts, which give no field sizes. Useful-field-of-view tests under induced stress would set the cut points and factors."),
  h("peripheral.moderateArousal", 0.6, "Hand-set arousal above which the field narrows moderately. The same field-of-view measurements would set it."),
  h("peripheral.slightArousal", 0.4, "Hand-set arousal above which the field narrows slightly. The same field-of-view measurements would set it."),
  h("peripheral.severeWidth", 0.3, "Hand-set horizontal field factor under severe arousal. The same field-of-view measurements would set it."),
  h("peripheral.severeHeight", 0.4, "Hand-set vertical field factor under severe arousal. The same field-of-view measurements would set it."),
  h("peripheral.moderateWidth", 0.5, "Hand-set horizontal field factor under moderate arousal. The same field-of-view measurements would set it."),
  h("peripheral.moderateHeight", 0.6, "Hand-set vertical field factor under moderate arousal. The same field-of-view measurements would set it."),
  h("peripheral.slightWidth", 0.75, "Hand-set horizontal field factor under slight arousal. The same field-of-view measurements would set it."),
  h("peripheral.slightHeight", 0.8, "Hand-set vertical field factor under slight arousal. The same field-of-view measurements would set it."),

  // ── Banner blindness ──
  h("habituation.exposures", 3, "Hand-set number of sightings of a UI pattern (cookie banner, newsletter prompt) after which a persona of ordinary comprehension ignores it. Fixation rates on repeated banner-like elements across page views would set it."),
  h("habituation.exposures.highComprehension", 5, "Hand-set sightings before a high-comprehension persona ignores a pattern. The same fixation-rate curve, by user expertise, would set it."),
  h("habituation.exposures.lowComprehension", 2, "Hand-set sightings before a low-comprehension persona ignores a pattern. The same fixation-rate curve would set it."),
  h("habituation.comprehensionBase", 0.5, "Hand-set share of the blindness threshold a persona with no comprehension keeps, in calculateHabituationVisibility. The same fixation-rate curve, by expertise, would set it."),
  h("habituation.comprehensionGain", 0.5, "Hand-set extra share of the blindness threshold per unit of comprehension. The same fixation-rate curve would set it."),
  h("habituation.nearBlindVisibility", 0.1, "Hand-set visibility of a pattern seen as often as the threshold. The fixation rate on a banner after habituation would set it."),
  h("habituation.visibilityRange", 0.9, "Hand-set fall in visibility from the first sighting to the threshold. The same fixation-rate curve would set it."),

  // ── Gaze leads the mouse ──
  p("gazeLag.mean", 700, "Gaze-to-cursor lag, ms, added before a pointer action: the time by which the cursor follows the eyes to where they look. Huang, J., White, R. W. & Buscher, G. (2012). User see, user point: gaze and cursor alignment in Web search. CHI '12, 1341-1350: \"they lag their cursor behind their gaze by at least 250 ms and on average by 700 ms\"; \"shifting the cursor positions 700 ms into the future minimizes the RMSE. This means mouse cursor lags behind eye gaze by about 700 ms\". 36 adults aged 26-60 (M = 45.5) on 32 web search tasks, Tobii x50 eye tracker; the per-person lag ran from 250 ms to over one second, and age had no significant relation to gaze-cursor distance (rho = 0.22, p = 0.18). One average for every persona is the journey's use; the study gives no age function."),

  // ── Motor timing (Fitts) ──
  h("fitts.tremorGain", 0.1, "Hand-set rise in movement time per unit of the tremor modifier. Movement times of users with tremor against their measured jitter would set it."),
  h("fitts.ageOnset", 40, "Hand-set age, in years, after which movement slows. Fitts-task movement times by age would set it, with the slope."),
  h("fitts.agePerSlowdown", 50, "Hand-set years of age per doubling of movement time after the onset (1 + (age - 40) / 50: 1.5x at 65). Fitts-task movement times by age would set it."),
  h("fitts.jitterScale", 10, "Hand-set divisor from a persona's mouse jitter (px) to the tremor modifier. Movement times against measured cursor jitter would set it."),
  h("fitts.unlocatedDistancePx", 300, "Hand-set pointer travel, px, charged to a click or hover whose element is not in the journey's list of clickables, so its distance cannot be measured; a listed element is timed from the screen centre to its own centre (Stage B's pointer start). Scrolls, typed URLs, back, tab, enter, wait and find move no pointer and are charged no pointing time. The distribution of cursor travel to clicked targets on real pages would set it, and finding the element (the page's own locator) would replace it."),
  h("fitts.unlocatedTargetWidthPx", 80, "Hand-set target width, px, charged to a click or hover whose element is not in the journey's list of clickables; a listed element enters Fitts' law with the smaller of its width and height (SMALLER-OF, as Stage B measures pointing). The distribution of clicked-target sizes on real pages would set it, and the element's measured box would replace it."),

  // ── Typing (keystroke-level model) ──
  p("klm.keystrokeExpert", 120, `Keystroke time, ms, at the journey's expert end of typing skill (expertise 1). ${KLM_1980}, row K: "Good typist (90 wpm) .12" sec. The same figure's fastest row is "Best typist (135 wpm) .08"; taking the good typist as the expert end is the journey's choice.`),
  p("klm.keystrokeNovice", 500, `Keystroke time, ms, at the journey's slow end of typing skill (expertise 0, the oldest personas). ${KLM_1980}, row K: "Typing random letters .50" sec. The code comment calls this end a hunt-and-peck typist; the figure's row for that is "Worst typist (unfamiliar with keyboard) 1.20" sec, and the journey uses the random-letters time instead. Which row the slow end stands for is the journey's choice; replacing it with 1.20 would slow every typed field of a persona with low typing expertise.`),
  p("klm.keystrokeAverage", 280, `Keystroke time, ms, of an average typist, carried on KLM_OPERATORS; nothing in cbrowser reads it. ${KLM_1980}, row K: "Average non-secretary typist (40 wpm) .28" sec (footnote b: "the average typing rate of the nonsecretary subjects in the experiment described in Section 4.1").`),
  p("klm.pointing", 1100, `Pointing time, ms, carried on KLM_OPERATORS; nothing in cbrowser reads it (the journey times pointing with Fitts' law). ${KLM_1980}, row P: "Pointing to a target on a display with a mouse ... The time ranges from .8 to 1.5 sec, with 1.1 being an average time. This operator does not include the button press that often follows (.2 sec)." 1.10 sec.`),
  p("klm.homing", 400, `Homing time, ms, carried on KLM_OPERATORS; nothing in cbrowser reads it. ${KLM_1980}, row H: "Homing the hand(s) on the keyboard or other device. .40" sec.`),
  h("klm.mentalFamiliar", 600, "Hand-set mental-preparation time, ms, for an expert on a familiar task. The keystroke-level model gives one M operator; this lower value has no source. Pre-typing pauses of experts on a routine form would set it."),
  h("klm.button", 100, `Mouse-button time, ms, carried on KLM_OPERATORS; nothing in cbrowser reads it. No source read for this registry states 0.1 s: ${KLM_1980} gives the button press that follows pointing as ".2 sec" (row P). The 1983 book's button operator would set its status.`),
  h("typing.defaultExpertise", 0.5, "Hand-set typing expertise (0 hunt-and-peck, 1 expert) when no age is known, and calculateTypingTime's default. Measured typing speed of the general population, mapped onto the keystroke range, would set it."),

  // ── Returning visits ──
  h("familiarity.visitScale", 4, "Hand-set visit count over which siteFamiliarity closes 63% of the gap to 1 (1 - exp(-visits / 4)). Task times on repeated visits to the same site (a learning curve) would set it."),

  // ── The loop ──
  h("maxSteps", 50, "Hand-set step limit of a journey when the caller sets none. The step count by which nearly all real users have finished or abandoned a task would set it."),
  h("stepPauseMs", 500, "Hand-set pause between steps, ms. The time people take between one action's result and the next action, on real pages, would set it."),
  h("summary.secondsPerFriction", 2, "Hand-set seconds of confusion counted per friction point in the journey summary (timeInConfusion). The time people stay confused after a friction event would set it."),
  h("friction.level", 0.4, "Hand-set confusion or frustration above which a step the model describes as frictional is recorded as a friction point. Agreement with observers' friction coding would set it."),
  h("friction.defaultIncrease", 0.1, "Hand-set frustration increase recorded for a friction point when the model reports no frustration. The median reported increase at friction points would set it."),

  // ── Goal evidence ──
  h("evidence.pageChars", 5000, SHOWN("number of characters of page text a claimed goal's evidence is checked against")),
  h("evidence.minWordChars", 3, "Hand-set word length a word of the evidence must exceed to be checked. The share of matched short words that are stop words, across real claims, would set it."),
  h("evidence.verifiedShare", 0.3, "Hand-set share of the evidence's words that must appear on the page for the claim to be marked verified. Agreement with human checks of claimed evidence would set it."),
  h("finalEval.pageChars", 3000, SHOWN("number of characters of the final page the closing evaluation is shown")),
  h("quoteChars", 200, SHOWN("number of characters of page text or monologue quoted in evidence and failure reasons")),

  // ── What the model is shown ──
  d("llm.maxTokens", 2000, "Response-token ceiling of the live model call; a ceiling on the reply, not a claim about the persona."),
  h("content.lookaheadShare", 0.4, SHOWN("share of a viewport height below the fold whose text is shown as coming up")),
  h("content.aboveViewportPx", 50, SHOWN("distance, px, above the viewport within which an element's text still counts as visible")),
  h("content.minWidthPx", 20, SHOWN("smallest width, px, of an element whose text is shown")),
  h("content.minHeightPx", 8, SHOWN("smallest height, px, of an element whose text is shown")),
  h("content.minChars", 3, SHOWN("smallest text length of an element whose text is shown")),
  h("content.maxChars", 220, SHOWN("number of characters of one element's text shown before it is cut")),
  h("content.maxLines", 30, SHOWN("number of visible text lines shown")),
  h("prompt.changedElementsShown", 5, SHOWN("number of appeared and disappeared clickables named in the prompt")),
  h("prompt.headings", 6, SHOWN("number of visible headings named in the prompt")),
  h("prompt.scrollReportPx", 10, "Hand-set scroll distance, px, below which the prompt does not report a scroll. The smallest scroll people notice would set it."),
  h("prompt.scrollLoop", 4, "Hand-set number of consecutive scrolls after which the prompt warns of a loop. How often journeys that scroll this many times in a row then succeed by scrolling, on real pages, would set it."),
  h("prompt.failedRun", 2, "Hand-set number of consecutive failed actions after which the prompt suggests a different element. The same success-after-retry rate would set it."),

  // ── Page waits and retries ──
  h("healthCheckMs", 5000, PAGE_WAIT("time, ms, a trivial in-page evaluation may take before the renderer is judged frozen")),
  h("screenshot.scrollPx", 100, "Hand-set scroll distance, px, after which a step captures a new screenshot. The scroll distance at which the visible content changes enough to matter would set it."),
  h("nav.attempts", 4, "Hand-set number of attempts at the start URL on a transient network error. The share of transient errors that clear by each retry would set it."),
  h("nav.backoffMs", 2500, "Hand-set wait, ms, multiplied by the attempt number, between start-URL attempts. The recovery time of transient network errors would set it."),
  h("click.scrollSettleMs", 150, PAGE_WAIT("time, ms, allowed for an instant scroll to an off-screen target to settle")),
  h("action.navigationWaitMs", 800, PAGE_WAIT("time, ms, allowed after a coordinate click or Enter for a navigation to start")),
  h("action.linkVisibleMs", 1500, PAGE_WAIT("time, ms, a link matched by text may take to become visible")),
  h("action.buttonVisibleMs", 1000, PAGE_WAIT("time, ms, a button matched by text may take to become visible")),
  h("action.clickTimeoutMs", 3000, PAGE_WAIT("time, ms, a click on a matched element may take")),
  h("action.clickSettleMs", 1000, PAGE_WAIT("time, ms, allowed after a text click for its navigation to start")),
  h("action.gotoTimeoutMs", 10000, PAGE_WAIT("time, ms, a followed link or a back navigation may take to reach DOMContentLoaded")),
  h("action.focusScrollMs", 2000, PAGE_WAIT("time, ms, scrolling a field into view may take")),
  h("action.scrollPx", 400, "Hand-set scroll distance, px, of one scroll action (about one wheel flick of several notches). The distribution of wheel-scroll distances in recorded sessions would set it."),
  h("action.scrollSettleMs", 300, PAGE_WAIT("time, ms, allowed for a smooth scroll to finish")),
  h("action.scrollMovedPx", 5, "Hand-set scroll distance, px, above which a scroll counts as having moved the page. A tolerance for sub-pixel scroll snapping; the snapping observed on real pages would set it."),
  h("action.backSettleMs", 500, PAGE_WAIT("time, ms, allowed after a back navigation")),
  h("action.findSettleMs", 500, PAGE_WAIT("time, ms, allowed for a find-on-page scroll to finish")),
  h("action.maxTabs", 10, "Hand-set most Tab presses one action may make. The number of Tab presses keyboard users make before re-orienting would set it."),
  h("action.tabIntervalMs", 150, "Hand-set interval, ms, between Tab presses. Inter-key intervals of keyboard navigation users would set it."),
  h("action.expandSettleMs", 400, PAGE_WAIT("time, ms, allowed for an accordion or tab panel to open")),
  h("action.dismissTimeoutMs", 3000, PAGE_WAIT("time, ms, finding and closing an overlay may take")),
  h("action.waitDefaultMs", 1000, "Hand-set wait, ms, of a wait action that names no duration. How long people wait for a loading page before acting would set it."),

  // ── The live viewer ──
  d("live.screenWidth", 1920, "Width, px, of the live viewer's virtual screen (Xvfb), which the window and the page fill."),
  d("live.screenHeight", 1080, "Height, px, of the live viewer's virtual screen and window."),
  d("live.pageHeight", 995, "Height, px, of the page area in the live viewer: the screen height less the 85 px of browser chrome, so the in-page attention overlay matches the stream."),
  h("live.navigationTimeoutMs", 60000, PAGE_WAIT("navigation budget, ms, of a live-viewer journey (heavy sites with many third-party scripts)")),
  d("live.bannerChars", 120, "Most characters of the action banner shown in the live viewer; a display length."),

  // ── Text-click matching ──
  h("clickMatch.exact", 1000, "Hand-set score of an exact text match when a click names an element by text; with the prefix and contains scores and the distance cap it sets which match wins. How often each rule picks the element people meant, on labelled clicks, would set it."),
  h("clickMatch.prefix", 500, "Hand-set score of a prefix match. The same labelled-click accuracy would set it."),
  h("clickMatch.contains", 100, "Hand-set score of a contains match. The same labelled-click accuracy would set it."),

  // ── Verbose logging ──
  d("log.arousalChange", 0.2, "Change in arousal above which a verbose run reports the peripheral field; a reporting cut."),

  // ── Units ──
  d("msPerSecond", 1000, "Milliseconds per second."),
  d("msPerDay", 86400000, "Milliseconds per day (1000 x 60 x 60 x 24)."),
];
