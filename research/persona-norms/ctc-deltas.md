# What the norm-anchored values moved in the CTC golden matrix

Two persona values changed (research/persona-norms/applied.md):

- cognitive-adhd workingMemory, 0.30 -> 0.37;
- autism-spectrum workingMemory, 0.60 -> 0.32.

This file reports what that moved in `tests/fixtures/ctc-golden-21.0.0.json`.

**The two pins compared.**

- **Before:** the pin at `1560963`, the tip of `feat/persona-anchors` before
  this change. Before regenerating, I checked it in a clean export of
  `1560963`: `tests/ctc-golden.test.ts` passes 56/0, so it describes that
  commit's code.
- **After:** regenerated with `bun tests/fixtures/generate-ctc-golden.ts` on
  this commit. The golden test passes 56/0 against it.

**How it was computed.** `research/persona-norms/ctc-deltas.ts` (counts,
rawCTC/totalCTC/abandonmentRisk, fields) and `research/persona-21-ctc-deltas.ts`
(rank moves, bottleneck and scroll columns).

```
git show 1560963:tests/fixtures/ctc-golden-21.0.0.json > /tmp/before.json
bun research/persona-norms/ctc-deltas.ts /tmp/before.json tests/fixtures/ctc-golden-21.0.0.json
bun research/persona-21-ctc-deltas.ts /tmp/before.json tests/fixtures/ctc-golden-21.0.0.json
```

**Two kinds of movement, kept apart.** totalCTC is a percentile of rawCTC in
a reference that pools all 25 built-in personas' raw costs on the reference
pages (`ctcReference.*` provenance). Changing two personas therefore moves the
curve, and with it every persona's percentile fields. The questions are:

1. what each changed persona's own raw costs did;
2. what the curve shift did to everyone else.

## 1. The changed personas' own costs

Only cognitive-adhd and autism-spectrum change in any raw field: rawCTC,
additiveCTC, deficit and surplus cost, layer transport costs and capacity,
trait costs, interactions, remaining capacity and the scroll model.

| persona | rawCTC mean d | rawCTC max abs d (page) | totalCTC mean d | totalCTC max abs d | abandonmentRisk mean d | abandonmentRisk max abs d | bottleneck changes | scroll totalAbandonment mean d (max abs) |
|---|---|---|---|---|---|---|---|---|
| cognitive-adhd (WM up) | -0.0285 | 0.1082 (max) | -0.0119 | 0.0300 (choice-heavy) | -0.0149 | 0.0470 | 0 | -0.0145 (0.0530) |
| autism-spectrum (WM down) | +0.0806 | 0.4059 (max) | +0.0285 | 0.2109 (dominant-avgSentenceLength) | +0.0301 | 0.1594 | 1 (max: decision -> cognitiveLoad) | +0.0350 (0.1200) |

Those figures are for the tool's default options (asym+inter), over the 19
demands. Over all four option sets (76 cells):

- **cognitive-adhd:** totalCTC max abs 0.0499 (deep, symmetric); 1
  bottleneck change.
- **autism-spectrum:** totalCTC max abs 0.2152 (dominant-avgSentenceLength,
  asym+inter+values); 8 bottleneck changes.

**The direction is the expected one.** More working memory lowers the ADHD
persona's cost, and less raises the autistic persona's. The effect
concentrates where the chain's cognitive-load layer reads working memory:

- **autism-spectrum, largest:**
  - text-heavy: rawCTC 0.602 -> 0.806, abandonmentRisk 0.288 -> 0.447;
  - dominant-avgSentenceLength: 0.276 -> 0.470, abandonment 0.056 -> 0.189;
  - deep: 0.851 -> 1.030, abandonment 0.489 -> 0.594;
  - technical-prose: 1.012 -> 1.174.
- **cognitive-adhd, largest:**
  - dense: 1.365 -> 1.297;
  - text-heavy: 1.227 -> 1.160;
  - dominant-avgSentenceLength: 0.903 -> 0.838, abandonment 0.750 -> 0.703.
- **Pages with no cognitive load do not move.** On empty, sparse, light and
  gate-edge, rawCTC is unchanged for both.

**Rank moves among the 25 human personas** on the 12 raw demands, tool
default options, competition ranking where 1 = costliest:

| persona | moves |
|---|---|
| cognitive-adhd | mid 13 -> 16; deep 9 -> 12; dense 16 -> 17; max 1 -> 17 |
| autism-spectrum | mid 8 -> 7; text-heavy 15 -> 12; choice-heavy 4 -> 3; deep 11 -> 6; dense 5 -> 3 |

**The max move is a tie at the cap, not a large change.** On the max demand,
16 personas score totalCTC = 1.0000, the costliest end of the reference.
cognitive-adhd's rawCTC fell 2.976 -> 2.868, which takes its totalCTC from
1.0000 to 0.9996. Under competition ranking it drops from the tie for 1st to
17th.

## 2. Everyone else: the percentile curve moved

The other 23 human personas and the two boundary personas changed in no raw
field.

- **Fields that moved:**
  - 24 personas: totalCTC, per-screen screenCTC and the scroll
    reachWeightedCTC;
  - boundary-sparse: totalCTC and screenCTC only.
