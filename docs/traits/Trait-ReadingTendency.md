# Reading Tendency

**Category**: Tier 1 - Core Traits
**Scale**: 0.0 (scans only) to 1.0 (reads thoroughly)

## Definition

Reading tendency represents the degree to which users actually read content versus scanning for visual patterns and keywords. This trait determines whether users will notice important text, read instructions before acting, and absorb content beyond headlines. Users with low reading tendency skip most text and rely on visual cues, while high reading tendency users methodically read content and are more likely to notice details.

## Research Foundation

### Primary Citation

> "On the average web page, users have time to read at most 28% of the words during an average visit; 20% is more likely... Users scan in an F-shaped pattern, focusing on the top and left side of the page."
> - Nielsen, 2006, p. 2

**Full Citation (APA 7):**
Nielsen, J. (2006). F-shaped pattern for reading web content. *Nielsen Norman Group*. https://doi.org/10.1145/1167867.1167876

**DOI**: https://doi.org/10.1145/1167867.1167876

### Supporting Research

> "79% of our test users always scanned any new page they came across; only 16% read word-by-word... Web users are ruthless in their prioritization and will not read more than is absolutely necessary."
> - Nielsen, 1997

**Full Citation (APA 7):**
Nielsen, J. (1997). How users read on the web. *Nielsen Norman Group*. https://www.nngroup.com/articles/how-users-read-on-the-web/

### Key Numerical Values

| Metric | Value | Source |
|--------|-------|--------|
| Users who scan vs. read | 79% scan | Nielsen (1997) |
| Maximum words read per page visit | 28% | Nielsen (2006) |
| Realistic words read | 20% | Nielsen (2006) |
| F-pattern compliance | 69% of pages | Nielsen (2006) |
| Above-fold attention | 80% of viewing time | Pernice (2017) |
| Headline reading rate | 100% of visitors | Chartbeat (2014) |
| Full article completion | 33% of starters | Chartbeat (2014) |

## The F-Pattern

Nielsen's eyetracking research identified the F-shaped reading pattern:

### The Three Fixation Phases

1. **First Horizontal Movement**: Users read across the top of the content area
2. **Second Horizontal Movement**: Users move down and read a shorter horizontal area
3. **Vertical Movement**: Users scan down the left side in a vertical movement

### F-Pattern Distribution

```
████████████████████████████  ← Heavy reading (top)
████████████████              ← Moderate reading
████████                      ← Light reading
███                           ← Scanning only
██                            ← Minimal attention
█                             ← Often missed
```

## Behavioral Levels

| Value | Label | Behaviors |
|-------|-------|-----------|
| 0.0-0.2 | Scanner Only | Reads headlines only, skips body text entirely. Relies exclusively on visual cues (icons, images, buttons). Misses important text warnings. Never reads terms/conditions. Clicks based on position, not content. May miss inline errors. Maximum 10% of text read. |
| 0.2-0.4 | Light Scanner | Reads first 1-2 sentences of blocks. Scans for keywords relevant to task. Notices bold text and bullet points. Skips paragraphs longer than 2-3 lines. Reads 15-20% of text. Often misses important details buried in paragraphs. |
| 0.4-0.6 | Moderate | Follows F-pattern closely per Nielsen's research. Reads headlines, subheads, and first sentences. Scans remainder for relevant keywords. Reads 20-28% of text. Notices formatted elements (lists, callouts). May miss mid-paragraph important info. |
| 0.6-0.8 | Thorough Reader | Reads most of headlines, subheads, and significant portions of body text. Notices text warnings and important messages. Reads 40-60% of text. Follows links within content. Reads captions and labels. More likely to notice inline guidance. |
| 0.8-1.0 | Complete Reader | Reads nearly all text content systematically. Reads terms and conditions. Notices footnotes and fine print. Reads 70%+ of text. Processes instructions before acting. Unlikely to miss text-based warnings. May read comments and supplementary content. |

## Trait Correlations

| Related Trait | Correlation | Mechanism |
|---------------|-------------|-----------|
| [Comprehension](Trait-Comprehension) | r = 0.35 | Reading enables comprehension |
| [Patience](Trait-Patience) | r = 0.42 | Time allows for reading |
| [Curiosity](Trait-Curiosity) | r = 0.38 | Interest drives deeper reading |
| [Working Memory](Trait-WorkingMemory) | r = 0.25 | Capacity to process text |
| [Risk Tolerance](Trait-RiskTolerance) | r = -0.28 | Risk-averse users read warnings |

## Impact on Web Behavior

### Content Consumption

