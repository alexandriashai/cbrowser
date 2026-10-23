# Persona trait norms: instruments, correlations, norm-implied values

Research for the CHI paper, section 3.1.1. This README is the research
round, which changed nothing under `src/`. The second round applied the
qualifying cells: two values changed (cognitive-adhd and autism-spectrum
workingMemory), and the 51 other cells considered are listed with reasons in
[applied.md](applied.md). The tables below still show the values from before
that change.

- **Tree:** `feat/persona-norms` at ce9f089.
- **Retrieved:** 2026-10-22.
- **Citations:** every citation, with the table, page or paragraph each number
  came from, is in [sources.md](sources.md).
- **Arithmetic:** done by the scripts in this folder, run with bun as wyld-web.

| file | what it does |
|---|---|
| `dump-personas.ts` | prints the current trait values of the 12 population-named personas, including the 3 bridged capacities, read from `src/personas.ts` on this tree |
| `norm-implied.ts` | deliverable 3: every effect size, the conversion to a value, its interval, the current value and the gap |
| `sro-correlations.ts` | deliverable 2: trait-pair correlations computed from the Self-Regulation Ontology open data |
| `coverage.ts` | the coverage counts of deliverable 2, with every trait name checked against `COGNITIVE_TRAITS` |
| `applied.md` | round 2: the cells set to their norm-implied value, and why every other considered cell was not |
| `ctc-deltas.ts`, `ctc-deltas.md` | round 2: what those two values moved in the CTC golden matrix |

**How the sources were read.** Four research sub-agents read sources in
parallel in the same session. I then reopened every number that drives a value
in the ranking or a 0.15 flag. sources.md marks each source "read by lead" or
"read by sub-agent". Where only an abstract was available, only the abstract's
statements are used.

## Conventions

**The method of section 3.1.1.** A persona's value on a trait is the
percentile, within a typical reference population, of its own population's
mean on a normed instrument. Put as a formula:

```
zInst  = (population mean - reference mean) / reference SD, on the instrument as scored
sign   = +1 if a higher instrument score means MORE of the trait (src/trait-reference.ts), else -1
value  = Phi(sign * zInst)          typical reference = 0.5
```

The worked cases that follow from it:

- **Deficits.** A deficit d is reported as reference minus population, so
  positive means the population is worse. On a capacity whose high end is
  better, the value is `Phi(-d)`.
- **Traits whose high end is the deficit-like behaviour.** Examples are
  `timeHorizon` (wants results now), `changeBlindness` (misses more) and
  `anchoringBias`. For these, the sign flips. ADHD discounting more steeply
  gives `Phi(+0.40)`.
- **Intervals.** A 95% CI on d maps to `[Phi(sign*lo), Phi(sign*hi)]`. When a
  source reports a range across tasks or measures instead of a CI, the
  interval is that range, labelled "range".
- **r instead of d.** When only r is reported (Kofler 2020), d uses the
  equal-n conversion d = 2r/sqrt(1-r^2). It reproduces the paper's own d to
  within 0.02 (2.016 vs 2.03; 1.622 vs 1.63). The CI comes from Fisher z on r
  with the paper's N.

**What "fit" means.**

- **good:** the instrument measures what the trait means here, not just what
  its name suggests.
- **partial:** the instrument overlaps the trait's meaning but measures
  something narrower or adjacent. The reason is given in each case.
- **none:** no validated instrument was found. When fit is applied to a single
  effect in deliverable 3, **weak** means the effect is reported but kept out
  of the ranking.

---

## 1. Trait-to-instrument table (29 dimensions)

The meaning given for each trait is the definition in `src/trait-reference.ts`,
or the bridge comment in `src/visual/cognitive-models.ts`. Norms are listed only
when they were retrieved this session.

