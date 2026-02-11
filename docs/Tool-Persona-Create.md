# Creating Custom Personas

**Build personas that match your actual users, not generic archetypes.**

CBrowser's persona creation tools let you build custom cognitive profiles from scratch — either by answering a research-backed questionnaire or by describing the person in natural language. Your custom personas behave consistently across all cognitive journey and testing tools.

---

## Two Ways to Create Personas

### 1. Description Mode (Fast)

Describe the persona in natural language, AI infers the traits.

```json
// Step 1: Start creation
{
  "tool": "persona_create_start",
  "params": {
    "mode": "description",
    "name": "enterprise-cto"
  }
}

// Step 2: Provide description
{
  "tool": "persona_create_from_description",
  "params": {
    "sessionId": "create_abc123",
    "description": "CTO at a Fortune 500 company. Extremely time-constrained, delegates evaluation to team. Only looks at executive summaries and security certifications. Skeptical of vendors, needs proof of enterprise customers. Won't read more than 2 paragraphs."
  }
}

// Step 3: Review and submit
{
  "tool": "persona_create_submit_traits",
  "params": {
    "sessionId": "create_abc123",
    "traits": { /* reviewed/adjusted traits */ },
    "save": true
  }
}
```

---

### 2. Questionnaire Mode (Precise)

Answer research-backed questions to set exact trait values.

```json
// Step 1: Start creation
{
  "tool": "persona_create_start",
  "params": {
    "mode": "questionnaire",
    "name": "cautious-buyer"
  }
}

// Step 2: Start questionnaire
{
  "tool": "persona_create_questionnaire_start",
  "params": {
    "sessionId": "create_abc123",
    "comprehensive": false  // 8 core traits
  }
}

// Step 3: Answer each question
{
  "tool": "persona_create_questionnaire_answer",
  "params": {
    "sessionId": "create_abc123",
    "answer": 2  // e.g., "Somewhat patient"
  }
}
// Repeat for each question...
```

---

## The 25 Cognitive Traits

Custom personas are built from 25 research-validated traits:

### Tier 1: Core (7 traits)

| Trait | Low Value | High Value |
|-------|-----------|------------|
| **Patience** | Abandons quickly on any delay | Waits indefinitely |
| **Risk Tolerance** | Only clicks familiar things | Clicks anything |
| **Comprehension** | Misreads icons, confused by layout | Gets it instantly |
| **Persistence** | Gives up after first failure | Keeps trying forever |
| **Curiosity** | Direct path only | Explores everything |
| **Working Memory** | Forgets what they tried | Perfect recall |
| **Reading Tendency** | Scans for buttons | Reads every word |

### Tier 2: Emotional (4 traits)

| Trait | Low Value | High Value |
|-------|-----------|------------|
| **Resilience** | Derailed by any setback | Bounces back instantly |
| **Self-Efficacy** | "I can't figure this out" | "I can do anything" |
| **Trust Calibration** | Trusts nothing | Trusts everything |
| **Interrupt Recovery** | Loses all context | Picks up seamlessly |

### Tier 3: Decision-Making (5 traits)

| Trait | Low Value | High Value |
|-------|-----------|------------|
| **Satisficing** | First option works | Must find the best |
| **Information Foraging** | Takes what's offered | Hunts for more |
| **Anchoring Bias** | First price is the price | Compares extensively |
| **Time Horizon** | Only immediate benefits | Plans for future |
| **Attribution Style** | "It's my fault" | "It's their fault" |

### Tier 4: Planning (3 traits)

| Trait | Low Value | High Value |
|-------|-----------|------------|
| **Metacognitive Planning** | Dives in without plan | Plans every step |
| **Procedural Fluency** | Struggles with forms | Handles any workflow |
| **Transfer Learning** | Every site is new | Applies past experience |

### Tier 5: Perception (2 traits)

| Trait | Low Value | High Value |
|-------|-----------|------------|
| **Change Blindness** | Misses all changes | Notices everything |
| **Mental Model Rigidity** | Expects exact patterns | Adapts to variations |

