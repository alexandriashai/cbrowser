# Cognitive Journey Workflow

Goal-driven user simulation: a persona with cognitive traits tries to reach a goal on a real site, and the run records what it noticed, where it got confused, and whether and why it gave up.

---

## Trigger Patterns

Activate this workflow when request contains:
- "cognitive journey", "cognitive simulation"
- "simulate user", "simulate as"
- "as [persona]" + goal-oriented task
- "user perspective test"
- "realistic user simulation"

**Example triggers:**
- "Simulate a confused first-timer trying to sign up"
- "Run cognitive journey as elderly-user on example.com goal find help page"
- "What would a mobile user experience trying to checkout?"

---

## Two Ways to Run a Journey

| | Autonomous (CLI) | MCP-driven |
|---|---|---|
| Who thinks | CBrowser calls Claude every step | The calling model (Claude Code) reasons as the persona |
| Needs | An Anthropic API key (`cbrowser config set-api-key <key>`); costs tokens per step | The CBrowser MCP server; no key |
| State rules | Emotional-state engine (`CognitiveState.md`, autonomous) | `cognitive_journey_update_state` rules (`CognitiveState.md`, MCP-driven) |
| Output | JSON report, optional HTML, trace, capture | Whatever the driving model narrates |

```
MCP-driven:

  Claude Code (thinks as the persona)
      |  navigate / screenshot / extract / click / fill
      v
  CBrowser MCP tools  --->  browser (Chromium)
      ^
      |  cognitive_journey_update_state after every action
      +-- returns newState, shouldAbandon
```

---

## Option 1: Autonomous Journey (CLI)

```bash
cbrowser cognitive-journey --persona first-timer \
  --start "https://example.com" --goal "find help documentation"
```

Useful flags (the COGNITIVE JOURNEY section of the CLI help lists them all):

```bash
cbrowser cognitive-journey signup-check --persona elderly-user \
  --start "https://example.com" --goal "find the help page" \
  --device iphone-15 --verbose --output journey.json \
  --max-steps 30 --max-time 180 --trace --capture
```

- `--persona` takes a persona name or, if CBrowser does not know the name, a description of the person. Agent personas are refused.
- The run starts in a fresh browser profile (a new visitor) unless you pass `--persistent`.
- Each step's screenshot is sent to Claude; `--no-vision` sends text only.
- `--trace` records every decision to `~/.cbrowser/traces/<id>.jsonl`. Replay it with no model calls and no API key:

```bash
cbrowser cognitive-journey --replay-trace ~/.cbrowser/traces/<id>.jsonl \
  --persona elderly-user --start "https://example.com" --goal "find the help page"
```

A replay stops with an error if the live page no longer matches the recorded one.

Related commands on the same engine: `cbrowser explore <persona> --start <url> --goal <goal>` (a short journey), `cbrowser compare-personas` (several personas, same goal), `cbrowser competitive-benchmark` (same goal, several sites). All need the API key.

Over MCP, `cognitive_journey_autonomous` is an Enterprise tool; on the local server it returns an upgrade message. Use the CLI, or drive the journey yourself (Option 2).

---

## Option 2: MCP-Driven Journey

```
cognitive_journey_init(
  persona: "first-timer",
  goal: "find help documentation",
  startUrl: "https://example.com"
)
```

`cognitive_journey_init` opens the start page and returns the persona's `cognitiveProfile`, `initialState`, `abandonmentThresholds`, step-by-step `instructions`, and a browser session token. Pass that token (`param: _browserToken`) to every later call so they act on the journey's page. Optional: `customTraits` (any of the 26 traits, including siteFamiliarity), `location`, `waitAfterLoad`, `waitForSelector`.

While a journey is open, `evaluate_script` is refused on its session: the persona can only look, click, fill, scroll and navigate.

### MCP Tools Available

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `cognitive_journey_init` | Start the journey | Once, first |
| `navigate` | Go to URL | Follow a link by address |
| `screenshot` | Visual screenshot | Perceive the page |
| `extract` | Links, headings, forms, images or text | "Read" the page as the persona |
| `page_understand` | Page type, affordances, structure | Orient on a new page |
| `find_element_by_intent` | Selector from a description | Before clicking something described in words |
| `click` | Click element | Execute a click decision |
| `smart_click` | Click with retry | When a click misses |
| `fill` | Type in input | Fill forms |
| `scroll` | Scroll the page | Look below the fold |
| `cognitive_journey_update_state` | Update cognitive state | After every action |
| `list_cognitive_personas` | List personas | Choose a persona |

