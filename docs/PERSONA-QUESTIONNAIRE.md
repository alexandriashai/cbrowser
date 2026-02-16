> **This documentation is no longer maintained here.**
>
> For the latest version, please visit: **[Persona Questionnaire System](https://cbrowser.ai/docs/PERSONA-QUESTIONNAIRE)**

---

# Persona Questionnaire System

**Introduced in v16.6.0**

The Persona Questionnaire system provides research-backed trait mapping for creating custom cognitive personas. Instead of defaulting traits to 0.5 (neutral baseline), this system uses behavioral questions to derive differentiated trait profiles.

## The Problem

When creating custom personas, AI-generated profiles often defaulted many traits to 0.5. This creates "average" personas that don't accurately represent real user diversity.

## The Solution

The questionnaire system:
1. Maps behavioral answers to trait values (0-1 scale)
2. Uses 5 distinct behavioral levels per trait (0, 0.25, 0.5, 0.75, 1.0)
3. Applies research-backed correlations between traits
4. Provides behavioral descriptions based on academic research

## Quick Start

### CLI Usage

```bash
# Interactive 8-question questionnaire
npx cbrowser persona-questionnaire start

# Comprehensive 25-trait questionnaire
npx cbrowser persona-questionnaire start --comprehensive --name "my-persona"

# Look up trait behavior at specific value
npx cbrowser persona-questionnaire lookup --trait patience --value 0.25

# List all available traits
npx cbrowser persona-questionnaire list-traits
```

### Programmatic Usage

```typescript
import {
  generatePersonaQuestionnaire,
  buildTraitsFromAnswers,
  getTraitBehaviors,
  getTraitLabel,
} from 'cbrowser';

// Generate questionnaire
const questionnaire = generatePersonaQuestionnaire({ comprehensive: false });

// Build traits from answers
const traits = buildTraitsFromAnswers({
  patience: 0.25,
  riskTolerance: 0.75,
  curiosity: 1.0,
});

// Look up specific trait behavior
const behaviors = getTraitBehaviors('patience', 0.25);
console.log(behaviors.label);       // "Low"
console.log(behaviors.behaviors);   // ["Gets frustrated quickly", ...]
```

### MCP Tools

Three MCP tools are available:

| Tool | Description |
|------|-------------|
| `persona_questionnaire_get` | Generate questionnaire questions |
| `persona_questionnaire_build` | Build trait profile from answers |
| `persona_trait_lookup` | Look up behaviors for trait value |

## The 25 Cognitive Traits

| Trait | Research Basis | What It Models |
|-------|---------------|----------------|
| **patience** | UX research | Time before abandoning on friction |
| **riskTolerance** | Prospect theory | Willingness to try unfamiliar actions |
| **comprehension** | Cognitive load theory | UI pattern understanding |
| **persistence** | Motivation research | Retry behavior after failures |
| **curiosity** | Exploration theory | Feature discovery tendency |
| **workingMemory** | Cognitive psychology | Multi-step task handling |
| **readingTendency** | Eye-tracking studies | Text consumption behavior |
| **resilience** | Positive psychology | Bounce-back from errors |
| **selfEfficacy** | Bandura (1977) | Belief in problem-solving ability |
| **satisficing** | Simon (1956) | Accept "good enough" vs optimize |
| **trustCalibration** | Fogg (2003) | Trust in unfamiliar interfaces |
| **interruptRecovery** | Mark et al. (2005) | Resume after distractions |
| **decisionFatigue** | Baumeister | Decision quality over time |
| **internalAttribution** | Attribution theory | Self-blame for failures |
| **externalAttribution** | Attribution theory | System-blame for failures |
| **techSavviness** | Digital literacy | Familiarity with UI patterns |
| **attentionSpan** | Attention research | Focus duration |
| **impulsivity** | Behavioral psychology | Quick vs deliberate actions |
| **errorRecovery** | Human factors | Speed of correcting mistakes |
| **visualProcessing** | Cognitive science | Image vs text preference |
| **spatialMemory** | Navigation research | UI layout recall |
| **patternRecognition** | Expertise research | UI element identification |
| **riskPerception** | Risk psychology | Danger assessment |
| **socialProof** | Cialdini (1984) | Influence of others' actions |
| **authorityTrust** | Trust research | Trust in official sources |

## Trait Reference Matrix

Each trait has 5 behavioral levels with specific descriptions:

### Example: Patience Trait

| Value | Label | Behaviors |
|-------|-------|-----------|
| 0 | Very Low | Abandons at first sign of friction, expects instant results |
| 0.25 | Low | Gets frustrated quickly, skips slow-loading content |
| 0.5 | Moderate | Waits reasonable time, tolerates some friction |
| 0.75 | High | Patient with delays, reads loading messages |
| 1.0 | Very High | Extremely patient, waits through any delay |

### Example: Self-Efficacy Trait

| Value | Label | Behaviors |
|-------|-------|-----------|
| 0 | Very Low | "I can't do this", gives up immediately on challenge |
| 0.25 | Low | Doubts ability, abandons 40% faster than average |
| 0.5 | Moderate | Normal confidence, persists through minor challenges |
| 0.75 | High | Confident problem-solver, sees obstacles as puzzles |
| 1.0 | Very High | "I'll figure this out", never attributes failure to self |

## Trait Correlations

The system automatically applies research-backed correlations:

| Primary Trait | Correlated Trait | Relationship |
|---------------|------------------|--------------|
| Low selfEfficacy | High internalAttribution | Self-blame for failures |
| Low selfEfficacy | Low resilience | Slower bounce-back |
| Low patience | Low resilience | Less tolerance for errors |
| High curiosity | Higher exploration | More feature discovery |
| Low trustCalibration | Longer evaluation time | Scrutinizes CTAs |

## Questionnaire Formats

### Quick Questionnaire (8 traits)

Core traits for basic persona differentiation:
- patience, riskTolerance, comprehension, persistence
- curiosity, workingMemory, readingTendency, resilience

### Comprehensive Questionnaire (25 traits)

All cognitive traits for detailed behavioral modeling.

### Custom Selection

Request specific traits:

```typescript
const questionnaire = generatePersonaQuestionnaire({
  traits: ['patience', 'selfEfficacy', 'trustCalibration'],
});
```

## AskUserQuestion Integration

For Claude sessions, use the `formatForAskUserQuestion` function:

```typescript
import { formatForAskUserQuestion, generatePersonaQuestionnaire } from 'cbrowser';

const questionnaire = generatePersonaQuestionnaire({ comprehensive: false });
const askUserFormat = formatForAskUserQuestion(questionnaire.questions);

// Returns format compatible with Claude's AskUserQuestion tool:
// {
//   questions: [
//     {
//       question: "How does this user handle waiting?",
//       header: "patience",
//       options: [
//         { label: "Very impatient", description: "Abandons at first delay" },
//         ...
//       ],
//       multiSelect: false
//     },
//     ...
//   ]
// }
```

## CLI Interactive Mode

The CLI provides an interactive questionnaire experience:

```bash
$ npx cbrowser persona-questionnaire start --name "anxious-newbie"

=== CBrowser Persona Questionnaire ===
Creating persona: anxious-newbie (8 core traits)

[1/8] Patience
How does this user handle waiting for pages or actions?
  1. Very impatient - abandons at first delay
  2. Somewhat impatient - frustrated by normal load times
  3. Average - tolerates reasonable waits
  4. Patient - waits through delays calmly
  5. Very patient - unlimited patience
> 2

[2/8] Risk Tolerance
How willing is this user to try unfamiliar features?
...

=== Persona Created ===
Saved to: ~/.cbrowser/personas/anxious-newbie.json
```

## Using Custom Personas

After creating a persona via questionnaire:

```typescript
import { runCognitiveJourney } from 'cbrowser';

const result = await runCognitiveJourney({
  persona: 'anxious-newbie',  // Uses saved persona
  startUrl: 'https://example.com',
  goal: 'complete signup',
});
```

Or with inline traits:

```typescript
const customTraits = buildTraitsFromAnswers({
  patience: 0.25,
  selfEfficacy: 0.25,
  trustCalibration: 0.25,
});

const result = await runCognitiveJourney({
  persona: 'custom',
  customTraits,
  startUrl: 'https://example.com',
  goal: 'complete signup',
});
```

## Research Citations

The trait system is grounded in academic research:

- **Bandura, A. (1977)** - Self-Efficacy: Toward a Unifying Theory of Behavioral Change
- **Kahneman, D. & Tversky, A.** - Prospect Theory and Decision Making
- **Simon, H. (1956)** - Satisficing and Administrative Behavior
- **Fogg, B.J. (2003)** - Persuasive Technology and Trust
- **Mark, G. et al. (2005)** - No Task Left Behind: Interrupt Recovery
- **Baumeister, R.** - Ego Depletion and Decision Fatigue
- **Nielsen, J.** - Usability Engineering and User Behavior
- **Cialdini, R. (1984)** - Influence: The Psychology of Persuasion

## API Reference

### generatePersonaQuestionnaire(options)

Generate questionnaire questions.

```typescript
interface QuestionnaireOptions {
  comprehensive?: boolean;     // All 25 traits (default: false = 8 traits)
  traits?: string[];           // Specific traits to include
  includeResearch?: boolean;   // Include research citations
}

const questionnaire = generatePersonaQuestionnaire(options);
// Returns: { questions: Question[], estimatedMinutes: number }
```

### buildTraitsFromAnswers(answers)

Build complete trait profile from questionnaire answers.

```typescript
const traits = buildTraitsFromAnswers({
  patience: 0.25,
  curiosity: 0.75,
});
// Returns: CognitiveTraits with correlations applied
```

### getTraitBehaviors(trait, value)

Get behavioral description for a trait value.

```typescript
const behaviors = getTraitBehaviors('patience', 0.25);
// Returns: { label: string, description: string, behaviors: string[] }
```

### getTraitLabel(trait, value)

Get short label for trait value.

```typescript
const label = getTraitLabel('patience', 0.25);
// Returns: "Low"
```

### getTraitReference(trait)

Get full research reference for a trait.

```typescript
const ref = getTraitReference('selfEfficacy');
// Returns: { researchBasis: string, citations: string[], levels: Level[] }
```

### formatForAskUserQuestion(questions)

Format questions for Claude's AskUserQuestion tool.

```typescript
const formatted = formatForAskUserQuestion(questions);
// Returns: { questions: AskUserQuestion[] }
```
