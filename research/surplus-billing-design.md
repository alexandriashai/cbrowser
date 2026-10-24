# Surplus billing: a stimulus that makes a page cheaper

Design note, no build. Worktree `cbrowser-public-wt-surplus`, branch
`feat/surplus-billing-design`, from `feat/cot-integration` at `0686210`. Nothing
under `src/` is changed or committed. The options were written into scratch
copies of 0686210 in the system temp dir (`research/surplus-billing/variant.ts`)
and measured there.

Each number below either comes from a source retrieved in this session (section
1), or was measured at 0686210 on `ctc-reference-v2-2026-10-24` (raw format 2, 514
graded pages) with the scripts in section 8, or is labelled a hypothesis.
"Persona" means the typical user (built as `research/sensitivity/carousel-check.ts`
builds it) plus the 25 `referencePopulation()` personas, unless a table says
otherwise.

Decisions are marked: **(Alexa)** for hers, **(mine)** for what I propose and she
has not yet decided.

---

## 0. The answer, then the decisions you need to make

**The defect, reproduced.** Put one carousel on each static page, meaning no
running animation, no autoplay and no carousel (305 viewport pages, 258
full_page). The typical user's viewport totalCTC falls by 0.085 on average, and
the page gets cheaper on 92% of them (`predict.ts`, the same numbers as
paper-calcs' carousel-check). Across all 26 personas the carousel lowers the
frustration layer's cost on 6,717 of 7,930 (persona, page) pairs at viewport,
and every one of those goes through emotionalContagion.

**The cause is a class, not one trait.** A surplus-billed trait costs
`weightSurplus x (c - d)^2` while its capacity c is above the page's demand d.
That cost *falls* as d rises toward c. So whenever a page asks more of a billed
trait that a persona has in surplus, the page gets cheaper. Every billed trait
that a layer reads does this with its own stimulus (table 2). It shows up most
on emotionalContagion for two reasons. Its only demand is motion, which is
exactly 0 on every static page. And its calm-page bill is therefore the largest:
0.3 x 0.5^2 = 0.075 before the gate for the typical user. One carousel raises
that demand to 0.302 and cuts the bill to 0.012. Depletion produces a second
route. When an earlier layer costs more, it draws down a billed trait's
capacity. That shrinks the trait's surplus, so its cost falls.

**Recommendation (mine): option f.**
- emotionalContagion is priced by exposure: `w x c x d`, where c is the
  susceptibility and d the stimulus. It is 0 on a calm page and rises with
  either factor.
- changeBlindness becomes surplus-free.
- patience becomes surplus-free.

What f does:
- One carousel never lowers frustration or totalCTC: 0 of 14,638 roster pairs
  and 0 of 225,200 random-persona pairs.
- Every impaired persona stays above the typical user. The smallest gap is
  +0.045 at viewport and +0.032 at full_page.
- 99,595 of 231,418 golden numbers move; golden Spearman 0.9894.

**Decisions for Alexa:**
1. f, or e. e is f with patience still billed. It leaves one named exception: a
   persona with emotionalContagion near 0 and patience near 1, in whom motion
   lowers frustration through depletion (10 of 225,200 random pairs).
2. The exposure weight w. I propose reusing `chain.weightSurplus` (0.3), which
   keeps a trait's largest possible cost where it was. It is a hypothesis either
   way.
3. Whether the decision-layer susceptibilities wait. Their stimulus is not
   measured, and pricing them by exposure (c-class) drops dyslexic-user below the
   typical user at full_page. I propose a named limit in 21.0 (section 6).

**(Alexa), 2026-10-24:** fix in 21.0, design first.

## 1. Sources read in this session

- **Hatfield, Bensman, Thornton & Rapson (2014).** New perspectives on
  emotional contagion: a review of classic and recent research on facial
  mimicry and contagion. *Interpersona* 8(2), 159-179, doi:10.5964/ijpr.v8i2.162
  (open access, CC BY; PDF read). It quotes Hatfield et al. (1994), defining
  primitive emotional contagion as "The tendency to automatically mimic and
  synchronize facial expressions, vocalizations, postures, and movements with
  those of another person's and, consequently, to converge emotionally". It
  also says: "The Emotional Contagion Scale was designed to assess people's
  susceptibility to catching joy and happiness, love, fear and anxiety, anger,
  and sadness and depression" (Doherty, 1997).

  What this supports: contagion is *caught from* an expression. The trait is a
  susceptibility, and with nothing to catch there is nothing caught. What it
  does not support: that page animation is such an expression. The chain's
  `demand.animation.emotionalContagion` (0.7) is hand-set. The functional form
  and any weight are also unsupported.
- **Simons & Levin (1997).** Change blindness. *Trends in Cognitive Sciences*
  1(7), 261-267, doi:10.1016/S1364-6613(97)01080-2 (according to PubMed,
  abstract read). They define change blindness as "the inability to detect
  changes to an object or scene". A cost of change blindness needs a change.
- **Burke, Hornof, Nilsen & Gorman.** High-cost banner blindness: ads increase
  perceived workload, hinder visual search, and are forgotten. I read the
  authors' manuscript submitted to ACM TOCHI (2004), which was published in 2005,
  doi:10.1145/1121112.1121116. The DOI comes from the search result; I did not
  open the publisher's page. Experiment 1 measured NASA-TLX overall workload by
  banner: flashing text M = 160.71, significantly above the others (F(3, 36) =
  6.52, p < .001); animated M = 121.44, above but not significantly; static
  107.83 and blank 110.54, about the same. "Participants found the flashing
  banners more frustrating and mentally demanding than the other banner types".

  What this supports: no motion condition lowered workload or frustration
  against a blank banner. That is the property in section 5. It does not size
  the effect.
- **Not retrieved:** Hatfield, Cacioppo & Rapson (1993), *Current Directions in
  Psychological Science* 2(3), 96-99 (paywalled), and Doherty (1997), *Journal
  of Nonverbal Behavior* 21, 131-154. Both are cited here only as the 2014 review
  quotes them.

## 2. Every surplus-billed trait (question 1)

`SURPLUS_BILLED_DIMENSIONS` at 0686210 has 14 entries. Six of them are in no
layer: persistence, readingTendency, metacognitivePlanning, trustCalibration,
curiosity and attentionPattern. Billing them changes no number (class D). The
eight that a layer reads:

| trait (layer) | high end (trait-reference.ts) | what surplus costs the person, plainly | demand on a calm page | class |
|---|---|---|---|---|
| emotionalContagion (frustration) | "Adopts UI's emotional tone completely" | nothing: being readier to catch a mood than the page's mood is strong costs nothing until there is a mood to catch | 0 on every static page (motion only) | A, susceptibility to a stimulus |
| changeBlindness (visualComplexity) | "Misses most changes outside focus area" (inverted) | nothing: missing more than the page changes costs nothing on a page that does not change | visual complexity, > 0 on every page | A, inverted |
| fearOfMissingOut (decision) | "Highly responsive to urgency and scarcity" | nothing without urgency cues, which the chain does not measure | a share of choosing time | A, stimulus unmeasured |
| socialProofSensitivity (decision) | "Heavily influenced by what others chose" | nothing without social cues (not measured) | a share of choosing time | A, stimulus unmeasured |
| anchoringBias (decision) | "First information heavily influences all judgments" | only when a later option is under-weighted | a share of choosing time | A, stimulus unmeasured |
| riskTolerance (decision) | "Clicks anything that might work" | a hazard only where the page offers uncertain controls | a share of choosing time | A, stimulus unmeasured |
| satisficing (decision) | "Satisficer - accepts first adequate option" | at most a worse pick, not effort. The 2026-08-03 note's "a maximiser on a trivial page over-deliberates" describes the low end, which is billed as deficit, not surplus | choosing time | B, strategy |
| patience (frustration) | "Waits indefinitely, never abandons" | nothing: tolerance left unused is not time spent, because the page's time is counted by the reading and decision layers. Since Stage C, patience's value reads as tolerated reading time | reading time | C, tolerance |

Measured (`report.ts`, table 2 below): every one of the eight gets cheaper with
its own stimulus on a large share of pairs. The motion stimulus also lowers the
decision traits and patience on 18-44% of viewport pairs, through depletion.

**Table 2.** The eight on 0686210, ctc-reference-v2-2026-10-24, 514 pages, 26 personas. "Own stimulus" is motion (a carousel on each static page), choice (choosing time x 1.5 on every page) or reading (reading time x 1.5 on every page). The first share column is the share of static pages on which its demand is 0; the other two are the share of (persona, page) pairs on which its cost, before the content gate, falls.

| trait | own stimulus | demand 0 on a static page (viewport / full_page) | own stimulus lowers its cost (viewport / full_page) | motion lowers its cost (viewport / full_page) |
|---|---|---|---|---|
| emotionalContagion | motion | 100% / 100% | 100% / 99% | 100% / 99% |
| changeBlindness | motion | 0% / 0% | 55% / 18% | 55% / 18% |
| patience | reading | 1% / 1% | 40% / 14% | 44% / 14% |
| satisficing | choice | 2% / 1% | 87% / 71% | 18% / 6% |
| anchoringBias | choice | 2% / 1% | 93% / 78% | 20% / 6% |
| riskTolerance | choice | 2% / 1% | 83% / 61% | 22% / 7% |
| fearOfMissingOut | choice | 2% / 1% | 86% / 63% | 21% / 6% |
| socialProofSensitivity | choice | 2% / 1% | 94% / 82% | 20% / 7% |

## 3. Options (question 2)

All options keep `computeDemandDistribution` unchanged and alter only how one of
the eight traits is costed. No option adds a constant: w is
`chain.weightSurplus` (0.3) throughout.

| option | change | source or hypothesis |
|---|---|---|
| a-motion | emotionalContagion and changeBlindness surplus-free | The 2026-08-03 rule itself: billing surplus is defensible only where surplus is effort spent, and section 2 finds none for these two. It leaves the deficit side inverted (section 6). |
| a-class | all six of class A surplus-free | same |
| b-class | class A surplus billed in proportion to its stimulus, `w (c - d)^2 d` | hypothesis. 0 on a calm page, but still falls with d for d > c/3 |
| c-motion | emotionalContagion and changeBlindness priced by exposure, `w c d` | The form follows Hatfield et al. (2014): contagion is caught from an expression and susceptibility is the person's readiness to catch it. Nothing caught without an expression; nothing caught without susceptibility. The product form, the weight, and animation as the expression are hypotheses. For changeBlindness, Simons & Levin (1997): no change, nothing to miss. |
| c-class | class A priced by exposure | same, with an unmeasured stimulus for four of the six |
| d | c-class, and patience surplus-free | as c, plus section 2's reading of patience as a tolerance |
| e | emotionalContagion by exposure, changeBlindness surplus-free | c for the trait whose stimulus is motion only; a for changeBlindness, whose calm-page demand is visual complexity |
| f | e, and patience surplus-free | as e, plus the tolerance reading of patience |

## 4. Predicted effects (question 3)

Measured on scratch copies of 0686210, one per option. The carousel check and
the property come from `predict.ts`, which builds personas exactly as
carousel-check.ts does and reproduces its O0 numbers. Face validity comes from
`stage-c-refset.ts`. The golden delta is `stage-c-golden-repin.ts` against
0686210's pin. Each option ranks against its own percentile curve, as a build
would. O0 is 0686210 unchanged; its golden delta is 0 of 231,418, which checks
the harness.
#### viewport: one carousel on each static page, mean totalCTC change (share of pages cheaper)

| option | typical-user | first-timer | cognitive-adhd | elderly-user | pairs where motion lowers frustration (through) | pairs where it lowers totalCTC |
|---|---|---|---|---|---|---|
| O0 | -0.085 (92%) | -0.043 (78%) | -0.033 (96%) | -0.017 (63%) | 6717 of 7930 (emotionalContagion 6717) | 5793 |
| a-motion | +0.008 (0%) | +0.062 (0%) | +0.024 (0%) | +0.074 (0%) | 204 of 7930 (patience 204) | 0 |
| a-class | +0.011 (0%) | +0.082 (0%) | +0.030 (0%) | +0.087 (0%) | 214 of 7930 (patience 214) | 0 |
| b-class | +0.015 (0%) | +0.090 (0%) | +0.037 (0%) | +0.094 (0%) | 204 of 7930 (patience 204) | 140 |
| c-motion | +0.107 (0%) | +0.160 (0%) | +0.092 (0%) | +0.159 (0%) | 0 of 7930 | 0 |
| c-class | +0.104 (0%) | +0.164 (0%) | +0.097 (0%) | +0.159 (0%) | 0 of 7930 | 0 |
| d | +0.097 (0%) | +0.145 (0%) | +0.094 (0%) | +0.137 (0%) | 0 of 7930 | 0 |
| e | +0.089 (0%) | +0.144 (0%) | +0.077 (0%) | +0.144 (0%) | 0 of 7930 | 0 |
| f | +0.082 (0%) | +0.124 (0%) | +0.074 (0%) | +0.119 (0%) | 0 of 7930 | 0 |

#### full_page: one carousel on each static page, mean totalCTC change (share of pages cheaper)

| option | typical-user | first-timer | cognitive-adhd | elderly-user | pairs where motion lowers frustration (through) | pairs where it lowers totalCTC |
|---|---|---|---|---|---|---|
| O0 | -0.031 (95%) | +0.007 (39%) | -0.012 (68%) | +0.019 (25%) | 6223 of 6708 (emotionalContagion 6223) | 4075 |
| a-motion | +0.016 (0%) | +0.068 (0%) | +0.032 (0%) | +0.073 (0%) | 38 of 6708 (patience 38) | 0 |
| a-class | +0.017 (0%) | +0.070 (0%) | +0.034 (0%) | +0.076 (0%) | 43 of 6708 (patience 43) | 0 |
| b-class | +0.019 (0%) | +0.075 (0%) | +0.038 (0%) | +0.080 (0%) | 40 of 6708 (patience 40) | 31 |
| c-motion | +0.055 (0%) | +0.107 (0%) | +0.061 (0%) | +0.104 (0%) | 0 of 6708 | 0 |
| c-class | +0.048 (0%) | +0.095 (0%) | +0.057 (0%) | +0.098 (0%) | 0 of 6708 | 0 |
| d | +0.047 (0%) | +0.092 (0%) | +0.057 (0%) | +0.095 (0%) | 0 of 6708 | 0 |
| e | +0.051 (0%) | +0.108 (0%) | +0.062 (0%) | +0.108 (0%) | 0 of 6708 | 0 |
| f | +0.050 (0%) | +0.105 (0%) | +0.061 (0%) | +0.104 (0%) | 0 of 6708 | 0 |

#### Face validity on the reference (mean totalCTC, X minus the typical user) and golden delta against 0686210's pin

| option | smallest impaired minus typical (viewport / full_page) | which | power-user minus typical | first-timer minus typical | typical-user mean totalCTC | golden numbers moved | golden Spearman |
|---|---|---|---|---|---|---|---|
| O0 | +0.060 / +0.035 | dyslexic-user / dyslexic-user | +0.094 / +0.185 | +0.154 / +0.144 | 0.379 / 0.360 | 0 of 231418 | 1.0000 |
| a-motion | +0.073 / +0.035 | dyslexic-user / dyslexic-user | +0.144 / +0.205 | +0.118 / +0.122 | 0.380 / 0.364 | 78670 of 231418 | 0.9945 |
| a-class | +0.080 / +0.030 | dyslexic-user / dyslexic-user | +0.150 / +0.191 | +0.054 / +0.077 | 0.379 / 0.378 | 96882 of 231418 | 0.9690 |
| b-class | +0.073 / +0.031 | dyslexic-user / dyslexic-user | +0.145 / +0.194 | +0.072 / +0.090 | 0.375 / 0.373 | 96461 of 231418 | 0.9820 |
| c-motion | +0.031 / -0.006 | dyslexic-user / dyslexic-user | +0.060 / +0.111 | +0.124 / +0.144 | 0.408 / 0.390 | 114401 of 231418 | 0.9778 |
| c-class | +0.021 / -0.012 | dyslexic-user / dyslexic-user | +0.035 / +0.045 | +0.060 / +0.092 | 0.432 / 0.434 | 116563 of 231418 | 0.9435 |
| d | +0.003 / -0.014 | dyslexic-user / dyslexic-user | +0.037 / +0.045 | +0.048 / +0.090 | 0.444 / 0.435 | 116679 of 231418 | 0.9423 |
| e | +0.062 / +0.034 | low-vision-magnified / dyslexic-user | +0.125 / +0.187 | +0.116 / +0.122 | 0.390 / 0.372 | 98671 of 231418 | 0.9910 |
| f | +0.045 / +0.032 | low-vision-magnified / dyslexic-user | +0.125 / +0.187 | +0.100 / +0.120 | 0.404 / 0.374 | 99595 of 231418 | 0.9894 |

#### The motion property over 400 seeded random personas (every static page)

| option | scope | pairs | motion lowers frustration | motion lowers totalCTC | emotionalContagion of the violators | patience of the violators |
|---|---|---|---|---|---|---|
| O0 | viewport | 122000 | 84805 | 63369 | 0.198 to 1.000 | 0.000 to 0.999 |
| O0 | full_page | 103200 | 80170 | 49856 | 0.198 to 1.000 | 0.000 to 0.999 |
| a-motion | viewport | 122000 | 2924 | 0 | 0.292 to 0.990 | 0.221 to 0.999 |
| a-motion | full_page | 103200 | 623 | 0 | 0.292 to 0.990 | 0.360 to 0.999 |
| e | viewport | 122000 | 6 | 0 | 0.012 to 0.012 | 0.981 to 0.981 |
| e | full_page | 103200 | 4 | 0 | 0.012 to 0.012 | 0.981 to 0.981 |
| f | viewport | 122000 | 0 | 0 | none | none |
| f | full_page | 103200 | 0 | 0 | none | none |

What the tables say:
- **a and b** stop the carousel from lowering totalCTC: a never does, and b
  still does on 140 viewport pairs in its non-monotone range. Both leave 204
  viewport roster pairs (2,924 random) where frustration falls through
  patience's billed surplus under depletion.
- **The c options** remove every violation, but cost face validity.
  dyslexic-user drops below the typical user at full_page (-0.006 for c-motion,
  -0.012 for c-class), and c-class shrinks the power-user gap to +0.035/+0.045.
  This happens because changeBlindness by exposure charges `c x visual
  complexity` on every calm page.
- **e** keeps face validity (smallest gap +0.062 / +0.034) and has no roster
  violation. Its one random violator, emotionalContagion 0.012 with patience
  0.981, is the depletion route.
- **f** closes that route: 0 of 225,200 random pairs, 0 roster pairs. The price
  is a slightly smaller smallest gap (+0.045, low-vision-magnified, at viewport)
  and a typical user 0.025 higher at viewport.

## 5. Recommendation and the property (question 4)

**Option f (mine).**
- emotionalContagion costs `w x c x d` (exposure), with `w =
  chain.weightSurplus`.
- changeBlindness and patience join `SURPLUS_FREE_DIMENSIONS`. changeBlindness
  joins because a cost of missing changes needs a change, and the calm-page part
  of its demand, visual complexity, is not one. patience joins because unused
  tolerance is not time spent.
- Everything else stays as at 0686210.

Effects measured on 0686210 plus f, on the 514-page reference:
- One carousel costs more for every persona on every static page. Mean totalCTC
  change, viewport / full_page: typical +0.082 / +0.050, first-timer +0.124 /
  +0.105, cognitive-adhd +0.074 / +0.061, elderly-user +0.119 / +0.104.
- emotional-user now pays most where the page moves. On average over the
  reference it is cheaper (viewport 0.735 -> 0.681), because most pages are
  static and its calm-page bill is gone.
- Persona order vs O0: Spearman 0.973 at viewport and 0.996 at full_page.

**The property, as tests:**
1. For every persona in `referencePopulation()` plus the typical user, on every
   static page of the reference, at both scopes, one carousel never lowers the
   frustration layer's transportCost and never lowers totalCTC. Under f this is
   0 of 14,638 pairs for each.
2. The same two inequalities as a fast-check property over arbitrary trait
   vectors on a sample of static reference pages. `random-personas.ts` is its
   seeded form: 0 of 225,200 under f.
3. emotionalContagion's cost is 0 on every static page, and is non-decreasing in
   its demand and in the persona's emotionalContagion.

**Where the property may still fail under f, precisely.**
- Frustration reads patience and emotionalContagion. Its content gate only
  rises with motion. patience is now surplus-free, so a lower patience capacity
  can only raise or keep its cost. emotionalContagion's cost starts at 0 on a static page and
  cannot go below it.
- The one remaining route is second order. Motion raises visualComplexity's
  draw on every capacity, which lowers the decision traits' capacity. They keep
  billed surplus, so the decision layer costs a little less and draws a little
  less from patience. If that reduced draw ever exceeded visualComplexity's added
  draw, patience would end higher and a patience deficit smaller.
- It is not observed in 239,838 pairs (roster plus random). The fast-check
  property is what would find it. Under e, the route through patience's own
  surplus is first order, and the property needs the exception stated in
  section 0.

## 6. Not changed, and named limits

- **The deficit side of an inverted or susceptibility scale stays inverted**
  wherever gap^2 still prices it.
  - changeBlindness under f: a good noticer (0.2) pays when visual complexity
    exceeds 0.2; a poor noticer (0.8) pays nothing below 0.8.
  - emotionalContagion today: its demand cannot exceed 0.7
    (`demand.animation.emotionalContagion` x a demand below 1). So
    intellectual-disability, anxious-user and emotional-user (0.7, 0.7, 0.9)
    never pay an emotionalContagion deficit, and stoic-user (0.2) does. f
    removes this for emotionalContagion.
  - Pricing changeBlindness by exposure (c-motion) fixes its direction, but
    dyslexic-user then falls below the typical user at full_page. It needs its
    own design: what a static page's "change" is.
- **The four decision-layer susceptibilities** (fearOfMissingOut,
  socialProofSensitivity, anchoringBias, riskTolerance) keep billed surplus.
  50% more choosing time lowers their cost on 83-94% of viewport pairs. The cue
  each responds to (urgency, reviews, a first option, uncertain controls) is not
  measured, and a share of choosing time stands in for it. Proposed for a later
  stage that measures the cue. In 21.0 it is a named limit.
- **satisficing** keeps billed surplus. Section 2 notes its stated
  justification describes the deficit end.
- **The exposure weight, the 0.7 motion-to-contagion share, and animation as
  the contagion stimulus** stay hypotheses. Burke et al. sign the effect; they
  do not size it.

## 7. If approved: what the build touches

- `cognitive-transport-chain.ts`:
  - the exposure branch in the cost loop;
  - changeBlindness and patience moved to `SURPLUS_FREE_DIMENSIONS`, with each
    one's reason in the note;
  - the "THEIR SCALE IS INVERTED" note rewritten. It argued that billing
    inverted-scale surplus is correct, and section 2 refutes that for
    changeBlindness.
- `tests/surplus-billing.test.ts` asserts changeBlindness is billed, so it
  changes. Add the three property tests of section 5, red on 0686210.
- `dro-bound.ts`: the Lipschitz derivation assumes gap^2 for every trait. The
  exposure term has `|d cost / d c| = w d <= w` and needs its own case, plus a
  mutant that the DRO tests must kill.
- Re-pin ctc-golden in its own commit (f: 99,595 numbers, Spearman 0.9894).
  Release notes: every totalCTC moves; a carousel now always costs; personas
  with high emotionalContagion are cheaper on static pages and costlier on
  moving ones.

## 8. Scripts

All under `research/surplus-billing/`; outputs go to a temp dir and are not
committed.
- `predict.ts` (TREE): the carousel check, the property over the roster, and the
  three stimuli of table 2.
- `variant.ts <scratch-tree> <option>`: writes an option into a scratch copy. It
  refuses any path outside the system temp dir.
- `random-personas.ts` (TREE, N): the property over seeded random personas.
- `report.ts` (OUT): the tables in sections 2 and 4.
- Face validity and the golden delta use the existing `research/stage-c-refset.ts`
  and `research/stage-c-golden-repin.ts`.

Run scripts as the tree's owner from the worktree root. A bun process whose
working directory it cannot read starts without the environment, so TREE is
silently ignored. One run here measured the unchanged tree nine times for that
reason. `predict.ts` now prints the tree it ran on, and `report.ts`'s inputs
were checked for it.
