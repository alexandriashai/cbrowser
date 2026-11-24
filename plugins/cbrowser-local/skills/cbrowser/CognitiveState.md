# Cognitive State Tracking

Runtime state for cognitive user simulation: patience, confusion, frustration, progress, and the rules that decide when a simulated user abandons.

Two engines keep this state, with different rules:

| Engine | Entry points | Who decides each step | API key |
|--------|-------------|----------------------|---------|
| Autonomous journey | `cbrowser cognitive-journey`, `compare-personas`, `competitive-benchmark`, `explore` | CBrowser calls Claude every step | Anthropic API key required |
| MCP-driven journey | `cognitive_journey_init`, then `cognitive_journey_update_state` after each action | The calling model (for example Claude Code) | None |

All numbers below are registered parameters (`src/visual/provenance/journey.ts` and `journey-mcp.ts`). Each was set by hand; the registry says so and names what measurement would set it. Treat them as consistent hypotheses, not findings about people.

---

## State Variables

The `CognitiveState` type (`src/types.ts`):

```yaml
cognitiveState:
  patienceRemaining: 1.0      # starts full, depletes
  confusionLevel: 0.0         # 0 clear, 1 completely lost
  frustrationLevel: 0.0       # 0 calm, 1 very frustrated
  goalProgress: 0.0           # 0 not started, 1 achieved
  confidenceLevel: 0.5        # belief they are on the right path
  currentMood: "neutral"      # neutral | hopeful | confused | frustrated | defeated | relieved
  memory:
    pagesVisited: []
    actionsAttempted: []      # { action, target, success }
    errorsEncountered: []     # { error, context }
    backtrackCount: 0
  timeElapsed: 0              # seconds
  stepCount: 0
  # Set by the autonomous journey:
  decisionFatigue: { decisionsMade, fatigueLevel, lastDecisionComplexity, choosingDefaults }
  cognitiveMode: ...          # fast or slow (dual-process)
  scanPattern: ...            # how much of the viewport is scanned under load
  peripheralVision: ...       # visual field narrowed by stress
  habituation: ...            # banner blindness
  emotionalState: ...         # anxiety, frustration, confusion, boredom, satisfaction, excitement, ...
  emotionalJourney: []        # emotional events
```

The inner monologue is not part of the state; the journey result carries it as `fullMonologue`.

---

## State Update Rules

### MCP-driven: `cognitive_journey_update_state`

The tool takes `currentState`, `actionResult` (`success`, `wasConfusing`, `progressMade`, `wentBack`), `personaTraits` (`patience`, `riskTolerance`, `comprehension`, `persistence`) and optional `personaValues`, and returns `newState`:

```
patienceRemaining -= 0.02                                  # every step
patienceRemaining -= frustrationLevel x 0.05 x achievement

IF success:
  confusionLevel   -= 0.1 x stimulation   (floor 0)
  frustrationLevel -= 0.05                (floor 0)
  IF progressMade:
    confidenceLevel += 0.1 x achievement  (cap 1)
    goalProgress    += 0.1                (cap 1)
ELSE:
  frustrationLevel += 0.2 x security      (cap 1)

IF wasConfusing:
  confusionLevel += (1 - comprehension) x 0.15 x conformity
IF wentBack:
  confidenceLevel -= 0.15 x security

stepCount += 1
timeElapsed += 2            # the tool never sees a clock
```

The value multipliers come from Schwartz values in `personaValues` (`security`, `stimulation`, `achievement`, `conformity`, ...): `1 + (value - 0.5) x 0.4`, so 0.8 to 1.2, and 1.0 when no values are passed.

### Autonomous journey

Here the emotional state is the single source of truth. Each step the model reports a mood, a new confusion and frustration, and the progress it believes it made. Those reports are signals: they fire emotional triggers (error, setback, clarity, progress, success, time pressure), the emotions then decay toward baseline at rates set by the persona's traits (high comprehension sheds confusion faster), and the simple fields are derived from the result (`deriveSimplifiedState` in `src/cognitive/emotions.ts`):

- `confusionLevel` and `frustrationLevel` are the emotional state's confusion and frustration
- `patienceRemaining` = 1 - (strongest negative emotion x drain) + positive buffer, where the drain is larger for a low-patience persona and satisfaction and excitement buffer it
- `goalProgress` only moves after a real action: at most 0.05 for an in-page action, the model's full claim when the page actually navigated, and freely downward
- `currentMood` is the mood the model reported

---

