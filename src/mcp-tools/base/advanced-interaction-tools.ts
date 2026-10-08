/**
 * CBrowser MCP Tools - Advanced Interaction Tools
 *
 * hover, type_text, press_key, handle_dialog, upload_file, drag
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import { summarizePlaywrightError } from "../../browser.js";

/**
 * Standard error response for an interaction tool.
 *
 * Every tool in this file used to have NO try/catch, so a Playwright failure
 * propagated raw: `drag` on a missing selector returned a 30-second timeout
 * dump complete with stack frames and the full "waiting for locator" log. The
 * 6.17 fix that summarises these was applied to `click` and never propagated
 * here — six tools, one missing helper. (2026-07-29)
 */
function interactionError(tool: string, err: unknown, token?: string) {
  const raw = err instanceof Error ? err.message : String(err);
  return {
    isError: true as const,
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        success: false,
        tool,
        error: summarizePlaywrightError(raw),
        _browserToken: token,
      }, null, 2),
    }],
  };
}

/**
 * Register advanced interaction tools (6 tools)
 */
export function registerAdvancedInteractionTools(
  server: McpServer,
  { getBrowser, getBrowserByToken }: ToolRegistrationContext
): void {

  // ── hover ──
  server.registerTool("hover", {
    title: "Hover Over Element",
    description: "Hover over an element to trigger tooltips, dropdowns, or hover states. Uses CSS selector or smart selector.",
    inputSchema: {
      selector: z.string().describe("CSS selector or text description of the element to hover"),
      _browserToken: z.string().optional().describe("Browser session token"),
    },
    annotations: { title: "Hover", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ selector, _browserToken }) => {
    let b, token;
    try {
    if (getBrowserByToken) { const r = await getBrowserByToken(_browserToken); b = r.browser; token = r.token; }
    else { b = await getBrowser(); }
    const result = await b.hover(selector);
    return { content: [{ type: "text" as const, text: JSON.stringify({ ...result, _browserToken: token }, null, 2) }] };
  } catch (err) {
      return interactionError("hover", err, token);
    }
  });

  // ── type_text ──
  server.registerTool("type_text", {
    title: "Type Text (Keyboard)",
    description: "Type text character by character using keyboard events. Unlike 'fill', this triggers keydown/keypress/keyup events for each character. Use for inputs that need real keyboard events (autocomplete, search-as-you-type, game inputs).",
    inputSchema: {
      text: z.string().describe("Text to type"),
      delay: z.number().optional().default(50).describe("Delay between keystrokes in ms (default 50)"),
      force: z.boolean().optional().describe("Type even when a newline or space in the text would activate a red-zone control"),
      _browserToken: z.string().optional().describe("Browser session token"),
    },
    annotations: { title: "Type Text", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ text, delay, force, _browserToken }) => {
    let b, token;
    try {
    if (getBrowserByToken) { const r = await getBrowserByToken(_browserToken); b = r.browser; token = r.token; }
    else { b = await getBrowser(); }
    const page = await b.getPage();
    // A newline is Enter: "4242\n" in a card field submits the checkout form. Same gate as press_key.
    const refusal = await b.keystrokeRedZone({ text }, force);
    if (refusal) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, typed: null, zone: "red", message: refusal, _browserToken: token }, null, 2) }] };
    }
    await page.keyboard.type(text, { delay: delay || 50 });
    return { content: [{ type: "text" as const, text: JSON.stringify({ typed: text, characters: text.length, _browserToken: token }, null, 2) }] };
  } catch (err) {
      return interactionError("type_text", err, token);
    }
  });

  // ── press_key ──
  server.registerTool("press_key", {
    title: "Press Key",
    description: "Press a keyboard key (Enter, Tab, Escape, ArrowDown, Backspace, etc). Supports modifier combos: 'Control+a', 'Shift+Enter', 'Meta+c'. Full list: https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_key_values. Enter or Space on a focused red-zone control (delete account, pay, checkout), or Enter in a field whose form submits one, is refused unless force is true - the same gate as click.",
    inputSchema: {
      key: z.string().describe("Key to press (e.g., 'Enter', 'Tab', 'Escape', 'ArrowDown', 'Control+a', 'Meta+c')"),
      force: z.boolean().optional().describe("Press even when Enter/Space would activate a red-zone control"),
      _browserToken: z.string().optional().describe("Browser session token"),
    },
    annotations: { title: "Press Key", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ key, force, _browserToken }) => {
    let b, token;
    try {
    if (getBrowserByToken) { const r = await getBrowserByToken(_browserToken); b = r.browser; token = r.token; }
    else { b = await getBrowser(); }
    const page = await b.getPage();
    // Enter on a focused control is a click; gate it the way click() is gated.
    const activation = await b.classifyKeyActivation(key);
    if (activation?.zone === "red" && !force) {
      return { content: [{ type: "text" as const, text: JSON.stringify({
        success: false,
        pressed: null,
        zone: "red",
        target: { tag: activation.tag, label: activation.label },
        message: `Red zone action requires force: ${key} would activate <${activation.tag}> "${activation.label}"`,
        _browserToken: token,
      }, null, 2) }] };
    }
    await page.keyboard.press(key);
    return { content: [{ type: "text" as const, text: JSON.stringify({ pressed: key, _browserToken: token }, null, 2) }] };
  } catch (err) {
      return interactionError("press_key", err, token);
    }
  });

  // ── handle_dialog ──
  server.registerTool("handle_dialog", {
    title: "Handle JavaScript Dialog",
    description: "ARM a handler for the next JavaScript dialog (alert, confirm, prompt), then trigger the dialog with a separate call. Returns immediately once armed — the handler persists until a dialog fires, so it does NOT need to observe one to have worked. For prompts, provide the text to enter.",
    inputSchema: {
      action: z.enum(["accept", "dismiss"]).describe("Accept or dismiss the dialog"),
      promptText: z.string().optional().describe("Text to enter for prompt() dialogs"),
      _browserToken: z.string().optional().describe("Browser session token"),
    },
    annotations: { title: "Handle Dialog", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ action, promptText, _browserToken }) => {
    let b, token;
    if (getBrowserByToken) { const r = await getBrowserByToken(_browserToken); b = r.browser; token = r.token; }
    else { b = await getBrowser(); }
    const page = await b.getPage();

    // Set up a one-time dialog handler
    const dialogPromise = new Promise<{ type: string; message: string }>((resolve) => {
      page.once("dialog", async (dialog) => {
        const info = { type: dialog.type(), message: dialog.message() };
        if (action === "accept") {
          await dialog.accept(promptText);
        } else {
          await dialog.dismiss();
        }
        resolve(info);
      });
    });

    // This tool ARMS a handler; it does not observe one.
    //
    // It used to race the handler against a 5-second timeout and, when the
    // timeout won, return `handled: false` with "No dialog appeared within 5
    // seconds" — while the handler it had just registered was still armed and
    // went on to handle the next dialog. So the tool reported failure for the
    // one thing it actually did, blocked five seconds to do it, and its own
    // advice ("call BEFORE the triggering action") was impossible to satisfy
    // AND observe in the same call, because with serial MCP calls the dialog
    // cannot fire while this one is waiting.
    //
    // A short grace race still catches a dialog that is ALREADY pending, which
    // is the only case the old wait could legitimately have caught. Otherwise it
    // returns at once and says what is true: armed, waiting. (2026-07-29)
    const grace = new Promise<null>((resolve) => setTimeout(() => resolve(null), 300));
    const alreadyPending = await Promise.race([dialogPromise, grace]);

    if (alreadyPending) {
      return { content: [{ type: "text" as const, text: JSON.stringify({
        armed: true,
        handledImmediately: true,
        dialogType: alreadyPending.type,
        message: alreadyPending.message,
        action,
        _browserToken: token,
      }, null, 2) }] };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify({
      armed: true,
      handledImmediately: false,
      action,
      note: `Handler is registered and will ${action} the next dialog on this page. Trigger it with your next call (e.g. click, or evaluate_script running confirm()). No dialog was already pending, which is expected.`,
      _browserToken: token,
    }, null, 2) }] };
  });

  // ── upload_file ──
  server.registerTool("upload_file", {
    title: "Upload File",
    description: "Upload file(s) to a file input element. Works with <input type='file'> elements.",
    inputSchema: {
      selector: z.string().describe("CSS selector for the file input element"),
      filePaths: z.array(z.string()).describe("Array of absolute file paths to upload"),
      _browserToken: z.string().optional().describe("Browser session token"),
    },
    annotations: { title: "Upload File", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ selector, filePaths, _browserToken }) => {
    let b, token;
    try {
    if (getBrowserByToken) { const r = await getBrowserByToken(_browserToken); b = r.browser; token = r.token; }
    else { b = await getBrowser(); }
    const page = await b.getPage();
    await page.locator(selector).setInputFiles(filePaths);
    return { content: [{ type: "text" as const, text: JSON.stringify({ uploaded: filePaths, selector, _browserToken: token }, null, 2) }] };
  } catch (err) {
      return interactionError("upload_file", err, token);
    }
  });

  // ── drag ──
  server.registerTool("drag", {
    title: "Drag and Drop",
    description: "Drag an element to a target location. Simulates mouse press, move, and release.",
    inputSchema: {
      source: z.string().describe("CSS selector for the element to drag"),
      target: z.string().describe("CSS selector for the drop target"),
      _browserToken: z.string().optional().describe("Browser session token"),
    },
    annotations: { title: "Drag and Drop", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ source, target, _browserToken }) => {
    let b, token;
    try {
    if (getBrowserByToken) { const r = await getBrowserByToken(_browserToken); b = r.browser; token = r.token; }
    else { b = await getBrowser(); }
    const page = await b.getPage();
    await page.dragAndDrop(source, target);
    return { content: [{ type: "text" as const, text: JSON.stringify({ dragged: source, droppedOn: target, _browserToken: token }, null, 2) }] };
  } catch (err) {
      return interactionError("drag", err, token);
    }
  });
}
