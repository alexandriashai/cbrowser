# Comprehension

**Category**: Tier 1 - Core Traits
**Scale**: 0.0 (very low comprehension) to 1.0 (very high comprehension)

## Definition

Comprehension represents a user's ability to understand interface elements, follow instructions, and build accurate mental models of how a system works. This trait encompasses both literacy-based text comprehension and procedural comprehension of interface mechanics. Users with low comprehension struggle with technical terminology, complex navigation, and multi-step processes, while high comprehension users quickly grasp system logic and can adapt to unfamiliar interfaces.

## Research Foundation

### Primary Citation

> "The GOMS model provides a framework for predicting the time it takes users to accomplish tasks and the errors they will make... User performance depends critically on the methods they have learned for accomplishing goals."
> - Card, Moran, & Newell, 1983, p. 139

**Full Citation (APA 7):**
Card, S. K., Moran, T. P., & Newell, A. (1983). *The Psychology of Human-Computer Interaction*. Lawrence Erlbaum Associates.

**ISBN**: 978-0898592436

### Supporting Research

> "Cognitive load theory suggests that instructional design should minimize extraneous cognitive load while promoting germane cognitive load... When intrinsic load is high, even small amounts of extraneous load can overwhelm working memory."
> - Sweller, 1988, p. 266

**Full Citation (APA 7):**
Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. *Cognitive Science*, 12(2), 257-285. https://doi.org/10.1207/s15516709cog1202_4

### Key Numerical Values

| Metric | Value | Source |
|--------|-------|--------|
| Average adult reading level (US) | 7th-8th grade | National Assessment of Adult Literacy (2003) |
| Recommended web content level | 6th grade | Nielsen Norman Group (2015) |
| Comprehension drop per grade level above target | 10-15% | Klare (1963) |
| Users understanding privacy policies | 9% | McDonald & Cranor (2008) |
| Error rate increase with jargon | 32% | Lazar et al. (2006) |
| GOMS prediction accuracy | r = 0.9 with actual times | Card, Moran, & Newell (1983) |

## Behavioral Levels

| Value | Label | Behaviors |
|-------|-------|-----------|
| 0.0-0.2 | Very Low | Cannot parse technical terminology. Gets lost in multi-step processes. Clicks randomly when confused. Cannot distinguish between similar-looking buttons. Requires step-by-step hand-holding. May not understand error messages at all. Frequently backs out of processes due to confusion. |
| 0.2-0.4 | Low | Struggles with industry jargon (e.g., "authenticate," "configure," "deploy"). Needs visual cues alongside text. May misinterpret instructions. Follows only very simple navigation. Often unsure which button to click. Reads but doesn't fully understand help documentation. |
| 0.4-0.6 | Moderate | Understands standard web conventions (shopping cart icon, hamburger menu). Follows clear instructions reliably. May struggle with advanced features. Understands common error messages. Can complete multi-step forms with clear progress indicators. Baseline GOMS model performance. |
| 0.6-0.8 | High | Quickly grasps new interface patterns. Understands technical documentation. Anticipates next steps in processes. Transfers knowledge from similar systems. Can troubleshoot common issues independently. Comfortable with complex forms and workflows. |
| 0.8-1.0 | Very High | Immediately understands novel interface paradigms. Reads and applies API documentation. Predicts system behavior accurately. Can use keyboard shortcuts and advanced features. Self-teaches from minimal instruction. Builds accurate mental models rapidly. |

## The GOMS Model

### Components

Card, Moran, and Newell's GOMS model breaks user behavior into:

1. **Goals**: What the user wants to accomplish (e.g., "buy a book")
2. **Operators**: Basic actions (click, type, scroll, read)
3. **Methods**: Sequences of operators to achieve goals
4. **Selection Rules**: How users choose between methods

### Comprehension's Role in GOMS

| Comprehension Level | GOMS Impact |
|---------------------|-------------|
| Low | Limited method repertoire, slower operator execution, poor selection rules |
| Moderate | Standard methods, typical operator times, basic selection |
| High | Rich method library, efficient operators, optimal selection |

## Trait Correlations

| Related Trait | Correlation | Mechanism |
|---------------|-------------|-----------|
| [Working Memory](./Trait-WorkingMemory.md) | r = 0.52 | Memory capacity enables complex comprehension |
| [Procedural Fluency](../traits/Trait-ProceduralFluency) | r = 0.61 | Comprehension enables procedure learning |
| [Transfer Learning](../traits/Trait-TransferLearning) | r = 0.48 | Understanding enables cross-domain transfer |
| [Reading Tendency](./Trait-ReadingTendency.md) | r = 0.35 | Reading enables text-based comprehension |
| [Self-Efficacy](../traits/Trait-SelfEfficacy) | r = 0.42 | Understanding builds confidence |

