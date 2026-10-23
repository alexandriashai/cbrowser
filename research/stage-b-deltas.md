# Stage B phase 2b: what wiring the laws into demand moved

Commit 7bc9d5e wires the motor, decision, procedure and reading demands to
law times against one budget, and the next commit re-pins the CTC golden.
"Before" is 4aa544e, the merge of ref-v2 (part 1's persona rates and
rate-ratio capacities, and the v2 reference set, on the old hand-set demand
curves). "After" is this branch. Both are measured on the 97c4888 reference
data. That data predates eaf3b36's `groupedLinks`, so every page counts its
ungrouped links from the stored nav sizes (the table below says so). The
numbers here move again when the re-crawl's data lands, and the golden is
re-pinned then.

Scripts: `research/stage-b-capacity-deltas.ts` (golden matrix, run before the
re-pin), `research/stage-b-refset-scores.ts` and `research/stage-b-refset-layers.ts`
(run on a worktree of each commit), `research/stage-b-refset-times.ts`.

## 1. The law times on the 513 reference pages

Median [p10, p90] of each time in seconds, and the demand it makes
(d = T / (T + 12.4 s)). The last column counts the pages that used the stored
nav sizes for their ungrouped links.

| scope | pointing | choosing | reading | procedure | nav-size rule |
|---|---|---|---|---|---|
| viewport | 24.6 [9.5, 80.1]; d 0.66 [0.43, 0.87] | 2.5 [0.9, 9.8]; d 0.17 [0.07, 0.44] | 24.1 [3.8, 70.9]; d 0.66 [0.24, 0.85] | 1.4 [0.0, 4.1]; d 0.10 [0.00, 0.25] | 513 of 513 |
| full_page | 71.3 [22.3, 198.6]; d 0.85 [0.64, 0.94] | 6.7 [2.2, 21.2]; d 0.35 [0.15, 0.63] | 98.9 [14.5, 384.7]; d 0.89 [0.54, 0.97] | 1.4 [0.0, 5.4]; d 0.10 [0.00, 0.30] | 513 of 513 |

These are lower than the design's 23-page sample (pointing 37.6 s, choosing 6.1 s
and reading 49.4 s at the viewport median). Format 2 counts prose once, and the
reference set is broader. As the design predicted, decision demand is now the
smallest layer driver and full_page reading is near saturation.

## 2. Real reference pages, per persona

Mean over the 513 pages, before / after, with the largest absolute change on
any page in brackets.

### viewport (513 reference pages per persona)

