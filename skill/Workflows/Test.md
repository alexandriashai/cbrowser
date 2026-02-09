# Test Workflow

Run automated user testing scenarios with personas to validate UX flows.

---

## Trigger

- "test", "run test", "user test"
- "validate flow", "check journey"
- `bun run Tools/CBrowser.ts test <scenario>`

---

## Concepts

### Test Scenario

A defined user journey with:
- **Persona**: Who is performing the test
- **Goal**: What they're trying to accomplish
- **Steps**: Actions to take
- **Assertions**: What should be true
- **Metrics**: What to measure

### Test Suite

A collection of related scenarios:
- Multiple personas testing same flow
- Same persona testing multiple flows
- Regression tests for critical paths

---

## Scenario Definition

```yaml
# ~/.claude/skills/CBrowser/.memory/scenarios/provider-signup.yaml

name: provider-signup
description: "Test the provider registration flow"
persona: provider-signup

goal: "Complete provider registration and reach pending verification status"

preconditions:
  - "Not logged in"
  - "No existing account with test email"

steps:
  - name: "Find signup"
    action: navigate
    url: "https://blackbook.reviews"
    then:
      - find: "provider signup button"
      - assert: "button is visible and clickable"

  - name: "Start registration"
    action: click
    target: "Become a Provider button"
    then:
      - wait_for: "registration form"
      - assert: "form has email field"

  - name: "Fill registration"
    action: fill_form
    fields:
      email: "$persona.test_email"
      display_name: "Test Provider"
      password: "$credentials.password"
      confirm_password: "$credentials.password"
    then:
      - assert: "no validation errors"

  - name: "Accept terms"
    action: click
    target: "terms checkbox"
    then:
      - assert: "checkbox is checked"

  - name: "Submit registration"
    action: click
    target: "submit button"
    zone: red  # Verification required
    then:
      - wait_for: "success message or next step"
      - assert: "no error messages"

  - name: "Verify account created"
    action: verify
    assertions:
      - "URL contains /provider/onboarding OR /verify-email"
      - "Welcome message visible"
      - "Account status is pending"

success_criteria:
  - "All steps completed without error"
  - "Account created in database"
  - "Verification email sent"

metrics:
  - time_to_complete
  - error_count
  - steps_with_friction
  - accessibility_score
```

---

## Commands

### Run Single Scenario

```bash
bun run Tools/CBrowser.ts test "provider-signup"
```

### Run with Specific Persona

```bash
bun run Tools/CBrowser.ts test "checkout" --persona mobile-user
```

### Run Test Suite

```bash
bun run Tools/CBrowser.ts test suite "critical-paths"
```

### Run All Tests

```bash
bun run Tools/CBrowser.ts test all
```

### Generate Test Report

```bash
bun run Tools/CBrowser.ts test "provider-signup" --report html
# Generates: /tmp/cognitive/reports/provider-signup-2026-01-31.html
```

---

## Test Execution

```
┌─────────────────────────────────────────────────────────────┐
│                    TEST EXECUTION                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. SETUP                                                   │
│     ├─ Load scenario definition                             │
│     ├─ Load persona configuration                           │
│     ├─ Configure browser (viewport, network, etc.)          │
│     ├─ Load credentials if needed                           │
│     └─ Verify preconditions                                 │
│                                                             │
│  2. EXECUTE STEPS                                           │
│     For each step:                                          │
│     ├─ Screenshot before                                    │
│     ├─ Execute action                                       │
│     ├─ Wait for result                                      │
│     ├─ Screenshot after                                     │
│     ├─ Run assertions                                       │
│     ├─ Record metrics                                       │
│     └─ Note friction points                                 │
│                                                             │
│  3. EVALUATE                                                │
│     ├─ Check success criteria                               │
│     ├─ Calculate metrics                                    │
│     ├─ Score accessibility                                  │
│     └─ Identify issues                                      │
│                                                             │
│  4. REPORT                                                  │
│     ├─ Generate test report                                 │
│     ├─ Save screenshots                                     │
│     ├─ Log results                                          │
│     └─ Output summary                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Assertions

### Element Assertions

```yaml
assertions:
  - element_visible: "submit button"
  - element_not_visible: "error message"
  - element_enabled: "next button"
  - element_disabled: "submit button"
  - element_text_contains: ["heading", "Welcome"]
  - element_count: ["product cards", ">= 3"]
```

### Page Assertions

```yaml
assertions:
  - url_contains: "/dashboard"
  - url_not_contains: "/login"
  - title_contains: "Dashboard"
  - page_has_no_errors: true  # No console errors
  - page_loads_under: "3s"
