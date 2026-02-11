# Empathy Audit

**Experience your site through the eyes of someone with a disability.**

`empathy_audit` doesn't just check WCAG compliance — it simulates actual humans with motor tremors, vision impairment, ADHD, and other conditions navigating your site. You'll see where they struggle, what makes them give up, and get specific remediation guidance.

---

## Quick Start

```json
{
  "url": "https://example.com/checkout",
  "personas": ["motor-tremor", "low-vision", "cognitive-adhd"],
  "task": "Complete a purchase"
}
```

**What happens**:
1. Each disability persona attempts the task
2. Their specific impairments affect how they interact (tremor = missed clicks, low vision = can't read small text)
3. WCAG violations are detected and mapped to real user impact
4. You get actionable remediation for each issue

---

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | string | Yes | — | Page to audit |
| `personas` | array | No | All | Disability personas to simulate |
| `task` | string | No | General exploration | Specific task to attempt |
| `wcagLevel` | string | No | `AA` | WCAG conformance level: `A`, `AA`, `AAA` |
| `depth` | number | No | 1 | Pages to crawl |

---

## Disability Personas

### `motor-tremor`

**Simulates**: Essential tremor, Parkinson's, cerebral palsy, repetitive strain injury.

**Behavioral Characteristics**:
- Mouse movement is imprecise with jitter
- Clicking small targets fails repeatedly
- Can't maintain hover long enough for menus
- Double-clicks unintentionally
- Strongly prefers keyboard navigation

**Common Barriers Detected**:

| Barrier | WCAG | User Experience |
|---------|------|-----------------|
| Small click targets | 2.5.5 | 8 attempts to click a 24px button |
| Hover-dependent menus | 2.1.1 | Menu closes before cursor reaches it |
| Time-limited forms | 2.2.3 | Session expired during slow typing |
| No keyboard shortcuts | 2.1.1 | Forced to use mouse for everything |

---

### `low-vision`

**Simulates**: Macular degeneration, glaucoma, cataracts, legal blindness with partial sight.

**Behavioral Characteristics**:
- Uses 200-400% browser zoom
- Relies on high contrast
- Loses page context when zoomed
- Can't perceive small text or icons
- Needs clear visual hierarchy

**Common Barriers Detected**:

| Barrier | WCAG | User Experience |
|---------|------|-----------------|
| Fixed-width containers | 1.4.10 | Content cut off at 200% zoom |
| Low contrast text | 1.4.3 | Can't read gray-on-white body text |
| Icon-only buttons | 1.1.1 | No idea what the hamburger menu does |
| Tiny form labels | 1.4.4 | Can't tell which field is which |

---

### `cognitive-adhd`

**Simulates**: ADHD, executive function challenges, attention difficulties.

**Behavioral Characteristics**:
- Scans rapidly, doesn't read thoroughly
- Clicks impulsively, sometimes wrong targets
- Abandons long forms or processes
- Easily distracted by movement/animation
- Loses track of progress in multi-step flows

**Common Barriers Detected**:

| Barrier | WCAG | User Experience |
|---------|------|-----------------|
| Wall of text | 3.1.5 | Glazed over and missed key info |
| Auto-playing video | 2.2.2 | Couldn't focus on the form |
| No progress indicator | 3.3.4 | Didn't know how many steps remained |
| Long forms | 3.3.2 | Abandoned at field 12 of 20 |

---

### `dyslexia`

**Simulates**: Reading difficulties, letter reversal, word recognition challenges.

**Behavioral Characteristics**:
- Slow reading speed
- Misreads similar words (their/there, form/from)
- Struggles with justified text
- Benefits from icons alongside text
- Needs generous line spacing

**Common Barriers Detected**:

| Barrier | WCAG | User Experience |
|---------|------|-----------------|
| Justified text | Best practice | Letters swim, lost place |
| Dense paragraphs | 1.4.12 | Couldn't parse the content |
| Ambiguous labels | 3.3.2 | Confused "Email" for "E-mail" link |
| Poor font choice | Best practice | Letters hard to distinguish |

---

### `deaf`

**Simulates**: Deaf, hard of hearing, auditory processing disorder.

**Behavioral Characteristics**:
- Can't hear audio content
- Misses audio alerts/notifications
- Depends entirely on visual information
- Needs captions or transcripts
- May need sign language

**Common Barriers Detected**:

| Barrier | WCAG | User Experience |
|---------|------|-----------------|
| Video without captions | 1.2.2 | Missed entire product demo |
| Audio-only alerts | 1.4.2 | Didn't know an error occurred |
| Phone-only support | Best practice | No way to get help |

---

### `color-blind`

**Simulates**: Protanopia, deuteranopia, tritanopia, and other color vision deficiencies.

**Behavioral Characteristics**:
- Can't distinguish red/green (most common)
- May confuse blue/yellow (less common)
- Depends on patterns, labels, position
- Struggles with color-coded status

**Common Barriers Detected**:

| Barrier | WCAG | User Experience |
|---------|------|-----------------|
| Red/green validation | 1.4.1 | Can't tell which fields have errors |
| Color-only charts | 1.4.1 | Graphs are meaningless |
| Status indicators | 1.4.1 | All traffic lights look the same |

---

## Output

```json
{
  "url": "https://example.com/checkout",
  "wcagLevel": "AA",
  "personas": {
    "motor-tremor": {
      "taskSuccess": false,
      "abandonmentPoint": "Payment form - credit card expiry dropdown",
      "timeToAbandon": 142,
      "attempts": {
        "clicks": 47,
        "missedClicks": 23,
        "successfulClicks": 24
      },
      "barriers": [
        {
          "type": "small-target",
          "element": "#expiry-month",
          "wcag": "2.5.5",
          "severity": "critical",
          "targetSize": "32x24",
          "requiredSize": "44x44",
          "userImpact": "Required 8 attempts to click, user patience exhausted",
          "remediation": {
            "summary": "Increase dropdown trigger to 44x44px minimum",
            "code": "<select style='min-width: 44px; min-height: 44px;'>",
            "effort": "low"
          }
        }
      ]
    },
    "low-vision": {
      "taskSuccess": true,
      "timeToComplete": 287,
      "zoomLevel": "200%",
      "barriers": [
        {
          "type": "low-contrast",
          "element": ".help-text",
          "wcag": "1.4.3",
          "severity": "moderate",
          "contrastRatio": "3.2:1",
          "requiredRatio": "4.5:1",
          "userImpact": "Couldn't read CVV help text, had to guess format",
          "remediation": {
            "summary": "Increase text contrast to 4.5:1",
            "code": "color: #595959; /* was #999999 */",
            "effort": "low"
          }
        }
      ]
    }
  },
  "summary": {
    "totalBarriers": 7,
    "critical": 2,
    "serious": 3,
    "moderate": 2,
    "wcagViolations": {
      "A": 1,
      "AA": 4
    },
    "recommendations": [
      "Increase all interactive targets to 44px minimum",
      "Add keyboard navigation to dropdown menus",
      "Improve contrast ratio on help text",
      "Add visible focus indicators"
    ]
  }
}
```

---

## Use Cases

### 1. Pre-Launch Accessibility Review

Before launching a new feature, run empathy audits across all disability personas:

```json
{
  "url": "https://staging.example.com/new-feature",
  "personas": ["motor-tremor", "low-vision", "cognitive-adhd", "deaf", "color-blind"],
  "task": "Complete the new onboarding flow"
}
```

---

### 2. Prioritizing Accessibility Fixes

You have 100 WCAG violations. Which ones matter?

```json
{
  "url": "https://example.com",
  "depth": 5
}
```

The audit shows which violations caused actual abandonment vs minor inconvenience. Fix the critical ones first.

---

### 3. Compliance Documentation

Need evidence for VPAT or accessibility statement:

```json
{
  "url": "https://example.com",
  "wcagLevel": "AA",
  "depth": 10
}
```

Generates detailed barrier documentation with WCAG mappings.

---

## Why This Is Different

| WCAG Checker | Empathy Audit |
|--------------|---------------|
| "Button has no accessible name" | "Blind user couldn't proceed because the 'Next' button had no label" |
| "Contrast ratio is 3.2:1" | "Low-vision user at 200% zoom couldn't read the error message and submitted invalid data" |
| "Target size is 32px" | "User with tremor failed to click the dropdown 8 times before giving up" |
| Counts violations | Predicts abandonment |
| Compliance-focused | User-experience-focused |

---

## CI/CD Integration

```bash
# Fail build if critical accessibility barriers found
npx cbrowser empathy-audit https://staging.example.com \
  --task "Complete checkout" \
  --fail-on critical \
  --output accessibility-report.html
```

---

## Related Tools

- [`cognitive_journey_autonomous`](/docs/Tool-Cognitive-Journey-Autonomous/) — Full journey simulation
- [`agent_ready_audit`](/docs/Tools-Utilities/) — AI agent friendliness
- [UX Analysis Suite](/docs/UX-Analysis-Suite/) — Full UX analysis capabilities

---

*Last updated: v17.6.0*
