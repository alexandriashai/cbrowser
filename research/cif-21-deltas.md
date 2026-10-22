# CIF 21.0: what each fix moved

Measured 2026-10-22 on `feat/b-cifp`, on the eight golden CIF inputs in
`tests/golden/fixtures/`. These are changes in the score's own output. CIF has
not been tested against human data or expert ratings, so none of this says
whether 21.0 grades pages more accurately than 20.x. It says how far the numbers
moved once the score stopped inventing values for inputs nobody measured.

## Method

- **Inputs.** The eight golden fixtures, unchanged. Several do not supply
  everything: `minimal-empty` supplies only a URL. `aria-rich`,
  `cognitive-overload` and `perfect-page` supply no barrier list (no empathy
  audit). Four supply no CTC layers, no animation count, or no CTA capture rate.
- **Trees.** Each tree is `git archive <commit> src`. All trees score the same
  fixture files, so only the scorer differs.
- **Script.** `bun research/cif-21-deltas.ts <label>=<root>[+audited] ...` prints
  a table per tree and a change table per consecutive pair. `+audited` scores a
  tree with every missing barrier list replaced by `[]`. That splits fix 1 into
  its two parts (rows 1a and 1b).

| commit | fix |
|---|---|
| `e9b4f03` | base (integration HEAD) |
| `39a764d` | 1. one rule for missing inputs, reported as not measured |
| `e481a02` | 2. each barrier counted once |
| `f860c04` | 3. knee scores derived, so piecewise scores cannot step |
| `ca11f56` | 4. fix text quotes registered constants |

## The rule (fix 1)

`cif.noData.score` = 50, a hypothesis. Its source in
`src/visual/provenance/cif.ts` states the rule:

- A component scores only from inputs the caller supplied. No assumed value ever
  stands in for a missing input.
- A component with none of its inputs supplied:
  - scores 50;
  - is `measured: false`;
  - says `Not measured: no <input> supplied`;
  - is listed in `CIFScore.notMeasured`;
  - is never a top issue, because a component that was not measured is not an
    issue found.
- Why 50: it is the scale midpoint. That is the one value whose largest possible
  error is the smallest (50 points either way) when nothing is known about the
  page. A missing input therefore never scores as a pass, full marks least of
  all, and never as a failure.
- `barriers: []` is an audit that found nothing. `barriers` undefined means no
  audit ran.

It replaced eighteen per-input defaults:

| input | old default | effect |
|---|---|---|
| agent-ready score | 60 (contrast), 50 (focus, semantic), 70 (layout) | contrast 68, layout 70 |
| element count | 50 (contrast), 100 (density) | density full marks, "100 elements -- well within cognitive limits" |
| CTC decision layer | cost 0 | full marks, "No CTC decision layer data available" |
| target sizes | hitProbability 100 | full marks, "No touch target barriers detected" |
| animation count | 0 | animationControl full marks, "No animations detected" |
| navigation-item count | 5 | predictability full marks, "5 navigation items -- clear, predictable structure" |
| Flesch score, CTA capture rate | 60 | "estimated 60 (conservative)" |
| information density | 0.5 | textScalability full marks, spacingDensity 50, visualCalm 75 |
| total CTC | 0.7 | overloadThreshold 50, "Total CTC: 0.700" |
| interactive count | 50 | interactionCount 40, "50 interactive elements on page" |
| ARIA score, form label score | 50, 60 | |
| barrier list | none | eight components full marks, "No ... barriers detected" |

## Composite, grade and certification per fix

### Total: base -> 21.0 (`ca11f56`)

| fixture | composite | grade | certification | components measured |
|---|---|---|---|---|
| aria-rich | 85 -> 75 (-10) | A -> B | silver -> bronze | 19/25 |
| cognitive-overload | 62 -> 46 (-16) | C -> D | none | 17/25 |
| keyboard-trap | 82 -> 73 (-9) | B | bronze | 21/25 |
| low-contrast | 87 -> 79 (-8) | A -> B | silver | 21/25 |
| minimal-empty | 81 -> 50 (-31) | B -> C | silver -> bronze | 0/25 |
| missing-alt-barriers | 82 -> 75 (-7) | B | silver -> bronze | 21/25 |
| perfect-page | 96 -> 86 (-10) | A+ -> A | gold -> silver | 19/25 |
| tiny-touch-targets | 74 -> 69 (-5) | B -> C | bronze | 21/25 |

Before 21.0 every component of every fixture reported a number. `minimal-empty`
is a URL and nothing else, and it scored 81, grade B, silver.

### Fix 1 split: 1a = the per-input defaults, 1b = an undefined barrier list read as "not audited"

| fixture | base | 1a (+audited) | 1 | 1a change | 1b change |
|---|---|---|---|---|---|
| aria-rich | 85 A silver | 85 A silver | 75 B bronze | 0 | -10 |
| cognitive-overload | 62 C none | 60 C none | 46 D none | -2 | -14 |
| keyboard-trap | 82 B bronze | 73 B bronze | 73 B bronze | -9 | 0 |
| low-contrast | 87 A silver | 79 B silver | 79 B silver | -8 | 0 |
| minimal-empty | 81 B silver | 66 C bronze | 50 C bronze | -15 | -16 |
| missing-alt-barriers | 82 B silver | 75 B bronze | 75 B bronze | -7 | 0 |
| perfect-page | 96 A+ gold | 96 A+ gold | 86 A silver | 0 | -10 |
| tiny-touch-targets | 74 B bronze | 68 C bronze | 68 C bronze | -6 | 0 |

