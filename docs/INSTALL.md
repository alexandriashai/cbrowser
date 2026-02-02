# CBrowser Installation Guide

## Quick Install

```bash
# npm
npm install cbrowser

# yarn
yarn add cbrowser

# bun
bun add cbrowser

# pnpm
pnpm add cbrowser
```

## Browser Setup

CBrowser uses Playwright for browser automation. After installing, you need to install the browser binaries:

```bash
npx playwright install chromium
```

This downloads Chromium (~150MB). For full browser support:

```bash
npx playwright install  # Installs Chromium, Firefox, and WebKit
```

## Verify Installation

```bash
npx cbrowser help
```

You should see the help text with all available commands.

## Configuration

### Data Directory

By default, CBrowser stores data in `~/.cbrowser/`. To change this:

```bash
# Set environment variable
export CBROWSER_DATA_DIR="/path/to/custom/dir"

# Or per-command
CBROWSER_DATA_DIR="./data" npx cbrowser navigate "https://example.com"
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CBROWSER_DATA_DIR` | `~/.cbrowser` | Data storage directory |
| `CBROWSER_HEADLESS` | `false` | Run headless by default |
| `CBROWSER_TIMEOUT` | `30000` | Default timeout (ms) |
| `CBROWSER_VIEWPORT_WIDTH` | `1280` | Default viewport width |
| `CBROWSER_VIEWPORT_HEIGHT` | `800` | Default viewport height |
| `CBROWSER_VERBOSE` | `false` | Enable verbose logging |

### Persistent Configuration

Create a `.cbrowserrc` file in your project or home directory:

```json
{
  "headless": true,
  "timeout": 60000,
  "viewportWidth": 1920,
  "viewportHeight": 1080
}
```

## Platform-Specific Notes

### Linux

If running on a headless server, you may need additional dependencies:

```bash
# Ubuntu/Debian
sudo apt-get install libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2

# Or use Playwright's helper
npx playwright install-deps chromium
```

### macOS

No additional setup required. Works out of the box.

### Windows

No additional setup required. Works out of the box.

### Docker

```dockerfile
FROM node:20-slim

# Install Playwright dependencies
RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install

# Install browser
RUN npx playwright install chromium

COPY . .

# Run in headless mode
ENV CBROWSER_HEADLESS=true

CMD ["npx", "cbrowser", "help"]
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Browser Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm install
      - run: npx playwright install chromium

      - name: Run CBrowser tests
        run: npm test
        env:
          CBROWSER_HEADLESS: true
```

### GitLab CI

```yaml
test:
  image: mcr.microsoft.com/playwright:v1.40.0
  script:
    - npm install
    - npm test
  variables:
    CBROWSER_HEADLESS: "true"
```

## Troubleshooting

### "Browser not found" Error

```bash
# Reinstall browser
npx playwright install chromium --force
```

### Permission Denied on Linux

```bash
# Make data directory writable
sudo chown -R $USER:$USER ~/.cbrowser
chmod -R 755 ~/.cbrowser
```

### Timeout Errors

Increase the default timeout:

```bash
CBROWSER_TIMEOUT=60000 npx cbrowser navigate "https://slow-site.com"
```

### Display Issues (Linux Server)

Use headless mode:

```bash
CBROWSER_HEADLESS=true npx cbrowser navigate "https://example.com"
```

Or set up a virtual display:

```bash
# Install Xvfb
sudo apt-get install xvfb

# Run with virtual display
xvfb-run npx cbrowser navigate "https://example.com"
```

## Upgrading

```bash
# npm
npm update cbrowser

# Check version
npx cbrowser --version
```

## Uninstalling

```bash
# Remove package
npm uninstall cbrowser

# Remove data directory (optional)
rm -rf ~/.cbrowser

# Remove Playwright browsers (optional)
rm -rf ~/.cache/ms-playwright
```

## Getting Help

- Check [README.md](../README.md) for usage examples
- Open an issue on GitHub for bugs
- See [CONTRIBUTING.md](../CONTRIBUTING.md) for development setup
