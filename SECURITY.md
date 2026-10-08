# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 18.x    | :white_check_mark: |
| 17.x    | :x:                |
| < 17.0  | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in CBrowser, please report it responsibly:

1. **Do NOT open a public GitHub issue**
2. Email security concerns to: alexandria.shai.eden@gmail.com
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 1 week
- **Resolution**: Depends on severity (critical: 72 hours, high: 2 weeks)

## Security Architecture

CBrowser uses six layers of defense in depth. Full details in the [Security Whitepaper](https://cbrowser.ai/docs/security_whitepaper).

### Constitutional Safety (Built-in)

Every browser action is classified into one of four risk zones:

| Zone | Actions | Behavior |
|------|---------|----------|
| GREEN | Navigate, read, screenshot | Auto-execute |
| YELLOW | Click buttons, fill forms | Log and proceed |
| RED | Submit, delete, purchase | Requires verification |
| BLACK | Bypass auth, inject scripts | Never executes |

**How red is decided:** by the element an action would activate, not by how it is addressed. The same "Delete account" button is refused by its label, its id, its test id or a structural path. A click on a container is judged at the point it lands, beneath fixed bars and overlays and into open shadow roots, slots and same-origin frames, and the click is sent to that judged point. A refused click is never retried with a "healed" selector. Gated: `click`, `smart_click`, hover-click and the daemon's click; `press_key`, `type_text` and `keyboard` (Enter, a typed newline, or Space on the focused control, followed into shadow roots and same-origin frames, and Enter in a field whose form submits one); a `drag` whose press and release share a control; and the NL test runner's `click at X, Y`. `force: true` (MCP) or `--force` (CLI) proceeds and reports the zone.

Not judged, by design: typing into or clicking a text field, and choosing a value (checkbox, radio, switch, select), because the submit that commits them is judged when it is clicked; a link's address (a link to `/buy` is navigation); and an element with no click affordance (no role, handler attribute, tabindex or pointer cursor). Not gated: cognitive journeys and other engines that choose their own clicks, and `evaluate_script`. Known limits: labels inside closed shadow roots or drawn by CSS, controls inside cross-origin frames, a confirmation button with neutral text ("Confirm", "OK") inside a dialog, and keyword false positives ("Purchase history", "Buyer protection"). Classification uses English keyword patterns and falls back to the selector text when the element cannot be read.

Classification is code-level and immutable. The AI cannot override it.

### Authentication

- **OAuth 2.1 PKCE** via login form (email + password)
- **API key auth** (`cbk_` keys with SHA-256 hashing)
- **Tier-based access** — tools gated by Free/Pro/Enterprise tier
- Keys never stored in plaintext; only hashes persisted

### Rate Limiting

- Per-account, tier-based rate limits
- Free: 100 req/hr, Pro: 1,000 req/hr, Enterprise: unlimited
- Burst allowance for initial requests

### Session Isolation

- Per-session browser instances with memory limits (800MB)
- Max 20 concurrent sessions
- Idle timeout (300s) with automatic cleanup
- Domain-scoped tool access — tools restricted to registered domains

### Credit System

- Per-tool credit costs (1-10 credits per call)
- Domain-scoped credit deduction
- Blocking denial when credits exhausted (no silent failures)

### Audit Trail

- Every tool call logged with account, domain, tool name, and timestamp
- Tool results auto-saved for analytics dashboard
- Score snapshots for historical tracking

## Discovery vs Action Surface

- `tools/list` and `initialize` are public (no auth required)
- `tools/call` requires authentication
- This follows the MCP convention: discovery is open, execution is gated

## Scope

This security policy covers:
- The CBrowser npm package
- The MCP server implementations (demo and enterprise)
- The cbrowser.ai website and CMS
- Official documentation

Third-party integrations and forks are not covered.

## Full Documentation

- [Security Whitepaper](https://cbrowser.ai/docs/security_whitepaper)
- [Constitutional Safety](https://cbrowser.ai/docs/constitutional-safety)
