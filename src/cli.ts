#!/usr/bin/env node
/**
 * CBrowser CLI
 *
 * AI-powered browser automation from the command line.
 */

import { CBrowser } from "./browser.js";

// Analysis module imports
import { executeNaturalLanguage, executeNaturalLanguageScript, huntBugs, runChaosTest, comparePersonas, formatComparisonReport, findElementByIntent } from "./analysis/index.js";

// Testing module imports
import { parseNLInstruction, parseNLTestSuite, runNLTestSuite, formatNLTestReport, dryRunNLTestSuite, repairTest, repairTestSuite, formatRepairReport, exportRepairedTest, detectFlakyTests, formatFlakyTestReport, generateCoverageMap, formatCoverageReport, generateCoverageHtmlReport, parseTestFilesForCoverage, type NLTestSuiteOptions, type RepairTestOptions, type FlakyTestOptions } from "./testing/index.js";

// Performance module imports
import { capturePerformanceBaseline, listPerformanceBaselines, loadPerformanceBaseline, deletePerformanceBaseline, detectPerformanceRegression, formatPerformanceRegressionReport, type PerformanceBaselineOptions, type PerformanceRegressionOptions } from "./performance/index.js";

// Visual module imports
import { captureVisualBaseline, listVisualBaselines, getVisualBaseline, deleteVisualBaseline, runVisualRegression, runVisualRegressionSuite, formatVisualRegressionReport, generateVisualRegressionHtmlReport, runCrossBrowserTest, runCrossBrowserSuite, formatCrossBrowserReport, generateCrossBrowserHtmlReport, runResponsiveTest, runResponsiveSuite, formatResponsiveReport, generateResponsiveHtmlReport, listViewportPresets, runABComparison, runABSuite, formatABReport, generateABHtmlReport, crossBrowserDiff, type BrowserDiffResult } from "./visual/index.js";
import type { NLTestCase, NLTestSuiteResult, TestRepairSuiteResult, FlakyTestSuiteResult, PerformanceBaseline, PerformanceRegressionResult, PerformanceRegressionThresholds, CoverageMapResult, CoverageMapOptions, VisualBaseline, VisualRegressionResult, VisualTestSuite, VisualTestSuiteResult, SupportedBrowser, CrossBrowserResult, CrossBrowserSuite, CrossBrowserSuiteResult, ResponsiveTestResult, ResponsiveSuite, ResponsiveSuiteResult, ViewportPreset, ABComparisonResult, ABSuite, ABSuiteResult } from "./types.js";
import {
  BUILTIN_PERSONAS,
  loadCustomPersonas,
  saveCustomPersona,
  deleteCustomPersona,
  isBuiltinPersona,
  generatePersonaFromDescription,
  getPersonasDir,
} from "./personas.js";
import { DEVICE_PRESETS, LOCATION_PRESETS } from "./types.js";
import { startMcpServer } from "./mcp-server.js";
import { startRemoteMcpServer } from "./mcp-server-remote.js";
import { startDaemon, stopDaemon, getDaemonStatus, isDaemonRunning, sendToDaemon, runDaemonServer } from "./daemon.js";
import { getStatusInfo, formatStatus } from "./config.js";