## Abandonment Thresholds

### Autonomous journey

Checked after every step (`checkAbandonmentTriggers` in `src/cognitive/index.ts`). Trait bands: low comprehension < 0.4; low patience < 0.3, high > 0.7; low persistence < 0.3, high > 0.7.

| Reason | Fires when | Message |
|--------|-----------|---------|
| patience | `patienceRemaining < 0.1` | "This is taking too long. I give up." |
| confusion | `confusionLevel > 0.9` (0.75 for low comprehension) | "I have no idea what to do. This is too confusing." |
| frustration | `frustrationLevel > 0.95` (0.8 for low patience) | "This is so frustrating! I'm done." |
| decision fatigue | fatigue > 0.85 (0.95 high persistence, 0.7 low persistence) | "Too many choices... I can't think straight anymore. Maybe later." |
| no progress | more than 15 steps (20 for high persistence) and `goalProgress < 0.1` | "I'm not making any progress. This isn't working." |
| emotional | anxiety > 0.85 and frustration > 0.8 and patience < 0.3; or an emotional modifier above 1.3 raises the patience floor past what is left | "This is too stressful. I need to take a break." |
| timeout | elapsed time > the time limit, or the browser stops responding | "I've spent too long on this (Ns). Giving up." |

The values `abandonmentReason` takes:

```
patience | confusion | frustration | decision_fatigue | no_progress | emotional | timeout
```

The time limit is `--max-time` (default 120 s). A caller of the library that passes no limit gets 120 s, 180 s for a high-patience persona, 60 s for a low-patience one. Reaching `--max-steps` (default 50) ends the run without an abandonment reason. Decision fatigue grows by `0.05 x ln(options + 1)` per decision (a fill counts as 5 options, a navigation as 8, anything else as 3); above 0.7 the persona starts choosing defaults.

The result type still lists a loop reason, but nothing fires it: loop detection was removed because it could never trigger.

How a run succeeds: the model claims the goal and quotes evidence. The evidence is marked `[VERIFIED]` when at least 30% of its words appear in the page text, `[UNVERIFIED]` otherwise; the claim ends the run as achieved either way. A run that ends without a claim gets a closing evaluation of the final page, which can mark it achieved and clear an abandonment reason.

### MCP-driven journey

`cognitive_journey_update_state` checks three limits and returns `shouldAbandon`, `abandonmentReason` and `abandonmentMessage`:

| Reason | Fires when | Message |
|--------|-----------|---------|
| patience | `patienceRemaining < 0.1` | "This is taking too long. I give up." |
| frustration | `frustrationLevel > 0.85 / security` | "This is so frustrating! I'm done." (high `security` value: "This doesn't feel safe or reliable. I'm leaving.") |
| confusion | `confusionLevel > 0.8 / conformity` on this step and the previous one | "I have no idea what I'm supposed to do here." |

When more than one breaches at once, the reason is the one furthest past its own limit and the rest are listed in `alsoBreached`. The tool also returns `journeyOver` (abandoned, or `goalProgress` reached 1) and releases the journey's browser session (on a hosted server, pass the session token as `param: _browserToken`).

`cognitive_journey_init` also announces a no-progress limit (10 steps, 15 for high persistence), a loop limit (3 visits to one page), a time limit (120 s; 60 s for low patience, 180 s for high), and lower limits for low comprehension (confusion 0.6) and low patience (frustration 0.7). `cognitive_journey_update_state` does not apply those; the calling model has to.

---

## Mood

In an autonomous journey the model reports the mood each step.

`cognitive_journey_update_state` derives it from the final levels:

```
frustration > 0.8 AND persistence < 0.5      -> defeated
frustration > 0.7 OR confusion > 0.5         -> frustrated or confused, whichever level is higher
action succeeded AND progress made           -> hopeful
otherwise                                    -> unchanged
```

It never sets `relieved`; set it yourself when the goal is reached.

### Mood-Based Monologue Examples

| Mood | Example Monologue |
|------|-------------------|
| **neutral** | "Okay, let me look at this page..." |
| **hopeful** | "Oh, I think I found it! This looks right." |
| **confused** | "Wait, what? I don't understand what this means." |
| **frustrated** | "Come on! Why isn't this working?!" |
| **defeated** | "I don't think I can do this. This is too hard." |
| **relieved** | "Finally! That was harder than it should be." |

---

## Per-Step Log

An autonomous journey records one `journeyLog` entry per step:

```yaml
- step: 7
  url: "https://example.com/checkout"
  pageTitle: "Checkout"
  phase: "decide"
  action: "click"
  actionTarget: "Submit Order"
  focusedElement: "Submit Order button"
  monologue: "I think this is the button to finish... I hope it doesn't charge me twice."
  mood: "confused"
  goalProgress: 0.4
  patience: 0.62
  confusion: 0.35
  frustration: 0.28
  timestamp: 1795453619372
```

---

## Journey Result

The final report (`CognitiveJourneyResult`):

```yaml
persona: "first-timer"
goal: "Complete checkout"
goalAchieved: false
abandonmentReason: "frustration"
abandonmentMessage: "This is so frustrating! I'm done."
totalTime: 67.4
stepCount: 12
pathEfficiency: 0.4            # only when an optimal path is known
summary:
  avgConfusionLevel: 0.42
  maxFrustrationLevel: 0.86
  backtrackCount: 3
  timeInConfusion: 8           # 2 s per friction point
  decisionsMade: 12
  finalDecisionFatigue: 0.41
  wasChoosingDefaults: false
  dominantEmotion: "frustration"
frictionPoints:
  - step: 4
    url: "https://example.com/checkout/shipping"
    element: "Continue"
    type: "unclear_button"     # unclear_button | confusing_ui | form_error | slow_load | missing_element | other
    frustrationIncrease: 0.15
    monologue: "Continue to where? What does this do?"
fullMonologue: [...]
finalState: { ... }
journeyLog: [...]
goalEvidence: "..."
failureReason: "..."
navigationPath: [...]
lastPage: { url, title }
```

A step is recorded as a friction point when the model describes friction and confusion or frustration is above 0.4.

---

## Integration Points

1. **Workflows/CognitiveJourney.md**: running either engine
2. **CognitivePersonas.md**: the traits that set the bands and drain rates
3. **The calling model**: in an MCP-driven journey it carries the state between `cognitive_journey_update_state` calls

---

## Advanced State Systems

`src/types.ts` also defines four state models, exported from the `cbrowser` package with their helper functions. No journey uses them today; they are library building blocks. The effects listed are the research claims their source comments cite.

### Self-Efficacy State (Bandura 1977)

```typescript
interface SelfEfficacyState {
  baseEfficacy: number;           // from the persona trait (0-1)
  currentEfficacy: number;        // after success/failure adjustments
  recentSuccesses: number;
  recentFailures: number;
  domainConfidence: Record<string, number>;
}
// Helpers: createSelfEfficacyState, handleChallenge, updateSelfEfficacy
// Cited: low-efficacy users abandon 40% faster on a first error; high-efficacy
// users try 3x more solution paths
```

### Satisficing State (Simon 1956)

```typescript
interface SatisficingState {
  tendency: number;               // 0 maximizer, 1 satisficer
  aspirationLevel: number;        // current "good enough" threshold
  optionsExamined: number;
  bestOptionSeen: { value: number; position: number } | null;
  searchFatigue: number;
}
// Helpers: createSatisficingState, evaluateOption, updateSatisficingState
// Cited: satisficers decide 50% faster with similar outcome quality
```

### Trust State (Fogg 2003, Riegelsberger 2005)

```typescript
interface TrustState {
  baselineTrust: number;          // from the persona trait (0-1)
  currentTrust: number;
  signalsDetected: TrustSignal[];
  betrayalHistory: TrustBetrayalEvent[];
}
// Signals: https, security_badge, brand_recognition, professional_design,
//          reviews_visible, contact_info, privacy_policy, social_proof
// Betrayals: popup_spam, redirect_unexpected, form_error, slow_load, dark_pattern
// Helpers: createTrustState, evaluateTrustDecision, recordTrustBetrayal
// Cited: low-trust users take 3-10x longer evaluating; trust affects
// CTA click-through by up to 40%
```

### Interrupt Recovery State (Mark et al. 2005)

```typescript
interface InterruptRecoveryState {
  recoveryAbility: number;        // from the persona trait (0-1)
  currentTaskContext: TaskContext | null;
  interruptionLog: InterruptionEvent[];
  environmentalCues: string[];    // breadcrumbs, autosave, ...
}
// Interruption types: external, self_initiated, system, timeout
// Resumption: resume_exact | resume_approximate | restart | abandon
// Helpers: createInterruptRecoveryState, handleInterruption, setTaskContext,
//          updateEnvironmentalCues
// Cited: average recovery time after an interruption is 23 minutes
```
