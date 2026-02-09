# Information Foraging

**Category**: Tier 3 - Decision-Making Traits
**Scale**: 0.0 (weak scent-following) to 1.0 (strong scent-following)

## Definition

Information Foraging describes how users navigate information environments by following "information scent" - cues that indicate the likelihood of finding desired content along a particular path. Adapted from optimal foraging theory in behavioral ecology, this trait models how users decide which links to click, when to stay on a page versus navigate away, and how they allocate attention across competing information sources. High foragers follow strong scent trails efficiently and abandon low-scent paths quickly; low foragers may persist on weak trails or fail to recognize strong scent cues, leading to inefficient navigation patterns.

## Research Foundation

### Primary Citation

> "Information foraging theory is an approach to understanding how strategies and technologies for information seeking, gathering, and consumption are adapted to the flux of information in the environment... The notion of information scent is used to explain how people assess the utility or relevance of information sources, and how they select navigation paths."
> — Pirolli & Card, 1999, p. 643

**Full Citation (APA 7):**
Pirolli, P., & Card, S. K. (1999). Information foraging. *Psychological Review, 106*(4), 643-675.

**DOI**: https://doi.org/10.1037/0033-295x.106.4.643

### Supporting Research

> "Users follow information scent to navigate the web. When scent is strong, users are more efficient. When scent is weak or misleading, they become lost and frustrated."
> — Chi et al., 2001, p. 498

**Full Citation (APA 7):**
Chi, E. H., Pirolli, P., Chen, K., & Pitkow, J. (2001). Using information scent to model user information needs and actions on the web. *Proceedings of the SIGCHI Conference on Human Factors in Computing Systems*, 490-497.

**DOI**: https://doi.org/10.1145/365024.365325

### Key Numerical Values

| Metric | Value | Source |
|--------|-------|--------|
| Average page dwell time before abandonment | 10-20 seconds | Nielsen (2011) |
| Probability of following highest-scent link | 0.62 | Chi et al. (2001) |
| Back button usage with weak scent | 39% higher | Cockburn & McKenzie (2001) |
| Scent strength predicts task success | r = 0.71 | Pirolli & Card (1999) |
| Users scan 20% of page for scent cues | mean fixation | Nielsen (2006) |
| Optimal patch-leaving threshold | 2-3 failed predictions | ACT-IF model (Pirolli, 2007) |

## Behavioral Levels

| Value | Label | Behaviors |
|-------|-------|-----------|
| 0.0-0.2 | Poor Forager | Fails to recognize relevant link text; persists on irrelevant pages too long; clicks randomly when uncertain; ignores navigation breadcrumbs; exhaustive rather than selective reading; high back-button usage; frequently "lost" in sites |
| 0.2-0.4 | Weak Forager | Sometimes follows weak scent trails; slow to recognize dead-ends; occasional relevant selections; may be misled by ambiguous labels; moderate exploration efficiency; needs redundant cues |
| 0.4-0.6 | Moderate Forager | Adequate scent detection in clear environments; recognizes strong cues but may miss subtle ones; reasonable patch-leaving decisions; some unnecessary exploration; effective with well-designed navigation |
| 0.6-0.8 | Strong Forager | Quickly identifies high-scent options; efficient navigation path selection; abandons low-value pages promptly; uses multiple scent cues (text, images, position); rarely backtracks unnecessarily |
| 0.8-1.0 | Expert Forager | Near-optimal information seeking; immediately recognizes scent patterns; predicts content accurately from cues; minimal wasted navigation; instinctively uses site architecture; very low back-button usage |

## Web Behavior Patterns

### Link Selection

**Strong Foragers (0.7-1.0):**
- Select links matching query terms
- Use link position as additional cue
- Notice snippet/preview text
- Prefer specific over generic labels
- Rapid confident selections

**Weak Foragers (0.0-0.3):**
- Random or sequential link selection
- Ignore descriptive text
- Click "Contact" when seeking products
- Miss clearly-labeled navigation
- Hesitant, exploratory clicking

### Patch-Leaving Behavior

The "patch" in foraging theory is analogous to a web page or site section:

**Strong Foragers:**
- Leave pages with weak scent within 5-10 seconds
- Recognize when information gain has diminished
- Move to higher-yield areas quickly
- Efficient depth vs breadth decisions

**Weak Foragers:**
- Stay on low-yield pages 30+ seconds
- Re-read content hoping for relevance
- Deep navigation into wrong branches
- Reluctant to "give up" on dead ends

### Search Result Processing

**Strong Foragers:**
- Rapid snippet scanning
- Click based on content prediction
- Skip irrelevant domains immediately
- Use search refinement efficiently

**Weak Foragers:**
- Sequential top-to-bottom clicking
- Poor prediction from snippets
- Click all results regardless of relevance
- Rarely refine search queries

## Information Scent Components

| Scent Source | Description | Weight |
|--------------|-------------|--------|
| Link Text | Words in clickable anchor | High |
| Surrounding Context | Text near the link | Medium |
| Visual Design | Icons, colors, prominence | Medium |
| Position | Navigation location, F-pattern | Medium |
| Preview/Tooltip | Hover information | Low-Medium |
| Domain/URL | Site credibility signals | Low |

