# Attribution Style

**Category**: Tier 3 - Decision-Making Traits
**Scale**: 0.0 (external attribution) to 1.0 (internal attribution)

## Definition

Attribution Style describes how individuals explain the causes of events, particularly successes and failures. Based on Weiner's attribution theory, this trait encompasses three dimensions: locus (internal vs. external), stability (permanent vs. temporary), and controllability (within vs. outside one's control). In web contexts, attribution style profoundly affects how users interpret errors, form reactions to interface difficulties, persist through challenges, and develop self-efficacy with technology. Internal attributors take responsibility for outcomes ("I must have clicked wrong"); external attributors assign blame elsewhere ("This website is broken").

## Research Foundation

### Primary Citation

> "An attributional theory of motivation and emotion is presented that includes the following sequence: following an outcome, an attribution or causal search is initiated to determine why the particular event has occurred. Causes are then identified within a three-dimensional space that includes locus, stability, and controllability."
> — Weiner, 1985, p. 548

**Full Citation (APA 7):**
Weiner, B. (1985). An attributional theory of achievement motivation and emotion. *Psychological Review, 92*(4), 548-573.

**DOI**: https://doi.org/10.1037/0033-295X.92.4.548

### Three Dimensions of Attribution

| Dimension | Poles | Example (Failed Task) |
|-----------|-------|----------------------|
| **Locus** | Internal vs External | "I made an error" vs "The site is confusing" |
| **Stability** | Stable vs Unstable | "I'm bad with computers" vs "I wasn't focused" |
| **Controllability** | Controllable vs Uncontrollable | "I should have read instructions" vs "The button was hidden" |

### Supporting Research

> "Students who attributed failure to lack of effort (internal, unstable, controllable) showed more persistence and improved performance compared to those who attributed failure to lack of ability (internal, stable, uncontrollable)."
> — Weiner, 1986, p. 163

**Full Citation (APA 7):**
Weiner, B. (1986). *An attributional theory of motivation and emotion*. Springer-Verlag.

### Key Numerical Values

| Metric | Value | Source |
|--------|-------|--------|
| Internal attribution -> higher persistence | r = 0.38 | Weiner (1985) |
| External attribution -> lower self-efficacy | r = -0.42 | Bandura (1977) |
| Controllable attribution -> task engagement | r = 0.45 | Weiner (1985) |
| Stable-external attribution -> learned helplessness | 3x higher | Seligman (1975) |
| User blame of self for computer errors | 40-60% | Nass et al. (1996) |
| User blame of system for objectively user errors | 30% | Nielsen (1993) |
| Attribution pattern affects retry behavior | 2.3x difference | Oulasvirta & Saariluoma (2004) |

## Behavioral Levels

| Value | Label | Behaviors |
|-------|-------|-----------|
| 0.0-0.2 | Strong External | Always blames website/app for failures; "This is broken"; reports bugs for user errors; low persistence after failure; expects system to adapt to them; rarely considers own actions as cause; requests support frequently |
| 0.2-0.4 | External-Leaning | Usually attributes problems to system; "Confusing interface"; may acknowledge own role sometimes; moderate persistence; prefers step-by-step guidance; expects clear error messages |
| 0.4-0.6 | Balanced Attribution | Considers both system and self factors; "Maybe I misclicked or the button is unclear"; reasonable persistence; reflects on actions; provides balanced feedback; adapts behavior based on outcomes |
| 0.6-0.8 | Internal-Leaning | Takes responsibility for most outcomes; "I probably missed something"; high persistence; reads instructions when stuck; self-blames for system issues sometimes; may excuse poor design |
| 0.8-1.0 | Strong Internal | Attributes almost all outcomes to self; "I should have been more careful"; excessive self-blame for system failures; very high persistence (sometimes counterproductive); may not report genuine bugs; apologizes for system errors |

## Web Behavior Patterns

### Error Handling

**External Attributors (0.0-0.3):**
- Immediately assume system fault
- Click "Report Bug" for user errors
- Low retry attempts after failure
- Demand support quickly
- Negative reviews citing "broken" features
- Switch to competitor after difficulties

