# Extract Workflow

Intelligent data extraction from web pages using AI understanding.

---

## Trigger

- "extract", "get data", "scrape"
- "pull information", "grab content"

---

## Invocation Methods

### Option 1: Local Tool (Primary)
```bash
bun run ~/.claude/skills/CBrowser/Tools/CBrowser.ts extract "all product names"
```

### Option 2: CLI (Fallback)
```bash
npx cbrowser extract "https://example.com" --selector "all product names"
```

### Option 3: MCP (Alternative - when MCP server is running)
```
mcp__claude_ai_CBrowser_Demo__extract(url: "https://example.com", selector: "all product names")
```

---

## Process

```
┌─────────────────────────────────────────────────────────────┐
│                    EXTRACT WORKFLOW                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. UNDERSTAND REQUEST                                      │
│     ├─ What data is needed?                                 │
│     ├─ What format is expected?                             │
│     └─ Any filtering/transformation?                        │
│                                                             │
│  2. ANALYZE PAGE                                            │
│     ├─ Screenshot and AI analysis                           │
│     ├─ Identify data regions                                │
│     ├─ Understand page structure                            │
│     └─ Detect pagination/infinite scroll                    │
│                                                             │
│  3. EXTRACT                                                 │
│     ├─ Use AI to locate data elements                       │
│     ├─ Extract text/attributes                              │
│     ├─ Handle dynamic content                               │
│     └─ Navigate pagination if needed                        │
│                                                             │
│  4. TRANSFORM                                               │
│     ├─ Clean and normalize data                             │
│     ├─ Apply requested transformations                      │
│     └─ Format output (JSON, CSV, etc.)                      │
│                                                             │
│  5. VALIDATE                                                │
│     ├─ Verify data completeness                             │
│     ├─ Check for extraction errors                          │
│     └─ Report any issues                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Commands

### Simple Extraction

```bash
# Extract with natural language
bun run Tools/CBrowser.ts extract "all product names and prices"
bun run Tools/CBrowser.ts extract "the article content"
bun run Tools/CBrowser.ts extract "contact information"
```

### Structured Extraction

```bash
# Extract to specific format
bun run Tools/CBrowser.ts extract "products" --format json
bun run Tools/CBrowser.ts extract "table data" --format csv
bun run Tools/CBrowser.ts extract "article" --format markdown
```

### Schema-Based Extraction

```bash
# Extract with schema definition
bun run Tools/CBrowser.ts extract --schema product.yaml
```

Schema file:
```yaml
# product.yaml
name: product
selector: ".product-card"
fields:
  title:
    selector: ".product-title"
    type: text
  price:
    selector: ".price"
    type: number
    transform: strip_currency
  image:
    selector: "img"
    attribute: src
  rating:
    selector: ".stars"
    type: number
    extract: star_count
  reviews:
    selector: ".review-count"
    type: number
    regex: "(\d+) reviews"
```

---

## Extraction Types

### Text Content

```bash
bun run Tools/CBrowser.ts extract text "main article"
# Returns plain text content
```

### Structured Data

```bash
bun run Tools/CBrowser.ts extract "all products" --format json

# Output:
[
  {"name": "Product 1", "price": 29.99, "rating": 4.5},
  {"name": "Product 2", "price": 49.99, "rating": 4.2}
]
```

### Table Data

```bash
bun run Tools/CBrowser.ts extract table "pricing table"

# Auto-detects table structure and extracts to structured format
```

### Links

```bash
bun run Tools/CBrowser.ts extract links "navigation menu"

# Returns:
[
  {"text": "Home", "href": "/"},
  {"text": "Products", "href": "/products"},
  {"text": "About", "href": "/about"}
]
```

### Images

```bash
bun run Tools/CBrowser.ts extract images "product gallery"

# Returns:
[
  {"src": "...", "alt": "Product front view", "width": 800, "height": 600},
  {"src": "...", "alt": "Product side view", "width": 800, "height": 600}
]
```

---

## Multi-Page Extraction

### Pagination

```bash
bun run Tools/CBrowser.ts extract "all products" --paginate --max-pages 10
```

Pagination detection:
- "Next" button
- Page numbers
- "Load more" button
- Infinite scroll

### Following Links

```bash
bun run Tools/CBrowser.ts extract "product details" --follow-links ".product-link"
```

---

## AI-Powered Extraction

When selectors are unreliable, use AI understanding:

```bash
bun run Tools/CBrowser.ts extract-ai "Find all prices on this page and tell me the cheapest option"
```

The AI:
1. Screenshots the page
2. Analyzes visually
3. Extracts relevant data
4. Provides answer with reasoning

---

## Transformations

Apply transformations during extraction:

```yaml
transform:
  price:
    - strip_currency     # "$29.99" → 29.99
    - to_number
  date:
    - parse_date         # "Jan 31, 2026" → "2026-01-31"
  phone:
    - normalize_phone    # "(555) 123-4567" → "+15551234567"
  text:
    - trim
    - lowercase
    - remove_html
```

---

## Output Formats

### JSON (default)

```bash
bun run Tools/CBrowser.ts extract "products" --format json
```

### CSV

```bash
bun run Tools/CBrowser.ts extract "products" --format csv > products.csv
```

### Markdown

```bash
bun run Tools/CBrowser.ts extract "article" --format markdown
```

### Raw HTML

```bash
bun run Tools/CBrowser.ts extract "content area" --format html
```

---

## Privacy Considerations

### PII Detection

When extracting data, CBrowser detects and handles PII:

```yaml
pii_handling:
  emails: redact      # user@example.com → u***@example.com
  phones: redact      # 555-123-4567 → 555-***-****
  names: preserve     # Keep as-is (configurable)
  addresses: redact   # Full address → City, State only
```

### Consent Check

For authenticated data:

```
⚠️ Extracting user data from authenticated session

This data may include:
  - Personal information
  - Private content
  - Account details

Proceed with extraction? (y/N)
```

---

## Constitutional Compliance

Extraction is generally **Green Zone** (auto-execute):

| Extraction Type | Zone | Notes |
|-----------------|------|-------|
| Public content | Green | No restrictions |
| Behind login | Yellow | Logged, respects session |
| PII data | Yellow | May require confirmation |
| Behind paywall | Red | Requires explicit permission |
| Rate-limited | Respects limits | Politeness delays |

### Robots.txt Respect

```bash
# Check if extraction is allowed
bun run Tools/CBrowser.ts check-robots https://example.com/products

# Force extraction (with warning)
bun run Tools/CBrowser.ts extract "products" --ignore-robots
```

---

## Caching

Extraction results can be cached:

```bash
# Cache results for 1 hour
bun run Tools/CBrowser.ts extract "products" --cache 1h

# Force fresh extraction
bun run Tools/CBrowser.ts extract "products" --no-cache
```

Cache stored in:
```
~/.claude/skills/CBrowser/.memory/cache/
├── example.com/
│   ├── products-2026-01-31T22-30-00.json
│   └── ...
```
