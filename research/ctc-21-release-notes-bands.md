# CTC 21.0 release notes: rank-based verdicts and whole-answer provenance

Branch `feat/b-bands`, on the integration head `2d025f3`, 2026-10-22. Every
user-visible change from four commits:

- `a310b80`, the async-safe recorder;
- `1c41bff`, the bands and the ideal-profile caps;
- `8715ae1`, the three tools;
- `cecf8f2`, the effort widget and the string sweep.

These notes are meant to go into the 21.0 BREAKING CHANGE notes. totalCTC itself
became a percentile of real pages in `7b7ac49`, and `research/ctc-21-deltas.md`
measures that change. This branch changes what the tools *say* about the
percentile, and what their provenance blocks count.

The decision behind it: verdicts state the rank, not a comfort claim. The CTC
has not been tested against human data, so no verdict says how a person feels.
Abandonment risk is a separate quantity. It keeps its own numbers and borrows
nothing from the bands.

## BREAKING CHANGE lines

- `cognitive_effort`, `site_cognitive_assessment` and `visual_cognitive_story`
  verdicts state the page's rank among the real reference pages and its band.
  They no longer say "comfortable", "moderate", "struggling" or "likely to abandon".
- `cognitive_effort` at scope `sequential`: `sequential.reachWeightedCTC` is
  removed. It is replaced by `sequential.reachWeightedMeanScreenCTC`, a
  reach-weighted mean of the screens' percentiles, in [0, 1].
- `visual_cognitive_story` effort numbers change on every page where site
  familiarity matters. The summary now scores a first visit
  (`siteFamiliarity` 0), as the other two tools do. Its `useValues` now
  modulates the effort summary.
- `modelProvenance` counts every registered constant the answer read, across
  every await. In each block, the definition count rises by 4 and the hypothesis
  count by 1. `visual_cognitive_story` reports the block for the first time.
- `IDEAL_PROFILES[].thresholds.maxCTC` keeps its values (0.5 to 0.8), but each
  value is now a percentile cap, and far stricter at viewport scope (below).

## The verdict form

Every verdict uses one sentence. It comes from `ctcRank` in
`src/visual/ctc-bands.ts`:

> Costlier than N% of the real pages we measured (111 sites x 25 personas,
> viewport scope). Band: high (80th-95th percentile).

- **N** is floor(totalCTC x 100). It rounds down, so the sentence never claims a
  rank the page did not reach (0.917 reads 91). Below 1% it reads "under 1%".
- **The page count** is read from `ctcReference.<scope>`, the registered graded
  count. The persona count comes from the reference population. The scope is
  the result's `referenceScope`. None of these numbers is typed into the text.
- **At 0**, the sentence reads "At or below the cheapest real page we measured
  (...); rawCTC 0.02 tells such pages apart".
- **At 1**, the sentence reads "At least as costly as the costliest real page we
  measured (...); rawCTC 4.21 tells such pages apart".
- **A NaN cost** reads "This cost is not rankable ... No band."

## Bands (new registered constants)

| id | value | status | band from this cut point |
|---|---|---|---|
| `ctcBands.upperHalf` | 0.5 | definition | upper half (below it: lower half) |
| `ctcBands.high` | 0.8 | definition | high |
| `ctcBands.top` | 0.95 | definition | top 5% |

- The cut points are conventions on the reference percentile. They are not
  fitted. Each band includes its lower cut point.
- Band names and ranges are built from the registered values. Overriding
  `ctcBands.top` to 0.9 renames the band "top 10%".
- The bands are registered in `src/visual/provenance/ctc-reference.ts`,
  together with the reference.

## Thresholds that changed

