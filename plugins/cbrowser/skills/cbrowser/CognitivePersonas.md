# Cognitive Personas

The cognitive trait model behind every persona: what each trait means, the values the shipped personas carry, and how a journey uses them. Persona records and how to create them are in `Personas.md`.

---

## Cognitive Trait Definitions

There are 26 cognitive traits, each on a 0.0 to 1.0 scale (`TRAIT_DEFINITIONS` in `src/trait-reference.ts`). Personas store 25 of them. The 26th, `siteFamiliarity`, describes a persona-site pair rather than a person, so it is passed per run (`param: siteFamiliarity` on `cognitive_effort` and `site_cognitive_assessment`, or `customTraits` on `cognitive_journey_init`) and scores a first visit (0) when omitted. A trait a persona does not set falls back to 0.5 (`changeBlindness`: 0.3).

Bands: 0.0-0.2 very low, 0.2-0.4 low, 0.4-0.6 medium, 0.6-0.8 high, 0.8-1.0 very high.

| Trait | What it measures | 0.0 | 1.0 |
|-------|------------------|-----|-----|
| **patience** | Tolerance for delays, loading times, and friction before abandoning | Abandons immediately on any friction | Waits indefinitely, never abandons |
| **riskTolerance** | Willingness to click unfamiliar elements or take uncertain actions | Only clicks obvious, labeled buttons | Clicks anything that might work |
| **comprehension** | Grasp of UI conventions and interface patterns | Unfamiliar with modern UI patterns | Instant recognition of all conventions |
| **persistence** | Tendency to retry same approach vs. trying alternatives | Tries once, gives up or tries different approach | Keeps trying same approach repeatedly |
| **curiosity** | Tendency to explore vs. stay focused on immediate goal | Tunnel vision, only goal-relevant actions | Easily distracted by interesting elements |
| **workingMemory** | Capacity to remember previous attempts and current context | Forgets what was tried, repeats mistakes | Perfect recall of all attempts and context |
| **readingTendency** | Reads content thoroughly vs. scans for CTAs | Visual scanner, ignores all text | Reads every word before acting |
| **resilience** | Speed of emotional recovery from setbacks and errors | Frustration lingers, compounds with each error | Instantly shrugs off errors, stays positive |
| **selfEfficacy** | Belief in ability to solve interface problems | "I can't figure this out" | "I can solve anything" |
| **satisficing** | Accepts 'good enough' vs. seeks optimal solution | Maximizer - seeks perfect option | Satisficer - accepts first adequate option |
| **trustCalibration** | Baseline trust toward websites and UI claims | Highly skeptical, verifies everything | Highly trusting, accepts claims at face value |
| **interruptRecovery** | Ability to resume tasks after interruption | Restarts from beginning after any interruption | Seamlessly resumes exactly where left off |
| **informationForaging** | Strategy for finding information - exhaustive search vs. scent-following | Exhaustive search, clicks everything systematically | Follows information scent efficiently, abandons low-yield paths |
| **changeBlindness** | Tendency to miss UI changes outside focal area | Notices all changes, highly perceptive | Misses most changes outside focus area |
| **anchoringBias** | Tendency to over-weight initial information | Freely adjusts opinion as new info appears | First information heavily influences all judgments |
| **timeHorizon** | Focus on immediate vs. future consequences | Long-term focused, invests time in learning | Immediate gratification, wants results NOW |
| **attributionStyle** | Where blame is assigned for errors | Blames system/design (external attribution) | Blames self (internal attribution) |
| **metacognitivePlanning** | Tendency to plan before acting | Impulsive trial-and-error, no planning | Careful planning before any action |
| **proceduralFluency** | Ease of following step-by-step instructions | Struggles with sequences, skips steps, confuses order | Follows procedures precisely and efficiently |
| **transferLearning** | Ability to apply knowledge from familiar UIs to new ones | Each new UI feels completely unfamiliar | Instantly applies patterns across all interfaces |
| **authoritySensitivity** | Compliance with perceived authority figures and cues | Questions all authority, verifies claims | Follows authority cues without question |
| **emotionalContagion** | Susceptibility to mood influence from UI tone | Mood-stable, unaffected by UI emotional tone | Adopts UI's emotional tone completely |
| **fearOfMissingOut** | FOMO-driven decision making | Unaffected by scarcity/urgency cues | Highly responsive to urgency and scarcity |
| **socialProofSensitivity** | Influence of reviews, ratings, and social validation | Evaluates products on features alone | Heavily influenced by what others chose |
| **mentalModelFlexibility** | Ability to adapt mental models to unexpected UI patterns | Rigid - struggles when conventions are broken | Highly adaptive - quickly forms new mental models |
| **siteFamiliarity** | How much the persona knows about a site from prior visits | Brand new visitor - no memory of layout or navigation | Daily regular - navigates from memory, uses shortcuts |

