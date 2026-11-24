# CBrowser (local) for Claude Code

The same CBrowser skill and slash commands as the `cbrowser` plugin, with the MCP server running on your own machine instead of CBrowser's hosted servers. No account is needed, all 137 local tools are available, and it can test `localhost` and sites on your private network.

Install this or `cbrowser`, not both.

## What you get

- **The CBrowser skill**: which tool answers which question, what needs an API key, how to read the scores.
- **The local MCP server**: `npx -y cbrowser@21 mcp-server`, started by Claude Code.
- **`/cbrowser:audit <url>`** and **`/cbrowser:check-page <url>`**: the free audits with the top fixes, and a light/dark, desktop/phone check of a page.

## Requirements

Node.js 20.19+ or 22.12+. The first start downloads the cbrowser package and Chromium (about 1.3 GB), which can outlast Claude Code's server start timeout on a slow connection; if the server shows as failed the first time, it works in the next session. To download it beforehand, run `npm install -g cbrowser` (the plugin then starts in about a second). For cross-browser testing, also run `cbrowser install-browsers firefox webkit`.

## What data it sends

The server runs on your machine and loads the pages you ask it to test, from your machine. Beyond those pages, data leaves your machine only in these cases:

- **Downloading cbrowser**: npm fetches the package and Playwright fetches the browsers on first start.
- **`question_answer`**: the question you ask about CBrowser is sent to cbrowser.ai, which answers from its documentation. No account is involved.
- **Tools that need an Anthropic API key** (persona comparisons, competitive benchmarks): only if you configured your own key with `cbrowser config set-api-key`, and then the page content and screenshots those tools reason about go to Anthropic's API under your key.

Nothing is sent to CBrowser about the pages you test or the results. Results stay in `~/.cbrowser` on your machine. See the [Privacy Policy](https://cbrowser.ai/privacy).

## Links

- Documentation: https://cbrowser.ai/docs
- Source: https://github.com/alexandriashai/cbrowser (MIT)
- Issues: https://github.com/alexandriashai/cbrowser/issues
