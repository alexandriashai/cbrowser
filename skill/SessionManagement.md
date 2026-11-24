# Session Management

How CBrowser keeps browser state between commands and between runs, and how to save, restore and remove a logged-in state.

For the login flow see `Workflows/Authenticate.md`. For handling secrets and where the files live, see `Credentials.md`.

---

## Four kinds of state

| State | Where | Kept for | Holds |
|-------|-------|----------|-------|
| Browser profile | `<data dir>/browser-state/` | Until `cbrowser reset` or uninstall | Cookies and storage of every site the CLI visited |
| Last page | `<data dir>/browser-state/last-session.json` | One hour | The URL the next CLI command reloads |
| Saved session | `<data dir>/sessions/<name>.json` | Until you delete it | Named snapshot: cookies, localStorage, sessionStorage, URL, viewport |
| Live page | The daemon's browser | While the daemon runs (idle timeout 30 min by default) | Everything, including open dialogs, typed input and script variables |

The data dir is CBROWSER_DATA_DIR, default `~/.cbrowser`. Every command and the MCP stdio server use it, so a session saved by the CLI can be loaded over MCP and the other way round, as long as both use the same data dir.

---

## Saved sessions: CLI

```bash
cbrowser session save <name> [--url <url>]   # snapshot the page's cookies and storage
cbrowser session load <name>                 # restore it
cbrowser session list                        # name, domain, created, cookie count, size
cbrowser session show <name>                 # details, incl. storage value previews
cbrowser session delete <name>
cbrowser session cleanup --older-than 30     # delete sessions not used for 30 days
cbrowser session export <name> --output <file>
cbrowser session import <file>               # named after the file
```

Session names may contain letters, digits, dot, dash and underscore, start with a letter or digit, and be at most 64 characters. Saving under an existing name overwrites it.

**What `session save` captures:** all cookies in the browser context (HttpOnly ones included), the current page's localStorage and sessionStorage, the page URL and its domain, and the viewport size. Give it `--url` to open a page first; without a daemon it otherwise reloads the last page and saves whatever that is.

**What `session load` does, in order:** adds the saved cookies, opens the saved URL, writes the saved localStorage and sessionStorage into that page, reloads it, and updates the session's last-used time. It prints the counts it restored. If the current page is on another domain it adds a warning, because cookies only apply to their own domain.

`session save` and `session load` refuse while the daemon is running, since they would open a second browser on the same profile. Stop the daemon, save or load, then start it again if you need it.

### File format

```json
{
  "name": "example-admin",
  "created": "2026-11-23T17:03:47.000Z",
  "lastUsed": "2026-11-23T17:04:01.000Z",
  "domain": "example.com",
  "url": "https://example.com/account",
  "viewport": { "width": 1920, "height": 1080 },
  "cookies": [ { "name": "sid", "value": "...", "domain": "example.com", "path": "/", "expires": -1, "httpOnly": true, "secure": true, "sameSite": "Lax" } ],
  "localStorage": { },
  "sessionStorage": { }
}
```

Plain JSON, not encrypted. Anyone who can read the file can use the login until the site expires it. See `Credentials.md` for permissions and deletion.

---

## Saved sessions: MCP

| Tool | Arguments | Notes |
|------|-----------|-------|
| `save_session` | `name`, optional `force` | Refuses a blank page (about:blank) unless `force: true` |
| `load_session` | `name` | Returns the counts restored, or the error "session_not_found" |
| `list_sessions` | none | Name, domain, created, last used, URL, cookie and storage key counts, size |
| `delete_session` | `name` | Reports whether a file was removed |

On the HTTP transport (hosted servers, `cbrowser mcp-remote`) pass the browser token from the previous call (`param: _browserToken`) to `save_session` and `load_session`. Without it they act on a different, blank browser: the save is refused, and a load restores into a browser you are not using. The stdio server has one browser, so it does not need the token.

On the hosted servers sessions are kept per account. `list_sessions` shows only your account's sessions.

---

## Cookies and storage directly

For a single value you do not need a whole session.

