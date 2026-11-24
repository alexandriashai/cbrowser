# Test Workflow

Functional tests in plain English, plus visual and performance regression. Everything on this page runs without an Anthropic API key: test steps, repair, flakiness and coverage are parsed and matched locally, and the "AI" visual commands compare images with a sliced Wasserstein distance, not a model.

For a persona trying to reach a goal (patience, confusion, abandonment), use [Journey.md](./Journey.md) instead. For keyless audits (agent-readiness, accessibility, bug hunting), use [Audit.md](./Audit.md).

---

## Trigger

- "test", "run test", "write a test", "verify the flow", "regression"
- "is this test flaky", "fix the broken test", "what is untested"
- "visual regression", "did the layout change", "compare staging and production", "cross-browser", "responsive"
- "performance regression", "is it slower than before", "LCP budget"

---

## Pick the command

| Question | CLI | MCP tool |
|---|---|---|
| Does this flow still work? | `cbrowser test-suite <file.txt>` | `nl_test_file` (local only), `nl_test_inline` |
| Quick one-off check of a flow | `cbrowser test-suite --inline "..."` | `nl_test_inline` |
| Is one thing true on the page right now? | `cbrowser assert "<assertion>"` | `assert` |
| Write tests for me from a page | `cbrowser generate <url>` | `generate_tests` |
| A test broke after a UI change | `cbrowser repair-tests <file.txt>` | `repair_test` |
| Does it pass sometimes and fail sometimes? | `cbrowser flaky-check <file.txt>` | `detect_flaky_tests` |
| Which pages have no test? | `cbrowser coverage <url>` | `coverage_map` |
| Did the page change visually? | `cbrowser ai-visual test <url> <baseline>` | `visual_baseline` + `visual_regression` |
| Same rendering in Chromium, Firefox, WebKit? | `cbrowser cross-browser <url>` | `cross_browser_test`, `cross_browser_diff` |
| Does it hold up at phone, tablet, desktop sizes? | `cbrowser responsive <url>` | `responsive_test` |
| Staging vs production, old vs new | `cbrowser ab <urlA> <urlB>` | `ab_comparison` |
| Is it slower than the baseline? | `cbrowser perf-regression <url> <baseline>` | `perf_baseline` + `perf_regression` |

`list_baselines` lists saved visual and performance baselines over MCP.

---

## Natural-language test files

One file can hold several tests. A line starting with `#` begins a new test; `//` lines are comments.

```text
# Test: Search
go to https://example.com
type "running shoes" in search box
click search button
wait for "results" to appear
verify page contains "results"
verify url contains "/search"

# Test: Footer
go to https://example.com
scroll to bottom
verify "Privacy" is visible
take screenshot
```

Steps the parser understands:

- Navigate: `go to`, `navigate to`, `open`, `visit` followed by a URL
- Click: `click`, `tap`, `press` (optionally `on the`), or `click at 120,340`
- Fill: `type "value" in field`, `enter "value" into field`, `fill field with "value"`
- Select: `select "option" from dropdown`
- Scroll: `scroll to top|bottom`, `scroll up|down 3 times`, `scroll down 400 pixels`
- Wait: `wait 2 seconds`, `wait for "text" to appear`, `wait for the modal to appear`, `wait for page to load`
- Cookie: `set cookie NAME to VALUE`
- Assert (`verify`, `assert`, `check`, `ensure`): `title contains|is`, `url contains|is`, `page contains`, `"X" is visible`, `"X" exists`, `there are 3 results`
- `take screenshot`

Content assertions are exact and case-sensitive. Add `--fuzzy-match` for case-insensitive partial matching, or paste the "Try:" text a failing assertion prints, which is the matching span from the page itself.

### Run it

```bash
cbrowser test-suite tests/search.txt --dry-run          # parse only, show the steps
cbrowser test-suite tests/search.txt                    # a test stops at its first failing step
cbrowser test-suite tests/search.txt --continue-on-failure --html --output search.json
cbrowser test-suite tests/search.txt --step-through     # pause before each step
cbrowser test-suite --inline "go to https://example.com ; verify title contains Example"
```

`test-suite` takes one file. Steps in `--inline` are separated by ` ; `. Each failed step prints the expected and actual value and a screenshot path, and the command exits 1 when any test fails, so it can gate CI directly. With `--html`, the report lands next to `--output` (here `search.html`).

Add `--capture` (with `--capture-format gif,webm`) to record the run as video; see [Capture.md](./Capture.md).

### Export and notify

Every run is saved under the data directory by suite name: the file name without extension, or `Inline-Suite` for `--inline`.

```bash
cbrowser export junit search            # JUnit XML for CI dashboards
cbrowser export tap search results.tap  # TAP
cbrowser webhook add ci https://hooks.example.com/x --events test.fail --format slack
```

### Recording a flow

`record start` refuses: each CLI command is its own process, so nothing survives between commands to record. Write the flow as an inline test instead and add `--capture` if you want to watch it. For Playwright code from a page, use `cbrowser generate <url> --format playwright`.

---

## Single assertions and generated tests

```bash
cbrowser assert "page contains 'Welcome'" --url https://example.com
cbrowser assert "'Login' button exists"
cbrowser generate https://example.com --format cbrowser --output tests/generated.txt
cbrowser analyze https://example.com      # what generate saw: forms, buttons, links
```

