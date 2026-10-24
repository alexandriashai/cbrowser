# CTC 21.0: what each fix moved

Measured 2026-10-21/22 on `feat/fix2-model`, before each re-pin of
`tests/fixtures/ctc-golden-21.0.0.json`. These are changes in the model's own
output. CTC has not been tested against human data, so none of this says whether
21.0 predicts people better than 20.0.1. It says how far, and where, the numbers
moved when the contradictions were removed.

Fix 8 (no animation demand at rest) came from a cross-vendor audit after the first
re-pin. The tables below are regenerated with it included, and TOTAL is
20.0.1 -> 2760ccc.

## Method

- **Inputs.** The 21.0 golden-matrix inputs (`tests/fixtures/ctc-golden-matrix.ts`):
  - the 25 human personas, built the way `cognitive_effort` builds them;
  - 19 pages: the 12 raw-metric demands, 2 prose pages, 4 pages where one
    readability term is the largest, and 1 gate-edge page;
  - the 4 option sets and the 4 scroll inputs.

  The two synthetic boundary personas are excluded.
- **Trees.** Each tree is `git archive <commit> src` with the same matrix file
  copied in, so the inputs are identical and only the chain code differs.
- **Sequential rows** compare a commit with its parent.
- **"Alone" rows** take the 21.0 base (`d73e7b9`, the rename, which moves no
  number; first row) and apply one fix's diff of `cognitive-transport-chain.ts` and
  `provenance/chain.ts`.
  - The diff applied cleanly for fixes 2, 3 and 6a.
  - Fix 6b's diff depends on 6a's text, so its "alone" row is a hand edit of the
    base's aggregate tolerance only. The base scroll path kept its own tolerance
    copy (6a removed it), which is why that row's scroll columns read 0.
  - Fix 8's diff depends on fix 4's comment text. Its "alone" row is the same
    three code lines, hand-applied to the base.
- **Rank moves.** For each of the 12 raw demands, the 25 personas are ranked by
  the value under the tool default options. Ranking is competition ranking, so
  ties are stable.
  - "Personas (moves)" is the number of personas whose rank changed on at least
    one of the 12, then the number of (demand, persona) positions that changed,
    out of 300.
  - The rank and scroll columns always use the tool default, so they match in
    both tables.
- **Command.** `bun research/ctc-21-deltas.ts label=<fromTree>,<toTree> ... --familiarity <finalTree>`

## Tool default (asymmetric + interactions, what every tool runs): 475 cells

