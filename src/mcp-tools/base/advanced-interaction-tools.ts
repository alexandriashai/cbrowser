/**
 * CBrowser MCP Tools - Advanced Interaction Tools
 *
 * hover, type_text, press_key, handle_dialog, upload_file, drag
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { Dialog, Page } from "playwright";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import { summarizePlaywrightError } from "../../browser.js";
import { confineToAccountDir } from "../hosted-inputs.js";
import { redZoneRefusal } from "../red-zone-refusal.js";

type DialogAction = "accept" | "dismiss";

/**
 * handle_dialog's armed handler, at most one per page (v8 B27, 2026-10-10).
 *
 * Every call used to add its own page.once("dialog") and leave the earlier
 * ones armed. Measured: three calls, then one confirm(), ran all three; the
 * FIRST call's action was applied and the other two threw "Cannot accept
 * dialog which is already handled!" from an async event listener, where
 * nothing catches it. Both hosted servers run under Node, so that unhandled
 * rejection ended the process, and every account's calls and browser sessions
 * with it. Now the latest call replaces the page's arm, and the handler never
 * throws. Keyed weakly by page, so a closed page releases its arm without a
 * close listener of its own.
 */
const dialogArms = new WeakMap<Page, { listener: (dialog: Dialog) => Promise<void>; action: DialogAction }>();

/**
 * A dialog an arm failed to handle after its call had returned, so no
 * response could carry the error. The page's next handle_dialog call reports
 * it once, as previousDialogFailed.
 */
