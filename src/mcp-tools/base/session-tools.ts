/**
 * CBrowser MCP Tools - Session Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer, ToolRegistrationContext } from "../types.js";

/**
 * Register session tools (4 tools: save_session, load_session, list_sessions, delete_session)
 */
export function registerSessionTools(
  server: McpServer,
  { getBrowser, getBrowserByToken }: ToolRegistrationContext
): void {
  server.registerTool("save_session", {
    title: "Save Browser Session",
    description: "Save browser session (cookies, storage) for later use",
    inputSchema: {
      name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, "letters, digits, dot, dash or underscore only (max 64)").describe("Name for the saved session"),
      _browserToken: z.string().optional().describe("Browser session token from a previous tool call — required on the HTTP transport to save the session you actually navigated"),
      force: z.boolean().optional().describe("Save even when the context is blank (about:blank). Default false."),
    },
    annotations: {
      title: "Save Browser Session",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ name, _browserToken, force }) => {
      // DATA LOSS FIX (2026-07-28). Without _browserToken this bound to a fresh
      // blank browser on the HTTP transport, saved an empty about:blank context,
      // and returned `success: true`. A user saved an authenticated session, was
      // told it worked, and later restored nothing — auth-state loss with a
      // success receipt. The blank-context refusal below is the second half: a
      // save that captured nothing must not report success.
      let b;
      let token: string | undefined;
      if (getBrowserByToken) {
        const resolved = await getBrowserByToken(_browserToken);
        b = resolved.browser;
        token = resolved.token;
      } else {
        b = await getBrowser();
      }

      if (!force) {
        // `getPage()` (browser.ts:863) then Playwright's synchronous `page.url()`
        // — the same pair browser.ts:799 uses. Verified rather than assumed.
        let url: string | undefined;
        try { url = (await b.getPage()).url(); } catch { url = undefined; }
        if (!url || url === "about:blank") {
          return {
            isError: true,
            content: [{
              type: "text",
              text: JSON.stringify({
                success: false,
                error: "blank_context",
                message: `Refusing to save session '${name}': the browser is at ${url || "no page"} with nothing to persist. Navigate first and pass the _browserToken navigate returned, or set force:true.`,
                ...(token ? { _browserToken: token } : {}),
              }, null, 2),
            }],
          };
        }
      }

      await b.saveSession(name);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, sessionName: name, ...(token ? { _browserToken: token } : {}) }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool("load_session", {
    title: "Load Browser Session",
    description: "Load a previously saved session",
    inputSchema: {
      name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, "letters, digits, dot, dash or underscore only (max 64)").describe("Name of the session to load"),
      // The mirror of the save_session data-loss bug. loadSession restores cookies
      // and storage INTO a browser context; without the caller's token it restored
      // them into a throwaway browser on the HTTP transport, so the user's actual
      // session stayed unauthenticated while the call reported success.
      // (2026-07-28)
      _browserToken: z.string().optional().describe("Browser session token from a previous tool call — required on the HTTP transport to restore into the session you are actually using"),
    },
    annotations: {
      title: "Load Browser Session",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ name, _browserToken }) => {
      let b;
      let token: string | undefined;
      if (getBrowserByToken) {
        const resolved = await getBrowserByToken(_browserToken);
        b = resolved.browser;
        token = resolved.token;
      } else {
        b = await getBrowser();
      }
      const result = await b.loadSession(name);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ...result, ...(token ? { _browserToken: token } : {}) }, null, 2),
          },
        ],
        // Nothing was loaded, so it is an error (and a charged call is refunded).
        ...(result.success ? {} : { isError: true as const }),
      };
    }
  );

  server.registerTool("list_sessions", {
    title: "List Saved Sessions",
    description: "List all saved sessions with metadata (name, domain, cookies count, localStorage keys, created date, size)",
    inputSchema: {},
    annotations: {
      title: "List Saved Sessions",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async () => {
      const b = await getBrowser();
      const sessions = b.listSessionsDetailed();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ sessions }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool("delete_session", {
    title: "Delete Saved Session",
    description: "Delete a saved session by name",
    inputSchema: {
      name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, "letters, digits, dot, dash or underscore only (max 64)").describe("Name of the session to delete"),
    },
    annotations: {
      title: "Delete Saved Session",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ name }) => {
      const b = await getBrowser();
      const deleted = b.deleteSession(name);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: deleted, name, message: deleted ? `Session '${name}' deleted` : `Session '${name}' not found` }),
          },
        ],
      };
    }
  );
}
