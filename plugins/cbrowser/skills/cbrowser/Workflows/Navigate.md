# Navigate

Open a URL in cbrowser's browser, confirm the page that actually loaded, and keep that page for the next step.

## When to use

- "go to", "open", "navigate to", or a bare URL to look at.
- The first step of any interaction, extraction, test or audit on a page.
- Checking how a page renders on a phone, in dark mode, or in another locale.

## Two ways to drive it

**CLI.** `cbrowser <command>` (or `npx cbrowser <command>` without a global install).

**MCP.** The `navigate` tool and its siblings. The tool prefix depends on how the server was installed, so this file uses bare names.

- Local stdio server (`npx cbrowser mcp-server`): one browser per server process. Every tool acts on the same page, so no token is needed.
- Hosted server (claude.ai connector or `cbrowser mcp-remote`): `navigate` without a token starts a new session and returns `param: _browserToken`. Pass it to every later call. Without it a tool acts on a fresh blank browser, and tools that report on page state refuse with a no_session error.

## Page state between CLI commands

Each CLI command is its own process. Without a daemon, a command opens its own browser and reloads the last URL (saved for an hour). Cookies and localStorage carry over; typed input, scroll position, sessionStorage and script variables do not.

To keep one live page across commands, start the daemon first and give every command the same `CBROWSER_DATA_DIR`:

```bash
export CBROWSER_DATA_DIR=~/.cbrowser   # the default; set it explicitly for parallel runs
cbrowser daemon start                  # --port <port> if 9222 is taken; --timeout 2h for long work
cbrowser navigate "https://example.com"
# click, fill, extract, screenshot now act on this same page
cbrowser daemon stop
```

`cbrowser daemon status` exits 1 when no daemon is running. While one runs, some commands refuse because they would open a second browser on the same profile, among them `smart-click`, `dismiss-overlay`, `assert`, `ai`, `analyze`, `reset`, `session save` and `session load`. Stop the daemon to use them.

## Steps

### 1. Navigate

```bash
cbrowser navigate "https://example.com"
```

Without a daemon it prints the final URL, title, load time and a screenshot path (shown with the global `--plain` option, which swaps symbols for ASCII tags):

```
[PASS] Navigated to: https://example.com/
 Title: Example Domain
 Load time: 507ms
 Screenshot: ~/.cbrowser/screenshots/<id>/screenshot-<n>.png
```

Through the daemon the same result comes back as JSON with `url`, `title`, `screenshot`, `errors`, `warnings`, `loadTime` and `success`.

MCP:

```
navigate(url: "https://example.com")
navigate(url: "https://app.example.com", waitForSelector: "#app:not(:empty)")
navigate(url: "https://example.com/de", waitAfterLoad: 3000)
```

`waitForSelector` waits up to 10 s for a CSS selector and reports `waitSelectorTimedOut` if it never appears. `waitAfterLoad` adds a fixed wait for pages that render or translate after load. The CLI `navigate` has neither. With the daemon running, follow it with a wait:

```bash
cbrowser evaluate "true" --wait-for "#app" --timeout 15s --force
```

That exits 1 with `Timed out waiting for selector` if the element never shows. (`evaluate` is red zone, hence `--force`; this script only returns `true`.)

### 2. Choose how the browser presents itself (optional)

Global CLI options apply to any command:

```bash
cbrowser navigate "https://example.com" --device iphone-15 --color-scheme dark
cbrowser navigate "https://example.com" --viewport 1280x720
cbrowser navigate "https://example.com" --locale de-DE --timezone Europe/Berlin --geo 52.52,13.405
cbrowser navigate "https://example.com" --browser firefox
cbrowser device list iphone     # device presets
cbrowser geo list               # location presets
```

`--geo-region <region>` sends traffic through a configured residential proxy and exits 1 if that region is not configured. With a daemon, set the device and size once on `cbrowser daemon start --device <name> --viewport <WxH>`.

MCP: pass `device`, `viewport` and `colorScheme` to `navigate`. `device` and `viewport` apply only on the `navigate` that starts a session; on the hosted server, call `navigate` without a token to start an emulated one. `colorScheme` can change on an existing session. `list_devices` lists the presets.

### 3. Confirm what loaded

Do not trust the exit code alone:

- A DNS or connection failure exits 1 with the reason, for example `Could not resolve host ... Nothing was loaded.`
- An HTTP error page still loads. A 404 exits 0 and the CLI prints `Errors: 1` under the screenshot path. Check `errors` in the JSON or MCP response.
- The MCP `navigate` response sets `success: false` with `desyncDetected` and `expectedUrl` when the page landed on a different host than requested, and adds `contentIntegrity` when the page looks like a challenge or interstitial rather than the content asked for. Treat either as "wrong page", not as a result to analyze.

Then look at the page itself: open the screenshot, or read its text with the Extract workflow. To capture again later:

```bash
cbrowser screenshot ./page.png                          # current page (the daemon keeps it)
cbrowser screenshot "https://example.com" ./page.png    # load a URL and capture it
```

MCP: `screenshot` (optional `path`).

### 4. Pages behind a login

Load a saved session before navigating. Session commands refuse while the daemon runs, so load first, then start the daemon if you need one:

```bash
cbrowser session load github-dev
cbrowser navigate "https://github.com/settings"
```

MCP: `load_session`, then `navigate`. Creating and saving sessions is covered in `Workflows/Authenticate.md` and `SessionManagement.md`.

## Related tools

| Need | CLI | MCP |
|------|-----|-----|
| Cookie banner or modal in the way | `cbrowser dismiss-overlay --url <url>` | `dismiss_overlay` |
| Several tabs | (none) | `manage_tabs` (list, create, switch, close) |
| Browser seems stuck | `cbrowser status`, `cbrowser doctor` | `browser_health`, then `browser_recover` |
| Start clean (cookies, storage) | `cbrowser reset` (daemon stopped) | `reset_browser` |
| What the page is and what it offers | `cbrowser analyze <url>` | `page_understand`, `analyze_page` |

## Gotchas

- Without a daemon, every later command reloads the page and anything typed or scrolled is gone. Start the daemon for multi-step work, or run the whole flow in one process with `cbrowser test-suite --inline "go to <url> ; click ... ; verify ..."`.
- Commands find the daemon through the data dir. A command run with a different `CBROWSER_DATA_DIR` opens its own browser instead, and says so in a "No daemon found for data dir" notice.
- The hosted server opens only http: and https: URLs. `file:` URLs work on the CLI and the local server.
- On the hosted server, always pass the `param: _browserToken` that `navigate` returned. A call without it starts over on a blank page.
- Opening and reading a page is green zone: no `--force` is needed to navigate.