| where | before | after |
|---|---|---|
| `cognitive_effort` interpretation | `total` < 0.3 comfortable, < 0.6 moderate, < 0.8 struggle, else "likely to abandon" | the rank sentence and band; bottleneck named |
| `cognitive_effort` `interpretationBands` | `"total < 0.3 comfortable, < 0.6 moderate, < 0.8 struggling, else likely abandon"` | the registered cut points in words; says a band is a rank, not a feeling and not an abandonment prediction |
| `visual_cognitive_story` effort section | `ctc` < 0.5 "comfortable", < 1.0 "Moderate effort", else "Significant cognitive burden"; a failed effort run read as 0, "comfortable" | the rank sentence; a failed run says the cost could not be computed |
| `visual_cognitive_story` verdict, cost axis | `ctc` < 0.5 easy, `ctc` > 1.0 hard (unreachable on any 0-1 scale), else fell through | lower half / upper half / high or top 5%, from the registered cut points |
| `visual_cognitive_story` verdict, CTA axis | seen > 0.2, missed < 0.1; 0.1 to 0.2 fell through to "High effort AND low CTA visibility" | seen > 0.2, else missed; distractor 0.4 and quality 50 unchanged |
| `site_cognitive_assessment` recommendations | `"<persona>: Reduce <layer> complexity (primary bottleneck, CTC=0.399)"` | `"<persona>: reduce <layer> complexity first, the costliest layer. Costlier than 39% ... Band: lower half (below the 50th percentile)."` |
| `IDEAL_PROFILES[].thresholds.maxCTC` | 0.5 / 0.6 / 0.7 / 0.8 on the logistic | the same numbers as percentile caps (below) |

The story's verdict has nine branches, and each is reached by a constructed
input in `tests/story-verdict.test.ts`:

- strong, mixed, cheap-but-unfocused;
- focused or unfocused with mid-ranked cost;
- costly-but-focused, needs-work;
- cost-only (no attention data), not-ranked (no cost).

The two old outcomes are gone: "Hard but focused", which could not be reached,
and "Needs work. High effort AND low CTA visibility" on a mid-ranked page whose
CTAs were seen.

### The ideal-profile caps

`src/ideal-profiles.ts` is a library API that no tool calls. Each cap is now a
registered hypothesis, `idealProfiles.maxCTC.<persona>`, read through `param()`
by a getter, so the profile and the registry cannot disagree.

The values are unchanged. Their meaning changed:

| cap | on the logistic it sat at rawCTC | that raw cost ranks, viewport | that raw cost ranks, full_page | now means |
|---|---|---|---|---|
| 0.5 (impatient-user) | 1.200 | 0.899 | 0.576 | no costlier than the 50th percentile |
| 0.6 (cognitive-adhd) | 1.362 | 0.930 | 0.663 | 60th percentile |
| 0.7 (autism-spectrum, elderly-user, dyslexic-user) | 1.539 | 0.955 | 0.739 | 70th percentile |
| 0.8 (motor-impairment-tremor, first-timer, low-vision-magnified) | 1.755 | 0.974 | 0.806 | 80th percentile |

So every cap is far stricter at viewport scope, and somewhat stricter at
full_page. The gap score's fix text changed:

- before: "Reduce cognitive transaction cost from 0.62 to max 0.50"
- after: "Lower the cognitive transport cost from the 62nd to at most the 50th
  percentile of the real pages in the reference"

## Fields

### cognitive_effort

- **Added: `cognitiveTransportCost.band`**, the band name.
- **Added: `cognitiveTransportCost.referenceScope`**, `viewport` or `full_page`.
  At scope `sequential` the aggregate is ranked against `full_page`.
- **Added: `cognitiveTransportCost.rank`**, the rank sentence.
- **Changed: `interpretation`.** It reads "For <persona>, <subject> is costlier
  than N% ... Band: ... Bottleneck: <layer>." The scope tail is unchanged.
- **Changed: `interpretationBands`, `chainNote`.** Both describe total as the
  percentile of raw, not a sigmoid.
- **Removed: `sequential.reachWeightedCTC`.** It was the reach-weighted sum of
  screen percentiles. A sum grows with every screen reached, so it ranked a long
  page costlier for being long, and it is not a percentile. The chain's
  `SequentialScrollResult.reachWeightedCTC` (library) still returns the sum.
- **Added: `sequential.reachWeightedMeanScreenCTC`**, the rank of the typical
  screen the persona sees.
- **Added: `sequential.screenCTCNote`.** A screen's percentile ranks it among the
  first screens of real pages for fresh personas, so a later screen's rank
  includes the depletion that earlier screens caused.
- **Changed: description.** It says `total` is a percentile and that the verdict
  states a rank.

