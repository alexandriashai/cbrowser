# Persona values and the direction of their citations

The doc reconciliation of 2026-08-02 (commit c912716) made 159 persona trait
values in `src/personas.ts` match the published persona pages. It applied
rules (`scripts/persona-doc-apply.ts` in cbrowser-web), and it kept every
comment beside a changed value as it was. 21.0 had already found two values it
moved against the citation written beside them (dyslexic-user resilience,
low-vision-magnified satisficing). This audit reads all 159.

## Rule

A value is **cited** when the provenance registry lists a source beside it
(`VALUE_CITATIONS`, `src/visual/provenance/personas.ts`). That is the
registry's own definition. A construct tag such as "(Bandura)" or "(Mark)"
names the trait's scale, not a finding about the persona, so it does not count.

| class | meaning | action |
|---|---|---|
| a | moved toward the direction the citation states | none |
| b | moved against it | restore the value the citation was written beside (the ISC-51 rule) |
| c | no cited direction | none to the value; fix the comment if it contradicts the value |

## Result

159 values changed:

- **a: 1.** elderly-low-vision workingMemory, 0.35 -> 0.3.
- **b: 4.** Two were restored before this audit and two are restored here:

  | value | before c912716 | c912716 | now | citation |
  |---|---|---|---|---|
  | low-vision-magnified selfEfficacy | 0.45 | 0.6 | **0.45** (this branch) | Brody et al. 2002: reduced vision, lower confidence |
  | motor-impairment-tremor interruptRecovery | 0.4 | 0.6 | **0.4** (this branch) | Mark: motor issues make resumption harder, adaptation helps |
  | low-vision-magnified satisficing | 0.65 | 0.4 | 0.65 (earlier in 21.0) | Pachur & Hertwig 2006: limited information access, more satisficing |
  | dyslexic-user resilience | 0.5 | 0.6 | 0.5 (earlier in 21.0) | Kapur & Agrawal 2026: pulled down from 0.6, held at neutral |

- **c: 154.** Two of them are cited and are judgement calls:
  - motor-impairment-tremor selfEfficacy, 0.5 -> 0.6. Lorig et al. 2001 is
    cited for "moderate" efficacy. That is a level, not a direction, and 0.6
    is within a moderate reading.
  - elderly-user proceduralFluency, 0.3 -> 0.4. It was uncited when it
    changed, and was revised to 0.5 on 2026-08-03 with its own reasoning.

  The other 152 have no citation at all.

The pattern behind the four b's is the reconciliation's rule 3, "one side is
neutral: keep the side that states something", plus exceptions judged on the
doc's rationale alone. Both treat a cited number as unclaimed.

**Guard.** Each cited value now records the side of neutral its finding states
(`direction` in `VALUE_CITATIONS`, 17 entries). `tests/persona-provenance.test.ts`
fails if a value sits on the other side. On dc79667 it failed for the two
values restored here.

## Comments that contradicted their values (fixed, values unchanged)

`tests/persona-comment-levels.test.ts` reads the level word that opens each
value's trailing comment and requires the value to be in that word's band:

- the bands are wide ("Low" allows up to 0.4, "Medium" 0.4-0.6);
- the extreme words are held to the extremes ("Very high" needs 0.75 or more,
  the reading the 21.0 stoic-user patience correction used).

It found 29 contradictions on dc79667, for example:

- screen-reader-user riskTolerance 0.2 "Medium";
- confident-user satisficing 0.7 "Medium - balances speed and quality";
- impatient-user changeBlindness 0.7 "Medium";
- stoic-user resilience 0.8 "Maximum";
- "Very low" beside 0.3-0.4 and "Very high" beside 0.7 on 20 values.

A read of the comments with no level word found one more:
low-vision-magnified proceduralFluency 0.6 "Harder with limited view".

All 30 comments were rewritten to the value, with the persona page's rationale
as the wording where it fits. 27 of the 30 are on values c912716 changed.

