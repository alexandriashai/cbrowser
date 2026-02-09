# CBrowser Documentation

Welcome to the CBrowser documentation. This directory contains comprehensive guides for all CBrowser features.

## Quick Links

| Guide | Description |
|-------|-------------|
| [Getting Started](./GETTING-STARTED.md) | Installation, first commands, basic usage |
| [Cognitive Simulation](./COGNITIVE-SIMULATION.md) | User simulation, personas, trait system |
| [Persona Questionnaire](./PERSONA-QUESTIONNAIRE.md) | Research-backed custom persona creation |
| [Visual Testing](./VISUAL-TESTING.md) | AI visual regression, cross-browser, responsive |
| [MCP Integration](./MCP-INTEGRATION.md) | Claude Desktop and remote MCP server setup |
| [Natural Language Tests](./NATURAL-LANGUAGE-TESTS.md) | Writing tests in plain English |
| [Constitutional Safety](./CONSTITUTIONAL-SAFETY.md) | Risk classification and safety zones |
| [CLI Reference](./CLI-REFERENCE.md) | Complete command-line reference |
| [API Reference](./API-REFERENCE.md) | TypeScript API documentation |

## Feature Guides

### Core Features
- [Self-Healing Selectors](./SELF-HEALING-SELECTORS.md) - ARIA-first selector strategy
- [Agent-Ready Audit](./AGENT-READY-AUDIT.md) - AI-agent friendliness analysis
- [Competitive Benchmark](./COMPETITIVE-BENCHMARK.md) - UX comparison across sites
- [Empathy Audit](./EMPATHY-AUDIT.md) - Disability simulation testing

### Testing Features
- [Test Suites](./TEST-SUITES.md) - Natural language test execution
- [Test Repair](./TEST-REPAIR.md) - AI-powered test fixing
- [Flaky Detection](./FLAKY-DETECTION.md) - Identify unreliable tests
- [Coverage Mapping](./COVERAGE-MAPPING.md) - Find untested pages

### Visual Features
- [Visual Baselines](./VISUAL-BASELINES.md) - Capture and compare screenshots
- [Cross-Browser Testing](./CROSS-BROWSER-TESTING.md) - Chrome, Firefox, Safari comparison
- [Responsive Testing](./RESPONSIVE-TESTING.md) - Mobile, tablet, desktop viewports
- [A/B Comparison](./AB-COMPARISON.md) - Compare two URLs visually

### Advanced Features
- [Chaos Testing](./CHAOS-TESTING.md) - Inject failures, test resilience
- [Bug Hunting](./BUG-HUNTING.md) - Autonomous issue discovery
- [Performance Testing](./PERFORMANCE-TESTING.md) - Regression detection
- [Session Management](./SESSION-MANAGEMENT.md) - Save and restore browser state

## MCP Tools Reference

CBrowser provides 48 MCP tools organized by category:

| Category | Tools | Description |
|----------|-------|-------------|
| **Navigation** | 5 | Navigate, screenshot, extract, cloudflare detection |
| **Interaction** | 4 | Click, smart click, fill, scroll |
| **Testing** | 3 | Test suites, repair, flaky detection |
| **Visual** | 6 | Baselines, regression, cross-browser, responsive, A/B |
| **Cognitive** | 3 | Journey init, state update, persona comparison |
| **Persona** | 3 | Questionnaire, build, trait lookup |
| **Analysis** | 5 | Bug hunt, chaos, agent audit, benchmark, empathy |
| **Stealth** | 5 | Enable, disable, status, check, diagnose |

See [MCP Integration](./MCP-INTEGRATION.md) for complete tool documentation.

## Version History

See [CHANGELOG.md](../CHANGELOG.md) for detailed release notes.

### Current Version: 16.7.0

Key features:
- 48 MCP tools for Claude integration
- Research-backed persona questionnaire system
- 25 cognitive traits with behavioral mappings
- Accessibility empathy testing
- Competitive UX benchmarking
- Agent-ready site auditing
