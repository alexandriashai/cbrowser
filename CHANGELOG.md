# Changelog

All notable changes to CBrowser will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [11.10.0](https://github.com/alexandriashai/cbrowser/compare/v11.9.0...v11.10.0) (2026-02-08)

### Added

* **browser:** add automatic crash recovery with exponential backoff ([bfc98fa](https://github.com/alexandriashai/cbrowser/commit/bfc98fa6e49717959c4822deb3c4777679fda3f3)), closes [#83](https://github.com/alexandriashai/cbrowser/issues/83) [#83](https://github.com/alexandriashai/cbrowser/issues/83)

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

* **types:** New error codes for browser lifecycle (E801-E804)
  - `BROWSER_CRASHED` - Browser process crashed
  - `BROWSER_DISCONNECTED` - Browser connection lost
  - `BROWSER_UNRESPONSIVE` - Browser not responding
  - `BROWSER_RECOVERY_FAILED` - Recovery attempts exhausted

* **types:** Structured crash response for agent decision-making
  ```typescript
  interface BrowserCrashResponse {
    error: "browser_crash";
    errorCode: CBrowserErrorCode;
    recovering: boolean;
    retryAfterMs: number;
    operation?: string;
  }
  ```

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
