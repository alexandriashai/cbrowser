# Changelog

All notable changes to CBrowser will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [11.9.0](https://github.com/alexandriashai/cbrowser/compare/v11.7.2...v11.9.0) (2026-02-08)

### Added

* v11.8.0 - confidence gating, intent typing, response fixes ([760b761](https://github.com/alexandriashai/cbrowser/commit/760b761e8bec5d7b98efbc0484d494d7ec299cd3))

## [11.7.2](https://github.com/alexandriashai/cbrowser/compare/v11.7.0...v11.7.2) (2026-02-08)

### Fixed

* v11.7.1 bug fixes from MCP demo testing ([1992cd1](https://github.com/alexandriashai/cbrowser/commit/1992cd191389a88b480749d50396178c184e563f))

## [11.7.0](https://github.com/alexandriashai/cbrowser/compare/v11.6.3...v11.7.0) (2026-02-08)

### Added

* **mcp:** add step-level statistics to NL test responses ([2cb2f3c](https://github.com/alexandriashai/cbrowser/commit/2cb2f3c3ead4c3edb04d47f039fc5b2145ea4d07))

## [11.6.3](https://github.com/alexandriashai/cbrowser/compare/v11.6.2...v11.6.3) (2026-02-08)

### Fixed

* address 6 critical bugs from MCP demo testing ([02cab8c](https://github.com/alexandriashai/cbrowser/commit/02cab8c7e770666798aa00a2005948a164f473ae))

## [11.6.2](https://github.com/alexandriashai/cbrowser/compare/v11.6.1...v11.6.2) (2026-02-08)

## [11.6.1](https://github.com/alexandriashai/cbrowser/compare/v11.6.0...v11.6.1) (2026-02-07)

## [11.6.0](https://github.com/alexandriashai/cbrowser/compare/v11.5.0...v11.6.0) (2026-02-07)

### Added

* **cognitive:** add trustCalibration and interruptRecovery traits ([4c0a602](https://github.com/alexandriashai/cbrowser/commit/4c0a602393257f8ad8d6f0fe4da06ee1007bac37)), closes [#60](https://github.com/alexandriashai/cbrowser/issues/60) [#73](https://github.com/alexandriashai/cbrowser/issues/73)

## [11.5.0](https://github.com/alexandriashai/cbrowser/compare/v11.4.1...v11.5.0) (2026-02-07)

### Added

* **cognitive:** 4 new research-backed cognitive traits for realistic user simulation
  - `selfEfficacy` - Belief in problem-solving ability (Bandura 1977)
  - `satisficing` - Accept "good enough" vs. seek optimal (Simon 1956)
  - `trustCalibration` - Baseline trust toward websites (Fogg 2003)
  - `interruptRecovery` - Ability to resume after interruption (Mark 2005)

* **cognitive:** SelfEfficacyState system with domain-specific confidence tracking
  - `handleChallenge()` - Models response to interface challenges
  - `updateSelfEfficacy()` - Adjusts efficacy after success/failure
  - Low efficacy users abandon 40% faster on first error

* **cognitive:** SatisficingState system with aspiration level adaptation
  - `evaluateOption()` - Determines if option meets "good enough" threshold
  - Satisficers decide 50% faster with similar outcome quality
  - Choice overload affects maximizers more severely

* **cognitive:** TrustState system with 8 trust signal types
  - Signals: https, security_badge, brand_recognition, professional_design, reviews_visible, contact_info, privacy_policy, social_proof
  - `evaluateTrustDecision()` - Models trust-based action decisions
  - `recordTrustBetrayal()` - Tracks trust violations
  - Trust calibration affects CTA click-through by up to 40%

* **cognitive:** InterruptRecoveryState system with context preservation
  - Interruption types: external, system, self_initiated, timeout
  - Resumption outcomes: resume_exact, resume_approximate, restart, abandon
  - `handleInterruption()` - Models recovery based on Mark's 23-minute finding

* **personas:** All 13 personas updated with new trait mappings
  - 6 built-in personas: power-user, first-timer, mobile-user, screen-reader-user, elderly-user, impatient-user
  - 7 accessibility personas: motor-impairment-tremor, low-vision-magnified, cognitive-adhd, dyslexic-user, deaf-user, elderly-low-vision, color-blind-deuteranopia

* **docs:** Updated README, CognitiveState.md, CognitivePersonas.md with new traits
* **examples:** Added selfEfficacy, satisficing, interruptRecovery examples to cognitive-journey.ts

### Research Citations

| Trait | Primary Research |
|-------|-----------------|
| selfEfficacy | Bandura (1977) "Self-efficacy: Toward a unifying theory of behavioral change" |
| satisficing | Simon (1956) "Rational Choice and the Structure of the Environment" |
| trustCalibration | Fogg (2003) "Persuasive Technology" (Stanford Persuasive Tech Lab) |
| interruptRecovery | Mark et al. (2005) "No Task Left Behind?" |

## [11.4.1](https://github.com/alexandriashai/cbrowser/compare/v11.4.0...v11.4.1) (2026-02-07)

### Added

* **find_element_by_intent:** Semantic role matching - "main navigation menu" now matches `<nav aria-label="Main">` with 0.9 confidence
* **find_element_by_intent:** Navigation intent qualifiers - "main", "primary", "global" boost matching aria-labels
* **responsive_test:** Viewport-specific issue detection via JavaScript analysis
* **responsive_test:** Detects overflow, small text, small touch targets, truncation, hidden content
* **responsive_test:** Detailed summary shows specific issue counts by type
* **navigate:** Configurable `waitStrategy` option: "networkidle" | "domcontentloaded" | "load" | "commit" | "auto"
* **navigate:** Configurable `waitTimeout` option for SPA handling
* **navigate:** `waitForStability` option for post-load DOM stability checks

### Fixed

* **find_element_by_intent:** Spatial/structural matching improved from 0.15 to 0.9 for structural queries
* **responsive_test:** Now returns specific findings instead of just "major_issues"

## [11.4.0](https://github.com/alexandriashai/cbrowser/compare/v11.3.1...v11.4.0) (2026-02-07)

(Auto-generated by CI)

## [11.3.1](https://github.com/alexandriashai/cbrowser/compare/v11.3.0...v11.3.1) (2026-02-07)

(Features moved to 11.4.1)

## [11.3.0](https://github.com/alexandriashai/cbrowser/compare/v11.2.0...v11.3.0) (2026-02-07)

### Added

* **find_element_by_intent:** context-aware matching and last ordinal

## [11.2.0](https://github.com/alexandriashai/cbrowser/compare/v11.1.1...v11.2.0) (2026-02-07)

### Added

* **find_element_by_intent:** "last" ordinal support - `"last link"`, `"final button"` now work
* **find_element_by_intent:** Ordinals extended to 10th (sixth, seventh, eighth, ninth, tenth)
* **find_element_by_intent:** Container context matching - `"submit link in the navigation"` now boosts elements inside nav containers
* **repair_test:** Smart alternative suggestions based on page-scanned elements when target not found
* **repair_test:** Shows available clickable elements when no similar alternatives exist

### Fixed

* **find_element_by_intent:** Descriptive phrases with location context now match properly
* **repair_test:** "Add a wait" suggestion now has lower confidence; real alternatives preferred

## [11.1.1](https://github.com/alexandriashai/cbrowser/compare/v11.1.0...v11.1.1) (2026-02-07)

### Fixed

* **constitutional-ai:** context-aware classification reduces false positives ([8617535](https://github.com/alexandriashai/cbrowser/commit/86175350f89db7e7a7faf7868190a53a648d9354)), closes [#82](https://github.com/alexandriashai/cbrowser/issues/82)

## [11.1.0](https://github.com/alexandriashai/cbrowser/compare/v11.0.0...v11.1.0) (2026-02-07)

### Fixed

* **constitutional-ai:** Context-aware action classification to reduce false positives
  - Benign "submit" actions now allowed: submit search, submit review, submit feedback, submit form
  - Benign "remove" actions now allowed: remove filter, remove from cart, remove item
  - Benign "delete" actions now allowed: delete filter, delete draft, delete message
  - Benign "confirm" actions now allowed: confirm email, confirm selection, confirm password
  - Financial transactions still require `--force`: buy, purchase, pay, checkout, place order
  - Destructive actions still require `--force`: delete account, close account, remove permanently
  - Security violations still blocked: bypass, inject, hack, exploit, SQL injection, XSS

## [11.0.0](https://github.com/alexandriashai/cbrowser/compare/v10.9.1...v11.0.0) (2026-02-07)

### Fixed

* **find_element_by_intent:** Word-level tokenization and ordinal position support for semantic matching
* **smart_click:** Fixed findAlternativeSelectors to use compatible selector formats
* **repair_test:** Added select action handling and improved unknown action fallbacks
* **empathy_audit:** Removed trait-based skipping - all detectors now run unconditionally
* **empathy_audit:** Added empty alt text detection and missing form labels detector
* **compare_personas:** Fixed API-free detection on remote MCP servers
* **networkidle:** Progressive loading fallback for SPAs that never reach networkidle

## [10.9.1](https://github.com/alexandriashai/cbrowser/compare/v10.9.0...v10.9.1) (2026-02-07)

### Fixed

* address critical tool deficiencies identified in assessment ([514eae1](https://github.com/alexandriashai/cbrowser/commit/514eae143db6bc1ea92ebc235f26e21e87fb315f))

## [10.9.0](https://github.com/alexandriashai/cbrowser/compare/v10.7.1...v10.9.0) (2026-02-07)

### Added

* **mcp:** add API-free bridge workflow for compare_personas ([1b83a14](https://github.com/alexandriashai/cbrowser/commit/1b83a14754b2103dbe1d5e6759fe277cfe55f3e8))

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
