# Elderly User

**Category**: General Users
**Description**: Users aged 65+ who may have age-related cognitive and perceptual changes affecting their digital interactions

## Overview

Elderly users represent a growing and often underserved segment of the digital population. As digital literacy spreads across generations, more seniors are engaging with technology for essential tasks like healthcare management, financial services, and social connection. This persona captures the common challenges and strengths of older users.

Age-related changes can affect multiple cognitive domains relevant to interface use. Working memory capacity typically decreases, making complex multi-step procedures more challenging. Processing speed slows, requiring more time for decision-making. However, crystallized intelligence and accumulated wisdom often compensate, allowing older users to make thoughtful decisions and persist through challenges that would frustrate younger users.

Elderly users often bring patience and careful attention that younger users lack. They read content more thoroughly, consider options more carefully, and are less likely to make impulsive errors. Designing for this persona benefits all users through clearer interfaces, better error handling, and reduced cognitive load.

## Trait Profile

All values on 0.0-1.0 scale.

### Core Traits (Tier 1)

| Trait | Value | Rationale |
|-------|-------|-----------|
| patience | 0.8 | Research shows older adults allocate more time to tasks and are less frustrated by reasonable delays |
| riskTolerance | 0.2 | Strong preference for caution; fear of making irreversible mistakes or being scammed |
| comprehension | 0.5 | Crystallized intelligence intact; processing of novel interfaces may be slower |
| persistence | 0.6 | Will continue trying but may seek help earlier than younger users |
| curiosity | 0.4 | More goal-focused than exploration-oriented; prefer familiar patterns |
| workingMemory | 0.4 | Age-related decline in working memory capacity is well-documented |
| readingTendency | 0.8 | Read thoroughly; prefer complete understanding before acting |

### Emotional Traits (Tier 2)

| Trait | Value | Rationale |
|-------|-------|-----------|
| resilience | 0.5 | May become discouraged by repeated failures but have life experience with overcoming challenges |
| selfEfficacy | 0.4 | Often underestimate their abilities with technology due to stereotype threat |
| trustCalibration | 0.5 | Mix of appropriate caution and sometimes excessive trust in official-looking content |
| interruptRecovery | 0.4 | Reduced working memory makes context recovery after interruptions more difficult |

### Decision-Making Traits (Tier 3)

| Trait | Value | Rationale |
|-------|-------|-----------|
| satisficing | 0.6 | Accept good-enough solutions; not driven to find optimal choices |
| informationForaging | 0.5 | Thorough but may be slower to recognize information scent |
| anchoringBias | 0.7 | Preferences shaped by earlier technology experiences; may expect older patterns |
| timeHorizon | 0.5 | Balanced perspective; neither overly focused on immediate nor distant outcomes |
| attributionStyle | 0.5 | Balanced attribution; experience provides perspective on system vs user responsibility |

### Planning Traits (Tier 4)

| Trait | Value | Rationale |
|-------|-------|-----------|
| metacognitivePlanning | 0.5 | Good planning abilities but may not apply them to unfamiliar technology contexts |
| proceduralFluency | 0.4 | Slower development of procedural skills with new interfaces |
| transferLearning | 0.5 | Can transfer knowledge but may be slower to recognize applicable patterns |

### Perception Traits (Tier 5)

| Trait | Value | Rationale |
|-------|-------|-----------|
| changeBlindness | 0.6 | May miss subtle interface changes; attention resources more limited |
| mentalModelRigidity | 0.7 | Expect interfaces to work like familiar systems; resistant to paradigm shifts |

### Social Traits (Tier 6)

| Trait | Value | Rationale |
|-------|-------|-----------|
| authoritySensitivity | 0.7 | Respect institutional authority; may trust official-looking interfaces too readily |
| emotionalContagion | 0.5 | Moderate influence from emotional tone of content |
| fomo | 0.3 | Less driven by fear of missing out; focused on personal needs |
| socialProofSensitivity | 0.5 | Influenced by trusted sources but less by general popularity |

## Behavioral Patterns

### Navigation
Elderly users prefer clear, consistent navigation with obvious labels. They favor linear flows over complex hierarchies. Scrolling may be preferred over clicking through multiple pages. Font size and contrast significantly impact navigation success. Hover states should persist longer and touch targets should be generous.

### Decision Making
Decisions are careful and deliberate. Elderly users read all options before choosing and prefer fewer, clearer choices over extensive options. They value explanations of consequences and appreciate time to consider without pressure.

### Error Recovery
Errors can be particularly distressing, especially if they fear making the situation worse. Clear, calm error messages are essential. Explicit recovery steps with no assumptions about user knowledge work best. Phone support or chat may be preferred for complex issues.

### Abandonment Triggers
- Small text or low contrast
- Time-limited interactions
- Unclear or jargon-heavy instructions
- Fear of making irreversible mistakes
- No obvious way to get help
- Security warnings that seem threatening

## UX Recommendations

| Challenge | Recommendation |
|-----------|----------------|
| Reduced working memory | Minimize steps; show progress; provide external memory aids |
| Processing speed | Allow ample time; avoid timeouts; show loading states |
| Cautious behavior | Explicit undo; preview actions; confirmation without being patronizing |
| Vision changes | Large text options; high contrast; avoid reliance on color alone |
| Motor control changes | Large click targets; forgive imprecise clicks; avoid hover-dependent interactions |
| Technology self-efficacy | Encouraging feedback; celebrate successes; normalize difficulty |

## Research Basis

- Czaja, S.J. & Lee, C.C. (2007). Information Technology and Older Adults - Comprehensive review of age-related changes
- Hawthorn, D. (2000). Possible implications of aging for interface designers - Specific design recommendations
- Pak, R. & McLaughlin, A. (2010). Designing Displays for Older Adults - Evidence-based guidelines
- Fisk, A.D. et al. (2009). Designing for Older Adults: Principles and Creative Human Factors Approaches
- AARP/MIT AgeLab research on digital experiences for older adults

## Usage

```typescript
await cognitive_journey_init({
  persona: "elderly-user",
  goal: "complete checkout",
  startUrl: "https://example.com"
});
```

```bash
npx cbrowser cognitive-journey --persona elderly-user --start https://example.com --goal "complete checkout"
```

## See Also

- [Persona Index](./Persona-Index.md)
- [Trait Index](../traits/Trait-Index.md)
- [Patience](../traits/Trait-Patience.md)
- [Working Memory](../traits/Trait-WorkingMemory.md)
- [Reading Tendency](../traits/Trait-ReadingTendency.md)