| # | trait | meaning here | best validated instrument | fit | reason | norms retrieved (population, N, source) |
|---|---|---|---|---|---|---|
| 1 | patience | tolerance for delays, loading, friction before abandoning | none | none | No instrument measures tolerance of interface delay. The nearest, CANTAB CGT "delay aversion", is a betting-timing index. | none |
| 2 | riskTolerance | willingness to click unfamiliar elements or take uncertain actions | DOSPERT risk-taking (self-report); behavioural risky-choice tasks (BART, CGT) | partial | Both measure general risk propensity, not exploring an interface. Age effects even reverse sign across tasks (Mata 2011). | no population norms; large-sample distribution N = 522 Mechanical Turk adults (Eisenberg 2019 data) |
| 3 | comprehension | grasp of UI conventions (not reading) | Computer Proficiency Questionnaire | partial | Self-rated ability to do computer tasks, not recognition of conventions | older adults only (Boot 2015; includes 276 with minimal computer experience) |
| 4 | persistence | retries the same approach rather than switching or abandoning | UPPS-P (lack of) perseverance, reversed; WCST perseverative errors | partial | The trait joins two things: not giving up (UPPS-P) and not switching approach (WCST perseveration). Each instrument covers one. | none (N = 522 distribution, Eisenberg 2019 data) |
| 5 | curiosity | explores vs stays on goal; "easily distracted by interesting elements" | Curiosity and Exploration Inventory-II | partial | Trait curiosity and exploration, but not distractibility from a goal | development samples only: 311 + 150 + 119 undergraduates (Kashdan 2009) |
| 6 | workingMemory | capacity to remember previous attempts and current context | Wechsler Working Memory Index (standard scores, M 100, SD 15); complex-span and n-back batteries | good | Measures the construct directly | WAIS-IV scale stated as M 100 / SD 15 (Wilson 2024 Table 5). Standardisation N not retrieved. Age-group samples: Schmiedek 2014 (n 101 + 103), Czaja 2006 (N 1,204, 18-91). |
| 7 | readingTendency | disposition to read thoroughly vs scan (not ability) | Need for Cognition | partial | Motivation for effortful thinking, not reading engagement as such | Norwegian general population, M 3.30 (SD .76), N 1,203, and 3.50 (.81), N 2,003 (Lai 2010 Table 3) |
| 8 | resilience | speed of emotional recovery from setbacks | Brief Resilience Scale | good | "Ability to bounce back or recover from stress" (Smith 2008) | German representative adults, N 1,128, M 3.35, SD 0.95 (Kunzler 2018) |
| 9 | selfEfficacy | belief in ability to solve interface problems | efficacy subscale ("feelings of competence with computers") of the Attitudes Toward Computers Questionnaire; general self-efficacy (ASKU) | good (ATCQ) / partial (ASKU) | The ATCQ subscale is computer-specific; ASKU is general | ASKU: German representative adults, N 1,128, M 3.97, SD 0.72 (Kunzler 2018). ATCQ: age-group effect only, no means (Czaja 2006). |
| 10 | satisficing | accepts "good enough" vs seeks the optimum (high = satisficer) | maximization scale, reversed (Lai 2010 modified scale) | good | Measures the maximizing-satisficing axis, reversed. Lai's version weights high standards and alternative search. | general-population samples N 1,203 and 2,003 (Lai 2010); the maximizing means were not extracted |
| 11 | trustCalibration | baseline trust toward websites and UI claims (high = accepts at face value) | disposition to trust (McKnight et al. 2002, e-commerce) | good | Built for trust in web vendors. Paper not read this session. | none retrieved. Age difference: older adults more trusting (Bailey & Leon 2019) |
| 12 | interruptRecovery | resumes a task after interruption | none | none | Resumption-lag paradigms exist, but no normed trait instrument was found | none |
| 13 | informationForaging | exhaustive search vs scent-following | none | none | No validated individual-difference instrument found | none |
| 14 | changeBlindness | misses UI changes outside the focal area (high = misses more) | flicker change-detection paradigm | partial | The paradigm is the construct, but it is a lab task with no norms | none; N = 62 students (Andermane 2019) |
| 15 | anchoringBias | over-weights initial information | none (anchoring paradigms only) | none | No normed instrument. Single-study anchoring tasks only (e.g. Jin 2023). | none |
| 16 | timeHorizon | immediate vs future (high = wants results now) | delay discounting (Kirby MCQ log k; adjusting-delay tasks) | good | Measures the preference for sooner rewards that the trait's high end describes | none retrieved; meta-analysis of age (Seaman 2022, N 104,737) |
| 17 | attributionStyle | blames self vs system (high = self) | locus of control, IE-4 (internal and external) | partial | Locus of control is general control beliefs, not attribution of a specific failure. No attributional-style questionnaire was retrieved. | German representative adults, N 1,128: internal M 4.18 (.71), external 2.46 (.83) (Kunzler 2018) |
| 18 | metacognitivePlanning | tendency to plan before acting | BIS-11 Nonplanning, reversed; planning tasks (Tower of London) | good (BIS-11) / partial (tasks) | BIS-11 Nonplanning measures the tendency; the tasks measure ability | none (N = 522 distribution, Eisenberg 2019 data) |
| 19 | proceduralFluency | ease of following step-by-step instructions | none | none | No instrument for following procedures as an individual difference was found | none |
| 20 | transferLearning | applies knowledge from familiar UIs to new ones | none | none | No instrument found | none |
| 21 | authoritySensitivity | complies with authority cues | Susceptibility to Persuasion Scale (STPS; Kaptein 2012), authority subscale | good | Measures susceptibility to Cialdini's authority principle | none; sample N 312 (Wall 2019). StP-II has no authority subscale (Modic 2018). |
| 22 | emotionalContagion | mood follows the UI's emotional tone | Emotional Contagion Scale (Doherty 1997) | partial | Measures catching other people's emotions, not an interface's tone. Paper not read this session. | none retrieved |
| 23 | fearOfMissingOut | responds to urgency and scarcity cues | STPS scarcity subscale; Fear of Missing Out scale | good (STPS scarcity) / partial (FoMOs) | STPS scarcity is the scarcity principle itself. FoMOs is social FOMO. | FoMOs: Great Britain representative working-age adults, N 2,079, M 1.89, SD 0.75 (Przybylski 2013). STPS: N 312 (Wall 2019). |
| 24 | socialProofSensitivity | influenced by reviews, ratings, others' choices | STPS consensus subscale | good | Measures the consensus (social proof) principle | none; N 312 (Wall 2019) |
| 25 | mentalModelFlexibility | adapts mental models when conventions break (high = flexible) | Trail Making Test B, task switching; Cognitive Flexibility Inventory | partial | The tasks measure set-shifting; the inventory self-reports it. Neither is model revision on a novel interface. | TMT: 911 adults, 18-89, stratified by age and education (Tombaugh 2004) |
| 26 | siteFamiliarity | prior knowledge of one site | none (by design) | none | A per-run state, not a trait | not applicable |
| 27 | readingCapacity | bridged decoding capacity (orthographic, phonological, span, vocabulary, crowding) | reading speed (MNREAD maximum reading speed); word and text reading fluency | good | Measures decoding fluency, which the bridge weights | normally sighted, N 645, ages 8-81: 200 +/- 25 wpm at 16-40, 175 wpm at 81 (Calabrese 2016) |
| 28 | motorCapacity | bridged Fitts throughput and endpoint spread | Fitts aiming tasks (throughput, movement time) | good | It is the model's own construct | no norms retrieved; one small young-vs-old study (Sleimen-Malkoun 2013, n 10 + 14) |
| 29 | sustainedAttention | bridged capacity to hold attention on text (attentionSpan, else interruptRecovery) | CPT / SART / vigilance tasks; Test of Everyday Attention (normed) | good | Measures the construct | TEA scaled M 10, SD 3 from "154 non-brain-damaged adults" (Murray 2011 Table 2 note) |

**Summary.**

- **Fit:** 13 good, 9 partial, 7 none.
- **No instrument at all:** patience, interruptRecovery, informationForaging,
  anchoringBias, proceduralFluency and transferLearning. siteFamiliarity has
  none by design.
- **Retrieved population norms (named population and N):** 9 traits, namely
  resilience, selfEfficacy (ASKU), readingTendency, attributionStyle (IE-4
  proxy), fearOfMissingOut (FoMOs), mentalModelFlexibility (TMT),
  readingCapacity, sustainedAttention (TEA) and workingMemory (scale only).

---

## 2. Correlations

Trait names follow `COGNITIVE_TRAITS`. Each r is restated in the direction of
the traits:

- timeHorizon high = discounts more;
- changeBlindness high = misses more;
- satisficing = maximizing, reversed;
- metacognitivePlanning = nonplanning, reversed;
- persistence = lack of perseverance, reversed.