- **1a, the per-input defaults.** This part moves every fixture that leaves an
  input out:
  - `hitProbability` 100 -> 50 with no target sizes;
  - `decisionComplexity` 100 -> 50 with no decision layer;
  - `animationControl` 100 -> 50 with no animation count;
  - `attentionClarity` 60 -> 50 with no capture rate.
- **1b, the barrier list.** Six barrier components drop from 100 to 50 on the
  three fixtures with no audit: `spacingAdequacy`, `dragFreeAlternatives`,
  `colorIndependence`, `sensoryIndependence`, `keyboardOperability` and
  `skipMechanisms`. `cognitive-overload` also loses the `touchTargetCompliance`
  fallback, since it has neither sizes nor barriers.
- **1b is the larger mover, and it is a decision.** The lead's finding named the
  per-input defaults. The same rule ("a missing input must never score full
  marks") also covers an absent barrier list: those components said "No keyboard
  accessibility barriers detected" on pages nobody audited. If a caller is ever
  shown to send `barriers: undefined` to mean "audited, nothing found", the
  caller should send `[]`. The rule should not change.

### Fix 2: each barrier counted once

| fixture | composite | motor | component |
|---|---|---|---|
| tiny-touch-targets | 68 -> 69 (+1) | 50 -> 54 | spacingAdequacy 70 -> 100 |

No other fixture moved. `tiny-touch-targets` has two `touch_target` barriers and
also measured sizes. Before, `spacingAdequacy` read those two barriers as spacing
barriers. Now it reads only the audit's close-spacing barrier (`motor_precision`
with `weightKey: "target_spacing"`), and the fixture has none.

The fixture's first `touch_target` barrier is described as "Social icons are 24px
with no spacing between them". That is a size barrier whose text mentions
spacing. A real empathy audit reports spacing as its own barrier.

The two within-component double counts this fix also removes do not occur in the
fixtures:

- a `motor_precision` barrier that mentions "keyboard" (`keyboardOperability`);
- a barrier that mentions both captions and audio (`sensoryIndependence`).

`tests/cif-count-once.test.ts` checks each case directly.

### Fix 3: knee scores derived

No golden score moved.

- overloadThreshold rises 1 point for 0.6 < totalCTC <= 1.2. Above 1.2 the old
  branch clamps to 0. The new branch reaches 0 at 1.21.
- Only `cognitive-overload` is above 0.6, at 1.42. It clamps to 0 either way.
- interactionCount and informationDensity are numerically unchanged. Their
  registered knee scores happened to equal the derived ones.
- predictability is unchanged by construction: the knee joined two equal slopes.

### Fix 4: fix text quotes registered constants

No score moved. Fix strings changed in the pins:

| was | now |
|---|---|
| "Reduce interactive elements from 38 to under 30 on a single view" | "... from 38 to 20 or fewer" (the scorer's free count) |
| "Reduce visible elements from 480 -- use progressive disclosure ..." | "... from 480 toward 200 -- ..." |
| "... reduce information density below 60%" | "... (now 44%); above 60% textScalability is penalised too" (the knee the 60% was) |
| "target 48px minimum" | "toward 44x44px (WCAG 2.5.5 AAA)" |
| "5-7 options per decision point (Hick's Law)" | "10 or fewer per decision point (decision time grows with the number of options: Hick-Hyman law)" |
| "Simplify text to 8th-grade reading level" | "raise Flesch reading ease from X to 84 or more, where readability scores full marks" |
| "Text content can scale to 200% without loss of functionality" (textScalability details) | "Information density X% is at or below 60%, so no deduction; resizing text to 200% (WCAG 1.4.4) was not checked" |

## Registry

- 109 entries before, 89 after.
- Published: 3 -> 5. The two additions are `wcag.resizeTextPercent` 200 (WCAG 2.2
  SC 1.4.4) and `wcag.nonTextContrast` 3 (SC 1.4.11).
- Definitions: 4, unchanged.
- Hypotheses: 102 -> 80.
  - Removed: the 18 defaults, the 3 registered knee scores, and predictability's
    dead knee and second slope.
  - Added: `noData.score` and `motor.spacing.minGapPx`.

## Open, not fixed here

1. **Grade and certification are still computed when components are not
   measured.** `minimal-empty` measures 0 of 25 components and still gets grade C
   and bronze. The midpoint keeps that from reading as a pass, and `notMeasured`
   sits beside the grade. Still, a certification is a claim about every category.
   Withholding it (for example, "none" unless every component is measured) is a
   policy choice for the product owner, not a scoring bug, so it is left as is.
2. **Barrier matching is a substring match.** `formAccessibility` counts any
   barrier whose type or description contains "form". That includes
   "information", "platform" and "transform", so a colour barrier described as
   "information conveyed by color alone" is also counted as a form barrier. Found
   while doing fix 2. Not changed, because word-boundary matching would also stop
   `keyboard_trap` matching "keyboard".
3. **The proxy-to-measured switch in contrastCompliance can raise a score.** With
   no contrast data, the agent-ready proxy gives 0.8 x 80 + 20 = 84. One contrast
   barrier gives 100 - 10 = 90. This predates 21.0. `tests/golden/properties.test.ts`
   already documents the same switch for contrast issues.
4. **`cif.motor.spacing.minGapPx` duplicates the detector's literal 8** in
   `src/analysis/accessibility-empathy.ts`. That file is outside this change, and
   its source says the two can drift.
5. **`visualCalm` applies no animation term when animations are reported but
   reduced-motion support is not.** The details say so. Before 21.0 such
   animations were assumed unsupported.
