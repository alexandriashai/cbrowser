# Persona Index

> **Copyright**: (c) 2026 WF Media (Alexandria Eden). All rights reserved.
>
> **License**: [Business Source License 1.1](https://github.com/alexandriashai/cbrowser/blob/main/LICENSE) - Converts to Apache 2.0 on February 5, 2030.
>
> **Contact**: alexandria.shai.eden@gmail.com

CBrowser includes 9 pre-configured user personas, each with research-backed cognitive trait profiles. Personas represent common user archetypes for testing how different users experience web interfaces.

## Available Personas

| Persona | Description | Key Characteristics |
|---------|-------------|---------------------|
| [Power User](Persona-PowerUser) | Tech-savvy expert | High comprehension, low patience, rapid scanning |
| [First Timer](Persona-FirstTimer) | New to the interface | Low comprehension, high curiosity, methodical |
| [Elderly User](Persona-ElderlyUser) | Older adult (65+) | Low working memory, high reading tendency |
| [Mobile User](Persona-MobileUser) | Smartphone-first | Low patience, high satisficing, touch-focused |
| [Impatient User](Persona-ImpatientUser) | Quick to abandon | Very low patience, high FOMO |
| [Screen Reader User](Persona-ScreenReaderUser) | Assistive technology | High persistence, sequential navigation |
| [Motor Tremor](Persona-MotorTremor) | Motor impairment | Low risk tolerance, high patience |
| [Low Vision](Persona-LowVision) | Vision impairment | High reading tendency, low change blindness |
| [ADHD](Persona-ADHD) | Attention differences | Low working memory, high curiosity, low patience |

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

- **[Power User](Persona-PowerUser)** - Experienced users who know shortcuts, scan quickly, and expect responsive interfaces
- **[First Timer](Persona-FirstTimer)** - New users learning the interface, more exploratory and methodical
- **[Mobile User](Persona-MobileUser)** - Users on smartphones with touch interaction and attention constraints
- **[Impatient User](Persona-ImpatientUser)** - Users with very low tolerance for friction, quick to abandon

### Accessibility Personas

- **[Elderly User](Persona-ElderlyUser)** - Older adults with age-related cognitive changes
- **[Screen Reader User](Persona-ScreenReaderUser)** - Users navigating via screen reader technology
- **[Motor Tremor](Persona-MotorTremor)** - Users with motor impairments affecting precision
- **[Low Vision](Persona-LowVision)** - Users with significant vision impairment
- **[ADHD](Persona-ADHD)** - Users with attention differences

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

- [Trait Index](../traits/Trait-Index) - All 25 cognitive traits explained
- [Cognitive User Simulation](../Cognitive-User-Simulation) - Main documentation
- [Persona Questionnaire](../Persona-Questionnaire) - Generate custom personas
- [Multi-Persona Comparison](../Multi-Persona-Comparison) - Compare across personas

---

## Bibliography

See [Complete Bibliography](../research/Bibliography) for all academic sources used in persona development.
