# CBrowser Constitutional Principles

## The Five Laws of Browser Automation

### 1. Transparency
Every action is logged with timestamps and screenshots. No hidden operations.

### 2. Verification
Destructive actions (submit, delete, purchase) require explicit confirmation before execution.

### 3. Privacy
Credentials are never logged. PII is automatically redacted from logs and screenshots.

### 4. Politeness
Respect rate limits. Add reasonable delays between actions. Don't overwhelm servers.

### 5. Fallback
When uncertain, ask the user. When dangerous, stop immediately.

---

## Action Zones

| Zone | Risk Level | Actions | Behavior |
|------|------------|---------|----------|
| 🟢 **Green** | Safe | Navigate, read, screenshot, scroll, extract | Auto-execute without confirmation |
| 🟡 **Yellow** | Moderate | Click buttons, fill forms, select options | Log action and proceed |
| 🔴 **Red** | High | Submit forms, delete content, make purchases, change account settings | **Requires explicit verification** |
| ⬛ **Black** | Prohibited | Bypass authentication, violate ToS, inject scripts, access unauthorized areas | **Never execute under any circumstances** |

---

## Zone Classification Examples

### Green Zone (Auto-Execute)
- `navigate "https://example.com"`
- `screenshot`
- `scroll down`
- `extract "all product prices"`

### Yellow Zone (Log and Proceed)
- `click "Add to Cart"`
- `fill "email" "user@example.com"`
- `select "Medium" from "size dropdown"`

### Red Zone (Requires Verification)
- `click "Place Order"`
- `click "Delete Account"`
- `click "Confirm Purchase"`
- `submit form`

### Black Zone (Never Execute)
- Attempts to bypass CAPTCHA
- Injecting JavaScript into pages
- Accessing admin panels without authorization
- Scraping personal data without consent

---

## Verification Protocol

When a Red Zone action is requested:

1. **Pause execution**
2. **Display warning** with action details
3. **Require explicit confirmation** ("yes", "confirm", or `--force` flag)
4. **Log the confirmation** with timestamp
5. **Execute only after confirmation**

```bash
# Red zone action - requires --force
npx cbrowser click "Delete All Data" --force
```

---

## Privacy Protections

### Automatic Redaction
- Passwords are replaced with `[REDACTED]`
- Credit card numbers are masked
- Social security numbers are hidden
- Email addresses in sensitive contexts

### Credential Vault
- Credentials stored encrypted at rest
- Never logged in plain text
- Separate from session data

---

## Rate Limiting

CBrowser automatically:
- Adds 100-500ms delays between actions
- Respects `robots.txt` when configured
- Backs off on 429 (Too Many Requests) responses
- Limits concurrent requests per domain
