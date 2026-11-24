# Audit Workflow

One-shot audits of a page or site. None of them needs an Anthropic API key or makes a model call: they load the page in a browser, detect patterns, and score what they find. All scores are heuristic estimates from pattern detection, useful for comparing pages and tracking change, not a substitute for testing with real users or assistive technology.

For goal-directed persona runs, see [Journey.md](./Journey.md). For functional, visual and performance tests, see [Test.md](./Test.md).

---

## Trigger

- "audit", "how agent-friendly is", "AI readiness", "can an agent use this site"
- "accessibility", "WCAG", "disability barriers", "empathy audit"
- "find bugs", "what is broken on this page", "does it survive a slow network"
- "cognitive load", "how hard is this page", "llms.txt", "structured data", "is this MCP server safe"

---

## Choose

| Question | CLI | MCP tool |
|---|---|---|
| Can an AI agent find, read and operate this page? | `cbrowser agent-ready-audit <url>` | `agent_ready_audit` |
| Which of these sites is most agent-friendly? | `cbrowser ai-benchmark --urls <a,b,...>` | `ai_benchmark` |
| What would block people with specific disabilities? | `cbrowser empathy-audit <url> --personas <list>` | `empathy_audit` (one persona per call) |
| Quick accessibility smoke check | `cbrowser a11y audit <url>` | none; use `empathy_audit` |
| What is visibly broken? | `cbrowser hunt-bugs <url>` | `hunt_bugs` |
| Does it survive latency, offline, blocked or failing APIs? | `cbrowser chaos <url> --latency 3000` | `chaos_test` |
| Is this MCP server ready for browser agents? | `cbrowser webmcp-ready <mcp-url>` | `webmcp_ready_audit` |
| How much effort does the page cost a given persona? | none | `cognitive_effort` |
| Full site check: blocked? agent-ready? effort per persona? | none | `site_cognitive_assessment` |
| Give me code fixes for the agent-ready findings | none | `remediation_patches` |
| Write or check llms.txt | none | `llms_txt_generate`, `llms_txt_validate`, `llms_txt_diff` |
| Suggest Schema.org JSON-LD | none | `structured_data_suggest` |
| Do these MCP tool descriptions hide prompt injection? | none | `security_audit` |

A good default order for a new site: `agent-ready-audit` (is the page even readable), then `empathy-audit` or `cognitive_effort` for the people side, then `hunt-bugs` for concrete defects.

---

## agent-ready-audit

```bash
cbrowser agent-ready-audit https://example.com
cbrowser agent-ready-audit https://example.com --device iphone-16 --html --output agent-ready.json
```

Four categories, each starting at 100 with a deduction per issue by severity, then weighted into one score: Findability 35%, Stability 30%, Agent perceivability 20%, Semantics 15%.

| Grade | Overall score |
|---|---|
| A | 90 and above |
| B | 80 to 89 |
| C | 70 to 79 |
| D | 60 to 69 |
| F | below 60 |

A and B: agents work well. C: agents need workarounds. D and F: real barriers to automation. The command exits 1 on an F.

If the page shows zero interactive elements, the audit refuses to grade and says so. That almost always means the auditor was blocked (bot challenge, consent wall, login), and an empty page would otherwise score as perfect. Try an interior URL, `--geo-region <region>` if a regional proxy is configured, or `--lightpanda`.

Over MCP, `agent_ready_audit` returns the 5 worst issues and recommendations by default; the totals always cover every finding, and `limit` and `offset` page through the rest. `remediation_patches` re-runs the audit and returns before/after code snippets sorted by impact.

`ai-benchmark` runs the same audit on two or more URLs (`--concurrency`, default 3) and ranks them:

```bash
cbrowser ai-benchmark --urls "https://site-a.com,https://site-b.com" --html --output bench.json
```

---

## empathy-audit

```bash
cbrowser empathy-audit https://example.com --personas cognitive-adhd,motor-impairment-tremor
cbrowser empathy-audit https://example.com --scope full_page --wcag-level AA --html --output empathy.json
```

Without `--goal` it is keyless: it checks the page for barriers each persona is sensitive to (touch targets, contrast, motion, reading load and more) and scores them. With `--goal` it also runs a cognitive journey per persona, which needs a key and costs tokens. Without `--personas` the CLI runs all 11 accessibility personas: `motor-impairment-tremor`, `low-vision-magnified`, `cognitive-adhd`, `dyslexic-user`, `deaf-user`, `elderly-low-vision`, `color-blind-deuteranopia`, `autism-spectrum`, `intellectual-disability`, `aphasia-receptive`, `dyscalculia`.

Each persona gets a score out of 100: barrier deductions weighted by that persona's susceptibility (a tremor weighs small touch targets more, low vision weighs contrast more), friction deductions, and 15 points off when there is a blocking barrier. The overall score is the mean across personas.

| Grade | Overall score |
|---|---|
| A | 80 and above |
| B | 65 to 79 |
| C | 50 to 64 |
| D | 35 to 49 |
| F | below 35 |

