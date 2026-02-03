# AI Vision Selectors

CBrowser uses AI to find elements on pages using natural language descriptions instead of brittle CSS selectors.

## Selector Modes

| Mode | Syntax | Example |
|------|--------|---------|
| Natural Language | `"description"` | `click "the main navigation menu"` |
| Visual | `visual:description` | `click "visual:red button in header"` |
| Accessibility | `aria:role/name` | `click "aria:button/Submit"` |
| Semantic | `semantic:type` | `fill "semantic:email" "user@example.com"` |
| Fallback CSS | `css:selector` | `click "css:#login-btn"` |

---

## Natural Language Selectors

The default mode. Describe what you want to interact with:

```bash
# Buttons
click "the login button"
click "submit button at the bottom"
click "blue primary action button"

# Forms
fill "email input" "user@example.com"
fill "the password field" "secret123"
fill "search box in the header" "query"

# Links
click "the about us link"
click "learn more link in the footer"

# Complex descriptions
click "the third product in the list"
click "the checkbox next to 'I agree to terms'"
```

---

## Visual Selectors

Use visual descriptions when elements lack good text or accessibility labels:

```bash
click "visual:red button in the top right corner"
click "visual:shopping cart icon"
click "visual:hamburger menu icon"
click "visual:profile avatar image"
```

---

## Accessibility Selectors

Use ARIA roles and names for reliable selection:

```bash
click "aria:button/Submit"
click "aria:link/Home"
click "aria:textbox/Email"
click "aria:checkbox/Remember me"
```

---

## Semantic Selectors

Use semantic types for common form elements:

```bash
fill "semantic:email" "user@example.com"
fill "semantic:password" "secret123"
fill "semantic:search" "query"
fill "semantic:phone" "555-1234"
```

---

## Self-Healing Selectors

When a selector fails, CBrowser:

1. **Checks the cache** for known working alternatives
2. **Generates alternatives** (text variants, ARIA roles, attributes)
3. **Tries each alternative** with configurable retries
4. **Caches the working selector** for future use

```bash
# View cache statistics
npx cbrowser heal-stats

# Clear the cache
npx cbrowser heal-clear
```

---

## Best Practices

1. **Start with natural language** - it's the most readable
2. **Use accessibility selectors** for critical paths (more stable)
3. **Add visual descriptions** for icon-only buttons
4. **Avoid CSS selectors** unless absolutely necessary
5. **Let self-healing work** - don't fight selector changes
