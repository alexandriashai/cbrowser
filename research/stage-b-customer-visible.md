# Stage B: what customers see change (persona rates, reading rates, provenance)

Phase 2b, items b, c and d, for the release decision (ISC-57). "Before" is the
21.0 integration branch at 96e9402, which would ship without Stage B; "after"
is `feat/stage-b`. Every number below is measured on the fixture named in its
row: integration's `cognitive-models.ts` and persona literals against this
branch's.

Part 1's changes (built-in persona rates, rate-ratio capacities, the motor
audit's 4.0 bits/s line, ISC-57.1) are reported in
`research/stage-b-capacity-deltas.md` and are not repeated here.

## 1. Every place that shows a reading rate

| where | field | status |
|---|---|---|
| `computeReadingDifficulty` (readability audit) | `blocks[].wordsPerMinute` | fixed: 238 x neutral neurotypical ms / block ms |
| cognitive_effort readability section | the average of the blocks' wpm (`averageWPM` in the view) | fixed, inherits the audit |
| cognitive_effort overlay labels (`visual-overlays.ts`) | "N WPM" | fixed, inherits the audit |
| built-in personas | `humanBehavior.timing.readingSpeed` | fixed: 238 x the registered reading share |
| personas generated from a description (CLI `persona create`, createCognitivePersona, the creation tools) | `humanBehavior.timing.readingSpeed` | fixed: 238 x the custom-persona reading rule's share |
| CLI `persona` output | "Reading Speed: N wpm" | fixed, prints the field above |
| CMS account personas | none | not shown: the CMS has no readingSpeed column and the conversion (`account-personas.ts`) sets none |
| custom personas stored before this change | `humanBehavior.timing.readingSpeed` | NOT changed: stored records keep the number they were created with until re-created or migrated. Rewriting them is a data migration, a decision for you |
| code comments ("157 WPM against 204") | none | history in comments, not output |

dyslexic-user's old figure, "~178 vs 248 WPM (Scientific Reports 2021)", is
replaced by Callens, Tops & Brysbaert (2012), which is the registered rate. The
2021 paper was retrieved and is recorded as a second source in
`personaRate.dyslexic-user.reading`: Franzen, Stark & Johnson, Scientific
Reports 11, 6449, medians 178.09 vs 248.18 wpm, 67 adults reading silently.

### Readability audit wpm (fixture: "a cat sat on the mat")

| profile | block | before | after |
|---|---|---|---|
| neurotypical | 16px sans, 21:1 | 222 | 238 |
| dyslexic | 16px sans, 21:1 | 160 | 171 |
| dyslexic | 13px serif, 3.5:1 | 125 | 133 |
| lowVision | 13px serif, 3.5:1 | 136 | 145 |

### Built-in `readingSpeed` (persona_lookup, persona lists, CLI)

| persona | before | after |
|---|---|---|
| power-user | 400 | 238 |
| first-timer | 150 | 238 |
| mobile-user | 200 | 238 |
| screen-reader-user | 250 | 238 |
| elderly-user | 100 | 203 |
| impatient-user | 350 | 238 |
| distracted-user | 200 | 238 |
| careful-reader | 130 | 238 |
| explorer | 250 | 238 |
| task-focused | 260 | 238 |
| motor-impairment-tremor | 200 | 238 |
| low-vision-magnified | 100 | 130 |
| cognitive-adhd | 250 | 223 |
| dyslexic-user | 120 | 180 |
| deaf-user | 250 | 238 |
| elderly-low-vision | 80 | 130 |
| color-blind-deuteranopia | 250 | 238 |
| autism-spectrum | 180 | 238 |
| intellectual-disability | 80 | 190 |
| aphasia-receptive | 60 | 191 |
| dyscalculia | 220 | 238 |
| anxious-user | 150 | 238 |
| confident-user | 300 | 238 |
| emotional-user | 220 | 238 |
| stoic-user | 220 | 238 |

