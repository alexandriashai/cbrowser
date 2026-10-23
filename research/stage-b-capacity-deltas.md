# Stage B part 1: what persona rates moved in the CTC golden

Phase 2b, part 1. Commits on `feat/stage-b`:

- e64ff5c: the bridge passes accessibility traits to the pointing profile;
- 4b54ba7: the profile tables read the registry, and the tremor anchor comes
  from the measured rate;
- 1b4643d: each built-in persona carries its pointing and reading rate, and
  capacities become rate ratios against one reference per channel;
- this commit: the re-pinned golden (`tests/fixtures/ctc-golden-21.0.0.json`)
  and this report.

The demand side has not changed: the laws are not wired yet (part 2). The
numbers come from `research/stage-b-capacity-deltas.ts`, which compares the
fixture pinned before these commits with the matrix the code builds after
them.

## Read this first: an interim state

Capacities are now rate ratios, `c = r_p / (r_p + r_ref)`, which put a typical
persona at 0.5. Demand is still the hand-set curves. On the old formula those
curves were matched against capacities of 0.6 to 0.79; on the rate scale the
same personas sit at 0.5. So most personas show a larger deficit on motor and
readability, and rawCTC rises for every human persona (mean +0.002 to
+0.065).

This is the two halves of a unit-coherent scale with only one half in place.
The design note (section 6) explains why rate-ratio capacities need
time-based demands. Part 2 supplies those, and its deltas replace these.
Read the tables below as "what the capacity side moved", not as the 21.0
answer.

totalCTC is a percentile against a reference that pools every persona. The
pool's raw costs rose, so most personas rank slightly lower (mean change
-0.018 to +0.014). Three rank higher on average: motor-impairment-tremor
(+0.014), mobile-user (+0.007) and low-vision-magnified (+0.005). A
percentile change depends on where a persona's raw costs sit on the curve,
so it does not follow from its capacities alone: elderly-low-vision, below
the pool on both channels, ranks slightly lower (-0.007).

93844 of 223641 pinned numbers (runs and scroll) change.

Runs per persona: 76. "max abs change" is the largest absolute change over those runs.

### rawCTC

| persona | mean before | mean after | mean change | max abs change |
|---|---|---|---|---|
| power-user | 0.880 | 0.908 | +0.028 | 0.346 |
| first-timer | 0.993 | 1.006 | +0.013 | 0.111 |
| mobile-user | 0.642 | 0.681 | +0.039 | 0.319 |
| screen-reader-user | 0.739 | 0.761 | +0.022 | 0.350 |
| elderly-user | 1.067 | 1.119 | +0.052 | 0.388 |
| impatient-user | 0.834 | 0.857 | +0.023 | 0.202 |
| distracted-user | 0.857 | 0.879 | +0.022 | 0.199 |
| careful-reader | 1.023 | 1.051 | +0.028 | 0.339 |
| explorer | 0.895 | 0.923 | +0.028 | 0.318 |
| task-focused | 0.629 | 0.652 | +0.023 | 0.305 |
| motor-impairment-tremor | 0.677 | 0.740 | +0.063 | 0.352 |
| low-vision-magnified | 0.629 | 0.674 | +0.044 | 0.326 |
| cognitive-adhd | 0.802 | 0.829 | +0.026 | 0.370 |
| dyslexic-user | 0.791 | 0.794 | +0.002 | 0.107 |
| deaf-user | 0.650 | 0.674 | +0.024 | 0.311 |
| elderly-low-vision | 1.087 | 1.153 | +0.065 | 0.377 |
| color-blind-deuteranopia | 0.579 | 0.603 | +0.023 | 0.287 |
| autism-spectrum | 0.855 | 0.879 | +0.024 | 0.265 |
| intellectual-disability | 1.318 | 1.334 | +0.016 | 0.105 |
| aphasia-receptive | 0.897 | 0.917 | +0.020 | 0.167 |
| dyscalculia | 0.677 | 0.700 | +0.023 | 0.227 |
| anxious-user | 0.939 | 0.965 | +0.025 | 0.268 |
| confident-user | 0.701 | 0.726 | +0.025 | 0.264 |
| emotional-user | 0.864 | 0.885 | +0.021 | 0.180 |
| stoic-user | 0.721 | 0.746 | +0.025 | 0.293 |
| boundary-floor | 3.382 | 3.382 | +0.000 | 0.000 |
| boundary-sparse | 0.481 | 0.481 | +0.000 | 0.000 |

