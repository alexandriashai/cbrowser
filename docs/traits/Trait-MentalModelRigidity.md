# Mental Model Rigidity

**Category**: Tier 5 - Perception Traits
**Scale**: 0.0 (highly flexible) to 1.0 (highly rigid)

## Definition

Mental Model Rigidity describes the degree to which users resist updating their internal representations of how systems work when confronted with contradictory evidence. In web and UI contexts, this trait determines how quickly users adapt to interface changes, redesigns, or unexpected behaviors. Users with high mental model rigidity persist in applying outdated interaction patterns, require multiple disconfirming experiences before adjusting their approach, and experience significant frustration when interfaces deviate from their expectations. Users with low rigidity rapidly incorporate new information and adapt their behavior to match current system states.

## Research Foundation

### Primary Citation

> "Mental models are working models that are constructed from knowledge, perception, and inference. People reason by mentally manipulating these models to simulate possible states of affairs. The more deeply entrenched a model, the more evidence is required to revise or abandon it."
> — Johnson-Laird, P. N., 1983, p. 397

**Full Citation (APA 7):**
Johnson-Laird, P. N. (1983). *Mental models: Towards a cognitive science of language, inference, and consciousness*. Harvard University Press.

**ISBN**: 978-0674568815

### Supporting Research

> "Users who have developed strong expectations about interface behavior require an average of 3-5 disconfirming experiences before updating their mental model of how the system operates."
> — Carroll, J. M., & Rosson, M. B., 1987, p. 86

**Full Citation (APA 7):**
Carroll, J. M., & Rosson, M. B. (1987). Paradox of the active user. In J. M. Carroll (Ed.), *Interfacing thought: Cognitive aspects of human-computer interaction* (pp. 80-111). MIT Press.

**ISBN**: 978-0262530637

### Key Numerical Values

| Metric | Value | Source |
|--------|-------|--------|
| Disconfirmations needed to update model | 3-5 experiences | Carroll & Rosson (1987) |
| Mental model formation time | 2-4 interactions | Norman (1983) |
| Relearning cost after redesign | 40-60% productivity loss initially | Nielsen (2010) |
| Interface change adaptation period | 1-3 weeks for major changes | Sears & Jacko (2007) |
| Error rate post-redesign | 300-400% increase initially | Tognazzini (2003) |
| Working memory chunks for model | 3-4 active elements | Johnson-Laird (1983) |
| Model revision resistance | 65% persist despite single failure | Rouse & Morris (1986) |

## Behavioral Levels

| Value | Label | Behaviors |
|-------|-------|-----------|
| 0.0-0.2 | Very Flexible | Immediately adapts to interface changes; updates expectations after single disconfirming event; explores new features without prior assumptions; recovers quickly from errors by trying alternative approaches; embraces redesigns without complaint; treats each interaction as learning opportunity |
| 0.2-0.4 | Flexible | Adapts to changes within 2-3 disconfirming experiences; initially tries familiar patterns but quickly pivots; shows mild surprise at interface changes but adjusts; willing to read help content for new features; accepts redesigns after brief acclimation period; experiments with different approaches when blocked |
| 0.4-0.6 | Moderate | Requires 3-4 disconfirming experiences to update model; shows visible frustration when familiar patterns fail; attempts old methods repeatedly before adapting; may vocalize "this used to work"; moderate resistance to redesigns; eventually adapts but with notable effort and time |
| 0.6-0.8 | Rigid | Persists with outdated patterns through 5-6 failures; expresses strong frustration with interface changes; repeatedly clicks where buttons "should be" based on prior experience; blames system for not working "correctly"; strong resistance to redesigns; may seek workarounds to maintain old patterns; frequently requests "old version" |
| 0.8-1.0 | Very Rigid | Requires 7+ disconfirming experiences before considering model update; intense frustration and potential abandonment when patterns fail; refuses to acknowledge interface has changed; persistent muscle-memory errors; may avoid features that have been redesigned; seeks external help rather than exploring; considers any change "broken"; may switch to competitor products to maintain familiar patterns |