The command exits 1 when the overall score is below 50. The default scope, viewport, scores the first screen, which suits landing pages; the full-page scope (as in the second example) scrolls the whole page, which suits WCAG work. A score marked degraded means the page did not fully load, and only the barriers were scored.

Over MCP, `empathy_audit` tests one persona per call (pass it in `disabilities`); call it once per persona for reliable results. Its `goal` is used only when the server has a key.

---

## a11y audit

```bash
cbrowser a11y audit https://example.com
```

A fast smoke test of four rules: images without alt text, buttons without a name, inputs without a label, and a missing `lang` on the document. Score is passes divided by passes plus violations. A page with nothing to check scores 100 with 0 passes, so read the pass count before trusting the number. For anything beyond these four rules, use `empathy-audit`.

---

## hunt-bugs and chaos

```bash
cbrowser hunt-bugs https://example.com --max-pages 5
cbrowser chaos https://example.com --latency 3000
cbrowser chaos https://example.com --offline
cbrowser chaos https://example.com --block "analytics,ads" --fail-api "/api/cart:500"
```

`hunt-bugs` crawls up to `--max-pages` pages (default 10) and lists each bug with type, severity (critical, high, medium, low), selector and a fix: broken links, missing images, console errors, contrast, duplicate IDs, missing ARIA, missing page title or `lang`, missing skip link, autoplaying media, form errors. It exits 0 even when it finds bugs, so in CI read the count.

`chaos` loads the page under the injected failure and passes when it still loads within the timeout. `--offline` passes only if a service worker or cache serves the page. It exits 1 on a failure and prints a screenshot path.

---

## webmcp-ready

```bash
cbrowser webmcp-ready https://your-server.example/mcp --html
cbrowser webmcp-ready https://your-server.example/mcp --api-key "$KEY" --output webmcp.json
```

Audits an MCP server, not a web page, in six weighted tiers: Server implementation 25%, Tool discoverability 20%, Instrumentation 15%, Consistency 15%, Agent optimizations 15%, Documentation 10%. Grades use the same bands as agent-ready (A from 90, F below 60), and it exits 1 on an F. `--oauth-token` covers OAuth-protected servers.

---

## MCP-only audits

**`cognitive_effort`** scores one persona on one page through an 8-layer chain (visual complexity, cognitive load, decision, motor, motor procedure, frustration, readability, reading attention). The headline, `cognitiveTransportCost.total`, is a percentile against a reference set of real pages at the same scope: 0.8 means costlier than 80% of them. Bands: below 0.5 lower half, 0.5 to 0.8 upper half, 0.8 to 0.95 high, 0.95 and above top 5%. `abandonmentRisk` is a separate number. `scope: viewport` is the default; `scope: full_page` measures the whole page, and `scope: sequential` scores screen by screen and reports where people stop. Pass `siteFamiliarity` (0 first visit, 1 daily user) to model a returning visitor; otherwise every run is a first visit.

**`site_cognitive_assessment`** chains three gates and reports a `result`: BLOCKED (bot challenge or empty page, nothing assessed), UNQUALIFIED (agent-ready score below `threshold`, default 60, so fix structure first), or COMPLETE (cognitive effort for each persona, default `first-timer,cognitive-adhd`). PROXY_BLOCKED and ERROR mean the run itself failed.

**Content for AI readers:** `llms_txt_generate` drafts an llms.txt from the site, `llms_txt_validate` checks format and links, `llms_txt_diff` compares an existing llms.txt with the live site. `structured_data_suggest` detects the page type and proposes JSON-LD.

**`security_audit`** scans MCP tool definitions for prompt injection: cross-tool instructions, privilege escalation, exfiltration patterns. It can read a Claude Desktop config, fetch a remote server's tool list, or scan the server it runs in:

```text
security_audit({ mcp_url: "https://your-server.example/mcp", format: "text" })
security_audit({ config_path: "~/Library/Application Support/Claude/claude_desktop_config.json" })
```

---

## Reports

- `--output <file>` saves the JSON result.
- `--html` writes an HTML report next to it (`--output agent-ready.json` gives `agent-ready.html`). Without `--output` the HTML goes to the working directory as `agent-ready-report.html`, `ai-benchmark-report.html`, `empathy-audit-report.html` or `webmcp-ready-report.html`.
- `hunt-bugs`, `chaos` and `a11y audit` print to the terminal only. `--plain` gives `[PASS]` / `[FAIL]` text for logs.

---

## Hosted server vs local

The hosted MCP servers open only public internet addresses: `localhost`, private ranges and internal hostnames are refused, including through redirects. To audit a dev server or an intranet page, run the local CLI or the local stdio server (`npx cbrowser mcp-server`). The hosted servers also refuse server file paths, such as a Claude Desktop config for `security_audit`; scan a remote server by URL instead, and give the llms.txt tools a URL or the file's content.

---

## Reading results honestly

- A grade compares pages and tracks change; it does not certify compliance. Confirm the top findings on the page before reporting them.
- Run each audit on the page users actually land on, at the device they use (`--device`), in both color schemes if the site has a dark mode (`--color-scheme dark`).
- A good score on a blocked or half-loaded page is not a result. Check the element count and any degraded flag first.
