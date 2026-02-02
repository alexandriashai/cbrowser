# CBrowser Roadmap

## Vision
Transform CBrowser from a browser automation tool into a complete testing and monitoring platform with AI-powered capabilities.

---

## Version History

| Version | Release | Highlights |
|---------|---------|------------|
| v2.2.0 | 2026-02-02 | Initial public release |
| v2.3.0 | 2026-02-02 | Multi-browser support |
| v2.4.0 | TBD | Quick wins (video, mobile, perf) |
| v2.5.0 | TBD | Visual regression, test recorder |
| v3.0.0 | TBD | AI test generation, plugin system |

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

## Tier 2: Medium Effort (v2.5.0)

| Feature | Status | Description |
|---------|--------|-------------|
| Visual Regression | ⬜ Planned | Screenshot diff with perceptual hashing |
| Accessibility Audit | ⬜ Planned | WCAG violations per page |
| Parallel Execution | ⬜ Planned | Run multiple browsers simultaneously |
| Test Recorder | ⬜ Planned | Record interactions → generate code |
| Webhook Notifications | ⬜ Planned | Slack/Discord alerts |
| JUnit/TAP Output | ⬜ Planned | CI-friendly result formats |

---

## Tier 3: Ambitious (v3.0.0)

| Feature | Status | Description |
|---------|--------|-------------|
| AI Test Generation | ⬜ Planned | Analyze page → generate test scenarios |
| Self-Healing Selectors | ⬜ Planned | AI finds alternatives when broken |
| Session Replay Import | ⬜ Planned | Import FullStory/Hotjar recordings |
| Plugin System | ⬜ Planned | Extensible architecture |
| Fluent API | ⬜ Planned | `browser.goto(url).click(x).fill(y)` |
| Natural Language API | ⬜ Planned | "Go to cart and checkout" |

---

## Tier 4: Moonshots (v4.0.0+)

| Feature | Status | Description |
|---------|--------|-------------|
| Visual AI Understanding | ⬜ Future | "Click the cheapest product" |
| Autonomous Bug Hunter | ⬜ Future | Explore and find bugs automatically |
| Cross-Browser Diff | ⬜ Future | Compare behavior across browsers |
| Chaos Engineering | ⬜ Future | Inject failures, test resilience |
| Distributed Grid | ⬜ Future | Run across multiple machines |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to help build these features.
