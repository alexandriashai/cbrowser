# Resilience

**Category**: Tier 2 - Emotional Traits
**Scale**: 0.0 (low) to 1.0 (high)

## Definition

Resilience measures the ability to recover emotionally and cognitively from setbacks, errors, and frustrating experiences during web interactions. Users with high resilience quickly bounce back from failed form submissions, confusing error messages, or dead-end navigation paths. Low-resilience users accumulate frustration that degrades their performance and increases abandonment likelihood. In web contexts, resilience determines how many errors a user can tolerate before giving up, how quickly they recover confidence after a mistake, and whether they interpret failures as temporary obstacles or permanent barriers.

## Research Foundation

### Primary Citation
> "The Brief Resilience Scale (BRS) was created to assess the ability to bounce back or recover from stress. [...] The BRS demonstrated good internal consistency across four diverse samples (Cronbach's alpha = 0.80-0.91, mean = 0.83)."
> -- Smith, B.W., Dalen, J., Wiggins, K., Steger, M.F., & Tooley, E., 2008, p. 194-195

**Full Citation (APA 7):**
Smith, B. W., Dalen, J., Wiggins, K., Steger, M. F., & Tooley, E. M. (2008). The Brief Resilience Scale: Assessing the ability to bounce back. *International Journal of Behavioral Medicine*, 15(3), 194-200.

**DOI**: https://doi.org/10.1207/s15327558ijbm1501_10

### Supporting Research

> "Resilient individuals show faster physiological recovery from negative emotional arousal, returning to baseline cardiovascular levels approximately 50% faster than less resilient individuals."
> -- Tugade, M.M., & Fredrickson, B.L., 2004, p. 327

**Full Citation (APA 7):**
Tugade, M. M., & Fredrickson, B. L. (2004). Resilient individuals use positive emotions to bounce back from negative emotional experiences. *Journal of Personality and Social Psychology*, 86(2), 320-333.

**DOI**: https://doi.org/10.1037/0022-3514.86.2.320

### Key Numerical Values

| Metric | Value | Source |
|--------|-------|--------|
| Internal consistency (alpha) | 0.80-0.91, mean 0.83 | Smith et al. (2008) |
| Test-retest reliability | 0.69 (1 month), 0.62 (3 months) | Smith et al. (2008) |
| Recovery speed ratio (high vs low) | 1.5x-2.0x faster | Tugade & Fredrickson (2004) |
| Negative emotion decay rate | 50% faster in resilient | Tugade & Fredrickson (2004) |
| Frustration accumulation threshold | 3-5 errors (low), 8-12 errors (high) | Derived from BRS norms |

## Behavioral Levels

| Value | Label | Behaviors |
|-------|-------|-----------|
| 0.0-0.2 | Very Low | Abandons after 1-2 errors; frustration lingers across sessions; interprets errors as personal failure; avoids complex tasks after setbacks; frustration decays only 5-10% per success; may refuse to retry failed actions; clicks back button immediately after any error |
| 0.2-0.4 | Low | Abandons after 3-4 errors; takes 5+ successful actions to recover emotionally; requires "easy wins" to rebuild confidence; may restart entire task after error; frustration decays 10-15% per success; avoids paths where previous errors occurred; seeks simpler alternatives after failures |
| 0.4-0.6 | Moderate | Abandons after 5-6 errors; recovers within 2-3 successful actions; willing to retry failed actions once; frustration decays 20% per success; can separate isolated errors from overall task progress; may try alternative approaches before abandoning; normal emotional reset between sessions |
| 0.6-0.8 | High | Tolerates 7-10 errors before abandonment; rapid emotional recovery (1-2 actions); views errors as temporary and solvable; frustration decays 25-30% per success; actively explores alternative solutions; maintains positive outlook during complex multi-step tasks; uses errors as learning opportunities |
| 0.8-1.0 | Very High | Tolerates 10+ errors with minimal frustration impact; frustration decays 30%+ per success; treats errors as normal part of process; maintains goal focus despite repeated setbacks; quickly adapts strategy without emotional disruption; may enjoy challenging interfaces as puzzles; near-instant emotional recovery |

## Trait Implementation in CBrowser

### Frustration Decay Formula

CBrowser models resilience through differential frustration decay rates:

```typescript
// Frustration decay after successful action
const decayRate = 0.10 + (resilience * 0.25);  // 10% to 35%
newFrustration = currentFrustration * (1 - decayRate);

// Frustration accumulation on error
const accumulationRate = 0.15 - (resilience * 0.10);  // 5% to 15%
newFrustration = Math.min(1.0, currentFrustration + accumulationRate);
```

### Abandonment Threshold Adjustment

```typescript
// Base abandonment threshold modified by resilience
const baseFrustrationThreshold = 0.85;
const adjustedThreshold = baseFrustrationThreshold + (resilience * 0.10);
// Low resilience: abandons at 0.85 frustration
// High resilience: tolerates up to 0.95 frustration
```