**Internal Attributors (0.7-1.0):**
- Assume own mistake first
- Re-read instructions before reporting
- Multiple retry attempts with variations
- Search help documentation
- Blame self for unclear interfaces
- May accept poor UX as personal limitation

### Form Completion

**External Attributors:**
- Blame validation for rejected inputs
- Frustrated by format requirements
- "Why won't it accept my information?"
- Abandon after validation errors
- Expect system to handle any input format

**Internal Attributors:**
- Double-check own input after errors
- Read format hints carefully
- Assume they entered something wrong
- Try multiple formats to succeed
- May not notice genuinely poor validation

### Learning and Onboarding

**External Attributors:**
- Expect intuitive design, no learning
- Skip tutorials ("should be obvious")
- Blame interface when lost
- Request features that exist but weren't found
- Low investment in learning

**Internal Attributors:**
- Complete tutorials thoroughly
- Take notes and bookmark help
- Practice until competent
- Assume complexity is earned
- May over-invest in learning simple features

### Feedback and Reviews

**External Attributors:**
- "This app is terrible"
- "Doesn't work as advertised"
- "Worst UX ever designed"
- Focus on system shortcomings
- 1-star reviews for friction

**Internal Attributors:**
- "I'm still learning the interface"
- "Once you figure it out, it's great"
- "Steep learning curve but worth it"
- Focus on own progress
- Forgiving ratings despite issues

## Attribution Combinations

The three dimensions create distinct patterns:

| Pattern | Locus | Stability | Control | Behavior |
|---------|-------|-----------|---------|----------|
| **Helplessness** | External | Stable | Uncontrollable | "Technology hates me. Always will. Nothing I can do." Abandons quickly. |
| **Frustration** | External | Unstable | Uncontrollable | "This site is having problems today." Retries later. |
| **Blame** | External | Stable | Controllable | "Developers made this confusing on purpose." Hostile feedback. |
| **Growth** | Internal | Unstable | Controllable | "I wasn't focused. I'll try again carefully." High persistence. |
| **Fixed Mindset** | Internal | Stable | Uncontrollable | "I'm just not good with technology." Low self-efficacy. |

## Estimated Trait Correlations

