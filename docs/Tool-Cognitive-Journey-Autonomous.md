> **This documentation is no longer maintained here.**
>
> For the latest version, please visit: **[Cognitive Journey Autonomous](https://cbrowser.ai/docs/Tool-Cognitive-Journey-Autonomous)**

---

# Cognitive Journey Autonomous

**🔒 Enterprise Feature**

**Set a goal. Watch a simulated user try to achieve it. Learn where they give up.**

`cognitive_journey_autonomous` runs a complete user journey with AI making all navigation decisions. No orchestration needed — just specify a persona, goal, and starting URL. The AI experiences your site the way a real user would, complete with frustration, confusion, and the moment they decide to leave.

---

## Quick Start

```json
{
  "persona": "first-timer",
  "startUrl": "https://example.com",
  "goal": "Sign up for a free trial",
  "maxSteps": 30,
  "vision": true
}
```

**What happens**:
1. AI loads the persona's cognitive profile (25 traits)
2. AI perceives the page as that persona would
3. AI decides what action to take based on persona's characteristics
4. After each action, cognitive state updates (patience, confusion, frustration)
5. If any metric crosses abandonment threshold, journey ends
6. Final report shows exactly where and why they gave up

---

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `persona` | string | Yes | — | Persona ID (e.g., `first-timer`, `elderly-user`, `cognitive-adhd`) |
| `startUrl` | string | Yes | — | URL where the journey begins |
| `goal` | string | Yes | — | What the persona is trying to accomplish |
| `maxSteps` | number | No | 50 | Maximum actions before stopping |
| `maxTime` | number | No | 300 | Maximum time in seconds |
| `vision` | boolean | No | false | Send screenshots to AI for visual analysis |
| `headless` | boolean | No | false | Run without visible browser window |

---

## Vision Mode

When `vision: true`, the AI receives screenshots at each step, enabling:

- **Understanding visual layouts** that aren't captured in DOM text
- **Navigating dropdown menus** that require hover states
- **Reading non-semantic content** (images with text, icons without labels)
- **Perceiving visual hierarchy** the way humans do

Vision mode consumes more API credits but dramatically improves accuracy on complex sites.

---

## Use Cases

### 1. Onboarding Flow Validation

**Goal**: Verify that new users can complete signup without confusion.

```json
{
  "persona": "first-timer",
  "startUrl": "https://app.example.com",
  "goal": "Create an account and reach the dashboard",
  "vision": true
}
```

**What you learn**: Where first-timers get lost, which steps deplete patience, what causes confusion.

---

### 2. Accessibility Impact Testing

**Goal**: Understand how accessibility issues affect real task completion.

```json
{
  "persona": "motor-tremor",
  "startUrl": "https://example.com/checkout",
  "goal": "Complete a purchase",
  "vision": true,
  "maxSteps": 40
}
```

**What you learn**: Which interactions are impossible with motor impairment, where the user gives up.

---

### 3. Mobile UX Validation

**Goal**: Test if the mobile experience works for impatient users.

```json
{
  "persona": "impatient-user",
  "startUrl": "https://m.example.com",
  "goal": "Find pricing information"
}
```

**What you learn**: Whether navigation is fast enough for users with low patience tolerance.

---

### 4. Competitive Research

**Goal**: See how different user types experience a competitor's site.

```json
{
  "persona": "enterprise-buyer",
  "startUrl": "https://competitor.com",
  "goal": "Request a demo",
  "vision": true
}
```

**What you learn**: Friction points in their conversion funnel that you can avoid.

---

## How It Works

### Decision-Making Process

At each step, the AI:

1. **Perceives the page** — What elements are visible? What can be interacted with?
2. **Applies persona traits** — A curious user explores sidebars. An impatient user seeks the fastest path.
3. **Evaluates options** — Rank possible actions by likelihood of achieving goal
4. **Makes a decision** — Choose action based on persona's risk tolerance, comprehension, etc.
5. **Updates state** — Adjust patience, confusion, frustration based on what happened

### Abandonment Logic

The persona abandons when:

| Trigger | Threshold | Inner Monologue |
|---------|-----------|-----------------|
| Patience depleted | < 0.1 | "This is taking forever, I'm done." |
| Too confused | > 0.8 for 30s | "I have no idea what to do here." |
| Too frustrated | > 0.85 | "This is ridiculous." |
| No progress | 10+ steps, < 0.1 progress | "I'm not getting anywhere." |
| Stuck in loop | Same page 3+ times | "I keep ending up back here." |

---

## Output

```json
{
  "journeyId": "journey_abc123",
  "persona": "first-timer",
  "goal": "Sign up for a free trial",
  "outcome": "abandoned",
  "goalAchieved": false,
  "totalSteps": 18,
  "totalTime": 142,
  "abandonmentPoint": {
    "url": "https://example.com/signup/step-2",
    "action": "Attempted to fill 'Company Size' dropdown",
    "reason": "confusion_threshold_exceeded",
    "innerMonologue": "I don't know what to pick here. The options don't match my situation."
  },
  "finalState": {
    "patience": 0.23,
    "confusion": 0.82,
    "frustration": 0.67
  },
  "frictionPoints": [
    {
      "step": 5,
      "url": "https://example.com/signup",
      "issue": "Password requirements unclear until submission",
      "patienceImpact": -0.12
    },
    {
      "step": 12,
      "url": "https://example.com/signup/step-2",
      "issue": "Dropdown options don't include 'Individual/Freelancer'",
      "confusionImpact": 0.25
    }
  ],
  "decisionTrace": [
    {
      "step": 1,
      "thought": "I need to find where to sign up",
      "action": "click",
      "target": "Get Started button",
      "confidence": 0.9
    }
    // ... full trace of every decision
  ],
  "screenshots": [
    {
      "step": 12,
      "label": "abandonment_point",
      "base64": "..."
    }
  ]
}
```

---

## Tips & Best Practices

### Choose the Right Persona

| If you want to test... | Use this persona |
|------------------------|------------------|
| General usability | `first-timer` |
| Speed and efficiency | `power-user` or `impatient-user` |
| Mobile experience | `mobile-user` |
| Accessibility | `motor-tremor`, `low-vision`, `cognitive-adhd` |
| Enterprise sales funnel | `enterprise-buyer` |
| Consumer checkout | `impulse-shopper` or `price-researcher` |

### Set Appropriate Limits

- **Simple flows**: `maxSteps: 20`, `maxTime: 120`
- **Complex flows**: `maxSteps: 50`, `maxTime: 300`
- **Exploratory**: `maxSteps: 100`, `maxTime: 600`

### Interpret Results

- **Goal achieved quickly** → Good UX for this persona
- **Goal achieved with high frustration** → Success but poor experience
- **Abandoned early** → Critical friction point
- **Abandoned late** → Death by a thousand cuts

---

## Why This Requires Enterprise

`cognitive_journey_autonomous` runs AI decision-making at every step, which:

1. **Consumes Anthropic API credits** — Each step requires AI inference
2. **Requires secure API key storage** — Keys must be managed properly
3. **Uses significant compute** — Vision mode processes screenshots

Demo users can still run cognitive journeys using the bridge workflow (`cognitive_journey_init` + `cognitive_journey_update_state`), where Claude orchestrates each step manually.

[Contact for Enterprise →](mailto:alexandria.shai.eden@gmail.com)

---

## Related Tools

- [`cognitive_journey_init`](/docs/Tools-Cognitive-Journeys/) — Start orchestrated journeys
- [`compare_personas`](/docs/Tools-Cognitive-Journeys/) — Compare multiple personas
- [`empathy_audit`](/docs/Tool-Empathy-Audit/) — Accessibility-focused simulation

---

*Last updated: v17.6.0*
