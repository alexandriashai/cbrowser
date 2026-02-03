---
name: CBrowser
description: Cognitive Browser - AI-powered browser automation with constitutional safety, AI visual regression, cross-browser testing, responsive testing, A/B comparison, and user perspective testing. v7.4.6 (modular architecture + 31 MCP tools + remote MCP with Auth0 OAuth for claude.ai). USE WHEN cognitive browser, smart browser, AI browser automation, vision-based automation, self-healing selectors, autonomous web agent, user testing, persona testing, authenticated automation, test suite, natural language tests, repair tests, fix broken tests, flaky test detection, detect flaky tests, unreliable tests, constitutional safety, safe automation, visual regression, screenshot comparison, cross-browser, responsive testing, viewport testing, mobile testing, A/B testing, staging vs production, compare URLs, performance regression, test coverage, coverage map, coverage gaps, MCP server, Claude Desktop, remote MCP, custom connector, Auth0 OAuth.
---

# CBrowser (Cognitive Browser)

**The browser automation that thinks — built for AI agents, not human developers.**

*CBrowser = Cognitive Browser. The only browser automation that asks: "Can a real user complete this safely?"*

Most AI automation tools ask if a task *can* be completed. CBrowser asks if an **elderly first-timer on mobile** can complete it—and whether the automation should even be allowed to try.

## Why CBrowser Is Different

Every AI browser tool now has self-healing selectors. That's table stakes. **CBrowser solves three problems no one else does:**

### 1. Constitutional AI Safety (Unique)

Other tools will click "Delete All Data" if you ask. CBrowser classifies every action by risk:

| Zone | Actions | Behavior |
|------|---------|----------|
| 🟢 Green | Navigate, read, screenshot | Auto-execute |
| 🟡 Yellow | Click buttons, fill forms | Log and proceed |
| 🔴 Red | Submit, delete, purchase | **Requires verification** |
| ⬛ Black | Bypass auth, inject scripts | **Never executes** |

### 2. User Perspective Testing (Unique)

Other tools test if buttons click. CBrowser tests if **real humans** can use your site with 6 built-in personas that simulate realistic human behavior (reaction times, typo rates, mouse jitter, attention patterns).

### 3. Claude MCP Integration (Unique)

Built for the Claude ecosystem. First-class MCP server for Claude Desktop integration.

## Also Included (Table Stakes)

| Traditional Automation | CBrowser |
|------------------------|------------------|
| Brittle CSS selectors | AI vision: "click the blue login button" |
| Breaks when DOM changes | Self-healing locators adapt automatically |
| Stateless between runs | Remembers sites, patterns, sessions |
| Manual login flows | Credential vault with 2FA support |
| Scripted tests only | Autonomous goal-driven journeys |

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
| "test-suite", "natural language test" | npm: `test-suite` | Natural language test execution (v6.1.0) |
| "repair", "fix tests", "broken test" | npm: `repair-tests` | AI-powered test repair (v6.2.0) |
| "flaky", "unreliable", "detect flaky" | npm: `flaky-check` | Flaky test detection (v6.3.0) |
| "performance baseline", "perf regression" | npm: `perf-baseline`, `perf-regression` | Performance regression detection (v6.4.0) |
| "coverage", "test coverage", "untested pages" | npm: `coverage` | Test coverage mapping (v6.5.0) |
| "visual regression", "visual baseline" | npm: `ai-visual` | AI visual regression testing (v7.0.0) |
| "cross-browser", "browser comparison" | npm: `cross-browser` | Cross-browser visual testing (v7.1.0) |
| "responsive", "viewport", "mobile testing" | npm: `responsive` | Responsive visual testing (v7.2.0) |
| "A/B", "compare URLs", "staging vs production" | npm: `ab` | A/B visual comparison (v7.3.0) |

---

## Quick Reference

### Navigation & Interaction

```bash
# AI-powered element interaction
bun run Tools/CBrowser.ts navigate "https://example.com"
bun run Tools/CBrowser.ts click "the blue submit button"
bun run Tools/CBrowser.ts fill "email input" "user@example.com"
bun run Tools/CBrowser.ts extract "all product cards" --format json
```

### Credential Management

```bash
# Secure credential vault
bun run Tools/CBrowser.ts creds add "github"         # Add credentials
bun run Tools/CBrowser.ts creds list                 # List stored
bun run Tools/CBrowser.ts creds add-2fa "github"     # Add TOTP secret
bun run Tools/CBrowser.ts auth "github"              # Authenticate
```

### Persona Management