### Personas generated from a description

| description | before | after |
|---|---|---|
| "an impatient expert in a rush" | 400 | 238 |
| "an elderly retiree" | 100 | 203 |
| "an adult with dyslexia" | 250 | 180 |
| "uses screen magnification" | 250 | 130 |
| "a careful first-time shopper" | 150 | 238 |

Old age reads at the built-in elderly-user's hypothesis, the same registry
entry, as decided on 2026-10-23 (203 wpm). It applies to a description that
says elderly, senior, aging or older adult, or to an age range from 65 up.

## 2. Custom personas' capacities (every CTC tool: cognitive_effort, site_cognitive_assessment, visual_cognitive_story, compare tools, cognitive_load_estimate, empathy_audit's load)

Custom personas now follow the built-ins' rule instead of interpolating from
dispositions (customRate.*; `provenance/persona-rates.ts`).

| fixture persona | motor before -> after | reading before -> after |
|---|---|---|
| my-shopper, "an online shopper" (no cue) | 0.518 -> 0.500 | 0.534 -> 0.500 |
| steady-hands, tremor: true, "has arthritis" | 0.798 -> 0.266 | 0.823 -> 0.500 |
| reader-x, "an adult with dyslexia" | 0.838 -> 0.500 | 0.569 -> 0.431 |
| grandad, age range 65+ | 0.637 -> 0.395 | 0.823 -> 0.460 |
| stated-reader, phonologicalDecoding 0.4, visualSpan 5 | 0.838 -> 0.500 | 0.559 -> 0.441 |

"Before" includes integration's bridge, which ignored a stated tremor (fixed
in part 1), so steady-hands moves most.