**Held, not changed: stoic-user informationForaging 0.8.** The scale's high
end is "follows information scent efficiently, abandons low-yield paths"
(`trait-reference.ts`). The comment ("methodical"), the persona page's
rationale ("Seeks full information for informed decisions") and the persona's
other values (satisficing 0.4, anchoringBias 0.3, "evaluates all options") all
describe the low end, exhaustive search. c912716 moved it from 0.6 to the
doc's 0.8. This is the inverted-digit pattern the reconciliation itself
describes. Rewriting the comment to match 0.8 would describe a persona the page
does not, so this one needs a decision on the value.

**Decided (2026-10-24): kept at 0.8, comment unchanged.** No source supports
either side, and "methodical" is not strictly the opposite of efficient
scent-following, so moving the value would mean inventing a number. It stays
open as a named question for the persona-norms work and does not block 21.0.

## CTC golden

The two restores move only capacity fields of the two personas. 1,195 values
changed in `tests/fixtures/ctc-golden-21.0.0.json` (re-pinned):

- `remainingCapacity`: mean -0.144 (low vision), -0.192 (tremor); max 0.15, 0.20;
- `capacityConsumed`: mean -0.001 to -0.002; max 0.0086 (runs), 0.0110 (scroll screens).

rawCTC, totalCTC, abandonmentRisk and bottleneckLayer are unchanged for every
persona, so the percentile reference does not move. Per field:
`bun research/persona-norms/ctc-deltas.ts <before> <after>`.

## Reproduce

```
bun research/persona-citation-direction/audit.ts        # the table below
bun research/persona-citation-direction/extract.ts <rev> # values and comments at a revision
bun test tests/persona-provenance.test.ts tests/persona-comment-levels.test.ts
```

## Every value c912716 changed

