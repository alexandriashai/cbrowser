# Stage B: persona rates against the literature

Phase 2a note. No persona value changes here. Numbers come from
`research/stage-b-persona-rates.ts`, run on `feat/stage-b`. The measured rates
are registered in `src/visual/provenance/laws.ts` (`law.rate.*`) and the
profile constants in `src/visual/provenance/profiles.ts`, each entry with its
source and a quote.

Capacity on the time scale is `c = r_p / (r_p + r_ref)`
(`demand-laws.ts`, `rateCapacity`): 0.5 at the reference rate, `1 / (1 + k)` for
a persona k times slower. The reference rates are 4.9 bits/s for pointing
(MacKenzie, Kauppinen & Silfverberg 2001) and 238 wpm for reading
(Brysbaert 2019).

## 0. Recommendations

**Motor (pointing throughput)**

1. **motor-impairment-tremor: use the measured motion-impaired rate.** That is
   1.77 bits/s against 4.88 for able-bodied users in the same study (Keates et
   al. 2002, read in Soukoreff & MacKenzie 2004, Table 4). The ratio is 0.363,
   so c = 0.266, against 0.300 from today's 2.1. The group is motion-impaired
   users in general, not tremor specifically, at a 69% error rate.
2. **Personas with no motor impairment: use the reference rate (c = 0.5).**
   Today 21 personas get a throughput by interpolating between 4.9 and 2.1 on
   `0.6 proceduralFluency + 0.4 patience`. Those are dispositions, not motor
   measures, and nothing cited supports the mapping. It makes first-timer
   (3.22 bits/s) point like the elderly profile (3.20), and no persona reaches
   the reference. This changes 20 personas (all 21 but mobile-user, rule 5),
   so it is your call.
3. **elderly-user and elderly-low-vision: keep 3.2 bits/s, labelled hypothesis.**
   No ISO mouse throughput for adults 65+ was found. Chaparro et al. (1999)
   support the direction ("older adults took longer to complete movements")
   but give no rate. Do not invent one.
4. **cognitive-adhd: use the reference rate, labelled hypothesis.** 4.2 bits/s
   has no source. The cited study (Flapper et al. 2006) is of children with
   ADHD plus developmental coordination disorder, and reports no throughput.
   Keeping 4.2 asserts a motor deficit nothing measured. Unlike the elderly
   personas, no retrieved source even supports the direction.
5. **mobile-user: leave it as a hypothesis.** Touch is not wired (design note,
   2.5). Rule 2 would hand it the mouse rate, which is wrong for a finger.

**Reading (silent reading rate)**

6. **dyslexic-user: use Callens et al. (2012).** Students with dyslexia read
   184.63 wpm, against 243.64 for controls in the same study. The ratio is
   0.758, so c = 0.431. The fixation model gives 0.419, from a slowdown of 1.39x
   against the measured 1.32x. The model lands close here, but on constants
   that cite the wrong things (section 3).
7. **low-vision-magnified and elderly-low-vision: decide which field loss each
   persona models, then use Legge et al. (1985).** Median peak rates are 130 wpm
   with intact central fields (c = 0.353) and 25 wpm with central-field loss
   (c = 0.095). Both are below the fixation model's 0.414 and 0.408. They are
   peak rates at the best character size, so they are an upper bound for
   everyday reading. The ratio against 238 wpm also crosses methods, because
   the same-method normal-vision rate (Legge et al. 1985, part I) was not
   retrieved. My recommendation is intact fields for low-vision-magnified,
   which states only magnification. For elderly-low-vision it is your call,
   since the persona does not say.
8. **elderly-user: keep the current rate (1.17x slower, c = 0.460), labelled
   hypothesis.** No silent-reading norm for 65+ was found. Brysbaert (2019)
   reports that rates are lower in old adults and that the drop "is not
   expected to occur before the age of 60-65", with no number.
9. **cognitive-adhd: keep the current rate (1.07x, c = 0.484), labelled
   hypothesis.** Adults with ADHD read more slowly, per the source check, but
   no numbers were retrieved.
