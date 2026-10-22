# Stage B: motor, decision and reading demand from published laws

Design note, Phase 1. Nothing under `src/` has changed. Worktree
`cbrowser-public-wt-stage-b`, branch `feat/stage-b`, HEAD `fe73d77`.

Everything numeric below was either read from a source retrieved in this session
(section 1) or measured on 23 real pages in this session (section 9, scripts
`research/stage-b-*.ts`). Where a number is neither, it is labelled.

---

## 0. The answer, then the decisions you need to make

**What the laws give.** All four channels can be computed from RawPageMeasurement
format 1 as committed, in seconds, for a reference user:

| channel | law and parameters | page time, viewport median [p10, p90] |
|---|---|---|
| pointing | Fitts, Shannon form, smaller-of width, MT = 0.230 + 0.166 ID s (MacKenzie & Buxton 1992) | 37.6 s [13.5, 187] |
| choosing | Cockburn, Gutwin & Greenberg 2007: novice search 0.30 + 0.08 n s per group, expert Hick-Hyman 0.24 + 0.08 log2 n | search 6.1 s [1.4, 17.5]; Hick-Hyman 1.5 s [0.7, 5.4] |
| reading | Brysbaert 2019: 238 wpm x 4.6 / mean word length (a constant 1094.8 letters/min); Table 5 for abjad and CJK | 49.4 s [15.0, 133] |
| procedure | KLM mental preparation M = 1.35 s per entry step (Card, Moran & Newell 1980) | 1.4 s [0, 9.5] |

**Unit coherence: yes for two layers, no for three, without changing the chain.**
One transform, one constant: demand `d = T / (T + tau)`; capacity
`c = r_p / (r_p + r_ref)`, the persona's rate against the reference rate. Then
`d > c` exactly when the persona's own time on the page exceeds tau, and tau cancels
out of every capacity. This works inside the gap-squared structure unchanged, for
the two layers whose capacity is a rate: `motor` (Fitts throughput) and
`readability` (reading speed). It requires changing two capacity bridges
(`motorCapacityOf`, `readingCapacityOf` in `cognitive-models.ts`, not one of my
files). It cannot be done for `decision`, `motorProcedure` and `readingAttention`
without re-authoring their capacities, which are dispositions on a 0-1 scale with no
time unit; there the demand becomes time-grounded and the capacity keeps its old
meaning. I say this plainly in the paper section below (6.4).

**tau = 12.4 s**, the median stay on first-time page visits (Weinreich et al. 2008).
The statistic is published; using it as the budget every channel is judged against
is a hypothesis.

**What that does to scores** (sample, section 9):

- decision demand falls from 0.81 to 0.33 (search) or 0.11 (Hick-Hyman) at viewport
  median; the decision layer goes from the largest layer for most personas to a
  small one (power-user 0.534 -> 0.096);
- procedure demand falls from 0.64 to 0.10 and is 0 on a page with no entry field;
- reading demand rises from 0.49 to 0.80 (viewport) and 0.62 to 0.96 (full_page),
  where it saturates (p10 0.92), and motor rises from 0.64 to 0.75 / 0.81 to 0.93;
- on the time scale, the persona spread of reading capacity collapses from
  0.387-0.787 to 0.408-0.496, because the existing reading model says the slowest
  persona reads only 1.45x slower than the reference. Elderly-low-vision overtakes
  dyslexic-user as the costliest reader.

**Decisions for you** (my recommendation first):

1. **Aggregation: the scope's content processed once through each channel**
   (every target acquired once, every choice group resolved once, all prose read once).
   This is the convention reading already uses. The alternative, one act per channel,
   leaves pointing and choosing at about 1 s each against a 50 s read, and the motor
   layer dies.
2. **Decision law: Cockburn's novice limit (linear search), not bare Hick-Hyman.**
   The tool scores first visits, and Cockburn et al. measured that novices search
   linearly; Hick-Hyman is their expert limit. Bare Hick-Hyman is the literal
   reading of the paper's claim and gives a decision demand of 0.11.
3. **One tau, hyperbolic.** If full_page saturation is unacceptable, the fix is one
   more constant: a Hill exponent `d = T^a / (T^a + tau^a)`. a = 0.5 brings full_page
   reading p10-p90 from 0.92-0.98 to 0.77-0.88. The alternative, a tau per channel
   from the reference medians, buys back balance and gives up coherence.
4. **Bridges: change `motorCapacityOf` and `readingCapacityOf` to rate ratios**
   (needs your go, they are outside my files). Without that, demand is in seconds and
   capacity is not, and the gap means nothing in either unit.
5. **proceduralFluency: KLM (M x entry steps).** The count of steps is a definition;
   KLM's own placement rules need a task method we do not have. The alternative is to
   keep the hand-set interactive-count curve for this one trait as a hypothesis.
6. **Touch: not wired in Stage B.** MacKenzie (2015) reports touch throughput but no
   regression, the format has no input-modality field, and the reference crawl is
   desktop.
7. **Nested prose: accept the bias for Stage B, fix it in raw format 2.** On the
   sample, words are double-counted by 1.00x at the viewport median and up to 1.95x
   (Hacker News, nested tables). A fix needs a measurePageRaw field and a re-crawl.
8. **Per-screen path** (`extractPerScreenMetrics`, not one of my files): scale the
   pointing and choosing seconds by the share of new elements, as it already does
   for counts.

---

## 1. Sources read in this session

Only these supply a parameter. "Not retrieved" means I cite the origin of a law but
took no number from it.

