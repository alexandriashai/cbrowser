/**
 * empathy_audit's `uiResource` parameter must describe what it actually does.
 *
 * The view is declared on the TOOL (`_meta.ui.resourceUri =
 * "ui://cbrowser/empathy"`), so a host that supports MCP Apps fetches and
 * renders it on every call; the server cannot opt one call out. Since the
 * inline attachments were retired the handler destructures `uiResource` and
 * never reads it. The schema still told callers "Set false for scripted callers
 * that diff whole responses" -- an instruction that changes nothing, which is
 * worse than no instruction because a caller relying on it is silently wrong.
 *
 * Description only: behaviour is unchanged and pinned below so it stays that way.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { registerEmpathyAuditTool } from "../src/mcp-tools/base/audit-tools.js";

type Cfg = { _meta?: { ui?: { resourceUri?: string } }; inputSchema: Record<string, { description?: string }> };

function captureConfig(): Cfg {
  let cfg: Cfg | undefined;
  registerEmpathyAuditTool({
    registerTool: (name: string, c: Cfg) => { if (name === "empathy_audit") cfg = c; },
    tool: () => {}, registerResource: () => {}, resource: () => {},
  } as never);
  if (!cfg) throw new Error("empathy_audit was not registered");
  return cfg;
}

describe("empathy_audit uiResource", () => {
  test("the view is declared per tool (the reason the flag cannot work)", () => {
    expect(captureConfig()._meta?.ui?.resourceUri).toBe("ui://cbrowser/empathy");
  });

  test("the description no longer promises an opt-out", () => {
    const d = captureConfig().inputSchema.uiResource.description ?? "";
    expect(d).not.toMatch(/Set false/i);
    expect(d).not.toMatch(/alongside the JSON/i);
  });

  test("the description says it has no effect and hosts render the view regardless", () => {
    const d = captureConfig().inputSchema.uiResource.description ?? "";
    expect(d).toMatch(/no effect/i);
    expect(d).toMatch(/MCP Apps/);
    expect(d).toMatch(/regardless/i);
  });
});
