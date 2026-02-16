> **This documentation is no longer maintained here.**
>
> For the latest version, please visit: **[Self-Efficacy](https://cbrowser.ai/docs/Trait-SelfEfficacy)**

---

# Self-Efficacy

**Category**: Tier 2 - Emotional Traits
**Scale**: 0.0 (low) to 1.0 (high)

## Definition

Self-efficacy measures an individual's belief in their capability to execute behaviors necessary to produce specific outcomes. In web interaction contexts, self-efficacy determines whether users believe they can successfully complete tasks, how many solution paths they attempt before giving up, and whether they attribute failures to personal inadequacy or external factors. High self-efficacy users approach unfamiliar interfaces with confidence, persist through challenges, and view obstacles as surmountable. Low self-efficacy users doubt their abilities, abandon tasks prematurely, and may avoid attempting complex interactions altogether.

## Research Foundation

### Primary Citation
> "Efficacy expectations determine how much effort people will expend and how long they will persist in the face of obstacles and aversive experiences. The stronger the perceived self-efficacy, the more active the efforts. Those who persist in subjectively threatening activities will eventually eliminate their fear."
> -- Bandura, A., 1977, p. 194

**Full Citation (APA 7):**
Bandura, A. (1977). Self-efficacy: Toward a unifying theory of behavioral change. *Psychological Review*, 84(2), 191-215.

**DOI**: https://doi.org/10.1037/0033-295X.84.2.191

### Supporting Research

> "Computer self-efficacy was found to be a significant determinant of behavioral intention and perceived ease of use. Individuals with higher computer self-efficacy were more likely to use computers and perceived them as easier to use."
> -- Compeau, D.R., & Higgins, C.A., 1995, p. 192

**Full Citation (APA 7):**
Compeau, D. R., & Higgins, C. A. (1995). Computer self-efficacy: Development of a measure and initial test. *MIS Quarterly*, 19(2), 189-211.

**DOI**: https://doi.org/10.2307/249688

### Key Numerical Values

| Metric | Value | Source |
|--------|-------|--------|
| Persistence increase (high vs low) | 3x more attempts | Bandura (1977) |
| Task completion rate difference | 35-40% higher for high self-efficacy | Compeau & Higgins (1995) |
| Abandonment speed (low self-efficacy) | 40% faster on first error | Derived from behavioral research |
| Computer Self-Efficacy Scale reliability | alpha = 0.95 | Compeau & Higgins (1995) |
| Effort expenditure correlation | r = 0.62 with self-efficacy | Bandura (1977) |

## Behavioral Levels

| Value | Label | Behaviors |
|-------|-------|-----------|
| 0.0-0.2 | Very Low | Abandons 40% faster on first error; avoids complex tasks entirely; says "I can't do this" internally; attributes all failures to personal inadequacy; seeks help immediately or gives up; unwilling to try unfamiliar UI patterns; clicks only on familiar elements; avoids forms with many required fields |
| 0.2-0.4 | Low | Hesitates before attempting new interactions; gives up after 1-2 failed attempts; blames self for unclear error messages; seeks external validation before proceeding; avoids "advanced" or "expert" features; prefers guided wizards over open-ended interfaces; may complete simple tasks but abandons at first complexity |
| 0.4-0.6 | Moderate | Attempts new interactions with some hesitation; tries 2-3 solution paths before seeking help; balanced attribution between self and system; willing to explore but needs periodic success to continue; can complete moderately complex tasks; may pause to plan approach before difficult sections |
| 0.6-0.8 | High | Approaches unfamiliar interfaces with confidence; tries 4-6 solution paths before abandoning; attributes failures to system issues or temporary obstacles; actively seeks solutions rather than help; comfortable with trial-and-error exploration; interprets error messages as debugging information; assumes tasks are achievable |
| 0.8-1.0 | Very High | Tries 6+ solution paths; views all tasks as solvable; treats errors as informative feedback; may override warnings believing they know better; enjoys mastering complex interfaces; assumes ability to complete any task; may underestimate actual difficulty leading to overconfident behavior; rarely seeks help even when warranted |

## Trait Implementation in CBrowser

### Solution Path Attempts

CBrowser models self-efficacy through the number of alternative approaches attempted:

```typescript
// Number of solution paths tried before abandoning
const solutionAttempts = Math.floor(1 + (selfEfficacy * 7));
// Low self-efficacy: 1-3 attempts
// High self-efficacy: 6-8 attempts

// Willingness to try unfamiliar elements
const explorationConfidence = 0.3 + (selfEfficacy * 0.6);
// Low: 30% base willingness
// High: 90% willingness
```

### First-Error Response

```typescript
// Speed of abandonment after first error
const firstErrorPersistence = 1 - (0.4 * (1 - selfEfficacy));
// Low self-efficacy: 40% reduction in persistence (abandons faster)
// High self-efficacy: minimal impact

// Attribution style after error
const selfBlameRatio = 0.7 - (selfEfficacy * 0.5);
// Low: 70% self-attribution ("I messed up")
// High: 20% self-attribution ("The interface is unclear")
```

### Self-Efficacy State Tracking

```typescript
interface SelfEfficacyState {
  currentEfficacy: number;      // Dynamic efficacy level (0-1)
  recentSuccesses: number;      // Count in current session
  recentFailures: number;       // Count in current session
  domainConfidence: Map<string, number>;  // Task-specific confidence
}

// Efficacy updates based on outcomes
function updateEfficacy(state: SelfEfficacyState, success: boolean): void {
  if (success) {
    state.currentEfficacy = Math.min(1, state.currentEfficacy + 0.05);
    state.recentSuccesses++;
  } else {
    state.currentEfficacy = Math.max(0, state.currentEfficacy - 0.08);
    state.recentFailures++;
  }
}
```

## Estimated Trait Correlations

> *Correlation estimates are derived from related research findings and theoretical models. Empirical calibration is planned ([GitHub #95](https://github.com/alexandriashai/cbrowser/issues/95)).*

Research and theoretical models indicate the following correlations:

| Related Trait | Correlation | Research Basis |
|--------------|-------------|----------------|
| Resilience | r = 0.56 | Both serve as protective factors against failure impact |
| Persistence | r = 0.48 | Self-efficacy fuels sustained effort (Bandura, 1977) |
| Risk Tolerance | r = 0.42 | Confident users take more interface risks |
| Comprehension | r = 0.35 | Some correlation; competence builds confidence |
| Curiosity | r = 0.38 | Confident users explore more freely |
| Anxiety (inverse) | r = -0.52 | Self-efficacy buffers against performance anxiety |

### Interaction Effects

- **Self-Efficacy x Comprehension**: High efficacy + low comprehension creates overconfident users who attempt tasks beyond their ability
- **Self-Efficacy x Patience**: Low efficacy + high patience may lead to prolonged ineffective attempts without trying alternatives
- **Self-Efficacy x Resilience**: Combined high values create maximally persistent users

## Persona Values

| Persona | Self-Efficacy Value | Rationale |
|---------|---------------------|-----------|
| power-user | 0.85 | Experts have extensive mastery experiences building confidence |
| first-timer | 0.35 | No prior success to build confidence; uncertain of abilities |
| elderly-user | 0.40 | May doubt abilities with "modern" technology despite other competencies |
| impatient-user | 0.55 | Moderate; impatience not related to self-doubt |
| mobile-user | 0.60 | Familiar with touch interfaces; moderate confidence |
| screen-reader-user | 0.70 | Developed high competence navigating accessibility challenges |
| anxious-user | 0.25 | Anxiety undermines belief in ability to succeed |
| skeptical-user | 0.50 | Skepticism about sites, not about own abilities |

## UX Design Implications

### For Low Self-Efficacy Users (< 0.4)

1. **Early wins**: Design easy initial steps that build confidence
2. **Progress indicators**: Show how far they've come to reinforce capability
3. **External attribution**: Error messages should blame the system, not the user
4. **Guided paths**: Provide step-by-step wizards instead of open interfaces
5. **Social proof**: Show that others successfully completed the task
6. **Help accessibility**: Make help easily visible without stigma

### For High Self-Efficacy Users (> 0.7)

1. **Challenge engagement**: Provide complex options for those who seek them
2. **Autonomy**: Allow skipping tutorials and guided flows
3. **Power features**: Surface advanced capabilities
4. **Warning calibration**: Ensure warnings are credible; overconfident users may dismiss weak warnings
5. **Error details**: Provide technical information for self-diagnosis

### Sources of Self-Efficacy (Bandura, 1977)

Design interventions can leverage the four sources:

| Source | Description | UX Application |
|--------|-------------|----------------|
| **Mastery experiences** | Prior successes at similar tasks | Progressive complexity, early wins |
| **Vicarious experience** | Observing others succeed | Video demos, user testimonials |
| **Verbal persuasion** | Encouragement from others | Encouraging microcopy, supportive error messages |
| **Physiological states** | Reduced anxiety and stress | Calm visual design, clear layouts |

## See Also

- [Trait-Resilience](./Trait-Resilience.md) - Recovery from setbacks (strongly correlated)
- [Trait-Persistence](./Trait-Persistence.md) - Behavioral persistence (downstream effect)
- [Trait-Comprehension](./Trait-Comprehension.md) - Understanding ability (distinct from confidence)
- [Trait-RiskTolerance](./Trait-RiskTolerance.md) - Willingness to take interface risks
- [Trait-Index](./Trait-Index.md) - Complete trait listing

## Bibliography

Bandura, A. (1977). Self-efficacy: Toward a unifying theory of behavioral change. *Psychological Review*, 84(2), 191-215. https://doi.org/10.1037/0033-295X.84.2.191

Bandura, A. (1986). *Social foundations of thought and action: A social cognitive theory*. Prentice-Hall.

Bandura, A. (1997). *Self-efficacy: The exercise of control*. W.H. Freeman.

Compeau, D. R., & Higgins, C. A. (1995). Computer self-efficacy: Development of a measure and initial test. *MIS Quarterly*, 19(2), 189-211. https://doi.org/10.2307/249688

Gist, M. E., & Mitchell, T. R. (1992). Self-efficacy: A theoretical analysis of its determinants and malleability. *Academy of Management Review*, 17(2), 183-211. https://doi.org/10.5465/amr.1992.4279530

Marakas, G. M., Yi, M. Y., & Johnson, R. D. (1998). The multilevel and multifaceted character of computer self-efficacy: Toward clarification of the construct and an integrative framework for research. *Information Systems Research*, 9(2), 126-163. https://doi.org/10.1287/isre.9.2.126

Stajkovic, A. D., & Luthans, F. (1998). Self-efficacy and work-related performance: A meta-analysis. *Psychological Bulletin*, 124(2), 240-261. https://doi.org/10.1037/0033-2909.124.2.240

Venkatesh, V. (2000). Determinants of perceived ease of use: Integrating control, intrinsic motivation, and emotion into the technology acceptance model. *Information Systems Research*, 11(4), 342-365. https://doi.org/10.1287/isre.11.4.342.11872