### 2a. Published coefficients, general (non-clinical) samples: 16 pairs

| traitA | traitB | instrument A x instrument B | r (trait direction) | type | N | population | source, location |
|---|---|---|---|---|---|---|---|
| resilience | selfEfficacy | BRS x ASKU | .51 (latent .62) | observed | 1,128 | German representative adults | Kunzler 2018, Table 3 |
| resilience | mentalModelFlexibility | BRS x Cognitive Flexibility Inventory | .574 | observed | 147 | ICU health-care workers, Türkiye | Mor 2026, abstract |
| metacognitivePlanning | timeHorizon | lack of planning (reversed) x "delay response" lab tasks | -.134 | meta-analytic | 27 studies | mixed | Cyders 2011, abstract |
| riskTolerance | timeHorizon | sensation seeking x "delay response" | .131 | meta-analytic | 27 studies | mixed | Cyders 2011, abstract |
| workingMemory | sustainedAttention | complex-span composite x SART d | .287 | observed | 243 | undergraduates 18-35 | McVay & Kane 2009, Table 1 (consistent with 8.2% variance in Results) |
| workingMemory | sustainedAttention | CANTAB spatial WM errors (reversed) x RVP A' | .279 | observed | 63 | university students | Ikegami 2026, Table 2 |
| workingMemory | readingCapacity | WM tasks x reading | .29 [.27, .31] | meta-analytic | 197 studies | grade-level moderators; age range not stated in the abstract | Peng 2018, abstract |
| changeBlindness | workingMemory | flicker beta (reversed) x VSTM fragile / robust | -.33 / -.26 | observed | 62 | adults 18-38 | Andermane 2019, Table 2 |
| changeBlindness | sustainedAttention | flicker beta (reversed) x CFQ distractibility (reversed) | -.30 | observed | 62 | adults 18-38 | Andermane 2019, Table 2 |
| satisficing | readingTendency | maximizing (reversed) x Need for Cognition | -.20 / -.18 | observed | 1,203 / 2,003 | Norwegian general population | Lai 2010, Table 3 |
| riskTolerance | satisficing | risk aversion (reversed) x maximizing (reversed) | .08 / .11 | observed | 1,203 / 2,003 | same | Lai 2010, Table 3 |
| satisficing | selfEfficacy | maximizing (reversed) x self-efficacy | -.19 | observed | 551 | executives | Lai 2010, Table 5 |
| sustainedAttention | timeHorizon | RVP A' x delay discounting log k | -.285 | observed | 63 | university students | Ikegami 2026, Table 2 |
| timeHorizon | workingMemory | log k x spatial WM errors (reversed) | -.041 | observed | 63 | university students | Ikegami 2026, Table 2 |
| fearOfMissingOut | socialProofSensitivity | STPS scarcity x consensus | .31 | observed | 312 | adults, general population and students, mean age 28 | Wall 2019, Table 3 |
| fearOfMissingOut | authoritySensitivity | STPS scarcity x authority | .30 | observed | 312 | same | Wall 2019, Table 3 |
| socialProofSensitivity | authoritySensitivity | STPS consensus x authority | .49 | observed | 312 | same | Wall 2019, Table 3 |

That is 17 rows for 16 pairs (workingMemory x sustainedAttention has two
sources).

**Not counted.**

- **Proxy only.** Patience, using CGT delay aversion reversed, correlates -.113
  with timeHorizon, -.072 with workingMemory and +.056 with sustainedAttention
  (Ikegami 2026, Table 2).
- **No number.** For workingMemory x mentalModelFlexibility in young adults,
  Glisky (2021) says only that the updating-shifting factor correlation was
  "very low and non-significant". Shamosh 2008 gives a direction only:
  discounting is negatively related to WM.

### 2b. Computed from open data: 28 pairs (23 not also published)

The Self-Regulation Ontology battery (Eisenberg et al. 2019) released
per-subject scores for 522 adults recruited on Mechanical Turk. It contains
instruments for 8 of our traits. The indicator for each trait was fixed before any
correlation was computed (`sro-correlations.ts`, INDICATORS):

| trait | indicator |
|---|---|
| riskTolerance | DOSPERT risk-taking, 5 domains |
| timeHorizon | Kirby log k |
| metacognitivePlanning | BIS-11 Nonplanning, reversed |
| persistence | UPPS-P lack of perseverance, reversed |
| workingMemory | digit and spatial span backward, keep-track, n-back load |
| sustainedAttention | Mindful Attention Awareness Scale (self-report attention lapses) |
| mentalModelFlexibility | cued task-switching cost |
| curiosity | experience seeking |

These are Pearson correlations computed here, not published coefficients. The
correlations were:

| traitA | traitB | r | 95% CI | n |
|---|---|---|---|---|
| riskTolerance | timeHorizon | 0.04 | [-0.04, 0.13] | 522 |
| riskTolerance | metacognitivePlanning | -0.16 | [-0.25, -0.08] | 522 |
| riskTolerance | persistence | -0.12 | [-0.21, -0.04] | 522 |
| riskTolerance | workingMemory | 0.12 | [0.03, 0.20] | 522 |
| riskTolerance | sustainedAttention | -0.22 | [-0.30, -0.13] | 522 |
| riskTolerance | mentalModelFlexibility | 0.03 | [-0.06, 0.12] | 501 |
| riskTolerance | curiosity | 0.46 | [0.39, 0.53] | 510 |
| timeHorizon | metacognitivePlanning | -0.07 | [-0.16, 0.01] | 522 |
| timeHorizon | persistence | 0.03 | [-0.05, 0.12] | 522 |
| timeHorizon | workingMemory | -0.19 | [-0.27, -0.11] | 522 |
| timeHorizon | sustainedAttention | 0.05 | [-0.03, 0.14] | 522 |
| timeHorizon | mentalModelFlexibility | 0.09 | [-0.00, 0.17] | 501 |
| timeHorizon | curiosity | -0.02 | [-0.11, 0.06] | 510 |
| metacognitivePlanning | persistence | 0.65 | [0.59, 0.69] | 522 |
| metacognitivePlanning | workingMemory | -0.01 | [-0.10, 0.07] | 522 |
| metacognitivePlanning | sustainedAttention | 0.44 | [0.37, 0.51] | 522 |
| metacognitivePlanning | mentalModelFlexibility | 0.05 | [-0.04, 0.14] | 501 |
| metacognitivePlanning | curiosity | -0.08 | [-0.17, 0.00] | 510 |
| persistence | workingMemory | -0.08 | [-0.17, 0.00] | 522 |
| persistence | sustainedAttention | 0.52 | [0.45, 0.58] | 522 |
| persistence | mentalModelFlexibility | 0.01 | [-0.08, 0.09] | 501 |
| persistence | curiosity | -0.09 | [-0.18, -0.00] | 510 |
| workingMemory | sustainedAttention | -0.04 | [-0.12, 0.05] | 522 |
| workingMemory | mentalModelFlexibility | -0.14 | [-0.23, -0.06] | 501 |
| workingMemory | curiosity | 0.06 | [-0.02, 0.15] | 510 |
| sustainedAttention | mentalModelFlexibility | 0.01 | [-0.08, 0.10] | 501 |
| sustainedAttention | curiosity | -0.11 | [-0.19, -0.02] | 510 |
| mentalModelFlexibility | curiosity | -0.03 | [-0.11, 0.06] | 490 |

