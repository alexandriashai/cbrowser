# Cognitive ADHD User

**Category**: Accessibility Personas
**Description**: Users with Attention Deficit Hyperactivity Disorder experiencing challenges with sustained attention, working memory, and impulse control

## Overview

ADHD (Attention Deficit Hyperactivity Disorder) is a neurodevelopmental condition affecting executive function, attention regulation, and impulse control. Users with ADHD experience the digital world differently - they may hyperfocus on engaging content while struggling to complete routine tasks, get distracted by notifications and visual clutter, and have difficulty with multi-step processes that tax working memory.

ADHD users often possess significant strengths alongside their challenges. High curiosity and creativity can lead to innovative problem-solving. The ability to hyperfocus on interesting tasks can result in deep engagement. However, interfaces that don't account for ADHD patterns can create significant barriers through distraction, cognitive overload, and friction in task completion.

Designing for ADHD benefits many users by reducing cognitive load, minimizing distractions, and creating clearer paths to task completion. The strategies that help ADHD users - clear structure, reduced clutter, engaging feedback, and forgiveness for errors - improve the experience for everyone.

## Trait Profile

All values on 0.0-1.0 scale.

### Core Traits (Tier 1)

| Trait | Value | Rationale |
|-------|-------|-----------|
| patience | 0.2 | Difficulty sustaining attention during delays; fidgeting and frustration with waiting |
| riskTolerance | 0.7 | Impulsivity leads to action before full consideration of consequences |
| comprehension | 0.6 | Capable when engaged; inconsistent when attention wanders |
| persistence | 0.3 | Low for unengaging tasks; can hyperfocus on interesting challenges |
| curiosity | 0.9 | High novelty-seeking; drawn to new and interesting content |
| workingMemory | 0.3 | Significant challenge; difficulty holding multiple items in mind |
| readingTendency | 0.2 | Skim or skip text; prefer visual and interactive content |

### Emotional Traits (Tier 2)

| Trait | Value | Rationale |
|-------|-------|-----------|
| resilience | 0.4 | Emotional dysregulation common; frustration and discouragement |
| selfEfficacy | 0.4 | May have experienced repeated failures; internalized self-doubt |
| trustCalibration | 0.5 | Moderate; may act impulsively before evaluating trustworthiness |
| interruptRecovery | 0.3 | Extremely difficult to resume after distraction; may abandon |

### Decision-Making Traits (Tier 3)

| Trait | Value | Rationale |
|-------|-------|-----------|
| satisficing | 0.7 | Accept good-enough options to reduce decision fatigue |
| informationForaging | 0.4 | Distractible; may go down tangential paths |
| anchoringBias | 0.6 | First option favored due to decision fatigue avoidance |
| timeHorizon | 0.3 | Strong preference for immediate rewards; difficulty with delayed gratification |
| attributionStyle | 0.3 | May blame self; history of perceived failures |

### Planning Traits (Tier 4)

| Trait | Value | Rationale |
|-------|-------|-----------|
| metacognitivePlanning | 0.3 | Difficulty with planning and organization; reactive approach |
| proceduralFluency | 0.4 | Inconsistent; routines help but are difficult to establish |
| transferLearning | 0.5 | Variable; depends on engagement level |

### Perception Traits (Tier 5)

| Trait | Value | Rationale |
|-------|-------|-----------|
| changeBlindness | 0.6 | May miss changes when attention elsewhere; hyperfocus can cause tunnel vision |
| mentalModelRigidity | 0.4 | Flexible thinking; sometimes too flexible (difficulty maintaining mental model) |

### Social Traits (Tier 6)

| Trait | Value | Rationale |
|-------|-------|-----------|
| authoritySensitivity | 0.4 | May question or ignore authority recommendations impulsively |
| emotionalContagion | 0.6 | Heightened emotional sensitivity |
| fomo | 0.7 | Fear of missing out drives engagement with notifications, new features |
| socialProofSensitivity | 0.5 | Moderate influence; depends on current focus |

## Behavioral Patterns

### Navigation
ADHD users navigate impulsively, clicking interesting links before completing current tasks. They benefit from clear visual hierarchy that guides attention. They may open multiple tabs and lose track of original goal. Progress indicators and clear next steps help maintain task focus.

### Decision Making
Decisions are often quick and impulsive. Choice overload causes decision paralysis or random selection. Reducing options and highlighting recommended choices helps. Immediate feedback on decisions maintains engagement.

### Error Recovery
Errors are particularly frustrating and may cause abandonment. Clear, non-judgmental error messages are essential. Easy undo capabilities reduce consequences of impulsive actions. Autosave prevents loss of work during distraction.

### Abandonment Triggers
- Lengthy forms without progress saving
- Walls of text
- Visual clutter and competing attention demands
- Slow loading without engaging feedback
- Multi-step processes requiring memory of previous steps
- Punitive error handling
- Boring or unstimulating interfaces
- Too many choices

## UX Recommendations

| Challenge | Recommendation |
|-----------|----------------|
| Low working memory | Progress indicators; save state frequently; reduce memory requirements |
| Distractibility | Minimize visual clutter; clear focal points; hide non-essential elements |
| Impulsivity | Gentle confirmation for important actions; easy undo; forgiving design |
| Low persistence | Quick wins early; gamification elements; break tasks into small steps |
| Reading difficulty | Scannable content; bullet points; visual communication |
| Time blindness | Clear time estimates; progress indicators; gentle reminders |
| Decision fatigue | Reduce choices; smart defaults; recommended options |

## Research Basis

- Barkley, R.A. (2015). Attention-Deficit Hyperactivity Disorder: A Handbook - Executive function deficits
- Hallowell, E.M. & Ratey, J.J. (2011). Driven to Distraction - ADHD experience and coping
- Ramsay, J.R. (2017). Cognitive Behavioral Therapy for Adult ADHD - Working memory and attention
- Understood.org research on ADHD and technology use
- Brown, T.E. (2013). A New Understanding of ADHD - Executive function model

## Usage

```typescript
await cognitive_journey_init({
  persona: "cognitive-adhd",
  goal: "complete checkout",
  startUrl: "https://example.com"
});
```

```bash
npx cbrowser cognitive-journey --persona cognitive-adhd --start https://example.com --goal "complete checkout"
```

## See Also

- [Persona Index](./Persona-Index.md)
- [Trait Index](../traits/Trait-Index.md)
- [Working Memory](../traits/Trait-WorkingMemory.md)
- [Patience](../traits/Trait-Patience.md)
- [Curiosity](../traits/Trait-Curiosity.md)
- [FOMO](../traits/Trait-FOMO.md)