10. **Personas with no reading impairment: use the reference rate (c = 0.5).**
    Today they are interpolated toward the dyslexic profile on
    `0.6 textProcessing + 0.4 comprehension`, for slowdowns of 1.02x to 1.25x.
    This is the same unsupported mapping as rule 2. intellectual-disability
    (1.25x) and aphasia-receptive (1.24x) plausibly read more slowly, but no
    rate was retrieved for either, so they keep today's value as a labelled
    hypothesis.
11. **Put the rate on the persona, not in a profile table.** Four personas
    state all five reading fields in `accessibilityTraits`, so the profile
    table is overridden for them. Changing `KNOWN_READING_PROFILES` moves none
    of the personas named in rules 6 to 9 except elderly-user. A per-persona
    rate (wpm, bits/s) with its own provenance entry, set from `law.rate.*`
    where a measured population exists, is the one place a change would land.

**Decision**

12. **No change.** No persona-specific decision or visual-search rates were
    retrieved, so decision capacity stays the five dispositions. That makes
    the layer coherent on the demand side only, as the design says (6.4).
    Cockburn et al.'s model has one persona-dependent term, expertise e, and
    the design kept it out of demand (siteFamiliarity is 0 on first visits).

What the recommendations would do to the roster, if all were taken: motor
capacity at 0.5 for 21 personas (rules 2 and 4), 0.413 for mobile-user
(unchanged), 0.395 for the two elderly personas and 0.266 for tremor. Today it spans 0.300 to 0.476 on the time scale, and no persona
sits at the reference. Reading capacity would sit at 0.5 for most personas,
0.484 for ADHD, 0.460 for elderly, 0.444 to 0.446 for intellectual-disability
and aphasia, 0.431 for dyslexia, and 0.353 or 0.095 for the low-vision
personas. That is wider than the fixation model's 0.408 to 0.495.

An earlier measurement on real pages found that ADHD, dyslexic and low-vision
personas cost less than first-timer. Rules 2 and 10 act on that
directly, because first-timer's motor capacity moves from 0.397 to 0.5 and its
reading capacity from 0.447 to 0.5. Whether the ordering flips is a phase 2b
measurement, not a claim made here.

## 1. Measured rates found

| population | rate | control | ratio | c | source (registered as) |
|---|---|---|---|---|---|
| motion-impaired mouse users | 1.77 bits/s | 4.88 bits/s, same study | 0.363 | 0.266 | Keates et al. 2002 via Soukoreff & MacKenzie 2004, Table 4 (`law.rate.pointing.motionImpaired`, `...Controls`) |
| regular mouse users (reference) | 4.9 bits/s | - | 1 | 0.5 | MacKenzie, Kauppinen & Silfverberg 2001 (`law.rate.pointing.reference`) |
| adults reading English non-fiction (reference) | 238 wpm | - | 1 | 0.5 | Brysbaert 2019 (`law.reading.wpm`) |
| students with dyslexia | 184.63 wpm | 243.64 wpm, same study | 0.758 | 0.431 | Callens, Tops & Brysbaert 2012, Table 5 (`law.rate.reading.dyslexiaAdults`, `...Controls`) |
| low vision, intact central fields | 130 wpm peak | 238 wpm, other method | 0.546 | 0.353 | Legge, Rubin, Pelli & Schleske 1985 (`law.rate.reading.lowVisionIntactFields`) |
| low vision, central-field loss | 25 wpm peak | 238 wpm, other method | 0.105 | 0.095 | same (`law.rate.reading.lowVisionCentralLoss`) |

Both same-study controls sit within 2.4% of the reference rates: 4.88 against
4.9, and 243.64 against 238. So the reference rates and the measured groups
are on comparable scales.

**No measured rate found:**

- pointing for adults 65+: Chaparro 1999 has no throughput; Ketcham 2002 used
  a tablet, per the source check;
- pointing for adults with ADHD: Flapper 2006 is children with ADHD and DCD,
  with no throughput;
- silent reading for adults 65+: none found;
- silent reading for adults with ADHD: none retrieved;
- intellectual disability, receptive aphasia, autism and dyscalculia on either
  channel: not searched for.

## 2. Per persona

