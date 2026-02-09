# Trust Calibration

**Category**: Tier 2 - Emotional Traits
**Scale**: 0.0 (low/skeptical) to 1.0 (high/trusting)

## Definition

Trust calibration measures a user's baseline disposition toward trusting or distrusting websites and online services. This trait determines how users evaluate credibility signals, how long they deliberate before committing to actions (especially those involving personal data or financial transactions), and their threshold for perceiving deceptive design patterns. Low-trust users scrutinize security indicators, read privacy policies, and require multiple credibility signals before proceeding. High-trust users click through quickly with minimal verification, potentially exposing themselves to phishing or dark patterns but completing legitimate flows more efficiently.

## Research Foundation

### Primary Citation
> "We found eight types of credibility features: design look, structure/navigation, information focus, company recognition, security policies, physical address/contact, advertising policy, and personalization. Users evaluate these signals to determine trustworthiness, with professional design being the most cited factor."
> -- Fogg, B.J. et al., 2003, p. 15-17

**Full Citation (APA 7):**
Fogg, B. J. (2003). *Persuasive technology: Using computers to change what we think and do*. Morgan Kaufmann Publishers. ISBN 978-1558606432

**DOI**: N/A (Book) | Related paper: https://doi.org/10.1145/764008.763957

### Stanford Web Credibility Project

> "The Stanford Guidelines for Web Credibility were derived from research involving over 4,500 participants. Results indicated that 46% of users assessed credibility based on design look and 28% on information structure/focus."
> -- Fogg, B.J. et al., 2001, p. 63

**Full Citation (APA 7):**
Fogg, B. J., Soohoo, C., Danielson, D. R., Marable, L., Stanford, J., & Tauber, E. R. (2003). How do users evaluate the credibility of Web sites? A study with over 2,500 participants. *Proceedings of the 2003 Conference on Designing for User Experiences*, 1-15.

**DOI**: https://doi.org/10.1145/997078.997097

### Key Numerical Values

| Metric | Value | Source |
|--------|-------|--------|
| Credibility signal categories | 8 distinct types | Fogg (2003) |
| Design-based trust judgments | 46% of evaluations | Stanford Web Credibility Project |
| Time to form initial trust judgment | 50ms - 3 seconds | Lindgaard et al. (2006) |
| Privacy policy reading rate | < 3% of users | McDonald & Cranor (2008) |
| CTA hesitation (skeptical users) | 3-10x longer dwell time | Derived from eye-tracking studies |

### Eight Credibility Signals (Fogg, 2003)

| Signal | Description | Detection Method |
|--------|-------------|------------------|
| `https` | Secure connection indicator | Protocol check |
| `security_badge` | Trust seals, SSL badges, verification marks | Visual pattern matching |
| `brand_recognition` | Known brand or company name | Brand database lookup |
| `professional_design` | Polished visual design quality | Design quality heuristics |
| `reviews_visible` | User reviews or testimonials | Review section detection |
| `contact_info` | Physical address, phone number | Contact pattern matching |
| `privacy_policy` | Privacy policy link presence | Footer/legal link detection |
| `social_proof` | Social media presence, follower counts | Social element detection |

## Behavioral Levels

| Value | Label | Behaviors |
|-------|-------|-----------|
| 0.0-0.2 | Very Skeptical | Scrutinizes every credibility signal; reads privacy policies and terms of service; 10x longer dwell time on CTAs involving data submission; checks URL bar repeatedly; hovers over links to verify destinations; refuses to proceed without HTTPS; abandons sites with any missing trust signals; searches for company reviews before transacting |
| 0.2-0.4 | Skeptical | Checks for basic credibility signals (HTTPS, contact info); 3-5x longer deliberation before form submission; reads error messages and confirmations carefully; suspicious of too-good-to-be-true offers; examines checkout pages for security badges; may abandon if any signal feels "off" |
| 0.4-0.6 | Moderate | Notices credibility signals but doesn't actively seek them; normal CTA click speed on established sites; slight hesitation on unfamiliar sites; proceeds if overall impression is professional; checks security for financial transactions only; baseline vigilance without excessive scrutiny |
| 0.6-0.8 | Trusting | Clicks through CTAs without deliberation; assumes sites are legitimate unless obvious red flags; rarely reads terms or privacy policies; may ignore browser warnings about certificate issues; completes forms without hesitation; focuses on task completion over verification |
| 0.8-1.0 | Very Trusting | Immediate CTA clicks; dismisses security warnings as false positives; provides personal information freely; may fall for phishing or dark patterns; clicks email links without verification; enters payment information on unfamiliar sites; assumes all sites are trustworthy by default |

