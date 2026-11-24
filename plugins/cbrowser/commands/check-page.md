---
description: Check a page in a real browser in light and dark themes at desktop and phone width, and report what looks or behaves wrong
argument-hint: <url>
---

Check $ARGUMENTS in a real browser with the cbrowser MCP tools, in four combinations: desktop light, desktop dark, phone light, phone dark. This is the check to run after changing a page, before saying it works.

If the cbrowser tools are not available in this session, say so and stop.

1. Desktop: call `navigate` with the URL, `viewport: "1440x900"` and `colorScheme: "light"`. Keep the `_browserToken` it returns. Look at the screenshot.
2. Call `navigate` again with the same URL, that `_browserToken` and `colorScheme: "dark"`. Look at the screenshot.
3. Phone: call `navigate` with the URL, `device: "iphone-15"` and `colorScheme: "light"`, with no `_browserToken` (a session keeps the device it started with, so the phone needs a new one). Keep its token, then repeat with `colorScheme: "dark"`.
4. On each session, call `get_console_messages` and `get_network_requests` and note errors and failed requests.

Report per combination:

- What is wrong, if anything: text that is hard to read against its background, content cut off or overflowing sideways, overlapping elements, missing images, a layout that did not adapt, a theme that did not switch.
- Console errors and failed requests, once per session.

End with a one-line verdict per combination (looks right, or the problem). Say plainly when a screenshot was not clear enough to judge something. A hosted server cannot open `localhost` or private addresses; the plugin's local server can.
