# ISC-57.1: motor barriers, 20.2.2 against the 21.0 branch

The hit-probability audit (`motorAccessibility`, src/visual/cognitive-models.ts)
calls a target a barrier when its hit probability is under 0.85 for a persona
whose throughput is at least 4.0 bits/s, and under 0.70 below that. Stage B
made the audit read each persona's registered pointing rate, so personas that
sat just under 4.0 now sit at 4.9 and are held to 0.85.

## What the line reaches

`motorAccessibility` has three callers on dc79667:
- cognitive_effort: its `motorAccessibility` block (score, barrier count,
  hardest targets), `src/mcp-tools/base/persona-comparison-tools.ts`;
- visual_cognitive_story: the motor overlay, `src/mcp-tools/base/audit-tools.ts`;
- `cognitiveAccessibility` in cognitive-models.ts, which is exported and has no
  caller in src, so the change reaches library users through it.

It does not reach empathy_audit: `src/analysis/accessibility-empathy.ts` reads
none of `motorAccessibility`, `getPointingProfile` or `computeHitProbability`.
Its motor barriers (touch_target, motor_precision) are heuristics with fixed
affected personas. So it does not reach CIF either, which the CMS audit worker
builds from empathy_audit's barriers, touch targets parsed from them, and the
CTC result. Both are measured below.

## Method

`research/stage-b-motor-barriers.ts`. A stratified sample of the graded
reference pages (ctc-reference-v2-2026-10-24): 14 per page type (all 7 cart
pages), seed 20261024, direct route only (486 of the 514 graded pages), so no
page needed the residential proxy. Each page was loaded once in this tree's
browser at the reference viewport (1920x1080), and cognitive_effort's own
target capture ran on it: the function is read out of the tool's source,
types stripped, and evaluated in the page. Both trees then scored the same
captured targets with their own code, along the tool's persona path (the
persona record, `bridgeCapacityTraits`, `buildOTCognitiveProfile`,
`motorAccessibility`): main f65ade2 (20.2.2) and dc79667.

77 pages were sampled (article, form, help, landing and search 14 each, cart 7). 61 loaded and were captured; 16 did not load (14 navigation timeouts at 30 s, 2 over the 90 s page ceiling). 59 of the 61 have at least one pointer target, 1,115 targets in all: article 11, form 11, help 11, search 11, landing 10, cart 5. The brief asked for at least 60 pages: 61 were captured, and 59 of them carry targets.

## Barriers per persona

Summed over the pages; added and removed count targets that change state.

| persona | TP before -> after | threshold before -> after | barriers before | after | added | removed |
|---|---|---|---|---|---|---|
| power-user | 3.95 -> 4.90 | 0.7 -> 0.85 | 43 | 227 | 184 | 0 |
| first-timer | 3.22 -> 4.90 | 0.7 -> 0.85 | 183 | 376 | 193 | 0 |
| mobile-user | 3.44 -> 3.44 | 0.7 -> 0.7 | 141 | 141 | 0 | 0 |
| screen-reader-user | 4.45 -> 4.90 | 0.85 -> 0.85 | 90 | 90 | 0 | 0 |
| elderly-user | 3.20 -> 3.20 | 0.7 -> 0.7 | 72 | 72 | 0 | 0 |
| impatient-user | 3.22 -> 4.90 | 0.7 -> 0.85 | 183 | 376 | 193 | 0 |
| distracted-user | 3.39 -> 4.90 | 0.7 -> 0.85 | 155 | 338 | 183 | 0 |
| careful-reader | 4.12 -> 4.90 | 0.85 -> 0.85 | 152 | 152 | 0 | 0 |
| explorer | 4.06 -> 4.90 | 0.85 -> 0.85 | 176 | 176 | 0 | 0 |
| task-focused | 4.12 -> 4.90 | 0.85 -> 0.85 | 152 | 152 | 0 | 0 |
| motor-impairment-tremor | 2.10 -> 1.78 | 0.7 -> 0.7 | 377 | 377 | 0 | 0 |
| low-vision-magnified | 3.89 -> 4.90 | 0.7 -> 0.85 | 64 | 235 | 171 | 0 |
| cognitive-adhd | 4.20 -> 4.90 | 0.85 -> 0.85 | 96 | 96 | 0 | 0 |
| dyslexic-user | 3.61 -> 4.90 | 0.7 -> 0.85 | 106 | 312 | 206 | 0 |
| deaf-user | 3.95 -> 4.90 | 0.7 -> 0.85 | 43 | 227 | 184 | 0 |
| elderly-low-vision | 3.20 -> 3.20 | 0.7 -> 0.7 | 72 | 72 | 0 | 0 |
| color-blind-deuteranopia | 3.95 -> 4.90 | 0.7 -> 0.85 | 43 | 227 | 184 | 0 |
| autism-spectrum | 3.84 -> 4.90 | 0.7 -> 0.85 | 66 | 251 | 185 | 0 |
| intellectual-disability | 3.00 -> 4.90 | 0.7 -> 0.85 | 238 | 403 | 165 | 0 |
| aphasia-receptive | 3.39 -> 4.90 | 0.7 -> 0.85 | 155 | 338 | 183 | 0 |
| dyscalculia | 3.33 -> 4.90 | 0.7 -> 0.85 | 155 | 360 | 205 | 0 |
| anxious-user | 3.84 -> 4.90 | 0.7 -> 0.85 | 66 | 251 | 185 | 0 |
| confident-user | 3.61 -> 4.90 | 0.7 -> 0.85 | 106 | 312 | 206 | 0 |
| emotional-user | 3.22 -> 4.90 | 0.7 -> 0.85 | 183 | 376 | 193 | 0 |
| stoic-user | 3.89 -> 4.90 | 0.7 -> 0.85 | 64 | 235 | 171 | 0 |
| all | | | 3181 | 6172 | 2991 | 0 |

