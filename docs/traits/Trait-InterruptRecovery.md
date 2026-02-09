# Interrupt Recovery

**Category**: Tier 2 - Emotional Traits
**Scale**: 0.0 (poor recovery) to 1.0 (excellent recovery)

## Definition

Interrupt recovery measures a user's ability to resume tasks after interruptions, distractions, or context switches. This trait determines whether users can pick up where they left off after phone calls, notifications, browser tab switches, or system timeouts. Users with low interrupt recovery lose their mental context and must restart tasks from the beginning, often with degraded performance. Users with high interrupt recovery leverage environmental cues (breadcrumbs, form progress indicators, browser history) to seamlessly continue their work with minimal lost progress.

## Research Foundation

### Primary Citation
> "We found that the average time to return to a disrupted task was 23 minutes 15 seconds. Furthermore, people did not simply resume the interrupted task; rather, they engaged in an average of 2.26 intervening activities before returning to the original task."
> -- Mark, G., Gonzalez, V.M., & Harris, J., 2005, p. 112

**Full Citation (APA 7):**
Mark, G., Gonzalez, V. M., & Harris, J. (2005). No task left behind? Examining the nature of fragmented work. *Proceedings of the SIGCHI Conference on Human Factors in Computing Systems*, 321-330.

**DOI**: https://doi.org/10.1145/1054972.1055017

### Supporting Research

> "Resumption lag - the time to resume a task after an interruption - is significantly affected by the complexity of the primary task and the length of the interruption. Longer interruptions result in greater context loss and longer resumption times."
> -- Altmann, E.M., & Trafton, J.G., 2002, p. 41

**Full Citation (APA 7):**
Altmann, E. M., & Trafton, J. G. (2002). Memory for goals: An activation-based model. *Cognitive Science*, 26(1), 39-83.

**DOI**: https://doi.org/10.1207/s15516709cog2601_2

### Key Numerical Values

| Metric | Value | Source |
|--------|-------|--------|
| Average task resumption time | 23 min 15 sec | Mark et al. (2005) |
| Intervening activities before resumption | 2.26 average | Mark et al. (2005) |
| Resumption lag (controlled lab) | 2-30 seconds | Altmann & Trafton (2002) |
| Error rate increase post-interruption | 2x baseline | Monk et al. (2008) |
| Context decay half-life | 15-60 seconds | Altmann & Trafton (2002) |
| Visual cue resumption benefit | 40-60% faster recovery | Trafton et al. (2011) |

### Interruption Types

| Type | Description | Typical Duration |
|------|-------------|------------------|
| `external` | Phone call, person, notification | Seconds to hours |
| `system` | Timeout, crash, page refresh | Instant to minutes |
| `self_initiated` | Tab switch, new thought, distraction | Seconds to minutes |
| `timeout` | Session expiration, idle disconnect | Instant |

## Behavioral Levels

| Value | Label | Behaviors |
|-------|-------|-----------|
| 0.0-0.2 | Very Poor | Loses all context after any interruption; must restart forms from beginning; forgets goal of task after distraction; cannot recall previous steps; re-reads entire page after tab switch; session timeout causes complete task abandonment; no use of environmental cues for recovery; takes full 23+ minutes to resume complex tasks |
| 0.2-0.4 | Poor | Loses 40-60% of progress after interruption; struggles to remember where they were; re-enters data they previously completed; skips steps when resuming; high error rate post-interruption; may recognize environmental cues but doesn't effectively use them; resumes in wrong section of multi-step process |
| 0.4-0.6 | Moderate | Loses 10-30% of progress after interruption; can use breadcrumbs and progress indicators to orient; may need to review recent steps; moderate resumption lag (5-15 seconds); error rate slightly elevated after interruption; benefits from "you were here" indicators |
| 0.6-0.8 | Good | Minimal progress loss (< 10%) after interruption; quickly orients using page state, URL, form values; short resumption lag (2-5 seconds); actively seeks environmental cues; maintains mental context through moderate interruptions; can context-switch between tabs effectively |
| 0.8-1.0 | Excellent | Near-seamless recovery from interruptions; leverages all environmental cues (breadcrumbs, history, form state); < 2 second resumption lag; mental context persists through long interruptions; can resume days later using browser history; proactively creates own resumption cues (bookmarks, notes) |

