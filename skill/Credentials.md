# Credential Vault

Secure credential storage for authenticated browser automation.

---

## Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CREDENTIAL VAULT                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ User Input  │ →  │ Encryption  │ →  │ Secure      │     │
│  │ (one-time)  │    │ AES-256-GCM │    │ Storage     │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ Auth Flow   │ ←  │ Decryption  │ ←  │ Retrieval   │     │
│  │ (in-memory) │    │ (runtime)   │    │ (key req)   │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                                                             │
│  ⛔ NEVER: Logged | Displayed | Transmitted | Cached       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Commands

### Store Credentials

```bash
# Interactive (secure - credentials never shown)
bun run Tools/CBrowser.ts creds add "github"
# Prompts for username/password securely

# From environment variables (for CI/CD)
CRED_USER=myuser CRED_PASS=mypass bun run Tools/CBrowser.ts creds add "github" --from-env
```

### List Stored Credentials

```bash
bun run Tools/CBrowser.ts creds list

# Output (passwords NEVER shown):
# Stored Credentials:
#   github        (user: octocat, stored: 2026-01-31)
#   blackbook     (user: provider@example.com, stored: 2026-01-30)
#   amazon        (user: buyer@email.com, stored: 2026-01-28)
```

### Delete Credentials

```bash
bun run Tools/CBrowser.ts creds delete "github"
```

### Rotate Credentials

```bash
bun run Tools/CBrowser.ts creds rotate "github"
# Prompts for new password, keeps username
```

---

## Storage

Credentials stored in:
```
~/.claude/skills/CBrowser/.vault/
├── credentials.enc      # Encrypted credential store
├── key.enc              # Encrypted master key (machine-bound)
└── manifest.json        # Metadata (no secrets)
```

### Encryption Details

| Component | Algorithm | Notes |
|-----------|-----------|-------|
| Master Key | PBKDF2 + machine ID | Derived from hardware fingerprint |
| Credentials | AES-256-GCM | Authenticated encryption |
| At Rest | Always encrypted | Never plaintext on disk |
| In Memory | Cleared after use | No persistent memory |

---

## Authentication Patterns

### Username/Password

```yaml
pattern: username-password
fields:
  username:
    selectors: ["semantic:username", "semantic:email", "aria:textbox/Username"]
  password:
    selectors: ["semantic:password", "aria:textbox/Password"]
  submit:
    selectors: ["semantic:submit", "aria:button/Sign in", "aria:button/Log in"]
```

### OAuth/SSO

```yaml
pattern: oauth
providers:
  - google: "Continue with Google"
  - github: "Sign in with GitHub"
  - apple: "Sign in with Apple"
flow:
  1. Click provider button
  2. Handle popup/redirect
  3. Use stored OAuth credentials
  4. Complete authorization
  5. Return to original site
```

### Two-Factor Authentication

```yaml
pattern: 2fa
methods:
  totp:
    # TOTP secrets can be stored (optional, user must explicitly enable)
    secret_storage: optional
    auto_generate: true
  sms:
    # Cannot automate - notify user
    action: pause_and_notify
  email:
    # Can check email if configured
    action: check_email_for_code
  authenticator_app:
    # Push notification - notify user
    action: pause_and_notify
```

---

## Site-Specific Configurations

Store login flow configurations per site:

```json
{
  "site": "github.com",
  "credential_key": "github",
  "login_url": "https://github.com/login",
  "flow": [
    {"action": "fill", "target": "semantic:username", "value": "$username"},
    {"action": "fill", "target": "semantic:password", "value": "$password"},
    {"action": "click", "target": "semantic:submit"},
    {"action": "wait", "for": "url_contains", "value": "github.com/"}
  ],
  "success_indicators": [
    "url_not_contains:/login",
    "element_visible:avatar"
  ],
  "2fa": {
    "enabled": true,
    "method": "totp",
    "secret_key": "github_2fa"
  }
}
```

---

## Constitutional Compliance

Credential operations are **Red Zone** (verification required):

| Action | Zone | Verification |
|--------|------|--------------|
| Store credentials | Red | Confirm storage |
| Use credentials | Yellow | Log usage (not values) |
| Delete credentials | Red | Confirm deletion |
| Export credentials | Black | Never allowed |

### What is NEVER Done

- ❌ Credentials logged to any file
- ❌ Credentials shown in output
- ❌ Credentials transmitted externally
- ❌ Credentials stored unencrypted
- ❌ Passwords included in screenshots
- ❌ Credentials exported or backed up in plaintext

---

## Usage in Workflows

### With Navigate

```bash
bun run Tools/CBrowser.ts navigate "https://github.com/settings" --auth github
# Automatically logs in using stored credentials if needed
```

### With Personas

```yaml
persona: "power-user"
credentials: "github-premium"
# Persona uses specific credential set
```

### In Test Scenarios

```yaml
scenario: "checkout-flow"
steps:
  - login:
      credentials: "amazon-test-buyer"
  - navigate: "/cart"
  - action: "complete checkout"
```

---

## Troubleshooting

### "Credential not found"

```bash
# List available credentials
bun run Tools/CBrowser.ts creds list

# Add missing credential
bun run Tools/CBrowser.ts creds add "site-name"
```

### "Authentication failed"

1. Verify credentials are correct: re-add with `creds add`
2. Check if site changed login flow: update site config
3. Check for CAPTCHA: may need manual intervention
4. Check for 2FA: ensure TOTP secret is stored

### "2FA required"

```bash
# Add TOTP secret for automatic 2FA
bun run Tools/CBrowser.ts creds add-2fa "github"
# Prompts for TOTP secret securely
```
