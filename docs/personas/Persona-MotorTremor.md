# Motor Tremor User

**Category**: Accessibility Personas
**Description**: Users with motor control impairments affecting precise movements, such as essential tremor, Parkinson's disease, or other neuromuscular conditions

## Overview

Motor tremor users experience involuntary shaking or movement that affects their ability to perform precise motor tasks. This includes difficulty with small click targets, drag-and-drop interactions, hover states, and any interface element requiring steady, accurate movement. Conditions causing tremor range from essential tremor (the most common movement disorder) to Parkinson's disease, multiple sclerosis, and age-related motor changes.

Users with motor tremor have developed strategies to compensate for their movement challenges. They often use keyboard navigation when possible, stabilize their arms against surfaces, use assistive technologies like switch access or adapted mice, and approach interaction targets with deliberate care. They have learned to be patient with themselves and with interfaces.

The challenges faced by motor tremor users highlight the importance of generous click targets, keyboard alternatives, and forgiving interaction patterns. Many design improvements for this persona benefit all users, including those using touch screens in moving vehicles or with temporary motor impairments.

## Trait Profile

All values on 0.0-1.0 scale.

### Core Traits (Tier 1)

| Trait | Value | Rationale |
|-------|-------|-----------|
| patience | 0.9 | Developed through necessity; understand that interactions will take more time |
| riskTolerance | 0.2 | Very cautious; misclicks can have unwanted consequences |
| comprehension | 0.7 | Unaffected by motor impairment; cognitive abilities intact |
| persistence | 0.8 | High; committed to completing tasks despite physical challenges |
| curiosity | 0.5 | Moderate; exploration limited by interaction cost |
| workingMemory | 0.7 | Normal capacity; may be partially occupied by motor planning |
| readingTendency | 0.6 | Moderate; read carefully to avoid needing re-interaction |

### Emotional Traits (Tier 2)

| Trait | Value | Rationale |
|-------|-------|-----------|
| resilience | 0.7 | Developed through adapting to physical challenges |
| selfEfficacy | 0.6 | Confident in abilities but aware of limitations |
| trustCalibration | 0.6 | Appropriately cautious about committing to actions |
| interruptRecovery | 0.6 | Moderate; interruptions less costly than for some personas |

### Decision-Making Traits (Tier 3)

| Trait | Value | Rationale |
|-------|-------|-----------|
| satisficing | 0.3 | Low; prefer to choose carefully to avoid need for corrections |
| informationForaging | 0.6 | Thorough to reduce need for repeated navigation |
| anchoringBias | 0.5 | Moderate; don't favor first option if requiring corrections |
| timeHorizon | 0.6 | Willing to invest time upfront to avoid future corrections |
| attributionStyle | 0.5 | Understand interaction between personal abilities and interface design |

### Planning Traits (Tier 4)

| Trait | Value | Rationale |
|-------|-------|-----------|
| metacognitivePlanning | 0.7 | Plan interactions carefully to minimize motor demands |
| proceduralFluency | 0.6 | Develop routines but each interaction requires conscious effort |
| transferLearning | 0.6 | Apply accessibility patterns across contexts |

### Perception Traits (Tier 5)

| Trait | Value | Rationale |
|-------|-------|-----------|
| changeBlindness | 0.5 | Normal visual attention; may miss changes during motor focus |
| mentalModelRigidity | 0.5 | Moderate; expect accessibility considerations |

### Social Traits (Tier 6)

| Trait | Value | Rationale |
|-------|-------|-----------|
| authoritySensitivity | 0.5 | Moderate; evaluate based on accessibility support |
| emotionalContagion | 0.5 | Normal emotional sensitivity |
| fomo | 0.4 | Lower; focused on accessible experiences |
| socialProofSensitivity | 0.5 | Value accessibility reviews from others with motor impairments |

## Behavioral Patterns

### Navigation
Motor tremor users favor keyboard navigation over mouse/touch when possible. When using a pointer, they approach targets slowly and deliberately, often using arm stabilization. They benefit from large click targets and avoid hover-dependent interactions. Sticky menus that require precise mouse control are particularly challenging.

### Decision Making
Decisions are careful and deliberate because correction costs are high. Users prefer to understand all implications before committing to an action. Preview functionality is valuable. The ability to undo or correct without extensive re-navigation is essential.

### Error Recovery
Errors caused by misclicks are frustrating and common. Error recovery should not require precise motor control. Confirmation dialogs should have well-spaced buttons. The ability to undo actions reduces the cost of accidental clicks.

### Abandonment Triggers
- Small click targets (under 44x44 pixels)
- Hover-only interactions with no click alternative
- Drag-and-drop without keyboard alternative
- Time-limited interactions during data entry
- Sliding/swiping interactions requiring precise control
- Double-click requirements
- Captchas requiring precise interaction

## UX Recommendations

| Challenge | Recommendation |
|-----------|----------------|
| Small click targets | Minimum 44x44 pixel touch targets; larger for primary actions |
| Precision requirements | Forgiving click areas; expand clickable region beyond visual boundary |
| Hover interactions | Provide click/keyboard alternatives; persistent hover states |
| Drag and drop | Keyboard alternatives; click-to-select + click-to-place pattern |
| Misclick recovery | Generous undo; confirmation for destructive actions |
| Time pressure | Disable timeouts for form inputs; extend session limits |
| Complex gestures | Simple tap/click alternatives to swipes and multi-touch |

## Research Basis

- Trewin, S. & Pain, H. (1999). Keyboard and mouse errors due to motor impairments - Empirical studies
- Keates, S. et al. (2002). Cursor measures for motion-impaired users - Design recommendations
- WCAG 2.2 Target Size guidelines (2.5.5, 2.5.8) - Minimum target sizes
- MacKenzie, I.S. & Jusoh, S. (2001). Evaluation of pointing devices for users with motor impairments
- Wobbrock, J.O. & Gajos, K.Z. (2008). Ability-based design - Adapting interfaces to abilities

## Usage

```typescript
await cognitive_journey_init({
  persona: "motor-tremor",
  goal: "complete checkout",
  startUrl: "https://example.com"
});
```

```bash
npx cbrowser cognitive-journey --persona motor-tremor --start https://example.com --goal "complete checkout"
```

## See Also

- [Persona Index](./Persona-Index.md)
- [Trait Index](../traits/Trait-Index.md)
- [Patience](../traits/Trait-Patience.md)
- [Persistence](../traits/Trait-Persistence.md)
- [Risk Tolerance](../traits/Trait-RiskTolerance.md)