| source | what I read | what is taken |
|---|---|---|
| MacKenzie, I. S. & Buxton, W. (1992). Extending Fitts' law to two-dimensional tasks. CHI '92, 219-226 (yorku.ca/mack/CHI92.html) | the five width models, Figure 6 regressions, method | ID = log2(A/W + 1), W = SMALLER-OF(width, height); MT = 230 + 166 ID ms (r = .9501, SE 64 ms, 78 conditions). Mouse on a Macintosh II, C-D gain 0.53, 12 computer-literate volunteers, A 2-32 and W, H 1-8 units of 10 px, approach 0/45/90 degrees. W' (width along the approach) fit as well (r = .9333, 337 + 160 ID); they recommend SMALLER-OF because it needs no approach angle |
| Soukoreff, R. W. & MacKenzie, I. S. (2004). Towards a standard for pointing device evaluation. IJHCS 61, 751-789 (yorku.ca/mack/ijhcs2004.html) | sections 2, 3.2-3.4, 4.1-4.2 | the Shannon form is the preferred formulation (3.3); We = 4.133 SDx, so throughput includes accuracy (3.2); throughput of the ISO 9241-9 mouse studies falls in [3.7, 4.9] bits/s (4.2, Table 4); MT should be predicted from the regression, and throughput is for comparing conditions (2, step VI) |
| Cockburn, A., Gutwin, C. & Greenberg, S. (2007). A predictive model of menu performance. CHI '07, 627-636, doi:10.1145/1240624.1240723 (PDF from grouplab.cpsc.ucalgary.ca) | model (Eq. 1-7), calibration study | Hick-Hyman T = a + b H, H = log2(1/p), log2(C) for C equiprobable items; expert (static, familiar menus, block 1 removed) Thh = 0.08 log2(n) + 0.24 s, R^2 = .98; novice (random menus, block 1 removed) Tvs = 0.08 n + 0.30 s, R^2 = .99; Tds = (1 - e) Tvs + e Thh (Eq. 4); Fitts on 130x22 px items Tp = 0.37 + 0.13 ID s, R^2 = .93. 8 right-handed graduate CS students, mouse, 15-inch 1400x1050 display, menus of 2, 4, 8, 12 items |
| Brysbaert, M. (2019). How many words do we read per minute? JML 109, 104047, doi:10.1016/j.jml.2019.104047 (PDF) | abstract, inclusion criteria, Results, "Reading rate and text difficulty", "Reading rates in different languages", Table 5, conclusions | silent reading of English non-fiction 238 wpm (unweighted random effects over 190 studies, 18,573 participants; SD 51.2, 95% CI 230-246; fiction 260); predicted rate for a text = 238 x 4.6 / mean word length in letters (4.6 = non-fiction, 4.2 = fiction, Johns & Dye corpora), with the note that each language needs its own equation; Miller & Coleman (1971) found letters per second removes the text-difficulty effect; Table 5 silent rates: Arabic 181 wpm (10 studies, 673 participants), Hebrew 224 (5, 168), Chinese 260 (18, 786; words estimated at 1.5 characters each), Korean 226 (5, 186), English 236 (144, 15,409). Population: adults 18-60, native speakers, mostly university students, reading for comprehension with the whole text visible. His caveat: these are rates for readers who stay on task; less constrained reading is likely slower |
| Card, S. K., Moran, T. P. & Newell, A. (1980). The keystroke-level model for user performance time with interactive systems. CACM 23(7), 396-410 (CMU library scan) | Figure 1 operator table, Figure 2 M-placement rules, section 4.2.1 | M = 1.35 s, estimated by least squares on their own experiment (R^2 = .84, SE .11 s, SD of tM about 1.1 s; 28 users on 1980 text and graphics editors); P = 1.10 s average pointing (.8-1.5 by Fitts); K = .20 s for an average skilled typist |
| Weinreich, H., Obendorf, H., Herder, E. & Mayer, M. (2008). Not quite the average: an empirical study of Web use. ACM TWEB 2(1), 5:1-5:31, doi:10.1145/1326561.1326566 (readkong copy) | section 4.4, Figures 4 and 5 | first-time page visits: median stay 12.4 s, about half under 12 s, 11.6% over 2 min; all visits: median 9.4 s, 52% under 10 s; Google result pages 8.0 s. Pages left within 12 s averaged 430 words; all pages 551 (SD 811), "no person can read a full page of this length that quickly". 25 participants, long-term client-side logging. Their caveat: attention time is shorter than stay time |
| MacKenzie, I. S. (2015). Fitts' throughput and the remarkable case of touch-based target selection. HCII 2015, LNCS 9170, 238-249 (yorku.ca/mack/hcii2015a.html) | apparatus, results | touch throughput 6.95 bits/s (2D 6.39, 1D 7.52), LG Nexus 4, 16 participants; error 2.7% at 130 px targets and 12.2% at 78 px (6.1 mm, below the 14 mm mean fingertip); no regression is reported |
| Trauzettel-Klosinski, S. & Dietz, K. (2012). IReST. IOVS 53, 5452-5461, doi:10.1167/iovs.11-8284 (PubMed abstract) | abstract | not used: the rates (184 wpm, 863 characters/min) are for reading aloud |

Not retrieved, cited for the law only: Hick (1952) QJEP 4, 11-26; Hyman (1953) JEP 45,
188-196 (PubMed 13052851 has no abstract); Landauer & Nachbar (1985) CHI '85, 73-78
(ACM returned 403). Rayner's eye-movement work was not used: Brysbaert's word-length
equation does the job at the level of reading rate, which is what the chain needs.

---

