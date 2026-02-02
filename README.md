# CBrowser (Cognitive Browser)

**The browser automation built for AI agents, not human developers.**

*CBrowser = Cognitive Browser — browser automation that thinks.*

Most browser automation tools are built for humans writing scripts. CBrowser is built from the ground up as an MCP server for AI agents—natural language is the primary interface, not an afterthought.

[![npm version](https://badge.fury.io/js/cbrowser.svg)](https://www.npmjs.com/package/cbrowser)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Ready](https://img.shields.io/badge/MCP-Remote%20%2B%20Local-blue)](https://modelcontextprotocol.io)

## The AI-Native Difference

Traditional automation tools were built for developers writing scripts. CBrowser was built for **AI agents operating autonomously**. This fundamental difference shapes everything:

| Traditional Tools | CBrowser (AI-Native) |
|-------------------|----------------------|
| Scripts written by humans | Natural language as primary interface |
| Stateless between calls | **Session persistence across calls** |
| Manual test maintenance | **Self-healing selectors + AI test repair** |
| Only does what you script | **Autonomous discovery (hunt_bugs)** |
| Breaks when sites change | **Multi-dimensional baselines track drift** |
| Single execution path | **Persona-based testing for real users** |
| Fails silently | **Built-in chaos engineering for resilience** |
| Developer perspective | **Constitutional safety for AI autonomy** |

---

## 8 Things Only CBrowser Does

### 1. 🤖 AI-Native Architecture

Built from the ground up as an MCP server for AI agents. Every tool is designed to be called by Claude, not scripted by developers. Natural language is the primary interface—not a wrapper around CSS selectors.

```bash
# Remote MCP for Claude.ai
https://cbrowser-mcp.wyldfyre.ai/mcp

# Local MCP for Claude Desktop
npx cbrowser mcp-server
```

### 2. 💬 Natural Language as First-Class Input

Not just "convenience" natural language on top of selectors. The entire API is natural language native:

```bash
npx cbrowser smart-click "the blue submit button in the checkout form"
npx cbrowser fill "email field" "user@example.com"
npx cbrowser assert "page shows order confirmation with total over $50"
```

### 3. 🔍 Autonomous Discovery (hunt_bugs)

Most tools wait for you to tell them what to test. CBrowser proactively hunts for bugs:

```bash
npx cbrowser hunt-bugs "https://your-site.com" --depth 3
```

It explores your site autonomously, finding broken links, console errors, accessibility violations, and UX issues you didn't know to look for.

### 4. 💥 Built-in Chaos Engineering

Inject failures to see how your site handles them:

```bash
npx cbrowser chaos-test "https://your-site.com" \
  --inject network-slowdown,random-timeouts,failed-assets
```

### 5. 🔄 Self-Healing Selectors + AI Test Repair

When elements change, CBrowser adapts automatically. When tests break, it repairs them:

```bash
# Auto-repair broken tests
npx cbrowser repair-tests broken-test.txt --auto-apply --verify
```

### 6. 📊 Multi-Dimensional Baselines

Not just visual diffs—CBrowser tracks visual appearance AND performance metrics together:

```bash
npx cbrowser visual-baseline "https://your-site.com" --with-performance
npx cbrowser visual-compare --check-perf-regression
```

### 7. 👥 Persona-Based Testing

Test as different user types with realistic human behavior:

```bash
npx cbrowser compare-personas \
  --start "https://your-site.com" \
  --goal "Complete checkout" \
  --personas power-user,elderly-user,mobile-user,first-timer
```

Each persona has realistic timing, error rates, and attention patterns.

### 8. 🗂️ Session Persistence Across Calls

The killer feature for AI agents: state persists between invocations. Your AI agent can log in, do work across multiple calls, and maintain context—solving the statelessness problem that makes other tools impractical for agents.

```bash
npx cbrowser session save "logged-in"
# ... later, in a new session ...
npx cbrowser session load "logged-in"
```

---

## Constitutional AI Safety

CBrowser is the only browser automation with built-in ethical boundaries—critical when AI agents operate autonomously:

| Zone | Actions | Behavior |
|------|---------|----------|
| 🟢 **Green** | Navigate, read, screenshot | Auto-execute |
| 🟡 **Yellow** | Click buttons, fill forms | Log and proceed |
| 🔴 **Red** | Submit, delete, purchase | **Requires verification** |
| ⬛ **Black** | Bypass auth, inject scripts | **Never executes** |

This isn't optional safety theater—it's how you give AI agents browser access without risking catastrophic actions.

---

## Feature Comparison

### AI-Native Capabilities (Only CBrowser)

| Capability | CBrowser | Skyvern | Browser-Use | Playwright |
|------------|:--------:|:-------:|:-----------:|:----------:|
| **Built as MCP Server** | ✅ Native | ❌ | ❌ | ❌ |
| **Remote MCP (claude.ai)** | ✅ | ❌ | ❌ | ❌ |
| **Session persistence** | ✅ | ❌ | ❌ | Manual |
| **Autonomous bug hunting** | ✅ | ❌ | ❌ | ❌ |
| **Chaos engineering** | ✅ | ❌ | ❌ | ❌ |
| **Constitutional safety** | ✅ | ❌ | ❌ | ❌ |
| **Multi-persona testing** | ✅ | ❌ | ❌ | ❌ |
| **AI test repair** | ✅ | ❌ | ❌ | ❌ |
| **Visual + perf baselines** | ✅ | ❌ | ❌ | ❌ |

### Table Stakes (Everyone Has)

| Feature | CBrowser | Others |
|---------|:--------:|:------:|
| Natural language selectors | ✅ | ✅ |
| Self-healing selectors | ✅ | ✅ |
| Screenshot capture | ✅ | ✅ |
| Form filling | ✅ | ✅ |

---

## Also Included

| Traditional Automation | CBrowser |
|------------------------|----------|
| Brittle CSS selectors | AI vision: "click the blue login button" |
| Breaks when DOM changes | **Self-healing selectors** adapt automatically |
| Crashes on element not found | **Smart retry** finds alternatives |
| Manual test assertions | **Natural language assertions** |
| Scripted tests only | **AI test generation** from page analysis |
| Stateless between runs | **Persistent sessions, cookies, localStorage** |

## Quick Start

### Installation

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

## v6.0.0 Features

### Multi-Persona Comparison

Run the same journey with multiple personas in parallel and compare results:

```bash
# Compare how different user types experience your site
npx cbrowser compare-personas \
  --start "https://example.com" \
  --goal "Complete checkout" \
  --personas power-user,first-timer,elderly-user,mobile-user

# Output:
# ┌─────────────────┬──────────┬──────────┬──────────┬─────────────────┐
# │ Persona         │ Success  │ Time     │ Friction │ Key Issues      │
# ├─────────────────┼──────────┼──────────┼──────────┼─────────────────┤
# │ power-user      │ ✓        │ 12.5s    │ 0        │ -               │
# │ first-timer     │ ✓        │ 45.2s    │ 2        │ Confusing CTA   │
# │ elderly-user    │ ✗        │ 120.3s   │ 5        │ Small buttons   │
# │ mobile-user     │ ✓        │ 28.1s    │ 1        │ Scroll issue    │
# └─────────────────┴──────────┴──────────┴──────────┴─────────────────┘
```

**Generate reports:**

```bash
# JSON report
npx cbrowser compare-personas --start "..." --goal "..." --output report.json

# HTML report (visual dashboard)
npx cbrowser compare-personas --start "..." --goal "..." --html
```

**What you learn:**
- Which personas struggle most (friction points)
- Time differences between expert and beginner users
- Mobile vs desktop experience gaps
- Accessibility issues affecting specific user types
- Actionable recommendations for improvement

**Automatic recommendations:**
- "Beginners take 3.5x longer than experts - consider adding more guidance"
- "Mobile users experience 2x more friction - review mobile UX"
- "Common friction: 'Button too small for touch', 'Form validation unclear'"

## v6.2.0 Features

### AI Test Repair

Automatically analyze failing tests and suggest or apply repairs:

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

**What it analyzes:**

| Failure Type | Detection | Repair Strategy |
|--------------|-----------|-----------------|
| `selector_not_found` | Element doesn't exist | Find alternative selectors on page |
| `assertion_failed` | Verify statement false | Suggest updated assertions based on page content |
| `timeout` | Step took too long | Add wait statements |
| `element_not_interactable` | Element hidden/disabled | Add scroll/wait before interaction |

**Example output:**

```
🔧 Analyzing test: Login Flow

   → click the signin button
     ✗ Failed: Failed to click: signin button
     💡 Suggestions:
        - Update selector to "Login" (70%)
          → click "Login"
        - Add wait before this step (50%)
          → wait 2 seconds

📊 SUMMARY
  Total Failed Steps: 1
  Repair Success Rate: 100%
```

**API usage:**

```typescript
import { repairTestSuite, formatRepairReport, exportRepairedTest } from 'cbrowser';

const result = await repairTestSuite(suite, {
  autoApply: true,
  verifyRepairs: true,
});

console.log(formatRepairReport(result));

// Export repaired test to file format
for (const testResult of result.testResults) {
  console.log(exportRepairedTest(testResult));
}
```

## v6.3.0 Features

### Flaky Test Detection

Identify unreliable tests by running them multiple times and analyzing consistency:

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

**Example output:**

```
🔍 FLAKY TEST DETECTION REPORT
══════════════════════════════════════════════════════════════

📋 Suite: Login Tests
   Runs per test: 5
   Total duration: 45.2s

──────────────────────────────────────────────────────────────
TEST RESULTS
──────────────────────────────────────────────────────────────

✅ STABLE_PASS (5/5 passed, flakiness: 0%)
   Login Flow
   └─ Avg duration: 2.1s (±0.1s)

⚠️  FLAKY (3/5 passed, flakiness: 80%)
   Search Functionality
   └─ Avg duration: 3.5s (±1.2s)
   └─ Flaky steps:
      • wait for "Loading" appears (60% flaky)
      • verify page contains "results" (40% flaky)

══════════════════════════════════════════════════════════════
📊 SUMMARY
══════════════════════════════════════════════════════════════

✅ Overall Flakiness: 40%
   Stable tests: 1 | Flaky tests: 1

⚠️  Most flaky test: Search Functionality (80%)
⚠️  Most flaky step: wait for "Loading" appears (60%)

💡 RECOMMENDATIONS
• Search Functionality: Add explicit waits, increase timeout
• wait for "Loading" appears: Use more specific selector
```

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

// Access detailed analysis
for (const test of result.testAnalyses) {
  if (test.isFlaky) {
    console.log(`${test.testName}: ${test.flakinessScore}% flaky`);
    for (const step of test.stepAnalysis) {
      if (step.isFlaky) {
        console.log(`  └─ ${step.instruction}: ${step.flakinessScore}% flaky`);
      }
    }
  }
}
```

## v6.1.0 Features

### Natural Language Test Suites

Write tests in plain English - CBrowser parses and executes them:

```bash
# Run tests from a file
npx cbrowser test-suite login-test.txt --html

# Run inline tests (steps separated by semicolons)
npx cbrowser test-suite --inline "go to https://example.com ; click login ; verify url contains /dashboard"
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

# Combined
npx cbrowser test-suite tests.txt --output results.json --html
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
// Pass rate: 100%
// Tests: 1 passed, 0 failed
```

## v5.0.0 Features

### Smart Click with Auto-Retry

When an element isn't found, CBrowser automatically:
1. Checks the self-healing cache for known alternatives
2. Generates alternative selectors (text variants, ARIA roles, attributes)
3. Tries each alternative with configurable retry logic
4. Caches working selectors for future use

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

### Natural Language Assertions

Write assertions in plain English:

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

### Self-Healing Selector Cache

CBrowser remembers which selectors work on each domain:

```bash
# View cache statistics
npx cbrowser heal-stats

# Clear the cache
npx cbrowser heal-clear
```

```typescript
const stats = browser.getSelectorCacheStats();
console.log(stats.totalEntries);    // 42
console.log(stats.totalSuccesses);  // 156
console.log(stats.topDomains);      // [{ domain: 'example.com', count: 15 }, ...]
```

### AI Test Generation

Analyze any page and generate test scenarios automatically:

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

**Example generated test:**
```typescript
test('Login - Valid Credentials', async ({ page }) => {
  await page.goto('https://example.com');
  await page.locator('[name="email"]').fill('test@example.com');
  await page.locator('[name="password"]').fill('password123');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/dashboard/);
});
```

### Page Analysis

Understand any page's structure:

```bash
npx cbrowser analyze "https://example.com"
```

Output:
```
📊 Page Analysis:
   Title: Example Domain
   Forms: 1
     - form#login (3 fields)
       🔐 Login form detected
   Buttons: 5
   Links: 12
   Has Login: ✅
   Has Search: ❌
   Has Navigation: ✅
```

### MCP Server Integration

CBrowser can run as an MCP server for both Claude Desktop (local) and claude.ai (remote).

#### Option 1: Remote MCP (claude.ai)

Connect claude.ai directly to a remote CBrowser server:

1. Deploy CBrowser on your server ([full guide](docs/REMOTE-MCP-SERVER.md))
2. In claude.ai: Settings → Integrations → Custom MCP Servers
3. Add URL: `https://your-cbrowser-domain.com/mcp`

**Try our public demo:** `https://cbrowser-mcp.wyldfyre.ai/mcp`

#### Option 2: Local MCP (Claude Desktop)

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

#### Available MCP Tools (31 total)

| Category | Tools |
|----------|-------|
| **Navigation** | `navigate`, `screenshot`, `extract` |
| **Interaction** | `click`, `smart_click`, `fill`, `scroll`, `press_key` |
| **Assertions** | `assert`, `analyze_page` |
| **Testing** | `generate_tests`, `test_suite`, `repair_tests`, `flaky_check` |
| **Visual** | `visual_baseline`, `visual_compare`, `responsive_test`, `cross_browser_test`, `ab_compare` |
| **Personas** | `journey`, `compare_personas`, `create_persona`, `list_personas` |
| **Sessions** | `save_session`, `load_session`, `list_sessions` |
| **Analysis** | `hunt_bugs`, `chaos_test`, `performance_audit` |
| **Utilities** | `heal_stats`, `list_baselines` |

See [Remote MCP Server Guide](docs/REMOTE-MCP-SERVER.md) for full deployment instructions.

## Core Features

### AI-Powered Element Selection

```bash
# Natural language
cbrowser click "the main navigation menu"
cbrowser fill "password field" "secret123"

# Accessibility-based
cbrowser click "aria:button/Submit"

# Visual description
cbrowser click "visual:red button in header"

# Semantic type
cbrowser fill "semantic:email" "user@example.com"

# Fallback to CSS
cbrowser click "css:#login-btn"
```

### Session Persistence

```bash
# Save session (cookies, localStorage, sessionStorage)
cbrowser session save "logged-in" --url "https://example.com"

# Load session
cbrowser session load "logged-in"

# List sessions
cbrowser session list
```

### Persistent Browser Context

Enable persistent mode to keep cookies and localStorage between CLI calls:

```bash
npx cbrowser navigate "https://example.com" --persistent
```

### Persona-Driven Testing

```bash
# Run autonomous journey as a persona
cbrowser journey "first-timer" \
  --start "https://mysite.com" \
  --goal "Complete signup"

# List personas
cbrowser persona list
```

**Built-in Personas:**

| Persona | Description |
|---------|-------------|
| `power-user` | Tech-savvy, expects efficiency |
| `first-timer` | New user, slow and exploratory |
| `mobile-user` | Touch interface, small screen |
| `elderly-user` | Vision/motor limitations |
| `impatient-user` | Quick to abandon |

**AI Persona Creation (v5.3.0):**

Create custom personas from natural language descriptions:

```bash
# Describe the user - AI generates all parameters
npx cbrowser persona create "impatient developer who hates slow UIs" --name speed-demon
npx cbrowser persona create "elderly grandmother new to computers with tremors" --name grandma
npx cbrowser persona create "distracted teenager on their phone"

# List all personas (built-in + custom)
npx cbrowser persona list

# View full persona config
npx cbrowser persona show speed-demon

# Export/import for sharing
npx cbrowser persona export speed-demon
npx cbrowser persona import custom-persona.json

# Delete custom persona
npx cbrowser persona delete speed-demon
```

The AI analyzes your description and generates appropriate:
- **Timing**: reaction times, click delays, typing speed
- **Error rates**: misclicks, typos, accidental double-clicks
- **Mouse behavior**: movement speed, jitter, overshoot
- **Attention patterns**: reading style, scroll behavior, focus areas
- **Viewport**: device-appropriate screen size

### Multi-Browser Support

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

### Performance Metrics

```bash
# Core Web Vitals
npx cbrowser perf "https://example.com"

# With budget
npx cbrowser perf audit "https://example.com" --budget-lcp 2500
```

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

## Constitutional Safety

CBrowser classifies actions by risk level:

| Zone | Actions | Behavior |
|------|---------|----------|
| **Green** | Navigate, read, screenshot | Auto-execute |
| **Yellow** | Click, fill forms | Log and proceed |
| **Red** | Submit, delete, purchase | Requires `--force` |
| **Black** | Bypass auth, inject scripts | Never execute |

```bash
# Bypass safety for testing
cbrowser click "Delete Account" --force
```

## Performance

CBrowser uses optimized Chromium launch flags for fast startup:

- **~1 second** browser cold start (vs 3-5s default)
- **Persistent context** keeps cookies between calls
- **Self-healing cache** reduces retry overhead

## Examples

See the [`examples/`](examples/) directory:

- `basic-usage.ts` - Navigation, extraction, sessions
- `smart-automation.ts` - Smart click, assertions, test generation
- `journeys/checkout-flow.json` - Persona journey definition
- `personas/custom-persona.json` - Custom persona template

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
