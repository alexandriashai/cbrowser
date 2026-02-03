# Credential Management

CBrowser includes a secure credential vault for storing login credentials and 2FA secrets.

## Security

- Credentials are encrypted at rest
- Never logged in plain text
- Separate from session data
- Master password protection (optional)

---

## Commands

```bash
# Add credentials for a site
npx cbrowser creds add "github"
# Prompts for username and password

# List stored credentials (shows names only)
npx cbrowser creds list

# Add TOTP secret for 2FA
npx cbrowser creds add-2fa "github"
# Prompts for TOTP secret

# Authenticate to a site
npx cbrowser auth "github"
# Uses stored credentials to log in

# Delete credentials
npx cbrowser creds delete "github"
```

---

## Credential Flow

### Adding Credentials

```bash
$ npx cbrowser creds add "mysite"
Site: mysite
Username: user@example.com
Password: ********
✓ Credentials saved for mysite
```

### Using Credentials

```bash
$ npx cbrowser auth "mysite"
Navigating to https://mysite.com/login...
Filling username...
Filling password...
Clicking login button...
✓ Logged in successfully
```

---

## 2FA Support

### Adding TOTP Secret

```bash
$ npx cbrowser creds add-2fa "github"
TOTP Secret (base32): JBSWY3DPEHPK3PXP
✓ 2FA secret saved for github
```

### Auto-Fill 2FA Code

When CBrowser detects a 2FA prompt during authentication, it automatically:

1. Generates the current TOTP code
2. Fills the 2FA input field
3. Submits the form

---

## Storage Location

Credentials are stored in `~/.cbrowser/credentials.enc` (encrypted).

---

## Integration with Sessions

For sites that don't change auth frequently:

```bash
# Log in once with credentials
npx cbrowser auth "github"

# Save the logged-in session
npx cbrowser session save "github-logged-in"

# Later, just load the session (faster)
npx cbrowser session load "github-logged-in"
```

---

## Best Practices

1. **Use sessions when possible** - Faster than re-authenticating
2. **Store 2FA secrets** - Enables fully automated login
3. **Use unique names** - `github-work`, `github-personal`
4. **Rotate credentials** - Delete and re-add periodically