## 2. Motor (Fitts)

### 2.1 Formulation

Shannon form `ID = log2(D / W + 1)` (Soukoreff & MacKenzie 2004, 3.3), movement time
`MT = a + b ID` with **a = 0.230 s, b = 0.166 s/bit** (MacKenzie & Buxton 1992,
SMALLER-OF fit). I predict MT from the regression, not as ID / throughput, because
that is what Soukoreff & MacKenzie say the regression is for.

Range across the two studies I read: Cockburn et al. (2007) fit 0.37 + 0.13 ID on
fixed 130x22 px menu items. On the sample the two give page totals within 4% of each
other (viewport medians 37.6 s and 38.9 s). I chose MacKenzie & Buxton because their
task is two-dimensional and fitted with the width model I use; Cockburn's targets
did not vary in shape.

### 2.2 Width, distance, which targets

- **W = min(box width, box height)** (SMALLER-OF). It had the highest r and needs no
  approach angle. W' fit as well, and it could be computed from the boxes, but it
  adds geometry for no measured gain. Floor of 1 px (`definition`): a box only rounds
  to 0 below half a pixel, and ID is undefined at W = 0.
- **D = from the target's centre to the centre of the viewport it is seen in**
  (`definition`). At viewport scope that is `(vw / 2, scrollY + vh / 2)`. At full_page
  it is the centre of the screen-sized band containing the target's centre, bands
  tiled from the document top: `(vw / 2, floor(cy / vh) vh + vh / 2)`. This is the
  convention both motor audits already use (`audit-tools.ts:857`,
  `persona-comparison-tools.ts:1224`), so the layer and the audit agree on geometry.
  I rejected the alternative of measuring between successive targets in document
  order: document order is not a pointing order, and it would make a long column of
  adjacent links nearly free.
- **Targets**: every interactive box in scope, exactly what `interactiveElements`
  counts. When the count exceeds the stored boxes (cap 300), the stored sum is
  scaled by `count / stored` (`definition`; it assumes the unstored targets are as
  hard as the stored ones on average, and per-target MT barely varies, 2.4).
  Zero-size elements are already excluded by measurePageRaw.

### 2.3 Combination: the sum

`pointingSeconds = sum over targets of MT_i`: the time to acquire every target in
scope once. Mean and 90th-percentile MT are reported beside it as diagnostics.

Why the sum and not the mean:

1. **The mean barely varies across pages.** Measured over 23 pages, per-target MT
   has a median of 0.92 s and p10-p90 of 0.79-1.01 s (mean ID 4.15 bits, p10-p90
   3.35-4.70). A mean-based demand would be close to a constant. Page differences in
   pointing are mostly in how many targets there are; Fitts adds a +/-10%
   difficulty weighting per page on top of that. That is a finding and the paper
   should say it.
2. **It is the convention reading already uses**: all prose in scope, read once.
3. **One acquisition per channel cannot share a tau with reading** (section 6.3):
   about 0.9 s of pointing against a 50 s read.

Interpretation, stated as such: this is pointing on offer, not the pointing a
particular task needs. The chain does not know the task. Its reading demand is all
prose on offer for the same reason.

### 2.4 Persona capacity

`motorCapacity = TP_p / (TP_p + TP_ref)`, where TP_p is the pointing profile's
throughput and TP_ref the neurotypical profile's 4.9 bits/s. That value lies inside
Soukoreff & MacKenzie's ISO mouse range [3.7, 4.9], at its top. Using a throughput
ratio to scale a whole movement time is the "comparing conditions" use they endorse.
That impairment scales the intercept as well as the slope is an assumption
(`hypothesis`).

The spread term in today's `motorCapacityOf` goes. ISO throughput is computed with
We = 4.133 SDx, so it already includes accuracy, and subtracting endpoint dispersion
again counts it twice.

Two findings about the profiles this would rest on:

- The throughputs in `KNOWN_POINTING_PROFILES` (4.9, 2.1, 3.2, 4.2) cite MacKenzie
  1992, Hwang 2004, Chaparro 1999, Ketcham 2002 and Flapper 2006. I have not verified
  those this session. Under this design they become load-bearing.
- `getPointingProfile` interpolates every persona that does not match by name
  between neurotypical (4.9) and tremor (2.1) on a disposition composite
  (0.6 proceduralFluency + 0.4 patience). So no persona reaches the reference:
  power-user gets 3.95, motor capacity 0.446. This is a pre-existing persona-model
  issue, and the rate mapping makes it visible.

### 2.5 Touch

Not wired. MacKenzie (2015) gives touch throughput (6.95 bits/s) but no regression,
and shows the error cost of fingertip-sized targets (12.2% at 6.1 mm), which a nominal
Fitts time does not capture. Format 1 has no input-modality field, and the reference
crawl is 1920x1080 desktop. A touch path needs a device field and a touch-specific
model (FFitts, Bi, Li & Zhai 2013, not retrieved), so it belongs in a later stage.

---

## 3. Procedure (proceduralFluency, the motorProcedure layer)

The only lawful operator I found for sequence execution is KLM's mental preparation,
**M = 1.35 s** (Card, Moran & Newell 1980, Figure 1, estimated in 4.2.1).

Proposal: `procedureSeconds = M x entrySteps`, where an entry step is
(`definition`):

- a box of kind `input:` text, email, password, search, tel, url, number, date,
  datetime-local, month, week, time, color, file or range;
- a `textarea` or a `select`;
- plus one step per radio or checkbox choice group.

Steps are scaled for the box cap like targets.

Limits, stated as such:

