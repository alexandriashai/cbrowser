# Time Horizon

**Category**: Tier 3 - Decision-Making Traits
**Scale**: 0.0 (present-focused) to 1.0 (future-focused)

## Definition

Time Horizon describes an individual's temporal orientation in decision-making, particularly how they weigh immediate rewards against delayed but larger rewards. Rooted in hyperbolic discounting research, this trait affects web behavior across purchasing decisions (instant gratification vs. waiting for sales), subscription choices (monthly vs. annual), security behaviors (convenience vs. long-term protection), and content consumption (quick entertainment vs. educational investment). Present-focused users strongly prefer immediate outcomes; future-focused users invest present effort for larger future returns.

## Research Foundation

### Primary Citation

> "I propose a 'golden eggs' model of intertemporal choice. The model adopts a quasi-hyperbolic discount function and assumes that consumers are naive about their future preferences... The model generates short-run impatience and long-run patience."
> — Laibson, 1997, p. 443

**Full Citation (APA 7):**
Laibson, D. (1997). Golden eggs and hyperbolic discounting. *The Quarterly Journal of Economics, 112*(2), 443-478.

**DOI**: https://doi.org/10.1162/003355397555253

### Hyperbolic Discounting Model

The quasi-hyperbolic (beta-delta) model captures human time preferences:

**Standard exponential discounting:** U = u(now) + delta * u(later)

**Hyperbolic discounting:** U = u(now) + beta * delta * u(later)

Where beta (0 < beta < 1) represents present bias - the additional devaluation of all future rewards.

### Key Numerical Values

| Metric | Value | Source |
|--------|-------|--------|
| Beta parameter (present bias) | 0.7-0.9 | Laibson (1997) |
| Annual discount rate implied | 17-36% | Laibson (1997) |
| Immediate vs 1-month delay discount | 30-40% | Frederick et al. (2002) |
| 1-month vs 1-year delay discount | 10-15% | Frederick et al. (2002) |
| Preference reversal rate | 58% | Read et al. (1999) |
| Annual plan cost savings ignored | 15-20% | Industry data |
| "Free trial" conversion requiring future payment | 60% lower than immediate | Various |

### Present Bias Empirical Findings

> "When subjects are asked to choose between $100 today and $110 tomorrow, many prefer the immediate reward. But when choosing between $100 in 30 days and $110 in 31 days, the same subjects often prefer to wait the extra day for more money."
> — Frederick, Loewenstein, & O'Donoghue, 2002

**Full Citation (APA 7):**
Frederick, S., Loewenstein, G., & O'Donoghue, T. (2002). Time discounting and time preference: A critical review. *Journal of Economic Literature, 40*(2), 351-401.

**DOI**: https://doi.org/10.1257/002205102320161311

## Behavioral Levels

| Value | Label | Behaviors |
|-------|-------|-----------|
| 0.0-0.2 | Extreme Present Focus | Immediate gratification dominant; clicks "Buy Now" over "Save for Later"; chooses monthly billing over discounted annual; skips security setup for quick access; abandons onboarding that delays core value; strong preference for instant downloads over queued |
| 0.2-0.4 | Present-Leaning | Prefers immediate options but will wait for significant rewards; may select annual billing if discount is large (>30%); quick account creation over secure setup; minimal investment in configuration |
| 0.4-0.6 | Balanced Temporal | Considers both timeframes; evaluates immediate vs delayed tradeoffs; moderate willingness to invest setup time; responds to reasonable long-term incentives |
| 0.6-0.8 | Future-Leaning | Invests present effort for future benefits; selects annual plans for savings; completes full onboarding; configures security properly; reads documentation before using; saves items rather than impulse buying |
| 0.8-1.0 | Extreme Future Focus | Strong delayed gratification; extensive planning before action; always chooses longest billing cycle for maximum savings; comprehensive security setup; thorough learning investment; may over-delay immediate needs |

## Web Behavior Patterns

### Subscription and Billing

**Present-Focused (0.0-0.3):**
- Monthly billing despite higher total cost
- "Start free trial" over "Buy annual plan"
- Pay-per-use over committed plans
- Ignores TCO (total cost of ownership)
- Upgrades impulsively when features needed

**Future-Focused (0.7-1.0):**
- Annual billing for cost savings
- Evaluates multi-year options
- Considers long-term value over entry price
- Waits for sales on non-urgent purchases
- Plans subscription renewals in advance

### Security and Privacy

**Present-Focused:**
- "Skip" on 2FA setup
- Weak passwords for convenience
- "Remember me" on shared devices
- Ignores privacy settings for faster signup
- Clicks through security warnings

**Future-Focused:**
- Enables all security features
- Uses password managers
- Reads privacy policies
- Configures granular permissions
- Updates software proactively

### Onboarding and Setup

**Present-Focused:**
- Skips tutorials to use product immediately
- Minimal profile completion
- Default settings accepted
- "I'll do it later" on optional steps
- Quick-start over comprehensive setup

**Future-Focused:**
- Completes full onboarding
- Configures preferences thoroughly
- Watches tutorial videos
- Connects integrations
- Invests time in learning curve

### Content Consumption

**Present-Focused:**
- Short-form content (TikTok, Reels)
- Skips to interesting parts
- Entertainment over education
- Immediate satisfaction content
- High bounce rate on long-form

**Future-Focused:**
- Long-form articles and courses
- Educational content investment
- Bookmark for later reading
- Newsletter subscriptions
- Documentation and reference material

## Trait Correlations