- **Not one other number moved:** not rawCTC, not abandonmentRisk, not
  bottleneckLayer. abandonmentRisk does not read the percentile.
- **Size of the shift:** the largest is 0.0036 in totalCTC (first-timer and
  dyscalculia, over all option sets). Mean shifts run from -0.0001 to
  -0.0010, all negative. The autistic persona's raw costs rose more than the
  ADHD persona's fell, so the pooled reference moved toward higher costs and
  everyone else's percentile fell slightly.

This part of the movement depends on the reference data. The ref-v2 work
replaces that data, and the golden will be regenerated again at
integration. Section 1's raw-cost deltas do not depend on the reference.
Section 2's percentile deltas will change with it.

### Per persona, tool default (asym+inter), 19 demands

| persona | rawCTC mean d | rawCTC max abs d | totalCTC mean d | totalCTC max abs d | totalCTC cells changed | abandonmentRisk mean d | abandonmentRisk max abs d |
|---|---|---|---|---|---|---|---|
| power-user | 0 | 0 | -0.0004 | 0.0018 | 12/19 | 0 | 0 |
| first-timer | 0 | 0 | -0.0010 | 0.0032 | 15/19 | 0 | 0 |
| mobile-user | 0 | 0 | -0.0008 | 0.0026 | 15/19 | 0 | 0 |
| screen-reader-user | 0 | 0 | -0.0003 | 0.0029 | 13/19 | 0 | 0 |
| elderly-user | 0 | 0 | -0.0004 | 0.0029 | 14/19 | 0 | 0 |
| impatient-user | 0 | 0 | -0.0008 | 0.0029 | 16/19 | 0 | 0 |
| distracted-user | 0 | 0 | -0.0008 | 0.0022 | 15/19 | 0 | 0 |
| careful-reader | 0 | 0 | -0.0002 | 0.0027 | 13/19 | 0 | 0 |
| explorer | 0 | 0 | -0.0005 | 0.0018 | 15/19 | 0 | 0 |
| task-focused | 0 | 0 | -0.0002 | 0.0014 | 12/19 | 0 | 0 |
| motor-impairment-tremor | 0 | 0 | -0.0001 | 0.0022 | 15/19 | 0 | 0 |
| low-vision-magnified | 0 | 0 | -0.0007 | 0.0028 | 13/19 | 0 | 0 |
| cognitive-adhd | -0.0285 | 0.1082 | -0.0119 | 0.0300 | 16/19 | -0.0149 | 0.0470 |
| dyslexic-user | 0 | 0 | -0.0008 | 0.0018 | 15/19 | 0 | 0 |
| deaf-user | 0 | 0 | -0.0004 | 0.0032 | 13/19 | 0 | 0 |
| elderly-low-vision | 0 | 0 | -0.0007 | 0.0022 | 13/19 | 0 | 0 |
| color-blind-deuteranopia | 0 | 0 | -0.0001 | 0.0025 | 13/19 | 0 | 0 |
| autism-spectrum | 0.0806 | 0.4059 | 0.0285 | 0.2109 | 14/19 | 0.0301 | 0.1594 |
| intellectual-disability | 0 | 0 | -0.0004 | 0.0022 | 14/19 | 0 | 0 |
| aphasia-receptive | 0 | 0 | -0.0009 | 0.0032 | 15/19 | 0 | 0 |
| dyscalculia | 0 | 0 | -0.0006 | 0.0032 | 14/19 | 0 | 0 |
| anxious-user | 0 | 0 | -0.0008 | 0.0025 | 14/19 | 0 | 0 |
| confident-user | 0 | 0 | -0.0006 | 0.0031 | 12/19 | 0 | 0 |
| emotional-user | 0 | 0 | -0.0007 | 0.0018 | 15/19 | 0 | 0 |
| stoic-user | 0 | 0 | -0.0003 | 0.0022 | 14/19 | 0 | 0 |
| boundary-floor | 0 | 0 | -0.0005 | 0.0018 | 6/19 | 0 | 0 |
| boundary-sparse | 0 | 0 | -0.0002 | 0.0026 | 10/19 | 0 | 0 |

### Per persona, all four option sets, 19 demands x 4

