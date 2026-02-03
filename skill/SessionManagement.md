# Session Management

CBrowser persists browser state between invocations, solving the statelessness problem that makes other tools impractical for AI agents.

## What's Saved

| Data | Description |
|------|-------------|
| Cookies | All cookies for the domain |
| localStorage | Browser local storage |
| sessionStorage | Browser session storage |
| URL | The page URL at save time |
| Viewport | Window dimensions |

---

## Commands

```bash
# Save current session
npx cbrowser session save "my-session"

# Save with URL (navigates first)
npx cbrowser session save "logged-in" --url "https://example.com/dashboard"

# Load a session
npx cbrowser session load "logged-in"

# List all saved sessions
npx cbrowser session list

# Delete a session
npx cbrowser session delete "old-session"
```

---

## Use Cases

### Login Persistence

```bash
# Log in once
npx cbrowser navigate "https://example.com/login"
npx cbrowser fill "email" "user@example.com"
npx cbrowser fill "password" "secret123"
npx cbrowser click "Login"
npx cbrowser session save "logged-in"

# Later, in a new conversation
npx cbrowser session load "logged-in"
npx cbrowser navigate "https://example.com/dashboard"
# Already logged in!
```

### Multi-Account Testing

```bash
# Save different accounts
npx cbrowser session save "admin-account"
npx cbrowser session save "user-account"
npx cbrowser session save "guest-account"

# Switch between them
npx cbrowser session load "admin-account"
```

### CI/CD Integration

```bash
# Set up session in CI
npx cbrowser session load "test-user"
npx cbrowser test-suite tests.txt
```

---

## Storage Location

Sessions are stored in `~/.cbrowser/sessions/`:

```
~/.cbrowser/sessions/
├── logged-in.json
├── admin-account.json
└── guest-account.json
```

---

## Session Format

```json
{
  "name": "logged-in",
  "savedAt": "2024-02-01T12:00:00Z",
  "url": "https://example.com/dashboard",
  "cookies": [...],
  "localStorage": {...},
  "sessionStorage": {...},
  "viewport": { "width": 1920, "height": 1080 }
}
```

---

## Best Practices

1. **Use descriptive names** - `github-logged-in` not `session1`
2. **Don't store sensitive data** - Sessions may contain auth tokens
3. **Refresh periodically** - Sessions can expire
4. **Separate by environment** - `prod-admin`, `staging-admin`
