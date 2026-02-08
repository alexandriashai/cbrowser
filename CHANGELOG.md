# Changelog

All notable changes to CBrowser will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [14.5.0](https://github.com/alexandriashai/cbrowser/compare/v14.4.0...v14.5.0) (2026-02-08)

### Added

* **stealth:** Constitutional Stealth Framework (#200)
  - Public framework for ethical stealth mode
  - Domain authorization model (allowlist only)
  - Action blacklist (CAPTCHA bypass, credential stuffing = BLOCKED)
  - Rate limiting (cannot be disabled)
  - Immutable audit trail interface
  - Terms of Service acceptance required
  - Full implementation available in cbrowser-enterprise

* **types:** New stealth-related interfaces
  - `StealthConfig`, `StealthAuthorization`, `StealthAcknowledgment`
  - `StealthRateLimits`, `StealthAuditEntry`, `StealthCheckResult`
  - `IConstitutionalEnforcer` abstract interface
  - `STEALTH_PROHIBITED_ACTIONS`, `STEALTH_PROHIBITED_DOMAINS`

* **stealth/framework.ts:** Base constitutional enforcer
  - `BaseConstitutionalEnforcer` abstract class
  - `NoOpConstitutionalEnforcer` for public repo (warns about enterprise)
  - Domain pattern matching utilities
  - Acknowledgment validation

## [14.4.0](https://github.com/alexandriashai/cbrowser/compare/v14.2.3...v14.4.0) (2026-02-08)

### Added

* v14.3.0 - React synthetic events, iframe traversal, content-aware diffing ([a601966](https://github.com/alexandriashai/cbrowser/commit/a6019664d36a1aa0a084f00e564ead75e51026f9)), closes [#193](https://github.com/alexandriashai/cbrowser/issues/193) [#194](https://github.com/alexandriashai/cbrowser/issues/194) [#195](https://github.com/alexandriashai/cbrowser/issues/195) [#196](https://github.com/alexandriashai/cbrowser/issues/196)

## [14.3.0](https://github.com/alexandriashai/cbrowser/compare/v14.2.5...v14.3.0) (2026-02-08)

### Added

* **browser:** React synthetic event dispatch after js-value-set (#193)
  - Uses native value setter + InputEvent for React-controlled inputs
  - Fixes fill operations on React Select, MUI, and other React components
* **browser:** Iframe traversal for element finding (Strategy 14) (#195)
  - Searches inside iframes when element not found in main frame
  - Tracks active frame for subsequent operations
* **cross-browser:** Content-aware layout comparison (#196)
  - Captures DOM structure and element positions
  - Distinguishes layout bugs from font rendering differences
  - If layouts match (>85%) but pixels differ, downgrades from fail to warning

### Fixed

* **browser:** Script tag filtering in text extraction (#194)
  - Clones DOM and removes script/style/noscript before extracting text
  - Prevents injected ad scripts from contaminating assertions

## [14.2.5](https://github.com/alexandriashai/cbrowser/compare/v14.2.4...v14.2.5) (2026-02-08)

### Fixed

* **retry-wrapper:** verify page URL after error recovery to prevent context desync (#189)
  - Captures expected URL before operation, restores after browser recovery
  - Prevents stale session state from loading wrong page on retry
* **empathy-audit:** add elderly-user persona mapping (#190)
  - "elderly-user" now correctly maps to "elderly-low-vision" accessibility persona
  - Added additional synonyms: "old"
* **cross-browser:** further relax thresholds for font rendering differences (#191)
  - fail→warning: 0.55→0.40 (WebKit vs Chromium can differ 40%+)
  - warning→pass: 0.70→0.55
* **empathy-audit:** barrierCount now shows unique barrier types, not element count (#192)
  - `barrierCount`: unique barrier types (was: total elements)
  - `totalBarrierElements`: new field for raw element count

## [14.2.4](https://github.com/alexandriashai/cbrowser/compare/v14.2.2...v14.2.4) (2026-02-08)

### Fixed

* **agent-audit:** fix grammar "Elements lacks" → "elements lack" (#183)
* **cross-browser:** relax visual diff thresholds for expected font/anti-aliasing differences (#184)
  - fail→warning threshold lowered from 0.60 to 0.55
  - warning→pass threshold lowered from 0.80 to 0.70
* **chaos-test:** clear browser cache before offline tests to prevent false positives (#185)
  - Cached resources would load even in offline mode, contaminating results
  - Now clears cookies and service worker caches before offline navigation
* **empathy-audit:** show unique barrier types count, not just total barriers (#186)
  - resultsSummary now includes `uniqueBarrierTypes` and `barrierTypes` array
* **find-element:** add synonym normalization for common variations (#187)
  - Maps "sign in"→"login", "register"→"signup", "send"→"submit", etc.
  - Clamps confidence to [0, 1] range to avoid invalid values
* **generate-tests:** detect newsletter, comment, booking, profile form types (#188)
  - Expanded form purpose detection beyond login/signup/search/contact/checkout

## [14.2.2](https://github.com/alexandriashai/cbrowser/compare/v14.2.0...v14.2.2) (2026-02-08)

### Fixed

* address v14.2.0 stress test regressions ([74725f4](https://github.com/alexandriashai/cbrowser/commit/74725f4c0f2b1edc8bdd4a690611eecc5e86c61b)), closes [#177](https://github.com/alexandriashai/cbrowser/issues/177) [#178](https://github.com/alexandriashai/cbrowser/issues/178) [#179](https://github.com/alexandriashai/cbrowser/issues/179) [#180](https://github.com/alexandriashai/cbrowser/issues/180)

## [14.2.1](https://github.com/alexandriashai/cbrowser/compare/v14.2.0...v14.2.1) (2026-02-08)

### Fixed

* **chaos-test:** CSS glob patterns (*.css, *.js) now work correctly in blockUrls
  - Regressed in v14.0.0, originally fixed in v11.10.6
  - Converts glob patterns like `*.css` to regex `\.css$` for proper matching

* **cross-browser:** Firefox crash fix in cross_browser_diff
  - Added proper browser cleanup in finally block
  - Prevents "Target page, context or browser has been closed" errors

* **hunt-bugs:** Console error deduplication
  - Identical errors now grouped with count (×N)
  - Reduces noise in bug reports

* **click verbose:** Increased element limit from 20 to 50
  - Better debugging output for pages with many clickable elements

* **browser:** Page health check before operations (fixes page desync)
  - `getPage()` now verifies page is responsive before returning
  - Auto-recovers from stale page references

* **mcp:** Retry wrapper for transient tool execution errors
  - navigate, click, fill, extract, screenshot, heal_stats now retry on transient failures
  - Auto-recovery on "Target closed", "Execution context", "Session closed" errors
  - Exponential backoff with browser recovery between attempts

## [14.2.0](https://github.com/alexandriashai/cbrowser/compare/v14.1.0...v14.2.0) (2026-02-08)

### Added

* **cognitive:** add Emotional State Engine with Scherer's Component Process Model ([292b0e6](https://github.com/alexandriashai/cbrowser/commit/292b0e6ed95775151553111986f73e2615df7f7f))

## [14.1.0](https://github.com/alexandriashai/cbrowser/compare/v14.0.0...v14.1.0) (2026-02-08)

### Added

* **cognitive:** Emotional State Engine based on Scherer's Component Process Model (2001)
  - 7 emotions: anxiety, frustration, boredom, confusion, satisfaction, excitement, relief
  - Valence-arousal dimensional model (Russell's Circumplex Model, 1980)
  - 12 emotional triggers: success, failure, error, progress, setback, waiting, discovery, completion, confusion_onset, clarity, time_pressure, recovery
  - Emotional decay toward baseline based on resilience trait
  - Abandonment risk modifiers based on emotional state

* **personas:** 4 emotion-specific personas for testing emotional response patterns
  - `anxious-user` - High baseline anxiety, low self-efficacy (Spielberger STAI, 1983)
  - `confident-user` - High self-efficacy, quick recovery (Bandura, 1977)
  - `emotional-user` - High affect intensity, strong reactions (Larsen & Diener, 1987)
  - `stoic-user` - High emotional regulation, calm under pressure (Gross, 2002)

* **reports:** Emotion visualization in HTML reports
  - Emotion bar showing relative intensities
  - Summary grid with dominant emotion, valence, arousal
  - Collapsible emotional journey timeline
  - Styled with Russell's Circumplex color mapping

* **mcp:** 3 new emotion manipulation tools
  - `get_emotional_state` - Get current emotional state for a persona
  - `trigger_emotional_event` - Simulate emotional trigger and see state changes
  - `list_emotional_personas` - List available emotion-focused personas

## [14.0.0](https://github.com/alexandriashai/cbrowser/compare/v11.10.7...v14.0.0) (2026-02-08)

### ⚠ BREAKING CHANGES

* v12.0.0 - Grade A milestone release with license clarification

### Added

* v12.0.0 - Grade A milestone release with license clarification ([b089b12](https://github.com/alexandriashai/cbrowser/commit/b089b121162e3f1cac53686e8a30e22f1d003364))

### Fixed

* **license:** update Licensor and protect all immutable fields in CI ([356443f](https://github.com/alexandriashai/cbrowser/commit/356443fa542b968ef4d612a4387617ffbff98888))

## [13.0.3](https://github.com/alexandriashai/cbrowser/compare/v13.0.2...v13.0.3) (2026-02-08)

## [13.0.2](https://github.com/alexandriashai/cbrowser/compare/v13.0.1...v13.0.2) (2026-02-08)

## [13.0.1](https://github.com/alexandriashai/cbrowser/compare/v13.0.0...v13.0.1) (2026-02-08)

### Fixed

* **license:** reference v8.6.0 when BSL-1.1 was first adopted ([662a949](https://github.com/alexandriashai/cbrowser/commit/662a94992c89ea0fb1320350b003dc6cfd9190fa))

## [13.0.0](https://github.com/alexandriashai/cbrowser/compare/v11.10.7...v13.0.0) (2026-02-08)

### ⚠ BREAKING CHANGES

* v12.0.0 - Grade A milestone release with license clarification

### Added

* v12.0.0 - Grade A milestone release with license clarification ([054c261](https://github.com/alexandriashai/cbrowser/commit/054c261eb407cdd85210e7de82985df344385a1c))

## [12.0.0](https://github.com/alexandriashai/cbrowser/compare/v11.10.7...v12.0.0) (2026-02-08)

### BREAKING CHANGES

* **license:** Updated BSL-1.1 license with Additional Use Grant clarification
  - Non-production use explicitly excludes production testing pipelines
  - Use of CBrowser as part of a production testing service requires commercial license

### Added

* **docs:** Independent assessment documentation (Grade A)
  - 17 issues tracked, 17 fixed, zero regressions
  - 31 of 34 tools graded A- or above
  - Best-in-class NL test runner recognition

* **copyright:** Added copyright headers to all 37 source files
  - © 2026 WF Media (Alexandria Eden)
  - BSL-1.1 license reference in each file

### Fixed

* **empathy-audit:** Barrier deduplication now groups by TYPE across all personas
  - 10 duplicate barriers → 1 entry with element count and persona list
  - `affectedPersonas` accurately lists all tested personas

* **empathy-audit:** goalAchieved calibration distinguishes friction from blockers
  - Small touch targets, low contrast = friction (goalAchieved: true)
  - Timing barriers = blockers (goalAchieved: false)

* **chaos-test:** Multi-block URLs now works (`["*.css", "*.js"]`)

### Changed

* **marketing:** README updated with Grade A assessment, confidence-forward messaging
* **version:** LICENSE now references v12.0.0

## [11.10.7](https://github.com/alexandriashai/cbrowser/compare/v11.10.6...v11.10.7) (2026-02-08)

## [11.10.6](https://github.com/alexandriashai/cbrowser/compare/v11.10.5...v11.10.6) (2026-02-08)

### Fixed

* **empathy-audit:** barrier dedup by type + goalAchieved calibration

## [11.10.5](https://github.com/alexandriashai/cbrowser/compare/v11.10.4...v11.10.5) (2026-02-08)

## [11.10.4](https://github.com/alexandriashai/cbrowser/compare/v11.10.3...v11.10.4) (2026-02-08)

### Fixed

* address A+ stress test findings for v11.11.0 ([d3e17e6](https://github.com/alexandriashai/cbrowser/commit/d3e17e604929f30be8505df04ba46be91033e217)), closes [#144](https://github.com/alexandriashai/cbrowser/issues/144) [#145](https://github.com/alexandriashai/cbrowser/issues/145) [#146](https://github.com/alexandriashai/cbrowser/issues/146) [#147](https://github.com/alexandriashai/cbrowser/issues/147)

## [11.10.3](https://github.com/alexandriashai/cbrowser/compare/v11.10.2...v11.10.3) (2026-02-08)

### Fixed

* **empathy-audit:** deduplicate barriers and fix 0/100 scoring ([#86](https://github.com/alexandriashai/cbrowser/issues/86)) ([265ac22](https://github.com/alexandriashai/cbrowser/commit/265ac2215f5f5dbbb4dc9de1caf2acbad20c7574))

## [11.10.2](https://github.com/alexandriashai/cbrowser/compare/v11.10.1...v11.10.2) (2026-02-08)

### Fixed

* address issues [#93](https://github.com/alexandriashai/cbrowser/issues/93) and [#88](https://github.com/alexandriashai/cbrowser/issues/88) with cross-browser and AB comparison ([22bb3c6](https://github.com/alexandriashai/cbrowser/commit/22bb3c69cefb44b14223638590bfeb0021ad1625))

## [11.10.1](https://github.com/alexandriashai/cbrowser/compare/v11.10.0...v11.10.1) (2026-02-08)

### Fixed

* address issues [#84](https://github.com/alexandriashai/cbrowser/issues/84), [#89](https://github.com/alexandriashai/cbrowser/issues/89), [#92](https://github.com/alexandriashai/cbrowser/issues/92) with enhanced detection and reporting ([12a859f](https://github.com/alexandriashai/cbrowser/commit/12a859fff4a19619632433e186c7187644fa5fdd))

## [11.10.0](https://github.com/alexandriashai/cbrowser/compare/v11.9.0...v11.10.0) (2026-02-08)

### Added

* **browser:** add automatic crash recovery with exponential backoff ([bfc98fa](https://github.com/alexandriashai/cbrowser/commit/bfc98fa6e49717959c4822deb3c4777679fda3f3)), closes [#83](https://github.com/alexandriashai/cbrowser/issues/83)

## [11.9.0](https://github.com/alexandriashai/cbrowser/compare/v11.7.2...v11.9.0) (2026-02-08)

### Added

* v11.8.0 - confidence gating, intent typing, response fixes ([760b761](https://github.com/alexandriashai/cbrowser/commit/760b761e8bec5d7b98efbc0484d494d7ec299cd3))

* **browser:** Automatic browser crash recovery with exponential backoff
  - `isBrowserHealthy()` - Check if browser is responsive (5s timeout)
  - `recoverBrowser()` - Restart browser after crash with URL restoration
  - `withCrashRecovery()` - Wrapper for auto-recovery during operations
  - Detects: Target closed, Browser disconnected, Execution context destroyed

* **mcp:** Three new browser management tools
  - `browser_health` - Check browser health status before operations
  - `browser_recover` - Manually trigger crash recovery
  - `reset_browser` - Reset to clean state (clears cookies, storage)

## [11.7.2](https://github.com/alexandriashai/cbrowser/compare/v11.7.0...v11.7.2) (2026-02-08)

### Fixed

* v11.7.1 bug fixes from MCP demo testing

## [11.7.0](https://github.com/alexandriashai/cbrowser/compare/v11.6.3...v11.7.0) (2026-02-08)

### Added

* **mcp:** add step-level statistics to NL test responses

## [11.6.0](https://github.com/alexandriashai/cbrowser/compare/v11.5.0...v11.6.0) (2026-02-07)

### Added

* **cognitive:** add trustCalibration and interruptRecovery traits

## [11.5.0](https://github.com/alexandriashai/cbrowser/compare/v11.4.1...v11.5.0) (2026-02-07)

### Added

* **cognitive:** 4 new research-backed cognitive traits for realistic user simulation
  - `selfEfficacy` - Belief in problem-solving ability (Bandura 1977)
  - `satisficing` - Accept "good enough" vs. seek optimal (Simon 1956)
  - `trustCalibration` - Baseline trust toward websites (Fogg 2003)
  - `interruptRecovery` - Ability to resume after interruption (Mark 2005)