function showHelp(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                           CBrowser CLI v7.4.6                                ║
║    AI-powered browser automation with cross-browser visual testing          ║
╚══════════════════════════════════════════════════════════════════════════════╝

NAVIGATION
  navigate <url>              Navigate and take screenshot
  screenshot [path]           Take screenshot of current page

INTERACTION
  click <selector>            Click element (tries text, label, role, CSS)
    --url <url>               Navigate to URL first, then click
    --verbose                 Show available elements and AI suggestions on failure
    --debug-dir <dir>         Save debug screenshots to directory
  fill <selector> <value>     Fill input field
    --url <url>               Navigate to URL first, then fill
    --verbose                 Show available inputs and AI suggestions on failure
    --debug-dir <dir>         Save debug screenshots to directory

EXTRACTION
  extract <what>              Extract data (links, images, headings, forms)

AUTONOMOUS JOURNEYS
  journey <persona>           Run autonomous exploration
    --start <url>             Starting URL (required)
    --goal <goal>             What to accomplish
    --record-video            Record journey as video

MULTI-PERSONA COMPARISON (v6.0.0)
  compare-personas            Compare multiple personas on the same journey
    --start <url>             Starting URL (required)
    --goal <goal>             What to accomplish (required)
    --personas <list>         Comma-separated persona names
    --concurrency <n>         Max parallel browsers (default: 3)
    --output <file>           Save JSON report to file
    --html                    Generate HTML report
    Examples:
      cbrowser compare-personas --start "https://example.com" \\
        --goal "Complete checkout" \\
        --personas power-user,first-timer,elderly-user,mobile-user

NATURAL LANGUAGE TEST SUITES (v6.1.0)
  test-suite <file.txt>        Run tests written in plain English
    --continue-on-failure      Keep running after a test fails
    --screenshot-on-failure    Take screenshots on failure (default: true)
    --output <file>            Save JSON report to file
    --html                     Generate HTML report
    --timeout <ms>             Timeout per step (default: 30000)
    --dry-run                  Parse and display test steps without executing
    --fuzzy-match              Use case-insensitive fuzzy matching for assertions
    --step-through             Pause before each step for interactive execution
  test-suite --inline "..."    Run inline test (semicolon-separated steps)
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

AI TEST REPAIR (v6.2.0)
  repair-tests <file.txt>      Analyze failing tests and suggest/apply repairs
    --auto-apply               Automatically apply the best repair
    --verify                   Re-run tests after repair to verify they pass
    --output <file>            Save repaired tests to new file
    --json <file>              Save repair report as JSON
    Examples:
      cbrowser repair-tests broken-test.txt
      cbrowser repair-tests tests.txt --auto-apply --verify
      cbrowser repair-tests tests.txt --auto-apply --output fixed-tests.txt

FLAKY TEST DETECTION (v6.3.0)
  flaky-check <file.txt>       Run tests multiple times to detect flaky tests
    --runs <n>                 Number of runs per test (default: 5)
    --threshold <n>            Flakiness % threshold to flag (default: 20)
    --delay <ms>               Delay between runs (default: 500)
    --output <file>            Save JSON report to file
    Examples:
      cbrowser flaky-check tests.txt
      cbrowser flaky-check tests.txt --runs 10
      cbrowser flaky-check tests.txt --runs 5 --threshold 30 --output flaky-report.json

TEST COVERAGE MAP (v6.5.0)
  coverage <url>               Generate test coverage map for a site
    --tests <glob>             Test files to analyze (default: tests/*.txt)
    --sitemap <url>            Use sitemap.xml instead of crawling
    --max-pages <n>            Max pages to crawl (default: 100)
    --include <pattern>        Only include paths matching pattern
    --exclude <pattern>        Exclude paths matching pattern
    --min-coverage <n>         Min coverage % to not flag (default: 50)
    --html                     Generate HTML report
    --output <file>            Save JSON report to file
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

SESSION MANAGEMENT
  session save <name>         Save browser session (cookies, storage, URL)
    --url <url>               Navigate to URL before saving
  session load <name>         Load a saved session
  session list                List all saved sessions
  session delete <name>       Delete a saved session

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
  device list                 List available device presets
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

PERFORMANCE REGRESSION (v6.4.0)
  perf-baseline save <url>    Capture and save performance baseline
    --name <name>             Human-readable name for baseline
    --runs <n>                Number of runs to average (default: 3)
    Examples:
      cbrowser perf-baseline save "https://example.com" --name "homepage"
      cbrowser perf-baseline save "https://example.com/checkout" --runs 5

  perf-baseline list          List all saved baselines
  perf-baseline show <name>   Show baseline details
  perf-baseline delete <name> Delete a baseline

  perf-regression <url> <baseline>  Compare current performance against baseline
    --sensitivity <level>     strict|normal|lenient (default: normal)
    --threshold-lcp <n>       Max LCP increase % (default: 20)
    --threshold-cls <n>       Max CLS increase (default: 0.1)
    --threshold-fcp <n>       Max FCP increase % (default: 20)
    --output <file>           Save JSON report to file
    Examples:
      cbrowser perf-regression "https://example.com" homepage
      cbrowser perf-regression "https://example.com" homepage --sensitivity strict
      cbrowser perf-regression "https://example.com" homepage --threshold-lcp 30

NETWORK / HAR
  har start                   Start recording HAR
  har stop [output]           Stop and save HAR file
  network list                List captured network requests

VISUAL REGRESSION (v2.5.0)
  visual save <name>          Save baseline screenshot
    --url <url>               Navigate to URL first
  visual compare <name>       Compare current page against baseline
    --threshold <n>           Diff threshold 0-1 (default: 0.1)
  visual list                 List all saved baselines
  visual delete <name>        Delete a baseline

AI VISUAL REGRESSION (v7.0.0)
  ai-visual capture <url>     Capture AI-analyzed visual baseline
    --name <name>             Baseline name (required)
    --selector <sel>          Capture specific element instead of viewport
    --device <device>         Device emulation (iphone-15, pixel-7, etc.)
    --width <n>               Viewport width (default: 1920)
    --height <n>              Viewport height (default: 1080)
    --wait <ms|selector>      Wait before capture (ms or CSS selector)
    Examples:
      cbrowser ai-visual capture "https://example.com" --name homepage
      cbrowser ai-visual capture "https://example.com/dashboard" --name dashboard --device iphone-15

  ai-visual test <url> <baseline>  Test current page against baseline using AI
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

CROSS-BROWSER VISUAL TESTING (v7.3.0)
  cross-browser <url>         Compare visual rendering across browsers
    --browsers <list>         Browsers to test: chromium,firefox,webkit (default: all)
    --width <n>               Viewport width (default: 1920)
    --height <n>              Viewport height (default: 1080)
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

RESPONSIVE VISUAL TESTING (v7.3.0)
  responsive <url>            Test visual rendering across viewport sizes
    --viewports <list>        Viewports to test (default: mobile,tablet,desktop)
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

    Available viewport presets:
      mobile-sm (320x568)     mobile (375x667)      mobile-lg (414x896)
      mobile-xl (428x926)     tablet (768x1024)     tablet-lg (1024x1366)
      desktop-sm (1280x800)   desktop (1440x900)    desktop-lg (1920x1080)
      desktop-xl (2560x1440)

A/B VISUAL COMPARISON (v7.3.0)
  ab <urlA> <urlB>            Compare two URLs visually
    --label-a <name>          Label for URL A (default: "Version A")
    --label-b <name>          Label for URL B (default: "Version B")
    --width <n>               Viewport width (default: 1920)
    --height <n>              Viewport height (default: 1080)
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

ACCESSIBILITY (v2.5.0)
  a11y audit                  Run WCAG accessibility audit
    --url <url>               Navigate to URL first
  a11y audit [url]            Audit a specific URL

TEST RECORDING (v2.5.0)
  record start                Start recording interactions
    --url <url>               Navigate to URL to begin recording
  record stop                 Stop recording and show actions
  record save <name>          Save recorded test
  record list                 List saved recordings
  record generate <name>      Generate Playwright test code

TEST EXPORT (v2.5.0)
  export junit <name> [output]   Export test results as JUnit XML
  export tap <name> [output]     Export test results as TAP format

WEBHOOKS (v2.5.0)
  webhook add <name> <url>    Add webhook notification
    --events <events>         Comma-separated: test.pass,test.fail,journey.complete
    --format <format>         slack, discord, or generic
  webhook list                List configured webhooks
  webhook delete <name>       Delete a webhook
  webhook test <name>         Send test notification

PARALLEL EXECUTION (v2.5.0)
  parallel devices <url>      Run same URL across multiple devices
    --devices <list>          Comma-separated device names (default: all)
    --concurrency <n>         Max parallel browsers (default: 3)
  parallel urls <urls>        Run same task across multiple URLs
    --concurrency <n>         Max parallel browsers (default: 3)
  parallel perf <urls>        Performance audit multiple URLs in parallel
    --concurrency <n>         Max parallel browsers (default: 3)

NATURAL LANGUAGE (v3.0.0)
  run "<command>"             Execute natural language command
    Examples:
      cbrowser run "go to https://example.com"
      cbrowser run "click the login button"
      cbrowser run "type 'hello' in the search box"
  script <file>               Execute script file with natural language commands

VISUAL AI (v4.0.0)
  ai find "<intent>"          Find element by semantic intent
    Examples:
      cbrowser ai find "the cheapest product"
      cbrowser ai find "login button"
      cbrowser ai find "search box"
  ai click "<intent>"         Find and click element by intent

BUG HUNTER (v4.0.0)
  hunt <url>                  Automatically find bugs on a page
    --max-pages <n>           Max pages to crawl (default: 10)
    --timeout <ms>            Timeout in ms (default: 60000)

CROSS-BROWSER (v4.0.0)
  diff <url>                  Compare page across browsers
    --browsers <list>         chromium,firefox,webkit (default: all)

CHAOS ENGINEERING (v4.0.0)
  chaos <url>                 Test app resilience
    --latency <ms>            Add network latency
    --offline                 Simulate offline mode
    --block <patterns>        Block URL patterns (comma-separated)
    --fail-api <pattern:status>  Fail specific API calls

SMART RETRY & ASSERTIONS (v5.0.0)
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

SELF-HEALING SELECTORS (v5.0.0)
  heal stats                  Show selector cache statistics
  heal list                   List all cached selector mappings
    --domain <domain>         Filter by domain
  heal clear                  Clear the selector cache
    --domain <domain>         Clear only for specific domain
  heal test <selector>        Test if a selector would be healed
    --url <url>               Navigate to URL first

AI TEST GENERATION (v5.0.0)
  generate <url>              Analyze page and generate test scenarios
    --format <format>         Output: summary, cbrowser, playwright, all (default: summary)
    --output <file>           Save to file instead of stdout
  analyze <url>               Show page analysis without generating tests

MCP SERVER (v5.0.0)
  mcp-server                  Start CBrowser as MCP server for Claude integration
                              Use with Claude Desktop or other MCP-compatible clients
  mcp-remote                  Start remote HTTP MCP server for claude.ai connectors
    --port <port>             Port to listen on (default: 3000)
    --host <host>             Host to bind to (default: 0.0.0.0)

PAI SKILL INSTALLATION (v7.4.6)
  install-skill               Install CBrowser as a PAI skill to ~/.claude/skills/
                              Downloads skill files from GitHub and creates directory structure
                              Add to skill-index.json after installation
    --stateful                Use stateful session mode

DAEMON MODE (v6.4.0)
  daemon start                Start background daemon (keeps browser running)
    --port <port>             Daemon port (default: 9222)
    --timeout <min>           Idle timeout in minutes (default: 30)
  daemon stop                 Stop the running daemon
  daemon status               Check if daemon is running
  daemon run                  Run daemon in foreground (internal use)
    Note: When daemon is running, all commands automatically connect to it
          instead of launching a new browser - much faster for iteration!

DIAGNOSTICS
  status                      Show environment status and diagnostics
                              Displays data directories, browsers, config, heal cache

STORAGE & CLEANUP
  storage                     Show storage usage statistics
  cleanup                     Clean up old files
    --dry-run                 Preview what would be deleted
    --older-than <days>       Delete files older than N days (default: 7)
    --keep-screenshots <n>    Keep at least N screenshots (default: 10)
    --keep-journeys <n>       Keep at least N journeys (default: 5)
  reset                       Clear persistent browser state (cookies, storage)

OPTIONS
  --browser <type>            Browser: chromium, firefox, webkit (default: chromium)
  --device <name>             Device preset: iphone-15, pixel-8, ipad-pro-12, etc.
  --geo <location>            Location preset or lat,lon coordinates
  --locale <locale>           Browser locale (e.g., en-US, fr-FR)
  --timezone <tz>             Timezone (e.g., America/New_York)
  --record-video              Enable video recording
  --force                     Bypass red zone safety checks
  --headless                  Run browser in headless mode
  --persistent                Enable persistent browser context (cookies survive)

ENVIRONMENT VARIABLES
  CBROWSER_DATA_DIR           Custom data directory (default: ~/.cbrowser)
  CBROWSER_BROWSER            Browser engine (chromium/firefox/webkit)
  CBROWSER_DEVICE             Device preset name
  CBROWSER_LOCALE             Browser locale
  CBROWSER_TIMEZONE           Timezone
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
  npx cbrowser journey first-timer --start "https://example.com" --record-video
  npx cbrowser cookie list --url "https://example.com"
`);
}

function parseArgs(args: string[]): { command: string; args: string[]; options: Record<string, string | boolean> } {
  const command = args[0] || "help";
  const restArgs: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const next = args[i + 1];

      if (next && !next.startsWith("--")) {
        options[key] = next;
        i++;
      } else {
        options[key] = true;
      }
    } else {
      restArgs.push(args[i]);
    }
  }

  return { command, args: restArgs, options };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function generateHtmlReport(comparison: any): string {
  const rows = comparison.personas.map((p: any) => `
    <tr class="${p.success ? 'success' : 'failure'}">
      <td><strong>${p.persona}</strong><br><small>${p.description}</small></td>
      <td>${p.success ? '✓' : '✗'}</td>
      <td>${(p.totalTime / 1000).toFixed(1)}s</td>
      <td>${p.stepCount}</td>
      <td>${p.frictionCount}</td>
      <td>${p.techLevel}</td>
      <td>${p.device}</td>
      <td><small>${p.frictionPoints.join('<br>') || '-'}</small></td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Persona Comparison Report</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem;
      background: #f5f5f5;
    }
    h1 { color: #1a1a1a; border-bottom: 3px solid #3b82f6; padding-bottom: 0.5rem; }
    .meta { background: white; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
    .meta p { margin: 0.25rem 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    th, td {
      padding: 1rem;
      text-align: left;
      border-bottom: 1px solid #eee;
    }
    th { background: #1a1a1a; color: white; }
    tr.success { background: #ecfdf5; }
    tr.failure { background: #fef2f2; }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin: 1rem 0;
    }
    .stat {
      background: white;
      padding: 1rem;
      border-radius: 8px;
      text-align: center;
    }
    .stat .value { font-size: 2rem; font-weight: bold; color: #3b82f6; }
    .stat .label { color: #666; font-size: 0.875rem; }
    .recommendations {
      background: #fffbeb;
      border: 1px solid #fbbf24;
      border-radius: 8px;
      padding: 1rem;
      margin-top: 1rem;
    }
    .recommendations h3 { margin-top: 0; }
    .recommendations ul { margin: 0; padding-left: 1.5rem; }
  </style>
</head>
<body>
  <h1>🎭 Multi-Persona Comparison Report</h1>

  <div class="meta">
    <p><strong>URL:</strong> ${comparison.url}</p>
    <p><strong>Goal:</strong> ${comparison.goal}</p>
    <p><strong>Timestamp:</strong> ${comparison.timestamp}</p>
    <p><strong>Total Duration:</strong> ${(comparison.duration / 1000).toFixed(1)}s</p>
  </div>

  <div class="summary">
    <div class="stat">
      <div class="value">${comparison.summary.successCount}/${comparison.summary.totalPersonas}</div>
      <div class="label">Success Rate</div>
    </div>
    <div class="stat">
      <div class="value">${(comparison.summary.avgCompletionTime / 1000).toFixed(1)}s</div>
      <div class="label">Avg Completion Time</div>
    </div>
    <div class="stat">
      <div class="value">${comparison.summary.fastestPersona}</div>
      <div class="label">Fastest</div>
    </div>
    <div class="stat">
      <div class="value">${comparison.summary.mostFriction}</div>
      <div class="label">Most Friction</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Persona</th>
        <th>Success</th>
        <th>Time</th>
        <th>Steps</th>
        <th>Friction</th>
        <th>Tech Level</th>
        <th>Device</th>
        <th>Issues</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="recommendations">
    <h3>💡 Recommendations</h3>
    <ul>
      ${comparison.recommendations.map((r: string) => `<li>${r}</li>`).join('')}
    </ul>
  </div>

  <p style="color: #999; text-align: center; margin-top: 2rem;">
    Generated by CBrowser v6.0.0 - Multi-Persona Comparison
  </p>
</body>
</html>`;
}

function generateTestSuiteHtmlReport(result: NLTestSuiteResult): string {
  const testRows = result.testResults.map((t) => {
    const stepDetails = t.stepResults.map((s) => `
      <tr class="${s.passed ? 'step-pass' : 'step-fail'}">
        <td class="step-indent">${s.instruction}</td>
        <td>${s.passed ? '✓' : '✗'}</td>
        <td>${s.duration}ms</td>
        <td>${s.error || '-'}</td>
      </tr>
    `).join('');

    return `
    <tr class="${t.passed ? 'success' : 'failure'}">
      <td><strong>${t.name}</strong></td>
      <td>${t.passed ? '✓ PASS' : '✗ FAIL'}</td>
      <td>${(t.duration / 1000).toFixed(1)}s</td>
      <td>${t.stepResults.length} steps</td>
      <td>${t.error || '-'}</td>
    </tr>
    ${stepDetails}
  `;
  }).join('');

  const passRate = result.summary.passRate.toFixed(0);
  const passColor = result.summary.passRate === 100 ? '#10b981' : result.summary.passRate >= 80 ? '#f59e0b' : '#ef4444';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Suite Report - ${result.name}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
      background: #f5f5f5;
    }
    h1 { color: #1a1a1a; border-bottom: 3px solid #3b82f6; padding-bottom: 0.5rem; }
    .meta { background: white; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
    .meta p { margin: 0.25rem 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 1rem;
    }
    th, td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid #eee;
    }
    th { background: #1a1a1a; color: white; }
    tr.success { background: #ecfdf5; }
    tr.failure { background: #fef2f2; }
    tr.step-pass { background: #f8fafc; }
    tr.step-fail { background: #fff5f5; }
    .step-indent { padding-left: 2rem; font-size: 0.875rem; color: #666; }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      margin: 1rem 0;
    }
    .stat {
      background: white;
      padding: 1rem;
      border-radius: 8px;
      text-align: center;
    }
    .stat .value { font-size: 1.75rem; font-weight: bold; }
    .stat .label { color: #666; font-size: 0.875rem; }
    .pass-rate { color: ${passColor}; }
    .failures {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 1rem;
      margin-top: 1rem;
    }
    .failures h3 { margin-top: 0; color: #dc2626; }
    .failures ul { margin: 0; padding-left: 1.5rem; }
    code { background: #f1f5f9; padding: 0.125rem 0.25rem; border-radius: 4px; font-size: 0.875rem; }
  </style>
</head>
<body>
  <h1>🧪 Natural Language Test Report</h1>

  <div class="meta">
    <p><strong>Suite:</strong> ${result.name}</p>
    <p><strong>Timestamp:</strong> ${result.timestamp}</p>
    <p><strong>Duration:</strong> ${(result.duration / 1000).toFixed(1)}s</p>
  </div>

  <div class="summary">
    <div class="stat">
      <div class="value pass-rate">${passRate}%</div>
      <div class="label">Pass Rate</div>
    </div>
    <div class="stat">
      <div class="value">${result.summary.passed}</div>
      <div class="label">Passed</div>
    </div>
    <div class="stat">
      <div class="value" style="color: ${result.summary.failed > 0 ? '#ef4444' : '#10b981'};">${result.summary.failed}</div>
      <div class="label">Failed</div>
    </div>
    <div class="stat">
      <div class="value">${result.summary.total}</div>
      <div class="label">Total Tests</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Test / Step</th>
        <th>Status</th>
        <th>Duration</th>
        <th>Steps</th>
        <th>Error</th>
      </tr>
    </thead>
    <tbody>
      ${testRows}
    </tbody>
  </table>

  ${result.summary.failed > 0 ? `
  <div class="failures">
    <h3>❌ Failed Tests</h3>
    <ul>
      ${result.testResults.filter(t => !t.passed).map(t => `
        <li>
          <strong>${t.name}</strong>: ${t.error}
          <ul>
            ${t.stepResults.filter(s => !s.passed).map(s => `<li><code>${s.instruction}</code> - ${s.error}</li>`).join('')}
          </ul>
        </li>
      `).join('')}
    </ul>
  </div>
  ` : ''}

  <p style="color: #999; text-align: center; margin-top: 2rem;">
    Generated by CBrowser v6.1.0 - Natural Language Test Suites
  </p>
</body>
</html>`;
}

function parseGeoLocation(location: string): { latitude: number; longitude: number } | null {
  // Check if it's a preset
  if (LOCATION_PRESETS[location]) {
    return LOCATION_PRESETS[location];
  }
  // Try parsing as lat,lon
  const parts = location.split(",");
  if (parts.length === 2) {
    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);
    if (!isNaN(lat) && !isNaN(lon)) {
      return { latitude: lat, longitude: lon };
    }
  }
  return null;
}

async function main(): Promise<void> {
  const { command, args, options } = parseArgs(process.argv.slice(2));

  if (command === "help" || options.help) {
    showHelp();
    process.exit(0);
  }

  // MCP Server mode - runs before browser instantiation
  if (command === "mcp-server") {
    console.error("🔌 Starting CBrowser MCP Server...");
    await startMcpServer();
    return;
  }

  // Remote MCP Server mode - HTTP server for claude.ai connectors
  if (command === "mcp-remote") {
    if (options.port) process.env.PORT = String(options.port);
    if (options.host) process.env.HOST = String(options.host);
    if (options.stateful) process.env.MCP_SESSION_MODE = "stateful";
    await startRemoteMcpServer();
    return;
  }

  // Status command - runs before browser instantiation
  if (command === "status") {
    const fs = await import("fs");
    const path = await import("path");
    let version = "7.4.12";
    // Try to read version from package.json at runtime
    try {
      const pkgPath = path.resolve(__dirname, "..", "package.json");
      if (fs.existsSync(pkgPath)) {
        version = JSON.parse(fs.readFileSync(pkgPath, "utf-8")).version;
      }
    } catch {}
    const info = await getStatusInfo(version);
    console.log(formatStatus(info));
    process.exit(0);
  }

  // Install PAI skill
  if (command === "install-skill") {
    const { execSync } = await import("child_process");
    const path = await import("path");
    const fs = await import("fs");
    const os = await import("os");

    const skillDir = path.join(os.homedir(), ".claude", "skills", "CBrowser");
    const repoUrl = "https://raw.githubusercontent.com/alexandriashai/cbrowser/main";

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           CBrowser PAI Skill Installer v7.4.6                 ║
╚═══════════════════════════════════════════════════════════════╝
`);

    // Check if ~/.claude/skills exists
    const skillsDir = path.join(os.homedir(), ".claude", "skills");
    if (!fs.existsSync(skillsDir)) {
      console.log("Creating ~/.claude/skills directory...");
      fs.mkdirSync(skillsDir, { recursive: true });
    }

    // Check if skill exists
    if (fs.existsSync(skillDir)) {
      console.log("CBrowser skill already exists. Updating...");
      fs.rmSync(skillDir, { recursive: true });
    }

    // Create directories
    console.log("Creating skill directory structure...");
    fs.mkdirSync(path.join(skillDir, "Workflows"), { recursive: true });
    fs.mkdirSync(path.join(skillDir, "Tools"), { recursive: true });
    fs.mkdirSync(path.join(skillDir, ".memory", "sessions"), { recursive: true });

    // Download files
    console.log("Downloading skill files...");
    const files = [
      "SKILL.md",
      "Philosophy.md",
      "AIVision.md",
      "SessionManagement.md",
      "Credentials.md",
      "Personas.md",
      "Workflows/Navigate.md",
      "Workflows/Interact.md",
      "Workflows/Extract.md",
      "Workflows/Authenticate.md",
      "Workflows/Test.md",
      "Workflows/Journey.md",
      "Tools/CBrowser.ts",
    ];

    for (const file of files) {
      try {
        const url = `${repoUrl}/skill/${file}`;
        const dest = path.join(skillDir, file);
        console.log(`  - ${file}`);
        execSync(`curl -fsSL "${url}" -o "${dest}"`, { stdio: "pipe" });
      } catch {
        console.log(`  Warning: Could not download ${file}`);
      }
    }

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              CBrowser Skill Installed Successfully!           ║
╚═══════════════════════════════════════════════════════════════╝

Skill installed to: ${skillDir}

Next steps:
  1. Add to your skill-index.json:
     "CBrowser": "${skillDir}/SKILL.md"

  2. Install all Playwright browsers (for cross-browser testing):
     npx playwright install

  3. Start using CBrowser in Claude Code!

Documentation: https://github.com/alexandriashai/cbrowser/wiki
`);
    return;
  }

  // Daemon mode commands
  if (command === "daemon") {
    const subCommand = args[0];
    const port = parseInt(options.port as string) || 9222;

    switch (subCommand) {
      case "start": {
        console.log("🚀 Starting CBrowser daemon...");
        const result = await startDaemon(port);
        console.log(result.success ? `✓ ${result.message}` : `✗ ${result.message}`);
        process.exit(result.success ? 0 : 1);
        break;
      }

      case "stop": {
        console.log("🛑 Stopping CBrowser daemon...");
        const result = await stopDaemon();
        console.log(result.success ? `✓ ${result.message}` : `✗ ${result.message}`);
        process.exit(0);
        break;
      }

      case "status": {
        const status = await getDaemonStatus();
        console.log(status);
        process.exit(0);
        break;
      }

      case "run": {
        // Internal: run daemon in foreground
        console.log("🔧 Running daemon in foreground mode...");
        const browserType = options.browser === "firefox" ? "firefox"
          : options.browser === "webkit" ? "webkit"
          : "chromium";
        // runDaemonServer will merge with defaults internally
        await runDaemonServer({
          browser: browserType,
          headless: options.headless !== false && options.headless !== "false",
        }, port);
        return;
      }

      default:
        console.error(`Unknown daemon command: ${subCommand}`);
        console.error("Use: daemon start | daemon stop | daemon status");
        process.exit(1);
    }
    return;
  }

  // Check if daemon is running and use it for supported commands
  const daemonRunning = await isDaemonRunning();
  if (daemonRunning && ["navigate", "click", "fill", "screenshot", "extract", "run"].includes(command)) {
    console.log("🔌 Connected to running daemon");

    let daemonCommand = command;
    let daemonArgs: Record<string, unknown> = {};

    switch (command) {
      case "navigate":
        daemonArgs = { url: args[0] || options.url };
        break;
      case "click":
        daemonArgs = { selector: args[0] };
        break;
      case "fill":
        daemonArgs = { selector: args[0], value: args[1] };
        break;
      case "screenshot":
        daemonArgs = { path: args[0] };
        break;
      case "extract":
        daemonArgs = { what: args[0] };
        break;
      case "run":
        daemonArgs = { command: args.join(" ") };
        break;
    }

    const result = await sendToDaemon(daemonCommand, daemonArgs);
    if (result.success) {
      console.log("✓ Command executed via daemon");
      if (result.result) {
        console.log(JSON.stringify(result.result, null, 2));
      }
    } else {
      console.error(`✗ Daemon error: ${result.error}`);
      process.exit(1);
    }
    return;
  }

  // Parse browser type
  const browserType = options.browser === "firefox" ? "firefox"
    : options.browser === "webkit" ? "webkit"
    : "chromium";

  // Parse geolocation
  let geolocation = undefined;
  if (options.geo) {
    geolocation = parseGeoLocation(options.geo as string);
    if (!geolocation) {
      console.error(`Invalid geolocation: ${options.geo}`);
      console.error("Use a preset name (new-york, london, etc.) or lat,lon format");
      process.exit(1);
    }
  }

  const persistentMode = options.persistent === true || options.persistent === "true";
  if (persistentMode) {
    console.log("🔄 Persistent mode enabled");
  }

  // Default to headless for CLI usage, unless explicitly set to false
  const headless = options.headless !== false && options.headless !== "false";

  const browser = new CBrowser({
    browser: browserType,
    headless,
    device: options.device as string,
    geolocation,
    locale: options.locale as string,
    timezone: options.timezone as string,
    recordVideo: options["record-video"] === true,
    persistent: persistentMode,
    verbose: true,
  });

  try {
    switch (command) {
      case "navigate": {
        const url = args[0] || (typeof options.url === "string" ? options.url : undefined);
        if (!url) {
          console.error("Error: URL required");
          process.exit(1);
        }
        const result = await browser.navigate(url);
        console.log(`✓ Navigated to: ${result.url}`);
        console.log(`  Title: ${result.title}`);
        console.log(`  Load time: ${result.loadTime}ms`);
        console.log(`  Screenshot: ${result.screenshot}`);
        if (result.errors.length > 0) {
          console.log(`  Errors: ${result.errors.length}`);
        }
        break;
      }

      case "click": {
        const selector = args[0];
        if (!selector) {
          console.error("Error: Selector required");
          process.exit(1);
        }
        // Navigate first if URL provided
        if (options.url) {
          await browser.navigate(options.url as string);
        }
        const verbose = options.verbose === true;
        const debugDir = options["debug-dir"] as string | undefined;
        const result = await browser.click(selector, { force: options.force === true, verbose, debugDir });
        if (result.success) {
          console.log(`✓ ${result.message}`);
        } else {
          console.error(`✗ ${result.message}`);
          if (verbose && result.aiSuggestion) {
            console.error(`\n💡 ${result.aiSuggestion}`);
          }
          if (verbose && result.availableElements && result.availableElements.length > 0) {
            console.error(`\n📋 Available clickable elements:`);
            for (const el of result.availableElements) {
              console.error(`   ${el.tag}: "${el.text}" → ${el.selector}`);
            }
          }
          if (verbose && result.debugScreenshot) {
            console.error(`\n📸 Debug screenshot: ${result.debugScreenshot}`);
          }
          process.exit(1);
        }
        break;
      }

      case "fill": {
        const selector = args[0];
        const value = args[1];
        if (!selector || !value) {
          console.error("Error: Selector and value required");
          process.exit(1);
        }
        if (options.url) {
          await browser.navigate(options.url as string);
        }
        const verbose = options.verbose === true;
        const debugDir = options["debug-dir"] as string | undefined;
        const result = await browser.fill(selector, value, { verbose, debugDir });
        if (result.success) {
          console.log(`✓ ${result.message}`);
        } else {
          console.error(`✗ ${result.message}`);
          if (verbose && result.aiSuggestion) {
            console.error(`\n💡 ${result.aiSuggestion}`);
          }
          if (verbose && result.availableInputs && result.availableInputs.length > 0) {
            console.error(`\n📋 Available input fields:`);
            for (const input of result.availableInputs) {
              const desc = input.label || input.placeholder || input.name || input.type;
              console.error(`   ${desc} (${input.type}) → ${input.selector}`);
            }
          }
          if (verbose && result.debugScreenshot) {
            console.error(`\n📸 Debug screenshot: ${result.debugScreenshot}`);
          }
          process.exit(1);
        }
        break;
      }

      case "extract": {
        const what = args[0] || "text";
        if (options.url) {
          await browser.navigate(options.url as string);
        }
        const result = await browser.extract(what);
        console.log(JSON.stringify(result.data, null, 2));
        break;
      }

      // =========================================================================
      // Tier 5: Smart Retry & Assertions (v5.0.0)
      // =========================================================================

      case "smart-click": {
        const selector = args[0];
        if (!selector) {
          console.error("Error: Selector required");
          process.exit(1);
        }

        if (options.url) {
          await browser.navigate(options.url as string);
        }

        const maxRetries = options["max-retries"] ? parseInt(options["max-retries"] as string) : 3;
        const retryDelay = options["retry-delay"] ? parseInt(options["retry-delay"] as string) : 1000;

        console.log(`\n🔄 Smart clicking: "${selector}" (max ${maxRetries} retries)\n`);

        const result = await browser.smartClick(selector, {
          force: options.force === true,
          maxRetries,
          retryDelay,
          dismissOverlays: options["dismiss-overlays"] === true,
        });

        for (const attempt of result.attempts) {
          const status = attempt.success ? "✓" : "✗";
          const altInfo = attempt.alternativeUsed ? ` (${attempt.alternativeUsed})` : "";
          console.log(`  Attempt ${attempt.attempt}: ${status} ${attempt.selector}${altInfo}`);
        }

        if (result.success) {
          console.log(`\n✓ ${result.message}`);
          if (result.finalSelector !== selector) {
            console.log(`  Used alternative selector: ${result.finalSelector}`);
          }
        } else {
          console.error(`\n✗ ${result.message}`);
          if (result.aiSuggestion) {
            console.log(`\n💡 Suggestion:\n${result.aiSuggestion}`);
          }
          process.exit(1);
        }
        break;
      }

      case "dismiss-overlay": {
        if (options.url) {
          await browser.navigate(options.url as string);
        }

        const overlayType = (options.type as string) || "auto";
        const customSelector = options.selector as string | undefined;

        console.log(`\n🔍 Detecting overlays (type: ${overlayType})...\n`);

        const result = await browser.dismissOverlay({
          type: overlayType as any,
          customSelector,
        });

        if (result.overlaysFound === 0) {
          console.log("  No overlays detected on this page.");
        } else {
          console.log(`  Found ${result.overlaysFound} overlay(s):\n`);
          for (const d of result.details) {
            const status = d.dismissed ? "✓ Dismissed" : "✗ Not dismissed";
            console.log(`    ${status} [${d.type}] ${d.selector}`);
            if (d.closeMethod) console.log(`      Method: ${d.closeMethod}`);
            if (d.error) console.log(`      Error: ${d.error}`);
          }
        }

        if (result.dismissed) {
          console.log(`\n✓ Dismissed ${result.overlaysDismissed} overlay(s)`);
        } else if (result.overlaysFound > 0) {
          console.error("\n✗ Could not dismiss detected overlays");
          if (result.suggestion) console.log(`\n💡 ${result.suggestion}`);
          process.exit(1);
        }

        if (result.screenshot) {
          console.log(`\n📸 Screenshot: ${result.screenshot}`);
        }
        break;
      }

      case "assert": {
        const assertion = args[0];
        if (!assertion) {
          console.error("Error: Assertion required");
          console.error('Example: cbrowser assert "page contains \'Welcome\'"');
          process.exit(1);
        }

        if (options.url) {
          await browser.navigate(options.url as string);
        }

        const result = await browser.assert(assertion);

        if (result.passed) {
          console.log(`✓ PASS: ${result.message}`);
          if (result.actual !== undefined) {
            console.log(`  Actual: ${result.actual}`);
          }
        } else {
          console.error(`✗ FAIL: ${result.message}`);
          if (result.actual !== undefined) {
            console.log(`  Actual: ${result.actual}`);
          }
          if (result.expected !== undefined) {
            console.log(`  Expected: ${result.expected}`);
          }
          process.exit(1);
        }
        break;
      }

      // =========================================================================
      // Tier 5: Self-Healing Selectors (v5.0.0)
      // =========================================================================

      case "heal": {
        const subcommand = args[0];

        switch (subcommand) {
          case "stats": {
            const stats = browser.getSelectorCacheStats();
            console.log("\n🔧 Self-Healing Selector Cache Statistics\n");
            console.log(`  Total cached mappings: ${stats.totalEntries}`);
            console.log(`  Total successful heals: ${stats.totalHeals}`);

            if (Object.keys(stats.byDomain).length > 0) {
              console.log("\n  By Domain:");
              for (const [domain, count] of Object.entries(stats.byDomain)) {
                console.log(`    ${domain}: ${count} selectors`);
              }
            }

            if (stats.topHealedSelectors.length > 0) {
              console.log("\n  Top Healed Selectors:");
              for (const entry of stats.topHealedSelectors.slice(0, 5)) {
                console.log(`    "${entry.original}" → "${entry.working}" (${entry.heals} heals)`);
              }
            }
            break;
          }

          case "list": {
            const domain = options.domain as string | undefined;
            const entries = browser.listCachedSelectors(domain);

            if (entries.length === 0) {
              console.log("No cached selectors" + (domain ? ` for ${domain}` : ""));
            } else {
              console.log(`\n🔧 Cached Selectors${domain ? ` for ${domain}` : ""}\n`);
              for (const entry of entries) {
                console.log(`  "${entry.originalSelector}" → "${entry.workingSelector}"`);
                console.log(`    Domain: ${entry.domain} | Heals: ${entry.successCount} | Fails: ${entry.failCount}`);
                console.log(`    Reason: ${entry.reason}`);
                console.log("");
              }
            }
            break;
          }

          case "clear": {
            const domain = options.domain as string | undefined;
            const cleared = browser.clearSelectorCache(domain);
            console.log(`✓ Cleared ${cleared} cached selector${cleared !== 1 ? "s" : ""}${domain ? ` for ${domain}` : ""}`);
            break;
          }

          case "test": {
            const selector = args[1];
            if (!selector) {
              console.error("Error: Selector required");
              console.error("Usage: cbrowser heal test <selector> --url <url>");
              process.exit(1);
            }

            if (options.url) {
              await browser.navigate(options.url as string);
            }

            // Check if there's a cached mapping
            const entries = browser.listCachedSelectors();
            const cached = entries.find(e =>
              e.originalSelector.toLowerCase() === selector.toLowerCase()
            );

            if (cached) {
              console.log(`\n🔧 Selector would be healed:\n`);
              console.log(`  Original: "${cached.originalSelector}"`);
              console.log(`  Healed to: "${cached.workingSelector}"`);
              console.log(`  Success rate: ${cached.successCount}/${cached.successCount + cached.failCount}`);
            } else {
              console.log(`\nNo cached healing for "${selector}"`);
              console.log("Use smart-click to auto-discover alternatives.");
            }
            break;
          }

          default:
            console.error("Usage: cbrowser heal [stats|list|clear|test]");
            process.exit(1);
        }
        break;
      }

      // =========================================================================
      // Tier 5: AI Test Generation (v5.0.0)
      // =========================================================================

      case "generate": {
        const url = args[0];
        if (!url) {
          console.error("Error: URL required");
          console.error("Usage: cbrowser generate <url> [--format summary|cbrowser|playwright|all]");
          process.exit(1);
        }

        console.log(`\n🧪 Analyzing page and generating tests...\n`);

        const result = await browser.generateTests(url);
        const format = (options.format as string) || "summary";
        const outputFile = options.output as string | undefined;

        let output = "";

        if (format === "summary" || format === "all") {
          output += `📊 Page Analysis: ${result.url}\n`;
          output += `   Title: ${result.analysis.title}\n`;
          output += `   Forms: ${result.analysis.forms.length}\n`;
          output += `   Buttons: ${result.analysis.buttons.length}\n`;
          output += `   Links: ${result.analysis.links.length}\n`;
          output += `   Has Login: ${result.analysis.hasLogin}\n`;
          output += `   Has Search: ${result.analysis.hasSearch}\n\n`;

          output += `🧪 Generated ${result.tests.length} Test Scenarios:\n\n`;
          for (const test of result.tests) {
            output += `  📝 ${test.name}\n`;
            output += `     ${test.description}\n`;
            output += `     Steps: ${test.steps.length}\n`;
            output += `     Assertions: ${test.assertions.join(", ")}\n\n`;
          }
        }

        if (format === "cbrowser" || format === "all") {
          output += `\n${"=".repeat(60)}\n`;
          output += `📜 CBrowser Script:\n`;
          output += `${"=".repeat(60)}\n\n`;
          output += result.cbrowserScript;
        }

        if (format === "playwright" || format === "all") {
          output += `\n${"=".repeat(60)}\n`;
          output += `🎭 Playwright Code:\n`;
          output += `${"=".repeat(60)}\n\n`;
          output += result.playwrightCode;
        }

        if (outputFile) {
          const { writeFileSync } = await import("fs");
          writeFileSync(outputFile, output);
          console.log(`✓ Saved to: ${outputFile}`);
        } else {
          console.log(output);
        }
        break;
      }

      case "analyze": {
        const url = args[0];
        if (!url) {
          console.error("Error: URL required");
          process.exit(1);
        }

        await browser.navigate(url);
        const analysis = await browser.analyzePage();

        console.log(`\n📊 Page Analysis: ${analysis.url}\n`);
        console.log(`Title: ${analysis.title}`);
        console.log(`\n📝 Forms (${analysis.forms.length}):`);
        for (const form of analysis.forms) {
          console.log(`  - Purpose: ${form.purpose}`);
          console.log(`    Fields: ${form.fields.length}`);
          for (const field of form.fields) {
            console.log(`      • ${field.type}: ${field.name || field.placeholder || field.selector}`);
          }
        }

        console.log(`\n🔘 Buttons (${analysis.buttons.length}):`);
        for (const btn of analysis.buttons.slice(0, 10)) {
          console.log(`  - "${btn.text || btn.ariaLabel || btn.selector}"`);
        }

        console.log(`\n🔗 Links (${analysis.links.length}):`);
        for (const link of analysis.links.slice(0, 10)) {
          console.log(`  - "${link.text}" → ${link.href}`);
        }

        console.log(`\n📋 Features:`);
        console.log(`  Has Login: ${analysis.hasLogin}`);
        console.log(`  Has Search: ${analysis.hasSearch}`);
        console.log(`  Has Navigation: ${analysis.hasNavigation}`);
        break;
      }

      case "screenshot": {
        const path = args[0];
        if (options.url) {
          await browser.navigate(options.url as string);
        }
        const file = await browser.screenshot(path);
        console.log(`✓ Screenshot saved: ${file}`);
        break;
      }

      case "journey": {
        const persona = args[0] || "first-timer";
        const startUrl = options.start as string;
        const goal = (options.goal as string) || "Explore the site";

        if (!startUrl) {
          console.error("Error: --start URL required");
          process.exit(1);
        }

        console.log(`🚀 Starting journey as "${persona}"...`);
        console.log(`   Goal: ${goal}`);
        console.log("");

        const result = await browser.journey({ persona, startUrl, goal });

        console.log("");
        console.log(`📊 Journey Results`);
        console.log(`   Success: ${result.success ? "✓" : "✗"}`);
        console.log(`   Steps: ${result.steps.length}`);
        console.log(`   Time: ${result.totalTime}ms`);
        console.log(`   Friction points: ${result.frictionPoints.length}`);

        if (result.frictionPoints.length > 0) {
          console.log("");
          console.log("⚠️  Friction Points:");
          for (const point of result.frictionPoints) {
            console.log(`   - ${point}`);
          }
        }
        break;
      }

      // =========================================================================
      // Tier 6: Multi-Persona Comparison (v6.0.0)
      // =========================================================================

      case "compare-personas": {
        const startUrl = options.start as string;
        const goal = options.goal as string;
        const personaList = options.personas as string;

        if (!startUrl) {
          console.error("Error: --start URL required");
          process.exit(1);
        }

        if (!goal) {
          console.error("Error: --goal required");
          process.exit(1);
        }

        // Default to comparing all built-in personas if none specified
        const personaNames = personaList
          ? personaList.split(",").map((p) => p.trim())
          : Object.keys(BUILTIN_PERSONAS);

        const concurrency = options.concurrency
          ? parseInt(options.concurrency as string)
          : 3;

        const comparison = await comparePersonas({
          startUrl,
          goal,
          personas: personaNames,
          maxConcurrency: concurrency,
          headless,
        });

        // Print formatted report
        const report = formatComparisonReport(comparison);
        console.log(report);

        // Save JSON output if requested
        if (options.output) {
          const fs = await import("fs");
          fs.writeFileSync(options.output as string, JSON.stringify(comparison, null, 2));
          console.log(`\n📄 JSON report saved: ${options.output}`);
        }

        // Generate HTML report if requested
        if (options.html) {
          const fs = await import("fs");
          const htmlReport = generateHtmlReport(comparison);
          const htmlPath = (options.output as string)?.replace(".json", ".html") || "comparison-report.html";
          fs.writeFileSync(htmlPath, htmlReport);
          console.log(`\n🌐 HTML report saved: ${htmlPath}`);
        }

        // Exit with error if any personas failed
        if (comparison.summary.failureCount > 0) {
          process.exit(1);
        }
        break;
      }

      case "persona": {
        const subcommand = args[0];

        switch (subcommand) {
          case "list": {
            console.log("\n📋 Available Personas:\n");

            // Built-in personas
            console.log("  Built-in:");
            for (const [name, persona] of Object.entries(BUILTIN_PERSONAS)) {
              console.log(`    ${name}`);
              console.log(`      ${persona.description}`);
              console.log(`      Tech: ${persona.demographics.tech_level} | Device: ${persona.demographics.device}`);
              console.log("");
            }

            // Custom personas
            const customPersonas = loadCustomPersonas();
            const customNames = Object.keys(customPersonas);
            if (customNames.length > 0) {
              console.log("  Custom:");
              for (const [name, persona] of Object.entries(customPersonas)) {
                console.log(`    ${name}`);
                console.log(`      ${persona.description}`);
                console.log(`      Tech: ${persona.demographics.tech_level} | Device: ${persona.demographics.device}`);
                console.log("");
              }
            }
            break;
          }

          case "create": {
            const description = args.slice(1).join(" ");
            if (!description) {
              console.error("Usage: cbrowser persona create \"<description>\" [--name <name>]");
              console.error("\nExamples:");
              console.error("  cbrowser persona create \"impatient developer who hates slow UIs\"");
              console.error("  cbrowser persona create \"elderly user new to computers\" --name grandma");
              console.error("  cbrowser persona create \"distracted teen on their phone\"");
              process.exit(1);
            }

            // Generate name from description if not provided
            let personaName = options.name as string;
            if (!personaName) {
              // Create a slug from first few words
              personaName = description
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, "")
                .split(/\s+/)
                .slice(0, 3)
                .join("-");
            }

            // Check if trying to overwrite built-in
            if (isBuiltinPersona(personaName)) {
              console.error(`Error: Cannot overwrite built-in persona "${personaName}"`);
              console.error("Use a different name with --name <name>");
              process.exit(1);
            }

            console.log(`\n🤖 Generating persona from description...\n`);
            console.log(`   "${description}"\n`);

            const persona = generatePersonaFromDescription(personaName, description);

            // Display the generated persona
            console.log(`━━━ Generated Persona: ${persona.name} ━━━\n`);
            console.log(`Description: ${persona.description}`);
            console.log(`\nDemographics:`);
            console.log(`  Age Range: ${persona.demographics.age_range}`);
            console.log(`  Tech Level: ${persona.demographics.tech_level}`);
            console.log(`  Device: ${persona.demographics.device}`);

            console.log(`\nTiming:`);
            console.log(`  Reaction Time: ${persona.humanBehavior?.timing.reactionTime.min}-${persona.humanBehavior?.timing.reactionTime.max}ms`);
            console.log(`  Click Delay: ${persona.humanBehavior?.timing.clickDelay.min}-${persona.humanBehavior?.timing.clickDelay.max}ms`);
            console.log(`  Type Speed: ${persona.humanBehavior?.timing.typeSpeed.min}-${persona.humanBehavior?.timing.typeSpeed.max}ms/char`);
            console.log(`  Reading Speed: ${persona.humanBehavior?.timing.readingSpeed} wpm`);

            console.log(`\nError Rates:`);
            console.log(`  Misclick: ${((persona.humanBehavior?.errors.misClickRate || 0) * 100).toFixed(0)}%`);
            console.log(`  Accidental Double-click: ${((persona.humanBehavior?.errors.doubleClickAccidental || 0) * 100).toFixed(0)}%`);
            console.log(`  Typo: ${((persona.humanBehavior?.errors.typoRate || 0) * 100).toFixed(0)}%`);

            console.log(`\nMouse Behavior:`);
            console.log(`  Speed: ${persona.humanBehavior?.mouse.speed}`);
            console.log(`  Curvature: ${persona.humanBehavior?.mouse.curvature}`);
            console.log(`  Jitter: ${persona.humanBehavior?.mouse.jitter}px`);

            console.log(`\nAttention:`);
            console.log(`  Pattern: ${persona.humanBehavior?.attention.pattern}`);
            console.log(`  Scroll: ${persona.humanBehavior?.attention.scrollBehavior}`);
            console.log(`  Focus: ${persona.humanBehavior?.attention.focusAreas.join(", ")}`);
            console.log(`  Distraction Rate: ${((persona.humanBehavior?.attention.distractionRate || 0) * 100).toFixed(0)}%`);

            console.log(`\nViewport: ${persona.context?.viewport?.[0]}x${persona.context?.viewport?.[1]}`);

            if (Object.keys(persona.behaviors).length > 0) {
              console.log(`\nBehaviors: ${Object.keys(persona.behaviors).join(", ")}`);
            }

            // Save the persona
            const filepath = saveCustomPersona(persona);
            console.log(`\n✓ Persona saved: ${filepath}`);
            console.log(`\nUse with: cbrowser journey ${personaName} --start <url> --goal "<goal>"`);
            break;
          }

          case "show": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser persona show <name>");
              process.exit(1);
            }

            // Check built-in first, then custom
            let persona = BUILTIN_PERSONAS[name];
            let isCustom = false;

            if (!persona) {
              const customPersonas = loadCustomPersonas();
              persona = customPersonas[name];
              isCustom = true;
            }

            if (!persona) {
              console.error(`Persona not found: ${name}`);
              console.error("Run 'cbrowser persona list' to see available personas");
              process.exit(1);
            }

            console.log(`\n━━━ Persona: ${persona.name} ${isCustom ? "(custom)" : "(built-in)"} ━━━\n`);
            console.log(JSON.stringify(persona, null, 2));
            break;
          }

          case "delete": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser persona delete <name>");
              process.exit(1);
            }

            if (isBuiltinPersona(name)) {
              console.error(`Cannot delete built-in persona: ${name}`);
              process.exit(1);
            }

            const deleted = deleteCustomPersona(name);
            if (deleted) {
              console.log(`✓ Persona deleted: ${name}`);
            } else {
              console.error(`Custom persona not found: ${name}`);
              process.exit(1);
            }
            break;
          }

          case "export": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser persona export <name>");
              process.exit(1);
            }

            // Get persona (built-in or custom)
            let persona = BUILTIN_PERSONAS[name];
            if (!persona) {
              const customPersonas = loadCustomPersonas();
              persona = customPersonas[name];
            }

            if (!persona) {
              console.error(`Persona not found: ${name}`);
              process.exit(1);
            }

            const fs = await import("fs");
            const filename = `${name}.persona.json`;
            fs.writeFileSync(filename, JSON.stringify(persona, null, 2));
            console.log(`✓ Exported to: ${filename}`);
            break;
          }

          case "import": {
            const file = args[1];
            if (!file) {
              console.error("Usage: cbrowser persona import <file>");
              process.exit(1);
            }

            const fs = await import("fs");
            if (!fs.existsSync(file)) {
              console.error(`File not found: ${file}`);
              process.exit(1);
            }

            try {
              const content = fs.readFileSync(file, "utf-8");
              const persona = JSON.parse(content);

              if (!persona.name || !persona.description) {
                console.error("Invalid persona file: missing name or description");
                process.exit(1);
              }

              if (isBuiltinPersona(persona.name)) {
                console.error(`Cannot import: "${persona.name}" is a built-in persona name`);
                console.error("Edit the JSON file to change the name");
                process.exit(1);
              }

              const filepath = saveCustomPersona(persona);
              console.log(`✓ Imported persona: ${persona.name}`);
              console.log(`  Saved to: ${filepath}`);
            } catch (e: any) {
              console.error(`Failed to import: ${e.message}`);
              process.exit(1);
            }
            break;
          }

          default:
            console.error("Usage: cbrowser persona [list|create|show|delete|export|import]");
            console.error("\nExamples:");
            console.error("  cbrowser persona list");
            console.error("  cbrowser persona create \"impatient developer\" --name dev-persona");
            console.error("  cbrowser persona show power-user");
            console.error("  cbrowser persona delete my-custom-persona");
        }
        break;
      }

      case "session": {
        const subcommand = args[0];
        const name = args[1];

        switch (subcommand) {
          case "save": {
            if (!name) {
              console.error("Error: Session name required");
              process.exit(1);
            }
            if (options.url) {
              await browser.navigate(options.url as string);
            }
            await browser.saveSession(name);
            console.log(`✓ Session saved: ${name}`);
            break;
          }
          case "load": {
            if (!name) {
              console.error("Error: Session name required");
              process.exit(1);
            }
            const loadResult = await browser.loadSession(name);
            if (loadResult.success) {
              console.log(`✓ Session loaded: ${name}`);
              console.log(`  Cookies: ${loadResult.cookiesRestored}, localStorage: ${loadResult.localStorageKeysRestored}, sessionStorage: ${loadResult.sessionStorageKeysRestored}`);
              if (loadResult.warning) {
                console.log(`  ⚠️  ${loadResult.warning}`);
              }
            } else {
              console.error(`✗ Session not found: ${name}`);
              process.exit(1);
            }
            break;
          }
          case "list": {
            const sessions = browser.listSessionsDetailed();
            if (sessions.length === 0) {
              console.log("No saved sessions");
            } else {
              console.log("\n📋 Saved Sessions:\n");
              // Table header
              const nameW = Math.max(16, ...sessions.map((s) => s.name.length)) + 2;
              const domainW = Math.max(16, ...sessions.map((s) => s.domain.length)) + 2;
              console.log(
                `  ${"Name".padEnd(nameW)}${"Domain".padEnd(domainW)}${"Created".padEnd(22)}${"Cookies".padEnd(10)}${"Size".padEnd(10)}`
              );
              console.log(`  ${"─".repeat(nameW)}${"─".repeat(domainW)}${"─".repeat(22)}${"─".repeat(10)}${"─".repeat(10)}`);
              for (const s of sessions) {
                const created = new Date(s.created).toLocaleString("en-US", {
                  month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
                });
                const size = s.sizeBytes < 1024
                  ? `${s.sizeBytes} B`
                  : `${(s.sizeBytes / 1024).toFixed(1)} KB`;
                console.log(
                  `  ${s.name.padEnd(nameW)}${s.domain.padEnd(domainW)}${created.padEnd(22)}${String(s.cookies).padEnd(10)}${size.padEnd(10)}`
                );
              }
              console.log();
            }
            break;
          }
          case "show": {
            if (!name) {
              console.error("Error: Session name required");
              process.exit(1);
            }
            const details = browser.getSessionDetails(name);
            if (!details) {
              console.error(`✗ Session not found: ${name}`);
              process.exit(1);
            }
            const fs = await import("fs");
            const path = await import("path");
            const sessionPath = path.join(browser["paths"].sessionsDir, `${name}.json`);
            const fileSize = fs.statSync(sessionPath).size;
            console.log(`\n📋 Session: ${name}\n`);
            console.log(`  Domain:           ${details.domain}`);
            console.log(`  URL:              ${details.url}`);
            console.log(`  Created:          ${new Date(details.created).toLocaleString()}`);
            console.log(`  Last Used:        ${new Date(details.lastUsed).toLocaleString()}`);
            console.log(`  Viewport:         ${details.viewport.width}x${details.viewport.height}`);
            console.log(`  File Size:        ${(fileSize / 1024).toFixed(1)} KB`);
            console.log(`\n  Cookies (${details.cookies.length}):`);
            if (details.cookies.length > 0) {
              const domains = [...new Set(details.cookies.map((c) => c.domain))];
              for (const d of domains) {
                const count = details.cookies.filter((c) => c.domain === d).length;
                console.log(`    ${d}: ${count}`);
              }
            }
            console.log(`\n  localStorage (${Object.keys(details.localStorage).length} keys):`);
            for (const key of Object.keys(details.localStorage).slice(0, 10)) {
              const val = details.localStorage[key];
              const preview = val.length > 60 ? val.substring(0, 60) + "..." : val;
              console.log(`    ${key}: ${preview}`);
            }
            if (Object.keys(details.localStorage).length > 10) {
              console.log(`    ... and ${Object.keys(details.localStorage).length - 10} more`);
            }
            console.log(`\n  sessionStorage (${Object.keys(details.sessionStorage).length} keys):`);
            for (const key of Object.keys(details.sessionStorage).slice(0, 10)) {
              const val = details.sessionStorage[key];
              const preview = val.length > 60 ? val.substring(0, 60) + "..." : val;
              console.log(`    ${key}: ${preview}`);
            }
            if (Object.keys(details.sessionStorage).length > 10) {
              console.log(`    ... and ${Object.keys(details.sessionStorage).length - 10} more`);
            }
            if (details.testCredentials) {
              console.log(`\n  Test Credentials:  ${details.testCredentials.email} @ ${details.testCredentials.baseUrl}`);
            }
            console.log();
            break;
          }
          case "cleanup": {
            const olderThan = parseInt(options["older-than"] as string || "30", 10);
            if (isNaN(olderThan) || olderThan <= 0) {
              console.error("Error: --older-than must be a positive number of days");
              process.exit(1);
            }
            const result = browser.cleanupSessions(olderThan);
            if (result.deleted.length === 0) {
              console.log(`No sessions older than ${olderThan} days`);
            } else {
              console.log(`\n🧹 Cleaned up ${result.deleted.length} session(s):\n`);
              for (const d of result.deleted) {
                console.log(`  ✓ Deleted: ${d}`);
              }
            }
            console.log(`  ${result.kept.length} session(s) kept`);
            break;
          }
          case "export": {
            if (!name) {
              console.error("Error: Session name required");
              process.exit(1);
            }
            const output = (options.output as string) || `${name}.json`;
            const exported = browser.exportSession(name, output);
            if (exported) {
              console.log(`✓ Session exported: ${name} → ${output}`);
            } else {
              console.error(`✗ Session not found: ${name}`);
              process.exit(1);
            }
            break;
          }
          case "import": {
            // args[0] = "import", args[1] = file path
            const filePath = args[1];
            if (!filePath) {
              console.error("Error: File path required");
              process.exit(1);
            }
            const importName = (options.name as string) || filePath.replace(/\.json$/, "").split("/").pop()!;
            const imported = browser.importSession(filePath, importName);
            if (imported) {
              console.log(`✓ Session imported: ${filePath} → ${importName}`);
            } else {
              console.error(`✗ Failed to import session from: ${filePath}`);
              process.exit(1);
            }
            break;
          }
          case "delete": {
            if (!name) {
              console.error("Error: Session name required");
              process.exit(1);
            }
            const deleted = browser.deleteSession(name);
            if (deleted) {
              console.log(`✓ Session deleted: ${name}`);
            } else {
              console.error(`✗ Session not found: ${name}`);
            }
            break;
          }
          default:
            console.error("Usage: cbrowser session [save|load|list|show|delete|cleanup|export|import] <name>");
            console.error("\n  save <name>                    Save current session");
            console.error("  load <name>                    Load a saved session");
            console.error("  list                           List all sessions with metadata");
            console.error("  show <name>                    Show detailed session info");
            console.error("  delete <name>                  Delete a session");
            console.error("  cleanup --older-than <days>    Delete old sessions");
            console.error("  export <name> --output <file>  Export session to file");
            console.error("  import <file> --name <name>    Import session from file");
        }
        break;
      }

      case "storage":
      case "stats": {
        const stats = browser.getStorageStats();
        console.log("\n📊 Storage Usage:\n");
        let totalSize = 0;
        let totalCount = 0;
        for (const [category, { count, size }] of Object.entries(stats)) {
          console.log(`  ${category}: ${count} files (${formatBytes(size)})`);
          totalSize += size;
          totalCount += count;
        }
        console.log("");
        console.log(`  TOTAL: ${totalCount} files (${formatBytes(totalSize)})`);
        break;
      }

      case "cleanup": {
        const cleanupOptions = {
          dryRun: options["dry-run"] === true,
          olderThan: options["older-than"] ? parseInt(options["older-than"] as string, 10) : 7,
          keepScreenshots: options["keep-screenshots"] ? parseInt(options["keep-screenshots"] as string, 10) : 10,
          keepJourneys: options["keep-journeys"] ? parseInt(options["keep-journeys"] as string, 10) : 5,
          keepSessions: options["keep-sessions"] ? parseInt(options["keep-sessions"] as string, 10) : 3,
        };

        const result = browser.cleanup(cleanupOptions);

        if (cleanupOptions.dryRun) {
          console.log("\n🔍 Cleanup Preview (dry run):\n");
        } else {
          console.log("\n🧹 Cleanup Complete:\n");
        }

        console.log(`  Screenshots: ${result.details.screenshots.deleted} files (${formatBytes(result.details.screenshots.freed)})`);
        console.log(`  Journeys: ${result.details.journeys.deleted} files (${formatBytes(result.details.journeys.freed)})`);
        console.log(`  Sessions: ${result.details.sessions.deleted} files (${formatBytes(result.details.sessions.freed)})`);
        console.log(`  Audit: ${result.details.audit.deleted} files (${formatBytes(result.details.audit.freed)})`);
        console.log("");
        console.log(`  TOTAL: ${result.deleted} files | ${formatBytes(result.freedBytes)} ${cleanupOptions.dryRun ? "would be " : ""}freed`);
        break;
      }

      // =========================================================================
      // Cookie Management
      // =========================================================================

      case "cookie": {
        const subcommand = args[0];

        switch (subcommand) {
          case "list": {
            if (options.url) {
              await browser.navigate(options.url as string);
            }
            const cookies = await browser.getCookies();
            if (cookies.length === 0) {
              console.log("No cookies found");
            } else {
              console.log("\n🍪 Cookies:\n");
              for (const cookie of cookies) {
                console.log(`  ${cookie.name}`);
                console.log(`    Value: ${cookie.value.substring(0, 50)}${cookie.value.length > 50 ? "..." : ""}`);
                console.log(`    Domain: ${cookie.domain}`);
                console.log(`    Path: ${cookie.path}`);
                console.log(`    Expires: ${cookie.expires === -1 ? "Session" : new Date(cookie.expires * 1000).toISOString()}`);
                console.log("");
              }
            }
            break;
          }
          case "set": {
            const name = args[1];
            const value = args[2];
            if (!name || !value) {
              console.error("Usage: cbrowser cookie set <name> <value> [--domain <domain>]");
              process.exit(1);
            }
            if (options.url) {
              await browser.navigate(options.url as string);
            }
            const domain = (options.domain as string) || "localhost";
            const path = (options.path as string) || "/";
            await browser.setCookies([{
              name,
              value,
              domain,
              path,
              expires: -1,
              httpOnly: false,
              secure: false,
              sameSite: "Lax",
            }]);
            console.log(`✓ Cookie set: ${name}=${value}`);
            break;
          }
          case "delete": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser cookie delete <name> [--domain <domain>]");
              process.exit(1);
            }
            if (options.url) {
              await browser.navigate(options.url as string);
            }
            await browser.deleteCookie(name, options.domain as string);
            console.log(`✓ Cookie deleted: ${name}`);
            break;
          }
          case "clear": {
            await browser.clearCookies();
            console.log("✓ All cookies cleared");
            break;
          }
          default:
            console.error("Usage: cbrowser cookie [list|set|delete|clear]");
        }
        break;
      }

      // =========================================================================
      // Device Emulation
      // =========================================================================

      case "device": {
        const subcommand = args[0];

        switch (subcommand) {
          case "list": {
            console.log("\n📱 Available Device Presets:\n");
            for (const [name, device] of Object.entries(DEVICE_PRESETS)) {
              console.log(`  ${name}`);
              console.log(`    ${device.name}`);
              console.log(`    ${device.viewport.width}x${device.viewport.height} @${device.deviceScaleFactor}x`);
              console.log(`    Mobile: ${device.isMobile} | Touch: ${device.hasTouch}`);
              console.log("");
            }
            break;
          }
          case "set": {
            const deviceName = args[1];
            if (!deviceName) {
              console.error("Usage: cbrowser device set <name>");
              process.exit(1);
            }
            if (!DEVICE_PRESETS[deviceName]) {
              console.error(`Unknown device: ${deviceName}`);
              console.error("Run 'cbrowser device list' to see available devices");
              process.exit(1);
            }
            console.log(`✓ Device set: ${deviceName}`);
            console.log("  Note: Device emulation applies to new browser sessions");
            break;
          }
          default:
            console.error("Usage: cbrowser device [list|set]");
        }
        break;
      }

      // =========================================================================
      // Geolocation
      // =========================================================================

      case "geo": {
        const subcommand = args[0];

        switch (subcommand) {
          case "list": {
            console.log("\n🌍 Available Location Presets:\n");
            for (const [name, loc] of Object.entries(LOCATION_PRESETS)) {
              console.log(`  ${name}`);
              console.log(`    Lat: ${loc.latitude}, Lon: ${loc.longitude}`);
              console.log("");
            }
            break;
          }
          case "set": {
            const location = args[1];
            if (!location) {
              console.error("Usage: cbrowser geo set <location>");
              console.error("  Location can be a preset name or lat,lon coordinates");
              process.exit(1);
            }
            const geo = parseGeoLocation(location);
            if (!geo) {
              console.error(`Invalid location: ${location}`);
              process.exit(1);
            }
            await browser.setGeolocationRuntime(geo);
            console.log(`✓ Geolocation set: ${geo.latitude}, ${geo.longitude}`);
            break;
          }
          default:
            console.error("Usage: cbrowser geo [list|set]");
        }
        break;
      }

      // =========================================================================
      // Performance
      // =========================================================================

      case "perf": {
        const subcommand = args[0];

        if (subcommand === "audit") {
          const url = args[1];
          if (url) {
            await browser.navigate(url);
          } else if (options.url) {
            await browser.navigate(options.url as string);
          }

          // Create performance budget from options
          const budget = {
            lcp: options["budget-lcp"] ? parseInt(options["budget-lcp"] as string) : 2500,
            fcp: options["budget-fcp"] ? parseInt(options["budget-fcp"] as string) : 1800,
            cls: options["budget-cls"] ? parseFloat(options["budget-cls"] as string) : 0.1,
          };

          // Temporarily set budget in config
          (browser as any).config.performanceBudget = budget;

          const result = await browser.auditPerformance();

          console.log("\n📊 Performance Audit:\n");
          console.log(`  URL: ${result.url}`);
          console.log(`  Result: ${result.passed ? "✓ PASSED" : "✗ FAILED"}`);
          console.log("");
          console.log("  Metrics:");
          if (result.metrics.lcp) console.log(`    LCP: ${result.metrics.lcp.toFixed(0)}ms (${result.metrics.lcpRating})`);
          if (result.metrics.fcp) console.log(`    FCP: ${result.metrics.fcp.toFixed(0)}ms`);
          if (result.metrics.cls !== undefined) console.log(`    CLS: ${result.metrics.cls.toFixed(3)} (${result.metrics.clsRating})`);
          if (result.metrics.ttfb) console.log(`    TTFB: ${result.metrics.ttfb.toFixed(0)}ms`);
          if (result.metrics.load) console.log(`    Load: ${result.metrics.load.toFixed(0)}ms`);
          if (result.metrics.resourceCount) console.log(`    Resources: ${result.metrics.resourceCount}`);
          if (result.metrics.transferSize) console.log(`    Transfer: ${formatBytes(result.metrics.transferSize)}`);

          if (result.violations.length > 0) {
            console.log("");
            console.log("  ⚠️  Budget Violations:");
            for (const v of result.violations) {
              console.log(`    - ${v}`);
            }
          }
        } else {
          // Just collect metrics
          const url = args[0];
          if (url) {
            await browser.navigate(url);
          } else if (options.url) {
            await browser.navigate(options.url as string);
          }

          const metrics = await browser.getPerformanceMetrics();

          console.log("\n📊 Performance Metrics:\n");
          if (metrics.lcp) console.log(`  LCP: ${metrics.lcp.toFixed(0)}ms (${metrics.lcpRating})`);
          if (metrics.fcp) console.log(`  FCP: ${metrics.fcp.toFixed(0)}ms`);
          if (metrics.cls !== undefined) console.log(`  CLS: ${metrics.cls.toFixed(3)} (${metrics.clsRating})`);
          if (metrics.ttfb) console.log(`  TTFB: ${metrics.ttfb.toFixed(0)}ms`);
          if (metrics.domContentLoaded) console.log(`  DOMContentLoaded: ${metrics.domContentLoaded.toFixed(0)}ms`);
          if (metrics.load) console.log(`  Load: ${metrics.load.toFixed(0)}ms`);
          if (metrics.resourceCount) console.log(`  Resources: ${metrics.resourceCount}`);
          if (metrics.transferSize) console.log(`  Transfer Size: ${formatBytes(metrics.transferSize)}`);
        }
        break;
      }

      // =========================================================================
      // HAR Recording
      // =========================================================================

      case "har": {
        const subcommand = args[0];

        switch (subcommand) {
          case "start": {
            browser.startHarRecording();
            console.log("✓ HAR recording started");
            console.log("  Navigate and interact with pages, then run 'cbrowser har stop'");
            break;
          }
          case "stop": {
            const output = args[1];
            const filename = await browser.exportHar(output);
            console.log(`✓ HAR saved: ${filename}`);
            break;
          }
          default:
            console.error("Usage: cbrowser har [start|stop]");
        }
        break;
      }

      // =========================================================================
      // Network
      // =========================================================================

      case "network": {
        const subcommand = args[0];

        switch (subcommand) {
          case "list": {
            const requests = browser.getNetworkRequests();
            if (requests.length === 0) {
              console.log("No network requests captured");
              console.log("Navigate to a page first to capture requests");
            } else {
              console.log(`\n🌐 Network Requests (${requests.length}):\n`);
              for (const req of requests.slice(-20)) {
                console.log(`  ${req.method} ${req.url.substring(0, 80)}${req.url.length > 80 ? "..." : ""}`);
                console.log(`    Type: ${req.resourceType} | Time: ${req.timestamp}`);
              }
              if (requests.length > 20) {
                console.log(`\n  ... and ${requests.length - 20} more requests`);
              }
            }
            break;
          }
          case "clear": {
            browser.clearNetworkHistory();
            console.log("✓ Network history cleared");
            break;
          }
          default:
            console.error("Usage: cbrowser network [list|clear]");
        }
        break;
      }

      // =========================================================================
      // Visual Regression (Tier 2)
      // =========================================================================

      case "visual": {
        const subcommand = args[0];

        switch (subcommand) {
          case "save": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser visual save <name> [--url <url>]");
              process.exit(1);
            }
            if (options.url) {
              await browser.navigate(options.url as string);
            }
            const path = await browser.saveBaseline(name);
            console.log(`✓ Baseline saved: ${name}`);
            console.log(`  Path: ${path}`);
            break;
          }
          case "compare": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser visual compare <name> [--threshold <n>]");
              process.exit(1);
            }
            if (options.url) {
              await browser.navigate(options.url as string);
            }
            const threshold = options.threshold ? parseFloat(options.threshold as string) : 0.1;
            const result = await browser.compareBaseline(name, threshold);

            console.log("\n🔍 Visual Comparison:\n");
            console.log(`  Baseline: ${name}`);
            console.log(`  Difference: ${(result.diffPercentage * 100).toFixed(2)}%`);
            console.log(`  Threshold: ${(threshold * 100).toFixed(0)}%`);
            console.log(`  Result: ${result.passed ? "✓ PASSED" : "✗ FAILED"}`);
            if (result.diffPath) {
              console.log(`  Diff image: ${result.diffPath}`);
            }
            if (!result.passed) {
              process.exit(1);
            }
            break;
          }
          case "list": {
            const baselines = browser.listBaselines();
            if (baselines.length === 0) {
              console.log("No baselines saved");
            } else {
              console.log("\n📸 Visual Baselines:\n");
              for (const b of baselines) {
                console.log(`  - ${b}`);
              }
            }
            break;
          }
          case "delete": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser visual delete <name>");
              process.exit(1);
            }
            // Delete baseline file
            const fs = await import("fs");
            const path = await import("path");
            const baselinePath = path.join(browser.getDataDir(), "baselines", `${name}.png`);
            if (fs.existsSync(baselinePath)) {
              fs.unlinkSync(baselinePath);
              console.log(`✓ Baseline deleted: ${name}`);
            } else {
              console.error(`✗ Baseline not found: ${name}`);
              process.exit(1);
            }
            break;
          }
          default:
            console.error("Usage: cbrowser visual [save|compare|list|delete]");
        }
        break;
      }

      // =========================================================================
      // AI Visual Regression (v7.0.0)
      // =========================================================================

      case "ai-visual": {
        const subcommand = args[0];

        switch (subcommand) {
          case "capture": {
            const url = args[1];
            if (!url || !options.name) {
              console.error("Usage: cbrowser ai-visual capture <url> --name <name> [options]");
              console.error("  --selector <sel>    Capture specific element");
              console.error("  --device <device>   Device emulation");
              console.error("  --width <n>         Viewport width");
              console.error("  --height <n>        Viewport height");
              console.error("  --wait <ms|sel>     Wait before capture");
              process.exit(1);
            }

            console.log(`📸 Capturing visual baseline: ${options.name}`);
            console.log(`   URL: ${url}`);

            const baseline = await captureVisualBaseline(url, options.name as string, {
              selector: options.selector as string | undefined,
              device: options.device as string | undefined,
              viewport: options.width || options.height ? {
                width: parseInt(options.width as string) || 1920,
                height: parseInt(options.height as string) || 1080,
              } : undefined,
              waitFor: options.wait ? (
                /^\d+$/.test(options.wait as string)
                  ? parseInt(options.wait as string)
                  : options.wait as string
              ) : undefined,
            });

            console.log(`\n✅ Baseline captured successfully!`);
            console.log(`   ID: ${baseline.id}`);
            console.log(`   Viewport: ${baseline.viewport.width}x${baseline.viewport.height}`);
            console.log(`   Screenshot: ${baseline.screenshotPath}`);
            break;
          }

          case "test": {
            const url = args[1];
            const baselineName = args[2];

            if (!url || !baselineName) {
              console.error("Usage: cbrowser ai-visual test <url> <baseline-name> [options]");
              console.error("  --threshold <n>     Similarity threshold 0-1 (default: 0.9)");
              console.error("  --sensitivity <l>   low, medium, high (default: medium)");
              console.error("  --html              Generate HTML report");
              console.error("  --output <file>     Save JSON report");
              process.exit(1);
            }

            console.log(`\n🔍 Running AI visual regression test...`);
            console.log(`   URL: ${url}`);
            console.log(`   Baseline: ${baselineName}\n`);

            const result = await runVisualRegression(url, baselineName, {
              threshold: options.threshold ? parseFloat(options.threshold as string) : 0.9,
              sensitivity: (options.sensitivity as "low" | "medium" | "high") || "medium",
              generateDiff: true,
            });

            // Print report
            console.log(formatVisualRegressionReport(result));

            // Save JSON output if requested
            if (options.output && !options.html) {
              const fs = await import("fs");
              fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
              console.log(`\n📄 JSON report saved to: ${options.output}`);
            }

            // Generate HTML report if requested
            if (options.html) {
              const fs = await import("fs");
              const suiteResult: VisualTestSuiteResult = {
                suite: {
                  name: baselineName,
                  pages: [{ name: baselineName, url, baselineName }],
                },
                results: [result],
                summary: {
                  total: 1,
                  passed: result.passed ? 1 : 0,
                  failed: result.passed ? 0 : 1,
                  warnings: result.analysis.overallStatus === "warning" ? 1 : 0,
                },
                duration: result.duration,
                timestamp: new Date().toISOString(),
              };
              const htmlReport = generateVisualRegressionHtmlReport(suiteResult);
              const outputPath = (options.output as string) || `visual-regression-${baselineName}-${Date.now()}.html`;
              fs.writeFileSync(outputPath, htmlReport);
              console.log(`\n📄 HTML report saved to: ${outputPath}`);
            }

            if (!result.passed) {
              process.exit(1);
            }
            break;
          }

          case "suite": {
            const suiteFile = args[1];
            if (!suiteFile) {
              console.error("Usage: cbrowser ai-visual suite <file.json> [options]");
              console.error("  --threshold <n>     Global similarity threshold");
              console.error("  --html              Generate HTML report");
              console.error("  --output <file>     Save report to file");
              process.exit(1);
            }

            const fs = await import("fs");
            if (!fs.existsSync(suiteFile)) {
              console.error(`Suite file not found: ${suiteFile}`);
              process.exit(1);
            }

            const suite: VisualTestSuite = JSON.parse(fs.readFileSync(suiteFile, "utf-8"));
            console.log(`\n🔍 Running visual regression suite: ${suite.name}`);

            const result = await runVisualRegressionSuite(suite, {
              threshold: options.threshold ? parseFloat(options.threshold as string) : 0.9,
            });

            // Save outputs
            if (options.output && !options.html) {
              fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
              console.log(`📄 JSON report saved to: ${options.output}`);
            }

            if (options.html) {
              const htmlReport = generateVisualRegressionHtmlReport(result);
              const outputPath = (options.output as string) || `visual-suite-${Date.now()}.html`;
              fs.writeFileSync(outputPath, htmlReport);
              console.log(`📄 HTML report saved to: ${outputPath}`);
            }

            if (result.summary.failed > 0) {
              process.exit(1);
            }
            break;
          }

          case "list": {
            const baselines = listVisualBaselines();
            if (baselines.length === 0) {
              console.log("\nNo AI visual baselines saved.\n");
              console.log("Capture one with:");
              console.log("  cbrowser ai-visual capture <url> --name <name>\n");
            } else {
              console.log("\n📸 AI Visual Baselines:\n");
              console.log("┌──────────────────────┬─────────────────────────────────┬────────────────────┬──────────────┐");
              console.log("│ Name                 │ URL                             │ Viewport           │ Created      │");
              console.log("├──────────────────────┼─────────────────────────────────┼────────────────────┼──────────────┤");
              for (const b of baselines) {
                const name = b.name.substring(0, 20).padEnd(20);
                const url = b.url.substring(0, 31).padEnd(31);
                const viewport = `${b.viewport.width}x${b.viewport.height}`.padEnd(18);
                const created = new Date(b.timestamp).toLocaleDateString().padEnd(12);
                console.log(`│ ${name} │ ${url} │ ${viewport} │ ${created} │`);
              }
              console.log("└──────────────────────┴─────────────────────────────────┴────────────────────┴──────────────┘\n");
            }
            break;
          }

          case "show": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser ai-visual show <name>");
              process.exit(1);
            }

            const baseline = getVisualBaseline(name);
            if (!baseline) {
              console.error(`Baseline not found: ${name}`);
              process.exit(1);
            }

            console.log("\n📸 AI Visual Baseline Details:\n");
            console.log(`  Name:       ${baseline.name}`);
            console.log(`  ID:         ${baseline.id}`);
            console.log(`  URL:        ${baseline.url}`);
            console.log(`  Viewport:   ${baseline.viewport.width}x${baseline.viewport.height}`);
            if (baseline.device) {
              console.log(`  Device:     ${baseline.device}`);
            }
            if (baseline.selector) {
              console.log(`  Selector:   ${baseline.selector}`);
            }
            console.log(`  Created:    ${baseline.timestamp}`);
            console.log(`  Screenshot: ${baseline.screenshotPath}`);
            console.log("");
            break;
          }

          case "delete": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser ai-visual delete <name>");
              process.exit(1);
            }

            if (deleteVisualBaseline(name)) {
              console.log(`✅ Baseline deleted: ${name}`);
            } else {
              console.error(`Baseline not found: ${name}`);
              process.exit(1);
            }
            break;
          }

          default:
            console.error("Usage: cbrowser ai-visual [capture|test|suite|list|show|delete]");
            console.error("       cbrowser ai-visual capture <url> --name <name>");
            console.error("       cbrowser ai-visual test <url> <baseline>");
            console.error("       cbrowser ai-visual suite <file.json>");
            console.error("       cbrowser ai-visual list");
            console.error("       cbrowser ai-visual show <name>");
            console.error("       cbrowser ai-visual delete <name>");
        }
        break;
      }

      // =========================================================================
      // Cross-Browser Visual Testing (v7.3.0)
      // =========================================================================

      case "cross-browser": {
        const subcommand = args[0];

        if (subcommand === "suite") {
          // Cross-browser suite
          const suiteFile = args[1];
          if (!suiteFile) {
            console.error("Usage: cbrowser cross-browser suite <file.json> [options]");
            console.error("  --html              Generate HTML report");
            console.error("  --output <file>     Save report to file");
            process.exit(1);
          }

          const fs = await import("fs");
          if (!fs.existsSync(suiteFile)) {
            console.error(`Suite file not found: ${suiteFile}`);
            process.exit(1);
          }

          const suite: CrossBrowserSuite = JSON.parse(fs.readFileSync(suiteFile, "utf-8"));
          const result = await runCrossBrowserSuite(suite);

          // Save outputs
          if (options.output && !options.html) {
            fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
            console.log(`\n📄 JSON report saved to: ${options.output}`);
          }

          if (options.html) {
            const htmlReport = generateCrossBrowserHtmlReport(result);
            const outputPath = (options.output as string) || `cross-browser-${Date.now()}.html`;
            fs.writeFileSync(outputPath, htmlReport);
            console.log(`\n📄 HTML report saved to: ${outputPath}`);
          }

          // Summary
          console.log(`\n${"═".repeat(60)}`);
          console.log(`   Results: ${result.summary.consistent} consistent, ${result.summary.minorDifferences} minor, ${result.summary.majorDifferences} major`);
          console.log(`${"═".repeat(60)}\n`);

          if (result.summary.majorDifferences > 0) {
            process.exit(1);
          }
        } else {
          // Single URL test
          const url = subcommand; // First arg is the URL
          if (!url || url.startsWith("--")) {
            console.error("Usage: cbrowser cross-browser <url> [options]");
            console.error("       cbrowser cross-browser suite <file.json>");
            console.error("\nOptions:");
            console.error("  --browsers <list>   chromium,firefox,webkit (default: all)");
            console.error("  --width <n>         Viewport width (default: 1920)");
            console.error("  --height <n>        Viewport height (default: 1080)");
            console.error("  --wait <ms>         Wait before screenshot");
            console.error("  --wait-for <sel>    Wait for selector");
            console.error("  --sensitivity <l>   low, medium, high");
            console.error("  --html              Generate HTML report");
            console.error("  --output <file>     Save report");
            process.exit(1);
          }

          const browsers = options.browsers
            ? (options.browsers as string).split(",") as SupportedBrowser[]
            : undefined;

          const result = await runCrossBrowserTest(url, {
            browsers,
            viewport: options.width || options.height ? {
              width: parseInt(options.width as string) || 1920,
              height: parseInt(options.height as string) || 1080,
            } : undefined,
            waitBeforeCapture: options.wait ? parseInt(options.wait as string) : undefined,
            waitForSelector: options["wait-for"] as string | undefined,
            sensitivity: options.sensitivity as "low" | "medium" | "high" | undefined,
          });

          // Print report
          console.log("\n" + formatCrossBrowserReport(result));

          // Save outputs
          const fs = await import("fs");

          if (options.output && !options.html) {
            fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
            console.log(`\n📄 JSON report saved to: ${options.output}`);
          }

          if (options.html) {
            const suiteResult: CrossBrowserSuiteResult = {
              suite: { name: "Single URL Test", urls: [url] },
              results: [result],
              summary: {
                total: 1,
                consistent: result.overallStatus === "consistent" ? 1 : 0,
                minorDifferences: result.overallStatus === "minor_differences" ? 1 : 0,
                majorDifferences: result.overallStatus === "major_differences" ? 1 : 0,
              },
              duration: result.duration,
              timestamp: result.timestamp,
            };
            const htmlReport = generateCrossBrowserHtmlReport(suiteResult);
            const outputPath = (options.output as string) || `cross-browser-${Date.now()}.html`;
            fs.writeFileSync(outputPath, htmlReport);
            console.log(`\n📄 HTML report saved to: ${outputPath}`);
          }

          if (result.overallStatus === "major_differences") {
            process.exit(1);
          }
        }
        break;
      }

      // =========================================================================
      // Responsive Visual Testing (v7.3.0)
      // =========================================================================

      case "responsive": {
        const subcommand = args[0];

        if (subcommand === "viewports") {
          // List viewport presets
          const presets = listViewportPresets();
          console.log("\n📱 Available Viewport Presets\n");
          console.log("─".repeat(60));

          const byType: Record<string, ViewportPreset[]> = {
            mobile: [],
            tablet: [],
            desktop: [],
          };

          for (const preset of presets) {
            byType[preset.deviceType].push(preset);
          }

          for (const [type, typePresets] of Object.entries(byType)) {
            console.log(`\n${type.toUpperCase()}:`);
            for (const p of typePresets) {
              const touch = p.hasTouch ? " (touch)" : "";
              const device = p.deviceName ? ` - ${p.deviceName}` : "";
              console.log(`   ${p.name.padEnd(15)} ${p.width}x${p.height}${touch}${device}`);
            }
          }
          console.log("");
        } else if (subcommand === "suite") {
          // Responsive suite
          const suiteFile = args[1];
          if (!suiteFile) {
            console.error("Usage: cbrowser responsive suite <file.json> [options]");
            console.error("  --html              Generate HTML report");
            console.error("  --output <file>     Save report to file");
            process.exit(1);
          }

          const fs = await import("fs");
          if (!fs.existsSync(suiteFile)) {
            console.error(`Suite file not found: ${suiteFile}`);
            process.exit(1);
          }

          const suite: ResponsiveSuite = JSON.parse(fs.readFileSync(suiteFile, "utf-8"));
          const result = await runResponsiveSuite(suite);

          // Save outputs
          if (options.output && !options.html) {
            fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
            console.log(`\n📄 JSON report saved to: ${options.output}`);
          }

          if (options.html) {
            const htmlReport = generateResponsiveHtmlReport(result);
            const outputPath = (options.output as string) || `responsive-${Date.now()}.html`;
            fs.writeFileSync(outputPath, htmlReport);
            console.log(`\n📄 HTML report saved to: ${outputPath}`);
          }

          // Summary
          console.log(`\n${"═".repeat(60)}`);
          console.log(`   Results: ${result.summary.responsive} responsive, ${result.summary.minorIssues} minor, ${result.summary.majorIssues} major`);
          console.log(`   Total issues: ${result.summary.totalIssues}`);
          console.log(`${"═".repeat(60)}\n`);

          if (result.summary.majorIssues > 0) {
            process.exit(1);
          }
        } else {
          // Single URL test
          const url = subcommand; // First arg is the URL
          if (!url || url.startsWith("--")) {
            console.error("Usage: cbrowser responsive <url> [options]");
            console.error("       cbrowser responsive suite <file.json>");
            console.error("       cbrowser responsive viewports");
            console.error("\nOptions:");
            console.error("  --viewports <list>  mobile,tablet,desktop (default: mobile,tablet,desktop)");
            console.error("  --wait <ms>         Wait before screenshot");
            console.error("  --wait-for <sel>    Wait for selector");
            console.error("  --sensitivity <l>   low, medium, high");
            console.error("  --html              Generate HTML report");
            console.error("  --output <file>     Save report");
            console.error("\nViewport presets: mobile-sm, mobile, mobile-lg, mobile-xl,");
            console.error("                  tablet, tablet-lg, desktop-sm, desktop,");
            console.error("                  desktop-lg, desktop-xl");
            process.exit(1);
          }

          const viewports = options.viewports
            ? (options.viewports as string).split(",")
            : undefined;

          const result = await runResponsiveTest(url, {
            viewports,
            waitBeforeCapture: options.wait ? parseInt(options.wait as string) : undefined,
            waitForSelector: options["wait-for"] as string | undefined,
            sensitivity: options.sensitivity as "low" | "medium" | "high" | undefined,
          });

          // Print report
          console.log("\n" + formatResponsiveReport(result));

          // Save outputs
          const fs = await import("fs");

          if (options.output && !options.html) {
            fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
            console.log(`\n📄 JSON report saved to: ${options.output}`);
          }

          if (options.html) {
            const suiteResult: ResponsiveSuiteResult = {
              suite: { name: "Single URL Test", urls: [url] },
              results: [result],
              summary: {
                total: 1,
                responsive: result.overallStatus === "responsive" ? 1 : 0,
                minorIssues: result.overallStatus === "minor_issues" ? 1 : 0,
                majorIssues: result.overallStatus === "major_issues" ? 1 : 0,
                totalIssues: result.issues.length,
              },
              commonIssues: result.issues,
              duration: result.duration,
              timestamp: result.timestamp,
            };
            const htmlReport = generateResponsiveHtmlReport(suiteResult);
            const outputPath = (options.output as string) || `responsive-${Date.now()}.html`;
            fs.writeFileSync(outputPath, htmlReport);
            console.log(`\n📄 HTML report saved to: ${outputPath}`);
          }

          if (result.overallStatus === "major_issues") {
            process.exit(1);
          }
        }
        break;
      }

      // =========================================================================
      // A/B Visual Comparison (v7.3.0)
      // =========================================================================

      case "ab": {
        const subcommand = args[0];

        if (subcommand === "suite") {
          // A/B suite
          const suiteFile = args[1];
          if (!suiteFile) {
            console.error("Usage: cbrowser ab suite <file.json> [options]");
            console.error("  --html              Generate HTML report");
            console.error("  --output <file>     Save report to file");
            process.exit(1);
          }

          const fs = await import("fs");
          if (!fs.existsSync(suiteFile)) {
            console.error(`Suite file not found: ${suiteFile}`);
            process.exit(1);
          }

          const suite: ABSuite = JSON.parse(fs.readFileSync(suiteFile, "utf-8"));
          const result = await runABSuite(suite);

          // Save outputs
          if (options.output && !options.html) {
            fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
            console.log(`\n📄 JSON report saved to: ${options.output}`);
          }

          if (options.html) {
            const htmlReport = generateABHtmlReport(result);
            const outputPath = (options.output as string) || `ab-comparison-${Date.now()}.html`;
            fs.writeFileSync(outputPath, htmlReport);
            console.log(`\n📄 HTML report saved to: ${outputPath}`);
          }

          // Summary
          console.log(`\n${"═".repeat(60)}`);
          console.log(`   Results: ${result.summary.identical} identical, ${result.summary.similar} similar, ${result.summary.different} different, ${result.summary.veryDifferent} very different`);
          console.log(`${"═".repeat(60)}\n`);

          if (result.summary.veryDifferent > 0) {
            process.exit(1);
          }
        } else {
          // Single A/B comparison: ab <urlA> <urlB>
          const urlA = args[0];
          const urlB = args[1];

          if (!urlA || !urlB || urlA.startsWith("--") || urlB.startsWith("--")) {
            console.error("Usage: cbrowser ab <urlA> <urlB> [options]");
            console.error("       cbrowser ab suite <file.json>");
            console.error("\nOptions:");
            console.error("  --label-a <name>    Label for URL A (default: 'Version A')");
            console.error("  --label-b <name>    Label for URL B (default: 'Version B')");
            console.error("  --width <n>         Viewport width (default: 1920)");
            console.error("  --height <n>        Viewport height (default: 1080)");
            console.error("  --wait <ms>         Wait before screenshot");
            console.error("  --wait-for <sel>    Wait for selector");
            console.error("  --sensitivity <l>   low, medium, high");
            console.error("  --html              Generate HTML report");
            console.error("  --output <file>     Save report");
            process.exit(1);
          }

          const result = await runABComparison(urlA, urlB, {
            labels: options["label-a"] || options["label-b"] ? {
              a: (options["label-a"] as string) || "Version A",
              b: (options["label-b"] as string) || "Version B",
            } : undefined,
            viewport: options.width || options.height ? {
              width: parseInt(options.width as string) || 1920,
              height: parseInt(options.height as string) || 1080,
            } : undefined,
            waitBeforeCapture: options.wait ? parseInt(options.wait as string) : undefined,
            waitForSelector: options["wait-for"] as string | undefined,
            sensitivity: options.sensitivity as "low" | "medium" | "high" | undefined,
          });

          // Print report
          console.log("\n" + formatABReport(result));

          // Save outputs
          const fs = await import("fs");

          if (options.output && !options.html) {
            fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
            console.log(`\n📄 JSON report saved to: ${options.output}`);
          }

          if (options.html) {
            const suiteResult: ABSuiteResult = {
              suite: { name: "Single Comparison", pairs: [{ urlA, urlB }] },
              results: [result],
              summary: {
                total: 1,
                identical: result.overallStatus === "identical" ? 1 : 0,
                similar: result.overallStatus === "similar" ? 1 : 0,
                different: result.overallStatus === "different" ? 1 : 0,
                veryDifferent: result.overallStatus === "very_different" ? 1 : 0,
              },
              duration: result.duration,
              timestamp: result.timestamp,
            };
            const htmlReport = generateABHtmlReport(suiteResult);
            const outputPath = (options.output as string) || `ab-comparison-${Date.now()}.html`;
            fs.writeFileSync(outputPath, htmlReport);
            console.log(`\n📄 HTML report saved to: ${outputPath}`);
          }

          if (result.overallStatus === "very_different") {
            process.exit(1);
          }
        }
        break;
      }

      // =========================================================================
      // Accessibility (Tier 2)
      // =========================================================================

      case "a11y": {
        const subcommand = args[0];

        if (subcommand === "audit") {
          const url = args[1];
          if (url) {
            await browser.navigate(url);
          } else if (options.url) {
            await browser.navigate(options.url as string);
          }

          const result = await browser.auditAccessibility();

          console.log("\n♿ Accessibility Audit:\n");
          console.log(`  URL: ${result.url}`);
          console.log(`  Score: ${result.score}/100`);
          console.log(`  Passes: ${result.passes}`);
          console.log(`  Violations: ${result.violations.length}`);

          if (result.violations.length > 0) {
            console.log("\n  ⚠️  Violations:\n");
            for (const v of result.violations) {
              console.log(`    [${v.impact.toUpperCase()}] ${v.id}`);
              console.log(`      ${v.description}`);
              console.log(`      Help: ${v.helpUrl}`);
              console.log("");
            }
          }
        } else {
          console.error("Usage: cbrowser a11y audit [url]");
        }
        break;
      }

      // =========================================================================
      // Test Recording (Tier 2)
      // =========================================================================

      case "record": {
        const subcommand = args[0];

        switch (subcommand) {
          case "start": {
            const url = options.url as string;
            await browser.startRecording(url);
            console.log("✓ Recording started");
            if (url) {
              console.log(`  Navigated to: ${url}`);
            }
            console.log("  Interact with the page, then run 'cbrowser record stop'");
            break;
          }
          case "stop": {
            const actions = browser.stopRecording();
            console.log(`✓ Recording stopped`);
            console.log(`  Captured ${actions.length} actions`);
            if (actions.length > 0) {
              console.log("\n  Actions:");
              for (const action of actions) {
                console.log(`    ${action.type}: ${action.selector || action.url || action.value || ""}`);
              }
            }
            break;
          }
          case "save": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser record save <name>");
              process.exit(1);
            }
            const path = browser.saveRecording(name);
            console.log(`✓ Recording saved: ${name}`);
            console.log(`  Path: ${path}`);
            break;
          }
          case "list": {
            const fs = await import("fs");
            const path = await import("path");
            const recordingsDir = path.join(browser.getDataDir(), "recordings");
            if (!fs.existsSync(recordingsDir)) {
              console.log("No recordings saved");
            } else {
              const files = fs.readdirSync(recordingsDir).filter((f: string) => f.endsWith(".json"));
              if (files.length === 0) {
                console.log("No recordings saved");
              } else {
                console.log("\n🎬 Saved Recordings:\n");
                for (const f of files) {
                  console.log(`  - ${f.replace(".json", "")}`);
                }
              }
            }
            break;
          }
          case "generate": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser record generate <name>");
              process.exit(1);
            }
            const fs = await import("fs");
            const path = await import("path");
            const recordingPath = path.join(browser.getDataDir(), "recordings", `${name}.json`);
            if (!fs.existsSync(recordingPath)) {
              console.error(`Recording not found: ${name}`);
              process.exit(1);
            }
            const recording = JSON.parse(fs.readFileSync(recordingPath, "utf-8"));
            const code = browser.generateTestCode(name, recording.actions);
            console.log(code);
            break;
          }
          default:
            console.error("Usage: cbrowser record [start|stop|save|list|generate]");
        }
        break;
      }

      // =========================================================================
      // Test Export (Tier 2)
      // =========================================================================

      case "export": {
        const format = args[0];
        const name = args[1];
        const output = args[2];

        if (!format || !name) {
          console.error("Usage: cbrowser export [junit|tap] <name> [output]");
          process.exit(1);
        }

        // Load test results (for now, create a mock suite)
        const fs = await import("fs");
        const path = await import("path");
        const resultsPath = path.join(browser.getDataDir(), "results", `${name}.json`);

        let suite;
        if (fs.existsSync(resultsPath)) {
          suite = JSON.parse(fs.readFileSync(resultsPath, "utf-8"));
        } else {
          console.error(`Test results not found: ${name}`);
          console.error("Run tests first to generate results");
          process.exit(1);
        }

        if (format === "junit") {
          const exportPath = browser.exportJUnit(suite, output);
          console.log(`✓ JUnit XML exported: ${exportPath}`);
        } else if (format === "tap") {
          const exportPath = browser.exportTAP(suite, output);
          console.log(`✓ TAP exported: ${exportPath}`);
        } else {
          console.error("Unknown export format. Use 'junit' or 'tap'");
          process.exit(1);
        }
        break;
      }

      // =========================================================================
      // Webhooks (Tier 2)
      // =========================================================================

      case "webhook": {
        const subcommand = args[0];
        const fs = await import("fs");
        const path = await import("path");
        const webhooksPath = path.join(browser.getDataDir(), "webhooks.json");

        // Load existing webhooks
        let webhooks: Array<{ name: string; url: string; events: string[]; format: string }> = [];
        if (fs.existsSync(webhooksPath)) {
          webhooks = JSON.parse(fs.readFileSync(webhooksPath, "utf-8"));
        }

        switch (subcommand) {
          case "add": {
            const name = args[1];
            const url = args[2];
            if (!name || !url) {
              console.error("Usage: cbrowser webhook add <name> <url> [--events <events>] [--format <format>]");
              process.exit(1);
            }
            const events = options.events
              ? (options.events as string).split(",")
              : ["test.fail", "journey.complete"];
            const format = (options.format as string) || "generic";

            // Remove existing webhook with same name
            webhooks = webhooks.filter(w => w.name !== name);
            webhooks.push({ name, url, events, format });

            fs.writeFileSync(webhooksPath, JSON.stringify(webhooks, null, 2));
            console.log(`✓ Webhook added: ${name}`);
            console.log(`  URL: ${url}`);
            console.log(`  Events: ${events.join(", ")}`);
            console.log(`  Format: ${format}`);
            break;
          }
          case "list": {
            if (webhooks.length === 0) {
              console.log("No webhooks configured");
            } else {
              console.log("\n🔔 Configured Webhooks:\n");
              for (const w of webhooks) {
                console.log(`  ${w.name}`);
                console.log(`    URL: ${w.url}`);
                console.log(`    Events: ${w.events.join(", ")}`);
                console.log(`    Format: ${w.format}`);
                console.log("");
              }
            }
            break;
          }
          case "delete": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser webhook delete <name>");
              process.exit(1);
            }
            const originalLength = webhooks.length;
            webhooks = webhooks.filter(w => w.name !== name);
            if (webhooks.length < originalLength) {
              fs.writeFileSync(webhooksPath, JSON.stringify(webhooks, null, 2));
              console.log(`✓ Webhook deleted: ${name}`);
            } else {
              console.error(`✗ Webhook not found: ${name}`);
              process.exit(1);
            }
            break;
          }
          case "test": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser webhook test <name>");
              process.exit(1);
            }
            const webhook = webhooks.find(w => w.name === name);
            if (!webhook) {
              console.error(`✗ Webhook not found: ${name}`);
              process.exit(1);
            }

            // Send test notification
            const testPayload = webhook.format === "slack"
              ? { text: "🔔 CBrowser test notification" }
              : webhook.format === "discord"
              ? { content: "🔔 CBrowser test notification" }
              : { event: "test", message: "CBrowser test notification", timestamp: new Date().toISOString() };

            try {
              const response = await fetch(webhook.url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(testPayload),
              });
              if (response.ok) {
                console.log(`✓ Test notification sent to: ${name}`);
              } else {
                console.error(`✗ Webhook returned ${response.status}`);
                process.exit(1);
              }
            } catch (e: any) {
              console.error(`✗ Failed to send notification: ${e.message}`);
              process.exit(1);
            }
            break;
          }
          default:
            console.error("Usage: cbrowser webhook [add|list|delete|test]");
        }
        break;
      }

      // =========================================================================
      // Parallel Execution (Tier 2)
      // =========================================================================

      case "parallel": {
        const subcommand = args[0];

        switch (subcommand) {
          case "devices": {
            const url = args[1];
            if (!url) {
              console.error("Usage: cbrowser parallel devices <url> [--devices <list>] [--concurrency <n>]");
              process.exit(1);
            }

            const deviceList = options.devices
              ? (options.devices as string).split(",")
              : Object.keys(DEVICE_PRESETS);
            const concurrency = options.concurrency ? parseInt(options.concurrency as string) : 3;

            console.log(`\n🚀 Running parallel device tests...`);
            console.log(`   URL: ${url}`);
            console.log(`   Devices: ${deviceList.length}`);
            console.log(`   Concurrency: ${concurrency}\n`);

            const results = await CBrowser.parallelDevices(
              deviceList,
              async (b, device) => {
                const nav = await b.navigate(url);
                const screenshot = await b.screenshot();
                return { title: nav.title, loadTime: nav.loadTime, screenshot };
              },
              { maxConcurrency: concurrency }
            );

            console.log("📊 Results:\n");
            for (const r of results) {
              if (r.error) {
                console.log(`  ✗ ${r.device}: ${r.error} (${r.duration}ms)`);
              } else {
                console.log(`  ✓ ${r.device}: ${r.result?.title} - ${r.result?.loadTime}ms (${r.duration}ms total)`);
              }
            }

            const passed = results.filter(r => !r.error).length;
            console.log(`\n  Summary: ${passed}/${results.length} passed`);
            break;
          }

          case "urls": {
            const urls = args.slice(1);
            if (urls.length === 0) {
              console.error("Usage: cbrowser parallel urls <url1> <url2> ... [--concurrency <n>]");
              process.exit(1);
            }

            const concurrency = options.concurrency ? parseInt(options.concurrency as string) : 3;

            console.log(`\n🚀 Running parallel URL tests...`);
            console.log(`   URLs: ${urls.length}`);
            console.log(`   Concurrency: ${concurrency}\n`);

            const results = await CBrowser.parallelUrls(
              urls,
              async (b, url) => {
                const nav = await b.navigate(url);
                return { title: nav.title, loadTime: nav.loadTime };
              },
              { maxConcurrency: concurrency }
            );

            console.log("📊 Results:\n");
            for (const r of results) {
              if (r.error) {
                console.log(`  ✗ ${r.url}: ${r.error}`);
              } else {
                console.log(`  ✓ ${r.url}: ${r.result?.title} (${r.result?.loadTime}ms)`);
              }
            }
            break;
          }

          case "perf": {
            const urls = args.slice(1);
            if (urls.length === 0) {
              console.error("Usage: cbrowser parallel perf <url1> <url2> ... [--concurrency <n>]");
              process.exit(1);
            }

            const concurrency = options.concurrency ? parseInt(options.concurrency as string) : 3;

            console.log(`\n🚀 Running parallel performance audits...`);
            console.log(`   URLs: ${urls.length}`);
            console.log(`   Concurrency: ${concurrency}\n`);

            const results = await CBrowser.parallelUrls(
              urls,
              async (b, url) => {
                await b.navigate(url);
                return await b.getPerformanceMetrics();
              },
              { maxConcurrency: concurrency }
            );

            console.log("📊 Performance Results:\n");
            for (const r of results) {
              if (r.error) {
                console.log(`  ✗ ${r.url}: ${r.error}`);
              } else {
                const m = r.result;
                console.log(`  ✓ ${r.url}`);
                if (m?.lcp) console.log(`      LCP: ${m.lcp.toFixed(0)}ms (${m.lcpRating})`);
                if (m?.fcp) console.log(`      FCP: ${m.fcp.toFixed(0)}ms`);
                if (m?.cls !== undefined) console.log(`      CLS: ${m.cls.toFixed(3)}`);
              }
            }
            break;
          }

          default:
            console.error("Usage: cbrowser parallel [devices|urls|perf]");
        }
        break;
      }

      // =========================================================================
      // Natural Language (Tier 3)
      // =========================================================================

      case "run": {
        const nlCommand = args.join(" ");
        if (!nlCommand) {
          console.error("Usage: cbrowser run \"<natural language command>\"");
          console.error("Examples:");
          console.error("  cbrowser run \"go to https://example.com\"");
          console.error("  cbrowser run \"click the login button\"");
          console.error("  cbrowser run \"type 'hello' in the search box\"");
          process.exit(1);
        }

        console.log(`\n🗣️  Executing: "${nlCommand}"\n`);

        const result = await executeNaturalLanguage(browser, nlCommand);

        if (result.success) {
          console.log(`✓ Action: ${result.action}`);
          if (result.result && typeof result.result === "object") {
            const r = result.result as Record<string, unknown>;
            if (r.url) console.log(`  URL: ${r.url}`);
            if (r.title) console.log(`  Title: ${r.title}`);
            if (r.message) console.log(`  ${r.message}`);
            if (r.screenshot) console.log(`  Screenshot: ${r.screenshot}`);
          }
        } else {
          console.error(`✗ ${result.error}`);
          process.exit(1);
        }
        break;
      }

      case "script": {
        const scriptFile = args[0];
        if (!scriptFile) {
          console.error("Usage: cbrowser script <file>");
          process.exit(1);
        }

        const fs = await import("fs");
        if (!fs.existsSync(scriptFile)) {
          console.error(`Script file not found: ${scriptFile}`);
          process.exit(1);
        }

        const content = fs.readFileSync(scriptFile, "utf-8");
        const commands = content.split("\n").filter(line => line.trim() && !line.trim().startsWith("#"));

        console.log(`\n📜 Executing script: ${scriptFile}`);
        console.log(`   Commands: ${commands.length}\n`);

        const results = await executeNaturalLanguageScript(browser, commands);

        for (const r of results) {
          if (r.success) {
            console.log(`✓ ${r.command}`);
          } else {
            console.log(`✗ ${r.command}`);
            console.log(`  Error: ${r.error}`);
          }
        }

        const passed = results.filter(r => r.success).length;
        console.log(`\n  Summary: ${passed}/${results.length} commands succeeded`);

        if (passed < results.length) {
          process.exit(1);
        }
        break;
      }

      // =========================================================================
      // Visual AI (Tier 4)
      // =========================================================================

      case "ai": {
        const subcommand = args[0];
        const intent = args.slice(1).join(" ");

        if (!intent) {
          console.error("Usage: cbrowser ai [find|click] \"<intent>\"");
          console.error("Examples:");
          console.error("  cbrowser ai find \"the cheapest product\"");
          console.error("  cbrowser ai click \"login button\"");
          process.exit(1);
        }

        if (options.url) {
          await browser.navigate(options.url as string);
        }

        switch (subcommand) {
          case "find": {
            console.log(`\n🧠 Finding element: "${intent}"\n`);
            const result = await findElementByIntent(browser, intent);
            if (result) {
              console.log(`✓ Found element`);
              console.log(`  Selector: ${result.selector}`);
              console.log(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`);
              console.log(`  Description: ${result.description}`);
            } else {
              console.log(`✗ Could not find element matching: "${intent}"`);
              process.exit(1);
            }
            break;
          }
          case "click": {
            console.log(`\n🧠 Finding and clicking: "${intent}"\n`);
            const result = await findElementByIntent(browser, intent);
            if (result) {
              console.log(`✓ Found: ${result.description}`);
              await browser.click(result.selector);
              console.log(`✓ Clicked element`);
            } else {
              console.log(`✗ Could not find element matching: "${intent}"`);
              process.exit(1);
            }
            break;
          }
          default:
            console.error("Usage: cbrowser ai [find|click] \"<intent>\"");
        }
        break;
      }

      // =========================================================================
      // Bug Hunter (Tier 4)
      // =========================================================================

      case "hunt": {
        const url = args[0];
        if (!url) {
          console.error("Usage: cbrowser hunt <url> [--max-pages <n>] [--timeout <ms>]");
          process.exit(1);
        }

        const maxPages = options["max-pages"] ? parseInt(options["max-pages"] as string) : 10;
        const timeout = options.timeout ? parseInt(options.timeout as string) : 60000;

        console.log(`\n🔍 Bug Hunter starting...`);
        console.log(`   URL: ${url}`);
        console.log(`   Max pages: ${maxPages}`);
        console.log(`   Timeout: ${timeout}ms\n`);

        const result = await huntBugs(browser, url, { maxPages, timeout });

        console.log(`📊 Bug Hunt Results:\n`);
        console.log(`   Pages visited: ${result.pagesVisited}`);
        console.log(`   Duration: ${result.duration}ms`);
        console.log(`   Bugs found: ${result.bugs.length}\n`);

        if (result.bugs.length > 0) {
          const critical = result.bugs.filter(b => b.severity === "critical").length;
          const high = result.bugs.filter(b => b.severity === "high").length;
          const medium = result.bugs.filter(b => b.severity === "medium").length;

          console.log(`   Severity: ${critical} critical, ${high} high, ${medium} medium\n`);

          for (const bug of result.bugs) {
            const icon = bug.severity === "critical" ? "🔴" : bug.severity === "high" ? "🟠" : "🟡";
            console.log(`   ${icon} [${bug.type}] ${bug.description}`);
            if (bug.selector) console.log(`      Selector: ${bug.selector}`);
            if (bug.recommendation) console.log(`      💡 ${bug.recommendation}`);
          }
        } else {
          console.log(`   ✅ No bugs found!`);
        }
        break;
      }

      // =========================================================================
      // Cross-Browser Diff (Tier 4)
      // =========================================================================

      case "diff": {
        const url = args[0];
        if (!url) {
          console.error("Usage: cbrowser diff <url> [--browsers <list>]");
          process.exit(1);
        }

        const browserList = options.browsers
          ? (options.browsers as string).split(",") as Array<"chromium" | "firefox" | "webkit">
          : ["chromium", "firefox", "webkit"] as const;

        console.log(`\n🔀 Cross-Browser Diff`);
        console.log(`   URL: ${url}`);
        console.log(`   Browsers: ${browserList.join(", ")}\n`);

        const result = await crossBrowserDiff(url, [...browserList]);

        console.log(`📊 Results:\n`);
        console.log(`   Metrics:`);
        for (const [browser, metrics] of Object.entries(result.metrics)) {
          console.log(`     ${browser}: ${metrics.loadTime}ms, ${metrics.resourceCount} resources`);
        }

        if (result.differences.length > 0) {
          console.log(`\n   ⚠️  Differences found: ${result.differences.length}`);
          for (const diff of result.differences) {
            console.log(`     [${diff.type}] ${diff.description}`);
          }
        } else {
          console.log(`\n   ✅ No significant differences found`);
        }

        console.log(`\n   Screenshots:`);
        for (const [browser, path] of Object.entries(result.screenshots)) {
          console.log(`     ${browser}: ${path}`);
        }
        break;
      }

      // =========================================================================
      // Chaos Engineering (Tier 4)
      // =========================================================================

      case "chaos": {
        const url = args[0];
        if (!url) {
          console.error("Usage: cbrowser chaos <url> [--latency <ms>] [--offline] [--block <patterns>]");
          process.exit(1);
        }

        const chaosConfig: any = {};

        if (options.latency) {
          chaosConfig.networkLatency = parseInt(options.latency as string);
        }
        if (options.offline) {
          chaosConfig.offline = true;
        }
        if (options.block) {
          chaosConfig.blockUrls = (options.block as string).split(",");
        }
        if (options["fail-api"]) {
          const [pattern, status] = (options["fail-api"] as string).split(":");
          chaosConfig.failApis = [{ pattern, status: parseInt(status) }];
        }

        console.log(`\n💥 Chaos Engineering Test`);
        console.log(`   URL: ${url}`);
        console.log(`   Chaos config:`, chaosConfig);
        console.log("");

        const result = await runChaosTest(browser, url, chaosConfig);

        console.log(`📊 Results:\n`);
        console.log(`   Passed: ${result.passed ? "✅ Yes" : "❌ No"}`);
        console.log(`   Duration: ${result.duration}ms`);

        if (result.errors.length > 0) {
          console.log(`\n   Errors:`);
          for (const error of result.errors) {
            console.log(`     - ${error}`);
          }
        }

        if (result.screenshot) {
          console.log(`\n   Screenshot: ${result.screenshot}`);
        }

        if (!result.passed) {
          process.exit(1);
        }
        break;
      }

      case "reset": {
        await browser.reset();
        console.log("✓ Browser state reset (cookies, localStorage cleared)");
        break;
      }

      // =========================================================================
      // Natural Language Test Suites (Tier 6)
      // =========================================================================

      case "test-suite": {
        const filepath = args[0];
        const inlineTest = options.inline as string;

        if (!filepath && !inlineTest) {
          console.error("Usage: cbrowser test-suite <file.txt> [--continue-on-failure] [--output <report.json>]");
          console.error("       cbrowser test-suite --inline \"go to https://... ; click login ; verify ...\"");
          console.error("");
          console.error("Options:");
          console.error("  --continue-on-failure    Continue running after a test fails");
          console.error("  --screenshot-on-failure  Take screenshots on failure (default: true)");
          console.error("  --output <file>          Save JSON report to file");
          console.error("  --html                   Generate HTML report");
          console.error("  --timeout <ms>           Timeout per step (default: 30000)");
          console.error("  --dry-run                Parse and display test steps without executing");
          console.error("  --fuzzy-match            Case-insensitive fuzzy matching for assertions");
          console.error("  --step-through           Pause before each step for interactive execution");
          console.error("");
          console.error("Test File Format:");
          console.error("  # Test: Login Flow");
          console.error("  go to https://example.com");
          console.error("  click the login button");
          console.error("  type \"user@example.com\" in email field");
          console.error("  verify url contains \"/dashboard\"");
          process.exit(1);
        }

        let suite: { name: string; tests: NLTestCase[] };

        if (inlineTest) {
          // Parse inline test - semicolons separate steps
          const steps = inlineTest.split(";").map(s => s.trim()).filter(s => s);
          const testCase: NLTestCase = {
            name: "Inline Test",
            steps: steps.map(s => parseNLInstruction(s)),
          };
          suite = { name: "Inline Suite", tests: [testCase] };
        } else {
          // Load from file
          const fs = await import("fs");
          if (!fs.existsSync(filepath!)) {
            console.error(`Test file not found: ${filepath}`);
            process.exit(1);
          }
          const content = fs.readFileSync(filepath!, "utf-8");
          const suiteName = filepath!.split("/").pop()?.replace(/\.[^.]+$/, "") || "Test Suite";
          suite = parseNLTestSuite(content, suiteName);
        }

        console.log(`\n📝 Parsed ${suite.tests.length} test(s) from ${inlineTest ? "inline" : filepath}`);
        for (const test of suite.tests) {
          console.log(`   - ${test.name}: ${test.steps.length} steps`);
        }

        // Dry-run mode: parse and display without executing
        if (options["dry-run"]) {
          const dryResult = dryRunNLTestSuite(suite);
          console.log(`\n🔍 DRY RUN - Parsed steps (no execution):\n`);
          for (const test of dryResult.tests) {
            console.log(`  📋 ${test.name}`);
            for (let i = 0; i < test.steps.length; i++) {
              const step = test.steps[i];
              const parsed = `[${step.action}${step.target ? `: ${step.target}` : ""}${step.value ? ` = "${step.value}"` : ""}]`;
              console.log(`     ${i + 1}. ${step.instruction}  ${parsed}`);
            }
            console.log("");
          }
          break;
        }

        // Step-through mode: pause before each step
        if (options["step-through"]) {
          const readline = await import("readline");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY || false });
          const ask = (q: string): Promise<string> => new Promise((resolve, reject) => {
            rl.question(q, resolve);
            rl.once("close", () => reject(new Error("stdin closed")));
          });

          console.log(`\n🔍 Step-through mode enabled. Press Enter to execute each step.\n`);

          const { CBrowser } = await import("./browser.js");
          const stepBrowser = new CBrowser({ headless });
          await (stepBrowser as any).launch();

          try {
            let totalSteps = suite.tests.reduce((sum, t) => sum + t.steps.length, 0);
            let stepNum = 0;
            let stopped = false;

            for (const test of suite.tests) {
              if (stopped) break;
              console.log(`\n📋 Test: ${test.name}`);

              for (const step of test.steps) {
                stepNum++;
                const parsed = `[${step.action}${step.target ? `: ${step.target}` : ""}${step.value ? ` = "${step.value}"` : ""}]`;
                console.log(`\nStep ${stepNum}/${totalSteps}: ${step.instruction}`);
                console.log(`  → Parsed as: ${parsed}`);

                let input = "";
                try {
                  input = await ask("  Press [Enter] to execute, [s] to skip, [q] to quit: ");
                } catch {
                  console.log("\n⏹ Stopped (stdin closed).");
                  stopped = true;
                  break;
                }

                if (input.trim().toLowerCase() === "q") {
                  console.log("\n⏹ Stopped by user.");
                  stopped = true;
                  break;
                }
                if (input.trim().toLowerCase() === "s") {
                  console.log("  ⏭ Skipped");
                  continue;
                }

                const start = Date.now();
                try {
                  switch (step.action) {
                    case "navigate":
                      await stepBrowser.navigate(step.target || "");
                      break;
                    case "click":
                      await stepBrowser.smartClick(step.target || "");
                      break;
                    case "fill":
                      await stepBrowser.fill(step.target || "", step.value || "");
                      break;
                    case "assert":
                      const r = await stepBrowser.assert(step.instruction);
                      if (!r.passed) throw new Error(r.message);
                      break;
                    case "screenshot":
                      await stepBrowser.screenshot();
                      break;
                    case "wait":
                      if (step.value) await new Promise(r => setTimeout(r, parseFloat(step.value!) * 1000));
                      break;
                    default:
                      await stepBrowser.smartClick(step.target || step.instruction);
                  }
                  console.log(`  ✓ Completed (${Date.now() - start}ms)`);
                } catch (e: any) {
                  console.log(`  ✗ Failed: ${e.message} (${Date.now() - start}ms)`);
                }
              }
            }
          } finally {
            rl.close();
            await stepBrowser.close();
          }
          break;
        }

        const suiteOptions: NLTestSuiteOptions = {
          stepTimeout: options.timeout ? parseInt(options.timeout as string) : 30000,
          continueOnFailure: options["continue-on-failure"] === true,
          screenshotOnFailure: options["screenshot-on-failure"] !== false,
          headless,
          fuzzyMatch: options["fuzzy-match"] === true,
        };

        const result = await runNLTestSuite(suite, suiteOptions);

        // Print formatted report
        const report = formatNLTestReport(result);
        console.log(report);

        // Save JSON output if requested
        if (options.output) {
          const fs = await import("fs");
          fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
          console.log(`\n📄 JSON report saved: ${options.output}`);
        }

        // Generate HTML report if requested
        if (options.html) {
          const fs = await import("fs");
          const htmlReport = generateTestSuiteHtmlReport(result);
          const htmlPath = (options.output as string)?.replace(".json", ".html") || "test-report.html";
          fs.writeFileSync(htmlPath, htmlReport);
          console.log(`\n🌐 HTML report saved: ${htmlPath}`);
        }

        // Exit with error code if any tests failed
        if (result.summary.failed > 0) {
          process.exit(1);
        }
        break;
      }

      // =========================================================================
      // AI Test Repair (Tier 6 - v6.2.0)
      // =========================================================================

      case "repair-tests": {
        const filepath = args[0];

        if (!filepath) {
          console.error("Usage: cbrowser repair-tests <test-file.txt> [--auto-apply] [--verify] [--output <file>]");
          console.error("");
          console.error("Options:");
          console.error("  --auto-apply    Automatically apply the best repair suggestion");
          console.error("  --verify        Re-run repaired tests to verify they pass");
          console.error("  --output <file> Save repaired tests to a new file");
          console.error("  --json <file>   Save repair report as JSON");
          console.error("");
          console.error("Examples:");
          console.error("  cbrowser repair-tests broken-test.txt");
          console.error("  cbrowser repair-tests tests.txt --auto-apply --verify");
          console.error("  cbrowser repair-tests tests.txt --auto-apply --output fixed-tests.txt");
          process.exit(1);
        }

        const fs = await import("fs");
        if (!fs.existsSync(filepath)) {
          console.error(`Test file not found: ${filepath}`);
          process.exit(1);
        }

        const content = fs.readFileSync(filepath, "utf-8");
        const suiteName = filepath.split("/").pop()?.replace(/\.[^.]+$/, "") || "Test Suite";
        const suite = parseNLTestSuite(content, suiteName);

        console.log(`\n📝 Parsed ${suite.tests.length} test(s) from ${filepath}`);
        for (const test of suite.tests) {
          console.log(`   - ${test.name}: ${test.steps.length} steps`);
        }

        const repairOptions: RepairTestOptions = {
          headless,
          autoApply: options["auto-apply"] === true,
          verifyRepairs: options.verify === true,
          maxRetries: options.retries ? parseInt(options.retries as string) : 3,
        };

        const result = await repairTestSuite(suite, repairOptions);

        // Print formatted report
        const report = formatRepairReport(result);
        console.log(report);

        // Save JSON report if requested
        if (options.json) {
          fs.writeFileSync(options.json as string, JSON.stringify(result, null, 2));
          console.log(`\n📄 JSON report saved: ${options.json}`);
        }

        // Save repaired tests if requested
        if (options.output && repairOptions.autoApply) {
          const repairedContent: string[] = [];

          for (const testResult of result.testResults) {
            repairedContent.push(exportRepairedTest(testResult));
            repairedContent.push("");
          }

          fs.writeFileSync(options.output as string, repairedContent.join("\n"));
          console.log(`\n📝 Repaired tests saved: ${options.output}`);
        }

        // Exit with status based on whether repairs were needed
        if (result.summary.testsWithFailures > 0 && !repairOptions.autoApply) {
          console.log("\n💡 Run with --auto-apply to automatically fix issues");
          process.exit(1);
        }
        break;
      }

      // =========================================================================
      // Flaky Test Detection (Tier 6 - v6.3.0)
      // =========================================================================

      case "flaky-check": {
        const filepath = args[0];

        if (!filepath) {
          console.error("Usage: cbrowser flaky-check <test-file.txt> [--runs <n>] [--threshold <n>] [--output <file>]");
          console.error("");
          console.error("Options:");
          console.error("  --runs <n>        Number of times to run each test (default: 5)");
          console.error("  --threshold <n>   Flakiness threshold % to flag a test (default: 20)");
          console.error("  --delay <ms>      Delay between runs in ms (default: 500)");
          console.error("  --output <file>   Save JSON report to file");
          console.error("");
          console.error("Examples:");
          console.error("  cbrowser flaky-check tests.txt");
          console.error("  cbrowser flaky-check tests.txt --runs 10");
          console.error("  cbrowser flaky-check tests.txt --runs 5 --threshold 30 --output flaky-report.json");
          process.exit(1);
        }

        const fs = await import("fs");
        if (!fs.existsSync(filepath)) {
          console.error(`Test file not found: ${filepath}`);
          process.exit(1);
        }

        const content = fs.readFileSync(filepath, "utf-8");
        const suiteName = filepath.split("/").pop()?.replace(/\.[^.]+$/, "") || "Test Suite";
        const suite = parseNLTestSuite(content, suiteName);

        console.log(`\n📝 Parsed ${suite.tests.length} test(s) from ${filepath}`);
        for (const test of suite.tests) {
          console.log(`   - ${test.name}: ${test.steps.length} steps`);
        }

        const flakyOptions: FlakyTestOptions = {
          headless,
          runs: options.runs ? parseInt(options.runs as string) : 5,
          flakinessThreshold: options.threshold ? parseInt(options.threshold as string) : 20,
          delayBetweenRuns: options.delay ? parseInt(options.delay as string) : 500,
        };

        const result = await detectFlakyTests(suite, flakyOptions);

        // Print formatted report
        const report = formatFlakyTestReport(result);
        console.log(report);

        // Save JSON report if requested
        if (options.output) {
          fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
          console.log(`\n📄 JSON report saved: ${options.output}`);
        }

        // Exit with error code if flaky tests found
        if (result.summary.flakyTests > 0) {
          process.exit(1);
        }
        break;
      }

      // =========================================================================
      // Performance Regression Detection (Tier 6 - v6.4.0)
      // =========================================================================

      case "perf-baseline": {
        const subcommand = args[0];
        const fs = await import("fs");

        switch (subcommand) {
          case "save": {
            const url = args[1];
            if (!url) {
              console.error("Usage: cbrowser perf-baseline save <url> [--name <name>] [--runs <n>]");
              process.exit(1);
            }

            console.log(`\n📊 Capturing performance baseline for: ${url}`);

            const baselineOptions: PerformanceBaselineOptions = {
              headless,
              name: options.name as string | undefined,
              runs: options.runs ? parseInt(options.runs as string) : 3,
            };

            console.log(`   Running ${baselineOptions.runs} measurement(s)...`);

            const baseline = await capturePerformanceBaseline(url, baselineOptions);

            console.log(`\n✅ Baseline saved: ${baseline.name}`);
            console.log(`   ID: ${baseline.id}`);
            console.log(`   URL: ${baseline.url}`);
            console.log(`   Timestamp: ${new Date(baseline.timestamp).toLocaleString()}`);
            console.log(`\n📈 Metrics (averaged over ${baseline.runsAveraged} runs):`);
            if (baseline.metrics.lcp !== undefined) {
              console.log(`   LCP: ${baseline.metrics.lcp.toFixed(0)}ms (${baseline.metrics.lcpRating})`);
            }
            if (baseline.metrics.fcp !== undefined) {
              console.log(`   FCP: ${baseline.metrics.fcp.toFixed(0)}ms`);
            }
            if (baseline.metrics.cls !== undefined) {
              console.log(`   CLS: ${baseline.metrics.cls.toFixed(3)} (${baseline.metrics.clsRating})`);
            }
            if (baseline.metrics.ttfb !== undefined) {
              console.log(`   TTFB: ${baseline.metrics.ttfb.toFixed(0)}ms`);
            }
            if (baseline.metrics.tti !== undefined) {
              console.log(`   TTI: ${baseline.metrics.tti.toFixed(0)}ms`);
            }
            if (baseline.metrics.transferSize !== undefined) {
              console.log(`   Transfer: ${(baseline.metrics.transferSize / 1024).toFixed(1)}KB`);
            }
            break;
          }

          case "list": {
            const baselines = listPerformanceBaselines();

            if (baselines.length === 0) {
              console.log("\n📊 No performance baselines saved yet.");
              console.log("   Use: cbrowser perf-baseline save <url> --name <name>");
            } else {
              console.log(`\n📊 Performance Baselines (${baselines.length}):\n`);
              for (const b of baselines) {
                const date = new Date(b.timestamp).toLocaleDateString();
                const lcp = b.metrics.lcp ? `LCP: ${b.metrics.lcp.toFixed(0)}ms` : "";
                console.log(`   ${b.name}`);
                console.log(`     ID: ${b.id}`);
                console.log(`     URL: ${b.url}`);
                console.log(`     Date: ${date} | ${lcp}`);
                console.log("");
              }
            }
            break;
          }

          case "show": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser perf-baseline show <name|id>");
              process.exit(1);
            }

            const baseline = loadPerformanceBaseline(name);
            if (!baseline) {
              console.error(`Baseline not found: ${name}`);
              process.exit(1);
            }

            console.log(`\n📊 Performance Baseline: ${baseline.name}`);
            console.log(`   ID: ${baseline.id}`);
            console.log(`   URL: ${baseline.url}`);
            console.log(`   Timestamp: ${new Date(baseline.timestamp).toLocaleString()}`);
            console.log(`   Runs Averaged: ${baseline.runsAveraged}`);
            console.log(`\n📈 Metrics:`);
            console.log(JSON.stringify(baseline.metrics, null, 2));
            console.log(`\n🖥️  Environment:`);
            console.log(JSON.stringify(baseline.environment, null, 2));
            break;
          }

          case "delete": {
            const name = args[1];
            if (!name) {
              console.error("Usage: cbrowser perf-baseline delete <name|id>");
              process.exit(1);
            }

            const deleted = deletePerformanceBaseline(name);
            if (deleted) {
              console.log(`\n✅ Deleted baseline: ${name}`);
            } else {
              console.error(`Baseline not found: ${name}`);
              process.exit(1);
            }
            break;
          }

          default:
            console.error("Usage: cbrowser perf-baseline <save|list|show|delete>");
            console.error("");
            console.error("Subcommands:");
            console.error("  save <url>        Capture and save performance baseline");
            console.error("  list              List all saved baselines");
            console.error("  show <name>       Show baseline details");
            console.error("  delete <name>     Delete a baseline");
            process.exit(1);
        }
        break;
      }

      case "perf-regression": {
        const url = args[0];
        const baselineName = args[1];

        if (!url || !baselineName) {
          console.error("Usage: cbrowser perf-regression <url> <baseline-name> [options]");
          console.error("");
          console.error("Options:");
          console.error("  --sensitivity <level> strict|normal|lenient (default: normal)");
          console.error("  --threshold-lcp <n>   Max LCP increase % (default: 20)");
          console.error("  --threshold-cls <n>   Max CLS increase absolute (default: 0.1)");
          console.error("  --threshold-fcp <n>   Max FCP increase % (default: 20)");
          console.error("  --threshold-ttfb <n>  Max TTFB increase % (default: 30)");
          console.error("  --output <file>       Save JSON report to file");
          console.error("");
          console.error("Sensitivity profiles (both % AND absolute must be exceeded):");
          console.error("  strict:  FCP 10%/50ms, LCP 10%/100ms, TTFB 15%/30ms, CLS 10%/0.02");
          console.error("  normal:  FCP 20%/100ms, LCP 20%/200ms, TTFB 20%/50ms, CLS 20%/0.05");
          console.error("  lenient: FCP 30%/200ms, LCP 30%/400ms, TTFB 30%/100ms, CLS 30%/0.1");
          console.error("");
          console.error("Examples:");
          console.error("  cbrowser perf-regression https://example.com homepage");
          console.error("  cbrowser perf-regression https://example.com homepage --sensitivity strict");
          console.error("  cbrowser perf-regression https://example.com homepage --sensitivity lenient");
          console.error("  cbrowser perf-regression https://example.com homepage --threshold-lcp 30");
          process.exit(1);
        }

        const sensitivity = (options.sensitivity as string) || "normal";
        console.log(`\n🔍 Checking for performance regressions...`);
        console.log(`   URL: ${url}`);
        console.log(`   Baseline: ${baselineName}`);
        console.log(`   Sensitivity: ${sensitivity}`);

        const thresholds: PerformanceRegressionThresholds = {};
        if (options["threshold-lcp"]) thresholds.lcp = parseInt(options["threshold-lcp"] as string);
        if (options["threshold-cls"]) thresholds.cls = parseFloat(options["threshold-cls"] as string);
        if (options["threshold-fcp"]) thresholds.fcp = parseInt(options["threshold-fcp"] as string);
        if (options["threshold-ttfb"]) thresholds.ttfb = parseInt(options["threshold-ttfb"] as string);
        if (options["threshold-tti"]) thresholds.tti = parseInt(options["threshold-tti"] as string);
        if (options["threshold-tbt"]) thresholds.tbt = parseInt(options["threshold-tbt"] as string);

        const regressionOptions: PerformanceRegressionOptions = {
          headless,
          sensitivity: sensitivity as "strict" | "normal" | "lenient",
          thresholds: Object.keys(thresholds).length > 0 ? thresholds : undefined,
        };

        try {
          const result = await detectPerformanceRegression(url, baselineName, regressionOptions);

          // Print formatted report
          const report = formatPerformanceRegressionReport(result);
          console.log("\n" + report);

          // Save JSON report if requested
          const fs = await import("fs");
          if (options.output) {
            fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
            console.log(`\n📄 JSON report saved: ${options.output}`);
          }

          // Exit with error code if regressions found
          if (!result.passed) {
            process.exit(1);
          }
        } catch (error: any) {
          console.error(`\n❌ Error: ${error.message}`);
          process.exit(1);
        }
        break;
      }

      // =========================================================================
      // Test Coverage Map (Tier 6 - v6.5.0)
      // =========================================================================

      case "coverage": {
        const fs = await import("fs");
        const path = await import("path");
        const subcommand = args[0];

        // Simple glob function for test files
        function findTestFiles(pattern: string): string[] {
          const files: string[] = [];
          const parts = pattern.split("/");
          const dir = parts.slice(0, -1).join("/") || ".";
          const filePattern = parts[parts.length - 1];
          const regex = new RegExp("^" + filePattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");

          try {
            const dirFiles = fs.readdirSync(dir);
            for (const file of dirFiles) {
              if (regex.test(file)) {
                files.push(path.join(dir, file));
              }
            }
          } catch {
            // Directory doesn't exist
          }
          return files;
        }

        // Handle "coverage gaps" subcommand
        if (subcommand === "gaps") {
          const url = args[1];
          if (!url) {
            console.error("Usage: cbrowser coverage gaps <url> [--tests <glob>] [--sitemap <url>]");
            process.exit(1);
          }

          console.log(`\n🔍 Finding untested pages for: ${url}`);

          const testPattern = (options.tests as string) || "tests/*.txt";
          const testFiles = findTestFiles(testPattern);

          if (testFiles.length === 0) {
            console.error(`No test files found matching: ${testPattern}`);
            process.exit(1);
          }

          console.log(`   Analyzing ${testFiles.length} test file(s)...`);

          const coverageOptions: CoverageMapOptions = {
            sitemapUrl: options.sitemap as string | undefined,
            maxPages: 50, // Quick mode
            minCoverage: 50,
          };

          const result = await generateCoverageMap(url, testFiles, coverageOptions);

          // Show only gaps
          console.log(`\n🕳️  Coverage Gaps (${result.gaps.length} found):\n`);

          const priorityEmoji: Record<string, string> = { critical: "🚨", high: "🔴", medium: "🟡", low: "🟢" };

          for (const gap of result.gaps) {
            const emoji = priorityEmoji[gap.priority];
            console.log(`  ${emoji} ${gap.page.path}`);
            console.log(`     Priority: ${gap.priority} | Reason: ${gap.reason}`);
          }

          console.log(`\n📊 Coverage: ${result.analysis.coveragePercent}% (${result.analysis.testedPages}/${result.analysis.totalPages} pages)`);
          break;
        }

        // Main coverage command
        const url = subcommand;
        if (!url || url.startsWith("-")) {
          console.error("Usage: cbrowser coverage <url> [--tests <glob>] [--sitemap <url>] [--html] [--output <file>]");
          process.exit(1);
        }

        console.log(`\n📊 Generating test coverage map for: ${url}`);

        const testPattern = (options.tests as string) || "tests/*.txt";
        const testFiles = findTestFiles(testPattern);

        if (testFiles.length === 0) {
          console.error(`No test files found matching: ${testPattern}`);
          console.error("Use --tests <glob> to specify test files");
          process.exit(1);
        }

        console.log(`   Found ${testFiles.length} test file(s)`);
        for (const f of testFiles.slice(0, 5)) {
          console.log(`     - ${f}`);
        }
        if (testFiles.length > 5) {
          console.log(`     ... and ${testFiles.length - 5} more`);
        }

        const coverageOptions: CoverageMapOptions = {
          sitemapUrl: options.sitemap as string | undefined,
          maxPages: options["max-pages"] ? parseInt(options["max-pages"] as string) : 100,
          includePattern: options.include as string | undefined,
          excludePattern: options.exclude as string | undefined,
          minCoverage: options["min-coverage"] ? parseInt(options["min-coverage"] as string) : 50,
        };

        if (coverageOptions.sitemapUrl) {
          console.log(`   Using sitemap: ${coverageOptions.sitemapUrl}`);
        } else {
          console.log(`   Crawling site (max ${coverageOptions.maxPages} pages)...`);
        }

        const result = await generateCoverageMap(url, testFiles, coverageOptions);

        // Output format
        if (options.html) {
          const htmlReport = generateCoverageHtmlReport(result);
          const outputPath = (options.output as string) || "coverage-report.html";
          fs.writeFileSync(outputPath, htmlReport);
          console.log(`\n✅ HTML report saved: ${outputPath}`);
        } else if (options.output && (options.output as string).endsWith(".json")) {
          fs.writeFileSync(options.output as string, JSON.stringify(result, null, 2));
          console.log(`\n✅ JSON report saved: ${options.output}`);
        } else {
          // Print text report
          const report = formatCoverageReport(result);
          console.log(report);

          if (options.output) {
            fs.writeFileSync(options.output as string, report);
            console.log(`\n📄 Report saved: ${options.output}`);
          }
        }

        // Exit with error if coverage too low
        if (result.analysis.coveragePercent < (coverageOptions.minCoverage || 50)) {
          console.log(`\n⚠️  Coverage (${result.analysis.coveragePercent}%) is below threshold (${coverageOptions.minCoverage}%)`);
          process.exit(1);
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.error("Run 'cbrowser help' for usage");
        process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
