# Extract Workflow

Intelligent data extraction from pages.

## Triggers

- "extract", "get", "scrape"
- "collect", "gather"
- "find all", "list all"

## Usage

```bash
npx cbrowser extract "all product prices"
npx cbrowser extract "headings" --format json
npx cbrowser extract "table data" --output data.json
```

## Extraction Types

### Structured Data

```bash
# Extract headings
npx cbrowser extract "headings"

# Extract links
npx cbrowser extract "links"

# Extract images
npx cbrowser extract "images"

# Extract tables
npx cbrowser extract "tables"
```

### Custom Selectors

```bash
# Natural language
npx cbrowser extract "all product cards"

# CSS selector
npx cbrowser extract "css:.product-item"

# Multiple elements
npx cbrowser extract "all prices in the product list"
```

## Output Formats

| Format | Description |
|--------|-------------|
| `text` | Plain text (default) |
| `json` | JSON object |
| `csv` | CSV format |
| `markdown` | Markdown table |

```bash
npx cbrowser extract "products" --format json
npx cbrowser extract "products" --format csv --output products.csv
```

## Examples

```bash
# Extract and save as JSON
npx cbrowser extract "all article titles" --format json --output titles.json

# Extract with navigation
npx cbrowser extract "product details" --url "https://example.com/product/123"
```