```bash
# User personas
bun run Tools/CBrowser.ts persona list               # Built-in + custom
bun run Tools/CBrowser.ts persona create "tester"    # Create custom
bun run Tools/CBrowser.ts run-as "mobile-user"       # Act as persona
```

### User Testing

```bash
# Test scenarios
bun run Tools/CBrowser.ts test "checkout-flow"       # Run scenario
bun run Tools/CBrowser.ts test suite "critical"      # Run suite
bun run Tools/CBrowser.ts test all --report html     # Full report

# Autonomous journeys
bun run Tools/CBrowser.ts journey "first-timer" \
  --start "https://example.com" \
  --goal "Complete signup and reach dashboard"
```

### Session Management

```bash
# Save current browser session (cookies, localStorage, sessionStorage, URL)
bun run Tools/CBrowser.ts session save "mysite"                    # Requires active page
bun run Tools/CBrowser.ts session save "mysite" --url "https://example.com"  # Navigate first

# Load and restore a saved session
bun run Tools/CBrowser.ts session load "mysite"

# List all saved sessions
bun run Tools/CBrowser.ts session list

# Delete a saved session
bun run Tools/CBrowser.ts session delete "mysite"
```

### Advanced Testing (npm package v7.x)

These features are available via the `cbrowser` npm package for advanced test automation:

```bash
# v6.1.0: Natural Language Test Suites
# Write tests in plain English
npx cbrowser test-suite tests.txt --html
npx cbrowser test-suite --inline "go to https://example.com ; click login ; verify url contains /dashboard"

# v6.2.0: AI Test Repair
# Automatically fix broken tests
npx cbrowser repair-tests broken-test.txt --auto-apply --verify
npx cbrowser repair-tests tests.txt --output fixed-tests.txt

# v6.3.0: Flaky Test Detection
# Identify unreliable tests
npx cbrowser flaky-check tests.txt --runs 10
npx cbrowser flaky-check tests.txt --threshold 25 --output report.json

# v6.4.0: Performance Regression Detection
# Compare performance against baselines
npx cbrowser perf-baseline save "https://example.com" --name homepage --runs 5
npx cbrowser perf-regression "https://example.com" homepage --threshold-lcp 20

# v6.5.0: Test Coverage Mapping
# Find untested pages
npx cbrowser coverage "https://example.com" --tests "tests/*.txt" --html
npx cbrowser coverage gaps "https://example.com" --tests "tests/*.txt"

# v7.0.0: AI Visual Regression
# Semantic screenshot comparison using AI
npx cbrowser ai-visual capture "https://example.com" --name homepage
npx cbrowser ai-visual test "https://staging.example.com" homepage --html
npx cbrowser ai-visual list

# v7.1.0: Cross-Browser Visual Testing
# Compare rendering across Chrome, Firefox, Safari
npx cbrowser cross-browser "https://example.com" --html
npx cbrowser cross-browser "https://example.com" --browsers chromium,firefox
npx cbrowser cross-browser suite suite.json --output report.html

# v7.2.0: Responsive Visual Testing
# Compare rendering across viewport sizes (mobile, tablet, desktop)
npx cbrowser responsive "https://example.com" --html
npx cbrowser responsive "https://example.com" --viewports mobile,tablet,desktop-lg
npx cbrowser responsive viewports  # list available presets
npx cbrowser responsive suite suite.json --output report.html

# v7.3.0: A/B Visual Comparison
# Compare two different URLs (staging vs production, old vs new design)
npx cbrowser ab "https://staging.example.com" "https://example.com" --html
npx cbrowser ab "https://old.site.com" "https://new.site.com" --label-a "Old" --label-b "New"
npx cbrowser ab suite suite.json --output report.html
```

### v7.4.1: Modular Architecture + MCP Tools

CBrowser v7.4.1 includes modular architecture for tree-shakeable imports and 31 MCP tools for Claude Desktop:

```typescript
// Import everything (unchanged)
import { CBrowser, runVisualRegression, detectFlakyTests } from 'cbrowser';

// Import only what you need (modular)
import { runVisualRegression, runCrossBrowserTest } from 'cbrowser/visual';
import { runNLTestSuite, detectFlakyTests, repairTest } from 'cbrowser/testing';
import { huntBugs, runChaosTest, findElementByIntent } from 'cbrowser/analysis';
import { capturePerformanceBaseline, detectPerformanceRegression } from 'cbrowser/performance';
```

**Module breakdown:**

