# Persona trait corrections, 21.0

Built-in persona values that contradicted their own comments or citations
(`src/personas.ts`), what was wrong in each, and what the change moved in the
CTC golden matrix. Decided 2026-10-22 on `feat/b-cifp`.

## Decision rule

Each pair had a value and a comment that disagreed. One of them was wrong. To
decide which:

- **A value that contradicts its own citation's stated direction is the value's
  error.** The cited finding is the only evidence beside the number.
- **A comment that contradicts a value with no citation is resolved toward the
  persona's documented intent.** That intent is read from:
  - the persona's description and behaviours in `personas.ts`;
  - the persona's published trait table (`cbrowser-web/wiki-content/Persona-*.md`);
  - the decision record of the doc reconciliation that set most current values
    (commit `c912716`, 2026-08-02; its exception list is in
    `cbrowser-web/scripts/persona-doc-apply.ts`);
  - trait-reference's `typicalScores`.

### How most of these arose

`c912716` reconciled every persona's code with its published table. Where the two
disagreed, it moved 159 values in the code, and it left the comment beside each
value as it was. 142 comments in that diff kept text written for the old value.

- For most of them the change was within a band (0.85 -> 0.8, "High").
- For seven the value crossed to the other side of neutral, or the comment's
  meaning contradicts the new value. Five of those are in the audit's list; two
  more turned up in the same scan (rows 5 and 6).
- For two values (rows 9 and 10) the reconciliation itself overrode a cited value:
  - one by its "neutral loses" rule (0.5 read as an unclaimed default);
  - one by an exception judged on the doc's rationale alone.

The commit message records that it had caught and reverted this failure for two
other dyslexic-user values. These two were not caught.

## Decisions

| # | persona.trait | value | comment | evidence | wrong | change |
|---|---|---|---|---|---|---|
| 1 | anxious-user.patience | 0.8 | "Low - anxiety makes waiting feel worse" | No citation. Doc table: 0.8, "willing to spend time ensuring safety; thoroughness over speed". c912716 exception: keep the doc, because 1.0 means "waits indefinitely" and "thoroughness over speed" is the high end. Behaviours: double_checks_everything, reads_warnings_carefully. | comment | comment -> "High - spends time making sure it is safe; thoroughness over speed" |
| 2 | confident-user.changeBlindness | 0.6 | "Low - notices changes" | No citation. Scale: 1 = tunnel vision (misses changes). Doc: 0.6, "may miss changes while moving quickly". c912716 exception: keep the doc. | comment | comment -> "Medium-high - may miss changes while moving quickly" |
| 3 | confident-user.metacognitivePlanning | 0.4 | "High - plans efficiently" | No citation. Doc: 0.4, "minimal planning; trusts ability to adapt". c912716 exception: keep the doc ("the low end; code had 0.7"). | comment | comment -> "Low-medium - minimal planning; trusts ability to adapt" |
| 4 | stoic-user.patience | 0.7 | "Very high - doesn't rush" | No citation. The label was written for 0.9; c912716 moved the value to the doc's 0.7 ("invests time in thorough analysis"). trait-reference lists stoic-user as typically high. 0.7 is high, not very high. | comment (magnitude) | comment -> "High - doesn't rush" |
| 5 | anxious-user.persistence (same class, found by scan) | 0.6 | "Low-medium - gives up when anxious" | No citation. Doc: 0.6, "will persist if feeling safe; abandons when anxiety escalates". c912716 exception: keep the doc ("reads above neutral"). | comment | comment -> "Medium-high - persists while feeling safe; abandons when anxiety escalates" |
| 6 | confident-user.patience (same class) | 0.3 | "Medium - not impatient but efficient" | No citation. Doc: 0.3, "Low; expects quick outcomes; minimal tolerance for delays". The comment's "not impatient" contradicts 0.3 on a scale where 0 abandons quickly. | comment | comment -> "Low - expects quick outcomes; little tolerance for delays" |
| 7 | elderly-low-vision.resilience (same class) | 0.6 | "Low - frustration compounds with physical challenges (BRS)" | BRS is the scale's construct reference, not a finding about this persona. Doc: 0.6, "adapted over time; may become discouraged by repeated barriers". c912716 exception: keep the doc, because "code's 0.25 reads as learned helplessness". | comment | comment -> "Medium-high - adapted over time; repeated barriers still discourage (BRS)" |
| 8 | deaf-user.emotionalContagion (same class) | 0.6 | "Less affected by audio tone" | No citation. Doc: 0.6, "sensitive to visual emotional cues; strong facial reading". c912716 exception: keep the doc. | comment | comment -> "Medium-high - reads visual emotional cues closely (facial expression)" |
| 9 | dyslexic-user.resilience | 0.6 | "Pulled down from 0.6 for documented secondary anxiety (Kapur & Agrawal 2026), but not lower: the compensation literature ... learned helplessness would overstate it" | Cited direction: down from 0.6. `a789ba4` wrote the value 0.5 with this comment. `c912716` moved it back to the doc's 0.6 under its rule "one side is neutral: keep the side that states something". That treated a deliberate, cited 0.5 as an unclaimed default. In persona-doc-apply.ts this rule runs before the protection it gives dyslexic-user as a vector "rebuilt from the literature", so the protection never applied. | value | 0.6 -> **0.5**; the comment records the history |
| 10 | low-vision-magnified.satisficing | 0.4 | "Limited information access increases satisficing (Pachur & Hertwig, 2006). Seeing only 1/9th of screen at a time -> accept accessible options" | Cited direction: more satisficing (1 = satisficer). The value is on the maximiser side. `4c0a602` wrote 0.65 beside this citation. `c912716` set the doc's 0.4 by an exception that read only the doc's rationale ("prefer thorough understanding"). That rationale's second half, "re-finding options is costly", argues the cited direction. | value | 0.4 -> **0.65** (the value written with the citation) |
| 11 | cognitive-adhd.workingMemory | 0.3 | "Research: large magnitude impairment (d=1.63-2.03)", no source | The figure is Kofler et al. 2020, Neuropsychology 34(6):686-698, doi 10.1037/neu0000641, PMC7483636 (details below). It is not either suggested source: Martinussen et al. 2005 (largest effect 1.06) or Kasper et al. 2012 (no figure in its abstract). | citation | value unchanged; comment cites Kofler et al. 2020 precisely, with the age caveat |

