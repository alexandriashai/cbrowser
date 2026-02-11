# Cognitive Journey Tools

**Find out where users give up before they actually do.**

Cognitive journeys simulate real humans navigating your site — complete with patience that depletes, frustration that builds, and the moment they decide "this isn't worth it" and leave. These 6 tools let you experience your product through the minds of different user types.

---

## When to Use These Tools

- **Your conversion rate is mysteriously low** and analytics can't tell you why people abandon
- **You're launching a new feature** and want to know if real users can figure it out
- **You need to compare experiences** across different audience segments
- **You want to find friction** before your users feel it

---

## Tools

### `cognitive_journey_init`

**What it does**: Starts a cognitive journey session with a specific persona, goal, and starting point. Returns the persona's cognitive profile and initial state.

**Why you'd use it**: Begin simulating how a specific user type would approach your site.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `persona` | string | Yes | Persona ID (e.g., `first-timer`, `elderly-user`, `cognitive-adhd`) |
| `startUrl` | string | Yes | URL where the journey begins |
| `goal` | string | Yes | What the persona is trying to accomplish |
| `maxSteps` | number | No | Maximum actions before forcing stop. Default: 50 |

**Example**:
```json
{
  "persona": "first-timer",
  "startUrl": "https://example.com",
  "goal": "Create an account and make a purchase"
}
```

**Returns**: Session ID, persona profile (25 traits), initial cognitive state (patience, confusion, frustration at starting values).

---

### `cognitive_journey_update_state`

**What it does**: Updates the persona's cognitive state after each action. Tracks mood changes, calculates whether they would abandon, and generates inner monologue.

**Why you'd use it**: After each navigation step, report what happened and get the persona's reaction.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | Yes | Session ID from `cognitive_journey_init` |
| `action` | string | Yes | What action was just taken |
| `result` | string | Yes | What happened — success, failure, unexpected |
| `patienceChange` | number | No | How much patience changed (-1 to 1) |
| `confusionChange` | number | No | How much confusion changed (-1 to 1) |
| `frustrationChange` | number | No | How much frustration changed (-1 to 1) |
| `currentUrl` | string | No | Current page URL |

**Example**:
```json
{
  "sessionId": "journey_abc123",
  "action": "Clicked 'Sign Up' button",
  "result": "Page showed loading spinner for 8 seconds before form appeared",
  "patienceChange": -0.15,
  "confusionChange": 0.05,
  "frustrationChange": 0.10,
  "currentUrl": "https://example.com/signup"
}
```

**Returns**:
- `shouldAbandon`: boolean — would this persona leave?
- `abandonmentReason`: why they'd leave (if applicable)
- `innerMonologue`: what they're thinking ("This is taking forever...")
- `currentState`: updated patience/confusion/frustration values

---

### `cognitive_journey_autonomous` 🔒 Enterprise

**What it does**: Runs a complete journey autonomously with AI making all navigation decisions. No orchestration needed — just set the goal and watch.

**Why you'd use it**: Hands-off user simulation that generates complete friction reports and abandonment analysis.

> **Enterprise Feature** — Requires CBrowser Enterprise.
> Autonomous execution consumes Anthropic API credits for decision-making.
> [Learn about Enterprise →](/docs/Marketing-Suite/)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `persona` | string | Yes | Persona ID |
| `startUrl` | string | Yes | Starting URL |
| `goal` | string | Yes | What to accomplish |
| `maxSteps` | number | No | Max actions. Default: 50 |
| `maxTime` | number | No | Max seconds. Default: 300 |
| `vision` | boolean | No | Use screenshot analysis for decisions. Default: false |
| `headless` | boolean | No | Run without visible browser. Default: false |

**Example**:
```json
{
  "persona": "elderly-user",
  "startUrl": "https://bank.example.com",
  "goal": "Transfer $100 to savings account",
  "vision": true,
  "maxSteps": 30
}
```

