# Finding Elements

## How It Works

Despite this file's name, CBrowser does not send screenshots to a vision model to find an element. `click`, `fill`, `hover` and the other interaction commands resolve a selector with a deterministic cascade of Playwright locators: text, placeholder, label, ARIA role and name, CSS, and a few attribute fallbacks. No API key is involved and no model is called.

A vision model is used in one place: a cognitive journey sends each step's screenshot to Claude unless you pass `--no-vision` (see `Workflows/CognitiveJourney.md`).

For "describe it in words" targeting, use the intent finder (`cbrowser ai find`, MCP `find_element_by_intent`). It is also deterministic.

---

## Selector Forms

### 1. Plain text (default)

Pass the element's visible text, label, placeholder or name:

```bash
cbrowser click "Sign in" --url "https://example.com"
cbrowser fill "Email" "user@example.com"
cbrowser click "Learn more"
```

What `click` tries, in order (`src/browser/element-finding.ts`, `findElement`):

1. The self-healing cache (see below)
2. Exact text match, then partial text match (with several matches it prefers non-sticky, shorter, exact ones)
3. Placeholder
4. Label
5. A button with that accessible name
6. The string as a CSS selector
7. `input[name=...]`, `input[type=...]`, `#id`, `textarea[name=...]`
8. A link with that accessible name
9. A fuzzy match over name, id, placeholder, type, aria-label and text of inputs, buttons and links
10. The same text, placeholder and role checks inside iframes

`fill` uses its own order that puts form fields first: `name`, `id`, `type`, placeholder, label (only when the label resolves to an input, textarea or select), `aria-label`, then a fuzzy match over fillable elements and iframes.

### 2. ARIA (`aria:`)

`aria:role/name` resolves through Playwright's `getByRole`:

```bash
cbrowser click "aria:button/Submit"
cbrowser fill "aria:textbox/Email" "user@example.com"
cbrowser click "aria:link/Learn more"
```

Common roles: `button`, `link`, `textbox`, `checkbox`, `combobox`, `listbox`, `menu`, `menuitem`, `tab`, `dialog`.

### 3. CSS (`css:`)

`css:` skips the cascade and uses the selector as written:

```bash
cbrowser click "css:#login-btn"
cbrowser fill "css:input[name='email']" "user@example.com"
```

Use it when you control the page and the selector is stable.

There is no `visual:` or `semantic:` prefix. A string starting with either is treated as plain text and will usually miss.

---

## Intent Finder

`ai find` and `ai click` take a description, parse it into scope, ordinal, kind and name, and walk a cascade of accessible-name locators. The result is a CSS selector verified to match exactly one element, plus a confidence that names the rung that matched (it is not a probability).

```bash
cbrowser navigate "https://example.com"
cbrowser ai find "learn more link"
# Selector: a[href="https://iana.org/help/example-domains"]
# Confidence: 95%
# Description: Exact match: Learn more
cbrowser ai click "sign up button in the header"
```

`ai` does not run inside the daemon; without one it reloads the last page you navigated to.

Confidence bands (from the `find_element_by_intent` description in `src/analysis/natural-language.ts`):

| Confidence | Meaning |
|-----------|---------|
| 0.95 | Unique match on the exact name, or a unique landmark ("header") |
| 0.88-0.92 | Unique synonym, label or placeholder, typed field, badge-count name, or a recognised logo, search, menu, theme or language control |
| 0.7-0.85 | Fuzzy: the name contains the phrase, or every word of it |
| 0.65 | Weak synonym (exit -> Close) |
| 0.6 | A guess: attributes, a word stem, or a sub-phrase |

Several equally good matches lower each rung and are listed in `alternatives`. The MCP tool also returns `visible` and `zone`; check both before clicking. The finder refuses to stretch a fuzzy match onto a destructive, financial or bulk action the description did not name: "account button" never reaches "Delete account".

Over MCP: `find_element_by_intent` (pass `verbose: true` on a miss to list visible links, buttons and fields with unique selectors).

---

## Self-Healing Selectors

Healing happens in `smart-click` (CLI), `smart_click` (MCP), and the click steps of `test-suite`. Plain `click` reads the cache but never writes to it.

When the first click misses, `smartClick` (`src/browser/self-healing.ts`):

1. Collects alternative selectors from the page, each with a confidence: id match 0.95, aria-label 0.9, title 0.85, text match 0.75-0.9, href 0.7
2. Retries the best ones, up to `--max-retries` attempts in all (default 3), waiting `--retry-delay` (default 1000 ms) between them
3. Counts a retry as a success only at confidence 0.8 or above, and only then caches the mapping
4. Stops at a red-zone refusal instead of retrying around it
5. When every attempt fails, lists the visible named clickables so you can rephrase

```bash
cbrowser smart-click "#learn-more-btn" --url "https://example.com"
#   Attempt 1: x #learn-more-btn
#   Attempt 2: ok Learn more (Text match: "Learn more")
# x Clicked element with low confidence (75%) - may not be the intended target
```

Read that output carefully: the retry below the 0.8 bar did click, but the command reports failure and nothing is cached. Check the page state before trying again.

---

## The Cache

Healed mappings live in one file, `<data dir>/selector-cache.json` (data dir: `CBROWSER_DATA_DIR`, default `~/.cbrowser`). Keys are `domain::selector`, lowercased, so "Login Button" and "login button" share an entry.

```json
{
  "version": 1,
  "entries": {
    "example.com::#cart-button": {
      "originalSelector": "#cart-button",
      "workingSelector": "css:[aria-label=\"Cart\"]",
      "domain": "example.com",
      "successCount": 15,
      "failCount": 0,
      "lastUsed": "2026-11-23T18:00:00.000Z",
      "reason": "Alternative found"
    }
  }
}
```

Every lookup tries the cached selector first. When it no longer matches, `failCount` goes up and the normal cascade runs. Entries are never evicted automatically.

```bash
cbrowser heal stats                     # totals and the most-healed selectors
cbrowser heal list --domain example.com # every mapping for one site
cbrowser heal test "#old-id" --url "https://example.com"
cbrowser heal clear --domain example.com
```

Over MCP: `heal_stats`.

---

## When a Click Misses

- `cbrowser click "<selector>" --verbose` lists the visible named elements and suggests one; add `--debug-dir <dir>` to save a screenshot with the candidates marked
- A stale cache entry can steer a click to the wrong element; `cbrowser heal clear --domain <domain>` resets it

---

## Best Practices

### Do
- Start with the visible text or label: "Sign in", "Email"
- Use `aria:role/name` when text alone is ambiguous
- Use `ai find` to get a unique selector, then click that selector
- Read `zone` and `visible` from `find_element_by_intent` before acting on it

### Don't
- Write `visual:` or `semantic:` prefixes; they do not exist
- Rely on DOM order ("the first button") when a name will do
- Treat a low-confidence smart-click as the intended target
