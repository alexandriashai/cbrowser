# Hunt Bugs

**Turn AI loose on your site. See what's broken.**

`hunt_bugs` is autonomous exploratory testing. You give it a URL, it crawls your site looking for bugs — broken links, JavaScript errors, accessibility issues, visual glitches, and security problems. No test cases required.

---

## Quick Start

```json
{
  "url": "https://example.com",
  "scope": "all",
  "depth": 4,
  "maxPages": 50
}
```

**What happens**:
1. AI starts at your URL and begins exploring
2. On each page, it checks for functional, visual, accessibility, and security issues
3. It follows links, fills forms, clicks buttons — looking for things that break
4. You get a report of everything found, with reproduction steps and screenshots

---

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | string | Yes | — | Starting URL |
| `scope` | string | No | `all` | Bug types: `all`, `functional`, `visual`, `accessibility`, `security` |
| `depth` | number | No | 3 | How deep to crawl |
| `maxPages` | number | No | 20 | Maximum pages to visit |
| `focus` | string | No | — | Focus area (e.g., "forms", "checkout", "navigation") |
| `exclude` | array | No | — | URL patterns to skip |

---

## What It Finds

### Functional Bugs

| Bug Type | How It's Detected |
|----------|-------------------|
| Broken links | Links that return 4xx/5xx errors |
| Dead ends | Pages with no way to navigate away |
| Form errors | Submissions that fail silently |
| JavaScript exceptions | Console errors during interaction |
| Failed network requests | XHR/fetch that error |
| Infinite loops | Redirect chains, infinite scrolls |
| Missing content | Empty states, placeholder text |

### Visual Bugs

| Bug Type | How It's Detected |
|----------|-------------------|
| Overlapping elements | Content that covers other content |
| Horizontal overflow | Content breaking viewport |
| Missing images | Broken `src` attributes |
| Layout breaks | Elements far from expected position |
| Z-index issues | Content hidden behind other layers |
| Responsive failures | Elements that break at viewport edges |

### Accessibility Bugs

| Bug Type | How It's Detected |
|----------|-------------------|
| Missing alt text | Images without descriptions |
| Low contrast | Text that fails WCAG contrast |
| Keyboard traps | Can't escape a component with keyboard |
| Missing labels | Form fields without associated labels |
| Focus issues | Interactive elements without focus styles |
| ARIA violations | Invalid ARIA attributes |

### Security Issues

| Bug Type | How It's Detected |
|----------|-------------------|
| Exposed credentials | Visible API keys, passwords |
| Insecure forms | HTTP forms on HTTPS pages |
| Data in URLs | Sensitive info in query strings |
| Missing HTTPS | Insecure resource loading |
| Open redirects | Redirects to external domains |
| Debug endpoints | Exposed dev/debug routes |

---

## Output

```json
{
  "url": "https://example.com",
  "pagesVisited": 34,
  "timeElapsed": 187,
  "bugs": [
    {
      "severity": "critical",
      "type": "functional",
      "category": "form-error",
      "url": "https://example.com/checkout",
      "description": "Payment form silently fails when CVV is left empty",
      "reproduction": [
        "Navigate to /checkout",
        "Fill all fields except CVV",
        "Click 'Pay Now'",
        "Form shows loading spinner but never completes"
      ],
      "screenshot": "base64...",
      "consoleErrors": [
        "Uncaught TypeError: Cannot read property 'value' of null at payment.js:142"
      ]
    },
    {
      "severity": "serious",
      "type": "accessibility",
      "category": "missing-label",
      "url": "https://example.com/contact",
      "description": "Phone number field has no associated label",
      "wcag": "1.3.1",
      "element": "<input type='tel' name='phone' placeholder='Phone'>",
      "remediation": "Add <label for='phone'>Phone Number</label>"
    },
    {
      "severity": "moderate",
      "type": "visual",
      "category": "overflow",
      "url": "https://example.com/pricing",
      "description": "Pricing table overflows viewport on mobile",
      "viewport": "375x667",
      "screenshot": "base64..."
    },
    {
      "severity": "serious",
      "type": "security",
      "category": "exposed-credentials",
      "url": "https://example.com/config",
      "description": "API key visible in page source",
      "evidence": "const API_KEY = 'sk-...'",
      "recommendation": "Move API key to environment variable"
    }
  ],
  "summary": {
    "critical": 1,
    "serious": 4,
    "moderate": 7,
    "minor": 12,
    "byType": {
      "functional": 6,
      "visual": 8,
      "accessibility": 5,
      "security": 5
    }
  }
}
```

---

## Use Cases

### 1. Pre-Release Smoke Test

Before deploying, run a quick bug hunt:

```json
{
  "url": "https://staging.example.com",
  "scope": "functional",
  "depth": 3,
  "maxPages": 30
}
```

Catches obvious breaks before they reach production.

---

### 2. Security Reconnaissance

Find exposed secrets and vulnerabilities:

```json
{
  "url": "https://example.com",
  "scope": "security",
  "depth": 5,
  "maxPages": 100
}
```

---

### 3. Accessibility Sweep

Find accessibility issues across the entire site:

```json
{
  "url": "https://example.com",
  "scope": "accessibility",
  "depth": 5
}
```

For deeper analysis of specific issues, follow up with [empathy_audit](/docs/Tool-Empathy-Audit/).

---

### 4. Focused Testing

Hunt bugs only in a specific area:

```json
{
  "url": "https://example.com/checkout",
  "focus": "checkout",
  "exclude": ["/blog/*", "/docs/*"]
}
```

---

## How It Explores

1. **Starts at your URL** and analyzes the page
2. **Identifies interactive elements** — links, buttons, forms
3. **Executes interactions** — clicks, fills, submits
4. **Records everything** — console logs, network, screenshots
5. **Follows promising paths** — prioritizes unexplored areas
6. **Avoids traps** — detects infinite loops, skips logout/delete
7. **Moves to next page** and repeats

The AI uses constitutional safety rules to avoid destructive actions — it won't click "Delete Account" or "Cancel Subscription".

---

## CI/CD Integration

```bash
# Run in CI, fail if critical bugs found
npx cbrowser hunt-bugs https://staging.example.com \
  --scope all \
  --depth 3 \
  --fail-on critical \
  --output bugs.json

# Generate HTML report
npx cbrowser hunt-bugs https://example.com \
  --output report.html
```

---

## Tips

### Start Shallow, Go Deep

```json
// First run: quick sweep
{ "depth": 2, "maxPages": 20 }

// Second run: deep dive on problem areas
{ "url": "https://example.com/checkout", "depth": 5 }
```

### Exclude Known Issues

```json
{
  "exclude": [
    "/legacy/*",  // Old pages being deprecated
    "/admin/*"    // Requires auth
  ]
}
```

### Focus on What Matters

```json
// Only care about checkout working?
{ "focus": "checkout", "scope": "functional" }

// Preparing for accessibility audit?
{ "scope": "accessibility", "depth": 10 }
```

---

## Related Tools

- [`nl_test_file`](/docs/Tools-Testing-Quality/) — Run specific test scenarios
- [`empathy_audit`](/docs/Tool-Empathy-Audit/) — Deep accessibility testing
- [`competitive_benchmark`](/docs/Tool-Competitive-Benchmark/) — Compare against competitors

---

*Last updated: v17.6.0*
