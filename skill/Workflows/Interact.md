# Interact Workflow

AI-guided interactions with page elements using natural language.

---

## Trigger

- "click", "fill", "submit", "type"
- "interact with", "select", "toggle"
- `bun run Tools/CBrowser.ts <action> <target>`

---

## Process

```
┌─────────────────────────────────────────────────────────────┐
│                    INTERACT WORKFLOW                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. UNDERSTAND                                              │
│     ├─ Parse action (click, fill, etc.)                     │
│     ├─ Parse target (natural language or selector)          │
│     └─ Parse value (for fill/type actions)                  │
│                                                             │
│  2. LOCATE                                                  │
│     ├─ Screenshot current page                              │
│     ├─ AI vision: find element matching description         │
│     ├─ Get element reference                                │
│     └─ Fallback: accessibility tree → CSS                   │
│                                                             │
│  3. CLASSIFY                                                │
│     ├─ Determine action zone (Green/Yellow/Red)             │
│     ├─ Red Zone: Pause for verification                     │
│     └─ Log action details                                   │
│                                                             │
│  4. EXECUTE                                                 │
│     ├─ Perform the action                                   │
│     ├─ Wait for response                                    │
│     └─ Handle any dialogs/popups                            │
│                                                             │
│  5. VERIFY                                                  │
│     ├─ Screenshot after action                              │
│     ├─ Confirm expected result                              │
│     └─ Report success or failure                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Actions

### Click

```bash
# Natural language
bun run Tools/CBrowser.ts click "the blue login button"
bun run Tools/CBrowser.ts click "Submit Order button"

# With modifiers
bun run Tools/CBrowser.ts click "link" --modifier ctrl  # New tab
bun run Tools/CBrowser.ts click "item" --modifier shift  # Select range

# Double/triple click
bun run Tools/CBrowser.ts dblclick "text to select"
bun run Tools/CBrowser.ts tripleclick "paragraph to select"
```

### Fill

```bash
# Fill input field
bun run Tools/CBrowser.ts fill "email field" "user@example.com"
bun run Tools/CBrowser.ts fill "semantic:password" "secret123"

# Fill with credential
bun run Tools/CBrowser.ts fill "username" --cred github.username
bun run Tools/CBrowser.ts fill "password" --cred github.password
```

### Type

```bash
# Type with realistic delay (simulates human typing)
bun run Tools/CBrowser.ts type "search box" "search query"

# Type with specific delay
bun run Tools/CBrowser.ts type "input" "text" --delay 100ms
```

### Select

```bash
# Dropdown selection
bun run Tools/CBrowser.ts select "country dropdown" "United States"
bun run Tools/CBrowser.ts select "aria:combobox/Size" "Large"
```

### Toggle

```bash
# Checkbox/switch
bun run Tools/CBrowser.ts toggle "remember me checkbox"
bun run Tools/CBrowser.ts toggle "newsletter switch" --state on
bun run Tools/CBrowser.ts toggle "notifications" --state off
```

### Hover

```bash
# Hover to reveal tooltip or dropdown
bun run Tools/CBrowser.ts hover "account menu"
bun run Tools/CBrowser.ts hover "info icon"
```

### Scroll

```bash
# Scroll to element
bun run Tools/CBrowser.ts scroll-to "footer"
bun run Tools/CBrowser.ts scroll-to "product reviews section"

# Scroll direction
bun run Tools/CBrowser.ts scroll down 500
bun run Tools/CBrowser.ts scroll up 200
```

### Drag

```bash
# Drag and drop
bun run Tools/CBrowser.ts drag "item 1" "drop zone"
bun run Tools/CBrowser.ts drag "slider handle" --offset-x 100
```

### Upload

```bash
# File upload
bun run Tools/CBrowser.ts upload "file input" "/path/to/file.jpg"
bun run Tools/CBrowser.ts upload "drag drop zone" "/path/to/files/"
```

---

## Zone Classification

| Action | Zone | Notes |
|--------|------|-------|
| Click (navigation) | Green | Regular links |
| Click (button) | Yellow | Non-destructive buttons |
| Click (delete/remove) | Red | Destructive actions |
| Fill (non-sensitive) | Yellow | Regular form fields |
| Fill (password/PII) | Yellow | Logged but value hidden |
| Submit form | Red | Verification required |
| Toggle | Yellow | Preferences |
| Select | Yellow | Dropdown choices |
| Upload | Yellow | Files (logged) |

---

## Persona-Aware Interactions

When running with a persona, interactions simulate their behavior:

### Power User
```yaml
click_speed: immediate
typing_speed: fast (20ms delay)
uses_keyboard: true
expects_feedback: immediate
```

### First-Timer
```yaml
click_speed: slow (500ms hesitation)
typing_speed: slow (100ms delay)
hovers_first: true
reads_labels: true
```

### Mobile User
```yaml
action: tap (not click)
tap_precision: center of element
scrolls_to_view: true
avoids_hover: true
```

### Screen Reader User
```yaml
navigation: keyboard only
reads_labels: true
uses_tab: true
expects_announcements: true
```

---

## Error Handling

### Element Not Found

```
❌ Element not found: "blue submit button"

AI Analysis:
  - No blue buttons found on page
  - Found green "Submit" button - is this correct?
  - Screenshot: /tmp/cognitive/xxx/element-search.png

Options:
  1. Try: bun run Tools/CBrowser.ts click "green submit button"
  2. View screenshot and provide new description
```

### Element Not Interactable

```
⚠️ Element not interactable: "disabled button"

Reason: Element is disabled
Current state: disabled="true"

Options:
  1. Wait for element to become enabled
  2. Check if precondition needed (login, form fill)
```

### Multiple Matches

```
⚠️ Multiple elements match: "Add to Cart"

Found 3 matching elements:
  1. Product 1: "Add to Cart" (visible)
  2. Product 2: "Add to Cart" (visible)
  3. Product 3: "Add to Cart" (below fold)

Be more specific:
  - "Add to Cart button for Product 1"
  - "first Add to Cart button"
  - "Add to Cart in hero section"
```

---

## Form Fill Sequences

Fill entire forms with a single command:

```bash
bun run Tools/CBrowser.ts fill-form "registration" \
  --data '{"email": "user@example.com", "name": "Test User"}'
```

Or use persona defaults:

```bash
bun run Tools/CBrowser.ts fill-form "registration" --persona provider-signup
# Uses test data from persona definition
```

---

## Keyboard Shortcuts

```bash
# Send keyboard shortcuts
bun run Tools/CBrowser.ts key "ctrl+s"  # Save
bun run Tools/CBrowser.ts key "escape"  # Close modal
bun run Tools/CBrowser.ts key "tab tab enter"  # Navigate and submit
```

---

## Constitutional Compliance

Interactions follow constitutional principles:

- **Politeness**: 1-2 second delays between rapid actions
- **Verification**: Red zone actions pause for confirmation
- **Privacy**: Passwords never logged, only "***" in audit trail
- **Fallback**: If uncertain about element, ask user

### Audit Trail

```json
{
  "action": "fill",
  "target": "semantic:password",
  "target_resolved": "input#password",
  "value": "***REDACTED***",
  "zone": "yellow",
  "timestamp": "2026-01-31T22:30:00Z",
  "result": "success",
  "screenshot_before": "/tmp/cognitive/xxx/005-before.png",
  "screenshot_after": "/tmp/cognitive/xxx/005-after.png"
}
```