| persona | rawCTC before / after (max abs change) | totalCTC before / after (max abs change) | abandonmentRisk before / after (max abs change) |
|---|---|---|---|
| power-user | 0.581 / 0.340 (0.821) | 0.498 / 0.316 (0.764) | 0.346 / 0.157 (0.640) |
| first-timer | 0.851 / 0.805 (0.928) | 0.694 / 0.723 (0.279) | 0.376 / 0.322 (0.347) |
| mobile-user | 0.329 / 0.469 (0.431) | 0.305 / 0.483 (0.492) | 0.186 / 0.247 (0.340) |
| screen-reader-user | 0.410 / 0.351 (0.724) | 0.354 / 0.332 (0.436) | 0.100 / 0.061 (0.350) |
| elderly-user | 1.041 / 1.028 (1.007) | 0.759 / 0.806 (0.267) | 0.437 / 0.422 (0.258) |
| impatient-user | 0.440 / 0.587 (0.540) | 0.424 / 0.581 (0.546) | 0.486 / 0.577 (0.583) |
| distracted-user | 0.586 / 0.722 (0.628) | 0.523 / 0.663 (0.557) | 0.347 / 0.405 (0.438) |
| careful-reader | 0.990 / 0.419 (1.714) | 0.689 / 0.357 (0.742) | 0.351 / 0.104 (0.631) |
| explorer | 0.708 / 0.365 (0.968) | 0.596 / 0.341 (0.692) | 0.256 / 0.078 (0.553) |
| task-focused | 0.391 / 0.263 (0.604) | 0.350 / 0.234 (0.661) | 0.149 / 0.061 (0.413) |
| motor-impairment-tremor | 0.434 / 0.483 (0.456) | 0.388 / 0.491 (0.395) | 0.132 / 0.126 (0.223) |
| low-vision-magnified | 0.378 / 0.444 (0.565) | 0.352 / 0.461 (0.529) | 0.100 / 0.102 (0.388) |
| cognitive-adhd | 0.498 / 0.602 (0.464) | 0.451 / 0.574 (0.494) | 0.390 / 0.433 (0.455) |
| dyslexic-user | 0.474 / 0.523 (0.534) | 0.426 / 0.522 (0.437) | 0.164 / 0.156 (0.281) |
| deaf-user | 0.342 / 0.340 (0.409) | 0.300 / 0.338 (0.432) | 0.109 / 0.078 (0.280) |
| elderly-low-vision | 1.005 / 0.924 (1.060) | 0.748 / 0.764 (0.256) | 0.326 / 0.271 (0.393) |
| color-blind-deuteranopia | 0.304 / 0.295 (0.392) | 0.271 / 0.291 (0.462) | 0.083 / 0.051 (0.303) |
| autism-spectrum | 0.856 / 0.542 (1.347) | 0.637 / 0.487 (0.640) | 0.413 / 0.238 (0.570) |
| intellectual-disability | 1.318 / 1.196 (1.018) | 0.843 / 0.854 (0.287) | 0.667 / 0.610 (0.360) |
| aphasia-receptive | 0.758 / 0.700 (0.720) | 0.623 / 0.650 (0.231) | 0.400 / 0.352 (0.332) |
| dyscalculia | 0.354 / 0.427 (0.362) | 0.320 / 0.437 (0.474) | 0.171 / 0.171 (0.250) |
| anxious-user | 0.724 / 0.621 (1.017) | 0.612 / 0.587 (0.293) | 0.263 / 0.184 (0.500) |
| confident-user | 0.429 / 0.341 (0.526) | 0.406 / 0.340 (0.556) | 0.232 / 0.130 (0.479) |
| emotional-user | 0.539 / 0.657 (0.540) | 0.504 / 0.626 (0.456) | 0.325 / 0.376 (0.431) |
| stoic-user | 0.505 / 0.283 (0.976) | 0.430 / 0.242 (0.751) | 0.188 / 0.068 (0.480) |

### full_page (513 reference pages per persona)

| persona | rawCTC before / after (max abs change) | totalCTC before / after (max abs change) | abandonmentRisk before / after (max abs change) |
|---|---|---|---|
| power-user | 1.035 / 0.631 (0.891) | 0.539 / 0.337 (0.506) | 0.648 / 0.382 (0.640) |
| first-timer | 1.400 / 1.282 (1.064) | 0.668 / 0.708 (0.305) | 0.634 / 0.580 (0.409) |
| mobile-user | 0.503 / 0.728 (0.495) | 0.235 / 0.420 (0.390) | 0.383 / 0.506 (0.350) |
| screen-reader-user | 0.842 / 0.697 (0.854) | 0.427 / 0.384 (0.388) | 0.289 / 0.208 (0.372) |
| elderly-user | 1.721 / 1.647 (1.128) | 0.752 / 0.809 (0.340) | 0.686 / 0.673 (0.310) |
| impatient-user | 0.577 / 0.870 (0.653) | 0.280 / 0.514 (0.472) | 0.685 / 0.806 (0.665) |
| distracted-user | 0.918 / 1.138 (0.849) | 0.464 / 0.651 (0.552) | 0.583 / 0.678 (0.549) |
| careful-reader | 1.820 / 0.928 (1.812) | 0.777 / 0.486 (0.675) | 0.650 / 0.321 (0.642) |
| explorer | 1.233 / 0.719 (1.143) | 0.625 / 0.392 (0.596) | 0.533 / 0.248 (0.541) |
| task-focused | 0.738 / 0.467 (0.759) | 0.381 / 0.221 (0.437) | 0.365 / 0.181 (0.442) |
| motor-impairment-tremor | 0.869 / 0.853 (0.656) | 0.441 / 0.492 (0.251) | 0.357 / 0.330 (0.252) |
| low-vision-magnified | 0.680 / 0.750 (0.726) | 0.340 / 0.432 (0.390) | 0.276 / 0.294 (0.430) |
| cognitive-adhd | 0.774 / 0.943 (0.551) | 0.389 / 0.549 (0.400) | 0.638 / 0.707 (0.505) |
| dyslexic-user | 0.890 / 0.903 (0.767) | 0.446 / 0.521 (0.325) | 0.390 / 0.378 (0.310) |
| deaf-user | 0.682 / 0.612 (0.574) | 0.343 / 0.331 (0.271) | 0.315 / 0.249 (0.314) |
| elderly-low-vision | 1.640 / 1.513 (1.186) | 0.736 / 0.776 (0.365) | 0.586 / 0.535 (0.405) |
| color-blind-deuteranopia | 0.552 / 0.464 (0.555) | 0.267 / 0.218 (0.369) | 0.241 / 0.161 (0.386) |
| autism-spectrum | 1.630 / 1.084 (1.474) | 0.717 / 0.571 (0.505) | 0.707 / 0.517 (0.570) |
| intellectual-disability | 2.005 / 1.765 (1.219) | 0.821 / 0.840 (0.247) | 0.836 / 0.796 (0.356) |
| aphasia-receptive | 1.336 / 1.129 (0.949) | 0.637 / 0.631 (0.257) | 0.666 / 0.595 (0.332) |
| dyscalculia | 0.638 / 0.703 (0.504) | 0.315 / 0.398 (0.315) | 0.398 / 0.402 (0.285) |
| anxious-user | 1.298 / 1.150 (1.119) | 0.622 / 0.637 (0.382) | 0.552 / 0.470 (0.523) |
| confident-user | 0.705 / 0.546 (0.590) | 0.361 / 0.281 (0.319) | 0.478 / 0.308 (0.475) |
| emotional-user | 0.803 / 1.028 (0.631) | 0.405 / 0.599 (0.477) | 0.577 / 0.673 (0.485) |
| stoic-user | 1.001 / 0.582 (1.128) | 0.513 / 0.300 (0.523) | 0.444 / 0.217 (0.506) |

