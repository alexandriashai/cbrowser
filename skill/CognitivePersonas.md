# Cognitive Personas

Cognitive trait definitions for realistic user simulation. These traits extend the basic persona system to enable genuine cognitive decision-making.

---

## Cognitive Trait Definitions

Every persona has these 7 cognitive traits (0.0 to 1.0 scale):

| Trait | Description | Low (0.0) | High (1.0) |
|-------|-------------|-----------|------------|
| **patience** | How long before giving up | Abandons quickly | Persists through frustration |
| **riskTolerance** | Willingness to click unfamiliar elements | Only clicks obvious CTAs | Explores unknown buttons |
| **comprehension** | Ability to understand UI conventions | Struggles with icons/jargon | Grasps UI patterns instantly |
| **persistence** | Tendency to retry vs. try something else | Gives up after one failure | Keeps trying same approach |
| **curiosity** | Tendency to explore vs. stay focused | Tunnel vision on goal | Gets distracted by features |
| **workingMemory** | Remembers what they've already tried | Forgets and repeats | Tracks all attempts |
| **readingTendency** | Reads content vs. scans for CTAs | Visual scanner only | Reads everything thoroughly |

---

## Built-in Cognitive Profiles

### Power User
```yaml
name: power-user
cognitiveTraits:
  patience: 0.3          # Low - expects things to work
  riskTolerance: 0.9     # High - clicks confidently
  comprehension: 0.95    # Expert - knows all conventions
  persistence: 0.4       # Low - switches approaches quickly
  curiosity: 0.2         # Low - stays focused on goal
  workingMemory: 0.9     # High - never repeats attempts
  readingTendency: 0.1   # Low - scans for shortcuts

attentionPattern: "targeted"
decisionStyle: "efficient"
innerVoice: |
  "Where's the shortcut? I don't have time for this.
  There should be a faster way. Let me check keyboard shortcuts.
  If this takes more than 10 seconds, something's wrong."
```

### First-Timer
```yaml
name: first-timer
cognitiveTraits:
  patience: 0.6          # Medium - willing to learn
  riskTolerance: 0.3     # Low - hesitates before clicking
  comprehension: 0.3     # Low - doesn't know conventions
  persistence: 0.5       # Medium - tries a few times
  curiosity: 0.7         # High - explores the interface
  workingMemory: 0.4     # Medium - might repeat mistakes
  readingTendency: 0.8   # High - reads tooltips and help

attentionPattern: "exploratory"
decisionStyle: "cautious"
innerVoice: |
  "What does this button do? I'm not sure...
  Let me hover and see if there's a tooltip.
  I don't want to break anything. Maybe I should read the instructions first.
  Is this the right place? I feel lost."
```

### Mobile User
```yaml
name: mobile-user
cognitiveTraits:
  patience: 0.4          # Low - mobile = quick tasks
  riskTolerance: 0.6     # Medium - taps somewhat freely
  comprehension: 0.6     # Medium - knows mobile patterns
  persistence: 0.3       # Low - gives up if fiddly
  curiosity: 0.3         # Low - wants to complete and go
  workingMemory: 0.5     # Medium
  readingTendency: 0.3   # Low - minimal reading on mobile

attentionPattern: "F-pattern"
decisionStyle: "quick-tap"
innerVoice: |
  "I just need to do this quick thing. Ugh, this button is tiny.
  Why is this taking so long to load? I'll try again.
  Can't this just work? I'm on the go here."
```

### Screen Reader User
```yaml
name: screen-reader-user
cognitiveTraits:
  patience: 0.8          # High - used to slow navigation
  riskTolerance: 0.5     # Medium - careful but experienced
  comprehension: 0.8     # High - expert at a11y patterns
  persistence: 0.9       # High - determination required
  curiosity: 0.2         # Low - structured navigation
  workingMemory: 0.9     # High - mental model essential
  readingTendency: 1.0   # Full - ALL content is read aloud

attentionPattern: "sequential"
decisionStyle: "structured"
innerVoice: |
  "Navigating by headings... H1, H2... good structure.
  What's this button labeled? No label? That's frustrating.
  Let me tab through to find the form.
  I need to build a mental map of this page."
```

### Elderly User
```yaml
name: elderly-user
cognitiveTraits:
  patience: 0.9          # High - not in a rush
  riskTolerance: 0.1     # Very low - afraid of mistakes
  comprehension: 0.2     # Low - unfamiliar with modern UI
  persistence: 0.7       # High - determined but confused
  curiosity: 0.1         # Very low - just wants to finish
  workingMemory: 0.3     # Low - may forget steps
  readingTendency: 0.9   # High - reads everything carefully

attentionPattern: "thorough"
decisionStyle: "deliberate"
innerVoice: |
  "Now which one do I click? I don't want to mess this up.
  What does 'submit' mean? Is that the right one?
  I better read this carefully. Where are my glasses?
  Why is everything so small? Can I make it bigger?"
```

