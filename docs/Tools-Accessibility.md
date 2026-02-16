> **This documentation is no longer maintained here.**
>
> For the latest version, please visit: **[Accessibility Tools](https://cbrowser.ai/docs/Tools-Accessibility)**

---

# Accessibility Tools

**Experience your site through the eyes of someone who can't use a mouse.**

The `empathy_audit` tool simulates how people with disabilities actually experience your site — motor tremors that make clicking hard, low vision that requires zoom, ADHD that makes long forms impossible. This isn't a WCAG checklist. It's lived experience simulation.

---

## When to Use This Tool

- **You think your site is accessible** but you've only run automated checkers
- **You need to prioritize fixes** and want to know what actually impacts real users
- **You're building for an aging population** and need to understand their struggles
- **Compliance audits are coming** and you need to find issues before auditors do

---

## The Tool

### `empathy_audit`

**What it does**: Simulate disability personas navigating your site, detecting WCAG violations with the context of how they actually impact users.

**Why you'd use it**: Automated accessibility checkers find violations. This tool shows you which violations actually matter and what the experience feels like.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to audit |
| `personas` | array | No | Disability personas to simulate. Default: all |
| `task` | string | No | Specific task to attempt (e.g., "complete checkout") |
| `wcagLevel` | string | No | WCAG level: `A`, `AA`, `AAA`. Default: `AA` |

**Example**:
```json
{
  "url": "https://example.com/signup",
  "personas": ["motor-tremor", "low-vision", "cognitive-adhd"],
  "task": "Create an account"
}
```

---

## Disability Personas

### `motor-tremor`

**Simulates**: Essential tremor, Parkinson's disease, or any condition affecting fine motor control.

**Behavioral Impact**:
- Struggles with small click targets (< 44px)
- Can't hover reliably for dropdown menus
- Needs keyboard navigation
- Frustrated by time-limited interactions

**WCAG Focus**: Target size (2.5.5), Keyboard accessible (2.1.1), No timing (2.2.3)

---

### `low-vision`

**Simulates**: Partial sight, macular degeneration, or conditions requiring magnification.

**Behavioral Impact**:
- Uses 200%+ zoom
- Loses context when zoomed in
- Needs high contrast
- Can't see small text or icons without labels

**WCAG Focus**: Reflow (1.4.10), Contrast (1.4.3), Text spacing (1.4.12)

---

### `cognitive-adhd`

**Simulates**: ADHD, attention difficulties, executive function challenges.

**Behavioral Impact**:
- Skims rapidly, misses key information
- Abandons long forms
- Distracted by animations/movement
- Needs clear visual hierarchy

**WCAG Focus**: Pause/stop (2.2.2), Error prevention (3.3.4), Consistent navigation (3.2.3)

---

### `dyslexia`

**Simulates**: Reading difficulties, letter/word recognition challenges.

**Behavioral Impact**:
- Struggles with dense text blocks
- Needs clear typography and spacing
- Misreads similar words
- Benefits from icons alongside text

**WCAG Focus**: Reading level (3.1.5), Line height (1.4.12), Clear fonts

---

### `deaf`

**Simulates**: Deaf or hard of hearing users.

**Behavioral Impact**:
- Can't access audio content without captions
- Misses audio alerts/notifications
- Relies entirely on visual information
- Needs sign language or text alternatives

**WCAG Focus**: Captions (1.2.2), Audio description (1.2.5), Visual alternatives (1.4.1)

---

### `color-blind`

**Simulates**: Color vision deficiency (protanopia, deuteranopia, tritanopia).

**Behavioral Impact**:
- Can't distinguish red/green, blue/yellow
- Misses color-coded information
- Needs patterns/labels in addition to color
- Confused by red/green status indicators

**WCAG Focus**: Use of color (1.4.1), Contrast (1.4.3)

---

## What the Audit Returns

```json
{
  "persona": "motor-tremor",
  "taskSuccess": false,
  "abandonmentPoint": "Payment form - credit card expiry dropdown",
  "timeToAbandon": 142,
  "barriers": [
    {
      "type": "small-target",
      "element": "#expiry-month",
      "wcag": "2.5.5",
      "severity": "critical",
      "userImpact": "Cannot reliably click the 32px dropdown with tremor",
      "remediation": "Increase target size to 44px minimum or provide keyboard alternative"
    },
    {
      "type": "hover-dependent",
      "element": ".nav-dropdown",
      "wcag": "2.1.1",
      "severity": "serious",
      "userImpact": "Dropdown closes before user can move cursor into it",
      "remediation": "Add click-to-open or increase hover delay"
    }
  ],
  "wcagViolations": 7,
  "recommendations": [
    "Add keyboard navigation to all dropdowns",
    "Increase minimum touch target to 44px",
    "Add skip-to-content link"
  ]
}
```

---

## Why This Is Different From WCAG Checkers

| Traditional Checker | Empathy Audit |
|--------------------|---------------|
| "Image missing alt text" | "Blind user couldn't understand the product because the hero image has no description" |
| "Target size 32px" | "User with tremor couldn't click the dropdown after 8 attempts" |
| "Contrast ratio 3.8:1" | "Low vision user at 200% zoom couldn't read the error message" |
| Reports violations | Reports **impact** |
| Pass/fail metrics | Abandonment stories |

---

## Running Empathy Audits in CI/CD

```bash
# Quick audit before deploy
npx cbrowser empathy-audit https://staging.example.com --personas motor-tremor,low-vision

# Full audit with task
npx cbrowser empathy-audit https://staging.example.com \
  --task "Complete checkout" \
  --wcag AA \
  --output report.html
```

---

## Related Documentation

- [Persona Index](/docs/Persona-Index/) — All personas including accessibility
- [UX Analysis Suite](/docs/UX-Analysis-Suite/) — Full UX analysis capabilities
- [Constitutional Safety](/docs/Constitutional-Safety/) — How CBrowser handles sensitive operations

---

*Last updated: v17.6.0*
