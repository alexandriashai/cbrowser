# CBrowser for Claude

Browser automation that tests a site the way real people use it. Claude opens pages in a real browser, clicks and types, and runs audits that ask whether a visitor (a first-timer, someone using a screen reader, an AI agent) can actually finish the task.

This plugin connects Claude to CBrowser's hosted servers at `demo.cbrowser.ai`. If you want CBrowser to run on your own machine instead (no account, and it can test `localhost`), install `cbrowser-local` from the same marketplace instead of this one.

## What you get

- **The CBrowser skill**: tells Claude which tool answers which question, what costs credits, and how to read the scores.
- **The hosted MCP server**: navigate, click, fill, extract and screenshot; free AI-readiness, accessibility-empathy and bug-hunting audits; persona journeys, natural-language tests, visual and performance regression, and screen capture. Which tools you can call depends on your plan.
- **`/cbrowser:audit <url>`**: runs the free audits and lists the five fixes that would help most.
- **`/cbrowser:check-page <url>`**: checks a page in light and dark themes at desktop and phone width and reports what looks or behaves wrong.

## Signing in

The first time Claude connects, the server asks you to sign in. In Claude Code, run `/mcp`, choose `cbrowser`, and a CBrowser page opens in your browser. Sign in, or create a free account there: you enter your email, then the 6-digit code it sends you, a name and a password. The Free plan comes with credits to start and needs no card.

Never paste a password or API key into the chat. The sign-in page is the only place they go.

## What data it sends

The plugin's tools run on CBrowser's servers, so the following leaves your machine:

- **Your sign-in or sign-up details**: email, name and password, entered on the CBrowser sign-in page (not in Claude). Passwords are stored only as a one-way hash.
- **Every tool call**: the tool name and its arguments, which include the URLs you test and any text Claude types into a page for you. CBrowser's servers load those pages in a headless browser.
- **Results**: tool results (scores, findings, screenshots of the pages tested) are stored with your account so your dashboard at cbrowser.ai can show them, along with which tools you called and the credits each used.
- **Request logs**: IP address, time and user agent, for security and debugging.
- **If Claude uses the `cbrowser` command line instead**: the skill can fall back to it when Claude has a shell. `npx cbrowser` downloads the package from npm, and installing it downloads Chromium. The CLI then loads the pages you test from your own machine; your tool calls and results do not go to CBrowser. Two exceptions: `cbrowser ask` sends your question, with no account details, to cbrowser.ai for an answer, and features that need an AI model send page content to Anthropic only if you set your own Anthropic API key.

The server opens only public internet addresses: it will not load `localhost` or a private network. Browser sessions are isolated per user and closed after five minutes idle; cookies and history from them are not kept. Details: [Privacy Policy](https://cbrowser.ai/privacy) and [Terms](https://cbrowser.ai/terms).

## Links

- Documentation: https://cbrowser.ai/docs
- Source: https://github.com/alexandriashai/cbrowser (MIT)
- Issues: https://github.com/alexandriashai/cbrowser/issues
