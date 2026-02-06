# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 9.x     | :white_check_mark: |
| 8.x     | :white_check_mark: |
| 7.x     | :x:                |
| < 7.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in CBrowser, please report it responsibly:

1. **Do NOT open a public GitHub issue**
2. Email security concerns to: security@wyldfyre.ai
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 1 week
- **Resolution**: Depends on severity (critical: 72 hours, high: 2 weeks)

## Security Features

CBrowser includes several security features:

### Constitutional Safety (Built-in)

Actions are classified into risk zones:

| Zone | Actions | Behavior |
|------|---------|----------|
| 🟢 Green | Navigate, read, screenshot | Auto-execute |
| 🟡 Yellow | Click buttons, fill forms | Log and proceed |
| 🔴 Red | Submit, delete, purchase | Requires verification |
| ⬛ Black | Bypass auth, inject scripts | Never executes |

### Credential Security

- Credentials stored in `~/.cbrowser/credentials.enc`
- Encrypted at rest
- Never logged or exposed in output

### Session Isolation

- Sessions stored locally in `~/.cbrowser/sessions/`
- No cross-site session leakage
- Sessions respect domain boundaries

## Best Practices

When using CBrowser:

1. **Never commit API keys** - Use environment variables
2. **Review red zone actions** - Always verify destructive operations
3. **Use headless mode in CI** - `--headless` flag
4. **Rotate credentials** - Regularly update stored credentials
5. **Audit logs** - Check `~/.cbrowser/audit/` for action history

## Scope

This security policy covers:
- The CBrowser npm package
- The MCP server implementations
- The Chrome extension
- Official documentation

Third-party integrations and forks are not covered.
