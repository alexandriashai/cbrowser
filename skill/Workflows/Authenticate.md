# Authenticate Workflow

Handle login flows with stored credentials.

## Triggers

- "login", "log in", "sign in"
- "authenticate", "auth"

## Usage

```bash
# Use stored credentials
npx cbrowser auth "github"

# Manual login (no stored creds)
npx cbrowser navigate "https://example.com/login"
npx cbrowser fill "email" "user@example.com"
npx cbrowser fill "password" "secret123"
npx cbrowser click "Login"
```

## Credential Management

```bash
# Add credentials
npx cbrowser creds add "github"

# Add 2FA
npx cbrowser creds add-2fa "github"

# List stored
npx cbrowser creds list

# Delete
npx cbrowser creds delete "github"
```

## Authentication Flow

1. Navigate to login page
2. Fill credentials from vault
3. Submit login form
4. Handle 2FA if configured
5. Wait for success indicator
6. Optionally save session

## With Session Save

```bash
# Authenticate and save
npx cbrowser auth "github"
npx cbrowser session save "github-logged-in"

# Later, just load session
npx cbrowser session load "github-logged-in"
```

## Handling 2FA

If 2FA secret is stored:

```bash
npx cbrowser auth "github"
# Automatically fills TOTP code
```

## Options

| Option | Description |
|--------|-------------|
| `--save-session NAME` | Save session after login |
| `--wait-for TEXT` | Wait for success indicator |
