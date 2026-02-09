# Persistence

**Category**: Tier 1 - Core Traits
**Scale**: 0.0 (gives up easily) to 1.0 (persists through difficulty)

## Definition

Persistence represents a user's tendency to continue working toward a goal despite obstacles, errors, and frustration. In web contexts, this trait determines how many attempts a user will make before abandoning a task, how they respond to repeated failures, and their willingness to try alternative approaches. Users with low persistence quickly abandon tasks at the first sign of difficulty, while highly persistent users will exhaust multiple strategies before giving up.

## Research Foundation

### Primary Citation

> "Grit is perseverance and passion for long-term goals. Grit entails working strenuously toward challenges, maintaining effort and interest over years despite failure, adversity, and plateaus in progress."
> - Duckworth, Peterson, Matthews, & Kelly, 2007, p. 1088

**Full Citation (APA 7):**
Duckworth, A. L., Peterson, C., Matthews, M. D., & Kelly, D. R. (2007). Grit: Perseverance and passion for long-term goals. *Journal of Personality and Social Psychology*, 92(6), 1087-1101. https://doi.org/10.1037/0022-3514.92.6.1087

**DOI**: https://doi.org/10.1037/0022-3514.92.6.1087

### Supporting Research

> "The grit scale predicted retention and graduation over and above traditionally used measures of aptitude... Grit had incremental predictive validity above and beyond IQ for accomplishment in challenging domains."
> - Duckworth et al., 2007, p. 1093

### Key Numerical Values

| Metric | Value | Source |
|--------|-------|--------|
| Grit-success correlation | r = 0.42 | Duckworth et al. (2007) |
| Grit-conscientiousness correlation | r = 0.77 | Duckworth et al. (2007) |
| Task completion improvement with grit | 34% | Duckworth & Quinn (2009) |
| Average retry attempts (web forms) | 2.1 | Formisimo (2018) |
| Abandonment after 3 errors | 67% | Baymard Institute (2020) |
| Users who give up after 1 error | 18% | Nielsen Norman Group (2015) |

## Behavioral Levels

| Value | Label | Behaviors |
|-------|-------|-----------|
| 0.0-0.2 | Very Low Persistence | Abandons after first error or obstacle. Gives up on slow-loading pages. Leaves form immediately if validation fails. Won't retry a failed search. Exits checkout at any friction point. No error recovery attempts. Maximum one try for any action. |
| 0.2-0.4 | Low Persistence | Makes 1-2 attempts before giving up. Quick to assume "it's broken." Easily discouraged by error messages. May try one alternative approach. Abandons complex forms midway. Low tolerance for learning curves. Prefers immediate alternatives over problem-solving. |
| 0.4-0.6 | Moderate Persistence | Makes 2-3 attempts for important tasks. Reads error messages and adjusts. Willing to try suggested solutions. May search for help if frustrated. Completes multi-step processes if progress is visible. Baseline persistence per Baymard data. |
| 0.6-0.8 | High Persistence | Makes 4-5 attempts, tries multiple approaches. Searches for help documentation. Contacts support for important tasks. Willing to clear cache, try different browser. Persists through lengthy processes. Returns to abandoned tasks later. |
| 0.8-1.0 | Very High Persistence | Exhausts all options before abandoning. Troubleshoots systematically. Consults forums, documentation, support. Very rarely gives up entirely. Treats obstacles as problems to solve, not reasons to quit. Will complete task across multiple sessions if needed. |

## Grit Components

Duckworth's Grit Scale measures two factors relevant to web behavior:

### Consistency of Interest
- Staying focused on goals over time
- Not being distracted by new opportunities
- **Web impact**: Completes tasks despite distractions, returns to abandoned processes

### Perseverance of Effort
- Working hard despite setbacks
- Finishing what is started
- **Web impact**: Retries failed actions, seeks help, tries alternative approaches

## Estimated Trait Correlations

