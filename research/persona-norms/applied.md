# Norm-anchored persona values: what was applied

Built-in persona values that a published effect size contradicts were set to
the norm-implied value of the paper's section 3.1.1, if the evidence met the
rule below. Every other cell the norm work considered is listed with the
reason it was left alone. Decided 2026-10-23 on `feat/persona-anchors`, on top
of the norm-implied table in [README.md](README.md) (section 3).

## The rule

A cell is changed only if all four hold:

1. **Contradicted.** The current value lies outside the source's 95% interval
   for the norm-implied value.
2. **Good fit.** The instrument measures the trait as `src/trait-reference.ts`
   defines it, not only what the trait's name suggests (README section 1).
3. **Matching age.** The sample's ages match the persona's: adults for an
   adult persona.
4. **CI read.** The source prints the 95% CI. An interval computed here from a
   summary statistic (r and N, g and SE, eta squared) or a range across tasks
   does not count.

Bridged capacities (`readingCapacity`, `motorCapacity`, `sustainedAttention`)
are computed by `bridgeCapacityTraits` from other traits and are not authored,
so there is no value to set. Their scale also puts a typical person at
0.70-0.84, not 0.5 (README section 3.2).

A changed value stays status `hypothesis`. The source measured the
population on its instrument; mapping that instrument onto the trait is
cbrowser's choice. Its provenance entry (`NORM_ANCHORS` in
`src/visual/provenance/personas.ts`) names the source, the printed number and
the interval, and `tests/persona-provenance.test.ts` recomputes the value
from z.

**Value** is `Phi(z)` with z = (population mean - reference mean) / reference
SD, rounded to two decimals as personas.ts writes values.

## Changed (2 cells)

| persona | trait | old | new | interval | source | the number as printed |
|---|---|---|---|---|---|---|
| cognitive-adhd | workingMemory | 0.30 | 0.37 | 0.309-0.447 | Wilson AC 2024. Cognitive profile in autism and ADHD: a meta-analysis of performance on the WAIS-IV and WISC-V. *Arch Clin Neuropsychol* 39(4):498-515. doi:10.1093/arclin/acad073, PMID 37779387, PMC11110614. | Table 5, "Summary scores for neurodivergent adults across the index scores of the WAIS-IV. Scores are shown as standard scores (mean = 100; SD = 15)": "Adults with ADHD, mean ... WMI 95.2"; "Adults with ADHD, 95% CI ... 92.5, 98.0". z = (95.2 - 100) / 15 = -0.320. |
| autism-spectrum | workingMemory | 0.60 | 0.32 | 0.181-0.488 | Habib A, Harris L, Pollick F, Melville C 2019. A meta-analysis of working memory in individuals with autism spectrum disorders. *PLoS One* 14(4):e0216198. doi:10.1371/journal.pone.0216198, PMID 31039192, PMC6490940. | Table 6, "Subgroup analysis visuospatial WM": "Visuospatial Accuracy, Adult, K 4, SMD -0.47, 95% CI -0.91 to -0.03". z = -0.47. |

### How the sources were verified

Both edits were in the tree uncommitted when this work started. Neither was
taken on trust.

- **Bibliographic details.** PubMed metadata for PMID 37779387 and 31039192
  returned the titles, journals, volumes, issues, pages and years above.
- **The numbers.** I read the PMC full text of each paper (PubMed Central,
  2026-10-23) and found the rows quoted above in the tables named.
- **Wilson 2024, population.** The Method gives adults with ADHD a mean age of
  29. Table 3 lists the five adult ADHD samples: Baggio et al. 2020 (n 66),
  Hong et al. 2022 (240), Shepler & Callan 2022 (66), Theiling & Petermann
  2016 (116), and a fifth row (44).
- **Habib 2019, population.**
  - Inclusion criteria: groups "Matched ... on age, gender and IQ or where
    there was no statistically significant difference between the groups".
  - Results, visuospatial accuracy: "All twelve studies compared ASD
    participants with TD participants with all participants IQ scores being
    within typical range of 70 or greater".
  - Subgroups split by age at 18 ("adults (>= 18 years)").
  - The text repeats the adult row: "adults:-0.47, 95% CI, -0.91 to -0.03".

