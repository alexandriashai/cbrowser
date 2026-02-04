# CBrowser (Cognitive Browser)

AI-powered browser automation designed for MCP-based AI agents. Built on Playwright with session persistence, self-healing selectors, constitutional safety boundaries, and natural language as the primary interface.

[![npm version](https://badge.fury.io/js/cbrowser.svg)](https://www.npmjs.com/package/cbrowser)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Ready](https://img.shields.io/badge/MCP-Remote%20%2B%20Local-blue)](https://modelcontextprotocol.io)

## Why CBrowser?

Most browser automation libraries assume a human developer is writing and maintaining test scripts. When an AI agent needs to operate a browser autonomously across multiple calls, several problems arise:

- **State is lost between calls.** Standard Playwright/Puppeteer sessions are ephemeral. An agent that logs in during one call loses that session on the next call. CBrowser persists cookies, localStorage, and session state across invocations.
- **Selectors break silently.** When a site updates its DOM, CSS selectors stop working. CBrowser maintains a self-healing selector cache and generates alternative selectors automatically, so agents don't stall on stale selectors.
- **There's no safety boundary.** An autonomous agent with unrestricted browser access can submit forms, make purchases, or delete data. CBrowser classifies actions by risk level and enforces verification requirements for destructive operations.
- **Test maintenance is manual.** When tests break, someone has to figure out what changed and fix them. CBrowser can analyze failures, suggest repairs, and apply fixes automatically.
- **Natural language is bolted on.** Most tools accept CSS selectors natively and treat natural language as a convenience layer. CBrowser treats natural language as the primary input, which is what AI agents actually produce.

---

## Quick Start

### Option 1: PAI Skill Installation (Claude Code Users)

If you use [Claude Code](https://claude.ai/claude-code) with [PAI (Personal AI Infrastructure)](https://github.com/danielmiessler/Personal_AI_Infrastructure), install CBrowser as a skill:

```bash
# One-line installation
curl -fsSL https://raw.githubusercontent.com/alexandriashai/cbrowser/main/scripts/install-skill.sh | bash

# Or via npm CLI
npx cbrowser install-skill
```

This installs CBrowser to `~/.claude/skills/CBrowser/` with full skill structure:
- `SKILL.md` - Main skill file with workflow routing
- `Workflows/` - Navigate, Interact, Extract, Test, Journey workflows
- `Tools/CBrowser.ts` - CLI wrapper for PAI
- `.memory/` - Session, selector, and persona storage

After installation, add to your `~/.claude/skills/skill-index.json`:

```json
{
  "CBrowser": "~/.claude/skills/CBrowser/SKILL.md"
}
```

Then install dependencies:

```bash
npm install -g cbrowser
npx playwright install
```

### Option 2: npm Installation (Standard)

```bash
# npm
npm install cbrowser

# bun (recommended)
bun add cbrowser

# yarn
yarn add cbrowser
```

### Install Playwright Browsers

```bash
# Install all browsers (recommended for cross-browser testing)
npx playwright install

# Or just Chromium
npx playwright install chromium
```

### Basic Usage

```bash
# Navigate to a URL
npx cbrowser navigate "https://example.com"

# Click with auto-retry and self-healing
npx cbrowser smart-click "Add to Cart"

# Natural language assertions
npx cbrowser assert "page contains 'Welcome'"

# Generate tests from any page
npx cbrowser generate-tests "https://example.com"
```

---

## Core Capabilities

### Natural Language Interface

CBrowser accepts natural language descriptions for element selection, assertions, and test definitions. This is useful when AI agents need to interact with pages they haven't seen before, since they can describe what they want rather than knowing exact selectors.

```bash
npx cbrowser smart-click "the blue submit button in the checkout form"
npx cbrowser fill "email field" "user@example.com"
npx cbrowser assert "page shows order confirmation with total over $50"
```

Element selection supports multiple strategies, tried in priority order:

```bash
# Natural language (default)
cbrowser click "the main navigation menu"

# Accessibility-based (ARIA selectors)
cbrowser click "aria:button/Submit"

# Visual description
cbrowser click "visual:red button in header"

# Semantic type
cbrowser fill "semantic:email" "user@example.com"

# Fallback to CSS when needed
cbrowser click "css:#login-btn"
```

### Session Persistence

AI agents typically need multiple calls to complete a task (log in, navigate, fill a form, submit). CBrowser saves and restores browser state so agents can pick up where they left off.

```bash
# Save session (cookies, localStorage, sessionStorage)
cbrowser session save "logged-in" --url "https://example.com"

# Load session in a later invocation
cbrowser session load "logged-in"

# List saved sessions with metadata
cbrowser session list

# Show detailed session info
cbrowser session show "logged-in"

# Manage sessions
cbrowser session cleanup --older-than 30
cbrowser session export "logged-in" --output session.json
cbrowser session import session.json --name "restored"
```

### Self-Healing Selectors

When an element isn't found, CBrowser automatically:
1. Checks its selector cache for known alternatives on that domain
2. Generates alternative selectors (text variants, ARIA roles, attributes)
3. Tries each alternative with configurable retry logic
4. Caches working selectors for future use

This is particularly useful in CI/CD pipelines where site updates would otherwise break every test run.

```bash
# Smart click with retry
npx cbrowser smart-click "Submit" --max-retries 5

# Navigate then click
npx cbrowser smart-click "Login" --url "https://example.com"
```

```typescript
import { CBrowser } from 'cbrowser';

const browser = new CBrowser();
const result = await browser.smartClick("Submit Button", { maxRetries: 3 });

console.log(result.success);        // true/false
console.log(result.finalSelector);  // The selector that worked
console.log(result.attempts);       // Array of all attempts
console.log(result.aiSuggestion);   // AI suggestion if failed
```

```bash
# View cache statistics
npx cbrowser heal-stats

# Clear the cache
npx cbrowser heal-clear
```

### Constitutional Safety

When AI agents operate browsers autonomously, they need guardrails to prevent destructive actions. CBrowser classifies every action by risk level:

| Zone | Actions | Behavior |
|------|---------|----------|
| **Green** | Navigate, read, screenshot | Auto-execute |
| **Yellow** | Click buttons, fill forms | Log and proceed |
| **Red** | Submit, delete, purchase | Requires verification |
| **Black** | Bypass auth, inject scripts | Never executes |

This means an AI agent can freely browse and gather information, but cannot accidentally submit a form or delete data without explicit verification. For testing scenarios where you need to override this:

```bash
cbrowser click "Delete Account" --force
```

---

## Testing

### Natural Language Test Suites

Write tests in plain English instead of code. Useful for QA teams or AI agents that need to define and run tests without writing Playwright scripts.

```bash
# Run tests from a file
npx cbrowser test-suite login-test.txt --html

# Run inline tests
npx cbrowser test-suite --inline "go to https://example.com ; click login ; verify url contains /dashboard"

# Dry run (parse without executing)
npx cbrowser test-suite tests.txt --dry-run

# Fuzzy matching for assertions
npx cbrowser test-suite tests.txt --fuzzy-match
```

**Test file format:**

```txt
# Test: Login Flow
go to https://example.com
click the login button
type "user@example.com" in email field
type "password123" in password field
click submit
verify url contains "/dashboard"

# Test: Search Functionality
go to https://example.com/search
type "test query" in search box
click search button
verify page contains "results"
take screenshot
```

**Supported instructions:**

| Instruction | Examples |
|-------------|----------|
| **Navigate** | `go to https://...`, `navigate to https://...`, `open https://...` |
| **Click** | `click the login button`, `click submit`, `press Enter` |
| **Fill** | `type "value" in email field`, `fill username with "john"` |
| **Select** | `select "Option A" from dropdown` |
| **Scroll** | `scroll down`, `scroll up 5 times` |
| **Wait** | `wait 2 seconds`, `wait for "Loading" appears` |
| **Assert** | `verify page contains "Welcome"`, `verify url contains "/home"`, `verify title is "Dashboard"` |
| **Screenshot** | `take screenshot` |

**Output options:**

```bash
# Continue after failures
npx cbrowser test-suite tests.txt --continue-on-failure

# Save JSON report
npx cbrowser test-suite tests.txt --output results.json

# Generate HTML report
npx cbrowser test-suite tests.txt --html
```

**API usage:**

```typescript
import { parseNLTestSuite, runNLTestSuite, formatNLTestReport } from 'cbrowser';

const suite = parseNLTestSuite(`
  # Test: Homepage
  go to https://example.com
  verify title contains "Example"
  click the about link
  verify url contains "/about"
`, "My Test Suite");

const result = await runNLTestSuite(suite, {
  continueOnFailure: true,
  screenshotOnFailure: true,
});

console.log(formatNLTestReport(result));
```

### Natural Language Assertions

Write assertions in plain English for use in scripts or standalone:

```bash
# Title assertions
npx cbrowser assert "title contains 'Dashboard'"
npx cbrowser assert "title is 'Home Page'"

# URL assertions
npx cbrowser assert "url contains '/login'"

# Content assertions
npx cbrowser assert "page contains 'Welcome back'"

# Element assertions
npx cbrowser assert "'#submit-btn' exists"

# Count assertions
npx cbrowser assert "5 buttons"
npx cbrowser assert "3 links"
```

```typescript
const result = await browser.assert("page contains 'Success'");
console.log(result.passed);   // true/false
console.log(result.message);  // Human-readable result
console.log(result.actual);   // What was found
console.log(result.expected); // What was expected
```

### AI Test Generation

Analyze any page and generate test scenarios automatically. Useful for bootstrapping test coverage on existing sites.

```bash
# Generate tests for a page
npx cbrowser generate-tests "https://example.com"

# Output specific format
npx cbrowser generate-tests "https://example.com" --format playwright
npx cbrowser generate-tests "https://example.com" --format cbrowser

# Save to file
npx cbrowser generate-tests "https://example.com" --output tests.ts
```

```typescript
const result = await browser.generateTests("https://example.com");

console.log(result.analysis);       // Page structure analysis
console.log(result.tests);          // Generated test scenarios
console.log(result.playwrightCode); // Playwright test code
console.log(result.cbrowserScript); // CBrowser CLI script
```

### AI Test Repair

When tests break due to site changes, CBrowser can analyze the failures and suggest or apply repairs automatically. This reduces the maintenance burden of large test suites.

```bash
# Analyze a broken test and see repair suggestions
npx cbrowser repair-tests broken-test.txt

# Automatically apply the best repairs
npx cbrowser repair-tests tests.txt --auto-apply

# Apply repairs and verify they work
npx cbrowser repair-tests tests.txt --auto-apply --verify

# Save repaired tests to a new file
npx cbrowser repair-tests tests.txt --auto-apply --output fixed-tests.txt
```

**Failure types and repair strategies:**

| Failure Type | Detection | Repair Strategy |
|--------------|-----------|-----------------|
| `selector_not_found` | Element doesn't exist | Find alternative selectors on page |
| `assertion_failed` | Verify statement false | Suggest updated assertions based on page content |
| `timeout` | Step took too long | Add wait statements |
| `element_not_interactable` | Element hidden/disabled | Add scroll/wait before interaction |

**API usage:**

```typescript
import { repairTestSuite, formatRepairReport, exportRepairedTest } from 'cbrowser';

const result = await repairTestSuite(suite, {
  autoApply: true,
  verifyRepairs: true,
});

console.log(formatRepairReport(result));

for (const testResult of result.testResults) {
  console.log(exportRepairedTest(testResult));
}
```

### Flaky Test Detection

Identify unreliable tests by running them multiple times and analyzing consistency. Useful for catching timing-sensitive tests before they cause CI failures.

```bash
# Run tests 5 times (default) and detect flakiness
npx cbrowser flaky-check tests.txt

# Custom number of runs
npx cbrowser flaky-check tests.txt --runs 10

# Set custom flakiness threshold (default: 20%)
npx cbrowser flaky-check tests.txt --threshold 30

# Save report to file
npx cbrowser flaky-check tests.txt --output flaky-report.json
```

**What it measures:**

| Metric | Description |
|--------|-------------|
| **Flakiness Score** | 0% = perfectly stable, 100% = maximally flaky (50/50 pass/fail) |
| **Classification** | `stable_pass`, `stable_fail`, `flaky`, `mostly_pass`, `mostly_fail` |
| **Per-Step Analysis** | Identifies which specific steps are unreliable |
| **Duration Variance** | Detects timing-sensitive tests |

**API usage:**

```typescript
import { parseNLTestSuite, detectFlakyTests, formatFlakyTestReport } from 'cbrowser';

const suite = parseNLTestSuite(testContent, "My Tests");

const result = await detectFlakyTests(suite, {
  runs: 10,
  flakinessThreshold: 25,
  delayBetweenRuns: 1000,
});

console.log(formatFlakyTestReport(result));

for (const test of result.testAnalyses) {
  if (test.isFlaky) {
    console.log(`${test.testName}: ${test.flakinessScore}% flaky`);
    for (const step of test.stepAnalysis) {
      if (step.isFlaky) {
        console.log(`  - ${step.instruction}: ${step.flakinessScore}% flaky`);
      }
    }
  }
}
```

---

## Visual Testing

### AI Visual Regression

Compare screenshots semantically rather than pixel-by-pixel. Traditional pixel diffing flags every minor rendering difference (anti-aliasing, font hinting). AI-based comparison understands what actually changed: a button moved, text was updated, a new section was added.

```bash
# Capture a baseline
npx cbrowser ai-visual capture "https://example.com" --name homepage

# Compare against baseline
npx cbrowser ai-visual test "https://staging.example.com" homepage --html

# List baselines
npx cbrowser ai-visual list
```

### Cross-Browser Visual Testing

Compare how a page renders across Chrome, Firefox, and Safari to catch browser-specific layout issues:

```bash
npx cbrowser cross-browser "https://example.com" --html
npx cbrowser cross-browser "https://example.com" --browsers chromium,firefox,webkit
```

### Responsive Visual Testing

Test across viewport sizes (mobile, tablet, desktop) to verify responsive layouts:

```bash
npx cbrowser responsive "https://example.com" --html
npx cbrowser responsive "https://example.com" --viewports mobile,tablet,desktop-lg
npx cbrowser responsive viewports  # list available presets
```

### A/B Visual Comparison

Compare two different URLs side by side (e.g., staging vs production, old design vs new):

```bash
npx cbrowser ab "https://staging.example.com" "https://example.com" --html
npx cbrowser ab "https://old.site.com" "https://new.site.com" --label-a "Old" --label-b "New"
```

---

## Analysis

### Autonomous Bug Hunting

Rather than waiting for you to specify what to test, `hunt_bugs` explores a site autonomously and reports issues it finds: broken links, console errors, accessibility violations, and UX problems.

```bash
npx cbrowser hunt-bugs "https://your-site.com" --depth 3
```

### Chaos Engineering

Inject controlled failures to verify how your site handles degraded conditions:

```bash
npx cbrowser chaos-test "https://your-site.com" \
  --inject network-slowdown,random-timeouts,failed-assets
```

This is useful for verifying error states, loading indicators, and graceful degradation before they happen in production.

### Page Analysis

Understand any page's structure:

```bash
npx cbrowser analyze "https://example.com"
```

Output:
```
Page Analysis:
   Title: Example Domain
   Forms: 1
     - form#login (3 fields)
       Login form detected
   Buttons: 5
   Links: 12
   Has Login: yes
   Has Search: no
   Has Navigation: yes
```

---

## Persona-Based Testing

Test your site from different user perspectives. Each persona has realistic timing, error rates, and attention patterns that simulate how different types of users actually interact with interfaces.

```bash
# Run an autonomous journey as a persona
cbrowser journey "first-timer" \
  --start "https://mysite.com" \
  --goal "Complete signup"

# Compare how different user types experience the same flow
npx cbrowser compare-personas \
  --start "https://example.com" \
  --goal "Complete checkout" \
  --personas power-user,first-timer,elderly-user,mobile-user
```

**Built-in Personas:**

| Persona | Description |
|---------|-------------|
| `power-user` | Fast, efficient, uses keyboard shortcuts |
| `first-timer` | Slow, exploratory, reads everything |
| `mobile-user` | Touch interface, small screen |
| `elderly-user` | Larger text needs, slower interactions |
| `impatient-user` | Quick to abandon on friction |

**Example comparison output:**

```
Persona          | Success | Time    | Friction | Key Issues
-----------------+---------+---------+----------+------------------
power-user       | pass    | 12.5s   | 0        | -
first-timer      | pass    | 45.2s   | 2        | Confusing CTA
elderly-user     | fail    | 120.3s  | 5        | Small buttons
mobile-user      | pass    | 28.1s   | 1        | Scroll issue
```

This helps identify which user groups struggle with your interface and where the friction points are, so you can prioritize UX improvements based on data rather than assumptions.

**Custom persona creation:**

```bash
# Describe the user - AI generates appropriate parameters
npx cbrowser persona create "impatient developer who hates slow UIs" --name speed-demon
npx cbrowser persona create "elderly grandmother new to computers" --name grandma

# List all personas (built-in + custom)
npx cbrowser persona list

# View, export, import, delete
npx cbrowser persona show speed-demon
npx cbrowser persona export speed-demon
npx cbrowser persona import custom-persona.json
npx cbrowser persona delete speed-demon
```

The AI generates appropriate timing, error rates, mouse behavior, attention patterns, and viewport based on your description.

**Generate reports:**

```bash
# JSON report
npx cbrowser compare-personas --start "..." --goal "..." --output report.json

# HTML report
npx cbrowser compare-personas --start "..." --goal "..." --html
```

---

## Performance

### Performance Metrics

```bash
# Core Web Vitals
npx cbrowser perf "https://example.com"

# With budget
npx cbrowser perf audit "https://example.com" --budget-lcp 2500
```

### Performance Regression Detection

Track performance baselines and detect regressions with configurable sensitivity to avoid false positives:

```bash
npx cbrowser visual-baseline "https://your-site.com" --with-performance
npx cbrowser visual-compare --check-perf-regression

# Sensitivity profiles: strict (CI/CD), normal (default), lenient (development)
npx cbrowser perf-regression "https://example.com" baseline.json --sensitivity strict
```

---

## Modular Architecture

CBrowser is split into tree-shakeable modules so you can import only what you need:

```typescript
// Import everything
import { CBrowser, runVisualRegression, detectFlakyTests } from 'cbrowser';

// Import specific modules
import { runVisualRegression, runCrossBrowserTest } from 'cbrowser/visual';
import { runNLTestSuite, detectFlakyTests, repairTest } from 'cbrowser/testing';
import { huntBugs, runChaosTest, findElementByIntent } from 'cbrowser/analysis';
import { capturePerformanceBaseline, detectPerformanceRegression } from 'cbrowser/performance';
```

| Module | Purpose |
|--------|---------|
| `cbrowser/visual` | Visual testing (regression, cross-browser, responsive, A/B) |
| `cbrowser/testing` | Test automation (NL suites, repair, flaky detection, coverage) |
| `cbrowser/analysis` | AI analysis (bug hunting, chaos testing, persona comparison) |
| `cbrowser/performance` | Performance (baselines, regression detection) |

---

## MCP Server Integration

CBrowser runs as an MCP server for both Claude Desktop (local) and claude.ai (remote).

### Remote MCP (claude.ai)

Connect claude.ai directly to a remote CBrowser server:

1. Deploy CBrowser on your server ([full guide](docs/REMOTE-MCP-SERVER.md))
2. In claude.ai: Settings > Connectors > Add Custom Connector
3. Add URL: `https://your-cbrowser-domain.com/mcp`
4. Configure OAuth with Auth0 ([setup guide](docs/AUTH0-SETUP.md))

**Public Demo (rate-limited):** `https://cbrowser-mcp-demo.wyldfyre.ai/mcp`
- No authentication required
- Rate limit: 5 requests/minute, burst of 10
- For evaluation purposes only

**Authenticated Server:** `https://cbrowser-mcp.wyldfyre.ai/mcp`
- **OAuth 2.1 via Auth0** - For claude.ai web interface ([setup guide](docs/AUTH0-SETUP.md))
- **API Key** - For Claude Code CLI and programmatic access
- No rate limits for authenticated users

### Local MCP (Claude Desktop)

Run CBrowser locally for Claude Desktop:

```bash
npx cbrowser mcp-server
```

Add to Claude Desktop config (`~/.config/claude-desktop/config.json`):

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

### Available MCP Tools (33 total)

| Category | Tools |
|----------|-------|
| **Navigation** | `navigate`, `screenshot`, `extract` |
| **Interaction** | `click`, `smart_click`, `fill`, `scroll`, `press_key` |
| **Assertions** | `assert`, `analyze_page` |
| **Testing** | `generate_tests`, `test_suite`, `repair_tests`, `flaky_check` |
| **Visual** | `visual_baseline`, `visual_compare`, `responsive_test`, `cross_browser_test`, `ab_compare` |
| **Personas** | `journey`, `compare_personas`, `create_persona`, `list_personas` |
| **Sessions** | `save_session`, `load_session`, `list_sessions`, `delete_session` |
| **Analysis** | `hunt_bugs`, `chaos_test`, `performance_audit`, `dismiss_overlay` |
| **Utilities** | `heal_stats`, `list_baselines`, `status` |

See [Remote MCP Server Guide](docs/REMOTE-MCP-SERVER.md) for full deployment instructions.

---

## API Usage

```typescript
import { CBrowser } from 'cbrowser';

const browser = new CBrowser({
  headless: true,
  persistent: true,  // Persist cookies between sessions
});

// Navigate
await browser.navigate('https://example.com');

// Smart click with retry
const clickResult = await browser.smartClick('Sign In');

// Fill form
await browser.fill('email', 'user@example.com');

// Assert
const assertion = await browser.assert("page contains 'Welcome'");
if (!assertion.passed) {
  console.error(assertion.message);
}

// Generate tests
const tests = await browser.generateTests();
console.log(tests.playwrightCode);

// Cleanup
await browser.close();
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CBROWSER_DATA_DIR` | `~/.cbrowser` | Data storage directory |
| `CBROWSER_HEADLESS` | `true` | Run headless (set to `false` for GUI) |
| `CBROWSER_BROWSER` | `chromium` | Browser engine |
| `CBROWSER_TIMEOUT` | `30000` | Default timeout (ms) |

### Config File

Create `.cbrowserrc.json`:

```json
{
  "headless": true,
  "timeout": 60000,
  "persistent": true,
  "viewport": {
    "width": 1920,
    "height": 1080
  }
}
```

---

## Multi-Browser Support

```bash
# Firefox
npx cbrowser navigate "https://example.com" --browser firefox

# WebKit (Safari)
npx cbrowser navigate "https://example.com" --browser webkit
```

### Device Emulation

```bash
# Mobile
npx cbrowser navigate "https://example.com" --device iphone-15

# Tablet
npx cbrowser navigate "https://example.com" --device ipad-pro-12

# List devices
npx cbrowser device list
```

### Persistent Browser Context

Enable persistent mode to keep cookies and localStorage between CLI calls:

```bash
npx cbrowser navigate "https://example.com" --persistent
```

---

## Performance

CBrowser uses optimized Chromium launch flags for fast startup:

- ~1 second browser cold start (vs 3-5s default)
- Persistent context keeps cookies between calls
- Self-healing cache reduces retry overhead

---

## Examples

See the [`examples/`](examples/) directory:

### TypeScript Examples
- [`basic-usage.ts`](examples/basic-usage.ts) - Navigation, extraction, sessions
- [`smart-automation.ts`](examples/smart-automation.ts) - Smart click, assertions, test generation
- [`visual-testing.ts`](examples/visual-testing.ts) - AI visual regression, cross-browser, responsive, A/B comparison
- [`remote-mcp.ts`](examples/remote-mcp.ts) - Remote MCP server, Auth0 OAuth, demo server setup

### Workflow Recipes
- [`workflows/e2e-login-checkout.md`](examples/workflows/e2e-login-checkout.md) - End-to-end login and checkout flow with session persistence
- [`workflows/visual-regression-ci.md`](examples/workflows/visual-regression-ci.md) - Visual regression testing with baselines, cross-browser, and responsive checks
- [`workflows/accessibility-audit.md`](examples/workflows/accessibility-audit.md) - Accessibility bug hunting with persona-based a11y testing
- [`workflows/chaos-resilience-testing.md`](examples/workflows/chaos-resilience-testing.md) - Chaos engineering: network failures, slow responses, element removal
- [`workflows/persona-comparison-report.md`](examples/workflows/persona-comparison-report.md) - Multi-persona comparison with heatmaps and prioritized recommendations

### CI/CD Integration
- [`ci-cd/github-actions.yml`](examples/ci-cd/github-actions.yml) - GitHub Actions workflow for NL tests, visual and perf regression
- [`ci-cd/gitlab-ci.yml`](examples/ci-cd/gitlab-ci.yml) - GitLab CI pipeline with staged checks
- [`ci-cd/README.md`](examples/ci-cd/README.md) - Setup guide and baseline management

### Natural Language Tests
- [`natural-language-tests/e-commerce-suite.txt`](examples/natural-language-tests/e-commerce-suite.txt) - E-commerce guest checkout, search, and mobile tests
- [`natural-language-tests/auth-flow-suite.txt`](examples/natural-language-tests/auth-flow-suite.txt) - Login, invalid credentials, and password reset flows
- [`natural-language-tests/README.md`](examples/natural-language-tests/README.md) - NL test syntax reference and tips

### Configuration Templates
- [`journeys/checkout-flow.json`](examples/journeys/checkout-flow.json) - Checkout journey definition
- [`journeys/signup-flow.json`](examples/journeys/signup-flow.json) - User registration journey
- [`personas/custom-persona.json`](examples/personas/custom-persona.json) - QA tester persona template
- [`personas/accessibility-tester.json`](examples/personas/accessibility-tester.json) - Visual impairment persona with screen magnification

## Troubleshooting

### Browser Not Starting

```bash
npx playwright install chromium --force
```

### Display Issues (Linux)

CBrowser runs headless by default. For GUI mode:

```bash
CBROWSER_HEADLESS=false npx cbrowser navigate "https://example.com"
```

### Self-Healing Not Working

```bash
# Check cache status
npx cbrowser heal-stats

# Clear if corrupted
npx cbrowser heal-clear
```

## Contributing

```bash
git clone https://github.com/alexandriashai/cbrowser.git
cd cbrowser
bun install
bun run dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT - see [LICENSE](LICENSE)

## Links

- [NPM Package](https://www.npmjs.com/package/cbrowser)
- [GitHub Repository](https://github.com/alexandriashai/cbrowser)
- [Issue Tracker](https://github.com/alexandriashai/cbrowser/issues)
- [Roadmap](ROADMAP.md)
