## Scope

The autonomous journey (runCognitiveJourney with its prompts, abandonment
checks and actions in src/cognitive/index.ts), the emotional engine
(src/cognitive/emotions.ts), the time-of-day model (src/cognitive/temporal.ts),
human-input timing (src/visual/human-input.ts), the default trait table
(src/cognitive/default-traits.ts), the journey helpers in src/types.ts
(Fitts, keystroke, scan width, gaze lag, peripheral vision, habituation,
decision fatigue), and the two MCP journey tools in
src/mcp-tools/base/cognitive-tools.ts (cognitive_journey_init, including the
instructions it serves, and cognitive_journey_update_state).

Not registered, and why:

- src/cognitive/focus-hierarchies.ts (157 literals): nothing in src imports
  it. It is reachable only from its own tests, so its numbers change no
  product output. Deleting it, or wiring it, is a separate decision.
- src/cognitive/goal-decomposer.ts (31 literals, mostly plan confidences):
  not on the journey's path; only site_model_query constructs it.
- src/cognitive/goal-types.ts: types only.
- getCognitiveProfile (src/personas.ts), which derives the attention pattern
  and decision style the system prompt names: persona code, covered with the
  persona registry.
- The overlay scripts in index.ts (cursor, click ripple, attention canvas)
  are strings run in the page; the attention overlay's numbers belong to the
  attention registry.

## Values changed to published values

Each change moves timing only; no state number, abandonment or step count
in either golden moved.

| constant | before | after | source (quoted in the entry) | golden delta |
|---|---|---|---|---|
| journey.gazeLag.mean (replaces gazeLag.default/min/max/baseAge/perYear) | 200 + 5 ms per year over 20, clamped 200-500 ms; 300 ms if age unknown | 700 ms for every persona | Huang, White & Buscher (2012), CHI '12: "they lag their cursor behind their gaze by at least 250 ms and on average by 700 ms" (36 adults, 26-60; no significant age relation) | scripted world: 1,200 numbers (gazeMouseLag, the pre-click waits of 10 journeys, timeElapsed and timestamps); browser: 16 (gazeMouseLag) |
| humanInput.type.slowIntervalMs | 260 ms | 481.03 ms | Dhakal, Feit, Kristensson & Oulasvirta (2018), CHI '18, Table 3: slowest 10% of typists, IKI 481.03 ms | together with the two below: 1,094 numbers, the keystroke waits of the two humanInput journeys (23.3 s -> 29.6 s, 11.1 s -> 13.5 s) and the human-input sweep |
| humanInput.type.fastIntervalMs (replaces fluencySpeedupMs 170) | 90 ms at fluency 1 | 121.70 ms | same, fastest 10%: IKI 121.70 ms | (above) |
| humanInput.type.minIntervalMs | 30 ms | 60 ms | same, Results: "A lower bound of about 60 ms can be observed." | (above) |

Marked published without a change (Card, Moran & Newell 1980, CACM 23(7),
Figure 1): journey.klm.keystrokeExpert (good typist, .12 s),
journey.klm.keystrokeNovice (typing random letters, .50 s; the code calls
this end hunt-and-peck, whose row is the worst typist at 1.20 s),
journey.klm.keystrokeAverage (.28 s), journey.klm.pointing (1.10 s),
journey.klm.homing (.40 s).

Looked for and not found (the entries stay hypotheses and say what would
set them): an age function for the gaze lag; within-typist inter-key spread
(Dhakal's SDs are between typists); a per-letter typo rate (Dhakal give
backspaces as 6.31% of keypresses); emotion-word valence and arousal norms
in a readable form (Warriner, Kuperman & Brysbaert 2013 would set
emotion.valence.* and emotion.arousal.*); any published value for the
abandonment limits, the trigger table, decision fatigue (Baumeister's
account gives no function), the circadian curve, banner blindness, tunnel
vision or the distraction rates.

## Overlaps with Stage B (reconciled: the journey reads the law)

The journey registers no copy of a quantity Stage B publishes:

- Fitts' law is law.fitts.intercept (230 ms) and law.fitts.slope
  (166 ms/bit), MacKenzie & Buxton 1992, with the Shannon index and
  law.fitts.minWidth as the width floor (fittsIndexOfDifficulty). The
  journey's own 50 ms and 150 ms/bit are gone; the comment had attributed
  them to Card, Moran & Newell, whose 1980 paper gives
  tP = .8 + .1 log2(d/s + .5) s instead.
- KLM's mental operator is law.klm.mentalPreparation (1.35 s, the same
  number the journey carried, from the same figure).