**Corrected on the way.** The uncommitted autism comment said "4 studies of
average-IQ samples". Table 6 does not say that. Its "Average IQ" row is a
separate cut across ages (k = 10). The comment now says what the paper does
state: controls matched on age and IQ, and every participant at IQ 70 or
above. The ADHD comment said the old 0.3 was "set from" Kofler et al. 2020.
The old comment cited Kofler beside the value and said the effect size did
not give the value, so the comment now says "cited to".

### What each value does not settle

**cognitive-adhd.workingMemory**

- **The contradiction is narrow.** The old 0.30 sits 0.009 below the interval.
- **A possible duplicate.** Two adult rows in Wilson's Table 3 (Baggio et al.
  2020 and Shepler & Callan 2022, n = 66 each) are identical in every cell, so
  they may be one sample counted twice. I could not reproduce Wilson's pooled
  95.2 (92.5, 98.0) from Table 3. DerSimonian-Laird and REML on the means give
  97.0 with both rows and 96.0 with one, so Wilson's method differs from both.
  In every reconstruction the mean is higher than 95.2, and the lower bound
  still excludes 0.30 (lowest: REML without the duplicate, 92.8, value 0.316).
  So the duplicate does not rescue the old value. The published number is
  used as printed.
- **The index is not pure working memory.** The WAIS-IV Working Memory Index
  is Digit Span plus Arithmetic, so it also loads on arithmetic.
- **A second adult source agrees.** Boonstra et al. 2005 (Digit Span backward,
  adults, d = .44 [.10, .78]) gives 0.218-0.460. That interval contains both
  the old 0.30 and the new 0.37, so it contradicts neither.
- **Kofler et al. 2020 still gives the direction.** Its children (8-13) imply
  0.02-0.05 under the same method. The persona is adults 18-45.

**autism-spectrum.workingMemory**

- **Two adult estimates, both lower than 0.6.** Habib 2019 reports a
  phonological adult estimate too: Table 3, "Phonological Accuracy, Adult, K 5,
  SMD -0.79, 95% CI -1.53 to -0.04", value 0.215 (0.063-0.484). Both exclude
  0.6. The smaller deficit, visuospatial, is used. That moves the value least
  while satisfying both sources' direction.
- **The normed instrument agrees but its pool does not fit the persona.**
  Wilson 2024, Table 5, autistic adults: WMI 92.9 (95% CI 83.5, 102.3), which
  is 0.318 (0.136-0.561). That is within 0.001 of the value used. It is not
  the primary source because Wilson's Table 3 pools a sample with mean FSIQ
  51.3 (n = 58), and the persona is autistic adults without intellectual
  disability.
- **Habib's reference is matched controls, not a published norm.** Section
  3.1.1's "effect size d against the norm" is read here as d against typical
  controls of the same age and IQ.

## Not changed (51 cells)

Each cell is filed under the first reason in this order:

1. it is a bridged capacity;
2. the fit is not good (rule 2);
3. the age does not match (rule 3);
4. no CI is printed (rule 4);
5. the source gives a direction only.

The "also" column lists the other conditions that fail. No cell met rules
2-4 and still failed only rule 1. The norm-implied value and interval are
those of README section 3.1, computed against the value before this change.
"CI" means a 95% CI printed in the source.

### 1. Bridged capacity: computed, not authored (15)

None of these has an authored value to set. Their scale also puts typical at
0.70-0.84, not 0.5 (README 3.2). The fit and age column is for the record.

