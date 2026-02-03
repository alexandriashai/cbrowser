# Journey Workflow

Autonomous persona-driven exploration.

## Triggers

- "journey", "explore", "walk through"
- "run as", "simulate", "act as"
- "user journey", "user flow"

## Usage

```bash
npx cbrowser journey "first-timer" \
  --start "https://example.com" \
  --goal "Complete signup and reach dashboard"
```

## How It Works

1. **Adopt persona** - Load persona behaviors and timing
2. **Start at URL** - Navigate to starting point
3. **Explore autonomously** - Find path to goal
4. **Record friction** - Note obstacles encountered
5. **Report results** - Success, time, issues

## Options

| Option | Description |
|--------|-------------|
| `--start URL` | Starting URL |
| `--goal TEXT` | Goal description |
| `--max-steps N` | Maximum steps (default: 30) |
| `--screenshot` | Screenshot each step |

## Built-in Personas

- `power-user` - Fast, efficient, uses shortcuts
- `first-timer` - Slow, exploratory, reads everything
- `mobile-user` - Touch interface, scrolls a lot
- `elderly-user` - Slower reactions, careful clicking
- `impatient-user` - Quick to abandon

## Compare Personas

```bash
npx cbrowser compare-personas \
  --start "https://example.com" \
  --goal "Complete checkout" \
  --personas power-user,first-timer,elderly-user
```

## Output

```
Journey: first-timer → "Complete signup"

Steps taken: 8
Total time: 45.2s
Success: ✓

Friction points:
  • Step 3: Small button hard to click
  • Step 5: Form validation unclear

Recommendations:
  • Increase button size for touch targets
  • Add clearer error messages
```

## Custom Personas

```bash
# Create from description
npx cbrowser persona create "impatient developer" --name speed-demon

# Use in journey
npx cbrowser journey "speed-demon" --start "..." --goal "..."
```