**The instrument decides the correlation, not the trait.**

- workingMemory x sustainedAttention is .29 when attention is a task (SART;
  McVay & Kane 2009) and .28 with a task in Ikegami 2026. It is -.04 when
  attention is self-reported (MAAS, above).
- By the method of the two measures, the pairs above average (mean |r|, from
  `sro-correlations.ts`):

  | pair type | pairs | mean abs r | range |
  |---|---|---|---|
  | self-report x self-report | 10 | .285 | .083-.647 |
  | task x task | 3 | .141 | .085-.192 |
  | self-report x task | 15 | .043 | .006-.116 |

  Three examples of the large self-report pairs: planning x persistence .65,
  persistence x MAAS .52, planning x MAAS .44.
- This matches both published reviews. Eisenberg et al. (2019) found that tasks
  and surveys "show little empirical relationship". Cyders & Coskunpinar (2011)
  found r = .097 between self-report and lab-task impulsivity.

**The sign can flip with how a trait is scored.** workingMemory x
mentalModelFlexibility is -.14 when flexibility is a drift-rate switch cost. In
Glisky's young adults the same pair is "very low" at the factor level.
Difference scores are a poor basis for a covariance.

**The hand-set domains do not follow the data.** The two largest correlations
cross the code's ground-metric domains (`traitGroundDistance` in
`cognitive-transport.ts`, labelled "hypothesis"):

- metacognitivePlanning x persistence, .65, crosses planning and core;
- riskTolerance x curiosity, .46, crosses core and cognitive.

### 2c. Condition-specific: 1 pair

| condition | traitA | traitB | measures | r | N | source |
|---|---|---|---|---|---|---|
| older adults 60-73 | workingMemory | mentalModelFlexibility | updating/inhibition factor x shifting factor (EFA) | .30 | 120 | Glisky 2021, Results |
| older adults 74-98 | workingMemory | mentalModelFlexibility | updating/inhibition x shifting (CFA) | .53 | 125 | Glisky 2021, Results |

**Not found.** No within-group correlation between two mapped instruments was
found for ADHD, dyslexia, low vision, motor impairment, autism, intellectual
disability, aphasia or dyscalculia samples. Ikegami 2026 measures ADHD traits
in students, not an ADHD sample.

### 2d. Coverage (`coverage.ts`)

```
dimensions: 29, pairs: 406
general population, published coefficient: 16 (3.9%)
general population, computed from SRO open data: 28 (23 not also published)
general population, any estimate: 39 (9.6%)
proxy-only pairs, not counted: 3
condition-specific, published: 1 (0.2%)
traits in at least one general-population pair: 17 of 29
traits in none: patience, comprehension, emotionalContagion, attributionStyle, anchoringBias,
  interruptRecovery, proceduralFluency, transferLearning, informationForaging, trustCalibration,
  siteFamiliarity, motorCapacity
```

**Known structures checked.**

- **Big Five:** no trait maps cleanly onto a Big Five facet, so no Big Five
  meta-analytic matrix was used.
- **Wechsler index intercorrelations:** only processing speed would pair with
  working memory, and processing speed is not one of the 29.
- **Miyake et al. 2000:** latent correlations not retrieved (the publisher
  returned 403). They are quoted only second-hand in Glisky.
- **Persuasion scales:** Wall 2019 is the only open subscale matrix found.
  Kaptein's STPS paper and Modic's StP-II supplementary tables gave no usable
  matrix.

---

## 3. Norm-implied values

### 3.0 cognitive-adhd workingMemory (current 0.30)

The source the code cites is Kofler et al. 2020. It reports d computed from r,
in children aged 8-13.

| estimate | d | value = Phi(-d) | 95% interval |
|---|---|---|---|
| Kofler 2020, Tier 1 (r = .71, N = 172) | 2.016 | 0.022 | 0.007-0.054 |
| Kofler 2020, Tier 2 (r = .63) | 1.622 | 0.052 | 0.021-0.105 |
| Wilson 2024, adults with ADHD, WAIS-IV WMI 95.2 (92.5, 98.0) vs norm 100/15 | 0.320 | 0.374 | 0.309-0.447 |
| Boonstra 2005, adults, Digit Span backward | 0.44 | 0.330 | 0.218-0.460 |

**The two populations give very different values.**

- **Children.** Under the paper's own method the cited child effect implies
  0.02-0.05, a gap of +0.25 to +0.28 against the current 0.30.
- **Adults.** The adult evidence is on a normed instrument, which is exactly
  what section 3.1.1 asks for. It implies 0.37 (0.31-0.45). The current 0.30
  sits just below that interval, and the gap is under 0.15.
- **The age mismatch matters.** The adult normed mean is a third of an SD
  below the norm. The child latent effect is two SDs.
- **Kofler's reference group is not purely typical.** 30% of its non-ADHD
  group had other clinical diagnoses (Method). A purely typical reference
  would make the child d larger, not smaller.
- **Recommendation.** The paper should take the adult value as the adult
  persona's value, and cite Kofler only for the direction of the effect.

The code comment beside the value says "The effect size gives the direction
and size of the group difference, not this 0-1 value". Under section 3.1.1 it
does give the value, so the comment and the paper's method disagree.

