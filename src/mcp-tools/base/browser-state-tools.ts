/**
 * CBrowser MCP Tools - Browser State Tools
 *
 * evaluate_script, get_console_messages, get_network_requests, manage_cookies, manage_storage
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import { evaluateScriptRefusal, RED_ZONE_MCP_HINT } from "../../security/script-gate.js";
import { evaluateScript } from "../../eval-script.js";

/**
 * Register browser state tools (5 tools)
 */
export function registerBrowserStateTools(
  server: McpServer,
  { getBrowser, getBrowserByToken }: ToolRegistrationContext
): void {

  // ── evaluate_script ──
  // Red zone, and refused without force (src/security/script-gate.ts). A
  // script can click "Delete account" that click() refuses, so this was the
  // way around the element-level gate: measured on 19.2.0, the refused click
  // ran as one line of evaluate_script and the response named no zone.
  server.registerTool("evaluate_script", {
    title: "Execute JavaScript",
    description: "Run JavaScript in the page context and return the result. Four shapes work, as with `cbrowser evaluate`: an expression (its value); statements (the value of the last one, e.g. `function t(){ return document.title }; t()`); a body with a top-level `return` (run as a function body); and a function literal such as `(sel, n) => ...`, which is called with `args`. `args` is also in scope as an array in the statement forms. Red zone: arbitrary page script can activate any control (click, submit, delete) without passing the element-level red-zone gate that click, press_key, type_text and drag apply, so it is refused unless force is true. A refused call runs nothing and returns zone \"red\"; a forced call runs and reports zone \"red\". For reading the page, prefer extract, analyze_page or get_console_messages, which need no force.",
    inputSchema: {
      script: z.string().describe("JavaScript to execute in the page context: an expression, statements, a body with return, or a function literal"),
      args: z.array(z.unknown()).optional().describe("Arguments for a function-literal script, and `args` in scope for the other forms. JSON values only. Default []."),
      force: z.boolean().optional().describe("Required to run any script: evaluate_script is red zone because a script can activate any control. Without it the call is refused and nothing runs."),
      _browserToken: z.string().optional().describe("Browser session token"),
    },
    annotations: { title: "Execute JavaScript", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ script, args, force, _browserToken }) => {
    // Refused before a browser is even resolved: nothing about this call may
    // touch the page.
    const refusal = evaluateScriptRefusal(force);
    if (refusal) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: JSON.stringify({
          success: false,
          result: null,
          zone: "red",
          message: `${refusal}. ${RED_ZONE_MCP_HINT}`,
          howToRun: RED_ZONE_MCP_HINT,
          ...(_browserToken ? { _browserToken } : {}),
        }, null, 2) }],
      };
    }
    let b, token;
    if (getBrowserByToken) { const r = await getBrowserByToken(_browserToken); b = r.browser; token = r.token; }
    else { b = await getBrowser(); }
    const page = await b.getPage();
    try {
      // The compiler `cbrowser evaluate` and the daemon use. page.evaluate on
      // the raw string took only an expression: a function declaration and a
      // call was a SyntaxError, a top-level return threw, and an arrow function
      // came back uncalled. (audit M2, 2026-10-21)
      const result = await evaluateScript(page, script, args ?? []);
      return { content: [{ type: "text" as const, text: JSON.stringify({ result, zone: "red", _browserToken: token }, null, 2) }] };
    } catch (e) {
      return {isError: true,  content: [{ type: "text" as const, text: JSON.stringify({ error: (e as Error).message, zone: "red", _browserToken: token }, null, 2) }] };
    }
  });

  // ── get_console_messages ──
  // Reads the tab's capture buffer (CBrowser.getConsoleMessages). It used to
  // patch console.* from page script on its first call, so it returned [] for
  // everything logged before that call, lost the patch on every navigation,
  // never saw browser-generated messages such as a resource 404, and its
  // "warning" filter matched nothing because the patch recorded "warn". Measured
  // on 19.3.6 with a page that logs "hi" and 404s an image: first call returned
  // 0 messages. (v8 B27, 2026-10-10)
  server.registerTool("get_console_messages", {
    title: "Get Console Messages",
    description: "Get the current tab's console messages (log, info, warning, error, debug, ...) as the browser recorded them since the tab opened: messages logged during page load, uncaught exceptions (type error, source pageerror), and browser-generated messages such as \"Failed to load resource\" for a 404 (url names the resource). Messages persist across navigations in the same tab and each carries the pageUrl it was logged on; the latest 500 are kept and dropped counts any older ones evicted. clear=true empties the buffer after reading.",
    inputSchema: {
      filter: z.enum(["all", "error", "warning", "log", "info"]).optional().default("all").describe("Filter by message type"),
      clear: z.boolean().optional().default(false).describe("Clear captured messages after reading"),
      _browserToken: z.string().optional().describe("Browser session token"),
    },
    annotations: { title: "Console Messages", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ filter, clear, _browserToken }) => {
    let b, token;
    if (getBrowserByToken) { const r = await getBrowserByToken(_browserToken); b = r.browser; token = r.token; }
    else { b = await getBrowser(); }
    await b.getPage(); // launches (and attaches capture) if this session has no tab yet

    const { messages, dropped } = b.getConsoleMessages();
    const filtered = filter === "all" ? messages : messages.filter((m) => m.type === filter);

    if (clear) {
      b.clearConsoleMessages();
    }

    return { content: [{ type: "text" as const, text: JSON.stringify({
      messages: filtered,
      count: filtered.length,
      ...(dropped > 0 ? { dropped } : {}),
      _browserToken: token,
    }, null, 2) }] };
  });

  // ── get_network_requests ──
  server.registerTool("get_network_requests", {
    title: "Get Network Requests",
    description: "Get network requests captured during the current page session. Shows URLs, status codes, methods, and timing. Returns the 50 most recent matching requests, oldest first; total counts every match and showing how many were returned.",
    inputSchema: {
      filter: z.enum(["all", "xhr", "document", "script", "stylesheet", "image", "fetch"]).optional().default("all").describe("Filter by resource type"),
      clear: z.boolean().optional().default(false).describe("Clear captured requests after reading"),
      _browserToken: z.string().optional().describe("Browser session token"),
    },
    annotations: { title: "Network Requests", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ filter, clear, _browserToken }) => {
    let b, token;
    if (getBrowserByToken) { const r = await getBrowserByToken(_browserToken); b = r.browser; token = r.token; }
    else { b = await getBrowser(); }

    const requests = b.getNetworkRequests();
    let filtered = requests;
    if (filter !== "all") {
      filtered = requests.filter(r => r.resourceType === filter);
    }

    // Summarize for MCP output (avoid overwhelming Claude with raw data).
    // status/durationMs are the fields the description has always promised;
    // they are omitted per-row only while a request is still in flight.
    // The NEWEST 50. slice(0, 50) returned the oldest, so on a busy page the
    // request the caller had just triggered was never in the answer.
    // (audit M17, 2026-10-21)
    const summary = filtered.slice(-50).map(r => ({
      url: r.url.length > 120 ? r.url.substring(0, 120) + "..." : r.url,
      method: r.method,
      resourceType: r.resourceType,
      ...(r.status !== undefined ? { status: r.status, statusText: r.statusText } : {}),
      ...(r.durationMs !== undefined ? { durationMs: r.durationMs } : {}),
      ...(r.status === undefined ? { pending: true } : {}),
    }));

    if (clear) {
      b.clearNetworkHistory();
    }

    return { content: [{ type: "text" as const, text: JSON.stringify({ requests: summary, total: filtered.length, showing: summary.length, _browserToken: token }, null, 2) }] };
  });

  // ── manage_cookies ──
  server.registerTool("manage_cookies", {
    title: "Manage Cookies",
    description: "Read, set, or clear browser cookies for the current page. set writes a session cookie unless expires is given; delete honours domain.",
    inputSchema: {
      action: z.enum(["get", "set", "clear", "delete"]).describe("Action: get (read all), set (add/update), clear (delete all), delete (remove specific)"),
      name: z.string().optional().describe("Cookie name (required for set/delete)"),
      value: z.string().optional().describe("Cookie value (required for set)"),
      domain: z.string().optional().describe("Cookie domain. set: defaults to the current page's host. delete: only the cookie on this domain is removed (a leading dot is ignored); without it the name is removed on every domain."),
      path: z.string().optional().default("/").describe("Cookie path (for set, default: /)"),
      expires: z.number().optional().describe("For set: expiry as Unix time in seconds. Omitted or -1 = a session cookie, as `cbrowser cookie set` writes."),
      _browserToken: z.string().optional().describe("Browser session token"),
    },
    annotations: { title: "Manage Cookies", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ action, name, value, domain, path, expires, _browserToken }) => {
    let b, token;
    if (getBrowserByToken) { const r = await getBrowserByToken(_browserToken); b = r.browser; token = r.token; }
    else { b = await getBrowser(); }

    if (action === "get") {
      const cookies = await b.getCookies();
      return { content: [{ type: "text" as const, text: JSON.stringify({ cookies, count: cookies.length, _browserToken: token }, null, 2) }] };
    }
    if (action === "set" && name && value) {
      const page = await b.getPage();
      const pageUrl = page.url();
      const cookieDomain = domain || new URL(pageUrl).hostname;
      await b.setCookies([{
        name, value, domain: cookieDomain, path: path || "/",
        // A session cookie unless the caller names an expiry, as the CLI's
        // `cookie set` writes. This was a fixed 24 hours, so the same command
        // left a different cookie depending on which surface ran it.
        // (audit M19, 2026-10-21)
        expires: expires ?? -1,
        httpOnly: false, secure: false, sameSite: "Lax" as const,
      }]);
      return { content: [{ type: "text" as const, text: JSON.stringify({ set: { name, value, domain: cookieDomain, expires: expires ?? -1 }, _browserToken: token }, null, 2) }] };
    }
    if (action === "delete" && name) {
      // domain was accepted and ignored, so delete removed the name on every
      // domain. (audit M19, 2026-10-21)
      await b.deleteCookie(name, domain);
      return { content: [{ type: "text" as const, text: JSON.stringify({ deleted: name, ...(domain ? { domain } : { domain: "all" }), _browserToken: token }, null, 2) }] };
    }
    if (action === "clear") {
      await b.clearCookies();
      return { content: [{ type: "text" as const, text: JSON.stringify({ cleared: true, _browserToken: token }, null, 2) }] };
    }
    return {isError: true,  content: [{ type: "text" as const, text: JSON.stringify({ error: "Invalid params. 'set' requires name+value, 'delete' requires name." }, null, 2) }] };
  });

  // ── manage_storage ──
  server.registerTool("manage_storage", {
    title: "Manage Browser Storage",
    description: "Read, write, or clear localStorage and sessionStorage.",
    inputSchema: {
      storageType: z.enum(["local", "session"]).describe("Storage type: 'local' for localStorage, 'session' for sessionStorage"),
      action: z.enum(["get", "set", "remove", "clear"]).describe("Action to perform"),
      key: z.string().optional().describe("Storage key (required for get/set/remove)"),
      value: z.string().optional().describe("Value to set (required for set)"),
      _browserToken: z.string().optional().describe("Browser session token"),
    },
    annotations: { title: "Manage Storage", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ storageType, action, key, value, _browserToken }) => {
    let b, token;
    if (getBrowserByToken) { const r = await getBrowserByToken(_browserToken); b = r.browser; token = r.token; }
    else { b = await getBrowser(); }
    const page = await b.getPage();
    const storage = storageType === "local" ? "localStorage" : "sessionStorage";

    if (action === "get") {
      const result = await page.evaluate(([st, k]) => {
        const s = (window as any)[st];
        if (k) return { [k]: s.getItem(k) };
        const all: Record<string, string> = {};
        for (let i = 0; i < s.length; i++) { const key = s.key(i); if (key) all[key] = s.getItem(key); }
        return all;
      }, [storage, key] as const);
      return { content: [{ type: "text" as const, text: JSON.stringify({ storage: storageType, data: result, _browserToken: token }, null, 2) }] };
    }
    if (action === "set" && key && value !== undefined) {
      await page.evaluate(([st, k, v]) => { (window as any)[st].setItem(k, v); }, [storage, key, value] as const);
      return { content: [{ type: "text" as const, text: JSON.stringify({ storage: storageType, set: { [key]: value }, _browserToken: token }, null, 2) }] };
    }
    if (action === "remove" && key) {
      await page.evaluate(([st, k]) => { (window as any)[st].removeItem(k); }, [storage, key] as const);
      return { content: [{ type: "text" as const, text: JSON.stringify({ storage: storageType, removed: key, _browserToken: token }, null, 2) }] };
    }
    if (action === "clear") {
      await page.evaluate((st) => { (window as any)[st].clear(); }, storage);
      return { content: [{ type: "text" as const, text: JSON.stringify({ storage: storageType, cleared: true, _browserToken: token }, null, 2) }] };
    }
    return {isError: true,  content: [{ type: "text" as const, text: JSON.stringify({ error: "Invalid params" }, null, 2) }] };
  });
}