> *Correlation estimates are derived from related research findings and theoretical models. Empirical calibration is planned ([GitHub #95](https://github.com/alexandriashai/cbrowser/issues/95)).*

| Related Trait | Correlation | Mechanism |
|---------------|-------------|-----------|
| [Patience](./Trait-Patience.md) | r = 0.45 | Both load on conscientiousness |
| [Resilience](../traits/Trait-Resilience) | r = 0.52 | Emotional recovery enables persistence |
| [Self-Efficacy](../traits/Trait-SelfEfficacy) | r = 0.48 | Confidence fuels continued effort |
| [Metacognitive Planning](../traits/Trait-MetacognitivePlanning) | r = 0.41 | Planning enables strategic persistence |
| [Attribution Style](../traits/Trait-AttributionStyle) | r = 0.39 | Internal locus promotes persistence |

## Impact on Web Behavior

### Error Recovery Pattern

```
Very Low: Give up immediately (1 attempt)
Low: Try once more, then leave (2 attempts)
Moderate: Make 2-3 attempts, may seek help (3 attempts)
High: Try multiple approaches (4-5 attempts)
Very High: Exhaust all options (5+ attempts)
```

### Form Completion

| Persistence Level | Behavior on Validation Error |
|-------------------|------------------------------|
| Very Low | Abandons form entirely |
| Low | Fixes obvious error, gives up if second error occurs |
| Moderate | Works through 2-3 validation cycles |
| High | Completes form despite multiple error cycles |
| Very High | Seeks help if form appears broken |

### Search Behavior

- **Low persistence**: One search query, accepts first results or leaves
- **High persistence**: Reformulates queries, drills into results, tries alternative search engines

### Technical Issues

| Issue Type | Low Persistence Response | High Persistence Response |
|------------|--------------------------|---------------------------|
| Page won't load | Leaves immediately | Refreshes, tries different browser, clears cache |
| Button doesn't work | Gives up | Tries different method, checks for JS errors |
| Form won't submit | Abandons | Reviews fields, tries again, seeks help |
| Login fails | Gives up | Password reset, checks caps lock, contacts support |

## Persona Values

| Persona | Persistence Value | Rationale |
|---------|-------------------|-----------|
| [Rushed Professional](../personas/Persona-RushedProfessional) | 0.3 | Values time over persistence |
| [Distracted Parent](../personas/Persona-DistractedParent) | 0.35 | Interruptions prevent sustained effort |
| [Anxious First-Timer](../personas/Persona-AnxiousFirstTimer) | 0.4 | Anxiety undermines persistence |
| [Impulsive Shopper](../personas/Persona-ImpulsiveShopper) | 0.25 | Low frustration tolerance |
| [Methodical Senior](../personas/Persona-MethodicalSenior) | 0.75 | Patient and thorough |
| [Tech-Savvy Explorer](../personas/Persona-TechSavvyExplorer) | 0.8 | Challenges are interesting problems |

## UX Design Implications

### For Low-Persistence Users

- Minimize errors through input constraints
- Provide inline validation with clear solutions
- Use autofill and smart defaults
- Keep processes short (3 steps or fewer)
- Show immediate feedback on every action
- Offer "save progress" for complex flows
- Make retry/undo obvious and easy

### For High-Persistence Users

- Provide detailed error information
- Include advanced troubleshooting options
- Offer help documentation and FAQs
- Allow multiple recovery paths
- Don't oversimplify at expense of capability

## See Also

- [Trait Index](./Trait-Index.md) - All cognitive traits
- [Patience](./Trait-Patience.md) - Related time tolerance trait
- [Resilience](../traits/Trait-Resilience) - Emotional recovery from setbacks
- [Self-Efficacy](../traits/Trait-SelfEfficacy) - Confidence in ability to succeed
- [Persona Index](../personas/Persona-Index.md) - Pre-configured personas

## Bibliography

Baymard Institute. (2020). Form field usability: The relationship between input fields and form conversion. https://baymard.com/blog/form-field-usability

Duckworth, A. L., Peterson, C., Matthews, M. D., & Kelly, D. R. (2007). Grit: Perseverance and passion for long-term goals. *Journal of Personality and Social Psychology*, 92(6), 1087-1101. https://doi.org/10.1037/0022-3514.92.6.1087

Duckworth, A. L., & Quinn, P. D. (2009). Development and validation of the Short Grit Scale (Grit-S). *Journal of Personality Assessment*, 91(2), 166-174. https://doi.org/10.1080/00223890802634290

Formisimo. (2018). Form analytics: How users interact with web forms. https://www.formisimo.com/research

Nielsen Norman Group. (2015). Error message guidelines. https://www.nngroup.com/articles/error-message-guidelines/
