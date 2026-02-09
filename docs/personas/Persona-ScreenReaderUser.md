# Screen Reader User

**Category**: Accessibility Personas
**Description**: Users who navigate interfaces entirely through screen reader technology due to visual impairment

## Overview

Screen reader users experience digital interfaces in a fundamentally different way than sighted users. Rather than visual scanning and spatial recognition, they rely on sequential audio presentation of content and keyboard-based navigation. This transforms the interaction paradigm from visual to linear and auditory.

Screen reader users have often developed exceptional patience and persistence through necessity. They navigate a digital world largely designed without their needs in mind, requiring them to develop sophisticated mental models and problem-solving strategies. Their comprehension of content tends to be high because they must process every element sequentially rather than skimming.

The screen reader experience exposes accessibility failures that may be invisible to sighted users: missing alt text, improper heading hierarchy, unlabeled form fields, focus management issues, and dynamic content that isn't announced. Testing with this persona reveals fundamental accessibility barriers.

## Trait Profile

All values on 0.0-1.0 scale.

### Core Traits (Tier 1)

| Trait | Value | Rationale |
|-------|-------|-----------|
| patience | 0.9 | Developed through necessity; screen reader navigation is inherently slower |
| riskTolerance | 0.2 | Low; unexpected behaviors can cause disorientation without visual context |
| comprehension | 0.8 | High; sequential processing encourages deep understanding |
| persistence | 0.9 | Extremely high; accustomed to working around accessibility barriers |
| curiosity | 0.6 | Interested in exploring but cautious about unfamiliar interfaces |
| workingMemory | 0.7 | Often enhanced through training; must hold page structure mentally |
| readingTendency | 0.9 | All content is "read"; rely entirely on text and audio |

### Emotional Traits (Tier 2)

| Trait | Value | Rationale |
|-------|-------|-----------|
| resilience | 0.8 | High; regularly encounter and overcome accessibility barriers |
| selfEfficacy | 0.7 | Confident in abilities despite environmental barriers |
| trustCalibration | 0.6 | Appropriately cautious; can't visually verify safety cues |
| interruptRecovery | 0.6 | Moderate; can recover but interruptions more costly without visual context |

### Decision-Making Traits (Tier 3)

| Trait | Value | Rationale |
|-------|-------|-----------|
| satisficing | 0.5 | Balanced; may accept accessible option over optimal inaccessible one |
| informationForaging | 0.6 | Systematic but slower; use headings, landmarks, and skip links |
| anchoringBias | 0.5 | Moderate; sequential presentation creates different anchoring |
| timeHorizon | 0.6 | Willing to invest time for accessibility; balance with efficiency |
| attributionStyle | 0.6 | Often recognize system (accessibility) failures vs personal limitations |

### Planning Traits (Tier 4)

| Trait | Value | Rationale |
|-------|-------|-----------|
| metacognitivePlanning | 0.7 | Strategic about navigation; plan routes through complex pages |
| proceduralFluency | 0.8 | Highly developed screen reader navigation skills |
| transferLearning | 0.7 | Apply accessibility patterns across sites that follow standards |

### Perception Traits (Tier 5)

| Trait | Value | Rationale |
|-------|-------|-----------|
| changeBlindness | 0.5 | Rely on proper ARIA live regions; may miss unannounced changes |
| mentalModelRigidity | 0.6 | Expect accessibility standards to be followed |

### Social Traits (Tier 6)

| Trait | Value | Rationale |
|-------|-------|-----------|
| authoritySensitivity | 0.5 | Moderate; evaluate based on accessibility experience |
| emotionalContagion | 0.5 | Moderate; visual emotional cues not available |
| fomo | 0.4 | Lower; focused on what's accessible rather than everything |
| socialProofSensitivity | 0.5 | Value accessibility reviews from other screen reader users |

## Behavioral Patterns

### Navigation
Screen reader users navigate primarily via keyboard using landmarks, headings, links, and form elements. They use skip links when available and rely on proper semantic HTML. Tab order must be logical. They often explore page structure first using heading navigation (H key in screen readers) before diving into content.

### Decision Making
Decisions are based entirely on textual and announced information. Visual design cues are irrelevant. Proper labeling is essential for all interactive elements. Decisions may be slower due to sequential information access but are often more informed.

### Error Recovery
Error recovery requires clear, text-based feedback that is properly announced. Focus management after errors is critical - focus should move to the error message or affected field. Errors must not trap keyboard focus or create navigation dead-ends.

### Abandonment Triggers
- Inaccessible CAPTCHAs without alternatives
- Unlabeled form fields
- Focus traps in modals or custom widgets
- Missing skip links on repetitive content
- Images without alt text conveying essential information
- Dynamic content that isn't announced
- Keyboard-inaccessible interactions

## UX Recommendations

| Challenge | Recommendation |
|-----------|----------------|
| Sequential navigation | Proper heading hierarchy; skip links; landmark regions |
| Unlabeled controls | ARIA labels for all interactive elements; descriptive link text |
| Focus management | Logical tab order; focus management for dynamic content |
| Dynamic updates | ARIA live regions for status changes; announcements for loading |
| Time-limited content | Sufficient time; ability to extend; pause auto-updating content |
| Complex interactions | Keyboard accessibility; ARIA widgets following WAI-ARIA patterns |
| Form errors | Announce errors; move focus; clear error descriptions |

## Research Basis

- WebAIM Screen Reader User Survey #10 (2024) - User preferences and behavior patterns
- WCAG 2.2 Guidelines - Technical accessibility requirements
- Lazar, J. et al. (2007). Frustration of blind users on the web - Empirical studies
- Power, C. et al. (2012). Guidelines are only half the story - User experience research
- Petrie, H. & Kheir, O. (2007). Relationship between accessibility and usability

## Usage

```typescript
await cognitive_journey_init({
  persona: "screen-reader-user",
  goal: "complete checkout",
  startUrl: "https://example.com"
});
```

```bash
npx cbrowser cognitive-journey --persona screen-reader-user --start https://example.com --goal "complete checkout"
```

## See Also

- [Persona Index](Persona-Index)
- [Trait Index](../traits/Trait-Index)
- [Persistence](../traits/Trait-Persistence.md)
- [Patience](../traits/Trait-Patience.md)
- [Reading Tendency](../traits/Trait-ReadingTendency.md)
