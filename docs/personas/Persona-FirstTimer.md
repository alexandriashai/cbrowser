# First-Timer

**Category**: General Users
**Description**: Users encountering an application or interface type for the first time, characterized by high curiosity but limited domain knowledge

## Overview

First-timers represent users who have no prior experience with a specific application, service, or interface paradigm. They approach new experiences with fresh eyes and open minds, but lack the contextual knowledge that experienced users take for granted. This persona is crucial for testing onboarding flows and initial user experiences.

First-timers typically exhibit high curiosity and motivation to learn, combined with uncertainty about conventions and expectations. They read more carefully than experienced users, seeking to understand the rules of the new environment. Their mental models are still forming, making them particularly sensitive to confusing information architecture or inconsistent design patterns.

The first-timer experience is decisive for long-term retention. Research shows that frustration during initial interactions is a primary driver of early abandonment. However, first-timers who successfully navigate onboarding often become loyal users. Designing for this persona requires balancing guidance with respect for user intelligence.

## Trait Profile

All values on 0.0-1.0 scale.

### Core Traits (Tier 1)

| Trait | Value | Rationale |
|-------|-------|-----------|
| patience | 0.7 | Willing to invest time learning new systems; expect some initial friction |
| riskTolerance | 0.3 | Hesitant to click unfamiliar buttons or commit to actions with unclear consequences |
| comprehension | 0.3 | Limited domain knowledge means slower processing of jargon and conventions |
| persistence | 0.5 | Will try multiple times but have lower frustration threshold than experienced users |
| curiosity | 0.9 | High intrinsic motivation to explore and understand the new environment |
| workingMemory | 0.5 | Average capacity, but heavily taxed by unfamiliar terminology and concepts |
| readingTendency | 0.6 | Read more carefully than average; actively seek understanding |

### Emotional Traits (Tier 2)

| Trait | Value | Rationale |
|-------|-------|-----------|
| resilience | 0.4 | Vulnerable to discouragement; initial failures feel more significant |
| selfEfficacy | 0.4 | Uncertainty about ability to succeed in unfamiliar environment |
| trustCalibration | 0.5 | Neither overly trusting nor skeptical; forming initial impressions |
| interruptRecovery | 0.4 | Struggle to recover context after interruptions; mental models still forming |

### Decision-Making Traits (Tier 3)

| Trait | Value | Rationale |
|-------|-------|-----------|
| satisficing | 0.6 | Accept reasonable options rather than optimizing; unsure what "best" means here |
| informationForaging | 0.4 | Inefficient information seeking; don't know where to look |
| anchoringBias | 0.7 | First impressions heavily influence subsequent expectations and interpretations |
| timeHorizon | 0.4 | Focus on immediate task completion; not yet thinking about long-term usage |
| attributionStyle | 0.4 | Tend to blame self for difficulties rather than recognizing system issues |

### Planning Traits (Tier 4)

| Trait | Value | Rationale |
|-------|-------|-----------|
| metacognitivePlanning | 0.3 | Limited ability to strategize in unfamiliar domain; reactive approach |
| proceduralFluency | 0.2 | No automated procedures; every action requires conscious effort |
| transferLearning | 0.5 | Can apply general web conventions but may miss domain-specific patterns |

### Perception Traits (Tier 5)

| Trait | Value | Rationale |
|-------|-------|-----------|
| changeBlindness | 0.6 | May miss important updates; still learning where to look |
| mentalModelRigidity | 0.3 | Mental models are flexible because they're still forming |

### Social Traits (Tier 6)

| Trait | Value | Rationale |
|-------|-------|-----------|
| authoritySensitivity | 0.7 | Look to interface guidance and authority signals for direction |
| emotionalContagion | 0.6 | Influenced by perceived emotional tone of interface and help content |
| fomo | 0.5 | Moderate concern about missing features; still discovering what's possible |
| socialProofSensitivity | 0.7 | Look for evidence that others use and value the service |

## Behavioral Patterns

### Navigation
First-timers rely heavily on obvious navigation elements and follow the happy path. They avoid shortcuts and advanced features, preferring clearly labeled buttons. Back button usage is common as they explore and backtrack. They appreciate breadcrumbs and clear indication of current location.

### Decision Making
Decisions are cautious and deliberate. First-timers seek confirmation before committing to actions and carefully read button labels and warnings. They prefer explicit choices over implicit defaults and appreciate explanations of why options matter.

### Error Recovery
Errors are distressing and may prompt abandonment. First-timers need clear, non-blaming error messages with specific remediation steps. They often need help distinguishing between recoverable and serious errors.

### Abandonment Triggers
- Jargon-heavy content without explanations
- Required account creation before value is demonstrated
- Unclear next steps or missing call-to-action
- Errors without clear recovery path
- Overwhelming options without guidance
- Feeling judged or embarrassed

## UX Recommendations

| Challenge | Recommendation |
|-----------|----------------|
| Limited domain knowledge | Provide contextual help and tooltips; explain jargon on first use |
| Hesitation about commitments | Clear undo capabilities; preview of action consequences |
| Forming initial impressions | Invest heavily in first-time UX; quick wins build confidence |
| Self-blame for failures | Non-judgmental error messages; emphasize system responsibility |
| Seeking validation | Show social proof; testimonials; user counts; success stories |
| Navigation uncertainty | Strong wayfinding; breadcrumbs; clear current-location indicators |

## Research Basis

- Carroll, J.M. & Rosson, M.B. (1987). Paradox of the Active User - Why users don't read
- Krug, S. (2014). Don't Make Me Think - First-time user navigation patterns
- Kim, J. et al. (2016). First-time user retention research at Dropbox
- Saffer, D. (2010). Designing for Interaction - Onboarding principles
- Garrett, J.J. (2011). Elements of User Experience - User learning curves

## Usage

```typescript
await cognitive_journey_init({
  persona: "first-timer",
  goal: "complete checkout",
  startUrl: "https://example.com"
});
```

```bash
npx cbrowser cognitive-journey --persona first-timer --start https://example.com --goal "complete checkout"
```

## See Also

- [Persona Index](./Persona-Index.md)
- [Trait Index](../traits/Trait-Index.md)
- [Curiosity](../traits/Trait-Curiosity.md)
- [Comprehension](../traits/Trait-Comprehension.md)
- [Risk Tolerance](../traits/Trait-RiskTolerance.md)
