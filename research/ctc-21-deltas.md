# CTC 21.0: what each fix moved

Measured 2026-10-21 on `feat/fix2-model`, before the golden matrix was re-pinned to
`tests/fixtures/ctc-golden-21.0.0.json`. These are changes in the model's own
output. CTC has not been tested against human data, so none of this says whether
21.0 predicts people better than 20.0.1. It says how far, and where, the numbers
moved when the contradictions were removed.

## Method

- **Inputs.** The 21.0 golden-matrix inputs (`tests/fixtures/ctc-golden-matrix.ts`):
  the 25 human personas built the way `cognitive_effort` builds them, 19 pages (the
  12 raw-metric demands, 2 prose pages, 4 pages where one readability term is the
  largest, 1 gate-edge page), the 4 option sets, and the 4 scroll inputs. The two
  synthetic boundary personas are excluded.
- **Trees.** Each tree is `git archive <commit> src` with the same matrix file
  copied in, so the inputs are identical and only the chain code differs.
  Sequential rows compare a commit with its parent. "Alone" rows take the 21.0 base
  (`d73e7b9`, the rename, which moves no number; first row) and apply one fix's
  diff of `cognitive-transport-chain.ts` and `provenance/chain.ts`. That diff
  applied cleanly for fixes 2, 3 and 6a. Fix 6b's diff depends on 6a's text, so its
  "alone" row is a hand edit of the base's aggregate tolerance only. The base scroll
  path kept its own tolerance copy (6a removed it), which is why that row's scroll
  columns read 0.
- **Rank moves.** For each of the 12 raw demands, the 25 personas are ranked by
  the value under the tool default options (competition ranking, so ties are
  stable). "Personas (moves)" is the number of personas whose rank changed on at
  least one of the 12, and the number of (demand, persona) positions that changed,
  out of 300. The rank and scroll columns always use the tool default, so they
  match in both tables.
- **Command.** `bun research/ctc-21-deltas.ts label=<fromTree>,<toTree> ... --familiarity <finalTree>`

## Tool default (asymmetric + interactions, what every tool runs): 475 cells

| comparison | totalCTC mean Δ | totalCTC max abs Δ | cells changed | abandonment mean Δ | abandonment max abs Δ | cells changed | bottleneck changes | rank moves, CTC: personas (moves) | rank moves, abandonment: personas (moves) | scroll totalAbandonment mean Δ | scroll max abs Δ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| rename (20.0.1 -> 21 base) | 0 | 0 | 0/475 | 0 | 0 | 0/475 | 0 | 0 (0) | 0 (0) | 0 | 0 |
| fix 2 alone (frustration traits) | 0.0088 | 0.1076 | 450/475 | 0.0029 | 0.1471 | 356/475 | 32 | 25 (133) | 25 (95) | 0.0108 | 0.1950 |
| fix 3 alone (attentionPattern) | -0.0057 | 0.0602 | 475/475 | -0.0051 | 0.2128 | 385/475 | 20 | 20 (29) | 25 (78) | -0.0084 | 0.0820 |
| fix 6a alone (no surplus relief) | 0 | 0 | 0/475 | 0.0153 | 0.2102 | 405/475 | 0 | 0 (0) | 25 (112) | 0.0196 | 0.2290 |
| fix 6b alone, aggregate only (residual tolerance) | 0 | 0 | 0/475 | 0.0143 | 0.0616 | 381/475 | 0 | 0 (0) | 24 (64) | 0 | 0 |
| seq: fix 2 | 0.0088 | 0.1076 | 450/475 | 0.0029 | 0.1471 | 356/475 | 32 | 25 (133) | 25 (95) | 0.0108 | 0.1950 |
| seq: fix 3 | -0.0059 | 0.0597 | 475/475 | -0.0050 | 0.1861 | 382/475 | 14 | 23 (35) | 25 (76) | -0.0081 | 0.0780 |
| seq: fix 4 (dead demand) | 0 | 0 | 0/475 | 0 | 0 | 0/475 | 0 | 0 (0) | 0 (0) | 0 | 0 |
| seq: fix 5 (clamp removed) | 0 | 0 | 0/475 | 0 | 0 | 0/475 | 0 | 0 (0) | 0 (0) | 0 | 0 |
| seq: fix 6a | 0 | 0 | 0/475 | 0.0163 | 0.2045 | 406/475 | 0 | 0 (0) | 25 (113) | 0.0215 | 0.1910 |
| seq: fix 6b | 0 | 0 | 0/475 | 0.0150 | 0.0622 | 425/475 | 0 | 0 (0) | 24 (79) | 0.0295 | 0.1460 |
| seq: fix 7 (chain) | 0 | 0 | 0/475 | 0 | 0 | 0/475 | 0 | 0 (0) | 0 (0) | 0 | 0 |
| **TOTAL 20.0.1 -> 21.0** | **0.0029** | **0.0978** | **475/475** | **0.0292** | **0.3287** | **425/475** | **46** | **25 (112)** | **25 (142)** | **0.0538** | **0.4200** |
| fix 7, tool behaviour on a crawled site: before (unset, read as 0.5) -> after (0.0) | 0.0541 | 0.3182 | 425/475 | 0.0850 | 0.5252 | 425/475 | 157 | 20 (37) | 25 (197) | 0.0631 | 0.3550 |

Means over the tool-default cells: totalCTC 0.2456 -> 0.2485, abandonmentRisk
0.2559 -> 0.2852.

Bottleneck layer across the 475 tool-default cells:

| layer | 20.0.1 | after fix 2 | 21.0 |
|---|---|---|---|
| visualComplexity (saliency in 20.0.1) | 78 | 55 | 41 |
| cognitiveLoad | 263 | 257 | 258 |
| decision | 119 | 116 | 121 |
| motorProcedure | 6 | 6 | 6 |
| frustration | 9 | 41 | 49 |

