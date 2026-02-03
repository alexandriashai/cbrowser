# Navigate Workflow

Smart navigation with AI wait detection.

## Triggers

- "navigate to", "go to", "open"
- "visit", "load", "browse to"

## Usage

```bash
npx cbrowser navigate "https://example.com"
npx cbrowser navigate "https://example.com" --screenshot
npx cbrowser navigate "https://example.com" --wait-for "Welcome"
```

## Options

| Option | Description |
|--------|-------------|
| `--screenshot` | Take screenshot after loading |
| `--wait-for TEXT` | Wait for text to appear |
| `--timeout MS` | Custom timeout (default: 30000) |
| `--device DEVICE` | Emulate device |
| `--persistent` | Keep browser context |

## AI Wait Detection

CBrowser automatically waits for:

1. **Network idle** - No pending requests
2. **DOM stable** - No layout shifts
3. **Visible content** - Main content rendered

## Examples

```bash
# Basic navigation
npx cbrowser navigate "https://example.com"

# With screenshot
npx cbrowser navigate "https://example.com" --screenshot

# Wait for specific content
npx cbrowser navigate "https://example.com" --wait-for "Dashboard loaded"

# Mobile emulation
npx cbrowser navigate "https://example.com" --device iphone-15
```