## 3. Face validity: first-timer against the impaired personas

An earlier measurement found the ADHD, dyslexic and low-vision personas cost
less than first-timer on real pages. Mean totalCTC on real pages:


| persona | viewport before | viewport after | full_page before | full_page after |
|---|---|---|---|---|
| first-timer | 0.694 | 0.723 | 0.668 | 0.708 |
| power-user | 0.498 | 0.316 | 0.539 | 0.337 |
| cognitive-adhd | 0.451 | 0.574 | 0.389 | 0.549 |
| dyslexic-user | 0.426 | 0.522 | 0.446 | 0.521 |
| low-vision-magnified | 0.352 | 0.461 | 0.340 | 0.432 |
| elderly-low-vision | 0.748 | 0.764 | 0.736 | 0.776 |
| motor-impairment-tremor | 0.388 | 0.491 | 0.441 | 0.492 |
| elderly-user | 0.759 | 0.806 | 0.752 | 0.809 |
| intellectual-disability | 0.843 | 0.854 | 0.821 | 0.840 |

The ordering still holds, but the gaps narrow. Its source is not a Stage B
layer. Here are the mean layer costs on the viewport pages, before -> after:

| persona | visualComplexity | cognitiveLoad | decision | motor | motorProcedure | frustration | readability | readingAttention |
|---|---|---|---|---|---|---|---|---|
| first-timer | 0.019 -> 0.019 | 0.435 -> 0.435 | 0.107 -> 0.105 | 0.020 -> 0.056 | 0.136 -> 0.004 | 0.059 -> 0.060 | 0.022 -> 0.056 | 0.043 -> 0.057 |
| cognitive-adhd | 0.019 -> 0.019 | 0.175 -> 0.175 | 0.071 -> 0.126 | 0.017 -> 0.052 | 0.040 -> 0.001 | 0.118 -> 0.118 | 0.022 -> 0.059 | 0.031 -> 0.043 |
| dyslexic-user | 0.022 -> 0.022 | 0.213 -> 0.213 | 0.079 -> 0.083 | 0.019 -> 0.053 | 0.041 -> 0.001 | 0.053 -> 0.053 | 0.032 -> 0.079 | 0.010 -> 0.013 |
| low-vision-magnified | 0.046 -> 0.046 | 0.094 -> 0.094 | 0.099 -> 0.069 | 0.018 -> 0.051 | 0.007 -> 0.000 | 0.039 -> 0.039 | 0.051 -> 0.115 | 0.019 -> 0.026 |
| motor-impairment-tremor | 0.022 -> 0.022 | 0.096 -> 0.096 | 0.135 -> 0.071 | 0.095 -> 0.182 | 0.008 -> 0.000 | 0.050 -> 0.050 | 0.019 -> 0.052 | 0.004 -> 0.005 |
| power-user | 0.040 -> 0.040 | 0.057 -> 0.057 | 0.375 -> 0.082 | 0.021 -> 0.051 | 0.000 -> 0.000 | 0.059 -> 0.057 | 0.020 -> 0.050 | 0.000 -> 0.000 |

