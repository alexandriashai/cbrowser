# Changelog

All notable changes to CBrowser will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [18.8.0](https://github.com/alexandriashai/cbrowser/compare/v18.7.0...v18.8.0) (2026-02-16)

### Added

* **marketing:** show marketing tools as stubs on local MCP ([6986fc1](https://github.com/alexandriashai/cbrowser/commit/6986fc1e49ffa4636bff6d8762e22d1034c9b626))

## [18.7.0](https://github.com/alexandriashai/cbrowser/compare/v18.6.1...v18.7.0) (2026-02-16)

### Added

* **mcp:** make marketing tools demo/enterprise only, add campaign_run ([d5ca86e](https://github.com/alexandriashai/cbrowser/commit/d5ca86eb9d380c18e22d1ca6f06b6b4011c9a3e5))

## [18.6.1](https://github.com/alexandriashai/cbrowser/compare/v18.6.0...v18.6.1) (2026-02-16)

### Fixed

* update base tools count comment to 56 ([630b190](https://github.com/alexandriashai/cbrowser/commit/630b190d1ef1e825a008d421c79e2f9101588c0a))

## [18.6.0](https://github.com/alexandriashai/cbrowser/compare/v18.5.0...v18.6.0) (2026-02-16)

### Added

* **mcp:** add 3 real marketing tools for MCP-orchestrated campaigns ([aa27e8a](https://github.com/alexandriashai/cbrowser/commit/aa27e8a43011d46848d33ffdafde52b9e4767031))

## [18.5.0](https://github.com/alexandriashai/cbrowser/compare/v18.3.12...v18.5.0) (2026-02-16)

### Added

* add connection close detection and error logging for MCP ([3303126](https://github.com/alexandriashai/cbrowser/commit/3303126e3343189c7816e4ceac834d3c48e1ea34))
* add session isolation for MCP remote server ([0f89e2f](https://github.com/alexandriashai/cbrowser/commit/0f89e2f802fa26ba5bf4faed34601d24edfba0ca))
* add SSE keep-alive pings to prevent Cloudflare proxy timeout ([3aa1bdd](https://github.com/alexandriashai/cbrowser/commit/3aa1bddbacc9d7f393fab8db8692e176845198d5))
* improve rate limit error message for claude.ai ([e52c26c](https://github.com/alexandriashai/cbrowser/commit/e52c26c0c31b862c07dec9de8e954ad781ad0761))
* per-session memory limits + transparent session recovery ([0866f83](https://github.com/alexandriashai/cbrowser/commit/0866f83cde67c8068999edb1ff67643ce5141015))

### Fixed

* 1s keep-alive pings - maximum aggression ([59c2025](https://github.com/alexandriashai/cbrowser/commit/59c202507e10bc6cf1e4b0df12178e409e985256))
* 5s keep-alive pings ([3c393c7](https://github.com/alexandriashai/cbrowser/commit/3c393c74efa93f246ea19d97c73145abccb0be3c))
* reduce keep-alive to 10s, re-enable Cloudflare proxy for security ([af5e754](https://github.com/alexandriashai/cbrowser/commit/af5e7541a27a93b9e2bfc44e6bdf28b7458d3aab))
* reduce SSE keep-alive interval to 15s for aggressive timeout prevention ([fa651e8](https://github.com/alexandriashai/cbrowser/commit/fa651e872083e307b498b420572b9eb77c412cae))
* remove keep-alive pings - they were corrupting SSE protocol ([aab7d70](https://github.com/alexandriashai/cbrowser/commit/aab7d704c9b2a22e028ea57413502ec39ae84a08))

## [18.4.0](https://github.com/alexandriashai/cbrowser/compare/v18.3.12...v18.4.0) (2026-02-16)

### Added

* **mcp-remote:** session isolation with per-session browser contexts ([0f89e2f](https://github.com/alexandriashai/cbrowser/commit/0f89e2f))
  - Each MCP session gets isolated browser context (cookies, localStorage separated)
  - `MAX_CONCURRENT_SESSIONS` env var (default: 20)
  - `SESSION_IDLE_TIMEOUT_MS` env var (default: 5 minutes)
  - Automatic cleanup when sessions disconnect or go idle

* **mcp-remote:** per-session memory limits with auto-kill ([0866f83](https://github.com/alexandriashai/cbrowser/commit/0866f83))
  - `SESSION_MEMORY_LIMIT_MB` env var (default: 800MB)
  - Monitor Chromium RSS via /proc every 30 seconds
  - Auto-terminate sessions exceeding limit to protect other users
  - Prevents one bloated page from degrading all sessions

* **mcp-remote:** transparent session recovery ([0866f83](https://github.com/alexandriashai/cbrowser/commit/0866f83))
  - Expired sessions auto-recover on next request (no manual reconnect needed)
  - Low-friction UX: user's next command just works with fresh session
  - Logging shows recovery: `[Session] Auto-recovering expired session...`

## [18.3.12](https://github.com/alexandriashai/cbrowser/compare/v18.3.11...v18.3.12) (2026-02-16)

## [18.3.11](https://github.com/alexandriashai/cbrowser/compare/v18.4.0...v18.3.11) (2026-02-16)

## [18.3.10](https://github.com/alexandriashai/cbrowser/compare/v18.3.9...v18.3.10) (2026-02-12)

### Fixed

* add explicit process.exit(0) after browser commands ([930dbf0](https://github.com/alexandriashai/cbrowser/commit/930dbf0dfd2b5ff78f7284e6bde74999cd4abcd7))

## [18.3.9](https://github.com/alexandriashai/cbrowser/compare/v18.3.8...v18.3.9) (2026-02-12)

## [18.3.8](https://github.com/alexandriashai/cbrowser/compare/v18.3.5...v18.3.8) (2026-02-12)

## [18.3.5](https://github.com/alexandriashai/cbrowser/compare/v18.3.4...v18.3.5) (2026-02-12)

## [18.3.4](https://github.com/alexandriashai/cbrowser/compare/v18.3.3...v18.3.4) (2026-02-12)

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
