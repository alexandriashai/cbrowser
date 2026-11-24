# Extract

Pull data out of a page: its text, links, headings, images and forms with one command, and anything else (tables, prices, attributes) with a short page script.

## When to use

- "extract", "scrape", "get the links", "pull the prices", "what does the page say".
- Reading back the result of an interaction (`Workflows/Interact.md`).
- Collecting a page's console errors or network requests.

## Before you start

- **Which page.** Without a daemon, each CLI command reloads the last URL, so `extract` reads the page as it loads, not as you left it. To read a page after clicking or typing, run `cbrowser daemon start` first and keep one `CBROWSER_DATA_DIR` (see `Workflows/Navigate.md`).
- **MCP.** On the local stdio server (`npx cbrowser mcp-server`) all tools share one page. On the hosted server pass the `param: _browserToken` from `navigate`; `extract` refuses to run without one rather than read a blank page. Tool prefixes depend on the install; bare names are used here.
- **Manners.** Neither the CLI nor the MCP tools read robots.txt or throttle requests for you. Keep the rate low and stay within the site's terms. Data behind a login belongs to the account holder: ask before extracting it.

## 1. Built-in extraction

```bash
cbrowser navigate "https://example.com"
cbrowser extract links
cbrowser extract headings
cbrowser extract images
cbrowser extract forms
cbrowser extract text
```

MCP: `extract` with `what` set to `links`, `headings`, `images`, `forms` or `text`.

Each prints JSON to stdout (notices go to stderr, so `2>/dev/null > out.json` captures clean JSON). Shapes:

| what | returns |
|------|---------|
| links | `[{ "text", "href" }]`, every `<a>`, href made absolute |
| headings | `[{ "level": "H2", "text" }]`, h1 to h6 in document order |
| images | `[{ "src", "alt" }]`, every `<img>` |
| forms | `[{ "action", "method", "inputs": [{ "type", "name", "id" }] }]` |
| text | one string: the visible body text, scripts and styles removed, whitespace collapsed |

Measured on example.com:

```json
[ { "text": "Learn more", "href": "https://iana.org/help/example-domains" } ]
```

Any other value is refused: `extract takes one of: text, links, headings, images, forms`. There is no natural-language extraction, schema file, pagination flag, CSV output or cache; use the steps below.

## 2. Anything else: a page script

`cbrowser evaluate` runs JavaScript in the page and prints the result. It is red zone (a script can click or submit anything), so it runs nothing without `--force`. Read-only scripts are safe to force.

```bash
cbrowser evaluate "document.title" --force
cbrowser evaluate "[...document.querySelectorAll('.price')].map(e => e.textContent.trim())" --json --force
cbrowser evaluate "document.querySelector('meta[name=description]')?.content" --raw --force
```

For anything longer, put a function in a file and pass arguments as JSON:

```js
// table.js: rows of a table as objects keyed by its header cells
(sel) => {
  const t = document.querySelector(sel);
  const head = [...t.querySelectorAll("thead th")].map((th) => th.textContent.trim());
  return [...t.querySelectorAll("tbody tr")].map((tr) =>
    Object.fromEntries([...tr.cells].map((td, i) => [head[i], td.textContent.trim()])));
}
```

```bash
cbrowser evaluate --file table.js --arg '"#prices"' --json --force
# [ { "Plan": "Free", "Price": "$0" }, { "Plan": "Pro", "Price": "$29" } ]
```

Useful flags: `--wait-for <selector>` waits for content that renders late (`--timeout 15s` to change the 30 s default), `--expect-truthy` exits 1 when the result is falsy, `--json` always prints JSON.

MCP: `evaluate_script` with `script`, optional `args` (a JSON array) and `force: true`. The same four script shapes work: an expression, statements, a body with `return`, or a function literal called with `args`.

## 3. Understand the page before choosing what to pull

| Need | CLI | MCP |
|------|-----|-----|
| Forms, buttons, links, login/search detection | `cbrowser analyze <url>` (`--output a.json`) | `analyze_page` |
| Page type, available actions, structure | (none) | `page_understand` (scope: auto, viewport, full_page) |
| Locate one element by description | `cbrowser ai find "the cheapest product"` | `find_element_by_intent` |
| Look at it | `cbrowser screenshot ./page.png` | `screenshot` |

`analyze` and `ai` refuse while the daemon runs; use them with the daemon stopped.

## 4. Several pages

There is no built-in crawler for extraction. Drive it with the daemon and a loop. `click` exits 1 when there is no next link, which ends the loop:

```bash
cbrowser daemon start
cbrowser navigate "https://example.com/results"
for i in 1 2 3 4 5; do
  cbrowser evaluate --file rows.js --arg '"#results"' --json --force 2>/dev/null > "page-$i.json"
  cbrowser click "Next" >/dev/null 2>&1 || break
done
cbrowser daemon stop
```

Infinite scroll: replace the click with `cbrowser scroll bottom`, then `cbrowser evaluate "true" --wait-for "<css of a new item>" --force`.

For a list of known URLs, call `navigate` and `extract` per URL; no daemon is needed when nothing on the page has to be clicked first.

## 5. Console, network and storage

These read what the browser recorded, not the DOM. On the CLI they need the daemon, because only the daemon's browser lives long enough to record anything.

```bash
cbrowser daemon start
cbrowser navigate "https://example.com"
cbrowser console --filter error              # --json for raw messages, --clear to reset
cbrowser network list --filter document --json   # --all for every request (default: newest 20)
cbrowser har start
cbrowser navigate "https://example.com/pricing"
cbrowser har stop ./pricing.har
cbrowser daemon stop
cbrowser cookie list --url "https://example.com"
```

MCP: `get_console_messages` (filter: all, error, warning, log, info), `get_network_requests` (filter: all, xhr, document, script, stylesheet, image, fetch; returns the 50 most recent matches), `manage_cookies` (action: get), `manage_storage` (storageType: local or session, action: get).

## Gotchas

- `extract text` returns all visible text on the page, navigation and footer included, as one string. Narrow it with a page script when you need one region.
- An empty list is a real answer only if you are on the right page. Check the URL and title first (`cbrowser evaluate "location.href" --force`, or the `navigate` response). Without a daemon, a saved page that fails to reload stops the command with the reason.
- Without the daemon, content that appears only after a click, a scroll or typed input is not there for `extract`.
- `evaluate` prints a string bare and an object or array as JSON. Add `--json` when a script consumes the output, so a string comes back quoted and every result parses.
- Over MCP, `extract` returns the same shapes as the CLI.