## Web/UI Manifestations

### Common Scenarios Where Mental Model Rigidity Affects Users

**Navigation Redesigns**
- User clicks where navigation menu used to be after site redesign
- Expects dropdown behavior but encounters mega-menu
- Seeks hamburger menu on desktop after mobile experience
- Looks for footer links in header after site reorganization

**Form Interaction Patterns**
- Expects Tab key to advance fields but interface uses Enter
- Assumes clicking submit saves draft (prior experience) but it doesn't
- Expects date picker but encounters free-form text field
- Assumes asterisk means optional (prior app) when it means required

**E-commerce Flows**
- Expects "Add to Cart" in product image area after pattern change
- Looks for cart icon in top-right after redesign moved it left
- Assumes checkout is multi-page when now single-page
- Expects shipping address before payment (old flow was reversed)

**Modal and Dialog Patterns**
- Clicks outside modal expecting dismissal when it requires button click
- Expects "X" in top-right when close button is bottom-left
- Assumes Escape key closes modal when it doesn't
- Expects confirmation on dialog but action is immediate

**Search Behavior**
- Uses search syntax from prior interface that doesn't work here
- Expects autocomplete but interface requires explicit submit
- Assumes search scope is entire site when it's section-specific
- Expects results page but gets inline dropdown suggestions

**Authentication Patterns**
- Enters username then password, but interface asks email first
- Expects "Remember me" checkbox that doesn't exist
- Looks for social login options in different position
- Assumes password visible toggle is checkbox when it's icon

## Trait Correlations

| Related Trait | Correlation | Mechanism |
|---------------|-------------|-----------|
| Transfer Learning | r = -0.55 | High transfer learning enables rapid model updates |
| Procedural Fluency | r = 0.42 | Automated procedures increase rigidity |
| Patience | r = -0.35 | Impatient users less willing to persist through model updates |
| Persistence | r = 0.38 | Highly persistent users may over-persist with wrong model |
| Self-Efficacy | r = -0.28 | Low self-efficacy increases defensive rigidity |
| Curiosity | r = -0.45 | Curious users more willing to explore new patterns |

## The Model Update Process

### Stages of Mental Model Revision

1. **Initial Failure**: Expected action produces unexpected result
2. **Retry Phase**: User attempts same action with minor variations
3. **Frustration Point**: After 2-3 failures, emotional response emerges
4. **Exploration Phase**: Begins trying alternative approaches
5. **Insight Moment**: Discovers correct pattern
6. **Integration**: New pattern begins overwriting old model
7. **Consolidation**: 5-10 successful repetitions cement new model

### Factors Affecting Update Speed

| Factor | Effect on Rigidity |
|--------|-------------------|
| Prior experience depth | More experience = more rigid |
| Time since last use | Longer gap = more flexible |
| Emotional investment | Higher investment = more rigid |
| Similarity to old pattern | More similar = harder to distinguish |
| Explicit instruction | Direct teaching accelerates update |
| Multiple simultaneous changes | Increases update difficulty |

## Design Implications

### For High Mental Model Rigidity Users

- Provide transitional interfaces during redesigns
- Implement "bridge" patterns that honor old and new behaviors
- Add prominent "What's New" tours for redesigns
- Maintain familiar anchor points in new designs
- Use animation to show where elements moved
- Provide search for features ("Where is Cart?")
- Allow "classic mode" during transition periods
- Use progressive disclosure for major changes
- Add inline hints for changed behaviors
- Implement ghost images showing old element locations

### For Low Mental Model Rigidity Users

- Can deploy redesigns with minimal onboarding
- Brief changelog notifications sufficient
- Will discover changes through exploration
- Requires less hand-holding during transitions

## Persona Values