| Module | Purpose | Key Functions |
|--------|---------|---------------|
| `cbrowser/visual` | Visual testing | `runVisualRegression`, `runCrossBrowserTest`, `runResponsiveTest`, `runABComparison`, `crossBrowserDiff` |
| `cbrowser/testing` | Test automation | `runNLTestSuite`, `repairTest`, `detectFlakyTests`, `generateCoverageMap` |
| `cbrowser/analysis` | AI analysis | `huntBugs`, `runChaosTest`, `comparePersonas`, `findElementByIntent` |
| `cbrowser/performance` | Performance | `capturePerformanceBaseline`, `detectPerformanceRegression` |

**MCP Server (31 tools for Claude Desktop):**

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

**Remote MCP Server (v7.4.6 - for claude.ai custom connectors):**

**Public Demo Server (rate-limited, no auth required):**
```
URL: https://cbrowser-mcp-demo.wyldfyre.ai/mcp
Rate limit: 5 requests/minute, burst of 10
For evaluation purposes only
```

**Authenticated Server (production, requires Auth0 or API key):**
```
URL: https://cbrowser-mcp.wyldfyre.ai/mcp
```

Start your own remote HTTP server:
```bash
# Default port 3000 (open access)
npx cbrowser mcp-remote

# With API key authentication
MCP_API_KEY=your-secret-key npx cbrowser mcp-remote

# Multiple API keys
MCP_API_KEYS=key1,key2,key3 npx cbrowser mcp-remote

# With Auth0 OAuth (for claude.ai)
AUTH0_DOMAIN=your-tenant.auth0.com AUTH0_AUDIENCE=https://your-server/ npx cbrowser mcp-remote

# Custom port
PORT=8080 npx cbrowser mcp-remote
```

**Authentication Methods (v7.4.6):**

*Auth0 OAuth (for claude.ai web interface):*
- Supports OAuth 2.1 with PKCE
- JWT and opaque token validation
- 30-minute token caching to avoid rate limits
- Protected Resource Metadata via `/.well-known/oauth-protected-resource`

*API Key (for Claude Code CLI and scripts):*
```bash
# Bearer token
curl -H "Authorization: Bearer your-api-key" https://your-server/mcp

# X-API-Key header
curl -H "X-API-Key: your-api-key" https://your-server/mcp
```

**Dual Authentication:** Both OAuth and API keys can be enabled simultaneously.

For claude.ai custom connector setup:
1. Go to claude.ai Settings > Integrations > Custom Connectors
2. Add connector URL: `https://cbrowser-mcp.wyldfyre.ai/mcp`
3. Complete the Auth0 OAuth login flow when prompted
4. The connector will be enabled after successful authentication

See `docs/AUTH0-SETUP.md` in the npm package for full Auth0 configuration.

Endpoints:
- `/mcp` - MCP protocol endpoint (auth required if configured)
- `/health` - Health check (always open)
- `/info` - Server info (always open)
- `/.well-known/oauth-protected-resource` - OAuth metadata (if Auth0 configured)
```

| Category | MCP Tools |
|----------|-----------|
| Visual | `visual_baseline`, `visual_regression`, `cross_browser_test`, `cross_browser_diff`, `responsive_test`, `ab_comparison` |
| Testing | `nl_test_file`, `nl_test_inline`, `repair_test`, `detect_flaky_tests`, `coverage_map` |
| Analysis | `hunt_bugs`, `chaos_test`, `compare_personas`, `find_element_by_intent` |
| Performance | `perf_baseline`, `perf_regression`, `list_baselines` |

**Test file format (for test-suite, repair-tests, flaky-check):**

```txt
# Test: Login Flow
go to https://example.com
click the login button
type "user@example.com" in email field
type "password123" in password field
click submit
verify url contains "/dashboard"

# Test: Search
go to https://example.com/search
type "test query" in search box
click search button
verify page contains "results"
```

**Supported instructions:**

| Instruction | Examples |
|-------------|----------|
| **Navigate** | `go to https://...`, `navigate to https://...`, `open https://...` |
| **Click** | `click the login button`, `click submit`, `press Enter` |
| **Fill** | `type "value" in email field`, `fill username with "john"` |
| **Wait** | `wait 2 seconds`, `wait for "Loading" appears` |
| **Assert** | `verify page contains "Welcome"`, `verify url contains "/home"` |
| **Screenshot** | `take screenshot` |

---

## AI Selector Modes

| Mode | Syntax | Example |
|------|--------|---------|
| Natural Language | `"description"` | `click "the main navigation menu"` |
| Visual | `visual:description` | `click "visual:red button in header"` |
| Accessibility | `aria:role/name` | `click "aria:button/Submit"` |
| Semantic | `semantic:type` | `fill "semantic:email" "user@example.com"` |
| Fallback CSS | `css:selector` | `click "css:#login-btn"` |

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

