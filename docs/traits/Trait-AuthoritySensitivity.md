> **This documentation is no longer maintained here.**
>
> For the latest version, please visit: **[Authority Sensitivity](https://cbrowser.ai/docs/Trait-AuthoritySensitivity)**

---

# Authority Sensitivity

**Category**: Tier 6 - Social Traits
**Scale**: 0.0 (low) to 1.0 (high)

## Definition

Authority Sensitivity measures the degree to which a user's behavior is influenced by perceived authority figures, expert endorsements, or institutional credibility signals. Users high in this trait readily comply with instructions, recommendations, or interface elements that convey authority (badges, certifications, expert testimonials, official logos), often accepting them without critical evaluation. Users low in this trait question authority-based appeals, seek independent verification, and may actively resist institutional pressure, sometimes to the point of reactance against authoritative messaging.

## Research Foundation

### Primary Citation

> "A substantial proportion of people do what they are told to do, irrespective of the content of the act and without limitations of conscience, so long as they perceive that the command comes from a legitimate authority."
> - Stanley Milgram, 1963, p. 377

**Full Citation (APA 7):**
Milgram, S. (1963). Behavioral study of obedience. *Journal of Abnormal and Social Psychology, 67*(4), 371-378.

**DOI**: https://doi.org/10.1037/h0040525

### Supporting Research

> "The power of authority is so great that once it is accepted, people often suspend their own judgment."
> - Robert B. Cialdini, 2001, p. 208

**Full Citation (APA 7):**
Cialdini, R. B. (2001). *Influence: Science and practice* (4th ed.). Allyn and Bacon.

### Key Numerical Values

| Metric | Value | Source |
|--------|-------|--------|
| Obedience rate (max voltage) | 65% | Milgram (1963) |
| Voltage administered (mean) | 405V of 450V | Milgram (1963) |
| Authority proximity effect | 62.5% (proximal) vs 20.5% (remote) | Milgram (1965) |
| Expert endorsement persuasion boost | +28% conversion | Cialdini (2001) |
| Institutional legitimacy threshold | 3+ credibility signals | Fogg (2003) |
| Cross-cultural replication rate | 61-85% obedience | Blass (1999) |

## Behavioral Levels

| Value | Label | Behaviors |
|-------|-------|-----------|
| 0.0-0.2 | Very Low | Actively distrusts authority-based appeals; ignores expert badges and certifications; seeks third-party verification before trusting claims; may experience psychological reactance against authoritative messaging; questions "official" sources; prefers peer reviews over expert endorsements; skeptical of institutional logos and seals |
| 0.2-0.4 | Low | Notices authority signals but doesn't weight them heavily; verifies expert credentials independently; cross-references claims with multiple sources; moderately skeptical of "as seen on" endorsements; prefers user-generated content over expert opinions; may ignore premium badges or verification checkmarks |
| 0.4-0.6 | Moderate | Balances authority with personal judgment; trusts credentialed experts in their domain; influenced by relevant professional endorsements; notices but doesn't automatically trust institutional seals; checks if expert testimonials are contextually appropriate; standard weighting of authority signals |
| 0.6-0.8 | High | Strongly influenced by authority signals; readily trusts expert endorsements without verification; prioritizes content with professional badges; follows official recommendations closely; trusts "doctor recommended" or "expert approved" labels; less likely to question institutional guidance; assumes credentialed sources are accurate |
| 0.8-1.0 | Very High | Unquestioningly follows authority-based appeals; automatically trusts content with any authority signal; prioritizes official sources over personal experience; follows platform recommendations without evaluation; susceptible to fake authority badges; rarely questions expert consensus; may dismiss contradictory evidence from non-authoritative sources |

## Web/UI Behavioral Patterns

### High Authority Sensitivity (0.8+)

- **Trust Signals**: Immediately converts when seeing security badges, expert endorsements, or institutional logos
- **Content Hierarchy**: Prioritizes "expert picks" or "editor's choice" over user ratings
- **Form Completion**: Follows instructions marked "required" without questioning necessity
- **Navigation**: Uses "recommended path" or "most popular" suggestions
- **Error Recovery**: Follows suggested solutions from "support team" without exploring alternatives
- **Purchase Decisions**: Strongly influenced by "As seen in Forbes/NYT" endorsements
- **Information Architecture**: Trusts curated content sections over search results

### Low Authority Sensitivity (0.2-)

- **Trust Signals**: Skeptical of badges; may view them as marketing rather than credibility
- **Content Hierarchy**: Prefers raw user reviews and peer opinions over expert curation
- **Form Completion**: Questions required fields; may abandon forms with excessive mandatory inputs
- **Navigation**: Explores independently; ignores "suggested" or "recommended" paths
- **Error Recovery**: Searches for community solutions over official support documentation
- **Purchase Decisions**: Cross-references claims on independent review sites
- **Information Architecture**: Prefers unfiltered, chronological content over curated selections

## Estimated Trait Correlations

> *Correlation estimates are derived from related research findings and theoretical models. Empirical calibration is planned ([GitHub #95](https://github.com/alexandriashai/cbrowser/issues/95)).*

| Correlated Trait | Correlation | Mechanism |
|------------------|-------------|-----------|
| Trust Calibration | r = 0.38 | Both involve credibility assessment |
| Risk Tolerance | r = -0.31 | High authority sensitivity reduces perceived risk |
| Self-Efficacy | r = -0.25 | Lower self-efficacy increases reliance on experts |
| Social Proof Sensitivity | r = 0.42 | Both involve external validation seeking |
| Satisficing | r = 0.33 | Authority provides efficient decision shortcut |

## Persona Values

| Persona | Value | Rationale |
|---------|-------|-----------|
| Busy Parent (Pat) | 0.65 | Time pressure increases reliance on trusted authorities |
| Tech-Savvy Teen (Taylor) | 0.30 | Digital natives are more skeptical of institutional authority |
| Senior User (Sam) | 0.75 | Generational respect for expertise and institutions |
| Impatient Professional (Alex) | 0.55 | Values expert shortcuts but maintains professional skepticism |
| Cautious Newcomer (Casey) | 0.70 | Uncertainty increases reliance on authoritative guidance |
| Accessibility User (Jordan) | 0.60 | Trusts official accessibility standards and recommendations |
| Power User (Riley) | 0.25 | Self-reliant; trusts personal expertise over external authority |

## Design Implications

### For High Authority Sensitivity Users

- Display professional certifications and credentials prominently
- Include expert endorsements near conversion points
- Show institutional affiliations and partnerships
- Use official-looking security badges and trust seals
- Provide clear, authoritative instructions and recommendations

### For Low Authority Sensitivity Users

- Prioritize peer reviews and user-generated content
- Show raw data and allow independent verification
- Avoid overuse of badges (may trigger reactance)
- Provide transparency about endorsement relationships
- Enable community-driven content hierarchies

## See Also

- [Social Proof Sensitivity](./Trait-SocialProofSensitivity.md) - Peer-based influence
- [Trust Calibration](./Trait-TrustCalibration.md) - Credibility assessment processes
- [Self-Efficacy](./Trait-SelfEfficacy.md) - Confidence in personal judgment
- [FOMO](./Trait-FOMO.md) - External pressure responsiveness
- [Trait Index](./Trait-Index.md) - All cognitive traits

## Bibliography

Blass, T. (1999). The Milgram paradigm after 35 years: Some things we now know about obedience to authority. *Journal of Applied Social Psychology, 29*(5), 955-978.

Cialdini, R. B. (2001). *Influence: Science and practice* (4th ed.). Allyn and Bacon.

Fogg, B. J. (2003). *Persuasive technology: Using computers to change what we think and do*. Morgan Kaufmann.

Milgram, S. (1963). Behavioral study of obedience. *Journal of Abnormal and Social Psychology, 67*(4), 371-378. https://doi.org/10.1037/h0040525

Milgram, S. (1965). Some conditions of obedience and disobedience to authority. *Human Relations, 18*(1), 57-76.

Milgram, S. (1974). *Obedience to authority: An experimental view*. Harper & Row.
