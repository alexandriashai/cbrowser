# Visual & Performance Tools

**Catch regressions before your users see them.**

These 10 tools detect visual changes, performance degradation, cross-browser rendering differences, and responsive layout breakage. Stop finding out about broken deploys from customer complaints.

---

## When to Use These Tools

- **You're deploying to staging** and want to verify nothing visual broke
- **Performance matters** and you need to catch slowdowns before production
- **Your site looks different in Safari** and you need to know exactly what's wrong
- **Mobile layouts keep breaking** and you want automated viewport testing
- **You want chaos engineering** to test resilience under failure conditions

---

## Tools

### `visual_baseline`

**What it does**: Capture a visual baseline (screenshot + metadata) for a URL to compare against later.

**Why you'd use it**: Establish what "correct" looks like so you can detect when it changes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to capture |
| `name` | string | Yes | Name for this baseline |
| `viewport` | object | No | Width/height. Default: 1280x720 |
| `fullPage` | boolean | No | Capture entire page. Default: false |

**Example**:
```json
{
  "url": "https://example.com",
  "name": "homepage-desktop",
  "viewport": { "width": 1920, "height": 1080 },
  "fullPage": true
}
```

---

### `visual_regression`

**What it does**: Compare current page state against a saved baseline using AI visual analysis.

**Why you'd use it**: Detect meaningful visual changes while ignoring irrelevant differences (timestamps, ads, dynamic content).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to test |
| `baseline` | string | Yes | Baseline name to compare against |
| `threshold` | number | No | Difference tolerance (0-100). Default: 5 |

**Example**:
```json
{
  "url": "https://staging.example.com",
  "baseline": "homepage-desktop"
}
```

**Returns**: Pass/fail, difference percentage, annotated diff image, list of changed regions.

---

### `ab_comparison`

**What it does**: Compare two different URLs visually — staging vs production, old design vs new design.

**Why you'd use it**: Side-by-side comparison when you don't have a saved baseline, or when comparing different implementations.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `urlA` | string | Yes | First URL (e.g., production) |
| `urlB` | string | Yes | Second URL (e.g., staging) |
| `labelA` | string | No | Label for first URL. Default: "A" |
| `labelB` | string | No | Label for second URL. Default: "B" |
| `viewport` | object | No | Viewport dimensions |

**Example**:
```json
{
  "urlA": "https://example.com/pricing",
  "urlB": "https://staging.example.com/pricing",
  "labelA": "Production",
  "labelB": "Staging"
}
```

**Returns**: Side-by-side comparison, diff overlay, list of differences.

---

### `perf_baseline`

**What it does**: Capture performance baseline (Core Web Vitals, load times, resource counts) for a URL.

**Why you'd use it**: Know what your current performance is so you can detect regressions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to measure |
| `name` | string | Yes | Baseline name |
| `runs` | number | No | Number of measurements to average. Default: 3 |

**Example**:
```json
{
  "url": "https://example.com",
  "name": "homepage-perf",
  "runs": 5
}
```

**Returns**: LCP, FCP, TTFB, CLS, total load time, resource breakdown, with "good/needs-improvement/poor" ratings.

---

### `perf_regression`

**What it does**: Compare current performance against a baseline with configurable sensitivity.

**Why you'd use it**: Catch performance regressions before they ship.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to test |
| `baseline` | string | Yes | Baseline name |
| `profile` | string | No | Sensitivity: `strict`, `normal`, `lenient`. Default: `normal` |
| `thresholdLcp` | number | No | LCP regression threshold %. Default: 20 |
| `thresholdFcp` | number | No | FCP regression threshold %. Default: 20 |

**Example**:
```json
{
  "url": "https://staging.example.com",
  "baseline": "homepage-perf",
  "profile": "strict"
}
```

**Returns**: Pass/fail, metric comparisons, which thresholds were exceeded.

---

### `list_baselines`

**What it does**: List all saved visual and performance baselines.

**Why you'd use it**: See what baselines exist before running regression tests.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | No | Filter: `visual`, `performance`, `all`. Default: `all` |

---

### `cross_browser_test`

**What it does**: Render a page in Chromium, Firefox, and WebKit and compare the results.

**Why you'd use it**: Find browser-specific rendering bugs.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to test |
| `browsers` | array | No | Browsers to test. Default: `["chromium", "firefox", "webkit"]` |
| `viewport` | object | No | Viewport dimensions |

**Example**:
```json
{
  "url": "https://example.com/complex-layout",
  "browsers": ["chromium", "webkit"]
}
```

**Returns**: Screenshots from each browser, diff analysis, list of rendering differences.

---

### `cross_browser_diff`

**What it does**: Quick comparison of key metrics (layout, fonts, colors) across browsers without full screenshots.

**Why you'd use it**: Faster browser comparison when you just need to know if there are issues.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to compare |
| `browsers` | array | No | Browsers to test |

---

### `responsive_test`

**What it does**: Test page rendering across different viewport sizes (mobile, tablet, desktop).

**Why you'd use it**: Catch responsive layout breakage.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to test |
| `viewports` | array | No | Viewport presets or custom sizes. Default: `["mobile", "tablet", "desktop"]` |

**Example**:
```json
{
  "url": "https://example.com",
  "viewports": ["mobile", "tablet", "desktop-lg"]
}
```

### Viewport Presets

| Preset | Dimensions |
|--------|------------|
| `mobile` | 375x667 |
| `tablet` | 768x1024 |
| `desktop` | 1280x720 |
| `desktop-lg` | 1920x1080 |

**Returns**: Screenshots at each viewport, flagged layout issues, overflow problems.

---

### `chaos_test`

**What it does**: Inject failures to test site resilience — offline mode, network latency, blocked resources.

**Why you'd use it**: Ensure your site degrades gracefully under adverse conditions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to test |
| `chaos` | string | Yes | Type: `offline`, `slow-network`, `block-scripts`, `block-images`, `block-fonts` |
| `duration` | number | No | How long to apply chaos (seconds). Default: 10 |

**Example**:
```json
{
  "url": "https://example.com/checkout",
  "chaos": "slow-network"
}
```

**Returns**: How the page behaves under stress, errors encountered, recovery behavior.

---

## Sensitivity Profiles for Performance

| Profile | LCP | FCP | TTFB | Use Case |
|---------|-----|-----|------|----------|
| `strict` | 10% | 10% | 15% | Pre-production, critical paths |
| `normal` | 20% | 20% | 25% | Regular CI/CD |
| `lenient` | 35% | 35% | 40% | Early development, high variance |

---

## Related Documentation

- [Performance Regression](/docs/Performance-Regression/) — Deep dive on perf testing
- [Tools Overview](/docs/Tools-Overview/) — All tools by category

---

*Last updated: v17.6.0*
