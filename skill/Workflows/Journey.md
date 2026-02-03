# Journey Workflow

Run complete user journeys with personas pursuing goals autonomously.

---

## Trigger

- "journey", "user journey", "flow"
- "run as persona", "simulate user"
- `bun run Tools/CBrowser.ts journey <persona> --goal <goal>`

---

## What is a Journey?

A journey is an **autonomous, goal-driven exploration** where:
- A persona with specific characteristics
- Tries to accomplish a goal
- Makes decisions as that persona would
- Reports on friction, confusion, and success

Unlike test scenarios (scripted steps), journeys are **AI-driven** and discover the path themselves.

---

## Process

```
┌─────────────────────────────────────────────────────────────┐
│                    JOURNEY WORKFLOW                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. ADOPT PERSONA                                           │
│     ├─ Load persona configuration                           │
│     ├─ Configure browser (viewport, network)                │
│     ├─ Load credentials if specified                        │
│     └─ Set behavioral parameters                            │
│                                                             │
│  2. UNDERSTAND GOAL                                         │
│     ├─ Parse the goal statement                             │
│     ├─ Identify success criteria                            │
│     └─ Plan initial approach                                │
│                                                             │
│  3. EXPLORE & ACT                                           │
│     Loop until goal reached or stuck:                       │
│     ├─ Screenshot current state                             │
│     ├─ AI: "What would this persona do next?"               │
│     ├─ Execute action                                       │
│     ├─ Evaluate result                                      │
│     ├─ Note any friction/confusion                          │
│     └─ Check if goal reached                                │
│                                                             │
│  4. REPORT                                                  │
│     ├─ Journey complete or blocked?                         │
│     ├─ Steps taken                                          │
│     ├─ Friction points discovered                           │
│     ├─ Time and effort metrics                              │
│     └─ Recommendations                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Commands

### Basic Journey

```bash
bun run Tools/CBrowser.ts journey "first-timer" \
  --start "https://blackbook.reviews" \
  --goal "Find and view a provider profile"
```

### With Credentials

```bash
bun run Tools/CBrowser.ts journey "provider-signup" \
  --start "https://blackbook.reviews" \
  --goal "Complete registration and reach dashboard" \
  --auth provider-test
```

### Recording Journey

```bash
bun run Tools/CBrowser.ts journey "mobile-user" \
  --start "https://blackbook.reviews" \
  --goal "Submit a review" \
  --record  # Creates video/gif of journey
```

---

## Persona Decision Making

The AI makes decisions as the persona would:

### Power User
```
Current page: Homepage
Goal: Find account settings

Thinking as power-user:
  - "I expect settings in the account menu"
  - "Looking for gear icon or avatar menu"
  - "Will try keyboard shortcut if available"

Action: Click avatar in header → Opens dropdown → Click "Settings"
Time: 2.1s
```

### First-Timer
```
Current page: Homepage
Goal: Find account settings

Thinking as first-timer:
  - "Where are my settings?"
  - "Maybe in the menu... which menu?"
  - "Let me look around first..."

Action: Hover various elements → Read tooltips → Find avatar → Click → Read options → Click "Settings"
Time: 12.4s
Friction: Took 6x longer than power user
```

### Mobile User
```
Current page: Homepage (mobile)
Goal: Find account settings

Thinking as mobile-user:
  - "Looking for hamburger menu"
  - "Or maybe bottom navigation"
  - "Can't use hover on mobile"

Action: Tap hamburger → Scroll menu → Tap "Account" → Tap "Settings"
Time: 5.2s
Note: Menu required scrolling on mobile
```

---

## Journey Output

### Real-Time Progress

```
🎭 Journey: first-timer
🎯 Goal: Complete provider registration

Step 1: Landing page (0.0s)
  📍 At: https://blackbook.reviews
  🤔 Looking for: registration option
  👆 Action: Scrolling to explore page

Step 2: Finding signup (3.2s)
  📍 At: https://blackbook.reviews
  ✅ Found: "Become a Provider" button in hero
  👆 Action: Clicking signup button

