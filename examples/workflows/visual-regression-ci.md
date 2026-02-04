# Visual Regression Testing for CI

Catch unintended visual changes before they reach production. Capture baseline screenshots, run comparisons across browsers and viewports, and surface pixel-level diffs.

## Prerequisites

- Node.js 18+
- CBrowser installed: `npm install -g cbrowser`
- Target application deployed at `https://app.example.com`

## Step 1: Capture a Baseline

Take reference screenshots of your production pages to compare future changes against.

```bash
# Capture baseline screenshots of key pages
npx cbrowser visual-baseline "https://app.example.com" --name production

# Optionally target specific pages
npx cbrowser visual-baseline "https://app.example.com/dashboard" --name production-dashboard
npx cbrowser visual-baseline "https://app.example.com/settings" --name production-settings
```

This stores timestamped screenshots in `.cbrowser/baselines/production/`.

## Step 2: Run Visual Regression

After deploying a new build to staging, compare against the baseline.

```bash
npx cbrowser visual-regression "https://staging.example.com" --baseline production
```

## Expected Diff Output

```
Visual Regression Report: staging vs production
Generated: 2026-02-03T14:30:00Z

Page: /
  Similarity: 99.7%  [PASS]
  Diff pixels: 342 of 2,073,600

Page: /dashboard
  Similarity: 94.2%  [FAIL - below 98% threshold]
  Diff pixels: 120,432 of 2,073,600
  Changes detected:
    - Header region: navigation bar height changed (+4px)
    - Sidebar: new icon added to menu
    - Chart area: color palette shifted

Page: /settings
  Similarity: 100.0%  [PASS]
  Diff pixels: 0 of 2,073,600

Summary: 2 passed, 1 failed
Diff images saved to: .cbrowser/diffs/staging-vs-production/
```

## Step 3: Cross-Browser Testing

Verify rendering consistency across browser engines.

```bash
npx cbrowser cross-browser "https://app.example.com"
```

```
Cross-Browser Report: https://app.example.com
Browsers: Chromium 122, Firefox 123, WebKit 17.4

  Chromium vs Firefox:  99.1% similar  [PASS]
  Chromium vs WebKit:   97.3% similar  [WARN - minor differences]
    - Font rendering: anti-aliasing differs in body text
    - Box shadow: 1px offset on card components
  Firefox vs WebKit:    97.8% similar  [WARN]

All browsers functionally equivalent. Minor rendering differences noted.
```

## Step 4: Responsive Viewport Testing

Check layouts across common device widths.

```bash
npx cbrowser responsive "https://app.example.com"
```

```
Responsive Report: https://app.example.com
Viewports: 375px (mobile), 768px (tablet), 1024px (laptop), 1440px (desktop)

  375px  (mobile):   Layout OK, no horizontal overflow
  768px  (tablet):   Layout OK, sidebar collapses correctly
  1024px (laptop):   Layout OK, all columns visible
  1440px (desktop):  Layout OK, max-width container centered

  Issues found:
    - 375px: "Export" button text truncated to "Exp..."
    - 768px: Table rows require horizontal scroll (expected)

Responsive score: 9.2/10
```

## CI Integration

Add to your pipeline (GitHub Actions example):

```yaml
- name: Visual Regression
  run: |
    npx cbrowser visual-baseline "$PROD_URL" --name production
    npx cbrowser visual-regression "$STAGING_URL" --baseline production --ci
    npx cbrowser cross-browser "$STAGING_URL" --ci
    npx cbrowser responsive "$STAGING_URL" --ci
```

## Next Steps

- Set custom thresholds: `--threshold 95` to allow more tolerance.
- Exclude dynamic regions: `--ignore-regions ".timestamp,.ad-banner"`.
- Generate HTML reports: add `--html` to produce a shareable diff viewer.
- Schedule nightly baseline updates after each production deploy.
