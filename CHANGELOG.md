# Changelog

All notable changes to CBrowser will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [10.8.0](https://github.com/alexandriashai/cbrowser/compare/v10.7.1...v10.8.0) (2026-02-07)


### Added

* **mcp:** API-free bridge workflow for `compare_personas`
  - New `compare_personas_init` tool - returns persona profiles and orchestration instructions
  - New `compare_personas_complete` tool - aggregates journey results into comparison report
  - Updated `compare_personas` to detect Claude Code sessions and redirect to bridge workflow
  - Enables multi-persona comparison without Anthropic API key in Claude Code

### Bridge Workflow

When running in Claude Code (no API key), use this pattern:

```
1. compare_personas_init({ url, goal, personas })
   → Returns persona profiles and instructions

2. For each persona:
   cognitive_journey_init(persona) → browser tools → results

3. compare_personas_complete({ journeyResults, url, goal })
   → Returns comparison report with rankings and recommendations
```

## [10.7.1](https://github.com/alexandriashai/cbrowser/compare/v10.7.0...v10.7.1) (2026-02-07)

### Fixed

* **ci:** pin conventional-changelog-conventionalcommits to 8.0.0 ([425ab24](https://github.com/alexandriashai/cbrowser/commit/425ab244291bcaabb9714acce6ce4d52d10b876c))
* **ci:** update release-it to v19.2.4 ([78f0cad](https://github.com/alexandriashai/cbrowser/commit/78f0cade767c37ba399a29cc6000101710a9ee5d)), closes [release-it/release-it#1237](https://github.com/release-it/release-it/issues/1237)

## [10.7.0](https://github.com/alexandriashai/cbrowser/compare/v10.6.0...v10.7.0) (2026-02-07)


### Added

* **cognitive:** add resilience trait for emotional recovery modeling ([799521c](https://github.com/alexandriashai/cbrowser/commit/799521c025211c6db833425e62fa4ab5c0aa14c7))

## [10.6.0](https://github.com/alexandriashai/cbrowser/compare/v10.5.2...v10.6.0) (2026-02-07)

### Added

* **cognitive:** Resilience trait for emotional recovery modeling
  - New `resilience` field (0-1) in `CognitiveTraits` interface
  - Time-based frustration decay: `frustrationLevel -= resilience * 0.04` per step
  - Success-triggered recovery: major recovery on progress, minor on any success
  - "Second wind" effect: patience partially restored when making progress

* **personas:** Resilience values for all 13 personas
  - Built-in personas: power-user (0.85), first-timer (0.4), mobile-user (0.5), screen-reader-user (0.8), elderly-user (0.3), impatient-user (0.2)
  - Accessibility personas: motor-tremor, low-vision, ADHD, dyslexic, deaf, elderly-low-vision, color-blind with research-based values

* **docs:** Academic citations for resilience modeling
  - [Brief Resilience Scale (BRS)](https://pubmed.ncbi.nlm.nih.gov/18696313/) - Smith et al., 2008
  - [Connor-Davidson Resilience Scale (CD-RISC)](https://pubmed.ncbi.nlm.nih.gov/12964174/)
  - [MIT Frustration Recovery Research](https://www.sciencedirect.com/science/article/abs/pii/S0953543801000534)

* add API-free session bridge for empathy_audit ([e21c967](https://github.com/alexandriashai/cbrowser/commit/e21c96724173f5ab6e5805e6d241c6626171456b))

### Research Basis

The resilience trait is grounded in peer-reviewed cognitive science:

> "A valid index of resilience would be the efficiency with which an individual recovers psychologically and physiologically following a stressful event. Resilience can be operationalized as the rate of decrease of a particular stress-marker in the period following a stress induction."
> — Brief Resilience Scale (Smith et al., 2008)

This directly maps to CBrowser's implementation: frustration decay rate + success recovery boost.

## [10.5.2](https://github.com/alexandriashai/cbrowser/compare/v10.5.1...v10.5.2) (2026-02-07)

## [10.5.1](https://github.com/alexandriashai/cbrowser/compare/v10.4.5...v10.5.1) (2026-02-07)

### Changed

* **refactor:** Extract modular components from browser.ts (4816 → 4201 lines, ~13% reduction)
  - `src/browser/session-manager.ts` - SessionManager class for session persistence
  - `src/browser/selector-cache.ts` - SelectorCacheManager class for self-healing selectors
  - `src/browser/overlay-handler.ts` - OverlayHandler class for overlay dismissal
  - All modules exported from `src/browser/index.ts` and main package

* **chore:** Eliminate all ESLint warnings (132 → 0)
  - Remove unused imports across codebase
  - Prefix unused variables with `_` for intentional ignoring
  - Clean up no-explicit-any with proper typing
  - Add eslint-disable comments for intentional any usage
