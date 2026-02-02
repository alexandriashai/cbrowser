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
| v5.0.0 | 2026-02-02 | Smart retry, natural language assertions, self-healing selectors |
| v6.0.0 | 2026-02-02 | Multi-persona comparison, natural language test suites |
| v6.5.0 | 2026-02-02 | AI test repair, flaky detection, perf regression, coverage mapping |
| v7.0.0 | 2026-02-02 | AI visual regression with semantic comparison |
| v7.3.0 | 2026-02-02 | Cross-browser, responsive, A/B visual testing |
| v7.4.6 | 2026-02-02 | Auth0 OAuth for claude.ai, modular architecture, 31 MCP tools |

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

## Tier 3: Ambitious (v3.0.0)

| Feature | Status | Description |
|---------|--------|-------------|
| Fluent API | ✅ Complete | `browser.goto(url).click(x).fill(y)` |
| Natural Language API | ✅ Complete | "Go to cart and checkout" |
| AI Test Generation | ⬜ Planned | Analyze page → generate test scenarios |
| Self-Healing Selectors | ⬜ Planned | AI finds alternatives when broken |
| Session Replay Import | ⬜ Planned | Import FullStory/Hotjar recordings |
| Plugin System | ⬜ Planned | Extensible architecture |

---

## Tier 4: Moonshots ✅ (v4.0.0)

| Feature | Status | Description |
|---------|--------|-------------|
| Visual AI Understanding | ✅ Complete | "Click the cheapest product" |
| Autonomous Bug Hunter | ✅ Complete | Explore and find bugs automatically |
| Cross-Browser Diff | ✅ Complete | Compare behavior across browsers |
| Chaos Engineering | ✅ Complete | Inject failures, test resilience |
| Distributed Grid | ⬜ Future | Run across multiple machines |

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

## Tier 7: Visual Testing Suite ✅ (v7.0.0 - v7.4.6)

| Feature | Status | Description |
|---------|--------|-------------|
| AI Visual Regression | ✅ Complete | Semantic screenshot comparison using AI (not pixel-diff) |
| Cross-Browser Visual Testing | ✅ Complete | Compare rendering across Chrome, Firefox, Safari |
| Responsive Visual Testing | ✅ Complete | Compare mobile, tablet, desktop viewports |
| A/B Visual Comparison | ✅ Complete | Compare two URLs (staging vs production) |
| Modular Architecture | ✅ Complete | Tree-shakeable imports (`cbrowser/visual`, `/testing`, `/analysis`, `/performance`) |
| 31 MCP Tools | ✅ Complete | Full MCP server for Claude Desktop with all capabilities |
| Remote MCP Server | ✅ Complete | HTTP endpoint for claude.ai custom connectors |
| Auth0 OAuth | ✅ Complete | OAuth 2.1 authentication for claude.ai integration |
| Dual Authentication | ✅ Complete | OAuth + API keys simultaneously |
| Token Caching | ✅ Complete | 30-minute cache to avoid rate limits |

---

## Tier 8: Enterprise & Monitoring (Future)

| Feature | Status | Description |
|---------|--------|-------------|
| Distributed Testing Grid | ⬜ Planned | Run tests across multiple machines in parallel |
| Real-Time Monitoring | ⬜ Planned | Continuous uptime monitoring with alerts |
| AI Anomaly Detection | ⬜ Planned | Detect visual/behavioral anomalies automatically |
| Multi-Environment Orchestration | ⬜ Planned | Coordinate tests across dev, staging, production |
| Advanced Reporting Dashboard | ⬜ Planned | Web UI for test results, trends, analytics |
| Team Collaboration | ⬜ Planned | Shared baselines, comments, approval workflows |
| CI/CD Native Integration | ⬜ Planned | GitHub Actions, GitLab CI, Jenkins plugins |
| Session Replay Import | ⬜ Planned | Import FullStory/Hotjar recordings as test cases |
| Plugin System | ⬜ Planned | Extensible architecture for custom tools |
| SaaS Platform | ⬜ Planned | Hosted CBrowser with managed infrastructure |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to help build these features.
