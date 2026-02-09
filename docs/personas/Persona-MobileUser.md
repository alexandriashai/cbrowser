# Mobile User

**Category**: General Users
**Description**: Users primarily accessing interfaces through mobile devices, often in contexts with divided attention and time pressure

## Overview

Mobile users interact with digital interfaces in fundamentally different ways than desktop users. They typically operate in contexts characterized by divided attention, physical movement, variable connectivity, and time pressure. The mobile context transforms user behavior regardless of the user's underlying cognitive abilities.

The mobile experience is defined by constraints and interruptions. Screen real estate is limited, requiring prioritization of the most essential content and actions. Touch input replaces precision mouse interactions. Users often engage in "snacking" behavior - brief, interrupted sessions between other activities. This context creates unique patterns of satisficing, impatience, and goal-focused behavior.

Mobile users are not less capable than desktop users; rather, they operate under situational constraints that affect their interaction patterns. A user who carefully reads documentation on desktop may skim on mobile. Understanding this context is essential for designing effective mobile experiences.

## Trait Profile

All values on 0.0-1.0 scale.

### Core Traits (Tier 1)

| Trait | Value | Rationale |
|-------|-------|-----------|
| patience | 0.3 | Mobile context creates time pressure; users expect immediate responses |
| riskTolerance | 0.5 | Moderate; willing to act quickly but cautious about security on mobile |
| comprehension | 0.6 | Capability unchanged but limited attention reduces effective comprehension |
| persistence | 0.4 | Low commitment to any single session; will abandon and return later |
| curiosity | 0.4 | Goal-focused rather than exploratory; minimize time spent in app |
| workingMemory | 0.5 | Capacity unchanged but divided attention reduces available resources |
| readingTendency | 0.2 | Skim headlines; rely on visual hierarchy; rarely read body text |

### Emotional Traits (Tier 2)

| Trait | Value | Rationale |
|-------|-------|-----------|
| resilience | 0.5 | Brief frustration but quick to try alternatives rather than persist |
| selfEfficacy | 0.6 | Generally confident with mobile interfaces |
| trustCalibration | 0.5 | Balanced; aware of mobile security concerns |
| interruptRecovery | 0.5 | Expect interruptions; design mental models around resumption |

### Decision-Making Traits (Tier 3)

| Trait | Value | Rationale |
|-------|-------|-----------|
| satisficing | 0.8 | Accept first reasonable option; minimize decision time |
| informationForaging | 0.5 | Quick scans for obvious information; abandon if not found |
| anchoringBias | 0.5 | First-seen options have advantage but less commitment overall |
| timeHorizon | 0.3 | Focus on immediate task; minimize time investment |
| attributionStyle | 0.5 | Balanced attribution; expect mobile to be different |

### Planning Traits (Tier 4)

| Trait | Value | Rationale |
|-------|-------|-----------|
| metacognitivePlanning | 0.4 | Less planning; reactive to immediate needs |
| proceduralFluency | 0.6 | Familiar with mobile conventions (swipe, tap, etc.) |
| transferLearning | 0.6 | Apply mobile patterns across apps |

### Perception Traits (Tier 5)

| Trait | Value | Rationale |
|-------|-------|-----------|
| changeBlindness | 0.6 | May miss changes while attention divided; rely on clear notifications |
| mentalModelRigidity | 0.5 | Expect mobile conventions; frustrated by non-standard patterns |

### Social Traits (Tier 6)

| Trait | Value | Rationale |
|-------|-------|-----------|
| authoritySensitivity | 0.5 | Moderate; skeptical of mobile ads and promotions |
| emotionalContagion | 0.5 | Moderate influence from visual design |
| fomo | 0.6 | Mobile creates urgency; notifications drive engagement |
| socialProofSensitivity | 0.6 | App store ratings and reviews influence choices |

## Behavioral Patterns

### Navigation
Mobile users rely on familiar patterns: bottom navigation, hamburger menus, swipe gestures. They expect single-hand operation for most tasks. Deep hierarchies are problematic; prefer flat architecture with clear entry points. Search is often preferred over navigation for finding specific items.

### Decision Making
Decisions are rapid and often based on minimal information. The top option or featured choice has significant advantage. Users rarely scroll below the fold for options. Price and key differentiators must be immediately visible.

### Error Recovery
Low tolerance for errors that interrupt flow. Errors should be recoverable without losing progress. Form validation should be inline and immediate. Connectivity errors should allow offline operation or easy retry.

### Abandonment Triggers
- Slow load times (over 3 seconds)
- Forced desktop-style interactions
- Lengthy forms without progress saving
- Pop-ups and interstitials
- Unclear touch targets
- Required account creation for simple tasks
- Poor cellular connectivity handling

## UX Recommendations

| Challenge | Recommendation |
|-----------|----------------|
| Time pressure | Minimize steps; allow task completion in under 2 minutes |
| Divided attention | Clear visual hierarchy; essential info "above the fold" |
| Limited screen space | Progressive disclosure; prioritize ruthlessly |
| Touch input | Generous touch targets (minimum 44x44 pixels); forgiving hit areas |
| Interrupted sessions | Save state automatically; enable easy resumption |
| Variable connectivity | Offline capability; graceful degradation; queue actions |
| Low reading tendency | Visual communication; icons with text; clear CTAs |

## Research Basis

- Chittaro, L. (2011). Mobile HCI research methods - Context-specific user behavior
- Hoober, S. & Berkman, E. (2012). Designing Mobile Interfaces - Touch interaction patterns
- Nielsen, J. (2012). Mobile Usability - Mobile vs desktop behavior differences
- Google/SOASTA (2017). Mobile page speed benchmarks - Load time impact on conversion
- Budiu, R. (2015). Mobile User Experience - Attention and task completion research

## Usage

```typescript
await cognitive_journey_init({
  persona: "mobile-user",
  goal: "complete checkout",
  startUrl: "https://example.com"
});
```

```bash
npx cbrowser cognitive-journey --persona mobile-user --start https://example.com --goal "complete checkout"
```

## See Also

- [Persona Index](Persona-Index)
- [Trait Index](../traits/Trait-Index)
- [Patience](../traits/Trait-Patience.md)
- [Satisficing](../traits/Trait-Satisficing.md)
- [Reading Tendency](../traits/Trait-ReadingTendency.md)
