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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to help build these features.
