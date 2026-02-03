# Authenticate Workflow

Handle login flows for authenticated spaces with stored credentials and 2FA support.

---

## Trigger

- "login to", "authenticate", "sign in"
- Navigation to authenticated page without session
- `bun run Tools/CBrowser.ts auth <site>`

---

## Process

```
┌─────────────────────────────────────────────────────────────┐
│                  AUTHENTICATE WORKFLOW                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. CHECK SESSION                                           │
│     ├─ Existing valid session?                              │
│     │   └─ Yes → Skip to destination                        │
│     └─ No → Continue to login                               │
│                                                             │
│  2. RETRIEVE CREDENTIALS                                    │
│     ├─ Decrypt from vault                                   │
│     ├─ Verify credential exists                             │
│     └─ Load site-specific config                            │
│                                                             │
│  3. NAVIGATE TO LOGIN                                       │
│     ├─ Go to login URL                                      │
│     ├─ Wait for form ready                                  │
│     └─ Screenshot (password fields masked)                  │
│                                                             │
│  4. FILL CREDENTIALS                                        │
│     ├─ Find username field (AI vision)                      │
│     ├─ Fill username                                        │
│     ├─ Find password field                                  │
│     ├─ Fill password (NEVER logged)                         │
│     └─ Click submit                                         │
│                                                             │
│  5. HANDLE 2FA (if required)                                │
│     ├─ Detect 2FA prompt                                    │
│     ├─ TOTP: Generate and enter code                        │
│     ├─ Push/SMS: Notify user, wait                          │
│     └─ Backup codes: Use if configured                      │
│                                                             │
│  6. VERIFY SUCCESS                                          │
│     ├─ Check URL changed from login                         │
│     ├─ Check for error messages                             │
│     ├─ Verify authenticated indicators                      │
│     └─ Save session for reuse                               │
│                                                             │
│  7. NAVIGATE TO DESTINATION                                 │
│     └─ Go to original requested URL                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Usage

### Basic Authentication

```bash
# Login to a site with stored credentials
bun run Tools/CBrowser.ts auth "github"

# Navigate to authenticated page (auto-login if needed)
bun run Tools/CBrowser.ts navigate "https://github.com/settings" --auth github
```

### With Persona

```bash
# Login as a specific persona
bun run Tools/CBrowser.ts auth "blackbook" --persona provider-user
```

### Setup New Site

```bash
# Interactive setup for new authenticated site
bun run Tools/CBrowser.ts auth setup "newsite.com"
# Prompts for:
#   - Login URL
#   - Credential key to use
#   - 2FA configuration
#   - Success indicators
```

---

## Site Configuration

Each authenticated site needs a configuration:

```yaml
# ~/.claude/skills/CBrowser/.memory/sites/github.com.yaml
domain: github.com
credential_key: github
login_url: https://github.com/login

# Field detection (AI-powered with fallbacks)
fields:
  username:
    primary: "semantic:username"
    fallbacks:
      - "aria:textbox/Username"
      - "css:#login_field"
  password:
    primary: "semantic:password"
    fallbacks:
      - "aria:textbox/Password"
      - "css:#password"
  submit:
    primary: "semantic:submit"
    fallbacks:
      - "aria:button/Sign in"
      - "css:input[type='submit']"

# Success detection
success:
  url_not_contains: "/login"
  element_visible: ".avatar"
  element_not_visible: ".flash-error"

# 2FA handling
two_factor:
  enabled: true
  detection: "element_visible:.two-factor"
  method: totp
  totp_key: github_2fa
  code_field: "semantic:verification-code"

# Session management
session:
  save_on_success: true
  name: "github-session"
  expires: 7d
```

---

## 2FA Methods

### TOTP (Time-based One-Time Password)

```yaml
two_factor:
  method: totp
  totp_key: "github_2fa"  # Key in credential vault
  auto_fill: true
```

When TOTP is configured:
1. Detect 2FA prompt
2. Retrieve TOTP secret from vault
3. Generate current code
4. Fill and submit automatically

### SMS / Email

```yaml
two_factor:
  method: sms  # or: email
  auto_fill: false  # Cannot automate
  user_action: prompt
```

When SMS/email:
1. Detect 2FA prompt
2. Notify user: "2FA code sent to your phone"
3. Prompt user to enter code in terminal
4. Fill and submit

### Push Notification

```yaml
two_factor:
  method: push
  timeout: 60s
  user_action: approve_on_device
```

When push:
1. Detect 2FA prompt
2. Notify user: "Approve login on your authenticator app"
3. Wait for approval (poll page)
4. Continue on success

### Backup Codes

```yaml
two_factor:
  backup_codes_key: "github_backup"  # In vault
  use_backup_when: ["totp_fails", "user_requests"]
```

---

## Error Handling

### Invalid Credentials

```
❌ Authentication Failed: Invalid credentials

Possible causes:
  - Password changed
  - Account locked
  - Wrong credential key

Actions:
  1. Update credentials: bun run Tools/CBrowser.ts creds rotate "github"
  2. Check account status manually
```

### 2FA Failed

```
❌ 2FA Failed: Code rejected

Possible causes:
  - TOTP secret out of sync
  - Code expired (try again)
  - Wrong 2FA method

Actions:
  1. Regenerate code and retry
  2. Update TOTP secret: bun run Tools/CBrowser.ts creds add-2fa "github"
  3. Use backup code
```

### CAPTCHA Detected

```
⚠️ CAPTCHA Detected: Human verification required

This workflow cannot bypass CAPTCHA.

Actions:
  1. Complete CAPTCHA manually in browser
  2. Save session: bun run Tools/CBrowser.ts session save "github"
  3. Future logins will use saved session
```

---

## Constitutional Compliance

Authentication is **Red Zone** (verification required):

| Action | Zone | Requirement |
|--------|------|-------------|
| First login to new site | Red | User confirms credentials |
| Reuse saved session | Yellow | Logged, no confirmation |
| Store new credentials | Red | User confirms storage |
| 2FA code entry | Yellow | Logged (not the code) |
| OAuth consent | Red | User must see permissions |

### Audit Trail

```json
{
  "action": "authenticate",
  "site": "github.com",
  "timestamp": "2026-01-31T22:30:00Z",
  "credential_key": "github",
  "result": "success",
  "2fa_used": true,
  "2fa_method": "totp",
  "session_saved": true,
  "screenshot": "/tmp/cognitive/xxx/auth-success.png"
}
```

Note: Credentials and 2FA codes are NEVER in audit trail.

---

## OAuth / SSO Flows

### Google OAuth

```yaml
oauth:
  provider: google
  button_selector: "Continue with Google"
  popup_handling: true
  credential_key: google_oauth
  consent_auto_approve: false  # User must see permissions
```

### Generic SSO

```yaml
sso:
  provider_name: "Okta"
  redirect_to_idp: true
  credential_key: okta_work
  session_handling: follow_redirects
```

OAuth flows:
1. Click SSO button
2. Handle popup/redirect
3. Authenticate with IdP using stored credentials
4. Handle consent screen (pause for user if new permissions)
5. Complete redirect back to original site
6. Verify authentication success