| comparison | totalCTC mean Δ | totalCTC max abs Δ | cells changed | abandonment mean Δ | abandonment max abs Δ | cells changed | bottleneck changes | rank moves, CTC: personas (moves) | rank moves, abandonment: personas (moves) | scroll totalAbandonment mean Δ | scroll max abs Δ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| rename (20.0.1 -> 21 base) | 0 | 0 | 0/475 | 0 | 0 | 0/475 | 0 | 0 (0) | 0 (0) | 0 | 0 |
| fix 2 alone (frustration traits) | 0.0088 | 0.1076 | 450/475 | 0.0029 | 0.1471 | 356/475 | 32 | 25 (133) | 25 (95) | 0.0108 | 0.1950 |
| fix 3 alone (attentionPattern) | -0.0057 | 0.0602 | 475/475 | -0.0051 | 0.2128 | 385/475 | 20 | 20 (29) | 25 (78) | -0.0084 | 0.0820 |
| fix 6a alone (no surplus relief) | 0 | 0 | 0/475 | 0.0153 | 0.2102 | 405/475 | 0 | 0 (0) | 25 (112) | 0.0196 | 0.2290 |
| fix 6b alone, aggregate only (residual tolerance) | 0 | 0 | 0/475 | 0.0143 | 0.0616 | 381/475 | 0 | 0 (0) | 24 (64) | 0 | 0 |
| fix 8 alone (no animation demand at rest) | -0.0018 | 0.0224 | 475/475 | -0.0020 | 0.0358 | 382/475 | 9 | 25 (64) | 25 (42) | -0.0061 | 0.0550 |
| seq: fix 2 | 0.0088 | 0.1076 | 450/475 | 0.0029 | 0.1471 | 356/475 | 32 | 25 (133) | 25 (95) | 0.0108 | 0.1950 |
| seq: fix 3 | -0.0059 | 0.0597 | 475/475 | -0.0050 | 0.1861 | 382/475 | 14 | 23 (35) | 25 (76) | -0.0081 | 0.0780 |
| seq: fix 4 (dead demand) | 0 | 0 | 0/475 | 0 | 0 | 0/475 | 0 | 0 (0) | 0 (0) | 0 | 0 |
| seq: fix 5 (clamp removed) | 0 | 0 | 0/475 | 0 | 0 | 0/475 | 0 | 0 (0) | 0 (0) | 0 | 0 |
| seq: fix 6a | 0 | 0 | 0/475 | 0.0163 | 0.2045 | 406/475 | 0 | 0 (0) | 25 (113) | 0.0215 | 0.1910 |
| seq: fix 6b | 0 | 0 | 0/475 | 0.0150 | 0.0622 | 425/475 | 0 | 0 (0) | 24 (79) | 0.0295 | 0.1460 |
| seq: fix 7 (chain) | 0 | 0 | 0/475 | 0 | 0 | 0/475 | 0 | 0 (0) | 0 (0) | 0 | 0 |
| seq: re-pin + comment fixes | 0 | 0 | 0/475 | 0 | 0 | 0/475 | 0 | 0 (0) | 0 (0) | 0 | 0 |
| seq: fix 8 | -0.0012 | 0.0183 | 475/475 | -0.0015 | 0.0398 | 425/475 | 35 | 25 (82) | 11 (16) | -0.0047 | 0.0550 |
| **TOTAL 20.0.1 -> 21.0** | **0.0017** | **0.1048** | **475/475** | **0.0278** | **0.2889** | **425/475** | **23** | **25 (117)** | **25 (145)** | **0.0491** | **0.3650** |
| fix 7, tool behaviour on a crawled site: before (unset, read as 0.5) -> after (0.0) | 0.0541 | 0.3183 | 425/475 | 0.0851 | 0.5299 | 425/475 | 158 | 17 (28) | 25 (196) | 0.0638 | 0.3540 |

Means over the tool-default cells: totalCTC 0.2456 -> 0.2473, abandonmentRisk
0.2559 -> 0.2837.

Bottleneck layer across the 475 tool-default cells:

| layer | 20.0.1 | after fix 2 | first 21.0.0 pin (959b86a) | 21.0 (after fix 8) |
|---|---|---|---|---|
| visualComplexity (saliency in 20.0.1) | 78 | 55 | 41 | 73 |
| cognitiveLoad | 263 | 257 | 258 | 258 |
| decision | 119 | 116 | 121 | 124 |
| motorProcedure | 6 | 6 | 6 | 6 |
| frustration | 9 | 41 | 49 | 14 |

## All four option sets: 1900 cells

| comparison | totalCTC mean Δ | totalCTC max abs Δ | cells changed | abandonment mean Δ | abandonment max abs Δ | cells changed | bottleneck changes |
|---|---|---|---|---|---|---|---|
| fix 2 alone | -0.0123 | 0.4931 | 1825/1900 | 0.0077 | 0.3198 | 1347/1900 | 201 |
| fix 3 alone | -0.0073 | 0.0783 | 1900/1900 | -0.0047 | 0.3897 | 1410/1900 | 74 |
| fix 6a alone | 0 | 0 | 0/1900 | 0.0341 | 0.7286 | 1636/1900 | 0 |
| fix 6b alone, aggregate only | 0 | 0 | 0/1900 | 0.0158 | 0.1330 | 1399/1900 | 0 |
| fix 8 alone | -0.0049 | 0.0602 | 1900/1900 | -0.0017 | 0.0849 | 1401/1900 | 94 |
| seq: fix 6a | 0 | 0 | 0/1900 | 0.0298 | 0.8098 | 1627/1900 | 0 |
| seq: fix 6b | 0 | 0 | 0/1900 | 0.0172 | 0.0972 | 1700/1900 | 0 |
| seq: fix 8 | -0.0016 | 0.0553 | 1900/1900 | -0.0014 | 0.0398 | 1700/1900 | 143 |
| **TOTAL 20.0.1 -> 21.0** | **-0.0219** | **0.4910** | **1900/1900** | **0.0484** | **0.8722** | **1700/1900** | **232** |

The rename, fix 4, fix 5, fix 7 and comment-fix rows are 0 in every column, as in
the tool-default table.

## What each fix did

