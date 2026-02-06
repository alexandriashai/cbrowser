# CBrowser Scoring Methodology & Research Sources

CBrowser's analysis features use **heuristic estimates** calibrated against published UX and accessibility research. This document explains our methodology, sources, and limitations.

---

## Important Disclaimers

> **Letter grades, not percentages.** We use letter grades (A-F) instead of percentage scores to avoid implying false precision. These are directional indicators, not measurements.

> **Heuristic estimates, not predictions.** Scores indicate relative comparison value, not actual user behavior predictions.

> **Not a substitute for real testing.** For accessibility, combine with automated WCAG checkers and user testing with people who have disabilities.

---

## Research Sources & Bibliography

### Page Load & Abandonment

| Metric | Threshold | Source |
|--------|-----------|--------|
| Mobile abandonment at 3s load | 53% | Google/SOASTA "The State of Online Retail Performance" (2017)¹ |
| Abandonment increase per second | +7% | Akamai "State of Online Retail Performance" (2017)² |

¹ *Google/SOASTA. "The State of Online Retail Performance." 2017. https://www.thinkwithgoogle.com/marketing-resources/data-measurement/mobile-page-speed-new-industry-benchmarks/*

² *Akamai. "Akamai Online Retail Performance Report: Milliseconds Are Critical." 2017.*

### Form Complexity & Cognitive Load

| Metric | Threshold | Source |
|--------|-----------|--------|
| Optimal form field count | 7-8 fields | Baymard Institute "Checkout Usability" (2024)³ |
| Average e-commerce checkout fields | 23 fields | Baymard Institute (2024)³ |
| Abandonment with too many steps | 67% | Baymard Institute Cart Abandonment Research⁴ |

³ *Baymard Institute. "The Current State of Checkout UX." 2024. https://baymard.com/checkout-usability*

⁴ *Baymard Institute. "49 Cart Abandonment Rate Statistics." https://baymard.com/lists/cart-abandonment-rate*

### Frustration Detection

| Metric | Definition | Source |
|--------|------------|--------|
| Rage click | 3+ clicks in 1-2 seconds | FullStory Rage Click definition⁵ |
| Average rage gesture rate | 6.5% of sessions | FullStory research (2023)⁵ |
| Dead click rate average | 8.1% of sessions | FullStory Digital Experience Benchmark (2023)⁵ |

⁵ *FullStory. "The Complete Guide to Rage Clicks." 2023. https://www.fullstory.com/blog/rage-clicks/*

### Usability Severity Scale

We calibrate severity levels to Nielsen's usability severity scale:

| Level | Nielsen Definition | CBrowser Mapping |
|-------|-------------------|------------------|
| 0 | Not a usability problem | (not flagged) |
| 1 | Cosmetic problem | Low severity |
| 2 | Minor usability problem | Medium severity |
| 3 | Major usability problem | High severity |
| 4 | Usability catastrophe | Critical severity |

⁶ *Nielsen, Jakob. "Severity Ratings for Usability Problems." Nielsen Norman Group. https://www.nngroup.com/articles/how-to-rate-the-severity-of-usability-problems/*

### Accessibility (WCAG)

| Metric | Threshold | Source |
|--------|-----------|--------|
| Sites with WCAG failures | 94.8% | WebAIM Million (2024)⁷ |
| Screen reader task completion | 55.6% | WebAIM Screen Reader User Survey (2024)⁸ |
| Touch target minimum | 44x44px | WCAG 2.5.5 (AAA) / 2.5.8 (AA)⁹ |
| Contrast ratio (normal text) | 4.5:1 | WCAG 1.4.3 (AA)⁹ |
| Contrast ratio (large text) | 3:1 | WCAG 1.4.3 (AA)⁹ |

⁷ *WebAIM. "The WebAIM Million." 2024. https://webaim.org/projects/million/*

⁸ *WebAIM. "Screen Reader User Survey #10." 2024. https://webaim.org/projects/screenreadersurvey10/*

⁹ *W3C. "Web Content Accessibility Guidelines (WCAG) 2.1." https://www.w3.org/TR/WCAG21/*

### Focus Hierarchies & Attention Patterns (v9.0.0)

| Pattern | Description | Source |
|---------|-------------|--------|
| F-pattern scanning | Users scan top horizontally, then left side vertically | Nielsen Norman Group¹⁰ |
| Banner blindness | Users ignore banner-like elements (~90% ignore rate) | Nielsen Norman Group¹¹ |
| Search usage | ~30% of users prefer search as first action | Nielsen Norman Group¹² |
| Miller's Law | Users can hold 7±2 items in working memory | Miller (1956)¹³ |

**Distraction Ignore Rates (Heuristic Estimates)**

| Element Type | Ignore Rate | Rationale |
|--------------|-------------|-----------|
| Cookie banners | 85% | Cookie consent fatigue |
| Newsletter popups | 90% | Subscription blindness |
| Chat widgets | 80% | Help widget blindness (unless stuck) |
| Social share buttons | 80% | Social widget blindness |
| Promotional banners | 85% | Ad blindness generalization |

