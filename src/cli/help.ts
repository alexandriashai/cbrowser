/**
 * The help text and `help <command>` / `<command> --help`.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */

import { formatViewportPresetList } from "../visual/index.js";
import { listAccessibilityPersonas } from "../personas.js";
import { VERSION } from "../version.js";

/**
 * The full help text.
 *
 * Returned rather than printed so `help <command>` can slice a single section
 * out of it - one source of truth for both the global dump and per-command
 * help, which is what stops the two drifting apart.
 */
function helpText(): string {
  // Pad version string to maintain banner alignment
  const versionStr = `CBrowser CLI v${VERSION}`;
  const padding = ' '.repeat(Math.max(0, (80 - 2 - versionStr.length) / 2));
  const rightPadding = ' '.repeat(Math.max(0, 80 - 2 - padding.length - versionStr.length));

  return (`
╔══════════════════════════════════════════════════════════════════════════════╗
║${padding}${versionStr}${rightPadding}║
║    AI-powered browser automation with cross-browser visual testing          ║
║                                                                              ║
║    📚 Documentation: https://cbrowser.ai/docs                                ║
║    📦 npm: https://npmjs.com/package/cbrowser                                ║
╚══════════════════════════════════════════════════════════════════════════════╝

NAVIGATION
  navigate <url>              Navigate and take screenshot
  screenshot [url] [path]     Take a screenshot (of <url> when given, else the current page)
    --no-restore                Don't reload the saved URL first. Without a daemon that
                                leaves no page, so it needs <url>; to capture the page
                                earlier commands left, use a daemon (see DAEMON MODE)

INTERACTION
  click <selector>            Click element (tries text, label, role, CSS)
    --url <url>               Navigate to URL first, then click
    --verbose                 Show available elements and AI suggestions on failure
    --debug-dir <dir>         Save debug screenshots to directory
  fill <selector> <value>     Fill input field
    --url <url>               Navigate to URL first, then fill
    --verbose                 Show available inputs and AI suggestions on failure
    --debug-dir <dir>         Save debug screenshots to directory
  hover <selector>            Hover over an element
  press <key>                 Press a single key (Enter, Tab, Escape, Control+a)
  type "<text>"               Type a string into the focused element
    --delay <ms>              Per-character delay (default: 50)
  drag <source> <target>      Drag one element onto another
  upload <selector> <file>    Set a file input's value
    --url <url>               Navigate to URL first
    For sequences, chords or held modifiers, see 'cbrowser help keyboard'.

EXTRACTION
  extract <what>              Extract data (links, images, headings, forms)

SCRIPTING
  evaluate "<js>"             Run JavaScript in the page and print the result
    --force                   Required: page script is red zone (it can click,
                              submit or delete without the element gate), so
                              evaluate refuses and runs nothing without it
    --file <path>             Read the script from a file instead of argv
    --arg <json>              Argument for the script (repeatable, JSON-typed)
    --json                    Always print JSON
    --raw                     Print the raw value, unquoted
    --wait-for <selector>     Wait for the selector before evaluating
    --expect-truthy           Exit 1 when the result is falsy (CI assertion)
    --timeout <ms>            How long --wait-for waits: ms, or 5s / 2m (default: 30000)
    Examples:
      cbrowser evaluate "document.title" --force
      cbrowser evaluate --file check.js --arg '"#main"' --expect-truthy --force
      cbrowser evaluate "(sel) => !!document.querySelector(sel)" --arg '"nav"' --force

KEYBOARD
  keyboard <token> [token...]  Send a key sequence: chords, keys and text
    --selector <sel>          Focus this element first
    --delay <ms>              Delay between steps (default: 50)
    --hold <mod>              Hold a modifier across the whole sequence
    --repeat <n>              Repeat the whole sequence n times
    --text                    Treat every token as literal text (for "+" in text)
    --url <url>               Navigate to URL first
    A token with modifiers is a chord (Control+A); a known key name is that key
    (Enter, Tab, ArrowLeft); anything else is typed as literal text. Unknown
    key names are rejected, not typed. For a single key use 'press', for a
    single string use 'type'.
    Examples:
      cbrowser keyboard "Control+A" "Delete" "Hello world"
      cbrowser keyboard "ArrowRight" --repeat 5 --hold Shift
      cbrowser keyboard "Tab" "Tab" "Enter" --selector "#email" --delay 120

SITE EXPLORATION (API-powered)
  explore <persona>           Short cognitive journey (needs an Anthropic API key; costs tokens)
    --start <url>             Starting URL (required)
    --goal <goal>             What to accomplish
    --record-video            Record exploration as video
    Note: the keyless heuristic explorer was removed in 20.0.0; its success verdicts were not accurate.

COGNITIVE JOURNEY (API-powered, realistic user simulation)
  cognitive-journey [name]    Simulate a real user with emotions, patience, and abandonment
                              (name, optional: labels the run, its trace and its capture)
    --capture                 Record the run to GIF/WebP/video
    --capture-fps <n>         Capture frame rate (default: 10)
    --capture-format <list>   gif,webp,webm,mp4 (default: gif)
    --capture-out <dir>       Capture output directory
    --persona <name>          Persona name or description (default: first-timer)
    --start <url>             Starting URL (required)
    --goal <goal>             Goal statement (required)
    --max-steps <n>           Maximum steps before timeout (default: 50)
    --max-time <s>            Maximum time in seconds (default: 120)
    --verbose                 Show step-by-step narration and internal monologue
    --no-vision               Disable vision mode (text-only, less accurate but faster)
    --output <file>           Save JSON report to file
    --trace                   Record the journey to ~/.cbrowser/traces/<id>.jsonl
    --replay-trace <file>     Replay a recorded journey: no model calls, no API key
    --persistent              Run in the shared browser profile (default: a fresh one,
                              so the persona starts as a new visitor)
    --timezone <tz>           Override persona timezone (e.g., "America/New_York", "Europe/London")
    --locale <loc>            Override persona locale (e.g., "en-US", "de-DE")
    --geo <preset|lat,lon>    Override persona location (also --geolocation <lat,lng>)

    Why use this over 'explore'?
      • Tracks cognitive state: patience, frustration, confusion
      • Can realistically abandon: "This is too confusing, I give up"
      • Makes human-like mistakes based on persona traits
      • Costs API tokens but provides genuine UX insights

    Examples:
      cbrowser cognitive-journey --start "https://example.com" \\
        --goal "Sign up for an account" --persona first-timer
      cbrowser cognitive-journey --start "https://shop.example.com" \\
        --goal "Find and purchase a blue shirt" --persona elderly-user --verbose

    Note: Requires Anthropic API key. Set with: cbrowser config set-api-key <key>

MULTI-PERSONA COMPARISON
  compare-personas            Compare multiple personas on the same journey
    --start <url>             Starting URL (required)
    --goal <goal>             What to accomplish (required)
    --personas <list>         Comma-separated persona names
    --concurrency <n>         Max parallel browsers (default: 3)
    --device <name>           Device every journey emulates
    --viewport <WxH>          Page size for every journey
    --output <file>           Save JSON report to file
    --html                    Generate HTML report
    Examples:
      cbrowser compare-personas --start "https://example.com" \\
        --goal "Complete checkout" \\
        --personas power-user,first-timer,elderly-user,mobile-user

NATURAL LANGUAGE TEST SUITES
  test-suite <file.txt>        Run tests written in plain English
                               Saves each run for 'export'; sends test.pass or
                               test.fail to webhooks ('webhook add')
    --continue-on-failure      Keep running after a test fails
    --screenshot-on-failure    Take screenshots on failure (default: true)
    --output <file>            Save JSON report to file
    --html                     Generate HTML report
    --timeout <ms>             Timeout per step (default: 30000)
    --dry-run                  Parse and display test steps without executing
    --fuzzy-match              Use case-insensitive fuzzy matching for assertions
    --step-through             Pause before each step for interactive execution
  test-suite --inline "..."    Run inline test (semicolon-separated steps)
    --capture                 Record the run to GIF/WebP/video
    --capture-fps <n>         Capture frame rate (default: 10)
    --capture-format <list>   gif,webp,webm,mp4 (default: gif)
    --capture-out <dir>       Capture output directory
    Examples:
      cbrowser test-suite login-flow.txt --html
      cbrowser test-suite --inline "go to https://example.com ; click login ; verify url contains /dashboard"
      cbrowser test-suite login-flow.txt --dry-run
      cbrowser test-suite login-flow.txt --step-through

    Test File Format:
      # Test: Login Flow
      go to https://example.com
      click the login button
      type "user@example.com" in email field
      type "password123" in password field
      click submit
      verify url contains "/dashboard"

      # Test: Search
      go to https://example.com
      type "test query" in search box
      click search button
      verify page contains "results"

AI TEST REPAIR
  repair-tests <file.txt>      Analyze failing tests and suggest/apply repairs
    --auto-apply               Automatically apply the best repair
    --verify                   Re-run tests after repair to verify they pass
    --output <file>            Save repaired tests to new file
    --json-out <file>          Save repair report as JSON (--json prints it)
    --device, --viewport, --browser, --no-headless   The browser the tests run in
    Examples:
      cbrowser repair-tests broken-test.txt
      cbrowser repair-tests tests.txt --auto-apply --verify
      cbrowser repair-tests tests.txt --auto-apply --output fixed-tests.txt

FLAKY TEST DETECTION
  flaky-check <file.txt>       Run tests multiple times to detect flaky tests
    --runs <n>                 Number of runs per test (default: 5)
    --threshold <n>            Flakiness % threshold to flag (default: 20)
    --delay <ms>               Delay between runs (default: 500)
    --output <file>            Save JSON report to file
    --device, --viewport, --browser, --no-headless   The browser every run uses
    Examples:
      cbrowser flaky-check tests.txt
      cbrowser flaky-check tests.txt --runs 10
      cbrowser flaky-check tests.txt --runs 5 --threshold 30 --output flaky-report.json

TEST COVERAGE MAP
  coverage <url>               Generate test coverage map for a site
    --tests <glob>             Test files to analyze (default: tests/*.txt)
    --sitemap <url>            Use sitemap.xml instead of crawling
    --max-pages <n>            Max pages to crawl (default: 100)
    --include <pattern>        Only include paths matching pattern
    --exclude <pattern>        Exclude paths matching pattern
    --min-coverage <n>         Min coverage % to not flag (default: 50)
    --html                     Generate HTML report
    --output <file>            Save the report (JSON if the name ends in .json, else text)
    --device, --viewport, --browser, --no-headless   The crawl's browser (not with --sitemap)
    Examples:
      cbrowser coverage "https://example.com" --tests "tests/*.txt"
      cbrowser coverage "https://example.com" --sitemap "https://example.com/sitemap.xml"
      cbrowser coverage "https://example.com" --html --output coverage.html
      cbrowser coverage "https://example.com" --exclude "/admin" --min-coverage 70

  coverage gaps <url>          Show only untested pages (quick analysis)
    --tests <glob>             Test files to analyze
    --sitemap <url>            Use sitemap.xml

PERSONAS
  persona list                List all personas (built-in + custom)
  persona create "<desc>"     Create persona from natural language description
    --name <name>             Persona name (default: generated from description)
    Examples:
      cbrowser persona create "impatient developer who hates slow UIs"
      cbrowser persona create "elderly user new to computers" --name grandma
      cbrowser persona create "distracted teen on mobile phone"
  persona show <name>         Show detailed persona configuration
  persona delete <name>       Delete a custom persona
  persona export <name>       Export persona to JSON file
  persona import <file>       Import persona from JSON file
  persona cleanup             Remove custom personas that fail validation
    --dry-run                 List them without removing anything

SESSION MANAGEMENT
  session save <name>         Save browser session (cookies, storage, URL)
    --url <url>               Navigate to URL before saving
  session load <name>         Load a saved session
  session list                List all saved sessions
  session delete <name>       Delete a saved session
  session show <name>         Show a saved session's cookies, storage and URL
  session cleanup             Delete saved sessions older than N days
    --older-than <days>       Age in days (default: 30)
  session export <name>       Export a session to a JSON file
    --output <file>           File to write (default: <name>.json)
  session import <file>       Import a session from a JSON file

COOKIE MANAGEMENT
  cookie list                 List all cookies for current page
    --url <url>               Navigate to URL first
  cookie set <name> <value>   Set a cookie
    --domain <domain>         Cookie domain
    --path <path>             Cookie path (default: /)
  cookie delete <name>        Delete a cookie
    --domain <domain>         Only delete for this domain
  cookie clear                Clear all cookies

DEVICE EMULATION
  device list [filter]        List device presets, one per line (filter by name)
  device set <name>           Set device emulation for session
    Example: cbrowser device set iphone-15

GEOLOCATION
  geo list                    List available location presets
  geo set <location>          Set geolocation (preset name or lat,lon)
    Examples:
      cbrowser geo set new-york
      cbrowser geo set 37.7749,-122.4194

PERFORMANCE
  perf [url]                  Collect performance metrics
  perf audit [url]            Run performance audit against budget
    --budget-lcp <ms>         LCP budget (default: 2500)
    --budget-fcp <ms>         FCP budget (default: 1800)
    --budget-cls <score>      CLS budget (default: 0.1)

PERFORMANCE REGRESSION
  perf-baseline save <url>    Capture and save performance baseline
    --name <name>             Human-readable name for baseline
    --runs <n>                Number of runs to average (default: 3)
    --device <name>           Device to measure as; perf-regression renders the same
    --viewport <WxH>          Page size; perf-regression renders the same
    Examples:
      cbrowser perf-baseline save "https://example.com" --name "homepage"
      cbrowser perf-baseline save "https://example.com/checkout" --runs 5

  perf-baseline list          List all saved baselines
  perf-baseline show <name>   Show baseline details
  perf-baseline delete <name> Delete a baseline

  perf-regression <url> <baseline>  Compare current performance against baseline
    --sensitivity <level>     strict|normal|ci|lenient (default: normal)
    --threshold-lcp <n>       Max LCP increase % (default: 20)
    --threshold-cls <n>       Max CLS increase (default: 0.1)
    --threshold-fcp <n>       Max FCP increase % (default: 20)
    --threshold-ttfb <n>      Max TTFB increase % (default: 30)
    --threshold-tti <n>       Max TTI increase %
    --threshold-tbt <n>       Max TBT increase %
    --output <file>           Save JSON report to file
    Examples:
      cbrowser perf-regression "https://example.com" homepage
      cbrowser perf-regression "https://example.com" homepage --sensitivity strict
      cbrowser perf-regression "https://example.com" homepage --threshold-lcp 30

NETWORK / HAR (need the daemon: each command is its own process)
  daemon start                Start the daemon first; it holds the browser between commands
  har start                   Start recording HAR in the daemon's browser
  har stop [output]           Stop and save HAR file
  network list                List network requests the daemon's browser captured, newest first
    --filter <text>           Only requests whose URL contains <text>, or of that type or method
    --all                     List every request (default: the newest 20)
    --json                    Print the list as JSON
  network clear               Clear that list
  console                     List the daemon tab's console messages (errors, warnings, logs)
    --filter <type>           all | error | warning | log | info (default all)
    --clear                   Empty the console buffer after reading
    --json                    Print the raw messages as JSON

VISUAL REGRESSION
  visual save <name>          Save baseline screenshot
    --url <url>               Navigate to URL first
  visual compare <name>       Compare current page against baseline
    --threshold <n>           Diff threshold 0-1 (default: 0.1)
  visual list                 List all saved baselines
  visual delete <name>        Delete a baseline

AI VISUAL REGRESSION
  ai-visual capture <url>     Capture AI-analyzed visual baseline
    --name <name>             Baseline name (required)
    --selector <sel>          Capture specific element instead of viewport
    --device <device>         Device emulation (iphone-15, pixel-7, etc.)
    --viewport <WxH>          Page size (default: 1920x1080)
    --width <n>               Viewport width (default: 1920)
    --height <n>              Viewport height (default: 1080)
    --browser <engine>        chromium, firefox or webkit; the baseline keeps it
    --wait <ms|selector>      Wait before capture (ms or CSS selector)
    Examples:
      cbrowser ai-visual capture "https://example.com" --name homepage
      cbrowser ai-visual capture "https://example.com/dashboard" --name dashboard --device iphone-15

  ai-visual test <url> <baseline>  Test current page against baseline using AI
    Renders with the baseline's engine, device and size
    --threshold <n>           Similarity threshold 0-1 (default: 0.9)
    --sensitivity <level>     Detection sensitivity: low, medium, high (default: medium)
    --html                    Generate HTML report
    --output <file>           Save JSON report to file
    Examples:
      cbrowser ai-visual test "https://staging.example.com" homepage
      cbrowser ai-visual test "https://staging.example.com" homepage --sensitivity high

  ai-visual suite <file.json>  Run visual regression suite
    --threshold <n>           Global similarity threshold (default: 0.9)
    --html                    Generate HTML report
    --output <file>           Save JSON report to file

  ai-visual list              List all AI visual baselines
  ai-visual show <name>       Show baseline details
  ai-visual delete <name>     Delete a baseline

CROSS-BROWSER VISUAL TESTING
  cross-browser <url>         Compare visual rendering across browsers
    --browsers <list>         Browsers to test: chromium,firefox,webkit (default: all)
    --viewport <WxH>          Page size (default: 1920x1080)
    --width <n>               Viewport width (default: 1920)
    --height <n>              Viewport height (default: 1080)
    --device <name>           Device preset (firefox cannot emulate a mobile one)
    --wait <ms>               Wait before screenshot (ms)
    --wait-for <selector>     Wait for selector before screenshot
    --sensitivity <level>     Comparison sensitivity: low, medium, high
    --html                    Generate HTML report
    --output <file>           Save JSON report to file
    Examples:
      cbrowser cross-browser "https://example.com"
      cbrowser cross-browser "https://example.com" --browsers chromium,firefox
      cbrowser cross-browser "https://example.com" --html --output report.html

  cross-browser suite <file.json>  Run cross-browser test suite
    --html                    Generate HTML report
    --output <file>           Save JSON report to file

    Suite file format:
    {
      "name": "My Site",
      "urls": ["https://example.com", "https://example.com/about"],
      "options": { "browsers": ["chromium", "firefox"] }
    }

RESPONSIVE VISUAL TESTING
  responsive <url>            Test visual rendering across viewport sizes
    --viewports <list>        Viewports to test (default: mobile,tablet,desktop)
    --browser <engine>        chromium, firefox or webkit (firefox cannot emulate
                              the mobile and tablet presets)
    --wait <ms>               Wait before screenshot (ms)
    --wait-for <selector>     Wait for selector before screenshot
    --sensitivity <level>     Comparison sensitivity: low, medium, high
    --html                    Generate HTML report
    --output <file>           Save JSON report to file
    Examples:
      cbrowser responsive "https://example.com"
      cbrowser responsive "https://example.com" --viewports mobile,tablet,desktop-lg
      cbrowser responsive "https://example.com" --html --output report.html

  responsive suite <file.json>  Run responsive test suite
    --html                    Generate HTML report
    --output <file>           Save JSON report to file

  responsive viewports        List available viewport presets

    Suite file format:
    {
      "name": "My Site Responsive",
      "urls": ["https://example.com", "https://example.com/about"],
      "options": { "viewports": ["mobile", "tablet", "desktop"] }
    }

    Available viewport presets (mobile and tablet emulate their device: touch,
    user agent, pixel ratio):
${formatViewportPresetList("      ")}

A/B VISUAL COMPARISON
  ab <urlA> <urlB>            Compare two URLs visually
    --label-a <name>          Label for URL A (default: "Version A")
    --label-b <name>          Label for URL B (default: "Version B")
    --viewport <WxH>          Page size (default: 1920x1080)
    --width <n>               Viewport width (default: 1920)
    --height <n>              Viewport height (default: 1080)
    --device <name>           Device preset
    --browser <engine>        chromium, firefox or webkit
    --wait <ms>               Wait before screenshot (ms)
    --wait-for <selector>     Wait for selector before screenshot
    --sensitivity <level>     Comparison sensitivity: low, medium, high
    --html                    Generate HTML report
    --output <file>           Save JSON report to file
    Examples:
      cbrowser ab "https://staging.example.com" "https://example.com"
      cbrowser ab "https://old.site.com" "https://new.site.com" --label-a "Old Design" --label-b "New Design"
      cbrowser ab "https://site-a.com" "https://site-b.com" --html --output comparison.html

  ab suite <file.json>        Run A/B comparison suite
    --html                    Generate HTML report
    --output <file>           Save JSON report to file

    Suite file format:
    {
      "name": "Staging vs Production",
      "pairs": [
        { "urlA": "https://staging.example.com", "urlB": "https://example.com", "name": "Homepage" },
        { "urlA": "https://staging.example.com/about", "urlB": "https://example.com/about", "name": "About" }
      ],
      "options": { "sensitivity": "medium" }
    }

AI FRIENDLINESS - Audit sites for AI agent compatibility
══════════════════════════════════════════════════════════════════════════════

  agent-ready-audit <url>     Audit site for AI-agent friendliness (A-F grade)
    --headless                Run in headless mode (default: true)
    --device <name>           Device to audit on, e.g. iphone-16
    --geo-region <region>     Run through a configured regional proxy (exits 1 if not configured)
    --lightpanda              Use Lightpanda instead of Chromium (see LIGHTPANDA)
    --output <file>           Save JSON report to file
    --html                    Generate HTML report
    Grades sites on: Findability (35%), Stability (30%),
                     Agent perceivability (20%), Semantics (15%)
    Examples:
      cbrowser agent-ready-audit "https://example.com"
      cbrowser agent-ready-audit "https://example.com" --html --output report.json

  ai-benchmark                Compare AI-friendliness across multiple sites
    --urls <list>             Comma-separated URLs to benchmark (required)
    --concurrency <n>         Sites audited at once (default: 3)
    --output <file>           Save JSON report to file
    --html                    Generate HTML report
    Runs agent-ready-audit on each URL and produces ranked comparison.
    Examples:
      cbrowser ai-benchmark --urls "https://site1.com,https://site2.com,https://site3.com"
      cbrowser ai-benchmark --urls "https://amazon.com,https://ebay.com" --html

  empathy-audit <url>         Simulate disability experience on site
    --goal <goal>             Task goal (optional; without one the page is checked)
    --personas <list>         Disability personas (comma-separated; also --disabilities)
    --device <name>           Device to audit on, e.g. iphone-16
    --scope <scope>           viewport (default) or full_page
    --wcag-level <level>      WCAG level: A, AA, AAA (default: AA)
    --max-steps <n>           Steps per persona when a goal is given
    --max-time <s>            Seconds per persona when a goal is given
    --output <file>           Save JSON report to file
    --html                    Generate HTML report
    Available personas:
      ${listAccessibilityPersonas().join(", ")}
    Examples:
      cbrowser empathy-audit "https://example.com" \\
        --goal "complete checkout" \\
        --personas "motor-impairment-tremor,cognitive-adhd" --html

  webmcp-ready <url>          Audit MCP server for WebMCP compatibility
    --api-key <key>           API key for authenticated servers
    --oauth-token <token>     OAuth token for OAuth-protected servers
    --timeout <ms>            Request timeout (default: 30000)
    --output <file>           Save JSON report to file
    --html                    Generate HTML report
    6-tier evaluation: Server (25%), Tools (20%), Instrumentation (15%),
                       Consistency (15%), Agent Opts (15%), Docs (10%)
    Examples:
      cbrowser webmcp-ready "https://demo.cbrowser.ai/mcp"
      cbrowser webmcp-ready "https://your-server.com/mcp" --api-key KEY --html

  hunt-bugs <url>             Automatically find UX bugs on a page (alias: hunt)
    --max-pages <n>           Max pages to crawl (default: 10)
    --timeout <ms>            Timeout in ms (default: 60000)
    Examples:
      cbrowser hunt-bugs "https://example.com"

  competitive-benchmark       Compare UX across competitor sites (needs an Anthropic API key)
    --sites <list>            Comma-separated site URLs (required)
    --goal <goal>             Task goal (required)
    --persona <name>          Persona to use (default: first-timer)
    --max-steps <n>           Max steps per site (default: 30)
    --max-time <sec>          Max time per site (default: 180)
    --output <file>           Save JSON report to file
    --html                    Generate HTML report
    Examples:
      cbrowser competitive-benchmark \\
        --sites "https://yoursite.com,https://competitor.com" \\
        --goal "sign up for free trial" --html

ACCESSIBILITY
  a11y audit                  Run WCAG accessibility audit
    --url <url>               Navigate to URL first
  a11y audit [url]            Audit a specific URL

TEST RECORDING
  record start / stop / save  Refused since 20.0: each command is its own process, so
                              nothing was ever recorded. Write the flow as a test and
                              run it in one process: test-suite --inline "..." --capture
  record list                 List saved recordings
  record generate <name>      Generate Playwright test code

SCREEN CAPTURE (video/GIF — distinct from 'record', which captures actions)
  capture start <url>         Capture the screen to GIF/WebP/video
    --fps <n>                 Target frames per second (default: 10)
    --duration <5s>           Auto-stop after this long (5s, 2m, 1500ms)
    --viewport <WxH>          Viewport size, e.g. 1280x720, or a size name (mobile, tablet, desktop...)
    --region <x,y,w,h>        Capture a fixed region instead of the viewport
    --element <selector>      Track an element; crop follows it as it moves
    --element-padding <n>     Expand the element box by n CSS px per side
    --device <name>           Device preset, e.g. iphone-15 ('capture status'
                              lists them on a bad value)
    --format <list>           gif,webp,webm,mp4 (default: gif)
    --quality <1-100>         JPEG quality of captured frames (default: 80)
    --max-frames <n>          Stop retaining frames after n (default: 3000)
    --contact-sheet           Also write one JPEG summarising the whole capture
    --attention-overlay       Paint the predicted-attention map over every frame
                              (adds ~0.5-1s per frame; uses the live DOM)
    --overlay-persona <name>  Persona weighting the overlay (default: first-timer)
    --overlay-goal <text>     Goal string weighting goal-relevance in the overlay
    --after <event>           Start on load|domcontentloaded|networkidle
    --after-element <sel>     Start when the element is present and visible
    --after-delay <500ms>     Extra delay after the start trigger
    --until-element <sel>     Stop when the element appears
    --until-element-gone <sel>  Stop when the element disappears
    --until-idle <800ms>      Stop after this long with NO part of the page
                              changing. A page with a clock or ticker is always
                              changing and will run to --timeout instead.
    --timeout <30s>           Trigger wait budget (default: 30s); a trigger that
                              never fires stops the capture, writes a manifest
                              with trigger_timeout, and exits non-zero
    --out <dir>               Output directory
                              (default: ~/.cbrowser/videos/<session>/<name>)
    --name <slug>             Capture name
  capture stop                Stop the running screen capture
  capture status              Show the running or most recent capture
    Note: capture is event-driven — a page that never repaints emits no frames,
    and the still stretches are reported as frame_gaps rather than padded out.
    mp4 needs a full ffmpeg (CBROWSER_FFMPEG_PATH); the bundled one does webm.

TEST EXPORT
  export junit <name> [output]   Export test results as JUnit XML
  export tap <name> [output]     Export test results as TAP format
    <name> is a suite test-suite has run (its file name); each run is saved

WEBHOOKS
  webhook add <name> <url>    Add webhook notification (http or https)
    --events <events>         test.pass,test.fail,journey.complete (default: test.fail);
                              test-suite sends one per run, cognitive-journey one per
                              journey; JSON, 10s timeout, no retries
    --format <format>         slack, discord, or generic
  webhook list                List configured webhooks
  webhook delete <name>       Delete a webhook
  webhook test <name>         Send test notification

PERSONA QUESTIONNAIRE
  persona-questionnaire start        Build a persona from a behavioural questionnaire
    --comprehensive                  All 30 traits (default: 13 core traits)
    --name <name>                    Persona name (prompted if omitted)
    --output <file>                  Save answers to JSON
  persona-questionnaire list-traits  List available traits with descriptions
  persona-questionnaire lookup       Look up behaviours for a trait value

PARALLEL EXECUTION
  parallel devices <url>      Run same URL across multiple devices
    --devices <list>          Comma-separated device names (default: cbrowser's own presets, 'device list')
    --concurrency <n>         Max parallel browsers (default: 3)
    --browser, --no-headless  The browser for every device
  parallel urls <urls>        Run same task across multiple URLs
    --concurrency <n>         Max parallel browsers (default: 3)
    --device, --viewport, --browser, --no-headless   The browser for every URL
  parallel perf <urls>        Performance audit multiple URLs in parallel
    --concurrency <n>         Max parallel browsers (default: 3)
    --device, --viewport, --browser, --no-headless   The browser for every URL

NATURAL LANGUAGE
  run "<command>"             Execute natural language command
    Examples:
      cbrowser run "go to https://example.com"
      cbrowser run "click the login button"
      cbrowser run "type 'hello' in the search box"
  script <file>               Execute script file with natural language commands
  scroll <top|bottom|up|down> [px]  Scroll the page (up/down default 300px)
    --url <url>               Navigate to URL first
    Note: without the daemon the next command reloads the page, so the
          scroll position does not carry over; start the daemon first.

VISUAL AI
  ai find "<intent>"          Find element by semantic intent
    Examples:
      cbrowser ai find "the cheapest product"
      cbrowser ai find "login button"
      cbrowser ai find "search box"
  ai click "<intent>"         Find and click element by intent

BROWSER DIFF
  diff <url>                  Compare page across browsers
    --browsers <list>         chromium,firefox,webkit (default: all)
    --viewport <WxH>          Page size (default: 1920x1080)
    --device <name>           Device preset (firefox cannot emulate a mobile one)

CHAOS ENGINEERING
  chaos <url>                 Test app resilience
    --latency <ms>            Add network latency
    --offline                 Simulate offline mode
    --block <patterns>        Block URL patterns (comma-separated)
    --fail-api <pattern:status>  Fail specific API calls

SMART RETRY & ASSERTIONS
  smart-click <selector>      Click with auto-retry and alternative selectors
    --url <url>               Navigate to URL first
    --max-retries <n>         Maximum retry attempts (default: 3)
    --retry-delay <ms>        Delay between retries (default: 1000)
    --dismiss-overlays        Dismiss overlays before clicking
  dismiss-overlay             Detect and dismiss modal overlays
    --type <type>             Overlay type: auto|cookie|age-verify|newsletter|custom (default: auto)
    --selector <sel>          Custom selector for overlay close button
    --url <url>               Navigate to URL first
  assert "<assertion>"        Natural language assertions
    --url <url>               Navigate to URL first
    Examples:
      cbrowser assert "page contains 'Welcome'"
      cbrowser assert "title is 'Home Page'"
      cbrowser assert "url contains '/dashboard'"
      cbrowser assert "'Login' button exists"
      cbrowser assert "page has 3 items"

SELF-HEALING SELECTORS
  heal stats                  Show selector cache statistics
  heal list                   List all cached selector mappings
    --domain <domain>         Filter by domain
  heal clear                  Clear the selector cache
    --domain <domain>         Clear only for specific domain
  heal test <selector>        Test if a selector would be healed
    --url <url>               Navigate to URL first

AI TEST GENERATION
  generate <url>              Analyze page and generate test scenarios
    --format <format>         Output: summary, cbrowser, playwright, all (default: summary)
    --output <file>           Save to file instead of stdout
  analyze <url>               Show page analysis without generating tests
    --output <file>           Save the analysis as JSON

MCP SERVER
  mcp-server                  Start CBrowser as MCP server for Claude integration
                              Use with Claude Desktop or other MCP-compatible clients
  mcp-remote                  Start remote HTTP MCP server for claude.ai connectors
    --port <port>             Port to listen on (default: 3000)
    --host <host>             Host to bind to (default: 0.0.0.0)
    --stateful                Use stateful session mode
    Smart visual baselines and transport maps have no CLI command; they are the
    MCP tools visual_baseline / visual_regression (smart mode) and transport_map.

UNINSTALL
  uninstall                   Remove CBrowser data: credentials, sessions, captures
                              Dry run by default — shows what would go, removes nothing
    --yes                     Actually remove
    --keep-config             Keep API key and proxy config (for reinstalling)
                              'npm uninstall -g cbrowser' does NOT remove any of this

CLAUDE SKILL INSTALLATION & SYNC
  install-skill               Install the CBrowser Claude skill in ~/.claude/skills/CBrowser
  sync-skill                  Same as install-skill: copies the skill this version ships
                              (no download). Run again after 'npm update -g cbrowser'.
                              Files you added to that directory are left alone.
    The Claude Code plugin bundles the skill with the MCP server:
      /plugin marketplace add alexandriashai/cbrowser
      /plugin install cbrowser@cbrowser

BROWSERS
  install-browsers [name...]  Download browsers with cbrowser's own Playwright
                              (default: chromium; also firefox, webkit, ffmpeg)
                              Extra flags go to Playwright, e.g. --with-deps, --dry-run
    Example:
      cbrowser install-browsers firefox webkit

DAEMON MODE
  daemon start                Start background daemon (keeps browser running)
    --port <port>             Daemon port (default: 9222)
    --device <name>           Device the daemon's browser emulates
    --viewport <WxH>          Page size of the daemon's browser
    --timeout <min>           Idle timeout: minutes, or 90s / 45m / 2h (default: 30)
  daemon stop                 Stop the running daemon
  daemon status               Check if daemon is running (exits 1 when it is not)
  daemon run                  Run daemon in foreground (internal use)
    Note: while the daemon runs, navigate, click, fill, hover, type, press,
          keyboard, drag, upload, screenshot, extract, run, scroll, evaluate,
          an open-ended capture, har, network and console use its browser, so
          they share one page. Commands that would open a second browser on
          its profile (script, ai, explore, a11y, perf, visual, session save
          and load, reset and others) refuse until you stop it, and so does a
          bounded capture (--duration, --until-*) given no URL. Without a
          daemon each command opens its own browser and reloads the last URL
          (saved for an hour): cookies and localStorage carry over; script
          variables, sessionStorage, scroll and typed input do not. With no
          page to reload, click, fill, hover, type, press, keyboard, drag,
          upload, evaluate, extract, screenshot, smart-click, dismiss-overlay,
          assert, scroll, run, a11y audit, perf, visual save/compare, session
          save and a bounded capture start refuse unless given a URL; when the
          saved page does not load, they stop with the reason. Commands find
          the daemon through the data dir, so give every one the same
          CBROWSER_DATA_DIR.

API CONFIGURATION
  config set-api-key <key>    Set Anthropic API key for cognitive journeys
  config show-api-key         Show configured API key (masked)
  config remove-api-key       Remove stored API key
  config set-model <model>    Set Claude model (default: claude-sonnet-5)

LIGHTPANDA - High-Performance Headless Browser (OPT-IN ONLY)
  lightpanda-status           Check Lightpanda availability and configuration
  lightpanda-setup            Show setup instructions with security warnings
    ⚠️ SECURITY NOTICE:
      • Lightpanda is BETA software with no security audit
      • Cloud mode exposes traffic to lightpanda.io servers
      • NEVER use for auth, credentials, or payments
      • Used only by agent-ready-audit, and only with --lightpanda
    Environment Variables:
      LIGHTPANDA_ENDPOINT     WebSocket endpoint (e.g., ws://127.0.0.1:9222)
      LIGHTPANDA_TOKEN        Cloud API token (⚠️ data visible to lightpanda.io)
    Examples:
      cbrowser lightpanda-status
      cbrowser agent-ready-audit https://example.com --lightpanda

PRODUCT HELP
  ask "<question>"            Ask the CBrowser docs a question; prints an AI answer and its sources
    --context <text>          What you are looking at (a URL, a tool, a score)
    --json                    Print the answer as JSON
    Sends your question to cbrowser.ai. No account or API key; rate-limited.
    Example:
      cbrowser ask "Which persona should I use for a screen reader user?"

DIAGNOSTICS
  version, -v, --version      Show version number
  status                      Show environment status and diagnostics
                              Displays data directories, browsers, config, heal cache
  doctor                      Check environment health (Node, Playwright, API key)

OUTPUT MODES (accessibility)
  --no-color                  Disable all color output (also respects NO_COLOR env var)
  --plain                     Disable emoji, box-drawing, and unicode decorations
  --json-output               Output structured JSON (for scripts and screen readers)

STORAGE & CLEANUP
  storage                     Show storage usage statistics
  cleanup                     Clean up old files
    --dry-run                 Preview what would be deleted
    --older-than <days>       Delete files older than N days (default: 7)
    --keep-screenshots <n>    Keep at least N screenshots (default: 10)
    --keep-journeys <n>       Keep at least N journeys (default: 5)
    --keep-sessions <n>       Keep at least N sessions (default: 3)
  reset                       Clear persistent browser state (cookies, storage)

OPTIONS
  --browser <type>            Browser: chromium, firefox, webkit (default: chromium)
  --device <name>             Device preset: iphone-16, pixel-9, ipad-pro-13, ... ('device list')
  --viewport <WxH>            Page size, e.g. 390x844; with --device it sets the size and
                              the device keeps its pixel ratio, touch and user agent
                              Size names work too (mobile, tablet, desktop-md...): size
                              only; use --device for touch and a mobile user agent
  --geo <location>            Location preset or lat,lon coordinates
  --locale <locale>           Browser locale and Accept-Language header, e.g. fr-FR
                              (default: the host's language, else en-US)
  --timezone <tz>             Timezone (e.g., America/New_York)
  --color-scheme <scheme>     Page color scheme: light, dark or no-preference (what
                              the page's prefers-color-scheme media query sees)
  --dnt                       Send Do Not Track: DNT: 1 on the browser's requests, and
                              navigator.doNotTrack "1" (--no-dnt: off; default off)
  --gpc                       Send Global Privacy Control: Sec-GPC: 1 on the browser's
                              requests, and navigator.globalPrivacyControl true
                              (--no-gpc: off; default off)
  --geo-region <region>       Send every request through the residential proxy for this
                              region (us-west, uk, japan...; see Geo Proxy in the README).
                              Exits 1 if the region is not configured. --no-geo-region:
                              none for this run, whatever the env or config file says
  --record-video              Enable video recording
  --force                     Bypass red zone safety checks (CLI only; over MCP,
                              zone enforcement is opt-in via CBROWSER_ENFORCE_RED_ZONE
                              because MCP has no force affordance)
  --headless                  Run browser in headless mode
  --no-persistent             Disable persistent browser context (default: enabled)
  --no-restore                Don't reload the saved URL first. Without a daemon the
                              commands that act on the page (listed under DAEMON
                              MODE) then need --url and refuse otherwise; keeping
                              a page between commands takes a daemon

ENVIRONMENT VARIABLES
  CBROWSER_DATA_DIR           Custom data directory (default: ~/.cbrowser)
  CBROWSER_BROWSER            Browser engine (chromium/firefox/webkit)
  CBROWSER_DEVICE             Device preset name
  CBROWSER_LOCALE             Browser locale (default: the host's, else en-US)
  CBROWSER_TIMEZONE           Timezone
  CBROWSER_COLOR_SCHEME       Page color scheme (light, dark, no-preference)
  CBROWSER_DNT                Send Do Not Track (1 or 0; default 0)
  CBROWSER_GPC                Send Global Privacy Control (1 or 0; default 0)
  CBROWSER_GEO_REGION         Residential proxy region for every browser (e.g. uk; none: off)
  CBROWSER_HEADLESS           Run headless by default (true/false)
  CBROWSER_TIMEOUT            Default timeout in ms (default: 30000)
  CBROWSER_RECORD_VIDEO       Record video by default (true/false)

CONFIG FILE
  CBrowser looks for config in these locations:
    .cbrowserrc.json          Project config
    .cbrowserrc               Project config
    cbrowser.config.json      Project config
    ~/.cbrowser/config.json   User config
    ~/.cbrowserrc.json        User config

  Example .cbrowserrc.json:
    {
      "browser": "chromium",
      "device": "iphone-15",
      "geolocation": "new-york",
      "locale": "en-US",
      "recordVideo": true,
      "performanceBudget": {
        "lcp": 2500,
        "cls": 0.1
      }
    }

EXAMPLES
  npx cbrowser navigate "https://example.com"
  npx cbrowser navigate "https://example.com" --device iphone-15
  npx cbrowser navigate "https://example.com" --geo san-francisco
  npx cbrowser perf audit "https://example.com" --budget-lcp 2000
  npx cbrowser explore first-timer --start "https://example.com" --record-video
  npx cbrowser cookie list --url "https://example.com"
`);
}