Pages whose motor barrier count changes for at least one persona: 56 of 59 (94.9%).

Every change is the threshold. Hit probability did not move for any persona
on any target (27,875 persona-target pairs, all identical): the dispersion
profiles are unchanged, and only the throughput moved. The 16 personas whose
threshold went from 0.70 to 0.85 are the ones that were under 4.0 and are now
at the reference 4.9. motor-impairment-tremor (2.10 to 1.78), mobile-user
(3.44) and elderly-user and elderly-low-vision (3.20) stay under 4.0; the five
already at or over 4.0 (screen-reader-user, careful-reader, explorer,
task-focused, cognitive-adhd) stay at 0.85. No barrier is removed anywhere.

The five pages with the largest change, each with the persona it is largest
for:

- Washington, D.C. help (https://dc.gov/page/contact-agency-directors), 30 targets: aphasia-receptive 0 -> 21, +21 / -0; 16 personas change here; reason: TP line (threshold 0.70 -> 0.85)
- Cincinnati Art Museum form (https://cincinnatiartmuseum.org/about/contact-us/), 30 targets: color-blind-deuteranopia 2 -> 21, +19 / -0; 16 personas change here; reason: TP line (threshold 0.70 -> 0.85)
- happycampus.co.jp search (https://happycampus.co.jp/search/?category=docs&__a=gnb_search&kwd=help&target=docs&search_type=all), 30 targets: anxious-user 4 -> 19, +15 / -0; 14 personas change here; reason: TP line (threshold 0.70 -> 0.85)
- Los Angeles Philharmonic article (https://www.laphil.com/events/instances/af7msn8d/2026-10-24/a-symphonic-ballet-with-elim-chan), 29 targets: dyscalculia 2 -> 15, +13 / -0; 16 personas change here; reason: TP line (threshold 0.70 -> 0.85)
- Austin help (https://www.austintexas.gov/3-1-1/contact), 17 targets: confident-user 0 -> 13, +13 / -0; 16 personas change here; reason: TP line (threshold 0.70 -> 0.85)

## empathy_audit and CIF

runEmpathyAudit checks the live DOM, so its input cannot be captured, and two
loads of a live page differ (one page gave 0 and then 11 motor barriers on two
loads under 20.2.2). So the first 20 sampled pages, round-robin over page
types, were each loaded once, and that loaded page was audited by 20.2.2, then
dc79667, then 20.2.2 again as a control, with the audit's navigation made a
no-op. Options were the worker's (first-timer, AA, viewport) without a goal,
so no journey and no model call.

Both versions completed on 13 of the 20 pages, and all three runs on 12 (the others hit a navigation timeout or a 75 s audit ceiling). The motor barriers (type, element, description, severity) are identical between 20.2.2 and dc79667 on 13 of 13 pages, 31 barriers of both motor types, and between the two 20.2.2 runs on 12 of 12. Over every barrier type, 12 of 13 pages are identical; the one difference (happycampus.co.jp) is two sensory barriers, and the control run differs from the first run there too, so it is the page changing under the audits, not the version.

CIF's motor score on identical inputs: on all 13 pages, each version's CIF
code gives the same motor score on either version's barriers, so the 0.85 line
does not reach CIF.

CIF's motor score does differ between the 20.2.2 and 21.0 CIF code on every
page (88 to 78 on a page with one or no motor barrier; Washington, D.C. 30 to
47). That comes from 21.0's CIF changes, not from ISC-57.1:
- a component with no input now scores the no-data value (50) instead of an
  assumed one. This harness supplies no interactive-element count, which the
  worker does, so here the interaction component reads 50 under 21.0 and 40
  under 20.2.2;
- the spacing component now counts only the close-spacing barrier, recognised
  by `weightKey === "target_spacing"`. The worker builds CIF's barriers from
  type, severity, element, description and wcagCriteria, so it drops
  `weightKey`, and under the worker the spacing component cannot see a
  close-spacing barrier in 21.0. On these pages the dc79667 audits found 8 of
  them; on Washington, D.C. spacing reads 0 under 20.2.2 and 100 ("No
  close-spacing barriers detected") under 21.0. That is a contract gap between
  the worker and 21.0's CIF, for whoever owns them; it is not measured or fixed
  here.