```bash
cbrowser cookie list --url "https://example.com"      # names, value previews, domain, path, expiry
cbrowser cookie set consent accepted --domain example.com --path /
cbrowser cookie delete sid --domain example.com
cbrowser reset                                        # clear the profile's cookies and storage
```

`cookie set` writes a session cookie (no expiry) and echoes the value. `cookie delete` without `--domain` removes that name on every domain. `cookie clear` currently reports success from the CLI without starting the browser and leaves the cookies in place; use `reset` to clear everything.

Over MCP:

- `manage_cookies` with `action` set to `get`, `set`, `delete` or `clear`. `set` takes `name`, `value`, and optionally `domain` (defaults to the current page's host), `path` and `expires` (Unix seconds; omitted means a session cookie). `delete` takes `name` and optionally `domain`.
- `manage_storage` with `storageType` set to `local` or `session` and `action` set to `get`, `set`, `remove` or `clear`, plus `key` and `value` where needed. It acts on the current page's origin.

The `get` actions return full values. Keep that output out of anything shared.

---

## Keeping one page across CLI commands: the daemon

Each CLI command is its own process with its own browser. By default it reloads the last URL (saved for an hour), so cookies and localStorage carry over, but the page's live state does not: open dialogs and menus, typed input, script variables, sessionStorage and scroll position. A command that reloads says so on stderr ("No daemon found for data dir ...").

To keep one page across commands, start the daemon and give every command the same CBROWSER_DATA_DIR:

```bash
export CBROWSER_DATA_DIR=/tmp/my-flow   # the same value for every command
cbrowser daemon start --port 9301

cbrowser click "[data-testid='search-trigger']" --url "https://cbrowser.ai"
cbrowser screenshot /tmp/dialog-open.png   # the dialog is still open

cbrowser daemon stop
```

- Commands find the daemon through the data dir. If your shell does not keep environment variables between calls (an agent's tool calls often do not), set CBROWSER_DATA_DIR on every command. `cbrowser daemon status` names the data dir it looked in and exits 1 when no daemon runs there.
- The commands the daemon runs, and so share its page: `navigate`, `click`, `fill`, `hover`, `type`, `press`, `keyboard`, `drag`, `upload`, `screenshot`, `extract`, `run`, `scroll`, `evaluate`, an open-ended capture, `har`, `network` and `console`. Commands that would open a second browser on its profile (`session save` and `load`, `reset`, `script`, `ai`, `explore`, `a11y`, `perf`, `visual` and others) refuse until you stop it. For a flow that needs those, use one `cbrowser test-suite`, whose steps share one browser.
- `--no-restore` does not keep the page. It only skips the reload, so without a daemon a command that acts on the page refuses unless given `--url`. With a daemon running it changes nothing.
- Stopping the daemon writes its cookies into the profile, so the next plain command is still logged in.
- `daemon start` takes `--timeout` (minutes, or `90s` / `45m` / `2h`) for the idle timeout, and `--device`, `--viewport` and `--no-headless` for the browser it runs.

---

## Lifetimes

- Saved sessions never expire on their own. They go only through `session delete`, `session cleanup`, `cbrowser cleanup` (which keeps the newest 3 and deletes older ones last written more than 7 days ago; preview with `--dry-run`, protect more with `--keep-sessions <n>`), or `cbrowser uninstall --yes`.
- The site decides how long the cookies inside them stay valid. A file can load cleanly and still be logged out.
- The last-page restore expires after an hour.
- The daemon stops after 30 idle minutes unless started with a different `--timeout`.

---

## Troubleshooting

| Problem | Check |
|---------|-------|
| `Session not found` | Same CBROWSER_DATA_DIR as when it was saved? `cbrowser session list` |
| Loaded, but the page shows the login form | The site expired the login. Log in again, save under the same name |
| Domain warning on load | Saved for another host (`app.example.com` vs `example.com`). Navigate to the saved host |
| Save or load refuses | The daemon is running. `cbrowser daemon stop` first |
| `save_session` returns error "blank_context" | Nothing open. Navigate first and, on HTTP, pass the token |
| Logged in, next command logged out | Commands used different data dirs |