- A click, hover or hover-click is timed on the element it names, found in
  the journey's list of clickables (by #N, selector or text): the distance
  from the centre of the screen it is seen on (Stage B's pointer start) to
  the element's centre, and the smaller of its width and height
  (SMALLER-OF). An element off the current screen is seen once scrolled to,
  on the screen-sized band of the page that holds its centre (Stage B's
  full-page tiling). An element the journey cannot find, or finds without
  a box, falls back to journey.fitts.unlocatedDistancePx (300) and
  journey.fitts.unlocatedTargetWidthPx (80), both hypotheses. Scrolls, typed
  URLs, back, tab, enter, wait and find move no pointer and are charged no
  pointing time.
- A click the journey resolves to a box goes out as a coordinate click and
  waits the same law time and gaze lag first (pointingWait), on the box the
  pointer is sent to: the element's rect read after the journey's own
  scroll, measured from the centre of the screen. Until 21.0 it waited
  nothing, so most successful clicks cost nothing to point at. The retry by
  name after a coordinate click throws does not wait again.
- With human input on, no pointing wait is slept. On a coordinate click,
  humanClick's move and pre-click dwell pace the click and replace the
  law + gaze wait rather than adding to it. Found, not changed: a hover or
  a click by name under human input goes through Playwright, not
  humanClick, so it waits for neither.
- No journey constant is a reading rate, so law.reading.* has no overlap.

## Removed because they could change nothing

| constant(s) | why it could not matter |
|---|---|
| journey.abandon.loopWindow (5), journey.abandon.loopUniquePages (3) | the loop rule read pagesVisited, which holds each page once, so the last 5 were always 5 distinct pages |
| journey.emotionalAbandon.boredom (0.9), .excitement (0.1), .boredomSteps (8) | no trigger the journey fires raises boredom above its start, at most 0.1 |
| journey.emotionalAbandon.valence (-0.85), .arousal (0.85), .valencePatience (0.4) | valence is an average of emotion valences, the most negative -0.8 |
| journey.live.dwellMs (1,200) | nothing assigns the heatmap the dwell waited for |
| journey.clickMatch.maxDistancePx (5,000) | a match further than its own score (at most 1,000) is never chosen |
| journey.failure.pageChars (1,000) | only the first 200 characters are quoted |
| journey.prompt.changedElements (8) | the prompt names 5 |
| emotion.decisionSpeed.min (0.5), .max (2) | the modifier lies in [0.6, 1.7] |
| journey.log.tunnelWidth (0.5), journey.log.peripheralWidth (0.5) | the widths take only their registered values; the log now compares with those |
| journeyMcp.abandon.confusionSeconds (30) | only the served text carried it; update_state counts two consecutive updates |

Kept and exempt from the dead-constant test, by name: journey.llm.maxTokens
(the live model call's ceiling; no test calls a model) and
journeyMcp.update.marginEpsilon (a division guard; only its sign matters).

## Carried but applied by nothing

Live under the dead-constant test only because a returned object shows them;
no computation reads them. Candidates for removal, left for a decision
because each is part of an exported shape: emotion.changeThreshold
(EmotionalConfig.changeThreshold), temporal.satisfaction.base and .gain
(TemporalModulators.satisfactionMultiplier), journey.klm.keystrokeAverage,
.pointing, .homing and .button (fields of KLM_OPERATORS), and
journey.initialConfidence in the autonomous journey (cognitive_journey_update_state
does move confidence).

## Found and not fixed (behaviour, not constants)

- runCognitiveJourney resolves personas with getPersona, which knows built-in
  and custom personas but not the accessibility or emotional ones; a journey
  for "cognitive-adhd" (as runEmpathyAudit starts) runs on traits generated
  from the name instead of the persona's.
- The MCP flow has two sets of limits: cognitive_journey_init announces the
  persona's (confusion 0.6 for low comprehension, frustration 0.7 for an
  impatient persona), while cognitive_journey_update_state applies its own
  (0.8 and 0.85, scaled by conformity and security). The served text now
  says so; which should win is open.
- The autonomous and MCP flows disagree on the same limits (confusion 0.9 or
  0.75, frustration 0.95 or 0.8, no-progress steps 15/20 or 10/15).
- A returning visit lifts siteFamiliarity after everything that reads it has
  run; the lift reaches only a verbose log line.
- shouldSwitchToSystem2's three-errors rule: the journey never counts
  fast-mode errors.
- After a navigation the next prompt reports the new page's scroll position
  as a scroll ("Scrolled up 410px").
- summary.avgConfusionLevel averages the final confusion over the friction
  points, so it always equals the final confusion.
- emotion.dominantFloor (0.15, after a trigger) and emotion.decay.dominantFloor
  (0.1, after a decay) do the same job with different values.
- cognitive_journey_init labels comprehension below 0.3 as struggling with
  UI (journeyMcp.label.lowComprehension) while its own thresholds, and the
  autonomous journey's label and thresholds, cut at 0.4.
- An impatient persona (patience 0.1) whose first action fails abandons on
  patience at step 1.

## Literals left inline

Counted per function in tests/journey-no-literals.test.ts: centres of boxes
(x + width / 2) and the mean of confusion and frustration; the System 2
label; English ordinal suffixes; JavaScript weekday indices (Friday,
Saturday); 2 pi in the circadian cosines and a random direction; the
Box-Muller transform; the schema's latitude and longitude ranges. Allowed by
form: 0 and 1, toFixed digits, parseInt's radix, JSON.stringify's indent,
and a percentage or seconds scaling inside a template string.
