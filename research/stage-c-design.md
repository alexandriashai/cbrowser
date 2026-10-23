# Stage C: the cognitiveLoad layer

Design note. Nothing under `src/` has changed. Worktree
`cbrowser-public-wt-stage-c`, branch `feat/stage-c`, from `feat/cot-integration`
at `8707e49` (Stage B merged).

Every number below was read from a source retrieved in this session (section 1)
or measured on the 513 reference pages of raw format 2 with the scripts in
section 9. Where a number is neither, it is labelled. Nothing in the chain was
edited to produce the predictions: the scripts patch the exported layer tables
at run time and override demands after `computeDemandDistribution`.

---

## 0. The answer, then the decisions you need to make

**What the layer prices today, measured.** cognitiveLoad's five traits are
dispositions and abilities about UI conventions, memory, foraging, site
knowledge and transfer. Its demand is read almost entirely from text features
and from navigation depth:

- `comprehension` is defined as "grasp of UI conventions ... NOT reading
  comprehension" (`trait-reference.ts`), yet every one of its seven demand terms
  reads text. On 288 of 513 viewport pages the term that wins its `max()` is
  `lexicalDiversity`, which is `unique words / min(words, 100)` capped at 1: it is
  exactly 1 on 158 viewport pages and 396 full_page pages, so it says "this page
  has 100 distinct words", not how diverse they are.
- `transferLearning` is set by the same `lexicalDiversity` on 486 of 513 pages.
- `siteFamiliarity` demand is `navigationDepth / (navigationDepth + 3) x 0.85`,
  and `navigationDepth = max(1, breadcrumbLinks)` is 1 on 473 of 513 pages. So it
  is the constant 0.2125, and with siteFamiliarity 0 in the tool path every
  persona pays the same 0.056 on almost every page for it.
- The text amount it reads (`informationDensity`) comes from `textChars`, which
  sums every text element with nesting, times a hand-set 0.4. On the median
  viewport page `textChars` is 26 times the outermost prose (p10 7, p90 118).
- Text amount and word length are already in Stage B's reading time. Brysbaert's
  rate is a rate of reading for comprehension (his inclusion criterion), and his
  letter equation carries the word-level difficulty effect. `avgWordLength` is a
  linear rescaling of mean letters per word (rank correlation 1.000 on the 494
  alphabetic pages), `longWordRatio` and `technicalDensity` correlate 0.91 and
  0.78 with it.

first-timer's 0.436 at the viewport is comprehension 0.172 + transferLearning
0.132 + workingMemory 0.058 + siteFamiliarity 0.056 + informationForaging 0.019.
That is a persona with low convention knowledge (0.3, 0.2) charged against
text.

**What has a law, and what does not.**

| candidate | published law or measurement | can it price a single page from raw format 2? |
|---|---|---|
| working-memory load | Cowan: a central store of 3 to 5 chunks | No. Cowan says the limit is seen only when rehearsal and chunking are blocked, and no source maps page features to items held. Raw format 2 has no measure of simultaneous load. |
| comprehension time beyond decoding | Brysbaert: 238 wpm is reading for comprehension; letters per minute removes most of the text-difficulty effect (Miller & Coleman) | Already priced. The residual on his worked example is 182 against 203 wpm predicted (difficult text). No raw field measures difficulty beyond word length. |
| wayfinding from depth and breadth | Larson & Czerwinski 1998: 3 levels 58 s, 2 levels 36 and 46 s per search | Not per page. Depth is a property of the path through several pages, which the journey tools score page by page. Breadth on the page is the choosing law. |
| site familiarity | Cockburn, Gutwin & Greenberg 2007, Eq. 4: `T = (1 - e) T_novice + e T_expert`, Eq. 5: `e = L (1 - 1/t)` | Yes. Both times are already computed (`choosingSeconds`, `lawDiagnostics.choosingSecondsExpert`). |
| web experience, WM and navigation | Laberge & Scialfa 2005: WM, domain knowledge and speed predicted pages and revisits; WWW experience and knowledge removed the age effect on time | Direction only. No per-page coefficient was retrieved. |

**Recommendation (design C):**

1. **Retire 15 demand terms.** The 11 text terms of comprehension,
   workingMemory, informationForaging and transferLearning double-count the
   reading law or are artefacts. The 4 navigation terms are a constant on 92%
   of pages, and depth belongs to the path. The chain registry goes from 63 to
   48 entries, all 15 of them hypotheses.
2. **siteFamiliarity becomes Cockburn's expertise e on the choosing time.** It
   is a per-run visit state, the same for every persona in a run, so it may sit
   on the demand side without making demand persona-dependent. At e = 0 (every
   reference page, every default call) choosing is unchanged, byte for byte. It
   leaves the trait vector and the layer.
3. **The four remaining traits stay in cognitiveLoad, demanded the choosing
   time, and labelled hypothesis.** `comprehension`, `transferLearning`,
   `informationForaging` and `workingMemory` each take the decision demand
   `d = T_choose / (T_choose + 12.4 s)`, as satisficing does: no new constant.
   Their values then have a unit. A capacity c is a tolerated reference time
   `tau c / (1 - c)`, or a slowdown `k = (1 - c) / c` against the reference
   searcher. first-timer's comprehension 0.3 says "searches 2.33 times slower
   than Cockburn's novice", and Cockburn's expert limit bounds what a value
   above 0.5 can claim (section 5).

**What it does** (513 pages, viewport, mean totalCTC on the variant's own
rebuilt percentile curve; section 6):

- first-timer 0.726 -> 0.564, against ADHD 0.627, dyslexic 0.477, low vision
  0.534, tremor 0.572, elderly 0.640, elderly-low-vision 0.716, typical user 0.344;
- ADHD is now costlier than first-timer on 73% of pages (6% today), tremor on
  50% (4%), low vision on 41% (1%), dyslexic on 6% (0%);
- every impaired persona stays above the typical user, as today;
- aphasia-receptive falls 0.651 -> 0.418 and intellectual-disability 0.856 ->
  0.649, because the text-to-"comprehension" terms were carrying their
  language-comprehension deficit through a trait defined as UI conventions.

