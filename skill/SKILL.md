---
name: CBrowser
description: Cognitive Browser - AI-powered browser automation with constitutional safety, AI visual regression, cross-browser testing, responsive testing, A/B comparison, and user perspective testing. v7.4.8 (modular architecture + 31 MCP tools + remote MCP with Auth0 OAuth for claude.ai + PAI Skill system). USE WHEN cognitive browser, smart browser, AI browser automation, vision-based automation, self-healing selectors, autonomous web agent, user testing, persona testing, authenticated automation, test suite, natural language tests, repair tests, fix broken tests, flaky test detection, detect flaky tests, unreliable tests, constitutional safety, safe automation, visual regression, screenshot comparison, cross-browser, responsive testing, viewport testing, mobile testing, A/B testing, staging vs production, compare URLs, performance regression, test coverage, coverage map, coverage gaps, MCP server, Claude Desktop, remote MCP, custom connector, Auth0 OAuth, PAI skill, Personal AI Infrastructure.
---

# CBrowser (Cognitive Browser)

> **PAI Skill Installation:** This skill is compatible with [PAI (Personal AI Infrastructure)](https://github.com/danielmiessler/Personal_AI_Infrastructure).
> ```bash
> curl -fsSL https://raw.githubusercontent.com/alexandriashai/cbrowser/main/scripts/install-skill.sh | bash
> npm install -g cbrowser && npx playwright install
> ```
> Then add to `~/.claude/skills/skill-index.json`: `{"CBrowser": "~/.claude/skills/CBrowser/SKILL.md"}`

**The browser automation built for AI agents, not human developers.**

*CBrowser = Cognitive Browser — browser automation that thinks.*

## Why CBrowser Is Different

| Traditional Automation | CBrowser |
|------------------------|------------------|
| Brittle CSS selectors | AI vision: "click the blue login button" |
| Breaks when DOM changes | Self-healing locators adapt automatically |
| Stateless between runs | Remembers sites, patterns, sessions |
| Manual login flows | Credential vault with 2FA support |
| Scripted tests only | Autonomous goal-driven journeys |

## Constitutional Safety (Unique)

| Zone | Actions | Behavior |
|------|---------|----------|
| 🟢 Green | Navigate, read, screenshot | Auto-execute |
| 🟡 Yellow | Click buttons, fill forms | Log and proceed |
| 🔴 Red | Submit, delete, purchase | **Requires verification** |
| ⬛ Black | Bypass auth, inject scripts | **Never executes** |

---

## Quick Start

### Remote MCP (claude.ai) - Zero Installation

**Demo Server (rate-limited):**
```
URL: https://cbrowser-mcp-demo.wyldfyre.ai/mcp
Rate limit: 5 requests/minute
```

**Authenticated Server:**
```
URL: https://cbrowser-mcp.wyldfyre.ai/mcp
Auth: Auth0 OAuth 2.1
```

### Local Installation

```bash
npm install -g cbrowser
npx playwright install chromium
```

---

## Workflow Routing

| Trigger | Workflow | Description |
|---------|----------|-------------|
| "navigate to", "go to", "open" | `Workflows/Navigate.md` | Smart navigation with AI wait detection |
| "extract", "scrape data", "get content" | `Workflows/Extract.md` | Intelligent data extraction |
| "click", "fill", "submit", "interact" | `Workflows/Interact.md` | AI-guided interactions |
| "login", "authenticate", "sign in" | `Workflows/Authenticate.md` | Handle login flows with credentials |
| "test", "run test", "validate" | `Workflows/Test.md` | Run scripted test scenarios |
| "journey", "run as", "simulate user" | `Workflows/Journey.md` | Autonomous persona-driven exploration |

---

## CLI Commands

```bash
# Navigation & Interaction
npx cbrowser navigate "https://example.com"
npx cbrowser smart-click "the blue submit button"
npx cbrowser fill "email input" "user@example.com"
npx cbrowser extract "all product cards" --format json

# Visual Testing (v7.x)
npx cbrowser ai-visual capture "https://example.com" --name homepage
npx cbrowser ai-visual test "https://staging.example.com" homepage --html
npx cbrowser cross-browser "https://example.com" --html
npx cbrowser responsive "https://example.com" --html
npx cbrowser ab "https://staging.example.com" "https://example.com" --html

# Test Automation (v6.x)
npx cbrowser test-suite tests.txt --html
npx cbrowser repair-tests broken-test.txt --auto-apply --verify
npx cbrowser flaky-check tests.txt --runs 10

# Persona Testing
npx cbrowser compare-personas --start "https://example.com" --goal "Complete checkout" --personas power-user,first-timer,elderly-user

# Session Management
npx cbrowser session save "logged-in"
npx cbrowser session load "logged-in"
npx cbrowser session list
```

---

## Built-in Personas

| Persona | Description |
|---------|-------------|
| `power-user` | Tech-savvy expert who expects efficiency |
| `first-timer` | New user exploring for the first time |
| `mobile-user` | Smartphone user with touch interface |
| `screen-reader-user` | Blind user with screen reader |
| `elderly-user` | Older adult with vision/motor limitations |
| `impatient-user` | Quick to abandon slow experiences |

---

## MCP Server (31 Tools)

### Local MCP (Claude Desktop)

Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "cbrowser": {
      "command": "npx",
      "args": ["cbrowser", "mcp-server"]
    }
  }
}
```

### Remote MCP (claude.ai)

1. Go to claude.ai → Settings → Connectors
2. Add: `https://cbrowser-mcp-demo.wyldfyre.ai/mcp`
3. You now have 31 browser automation tools!

---

## Modular Imports (v7.4.1+)

```typescript
// Import everything
import { CBrowser, runVisualRegression } from 'cbrowser';

// Tree-shakeable imports
import { runVisualRegression, runCrossBrowserTest } from 'cbrowser/visual';
import { runNLTestSuite, detectFlakyTests } from 'cbrowser/testing';
import { huntBugs, runChaosTest } from 'cbrowser/analysis';
import { capturePerformanceBaseline } from 'cbrowser/performance';
```

---

## Version History

| Version | Features |
|---------|----------|
| v7.4.6 | Auth0 OAuth for claude.ai, opaque token validation, 30-minute token caching |
| v7.3.0 | A/B visual comparison |
| v7.2.0 | Responsive visual testing |
| v7.1.0 | Cross-browser visual testing |
| v7.0.0 | AI visual regression |
| v6.5.0 | Test coverage mapping |
| v6.4.0 | Performance regression detection |
| v6.3.0 | Flaky test detection |
| v6.2.0 | AI test repair |
| v6.1.0 | Natural language test suites |
| v6.0.0 | Multi-persona comparison |

---

## Links

- [npm Package](https://www.npmjs.com/package/cbrowser)
- [GitHub Repository](https://github.com/alexandriashai/cbrowser)
- [Wiki Documentation](https://github.com/alexandriashai/cbrowser/wiki)
- [Auth0 Setup Guide](https://github.com/alexandriashai/cbrowser/blob/main/docs/AUTH0-SETUP.md)
