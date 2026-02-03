# CBrowser: AI-Native Browser Automation for PAI

**Skill:** `/CBrowser`
**Version:** 7.4.8
**Author:** [@alexandriashai](https://github.com/alexandriashai)

---

## TL;DR

I built **CBrowser** (Cognitive Browser) - a PAI skill for advanced browser automation scenarios. It extends what's possible with AI-native features like self-healing selectors, constitutional safety, persona testing, and session persistence.

**Install in 30 seconds:**
```bash
curl -fsSL https://raw.githubusercontent.com/alexandriashai/cbrowser/main/scripts/install-skill.sh | bash
npm install -g cbrowser && npx playwright install
```

Then add to `~/.claude/skills/skill-index.json`:
```json
{"CBrowser": "~/.claude/skills/CBrowser/SKILL.md"}
```

---

## When to Use Each

The built-in `/Browser` skill and CBrowser serve different purposes:

| Use Case | Best Tool |
|----------|-----------|
| Quick screenshot to verify something | `/Browser` - simple, fast, built-in |
| Debug a page, check if it loads | `/Browser` - no setup needed |
| Multi-step automation with login persistence | `/CBrowser` - sessions survive across calls |
| Testing as different user personas | `/CBrowser` - built-in persona framework |
| Autonomous bug hunting | `/CBrowser` - explores without scripts |
| Production automation with safety rails | `/CBrowser` - constitutional zones prevent accidents |

**They complement each other.** I still use the built-in Browser skill for quick checks. CBrowser is for when I need the full automation toolkit.

---

## What's New in v7.4.8

**Bug Fix:** Natural language test assertions now work without quotes:
```bash
# Both of these now work:
npx cbrowser test-suite --inline "go to https://example.com ; verify title contains Example"
npx cbrowser test-suite --inline "go to https://example.com ; verify title contains 'Example'"
```

**New assertion aliases:** `ensure`, `includes`, `the`, `present`

---

## Key Features

### 1. AI Vision Selectors

```bash
# Describe what you want, not where it is
npx cbrowser smart-click "the blue login button in the header"
```

When the site redesigns, your automation keeps working because it understands intent, not just DOM structure.

### 2. Self-Healing Selectors

When an element isn't found, CBrowser:
1. Checks its cache for known alternatives
2. Generates alternative selectors (text, ARIA, attributes)
3. Tries each one with configurable retry
4. Caches what works for next time

### 3. Session Persistence

```bash
npx cbrowser session save "logged-in"
# ... later, even in a new terminal ...
npx cbrowser session load "logged-in"
# Still logged in!
```

Sessions persist cookies, localStorage, and sessionStorage across CLI calls.

### 4. Constitutional Safety

Every action is classified by risk:

| Zone | Actions | Behavior |
|------|---------|----------|
| **Green** | Navigate, read, screenshot | Auto-execute |
| **Yellow** | Click buttons, fill forms | Log and proceed |
| **Red** | Submit, delete, purchase | **Requires verification** |
| **Black** | Bypass auth, inject scripts | **Never executes** |

Essential guardrails when AI agents operate autonomously.

### 5. Persona-Based Testing

```bash
npx cbrowser compare-personas \
  --start "https://mysite.com" \
  --goal "Complete checkout" \
  --personas power-user,first-timer,elderly-user,mobile-user
```

Each persona has realistic timing, error rates, and attention patterns. Find accessibility issues you'd miss testing as yourself.

### 6. AI Visual Regression (v7.0+)

Semantic screenshot comparison - the AI understands "button moved" vs "button disappeared" vs "button text changed". No more false positives from anti-aliasing.

### 7. Natural Language Test Suites

```bash
# Write tests in plain English
npx cbrowser test-suite tests.txt
```

```txt
# Test: Login Flow
go to https://example.com
click the login button
type "user@example.com" in email field
verify url contains /dashboard
```

---

## Full Feature List

| Category | Features |
|----------|----------|
| **Navigation** | Smart navigation, AI wait detection, session persistence |
| **Interaction** | AI selectors, self-healing, natural language clicks/fills |
| **Testing** | Natural language test suites, AI test repair, flaky detection |
| **Visual** | AI regression, cross-browser, responsive, A/B comparison |
| **Personas** | 6 built-in, custom creation, multi-persona comparison |
| **Safety** | Constitutional zones, audit logging, verification gates |
| **Analysis** | Bug hunting, chaos testing, performance baselines |

31 MCP tools total.

---

## Installation

### One-Line Install

```bash
curl -fsSL https://raw.githubusercontent.com/alexandriashai/cbrowser/main/scripts/install-skill.sh | bash
```

### Post-Install

```bash
npm install -g cbrowser
npx playwright install
```

Add to `~/.claude/skills/skill-index.json`:
```json
{"CBrowser": "~/.claude/skills/CBrowser/SKILL.md"}
```

---

## Remote MCP (Bonus)

Use CBrowser in claude.ai with zero local installation:

**Demo (rate limited):** `https://cbrowser-mcp-demo.wyldfyre.ai/mcp`
**Authenticated:** `https://cbrowser-mcp.wyldfyre.ai/mcp` (Auth0 OAuth)

---

## Links

- **GitHub:** https://github.com/alexandriashai/cbrowser
- **npm:** https://www.npmjs.com/package/cbrowser
- **Wiki:** https://github.com/alexandriashai/cbrowser/wiki
- **Releases:** https://github.com/alexandriashai/cbrowser/releases

---

## Questions?

Happy to answer questions about the implementation, constitutional safety, or specific use cases.

MIT licensed - fork it, extend it, make it your own.
