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
