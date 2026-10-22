# Paper calculations: intervals, values, distances, power, latency

Numbers the CHI draft on cbrowser's Cognitive Optimal Transport model needs and
did not have. Research measurement only: nothing under `src/` was changed. The
one code change outside this directory is a `--no-values` flag on the Study 1
harness (`research/study1/run-study1-v20.ts`).

Tree: branch `feat/paper-calcs` from `ce9f089` (the integration head, package
20.0.1 plus the 21.0 changes). Every script runs as the tree's owner, never
root, from the worktree root. Study 1 and the ceiling need the UEyes corpus
symlinked at `research/study1/UEyes_dataset` (it is not committed; the symlink
was removed after the runs).

RNGs: the TypeScript scripts use mulberry32 (32-bit integer math via
`Math.imul`); the Python scripts use numpy's `Generator(PCG64)`. Every seed is
fixed and written into the output. Every interval below was checked by the
script that produced it to contain its point estimate; the scripts exit
non-zero if one does not.

---

## 1. Study 1 intervals

**Input.** The 20.0.1 run of 2026-10-21 (`inputs/study1-v20.0.1/`, a copy of
`research/study1/results/2026-10-21_v20-personas/`): 494 UEyes web pages x 7
persona arms + CenterBias + Uniform.

**Method** (`study1_intervals.py`). Per arm and metric: the mean over pages, a
95% CI by percentile bootstrap over pages (10,000 resamples, seed 20261022) and
a 95% CI by Student t (df 493). Paired differences per page: bootstrap CI, t
CI, t, two-sided p, Holm-adjusted p within each metric (6 tests per family),
d_z (mean difference / SD of differences), and page wins / losses / ties, where
a win is "better" (lower for KLD). In this section's file the bootstrap and t
interval endpoints differ by at most 0.00099; the tables give the bootstrap
ones and the CSV has both. (The one place they part is the ceiling's KLD,
whose page distribution is skewed: 0.017. Prefer the bootstrap there.)

**Per-arm means, 95% bootstrap CI** (`study1-intervals-v20.0.1.csv`, family `arm`):

| arm | AUC | NSS | CC | CC_counts | KLD (lower better) | SIM |
|---|---|---|---|---|---|---|
| first-timer | 0.7373 [0.7302, 0.7442] | 0.8566 [0.8231, 0.8891] | 0.4818 [0.4663, 0.4970] | 0.2786 [0.2683, 0.2895] | 0.6766 [0.6582, 0.6958] | 0.5541 [0.5482, 0.5600] |
| ADHD | 0.7416 [0.7349, 0.7481] | 0.8709 [0.8394, 0.9029] | 0.4901 [0.4757, 0.5048] | 0.2833 [0.2732, 0.2934] | 0.6627 [0.6463, 0.6794] | 0.5530 [0.5474, 0.5585] |
| elderly | 0.7343 [0.7272, 0.7413] | 0.8488 [0.8147, 0.8826] | 0.4770 [0.4610, 0.4924] | 0.2761 [0.2655, 0.2869] | 0.7036 [0.6822, 0.7263] | 0.5513 [0.5449, 0.5577] |
| dyslexic | 0.7319 [0.7248, 0.7390] | 0.8404 [0.8063, 0.8740] | 0.4720 [0.4558, 0.4882] | 0.2733 [0.2626, 0.2841] | 0.7181 [0.6953, 0.7420] | 0.5492 [0.5427, 0.5556] |
| low-vision | 0.7344 [0.7274, 0.7413] | 0.8502 [0.8169, 0.8841] | 0.4775 [0.4615, 0.4933] | 0.2766 [0.2660, 0.2872] | 0.7039 [0.6822, 0.7269] | 0.5511 [0.5448, 0.5574] |
| color-blind | 0.7388 [0.7319, 0.7456] | 0.8632 [0.8310, 0.8960] | 0.4851 [0.4699, 0.5003] | 0.2807 [0.2703, 0.2912] | 0.6702 [0.6522, 0.6887] | 0.5548 [0.5490, 0.5606] |
| power-user | 0.7389 [0.7322, 0.7456] | 0.8671 [0.8346, 0.8992] | 0.4871 [0.4716, 0.5021] | 0.2820 [0.2717, 0.2924] | 0.6709 [0.6524, 0.6893] | 0.5552 [0.5494, 0.5611] |
| CenterBias | 0.6515 [0.6450, 0.6580] | 0.4943 [0.4667, 0.5216] | 0.3010 [0.2857, 0.3160] | 0.1618 [0.1528, 0.1707] | 0.8897 [0.8685, 0.9119] | 0.4896 [0.4833, 0.4957] |
| Uniform | 0.5000 | 0.0000 | 0.0000 | 0.0000 | 1.0247 [1.0030, 1.0466] | 0.4287 [0.4225, 0.4351] |

The means equal `summary.json`'s to the 4 decimals it prints.

**Persona arm minus first-timer, paired** (mean [95% bootstrap CI], t, pages
where the persona is better / 494). Every cell except ADHD SIM survives Holm.

