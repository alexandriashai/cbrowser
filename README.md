# CBrowser — Cognitive Browser Automation

> **The browser automation that thinks like your users.** 122 MCP tools. 25 cognitive traits. 11 disability personas. The only framework that predicts when users give up.

[![npm version](https://img.shields.io/npm/v/cbrowser.svg)](https://www.npmjs.com/package/cbrowser)
[![Documentation](https://img.shields.io/badge/Docs-cbrowser.ai-blue.svg)](https://cbrowser.ai/docs)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![MCP Ready](https://img.shields.io/badge/MCP-122%20Tools-blue)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-green.svg)](https://nodejs.org/)

```bash
npm install cbrowser
npx cbrowser cognitive-effort --url "https://your-site.com" --persona first-timer
```

---

## 5-Minute Quickstart

Get from zero to your first cognitive insight in 3 commands:

```bash
# 1. Install CBrowser
npm install cbrowser

# 2. Install the browser engine (~150MB)
npx playwright install chromium

# 3. Run your first cognitive audit
npx cbrowser cognitive-effort --url "https://your-site.com" --persona first-timer
```

**What you get:** A cognitive transport score (0-1), abandonment risk percentage, and the UX bottleneck — in under 30 seconds.

**No API key needed** for basic commands (navigate, screenshot, click, extract, explore). Cognitive journeys require an Anthropic API key:

```bash
npx cbrowser config set-api-key <your-anthropic-key>
```

**Check your environment:** Run `npx cbrowser doctor` to verify everything is set up correctly.

**Accessibility:** CBrowser supports `--no-color` (or `NO_COLOR` env var), `--plain` (no emoji/decorations), and `--json-output` (structured JSON) for screen readers, CI pipelines, and scripting.

---

## Table of Contents

- [5-Minute Quickstart](#5-minute-quickstart)
- [Cognitive Transport Chain](#cognitive-transport-chain)
- [Visual Overlays & Attention Analysis](#visual-overlays--attention-analysis)
- [AI Friendliness Suite](#ai-friendliness-suite)
- [Cognitive User Simulation](#cognitive-user-simulation)
- [Accessibility Empathy Testing](#accessibility-empathy-testing)
- [Constitutional AI Safety](#constitutional-ai-safety)
- [Site Knowledge System](#site-knowledge-system)
- [Natural Language Testing](#natural-language-testing)
- [Visual Testing](#visual-testing)
- [Competitive UX Benchmark](#competitive-ux-benchmark)
- [Geo Proxy](#geo-proxy)
- [MCP Server Integration](#mcp-server-integration)
- [CI/CD Integration](#cicd-integration)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Enterprise Edition](#enterprise-edition)
- [Contributing](#contributing)
- [License](#license)

---

## Cognitive Transport Chain

The eight-layer Sequential Transport Chain computes exactly how hard your page is for any persona - and predicts whether they'll abandon. Each layer answers one question about the visitor:

| Layer | The Question It Answers | Research Basis |
|-------|------------------------|----------------|
| **Saliency** | Can they find the thing they came for? | CIE-Lab W₂ perceptual model |
| **Cognitive Load** | Is there more on this page than they can hold at once? | Sweller (1988) CLT |
| **Decision** | Are there too many choices to pick between? | Hick-Hyman Law |
| **Motor** | Can they physically hit the target? | Grossman & Balakrishnan (2005) |
| **Motor Procedure** | Can they get through the whole sequence, not just one click? | Procedural fluency (split from Motor) |
| **Frustration** | How close are they to giving up? | Ceaparu et al. (2004) |
| **Readability** | Can they decode the words on the page? | Perry & Zorzi (2013) reading model |
| **Reading Attention** | Can they hold the line long enough to finish? | Sustained attention (split from Readability) |

The chain is *sequential* because attention is a budget, not a checklist. Each layer's cost is paid from whatever the layers before it left behind: a visitor who burned working memory just finding the button has less left for the form, and a persona who arrives at your pricing table already frustrated reads it differently than one who got there clean. That's why a page that exhausts people early scores differently from one that is uniformly hard, and why the bottleneck layer matters more than the average.

Two layers were split out of their neighbors because they fail for different reasons. **Motor Procedure** is separate from **Motor** because hitting a target and completing a sequence are different failures - you can land every click and still lose your place halfway through a form. **Reading Attention** is separate from **Readability** because decoding text and holding your place in it are different abilities - an ADHD reader typically decodes fine and loses the thread, and a single "reading" score can't say that.

```bash
npx cbrowser cognitive-effort --url "https://your-site.com" --persona first-timer
# → CTC: 0.76, abandonment risk: 42%, bottleneck: decision
```

Returns: total CTC score, per-layer breakdown, bottleneck identification, abandonment risk percentage, and motor accessibility overlay.

---

## Visual Overlays & Attention Analysis

See where users look, what they miss, and whether your CTAs capture attention — per persona:

```bash
# Full visual cognitive story — 4 annotated images + narrative
npx cbrowser visual-cognitive-story --url "https://your-site.com" --persona cognitive-adhd

# Attention heatmap — where does this persona look?
npx cbrowser attention-analysis --url "https://your-site.com" --persona first-timer

# Compare how two personas experience the same page
npx cbrowser attention-compare --url "https://your-site.com" --persona-a first-timer --persona-b power-user
```

**Overlays generated:**
- **Attention heatmap** — CIE-Lab saliency on grayscale base (red = high attention)
- **Motor accessibility** — Green/yellow/red per element by P(hit)
- **Attention quality** — CTAs green, distractors red, headings blue
- **Comparison diff** — Blue = persona A attention, red = persona B

**Metrics:** CTA capture rate, value prop salience, distractor ratio, quality score (0-100), entropy.

---

## AI Friendliness Suite

Five tools to make your site ready for the AI agent era:

| Tool | What It Does |
|------|-------------|
| `agent_ready_audit` | Score site on findability, stability, agent-perceivability, semantics (A-F grade) |
| `ai_benchmark` | Compare AI-friendliness across competitor URLs |
| `webmcp_ready_audit` | Audit MCP server for WebMCP compatibility |
| `remediation_patches` | Generate actionable code fixes for audit findings |
| `llms_txt_generate` | Generate AI-readable llms.txt site description |

```bash
npx cbrowser agent-ready-audit "https://your-site.com" --html
npx cbrowser ai-benchmark "https://site-a.com,https://site-b.com"
```

---

## Cognitive User Simulation

**26 research-backed cognitive traits + 10 motivational values** model how real users think, struggle, and give up:

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

*See [Trait Index](https://cbrowser.ai/docs/Trait-Index) for all 25 traits including: Persistence, Resilience, Curiosity, Change Blindness, Anchoring Bias, Time Horizon, Attribution Style, Metacognitive Planning, Procedural Fluency, Transfer Learning, Authority Sensitivity, Emotional Contagion, Mental Model Rigidity, Interrupt Recovery, Reading Tendency, and Site Familiarity.*

**Full documentation:** [Research Methodology](https://cbrowser.ai/docs/Research-Methodology) · [Trait Index](https://cbrowser.ai/docs/Trait-Index) · [Bibliography](https://cbrowser.ai/docs/Bibliography)

### 17 Built-in Personas

**6 general:** first-timer, power-user, mobile-user, screen-reader-user, elderly-user, impatient-user

**11 accessibility:** motor-impairment-tremor, low-vision-magnified, cognitive-adhd, dyslexic-user, deaf-user, elderly-low-vision, color-blind-deuteranopia, autism-spectrum, intellectual-disability, aphasia-receptive, dyscalculia

### Values System

Beyond cognitive traits, CBrowser models **10 motivational values** from three psychological frameworks:

| Framework | Research Basis |
|-----------|---------------|
| **Schwartz's Universal Values** | Schwartz (1992) — 10 core values: Power, Achievement, Hedonism, Stimulation, Self-Direction, Universalism, Benevolence, Tradition, Conformity, Security |
| **Self-Determination Theory** | Deci & Ryan (1985) — Autonomy, Competence, Relatedness |
| **Maslow's Hierarchy** | Maslow (1943) — 5 need levels |

See [Values Framework](https://cbrowser.ai/docs/Values-Framework) for full documentation.

### Custom Persona Builder

```bash
# Interactive questionnaire (8 core traits)
npx cbrowser persona-questionnaire start

# Comprehensive questionnaire (all 25 traits)
npx cbrowser persona-questionnaire start --comprehensive --name "my-tester"

# From a description — AI generates trait values
npx cbrowser persona-create "A 68-year-old retiree who just got their first smartphone"
```

### Abandonment Detection

The simulation stops when a realistic user would give up:

```bash
⚠️ ABANDONED after 8 steps
Reason: Patience depleted (0.08) - "This is taking too long..."
Friction points:
  1. Password requirements unclear (step 4)
  2. Form validation error not visible (step 6)
```

---

## Accessibility Empathy Testing

Simulate how users with disabilities experience your site:

```bash
npx cbrowser empathy-audit "https://your-site.com" \
  --goal "complete signup" \
  --disabilities "motor-impairment-tremor" \
  --html
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

**How red is decided:** by the element an action would activate, not by how it is addressed. The same "Delete account" button is refused by its label, its id, its test id or a structural path; a click on a container is judged at the point it lands; and a refused click is never retried with a "healed" selector. Gated: `click`, `smart_click`, hover-click and the daemon's click, `press_key` / `type_text` / `keyboard` (Enter, a typed newline, or Space on a focused control, and Enter in a field whose form submits one), a `drag` that would click a control, and the NL test runner's `click at X, Y`. `force: true` (MCP) or `--force` (CLI) proceeds and reports the zone. Not gated: cognitive journeys and other engines that choose their own clicks, `evaluate_script`, and a confirmation button with neutral text ("Confirm", "OK") inside a dialog. Classification uses English keyword patterns.

---

## Site Knowledge System

CBrowser learns your site over time:

- **Page Understanding** — DOM analysis, page type classification, available affordances
- **Site Model Learning** — Persistent knowledge graph across sessions
- **Cross-Session Profiles** — AES-256-GCM encrypted cookie/state profiles
- **Goal Decomposition** — Sub-goal trees with fallback strategies

---

## Natural Language Testing

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

# Auto-repair broken tests
npx cbrowser repair-tests broken-test.txt --auto-apply --verify
```

---

## Visual Testing

```bash
# AI visual regression
npx cbrowser ai-visual capture "https://your-site.com" --name homepage
npx cbrowser ai-visual test "https://staging.your-site.com" homepage --html

# Cross-browser (Chrome, Firefox, Safari)
npx cbrowser cross-browser "https://your-site.com" --html

# Responsive (mobile, tablet, desktop)
npx cbrowser responsive "https://your-site.com" --html

# A/B comparison (staging vs production)
npx cbrowser ab "https://staging.your-site.com" "https://your-site.com" --html
```

---

## Competitive UX Benchmark

Run identical cognitive journeys across your site and competitors:

```bash
npx cbrowser competitive-benchmark \
  --sites "https://your-site.com,https://competitor-a.com,https://competitor-b.com" \
  --goal "sign up for free trial" \
  --persona first-timer \
  --html
```

---

## Upgrading to 19.0.0

One breaking change: the agent-ready **accessibility** axis is now
**agentPerceivability**, and three deprecated aliases are removed.

| removed | use instead |
|---|---|
| `score.accessibility` | `score.agentPerceivability` |
| `summary.dynamicContentCount` | `summary.deferredLoadingPatterns` |
| `comparison.bestAccessibility` | `comparison.bestAgentPerceivability` |
| issue `category: "accessibility"` | `category: "agentPerceivability"` |

All three replacements have carried identical values since 18.82.0, so if you
upgraded within that range you can switch keys before upgrading and take this
release with no further change.

The rename is not cosmetic. That axis measures whether a *machine* can perceive
your elements — ARIA present, elements carry text. It is **not** a WCAG
conformance score, and it returned 100 on a page where `empathy_audit` found two
WCAG violations. Both numbers were right; calling one of them "accessibility" was
not. Run `empathy_audit` for conformance, and expect the two to differ.

On input, `category: "accessibility"` is still accepted and scores identically, so
tools that *send* issues need not change immediately. Tools that *read* scores do.

---

## Geo Proxy

Test from 10 global regions via residential proxies:

```bash
npx cbrowser cognitive-journey \
  --start "https://your-site.com" \
  --persona first-timer \
  --goal "sign up" \
  --geo-region uk
```

**Regions:** `us-west`, `us-east`, `us-central`, `uk`, `germany`, `france`, `japan`, `australia`, `canada`, `brazil`

Geo routing needs your own residential-proxy credentials — the package ships the
mechanism and no keys. Set `IPROYAL_USERNAME` / `IPROYAL_PASSWORD`, or place a
`geo-proxy.json` at `~/.cbrowser/`. Without either, `--geo-region` fails loudly
rather than silently running from your own IP.

A `geo-proxy.json` may define additional regions; they merge over the ten above.

> **Corrected 2026-08-11.** This section previously advertised 12 regions
> including `india` and `singapore`. Those are not in the shipped defaults and
> resolve to nothing on a clean install — they existed only in a local config
> file on one machine. Advertising them was a claim the package could not keep.

---

## MCP Server Integration

CBrowser runs as an MCP server for Claude.ai, Claude Desktop, and Claude Code.

### Claude.ai (Easiest — No Install)

Add the MCP connector and optionally install the Claude.ai Skill:

1. Go to [Customize → Connectors](https://claude.ai/customize/connectors) → "Add custom connector"
2. Paste: `https://demo.cbrowser.ai/mcp`
3. Download the [Claude.ai Skill (.zip)](https://cbrowser.ai/downloads/cbrowser-claudeai.skill) — gives Claude context about tools, pricing, and workflows
4. Go to Customize → Skills → Upload the zip

> **Note:** The Claude.ai Skill is a lightweight knowledge file for the web interface. It is NOT the same as the Claude Code Skill (see below).

### Claude Code Skill (CLI — Not for Claude.ai)

For [Claude Code](https://claude.ai/claude-code) terminal users:

```bash
curl -fsSL https://raw.githubusercontent.com/alexandriashai/cbrowser/main/scripts/install-skill.sh | bash
npm install -g cbrowser && npx playwright install
```

The Claude Code Skill is a full CLI integration with workflow routing, TypeScript tools, persistent memory, and constitutional safety. See [Skill Installation Guide](https://cbrowser.ai/docs/claude-skill-installation) for details.

### Claude Desktop

```json
{
  "mcpServers": {
    "cbrowser": {
      "url": "https://demo.cbrowser.ai/mcp"
    }
  }
}
```

### Local MCP Server

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

### 122 MCP Tools

| Category | Tools | Count |
|----------|-------|-------|
| **Navigation** | `navigate`, `screenshot`, `scroll`, `extract`, `analyze_page`, `find_element_by_intent` | 6 |
| **Interaction** | `click`, `smart_click`, `fill`, `dismiss_overlay` | 4 |
| **Cognitive Core** | `cognitive_journey_init`, `cognitive_journey_update_state`, `cognitive_journey_autonomous`, `cognitive_effort`, `cognitive_load_estimate`, `site_cognitive_assessment` | 6 |
| **Cognitive Transport** | `cognitive_distance`, `cognitive_interpolate`, `cognitive_coverage`, `transport_map` | 4 |
| **Attention & Visual Story** | `attention_analysis`, `attention_compare`, `visual_cognitive_story` | 3 |
| **Persona** | `list_cognitive_personas`, `compare_personas`, `persona_create_*`, `persona_questionnaire_*`, `persona_trait_lookup`, `persona_values_*` | 15 |
| **Testing** | `nl_test_inline`, `nl_test_file`, `generate_tests`, `repair_test`, `detect_flaky_tests`, `coverage_map` | 6 |
| **Visual Testing** | `visual_baseline`, `visual_regression`, `responsive_test`, `cross_browser_test`, `cross_browser_diff`, `ab_comparison` | 6 |
| **Site Intelligence** | `page_understand`, `site_model_query`, `site_model_status`, `site_profile_*` | 6 |
| **AI Friendliness** | `agent_ready_audit`, `ai_benchmark`, `webmcp_ready_audit`, `remediation_patches`, `llms_txt_generate`, `llms_txt_validate`, `llms_txt_diff`, `structured_data_suggest` | 8 |
| **Analysis** | `hunt_bugs`, `chaos_test`, `competitive_benchmark`, `empathy_audit` | 4 |
| **Performance** | `perf_baseline`, `perf_regression` | 2 |
| **Marketing** *(Enterprise)* | `marketing_campaign_*`, `marketing_audience_discover`, `marketing_compete`, `marketing_funnel_analyze`, `marketing_influence_matrix`, `marketing_lever_analysis`, `marketing_personas_list`, `list_influence_patterns` | 11 |
| **Security** | `security_audit`, `web_security_scan` | 2 |
| **Stealth** *(Enterprise)* | `stealth_enable`, `stealth_disable`, `stealth_status`, `stealth_check`, `stealth_diagnose`, `cloudflare_detect`, `cloudflare_wait` | 7 |
| **Session & Browser** | `save_session`, `load_session`, `delete_session`, `list_sessions`, `list_baselines`, `browser_health`, `browser_recover`, `reset_browser`, `heal_stats`, `status` | 10 |
| **Utility** | `assert`, `ask_user`, `set_api_key`, `api_key_status`, `clear_api_key`, `get_api_key_prompt` | 6 |

### Token Cost & Selective Loading

122 MCP tools consume ~45,000 tokens in LLM context. For cost-sensitive use, load selectively:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerNavigationTools,
  registerInteractionTools,
  registerExtractionTools,
} from "cbrowser/mcp-tools";

const server = new McpServer({ name: "my-app", version: "1.0.0" });
const context = { getBrowser: () => browser };

// ~5,000 tokens instead of ~45,000
registerNavigationTools(server, context);
registerInteractionTools(server, context);
registerExtractionTools(server, context);
```

**Categories:** `navigation`, `interaction`, `extraction`, `assertion`, `analysis`, `session`, `healing`, `visualTesting`, `testing`, `bugAnalysis`, `personaComparison`, `cognitive`, `cognitiveTransport`, `attention`, `siteKnowledge`, `values`, `performance`, `audit`, `browserManagement`, `security`, `marketing`, `remediation`, `llmsTxt`.

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
      - uses: alexandriashai/cbrowser@v18
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

## API Reference

```typescript
import { CBrowser } from 'cbrowser';

const browser = new CBrowser({
  headless: true,
  persistent: true,
});

await browser.navigate('https://example.com');

const result = await browser.smartClick('Sign In', {
  maxRetries: 3,
  minConfidence: 0.8,
});

const assertion = await browser.assert("page contains 'Welcome'");
if (!assertion.passed) {
  console.error(assertion.message);
}

await browser.close();
```

### Modular Imports

```typescript
import { runVisualRegression, runCrossBrowserTest } from 'cbrowser/visual';
import { runNLTestSuite, detectFlakyTests, repairTest } from 'cbrowser/testing';
import { huntBugs, runChaosTest, findElementByIntent } from 'cbrowser/analysis';
import { capturePerformanceBaseline, detectPerformanceRegression } from 'cbrowser/performance';
```

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CBROWSER_DATA_DIR` | `~/.cbrowser` | Data storage directory |
| `CBROWSER_HEADLESS` | `true` | Run headless |
| `CBROWSER_BROWSER` | `chromium` | Browser engine |
| `CBROWSER_TIMEOUT` | `30000` | Default timeout (ms) |
| `CBROWSER_PROXY` | — | Proxy URL |

```bash
npx cbrowser config set-api-key  # Required for cognitive journeys
```

---

## Enterprise Edition

[CBrowser Enterprise](https://cbrowser.ai/enterprise) adds:

| Feature | Description |
|---------|-------------|
| **Marketing Suite** | Test which design/copy/UX patterns influence which buyer segments |
| **8 Marketing Personas** | B2B (enterprise-buyer, startup-founder, procurement-manager, technical-evaluator) + Consumer (impulse-shopper, price-researcher, loyal-customer, skeptical-first-timer) |
| **Influence Matrix** | Conversion effectiveness for variant × persona combinations |
| **Lever Analysis** | Which psychological persuasion patterns work for each persona |
| **Constitutional Stealth** | Full stealth measures for authorized penetration testing |
| **Web Security Scan** | OWASP-based security scanning |

All 125 MCP tools included with no rate limits.

---

## License

**MIT License** — Free and open source. See [LICENSE](LICENSE).

---

© 2026 Alexandria Eden · [cbrowser.ai](https://cbrowser.ai) · [alexandria.shai.eden@gmail.com](mailto:alexandria.shai.eden@gmail.com)

---

## Links

- **[Documentation](https://cbrowser.ai/docs)** — Full docs, guides, API reference
- [NPM Package](https://www.npmjs.com/package/cbrowser)
- [GitHub](https://github.com/alexandriashai/cbrowser)
- [Issue Tracker](https://github.com/alexandriashai/cbrowser/issues)
- [Roadmap](https://cbrowser.ai/docs/Roadmap)

### Research

- [Research Methodology](https://cbrowser.ai/docs/Research-Methodology) — How the 25 traits were selected and validated
- [Trait Index](https://cbrowser.ai/docs/Trait-Index) — All cognitive traits with citations
- [Bibliography](https://cbrowser.ai/docs/Bibliography) — Academic references
- [Persona Index](https://cbrowser.ai/docs/Persona-Index) — All 17 cognitive + 8 marketing personas
