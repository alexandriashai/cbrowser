# Stage C: what it moved in the CTC golden matrix

Before is the pin at 7ed78e5 (tests/fixtures/ctc-golden-21.0.0.json, Stage B on
feat/cot-integration 8707e49); after is the matrix this branch builds, measured
before the fixture was regenerated, with
`BEFORE=<the 7ed78e5 pin> bun research/stage-c-golden-deltas.ts`.

The golden pages are hand-built: their choosing, reading and other law times are
the times that ask what the retired count curves asked (tests/fixtures/law-seconds.ts),
so a choice count of c asks a choosing demand of c / (c + 10), far above most real
pages. The real-page effect is in research/stage-c-design.md, section 10.

Per-dimension arrays (traitCosts, remainingCapacity) lost the siteFamiliarity
slot, so every index after it shifts; they are counted as changed.

boundary-zero (every dimension at 0) is new: it is the only path on which the
numerical floor chain.capacityEpsilon binds, now that no built-in persona starts
below 0.1.

158181 of 227745 pinned numbers (runs and scroll) change.

Runs per persona: 76. "max abs change" is the largest absolute change over those runs.

### rawCTC

| persona | mean before | mean after | mean change | max abs change |
|---|---|---|---|---|
| power-user | 0.919 | 0.761 | -0.158 | 1.569 |
| first-timer | 0.965 | 0.856 | -0.108 | 1.426 |
| mobile-user | 0.681 | 0.558 | -0.124 | 0.520 |
| screen-reader-user | 0.742 | 0.571 | -0.171 | 0.704 |
| elderly-user | 1.080 | 0.966 | -0.114 | 1.817 |
| impatient-user | 0.848 | 0.727 | -0.120 | 0.676 |
| distracted-user | 0.851 | 0.713 | -0.138 | 0.794 |
| careful-reader | 1.013 | 0.880 | -0.133 | 0.549 |
| explorer | 0.925 | 0.720 | -0.204 | 1.124 |
| task-focused | 0.653 | 0.488 | -0.166 | 0.679 |
| motor-impairment-tremor | 0.728 | 0.604 | -0.124 | 0.503 |
| low-vision-magnified | 0.658 | 0.534 | -0.124 | 0.502 |
| cognitive-adhd | 0.788 | 0.726 | -0.063 | 0.851 |
| dyslexic-user | 0.775 | 0.586 | -0.189 | 0.671 |
| deaf-user | 0.669 | 0.527 | -0.142 | 0.525 |
| elderly-low-vision | 1.110 | 0.939 | -0.171 | 1.313 |
| color-blind-deuteranopia | 0.598 | 0.442 | -0.156 | 0.575 |
| autism-spectrum | 0.918 | 0.830 | -0.088 | 1.212 |
| intellectual-disability | 1.291 | 1.217 | -0.074 | 2.224 |
| aphasia-receptive | 0.892 | 0.775 | -0.117 | 1.494 |
| dyscalculia | 0.684 | 0.551 | -0.133 | 0.606 |
| anxious-user | 0.924 | 0.822 | -0.102 | 0.785 |
| confident-user | 0.735 | 0.585 | -0.150 | 0.889 |
| emotional-user | 0.865 | 0.783 | -0.082 | 0.848 |
| stoic-user | 0.734 | 0.546 | -0.189 | 0.834 |
| boundary-floor | 3.300 | 3.304 | +0.005 | 3.790 |
| boundary-sparse | 0.468 | 0.517 | +0.049 | 0.925 |
| boundary-zero | (not in the pin) | 3.518 | | |

### totalCTC

| persona | mean before | mean after | mean change | max abs change |
|---|---|---|---|---|
| power-user | 0.550 | 0.510 | -0.040 | 0.432 |
| first-timer | 0.617 | 0.517 | -0.100 | 0.632 |
| mobile-user | 0.491 | 0.437 | -0.053 | 0.491 |
| screen-reader-user | 0.474 | 0.394 | -0.079 | 0.564 |
| elderly-user | 0.631 | 0.510 | -0.121 | 0.657 |
| impatient-user | 0.594 | 0.572 | -0.023 | 0.563 |
| distracted-user | 0.564 | 0.502 | -0.063 | 0.567 |
| careful-reader | 0.509 | 0.455 | -0.054 | 0.524 |
| explorer | 0.566 | 0.506 | -0.059 | 0.505 |
| task-focused | 0.426 | 0.331 | -0.095 | 0.579 |
| motor-impairment-tremor | 0.471 | 0.401 | -0.070 | 0.492 |
| low-vision-magnified | 0.457 | 0.387 | -0.069 | 0.585 |
| cognitive-adhd | 0.526 | 0.511 | -0.016 | 0.670 |
| dyslexic-user | 0.525 | 0.401 | -0.124 | 0.624 |
| deaf-user | 0.456 | 0.380 | -0.076 | 0.576 |
| elderly-low-vision | 0.669 | 0.565 | -0.104 | 0.644 |
| color-blind-deuteranopia | 0.414 | 0.321 | -0.093 | 0.564 |
| autism-spectrum | 0.503 | 0.382 | -0.120 | 0.646 |
| intellectual-disability | 0.703 | 0.634 | -0.068 | 0.489 |
| aphasia-receptive | 0.547 | 0.406 | -0.140 | 0.727 |
| dyscalculia | 0.483 | 0.405 | -0.078 | 0.619 |
| anxious-user | 0.594 | 0.538 | -0.056 | 0.580 |
| confident-user | 0.511 | 0.438 | -0.073 | 0.705 |
| emotional-user | 0.591 | 0.581 | -0.010 | 0.510 |
| stoic-user | 0.439 | 0.347 | -0.092 | 0.585 |
| boundary-floor | 0.789 | 0.732 | -0.058 | 0.878 |
| boundary-sparse | 0.279 | 0.321 | +0.043 | 0.737 |
| boundary-zero | (not in the pin) | 0.749 | | |

