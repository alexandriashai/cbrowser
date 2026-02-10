# CBrowser Roadmap

## Vision
Transform CBrowser from a browser automation tool into a complete testing and monitoring platform with AI-powered capabilities.

---

## Version History

| Version | Release | Highlights |
|---------|---------|------------|
| v2.2.0 | 2026-02-02 | Initial public release |
| v2.3.0 | 2026-02-02 | Multi-browser support |
| v2.4.0 | 2026-02-02 | Quick wins (video, mobile, perf) |
| v2.5.0 | 2026-02-02 | Visual regression, test recorder, a11y, webhooks |
| v3.0.0 | 2026-02-02 | Fluent API, natural language commands |
| v4.0.0 | 2026-02-02 | Visual AI, bug hunter, cross-browser diff, chaos engineering |
| v5.0.0 | 2026-02-02 | Smart retry, NL assertions, self-healing selectors, MCP server |
| v6.0.0 | 2026-02-02 | Multi-persona comparison, natural language test suites |
| v6.5.0 | 2026-02-02 | AI test repair, flaky detection, perf regression, coverage mapping |
| v7.0.0 | 2026-02-02 | AI visual regression with semantic comparison |
| v7.3.0 | 2026-02-02 | Cross-browser, responsive, A/B visual testing |
| v7.4.6 | 2026-02-02 | Auth0 OAuth for claude.ai, modular architecture, MCP server |
| v7.4.10-19 | 2026-02-03 | Session management, overlay dismissal, verbose debugging, NL test enhancements, a11y-first selectors, perf sensitivity profiles, example recipes |
| v8.0.0 | 2026-02-03 | 9 bug fixes from stress testing: byte-level A/B comparison, CLI arg routing, self-healing cache validation, responsive test scoring |
| v9.0.0 | 2026-02-04 | UX Analysis Suite: Agent-Ready Audit, Competitive Benchmark, Accessibility Empathy Mode |
| v10.0.0-10.2.0 | 2026-02-05 | Cognitive science foundations: Dual-Process Theory, GOMS timing, F-Pattern degradation, Prospect Theory |
| v11.0.0-11.10.6 | 2026-02-07 | 12 cognitive traits (selfEfficacy, satisficing, trustCalibration, interruptRecovery), ARIA-first selectors, browser crash recovery, enhanced confidence gating |
| v12.0.0 | 2026-02-08 | **Grade A milestone release.** License update with Additional Use Grant, copyright headers, empathy audit dedup fix, goalAchieved calibration. 17 issues tracked, 17 fixed. |

---

## Tier 1: Quick Wins ✅ (v2.4.0)

| Feature | Status | Description |
|---------|--------|-------------|
| Video Recording | ✅ Complete | Record sessions as WebM via Playwright |
| Network Interception | ✅ Complete | Mock API responses, test error states |
| HAR Export | ✅ Complete | Export network requests as HAR files |
| Mobile Emulation | ✅ Complete | Device presets (iPhone 15, Pixel 8, iPad, etc.) |
| Geolocation Spoofing | ✅ Complete | Location presets + custom coordinates |
| Cookie Editor | ✅ Complete | CLI commands to list/set/delete/clear cookies |
| Performance Metrics | ✅ Complete | Core Web Vitals (LCP, CLS, FCP, TTFB) + budget audits |
| Config File | ✅ Complete | .cbrowserrc.json + environment variables |

---

## Tier 2: Medium Effort ✅ (v2.5.0)

| Feature | Status | Description |
|---------|--------|-------------|
| Visual Regression | ✅ Complete | Screenshot diff with size comparison |
| Accessibility Audit | ✅ Complete | WCAG violations per page |
| Parallel Execution | ✅ Complete | Run multiple browsers simultaneously |
| Test Recorder | ✅ Complete | Record interactions → generate code |
| Webhook Notifications | ✅ Complete | Slack/Discord/generic alerts |
| JUnit/TAP Output | ✅ Complete | CI-friendly result formats |

---

## Tier 3: Ambitious ✅ (v3.0.0)

| Feature | Status | Description |
|---------|--------|-------------|
| Fluent API | ✅ Complete | `browser.goto(url).click(x).fill(y)` |
| Natural Language API | ✅ Complete | "Go to cart and checkout" |
| AI Test Generation | ✅ Complete | Analyze page → generate test scenarios (shipped in v5.0.0) |
| Self-Healing Selectors | ✅ Complete | AI finds alternatives when broken (shipped in v5.0.0) |

---

## Tier 4: Moonshots ✅ (v4.0.0)

| Feature | Status | Description |
|---------|--------|-------------|
| Visual AI Understanding | ✅ Complete | "Click the cheapest product" |
| Autonomous Bug Hunter | ✅ Complete | Explore and find bugs automatically |
| Cross-Browser Diff | ✅ Complete | Compare behavior across browsers |
| Chaos Engineering | ✅ Complete | Inject failures, test resilience |

---

## Tier 5: Smart Automation ✅ (v5.0.0)