From `research/stage-b-persona-rates.ts`.

- **today** is the bridged capacity the chain reads now (`motorCapacityOf`,
  `readingCapacityOf`).
- **c (current rate)** is the rate ratio on the persona's current rate.
- **c (measured)** uses the registered measured rate.
- **ms/word** is `computeReadingDifficulty` on neutral text. The reference
  reader is the neurotypical profile at 270 ms/word, and k is the slowdown
  against it.

### Motor

| persona | route | TP bits/s | today | c (current TP) | c (measured) | recommendation |
|---|---|---|---|---|---|---|
| power-user | interpolated | 3.95 | 0.702 | 0.446 | none | reference, 0.5 (2) |
| first-timer | interpolated | 3.22 | 0.597 | 0.397 | none | reference, 0.5 (2) |
| mobile-user | interpolated | 3.44 | 0.629 | 0.413 | none | hypothesis until touch is wired (5) |
| screen-reader-user | interpolated | 4.45 | 0.774 | 0.476 | none | reference, 0.5 (2) |
| elderly-user | elderly | 3.20 | 0.605 | 0.395 | none | keep, hypothesis (3) |
| impatient-user | interpolated | 3.22 | 0.598 | 0.397 | none | reference, 0.5 (2) |
| distracted-user | interpolated | 3.39 | 0.621 | 0.409 | none | reference, 0.5 (2) |
| careful-reader | interpolated | 4.12 | 0.726 | 0.457 | none | reference, 0.5 (2) |
| explorer | interpolated | 4.06 | 0.718 | 0.453 | none | reference, 0.5 (2) |
| task-focused | interpolated | 4.12 | 0.726 | 0.457 | none | reference, 0.5 (2) |
| motor-impairment-tremor | tremor | 2.10 | 0.438 | 0.300 | 0.266 | measured, 0.266 (1) |
| low-vision-magnified | interpolated | 3.89 | 0.693 | 0.443 | none | reference, 0.5 (2); magnification is not modelled |
| cognitive-adhd | adhd | 4.20 | 0.741 | 0.462 | none | reference, 0.5, hypothesis (4) |
| dyslexic-user | interpolated | 3.61 | 0.653 | 0.424 | none | reference, 0.5 (2) |
| deaf-user | interpolated | 3.95 | 0.702 | 0.446 | none | reference, 0.5 (2) |
| elderly-low-vision | elderly | 3.20 | 0.605 | 0.395 | none | keep, hypothesis (3) |
| color-blind-deuteranopia | interpolated | 3.95 | 0.702 | 0.446 | none | reference, 0.5 (2) |
| autism-spectrum | interpolated | 3.84 | 0.685 | 0.439 | none | reference, 0.5 (2) |
| intellectual-disability | interpolated | 3.00 | 0.566 | 0.379 | none | reference, 0.5 (2); no rate retrieved |
| aphasia-receptive | interpolated | 3.39 | 0.621 | 0.409 | none | reference, 0.5 (2) |
| dyscalculia | interpolated | 3.33 | 0.613 | 0.405 | none | reference, 0.5 (2) |
| anxious-user | interpolated | 3.84 | 0.685 | 0.439 | none | reference, 0.5 (2) |
| confident-user | interpolated | 3.61 | 0.653 | 0.424 | none | reference, 0.5 (2) |
| emotional-user | interpolated | 3.22 | 0.598 | 0.397 | none | reference, 0.5 (2) |
| stoic-user | interpolated | 3.89 | 0.693 | 0.443 | none | reference, 0.5 (2) |

"interpolated" means `0.6 proceduralFluency + 0.4 patience`, mapped
between the neurotypical (4.9) and tremor (2.1) profiles.

### Reading

