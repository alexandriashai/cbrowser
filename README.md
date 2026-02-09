# CBrowser — Cognitive Browser Automation

> **The browser automation that thinks.** After 640+ tool invocations across rigorous stress testing on 11 real-world sites, CBrowser earned a **Grade A+** assessment—19 issues tracked, 19 fixed, zero open bugs. [View Full Assessment →](https://claude.ai/public/artifacts/0cee560d-60b8-44d6-8eec-e674fbfac9c4)

[![npm version](https://img.shields.io/npm/v/cbrowser.svg)](https://www.npmjs.com/package/cbrowser)
[![Grade A+](https://img.shields.io/badge/Grade-A+-brightgreen.svg)](https://claude.ai/public/artifacts/0cee560d-60b8-44d6-8eec-e674fbfac9c4)
[![Tests](https://github.com/alexandriashai/cbrowser/actions/workflows/test.yml/badge.svg)](https://github.com/alexandriashai/cbrowser/actions/workflows/test.yml)
[![License: BSL-1.1](https://img.shields.io/badge/License-BSL--1.1-blue.svg)](LICENSE)
[![MCP Ready](https://img.shields.io/badge/MCP-45%20Tools-blue)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-green.svg)](https://nodejs.org/)

**Built for AI agents. Trusted by humans.** The only browser automation that asks: *"Will a confused first-timer complete this task—and exactly when will they give up?"*

---

## What Makes CBrowser Different

**31 of 33 tools graded A or above (5 at A+).** After 640+ tool invocations across 11 real-world sites including Spotify, Airbnb, and MDN:

| Capability | Status | Why It Matters |
|------------|--------|----------------|
| **Natural Language Tests** | ⭐ Best-in-class | Write tests in plain English. 10-step E2E flows run 100% stable. |
| **Cognitive User Simulation** | 🔬 Novel | 12 research-backed traits model real human behavior—not just clicks. |
| **Empathy Accessibility Audits** | 🔬 Novel | Simulate users with tremors, low vision, ADHD. No competitor offers this. |
| **Self-Healing Selectors** | ✅ Production-ready | ARIA-first with 0.8+ confidence gating. Handles DOM changes automatically. |
| **Constitutional AI Safety** | 🔬 Novel | Risk-classified actions prevent autonomous agents from doing damage. |
| **45 MCP Tools** | ✅ Production-ready | Full Claude integration—local and remote servers. |

---

## The Problem We Solve

Traditional browser automation answers one question: *"Does this button click?"*

CBrowser answers the question that actually matters: *"Will a confused first-timer on a slow connection find this button—and will they give up before they do?"*

Built on Playwright with cognitive user simulation, constitutional AI safety, and research-backed behavioral models, CBrowser is the only testing framework designed for the AI agent era.

---

## Core Differentiators

| Challenge | Traditional Tools | CBrowser |
|-----------|-------------------|----------|
| **User behavior** | Simulates clicks and keystrokes | **Simulates human cognition**—patience decay, frustration accumulation, decision fatigue |
| **Abandonment prediction** | Fails when elements don't exist | **Predicts when users give up** before they do |
| **AI agent safety** | No guardrails for autonomous agents | **Constitutional AI safety**—risk-classified actions with verification gates |
| **Selector resilience** | Breaks when DOM changes | **Self-healing ARIA-first selectors** with 0.8+ confidence gating |
| **Accessibility testing** | WCAG compliance checklists | **Disability empathy simulation**—experience your site as a user with tremors, low vision, or ADHD |

---

## Quick Start

### Installation

```bash
npm install cbrowser
npx playwright install chromium
```

### First Commands

```bash
# Navigate with intelligent wait detection
npx cbrowser navigate "https://your-site.com"

# Self-healing click with 80%+ confidence threshold
npx cbrowser smart-click "Add to Cart"

# Natural language assertions
npx cbrowser assert "page contains 'Order Confirmed'"

# Run a cognitive journey—simulate a real user
npx cbrowser cognitive-journey \
  --persona first-timer \
  --start "https://your-site.com" \
  --goal "complete checkout"
```

---

## Constitutional AI Safety

AI agents need boundaries. CBrowser classifies every action by risk level:

| Zone | Examples | Behavior |
|------|----------|----------|
| 🟢 **Green** | Navigate, read, screenshot | Auto-execute |
| 🟡 **Yellow** | Click buttons, fill forms | Log and proceed |
| 🔴 **Red** | Submit, delete, purchase | Requires verification |
| ⬛ **Black** | Bypass auth, inject scripts | Never executes |

An AI agent can freely browse and gather data, but cannot accidentally submit a form, delete records, or make purchases without explicit verification.

---

## Cognitive User Simulation

CBrowser models 12 research-backed cognitive traits to simulate how real users think and behave:

| Trait | Research Basis | What It Models |
|-------|---------------|----------------|
| **Patience** | — | How quickly users abandon on friction |
| **Frustration** | — | Accumulates with errors, decays with success |
| **Decision Fatigue** | Baumeister's ego depletion | Users start choosing defaults after too many decisions |
| **Dual-Process Thinking** | Kahneman (Nobel Prize) | System 1 (fast/automatic) vs System 2 (slow/deliberate) |
| **Self-Efficacy** | Bandura (1977) | Belief in ability to solve problems; low = faster abandonment |
| **Satisficing** | Simon (1956) | Accept "good enough" vs. optimize; satisficers decide 50% faster |
| **Trust Calibration** | Fogg (2003) | Baseline trust affects click-through by 40% |
| **Interrupt Recovery** | Mark et al. (2005) | Average recovery time 23min; models context preservation |

### Abandonment Detection

The simulation stops when a realistic user would give up:

```bash
# Output from cognitive journey
⚠️ ABANDONED after 8 steps
Reason: Patience depleted (0.08) - "This is taking too long..."
Friction points:
  1. Password requirements unclear (step 4)
  2. Form validation error not visible (step 6)
```

---

## Natural Language Testing

Write tests in plain English:

```txt
# Test: Checkout Flow
go to https://your-site.com/products
click "Add to Cart" button
verify page contains "1 item in cart"
click checkout
fill email with "test@example.com"
click "Place Order"
verify url contains "/confirmation"
```

```bash
npx cbrowser test-suite checkout-test.txt --html
```

### Self-Healing Test Repair

When tests break due to site changes:

```bash
npx cbrowser repair-tests broken-test.txt --auto-apply --verify
```

CBrowser analyzes failures, generates alternative selectors, and repairs tests automatically.

---

## Visual Testing Suite

### AI Visual Regression

Semantic comparison—understands what changed, not just pixel differences:

```bash
npx cbrowser ai-visual capture "https://your-site.com" --name homepage
npx cbrowser ai-visual test "https://staging.your-site.com" homepage --html
```

### Cross-Browser & Responsive

```bash
# Compare Chrome, Firefox, Safari rendering
npx cbrowser cross-browser "https://your-site.com" --html

# Test across mobile, tablet, desktop
npx cbrowser responsive "https://your-site.com" --html

# A/B comparison (staging vs production)
npx cbrowser ab "https://staging.your-site.com" "https://your-site.com" --html
```

---

## UX Analysis Suite

### Agent-Ready Audit

Analyze any website for AI-agent friendliness:

```bash
npx cbrowser agent-ready-audit "https://your-site.com" --html
```

Returns:
- **Findability score** — Can agents locate elements? (ARIA labels, semantic HTML)
- **Stability score** — Will selectors break? (hidden inputs, overlays)
- **Letter grade (A-F)** with prioritized remediation and code examples

### Competitive UX Benchmark

Run identical cognitive journeys across your site and competitors:

```bash
npx cbrowser competitive-benchmark \
  --sites "https://your-site.com,https://competitor-a.com,https://competitor-b.com" \
  --goal "sign up for free trial" \
  --persona first-timer \
  --html
```

### Accessibility Empathy Mode

Simulate how users with disabilities experience your site:

```bash
npx cbrowser empathy-audit "https://your-site.com" \
  --goal "complete signup" \
  --disabilities "motor-tremor,low-vision,adhd" \
  --html
```

**Available personas:** `motor-tremor`, `low-vision`, `cognitive-adhd`, `dyslexic`, `deaf`, `elderly`

---

## MCP Server Integration

CBrowser runs as an MCP server for Claude Desktop and claude.ai.

### Remote MCP (claude.ai)

**Public Demo Server** (rate-limited, no auth):
```
https://cbrowser-mcp-demo.wyldfyre.ai/mcp
```

Deploy your own: see [Remote MCP Server Guide](docs/REMOTE-MCP-SERVER.md)

### Local MCP (Claude Desktop)

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

### 45 MCP Tools

| Category | Tools |
|----------|-------|
| **Navigation** | `navigate`, `screenshot`, `extract`, `cloudflare_detect`, `cloudflare_wait` |
| **Interaction** | `click`, `smart_click`, `fill`, `scroll` |
| **Testing** | `test_suite`, `repair_tests`, `flaky_check` |
| **Visual** | `visual_baseline`, `visual_compare`, `responsive_test`, `cross_browser_test`, `ab_compare` |
| **Cognitive** | `cognitive_journey_init`, `cognitive_journey_update_state`, `compare_personas` |
| **Analysis** | `hunt_bugs`, `chaos_test`, `agent_ready_audit`, `competitive_benchmark`, `empathy_audit` |
| **Stealth** | `stealth_enable`, `stealth_disable`, `stealth_status`, `stealth_check`, `stealth_diagnose` |

---

## CI/CD Integration

### GitHub Actions

```yaml
name: CBrowser Tests
on: [pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: alexandriashai/cbrowser@v12
        with:
          test-file: tests/e2e/checkout.txt
          sensitivity: strict
```

### Docker

```bash
docker run --rm -v $(pwd)/tests:/work/tests ghcr.io/alexandriashai/cbrowser:latest \
  test-suite tests/checkout.txt --html
```

---

## Modular Architecture

Tree-shakeable imports for minimal bundle size:

```typescript
// Import specific modules
import { runVisualRegression, runCrossBrowserTest } from 'cbrowser/visual';
import { runNLTestSuite, detectFlakyTests, repairTest } from 'cbrowser/testing';
import { huntBugs, runChaosTest, findElementByIntent } from 'cbrowser/analysis';
import { capturePerformanceBaseline, detectPerformanceRegression } from 'cbrowser/performance';
```

---

## API Reference

```typescript
import { CBrowser } from 'cbrowser';

const browser = new CBrowser({
  headless: true,
  persistent: true,  // Maintain cookies between sessions
});

await browser.navigate('https://example.com');

const result = await browser.smartClick('Sign In', {
  maxRetries: 3,
  minConfidence: 0.8  // v12.0.0: Raised threshold for reliable healing
});

const assertion = await browser.assert("page contains 'Welcome'");
if (!assertion.passed) {
  console.error(assertion.message);
}

await browser.close();
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CBROWSER_DATA_DIR` | `~/.cbrowser` | Data storage directory |
| `CBROWSER_HEADLESS` | `true` | Run headless |
| `CBROWSER_BROWSER` | `chromium` | Browser engine |
| `CBROWSER_TIMEOUT` | `30000` | Default timeout (ms) |
| `CBROWSER_PROXY` | — | Proxy URL (e.g., `http://user:pass@proxy:8080`) |
| `CBROWSER_PROXY_SERVER` | — | Proxy server (alternative to full URL) |
| `CBROWSER_PROXY_USERNAME` | — | Proxy username (with `CBROWSER_PROXY_SERVER`) |
| `CBROWSER_PROXY_PASSWORD` | — | Proxy password (with `CBROWSER_PROXY_SERVER`) |

### API Key (for Cognitive Journeys)

```bash
npx cbrowser config set-api-key
```

---

## Examples

| Example | Description |
|---------|-------------|
| [`examples/basic-usage.ts`](examples/basic-usage.ts) | Navigation, extraction, sessions |
| [`examples/cognitive-journey.ts`](examples/cognitive-journey.ts) | Cognitive simulation with personas |
| [`examples/visual-testing.ts`](examples/visual-testing.ts) | Visual regression, cross-browser, A/B |
| [`examples/workflows/`](examples/workflows/) | E2E recipes for common scenarios |
| [`examples/ci-cd/`](examples/ci-cd/) | GitHub Actions, GitLab CI setup |

---

## License

**Business Source License 1.1 (BSL-1.1)**

- ✅ Free for non-production use: development, testing, personal projects, evaluation
- ✅ Read, modify, and contribute to the source
- ⚠️ Production use (including production testing pipelines) requires a commercial license

**Note:** Non-production use means evaluation of CBrowser itself, not using CBrowser as part of a production testing service.

Converts to **Apache 2.0** on February 5, 2030.

For commercial licensing: [alexandria.shai.eden@gmail.com](mailto:alexandria.shai.eden@gmail.com)

---

## Copyright

© 2026 WF Media (Alexandria Eden). All rights reserved.

---

## Links

- [NPM Package](https://www.npmjs.com/package/cbrowser)
- [GitHub Repository](https://github.com/alexandriashai/cbrowser)
- [Issue Tracker](https://github.com/alexandriashai/cbrowser/issues)
- [A+ Assessment Report](https://claude.ai/public/artifacts/0cee560d-60b8-44d6-8eec-e674fbfac9c4)
- [Remote MCP Server Guide](docs/REMOTE-MCP-SERVER.md)
- [Roadmap](ROADMAP.md)