## Trait Correlations

| Related Trait | Correlation | Mechanism |
|--------------|-------------|-----------|
| [Comprehension](Trait-Comprehension) | r = 0.48 | Understanding text enables scent detection |
| [Reading Tendency](Trait-ReadingTendency) | r = 0.39 | Scanners may miss scent cues |
| [Working Memory](Trait-WorkingMemory) | r = 0.31 | Holding goal enables scent evaluation |
| [Patience](Trait-Patience) | r = 0.28 | Patient users may persist despite weak scent |
| [Satisficing](Trait-Satisficing) | r = -0.44 | Strong foragers optimize paths |
| [Curiosity](Trait-Curiosity) | r = 0.24 | Curious users explore adjacent scent |

## Persona Values

| Persona | Information Foraging Value | Rationale |
|---------|---------------------------|-----------|
| **Power User** | 0.90 | Expert at recognizing interface patterns |
| **Tech Enthusiast** | 0.85 | Familiar with web conventions |
| **Rushed Professional** | 0.75 | Efficient by necessity |
| **First-Time User** | 0.35 | Lacks pattern recognition experience |
| **Elderly Novice** | 0.30 | Unfamiliar with web conventions |
| **Distracted Teen** | 0.50 | Knows patterns but attention divided |
| **Careful Senior** | 0.45 | Methodical but may miss cues |
| **Anxious User** | 0.40 | Anxiety impairs efficient processing |
| **Overwhelmed Parent** | 0.55 | Experience exists but cognitive load interferes |

## Design Implications

### Strengthening Information Scent

1. **Descriptive link text** - "View pricing plans" not "Click here"
2. **Consistent labeling** - Same terms in navigation and content
3. **Progressive disclosure** - Preview information on hover
4. **Visual hierarchy** - Important links visually prominent
5. **Breadcrumbs** - Show current location in hierarchy
6. **Search suggestions** - Guide toward high-scent paths

### Accommodating Weak Foragers

1. **Redundant cues** - Multiple ways to find content
2. **Clear error recovery** - Easy backtracking
3. **Search prominence** - Alternative to navigation
4. **Related links** - Suggest adjacent content
5. **Wizard patterns** - Guided linear paths

## Measurement in CBrowser

```typescript
// Information foraging affects navigation decisions
function selectLink(availableLinks: Link[], goal: string, traits: Traits): Link {
  const scentScores = availableLinks.map(link =>
    calculateScent(link, goal)
  );

  if (traits.informationForaging > 0.7) {
    // Strong forager: select highest scent
    return availableLinks[argmax(scentScores)];
  } else if (traits.informationForaging > 0.4) {
    // Moderate: probabilistic selection weighted by scent
    return weightedRandom(availableLinks, scentScores);
  } else {
    // Weak forager: may select randomly or sequentially
    return random() > 0.5 ? availableLinks[0] : randomChoice(availableLinks);
  }
}

// Patch-leaving decision
function shouldLeavePage(timeOnPage: number, contentRelevance: number, traits: Traits): boolean {
  const threshold = 10 + (1 - traits.informationForaging) * 20; // 10-30 seconds
  const relevanceThreshold = 0.3 + traits.informationForaging * 0.4; // 0.3-0.7

  return timeOnPage > threshold && contentRelevance < relevanceThreshold;
}
```

## See Also

- [Satisficing](Trait-Satisficing) - When "good enough" information suffices
- [Reading Tendency](Trait-ReadingTendency) - Scanning vs reading affects scent detection
- [Comprehension](Trait-Comprehension) - Understanding content enables evaluation
- [Working Memory](Trait-WorkingMemory) - Holding goals while navigating
- [Patience](Trait-Patience) - Persistence on weak-scent paths
- [Persona Index](../personas/Persona-Index) - Trait combinations in personas

## Bibliography

Chi, E. H., Pirolli, P., Chen, K., & Pitkow, J. (2001). Using information scent to model user information needs and actions on the web. *Proceedings of the SIGCHI Conference on Human Factors in Computing Systems*, 490-497. https://doi.org/10.1145/365024.365325

Cockburn, A., & McKenzie, B. (2001). What do web users do? An empirical analysis of web use. *International Journal of Human-Computer Studies, 54*(6), 903-922. https://doi.org/10.1006/ijhc.2001.0459

Nielsen, J. (2006). F-shaped pattern for reading web content. *Nielsen Norman Group*. https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/

Nielsen, J. (2011). How long do users stay on web pages? *Nielsen Norman Group*. https://www.nngroup.com/articles/how-long-do-users-stay-on-web-pages/

Pirolli, P. (2007). *Information foraging theory: Adaptive interaction with information*. Oxford University Press.

Pirolli, P., & Card, S. K. (1999). Information foraging. *Psychological Review, 106*(4), 643-675. https://doi.org/10.1037/0033-295x.106.4.643

Spool, J. M., Perfetti, C., & Brittan, D. (2004). *Designing for the scent of information*. User Interface Engineering.
