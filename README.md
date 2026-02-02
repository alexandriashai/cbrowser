# CBrowser

**The browser that thinks.** AI-powered browser automation with constitutional safety, persona-driven testing, session persistence, and autonomous journeys.

[![npm version](https://badge.fury.io/js/cbrowser.svg)](https://badge.fury.io/js/cbrowser)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What Makes This Different

| Traditional Automation | CBrowser |
|------------------------|----------|
| Brittle CSS selectors | AI vision: "click the blue login button" |
| Breaks when DOM changes | Self-healing locators adapt automatically |
| Stateless between runs | Remembers sites, patterns, sessions |
| Blind execution | Constitutional verification before actions |
| Manual debugging | Auto-diagnostic with visual diffs |
| No user context | Personas with goals, behaviors, limitations |
| Manual login flows | Credential vault with session persistence |
| Scripted tests only | Autonomous goal-driven journeys |

## Quick Start

### Installation

```bash
# Using npm
npm install cbrowser

# Using bun (recommended)
bun add cbrowser

# Using yarn
yarn add cbrowser
```

### Install Playwright Browsers

```bash
npx playwright install chromium
```

### Basic Usage

```bash
# Navigate to a URL
npx cbrowser navigate "https://example.com"

# Click an element using natural language
npx cbrowser click "the blue submit button"

# Fill a form field
npx cbrowser fill "email input" "user@example.com"

# Take a screenshot
npx cbrowser screenshot "./my-screenshot.png"
```

## Features

### AI-Powered Element Selection

Forget brittle CSS selectors. Describe elements naturally:

```bash
# Natural language
cbrowser click "the main navigation menu"
cbrowser fill "password field" "secret123"

# Accessibility-based
cbrowser click "aria:button/Submit"

# Visual description
cbrowser click "visual:red button in header"

# Semantic type
cbrowser fill "semantic:email" "user@example.com"

# Fallback to CSS when needed
cbrowser click "css:#login-btn"
```

### Session Persistence

Save and restore complete browser sessions:

```bash
# Save current session (cookies, localStorage, sessionStorage)
cbrowser session save "github-logged-in" --url "https://github.com"

# Load a saved session
cbrowser session load "github-logged-in"

# List all sessions
cbrowser session list

# Delete a session
cbrowser session delete "github-logged-in"
```

### Persona-Driven Testing

Test your site from different user perspectives:

```bash
# Run an autonomous journey as a specific persona
cbrowser journey "first-timer" \
  --start "https://mysite.com" \
  --goal "Complete signup and reach dashboard"

# List available personas
cbrowser persona list
```

**Built-in Personas:**

| Persona | Description |
|---------|-------------|
| `power-user` | Tech-savvy expert who expects efficiency |
| `first-timer` | New user exploring for the first time |
| `mobile-user` | Smartphone user with touch interface |
| `screen-reader-user` | Blind user with screen reader |
| `elderly-user` | Older adult with vision/motor limitations |
| `impatient-user` | Quick to abandon slow experiences |

### Credential Management

Securely store and use credentials:

```bash
# Add credentials for a site
cbrowser creds add "github" \
  --username "me@email.com" \
  --password "my-secret-password"

# List stored credentials
cbrowser creds list

# Authenticate using stored credentials
cbrowser auth "github"
```

### Data Extraction

Extract structured data from pages:

```bash
# Extract all links
cbrowser extract "links" --format json

# Extract headings
cbrowser extract "headings"

# Extract form data
cbrowser extract "forms"

# Extract product cards (AI-powered)
cbrowser extract "all product cards" --format json
```

### Storage Management

Keep your data directory clean:

```bash
# Show storage usage
cbrowser storage

# Preview cleanup
cbrowser cleanup --dry-run

# Clean old files
cbrowser cleanup --older-than 7 --keep-screenshots 10
```

## Configuration

### Data Directory

By default, CBrowser stores data in `~/.cbrowser/`. Override with:

```bash
# Environment variable
export CBROWSER_DATA_DIR="/path/to/data"

# Or per-command
CBROWSER_DATA_DIR="./my-data" cbrowser navigate "https://example.com"
```

### Directory Structure

```
~/.cbrowser/
├── sessions/           # Saved browser sessions
├── screenshots/        # Captured screenshots
├── personas/           # Custom persona definitions
├── scenarios/          # Test scenarios
├── helpers/            # Learned site patterns
├── audit/              # Action audit logs
└── credentials.json    # Encrypted credentials
```

## Constitutional Safety

CBrowser implements a safety framework with action zones:

| Zone | Actions | Behavior |
|------|---------|----------|
| **Green** | Navigate, read, screenshot, scroll | Auto-execute |
| **Yellow** | Click buttons, fill forms, select | Log and proceed |
| **Red** | Submit, delete, purchase, account changes | Requires `--force` |
| **Black** | Bypass auth, violate ToS, inject scripts | Never execute |

### Safety Bypass

For automated testing, you can bypass yellow/red zone warnings:

```bash
cbrowser click "Delete Account" --force
```

## API Usage

Use CBrowser programmatically:

```typescript
import { CBrowser } from 'cbrowser';

const browser = new CBrowser({
  dataDir: './my-data',
  headless: true,
});

await browser.navigate('https://example.com');
await browser.click('Sign In');
await browser.fill('email', 'user@example.com');
await browser.fill('password', 'secret123');
await browser.click('Submit');

const screenshot = await browser.screenshot();
await browser.close();
```

### With Sessions

```typescript
import { CBrowser } from 'cbrowser';

const browser = new CBrowser();

// Load existing session or create new
const hasSession = await browser.loadSession('my-app');
if (!hasSession) {
  await browser.navigate('https://myapp.com/login');
  await browser.fill('email', 'user@example.com');
  await browser.fill('password', 'secret');
  await browser.click('Login');
  await browser.saveSession('my-app');
}

// Now authenticated, continue with tests
await browser.navigate('https://myapp.com/dashboard');
```

### Running Journeys

```typescript
import { CBrowser } from 'cbrowser';

const browser = new CBrowser();
const result = await browser.journey({
  persona: 'first-timer',
  startUrl: 'https://example.com',
  goal: 'Find pricing information',
  maxSteps: 20,
});

console.log('Journey completed:', result.success);
console.log('Friction points:', result.frictionPoints);
console.log('Console logs:', result.consoleLogs);
```

## Examples

### E2E Test with Session Reuse

```typescript
// tests/checkout.test.ts
import { CBrowser } from 'cbrowser';

describe('Checkout Flow', () => {
  let browser: CBrowser;

  beforeAll(async () => {
    browser = new CBrowser();
    await browser.loadSession('logged-in-user');
  });

  afterAll(async () => {
    await browser.close();
  });

  it('should add item to cart', async () => {
    await browser.navigate('https://shop.example.com/products');
    await browser.click('Add to Cart');
    await browser.click('View Cart');

    const cartItems = await browser.extract('cart items');
    expect(cartItems.length).toBeGreaterThan(0);
  });
});
```

### Multi-Persona Comparison

```typescript
import { CBrowser } from 'cbrowser';

const personas = ['power-user', 'first-timer', 'mobile-user'];
const results = [];

for (const persona of personas) {
  const browser = new CBrowser();
  const result = await browser.journey({
    persona,
    startUrl: 'https://example.com',
    goal: 'Complete checkout',
  });

  results.push({
    persona,
    success: result.success,
    timeMs: result.totalTime,
    frictionPoints: result.frictionPoints,
  });

  await browser.close();
}

console.table(results);
```

## Troubleshooting

### Browser Not Starting

```bash
# Ensure Playwright browsers are installed
npx playwright install chromium

# Check for display issues (Linux servers)
export DISPLAY=:0
# Or run headless
cbrowser navigate "https://example.com" --headless
```

### Session Not Persisting

Sessions are domain-specific. Make sure you're loading the session on the same domain:

```bash
# Save from example.com
cbrowser session save "my-session" --url "https://example.com"

# Load must also be on example.com
cbrowser session load "my-session"
# This navigates to the saved URL automatically
```

### Credential Security

Credentials are stored in `~/.cbrowser/credentials.json`. For production:

1. Set restrictive permissions: `chmod 600 ~/.cbrowser/credentials.json`
2. Consider using environment variables instead
3. Never commit the data directory to git

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

```bash
# Clone the repo
git clone https://github.com/yourusername/cbrowser.git
cd cbrowser

# Install dependencies
bun install

# Run in development
bun run dev

# Run tests
bun test
```

## License

MIT - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Built on [Playwright](https://playwright.dev/) for reliable browser automation
- Inspired by constitutional AI principles for safe automation
- Persona framework based on UX research methodologies