| Feature | Status | Description |
|---------|--------|-------------|
| Smart Retry | ✅ Complete | Auto-retry with alternative selectors on failure |
| Natural Language Assertions | ✅ Complete | `assert "page contains 'Welcome'"` |
| AI Failure Analysis | ✅ Complete | Suggestions when elements not found |
| Self-Healing Selectors | ✅ Complete | Cache working alternatives for future use |
| AI Test Generation | ✅ Complete | Analyze page → generate test scenarios |
| MCP Server Mode | ✅ Complete | Run as MCP server for Claude integration |

---

## Tier 6: AI Testing Platform ✅ (v6.0.0 - v6.5.0)

| Feature | Status | Description |
|---------|--------|-------------|
| Multi-Persona Comparison | ✅ Complete | Compare UX across power-user, first-timer, mobile, elderly personas |
| Natural Language Test Suites | ✅ Complete | Write tests in plain English, execute via `npx cbrowser test-suite` |
| AI Test Repair | ✅ Complete | Automatically fix broken tests with AI suggestions |
| Flaky Test Detection | ✅ Complete | Identify unreliable tests with configurable runs/threshold |
| Performance Regression Detection | ✅ Complete | Compare Core Web Vitals against baselines |
| Test Coverage Mapping | ✅ Complete | Find untested pages, generate coverage gaps reports |

---

## Tier 7: Visual Testing Suite ✅ (v7.0.0 - v7.4.19)

| Feature | Status | Description |
|---------|--------|-------------|
| AI Visual Regression | ✅ Complete | Semantic screenshot comparison using AI |
| Cross-Browser Visual Testing | ✅ Complete | Compare rendering across Chrome, Firefox, Safari |
| Responsive Visual Testing | ✅ Complete | Compare mobile, tablet, desktop viewports |
| A/B Visual Comparison | ✅ Complete | Compare two URLs (staging vs production) |
| Modular Architecture | ✅ Complete | Tree-shakeable imports (`cbrowser/visual`, `/testing`, `/analysis`, `/performance`) |
| 68 MCP Tools | ✅ Complete | Full MCP server for Claude Desktop with all capabilities |
| Remote MCP Server | ✅ Complete | HTTP endpoint for claude.ai custom connectors |
| Auth0 OAuth | ✅ Complete | OAuth 2.1 authentication for claude.ai integration |
| Rich Session Management | ✅ Complete | Save/load/export/import sessions with metadata, cleanup, cross-domain warnings |
| Overlay Dismissal | ✅ Complete | Auto-dismiss cookie consent, age verification, newsletter popups |
| Verbose Debugging | ✅ Complete | Debug screenshots, AI suggestions, available elements on failure |
| Accessibility-First Selectors | ✅ Complete | ARIA-first strategy with accessibility scoring |
| Performance Sensitivity Profiles | ✅ Complete | Strict/normal/lenient thresholds for regression detection |
| Example Recipes | ✅ Complete | 13 examples: workflows, CI/CD templates, NL tests, personas |

---

## Tier 7.5: Stability ✅ (v8.0.0)

| Feature | Status | Description |
|---------|--------|-------------|
| CLI Arg Routing Fixes | ✅ Complete | `extract` and `screenshot` accept positional URLs correctly |
| Byte-Level A/B Comparison | ✅ Complete | Replaced file-size heuristic with PNG buffer diff |
| Self-Healing Cache Validation | ✅ Complete | Reject empty/invalid selectors from cache |
| Session Save Error Handling | ✅ Complete | Graceful SecurityError handling on restricted pages |
| Responsive Test Scoring | ✅ Complete | Expected viewport differences no longer flagged as failures |
| Fill Failure Hints | ✅ Complete | Always show available inputs on fill failure |
| Search Detection | ✅ Complete | Detect `role="search"`, placeholder, and aria-label patterns |
| CLI Command Aliases | ✅ Complete | `hunt-bugs`, `chaos-test`, `generate-tests`, `repair`, `flaky` |

---

## Tier 8: Integration & Monitoring (Next)

| Priority | Feature | Status | Description |
|----------|---------|--------|-------------|
| 1 | CI/CD Native Integration | ⬜ Planned | GitHub Action + GitLab CI component for zero-config pipeline integration |
| 2 | Real-Time Monitoring | ⬜ Planned | `cbrowser monitor` command with scheduled checks and alert webhooks |
| 3 | AI Anomaly Detection | ⬜ Planned | Automated visual + performance drift detection against baselines |
| 4 | Multi-Environment Orchestration | ⬜ Planned | Coordinate tests across dev, staging, production environments |
| 5 | Plugin System | ⬜ Planned | Extensible architecture for community-built tools and reporters |
| 6 | Session Replay Import | ⬜ Planned | Import FullStory/Hotjar/LogRocket recordings as test cases |
| 7 | Reporting Dashboard | ⬜ Planned | Web UI for test results, trends, and historical analytics |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to help build these features.
