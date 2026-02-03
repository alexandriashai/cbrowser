# Changelog

All notable changes to CBrowser will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