### totalCTC

| persona | mean before | mean after | mean change | max abs change |
|---|---|---|---|---|
| power-user | 0.533 | 0.531 | -0.002 | 0.133 |
| first-timer | 0.625 | 0.612 | -0.012 | 0.068 |
| mobile-user | 0.481 | 0.488 | +0.007 | 0.228 |
| screen-reader-user | 0.498 | 0.487 | -0.010 | 0.137 |
| elderly-user | 0.643 | 0.632 | -0.011 | 0.122 |
| impatient-user | 0.590 | 0.583 | -0.007 | 0.060 |
| distracted-user | 0.575 | 0.564 | -0.011 | 0.058 |
| careful-reader | 0.541 | 0.525 | -0.016 | 0.176 |
| explorer | 0.554 | 0.548 | -0.006 | 0.103 |
| task-focused | 0.427 | 0.424 | -0.003 | 0.155 |
| motor-impairment-tremor | 0.463 | 0.477 | +0.014 | 0.161 |
| low-vision-magnified | 0.466 | 0.471 | +0.005 | 0.180 |
| cognitive-adhd | 0.550 | 0.532 | -0.018 | 0.146 |
| dyslexic-user | 0.538 | 0.524 | -0.014 | 0.110 |
| deaf-user | 0.462 | 0.457 | -0.005 | 0.127 |
| elderly-low-vision | 0.674 | 0.667 | -0.007 | 0.064 |
| color-blind-deuteranopia | 0.422 | 0.420 | -0.002 | 0.193 |
| autism-spectrum | 0.499 | 0.485 | -0.015 | 0.119 |
| intellectual-disability | 0.707 | 0.696 | -0.011 | 0.034 |
| aphasia-receptive | 0.555 | 0.545 | -0.010 | 0.090 |
| dyscalculia | 0.493 | 0.485 | -0.007 | 0.126 |
| anxious-user | 0.614 | 0.598 | -0.015 | 0.087 |
| confident-user | 0.497 | 0.493 | -0.004 | 0.105 |
| emotional-user | 0.592 | 0.582 | -0.010 | 0.049 |
| stoic-user | 0.445 | 0.439 | -0.006 | 0.125 |
| boundary-floor | 0.790 | 0.786 | -0.004 | 0.026 |
| boundary-sparse | 0.299 | 0.291 | -0.008 | 0.038 |

### abandonmentRisk

| persona | mean before | mean after | mean change | max abs change |
|---|---|---|---|---|
| power-user | 0.303 | 0.323 | +0.020 | 0.151 |
| first-timer | 0.328 | 0.333 | +0.005 | 0.039 |
| mobile-user | 0.274 | 0.305 | +0.031 | 0.177 |
| screen-reader-user | 0.153 | 0.168 | +0.016 | 0.083 |
| elderly-user | 0.341 | 0.358 | +0.017 | 0.099 |
| impatient-user | 0.548 | 0.557 | +0.008 | 0.077 |
| distracted-user | 0.369 | 0.378 | +0.009 | 0.077 |
| careful-reader | 0.273 | 0.284 | +0.011 | 0.059 |
| explorer | 0.214 | 0.228 | +0.014 | 0.070 |
| task-focused | 0.166 | 0.184 | +0.018 | 0.095 |
| motor-impairment-tremor | 0.165 | 0.196 | +0.031 | 0.108 |
| low-vision-magnified | 0.147 | 0.172 | +0.026 | 0.106 |
| cognitive-adhd | 0.438 | 0.451 | +0.013 | 0.136 |
| dyslexic-user | 0.229 | 0.231 | +0.002 | 0.063 |
| deaf-user | 0.166 | 0.185 | +0.019 | 0.098 |
| elderly-low-vision | 0.275 | 0.296 | +0.021 | 0.081 |
| color-blind-deuteranopia | 0.129 | 0.149 | +0.020 | 0.107 |
| autism-spectrum | 0.310 | 0.321 | +0.011 | 0.066 |
| intellectual-disability | 0.511 | 0.514 | +0.003 | 0.016 |
| aphasia-receptive | 0.364 | 0.371 | +0.007 | 0.049 |
| dyscalculia | 0.255 | 0.272 | +0.017 | 0.090 |
| anxious-user | 0.270 | 0.282 | +0.012 | 0.066 |
| confident-user | 0.247 | 0.267 | +0.020 | 0.111 |
| emotional-user | 0.394 | 0.404 | +0.010 | 0.077 |
| stoic-user | 0.193 | 0.206 | +0.013 | 0.065 |
| boundary-floor | 0.874 | 0.874 | +0.000 | 0.000 |
| boundary-sparse | 0.164 | 0.164 | +0.000 | 0.000 |