### site_cognitive_assessment

- **Added: `gate3.personas.<p>.band`** and **`gate3.personas.<p>.referenceScope`**.
- **Changed: `recommendations`**, as in the thresholds table.
- **Moved: `modelProvenance`.** It now follows `recommendations` in the JSON,
  because it is taken after them.

### visual_cognitive_story

- **Changed: the narrative.** The effort section ("The Effort: Where the Cost
  Ranks") and the verdict, as above.
- **Added: `effort.band`, `effort.referenceScope`, `effort.rank`, `effort.raw`,
  `effort.siteFamiliarity`, `effort.siteFamiliaritySource`.**
- **Changed: effort numbers.** The summary scores a first visit. Before, it left
  `siteFamiliarity` unset, and the chain read the 0.5 missing-trait capacity, so
  the summary disagreed with `cognitive_effort` on the same page.
- **Changed: `useValues`.** It now passes the persona's Schwartz scores into the
  chain, through the resolver `cognitive_effort` uses
  (`src/mcp-tools/base/chain-values.ts`).
- **Added: `valueModulation`**, when `useValues` is set.
- **Changed: the `useValues` description.** It no longer claims that values
  change the saliency map; they never reached `analyzeAttention`.
- **Added: `modelProvenance`.**
- **Changed: the attention map's perceptual filter** (ISC-48). The
  attention pass now hands `analyzeAttention` the persona record's
  `accessibilityTraits` when it has any, as `attention_analysis` does since
  `8d97c38`. So the built-in accessibility personas with no perceptual profile
  (autism-spectrum, intellectual-disability, aphasia-receptive, dyscalculia) and
  custom personas with traits on record are drawn through a filter synthesized
  from those traits, not the default. A built-in profile still wins. Before the
  change, autism-spectrum, dyscalculia and a custom persona with traits all
  resolved "default" on the fixture in `tests/story-attention-traits.test.ts`.
- **Added: `attention.perceptualProfile`**, `{ resolution, name }`: which filter
  drew the map, as `attention_analysis` reports it.

### The effort widget (`ui://cbrowser/effort`)

- **Hero:** the `total` chip reads "percentile vs real pages", where it read
  "transport cost". A new "band" chip sits beside it.
- **Chain block:** drawn to `cognitiveTransportCost.raw`. It was drawn to
  `total`, a 0-1 rank, on the same scale as layer costs. On a fixture with layers
  summing to 0.50, raw 0.52 and rank 0.951, the in-sequence bar drew at 55% of
  its track; it now fills it.

### Server instructions (remote)

The `question_answer` example asked about "a CTC of 1.6", a value that a
percentile cannot take. It now asks about "a CTC in the high band".

## modelProvenance: what a block counts now

The three tool handlers run inside `recordedAnswer`, which is
`withProvenanceAsync`. Each block is everything the answer read, across every
await. Before, it was a synchronous slice around demand plus chain, because the
recorder was module state and an await inside it would have let a concurrent
request's reads land in the block.

Block counts, measured live on 2026-10-22. Viewport, 1920x1080, `useValues`
off unless noted:

| tool | `2d025f3` (before) | this branch | difference |
|---|---|---|---|
| `cognitive_effort` (wikipedia.org, gov.uk, theguardian.com, stripe.com; first-timer and cognitive-adhd) | definition 3, hypothesis 55 | definition 7, hypothesis 56 | +3 `ctcBands.*`, +`distance.simplexFloor`, +`distance.missingTraitDefault` |
| `site_cognitive_assessment` (gov.uk) | definition 3, hypothesis 55 | definition 7, hypothesis 56 | same |
| `visual_cognitive_story` (gov.uk, cognitive-adhd) | no block | definition 7, hypothesis 56 | new |
| `visual_cognitive_story`, `useValues` on | no block; values ignored | definition 7, hypothesis 67 | +11 `chain.valueModulation.*` |

The two `distance.*` constants are read by `buildOTCognitiveProfile`, which
every tool calls. Neither moves a reported number, because the chain reads only
the profile's traits. They are counted rather than hidden: the block's contract
is "every registered constant this answer read", and an exclusion mechanism
could later hide a read that does matter.

Once the attention, perceptual-profile and page-metric registries merge
(`feat/b-attn`), their ids join these blocks. That includes `attention.*`
constants with status `fitted` and `published`, from the saliency overlay and
the story's attention analysis. So these tests will need a decision at
integration:

- `expectHonestSummary` in `tests/ctc-tool-provenance.test.ts` asserts zero
  fitted and zero published;
- its block-equality checks compare against a direct run of page measurement,
  profile, chain and verdict.

## Examples, before and after

Live pages, 2026-10-22, `cognitive_effort` at viewport. Before is `2d025f3`:
totalCTC already a percentile, read with the logistic-era sentences.

| page, persona | total | before | after |
|---|---|---|---|
| wikipedia.org, first-timer | 0.917 | first-timer is likely to abandon the top of this page. Cognitive transport cost is 92%. Immediate remediation needed on cognitiveLoad. | For first-timer, the top of this page is costlier than 91% of the real pages we measured (111 sites x 25 personas, viewport scope). Band: high (80th-95th percentile). Bottleneck: cognitiveLoad. |
| theguardian.com, cognitive-adhd | 0.742 | cognitive-adhd will struggle significantly with the top of this page. cognitiveLoad is the primary barrier. Consider simplifying. | For cognitive-adhd, the top of this page is costlier than 74% of the real pages we measured (...). Band: upper half (50th-80th percentile). Bottleneck: cognitiveLoad. |
| stripe.com, cognitive-adhd | 0.535 | cognitive-adhd will experience moderate cognitive effort on the top of this page. Bottleneck: cognitiveLoad. | For cognitive-adhd, the top of this page is costlier than 53% of the real pages we measured (...). Band: upper half (50th-80th percentile). Bottleneck: cognitiveLoad. |
| gov.uk, cognitive-adhd | 0.216 | cognitive-adhd should handle the top of this page comfortably. | For cognitive-adhd, the top of this page is costlier than 21% of the real pages we measured (...). Band: lower half (below the 50th percentile). Bottleneck: decision. |

`visual_cognitive_story`, gov.uk, cognitive-adhd:

- **Before:** "Total cognitive transport cost: 0.13. This page is comfortable for
  cognitive-adhd. The bottleneck is **decision**" (and on, about friction).
  - The 0.13 was scored with `siteFamiliarity` unset. `cognitive_effort`
    reported 0.216 for the same page and persona.
  - With `useValues` on, the value was still 0.134: values never reached the
    chain.
- **After:** "cognitive-adhd: Costlier than 21% of the real pages we measured
  (111 sites x 25 personas, viewport scope). Band: lower half (below the 50th
  percentile)."
  - totalCTC is 0.216, matching `cognitive_effort`.
  - With `useValues` on, it is 0.27, with `valueModulation.applied: true`.
- **Verdict:** "**Easy but unfocused.** Low cognitive effort, ..." became
  "**Cheap but unfocused.** Cost ranks in the lower half of the real pages we
  measured, but attention misses the CTAs."

## Library API

- **`src/visual/model-provenance.ts`**
  - New: `withProvenanceAsync` and `activeProvenance`.
  - Recordings live in an `AsyncLocalStorage` context. `withProvenance`,
    `readsOf` and the start/stop session are unchanged for synchronous callers.
- **`src/visual/ctc-bands.ts`** (new): `ctcBands`, `ctcBand`,
  `ctcBandsDescription`, `ctcRank`.
- **`src/visual/ctc-reference.ts`**: new `referencePersonaCount`.
- **`CTC_REFERENCE_PROVENANCE`** also carries `ctcBands.*` and
  `idealProfiles.maxCTC.*` (11 new ids).
- **`IDEAL_PROFILES[].thresholds.maxCTC`** is an enumerable getter. It
  serialises as the plain number.

## Not changed here

- **CIF.** `src/cif-score.ts` still compares totalCTC against its own CTC
  thresholds (`easyCTC`, `kneeCTC`), and its detail text says "within easy
  range". Those thresholds are remapped after `feat/b-cifp` merges.
- **Abandonment risk.** `abandonmentRisk`, `abandonmentBasis` and the sequential
  hazard are unchanged.