1. **Layer 1 renamed `saliency` -> `visualComplexity`.** Nothing moved. `ctc-golden`
   also passed against the 20.0.1 pin, Object.is on every number, read through the
   rename.
2. **resilience and selfEfficacy out of frustration.** In the tool default,
   frustration's content gate roughly doubles, so CTC rises (mean +0.0088, max
   +0.108 on emotional-user's text-heavy page). Frustration became the bottleneck
   in 41 of 475 cells, up from 9. Fix 8 later brought that back to 14 (see 8).
   Every persona's CTC rank changes on at least one raw demand.

   **Correction to the fix-2 commit message.** It says the two traits "cost 0 on
   every page". That holds only in the asymmetric mode every tool runs. In the
   symmetric ablation, which bills all surplus, they charged their whole capacity
   squared against a page that asked nothing of them. So across all option sets
   the direction flips: mean -0.0123, max 0.49. The code comment states both modes.
3. **attentionPattern out of layer 1.** CTC falls slightly (mean -0.0057) and
   every cell moves. The term was persona-invariant (0.5 for every persona), but it
   was not a constant added to the total: it set part of layer 1's content gate,
   its depletion of later layers, and the visualComplexity x cognitiveLoad
   interaction. Removing it reorders 20 personas on some raw demand.
4. **Dead demand writes and modulations removed.** Byte-identical golden matrix,
   all four option sets, Schwartz values included.
5. **Logistic clamp removed (found by the dead-constant test).** Byte-identical.
6. **Abandonment.**
   - **(a) No surplus relief.** CTC cannot move. Abandonment rises wherever billed
     surplus sat beside a deficit (mean +0.0153 alone, max +0.21 for impatient-user
     on a long-word page). It is unchanged where there was no surplus; both
     directions are asserted in `tests/ctc-model-21.test.ts`.
   - **(b) Residual tolerance.** It can only raise the risk, because residual
     patience is never above the starting value. That is asserted, and so is "a
     zero deficit stays zero". Mean +0.0150. In the scroll path it compounds with
     depth (+0.0295 mean totalAbandonment).
7. **siteFamiliarity resolved to the caller's value or 0.0.** The chain is
   untouched: the matrix already built personas at 0.0. The last row of the first
   table is the tool behaviour that changed. On a site this install has crawled, a
   run without `siteFamiliarity` used to score familiarity at the 0.5 missing-trait
   fallback and now scores 0.0. That raises CTC by 0.054 on average and abandonment
   by 0.085.
8. **No animation demand at rest.** The motion curve is a logistic centred at 0.3,
   which reads 0.119 at animationLevel 0. Every page with nothing moving still asked
   about 0.107 of changeBlindness and 0.083 of emotionalContagion, and fed
   distractor pressure. The curve is now shifted and rescaled by its own value at 0.

   Small on average (CTC -0.0012, abandonment -0.0015 sequential), but it reaches
   every cell and touches frustration most. A share of fix 2's frustration growth
   was this offset: emotionalContagion carried 0.083 of demand on still pages.
   Without it, frustration is the bottleneck in 14 cells (49 at the first pin) and
   visualComplexity in 73 (41).

   On the empty page every layer cost is now 0, rawCTC is 0 and abandonment is 0.
   totalCTC there is 0.0474, the output logistic's value at raw 0 (centre 1.2,
   slope 2.5), which this fix does not touch.

## The DRO bound is still sound

`tests/dro-bound.test.ts` passes 7/7 on the final code, with 1000 property runs
per soundness test.

`research/latency/dro-sensitivity.ts`, before and after (L = derived Lipschitz
constant, steepest = largest observed one-axis slope):

