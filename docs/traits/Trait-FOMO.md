# FOMO (Fear of Missing Out)

**Category**: Tier 6 - Social Traits
**Scale**: 0.0 (low) to 1.0 (high)

## Definition

FOMO (Fear of Missing Out) measures the degree to which a user experiences anxiety or apprehension that others might be having rewarding experiences from which they are absent, or that they might miss valuable opportunities, deals, or content. Users high in this trait are driven by urgency cues, limited-time offers, social activity indicators, and the fear that inaction will result in loss. They exhibit compulsive checking behaviors and are highly susceptible to scarcity marketing. Users low in this trait experience minimal anxiety about missing opportunities, make decisions based on actual need rather than perceived urgency, and are resistant to artificial scarcity tactics.

## Research Foundation

### Primary Citation

> "FoMO is defined as a pervasive apprehension that others might be having rewarding experiences from which one is absent... characterized by the desire to stay continually connected with what others are doing."
> - Przybylski, Murayama, DeHaan, & Gladwell, 2013, p. 1841

**Full Citation (APA 7):**
Przybylski, A. K., Murayama, K., DeHaan, C. R., & Gladwell, V. (2013). Motivational, emotional, and behavioral correlates of fear of missing out. *Computers in Human Behavior, 29*(4), 1841-1848.

**DOI**: https://doi.org/10.1016/j.chb.2013.02.014

### Supporting Research

> "Scarcity enhances the value of objects and experiences, driving urgency in decision-making."
> - Cialdini, 2001, p. 204

**Full Citation (APA 7):**
Cialdini, R. B. (2001). *Influence: Science and practice* (4th ed.). Allyn and Bacon.

### Key Numerical Values

| Metric | Value | Source |
|--------|-------|--------|
| FoMO Scale internal consistency | alpha = 0.87-0.90 | Przybylski et al. (2013) |
| Scale items | 10-item measure | Przybylski et al. (2013) |
| Correlation with social media use | r = 0.40 | Przybylski et al. (2013) |
| Correlation with life dissatisfaction | r = 0.43 | Przybylski et al. (2013) |
| Age effect | Young adults higher FOMO | Przybylski et al. (2013) |
| Scarcity conversion boost | 226% increase in urgency purchases | Aggarwal et al. (2011) |
| "Limited time" effectiveness | 42% higher click-through | Worchel et al. (1975) |

## Behavioral Levels

| Value | Label | Behaviors |
|-------|-------|-----------|
| 0.0-0.2 | Very Low | Immune to urgency marketing; ignores countdown timers and "limited stock" warnings; makes purchase decisions based solely on actual need; rarely checks social media for fear of missing content; resistant to "flash sale" pressure; comfortable missing events or opportunities; does not experience regret about unused coupons or expired offers |
| 0.2-0.4 | Low | Notices urgency cues without feeling compelled to act; occasional influence by very strong scarcity signals; makes most decisions at personal pace; some awareness of social activity but minimal anxiety; may respond to genuinely limited opportunities but not artificial scarcity |
| 0.4-0.6 | Moderate | Standard responsiveness to urgency cues; influenced by countdown timers and limited stock indicators; occasional anxiety about missing deals or social content; moderate social media checking behavior; balances urgency response with rational evaluation; typical susceptibility to scarcity marketing |
| 0.6-0.8 | High | Strongly influenced by urgency cues; countdown timers create genuine anxiety; frequently checks social media to stay current; makes purchases under time pressure to avoid missing deals; experiences regret about missed opportunities; shares limited-time offers quickly; influenced by "X people are viewing this" indicators; may over-subscribe to notifications |
| 0.8-1.0 | Very High | Dominated by fear of missing out; compulsive checking of social media, deals, and notifications; cannot resist limited-time offers; extreme anxiety about countdown timers and scarcity warnings; makes impulsive purchases to avoid potential regret; constantly monitors social activity; significant distress when unable to check devices; highly susceptible to all forms of urgency manipulation |

## Web/UI Behavioral Patterns

### High FOMO (0.8+)

- **Countdown Timers**: Creates genuine anxiety; often leads to rushed decisions or abandoned tasks to act on offer
- **Stock Indicators**: "Only 3 left" warnings trigger immediate purchase consideration regardless of actual need
- **Social Activity**: "X people viewing now" creates urgency and validates interest
- **Notifications**: Cannot disable notifications; checks immediately when received
- **Flash Sales**: Participates even when items aren't needed; fear of regret outweighs rational evaluation
- **Social Proof**: "Bestseller" and "Trending" labels strongly influence choices
- **Exit Intent**: Highly susceptible to "Wait! Don't miss this offer" popups
- **Cart Abandonment**: "Items in cart selling out" emails prompt immediate returns
- **Social Media**: Excessive scrolling to avoid missing content; difficulty stopping

