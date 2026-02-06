# Contributing to CBrowser

Thank you for your interest in contributing to CBrowser! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- Git
- A code editor (VS Code recommended)

### Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/alexandriashai/cbrowser.git
   cd cbrowser
   ```
3. Install dependencies:
   ```bash
   bun install
   # or
   npm install
   ```
4. Install Playwright browsers:
   ```bash
   npx playwright install chromium
   ```

### Development Workflow

```bash
# Run in development mode (watches for changes)
bun run dev

# Run the CLI directly
bun run src/cli.ts navigate "https://example.com"

# Run tests
bun test

# Build for production
bun run build

# Lint code
bun run lint
```

## Code Style

- Use TypeScript strict mode
- Follow the existing code style
- Add JSDoc comments for public APIs
- Keep functions focused and small
- Use meaningful variable names

### Commit Messages (Enforced)

This project uses [Conventional Commits](https://www.conventionalcommits.org/) with automated enforcement via commitlint. Your commit messages **must** follow this format or they will be rejected.

**Format:** `<type>(<scope>): <description>`

```
feat: add new persona type           # → MINOR version bump (new feature)
fix: resolve session loading issue   # → PATCH version bump (bug fix)
feat!: remove deprecated API         # → MAJOR version bump (breaking change)
docs: update README examples         # → No version bump
test: add click action tests         # → No version bump
refactor: simplify element finding   # → No version bump
perf: optimize selector caching      # → PATCH version bump (performance)
```

**Semantic Versioning ([semver.org](https://semver.org/)):**

| Commit Type | Version Bump | When to Use |
|-------------|--------------|-------------|
| `feat:` | MINOR (x.Y.z) | New backwards-compatible feature |
| `fix:` | PATCH (x.y.Z) | Bug fix |
| `perf:` | PATCH (x.y.Z) | Performance improvement |
| `BREAKING CHANGE:` in footer | MAJOR (X.y.z) | API breaking change |
| `feat!:` / `fix!:` | MAJOR (X.y.z) | Breaking change (shorthand) |
| `docs:`, `test:`, `chore:` | None | No release |

**Automated Release:** When you push to `main`, GitHub Actions automatically:
1. Analyzes commits since last release
2. Determines version bump (major/minor/patch)
3. Updates CHANGELOG.md
4. Creates git tag
5. Publishes to npm
6. Creates GitHub release

## Adding Features

### New Personas

1. Add to `src/personas.ts`
2. Follow the existing `Persona` interface
3. Include meaningful `humanBehavior` parameters
4. Add tests

### New Commands

1. Add to `src/cli.ts` in the main switch
2. Implement in `src/browser.ts` if needed
3. Update the help text
4. Add examples to README

### New Selectors

Element finding strategies are in `browser.ts` → `findElement()`. To add a new strategy:

1. Add a prefix check (e.g., `myprefix:`)
2. Implement the finding logic
3. Document in README

## Testing

```bash
# Run all tests
bun test

# Run specific test file
bun test src/browser.test.ts

# Run with coverage
bun test --coverage
```

### Writing Tests

- Test files go in `tests/` directory: `tests/browser.test.ts`
- Use descriptive test names
- Test both success and failure cases
- Mock external dependencies when appropriate

### Test Structure

```typescript
import { describe, test, expect } from "bun:test";

describe("Feature", () => {
  test("should do something", () => {
    expect(result).toBe(expected);
  });
});
```

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for new public APIs
- Include examples for new features
- Keep docs up to date with code

## Pull Request Process

1. Create a feature branch:
   ```bash
   git checkout -b feat/my-feature
   ```

2. Make your changes with tests

3. Ensure all tests pass:
   ```bash
   bun test
   bun run lint
   bun run build
   ```

4. Commit with conventional commit message

5. Push and create a pull request

6. Address review feedback

7. Once approved, squash and merge

## Architecture Overview

### Modular Architecture (v7.4.1+)

```
src/
├── index.ts              # Main exports (re-exports all modules)
├── cli.ts                # CLI entry point
├── browser.ts            # Core CBrowser class
├── config.ts             # Configuration management
├── types.ts              # TypeScript interfaces
├── personas.ts           # Built-in personas
├── mcp-server.ts         # MCP Server for Claude Desktop
├── mcp-server-remote.ts  # Remote MCP Server for claude.ai
├── visual/
│   ├── index.ts          # Visual module exports
│   ├── regression.ts     # AI visual regression (v7.0)
│   ├── cross-browser.ts  # Cross-browser testing (v7.1)
│   ├── responsive.ts     # Responsive testing (v7.2)
│   └── ab-comparison.ts  # A/B comparison (v7.3)
├── testing/
│   ├── index.ts          # Testing module exports
│   ├── nl-test-suite.ts  # Natural language tests (v6.1)
│   ├── test-repair.ts    # AI test repair (v6.2)
│   ├── flaky-detection.ts # Flaky test detection (v6.3)
│   └── coverage.ts       # Test coverage mapping (v6.5)
├── analysis/
│   ├── index.ts          # Analysis module exports
│   ├── natural-language.ts
│   ├── bug-hunter.ts
│   ├── chaos-testing.ts
│   └── persona-comparison.ts
└── performance/
    ├── index.ts          # Performance module exports
    └── metrics.ts        # Performance baselines (v6.4)
```

### Tree-Shakeable Imports

```typescript
// Import everything
import { CBrowser, runVisualRegression } from 'cbrowser';

// Import only what you need (smaller bundles)
import { runVisualRegression, runCrossBrowserTest } from 'cbrowser/visual';
import { runNLTestSuite, detectFlakyTests } from 'cbrowser/testing';
import { huntBugs, runChaosTest } from 'cbrowser/analysis';
import { capturePerformanceBaseline } from 'cbrowser/performance';
```

### Key Concepts

- **Constitutional Safety**: Actions are classified into zones (green/yellow/red/black)
- **Personas**: User archetypes with specific behaviors and timing
- **Sessions**: Persistent browser state (cookies, storage)
- **Journeys**: Autonomous exploration with a goal
- **Smart Retry**: Auto-retry with alternative selector generation
- **Self-Healing**: Domain-specific selector cache that learns
- **Assertions**: Natural language condition checking
- **Test Generation**: AI-powered test scenario creation
- **MCP Server**: Claude Desktop integration via MCP protocol
- **Remote MCP**: claude.ai integration (v7.4.6)
- **Visual Testing**: AI-powered visual regression, cross-browser, responsive (v7.x)
- **Test Automation**: NL test suites, AI repair, flaky detection (v6.x)

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions
- Check existing issues before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
