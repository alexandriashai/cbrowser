# Multi-Persona Comparison Report

Run the same user journey through multiple personas to uncover usability gaps across different user types. Generate a comparative report showing where each persona succeeds, struggles, or fails entirely.

## Prerequisites

- Node.js 18+
- CBrowser installed: `npm install -g cbrowser`
- Target application at `https://shop.example.com`

## Step 1: Establish a Visual Baseline

Capture the current state of the application before running persona tests.

```bash
npx cbrowser visual-baseline "https://shop.example.com" --name pre-persona-test
```

This gives you a reference point to pair persona findings with specific UI elements.

## Step 2: Define the Journey

Choose a complete user journey that exercises core functionality. The comparison will run each persona through the identical goal.

```bash
npx cbrowser compare-personas \
  --personas power-user,first-timer,elderly-user,mobile-user \
  --start "https://shop.example.com" \
  --goal "Complete purchase" \
  --html
```

## Sample Report Output

```
Persona Comparison Report
Journey: "Complete purchase"
Start URL: https://shop.example.com
Generated: 2026-02-03T11:00:00Z

=== Summary Table ===

Metric              power-user   first-timer  elderly-user  mobile-user
-----------------------------------------------------------------------
Completed:          Yes          Yes          No            Yes
Time to complete:   1m 04s       3m 47s       --            2m 22s
Total clicks:       8            14           21 (stuck)    11
Errors hit:         0            2            4             1
Friction points:    1            5            8             3
Accessibility:      No issues    1 issue      6 issues      2 issues
Satisfaction est.:  High         Medium       Low           Medium

=== Detailed Breakdown by Persona ===

--- power-user ---
  Path: Home > Search "headphones" > Product page > Add to cart > Checkout > Confirm
  Friction: Checkout form requires re-entering saved address (minor annoyance)
  Notes: Used keyboard shortcuts, skipped optional fields, completed efficiently

--- first-timer ---
  Path: Home > Browse categories > Subcategory > Product page > Add to cart > Cart
       > Confused by "Guest checkout" vs "Sign up" > Signed up > Checkout > Confirm
  Friction:
    - Could not find search bar immediately (hidden behind icon)
    - "Guest checkout" label unclear, hesitated for 18s
    - Password requirements not shown until after submission
    - Shipping options lack delivery date estimates
    - Coupon field prominent but no coupon available (felt like missing a deal)
  Errors:
    - Password rejected twice before requirements appeared
    - Zip code validation rejected valid format "K1A 0B1"

--- elderly-user ---
  Path: Home > Struggled with navigation > Found products > Product page
       > Add to cart > Cart > STUCK at checkout
  Friction:
    - Navigation dropdown menus close too quickly (requires precise mouse movement)
    - Product text size 13px, hard to read without zooming
    - "Add to Cart" button low contrast (light gray on white)
    - Cart icon badge too small to notice (12px)
    - Form fields lack visible borders (only bottom underline)
    - Checkout timeout (60s) expired during address entry
    - No option to increase text size
    - Error messages disappear after 3 seconds
  BLOCKED: Session timed out during checkout, no recovery path offered
  Result: COULD NOT COMPLETE PURCHASE

--- mobile-user ---
  Path: Home > Hamburger menu > Products > Product page > Add to cart > Checkout > Confirm
  Friction:
    - Hamburger menu icon small (32x32, below 44px minimum)
    - Product image gallery swipe conflicts with page scroll
    - Keyboard covers checkout form fields on iOS
  Errors:
    - Tapped "Remove" instead of "Update quantity" (buttons too close)

=== Cross-Persona Issue Heatmap ===

Issue                          power  first  elderly  mobile
-------------------------------------------------------------
Small touch/click targets       -      -      HIGH     MED
Text readability                -      -      HIGH     LOW
Navigation complexity           -      MED    HIGH     LOW
Form usability                  -      MED    HIGH     MED
Error handling                  -      HIGH   HIGH     LOW
Session/timeout                 -      -      HIGH     -
Discoverability                 -      HIGH   MED      LOW

=== Top Recommendations (Priority Order) ===

1. CRITICAL: Add session timeout warning with option to extend (blocks elderly-user)
2. HIGH: Increase minimum touch target size to 44x44px across all interactive elements
3. HIGH: Show password requirements before first submission attempt
4. HIGH: Increase base font size to 16px minimum, add text resize controls
5. MEDIUM: Make search bar visible by default, not hidden behind an icon
6. MEDIUM: Add visible borders to all form fields
7. LOW: Add estimated delivery dates to shipping options
```

## Step 3: Generate Shareable HTML Report

The `--html` flag produces a standalone HTML file with interactive filtering.

```bash
# Report saved to .cbrowser/reports/persona-comparison-<timestamp>.html
open .cbrowser/reports/persona-comparison-*.html
```

The HTML report includes expandable sections for each persona, clickable screenshots at each step, and a filterable issue table.

## Step 4: Retest After Fixes

After addressing the findings, rerun the comparison to measure improvement.

```bash
# Run the same comparison after implementing fixes
npx cbrowser compare-personas \
  --personas power-user,first-timer,elderly-user,mobile-user \
  --start "https://shop.example.com" \
  --goal "Complete purchase" \
  --html

# Compare visual changes against the pre-fix baseline
npx cbrowser visual-regression "https://shop.example.com" --baseline pre-persona-test
```

## Next Steps

- Address critical and high-priority issues first, then retest the blocked persona (elderly-user).
- Add more personas as needed: `keyboard-only-user`, `screen-reader-user`, `low-bandwidth-user`.
- Run persona comparisons on other key journeys: account creation, returns, support contact.
- Track improvement over time by archiving reports from each sprint.
- Set a CI gate: all personas must complete the journey before merging to main.
