# Hunt Bugs Detection Coverage

CBrowser's `hunt_bugs` tool detects accessibility and usability issues across web pages. This document describes the detection categories, their WCAG mappings, and expected results.

## Detection Categories

### Core Accessibility Issues (6 original)

| Issue Type | Description | WCAG Criterion | Severity |
|------------|-------------|----------------|----------|
| **broken-image** | Images with failed `src` or missing source | N/A | medium |
| **missing-alt** | Images lacking `alt` attribute | 1.1.1 Non-text Content | high |
| **empty-link** | Links with no text content or `aria-label` | 2.4.4 Link Purpose | medium |
| **no-button-text** | Buttons without accessible text | 4.1.2 Name, Role, Value | high |
| **missing-label** | Form inputs without associated `<label>` | 1.3.1 Info and Relationships | high |
| **no-keyboard-access** | Elements with `onclick` but not keyboard-accessible | 2.1.1 Keyboard | high |

### Expanded Detection Categories (8 new in v18.14.0)

| Issue Type | Description | WCAG Criterion | Severity |
|------------|-------------|----------------|----------|
| **contrast-violation** | Text with insufficient color contrast | 1.4.3 Contrast (Minimum) | high |
| **missing-aria** | Elements with ARIA role missing required attributes | 4.1.2 Name, Role, Value | medium |
| **duplicate-id** | Multiple elements sharing the same `id` attribute | 4.1.1 Parsing | medium |
| **missing-page-title** | Document with empty or missing `<title>` | 2.4.2 Page Titled | low |
| **missing-lang** | HTML element without `lang` attribute | 3.1.1 Language of Page | low |
| **keyboard-trap** | Elements that trap keyboard focus | 2.1.2 No Keyboard Trap | critical |
| **autoplay-media** | Video/audio elements with `autoplay` | 1.4.2 Audio Control | medium |
| **missing-skip-link** | Pages without skip-to-content navigation | 2.4.1 Bypass Blocks | low |

## Severity Mapping

| Severity | Impact | Action Required |
|----------|--------|-----------------|
| **critical** | Blocks users entirely | Fix immediately |
| **high** | Significantly impairs accessibility | Fix before release |
| **medium** | Creates friction for assistive tech users | Fix in next sprint |
| **low** | Minor issue or best practice | Fix when convenient |

## Example Output

```json
{
  "url": "https://example.com",
  "pagesScanned": 5,
  "issuesFound": 23,
  "categories": {
    "missing-alt": 8,
    "missing-label": 6,
    "contrast-violation": 4,
    "empty-link": 3,
    "missing-skip-link": 2
  },
  "bySeverity": {
    "high": 14,
    "medium": 7,
    "low": 2
  },
  "recommendations": [
    "Add alt text to all 8 images",
    "Associate labels with all form inputs",
    "Improve contrast ratio on 4 text elements",
    "Add skip-to-content link"
  ]
}
```

## Usage

```bash
# Scan homepage only
npx cbrowser hunt-bugs https://example.com

# Scan multiple pages
npx cbrowser hunt-bugs https://example.com --max-pages 10

# Output as JSON
npx cbrowser hunt-bugs https://example.com --output report.json

# Output as HTML
npx cbrowser hunt-bugs https://example.com --html
```

## Known Test Sites

For validating detection coverage, these sites have intentional accessibility issues:

| Site | Purpose | Expected Issues |
|------|---------|-----------------|
| [a11y-challenges.com](https://a11y-challenges.com) | Intentionally broken for testing | Multiple categories |
| [dequeuniversity.com/demo/mars](https://dequeuniversity.com/demo/mars) | Accessible example | Few/no issues |
| [webaim.org/standards/wcag/checklist](https://webaim.org/standards/wcag/checklist) | WCAG reference | Minimal issues |

## Comparison to Other Tools

| Tool | Categories | Cognitive Persona Testing | Self-Healing |
|------|------------|---------------------------|--------------|
| **CBrowser hunt_bugs** | 14 | ✅ (via empathy_audit) | ✅ |
| axe-core | 100+ | ❌ | ❌ |
| Lighthouse A11y | ~40 | ❌ | ❌ |
| WAVE | ~50 | ❌ | ❌ |

CBrowser focuses on the most impactful issues while providing unique persona-based testing through `empathy_audit`. For comprehensive WCAG compliance, combine with axe-core.