**No grounded design of this layer reverses the dyslexic inversion.** With the
layer removed entirely, first-timer is still costlier than dyslexic-user on 91%
of viewport pages. What remains sits in other layers: decision (first-timer
0.113, dyslexic 0.086: authored anchoring, social proof and risk dispositions)
and readingAttention (0.054 against 0.012: first-timer's sustainedAttention is
the interruptRecovery fallback 0.4, and its readingTendency 0.6 raises the
engagement multiplier). first-timer is authored as a web beginner
(`tech_level: beginner`, "doesn't know conventions"), so being costlier than an
experienced dyslexic reader is a claim the model makes, not an error it can be
shown to make. The paper's baseline is now the typical user, and against it the
order holds in every variant.

**Decisions for you** (recommendation first):

1. **Retire the 15 text and navigation demand terms.** Alternative: keep them as
   hypotheses. I recommend against it: they are not ungroundable constants with
   a mechanism, they double-count a law the chain now has, and one of them reads
   a constant.
2. **siteFamiliarity as Cockburn's e on choosing, taken as e directly
   (definition).** Alternative: take a visit count t and compute `e = 1 - 1/t`
   (Eq. 5), which needs L, the layout's learnability, as a hypothesis (L = 1:
   nothing moves between visits).
3. **Keep the four traits as tolerated choosing time (design C).** Alternatives,
   measured in section 6: retire the layer (V1: no new hypothesis, 3 more
   interaction weights retired, but the norm-anchored workingMemory values lose
   their only CTC consumer and the model stops saying novices pay anything for
   unfamiliar conventions), or put workingMemory on the reading time instead
   (V3: Cowan's re-reading argument; it charges every persona below 0.68 on a
   median page and dominates at full_page).
4. **Aphasia and intellectual disability need measured reading-for-comprehension
   rates.** Today they keep the reading shares registered as hypotheses
   (c 0.446 and 0.444, about 190 wpm). Under any design here those shares are
   the only place their language deficit is priced. This is persona-rate work,
   not this layer, and I did not find a rate this session.
5. **The frustration layer's two text terms** (`chain.demand.text.patience`,
   `chain.demand.sentenceLength.patience`) are the same class and outside this
   layer. I recommend the same treatment in 21.0, designed separately.

---

## 1. Sources read in this session

Only these supply a number or a quoted claim. "Not retrieved" means I cite the
work for context and took nothing from it.

| source | what I read | what is taken |
|---|---|---|
| Cockburn, A., Gutwin, C. & Greenberg, S. (2007). A predictive model of menu performance. CHI '07, 627-636, doi:10.1145/1240624.1240723 (PDF) | model section (Eq. 1-7), calibration method and results, discussion | Eq. 4: "Tdsi = (1 - ei)Tvsi + ei Thhi ... where ei is the user's expertise with that item, from 0 (complete novice) to 1 (complete expert)". Eq. 5: "ei = L x (1 - 1/ti)", ti "the number of previous trials (selections) of the item", L "the 'learnability' of the interface ... 1 representing an entirely learnable menu representation - that is, the items do not change locations". Novice "Tdsi=Tvsi=0.08n+0.3, R2=0.99"; expert "Tdsi=Thhi=0.08log2(n)+0.24, R2=0.98". Block 1 was removed from the search fit: "presumably because there is an additional cost in reading the menu labels for the first time. To avoid incorporating this one-off cost in the calibration of visual search we removed block 1 ... Our model is therefore based on visual search for items that have been previously read". Participants: "Eight participants ... right-handed graduate computer science students and thus competent users of mice, screens and computers". Their stated limit: Eq. 5 "makes no allowance for the number of items in the menu" |
| Brysbaert, M. (2019). How many words do we read per minute? JML 109, 104047, doi:10.1016/j.jml.2019.104047 (PDF) | inclusion criteria, "Reading rate and text difficulty", Carver's gears, "Reading rate for text recall" | Inclusion: "The task was reading for comprehension or fun ... It also excluded studies that tested studying for fact retrieval". Difficulty: "Easiness depends on the demands to understand the text relative to the knowledge and skills of the reader. The demands can be at the word level, the sentence level, or the text level"; "Miller and Coleman (1971) noticed that text difficulty correlates very well with word length. If instead of words per minute, they used letters per second as dependent variable, the effect of text difficulty on silent reading rate disappeared". Worked example (Britton et al. 1978): observed 262 wpm easy, 182 wpm difficult; his equation predicts "238 * 4.6/4.2 = 261 wpm for the easy texts (262 wpm obtained) and 238 * 4.6/5.4 = 203 wpm for the difficult texts (182 wpm obstained)". Carver's gears as he reports them: memorizing 138 wpm, learning 200, rauding 300, skimming 450, scanning 650. Recall: Kemper & Sumner "observed reading rates of 93 wpm" when questions were answered without the text |
| Cowan, N. (2001). The magical number 4 in short-term memory. Behav Brain Sci 24(1), 87-114, doi:10.1017/s0140525x01003922 (PubMed abstract) | abstract | "only three to five chunks"; "A single, central capacity limit averaging about four chunks"; observed only under conditions in which "rehearsal and long-term memory cannot be used to combine stimulus items into chunks of an unknown size" |
| Cowan, N. (2010). The magical mystery four. Curr Dir Psychol Sci 19(1), 51-57, doi:10.1177/0963721409359277, PMC2864034 (full text) | whole article | "a central memory store limited to 3 to 5 meaningful items in young adults"; "Though we cannot yet make precise predictions about how well working memory will operate in every possible task, we can measure storage-specific capacity by preventing or controlling processing strategies"; the essay example: holding premise, previous point, fact and opinion, "Forgetting one of these ideas may lead to a more shallow understanding of the text, or to the need to go back and re-read" |
| Larson, K. & Czerwinski, M. (1998). Web page design: implications of memory, structure and scent for information retrieval. CHI '98, 25-32 (Microsoft Research PDF) | method, results, discussion | 512 bottom-level nodes in 8x8x8, 16x32 and 32x16 structures; "16x32 hierarchy (Avg. RT=36 seconds, SD=16), second fastest in the 32x16 hierarchy (Avg. RT = 46 seconds, SD = 26), and slowest in the 8x8x8 hierarchy (Avg. RT = 58 seconds, SD = 23)"; "Although the relationships were non-significant the memory span scores were slightly more correlated with subjects' reaction time overall, r = -0.27"; per structure, "None of these correlations were statistically reliable"; "19 subjects ... all experienced computer and web users"; quoting Zaphiris & Mtei, "access time is proportional to depth in menu selection" (Kiger) |
| Laberge, J. C. & Scialfa, C. T. (2005). Predictors of web navigation performance in a life span sample of adults. Hum Factors 47(2), 289-302, doi:10.1518/0018720054679470 (PubMed abstract) | abstract | 41 participants aged 19 to 83, 12 questions on a tourism site; "Age did not influence the number of total pages or repeat pages visited, which were predicted by domain knowledge, working memory, and processing speed"; age slowed time per trial "after controlling for working memory, processing speed, and spatial abilities. Only with the addition of subject matter knowledge and World Wide Web experience was the age effect eliminated" |
| Sharit, J., Hernandez, M. A., Czaja, S. J. & Pirolli, P. (2008). Investigating the roles of knowledge and cognitive abilities in older adult information seeking on the Web. ACM TOCHI 15(1), 3, doi:10.1145/1352782.1352785 (PubMed abstract; the PMC record returned no body) | abstract | "Internet-related knowledge was not sufficient in explaining information-seeking performance ... a combination of both knowledge and key cognitive abilities is important"; differences between age groups "on complex, but not on simple problems" |

