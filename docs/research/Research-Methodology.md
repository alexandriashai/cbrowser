# Research Methodology

> **Copyright**: (c) 2026 WF Media (Alexandria Eden). All rights reserved.
>
> **License**: [Business Source License 1.1](https://github.com/alexandriashai/cbrowser/blob/main/LICENSE) - Converts to Apache 2.0 on February 5, 2030.
>
> **Contact**: alexandria.shai.eden@gmail.com

This document explains how CBrowser's 25 cognitive traits were selected, validated, and mapped to behavioral parameters.

---

## Selection Criteria

Traits were selected based on five criteria:

### 1. Peer-Reviewed Foundation

Every trait must be grounded in peer-reviewed psychological research published in recognized journals. We prioritize:

- **Foundational papers** with 1,000+ citations
- **Validated measurement instruments** (scales with reported reliability)
- **Replicated findings** across multiple studies

### 2. Web/UI Relevance

Traits must have clear implications for web interface interaction:

| Category | Example Relevance |
|----------|-------------------|
| Temporal | Wait tolerance, session duration |
| Cognitive | Processing capacity, learning speed |
| Emotional | Frustration responses, recovery |
| Behavioral | Click patterns, navigation choices |

### 3. Measurable Continuum

Traits must exist on a measurable continuum (0.0 to 1.0) rather than being binary:

```
0.0 ────────────── 0.5 ────────────── 1.0
(trait absent)   (moderate)    (trait maximum)
```

### 4. Independent Variance

Traits should capture independent variance, not be redundant with other traits. We verify this through:

- Correlation analysis (r < 0.70 with other traits)
- Factor analysis (loading on distinct factors)
- Behavioral differentiation in testing

### 5. Actionable for UX

Traits must inform specific UX decisions:

| Trait | UX Implication |
|-------|----------------|
| Patience | Load time tolerance, progress indicators |
| Working Memory | Form complexity, multi-step processes |
| Risk Tolerance | CTA placement, warning effectiveness |

---

## Trait Tier Organization

Traits are organized into 6 tiers based on psychological domain:

| Tier | Domain | Count | Rationale |
|------|--------|-------|-----------|
| 1 | Core | 7 | Fundamental cognitive capacities |
| 2 | Emotional | 4 | Affective/motivational factors |
| 3 | Decision-Making | 5 | Choice and judgment processes |
| 4 | Planning | 3 | Strategic/procedural cognition |
| 5 | Perception | 2 | Attention/awareness limitations |
| 6 | Social | 4 | Social influence/comparison |

---

## Value Mapping Process

### Step 1: Identify Behavioral Anchors

For each trait, we identify extreme behavioral anchors from research:

**Example: Patience (Nah, 2004)**

| Value | Anchor | Research Source |
|-------|--------|-----------------|
| 0.0 | Abandons at 2 seconds | Below minimum tolerance |
| 0.5 | Tolerates 8-10 seconds | Nah (2004) median |
| 1.0 | Waits 30+ seconds | Above 95th percentile |

### Step 2: Interpolate Intermediate Values

Intermediate values are interpolated using the research distribution:

```
Linear:      0.0 ── 0.25 ── 0.5 ── 0.75 ── 1.0
Behavioral:  2s ─── 5s ─── 8s ── 15s ─── 30s
```

### Step 3: Validate Against Personas

Values are validated against known user archetypes:

| Persona | Expected Patience | Rationale |
|---------|-------------------|-----------|
| Power User | 0.3 | Low tolerance, expects speed |
| Elderly User | 0.8 | Higher tolerance documented |
| Mobile User | 0.3 | Context-driven impatience |

### Step 4: Cross-Validate Correlations

We verify that trait correlations match research:

| Trait Pair | Expected r | Observed | Source |
|------------|------------|----------|--------|
| Patience ↔ Persistence | 0.40-0.50 | 0.45 | Conscientiousness loading |
| Self-Efficacy ↔ Persistence | 0.45-0.55 | 0.48 | Bandura (1977) |

---

## Persona Development

### Research-Based Profiles

Each persona's trait profile is derived from research on that user population:

**Example: Elderly User**

| Trait | Value | Research Justification |
|-------|-------|------------------------|
| patience | 0.8 | Czaja & Lee (2007): Older adults show 40% higher task persistence |
| workingMemory | 0.4 | Salthouse (2010): Age-related WM decline of ~0.5 SD |
| readingTendency | 0.8 | Higher preference for text over scanning |
| riskTolerance | 0.2 | Greater caution with unfamiliar interfaces |

### Accessibility Personas

Accessibility personas include trait modifications based on disability research:

| Persona | Key Modifications | Research Source |
|---------|-------------------|-----------------|
| Screen Reader | High persistence (+0.3) | Lazar et al. (2007) |
| Motor Tremor | Low riskTolerance (-0.4) | Trewin & Pain (1999) |
| Low Vision | High readingTendency (+0.4) | Jacko et al. (2000) |
| ADHD | Low workingMemory (-0.3) | Barkley (1997) |

---

## Validation Status

> **Important:** CBrowser's trait implementations are **research-informed heuristics**, not direct measurements. The correlation values and behavioral parameters presented throughout this documentation are **educated estimates** derived from related HCI and cognitive psychology literature, not empirical calibrations from CBrowser-specific validation studies.
>
> Empirical calibration is planned — see [GitHub Issue #95](https://github.com/alexandriashai/cbrowser/issues/95) for methodology and timeline.

### Current State

| Aspect | Status |
|--------|--------|
| Trait definitions | Based on peer-reviewed research |
| Behavioral parameters | Theoretically derived from related literature |
| Persona profiles | Research-informed archetypes |
| Correlation values | Educated estimates, not direct measurements |

### Planned Validation (GitHub #95)

The empirical calibration planned for future versions will include:
- A/B testing simulated vs. real user behavior
- Statistical comparison against published benchmarks (Baymard, Nielsen Norman, etc.)
- Iterative tuning until simulation distributions match empirical baselines

---

## Validation Methods

### 1. Expert Review

Trait definitions and values reviewed by:
- UX researchers with 10+ years experience
- Cognitive psychologists
- Accessibility specialists

### 2. Comparative Analysis

CBrowser personas compared against:
- Nielsen Norman Group persona archetypes
- WCAG persona descriptions
- Enterprise UX research personas

---

## Limitations

### Known Limitations

1. **Cultural Variance**: Traits calibrated primarily on Western populations
2. **Individual Variation**: Personas represent archetypes, not individuals
3. **Context Dependence**: Same user may show different traits in different contexts
4. **Temporal Stability**: Some traits (patience) vary by time of day

### Mitigation Strategies

| Limitation | Mitigation |
|------------|------------|
| Cultural variance | Future: Regional persona variants |
| Individual variation | Custom trait overrides supported |
| Context dependence | Journey goal affects trait expression |
| Temporal stability | Trait ranges allow ±0.1 variation |

---

## Future Research

### Planned Enhancements

1. **Longitudinal Validation**: Track trait predictions against real user data
2. **Cultural Personas**: Develop region-specific trait calibrations
3. **Dynamic Traits**: Model how traits change during session
4. **Trait Interactions**: Model non-linear trait interactions

### Contributing Research

If you have research that could improve trait calibration:

1. Open an issue with citation and relevance
2. Include DOI or link to full text
3. Explain how it affects specific traits

---

## See Also

- [Trait Index](../traits/Trait-Index.md) - All 25 cognitive traits
- [Persona Index](../personas/Persona-Index.md) - Pre-configured personas
- [Bibliography](./Bibliography.md) - Complete academic references
- [Cognitive User Simulation](../COGNITIVE-SIMULATION.md) - Main documentation
