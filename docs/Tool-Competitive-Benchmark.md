# Competitive Benchmark

**See how your UX stacks up against competitors.**

`competitive_benchmark` runs the same UX analysis across multiple sites and ranks them. Find out if your signup flow is faster than competitors, if your forms have more friction, and get specific recommendations for what to fix.

---

## Quick Start

```json
{
  "urls": [
    "https://example.com/signup",
    "https://competitor1.com/signup",
    "https://competitor2.com/signup"
  ]
}
```

**What happens**:
1. Each URL is analyzed for UX metrics
2. Sites are ranked on each metric
3. You see where you're winning and losing
4. Specific recommendations show how to improve

---

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `urls` | array | Yes | — | URLs to benchmark (2-5 sites) |
| `metrics` | array | No | All | Specific metrics to compare |
| `task` | string | No | — | Task to attempt on each site |
| `persona` | string | No | `first-timer` | Persona to use for analysis |

---

## Metrics Compared

### Form Friction

| Metric | What It Measures |
|--------|------------------|
| **Field Count** | Number of required fields |
| **Steps** | Multi-page vs single-page |
| **Validation** | Inline vs on-submit |
| **Password Rules** | Complexity requirements |
| **Optional Fields** | Clear marking of optional |

### Cognitive Load

| Metric | What It Measures |
|--------|------------------|
| **Text Density** | Words per screen |
| **Decision Points** | Choices user must make |
| **Terminology** | Industry jargon usage |
| **Visual Hierarchy** | Clear information flow |
| **Navigation Clarity** | Obvious next steps |

### Trust Signals

| Metric | What It Measures |
|--------|------------------|
| **Security Badges** | HTTPS, security certifications |
| **Social Proof** | Reviews, testimonials, logos |
| **Privacy Info** | Clear data handling |
| **Contact Options** | Accessible support |
| **Professional Design** | Polish and consistency |

### Performance

| Metric | What It Measures |
|--------|------------------|
| **Load Time** | Time to interactive |
| **LCP** | Largest Contentful Paint |
| **CLS** | Cumulative Layout Shift |
| **Input Latency** | Time to respond to clicks |

---

## Output

```json
{
  "benchmark": {
    "urls": [
      "https://example.com/signup",
      "https://competitor1.com/signup",
      "https://competitor2.com/signup"
    ],
    "task": "Create an account",
    "persona": "first-timer"
  },
  "rankings": {
    "overall": [
      { "url": "competitor2.com", "score": 87 },
      { "url": "example.com", "score": 72 },
      { "url": "competitor1.com", "score": 68 }
    ],
    "form_friction": [
      { "url": "competitor2.com", "score": 95, "fields": 4 },
      { "url": "example.com", "score": 70, "fields": 8 },
      { "url": "competitor1.com", "score": 55, "fields": 12 }
    ],
    "cognitive_load": [
      { "url": "competitor2.com", "score": 90 },
      { "url": "competitor1.com", "score": 75 },
      { "url": "example.com", "score": 65 }
    ],
    "trust_signals": [
      { "url": "example.com", "score": 85 },
      { "url": "competitor1.com", "score": 80 },
      { "url": "competitor2.com", "score": 75 }
    ],
    "performance": [
      { "url": "competitor2.com", "score": 92, "lcp": 1.2 },
      { "url": "example.com", "score": 78, "lcp": 2.1 },
      { "url": "competitor1.com", "score": 65, "lcp": 3.4 }
    ]
  },
  "analysis": {
    "example.com": {
      "strengths": [
        "Strong trust signals (security badges, testimonials)",
        "Professional design quality"
      ],
      "weaknesses": [
        "Form has 8 fields vs competitor's 4",
        "High cognitive load - too much text on signup page",
        "Password validation only shows on submit"
      ],
      "recommendations": [
        {
          "priority": "high",
          "area": "form_friction",
          "issue": "Too many required fields",
          "action": "Defer Company Name and Phone to onboarding, reduce signup to 4 fields",
          "impact": "Estimated 15-25% increase in completion rate"
        },
        {
          "priority": "medium",
          "area": "cognitive_load",
          "issue": "Dense paragraph above form",
          "action": "Replace with 3 bullet points",
          "impact": "Reduced time-to-start"
        }
      ]
    }
  },
  "opportunities": [
    {
      "insight": "Competitor2 wins on simplicity but lacks trust signals - you can beat them by simplifying while keeping your trust advantages",
      "actionable": "Reduce form to 4 fields, keep security badges visible"
    }
  ]
}
```

---

## Use Cases

### 1. Conversion Gap Analysis

Your signup converts at 15%, competitor converts at 25%. Why?

```json
{
  "urls": ["https://yoursite.com/signup", "https://competitor.com/signup"],
  "task": "Create an account",
  "persona": "first-timer"
}
```

---

### 2. Checkout Optimization

Compare checkout experiences:

```json
{
  "urls": [
    "https://yourstore.com/checkout",
    "https://amazon.com/checkout",
    "https://shopify.com/checkout"
  ],
  "task": "Complete purchase"
}
```

---

### 3. Landing Page Effectiveness

Compare landing pages for lead capture:

```json
{
  "urls": [
    "https://yoursite.com",
    "https://competitor1.com",
    "https://competitor2.com"
  ],
  "metrics": ["cognitive_load", "trust_signals"]
}
```

---

### 4. Industry Benchmarking

See how you compare to industry leaders:

```json
{
  "urls": [
    "https://yourbank.com/apply",
    "https://chase.com/apply",
    "https://capitalone.com/apply"
  ],
  "task": "Apply for credit card"
}
```

---

## Interpreting Results

### Score Ranges

| Score | Meaning |
|-------|---------|
| 90-100 | Excellent - industry leading |
| 80-89 | Good - competitive |
| 70-79 | Average - room for improvement |
| 60-69 | Below average - significant gaps |
| <60 | Poor - major friction |

### Priority Recommendations

| Priority | Meaning | Typical Impact |
|----------|---------|----------------|
| **High** | Fix immediately | 15%+ conversion lift |
| **Medium** | Fix soon | 5-15% conversion lift |
| **Low** | Nice to have | <5% conversion lift |

---

## Tips

### Choose Fair Comparisons

Compare similar journeys:
- Signup → Signup (not signup → checkout)
- Same industry when possible
- Similar target markets

### Use Multiple Personas

```json
// Technical audience
{ "persona": "technical-evaluator" }

// Non-technical
{ "persona": "first-timer" }
```

Different personas may rank competitors differently.

### Focus on Actionable Metrics

If you can't change it, don't benchmark it. Focus on metrics where you can realistically improve.

---

## Related Tools

- [`marketing_compete`](/docs/Tools-Marketing-Intelligence/) — Deep competitive analysis with cognitive journeys (Enterprise)
- [`hunt_bugs`](/docs/Tool-Hunt-Bugs/) — Find bugs in your own site
- [`empathy_audit`](/docs/Tool-Empathy-Audit/) — Accessibility comparison

---

*Last updated: v17.6.0*