## Readability and Comprehension

### Flesch-Kincaid Guidelines

| Reading Level | Grade Level | Comprehension Score Range |
|---------------|-------------|---------------------------|
| Very Easy | 5th grade | 0.0-0.3 |
| Easy | 6th grade | 0.3-0.5 |
| Standard | 8th grade | 0.5-0.7 |
| Difficult | 10th-12th grade | 0.7-0.9 |
| Very Difficult | College+ | 0.9-1.0 |

### Web Content Implications

- **Low comprehension users**: Need 5th-6th grade reading level, visual cues, minimal jargon
- **High comprehension users**: Can handle technical documentation, complex interfaces

## Impact on Web Behavior

### Error Recovery

```
Very Low: Cannot understand error messages, gives up
Low: Understands simple errors ("wrong password"), confused by technical errors
Moderate: Follows basic troubleshooting steps
High: Interprets error codes, tries multiple solutions
Very High: Debugs issues independently, consults documentation
```

### Navigation

- **Low comprehension**: Relies on familiar patterns, lost with novel navigation
- **High comprehension**: Quickly learns new navigation paradigms, uses advanced features

### Form Completion

- **Low comprehension**: Confused by field labels, validation messages unclear
- **High comprehension**: Understands field requirements, anticipates validation rules

## Persona Values

| Persona | Comprehension Value | Rationale |
|---------|---------------------|-----------|
| [Anxious First-Timer](../personas/Persona-AnxiousFirstTimer) | 0.4 | Anxiety impairs comprehension |
| [Methodical Senior](../personas/Persona-MethodicalSenior) | 0.5 | Slower but thorough processing |
| [Distracted Parent](../personas/Persona-DistractedParent) | 0.5 | Divided attention limits comprehension |
| [Rushed Professional](../personas/Persona-RushedProfessional) | 0.7 | Experienced but hurried |
| [Tech-Savvy Explorer](../personas/Persona-TechSavvyExplorer) | 0.85 | High baseline + practice |
| [Accessibility User](../personas/Persona-AccessibilityUser) | 0.6 | Variable, depends on accommodations |

## UX Design Implications

### For Low-Comprehension Users

- Use plain language (6th grade reading level)
- Provide visual cues alongside text labels
- Show examples rather than just instructions
- Break complex processes into small steps
- Use progressive disclosure for advanced features
- Avoid jargon and technical terminology
- Include contextual help tooltips

### For High-Comprehension Users

- Can provide power-user features
- Documentation can be more technical
- Fewer hand-holding elements needed
- Can use industry-standard terminology
- Advanced features can be more accessible

## See Also

- [Trait Index](./Trait-Index.md) - All cognitive traits
- [Working Memory](./Trait-WorkingMemory.md) - Capacity for understanding
- [Procedural Fluency](../traits/Trait-ProceduralFluency) - Learned comprehension
- [Reading Tendency](./Trait-ReadingTendency.md) - Text processing behavior
- [Persona Index](../personas/Persona-Index.md) - Pre-configured personas

## Bibliography

Card, S. K., Moran, T. P., & Newell, A. (1983). *The Psychology of Human-Computer Interaction*. Lawrence Erlbaum Associates. ISBN 978-0898592436

Klare, G. R. (1963). *The Measurement of Readability*. Iowa State University Press.

Kutner, M., Greenberg, E., Jin, Y., Boyle, B., Hsu, Y., & Dunleavy, E. (2007). *Literacy in Everyday Life: Results from the 2003 National Assessment of Adult Literacy*. U.S. Department of Education.

Lazar, J., Feng, J. H., & Hochheiser, H. (2006). *Research Methods in Human-Computer Interaction*. John Wiley & Sons.

McDonald, A. M., & Cranor, L. F. (2008). The cost of reading privacy policies. *I/S: A Journal of Law and Policy for the Information Society*, 4(3), 543-568.

Nielsen Norman Group. (2015). How users read on the web. https://www.nngroup.com/articles/how-users-read-on-the-web/

Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. *Cognitive Science*, 12(2), 257-285. https://doi.org/10.1207/s15516709cog1202_4