- KLM places M by rules applied to an encoded task method (Figure 2, Rule 0: before
  each K not in an argument string and each P that selects a command). We have no
  method, so "one M per field" is a definition borrowing KLM's operator, not KLM's
  placement.
- Typing time (K x characters) is not modelled; the format records no text lengths
  for fields.
- On the sample, 14 of 23 viewport pages have at least one step: header search
  boxes and option groups. A link-only page has 0, where today it gets 0.64.

Alternative: `proceduralFluency` keeps today's hand-set interactive-count curve
(`demand.interactive.halfSaturation` 20 and `.proceduralFluency` 0.9) as a labelled
hypothesis. I recommend KLM: it puts the layer in seconds on the same tau, and it
limits procedure to what the layer's own comment says it models ("multi-step flows,
form progressions").

---

## 4. Decision (Hick-Hyman, and why not bare Hick-Hyman)

### 4.1 What the evidence says applies

Cockburn et al. (2007) measured both limits on the same menus with the same users:

- **experts** (static, familiar items): `Thh = 0.24 + 0.08 log2 n` s, the Hick-Hyman law;
- **novices** (random item order): `Tvs = 0.30 + 0.08 n` s, linear visual search;
- **in between**: `Tds = (1 - e) Tvs + e Thh`, where e is expertise with the item.

Every persona in the tool path and the reference population scores a first visit
(siteFamiliarity 0). For that user, the measured law is the novice limit.

### 4.2 Recommendation

Decision demand from **Cockburn's Eq. 4 at e = 0**:
`T_group = 0.30 + 0.08 n` s, **published** from their random-menu condition.
Hick-Hyman, `0.24 + 0.08 log2 n`, is the expert limit, registered and reported, not
used for the demand.

The paper should then say the decision layer is grounded in Cockburn et al.'s menu
model, whose expert limit is Hick-Hyman. I recommend this over bare Hick-Hyman
because bare Hick-Hyman applies a law outside the condition it was measured in.

A demand that interpolates on the persona's siteFamiliarity would be the faithful
model, but it makes demand persona-dependent. That breaks the cross-persona
legibility contract and the DRO derivation, which holds demand fixed, so I do not
propose it for Stage B.

If you want literal Hick-Hyman: same structure with 0.24 + 0.08 log2 n, and decision
demand drops to 0.11 at viewport median.

### 4.3 Which groups, how they combine

- **Single-choice groups**, one decision among n: a nav's visible links, a select's
  options, a named radio group, menu, menubar, listbox, tablist, radiogroup.
  `T = a + b n` (novice) or `a + b log2 n` (expert).
- **A checkbox group of n** is n yes/no decisions: `n (a + b x 1)` in both forms,
  since each box is a choice between 2 (`definition`).
- **Links outside any nav**: `links - sum of nav group sizes`, floored at 0, form one
  more choice set (`definition`; today every link counts as a choice, so dropping
  them would change what the layer means).
- **Combination: sum over groups**, every choice the scope offers made once. Same
  convention as motor and reading. Groups beyond the 64 stored are scaled by
  `count / stored`.

Both parameter sets were measured on menus of 2 to 12 items. Pages carry far larger
sets: a median of 14 ungrouped links at viewport and 106 at full_page, up to 1,492
on a Wikipedia article. Applying either law there is extrapolation, and the note
says so.

### 4.4 The five decision traits

They stay what they are: dispositions with hand-set shares of one decision demand
(`hypothesis`).

| trait | share of decision demand |
|---|---|
| satisficing | 1, the reference trait, as today |
| anchoringBias | 0.85 |
| fearOfMissingOut | 0.75 |
| socialProofSensitivity | 0.7 |
| riskTolerance | 0.75, moved from the interactive curve |

Decision time says how much choosing a page asks. It says nothing about anchoring,
FOMO or social proof as such; the shares carry that claim, and it is untested.

---

## 5. Reading

### 5.1 Rate and word length

Brysbaert's equation for a text, `wpm = 238 x 4.6 / L` (L = mean word length in
letters), is a constant letter rate: **238 x 4.6 = 1094.8 letters per minute**, so
`T = letters / 1094.8` min. It removes the text-difficulty effect in the same way
Miller & Coleman found letters per second does.

Both 238 and 4.6 are `published` (Brysbaert 2019). On web text it matters: the
sample's median mean word length is 4.96 letters at viewport and 5.38 at full_page,
so the predicted rate is 221 and 204 wpm, not 238.

Limit: Brysbaert derived this for English and notes that each language needs its
own equation. Format 1 records script, not language, so every alphabetic page is
read at the English rate (`definition`, stated).

### 5.2 Script

| script | counted as | rate | status and choice |
|---|---|---|---|
| alphabetic | letters of `text.wordLengths` (letters only, as tokenised) | 1094.8 letters/min | published |
| abjad | abjad words | 181 wpm (Brysbaert Table 5, Arabic) | Hebrew is 224 (range 181-224). Format 1 cannot tell them apart. I chose Arabic as the larger sample (10 studies, 673 participants against 5 and 168) |
| abjad | Latin words on the page | the alphabetic letter rate | |
| cjk | `text.cjkChars` | 260 wpm x 1.5 characters/word = 390 characters/min | Brysbaert's Chinese rate times his own conversion, which recovers characters where he converted from them. Japanese is not in Table 5. Korean (226 wpm) is in space-separated eojeol words, and Hangul counts as CJK characters in format 1. Reading Japanese and Korean at the Chinese character rate is an assumption (`hypothesis`) |
| cjk | Latin words on the page | the alphabetic letter rate | |