From Stage B's registry, not re-read in this session: `law.timeBudget` 12.4 s
(Weinreich et al. 2008, the registry entry carries the builder's quote), and the
choosing constants above, which I re-read in Cockburn et al.

**Not retrieved** (cited for context, no number taken): Hoelscher & Strube (2000)
on Web experts and newbies (no open copy); Wiedenbeck (1999) on icons and labels;
Miller (1981) and Kiger (1984) on menu depth; Carver (1992), whose gear rates
above are as Brysbaert reports them; Pirolli & Card (1999); Smith (1996) on
lostness; any silent reading rate for receptive aphasia or intellectual
disability (two PubMed searches returned nothing).

---

## 2. What the layer does today (measured)

Scripts: `stage-c-explore.ts`, `stage-c-spread.ts`, `stage-c-overlap.ts`.

### 2.1 Demands on the 513 reference pages

| demand | viewport median [p10, p90] | full_page median [p10, p90] | what wins its max() at viewport |
|---|---|---|---|
| comprehension | 0.720 [0.563, 0.824] | 0.750 [0.641, 0.905] | lexicalDiversity 288, informationDensity 158, avgSentenceLength 64, longWordRatio 2, avgWordLength 1 |
| workingMemory | 0.569 [0.273, 0.842] | 0.681 [0.363, 0.850] | informationDensity 289, avgSentenceLength 180, navigationDepth 44 |
| informationForaging | 0.429 [0.159, 0.656] | 0.556 [0.260, 0.724] | informationDensity (only term) |
| siteFamiliarity | 0.212 [0.212, 0.212] | 0.212 [0.212, 0.212] | navigationDepth (only term) |
| transferLearning | 0.566 [0.412, 0.650] | 0.650 [0.467, 0.650] | lexicalDiversity 486, navigationDepth 27 |

The inputs, viewport median [p10, p90]: informationDensity 0.536 [0.198, 0.821],
textDensity 0.481 [0.166, 0.786], avgWordLength 0.297 [0.169, 0.437],
avgSentenceLength 0.430 [0.226, 0.900], lexicalDiversity 0.870 [0.634, 1.000],
longWordRatio 0.324 [0.154, 0.481], technicalDensity 0.082 [0.000, 0.158].

### 2.2 What it charges, per trait (viewport, mean over pages)

Per-trait deficit cost, gap squared times the layer's content gate, with
capacity as visualComplexity left it:

| persona | layer | comprehension | workingMemory | informationForaging | siteFamiliarity | transferLearning |
|---|---|---|---|---|---|---|
| first-timer | 0.436 | 0.172 | 0.058 | 0.019 | 0.056 | 0.132 |
| elderly-user | 0.566 | 0.261 | 0.058 | 0.059 | 0.056 | 0.132 |
| intellectual-disability | 0.755 | 0.261 | 0.164 | 0.105 | 0.056 | 0.168 |
| aphasia-receptive | 0.423 | 0.214 | 0.041 | 0.080 | 0.056 | 0.032 |
| cognitive-adhd | 0.174 | 0.021 | 0.069 | 0.019 | 0.056 | 0.009 |
| dyslexic-user | 0.212 | 0.052 | 0.102 | 0.000 | 0.056 | 0.001 |
| low-vision-magnified | 0.093 | 0.006 | 0.012 | 0.019 | 0.056 | 0.001 |
| power-user | 0.056 | 0.000 | 0.000 | 0.000 | 0.056 | 0.000 |

Every persona pays the same 0.056 for siteFamiliarity. The layer does vary by
page (first-timer median 0.422, p10 0.191, p90 0.701), through
informationDensity and sentence length, but what separates personas is their
comprehension and transferLearning values against a demand near 0.7 and 0.57.

### 2.3 The five findings that decide the design

1. **A trait defined as UI conventions is charged against text.** The chain
   moved `comprehension` out of readability on 2026-08-02 because it is "grasp
   of UI conventions, not decoding" (the layer comment); its demand terms
   stayed on text.
2. **Text amount and word length are Stage B's reading time.** Brysbaert's 238
   wpm is reading for comprehension, and letters per minute absorbs the
   word-level difficulty effect. On the alphabetic pages, avgWordLength has rank
   correlation 1.000 with mean letters per word (it is a linear rescaling of
   it), longWordRatio 0.911, technicalDensity 0.780.
3. **The text amount it reads is a different, older count.** informationDensity
   is `0.4 textChars / (0.4 textChars + 5000)`; `textChars` counts nested text
   again, and is 26.2 times the outermost prose on the median viewport page
   (12.3 at full_page). Its rank correlation with readingSeconds is 0.42 at the
   viewport and 0.71 at full_page. Format 2's outermost prose was built to
   replace exactly this count for reading.
4. **lexicalDiversity is saturated by construction.** `unique / min(words, 100)`
   reaches 1 on any page with 100 distinct words: 158 of 513 viewport pages, 396
   of 513 full_page pages.
5. **navigationDepth is a constant.** `max(1, breadcrumbLinks)` is 1 on 473
   (viewport) and 472 (full_page) of 513 pages, so the three demands it drives
   read 0.2375 (workingMemory), 0.1625 (transferLearning) and 0.2125
   (siteFamiliarity) almost everywhere.

---

## 3. Candidates for what the layer should price

The Stage B scale: demand `d = T / (T + tau)`, tau 12.4 s; capacity
`c = r_p / (r_p + r_ref)`, so `d > c` exactly when the persona's own time on the
channel exceeds tau.

### 3.1 Working-memory load (Cowan)

**The law.** A central store of 3 to 5 chunks, about 4 (Cowan 2001, 2010).

**Why it does not price a page.** Cowan is explicit that the limit is observed
when rehearsal and chunking are prevented, and that "we cannot yet make precise
predictions about how well working memory will operate in every possible task".
A web page is the opposite condition: its content stays on screen, so a visitor
can look again instead of holding it. Turning a page into "items held" needs a
mapping from page features to chunks, which no source I read gives, and raw
format 2 has no measure of what must be held at once (a comparison table's
cells, a form's cross-field dependencies). Sentence length is not that measure:
Cowan's limit is about simultaneous items, and a page sum is not a simultaneity.

**What the evidence does say.** WM shows up in re-reading (Cowan's essay
example), in reading for later recall (Carver's memorizing gear at 138 wpm and
Kemper & Sumner's 93 wpm, as Brysbaert reports them), and in multi-page
navigation (Laberge & Scialfa: pages visited and revisits; Larson &
Czerwinski's memory-span correlation was r = -0.27 and not reliable). None of
these gives a per-page coefficient, and whether a visitor reads for recall
depends on a task the page does not state.

**Verdict.** No grounded demand. The capacity side has a good instrument
(Wechsler WMI) and two norm-anchored persona values (section 5). Kept only as a
hypothesis on an existing time (design C), or retired (V1).

### 3.2 Comprehension time beyond decoding

**The law.** Brysbaert's rate is a reading-for-comprehension rate. His letter
equation removes the text-difficulty effect that word length carries.

**What is left over.** On his worked example the difficult text was read at
182 wpm against 203 predicted, about 10% slower than word length alone
predicts. That is the size of the effect a separate comprehension term could
add on difficult text, and it needs a difficulty measure beyond word length
(sentence or text level, his words). Raw format 2 has sentence fragment lengths
but no measure that a source ties to reading time, and no published equation
I read adds sentence length to his.

**Verdict.** Already priced by Stage B's reading time. Any text term here
double-counts it. A comprehension-difficulty term would need its own published
equation (none retrieved) and would belong in the reading law, not in a layer
whose trait is UI conventions.

### 3.3 Wayfinding from navigation depth and breadth

**The law.** Depth costs search time across pages (Larson & Czerwinski 1998:
58 s at three levels against 36 and 46 s at two; Kiger via Zaphiris & Mtei,
"access time is proportional to depth"). Breadth within a page is the choosing
law (Cockburn et al.).

**Why it does not price a page.** Those times are for a whole search through a
hierarchy. A page's breadcrumb depth says how far it sits from the root, which
the visitor has either already traversed or skipped (a search landing). The
journey tools already score each page of a path, so depth is priced there, one
choosing cost per level, without a depth constant. And the measure is a
constant on 92% of pages.

**Verdict.** Retire the four nav terms. Keep navigationDepth as a reported
metric.

### 3.4 Site familiarity (Cockburn et al., Eq. 4 and 5)

**The law.** `T_choose(e) = (1 - e) T_novice + e T_expert` per group, with both
limits measured on the same users and menus. `T_novice` is the choosing law
Stage B already uses; `T_expert` is the Hick-Hyman fit it reports as a
diagnostic.

**What it gives on the reference pages** (`stage-c-familiarity.ts`):

| scope | e | choosing s, median [p10, p90] | d, median [p10, p90] |
|---|---|---|---|
| viewport | 0 | 2.44 [0.94, 8.59] | 0.16 [0.07, 0.41] |
| viewport | 0.5 | 1.79 [0.78, 5.47] | 0.13 [0.06, 0.31] |
| viewport | 1 | 1.04 [0.52, 1.97] | 0.08 [0.04, 0.14] |
| full_page | 0 | 6.44 [2.09, 20.67] | 0.34 [0.14, 0.63] |
| full_page | 0.5 | 4.03 [1.47, 11.90] | 0.25 [0.11, 0.49] |
| full_page | 1 | 1.52 [0.69, 3.17] | 0.11 [0.05, 0.20] |

Eq. 5 at L = 1: one previous visit gives e = 0, two 0.5, five 0.8, ten 0.9.

**Where it belongs.** e is a property of the visit (this person, this site),
the same for every persona in a run, which is how the tools already treat it
(`siteFamiliarity` is per run, 0 by default). So it can enter the choosing
demand without making demand persona-dependent: the cross-persona contracts and
the DRO derivation hold demand fixed within a run, and e is fixed within a run,
like scope. It is not a capacity.

**Verdict.** Published form, no new constant if `siteFamiliarity` is defined as
e. Pointing does not change with e (Cockburn's Eq. 1 adds Fitts time
unchanged). Reading on a revisit is not modelled (no law retrieved).

**A side finding for Stage B's open nav-label question.** Cockburn et al.
removed block 1 from the search fit because of "an additional cost in reading
the menu labels for the first time", so their search constants exclude the
first reading of labels. Charging nav labels once to reading (Brysbaert) and
once to search (Cockburn) is then not two charges for the same seconds: it is
the decomposition the search law was calibrated under. The magnitude of the
first-read cost on a page need not equal Brysbaert's rate for single labels, so
this argues for keeping the labels in reading rather than proving it.

### 3.5 UI-convention knowledge and web experience

**The evidence.** Laberge & Scialfa: WWW experience and domain knowledge
explained the age effect on time per trial. Sharit et al.: Internet knowledge
is necessary but not sufficient. Cockburn's reference searchers were "competent
users of mice, screens and computers" on unfamiliar menus.

**What it supports.** The channel: convention knowledge and transfer act on
finding things (choosing), and a persona who knows fewer conventions than a
competent computer user plausibly searches more slowly than Cockburn's novice.
**What it does not give.** A rate. No novice-versus-experienced web search time
ratio was retrieved. A raw field that would let a page ask more of convention
knowledge (for example, interactive elements with no visible text label) does
not exist in format 2, and its cost would need a source such as Wiedenbeck
(1999), not retrieved.

**Verdict.** The channel is supported, the magnitude is a hypothesis. That is
design C's step 3.

---

## 4. Proposal (design C)

### 4.1 Retired demand terms (question 2)

All 15 are hypotheses in `provenance/chain.ts` today:

| id | why |
|---|---|
| `chain.demand.info.workingMemory`, `.info.informationForaging` (and the unweighted informationDensity -> comprehension term) | text amount: Stage B reading time, measured better (outermost prose against nested textChars x 0.4) |
| `chain.demand.text.comprehension` | text amount, as above |
| `chain.demand.wordLength.comprehension`, `.longWords.comprehension`, `.technical.comprehension`, `.technical.transferLearning` | word length: in Brysbaert's letter rate (rank correlations 1.000, 0.911, 0.780 with letters per word) |
| `chain.demand.sentenceLength.workingMemory`, `.sentenceLength.comprehension` | sentence-level difficulty: no published time equation retrieved; WM is not a page sum (3.1) |
| `chain.demand.lexicalDiversity.comprehension`, `.lexicalDiversity.transferLearning` | saturated by construction (1 on 158 / 396 pages); vocabulary breadth is a reading property if anything |
| `chain.demand.nav.halfSaturation`, `.nav.workingMemory`, `.nav.transferLearning`, `.nav.siteFamiliarity` | navigationDepth is 1 on 92% of pages; depth is a path cost (3.3) |

Chain registry: 63 entries (60 hypothesis, 3 definition) -> 48 (45, 3).

**Not retired, same class, outside this layer:** `chain.demand.text.patience`
and `chain.demand.sentenceLength.patience` (frustration). The
`cognitive_load_estimate` tool (`estimateCognitiveLoad`) also multiplies
informationDensity by comprehension; it is not the chain, and has the same
category error.

**Page metrics:** informationDensity, avgWordLength, avgSentenceLength,
lexicalDiversity, longWordRatio, technicalDensity and navigationDepth stay on
PageMetrics as reported metrics; CIF and `estimateCognitiveLoad` still read
informationDensity, so no pageMetrics constant goes dead.

### 4.2 siteFamiliarity -> Cockburn's e

- `computeDemandDistribution(pageMetrics, { siteFamiliarity })`, default 0.
  `T_choose = (1 - e) choosingSeconds + e choosingSecondsExpert`, then the decision
  demand as today. e = siteFamiliarity (definition); a value outside [0, 1]
  or not a finite number is refused, not clamped.
- PageMetrics gains `choosingSecondsExpert` (today only on
  `lawDiagnostics`), derived by deriveMetrics from the same groups. No raw
  field.
- `siteFamiliarity` leaves `DEMAND_DIMENSIONS` and `SURPLUS_FREE_DIMENSIONS`.
  The tools (`cognitive_effort`, `site_cognitive_assessment`) pass the run's
  value to the demand instead of writing it into each persona's traits; the
  `siteFamiliarityEffect` note reports the choosing time at e and at 0.
- The reference curve is built at e = 0, so a familiar run is ranked against
  first visits. That is what "costlier than N% of the pages we measured" means
  for it, and the verdict text should say "first visits".

### 4.3 The four traits on the choosing time

- cognitiveLoad's traits: `comprehension`, `workingMemory`,
  `informationForaging`, `transferLearning`.
- Each is demanded `d_choose = T_choose / (T_choose + tau)`, the decision
  demand, with no share constant (satisficing's convention). The claim is
  registered once, as a hypothesis: "these abilities are read as tolerated
  reference choosing time" (status hypothesis; the number it carries is the
  persona value, not a coefficient).
- The structure is unchanged: gap squared, surplus free on all four, content
  gate on the layer's mean demand, depletion, and the three interaction pairs
  that touch cognitiveLoad (still hypotheses).
- The same seconds now feed two layers, decision (dispositions) and
  cognitiveLoad (abilities). Stage B set the precedent with reading seconds
  feeding readability (decoding) and readingAttention (attention). That the
  costs add is the model's claim.
- Coherence: demand side yes (seconds). Capacity side no: the values are
  authored dispositions, not measured rates, so the layer is coherent on the
  demand side only, as decision, motorProcedure and readingAttention are after
  Stage B.

### 4.4 Alternatives measured

- **V1, retire the layer.** Seven layers; the three cognitiveLoad interaction
  weights retire too (chain registry 45). Numerically close to design C at the
  viewport (the choosing demand is small there), further apart at full_page.
- **V3, workingMemory on the reading time.** Cowan's re-reading argument, and
  the same "absolute in the amount of prose" assumption readingAttention makes.
  It charges every persona with WM below the reading demand (median 0.68 at the
  viewport, 0.89 at full_page).
- **V4, every trait on reading + choosing time.** Kept for completeness: it
  reproduces today's shape (first-timer 0.685, above ADHD on 87% of pages), with
  a demand whose meaning (all information-processing time) no source supports
  any better than the old one.

### 4.5 Frustration's two text-to-patience terms (designed before the build)

Decided 2026-10-23: fix them in 21.0 the way the cognitiveLoad terms are fixed,
with a law time on Stage B's scale or a labelled hypothesis with its reason.

**Today.** `patience = max(0.7 x textDensity, 0.7 x avgSentenceLength)`
(`chain.demand.text.patience`, `chain.demand.sentenceLength.patience`, both
hypotheses). textDensity is the nested `textChars x 0.4` per unit area
(section 2.3, finding 3); sentence length has no time law (3.2). Both are text,
and the time text takes is Stage B's reading time.

**Proposal: patience takes the reading demand, `d(readingSeconds)`, with no
share constant.** Both terms retire (chain registry 48 -> 46, both
hypotheses). The reasons, in order:

1. The trait is already a time. Its registered measure is "time to abandonment
   under injected load delays and repeated failures in a usability task"
   (`provenance/personas.ts`). On Stage B's scale a capacity c is a tolerated
   reference time `tau c / (1 - c)`, so patience 0.5 tolerates 12.4 s, which is
   the published statistic tau is: the median stay on a first-time page visit
   (Weinreich et al. 2008, via the `law.timeBudget` entry; not re-read by me).
   A persona with patience 0.2 tolerates 3.1 s of reference reading before it
   falls short; 0.8 tolerates 49.6 s.
2. The two terms priced text. The law time of text is reading seconds. Taking
   the whole demand (share 1, satisficing's and design C's convention) adds no
   number; keeping one of the 0.7s re-pointed would keep a hand-set share whose
   only justification was the curve it multiplied.
3. Not the whole page's time. Summing pointing, choosing, reading and
   procedure into one patience time would be a convention Stage B did not make
   (each channel is judged against tau on its own), and no source I read sets
   it.

**What stays hypothesis.** The persona patience values, now read as tolerated
reading time; that patience is demanded the reading time at all; tau as the
budget.

**Measured before building** (`stage-c-predict.ts`, V5 = design C plus this,
V6 = patience on the whole page's law time, V7 = patience on 0.7 x d_read; ref
ctc-reference-v2-2026-10-23, 513 pages, viewport, mean totalCTC on each
variant's own curve):

| persona | design C | C + patience on d_read (V5) | V6 | V7 |
|---|---|---|---|---|
| typical-user | 0.344 | 0.390 | 0.423 | 0.344 |
| first-timer | 0.564 | 0.533 | 0.489 | 0.569 |
| cognitive-adhd | 0.627 | 0.682 | 0.779 | 0.617 |
| dyslexic-user | 0.477 | 0.440 | 0.386 | 0.482 |
| low-vision-magnified | 0.534 | 0.493 | 0.442 | 0.539 |
| motor-impairment-tremor | 0.572 | 0.518 | 0.448 | 0.576 |
| elderly-user | 0.640 | 0.596 | 0.536 | 0.644 |
| power-user | 0.384 | 0.487 | 0.577 | 0.381 |
| impatient-user | 0.692 | 0.738 | 0.839 | 0.680 |

Patience demand rises from a median of 0.423 at the viewport and 0.388 at
full_page (p10-p90 0.221-0.655 and 0.224-0.693, the two 0.7 x text terms) to the
reading demand's 0.676 and 0.889 (0.220-0.855 and 0.545-0.968), so the
personas authored with low patience (power-user 0.3, cognitive-adhd and
impatient-user 0.2) rise and the high-patience ones (dyslexic-user 0.75,
tremor and elderly-user 0.8) fall. Under V5 every impaired persona stays above
the typical user (viewport: dyslexic +0.050, low vision +0.102, tremor +0.128,
ADHD +0.292); under V6 dyslexic-user falls below it (-0.036), which is one more
reason against the whole-page sum. power-user rises further above the typical
user (+0.040 -> +0.096), the authored patience 0.3 now pricing. V7 is the
small-move alternative: within 0.01 of design C everywhere at the viewport,
with one hand-set share kept.

**Building V5.** The before and after on the shipped chain are in section 10.

---

## 5. Persona capacities (question 3)

| trait | instrument (research/persona-norms) | norm-anchored values | status under design C |
|---|---|---|---|
| comprehension | Computer Proficiency Questionnaire, partial fit, older adults only | none | hypothesis |
| workingMemory | Wechsler WMI, good fit | applied: cognitive-adhd 0.37 (Wilson 2024, WMI 95.2), autism-spectrum 0.32 (Habib 2019, adult visuospatial SMD -0.47); listed, not applied: dyslexic, elderly, intellectual disability, aphasia, deaf, dyscalculia | values hypothesis on this scale (below) |
| informationForaging | none | none | hypothesis |
| transferLearning | none | none | hypothesis |
| siteFamiliarity | none, a per-run state | not applicable | leaves the persona: Cockburn's e (definition) |

The WM norms are not mine; their quotes are in `research/persona-norms/applied.md`
and `sources.md`.

**Two scales meet here.** persona-norms reads a trait as a percentile of a
reference population (`value = Phi(z)`). Stage B reads a capacity as a rate
ratio (`c = 1 / (1 + k)`). They agree at the reference, 0.5 in both, and
nowhere else: a 37th-percentile WMI says nothing about how much slower its
holder searches. Using a norm-anchored percentile as a time-scale capacity is a
mapping no source supports, so it is labelled hypothesis, and the paper should
say the two conventions coincide only at the median.

**What a value means under design C.** Tolerated reference choosing time
`T_c = tau c / (1 - c)`, slowdown `k = (1 - c) / c`:

| c | T_c (s) | k | personas at this value (comprehension unless noted) |
|---|---|---|---|
| 0.2 | 3.1 | 4.00 | first-timer transferLearning, elderly-user, intellectual-disability |
| 0.3 | 5.3 | 2.33 | first-timer, elderly-low-vision |
| 0.4 | 8.3 | 1.50 | first-timer workingMemory and informationForaging |
| 0.5 | 12.4 | 1.00 | typical user; dyslexic-user |
| 0.7 | 28.9 | 0.43 | task-focused, tremor, low-vision-magnified |
| 0.9 | 111.6 | 0.11 | power-user |

**first-timer's comprehension 0.3** then says: on a first visit, this persona
takes 2.33 times as long to find a choice as Cockburn's novices, competent
computer users on unfamiliar menus with block 1 removed. It costs only on pages
whose reference choosing time exceeds 5.3 s: 18% of viewport pages and 62% of
full_page pages (a little less than that threshold in practice, since
visualComplexity depletes capacity first). The claim is a hypothesis, but it is now
a checkable one: a measured novice-versus-competent web search ratio would set
it (Hoelscher & Strube 2000 is the obvious place to look; not retrieved).

**An upper bound from the published expert limit.** A persona faster than the
reference searcher is at most as fast as Cockburn's experts:
`c_max = 1 / (1 + T_expert / T_novice)`. Per group of n items that is 0.59 (n 2),
0.66 (8), 0.72 (14), 0.86 (50), 0.92 (106); on the reference pages the ratio of
median choosing times gives about 0.70 at the viewport and 0.81 at full_page.
Values above that (power-user 0.9 on all four, explorer, impatient-user
informationForaging 0.9) claim faster than expert search on a first visit.
Since surplus is free on these traits, the excess changes no score; it should
be stated, not silently clamped.

---

## 6. Prediction on the 513 reference pages (question 4)

`stage-c-predict.ts` (one variant per process) and `stage-c-predict-report.ts`.
Assumptions: everything outside cognitiveLoad is `8707e49` (Stage B), including
frustration's text terms; persona values unchanged; e = 0; values off,
asymmetric and interactions on (the tools' default); totalCTC is each variant's
own percentile curve, rebuilt from 25 built-in personas x 513 pages pooled as
`ctc-reference.ts` does. The V0 column reproduces the shipped scale (first-timer
0.726, ADHD 0.576, as `stage-b-deltas.md` reports). The typical user is
paper-calcs round 2's definition (25 authored traits at 0.5, first visit, the
bridge's no-statement capacities), built on this tree; it is not in the pool.

V0 today; V1 layer retired; C (= V2) design C; V3 workingMemory on reading.

### 6.1 Mean totalCTC

| persona | viewport V0 | V1 | C | V3 | full_page V0 | V1 | C | V3 |
|---|---|---|---|---|---|---|---|---|
| typical-user | 0.389 | 0.344 | 0.344 | 0.374 | 0.365 | 0.290 | 0.300 | 0.350 |
| first-timer | 0.726 | 0.555 | 0.564 | 0.577 | 0.711 | 0.534 | 0.571 | 0.602 |
| cognitive-adhd | 0.576 | 0.630 | 0.627 | 0.634 | 0.551 | 0.567 | 0.564 | 0.607 |
| dyslexic-user | 0.524 | 0.475 | 0.477 | 0.555 | 0.522 | 0.469 | 0.475 | 0.586 |
| low-vision-magnified | 0.459 | 0.537 | 0.534 | 0.499 | 0.432 | 0.506 | 0.497 | 0.447 |
| motor-impairment-tremor | 0.492 | 0.576 | 0.572 | 0.524 | 0.492 | 0.579 | 0.564 | 0.479 |
| elderly-user | 0.809 | 0.633 | 0.640 | 0.635 | 0.812 | 0.670 | 0.691 | 0.694 |
| elderly-low-vision | 0.765 | 0.720 | 0.716 | 0.718 | 0.778 | 0.752 | 0.733 | 0.757 |
| intellectual-disability | 0.856 | 0.629 | 0.649 | 0.708 | 0.842 | 0.561 | 0.661 | 0.751 |
| aphasia-receptive | 0.651 | 0.398 | 0.418 | 0.450 | 0.632 | 0.357 | 0.432 | 0.478 |
| autism-spectrum | 0.488 | 0.335 | 0.339 | 0.457 | 0.570 | 0.464 | 0.468 | 0.578 |
| power-user | 0.314 | 0.387 | 0.384 | 0.350 | 0.336 | 0.429 | 0.413 | 0.334 |

All 25 personas, both scopes, all five variants: `stage-c-predict-report.ts`.
Under design C at the viewport, besides the rows above: impatient-user 0.583 ->
0.692, emotional-user 0.629 -> 0.704, mobile-user 0.485 -> 0.559, careful-reader
0.355 -> 0.393, distracted-user 0.665 -> 0.674. Personas whose cost did not come
from this layer rise in rank because the pooled curve moves down. Every
customer score moves (release report).

### 6.2 Face validity

first-timer minus X, mean totalCTC difference, and in brackets the share of
pages on which first-timer's rawCTC is the larger:

| X | viewport V0 | V1 | C | V3 | full_page V0 | V1 | C | V3 |
|---|---|---|---|---|---|---|---|---|
| typical-user | +0.337 (100%) | +0.210 (99%) | +0.220 (99%) | +0.203 (99%) | +0.346 (100%) | +0.244 (99%) | +0.271 (100%) | +0.251 (100%) |
| cognitive-adhd | +0.150 (94%) | -0.075 (21%) | -0.063 (27%) | -0.057 (22%) | +0.159 (97%) | -0.033 (44%) | +0.007 (64%) | -0.005 (51%) |
| dyslexic-user | +0.202 (100%) | +0.080 (91%) | +0.087 (94%) | +0.022 (58%) | +0.188 (100%) | +0.066 (86%) | +0.096 (97%) | +0.016 (58%) |
| low-vision-magnified | +0.267 (99%) | +0.017 (58%) | +0.030 (59%) | +0.078 (91%) | +0.279 (99%) | +0.029 (71%) | +0.075 (79%) | +0.155 (96%) |
| motor-impairment-tremor | +0.234 (96%) | -0.021 (43%) | -0.008 (50%) | +0.053 (71%) | +0.219 (98%) | -0.045 (31%) | +0.007 (66%) | +0.122 (90%) |
| elderly-user | -0.083 (0%) | -0.078 (4%) | -0.076 (4%) | -0.058 (4%) | -0.101 (0%) | -0.135 (3%) | -0.120 (2%) | -0.092 (2%) |
| elderly-low-vision | -0.039 (15%) | -0.166 (0%) | -0.152 (0%) | -0.141 (0%) | -0.067 (4%) | -0.218 (0%) | -0.162 (0%) | -0.155 (0%) |

X minus the typical user under design C, viewport: ADHD +0.283, dyslexic
+0.133, low vision +0.190, tremor +0.228, elderly +0.296, elderly-low-vision
+0.372, intellectual disability +0.305, first-timer +0.220. Every impaired
persona stays above the typical user in every variant. power-user is +0.040
above it under design C (-0.075 today): the decision layer's billed surplus,
already a named limit, is no longer hidden behind first-timer-type
cognitiveLoad costs on the other personas.

### 6.3 Where the remaining first-timer surplus sits

Design C, viewport, mean layer cost:

| persona | visual | cognitiveLoad | decision | motor | motorProc | frustration | readability | readingAttention |
|---|---|---|---|---|---|---|---|---|
| typical-user | 0.017 | 0.002 | 0.064 | 0.050 | 0.000 | 0.043 | 0.050 | 0.003 |
| first-timer | 0.019 | 0.024 | 0.113 | 0.051 | 0.004 | 0.064 | 0.051 | 0.054 |
| cognitive-adhd | 0.019 | 0.006 | 0.133 | 0.051 | 0.001 | 0.117 | 0.058 | 0.043 |
| dyslexic-user | 0.024 | 0.007 | 0.086 | 0.050 | 0.001 | 0.055 | 0.077 | 0.012 |
| low-vision-magnified | 0.045 | 0.002 | 0.068 | 0.050 | 0.000 | 0.040 | 0.115 | 0.026 |

first-timer over dyslexic-user: decision +0.027, readingAttention +0.042,
frustration +0.009, cognitiveLoad +0.017; dyslexic-user's readability is +0.026.
The decision gap is authored dispositions (first-timer anchoring 0.7, social
proof 0.7, riskTolerance 0.3). The readingAttention gap is first-timer's
sustainedAttention, which falls back to interruptRecovery 0.4 because it states
no attentionSpan (dyslexic-user states 0.5), and its readingTendency 0.6
(engagement 1.05 against 0.925). Both are outside this layer. At full_page
design C still charges first-timer 0.113 in cognitiveLoad (choosing demand
median 0.34), which is why it stays slightly above ADHD and tremor there.

**Plainly:** no grounded design of cognitiveLoad reverses first-timer against
dyslexic-user. Design C reverses it for ADHD at the viewport, removes it for
tremor and low vision (near ties), and leaves dyslexic-user below first-timer.

---

## 7. What stays hypothesis

- The four trait values, now read as tolerated choosing time, and the claim
  that they are demanded the choosing time at all (one registered hypothesis).
- The three interaction weights that touch cognitiveLoad.
- tau 12.4 s as the budget (Stage B).
- Using a percentile (WM norms) as a rate-scale capacity.
- That the costs of the same choosing seconds add across decision and
  cognitiveLoad.
- With the visit-count form of familiarity only: L = 1.

Definitions: siteFamiliarity = Cockburn's e; the reference curve at e = 0.

Published and now load-bearing for familiarity: the novice and expert choosing
fits (already registered by Stage B).

---

## 8. Consequences and open questions

### 8.1 What must change if approved

- `computeDemandDistribution`: retire the 15 terms; read `siteFamiliarity` from
  an options argument; the four load traits take the decision demand.
- `PageMetrics.choosingSecondsExpert` (required, like the other law times; an
  npm API break for anyone building PageMetrics by hand) and
  `computeDemandFromRawMetrics` gains it.
- `DEMAND_DIMENSIONS` loses siteFamiliarity; `transport-dimension-alignment`
  pins the new difference; `SURPLUS_FREE_DIMENSIONS` loses it.
- Tools: siteFamiliarity goes to the demand, not the traits;
  `site-familiarity-gate` and the effect note are rewritten (familiarity now
  moves decision and cognitiveLoad through choosing seconds).
- Golden re-pin (every run with cognitiveLoad moves), reference curve rebuilt
  (automatic, the curve derives from raw records), DRO: the layer's trait list
  and demand map change, so the Lipschitz derivation re-runs and the full
  interaction re-scan (still owed from Stage B) covers this too.
- Release report: every totalCTC moves (6.1); aphasia-receptive and
  intellectual-disability fall by about 0.2.

### 8.2 Raw fields

None needed for design C. For later formats, each with what it would need to
be grounded:

- interactive elements with no visible text label, for a convention demand on
  comprehension (needs a measured cost, e.g. Wiedenbeck 1999, not retrieved);
- the prose words inside nav groups (Stage B's open item; section 3.4 argues
  the current double charge matches the search law's calibration);
- a simultaneous-load measure for WM (comparison table cells): no law found.

### 8.3 Open questions

1. Which design for the four traits: C (tolerated choosing time), V1 (retire),
   or V3 (WM on reading)?
2. siteFamiliarity as e directly, or a visit count with L?
3. Aphasia and intellectual disability: their language-comprehension deficit
   is priced only by a hypothesis reading share. Retrieve measured rates before
   21.0, or ship the drop and state it?
4. Frustration's two text terms: same treatment in 21.0?
5. `comprehension` names a UI-convention trait, and the name invited a text
   demand. Rename it in 22.0 (a persona schema change), or document it?

---

## 9. Scripts

All under `research/`, run as the tree's owner from the worktree root with bun.

| script | what it prints |
|---|---|
| `stage-c-traits.ts` | the five traits for every built-in persona, tool path |
| `stage-c-explore.ts` | demand distributions, max() winners, per-trait costs (2.1, 2.2) |
| `stage-c-spread.ts` | cognitiveLoad spread across pages per persona |
| `stage-c-overlap.ts` | rank correlations with reading time and letters per word; saturation counts |
| `stage-c-familiarity.ts` | choosing time and demand under Cockburn's e (3.4) |
| `stage-c-capacities.ts` | the capacities and dispositions behind 6.3 |
| `stage-c-predict.ts` | one variant (`VARIANT=V0..V4`), writes `research/stage-c-predict/<V>.json` (not committed, about 1 MB each) |
| `stage-c-predict-report.ts` | the tables of section 6 from those files |
| `stage-c-layers-report.ts` | mean layer cost per persona per variant (6.3) |