## Trait Implementation in CBrowser

### Context Loss Model

CBrowser models context decay using exponential decay modified by trait:

```typescript
interface InterruptRecoveryState {
  currentTaskContext: TaskContext;
  environmentalCues: string[];      // Page elements aiding recovery
  interruptionLog: Interruption[];  // History of interruptions
  contextStrength: number;          // 0-1 memory of task context
}

interface Interruption {
  type: 'external' | 'system' | 'self_initiated' | 'timeout';
  duration: number;  // milliseconds
  timestamp: Date;
}

// Context decay during interruption
function calculateContextLoss(
  interruptRecovery: number,
  interruptionDuration: number,
  cuesAvailable: number
): number {
  const halfLife = 15000 + (interruptRecovery * 45000);  // 15-60 sec half-life
  const decayRate = Math.LN2 / halfLife;
  const baseLoss = 1 - Math.exp(-decayRate * interruptionDuration);

  // Environmental cues reduce loss
  const cueRecovery = Math.min(0.6, cuesAvailable * 0.1);

  return Math.max(0, baseLoss - cueRecovery);
}
```

### Resumption Lag

```typescript
// Time to resume after interruption
function getResumptionLag(
  interruptRecovery: number,
  contextLoss: number,
  taskComplexity: number
): number {
  const baseLag = 2000;  // 2 seconds minimum
  const complexityMultiplier = 1 + (taskComplexity * 2);  // 1x to 3x
  const recoveryFactor = 1 + ((1 - interruptRecovery) * 10);  // 1x to 11x
  const contextFactor = 1 + (contextLoss * 5);  // 1x to 6x

  return baseLag * complexityMultiplier * recoveryFactor * contextFactor;
  // Range: 2 seconds to several minutes
}
```

### Environmental Cue Detection

```typescript
// Cues that help users recover context
const environmentalCues = {
  breadcrumbs: 0.15,        // "Home > Products > Category"
  progressIndicator: 0.20,  // "Step 2 of 4"
  formValues: 0.15,         // Previously entered data visible
  pageTitle: 0.10,          // Descriptive title
  recentHistory: 0.15,      // Browser back button history
  urlPath: 0.10,            // Meaningful URL structure
  visualPosition: 0.08,     // Scroll position preserved
  notifications: 0.07       // "You have unsaved changes"
};

function calculateCueStrength(page: Page): number {
  return Object.entries(environmentalCues)
    .filter(([cue]) => page.hasCue(cue))
    .reduce((sum, [, value]) => sum + value, 0);
}
```

### Behavior Post-Interruption

```typescript
// How user behaves when resuming
function getResumptionBehavior(
  interruptRecovery: number,
  contextLoss: number
): 'continue' | 'review' | 'restart' {
  const effectiveRecovery = interruptRecovery * (1 - contextLoss);

  if (effectiveRecovery > 0.6) return 'continue';  // Pick up where left off
  if (effectiveRecovery > 0.3) return 'review';    // Review recent steps, then continue
  return 'restart';  // Begin task from start
}
```

## Trait Correlations

Research and theoretical models indicate the following correlations:

| Related Trait | Correlation | Research Basis |
|--------------|-------------|----------------|
| Working Memory | r = 0.55 | Context maintenance is memory-dependent |
| Comprehension | r = 0.38 | Understanding structure aids reorientation |
| Persistence | r = 0.32 | Persistent users try harder to resume |
| Patience | r = 0.28 | Recovery takes time; patient users invest it |
| Reading Tendency | r = 0.25 | Readers use text cues for recovery |

### Interaction Effects

- **Interrupt Recovery x Working Memory**: Combined high values create maximally context-resilient users
- **Interrupt Recovery x Low Patience**: Users may have recovery ability but not time patience to use it
- **Interrupt Recovery x Comprehension**: High recovery + low comprehension = can find their place but may not understand current step

## Persona Values

| Persona | Interrupt Recovery Value | Rationale |
|---------|--------------------------|-----------|
| power-user | 0.75 | Skilled at context-switching; uses environmental cues effectively |
| first-timer | 0.35 | Lacks schema for interpreting recovery cues |
| elderly-user | 0.40 | Working memory challenges impede context retention |
| impatient-user | 0.45 | May have ability but doesn't invest effort to recover |
| mobile-user | 0.50 | Moderate; mobile users frequently interrupted |
| screen-reader-user | 0.55 | Developed coping strategies for non-visual navigation |
| anxious-user | 0.35 | Anxiety impairs working memory and recovery |
| multi-tasker | 0.70 | Practiced at context-switching |

