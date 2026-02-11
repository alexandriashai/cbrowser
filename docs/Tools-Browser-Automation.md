# Browser Automation Tools

**Tell the browser what you want. Let AI figure out how.**

These 12 tools handle navigation, clicking, form filling, data extraction, and page analysis. They replace brittle CSS selectors with natural language descriptions that survive DOM changes.

---

## When to Use These Tools

- **You're automating a workflow** and tired of tests breaking when developers change class names
- **You need to extract data** from pages without writing custom scrapers for each site
- **You're building an AI agent** that needs to interact with arbitrary websites
- **Your selectors keep failing** and you want something that self-heals

---

## Tools

### `navigate`

**What it does**: Opens a URL and takes a screenshot of the loaded page.

**Why you'd use it**: Start any browser automation session or move between pages.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | The URL to navigate to |

**Example**:
```json
{
  "url": "https://example.com/products"
}
```

---

### `click`

**What it does**: Clicks an element using text content, CSS selector, or natural language description.

**Why you'd use it**: Interact with buttons, links, or any clickable element without fragile selectors.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | Yes | What to click — text, CSS selector, or description like "the blue submit button" |
| `force` | boolean | No | Bypass constitutional safety checks for destructive actions |
| `verbose` | boolean | No | Return available elements and AI suggestions on failure |

**Example**:
```json
{
  "selector": "Add to Cart"
}
```

Or with natural language:
```json
{
  "selector": "the primary call-to-action button in the hero section"
}
```

---

### `smart_click`

**What it does**: Clicks with automatic retry and self-healing selectors. If the original selector fails, it finds the element by intent.

**Why you'd use it**: When elements might not be immediately available or when you want resilience against DOM changes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | Yes | Element to click |
| `maxRetries` | number | No | Maximum retry attempts. Default: 3 |
| `dismissOverlays` | boolean | No | Automatically dismiss popups before clicking. Default: false |

**Example**:
```json
{
  "selector": "Submit Order",
  "dismissOverlays": true
}
```

**Note**: v11.8.0 added confidence gating — only reports success if the healed selector has ≥60% confidence.

---

### `fill`

**What it does**: Types text into a form field identified by name, label, or description.

**Why you'd use it**: Fill out forms without knowing the exact input names or IDs.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | Yes | The field to fill — label text, name attribute, or description |
| `value` | string | Yes | Text to type into the field |
| `clear` | boolean | No | Clear existing content before typing. Default: true |

**Example**:
```json
{
  "selector": "Email address",
  "value": "user@example.com"
}
```

---

### `scroll`

**What it does**: Scrolls the page in a specified direction or to a specific position.

**Why you'd use it**: Reveal content below the fold, trigger lazy loading, or reach elements not yet visible.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `direction` | string | Yes | `up`, `down`, `top`, `bottom`, or pixel amount like `500px` |

**Example**:
```json
{
  "direction": "down"
}
```

---

### `screenshot`

**What it does**: Captures the current page as an image.

**Why you'd use it**: Document state, debug failures, or feed visual information to AI.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fullPage` | boolean | No | Capture entire scrollable page. Default: false (viewport only) |
| `path` | string | No | Save to file path instead of returning base64 |

**Example**:
```json
{
  "fullPage": true
}
```

---

### `extract`

**What it does**: Pulls structured data from the page — links, headings, forms, images, or arbitrary text.

**Why you'd use it**: Scrape content, analyze page structure, or gather data for further processing.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | Yes | What to extract: `links`, `headings`, `forms`, `images`, `text`, or `all` |
| `selector` | string | No | Limit extraction to elements matching this selector |

**Example**:
```json
{
  "type": "links"
}
```

Returns structured JSON with all links, their text, and href values.

---

### `find_element_by_intent`

**What it does**: Uses AI to find elements by semantic description. Returns the best match with confidence score and accessibility information.

**Why you'd use it**: When you need to find something but don't know exactly how it's implemented — "the navigation menu" or "the search box in the header".

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `intent` | string | Yes | Natural language description of the element |
| `context` | string | No | Additional context to narrow the search |

**Example**:
```json
{
  "intent": "the main call-to-action button",
  "context": "in the pricing section"
}
```

**Returns**: Selector, confidence score (0-1), accessibility score, and alternative matches.

**Note**: v7.4.17 added ARIA-first strategy — prioritizes `aria-label`, `role`, semantic HTML before falling back to classes/IDs.

---

### `analyze_page`

**What it does**: Examines page structure and returns inventory of interactive elements — forms, buttons, links, inputs.

**Why you'd use it**: Understand what's on a page before deciding what to interact with. Essential for building adaptive agents.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `detailed` | boolean | No | Include element attributes and positions. Default: false |

**Example**:
```json
{
  "detailed": true
}
```

---

### `assert`

**What it does**: Verifies a condition using natural language and returns pass/fail with explanation.

**Why you'd use it**: Validate that actions had the expected result without writing complex assertion logic.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `condition` | string | Yes | What to check, in plain English |

**Example**:
```json
{
  "condition": "the shopping cart shows 2 items"
}
```

**Returns**: `{ "passed": true/false, "reason": "explanation" }`

---

### `dismiss_overlay`

**What it does**: Detects and closes modal overlays — cookie consent banners, newsletter popups, age verification gates.

**Why you'd use it**: Clear blocking UI before interacting with the actual page content.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | No | Overlay type: `auto`, `cookie`, `age-verify`, `newsletter`, `custom`. Default: `auto` |
| `customSelector` | string | No | Selector for custom overlay close button |

**Example**:
```json
{
  "type": "auto"
}
```

**Note**: Constitutional Yellow zone — logged but proceeds automatically.

---

### `ask_user`

**What it does**: Creates a structured prompt to ask the human operator a question with predefined options.

**Why you'd use it**: When the automation needs human input to proceed — confirmation, selection, or decision that can't be automated.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `question` | string | Yes | The question to ask |
| `options` | array | No | Predefined answer options |
| `allowFreeform` | boolean | No | Allow typed response. Default: true |

**Example**:
```json
{
  "question": "Which shipping method should I select?",
  "options": ["Standard (5-7 days)", "Express (2-3 days)", "Overnight"]
}
```

---

## How Self-Healing Works

When a selector fails, CBrowser:

1. **Checks the healing cache** for previously learned mappings
2. **Analyzes the page** for elements matching the semantic intent
3. **Scores candidates** by text similarity, position, and accessibility attributes
4. **Returns the best match** if confidence exceeds 60%
5. **Caches the mapping** for faster future lookups

This means your automation adapts to site changes automatically. A redesign that moves the "Add to Cart" button? CBrowser finds it by intent, not by its old CSS class.

---

## Related Documentation

- [Constitutional Safety](/docs/Constitutional-Safety/) — How CBrowser classifies action risk
- [Tools Overview](/docs/Tools-Overview/) — All tools by category
- [Examples](/docs/Examples/) — Real-world automation patterns

---

*Last updated: v17.6.0*