The existing `pageMetrics.cjk.charsPerWord` (1.8, hypothesis) feeds avgWordLength and
is a different constant. The reading rate must use Brysbaert's 1.5, or it does not
recover his characters.

### 5.3 Amount

`readingSeconds` covers all prose in scope, once: the same text the readability
metrics read.

Two measurement issues found:

- **Nested prose is counted twice.** measurePageRaw tokenises every matching element,
  so a `p` inside an `li`, or a nested list, is read again. Measured on the sample
  (`stage-b-nesting.ts`, words counted as measurePageRaw does against counting only
  outermost prose elements): viewport median 1.00x (1.00-1.95x; Hacker News 1.95 from
  nested tables, usa.gov/agency-index 1.36); full_page median 1.05x (1.00-1.91x;
  usa.gov 1.67, gov.uk/browse 1.62, gov.uk 1.44). Fixing it needs a new raw field
  (an outermost-only word histogram), which means a re-crawl. Recommendation: accept
  and state the bias for Stage B; add it to raw format 2.
- **Script detection classed www.w3.org as CJK** (the key-element rule, h1 + nav). Not
  a Stage B change; reported because it routes that page's reading time through the
  CJK branch.

### 5.4 Persona capacity

`readingCapacity = ms_ref / (ms_ref + ms_p)`, the rate ratio, where ms_p is the
persona's per-word time from the text-independent terms of the existing fixation
model:

`250 + (1 - phonological) x 100 + max(0, 7 / visualSpan - 1) x 80` ms

The text-dependent terms (irregular words, vocabulary against word length, crowding
below 16 px, serif, contrast) need the page's text, so they cannot enter a
page-independent capacity. They stay where they are, in the readability audit.

Caveats:

- These ms constants live unregistered in `cognitive-models.ts` and I have not
  verified their citations (Rayner 2009, Perry, Zorzi & Ziegler 2019, Legge 2007).
- The slowdowns they produce are modest: dyslexic 1.39x, low vision 1.41x,
  elderly-low-vision 1.45x, elderly 1.17x, ADHD 1.07x. That is why the roster's spread
  collapses on the time scale (section 9.3). If dyslexic adults read, say, twice as
  slowly as the reference, their capacity would be 0.33, not 0.42. That is a
  persona-model question with its own sources.

### 5.5 sustainedAttention (readingAttention)

The base becomes the reading-time demand, replacing `max(textDensity,
informationDensity)`:

`sustained = min(1, d_read x 0.7 x (1 + distractor x 0.7))`

The reason for the old max term was that attentional cost must be absolute in the
amount of prose. `d_read` is absolute, so the reason carries over. The 0.7 base and
the distractor terms stay `hypothesis`. The 0.7 sits below readability's weight,
which is now 1 because the law gives the demand directly, so decoding still dominates
on a still page.

The capacity stays `attentionSpan`, a continuous-performance score with no time unit,
so this layer is coherent on the demand side only. readingTendency's engagement still
scales this demand and not readability's, as today.

---

## 6. Unit coherence

### 6.1 The transform

`d = T / (T + tau)`, which is `sigma(ln(T / tau))`. That is the same `v / (v + midpoint)`
form deriveMetrics already uses everywhere, with one shared midpoint in seconds in
place of per-feature midpoints in arbitrary units.

### 6.2 What capacity must mean

Under the same transform, a capacity c is a tolerated time `T_c = tau c / (1 - c)`:
the amount of reference-user time on this channel the persona gets through within
the budget. A persona k times slower than the reference gets through `tau / k`, so

`c = (tau / k) / (tau / k + tau) = 1 / (1 + k) = r_p / (r_p + r_ref)`.

tau cancels. The reference user sits at exactly 0.5 on every rate-based channel.

Then `d - c` has the sign of `k T - tau`: **a deficit exactly when the persona's own
time on the page exceeds the budget.**

The magnitude is not a function of k T alone (two sigmoids). For a fixed persona
time ratio `m = k T / tau`, the gap peaks at `tanh(ln(m) / 4)`, when page and persona
split the ratio evenly. An exact version, `d = clamp(0.5 + log2(T / tau) / S)` with
`c = clamp(0.5 - log2(k) / S)`, makes the gap exactly `log2(m) / S`, but costs a second
constant S and clamps at both ends.

### 6.3 tau, and why one tau has consequences

**tau = 12.4 s**: the median stay on first-time page visits (Weinreich et al. 2008,
4.4), first-time because the tool scores first visits. Range: 9.4 s over all visits,
8.0 s on search result pages. Status `hypothesis`. The value is a published
statistic; that it is the budget each channel is judged against is the model's
claim, and Weinreich et al. themselves note that attention time is shorter than stay
time.

One tau makes a second of reading cost the same as a second of pointing or choosing.
Measured in time, a page's channels differ by an order of magnitude (viewport
medians: reading 49 s, pointing 38 s, choosing 6 s by search or 1.5 s by Hick-Hyman,
procedure 1.4 s). So, with one tau:

| transform | constants | viewport demand median [p10, p90]: pointing / choosing (search) / reading / procedure | full_page reading |
|---|---|---|---|
| hyperbolic, tau 12.4 | 1 | 0.75 [0.52, 0.94] / 0.33 [0.10, 0.58] / 0.80 [0.53, 0.91] / 0.10 [0, 0.43] | 0.96 [0.92, 0.98] |
| Hill a = 0.5, tau 12.4 | 2 | 0.64 [0.51, 0.79] / 0.41 [0.25, 0.54] / 0.67 [0.52, 0.77] / 0.25 [0, 0.47] | 0.83 [0.77, 0.88] |
| log2-linear S = 10, tau 12.4 | 2 | 0.66 [0.51, 0.89] / 0.40 [0.18, 0.55] / 0.70 [0.52, 0.84] / 0.18 [0, 0.46] | 0.95 [0.85, 1.00] |
| tau per channel = reference median | 8 definitions (4 channels x 2 scopes) | 0.50 by construction on every channel | 0.50 |

