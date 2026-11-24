# Credentials

How to handle passwords, tokens and logged-in state safely when you drive CBrowser.

CBrowser has no credential vault. It never asks for a password and never stores one. What it does store is the result of a login: cookies and web storage, in plain JSON and in a browser profile on disk. Those are as good as the password for as long as the site honors them, so treat them the same way.

For the login steps themselves see `Workflows/Authenticate.md`. For session commands see `SessionManagement.md`.

---

## Rules for secrets

1. **Never paste a password into the prompt.** Anything in the conversation can end up in logs, transcripts and shared screenshots. If the user offers one, ask them to put it in an environment variable instead.
2. **Never write a password into a file in the repo.** That includes test-suite files: `cbrowser test-suite` has no variable substitution, and it prints each step's text as it runs and in its report, so `type "hunter2" in password field` leaks the password twice.
3. **Pass secrets through environment variables.** The user exports them in their own shell, or keeps them in an untracked env file:

   ```bash
   # .env.cbrowser  (chmod 600, listed in .gitignore)
   SITE_USER=qa-bot@example.com
   SITE_PASS=...

   set -a; . ./.env.cbrowser; set +a
   cbrowser fill "Password" "$SITE_PASS"
   ```

   The command you write contains `"$SITE_PASS"`, not the value, and `fill` prints only `Filled: <selector>`. The expanded value is still visible to the local system for the life of the process (for example in the process list), so on a shared machine prefer a dedicated test account.
4. **Over MCP the value is in the tool call.** `fill` and `type_text` take the text as an argument, which the conversation records. For a real account, log in with the CLI using env vars, save the session, and `load_session` it from the local stdio MCP server instead.
5. **Use test accounts for automation.** A throwaway account with the least privilege the test needs is the only kind whose password can safely appear anywhere.
6. **Never automate a consent screen or a second factor without asking.** Both exist to require a person.

---

## What CBrowser keeps on disk

Everything lives under the data dir: CBROWSER_DATA_DIR, default `~/.cbrowser`. The sensitive parts:

| Path (under the data dir) | What it holds |
|---------------------------|---------------|
| `sessions/<name>.json` | Saved sessions: every cookie (HttpOnly ones included) with its value, localStorage, sessionStorage, the URL and viewport. Plain JSON, not encrypted. |
| `browser-state/` | The persistent browser profile the CLI reuses between commands: cookies and storage of every site you visited, plus `persisted-cookies.json` (a plain JSON copy of the cookies, written when a browser closes) and `last-session.json` (the last URL). |
| `har/` | HAR recordings. They include request headers, so they can contain auth tokens. |
| `config.json` | The Anthropic API key, if you set one with `cbrowser config set-api-key`. |
| `geo-proxy.json` | Residential proxy credentials, if configured. |
| `accounts/` | Per-account data on a hosted server. |

Session files are written with your default file permissions, so on a typical system other local users can read them. Lock the directory down:

```bash
chmod 700 ~/.cbrowser          # or your CBROWSER_DATA_DIR
```

A session name may contain only letters, digits, dot, dash and underscore (64 characters at most), so a name cannot point outside the sessions directory.

On the hosted MCP servers each account's sessions are kept in that account's own directory: `list_sessions` there shows only yours, and a session saved on your machine is not on the server.

---

## Output that shows secret values

Some commands print parts of cookie or storage values. Do not paste their output into tickets, chats, commits or reports.

- `cbrowser cookie list` prints the first 50 characters of each cookie value.
- `cbrowser cookie set <name> <value>` echoes the full value back.
- `cbrowser session show <name>` prints the first 60 characters of each localStorage and sessionStorage value. Tokens kept in localStorage show up here.
- `manage_cookies` with `action: "get"` and `manage_storage` with `action: "get"` return full values to the conversation.
- `cbrowser network list`, `get_network_requests` and HAR files can include request headers.

`cbrowser session list` and `list_sessions` are safe to show: they report names, domains, dates, counts and sizes, not values.

---

## Exported sessions

`cbrowser session export <name>` writes a copy of the session JSON, with every cookie value, to `<name>.json` in the current directory unless you pass `--output <file>`. If you are inside a repo, that file is one `git add .` away from being published. Write it outside the repo, and delete it once it has been imported where it was needed:

```bash
cbrowser session export example-admin --output ~/private/example-admin.json
cbrowser session import ~/private/example-admin.json
```

`session import` names the session after the file name.

---

## Deleting logged-in state

Deleting a file does not log the session out on the server. If a session file may have leaked, also log out on the site or revoke the session in the site's security settings.

| To remove | Command |
|-----------|---------|
| One saved session | `cbrowser session delete <name>` or `delete_session` |
| Saved sessions not used for N days | `cbrowser session cleanup --older-than <days>` (default 30) |
| One cookie from the browser profile | `cbrowser cookie delete <name>` (add `--domain` to limit it) |
| All cookies and storage in the browser profile | `cbrowser reset` (saved sessions are kept) |
| Everything CBrowser wrote | `cbrowser uninstall --yes` (see below) |

`cbrowser cookie clear` currently reports success from the CLI without starting the browser, so the profile's cookies survive it. Use `cbrowser reset` or `cookie delete` instead. Over MCP, `manage_cookies` with `action: "clear"` works on the live browser after a `navigate`.

Note that the general `cbrowser cleanup` also prunes saved sessions: it keeps the newest 3 and deletes older ones last written more than 7 days ago. Run `cbrowser cleanup --dry-run` first, or raise `--keep-sessions <n>`, if you rely on older sessions.

---

## Removing everything: `cbrowser uninstall`

`npm uninstall -g cbrowser` removes the package and nothing it wrote. The API key, proxy credentials, browser profile and saved sessions all survive it.

```bash
cbrowser uninstall                 # dry run: lists what would go, removes nothing
cbrowser uninstall --yes           # actually removes it
cbrowser uninstall --yes --keep-config   # keep the API key and proxy config for a reinstall
```

The dry run lists credentials and sessions first, with sizes, and counts how many items hold credentials or live session cookies. It also lists the Claude skill directory installed by `cbrowser install-skill`. It acts on the current CBROWSER_DATA_DIR, so run it once per data dir you used.

---

## CI and shared machines

- Give every job its own data dir and remove it afterwards:

  ```bash
  export CBROWSER_DATA_DIR=$(mktemp -d)
  # ... run the job ...
  rm -rf "$CBROWSER_DATA_DIR"
  ```

- Keep the test account's password in the CI secret store and expose it to the job as an environment variable.
- Do not cache or upload the data dir as a build artifact. Screenshots and reports are usually fine to keep; `sessions/`, `browser-state/` and `har/` are not.