| persona | route | ms/word | k | today | c (k) | c (measured) | recommendation |
|---|---|---|---|---|---|---|---|
| power-user | interpolated | 275 | 1.02 | 0.787 | 0.495 | none | reference, 0.5 (10) |
| first-timer | interpolated | 334 | 1.24 | 0.520 | 0.447 | none | reference, 0.5 (10) |
| mobile-user | interpolated | 301 | 1.11 | 0.654 | 0.473 | none | reference, 0.5 (10) |
| screen-reader-user | interpolated | 292 | 1.08 | 0.724 | 0.480 | none | reference, 0.5 (10); a listening rate would be the real one |
| elderly-user | elderly profile | 317 | 1.17 | 0.673 | 0.460 | none | keep, hypothesis (8) |
| impatient-user | interpolated | 301 | 1.11 | 0.654 | 0.473 | none | reference, 0.5 (10) |
| distracted-user | interpolated | 306 | 1.13 | 0.619 | 0.469 | none | reference, 0.5 (10); its cost belongs to readingAttention |
| careful-reader | interpolated | 292 | 1.08 | 0.724 | 0.480 | none | reference, 0.5 (10) |
| explorer | interpolated | 295 | 1.09 | 0.706 | 0.478 | none | reference, 0.5 (10) |
| task-focused | interpolated | 297 | 1.10 | 0.689 | 0.476 | none | reference, 0.5 (10) |
| motor-impairment-tremor | interpolated | 297 | 1.10 | 0.689 | 0.476 | none | reference, 0.5 (10) |
| low-vision-magnified | stated (= lowVision profile) | 382 | 1.41 | 0.536 | 0.414 | 0.353 intact / 0.095 central loss | measured, intact fields (7) |
| cognitive-adhd | stated (= adhd profile) | 288 | 1.07 | 0.746 | 0.484 | none | keep, hypothesis (9) |
| dyslexic-user | stated (= dyslexic profile) | 375 | 1.39 | 0.387 | 0.419 | 0.431 | measured, 0.431 (6) |
| deaf-user | interpolated | 292 | 1.08 | 0.724 | 0.480 | none | reference, 0.5 (10) |
| elderly-low-vision | stated (elderly phonological, low-vision span) | 392 | 1.45 | 0.526 | 0.408 | 0.353 intact / 0.095 central loss | measured, field status your call (7) |
| color-blind-deuteranopia | interpolated | 297 | 1.10 | 0.689 | 0.476 | none | reference, 0.5 (10) |
| autism-spectrum | interpolated | 304 | 1.13 | 0.636 | 0.470 | none | reference, 0.5 (10) |
| intellectual-disability | interpolated | 338 | 1.25 | 0.485 | 0.444 | none | keep, hypothesis (10) |
| aphasia-receptive | interpolated | 336 | 1.24 | 0.503 | 0.446 | none | keep, hypothesis (10) |
| dyscalculia | interpolated | 299 | 1.11 | 0.671 | 0.475 | none | reference, 0.5 (10) |
| anxious-user | interpolated | 301 | 1.11 | 0.654 | 0.473 | none | reference, 0.5 (10) |
| confident-user | interpolated | 297 | 1.10 | 0.689 | 0.476 | none | reference, 0.5 (10) |
| emotional-user | interpolated | 306 | 1.13 | 0.619 | 0.469 | none | reference, 0.5 (10) |
| stoic-user | interpolated | 297 | 1.10 | 0.689 | 0.476 | none | reference, 0.5 (10) |

"interpolated" means `0.6 textProcessing + 0.4 comprehension`, mapped
between the neurotypical and dyslexic profiles.

### Decision

These are the capacities the chain reads for the decision layer. Each value is
the trait as authored, a hypothesis on a 0-1 scale, and "-" would mean the
trait is missing (0.5); every built-in persona carries all five. No literature
rate applies (rule 12).

