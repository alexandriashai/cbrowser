# CBrowser Philosophy

## Constitutional Principles

CBrowser is built to keep an automated browser from doing something irreversible by accident, and to leave a record of what it did. This file describes what the code enforces today and where the limits are.

---

## The Five Laws of Cognitive Automation

### 1. Transparency Law
**Every action is recorded.**

- Every click, hover, hover-click and fill, and every red-zone refusal (including drags, key presses and pointer clicks), is appended to a daily audit file: `<data dir>/audit/audit-YYYY-MM-DD.json`
- Every MCP tool call is logged to `<data dir>/audit/tool-invocations-YYYY-MM-DD.json` with its parameters, timing and result (`CBROWSER_AUDIT_ENABLED=false` turns this off)
- `navigate` saves a screenshot; a failed click returns one
- A cognitive journey records an inner monologue and the state at every step (`CognitiveState.md`)

### 2. Verification Law
**Irreversible actions are refused unless you force them.**

A red-zone action is refused, with a screenshot and the element it would have hit, until you repeat it with `--force` (CLI) or `force: true` (the MCP `click` tool). The check runs twice: on the selector string, and on the element it resolves to, so `#btn-7` that turns out to be "Delete account" is refused like the words would be. Page script (`cbrowser evaluate`) is refused without `--force` because it can click, submit or delete without passing the element gate.

There is no pause-and-ask step. When a decision belongs to the user, the MCP tool `ask_user` builds a structured question for the calling model to put to them.

### 3. Privacy Law
**Secrets stay out of logs and traces.**

- The action audit records the selector, never the value typed into a field
- The MCP tool audit redacts parameter values whose names look sensitive (password, secret, token, key, credential, auth, bearer, pin, ssn, card, ...)
- A journey trace (`--trace`) redacts secrets from every string and stores the page only as a sha256 hash, never its HTML or text
- The Anthropic API key is stored owner-only (mode 0600)
- Site profiles encrypt their cookies with AES-256-GCM

Know the limits: saved sessions (`cbrowser session save`) are plain JSON holding cookies and storage, and screenshots capture whatever is on screen.

### 4. Politeness Law
**Respect websites and their infrastructure.**

The CLI adds no delay between commands, does not read robots.txt and does not back off on rate limits; pacing is up to you. A cognitive journey pauses 500 ms between steps and times each click and keystroke from the persona's timing and pointing models, which is closer to human pace but is not a rate limiter. Keep crawls (`hunt-bugs --max-pages`, `coverage --max-pages`) small on sites you do not own.

### 5. Fallback Law
**When uncertain, say so. When dangerous, stop.**

- An element that cannot be found is reported as not found; `--verbose` lists the visible named elements instead of guessing
- `smart-click` retries a bounded number of times and reports a low-confidence hit as a failure
- A red-zone refusal ends a retry loop instead of being retried around
- A page that does not load stops the command with the reason

---

## Action Classification

Zones come from `classifyAction` and `classifyElement` in `src/browser/constitutional-safety.ts`.

### Green Zone (runs)
- Every action that is not a click or a fill: navigate, hover, scroll, screenshot, extract

### Yellow Zone (runs, logged)
- Every fill
- Every click not classified red, including deliberately benign uses of risky words: "Submit search", "Remove filter", "Delete draft", "Confirm email"

### Red Zone (refused without force)
- Money: buy, purchase, pay $N, pay now, checkout, place order, complete or submit an order or payment, proceed to checkout
- Destroying an account: delete or remove account, profile or data, permanently delete, close or deactivate account, erase all data
- High impact on named things: delete, destroy or drop a repository, project, workspace, database or similar; terminate instances; cancel a subscription; revoke access or tokens; suspend or ban users; transfer or withdraw funds; refunds; merge a pull request; deploy to production; sign out everywhere; disable 2FA; leave an organization; wipe a device; factory reset; empty the trash
- Confirming any of those: "Confirm purchase", "Yes, delete"

### Black Zone
- Instruction text naming an attack: bypass, inject, hack, exploit, SQL injection, XSS

Black is recorded in the audit, but the click gate itself refuses only red. Over MCP, a tool classified black is always refused (no current tool is); a red-zone tool is refused only with `CBROWSER_ENFORCE_RED_ZONE=true`, because MCP has no force affordance at the tool level.

---

## Error Recovery Philosophy

### Graceful Degradation

```
Self-healing cache -> exact text -> partial text -> placeholder -> label
  -> button role -> CSS -> name/type/id attributes -> link role
  -> fuzzy attribute match -> the same inside iframes -> "Element not found"
```

No vision model is involved. Details in `AIVision.md`.

### Self-Healing Strategy

When a `smart-click` (or a `test-suite` click step) misses:
1. Collect alternative selectors from the page: id, aria-label, title, text, href, each with a confidence
2. Retry the best of them, waiting between attempts
3. Accept a retry only at confidence 0.8 or above, and cache that mapping per domain
4. If nothing qualifies, report failure with the visible clickable elements

---

## Audit Trail Format

`<data dir>/audit/audit-YYYY-MM-DD.json` is a JSON array, one entry per action:

```json
[
  {
    "timestamp": "2026-11-23T18:30:01.000Z",
    "action": "click",
    "target": "Sign in",
    "zone": "yellow",
    "result": "success"
  },
  {
    "timestamp": "2026-11-23T18:30:09.000Z",
    "action": "click",
    "target": "#btn-7",
    "zone": "red",
    "result": "blocked",
    "persona": "first-timer"
  }
]
```

`result` is success, failure or blocked; `persona` appears when a persona is active.

---

## When to Use vs. When Not to Use

### Use CBrowser When:
- Sites change their DOM often and text or role selectors outlast CSS
- You want to see a site through a persona: abandonment, friction, cognitive effort
- You need an audit trail and a guard against irreversible clicks
- You want accessibility, agent-readiness or visual-regression checks from one tool

### Don't Use When:
- Simple, stable page automation where plain Playwright selectors are enough
- High-frequency automation (CBrowser does not rate-limit for you)
- Cognitive journeys at scale without budget: each step is a paid model call (traces replay free)

---

## What CBrowser Keeps Between Runs

Everything lives under the data dir: `CBROWSER_DATA_DIR`, default `~/.cbrowser`.

```
~/.cbrowser/
  selector-cache.json     # learned selector mappings (self-healing)
  sessions/               # saved browser sessions (cbrowser session save)
  personas/               # custom personas
  browser-state/          # the persistent browser profile
  audit/                  # action and MCP tool-call logs
  screenshots/            # per-session screenshots
  traces/                 # journey traces (--trace), replayable without a key
  videos/                 # screen captures
  baselines/  visual-baselines/  har/  recordings/
  config.json             # user config, including the API key
```

`cbrowser storage` shows usage; `cbrowser cleanup --dry-run` previews what old files would go; `cbrowser uninstall` (dry run by default) lists everything CBrowser would remove.
