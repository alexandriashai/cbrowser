# Anchoring Bias

**Category**: Tier 3 - Decision-Making Traits
**Scale**: 0.0 (low susceptibility) to 1.0 (high susceptibility)

## Definition

Anchoring Bias describes the cognitive tendency to rely heavily on the first piece of information encountered (the "anchor") when making subsequent judgments, even when that anchor is arbitrary or irrelevant. In web contexts, this trait affects how users perceive prices (relative to initial prices shown), estimate quantities (based on default values), evaluate quality (influenced by first reviews seen), and process numerical information generally. High-anchoring users' judgments drift strongly toward initial values; low-anchoring users adjust more completely from anchors toward rational estimates.

## Research Foundation

### Primary Citation

> "In many situations, people make estimates by starting from an initial value that is adjusted to yield the final answer... adjustments are typically insufficient. That is, different starting points yield different estimates, which are biased toward the initial values."
> — Tversky & Kahneman, 1974, p. 1128

**Full Citation (APA 7):**
Tversky, A., & Kahneman, D. (1974). Judgment under uncertainty: Heuristics and biases. *Science, 185*(4157), 1124-1131.

**DOI**: https://doi.org/10.1126/science.185.4157.1124

### The Wheel Experiment

The landmark demonstration of anchoring:

> "Subjects were asked to estimate various quantities, stated in percentages (for example, the percentage of African countries in the United Nations). A wheel of fortune with numbers 1-100 was spun in subjects' presence. Subjects were first asked whether the quantity was higher or lower than the number on the wheel, and then asked for their estimate. The arbitrary number had a marked effect on estimates."
> — Tversky & Kahneman, 1974, p. 1128

**Key Finding:**
- When the wheel stopped at **10**: Median estimate of African UN countries = **25%**
- When the wheel stopped at **65**: Median estimate of African UN countries = **45%**
- The anchor shifted estimates by **20 percentage points** despite being completely random

### Key Numerical Values

| Metric | Value | Source |
|--------|-------|--------|
| Low anchor (10) -> estimate | 25% | Tversky & Kahneman (1974) |
| High anchor (65) -> estimate | 45% | Tversky & Kahneman (1974) |
| Anchor effect size | 20 percentage points | Tversky & Kahneman (1974) |
| Real estate listing anchor effect | $11,000-14,000 | Northcraft & Neale (1987) |
| Price anchor persistence | 48+ hours | Ariely et al. (2003) |
| Anchor effect on WTP (willingness to pay) | 60-120% | Ariely et al. (2003) |
| Expert susceptibility (real estate agents) | Nearly equal to amateurs | Northcraft & Neale (1987) |

## Behavioral Levels

| Value | Label | Behaviors |
|-------|-------|-----------|
| 0.0-0.2 | Anchor Resistant | Largely ignores suggested values; makes independent estimates; skeptical of "was/now" pricing; compares across sources before forming judgments; resets expectations when context changes |
| 0.2-0.4 | Low Susceptibility | Acknowledges anchors but adjusts significantly; cross-references prices and ratings; somewhat influenced by defaults but overrides when motivated; moderate adjustment from starting points |
| 0.4-0.6 | Moderate Susceptibility | Noticeable anchor influence; accepts default form values frequently; price perception shaped by strikethrough prices; rating expectations set by first reviews; partial adjustment from anchors |
| 0.6-0.8 | High Susceptibility | Strong anchor influence on judgments; "was $99, now $49" highly persuasive; first review strongly shapes opinion; default values rarely changed; limited adjustment from starting points |
| 0.8-1.0 | Extreme Susceptibility | Anchors dominate judgment; original prices define value perception; first information encountered becomes truth; almost never changes default values; minimal adjustment regardless of evidence |

## Web Behavior Patterns

### Price Perception

**Anchor-Resistant (0.0-0.3):**
- Ignores "was/now" strikethrough pricing
- Compares prices across multiple sites
- Uses price history tools
- Skeptical of "limited time" claims
- Values absolute price over relative discount

**Highly Anchored (0.7-1.0):**
- "Was $200, now $99" feels like genuine 50% savings
- First price seen sets value expectation
- MSRP anchors all discount evaluations
- Higher anchor makes actual price seem reasonable
- "Compare at $150" influences perception

### Form Default Values

**Anchor-Resistant:**
- Reviews and changes default selections
- Calculates appropriate values independently
- Questions why defaults are set as they are
- Changes tip percentages from suggested amounts

**Highly Anchored:**
- Accepts pre-filled values as appropriate
- Uses suggested donation amounts
- Leaves tip percentage at first option
- Rarely modifies quantity defaults (qty: 1)

### Rating and Review Perception

**Anchor-Resistant:**
- Reads multiple reviews before forming opinion
- Weights recent reviews appropriately
- Discounts extreme first impressions
- Considers review distribution not just average

**Highly Anchored:**
- First review shapes product perception
- Initial star rating becomes expected quality
- Early negative review creates lasting negative impression
- "Featured review" disproportionately influential

### Numerical Estimation

**Anchor-Resistant:**
- Makes independent estimates before seeing suggestions
- Recognizes irrelevant numbers as manipulation
- Adjusts fully when given new information

**Highly Anchored:**
- "Enter amount: $100" influences donation amount
- Suggested search refinements affect query
- Countdown timers affect urgency perception
- "X people are viewing this" shapes demand perception

