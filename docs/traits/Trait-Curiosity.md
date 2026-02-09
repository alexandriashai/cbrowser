# Curiosity

**Category**: Tier 1 - Core Traits
**Scale**: 0.0 (goal-focused only) to 1.0 (highly exploratory)

## Definition

Curiosity represents a user's intrinsic motivation to explore, discover, and learn beyond their immediate task requirements. This trait governs whether users stay narrowly focused on their goals or venture into related content, features, and options. Users with low curiosity follow the most direct path to their objective, while highly curious users actively seek new information, explore tangential links, and engage with content beyond their original purpose.

## Research Foundation

### Primary Citation

> "Epistemic curiosity is the desire for knowledge that motivates exploration in the absence of any extrinsic reward... It is the primary drive that motivates scientific inquiry and intellectual exploration."
> - Berlyne, 1960, p. 274

**Full Citation (APA 7):**
Berlyne, D. E. (1960). *Conflict, Arousal, and Curiosity*. McGraw-Hill. https://doi.org/10.1037/11229-000

**DOI**: https://doi.org/10.1037/11229-000

### Supporting Research

> "Curiosity is characterized by two dimensions: diversive curiosity (seeking novel stimulation) and specific curiosity (seeking particular information to reduce uncertainty)."
> - Litman, 2005, p. 795

**Full Citation (APA 7):**
Litman, J. A. (2005). Curiosity and the pleasures of learning: Wanting and liking new information. *Cognition & Emotion*, 19(6), 793-814. https://doi.org/10.1080/02699930541000101

### Key Numerical Values

| Metric | Value | Source |
|--------|-------|--------|
| Information gap effect on attention | 27% increase | Loewenstein (1994) |
| Curiosity-learning correlation | r = 0.50 | Kashdan & Silvia (2009) |
| Click-through on "related content" | 12% average | Chartbeat (2017) |
| Time increase from curiosity-driven exploration | 34% | Kidd & Hayden (2015) |
| Feature discovery from exploration | 2.3x higher | ProductPlan (2019) |
| Novel stimulus attention capture | 180ms faster | Berlyne (1960) |

## Berlyne's Curiosity Framework

### Two Types of Epistemic Curiosity

1. **Diversive Curiosity** (breadth-seeking)
   - General desire for new stimulation
   - Variety-seeking behavior
   - **Web impact**: Clicks "related articles," explores sidebar content

2. **Specific Curiosity** (depth-seeking)
   - Focused inquiry to resolve uncertainty
   - Deep-dive behavior
   - **Web impact**: Reads documentation, explores feature details

### Information Gap Theory

Loewenstein (1994) extended Berlyne's work:
- Curiosity is triggered when there's a gap between what we know and what we want to know
- The gap must be perceived as closeable through effort
- **Web impact**: "Learn more" links, incomplete previews, progressive disclosure

## Behavioral Levels

| Value | Label | Behaviors |
|-------|-------|-----------|
| 0.0-0.2 | Goal-Focused | Ignores all non-essential content. Takes shortest path to objective. Never clicks "related" or "you might also like." Closes pop-ups immediately without reading. Uses search exclusively, never browses. Skips product details beyond purchase requirements. |
| 0.2-0.4 | Low Curiosity | Occasionally glances at related content but rarely clicks. Sticks mostly to task. May notice interesting elements but doesn't investigate. Quick scans of additional options. Minimal exploration of settings or features. |
| 0.4-0.6 | Moderate | Balances task completion with some exploration. Clicks interesting links if not time-pressed. Reads "about" pages for new sites. Explores one or two tangential items. May investigate new features when noticed. Checks out recommendations occasionally. |
| 0.6-0.8 | Curious | Actively explores beyond task requirements. Reads related articles and linked content. Investigates new features and options. Clicks on "learn more" links. Explores settings and customization. Time on site 30-40% above average. |
| 0.8-1.0 | Highly Exploratory | Deep exploration of all available content. Reads documentation and help pages. Investigates every feature, setting, and option. Follows rabbit holes of linked content. May forget original task while exploring. Discovers hidden features. Time on site 50%+ above average. |

## Estimated Trait Correlations