```

### Accessibility Assertions

```yaml
assertions:
  - has_heading_hierarchy: true
  - all_images_have_alt: true
  - all_inputs_have_labels: true
  - focus_visible: true
  - color_contrast_passes: true
```

### Form Assertions

```yaml
assertions:
  - form_has_field: "email"
  - field_has_validation: ["email", "email format"]
  - required_fields_marked: true
  - error_messages_helpful: true
```

---

## Friction Detection

CBrowser automatically detects UX friction:

| Friction Type | Detection | Severity |
|--------------|-----------|----------|
| Slow load | Page load > 3s | Warning |
| Small touch target | Button < 44px | Warning (mobile) |
| Missing label | Input without label | Error (a11y) |
| Confusing error | Generic error message | Warning |
| Dead end | No clear next action | Error |
| Rage clicks | Multiple rapid clicks | Error |
| Abandoned form | Form started but not submitted | Warning |

---

## Test Report

```markdown
# Test Report: provider-signup
**Date:** 2026-01-31 22:30:00
**Persona:** provider-signup
**Duration:** 45.2s

## Summary
- **Status:** ⚠️ PASSED WITH WARNINGS
- **Steps Completed:** 6/6
- **Assertions Passed:** 14/15
- **Friction Points:** 2

## Step Results

### 1. Find signup ✅
- Time: 1.2s
- Screenshot: [view](./screenshots/001-find-signup.png)

### 2. Start registration ✅
- Time: 0.8s
- Screenshot: [view](./screenshots/002-start-registration.png)

### 3. Fill registration ⚠️
- Time: 5.2s
- Friction: Password field requirements not shown until error
- Screenshot: [view](./screenshots/003-fill-registration.png)

### 4. Accept terms ✅
- Time: 0.5s

### 5. Submit registration ✅
- Time: 2.1s
- Zone: Red (verified with user)

### 6. Verify account created ✅
- Time: 1.8s
- Assertions: 3/3 passed

## Friction Points

1. **Password requirements hidden** (Step 3)
   - Persona: "As a provider signing up, I had to guess password requirements"
   - Recommendation: Show password requirements before user types
   - Severity: Warning

2. **Terms checkbox small on mobile** (Step 4)
   - Target size: 24px (should be 44px+)
   - Recommendation: Increase touch target
   - Severity: Warning (mobile only)

## Metrics
- Total time: 45.2s
- Errors encountered: 1 (password validation)
- Pages loaded: 3
- API calls: 12
- Accessibility score: 87/100

## Screenshots
[View all screenshots](./screenshots/)
```

---

## Test Suites

Group related tests:

```yaml
# ~/.claude/skills/CBrowser/.memory/suites/critical-paths.yaml

name: critical-paths
description: "Critical user journeys that must always work"

scenarios:
  - provider-signup
  - client-signup
  - provider-login
  - client-login
  - submit-review
  - view-profile

run_config:
  parallel: false  # Run sequentially
  stop_on_failure: false  # Continue after failures
  report_format: html
  notify_on_complete: true
```

Run suite:
```bash
bun run Tools/CBrowser.ts test suite "critical-paths"
```

---

## npm Package Test Features (v7.4.15-7.4.17)

The npm package (`npx cbrowser`) provides additional test flags:

```bash
# Dry run: parse and display test steps without executing
npx cbrowser test-suite tests.txt --dry-run

# Fuzzy matching: case-insensitive, whitespace-normalized text assertions
npx cbrowser test-suite tests.txt --fuzzy-match

# Step-through: interactive step-by-step execution (Enter=execute, s=skip, q=quit)
npx cbrowser test-suite tests.txt --step-through

# Verbose debugging: on failure, shows available elements and AI suggestions
npx cbrowser click "search button" --verbose
npx cbrowser fill "email" "test" --verbose --debug-dir ./debug

# Dismiss overlays before interacting
npx cbrowser click "Add to Cart" --dismiss-overlays --url https://example.com
```

---

## CI/CD Integration

```yaml
# GitHub Actions example
- name: Run CBrowser Tests
  run: |
    bun run ~/.claude/skills/CBrowser/Tools/CBrowser.ts \
      test suite "critical-paths" \
      --headless \
      --report junit \
      --output ./test-results/

- name: Upload Test Results
  uses: actions/upload-artifact@v3
  with:
    name: test-results
    path: ./test-results/
```

---

## Constitutional Compliance

Testing follows all constitutional principles:

- **Green Zone**: Navigation, screenshots, reading
- **Yellow Zone**: Form fills, clicks (logged)
- **Red Zone**: Submissions, account creation (requires `zone: red` in step)

In automated CI runs, Red Zone actions require pre-approval in test definition.
