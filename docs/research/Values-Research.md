# Values Research

> **Copyright**: (c) 2026 WF Media (Alexandria Eden). All rights reserved.
>
> **License**: [Business Source License 1.1](https://github.com/alexandriashai/cbrowser/blob/main/LICENSE) - Converts to Apache 2.0 on February 5, 2030.
>
> **Note**: All research citations reference publicly available academic sources. Contact: alexandria.shai.eden@gmail.com

---

## Introduction

CBrowser's values system enhances cognitive personas with research-backed psychological depth by integrating three foundational frameworks from motivational psychology:

1. **Schwartz's Theory of Basic Human Values** - The core framework defining 10 universal human values
2. **Self-Determination Theory (SDT)** - Psychological needs for autonomy, competence, and relatedness
3. **Maslow's Hierarchy of Needs** - Motivational priority based on need fulfillment level

While **cognitive traits** describe HOW a persona behaves (patience, risk tolerance, working memory), **values** describe WHO the persona is at a motivational level (what drives their decisions, what they find meaningful, what influences persuade them).

Values and traits are **parallel dimensions** that correlate but do not determine each other. A high-security persona tends toward lower risk tolerance, but the relationship is probabilistic, not deterministic.

---

## Academic Foundations

The values system is built on peer-reviewed psychological research with established validity across cultures and contexts.

| Framework | Author(s) | Year | Publication | DOI |
|-----------|-----------|------|-------------|-----|
| **Theory of Basic Human Values** | Schwartz, S.H. | 1992 | *Advances in Experimental Social Psychology*, 25, 1-65 | [10.1016/S0065-2601(08)60281-6](https://doi.org/10.1016/S0065-2601(08)60281-6) |
| **Refined Theory of Basic Values** | Schwartz, S.H. | 2012 | *Online Readings in Psychology and Culture*, 2(1) | [10.9707/2307-0919.1116](https://doi.org/10.9707/2307-0919.1116) |
| **Self-Determination Theory** | Deci, E.L. & Ryan, R.M. | 1985 | *Intrinsic Motivation and Self-Determination in Human Behavior*. Plenum Press | ISBN: 978-0306420221 |
| **SDT and Well-Being** | Ryan, R.M. & Deci, E.L. | 2000 | *American Psychologist*, 55(1), 68-78 | [10.1037/0003-066X.55.1.68](https://doi.org/10.1037/0003-066X.55.1.68) |
| **Hierarchy of Needs** | Maslow, A.H. | 1943 | *Psychological Review*, 50(4), 370-396 | [10.1037/h0054346](https://doi.org/10.1037/h0054346) |

### Additional Supporting Research

| Topic | Citation | DOI |
|-------|----------|-----|
| Value hierarchies across cultures | Schwartz, S.H. & Bardi, A. (2001). *Journal of Cross-Cultural Psychology*, 32(3), 268-290 | [10.1177/0022022101032003002](https://doi.org/10.1177/0022022101032003002) |
| Values and personality | Roccas, S., Sagiv, L., Schwartz, S.H. & Knafo, A. (2002). *Personality and Social Psychology Bulletin*, 28(6), 789-801 | [10.1177/0146167202289008](https://doi.org/10.1177/0146167202289008) |
| Influence principles | Cialdini, R.B. (2001). *Influence: Science and Practice* (4th ed.). Allyn & Bacon | ISBN: 978-0321011473 |
| Judgment heuristics | Tversky, A. & Kahneman, D. (1974). *Science*, 185(4157), 1124-1131 | [10.1126/science.185.4157.1124](https://doi.org/10.1126/science.185.4157.1124) |

---

## Schwartz's 10 Universal Values

Schwartz's research identifies 10 values found across all cultures, representing fundamental motivational goals that guide human behavior. Each value is scored 0-1 in CBrowser.

| Value | Definition | Behavioral Indicators in UX |
|-------|------------|----------------------------|
| **Self-Direction** | Independent thought and action - choosing, creating, exploring | Explores options before deciding, resists defaults, customizes settings extensively, questions recommended paths |
| **Stimulation** | Excitement, novelty, and challenge in life | Clicks "What's New" immediately, tries beta features, explores unfamiliar sections, gets bored with routine |
| **Hedonism** | Pleasure and sensuous gratification | Responds strongly to visual appeal, prefers delightful micro-interactions, values aesthetic alongside function |
| **Achievement** | Personal success through demonstrating competence | Seeks efficiency metrics, wants ROI proof, focuses on outcomes, compares performance |
| **Power** | Social status, prestige, control over resources | Attracted to premium tiers, seeks exclusive access, values status signals, responds to authority positioning |
| **Security** | Safety, harmony, stability of society and self | Reads fine print, seeks guarantees, researches extensively, avoids perceived risks, needs trust signals |
| **Conformity** | Restraint of actions likely to upset or harm others | Reads reviews extensively, follows recommendations, seeks social validation, influenced by majority behavior |
| **Tradition** | Respect for customs and ideas from culture or religion | Prefers established brands, skeptical of new, values heritage, resistant to change |
| **Benevolence** | Preserving and enhancing welfare of close others | Responds to helping messaging, values community, influenced by impact on others, seeks to contribute |
| **Universalism** | Understanding, tolerance, protection of all people and nature | Checks for ethical practices, values sustainability, concerned with social impact, environmental awareness |

### Value Structure (Circumplex Model)

Schwartz's values form a circular structure where adjacent values are compatible and opposing values are in conflict:

```
                    OPENNESS TO CHANGE
                          |
         Self-Direction   |   Stimulation
                  \       |       /
                   \      |      /
    Universalism    \     |     /    Hedonism
           \         \    |    /        /
            \         \   |   /        /
             \         \  |  /        /
SELF-         =========   X   =========        SELF-
TRANSCENDENCE             |              ENHANCEMENT
             /         /  |  \        \
            /         /   |   \        \
           /         /    |    \        \
    Benevolence    /     |     \    Achievement
                  /      |      \
                 /       |       \
         Tradition       |       Power
                  \      |      /
                   Security
                          |
                    CONSERVATION
```

---

## Higher-Order Value Dimensions

The 10 basic values organize into 4 higher-order dimensions based on compatibility and conflict relationships (Schwartz, 2012). CBrowser calculates these automatically.

| Higher-Order Dimension | Formula | Description |
|------------------------|---------|-------------|
| **Openness to Change** | `(selfDirection + stimulation) / 2` | Emphasizes independent thought, action, and readiness for new experience. Opposite of Conservation. |
| **Self-Enhancement** | `(achievement + power) / 2` | Emphasizes pursuit of self-interest, success, and dominance. Opposite of Self-Transcendence. |
| **Conservation** | `(security + conformity + tradition) / 3` | Emphasizes self-restriction, order, and resistance to change. Opposite of Openness to Change. |
| **Self-Transcendence** | `(benevolence + universalism) / 2` | Emphasizes concern for welfare of others and nature. Opposite of Self-Enhancement. |

### Dimensional Conflicts

The higher-order dimensions reveal fundamental motivational conflicts:

- **Openness vs. Conservation**: Innovation-seeking vs. stability-seeking
- **Self-Enhancement vs. Self-Transcendence**: Self-interest vs. collective welfare

A persona high in openness will naturally be lower in conservation, and vice versa. These tensions are inherent to human motivation.

---

## Self-Determination Theory Integration

Self-Determination Theory (Deci & Ryan, 1985, 2000) identifies three basic psychological needs that, when satisfied, lead to intrinsic motivation and well-being.

| SDT Need | Definition | UX Implications |
|----------|------------|-----------------|
| **Autonomy Need** | Need for choice and control over one's actions | Responds positively to customization options, flexible workflows, and opt-in experiences. Negatively to forced paths and prescriptive guidance. |
| **Competence Need** | Need to feel capable and effective | Responds positively to progressive disclosure, clear feedback, achievable challenges. Negatively to overwhelming complexity or trivially easy tasks. |
| **Relatedness Need** | Need for connection with others | Responds positively to community features, social presence, collaborative elements. Negatively to isolation and purely transactional experiences. |

### Relationship to Schwartz Values

SDT needs correlate with specific Schwartz values:

| SDT Need | Primary Value Correlation |
|----------|---------------------------|
| Autonomy | Self-Direction |
| Competence | Achievement |
| Relatedness | Benevolence, Universalism |

---

## Maslow's Hierarchy Levels

Maslow's Hierarchy of Needs (1943) describes motivational priority based on which needs are currently unmet. CBrowser uses this to understand the dominant motivational context.

| Level | Name | Description | UX Relevance |
|-------|------|-------------|--------------|
| 1 | **Physiological** | Basic survival needs (food, water, shelter) | Rarely relevant to digital UX; represents extreme stress/crisis contexts |
| 2 | **Safety** | Security, stability, freedom from fear | Trust signals, guarantees, security badges, privacy assurances are critical |
| 3 | **Belonging** | Love, friendship, intimacy, community | Social features, community elements, connection opportunities valued |
| 4 | **Esteem** | Achievement, status, recognition, confidence | Success metrics, badges, recognition, exclusive access motivating |
| 5 | **Self-Actualization** | Reaching full potential, creativity, purpose | Learning opportunities, creative tools, personal growth features appeal |

### Maslow Level Assignments

Different personas operate at different Maslow levels based on their circumstances:

| Persona Category | Typical Maslow Level | Rationale |
|------------------|---------------------|-----------|
| First-time users | Safety | Need reassurance and trust building |
| Anxious users | Safety | Elevated threat sensitivity |
| Power users | Esteem | Seeking mastery and recognition |
| Explorers | Self-Actualization | Driven by curiosity and growth |
| Task-focused users | Esteem | Achievement and competence focus |

---

## Category-Aware Value Assignments

CBrowser assigns values based on persona category, recognizing that different types of conditions affect motivation differently.

### Cognitive Conditions

Conditions affecting cognition (like ADHD) have research-backed effects on motivational values.

**ADHD Example:**
- **High stimulation (0.9)**: Dopamine dysregulation drives novelty-seeking
- **Low security (0.25)**: Routine feels aversive
- **Low conformity (0.25)**: Difficulty following prescribed processes
- **High self-direction (0.65)**: Resist constraints, prefer flexibility

**Research basis:**
- Barkley, R.A. (2015). *ADHD Handbook for Diagnosis and Treatment*
- Volkow, N.D., et al. (2011). Motivation deficit in ADHD associated with dopamine reward pathway dysfunction. *Molecular Psychiatry*, 16. DOI: 10.1038/mp.2010.97

### Physical Conditions

Motor and vision impairments affect security and autonomy needs but not core personality values.

**Motor Tremor Example:**
- **Higher security (0.75)**: Needs stable, forgiving interfaces
- **Higher autonomy need (0.75)**: Need control over interaction pace
- **Lower stimulation (0.3)**: Prefers predictable interfaces

**Research basis:**
- Trewin, S. (2000). Configuration agents, control and privacy. *ACM ASSETS*. DOI: 10.1145/354324.354328
- Wobbrock, J.O., et al. (2011). Ability-Based Design. *CACM* 54(6). DOI: 10.1145/1924421.1924442

### Sensory-Only Conditions

Conditions affecting only perception (like color blindness) receive neutral values because they do not change motivational psychology.

**Color Blindness Example:**
- All Schwartz values: **0.5** (neutral)
- All SDT needs: **0.5** (neutral)
- Maslow level: **Esteem** (typical)

**Rationale:** Color vision deficiency affects perception, not personality. The person's motivations, goals, and values are independent of their color perception.

### Emotional Conditions

Trait anxiety and confidence affect values through the behavioral inhibition/activation systems.

**Anxious User Example:**
- **Very high security (0.95)**: Core anxiety response
- **Very low stimulation (0.2)**: Novelty triggers threat
- **High conformity (0.8)**: Safety in following norms
- **Low self-direction (0.3)**: Prefers guidance over independence

**Research basis:**
- Carver, C.S. & White, T.L. (1994). Behavioral inhibition, behavioral activation. *JPSP* 67(2). DOI: 10.1037/0022-3514.67.2.319
- Gray, J.A. & McNaughton, N. (2000). *The Neuropsychology of Anxiety*. Oxford University Press.

---

## Value-to-Trait Correlations

Values and traits correlate (r = 0.35-0.55) based on Schwartz & Bardi (2001) and Roccas et al. (2002). Values predict tendencies, not absolutes.

| Value | Trait | Direction | Strength | Research Basis |
|-------|-------|-----------|----------|----------------|
| Security | Risk Tolerance | Inverse | Strong | r = -0.52 (Schwartz & Bardi, 2001) |
| Security | Trust Calibration | Inverse | Moderate | r = -0.38 |
| Stimulation | Curiosity | Direct | Strong | r = 0.55 (Roccas et al., 2002) |
| Achievement | Patience | Inverse | Moderate | r = -0.40 |
| Conformity | Social Proof Sensitivity | Direct | Strong | r = 0.48 |
| Self-Direction | Authority Sensitivity | Inverse | Moderate | r = -0.42 |
| Tradition | Mental Model Rigidity | Direct | Moderate | r = 0.38 |

---

## Trait-to-Value Derivation (v16.14.0)

For **general-category** personas (no specific disability), values are derived FROM cognitive traits rather than defaulting to neutral (0.5). This produces more differentiated personas that reflect their behavioral profile.

### How It Works

The `deriveValuesFromTraits()` function applies weighted correlations:

```
derivedValue = baseline(0.5) + Σ(traitDeviation × weight × direction)
```

Where:
- **traitDeviation** = trait value - 0.5 (positive if above neutral, negative if below)
- **weight** = correlation strength (0.3-0.7)
- **direction** = +1 for positive correlation, -1 for inverse

### TRAIT_VALUE_CORRELATIONS

| Trait | Affects | Direction | Weight | Research Basis |
|-------|---------|-----------|--------|----------------|
| curiosity | stimulation, selfDirection | + | 0.6, 0.5 | Kashdan (2018) |
| riskTolerance | security, stimulation | -, + | 0.7, 0.4 | Schwartz (2012) |
| patience | stimulation, tradition | -, + | 0.4, 0.3 | Baumeister (1998) |
| persistence | achievement, competenceNeed | + | 0.6, 0.4 | Duckworth (2016) |
| socialProofSensitivity | conformity, selfDirection | +, - | 0.7, 0.4 | Cialdini (2001) |
| trustCalibration | security, benevolence | -, + | 0.5, 0.3 | Rotter (1971) |
| authoritySensitivity | conformity, tradition, selfDirection | +, +, - | 0.5, 0.4, 0.3 | Schwartz (2012) |
| fearOfMissingOut | stimulation, security | +, - | 0.6, 0.4 | Przybylski (2013) |
| selfEfficacy | achievement, autonomyNeed, competenceNeed | + | 0.5, 0.6, 0.5 | Bandura (1997) |
| resilience | competenceNeed, security | +, - | 0.5, 0.3 | Masten (2001) |
| comprehension | selfDirection, competenceNeed | + | 0.4, 0.3 | Cognitive load research |
| satisficing | achievement, stimulation | - | 0.4, 0.3 | Simon (1956) |

### Example: High-Curiosity, Low-Patience Persona

**Input Traits:**
- curiosity: 0.9 (deviation: +0.4)
- patience: 0.2 (deviation: -0.3)
- riskTolerance: 0.8 (deviation: +0.3)

**Derived Values:**
- stimulation: 0.98 (curiosity +0.24, patience +0.12, risk +0.12)
- selfDirection: 0.78 (curiosity +0.2, risk +0.08)
- security: 0.29 (riskTolerance -0.21)
- tradition: 0.41 (patience -0.09)

The `valueDerivations` field in persona output shows exactly which traits influenced which values.

---

## API Usage

### Accessing Persona Values

```typescript
import {
  getPersonaValues,
  hasPersonaValues,
  type PersonaValues
} from 'cbrowser/values';

// Check if persona has values defined
if (hasPersonaValues('adhd')) {
  const values = getPersonaValues('adhd');
  console.log(values?.stimulation); // 0.9
  console.log(values?.security);    // 0.25
  console.log(values?.maslowLevel); // 'esteem'
}
```

### Creating Custom Value Profiles

```typescript
import {
  createPersonaValues,
  type SchwartzValues,
  type SDTNeeds,
  type MaslowLevel
} from 'cbrowser/values';

const schwartzValues: SchwartzValues = {
  selfDirection: 0.8,
  stimulation: 0.7,
  hedonism: 0.5,
  achievement: 0.6,
  power: 0.4,
  security: 0.3,
  conformity: 0.3,
  tradition: 0.2,
  benevolence: 0.6,
  universalism: 0.7,
};

const sdtNeeds: SDTNeeds = {
  autonomyNeed: 0.8,
  competenceNeed: 0.6,
  relatednessNeed: 0.5,
};

const maslowLevel: MaslowLevel = 'self-actualization';

const customValues = createPersonaValues(
  schwartzValues,
  sdtNeeds,
  maslowLevel
);

// Higher-order values are calculated automatically
console.log(customValues.openness);          // 0.75 = (0.8 + 0.7) / 2
console.log(customValues.selfEnhancement);   // 0.5  = (0.6 + 0.4) / 2
console.log(customValues.conservation);      // 0.27 = (0.3 + 0.3 + 0.2) / 3
console.log(customValues.selfTranscendence); // 0.65 = (0.6 + 0.7) / 2
```

### Using Influence Pattern Analysis

```typescript
import {
  rankInfluencePatternsForProfile,
  calculatePatternSusceptibility,
  INFLUENCE_PATTERNS,
  type SchwartzValues
} from 'cbrowser/values';

const anxiousUserValues: Partial<SchwartzValues> = {
  security: 0.95,
  conformity: 0.8,
  stimulation: 0.2,
  selfDirection: 0.3,
};

// Rank all influence patterns by effectiveness
const ranked = rankInfluencePatternsForProfile(anxiousUserValues);

console.log('Most effective patterns for anxious user:');
ranked.slice(0, 3).forEach(({ pattern, susceptibility }) => {
  console.log(`  ${pattern.name}: ${(susceptibility * 100).toFixed(0)}%`);
});
// Output:
//   social_proof: 88%
//   authority: 82%
//   default_bias: 82%

// Calculate susceptibility for specific pattern
const scarcityPattern = INFLUENCE_PATTERNS.find(p => p.name === 'scarcity');
const scarcitySusceptibility = calculatePatternSusceptibility(
  anxiousUserValues,
  scarcityPattern!
);
console.log(`Scarcity susceptibility: ${(scarcitySusceptibility * 100).toFixed(0)}%`);
// Output: Scarcity susceptibility: 33% (low - anxious users resist urgency pressure)
```

### Accessing Value Behaviors

```typescript
import { VALUE_BEHAVIORS } from 'cbrowser/values';

const securityBehaviors = VALUE_BEHAVIORS.security;

console.log('High security users:');
securityBehaviors.highBehaviors.forEach(b => console.log(`  - ${b}`));
// - Reads all fine print
// - Seeks guarantees
// - Researches extensively
// - Avoids perceived risks
// - Needs trust signals

console.log('Respond positively to:');
securityBehaviors.positiveResponses.forEach(r => console.log(`  - ${r}`));
// - Money-back guarantees
// - Security badges
// - Trust seals
// - Detailed policies
// - Longevity claims
// - Insurance options
```

---

## See Also

- [Bibliography](./Bibliography.md) - Complete citation list for all CBrowser research
- [Research Methodology](./Research-Methodology.md) - How traits and values are selected
- [Trait Index](../traits/Trait-Index.md) - All 25 cognitive traits
- [Persona Index](../personas/Persona-Index.md) - Pre-configured persona profiles
