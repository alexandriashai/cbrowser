# Session & State Tools

**Stay logged in. Handle Cloudflare. Test sites that fight back.**

These 14 tools manage browser sessions, handle state persistence, and (for Enterprise) bypass bot detection on sites you're authorized to test. Stop re-authenticating between test runs.

---

## When to Use These Tools

- **You're testing authenticated flows** and tired of logging in every time
- **Your tests run against Cloudflare-protected sites** you own
- **Browser crashes are disrupting your automation** and you need recovery
- **You need clean state** between test scenarios

---

## Session Management Tools

### `save_session`

**What it does**: Save the current browser session — cookies, localStorage, sessionStorage, and URL — for later restoration.

**Why you'd use it**: Authenticate once, save the session, reuse it across multiple test runs.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Name for this session |
| `url` | string | No | Navigate to this URL before saving (if not already there) |

**Example**:
```json
{
  "name": "github-logged-in"
}
```

**Note**: Session files include cookies with expiration dates. Sessions may need to be recreated when cookies expire.

---

### `load_session`

**What it does**: Restore a previously saved session, including cookies and storage.

**Why you'd use it**: Start tests already logged in, without going through authentication flow.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Session name to load |
| `navigateToUrl` | boolean | No | Navigate to the saved URL after loading. Default: true |

**Example**:
```json
{
  "name": "github-logged-in"
}
```

---

### `list_sessions`

**What it does**: List all saved sessions with metadata (creation date, domain, expiration).

**Why you'd use it**: See what sessions are available and whether they're still valid.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `detailed` | boolean | No | Include full metadata. Default: false |

---

### `delete_session`

**What it does**: Delete a saved session by name.

**Why you'd use it**: Clean up old or expired sessions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Session to delete |

---

## Browser State Tools

### `reset_browser`

**What it does**: Reset the browser to a clean state — clears all cookies, storage, and cache.

**Why you'd use it**: Ensure test isolation by starting from a blank slate.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `preserveSession` | string | No | Session name to preserve during reset |

---

### `browser_health`

**What it does**: Check if the browser is healthy and responsive.

**Why you'd use it**: Diagnose issues when automation stops responding.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| *none* | | | |

**Returns**:
- Browser status (healthy/unhealthy)
- Memory usage
- Open pages count
- Last activity timestamp
- Any error conditions

---

### `browser_recover`

**What it does**: Attempt to recover from a browser crash or unresponsive state by restarting.

**Why you'd use it**: Automatic recovery when things go wrong.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `preserveState` | boolean | No | Try to restore tabs after restart. Default: true |

**Note**: v11.9.0 added exponential backoff for crash recovery.

---

## Stealth Mode Tools 🔒 Enterprise

> **All stealth tools require CBrowser Enterprise.**
> Stealth mode is constitutional — it only works on domains you've explicitly authorized with signed attestation.
> This prevents misuse while enabling legitimate testing of your own properties.

### `stealth_enable` 🔒 Enterprise

**What it does**: Enable stealth mode to bypass bot detection on authorized domains.

**Why you'd use it**: Test your own sites that use aggressive bot protection.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `authorized_domains` | array | Yes | Domains you're authorized to test |
| `signed_by` | string | Yes | Your email confirming authorization |
| `proxy_server` | string | No | Proxy server URL |
| `proxy_username` | string | No | Proxy authentication |
| `proxy_password` | string | No | Proxy authentication |

**Example**:
```json
{
  "authorized_domains": ["example.com", "staging.example.com"],
  "signed_by": "yourname@example.com"
}
```

**Constitutional Requirement**: Stealth only works on the specific domains you've authorized. Attempts to use it elsewhere fail with a security error.

---

### `stealth_disable` 🔒 Enterprise

**What it does**: Disable stealth mode, returning to standard browser fingerprint.

**Why you'd use it**: When you're done testing protected sites.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| *none* | | | |

---

### `stealth_status` 🔒 Enterprise

**What it does**: Check current stealth configuration and status.

**Why you'd use it**: Verify stealth is configured correctly before testing.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| *none* | | | |

**Returns**: Enabled status, authorized domains, proxy configuration (masked), enterprise version.

---

### `stealth_check` 🔒 Enterprise

**What it does**: Check if a specific action is allowed on a URL under current stealth configuration.

**Why you'd use it**: Verify authorization before attempting an action that might fail.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | Action to check (e.g., "navigate", "fill") |
| `url` | string | Yes | URL where action would occur |

---

### `stealth_diagnose` 🔒 Enterprise

**What it does**: Analyze what bot detection methods a site uses.

**Why you'd use it**: Understand what you're up against before enabling stealth.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to analyze |

**Returns**: Detection methods found (fingerprinting, IP reputation, WAF type, JavaScript challenges).

---

## Cloudflare Tools 🔒 Enterprise

### `cloudflare_detect` 🔒 Enterprise

**What it does**: Detect if a page is showing a Cloudflare challenge or block.

**Why you'd use it**: Know if you need to handle Cloudflare before proceeding.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to check |

**Returns**: Challenge type (JS challenge, Turnstile, block), detection confidence.

---

### `cloudflare_wait` 🔒 Enterprise

**What it does**: Wait for a Cloudflare challenge to complete naturally.

**Why you'd use it**: Let stealth mode handle the challenge while you wait.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL with Cloudflare challenge |
| `timeout` | number | No | Max wait time in seconds. Default: 30 |

**Returns**: Success/failure, final page state, time taken.

---

## Why Stealth Requires Authorization

CBrowser's stealth mode is designed for legitimate testing:

1. **You specify exactly which domains** you're authorized to test
2. **You sign with your email** creating an audit trail
3. **Attempts on unauthorized domains fail** immediately
4. **Enterprise license is required** ensuring accountability

This prevents misuse while enabling:
- Testing your own bot-protected sites
- QA on staging environments with production security
- Security assessments of your own properties

---

## Related Documentation

- [Constitutional Safety](/docs/Constitutional-Safety/) — How CBrowser classifies and limits actions
- [Tools Overview](/docs/Tools-Overview/) — All tools by category

---

*Last updated: v17.6.0*
