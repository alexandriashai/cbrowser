# Accessibility Audit with Bug Hunting and Persona Testing

Find accessibility issues, get actionable fix recommendations, and validate usability across different user personas with assistive technology needs.

## Prerequisites

- Node.js 18+
- CBrowser installed: `npm install -g cbrowser`
- Target application at `https://app.example.com`

## Step 1: Hunt for Accessibility Bugs

Scan pages for WCAG violations, usability issues, and assistive technology problems.

```bash
npx cbrowser hunt "https://app.example.com"
```

### Sample Bug Report Output

```
Bug Hunt Report: https://app.example.com
Scan completed: 2026-02-03T10:15:00Z
Pages scanned: 5

=== Critical (3 issues) ===

BUG-001: Missing form labels
  Page: /signup
  Element: <input type="email" placeholder="Email">
  WCAG: 1.3.1 (Info and Relationships), 4.1.2 (Name, Role, Value)
  Impact: Screen readers cannot identify the purpose of this field
  Recommendation: Add <label for="email">Email address</label> or aria-label

BUG-002: Insufficient color contrast
  Page: /dashboard
  Element: .status-text (gray #999 on white #FFF)
  WCAG: 1.4.3 (Contrast Minimum)
  Impact: Text unreadable for users with low vision
  Contrast ratio: 2.85:1 (minimum required: 4.5:1)
  Recommendation: Darken text to at least #767676 for 4.54:1 ratio

BUG-003: No skip navigation link
  Page: / (all pages)
  WCAG: 2.4.1 (Bypass Blocks)
  Impact: Keyboard users must tab through 24 nav items on every page
  Recommendation: Add a visually hidden "Skip to main content" link as the first focusable element

=== Moderate (5 issues) ===

BUG-004: Images missing alt text (3 instances on /products)
BUG-005: Focus order breaks in modal dialogs (/settings)
BUG-006: Timeout with no warning on /checkout (30s session)
BUG-007: Error messages not announced to screen readers (/signup)
BUG-008: Touch targets below 44x44px on mobile nav

Summary: 3 critical, 5 moderate, 4 informational
```

## Step 2: Persona-Based Testing

Test the application from the perspective of users with different needs.

```bash
# Test as a screen reader user
npx cbrowser test-persona "https://app.example.com" --persona screen-reader-user \
  --goal "Sign up for an account and navigate to the dashboard"

# Test as an elderly user
npx cbrowser test-persona "https://app.example.com" --persona elderly-user \
  --goal "Find a product and add it to the cart"
```

### Sample Persona Output (Screen Reader User)

```
Persona Test: screen-reader-user
Goal: Sign up for an account and navigate to the dashboard

Step 1: Landing page
  - Page title announced: "Welcome to App" [OK]
  - Landmark regions found: header, nav, main, footer [OK]
  - Heading hierarchy: h1 > h2 > h3 [OK]

Step 2: Navigate to signup
  - Found "Sign Up" link via navigation landmark [OK]
  - Link purpose clear from text alone [OK]

Step 3: Complete signup form
  - Email field: NO LABEL ANNOUNCED [FAIL]
  - Password field: label "Password" announced [OK]
  - Submit button: "Create Account" announced [OK]
  - Form errors: NOT announced on submission [FAIL]

Step 4: Dashboard
  - Page title changed: announced [OK]
  - Dynamic content region: no live region set [FAIL]

Result: PARTIAL SUCCESS (6/9 checks passed)
Blockers: 3 issues would prevent independent task completion
```

## Step 3: Compare Personas

Run the same journey across multiple personas to surface patterns.

```bash
npx cbrowser compare-personas \
  --personas elderly-user,power-user \
  --start "https://app.example.com" \
  --goal "Complete signup"
```

```
Persona Comparison: "Complete signup"

                    elderly-user         power-user
Completed:          Yes (with difficulty) Yes
Time to complete:   4m 12s               0m 48s
Errors encountered: 3                    0
Friction points:    5                    1
  - Small text        [x]               [ ]
  - Unclear errors    [x]               [ ]
  - Tiny click targets [x]              [ ]
  - Complex password   [x]              [x]
  - No text resize     [x]              [ ]

Top recommendation: Increase base font size and touch targets
```

## Combining Audits

Run a full accessibility workflow in one pass:

```bash
# Full audit pipeline
npx cbrowser hunt "https://app.example.com" --output a11y-report.json
npx cbrowser compare-personas \
  --personas screen-reader-user,elderly-user,power-user \
  --start "https://app.example.com" \
  --goal "Complete signup" \
  --html
```

## Next Steps

- Fix critical issues first: missing labels and contrast failures block the most users.
- Rerun `hunt` after fixes to verify remediation.
- Add persona tests to CI to prevent regressions.
- Expand to additional personas: `keyboard-only-user`, `cognitive-disability-user`, `low-vision-user`.
- Generate compliance reports with `--format wcag21-aa` for stakeholder review.
