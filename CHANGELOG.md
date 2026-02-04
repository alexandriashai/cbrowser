# Changelog

All notable changes to CBrowser will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [7.4.19] - 2026-02-03

### Added
- **Rich session metadata** - `listSessionsDetailed()` returns `SessionMetadata[]` with name, domain, cookies count, localStorage/sessionStorage key counts, created/lastUsed dates, file size (#7)
- **`session show <name>` CLI command** - Detailed session info: domain, URL, dates, cookies by domain, localStorage/sessionStorage keys with previews, viewport, file size
- **`session cleanup --older-than <days>` CLI command** - Delete sessions older than N days for maintenance
- **`session export <name> --output <file>` CLI command** - Export session to portable JSON file
- **`session import <file> --name <name>` CLI command** - Import session from JSON file
- **`delete_session` MCP tool** - Tool #33 for deleting sessions via MCP
- **Cross-domain session warning** - `loadSession()` returns `LoadSessionResult` with warning when session domain differs from current page

### Changed
- **`list_sessions` MCP tool** - Returns enriched `SessionMetadata[]` with domain, cookies, size instead of bare name array
- **`session list` CLI** - Now displays formatted table with Name, Domain, Created, Cookies, Size columns
- **`session load` CLI** - Shows restored counts and cross-domain warnings

### Technical Details
- `SessionMetadata` interface: name, created, lastUsed, domain, url, cookies, localStorageKeys, sessionStorageKeys, sizeBytes
- `LoadSessionResult` interface: success, name, cookiesRestored, localStorageKeysRestored, sessionStorageKeysRestored, warning?
- `listSessionsDetailed()` reads session files + statSync for size, sorted by lastUsed descending
- `getSessionDetails(name)` returns full `SavedSession` for show command
- `cleanupSessions(olderThanDays)` returns `{ deleted, kept }` arrays
- `exportSession(name, outputPath)` / `importSession(inputPath, name)` for portable sessions
- `listSessions()` now excludes `last-session.json` from results

## [7.4.18] - 2026-02-03

### Added
- **Configurable performance regression sensitivity** - Dual thresholds: both percentage AND absolute change must be exceeded to flag a regression (#5)
- **Three sensitivity profiles** - `strict` (CI/CD), `normal` (default), `lenient` (development) with per-metric percent and absolute thresholds
- **`--sensitivity` CLI flag** - `npx cbrowser perf-regression <url> <baseline> --sensitivity strict`
- **`sensitivity` MCP parameter** - `perf_regression` tool accepts `strict`, `normal`, `lenient`
- **Noise threshold notes** - Large percentage changes within absolute noise threshold reported as informational notes instead of regressions

### Fixed
- **False positive regressions** - A 16ms FCP change (66%) is no longer flagged as "critical". Normal profile requires both 20% AND 100ms absolute change for FCP.

### Technical Details
- `SensitivityProfile` and `DualThreshold` types in types.ts
- `SENSITIVITY_PROFILES` constant with strict/normal/lenient presets
- `resolveThreshold()` merges custom > profile > legacy > normal defaults
- `PerformanceRegressionResult` includes `sensitivity`, `notes` fields
- `PerformanceComparison` includes optional `note` for noise threshold info
- `MetricRegression` includes `absoluteThreshold` field

## [7.4.17] - 2026-02-03

### Added
- **Accessibility-first element finding** - `findElementByIntent` now uses ARIA-first selector strategy: aria-label > aria-labelledby > role > semantic HTML > input-type > ID > data-testid > name > css-class (#9)
- **`selectorType` field** - Returns which selector strategy matched (e.g., `"aria-label"`, `"role"`, `"semantic-element"`)
- **`accessibilityScore` (0-1)** - Quantifies element's accessibility quality based on ARIA attributes, semantic HTML, and label associations
- **Enhanced alternatives** - Verbose mode returns typed alternatives with `type: SelectorStrategyType` and confidence scores per strategy
- **Enhanced `hunt_bugs` a11y checks** - New checks for missing alt text, empty links, placeholder-only labels, non-interactive onclick handlers, heading level skips
- **Actionable recommendations** - Every bug report includes a `recommendation` field with specific fix suggestions

### Technical Details
- `SelectorStrategyType` union type: 11 strategy types for selector classification
- `SELECTOR_PRIORITY` array defines strategy order with base confidence scores
- `generatePrioritySelectors(el)` generates ordered selector candidates from enriched element data
- `calculateAccessibilityScore(el)` scores: aria-label (+0.3), role (+0.2), semantic element (+0.2), label association (+0.2), text content (+0.1)
- `EnrichedPageElement` collects ariaLabel, ariaLabelledby, role, name, title, dataTestId, placeholder, isSemanticElement
- `BugReport.recommendation` field added for all bug types

## [7.4.16] - 2026-02-03

### Added
- **`--verbose` flag for `click` and `fill`** - Returns available elements/inputs, AI suggestions, and debug screenshots on failure (#8)
- **`verbose` parameter for MCP tools** - `click`, `fill`, and `find_element_by_intent` MCP tools accept `verbose: true` for enriched failure responses
- **Debug screenshots with highlighting** - `captureDebugScreenshot()` injects green outlines on available elements and red outline on attempted selector
- **`--step-through` mode for `test-suite`** - Interactive step-by-step execution with parsed interpretation, Enter to execute, `s` to skip, `q` to quit
- **`--debug-dir` flag** - Save debug screenshots to a custom directory
- **AI suggestions for `fill` failures** - Lists available input fields with selector, type, name, placeholder, and associated label
- **AI suggestions for `click` failures** - Lists available clickable elements with tag, text, and selector
- **`findElementByIntent` verbose mode** - Returns alternatives array with confidence scores and AI suggestion when no match found

### Technical Details
- `getAvailableClickables(page)` — enumerates buttons, links, role=button elements (up to 15)
- `getAvailableInputs(page)` — enumerates inputs/textareas/selects with label association (up to 15)
- `generateClickSuggestion()` / `generateFillSuggestion()` — context-aware fix suggestions
- `captureDebugScreenshot()` — injects CSS outlines, screenshots, cleans up highlights
- `ClickResult` extended with optional `availableElements`, `availableInputs`, `aiSuggestion`, `debugScreenshot`
- `FindByIntentResult` type with `alternatives` and `aiSuggestion` fields
- Step-through uses Node.js readline with graceful stdin close handling

## [7.4.15] - 2026-02-03

### Added
- **Enhanced NL test error reporting** - Step-level results with parsed instructions, enriched errors, partial matches, and AI suggestions (#6)
- **`--dry-run` flag for `test-suite`** - Parse and display test steps without executing, in CLI and MCP tools
- **`--fuzzy-match` flag for `test-suite`** - Case-insensitive, whitespace-normalized matching for text assertions
- **Recommendations engine** - Auto-generated recommendations based on failure patterns (e.g., "use fuzzy matching", "check for overlays")
- **Step-level report details** - `formatNLTestReport` now shows each step with parsed action, duration, enriched errors, partial matches, and suggestions
- **MCP tools return step-level data** - `nl_test_file` and `nl_test_inline` now return full step results with `dryRun` and `fuzzyMatch` params

### Technical Details
- `NLTestStepError` interface: `reason`, `actual`, `expected`, `partialMatches`, `suggestion`
- `NLTestStepResult` includes `parsed: NLTestStep` field for parsed interpretation
- `NLTestSuiteResult` includes optional `recommendations` array
- `findPartialMatches()` - word-by-word overlap search with context extraction
- `generateAssertionSuggestion()` - context-aware fix suggestions per assertion type
- `generateRecommendations()` - aggregate failure pattern analysis
- `dryRunNLTestSuite()` - returns parsed steps without browser execution

## [7.4.14] - 2026-02-03

### Added
- **`dismiss_overlay` MCP tool** - Detect and dismiss modal overlays (cookie consent, age verification, newsletter popups). Tool #32. (#3)
- **`dismiss-overlay` CLI command** - `npx cbrowser dismiss-overlay --type auto --url <url>` with auto/cookie/age-verify/newsletter/custom types
- **`--dismiss-overlays` flag for `smart_click`** - Pre-dismiss overlays before clicking, in both MCP tool and CLI
- **Multi-pass overlay dismissal** - Automatically handles cascading overlays (e.g., age verification followed by welcome dialog) in a single call, up to 5 passes
- **Text-content overlay classification** - Classifies overlays by text content ("Age Verification" → age-verify, "cookie" → cookie, etc.) instead of relying solely on CSS selectors
- **Force-click fallback** - When another overlay intercepts a button click, falls back to `force: true` click
- **Constitutional Yellow zone logging** - All dismissed overlays are logged to the audit trail per constitutional safety rules

### Technical Details
- `detectOverlays()` uses unified page.evaluate to find all fixed/absolute elements with z-index > 100 AND `role="dialog"` elements, classifies by text content, sorts by z-index descending
- `tryDismissOverlay()` tries close buttons from matched pattern, then all patterns, then generic selectors, then Escape key
- Overlay types: `OverlayType`, `OverlayPattern`, `DismissOverlayOptions`, `DetectedOverlay`, `DismissOverlayResult` added to types.ts

## [7.4.13] - 2026-02-03

### Fixed
- **Graceful browser fallback** - `cross_browser_test` and `cross_browser_diff` now check browser availability before launching, skip missing browsers, return partial results with available browsers, and include actionable installation commands (#4)
- **`crossBrowserDiff` error handling** - Previously crashed with generic error when a browser wasn't installed; now wraps each browser in try-catch and returns structured error info

### Added
- `CrossBrowserResult` and `BrowserDiffResult` types include `missingBrowsers`, `availableBrowsers`, and `suggestion` fields
- MCP tools surface browser availability info in JSON responses
- CLI cross-browser report includes "MISSING BROWSERS" section with install command

## [7.4.12] - 2026-02-03

### Added
- **`status` command** - `npx cbrowser status` shows environment diagnostics: data directories with file counts, installed Playwright browsers with versions, configuration, self-healing cache stats, session/baseline counts, and actionable suggestions (#11)
- **`status` MCP tool** - Added to both stdio and remote MCP servers for AI agent diagnostics
- **Skill CLI `status` command** - Equivalent diagnostics for the PAI skill

## [7.4.11] - 2026-02-03

### Fixed
- **Auto-initialize data directories on first run** - All required data directories are now created automatically when CBrowser is instantiated or MCP server starts, eliminating ENOENT errors for first-time users (#2)

### Added
- `ensureDirectories()` now creates 14 directories: base, sessions, screenshots, videos, har, personas, scenarios, helpers, audit, baselines, recordings, visual-baselines, visual-baselines/screenshots, browser-state
- `CBrowserPaths` interface expanded with `baselinesDir`, `recordingsDir`, `visualBaselinesDir`, `visualScreenshotsDir`, `browserStateDir`
- MCP server (`mcp-server.ts`) and remote MCP server (`mcp-server-remote.ts`) call `ensureDirectories()` on startup
- Skill CLI initializes `har`, `baselines`, `recordings`, `browser-state` directories at module load

## [7.4.10] - 2026-02-03

### Fixed
- **Navigate `--url` flag** - `navigate --url <url>` now works as alternative to positional arg
- **Click element finding** - Added `networkidle` wait + 1s hydration delay after session restore, fixing click failures on restored pages
- **Fill element finding** - Added 5 new selector strategies: name attribute, type attribute, id attribute, textarea, and fuzzy attribute matching
- **Extract text on SPAs** - Added fallbacks when `innerText` is empty: `textContent`, then individual element extraction
- **Missing screen-reader-user persona** - Added to skill `BUILTIN_PERSONAS` (was already in npm package)
- **YAML custom personas** - `loadCustomPersonas()` and `listPersonas` now support `.yaml`/`.yml` files alongside `.json`
- **Custom persona deletion** - `deleteCustomPersona()` checks all file extensions (json/yaml/yml)
- **findElement strategies** - Added 6 new strategies to modular `browser.ts`: name attr, type attr, id, textarea, link role, fuzzy JS match

### Changed
- `fill` and `extract` CLI commands now support `--url` for pre-navigation (skill CLI, already present in npm CLI)
- Synced all skill files to latest

## [7.4.9] - 2026-02-02

### Fixed
- **Session URL Persistence** - Browser state now correctly persists the current page URL between CLI invocations. Previously, only cookies and localStorage were saved, causing screenshots and other commands to show blank pages when run as separate CLI calls.

### Added
- `last-session.json` file in browser-state directory stores:
  - Current URL
  - Viewport dimensions
  - Timestamp (sessions expire after 1 hour)
- Session restoration on `getPage()` when page is at `about:blank`
- `clearSessionState()` method called on `reset()` command

### Technical Details
- `saveSessionState()` - Called in `close()` to persist URL before browser shutdown
- `loadSessionState()` - Called in `getPage()` to restore URL for blank pages
- Navigation commands (`navigate()`) skip session restore since they're explicitly setting a new URL

## [7.4.8] - 2026-02-01

### Added
- Auth0 OAuth support for remote MCP server (claude.ai custom connectors)
- Opaque token validation with 30-minute caching
- Public demo server at `https://cbrowser-mcp-demo.wyldfyre.ai/mcp`

## [7.4.6] - 2026-01-31

### Added
- Remote MCP server with HTTP transport for claude.ai integration
- API key authentication support for CLI/script access
- `.well-known/oauth-protected-resource` endpoint for OAuth metadata

## [7.4.3] - 2026-01-30

### Changed
- Rebranded to "Cognitive Browser" - the browser automation that thinks

## [7.4.1] - 2026-01-29

### Added
- Modular architecture for tree-shakeable imports
- 31 MCP tools for Claude Desktop integration

### Changed
- Split into modules: `cbrowser/visual`, `cbrowser/testing`, `cbrowser/analysis`, `cbrowser/performance`

## [7.3.0] - 2026-01-28

### Added
- A/B visual comparison for comparing two URLs side by side

## [7.2.0] - 2026-01-27

### Added
- Responsive visual testing across mobile, tablet, and desktop viewports

## [7.1.0] - 2026-01-26

### Added
- Cross-browser visual testing (Chrome, Firefox, Safari comparison)

## [7.0.0] - 2026-01-25

### Added
- AI visual regression testing with semantic screenshot comparison
- Breaking: Major version bump for visual testing architecture

## [6.5.0] - 2026-01-24

### Added
- Test coverage mapping to find untested pages

## [6.4.0] - 2026-01-23

### Added
- Performance regression detection with baseline comparison

## [6.3.0] - 2026-01-22

### Added
- Flaky test detection with multi-run analysis

## [6.2.0] - 2026-01-21

### Added
- AI-powered test repair for broken tests

## [6.1.0] - 2026-01-20

### Added
- Natural language test suites - write tests in plain English

## [6.0.0] - 2026-01-19

### Added
- Multi-persona comparison testing
- Breaking: Major version bump for persona architecture

## [5.0.0] - 2026-01-18

### Added
- Smart retry with self-healing selectors
- AI test generation from page analysis
- Breaking: Major version bump for selector architecture
