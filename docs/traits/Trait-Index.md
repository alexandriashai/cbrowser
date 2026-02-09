# Cognitive Traits Index

> **Copyright**: (c) 2026 WF Media (Alexandria Eden). All rights reserved.
>
> **License**: [Business Source License 1.1](https://github.com/alexandriashai/cbrowser/blob/main/LICENSE) - Converts to Apache 2.0 on February 5, 2030.
>
> **Contact**: alexandria.shai.eden@gmail.com

CBrowser's cognitive simulation system is built on 25 research-backed psychological traits organized into 6 tiers. Each trait represents a measurable dimension of human cognition that affects how users interact with web interfaces.

## Trait Tiers Overview

| Tier | Category | Traits | Description |
|------|----------|--------|-------------|
| 1 | [Core Traits](#tier-1-core-traits) | 7 | Fundamental cognitive capacities |
| 2 | [Emotional Traits](#tier-2-emotional-traits) | 4 | Affective and motivational factors |
| 3 | [Decision-Making Traits](#tier-3-decision-making-traits) | 5 | Choice and judgment processes |
| 4 | [Planning Traits](#tier-4-planning-traits) | 3 | Strategic and procedural cognition |
| 5 | [Perception Traits](#tier-5-perception-traits) | 2 | Attention and awareness limitations |
| 6 | [Social Traits](#tier-6-social-traits) | 4 | Social influence and comparison |

---

## Tier 1: Core Traits

Fundamental cognitive capacities that form the foundation of user behavior.

| Trait | Scale | Primary Research |
|-------|-------|------------------|
| [Patience](./Trait-Patience.md) | 0.0-1.0 | Nah (2004) - 8-10 second tolerance threshold |
| [Risk Tolerance](./Trait-RiskTolerance.md) | 0.0-1.0 | Kahneman & Tversky (1979) - Prospect Theory |
| [Comprehension](./Trait-Comprehension.md) | 0.0-1.0 | Card, Moran & Newell (1983) - GOMS Model |
| [Persistence](./Trait-Persistence.md) | 0.0-1.0 | Duckworth et al. (2007) - Grit Scale |
| [Curiosity](./Trait-Curiosity.md) | 0.0-1.0 | Berlyne (1960) - Epistemic Curiosity |
| [Working Memory](./Trait-WorkingMemory.md) | 0.0-1.0 | Miller (1956) - 7±2 Chunks |
| [Reading Tendency](./Trait-ReadingTendency.md) | 0.0-1.0 | Nielsen (2006) - F-Pattern |

---

## Tier 2: Emotional Traits

Affective factors that influence persistence, confidence, and recovery from setbacks.

| Trait | Scale | Primary Research |
|-------|-------|------------------|
| [Resilience](./Trait-Resilience.md) | 0.0-1.0 | Smith et al. (2008) - Brief Resilience Scale |
| [Self-Efficacy](./Trait-SelfEfficacy.md) | 0.0-1.0 | Bandura (1977) - Self-Efficacy Theory |
| [Trust Calibration](./Trait-TrustCalibration.md) | 0.0-1.0 | Fogg (2003) - Stanford Credibility |
| [Interrupt Recovery](./Trait-InterruptRecovery.md) | 0.0-1.0 | Mark et al. (2005) - Cost of Interruption |

---

## Tier 3: Decision-Making Traits

How users evaluate options, make choices, and allocate cognitive resources.

| Trait | Scale | Primary Research |
|-------|-------|------------------|
| [Satisficing](./Trait-Satisficing.md) | 0.0-1.0 | Simon (1956) - Bounded Rationality |
| [Information Foraging](./Trait-InformationForaging.md) | 0.0-1.0 | Pirolli & Card (1999) - Info Foraging |
| [Anchoring Bias](./Trait-AnchoringBias.md) | 0.0-1.0 | Tversky & Kahneman (1974) - Anchoring |
| [Time Horizon](./Trait-TimeHorizon.md) | 0.0-1.0 | Laibson (1997) - Hyperbolic Discounting |
| [Attribution Style](./Trait-AttributionStyle.md) | 0.0-1.0 | Weiner (1985) - Attribution Theory |

---

## Tier 4: Planning Traits

Strategic thinking, procedural knowledge, and learning transfer capabilities.

| Trait | Scale | Primary Research |
|-------|-------|------------------|
| [Metacognitive Planning](./Trait-MetacognitivePlanning.md) | 0.0-1.0 | Flavell (1979) - Metacognition |
| [Procedural Fluency](./Trait-ProceduralFluency.md) | 0.0-1.0 | Sweller (1988) - Cognitive Load |
| [Transfer Learning](./Trait-TransferLearning.md) | 0.0-1.0 | Thorndike (1901) - Transfer of Practice |

---

## Tier 5: Perception Traits

Limitations in visual attention and mental model updating.

| Trait | Scale | Primary Research |
|-------|-------|------------------|
| [Change Blindness](./Trait-ChangeBlindness.md) | 0.0-1.0 | Simons & Chabris (1999) - Gorilla Study |
| [Mental Model Rigidity](./Trait-MentalModelRigidity.md) | 0.0-1.0 | Johnson-Laird (1983) - Mental Models |

---

## Tier 6: Social Traits

How social context and comparison affect user behavior.

| Trait | Scale | Primary Research |
|-------|-------|------------------|
| [Authority Sensitivity](./Trait-AuthoritySensitivity.md) | 0.0-1.0 | Milgram (1963) - Obedience |
| [Emotional Contagion](./Trait-EmotionalContagion.md) | 0.0-1.0 | Hatfield et al. (1993) - Contagion |
| [FOMO](./Trait-FOMO.md) | 0.0-1.0 | Przybylski et al. (2013) - FoMO Scale |
| [Social Proof Sensitivity](./Trait-SocialProofSensitivity.md) | 0.0-1.0 | Goldstein, Cialdini et al. (2008) |

---

## Trait Correlations

Traits don't exist in isolation. Research-backed correlations:

| Trait Pair | Correlation | Research Basis |
|------------|-------------|----------------|
| Patience ↔ Persistence | r = 0.45 | Both load on conscientiousness |
| Working Memory ↔ Comprehension | r = 0.52 | Cognitive capacity overlap |
| Self-Efficacy ↔ Persistence | r = 0.48 | Bandura (1977) |
| FOMO ↔ Impatience | r = -0.41 | Przybylski et al. (2013) |
| Resilience ↔ Self-Efficacy | r = 0.56 | Protective factors research |

---

## Using Traits in CBrowser

### Via MCP Tool

```typescript
await cognitive_journey_init({
  persona: "custom",
  goal: "complete checkout",
  startUrl: "https://example.com",
  customTraits: {
    patience: 0.3,
    workingMemory: 0.5,
    riskTolerance: 0.2
  }
});
```

### Via CLI

```bash
npx cbrowser cognitive-journey \
  --persona custom \
  --trait patience=0.3 \
  --trait workingMemory=0.5 \
  --start https://example.com \
  --goal "complete checkout"
```

---

## See Also

- [Persona Index](../personas/Persona-Index.md) - Pre-configured trait combinations
- [Bibliography](../research/Bibliography.md) - Complete academic references
- [Research Methodology](../research/Research-Methodology.md) - How traits were selected
- [Cognitive User Simulation](../COGNITIVE-SIMULATION.md) - Main documentation

---

## Bibliography

See [Complete Bibliography](../research/Bibliography.md) for all academic sources.
