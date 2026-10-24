# Stage B: what it moves against the 21.0 integration branch

"Before" is `feat/cot-integration` at 45be7aa. That is ref-v2's final
reference data (691949d) with no Stage B: the hand-set demand curves and the
old capacities. "After" is this branch at its merge of 45be7aa (0d07eb1; the
golden re-pin on it is 8a447f5), so the delta is everything Stage B adds:
- part 1's persona rates and rate-ratio capacities
  (`research/stage-b-capacity-deltas.md`);
- the custom-persona rules;
- the law-based demand (63b2412 and the commits after it).

Both are scored on the same 513 real reference pages in raw format 2. Every
page carries `groupedLinks`, so none counts its ungrouped links from the
stored nav sizes. That interim rule is now gone for format 2: a format-2
record without `groupedLinks` is refused, and only a format-1 record (none
ships) counts from the nav sizes. An earlier version of this note measured the wiring alone,
part 1 against the laws on the 97c4888 data. It is this file at a5e2346; its
commit ids predate a history rewrite (7bc9d5e is now 63b2412, 4aa544e is
da8cda2).

Integration has since taken ref-v2's re-crawls: 512 pages (42ed67b, which
adds `proseInNav`), then 514 (f4e7bc2, which adds `groupedLinksWithText`),
and stage-c. The tables below stay on the 513 pages they were measured on. On
the 514 pages, with the menu labels' first reads (section 1, menu labels),
the viewport law-time medians are pointing 24.2 s, choosing 2.5 s, reading
21.8 s and procedure 1.4 s (full_page: 71.3, 6.6, 90.0 and 1.4 s).

Scripts: `research/stage-b-capacity-deltas.ts` (golden matrix; `BEFORE=` names
the pin to compare against), `research/stage-b-refset-scores.ts` and
`research/stage-b-refset-layers.ts` (run on a worktree of each commit),
`research/stage-b-refset-times.ts`.

## 1. The law times on the 513 reference pages

Median [p10, p90] of each time in seconds, and the demand it makes
(d = T / (T + 12.4 s)). The last column counts the pages that used the stored
nav sizes for their ungrouped links.

| scope | pointing | choosing | reading | procedure | nav-size rule |
|---|---|---|---|---|---|
| viewport | 24.6 [9.5, 90.9]; d 0.66 [0.43, 0.88] | 2.4 [0.9, 8.5]; d 0.16 [0.07, 0.41] | 25.9 [3.5, 73.3]; d 0.68 [0.22, 0.86] | 1.4 [0.0, 4.1]; d 0.10 [0.00, 0.25] | 0 of 513 |
| full_page | 71.3 [23.1, 220.1]; d 0.85 [0.65, 0.95] | 6.4 [2.1, 20.6]; d 0.34 [0.14, 0.62] | 98.8 [14.7, 371.5]; d 0.89 [0.54, 0.97] | 1.4 [0.0, 5.4]; d 0.10 [0.00, 0.30] | 0 of 513 |

On the earlier 97c4888 data the viewport medians were pointing 24.6 s,
choosing 2.5 s, reading 24.1 s and procedure 1.4 s, so the final data moves
choosing and reading only slightly. Decision demand is the smallest layer
driver, and full_page reading is near saturation, as the design predicted.

### What the reading law reads, and menu labels

Reading takes the outermost-only `prose {chars, words}` and the letter
histogram `text.wordLengths`, which covers the same prose: on every alphabetic
reference page the histogram's counts sum to `prose.words` exactly
(`tests/stage-b-demand.test.ts` pins it). The reading law never reads
`textChars`, which sums nested elements and relies on the 0.4 factor.

Menu labels (ISC-76; Alexa, 2026-10-23). On a first visit a menu label is read
once and then searched, and the search law was calibrated that way: Cockburn,
Gutwin & Greenberg (2007) fitted their visual-search constants without block
1, "presumably because there is an additional cost in reading the menu labels
for the first time. To avoid incorporating this one-off cost in the
calibration of visual search we removed block 1 from the visual search
analysis. Our model is therefore based on visual search for items that have
been previously read."

So the reading law reads the prose outside every group (prose minus
`proseInNav`, in letters, abjad words and CJK characters) at Brysbaert's
rates, and charges each grouped link with visible text one first read,
`law.reading.labelFirstRead` = 0.13 s. That is a hypothesis read off the same
paper's Figure 2: random condition, block 1 (about 0.97 s) minus block 2
(about 0.84 s), by eye to +-0.02 s, eight participants; an upper bound, since
block 1 also carries warm-up. The static+familiar condition shows about
0.07 s. The label seconds are part of the reading time, so the persona's
reading capacity applies to them as to prose; search keeps Cockburn's
constants. On the per-screen path (scope sequential) the label part takes the
new-choices share, as choosing does.

