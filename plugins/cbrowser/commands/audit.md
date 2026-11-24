---
description: Run CBrowser's free audits on a page (AI-agent readiness, accessibility empathy, bugs) and list the fixes that matter most
argument-hint: <url> [persona,persona]
---

Audit $ARGUMENTS with the cbrowser MCP tools. Every tool used here is free: none needs an Anthropic API key. The first argument is the URL; an optional second argument is a comma-separated list of personas for the empathy audit (default: `cognitive-adhd,low-vision-magnified,motor-impairment-tremor`).

If the cbrowser tools are not available in this session, say so and stop; do not substitute another browser tool.

1. Run `agent_ready_audit` on the URL. Note the overall score, the grade, the weakest category and its top issues.
2. Run `empathy_audit` once per persona, one persona per call. For each, note the score and its top barriers.
3. Run `hunt_bugs` on the URL. Note broken links, console errors and failed requests.
4. If a tool reports that the server cannot reach the host (the hosted server opens only public internet addresses), say so and suggest running cbrowser locally: the cbrowser-local plugin, or `npx cbrowser mcp-server`.
5. If the cbrowser server shows as needing sign-in, tell the user to run `/mcp`, pick cbrowser, and sign in or create a free account in the browser page that opens. Never ask for a password or key in the chat.

Then report, in this order:

- One line per audit: the score and what it means in plain words.
- The five fixes that would help most, across all three audits, each with the element or page area it concerns and what to change. Merge duplicates (the same missing label found by two audits is one fix).
- Anything you could not check and why.

Offer `remediation_patches` for code-level fixes if the user wants them. Do not run keyed tools (`cognitive_journey_autonomous`, `compare_personas`) without asking.