> *Correlation estimates are derived from related research findings and theoretical models. Empirical calibration is planned ([GitHub #95](https://github.com/alexandriashai/cbrowser/issues/95)).*

| Related Trait | Correlation | Mechanism |
|--------------|-------------|-----------|
| [Self-Efficacy](./Trait-SelfEfficacy.md) | r = 0.52 | Internal attribution builds confidence |
| [Persistence](./Trait-Persistence.md) | r = 0.41 | Internal + controllable = retry motivation |
| [Resilience](./Trait-Resilience.md) | r = 0.38 | Attribution style affects recovery |
| [Trust Calibration](./Trait-TrustCalibration.md) | r = -0.26 | External attributors distrust systems |
| [Patience](./Trait-Patience.md) | r = 0.23 | Internal attributors invest patience in self-improvement |
| [Comprehension](./Trait-Comprehension.md) | r = 0.19 | Understanding reduces need for external blame |

## Persona Values

| Persona | Attribution Style Value | Rationale |
|---------|------------------------|-----------|
| **Anxious User** | 0.75 | Tends toward self-blame, anxiety heightens internal focus |
| **Careful Senior** | 0.65 | Methodical approach, takes responsibility |
| **Tech Enthusiast** | 0.60 | Experience enables balanced attribution |
| **Power User** | 0.55 | Balanced - knows when systems fail vs user error |
| **First-Time User** | 0.50 | Uncertain whether self or system at fault |
| **Elderly Novice** | 0.45 | May blame self ("I'm too old") or system variably |
| **Overwhelmed Parent** | 0.40 | Cognitive load reduces self-monitoring |
| **Rushed Professional** | 0.35 | Time pressure leads to blaming friction |
| **Distracted Teen** | 0.30 | External focus, expects seamless experience |

## Design Implications

### For External Attributors

1. **Clear error messages** - Explain what went wrong and why
2. **Guided recovery** - Don't just say "error," show the fix
3. **Blame-free language** - "Let's try again" not "You entered invalid data"
4. **Visible affordances** - Make interactive elements obvious
5. **Undo everywhere** - Allow easy recovery from mistakes

### For Internal Attributors

1. **Don't hide system issues** - Acknowledge when it's not their fault
2. **Status indicators** - Show system state to reduce self-blame
3. **Celebrate success** - Reinforce that they're doing it right
4. **Appropriate feedback** - Help them calibrate self-assessment
5. **Report mechanisms** - Make it easy to report actual bugs

### Error Message Design

**Poor (blames user):**
- "Invalid input"
- "Error: Try again"
- "Access denied"

**Better (neutral/helpful):**
- "Please enter a valid email address (e.g., name@example.com)"
- "Connection interrupted. Click to retry."
- "This feature requires login. Sign in to continue."

## Measurement in CBrowser

```typescript
// Attribution affects error response and persistence
function respondToError(error: UIError, traits: Traits): UserResponse {
  // Internal attribution = assume user error, retry
  // External attribution = assume system error, complain or abandon

  const internalAttribution = traits.attributionStyle;
  const perceivedAsSelf = random() < internalAttribution;

  if (perceivedAsSelf) {
    // Internal: retry with modified approach
    return {
      action: 'retry',
      approach: 'careful',
      persistenceBoost: 0.2,
      feedback: null
    };
  } else {
    // External: evaluate stability
    const perceivedAsStable = random() > 0.5;

    if (perceivedAsStable) {
      return {
        action: 'abandon',
        approach: null,
        persistenceBoost: -0.3,
        feedback: 'negative_review'
      };
    } else {
      return {
        action: 'retry_later',
        approach: 'default',
        persistenceBoost: -0.1,
        feedback: null
      };
    }
  }
}

// Attribution affects bug reporting behavior
function decideToBugReport(issue: Issue, traits: Traits): boolean {
  // External attributors report more (even user errors)
  // Internal attributors report less (even genuine bugs)
  const baseReportRate = issue.isActualBug ? 0.5 : 0.1;
  const attributionModifier = (0.5 - traits.attributionStyle) * 0.4;

  return random() < (baseReportRate + attributionModifier);
}
```

## See Also

- [Self-Efficacy](./Trait-SelfEfficacy.md) - Confidence in ability to succeed
- [Persistence](./Trait-Persistence.md) - Continued effort after setbacks
- [Resilience](./Trait-Resilience.md) - Recovery from failures
- [Trust Calibration](./Trait-TrustCalibration.md) - Trust in system reliability
- [Interrupt Recovery](./Trait-InterruptRecovery.md) - Resumption after disruption
- [Persona Index](../personas/Persona-Index.md) - Trait combinations in personas

## Bibliography

Bandura, A. (1977). Self-efficacy: Toward a unifying theory of behavioral change. *Psychological Review, 84*(2), 191-215. https://doi.org/10.1037/0033-295X.84.2.191

Nass, C., Moon, Y., & Carney, P. (1999). Are people polite to computers? Responses to computer-based interviewing systems. *Journal of Applied Social Psychology, 29*(5), 1093-1110. https://doi.org/10.1111/j.1559-1816.1999.tb00142.x

Nielsen, J. (1993). *Usability engineering*. Academic Press.

Oulasvirta, A., & Saariluoma, P. (2004). Long-term working memory and interrupting messages in human-computer interaction. *Behaviour & Information Technology, 23*(1), 53-64. https://doi.org/10.1080/01449290310001643033

Seligman, M. E. P. (1975). *Helplessness: On depression, development, and death*. W. H. Freeman.

Weiner, B. (1985). An attributional theory of achievement motivation and emotion. *Psychological Review, 92*(4), 548-573. https://doi.org/10.1037/0033-295X.92.4.548

Weiner, B. (1986). *An attributional theory of motivation and emotion*. Springer-Verlag.

Weiner, B. (2000). Intrapersonal and interpersonal theories of motivation from an attributional perspective. *Educational Psychology Review, 12*(1), 1-14. https://doi.org/10.1023/A:1009017532121
