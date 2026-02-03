# CBrowser: AI-Native Browser Automation for PAI

**Category:** Show and Tell
**Skill:** `/CBrowser`
**Version:** 7.4.7
**Author:** [@alexandriashai](https://github.com/alexandriashai)

---

## TL;DR

I built **CBrowser** (Cognitive Browser) - a PAI skill that replaces the built-in `/Browser` skill with AI-native browser automation. It has self-healing selectors, constitutional safety, persona testing, session persistence, and 31 MCP tools.

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

## The Problem with Built-in Browser Automation

The default `/Browser` skill is great for quick debugging - take a screenshot, check if a page loads. But when you try to do *real* browser automation, you hit walls:

| Issue | What Happens |
|-------|--------------|
| **Brittle Selectors** | `click "#btn-submit-v2"` breaks when the site updates |
| **No Memory** | Every call starts fresh - can't stay logged in across sessions |
| **No Safety Rails** | Nothing stops you from clicking "Delete Account" accidentally |
| **Developer Perspective** | Tests from YOUR viewpoint, not your users' |
| **Breaks Silently** | Element not found? Good luck debugging |
| **Manual Everything** | You write every selector, every assertion, every wait |

I kept running into these problems on my own projects. Login flows that broke weekly. Tests that passed locally but failed in CI. No way to test how an elderly user or mobile user would experience my sites.

---

## What CBrowser Fixes

### 1. AI Vision Instead of Brittle Selectors

```bash
# Old way (breaks when DOM changes)
click "#nav-menu-item-3 > a.btn-primary"

# CBrowser way (works forever)
npx cbrowser smart-click "the blue login button in the header"
```

CBrowser uses AI to understand *what* you want to click, not *where* it is. When the site redesigns, your automation keeps working.

### 2. Self-Healing Selectors

When an element isn't found, CBrowser:
1. Checks its cache for known alternatives
2. Generates alternative selectors (text, ARIA, attributes)
3. Tries each one with configurable retry
4. Caches what works for next time

No more 3am pages about broken selectors.

### 3. Session Persistence

```bash
# Log in once
npx cbrowser navigate "https://myapp.com/login"
npx cbrowser fill "email" "me@example.com"
npx cbrowser fill "password" "secret"
npx cbrowser click "Sign In"
npx cbrowser session save "logged-in"

# Use forever
npx cbrowser session load "logged-in"
npx cbrowser navigate "https://myapp.com/dashboard"
# Still logged in!
```

Sessions persist cookies, localStorage, and sessionStorage across CLI calls. Your AI agent can log in once and work across multiple invocations.

### 4. Constitutional Safety

This is the feature I'm most proud of. CBrowser classifies every action by risk:

| Zone | Actions | Behavior |
|------|---------|----------|
| **Green** | Navigate, read, screenshot | Auto-execute |
| **Yellow** | Click buttons, fill forms | Log and proceed |
| **Red** | Submit, delete, purchase | **Requires verification** |
| **Black** | Bypass auth, inject scripts | **Never executes** |

When an AI agent has browser access, you *need* guardrails. CBrowser won't let you accidentally delete your production database.

### 5. Persona-Based Testing

This changed how I think about testing:

```bash
npx cbrowser compare-personas \
  --start "https://mysite.com" \
  --goal "Complete checkout" \
  --personas power-user,first-timer,elderly-user,mobile-user
```

Output:
```
┌─────────────────┬──────────┬──────────┬──────────┬─────────────────┐
│ Persona         │ Success  │ Time     │ Friction │ Key Issues      │
├─────────────────┼──────────┼──────────┼──────────┼─────────────────┤
│ power-user      │ ✓        │ 12.5s    │ 0        │ -               │
│ first-timer     │ ✓        │ 45.2s    │ 2        │ Confusing CTA   │
│ elderly-user    │ ✗        │ 120.3s   │ 5        │ Small buttons   │
│ mobile-user     │ ✓        │ 28.1s    │ 1        │ Scroll issue    │
└─────────────────┴──────────┴──────────┴──────────┴─────────────────┘
```

Each persona has realistic timing, error rates, and attention patterns. The `elderly-user` has slower reactions and sometimes misclicks. The `impatient-user` abandons after 10 seconds of loading.

I found accessibility bugs I never would have caught testing as myself.

### 6. AI Visual Regression (v7.0+)

Not just pixel diffs - semantic understanding:

```bash
npx cbrowser ai-visual capture "https://mysite.com" --name homepage
# ... make changes ...
npx cbrowser ai-visual test "https://mysite.com" homepage
```

The AI understands "button moved 5px" vs "button disappeared" vs "button text changed". No more false positives from anti-aliasing differences.

### 7. Autonomous Bug Hunting

```bash
npx cbrowser hunt-bugs "https://mysite.com" --depth 3
```

CBrowser explores your site autonomously, finding:
- Broken links
- Console errors
- Accessibility violations
- UX issues
- Performance problems

It finds bugs you didn't know to look for.

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

### Or via npm

```bash
npx cbrowser install-skill
```

### Post-Install

1. Install the npm package and browsers:
```bash
npm install -g cbrowser
npx playwright install
```

2. Add to your skill index (`~/.claude/skills/skill-index.json`):
```json
{
  "CBrowser": "~/.claude/skills/CBrowser/SKILL.md"
}
```

3. Use it:
```
User: "Navigate to example.com and click the login button"
→ CBrowser handles it with AI vision and self-healing
```

---

## Skill Structure

After installation, you get:

```
~/.claude/skills/CBrowser/
├── SKILL.md                    # Main skill file
├── Philosophy.md               # Constitutional principles
├── AIVision.md                 # AI selector docs
├── Personas.md                 # Persona framework
├── Workflows/
│   ├── Navigate.md             # Smart navigation
│   ├── Interact.md             # AI interactions
│   ├── Extract.md              # Data extraction
│   ├── Authenticate.md         # Login handling
│   ├── Test.md                 # Test scenarios
│   └── Journey.md              # Autonomous journeys
├── Tools/
│   └── CBrowser.ts             # CLI wrapper
└── .memory/                    # Persistent storage
```

---

## Remote MCP (Bonus)

If you use claude.ai, you can also connect to CBrowser as a Remote MCP:

**Demo (rate limited):** `https://cbrowser-mcp-demo.wyldfyre.ai/mcp`
**Authenticated:** `https://cbrowser-mcp.wyldfyre.ai/mcp` (Auth0 OAuth)

---

## Links

- **GitHub:** https://github.com/alexandriashai/cbrowser
- **npm:** https://www.npmjs.com/package/cbrowser
- **Wiki:** https://github.com/alexandriashai/cbrowser/wiki
- **PAI Skill Install Guide:** https://github.com/alexandriashai/cbrowser/wiki/PAI-Skill-Installation

---

## Questions?

Happy to answer any questions about the implementation, the constitutional safety system, or how to set up specific use cases.

The code is MIT licensed - fork it, extend it, make it your own.
