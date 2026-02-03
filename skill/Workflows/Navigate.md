# Navigate Workflow

Smart navigation with AI wait detection and session awareness.

---

## Trigger

- "navigate to", "go to", "open"
- URL provided directly
- `bun run Tools/CBrowser.ts navigate <url>`

---

## Process

```
┌─────────────────────────────────────────────────────────────┐
│                    NAVIGATE WORKFLOW                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. PREPARE                                                 │
│     ├─ Parse and validate URL                               │
│     ├─ Check for saved session for domain                   │
│     └─ Load session if exists                               │
│                                                             │
│  2. NAVIGATE                                                │
│     ├─ Use mcp__claude-in-chrome__navigate                  │
│     ├─ Wait for network idle                                │
│     └─ Handle redirects                                     │
│                                                             │
│  3. WAIT (AI-Powered)                                       │
│     ├─ Take screenshot                                      │
│     ├─ Detect loading indicators                            │
│     ├─ Wait for dynamic content                             │
│     └─ Timeout after 30s                                    │
│                                                             │
│  4. VERIFY                                                  │
│     ├─ Screenshot current state                             │
│     ├─ Check for error pages (404, 500)                     │
│     ├─ Verify expected content visible                      │
│     └─ Report any issues                                    │
│                                                             │
│  5. LOG                                                     │
│     ├─ Record in audit trail                                │
│     ├─ Save screenshot                                      │
│     └─ Update session timestamp                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## AI Wait Detection

Instead of fixed timeouts, CBrowser uses AI to detect when a page is ready:

### Detection Signals

| Signal | Indicates |
|--------|-----------|
| Spinners visible | Still loading |
| Skeleton screens | Content loading |
| "Loading..." text | Still loading |
| Progress bars | Still loading |
| Main content visible | Ready |
| Interactive elements enabled | Ready |

### Wait Strategy

```
1. Wait for network idle (no requests for 500ms)
2. Take screenshot
3. AI analysis: "Is this page fully loaded?"
4. If loading indicators found → wait 2s → retry
5. If max attempts (15) → proceed with warning
6. If ready → continue
```

---

## Error Handling

### Redirect Handling

```
Original URL → Redirect detected?
                    │
       ┌────────────┴────────────┐
       ↓                         ↓
   [Same domain]           [Different domain]
       │                         │
       ↓                         ↓
   [Follow]               [Verify: Red Zone]
                                 │
                          [Ask user if external]
```

### Error Pages

| Error | Action |
|-------|--------|
| 404 Not Found | Report, suggest alternatives |
| 500 Server Error | Report, offer retry |
| SSL Error | Report, do not proceed |
| Timeout | Report, offer retry with longer wait |
| CAPTCHA | Notify user, pause |

---

## Usage

### Basic Navigation

```bash
bun run Tools/CBrowser.ts navigate "https://example.com"
```

### With Session

```bash
# Load existing session and navigate
bun run Tools/CBrowser.ts session load "github-dev"
bun run Tools/CBrowser.ts navigate "https://github.com/settings"
```

### Navigate and Wait for Element

```bash
bun run Tools/CBrowser.ts navigate "https://example.com" --wait-for "main content area"
```

---

## Output

```
🌐 Navigating to https://example.com...
📸 Screenshot: /tmp/cognitive/session123/001-navigate.png
⏳ Waiting for page load...
✅ Page ready: "Example Domain"
📊 Load time: 1.2s | Requests: 12 | Size: 245KB
```

---

## Constitutional Compliance

This workflow is in the **Green Zone** (auto-execute):
- ✅ Navigation to URLs
- ✅ Reading page content
- ✅ Taking screenshots

No verification required for navigation itself.