first-timer's cost is mostly cognitiveLoad: 0.435 against 0.175 (ADHD) and
0.213 (dyslexic). That layer reads dispositions (comprehension, working memory,
information foraging, site familiarity, transfer learning) on hand-set
curves, and Stage B did not touch it. On the layers Stage B changed, the order
is now the expected one:
- readability: low-vision-magnified 0.115, dyslexic-user 0.079, first-timer 0.056;
- motor: motor-impairment-tremor 0.182, against about 0.05 for everyone else;
- decision: power-user falls from 0.375 to 0.082.

## 4. Golden matrix (synthetic pages)

The golden's hand-built pages take law times that ask the demand the retired
curves asked of their counts (`tests/fixtures/law-seconds.ts`). So the motor,
reading and procedure demands are unchanged on them. What moves is everything
that depended on how those demands were built:
- satisficing and riskTolerance now come from choosing alone;
- sustainedAttention's base is the reading demand;
- the "max" page and the wall screens carry the design's maxima, above every
  real page;
- totalCTC is ranked against a reference curve derived through the laws.

124294 of 227745 pinned numbers (runs and scroll) change.

Runs per persona: 76. "max abs change" is the largest absolute change over those runs.

### rawCTC

| persona | mean before | mean after | mean change | max abs change |
|---|---|---|---|---|
| power-user | 0.908 | 0.919 | +0.011 | 0.088 |
| first-timer | 1.006 | 0.965 | -0.041 | 0.359 |
| mobile-user | 0.681 | 0.681 | +0.000 | 0.082 |
| screen-reader-user | 0.761 | 0.742 | -0.019 | 0.138 |
| elderly-user | 1.119 | 1.080 | -0.039 | 0.215 |
| impatient-user | 0.857 | 0.848 | -0.009 | 0.081 |
| distracted-user | 0.879 | 0.851 | -0.028 | 0.139 |
| careful-reader | 1.051 | 1.013 | -0.038 | 0.362 |
| explorer | 0.923 | 0.925 | +0.002 | 0.179 |
| task-focused | 0.652 | 0.653 | +0.001 | 0.095 |
| motor-impairment-tremor | 0.740 | 0.728 | -0.012 | 0.119 |
| low-vision-magnified | 0.674 | 0.658 | -0.016 | 0.111 |
| cognitive-adhd | 0.800 | 0.788 | -0.012 | 0.173 |
| dyslexic-user | 0.794 | 0.775 | -0.019 | 0.238 |
| deaf-user | 0.674 | 0.669 | -0.005 | 0.099 |
| elderly-low-vision | 1.153 | 1.110 | -0.042 | 0.241 |
| color-blind-deuteranopia | 0.603 | 0.598 | -0.005 | 0.100 |
| autism-spectrum | 0.952 | 0.918 | -0.034 | 0.296 |
| intellectual-disability | 1.334 | 1.291 | -0.042 | 0.382 |
| aphasia-receptive | 0.917 | 0.892 | -0.025 | 0.305 |
| dyscalculia | 0.700 | 0.684 | -0.016 | 0.213 |
| anxious-user | 0.965 | 0.924 | -0.041 | 0.221 |
| confident-user | 0.726 | 0.735 | +0.009 | 0.135 |
| emotional-user | 0.885 | 0.865 | -0.020 | 0.123 |
| stoic-user | 0.746 | 0.734 | -0.011 | 0.239 |
| boundary-floor | 3.382 | 3.300 | -0.082 | 0.660 |
| boundary-sparse | 0.481 | 0.468 | -0.014 | 0.192 |

### totalCTC

