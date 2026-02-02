# Auth0 OAuth Setup for CBrowser MCP Server

This guide walks you through setting up Auth0 authentication for the CBrowser Remote MCP Server, enabling integration with claude.ai's custom connector feature.

## Quick Start

### 1. Create Auth0 Account

1. Go to [auth0.com](https://auth0.com) and sign up (free tier works)
2. Create a new tenant (e.g., `cbrowser` or use your existing tenant)

### 2. Create an API

1. Go to **Applications → APIs**
2. Click **+ Create API**
3. Configure:
   - **Name:** `CBrowser MCP API`
   - **Identifier:** `https://cbrowser-mcp.wyldfyre.ai` (your server URL)
   - **Signing Algorithm:** RS256
4. Click **Create**

### 3. Create an Application (Static Registration)

For secure integration, we use static client registration:

1. Go to **Applications → Applications**
2. Click **+ Create Application**
3. Configure:
   - **Name:** `Claude.ai MCP Client`
   - **Type:** Regular Web Application
4. Click **Create**
5. In Settings tab, configure:
   - **Allowed Callback URLs:**
     ```
     https://claude.ai/api/mcp/auth_callback,
     https://claude.com/api/mcp/auth_callback
     ```
   - **Allowed Web Origins:** `https://claude.ai, https://claude.com`
6. Save Changes
7. Note down:
   - **Domain** (e.g., `your-tenant.auth0.com`)
   - **Client ID**
   - **Client Secret**

### 4. Configure MCP Server

Add these environment variables to your systemd service:

```bash
sudo nano /etc/systemd/system/cbrowser-mcp.service
```

Add under `[Service]`:

```ini
Environment=AUTH0_DOMAIN=your-tenant.auth0.com
Environment=AUTH0_AUDIENCE=https://cbrowser-mcp.wyldfyre.ai
Environment=AUTH0_CLIENT_ID=your-client-id
```

Reload and restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart cbrowser-mcp
```

### 5. Verify Setup

```bash
# Check protected resource metadata
curl https://cbrowser-mcp.wyldfyre.ai/.well-known/oauth-protected-resource

# Should return:
{
  "resource": "https://cbrowser-mcp.wyldfyre.ai",
  "authorization_servers": ["https://your-tenant.auth0.com"],
  "bearer_methods_supported": ["header"],
  "scopes_supported": ["openid", "profile", "cbrowser:read", "cbrowser:write"]
}
```

### 6. Connect from Claude.ai

1. Go to [claude.ai](https://claude.ai)
2. Open **Settings → Connectors**
3. Click **Add custom connector**
4. Enter: `https://cbrowser-mcp.wyldfyre.ai/mcp`
5. Claude will:
   - Fetch the OAuth metadata from `/.well-known/oauth-protected-resource`
   - Redirect you to Auth0 for authentication
   - Exchange tokens and connect

---

## Architecture

```
┌─────────────────┐     ┌────────────────┐     ┌─────────────────┐
│   Claude.ai     │────▶│    Auth0       │────▶│  CBrowser MCP   │
│                 │     │                │     │     Server      │
│  1. Discover    │     │  2. Authorize  │     │                 │
│  OAuth metadata │     │  3. Get token  │     │  4. Validate    │
│                 │     │                │     │     JWT         │
└─────────────────┘     └────────────────┘     └─────────────────┘
```

## Flow Details

1. **Discovery**: Claude fetches `/.well-known/oauth-protected-resource` to find Auth0
2. **Authorization**: User is redirected to Auth0 login
3. **Token Exchange**: Auth0 issues JWT access token
4. **API Access**: Claude sends requests with `Authorization: Bearer <jwt>`
5. **Validation**: CBrowser validates JWT against Auth0 JWKS

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH0_DOMAIN` | Yes | Your Auth0 tenant domain (e.g., `your-tenant.auth0.com`) |
| `AUTH0_AUDIENCE` | Yes | API identifier (your server URL) |
| `AUTH0_CLIENT_ID` | No | Client ID for static registration info |

---

## Scopes

The server supports these OAuth scopes:

| Scope | Description |
|-------|-------------|
| `openid` | OpenID Connect authentication |
| `profile` | User profile information |
| `cbrowser:read` | Read-only access to CBrowser tools |
| `cbrowser:write` | Full access to CBrowser tools |

---

## Troubleshooting

### "Invalid token" errors

1. Check Auth0 domain is correct
2. Verify audience matches exactly (including trailing slash if needed)
3. Check token hasn't expired

### "OAuth not configured" response

1. Ensure `AUTH0_DOMAIN` and `AUTH0_AUDIENCE` are set
2. Restart the service after config changes

### Claude.ai can't connect

1. Verify callback URLs include both `claude.ai` and `claude.com`
2. Check CORS is working (test with browser dev tools)
3. Ensure `/.well-known/oauth-protected-resource` is accessible

### Rate limit errors (429)

Auth0 free tier has strict rate limits. CBrowser caches validated tokens for 30 minutes to avoid hitting these limits. If you're still seeing rate limits:

1. Upgrade to Auth0 paid tier
2. Reduce concurrent users

### Opaque token instead of JWT

If Auth0 returns an opaque (encrypted) token instead of a JWT, CBrowser validates it via Auth0's `/userinfo` endpoint. This works but:

1. Ensure API Identifier in Auth0 exactly matches your audience (including trailing slash)
2. Check the Application is authorized for the API in Auth0

---

## Security Best Practices

1. **Use static registration** - Don't enable open DCR without IP restrictions
2. **Restrict callback URLs** - Only allow Claude's official callbacks
3. **Monitor logs** - Check Auth0 logs for unauthorized access attempts
4. **Rotate secrets** - Periodically rotate client secrets
5. **Use scopes** - Implement scope-based access control for sensitive tools

---

## Dual Authentication

The server supports both API keys and OAuth simultaneously:

- **API Key**: For Claude Code CLI and programmatic access
- **OAuth**: For claude.ai web interface

Both can be enabled at the same time. The server checks OAuth JWT first, then falls back to API key.

---

## Related Documentation

- [Auth0 MCP Documentation](https://auth0.com/ai/docs/mcp/)
- [MCP Authorization Spec](https://spec.modelcontextprotocol.io/specification/architecture/transports/)
- [RFC 9728 - OAuth Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