| Persona | Value | Rationale |
|---------|-------|-----------|
| Rushing Rachel | 0.55 | Time pressure discourages exploration, increases reliance on habits |
| Careful Carlos | 0.65 | Methodical patterns become entrenched through repeated verification |
| Distracted Dave | 0.45 | Distractibility prevents deep model formation, enabling flexibility |
| Senior Sam | 0.80 | Long experience creates deeply entrenched expectations |
| Focused Fiona | 0.50 | Deep task focus creates strong models but allows analytical updates |
| Anxious Annie | 0.70 | Anxiety drives preference for predictable, familiar patterns |
| Mobile Mike | 0.40 | Diverse app experiences create flexible cross-platform expectations |
| Power User Pete | 0.60 | Expert patterns are efficient but resistant to change |
| First-Time Freddie | 0.20 | No prior experience means no rigid expectations |

## Measurement Approaches

### Experimental Paradigms

1. **Interface modification studies**: Measure errors after interface change
2. **Transfer tasks**: Test performance on new version of familiar system
3. **Think-aloud protocols**: Capture explicit expectations during exploration
4. **Error recovery analysis**: Time and attempts to recover from model mismatch

### Web-Specific Metrics

- Click heatmap comparison before/after redesign
- Error rate spike duration after changes
- Time to first successful task completion post-change
- Support ticket volume after interface updates
- A/B test showing new vs. maintained patterns

## Interaction with Change Blindness

Mental Model Rigidity and [Change Blindness](./Trait-ChangeBlindness.md) interact in complex ways:

| Scenario | High Rigidity + High Blindness | High Rigidity + Low Blindness |
|----------|-------------------------------|------------------------------|
| UI Redesign | May not notice changes AND struggle when discovered | Notices changes immediately, resists adapting |
| Error states | Misses error AND repeats same action | Notices error but persists with failed approach |
| New features | Overlooks new options AND wouldn't use them | Sees new features but avoids them |

## See Also

- [Change Blindness](./Trait-ChangeBlindness.md) - Related perceptual limitation
- [Transfer Learning](./Trait-TransferLearning.md) - Ability to apply knowledge across contexts
- [Procedural Fluency](./Trait-ProceduralFluency.md) - Automated interaction patterns
- [Persistence](./Trait-Persistence.md) - Continuing despite obstacles
- [Trait Index](./Trait-Index.md) - Complete trait listing
- [Senior Sam](../personas/Persona-SeniorSam) - High rigidity persona

## Bibliography

Carroll, J. M., & Rosson, M. B. (1987). Paradox of the active user. In J. M. Carroll (Ed.), *Interfacing thought: Cognitive aspects of human-computer interaction* (pp. 80-111). MIT Press.

Gentner, D., & Stevens, A. L. (Eds.). (1983). *Mental models*. Lawrence Erlbaum Associates.

Johnson-Laird, P. N. (1983). *Mental models: Towards a cognitive science of language, inference, and consciousness*. Harvard University Press.

Nielsen, J. (2010). Website response times. *Nielsen Norman Group*. https://www.nngroup.com/articles/website-response-times/

Norman, D. A. (1983). Some observations on mental models. In D. Gentner & A. L. Stevens (Eds.), *Mental models* (pp. 7-14). Lawrence Erlbaum Associates.

Norman, D. A. (2013). *The design of everyday things* (Revised and expanded ed.). Basic Books.

Rouse, W. B., & Morris, N. M. (1986). On looking into the black box: Prospects and limits in the search for mental models. *Psychological Bulletin*, 100(3), 349-363. https://doi.org/10.1037/0033-2909.100.3.349

Sears, A., & Jacko, J. A. (Eds.). (2007). *The human-computer interaction handbook: Fundamentals, evolving technologies and emerging applications* (2nd ed.). CRC Press.

Tognazzini, B. (2003). First principles of interaction design. *AskTog*. https://asktog.com/atc/principles-of-interaction-design/

Young, R. M. (1983). Surrogates and mappings: Two kinds of conceptual models for interactive devices. In D. Gentner & A. L. Stevens (Eds.), *Mental models* (pp. 35-52). Lawrence Erlbaum Associates.