| persona | satisficing | anchoringBias | riskTolerance | fearOfMissingOut | socialProofSensitivity |
|---|---|---|---|---|---|
| power-user | 0.40 | 0.30 | 0.80 | 0.20 | 0.30 |
| first-timer | 0.60 | 0.70 | 0.30 | 0.60 | 0.70 |
| mobile-user | 0.80 | 0.50 | 0.60 | 0.60 | 0.60 |
| screen-reader-user | 0.60 | 0.40 | 0.20 | 0.40 | 0.50 |
| elderly-user | 0.60 | 0.70 | 0.20 | 0.30 | 0.70 |
| impatient-user | 0.90 | 0.60 | 0.60 | 0.80 | 0.40 |
| distracted-user | 0.70 | 0.60 | 0.50 | 0.70 | 0.50 |
| careful-reader | 0.10 | 0.30 | 0.15 | 0.15 | 0.40 |
| explorer | 0.20 | 0.25 | 0.90 | 0.40 | 0.25 |
| task-focused | 0.50 | 0.45 | 0.50 | 0.30 | 0.20 |
| motor-impairment-tremor | 0.75 | 0.50 | 0.30 | 0.30 | 0.50 |
| low-vision-magnified | 0.65 | 0.60 | 0.30 | 0.40 | 0.50 |
| cognitive-adhd | 0.70 | 0.60 | 0.70 | 0.70 | 0.50 |
| dyslexic-user | 0.70 | 0.60 | 0.40 | 0.40 | 0.60 |
| deaf-user | 0.50 | 0.50 | 0.40 | 0.40 | 0.60 |
| elderly-low-vision | 0.70 | 0.80 | 0.10 | 0.20 | 0.70 |
| color-blind-deuteranopia | 0.50 | 0.50 | 0.40 | 0.40 | 0.50 |
| autism-spectrum | 0.30 | 0.75 | 0.20 | 0.20 | 0.25 |
| intellectual-disability | 0.80 | 0.85 | 0.20 | 0.30 | 0.60 |
| aphasia-receptive | 0.70 | 0.70 | 0.25 | 0.30 | 0.40 |
| dyscalculia | 0.75 | 0.75 | 0.40 | 0.50 | 0.50 |
| anxious-user | 0.30 | 0.70 | 0.20 | 0.60 | 0.80 |
| confident-user | 0.70 | 0.30 | 0.80 | 0.30 | 0.30 |
| emotional-user | 0.60 | 0.70 | 0.50 | 0.70 | 0.80 |
| stoic-user | 0.40 | 0.30 | 0.50 | 0.20 | 0.40 |

## 3. What the source check means for the current constants

All of these are registered in `provenance/profiles.ts`:

- **4.9 bits/s** (neurotypical) is right, but under another citation:
  MacKenzie, Kauppinen & Silfverberg (2001), not MacKenzie (1992).
- **2.1 bits/s** (tremor): no source found. The paper retrieved as Hwang et al.
  (2004) is a submovement study with no throughput. The nearest measured value
  is 1.77 bits/s. This is also the low anchor of the interpolation, so changing
  it moves every interpolated persona unless rule 2 is taken first.
- **3.2 bits/s** (elderly) and **4.2 bits/s** (ADHD): no source.
- **250 ms** is a fixation duration (Rayner 2009, Table 1, silent reading
  225-250 ms), not a time per word. As a per-word time, 250 ms is 240 wpm,
  close to Brysbaert's 238 wpm (252 ms per word). But the neurotypical profile
  adds 20 ms of its own phonological penalty, so the model's reference reader
  reads 222 wpm.
- **normal span 7**: Legge et al. (2007) estimate about 9. Rayner's 7-9
  letters is mean saccade length, a different quantity.
- **The span term is not clamped.** A stated visualSpan above 7 subtracts time
  (a 14-letter span reads faster than the base). No built-in persona states
  one.
- **100 ms (phonological) and 80 ms (span)** have no source in the code.
  Perry, Zorzi & Ziegler (2019) model accuracy in children, per the source
  check.

The reference has to match. If a persona's reading rate comes from the
fixation model, its ratio must be taken against the model's own reference
(270 ms/word), as k is above. Taking 60000 / ms against 238 wpm would make
every persona about 7% slower than the reference by construction.

## 4. Two code findings, outside this phase

- `bridgeCapacityTraits` calls `getPointingProfile({ name, traits })` without
  `accessibilityTraits`. So `accessibilityTraits.tremor` never reaches the
  motor bridge, and a custom persona with a tremor flag but no "tremor" in its
  name is interpolated like anyone else.
- The four personas with stated reading traits duplicate the profile table's
  numbers. Two copies of one value, and a change to either one alone moves
  nothing visible (rule 11).
