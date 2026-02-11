# Marketing Intelligence Tools

**Stop guessing which messages work. Start measuring influence.**

These 11 tools let you test which psychological influence patterns work on which audience segments. Run A/B campaigns with cognitive personas, analyze conversion funnels, and benchmark against competitors — all with scientific rigor.

---

## When to Use These Tools

- **You're optimizing conversion** and want to know which messaging resonates with each audience
- **You have A/B test fatigue** from inconclusive results because you're testing at the population level, not segment level
- **You want competitive intelligence** on why competitor sites convert better
- **You need to prove ROI** on UX investments with actual persona-by-persona data

---

## Tools

### `marketing_personas_list`

**What it does**: List available marketing-specific personas with their influence susceptibilities.

**Why you'd use it**: See which audience segments you can test against and what motivates each one.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `category` | string | No | Filter: `b2b`, `consumer`, `all`. Default: `all` |

**Returns**: Personas with descriptions, effective influence patterns, and ineffective patterns.

### Marketing Personas

| Persona | Category | Effective Patterns | Ineffective Patterns |
|---------|----------|-------------------|---------------------|
| `enterprise-buyer` | B2B | Authority, Social Proof, Default Bias | Scarcity, Reciprocity |
| `startup-founder` | B2B | Scarcity, Commitment, Reciprocity | Authority, Default Bias |
| `procurement-manager` | B2B | Authority, Social Proof, Default Bias | Scarcity, Reciprocity |
| `technical-evaluator` | B2B | Commitment, Reciprocity | Social Proof, Scarcity |
| `impulse-shopper` | Consumer | Scarcity, Anchoring, Social Proof | Authority, Commitment |
| `price-researcher` | Consumer | Anchoring, Scarcity, Social Proof | Authority, Unity |
| `loyal-customer` | Consumer | Unity, Reciprocity, Default Bias | Scarcity, Novelty |
| `skeptical-first-timer` | Consumer | Social Proof, Authority, Default Bias | Scarcity, Commitment |

---

### `marketing_campaign_create`

**What it does**: Create a multi-variant campaign that tests different page versions across multiple personas.

**Why you'd use it**: Set up structured testing to understand which variations work for which audiences.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Campaign name |
| `variants` | array | Yes | URLs or descriptions of variants to test |
| `personas` | array | Yes | Persona IDs to test with |
| `goal` | string | Yes | What success looks like |
| `metrics` | array | No | Custom metrics to track |

**Example**:
```json
{
  "name": "Pricing Page Optimization",
  "variants": [
    { "name": "Control", "url": "https://example.com/pricing" },
    { "name": "Social Proof", "url": "https://example.com/pricing-v2" },
    { "name": "Scarcity", "url": "https://example.com/pricing-v3" }
  ],
  "personas": ["enterprise-buyer", "startup-founder", "impulse-shopper"],
  "goal": "Click 'Start Free Trial' button"
}
```

**Returns**: Campaign ID, test matrix (variants × personas), ready for execution.

---

### `marketing_campaign_report_result`

**What it does**: Report the result of a journey back to a campaign for aggregation.

**Why you'd use it**: After running a cognitive journey for a campaign, log whether it succeeded and what friction was encountered.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `campaignId` | string | Yes | Campaign ID |
| `variantIndex` | number | Yes | Which variant was tested |
| `persona` | string | Yes | Persona that ran the journey |
| `success` | boolean | Yes | Did the persona achieve the goal? |
| `friction` | array | No | Friction points encountered |
| `timeToGoal` | number | No | Seconds to achieve goal (if successful) |
| `abandonmentReason` | string | No | Why they gave up (if unsuccessful) |

---

### `marketing_campaign_run` 🔒 Enterprise

**What it does**: Execute a full campaign automatically — runs cognitive journeys for every variant × persona combination.

**Why you'd use it**: Hands-off campaign execution that produces complete results without manual orchestration.

> **Enterprise Feature** — Requires CBrowser Enterprise.
> Executes multiple autonomous journeys, consuming significant compute and API resources.
> [Learn about Enterprise →](/docs/Marketing-Suite/)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `campaignId` | string | Yes | Campaign to run |
| `variantIndex` | number | No | Run only specific variant |
| `personaFilter` | array | No | Run only specific personas |

---

### `marketing_influence_matrix` 🔒 Enterprise

