# Journey Workflow

Send a persona at a goal and see where it gets stuck or gives up. This page helps you choose between the journey commands and be exact about cost. The full step-by-step cognitive loop (perceive, decide, act, abandonment rules) is in [CognitiveJourney.md](./CognitiveJourney.md).

Every live journey is model-driven: each step is one call to Claude, so it needs an Anthropic API key and costs tokens. There is no keyless explorer. The free options are replaying a recorded trace, and the keyless audits in [Audit.md](./Audit.md).

---

## Trigger

- "explore the site as", "run as a first-timer", "simulate a user", "where do users get stuck"
- "compare personas", "how do different users experience", "elderly vs power user"
- "benchmark against competitors", "which site is easier to sign up on"
- "replay the journey", "re-run without spending tokens"

---

## Choose

| You want | Command | Model calls | Key |
|---|---|---|---|
| A quick look at one persona on one goal | `cbrowser explore <persona> --start <url> --goal <goal>` | one journey, up to 20 steps / 120 s | yes |
| The full simulation, with tunable limits, trace and capture | `cbrowser cognitive-journey --persona <p> --start <url> --goal <goal>` | one journey, up to `--max-steps` (default 50) | yes |
| Same goal, several personas side by side | `cbrowser compare-personas --start <url> --goal <goal> --personas a,b,c` | one journey per persona | yes |
| Same goal, several sites side by side | `cbrowser competitive-benchmark --sites <a,b> --goal <goal>` | one journey per site, up to `--max-steps` (default 30) each | yes |
| Accessibility barriers plus a goal attempt | `cbrowser empathy-audit <url> --goal <goal> --personas <list>` | one journey per persona (the barrier check itself is free) | yes for the goal part |
| Re-run a recorded journey | `cbrowser cognitive-journey --start <url> --goal <goal> --replay-trace <file>` | none | no |

Cost scales with steps times runs. Five personas at 20 steps is up to 100 model calls; `compare-personas` without `--personas` runs every built-in persona, so always name the ones you need. Lower `--max-steps` and `--max-time` while you are iterating on the goal wording.

Set the key once with `cbrowser config set-api-key <key>`; `cbrowser config set-model <model>` changes the model. `cbrowser doctor` reports whether a key is configured. Without one, `explore`, `cognitive-journey`, `compare-personas` and `competitive-benchmark` refuse and run nothing.

---

## explore: a short journey

```bash
cbrowser explore first-timer --start https://example.com --goal "find the pricing page"
cbrowser explore mobile-user --start https://example.com --goal "sign up" --record-video
```

`explore` is the shortest form of a cognitive journey: fixed limits (20 steps, 120 seconds), a pass or fail, the step count and friction points. It exits 1 when the goal is not reached. Reach for it to sanity-check a goal before spending a longer `cognitive-journey` on it. It takes no trace, so it cannot be replayed.

---

## cognitive-journey: the full run

```bash
cbrowser cognitive-journey --persona elderly-user --start https://shop.example.com \
  --goal "buy a blue shirt in size M" --max-steps 30 --verbose --trace --output journey.json
```

Use it when you need the internal monologue (`--verbose`), patience and frustration over time, a JSON report, a video (`--capture`), or a trace for replay. It starts in a fresh browser profile, so the persona is a new visitor; `--persistent` uses the shared profile instead (for example after loading a logged-in session). Locale, timezone and location can be overridden with `--locale`, `--timezone` and `--geo`.

The loop, abandonment thresholds and report fields are documented in [CognitiveJourney.md](./CognitiveJourney.md).

---

## Replay a journey for free

A traced run writes one line per step to `traces/<id>.jsonl` in the data directory (by default `~/.cbrowser/traces/`) and prints the exact replay command when it finishes.

```bash
# 1. Paid once: record the decisions
cbrowser cognitive-journey --persona first-timer --start https://example.com \
  --goal "start a free trial" --trace

# 2. Free afterwards: replay them, no model calls, no key
cbrowser cognitive-journey --persona first-timer --start https://example.com \
  --goal "start a free trial" --replay-trace ~/.cbrowser/traces/<id>.jsonl
```

Each recorded step carries a hash of the page's URL and content. Replay checks that hash before every step and stops with a divergence error at the first step where the live page differs from the recorded one. That makes a replay a cheap regression check: it passes while the path the persona took is unchanged, and it names the step where it changed. Pages with rotating content, dates or randomised copy will diverge on every run; replay those against a staging build with stable content.

Traces hold no raw HTML and no page text (only the hash), and `sk-` key-shaped strings are scrubbed. They do hold each decision as the model wrote it, including any text it typed into a field, so read one before committing or sharing it.

---

## compare-personas

```bash
cbrowser compare-personas --start https://example.com --goal "complete checkout" \
  --personas power-user,first-timer,elderly-user,mobile-user --html --output compare.json
```

Runs one journey per persona (3 at a time; `--concurrency` changes that) and reports success, time, steps, friction and the reason each abandoning persona gave up (patience, frustration, confusion). `--device` and `--viewport` apply to every journey. The HTML report is written next to `--output` (here `compare.html`). It exits 1 when any persona fails, which is usually the finding rather than an error.

`cbrowser persona list` shows the built-in and custom personas.

## competitive-benchmark

```bash
cbrowser competitive-benchmark --sites "https://yoursite.com,https://competitor.com" \
  --goal "sign up for a free trial" --persona first-timer --max-steps 20 --html
```

The same persona and goal on each site, ranked head to head. Phrase the goal so it means the same thing on every site. For a keyless comparison of how well the sites work for AI agents, use `cbrowser ai-benchmark` from [Audit.md](./Audit.md) instead.

---

## Over MCP

| Tool | Who does the thinking | Key on the server |
|---|---|---|
| `cognitive_journey_init` + `cognitive_journey_update_state` | the calling model (Claude in your session) drives the browser tools step by step | no; it costs your session's tokens |
| `compare_personas_init` + `compare_personas_complete` | the calling model runs one journey per persona, then hands the results back for aggregation | no |
| `compare_personas` | the server | yes; without one it returns the bridge instructions above |
| `competitive_benchmark` | the server | yes |
| `cognitive_journey_autonomous` | the server, whole journey in one call | Enterprise only |

In Claude Code, the init/update-state pair is the usual route: no separate key, and you can watch and steer each step. [CognitiveJourney.md](./CognitiveJourney.md) walks through it.

The hosted servers open only public internet addresses. To run a journey against `localhost` or a private network, use the local CLI or the local stdio server (`npx cbrowser mcp-server`).

---

## Reading the result

- A persona that abandons is a result, not a failure of the tool. Read the reason and the step where it happened.
- One run is one sample. Before acting on a single abandonment, re-run it or compare two or three personas.
- Treat the persona's monologue as the model's account of the page, not a user quote. Confirm the friction it names on the page itself (a screenshot, `cbrowser a11y audit`, or `empathy-audit`).
- When the goal "succeeds" too easily, check the final URL and screenshot: a vague goal ("explore the site") is reached by almost anything.
