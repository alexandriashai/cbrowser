# Personas System

Create and use simulated users for cognitive journeys, persona comparisons, empathy audits and cognitive-effort scoring.

---

## What a Persona Is

A persona is a JSON record (the `Persona` type in `src/types.ts`) with:

- **demographics**: age range, tech level (beginner, intermediate, expert), device (desktop, mobile)
- **behaviors**: descriptive flags such as keyboard only, reads everything, uses gestures
- **humanBehavior**: timing (reaction time, click delay, typing speed, reading speed in words per minute), error rates (misclick, accidental double click, typo, backtrack), mouse movement (speed, curvature, jitter, overshoot) and attention (`pattern`: f-pattern, z-pattern, skim or thorough)
- **cognitiveTraits**: 25 of the 26 cognitive traits on a 0-1 scale (see `CognitivePersonas.md`). The 26th, `siteFamiliarity`, is never stored on a persona; it describes a persona-site pair and is supplied per run
- **context** and **location**: a nominal viewport, and for some personas a timezone, locale and geolocation

Run `cbrowser persona show first-timer` to see a complete record.

What a journey takes from the persona: its traits, its human timing and errors, and its location (timezone, locale, geolocation). The browser size does not come from the persona's `device` or `context.viewport`; set it with `--device` or `--viewport`.

---

## Built-in Personas

29 personas ship with CBrowser: 25 human personas in three groups, plus 4 AI-agent personas.

### General (10, `BUILTIN_PERSONAS`)

| Name | Description | Tech | Device |
|------|-------------|------|--------|
| `power-user` | Tech-savvy expert who expects efficiency and knows shortcuts | expert | desktop |
| `first-timer` | New user exploring for the first time, needs guidance | beginner | desktop |
| `mobile-user` | Smartphone user with touch interface and limited screen | intermediate | mobile |
| `screen-reader-user` | Blind user navigating with screen reader and keyboard | intermediate | desktop |
| `elderly-user` | Older adult with potential vision and motor limitations | beginner | desktop |
| `impatient-user` | Quick to abandon slow or confusing experiences | intermediate | desktop |
| `distracted-user` | Attention repeatedly pulled away mid-task; returns with context lost | intermediate | desktop |
| `careful-reader` | Reads before acting; verifies details and dislikes surprises | intermediate | desktop |
| `explorer` | Wanders the interface by choice, opening things to see what they do | expert | desktop |
| `task-focused` | Came to finish one thing; ignores everything that is not on the path | intermediate | desktop |

### Accessibility (11, `ACCESSIBILITY_PERSONAS`)

Used by `empathy-audit` (CLI) and `empathy_audit` (MCP), and accepted by cognitive journeys.

| Name | Description |
|------|-------------|
| `motor-impairment-tremor` | Essential tremor affecting fine motor control |
| `low-vision-magnified` | Low vision, using 3x screen magnification |
| `cognitive-adhd` | ADHD affecting focus and working memory |
| `dyslexic-user` | Dyslexia affecting reading and text processing |
| `deaf-user` | Deaf, relies on visual content and captions |
| `elderly-low-vision` | Elderly (75+) with age-related vision and motor decline |
| `color-blind-deuteranopia` | Red-green color blindness (deuteranopia) |
| `autism-spectrum` | Autistic adult: needs predictable layouts, clear labels, reduced visual noise |
| `intellectual-disability` | Mild intellectual disability: needs simple navigation, plain language, image support |
| `aphasia-receptive` | Receptive aphasia: struggles with text-heavy navigation; language comprehension is impaired, intelligence is not |
| `dyscalculia` | Struggles with pricing, quantities, dates, percentages and reference numbers |

### Emotional (4, `EMOTIONAL_PERSONAS`)

| Name | Description |
|------|-------------|
| `anxious-user` | High baseline anxiety; worries about mistakes and consequences |
| `confident-user` | High self-efficacy; trusts their judgment and recovers quickly from errors |
| `emotional-user` | High emotional sensitivity; strong reactions to successes and failures |
| `stoic-user` | High emotional stability; stays calm regardless of success or failure |

### AI agents (4, `AGENT_PERSONAS`)

`retrieval-agent`, `task-completion-agent`, `crawl-agent`, `conversational-agent`. These model AI agents, not people, and cognitive journeys refuse them.

### Listing them

- `cbrowser persona list` prints the 10 general personas and your custom ones
- MCP `list_cognitive_personas` lists general, accessibility, emotional and custom personas with their traits
- MCP `persona_lookup` returns one persona's full record

---

## Creating Custom Personas

### From a description (no API key)

```bash
cbrowser persona create "nervous first-time online shopper worried about security" --name nervous-shopper
```

The description is read by keyword rules (`generatePersonaFromDescription` in `src/personas.ts`), not by a model. It sets tech level, timing, error rates, attention and the traits the words imply; any trait it does not set falls back to 0.5. Built-in names cannot be overwritten.

### From a questionnaire

```bash
cbrowser persona-questionnaire start --name checkout-skeptic
cbrowser persona-questionnaire list-traits
```

### Over MCP

`persona_create_start` offers two modes. Description mode: `persona_create_from_description` returns the trait reference, the calling model infers the values, and `persona_create_submit_traits` saves them. Questionnaire mode: `persona_create_questionnaire_start`, then `persona_create_questionnaire_answer` once per question. `persona_update` and `persona_delete` manage the result; `persona_traits_list` and `persona_trait_lookup` explain the trait scale.

### Ad hoc

- `cognitive-journey --persona "<description>"`: a name CBrowser does not know is read as a description of the person
- MCP `cognitive_journey_init` with `customTraits` overrides any of the 26 traits for one run

### Managing them

```bash
cbrowser persona show nervous-shopper
cbrowser persona export nervous-shopper
cbrowser persona import nervous-shopper.json
cbrowser persona delete nervous-shopper
cbrowser persona cleanup --dry-run      # list custom personas that fail validation
```

---

## Using Personas

```bash
# Cognitive journey (needs an Anthropic API key; costs tokens)
cbrowser cognitive-journey --persona first-timer \
  --start "https://example.com" --goal "sign up for an account" --device iphone-15

# Same journey, several personas side by side (needs an API key)
cbrowser compare-personas --start "https://example.com" --goal "complete checkout" \
  --personas power-user,first-timer,elderly-user,mobile-user

# Disability barriers on the page (no API key; with --goal and a configured key
# it also runs a journey per persona)
cbrowser empathy-audit "https://example.com" --personas "cognitive-adhd,low-vision-magnified"

# Attention overlay weighted by a persona
cbrowser capture start "https://example.com" --duration 3s --attention-overlay --overlay-persona elderly-user
```

`navigate`, `click` and the other interaction commands take no persona. A persona acts only through the commands above and the MCP tools that accept one: `cognitive_journey_init`, `compare_personas`, `cognitive_effort`, `site_cognitive_assessment`, `empathy_audit` and others.

A journey reports from the persona's perspective: an inner monologue at every step, friction points, and an abandonment reason when the persona gives up. See `Workflows/CognitiveJourney.md` for the loop and `CognitiveState.md` for the state it tracks.

---

## Storage

Custom personas are JSON files in `<data dir>/personas/<name>.json` (data dir: `CBROWSER_DATA_DIR`, default `~/.cbrowser`). The loader also reads `.yaml` and `.yml` files there. Built-in personas live in the package code, not on disk. A custom persona with a built-in's name cannot be created, but a file placed there by hand takes precedence over the built-in when looked up.