### 3.1 All effects (verbatim output of `norm-implied.ts`)

**How to read the table.**

- "primary" marks the one estimate per persona-trait cell used for the gap
  ranking. The rule: adult before child; a normed-instrument population mean
  before a meta-analysis, and a meta-analysis before a single study; good fit
  before partial.
- "flag" is `>0.15` when the gap exceeds 0.15 on a 0.5-anchored trait, and
  `SCALE` on a bridged capacity (see 3.2).
- "interval" is a 95% CI (`ci`), or the spread across reported tasks or
  measures (`range`).

| persona | trait | instrument | fit | zInst | value | interval | current | gap | flag | primary | source |
|---|---|---|---|---|---|---|---|---|---|---|---|
| cognitive-adhd | workingMemory | WAIS-IV Working Memory Index (norm 100/15) | good | -0.320 | 0.374 | 0.309-0.447 (ci) | 0.300 | -0.074 |  | yes | Wilson2024 |
| cognitive-adhd | workingMemory | latent central-executive WM, bifactor Tier 1 | good | -2.016 | 0.022 | 0.007-0.054 (ci) | 0.300 | +0.278 | >0.15 |  | Kofler2020 |
| cognitive-adhd | workingMemory | latent central-executive WM, bifactor Tier 2 | good | -1.622 | 0.052 | 0.021-0.105 (ci) | 0.300 | +0.248 | >0.15 |  | Kofler2020 |
| cognitive-adhd | workingMemory | WAIS Digit Span backward | good | -0.440 | 0.330 | 0.218-0.460 (ci) | 0.300 | -0.030 |  |  | Boonstra2005 |
| cognitive-adhd | sustainedAttention | CPT omission errors | good | -0.500 | 0.309 | 0.242-0.378 (ci) | 0.300 | -0.009 |  | yes | Boonstra2005 |
| cognitive-adhd | sustainedAttention | CPT attentiveness d' | good | -0.550 | 0.291 | 0.227-0.363 (ci) | 0.300 | +0.009 |  |  | Boonstra2005 |
| cognitive-adhd | timeHorizon | monetary delay discounting | good | 0.400 | 0.655 | - | 0.900 | +0.245 | >0.15 | yes | Jackson2016 |
| cognitive-adhd | mentalModelFlexibility | Trail Making Test B (set shifting) | partial | -0.650 | 0.258 | 0.198-0.323 (ci) | 0.700 | +0.442 | >0.15 | yes | Boonstra2005 |
| cognitive-adhd | mentalModelFlexibility | set-shifting domain mean | partial | -0.350 | 0.363 | - | 0.700 | +0.337 | >0.15 |  | Pievsky2018 |
| cognitive-adhd | metacognitivePlanning | planning/organization domain mean | partial | -0.510 | 0.305 | - | 0.300 | -0.005 |  | yes | Pievsky2018 |
| cognitive-adhd | riskTolerance | laboratory risky decision-making | partial | 0.360 | 0.641 | 0.587-0.695 (ci) | 0.700 | +0.059 |  | yes | Dekkers2016 |
| cognitive-adhd | resilience | general emotion dysregulation | partial | 1.170 | 0.121 | 0.051-0.242 (ci) | 0.400 | +0.279 | >0.15 | yes | Beheshti2020 |
| cognitive-adhd | selfEfficacy | academic self-efficacy | partial | -0.450 | 0.326 | - | 0.400 | +0.074 |  | yes | Andreassen2026 |
| cognitive-adhd | readingCapacity | Stroop word card (word naming speed) | partial | -0.600 | 0.274 | 0.140-0.456 (ci) | 0.746 | +0.472 | SCALE | yes | Boonstra2005 |
| cognitive-adhd | motorCapacity | Trail Making Test A (scanning + motor speed) | weak | -0.460 | 0.323 | 0.258-0.390 (ci) | 0.741 | +0.418 | SCALE |  | Boonstra2005 |
| dyslexic-user | readingCapacity | reading and writing tasks (excluding comprehension) | good | -1.885 | 0.030 | 0.021-0.041 (range) | 0.387 | +0.357 | SCALE | yes | Reis2020 |
| dyslexic-user | readingCapacity | text reading time | good | -1.290 | 0.099 | 0.056-0.164 (ci) | 0.387 | +0.288 | SCALE |  | Callens2012 |
| dyslexic-user | workingMemory | memory with sorting (reordering span) | good | -0.450 | 0.326 | - | 0.300 | -0.026 |  | yes | Callens2012 |
| dyslexic-user | workingMemory | WM tasks | good | -0.670 | 0.251 | 0.248-0.261 (ci) | 0.300 | +0.049 |  |  | Swanson2009 |
| dyslexic-user | sustainedAttention | Digit Crossing Test, concentration | weak | -0.510 | 0.305 | - | 0.500 | +0.195 | SCALE |  | Callens2012 |
| dyslexic-user | resilience | anxiety + depression composite | weak | 0.540 | 0.295 | - | 0.500 | +0.205 | >0.15 |  | Vieira2023 |
| dyscalculia | workingMemory | WM capacity (accuracy, untimed) | good | -0.610 | 0.271 | 0.205-0.347 (ci) | 0.350 | +0.079 |  | yes | Haberstroh2022 |
| dyscalculia | workingMemory | short-term WM, all tasks | good | -0.560 | 0.288 | 0.243-0.336 (ci) | 0.350 | +0.062 |  |  | Haberstroh2022 |
| dyscalculia | sustainedAttention | attentional control (accuracy / RT) | partial | -0.230 | 0.409 | 0.281-0.409 (range) | 0.700 | +0.291 | SCALE | yes | Haberstroh2022 |
| dyscalculia | readingCapacity | reading and writing | partial | -0.330 | 0.371 | 0.341-0.401 (ci) | 0.671 | +0.301 | SCALE | yes | Haberstroh2022 |
| elderly-user | workingMemory | 9 WM tasks (complex span, n-back, updating, span); median of 9 | good | -1.364 | 0.086 | 0.012-0.262 (range) | 0.400 | +0.314 | >0.15 | yes | Schmiedek2014 |
| elderly-user | workingMemory | alphabet span / computation span | good | -0.940 | 0.173 | 0.173-0.208 (range) | 0.400 | +0.227 | >0.15 |  | Czaja2006 |
| elderly-user | mentalModelFlexibility | Trail Making B-A (log, higher = better) | partial | -0.702 | 0.241 | - | 0.200 | -0.041 |  | yes | Czaja2006 |
| elderly-user | riskTolerance | behavioural risky-choice tasks, all tasks pooled | partial | 0.070 | 0.528 | 0.520-0.536 (ci) | 0.200 | -0.328 | >0.15 | yes | Mata2011 |
| elderly-user | riskTolerance | BART (lowest task) .. CGT (highest task) | partial | -0.380 | 0.352 | 0.352-0.681 (range) | 0.200 | -0.152 | >0.15 |  | Mata2011 |
| elderly-user | trustCalibration | trust ratings and trust games | partial | 0.220 | 0.587 | 0.560-0.629 (range) | 0.250 | -0.337 | >0.15 | yes | BaileyLeon2019 |
| elderly-user | sustainedAttention | SART no-go accuracy | partial | 0.590 | 0.722 | 0.626-0.802 (ci) | 0.400 | -0.322 | SCALE | yes | Vallesi2021 |
| elderly-user | motorCapacity | stylus Fitts aiming, movement time, ID 3-7 | partial | -1.836 | 0.033 | 0.019-0.054 (range) | 0.605 | +0.572 | SCALE | yes | SleimenMalkoun2013 |
| elderly-user | readingCapacity | MNREAD maximum reading speed, normal vision | good | -1.000 | 0.159 | - | 0.673 | +0.514 | SCALE | yes | Calabrese2016 |
| elderly-low-vision | workingMemory | 9 WM tasks (complex span, n-back, updating, span); median of 9 | good | -1.364 | 0.086 | 0.012-0.262 (range) | 0.300 | +0.214 | >0.15 | yes | Schmiedek2014 |
| elderly-low-vision | workingMemory | alphabet span / computation span | good | -0.940 | 0.173 | 0.173-0.208 (range) | 0.300 | +0.127 |  |  | Czaja2006 |
| elderly-low-vision | mentalModelFlexibility | Trail Making B-A (log, higher = better) | partial | -0.702 | 0.241 | - | 0.150 | -0.091 |  | yes | Czaja2006 |
| elderly-low-vision | riskTolerance | behavioural risky-choice tasks, all tasks pooled | partial | 0.070 | 0.528 | 0.520-0.536 (ci) | 0.100 | -0.428 | >0.15 | yes | Mata2011 |
| elderly-low-vision | riskTolerance | BART (lowest task) .. CGT (highest task) | partial | -0.380 | 0.352 | 0.352-0.681 (range) | 0.100 | -0.252 | >0.15 |  | Mata2011 |
| elderly-low-vision | trustCalibration | trust ratings and trust games | partial | 0.220 | 0.587 | 0.560-0.629 (range) | 0.400 | -0.187 | >0.15 | yes | BaileyLeon2019 |
| elderly-low-vision | sustainedAttention | SART no-go accuracy | partial | 0.590 | 0.722 | 0.626-0.802 (ci) | 0.500 | -0.222 | SCALE | yes | Vallesi2021 |
| elderly-low-vision | motorCapacity | stylus Fitts aiming, movement time, ID 3-7 | partial | -1.836 | 0.033 | 0.019-0.054 (range) | 0.605 | +0.572 | SCALE | yes | SleimenMalkoun2013 |
| elderly-low-vision | readingCapacity | MNREAD maximum reading speed, normal vision | good | -1.000 | 0.159 | - | 0.526 | +0.367 | SCALE |  | Calabrese2016 |
| elderly-low-vision | readingCapacity | MNREAD max reading speed, AMD vs normal-vision norm | good | -2.348 | 0.009 | - | 0.526 | +0.516 | SCALE | yes | Patel2020+Calabrese2016 |
| low-vision-magnified | readingCapacity | MNREAD max reading speed, AMD vs normal-vision norm | partial | -2.348 | 0.009 | - | 0.536 | +0.526 | SCALE | yes | Patel2020+Calabrese2016 |
| deaf-user | workingMemory | verbal serial recall, backward | partial | -0.660 | 0.255 | 0.187-0.326 (ci) | 0.600 | +0.345 | >0.15 | yes | McFayden2023 |
| deaf-user | workingMemory | visuospatial serial recall, forward | partial | -0.055 | 0.478 | 0.348-0.610 (ci) | 0.600 | +0.122 |  |  | McFayden2023 |
| deaf-user | changeBlindness | Useful Field of View threshold (peripheral selective attention) | partial | 1.124 | 0.131 | - | 0.300 | +0.169 | >0.15 | yes | Dye2009 |
| autism-spectrum | workingMemory | WAIS-IV Working Memory Index (norm 100/15) | good | -0.473 | 0.318 | 0.136-0.561 (ci) | 0.600 | +0.282 | >0.15 | yes | Wilson2024 |
| autism-spectrum | workingMemory | phonological WM accuracy, adults | good | -0.790 | 0.215 | 0.063-0.484 (ci) | 0.600 | +0.385 | >0.15 |  | Habib2019 |
| autism-spectrum | workingMemory | visuospatial WM accuracy, adults | good | -0.470 | 0.319 | 0.181-0.488 (ci) | 0.600 | +0.281 | >0.15 |  | Habib2019 |
| autism-spectrum | mentalModelFlexibility | EF flexibility domain, adults with HFA | partial | -0.690 | 0.245 | - | 0.200 | -0.045 |  | yes | Xie2020 |
| autism-spectrum | mentalModelFlexibility | WCST, 4 measures | partial | -0.520 | 0.302 | 0.230-0.382 (range) | 0.200 | -0.102 |  |  | Landry2016 |
| autism-spectrum | metacognitivePlanning | planning tasks (ToL, ToH, SoC, BADS) | partial | -0.520 | 0.302 | 0.255-0.348 (ci) | 0.550 | +0.248 | >0.15 | yes | OldeDubbelink2017 |
| autism-spectrum | anchoringBias | gain/loss framing effect size | weak | -0.800 | 0.212 | 0.075-0.440 (ci) | 0.750 | +0.538 | >0.15 |  | Shah2016 |
| intellectual-disability | workingMemory | WAIS-IV Working Memory Index vs norm | good | -2.270 | 0.012 | 0.002-0.017 (range) | 0.200 | +0.188 | >0.15 | yes | MortariFerreira2026 |
| intellectual-disability | trustCalibration | Gudjonsson Suggestibility Scale, Yield 1 | partial | 1.110 | 0.867 | 0.791-0.921 (ci) | 0.700 | -0.167 | >0.15 | yes | Gilbert2026 |
| intellectual-disability | authoritySensitivity | Gudjonsson Suggestibility Scale, Shift | partial | 0.700 | 0.758 | 0.670-0.836 (ci) | 0.900 | +0.142 |  | yes | Gilbert2026 |
| aphasia-receptive | sustainedAttention | TEA Telephone Search while Counting (norm 10/3) | partial | -1.567 | 0.059 | - | 0.600 | +0.541 | SCALE | yes | Murray2011 |
| aphasia-receptive | workingMemory | WMS-R visual memory span backward (mean percentile) | good | pct | 0.466 | - | 0.450 | -0.016 |  | yes | Murray2011 |
| aphasia-receptive | workingMemory | high-load WM tasks after stroke (all stroke, not aphasia-specific) | partial | -0.590 | 0.278 | 0.233-0.326 (ci) | 0.450 | +0.172 | >0.15 |  | Lugtmeijer2020 |
| aphasia-receptive | mentalModelFlexibility | TEA Visual Elevator (attention switching, norm 10/3) | partial | -1.367 | 0.086 | - | 0.400 | +0.314 | >0.15 | yes | Murray2011 |

