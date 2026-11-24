# Interact

Click, fill, type, press keys, hover, drag, upload and scroll on a page, then confirm the action did what it should.

## When to use

- "click", "fill in", "type", "select", "check the box", "submit", "press Enter", "hover", "drag", "upload".
- Any step after `Workflows/Navigate.md` that changes the page.
- Reproducing a user flow before writing it as a test (`Workflows/Test.md`).

## Before you start

**Keep the page between steps.** Each CLI command is its own process. Without a daemon, the next command reloads the last URL and everything you typed is gone (a `fill` followed by an `evaluate` reads the field back as `""`). For a multi-step interaction, either:

- start the daemon: `cbrowser daemon start`, run the steps with one `CBROWSER_DATA_DIR`, then `cbrowser daemon stop`; or
- run the whole flow in one process: `cbrowser test-suite --inline "go to <url> ; type \"a@b.test\" in Email ; click Send ; verify url contains /done"`.

**MCP.** On the local stdio server (`npx cbrowser mcp-server`) every tool acts on one shared page. On the hosted server, pass the `param: _browserToken` from `navigate` to every call, or the action lands on a blank browser. Tool prefixes depend on the install; bare names are used here.

**Selectors.** `click`, `fill` and `hover` take visible text, a label, an ARIA role or name, or a CSS selector, and try them in that order ("Send", "Email", "#q", "button.primary"). `drag` and `upload_file` take CSS selectors.

## Actions

| Action | CLI | MCP |
|--------|-----|-----|
| Click | `cbrowser click "<selector>"` | `click` (selector, force, verbose) |
| Fill a field, or pick a `<select>` option | `cbrowser fill "<selector>" "<value>"` | `fill` (selector, value, verbose) |
| Type into the focused element, real key events | `cbrowser type "<text>" --delay 80` | `type_text` (text, delay, force) |
| One key or chord | `cbrowser press Enter`, `cbrowser press "Control+a"` | `press_key` (key, force) |
| Key sequence | `cbrowser keyboard "Control+A" "Backspace" "new text" --selector "#q"` | repeated `press_key` / `type_text` |
| Hover | `cbrowser hover "<selector>"` | `hover` |
| Drag and drop | `cbrowser drag "<css source>" "<css target>"` | `drag` (source, target, force) |
| File input | `cbrowser upload "<css>" ./file.pdf` | `upload_file` (selector, filePaths) |
| Scroll | `cbrowser scroll down 600`, `cbrowser scroll bottom` | `scroll` (direction, amount) |
| Click with retries and healing | `cbrowser smart-click "<selector>" --max-retries 3 --dismiss-overlays` | `smart_click` |
| Close a cookie/age/newsletter modal | `cbrowser dismiss-overlay --type cookie` | `dismiss_overlay` (type, customSelector) |
| Find by intent, then click | `cbrowser ai find "email field"`, `cbrowser ai click "login button"` | `find_element_by_intent`, then `click` |
| Plain-English steps | `cbrowser run "click Send"` (one step) | `nl_test_inline` (content: steps, one per line) |
| JavaScript dialog | (handled for you) | `handle_dialog` (action, promptText) |

`click`, `fill`, `keyboard` and `upload` take `--url <url>` to load a page first, which is handy for a single action without the daemon. `cbrowser help keyboard` explains chords, `--hold`, `--repeat` and `--text`.

## Worked example (CLI, with the daemon)

```bash
export CBROWSER_DATA_DIR=~/.cbrowser
cbrowser daemon start
cbrowser navigate "https://example.com/signup"
cbrowser fill "Email" "test@example.com"          # Filled: Email
cbrowser fill "Size" "Large"                      # on a <select>: Selected: Large in Size
cbrowser click "Newsletter"                       # a checkbox by its label text
cbrowser click "#q" && cbrowser type "hello"      # focus, then real keystrokes
cbrowser click "Send"
cbrowser evaluate "location.href" --force         # where the submit went
cbrowser screenshot ./after-submit.png
cbrowser daemon stop
```

Through the daemon each action prints JSON. A click looks like:

```json
{ "success": true, "screenshot": "...png", "message": "Clicked: Learn more",
  "zone": "yellow", "target": { "tag": "a", "label": "Learn more" } }
```

`target` names what the selector actually resolved to. Check it, not just `success`.

## Worked example (MCP)

```
navigate(url: "https://example.com/signup")
fill(selector: "Email", value: "test@example.com")
click(selector: "Send")
assert(assertion: "url contains '/welcome'")
```

On the hosted server add the `param: _browserToken` from `navigate` to each call after it.

Dialogs: `handle_dialog` arms a handler for the next alert, confirm or prompt and returns at once. Call it first, then trigger the dialog with the next call:

```
handle_dialog(action: "accept", promptText: "Jane")
click(selector: "Rename")
```

## Confirm the result

An action that "succeeded" may still have hit the wrong element. After anything that matters:

- `cbrowser evaluate "document.querySelector('#email').value" --force` (daemon) or `evaluate_script` with `force: true` to read the value back.
- `cbrowser assert "url contains '/dashboard'" --url <url>` (daemon stopped) or `assert`. Exit 1 on failure, with the actual value printed.
- `cbrowser console --filter error` (daemon) or `get_console_messages` for errors the action caused.
- A screenshot, viewed, for anything visual.

## When an element is not found

```bash
cbrowser click "Sign in" --url "https://example.com" --verbose
```

exits 1 and lists the clickable elements it saw with a selector for each, plus a debug screenshot (`--debug-dir <dir>` chooses where). `fill --verbose` lists the inputs. MCP: `verbose: true` on `click` or `fill` returns `availableElements` and `aiSuggestion`; `find_element_by_intent` with `verbose: true` lists candidates on a miss.

`smart-click` retries and tries alternative selectors. It reports the selector it finally used (`finalSelector`) and a `confidence`. Below 80 % it reports failure, but the click on the alternative has already happened, so look at the page before retrying:

```
$ cbrowser smart-click "Lern more" --url "https://example.com" --max-retries 2 --plain
 Attempt 1: [FAIL] Lern more
 Attempt 2: [PASS] Learn more (Text match: "Learn more")
[FAIL] Clicked element with low confidence (75%) - may not be the intended target
```

Only alternatives at 80 % or above are cached. Healed selectors are kept per domain: `cbrowser heal stats`, `cbrowser heal list`, `cbrowser heal clear`, MCP `heal_stats`.

## Red zone

Controls that delete, pay, check out or otherwise cannot be undone are red zone. The click is refused and nothing is clicked:

```
$ cbrowser click "Delete account" --plain
[FAIL] Red zone action requires --force: click "Delete account"
```

The command exits 1.

To proceed on purpose, add `--force` (CLI) or `force: true` (`click`, `smart_click`, `press_key`, `type_text`, `drag`). Enter or Space on a focused red control, or Enter in a field whose form submits to one, is refused the same way. Ask the user before forcing anything you did not create yourself.

`cbrowser evaluate` and `evaluate_script` are always red zone, because page script can activate any control. They run nothing without `--force` / `force: true`.

## Gotchas

- Without the daemon, typed input, checkbox state and scroll position do not survive to the next command. Cookies and localStorage do.
- While the daemon runs, `smart-click`, `dismiss-overlay`, `assert`, `ai` and `analyze` refuse (they would open a second browser). Stop the daemon to use them: `smart-click`, `dismiss-overlay` and `assert` take `--url`, `analyze` takes the URL as its argument, and `ai` acts on the last URL. Or stay in the daemon and use `click`, `evaluate` and `screenshot`.
- `cbrowser type` and `type_text` type into whatever has focus. Click or `--selector` (on `keyboard`) the field first. Use `fill` when you only need the value set; use `type` when the page reacts to keystrokes (autocomplete, search-as-you-type).
- `scroll` without the daemon is lost on the next command. To bring an element into view, `hover` it.
- On the hosted server, `upload_file` reads only files inside your account's directory; to upload a local file, run the local server.
- A CLI alert, confirm or prompt does not block the click that opened it. Over MCP, arm `handle_dialog` first when the choice (accept or dismiss) matters.