`generate --format` takes `summary`, `cbrowser` (a file `test-suite` can run), `playwright`, or `all`. Read generated tests before trusting them: they assert what the page shows now, which may already be wrong.

---

## Repair, flakiness, coverage

```bash
cbrowser repair-tests tests/search.txt                       # suggest fixes for failing steps
cbrowser repair-tests tests/search.txt --auto-apply --verify --output tests/search.fixed.txt
cbrowser flaky-check tests/search.txt --runs 10 --threshold 20
cbrowser coverage https://example.com --tests "tests/*.txt" --html --output coverage.html
cbrowser coverage gaps https://example.com --tests "tests/*.txt"
```

- `repair-tests` finds a replacement selector or assertion for each failing step. It never edits the input file: the repaired tests are written only with `--auto-apply --output <file>`, so diff that file before replacing the original. `--verify` re-runs the repaired tests, and the command exits 1 while any failing test is left unrepaired.
- `flaky-check` runs each test `--runs` times and flags any whose result varies more than `--threshold` percent. Fix flakes with explicit waits (`wait for "X" to appear`) rather than longer timeouts.
- `coverage` crawls up to `--max-pages` (or reads `--sitemap`) and maps which pages the test files visit. `--min-coverage` sets the flag line.

Over a hosted MCP server, `nl_test_file` and file-path inputs to `coverage_map` are refused, because the file would have to be on the server; send the test text with `nl_test_inline`.

---

## Visual regression

Three levels, from strict to tolerant:

1. **Pixel diff** of the current page against a saved screenshot:
   ```bash
   cbrowser visual save home --url https://example.com
   cbrowser visual compare home --threshold 0.1
   ```
2. **Image-distance regression** that tolerates noise and says what moved (no model, no key):
   ```bash
   cbrowser ai-visual capture https://example.com --name home
   cbrowser ai-visual test https://staging.example.com home --sensitivity high --html --output home-diff.html
   cbrowser ai-visual suite visual-suite.json --html
   ```
   The test renders with the baseline's engine, device and size, so capture the baseline with the `--device` or `--viewport` you want compared.
3. **Smart baselines** (MCP only): `visual_baseline` takes several screenshots, rejects outliers and builds a consensus reference, which copes with animations and rotating content. `visual_regression` uses the smart baseline when one exists under that name, otherwise the plain comparison.

Across browsers, sizes and versions:

```bash
cbrowser cross-browser https://example.com --browsers chromium,firefox,webkit --html --output xb.html
cbrowser responsive https://example.com --viewports mobile,tablet,desktop --html --output rsp.html
cbrowser responsive viewports                                    # list size presets
cbrowser ab https://staging.example.com https://example.com --label-a Staging --label-b Production --html --output ab.html
cbrowser diff https://example.com                                # load time and resource count per engine
```

Each of these also has a `suite <file.json>` form for many URLs; the JSON shapes are in `cbrowser help`. On the visual commands, `--html --output` names the HTML file itself. `ai-visual test` exits 1 on a failed comparison and `cross-browser` exits 1 on major differences.

Firefox cannot emulate the mobile and tablet presets; use Chromium or WebKit for those.

---

## Performance regression

```bash
cbrowser perf https://example.com                                   # one measurement
cbrowser perf audit https://example.com --budget-lcp 2000           # pass/fail against budgets
cbrowser perf-baseline save https://example.com --name home --runs 5
cbrowser perf-regression https://example.com home --sensitivity ci --output perf.json
cbrowser perf-baseline list
```

`perf-regression` compares the page against the averaged baseline (LCP, FCP, CLS, TTFB, transfer size). A metric regresses only when both the percentage and the absolute change pass the profile's threshold: `strict` (FCP 10% and 50 ms), `normal` (default, 20% and 100 ms), `ci` (25% and 150 ms), `lenient` (30% and 200 ms). Override single metrics with `--threshold-lcp`, `--threshold-fcp`, `--threshold-cls`, `--threshold-ttfb`. It exits 1 on a regression.

Use at least 3 runs for a baseline (`--runs 5` on noisy hosts), and measure with the same `--device` or `--viewport` both times.

---

## A CI gate

```bash
export CBROWSER_DATA_DIR="$PWD/.cbrowser"         # baselines and results live with the job
cbrowser test-suite tests/checkout.txt --continue-on-failure --html --output results/checkout.json
cbrowser export junit checkout results/junit.xml
cbrowser ai-visual test "$STAGING_URL" home --html --output results/visual.html
cbrowser perf-regression "$STAGING_URL" home --sensitivity ci --output results/perf.json
```

Every command above exits non-zero on failure. Keep the baselines in the repo or a cache, so the comparison is against a known-good build and not the previous broken one.

---

## Tips

- Without the daemon each CLI command opens its own browser, so typed input and scroll position do not carry over between commands. Steps inside one test run share a page, which is another reason to write flows as tests.
- Keep credentials out of test files; load a saved session instead (see [Authenticate.md](./Authenticate.md)).
- `--plain` replaces emoji and box drawing with `[PASS]` and `[FAIL]` for logs and screen readers.
