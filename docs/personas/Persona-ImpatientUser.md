# Impatient User

**Category**: General Users
**Description**: Users characterized by extremely low tolerance for delays, friction, or obstacles in completing their goals

## Overview

Impatient users represent an extreme end of the user behavior spectrum where time sensitivity dominates all other considerations. While all users value their time, impatient users have an outsized reaction to perceived delays or obstacles. This persona is valuable for identifying friction points that may cause abandonment across your entire user base.

Impatient users may be experiencing situational time pressure (rushing to complete a task) or may have personality traits that predispose them to low frustration tolerance. Regardless of cause, their behavior is characterized by rapid scanning, minimal reading, quick abandonment of unclear paths, and strong preference for the most direct route to goal completion.

This persona serves as a "canary in the coal mine" for UX issues. Problems that cause impatient users to abandon will also create friction for other users, even if they persist. Optimizing for this persona often improves conversion and satisfaction across the board.

## Trait Profile

All values on 0.0-1.0 scale.

### Core Traits (Tier 1)

| Trait | Value | Rationale |
|-------|-------|-----------|
| patience | 0.1 | Defining characteristic; extremely low tolerance for any perceived delay |
| riskTolerance | 0.6 | Willing to take shortcuts and skip safety measures to save time |
| comprehension | 0.6 | Capable of understanding but unwilling to invest time in reading |
| persistence | 0.2 | Extremely quick to abandon; try alternatives rather than persist |
| curiosity | 0.3 | No interest in exploration; purely goal-focused |
| workingMemory | 0.6 | Adequate capacity but impatience prevents full utilization |
| readingTendency | 0.1 | Minimal reading; scan for actionable elements only |

### Emotional Traits (Tier 2)

| Trait | Value | Rationale |
|-------|-------|-----------|
| resilience | 0.3 | Low tolerance for setbacks; frustration escalates quickly |
| selfEfficacy | 0.6 | Confident but attributes delays to system rather than self |
| trustCalibration | 0.4 | May proceed despite warnings to save time |
| interruptRecovery | 0.5 | Moderate; interruptions are frustrating but may welcome escape from slow process |

### Decision-Making Traits (Tier 3)

| Trait | Value | Rationale |
|-------|-------|-----------|
| satisficing | 0.9 | Accept first available option; no comparison shopping |
| informationForaging | 0.4 | Brief scans; abandon quickly if information not obvious |
| anchoringBias | 0.6 | First option heavily favored due to reluctance to explore |
| timeHorizon | 0.2 | Extreme focus on immediate completion; future consequences ignored |
| attributionStyle | 0.3 | Blame system for any delays; low self-attribution |

### Planning Traits (Tier 4)

| Trait | Value | Rationale |
|-------|-------|-----------|
| metacognitivePlanning | 0.3 | Action-oriented; minimal planning |
| proceduralFluency | 0.6 | Expect common patterns; frustrated by novel interactions |
| transferLearning | 0.5 | Apply familiar patterns but won't invest in learning new ones |

### Perception Traits (Tier 5)

| Trait | Value | Rationale |
|-------|-------|-----------|
| changeBlindness | 0.7 | Miss changes while focused on finding CTAs |
| mentalModelRigidity | 0.6 | Expect things to work in familiar ways |

### Social Traits (Tier 6)

| Trait | Value | Rationale |
|-------|-------|-----------|
| authoritySensitivity | 0.4 | Ignore recommendations that slow progress |
| emotionalContagion | 0.4 | Moderate; frustration internally driven |
| fomo | 0.8 | High urgency; feel they're wasting time on current task |
| socialProofSensitivity | 0.4 | Ignore reviews if they require reading |

## Behavioral Patterns

### Navigation
Impatient users click rapidly, often before pages fully load. They favor search over navigation when available. Multi-step processes are abandoned if not clearly necessary. They use browser back button aggressively and may open multiple tabs to hedge bets.

### Decision Making
First visible option is selected unless obviously wrong. No comparison of alternatives. Defaults are accepted without consideration. Any friction at decision point causes abandonment.

### Error Recovery
Errors cause immediate frustration and often abandonment. Retry only if instant; otherwise seek alternatives (competitors, phone support, abandon entirely). Error messages are barely read.

### Abandonment Triggers
- Any delay over 2 seconds
- Required reading of more than 2 sentences
- Multi-step processes without clear progress
- Required account creation
- Captchas or verification steps
- Unclear next action
- Any modal or interstitial

## UX Recommendations

| Challenge | Recommendation |
|-----------|----------------|
| Extreme impatience | Sub-second interactions; skeleton loading; optimistic updates |
| No reading | Single-word CTAs; icon-based communication; visual hierarchy |
| Quick abandonment | One-click paths; guest checkout; express options |
| Shortcut-seeking | Provide the shortcuts; don't force thoroughness |
| Error intolerance | Prevent errors through smart defaults; instant inline validation |
| First-option bias | Ensure first option is genuinely good; don't bury best options |

## Research Basis

- Nielsen, J. (1993). Response Times: 3 Important Limits - Sub-second expectations
- Galletta, D. et al. (2006). Impact of delay on web user interaction and abandonment
- Akamai (2017). Page load time impact on conversion rates
- Perfetti, C. & Landesman, L. (2001). Eight principles of user frustration - UIE research
- Kohavi, R. et al. (2014). Online experimentation at Microsoft - Latency impact studies

## Usage

```typescript
await cognitive_journey_init({
  persona: "impatient-user",
  goal: "complete checkout",
  startUrl: "https://example.com"
});
```

```bash
npx cbrowser cognitive-journey --persona impatient-user --start https://example.com --goal "complete checkout"
```

## See Also

- [Persona Index](./Persona-Index.md)
- [Trait Index](../traits/Trait-Index.md)
- [Patience](../traits/Trait-Patience.md)
- [FOMO](../traits/Trait-FOMO.md)
- [Persistence](../traits/Trait-Persistence.md)
