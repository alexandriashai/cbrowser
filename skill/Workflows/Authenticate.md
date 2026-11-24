# Authenticate Workflow

Log in to a site, check that the login worked, and keep the logged-in state so later work does not have to log in again.

CBrowser has no credential vault and no login command. A login is ordinary browser work: open the login page, fill the fields, click the button, check the result, then save the session. Secrets come from environment variables, never from the prompt or a file in the repo. See `Credentials.md` for how to handle them and where the saved state ends up on disk.

---

## Trigger

- "log in to", "sign in to", "authenticate with"
- A task needs a page that redirects to a login form
- The user wants a logged-in state reused across runs or personas

---

## Before you start

1. **Check for a saved session.** `cbrowser session list` (or `list_sessions`) shows saved sessions with domain, creation time and cookie count. If one matches, load it and skip the login.
2. **Get the secrets into the environment, not the conversation.** Ask the user to export them in their own shell, or put them in an untracked env file they source. You refer to them as `$SITE_USER` and `$SITE_PASS`; you never see or repeat the values.
3. **Pick one data dir.** Every command in the flow must use the same CBROWSER_DATA_DIR (default `~/.cbrowser`). Set it on each command if your shell does not keep variables between calls.

---

## CLI: log in with the daemon

Without the daemon every CLI command opens its own browser and reloads the last URL, so text typed by one `fill` is gone before the next command runs. A multi-step login therefore needs the daemon, which keeps one browser and one page across commands.

```bash
export CBROWSER_DATA_DIR=~/.cbrowser          # same value on every command

cbrowser daemon start --port 9301
cbrowser navigate "https://example.com/login"
cbrowser fill "Email" "$SITE_USER"
cbrowser fill "Password" "$SITE_PASS"
cbrowser click "Sign in"

# Check it worked before saving anything
cbrowser extract headings
cbrowser screenshot ./after-login.png

cbrowser daemon stop
cbrowser session save example-admin --url "https://example.com/account"
```

Why the order matters:

- `fill` prints only `Filled: <selector>`, never the value. The transcript shows `"$SITE_PASS"`, not the password.
- `session save` refuses while the daemon runs (it would open a second browser on the same profile). Stop the daemon first. Stopping it writes the browser's cookies, including session cookies, into the profile, so the next command still has them.
- Give `session save` a `--url` of a page that only works when logged in. Without a daemon it otherwise reloads the last page it remembers, which may be the login form.

If the field names differ, `cbrowser fill` and `cbrowser click` accept visible text, labels, placeholders, roles or CSS selectors. Add `--verbose` to list the inputs it found when a match fails.

### Verify the login, not just the click

A click that succeeds only means the button was pressed. Confirm the outcome:

- `cbrowser extract headings` or `cbrowser extract forms`: the page after login should not still show the login form.
- `cbrowser cookie list`: an auth cookie for the site should now exist. This prints the first 50 characters of each value, so do not paste its output anywhere shared.
- `cbrowser screenshot <path>`: look at the page. Password inputs render as dots.

---

## CLI: reuse the login later

```bash
cbrowser session load example-admin
cbrowser navigate "https://example.com/account"
```

`session load` puts the saved cookies into the browser, opens the saved URL, writes back localStorage and sessionStorage, and reloads. It prints how many cookies and storage keys it restored, and warns when the current page is on a different domain than the saved one. Like `session save`, it refuses while the daemon runs: load first, then start the daemon if the next steps need it.

You often do not need `session load` at all. The CLI uses a persistent browser profile in `<data dir>/browser-state`, so a login done in one command is still there for the next command on the same data dir. Saved sessions are for switching between accounts, keeping a known-good state, and moving a login to another data dir.

---

## MCP: log in with tools

The MCP tools keep one browser between calls, so no daemon is needed.

1. `navigate` to the login page.
2. `fill` the username and password fields, then `click` the submit button. Use `type_text` when a field only reacts to key events.
3. Check the result with `extract`, `page_understand` or `screenshot`.
4. `save_session` with a `name` such as `example-admin`.

On the HTTP transport (hosted servers, `cbrowser mcp-remote`) pass the token each call returns (`param: _browserToken`) to every later call, including `save_session` and `load_session`. Without it those calls bind to a different, blank browser. `save_session` refuses a blank page unless you pass `force: true`, which you should not need.

**Secrets and MCP:** a value given to `fill` is part of the tool call, so it lands in the conversation. For a real password prefer one of these:

- Log in once with the CLI flow above (values from env vars), save the session, then call `load_session` from the local stdio MCP server. It reads the same data dir as the CLI, so `list_sessions` shows the session.
- Use a dedicated test account whose password is fine to have in a transcript.

The hosted servers keep each account's sessions in that account's own directory, so a session saved by your local CLI does not exist there.

---

## Two-factor codes, CAPTCHAs and SSO

CBrowser does not generate one-time codes and does not solve CAPTCHAs.

- **Code sent by SMS, email or an app:** stop and ask the user for the code, then `cbrowser fill "Verification code" "<code>"` and click submit. A one-time code expires within minutes, so it does not need the env-var treatment.
- **TOTP the user wants automated:** generate the code with a separate TOTP tool, from a secret held in the environment, then fill it. Ask first: automating the second factor removes the protection it exists for.
- **CAPTCHA or "verify you are human":** let a person do it. On a machine with a display, start a visible browser with `cbrowser daemon start --no-headless`, `cbrowser navigate` to the login page, and let the user finish the login by hand. Then `cbrowser daemon stop` and `cbrowser session save <name> --url <logged-in page>`. For Cloudflare's interstitial specifically, `cloudflare_detect` and `cloudflare_wait` tell you when it has cleared.
- **SSO / OAuth ("Continue with Google"):** the flow redirects to the identity provider, which usually adds its own 2FA and consent screens. Do it once by hand in a visible browser as above and save the session. Never click through a consent screen on the user's behalf.

---

## When the login stops working

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| `session load` succeeds but the page shows the login form | Server-side session expired or was revoked | Log in again and `session save` under the same name (it overwrites) |
| `Session not found` | Wrong name or wrong data dir | `cbrowser session list` with the same CBROWSER_DATA_DIR |
| `fill` cannot find the field | Label differs, or the field is inside an iframe | `cbrowser fill <selector> <value> --verbose` to list the inputs |
| Login works, next command is logged out | Commands ran with different data dirs | Set CBROWSER_DATA_DIR on every command |
| `session save` refuses | The daemon is running | `cbrowser daemon stop`, then save |
| Warning about another domain on load | Session saved on `app.example.com`, page is on `example.com` | Load first, then navigate; cookies apply per domain |

---

## Logging out

To drop the logged-in state from the browser profile:

- `cbrowser cookie delete <name>` removes one cookie (add `--domain` to limit it to one site).
- `cbrowser reset` clears the profile's cookies and storage. Saved sessions in `<data dir>/sessions` are untouched.
- Do not rely on `cbrowser cookie clear` from the CLI: it currently reports success without starting the browser, and the cookies survive. Over MCP, `manage_cookies` with `action: "clear"` after a `navigate` clears the live browser.

To forget a saved login, `cbrowser session delete <name>` or `delete_session`. See `SessionManagement.md` for the full session reference.

---

## Safety

- A login is a state-changing action on a real account. Confirm with the user which account and site before the first login.
- Use test accounts for automated tests. Never put a real password in a test-suite file: `cbrowser test-suite` files have no variable substitution, and each step's text is printed as it runs and in the report.
- Do not paste the output of `cookie list`, `session show` or `manage_cookies` into tickets, chats or commits. They contain partial or full token values.
