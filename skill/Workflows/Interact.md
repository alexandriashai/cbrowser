# Interact Workflow

AI-guided interactions with elements.

## Triggers

- "click", "tap", "press"
- "fill", "type", "enter"
- "select", "choose"
- "scroll", "swipe"

## Commands

### Click

```bash
npx cbrowser click "the login button"
npx cbrowser smart-click "Submit" --max-retries 5
npx cbrowser click "aria:button/Continue"
```

### Fill

```bash
npx cbrowser fill "email input" "user@example.com"
npx cbrowser fill "semantic:password" "secret123"
```

### Select

```bash
npx cbrowser select "Medium" from "size dropdown"
```

### Scroll

```bash
npx cbrowser scroll down
npx cbrowser scroll up 3 times
npx cbrowser scroll to "footer"
```

### Press Key

```bash
npx cbrowser press Enter
npx cbrowser press Tab
npx cbrowser press "Control+A"
```

## Smart Click

The `smart-click` command includes:

1. **Self-healing** - Tries alternative selectors
2. **Auto-retry** - Configurable retries
3. **AI suggestions** - Hints if all fails

```bash
npx cbrowser smart-click "Submit" --max-retries 3
```

## Options

| Option | Description |
|--------|-------------|
| `--url URL` | Navigate first |
| `--max-retries N` | Retry attempts |
| `--force` | Bypass safety checks |
