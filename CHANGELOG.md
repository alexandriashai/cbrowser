# Changelog

All notable changes to CBrowser will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [18.3.3](https://github.com/alexandriashai/cbrowser/compare/v18.3.1...v18.3.3) (2026-02-12)

### Fixed

* restore truncated files and update headers ([9f764a0](https://github.com/alexandriashai/cbrowser/commit/9f764a05667aa1c56e2b9b72ab87951e78944005))

## [18.3.1](https://github.com/alexandriashai/cbrowser/compare/v18.3.0...v18.3.1) (2026-02-11)

## [18.3.0](https://github.com/alexandriashai/cbrowser/compare/v18.2.1...v18.3.0) (2026-02-11)

### Added

* **mcp-remote:** add optional rate limiting with burst allowance ([0b17ba9](https://github.com/alexandriashai/cbrowser/commit/0b17ba9e806dd670e77087b5a1b609002320a9c6))

## [18.2.1](https://github.com/alexandriashai/cbrowser/compare/v18.2.0...v18.2.1) (2026-02-11)

### Fixed

* **docker:** update Playwright to v1.58.2 ([a6a4dae](https://github.com/alexandriashai/cbrowser/commit/a6a4dae4390f82ccbf0ed89d458ade2df6b74656))

## [18.2.0](https://github.com/alexandriashai/cbrowser/compare/v18.1.0...v18.2.0) (2026-02-11)

### Added

* **mcp-remote:** add base64 image encoding for remote screenshots ([9a9507b](https://github.com/alexandriashai/cbrowser/commit/9a9507b8fada2d604f4e3ec40e462d99c8bba03f)), closes [#107](https://github.com/alexandriashai/cbrowser/issues/107)

## [18.1.0](https://github.com/alexandriashai/cbrowser/compare/v18.0.0...v18.1.0) (2026-02-11)

### Added

* **mcp:** return base64 images for remote MCP mode ([#107](https://github.com/alexandriashai/cbrowser/issues/107)) ([a62c0c1](https://github.com/alexandriashai/cbrowser/commit/a62c0c128321560c2280606b9ec7be9b0614befe))

## [18.0.0](https://github.com/alexandriashai/cbrowser/compare/v17.6.1...v18.0.0) (2026-02-11)

### ⚠ BREAKING CHANGES

* **cli:** Persistent mode is now enabled by default.
Use --no-persistent to disable session continuity.

Fixes:
- #103: Device emulation persistence - `device set` now saves to session state
- #104: Session state loss - persistent mode is now the default

Changes:
- Add device field to SessionState interface
- Add saveDeviceSetting() method to CBrowser class
- Restore device setting on browser launch in persistent mode
- Change CLI default from --persistent to --no-persistent
- Update help text to reflect new default

Also includes new documentation files for tool categories.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>

### Fixed

* **cli:** session persistence and device emulation ([#103](https://github.com/alexandriashai/cbrowser/issues/103), [#104](https://github.com/alexandriashai/cbrowser/issues/104)) ([67432e5](https://github.com/alexandriashai/cbrowser/commit/67432e580fcded743fe216e47555d29532418a09))

## [17.7.0] (2026-02-11)

### Fixed

* **cli:** default to persistent mode for session continuity between commands (#104)
  - Sequential CLI commands now maintain browser state by default
  - Use `--no-persistent` to disable persistent mode
* **cli:** device emulation now persists across commands (#103)
  - `cbrowser device set <name>` saves the device setting to session state
  - Device setting is restored on next command launch
  - No need to pass `--device` flag to every command

### Changed

* **cli:** `--persistent` flag is now `--no-persistent` (persistent is default)

## [17.6.1](https://github.com/alexandriashai/cbrowser/compare/v17.6.0...v17.6.1) (2026-02-11)

### Fixed

* **mcp:** auto-fix Accept header for Claude.ai custom connectors ([a8462b9](https://github.com/alexandriashai/cbrowser/commit/a8462b925a1258b2431d79441f76703167bdb8d0))

## [17.6.0](https://github.com/alexandriashai/cbrowser/compare/v17.5.3...v17.6.0) (2026-02-11)

### Added

* **mcp:** modular tool registration for MCP servers ([27308c7](https://github.com/alexandriashai/cbrowser/commit/27308c77772cd0f6b1679c1ed5a9d2010baab3a4))

## [17.5.3](https://github.com/alexandriashai/cbrowser/compare/v17.5.2...v17.5.3) (2026-02-11)

## [17.5.2](https://github.com/alexandriashai/cbrowser/compare/v17.5.1...v17.5.2) (2026-02-11)

## [17.5.1](https://github.com/alexandriashai/cbrowser/compare/v17.4.1...v17.5.1) (2026-02-11)

### Fixed

* **click:** navigate correctly when clicking URL-text links ([0051b0a](https://github.com/alexandriashai/cbrowser/commit/0051b0ad86bbfe4933895392c0c24135bc327769))