| page | 20.0.1 L / steepest | 21.0 L / steepest |
|---|---|---|
| empty | 0.0144 / 0.0131 (1.1x) | 0 / 0 (CTC is flat: every layer's demand is 0) |
| light | 0.3733 / 0.1277 (2.9x) | 0.3729 / 0.1298 (2.9x) |
| mid | 1.7951 / 0.6866 (2.6x) | 1.8490 / 0.6820 (2.7x) |
| busy | 5.0304 / 0.9705 (5.2x) | 5.0931 / 0.9913 (5.1x) |
| max | 8.3227 / 0.8168 (10.2x) | 8.2445 / 0.8185 (10.1x) |

L stays above the steepest observed slope everywhere, by about the same margin as
before. The derivation still holds:

- The layers' trait sets are still disjoint.
- Each content gate still depends on demand alone (readingAttention excepted, as
  before).
- The bound reads `LAYER_DEFINITIONS` and `INTERACTION_PAIRS` at call time.

Fixes 6 and 7 do not touch CTC, which is the only thing the bound covers. Fix 8
changes demand only.

## Not changed

`research/study1/*.py` still describe the six-layer 20.x chain (saliency, a
four-trait frustration layer, the offset motion curve). They are frozen copies of
what that study ran and were left as they are.

## 21.x: totalCTC as a percentile against real pages; capacityConsumed as the real drawdown

Measured 2026-10-22 on `feat/b-scale` (base `0a974f1`).

### What changed

- **totalCTC.** It was `1 / (1 + exp(-2.5 (rawCTC - 1.2)))`, with both constants
  hand-set (`chain.ctcSigmoidSlope`, `chain.ctcSigmoidCentre`; both removed from
  the registry and the code). It is now rawCTC's percentile against a reference:
  - the raw cost of every graded reference page for every one of the 25 built-in
    personas, through the live chain, pooled into one distribution;
  - one distribution per scope (viewport, full_page) and per asymmetric x
    interactions pair. Schwartz values and carried capacity do not select a curve;
  - read through a piecewise-linear interpolated ECDF (type-7 inverse, ties at
    their mean rank). It is 0 at and below the cheapest pooled pair and 1 at and
    above the costliest.
- **The reference.** `src/data/ctc-reference-2026-10-22.ts` stores page metrics,
  not scores, so a changed chain constant re-derives the curve.
  - It was crawled by `research/ctc-reference/crawl.ts`: cbrowser's own browser,
    1920x1080, cognitive_effort's blocked-page check, then extractPageMetrics at
    viewport and at full_page.
  - Registered as `ctcReference.viewport` and `ctcReference.full_page`, status
    `definition`, value 111.
- **capacityConsumed.** It was `depletionRate x layerCost` in every case. It is now
  the capacity the layer actually removed, summed over all 30 dimensions (direct
  and indirect). The content gate, the drawdown cap and the floor are all inside
  it.
- **The DRO bound** is on rawCTC. The logistic's slope factor is gone from the
  derivation. A percentile bound is offered too: raw L times the curve's steepest
  slope over [0, rawMax].

The golden matrix was re-pinned in place. Before it was regenerated, the diff
against the previous pin was confined to four fields, 16,570 numbers in all:

| field | numbers changed |
|---|---|
| totalCTC | 2052 |
| capacityConsumed | 13958 |
| screenCTC | 458 |
| reachWeightedCTC | 102 |

Every other number was bit-identical, rawCTC, layer costs, abandonment and
remaining capacity included.

### The crawl

199 sites attempted: 111 graded, 77 blocked, 11 errors.

- **Blocked.** 55 by a block signature in the title or first 500 characters
  ("just a moment", "access denied", "press & hold" and the rest of the tool's
  list), 20 by HTTP status (401, 403, 429), and 2 with no interactive element on
  the whole document (cnn.com, wholefoodsmarket.com).
- **Errors.** Timeouts (netflix, ikea, google, adidas, fedex, rei), DNS failures
  (unitedhealth, chick-fil-a), refused (delta), HTTP/2 protocol error (etrade), and
  an extraction TypeError (walmart).

The blocked share is a selection effect. Retail, media, travel, fashion and real
estate are over-represented among the blocked, and this server's IP is plainly on
several bot lists. The reference describes "the web that lets cbrowser in from
here", not the web.

The first pass lost 127 sites to "no result". The tree was being edited
mid-crawl, and the worker processes could not import it. Those 127 were crawled
again, once, from an isolated snapshot (`crawl.ts --resume`). The snapshot's
measurement code (browser.ts, config.ts, cognitive-transport.ts) is byte-identical
to `0a974f1`.

### Distribution of totalCTC, before and after

`bun research/ctc-percentile-deltas.ts --before-pin <git show 0a974f1:tests/fixtures/ctc-golden-21.0.0.json>`

"Before" is the old logistic on today's rawCTC. The script checked it against the
previous pin: 1900 of 1900 cells match bit for bit, and rawCTC is unchanged.

Golden matrix, 25 human personas x 19 demands x 4 option sets:

| | min / p10 / p25 / median / p75 / p90 / max | above 0.95 | below 0.05 |
|---|---|---|---|
| before, all 1900 | 0.047 / 0.058 / 0.089 / 0.187 / 0.475 / 0.806 / 1.000 | 102 (5.4%) | 175 (9.2%) |
| after, all 1900 | 0.000 / 0.000 / 0.273 / 0.561 / 0.819 / 0.958 / 1.000 | 201 (10.6%) | 256 (13.5%) |
| before, tool default (475) | 0.047 / 0.047 / 0.082 / 0.146 / 0.296 / 0.653 / 1.000 | 25 (5.3%) | 50 (10.5%) |
| after, tool default (475) | 0.000 / 0.000 / 0.247 / 0.547 / 0.792 / 0.943 / 1.000 | 45 (9.5%) | 69 (14.5%) |

After the change, 53 golden cells (2.8%) are exactly 1, costlier than any real
(page, persona) pair, and 191 (10.1%) are exactly 0. The empty, sparse and
gate-edge pages are lighter than any real first screen.

Reference pages, 111 pages x 25 personas = 2775 pairs, tool default:

| scope | | min / p10 / p25 / median / p75 / p90 / max | above 0.95 | below 0.05 |
|---|---|---|---|---|
| viewport | before | 0.055 / 0.068 / 0.083 / 0.133 / 0.252 / 0.503 / 0.987 | 11 (0.4%) | 0 |
| viewport | after | 0.000 / 0.100 / 0.250 / 0.500 / 0.750 / 0.900 / 1.000 | 139 (5.0%) | 139 (5.0%) |
| full_page | before | 0.060 / 0.114 / 0.201 / 0.415 / 0.715 / 0.917 / 0.999 | 193 (7.0%) | 0 |
| full_page | after | 0.000 / 0.100 / 0.250 / 0.500 / 0.750 / 0.900 / 1.000 | 139 (5.0%) | 139 (5.0%) |

**What the logistic was actually doing.** The measured defect is compression at
the bottom, not saturation at the top.

- On the golden matrix only 5.4% of cells sat above 0.95.
- On real first screens, half of all (page, persona) scores fell between 0.055
  and 0.133.
- The logistic's floor at raw 0 is 0.047, so no page could score below it.

A "0.2" read as low while it was costlier than about two thirds of real
(first screen, persona) pairs (0.676 on the new scale). At full_page the logistic used its range better (median 0.415, 7%
above 0.95).

The percentile spreads real pages evenly by construction. On the golden matrix it
puts more cells above 0.95 than before (10.6% against 5.4%). The golden pages
include synthetic extremes (max, dense, control-heavy) that are costlier than
anything in the reference. Those cells now read 1, "costlier than every reference
page", instead of 0.99 on a curve nobody fitted.

Spearman rho between old and new totalCTC, per persona:

- **Tool default, 19 golden pages.** 1.0000 for 24 personas and 0.9987 for
  careful-reader. Within one option set and scope, both scales are monotone in
  rawCTC; the one tie is at the percentile's end.
- **All four option sets, 76 cells.** 0.8542 (mobile-user) to 0.9837
  (power-user). Each asymmetric/interactions pair now has its own reference
  curve, so a symmetric cost is ranked among symmetric costs. Under the logistic
  the four option sets shared one scale.
- **Reference pages, 111 per scope.** 1.0000 for every persona.

Persona spread survives the pooling. On the reference pages, the per-persona
median totalCTC runs:

- viewport: 0.128 (color-blind-deuteranopia) to 0.874 (intellectual-disability);
  the same two personas read 0.071 and 0.433 before;
- full_page: 0.099 (mobile-user) to 0.913 (intellectual-disability).

### What a threshold on the old scale means now

Old thresholds converted through rawCTC (tool default options):

| old totalCTC (logistic) | rawCTC | new totalCTC, viewport | new totalCTC, full_page |
|---|---|---|---|
| 0.0474 | 0.000 | 0.000 | 0.000 |
| 0.3 | 0.861 | 0.795 | 0.381 |
| 0.5 | 1.200 | 0.899 | 0.576 |
| 0.6 | 1.362 | 0.930 | 0.663 |
| 0.7 | 1.539 | 0.955 | 0.739 |
| 0.8 | 1.755 | 0.974 | 0.806 |

A band defined on the old scale ("total < 0.3 comfortable") covered about 80% of
real first screens. The same number on the new scale covers 30%. Keeping the old
verdicts means different thresholds per scope, because full-page raw costs run
higher. Defining the bands as percentiles ("costlier than 90% of real pages")
needs no conversion. Either is a decision about the verdict text, not about the
chain.

### capacityConsumed

Red first, on `0a974f1`, with the new tests in `tests/capacity-depletion.test.ts`:
4 fail, 7 pass. After the change: 11 pass.

- **A light page with every layer gated off.** Before, it reported 0.00091
  (visualComplexity) and 0.00078 (frustration) while nothing was drawn. It now
  reports 0, and the remaining capacity equals the starting capacity.
- **A heavy layer.** This is boundary-floor on the second of two maximal screens:
  cognitiveLoad costs 3.36, so depletionRate x cost is 0.504, above the 0.5 cap.
  It now reports exactly the capacity removed under the cap.
- **All dimensions at 0.** The floor lifts every dimension to 1e-4 and nothing can
  be drawn. It reports 0 on every layer; depletionRate x cost was about 0.5.

Units changed from a fraction to capacity summed over dimensions. Across the
tool-default golden cells the mean per layer went from 0.0142 to 0.0969, mostly
from the indirect share. In the old figure that share was not there at all, and
it is the part later layers on the same page feel.

### The DRO bound

`tests/dro-bound.test.ts` passes 38 of 38. The adversary's tightest observed/bound
ratio per page is 0.970 to 0.99995 on rawCTC, and 80 upward populations reach
0.9708 of epsilon x L.

`tests/dro-bound-mutants.test.ts` passes 20 of 20. Every must-kill mutant is
killed on 3 of 3 seeds; M11 and M14 survive, informational, as before. M4 (sigma'
at rawMax) is retired: the code it mutated is gone.

`research/latency/dro-sensitivity.ts`, on rawCTC now:

| page | L / steepest observed |
|---|---|
| empty | 0 / 0 (flat) |
| light | 0.5989 / 0.5071 (1.2x) |
| mid | 2.9585 / 1.1607 (2.5x) |
| busy | 8.1490 / 2.0128 (4.0x) |
| max | 13.1912 / 3.0633 (4.3x) |

**The percentile bound is sound and nearly vacuous.**

- The viewport curve's steepest segment has slope 7429.6. Two of its 2775 knots
  sit 4.85e-8 apart; the median gap is 2.79e-4. On the mid page that gives
  L_pct = 2.9585 x 7429.6 = 21,980, and the full_page curve's slope is 494.4.
- The steepest totalCTC slope any search found was 5.37, which is 3.5e-4 of the
  bound.
- The upper bound is capped at 1, so with any realistic epsilon it reads 1.

It is offered because it is cheap and correct. A useful bound on the percentile
would need the curve's modulus of continuity at the scale of epsilon x L, not its
worst single segment.

### Cost

- One curve (111 pages x 25 personas) takes 19 ms to build. There are at most
  2 scopes x 4 option pairs, each built once per process.
- A scored call with the curve cached costs 8.2 microseconds, against 7.9 before.
- `tests/ctc-no-dead-constants.test.ts` rebuilds the curves for every perturbed
  constant, so it takes 7.1 s instead of 2.1 s.

## Reference v2: 513 real pages, raw format 2

Measured 2026-10-24. The full numbers are in
`research/ctc-reference/deltas-v2-2026-10-24.txt`, written by
`research/ctc-reference/deltas-v2.ts`. The v1 comparisons below come from
that report's first edition (`890e93f`, before Stage B). The chain can no
longer score v1 pages, because Stage B's demand needs law times that v1's
stored metrics do not carry.

### What changed

- **The reference stores raw measurements.** It no longer stores normalised
  metrics. `src/data/ctc-reference-v2-2026-10-24.ts` holds what
  `measurePageRaw` returned (raw format 2), and the curve derives each page's
  metrics through `deriveMetrics` at load. A changed page-metric normaliser
  now moves the curve, as a chain constant does. The measure-stage constants
  are recorded with the data, and a live value that differs is refused.
- **Raw format 2** fixes five things at measurement time:
  - prose is counted once (the outermost matching element only);
  - a language picker is not read as the page's script (www.w3.org read as
    CJK);
  - each choice sits in one group only, and the nav totals are uncapped
    (`navGroupCount`, `navLinks`, `groupedLinks`);
  - the prose inside nav and composite groups is reported apart
    (`proseInNav`), so the reading law can leave out the menu labels the
    choosing law already reads;
  - the grouped links a sighted user can read are counted
    (`groupedLinksWithText`: drawn text with a letter, so icons, aria-labels
    and visually-hidden words do not count).

  The loader refuses a record without these fields, and names the missing
  ones. It also refuses a record of any other layout.