| Reading Level | Words Read | Patterns |
|---------------|------------|----------|
| Scanner Only | 10% | Headlines only |
| Light Scanner | 15-20% | First sentences |
| Moderate | 20-28% | F-pattern |
| Thorough | 40-60% | Most content |
| Complete | 70%+ | Nearly everything |

### Form Completion

- **Low reading tendency**: Skips field labels, misses requirements, ignores inline help
- **High reading tendency**: Reads all labels, follows instructions, notices validation messages

### Error Recognition

| Reading Level | Text Error Notice Rate | Recovery |
|---------------|------------------------|----------|
| Very Low | 23% | Poor |
| Low | 41% | Fair |
| Moderate | 58% | Average |
| High | 79% | Good |
| Very High | 94% | Excellent |

### Legal/Terms Content

| Reading Level | Terms Engagement |
|---------------|------------------|
| Scanner Only | Scrolls to checkbox, never reads |
| Light Scanner | Glances at headings |
| Moderate | Reads bold sections |
| Thorough | Skims important sections |
| Complete | Reads in full (rare: ~4% of users) |

## Scanning Patterns Beyond F

### Layer-Cake Pattern
- Users read subheadings, skip body
- Common for comparison shopping

### Spotted Pattern
- Eyes jump to specific keywords
- Task-focused searching

### Commitment Pattern
- Engaged readers who read everything
- Only 16% of users per Nielsen

### Marking Pattern
- Eyes return to navigation
- Orientation-focused scanning

## Persona Values

| Persona | Reading Tendency Value | Rationale |
|---------|------------------------|-----------|
| [Rushed Professional](../personas/Persona-RushedProfessional) | 0.2 | Time pressure = scanning |
| [Impulsive Shopper](../personas/Persona-ImpulsiveShopper) | 0.25 | Action-oriented, not reading |
| [Distracted Parent](../personas/Persona-DistractedParent) | 0.3 | Interruptions prevent sustained reading |
| [Anxious First-Timer](../personas/Persona-AnxiousFirstTimer) | 0.45 | Reads more due to uncertainty |
| [Tech-Savvy Explorer](../personas/Persona-TechSavvyExplorer) | 0.5 | Selective reading of interesting content |
| [Methodical Senior](../personas/Persona-MethodicalSenior) | 0.8 | Thorough, careful reading |

## UX Design Implications

### For Low-Reading-Tendency Users

- Use clear visual hierarchy
- Put key info in headlines and first sentences
- Use icons alongside text labels
- Make buttons and CTAs visually distinct
- Use bullet points, not paragraphs
- Front-load important information (inverted pyramid)
- Never bury critical info in paragraphs
- Use color, bold, and formatting for emphasis

### For High-Reading-Tendency Users

- Can include detailed explanations
- Longer content is acceptable
- Footnotes and fine print will be noticed
- Can use text for important warnings
- Rich content is appreciated

## Content Design Guidelines

### The Inverted Pyramid

Structure content for scanners:
1. **Most important**: First (headline)
2. **Important**: Early (subheads)
3. **Details**: Later (body)
4. **Background**: End (if read at all)

### Scannability Improvements

| Technique | Reading Improvement |
|-----------|---------------------|
| Highlighted keywords | 47% more noticed |
| Bulleted lists | 70% easier to scan |
| Short paragraphs (1-2 sentences) | 58% more read |
| Meaningful subheadings | 47% more navigation |
| One idea per paragraph | 34% better comprehension |

## See Also

- [Trait Index](Trait-Index) - All cognitive traits
- [Comprehension](Trait-Comprehension) - Understanding what is read
- [Patience](Trait-Patience) - Time to read
- [Working Memory](Trait-WorkingMemory) - Capacity to process
- [Persona Index](../personas/Persona-Index) - Pre-configured personas

## Bibliography

Chartbeat. (2014). What you think you know about the web is wrong. *Chartbeat Data Science*. https://blog.chartbeat.com/2014/09/what-you-think-you-know-about-the-web-is-wrong/

Nielsen, J. (1997). How users read on the web. *Nielsen Norman Group*. https://www.nngroup.com/articles/how-users-read-on-the-web/

Nielsen, J. (2006). F-shaped pattern for reading web content. *Nielsen Norman Group*. https://doi.org/10.1145/1167867.1167876

Nielsen, J. (2008). How little do users read? *Nielsen Norman Group*. https://www.nngroup.com/articles/how-little-do-users-read/

Pernice, K. (2017). F-shaped pattern of reading on the web: Misunderstood, but still relevant (even on mobile). *Nielsen Norman Group*. https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/
