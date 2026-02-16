> **This documentation is no longer maintained here.**
>
> For the latest version, please visit: **[Persona Index](https://cbrowser.ai/docs/Persona-Index)**

---

# Persona Index

> **Copyright**: (c) 2026 Alexandria Eden. All rights reserved.
>
> **License**: [MIT License](https://github.com/alexandriashai/cbrowser/blob/main/LICENSE) - Converts to Apache 2.0 on February 5, 2030.
>
> **Contact**: alexandria.shai.eden@gmail.com

CBrowser includes 9 pre-configured user personas, each with research-backed cognitive trait profiles. Personas represent common user archetypes for testing how different users experience web interfaces.

## Available Personas

| Persona | Description | Key Characteristics |
|---------|-------------|---------------------|
| [Power User](./Persona-PowerUser.md) | Tech-savvy expert | High comprehension, low patience, rapid scanning |
| [First Timer](./Persona-FirstTimer.md) | New to the interface | Low comprehension, high curiosity, methodical |
| [Elderly User](./Persona-ElderlyUser.md) | Older adult (65+) | Low working memory, high reading tendency |
| [Mobile User](./Persona-MobileUser.md) | Smartphone-first | Low patience, high satisficing, touch-focused |
| [Impatient User](./Persona-ImpatientUser.md) | Quick to abandon | Very low patience, high FOMO |
| [Screen Reader User](./Persona-ScreenReaderUser.md) | Assistive technology | High persistence, sequential navigation |
| [Motor Tremor](./Persona-MotorTremor.md) | Motor impairment | Low risk tolerance, high patience |
| [Low Vision](./Persona-LowVision.md) | Vision impairment | High reading tendency, low change blindness |
| [ADHD](./Persona-ADHD.md) | Attention differences | Low working memory, high curiosity, low patience |

---

## Persona Trait Profiles

### Quick Reference Table

All values on 0.0-1.0 scale. Higher = more of the trait.

| Trait | Power | First | Elderly | Mobile | Impatient | Screen | Motor | Low Vision | ADHD |
|-------|-------|-------|---------|--------|-----------|--------|-------|------------|------|
| patience | 0.3 | 0.7 | 0.8 | 0.3 | 0.1 | 0.9 | 0.9 | 0.7 | 0.2 |
| riskTolerance | 0.8 | 0.3 | 0.2 | 0.5 | 0.6 | 0.2 | 0.2 | 0.3 | 0.7 |
| comprehension | 0.9 | 0.3 | 0.5 | 0.6 | 0.6 | 0.8 | 0.7 | 0.6 | 0.5 |
| persistence | 0.7 | 0.5 | 0.6 | 0.4 | 0.2 | 0.9 | 0.8 | 0.8 | 0.3 |
| curiosity | 0.8 | 0.9 | 0.4 | 0.5 | 0.3 | 0.5 | 0.4 | 0.5 | 0.9 |
| workingMemory | 0.9 | 0.5 | 0.4 | 0.5 | 0.6 | 0.7 | 0.7 | 0.6 | 0.3 |
| readingTendency | 0.2 | 0.6 | 0.8 | 0.2 | 0.1 | 0.9 | 0.7 | 0.9 | 0.2 |

---

## Persona Categories

### General Users

- **[Power User](./Persona-PowerUser.md)** - Experienced users who know shortcuts, scan quickly, and expect responsive interfaces
- **[First Timer](./Persona-FirstTimer.md)** - New users learning the interface, more exploratory and methodical
- **[Mobile User](./Persona-MobileUser.md)** - Users on smartphones with touch interaction and attention constraints
- **[Impatient User](./Persona-ImpatientUser.md)** - Users with very low tolerance for friction, quick to abandon

### Accessibility Personas

- **[Elderly User](./Persona-ElderlyUser.md)** - Older adults with age-related cognitive changes
- **[Screen Reader User](./Persona-ScreenReaderUser.md)** - Users navigating via screen reader technology
- **[Motor Tremor](./Persona-MotorTremor.md)** - Users with motor impairments affecting precision
- **[Low Vision](./Persona-LowVision.md)** - Users with significant vision impairment
- **[ADHD](./Persona-ADHD.md)** - Users with attention differences

---

## Category-Aware Values System (v16.12.0)

As of v16.12.0, CBrowser personas include a comprehensive psychological values framework that varies by persona category. This enables more nuanced simulation of user decision-making and motivation.

### Persona Value Categories

Each persona belongs to one of five categories, which determines how their psychological values are derived:

| Category | Examples | Value Derivation |
|----------|----------|------------------|
| **cognitive** | ADHD, dyslexia, autism | Specific values based on neuroscience research into how these conditions affect motivation and decision-making |
| **physical** | motor-tremor, mobility | Security and autonomy shifts only - physical conditions primarily affect accessibility needs, not core values |
| **sensory** | color-blindness, low-vision | Neutral/balanced values - sensory differences don't correlate with value changes |
| **emotional** | anxiety, confidence | Trait-based values derived from personality research on emotional regulation |
| **general** | power-user, first-timer | Default balanced values representing typical user motivations |

### Psychological Values Framework

Each persona now includes a comprehensive values profile based on established psychological frameworks:

#### Schwartz's 10 Universal Values

All personas include scores (0.0-1.0) for Schwartz's empirically-validated value dimensions:

| Value | Description |
|-------|-------------|
| **security** | Safety, harmony, stability of society and relationships |
| **conformity** | Restraint of actions likely to upset others or violate norms |
| **tradition** | Respect for customs and ideas from culture or religion |
| **benevolence** | Preserving and enhancing the welfare of close others |
| **universalism** | Understanding, appreciation, and protection for all people |
| **selfDirection** | Independent thought and action, creativity, exploration |
| **stimulation** | Excitement, novelty, and challenge in life |
| **hedonism** | Pleasure and sensuous gratification |
| **achievement** | Personal success through demonstrating competence |
| **power** | Social status, prestige, control over people and resources |

#### Higher-Order Values

Aggregated from the 10 basic values:

| Higher-Order Value | Comprises |
|--------------------|-----------|
| **openness** | Self-direction, stimulation |
| **conservation** | Security, conformity, tradition |
| **selfEnhancement** | Achievement, power, hedonism |
| **selfTranscendence** | Benevolence, universalism |

#### Self-Determination Theory (SDT) Needs

Basic psychological needs that drive intrinsic motivation:

| Need | Description |
|------|-------------|
| **autonomy** | Need to feel in control of one's own behaviors and goals |
| **competence** | Need to gain mastery and feel effective |
| **relatedness** | Need to feel connected to others |

#### Maslow's Hierarchy Level

Each persona is positioned on Maslow's hierarchy (1-5):

| Level | Name | Focus |
|-------|------|-------|
| 1 | Physiological | Basic survival needs |
| 2 | Safety | Security and stability |
| 3 | Belonging | Social connection |
| 4 | Esteem | Achievement and recognition |
| 5 | Self-Actualization | Personal growth and fulfillment |

### Category-Specific Value Patterns

**Cognitive Personas (ADHD, Dyslexia, Autism):**
- Higher `stimulation` and `selfDirection` values (novelty-seeking, autonomy preference)
- Lower `conformity` and `tradition` (different relationship with social norms)
- Values derived from neuroscience research on dopamine systems and executive function

**Physical Personas (Motor Tremor, Mobility):**
- Elevated `security` values (heightened awareness of physical safety)
- Elevated `autonomy` SDT need (maintaining independence is paramount)
- Other values remain balanced

**Sensory Personas (Color-Blindness, Low-Vision):**
- Neutral/balanced values across all dimensions
- Sensory processing differences don't correlate with value changes
- Focus is on accessibility needs, not motivation differences

**Emotional Personas (Anxiety, Low Confidence):**
- Higher `security` and `conformity` values
- Lower `stimulation` and `riskTolerance`
- Derived from personality psychology research

**General Personas (Power User, First Timer, etc.):**
- Default balanced values representing typical user populations
- Values may shift based on specific persona characteristics (e.g., power users higher on `achievement`)

### Research Citations

As of v16.12.0, accessibility personas include a `researchBasis` field containing academic citations that support the trait and value profiles. This ensures scientific validity and allows developers to trace assumptions back to peer-reviewed sources.

Example research basis for ADHD persona:
- Barkley (1997) - Executive function theory
- Volkow et al. (2011) - Dopamine system differences
- Schwartz et al. (2012) - Value structures in populations

### Using Values in Testing

Values influence simulated decision-making during cognitive journeys:

```typescript
// Journey decisions factor in persona values
await cognitive_journey_init({
  persona: "adhd",
  goal: "complete registration",
  startUrl: "https://example.com/signup"
});

// ADHD persona with high stimulation/selfDirection values:
// - More likely to explore interesting tangents
// - Less likely to follow prescribed paths
// - Higher engagement with novel UI elements
// - Lower tolerance for repetitive forms
```

---

## Using Personas

### Via MCP Tool

```typescript
await cognitive_journey_init({
  persona: "elderly-user",
  goal: "complete checkout",
  startUrl: "https://example.com/shop"
});
```

### Via CLI

```bash
npx cbrowser cognitive-journey \
  --persona elderly-user \
  --start https://example.com/shop \
  --goal "complete checkout"
```

### Custom Traits

Override any trait for a built-in persona:

```typescript
await cognitive_journey_init({
  persona: "power-user",
  goal: "find settings",
  startUrl: "https://example.com",
  customTraits: {
    patience: 0.1  // Even more impatient power user
  }
});
```

---

## Research Basis

Persona trait values are derived from peer-reviewed research:

| Persona | Primary Research Sources |
|---------|-------------------------|
| Power User | Nielsen (2006) expert user studies |
| First Timer | Card et al. (1983) novice-expert differences |
| Elderly User | Czaja & Lee (2007) aging and technology |
| Mobile User | Adipat et al. (2011) mobile usability |
| Screen Reader | Lazar et al. (2007) assistive technology |
| Motor Tremor | Trewin & Pain (1999) motor impairment HCI |
| Low Vision | Jacko et al. (2000) low vision computing |
| ADHD | Goodman et al. (2007) ADHD and web use |

---

## Trait Interactions

When personas encounter challenges, their trait combinations produce characteristic behaviors:

| Persona | Typical Response to Friction |
|---------|------------------------------|
| Power User | Tries keyboard shortcuts, abandons quickly if blocked |
| First Timer | Reads help text, tries multiple options systematically |
| Elderly User | Re-reads content, may call for help, patient retries |
| Mobile User | Taps repeatedly, tries swiping, abandons if >2 taps needed |
| Impatient User | Immediate abandonment, high frustration expression |
| Screen Reader | Navigates to next element, uses landmarks, persists |
| Motor Tremor | Careful targeting, uses larger targets, avoids hover |
| Low Vision | Zooms in, traces text carefully, uses high contrast |
| ADHD | Distracted by other elements, forgets original goal |

---

## Creating Custom Personas

Use the questionnaire or define traits directly:

```typescript
// Via questionnaire (generates trait profile)
await runPersonaQuestionnaire();

// Direct definition
const customPersona = {
  patience: 0.4,
  riskTolerance: 0.6,
  comprehension: 0.7,
  persistence: 0.5,
  curiosity: 0.8,
  workingMemory: 0.6,
  readingTendency: 0.3
};
```

---

## See Also

- [Trait Index](../traits/Trait-Index.md) - All 25 cognitive traits explained
- [Cognitive User Simulation](../COGNITIVE-SIMULATION.md) - Main documentation
- [Persona Questionnaire](../PERSONA-QUESTIONNAIRE.md) - Generate custom personas
- [Multi-Persona Comparison](../GETTING-STARTED.md) - Compare across personas

---

## Bibliography

See [Complete Bibliography](../research/Bibliography.md) for all academic sources used in persona development.