### Error Tolerance Count

```typescript
// Number of consecutive errors tolerated
const errorTolerance = Math.floor(2 + (resilience * 10));
// Low resilience: 2-4 errors
// High resilience: 10-12 errors
```

## Estimated Trait Correlations

> *Correlation estimates are derived from related research findings and theoretical models. Empirical calibration is planned ([GitHub #95](https://github.com/alexandriashai/cbrowser/issues/95)).*

Research and theoretical models indicate the following correlations:

| Related Trait | Correlation | Research Basis |
|--------------|-------------|----------------|
| Self-Efficacy | r = 0.56 | Bandura's protective factors research; both buffer against failure impact |
| Persistence | r = 0.52 | Duckworth's grit research; resilience sustains effort through setbacks |
| Patience | r = 0.38 | Both involve tolerance of suboptimal conditions |
| Working Memory | r = 0.22 | Lower correlation; resilience operates more on emotional than cognitive level |
| Risk Tolerance | r = 0.31 | Resilient users more willing to try risky actions knowing they can recover |

### Interaction Effects

- **Resilience x Self-Efficacy**: Combined high values create "invulnerable" users who persist through almost any challenge
- **Resilience x Low Patience**: Creates users who recover quickly but still abandon due to time pressure (not frustration)
- **Resilience x Low Comprehension**: Resilient users may repeatedly attempt wrong solutions without frustration, creating unproductive persistence

## Persona Values

| Persona | Resilience Value | Rationale |
|---------|-----------------|-----------|
| power-user | 0.75 | Experienced users expect and recover from errors quickly |
| first-timer | 0.40 | New users frustrated by errors, haven't built coping strategies |
| elderly-user | 0.55 | Patience compensates; willing to try again but may need encouragement |
| impatient-user | 0.30 | Low frustration tolerance drives quick abandonment |
| mobile-user | 0.50 | Moderate; accustomed to occasional tap errors |
| screen-reader-user | 0.65 | Accustomed to accessibility issues; developed coping mechanisms |
| anxious-user | 0.25 | Anxiety amplifies setback impact; slow emotional recovery |
| skeptical-user | 0.45 | Setbacks confirm suspicions but don't cause extreme frustration |

## UX Design Implications

### For Low Resilience Users (< 0.4)

1. **Progressive disclosure**: Limit choices to reduce error opportunities
2. **Forgiving inputs**: Auto-correct minor errors, suggest corrections
3. **Immediate positive feedback**: Celebrate small wins to accelerate recovery
4. **Clear error attribution**: Explain that errors are system issues, not user failures
5. **Easy restart points**: Provide clear "start over" options without losing all progress

### For High Resilience Users (> 0.7)

1. **Challenge tolerance**: Can present complex flows without excessive hand-holding
2. **Error details**: Provide technical error information for self-diagnosis
3. **Exploration support**: Allow trial-and-error discovery without frustration accumulation
4. **Advanced features**: Surface power-user capabilities that may have learning curves

## See Also

- [Trait-SelfEfficacy](./Trait-SelfEfficacy.md) - Belief in problem-solving ability (strongly correlated)
- [Trait-Persistence](./Trait-Persistence.md) - Tendency to continue trying (behavioral manifestation)
- [Trait-Patience](./Trait-Patience.md) - Time-based tolerance (distinct but related construct)
- [Trait-InterruptRecovery](./Trait-InterruptRecovery.md) - Recovery from external disruptions
- [Trait-Index](./Trait-Index.md) - Complete trait listing

## Bibliography

Fredrickson, B. L. (2001). The role of positive emotions in positive psychology: The broaden-and-build theory of positive emotions. *American Psychologist*, 56(3), 218-226. https://doi.org/10.1037/0003-066X.56.3.218

Luthar, S. S., Cicchetti, D., & Becker, B. (2000). The construct of resilience: A critical evaluation and guidelines for future work. *Child Development*, 71(3), 543-562. https://doi.org/10.1111/1467-8624.00164

Masten, A. S. (2001). Ordinary magic: Resilience processes in development. *American Psychologist*, 56(3), 227-238. https://doi.org/10.1037/0003-066X.56.3.227

Smith, B. W., Dalen, J., Wiggins, K., Steger, M. F., & Tooley, E. M. (2008). The Brief Resilience Scale: Assessing the ability to bounce back. *International Journal of Behavioral Medicine*, 15(3), 194-200. https://doi.org/10.1207/s15327558ijbm1501_10

Tugade, M. M., & Fredrickson, B. L. (2004). Resilient individuals use positive emotions to bounce back from negative emotional experiences. *Journal of Personality and Social Psychology*, 86(2), 320-333. https://doi.org/10.1037/0022-3514.86.2.320

Windle, G., Bennett, K. M., & Noyes, J. (2011). A methodological review of resilience measurement scales. *Health and Quality of Life Outcomes*, 9(1), 1-18. https://doi.org/10.1186/1477-7525-9-8
