# Study 1 results — what is in here and which number is true

Read this before citing anything from this directory. One of these folders holds a
result that has been **retracted**, and until 2026-08-04 it was the only one on disk
and it was called `results_final`.

| folder | scored what | verdict |
|---|---|---|
| `2026-04_published-RETRACTED/` | `run_full_study.py`, a separate Python model (not the shipped code, not the port) | **retracted — do not cite** |
| `2026-07_rerun-logs/` | despite the name, the April Python runs (04-13, 04-16, 04-19) reproducing 0.663 / 0.605 | logs only. The July re-run against shipped code is not in this repo (see below) |
| `2026-08-04_shipped/` | the **visual channel** on 1,980 stimuli, real fixations | current |
| `2026-08-04_semantic/` | the **shipped model** on 495 web stimuli (written 2026-08-05 09:51 MDT) | **current headline** |
| `2026-10-21_v20-personas/` | seven personas through the shipped model at v20.0.1, AUC/NSS/CC/KLD/SIM | current (`run-study1-v20.ts`) |
| `2026-08-04_ceiling/` | human inter-observer ceiling (0.8112) | current |
| `2026-08-04_optimize*/` | the parameter fits behind the shipped config | current |
| `2026-08-04_blend-sweep/` | blend-weight sweep with 5-fold CV | current |
| `2026-08-04_persona-sweep/` | 32 personas, 495 stimuli | current |
| `2026-08-04_vlm-ceiling/` | GPT-5.6 Sol vs Claude Fable-5 vs Gemini 3 Flash | current |
| `study1b/` | Schwartz-values effect on the **CTC**, not saliency | **STALE — see below** |
| `_scratch/` | exploratory plots and partial runs | not a result |

## The headline

**Two different models are measured here and conflating them is the mistake this
section previously made.** Until 2026-08-05 this file said "a centred Gaussian beats
the shipped saliency model", which was written about the visual channel and read as
being about the product. Both numbers are below, separately.

### The visual channel alone — still loses to a blob

`computeLabSaliency` on all 1,980 UEyes stimuli, real fixation points from 554
participant logs:

| model | AUC | NSS | CC |
|---|---|---|---|
| CenterBias | **0.6813** | **0.6375** | **0.1791** |
| Lab saliency (visual channel only) | 0.5871 | 0.2638 | 0.0715 |
| Uniform (floor) | 0.5000 | 0.0000 | 0.0000 |

Wins on 430 of 1,980 pages (21.7%), mean AUC delta −0.0942. Unchanged, and still
the reason any UI saliency claim has to clear center bias before it has cleared
anything.

### The shipped model — no longer does

`analyzeAttention` at its calibrated operating point, 495 web stimuli, elements
reconstructed by the model-free OCR extractor:

| arm | AUC | NSS | CC |
|---|---|---|---|
| human inter-observer ceiling | **0.8112** | 1.4174 | — |
| **shipped model (blend w=0.2, sigma 2.5, spatial prior)** | **0.7371** | **0.8560** | **0.2784** |
| semantic channel alone, typed | 0.7354 | 0.8503 | 0.2766 |
| semantic channel alone, flat | 0.7360 | 0.8430 | 0.2742 |
| CenterBias | 0.6515 | 0.4940 | 0.1617 |
| Lab saliency alone | 0.5817 | 0.2478 | 0.0784 |
| Uniform (floor) | 0.5000 | 0.0000 | 0.0000 |

Beats center bias on **440 of 495 pages (88.9%)**, mean delta **+0.0856**. That
closes about half the distance from the baseline to the human ceiling — where the
ceiling is 31 real participants predicting the other 31, scored by the identical
metric.

**Two independent estimates agree.** Nested 5-fold cross-validation put held-out
accuracy at 0.7367; this full-corpus measurement gives 0.7371. The 0.7371 is
in-sample: the spatial prior and the blend were fitted on these same 495 stimuli,
so cite 0.7367 as the held-out estimate. (Corrected 2026-10-21: this paragraph
previously called 0.7371 "unfitted".)

**It also beats two frontier vision models**, paired on the same 60 stimuli:
0.7567 against Claude Fable-5 at 0.7067 (p=0.0002) and GPT-5.6 Sol at 0.6985
(p<0.0001), at zero per-page inference cost.

### The element-type weights stop mattering

`typed_beats_flat` was 271/495 (54.7%, +0.0050) before calibration. It is now
**165/495 (33.3%, −0.0007)**. Once a spatial prior and foveal smoothing are in
place, the hand-set 10x weight spread (`cta` 1.0 down to `decorative` 0.1)
contributes nothing measurable and is marginally negative. A learned table was
fitted (+0.0265) and deliberately not shipped: it inverts toward body text and
navigation, which is what free-viewing produces, and would bake browsing
behaviour into a model meant for goal-directed use.

## Why the April numbers are retracted

`2026-04_published-RETRACTED/` reports the model at 0.6625 and center bias at 0.6146 —
the model winning by 0.048. **Corrected 2026-10-21** (verified against git and file
times): this section used to blame a port of the shipped code. That was wrong.

