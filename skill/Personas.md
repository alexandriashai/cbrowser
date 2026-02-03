# Personas System

Create and manage user personas for realistic, goal-driven browser automation and testing.

---

## What Are Personas?

Personas are simulated users with:
- **Demographics**: Age, tech-savviness, accessibility needs
- **Goals**: What they're trying to accomplish
- **Behaviors**: How they interact with interfaces
- **Limitations**: Constraints that affect their experience
- **Credentials**: Which accounts they use

```
┌─────────────────────────────────────────────────────────────┐
│                       PERSONA                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Demographics│  │   Goals     │  │  Behaviors  │         │
│  │ Age, Tech   │  │ Tasks to    │  │ Click speed │         │
│  │ Accessibility│ │ accomplish  │  │ Read time   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Limitations │  │ Credentials │  │  Context    │         │
│  │ Vision, Motor│ │ Accounts    │  │ Device, OS  │         │
│  │ Cognitive   │  │ to use      │  │ Network     │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Built-in Personas

### Power User

```yaml
name: power-user
description: "Tech-savvy user who knows shortcuts and expects efficiency"
demographics:
  age_range: "25-40"
  tech_level: expert
  device: desktop
behaviors:
  click_speed: fast
  read_time: minimal
  uses_keyboard: true
  expects_shortcuts: true
expectations:
  - Fast load times (<2s)
  - Keyboard navigation works
  - No unnecessary confirmations
  - Advanced features accessible
```

### First-Time User

```yaml
name: first-timer
description: "New user exploring the site for the first time"
demographics:
  age_range: "any"
  tech_level: beginner
  device: any
behaviors:
  click_speed: slow
  read_time: long
  hovers_before_click: true
  reads_tooltips: true
expectations:
  - Clear onboarding
  - Helpful tooltips
  - Obvious CTAs
  - Forgiving of mistakes
```

### Mobile User

```yaml
name: mobile-user
description: "User on smartphone with touch interface"
demographics:
  age_range: "18-45"
  tech_level: intermediate
  device: mobile
context:
  viewport: [375, 812]  # iPhone X
  touch: true
  network: 4g
behaviors:
  tap_accuracy: 44px_minimum  # Touch target size
  scrolls_frequently: true
  avoids_typing: true
expectations:
  - Touch-friendly buttons (44px+)
  - Mobile-optimized forms
  - Fast on slow network
  - No hover-dependent features
```

### Accessibility User (Screen Reader)

```yaml
name: screen-reader-user
description: "Blind user navigating with screen reader"
demographics:
  age_range: "any"
  tech_level: varies
  device: desktop
accessibility:
  vision: blind
  uses_screen_reader: true
  keyboard_only: true
behaviors:
  navigates_by_headings: true
  uses_landmarks: true
  listens_to_alt_text: true
expectations:
  - Proper heading hierarchy
  - ARIA labels on controls
  - Alt text on images
  - Skip links available
  - Focus management correct
```

### Elderly User

```yaml
name: elderly-user
description: "Older adult with potential vision and motor limitations"
demographics:
  age_range: "65+"
  tech_level: beginner
  device: desktop
accessibility:
  vision: reduced
  motor: reduced_precision
  prefers_larger_text: true
behaviors:
  click_speed: slow
  double_clicks_accidentally: true
  read_time: long
  confused_by_jargon: true
expectations:
  - Large, clear text (16px+)
  - High contrast
  - Large click targets
  - Simple language
  - Clear error messages
```

### Impatient User

```yaml
name: impatient-user
description: "User who abandons slow or confusing experiences"
demographics:
  age_range: "any"
  tech_level: intermediate
  device: any
behaviors:
  abandons_after: 3s_load_time
  skips_long_forms: true
  ignores_long_text: true
  clicks_first_option: true
expectations:
  - Sub-3s load times
  - Short forms
  - Obvious next steps
  - Progress indicators
```

---

## Creating Custom Personas

```bash
bun run Tools/CBrowser.ts persona create "provider-signup"
```

Or create YAML directly:

```yaml
# ~/.claude/skills/CBrowser/.memory/personas/provider-signup.yaml
name: provider-signup
description: "Escort provider signing up for BlackBook Reviews"