| persona | rawCTC mean d | rawCTC max abs d | totalCTC mean d | totalCTC max abs d | totalCTC cells changed | abandonmentRisk mean d | abandonmentRisk max abs d |
|---|---|---|---|---|---|---|---|
| power-user | 0 | 0 | -0.0005 | 0.0022 | 53/76 | 0 | 0 |
| first-timer | 0 | 0 | -0.0007 | 0.0036 | 59/76 | 0 | 0 |
| mobile-user | 0 | 0 | -0.0006 | 0.0029 | 62/76 | 0 | 0 |
| screen-reader-user | 0 | 0 | -0.0003 | 0.0029 | 53/76 | 0 | 0 |
| elderly-user | 0 | 0 | -0.0005 | 0.0029 | 57/76 | 0 | 0 |
| impatient-user | 0 | 0 | -0.0008 | 0.0029 | 61/76 | 0 | 0 |
| distracted-user | 0 | 0 | -0.0007 | 0.0025 | 63/76 | 0 | 0 |
| careful-reader | 0 | 0 | -0.0001 | 0.0029 | 49/76 | 0 | 0 |
| explorer | 0 | 0 | -0.0005 | 0.0024 | 58/76 | 0 | 0 |
| task-focused | 0 | 0 | -0.0003 | 0.0029 | 50/76 | 0 | 0 |
| motor-impairment-tremor | 0 | 0 | -0.0002 | 0.0025 | 56/76 | 0 | 0 |
| low-vision-magnified | 0 | 0 | -0.0004 | 0.0029 | 51/76 | 0 | 0 |
| cognitive-adhd | -0.0275 | 0.1082 | -0.0115 | 0.0499 | 66/76 | -0.0145 | 0.0470 |
| dyslexic-user | 0 | 0 | -0.0006 | 0.0029 | 58/76 | 0 | 0 |
| deaf-user | 0 | 0 | -0.0003 | 0.0032 | 55/76 | 0 | 0 |
| elderly-low-vision | 0 | 0 | -0.0007 | 0.0028 | 57/76 | 0 | 0 |
| color-blind-deuteranopia | 0 | 0 | -0.0002 | 0.0029 | 54/76 | 0 | 0 |
| autism-spectrum | 0.0722 | 0.4059 | 0.0273 | 0.2152 | 58/76 | 0.0306 | 0.1595 |
| intellectual-disability | 0 | 0 | -0.0004 | 0.0022 | 56/76 | 0 | 0 |
| aphasia-receptive | 0 | 0 | -0.0007 | 0.0033 | 58/76 | 0 | 0 |
| dyscalculia | 0 | 0 | -0.0004 | 0.0036 | 54/76 | 0 | 0 |
| anxious-user | 0 | 0 | -0.0007 | 0.0029 | 56/76 | 0 | 0 |
| confident-user | 0 | 0 | -0.0006 | 0.0032 | 56/76 | 0 | 0 |
| emotional-user | 0 | 0 | -0.0006 | 0.0025 | 57/76 | 0 | 0 |
| stoic-user | 0 | 0 | -0.0003 | 0.0031 | 55/76 | 0 | 0 |
| boundary-floor | 0 | 0 | -0.0004 | 0.0018 | 23/76 | 0 | 0 |
| boundary-sparse | 0 | 0 | -0.0002 | 0.0029 | 45/76 | 0 | 0 |

### Fields that changed, whole matrix (11,351 values)

| field | personas | values | max abs d |
|---|---|---|---|
| runs.remainingCapacity[] | 2 | 3680 | 0.2800 |
| runs.totalCTC | 27 | 1480 | 0.2152 |
| runs.traitCosts[] | 2 | 1289 | 0.2576 |
| scroll.screens[].remainingCapacity[] | 2 | 988 | 0.2746 |
| runs.layers[].capacityConsumed | 2 | 800 | 0.2177 |
| runs.layers[].transportCost | 2 | 649 | 0.2465 |
| runs.layers[].headroom | 2 | 399 | 0.0560 |
| scroll.screens[].screenCTC | 27 | 252 | 0.1520 |
| scroll.screens[].layers[].capacityConsumed | 2 | 211 | 0.2132 |
| scroll.screens[].layers[].transportCost | 2 | 193 | 0.2737 |
| scroll.screens[].layers[].headroom | 2 | 141 | 0.0560 |
| runs.rawCTC | 2 | 126 | 0.4059 |
| runs.additiveCTC | 2 | 126 | 0.3226 |
| runs.abandonmentRisk | 2 | 124 | 0.1595 |
| runs.deficitCost | 2 | 121 | 0.3226 |
| runs.surplusCost | 2 | 118 | 0.0626 |
| runs.interactions.cognitiveLoadxdecision | 2 | 94 | 0.0568 |
| runs.interactions.frustrationxdecision | 2 | 94 | 0.0031 |
| runs.interactionTotal | 2 | 94 | 0.0848 |
| runs.interactions.visualComplexityxcognitiveLoad | 2 | 80 | 0.0181 |
| scroll.reachWeightedCTC | 26 | 69 | 0.0960 |
| runs.interactions.frustrationxreadability | 2 | 50 | 0.0007 |
| runs.interactions.cognitiveLoadxmotor | 2 | 48 | 0.0062 |
| scroll.screens[].stopHazard | 2 | 33 | 0.1760 |
| scroll.screens[].cumulativeAbandonment | 2 | 32 | 0.1970 |
| scroll.screens[].reachProbability | 2 | 26 | 0.1970 |
| runs.bottleneckLayer | 2 | 9 | (text) |
| scroll.dropOff.share | 2 | 7 | 0.0600 |
| scroll.totalAbandonment | 2 | 6 | 0.1200 |
| scroll.expectedDepthScreens | 2 | 6 | 0.5200 |
| scroll.screens[].bottleneckLayer | 2 | 5 | (text) |
| scroll.dropOff.layer | 1 | 1 | (text) |

`(text)` marks a string field (bottleneckLayer, dropOff.layer); its count is
the number of cells whose label changed.