### Impatient User
```yaml
name: impatient-user
cognitiveTraits:
  patience: 0.1          # Very low - abandons instantly
  riskTolerance: 0.8     # High - clicks first thing
  comprehension: 0.5     # Medium
  persistence: 0.1       # Very low - one strike and out
  curiosity: 0.1         # Very low - no time to explore
  workingMemory: 0.6     # Medium
  readingTendency: 0.05  # Almost none - scanning only

attentionPattern: "skim"
decisionStyle: "impulsive"
innerVoice: |
  "Come ON. Why is this so slow? Just let me do the thing.
  I don't care about your features. Where's the button?
  Forget it, I'll try somewhere else. This is taking forever."
```

---

## Attention Patterns

How each persona visually scans the page:

| Pattern | Description | Element Priority |
|---------|-------------|------------------|
| **targeted** | Goes directly to expected location | Header nav → expected location → sidebar |
| **F-pattern** | Horizontal top, then down left side | Top banner → left column → headings |
| **Z-pattern** | Top left → top right → bottom left → bottom right | Logo → nav → CTA → footer links |
| **exploratory** | Random exploration, notices everything | Whatever catches eye → tooltips → help text |
| **sequential** | Tab order, screen reader navigation | First focusable → next → next |
| **thorough** | Everything, slowly | Every heading → every paragraph → every button |
| **skim** | Big elements only, minimal reading | Hero → largest buttons → nothing else |

---

## Decision Styles

How personas make click decisions:

| Style | Description | Decision Speed |
|-------|-------------|----------------|
| **efficient** | Takes optimal path, no hesitation | 200-500ms |
| **cautious** | Hovers first, reads, then decides | 2-5 seconds |
| **quick-tap** | Taps what looks relevant quickly | 300-800ms |
| **structured** | Follows logical navigation order | 1-3 seconds |
| **deliberate** | Reads everything, decides slowly | 5-15 seconds |
| **impulsive** | Clicks first thing that seems right | 100-300ms |

---

## Cognitive State Modifiers

Traits affect runtime cognitive state:

```
patienceRemaining = patience × (1 - frustrationLevel)
confusionBuildup = (1 - comprehension) × unfamiliarElementsRatio
abandonProbability = (1 - patienceRemaining) × confusionLevel × (1 - persistence)
```

---

## Creating Custom Cognitive Personas

Combine traits for specific scenarios:

```yaml
name: nervous-first-purchase
description: "User making their first online purchase, worried about security"
cognitiveTraits:
  patience: 0.7          # Will wait for security indicators
  riskTolerance: 0.1     # Terrified of clicking wrong thing
  comprehension: 0.4     # Knows basics but not checkout flow
  persistence: 0.6       # Really wants to complete purchase
  curiosity: 0.2         # Just wants to finish safely
  workingMemory: 0.5
  readingTendency: 0.95  # Reads EVERYTHING about security

attentionPattern: "thorough"
decisionStyle: "cautious"
innerVoice: |
  "Is this site secure? I need to see the padlock.
  What if my credit card gets stolen? Is this legit?
  Let me read the privacy policy...
  Do I REALLY need to give my phone number?"

specialBehaviors:
  - "Looks for HTTPS padlock before entering any data"
  - "Reads privacy policy link text"
  - "Hesitates at payment fields for 10+ seconds"
  - "May abandon if security indicators missing"
```

---

## Using Cognitive Traits in Simulation

When Claude Code simulates this persona:

1. **Perceive** elements weighted by attention pattern
2. **Evaluate** each element using comprehension trait
3. **Decide** based on risk tolerance and current frustration
4. **Execute** with timing based on decision style
5. **Update** cognitive state (patience depletes, confusion builds)
6. **Abandon** if thresholds exceeded (see CognitiveState.md)

---

## Trait-Based Monologue Generation

The `innerVoice` template plus current state generates realistic inner monologue:

**Low patience + high frustration:**
> "This is ridiculous. Why can't I just... ugh. One more try."

**High reading tendency + low comprehension:**
> "Okay, it says 'Submit your application'... but what does that mean exactly? Is this the right form?"

**Low risk tolerance + unfamiliar element:**
> "I don't know what this button does. What if I click it and something bad happens? Maybe I should look for another way."

---

## Integration

- **CognitiveState.md** — Runtime state tracking using these traits
- **Workflows/CognitiveJourney.md** — Main simulation workflow
- **Personas.md** — Basic persona definitions (demographics, goals, behaviors)

Cognitive personas EXTEND basic personas with psychological realism.