**Summary of the table.**

- 40 primary cells in all.
- 27 of them are on 0.5-anchored traits with good or partial fit. Of those 27:
  - 16 differ from the current value by more than 0.15;
  - 17 have the current value outside the norm-implied interval.
- The other 13 primary cells are capacity-scale cells (3.2).

**Notes on individual rows.**

- **Murray 2011, WMS-R visual span.** The row marked `pct` uses the reported
  mean percentile (46.6) directly. A mean of percentiles is close to, but not
  the same as, Phi of the mean z.
- **Murray 2011, TEA Elevator Counting.** The pure sustained-attention subtest
  has a ceiling (range 4-7 in aphasia, 6-7 in controls), so it is unusable.
  Telephone Search while Counting adds a dual-task load.
- **Patel + Calabrese.** These rows compare across studies: an AMD sample aged
  78.7 against a young-adult reading-speed norm. Against the age-81 norm the
  z is -1.35.
- **Dye 2009.** d comes from partial eta squared under an equal-cell
  approximation.
- **Mata 2011.** Its summaries are fixed-effects, which is why its CIs are
  narrow. Its own conclusion is that the age effect depends on the task: older
  adults take more risk on the IGT and CGT and less on the BART.
- **Wilson 2024.** Its ADHD Table 3 has two rows that are identical in every
  cell (Baggio 2020; Shepler & Callan 2022), which may be a duplicated sample.
  Its autistic adults include one sample with FSIQ 51.3.