The last row puts the typical page at 0.5 on every channel, which is the page-metrics
midpoint convention. It is not unit-coherent: a reading second and a choosing second
are no longer worth the same. It is the option if layer balance matters more than
coherence.

My recommendation is the first row. If full_page discrimination matters, add the Hill
exponent (one hypothesis constant). Either way, at full_page every real page is far
over a 12.4 s budget on reading. Under this model that is a finding, not an artefact:
it is Weinreich's "no person can read a full page of this length that quickly".

### 6.4 Which layers are coherent

| layer | demand | capacity | coherent |
|---|---|---|---|
| readability | reading seconds | reading-rate ratio (new bridge) | yes |
| motor | pointing seconds | throughput ratio (new bridge) | yes |
| decision | choosing seconds x shares | five dispositions (authored 0-1) | demand side only |
| motorProcedure | KLM seconds | proceduralFluency (authored, "step-order errors") | demand side only |
| readingAttention | reading seconds x hypotheses | attentionSpan (CPT score) | demand side only |

Full coherence for the last three needs those traits re-authored as rates or tolerated
times. The persona registry already names measures that would do it, for example
satisficing as "options inspected before choosing". That is persona work, not Stage B.

The chain itself does not change: gap, asymmetry, content gate, depletion and
interactions stay as they are. motorCapacity and readingCapacity are already
surplus-free, which is right on this scale: being faster than the page needs costs
nothing.

**Bridging must change** for the two coherent layers (2.4, 5.4). Both functions are in
`src/visual/cognitive-models.ts`, which is not in my file list. `sustainedAttentionOf`
does not change.

---

## 7. API

**New derived fields**, computed by deriveMetrics from the raw record (no change to
measurePageRaw), returned on ExtractedPageMetrics and optional on PageMetrics, all in
seconds for the reference user:

- `pointingSeconds`
- `choosingSeconds` (novice search; the expert value as `choosingSecondsExpert`, a
  diagnostic)
- `readingSeconds`
- `procedureSeconds`

Diagnostics on ExtractedPageMetrics only: `meanFittsID`, `entrySteps`,
`choiceGroupsCounted`.

The constants are `pageMetrics.*` entries applied in deriveMetrics, so a stored raw
record re-derives under any change to them, which is the point of format 1. tau is a
`chain.*` entry applied in computeDemandDistribution: the seconds are page
properties, the budget is a model constant.

**No silent fallback.** computeDemandDistribution throws when any of the four is
missing or not a finite number >= 0, naming the field and saying how to get it. The
old curves are deleted, not kept as a fallback.

Every product caller already goes through extractPageMetrics, so it gets the fields:
`persona-comparison-tools.ts:1083`, `audit-tools.ts:617, 992`, and the per-screen
path via extractPerScreenMetrics.

The per-screen path needs one change (outside my files): it overrides
interactiveElementCount and choiceCount with newly seen elements only, so it must
scale `pointingSeconds` by `new / interactiveElements` and `choosingSeconds` by
`new choices / choiceCountRaw`. Otherwise a sticky nav is charged on every screen,
the exact thing its comment forbids. The scaling is a definition; exact per-element
times for new elements would need box ids.

**`interactiveElementCount` and `choiceCount` stop driving any demand.** They stay on
PageMetrics as reported counts.

**`computeDemandFromRawMetrics`** (tests only; not exported from `src/index.ts`) swaps
its two count arguments for the four seconds:

`(informationDensity, visualComplexity, textDensity, animationLevel, navigationDepth, pointingSeconds, choosingSeconds, readingSeconds, procedureSeconds)`

It is a breaking change to a test helper. Callers are the golden matrix, the DRO
adversary and about 15 tests.

**Synthetic inputs:**

- Golden RAW_DEMANDS: each of the 12 vectors gets seconds chosen to span the sample
  range, from empty at 0 up to "max" above the sample maximum (pointing 1500,
  choosing 130, reading 1800, procedure 15).
- PAGE_DEMANDS: likewise.
- DRO generator: INPUT_MAX gains the four maxima.

---

## 8. Consequences

### 8.1 Registry

**Retired** (chain.ts, 7):

- `demand.interactive.halfSaturation`
- `demand.interactive.satisficing`
- `demand.interactive.proceduralFluency`
- `demand.interactive.motorCapacity`
- `demand.interactive.riskTolerance` (moved, below)
- `demand.choice.halfSaturation`
- `demand.text.readingCapacity`

**Kept and re-pointed** (hypothesis): `demand.choice.anchoringBias`,
`demand.choice.fearOfMissingOut`, `demand.choice.socialProofSensitivity` now read
the decision demand; `demand.sustained.base` and `demand.sustained.distractorGain`
now read the reading demand.

**Added:**

