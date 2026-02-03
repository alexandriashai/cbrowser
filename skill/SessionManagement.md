# Session Management

## Overview

CBrowser maintains persistent browser sessions that survive across invocations. This enables:

- **Login persistence**: Stay logged in between commands
- **State preservation**: Keep form data, cookies, localStorage
- **Faster execution**: No browser startup overhead
- **Context continuity**: Remember where you left off

---

## Session Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                     SESSION LIFECYCLE                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Command]  →  ensureSession()  →  Session exists?          │
│                                        │                    │
│                    ┌───────────────────┴───────────────┐    │
│                    ↓                                   ↓    │
│               [Yes: Reuse]                      [No: Create] │
│                    │                                   │    │
│                    └───────────────┬───────────────────┘    │
│                                    ↓                        │
│                             [Execute Command]               │
│                                    │                        │
│                                    ↓                        │
│                            [Update Timestamp]               │
│                                    │                        │
│                    ┌───────────────┴───────────────┐        │
│                    ↓                               ↓        │
│            [30min Idle?]                    [Keep Active]   │
│                    │                                        │
│                    ↓                                        │
│             [Auto-Cleanup]                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Commands

### Save Session

Capture current session state for later reuse:

```bash
bun run Tools/CBrowser.ts session save "amazon-logged-in"
```

Saves:
- Cookies
- localStorage
- sessionStorage
- Current URL
- Viewport size

### Load Session

Restore a previously saved session:

```bash
bun run Tools/CBrowser.ts session load "amazon-logged-in"
```

### List Sessions

See all saved sessions:

```bash
bun run Tools/CBrowser.ts session list
```

Output:
```
Saved Sessions:
  amazon-logged-in    (2026-01-31, amazon.com)
  github-dev          (2026-01-30, github.com)
  blackbook-admin     (2026-01-29, blackbook.reviews)
```

### Delete Session

Remove a saved session:

```bash
bun run Tools/CBrowser.ts session delete "old-session"
```

---

## Storage Location

Sessions are stored in:
```
~/.claude/skills/CBrowser/.memory/sessions/
├── amazon-logged-in.json
├── github-dev.json
└── ...
```

Session format:
```json
{
  "name": "amazon-logged-in",
  "created": "2026-01-31T22:30:00Z",
  "lastUsed": "2026-01-31T22:35:00Z",
  "domain": "amazon.com",
  "cookies": [...],
  "localStorage": {...},
  "sessionStorage": {...},
  "url": "https://amazon.com/account",
  "viewport": {"width": 1280, "height": 720}
}
```

---

## Privacy & Security

### What IS Stored

- Cookies (including auth tokens)
- Web storage data
- URL and viewport

### What is NOT Stored

- Passwords (never logged or saved)
- Form input values with passwords
- Credit card numbers
- Other PII detected in forms

### Encryption

Session files are encrypted at rest using:
- AES-256-GCM encryption
- Key derived from machine-specific identifier
- Sessions only usable on the machine that created them

### Best Practices

1. **Name sessions descriptively**: `site-purpose` (e.g., `github-work`)
2. **Don't share session files**: They contain auth tokens
3. **Delete unused sessions**: `session delete old-session`
4. **Rotate sessions periodically**: Delete and recreate monthly

---

## Auto-Cleanup

Sessions are automatically cleaned up:

| Trigger | Action |
|---------|--------|
| 30 minutes idle | Active session closed |
| 30 days unused | Saved session deleted |
| Browser crash | Session marked invalid |
| Domain mismatch | Session not loaded |

---

## Integration with Workflows

### Navigate Workflow

```markdown
# Check for saved session
→ Session exists for domain?
  → Yes: Load session, navigate
  → No: Fresh navigation
→ Save session if login detected
```

### Interact Workflow

```markdown
# Use active session
→ Ensure session active
→ Execute interactions
→ Update session timestamp
→ Save if significant state change
```

---

## Troubleshooting

### Session Won't Load

1. Check session exists: `session list`
2. Verify domain matches: Session for `amazon.com` won't load on `amazon.co.uk`
3. Try recreating: Delete and save new session

### Session Expired

Auth tokens may expire even if session file exists:
1. Delete old session: `session delete name`
2. Navigate and login fresh
3. Save new session: `session save name`

### Cookies Not Persisting

Some sites use short-lived cookies:
1. Check if site supports "Remember Me"
2. Enable that option before saving session
3. Some sites require re-auth regardless
