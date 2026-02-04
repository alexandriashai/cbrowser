# Natural Language Test Suites

CBrowser supports writing browser tests in plain, human-readable text files. No code, no selectors, no framework boilerplate -- just describe what the test should do and CBrowser handles the rest.

## Available Commands

| Command | Description | Example |
|---|---|---|
| `# Test: <name>` | Start a new test case | `# Test: Login Flow` |
| `go to <url>` | Navigate to a URL | `go to https://example.com` |
| `click "<text>"` | Click an element by visible text | `click "Sign In"` |
| `click the <description>` | Click an element by description | `click the hamburger menu icon` |
| `fill "<field>" with "<value>"` | Fill a form field | `fill "Email" with "user@test.com"` |
| `fill <field> with "<value>"` | Fill a form field (no quotes on field) | `fill Email with "user@test.com"` |
| `type "<text>" in <field>` | Type into a specific field | `type "hello" in search box` |
| `verify page contains "<text>"` | Assert text is visible on page | `verify page contains "Welcome"` |
| `verify url contains "<path>"` | Assert current URL includes path | `verify url contains "/dashboard"` |
| `take screenshot` | Capture the current page state | `take screenshot` |
| `scroll down` | Scroll down the page | `scroll down` |
| `scroll up` | Scroll up the page | `scroll up` |
| `scroll down N times` | Scroll down multiple times | `scroll down 3 times` |
| `wait <N> seconds` | Pause execution | `wait 2 seconds` |
| `@viewport mobile` | Set viewport to mobile size | `@viewport mobile` |
| `@viewport tablet` | Set viewport to tablet size | `@viewport tablet` |
| `@viewport desktop` | Set viewport to desktop size | `@viewport desktop` |

## Running Tests

Run a test suite file:

```bash
npx cbrowser test-suite path/to/suite.txt
```

### Flags

| Flag | Description |
|---|---|
| `--dry-run` | Parse and validate the test file without executing any browser actions. Useful for checking syntax. |
| `--fuzzy-match` | Use fuzzy matching for click targets and text verification. Handles minor text differences gracefully. |
| `--step-through` | Pause after each step and wait for Enter to continue. Great for debugging. |
| `--verbose` | Print detailed logs for each step including timing, selectors found, and actions taken. |
| `--html` | Generate an HTML report with screenshots and pass/fail status for each step. |

### Examples

```bash
# Validate syntax without running
npx cbrowser test-suite auth-flow-suite.txt --dry-run

# Run with detailed output
npx cbrowser test-suite e-commerce-suite.txt --verbose

# Step through interactively for debugging
npx cbrowser test-suite auth-flow-suite.txt --step-through

# Generate an HTML report
npx cbrowser test-suite e-commerce-suite.txt --html --verbose
```

## Tips for Writing Robust Tests

1. **Use visible text for clicks.** Prefer `click "Sign In"` over trying to describe elements by position. CBrowser matches against visible text content first.

2. **Add waits after navigation.** Pages need time to load. A `wait 2 seconds` after `go to` or after clicks that trigger navigation prevents flaky failures.

3. **Take screenshots at key moments.** Screenshots at critical checkpoints make debugging failures much easier. Place them after verifications.

4. **Verify before acting.** Use `verify page contains` to confirm the page is in the expected state before clicking or filling forms. This catches navigation issues early.

5. **Keep tests focused.** Each `# Test:` block should test one specific flow. Smaller tests are easier to debug and maintain.

6. **Use `@viewport` for responsive testing.** Set the viewport at the start of a test to validate mobile or tablet layouts. The viewport persists for the entire test case.

7. **Use `--fuzzy-match` for dynamic content.** If text on the page varies slightly between runs (timestamps, counts), fuzzy matching prevents false failures.

8. **Use `--dry-run` to validate new tests.** Before running a new suite against a live site, dry-run it to catch typos and syntax issues.