### Row 11: the ADHD effect size

Kofler et al. (2020) assessed central-executive working memory in a bifactor
model, with this result:

- d = 1.63-2.03;
- 75%-81% of children with ADHD impaired;
- 172 children aged 8-13.

This is the same paper the persona's own research note already cited for the
75-81% figure. Two caveats now sit in the comment and the provenance entry:

- the sample is children while the persona is adults aged 18-45;
- an effect size is a group difference in standard deviations, with no stated
  mapping to a 0-1 value.

Checked and ruled out (abstracts via PubMed):

| source | what it reports |
|---|---|
| Martinussen et al. 2005, JAACAP 44(4):377-384, doi 10.1097/01.chi.0000153228.72591.73 | effect sizes 0.43-1.06; spatial central executive 1.06 is the largest |
| Kasper, Alderson & Hudec 2012, Clin Psychol Rev 32(7):605-617, doi 10.1016/j.cpr.2012.07.001 | "large between-group effect sizes", no figure in the abstract |
| Rapport et al. 2008, J Abnorm Child Psychol 36(6):825-837, doi 10.1007/s10802-008-9215-y | the largest deficit is in the central executive, no figure in the abstract |

### Row 10 caveats

Pachur & Hertwig 2006 (J Exp Psychol Learn Mem Cogn 32(5):983-1002, doi
10.1037/0278-7393.32.5.983) studies recognition-based inference. It finds such
inference faster and more prevalent under time pressure. It is not a study of
low vision or of satisficing, so it supports the direction only by analogy.

The provenance entry now says so. It replaces the old note, which said the value
sat on the wrong side.

### What the docs now disagree with

Rows 9 and 10 make the code disagree with the published trait tables again. These
pages live in cbrowser-web, outside this change:

- `wiki-content/Persona-DyslexicUser.md` gives resilience 0.6;
- `wiki-content/Persona-LowVision.md` gives satisficing 0.4.

Both pages should take the cited values. The rows 1-8 comment fixes make the code
agree with the docs.

### Found by the same scan, not changed