### Low FOMO (0.2-)

- **Countdown Timers**: Ignores or dismisses as marketing tactic; makes decisions on personal timeline
- **Stock Indicators**: Treats as information, not pressure; will wait for restock if needed
- **Social Activity**: Indifferent to what others are viewing or purchasing
- **Notifications**: Comfortable with notifications disabled; checks at convenient times
- **Flash Sales**: Only participates if item was already desired and price is genuinely good
- **Social Proof**: Popularity doesn't influence decision-making
- **Exit Intent**: Closes popups without reading; views as manipulation
- **Cart Abandonment**: Unaffected by urgency emails; returns when ready or not at all
- **Social Media**: Uses purposefully; comfortable missing content

## Trait Correlations

| Correlated Trait | Correlation | Mechanism |
|------------------|-------------|-----------|
| Patience | r = -0.41 | FOMO drives urgency, reducing patience |
| Emotional Contagion | r = 0.52 | Both involve heightened reactivity to social stimuli |
| Social Proof Sensitivity | r = 0.58 | Both driven by social comparison and validation |
| Self-Efficacy | r = -0.34 | Lower confidence increases fear of wrong decisions |
| Satisficing | r = -0.27 | FOMO drives maximizing rather than satisficing |

## Persona Values

| Persona | Value | Rationale |
|---------|-------|-----------|
| Busy Parent (Pat) | 0.50 | Moderate; time pressure creates some susceptibility but also immunity to time-wasting |
| Tech-Savvy Teen (Taylor) | 0.85 | Peak FOMO demographic; highly social, connected, and status-conscious |
| Senior User (Sam) | 0.30 | Lower social comparison; comfortable missing digital content |
| Impatient Professional (Alex) | 0.45 | Wants efficiency but recognizes urgency manipulation |
| Cautious Newcomer (Casey) | 0.65 | Uncertainty creates susceptibility to "don't miss out" messaging |
| Accessibility User (Jordan) | 0.40 | Standard range; depends more on individual factors |
| Power User (Riley) | 0.25 | Recognizes and resists manipulation tactics |

## Design Implications

### Ethical Considerations

FOMO-targeting design patterns are effective but can be manipulative. Ethical design should:
- Use genuine scarcity information (actual stock levels, real deadlines)
- Avoid fake urgency (invented countdown timers, artificial "limited stock")
- Provide clear information for rational decision-making
- Not exploit psychological vulnerabilities for profit

### For High FOMO Users

- Provide "save for later" options to reduce decision anxiety
- Show genuine availability information clearly
- Allow notification customization to reduce checking compulsion
- Offer reassurance that opportunities will return

### For Low FOMO Users

- Focus on value proposition rather than urgency
- Provide detailed product information for deliberate decision-making
- Avoid aggressive urgency tactics (may cause reactance)
- Respect decision timelines

## See Also

- [Social Proof Sensitivity](./Trait-SocialProofSensitivity.md) - Influence by others' behavior
- [Emotional Contagion](./Trait-EmotionalContagion.md) - Absorption of social emotions
- [Patience](./Trait-Patience.md) - Time tolerance and urgency response
- [Satisficing](./Trait-Satisficing.md) - Decision-making strategies
- [Trait Index](./Trait-Index.md) - All cognitive traits

## Bibliography

Aggarwal, P., Jun, S. Y., & Huh, J. H. (2011). Scarcity messages: A consumer competition perspective. *Journal of Advertising, 40*(3), 19-30.

Cialdini, R. B. (2001). *Influence: Science and practice* (4th ed.). Allyn and Bacon.

Elhai, J. D., Levine, J. C., Dvorak, R. D., & Hall, B. J. (2016). Fear of missing out, need for touch, anxiety and depression are related to problematic smartphone use. *Computers in Human Behavior, 63*, 509-516.

Przybylski, A. K., Murayama, K., DeHaan, C. R., & Gladwell, V. (2013). Motivational, emotional, and behavioral correlates of fear of missing out. *Computers in Human Behavior, 29*(4), 1841-1848. https://doi.org/10.1016/j.chb.2013.02.014

Worchel, S., Lee, J., & Adewole, A. (1975). Effects of supply and demand on ratings of object value. *Journal of Personality and Social Psychology, 32*(5), 906-914.
