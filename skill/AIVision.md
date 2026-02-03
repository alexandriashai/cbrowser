# AI Vision Element Detection

## How It Works

CBrowser uses AI to understand page structure and find elements using natural language descriptions instead of brittle CSS selectors.

---

## Selector Modes

### 1. Natural Language (Default)

Describe what you want to interact with in plain English:

```bash
bun run Tools/CBrowser.ts click "the blue login button"
bun run Tools/CBrowser.ts fill "email input field" "user@example.com"
bun run Tools/CBrowser.ts click "the third product card"
```

**How it works:**
1. Takes screenshot of current page
2. Uses Claude's vision to identify the described element
3. Returns element reference for interaction
4. Falls back to accessibility tree if vision fails

### 2. Visual Mode (`visual:`)

Explicitly use visual recognition:

```bash
bun run Tools/CBrowser.ts click "visual:red button in the header"
bun run Tools/CBrowser.ts click "visual:shopping cart icon"
```

**Best for:**
- Elements with distinctive visual appearance
- Icons without text labels
- Buttons with specific colors
- Elements in specific screen regions

### 3. Accessibility Mode (`aria:`)

Use ARIA roles and labels:

```bash
bun run Tools/CBrowser.ts click "aria:button/Submit"
bun run Tools/CBrowser.ts fill "aria:textbox/Email" "user@example.com"
```

**Syntax:** `aria:role/name`

**Common roles:**
- `button`, `link`, `textbox`, `checkbox`
- `combobox`, `listbox`, `menu`, `menuitem`
- `tab`, `tabpanel`, `dialog`, `alert`

### 4. Semantic Mode (`semantic:`)

Find elements by their semantic purpose:

```bash
bun run Tools/CBrowser.ts fill "semantic:email" "user@example.com"
bun run Tools/CBrowser.ts fill "semantic:password" "secret123"
bun run Tools/CBrowser.ts click "semantic:submit"
```

**Semantic types:**
- `email`, `password`, `username`, `phone`
- `search`, `submit`, `cancel`, `close`
- `navigation`, `main`, `footer`, `header`

### 5. Fallback CSS (`css:`)

When you know the exact selector:

```bash
bun run Tools/CBrowser.ts click "css:#login-btn"
bun run Tools/CBrowser.ts fill "css:input[name='email']" "user@example.com"
```

**Use only when:**
- You control the page and selectors are stable
- AI methods fail for edge cases
- Performance is critical (no AI overhead)

---

## Resolution Strategy

CBrowser attempts selectors in this order:

```
1. Natural Language / Visual AI
   ↓ (fails)
2. Accessibility Tree (ARIA)
   ↓ (fails)
3. Semantic Detection
   ↓ (fails)
4. CSS Fallback (if provided)
   ↓ (fails)
5. Screenshot + Ask User
```

Each successful resolution is cached for future use on the same site.

---

## Self-Healing Selectors

When a previously working selector fails:

1. **Detection:** Element not found at expected location
2. **Screenshot:** Capture current page state
3. **Analysis:** Compare to last known good state
4. **Resolution:** Use AI to find element's new location
5. **Update:** Cache new selector mapping
6. **Retry:** Execute action with updated selector
7. **Report:** If still fails, show visual diff to user

---

## Confidence Scores

Every AI selection includes a confidence score:

```json
{
  "selector": "visual:blue login button",
  "resolved": "button.btn-primary[type='submit']",
  "confidence": 0.95,
  "alternatives": [
    {"selector": "button.btn-secondary", "confidence": 0.72}
  ]
}
```

**Thresholds:**
- `> 0.90`: Auto-execute
- `0.70 - 0.90`: Execute with warning in log
- `< 0.70`: Pause and ask user to confirm

---

## Caching

Selector resolutions are cached in:
```
~/.claude/skills/CBrowser/.memory/selectors/
├── example.com.json
├── github.com.json
└── ...
```

Cache format:
```json
{
  "site": "example.com",
  "mappings": [
    {
      "natural": "blue login button",
      "resolved": "button.btn-primary[type='submit']",
      "lastUsed": "2026-01-31T22:30:00Z",
      "successCount": 15,
      "failCount": 0
    }
  ]
}
```

**Cache invalidation:**
- After 3 consecutive failures for a selector
- When page structure changes significantly
- Manual: `bun run Tools/CBrowser.ts cache clear`

---

## Best Practices

### DO:
- Start with natural language descriptions
- Be specific: "the blue Submit button" not just "the button"
- Include location hints: "login button in the header"
- Use semantic mode for common form fields

### DON'T:
- Jump straight to CSS selectors
- Use overly complex descriptions
- Rely on element order ("the first button")
- Ignore confidence warnings
