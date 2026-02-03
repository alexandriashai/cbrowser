# Test Workflow

Run scripted test scenarios.

## Triggers

- "test", "run test", "run tests"
- "validate", "verify", "check"

## Natural Language Tests

Write tests in plain English:

```txt
# Test: Login Flow
go to https://example.com
click the login button
type "user@example.com" in email field
type "password123" in password field
click submit
verify url contains "/dashboard"

# Test: Search
go to https://example.com/search
type "test query" in search box
click search button
verify page contains "results"
```

## Commands

```bash
# Run test file
npx cbrowser test-suite tests.txt

# With HTML report
npx cbrowser test-suite tests.txt --html

# Continue on failure
npx cbrowser test-suite tests.txt --continue-on-failure

# Inline test
npx cbrowser test-suite --inline "go to https://example.com ; verify title contains Example"
```

## Supported Instructions

| Instruction | Examples |
|-------------|----------|
| Navigate | `go to`, `navigate to`, `open` |
| Click | `click`, `tap`, `press` |
| Fill | `type`, `fill`, `enter` |
| Wait | `wait 2 seconds`, `wait for "text"` |
| Assert | `verify`, `check`, `ensure` |
| Screenshot | `take screenshot` |

## Test Repair

```bash
# Analyze and suggest fixes
npx cbrowser repair-tests broken-test.txt

# Auto-apply repairs
npx cbrowser repair-tests tests.txt --auto-apply --verify
```

## Flaky Detection

```bash
# Run 10 times to detect flakiness
npx cbrowser flaky-check tests.txt --runs 10
```

## Output

```bash
# JSON report
npx cbrowser test-suite tests.txt --output results.json

# HTML report
npx cbrowser test-suite tests.txt --html
```