### Tier 6: Social (4 traits)

| Trait | Low Value | High Value |
|-------|-----------|------------|
| **Authority Sensitivity** | Ignores credentials | Persuaded by authority |
| **Emotional Contagion** | Unaffected by tone | Mirrors page emotion |
| **FOMO** | Immune to urgency | Panics at countdown |
| **Social Proof Sensitivity** | Ignores reviews | Heavily influenced |

---

## Example: Creating "Skeptical Enterprise Buyer"

### Using Description Mode

```json
{
  "description": "IT procurement manager at a healthcare company. Extremely risk-averse due to compliance requirements. Needs to see HIPAA certification, SOC 2 reports, and existing healthcare customers. Won't proceed without these. Takes notes on everything. Will read the fine print. Doesn't trust marketing language - wants technical docs."
}
```

**Inferred traits:**
- `riskTolerance`: 0.15 (very low)
- `trustCalibration`: 0.25 (skeptical)
- `readingTendency`: 0.85 (reads everything)
- `authoritySensitivity`: 0.80 (needs credentials)
- `socialProofSensitivity`: 0.70 (wants customer references)
- `patience`: 0.70 (thorough but not slow)
- `proceduralFluency`: 0.65 (handles enterprise forms)

---

### Using Questionnaire Mode

**Q1: When a website takes longer than expected to load, this person typically:**
- (1) Leaves immediately
- (2) Waits a few seconds then leaves
- (3) Waits patiently for about 10 seconds
- (4) Waits as long as it takes
→ Answer: 3 (patience = 0.6)

**Q2: When encountering an unfamiliar button or feature, this person:**
- (1) Never clicks anything unfamiliar
- (2) Rarely clicks unfamiliar elements
- (3) Sometimes explores new features
- (4) Clicks on everything to see what happens
→ Answer: 2 (riskTolerance = 0.25)

*Continue for all 8 core traits...*

---

## Using Custom Personas

Once created, use your persona anywhere:

```json
// In cognitive journeys
{
  "tool": "cognitive_journey_init",
  "params": {
    "persona": "skeptical-enterprise-buyer",
    "startUrl": "https://example.com/enterprise",
    "goal": "Request a demo"
  }
}

// In persona comparisons
{
  "tool": "compare_personas",
  "params": {
    "personas": ["skeptical-enterprise-buyer", "startup-founder", "first-timer"],
    "startUrl": "https://example.com/pricing",
    "goal": "Understand pricing"
  }
}

// In empathy audits
{
  "tool": "empathy_audit",
  "params": {
    "personas": ["skeptical-enterprise-buyer"],
    "task": "Find security documentation"
  }
}
```

---

## Best Practices

### Be Specific

**Good**: "Financial advisor at a regional bank. 50s, uses technology but not an early adopter. Concerned about data security. Needs to justify purchases to compliance department."

**Bad**: "Business professional"

### Include Motivations

What does this person *want*? What are they *afraid of*? These inform trait values.

### Include Context

Job title, industry, company size, tech comfort level all help inference.

### Test and Iterate

Run a few journeys, see if the behavior matches expectations, adjust traits if needed.

---

## Trait Correlations

CBrowser applies research-based trait correlations automatically:

| If You Set... | These Also Adjust |
|---------------|-------------------|
| Low patience | ↓ Resilience, ↑ Satisficing |
| Low risk tolerance | ↓ Curiosity, ↑ Social proof need |
| Low comprehension | ↑ Reading tendency (compensating) |
| High FOMO | ↓ Time horizon |

This creates more realistic, internally consistent personas.

---

## Related Documentation

- [Persona Index](/docs/Persona-Index/) — Built-in personas
- [Trait Index](/docs/Trait-Index/) — Deep dives on each trait
- [Persona Questionnaire](/docs/Persona-Questionnaire/) — Full questionnaire reference
- [Values Framework](/docs/Values-Framework/) — Schwartz values and motivations

---

*Last updated: v17.6.0*