| arm | AUC | NSS | CC | KLD | SIM |
|---|---|---|---|---|---|
| ADHD | +0.0043 [+0.0032, +0.0055], 7.4, 293 | +0.0142 [+0.0085, +0.0200], 4.9, 283 | +0.0083 [+0.0051, +0.0114], 5.2, 276 | -0.0140 [-0.0189, -0.0091], -5.7, 248 | -0.0010 [-0.0024, +0.0003], -1.5, 209 |
| elderly | -0.0030 [-0.0038, -0.0023], -7.9, 164 | -0.0079 [-0.0116, -0.0044], -4.3, 205 | -0.0048 [-0.0068, -0.0029], -4.9, 203 | +0.0270 [+0.0206, +0.0345], 7.6, 175 | -0.0027 [-0.0041, -0.0016], -4.2, 212 |
| dyslexic | -0.0054 [-0.0064, -0.0044], -10.2, 132 | -0.0163 [-0.0212, -0.0116], -6.7, 163 | -0.0098 [-0.0123, -0.0072], -7.4, 166 | +0.0415 [+0.0332, +0.0513], 8.9, 150 | -0.0049 [-0.0065, -0.0034], -6.2, 165 |
| low-vision | -0.0029 [-0.0037, -0.0022], -7.2, 166 | -0.0064 [-0.0105, -0.0026], -3.2, 213 | -0.0043 [-0.0065, -0.0023], -4.0, 201 | +0.0273 [+0.0208, +0.0349], 7.5, 164 | -0.0029 [-0.0044, -0.0017], -4.4, 189 |
| color-blind | +0.0015 [+0.0011, +0.0018], 8.5, 318 | +0.0065 [+0.0048, +0.0083], 7.2, 315 | +0.0033 [+0.0023, +0.0042], 6.7, 306 | -0.0064 [-0.0079, -0.0050], -8.7, 298 | +0.0007 [+0.0004, +0.0011], 4.2, 253 |
| power-user | +0.0017 [+0.0013, +0.0021], 7.9, 305 | +0.0104 [+0.0080, +0.0131], 8.0, 317 | +0.0053 [+0.0039, +0.0067], 7.5, 304 | -0.0058 [-0.0072, -0.0044], -8.2, 287 | +0.0011 [+0.0007, +0.0015], 5.4, 260 |

CC_counts is in the CSV and tracks CC.

**Model minus CenterBias, paired** (first-timer is the model arm; every persona
arm is in the CSV, AUC differences from +0.0804 to +0.0901):

| metric | first-timer minus CenterBias | t (df 493) | pages won / 494 | d_z |
|---|---|---|---|---|
| AUC | +0.0857 [+0.0788, +0.0927] | 24.1 | 439 | 1.08 |
| NSS | +0.3624 [+0.3293, +0.3959] | 21.1 | 421 | 0.95 |
| CC | +0.1808 [+0.1639, +0.1978] | 21.2 | 410 | 0.95 |
| KLD | -0.2130 [-0.2345, -0.1918] | -19.6 | 423 | -0.88 |
| SIM | +0.0645 [+0.0582, +0.0710] | 20.1 | 424 | 0.90 |

**The ceiling, with a CI: per image, not over participants**
(`ceiling-per-image.ts`, `ceiling-intervals.csv`, `ceiling-splits.csv`).
Per-image values are possible, so the CI is a page bootstrap like the arms'.
`legacy32_logsplit` reruns `run-ceiling.ts`'s computation per image and
reproduces its aggregates exactly (AUC 0.8112, NSS 1.4174, 495 images).