### abandonmentRisk

| persona | mean before | mean after | mean change | max abs change |
|---|---|---|---|---|
| power-user | 0.323 | 0.256 | -0.067 | 0.413 |
| first-timer | 0.326 | 0.230 | -0.096 | 0.522 |
| mobile-user | 0.303 | 0.215 | -0.088 | 0.542 |
| screen-reader-user | 0.161 | 0.118 | -0.043 | 0.191 |
| elderly-user | 0.348 | 0.241 | -0.107 | 0.610 |
| impatient-user | 0.551 | 0.414 | -0.137 | 0.894 |
| distracted-user | 0.367 | 0.266 | -0.101 | 0.593 |
| careful-reader | 0.273 | 0.229 | -0.045 | 0.271 |
| explorer | 0.226 | 0.167 | -0.059 | 0.300 |
| task-focused | 0.183 | 0.128 | -0.056 | 0.238 |
| motor-impairment-tremor | 0.192 | 0.155 | -0.037 | 0.247 |
| low-vision-magnified | 0.166 | 0.131 | -0.035 | 0.239 |
| cognitive-adhd | 0.434 | 0.327 | -0.107 | 0.787 |
| dyslexic-user | 0.228 | 0.160 | -0.067 | 0.396 |
| deaf-user | 0.184 | 0.132 | -0.051 | 0.298 |
| elderly-low-vision | 0.285 | 0.206 | -0.079 | 0.498 |
| color-blind-deuteranopia | 0.147 | 0.096 | -0.051 | 0.227 |
| autism-spectrum | 0.341 | 0.251 | -0.090 | 0.490 |
| intellectual-disability | 0.507 | 0.344 | -0.163 | 0.691 |
| aphasia-receptive | 0.366 | 0.239 | -0.127 | 0.611 |
| dyscalculia | 0.269 | 0.186 | -0.082 | 0.522 |
| anxious-user | 0.267 | 0.210 | -0.057 | 0.393 |
| confident-user | 0.267 | 0.193 | -0.074 | 0.393 |
| emotional-user | 0.399 | 0.291 | -0.108 | 0.622 |
| stoic-user | 0.204 | 0.150 | -0.053 | 0.241 |
| boundary-floor | 0.874 | 0.843 | -0.031 | 0.567 |
| boundary-sparse | 0.158 | 0.185 | +0.027 | 0.595 |
| boundary-zero | (not in the pin) | 0.850 | | |

### cognitiveLoad and frustration layer cost, mean over the runs

| persona | cognitiveLoad before | after | frustration before | after |
|---|---|---|---|---|
| power-user | 0.357 | 0.175 | 0.082 | 0.126 |
| first-timer | 0.435 | 0.300 | 0.072 | 0.083 |
| mobile-user | 0.280 | 0.112 | 0.078 | 0.123 |
| screen-reader-user | 0.255 | 0.109 | 0.099 | 0.092 |
| elderly-user | 0.529 | 0.386 | 0.086 | 0.091 |
| impatient-user | 0.312 | 0.120 | 0.139 | 0.211 |
| distracted-user | 0.369 | 0.191 | 0.063 | 0.097 |
| careful-reader | 0.249 | 0.137 | 0.099 | 0.094 |
| explorer | 0.323 | 0.133 | 0.059 | 0.067 |
| task-focused | 0.265 | 0.100 | 0.060 | 0.073 |
| motor-impairment-tremor | 0.257 | 0.142 | 0.076 | 0.075 |
| low-vision-magnified | 0.251 | 0.127 | 0.060 | 0.065 |
| cognitive-adhd | 0.301 | 0.170 | 0.118 | 0.180 |
| dyslexic-user | 0.355 | 0.166 | 0.070 | 0.075 |
| deaf-user | 0.258 | 0.111 | 0.066 | 0.083 |
| elderly-low-vision | 0.438 | 0.260 | 0.104 | 0.103 |
| color-blind-deuteranopia | 0.259 | 0.099 | 0.055 | 0.069 |
| autism-spectrum | 0.344 | 0.232 | 0.062 | 0.074 |
| intellectual-disability | 0.665 | 0.528 | 0.079 | 0.110 |
| aphasia-receptive | 0.465 | 0.310 | 0.055 | 0.076 |
| dyscalculia | 0.300 | 0.145 | 0.054 | 0.078 |
| anxious-user | 0.275 | 0.167 | 0.104 | 0.109 |
| confident-user | 0.295 | 0.112 | 0.078 | 0.122 |
| emotional-user | 0.288 | 0.138 | 0.168 | 0.230 |
| stoic-user | 0.280 | 0.108 | 0.076 | 0.081 |