export function showHelp(): void {
  console.log(helpText());
}

/**
 * Commands that are aliases of another command in the dispatch switch.
 *
 * `help <alias>` resolves to the target's section: an alias that denies having
 * help is the worst answer of all, because the user has no way to learn it IS
 * an alias. Kept honest by the test that walks every `case` label in the
 * dispatch switch and asserts it resolves.
 */
const COMMAND_ALIASES: Record<string, string> = {
  eval: "evaluate",
  "chaos-test": "chaos",
  "generate-tests": "generate",
  journey: "explore",
  // Dispatch aliases that `help` used to resolve by text search, so
  // `help stats` showed "heal stats" (audit 2026-10-21).
  hunt: "hunt-bugs",
  flaky: "flaky-check",
  repair: "repair-tests",
  stats: "storage",
};

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A named block of the help text: its heading, its lines, and the commands it documents. */
interface HelpSection {
  heading: string;
  lines: string[];
  commands: Set<string>;
}

/**
 * Split the help text into its top-level sections.
 *
 * A heading is an unindented line in caps; everything up to the next heading
 * belongs to it. Command names are the first token of each two-space-indented
 * entry, which is how `help <command>` finds the section to print.
 */
function parseHelpSections(): HelpSection[] {
  const sections: HelpSection[] = [];
  let current: HelpSection | null = null;

  for (const line of helpText().split("\n")) {
    // Headings are the only unindented prose in the help text: entries are
    // indented at least two spaces, and the banner and rule lines are drawn
    // with box characters. Matching on "looks uppercase" instead would miss
    // headings like "VISUAL REGRESSION (v2.5.0)".
    const isHeading =
      /^[A-Za-z]/.test(line) &&
      line.trim().length > 0 &&
      !/^[\u2550-\u256c]+$/.test(line.trim());

    if (isHeading) {
      current = { heading: line.trim(), lines: [line], commands: new Set() };
      sections.push(current);
      continue;
    }
    if (!current) continue;

    current.lines.push(line);
    const entry = /^ {2}(\S+)/.exec(line);
    if (entry) current.commands.add(entry[1]);
  }

  return sections;
}