| persona | trait | current (bridged) | norm-implied (interval) | source | fit, age |
|---|---|---|---|---|---|
| cognitive-adhd | sustainedAttention | 0.300 | 0.309 (0.242-0.378) | Boonstra 2005, CPT omissions | good, adults |
| cognitive-adhd | readingCapacity | 0.746 | 0.274 (0.140-0.456) | Boonstra 2005, Stroop word card | partial, adults |
| cognitive-adhd | motorCapacity | 0.741 | 0.323 (0.258-0.390) | Boonstra 2005, TMT-A | weak, adults |
| dyslexic-user | readingCapacity | 0.387 | 0.030 (range 0.021-0.041) | Reis 2020; Callens 2012 0.099 (0.056-0.164) | good, adults |
| dyslexic-user | sustainedAttention | 0.500 | 0.305 (none) | Callens 2012, Digit Crossing | weak, adults |
| dyscalculia | sustainedAttention | 0.700 | 0.409 (range) | Haberstroh 2022 | partial, children |
| dyscalculia | readingCapacity | 0.671 | 0.371 (from SE) | Haberstroh 2022 | partial, children |
| elderly-user | sustainedAttention | 0.400 | 0.722 (0.626-0.802) | Vallesi 2021, SART no-go | partial |
| elderly-user | motorCapacity | 0.605 | 0.033 (range) | Sleimen-Malkoun 2013 | partial; n = 24, stylus |
| elderly-user | readingCapacity | 0.673 | 0.159 (none) | Calabrese 2016 | good; a curve fit |
| elderly-low-vision | sustainedAttention | 0.500 | 0.722 (0.626-0.802) | Vallesi 2021 | partial |
| elderly-low-vision | motorCapacity | 0.605 | 0.033 (range) | Sleimen-Malkoun 2013 | partial |
| elderly-low-vision | readingCapacity | 0.526 | 0.009 (none); 0.159 against Calabrese alone | Patel 2020 + Calabrese 2016 | good; a cross-study comparison |
| low-vision-magnified | readingCapacity | 0.536 | 0.009 (none) | Patel 2020 + Calabrese 2016 | partial; AMD sample aged 78.7, persona 45-75 |
| aphasia-receptive | sustainedAttention | 0.600 | 0.059 (none) | Murray 2011, TEA Telephone Search while Counting | partial (a dual task) |

### 2. Fit is partial or weak (20)