> *Correlation estimates are derived from related research findings and theoretical models. Empirical calibration is planned ([GitHub #95](https://github.com/alexandriashai/cbrowser/issues/95)).*

| Related Trait | Correlation | Mechanism |
|---------------|-------------|-----------|
| [Risk Tolerance](./Trait-RiskTolerance.md) | r = 0.44 | Curiosity accepts risk of unknown content |
| [Information Foraging](../traits/Trait-InformationForaging) | r = 0.51 | Curiosity drives broader foraging patterns |
| [Working Memory](./Trait-WorkingMemory.md) | r = 0.28 | Capacity limits exploration complexity |
| [Patience](./Trait-Patience.md) | r = 0.32 | Time allows for exploration |
| [Persistence](./Trait-Persistence.md) | r = 0.35 | Persistence enables deep curiosity dives |

## Impact on Web Behavior

### Navigation Patterns

```
Goal-Focused (0.0-0.2): Search → Result → Convert → Leave
Low Curiosity (0.2-0.4): Search → Result → Quick scan → Convert
Moderate (0.4-0.6): Search → Result → Some exploration → Convert
Curious (0.6-0.8): Search → Result → Multiple pages → Convert
Highly Exploratory (0.8-1.0): Browse → Explore → Rabbit holes → Maybe convert
```

### Content Engagement

| Curiosity Level | Pages per Session | Time on Site | Feature Discovery |
|-----------------|-------------------|--------------|-------------------|
| Very Low | 1.5 | 45 seconds | Minimal |
| Low | 2.3 | 1.5 minutes | Low |
| Moderate | 3.8 | 3 minutes | Medium |
| High | 5.5 | 5 minutes | High |
| Very High | 8+ | 8+ minutes | Very High |

### Feature Adoption

- **Low curiosity**: Uses only features explicitly shown, never explores settings
- **High curiosity**: Discovers advanced features, customizes experience, finds hidden options

## Click Behavior

### Diversive Curiosity (Breadth)

High curiosity users click:
- "Related articles" sections
- Sidebar recommendations
- Footer links
- Category pages
- "Random" or "discover" features

### Specific Curiosity (Depth)

High curiosity users click:
- "Learn more" links
- Feature documentation
- FAQ sections
- Detailed specifications
- Behind-the-scenes content

## Persona Values

| Persona | Curiosity Value | Rationale |
|---------|-----------------|-----------|
| [Rushed Professional](../personas/Persona-RushedProfessional) | 0.2 | No time for exploration |
| [Distracted Parent](../personas/Persona-DistractedParent) | 0.3 | Task-focused due to time pressure |
| [Anxious First-Timer](../personas/Persona-AnxiousFirstTimer) | 0.35 | Fear limits exploration |
| [Methodical Senior](../personas/Persona-MethodicalSenior) | 0.55 | Thorough but not exploratory |
| [Tech-Savvy Explorer](../personas/Persona-TechSavvyExplorer) | 0.9 | Exploration is intrinsically rewarding |
| [Impulsive Shopper](../personas/Persona-ImpulsiveShopper) | 0.65 | Curious about products, not features |

## UX Design Implications

### For Low-Curiosity Users

- Clear, direct paths to goals
- Minimize distractions from primary task
- Hide advanced features behind progressive disclosure
- Don't require exploration for core functionality
- Search must be excellent

### For High-Curiosity Users

- Rich "related content" sections
- Deep documentation and guides
- Discoverable advanced features
- Easter eggs and hidden content reward exploration
- Progressive disclosure reveals depth
- Cross-linking between related topics

## See Also

- [Trait Index](./Trait-Index.md) - All cognitive traits
- [Information Foraging](../traits/Trait-InformationForaging) - Related foraging trait
- [Risk Tolerance](./Trait-RiskTolerance.md) - Risk acceptance enables exploration
- [Working Memory](./Trait-WorkingMemory.md) - Capacity for exploration
- [Persona Index](../personas/Persona-Index.md) - Pre-configured personas

## Bibliography

Berlyne, D. E. (1960). *Conflict, Arousal, and Curiosity*. McGraw-Hill. https://doi.org/10.1037/11229-000

Chartbeat. (2017). The engaged reader: How content producers are engaging consumers. Chartbeat Content Insights.

Kashdan, T. B., & Silvia, P. J. (2009). Curiosity and interest: The benefits of thriving on novelty and challenge. In S. J. Lopez & C. R. Snyder (Eds.), *Oxford Handbook of Positive Psychology* (2nd ed., pp. 367-374). Oxford University Press.

Kidd, C., & Hayden, B. Y. (2015). The psychology and neuroscience of curiosity. *Neuron*, 88(3), 449-460. https://doi.org/10.1016/j.neuron.2015.09.010

Litman, J. A. (2005). Curiosity and the pleasures of learning: Wanting and liking new information. *Cognition & Emotion*, 19(6), 793-814. https://doi.org/10.1080/02699930541000101

Loewenstein, G. (1994). The psychology of curiosity: A review and reinterpretation. *Psychological Bulletin*, 116(1), 75-98. https://doi.org/10.1037/0033-2909.116.1.75

ProductPlan. (2019). Feature adoption and product exploration study. ProductPlan Research Report.