const dialogFailures = new WeakMap<Page, { dialogType: string; message: string; action: DialogAction; error: string }>();

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
    if (refusal) return redZoneRefusal("type_text", refusal, { typed: null }, token);
    // `??`, not `||`: delay 0 means no delay, and `|| 50` made it 50. (audit M13)
    await page.keyboard.type(text, { delay: delay ?? 50 });
    return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, typed: text, characters: text.length, _browserToken: token }, null, 2) }] };
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
    // Through keystrokeRedZone, the gate type_text, the CLI and the daemon use:
    // calling classifyKeyActivation directly skipped the audit entry that gate
    // writes for every blocked keystroke. (audit M14, 2026-10-21)
    const refusal = await b.keystrokeRedZone({ key }, force);
    if (refusal) {
      const activation = await b.classifyKeyActivation(key);
      return redZoneRefusal("press_key", refusal, {
        pressed: null,
        ...(activation ? { target: { tag: activation.tag, label: activation.label } } : {}),
      }, token);
    }
    await page.keyboard.press(key);
    return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, pressed: key, _browserToken: token }, null, 2) }] };
  } catch (err) {
      return interactionError("press_key", err, token);
    }
  });

  // ── handle_dialog ──
  server.registerTool("handle_dialog", {
    title: "Handle JavaScript Dialog",
    description: "ARM a handler for the next JavaScript dialog (alert, confirm, prompt), then trigger the dialog with a separate call. Returns immediately once armed — the handler persists until a dialog fires, so it does NOT need to observe one to have worked. Calling it again before a dialog fires replaces the earlier arm: the latest call wins. For prompts, provide the text to enter.",
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
    const page: Page = await b.getPage();

    // The latest call wins: take down this page's earlier arm, if one is still
    // waiting, before arming (see dialogArms).
    const previous = dialogArms.get(page);
    if (previous) page.off("dialog", previous.listener);
    const previousFailure = dialogFailures.get(page);
    dialogFailures.delete(page);

    // Set up a one-time dialog handler
    const dialogPromise = new Promise<{ type: string; message: string; error?: string }>((resolve) => {
      const listener = async (dialog: Dialog): Promise<void> => {
        if (dialogArms.get(page)?.listener === listener) dialogArms.delete(page);
        const info = { type: "", message: "" };
        try {
          info.type = dialog.type();
          info.message = dialog.message();
          if (action === "accept") {
            await dialog.accept(promptText);
          } else {
            await dialog.dismiss();
          }
          resolve(info);
        } catch (err) {
          // Never rethrown: a listener's rejection is unhandled, and fatal
          // under Node. Kept for whichever response can still report it.
          const error = err instanceof Error ? err.message : String(err);
          dialogFailures.set(page, { dialogType: info.type, message: info.message, action, error });
          resolve({ ...info, error });
        }
      };
      dialogArms.set(page, { listener, action });
      page.once("dialog", listener);
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

    // Present only when they apply, so the response keeps its shape otherwise.
    const history = {
      ...(previous ? { replacedArm: previous.action } : {}),
      ...(previousFailure ? { previousDialogFailed: previousFailure } : {}),
    };

    if (alreadyPending) {
      // This response reports the failure, so the next call need not.
      if (alreadyPending.error) dialogFailures.delete(page);
      return { ...(alreadyPending.error ? { isError: true as const } : {}), content: [{ type: "text" as const, text: JSON.stringify({
        armed: true,
        handledImmediately: true,
        dialogType: alreadyPending.type,
        message: alreadyPending.message,
        action,
        ...(alreadyPending.error ? { error: alreadyPending.error } : {}),
        ...history,
        _browserToken: token,
      }, null, 2) }] };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify({
      armed: true,
      handledImmediately: false,
      action,
      ...history,
      note: `Handler is registered and will ${action} the next dialog on this page. Trigger it with your next call (e.g. click, or evaluate_script with force: true running confirm()). No dialog was already pending, which is expected.${previous ? ` It replaces the earlier arm (${previous.action}).` : ""}`,
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
  }, async ({ selector, filePaths: requestedPaths, _browserToken }) => {
    // Hosted: setInputFiles read whatever the root-run server could read and
    // sent it to the page, i.e. to any site the caller navigated to. Useless
    // without paths, so confined to the caller's own account directory rather
    // than refused (sec-paths, 2026-10-10).
    const confined = confineToAccountDir("upload_file", "filePaths", requestedPaths,
      "To upload your own file, run upload_file on your own machine (npx cbrowser mcp-server).");
    if (!confined.ok) return confined.result;
    const filePaths = confined.paths;
    let b, token;
    try {
    if (getBrowserByToken) { const r = await getBrowserByToken(_browserToken); b = r.browser; token = r.token; }
    else { b = await getBrowser(); }
    const page = await b.getPage();
    await page.locator(selector).setInputFiles(filePaths);
    return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, uploaded: filePaths, selector, _browserToken: token }, null, 2) }] };
  } catch (err) {
      return interactionError("upload_file", err, token);
    }
  });

  // ── drag ──
  server.registerTool("drag", {
    title: "Drag and Drop",
    description: "Drag an element to a target location. Simulates mouse press, move, and release. A drag whose press and release land inside the same red-zone control clicks it, and is refused unless force is true.",
    inputSchema: {
      source: z.string().describe("CSS selector for the element to drag"),
      target: z.string().describe("CSS selector for the drop target"),
      force: z.boolean().optional().describe("Drag even when the drag would click a red-zone control"),
      _browserToken: z.string().optional().describe("Browser session token"),
    },
    annotations: { title: "Drag and Drop", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ source, target, force, _browserToken }) => {
    let b, token;
    try {
    if (getBrowserByToken) { const r = await getBrowserByToken(_browserToken); b = r.browser; token = r.token; }
    else { b = await getBrowser(); }
    const page = await b.getPage();
    const refusal = await b.dragRedZone(source, target, force);
    if (refusal) return redZoneRefusal("drag", refusal, { dragged: null }, token);
    await page.dragAndDrop(source, target);
    return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, dragged: source, droppedOn: target, _browserToken: token }, null, 2) }] };
  } catch (err) {
      return interactionError("drag", err, token);
    }
  });
}
