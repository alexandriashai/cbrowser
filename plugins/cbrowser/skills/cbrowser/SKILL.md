---
name: CBrowser
description: Cognitive Browser - browser automation that tests a site the way real people use it. 137 MCP tools, 29 personas (25 human, 4 agent), 26 cognitive traits, free keyless audits (AI-agent readiness, accessibility empathy, bug hunting), persona journeys that predict where a visitor gives up, natural-language tests, visual and performance regression, and screen capture to GIF/WebP/WebM with a frame manifest an AI can read. USE WHEN browser automation OR open a page OR click or fill a form OR scrape or extract OR verify a page in a real browser OR screenshot OR agent-ready audit OR accessibility audit OR empathy audit OR persona testing OR cognitive journey OR user abandonment OR friction OR natural language tests OR flaky tests OR visual regression OR cross-browser OR responsive test OR performance regression OR record a video OR record a gif OR screen capture OR screencast.
---

# CBrowser

Browser automation that asks whether a real person can finish the task, not only whether a button clicks. It drives Chromium (Firefox and WebKit for cross-browser work) through Playwright and adds personas, cognitive scoring and a safety gate on risky clicks.

## Pick how to reach it

| You have | Use | Notes |
|----------|-----|-------|
| The cbrowser MCP server connected (the hosted `cbrowser` plugin, the local `cbrowser-local` plugin or `npx cbrowser mcp-server`, or a claude.ai connector) | the MCP tools by name: `navigate`, `click`, `agent_ready_audit`, ... | The tool prefix depends on how the server was added (`mcp__cbrowser__navigate`, `mcp__plugin_cbrowser_cbrowser__navigate`, a connector's own name). Match on the part after the last `__`. |
| A shell | the `cbrowser` CLI (`npm install -g cbrowser`, or `npx cbrowser <command>`) | Node 20.19+ or 22.12+. Installing downloads Chromium. Run `cbrowser doctor` if a browser fails to launch. |
| Neither | the hosted connector `https://demo.cbrowser.ai/mcp`, added in claude.ai | Hosted servers open public internet addresses only, never `localhost` or a private network. Test local sites with the CLI or the local MCP server. |

The local stdio server registers 137 tools. A hosted server lists the set its plan allows and needs a CBrowser account for tool calls: the `cbrowser` plugin signs in through the browser, where a new user can create a free account on the spot (in Claude Code: `/mcp`, then cbrowser). Enterprise-only tools answer with an upgrade notice elsewhere. Never ask for a password or key in the chat.

**Unsure what a tool does or what a score means?** Ask the docs: `question_answer` over MCP, or `cbrowser ask "<question>"`. Both search the cbrowser.ai documentation, need no account, and return their sources.

## Cost: check before running

| Free (keyless) | Needs an Anthropic API key (each step is a model call) |
|----------------|--------------------------------------------------------|
| `navigate`, `click`, `fill`, `type`, `scroll`, `screenshot`, `extract`, `evaluate` | `cognitive-journey` |
| `agent-ready-audit`, `ai-benchmark`, `empathy-audit` (without `--goal`), `webmcp-ready` | `explore` (a short cognitive journey) |
| `test-suite`, `repair-tests`, `flaky-check`, `hunt-bugs`, `chaos`, `coverage` | `compare-personas` (one journey per persona) |
| `ai-visual`, `cross-browser`, `responsive`, `ab`, `perf`, `a11y` | `competitive-benchmark` (one journey per site) |
| `capture`, `har`, `network`, `console`, `daemon`, `ask`, `doctor` | `empathy-audit --goal` (the journey part) |

Set a key with `cbrowser config set-api-key <key>`. Nothing falls back to a keyless guess: a keyed command without a key refuses.

**Replays are free.** Record a journey once with `cognitive-journey --trace`, then re-run it with `--replay-trace <file>`: no model calls, no key. If the page changed since the recording, the replay stops at the step that diverged and names it. Use replays for regression checks instead of paying for a new journey.

**Over MCP, you drive the journey.** `cognitive_journey_init` returns the persona and its starting state; you take each step with the browser tools and report what happened with `cognitive_journey_update_state`. The server makes no model call of its own on that path.

## What to use for which question

| Question | Start with | Workflow |
|----------|------------|----------|
| Open a page, click, type, read the result | `navigate`, `click`, `fill`, `type_text`, `screenshot` | `Workflows/Navigate.md`, `Workflows/Interact.md` |
| Pull data off a page | `extract`, `page_understand`, `evaluate_script` | `Workflows/Extract.md` |
| Log in once and stay logged in | `fill`, then `save_session` and `load_session` | `Workflows/Authenticate.md`, `SessionManagement.md` |
| Can an AI agent use this site? | `agent_ready_audit`, `webmcp_ready_audit`, `llms_txt_validate` | `Workflows/Audit.md` |
| Can people with disabilities use it? | `empathy_audit` (one persona per call), `cbrowser a11y audit` | `Workflows/Audit.md` |
| How much effort does a page cost a visitor? | `cognitive_effort`, `site_cognitive_assessment` | `Workflows/Audit.md` |
| Where would a visitor give up? | `cognitive_journey_init` and `cognitive_journey_update_state`, or `cbrowser cognitive-journey` | `Workflows/CognitiveJourney.md` |
| Compare personas or competitors | `compare_personas_init`, `competitive_benchmark` | `Workflows/Journey.md` |
| Find bugs fast, for free | `hunt_bugs`, `chaos_test` | `Workflows/Audit.md` |
| Tests in plain English, flaky tests, repairs | `nl_test_inline`, `nl_test_file`, `detect_flaky_tests`, `repair_test` | `Workflows/Test.md` |
| Did the page change visually, across browsers or widths? | `visual_baseline`, `visual_regression`, `cross_browser_test`, `responsive_test`, `ab_comparison` | `Workflows/Test.md` |
| Did it get slower? | `perf_baseline`, `perf_regression` | `Workflows/Test.md` |
| Record motion: an animation, a drag, a flow | `capture_start` and `capture_stop`, or `cbrowser capture` | `Workflows/Capture.md` |
| Fix what an audit found | `remediation_patches`, `structured_data_suggest`, `llms_txt_generate` | `Workflows/Audit.md` |

## Quick reference

```bash
# Look at a page
cbrowser navigate "https://example.com"
cbrowser screenshot "https://example.com" page.png
cbrowser extract headings

# Interact (targets can be text, a label, a role or CSS)
cbrowser click "More information" --url "https://example.com"
cbrowser fill "Email" "user@example.com" --url "https://example.com/signup"
cbrowser press Enter

# Free audits, with HTML reports
cbrowser agent-ready-audit "https://example.com" --html
cbrowser empathy-audit "https://example.com" --personas cognitive-adhd,low-vision-magnified --html
cbrowser hunt-bugs "https://example.com"

# A persona journey (needs a key), recorded so it can be replayed for free
cbrowser cognitive-journey --persona first-timer --start "https://example.com" --goal "sign up" --trace

# Dark theme on a phone
cbrowser screenshot "https://example.com" dark-phone.png --device iphone-16 --color-scheme dark
```

Every command takes `--browser`, `--device`, `--viewport`, `--color-scheme`, `--locale`, `--timezone` and `--geo`. `cbrowser device list` names the devices. `--json-output` prints one JSON envelope for scripts; `--plain` drops emoji and box drawing.

## State between commands: the daemon

Without a daemon, each CLI command starts its own browser and reloads the last URL (kept for an hour). Cookies and localStorage carry over; sessionStorage, scroll position, typed input and script variables do not. For a multi-step flow, start a daemon so every command shares one page:

```bash
cbrowser daemon start --viewport 1440x900   # size goes here: navigate --viewport is ignored while a daemon runs
cbrowser navigate "https://example.com/login"
cbrowser fill "Email" "me@example.com"
cbrowser click "Continue"
cbrowser daemon stop
```

Commands that would open a second browser on the same profile (`script`, `explore`, `a11y`, `perf`, `visual`, `session save`, and others) refuse while a daemon runs. Give every command the same `CBROWSER_DATA_DIR`. Over MCP the server keeps the browser between calls; pass the `_browserToken` a tool returns into the next call to stay on the same page.

## Personas

There are 21 built-in personas, plus 4 emotional and 4 AI-agent personas.

| Group | Personas |
|-------|----------|
| General (10) | `power-user`, `first-timer`, `mobile-user`, `screen-reader-user`, `elderly-user`, `impatient-user`, `distracted-user`, `careful-reader`, `explorer`, `task-focused` |
| Accessibility (11) | `motor-impairment-tremor`, `low-vision-magnified`, `cognitive-adhd`, `dyslexic-user`, `deaf-user`, `elderly-low-vision`, `color-blind-deuteranopia`, `autism-spectrum`, `intellectual-disability`, `aphasia-receptive`, `dyscalculia` |
| Emotional (4) | `anxious-user`, `confident-user`, `emotional-user`, `stoic-user` |
| AI agents (4) | `retrieval-agent`, `task-completion-agent`, `crawl-agent`, `conversational-agent` |

`cbrowser persona list` shows them with descriptions. `--persona` also accepts a free-text description ("a nurse checking a schedule on a phone between patients"). Build a lasting custom persona with `persona_create_start` or `persona_create_from_description`; look traits up with `persona_traits_list` and `persona_trait_lookup`. Details: `Personas.md`, `CognitivePersonas.md`, `CognitiveState.md`.

## Safety

- **Risky clicks are gated.** The click gate classifies each target. A red-zone control (delete an account, pay, submit something irreversible) is refused and nothing is clicked until you pass `--force` on the CLI or `force: true` to `click`. Ask the user before forcing one.
- **Page scripts need `--force`.** `cbrowser evaluate` runs nothing without it, because a script can click or submit around the gate.
- **Every MCP tool call is audit-logged.** Red-zone enforcement for the other MCP tools is opt-in with `CBROWSER_ENFORCE_RED_ZONE=true`.
- **Keep real passwords out of prompts and committed test files.** Log in once, save the session, reuse it. See `Credentials.md`.

`Philosophy.md` explains the zones and the reasoning behind them.

## Gotchas

- `navigate --viewport` is ignored while a daemon runs. Start the daemon with `--viewport` or `--device`.
- A hosted server cannot reach `localhost`, `10.x`, `192.168.x` or its own addresses; the tool says so in one sentence. Use the local CLI or `npx cbrowser mcp-server` for those.
- `capture` records the screen; `record` records user actions for test generation. They are different commands.
- mp4 capture needs a full ffmpeg (`CBROWSER_FFMPEG_PATH`); the bundled one makes GIF, WebP and WebM.
- Over a hosted server, give `empathy_audit` one persona per call to stay inside the request timeout.
- Familiarity is per run: pass `siteFamiliarity` (0 first visit, 1 daily user) to `cognitive_effort` and `site_cognitive_assessment`. No persona carries one.
- `cross-browser` needs Firefox and WebKit: `cbrowser install-browsers firefox webkit`.

## Files in this skill

| File | What it covers |
|------|----------------|
| `Workflows/Navigate.md` | Opening pages, waiting, devices, screenshots |
| `Workflows/Interact.md` | Clicking, typing, keys, uploads, overlays, the click gate |
| `Workflows/Extract.md` | Pulling structured data off pages |
| `Workflows/Authenticate.md` | Logging in and reusing a logged-in session |
| `Workflows/Audit.md` | The free audits and what their scores mean |
| `Workflows/Test.md` | Natural-language tests, visual and performance regression |
| `Workflows/Journey.md` | Choosing between explore, persona comparison, benchmarks and replays |
| `Workflows/CognitiveJourney.md` | Running a persona journey step by step |
| `Workflows/Capture.md` | Screen capture and the frame manifest |
| `Philosophy.md` | Safety zones and principles |
| `AIVision.md` | How natural-language element targeting works |
| `SessionManagement.md` | Saved sessions, cookies and storage |
| `Credentials.md` | Handling credentials safely |
| `Personas.md`, `CognitivePersonas.md`, `CognitiveState.md` | Personas, traits, and the patience and frustration model |

Release notes: https://github.com/alexandriashai/cbrowser/blob/main/CHANGELOG.md