On the 514-page reference (f4e7bc2) the in-group prose is 7.1% of the
reading time at the viewport median (p90 45.2%) and 2.5% at full page (p90
25.7%). Reading, median [p10, p90]:

| scope | all prose at Brysbaert's rate | every grouped link at 0.13 s | links with visible text at 0.13 s (shipped) |
|---|---|---|---|
| viewport | 25.1 s [3.8, 71.6], d 0.67 | 22.4 s [3.0, 69.1], d 0.64 | 21.8 s [2.7, 67.5], d 0.64 |
| full_page | 96.0 s [14.5, 381.2], d 0.89 | 90.9 s [12.3, 341.9], d 0.88 | 90.0 s [12.1, 340.4], d 0.88 |

Only links with something to read are charged (Alexa, 2026-10-23): the first
read is 0.13 s per grouped link whose drawn text holds at least one letter
or digit in any script (`groupedLinksWithText`, measured by ref-v2;
aria-label, title, alt and text hidden, transparent, sub-pixel or clipped do
not count, text in spans the prose selector skips does). An icon-only link
costs no reading. On the 514 pages, 4247 of 9368 grouped links at the
viewport (45.3%) and 7458 of 15856 at full page (47.0%) have no visible text
and cost nothing; a label whose visible text sits outside the prose selector
costs its first read though its text was never in the prose.

A 1 or 2 letter label costs more as a label than as prose: 0.13 s is more than
0.055 s per letter (238 x 4.6 letters per minute). So moving a label from the
prose into a group lowers reading only when the label has at least 3 letters,
one abjad word or one CJK character; `tests/stage-b-demand.test.ts` pins the
property where it holds and the counterexamples where it does not.

### Per-screen charging (cognitive_effort, scope sequential)

Each screen of the sequential curve charges pointing and procedure by the
share of its interactive elements that are new on that screen, and choosing by
the share of its choices that are new. Procedure takes the interactive share
rather than a count of new entry fields because KLM charges an entry step once
per visit: a header search box seen on every screen is one step, not one per
screen. The share assumes a field is as likely to be new as any other control.
A direct count of new entry fields, from the same seen-element set, would
remove that assumption; it is not built. The real-page tables below are
single-scope scores and do not use this path.

## 2. Real reference pages, per persona

Mean over the 513 pages, before / after, with the largest absolute change on
any page in brackets.

### viewport (513 reference pages per persona)