1. **It scored a different model.** The log's first line is printed by
   `run_full_study.py:431`, which does not import `cot_saliency.py`. Its model is a
   multi-scale difference-of-Gaussians on Lab plus novelty, text and peripheral maps,
   multiplied by a built-in Gaussian centre bias (sigma 0.3 x min(h, w),
   `run_full_study.py:81-86, 200-215`). The shipped model had no positional prior until
   2da2058 (2026-08-04). Its Python ADHD profile is not the shipped `cognitive-adhd`.
2. **Port drift is not the explanation.** Results were written 2026-04-13 10:34 MDT on
   v18.42.5, whose `computeLabSaliency` was also flat-weighted; `wA = wB = 3.0` arrived
   in f36cd88 eight hours later.
3. **Ground truth.** April used the binary `fixmaps_3s` images (about 0.64% of pixels
   positive), not real fixation points. The "18.8% of all pixels" figure this README
   used to quote came from a July attribution script that resized those maps to the
   grid before thresholding; it never applied to April.
4. **AUC.** April used 100 linear thresholds (`run_full_study.py:281-286`). The
   "flat map scores 0.25" tie bug was in an unreleased TypeScript draft fixed before
   2930a84 and never touched a published number.
5. **The centre-bias baseline changed every run:** 0.615 (April Gaussian), 0.658 (July
   linear cone), 0.6515 (August Gaussian sigma rows/4).

The July re-run that first reversed the result (centre bias wins 78.0% of pages,
persona spread 0.0047) ran 2026-07-29 19:01 MDT from a script kept outside git
(`rerun-study1-v2.mjs`), scoring the visual channel only.

`_duplicate-of-final/` inside that folder is the 2026-04-19 run, not a byte copy: it has
`color_blind` instead of `power_user` and six extra COTv arms. Only the neurotypical and
ADHD values match.

## What the 2026-08-04 run does differently

`run-shipped.ts` calls the real functions rather than reimplementing them:

- `computeLabSaliency` — `src/visual/attention-transport.ts`
- `computeAUCJudd` / `computeNSS` / `computeCC` — `src/visual/saliency-metrics.ts`
- `loadUEyesCorpus` / `parseGazepointLog` — `src/visual/fixation-corpus.ts`

`Uniform` is present as a sanity floor: it must score exactly 0.5000 AUC, and it does.
A benchmark whose floor is wrong cannot tell you anything about its ceiling.

## What this run does NOT measure

Three things sit on top of Lab saliency in production and none of them appear here:

1. **DOM semantics — 65% of the blend.** `analyzeAttention` weights saliency at 35%.
   A screenshot has no DOM, so the majority of the shipped model cannot run on these
   stimuli at all.
2. **Goal relevance** (`computeGoalRelevance`) — needs elements.
3. **The LLM relevance judge** (`src/visual/llm-relevance.ts`) — this one *does* accept
   screenshot bytes and reason about the rendered page, but it scores a supplied
   **element list**, which a screenshot does not carry.

So this number describes the visual channel alone. It says nothing about the semantic
layer in either direction, and the semantic layer is where the persona claim lives.

## Persona differentiation is still not detectable here

All six persona variants fell within 0.0047 AUC in the July run. The filters change
total map mass by 4.5× and change agreement with human fixations by 0.0037. Four global
scalars — exponent, bias, centerBias, threshold — make attention broader, tighter or
more central; they cannot express *what* a population attends to. That is a structural
limit, not a tuning problem, and a better base saliency map does not address it.

## Method note worth keeping

**Center bias is unusually strong on web stimuli.** Layouts are top-and-centre by
convention, viewers begin centred, and a screenshot cannot scroll. Any UI saliency
claim has to clear it before it has cleared anything.

## Study 1b is stale, and not for the reason you would guess

`study1b/` measures Schwartz-value modulation of the **cognitive transport chain**,
not saliency. Nothing in the 2026-08-04/05 attention work touches it: the CTC reads
`pageMetrics.visualComplexity`, which is
`logScale(uniqueColors*3 + imageCount*2 + visibleCount*0.5, 200)` — a counting
function. No saliency map reaches the chain, so a better attention model cannot
change a single number in that folder.

It is stale anyway, for the same reason the April Study 1 result was retracted.
`run_study1b.py` is dated **2026-04-15** and its own docstring says it "applies the
Python-equivalent of cognitive-transport-chain.ts math". That TypeScript has taken
**17 commits since 2026-07-01 alone**, including changes that are not refactors:

- `d9921d0` score a page as a sequence of screens, not one aggregate
- `8d931bd` capacity depletes proportionally instead of hitting a wall
- `3a849b5` split motor into target acquisition and sequence execution
- `8c3202e` attentional reading cost stops falling as the page grows
- `c73ca34` surplus is free for abilities, billed for dispositions

So the folder reports a chain that has not shipped for months. **Re-running
`run_study1b.py` would not fix that — it would re-measure the port.** The fix is the
one `run-shipped.ts` already applied to Study 1: call the shipped TypeScript instead
of reimplementing it. Until that exists, treat every number in `study1b/` as
describing April's chain.
