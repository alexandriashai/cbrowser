# Tools Reference

**Stop writing brittle test scripts. Start having conversations with your browser.**

CBrowser provides 82 MCP tools that let Claude automate browsers using natural language. No CSS selectors. No XPath. No "element not found" errors at 3am. Just describe what you want to do, and CBrowser figures out the rest.

---

## The Problem We Solve

Traditional browser automation breaks constantly:
- **Selectors drift** — A developer changes a CSS class and your entire test suite fails
- **Timing issues** — Pages load at different speeds, tests randomly fail
- **Maintenance burden** — You spend more time fixing tests than writing features
- **No user insight** — Tests tell you if buttons click, not if humans can use your product

CBrowser fixes this with AI-powered automation that:
- **Self-heals** when the DOM changes
- **Waits intelligently** for content, not arbitrary timeouts
- **Simulates real users** with patience, frustration, and abandonment
- **Works through conversation** — describe intent, not implementation

---

## Tool Tiers

| Tier | Tools | Access | Best For |
|------|-------|--------|----------|
| **Demo** | 63 real tools | Free at `demo.cbrowser.ai/mcp` | Evaluation, small projects, learning |
| **Enterprise** | 82 tools (all Demo + 19 exclusive) | Self-hosted or authenticated | Production use, marketing intelligence, stealth testing |

The Demo tier gives you everything you need to automate browsers, run tests, and simulate users. Enterprise adds autonomous AI execution, marketing campaign analysis, and bot detection bypass for authorized testing.

---

## Tools by Capability

### [Browser Automation](/docs/Tools-Browser-Automation/)
**12 tools** — Navigate, click, fill forms, extract data. The foundation of everything else.

*"Click the blue login button"* works better than `document.querySelector('.btn-primary.auth-action.mt-4')`.

### [Cognitive Journeys](/docs/Tools-Cognitive-Journeys/)
**6 tools** — Simulate real users with patience thresholds, frustration tracking, and abandonment detection.

Find out where users give up *before* they actually do. A frustrated-first-timer abandons faster than a patient-power-user.

### [Persona System](/docs/Tools-Persona-System/)
**15 tools** — Create and customize personas backed by 25 research-validated cognitive traits.

Test as an elderly user with low tech confidence. Or an ADHD user who skims and clicks fast. Or your exact target demographic.

### [Testing & Quality](/docs/Tools-Testing-Quality/)
**7 tools** — Write tests in plain English, auto-repair broken selectors, detect flaky tests, map coverage.

*"Go to the checkout page, add a product, verify the cart updates"* — that's a test. No code required.

### [Visual & Performance](/docs/Tools-Visual-Performance/)
**10 tools** — Catch visual regressions, performance degradations, cross-browser issues, and responsive breakage.

Know when your staging deploy breaks the hero image on mobile Safari before your users tell you.

### [Marketing Intelligence](/docs/Tools-Marketing-Intelligence/)
**11 tools** — Test which psychological influence patterns work on which audience segments.

Does scarcity messaging work on enterprise buyers? (No.) Does social proof work on skeptical first-timers? (Yes.) Now you can measure it.

### [Accessibility](/docs/Tools-Accessibility/)
**1 flagship tool** — Simulate disabilities (motor tremor, low vision, ADHD, color blindness) with WCAG remediation.

Stop guessing if your site is accessible. Experience it through the eyes of someone who can't use a mouse.

### [Session & State](/docs/Tools-Session-State/)
**14 tools** — Save sessions, manage browser state, handle Cloudflare challenges (Enterprise), enable stealth mode (Enterprise).

Stay logged in across test runs. Bypass bot detection on sites you're authorized to test.

### [Utilities](/docs/Tools-Utilities/)
**6 tools** — Diagnostics, health checks, API key management (Enterprise), agent-readiness audits.

Is your site ready for AI agents to navigate it? Get a score and specific recommendations.

---

## Quick Start

**1. Connect to the Demo MCP** (free, rate-limited):
```
URL: https://demo.cbrowser.ai/mcp
```

**2. Or run locally** (no rate limits):
```bash
npx cbrowser mcp-server
```

**3. Start automating**:
```
Navigate to https://example.com
Click the "Get Started" button
Fill the email field with "test@example.com"
Take a screenshot
```

That's it. No setup, no configuration, no selectors.

---

## Enterprise Features

Enterprise adds capabilities that require either:
- **API credits** (autonomous AI journeys that make decisions)
- **Security attestation** (stealth/Cloudflare bypass requires domain authorization)
- **Compute resources** (marketing campaigns that run hundreds of journeys)

| Feature | Why It's Enterprise |
|---------|---------------------|
| Autonomous Journeys | AI makes decisions, consumes API credits |
| Marketing Execution | Runs campaigns with real cognitive journeys |
| Marketing Analysis | Influence matrices, lever analysis, funnel comparison |
| Stealth Mode | Constitutional bypass requires signed authorization |
| Cloudflare Handling | Challenge bypass for authorized domains only |

**Demo users can still:**
- Set up marketing campaigns and report results manually
- Run cognitive journeys with Claude orchestrating (no server-side autonomy)
- Use all 63 core automation, testing, and persona tools

[Contact for Enterprise →](mailto:alexandria.shai.eden@gmail.com)

---

## Related Documentation

- [Getting Started](/docs/Getting-Started/) — Installation and first steps
- [MCP Server](/docs/MCP-Server/) — Claude Desktop integration
- [Remote MCP Server](/docs/Remote-MCP-Server/) — claude.ai integration
- [Examples](/docs/Examples/) — Real-world usage patterns
- [CLI Reference](/docs/CLI-Reference/) — Command-line usage

---

*Last updated: v17.6.0*
