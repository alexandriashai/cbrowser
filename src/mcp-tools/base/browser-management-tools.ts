/**
 * CBrowser MCP Tools - Browser Management Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import { getStatusInfo } from "../../config.js";
import { VERSION } from "../../version.js";

/**
 * Number of tools this server will return from tools/list.
 *
 * Reads the SDK's registry and counts the ENABLED entries, which is exactly the
 * filter its tools/list handler applies, so status and tools/list cannot
 * disagree. Every registration path lands here -- registerTool, the deprecated
 * tool(), and the tier/security wrappers, which patch the same instance in
 * place. Undefined when the object is not an SDK server, so the status payload
 * omits the count rather than inventing one. (2026-10-07)
 */
export function countRegisteredTools(server: unknown): number | undefined {
  const registry = (server as { _registeredTools?: Record<string, { enabled?: boolean }> } | null)?._registeredTools;
  if (!registry || typeof registry !== "object") return undefined;
  return Object.values(registry).filter((t) => t?.enabled !== false).length;
}

/**
 * Register browser management tools (4 tools: status, browser_health, browser_recover, reset_browser)
 */
export function registerBrowserManagementTools(
  server: McpServer,
  { getBrowser, getToolCount, getBrowserByToken }: ToolRegistrationContext
): void {
  // This whole file predated session tokens: every tool below called getBrowser()
  // directly, so on the HTTP transport they answered about a fresh blank browser
  // rather than the caller's. That is worst for the tools whose entire purpose is
  // to report on or repair the caller's session. (2026-07-28)
  const resolve = async (_browserToken?: string) => {
    if (getBrowserByToken) {
      const r = await getBrowserByToken(_browserToken);
      return { b: r.browser, token: r.token as string | undefined };
    }
    return { b: await getBrowser(), token: undefined };
  };
  /** True when we are multi-session (HTTP) and the caller named no session. */
  const unbound = (_browserToken?: string) => Boolean(getBrowserByToken) && !_browserToken;
  server.registerTool("status", {
    title: "Browser Status",
    description: "Get CBrowser environment status and diagnostics including data directories, installed browsers, configuration, self-healing cache statistics, and MCP tool count",
    inputSchema: {},
    // The view for this tool. Nested form: the SDK resolver reads
    // _meta.ui.resourceUri first and falls back to the flat "ui/resourceUri"
    // key, so both are valid and this is the preferred one.
    //
    // status is deliberately the first tool to get a view. It needs no
    // subresources at all, so it exercises the whole ui:// path -- declaration,
    // resources/read, iframe injection, hydration -- while leaving the separate
    // question of what the sandbox CSP will fetch for the capture player.
    _meta: { ui: { resourceUri: "ui://cbrowser/status" } },
    annotations: {
      title: "Browser Status",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async () => {
      // The description promises an MCP tool count. No server ever supplied
      // getToolCount (the remote context was { getBrowser, getBrowserByToken }),
      // so the optional call was always undefined and the field never shipped.
      // Count the server this tool is registered on when no provider is given.
      // (2026-10-07)
      const toolCount = getToolCount?.() ?? countRegisteredTools(server);
      const info = await getStatusInfo(VERSION, toolCount);
      // The host fetches the declared ui:// resource itself and pushes THIS
      // result into the iframe, where the view renders from it. Returning HTML
      // here instead put several KB of markup into the model's context as a
      // string and rendered nothing: a content block is not a view.
      //
      // No outputSchema, and so no structuredContent: an empty outputSchema is
      // expanded by the SDK into a closed schema that permits no properties,
      // which every real payload violates. The view falls back to parsing this
      // text block, which is what Anthropic's own example does.
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(info, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool("browser_health", {
    title: "Browser Health Check",
    description: "Check if the browser is healthy and responsive. Use this before operations if you suspect the browser may have crashed. Pass _browserToken to check YOUR session — without it, a fresh session is checked and will always look healthy.",
    inputSchema: {
      _browserToken: z.string().optional().describe("Browser session token from a previous tool call"),
    },
    annotations: {
      title: "Browser Health Check",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ _browserToken }) => {
      const { b, token } = await resolve(_browserToken);
      const result = await b.isBrowserHealthy();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ...result,
              // Without this the caller cannot tell whose browser was reported on,
              // and a crashed session reads as healthy.
              checkedSession: _browserToken ?? (unbound(_browserToken) ? "a new blank session (no _browserToken supplied)" : "the single local session"),
              ...(token ? { _browserToken: token } : {}),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool("browser_recover", {
    title: "Recover Browser",
    description: "Attempt to recover from a browser crash by restarting the browser process. Use this when browser_health returns unhealthy.",
    inputSchema: {
      restoreUrl: z.string().url().optional().describe("URL to restore after recovery (uses last known URL if not provided)"),
      maxAttempts: z.number().optional().default(3).describe("Maximum recovery attempts"),
      _browserToken: z.string().optional().describe("Browser session token from a previous tool call — the session to recover"),
    },
    annotations: {
      title: "Recover Browser",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ restoreUrl, maxAttempts, _browserToken }) => {
      const { b, token } = await resolve(_browserToken);
      const result = await b.recoverBrowser({ restoreUrl, maxAttempts });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ...result,
              recoveredSession: _browserToken ?? (unbound(_browserToken) ? "a new blank session (no _browserToken supplied — your crashed session was NOT recovered)" : "the single local session"),
              ...(token ? { _browserToken: token } : {}),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool("reset_browser", {
    title: "Reset Browser",
    description: "Reset the browser to a clean state. Clears all cookies, localStorage, sessionStorage, and browser state. Requires _browserToken on the HTTP transport so the correct session is cleared.",
    inputSchema: {
      _browserToken: z.string().optional().describe("Browser session token identifying the session to reset (required on the HTTP transport)"),
    },
    annotations: {
      title: "Reset Browser",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ _browserToken }) => {
      // Refuse rather than resolve. Every other tool here degrades to a fresh
      // session; for this one that silently reported "cookies cleared" while the
      // caller's real cookies survived. A false success on a privacy operation is
      // worse than an error, so this is the one tool that fails closed.
      if (unbound(_browserToken)) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "no_session",
              message: "reset_browser needs a _browserToken. Without one it would create and clear a new blank session, leaving your actual cookies, localStorage and sessionStorage intact while reporting success. Pass the _browserToken returned by navigate().",
            }, null, 2),
          }],
        };
      }
      const { b, token } = await resolve(_browserToken);
      await b.reset();
      await b.launch();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "Browser reset to clean state and relaunched",
              resetSession: _browserToken ?? "the single local session",
              ...(token ? { _browserToken: token } : {}),
            }, null, 2),
          },
        ],
      };
    }
  );

  // ── manage_tabs ──
  server.registerTool("manage_tabs", {
    title: "Manage Browser Tabs",
    description: "List, create, switch, or close browser tabs. Useful for multi-page workflows.",
    inputSchema: {
      action: z.enum(["list", "create", "switch", "close"]).describe("Action: list (show all tabs), create (new tab), switch (focus tab), close (close tab)"),
      url: z.string().optional().describe("URL for new tab (create action)"),
      index: z.number().optional().describe("Tab index to switch to or close (0-based)"),
      // Tabs belong to a browser context, so without the token this listed the tabs
      // of a blank session — reporting one about:blank tab regardless of how many
      // the caller actually had open. (2026-07-28)
      _browserToken: z.string().optional().describe("Browser session token from a previous tool call"),
    },
    annotations: { title: "Manage Tabs", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ action, url, index, _browserToken }) => {
    const { b } = await resolve(_browserToken);
    const context = (b as any).context;
    if (!context) {
      return {isError: true,  content: [{ type: "text" as const, text: JSON.stringify({ error: "No browser context. Navigate to a URL first." }) }] };
    }

    if (action === "list") {
      const pages = context.pages();
      const tabs = pages.map((p: any, i: number) => ({ index: i, url: p.url(), title: p.url() }));
      // Get titles async
      for (const tab of tabs) {
        try { tab.title = await context.pages()[tab.index].title(); } catch { /* keep URL */ }
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({ tabs, count: tabs.length }) }] };
    }

    if (action === "create") {
      const page = await context.newPage();
      if (url) await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      // Switch to new tab
      (b as any).page = page;
      const title = await page.title().catch(() => "");
      return { content: [{ type: "text" as const, text: JSON.stringify({ created: true, url: page.url(), title, index: context.pages().length - 1 }) }] };
    }

    if (action === "switch" && index !== undefined) {
      const pages = context.pages();
      if (index < 0 || index >= pages.length) {
        return {isError: true,  content: [{ type: "text" as const, text: JSON.stringify({ error: `Tab ${index} doesn't exist. ${pages.length} tabs open (0-${pages.length - 1}).` }) }] };
      }
      (b as any).page = pages[index];
      const title = await pages[index].title().catch(() => "");
      return { content: [{ type: "text" as const, text: JSON.stringify({ switched: true, index, url: pages[index].url(), title }) }] };
    }

    if (action === "close" && index !== undefined) {
      const pages = context.pages();
      if (index < 0 || index >= pages.length) {
        return {isError: true,  content: [{ type: "text" as const, text: JSON.stringify({ error: `Tab ${index} doesn't exist.` }) }] };
      }
      if (pages.length <= 1) {
        return {isError: true,  content: [{ type: "text" as const, text: JSON.stringify({ error: "Can't close the last tab." }) }] };
      }
      await pages[index].close();
      // If we closed the active tab, switch to first remaining
      const remaining = context.pages();
      (b as any).page = remaining[0];
      return { content: [{ type: "text" as const, text: JSON.stringify({ closed: index, remainingTabs: remaining.length }) }] };
    }

    return {isError: true,  content: [{ type: "text" as const, text: JSON.stringify({ error: "Invalid params. 'switch'/'close' require index, 'create' optionally takes url." }) }] };
  });
}
