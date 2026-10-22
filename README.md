# CBrowser: Cognitive Browser Automation

> **Browser automation that thinks like your users.** 130 MCP tools, 21 built-in personas, a CLI, and a library. It predicts where a real person gives up before they do.

[![npm version](https://img.shields.io/npm/v/cbrowser.svg)](https://www.npmjs.com/package/cbrowser)
[![Documentation](https://img.shields.io/badge/Docs-cbrowser.ai-blue.svg)](https://cbrowser.ai/docs)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![MCP Ready](https://img.shields.io/badge/MCP-130%20Tools-blue)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D20.9-green.svg)](https://nodejs.org/)

```bash
npx cbrowser agent-ready-audit "https://your-site.com" --html
```

---

## Quickstart

```bash
# 1. Install (Node.js 20.9 or newer). Installing also downloads Chromium.
npm install -g cbrowser

# 2. Check the environment
cbrowser doctor

# 3. Free, keyless audits
cbrowser agent-ready-audit "https://your-site.com" --html
cbrowser empathy-audit "https://your-site.com" --personas cognitive-adhd,low-vision-magnified --html

# 4. A simulated visitor (needs an Anthropic API key)
cbrowser config set-api-key <your-anthropic-key>
cbrowser cognitive-journey --persona first-timer --start "https://your-site.com" --goal "sign up"
```

If the browser download was skipped (for example with `--ignore-scripts`), run `npx playwright install chromium`.

**Stuck? Ask the docs.** `cbrowser ask` sends your question to cbrowser.ai and prints an AI answer grounded in the documentation, with its sources. No account or API key is needed; it is rate-limited.

```bash
cbrowser ask "Which persona should I use for a screen reader user?"
```

The `question_answer` MCP tool does the same from Claude, including on the local `npx cbrowser mcp-server`.

### What needs an API key

| Free, no key | Needs an Anthropic API key (each step is a model call) |
|---|---|
| `navigate`, `click`, `fill`, `type`, `scroll`, `screenshot`, `extract`, `evaluate` | `cognitive-journey` |
| `agent-ready-audit`, `ai-benchmark`, `empathy-audit` (without `--goal`) | `explore` (a short cognitive journey) |
| `test-suite`, `repair-tests`, `flaky-check`, `hunt-bugs`, `chaos` | `compare-personas` (one journey per persona) |
| `ai-visual`, `cross-browser`, `responsive`, `ab`, `perf`, `a11y audit` | `competitive-benchmark` (one journey per site) |
| `capture`, `har`, `network`, `console`, `daemon`, `ask` | `empathy-audit --goal` (the journey part) |

Since 20.0 nothing falls back to a keyless guess. The old keyless modes of `explore` and `competitive-benchmark` reported goals as reached when a goal word, "the" included, appeared on the page, so they now refuse without a key. A journey that is replayed from a saved trace is free (see [Replay](#replay-a-journey-for-free)).

**Output for scripts and screen readers:** `--no-color` (or `NO_COLOR`), `--plain` (no emoji or box drawing; pass and fail marks become `[PASS]` and `[FAIL]`), and `--json-output` (one JSON envelope on stdout).

---

## Table of Contents

- [Quickstart](#quickstart)
- [Upgrading to 20.0.0](#upgrading-to-2000)
- [Cognitive Transport Chain](#cognitive-transport-chain)
- [Visual Overlays and Attention Analysis](#visual-overlays-and-attention-analysis)
- [AI Friendliness Suite](#ai-friendliness-suite)
- [Cognitive User Simulation](#cognitive-user-simulation)
- [Accessibility Empathy Testing](#accessibility-empathy-testing)
- [Constitutional AI Safety](#constitutional-ai-safety)
- [Browser Control from the CLI](#browser-control-from-the-cli)
- [Natural Language Testing](#natural-language-testing)
- [Visual Testing](#visual-testing)
- [Screen Capture](#screen-capture)
- [Competitive UX Benchmark](#competitive-ux-benchmark)
- [Geo Proxy](#geo-proxy)
- [MCP Server Integration](#mcp-server-integration)
- [CI/CD Integration](#cicd-integration)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Enterprise Edition](#enterprise-edition)
- [License](#license)

---

## Upgrading to 20.0.0

20.0 is a breaking release. Most of it makes commands that used to succeed silently either do what they claim or fail out loud. The full list is in [CHANGELOG.md](CHANGELOG.md).

**Runtime**
- Node.js 20.9 or newer. Node 18 is end of life and sharp 0.35 dropped it; stay on cbrowser 19.x if you need Node 18.

**Behaviour you may notice**
- The default page size is **1920x1080** (was 1280x800), the size `desktop` means everywhere else. Set `CBROWSER_VIEWPORT_WIDTH`/`CBROWSER_VIEWPORT_HEIGHT` or `viewport` in the config file to keep the old size.
- Pages render in the host's locale and timezone unless you set `--locale`/`--timezone`, `CBROWSER_LOCALE`/`CBROWSER_TIMEZONE` or the config file (it was en-US and America/Denver). Env vars and the config file are no longer overridden by built-in values.
- A one-off `--device` or `--geo` no longer sticks to later commands.
- `explore`, `CBrowser.journey()` and `competitive-benchmark` need an Anthropic API key. Their keyless heuristic modes are gone (see above).
- Commands that fail exit 1. That includes unknown subcommands, failed clicks and navigations through the daemon, `record start/stop/save` (which never recorded across commands and now refuse), `perf audit` and `visual compare` failures, and `daemon status` when nothing is running.
- Commands that check their flags reject flags they never read. `--quiet` is gone, since nothing read it.
- `--json-output`: `extract`, `analyze` and `network list` put their data in `data`. Other commands still return captured text lines in `data.output`.
- `--plain` and `--json-output` text keep pass, fail and warning marks as `[PASS]`, `[FAIL]` and `[WARN]`.
- With `--html` and an `--output` that does not end in `.json`, the HTML report goes to `<name>.report.html` instead of overwriting the JSON.
- `repair-tests` saves its report with `--json-out <file>`; `--json` prints it.
- Size names: `mobile` is 393x852, `tablet` 834x1194 and `desktop` 1920x1080 in every tool (the CLI's `responsive` and MCP `responsive_test` used smaller sizes). The old sizes remain as `tablet-sm` (768x1024) and `desktop-md` (1440x900); `desktop-xl` is 2560x1440.

**MCP**
- `npx cbrowser mcp-server` (stdio) now registers the same tool set as the hosted server, 130 tools plus 7 local-only ones. It had its own copy of 82 tools.
- Red-zone refusals from `click`, `smart_click`, `press_key`, `type_text`, `drag` and `evaluate_script` are tool errors with one shape (`isError`, `zone: "red"`, `howToRun`). On the hosted server a refused call is refunded.
- `get_network_requests` returns the newest 50. `manage_cookies` `set` writes a session cookie unless `expires` is given.
- `compare_personas_record_result` and `compare_personas_summarize` are removed; nothing could create the session they needed.
- The five Enterprise marketing stubs use the Enterprise server's tool names and parameters.

**CI**
- The GitHub Action's `sensitivity` input is removed (test-suite never read it).

Upgrading from 18.x? The 19.0 change was the agent-ready `accessibility` axis becoming `agentPerceivability`: `score.accessibility` is `score.agentPerceivability`, `summary.dynamicContentCount` is `summary.deferredLoadingPatterns`, and `comparison.bestAccessibility` is `comparison.bestAgentPerceivability`.

---

## Cognitive Transport Chain

The eight-layer Sequential Transport Chain computes how hard a page is for a given persona, and predicts whether they abandon. Each layer answers one question about the visitor:

| Layer | The Question It Answers | Research Basis |
|-------|------------------------|----------------|
| **Visual Complexity** | How much visual clutter and motion is there to see past? | A count of visual elements plus animation level (hand-set; not the attention model) |
| **Cognitive Load** | Is there more on this page than they can hold at once? | Sweller (1988) CLT |
| **Decision** | Are there too many choices to pick between? | Hick-Hyman Law |
| **Motor** | Can they physically hit the target? | Grossman & Balakrishnan (2005) |
| **Motor Procedure** | Can they get through the whole sequence, not just one click? | Procedural fluency (split from Motor) |
| **Frustration** | How close are they to giving up? | Ceaparu et al. (2004) |
| **Readability** | Can they decode the words on the page? | Perry & Zorzi (2013) reading model |
| **Reading Attention** | Can they hold the line long enough to finish? | Sustained attention (split from Readability) |

The chain is *sequential* because attention is a budget, not a checklist. Each layer's cost is paid from whatever the layers before it left behind: a visitor who burned working memory just finding the button has less left for the form, and a persona who arrives at your pricing table already frustrated reads it differently from one who got there clean. That is why a page that exhausts people early scores differently from one that is uniformly hard, and why the bottleneck layer matters more than the average.

Two layers were split out of their neighbours because they fail for different reasons. **Motor Procedure** is separate from **Motor** because hitting a target and completing a sequence are different failures: you can land every click and still lose your place halfway through a form. **Reading Attention** is separate from **Readability** because decoding text and holding your place in it are different abilities: an ADHD reader typically decodes fine and loses the thread, and a single "reading" score cannot say that.

The chain runs through the MCP tool `cognitive_effort` (there is no CLI command for it):

```text
cognitive_effort(url: "https://your-site.com", persona: "first-timer")
-> CTC score, per-layer breakdown, bottleneck layer, abandonment risk, motor overlay
```

---

## Visual Overlays and Attention Analysis

See where users look, what they miss, and whether your calls to action capture attention, per persona. These are MCP tools:

| MCP tool | What it returns |
|---|---|
| `visual_cognitive_story` | Four annotated images and a narrative for one persona |
| `attention_analysis` | Predicted attention heatmap for one persona |
| `attention_compare` | How two personas experience the same page |
| `journey_heatmap_gif` | An animated heatmap of a journey |

**Overlays:** attention heatmap (CIE-Lab saliency on a grayscale base, red is high attention), motor accessibility (green, yellow or red per element by probability of a hit), attention quality (calls to action green, distractors red, headings blue) and a comparison diff (blue is persona A, red is persona B).

**Metrics:** CTA capture rate, value-prop salience, distractor ratio, quality score (0-100), entropy.

---

## AI Friendliness Suite

Make your site work for AI agents as well as people:

| Tool | What It Does |
|------|-------------|
| `agent_ready_audit` | Scores findability, stability, agent-perceivability and semantics (A-F grade) |
| `ai_benchmark` | Compares AI-friendliness across competitor URLs |
| `webmcp_ready_audit` | Audits a site for WebMCP readiness |
| `remediation_patches` | Generates code fixes for audit findings |
| `llms_txt_generate` | Generates an AI-readable llms.txt for a site |

```bash
cbrowser agent-ready-audit "https://your-site.com" --html
cbrowser ai-benchmark --urls "https://site-a.com,https://site-b.com" --html
```

The agent-perceivability axis measures whether a machine can perceive your elements (ARIA present, elements carry text). It is not a WCAG conformance score; run `empathy-audit` for that, and expect the two to differ.

---

## Cognitive User Simulation

Research-backed cognitive traits and motivational values model how real users think, struggle and give up:

| Trait | Research Basis | What It Models |
|-------|---------------|----------------|
| **Patience** | Nah (2004); Nielsen (1993) | Tolerance for delays; abandonment at 8+ seconds |
| **Working Memory** | Miller (1956) | 7±2 item capacity; affects form complexity tolerance |
| **Comprehension** | Card, Moran & Newell (1983) | UI convention understanding; GOMS model timing |
| **Risk Tolerance** | Kahneman & Tversky (1979) | Prospect theory; loss aversion affects CTA clicks |
| **Self-Efficacy** | Bandura (1977) | Belief in ability to solve problems; low means faster abandonment |
| **Satisficing** | Simon (1956) | Accept "good enough" or optimize; faster decisions |
| **Trust Calibration** | Fogg (2003) | Trust signals; affects click-through |
| **Information Foraging** | Pirolli & Card (1999) | "Scent" following; predicts navigation patterns |
| **Social Proof** | Cialdini (2001) | Influence of reviews, ratings and popularity indicators |
| **FOMO** | Przybylski et al. (2013) | Fear of missing out; urgency and scarcity responses |

The [Trait Index](https://cbrowser.ai/docs/Trait-Index) lists every trait with its citations, including Persistence, Resilience, Curiosity, Change Blindness, Anchoring Bias, Time Horizon, Attribution Style, Metacognitive Planning, Procedural Fluency, Transfer Learning, Authority Sensitivity, Emotional Contagion, Mental Model Rigidity, Interrupt Recovery, Reading Tendency and Site Familiarity.

**Full documentation:** [Research Methodology](https://cbrowser.ai/docs/Research-Methodology) · [Trait Index](https://cbrowser.ai/docs/Trait-Index) · [Bibliography](https://cbrowser.ai/docs/Bibliography)

### 21 Built-in Personas

**10 general:** power-user, first-timer, mobile-user, screen-reader-user, elderly-user, impatient-user, distracted-user, careful-reader, explorer, task-focused

**11 accessibility:** motor-impairment-tremor, low-vision-magnified, cognitive-adhd, dyslexic-user, deaf-user, elderly-low-vision, color-blind-deuteranopia, autism-spectrum, intellectual-disability, aphasia-receptive, dyscalculia

`cbrowser persona list` shows them with any custom personas you have made.

### Values System

Beyond cognitive traits, CBrowser models motivational values from three psychological frameworks:

| Framework | Research Basis |
|-----------|---------------|
| **Schwartz's Universal Values** | Schwartz (1992): Power, Achievement, Hedonism, Stimulation, Self-Direction, Universalism, Benevolence, Tradition, Conformity, Security |
| **Self-Determination Theory** | Deci & Ryan (1985): Autonomy, Competence, Relatedness |
| **Maslow's Hierarchy** | Maslow (1943): 5 need levels |

See [Values Framework](https://cbrowser.ai/docs/Values-Framework).

### Custom Personas

```bash
# Interactive questionnaire (13 core traits)
cbrowser persona-questionnaire start

# Comprehensive questionnaire (all 30 traits)
cbrowser persona-questionnaire start --comprehensive --name "my-tester"

# From a description
cbrowser persona create "A 68-year-old retiree who just got their first smartphone" --name retiree
```

### Abandonment Detection

A cognitive journey stops when a realistic user would give up:

```text
ABANDONED after 8 steps
Reason: Patience depleted (0.08) - "This is taking too long..."
Friction points:
  1. Password requirements unclear (step 4)
  2. Form validation error not visible (step 6)
```

### Replay a Journey for Free

Record a journey once with `--trace`, then replay it with no model calls. Replay is deterministic; a page that has changed since the recording stops the replay at the step that diverged.

```bash
cbrowser cognitive-journey --persona first-timer --start "https://your-site.com" --goal "sign up" --trace
cbrowser cognitive-journey --persona first-timer --start "https://your-site.com" --goal "sign up" \
  --replay-trace ~/.cbrowser/traces/<journeyId>.jsonl
```

---

## Accessibility Empathy Testing

Simulate how people with disabilities experience your site. Without `--goal` it checks the page for barriers and needs no key; with `--goal` it also runs a short journey per persona.

```bash
cbrowser empathy-audit "https://your-site.com" \
  --personas motor-impairment-tremor,dyslexic-user \
  --device iphone-16 \
  --html
```

Persona names accept the short aliases too (`adhd`, `autism`, `tremor`, `dyslexia`, ...). `--disabilities` is the older spelling of `--personas`.

---

## Constitutional AI Safety

AI agents need boundaries. CBrowser classifies every action by risk:

| Zone | Examples | Behavior |
|------|----------|----------|
| 🟢 **Green** | Navigate, read, screenshot | Runs |
| 🟡 **Yellow** | Click buttons, fill forms | Logged and runs |
| 🔴 **Red** | Submit, delete, purchase | Refused unless forced |
| ⬛ **Black** | Bypass auth, inject scripts | Never runs |

**How red is decided:** by the element an action would activate as well as by the selector text. The selector string is classified first, so naming a dangerous action in a selector is refused even when the element reads harmless. The element is then classified however it is addressed: the same "Delete account" button is refused by its label, its id, its test id or a structural path, and an element with only a delegated click listener is judged by its own text. A click on a container is judged at the point it lands (beneath fixed bars and overlays, into open shadow roots, slots and same-origin frames, up to the control, pointer-cursor item or text-bearing item there) and the click is sent to that judged point. A refused click is never retried with a "healed" selector.

**Gated:** `click`, `smart_click`, hover-click and the daemon's click; `press_key`, `type_text` and `keyboard` (Enter, including a typed or pressed newline, or Space on the focused control, followed into shadow roots and same-origin frames, and Enter in a field whose form submits one, judged together with a combobox's `aria-activedescendant` item); a `drag` whose press and release share a control; and the natural-language runner's `click at X, Y`. Caller-supplied page script is red by itself: `evaluate_script` over MCP, `evaluate`/`eval` on the CLI and the daemon's evaluate are refused without force and run nothing, because a script can activate any control without passing the element gate. Names below a control (icon labels, image alts, slotted and open-shadow text, `<label for>`) and the path a form submits to feed the same keyword classification. `force: true` on the MCP `click`, `smart_click`, `press_key`, `type_text`, `drag` and `evaluate_script` tools, or `--force` on the CLI, proceeds and reports the zone.

**Not judged, by design:** clicking or typing into a text field or a contenteditable editor; choosing a value with a native checkbox, radio or select, or a `role=checkbox`, `radio` or `switch` (the submit that commits them is judged, but a switch that saves as it changes commits immediately); and a link's address (a link to `/buy` is navigation). **Not gated:** cognitive journeys and other engines that choose their own clicks.

**Known limits:** labels inside closed shadow roots or drawn by CSS, controls inside cross-origin frames, icon-only controls with no accessible name, a confirmation button with neutral text ("Confirm", "OK") inside a dialog, a form with no `action` or an empty `formaction`, an `aria-activedescendant` id that only resolves outside the field's own root, a Tab inside typed text that moves focus before a later Enter, one round trip between the check and the click in which a page could swap the element, and keyword false positives such as a "Purchase history" tab, a "Buyer protection" link, a `role=option` picker such as "Pay with PayPal", or a harmless "Apply" in a form posting to `/checkout/discount`. Classification uses English keyword patterns; when the element cannot be read, the selector text alone decides.

---

## Browser Control from the CLI

Each `cbrowser` command is its own process. The persistent profile keeps cookies and the last URL between commands, but not the page itself, so the next command reloads it. To keep one live page across commands (scroll position, open menus, form state), start the daemon:

```bash
cbrowser daemon start --device iphone-16 --timeout 45m
cbrowser navigate "https://your-site.com"
cbrowser scroll down 600
cbrowser click "Pricing"
cbrowser screenshot pricing.png
cbrowser network list --filter api --json
cbrowser console --filter error
cbrowser daemon stop
```

While the daemon runs, `navigate`, `click`, `fill`, `hover`, `type`, `press`, `keyboard`, `screenshot`, `extract`, `run`, `scroll`, `evaluate`, `capture`, `har`, `network` and `console` use its browser. Commands that would open a second browser on its profile refuse until you stop it.

Global browser flags work on every command that opens a browser: `--device <name>` (200+ presets; `cbrowser device list`), `--viewport 390x844` or a size name, `--browser chromium|firefox|webkit`, `--geo <preset or lat,lon>`, `--locale`, `--timezone`, `--no-headless` and `--no-persistent`. Flags also take `--flag=value`.

---

## Natural Language Testing

```txt
# Test: Search
go to https://your-site.com
type "lamps" in the search box
click the search button
verify page contains "results"
verify url contains "/search"
```

```bash
cbrowser test-suite search-test.txt --html --output report.json

# Auto-repair broken tests
cbrowser repair-tests broken-test.txt --auto-apply --verify
```

Steps that would submit, delete or buy (for example `click "Place Order"`) are red zone, and the test runner never forces them. Keep those out of unattended suites or test them against a sandbox account.

---

## Visual Testing

```bash
# AI visual regression
cbrowser ai-visual capture "https://your-site.com" --name homepage
cbrowser ai-visual test "https://staging.your-site.com" homepage --html

# Cross-browser (Chromium, Firefox, WebKit)
cbrowser cross-browser "https://your-site.com" --html

# Responsive (mobile, tablet, desktop by default)
cbrowser responsive "https://your-site.com" --html

# A/B comparison (staging against production)
cbrowser ab "https://staging.your-site.com" "https://your-site.com" --html
```

---

## Screen Capture

Record a GIF, animated WebP or video of a page, plus a frame manifest an AI can read:

```bash
cbrowser capture start "https://your-site.com" --duration 5s --format gif,webp
cbrowser capture start "https://your-site.com" --until-element-gone ".spinner" --timeout 20s
```

With the daemon running, `capture start` records the daemon's page while you drive it with other commands, and `capture stop` finishes it.

---

## Competitive UX Benchmark

Run identical cognitive journeys on your site and your competitors' (needs an Anthropic API key; one journey per site):

```bash
cbrowser competitive-benchmark \
  --sites "https://your-site.com,https://competitor-a.com,https://competitor-b.com" \
  --goal "sign up for free trial" \
  --persona first-timer \
  --html
```

---

## Geo Proxy

Test from 10 global regions via residential proxies. Today `agent-ready-audit` is the command that routes through them:

```bash
cbrowser agent-ready-audit "https://your-site.com" --geo-region uk
```

**Regions:** `us-west`, `us-east`, `us-central`, `uk`, `germany`, `france`, `japan`, `australia`, `canada`, `brazil`

Geo routing needs your own residential-proxy credentials; the package ships the mechanism and no keys. Set `IPROYAL_USERNAME` / `IPROYAL_PASSWORD`, or place a `geo-proxy.json` in `~/.cbrowser/`. Without either, `--geo-region` exits 1 rather than silently running from your own IP. A `geo-proxy.json` may define additional regions; they merge over the ten above.

For location without a proxy (the browser's reported geolocation, not its IP), use `--geo new-york` or `--geo 40.71,-74.00` on any command.

---

## MCP Server Integration

CBrowser runs as an MCP server for Claude.ai, Claude Desktop and Claude Code.

### Claude.ai (no install)

1. Go to [Customize → Connectors](https://claude.ai/customize/connectors) and choose "Add custom connector".
2. Paste: `https://demo.cbrowser.ai/mcp`
3. Optionally download the [Claude.ai Skill (.zip)](https://cbrowser.ai/downloads/cbrowser-claudeai.skill), which gives Claude context about the tools and workflows, and upload it under Customize → Skills.

The Claude.ai Skill is a small knowledge file for the web interface. It is not the Claude Code Skill below.

### Claude Code Skill

```bash
curl -fsSL https://raw.githubusercontent.com/alexandriashai/cbrowser/main/scripts/install-skill.sh | bash
npm install -g cbrowser
```

See the [Skill Installation Guide](https://cbrowser.ai/docs/claude-skill-installation).

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

The local stdio server registers the same 130 tools as the hosted one, plus 7 that keep their state in the local process (`empathy_audit_init`, `empathy_audit_record_barrier`, `empathy_audit_complete_persona`, `empathy_audit_summarize`, `get_emotional_state`, `list_emotional_personas`, `trigger_emotional_event`). `cbrowser mcp-remote` runs your own HTTP server for remote clients.

### 130 MCP Tools

| Category | Tools | Count |
|----------|-------|-------|
| **Navigation and extraction** | `navigate`, `list_devices`, `screenshot`, `extract` | 4 |
| **Interaction** | `click`, `smart_click`, `fill`, `scroll`, `dismiss_overlay`, `hover`, `type_text`, `press_key`, `handle_dialog`, `upload_file`, `drag` | 11 |
| **Browser state** | `evaluate_script`, `get_console_messages`, `get_network_requests`, `manage_cookies`, `manage_storage`, `manage_tabs` | 6 |
| **Cognitive journeys** | `cognitive_journey_init`, `cognitive_journey_update_state`, `list_cognitive_personas` | 3 |
| **Cognitive transport and comparison** | `cognitive_effort`, `cognitive_load_estimate`, `cognitive_distance`, `cognitive_coverage`, `cognitive_interpolate`, `compare_personas`, `compare_personas_init`, `compare_personas_complete` | 8 |
| **Attention and visual testing** | `attention_analysis`, `attention_compare`, `transport_map`, `visual_baseline`, `visual_regression`, `cross_browser_test`, `cross_browser_diff`, `responsive_test`, `ab_comparison` | 9 |
| **Audits** | `agent_ready_audit`, `empathy_audit`, `webmcp_ready_audit`, `competitive_benchmark`, `site_cognitive_assessment`, `visual_cognitive_story` | 6 |
| **Analysis and bugs** | `analyze_page`, `generate_tests`, `find_element_by_intent`, `ai_benchmark`, `hunt_bugs`, `chaos_test` | 6 |
| **Testing** | `nl_test_inline`, `nl_test_file`, `repair_test`, `detect_flaky_tests`, `coverage_map`, `assert` | 6 |
| **Performance** | `perf_baseline`, `perf_regression`, `list_baselines` | 3 |
| **Remediation and llms.txt** | `remediation_patches`, `llms_txt_generate`, `llms_txt_validate`, `llms_txt_diff`, `structured_data_suggest` | 5 |
| **Site knowledge** | `page_understand`, `site_model_status`, `site_model_query`, `site_profile_list`, `site_profile_status`, `site_profile_delete`, `question_answer` | 7 |
| **Personas and values** | `persona_create_*` (6), `persona_traits_list`, `persona_manager`, `persona_update`, `persona_delete`, `persona_lookup`, `persona_values_list`, `persona_values_lookup`, `persona_trait_lookup`, `persona_category_guidance`, `persona_questionnaire_get`, `persona_questionnaire_build`, `list_influence_patterns` | 18 |
| **Capture and artifacts** | `capture_start`, `capture_stop`, `capture_status`, `journey_heatmap_gif`, `artifact_fetch` | 5 |
| **Sessions and browser** | `save_session`, `load_session`, `list_sessions`, `delete_session`, `status`, `browser_health`, `browser_recover`, `reset_browser`, `heal_stats` | 9 |
| **Security** | `security_audit` | 1 |
| **Marketing** | `marketing_personas_list`, `marketing_campaign_create`, `marketing_campaign_run`, `marketing_campaign_report_result` | 4 |
| **Utility** | `ask_user` | 1 |
| **Enterprise** *(stubs in the public package)* | `set_api_key`, `clear_api_key`, `api_key_status`, `get_api_key_prompt`, `cognitive_journey_autonomous`, `marketing_influence_matrix`, `marketing_lever_analysis`, `marketing_funnel_analyze`, `marketing_compete`, `marketing_audience_discover`, `marketing_discover_status`, `stealth_*` (5), `cloudflare_detect`, `cloudflare_wait` | 18 |

The 18 Enterprise tools are listed by the public package so clients can discover them; they run on [CBrowser Enterprise](#enterprise-edition) and answer with an upgrade notice elsewhere.

### Token Cost and Selective Loading

All 130 tool definitions take a large share of an LLM's context. To expose only what you need, register tool families yourself:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CBrowser } from "cbrowser";
import {
  registerNavigationTools,
  registerInteractionTools,
  registerExtractionTools,
} from "cbrowser/mcp-tools";

const browser = new CBrowser({ headless: true });
const server = new McpServer({ name: "my-app", version: "1.0.0" });
const context = { getBrowser: async () => browser };

registerNavigationTools(server, context);
registerInteractionTools(server, context);
registerExtractionTools(server, context);
```

**Families:** `registerNavigationTools`, `registerInteractionTools`, `registerAdvancedInteractionTools`, `registerExtractionTools`, `registerBrowserStateTools`, `registerAssertionTools`, `registerAnalysisTools`, `registerAuditTools`, `registerBugAnalysisTools`, `registerCaptureTools`, `registerCognitiveTools`, `registerPersonaComparisonTools`, `registerVisualTestingTools`, `registerTestingTools`, `registerPerformanceTools`, `registerRemediationTools`, `registerLlmsTxtTools`, `registerSiteKnowledgeTools`, `registerValuesTools`, `registerPersonaLifecycleTools`, `registerPersonaCreationTools`, `registerSessionTools`, `registerHealingTools`, `registerBrowserManagementTools`, `registerSecurityTools`, `registerMarketingTools`, `registerGifTools`, `registerArtifactTools`, `registerAskUserTool`.

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
      - uses: alexandriashai/cbrowser@v20.0.0
        with:
          test-file: tests/e2e/search.txt
```

The action installs cbrowser and the browsers, then runs one of: `test-file` (a natural-language suite, with a JSON and an HTML report), `url` (writes a page analysis), or `command` (any cbrowser command). Outputs land in `cbrowser-output/` and are uploaded as an artifact. Pin the action to a release tag.

### Docker

There is no published image. Build one from the repository's `Dockerfile`:

```bash
docker build -t cbrowser .
docker run --rm -v "$(pwd)/tests:/work/tests" cbrowser test-suite tests/search.txt --html
```

---

## API Reference

```typescript
import { CBrowser } from "cbrowser";

const browser = new CBrowser({
  headless: true,
  persistent: true,
});

await browser.navigate("https://example.com");

const result = await browser.smartClick("Sign In", {
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
import { runVisualRegression, runCrossBrowserTest } from "cbrowser/visual";
import { runNLTestSuite, detectFlakyTests, repairTest } from "cbrowser/testing";
import { huntBugs, runChaosTest, findElementByIntent } from "cbrowser/analysis";
import { capturePerformanceBaseline, detectPerformanceRegression } from "cbrowser/performance";
```

Also exported: `cbrowser/mcp-tools`, `cbrowser/mcp-remote`, `cbrowser/values` and `cbrowser/stealth`.

---

## Configuration

Environment variables override the config file, and command-line flags override both.

| Variable | Default | Description |
|----------|---------|-------------|
| `CBROWSER_DATA_DIR` | `~/.cbrowser` | Data storage directory |
| `CBROWSER_HEADLESS` | `true` | Set `false` to show the browser |
| `CBROWSER_BROWSER` | `chromium` | `chromium`, `firefox` or `webkit` |
| `CBROWSER_VIEWPORT_WIDTH` / `CBROWSER_VIEWPORT_HEIGHT` | `1920` / `1080` | Default page size |
| `CBROWSER_DEVICE` | none | Default device preset |
| `CBROWSER_LOCALE` / `CBROWSER_TIMEZONE` | the host's | Browser locale and timezone |
| `CBROWSER_TIMEOUT` | `30000` | Default timeout (ms) |
| `CBROWSER_PROXY` | none | Proxy URL (or `CBROWSER_PROXY_SERVER`, `_USERNAME`, `_PASSWORD`) |
| `CBROWSER_RECORD_VIDEO` | `false` | Record video of browser sessions |
| `NO_COLOR` | unset | Disable colour output |

**Config file:** the first of `./.cbrowserrc.json`, `./.cbrowserrc`, `./cbrowser.config.json`, `<data dir>/config.json` or `~/.cbrowserrc.json`. Keys include `browser`, `headless`, `viewport` (`{ "width", "height" }`), `device`, `locale`, `timezone`, `timeout` and `recordVideo`.

```bash
cbrowser config set-api-key <key>   # for cognitive journeys
cbrowser doctor                     # check Node, Playwright, the browsers and the key
```

---

## Enterprise Edition

[CBrowser Enterprise](https://cbrowser.ai/enterprise) adds:

| Feature | Description |
|---------|-------------|
| **Marketing Suite** | Test which design, copy and UX patterns influence which buyer segments |
| **8 Marketing Personas** | B2B (enterprise-buyer, startup-founder, procurement-manager, technical-evaluator) and consumer (impulse-shopper, price-researcher, loyal-customer, skeptical-first-timer) |
| **Influence Matrix** | Conversion effectiveness for each variant and persona combination |
| **Lever Analysis** | Which persuasion patterns work for each persona |
| **Constitutional Stealth** | Stealth measures for authorized penetration testing |
| **Web Security Scan** | OWASP-based security scanning |
| **Your own API key** | Per-account Anthropic keys for autonomous journeys |

Unlimited tool use, with no credits.

---

## License

**MIT License.** Free and open source. See [LICENSE](LICENSE).

---

© 2026 Alexandria Eden · [cbrowser.ai](https://cbrowser.ai) · [alexandria.shai.eden@gmail.com](mailto:alexandria.shai.eden@gmail.com)

## Links

- **[Documentation](https://cbrowser.ai/docs)**: guides and API reference
- [NPM Package](https://www.npmjs.com/package/cbrowser)
- [GitHub](https://github.com/alexandriashai/cbrowser)
- [Issue Tracker](https://github.com/alexandriashai/cbrowser/issues)

### Research

- [Research Methodology](https://cbrowser.ai/docs/Research-Methodology): how the traits were selected and validated
- [Trait Index](https://cbrowser.ai/docs/Trait-Index): every cognitive trait with citations
- [Bibliography](https://cbrowser.ai/docs/Bibliography): academic references
- [Persona Index](https://cbrowser.ai/docs/Persona-Index): every cognitive and marketing persona