**Returns**: Complete journey trace with every decision, friction points, screenshots, and final outcome.

---

### `compare_personas`

**What it does**: Run the same journey with multiple personas and compare their experiences side-by-side.

**Why you'd use it**: Understand how different user segments experience the same flow differently.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `personas` | array | Yes | List of persona IDs to compare |
| `startUrl` | string | Yes | Starting URL |
| `goal` | string | Yes | What to accomplish |
| `parallel` | boolean | No | Run journeys simultaneously. Default: false |

**Example**:
```json
{
  "personas": ["power-user", "first-timer", "elderly-user"],
  "startUrl": "https://example.com/checkout",
  "goal": "Complete purchase"
}
```

**Returns**: Comparison matrix showing success/failure, time taken, abandonment points, and friction experienced by each persona.

---

### `compare_personas_init`

**What it does**: Initialize a multi-persona comparison using the bridge workflow (no API key needed). Returns profiles for all personas ready for manual orchestration.

**Why you'd use it**: Run persona comparisons when you want Claude to orchestrate each step rather than autonomous execution.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `personas` | array | Yes | List of persona IDs |
| `startUrl` | string | Yes | Starting URL |
| `goal` | string | Yes | Goal to accomplish |

**Example**:
```json
{
  "personas": ["mobile-user", "impatient-user"],
  "startUrl": "https://example.com",
  "goal": "Find pricing information"
}
```

---

### `compare_personas_complete`

**What it does**: Finalize a persona comparison by aggregating all journey results and generating the comparison report.

**Why you'd use it**: After running individual journeys for each persona, compile the results.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `comparisonId` | string | Yes | Comparison ID from `compare_personas_init` |
| `results` | array | Yes | Array of journey results for each persona |

---

## Understanding Cognitive State

Every persona has three dynamic metrics that change throughout their journey:

| Metric | Range | What It Means |
|--------|-------|---------------|
| **Patience** | 0.0 - 1.0 | Willingness to keep trying. Depletes with delays, errors, confusion. |
| **Confusion** | 0.0 - 1.0 | How lost they feel. Increases with unclear UI, unexpected behavior. |
| **Frustration** | 0.0 - 1.0 | Emotional response to friction. Increases with repeated failures, dead ends. |

### Abandonment Triggers

A persona abandons when any of these occur:
- **Patience < 0.1** — "This is taking too long, I'm done"
- **Confusion > 0.8 for 30+ seconds** — "I have no idea what to do"
- **Frustration > 0.85** — "This is ridiculous"
- **No progress after 10+ steps** — "I'm not getting anywhere"
- **Same page visited 3+ times** — "I keep ending up here"

Different personas have different starting values and depletion rates. An impatient-user starts with 0.4 patience and loses it twice as fast as a power-user.

---

## Persona Quick Reference

| Persona | Patience | Confusion Tolerance | Key Trait |
|---------|----------|---------------------|-----------|
| `power-user` | High | Low (expects clarity) | Fast decisions, low reading |
| `first-timer` | Medium | Medium | Explores, reads more |
| `elderly-user` | High | High | Slow, thorough, easily confused by jargon |
| `impatient-user` | Very Low | Low | Abandons fast on any friction |
| `mobile-user` | Low | Medium | Fat-finger issues, small viewport |
| `cognitive-adhd` | Low | High | Skims, clicks fast, distracted easily |

See [Persona Index](/docs/Persona-Index/) for complete profiles.

---

## Related Documentation

- [Cognitive User Simulation](/docs/Cognitive-User-Simulation/) — Deep dive on how cognitive simulation works
- [Persona Index](/docs/Persona-Index/) — All 9 built-in personas
- [Multi-Persona Comparison](/docs/Multi-Persona-Comparison/) — Comparison workflows
- [Trait Index](/docs/Trait-Index/) — The 25 cognitive traits

---

*Last updated: v17.6.0*
