# Marketing Campaigns

**Test which messages work for which audiences — with scientific rigor.**

Marketing campaigns in CBrowser let you run structured A/B tests using cognitive personas. Instead of testing at the population level (where results average out), test at the *segment* level — find out that scarcity messaging works for impulse-shoppers but backfires with enterprise-buyers.

---

## Campaign Lifecycle

### 1. Create Campaign

Define variants and personas to test.

```json
{
  "tool": "marketing_campaign_create",
  "params": {
    "name": "Pricing Page Optimization Q1 2026",
    "variants": [
      { "name": "Control", "url": "https://example.com/pricing" },
      { "name": "Social Proof", "url": "https://example.com/pricing-v2" },
      { "name": "Scarcity", "url": "https://example.com/pricing-v3" }
    ],
    "personas": [
      "enterprise-buyer",
      "startup-founder",
      "impulse-shopper",
      "price-researcher"
    ],
    "goal": "Click 'Start Free Trial'",
    "metrics": ["time_to_goal", "friction_count", "abandonment_rate"]
  }
}
```

**Returns**: Campaign ID and test matrix (3 variants × 4 personas = 12 test cells)

---

### 2. Run Journeys

Run cognitive journeys for each cell in the matrix.

**With Enterprise** (automatic):
```json
{
  "tool": "marketing_campaign_run",
  "params": {
    "campaignId": "camp_abc123"
  }
}
```

**With Demo** (manual orchestration):
```json
// For each variant × persona combination:
{
  "tool": "cognitive_journey_init",
  "params": {
    "persona": "enterprise-buyer",
    "startUrl": "https://example.com/pricing",
    "goal": "Click 'Start Free Trial'"
  }
}
// ... orchestrate journey ...

// Report result back
{
  "tool": "marketing_campaign_report_result",
  "params": {
    "campaignId": "camp_abc123",
    "variantIndex": 0,
    "persona": "enterprise-buyer",
    "success": false,
    "abandonmentReason": "No security certification visible",
    "friction": ["Couldn't find SOC 2 badge", "Pricing unclear for enterprise"],
    "timeToGoal": null
  }
}
```

---

### 3. Analyze Results 🔒 Enterprise

Generate insights from campaign data.

```json
// Influence effectiveness matrix
{
  "tool": "marketing_influence_matrix",
  "params": { "campaignId": "camp_abc123" }
}

// Psychological lever analysis
{
  "tool": "marketing_lever_analysis",
  "params": { "campaignId": "camp_abc123" }
}

// Funnel comparison
{
  "tool": "marketing_funnel_analyze",
  "params": { "campaignId": "camp_abc123" }
}
```

---

## Campaign Results

### Success Matrix

| | Enterprise Buyer | Startup Founder | Impulse Shopper | Price Researcher |
|---|:---:|:---:|:---:|:---:|
| **Control** | ❌ | ✅ | ❌ | ❌ |
| **Social Proof** | ✅ | ✅ | ✅ | ❌ |
| **Scarcity** | ❌ | ✅ | ✅ | ❌ |

### Influence Matrix 🔒 Enterprise

Shows which influence patterns work for which personas:

```json
{
  "matrix": {
    "enterprise-buyer": {
      "social_proof": { "effectiveness": 0.85, "evidence": "Converted after seeing Fortune 500 logos" },
      "scarcity": { "effectiveness": 0.10, "evidence": "Dismissed 'Limited time' as marketing" },
      "authority": { "effectiveness": 0.90, "evidence": "Sought SOC 2 badge before proceeding" }
    },
    "impulse-shopper": {
      "social_proof": { "effectiveness": 0.75, "evidence": "Clicked after seeing 'Trusted by 10,000+'" },
      "scarcity": { "effectiveness": 0.95, "evidence": "Converted immediately on countdown" },
      "authority": { "effectiveness": 0.30, "evidence": "Didn't notice security badges" }
    }
  }
}
```

### Lever Analysis 🔒 Enterprise

Deep dive into *why* variants worked:

```json
{
  "variant": "Social Proof",
  "successRate": 0.75,
  "leverBreakdown": {
    "customer_logos": {
      "impact": "high",
      "evidence": "3 of 4 personas clicked CTAs near logos"
    },
    "testimonial_quotes": {
      "impact": "medium",
      "evidence": "Enterprise buyer read full testimonial before converting"
    },
    "user_count": {
      "impact": "low",
      "evidence": "Price researcher dismissed as vanity metric"
    }
  }
}
```

### Funnel Analysis 🔒 Enterprise

Where in the journey did each persona drop off?

```json
{
  "variant": "Scarcity",
  "persona": "enterprise-buyer",
  "funnel": [
    { "step": "Land on page", "reached": true, "time": 0 },
    { "step": "Scroll to pricing", "reached": true, "time": 12 },
    { "step": "See countdown timer", "reached": true, "time": 15 },
    { "step": "Click 'Start Trial'", "reached": false, "time": null }
  ],
  "dropOffAnalysis": {
    "step": "See countdown timer",
    "innerMonologue": "This seems like a pressure tactic. I need to verify this with my team first.",
    "frictionType": "trust_violation",
    "recommendation": "Remove artificial urgency for enterprise audience"
  }
}
```

---

## Designing Effective Campaigns

### Choose Contrasting Variants

Test different *strategies*, not minor copy changes:

**Good**:
- Control (baseline)
- Social proof emphasis (testimonials, logos)
- Scarcity emphasis (limited offer, countdown)
- Authority emphasis (certifications, awards)

**Bad**:
- "Start Free Trial" button
- "Begin Free Trial" button
- "Get Started Free" button

### Select Representative Personas

Include personas that matter for your business:

| Business Type | Key Personas |
|---------------|--------------|
| B2B SaaS | enterprise-buyer, startup-founder, technical-evaluator |
| E-commerce | impulse-shopper, price-researcher, loyal-customer |
| Consumer app | first-timer, power-user, mobile-user |
| Accessibility | motor-tremor, low-vision, cognitive-adhd |

### Define Clear Goals

Specific, measurable goals:

**Good**: "Click 'Start Free Trial' button"
**Bad**: "Understand the product"

---

## Demo vs Enterprise

| Capability | Demo | Enterprise |
|------------|:----:|:----------:|
| Create campaigns | ✅ | ✅ |
| Report journey results | ✅ | ✅ |
| List marketing personas | ✅ | ✅ |
| Run campaigns automatically | ❌ | ✅ |
| Influence matrix | ❌ | ✅ |
| Lever analysis | ❌ | ✅ |
| Funnel analysis | ❌ | ✅ |
| Competitive comparison | ❌ | ✅ |
| Audience discovery | ❌ | ✅ |

**Demo** gives you the testing framework — create campaigns, run journeys manually with Claude orchestrating, report results.

**Enterprise** gives you automation and insights — run all journeys automatically, get influence matrices and lever analysis.

---

## Example: Full Campaign

### Setup

```json
{
  "name": "Homepage CTA Test",
  "variants": [
    { "name": "Control", "url": "https://example.com" },
    { "name": "Social Proof", "url": "https://example.com?v=social" },
    { "name": "Feature Focus", "url": "https://example.com?v=features" }
  ],
  "personas": ["first-timer", "enterprise-buyer", "technical-evaluator"],
  "goal": "Click primary CTA"
}
```

### Results

| | First-Timer | Enterprise Buyer | Technical Evaluator |
|---|:---:|:---:|:---:|
| Control | ✅ (23s) | ❌ | ❌ |
| Social Proof | ✅ (18s) | ✅ (45s) | ❌ |
| Feature Focus | ❌ | ❌ | ✅ (67s) |

### Insights

- **First-timers** convert fastest on Social Proof (18s vs 23s control)
- **Enterprise buyers** need social proof (logos, testimonials) — don't convert without it
- **Technical evaluators** need feature details — social proof feels like marketing fluff
- **Recommendation**: Show different hero sections by referral source

---

## Related Documentation

- [Marketing Suite](/docs/Marketing-Suite/) — Full marketing capabilities
- [Marketing Intelligence Tools](/docs/Tools-Marketing-Intelligence/) — All marketing tools
- [Cognitive Journeys](/docs/Tools-Cognitive-Journeys/) — Journey simulation
- [Values Framework](/docs/Values-Framework/) — What motivates each persona

---

*Last updated: v17.6.0*
