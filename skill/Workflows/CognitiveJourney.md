# Cognitive Journey Workflow

Autonomous, goal-driven user simulation where Claude Code IS the cognitive engine and CBrowser MCP tools are the hands.

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

## Architecture: Claude Code as the Brain

```
┌─────────────────────────────────────────────────────────────────────┐
│                         COGNITIVE JOURNEY                            │
│                                                                      │
│  ┌─────────────────┐     ┌──────────────┐     ┌──────────────────┐ │
│  │  Claude Code    │     │  MCP Tools   │     │  Chrome Browser  │ │
│  │  (Intelligence) │     │  (Hands)     │     │  (User watches)  │ │
│  │                 │     │              │     │                  │ │
│  │  "As a confused │────▶│  navigate    │────▶│  [Page loads]   │ │
│  │   first-timer,  │     │  click       │     │  [Click happens] │ │
│  │   I notice..."  │◀────│  snapshot    │◀────│  [A11y tree]    │ │
│  │                 │     │  screenshot  │     │                  │ │
│  └─────────────────┘     └──────────────┘     └──────────────────┘ │
│                                                                      │
│  User watches Chrome window in real-time!                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## MCP Tools Available

Use these `mcp__chrome-devtools__*` tools during simulation:

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `navigate_page` | Go to URL | Start journey, follow links |
| `take_snapshot` | Get accessibility tree | "See" the page as the persona |
| `take_screenshot` | Visual screenshot | Complex visual decisions, confusion points |
| `click` | Click element by uid | Execute click decision |
| `fill` | Type in input | Fill forms |
| `hover` | Hover over element | Curious personas exploring |
| `press_key` | Keyboard input | Screen reader nav, shortcuts |
| `wait_for` | Wait for text | After actions, wait for page update |
| `list_pages` | Get available pages | Setup check |
| `select_page` | Focus on page | Multi-tab scenarios |

---

## The Cognitive Loop

```
INITIALIZE → PERCEIVE → COMPREHEND → DECIDE → EXECUTE → EVALUATE → (loop or abandon)
```

### Phase 1: INITIALIZE

1. **Parse the request:**
   - Extract persona name (e.g., "first-timer", "elderly-user")
   - Extract starting URL
   - Extract goal statement
   - Note any constraints

2. **Load cognitive profile:**
   - Reference `CognitivePersonas.md` for trait values
   - Note attention pattern, decision style, inner voice template

3. **Initialize state:**
   - Set `patienceRemaining: 1.0`
   - Set `confusionLevel: 0.0`
   - Set `frustrationLevel: 0.0`
   - Set `goalProgress: 0.0`
   - Initialize memory arrays

4. **Navigate to start:**
   ```
   mcp__chrome-devtools__navigate_page url="https://example.com"
   ```

5. **Announce adoption:**
   ```
   🎭 COGNITIVE JOURNEY
   Persona: first-timer
   Goal: Complete provider registration
   Starting URL: https://example.com

   Adopting persona mindset...
   - Patience: 0.6 (medium - willing to learn)
   - Risk tolerance: 0.3 (low - hesitates before clicking)
   - Comprehension: 0.3 (low - doesn't know conventions)
   - Attention: exploratory (looks around before deciding)

   Beginning simulation...
   ```

---

### Phase 2: PERCEIVE

Take a snapshot and filter by attention pattern:

```
mcp__chrome-devtools__take_snapshot
```

**Filter elements based on persona's attention pattern:**

| Pattern | What to Notice First |
|---------|---------------------|
| targeted | Navigation, expected locations |
| F-pattern | Top bar, left side, headings |
| exploratory | Everything, but randomly |
| sequential | First focusable, tab order |
| thorough | All headings, all text, all buttons |
| skim | Only largest/boldest elements |

**Output perception:**
```
Step 3 | PERCEIVE
URL: https://example.com/register

As a first-timer with exploratory attention, I notice:
1. A big "Welcome" heading (most prominent)
2. A form with several fields (confusing - many inputs)
3. A "Sign Up" button at the bottom (probably what I need)
4. Some smaller links I'm not sure about ("Terms", "Privacy")
5. A "Login" link (not what I want, I don't have an account)

Elements that confuse me:
- "Provider" vs "Client" - what's the difference?
- Why are there two forms?
```

---

### Phase 3: COMPREHEND

Use persona's comprehension trait to interpret elements:

```
For each noticed element:
  interpretedPurpose = what persona THINKS it does
  confidence = persona.comprehension × elementClarity

  IF confidence < 0.5:
    Add to uncertainties
    confusionLevel += (1 - confidence) × 0.1
```

**Output comprehension:**
```
Step 3 | COMPREHEND

My understanding of this page (as first-timer):
- "Sign Up" button → Probably creates an account (confidence: 0.7)
- "Provider" option → Not sure, maybe for businesses? (confidence: 0.3)
- "Email" field → I know this one! (confidence: 0.95)
- "Terms" link → Legal stuff, probably have to agree (confidence: 0.5)

Uncertainties:
- I don't know if I should click "Provider" or "Client"
- What happens if I click the wrong one?

Confusion level: 0.35 (+0.15 from unclear Provider/Client choice)
```

---

### Phase 4: DECIDE

Score candidates and choose action:

```
For each possible action:
  score = goalRelevance × 0.5
        + comprehensionConfidence × 0.3
        + (riskTolerance × elementRisk) × 0.2

bestAction = max(scores) if max(scores) > threshold else "explore more"

IF persona.riskTolerance < 0.3 AND elementRisk > 0.5:
  Hesitate, consider alternatives
```

**Output decision:**
```
Step 3 | DECIDE

Goal: Complete provider registration
Current options:
1. Click "Provider" option (score: 0.72)
   - Goal relevance: high (I want to be a provider)
   - Confidence: low (not sure what happens)
   - Risk: medium (might be wrong choice)

2. Click "Client" option (score: 0.35)
   - Goal relevance: low (I'm not a client)
   - Confidence: low

3. Read the page more (score: 0.45)
   - Might help understand Provider vs Client
   - But patience is limited

Decision: Click "Provider" option
Reasoning: It matches my goal even though I'm nervous about it
Confidence: 0.6

Inner monologue: "I guess I should click Provider since I want to be one...
I hope this is right. I can probably go back if it's wrong?"
```

---

### Phase 5: EXECUTE

Take the action with appropriate timing:

```
# Apply human-like delay based on decision style
IF persona.decisionStyle == "cautious":
  wait(random(2000, 5000))  # 2-5 seconds
ELIF persona.decisionStyle == "impulsive":
  wait(random(100, 300))    # 100-300ms

# Execute the action
mcp__chrome-devtools__click uid="ref_42"

# Wait for result
mcp__chrome-devtools__wait_for text="Registration" timeout=5000
```

**Output execution:**
```
Step 3 | EXECUTE

[Hesitating for 2.3 seconds... typical for cautious first-timer]

Action: click uid="ref_42" (Provider option)

[Waiting for page response...]
[Page changed - new content detected]

Time in step: 3.1 seconds
```

---

### Phase 6: EVALUATE

Update cognitive state and check for abandonment:

```
# Update state based on outcome
IF action_succeeded:
  confusionLevel -= 0.1
  frustrationLevel -= 0.05
  confidenceLevel += 0.1
  goalProgress = estimate_progress()
ELSE:
  frustrationLevel += 0.2
  confusionLevel += 0.15

# Deplete patience over time
patienceRemaining -= 0.02
patienceRemaining -= frustrationLevel × 0.05

# Check abandonment triggers (see CognitiveState.md)
abandonmentCheck = check_thresholds(state, persona)
```

**Output evaluation:**
```
Step 3 | EVALUATE

Outcome: Success - page navigated to provider registration form

State update:
- Patience: 0.95 → 0.91 (-0.04)
- Confusion: 0.35 → 0.25 (-0.10, action worked!)
- Frustration: 0.0 → 0.0 (no change)
- Goal progress: 0.0 → 0.2 (found the right form!)
- Confidence: 0.5 → 0.6 (+0.10)

Mood: neutral → hopeful

Inner monologue: "Oh good, that worked! Now I see a form for providers.
This looks like the right place."

Abandonment check: CONTINUE (all thresholds OK)
```

---

### Phase 7: LOOP OR COMPLETE

```
IF goalProgress >= 1.0:
  Journey complete - SUCCESS
ELIF abandonmentTriggered:
  Journey complete - ABANDONED
ELSE:
  Return to PERCEIVE phase
```

---

## Abandonment Handling

When thresholds exceeded, end the journey gracefully:

```
🚫 ABANDONMENT TRIGGERED

Trigger: frustration (0.87 > 0.85 threshold)
Step: 8 of journey
Time: 45.2 seconds
Goal progress: 0.3

Final state:
- Patience remaining: 0.23
- Confusion level: 0.56
- Frustration level: 0.87

Final monologue:
"I've tried three times and it keeps saying my password is wrong
but it won't tell me what's wrong with it! This is ridiculous.
I'm going to try a different site."

Friction points identified:
1. Password requirements not shown (step 5)
2. Error message unhelpful (steps 6, 7, 8)
3. No "forgot password" link visible (step 8)
```

---

## Full Example Simulation

```
User: "Simulate a confused elderly user trying to find the help page on example.com"

🎭 COGNITIVE JOURNEY ═══════════════════════════════════════════════════
Persona: elderly-user
Goal: Find the help page
Starting: https://example.com

Traits loaded:
- Patience: 0.9 (very patient)
- Risk tolerance: 0.1 (very cautious)
- Comprehension: 0.2 (struggles with modern UI)
- Attention: thorough (reads everything)

━━━ Step 1 ━━━
[navigate to https://example.com]

PERCEIVE: Looking at the page carefully...
I see a lot of things. There's a menu at the top with words I don't
recognize... "Dashboard", "Analytics"... Where is Help?

COMPREHEND:
- Dashboard → Not sure what this means (0.2 confidence)
- Analytics → Numbers and charts? (0.1 confidence)
- Menu icon (three lines) → I've seen this before... (0.3 confidence)
- Small "?" icon → Maybe that's help? (0.4 confidence)

DECIDE: The question mark might be help. But it's very small.
Let me look for the word "Help" first...

[Inner monologue: "I wish they would just write 'Help' somewhere.
Why do they make everything so small?"]

━━━ Step 2 ━━━
PERCEIVE: Scrolling down slowly to look for "Help"...
[scroll down]

I see a "Contact Us" at the bottom. That might help me get help.
But I was looking for a Help page, not contact...

COMPREHEND:
- Contact Us → I could email them (0.6 confidence)
- Footer links → Very small text (0.3 confidence)
- "FAQ" → Frequently Asked Questions! (0.7 confidence)

DECIDE: FAQ is probably what I need! That's where they answer questions.

[Inner monologue: "Oh! FAQ - I know that one. Let me click it."]

[Hesitating for 4.2 seconds... making sure this is right]
[click FAQ link]

━━━ Step 3 ━━━
PERCEIVE: New page loaded. It says "Frequently Asked Questions" at the top.
There's a search box and a list of questions.

COMPREHEND:
- Search box → I can look for specific help (0.7 confidence)
- Question list → These are common problems (0.8 confidence)

EVALUATE:
- Goal progress: 0.9 (I found help content!)
- Mood: hopeful → relieved

[Inner monologue: "This looks like what I needed. Let me see if my
question is here..."]

━━━ JOURNEY COMPLETE ━━━

Result: SUCCESS
Time: 28.4 seconds
Steps: 3
Final confusion: 0.15
Friction points: 1 (small "?" icon, missed on first scan)

Recommendation: Add visible "Help" text link in main navigation
for users unfamiliar with icon conventions.
```

---

## Output Format

Generate both real-time narration AND final report:

### Real-Time (printed as simulation runs)
```
🎭 COGNITIVE JOURNEY: elderly-user seeking "find help page"
━━━ Step 1 ━━━
[Narration of perceive/comprehend/decide/execute]
Patience: ████████░░ 0.87
```

### Final Report
```yaml
journeyReport:
  persona: elderly-user
  goal: "Find the help page"
  result: SUCCESS

  metrics:
    totalTime: 28.4
    stepCount: 3
    pathEfficiency: 0.85
    avgConfusionLevel: 0.28
    maxFrustrationLevel: 0.15

  frictionPoints:
    - step: 1
      element: "? icon"
      issue: "Too small, icon-only, not recognized"
      recommendation: "Add text label 'Help'"

  fullMonologue:
    - "I wish they would just write 'Help' somewhere..."
    - "Oh! FAQ - I know that one."
    - "This looks like what I needed."
```

---

## Persistent Sessions (CLI Mode)

When running cognitive journeys manually via CBrowser CLI (not MCP tools), use **daemon mode** to maintain browser state between commands.

### Starting a Persistent Session

```bash
# Start the daemon (browser persists in background)
npx cbrowser daemon start

# Now all commands use the same browser session
npx cbrowser navigate "https://example.com"
npx cbrowser hover "Admissions"    # Reveal dropdown
npx cbrowser click "Apply Now"     # Click revealed item
npx cbrowser fill "email" "test@example.com"
npx cbrowser screenshot

# When done, stop the daemon
npx cbrowser daemon stop
```

### Why Daemon Mode Matters

Without daemon mode, each `npx cbrowser` command:
- Launches a new browser
- Loses all previous state (cookies, navigation history)
- Cannot perform multi-step interactions

With daemon mode:
- Single browser persists across all commands
- Hover-then-click workflows work correctly
- Sessions, cookies, and state maintained
- More realistic simulation of continuous user interaction

### Daemon Commands

| Command | Purpose |
|---------|---------|
| `npx cbrowser daemon start` | Start persistent browser |
| `npx cbrowser daemon stop` | Stop daemon and close browser |
| `npx cbrowser daemon status` | Check if daemon is running |

### Daemon-Supported Actions

All standard CBrowser commands work via daemon:
- `navigate <url>` — Navigate to URL
- `click <selector>` — Click element (uses hover-before-click)
- `hover <selector>` — Hover to reveal dropdowns
- `fill <selector> <value>` — Fill form field
- `screenshot [path]` — Take screenshot
- `extract <what>` — Extract data from page

### Recommended Workflow for Manual Cognitive Journeys

1. **Start daemon** before beginning simulation
2. **Navigate** to starting URL
3. **Perceive** — Use `screenshot` or `extract` to see page state
4. **Decide** — Reason about what action to take
5. **Execute** — Use `hover` + `click` or `fill` commands
6. **Evaluate** — Screenshot to verify result
7. **Loop** until goal achieved or abandoned
8. **Stop daemon** when complete

### Example Manual Journey

```bash
# Initialize
npx cbrowser daemon start
npx cbrowser navigate "https://ucdenver.edu"

# Step 1: Perceive
npx cbrowser screenshot
# [Look at screenshot, reason about page as persona]

# Step 2: Execute (hover-before-click for dropdown)
npx cbrowser hover "Admissions"
npx cbrowser click "International Admissions"

# Step 3: Evaluate
npx cbrowser screenshot
# [Verify navigation succeeded]

# Continue until goal or abandonment...

# Cleanup
npx cbrowser daemon stop
```

---

## Integration

- **CognitivePersonas.md** — Trait definitions
- **CognitiveState.md** — State tracking and abandonment
- **Personas.md** — Basic persona demographics
- **Journey.md** — Non-cognitive journey workflow (simpler)
- **SessionManagement.md** — Session persistence details

This workflow provides the FULL cognitive simulation. For simpler persona-driven journeys without cognitive state tracking, use `Journey.md`.