## All four option sets: 1900 cells

| comparison | totalCTC mean Δ | totalCTC max abs Δ | cells changed | abandonment mean Δ | abandonment max abs Δ | cells changed | bottleneck changes |
|---|---|---|---|---|---|---|---|
| fix 2 alone | -0.0123 | 0.4931 | 1825/1900 | 0.0077 | 0.3198 | 1347/1900 | 201 |
| fix 3 alone | -0.0073 | 0.0783 | 1900/1900 | -0.0047 | 0.3897 | 1410/1900 | 74 |
| fix 6a alone | 0 | 0 | 0/1900 | 0.0341 | 0.7286 | 1636/1900 | 0 |
| fix 6b alone, aggregate only | 0 | 0 | 0/1900 | 0.0158 | 0.1330 | 1399/1900 | 0 |
| seq: fix 6a | 0 | 0 | 0/1900 | 0.0298 | 0.8098 | 1627/1900 | 0 |
| seq: fix 6b | 0 | 0 | 0/1900 | 0.0172 | 0.0972 | 1700/1900 | 0 |
| **TOTAL 20.0.1 -> 21.0** | **-0.0203** | **0.4954** | **1900/1900** | **0.0498** | **0.8713** | **1700/1900** | **251** |

The rename, fix 4, fix 5 and fix 7 rows are 0 in every column, as in the tool-default table.

## What each fix did

1. **Layer 1 renamed `saliency` -> `visualComplexity`.** Nothing moved. `ctc-golden`
   also passed against the 20.0.1 pin, Object.is on every number, read through the
   rename.
2. **resilience and selfEfficacy out of frustration.** In the tool default,
   frustration's content gate roughly doubles, so CTC rises (mean +0.0088, max
   +0.108 on emotional-user's text-heavy page). Frustration becomes the bottleneck
   in 41 of 475 cells, up from 9. Every persona's CTC rank changes on at least one
   raw demand (133 of 300 positions). **Correction to the fix-2 commit message.**
   It says the two traits "cost 0 on every page". That holds only in the
   asymmetric mode every tool runs. In the symmetric ablation, which bills all
   surplus, they charged their whole capacity squared against a page that asked
   nothing of them. So across all option sets the direction flips: mean -0.0123,
   max 0.49 (confident-user, technical prose, symmetric). The code comment states
   both modes.
3. **attentionPattern out of layer 1.** CTC falls slightly (mean -0.0057) and
   every cell moves. The term was persona-invariant (0.5 for every persona), but
   removing it still reorders 20 personas on some raw demand. It was not a constant
   added to the total: it set part of layer 1's content gate, its depletion of
   later layers, and the visualComplexity x cognitiveLoad interaction.
4. **Dead demand writes and modulations removed.** Byte-identical golden matrix,
   all four option sets, Schwartz values included.
5. **Logistic clamp removed (found by the dead-constant test).** Byte-identical.
6. **Abandonment.**
   - **(a) No surplus relief.** CTC cannot move. Abandonment rises wherever billed
     surplus sat beside a deficit (mean +0.0153 alone, max +0.21 for impatient-user
     on a long-word page). It is unchanged where there was no surplus; both
     directions are asserted in `tests/ctc-model-21.test.ts`. Scroll
     totalAbandonment rises +0.0196 on average.
   - **(b) Residual tolerance.** It can only raise the risk, because residual
     patience is never above the starting value; that is asserted, and so is "a
     zero deficit stays zero". Mean +0.0150. In the scroll path it compounds with
     depth (+0.0295 mean totalAbandonment), because each screen is judged against
     the patience the earlier screens left.
7. **siteFamiliarity resolved to the caller's value or 0.0.** The chain is
   untouched: the matrix already built personas at 0.0. The last row of the first
   table is the tool behaviour that changed. On a site this install has crawled, a
   run without `siteFamiliarity` used to score familiarity at the 0.5 missing-trait
   fallback and now scores 0.0. That raises CTC by 0.054 on average (max 0.318) and
   abandonment by 0.085, and changes the bottleneck in 157 of 475 cells.

## The DRO bound is still sound

`tests/dro-bound.test.ts` passes 7/7 on the final code, with 1000 property runs
per soundness test. `research/latency/dro-sensitivity.ts`, before and after
(L = derived Lipschitz constant, steepest = largest observed one-axis slope):

| page | 20.0.1 L / steepest | 21.0 L / steepest |
|---|---|---|
| empty | 0.0144 / 0.0131 (1.1x) | 0.0272 / 0.0233 (1.2x) |
| light | 0.3733 / 0.1277 (2.9x) | 0.3786 / 0.1351 (2.8x) |
| mid | 1.7951 / 0.6866 (2.6x) | 1.8662 / 0.6834 (2.7x) |
| busy | 5.0304 / 0.9705 (5.2x) | 5.1028 / 0.9960 (5.1x) |
| max | 8.3227 / 0.8168 (10.2x) | 8.2457 / 0.8185 (10.1x) |

On every page L stays above the steepest observed slope, by about the same
margin. The derivation still holds:

- The layers' trait sets are still disjoint.
- Each content gate still depends on demand alone (readingAttention excepted, as before).
- The bound reads `LAYER_DEFINITIONS` and `INTERACTION_PAIRS` at call time.

Fix 6 does not touch CTC, which is the only thing the bound covers.

## Not changed

`research/study1/*.py` still describe the six-layer 20.x chain (saliency, a
four-trait frustration layer). They are frozen copies of what that study ran and
were left as they are.
