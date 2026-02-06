# Cognitive Journey Testing Workflow

This workflow demonstrates how to use CBrowser's cognitive user simulation to test whether real users can complete tasks on your site.

## Why Cognitive Testing?

Traditional persona testing simulates **motor behavior**: slow clicks, typos, mobile viewport. Cognitive testing simulates **mental behavior**:

- "Would a confused user notice that button?"
- "Would an impatient user give up at this step?"
- "Does the UI communicate clearly enough for a first-timer?"

## Prerequisites

```bash
# Install CBrowser
npm install cbrowser

# Configure API key (for standalone CLI usage)
npx cbrowser config set-api-key

# Or use via MCP with Claude Desktop/Code (no API key needed)
```

## Basic Cognitive Journey

```bash
# Run a cognitive journey as a first-timer
npx cbrowser cognitive-journey \
  --persona first-timer \
  --start "https://your-site.com" \
  --goal "sign up for an account"
```

## Understanding the Output

A cognitive journey produces:

1. **Goal Status**: Did the simulated user achieve their goal?
2. **Abandonment Reason**: If they gave up, why?
3. **Decision Trace**: Step-by-step reasoning with internal monologue
4. **Friction Points**: Moments where the user struggled
5. **Cognitive State Over Time**: Patience, confusion, frustration levels

## Cognitive Traits Explained

Each persona has 7 cognitive traits that affect their behavior:

| Trait | Low Value Behavior | High Value Behavior |
|-------|-------------------|---------------------|
| `patience` | Gives up quickly | Keeps trying for a long time |
| `riskTolerance` | Only clicks obvious, safe elements | Clicks unfamiliar buttons |
| `comprehension` | Misinterprets UI conventions | Understands quickly |
| `persistence` | Tries something different after failure | Keeps retrying same approach |
| `curiosity` | Stays focused on goal | Explores interesting sidebars |
| `workingMemory` | Forgets what they tried, repeats failures | Remembers and avoids repetition |
| `readingTendency` | Scans for buttons, ignores text | Reads instructions carefully |

## Testing Strategy

### 1. Test Critical Flows with Multiple Personas

```bash
# Test signup with different user types
for persona in first-timer elderly-user impatient-user power-user; do
  npx cbrowser cognitive-journey \
    --persona $persona \
    --start "https://your-site.com" \
    --goal "complete signup"
done
```

### 2. Identify Abandonment Points

Watch for patterns where multiple personas give up:

```bash
npx cbrowser cognitive-journey \
  --persona impatient-user \
  --start "https://your-site.com" \
  --goal "find pricing" \
  --verbose
```

If the impatient user abandons at step 3 with "This is taking too long," you have a friction point to fix.

### 3. Test with Custom Traits

Create a custom persona that represents your target user:

```bash
# Save to examples/personas/target-customer.json
{
  "name": "target-customer",
  "cognitiveTraits": {
    "patience": 0.5,
    "riskTolerance": 0.3,
    "comprehension": 0.6,
    "persistence": 0.4,
    "curiosity": 0.7,
    "workingMemory": 0.6,
    "readingTendency": 0.4
  }
}
```

### 4. Compare Personas Side-by-Side

```bash
npx cbrowser compare-personas \
  --start "https://your-site.com" \
  --goal "complete checkout" \
  --personas power-user,first-timer,elderly-user,mobile-user
```

## MCP Integration (Claude Desktop/Code)

For Claude users, cognitive journeys integrate via MCP tools:

```typescript
// Initialize the journey
const profile = await mcp.cognitive_journey_init({
  persona: "first-timer",
  goal: "sign up as a provider",
  startUrl: "https://your-site.com"
});

// Claude now acts as the persona, making decisions
// After each action, update the cognitive state:
const state = await mcp.cognitive_journey_update_state({
  sessionId: profile.sessionId,
  patienceChange: -0.05,  // Small depletion
  confusionChange: 0.1,   // Got a bit confused
  currentUrl: "https://your-site.com/register"
});

// Check if user would abandon
if (state.shouldAbandon) {
  console.log(`User gave up: ${state.abandonmentReason}`);
  console.log(`Final thought: ${state.finalThought}`);
}
```

## Interpreting Results

### Successful Journey
```
Goal achieved: true
Steps: 8
Time: 45s
Final thought: "That was pretty straightforward!"
```

### Abandoned Journey
```
Goal achieved: false
Abandonment reason: patience_depleted
Final thought: "This is taking too long, I'll try another site."
Step 12: Confusion peaked at 0.72 when trying to find the signup button
```

### Friction Points
```json
{
  "frictionPoints": [
    {
      "step": 5,
      "type": "confusion",
      "monologue": "I'm not sure if 'Get Started' means signup or just learning more...",
      "screenshot": "friction-step-5.png"
    }
  ]
}
```

## Best Practices

1. **Test early, test often**: Run cognitive journeys during design, not just before launch
2. **Focus on abandonment reasons**: These reveal UX issues
3. **Watch confusion levels**: Sustained confusion > 0.6 indicates unclear UI
4. **Check the monologue**: The internal thoughts reveal what users are thinking
5. **Compare across personas**: If only one persona struggles, it's a specific accessibility issue

## Common Abandonment Patterns

| Pattern | Typical Cause | Fix |
|---------|---------------|-----|
| "Taking too long" | Too many steps, slow loading | Simplify flow |
| "No idea what to do" | Unclear navigation, missing labels | Improve signposting |
| "So frustrating" | Repeated failures, errors | Better error messages |
| "Not getting anywhere" | Circular navigation, dead ends | Improve information architecture |
| "Keep ending up here" | Confusing back navigation | Better breadcrumbs |

## Next Steps

- Review friction points and prioritize fixes
- Re-run journeys after changes to verify improvement
- Add cognitive journey tests to CI/CD pipeline
- Create custom personas that match your user research