About 20 cognitive-trait comments label 0.3-0.4 "Very low" or 0.6-0.7 "Very high"
(for example impatient-user.curiosity 0.3 "Very low", elderly-low-vision.trustCalibration
0.4 "Very low", stoic-user.persistence 0.7 "Very high", stoic-user.resilience 0.8
"Maximum"). The file has no defined label scale, so these are loose rather than
contradictory. Rewriting them would mean choosing a scale for the whole roster.
Only stoic-user.patience, which the audit named, is relabelled. The scan: any
cognitive trait whose comment opens "Very high"/"Maximum" below 0.75, or "Very
low"/"Minimum" above 0.25.

## CTC change per changed persona

From `bun research/persona-21-ctc-deltas.ts <pin before> <pin after>`. The two
pins are `tests/fixtures/ctc-golden-21.0.0.json` at `cb1b78c` and as regenerated
by `tests/fixtures/generate-ctc-golden.ts` after this change. The inputs are 19
pages: 12 raw demands, 2 prose pages, 4 dominant-readability pages and 1 gate
edge. Ranks are among the 25 human personas by totalCTC under the tool default
options (1 = highest cost).

### Tool default options (asym+inter)

| persona | totalCTC mean change | mean abs | max abs (page) | cells changed | abandonment mean change | max abs | bottleneck changes | scroll totalAbandonment mean change | max abs |
|---|---|---|---|---|---|---|---|---|---|
| low-vision-magnified | -0.0135 | 0.0186 | 0.1046 (choice-heavy) | 17/19 | -0.0199 | 0.1404 | 1 | -0.0350 | 0.1060 |
| dyslexic-user | 0 | 0 | 0 | 0/19 | +0.0093 | 0.0217 | 0 | +0.0102 | 0.0220 |

### All four option sets (19 pages x 4)

| persona | totalCTC mean change | mean abs | max abs (page, options) | cells changed | abandonment mean change | max abs | bottleneck changes |
|---|---|---|---|---|---|---|---|
| low-vision-magnified | -0.0086 | 0.0225 | 0.1326 (choice-heavy, symmetric) | 70/76 | -0.0187 | 0.1421 | 5 |
| dyslexic-user | 0 | 0 | 0 | 0/76 | +0.0093 | 0.0219 | 0 |

### Rank moves on the 12 raw demands

| persona | moves |
|---|---|
| low-vision-magnified | sparse 12 -> 10, light 13 -> 11, mid 18 -> 21, control-heavy 13 -> 18, choice-heavy 13 -> 19, dense 18 -> 21, max 18 -> 23 |
| dyslexic-user | light 12 -> 13, control-heavy 16 -> 15, choice-heavy 19 -> 18 |

Dyslexic-user's own totalCTC did not change. Its rank moved only because
low-vision-magnified passed it.

25 of the 27 golden personas are unchanged in every chain and scroll number,
including the two boundary personas. The two changes touch one persona each, so
each row above is that change alone.

### Reading the two changes

Per-page values are under the tool default options.

- **Satisficing 0.4 -> 0.65 (low-vision-magnified).**
  - It lowers this persona's cost most on the pages with many controls or
    choices:

    | page | totalCTC | bottleneck |
    |---|---|---|
    | choice-heavy | 0.319 -> 0.215 | decision |
    | dense | 0.492 -> 0.391 | cognitiveLoad |
    | control-heavy | 0.235 -> 0.169 | decision |

  - It raises the cost slightly, by +0.002 to +0.011, on the sparse, light,
    text-heavy, visual-heavy, animated, prose and readability pages. That is why
    the mean change (-0.014) is smaller than the mean absolute change (0.019).
  - The light page's bottleneck moves from visualComplexity to decision.
  - Abandonment falls by up to 0.140 (choice-heavy).
  - Scroll abandonment falls on all four inputs, by up to 0.106 (landing-8).
- **Resilience 0.6 -> 0.5 (dyslexic-user).**
  - It does not enter totalCTC on any page.
  - It raises abandonment on every page, by up to 0.022 (technical-prose).
  - It raises scroll abandonment by up to 0.022 (article-5).

These are changes in the model's own output. Neither value has been measured in
the persona's population; the persona provenance catalogue keeps both as
hypotheses, and its pinned count (686 entries) is unchanged.