demographics:
  age_range: "21-45"
  tech_level: intermediate
  device: mobile
  primary_goal: "Create verified profile quickly"

goals:
  primary: "Complete provider registration"
  secondary:
    - "Upload verification photos"
    - "Set up encrypted messaging"
    - "Configure availability"
  success_criteria:
    - "Profile created and pending verification"
    - "At least 3 photos uploaded"
    - "Bio completed"

behaviors:
  privacy_conscious: true
  reads_privacy_policy: true
  hesitates_on_pii: true
  prefers_anonymous_options: true

context:
  credentials: "provider-test-account"
  starting_url: "https://blackbook.reviews/register/provider"

limitations:
  - "May not have professional photos ready"
  - "Cautious about real name/identity"
  - "May use VPN (slower connection)"

test_scenarios:
  - "complete-registration"
  - "upload-photos"
  - "verify-identity"
```

---

## Commands

### List Personas

```bash
bun run Tools/CBrowser.ts persona list

# Output:
# Built-in Personas:
#   power-user          Tech-savvy expert user
#   first-timer         New user exploring
#   mobile-user         Smartphone user
#   screen-reader-user  Blind user with screen reader
#   elderly-user        Older adult with limitations
#   impatient-user      Quick to abandon
#
# Custom Personas:
#   provider-signup     Escort provider signing up
#   client-browsing     Client browsing profiles
```

### Create Persona

```bash
bun run Tools/CBrowser.ts persona create "name"
# Opens interactive wizard
```

### Use Persona

```bash
bun run Tools/CBrowser.ts navigate "https://example.com" --persona mobile-user
# Configures viewport, behaviors, expectations
```

### Run as Persona

```bash
bun run Tools/CBrowser.ts run-as "first-timer" --goal "complete signup"
# AI-driven exploration as the persona trying to achieve goal
```

---

## Persona-Driven Testing

### Goal-Based Execution

When running as a persona, CBrowser:

1. **Adopts the persona's constraints**
   - Sets viewport for device type
   - Enables accessibility tools if specified
   - Simulates network conditions

2. **Pursues the persona's goals**
   - AI understands what the persona is trying to do
   - Makes decisions as the persona would
   - Notes friction points and confusion

3. **Reports from persona's perspective**
   - "As a first-timer, the signup button was hard to find"
   - "As a mobile user, this button was too small to tap"
   - "As a screen reader user, this form had no labels"

### Example: Run Full Journey

```bash
bun run Tools/CBrowser.ts journey "provider-signup" \
  --start "https://blackbook.reviews" \
  --goal "Create a verified provider profile"
```

Output:
```
🎭 Running as: provider-signup
🎯 Goal: Create a verified provider profile

Step 1: Landing page
  ✅ Found "Become a Provider" CTA
  📝 Note: CTA prominent, good

Step 2: Registration form
  ⚠️ Hesitated at "Legal Name" field (privacy concern)
  ✅ Found "Display Name" option - continued
  📝 Note: Privacy options appreciated

Step 3: Photo upload
  ❌ BLOCKED: Upload button not working on mobile
  📝 Critical: Mobile users cannot upload photos

Journey Status: INCOMPLETE (blocked at step 3)
Friction Points: 1 critical, 0 warnings
```

---

## Integration with Test Scenarios

Personas are used in test scenarios (see `Workflows/Test.md`):

```yaml
scenario: "provider-onboarding"
persona: "provider-signup"
steps:
  - navigate: "/"
  - find_and_click: "provider signup CTA"
  - complete_form: "registration"
  - upload: "verification photos"
  - verify: "profile pending status"
```

---

## Storage

Personas stored in:
```
~/.claude/skills/CBrowser/.memory/personas/
├── _builtin/
│   ├── power-user.yaml
│   ├── first-timer.yaml
│   └── ...
└── custom/
    ├── provider-signup.yaml
    └── client-browsing.yaml
```
