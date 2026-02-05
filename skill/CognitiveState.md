# Cognitive State Tracking

Runtime state management for cognitive user simulation. Tracks patience, confusion, frustration, and determines when a simulated user abandons.

---

## State Variables

Track these during every cognitive journey:

```yaml
cognitiveState:
  # Core emotional state (0.0 to 1.0)
  patienceRemaining: 1.0      # Starts full, depletes over time
  confusionLevel: 0.0         # Builds when encountering unclear UI
  frustrationLevel: 0.0       # Builds on failures and confusion

  # Goal progress
  goalProgress: 0.0           # 0.0 = not started, 1.0 = achieved
  confidenceLevel: 0.5        # Belief they're on the right path

  # Memory
  memory:
    pagesVisited: []          # URLs visited
    actionsAttempted: []      # What they've tried
    errorsEncountered: []     # Failures and their context
    elementsClicked: []       # Elements interacted with
    backtrackCount: 0         # Times they went "back"

  # Timing
  timeElapsed: 0              # Seconds since journey start
  stepCount: 0                # Number of actions taken

  # Emotional narrative
  currentMood: "neutral"      # neutral, hopeful, confused, frustrated, defeated
  innerMonologue: []          # Running thoughts
```

---

## State Update Rules

### After Each Action

```
# Patience depletes over time and with frustration
patienceRemaining -= 0.02                    # Base time cost
patienceRemaining -= frustrationLevel × 0.05 # Frustration accelerates

# Confusion builds from unclear elements
IF element_purpose_unclear:
  confusionLevel += (1 - persona.comprehension) × 0.15

IF element_worked_as_expected:
  confusionLevel -= 0.1
  confusionLevel = max(0, confusionLevel)

# Frustration builds from confusion and failures
IF action_failed:
  frustrationLevel += 0.2

IF confused_for_long:
  frustrationLevel += confusionLevel × 0.1

# Frustration naturally decays on success
IF action_succeeded:
  frustrationLevel -= 0.05
  frustrationLevel = max(0, frustrationLevel)

# Confidence updates
IF progress_toward_goal:
  confidenceLevel += 0.1
IF going_in_circles:
  confidenceLevel -= 0.15
```

---

## Abandonment Thresholds

The simulated user ABANDONS when ANY threshold is exceeded:

| Trigger | Threshold | Abandonment Message |
|---------|-----------|---------------------|
| **Patience depleted** | `patienceRemaining < 0.1` | "This is taking too long. I give up." |
| **Too confused** | `confusionLevel > 0.8` for 30+ seconds | "I have no idea what I'm supposed to do here." |
| **Too frustrated** | `frustrationLevel > 0.85` | "This is so frustrating! I'm done." |
| **No progress** | 10+ steps AND `goalProgress < 0.1` | "I'm not getting anywhere with this." |
| **Stuck in loop** | Same page 3+ times | "I keep ending up in the same place." |
| **Time limit** | `timeElapsed > 120s` (configurable) | "I've spent too much time on this." |

### Abandonment Logic

```python
def check_abandonment(state, persona):
    # Patience check
    if state.patienceRemaining < 0.1:
        return ("patience", "This is taking too long. I give up.")

    # Confusion check (sustained)
    if state.confusionLevel > 0.8 and state.confusion_duration > 30:
        return ("confusion", "I have no idea what I'm supposed to do here.")

    # Frustration check
    if state.frustrationLevel > 0.85:
        return ("frustration", "This is so frustrating! I'm done.")

    # Progress check
    if state.stepCount > 10 and state.goalProgress < 0.1:
        return ("no_progress", "I'm not getting anywhere with this.")

    # Loop detection
    page_visits = Counter(state.memory.pagesVisited[-10:])
    if any(count >= 3 for count in page_visits.values()):
        return ("loop", "I keep ending up in the same place.")

    return None  # Continue journey
```

---

## Mood Transitions

Current mood affects inner monologue and decision-making:

```
neutral → hopeful:     On first sign of progress
neutral → confused:    When confusionLevel > 0.3
confused → frustrated: When frustrationLevel > 0.4
frustrated → defeated: When frustrationLevel > 0.7
Any → relieved:        When goal achieved or clear progress
```

### Mood-Based Monologue Templates

| Mood | Example Monologue |
|------|-------------------|
| **neutral** | "Okay, let me look at this page..." |
| **hopeful** | "Oh, I think I found it! This looks right." |
| **confused** | "Wait, what? I don't understand what this means." |
| **frustrated** | "Come on! Why isn't this working?!" |
| **defeated** | "I don't think I can do this. This is too hard." |
| **relieved** | "Finally! That was harder than it should be." |

---

## State Snapshot Format

At each step, capture:

```yaml
snapshot:
  step: 7
  timestamp: "2026-02-04T22:45:30Z"
  url: "https://example.com/checkout"

  state:
    patienceRemaining: 0.62
    confusionLevel: 0.35
    frustrationLevel: 0.28
    goalProgress: 0.4
    confidenceLevel: 0.55
    currentMood: "confused"

  perception:
    elementsNoticed: ["Submit Order button", "Price total", "Edit cart link"]
    elementFocused: "Submit Order button"
    uncertainties: ["Not sure if this is final"]

  decision:
    action: "click"
    target: "Submit Order button"
    reasoning: "This seems to be what I need to complete my goal"
    confidence: 0.6
    alternatives:
      - action: "click Edit cart"
        rejectionReason: "That would take me backwards"

  monologue: "I think this is the button to finish... I hope it doesn't charge me twice."
```

---

## Metrics Collection

Track for final report:

```yaml
journeyMetrics:
  # Outcome
  goalAchieved: false
  abandonmentReason: "frustration"
  finalMonologue: "This is so frustrating! I'm done."

  # Path metrics
  totalTime: 67.4
  stepCount: 12
  pathEfficiency: 0.4  # Optimal steps / actual steps

  # State evolution
  avgConfusionLevel: 0.42
  maxFrustrationLevel: 0.86
  patienceAtEnd: 0.23
  backtrackCount: 3
  timeInConfusion: 28.5

  # Friction points
  frictionEvents:
    - step: 4
      type: "unclear_button"
      element: "Continue"
      frustrationIncrease: 0.15
      monologue: "Continue to where? What does this do?"
    - step: 8
      type: "form_error"
      element: "Email field"
      frustrationIncrease: 0.25
      monologue: "What's wrong with my email? It looks fine to me!"

  # Confusion points (for UX improvement)
  confusionPoints:
    - url: "https://example.com/checkout/shipping"
      element: "Shipping options"
      level: 0.65
      monologue: "Which one am I supposed to pick? They all look the same."
      screenshot: "confusion-001.png"
```

---

## Persona-Specific Thresholds

Adjust thresholds based on persona traits:

```yaml
# Impatient user - lower thresholds
adjustedThresholds:
  patienceAbandon: 0.2       # Gives up sooner
  frustrationAbandon: 0.7    # Lower tolerance
  timeLimit: 60              # Half the time
  stepLimit: 8               # Fewer attempts

# Elderly user - higher patience, lower confusion tolerance
adjustedThresholds:
  patienceAbandon: 0.05      # Very patient
  frustrationAbandon: 0.8    # Still gives up if too frustrated
  confusionAbandon: 0.6      # Lower tolerance for confusion
  timeLimit: 300             # More time allowed
```

---

## Integration Points

This state template is used by:

1. **CognitiveJourney.md workflow** — Updates state after each action
2. **Claude Code reasoning** — References state when making decisions
3. **Report generation** — Final metrics from state history

The cognitive state is the "working memory" of the simulation.