## Constitutional Principles

### Action Zones

| Zone | Actions | Behavior |
|------|---------|----------|
| **Green** | Navigate, read, screenshot, scroll | Auto-execute |
| **Yellow** | Click buttons, fill forms, select | Log and proceed |
| **Red** | Submit, delete, purchase, account changes | Verify required |
| **Black** | Bypass auth, violate ToS, inject scripts | Never execute |

### Five Laws

1. **Transparency** — Every action logged with timestamps and screenshots
2. **Verification** — Destructive actions require confirmation
3. **Privacy** — Credentials never logged, PII redacted
4. **Politeness** — Respect rate limits, delays between actions
5. **Fallback** — When uncertain, ask; when dangerous, stop

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CBrowser                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐            │
│  │ AI Vision │  │ Credential│  │ Persona   │  │ Test      │            │
│  │ Selector  │  │ Vault     │  │ Engine    │  │ Runner    │            │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘            │
│        │              │              │              │                   │
│  ┌─────┴──────────────┴──────────────┴──────────────┴─────┐            │
│  │                   Session Manager                       │            │
│  │         (Persistent state, cookies, storage)            │            │
│  └─────────────────────────┬───────────────────────────────┘            │
│                            │                                            │
│  ┌─────────────────────────┴───────────────────────────────┐            │
│  │              Constitutional Verifier                     │            │
│  │         (Zone classification, audit trail)               │            │
│  └─────────────────────────┬───────────────────────────────┘            │
│                            │                                            │
│  ┌─────────────────────────┴───────────────────────────────┐            │
│  │                  Backend Abstraction                     │            │
│  │         (Configurable MCP backend selection)             │            │
│  └───────────────┬───────────────────────┬─────────────────┘            │
│                  │                       │                              │
│  ┌───────────────┴───────┐  ┌───────────┴───────────────┐              │
│  │  Claude-in-Chrome MCP │  │  Chrome DevTools MCP      │              │
│  │  (GUI, AI vision)     │  │  (Headless, Puppeteer)    │              │
│  └───────────────────────┘  └───────────────────────────┘              │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Backend Selection

CBrowser supports multiple browser automation backends:

| Backend | Display | Use Case |
|---------|---------|----------|
| `claude-in-chrome` | GUI required | Local development, AI vision selectors, shared login state |
| `chrome-devtools` | Headless OK | Servers, CI/CD, performance tracing, network inspection |

### Quick Setup

```bash
# Check current backend
bun run Tools/CBrowser.ts backend

# Switch to headless mode (servers)
bun run Tools/CBrowser.ts backend set chrome-devtools

# Switch to GUI mode (local dev)
bun run Tools/CBrowser.ts backend set claude-in-chrome
```

### Backend Comparison

| Feature | claude-in-chrome | chrome-devtools |
|---------|------------------|-----------------|
| Headless support | ❌ | ✅ |
| AI vision selectors | ✅ Native | ⚡ Via AI |
| Shares your login state | ✅ | ❌ |
| Server/CI deployment | ❌ | ✅ |
| Performance tracing | ❌ | ✅ |
| Console/Network access | ✅ | ✅ |

---

## Context Files

| File | Purpose |
|------|---------|
| `Philosophy.md` | Constitutional principles and safety rules |
| `AIVision.md` | How AI element detection works |
| `SessionManagement.md` | Persistent session documentation |
| `Credentials.md` | Secure credential vault system |
| `Personas.md` | User persona framework |

---

## Storage Layout

```
~/.claude/skills/CBrowser/
├── SKILL.md                    # This file
├── Philosophy.md               # Constitutional principles
├── AIVision.md                 # AI selector documentation
├── SessionManagement.md        # Session persistence
├── Credentials.md              # Credential vault docs
├── Personas.md                 # Persona framework
├── Workflows/
│   ├── Navigate.md             # Smart navigation
│   ├── Interact.md             # AI-guided interactions
│   ├── Extract.md              # Data extraction
│   ├── Authenticate.md         # Login handling
│   ├── Test.md                 # Test scenarios
│   └── Journey.md              # Autonomous journeys
├── Tools/
│   └── CBrowser.ts     # CLI tool
└── .memory/                    # Persistent storage
    ├── sessions/               # Saved browser sessions
    ├── selectors/              # Learned selector mappings
    ├── personas/               # Custom personas
    ├── scenarios/              # Test scenarios
    ├── credentials.enc         # Encrypted credentials
    └── audit/                  # Action audit logs
```