- **Gilbert 2026.** Its ID comparisons are against normative data, not
  matched controls.

### 3.2 The bridged capacities are not on a percentile scale

readingCapacity, motorCapacity and sustainedAttention are not authored. They
are computed by `bridgeCapacityTraits`. On those formulas a typical person does
not sit at 0.5:

| capacity | typical value on the system's scale | where that comes from |
|---|---|---|
| readingCapacity | 0.8225 | `readingCapacityOf` on the neurotypical reading profile |
| motorCapacity | 0.8375 | `motorCapacityOf` on the neurotypical pointing profile |
| sustainedAttention | 0.70 | the stated fallback |

So the 0.15 rule cannot be applied to them. Their rows above are marked
`SCALE`, not `>0.15`.

**Example.** dyslexic-user readingCapacity is 0.387 on a scale where typical
is 0.82. Norm-implied, it is 0.03 (0.02-0.04).

**What the paper can do.** Section 3.1.1 can apply to these three only if the
paper either:

- maps the capacity formulas onto a percentile scale, or
- states that they are model parameters (throughput, words per minute) and
  are calibrated against the source studies directly.

**One such direct check is possible for motor.**

- The system's elderly pointing profile has throughput 3.2 against 4.9 for
  neurotypical, a ratio of 0.65.
- Sleimen-Malkoun 2013 report Fitts slopes of 105 ms/bit (young) and 147
  ms/bit (older). Throughput is 1/slope, so the ratio is 0.72.
- The two ratios are close.
- That study used a tablet stylus with n = 24, so absolute throughputs are not
  comparable.

The tremor profile's source, Hwang et al. 2004 (ASSETS), could not be verified:
a sub-agent found 6 impaired and 3 able-bodied participants, and no throughput
figure, in web abstracts. No usable effect size was found for
motor-impairment-tremor.

### 3.3 Evidence with a direction but no effect size

| persona | trait | current | evidence | reading |
|---|---|---|---|---|
| elderly-user | anchoringBias | 0.70 | "No age differences were found" in anchoring (Jin 2023; ages 60-74 vs 18-34) | evidence points to about 0.5; the current value assumes older adults anchor more |
| elderly-user | timeHorizon | 0.40 | r = -0.068 [-0.170, 0.035] for age with discounting; design (extreme-group vs continuous) did not moderate (Seaman 2022) | about 0.5; current is within 0.15 |
| elderly-user | satisficing | 0.60 | age correlated -0.239 with satisficing and -0.220 with maximizing, physicians 25-69 (Djulbegovic 2014) | no direction for the trait |
| elderly-user | selfEfficacy | 0.40 | ATCQ computer efficacy differs by age group (F = 51.05; Czaja 2006); no means | direction only, consistent with current |
| elderly-user | fearOfMissingOut | 0.30 | FoMO "negatively related to age, r = .37" in working-age adults 22-65 (Przybylski 2013) | direction consistent with current |
| elderly-user / elderly-low-vision | trustCalibration | 0.25 / 0.40 | older adults rated untrustworthy faces more trustworthy (Castle 2012) | corroborates Bailey & Leon: older adults are more trusting, not less |
| autism-spectrum | socialProofSensitivity | 0.25 | "no overall difference ... in mean rate of conformity", Asch task (Bowler 1994) | evidence points to about 0.5 |
| autism-spectrum | changeBlindness | 0.30 | less change blindness for marginal-interest changes, more misses for marginal-location changes, n = 22 + 22 (Ashwin 2017) | mixed |
| intellectual-disability | mentalModelFlexibility | 0.10 | g = -0.34 [-0.53, -0.16] vs MENTAL-age-matched controls (Spaniol 2021) | against same-age adults the gap is larger, so the value is at most 0.37; current is consistent |
| elderly-user | readingCapacity input | - | vocabulary favours older adults by 0.80 SD (Verhaeghen 2003) | supports `vocabularyBreadth` 0.85 in the elderly reading profile |

