# Persona System Tools

**Test your site through the eyes of real user types, not imaginary "average users."**

These 15 tools let you create, customize, and inspect cognitive personas backed by 25 research-validated traits and Schwartz's universal values framework. Every persona behaves differently because they *think* differently.

---

## When to Use These Tools

- **You're building for a specific audience** and want to validate they can actually use your product
- **You need to test accessibility** with realistic disability simulations, not just WCAG checkers
- **You want consistent test personas** across your team with documented cognitive profiles
- **You're customizing personas** for your specific user base

---

## Tools

### `list_cognitive_personas`

**What it does**: Returns all available personas with their complete cognitive trait profiles.

**Why you'd use it**: See what personas exist and understand their characteristics before selecting one.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `category` | string | No | Filter by category: `general`, `accessibility`, `marketing`, `all` |
| `detailed` | boolean | No | Include full trait values. Default: false |

**Example**:
```json
{
  "category": "accessibility",
  "detailed": true
}
```

**Returns**: List of personas with names, descriptions, trait summaries, and (if detailed) all 25 trait values.

---

### `persona_create_start`

**What it does**: Begins the persona creation flow. Choose between questionnaire mode (answer questions to generate traits) or description mode (describe the persona in natural language).

**Why you'd use it**: Start building a custom persona tailored to your specific user base.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mode` | string | Yes | `questionnaire` or `description` |
| `name` | string | Yes | Name for the new persona |

**Example**:
```json
{
  "mode": "description",
  "name": "startup-cto"
}
```

---

### `persona_create_from_description`

**What it does**: Generate a persona from a natural language description. Returns a trait reference matrix for review before finalizing.

**Why you'd use it**: Quickly create a persona by describing who they are, rather than answering individual trait questions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | Yes | Session ID from `persona_create_start` |
| `description` | string | Yes | Natural language description of the persona |

**Example**:
```json
{
  "sessionId": "create_abc123",
  "description": "A senior developer at a Fortune 500 company. Highly technical, impatient with marketing fluff, wants to see code examples immediately. Uses keyboard shortcuts for everything. Skeptical of new tools until proven."
}
```

**Returns**: Inferred trait values with confidence scores and suggested adjustments.

---

### `persona_create_submit_traits`

**What it does**: Finalize a description-based persona by confirming or adjusting the inferred traits.

**Why you'd use it**: Review the AI-generated traits and make corrections before saving.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | Yes | Session ID |
| `traits` | object | Yes | Final trait values (adjusted if needed) |
| `save` | boolean | No | Save persona for future use. Default: true |

---

### `persona_create_questionnaire_start`

**What it does**: Begin the questionnaire-based persona creation. Returns the first question.

**Why you'd use it**: Build a persona through guided questions when you want precise control over trait values.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | Yes | Session ID from `persona_create_start` |
| `comprehensive` | boolean | No | Use full 25-trait questionnaire vs 8-core. Default: false |

---

### `persona_create_questionnaire_answer`

**What it does**: Submit an answer to the current questionnaire question and receive the next one.

**Why you'd use it**: Progress through the questionnaire one question at a time.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | Yes | Session ID |
| `answer` | string/number | Yes | Answer to the current question |

---

### `persona_create_cancel`

**What it does**: Cancel the current persona creation session.

**Why you'd use it**: Abandon a persona creation that's no longer needed.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | Yes | Session ID to cancel |

---

### `persona_questionnaire_get`

**What it does**: Retrieve the full persona questionnaire for external use — the questions, scales, and trait mappings.

**Why you'd use it**: Build your own persona creation UI or review the research-backed questions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `version` | string | No | `core` (8 questions) or `comprehensive` (25 questions). Default: `core` |

---

### `persona_questionnaire_build`

**What it does**: Build a persona directly from questionnaire answers with category-aware safeguards.

**Why you'd use it**: Create a persona from pre-collected answers (e.g., from a user survey).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Persona name |
| `answers` | object | Yes | Map of trait names to values (0.0-1.0) |
| `category` | string | No | Persona category for value derivation rules |

---