| persona | trait | current | norm-implied (interval) | source | why the fit is not good | also |
|---|---|---|---|---|---|---|
| cognitive-adhd | mentalModelFlexibility | 0.70 | 0.258 (0.198-0.323) | Boonstra 2005, TMT-B | set shifting, not revising a mental model of an interface | the largest gap in the table (README 3.4, rank 1) |
| cognitive-adhd | riskTolerance | 0.70 | 0.641 (0.587-0.695) | Dekkers 2016 | laboratory risky choice, not clicking unfamiliar controls | mixed ages |
| cognitive-adhd | resilience | 0.40 | 0.121 (0.051-0.242) | Beheshti 2020 | emotion dysregulation, not speed of recovery (the Brief Resilience Scale construct) | |
| cognitive-adhd | selfEfficacy | 0.40 | 0.326 (none) | Andreassen 2026 | academic, not computer, self-efficacy | one study; no CI |
| cognitive-adhd | metacognitivePlanning | 0.30 | 0.305 (none) | Pievsky 2018 | planning ability, not the tendency to plan | mixed ages; no CI; not contradicted |
| dyslexic-user | resilience | 0.50 | 0.295 (none) | Vieira 2023 | weak: an anxiety and depression composite | ages 7-35; no CI |
| elderly-user | mentalModelFlexibility | 0.20 | 0.241 (none) | Czaja 2006, Trail Making B-A | set shifting | no CI; young-adult reference |
| elderly-user | riskTolerance | 0.20 | 0.528 (0.520-0.536) | Mata 2011 | risky-choice tasks whose age effect changes sign by task (BART: older safer; CGT: older riskier) | fixed-effects CIs; README 3.4 rank 5 |
| elderly-user | trustCalibration | 0.25 | 0.587 (range 0.560-0.629) | Bailey & Leon 2019 | trust in faces and trust games, not web claims | range, not a CI (abstract); Castle 2012 corroborates the direction |
| elderly-low-vision | mentalModelFlexibility | 0.15 | 0.241 (none) | Czaja 2006 | as for elderly-user | no CI |
| elderly-low-vision | riskTolerance | 0.10 | 0.528 (0.520-0.536) | Mata 2011 | as for elderly-user | README 3.4 rank 2 |
| elderly-low-vision | trustCalibration | 0.40 | 0.587 (range) | Bailey & Leon 2019 | as for elderly-user | range |
| deaf-user | workingMemory | 0.60 | 0.255 (0.187-0.326) verbal; 0.478 (0.348-0.610) visuospatial | McFayden 2023 | serial-order recall; the deficit is verbal-sequential only, and the visuospatial interval contains 0.60 | ages pooled; the abstract gives no adult estimate |
| deaf-user | changeBlindness | 0.30 | 0.131 (none) | Dye 2009 | Useful Field of View threshold, not change detection | d derived here from partial eta squared |
| autism-spectrum | mentalModelFlexibility | 0.20 | 0.245 (none); WCST 0.302 (range 0.230-0.382) | Xie 2020; Landry 2016 | EF flexibility and card sorting, not interface model revision | no CI; Landry mixed ages |
| autism-spectrum | metacognitivePlanning | 0.55 | 0.302 (0.255-0.348) | Olde Dubbelink 2017 | planning ability (Tower tasks), not the tendency to plan | 13 of 50 studies adult |
| autism-spectrum | anchoringBias | 0.75 | 0.212 (0.075-0.440) | Shah 2016 | weak: a framing effect, not anchoring | |
| intellectual-disability | trustCalibration | 0.70 | 0.867 (0.791-0.921) | Gilbert 2026 | Gudjonsson Yield: suggestibility under forensic questioning, not trust in web claims | against normative data |
| intellectual-disability | authoritySensitivity | 0.90 | 0.758 (0.670-0.836) | Gilbert 2026 | Gudjonsson Shift under interviewer pressure, not response to authority cues in a UI | |
| aphasia-receptive | mentalModelFlexibility | 0.40 | 0.086 (none) | Murray 2011, TEA Visual Elevator | attention switching, not model revision | no CI |

### 3. Good fit, but the age does not match (1)

| persona | trait | current | norm-implied (interval) | source | what fails |
|---|---|---|---|---|---|
| dyscalculia | workingMemory | 0.35 | 0.271 (0.205-0.347) | Haberstroh 2022 | Children aged 8-12; the persona is adults 18-55, and no adult dyscalculia sample was found. The interval is also g +/- 1.96 SE, computed here. |

### 4. Good fit and matching age, but no CI is printed (7)

| persona | trait | current | norm-implied (interval) | source | what fails |
|---|---|---|---|---|---|
| cognitive-adhd | timeHorizon | 0.90 | 0.655 (none) | Jackson & MacKillop 2016 | The adult subgroup is printed only as "d = 0.40; p < 10^-11" (Results). Table 1 lists per-study effects only. I checked the PMC full text and page; no interval for the subgroup. |
| dyslexic-user | workingMemory | 0.30 | 0.326 (none) | Callens 2012 (higher-education students) | d = .45 with no CI. Also not contradicted: 0.03 from the point value. Swanson 2009 (0.251, 0.248-0.261) is children. |
| elderly-user | workingMemory | 0.40 | 0.086 (range 0.012-0.262); 0.173 (range) | Schmiedek 2014; Czaja 2006 | Both intervals are ranges across tasks. The reference is young adults (20-31; 18-39), and which reference section 3.1.1 means for older personas is undecided (README 3.4). |
| elderly-low-vision | workingMemory | 0.30 | 0.086 (range); 0.173 (range) | Schmiedek 2014; Czaja 2006 | As above. Schmiedek's older group ends at 80, and the persona is 75+. |
| elderly-low-vision | vocabularyBreadth | 0.85 | 0.788 (none) | Verhaeghen 2003 | The abstract says "average effect size, favoring the old, was 0.80 SD", with no interval. The direction supports the current value. |
| intellectual-disability | workingMemory | 0.20 | 0.012 (range 0.002-0.017) | Mortari Ferreira 2026 | I read the full text (Europe PMC XML: section 3.3 and Tables 2-5). No interval is printed for any ID Working Memory Index estimate: WAIS-IV g = -2.27, WAIS-III -2.12, pooled Table 2 SMD -2.84 (n 335, k 7). Table 5's intervals are for index-vs-FSIQ contrasts. The ID rows also pool WISC and WAIS samples, so the age match is not established either, and the text and Table 2 swap the ID and ASD+ID labels. |
| aphasia-receptive | workingMemory | 0.45 | 0.466 (none) | Murray 2011, WMS-R visual span backward, mean percentile 46.6 | Mean percentile with no interval. Ages match (60.2, range 32-83). Also not contradicted. Lugtmeijer 2020 (0.278, 0.233-0.326) is partial fit: all stroke, not aphasia. |