Step 3: Registration form (5.1s)
  📍 At: https://blackbook.reviews/register/provider
  🤔 Reading form fields...
  📝 Filling: email, display name, password

Step 4: Password trouble (8.4s)
  ⚠️ Friction: Password rejected, no requirements shown
  🤔 Trying different password...
  ✅ Password accepted on second try

Step 5: Terms acceptance (12.2s)
  📍 Scrolling to terms
  👆 Action: Checking terms checkbox
  👆 Action: Clicking Submit

Step 6: Success! (15.8s)
  📍 At: https://blackbook.reviews/provider/onboarding
  ✅ Goal reached: Registration complete

─────────────────────────────────────────
📊 Journey Complete
   Duration: 15.8s
   Steps: 6
   Friction points: 1
   Status: SUCCESS
```

### Journey Report

```markdown
# Journey Report: Provider Registration

**Persona:** first-timer
**Goal:** Complete provider registration
**Result:** ✅ SUCCESS

## Summary

| Metric | Value |
|--------|-------|
| Duration | 15.8s |
| Steps | 6 |
| Friction Points | 1 |
| Errors Encountered | 1 |
| Recovery Success | Yes |

## Path Taken

1. **Landing Page** → Scrolled to find CTA
2. **Clicked "Become a Provider"** → Navigated to registration
3. **Filled Registration Form** → Hit password validation error
4. **Retried Password** → Success
5. **Accepted Terms** → Submitted form
6. **Reached Onboarding** → Goal complete

## Friction Points

### 1. Password Requirements Hidden (Severity: Medium)

**What happened:** Password was rejected without prior indication of requirements.

**Persona perspective:** "I had to guess what password format was needed. Frustrating for a first-time user."

**Recommendation:** Display password requirements inline before user types.

**Screenshot:** [View friction point](./screenshots/friction-001.png)

## Accessibility Notes

- All form fields had proper labels ✅
- Error messages were announced to screen readers ✅
- Submit button was keyboard accessible ✅

## Recommendations

1. Show password requirements proactively
2. Consider password strength meter
3. Pre-fill display name from email if possible

---
*Generated by CBrowser Journey Workflow*
*Date: 2026-01-31 22:30:00*
```

---

## Multiple Personas

Run the same journey with different personas to compare:

```bash
bun run Tools/CBrowser.ts journey compare \
  --personas "first-timer,power-user,mobile-user,elderly-user" \
  --start "https://blackbook.reviews" \
  --goal "Complete provider registration"
```

Output:
```
📊 Journey Comparison: Complete provider registration

| Persona       | Duration | Steps | Friction | Result   |
|---------------|----------|-------|----------|----------|
| power-user    | 8.2s     | 4     | 0        | ✅ Success |
| first-timer   | 15.8s    | 6     | 1        | ✅ Success |
| mobile-user   | 22.4s    | 8     | 2        | ✅ Success |
| elderly-user  | 45.2s    | 12    | 3        | ✅ Success |

Key Findings:
- Mobile: Upload button too small for touch
- Elderly: Text too small in terms section
- First-timer: Password requirements unclear
```

---

## Stuck Detection

If the persona gets stuck:

```
⚠️ Persona appears stuck

Current state: Registration form
Attempting: Find submit button
Problem: No visible submit button

AI Analysis:
  - Submit button may be below fold
  - Form may have validation errors
  - Page may be broken

Actions tried:
  1. Scrolled down - no button found
  2. Checked for validation errors - none visible
  3. Tried keyboard submit - no response

Options:
  1. Screenshot current state and report
  2. Try alternative approach
  3. Ask for human guidance
```

---

## Constitutional Compliance

Journeys follow all constitutional principles:

- **Red Zone actions**: AI pauses for confirmation
- **Authentication**: Uses stored credentials, never prompts
- **Privacy**: PII in forms is never logged
- **Politeness**: Realistic delays between actions

### Audit Trail

Every journey is fully logged:
```
~/.claude/skills/CBrowser/.memory/journeys/
├── 2026-01-31/
│   ├── first-timer-registration-22-30-00.json
│   ├── screenshots/
│   └── report.md
```