### `persona_traits_list`

**What it does**: List all 25 cognitive traits with descriptions, research basis, and behavioral implications.

**Why you'd use it**: Understand what each trait measures before assigning values.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tier` | number | No | Filter by tier (1-6) |

**Example**:
```json
{
  "tier": 1
}
```

Returns Tier 1 core traits: Patience, Risk Tolerance, Comprehension, Persistence, Curiosity, Working Memory, Reading Tendency.

---

### `persona_trait_lookup`

**What it does**: Get detailed behavioral descriptions for specific trait values.

**Why you'd use it**: Understand what a patience value of 0.3 actually means in practice.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `trait` | string | Yes | Trait name (e.g., `patience`, `riskTolerance`) |
| `value` | number | Yes | Value to look up (0.0-1.0) |

**Example**:
```json
{
  "trait": "patience",
  "value": 0.3
}
```

**Returns**: Behavioral description, abandonment thresholds, typical actions at this level.

---

### `persona_values_lookup`

**What it does**: Retrieve the values profile for a persona — Schwartz universal values, SDT psychological needs, and Maslow hierarchy level.

**Why you'd use it**: Understand what motivates a persona and which influence patterns will resonate with them.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `persona` | string | Yes | Persona ID |

**Example**:
```json
{
  "persona": "enterprise-buyer"
}
```

**Returns**: Schwartz value rankings (security, achievement, benevolence, etc.), primary psychological needs, Maslow level.

---

### `persona_category_guidance`

**What it does**: Get guidance for handling value derivation in disability-specific personas.

**Why you'd use it**: When creating accessibility personas, understand how to assign values appropriately without stereotyping.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `category` | string | Yes | Category: `cognitive`, `physical`, `sensory`, `emotional` |

**Returns**: Value derivation strategy, research basis, warnings about common mistakes.

---

### `list_influence_patterns`

**What it does**: List all research-backed influence and persuasion patterns with their effectiveness by persona type.

**Why you'd use it**: Understand which psychological triggers work on which audiences.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `persona` | string | No | Filter to patterns effective for this persona |

**Returns**: Patterns like `scarcity`, `social_proof`, `authority`, `reciprocity` with effectiveness ratings and example implementations.

---

## The 25 Cognitive Traits

Personas are built from 25 research-validated traits organized in 6 tiers:

| Tier | Traits | What They Govern |
|------|--------|------------------|
| **1: Core** | Patience, Risk Tolerance, Comprehension, Persistence, Curiosity, Working Memory, Reading Tendency | Basic interaction patterns |
| **2: Emotional** | Resilience, Self-Efficacy, Trust Calibration, Interrupt Recovery | Response to friction and failure |
| **3: Decision** | Satisficing, Information Foraging, Anchoring Bias, Time Horizon, Attribution Style | How choices are made |
| **4: Planning** | Metacognitive Planning, Procedural Fluency, Transfer Learning | Approach to complex tasks |
| **5: Perception** | Change Blindness, Mental Model Rigidity | How UI changes are noticed/understood |
| **6: Social** | Authority Sensitivity, Emotional Contagion, FOMO, Social Proof Sensitivity | Response to social cues |

See [Trait Index](/docs/Trait-Index/) for detailed documentation of each trait.

---

## Built-in Personas

| Category | Personas |
|----------|----------|
| **General** | power-user, first-timer, mobile-user, impatient-user |
| **Accessibility** | elderly-user, screen-reader-user, motor-tremor, low-vision, cognitive-adhd |
| **Marketing** | enterprise-buyer, startup-founder, procurement-manager, technical-evaluator, impulse-shopper, price-researcher, loyal-customer, skeptical-first-timer |

---

## Related Documentation

- [Persona Index](/docs/Persona-Index/) — Complete persona profiles
- [Persona Questionnaire](/docs/Persona-Questionnaire/) — Creating custom personas
- [Trait Index](/docs/Trait-Index/) — Deep dives on each trait
- [Values Framework](/docs/Values-Framework/) — Schwartz values and motivation

---

*Last updated: v17.6.0*