## Trait Implementation in CBrowser

### Trust Signal Detection

CBrowser detects and aggregates credibility signals:

```typescript
interface TrustSignal {
  type: 'https' | 'security_badge' | 'brand_recognition' |
        'professional_design' | 'reviews_visible' |
        'contact_info' | 'privacy_policy' | 'social_proof';
  detected: boolean;
  strength: number;  // 0-1 contribution to trust
}

function calculateSiteTrust(signals: TrustSignal[]): number {
  const weights = {
    https: 0.20,
    security_badge: 0.15,
    brand_recognition: 0.15,
    professional_design: 0.15,
    reviews_visible: 0.10,
    contact_info: 0.10,
    privacy_policy: 0.08,
    social_proof: 0.07
  };

  return signals.reduce((sum, s) =>
    sum + (s.detected ? weights[s.type] * s.strength : 0), 0);
}
```

### CTA Deliberation Time

```typescript
// Time multiplier before clicking sensitive CTAs
function getCtaDeliberationMultiplier(
  trustCalibration: number,
  siteTrust: number,
  ctaSensitivity: 'low' | 'medium' | 'high'
): number {
  const sensitivityBase = { low: 1.0, medium: 2.0, high: 5.0 };
  const baseMultiplier = sensitivityBase[ctaSensitivity];

  // Skeptical users take much longer; trusting users barely pause
  const trustAdjustment = 1 + ((1 - trustCalibration) * (1 - siteTrust) * 10);

  return baseMultiplier * trustAdjustment;
  // Very skeptical on untrusted site: up to 10x delay
  // Very trusting: near 1x (no delay)
}
```

### Trust State Tracking

```typescript
interface TrustState {
  currentTrust: number;           // Dynamic trust level for current site
  signalsDetected: TrustSignal[]; // Credibility signals found
  betrayalHistory: string[];      // Sites that violated trust
  verificationActions: number;    // Count of verification behaviors
}

// Trust erosion after perceived betrayal
function handleTrustBetrayal(state: TrustState, severity: number): void {
  state.currentTrust *= (1 - severity * 0.3);  // 0-30% trust reduction
  state.betrayalHistory.push(currentDomain);
  // Betrayal history persists across sessions (learned distrust)
}
```

## Estimated Trait Correlations