| persona | rawCTC before / after (max abs change) | totalCTC before / after (max abs change) | abandonmentRisk before / after (max abs change) |
|---|---|---|---|
| power-user | 0.547 / 0.332 (0.821) | 0.502 / 0.314 (0.789) | 0.329 / 0.154 (0.640) |
| first-timer | 0.839 / 0.809 (0.908) | 0.714 / 0.726 (0.300) | 0.373 / 0.325 (0.335) |
| mobile-user | 0.281 / 0.473 (0.524) | 0.273 / 0.485 (0.543) | 0.141 / 0.250 (0.407) |
| screen-reader-user | 0.378 / 0.349 (0.539) | 0.350 / 0.332 (0.436) | 0.086 / 0.059 (0.279) |
| elderly-user | 0.975 / 1.029 (0.776) | 0.767 / 0.809 (0.252) | 0.415 / 0.425 (0.219) |
| impatient-user | 0.413 / 0.593 (0.582) | 0.426 / 0.583 (0.541) | 0.468 / 0.582 (0.584) |
| distracted-user | 0.559 / 0.727 (0.621) | 0.533 / 0.665 (0.510) | 0.333 / 0.410 (0.423) |
| careful-reader | 0.954 / 0.400 (1.531) | 0.701 / 0.355 (0.760) | 0.340 / 0.098 (0.592) |
| explorer | 0.674 / 0.353 (0.968) | 0.604 / 0.337 (0.712) | 0.241 / 0.071 (0.506) |
| task-focused | 0.358 / 0.256 (0.598) | 0.343 / 0.228 (0.685) | 0.130 / 0.055 (0.389) |
| motor-impairment-tremor | 0.355 / 0.483 (0.397) | 0.333 / 0.492 (0.448) | 0.095 / 0.125 (0.180) |
| low-vision-magnified | 0.321 / 0.443 (0.507) | 0.321 / 0.459 (0.515) | 0.071 / 0.101 (0.281) |
| cognitive-adhd | 0.458 / 0.607 (0.499) | 0.450 / 0.576 (0.463) | 0.366 / 0.437 (0.425) |
| dyslexic-user | 0.471 / 0.526 (0.529) | 0.449 / 0.524 (0.381) | 0.164 / 0.157 (0.275) |
| deaf-user | 0.311 / 0.340 (0.318) | 0.291 / 0.338 (0.412) | 0.091 / 0.077 (0.212) |
| elderly-low-vision | 0.925 / 0.922 (0.825) | 0.750 / 0.765 (0.278) | 0.295 / 0.270 (0.332) |
| color-blind-deuteranopia | 0.271 / 0.292 (0.350) | 0.255 / 0.286 (0.444) | 0.064 / 0.048 (0.224) |
| autism-spectrum | 0.826 / 0.531 (1.208) | 0.652 / 0.488 (0.669) | 0.404 / 0.236 (0.534) |
| intellectual-disability | 1.301 / 1.195 (1.014) | 0.858 / 0.856 (0.308) | 0.667 / 0.613 (0.347) |
| aphasia-receptive | 0.735 / 0.698 (0.655) | 0.639 / 0.651 (0.247) | 0.392 / 0.353 (0.346) |
| dyscalculia | 0.327 / 0.430 (0.387) | 0.317 / 0.438 (0.439) | 0.151 / 0.172 (0.235) |
| anxious-user | 0.694 / 0.620 (0.874) | 0.626 / 0.588 (0.291) | 0.250 / 0.184 (0.462) |
| confident-user | 0.398 / 0.336 (0.518) | 0.404 / 0.336 (0.585) | 0.209 / 0.126 (0.446) |
| emotional-user | 0.514 / 0.662 (0.582) | 0.514 / 0.629 (0.456) | 0.308 / 0.381 (0.435) |
| stoic-user | 0.474 / 0.275 (0.815) | 0.431 / 0.240 (0.775) | 0.173 / 0.063 (0.421) |

### full_page (513 reference pages per persona)

| persona | rawCTC before / after (max abs change) | totalCTC before / after (max abs change) | abandonmentRisk before / after (max abs change) |
|---|---|---|---|
| power-user | 0.935 / 0.629 (0.821) | 0.544 / 0.336 (0.567) | 0.613 / 0.381 (0.640) |
| first-timer | 1.353 / 1.281 (0.993) | 0.697 / 0.711 (0.330) | 0.622 / 0.581 (0.390) |
| mobile-user | 0.384 / 0.731 (0.588) | 0.190 / 0.422 (0.426) | 0.279 / 0.507 (0.452) |
| screen-reader-user | 0.741 / 0.696 (0.629) | 0.421 / 0.384 (0.364) | 0.242 / 0.208 (0.296) |
| elderly-user | 1.558 / 1.643 (0.845) | 0.756 / 0.812 (0.289) | 0.653 / 0.674 (0.313) |
| impatient-user | 0.512 / 0.875 (0.678) | 0.277 / 0.517 (0.482) | 0.647 / 0.808 (0.680) |
| distracted-user | 0.846 / 1.138 (0.785) | 0.475 / 0.654 (0.557) | 0.554 / 0.680 (0.576) |
| careful-reader | 1.703 / 0.917 (1.572) | 0.789 / 0.482 (0.697) | 0.627 / 0.318 (0.603) |
| explorer | 1.130 / 0.714 (0.968) | 0.636 / 0.389 (0.651) | 0.495 / 0.245 (0.506) |
| task-focused | 0.644 / 0.463 (0.588) | 0.373 / 0.216 (0.412) | 0.309 / 0.179 (0.350) |
| motor-impairment-tremor | 0.713 / 0.852 (0.486) | 0.401 / 0.492 (0.293) | 0.278 / 0.329 (0.195) |
| low-vision-magnified | 0.553 / 0.748 (0.525) | 0.305 / 0.432 (0.380) | 0.205 / 0.293 (0.324) |
| cognitive-adhd | 0.668 / 0.946 (0.567) | 0.375 / 0.551 (0.397) | 0.592 / 0.709 (0.517) |
| dyslexic-user | 0.858 / 0.903 (0.714) | 0.474 / 0.522 (0.281) | 0.374 / 0.378 (0.287) |
| deaf-user | 0.590 / 0.613 (0.401) | 0.331 / 0.330 (0.245) | 0.260 / 0.248 (0.225) |
| elderly-low-vision | 1.463 / 1.508 (0.894) | 0.733 / 0.778 (0.326) | 0.538 / 0.535 (0.339) |
| color-blind-deuteranopia | 0.463 / 0.462 (0.393) | 0.246 / 0.214 (0.315) | 0.181 / 0.159 (0.267) |
| autism-spectrum | 1.532 / 1.075 (1.285) | 0.732 / 0.570 (0.515) | 0.690 / 0.515 (0.515) |
| intellectual-disability | 1.955 / 1.760 (1.159) | 0.843 / 0.842 (0.217) | 0.832 / 0.797 (0.268) |
| aphasia-receptive | 1.269 / 1.125 (0.841) | 0.659 / 0.632 (0.288) | 0.649 / 0.595 (0.296) |
| dyscalculia | 0.565 / 0.703 (0.398) | 0.310 / 0.398 (0.290) | 0.351 / 0.401 (0.251) |
| anxious-user | 1.205 / 1.149 (0.935) | 0.637 / 0.639 (0.385) | 0.523 / 0.470 (0.479) |
| confident-user | 0.622 / 0.545 (0.507) | 0.357 / 0.279 (0.377) | 0.424 / 0.307 (0.423) |
| emotional-user | 0.741 / 1.032 (0.661) | 0.417 / 0.602 (0.470) | 0.543 / 0.676 (0.510) |
| stoic-user | 0.907 / 0.578 (0.928) | 0.519 / 0.296 (0.517) | 0.402 / 0.214 (0.444) |