---

## Examples

**Example 1: Authenticated data extraction**
```
User: "Log into GitHub and get my notification count"
→ Loads saved GitHub session or authenticates
→ Navigates with AI wait detection
→ Extracts notification badge using AI vision
→ Returns structured result
```

**Example 2: User journey testing**
```
User: "Test the signup flow as a mobile first-timer"
→ Adopts mobile-user + first-timer persona
→ Sets mobile viewport
→ Explores autonomously trying to sign up
→ Reports friction points and time taken
→ Compares to power-user baseline
```

**Example 3: Multi-persona comparison**
```
User: "Compare checkout experience across personas"
→ Runs checkout with: power-user, elderly-user, mobile-user
→ Each persona navigates independently
→ Generates comparison report with times and friction
→ Identifies accessibility issues
```

---

## Integration

**Works with:**
- **QATester** agent — Automated testing integration
- **Research** skill — Data gathering with extraction
- **WebAssessment** skill — Security testing with auth

**CBrowser is the PRIMARY browser automation tool for:**
- All browser navigation and interaction
- Screenshot capture and visual testing
- Form filling and data extraction
- Session management and persistence
- Persona-driven user testing
- Cross-browser compatibility testing
- Visual regression testing

**Note:** The Browser skill has been disabled. Use CBrowser for ALL browser automation tasks.

---

## npm Package vs Local Tool

| Feature | Local Tool (`bun run Tools/CBrowser.ts`) | npm Package (`npx cbrowser`) |
|---------|------------------------------------------|------------------------------|
| Basic navigation | ✅ | ✅ |
| Click/fill/extract | ✅ | ✅ |
| Session management | ✅ | ✅ |
| Persona journeys | ✅ | ✅ |
| Credential vault | ✅ | ❌ |
| Constitutional safety | ✅ | ✅ |
| NL Test Suites (v6.1.0) | ❌ | ✅ |
| AI Test Repair (v6.2.0) | ❌ | ✅ |
| Flaky Detection (v6.3.0) | ❌ | ✅ |
| Perf Regression (v6.4.0) | ❌ | ✅ |
| Coverage Map (v6.5.0) | ❌ | ✅ |
| AI Visual Regression (v7.0.0) | ❌ | ✅ |
| Cross-Browser Testing (v7.1.0) | ❌ | ✅ |
| Responsive Testing (v7.2.0) | ❌ | ✅ |
| A/B Comparison (v7.3.0) | ❌ | ✅ |
| Multi-persona comparison | ❌ | ✅ |
| MCP server mode | ❌ | ✅ |
| Daemon mode | ❌ | ✅ |

**Use Local Tool (`bun run Tools/CBrowser.ts`) when:**
- Any browser automation task (this is now the PRIMARY browser tool)
- Need credential vault or authenticated sessions
- Basic navigation, clicking, filling, extracting
- Session management and persistence
- Persona-driven journeys and testing

**Use npm Package (`npx cbrowser`) when:**
- Need advanced testing features (test suites, visual regression, cross-browser, coverage mapping)
- CI/CD pipeline integration
- MCP server mode for Claude Desktop
- Daemon mode for persistent browser sessions

**Note:** The Browser skill has been disabled. CBrowser is now the sole browser automation tool for all tasks.

---

## Version History

| Version | Features |
|---------|----------|
| v7.4.9 | Session URL persistence - browser state now correctly restores page URL between CLI invocations |
| v7.4.6 | Auth0 OAuth for claude.ai, opaque token validation, 30-minute token caching, demo server |
| v7.4.3 | Remote MCP authentication (API key support), "Cognitive Browser" branding |
| v7.4.2 | Remote MCP server for claude.ai custom connectors |
| v7.4.1 | Modular architecture, 31 MCP tools |
| v7.3.0 | A/B visual comparison (compare two URLs side by side) |
| v7.2.0 | Responsive visual testing (mobile, tablet, desktop viewport comparison) |
| v7.1.0 | Cross-browser visual testing (Chrome, Firefox, Safari comparison) |
| v7.0.0 | AI visual regression (semantic screenshot comparison) |
| v6.5.0 | Test coverage mapping (find untested pages) |
| v6.4.0 | Performance regression detection |
| v6.3.0 | Flaky test detection |
| v6.2.0 | AI test repair |
| v6.1.0 | Natural language test suites |
| v6.0.0 | Multi-persona comparison |
| v5.0.0 | Smart retry, self-healing selectors, AI test generation |
| v4.0.0 | Natural language, AI element finding, chaos engineering |
