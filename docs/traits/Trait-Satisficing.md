# Satisficing

**Category**: Tier 3 - Decision-Making Traits
**Scale**: 0.0 (maximizing) to 1.0 (satisficing)

## Definition

Satisficing describes a decision-making strategy where users accept the first option that meets a minimum threshold of acceptability rather than exhaustively evaluating all alternatives to find the optimal choice. Coined by Herbert Simon as part of his bounded rationality framework, this trait profoundly affects web behavior: high satisficers click the first search result that seems relevant, select the initial product matching basic criteria, and complete forms with "good enough" information. Low satisficers (maximizers) compare every option, read all reviews, and often experience decision paralysis or post-decision regret when they cannot be certain they made the optimal choice.

## Research Foundation

### Primary Citation

> "Because of the limits of human ability to process information, people must use approximate methods to handle most tasks. These methods are called heuristics. A decision maker who chooses the best available alternative according to some criterion is said to optimize; one who chooses an alternative that meets or exceeds specified criteria, but that is not guaranteed to be either unique or in any sense the best, is said to satisfice."
> — Herbert A. Simon, 1956, p. 129

**Full Citation (APA 7):**
Simon, H. A. (1956). Rational choice and the structure of the environment. *Psychological Review, 63*(2), 129-138.

**DOI**: https://doi.org/10.1037/h0042769

### Supporting Research

> "Maximizers reported significantly less satisfaction with consumer decisions than satisficers... and were more likely to engage in social comparison, regret, and depression."
> — Schwartz et al., 2002, p. 1189

**Full Citation (APA 7):**
Schwartz, B., Ward, A., Monterosso, J., Lyubomirsky, S., White, K., & Lehman, D. R. (2002). Maximizing versus satisficing: Happiness is a matter of choice. *Journal of Personality and Social Psychology, 83*(5), 1178-1197.

**DOI**: https://doi.org/10.1037/0022-3514.83.5.1178

### Key Numerical Values

| Metric | Value | Source |
|--------|-------|--------|
| Satisficers report higher life satisfaction | r = 0.34 | Schwartz et al. (2002) |
| Maximizers report more regret | r = 0.47 | Schwartz et al. (2002) |
| Maximizers score higher on depression scales | r = 0.35 | Schwartz et al. (2002) |
| Search result clicks concentrated on first 3 results | 68% | Nielsen Norman Group (2006) |
| Time increase for maximizing vs satisficing decisions | 2.3x | Iyengar & Lepper (2000) |
| Choice overload threshold | 6-24 options | Iyengar & Lepper (2000) |

## Behavioral Levels

| Value | Label | Behaviors |
|-------|-------|-----------|
| 0.0-0.2 | Extreme Maximizer | Opens every search result in tabs; compares all product options in spreadsheets; reads all reviews before purchasing; frequently abandons decisions due to inability to choose; experiences strong post-decision regret; uses comparison tools obsessively |
| 0.2-0.4 | Moderate Maximizer | Evaluates 5-10 options before deciding; scrolls through multiple search pages; reads several reviews per product; uses filters extensively; sometimes backtracks to reconsider rejected options; takes 3-5x longer than average on e-commerce decisions |
| 0.4-0.6 | Balanced | Considers 3-5 options typically; reads a few top reviews; uses basic filters; satisfied with "good" rather than "best"; moderate use of comparison features; occasional regret but moves on quickly |
| 0.6-0.8 | Moderate Satisficer | Clicks first plausible search result; selects from top 2-3 options only; reads 1-2 reviews if any; quick form completion with minimal verification; rarely uses comparison tools; low post-decision regret |
| 0.8-1.0 | Extreme Satisficer | Clicks first search result immediately; selects default or featured options; skips reviews entirely; completes forms with minimal information; uses "I'm feeling lucky" type features; zero post-decision rumination |

## Web Behavior Patterns

### Search Behavior

**Maximizers (0.0-0.3):**
- Open 10+ tabs from search results
- Refine search queries 5+ times
- Use advanced search operators
- Visit page 2+ of search results
- Cross-reference multiple search engines

**Satisficers (0.7-1.0):**
- Click first relevant result
- Rarely modify initial query
- Never visit page 2
- Trust featured snippets
- Single-engine reliance

### E-commerce Behavior