At the viewport, mean totalCTC falls most for power-user (0.502 -> 0.314),
careful-reader (0.701 -> 0.355), explorer (0.604 -> 0.337) and stoic-user
(0.431 -> 0.240). It rises most for mobile-user (0.273 -> 0.485),
motor-impairment-tremor (0.333 -> 0.492), impatient-user (0.426 -> 0.583) and
low-vision-magnified (0.321 -> 0.459).

## 3. Face validity: first-timer against the impaired personas

An earlier measurement found the ADHD, dyslexic and low-vision personas cost
less than first-timer on real pages. Mean totalCTC on real pages:

| persona | viewport before | viewport after | full_page before | full_page after |
|---|---|---|---|---|
| first-timer | 0.714 | 0.726 | 0.697 | 0.711 |
| power-user | 0.502 | 0.314 | 0.544 | 0.336 |
| cognitive-adhd | 0.450 | 0.576 | 0.375 | 0.551 |
| dyslexic-user | 0.449 | 0.524 | 0.474 | 0.522 |
| low-vision-magnified | 0.321 | 0.459 | 0.305 | 0.432 |
| elderly-low-vision | 0.750 | 0.765 | 0.733 | 0.778 |
| motor-impairment-tremor | 0.333 | 0.492 | 0.401 | 0.492 |
| elderly-user | 0.767 | 0.809 | 0.756 | 0.812 |
| intellectual-disability | 0.858 | 0.856 | 0.843 | 0.842 |

The ordering still holds, but every gap narrows. At the viewport, the gaps to
first-timer were 0.264 (ADHD), 0.265 (dyslexic), 0.393 (low vision) and 0.381
(tremor); they are now 0.150, 0.202, 0.267 and 0.234.

The source is not a Stage B layer. Mean layer costs on the viewport pages,
before -> after:

| persona | visualComplexity | cognitiveLoad | decision | motor | motorProcedure | frustration | readability | readingAttention |
|---|---|---|---|---|---|---|---|---|
| first-timer | 0.019 -> 0.019 | 0.436 -> 0.436 | 0.107 -> 0.103 | 0.008 -> 0.057 | 0.137 -> 0.004 | 0.058 -> 0.059 | 0.018 -> 0.058 | 0.044 -> 0.059 |
| cognitive-adhd | 0.019 -> 0.019 | 0.174 -> 0.174 | 0.070 -> 0.128 | 0.001 -> 0.053 | 0.040 -> 0.001 | 0.117 -> 0.117 | 0.001 -> 0.061 | 0.032 -> 0.045 |
| dyslexic-user | 0.024 -> 0.024 | 0.212 -> 0.212 | 0.079 -> 0.082 | 0.004 -> 0.054 | 0.042 -> 0.001 | 0.053 -> 0.053 | 0.043 -> 0.081 | 0.010 -> 0.013 |
| low-vision-magnified | 0.045 -> 0.045 | 0.093 -> 0.093 | 0.100 -> 0.066 | 0.002 -> 0.051 | 0.007 -> 0.000 | 0.039 -> 0.039 | 0.012 -> 0.117 | 0.019 -> 0.027 |
| motor-impairment-tremor | 0.024 -> 0.024 | 0.095 -> 0.095 | 0.136 -> 0.067 | 0.031 -> 0.184 | 0.008 -> 0.000 | 0.051 -> 0.050 | 0.002 -> 0.054 | 0.004 -> 0.005 |
| power-user | 0.043 -> 0.043 | 0.056 -> 0.056 | 0.377 -> 0.070 | 0.003 -> 0.051 | 0.000 -> 0.000 | 0.059 -> 0.057 | 0.000 -> 0.052 | 0.000 -> 0.000 |

first-timer's cost is mostly cognitiveLoad: 0.436 against 0.174 (ADHD) and
0.212 (dyslexic). That layer reads dispositions (comprehension, working
memory, information foraging, site familiarity, transfer learning) on
hand-set curves, and Stage B does not touch it. On the layers Stage B changed,
the order is the expected one:
- readability: low-vision-magnified 0.117, dyslexic-user 0.081, first-timer
  0.058;
- motor: motor-impairment-tremor 0.184, against 0.051 to 0.057 for the others;
- decision: power-user falls from 0.377 to 0.070;
- motorProcedure nearly vanishes (first-timer 0.137 -> 0.004): procedure is
  now KLM M per entry step, median 1.4 s (d 0.10) at the viewport.

## 4. Golden matrix (synthetic pages)

Before is integration's pin (`tests/fixtures/ctc-golden-21.0.0.json` at
45be7aa), after is this branch's. The golden's hand-built pages take law
times that ask the demand the retired curves asked of their counts
(`tests/fixtures/law-seconds.ts`), so the motor, reading and procedure demands
are unchanged on them. What moves:
- part 1's capacities (the table at the end);
- satisficing and riskTolerance, which now come from choosing alone;
- sustainedAttention, whose base is the reading demand;
- the "max" page and the wall screens, which carry the design's maxima, above
  every real page;
- totalCTC, which is ranked against a reference curve derived through the
  laws.

132327 of 227745 pinned numbers (runs and scroll) change.

Runs per persona: 76. "max abs change" is the largest absolute change over those runs.

### rawCTC

| persona | mean before | mean after | mean change | max abs change |
|---|---|---|---|---|
| power-user | 0.880 | 0.919 | +0.039 | 0.332 |
| first-timer | 0.993 | 0.965 | -0.028 | 0.253 |
| mobile-user | 0.642 | 0.681 | +0.039 | 0.316 |
| screen-reader-user | 0.739 | 0.742 | +0.003 | 0.294 |
| elderly-user | 1.067 | 1.080 | +0.013 | 0.215 |
| impatient-user | 0.834 | 0.848 | +0.014 | 0.222 |
| distracted-user | 0.857 | 0.851 | -0.006 | 0.093 |
| careful-reader | 1.023 | 1.013 | -0.010 | 0.213 |
| explorer | 0.895 | 0.925 | +0.030 | 0.193 |
| task-focused | 0.629 | 0.653 | +0.024 | 0.253 |
| motor-impairment-tremor | 0.677 | 0.728 | +0.051 | 0.275 |
| low-vision-magnified | 0.629 | 0.658 | +0.028 | 0.242 |
| cognitive-adhd | 0.775 | 0.788 | +0.014 | 0.237 |
| dyslexic-user | 0.791 | 0.775 | -0.016 | 0.153 |
| deaf-user | 0.650 | 0.669 | +0.019 | 0.249 |
| elderly-low-vision | 1.087 | 1.110 | +0.023 | 0.264 |
| color-blind-deuteranopia | 0.579 | 0.598 | +0.019 | 0.221 |
| autism-spectrum | 0.927 | 0.918 | -0.009 | 0.180 |
| intellectual-disability | 1.318 | 1.291 | -0.027 | 0.276 |
| aphasia-receptive | 0.897 | 0.892 | -0.005 | 0.161 |
| dyscalculia | 0.677 | 0.684 | +0.007 | 0.119 |
| anxious-user | 0.939 | 0.924 | -0.015 | 0.178 |
| confident-user | 0.701 | 0.735 | +0.034 | 0.234 |
| emotional-user | 0.864 | 0.865 | +0.000 | 0.093 |
| stoic-user | 0.721 | 0.734 | +0.013 | 0.153 |
| boundary-floor | 3.382 | 3.300 | -0.082 | 0.660 |
| boundary-sparse | 0.481 | 0.468 | -0.014 | 0.192 |

