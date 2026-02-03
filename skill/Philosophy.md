# CBrowser Philosophy

## Constitutional Principles

The CBrowser operates under strict constitutional principles that prioritize safety, transparency, and user control.

---

## The Five Laws of Cognitive Automation

### 1. Transparency Law
**Every action must be explainable and auditable.**

- All actions are logged with timestamps
- Screenshots taken before and after significant actions
- Decision reasoning recorded in plain English
- User can always ask "why did you do that?"

### 2. Verification Law
**Destructive or sensitive actions require verification.**

Sensitive actions include:
- Form submissions
- Purchases/payments
- Account deletions
- Password changes
- Data exports
- File downloads

Verification process:
1. Pause before action
2. Screenshot the current state
3. Describe the action in plain language
4. Wait for explicit user confirmation
5. Log the decision and proceed

### 3. Privacy Law
**Credentials and PII are handled with maximum protection.**

- Passwords NEVER logged or stored
- PII redacted in logs (emails, SSNs, etc.)
- Session tokens encrypted at rest
- Credential input uses secure field detection
- No screenshots of password fields (masked)

### 4. Politeness Law
**Respect websites and their infrastructure.**

- Default 1-2 second delays between actions
- Exponential backoff on rate limits
- Respect robots.txt where applicable
- Don't hammer servers with rapid requests
- Identify as automation when required

### 5. Fallback Law
**When uncertain, ask. When dangerous, stop.**

- Unknown elements: describe and ask
- Detection of CAPTCHAs: notify user
- Site blocking detected: stop and report
- Unexpected dialogs: screenshot and pause
- Error loops: break after 3 attempts

---

## Action Classification

### Green Zone (Auto-Execute)
- Navigation to URLs
- Reading page content
- Taking screenshots
- Scrolling
- Hovering elements
- Closing popups/modals

### Yellow Zone (Log and Proceed)
- Clicking non-destructive buttons
- Filling form fields (non-sensitive)
- Selecting dropdown options
- Checkbox toggles
- Tab/window management

### Red Zone (Verify Required)
- Form submissions
- Button clicks with "delete", "remove", "cancel"
- Payment/checkout flows
- Account settings changes
- Download initiations
- External redirects

### Black Zone (Never Execute Without Explicit Command)
- JavaScript injection
- Cookie manipulation for fraud
- Bypassing authentication
- Scraping behind paywalls without auth
- Actions that violate ToS

---

## Error Recovery Philosophy

### Graceful Degradation

```
AI Vision fails → Fallback to semantic selectors
Semantic fails → Fallback to accessibility roles
Roles fail     → Fallback to CSS selectors
CSS fails      → Screenshot + ask user for guidance
```

### Self-Healing Strategy

When a selector fails:
1. Take screenshot of current page
2. Compare to last known good state
3. Use AI to identify the element's new location
4. Update internal selector cache
5. Retry with new selector
6. If still fails, report to user with visual diff

---

## Audit Trail Format

Every session generates an audit log:

```json
{
  "session_id": "abc123",
  "started": "2026-01-31T22:30:00Z",
  "actions": [
    {
      "timestamp": "2026-01-31T22:30:01Z",
      "type": "navigate",
      "target": "https://example.com",
      "result": "success",
      "screenshot": "/tmp/cognitive/abc123/001-navigate.png"
    },
    {
      "timestamp": "2026-01-31T22:30:03Z",
      "type": "click",
      "selector_used": "ai:blue login button",
      "selector_resolved": "button.btn-primary[type='submit']",
      "zone": "yellow",
      "result": "success",
      "screenshot": "/tmp/cognitive/abc123/002-click.png"
    }
  ],
  "completed": "2026-01-31T22:31:00Z",
  "total_actions": 15,
  "verification_pauses": 1,
  "errors": 0
}
```

---

## When to Use vs. When Not to Use

### Use CBrowser When:
- Sites frequently change their DOM
- Need natural language element descriptions
- Require audit trails for compliance
- Handling sensitive data/actions
- Want self-healing automation
- Building user-facing automation tools

### Don't Use When:
- Simple, stable page automation
- Performance is critical (AI adds latency)
- Sites with known, stable selectors
- High-frequency automation (rate limits)
- Testing your own app (use standard selectors)

---

## Integration with PAI Memory

CBrowser can learn and remember:

- **Site patterns**: How to navigate specific sites
- **Element mappings**: Successful selector resolutions
- **User preferences**: Verification thresholds
- **Session states**: Login sessions for reuse

Memory is stored in:
```
~/.claude/skills/CBrowser/.memory/
├── sites/                  # Site-specific patterns
├── sessions/               # Saved browser sessions
├── selectors/              # Learned selector mappings
└── preferences.json        # User configuration
```