/**
 * Print help for a single command.
 *
 * Returns false when nothing matches, so the caller can exit non-zero - an
 * unknown command that silently printed something would be the same
 * accepted-and-ignored failure mode as a silently dropped flag.
 */
export function showCommandHelp(command: string): boolean {
  const sections = parseHelpSections();

  const target = COMMAND_ALIASES[command];
  if (target) {
    console.log(`'${command}' is an alias for '${target}'.\n`);
    return showCommandHelp(target);
  }

  const matches = sections.filter((s) => s.commands.has(command));

  if (matches.length === 0) {
    // A command can be real but documented inside another command's entry (an
    // example line, a "see also"), so before declaring it unknown, look for it
    // anywhere in the help text and point at the section that mentions it.
    // Saying "no help section" about a command that exists is its own small
    // version of lying to the user.
    const mentions = sections.filter((s) =>
      s.lines.some((line) => new RegExp(`(^|\\s|')${escapeForRegExp(command)}(\\s|$|'|"|,)`).test(line)),
    );

    if (mentions.length > 0) {
      console.log(`'${command}' has no section of its own; it is documented under:`);
      for (const section of mentions.slice(0, 3)) {
        console.log(`\n${section.heading}`);
        for (const line of section.lines.slice(1)) {
          if (new RegExp(`(^|\\s|')${escapeForRegExp(command)}(\\s|$|'|"|,)`).test(line)) {
            console.log(line);
          }
        }
      }
      console.log(`\nFull section: cbrowser help ${[...mentions[0].commands][0] ?? ""}`.trimEnd());
      return true;
    }

    const known = [...new Set(sections.flatMap((s) => [...s.commands]))].sort();
    const close = known.filter((c) => c.startsWith(command) || command.startsWith(c) || c.includes(command));

    console.error(`No help section for '${command}'.`);
    if (close.length > 0) {
      console.error(`Did you mean: ${close.slice(0, 8).join(", ")}?`);
    } else {
      console.error(`Run 'cbrowser help' for the full command list.`);
    }
    return false;
  }

  for (const section of matches) {
    // Trailing blank lines belong to the gap before the next section.
    const lines = [...section.lines];
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
    console.log(lines.join("\n"));
    console.log("");
  }
  return true;
}
