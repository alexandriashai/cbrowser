> **This documentation is no longer maintained here.**
>
> For the latest version, please visit: **[Utility Tools](https://cbrowser.ai/docs/Tools-Utilities)**

---

# Utility Tools

**Diagnostics, health checks, and infrastructure.**

These 6 tools handle diagnostics, self-healing statistics, agent-readiness audits, and API key management (Enterprise). The tools that keep everything else running smoothly.

---

## Tools

### `status`

**What it does**: Get comprehensive CBrowser environment diagnostics.

**Why you'd use it**: Debug configuration issues, verify installation, check capabilities.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| *none* | | | |

**Returns**:
- CBrowser version
- Browser backend (Chromium/Firefox/WebKit)
- Data directory location
- Enterprise availability
- Authentication status
- Recent activity summary

---

### `heal_stats`

**What it does**: Get statistics on the self-healing selector cache — how many selectors have been healed, hit rate, storage usage.

**Why you'd use it**: Understand how well self-healing is working and whether the cache needs maintenance.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `detailed` | boolean | No | Include per-domain breakdown. Default: false |

**Returns**:
- Total healed selectors
- Cache hit rate
- Most frequently healed selectors
- Cache age and size

---

### `agent_ready_audit`

**What it does**: Audit a website for AI-agent friendliness. Scores how easily an autonomous AI could navigate and interact with the site.

**Why you'd use it**: Know if your site is ready for the AI agent future. Sites that score well are also easier for humans to use.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to audit |
| `depth` | number | No | Pages to crawl. Default: 5 |

**Example**:
```json
{
  "url": "https://example.com",
  "depth": 10
}
```

**Returns**:
- Overall score (0-100)
- Grade (A-F)
- Category scores:
  - Semantic HTML quality
  - ARIA completeness
  - Consistent navigation
  - Clear form labels
  - Predictable interactive elements
  - Error message clarity
- Specific recommendations

### Scoring

| Grade | Score | Meaning |
|-------|-------|---------|
| A | 90-100 | Excellent agent compatibility |
| B | 80-89 | Good, minor improvements possible |
| C | 70-79 | Acceptable, some friction for agents |
| D | 60-69 | Poor, significant navigation challenges |
| F | <60 | Hostile to automated interaction |

---

## API Key Management 🔒 Enterprise

> **All API key tools require CBrowser Enterprise.**
> API keys enable autonomous cognitive journeys that make AI decisions without human orchestration.

### `set_api_key` 🔒 Enterprise

**What it does**: Store an Anthropic API key in encrypted session memory for autonomous journey execution.

**Why you'd use it**: Enable `cognitive_journey_autonomous` and other features that require AI decision-making.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `api_key` | string | Yes | Your Anthropic API key (starts with `sk-ant-`) |

**Security**: Keys are stored in memory only, not persisted to disk. They're cleared when the session ends.

---

### `clear_api_key` 🔒 Enterprise

**What it does**: Remove the stored API key from session memory.

**Why you'd use it**: Clear credentials when you're done or before switching accounts.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| *none* | | | |

---

### `api_key_status` 🔒 Enterprise

**What it does**: Check if an API key is currently stored without revealing the key itself.

**Why you'd use it**: Verify setup before running autonomous operations.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| *none* | | | |

**Returns**:
- Key stored: yes/no
- Key prefix (first 8 chars, masked)
- When stored (timestamp)

---

### `get_api_key_prompt` 🔒 Enterprise

**What it does**: Get instructions for obtaining an Anthropic API key.

**Why you'd use it**: Help users who need to set up API access.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| *none* | | | |

**Returns**: Step-by-step instructions for creating an Anthropic account and generating an API key.

---

## Demo vs Enterprise

| Tool | Demo | Enterprise |
|------|------|------------|
| `status` | ✅ | ✅ |
| `heal_stats` | ✅ | ✅ |
| `agent_ready_audit` | ✅ | ✅ |
| `set_api_key` | ❌ | ✅ |
| `clear_api_key` | ❌ | ✅ |
| `api_key_status` | ❌ | ✅ |
| `get_api_key_prompt` | ❌ | ✅ |

---

## Related Documentation

- [Tools Overview](/docs/Tools-Overview/) — All tools by category
- [MCP Server](/docs/MCP-Server/) — Running CBrowser locally
- [Remote MCP Server](/docs/Remote-MCP-Server/) — Cloud deployment

---

*Last updated: v17.6.0*
