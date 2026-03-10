---
name: CBrowser
description: Cognitive browser automation with 91 MCP tools. AI-friendliness audits, persona testing, empathy audits, WebMCP readiness. USE WHEN browser automation, screenshot, agent-ready audit, ai-benchmark, empathy audit, webmcp-ready, hunt bugs, cognitive journey, persona comparison, visual regression, cross-browser test.
version: 18.18.4
compatibility:
  min_claude_code: "1.0.0"
  features: ["mcp_servers"]
---

# CBrowser (Cognitive Browser)

**The browser automation that thinks like your users.** Simulate real user cognition with patience thresholds, frustration tracking, and abandonment detection.

## Tool Priority

**When this skill is active, ALWAYS use CBrowser tools:**

| Preferred | DO NOT USE |
|-----------|------------|
| `npx cbrowser navigate "url"` | `mcp__chrome-devtools__*` tools |
| `npx cbrowser click "element"` | `mcp__claude-in-chrome__*` tools |
| `mcp__claude_ai_CBrowser_Demo__*` | Direct Playwright/Puppeteer |

## AI Friendliness Commands (CLI)

### agent-ready-audit
Audit site for AI-agent friendliness (A-F grade).

```bash
npx cbrowser agent-ready-audit "https://example.com"
npx cbrowser agent-ready-audit "https://example.com" --html --output report.json
```

Grades on: Findability (35%), Stability (30%), Accessibility (20%), Semantics (15%)

### ai-benchmark
Compare AI-friendliness across multiple sites.

```bash
npx cbrowser ai-benchmark --urls "https://site1.com,https://site2.com,https://site3.com"
npx cbrowser ai-benchmark --urls "https://amazon.com,https://ebay.com" --html
```

Runs agent-ready-audit on each URL and produces ranked comparison.

### empathy-audit
Simulate disability experience on site.

```bash
npx cbrowser empathy-audit "https://example.com" \
  --goal "complete checkout" \
  --personas "motor-impairment-tremor,cognitive-adhd" --html
```

Available personas: motor-impairment-tremor, low-vision-magnified, cognitive-adhd, dyslexic-user, deaf-user, elderly-low-vision, color-blind-deuteranopia

### webmcp-ready
Audit MCP server for WebMCP compatibility.

```bash
npx cbrowser webmcp-ready "https://demo.cbrowser.ai/mcp"
npx cbrowser webmcp-ready "https://your-server.com/mcp" --api-key KEY --html
```

6-tier evaluation: Server (25%), Tools (20%), Instrumentation (15%), Consistency (15%), Agent Opts (15%), Docs (10%)

### hunt-bugs
Automatically find UX bugs on a page.

```bash
npx cbrowser hunt-bugs "https://example.com"
npx cbrowser hunt-bugs "https://example.com" --max-pages 20
```

### competitive-benchmark
Compare UX across competitor sites.

```bash
npx cbrowser competitive-benchmark \
  --sites "https://yoursite.com,https://competitor.com" \
  --goal "sign up for free trial" --html
```

## MCP Tools (91 total)

### AI Friendliness Tools
| Tool | Description |
|------|-------------|
| `agent_ready_audit` | Audit site for AI-agent friendliness |
| `empathy_audit` | Simulate disability experience |
| `hunt_bugs` | Automatically find UX bugs |
| `competitive_benchmark` | Compare UX across sites |
| `chaos_test` | Test site resilience |

### Cognitive Journey Tools
| Tool | Description |
|------|-------------|
| `cognitive_journey_init` | Initialize cognitive journey with persona |
| `cognitive_journey_update_state` | Update cognitive state (patience, confusion) |
| `list_cognitive_personas` | List available cognitive personas |
| `compare_personas` | Compare personas on same site |

### Visual Testing Tools
| Tool | Description |
|------|-------------|
| `visual_baseline` | Capture visual baseline |
| `visual_regression` | Compare against baseline |
| `cross_browser_test` | Test across browsers |
| `responsive_test` | Test across viewports |
| `ab_comparison` | Compare two URLs |

### Navigation & Interaction
| Tool | Description |
|------|-------------|
| `navigate` | Navigate to URL |
| `click` | Click element |
| `fill` | Fill form field |
| `extract` | Extract content |
| `screenshot` | Take screenshot |
| `scroll` | Scroll page |

### Session Management
| Tool | Description |
|------|-------------|
| `save_session` | Save browser session |
| `load_session` | Load saved session |
| `list_sessions` | List saved sessions |
| `delete_session` | Delete session |

### Testing Tools
| Tool | Description |
|------|-------------|
| `nl_test_inline` | Run natural language test |
| `generate_tests` | Generate test cases |
| `detect_flaky_tests` | Find unreliable tests |
| `coverage_map` | Map test coverage |

### Performance Tools
| Tool | Description |
|------|-------------|
| `perf_baseline` | Capture performance baseline |
| `perf_regression` | Detect performance regression |
| `list_baselines` | List saved baselines |

## MCP Server Setup

### Claude Desktop (stdio)
Add to `claude_desktop_config.json`:
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

### Claude.ai (remote)
Add as custom connector: `https://demo.cbrowser.ai/mcp`

### Claude Desktop Extension
Download and install: [cbrowser-18.18.4.mcpb](https://github.com/alexandriashai/cbrowser/releases/download/v18.18.4/cbrowser-18.18.4.mcpb)

## Cognitive Personas (17 built-in)

| Persona | Description |
|---------|-------------|
| `first-timer` | New user exploring for first time |
| `power-user` | Tech-savvy expert |
| `mobile-user` | Smartphone user |
| `elderly-user` | Older adult with limitations |
| `impatient-user` | Quick to abandon |
| `screen-reader-user` | Blind user with screen reader |
| `motor-impairment-tremor` | User with motor tremor |
| `low-vision-magnified` | User with low vision |
| `cognitive-adhd` | User with ADHD |
| `dyslexic-user` | User with dyslexia |
| `deaf-user` | Deaf user |
| `color-blind-deuteranopia` | Red-green color blind |

## 25 Cognitive Traits

| Tier | Traits |
|------|--------|
| Core | patience, riskTolerance, comprehension |
| Emotional | frustrationResponse, resilience, confidenceLevel |
| Decision | decisionStyle, satisficing, impulsivity |
| Planning | goalPersistence, taskSwitching, planningHorizon |
| Perception | attentionPattern, visualProcessing, informationFiltering |
| Social | trustCalibration, socialProofSensitivity, authorityResponse |

## Version History

| Version | Features |
|---------|----------|
| v18.18.4 | Browser auto-install fallback for MCPB context |
| v18.18.3 | WebMCP readiness audit, llms.txt endpoint |
| v18.15.0 | AI Friendliness tools, competitive benchmark |
| v16.14.0 | Trait-based value derivation for personas |
| v16.12.0 | Category-aware persona values system |
| v8.3.1 | Cognitive user simulation with abandonment |

## Links

- **GitHub:** https://github.com/alexandriashai/cbrowser
- **Docs:** https://cbrowser.ai/docs
- **npm:** https://www.npmjs.com/package/cbrowser
