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

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new persona type
fix: resolve session loading issue
docs: update README examples
test: add click action tests
refactor: simplify element finding logic
```

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

- Test files go next to source files: `browser.ts` → `browser.test.ts`
- Use descriptive test names
- Test both success and failure cases
- Mock external dependencies when appropriate

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

```
src/
├── index.ts        # Public exports
├── cli.ts          # CLI entry point
├── browser.ts      # Main CBrowser class (with Tier 5 features)
├── config.ts       # Configuration management
├── types.ts        # TypeScript interfaces
├── personas.ts     # Built-in personas
└── mcp-server.ts   # MCP Server for Claude integration
```

### Key Concepts

- **Constitutional Safety**: Actions are classified into zones (green/yellow/red/black)
- **Personas**: User archetypes with specific behaviors and timing
- **Sessions**: Persistent browser state (cookies, storage)
- **Journeys**: Autonomous exploration with a goal
- **Smart Retry**: Auto-retry with alternative selector generation (v5.0.0)
- **Self-Healing**: Domain-specific selector cache that learns (v5.0.0)
- **Assertions**: Natural language condition checking (v5.0.0)
- **Test Generation**: AI-powered test scenario creation (v5.0.0)
- **MCP Server**: Claude Desktop integration via MCP protocol (v5.0.0)

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions
- Check existing issues before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
