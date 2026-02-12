# CBrowser — Cognitive Browser Automation

> **The browser automation that thinks.** v16.15.0 achieved **Grade A+** in comprehensive stress testing—100% pass rate across 48+ tools and 60+ invocations, zero critical bugs, zero server crashes. [View Full Assessment →](docs/STRESS-TEST-v16.14.4.md)

[![npm version](https://img.shields.io/npm/v/cbrowser.svg)](https://www.npmjs.com/package/cbrowser)
[![Documentation](https://img.shields.io/badge/Docs-cbrowser.ai-blue.svg)](https://cbrowser.ai/docs)
[![Grade A+](https://img.shields.io/badge/Stress%20Test-A+-brightgreen.svg)](docs/STRESS-TEST-v16.14.4.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![MCP Ready](https://img.shields.io/badge/MCP-68%20Tools-blue)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-green.svg)](https://nodejs.org/)

**Built for AI agents. Trusted by humans.** The only browser automation that asks: *"Will a confused first-timer complete this task—and exactly when will they give up?"*

Sites that pass CBrowser's cognitive tests are easier for both humans **and** AI agents to navigate. The same principles that reduce user friction—clear structure, predictable patterns, accessible design—make sites more reliable for autonomous AI.

---

## What Makes CBrowser Different

**68 tools, 15 cognitive personas, 25 research-backed traits.** After rigorous stress testing across production sites including Airbnb and Hacker News:

| Capability | Status | Why It Matters |
|------------|--------|----------------|
| **Natural Language Tests** | ⭐ Best-in-class | Write tests in plain English. 10-step E2E flows run 100% stable. |
| **Cognitive User Simulation** | 🔬 Novel | 25 research-backed traits model real human behavior—not just clicks. |
| **Empathy Accessibility Audits** | 🔬 Novel | Simulate users with tremors, low vision, ADHD. No competitor offers this. |
| **Self-Healing Selectors** | ✅ Production-ready | ARIA-first with 0.8+ confidence gating. Handles DOM changes automatically. |
| **Constitutional AI Safety** | 🔬 Novel | Risk-classified actions prevent autonomous agents from doing damage. |
| **68 MCP Tools** | ✅ Production-ready | Full Claude integration—local and remote servers. |

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

CBrowser models **25 research-backed cognitive traits** across 6 tiers to simulate how real users think and behave:

| Trait | Research Basis | What It Models |
|-------|---------------|----------------|
| **Patience** | Nah (2004); Nielsen (1993) | Tolerance for delays; abandonment at 8+ seconds |
| **Working Memory** | Miller (1956) | 7±2 item capacity; affects form complexity tolerance |
| **Comprehension** | Card, Moran & Newell (1983) | UI convention understanding; GOMS model timing |
| **Risk Tolerance** | Kahneman & Tversky (1979) | Prospect theory; loss aversion affects CTA clicks |
| **Self-Efficacy** | Bandura (1977) | Belief in ability to solve problems; low = faster abandonment |
| **Satisficing** | Simon (1956) | Accept "good enough" vs. optimize; 50% faster decisions |
| **Trust Calibration** | Fogg (2003) | 8 trust signals; affects click-through by 40% |
| **Information Foraging** | Pirolli & Card (1999) | "Scent" following behavior; predicts navigation patterns |
| **Social Proof** | Cialdini (2001) | Influence of reviews, ratings, popularity indicators |
| **FOMO** | Przybylski et al. (2013) | Fear of missing out; urgency and scarcity responses |

*See [Trait Index](https://github.com/alexandriashai/cbrowser/wiki/Trait-Index) for all 25 traits including: Persistence, Resilience, Curiosity, Change Blindness, Anchoring Bias, Time Horizon, Attribution Style, Metacognitive Planning, Procedural Fluency, Transfer Learning, Authority Sensitivity, Emotional Contagion, Mental Model Rigidity, Interrupt Recovery, and Reading Tendency.*

> **Note:** Trait correlation values are [educated estimates](https://github.com/alexandriashai/cbrowser/wiki/Research-Methodology#validation-status) derived from related research. Empirical calibration planned per [GitHub #95](https://github.com/alexandriashai/cbrowser/issues/95).

**Full documentation:** [Research Methodology](https://github.com/alexandriashai/cbrowser/wiki/Research-Methodology) · [Trait Index](https://github.com/alexandriashai/cbrowser/wiki/Trait-Index) · [Bibliography](https://github.com/alexandriashai/cbrowser/wiki/Bibliography)

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

### Custom Persona Builder (v16.6.0)

Create research-backed custom personas via interactive questionnaire:

```bash
# Interactive questionnaire (8 core traits)
npx cbrowser persona-questionnaire start

# Comprehensive questionnaire (all 25 traits)
npx cbrowser persona-questionnaire start --comprehensive --name "my-tester"

# Look up trait behaviors
npx cbrowser persona-questionnaire lookup --trait patience --value 0.25

# List all available traits
npx cbrowser persona-questionnaire list-traits
```

Each trait maps to research-backed behavioral descriptions with 5 levels (0, 0.25, 0.5, 0.75, 1.0).

### Research-Backed Values System (v16.12.0)

Beyond cognitive traits, CBrowser models **motivational values** that drive user decisions. The values system integrates three foundational psychological frameworks:

| Framework | Research Basis | What It Models |
|-----------|---------------|----------------|
| **Schwartz's Universal Values** | Schwartz (1992) | 10 core human values: Power, Achievement, Hedonism, Stimulation, Self-Direction, Universalism, Benevolence, Tradition, Conformity, Security |
| **Self-Determination Theory** | Deci & Ryan (1985) | Autonomy, Competence, and Relatedness needs that drive intrinsic motivation |
| **Maslow's Hierarchy** | Maslow (1943) | 5 need levels from Physiological to Self-Actualization |

Values influence decision-making differently than cognitive traits. A user high in **Security** values will read privacy policies; one high in **Stimulation** will click "Try Beta Features" immediately.

```bash
# Look up a persona's values profile
npx cbrowser persona-values power-user

# Output shows Schwartz values, SDT needs, and Maslow level
```

### Category-Aware Persona Creation

When you create a custom persona via `persona-questionnaire`, CBrowser automatically assigns appropriate values based on persona category:

| Category | Example Values Profile |
|----------|----------------------|
| **Novice** | High Security, high Conformity, low Self-Direction |
| **Professional** | High Achievement, high Competence, high Self-Direction |
| **Elderly** | High Tradition, high Security, moderate Benevolence |
| **Accessibility** | High Universalism, variable by specific disability |

This ensures cognitive journeys reflect realistic motivational differences—not just skill gaps. See [Persona Values Documentation](docs/PERSONA-VALUES.md) for the complete values framework.

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
https://demo.cbrowser.ai/mcp
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

### 68 MCP Tools

| Category | Tools |
|----------|-------|
| **Navigation** | `navigate`, `screenshot`, `extract`, `cloudflare_detect`, `cloudflare_wait` |
| **Interaction** | `click`, `smart_click`, `fill`, `scroll` |
| **Testing** | `test_suite`, `repair_tests`, `flaky_check` |
| **Visual** | `visual_baseline`, `visual_compare`, `responsive_test`, `cross_browser_test`, `ab_compare` |
| **Cognitive** | `cognitive_journey_init`, `cognitive_journey_update_state`, `compare_personas` |
| **Persona** | `persona_questionnaire_get`, `persona_questionnaire_build`, `persona_trait_lookup` |
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

## Enterprise Edition

[CBrowser Enterprise](https://github.com/alexandriashai/cbrowser-enterprise) extends CBrowser with:

| Feature | Description |
|---------|-------------|
| **Marketing Suite** | Influence effectiveness research — test which design/copy/UX patterns influence which buyer segments |
| **8 Marketing Personas** | B2B (enterprise-buyer, startup-founder, procurement-manager, technical-evaluator) + Consumer (impulse-shopper, price-researcher, loyal-customer, skeptical-first-timer) |
| **Influence Matrix** | Conversion effectiveness for variant × persona combinations |
| **Lever Analysis** | Which psychological persuasion patterns work for each persona |
| **Constitutional Stealth** | Full stealth measures for authorized penetration testing |

**MCP Server:** Enterprise MCP includes all 48 base tools + 8 marketing tools.

```bash
# Start Enterprise MCP server
npx cbrowser-enterprise mcp-server

# List marketing personas
npx cbrowser-enterprise marketing personas list --category b2b
```

See [Marketing Suite Wiki](https://github.com/alexandriashai/cbrowser/wiki/Marketing-Suite) for full documentation.

---

## License

**MIT License (MIT)**

- ✅ Free for non-production use: development, testing, personal projects, evaluation
- ✅ Read, modify, and contribute to the source
- ⚠️ Production use (including production testing pipelines) requires a commercial license

**Note:** Non-production use means evaluation of CBrowser itself, not using CBrowser as part of a production testing service.

Converts to **Apache 2.0** on February 5, 2030.

For commercial licensing: [alexandria.shai.eden@gmail.com](mailto:alexandria.shai.eden@gmail.com)

---

## Copyright

© 2026 Alexa Eden. All rights reserved.

---

## Links

- **[📚 Documentation](https://cbrowser.ai/docs)** — Full documentation, guides, and API reference
- [NPM Package](https://www.npmjs.com/package/cbrowser)
- [GitHub Repository](https://github.com/alexandriashai/cbrowser)
- [Issue Tracker](https://github.com/alexandriashai/cbrowser/issues)
- [A+ Assessment Report](https://claude.ai/public/artifacts/0cee560d-60b8-44d6-8eec-e674fbfac9c4)
- [Roadmap](ROADMAP.md)

### Research Documentation

- [Research Methodology](https://cbrowser.ai/docs/Research-Methodology) — How 25 traits were selected and validated
- [Trait Index](https://cbrowser.ai/docs/Trait-Index) — All cognitive traits with citations
- [Bibliography](https://cbrowser.ai/docs/Bibliography) — Complete academic references
- [Persona Index](https://cbrowser.ai/docs/Persona-Index) — All 13 built-in personas