**Maximizers:**
- Use price comparison extensions
- Track price history
- Read negative reviews specifically
- Sort by multiple criteria
- Experience cart abandonment from indecision

**Satisficers:**
- Buy featured/recommended products
- Accept default shipping options
- Minimal review reading
- Quick checkout completion
- Higher impulse purchase rate

### Form Completion

**Maximizers:**
- Double-check all fields
- Research required information
- Prefer precise over approximate values
- May abandon if uncertain about "best" answer

**Satisficers:**
- First valid value entered
- Skip optional fields
- Round numbers ("about 30" not "32")
- Quick completion even if imprecise

## Trait Correlations

| Related Trait | Correlation | Mechanism |
|--------------|-------------|-----------|
| [Patience](./Trait-Patience.md) | r = -0.38 | Satisficers make faster decisions, reducing patience demands |
| [Working Memory](./Trait-WorkingMemory.md) | r = 0.21 | Maximizing requires holding multiple options in memory |
| [Risk Tolerance](./Trait-RiskTolerance.md) | r = 0.25 | Satisficing accepts "good enough" risk of non-optimal choice |
| [Information Foraging](./Trait-InformationForaging.md) | r = -0.44 | Maximizers forage longer for complete information |
| [Time Horizon](./Trait-TimeHorizon.md) | r = -0.19 | Maximizers invest present time for future optimal outcomes |

## Persona Values

| Persona | Satisficing Value | Rationale |
|---------|-------------------|-----------|
| **Rushed Professional** | 0.85 | Time pressure forces satisficing |
| **Distracted Teen** | 0.75 | Low investment in optimal outcomes |
| **Careful Senior** | 0.25 | Methodical comparison seeking |
| **Tech Enthusiast** | 0.30 | Researches extensively before adopting |
| **Overwhelmed Parent** | 0.70 | Cognitive load forces "good enough" |
| **First-Time User** | 0.55 | Moderate - wants results but uncertain |
| **Power User** | 0.40 | Knows optimal paths but values efficiency |
| **Anxious User** | 0.20 | Fear of wrong choice drives maximizing |
| **Elderly Novice** | 0.30 | Careful, methodical approach |

## Design Implications

### For Satisficers (high values)
- Feature prominent default/recommended options
- Place best options first in lists
- Minimize choice complexity
- Clear "quick path" through interfaces
- Reduce confirmation dialogs

### For Maximizers (low values)
- Provide comparison tools
- Enable sorting by multiple criteria
- Show detailed specifications
- Include comprehensive reviews
- Allow saving/returning to decisions

## Measurement in CBrowser

```typescript
// Satisficing affects search result selection
if (traits.satisficing > 0.7) {
  // Click first relevant result
  return selectResult(results[0]);
} else {
  // Open multiple results for comparison
  const toCompare = results.slice(0, Math.ceil((1 - traits.satisficing) * 10));
  return openForComparison(toCompare);
}
```

## See Also

- [Information Foraging](./Trait-InformationForaging.md) - How users hunt for information
- [Anchoring Bias](./Trait-AnchoringBias.md) - How first information affects decisions
- [Risk Tolerance](./Trait-RiskTolerance.md) - Willingness to accept uncertainty
- [Working Memory](./Trait-WorkingMemory.md) - Capacity for option comparison
- [Persona Index](../personas/Persona-Index.md) - Trait combinations in personas

## Bibliography

Iyengar, S. S., & Lepper, M. R. (2000). When choice is demotivating: Can one desire too much of a good thing? *Journal of Personality and Social Psychology, 79*(6), 995-1006. https://doi.org/10.1037/0022-3514.79.6.995

Nielsen, J. (2006). F-shaped pattern for reading web content. *Nielsen Norman Group*. https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/

Schwartz, B., Ward, A., Monterosso, J., Lyubomirsky, S., White, K., & Lehman, D. R. (2002). Maximizing versus satisficing: Happiness is a matter of choice. *Journal of Personality and Social Psychology, 83*(5), 1178-1197. https://doi.org/10.1037/0022-3514.83.5.1178

Simon, H. A. (1956). Rational choice and the structure of the environment. *Psychological Review, 63*(2), 129-138. https://doi.org/10.1037/h0042769

Simon, H. A. (1990). Invariants of human behavior. *Annual Review of Psychology, 41*(1), 1-19. https://doi.org/10.1146/annurev.ps.41.020190.000245