---

## The Cognitive Loop

```
INITIALIZE -> PERCEIVE -> COMPREHEND -> DECIDE -> EXECUTE -> EVALUATE -> (loop or abandon)
```

In an MCP-driven journey you run this loop. PERCEIVE, COMPREHEND and DECIDE are reasoning you do as the persona; the scoring formulas below are heuristics for that reasoning, not code CBrowser runs. EVALUATE is where CBrowser's rules apply, through `cognitive_journey_update_state`.

### Phase 1: INITIALIZE

1. **Parse the request:** persona name, starting URL, goal, constraints
2. **Call `cognitive_journey_init`** and read the returned profile: trait values, attention pattern, decision style (null when no style clearly wins), thresholds
3. **Keep the returned `initialState`:** patience 1.0, confusion 0, frustration 0, progress 0, confidence 0.5
4. **Announce adoption** with the persona's real values. For `first-timer`:
   ```
   COGNITIVE JOURNEY
   Persona: first-timer
   Goal: Create an account
   Starting URL: https://example.com

   Adopting persona mindset...
   - Patience: 0.70 (moderate)
   - Risk tolerance: 0.30 (moderate, near cautious)
   - Comprehension: 0.30 (struggles with UI)
   - Attention: thorough (reads before deciding)

   Beginning simulation...
   ```

---

### Phase 2: PERCEIVE

Look at the page with `screenshot`, and `extract` (headings, links, forms or text) or `page_understand` for structure. Then filter what you report by the persona's attention pattern:

| Pattern | What to Notice First |
|---------|---------------------|
| f-pattern | Top bar, left side, headings |
| z-pattern | Top left, top right, then across to the bottom right |
| skim | Only the largest, boldest elements |
| thorough | All headings, all text, all buttons |
| targeted | Navigation, expected locations |
| exploratory | Everything, in no particular order |
| sequential | First focusable element, then tab order |

**Output perception:**
```
Step 3 | PERCEIVE
URL: https://example.com/register

As a first-timer reading thoroughly, I notice:
1. A big "Welcome" heading
2. A form with several fields (a lot of inputs)
3. A "Sign Up" button at the bottom (probably what I need)
4. Smaller links I'm not sure about ("Terms", "Privacy")
5. A "Login" link (not what I want, I don't have an account)

Elements that confuse me:
- "Personal" vs "Business" account - what's the difference?
```

---

### Phase 3: COMPREHEND

Interpret each element as the persona would. A heuristic:

```
For each noticed element:
  interpretedPurpose = what the persona THINKS it does
  confidence = persona.comprehension x elementClarity
  IF confidence < 0.5: add to uncertainties, and mark this step wasConfusing
```

**Output comprehension:**
```
Step 3 | COMPREHEND

- "Sign Up" button -> probably creates an account (confidence: 0.7)
- "Business" option -> maybe for companies? (confidence: 0.3)
- "Email" field -> I know this one (confidence: 0.95)

Uncertainties:
- Personal or Business? What happens if I pick the wrong one?
```

---

### Phase 4: DECIDE

Choose an action the persona would take. A heuristic:

```
For each possible action:
  score = goalRelevance x 0.5
        + comprehensionConfidence x 0.3
        + (riskTolerance x elementRisk) x 0.2

IF persona.riskTolerance < 0.3 AND elementRisk > 0.5:
  hesitate, consider alternatives
```

**Output decision:**
```
Step 3 | DECIDE

1. Click "Personal" (score: 0.72) - matches my goal, unsure what happens
2. Click "Business" (score: 0.35) - not me
3. Read more first (score: 0.45) - might explain the difference

Decision: Click "Personal"
Inner monologue: "I guess Personal is me... I hope I can go back if it's wrong."
```

---

### Phase 5: EXECUTE

Use the CBrowser tools, always with the journey's session token:

```
find_element_by_intent(intent: "Personal account option", _browserToken: "...")
click(selector: "<selector it returned>", _browserToken: "...")
```

Check `zone` and `visible` from `find_element_by_intent` before clicking. A red-zone element (purchase, delete account) is refused unless you pass `force`; a persona journey should not force it.

---

### Phase 6: EVALUATE

Report the outcome to `cognitive_journey_update_state`:

```
cognitive_journey_update_state(
  currentState: { patienceRemaining: 0.95, confusionLevel: 0.35, frustrationLevel: 0.0,
                  goalProgress: 0.1, confidenceLevel: 0.5, currentMood: "neutral",
                  stepCount: 2, timeElapsed: 4 },
  actionResult: { success: true, progressMade: true, wasConfusing: false, wentBack: false },
  personaTraits: { patience: 0.7, riskTolerance: 0.3, comprehension: 0.3, persistence: 0.5 },
  _browserToken: "..."
)
```

It applies the rules in `CognitiveState.md` and returns `newState`, `shouldAbandon`, `abandonmentReason`, `abandonmentMessage`, `journeyOver` and the deltas. For the call above:

```
Step 3 | EVALUATE

Outcome: Success - the personal sign-up form opened

State update:
- Patience: 0.95 -> 0.93 (-0.02 per step; no frustration to add)
- Confusion: 0.35 -> 0.25 (-0.10, the action worked)
- Frustration: 0.0 -> 0.0
- Goal progress: 0.1 -> 0.2 (+0.1, progress made)
- Confidence: 0.5 -> 0.6 (+0.1)

Mood: neutral -> hopeful

Inner monologue: "Oh good, that worked! This looks like the right form."

Abandonment check: CONTINUE
```

`cognitive_journey_update_state` checks only patience, frustration and confusion. Apply the persona's own limits from `abandonmentThresholds` yourself: steps without progress, repeated visits to one page, the time limit, and its lower confusion and frustration limits.

---

### Phase 7: LOOP OR COMPLETE

```
IF goalProgress >= 1.0 (or the goal is plainly reached):
  Journey complete - SUCCESS (set mood to relieved yourself)
ELIF shouldAbandon OR one of the persona's own limits is crossed:
  Journey complete - ABANDONED
ELSE:
  Return to PERCEIVE
```

---

## Abandonment Handling

When a limit is crossed, end the journey and report it:

```
ABANDONMENT TRIGGERED

Trigger: frustration (0.87 > 0.85 limit)
Step: 8
Goal progress: 0.3

Final state:
- Patience remaining: 0.23
- Confusion level: 0.56
- Frustration level: 0.87

Final monologue:
"I've tried three times and it keeps saying my password is wrong
but it won't tell me what's wrong with it! I'm going to try a different site."

Friction points identified:
1. Password requirements not shown (step 5)
2. Error message unhelpful (steps 6, 7, 8)
3. No "forgot password" link visible (step 8)
```

In the autonomous engine the limits are higher (frustration 0.95, or 0.8 for a low-patience persona); see `CognitiveState.md`.

---

## Full Example Simulation

```
User: "Simulate a confused elderly user trying to find the help page on example.com"

COGNITIVE JOURNEY
Persona: elderly-user
Goal: Find the help page
Starting: https://example.com

Traits loaded:
- Patience: 0.8 (patient)
- Risk tolerance: 0.2 (cautious)
- Comprehension: 0.2 (struggles with modern UI)
- Attention: thorough (reads everything)

--- Step 1 ---
[cognitive_journey_init opened https://example.com]

PERCEIVE: Looking at the page carefully...
There's a menu at the top with words I don't recognize...
"Dashboard", "Analytics"... Where is Help?

COMPREHEND:
- Dashboard -> not sure what this means (0.2 confidence)
- Menu icon (three lines) -> I've seen this before... (0.3 confidence)
- Small "?" icon -> maybe that's help? (0.4 confidence)

DECIDE: The question mark might be help, but it's very small.
Let me look for the word "Help" first...

[Inner monologue: "I wish they would just write 'Help' somewhere."]

--- Step 2 ---
[scroll down]

PERCEIVE: "Contact Us" and "FAQ" in the footer, in very small text.

COMPREHEND:
- Contact Us -> I could email them (0.6 confidence)
- FAQ -> Frequently Asked Questions! (0.7 confidence)

DECIDE: FAQ is probably what I need.
[click "FAQ"]

--- Step 3 ---
PERCEIVE: A page titled "Frequently Asked Questions", a search box,
a list of questions.

EVALUATE: progress made; mood hopeful -> relieved
[Inner monologue: "This looks like what I needed."]

--- JOURNEY COMPLETE ---

Result: SUCCESS
Steps: 3
Final confusion: 0.15
Friction points: 1 (small "?" icon, missed on first scan)

Recommendation: Add a visible "Help" text link in the main navigation
for users unfamiliar with icon conventions.
```