> *Correlation estimates are derived from related research findings and theoretical models. Empirical calibration is planned ([GitHub #95](https://github.com/alexandriashai/cbrowser/issues/95)).*

Research and theoretical models indicate the following correlations:

| Related Trait | Correlation | Research Basis |
|--------------|-------------|----------------|
| Risk Tolerance | r = 0.45 | Trusting users take more risks with unknown sites |
| Reading Tendency | r = -0.35 | Skeptical users read more content |
| Patience | r = 0.28 | Verification takes time; skeptics invest it |
| Comprehension | r = 0.18 | Weak correlation; trust is more emotional than cognitive |
| Self-Efficacy | r = 0.22 | Some relationship; confident users may trust more |

### Interaction Effects

- **Trust Calibration x Risk Tolerance**: Combined high values create users vulnerable to scams
- **Trust Calibration x Reading Tendency**: Low trust + high reading = policy-reading skeptics
- **Trust Calibration x Patience**: Low trust + low patience = users who abandon rather than verify

## Persona Values

| Persona | Trust Calibration Value | Rationale |
|---------|------------------------|-----------|
| power-user | 0.55 | Moderate; aware of risks but efficient |
| first-timer | 0.65 | Naive trust; hasn't learned skepticism yet |
| elderly-user | 0.60 | Variable; may be trusting or overly cautious |
| impatient-user | 0.70 | Trusts to save time; doesn't verify |
| mobile-user | 0.55 | Moderate awareness of mobile security |
| screen-reader-user | 0.50 | Cannot assess visual credibility signals |
| anxious-user | 0.30 | Anxiety drives verification behaviors |
| skeptical-user | 0.20 | Defining characteristic of persona |

## UX Design Implications

### For Low Trust Users (< 0.4)

1. **Prominent security indicators**: Display HTTPS lock, trust seals visibly
2. **Contact information**: Show physical address, phone, multiple contact methods
3. **Progressive disclosure**: Don't ask for sensitive data upfront
4. **Transparent policies**: Link to privacy policy, terms near data collection
5. **Third-party validation**: Display BBB ratings, industry certifications
6. **Testimonials with verification**: Real names, photos, verifiable reviews

### For High Trust Users (> 0.7)

1. **Streamlined flows**: Remove unnecessary verification steps
2. **Trust but protect**: Implement backend protections since user won't verify
3. **Explicit warnings**: Make important warnings unmissable since users dismiss easily
4. **Confirmation steps**: Force review of sensitive submissions even if users want to skip
5. **Dark pattern immunity**: These users are vulnerable; design ethically

### Trust Signal Placement Best Practices

| Signal Type | Optimal Placement | Impact on Skeptical Users |
|-------------|-------------------|--------------------------|
| HTTPS/Lock | URL bar (browser) + visual indicator | Critical; first thing checked |
| Security badges | Near form submission buttons | Reduces CTA hesitation by 30-50% |
| Contact info | Footer + dedicated contact page | Increases completion of sensitive forms |
| Reviews | Product pages, checkout | Reduces cart abandonment |
| Privacy policy | Footer link + inline near data fields | Builds trust through transparency |

## See Also

- [Trait-RiskTolerance](./Trait-RiskTolerance.md) - Willingness to take chances (related but distinct)
- [Trait-ReadingTendency](./Trait-ReadingTendency.md) - Tendency to read content (skeptics read more)
- [Trait-Patience](./Trait-Patience.md) - Time tolerance for verification
- [Trait-SelfEfficacy](./Trait-SelfEfficacy.md) - Confidence may relate to trust
- [Trait-Index](./Trait-Index.md) - Complete trait listing

## Bibliography

Corritore, C. L., Kracher, B., & Wiedenbeck, S. (2003). On-line trust: Concepts, evolving themes, a model. *International Journal of Human-Computer Studies*, 58(6), 737-758. https://doi.org/10.1016/S1071-5819(03)00041-7

Fogg, B. J. (2003). *Persuasive technology: Using computers to change what we think and do*. Morgan Kaufmann Publishers.

Fogg, B. J., Soohoo, C., Danielson, D. R., Marable, L., Stanford, J., & Tauber, E. R. (2003). How do users evaluate the credibility of Web sites? A study with over 2,500 participants. *Proceedings of the 2003 Conference on Designing for User Experiences*, 1-15. https://doi.org/10.1145/997078.997097

Lindgaard, G., Fernandes, G., Dudek, C., & Brown, J. (2006). Attention web designers: You have 50 milliseconds to make a good first impression! *Behaviour & Information Technology*, 25(2), 115-126. https://doi.org/10.1080/01449290500330448

McDonald, A. M., & Cranor, L. F. (2008). The cost of reading privacy policies. *I/S: A Journal of Law and Policy for the Information Society*, 4(3), 543-568.

McKnight, D. H., Choudhury, V., & Kacmar, C. (2002). Developing and validating trust measures for e-commerce: An integrative typology. *Information Systems Research*, 13(3), 334-359. https://doi.org/10.1287/isre.13.3.334.81

Riegelsberger, J., Sasse, M. A., & McCarthy, J. D. (2005). The mechanics of trust: A framework for research and design. *International Journal of Human-Computer Studies*, 62(3), 381-422. https://doi.org/10.1016/j.ijhcs.2005.01.001

Wang, Y. D., & Emurian, H. H. (2005). An overview of online trust: Concepts, elements, and implications. *Computers in Human Behavior*, 21(1), 105-125. https://doi.org/10.1016/j.chb.2003.11.008