## Estimated Trait Correlations

> *Correlation estimates are derived from related research findings and theoretical models. Empirical calibration is planned ([GitHub #95](https://github.com/alexandriashai/cbrowser/issues/95)).*

| Related Trait | Correlation | Mechanism |
|--------------|-------------|-----------|
| [Comprehension](./Trait-Comprehension.md) | r = -0.22 | Understanding enables anchor recognition |
| [Risk Tolerance](./Trait-RiskTolerance.md) | r = 0.18 | Risk-takers may use anchors as shortcuts |
| [Satisficing](./Trait-Satisficing.md) | r = 0.35 | Satisficers accept anchored "good enough" values |
| [Self-Efficacy](./Trait-SelfEfficacy.md) | r = -0.24 | Confidence enables independent judgment |
| [Trust Calibration](./Trait-TrustCalibration.md) | r = -0.31 | Skeptics question anchor validity |
| [Authority Sensitivity](./Trait-AuthoritySensitivity.md) | r = 0.38 | Authority-sensitive users accept suggested values |

## Persona Values

| Persona | Anchoring Bias Value | Rationale |
|---------|---------------------|-----------|
| **Elderly Novice** | 0.80 | Trusts displayed values as authoritative |
| **Distracted Teen** | 0.70 | Quick processing relies on anchors |
| **First-Time User** | 0.65 | Lacks context for independent judgment |
| **Overwhelmed Parent** | 0.60 | Cognitive load increases heuristic use |
| **Anxious User** | 0.55 | Uncertainty increases anchor reliance |
| **Careful Senior** | 0.45 | Methodical but still susceptible |
| **Rushed Professional** | 0.50 | Time pressure increases anchoring |
| **Power User** | 0.30 | Experience provides comparison context |
| **Tech Enthusiast** | 0.25 | Research habits reduce anchor influence |

## Design Implications

### Ethical Anchoring

1. **Reasonable defaults** - Pre-fill values that genuinely help users
2. **Accurate original prices** - Show real previous prices, not inflated MSRPs
3. **Balanced review display** - Don't always show extreme reviews first
4. **Transparent suggestions** - Explain why values are suggested

### Dark Pattern Awareness

Sites exploit anchoring through:
- Inflated "original" prices
- Extreme high-anchor subscription tiers ("Enterprise: $999/mo")
- Pre-selected quantities or options
- Artificially high "compare at" prices
- Suggested tip amounts that anchor high

### Testing Considerations

CBrowser tests should verify:
- Users aren't manipulated by arbitrary anchors
- Default values are genuinely helpful
- Price presentations are honest
- Review ordering is fair

## Measurement in CBrowser

```typescript
// Anchoring affects value perception and defaults
function perceiveValue(
  displayedPrice: number,
  originalPrice: number | null,
  traits: Traits
): PerceivedValue {
  if (originalPrice === null) {
    return { value: displayedPrice, confidence: 'neutral' };
  }

  const discount = (originalPrice - displayedPrice) / originalPrice;
  const anchorInfluence = discount * traits.anchoringBias;

  // Highly anchored users perceive more value from discount framing
  const perceivedValue = displayedPrice * (1 - anchorInfluence * 0.5);

  return {
    value: perceivedValue,
    confidence: anchorInfluence > 0.3 ? 'good-deal' : 'neutral',
    likelyToPurchase: anchorInfluence > 0.4
  };
}

// Default value acceptance
function modifyDefault(defaultValue: number, optimalValue: number, traits: Traits): number {
  // High anchoring = accept default; low = adjust to optimal
  const adjustment = (optimalValue - defaultValue) * (1 - traits.anchoringBias);
  return defaultValue + adjustment;
}
```

## See Also

- [Satisficing](./Trait-Satisficing.md) - Anchors provide quick "good enough" answers
- [Trust Calibration](./Trait-TrustCalibration.md) - Skepticism of anchor validity
- [Authority Sensitivity](./Trait-AuthoritySensitivity.md) - Suggested values as authority
- [Self-Efficacy](./Trait-SelfEfficacy.md) - Confidence to form independent judgments
- [Time Horizon](./Trait-TimeHorizon.md) - Time pressure increases anchoring
- [Persona Index](../personas/Persona-Index.md) - Trait combinations in personas

## Bibliography

Ariely, D., Loewenstein, G., & Prelec, D. (2003). "Coherent arbitrariness": Stable demand curves without stable preferences. *The Quarterly Journal of Economics, 118*(1), 73-106. https://doi.org/10.1162/00335530360535153

Furnham, A., & Boo, H. C. (2011). A literature review of the anchoring effect. *The Journal of Socio-Economics, 40*(1), 35-42. https://doi.org/10.1016/j.socec.2010.10.008

Kahneman, D. (2011). *Thinking, fast and slow*. Farrar, Straus and Giroux.

Northcraft, G. B., & Neale, M. A. (1987). Experts, amateurs, and real estate: An anchoring-and-adjustment perspective on property pricing decisions. *Organizational Behavior and Human Decision Processes, 39*(1), 84-97. https://doi.org/10.1016/0749-5978(87)90046-X

Tversky, A., & Kahneman, D. (1974). Judgment under uncertainty: Heuristics and biases. *Science, 185*(4157), 1124-1131. https://doi.org/10.1126/science.185.4157.1124
