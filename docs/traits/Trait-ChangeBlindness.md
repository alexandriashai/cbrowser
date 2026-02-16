> **This documentation is no longer maintained here.**
>
> For the latest version, please visit: **[Change Blindness](https://cbrowser.ai/docs/Trait-ChangeBlindness)**

---

# Change Blindness

**Category**: Tier 5 - Perception Traits
**Scale**: 0.0 (low susceptibility) to 1.0 (high susceptibility)

## Definition

Change Blindness is the perceptual phenomenon where users fail to notice significant visual changes in a scene or interface, particularly when those changes occur during visual disruptions such as page loads, modal transitions, eye movements, or attention shifts. In web and UI contexts, this trait determines how likely users are to miss important updates, error states, navigation changes, or newly appearing content. Users with high change blindness are more susceptible to overlooking critical interface modifications, while those with low change blindness maintain better situational awareness of dynamic content changes.

## Research Foundation

### Primary Citation

> "We found that about half of the observers failed to notice a gorilla that walked through the scene, even though it was visible for 5 seconds. This suggests that without attention, even salient events can go completely unnoticed."
> — Simons, D. J., & Chabris, C. F., 1999, p. 1059

**Full Citation (APA 7):**
Simons, D. J., & Chabris, C. F. (1999). Gorillas in our midst: Sustained inattentional blindness for dynamic events. *Perception*, 28(9), 1059-1074.

**DOI**: https://doi.org/10.1068/p281059

### Supporting Research

> "The failure to see changes that occur during visual disruptions is remarkably common, even when observers are looking directly at the changing object."
> — Rensink, R. A., O'Regan, J. K., & Clark, J. J., 1997, p. 368

**Full Citation (APA 7):**
Rensink, R. A., O'Regan, J. K., & Clark, J. J. (1997). To see or not to see: The need for attention to perceive changes in scenes. *Psychological Science*, 8(5), 368-373.

**DOI**: https://doi.org/10.1111/j.1467-9280.1997.tb00427.x

### Key Numerical Values

| Metric | Value | Source |
|--------|-------|--------|
| Gorilla detection rate | 44% noticed | Simons & Chabris (1999) |
| Inattentional blindness rate | 46% miss unexpected objects | Simons & Chabris (1999) |
| Change detection with flicker | 40-60% detection rate | Rensink et al. (1997) |
| Detection time (central interest) | 4-8 seconds average | Rensink et al. (1997) |
| Detection time (marginal interest) | 12-24 seconds average | Rensink et al. (1997) |
| "Person swap" detection | 50% failed to notice | Simons & Levin (1998) |
| Web notification miss rate | 23-45% of users | DiVita et al. (2004) |

## Behavioral Levels

| Value | Label | Behaviors |
|-------|-------|-----------|
| 0.0-0.2 | Very Low | Immediately notices toast notifications, error messages, and status changes; catches subtle UI updates during page transitions; detects when form fields are auto-populated or modified; notices navigation breadcrumb updates; catches loading spinners and progress indicators; quickly identifies new badges or notification counts |
| 0.2-0.4 | Low | Notices most interface changes within 2-3 seconds; occasionally misses peripheral notifications but catches central updates; detects error states and warning banners reliably; notices when modal content changes; catches most form validation feedback; aware of sidebar or panel state changes |
| 0.4-0.6 | Moderate | Misses approximately 30-40% of non-central changes; frequently overlooks toast messages in corner positions; may not notice header updates during scrolling; sometimes misses inline form validation until submission fails; partial awareness of tab content changes; may miss loading states that complete quickly |
| 0.6-0.8 | High | Frequently misses status updates and notifications (50-60%); often unaware when page content refreshes automatically; misses error messages that disappear on timer; fails to notice shopping cart count updates; overlooks changed button states (enabled/disabled); misses success confirmations after form submissions |
| 0.8-1.0 | Very High | Fails to notice most interface changes unless directly cued; completely misses timed notifications and toasts; unaware of background data refreshes; does not notice when forms reset after errors; misses navigation state changes entirely; requires explicit confirmation dialogs to acknowledge any change; frequently confused by wizard progress that advances without apparent cause |

## Web/UI Manifestations

### Common Scenarios Where Change Blindness Affects Users

**Page Load Transitions**
- User clicks link, page loads new content, but user keeps looking at same area expecting old content
- AJAX updates complete silently, user continues interacting with stale data
- Lazy-loaded images or content appear without user awareness

**Modal and Overlay Changes**
- Error message appears in modal while user focuses on form fields
- Modal content updates (e.g., confirmation step) without user noticing the change
- Overlay dismissal happens, but user doesn't realize underlying page changed

**Notification Failures**
- Toast notifications appear and auto-dismiss before user notices
- Badge counts increment on navigation items without detection
- Alert banners appear at top of page while user scrolls below

**Form State Changes**
- Validation errors appear inline but are scrolled out of view
- Submit button becomes disabled/enabled without user awareness
- Form fields auto-populate or clear without detection

**E-commerce Specific**
- Cart item counts update without user noticing
- Price changes during session go undetected
- Stock status changes ("In Stock" to "Out of Stock") are missed

## Estimated Trait Correlations

> *Correlation estimates are derived from related research findings and theoretical models. Empirical calibration is planned ([GitHub #95](https://github.com/alexandriashai/cbrowser/issues/95)).*

| Related Trait | Correlation | Mechanism |
|---------------|-------------|-----------|
| Working Memory | r = -0.38 | Lower working memory reduces capacity for change monitoring |
| Patience | r = -0.25 | Impatient users miss changes during rapid navigation |
| Reading Tendency | r = -0.31 | Low readers scan less, miss peripheral changes |
| Metacognitive Planning | r = -0.29 | Poor planners less likely to monitor for expected changes |
| Interrupt Recovery | r = 0.42 | High change blindness makes recovery from interruptions harder |

## Design Implications

### For High Change Blindness Users

- Use animation and motion to draw attention to changes
- Implement persistent notifications rather than auto-dismissing toasts
- Require explicit acknowledgment for critical state changes
- Position important updates in current focus area, not periphery
- Use contrasting colors and visual weight for changed elements
- Add sound or haptic feedback for important notifications
- Implement "change highlighting" that persists for 3-5 seconds

### For Low Change Blindness Users

- Subtle animations are sufficient for notification
- Brief toast messages are acceptable
- Can rely on peripheral awareness for secondary updates
- Standard notification patterns work effectively

## Persona Values

| Persona | Value | Rationale |
|---------|-------|-----------|
| Rushing Rachel | 0.75 | Time pressure and rapid scanning increases change blindness |
| Careful Carlos | 0.25 | Methodical verification catches most changes |
| Distracted Dave | 0.85 | Frequent attention shifts and multitasking maximize blindness |
| Senior Sam | 0.70 | Age-related attention narrowing increases susceptibility |
| Focused Fiona | 0.30 | Concentrated attention reduces change blindness |
| Anxious Annie | 0.55 | Anxiety narrows attention but heightens vigilance for threats |
| Mobile Mike | 0.65 | Small screens and multitasking increase blindness |
| Power User Pete | 0.35 | Familiarity with patterns helps detect unexpected changes |

## Measurement Approaches

### Experimental Paradigms

1. **Flicker paradigm**: Alternating between original and modified images with blank screen
2. **Mudsplash paradigm**: Brief visual disruption concurrent with change
3. **Cut paradigm**: Changes during simulated "camera cuts" or page transitions
4. **Gradual change paradigm**: Slow, continuous modifications over time

### Web-Specific Metrics

- Time to notice toast notification
- Detection rate for inline validation errors
- Response to badge count increments
- Awareness of auto-refresh events

## See Also

- [Mental Model Rigidity](./Trait-MentalModelRigidity.md) - Related perceptual limitation
- [Working Memory](./Trait-WorkingMemory.md) - Capacity constraint that affects change detection
- [Reading Tendency](./Trait-ReadingTendency.md) - Scanning patterns affect peripheral awareness
- [Trait Index](./Trait-Index.md) - Complete trait listing
- [Distracted Dave](../personas/Persona-DistractedDave) - High change blindness persona

## Bibliography

DiVita, J., Obermayer, R., Nugent, W., & Linville, J. M. (2004). Verification of the change blindness phenomenon while managing critical events on a combat information display. *Human Factors*, 46(2), 205-218. https://doi.org/10.1518/hfes.46.2.205.37340

Levin, D. T., & Simons, D. J. (1997). Failure to detect changes to attended objects in motion pictures. *Psychonomic Bulletin & Review*, 4(4), 501-506. https://doi.org/10.3758/BF03214339

O'Regan, J. K., Rensink, R. A., & Clark, J. J. (1999). Change-blindness as a result of 'mudsplashes'. *Nature*, 398(6722), 34. https://doi.org/10.1038/17953

Rensink, R. A., O'Regan, J. K., & Clark, J. J. (1997). To see or not to see: The need for attention to perceive changes in scenes. *Psychological Science*, 8(5), 368-373. https://doi.org/10.1111/j.1467-9280.1997.tb00427.x

Simons, D. J., & Chabris, C. F. (1999). Gorillas in our midst: Sustained inattentional blindness for dynamic events. *Perception*, 28(9), 1059-1074. https://doi.org/10.1068/p281059

Simons, D. J., & Levin, D. T. (1998). Failure to detect changes to people during a real-world interaction. *Psychonomic Bulletin & Review*, 5(4), 644-649. https://doi.org/10.3758/BF03208840

Varakin, D. A., Levin, D. T., & Fidler, R. (2004). Unseen and unaware: Implications of recent research on failures of visual awareness for human-computer interface design. *Human-Computer Interaction*, 19(4), 389-422. https://doi.org/10.1207/s15327051hci1904_5