`comprehension` is grasp of UI conventions, not reading ability. Reading capacity lives in a persona's accessibility traits (orthographic fluency, phonological decoding, visual span, vocabulary breadth, crowding sensitivity).

To browse the definitions: `cbrowser persona-questionnaire list-traits`, or MCP `persona_traits_list` and `persona_trait_lookup`.

### Research Foundations

Each trait names the research its scale is drawn from. The levels on the 0-1 scale were written by hand, not measured against that research.

| Trait | Research basis |
|-------|----------------|
| patience | Forrester Research - Web Performance & User Experience |
| riskTolerance | Kahneman & Tversky (1979) - Prospect Theory |
| comprehension | Nielsen Norman Group - UI Pattern Recognition Studies |
| persistence | Dweck (2006) - Mindset Theory |
| curiosity | Berlyne (1960) - Curiosity and Exploration |
| workingMemory | [Baddeley & Hitch (1974) - Working Memory Model](https://pubmed.ncbi.nlm.nih.gov/28212479/) |
| readingTendency | Nielsen (2006) - F-Pattern Reading Studies |
| resilience | [Smith et al. (2008) - Brief Resilience Scale (BRS)](https://pubmed.ncbi.nlm.nih.gov/18696313/) |
| selfEfficacy | [Bandura (1977) - Self-Efficacy Theory](https://psycnet.apa.org/record/1977-25733-001) |
| satisficing | Simon (1956) - Bounded Rationality; Schwartz, B. et al. (2002) - Maximizing vs Satisficing |
| trustCalibration | Fogg (2003) - Persuasive Technology, Stanford Web Credibility |
| interruptRecovery | Mark et al. (2005) - "No Task Left Behind?" |
| informationForaging | [Pirolli & Card (1999) - Information Foraging Theory](https://www.nngroup.com/articles/information-scent/) |
| changeBlindness | [Simons & Chabris (1999) - Inattentional Blindness](https://www.cell.com/trends/cognitive-sciences/abstract/S1364-6613(99)01310-2) |
| anchoringBias | Tversky & Kahneman (1974) - Anchoring Effect |
| timeHorizon | Frederick et al. (2002) - Time Discounting |
| attributionStyle | Weiner (1985) - Attribution Theory; Abramson et al. (1978) |
| metacognitivePlanning | Flavell (1979) - Metacognition; Schraw & Dennison (1994) |
| proceduralFluency | Sweller (1988) - Cognitive Load Theory |
| transferLearning | Barnett & Ceci (2002) - Transfer of Learning |
| authoritySensitivity | Milgram (1963) - Obedience; Cialdini (2001) - Influence |
| emotionalContagion | Hatfield et al. (1993) - Emotional Contagion |
| fearOfMissingOut | Przybylski et al. (2013) - FoMO Scale; Cialdini (2001) |
| socialProofSensitivity | Cialdini (2001) - Social Proof Principle |
| mentalModelFlexibility | Johnson-Laird (1983) - Mental Models; Norman (1988) |
| siteFamiliarity | Cockburn et al. (2007) - Familiar Interfaces; Tauscher & Greenberg (1997) - How people revisit web pages |

---

## Built-in Cognitive Profiles

Trait values for the 25 human personas (`BUILTIN_PERSONAS`, `ACCESSIBILITY_PERSONAS`, `EMOTIONAL_PERSONAS` in `src/personas.ts`), with the attention pattern and decision style `getCognitiveProfile` reports for each. Run `cbrowser persona show <name>` for the full record.

| Persona | patience | riskTolerance | comprehension | persistence | curiosity | workingMemory | readingTendency | Attention | Decision style |
|---------|------|------|------|------|------|------|------|------|------|
| power-user | 0.3 | 0.8 | 0.9 | 0.4 | 0.2 | 0.9 | 0.2 | skim | efficient |
| first-timer | 0.7 | 0.3 | 0.3 | 0.5 | 0.9 | 0.4 | 0.6 | thorough | cautious |
| mobile-user | 0.3 | 0.6 | 0.6 | 0.4 | 0.4 | 0.5 | 0.2 | f-pattern | quick-tap |
| screen-reader-user | 0.9 | 0.2 | 0.8 | 0.9 | 0.2 | 0.7 | 0.9 | thorough | none |
| elderly-user | 0.8 | 0.2 | 0.2 | 0.6 | 0.4 | 0.4 | 0.8 | thorough | cautious |
| impatient-user | 0.1 | 0.6 | 0.6 | 0.2 | 0.3 | 0.6 | 0.1 | skim | none |
| distracted-user | 0.4 | 0.5 | 0.5 | 0.3 | 0.6 | 0.25 | 0.3 | skim | impulsive |
| careful-reader | 0.9 | 0.15 | 0.8 | 0.8 | 0.5 | 0.7 | 0.95 | thorough | deliberate |
| explorer | 0.7 | 0.9 | 0.75 | 0.7 | 0.95 | 0.65 | 0.4 | z-pattern | none |
| task-focused | 0.6 | 0.5 | 0.7 | 0.9 | 0.2 | 0.7 | 0.35 | f-pattern | efficient |
| motor-impairment-tremor | 0.8 | 0.3 | 0.7 | 0.7 | 0.4 | 0.7 | 0.6 | thorough | none |
| low-vision-magnified | 0.7 | 0.3 | 0.7 | 0.8 | 0.3 | 0.6 | 0.9 | thorough | none |
| cognitive-adhd | 0.2 | 0.7 | 0.6 | 0.3 | 0.9 | 0.37 | 0.2 | skim | impulsive |
| dyslexic-user | 0.75 | 0.4 | 0.5 | 0.75 | 0.7 | 0.3 | 0.35 | thorough | cautious |
| deaf-user | 0.6 | 0.4 | 0.8 | 0.7 | 0.6 | 0.6 | 0.9 | f-pattern | deliberate |
| elderly-low-vision | 0.9 | 0.1 | 0.3 | 0.8 | 0.3 | 0.3 | 0.9 | thorough | cautious |
| color-blind-deuteranopia | 0.6 | 0.4 | 0.7 | 0.7 | 0.6 | 0.7 | 0.7 | f-pattern | none |
| autism-spectrum | 0.65 | 0.2 | 0.55 | 0.7 | 0.4 | 0.32 | 0.7 | thorough | cautious |
| intellectual-disability | 0.5 | 0.2 | 0.2 | 0.4 | 0.3 | 0.2 | 0.3 | f-pattern | impulsive |
| aphasia-receptive | 0.55 | 0.25 | 0.25 | 0.5 | 0.3 | 0.45 | 0.15 | skim | cautious |
| dyscalculia | 0.5 | 0.4 | 0.65 | 0.6 | 0.6 | 0.35 | 0.65 | skim | none |
| anxious-user | 0.8 | 0.2 | 0.6 | 0.6 | 0.3 | 0.5 | 0.9 | thorough | cautious |
| confident-user | 0.3 | 0.8 | 0.7 | 0.7 | 0.6 | 0.7 | 0.2 | f-pattern | none |
| emotional-user | 0.25 | 0.5 | 0.5 | 0.4 | 0.6 | 0.5 | 0.6 | f-pattern | impulsive |
| stoic-user | 0.7 | 0.5 | 0.7 | 0.7 | 0.4 | 0.7 | 0.7 | thorough | deliberate |

Decision style is derived by scoring every style against the traits. When the top two score within 0.05 of each other the style is withheld (shown as "none" above) and the profile names both candidates instead of picking one at random.

---

## Attention Patterns

How a persona scans the page. Built-in personas declare one of four in `humanBehavior.attention.pattern`; a custom persona can set any of the seven through `behaviors.attentionPattern`.

| Pattern | Description |
|---------|-------------|
| **f-pattern** | Horizontal across the top, then down the left side |
| **z-pattern** | Top left, top right, bottom left, bottom right |
| **skim** | Big elements only, minimal reading |
| **thorough** | Everything, slowly |
| **targeted** | Goes directly to the expected location |
| **exploratory** | Wanders, notices everything |
| **sequential** | Tab order, as with a screen reader |

---

## Decision Styles

How a persona chooses what to click (`DecisionStyleType` in `src/types.ts`).

| Style | Description |
|-------|-------------|
| **efficient** | Takes the optimal path without hesitation |
| **cautious** | Hovers first, reads, then decides |
| **quick-tap** | Taps what looks relevant, quickly |
| **structured** | Follows the logical navigation order |
| **deliberate** | Reads everything, decides slowly |
| **impulsive** | Clicks the first thing that seems right |

In an autonomous journey the attention pattern and decision style are written into each step's prompt as descriptions of the person. The time a step takes comes from the persona's `humanBehavior` timing and the pointing and typing models, not from the style label.

---

## How Traits Shape a Journey

Traits move the abandonment limits. In an autonomous journey (`src/cognitive/index.ts`), "low" means below the low band edge and "high" above the high edge:

| Trait | Band edges | Effect |
|-------|-----------|--------|
| comprehension | low < 0.4, high > 0.7 | Low comprehension lowers the confusion limit from 0.9 to 0.75 |
| patience | low < 0.3, high > 0.7 | Low patience lowers the frustration limit from 0.95 to 0.8; with no `--max-time`, the time limit is 60 s (low), 120 s, or 180 s (high) |
| persistence | low < 0.3, high > 0.7 | High persistence allows 20 steps without progress instead of 15; decision-fatigue limit 0.7 (low), 0.85, 0.95 (high) |

Patience also sets how fast negative emotion drains `patienceRemaining`, and comprehension how quickly confusion fades. The full rules, and the different rules `cognitive_journey_update_state` applies, are in `CognitiveState.md`.

---

## Creating Custom Cognitive Personas

Set any traits you care about; the rest default to 0.5. As a persona file in `<data dir>/personas/nervous-first-purchase.json`:

```json
{
  "name": "nervous-first-purchase",
  "description": "User making their first online purchase, worried about security",
  "demographics": { "age_range": "25-55", "tech_level": "beginner", "device": "desktop" },
  "behaviors": { "attentionPattern": "thorough" },
  "cognitiveTraits": {
    "patience": 0.7,
    "riskTolerance": 0.1,
    "comprehension": 0.4,
    "persistence": 0.6,
    "curiosity": 0.2,
    "workingMemory": 0.5,
    "readingTendency": 0.95,
    "trustCalibration": 0.15,
    "selfEfficacy": 0.3
  }
}
```

Or skip the file: `cbrowser persona create "<description>"`, or `customTraits` on `cognitive_journey_init` for a single run.

---

## Inner Monologue

There are no monologue templates. In an autonomous journey the model writes the persona's thoughts each step from the persona description, its traits and the current state; the journey records them in `fullMonologue` and per step in `journeyLog`. Typical shapes:

**Low patience, high frustration:**
> "This is ridiculous. Why can't I just... ugh. One more try."

**High reading tendency, low comprehension:**
> "Okay, it says 'Submit your application'... but what does that mean exactly? Is this the right form?"

**Low risk tolerance, unfamiliar element:**
> "I don't know what this button does. What if I click it and something bad happens?"

---

## Trait Mappings by Persona

The four traits that most shape trust and recovery, for every human persona:

| Persona | selfEfficacy | satisficing | trustCalibration | interruptRecovery |
|---------|------|------|------|------|
| power-user | 0.9 | 0.4 | 0.7 | 0.9 |
| first-timer | 0.4 | 0.6 | 0.4 | 0.4 |
| mobile-user | 0.6 | 0.8 | 0.6 | 0.5 |
| screen-reader-user | 0.7 | 0.6 | 0.6 | 0.6 |
| elderly-user | 0.4 | 0.6 | 0.25 | 0.4 |
| impatient-user | 0.6 | 0.9 | 0.7 | 0.2 |
| distracted-user | 0.45 | 0.7 | 0.5 | 0.1 |
| careful-reader | 0.6 | 0.1 | 0.25 | 0.7 |
| explorer | 0.85 | 0.2 | 0.6 | 0.7 |
| task-focused | 0.8 | 0.5 | 0.5 | 0.8 |
| motor-impairment-tremor | 0.6 | 0.75 | 0.6 | 0.4 |
| low-vision-magnified | 0.45 | 0.65 | 0.4 | 0.35 |
| cognitive-adhd | 0.4 | 0.7 | 0.65 | 0.3 |
| dyslexic-user | 0.3 | 0.7 | 0.5 | 0.35 |
| deaf-user | 0.7 | 0.5 | 0.6 | 0.7 |
| elderly-low-vision | 0.3 | 0.7 | 0.4 | 0.3 |
| color-blind-deuteranopia | 0.65 | 0.5 | 0.4 | 0.6 |
| autism-spectrum | 0.55 | 0.3 | 0.3 | 0.3 |
| intellectual-disability | 0.3 | 0.8 | 0.7 | 0.15 |
| aphasia-receptive | 0.4 | 0.7 | 0.5 | 0.3 |
| dyscalculia | 0.3 | 0.75 | 0.65 | 0.6 |
| anxious-user | 0.3 | 0.3 | 0.2 | 0.4 |
| confident-user | 0.9 | 0.7 | 0.7 | 0.7 |
| emotional-user | 0.5 | 0.6 | 0.5 | 0.4 |
| stoic-user | 0.6 | 0.4 | 0.7 | 0.7 |

### Trait Interpretation Guide

Levels from `TRAIT_DEFINITIONS` (very low, low, medium, high, very high):

**selfEfficacy** (Bandura 1977): gives up immediately ("this is beyond me"); assumes difficulty means personal failure; willing to try but unsure; confident in finding solutions; never doubts success.

**satisficing** (Simon 1956): compares all options exhaustively; evaluates 3-4 options; considers 2 and picks the better; takes the first option that meets basic needs; clicks the first option without comparing.

**trustCalibration** (Fogg 2003): checks the URL and HTTPS, questions all claims; skeptical of promotional language; trusts professional-looking sites; accepts most claims; clicks through warnings without reading.

**interruptRecovery** (Mark et al. 2005): forgets the task entirely after an interruption; takes 5+ minutes to find their place; uses tabs and history to resume; a mental bookmark allows quick resumption; interruptions do not break concentration.

**siteFamiliarity** (Cockburn et al. 2007): never visited; visited once or twice; occasional visitor who remembers the main sections; frequent visitor who goes straight to what they need; daily user navigating from memory.

---

## Integration

- **Personas.md**: persona records, the full roster, creating and storing personas
- **CognitiveState.md**: runtime state, update rules and abandonment
- **Workflows/CognitiveJourney.md**: running a journey