| ceiling variant | AUC | NSS | CC | SIM | KLD |
|---|---|---|---|---|---|
| run-ceiling.ts as is (24x32 grid, half-A sigma 1.5 cells, split by log file) | 0.8112 [0.8055, 0.8167] | 1.4174 [1.3772, 1.4577] | | | |
| same grid and kernel, split by person (31/31); 489 images, 6 dropped for a half with under 10 fixations (run-ceiling.ts's rule) | 0.8137 [0.8082, 0.8190] | 1.4333 [1.3918, 1.4757] | | | |
| model's own grid, person split, half-A density sigma 1 cell | 0.8066 [0.8005, 0.8127] | 1.4301 [1.3836, 1.4785] | 0.6370 [0.6218, 0.6518] | 0.5900 [0.5813, 0.5987] | 1.657 [1.505, 1.844] |
| model's grid, half-A kernel at run-ceiling.ts's width (1.5 x C/32 cells) | 0.8105 [0.8043, 0.8165] | 1.4157 [1.3713, 1.4605] | 0.6642 [0.6494, 0.6783] | 0.6128 [0.6046, 0.6206] | 0.817 [0.741, 0.913] |
| CenterBias against half B, 24x32 | 0.6524 [0.6450, 0.6597] | 0.4808 [0.4509, 0.5113] | | | |
| CenterBias against half B, model grid | 0.6525 [0.6452, 0.6600] | 0.4824 [0.4517, 0.5129] | 0.2631 [0.2475, 0.2783] | 0.4342 [0.4273, 0.4411] | 1.078 [1.050, 1.105] |

Split-to-split variability (200 random 31/31 person partitions, mulberry32
0x0c311; the page-mean ceiling of each partition): 24x32 AUC mean 0.8116,
2.5-97.5% 0.8070 to 0.8165; NSS 1.4271, 1.3936 to 1.4639. Model grid AUC
0.8085, 0.8043 to 0.8133. So the page bootstrap CI and the split-to-split
spread are about the same width.

**Share of the achievable gain over CenterBias** (`headroom.py`,
`headroom.json`): (model - CB) / (ceiling - CB), each CenterBias scored
against the same ground truth as the term it is subtracted from, the same
resampled pages in numerator and denominator (10,000 draws):

| metric | ceiling variant | share | 95% CI |
|---|---|---|---|
| AUC | run-ceiling.ts | 0.540 | [0.504, 0.574] |
| AUC | model grid, sigma 1 | 0.556 | [0.519, 0.593] |
| NSS | run-ceiling.ts | 0.387 | [0.356, 0.417] |
| CC | model grid, sigma 1 | 0.483 | [0.445, 0.521] |
| SIM | model grid, sigma 1 | 0.414 | [0.378, 0.451] |

**Caveats.**
- Every persona difference above is statistically clear and tiny: the largest
  is 0.0054 AUC, against a model-minus-CenterBias gap of 0.086. UEyes pools its
  viewers with no group labels, so "ADHD beats first-timer" means the ADHD map
  sits nearer the pooled viewer, not that it models anyone with ADHD better.
  These are not validity results for any persona.
- Pages are the resampling unit. The participants are not resampled, so the
  CIs describe page-to-page variation for this viewer pool.
- The ceiling is ~5 viewers predicting ~5 others (see Surprises: UEyes has about
  9.6 viewers per web page). The model is scored against all ~10. A noisier
  target lowers the ceiling, so the "share" is an upper estimate.
- KLD has no usable split-half ceiling: half-A maps from about 5 people are
  sparse, KLD punishes zeros in the predictor, and the "ceiling" (1.66 at sigma
  1) is worse than the model (0.68). Do not normalise KLD by it.
- 5 images have NaN KLD/SIM in the model-grid ceiling (a half with no
  fixation inside the grid), so those rows have n = 490.

---

## 2. Schwartz values on vs off in the attention model

**Method.** `run-study1-v20.ts --no-values` passes all ten values at
`attention.value.neutral` (0.5). The registry defines that point as "every value
modulation is zero", and a value a persona does not carry is read as it, so
this is exactly "traits without values". Both arms were run on this tree
(ce9f089), all 495 web pages, all 7 personas (`study1-values-on/`,
`study1-values-off/`), and analysed with `study1_intervals.py --paired-with`.
A 3-page pre-check ran values-on twice: byte-identical `per_image.csv`, so the
pipeline (OCR included) is deterministic and on/off are paired page by page.
CenterBias and Uniform rows are byte-identical between the two runs.

**Values-on minus values-off, per page, mean [95% bootstrap CI]**
(`values-on-minus-off.csv`; * = Holm-adjusted p < 0.05 within the metric):

| arm | AUC | NSS | CC | KLD | SIM |
|---|---|---|---|---|---|
| first-timer | -0.0001 [-0.0003, +0.0001] | -0.0004 [-0.0014, +0.0005] | +0.0001 [-0.0004, +0.0006] | +0.0005 [-0.0001, +0.0012] | +0.0005 [+0.0003, +0.0007] * |
| ADHD | +0.0018 [+0.0013, +0.0023] * | +0.0055 [+0.0026, +0.0084] * | +0.0035 [+0.0019, +0.0050] * | -0.0038 [-0.0057, -0.0019] * | -0.0006 [-0.0013, -0.0000] |
| elderly | -0.0002 [-0.0004, +0.0000] | +0.0001 [-0.0009, +0.0012] | +0.0004 [-0.0002, +0.0009] | +0.0036 [+0.0022, +0.0052] * | +0.0003 [+0.0000, +0.0006] |
| dyslexic | -0.0003 [-0.0004, -0.0001] * | -0.0003 [-0.0013, +0.0009] | -0.0002 [-0.0007, +0.0004] | +0.0031 [+0.0021, +0.0041] * | -0.0001 [-0.0003, +0.0002] |
| low-vision | -0.0003 [-0.0004, -0.0001] * | -0.0002 [-0.0008, +0.0005] | -0.0001 [-0.0005, +0.0003] | +0.0034 [+0.0023, +0.0047] * | -0.0002 [-0.0004, +0.0000] |
| color-blind | 0 (identical on every page) | 0 | 0 | 0 | 0 |
| power-user | +0.0000 [-0.0001, +0.0001] | +0.0003 [-0.0001, +0.0009] | +0.0001 [-0.0001, +0.0004] | +0.0001 [-0.0002, +0.0003] | +0.0001 [+0.0000, +0.0002] |

Persona AUC spread (max minus min arm mean): 0.0098 with values, 0.0078
without. Values move the attention model's agreement with gaze by at most
0.0018 AUC. ADHD is the only arm where they improve AUC, NSS, CC and KLD
together. They make KLD slightly worse for elderly, dyslexic and low-vision.
For first-timer and power-user every difference is under 0.0006 (first-timer's
SIM +0.0005 is statistically clear and practically nothing).

**This tree vs the 20.0.1 file (the 21.0 change).** `tree-minus-v20.0.1.csv`:
on the 494 pages both runs scored, every arm and every metric is identical to
6 decimals on every page (all 494 ties, every difference exactly 0). The 21.0
work on this tree (attention constants moved into the registry, the persona
trait corrections in `src/personas.ts` (research/persona-21-corrections.md),
accessibilityTraits) changes nothing Study 1 measures. `src/values` is
unchanged between the two commits (cdcb30c, ce9f089), so the Schwartz values
these arms use are the same in both. The tree also scored page `24425e`,
which the 20.0.1 run lost to an error, so this run has 495 pages to 20.0.1's
494.

**Caveats.**
- `color-blind-deuteranopia` carries all ten values at exactly 0.5, so for it
  "values on" is "values off" by construction; the zero row is not a finding
  about values.
- Same UEyes caveat as section 1: a value effect here is movement toward or
  away from the pooled viewer.

---

## 3. Persona distance: distribution and robustness

**Method** (`persona-distance.ts`). Profiles exactly as `cognitive_distance`
builds its percentile reference: `getCognitiveProfile(p).traits` ->
`buildOTCognitiveProfile` -> `cognitiveDistance(...).w1` (exact generalized W1),
over BUILTIN + ACCESSIBILITY + EMOTIONAL personas: 25 humans, 300 pairs.
`distance-pairs.csv` has every pair with its `overallLevel` contribution.

**Distribution of w1 over the 300 pairs** (w1 can range 0 to 0.4):

| mean | SD | min | 5% | 10% | 25% | median | 75% | 90% | 95% | max |
|---|---|---|---|---|---|---|---|---|---|---|
| 0.0474 | 0.0179 | 0.0169 | 0.0228 | 0.0258 | 0.0339 | 0.0448 | 0.0590 | 0.0691 | 0.0804 | 0.1184 |

Histogram (15 equal bins from 0.0169, width 0.00677): 18, 38, 39, 46, 46, 31,
32, 25, 7, 7, 2, 6, 1, 1, 1 (`distance-summary.json`, `histogram`). The
overall-level term is a median 18% of a pair's w1 (range 0 to 48%).

Closest 10 pairs: screen-reader-user ~ deaf-user 0.0169; deaf-user ~
color-blind-deuteranopia 0.0176; motor-impairment-tremor ~ low-vision-magnified
0.0179; elderly-user ~ elderly-low-vision 0.0188; dyslexic-user ~ dyscalculia
0.0193; distracted-user ~ cognitive-adhd 0.0203; screen-reader-user ~
motor-impairment-tremor 0.0209; low-vision-magnified ~ color-blind-deuteranopia
0.0216; motor-impairment-tremor ~ dyslexic-user 0.0221; mobile-user ~
cognitive-adhd 0.0221.

Farthest 10: explorer ~ intellectual-disability 0.1184; power-user ~
intellectual-disability 0.1060; task-focused ~ intellectual-disability 0.0986;
intellectual-disability ~ confident-user 0.0960; intellectual-disability ~
stoic-user 0.0955; careful-reader ~ intellectual-disability 0.0943;
screen-reader-user ~ intellectual-disability 0.0933; color-blind-deuteranopia ~
intellectual-disability 0.0933; deaf-user ~ intellectual-disability 0.0919;
explorer ~ aphasia-receptive 0.0890. Nine of the ten farthest pairs involve
intellectual-disability.

**Nearest neighbour per persona**, the margin to the runner-up, and how often
it changes under the 200 joint perturbations (tied scheme, below):

| persona | nearest | w1 | runner-up | margin | NN changes |
|---|---|---|---|---|---|
| power-user | confident-user | 0.0224 | stoic-user | 0.0062 | 0% |
| first-timer | elderly-user | 0.0228 | elderly-low-vision | 0.0017 | 42.5% |
| mobile-user | cognitive-adhd | 0.0221 | emotional-user | 0.0002 | 79.5% |
| screen-reader-user | deaf-user | 0.0169 | motor-impairment-tremor | 0.0040 | 0% |
| elderly-user | elderly-low-vision | 0.0188 | anxious-user | 0.0038 | 0% |
| impatient-user | mobile-user | 0.0264 | distracted-user | 0.0009 | 9.0% |
| distracted-user | cognitive-adhd | 0.0203 | mobile-user | 0.0050 | 0% |
| careful-reader | stoic-user | 0.0272 | screen-reader-user | 0.0043 | 0% |
| explorer | task-focused | 0.0312 | confident-user | 0.0010 | 32.0% |
| task-focused | screen-reader-user | 0.0271 | color-blind-deuteranopia | 0.0012 | 19.5% |
| motor-impairment-tremor | low-vision-magnified | 0.0179 | screen-reader-user | 0.0029 | 0% |
| low-vision-magnified | motor-impairment-tremor | 0.0179 | color-blind-deuteranopia | 0.0036 | 0% |
| cognitive-adhd | distracted-user | 0.0203 | mobile-user | 0.0017 | 6.0% |
| dyslexic-user | dyscalculia | 0.0193 | motor-impairment-tremor | 0.0028 | 1.0% |
| deaf-user | screen-reader-user | 0.0169 | color-blind-deuteranopia | 0.0007 | 62.0% |
| elderly-low-vision | elderly-user | 0.0188 | first-timer | 0.0057 | 0% |
| color-blind-deuteranopia | deaf-user | 0.0176 | low-vision-magnified | 0.0040 | 0% |
| autism-spectrum | anxious-user | 0.0297 | elderly-user | 0.0029 | 41.0% |
| intellectual-disability | aphasia-receptive | 0.0390 | elderly-user | 0.0019 | 0% |
| aphasia-receptive | elderly-user | 0.0300 | distracted-user | 0.0021 | 13.0% |
| dyscalculia | dyslexic-user | 0.0193 | mobile-user | 0.0034 | 0% |
| anxious-user | elderly-user | 0.0226 | elderly-low-vision | 0.0048 | 8.0% |
| confident-user | power-user | 0.0224 | color-blind-deuteranopia | 0.0009 | 10.0% |
| emotional-user | mobile-user | 0.0222 | cognitive-adhd | 0.0017 | 3.5% |
| stoic-user | color-blind-deuteranopia | 0.0241 | confident-user | 0.0017 | 43.0% |

**Robustness** (`distance-robustness.csv`). The five constants are changed
through `withParamOverrides`, the registry's own hook, so `src/` is untouched.
Kendall tau-b between the baseline and perturbed rankings of the 300 pairs:

| perturbation | tau-b | personas whose NN changed |
|---|---|---|
| groundSameDomain x0.75 / x1.25 | 0.968 / 0.969 | 2 / 3 |
| groundRelatedDomain x0.75 / x1.25 | 0.913 / 0.928 | 3 / 3 |
| groundUnrelatedDomain x0.75 | 0.948 | 4 |
| groundUnrelatedDomain x1.25 | refused (not a metric) | |
| groundUnrelatedDomain x1.25 with slack raised to 0.50 | 0.927 | 3 |
| groundUnknownTrait x0.75 | 1.000 | 0 |
| groundUnknownTrait x1.25 | refused (not a metric) | |
| slackCost x0.75 | refused (not a metric) | |
| slackCost x1.25 | 0.914 | 4 |

Joint, 200 accepted draws, every constant uniform on [0.75, 1.25] x its value,
kept only when same < related < unrelated and 2 x slack >= the largest ground
cost:

| scheme | draws to get 200 | tau-b median | tau-b 5th pct | min | draws with any NN change | personas with a changed NN per draw (mean) |
|---|---|---|---|---|---|---|
| tied (unknown = unrelated) | 361 | 0.929 | 0.871 | 0.850 | 95.0% | 3.70 |
| independent unknown | 688 | 0.931 | 0.863 | 0.837 | 98.0% | 3.83 |

**Caveats.**
- The metric condition is not optional: below 2 x slack = the largest ground
  cost, `cognitiveDistance` refuses to compute (`generalizedCostMatrix`). Three
  of the ten one-at-a-time perturbations break it, and conditioning the joint
  draws on it pulls the accepted slack upward (median 0.447 tied, 0.460
  independent, against 0.400 at baseline).
- `groundUnknownTrait` moves no built-in distance (tau exactly 1 at x0.75, and
  x1.25 with slack 0.50 gives exactly the slack-x1.25 result). It governs the
  three capacity traits (readingCapacity, motorCapacity, sustainedAttention),
  which `getCognitiveProfile` never sets, so every persona sits at the 0.5
  default on all three and no mass moves there. That is why the tied scheme is
  the primary one: drawing a dead constant independently only adds rejections.
- The pair ranking is stable (tau about 0.93), but nearest neighbours with a
  margin under about 0.002 are not: mobile-user, deaf-user, stoic-user,
  first-timer, autism-spectrum and explorer each change neighbour in 32-80% of
  draws. A sentence of the form "X's nearest persona is Y" holds only for the
  11 personas with 0% above.
- Distances are hand-set-metric distances between hand-set trait vectors; the
  ground costs are registered as hypotheses. Robustness to them says nothing
  about validity against people.

---

## 4. Power for the planned studies (stated-assumption simulation)

This section is a simulation under the assumptions below. It says what the
designs could detect if those assumptions held; it says nothing about what
the studies will find.

**Model-side input** (`ctc-reference-scores.ts` -> `ctc-reference-scores.csv`):
the shipped model's totalCTC (a percentile, 0-1) for every built-in human
persona on every graded page of the shipped reference set (111 pages,
`ctc-reference-2026-10-22`), personas built as `cognitive_effort` builds them
by default (traits, siteFamiliarity 0, capacities bridged, values off).
Viewport scope is primary (the tool's default); `power-*-full_page.*` repeats
everything at full_page scope. First-timer viewport CTC over the 111 pages:
mean 0.709, SD 0.178, quartiles 0.567 / 0.724 / 0.857, range 0.143 to 0.989.

**Assumptions** (all in `power.py`'s header).
- Data-generating model, Study 2: Y_ps = mu + b z_s + u_s + p_p + e_ps, z = the
  page's first-timer CTC standardised by the reference set's mean and SD.
- Effect size delta = b / sS, where sS is the SD of true stimulus means over
  pages drawn from the reference distribution: delta is the correlation between
  a page's CTC and its true mean TLX ("delta SD of the stimulus means per SD of
  CTC"). The stimulus-level residual is then su = sS sqrt(1 - delta^2), and sS
  is gridded at 4, 8 and 12 TLX points.
- Participant intercept SD sp = 12, residual SD se = 16 (total 20). No
  published NASA-TLX variance components were found (Said et al. 2020, J Med
  Internet Res 22(9):e19472, fit exactly this kind of mixed model to 1,160 raw
  TLX questionnaires and report no random-effect estimates). The total of 20 is
  anchored on that paper's raw global TLX interquartile ranges, 27 and 31
  points, which under normality are SDs of about 20 and 23. Study 2 barely
  depends on sp and se (sensitivity below); Study 3 does.
- Every participant rates every stimulus (complete, fully crossed).
- alpha 0.05; Study 2 two-sided, Study 3 one-sided (the hypothesis is
  directional: matched > generic).
- 10,000 simulated studies per cell at S = 16 (Monte Carlo SE at most 0.005),
  5,000 per point of the S curves.

**Analysis and the mixed model.** Study 2 is analysed by OLS of the 16
stimulus means on CTC (df 14). For complete, balanced, fully crossed data
this is the mixed model NASA_TLX ~ CTC + (1|participant) + (1|stimulus), not
an approximation of it: participant intercepts average to a constant the
intercept absorbs, the GLS slope is the OLS slope on stimulus means, and the
correct error term (expected mean square se^2 + P su^2) is the stimulus
residual mean square, so the mixed-model F with Satterthwaite or Kenward-Roger
df equals the means-regression t^2 on S - 2 df. (On power in crossed
participant x stimulus designs generally: Westfall, Kenny and Judd 2014,
J Exp Psychol Gen 143(5):2020-2045.) `power.py` checks the identity on 50 full 100 x 16
participant-level simulated tables before it runs (largest relative error
6.7e-16). Missing ratings would break the identity; then a fitted mixed model
is needed, which this environment cannot fit (no statsmodels or lme4 here).
The random-selection power also agrees with the Fisher-z approximation for a
correlation of delta, attenuated by measurement noise (within 0.04 in every
cell; `power-study2-viewport.csv`).

### Study 2: 16 stimuli, ~100 participants

Power at S = 16 and the stimulus count needed for 80% power (interpolated on a
grid of S; `power-study2-viewport.csv` has every cell), sS = 8. Stimulus CTCs
are drawn from the 111 pages' empirical distribution; "random" draws with
replacement, so S may exceed 111, as if new pages followed the reference
distribution.

| delta | random 16 pages | quantile-stratified | extremes (8 below q25, 8 above q75) | S for 80%: random | stratified | extremes |
|---|---|---|---|---|---|---|
| 0.1 | 0.067 | 0.064 | 0.077 | 819 | 877 | 488 |
| 0.2 | 0.107 | 0.109 | 0.160 | 207 | 220 | 120 |
| 0.3 | 0.200 | 0.197 | 0.317 | 90 | 90 | 52 |
| 0.4 | 0.332 | 0.334 | 0.535 | 48 | 48 | 28 |
| 0.5 | 0.512 | 0.521 | 0.767 | 28 | 29 | 18 |
| 0.6 | 0.706 | 0.743 | 0.924 | 19 | 18 | 12 |
| 0.7 | 0.884 | 0.921 | 0.993 | 13 | 12 | <=8 |
| 0.8 | 0.983 | 0.995 | 1.000 | 9 | <=8 | <=8 |

sS = 12 moves these by at most 0.022 and sS = 4 by at most 0.070 (lower, because
the measurement noise se^2/100 is then a larger share of the stimulus variance).
Varying sp over 0/12/20 and se over 10/16/22 at delta 0.5 gives powers between
0.488 and 0.533 against 0.511 at the assumed values.

Read: with 16 stimuli the design has 80% power only if CTC correlates with a
page's mean TLX at about 0.65 or more (random pages; 0.63 stratified), or about
0.52 with pages chosen from the two ends of the CTC distribution (interpolated
between the grid's 0.1 steps). A moderate
correlation of 0.3 needs about 90 stimuli (52 from the extremes). The
participant count barely matters: CTC varies only between stimuli.

### Study 3: 4 subgroups x 5 participants, matched vs generic

**The model's own matched-minus-generic CTC** (viewport, 111 pages;
per page in `study3-ctc-differences-viewport.csv`):

| persona | corr(matched, first-timer) over pages | matched - first-timer: mean | SD | 5% | median | 95% |
|---|---|---|---|---|---|---|
| cognitive-adhd | 0.809 | -0.238 | 0.141 | -0.474 | -0.226 | -0.034 |
| dyslexic-user | 0.905 | -0.238 | 0.119 | -0.438 | -0.232 | -0.059 |
| low-vision-magnified | 0.813 | -0.396 | 0.121 | -0.588 | -0.397 | -0.192 |
| elderly-user | 0.989 | +0.050 | 0.027 | +0.009 | +0.047 | +0.100 |

These differences are the main driver of Study 3's power: the within-subgroup
regression can only separate the matched from the generic slope through the
part of the matched CTC that the generic CTC does not predict.

**Assumptions added for Study 3.** Same 16 pages for every subgroup. Scenario
"matched is right": bm = delta x sS, bg = 0, sS = 8. Both predictors are
divided by the first-timer reference SD (one scale). The stimulus residual is
half shared across subgroups, half subgroup-specific (an assumption that only
the pooled test below depends on). Each stimulus mean averages 5 people, so the
measurement noise is se / sqrt(5) = 7.2 TLX points, against sS = 8: this is
where the variance assumptions bite.

**Primary analysis (as specified):** within each subgroup, the 16 stimulus
means on [1, generic CTC, matched CTC], one-sided t-test of bm - bg > 0,
df 13. Power at S = 16:

| persona | random 16 pages, delta 0.3 / 0.5 / 0.7 / 0.9 | S for 80% at delta 0.9 (random, max 111) | "divergent" 16 pages, delta 0.3 / 0.5 / 0.7 / 0.9 |
|---|---|---|---|
| cognitive-adhd | 0.09 / 0.13 / 0.19 / 0.31 | 64-80 | 0.15 / 0.29 / 0.49 / 0.77 |
| dyslexic-user | 0.07 / 0.10 / 0.14 / 0.20 | >111 | 0.13 / 0.19 / 0.34 / 0.57 |
| low-vision-magnified | 0.09 / 0.12 / 0.17 / 0.28 | 64-80 | 0.13 / 0.23 / 0.39 / 0.65 |
| elderly-user | 0.06 / 0.06 / 0.07 / 0.07 | >111 | 0.06 / 0.07 / 0.08 / 0.10 |

"Divergent" = the 16 pages with the largest residual of the persona's CTC on
the first-timer's (8 each side), chosen from the model's predictions only,
never from outcomes. It cuts the in-sample correlation of the two predictors
from about 0.81 to 0.32 for ADHD; for elderly-user it stays at 0.97. With
random pages no subgroup reaches 80% at delta 0.5 or below even using all 111
reference pages (ADHD, the best, reaches 0.45).

Size checks (true contrast zero, bm = bg): 0.048, 0.055, 0.051, 0.049; with
generic only (bm = 0): 0.009 to 0.035, below alpha as a one-sided test should be.

**Secondary analysis, pooled within-stimulus:** all four subgroups' stimulus
means (64) on stimulus fixed effects + subgroup fixed effects + matched CTC,
one-sided test of the matched slope (df 44). Stimulus fixed effects absorb
everything about a page that does not change with the persona, the generic CTC
included, so this tests whether the matched CTC explains how the subgroups
differ on the same page: incremental validity of the persona-specific score,
which is weaker than "matched beats generic" (it also rejects when both
slopes are positive). Power: random 16 pages 0.23 / 0.48 / 0.74 / 0.94 at
delta 0.3 / 0.5 / 0.7 / 0.9; 16 pages chosen for the spread of the four
matched CTCs 0.43 / 0.82 / 0.99 / 1.00. Size with generic only: 0.057 (2,000
reps, MC SE 0.005).

**Caveats.**
- elderly-user's matched CTC is the first-timer's to r = 0.989 (difference SD
  0.027 percentile points). No page selection and no plausible effect separates
  them; that arm of Study 3 cannot test matched vs generic.
- On this model, cognitive-adhd, dyslexic-user and low-vision-magnified are
  scored LESS costly than the first-timer on most real pages (median
  differences -0.23, -0.23, -0.40; for low-vision the 95th percentile is still
  -0.19). The level does not enter the within-subgroup regression (it has its
  own intercept; only covariation across pages counts), so it does not change
  the power above. It does matter to any claim of the form "these users find
  pages costlier, as the matched persona predicts": the model says the
  opposite for these three personas.
- The pooled test's power depends on the shared/specific split of stimulus
  variance (0.5 here). More shared variance means more power, less means less.
- Effect sizes for Study 3 are on the same delta scale as Study 2 for
  comparability; there is no published basis for any particular value.
- At full_page scope (`power-*-full_page.*`) Study 2 power moves by at most
  0.016, but Study 3 is worse: the matched and generic CTCs correlate more
  (ADHD 0.910, dyslexic 0.966, low-vision 0.927, elderly 0.990), so even the
  divergent 16 pages reach only 0.40 / 0.22 / 0.31 / 0.10 at delta 0.9, and the
  pooled test 0.57 (random) / 0.64 (divergent).

---

## 5. Page measurement latency on real pages

**Method** (`page-latency.ts`). 30 pages drawn (mulberry32, seed 0x1a7e) from
the 111 graded pages of the shipped reference set, one page per site. cbrowser's
own `CBrowser`, headless, 1920x1080, direct route (proxy variables cleared),
one browser for the whole run, warmed on a 31st reference page (hulu.com)
that is not counted. Per page, as `cognitive_effort` and the reference crawl
do it: `navigate()`, one `measurePageGeometry`, `extractPageMetrics` at
viewport, then at full_page, each timed on its own. Sequential, 4 s between
pages, 120 s ceiling per page. `measurePageRaw` does not exist in this tree,
so the timed calls are the ones the tools make. Run 2026-10-22 about 17:30-17:35
UTC. All 30 pages loaded and none matched the tool's blocked-page signatures.

| step (ms, n = 30) | median | p95 | min | max |
|---|---|---|---|---|
| navigation (`navigate()`, its own load and stability waits) | 3,733 | 13,427 | 833 | 14,712 |
| geometry | 0.4 | 0.8 | 0.3 | 1.9 |
| viewport extraction | 7.1 | 16.7 | 2.4 | 22.4 |
| full_page extraction | 1,821 | 5,966 | 607 | 6,096 |
| viewport total (geometry + extraction) | 7.6 | 17.2 | 2.9 | 22.7 |
| full_page total (geometry + extraction) | 1,821 | 5,967 | 607 | 6,096 |

p95 is the type-7 interpolated quantile of 30 values, so it sits between the
28th and 29th slowest pages; with n = 30 treat it as indicative.

**What the full_page time is.** full_page scrolls the page before it
measures: min(5, screens) steps plus a return to the top, each followed by a
fixed 300 ms wait (`walk.maxSteps` 5, `walk.settleMs` 300, both hand-set in
`provenance/page-metrics.ts`). That is 1.8 s on any page of 5 or more screens.
Subtracting each page's walk waits, (min(5, screens) + 1) x 300 ms, 25 of the 30 pages spend 7 to 281 ms on everything else, the
in-page evaluation included. Five (cloud.google.com, livenation.com,
cigna.com, supabase.com, zoom.us) spend 4.0 to 4.3 s more. I did not
diagnose those; the near-constant 4 s suggests something waits on the page
rather than computes, but that is a guess.

**Caveats.**
- Machine load was not controlled: other work was running on the 16-core box
  and the 1-minute load average across the 30 measurements was 4.3 to 11.4
  (median 6.9). The extraction numbers are small enough that this matters
  little next to the waits; navigation also depends on each site and the
  network at the time.
- One page per site from a list of large commercial sites; not a sample of the
  web.
- The model computation after extraction (demand + chain + percentile) is not
  in these numbers; `research/latency/bench-ctc.ts` times that on data.

---

## Surprises

1. **run-ceiling.ts never split by person.** It reads the participant id with
   `/hk0*(\d+)/i`, but UEyes names its logs `NN_khMMM_fixations.csv` ("kh").
   The regex never matches, so the "554 participants, 277/277" in
   `ceiling.json` are log files (62 people x about 9 blocks). The number
   survives: no person's fixations on one image sit in two logs (0 of 4,764
   person x image pairs), so every per-image split was still person-disjoint,
   and a true 31/31 person split gives 0.8137 [0.8082, 0.8190] against
   0.8112. Only the description was wrong. The fix belongs in run-ceiling.ts
   (not changed here; it is outside research/paper-calcs/).
2. **About 10 viewers per page, not 62.** 4,764 person x image pairs over 495
   web pages is 9.6 viewers per page. The corpus has 62 people; each page's
   ground truth has about ten, and the split-half ceiling is about five
   predicting five.
3. **The 21.0 tree reproduces 20.0.1 exactly** on all 494 shared pages, 7
   arms, 6 metrics (section 2). Expected for the registry refactor; it also
   means none of the 21.0 trait corrections in `src/personas.ts` moved any of
   these seven arms' attention maps (I did not establish which of "trait not
   read by the attention path" or "persona not among the seven" explains each
   correction).
4. **Each run here took 261 s (the two ran side by side); the 20.0.1 run took
   3,762 s** for the same pages with the same harness and no caching
   (tesseract runs per image in both). I do not know why
   the earlier run was 14x slower; machine load at the time is the obvious
   candidate and is not recorded. The 20.0.1 run also lost one page to an
   error that did not recur.
5. **Values barely matter to the attention model** (at most 0.0018 AUC), and
   color-blind-deuteranopia's values are all exactly 0.5.
6. **The model rates three disability personas as less costly than the
   first-timer** on most real pages (section 4, Study 3 table), and
   elderly-user is the first-timer to r = 0.989. Study 3 as designed cannot
   separate matched from generic for elderly at all.
7. **groundUnknownTrait is dead for every built-in pair**, and three of the
   ten one-at-a-time robustness perturbations are refused by the metric
   guard (section 3).
8. **KLD has no split-half ceiling**: five-viewer human maps score worse than
   the model on it.

---

## Files

| file | what |
|---|---|
| `study1_intervals.py` | calculation 1 and the analysis of 2 (bootstrap and t CIs, paired differences, Holm) |
| `study1-intervals-v20.0.1.{csv,json}` | calculation 1 on the 20.0.1 file |
| `inputs/study1-v20.0.1/` | copy of the 2026-10-21 per_image.csv and summary.json |
| `ceiling-per-image.ts` | per-image ceiling, variants, 200 random person splits |
| `ceiling-per-image.csv`, `ceiling-splits.csv`, `ceiling-meta.json`, `ceiling-intervals.{csv,json}` | its outputs and CIs |
| `headroom.py`, `headroom.json` | share of the CenterBias-to-ceiling gap |
| `study1-values-on/`, `study1-values-off/` | the two full Study 1 runs on ce9f089 |
| `values-on-minus-off.{csv,json}` | calculation 2 |
| `tree-minus-v20.0.1.{csv,json}` | this tree vs the 20.0.1 file |
| `persona-distance.ts` | calculation 3 |
| `distance-pairs.csv`, `distance-robustness.csv`, `distance-summary.json` | its outputs |
| `ctc-reference-scores.ts`, `ctc-reference-scores.csv` | model CTC per persona per reference page, both scopes |
| `power.py` | calculation 4 |
| `power-{viewport,full_page}.json`, `power-study2-*.csv`, `power-study3-*.csv`, `study3-ctc-differences-*.csv` | its outputs |
| `page-latency.ts`, `page-latency.{csv,json}` | calculation 5 |
| `logs/` (not committed: the repo ignores `*.log`) | console output of the Study 1 runs, the ceiling, the power runs and the latency run, left in the worktree |

Rerun, as the tree's owner from the worktree root (corpus symlinked first):

```
bun research/study1/run-study1-v20.ts --out research/paper-calcs/study1-values-on
bun research/study1/run-study1-v20.ts --no-values --out research/paper-calcs/study1-values-off
python3 -I research/paper-calcs/study1_intervals.py research/paper-calcs/inputs/study1-v20.0.1/per_image.csv research/paper-calcs/study1-intervals-v20.0.1
python3 -I research/paper-calcs/study1_intervals.py research/paper-calcs/study1-values-on/per_image.csv research/paper-calcs/values-on-minus-off --paired-with research/paper-calcs/study1-values-off/per_image.csv values_off
python3 -I research/paper-calcs/study1_intervals.py research/paper-calcs/study1-values-on/per_image.csv research/paper-calcs/tree-minus-v20.0.1 --paired-with research/paper-calcs/inputs/study1-v20.0.1/per_image.csv v20_0_1
bun research/paper-calcs/ceiling-per-image.ts --splits 200
python3 -I research/paper-calcs/study1_intervals.py research/paper-calcs/ceiling-per-image.csv research/paper-calcs/ceiling-intervals
python3 -I research/paper-calcs/headroom.py research/paper-calcs/inputs/study1-v20.0.1/per_image.csv research/paper-calcs/ceiling-per-image.csv research/paper-calcs/headroom.json
bun research/paper-calcs/persona-distance.ts
bun research/paper-calcs/ctc-reference-scores.ts
python3 -I research/paper-calcs/power.py --reps 10000 --scope viewport
python3 -I research/paper-calcs/power.py --reps 10000 --scope full_page
bun research/paper-calcs/page-latency.ts --n 30
```
