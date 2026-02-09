# Changelog

All notable changes to CBrowser will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [16.17.0](https://github.com/alexandriashai/cbrowser/compare/v16.16.2...v16.17.0) (2026-02-09)

### Added

* **mcp:** add extensible remote MCP server API for enterprise ([049bfca](https://github.com/alexandriashai/cbrowser/commit/049bfca5d9aa7c84d6320690a54a477c6c0a5829))

## [16.16.2](https://github.com/alexandriashai/cbrowser/compare/v16.16.1...v16.16.2) (2026-02-09)

## [16.16.1](https://github.com/alexandriashai/cbrowser/compare/v16.16.0...v16.16.1) (2026-02-09)

## [16.16.0](https://github.com/alexandriashai/cbrowser/compare/v16.15.5...v16.16.0) (2026-02-09)

### Added

* add extensible MCP server API for Enterprise integration ([9467829](https://github.com/alexandriashai/cbrowser/commit/94678297345ffae18b414a414fb51ccf7a3407fc))

## [16.15.5](https://github.com/alexandriashai/cbrowser/compare/v16.15.4...v16.15.5) (2026-02-09)

## [16.15.4](https://github.com/alexandriashai/cbrowser/compare/v16.15.3...v16.15.4) (2026-02-09)

## [16.15.3](https://github.com/alexandriashai/cbrowser/compare/v16.15.2...v16.15.3) (2026-02-09)

### Fixed

* sync docs with wiki citation audit ([3650549](https://github.com/alexandriashai/cbrowser/commit/36505493c46ba043749fe0c49c34510de68e3b2a)), closes [#95](https://github.com/alexandriashai/cbrowser/issues/95)

## [16.15.2](https://github.com/alexandriashai/cbrowser/compare/v16.15.1...v16.15.2) (2026-02-09)

## [16.15.1](https://github.com/alexandriashai/cbrowser/compare/v16.15.0...v16.15.1) (2026-02-09)

## [16.15.0](https://github.com/alexandriashai/cbrowser/compare/v16.14.6...v16.15.0) (2026-02-09)

### Added

* **config:** session-scoped screenshots for multi-user MCP safety ([e741fb0](https://github.com/alexandriashai/cbrowser/commit/e741fb08b6ff09676c9acaedbcc31869ad8310cb))
* **mcp:** add native MCP SDK OAuth server with Express ([111dd89](https://github.com/alexandriashai/cbrowser/commit/111dd89799a1f257141d7cb3eb7f2811e0dd1f0f))

## [16.14.6](https://github.com/alexandriashai/cbrowser/compare/v16.14.5...v16.14.6) (2026-02-09)

### Documentation

* **skill:** Updated /CBrowser skill with three equal invocation methods (Local Tool, CLI, MCP)
* **workflows:** Added invocation options to Navigate.md, Interact.md, Extract.md, CognitiveJourney.md
* **docs:** Fixed outdated `mcp__chrome-devtools__*` references to `mcp__claude_ai_CBrowser_Demo__*`

## [16.14.5](https://github.com/alexandriashai/cbrowser/compare/v16.14.4...v16.14.5) (2026-02-09)

### Documentation

* **readme:** Version reference updates to v16.14.6
* **cognitive traits:** Updated from 12 to 25 research-backed traits in README

## [16.14.4](https://github.com/alexandriashai/cbrowser/compare/v16.14.2...v16.14.4) (2026-02-09)

### Fixed

* **values:** persona name alias support v16.14.3 ([939b934](https://github.com/alexandriashai/cbrowser/commit/939b934166780ce7aa360ec3ce9e38f39ebece3c))

## [16.14.3] - 2026-02-09

### Fixed
- **Persona Value Name Aliases** - `persona_values_lookup` now accepts both full names (`cognitive-adhd`) and short names (`adhd`)
- `PERSONA_NAME_ALIASES` - Maps accessibility persona full names to value profile short names
- `resolvePersonaName()` - New helper function for name normalization
- Bidirectional alias support: "cognitive-adhd" → "adhd" and "adhd" → "adhd" both work

### Name Mapping
| Full Name | Short Name (Value Profile) |
|-----------|---------------------------|
| `cognitive-adhd` | `adhd` |
| `motor-impairment-tremor` | `motor-tremor` |
| `low-vision-magnified` | `low-vision` |
| `color-blind-deuteranopia` | `color-blind` |

## [16.14.2](https://github.com/alexandriashai/cbrowser/compare/v16.14.0...v16.14.2) (2026-02-09)

### Fixed

* **personas:** unified lookup for all persona registries v16.14.1 ([93b2a62](https://github.com/alexandriashai/cbrowser/commit/93b2a622747dd1c777d394c69381debb359bdbc7))

## [16.14.1] - 2026-02-09

### Fixed
- **Persona Name Mismatch Bug** - `compare_personas_init` and `cognitive_journey_init` now correctly find accessibility personas like `cognitive-adhd` instead of falling back to generic stubs
- `getAnyPersona()` - New unified lookup function that checks ALL persona registries (custom, builtin, accessibility, emotional)
- `listAllPersonas()` - New function to list all persona names from all registries
- `getCognitiveProfile()` - Now accepts both `Persona` and `AccessibilityPersona` types with proper trait merging

### Bug Details
- **Symptom:** `compare_personas_init` would return flattened generic profiles for accessibility personas
- **Root Cause:** `getPersona()` only checked `BUILTIN_PERSONAS`, not `ACCESSIBILITY_PERSONAS`
- **Impact:** Accessibility personas like `cognitive-adhd` lost their differentiated traits (workingMemory: 0.25, patience: 0.25) and became generic 0.5 stubs

## [16.14.0](https://github.com/alexandriashai/cbrowser/compare/v16.13.0...v16.14.0) (2026-02-09)

### Added

* **values:** trait-based value derivation for general personas v16.14.0 ([e0270e1](https://github.com/alexandriashai/cbrowser/commit/e0270e16c488d32d9b58121e5ab53ab057a83439))

## [16.14.0] - 2026-02-09

### Added
- **Trait-Based Value Derivation** - General-category personas now derive Schwartz values from their cognitive traits instead of flat 0.5 defaults
- `TRAIT_VALUE_CORRELATIONS` - 12 research-backed trait-to-value mappings (curiosity→stimulation, riskTolerance→security, etc.)
- `deriveValuesFromTraits()` - Weighted value derivation from cognitive traits
- `valueDerivations` field in persona output - Shows exactly which traits influenced which values
- General category now uses `valueStrategy: "trait_based"` instead of "neutral"

### Research Citations
- Kashdan, T.B., et al. (2018) - Five-dimensional curiosity scale
- Duckworth, A.L. (2016) - Grit and achievement motivation
- Cialdini, R.B. (2001) - Social proof and conformity
- Bandura, A. (1997) - Self-efficacy and autonomy
- Przybylski, A.K. (2013) - FOMO and novelty-seeking

## [16.13.0](https://github.com/alexandriashai/cbrowser/compare/v16.10.0...v16.13.0) (2026-02-09)

### Added

* **values:** add research-backed values system v16.12.0 ([96230da](https://github.com/alexandriashai/cbrowser/commit/96230da350db470a0f763cb1b5f8cf700fa8cb5c))

## [16.12.0] - 2026-02-09

### Added
- **Research-Backed Values System** - All personas now include Schwartz's 10 Universal Values, Higher-Order Values, SDT Needs, and Maslow's Hierarchy level
- **Category-Aware Persona Creation** - New personas automatically get appropriate values based on their category (cognitive, physical, sensory, emotional, general)
- `detectPersonaCategory()` - Automatically detects persona category from name/description
- `buildValuesFromCategory()` - Generates research-backed values for each category
- `validateCategoryValues()` - Warns when values don't match category research
- `persona_values_lookup` MCP tool - Look up value profile for any persona
- `list_influence_patterns` MCP tool - Get persuasion patterns with persona susceptibility
- `persona_category_guidance` MCP tool - Get research-based guidance for each category
- `COGNITIVE_SUBTYPES` - ADHD-combined, autism-spectrum, dyslexia subtypes with specific values
- `researchBasis` field on all accessibility persona value profiles with academic citations

### Research Citations
- Schwartz, S.H. (1992, 2012) - Theory of Basic Human Values
- Deci, E.L. & Ryan, R.M. (1985, 2000) - Self-Determination Theory
- Maslow, A.H. (1943) - Hierarchy of Needs
- Barkley, R.A. (2015) - ADHD dopamine research
- Volkow, N.D. et al. (2011) - ADHD motivation deficits

## [16.10.0](https://github.com/alexandriashai/cbrowser/compare/v16.9.4...v16.10.0) (2026-02-09)

### Added

* **personas:** apply trait correlations to improve differentiation ([0633972](https://github.com/alexandriashai/cbrowser/commit/0633972988a9b484534687000b1f5fea191b2da8))

## [16.9.4](https://github.com/alexandriashai/cbrowser/compare/v16.9.3...v16.9.4) (2026-02-09)

### Fixed

* **questionnaire:** use meaningful short headers instead of truncation ([7376513](https://github.com/alexandriashai/cbrowser/commit/7376513d1f15ee7cb0c1ca1a74daad1a6eb18683))

## [16.9.3](https://github.com/alexandriashai/cbrowser/compare/v16.9.2...v16.9.3) (2026-02-09)

### Fixed

* **stealth:** reduce stealth_diagnose false positives ([61b49ea](https://github.com/alexandriashai/cbrowser/commit/61b49eab031a8d2afe3f90535f47030828adb029))

## [16.9.2](https://github.com/alexandriashai/cbrowser/compare/v16.9.1...v16.9.2) (2026-02-09)

### Fixed

* **overlay:** deduplicate overlay dismissal attempts ([1e31e7a](https://github.com/alexandriashai/cbrowser/commit/1e31e7ad21efabaf72b15d16536af5c3dab32bf9))

## [16.9.1](https://github.com/alexandriashai/cbrowser/compare/v16.9.0...v16.9.1) (2026-02-09)

### Fixed

* **questionnaire:** round trait values to fix floating-point precision artifacts ([01ffeed](https://github.com/alexandriashai/cbrowser/commit/01ffeed13a4768036cb8ea9903d8f6bc01be573c))

## [16.9.0](https://github.com/alexandriashai/cbrowser/compare/v16.8.1...v16.9.0) (2026-02-09)

### Added

* **performance:** add FCP and TTFB ratings to baseline ([57f7853](https://github.com/alexandriashai/cbrowser/commit/57f7853cf8861979090c23ca2f3d8cb7c17a541d))

## [16.8.1](https://github.com/alexandriashai/cbrowser/compare/v16.8.0...v16.8.1) (2026-02-09)

### Fixed

* **empathy-audit:** separate barrier types from element counts ([fb2cef5](https://github.com/alexandriashai/cbrowser/commit/fb2cef55107cd8e20adf09a8b2099876b50336c6)), closes [#86](https://github.com/alexandriashai/cbrowser/issues/86)

## [16.8.0](https://github.com/alexandriashai/cbrowser/compare/v16.7.2...v16.8.0) (2026-02-09)

### Added

* add wait-for-content directive and values system ([369a31d](https://github.com/alexandriashai/cbrowser/commit/369a31da7da5487d3f2d813f53385532790d3bac))

## [16.7.2](https://github.com/alexandriashai/cbrowser/compare/v16.7.1...v16.7.2) (2026-02-09)

## [16.7.1](https://github.com/alexandriashai/cbrowser/compare/v16.7.0...v16.7.1) (2026-02-09)

## [16.7.0](https://github.com/alexandriashai/cbrowser/compare/v16.5.0...v16.7.0) (2026-02-09)

### Added

* **personas:** add research-based questionnaire system for custom persona generation ([1187ded](https://github.com/alexandriashai/cbrowser/commit/1187ded259b0632126d18644c201ea6caf130a03))

## [16.6.0] - 2026-02-08

### Added

* **persona-questionnaire:** Research-based persona generation via interactive questionnaire
* **persona-questionnaire:** 25 cognitive traits with 5-level behavioral mappings (0, 0.25, 0.5, 0.75, 1.0)
* **persona-questionnaire:** Research citations for each trait (Bandura, Kahneman, Nielsen, Fogg, etc.)
* **persona-questionnaire:** Trait correlations automatically apply (e.g., low patience → low resilience)
* **mcp:** `persona_questionnaire_get` - Get questionnaire for building custom personas
* **mcp:** `persona_questionnaire_build` - Build persona from questionnaire answers
* **mcp:** `persona_trait_lookup` - Look up behavioral descriptions for trait values
* **cli:** `persona-questionnaire start` - Interactive questionnaire for building personas
* **cli:** `persona-questionnaire list-traits` - List all 25 traits with research basis
* **cli:** `persona-questionnaire lookup --trait <name> --value <0-1>` - Behavioral lookup

### Changed

* **mcp:** Tool count increased from 45 to 48

### Notes

The persona questionnaire system solves the issue where AI-generated custom personas defaulted traits to 0.5.
Now each trait has research-backed behavioral descriptions at multiple levels, enabling accurate differentiated persona generation.

## [16.5.0](https://github.com/alexandriashai/cbrowser/compare/v16.4.0...v16.5.0) (2026-02-09)

### Added

* v16.4.0 - Cloudflare handling, proxy support, A+ grade ([d9d09ce](https://github.com/alexandriashai/cbrowser/commit/d9d09ceda44ef1651255766481a08ee2b25f7bab))

## [16.4.0](https://github.com/alexandriashai/cbrowser/compare/v16.3.0...v16.4.0) (2026-02-08)

### 🏆 Grade A+ Assessment

CBrowser achieved **Grade A+** in comprehensive testing by Claude (Opus 4.6):
- **640+ tool invocations** across 11 real-world sites
- **31 of 33 tools** graded A or above (5 at A+)
- **19 bugs found, 19 fixed, 0 open**
- **100%** NL test pass rate, cross-domain reliability, persona return rate

[View Full Assessment →](https://claude.ai/public/artifacts/0cee560d-60b8-44d6-8eec-e674fbfac9c4)

### Added

* **mcp:** add stealth/enterprise tools to remote MCP server ([37403e9](https://github.com/alexandriashai/cbrowser/commit/37403e985958fbe073667980a2247353999a51e8))
* **cloudflare:** `cloudflare_detect` MCP tool - detect Cloudflare challenge pages (turnstile, managed, interstitial, js-challenge)
* **cloudflare:** `cloudflare_wait` MCP tool - wait for Cloudflare challenges to resolve with configurable timeout
* **cloudflare:** `detectCloudflareChallenge()` and `waitForCloudflareResolution()` browser methods
* **stealth:** `stealth_diagnose` MCP tool - analyze what bot detection methods a site uses
* **proxy:** Residential/datacenter proxy support via `CBROWSER_PROXY` env var or `stealth_enable` params
* **proxy:** `ProxyConfig` interface with server, username, password, and bypass options

### Changed

* **stealth:** `stealth_disable` now preserves browser state (no recovery needed)
* **stealth:** `stealth_enable` accepts optional proxy configuration for IP-based detection bypass
* **stealth:** `stealth_status` shows proxy configuration when active

### Fixed

* **stealth:** Browser state no longer reset when disabling stealth mode

## [16.3.0](https://github.com/alexandriashai/cbrowser/compare/v16.2.0...v16.3.0) (2026-02-08)

### Added

* **exports:** add stealth module to package exports ([b80f96a](https://github.com/alexandriashai/cbrowser/commit/b80f96ae803efc598423cba64727b95b0a6362be))

## [16.2.0](https://github.com/alexandriashai/cbrowser/compare/v16.1.0...v16.2.0) (2026-02-08)

### Added

* **enterprise:** add dynamic enterprise module loader ([c584d13](https://github.com/alexandriashai/cbrowser/commit/c584d1381f5eb4f38e4d77fd4cfcbcebf15e3bcc))

## [16.1.0](https://github.com/alexandriashai/cbrowser/compare/v16.0.0...v16.1.0) (2026-02-08)

### Added

* **personas:** add comprehensive trait reference matrix (v15.0.0) ([ce58f58](https://github.com/alexandriashai/cbrowser/commit/ce58f5867a39e847a74a5d1fe62b9cc261068dbf))

## [16.0.0](https://github.com/alexandriashai/cbrowser/compare/v14.6.0...v16.0.0) (2026-02-08)

### ⚠ BREAKING CHANGES

* **cognitive:** CognitiveTraits interface expanded from 12 to 25 traits

New traits with research basis:
- informationForaging (Pirolli & Card 1999)
- changeBlindness (Simons & Chabris 1999)
- anchoringBias (Tversky & Kahneman 1974)
- timeHorizon (Frederick et al. 2002)
- attributionStyle (Weiner 1985)
- metacognitivePlanning (Flavell 1979)
- proceduralFluency (Sweller 1988)
- transferLearning (Barnett & Ceci 2002)
- authoritySensitivity (Milgram 1963, Cialdini 2001)
- emotionalContagion (Hatfield et al. 1993)
- fearOfMissingOut (Przybylski et al. 2013)
- socialProofSensitivity (Cialdini 2001)
- mentalModelRigidity (Johnson-Laird 1983, Norman 1988)

All 19 personas updated with complete 25-trait coverage.

### Added

* **cognitive:** add 13 new research-backed cognitive traits (v15.0.0) ([8e6c64f](https://github.com/alexandriashai/cbrowser/commit/8e6c64f750715e2e12017d55fa3ac2be29847d39)), closes [#59](https://github.com/alexandriashai/cbrowser/issues/59) [#61](https://github.com/alexandriashai/cbrowser/issues/61) [#62](https://github.com/alexandriashai/cbrowser/issues/62) [#64](https://github.com/alexandriashai/cbrowser/issues/64) [#65](https://github.com/alexandriashai/cbrowser/issues/65) [#66](https://github.com/alexandriashai/cbrowser/issues/66) [#68](https://github.com/alexandriashai/cbrowser/issues/68) [#69](https://github.com/alexandriashai/cbrowser/issues/69) [#70](https://github.com/alexandriashai/cbrowser/issues/70) [#72](https://github.com/alexandriashai/cbrowser/issues/72) [#74](https://github.com/alexandriashai/cbrowser/issues/74) [#76](https://github.com/alexandriashai/cbrowser/issues/76) [#80](https://github.com/alexandriashai/cbrowser/issues/80)

## [15.0.0](https://github.com/alexandriashai/cbrowser/compare/v14.6.0...v15.0.0) (2026-02-08)

### Added

* **cognitive:** 13 new research-backed cognitive traits for enhanced persona simulation
  - `informationForaging` - Pirolli & Card (1999) - Information scent following
  - `changeBlindness` - Simons & Chabris (1999) - Inattentional blindness
  - `anchoringBias` - Tversky & Kahneman (1974) - First-information weighting
  - `timeHorizon` - Frederick et al. (2002) - Immediate vs. delayed gratification
  - `attributionStyle` - Weiner (1985) - Self vs. system blame for errors
  - `metacognitivePlanning` - Flavell (1979) - Planning before acting
  - `proceduralFluency` - Sweller (1988) - Following step-by-step instructions
  - `transferLearning` - Barnett & Ceci (2002) - Applying knowledge across UIs
  - `authoritySensitivity` - Milgram (1963), Cialdini (2001) - Authority compliance
  - `emotionalContagion` - Hatfield et al. (1993) - Mood influence from UI
  - `fearOfMissingOut` - Przybylski et al. (2013) - FOMO-driven decisions
  - `socialProofSensitivity` - Cialdini (2001) - Review/rating influence
  - `mentalModelRigidity` - Johnson-Laird (1983), Norman (1988) - UI pattern adaptation

* **personas:** All 19 built-in personas updated with complete trait coverage
  - 6 BUILTIN_PERSONAS (power-user, first-timer, mobile-user, screen-reader-user, elderly-user, impatient-user)
  - 7 ACCESSIBILITY_PERSONAS (motor-tremor, low-vision, adhd, dyslexic, deaf, elderly-low-vision, color-blind)
  - 4 EMOTIONAL_PERSONAS (anxious-user, confident-user, emotional-user, stoic-user)
  - Dynamic persona generation from descriptions includes all 25 traits

### Changed

* **BREAKING:** CognitiveTraits interface expanded from 12 to 25 optional traits
  - Existing code continues to work (all new traits are optional)
  - Upgrade path: Add new trait values to custom personas for full simulation fidelity

### Closed

* Closes #59 (mentalModelRigidity)
* Closes #61 (socialProofSensitivity)
* Closes #62 (fearOfMissingOut)
* Closes #64 (emotionalContagion)
* Closes #65 (authoritySensitivity)
* Closes #66 (transferLearning)
* Closes #68 (proceduralFluency)
* Closes #69 (metacognitivePlanning)
* Closes #70 (attributionStyle)
* Closes #72 (timeHorizon)
* Closes #74 (anchoringBias)
* Closes #76 (changeBlindness)
* Closes #80 (informationForaging)

## [14.6.0](https://github.com/alexandriashai/cbrowser/compare/v14.4.1...v14.6.0) (2026-02-08)

### Added

* v14.5.0 - Constitutional Stealth Framework ([7ad1945](https://github.com/alexandriashai/cbrowser/commit/7ad19452f55a4589e79c63c79636058738eac09d))

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