### totalCTC

| persona | mean before | mean after | mean change | max abs change |
|---|---|---|---|---|
| power-user | 0.530 | 0.550 | +0.020 | 0.153 |
| first-timer | 0.623 | 0.617 | -0.006 | 0.114 |
| mobile-user | 0.476 | 0.491 | +0.014 | 0.160 |
| screen-reader-user | 0.495 | 0.474 | -0.022 | 0.209 |
| elderly-user | 0.641 | 0.631 | -0.010 | 0.236 |
| impatient-user | 0.588 | 0.594 | +0.006 | 0.066 |
| distracted-user | 0.573 | 0.564 | -0.009 | 0.158 |
| careful-reader | 0.540 | 0.509 | -0.031 | 0.294 |
| explorer | 0.552 | 0.566 | +0.014 | 0.135 |
| task-focused | 0.425 | 0.426 | +0.001 | 0.147 |
| motor-impairment-tremor | 0.460 | 0.471 | +0.011 | 0.156 |
| low-vision-magnified | 0.461 | 0.457 | -0.004 | 0.172 |
| cognitive-adhd | 0.536 | 0.526 | -0.010 | 0.223 |
| dyslexic-user | 0.534 | 0.525 | -0.009 | 0.124 |
| deaf-user | 0.459 | 0.456 | -0.003 | 0.175 |
| elderly-low-vision | 0.672 | 0.669 | -0.003 | 0.158 |
| color-blind-deuteranopia | 0.418 | 0.414 | -0.005 | 0.155 |
| autism-spectrum | 0.526 | 0.503 | -0.023 | 0.232 |
| intellectual-disability | 0.706 | 0.703 | -0.004 | 0.101 |
| aphasia-receptive | 0.553 | 0.547 | -0.007 | 0.162 |
| dyscalculia | 0.489 | 0.483 | -0.006 | 0.142 |
| anxious-user | 0.612 | 0.594 | -0.019 | 0.170 |
| confident-user | 0.495 | 0.511 | +0.016 | 0.113 |
| emotional-user | 0.591 | 0.591 | -0.000 | 0.104 |
| stoic-user | 0.443 | 0.439 | -0.004 | 0.165 |
| boundary-floor | 0.789 | 0.789 | +0.000 | 0.040 |
| boundary-sparse | 0.296 | 0.279 | -0.017 | 0.143 |

### abandonmentRisk

| persona | mean before | mean after | mean change | max abs change |
|---|---|---|---|---|
| power-user | 0.303 | 0.323 | +0.021 | 0.153 |
| first-timer | 0.328 | 0.326 | -0.002 | 0.077 |
| mobile-user | 0.274 | 0.303 | +0.029 | 0.172 |
| screen-reader-user | 0.153 | 0.161 | +0.008 | 0.094 |
| elderly-user | 0.341 | 0.348 | +0.007 | 0.107 |
| impatient-user | 0.548 | 0.551 | +0.003 | 0.071 |
| distracted-user | 0.369 | 0.367 | -0.002 | 0.047 |
| careful-reader | 0.273 | 0.273 | +0.000 | 0.062 |
| explorer | 0.214 | 0.226 | +0.012 | 0.067 |
| task-focused | 0.166 | 0.183 | +0.017 | 0.086 |
| motor-impairment-tremor | 0.165 | 0.192 | +0.027 | 0.128 |
| low-vision-magnified | 0.147 | 0.166 | +0.020 | 0.107 |
| cognitive-adhd | 0.424 | 0.434 | +0.010 | 0.139 |
| dyslexic-user | 0.229 | 0.228 | -0.001 | 0.072 |
| deaf-user | 0.166 | 0.184 | +0.017 | 0.089 |
| elderly-low-vision | 0.275 | 0.285 | +0.010 | 0.125 |
| color-blind-deuteranopia | 0.129 | 0.147 | +0.017 | 0.078 |
| autism-spectrum | 0.341 | 0.341 | +0.000 | 0.053 |
| intellectual-disability | 0.511 | 0.507 | -0.004 | 0.043 |
| aphasia-receptive | 0.364 | 0.366 | +0.002 | 0.079 |
| dyscalculia | 0.255 | 0.269 | +0.014 | 0.091 |
| anxious-user | 0.270 | 0.267 | -0.002 | 0.089 |
| confident-user | 0.247 | 0.267 | +0.020 | 0.113 |
| emotional-user | 0.394 | 0.399 | +0.005 | 0.075 |
| stoic-user | 0.193 | 0.204 | +0.011 | 0.056 |
| boundary-floor | 0.874 | 0.874 | -0.000 | 0.002 |
| boundary-sparse | 0.164 | 0.158 | -0.006 | 0.052 |

