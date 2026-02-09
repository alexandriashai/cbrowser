# Getting Started with CBrowser

CBrowser (Cognitive Browser) is the browser automation that thinks like your users. This guide will get you up and running quickly.

## Installation

```bash
npm install cbrowser
npx playwright install chromium
```

## Your First Commands

### Navigate to a Page

```bash
npx cbrowser navigate "https://example.com"
```

### Click with Self-Healing Selectors

```bash
npx cbrowser smart-click "Add to Cart"
```

CBrowser uses AI to find elements by description, not brittle CSS selectors. If the DOM changes, the self-healing system adapts automatically.

### Natural Language Assertions

```bash
npx cbrowser assert "page contains 'Order Confirmed'"
```

### Take a Screenshot

```bash
npx cbrowser screenshot --path order-confirmation.png
```

## Cognitive User Simulation

This is what makes CBrowser unique. Instead of just clicking buttons, it simulates how real users think:

```bash
npx cbrowser cognitive-journey \
  --persona first-timer \
  --start "https://example.com" \
  --goal "complete checkout"
```

The simulation tracks:
- **Patience** - Will they wait for slow pages?
- **Confusion** - Are they getting lost?
- **Frustration** - Are errors piling up?
- **Abandonment** - When will they give up?

### Output Example

```
=== Cognitive Journey: first-timer ===
Goal: complete checkout
Start: https://example.com

Step 1: Looking for product catalog
  Action: click "Shop Now"
  Patience: 95% | Confusion: 5%

Step 2: Found products, browsing
  Action: click first product
  Patience: 90% | Confusion: 10%

...

Step 8: ABANDONED
  Reason: Patience depleted (8%)
  Thought: "This password form is too confusing..."
  Friction points:
    - Password requirements unclear (step 6)
    - Form validation error not visible (step 7)
```

## Built-in Personas

| Persona | Description |
|---------|-------------|
| `power-user` | Tech-savvy, expects efficiency |
| `first-timer` | New user, explores carefully |
| `mobile-user` | Smartphone, touch interface |
| `elderly-user` | Patient, careful, vision/motor considerations |
| `impatient-user` | Quick to abandon on friction |
| `screen-reader-user` | Uses assistive technology |

## Create Custom Personas

Use the questionnaire system to create research-backed custom personas:

```bash
# Interactive questionnaire
npx cbrowser persona-questionnaire start --name "anxious-newbie"

# The system asks behavioral questions and derives trait values
# with proper research-backed correlations
```

## Natural Language Tests

Write tests in plain English:

```txt
# checkout-test.txt
go to https://example.com/products
click "Add to Cart" button
verify page contains "1 item in cart"
click checkout
fill email with "test@example.com"
click "Place Order"
verify url contains "/confirmation"
```

Run them:

```bash
npx cbrowser test-suite checkout-test.txt --html
```

## Visual Testing

### Capture Baseline

```bash
npx cbrowser ai-visual capture "https://example.com" --name homepage
```

### Test Against Baseline

```bash
npx cbrowser ai-visual test "https://staging.example.com" homepage --html
```

### Cross-Browser Comparison

```bash
npx cbrowser cross-browser "https://example.com" --html
```

### Responsive Testing

```bash
npx cbrowser responsive "https://example.com" --html
```

## Constitutional AI Safety

CBrowser classifies every action by risk level:

| Zone | Examples | Behavior |
|------|----------|----------|
| Green | Navigate, read, screenshot | Auto-execute |
| Yellow | Click buttons, fill forms | Log and proceed |
| Red | Submit, delete, purchase | Requires verification |
| Black | Bypass auth, inject scripts | Never executes |

This prevents AI agents from accidentally submitting forms, deleting data, or making purchases.

## API Key for Cognitive Features

Some features require an Anthropic API key:

```bash
npx cbrowser config set-api-key
```

## MCP Integration

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cbrowser": {
      "command": "npx",
      "args": ["cbrowser", "mcp-server"]
    }
  }
}
```

### claude.ai (Remote)

Use the public demo server:
```
https://cbrowser-mcp-demo.wyldfyre.ai/mcp
```

Or deploy your own: see [MCP Integration](./MCP-INTEGRATION.md).

## Next Steps

- [Cognitive Simulation](./COGNITIVE-SIMULATION.md) - Deep dive into user simulation
- [Persona Questionnaire](./PERSONA-QUESTIONNAIRE.md) - Create custom personas
- [Natural Language Tests](./NATURAL-LANGUAGE-TESTS.md) - Write tests in English
- [Visual Testing](./VISUAL-TESTING.md) - Screenshot-based regression testing
- [MCP Integration](./MCP-INTEGRATION.md) - Full Claude integration guide

## Quick Reference

| Command | Description |
|---------|-------------|
| `npx cbrowser navigate <url>` | Navigate to URL |
| `npx cbrowser click <selector>` | Click element |
| `npx cbrowser smart-click <text>` | AI-powered click |
| `npx cbrowser fill <selector> <value>` | Fill input |
| `npx cbrowser screenshot` | Capture screenshot |
| `npx cbrowser assert <assertion>` | Verify condition |
| `npx cbrowser cognitive-journey` | Run user simulation |
| `npx cbrowser test-suite <file>` | Run NL tests |
| `npx cbrowser ai-visual capture` | Capture baseline |
| `npx cbrowser ai-visual test` | Run visual test |
| `npx cbrowser cross-browser` | Cross-browser test |
| `npx cbrowser responsive` | Responsive test |
| `npx cbrowser agent-ready-audit` | Audit for AI agents |
| `npx cbrowser empathy-audit` | Disability simulation |
| `npx cbrowser persona-questionnaire` | Create custom persona |
| `npx cbrowser status` | Check environment |