- **Three sampling frames:** the v1 brand list; a seeded draw from Tranco list
  746PX, 60 domains per rank band; and government and nonprofit sites (CISA's
  .gov registry, USAGov's state pages, Wikidata).
- **Six page types.** Each site contributes its landing page plus up to five
  inner pages found from its own links and forms. Forms are loaded and never
  submitted, except a search GET with the query "help".
- **Every graded page counts once, unweighted.** Alexa chose this over
  weighting the frame and type cells, and over another crawl to fill them.
  The crawl's quotas, not the curve, keep the counts near balance.
- **totalCTCInterval.** Every score carries a 95% interval for its
  percentile: 1,000 bootstrap resamples of the reference pages, each page
  with all its personas, seeded. The verdict sentence states it.

### The crawl

From a frozen export of `44d70a7` (2026-10-24, 01:34 to 02:20 UTC): 778 pages
attempted, 513 graded (171 per frame), 99 blocked, 109 disallowed by
robots.txt, 30 errors, 27 excluded (Tranco filters and duplicates).

| page type | graded | brand | tranco | public |
|---|---|---|---|---|
| landing | 162 | 56 | 59 | 47 |
| form | 91 | 31 | 26 | 34 |
| search | 56 | 12 | 23 | 21 |
| article | 106 | 37 | 33 | 36 |
| help | 90 | 32 | 26 | 32 |
| cart | 8 | 3 | 4 | 1 |

- **Routing.** Direct first. The residential proxy was used only after a
  blocked direct attempt, and never for .gov or .mil: 117 pages, 27 of them
  graded, 219 MB of the 3 GB budget.
- **robots.txt** was honoured for every page.
- **The record.** Every attempted page is listed with its outcome, reason,
  route and bytes.
- **The gaps.** Search stops short of its 40-per-frame cap, and cart pages
  are rare. Both are reported, not reweighted.

### What it moved

- **The interval.** Its width at the median is 5.3 points at viewport
  (11.6 on v1) and 5.2 at full_page (10.1). At the 80th percentile it is 4.1
  (9.5) and 3.5 (6.6).
- **Grouped links a sighted user can read.** The share of a page's grouped
  links with drawn text, over the pages that have any:
  - at viewport, median 0.900, p90 1.000, p10 0.088;
  - at full_page, median 0.923, p90 1.000, p10 0.120.

  10 pages at viewport (6 at full_page) have grouped links and none with
  text; 139 (119) have no grouped link. Pooled over all pages, only 54% of
  grouped links (52%) have text: the few pages with many icon links carry
  most of the icons.
- **Menu labels in the prose.** The share of each page's prose words that sit
  in nav or composite groups:
  - at viewport, median 0.063 and p90 0.400;
  - at full_page, median 0.024 and p90 0.249;
  - 184 and 164 of 513 pages have none.
- **Crawl to crawl.** The same frames crawled from `711f0b4` (a few hours
  earlier, before `groupedLinksWithText`) and from `44d70a7` give nearly the
  same curve. Each old quantile's raw cost ranks within 0.8 points of its old
  percentile on the new curve, at both scopes. deriveMetrics does not read
  the new field, so this is the crawl's own variation.
- **Against v1** (first edition, `890e93f`):
  - the golden matrix moved per human persona by a mean of -0.005 to 0.000,
    largest absolute change 0.009 to 0.022, Spearman 0.9979 to 0.9999;
  - the v1 landing pages re-ranked moved -0.003 at viewport and +0.098 at
    full_page.
- **The prose fix,** on the 446 pages graded in both the format-1 and the
  format-2 crawls: the median change of every readability metric is 0, and
  the mean absolute change is 0.005 to 0.030 at viewport. No page changed
  script family.
- **Choice groups,** on the same DOM: 70 of 513 pages had a group inside
  another group at viewport (76 at full_page). Format 1 counted 1,117 groups
  where there are 840 at viewport.
- **Cost.** One curve, 513 pages x 25 personas plus the page bootstrap, takes
  about 110 ms to build (19 ms on v1). It is built at most 8 times per process.