**Personas with nothing usable.**

- **motor-impairment-tremor:** see 3.2.
- **color-blind-deuteranopia:** a PubMed search for cognitive or task
  differences with colour-vision deficiency returned nothing relevant. The
  method gives no value. It implies 0.5 only if there is no difference, and
  that is untested.

### 3.4 The five largest gaps

These use the primary estimate, good or partial fit, and 0.5-anchored traits
only.

| rank | persona, trait | current | norm-implied (interval) | gap | source |
|---|---|---|---|---|---|
| 1 | cognitive-adhd, mentalModelFlexibility | 0.70 | 0.258 (0.198-0.323) | +0.442 | Boonstra 2005, adult TMT-B d = .65 |
| 2 | elderly-low-vision, riskTolerance | 0.10 | 0.528 (0.520-0.536; task range 0.352-0.681) | -0.428 | Mata 2011 |
| 3 | deaf-user, workingMemory | 0.60 | 0.255 (0.187-0.326) | +0.345 | McFayden 2023, backward recall g = -0.66 |
| 4 | elderly-user, trustCalibration | 0.25 | 0.587 (0.560-0.629) | -0.337 | Bailey & Leon 2019 |
| 5 | elderly-user, riskTolerance | 0.20 | 0.528 (0.520-0.536; task range 0.352-0.681) | -0.328 | Mata 2011 |

**What each gap means.**

1. **ADHD flexibility.** The code kept 0.7 over the documentation's 0.4. The
   reasoning was "flexible thinking, sometimes too flexible". The adult
   set-shifting evidence points the other way. The fit is partial: TMT-B
   measures set-shifting, not mental-model revision.
2. **Elderly risk (rank 2 and rank 5).** Neither elderly persona's value is
   reached by any task in the meta-analysis. The most risk-averse task, the
   BART, still gives 0.35. The two personas assume older adults are strongly
   risk-averse, and the meta-analysis does not support that.
3. **Deaf working memory.** The deficit is verbal-sequential. Visuospatial span
   gives 0.478 [0.348-0.610], which is within 0.15 of the current 0.60. So the
   gap depends on which half of working memory the persona is meant to carry.
4. **Elderly trust.** The current value has the wrong direction, not just the
   wrong size. Older adults are more trusting than younger adults, and Castle
   2012 corroborates this.

**The next three, all with gap about 0.31 or less.**

- aphasia-receptive, mentalModelFlexibility: +0.314.
- elderly-user, workingMemory: +0.314.
- autism-spectrum, workingMemory: +0.282.

**Excluded as weak fit.** The largest raw gap of all is autism-spectrum
anchoringBias: 0.75 against 0.212, gap +0.538. It is excluded because the only
evidence is a framing effect (Shah 2016), not anchoring.

**Reference population.** For elderly-user and elderly-low-vision the
reference is young adults (20-31, 18-35, 18-39). Against an all-adult
reference every elderly value would move toward 0.5. The paper should state
which reference population it means.

---

## 4. Replacement for the covariance sentence

Current text: "A covariance-aware model of user populations would need trait
covariances for each population. No such estimates exist for our personas."

Proposed:

> Of the 406 pairs among our 29 dimensions, 16 (3.9%) have a published
> general-population correlation between instruments mapped to both traits,
> and one open battery (Eisenberg et al., 2019; N = 522) yields 23 more, 39
> (9.6%) in all; within the populations our personas name, only one pair has
> an estimate, working memory with task switching in older adults (r = .30 at
> ages 60-73, .53 at 74-98; Glisky et al., 2021). Even these move with the
> instrument: working memory correlates .29 with sustained attention measured
> as a task (McVay & Kane, 2009) but -.04 with sustained attention measured by
> self-report in the Eisenberg et al. data, so a covariance-aware model would
> first have to fix one instrument per trait.

**Where each number comes from.**

| number | source |
|---|---|
| 406, 29, 16, 3.9%, 23, 39, 9.6% | `coverage.ts` (2d) |
| N = 522 | `sro-correlations.ts` subject count (2b) |
| .30, .53 | 2c |
| .29 | 2a, McVay & Kane, .287 |
| -.04 | 2b, workingMemory x sustainedAttention |

The -.04 is computed from published data, not a published coefficient. If the
paper wants published coefficients only, use Cyders & Coskunpinar's
self-report-to-task r = .097 (2b note) as the second example.

---

## Limits

- **Fit is a judgement.** "Good" means the construct matches the trait's
  definition. It does not mean the instrument was validated on web tasks; none
  was.
- **Effect sizes carry their study's design.** Matched controls differ from
  normative references. Age-matched differs from mental-age-matched. Several
  values use child data for adult personas: dyscalculia, Kofler, and Swanson
  2009. Each row says which applies.
- **Most persona-trait cells have no effect size at all.** The 40 primary
  cells cover a minority of the 12 x 29 cells. An absent row means nothing
  usable was found or searched within budget. It does not mean "no
  difference".
- **Norms for most good-fit instruments are not population norms.** For
  STPS, delay discounting, BIS-11 and DOSPERT, only convenience-sample
  distributions were found.

## Reproduce

Each command is run as wyld-web from the worktree root.

```
bun research/persona-norms/dump-personas.ts
bun research/persona-norms/norm-implied.ts            # or --json
bun research/persona-norms/sro-correlations.ts <meaningful_variables_clean.csv>
bun research/persona-norms/coverage.ts
```

The SRO file is `Data/Complete_02-16-2019/meaningful_variables_clean.csv` from
github.com/IanEisenberg/Self_Regulation_Ontology. Its sha256 is in sources.md.
It is not committed here.
