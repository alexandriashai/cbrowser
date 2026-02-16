> **This documentation is no longer maintained here.**
>
> For the latest version, please visit: **[Testing & Quality Tools](https://cbrowser.ai/docs/Tools-Testing-Quality)**

---

# Testing & Quality Tools

**Write tests in plain English. Let AI fix them when they break.**

These 7 tools transform how you write, maintain, and debug tests. Natural language test suites, automatic repair of broken selectors, flaky test detection, and coverage mapping — all without writing a single line of test code.

---

## When to Use These Tools

- **You hate writing test scripts** but need test coverage
- **Your tests break constantly** when the UI changes
- **You have flaky tests** that randomly pass and fail
- **You don't know what's untested** and want a coverage map
- **You want autonomous bug finding** without writing test cases

---

## Tools

### `nl_test_inline`

**What it does**: Run tests written in plain English, passed directly as text.

**Why you'd use it**: Quick validation without creating test files. Great for ad-hoc testing and CI pipelines.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tests` | string | Yes | Natural language test steps, one per line |
| `stopOnFailure` | boolean | No | Stop at first failure. Default: false |
| `screenshots` | boolean | No | Capture screenshot after each step. Default: false |

**Example**:
```json
{
  "tests": "go to https://example.com\nclick the login button\nfill email with test@example.com\nfill password with secret123\nclick submit\nverify the page contains Welcome",
  "screenshots": true
}
```

### Test Syntax

| Instruction | Examples |
|-------------|----------|
| **Navigate** | `go to https://...`, `navigate to https://...`, `open https://...` |
| **Click** | `click the login button`, `click Submit`, `press Enter` |
| **Fill** | `type "value" in email field`, `fill username with "john"` |
| **Wait** | `wait 2 seconds`, `wait for "Loading" to disappear` |
| **Assert** | `verify page contains "Welcome"`, `verify url contains "/home"` |
| **Screenshot** | `take screenshot` |

---

### `nl_test_file`

**What it does**: Run a test suite from a file. Supports multiple test blocks and better organization.

**Why you'd use it**: Maintain test suites as simple text files that anyone can read and edit.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Path to the test file |
| `filter` | string | No | Run only tests matching this pattern |
| `dryRun` | boolean | No | Parse tests without executing. Default: false |

**Example**:
```json
{
  "path": "/tests/checkout-flow.txt",
  "filter": "payment"
}
```

### Test File Format

```txt
# Test: Login Flow
go to https://example.com
click the login button
fill email with user@example.com
fill password with password123
click submit
verify url contains /dashboard

# Test: Failed Login
go to https://example.com/login
fill email with wrong@example.com
fill password with badpassword
click submit
verify page contains "Invalid credentials"
```

---

### `generate_tests`

**What it does**: Analyze a page and automatically generate test scenarios covering its functionality.

**Why you'd use it**: Bootstrap test coverage for a new page or discover tests you didn't think to write.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | Page to analyze |
| `depth` | string | No | Test depth: `smoke`, `standard`, `comprehensive`. Default: `standard` |
| `focus` | string | No | Focus area: `forms`, `navigation`, `errors`, `all` |

**Example**:
```json
{
  "url": "https://example.com/checkout",
  "depth": "comprehensive",
  "focus": "forms"
}
```

**Returns**: Generated test file content with scenarios for happy paths, edge cases, and error conditions.

---

### `repair_test`

**What it does**: Automatically fix a broken test by analyzing what changed and updating selectors/assertions.

**Why you'd use it**: When a test fails due to UI changes, repair it instead of rewriting it.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `testPath` | string | Yes | Path to the broken test file |
| `errorContext` | string | No | Error message or failure details |
| `autoApply` | boolean | No | Apply fixes automatically. Default: false |
| `verify` | boolean | No | Run repaired test to verify fix. Default: true |

**Example**:
```json
{
  "testPath": "/tests/checkout.txt",
  "errorContext": "Element 'Submit Order' not found",
  "autoApply": true
}
```

**Returns**: Proposed fixes, what changed, and (if verified) confirmation the repaired test passes.

---

### `detect_flaky_tests`

**What it does**: Run tests multiple times to identify which ones are unreliable.

**Why you'd use it**: Find tests that randomly fail so you can fix them or quarantine them.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `testPath` | string | Yes | Test file to check |
| `runs` | number | No | Number of runs. Default: 5 |
| `threshold` | number | No | Failure percentage to mark as flaky. Default: 20 |

**Example**:
```json
{
  "testPath": "/tests/full-suite.txt",
  "runs": 10,
  "threshold": 10
}
```

**Returns**: List of flaky tests with failure rates, timing variance, and suggested fixes.

---

### `coverage_map`

**What it does**: Generate a test coverage map showing which pages and features are tested.

**Why you'd use it**: Find gaps in test coverage before they become bugs in production.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteUrl` | string | Yes | Base URL of the site |
| `testsPath` | string | Yes | Path to test files (supports glob patterns) |
| `depth` | number | No | Crawl depth for discovering pages. Default: 3 |

**Example**:
```json
{
  "siteUrl": "https://example.com",
  "testsPath": "/tests/**/*.txt",
  "depth": 3
}
```

**Returns**: Coverage matrix showing each page, what tests cover it, and what's untested.

---

### `hunt_bugs`

**What it does**: Autonomously explore a site looking for bugs, errors, and accessibility issues — without being told what to test.

**Why you'd use it**: Discover issues you didn't know existed. Great for exploratory testing and security reconnaissance.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | Starting URL |
| `scope` | string | No | Bug types: `all`, `functional`, `visual`, `accessibility`, `security` |
| `depth` | number | No | Exploration depth. Default: 3 |
| `maxPages` | number | No | Maximum pages to visit. Default: 20 |

**Example**:
```json
{
  "url": "https://example.com",
  "scope": "all",
  "depth": 4,
  "maxPages": 50
}
```

**Returns**: List of discovered issues with severity, reproduction steps, and screenshots.

### What `hunt_bugs` Looks For

- **Functional**: Broken links, form errors, JavaScript exceptions, failed network requests
- **Visual**: Layout breaks, overlapping elements, missing images, rendering issues
- **Accessibility**: Missing alt text, low contrast, keyboard traps, ARIA violations
- **Security**: Exposed credentials, insecure forms, missing HTTPS, data in URLs

---

## Natural Language Test Advantages

| Traditional Tests | CBrowser NL Tests |
|-------------------|-------------------|
| `await page.click('#btn-submit-order-v3')` | `click the Submit Order button` |
| Breaks when ID changes | Finds button by intent |
| Requires developer to write | Anyone can write |
| Hard to read for non-devs | Self-documenting |
| Manual repair on failure | Auto-repair available |

---

## Related Documentation

- [Natural Language Tests](/docs/Natural-Language-Tests/) — Deep dive on NL test syntax
- [AI Test Repair](/docs/AI-Test-Repair/) — How repair works
- [Flaky Test Detection](/docs/Flaky-Test-Detection/) — Dealing with unreliable tests
- [Test Coverage Map](/docs/Test-Coverage-Map/) — Understanding coverage

---

*Last updated: v17.6.0*
