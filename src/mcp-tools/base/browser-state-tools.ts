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
    description: "Run JavaScript in the page context and return the result. The script is evaluated as an expression (return value is captured). For complex scripts, wrap in an IIFE: `(() => { ... return result; })()`. Red zone: arbitrary page script can activate any control (click, submit, delete) without passing the element-level red-zone gate that click, press_key, type_text and drag apply, so it is refused unless force is true. A refused call runs nothing and returns zone \"red\"; a forced call runs and reports zone \"red\". For reading the page, prefer extract, analyze_page or get_console_messages, which need no force.",
    inputSchema: {
      script: z.string().describe("JavaScript to execute in the page context"),
      force: z.boolean().optional().describe("Required to run any script: evaluate_script is red zone because a script can activate any control. Without it the call is refused and nothing runs."),
      _browserToken: z.string().optional().describe("Browser session token"),
    },
    annotations: { title: "Execute JavaScript", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ script, force, _browserToken }) => {
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
      const result = await page.evaluate(script);
      return { content: [{ type: "text" as const, text: JSON.stringify({ result, zone: "red", _browserToken: token }, null, 2) }] };
    } catch (e) {
      return {isError: true,  content: [{ type: "text" as const, text: JSON.stringify({ error: (e as Error).message, zone: "red", _browserToken: token }, null, 2) }] };
    }
  });

  // ── get_console_messages ──
  server.registerTool("get_console_messages", {
    title: "Get Console Messages",
    description: "Get browser console messages (log, warn, error, info) captured since the last navigation or since the last call to this tool with clear=true.",
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
    const page = await b.getPage();

    // Capture current console messages via evaluate
    const messages = await page.evaluate(() => {
      // Access captured messages if the capture script has been injected
      return (window as any).__cbrowser_console_messages || [];
    });

    // Inject console capture if not already done
    await page.evaluate(() => {
      if ((window as any).__cbrowser_console_capture_installed) return;
      (window as any).__cbrowser_console_messages = (window as any).__cbrowser_console_messages || [];
      const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
      for (const [type, fn] of Object.entries(orig)) {
        (console as any)[type] = (...args: unknown[]) => {
          (window as any).__cbrowser_console_messages.push({
            type, text: args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '),
            timestamp: Date.now(),
          });
          fn.apply(console, args);
        };
      }
      (window as any).__cbrowser_console_capture_installed = true;
    });

    const filtered = filter === "all" ? messages : messages.filter((m: any) => m.type === filter);

    if (clear) {
      await page.evaluate(() => { (window as any).__cbrowser_console_messages = []; });
    }

    return { content: [{ type: "text" as const, text: JSON.stringify({ messages: filtered, count: filtered.length, _browserToken: token }, null, 2) }] };
  });

  // ── get_network_requests ──
  server.registerTool("get_network_requests", {
    title: "Get Network Requests",
    description: "Get network requests captured during the current page session. Shows URLs, status codes, methods, and timing.",
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
    const summary = filtered.slice(0, 50).map(r => ({
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
    description: "Read, set, or clear browser cookies for the current page.",
    inputSchema: {
      action: z.enum(["get", "set", "clear", "delete"]).describe("Action: get (read all), set (add/update), clear (delete all), delete (remove specific)"),
      name: z.string().optional().describe("Cookie name (required for set/delete)"),
      value: z.string().optional().describe("Cookie value (required for set)"),
      domain: z.string().optional().describe("Cookie domain (for set)"),
      path: z.string().optional().default("/").describe("Cookie path (for set, default: /)"),
      _browserToken: z.string().optional().describe("Browser session token"),
    },
    annotations: { title: "Manage Cookies", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ action, name, value, domain, path, _browserToken }) => {
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
        expires: Math.floor(Date.now() / 1000) + 86400, // 24 hours
        httpOnly: false, secure: false, sameSite: "Lax" as const,
      }]);
      return { content: [{ type: "text" as const, text: JSON.stringify({ set: { name, value, domain: cookieDomain }, _browserToken: token }, null, 2) }] };
    }
    if (action === "delete" && name) {
      await b.deleteCookie(name);
      return { content: [{ type: "text" as const, text: JSON.stringify({ deleted: name, _browserToken: token }, null, 2) }] };
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
