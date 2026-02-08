# Changelog

All notable changes to CBrowser will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [13.0.4](https://github.com/alexandriashai/cbrowser/compare/v13.0.3...v13.0.4) (2026-02-08)

### Fixed

* **license:** update Licensor and protect all immutable fields in CI ([58c8f45](https://github.com/alexandriashai/cbrowser/commit/58c8f4555f14b383b714d204db6a250bdf4537b0))

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
