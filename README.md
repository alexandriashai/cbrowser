# CBrowser (Cognitive Browser)

**The browser automation that thinks like your users.** Simulate real user cognition with patience thresholds, frustration tracking, and abandonment detection — know when users give up before they do.

Built on Playwright with cognitive user simulation, constitutional safety boundaries, and the only UX testing that models how humans actually think.

[![npm version](https://img.shields.io/npm/v/cbrowser.svg)](https://www.npmjs.com/package/cbrowser)
[![Tests](https://github.com/alexandriashai/cbrowser/actions/workflows/test.yml/badge.svg)](https://github.com/alexandriashai/cbrowser/actions/workflows/test.yml)
[![License: BSL-1.1](https://img.shields.io/badge/License-BSL--1.1-blue.svg)](LICENSE)
[![MCP Ready](https://img.shields.io/badge/MCP-Remote%20%2B%20Local-blue)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-green.svg)](https://nodejs.org/)

---

## The Story Behind CBrowser

I spent 16 years in international higher education marketing and UX, where I learned that the biggest accessibility and usability problems are the ones you can't see coming. A button that works perfectly for me might be invisible to a first-generation student in rural Indonesia using a slow connection on a small screen.

Traditional testing tools couldn't help—they tested whether buttons clicked, not whether real humans could use them.

Then came the AI agent revolution. I watched autonomous agents navigate websites, and I saw two problems:

1. **They broke things.** Agents would accidentally submit forms, delete data, or get stuck in infinite loops. There were no guardrails.

2. **They exposed how shallow our testing was.** If an AI couldn't figure out a UI, what chance did a confused first-timer have?

I realized: **The industry needs tools that think like users, not like developers.** Tools that model patience, frustration, and the moment someone gives up. Tools that prevent autonomous agents from causing harm.

So I built CBrowser.

### Why These Technical Choices

| Decision | Why |
|----------|-----|
| **TypeScript** | Type safety for a complex codebase; better IDE experience for contributors |
| **Playwright over Puppeteer** | Cross-browser support (Chromium, Firefox, WebKit) out of the box; better auto-waiting |
| **Constitutional AI safety** | AI agents need boundaries. Borrowed from Anthropic's constitutional AI principles to create risk zones |
| **Cognitive simulation** | Based on UX research (Nielsen Norman Group, Baymard Institute) on how humans actually scan and interact with pages |
| **MCP-first architecture** | Built for the Claude ecosystem. MCP is the future of AI tool integration |

### What I Learned Building This

- **Shipping beats perfecting.** 80+ npm versions taught me to iterate in public
- **Real users reveal real problems.** Features I thought were clever often weren't useful; user feedback redirected the roadmap
- **AI safety is a UX problem.** The same patterns that make sites confusing to humans make them dangerous for agents

---

## Why CBrowser?

Most browser automation tests if buttons click. CBrowser tests if **real humans** can use your site.

### What Makes CBrowser Different

| Problem | Traditional Tools | CBrowser |
|---------|-------------------|----------|
| **User behavior** | Simulates clicks and typing | **Simulates how users THINK** — patience, frustration, confusion |
| **UX friction** | Fails when buttons don't work | **Detects when users would give up** before they do |
| **AI safety** | No guardrails for autonomous agents | **Constitutional safety** — risk zones prevent destructive actions |
| **Resilience** | Tests happy paths | **Chaos engineering** — inject failures to test error handling |
| **Bug discovery** | Tests what you specify | **Autonomous bug hunting** — finds issues you didn't know to look for |

### Also Includes (Table Stakes)

- **Session persistence** — State persists across calls (cookies, localStorage)
- **Self-healing selectors** — Automatically adapts when DOM changes
- **Natural language interface** — Describe elements instead of CSS selectors
- **MCP server** — Works with Claude Desktop, claude.ai, and any MCP client

---

## Quick Start

### Option 1: Claude Code Skill Installation

If you use [Claude Code](https://claude.ai/claude-code), install CBrowser as a skill for seamless AI-assisted browser automation:

```bash
# One-line installation
curl -fsSL https://raw.githubusercontent.com/alexandriashai/cbrowser/main/scripts/install-skill.sh | bash

# Or via npm CLI
npx cbrowser install-skill
```

This installs CBrowser to `~/.claude/skills/CBrowser/` with full skill structure:
- `SKILL.md` - Main skill file with workflow routing
- `Workflows/` - Navigate, Interact, Extract, Test, Journey workflows
- `Tools/CBrowser.ts` - CLI wrapper
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
# Quick exploration (free, heuristic-based)
cbrowser explore "first-timer" \
  --start "https://mysite.com" \
  --goal "Complete signup"

# Cognitive journey (API-powered, realistic user simulation)
cbrowser cognitive-journey \
  --persona "first-timer" \
  --start "https://mysite.com" \
  --goal "Complete signup" \
  --verbose

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

### Cognitive User Simulation (v8.3.1)

Go beyond timing and click patterns—simulate how users actually **think**. Cognitive journeys model realistic decision-making with abandonment detection, frustration tracking, and genuine cognitive traits.

**Why it matters:** Traditional persona testing simulates motor behavior (slow clicks, typos). Cognitive simulation models mental behavior: "Would a confused first-timer give up here? Would they even notice that button?"

```bash
# Run a cognitive journey (requires Anthropic API key)
npx cbrowser config set-api-key
npx cbrowser cognitive-journey \
  --persona first-timer \
  --start "https://example.com" \
  --goal "sign up for an account"

# With vision mode (v8.4.0) - sends screenshots to Claude for visual understanding
npx cbrowser cognitive-journey \
  --persona elderly-user \
  --start "https://example.com" \
  --goal "find the help page" \
  --vision \
  --verbose

# With all options
npx cbrowser cognitive-journey \
  --persona elderly-user \
  --start "https://example.com" \
  --goal "find the help page" \
  --max-steps 50 \
  --max-time 180 \
  --vision \
  --headless \
  --verbose
```

**Vision Mode (v8.4.0):** Enable `--vision` to send actual screenshots to Claude. This dramatically improves accuracy for:
- Complex layouts with multiple similar elements
- Dropdown menus that need hover to reveal items
- Visual cues that aren't captured in element text
- Pages with dynamic content

**Cognitive Traits (7 dimensions):**

| Trait | What it measures | Example impact |
|-------|------------------|----------------|
| `patience` | How quickly they give up | Low patience → abandons after 3 failed attempts |
| `riskTolerance` | Willingness to click unfamiliar elements | Low risk → avoids buttons without clear labels |
| `comprehension` | Ability to understand UI conventions | Low comprehension → misreads icons |
| `persistence` | Tendency to retry vs. try something else | High persistence → keeps trying same approach |
| `curiosity` | Tendency to explore vs. stay focused | High curiosity → clicks interesting sidebars |
| `workingMemory` | Remembers what they've tried | Low memory → repeats failed actions |
| `readingTendency` | Reads content vs. scans for CTAs | High reading → notices inline instructions |

**Attention Patterns:**

- `targeted` — Direct path to goal (power users)
- `f-pattern` — Scans top, then left side (web convention)
- `z-pattern` — Diagonal scanning (marketing pages)
- `exploratory` — Random exploration (curious users)
- `sequential` — Top-to-bottom reading (thorough users)
- `thorough` — Reads everything carefully (careful users)
- `skim` — Rapid scanning for keywords (impatient users)

**Abandonment Detection:**

The simulation automatically stops when a realistic user would give up:

| Trigger | Threshold | Monologue |
|---------|-----------|-----------|
| Patience depleted | `< 0.1` | "This is taking too long..." |
| Too confused | `> 0.8` for 30s | "I have no idea what to do..." |
| Too frustrated | `> 0.85` | "This is so frustrating..." |
| No progress | 10+ steps, `< 0.1` progress | "I'm not getting anywhere..." |
| Stuck in loop | Same pages 3x | "I keep ending up here..." |

**Output includes:**
- Goal achievement status
- Abandonment reason (if applicable)
- Step-by-step decision trace with reasoning
- Friction points with screenshots
- Cognitive state over time (patience, confusion, frustration)
- Full internal monologue

**MCP Integration (Claude Desktop/Code):**

For Claude Desktop or Claude Code users, use the MCP tools instead:

```typescript
// Initialize cognitive journey
const profile = await mcp.cognitive_journey_init({
  persona: "first-timer",
  goal: "sign up as a provider",
  startUrl: "https://example.com"
});

// After each action, update state
const state = await mcp.cognitive_journey_update_state({
  sessionId: profile.sessionId,
  patienceChange: -0.05,
  confusionChange: 0.1,
  currentUrl: "https://example.com/register"
});

if (state.shouldAbandon) {
  console.log(`User gave up: ${state.abandonmentReason}`);
}
```

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

## UX Analysis Suite (v9.0.0)

CBrowser v9 introduces four breakthrough features for understanding and improving user experience at scale.

### Agent-Ready Audit

Analyze any website for AI-agent friendliness. Find out why your site is hard for AI agents to automate.

```bash
npx cbrowser agent-ready-audit "https://example.com" --html
```

**Output includes:**
- **Findability score** — Can agents locate elements? (aria-labels, data-testid, semantic HTML)
- **Stability score** — Will selectors break? (hidden inputs, sticky overlays, custom dropdowns)
- **Accessibility score** — ARIA/semantic HTML quality
- **Semantics score** — Meaningful labels and text content
- **Letter grade (A-F)** with prioritized remediation recommendations
- Code examples for each fix

**Example output:**
```
🤖 AGENT-READY AUDIT: example.com

   SCORE: 67/100  GRADE: D

   ┌────────────────┬────────────────┬────────────────┐
   │ Findability    │ Stability      │ Accessibility  │
   │     72/100     │    58/100      │    71/100      │
   └────────────────┴────────────────┴────────────────┘

   TOP RECOMMENDATIONS

   1. [HIGH] Add aria-label to search button
      <button aria-label="Search">

   2. [HIGH] Replace div onclick with button
      <button onclick="..."> instead of <div onclick="...">
```

### Competitive UX Benchmark

Run identical cognitive journeys across your site AND competitors. Get head-to-head UX comparison.

```bash
npx cbrowser competitive-benchmark \
  --sites "https://yoursite.com,https://competitor.com,https://another-competitor.com" \
  --goal "sign up for free trial" \
  --persona "first-timer" \
  --html
```

**Features:**
- **Parallel site testing** — Runs journeys concurrently across all sites
- **Abandonment risk scale (1-10)** with descriptive labels
- **Comparative rankings** with strengths/weaknesses per site
- **Competitive recommendations** — "Competitor A does this better"

**Abandonment Risk Scale:**
| Score | Label | Meaning |
|-------|-------|---------|
| 1-2 | Very Low | Users likely to complete. Smooth experience. |
| 3-4 | Low | Minor friction. Most users persist. |
| 5-6 | Medium | Noticeable friction. Some users may leave. |
| 7-8 | High | Significant obstacles. Many users abandon. |
| 9-10 | Very High | Critical barriers. Most users will leave. |

### Accessibility Empathy Mode

Simulate how users with disabilities *experience* your site — not just WCAG compliance checking.

```bash
npx cbrowser empathy-audit "https://example.com" \
  --goal "complete signup" \
  --disabilities "motor-tremor,low-vision,adhd" \
  --html
```

**6 Disability-Focused Personas:**

| Persona | Simulates |
|---------|-----------|
| `motor-tremor` | Essential tremor, Parkinson's — hand jitter, reduced precision |
| `low-vision` | Macular degeneration, cataracts — needs 3x magnification, high contrast |
| `cognitive-adhd` | ADHD — reduced attention span, high distraction rate |
| `dyslexic` | Dyslexia — slower reading, word jumbling |
| `deaf` | Deaf/hard of hearing — no audio cues, relies on captions |
| `elderly` | Age-related decline — slower reactions, larger touch targets needed |

**Barrier Detection:**
- Motor precision issues (touch targets < 44x44px)
- Visual clarity problems (contrast ratio < 4.5:1)
- Cognitive load overload (too many options, complex forms)
- Timing issues (timeouts, auto-advancing carousels)

**WCAG Mapping:** Each barrier links to specific WCAG criteria (2.5.5 touch targets, 1.4.3 contrast, etc.)

### Probabilistic Focus Hierarchies

Realistic attention simulation based on eye-tracking research. Different task types focus on different page areas.

**Task Types:**

| Type | Prioritizes | Based on |
|------|-------------|----------|
| `find_information` | Headings (95%), Navigation (85%), Search (75%) | Looking for specific info |
| `complete_action` | CTAs (95%), Forms (90%), Navigation (80%) | Trying to do something |
| `explore` | Hero (85%), Headings (80%), Navigation (75%) | Just browsing |
| `compare` | Content (90%), Headings (85%), Navigation (70%) | Comparing options |
| `troubleshoot` | Search (90%), Navigation (85%), Content (80%) | Fixing a problem |

**Distraction Filtering:**
- Cookie banners: 85% ignore rate
- Newsletter popups: 90% ignore rate
- Chat widgets: 80% ignore rate
- Social share buttons: 80% ignore rate

Based on research from Nielsen Norman Group (F-pattern scanning), Baymard Institute (e-commerce UX), and WebAIM (accessibility patterns).

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

**Public Demo (rate-limited):** `https://cbrowser-mcp-demo.wyldfyre.ai/mcp`
- No authentication required
- Rate limit: 5 requests/minute, burst of 10
- For evaluation purposes only

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

### Available MCP Tools (36 total)

| Category | Tools |
|----------|-------|
| **Navigation** | `navigate`, `screenshot`, `extract` |
| **Interaction** | `click`, `smart_click`, `fill`, `scroll`, `press_key` |
| **Assertions** | `assert`, `analyze_page` |
| **Testing** | `generate_tests`, `test_suite`, `repair_tests`, `flaky_check` |
| **Visual** | `visual_baseline`, `visual_compare`, `responsive_test`, `cross_browser_test`, `ab_compare` |
| **Personas** | `journey`, `compare_personas`, `create_persona`, `list_personas` |
| **Cognitive** | `cognitive_journey_init`, `cognitive_journey_update_state`, `list_cognitive_personas` |
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

### API Key Configuration (for Cognitive Journeys)

Cognitive journeys require an Anthropic API key for standalone CLI usage:

```bash
# Set your API key (stored in ~/.cbrowserrc.json)
npx cbrowser config set-api-key

# View configured key (masked)
npx cbrowser config show-api-key

# Remove API key
npx cbrowser config remove-api-key

# Set custom model (default: claude-sonnet-4-20250514)
npx cbrowser config set-model claude-opus-4-20250514
```

**Note:** MCP users (Claude Desktop/Code) don't need API key configuration—cognitive journeys use the existing Claude session.

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

## CI/CD Integration

CBrowser provides native integrations for CI/CD pipelines. Add browser automation, visual regression, and NL test validation to every pull request.

### GitHub Actions

Use the official GitHub Action for zero-config setup:

```yaml
# .github/workflows/cbrowser.yml
name: CBrowser Tests
on: [pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: alexandriashai/cbrowser@v9
        with:
          test-file: tests/e2e/checkout.txt
          sensitivity: strict
```

Available inputs: `test-file`, `url`, `command`, `browsers`, `sensitivity`.

### GitLab CI

Include the reusable component:

```yaml
include:
  - component: gitlab.com/alexandriashai/cbrowser/.gitlab-ci-component.yml
    inputs:
      test-file: tests/e2e/checkout.txt
      sensitivity: strict
```

### Docker

Run CBrowser in any CI system using the Docker image:

```bash
docker run --rm -v $(pwd)/tests:/work/tests ghcr.io/alexandriashai/cbrowser:latest \
  test-suite tests/checkout.txt --output results.json --html
```

### Exit Codes

CBrowser exits with code 1 on test failure, making it compatible with any CI system that uses exit codes to determine pass/fail status.

For detailed setup guides and examples, see [`examples/ci-cd/`](examples/ci-cd/).

---

## Examples

See the [`examples/`](examples/) directory:

### TypeScript Examples
- [`basic-usage.ts`](examples/basic-usage.ts) - Navigation, extraction, sessions
- [`smart-automation.ts`](examples/smart-automation.ts) - Smart click, assertions, test generation
- [`visual-testing.ts`](examples/visual-testing.ts) - AI visual regression, cross-browser, responsive, A/B comparison
- [`remote-mcp.ts`](examples/remote-mcp.ts) - Remote MCP server setup and demo server connection
- [`cognitive-journey.ts`](examples/cognitive-journey.ts) - Cognitive user simulation with personas, abandonment, and friction detection

### Workflow Recipes
- [`workflows/e2e-login-checkout.md`](examples/workflows/e2e-login-checkout.md) - End-to-end login and checkout flow with session persistence
- [`workflows/visual-regression-ci.md`](examples/workflows/visual-regression-ci.md) - Visual regression testing with baselines, cross-browser, and responsive checks
- [`workflows/accessibility-audit.md`](examples/workflows/accessibility-audit.md) - Accessibility bug hunting with persona-based a11y testing
- [`workflows/chaos-resilience-testing.md`](examples/workflows/chaos-resilience-testing.md) - Chaos engineering: network failures, slow responses, element removal
- [`workflows/persona-comparison-report.md`](examples/workflows/persona-comparison-report.md) - Multi-persona comparison with heatmaps and prioritized recommendations
- [`workflows/cognitive-journey-testing.md`](examples/workflows/cognitive-journey-testing.md) - Cognitive user simulation with abandonment detection and friction analysis

### CI/CD Integration
- [`ci-cd/github-actions.yml`](examples/ci-cd/github-actions.yml) - GitHub Actions workflow for NL tests, visual and perf regression
- [`ci-cd/gitlab-ci.yml`](examples/ci-cd/gitlab-ci.yml) - GitLab CI pipeline with staged checks
- [`ci-cd/README.md`](examples/ci-cd/README.md) - Setup guide and baseline management

### Natural Language Tests
- [`natural-language-tests/e-commerce-suite.txt`](examples/natural-language-tests/e-commerce-suite.txt) - E-commerce guest checkout, search, and mobile tests
- [`natural-language-tests/auth-flow-suite.txt`](examples/natural-language-tests/auth-flow-suite.txt) - Login, invalid credentials, and password reset flows
- [`natural-language-tests/provider-discovery-journey.txt`](examples/natural-language-tests/provider-discovery-journey.txt) - Cognitive journey for provider discovery and registration
- [`natural-language-tests/README.md`](examples/natural-language-tests/README.md) - NL test syntax reference and tips

### Configuration Templates
- [`journeys/checkout-flow.json`](examples/journeys/checkout-flow.json) - Checkout journey definition
- [`journeys/signup-flow.json`](examples/journeys/signup-flow.json) - User registration journey
- [`journeys/cognitive-discovery-journey.json`](examples/journeys/cognitive-discovery-journey.json) - Cognitive journey with custom traits and abandonment thresholds
- [`personas/custom-persona.json`](examples/personas/custom-persona.json) - QA tester persona template
- [`personas/accessibility-tester.json`](examples/personas/accessibility-tester.json) - Visual impairment persona with screen magnification
- [`personas/cognitive-curious-explorer.json`](examples/personas/cognitive-curious-explorer.json) - Full cognitive persona with traits, attention pattern, and internal voice

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

**Business Source License 1.1 (BSL-1.1)**

CBrowser is source-available software. You can:
- ✅ Use freely for **non-production** purposes (development, testing, evaluation, personal projects)
- ✅ Read, modify, and learn from the source code
- ✅ Contribute to the project

**Production use** (commercial services, revenue-generating applications, internal business operations) requires a commercial license.

On **February 5, 2030**, the license automatically converts to **Apache 2.0** (fully open source).

For commercial licensing: [alexandria.shai.eden@gmail.com](mailto:alexandria.shai.eden@gmail.com)

See [LICENSE](LICENSE) for full terms.

## Links

- [NPM Package](https://www.npmjs.com/package/cbrowser)
- [GitHub Repository](https://github.com/alexandriashai/cbrowser)
- [Issue Tracker](https://github.com/alexandriashai/cbrowser/issues)
- [Roadmap](ROADMAP.md)