### 5. Direction only, no effect size to convert (8)

| persona | trait | current | evidence | reading |
|---|---|---|---|---|
| elderly-user | anchoringBias | 0.70 | Jin 2023: "No age differences were found" (60-74 vs 18-34) | points to about 0.5; no effect size |
| elderly-user | timeHorizon | 0.40 | Seaman 2022: r with age -0.068 [-0.170, 0.035] | a correlation with age, not a group mean; current is within 0.15 of 0.5 |
| elderly-user | satisficing | 0.60 | Djulbegovic 2014: age r = -0.239 with satisficing, -0.220 with maximizing (physicians 25-69) | no direction for the trait |
| elderly-user | selfEfficacy | 0.40 | Czaja 2006: ATCQ computer efficacy differs by age group, F = 51.05, no means | direction only, consistent |
| elderly-user | fearOfMissingOut | 0.30 | Przybylski 2013: FoMO falls with age, r = .37 (printed without a sign), ages 22-65 | direction only, consistent |
| autism-spectrum | socialProofSensitivity | 0.25 | Bowler 1994: "no overall difference ... in mean rate of conformity" | points to about 0.5; no numbers |
| autism-spectrum | changeBlindness | 0.30 | Ashwin 2017: less change blindness for some changes, more for others; n = 22 + 22 | mixed |
| intellectual-disability | mentalModelFlexibility | 0.10 | Spaniol 2021: g = -0.34 [-0.53, -0.16] against MENTAL-age-matched controls | the reference is not same-age adults; it bounds the value at 0.37 at most, and the current value is consistent |

### Count

- 53 persona-trait cells considered:
  - 44 have a row in README section 3.1;
  - 9 come from section 3.3 or from sources.md (Verhaeghen 2003).
- **2 changed.**
- **51 not changed:**

  | reason | cells |
  |---|---|
  | 1. bridged capacity | 15 |
  | 2. fit not good | 20 |
  | 3. age | 1 |
  | 4. no CI printed | 7 |
  | 5. direction only | 8 |

- **Personas with nothing usable** (README 3.3): motor-impairment-tremor and
  color-blind-deuteranopia. They have no cell to consider.

**What the rule leaves standing.** These gaps are not endorsements of the
current values. The largest are:

- cognitive-adhd mentalModelFlexibility, gap +0.44, partial fit;
- elderly-low-vision riskTolerance, gap -0.43, partial fit;
- intellectual-disability workingMemory, gap +0.19, good fit but no CI.

The last is the one most likely to qualify next. By definition (FSIQ about
2 SD or more below the mean, AAIDD), mild intellectual disability sits near
the 2nd percentile, so a current 0.20 is hard to defend. An adult source that
prints a CI would qualify the cell under this rule.

## Reproduce

Each command is run as wyld-web from the worktree root.

```
bun research/persona-norms/norm-implied.ts       # current values now read 0.37 and 0.32 for the two cells
bun test tests/persona-provenance.test.ts        # recomputes both values from z
```