Stored custom personas on this box: 4 real ones, in two hosted accounts, all
of which move. One account has 3 (one each under the tremor, elderly and
no-difference pointing rules, one low-vision reading). The other has 1
(no-difference on both channels: motor 0.449 -> 0.500, reading 0.478 ->
0.500, against part 1's values). The
CMS holds the rest of the customers' personas and is customer-visible. The
local store also held test residue (zz-* and tenant-created personas that
integration's journey-gif and overlay tests write into the real
`~/.cbrowser/personas`), which is not customer data. Those tests should use a
temp data dir.

## 3. New and corrected response fields

- cognitive_effort, visual_cognitive_story: `personaRateProvenance`, the scored
  persona's rates with their own status counts and ids. For example,
  motor-impairment-tremor: published 1, hypothesis 1; first-timer: hypothesis 2.
- site_cognitive_assessment: `personaRateProvenance`, one section per scored
  persona.
- `modelProvenance` is unchanged: same ids, same counts.
- cognitive_effort `readability.penaltyNote`: no longer says crowding carries
  "a 0.15 weight into readingCapacity" (false since part 1). It now says
  crowding enters only the audit.
- cognitive_effort `motorDecomposition.pointingInputs.note`: no longer says
  "motorCapacity weights throughput at 0.75". It now gives
  throughput / (throughput + 4.9 bits/s).

## 4. Phase 2b wiring: the law-based demand (commits 63b2412, a5e2346, b8ed05c)

Before is integration at 45be7aa, which would ship without Stage B; after is
this branch. So these rows include part 1 and the custom-persona rules as well
as the laws. Both are measured on ref-v2's final 513 reference pages
(research/stage-b-deltas.md has the full tables).

| tool | field | before -> after (mean over the 513 viewport pages) |
|---|---|---|
| cognitive_effort, site_cognitive_assessment, visual_cognitive_story | totalCTC: first-timer | 0.714 -> 0.726 |
| same | totalCTC: power-user | 0.502 -> 0.314 |
| same | totalCTC: careful-reader | 0.701 -> 0.355 |
| same | totalCTC: impatient-user | 0.426 -> 0.583 |
| same | totalCTC: mobile-user | 0.273 -> 0.485 |
| same | totalCTC: motor-impairment-tremor | 0.333 -> 0.492 |
| same | totalCTC: dyslexic-user | 0.449 -> 0.524 |
| same | totalCTC: low-vision-magnified | 0.321 -> 0.459 |
| same | abandonmentRisk | power-user 0.329 -> 0.154, careful-reader 0.340 -> 0.098, impatient-user 0.468 -> 0.582, mobile-user 0.141 -> 0.250 |
| same | rawCTC, layer costs, bottleneck | all move; decision cost falls (power-user 0.377 -> 0.070), motor and readability rise (tremor motor 0.031 -> 0.184, low-vision-magnified readability 0.012 -> 0.117) |
| same | reading: menu labels (ISC-76) | the prose inside a nav or composite group is no longer read at the prose rate; each grouped link with visible text costs one first read of 0.13 s (law.reading.labelFirstRead, a hypothesis); an icon-only link costs none. Reading median on the 514-page reference 25.1 -> 21.8 s at the viewport, 96.0 -> 90.0 s at full page; totalCTC moves through the reading demand and the reference curve (the ctc-golden re-pin's message has the delta) |
| cognitive_effort | lawTimes (new) | the four law times, each beside its demand, and the 12.4 s budget |
| site_cognitive_assessment | pageMetrics.lawTimes (new) | the same |
| cognitive_effort, site_cognitive_assessment, visual_cognitive_story | modelProvenance | published 0 -> 12 (the laws); law.timeBudget and law.reading.labelFirstRead among the hypotheses; scope names the laws |
| cognitive_effort scope sequential | per-screen curve | each screen's pointing, choosing and procedure charged by the share of newly seen elements |
| CMS audit worker -> CIF | CIF's CTC components | inherit the totalCTC changes above (ISC-56/57) |

### Migration note (for the 21.0 release notes)

The CTC demand functions are public API: the package root and
`cbrowser/visual` re-export the chain. 21.0 changes three of them. (The design
note called computeDemandFromRawMetrics a test helper "not exported from
src/index.ts"; it is exported through src/visual/index.ts, so this is a
breaking change.)

- `PageMetrics` has four new required fields, `pointingSeconds`,
  `choosingSeconds`, `readingSeconds` and `procedureSeconds`: the motor,
  decision, reading and procedure work in seconds. Metrics from
  `extractPageMetrics` carry them already. A hand-built `PageMetrics` must add
  them; `lawSecondsOf(raw)` computes all four from a raw page measurement
  (`measurePageRaw`), and `deriveMetrics(raw)` returns a whole `PageMetrics`.
- `computeDemandDistribution` throws on a `PageMetrics` without them, naming
  the field, for example: `computeDemandDistribution: pageMetrics.readingSeconds
  must be a finite number of seconds >= 0 (got undefined)`. There is no
  fallback to the 20.x demand curves.
- `computeDemandFromRawMetrics` now takes `(informationDensity,
  visualComplexity, textDensity, animationLevel, navigationDepth,
  pointingSeconds, choosingSeconds, readingSeconds, procedureSeconds)`. In
  20.x it took `(informationDensity, visualComplexity,
  interactiveElementCount, textDensity, animationLevel, choiceCount,
  navigationDepth)`. A 20.x-style call throws, naming `readingSeconds`, rather
  than reading the counts as seconds.
- `interactiveElementCount` and `choiceCount` stay on `PageMetrics` as
  reported counts. No demand reads them.
- `extractPageMetrics` also returns `lawDiagnostics` (mean Fitts index,
  targets, entry steps, choice groups, ungrouped links, the expert choosing
  time, and the menu labels charged a first read with their seconds).
- `deriveMetrics` refuses a raw format 2 record without `groupedLinks`,
  `proseInNav` or `groupedLinksWithText`, naming the field. Raw format 2 is new in 21.0, so no 20.x
  caller holds one.