| Related Trait | Correlation | Mechanism |
|--------------|-------------|-----------|
| [Patience](./Trait-Patience.md) | r = 0.68 | Future focus requires waiting tolerance |
| [Persistence](./Trait-Persistence.md) | r = 0.52 | Long-term goals require sustained effort |
| [Self-Efficacy](./Trait-SelfEfficacy.md) | r = 0.34 | Confidence in future self enables delay |
| [Risk Tolerance](./Trait-RiskTolerance.md) | r = -0.28 | Present focus correlates with risk-seeking |
| [Satisficing](./Trait-Satisficing.md) | r = 0.21 | Future-focused may optimize more |
| [Metacognitive Planning](./Trait-MetacognitivePlanning.md) | r = 0.45 | Planning requires future orientation |

## Persona Values

| Persona | Time Horizon Value | Rationale |
|---------|-------------------|-----------|
| **Distracted Teen** | 0.15 | Strong present bias, immediate gratification |
| **Rushed Professional** | 0.35 | Time pressure creates present focus |
| **Overwhelmed Parent** | 0.40 | Cognitive load reduces future planning |
| **First-Time User** | 0.45 | Eager to see product value now |
| **Anxious User** | 0.50 | Uncertainty about future affects planning |
| **Careful Senior** | 0.60 | Methodical approach, considers consequences |
| **Tech Enthusiast** | 0.65 | Invests in learning for mastery |
| **Power User** | 0.70 | Configuration investment for long-term efficiency |
| **Elderly Novice** | 0.55 | May rush due to frustration or be cautious |

## Design Implications

### For Present-Focused Users

1. **Immediate value** - Show core value before requiring investment
2. **Progressive onboarding** - Delay optional setup
3. **Monthly options** - Even if annual is better value
4. **Quick wins** - Early dopamine hits
5. **Reduce friction** - Minimize steps to reward

### For Future-Focused Users

1. **Annual discounts** - Prominently display savings
2. **Comprehensive onboarding** - Full setup options
3. **Documentation access** - Learning resources
4. **Long-term benefits** - Communicate future value
5. **Security features** - Easy to enable

### Ethical Design

- Don't exploit present bias with dark patterns
- Make long-term costs clear (subscription traps)
- Default to user-beneficial options
- Allow preference changes easily

## Measurement in CBrowser

```typescript
// Time horizon affects billing and commitment decisions
function selectBillingCycle(
  options: BillingOption[],
  traits: Traits
): BillingOption {
  // Sort by monthly cost (annual plans have lower monthly equivalent)
  const sorted = options.sort((a, b) => a.monthlyEquivalent - b.monthlyEquivalent);

  if (traits.timeHorizon > 0.7) {
    // Future-focused: select best long-term value
    return sorted[0]; // Cheapest per month (usually annual)
  } else if (traits.timeHorizon > 0.4) {
    // Balanced: consider if discount is compelling
    const annualSavings = (sorted[sorted.length - 1].monthlyEquivalent - sorted[0].monthlyEquivalent)
                          / sorted[sorted.length - 1].monthlyEquivalent;
    if (annualSavings > 0.2) return sorted[0];
    return sorted[sorted.length - 1];
  } else {
    // Present-focused: select lowest commitment
    return sorted[sorted.length - 1]; // Monthly/shortest term
  }
}

// Onboarding completion
function completeOnboardingStep(step: OnboardingStep, traits: Traits): boolean {
  if (step.required) return true;

  const completionProbability =
    step.immediateValue * (1 - traits.timeHorizon) +
    step.futureValue * traits.timeHorizon;

  return random() < completionProbability;
}
```

## Hyperbolic Discounting Formula

CBrowser uses the quasi-hyperbolic model:

```typescript
function discountedValue(
  value: number,
  delayDays: number,
  traits: Traits
): number {
  const beta = 0.5 + traits.timeHorizon * 0.5; // 0.5-1.0
  const delta = 0.95 + traits.timeHorizon * 0.05; // 0.95-1.0 per period

  if (delayDays === 0) return value;

  // Quasi-hyperbolic: immediate present bias + exponential
  return value * beta * Math.pow(delta, delayDays / 30);
}
```

## See Also

- [Patience](./Trait-Patience.md) - Tolerance for waiting
- [Persistence](./Trait-Persistence.md) - Sustained effort toward goals
- [Self-Efficacy](./Trait-SelfEfficacy.md) - Belief in future success
- [Satisficing](./Trait-Satisficing.md) - "Good enough now" vs optimal later
- [Metacognitive Planning](./Trait-MetacognitivePlanning.md) - Strategic future thinking
- [Persona Index](../personas/Persona-Index.md) - Trait combinations in personas

## Bibliography

Ainslie, G. (1992). *Picoeconomics: The strategic interaction of successive motivational states within the person*. Cambridge University Press.

Frederick, S., Loewenstein, G., & O'Donoghue, T. (2002). Time discounting and time preference: A critical review. *Journal of Economic Literature, 40*(2), 351-401. https://doi.org/10.1257/002205102320161311

Laibson, D. (1997). Golden eggs and hyperbolic discounting. *The Quarterly Journal of Economics, 112*(2), 443-478. https://doi.org/10.1162/003355397555253

O'Donoghue, T., & Rabin, M. (1999). Doing it now or later. *American Economic Review, 89*(1), 103-124. https://doi.org/10.1257/aer.89.1.103

Read, D., Loewenstein, G., & Kalyanaraman, S. (1999). Mixing virtue and vice: Combining the immediacy effect and the diversification heuristic. *Journal of Behavioral Decision Making, 12*(4), 257-273. https://doi.org/10.1002/(SICI)1099-0771(199912)12:4<257::AID-BDM327>3.0.CO;2-6

Thaler, R. H. (1981). Some empirical evidence on dynamic inconsistency. *Economics Letters, 8*(3), 201-207. https://doi.org/10.1016/0165-1765(81)90067-7