| id | value | status |
|---|---|---|
| `chain.demand.timeBudget` | 12.4 s | hypothesis |
| `chain.demand.decision.riskTolerance` | 0.75 | hypothesis (moved) |
| `pageMetrics.fitts.intercept` | 0.230 s | published, MacKenzie & Buxton 1992 |
| `pageMetrics.fitts.slope` | 0.166 s/bit | published, MacKenzie & Buxton 1992 |
| `pageMetrics.fitts.minWidth` | 1 px | definition |
| `pageMetrics.choice.searchIntercept` | 0.30 s | published, Cockburn et al. 2007 |
| `pageMetrics.choice.searchSlope` | 0.08 s/item | published, Cockburn et al. 2007 |
| `pageMetrics.choice.hickIntercept` | 0.24 s | published, Cockburn et al. 2007 (diagnostic) |
| `pageMetrics.choice.hickSlope` | 0.08 s/bit | published, Cockburn et al. 2007 (diagnostic) |
| `pageMetrics.reading.wpm` | 238 | published, Brysbaert 2019 |
| `pageMetrics.reading.lettersPerWord` | 4.6 | published, Brysbaert 2019 |
| `pageMetrics.reading.abjadWpm` | 181 | published, Brysbaert 2019 Table 5 |
| `pageMetrics.reading.cjkWpm` | 260 | published, Brysbaert 2019 Table 5 |
| `pageMetrics.reading.cjkCharsPerWord` | 1.5 | published, Brysbaert 2019 |
| `pageMetrics.klm.mentalPreparation` | 1.35 s | published, Card, Moran & Newell 1980 |

These are the first `published` entries the chain path reads, so the tests that
assert none are published must change to name them:

- `ctc-provenance` "nothing in the chain claims to be ... published" holds for
  `chain.*`, but the run-level count does not;
- `ctc-tool-provenance` expects `counts.published` to be 0;
- `page-metrics-no-literals` pins the non-hypothesis ids.

That is the claim becoming true, and the provenance summary's scope text ("the page
metrics themselves are measured from the page, not set") needs a sentence about the
law constants.

The persona side, if you approve the bridges: TP_ref and the per-word ms terms get
registered where they live. They are not registered today.

### 8.2 Score movement (preview on the sample; full deltas are Phase 2)

`stage-b-preview.ts` puts the law demands into today's chain, with today's and the
rate-based capacities. Layer costs and rawCTC only: totalCTC is a percentile against
a reference built under today's demands.

Viewport, mean over 23 pages, old -> new (new demand with old capacities in
brackets):

| persona | decision | motor | motorProcedure | readability | readingAttention | rawCTC |
|---|---|---|---|---|---|---|
| power-user | 0.534 -> 0.096 | 0.008 -> 0.125 [0.023] | 0 -> 0 | 0.001 -> 0.110 [0.008] | 0 -> 0 | 0.792 -> 0.570 |
| first-timer | 0.163 -> 0.096 | 0.023 -> 0.167 [0.060] | 0.213 -> 0.014 | 0.024 -> 0.151 [0.104] | 0.051 -> 0.104 | 1.068 -> 1.133 |
| motor-impairment-tremor | 0.225 -> 0.062 | 0.066 -> 0.234 [0.130] | 0.021 -> 0 | 0.004 -> 0.124 [0.028] | 0.004 -> 0.007 | 0.549 -> 0.656 |
| cognitive-adhd | 0.083 -> 0.114 | 0.002 -> 0.119 [0.017] | 0.081 -> 0.001 | 0.002 -> 0.122 [0.017] | 0.036 -> 0.076 | 0.600 -> 0.837 |
| dyslexic-user | 0.134 -> 0.069 | 0.011 -> 0.142 [0.037] | 0.083 -> 0.001 | 0.052 -> 0.163 [0.185] | 0.012 -> 0.024 | 0.653 -> 0.763 |
| intellectual-disability | 0.270 -> 0.118 | 0.036 -> 0.189 [0.082] | 0.220 -> 0.015 | 0.037 -> 0.165 [0.135] | 0.029 -> 0.058 | 1.593 -> 1.545 |

Orderings:

- **Motor**: the top five are unchanged (tremor, intellectual-disability, elderly,
  elderly-low-vision, first-timer).
- **Readability**: with new demand and old capacities, dyslexic-user stays costliest
  (0.185). With the rate-based capacities, elderly-low-vision (1.45x slower in the
  fixation model) goes first and dyslexic-user (1.39x) third. That ordering is the
  fixation model's, and it is right only if its constants are.
- Every persona now pays a little motor and readability cost on a typical page,
  because the reference user (c = 0.5) is over budget when the page asks more than
  12.4 s of pointing or reading.

### 8.3 What must be re-pinned or rewritten

- **ctc golden** (`ctc-golden-21.0.0.json`): every run moves. Regenerate after the
  fixture gains seconds.
- **page-metrics golden**: the old fields must stay byte-identical (proved by the
  existing test); the four new fields are added to the JSON.
- **`raw-page-measurements.ts`**: needs an entry-kind box, a checkbox group and enough
  prose per script for each new constant to move an output
  (`page-metrics-derive.test.ts`).
- **DRO**: the derivation's preconditions still hold, since demands stay finite in
  [0, 1]. The adversary's pages change: INTERACTION_PAGES were found by a scan over
  the 7-input generator, and two of their inputs (choices, controls) no longer drive
  demand. The scan must be re-run on the new generator and the must-kill table
  re-verified; the mutants themselves are on the bound, which does not change.
- **Tests that read the old mechanism and must be rewritten, not just re-pinned:**
  `motor-layer-vs-audit` ("the layer reads a COUNT, not elements" is now false by
  design), `motor-split`, `surplus-billing`, `ctc-model-21`, `site-familiarity-gate`,
  `capacity-depletion`, `abandonment-and-floor`, `sequential-scroll`,
  `transport-dimension-alignment`, `ctc-values-one-path`, `ctc-reference`. 17 test
  files build PageMetrics or call computeDemandFromRawMetrics.
