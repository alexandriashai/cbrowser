> **This documentation is no longer maintained here.**
>
> For the latest version, please visit: **[Working Memory](https://cbrowser.ai/docs/Trait-WorkingMemory)**

---

# Working Memory

**Category**: Tier 1 - Core Traits
**Scale**: 0.0 (very limited capacity) to 1.0 (very high capacity)

## Definition

Working memory represents a user's capacity to hold and manipulate information during task completion. This trait determines how many interface elements, form fields, navigation steps, and instructions a user can simultaneously track. Users with low working memory become overwhelmed by complex interfaces and forget earlier steps in multi-part processes, while those with high working memory can handle complex dashboards, long forms, and intricate navigation structures.

## Research Foundation

### Primary Citation

> "The span of immediate memory imposes severe limitations on the amount of information that we are able to receive, process, and remember. By organizing the stimulus input simultaneously into several dimensions and successively into a sequence of chunks, we manage to break (or at least stretch) this informational bottleneck."
> - Miller, 1956, p. 95

**Full Citation (APA 7):**
Miller, G. A. (1956). The magical number seven, plus or minus two: Some limits on our capacity for processing information. *Psychological Review*, 63(2), 81-97. https://doi.org/10.1037/h0043158

**DOI**: https://doi.org/10.1037/h0043158

### Supporting Research

> "Working memory capacity varies substantially across individuals and predicts performance on complex cognitive tasks, including reading comprehension, reasoning, and multitasking."
> - Cowan, 2001, p. 89

**Full Citation (APA 7):**
Cowan, N. (2001). The magical number 4 in short-term memory: A reconsideration of mental storage capacity. *Behavioral and Brain Sciences*, 24(1), 87-114. https://doi.org/10.1017/S0140525X01003922

### Key Numerical Values

| Metric | Value | Source |
|--------|-------|--------|
| Average chunk capacity | 7 plus or minus 2 (5-9 chunks) | Miller (1956) |
| Cowan's revised estimate | 4 chunks (without rehearsal) | Cowan (2001) |
| Duration without rehearsal | 15-30 seconds | Peterson & Peterson (1959) |
| Optimal menu item count | 7 plus or minus 2 | Miller (1956) |
| Form field cognitive load limit | 5-7 visible fields | UX research synthesis |
| Information decay rate | 18-20% per 3 seconds | Atkinson & Shiffrin (1968) |

## Miller's Chunking Theory

### The Chunking Mechanism

Miller discovered that while raw information capacity is limited, we can increase effective capacity through "chunking" - grouping related items into meaningful units.

| Raw Items | Without Chunking | With Chunking |
|-----------|------------------|---------------|
| Phone number: 1-8-0-0-5-5-5-1-2-3-4 | 11 items (overload) | 3 chunks: 1-800 / 555 / 1234 |
| Credit card: 4111111111111111 | 16 items (impossible) | 4 chunks: 4111 / 1111 / 1111 / 1111 |

### Interface Design Implications

- Group related form fields visually
- Limit navigation menus to 7 plus or minus 2 items
- Use progressive disclosure to manage complexity
- Provide breadcrumbs as external memory aids

## Behavioral Levels

| Value | Label | Behaviors |
|-------|-------|-----------|
| 0.0-0.2 | Very Limited | Overwhelmed by more than 3-4 elements. Cannot complete multi-step forms. Forgets early steps in processes. Needs external memory aids for everything. Cannot compare more than 2 options. Loses place constantly in long pages. Cannot follow multi-part instructions. |
| 0.2-0.4 | Limited | Handles 4-5 chunks maximum. Struggles with complex navigation. Needs visible step indicators. Forgets password requirements while typing. Can compare 2-3 options with difficulty. Benefits significantly from progress indicators. |
| 0.4-0.6 | Moderate | Standard 7 plus or minus 2 capacity. Handles typical web interfaces. Can complete standard multi-step processes. Compares 3-4 options effectively. Follows breadcrumb navigation. May need to re-read instructions for complex tasks. |
| 0.6-0.8 | High | Handles 8-10 chunks comfortably. Manages complex dashboards. Tracks multiple open tasks. Compares 5+ options mentally. Remembers earlier form inputs while completing later sections. Navigates complex hierarchies. |
| 0.8-1.0 | Very High | Handles 10+ chunks. Power-user of complex interfaces. Tracks multiple simultaneous processes. Mentally holds entire site structure. Rarely needs visual aids for memory. Can complete complex forms from memory. |

## Estimated Trait Correlations

> *Correlation estimates are derived from related research findings and theoretical models. Empirical calibration is planned ([GitHub #95](https://github.com/alexandriashai/cbrowser/issues/95)).*

| Related Trait | Correlation | Mechanism |
|---------------|-------------|-----------|
| [Comprehension](./Trait-Comprehension.md) | r = 0.52 | Memory capacity enables complex understanding |
| [Procedural Fluency](../traits/Trait-ProceduralFluency) | r = 0.45 | Procedure execution requires memory |
| [Metacognitive Planning](../traits/Trait-MetacognitivePlanning) | r = 0.48 | Planning requires holding multiple options |
| [Curiosity](./Trait-Curiosity.md) | r = 0.28 | Limited memory restricts exploration |
| [Interrupt Recovery](../traits/Trait-InterruptRecovery) | r = 0.41 | Memory enables task resumption |

## Impact on Web Behavior

### Form Completion

| WM Capacity | Max Fields Visible | Multi-Page Tolerance | Error Recall |
|-------------|-------------------|---------------------|--------------|
| Very Low | 3-4 | 2 pages max | Forgets immediately |
| Low | 4-5 | 3 pages | Forgets quickly |
| Moderate | 5-7 | 4-5 pages | Recalls with cues |
| High | 7-9 | 6-8 pages | Good recall |
| Very High | 9+ | 10+ pages | Excellent recall |

### Navigation Complexity

```
Very Low: Can handle 3 levels deep maximum, needs breadcrumbs
Low: 4 levels with visual aids
Moderate: 5-6 levels with occasional disorientation
High: 7+ levels, rarely gets lost
Very High: Unlimited depth, builds mental maps easily
```

### Multi-tab/Window Behavior

- **Low working memory**: Loses track of tabs, forgets why opened tab, closes wrong tabs
- **High working memory**: Manages 10+ tabs efficiently, remembers purpose of each

### Comparison Tasks

| WM Capacity | Products Compared | Needs Comparison Table |
|-------------|-------------------|------------------------|
| Very Low | 2 max | Yes, always |
| Low | 2-3 | Yes |
| Moderate | 3-4 | Helpful |
| High | 4-5 | Optional |
| Very High | 6+ | No |

## Cognitive Load Theory

Sweller's Cognitive Load Theory (1988) extends Miller's work:

### Three Types of Load

1. **Intrinsic Load**: Inherent complexity of the material
2. **Extraneous Load**: Unnecessary complexity from poor design
3. **Germane Load**: Productive effort toward learning

### Working Memory Implications

| WM Capacity | Total Load Tolerance | Extraneous Load Sensitivity |
|-------------|---------------------|----------------------------|
| Low | Very limited | Very sensitive |
| Moderate | Standard | Moderately sensitive |
| High | Expanded | Less sensitive |

## Persona Values

| Persona | Working Memory Value | Rationale |
|---------|----------------------|-----------|
| [Distracted Parent](../personas/Persona-DistractedParent) | 0.35 | Divided attention reduces available WM |
| [Anxious First-Timer](../personas/Persona-AnxiousFirstTimer) | 0.4 | Anxiety consumes WM capacity |
| [Methodical Senior](../personas/Persona-MethodicalSenior) | 0.45 | Age-related decline, compensated by strategy |
| [Rushed Professional](../personas/Persona-RushedProfessional) | 0.55 | Distraction reduces available capacity |
| [Tech-Savvy Explorer](../personas/Persona-TechSavvyExplorer) | 0.75 | Practice and familiarity increase effective capacity |
| [Power User](../personas/Persona-PowerUser) | 0.85 | High baseline plus extensive chunking |

## UX Design Implications

### For Low-Working-Memory Users

- Limit visible form fields to 3-4 at a time
- Use progressive disclosure aggressively
- Provide breadcrumbs and step indicators
- Group related information visually
- Avoid requiring users to remember info across pages
- Use inline validation (immediate feedback)
- Provide "save and continue" functionality
- Format numbers in chunks (555-1234, not 5551234)

### For High-Working-Memory Users

- Can show more information density
- Complex dashboards are navigable
- Less need for progressive disclosure
- Power-user features are accessible
- Can handle comparison tables with many columns

## See Also

- [Trait Index](./Trait-Index.md) - All cognitive traits
- [Comprehension](./Trait-Comprehension.md) - Uses working memory capacity
- [Procedural Fluency](../traits/Trait-ProceduralFluency) - Memory for procedures
- [Interrupt Recovery](../traits/Trait-InterruptRecovery) - Task state in memory
- [Persona Index](../personas/Persona-Index.md) - Pre-configured personas

## Bibliography

Atkinson, R. C., & Shiffrin, R. M. (1968). Human memory: A proposed system and its control processes. In K. W. Spence & J. T. Spence (Eds.), *The Psychology of Learning and Motivation* (Vol. 2, pp. 89-195). Academic Press.

Cowan, N. (2001). The magical number 4 in short-term memory: A reconsideration of mental storage capacity. *Behavioral and Brain Sciences*, 24(1), 87-114. https://doi.org/10.1017/S0140525X01003922

Miller, G. A. (1956). The magical number seven, plus or minus two: Some limits on our capacity for processing information. *Psychological Review*, 63(2), 81-97. https://doi.org/10.1037/h0043158

Peterson, L. R., & Peterson, M. J. (1959). Short-term retention of individual verbal items. *Journal of Experimental Psychology*, 58(3), 193-198. https://doi.org/10.1037/h0049234

Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. *Cognitive Science*, 12(2), 257-285. https://doi.org/10.1207/s15516709cog1202_4
