# Patience

**Category**: Tier 1 - Core Traits
**Scale**: 0.0 (very impatient) to 1.0 (very patient)

## Definition

Patience represents a user's tolerance for delays, loading times, and waiting periods during web interactions. This trait fundamentally affects how long users will wait before abandoning a task, clicking away from slow-loading pages, or becoming frustrated with unresponsive interfaces. Users with low patience rapidly escalate through frustration states and are quick to seek alternatives, while highly patient users will persist through delays and give systems time to respond before making judgments.

## Research Foundation

### Primary Citation

> "Users start to feel that the system is not responding after about 8 seconds of delay... After this point, users become increasingly frustrated and are likely to abandon the page or repeat their action."
> - Nah, 2004, p. 156

**Full Citation (APA 7):**
Nah, F. F.-H. (2004). A study on tolerable waiting time: How long are Web users willing to wait? *Behaviour & Information Technology*, 23(3), 153-163. https://doi.org/10.1080/01449290410001669914

**DOI**: https://doi.org/10.1080/01449290410001669914

### Supporting Research

> "The acceptable response time depends on the complexity of the operation, with simple operations requiring faster responses (2 seconds) and complex operations tolerating longer delays (up to 10 seconds)."
> - Nielsen, 1993, p. 135

**Full Citation (APA 7):**
Nielsen, J. (1993). *Usability Engineering*. Academic Press. ISBN 978-0125184069

### Key Numerical Values

| Metric | Value | Source |
|--------|-------|--------|
| Tolerable wait time (simple) | 2 seconds | Nielsen (1993) |
| Tolerable wait time (complex) | 8-10 seconds | Nah (2004) |
| Abandonment threshold | 8+ seconds | Nah (2004) |
| Frustration onset | 3-4 seconds | Forrester Research (2009) |
| Bounce rate increase per second | 7% | Google (2017) |
| Mobile abandonment threshold | 3 seconds | Google (2018) |
| Repeat click probability after 8s | 68% | Nah (2004) |

## Behavioral Levels

| Value | Label | Behaviors |
|-------|-------|-----------|
| 0.0-0.2 | Very Impatient | Abandons pages after 2-3 seconds of load time. Clicks multiple times on slow buttons. Opens multiple tabs to "hedge bets." Becomes visibly frustrated at any delay. Will leave checkout if any step takes more than 2 seconds. Rarely waits for animations to complete. |
| 0.2-0.4 | Impatient | Tolerates 3-5 seconds of delay before frustration. Frequently refreshes slow pages. May abandon complex forms if validation is slow. Prefers instant feedback over thorough processing. Skips introductory animations. Uses back button aggressively when pages don't load quickly. |
| 0.4-0.6 | Moderate | Standard 8-10 second tolerance per Nah (2004). Will wait for reasonable loading if progress indicators are shown. May become frustrated with repeated delays but persists for high-value tasks. Accepts loading spinners as normal. Waits for search results but may refine query if too slow. |
| 0.6-0.8 | Patient | Tolerates 15-20 seconds for complex operations. Reads loading messages and status updates. Willing to wait for quality content. Doesn't reflexively click repeatedly. Understands that complex operations take time. Rarely abandons due to speed alone. |
| 0.8-1.0 | Very Patient | Tolerates 30+ seconds for important tasks. Reads terms and conditions fully. Waits for complete page loads before interacting. Never double-clicks out of impatience. Willing to retry failed operations. Provides patience buffer for first-time site visits. |

## Trait Correlations

| Related Trait | Correlation | Mechanism |
|---------------|-------------|-----------|
| [Persistence](Trait-Persistence) | r = 0.45 | Both load on conscientiousness factor; patient users persist longer |
| [Resilience](../traits/Trait-Resilience) | r = 0.38 | Patient users recover better from delays |
| [Self-Efficacy](../traits/Trait-SelfEfficacy) | r = 0.32 | Confident users wait longer, believing success is coming |
| [Risk Tolerance](Trait-RiskTolerance) | r = -0.22 | Impatient users take more shortcuts (risky behavior) |
| [FOMO](../traits/Trait-FOMO) | r = -0.41 | FOMO drives impatience to not miss out |

## Impact on Web Behavior

### Page Load Tolerance

```
Very Impatient (0.0-0.2): Abandons at 2-3 seconds
Impatient (0.2-0.4): Abandons at 4-5 seconds
Moderate (0.4-0.6): Abandons at 8-10 seconds (baseline)
Patient (0.6-0.8): Tolerates 15-20 seconds
Very Patient (0.8-1.0): Tolerates 30+ seconds
```

### Form Completion

- **Low patience**: Abandons multi-step forms, skips optional fields, frustrated by validation delays
- **High patience**: Completes all fields, reads instructions, waits for async validation

### Error Recovery

- **Low patience**: Immediately retries or leaves after first error
- **High patience**: Reads error messages, tries suggested solutions, waits for support

## Persona Values

| Persona | Patience Value | Rationale |
|---------|----------------|-----------|
| [Rushed Professional](../personas/Persona-RushedProfessional) | 0.2 | Time-pressured, multitasking, low tolerance |
| [Anxious First-Timer](../personas/Persona-AnxiousFirstTimer) | 0.3 | Nervous but slightly more willing to wait when unsure |
| [Distracted Parent](../personas/Persona-DistractedParent) | 0.25 | Frequent interruptions reduce patience |
| [Methodical Senior](../personas/Persona-MethodicalSenior) | 0.85 | Takes time, reads carefully, not rushed |
| [Tech-Savvy Explorer](../personas/Persona-TechSavvyExplorer) | 0.6 | Moderate patience, expects performance |
| [Accessibility User](../personas/Persona-AccessibilityUser) | 0.7 | Accustomed to slower interactions |

## UX Design Implications

### For Low-Patience Users
- Implement skeleton screens instead of spinners
- Show progress indicators for operations > 1 second
- Lazy load below-fold content
- Prefetch likely next pages
- Avoid blocking interactions during background operations

### For High-Patience Users
- Can show more detailed loading states
- May include richer loading animations
- Less need for aggressive optimization
- Can use interstitial pages for important information

## See Also

- [Trait Index](Trait-Index) - All cognitive traits
- [Persistence](Trait-Persistence) - Related grit trait
- [Working Memory](Trait-WorkingMemory) - Affects wait perception
- [Persona Index](../personas/Persona-Index) - Pre-configured personas

## Bibliography

Forrester Research. (2009). *eCommerce Web site performance today*. Forrester Research Report.

Google. (2017). Find out how you stack up to new industry benchmarks for mobile page speed. *Think with Google*. https://www.thinkwithgoogle.com/marketing-strategies/app-and-mobile/mobile-page-speed-new-industry-benchmarks/

Google. (2018). The need for mobile speed: How mobile latency impacts publisher revenue. *DoubleClick by Google*. https://www.doubleclickbygoogle.com/articles/mobile-speed-matters/

Nah, F. F.-H. (2004). A study on tolerable waiting time: How long are Web users willing to wait? *Behaviour & Information Technology*, 23(3), 153-163. https://doi.org/10.1080/01449290410001669914

Nielsen, J. (1993). *Usability Engineering*. Academic Press. ISBN 978-0125184069

Nielsen, J. (1999). *Designing Web Usability: The Practice of Simplicity*. New Riders Publishing.
