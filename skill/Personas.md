# Persona Testing Framework

CBrowser simulates real users with different abilities, behaviors, and goals.

## Built-in Personas

| Persona | Description | Key Behaviors |
|---------|-------------|---------------|
| `power-user` | Tech-savvy expert | Fast reactions, keyboard shortcuts, expects efficiency |
| `first-timer` | New to the site | Slow, exploratory, reads everything, easily confused |
| `mobile-user` | Smartphone user | Touch interface, small viewport, scrolls a lot |
| `screen-reader-user` | Uses assistive tech | Tab navigation, needs proper ARIA labels |
| `elderly-user` | Older adult | Slower reactions, larger text needs, careful clicking |
| `impatient-user` | Low patience | Quick to abandon, expects fast load times |

---

## Persona Behaviors

Each persona has configurable:

### Timing
- `reactionTime` - How fast they respond to page changes
- `clickDelay` - Time between deciding and clicking
- `typeSpeed` - Characters per minute when typing
- `readingSpeed` - Words per minute
- `scrollPauseTime` - How long they pause while scrolling

### Errors
- `misClickRate` - Chance of clicking wrong element
- `doubleClickAccidental` - Chance of accidental double-click
- `typoRate` - Chance of typing errors
- `backtrackRate` - Chance of going back/undoing

### Mouse Behavior
- `curvature` - How curved the mouse path is
- `jitter` - Random movement noise
- `overshoot` - Missing the target slightly
- `speed` - Overall mouse movement speed

### Attention
- `pattern` - How they scan the page (F-pattern, thorough, etc.)
- `scrollBehavior` - Smooth, chunked, or aggressive
- `focusAreas` - What they pay attention to (CTA, text, images)
- `distractionRate` - Chance of losing focus

---

## Using Personas

### Run a Journey as a Persona

```bash
npx cbrowser journey "first-timer" \
  --start "https://example.com" \
  --goal "Complete signup and reach dashboard"
```

### Compare Multiple Personas

```bash
npx cbrowser compare-personas \
  --start "https://example.com" \
  --goal "Complete checkout" \
  --personas power-user,first-timer,elderly-user,mobile-user
```

---

## Creating Custom Personas

### AI-Generated Personas

Describe the user in natural language:

```bash
npx cbrowser persona create "impatient developer who hates slow UIs" --name speed-demon
npx cbrowser persona create "elderly grandmother new to computers" --name grandma
```

### Manual Persona Definition

Create `~/.cbrowser/personas/custom-persona.json`:

```json
{
  "name": "qa-tester",
  "description": "QA tester systematically checking functionality",
  "demographics": {
    "age_range": "25-40",
    "tech_level": "expert",
    "device": "desktop"
  },
  "humanBehavior": {
    "timing": {
      "reactionTime": { "min": 200, "max": 500 },
      "clickDelay": { "min": 100, "max": 300 },
      "typeSpeed": { "min": 50, "max": 100 }
    },
    "errors": {
      "misClickRate": 0.03,
      "typoRate": 0.03
    }
  }
}
```

---

## Persona Commands

```bash
# List all personas (built-in + custom)
npx cbrowser persona list

# View persona details
npx cbrowser persona show power-user

# Create from description
npx cbrowser persona create "description" --name my-persona

# Export persona
npx cbrowser persona export my-persona

# Import persona
npx cbrowser persona import persona.json

# Delete custom persona
npx cbrowser persona delete my-persona
```

---

## Interpreting Results

Persona comparison reports show:

- **Success rate** - Did each persona complete the goal?
- **Time taken** - How long for each persona?
- **Friction points** - Where did they struggle?
- **Specific issues** - Small buttons, confusing CTAs, etc.
- **Recommendations** - Actionable improvements
