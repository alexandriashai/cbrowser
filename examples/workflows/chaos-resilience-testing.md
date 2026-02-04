# Chaos Engineering for Web Applications

Inject real-world failures into your web application and verify it degrades gracefully. Simulate network outages, slow responses, missing elements, and server errors to build confidence in your app's resilience.

## Prerequisites

- Node.js 18+
- CBrowser installed: `npm install -g cbrowser`
- Target application at `https://app.example.com`

## Step 1: Run a Chaos Test

CBrowser injects failures while monitoring how the application responds.

```bash
npx cbrowser chaos "https://app.example.com/dashboard"
```

This runs a default suite of chaos scenarios: network interruptions, slow API responses, DOM element removal, and error injection.

## Step 2: Target Specific Chaos Scenarios

Focus on individual failure modes for deeper analysis.

```bash
# Simulate network failures (offline, intermittent, packet loss)
npx cbrowser chaos "https://app.example.com/dashboard" --scenario network-failure

# Simulate slow API responses (2s, 5s, 10s, 30s delays)
npx cbrowser chaos "https://app.example.com/dashboard" --scenario slow-responses

# Remove critical DOM elements mid-session
npx cbrowser chaos "https://app.example.com/dashboard" --scenario element-removal

# Inject HTTP 500 errors on API calls
npx cbrowser chaos "https://app.example.com/dashboard" --scenario server-errors
```

## Sample Chaos Test Output

```
Chaos Test Report: https://app.example.com/dashboard
Generated: 2026-02-03T16:00:00Z
Scenarios executed: 4

=== Network Failure ===

  Test: Complete offline (network disabled for 10s)
    App behavior: Loading spinner appeared after 3s [OK]
    Error message: "You're offline. Changes will sync when reconnected." [OK]
    Data loss: None (localStorage cache used) [OK]
    Recovery: Auto-reconnected and synced within 2s [OK]
    Result: PASS

  Test: Intermittent connectivity (50% packet loss for 15s)
    App behavior: Partial data loaded, retry indicators shown [OK]
    Error message: None shown to user [WARN - silent failure]
    Data loss: 2 API calls dropped without retry [FAIL]
    Recovery: Required manual page refresh [FAIL]
    Result: FAIL
    Recommendation: Implement automatic retry with exponential backoff

=== Slow Responses ===

  Test: API latency 5s
    App behavior: Loading skeleton displayed [OK]
    User feedback: Progress indicator visible [OK]
    Timeout handling: No timeout applied [WARN]
    Result: PASS

  Test: API latency 30s
    App behavior: Frozen UI, no loading indicator [FAIL]
    User feedback: None for 30 seconds [FAIL]
    Timeout handling: No timeout, user stuck [FAIL]
    Result: FAIL
    Recommendation: Set 10s timeout with retry option and loading state

=== Element Removal ===

  Test: Navigation bar removed
    App behavior: No JavaScript errors [OK]
    Fallback: Breadcrumb links still functional [OK]
    Result: PASS

  Test: Data table removed mid-render
    App behavior: Uncaught TypeError in console [FAIL]
    Fallback: Blank screen, no error boundary [FAIL]
    Result: FAIL
    Recommendation: Add React error boundaries around data components

=== Server Errors (HTTP 500) ===

  Test: Dashboard API returns 500
    App behavior: "Something went wrong" message displayed [OK]
    Retry option: "Try again" button present and functional [OK]
    Logging: Error logged to monitoring service [OK]
    Result: PASS

  Test: Auth API returns 500
    App behavior: Silent failure, dashboard shows stale data [FAIL]
    User feedback: No indication of auth failure [FAIL]
    Result: FAIL
    Recommendation: Redirect to login with "Session expired" message

Summary: 4 passed, 4 failed, 2 warnings
Resilience score: 5.2/10
```

## Step 3: Chaos with Assertions

Combine chaos injection with explicit assertions to create repeatable resilience tests.

```bash
npx cbrowser chaos "https://app.example.com/dashboard" \
  --scenario network-failure \
  --assert "error message is visible within 5 seconds" \
  --assert "no data is lost after reconnection" \
  --assert "no uncaught JavaScript errors in console"
```

```
Chaos + Assertions: network-failure

  [PASS] error message is visible within 5 seconds (shown at 3.1s)
  [PASS] no data is lost after reconnection (all items verified)
  [FAIL] no uncaught JavaScript errors in console
    Found: TypeError: Cannot read properties of undefined (reading 'map')
    Source: dashboard.js:142

Results: 2 passed, 1 failed
```

## CI Integration

Add resilience checks to your deployment pipeline:

```yaml
- name: Chaos Resilience Gate
  run: |
    npx cbrowser chaos "$STAGING_URL/dashboard" --scenario network-failure --ci
    npx cbrowser chaos "$STAGING_URL/dashboard" --scenario slow-responses --ci
    npx cbrowser chaos "$STAGING_URL/checkout" --scenario server-errors --ci
```

## Next Steps

- Start with `network-failure` and `server-errors` scenarios, as these are the most common production issues.
- Set a resilience score threshold in CI: `--min-score 7.0`.
- Combine chaos tests with visual regression to catch UI breakage during failures.
- Add custom scenarios for your domain: payment gateway timeouts, third-party script failures, CDN outages.
- Run chaos tests against staging before every production deploy.