| persona | mean before | mean after | mean change | max abs change |
|---|---|---|---|---|
| power-user | 0.530 | 0.550 | +0.021 | 0.064 |
| first-timer | 0.613 | 0.618 | +0.005 | 0.139 |
| mobile-user | 0.485 | 0.493 | +0.009 | 0.106 |
| screen-reader-user | 0.486 | 0.475 | -0.011 | 0.188 |
| elderly-user | 0.632 | 0.632 | +0.000 | 0.147 |
| impatient-user | 0.582 | 0.596 | +0.014 | 0.062 |
| distracted-user | 0.564 | 0.566 | +0.002 | 0.148 |
| careful-reader | 0.525 | 0.510 | -0.015 | 0.160 |
| explorer | 0.548 | 0.567 | +0.019 | 0.065 |
| task-focused | 0.422 | 0.428 | +0.006 | 0.070 |
| motor-impairment-tremor | 0.477 | 0.473 | -0.004 | 0.147 |
| low-vision-magnified | 0.467 | 0.460 | -0.007 | 0.164 |
| cognitive-adhd | 0.520 | 0.529 | +0.009 | 0.125 |
| dyslexic-user | 0.522 | 0.527 | +0.005 | 0.110 |
| deaf-user | 0.456 | 0.458 | +0.002 | 0.121 |
| elderly-low-vision | 0.667 | 0.669 | +0.002 | 0.102 |
| color-blind-deuteranopia | 0.418 | 0.416 | -0.002 | 0.140 |
| autism-spectrum | 0.511 | 0.503 | -0.008 | 0.116 |
| intellectual-disability | 0.697 | 0.703 | +0.006 | 0.112 |
| aphasia-receptive | 0.545 | 0.548 | +0.003 | 0.117 |
| dyscalculia | 0.484 | 0.486 | +0.002 | 0.107 |
| anxious-user | 0.597 | 0.595 | -0.002 | 0.129 |
| confident-user | 0.493 | 0.513 | +0.020 | 0.081 |
| emotional-user | 0.582 | 0.592 | +0.010 | 0.110 |
| stoic-user | 0.438 | 0.440 | +0.002 | 0.107 |
| boundary-floor | 0.786 | 0.789 | +0.003 | 0.041 |
| boundary-sparse | 0.289 | 0.281 | -0.009 | 0.163 |

### abandonmentRisk

| persona | mean before | mean after | mean change | max abs change |
|---|---|---|---|---|
| power-user | 0.323 | 0.323 | +0.000 | 0.005 |
| first-timer | 0.333 | 0.326 | -0.007 | 0.058 |
| mobile-user | 0.305 | 0.303 | -0.002 | 0.017 |
| screen-reader-user | 0.168 | 0.161 | -0.007 | 0.069 |
| elderly-user | 0.358 | 0.348 | -0.010 | 0.060 |
| impatient-user | 0.557 | 0.551 | -0.005 | 0.028 |
| distracted-user | 0.378 | 0.367 | -0.011 | 0.045 |
| careful-reader | 0.284 | 0.273 | -0.011 | 0.060 |
| explorer | 0.228 | 0.226 | -0.002 | 0.021 |
| task-focused | 0.184 | 0.183 | -0.001 | 0.023 |
| motor-impairment-tremor | 0.196 | 0.192 | -0.004 | 0.059 |
| low-vision-magnified | 0.172 | 0.166 | -0.006 | 0.068 |
| cognitive-adhd | 0.438 | 0.434 | -0.004 | 0.027 |
| dyslexic-user | 0.231 | 0.228 | -0.003 | 0.049 |
| deaf-user | 0.185 | 0.184 | -0.002 | 0.049 |
| elderly-low-vision | 0.296 | 0.285 | -0.011 | 0.073 |
| color-blind-deuteranopia | 0.149 | 0.147 | -0.002 | 0.048 |
| autism-spectrum | 0.350 | 0.341 | -0.009 | 0.044 |
| intellectual-disability | 0.514 | 0.507 | -0.007 | 0.043 |
| aphasia-receptive | 0.371 | 0.366 | -0.005 | 0.059 |
| dyscalculia | 0.272 | 0.269 | -0.003 | 0.063 |
| anxious-user | 0.282 | 0.267 | -0.015 | 0.064 |
| confident-user | 0.267 | 0.267 | +0.000 | 0.006 |
| emotional-user | 0.404 | 0.399 | -0.005 | 0.042 |
| stoic-user | 0.206 | 0.204 | -0.002 | 0.023 |
| boundary-floor | 0.874 | 0.874 | -0.000 | 0.002 |
| boundary-sparse | 0.164 | 0.158 | -0.006 | 0.052 |
