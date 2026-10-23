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

## 4. Phase 2b wiring: the law-based demand (commits 7bc9d5e, 5db0797, 69d8f28)

Before is 4aa544e (part 1 plus the v2 reference set, on the old demand curves).
After is this branch. Both are measured on the 513 real reference pages of the
97c4888 data (research/stage-b-deltas.md has the full tables).

| tool | field | before -> after (mean over the 513 viewport pages) |
|---|---|---|
| cognitive_effort, site_cognitive_assessment, visual_cognitive_story | totalCTC: first-timer | 0.694 -> 0.723 |
| same | totalCTC: power-user | 0.498 -> 0.316 |
| same | totalCTC: careful-reader | 0.689 -> 0.357 |
| same | totalCTC: impatient-user | 0.424 -> 0.581 |
| same | totalCTC: motor-impairment-tremor | 0.388 -> 0.491 |
| same | totalCTC: dyslexic-user | 0.426 -> 0.522 |
| same | totalCTC: low-vision-magnified | 0.352 -> 0.461 |
| same | rawCTC, abandonmentRisk, layer costs, bottleneck | all move; decision cost falls (power-user 0.375 -> 0.082), motor and readability rise (tremor motor 0.095 -> 0.182) |
| cognitive_effort | lawTimes (new) | the four law times, each beside its demand, and the 12.4 s budget |
| site_cognitive_assessment | pageMetrics.lawTimes (new) | the same |
| cognitive_effort, site_cognitive_assessment, visual_cognitive_story | modelProvenance | published 0 -> 12 (the laws); law.timeBudget among the hypotheses; scope names the laws |
| cognitive_effort scope sequential | per-screen curve | each screen's pointing, choosing and procedure charged by the share of newly seen elements |
| CMS audit worker -> CIF | CIF's CTC components | inherit the totalCTC changes above (ISC-56/57) |

npm API (the package root and ./visual re-export the chain):
- PageMetrics gains four required fields (pointingSeconds, choosingSeconds,
  readingSeconds, procedureSeconds).
- computeDemandDistribution throws without them, naming the field.
- computeDemandFromRawMetrics takes the four law times in place of
  interactiveElementCount and choiceCount, and an old 7-argument call throws
  rather than misreading its arguments.
- extractPageMetrics and deriveMetrics return the four times and
  lawDiagnostics.

The design note called computeDemandFromRawMetrics a test helper "not
exported from src/index.ts". It is exported through src/visual/index.ts, so
this is a breaking change for 21.0's release notes.
