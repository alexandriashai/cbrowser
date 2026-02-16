> **This documentation is no longer maintained here.**
>
> For the latest version, please visit: **[MCP Server Integration](https://cbrowser.ai/docs/MCP-INTEGRATION)**

---

# MCP Server Integration

CBrowser provides full Model Context Protocol (MCP) integration for Claude Desktop and claude.ai.

## Quick Setup

### Local MCP (Claude Desktop)

Add to your `claude_desktop_config.json`:

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

### Remote MCP (claude.ai)

**Public Demo Server** (rate-limited, for evaluation):
```
URL: https://demo.cbrowser.ai/mcp
Rate limit: 5 requests/minute, burst of 10
```

**Deploy Your Own:**
```bash
# Default (no auth)
npx cbrowser mcp-remote

# With API key
MCP_API_KEY=your-secret npx cbrowser mcp-remote

# With Auth0 OAuth
AUTH0_DOMAIN=your-tenant.auth0.com \
AUTH0_AUDIENCE=https://your-server/ \
npx cbrowser mcp-remote

# Custom port
PORT=8080 npx cbrowser mcp-remote
```

## All 83 MCP Tools

### Navigation (5 tools)

| Tool | Description |
|------|-------------|
| `navigate` | Navigate to URL with intelligent wait detection |
| `screenshot` | Capture page screenshot |
| `extract` | Extract structured data (links, headings, forms, images, text) |
| `cloudflare_detect` | Detect Cloudflare protection |
| `cloudflare_wait` | Wait for Cloudflare challenge completion |

### Interaction (4 tools)

| Tool | Description |
|------|-------------|
| `click` | Click element by selector or description |
| `smart_click` | Self-healing click with retry and selector recovery |
| `fill` | Fill form input with value |
| `scroll` | Scroll page or element |

### Testing (3 tools)

| Tool | Description |
|------|-------------|
| `nl_test_file` | Run natural language test suite from file |
| `nl_test_inline` | Run natural language tests from inline content |
| `repair_test` | AI-powered test repair for broken tests |
| `detect_flaky_tests` | Identify unreliable tests by running multiple times |

### Visual Testing (6 tools)

| Tool | Description |
|------|-------------|
| `visual_baseline` | Capture visual baseline for URL |
| `visual_regression` | Compare current page against baseline |
| `cross_browser_test` | Test across Chrome, Firefox, Safari |
| `cross_browser_diff` | Quick metrics comparison across browsers |
| `responsive_test` | Test across viewport sizes |
| `ab_comparison` | Compare two URLs visually |

### Cognitive Simulation (3 tools)

| Tool | Description |
|------|-------------|
| `cognitive_journey_init` | Initialize cognitive user simulation |
| `cognitive_journey_update_state` | Update mental state during journey |
| `compare_personas` | Compare experience across personas |

### Persona Questionnaire (3 tools) - *New in v16.6.0*

| Tool | Description |
|------|-------------|
| `persona_questionnaire_get` | Generate questionnaire questions for custom persona |
| `persona_questionnaire_build` | Build trait profile from questionnaire answers |
| `persona_trait_lookup` | Look up behaviors for specific trait value |

### Analysis (5 tools)

| Tool | Description |
|------|-------------|
| `hunt_bugs` | Autonomous bug hunting and issue discovery |
| `chaos_test` | Inject failures and test resilience |
| `agent_ready_audit` | Analyze site for AI-agent friendliness |
| `competitive_benchmark` | Compare UX across competitor sites |
| `empathy_audit` | Simulate users with disabilities |

### Performance (3 tools)

| Tool | Description |
|------|-------------|
| `perf_baseline` | Capture performance baseline |
| `perf_regression` | Detect performance regression |
| `list_baselines` | List all saved baselines |

### Stealth (5 tools)

| Tool | Description |
|------|-------------|
| `stealth_enable` | Enable stealth mode |
| `stealth_disable` | Disable stealth mode |
| `stealth_status` | Check current stealth status |
| `stealth_check` | Check for bot detection |
| `stealth_diagnose` | Diagnose detection issues |

### Utility (4 tools)

| Tool | Description |
|------|-------------|
| `save_session` | Save browser session (cookies, storage) |
| `load_session` | Load saved session |
| `list_sessions` | List saved sessions |
| `delete_session` | Delete saved session |

### Persona (4 tools)

| Tool | Description |
|------|-------------|
| `list_cognitive_personas` | List all available personas |
| `find_element_by_intent` | AI-powered semantic element finding |
| `dismiss_overlay` | Dismiss modal overlays (cookies, popups) |
| `status` | Get CBrowser environment status |

## Tool Usage Examples

### Cognitive Journey with Custom Persona

```
// Step 1: Get questionnaire
persona_questionnaire_get({ comprehensive: false })

// Step 2: Build traits from answers
persona_questionnaire_build({
  answers: { patience: 0.25, curiosity: 0.75 },
  name: "anxious-explorer"
})

// Step 3: Run journey with custom persona
cognitive_journey_init({
  persona: "anxious-explorer",
  startUrl: "https://example.com",
  goal: "complete checkout"
})
```

### Agent-Ready Audit

```
agent_ready_audit({ url: "https://example.com" })

// Returns:
// - Overall score (0-100)
// - Grade (A-F)
// - Findability, stability, accessibility scores
// - Issues with remediation suggestions
```

### Visual Regression

```
// Capture baseline
visual_baseline({ url: "https://example.com", name: "homepage" })

// Later, compare against baseline
visual_regression({ url: "https://staging.example.com", baselineName: "homepage" })
```

### Competitive Benchmark

```
competitive_benchmark({
  sites: [
    "https://yoursite.com",
    "https://competitor-a.com",
    "https://competitor-b.com"
  ],
  goal: "sign up for free trial",
  persona: "first-timer"
})
```

## Authentication Methods

### API Key Authentication

For Claude Code CLI and scripts:

```bash
# Bearer token
curl -H "Authorization: Bearer your-api-key" https://your-server/mcp

# X-API-Key header
curl -H "X-API-Key: your-api-key" https://your-server/mcp
```

Configure multiple keys:
```bash
MCP_API_KEYS=key1,key2,key3 npx cbrowser mcp-remote
```

### Auth0 OAuth

For claude.ai web interface:

1. Set up Auth0 tenant
2. Configure environment:
   ```bash
   AUTH0_DOMAIN=your-tenant.auth0.com
   AUTH0_AUDIENCE=https://your-server/
   ```
3. In claude.ai: Settings > Integrations > Custom Connectors
4. Add connector URL and complete OAuth flow

Features:
- OAuth 2.1 with PKCE
- JWT and opaque token validation
- 30-minute token caching
- Protected Resource Metadata via `/.well-known/oauth-protected-resource`

### Dual Authentication

Both OAuth and API keys can be enabled simultaneously for maximum flexibility.

## Server Endpoints

| Endpoint | Description | Auth |
|----------|-------------|------|
| `/mcp` | MCP protocol endpoint | Required if configured |
| `/health` | Health check | Always open |
| `/info` | Server info | Always open |
| `/.well-known/oauth-protected-resource` | OAuth metadata | If Auth0 configured |

## Docker Deployment

```yaml
# docker-compose.yml
version: "3.8"
services:
  cbrowser-mcp:
    image: ghcr.io/alexandriashai/cbrowser:latest
    command: ["mcp-remote"]
    ports:
      - "3000:3000"
    environment:
      - MCP_API_KEY=${MCP_API_KEY}
      - PORT=3000
```

## Troubleshooting

### Connection Issues

1. Verify server is running: `curl http://localhost:3000/health`
2. Check authentication: `curl -H "Authorization: Bearer key" http://localhost:3000/info`
3. Verify MCP endpoint: `curl -X POST http://localhost:3000/mcp`

### Claude Desktop Not Detecting Tools

1. Restart Claude Desktop after config changes
2. Verify config path: `~/.config/claude/claude_desktop_config.json`
3. Check npx is in PATH
4. Verify cbrowser is installed: `npx cbrowser --version`

### Rate Limiting on Demo Server

The demo server is rate-limited for evaluation. For production use:
1. Deploy your own server
2. Use API key authentication
3. Configure appropriate rate limits