| persona.trait | before c912716 | c912716 | dc79667 | now | cited | class | comment fixed | reason |
|---|---|---|---|---|---|---|---|---|
| power-user.riskTolerance | 0.9 | 0.8 | 0.8 | 0.8 | no | c |  | No citation beside it. |
| power-user.comprehension | 0.95 | 0.9 | 0.9 | 0.9 | no | c |  | No citation beside it. |
| power-user.readingTendency | 0.1 | 0.2 | 0.2 | 0.2 | no | c |  | No citation beside it. |
| power-user.resilience | 0.85 | 0.8 | 0.8 | 0.8 | no | c |  | No citation beside it. |
| power-user.satisficing | 0.3 | 0.4 | 0.4 | 0.4 | no | c |  | No citation beside it. |
| power-user.interruptRecovery | 0.85 | 0.9 | 0.9 | 0.9 | no | c |  | No citation beside it. |
| power-user.changeBlindness | 0.2 | 0.3 | 0.3 | 0.3 | no | c |  | No citation beside it. |
| power-user.transferLearning | 0.95 | 0.9 | 0.9 | 0.9 | no | c |  | No citation beside it. |
| power-user.emotionalContagion | 0.2 | 0.3 | 0.3 | 0.3 | no | c |  | No citation beside it. |
| first-timer.patience | 0.6 | 0.7 | 0.7 | 0.7 | no | c | yes | No citation beside it. |
| first-timer.curiosity | 0.7 | 0.9 | 0.9 | 0.9 | no | c |  | No citation beside it. |
| first-timer.readingTendency | 0.8 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| first-timer.satisficing | 0.5 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| first-timer.interruptRecovery | 0.35 | 0.4 | 0.4 | 0.4 | no | c |  | No citation beside it. |
| first-timer.informationForaging | 0.3 | 0.4 | 0.4 | 0.4 | no | c |  | No citation beside it. |
| first-timer.proceduralFluency | 0.35 | 0.2 | 0.2 | 0.2 | no | c |  | No citation beside it. |
| first-timer.authoritySensitivity | 0.8 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| first-timer.emotionalContagion | 0.7 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| first-timer.socialProofSensitivity | 0.8 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| mobile-user.patience | 0.4 | 0.3 | 0.3 | 0.3 | no | c |  | No citation beside it. |
| mobile-user.persistence | 0.3 | 0.4 | 0.4 | 0.4 | no | c |  | No citation beside it. |
| mobile-user.curiosity | 0.3 | 0.4 | 0.4 | 0.4 | no | c |  | No citation beside it. |
| mobile-user.readingTendency | 0.3 | 0.2 | 0.2 | 0.2 | no | c |  | No citation beside it. |
| mobile-user.interruptRecovery | 0.45 | 0.5 | 0.5 | 0.5 | no | c |  | No citation beside it. |
| mobile-user.changeBlindness | 0.5 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| mobile-user.transferLearning | 0.7 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| mobile-user.fearOfMissingOut | 0.7 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| screen-reader-user.patience | 0.8 | 0.9 | 0.9 | 0.9 | no | c |  | No citation beside it. |
| screen-reader-user.workingMemory | 0.9 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| screen-reader-user.readingTendency | 1 | 0.9 | 0.9 | 0.9 | no | c |  | No citation beside it. |
| screen-reader-user.selfEfficacy | 0.5 | 0.7 | 0.7 | 0.7 | no | c | yes | No citation beside it. |
| screen-reader-user.trustCalibration | 0.5 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| screen-reader-user.interruptRecovery | 0.75 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| screen-reader-user.informationForaging | 0.7 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| screen-reader-user.metacognitivePlanning | 0.85 | 0.7 | 0.7 | 0.7 | no | c | yes | No citation beside it. |
| screen-reader-user.transferLearning | 0.75 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| screen-reader-user.fearOfMissingOut | 0.2 | 0.4 | 0.4 | 0.4 | no | c |  | No citation beside it. |
| elderly-user.patience | 0.9 | 0.8 | 0.8 | 0.8 | no | c |  | No citation beside it. |
| elderly-user.riskTolerance | 0.1 | 0.2 | 0.2 | 0.2 | no | c |  | No citation beside it. |
| elderly-user.persistence | 0.7 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| elderly-user.curiosity | 0.1 | 0.4 | 0.4 | 0.4 | no | c | yes | No citation beside it. |
| elderly-user.workingMemory | 0.3 | 0.4 | 0.4 | 0.4 | no | c |  | No citation beside it. |
| elderly-user.readingTendency | 0.9 | 0.8 | 0.8 | 0.8 | no | c |  | No citation beside it. |
| elderly-user.selfEfficacy | 0.3 | 0.4 | 0.4 | 0.4 | no | c |  | No citation beside it. |
| elderly-user.satisficing | 0.7 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| elderly-user.interruptRecovery | 0.3 | 0.4 | 0.4 | 0.4 | no | c |  | No citation beside it. |
| elderly-user.changeBlindness | 0.7 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| elderly-user.anchoringBias | 0.8 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| elderly-user.proceduralFluency | 0.3 | 0.4 | 0.5 | 0.5 | yes | c |  | Uncited when c912716 changed it (0.3 -> 0.4, 'Low - struggles'). Revised to 0.5 on 2026-08-03 with its own reasoning (Fisk et al. 2009), so it stays. |
| elderly-user.authoritySensitivity | 0.85 | 0.7 | 0.7 | 0.7 | no | c | yes | No citation beside it. |
| impatient-user.riskTolerance | 0.8 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| impatient-user.comprehension | 0.5 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| impatient-user.persistence | 0.1 | 0.2 | 0.2 | 0.2 | no | c |  | No citation beside it. |
| impatient-user.curiosity | 0.1 | 0.3 | 0.3 | 0.3 | no | c | yes | No citation beside it. |
| impatient-user.readingTendency | 0.05 | 0.1 | 0.1 | 0.1 | no | c |  | No citation beside it. |
| impatient-user.resilience | 0.2 | 0.3 | 0.3 | 0.3 | no | c | yes | No citation beside it. |
| impatient-user.selfEfficacy | 0.5 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| impatient-user.changeBlindness | 0.5 | 0.7 | 0.7 | 0.7 | no | c | yes | No citation beside it. |
| impatient-user.metacognitivePlanning | 0.1 | 0.3 | 0.3 | 0.3 | no | c | yes | No citation beside it. |
| impatient-user.proceduralFluency | 0.5 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| impatient-user.fearOfMissingOut | 0.9 | 0.8 | 0.8 | 0.8 | no | c |  | No citation beside it. |
| impatient-user.socialProofSensitivity | 0.5 | 0.4 | 0.4 | 0.4 | no | c |  | No citation beside it. |
| impatient-user.mentalModelFlexibility | 0.7 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| motor-impairment-tremor.selfEfficacy | 0.5 | 0.6 | 0.6 | 0.6 | yes | c |  | Lorig et al. 2001: users maintain 'moderate' efficacy. A level, not a direction; 0.6 is within a moderate reading, so it stays. |
| motor-impairment-tremor.trustCalibration | 0.5 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| motor-impairment-tremor.interruptRecovery | 0.4 | 0.6 | 0.6 | 0.4 | yes | b |  | Mark: motor issues make resumption harder, adaptation helps. 0.4 -> 0.6 crossed to easier than typical. Restored to 0.4. |
| low-vision-magnified.selfEfficacy | 0.45 | 0.6 | 0.6 | 0.45 | yes | b |  | Brody et al. 2002: reduced vision, lower confidence. 0.45 -> 0.6 crossed to above neutral. Restored to 0.45. |
| low-vision-magnified.satisficing | 0.65 | 0.4 | 0.65 | 0.65 | yes | b |  | Pachur & Hertwig 2006: limited information access, more satisficing. 0.65 -> 0.4 crossed to the maximiser side. Restored to 0.65 earlier in 21.0. |
| low-vision-magnified.comprehension | 0.6 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| low-vision-magnified.persistence | 0.7 | 0.8 | 0.8 | 0.8 | no | c |  | No citation beside it. |
| low-vision-magnified.readingTendency | 0.8 | 0.9 | 0.9 | 0.9 | no | c |  | No citation beside it. |
| low-vision-magnified.resilience | 0.5 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| low-vision-magnified.proceduralFluency | 0.5 | 0.6 | 0.6 | 0.6 | no | c | yes | No citation beside it. |
| low-vision-magnified.transferLearning | 0.5 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| low-vision-magnified.fearOfMissingOut | 0.3 | 0.4 | 0.4 | 0.4 | no | c |  | No citation beside it. |
| dyslexic-user.resilience | 0.5 | 0.6 | 0.5 | 0.5 | yes | b |  | Kapur & Agrawal 2026: pulled down from 0.6, held at neutral. 0.5 -> 0.6 undid the stated pull. Restored to 0.5 earlier in 21.0. |
| dyslexic-user.riskTolerance | 0.5 | 0.4 | 0.4 | 0.4 | no | c |  | No citation beside it. |
| dyslexic-user.anchoringBias | 0.5 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| dyslexic-user.fearOfMissingOut | 0.5 | 0.4 | 0.4 | 0.4 | no | c |  | No citation beside it. |
| deaf-user.patience | 0.7 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| deaf-user.riskTolerance | 0.5 | 0.4 | 0.4 | 0.4 | no | c |  | No citation beside it. |
| deaf-user.resilience | 0.75 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| deaf-user.selfEfficacy | 0.6 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| deaf-user.satisficing | 0.55 | 0.5 | 0.5 | 0.5 | no | c |  | No citation beside it. |
| deaf-user.trustCalibration | 0.55 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| deaf-user.interruptRecovery | 0.65 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| deaf-user.comprehension | 0.7 | 0.8 | 0.8 | 0.8 | no | c |  | No citation beside it. |
| deaf-user.curiosity | 0.5 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| deaf-user.workingMemory | 0.7 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| deaf-user.changeBlindness | 0.2 | 0.3 | 0.3 | 0.3 | no | c | yes | No citation beside it. |
| deaf-user.metacognitivePlanning | 0.6 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| deaf-user.emotionalContagion | 0.4 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| elderly-low-vision.workingMemory | 0.35 | 0.3 | 0.3 | 0.3 | yes | a |  | Inhibitory-control decline limits WM. 0.35 -> 0.3 is further in the cited direction. |
| elderly-low-vision.patience | 0.7 | 0.9 | 0.9 | 0.9 | no | c |  | No citation beside it. |
| elderly-low-vision.persistence | 0.6 | 0.8 | 0.8 | 0.8 | no | c |  | No citation beside it. |
| elderly-low-vision.riskTolerance | 0.15 | 0.1 | 0.1 | 0.1 | no | c |  | No citation beside it. |
| elderly-low-vision.resilience | 0.25 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| elderly-low-vision.selfEfficacy | 0.25 | 0.3 | 0.3 | 0.3 | no | c | yes | No citation beside it. |
| elderly-low-vision.satisficing | 0.75 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| elderly-low-vision.trustCalibration | 0.2 | 0.4 | 0.4 | 0.4 | no | c | yes | No citation beside it. |
| elderly-low-vision.interruptRecovery | 0.25 | 0.3 | 0.3 | 0.3 | no | c | yes | No citation beside it. |
| elderly-low-vision.readingTendency | 0.85 | 0.9 | 0.9 | 0.9 | no | c |  | No citation beside it. |
| elderly-low-vision.informationForaging | 0.2 | 0.4 | 0.4 | 0.4 | no | c | yes | No citation beside it. |
| elderly-low-vision.changeBlindness | 0.75 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| elderly-low-vision.proceduralFluency | 0.25 | 0.4 | 0.4 | 0.4 | no | c |  | No citation beside it. |
| elderly-low-vision.transferLearning | 0.15 | 0.4 | 0.4 | 0.4 | no | c | yes | No citation beside it. |
| elderly-low-vision.authoritySensitivity | 0.85 | 0.7 | 0.7 | 0.7 | no | c | yes | No citation beside it. |
| elderly-low-vision.fearOfMissingOut | 0.25 | 0.2 | 0.2 | 0.2 | no | c |  | No citation beside it. |
| color-blind-deuteranopia.curiosity | 0.5 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| anxious-user.patience | 0.3 | 0.8 | 0.8 | 0.8 | no | c |  | No citation beside it. |
| anxious-user.riskTolerance | 0.15 | 0.2 | 0.2 | 0.2 | no | c |  | No citation beside it. |
| anxious-user.persistence | 0.4 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| anxious-user.readingTendency | 0.8 | 0.9 | 0.9 | 0.9 | no | c |  | No citation beside it. |
| anxious-user.resilience | 0.2 | 0.3 | 0.3 | 0.3 | no | c | yes | No citation beside it. |
| anxious-user.selfEfficacy | 0.25 | 0.3 | 0.3 | 0.3 | no | c | yes | No citation beside it. |
| anxious-user.satisficing | 0.4 | 0.3 | 0.3 | 0.3 | no | c |  | No citation beside it. |
| anxious-user.trustCalibration | 0.3 | 0.2 | 0.2 | 0.2 | no | c |  | No citation beside it. |
| anxious-user.interruptRecovery | 0.3 | 0.4 | 0.4 | 0.4 | no | c |  | No citation beside it. |
| anxious-user.attributionStyle | 0.8 | 0.7 | 0.7 | 0.7 | no | c | yes | No citation beside it. |
| anxious-user.transferLearning | 0.5 | 0.4 | 0.4 | 0.4 | no | c |  | No citation beside it. |
| anxious-user.emotionalContagion | 0.8 | 0.7 | 0.7 | 0.7 | no | c | yes | No citation beside it. |
| anxious-user.socialProofSensitivity | 0.7 | 0.8 | 0.8 | 0.8 | no | c |  | No citation beside it. |
| confident-user.patience | 0.5 | 0.3 | 0.3 | 0.3 | no | c |  | No citation beside it. |
| confident-user.persistence | 0.8 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| confident-user.readingTendency | 0.3 | 0.2 | 0.2 | 0.2 | no | c |  | No citation beside it. |
| confident-user.resilience | 0.9 | 0.8 | 0.8 | 0.8 | no | c |  | No citation beside it. |
| confident-user.satisficing | 0.5 | 0.7 | 0.7 | 0.7 | no | c | yes | No citation beside it. |
| confident-user.interruptRecovery | 0.8 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| confident-user.changeBlindness | 0.3 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| confident-user.metacognitivePlanning | 0.7 | 0.4 | 0.4 | 0.4 | no | c |  | No citation beside it. |
| confident-user.proceduralFluency | 0.8 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| confident-user.transferLearning | 0.85 | 0.8 | 0.8 | 0.8 | no | c |  | No citation beside it. |
| confident-user.authoritySensitivity | 0.4 | 0.3 | 0.3 | 0.3 | no | c |  | No citation beside it. |
| confident-user.emotionalContagion | 0.2 | 0.3 | 0.3 | 0.3 | no | c |  | No citation beside it. |
| confident-user.socialProofSensitivity | 0.4 | 0.3 | 0.3 | 0.3 | no | c |  | No citation beside it. |
| emotional-user.workingMemory | 0.45 | 0.5 | 0.5 | 0.5 | no | c |  | No citation beside it. |
| emotional-user.readingTendency | 0.4 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| emotional-user.resilience | 0.15 | 0.4 | 0.4 | 0.4 | no | c | yes | No citation beside it. |
| emotional-user.interruptRecovery | 0.35 | 0.4 | 0.4 | 0.4 | no | c |  | No citation beside it. |
| emotional-user.anchoringBias | 0.6 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| emotional-user.metacognitivePlanning | 0.3 | 0.4 | 0.4 | 0.4 | no | c |  | No citation beside it. |
| emotional-user.proceduralFluency | 0.45 | 0.5 | 0.5 | 0.5 | no | c |  | No citation beside it. |
| emotional-user.fearOfMissingOut | 0.75 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| emotional-user.socialProofSensitivity | 0.7 | 0.8 | 0.8 | 0.8 | no | c |  | No citation beside it. |
| stoic-user.patience | 0.9 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| stoic-user.persistence | 0.9 | 0.7 | 0.7 | 0.7 | no | c | yes | No citation beside it. |
| stoic-user.workingMemory | 0.8 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| stoic-user.readingTendency | 0.6 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| stoic-user.resilience | 0.95 | 0.8 | 0.8 | 0.8 | no | c | yes | No citation beside it. |
| stoic-user.selfEfficacy | 0.7 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| stoic-user.trustCalibration | 0.6 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| stoic-user.interruptRecovery | 0.8 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| stoic-user.informationForaging | 0.6 | 0.8 | 0.8 | 0.8 | no | c |  | No citation beside it. |
| stoic-user.changeBlindness | 0.3 | 0.4 | 0.4 | 0.4 | no | c |  | No citation beside it. |
| stoic-user.metacognitivePlanning | 0.8 | 0.7 | 0.7 | 0.7 | no | c |  | No citation beside it. |
| stoic-user.proceduralFluency | 0.8 | 0.6 | 0.6 | 0.6 | no | c |  | No citation beside it. |
| stoic-user.emotionalContagion | 0.1 | 0.2 | 0.2 | 0.2 | no | c | yes | No citation beside it. |
| stoic-user.fearOfMissingOut | 0.1 | 0.2 | 0.2 | 0.2 | no | c | yes | No citation beside it. |
| stoic-user.socialProofSensitivity | 0.3 | 0.4 | 0.4 | 0.4 | no | c |  | No citation beside it. |

159 values changed: a 1, b 4, c 154; comments fixed on this branch among them: 27
