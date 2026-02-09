# Low Vision User

**Category**: Accessibility Personas
**Description**: Users with partial visual impairment who rely on magnification, high contrast, or other visual adaptations to use interfaces

## Overview

Low vision users have significant visual impairment that cannot be fully corrected with glasses or contact lenses, but retain some functional vision. This includes conditions like macular degeneration, glaucoma, diabetic retinopathy, and cataracts. Unlike screen reader users who have no functional vision, low vision users navigate visually but under significantly constrained conditions.

Low vision users employ various strategies to access digital content: screen magnification (often 200-800%), high contrast modes, color inversion, custom CSS overrides, and physical proximity to screens. These adaptations create a unique interaction paradigm where only a small portion of the interface is visible at any time, requiring extensive panning to understand page layout.

The low vision experience reveals the importance of clear visual hierarchy, sufficient color contrast, text scalability, and reduced reliance on spatial relationships. Changes happening outside the magnified viewport may be completely missed, making change management particularly important for this persona.

## Trait Profile

All values on 0.0-1.0 scale.

### Core Traits (Tier 1)

| Trait | Value | Rationale |
|-------|-------|-----------|
| patience | 0.7 | Developed through adaptation; understand interactions take longer |
| riskTolerance | 0.3 | Cautious; may miss visual cues that sighted users rely on |
| comprehension | 0.7 | Cognitive abilities intact; visual access to information may be limited |
| persistence | 0.8 | High; committed to completing tasks despite visual barriers |
| curiosity | 0.5 | Moderate; exploration costly due to magnification requirements |
| workingMemory | 0.6 | Normal capacity; some used for spatial memory of page layout |
| readingTendency | 0.9 | Read thoroughly due to high cost of re-finding information |

### Emotional Traits (Tier 2)

| Trait | Value | Rationale |
|-------|-------|-----------|
| resilience | 0.7 | Adapted to challenges; developed coping strategies |
| selfEfficacy | 0.6 | Confident with adapted strategies; aware of vision limitations |
| trustCalibration | 0.5 | May miss visual trust cues; rely on text-based indicators |
| interruptRecovery | 0.5 | Losing place in magnified view is costly |

### Decision-Making Traits (Tier 3)

| Trait | Value | Rationale |
|-------|-------|-----------|
| satisficing | 0.4 | Prefer thorough understanding; re-finding options is costly |
| informationForaging | 0.5 | Systematic due to limited viewport; can't visually scan |
| anchoringBias | 0.5 | Moderate; first option in magnified view may have advantage |
| timeHorizon | 0.6 | Invest time to learn page layout for future efficiency |
| attributionStyle | 0.5 | Understand interaction of vision limitations and design choices |

### Planning Traits (Tier 4)

| Trait | Value | Rationale |
|-------|-------|-----------|
| metacognitivePlanning | 0.7 | Strategic about navigation; minimize panning |
| proceduralFluency | 0.6 | Develop routines for common sites and patterns |
| transferLearning | 0.6 | Apply patterns but each site requires new spatial mapping |

### Perception Traits (Tier 5)

| Trait | Value | Rationale |
|-------|-------|-----------|
| changeBlindness | 0.2 | Low blindness - very attentive to visible changes; high blindness to changes outside viewport |
| mentalModelRigidity | 0.5 | Rely on learned spatial layouts |

### Social Traits (Tier 6)

| Trait | Value | Rationale |
|-------|-------|-----------|
| authoritySensitivity | 0.5 | Moderate; evaluate based on accessibility |
| emotionalContagion | 0.5 | Normal emotional sensitivity; may miss visual cues |
| fomo | 0.4 | Focused on accessible content |
| socialProofSensitivity | 0.5 | Value reviews from other low vision users |

## Behavioral Patterns

### Navigation
Low vision users navigate by panning across magnified views, often using keyboard navigation to move between elements. They build mental maps of page layouts through exploration. Consistent layouts across pages are essential. They may use a combination of magnification and screen reader for different content types.

### Decision Making
Decisions require extensive exploration to understand all options. Users may not see all choices simultaneously. Clear labeling and consistent positioning help. Summary information at the beginning of sections reduces exploration requirements.

### Error Recovery
Error messages must be high contrast and appear in predictable locations. Focus management should move errors into the viewport. Errors appearing far from the triggering element may be missed entirely.

### Abandonment Triggers
- Low contrast text or interactive elements
- Small text that doesn't scale properly
- Information conveyed only through color
- Important content appearing only on hover
- Unpredictable layout changes
- Fixed-size elements that can't be magnified
- Interfaces that break at high zoom levels

## UX Recommendations

| Challenge | Recommendation |
|-----------|----------------|
| Limited viewport | Predictable layouts; essential info in consistent locations |
| Contrast needs | WCAG AAA contrast ratios (7:1 for text, 4.5:1 for large text) |
| Magnification | Responsive layouts that work at 200-400% zoom |
| Color dependence | Never use color alone to convey information |
| Spatial relationships | Programmatic associations (labels, headings); not just proximity |
| Out-of-viewport changes | ARIA live regions; focus management for important updates |
| Reading difficulty | Resizable text; sufficient line height and letter spacing |

## Research Basis

- Szpiro, S. et al. (2016). How people with low vision access computing devices - Behavior studies
- Legge, G.E. (2007). Psychophysics of Reading in Normal and Low Vision
- WCAG 2.2 Guidelines - Contrast and resizing requirements
- Accessibility guidelines from AFB (American Foundation for the Blind)
- Shneiderman, B. (2003). Designing for people with visual impairments

## Usage

```typescript
await cognitive_journey_init({
  persona: "low-vision",
  goal: "complete checkout",
  startUrl: "https://example.com"
});
```

```bash
npx cbrowser cognitive-journey --persona low-vision --start https://example.com --goal "complete checkout"
```

## See Also

- [Persona Index](./Persona-Index.md)
- [Trait Index](../traits/Trait-Index.md)
- [Reading Tendency](../traits/Trait-ReadingTendency.md)
- [Persistence](../traits/Trait-Persistence.md)
- [Change Blindness](../traits/Trait-ChangeBlindness.md)