**What it does**: Generate a matrix showing which influence patterns work for which personas based on campaign results.

**Why you'd use it**: Visualize pattern effectiveness at a glance. Know exactly what works for enterprise buyers vs impulse shoppers.

> **Enterprise Feature** — Requires CBrowser Enterprise.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `campaignId` | string | Yes | Campaign to analyze |

**Returns**: Matrix with personas on one axis, influence patterns on the other, with effectiveness scores.

---

### `marketing_lever_analysis` 🔒 Enterprise

**What it does**: Deep analysis of which psychological levers (scarcity, authority, social proof, etc.) drove behavior for each persona.

**Why you'd use it**: Understand *why* certain variants worked, not just *that* they worked.

> **Enterprise Feature** — Requires CBrowser Enterprise.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `campaignId` | string | Yes | Campaign to analyze |

**Returns**: Lever-by-lever breakdown with evidence from journey traces.

---

### `marketing_funnel_analyze` 🔒 Enterprise

**What it does**: Compare conversion funnels across variants — where do people drop off, what's different between successful and failed journeys?

**Why you'd use it**: Find the specific step where each persona type struggles.

> **Enterprise Feature** — Requires CBrowser Enterprise.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `campaignId` | string | Yes | Campaign to analyze |

**Returns**: Funnel visualization per variant, drop-off points, comparison between personas.

---

### `marketing_compete` 🔒 Enterprise

**What it does**: Run the same personas through your site and a competitor's site, then compare conversion effectiveness.

**Why you'd use it**: Understand why competitors might be converting better for specific audience segments.

> **Enterprise Feature** — Requires CBrowser Enterprise.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `yourUrl` | string | Yes | Your site URL |
| `competitorUrl` | string | Yes | Competitor site URL |
| `goal` | string | Yes | Goal to compare (e.g., "Sign up for trial") |
| `personas` | array | No | Which personas to use |

---

### `marketing_audience_discover` 🔒 Enterprise

**What it does**: Discover who your site is optimized for by running randomized personas and seeing which ones convert best.

**Why you'd use it**: Find out if your site accidentally favors one audience over another.

> **Enterprise Feature** — Requires CBrowser Enterprise.
> Runs many autonomous journeys to build statistical significance.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to analyze |
| `goal` | string | Yes | Conversion goal |
| `samples` | number | No | Number of randomized personas. Default: 50 |
| `maxConcurrency` | number | No | Parallel journey limit. Default: 5 |

**Returns**: Job ID for async polling.

---

### `marketing_discover_status` 🔒 Enterprise

**What it does**: Check status of an audience discovery job.

**Why you'd use it**: Poll for completion of long-running audience discovery.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jobId` | string | Yes | Job ID from `marketing_audience_discover` |

---

### `competitive_benchmark`

**What it does**: Compare UX metrics across competitor sites — form friction, cognitive load, navigation clarity, trust signals.

**Why you'd use it**: Understand how your UX stacks up against competitors without running full campaigns.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `urls` | array | Yes | URLs to benchmark (your site + competitors) |
| `metrics` | array | No | Specific metrics to compare |

**Example**:
```json
{
  "urls": [
    "https://example.com/signup",
    "https://competitor1.com/signup",
    "https://competitor2.com/signup"
  ]
}
```

**Returns**: Ranking, metric scores, specific recommendations.

---

## Demo vs Enterprise for Marketing

| Capability | Demo | Enterprise |
|------------|------|------------|
| List marketing personas | ✅ | ✅ |
| Create campaigns | ✅ | ✅ |
| Report journey results | ✅ | ✅ |
| Run campaigns automatically | ❌ | ✅ |
| Influence matrix analysis | ❌ | ✅ |
| Lever analysis | ❌ | ✅ |
| Funnel analysis | ❌ | ✅ |
| Competitive analysis | ❌ | ✅ |
| Audience discovery | ❌ | ✅ |

**Demo gives you the framework** — create campaigns, run journeys manually with Claude, report results.
**Enterprise gives you the insights** — automated execution and deep analysis.

---

## Related Documentation

- [Marketing Suite](/docs/Marketing-Suite/) — Full marketing capabilities overview
- [Values Framework](/docs/Values-Framework/) — Schwartz values and motivation
- [Persona System](/docs/Tools-Persona-System/) — Creating custom personas

---

*Last updated: v17.6.0*