- **The reference curve** moves with every demand. ref-v2's referencePages derive
  from raw records through deriveMetrics, so the new fields arrive with no extra
  work, provided that derivation lands before or with this.
- **Outside my files, needing your go**: `cognitive-models.ts` (two bridges),
  `extractPerScreenMetrics` (fresh-share scaling).

---

## 9. Measurements behind this note

**Sample.** `research/stage-b-sample.ts` measured 24 pages at 1920x1080, viewport and
full_page, with the reference crawl's calls (measurePageGeometry, then measurePageRaw
per scope): landing, article, form, list, CJK and abjad pages. Raw records are in
`research/stage-b-sample/raw.jsonl`. github.com/signup measured empty and is
excluded, leaving 23 pages per scope.

**Scripts:**

- `stage-b-explore.ts`: law times and demands per page;
- `stage-b-transforms.ts`: transforms compared;
- `stage-b-capacity.ts`: capacities;
- `stage-b-preview.ts`: chain preview;
- `stage-b-nesting.ts`: prose double counting.

This is 23 pages, not the reference set. The ~500-page crawl (ref-v2) will replace
every quantile here, and Phase 2's deltas use it.

### 9.1 Law times, median [p10, p90], seconds

| | viewport | full_page |
|---|---|---|
| pointing (sum) | 37.6 [13.5, 187] | 172 [44.3, 538] |
| per-target MT | 0.92 [0.79, 1.01] | 0.91 [0.82, 1.01] |
| mean ID, bits | 4.15 [3.35, 4.70] | 4.10 [3.58, 4.71] |
| choosing, novice search | 6.1 [1.4, 17.5] | 14.8 [5.5, 47.5] |
| choosing, Hick-Hyman | 1.5 [0.7, 5.4] | 2.6 [1.0, 6.5] |
| reading | 49.4 [15.0, 133] | 286 [142, 712] |
| procedure | 1.4 [0, 9.5] | 1.4 [0, 10.6] |

Box cap binding: 0 of 23 pages at viewport, 8 of 23 at full_page.

### 9.2 Demand, hyperbolic tau 12.4 (new) against today's, median [p10, p90]

| | viewport new | viewport today | full_page new | full_page today |
|---|---|---|---|---|
| motorCapacity | 0.75 [0.52, 0.94] | 0.64 [0.39, 0.81] | 0.93 [0.78, 0.98] | 0.81 [0.67, 0.87] |
| satisficing (search) | 0.33 [0.10, 0.58] | 0.81 [0.45, 0.91] | 0.54 [0.31, 0.79] | 0.91 [0.84, 0.91] |
| readingCapacity | 0.80 [0.53, 0.91] | 0.49 [0.23, 0.70] | 0.96 [0.92, 0.98] | 0.62 [0.50, 0.82] |
| proceduralFluency | 0.10 [0, 0.43] | 0.64 [0.39, 0.81] | 0.10 [0, 0.46] | 0.81 [0.67, 0.87] |

With constant per-target time, pointing demand is about `n / (n + 13.5)` for n
targets, against today's hand-set `0.9 n / (n + 20)`. The law mostly confirms the
shape that was set by hand, now in seconds and with per-target difficulty.

### 9.3 Capacities, today against rate-based

| persona | TP bits/s | motor today | motor new | ms/word | reading today | reading new |
|---|---|---|---|---|---|---|
| power-user | 3.95 | 0.702 | 0.446 | 275 | 0.787 | 0.496 |
| first-timer | 3.22 | 0.597 | 0.397 | 334 | 0.520 | 0.447 |
| elderly-user | 3.20 | 0.605 | 0.395 | 317 | 0.673 | 0.460 |
| motor-impairment-tremor | 2.10 | 0.438 | 0.300 | 297 | 0.689 | 0.476 |
| cognitive-adhd | 4.20 | 0.741 | 0.462 | 288 | 0.746 | 0.484 |
| dyslexic-user | 3.61 | 0.653 | 0.424 | 375 | 0.387 | 0.419 |
| low-vision-magnified | 3.89 | 0.693 | 0.443 | 382 | 0.536 | 0.414 |
| elderly-low-vision | 3.20 | 0.605 | 0.395 | 392 | 0.526 | 0.408 |
| intellectual-disability | 3.00 | 0.566 | 0.379 | 338 | 0.485 | 0.444 |

Roster range: motor 0.438-0.774 today and 0.300-0.476 new; reading 0.387-0.787 today
and 0.408-0.496 new.

---

## 10. Phase 2 plan, once you say go

1. **Red tests first:**
   - tiny, distant targets ask more pointing time than large, near ones (Fitts
     direction);
   - more letters, longer words at the same word count, more groups, larger groups
     and more entry steps each ask more;
   - a checkbox group of n asks more than a radio group of n;
   - property tests of monotonicity in each input;
   - computeDemandDistribution throws without the four fields;
   - the reference user sits at c = 0.5 on both rate channels;
   - `d > c` exactly when `k T > tau` (property test).
2. deriveMetrics fields and pageMetrics entries; chain demand section and tau; retire
   the seven entries.
3. Golden, page-metrics golden, raw fixtures. DRO generator inputs, the
   interaction-page re-scan, and every must-kill mutant re-verified.
4. `research/stage-b-deltas.md` on the golden matrix and on the reference set (or
   this sample, if the crawl has not landed).
5. tsc; full suite in two passes, with real counts.
