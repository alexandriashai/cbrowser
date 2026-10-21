/**
 * CBrowser MCP Tools - the one red-zone refusal shape
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { RED_ZONE_MCP_HINT } from "../security/script-gate.js";

/**
 * The response every MCP tool returns when the red-zone gate refuses a call.
 *
 * Until 2026-10-21 refusals came back five ways: evaluate_script set isError
 * and howToRun; click and smart_click set neither isError nor a consistent
 * message; type_text and drag said "--force" (the CLI flag) with no howToRun;
 * press_key said "force:". isError matters beyond the client: the hosted
 * refund (tier-gate.ts) keys on it, so a refused click was billed and never
 * refunded although nothing ran. (audit M15)
 *
 * The gate's own message is kept verbatim, so the CLI and MCP name the same
 * reason, and the MCP spelling is appended once.
 *
 * @param tool    the MCP tool name
 * @param message the gate's refusal text ("Red zone action requires --force: ...")
 * @param extra   tool-specific fields (target, typed: null, ...)
 */
export function redZoneRefusal(
  tool: string,
  message: string,
  extra: Record<string, unknown> = {},
  token?: string,
): { isError: true; content: Array<{ type: "text"; text: string }> } {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(redZoneRefusalBody(tool, message, extra, token), null, 2) }],
  };
}

/** The JSON body of a refusal, for tools that build their own content (screenshots). */
export function redZoneRefusalBody(
  tool: string,
  message: string,
  extra: Record<string, unknown> = {},
  token?: string,
): Record<string, unknown> {
  return {
    success: false,
    tool,
    zone: "red",
    ...extra,
    message: message.includes(RED_ZONE_MCP_HINT) ? message : `${message}. ${RED_ZONE_MCP_HINT}`,
    howToRun: RED_ZONE_MCP_HINT,
    ...(token ? { _browserToken: token } : {}),
  };
}