---

## Output Format

### Real-Time

The CLI prints each step's mood, patience, confusion, frustration, monologue and action with `--verbose`. In an MCP-driven journey, narrate the same per step.

### Final Report

The autonomous journey writes a `CognitiveJourneyResult` (`--output journey.json`):

```yaml
persona: elderly-user
goal: "Find the help page"
goalAchieved: true
goalEvidence: "[VERIFIED - 80% match] Frequently Asked Questions"
totalTime: 28.4
stepCount: 3
summary:
  avgConfusionLevel: 0.28
  maxFrustrationLevel: 0.15
  backtrackCount: 0
  timeInConfusion: 2
frictionPoints:
  - step: 1
    url: "https://example.com/"
    element: "? icon"
    type: "unclear_button"
    frustrationIncrease: 0.1
    monologue: "I wish they would just write 'Help' somewhere..."
fullMonologue:
  - "I wish they would just write 'Help' somewhere..."
  - "Oh! FAQ - I know that one."
  - "This looks like what I needed."
journeyLog: [...]      # one entry per step
navigationPath: [...]
```

Note: `goalAchieved` is the model's own claim. The evidence tag says whether its quoted words were found on the page; check it before trusting a success.

---

## Persistent Sessions (CLI Mode)

To drive a journey by hand with individual CLI commands, start the daemon so every command shares one page.

```bash
cbrowser daemon start

cbrowser navigate "https://example.com"
cbrowser hover "Products"          # reveal a dropdown
cbrowser click "Pricing"           # click the revealed item
cbrowser fill "Email" "test@example.com"
cbrowser screenshot

cbrowser daemon stop
```

### Why Daemon Mode Matters

Without a daemon, each command opens its own browser and reloads the last URL (saved for an hour). Cookies and localStorage carry over; script variables, sessionStorage, scroll position, typed input and hover state do not. So a hover followed by a click on what it revealed fails without a daemon.

With the daemon:
- One browser and one page persist across commands
- Hover-then-click works
- Typed input and scroll position survive between commands

Give every command the same `CBROWSER_DATA_DIR`; commands find the daemon through it.

### Daemon Commands

| Command | Purpose |
|---------|---------|
| `cbrowser daemon start` | Start the persistent browser (`--timeout` idle minutes, default 30) |
| `cbrowser daemon stop` | Stop the daemon and close the browser |
| `cbrowser daemon status` | Check whether it is running (exits 1 when not) |

### Daemon-Supported Actions

These run in the daemon's browser: navigate, click, fill, hover, type, press, keyboard, drag, upload, screenshot, extract, run, scroll, evaluate, an open-ended capture, har, network and console. Commands that would open a second browser on the same profile (script, ai, explore, a11y, perf, visual, session save and load, reset) refuse until you stop the daemon.

### Recommended Workflow for Manual Cognitive Journeys

1. **Start the daemon** before beginning
2. **Navigate** to the starting URL
3. **Perceive**: `cbrowser screenshot` or `cbrowser extract headings` (also links, forms, images, text)
4. **Decide**: reason about the next action as the persona
5. **Execute**: `hover` + `click`, or `fill`
6. **Evaluate**: screenshot to check the result, update the state by the rules in `CognitiveState.md`
7. **Loop** until the goal is reached or a limit is crossed
8. **Stop the daemon** when done

### Example Manual Journey

```bash
# Initialize
cbrowser daemon start
cbrowser navigate "https://example.com"

# Step 1: Perceive
cbrowser screenshot
# [Look at the screenshot, reason about the page as the persona]

# Step 2: Execute (hover before clicking a dropdown item)
cbrowser hover "Products"
cbrowser click "Pricing"

# Step 3: Evaluate
cbrowser screenshot
# [Check the navigation worked]

# Continue until the goal or abandonment...

# Cleanup
cbrowser daemon stop
```

---

## Integration

- **CognitivePersonas.md**: trait definitions and per-persona values
- **CognitiveState.md**: state, update rules and abandonment in both engines
- **Personas.md**: the persona roster and custom personas
- **Journey.md**: non-cognitive journey workflow (simpler)
- **SessionManagement.md**: session persistence details

This workflow is the full cognitive simulation. For simpler persona-driven journeys without cognitive state tracking, use `Journey.md`.