### Capacities after (as the golden matrix builds them)

| persona | motorCapacity | readingCapacity |
|---|---|---|
| power-user | 0.500 | 0.500 |
| first-timer | 0.500 | 0.500 |
| mobile-user | 0.413 | 0.500 |
| screen-reader-user | 0.500 | 0.500 |
| elderly-user | 0.395 | 0.460 |
| impatient-user | 0.500 | 0.500 |
| distracted-user | 0.500 | 0.500 |
| careful-reader | 0.500 | 0.500 |
| explorer | 0.500 | 0.500 |
| task-focused | 0.500 | 0.500 |
| motor-impairment-tremor | 0.266 | 0.500 |
| low-vision-magnified | 0.500 | 0.353 |
| cognitive-adhd | 0.500 | 0.484 |
| dyslexic-user | 0.500 | 0.431 |
| deaf-user | 0.500 | 0.500 |
| elderly-low-vision | 0.395 | 0.353 |
| color-blind-deuteranopia | 0.500 | 0.500 |
| autism-spectrum | 0.500 | 0.500 |
| intellectual-disability | 0.500 | 0.444 |
| aphasia-receptive | 0.500 | 0.446 |
| dyscalculia | 0.500 | 0.500 |
| anxious-user | 0.500 | 0.500 |
| confident-user | 0.500 | 0.500 |
| emotional-user | 0.500 | 0.500 |
| stoic-user | 0.500 | 0.500 |

## 5. The DRO bound: the interaction re-scan on the Stage B chain

The Wasserstein-DRO bound (`src/visual/dro-bound.ts`) bounds rawCTC as a
function of capacity at a fixed demand vector. Stage B leaves the bound and the
chain's layers unchanged, but it moves the demand vectors the bound is
evaluated at, including those of the interaction pages that refute M2, M2b and
M10. `research/stage-b-dro-scan.ts` reruns the scan that found those pages, on
9de1cf3 (integration 42ed67b plus the scan itself), and adds two families the
original did not have: the law-time generator's own grid and the real pages.

**Demand vectors moved** (`--demands`, integration 45be7aa against this tree).
440 of the 512 count-described pages (the 508 old-grid pages and the 4
interaction pages) move: riskTolerance by up to 0.735, satisficing by up to
0.784 and sustainedAttention by up to 0.085; no other coordinate moves. The
fixture said fromCounts kept every demand vector and kill margin; that was
false, and its comment now says so.

**Kill table** (`tests/dro-bound-mutants.test.ts`, seeds 1-3): every must-kill
mutant is killed on 3 of 3 seeds (M1, M2, M2b, M3, M5 to M10, M12, M13, P1 to
P6); M11 and M14 survive on 3 of 3, as before (reported, not required); the
unmutated control survives every check.

**Interaction pages** (`--margins`, seeds 1-14): the smallest, over seeds, of
the largest observed/bound. Every page kills M2 and M10 on 14 of 14 seeds on
both trees, and the shipped bound is never exceeded (at most 0.9996).

| page | M2, 45be7aa -> this tree | M10, 45be7aa -> this tree |
|---|---|---|
| trace-text+choices | 1.346 -> 1.246 | 1.147 -> 1.109 |
| trace-text+depth | 1.463 -> 1.463 | 1.188 -> 1.188 |
| info+trace-visual+depth | 1.347 -> 1.347 | 1.147 -> 1.147 |
| light-text+choices | 1.338 -> 1.234 | 1.144 -> 1.104 |

The two choice pages lost margin, because satisficing and riskTolerance now
come from choosing alone; the other two did not move.

**The re-scan.** For each page and option set, the steepest secant slope along
each of the 30 capacity coordinates, against the per-coordinate bound of the
shipped file and of each slope mutant (M12, M13 and P1 to P6 change the
population bound or the preconditions, so they are not in it). Cell: the
largest observed/bound over the family's pages (slopes above the 1e-9
tolerance only), then the pages where some coordinate exceeds the bound.

