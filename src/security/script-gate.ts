/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Red-zone gate for caller-supplied page script.
 *
 * Since 19.1.8 every path that activates an element on a caller's behalf
 * (click, smart_click, hover-click, press_key, type_text, keyboard, drag) is
 * judged by the element it would activate, so "Delete account" is refused
 * however it is addressed. A script is not an element: one line of
 * `document.querySelector('#delete-account').click()` activates any control,
 * submits any form and calls any endpoint the page can, and nothing in the
 * string says which. Measured on 19.2.0: click("Delete account") was refused
 * as red, then evaluate_script running exactly that line fired the handler,
 * and the response carried no zone.
 *
 * So running caller-supplied script is red by itself, decided by the
 * principal: refused without force, before anything runs, on every surface
 * that takes a script (MCP evaluate_script, CLI evaluate/eval, the daemon's
 * evaluate). With force it runs and reports zone "red". The library's own
 * page.evaluate calls are not gated: they are fixed code, not caller input.
 */

/**
 * How an MCP caller gets past a red refusal. The shared refusal text says
 * "--force" (the CLI flag), which an MCP client cannot pass; its parameter is
 * `force: true`. Attached to every MCP red refusal so the response names the
 * spelling the caller can actually use. (Alexa, 2026-10-09)
 */
export const RED_ZONE_MCP_HINT = "Re-run with force: true (the MCP tool parameter; --force is the CLI flag).";

/** Why evaluate_script is red, stated in every refusal. */
export const EVALUATE_SCRIPT_RED_REASON =
  "arbitrary page script can activate any control (click, submit, delete) without passing the element-level red-zone gate";

/**
 * The refusal for running caller-supplied script, or null when `force` is
 * exactly true. Anything other than `true` (undefined, "true", 1) refuses: a
 * gate that a truthy string opens is a gate a typo opens.
 */
export function evaluateScriptRefusal(force: unknown): string | null {
  if (force === true) return null;
  return `Red zone action requires --force: evaluate_script - ${EVALUATE_SCRIPT_RED_REASON}`;
}
