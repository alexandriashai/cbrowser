/**
 * color-scheme.ts — the colorScheme parameter every MCP tool that sets up
 * rendering takes.
 *
 * Alexa, 2026-10-28: "add a color schema flag to Cbrowser", then "also add to
 * mcp tools". The engine read CBROWSER_COLOR_SCHEME and the config file, but no
 * tool took a scheme, so a hosted caller could not see a site's dark theme.
 * The tools that take a device (they decide how the page renders) take this
 * too; tools that work on a session through _browserToken inherit the scheme
 * navigate set on it. One definition, so the values and wording cannot drift.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { z } from "zod";

export const colorSchemeParam = z.enum(["light", "dark", "no-preference"]).optional().describe(
  "Color scheme to render with: what the page's prefers-color-scheme media query sees ('light', 'dark' or 'no-preference'). Omit for the browser default (light). Applied without a relaunch, so on a session (_browserToken) it switches the page in place and stays for every later call on that session until another scheme is passed; omitting it does not reset it, pass 'light' to go back to the default.",
);