| bound | must kill | old-grid | old-sparse | law-grid | law-sparse | real | all |
|---|---|---|---|---|---|---|---|
| control | survive | 0.9999; 0 | 1.0000; 0 | 1.0000; 0 | 1.0000; 0 | 0.9998; 0 | 1.0000; 0 |
| M1 | yes | 1.5260; 438 | 1.3751; 1763 | 1.4965; 1864 | 1.3183; 1830 | 1.4079; 1024 | 1.5260; 6919 |
| M2 | yes | 1.4313; 160 | 1.6216; 658 | 1.3901; 852 | 1.6479; 915 | 1.1306; 43 | 1.6479; 2628 |
| M2b | yes | 1.4313; 160 | 1.6216; 658 | 1.3901; 852 | 1.6479; 915 | 1.1306; 43 | 1.6479; 2628 |
| M3 | yes | inf; 474 | inf; 1910 | inf; 1922 | inf; 1964 | inf; 1024 | inf; 7294 |
| M5 | yes | 1.9999; 508 | 1.9999; 1971 | 1.9999; 2044 | 1.9999; 1992 | 1.9996; 1024 | 1.9999; 7539 |
| M6 | yes | 20.2640; 192 | 1141760.9975; 669 | 1.0000; 0 | 29744423.7245; 202 | 101.0334; 70 | 29744423.7245; 1133 |
| M7 | yes | 1.6632; 264 | 1.6658; 1085 | 1.0000; 0 | 1.6658; 291 | 1.6642; 217 | 1.6658; 1857 |
| M8 | yes | inf; 384 | inf; 1472 | inf; 1024 | inf; 988 | inf; 1009 | inf; 4877 |
| M9 | yes | 1.1111; 508 | 1.1111; 1971 | 1.1111; 2044 | 1.1111; 1992 | 1.1109; 1024 | 1.1111; 7539 |
| M10 | yes | 1.1770; 115 | 1.2367; 429 | 1.1629; 456 | 1.2443; 503 | 1.0246; 3 | 1.2443; 1506 |
| M11 | info | 0.9999; 0 | 1.0000; 0 | 1.0000; 0 | 1.0000; 0 | 0.9998; 0 | 1.0000; 0 |
| M14 | info | 0.9999; 0 | 1.0000; 0 | 1.0000; 0 | 1.0000; 0 | 0.9998; 0 | 1.0000; 0 |

- The shipped bound is exceeded on 0 of 7576 pages. Its largest
  observed/bound is 0.999998 (law-sparse/754, readingTendency, symmetric).
- Every must-kill slope mutant is exceeded in every family but two cells: M6
  and M7 (both edit the readingTendency path's content gate) are never
  exceeded on the law grid's 2044 pages. The sparse and real families exceed
  both, so the grid alone would not have refuted them.
- On real pages alone the interaction terms are rarely tight: M2 is exceeded
  on 43 of 1024 real demand vectors (largest 1.13x) and M10 on 3 (1.025x). The
  synthetic families keep those kills robust (M10 up to 1.24x on law-sparse).
- M11 and M14: no slope above their bounds anywhere. Their largest ratios equal
  the shipped bound's, so the depletion-coupling term still over-counts by more
  than twice.
- 42ed67b against 8707e49: the 6552 synthetic pages give identical violation
  counts on both trees, as they must (neither the chain nor the bound
  changed); only the real family moves with the re-crawl (513 to 512 pages per
  scope).
- With the menu labels' first reads (section 1), only the real family's
  demand vectors move, and it was scanned again: the shipped bound is exceeded
  on 0 of 1024 (largest 0.99979); M2 on 34, M10 on 3 (1.025x), M6 on 79, M7 on
  239; M11 and M14 never.
- This scan predates Stage C (f4e7bc2), which stops informationDensity,
  textDensity and navigationDepth from making demand. On the merged tree the
  interaction pages' margins (`--margins`, seeds 1-14) are: trace-text+choices
  M2 1.191x and M10 1.087x on 14 of 14 seeds; light-text+choices M2 1.025x on
  14 of 14 and M10 never (0.983x); trace-text+depth and info+trace-visual+depth
  exceed neither (0.9995x, the shipped bound's). The label constant is read by
  none of these pages, so the loss is Stage C's. The kill table still holds,
  carried by the rest of the search.