## UX Design Implications

### For Low Interrupt Recovery Users (< 0.4)

1. **Auto-save everything**: Persist form data frequently and automatically
2. **Session persistence**: Don't timeout sessions aggressively
3. **"Welcome back" states**: Detect returning users and restore context
4. **Prominent progress indicators**: Make "where you are" unmissable
5. **Breadcrumb navigation**: Clear path back to current location
6. **Unsaved changes warnings**: Prevent accidental navigation away
7. **Email/save progress links**: Allow explicit progress saving

### For High Interrupt Recovery Users (> 0.7)

1. **Minimal recovery friction**: Don't force re-authentication unnecessarily
2. **Smart defaults**: Pre-fill likely values based on previous session
3. **Quick resume options**: "Continue where you left off" buttons
4. **Tab state preservation**: Maintain state across browser sessions
5. **History navigation**: Support effective use of back button

### Environmental Cue Best Practices

| Cue Type | Implementation | Recovery Benefit |
|----------|----------------|------------------|
| Progress indicators | Step X of Y, progress bars | 20% faster recovery |
| Breadcrumbs | Clickable path hierarchy | 15% faster recovery |
| Form persistence | Save partial form data | 40-60% less re-entry |
| Descriptive titles | Page-specific, goal-oriented | 10% faster orientation |
| Scroll restoration | Return to scroll position | Immediate context recovery |
| Visual state | Expand/collapse states preserved | Reduces re-navigation |

## See Also

- [Trait-WorkingMemory](./Trait-WorkingMemory.md) - Memory capacity (strongly related)
- [Trait-Resilience](./Trait-Resilience.md) - Emotional recovery from setbacks (different type of recovery)
- [Trait-Patience](./Trait-Patience.md) - Time tolerance for recovery process
- [Trait-Persistence](./Trait-Persistence.md) - Motivation to resume rather than abandon
- [Trait-Index](./Trait-Index.md) - Complete trait listing

## Bibliography

Adamczyk, P. D., & Bailey, B. P. (2004). If not now, when? The effects of interruption at different moments within task execution. *Proceedings of the SIGCHI Conference on Human Factors in Computing Systems*, 271-278. https://doi.org/10.1145/985692.985727

Altmann, E. M., & Trafton, J. G. (2002). Memory for goals: An activation-based model. *Cognitive Science*, 26(1), 39-83. https://doi.org/10.1207/s15516709cog2601_2

Czerwinski, M., Horvitz, E., & Wilhite, S. (2004). A diary study of task switching and interruptions. *Proceedings of the SIGCHI Conference on Human Factors in Computing Systems*, 175-182. https://doi.org/10.1145/985692.985715

Iqbal, S. T., & Horvitz, E. (2007). Disruption and recovery of computing tasks: Field study, analysis, and directions. *Proceedings of the SIGCHI Conference on Human Factors in Computing Systems*, 677-686. https://doi.org/10.1145/1240624.1240730

Mark, G., Gonzalez, V. M., & Harris, J. (2005). No task left behind? Examining the nature of fragmented work. *Proceedings of the SIGCHI Conference on Human Factors in Computing Systems*, 321-330. https://doi.org/10.1145/1054972.1055017

Mark, G., Gudith, D., & Klocke, U. (2008). The cost of interrupted work: More speed and stress. *Proceedings of the SIGCHI Conference on Human Factors in Computing Systems*, 107-110. https://doi.org/10.1145/1357054.1357072

Monk, C. A., Trafton, J. G., & Boehm-Davis, D. A. (2008). The effect of interruption duration and demand on resuming suspended goals. *Journal of Experimental Psychology: Applied*, 14(4), 299-313. https://doi.org/10.1037/a0014402

Trafton, J. G., Altmann, E. M., & Ratwani, R. M. (2011). A memory for goals model of sequence errors. *Cognitive Systems Research*, 12(2), 134-143. https://doi.org/10.1016/j.cogsys.2010.07.010