*These ignore rates are heuristic estimates based on banner blindness research patterns, not precise measurements.*

**Focus Area Priorities (by Task Type)**

| Task Type | Primary Focus Areas | Secondary Focus Areas |
|-----------|---------------------|----------------------|
| find_information | Headings (95%), Navigation (85%), Search (75%) | Content (70%), CTAs (50%) |
| complete_action | CTAs (95%), Forms (90%), Navigation (80%) | Headings (60%), Content (50%) |
| explore | Hero (85%), Headings (80%), Navigation (75%) | Content (70%), Images (60%) |
| compare | Content (90%), Headings (85%), Navigation (70%) | CTAs (60%), Images (50%) |
| troubleshoot | Search (90%), Navigation (85%), Content (80%) | Headings (75%), Forms (60%) |

*Priority percentages are heuristic weights for simulation, derived from eye-tracking research patterns.*

¹⁰ *Nielsen, Jakob. "F-Shaped Pattern For Reading Web Content." Nielsen Norman Group. 2006. https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/*

¹¹ *Nielsen, Jakob. "Banner Blindness: Old and New Findings." Nielsen Norman Group. 2007. https://www.nngroup.com/articles/banner-blindness-old-and-new-findings/*

¹² *Nielsen, Jakob. "Search: Visible and Simple." Nielsen Norman Group. 2001. https://www.nngroup.com/articles/search-visible-and-simple/*

¹³ *Miller, George A. "The Magical Number Seven, Plus or Minus Two." Psychological Review. 1956.*

---

## Scoring Algorithms

### Competitive UX Benchmark

**Abandonment Risk Grade**

Grades based on accumulated friction, mapped to research thresholds:

| Grade | Risk Level | Interpretation |
|-------|------------|----------------|
| A | ≤15% | Very low abandonment risk |
| B | ≤30% | Low risk |
| C | ≤50% | Moderate risk (typical) |
| D | ≤70% | High risk |
| F | >70% | Very high risk |

*Formula:*
```
Risk = (100 - patience) × 0.4 + frustration × 0.3 + confusion × 0.3
```

Weights are heuristic, not derived from specific studies. The formula is designed to weight patience depletion most heavily, as research shows patience exhaustion correlates strongly with abandonment.

### Agent-Ready Audit

**Severity Penalties**

| Severity | Points Deducted | Rationale |
|----------|-----------------|-----------|
| Critical | 25 | ~Nielsen Level 4: blocks task completion |
| High | 15 | ~Nielsen Level 3: major obstacle |
| Medium | 8 | ~Nielsen Level 2: minor problem |
| Low | 3 | ~Nielsen Level 1: cosmetic issue |

**Category Weights**

| Category | Weight | Rationale |
|----------|--------|-----------|
| Findability | 35% | Most critical for AI agents |
| Stability | 30% | Selector reliability |
| Accessibility | 20% | ARIA provides semantic context |
| Semantics | 15% | HTML structure aids parsing |

*These weights are heuristic estimates based on typical AI agent interaction patterns, not derived from specific studies.*

### Accessibility Empathy Audit

**Barrier Severity Deductions**

| Severity | Points | Rationale |
|----------|--------|-----------|
| Critical | 20 | Blocks task for affected users |
| Major | 10 | Significant difficulty |
| Minor | 3 | Noticeable but manageable |

**Empathy Grade Thresholds**

| Grade | Score Range |
|-------|-------------|
| A | ≥80 |
| B | ≥65 |
| C | ≥50 |
| D | ≥35 |
| F | <35 |

---

## Limitations

### What These Scores Are

- **Directional indicators** for comparing options
- **Heuristic flags** for potential issues
- **Starting points** for investigation

### What These Scores Are NOT

- **Predictions** of actual user behavior
- **Guarantees** of accessibility compliance
- **Substitutes** for real user testing
- **Precise measurements** (hence letter grades)

### Recommended Complementary Testing

For comprehensive validation, combine CBrowser analysis with:

1. **Automated WCAG testing:** axe-core, WAVE, Lighthouse
2. **Manual accessibility review:** Keyboard navigation, screen reader testing
3. **User testing:** With actual users who have disabilities
4. **Analytics:** Real user monitoring, session replay analysis
5. **A/B testing:** For conversion-critical flows

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 9.0.0 | 2026-02-06 | Added Focus Hierarchies research section |
| | | Added distraction ignore rate heuristics |
| | | Added focus area priorities by task type |
| | | Added Miller's Law and attention pattern citations |
| 8.0.0 | 2026-02-06 | Initial methodology documentation |
| | | Added letter grades to avoid false precision |
| | | Added research bibliography with citations |
| | | Added disclaimers to all report outputs |

---

## Contributing

If you find additional research that could improve our calibration, please open an issue or PR with:

1. The metric being updated
2. The new threshold/value
3. Citation to peer-reviewed or industry-recognized research
4. Explanation of methodology

---

*Generated by CBrowser v9.0.0*