### Capacities, before and after

Before: the bridge at 3917a07 (`research/stage-b-persona-rates.ts`, column
"today"). After: as the golden matrix builds them now. These are motor and
reading only; the other layers' capacities did not change.

| persona | motor before | motor after | reading before | reading after |
|---|---|---|---|---|
| power-user | 0.702 | 0.500 | 0.787 | 0.500 |
| first-timer | 0.597 | 0.500 | 0.520 | 0.500 |
| mobile-user | 0.629 | 0.413 | 0.654 | 0.500 |
| screen-reader-user | 0.774 | 0.500 | 0.724 | 0.500 |
| elderly-user | 0.605 | 0.395 | 0.673 | 0.460 |
| impatient-user | 0.598 | 0.500 | 0.654 | 0.500 |
| distracted-user | 0.621 | 0.500 | 0.619 | 0.500 |
| careful-reader | 0.726 | 0.500 | 0.724 | 0.500 |
| explorer | 0.718 | 0.500 | 0.706 | 0.500 |
| task-focused | 0.726 | 0.500 | 0.689 | 0.500 |
| motor-impairment-tremor | 0.438 | 0.266 | 0.689 | 0.500 |
| low-vision-magnified | 0.693 | 0.500 | 0.536 | 0.353 |
| cognitive-adhd | 0.741 | 0.500 | 0.746 | 0.484 |
| dyslexic-user | 0.653 | 0.500 | 0.387 | 0.431 |
| deaf-user | 0.702 | 0.500 | 0.724 | 0.500 |
| elderly-low-vision | 0.605 | 0.395 | 0.526 | 0.353 |
| color-blind-deuteranopia | 0.702 | 0.500 | 0.689 | 0.500 |
| autism-spectrum | 0.685 | 0.500 | 0.636 | 0.500 |
| intellectual-disability | 0.566 | 0.500 | 0.485 | 0.444 |
| aphasia-receptive | 0.621 | 0.500 | 0.503 | 0.446 |
| dyscalculia | 0.613 | 0.500 | 0.671 | 0.500 |
| anxious-user | 0.685 | 0.500 | 0.654 | 0.500 |
| confident-user | 0.653 | 0.500 | 0.689 | 0.500 |
| emotional-user | 0.598 | 0.500 | 0.619 | 0.500 |
| stoic-user | 0.693 | 0.500 | 0.689 | 0.500 |

## What did not move

- The two boundary personas' rawCTC and abandonmentRisk are unchanged. They
  are synthetic, with no bridged capacities. Their totalCTC moves with the
  reference pool.
- Score provenance blocks: the bridge runs unrecorded, so a block counts the
  same ids as before (`tests/ctc-tool-provenance.test.ts`, 4/0). The persona
  rates are not counted in any score block. Whether a block should report
  them, now that two are published, is a contract decision, not part of
  this change.

## Face validity, unchanged on these demands

On the golden demands, first-timer still costs more (totalCTC mean 0.612)
than cognitive-adhd (0.532), dyslexic-user (0.524) and low-vision-magnified
(0.471). These are synthetic demand vectors on the hand-set curves, not real
pages, so this answers nothing about the real-page finding. The question
belongs to part 2, on time-based demands and the reference crawl.
